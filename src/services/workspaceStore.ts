import {
  collection,
  deleteDoc,
  doc,
  getDoc,
  getDocs,
  onSnapshot,
  query,
  setDoc,
  where,
  writeBatch,
  type Unsubscribe,
} from 'firebase/firestore';
import type { User } from 'firebase/auth';
import { db, handleFirestoreError, OperationType } from '../firebase';
import type {
  AppSettings,
  CustomerProfile,
  DomainSupplier,
  FiscalDocument,
  OperatingExpense,
  OrderLine,
  SalesCampaign,
  StockAdjustment,
  SupplierLot,
  SupplierPurchaseOrder,
  WineCatalogItem,
  WorkspaceInvite,
  WorkspaceMember,
} from '../types/wine';
import type {
  AssistantContent,
  AssistantThread,
  ChatMessage,
} from '../modules/assistant/types';
import { DEFAULT_SETTINGS } from '../data/seedData';

export const WORKSPACE_ID = 'lbg-main';
export const BOOTSTRAPPED_ADMIN_EMAIL = 'locollinet@gmail.com';

export function nowIso(): string {
  return new Date().toISOString();
}

export function sanitizeId(raw: string, fallbackPrefix = 'doc'): string {
  const cleaned = raw
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-zA-Z0-9_-]/g, '_')
    .replace(/_+/g, '_')
    .replace(/^_+|_+$/g, '')
    .slice(0, 120);
  if (!cleaned) {
    return `${fallbackPrefix}_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
  }
  return cleaned;
}

function stripUndefined<T extends Record<string, unknown>>(obj: T): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(obj)) {
    if (v === undefined) continue;
    if (Array.isArray(v)) {
      out[k] = v.map((item) =>
        item && typeof item === 'object' && !Array.isArray(item)
          ? stripUndefined(item as Record<string, unknown>)
          : item
      );
    } else if (v !== null && typeof v === 'object') {
      out[k] = stripUndefined(v as Record<string, unknown>);
    } else {
      out[k] = v;
    }
  }
  return out;
}

function wsDoc(subcollection: string, docId: string) {
  return doc(db, 'workspaces', WORKSPACE_ID, subcollection, docId);
}

function wsCol(subcollection: string) {
  return collection(db, 'workspaces', WORKSPACE_ID, subcollection);
}

export type WorkspaceAccessResult =
  | {
      status: 'authorized';
      member: WorkspaceMember;
      isNewWorkspace: boolean;
    }
  | {
      status: 'unauthorized';
      email: string;
    };

/**
 * Vérifie ou initialise l'accès d'un utilisateur Google au workspace partagé lbg-main.
 */
export async function ensureWorkspaceAccess(
  user: User
): Promise<WorkspaceAccessResult> {
  const emailLower = (user.email ?? '').trim().toLowerCase();
  const displayName = (user.displayName ?? emailLower.split('@')[0] ?? 'Membre').slice(0, 120);
  const memberRef = wsDoc('members', user.uid);

  // 1. Déjà membre ?
  try {
    const existingMember = await getDoc(memberRef);
    if (existingMember.exists()) {
      const data = existingMember.data() as WorkspaceMember;
      return {
        status: 'authorized',
        member: {
          uid: data.uid,
          email: data.email,
          displayName: data.displayName,
          role: data.role,
          createdAt: data.createdAt,
          updatedAt: data.updatedAt,
        },
        isNewWorkspace: false,
      };
    }
  } catch (err) {
    handleFirestoreError(err, OperationType.GET, `workspaces/${WORKSPACE_ID}/members/${user.uid}`);
  }

  // 2. Admin initial (bootstrapped) ?
  if (emailLower === BOOTSTRAPPED_ADMIN_EMAIL) {
    const ts = nowIso();
    let isNewWorkspace = false;

    try {
      const wsRef = doc(db, 'workspaces', WORKSPACE_ID);
      const wsSnap = await getDoc(wsRef);
      if (!wsSnap.exists()) {
        isNewWorkspace = true;
        await setDoc(wsRef, {
          name: "Le Bon Grain d'Ivresse",
          ownerUid: user.uid,
          ownerEmail: emailLower,
          createdAt: ts,
          updatedAt: ts,
        });
      }
    } catch (err) {
      handleFirestoreError(err, OperationType.WRITE, `workspaces/${WORKSPACE_ID}`);
    }

    const adminMember: WorkspaceMember = {
      uid: user.uid,
      email: emailLower,
      displayName,
      role: 'admin',
      createdAt: ts,
      updatedAt: ts,
    };

    try {
      await setDoc(memberRef, {
        ...adminMember,
        workspaceId: WORKSPACE_ID,
      });
    } catch (err) {
      handleFirestoreError(err, OperationType.CREATE, `workspaces/${WORKSPACE_ID}/members/${user.uid}`);
    }

    try {
      const settingsRef = wsDoc('settings', 'main');
      const settingsSnap = await getDoc(settingsRef);
      if (!settingsSnap.exists()) {
        await setDoc(
          settingsRef,
          stripUndefined({
            ...DEFAULT_SETTINGS,
            workspaceId: WORKSPACE_ID,
            updatedAt: ts,
          })
        );
      }
    } catch (err) {
      handleFirestoreError(err, OperationType.WRITE, `workspaces/${WORKSPACE_ID}/settings/main`);
    }

    return {
      status: 'authorized',
      member: adminMember,
      isNewWorkspace,
    };
  }

  // 3. Collaborateur invité ?
  if (emailLower) {
    const inviteRef = wsDoc('invites', emailLower);
    try {
      const inviteSnap = await getDoc(inviteRef);
      if (inviteSnap.exists()) {
        const invite = inviteSnap.data() as WorkspaceInvite;
        const ts = nowIso();
        const newMember: WorkspaceMember = {
          uid: user.uid,
          email: emailLower,
          displayName,
          role: invite.role === 'admin' ? 'admin' : 'operator',
          createdAt: ts,
          updatedAt: ts,
        };
        await setDoc(memberRef, {
          ...newMember,
          workspaceId: WORKSPACE_ID,
        });
        await deleteDoc(inviteRef);
        return {
          status: 'authorized',
          member: newMember,
          isNewWorkspace: false,
        };
      }
    } catch (err) {
      // Si la lecture de l'invitation échoue pour permission-denied, c'est non autorisé
      console.warn('Vérification invitation:', err);
    }
  }

  return {
    status: 'unauthorized',
    email: emailLower || '(email inconnu)',
  };
}

export interface WorkspaceCallbacks {
  onSettings: (settings: AppSettings) => void;
  onMembers: (members: WorkspaceMember[]) => void;
  onInvites: (invites: WorkspaceInvite[]) => void;
  onDomains: (domains: DomainSupplier[]) => void;
  onCatalog: (catalog: WineCatalogItem[]) => void;
  onLots: (lots: SupplierLot[]) => void;
  onStockAdjustments: (adjustments: StockAdjustment[]) => void;
  onCustomers: (customers: CustomerProfile[]) => void;
  onOrders: (orders: OrderLine[]) => void;
  onInvoices: (invoices: FiscalDocument[]) => void;
  onPurchaseOrders: (purchaseOrders: SupplierPurchaseOrder[]) => void;
  onCampaigns: (campaigns: SalesCampaign[]) => void;
  onExpenses: (expenses: OperatingExpense[]) => void;
  onInitialLoadDone: () => void;
  onError: (err: Error) => void;
}

export function subscribeWorkspaceData(
  isAdmin: boolean,
  callbacks: WorkspaceCallbacks
): Unsubscribe {
  const unsubs: Unsubscribe[] = [];
  const pending = new Set([
    'settings',
    'members',
    'domains',
    'catalog',
    'lots',
    'stockAdjustments',
    'customers',
    'orders',
    'invoices',
    'purchaseOrders',
    'campaigns',
    'expenses',
  ]);
  if (isAdmin) pending.add('invites');

  let finished = false;
  const markLoaded = (key: string) => {
    pending.delete(key);
    if (!finished && pending.size === 0) {
      finished = true;
      callbacks.onInitialLoadDone();
    }
  };

  const reportError = (err: unknown, op: OperationType, path: string) => {
    try {
      handleFirestoreError(err, op, path);
    } catch (wrapped) {
      callbacks.onError(wrapped instanceof Error ? wrapped : new Error(String(wrapped)));
    }
  };

  // Settings doc
  unsubs.push(
    onSnapshot(
      wsDoc('settings', 'main'),
      (snap) => {
        if (snap.exists()) {
          const data = snap.data() as Record<string, unknown>;
          const { workspaceId: _ws, ...rest } = data;
          void _ws;
          callbacks.onSettings({
            ...DEFAULT_SETTINGS,
            ...(rest as Partial<AppSettings>),
          });
        } else {
          callbacks.onSettings(DEFAULT_SETTINGS);
        }
        markLoaded('settings');
      },
      (err) => reportError(err, OperationType.GET, `workspaces/${WORKSPACE_ID}/settings/main`)
    )
  );

  function subList<T>(
    colName: string,
    onData: (items: T[]) => void
  ) {
    const q = query(wsCol(colName), where('workspaceId', '==', WORKSPACE_ID));
    unsubs.push(
      onSnapshot(
        q,
        (snap) => {
          const items = snap.docs.map((d) => {
            const raw = d.data() as Record<string, unknown>;
            const { workspaceId: _ws, ...rest } = raw;
            void _ws;
            return rest as T;
          });
          onData(items);
          markLoaded(colName);
        },
        (err) => reportError(err, OperationType.LIST, `workspaces/${WORKSPACE_ID}/${colName}`)
      )
    );
  }

  subList<WorkspaceMember>('members', callbacks.onMembers);
  if (isAdmin) {
    subList<WorkspaceInvite>('invites', callbacks.onInvites);
  } else {
    callbacks.onInvites([]);
  }
  subList<DomainSupplier>('domains', callbacks.onDomains);
  subList<WineCatalogItem>('catalog', callbacks.onCatalog);
  subList<SupplierLot>('lots', callbacks.onLots);
  subList<StockAdjustment>('stockAdjustments', callbacks.onStockAdjustments);
  subList<CustomerProfile>('customers', callbacks.onCustomers);
  subList<OrderLine>('orders', callbacks.onOrders);
  subList<FiscalDocument>('invoices', callbacks.onInvoices);
  subList<SupplierPurchaseOrder>('purchaseOrders', callbacks.onPurchaseOrders);
  subList<SalesCampaign>('campaigns', callbacks.onCampaigns);
  subList<OperatingExpense>('expenses', callbacks.onExpenses);

  return () => {
    for (const u of unsubs) u();
  };
}

// --- Serializers strictly matching firestore.rules hasOnly ---

function serializeSettings(settings: AppSettings) {
  return stripUndefined({
    workspaceId: WORKSPACE_ID,
    tvaRate: Number(settings.tvaRate ?? 0.2),
    fraisLogistiqueAmont: Number(settings.fraisLogistiqueAmont ?? 1),
    fraisLogistiqueAval: Number(settings.fraisLogistiqueAval ?? 3.5),
    fraisLogistiqueParBouteille: Number(
      settings.fraisLogistiqueParBouteille ??
        (settings.fraisLogistiqueAmont ?? 1) + (settings.fraisLogistiqueAval ?? 3.5)
    ),
    tauxMarqueCibleExw: Number(settings.tauxMarqueCibleExw ?? 0.1),
    anonymizeClients: Boolean(settings.anonymizeClients),
    showcaseTitle: settings.showcaseTitle?.slice(0, 160),
    showcaseSubtitle: settings.showcaseSubtitle?.slice(0, 300),
    showcaseShowStock: settings.showcaseShowStock,
    showcaseShowBenchmark: settings.showcaseShowBenchmark,
    showcaseDisplayMode: settings.showcaseDisplayMode ?? 'ttc',
    companyName: settings.companyName?.slice(0, 160),
    companyLegalForm: settings.companyLegalForm?.slice(0, 120),
    companyCapital: settings.companyCapital?.slice(0, 80),
    companyAddress: settings.companyAddress?.slice(0, 300),
    companySiret: settings.companySiret?.slice(0, 60),
    companyRcs: settings.companyRcs?.slice(0, 120),
    companyVatNumber: settings.companyVatNumber?.slice(0, 60),
    companyIban: settings.companyIban?.slice(0, 80),
    companyBic: settings.companyBic?.slice(0, 40),
    companyEmail: settings.companyEmail?.slice(0, 160),
    companyPhone: settings.companyPhone?.slice(0, 60),
    companyWebsite: settings.companyWebsite?.slice(0, 160),
    companyLegalLine: settings.companyLegalLine?.slice(0, 500),
    nextInvoiceSeq: settings.nextInvoiceSeq,
    nextCreditNoteSeq: settings.nextCreditNoteSeq,
    nextPoSeq: settings.nextPoSeq,
    updatedAt: nowIso(),
  });
}

function serializeDomain(d: DomainSupplier) {
  const id = sanitizeId(d.id, 'dom');
  return {
    id,
    payload: stripUndefined({
      id,
      workspaceId: WORKSPACE_ID,
      nom: d.nom.trim().slice(0, 160) || 'Domaine',
      region: (d.region || '').slice(0, 120),
      contactName: d.contactName?.slice(0, 120),
      email: d.email?.slice(0, 200),
      phone: d.phone?.slice(0, 60),
      address: d.address?.slice(0, 300),
      iban: d.iban?.slice(0, 80),
      francoPortHT: d.francoPortHT !== undefined && Number.isFinite(d.francoPortHT) ? d.francoPortHT : undefined,
      delaiPaiement: d.delaiPaiement?.slice(0, 120),
      notesAllocation: d.notesAllocation?.slice(0, 1000),
      updatedAt: nowIso(),
    }),
  };
}

function serializeCatalogItem(item: WineCatalogItem) {
  const id = sanitizeId(item.id, 'cat');
  return {
    id,
    payload: stripUndefined({
      id,
      workspaceId: WORKSPACE_ID,
      vente: (item.vente || '').slice(0, 160),
      dateVente: item.dateVente?.slice(0, 40),
      canal: item.canal?.slice(0, 30),
      domaine: item.domaine.trim().slice(0, 160) || 'Domaine',
      domaineId: item.domaineId ? sanitizeId(item.domaineId, 'dom') : undefined,
      fournisseur: item.fournisseur?.slice(0, 160),
      cuvee: item.cuvee.trim().slice(0, 200) || 'Cuvée',
      millesime: item.millesime?.slice(0, 20),
      appellation: item.appellation?.slice(0, 160),
      format: item.format?.slice(0, 40),
      certification: item.certification?.slice(0, 40),
      apogee: item.apogee?.slice(0, 60),
      reference: (item.reference || `${item.domaine} - ${item.cuvee}`).slice(0, 260),
      region: (item.region || '').slice(0, 120),
      color: (item.color || 'Blanc').slice(0, 40),
      tarifAchatHT: Math.max(0, Number(item.tarifAchatHT) || 0),
      prixLbgTTC: Math.max(0, Number(item.prixLbgTTC) || 0),
      benchTTC: item.benchTTC !== undefined && item.benchTTC !== null && Number.isFinite(item.benchTTC) ? item.benchTTC : null,
      benchSource: (item.benchSource || '').slice(0, 120),
      fraisLogistiqueOverride:
        item.fraisLogistiqueOverride !== undefined && Number.isFinite(item.fraisLogistiqueOverride)
          ? item.fraisLogistiqueOverride
          : undefined,
      dispoPublic: Boolean(item.dispoPublic),
      tastingNotes: item.tastingNotes?.slice(0, 600),
      notes: item.notes?.slice(0, 600),
      updatedAt: nowIso(),
    }),
  };
}

function serializeLot(lot: SupplierLot) {
  const id = sanitizeId(lot.id, 'lot');
  return {
    id,
    payload: stripUndefined({
      id,
      workspaceId: WORKSPACE_ID,
      catalogId: sanitizeId(lot.catalogId, 'cat'),
      domaineId: lot.domaineId ? sanitizeId(lot.domaineId, 'dom') : undefined,
      purchaseOrderId: lot.purchaseOrderId ? sanitizeId(lot.purchaseOrderId, 'po') : undefined,
      dateAchat: (lot.dateAchat || new Date().toISOString().slice(0, 10)).slice(0, 40),
      typeAchat: lot.typeAchat,
      qteCommandee: Math.max(0, Number(lot.qteCommandee) || 0),
      qteRecue: Math.max(0, Number(lot.qteRecue) || 0),
      coutUnitaireHT: Math.max(0, Number(lot.coutUnitaireHT) || 0),
      tvaRatePct: lot.tvaRatePct !== undefined && Number.isFinite(lot.tvaRatePct) ? lot.tvaRatePct : undefined,
      shippingHT: lot.shippingHT !== undefined && Number.isFinite(lot.shippingHT) ? lot.shippingHT : undefined,
      statutLot: lot.statutLot,
      referenceFacture: (lot.referenceFacture || 'SANS-REF').slice(0, 120),
      paymentStatus: lot.paymentStatus?.slice(0, 30),
      paymentDueDate: lot.paymentDueDate?.slice(0, 40),
      paidAt: lot.paidAt?.slice(0, 40),
      origin: lot.origin?.slice(0, 40),
      notes: lot.notes?.slice(0, 600),
      updatedAt: nowIso(),
    }),
  };
}

function serializeStockAdjustment(adj: StockAdjustment) {
  const id = sanitizeId(adj.id, 'adj');
  return {
    id,
    payload: stripUndefined({
      id,
      workspaceId: WORKSPACE_ID,
      catalogId: sanitizeId(adj.catalogId, 'cat'),
      date: adj.date.slice(0, 40),
      reason: adj.reason,
      qtyDelta: Number(adj.qtyDelta) || 0,
      unitCostHT: Math.max(0, Number(adj.unitCostHT) || 0),
      notes: adj.notes?.slice(0, 400),
      createdByUid: adj.createdByUid.slice(0, 128),
      createdAt: (adj.createdAt || nowIso()).slice(0, 40),
    }),
  };
}

function serializeCustomer(c: CustomerProfile) {
  const id = sanitizeId(c.id, 'cust');
  return {
    id,
    payload: stripUndefined({
      id,
      workspaceId: WORKSPACE_ID,
      customerType: c.customerType || 'particulier',
      nom: (c.nom || '').slice(0, 120),
      prenom: (c.prenom || '').slice(0, 120),
      companyName: c.companyName?.slice(0, 160),
      siret: c.siret?.slice(0, 40),
      vatNumber: c.vatNumber?.slice(0, 40),
      email: (c.email || '').slice(0, 200),
      phone: c.phone?.slice(0, 60),
      billingAddress: c.billingAddress?.slice(0, 300),
      shippingAddress: c.shippingAddress?.slice(0, 300),
      notes: c.notes?.slice(0, 800),
      mergedEmails: c.mergedEmails ? c.mergedEmails.slice(0, 20) : undefined,
      updatedAt: nowIso(),
    }),
  };
}

function serializeOrder(order: OrderLine) {
  const id = sanitizeId(order.id, 'ord');
  return {
    id,
    payload: stripUndefined({
      id,
      workspaceId: WORKSPACE_ID,
      date: (order.date || new Date().toISOString().slice(0, 10)).slice(0, 40),
      refCommande: (order.refCommande || id).slice(0, 120),
      invoiceId: order.invoiceId ? sanitizeId(order.invoiceId, 'inv') : undefined,
      invoiceNumber: order.invoiceNumber?.slice(0, 80),
      creditNoteId: order.creditNoteId ? sanitizeId(order.creditNoteId, 'av') : undefined,
      creditNoteNumber: order.creditNoteNumber?.slice(0, 80),
      vente: (order.vente || '').slice(0, 160),
      customerId: order.customerId ? sanitizeId(order.customerId, 'cust') : undefined,
      nomClient: (order.nomClient || '').slice(0, 120),
      prenomClient: (order.prenomClient || '').slice(0, 120),
      emailClient: (order.emailClient || '').slice(0, 200),
      catalogId: sanitizeId(order.catalogId, 'cat'),
      produitLabel: (order.produitLabel || '').slice(0, 220),
      prixUnitaireTTC: Math.max(0, Number(order.prixUnitaireTTC) || 0),
      coutAchatUnitaireHT:
        order.coutAchatUnitaireHT !== undefined && Number.isFinite(order.coutAchatUnitaireHT)
          ? order.coutAchatUnitaireHT
          : undefined,
      coutLogistiqueUnitaireHT:
        order.coutLogistiqueUnitaireHT !== undefined && Number.isFinite(order.coutLogistiqueUnitaireHT)
          ? order.coutLogistiqueUnitaireHT
          : undefined,
      tvaRatePct: order.tvaRatePct !== undefined && Number.isFinite(order.tvaRatePct) ? order.tvaRatePct : undefined,
      qte: Math.max(1, Math.round(Number(order.qte) || 1)),
      qteRemise: order.qteRemise !== undefined && Number.isFinite(order.qteRemise) ? order.qteRemise : undefined,
      statut: order.statut,
      source: order.source,
      paymentStatus: order.paymentStatus?.slice(0, 30),
      paymentMethod: order.paymentMethod?.slice(0, 30),
      amountPaidTTC:
        order.amountPaidTTC !== undefined && Number.isFinite(order.amountPaidTTC)
          ? order.amountPaidTTC
          : undefined,
      paidAt: order.paidAt?.slice(0, 40),
      deliveryMode: order.deliveryMode?.slice(0, 30),
      shippingFeeClientTTC:
        order.shippingFeeClientTTC !== undefined && Number.isFinite(order.shippingFeeClientTTC)
          ? order.shippingFeeClientTTC
          : undefined,
      carrier: order.carrier?.slice(0, 80),
      trackingNumber: order.trackingNumber?.slice(0, 120),
      deliveryAddress: order.deliveryAddress?.slice(0, 300),
      codePromo: order.codePromo?.slice(0, 80),
      discountTTC:
        order.discountTTC !== undefined && Number.isFinite(order.discountTTC)
          ? order.discountTTC
          : undefined,
      notes: order.notes?.slice(0, 600),
      locked: order.locked,
      updatedAt: nowIso(),
    }),
  };
}

function serializeFiscalDocument(docItem: FiscalDocument) {
  const id = sanitizeId(docItem.id, docItem.docType === 'avoir' ? 'av' : 'inv');
  return {
    id,
    payload: stripUndefined({
      id,
      workspaceId: WORKSPACE_ID,
      docType: docItem.docType,
      invoiceNumber: docItem.invoiceNumber.slice(0, 80),
      relatedInvoiceId: docItem.relatedInvoiceId ? sanitizeId(docItem.relatedInvoiceId, 'inv') : undefined,
      relatedInvoiceNumber: docItem.relatedInvoiceNumber?.slice(0, 80),
      refCommande: docItem.refCommande.slice(0, 120),
      date: docItem.date.slice(0, 40),
      dueDate: docItem.dueDate?.slice(0, 40),
      vente: docItem.vente.slice(0, 160),
      customerId: docItem.customerId ? sanitizeId(docItem.customerId, 'cust') : undefined,
      customerSnapshot: docItem.customerSnapshot,
      companySnapshot: docItem.companySnapshot,
      lines: docItem.lines.slice(0, 100),
      shippingTTC: docItem.shippingTTC,
      totalHT: Number(docItem.totalHT) || 0,
      totalTVA: Number(docItem.totalTVA) || 0,
      totalTTC: Number(docItem.totalTTC) || 0,
      paymentStatus: docItem.paymentStatus?.slice(0, 30),
      paymentMethod: docItem.paymentMethod?.slice(0, 30),
      paidAt: docItem.paidAt?.slice(0, 40),
      creditNoteId: docItem.creditNoteId ? sanitizeId(docItem.creditNoteId, 'av') : undefined,
      creditNoteNumber: docItem.creditNoteNumber?.slice(0, 80),
      notes: docItem.notes?.slice(0, 600),
      createdByUid: docItem.createdByUid.slice(0, 128),
      createdAt: (docItem.createdAt || nowIso()).slice(0, 40),
    }),
  };
}

function serializePurchaseOrder(po: SupplierPurchaseOrder) {
  const id = sanitizeId(po.id, 'po');
  return {
    id,
    payload: stripUndefined({
      id,
      workspaceId: WORKSPACE_ID,
      poNumber: po.poNumber.slice(0, 80),
      domaineId: po.domaineId ? sanitizeId(po.domaineId, 'dom') : undefined,
      domaineName: po.domaineName.slice(0, 160),
      date: po.date.slice(0, 40),
      expectedDeliveryDate: po.expectedDeliveryDate?.slice(0, 40),
      statut: po.statut,
      lines: po.lines.slice(0, 100),
      totalBottles: Math.max(1, Math.round(Number(po.totalBottles) || 1)),
      totalHT: Math.max(0, Number(po.totalHT) || 0),
      notes: po.notes?.slice(0, 600),
      createdByUid: po.createdByUid.slice(0, 128),
      createdAt: (po.createdAt || nowIso()).slice(0, 40),
      updatedAt: nowIso(),
    }),
  };
}

function serializeCampaign(c: SalesCampaign) {
  const id = sanitizeId(c.id, 'camp');
  return {
    id,
    payload: stripUndefined({
      id,
      workspaceId: WORKSPACE_ID,
      nom: c.nom.trim().slice(0, 160) || 'Campagne',
      domaine: (c.domaine || '').slice(0, 160),
      domaineId: c.domaineId ? sanitizeId(c.domaineId, 'dom') : undefined,
      dateOuverture: (c.dateOuverture || new Date().toISOString().slice(0, 10)).slice(0, 40),
      dateCloture: c.dateCloture?.slice(0, 40),
      dateLivraisonEstimee: c.dateLivraisonEstimee?.slice(0, 40),
      canal: c.canal,
      contact: c.contact?.slice(0, 100),
      targetBottles: c.targetBottles !== undefined && Number.isFinite(c.targetBottles) ? c.targetBottles : undefined,
      statut: c.statut,
      notes: c.notes?.slice(0, 600),
      updatedAt: nowIso(),
    }),
  };
}

function serializeExpense(e: OperatingExpense) {
  const id = sanitizeId(e.id, 'exp');
  return {
    id,
    payload: stripUndefined({
      id,
      workspaceId: WORKSPACE_ID,
      date: e.date.slice(0, 40),
      category: e.category,
      label: e.label.trim().slice(0, 200) || 'Charge',
      supplier: e.supplier?.slice(0, 160),
      amountHT: Math.max(0, Number(e.amountHT) || 0),
      tvaRatePct: Math.min(100, Math.max(0, Number(e.tvaRatePct) || 0)),
      notes: e.notes?.slice(0, 500),
      createdByUid: e.createdByUid.slice(0, 128),
      createdAt: (e.createdAt || nowIso()).slice(0, 40),
      updatedAt: nowIso(),
    }),
  };
}

// --- CRUD Operations ---

export async function saveSettingsDoc(settings: AppSettings): Promise<void> {
  const path = `workspaces/${WORKSPACE_ID}/settings/main`;
  try {
    await setDoc(wsDoc('settings', 'main'), serializeSettings(settings));
  } catch (err) {
    handleFirestoreError(err, OperationType.WRITE, path);
  }
}

export async function upsertDomainDoc(domain: DomainSupplier): Promise<void> {
  const { id, payload } = serializeDomain(domain);
  try {
    await setDoc(wsDoc('domains', id), payload);
  } catch (err) {
    handleFirestoreError(err, OperationType.WRITE, `workspaces/${WORKSPACE_ID}/domains/${id}`);
  }
}

export async function deleteDomainDoc(domainId: string): Promise<void> {
  const id = sanitizeId(domainId, 'dom');
  try {
    await deleteDoc(wsDoc('domains', id));
  } catch (err) {
    handleFirestoreError(err, OperationType.DELETE, `workspaces/${WORKSPACE_ID}/domains/${id}`);
  }
}

export async function upsertCatalogDoc(item: WineCatalogItem): Promise<void> {
  const { id, payload } = serializeCatalogItem(item);
  try {
    await setDoc(wsDoc('catalog', id), payload);
  } catch (err) {
    handleFirestoreError(err, OperationType.WRITE, `workspaces/${WORKSPACE_ID}/catalog/${id}`);
  }
}

export async function deleteCatalogDoc(catalogId: string): Promise<void> {
  const id = sanitizeId(catalogId, 'cat');
  try {
    await deleteDoc(wsDoc('catalog', id));
  } catch (err) {
    handleFirestoreError(err, OperationType.DELETE, `workspaces/${WORKSPACE_ID}/catalog/${id}`);
  }
}

export async function upsertLotDoc(lot: SupplierLot): Promise<void> {
  const { id, payload } = serializeLot(lot);
  try {
    await setDoc(wsDoc('lots', id), payload);
  } catch (err) {
    handleFirestoreError(err, OperationType.WRITE, `workspaces/${WORKSPACE_ID}/lots/${id}`);
  }
}

export async function deleteLotDoc(lotId: string): Promise<void> {
  const id = sanitizeId(lotId, 'lot');
  try {
    await deleteDoc(wsDoc('lots', id));
  } catch (err) {
    handleFirestoreError(err, OperationType.DELETE, `workspaces/${WORKSPACE_ID}/lots/${id}`);
  }
}

export async function createStockAdjustmentDoc(adj: StockAdjustment): Promise<void> {
  const { id, payload } = serializeStockAdjustment(adj);
  try {
    await setDoc(wsDoc('stockAdjustments', id), payload);
  } catch (err) {
    handleFirestoreError(err, OperationType.CREATE, `workspaces/${WORKSPACE_ID}/stockAdjustments/${id}`);
  }
}

export async function deleteStockAdjustmentDoc(adjId: string): Promise<void> {
  const id = sanitizeId(adjId, 'adj');
  try {
    await deleteDoc(wsDoc('stockAdjustments', id));
  } catch (err) {
    handleFirestoreError(err, OperationType.DELETE, `workspaces/${WORKSPACE_ID}/stockAdjustments/${id}`);
  }
}

export async function upsertCustomerDoc(customer: CustomerProfile): Promise<void> {
  const { id, payload } = serializeCustomer(customer);
  try {
    await setDoc(wsDoc('customers', id), payload);
  } catch (err) {
    handleFirestoreError(err, OperationType.WRITE, `workspaces/${WORKSPACE_ID}/customers/${id}`);
  }
}

export async function deleteCustomerDoc(customerId: string): Promise<void> {
  const id = sanitizeId(customerId, 'cust');
  try {
    await deleteDoc(wsDoc('customers', id));
  } catch (err) {
    handleFirestoreError(err, OperationType.DELETE, `workspaces/${WORKSPACE_ID}/customers/${id}`);
  }
}

export async function upsertOrderDoc(order: OrderLine): Promise<void> {
  const { id, payload } = serializeOrder(order);
  try {
    await setDoc(wsDoc('orders', id), payload);
  } catch (err) {
    handleFirestoreError(err, OperationType.WRITE, `workspaces/${WORKSPACE_ID}/orders/${id}`);
  }
}

export async function deleteOrderDoc(orderId: string): Promise<void> {
  const id = sanitizeId(orderId, 'ord');
  try {
    await deleteDoc(wsDoc('orders', id));
  } catch (err) {
    handleFirestoreError(err, OperationType.DELETE, `workspaces/${WORKSPACE_ID}/orders/${id}`);
  }
}

export async function createFiscalDocumentDoc(docItem: FiscalDocument): Promise<void> {
  const { id, payload } = serializeFiscalDocument(docItem);
  try {
    await setDoc(wsDoc('invoices', id), payload);
  } catch (err) {
    handleFirestoreError(err, OperationType.CREATE, `workspaces/${WORKSPACE_ID}/invoices/${id}`);
  }
}

export async function updateFiscalDocumentDoc(docItem: FiscalDocument): Promise<void> {
  const { id, payload } = serializeFiscalDocument(docItem);
  try {
    await setDoc(wsDoc('invoices', id), payload);
  } catch (err) {
    handleFirestoreError(err, OperationType.UPDATE, `workspaces/${WORKSPACE_ID}/invoices/${id}`);
  }
}

export async function createPurchaseOrderDoc(po: SupplierPurchaseOrder): Promise<void> {
  const { id, payload } = serializePurchaseOrder(po);
  try {
    await setDoc(wsDoc('purchaseOrders', id), payload);
  } catch (err) {
    handleFirestoreError(err, OperationType.CREATE, `workspaces/${WORKSPACE_ID}/purchaseOrders/${id}`);
  }
}

export async function updatePurchaseOrderDoc(po: SupplierPurchaseOrder): Promise<void> {
  const { id, payload } = serializePurchaseOrder(po);
  try {
    await setDoc(wsDoc('purchaseOrders', id), payload);
  } catch (err) {
    handleFirestoreError(err, OperationType.UPDATE, `workspaces/${WORKSPACE_ID}/purchaseOrders/${id}`);
  }
}

export async function deletePurchaseOrderDoc(poId: string): Promise<void> {
  const id = sanitizeId(poId, 'po');
  try {
    await deleteDoc(wsDoc('purchaseOrders', id));
  } catch (err) {
    handleFirestoreError(err, OperationType.DELETE, `workspaces/${WORKSPACE_ID}/purchaseOrders/${id}`);
  }
}

export async function upsertCampaignDoc(campaign: SalesCampaign): Promise<void> {
  const { id, payload } = serializeCampaign(campaign);
  try {
    await setDoc(wsDoc('campaigns', id), payload);
  } catch (err) {
    handleFirestoreError(err, OperationType.WRITE, `workspaces/${WORKSPACE_ID}/campaigns/${id}`);
  }
}

export async function deleteCampaignDoc(campaignId: string): Promise<void> {
  const id = sanitizeId(campaignId, 'camp');
  try {
    await deleteDoc(wsDoc('campaigns', id));
  } catch (err) {
    handleFirestoreError(err, OperationType.DELETE, `workspaces/${WORKSPACE_ID}/campaigns/${id}`);
  }
}

export async function upsertExpenseDoc(expense: OperatingExpense): Promise<void> {
  const { id, payload } = serializeExpense(expense);
  try {
    await setDoc(wsDoc('expenses', id), payload);
  } catch (err) {
    handleFirestoreError(err, OperationType.WRITE, `workspaces/${WORKSPACE_ID}/expenses/${id}`);
  }
}

export async function deleteExpenseDoc(expenseId: string): Promise<void> {
  const id = sanitizeId(expenseId, 'exp');
  try {
    await deleteDoc(wsDoc('expenses', id));
  } catch (err) {
    handleFirestoreError(err, OperationType.DELETE, `workspaces/${WORKSPACE_ID}/expenses/${id}`);
  }
}

// --- Per-User Assistant IA Conversation History ---

function boundJsonArray<T>(items: T[], maxItems: number, maxChars: number): string {
  let slice = items.slice(-maxItems);
  let json = JSON.stringify(slice);
  while (json.length > maxChars && slice.length > 1) {
    slice = slice.slice(1);
    json = JSON.stringify(slice);
  }
  if (json.length > maxChars) {
    return '[]';
  }
  return json;
}

function serializeAssistantThread(thread: AssistantThread) {
  const id = sanitizeId(thread.id, 'thr');
  const messagesJson = boundJsonArray(thread.messages, 40, 190000);
  const historyJson = boundJsonArray(thread.history, 24, 190000);
  const safeCount = Math.min(200, Math.max(0, thread.messages.length));
  return {
    id,
    payload: {
      id,
      workspaceId: WORKSPACE_ID,
      ownerUid: thread.ownerUid.slice(0, 128),
      title: (thread.title || 'Conversation').trim().slice(0, 160) || 'Conversation',
      messagesJson,
      historyJson,
      messageCount: safeCount,
      createdAt: (thread.createdAt || nowIso()).slice(0, 40),
      updatedAt: nowIso(),
    },
  };
}

export function subscribeAssistantThreads(
  ownerUid: string,
  onThreads: (threads: AssistantThread[]) => void,
  onError: (err: Error) => void
): Unsubscribe {
  const q = query(wsCol('assistantThreads'), where('ownerUid', '==', ownerUid));
  return onSnapshot(
    q,
    (snap) => {
      const threads: AssistantThread[] = snap.docs
        .map((d) => {
          const raw = d.data() as Record<string, unknown>;
          let messages: ChatMessage[] = [];
          let history: AssistantContent[] = [];
          try {
            if (typeof raw.messagesJson === 'string') {
              const parsed = JSON.parse(raw.messagesJson);
              if (Array.isArray(parsed)) messages = parsed as ChatMessage[];
            }
          } catch {
            messages = [];
          }
          try {
            if (typeof raw.historyJson === 'string') {
              const parsed = JSON.parse(raw.historyJson);
              if (Array.isArray(parsed)) history = parsed as AssistantContent[];
            }
          } catch {
            history = [];
          }
          return {
            id: String(raw.id ?? d.id),
            ownerUid: String(raw.ownerUid ?? ownerUid),
            title: String(raw.title ?? 'Conversation'),
            messages,
            history,
            messageCount: Number(raw.messageCount ?? messages.length),
            createdAt: String(raw.createdAt ?? ''),
            updatedAt: String(raw.updatedAt ?? ''),
          };
        })
        .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
      onThreads(threads);
    },
    (err) => {
      try {
        handleFirestoreError(err, OperationType.LIST, `workspaces/${WORKSPACE_ID}/assistantThreads`);
      } catch (wrapped) {
        onError(wrapped instanceof Error ? wrapped : new Error(String(wrapped)));
      }
    }
  );
}

export async function upsertAssistantThreadDoc(thread: AssistantThread): Promise<void> {
  const { id, payload } = serializeAssistantThread(thread);
  try {
    await setDoc(wsDoc('assistantThreads', id), payload);
  } catch (err) {
    handleFirestoreError(err, OperationType.WRITE, `workspaces/${WORKSPACE_ID}/assistantThreads/${id}`);
  }
}

export async function deleteAssistantThreadDoc(threadId: string): Promise<void> {
  const id = sanitizeId(threadId, 'thr');
  try {
    await deleteDoc(wsDoc('assistantThreads', id));
  } catch (err) {
    handleFirestoreError(err, OperationType.DELETE, `workspaces/${WORKSPACE_ID}/assistantThreads/${id}`);
  }
}

// --- Team & Invites ---

export async function createInviteDoc(
  email: string,
  role: 'admin' | 'operator',
  invitedByUid: string
): Promise<void> {
  const emailLower = email.trim().toLowerCase();
  if (!emailLower || !emailLower.includes('@')) {
    throw new Error('Adresse email invalide.');
  }
  const path = `workspaces/${WORKSPACE_ID}/invites/${emailLower}`;
  try {
    await setDoc(wsDoc('invites', emailLower), {
      email: emailLower,
      role,
      invitedByUid,
      workspaceId: WORKSPACE_ID,
      createdAt: nowIso(),
    });
  } catch (err) {
    handleFirestoreError(err, OperationType.CREATE, path);
  }
}

export async function deleteInviteDoc(email: string): Promise<void> {
  const emailLower = email.trim().toLowerCase();
  try {
    await deleteDoc(wsDoc('invites', emailLower));
  } catch (err) {
    handleFirestoreError(err, OperationType.DELETE, `workspaces/${WORKSPACE_ID}/invites/${emailLower}`);
  }
}

export async function updateMemberRoleDoc(
  member: WorkspaceMember,
  newRole: 'admin' | 'operator'
): Promise<void> {
  try {
    await setDoc(wsDoc('members', member.uid), {
      uid: member.uid,
      email: member.email,
      displayName: member.displayName,
      role: newRole,
      workspaceId: WORKSPACE_ID,
      createdAt: member.createdAt,
      updatedAt: nowIso(),
    });
  } catch (err) {
    handleFirestoreError(err, OperationType.UPDATE, `workspaces/${WORKSPACE_ID}/members/${member.uid}`);
  }
}

export async function removeMemberDoc(uid: string): Promise<void> {
  try {
    await deleteDoc(wsDoc('members', uid));
  } catch (err) {
    handleFirestoreError(err, OperationType.DELETE, `workspaces/${WORKSPACE_ID}/members/${uid}`);
  }
}

// --- Batched Helpers ---

interface BatchOp {
  type: 'set' | 'delete';
  subcollection: string;
  docId: string;
  payload?: Record<string, unknown>;
}

async function commitBatchOps(ops: BatchOp[]): Promise<void> {
  const CHUNK_SIZE = 350;
  for (let i = 0; i < ops.length; i += CHUNK_SIZE) {
    const chunk = ops.slice(i, i + CHUNK_SIZE);
    const batch = writeBatch(db);
    for (const op of chunk) {
      const ref = wsDoc(op.subcollection, op.docId);
      if (op.type === 'set' && op.payload) {
        batch.set(ref, op.payload);
      } else if (op.type === 'delete') {
        batch.delete(ref);
      }
    }
    try {
      await batch.commit();
    } catch (err) {
      handleFirestoreError(err, OperationType.WRITE, `workspaces/${WORKSPACE_ID}/batch`);
    }
  }
}

export async function upsertOrdersBatch(orders: OrderLine[]): Promise<void> {
  const ops: BatchOp[] = orders.map((o) => {
    const { id, payload } = serializeOrder(o);
    return { type: 'set', subcollection: 'orders', docId: id, payload };
  });
  await commitBatchOps(ops);
}

export async function upsertLotsBatch(lots: SupplierLot[]): Promise<void> {
  const ops: BatchOp[] = lots.map((l) => {
    const { id, payload } = serializeLot(l);
    return { type: 'set', subcollection: 'lots', docId: id, payload };
  });
  await commitBatchOps(ops);
}

export async function deleteLotsBatch(lotIds: string[]): Promise<void> {
  const ops: BatchOp[] = lotIds.map((rawId) => ({
    type: 'delete',
    subcollection: 'lots',
    docId: sanitizeId(rawId, 'lot'),
  }));
  await commitBatchOps(ops);
}

export interface WorkspaceSeedBundle {
  settings?: AppSettings;
  domains?: DomainSupplier[];
  catalog?: WineCatalogItem[];
  lots?: SupplierLot[];
  customers?: CustomerProfile[];
  orders?: OrderLine[];
  campaigns?: SalesCampaign[];
  expenses?: OperatingExpense[];
  stockAdjustments?: StockAdjustment[];
  purchaseOrders?: SupplierPurchaseOrder[];
  invoices?: FiscalDocument[];
}

export async function seedWorkspaceBundle(
  bundle: WorkspaceSeedBundle,
  options?: { clearMutableCollections?: boolean }
): Promise<void> {
  const ops: BatchOp[] = [];

  if (options?.clearMutableCollections) {
    const mutableCols = ['domains', 'catalog', 'lots', 'customers', 'orders', 'campaigns', 'expenses', 'purchaseOrders'];
    for (const colName of mutableCols) {
      const q = query(wsCol(colName), where('workspaceId', '==', WORKSPACE_ID));
      const snap = await getDocs(q);
      for (const d of snap.docs) {
        // Ne jamais supprimer une commande verrouillée (facturée)
        if (colName === 'orders' && d.data().locked === true) continue;
        ops.push({ type: 'delete', subcollection: colName, docId: d.id });
      }
    }
  }

  if (bundle.settings) {
    ops.push({
      type: 'set',
      subcollection: 'settings',
      docId: 'main',
      payload: serializeSettings(bundle.settings),
    });
  }
  for (const d of bundle.domains ?? []) {
    const { id, payload } = serializeDomain(d);
    ops.push({ type: 'set', subcollection: 'domains', docId: id, payload });
  }
  for (const c of bundle.catalog ?? []) {
    const { id, payload } = serializeCatalogItem(c);
    ops.push({ type: 'set', subcollection: 'catalog', docId: id, payload });
  }
  for (const l of bundle.lots ?? []) {
    const { id, payload } = serializeLot(l);
    ops.push({ type: 'set', subcollection: 'lots', docId: id, payload });
  }
  for (const cust of bundle.customers ?? []) {
    const { id, payload } = serializeCustomer(cust);
    ops.push({ type: 'set', subcollection: 'customers', docId: id, payload });
  }
  for (const o of bundle.orders ?? []) {
    const { id, payload } = serializeOrder(o);
    ops.push({ type: 'set', subcollection: 'orders', docId: id, payload });
  }
  for (const camp of bundle.campaigns ?? []) {
    const { id, payload } = serializeCampaign(camp);
    ops.push({ type: 'set', subcollection: 'campaigns', docId: id, payload });
  }
  for (const exp of bundle.expenses ?? []) {
    const { id, payload } = serializeExpense(exp);
    ops.push({ type: 'set', subcollection: 'expenses', docId: id, payload });
  }
  for (const adj of bundle.stockAdjustments ?? []) {
    const { id, payload } = serializeStockAdjustment(adj);
    ops.push({ type: 'set', subcollection: 'stockAdjustments', docId: id, payload });
  }
  for (const po of bundle.purchaseOrders ?? []) {
    const { id, payload } = serializePurchaseOrder(po);
    ops.push({ type: 'set', subcollection: 'purchaseOrders', docId: id, payload });
  }
  for (const inv of bundle.invoices ?? []) {
    const { id, payload } = serializeFiscalDocument(inv);
    ops.push({ type: 'set', subcollection: 'invoices', docId: id, payload });
  }

  await commitBatchOps(ops);
}
