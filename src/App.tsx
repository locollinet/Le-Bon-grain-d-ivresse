/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useEffect, useMemo, useState } from 'react';
import {
  createUserWithEmailAndPassword,
  onAuthStateChanged,
  sendEmailVerification,
  sendPasswordResetEmail,
  signInWithEmailAndPassword,
  signInWithPopup,
  signOut,
  updateProfile,
  type User,
} from 'firebase/auth';
import {
  AlertTriangle,
  BarChart3,
  BookOpen,
  Bot,
  Building2,
  ClipboardList,
  ClipboardPaste,
  Cloud,
  LayoutDashboard,
  LogOut,
  Menu,
  Receipt,
  Settings,
  Sparkles,
  Users,
  Warehouse,
  Wine,
  X,
} from 'lucide-react';
import { auth, googleProvider, testFirestoreConnection } from './firebase';
import {
  createFiscalDocumentDoc,
  createInviteDoc,
  createPurchaseOrderDoc,
  createStockAdjustmentDoc,
  deleteAssistantThreadDoc,
  deleteCampaignDoc,
  deleteCatalogDoc,
  deleteCustomerDoc,
  deleteDomainDoc,
  deleteExpenseDoc,
  deleteInviteDoc,
  deleteLotDoc,
  deleteLotsBatch,
  deleteOrderDoc,
  deletePurchaseOrderDoc,
  deleteStockAdjustmentDoc,
  ensureWorkspaceAccess,
  nowIso,
  removeMemberDoc,
  sanitizeId,
  saveSettingsDoc,
  seedWorkspaceBundle,
  subscribeAssistantThreads,
  subscribeWorkspaceData,
  updateFiscalDocumentDoc,
  updateMemberRoleDoc,
  updatePurchaseOrderDoc,
  upsertAssistantThreadDoc,
  upsertCampaignDoc,
  upsertCatalogDoc,
  upsertCustomerDoc,
  upsertDomainDoc,
  upsertExpenseDoc,
  upsertLotDoc,
  upsertLotsBatch,
  upsertOrderDoc,
  upsertOrdersBatch,
  type WorkspaceSeedBundle,
} from './services/workspaceStore';
import type {
  ActiveTab,
  AppSettings,
  CustomerProfile,
  CustomerSummary,
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
} from './types/wine';
import {
  DEFAULT_SETTINGS,
  DEMO_EXTRA_LOTS,
  INITIAL_CAMPAIGNS,
  INITIAL_CATALOG,
  INITIAL_LOTS,
  INITIAL_ORDERS,
} from './data/seedData';
import {
  computeCustomerSummaries,
  computeStockSummaries,
  deriveInitialCustomers,
  deriveInitialDomains,
  getLogisticsCostHT,
} from './utils/wineMath';
import { copyTextToClipboard } from './utils/clipboard';
import { AuthGate } from './components/AuthGate';
import { DashboardView } from './components/DashboardView';
import { StockView } from './components/StockView';
import { DomainsView } from './components/DomainsView';
import { OrdersView } from './components/OrdersView';
import { FinanceView } from './components/FinanceView';
import { AccountingView } from './components/AccountingView';
import { ClientsView } from './components/ClientsView';
import { CatalogView } from './components/CatalogView';
import { WineListView } from './components/WineListView';
import { SettingsView } from './components/SettingsView';
import { ImportHelloAssoModal } from './components/ImportHelloAssoModal';
import { NewDirectOrderModal } from './components/NewDirectOrderModal';
import { NewSupplierLotModal } from './components/NewSupplierLotModal';
import { InvoiceAIModal } from './components/InvoiceAIModal';
import { AssistantPanel } from './modules/assistant/AssistantPanel';
import type { AssistantAction, AssistantThread } from './modules/assistant/types';

const LEGACY_STORAGE_KEYS = {
  catalog: 'lbg_catalog_v3',
  lots: 'lbg_lots_v3',
  orders: 'lbg_orders_v3',
  campaigns: 'lbg_campaigns_v3',
  settings: 'lbg_settings_v3',
};

function readLegacyLocalData(): {
  hasData: boolean;
  catalog: WineCatalogItem[];
  lots: SupplierLot[];
  orders: OrderLine[];
  campaigns: SalesCampaign[];
  settings: AppSettings;
} {
  try {
    const rawCat = localStorage.getItem(LEGACY_STORAGE_KEYS.catalog);
    const rawLots = localStorage.getItem(LEGACY_STORAGE_KEYS.lots);
    const rawOrders = localStorage.getItem(LEGACY_STORAGE_KEYS.orders);
    const rawCamps = localStorage.getItem(LEGACY_STORAGE_KEYS.campaigns);
    const rawSettings = localStorage.getItem(LEGACY_STORAGE_KEYS.settings);

    const catalog = rawCat ? (JSON.parse(rawCat) as WineCatalogItem[]) : [];
    const lots = rawLots ? (JSON.parse(rawLots) as SupplierLot[]) : [];
    const orders = rawOrders ? (JSON.parse(rawOrders) as OrderLine[]) : [];
    const campaigns = rawCamps ? (JSON.parse(rawCamps) as SalesCampaign[]) : [];
    const settings: AppSettings = rawSettings
      ? { ...DEFAULT_SETTINGS, ...(JSON.parse(rawSettings) as Partial<AppSettings>) }
      : DEFAULT_SETTINGS;

    const hasData =
      Array.isArray(catalog) &&
      (catalog.length > 0 || (Array.isArray(orders) && orders.length > 0));

    return {
      hasData,
      catalog: Array.isArray(catalog) ? catalog : [],
      lots: Array.isArray(lots) ? lots : [],
      orders: Array.isArray(orders) ? orders : [],
      campaigns: Array.isArray(campaigns) ? campaigns : [],
      settings,
    };
  } catch {
    return {
      hasData: false,
      catalog: [],
      lots: [],
      orders: [],
      campaigns: [],
      settings: DEFAULT_SETTINGS,
    };
  }
}

const NAV_GROUPS: {
  title: string;
  items: {
    id: ActiveTab;
    label: string;
    icon: React.ComponentType<{ className?: string }>;
  }[];
}[] = [
  {
    title: 'Quotidien',
    items: [
      { id: 'dashboard', label: 'Tableau de bord', icon: LayoutDashboard },
      { id: 'orders', label: 'Commandes', icon: ClipboardList },
      { id: 'stock', label: 'Stock & Cave', icon: Warehouse },
      { id: 'domains', label: 'Domaines & PO', icon: Building2 },
    ],
  },
  {
    title: 'Clients & Vitrine',
    items: [
      { id: 'clients', label: 'Clients & CRM', icon: Users },
      { id: 'winelist', label: 'Carte des vins', icon: Wine },
    ],
  },
  {
    title: 'Gestion & Paramètres',
    items: [
      { id: 'finance', label: 'Bilans financiers', icon: BarChart3 },
      { id: 'accounting', label: 'Facturation & TVA', icon: Receipt },
      { id: 'catalog', label: 'Catalogue & Tarifs', icon: BookOpen },
      { id: 'settings', label: 'Paramètres', icon: Settings },
    ],
  },
];

const ALL_NAV_ITEMS = NAV_GROUPS.flatMap((g) => g.items);

const formatFirebaseAuthError = (err: unknown): string => {
  const code =
    typeof err === 'object' && err !== null && 'code' in err
      ? String((err as { code?: unknown }).code ?? '')
      : '';
  switch (code) {
    case 'auth/operation-not-allowed':
      return 'La connexion par e-mail n’est pas encore activée dans la console Firebase (Authentication → Méthodes de connexion → Adresse e-mail / Mot de passe).';
    case 'auth/invalid-credential':
    case 'auth/wrong-password':
    case 'auth/user-not-found':
      return 'E-mail ou mot de passe incorrect. Si c’est votre première connexion par e-mail, cliquez sur l’onglet « Première connexion ».';
    case 'auth/email-already-in-use':
      return 'Un compte existe déjà pour cette adresse e-mail. Cliquez sur « J’ai déjà un mot de passe » ou utilisez « Mot de passe oublié ? ».';
    case 'auth/weak-password':
      return 'Le mot de passe doit contenir au moins 6 caractères.';
    case 'auth/invalid-email':
      return 'Adresse e-mail invalide.';
    case 'auth/too-many-requests':
      return 'Trop de tentatives. Patientez quelques instants avant de réessayer.';
    case 'auth/popup-closed-by-user':
    case 'auth/popup-blocked':
      return 'La fenêtre Google a été fermée ou bloquée par le navigateur. Ouvrez l’application sur son lien direct ou connectez-vous par e-mail ci-dessous.';
    case 'auth/network-request-failed':
      return 'Connexion réseau impossible. Vérifiez votre accès Internet puis réessayez.';
    default:
      return err instanceof Error
        ? err.message
        : 'Impossible de finaliser la connexion.';
  }
};

export default function App() {
  // --- Auth & Workspace Access ---
  const [authReady, setAuthReady] = useState(false);
  const [firebaseUser, setFirebaseUser] = useState<User | null>(null);
  const [accessState, setAccessState] = useState<
    'idle' | 'checking' | 'verify_email' | 'authorized' | 'unauthorized'
  >('idle');
  const [currentMember, setCurrentMember] = useState<WorkspaceMember | null>(null);
  const [authError, setAuthError] = useState<string | null>(null);
  const [authNotice, setAuthNotice] = useState<string | null>(null);
  const [initialLoadDone, setInitialLoadDone] = useState(false);
  const [userSkippedSeed, setUserSkippedSeed] = useState(false);
  const [seedingBusy, setSeedingBusy] = useState(false);
  const [cloudError, setCloudError] = useState<string | null>(null);

  // --- Cloud-Synced Collections ---
  const [settings, setSettings] = useState<AppSettings>(DEFAULT_SETTINGS);
  const [members, setMembers] = useState<WorkspaceMember[]>([]);
  const [invites, setInvites] = useState<WorkspaceInvite[]>([]);
  const [domains, setDomains] = useState<DomainSupplier[]>([]);
  const [catalog, setCatalog] = useState<WineCatalogItem[]>([]);
  const [lots, setLots] = useState<SupplierLot[]>([]);
  const [stockAdjustments, setStockAdjustments] = useState<StockAdjustment[]>([]);
  const [customerProfiles, setCustomerProfiles] = useState<CustomerProfile[]>([]);
  const [orders, setOrders] = useState<OrderLine[]>([]);
  const [invoices, setInvoices] = useState<FiscalDocument[]>([]);
  const [purchaseOrders, setPurchaseOrders] = useState<SupplierPurchaseOrder[]>([]);
  const [campaigns, setCampaigns] = useState<SalesCampaign[]>([]);
  const [expenses, setExpenses] = useState<OperatingExpense[]>([]);
  const [assistantThreads, setAssistantThreads] = useState<AssistantThread[]>([]);

  // --- UI State ---
  const [activeTab, setActiveTab] = useState<ActiveTab>('dashboard');
  const [mobileNavOpen, setMobileNavOpen] = useState(false);
  const [assistantOpen, setAssistantOpen] = useState(false);
  const [importModalOpen, setImportModalOpen] = useState(false);
  const [invoiceAIModalOpen, setInvoiceAIModalOpen] = useState(false);
  const [directOrderModalOpen, setDirectOrderModalOpen] = useState(false);
  const [supplierLotModalOpen, setSupplierLotModalOpen] = useState(false);
  const [editingLot, setEditingLot] = useState<SupplierLot | null>(null);
  const [toastMessage, setToastMessage] = useState<string | null>(null);

  const notify = (msg: string) => setToastMessage(msg);

  useEffect(() => {
    if (!toastMessage) return;
    const t = setTimeout(() => setToastMessage(null), 4500);
    return () => clearTimeout(t);
  }, [toastMessage]);

  // Firestore connectivity check on startup
  useEffect(() => {
    void testFirestoreConnection();
  }, []);

  const loadWorkspaceAccess = async (user: User) => {
    if (!user.emailVerified) {
      setCurrentMember(null);
      setAccessState('verify_email');
      return;
    }

    setAccessState('checking');
    try {
      const res = await ensureWorkspaceAccess(user);
      if (res.status === 'authorized') {
        setCurrentMember(res.member);
        setAccessState('authorized');
      } else {
        setCurrentMember(null);
        setAccessState('unauthorized');
      }
    } catch (err) {
      const msg =
        err instanceof Error
          ? err.message
          : 'Erreur de vérification d’accès à la base Firebase.';
      setAuthError(msg);
      setAccessState('idle');
    }
  };

  // Auth listener
  useEffect(() => {
    const unsub = onAuthStateChanged(auth, async (user) => {
      setFirebaseUser(user);
      setAuthReady(true);
      setAuthError(null);

      if (!user) {
        setAccessState('idle');
        setCurrentMember(null);
        setInitialLoadDone(false);
        return;
      }

      await loadWorkspaceAccess(user);
    });
    return () => unsub();
  }, []);

  // Real-time Firestore subscriptions once authorized
  useEffect(() => {
    if (accessState !== 'authorized' || !currentMember) return;

    setInitialLoadDone(false);
    setCloudError(null);

    const unsub = subscribeWorkspaceData(currentMember.role === 'admin', {
      onSettings: setSettings,
      onMembers: setMembers,
      onInvites: setInvites,
      onDomains: setDomains,
      onCatalog: setCatalog,
      onLots: setLots,
      onStockAdjustments: setStockAdjustments,
      onCustomers: setCustomerProfiles,
      onOrders: setOrders,
      onInvoices: setInvoices,
      onPurchaseOrders: setPurchaseOrders,
      onCampaigns: setCampaigns,
      onExpenses: setExpenses,
      onInitialLoadDone: () => setInitialLoadDone(true),
      onError: (err) => {
        console.error('Firestore listener error:', err);
        setCloudError(err.message);
      },
    });

    return () => unsub();
  }, [accessState, currentMember]);

  // Per-user Assistant IA conversation history subscription
  useEffect(() => {
    if (accessState !== 'authorized' || !firebaseUser) {
      setAssistantThreads([]);
      return;
    }
    const unsub = subscribeAssistantThreads(
      firebaseUser.uid,
      setAssistantThreads,
      (err) => {
        console.error('Assistant threads listener error:', err);
      }
    );
    return () => unsub();
  }, [accessState, firebaseUser]);

  // Global shortcut Cmd/Ctrl + K to toggle Assistant IA
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        setAssistantOpen((v) => !v);
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, []);

  // Derived data
  const legacyLocal = useMemo(() => readLegacyLocalData(), []);

  const stockRows = useMemo(
    () => computeStockSummaries(catalog, lots, orders, stockAdjustments),
    [catalog, lots, orders, stockAdjustments]
  );

  const catalogMap = useMemo(
    () => new Map(catalog.map((c) => [c.id, c])),
    [catalog]
  );

  const customerSummaries = useMemo(
    () => computeCustomerSummaries(orders, catalogMap, settings, customerProfiles),
    [orders, catalogMap, settings, customerProfiles]
  );

  const existingRefs = useMemo(
    () => new Set(orders.map((o) => o.refCommande)),
    [orders]
  );

  const existingInvoiceRefs = useMemo(() => {
    const set = new Set<string>();
    lots.forEach((l) => {
      if (l.referenceFacture) set.add(l.referenceFacture.trim());
    });
    orders.forEach((o) => {
      if (o.refCommande) set.add(o.refCommande.trim());
      if (o.invoiceNumber) set.add(o.invoiceNumber.trim());
    });
    invoices.forEach((inv) => {
      if (inv.invoiceNumber) set.add(inv.invoiceNumber.trim());
    });
    return set;
  }, [lots, orders, invoices]);

  const isDemoActive = useMemo(
    () => lots.some((l) => l.origin === 'demo'),
    [lots]
  );

  const pendingOrdersCount = useMemo(
    () =>
      orders.filter(
        (o) => o.statut === 'attente_reception' || o.statut === 'recu_lbg'
      ).length,
    [orders]
  );

  const availableBottlesCount = useMemo(
    () => stockRows.reduce((s, r) => s + Math.max(0, r.disponibleVente), 0),
    [stockRows]
  );

  const deficitDomainsCount = useMemo(() => {
    const doms = new Set<string>();
    for (const r of stockRows) {
      if (r.disponibleVente < 0) doms.add(r.catalog.domaine);
    }
    return doms.size;
  }, [stockRows]);

  const activeNavLabel =
    ALL_NAV_ITEMS.find((n) => n.id === activeTab)?.label ?? 'Tableau de bord';

  // --- Auth Handlers ---
  const handleSignIn = async () => {
    setAuthError(null);
    setAuthNotice(null);
    try {
      await signInWithPopup(auth, googleProvider);
    } catch (err) {
      setAuthError(formatFirebaseAuthError(err));
    }
  };

  const handleEmailSignIn = async (email: string, password: string) => {
    setAuthError(null);
    setAuthNotice(null);
    try {
      const cred = await signInWithEmailAndPassword(auth, email, password);
      if (!cred.user.emailVerified) {
        try {
          await sendEmailVerification(cred.user);
          setAuthNotice(
            `Un lien de confirmation vient d’être envoyé à ${email}. Cliquez dessus dans votre boîte mail (vérifiez les spams), puis cliquez sur le bouton ci-dessous.`
          );
        } catch {
          // If Firebase rate-limits duplicate verification emails, the user can still use the resend button.
        }
      }
    } catch (err) {
      setAuthError(formatFirebaseAuthError(err));
    }
  };

  const handleEmailSignUp = async (
    email: string,
    password: string,
    displayName: string
  ) => {
    setAuthError(null);
    setAuthNotice(null);
    try {
      const cred = await createUserWithEmailAndPassword(auth, email, password);
      if (displayName.trim()) {
        await updateProfile(cred.user, { displayName: displayName.trim() });
      }
      await sendEmailVerification(cred.user);
      setAuthNotice(
        `Un lien de confirmation vient d’être envoyé à ${email}. Cliquez dessus puis validez ci-dessous.`
      );
    } catch (err) {
      setAuthError(formatFirebaseAuthError(err));
    }
  };

  const handlePasswordReset = async (email: string) => {
    setAuthError(null);
    setAuthNotice(null);
    try {
      await sendPasswordResetEmail(auth, email);
      setAuthNotice(
        `Un lien de réinitialisation du mot de passe a été envoyé à ${email} (vérifiez vos courriers indésirables).`
      );
    } catch (err) {
      setAuthError(formatFirebaseAuthError(err));
    }
  };

  const handleResendVerification = async () => {
    const user = auth.currentUser;
    if (!user) return;
    setAuthError(null);
    setAuthNotice(null);
    try {
      await sendEmailVerification(user);
      setAuthNotice(
        `E-mail de confirmation renvoyé à ${user.email ?? 'votre adresse'}. Pensez à vérifier vos courriers indésirables.`
      );
    } catch (err) {
      setAuthError(formatFirebaseAuthError(err));
    }
  };

  const handleCheckEmailVerified = async () => {
    const user = auth.currentUser;
    if (!user) return;
    setAuthError(null);
    setAuthNotice(null);
    try {
      await user.reload();
      await user.getIdToken(true);
      const refreshed = auth.currentUser;
      if (!refreshed?.emailVerified) {
        setAuthError(
          'Votre adresse e-mail n’apparaît pas encore comme validée. Cliquez sur le lien reçu dans votre boîte mail (et vérifiez vos spams), puis réessayez.'
        );
        return;
      }
      setFirebaseUser(refreshed);
      await loadWorkspaceAccess(refreshed);
    } catch (err) {
      setAuthError(formatFirebaseAuthError(err));
    }
  };

  const handleSignOut = async () => {
    setAuthError(null);
    setAuthNotice(null);
    await signOut(auth);
  };

  // --- Helper: Stamp frozen unit costs on newly created/imported orders ---
  const stampFrozenCosts = (
    list: OrderLine[],
    extraCatalog: WineCatalogItem[] = []
  ): OrderLine[] => {
    const allCat = [...catalog, ...extraCatalog];
    const catMap = new Map(allCat.map((c) => [c.id, c]));
    return list.map((o) => {
      const item = catMap.get(o.catalogId);
      const isPerso = o.source === 'perso' || o.prixUnitaireTTC === 0;
      return {
        ...o,
        coutAchatUnitaireHT:
          o.coutAchatUnitaireHT !== undefined
            ? o.coutAchatUnitaireHT
            : (item?.tarifAchatHT ?? 0),
        coutLogistiqueUnitaireHT:
          o.coutLogistiqueUnitaireHT !== undefined
            ? o.coutLogistiqueUnitaireHT
            : item
              ? getLogisticsCostHT(item, settings)
              : settings.fraisLogistiqueParBouteille,
        paymentStatus:
          o.paymentStatus ??
          (isPerso
            ? 'paye'
            : o.source === 'helloasso'
              ? 'paye'
              : 'en_attente'),
        deliveryMode: o.deliveryMode ?? 'remise_main',
      };
    });
  };

  // --- First-Run Migration / Seed Handlers ---
  const handleMigrateLocal = async () => {
    setSeedingBusy(true);
    try {
      const derivedDomains = deriveInitialDomains(legacyLocal.catalog);
      const derivedCustomers = deriveInitialCustomers(legacyLocal.orders);
      const stampedOrders = stampFrozenCosts(
        legacyLocal.orders,
        legacyLocal.catalog
      );
      await seedWorkspaceBundle({
        settings: legacyLocal.settings,
        domains: derivedDomains,
        catalog: legacyLocal.catalog,
        lots: legacyLocal.lots,
        customers: derivedCustomers,
        orders: stampedOrders,
        campaigns:
          legacyLocal.campaigns.length > 0
            ? legacyLocal.campaigns
            : INITIAL_CAMPAIGNS,
      });
      notify(
        `Migration cloud réussie : ${legacyLocal.catalog.length} cuvées et ${legacyLocal.orders.length} lignes synchronisées.`
      );
    } catch (err) {
      setAuthError(err instanceof Error ? err.message : 'Erreur de migration.');
    } finally {
      setSeedingBusy(false);
    }
  };

  const handleSeedExcel = async () => {
    setSeedingBusy(true);
    try {
      const derivedDomains = deriveInitialDomains(INITIAL_CATALOG);
      const derivedCustomers = deriveInitialCustomers(INITIAL_ORDERS);
      const stampedOrders = stampFrozenCosts(INITIAL_ORDERS, INITIAL_CATALOG);
      await seedWorkspaceBundle({
        settings: DEFAULT_SETTINGS,
        domains: derivedDomains,
        catalog: INITIAL_CATALOG,
        lots: INITIAL_LOTS,
        customers: derivedCustomers,
        orders: stampedOrders,
        campaigns: INITIAL_CAMPAIGNS,
      });
      notify('Données Excel initiales importées dans la base cloud.');
    } catch (err) {
      setAuthError(err instanceof Error ? err.message : 'Erreur d’initialisation.');
    } finally {
      setSeedingBusy(false);
    }
  };

  const handleStartEmpty = async () => {
    setUserSkippedSeed(true);
    await saveSettingsDoc(DEFAULT_SETTINGS);
    notify('Cave vierge initialisée.');
  };

  // --- Safe Action Runner ---
  const runAction = async (fn: () => Promise<void>, successMsg?: string) => {
    try {
      setCloudError(null);
      await fn();
      if (successMsg) notify(successMsg);
    } catch (err) {
      const msg =
        err instanceof Error ? err.message : 'Erreur de synchronisation cloud.';
      setCloudError(msg);
    }
  };

  // --- Business Handlers ---
  const handleSaveSettings = async (next: AppSettings) => {
    await runAction(() => saveSettingsDoc(next), 'Paramètres enregistrés dans le cloud.');
  };

  const handleSaveCampaign = async (campaign: SalesCampaign) => {
    await runAction(
      () => upsertCampaignDoc(campaign),
      `Campagne « ${campaign.nom} » enregistrée.`
    );
  };

  const handleDeleteCampaign = async (campaignId: string) => {
    await runAction(
      () => deleteCampaignDoc(campaignId),
      'Campagne supprimée.'
    );
  };

  const handleSaveDomain = async (domain: DomainSupplier) => {
    await runAction(
      () => upsertDomainDoc(domain),
      `Fiche domaine « ${domain.nom} » enregistrée.`
    );
  };

  const handleDeleteDomain = async (domainId: string) => {
    await runAction(
      () => deleteDomainDoc(domainId),
      'Domaine supprimé.'
    );
  };

  const handleCreatePurchaseOrder = async (
    po: SupplierPurchaseOrder,
    alsoCreateLots: boolean,
    nextPoSeq: number
  ) => {
    await runAction(async () => {
      await createPurchaseOrderDoc(po);
      if (alsoCreateLots && po.lines.length > 0) {
        const createdLots: SupplierLot[] = po.lines.map((line, idx) => ({
          id: sanitizeId(`lot_${po.poNumber}_${idx + 1}_${Date.now()}`, 'lot'),
          catalogId: line.catalogId,
          domaineId: po.domaineId,
          purchaseOrderId: po.id,
          dateAchat: po.date,
          typeAchat: 'allocation',
          qteCommandee: line.qte,
          qteRecue: 0,
          coutUnitaireHT: line.coutUnitaireHT,
          tvaRatePct: 20,
          shippingHT: 0,
          statutLot: 'commande_payee',
          referenceFacture: po.poNumber,
          paymentStatus: 'non_paye',
          origin: 'po_generated',
          notes: `Généré depuis ${po.poNumber} (${po.domaineName})`,
        }));
        await upsertLotsBatch(createdLots);
      }
      await saveSettingsDoc({ ...settings, nextPoSeq });
    }, `Bon de commande ${po.poNumber} créé${alsoCreateLots ? ' et lots fournisseurs générés.' : '.'}`);
  };

  const handleUpdatePurchaseOrder = async (po: SupplierPurchaseOrder) => {
    await runAction(
      () => updatePurchaseOrderDoc(po),
      `Bon de commande ${po.poNumber} mis à jour.`
    );
  };

  const handleDeletePurchaseOrder = async (poId: string) => {
    await runAction(
      () => deletePurchaseOrderDoc(poId),
      'Bon de commande supprimé.'
    );
  };

  const handleSaveLot = async (lot: SupplierLot) => {
    await runAction(
      () => upsertLotDoc({ ...lot, origin: lot.origin ?? 'manual' }),
      `Lot ${lot.referenceFacture} enregistré (${lot.qteCommandee} btl).`
    );
    setEditingLot(null);
  };

  const handleDeleteLot = async (lotId: string) => {
    await runAction(() => deleteLotDoc(lotId), 'Lot fournisseur supprimé.');
  };

  const handleToggleLotPayment = async (lot: SupplierLot) => {
    const nextStatus = lot.paymentStatus === 'paye' ? 'non_paye' : 'paye';
    const updated: SupplierLot = {
      ...lot,
      paymentStatus: nextStatus,
      paidAt: nextStatus === 'paye' ? nowIso().slice(0, 10) : undefined,
    };
    await runAction(
      () => upsertLotDoc(updated),
      nextStatus === 'paye'
        ? `Lot ${lot.referenceFacture} marqué réglé au domaine.`
        : `Lot ${lot.referenceFacture} repassé en non payé.`
    );
  };

  const handleReceiveLot = async (lotId: string) => {
    const targetLot = lots.find((l) => l.id === lotId);
    if (!targetLot) return;

    const nextReceived = targetLot.qteCommandee;
    const newlyReceivedDelta = Math.max(0, nextReceived - targetLot.qteRecue);

    await runAction(async () => {
      await upsertLotDoc({
        ...targetLot,
        qteRecue: nextReceived,
        statutLot: 'recu_cave',
      });

      let updatedCount = 0;
      if (newlyReceivedDelta > 0) {
        // FIFO attribution aux commandes clients en attente domaine
        const receivedTotalForCat =
          lots
            .filter((l) => l.catalogId === targetLot.catalogId && l.id !== lotId)
            .reduce((s, l) => s + l.qteRecue, 0) + nextReceived;

        const alreadyAllocatedOrDelivered = orders
          .filter(
            (o) =>
              o.catalogId === targetLot.catalogId &&
              (o.statut === 'recu_lbg' || o.statut === 'remis_client')
          )
          .reduce((s, o) => s + o.qte, 0);

        let availablePool = Math.max(
          0,
          receivedTotalForCat - alreadyAllocatedOrDelivered
        );

        const toPromote = orders
          .filter(
            (o) =>
              o.catalogId === targetLot.catalogId &&
              o.statut === 'attente_reception'
          )
          .sort((a, b) => a.date.localeCompare(b.date))
          .filter((o) => {
            if (availablePool >= o.qte) {
              availablePool -= o.qte;
              return true;
            }
            return false;
          })
          .map((o) => ({ ...o, statut: 'recu_lbg' as const }));

        if (toPromote.length > 0) {
          updatedCount = toPromote.length;
          await upsertOrdersBatch(toPromote);
        }
      }

      const cat = catalog.find((c) => c.id === targetLot.catalogId);
      notify(
        `Arrivage réceptionné (${nextReceived} btl · ${cat?.cuvee ?? ''})${
          updatedCount > 0
            ? ` · ${updatedCount} ligne(s) client passées en « Prêt LBG ».`
            : '.'
        }`
      );
    });
  };

  const handleAddAdjustment = async (adj: StockAdjustment) => {
    await runAction(
      () => createStockAdjustmentDoc(adj),
      `Mouvement de cave enregistré (${adj.qtyDelta > 0 ? `+${adj.qtyDelta}` : adj.qtyDelta} btl).`
    );
  };

  const handleDeleteAdjustment = async (adjId: string) => {
    await runAction(
      () => deleteStockAdjustmentDoc(adjId),
      'Mouvement supprimé du journal.'
    );
  };

  const handleAddDirectOrders = async (newOrders: OrderLine[]) => {
    const stamped = stampFrozenCosts(newOrders);
    await runAction(
      () => upsertOrdersBatch(stamped),
      `Commande ${stamped[0]?.refCommande ?? ''} enregistrée (${stamped.length} ligne${stamped.length > 1 ? 's' : ''}).`
    );
  };

  const handleUpdateOrder = async (order: OrderLine) => {
    await runAction(
      () => upsertOrderDoc(order),
      `Commande ${order.refCommande} mise à jour.`
    );
  };

  const handleDeleteOrder = async (orderId: string) => {
    const target = orders.find((o) => o.id === orderId);
    if (target?.locked) {
      notify('Impossible de supprimer une ligne facturée : émettez un avoir depuis Facturation & TVA.');
      return;
    }
    await runAction(() => deleteOrderDoc(orderId), 'Ligne de commande supprimée.');
  };

  const handleMarkCampaignDelivered = async (vente: string) => {
    const readyLines = orders
      .filter((o) => o.vente === vente && o.statut === 'recu_lbg')
      .map((o) => ({
        ...o,
        statut: 'remis_client' as const,
        qteRemise: o.qte,
      }));
    if (readyLines.length === 0) {
      notify('Aucune ligne « Prêt LBG » à remettre sur cette campagne.');
      return;
    }
    await runAction(
      () => upsertOrdersBatch(readyLines),
      `${readyLines.length} ligne(s) de « ${vente} » marquées remises aux clients.`
    );
  };

  const handleImportOrders = async (
    newOrders: OrderLine[],
    newCatalogItems: WineCatalogItem[]
  ) => {
    await runAction(async () => {
      for (const item of newCatalogItems) {
        await upsertCatalogDoc(item);
      }
      if (newOrders.length > 0) {
        const stamped = stampFrozenCosts(newOrders, newCatalogItems);
        await upsertOrdersBatch(stamped);
        const validBottles = stamped
          .filter((o) => o.statut !== 'annule')
          .reduce((s, o) => s + o.qte, 0);
        notify(
          `Import HelloAsso synchronisé : ${validBottles} bouteille(s) ajoutée(s) (${stamped.length} ligne(s)).`
        );
        setActiveTab('orders');
      } else {
        notify('Aucune nouvelle ligne à importer.');
      }
    });
  };

  const handleApplyInvoiceAchat = async (
    newLots: SupplierLot[],
    newCatalogItems: WineCatalogItem[],
    summaryText: string
  ) => {
    await runAction(async () => {
      for (const item of newCatalogItems) {
        await upsertCatalogDoc(item);
      }
      if (newLots.length > 0) {
        await upsertLotsBatch(
          newLots.map((l) => ({
            ...l,
            origin: l.origin ?? 'manual',
            paymentStatus: l.paymentStatus ?? 'non_paye',
          }))
        );
      }
      notify(summaryText);
      setActiveTab('stock');
    });
  };

  const handleApplyInvoiceVente = async (
    newOrders: OrderLine[],
    newCatalogItems: WineCatalogItem[],
    summaryText: string
  ) => {
    await runAction(async () => {
      for (const item of newCatalogItems) {
        await upsertCatalogDoc(item);
      }
      if (newOrders.length > 0) {
        await upsertOrdersBatch(stampFrozenCosts(newOrders, newCatalogItems));
      }
      notify(summaryText);
      setActiveTab('orders');
    });
  };

  const handleIssueInvoice = async (
    docItem: FiscalDocument,
    linkedOrderIds: string[],
    nextInvoiceSeq: number
  ) => {
    await runAction(async () => {
      await createFiscalDocumentDoc(docItem);
      const idSet = new Set(linkedOrderIds);
      const toLock = orders
        .filter((o) => idSet.has(o.id))
        .map((o) => ({
          ...o,
          invoiceId: docItem.id,
          invoiceNumber: docItem.invoiceNumber,
          locked: true,
        }));
      if (toLock.length > 0) {
        await upsertOrdersBatch(toLock);
      }
      await saveSettingsDoc({ ...settings, nextInvoiceSeq });
    }, `Facture ${docItem.invoiceNumber} émise et lignes verrouillées.`);
  };

  const handleIssueCreditNote = async (
    creditNote: FiscalDocument,
    originalInvoice: FiscalDocument,
    nextCreditNoteSeq: number
  ) => {
    await runAction(async () => {
      await createFiscalDocumentDoc(creditNote);
      await updateFiscalDocumentDoc({
        ...originalInvoice,
        creditNoteId: creditNote.id,
        creditNoteNumber: creditNote.invoiceNumber,
      });

      const affectedOrders = orders
        .filter(
          (o) =>
            o.invoiceId === originalInvoice.id ||
            o.invoiceNumber === originalInvoice.invoiceNumber
        )
        .map((o) => ({
          ...o,
          statut: 'annule' as const,
          paymentStatus: 'rembourse' as const,
          creditNoteId: creditNote.id,
          creditNoteNumber: creditNote.invoiceNumber,
        }));

      if (affectedOrders.length > 0) {
        await upsertOrdersBatch(affectedOrders);
      }
      await saveSettingsDoc({ ...settings, nextCreditNoteSeq });
    }, `Avoir ${creditNote.invoiceNumber} émis sur ${originalInvoice.invoiceNumber}. Stock libéré.`);
  };

  const handleMarkInvoicePaid = async (invoice: FiscalDocument) => {
    const today = nowIso().slice(0, 10);
    await runAction(async () => {
      await updateFiscalDocumentDoc({
        ...invoice,
        paymentStatus: 'paye',
        paidAt: today,
      });
      const linked = orders
        .filter(
          (o) =>
            o.invoiceId === invoice.id ||
            o.invoiceNumber === invoice.invoiceNumber
        )
        .map((o) => ({
          ...o,
          paymentStatus: 'paye' as const,
          paidAt: today,
          amountPaidTTC: o.prixUnitaireTTC * o.qte + (o.shippingFeeClientTTC ?? 0),
        }));
      if (linked.length > 0) {
        await upsertOrdersBatch(linked);
      }
    }, `Facture ${invoice.invoiceNumber} marquée réglée.`);
  };

  const handleSaveCustomerProfile = async (profile: CustomerProfile) => {
    await runAction(
      () => upsertCustomerDoc(profile),
      `Fiche client « ${profile.companyName || `${profile.prenom} ${profile.nom}`.trim()} » enregistrée.`
    );
  };

  const handleMergeCustomers = async (
    source: CustomerSummary,
    target: CustomerSummary
  ) => {
    await runAction(async () => {
      const mergedEmailsSet = new Set<string>([
        ...(target.mergedEmails ?? []),
        ...(source.mergedEmails ?? []),
      ]);
      const sourceEmail = source.email.trim().toLowerCase();
      const targetEmail = target.email.trim().toLowerCase();
      if (sourceEmail && sourceEmail !== targetEmail) {
        mergedEmailsSet.add(sourceEmail);
      }

      const targetProfile: CustomerProfile = {
        id:
          target.profileId ??
          sanitizeId(`cust_${targetEmail || `${target.nom}_${target.prenom}`}`, 'cust'),
        customerType: target.customerType,
        nom: target.nom,
        prenom: target.prenom,
        companyName: target.companyName ?? source.companyName,
        siret: target.siret ?? source.siret,
        vatNumber: target.vatNumber ?? source.vatNumber,
        email: target.email || source.email,
        phone: target.phone ?? source.phone,
        billingAddress: target.billingAddress ?? source.billingAddress,
        shippingAddress: target.shippingAddress ?? source.shippingAddress,
        notes: [target.notes, source.notes].filter(Boolean).join('\n'),
        mergedEmails: Array.from(mergedEmailsSet),
      };

      await upsertCustomerDoc(targetProfile);

      // Re-link unlocked orders from source to target
      const unlockedSourceOrders = source.orders
        .filter((o) => !o.locked)
        .map((o) => ({
          ...o,
          customerId: targetProfile.id,
          emailClient: targetProfile.email || o.emailClient,
          nomClient: targetProfile.nom || o.nomClient,
          prenomClient: targetProfile.prenom || o.prenomClient,
        }));

      if (unlockedSourceOrders.length > 0) {
        await upsertOrdersBatch(unlockedSourceOrders);
      }

      if (source.profileId && source.profileId !== targetProfile.id) {
        await deleteCustomerDoc(source.profileId);
      }
    }, `Doublon fusionné dans la fiche de ${target.prenom} ${target.nom}.`);
  };

  const handleMarkCustomerReadyDelivered = async (customer: CustomerSummary) => {
    const ready = customer.orders
      .filter((o) => o.statut === 'recu_lbg')
      .map((o) => ({
        ...o,
        statut: 'remis_client' as const,
        qteRemise: o.qte,
      }));
    if (ready.length === 0) return;
    const totalBtl = ready.reduce((s, o) => s + o.qte, 0);
    await runAction(
      () => upsertOrdersBatch(ready),
      `${totalBtl} bouteille(s) marquée(s) comme remise(s) à ${customer.prenom} ${customer.nom}.`
    );
  };

  const handleSaveCatalogItem = async (item: WineCatalogItem) => {
    await runAction(
      () => upsertCatalogDoc(item),
      `Cuvée « ${item.domaine} — ${item.cuvee} » enregistrée.`
    );
  };

  const handleDeleteCatalogItem = async (catalogId: string) => {
    await runAction(
      () => deleteCatalogDoc(catalogId),
      'Cuvée supprimée du catalogue.'
    );
  };

  const handleSaveExpense = async (expense: OperatingExpense) => {
    await runAction(
      () => upsertExpenseDoc(expense),
      `Charge « ${expense.label} » enregistrée.`
    );
  };

  const handleDeleteExpense = async (expenseId: string) => {
    await runAction(() => deleteExpenseDoc(expenseId), 'Charge supprimée.');
  };

  // --- Team Management Handlers ---
  const handleCreateInvite = async (email: string, role: 'admin' | 'operator') => {
    if (!firebaseUser) return;
    await runAction(
      () => createInviteDoc(email, role, firebaseUser.uid),
      `Invitation envoyée pour ${email.trim().toLowerCase()}.`
    );
  };

  const handleDeleteInvite = async (email: string) => {
    await runAction(
      () => deleteInviteDoc(email),
      `Invitation pour ${email} révoquée.`
    );
  };

  const handleUpdateMemberRole = async (
    member: WorkspaceMember,
    role: 'admin' | 'operator'
  ) => {
    await runAction(
      () => updateMemberRoleDoc(member, role),
      `Rôle de ${member.displayName} mis à jour.`
    );
  };

  const handleRemoveMember = async (uid: string) => {
    await runAction(() => removeMemberDoc(uid), 'Accès membre retiré.');
  };

  // --- Backup, Reset & Demo ---
  const handleExportBackup = () => {
    const payload = {
      version: 'lbg-v2',
      exportedAt: nowIso(),
      settings,
      domains,
      catalog,
      lots,
      stockAdjustments,
      customers: customerProfiles,
      orders,
      invoices,
      purchaseOrders,
      campaigns,
      expenses,
    };
    const blob = new Blob([JSON.stringify(payload, null, 2)], {
      type: 'application/json;charset=utf-8',
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `lbg_backup_${nowIso().slice(0, 10)}.json`;
    a.click();
    URL.revokeObjectURL(url);
    notify('Sauvegarde JSON complète téléchargée.');
  };

  const handleImportBackup = async (file: File) => {
    await runAction(async () => {
      const text = await file.text();
      const parsed = JSON.parse(text) as WorkspaceSeedBundle;
      await seedWorkspaceBundle(parsed);
    }, 'Sauvegarde JSON restaurée dans la base cloud.');
  };

  const handleResetExcel = async () => {
    await runAction(async () => {
      const derivedDomains = deriveInitialDomains(INITIAL_CATALOG);
      const derivedCustomers = deriveInitialCustomers(INITIAL_ORDERS);
      const stampedOrders = stampFrozenCosts(INITIAL_ORDERS, INITIAL_CATALOG);
      await seedWorkspaceBundle(
        {
          settings: {
            ...DEFAULT_SETTINGS,
            companyName: settings.companyName,
            companyLegalForm: settings.companyLegalForm,
            companyCapital: settings.companyCapital,
            companyAddress: settings.companyAddress,
            companySiret: settings.companySiret,
            companyRcs: settings.companyRcs,
            companyVatNumber: settings.companyVatNumber,
            companyIban: settings.companyIban,
            companyBic: settings.companyBic,
            companyEmail: settings.companyEmail,
            companyPhone: settings.companyPhone,
            companyWebsite: settings.companyWebsite,
            companyLegalLine: settings.companyLegalLine,
            nextInvoiceSeq: settings.nextInvoiceSeq,
            nextCreditNoteSeq: settings.nextCreditNoteSeq,
            nextPoSeq: settings.nextPoSeq,
          },
          domains: derivedDomains,
          catalog: INITIAL_CATALOG,
          lots: INITIAL_LOTS,
          customers: derivedCustomers,
          orders: stampedOrders,
          campaigns: INITIAL_CAMPAIGNS,
        },
        { clearMutableCollections: true }
      );
    }, 'Données Excel initiales restaurées (factures officielles préservées).');
  };

  const handleToggleDemo = async () => {
    if (isDemoActive) {
      const demoIds = lots.filter((l) => l.origin === 'demo').map((l) => l.id);
      await runAction(
        () => deleteLotsBatch(demoIds),
        'Lots démo retirés. Données strictes affichées.'
      );
    } else {
      const existingIds = new Set(lots.map((l) => l.id));
      const toAdd = DEMO_EXTRA_LOTS.filter((l) => !existingIds.has(l.id));
      if (toAdd.length > 0) {
        await runAction(
          () => upsertLotsBatch(toAdd),
          'Scénario Démo activé (+ lots Tissot, Sursis, Pataille, Belargus, Deiss).'
        );
      }
    }
  };

  const handleExecuteAssistantAction = (action: AssistantAction) => {
    switch (action.type) {
      case 'navigate':
        setActiveTab(action.tab);
        break;
      case 'prefill_direct_order':
        setDirectOrderModalOpen(true);
        break;
      case 'prefill_supplier_lot':
        setEditingLot(null);
        setSupplierLotModalOpen(true);
        break;
      case 'prefill_catalog_item':
        setActiveTab('catalog');
        break;
      case 'open_modal':
        if (action.modal === 'import_helloasso') setImportModalOpen(true);
        if (action.modal === 'invoice_ai') setInvoiceAIModalOpen(true);
        break;
      case 'copy_text':
        void copyTextToClipboard(action.text);
        notify(`${action.label} copié dans le presse-papiers.`);
        break;
    }
  };

  // --- Auth & Initial Seed Gates ---
  if (!authReady || accessState === 'checking') {
    return (
      <AuthGate
        mode="loading"
        onSignIn={handleSignIn}
        onSignOut={handleSignOut}
      />
    );
  }

  if (!firebaseUser) {
    return (
      <AuthGate
        mode="login"
        authError={authError}
        authNotice={authNotice}
        onSignIn={handleSignIn}
        onEmailSignIn={handleEmailSignIn}
        onEmailSignUp={handleEmailSignUp}
        onPasswordReset={handlePasswordReset}
        onSignOut={handleSignOut}
      />
    );
  }

  if (accessState === 'verify_email') {
    return (
      <AuthGate
        mode="verify_email"
        userEmail={firebaseUser.email ?? undefined}
        authError={authError}
        authNotice={authNotice}
        onSignIn={handleSignIn}
        onCheckEmailVerified={handleCheckEmailVerified}
        onResendVerification={handleResendVerification}
        onSignOut={handleSignOut}
      />
    );
  }

  if (accessState === 'unauthorized' || !currentMember) {
    return (
      <AuthGate
        mode="unauthorized"
        userEmail={firebaseUser.email ?? undefined}
        authError={authError}
        onSignIn={handleSignIn}
        onSignOut={handleSignOut}
      />
    );
  }

  if (!initialLoadDone) {
    return (
      <AuthGate
        mode="loading"
        onSignIn={handleSignIn}
        onSignOut={handleSignOut}
      />
    );
  }

  if (catalog.length === 0 && orders.length === 0 && !userSkippedSeed) {
    return (
      <AuthGate
        mode="first_seed"
        userEmail={firebaseUser.email ?? undefined}
        authError={authError}
        hasLocalStorageBackup={legacyLocal.hasData}
        localBackupStats={{
          catalog: legacyLocal.catalog.length,
          orders: legacyLocal.orders.length,
          lots: legacyLocal.lots.length,
        }}
        seedingBusy={seedingBusy}
        onSignIn={handleSignIn}
        onSignOut={handleSignOut}
        onMigrateLocal={handleMigrateLocal}
        onSeedExcel={handleSeedExcel}
        onStartEmpty={handleStartEmpty}
      />
    );
  }

  return (
    <div className="min-h-screen flex bg-[#F6F6F4] text-[#141413]">
      {/* Mobile Drawer Backdrop */}
      {mobileNavOpen && (
        <div
          className="fixed inset-0 z-40 bg-black/40 lg:hidden no-print"
          onClick={() => setMobileNavOpen(false)}
        />
      )}

      {/* Left Sidebar (256px) */}
      <aside
        className={`fixed inset-y-0 left-0 z-50 w-64 bg-white border-r border-[#E5E4DF] flex flex-col transition-transform duration-200 lg:static lg:translate-x-0 no-print ${
          mobileNavOpen ? 'translate-x-0' : '-translate-x-full'
        }`}
      >
        <div className="h-16 px-4 flex items-center justify-between border-b border-[#E5E4DF]">
          <button
            onClick={() => {
              setActiveTab('dashboard');
              setMobileNavOpen(false);
            }}
            className="flex items-center gap-2.5 text-left focus:outline-none min-w-0"
          >
            <img
              src="/logo-lbg.png"
              alt="Logo Le Bon Grain d’Ivresse"
              className="w-9 h-9 rounded-lg object-cover border border-[#E5E4DF] shadow-xs shrink-0"
            />
            <span className="font-display text-lg font-semibold tracking-tight text-[#141413] truncate">
              Le Bon Grain d’Ivresse
            </span>
          </button>
          <button
            onClick={() => setMobileNavOpen(false)}
            className="lg:hidden p-1.5 text-[#6B6B66] hover:text-[#141413]"
            aria-label="Fermer le menu"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <nav className="flex-1 px-3 py-4 space-y-5 overflow-y-auto">
          {NAV_GROUPS.map((group) => (
            <div key={group.title} className="space-y-1">
              <div className="px-3 text-[11px] font-semibold uppercase tracking-wider text-[#9E9B93]">
                {group.title}
              </div>
              {group.items.map((item) => {
                const Icon = item.icon;
                const isActive = activeTab === item.id;
                const countHint =
                  item.id === 'orders' && pendingOrdersCount > 0
                    ? pendingOrdersCount
                    : item.id === 'stock' && availableBottlesCount > 0
                      ? availableBottlesCount
                      : item.id === 'domains' && deficitDomainsCount > 0
                        ? deficitDomainsCount
                        : null;

                return (
                  <button
                    key={item.id}
                    onClick={() => {
                      setActiveTab(item.id);
                      setMobileNavOpen(false);
                    }}
                    className={`w-full flex items-center justify-between gap-2 px-3 py-2 text-sm font-medium rounded-lg transition-colors whitespace-nowrap ${
                      isActive
                        ? 'bg-[#721C24]/10 text-[#721C24]'
                        : 'text-[#6B6B66] hover:text-[#141413] hover:bg-[#F6F6F4]'
                    }`}
                  >
                    <span className="flex items-center gap-3 min-w-0">
                      <Icon
                        className={`w-4 h-4 shrink-0 ${
                          isActive ? 'text-[#721C24]' : 'text-[#6B6B66]'
                        }`}
                      />
                      <span className="truncate">{item.label}</span>
                    </span>
                    {countHint !== null && (
                      <span
                        className={`text-[11px] font-mono-num ${
                          item.id === 'domains' ? 'text-[#B91C1C] font-semibold' : 'text-[#6B6B66]'
                        }`}
                      >
                        {countHint}
                      </span>
                    )}
                  </button>
                );
              })}
            </div>
          ))}
        </nav>

        <div className="p-4 border-t border-[#E5E4DF] space-y-2.5">
          <div className="flex items-center justify-between gap-2">
            <div className="text-xs text-[#6B6B66] min-w-0">
              <div className="font-medium text-[#141413] truncate">
                {currentMember.displayName}
              </div>
              <div className="truncate text-[11px]">{currentMember.email}</div>
            </div>
            <button
              type="button"
              onClick={() => void handleSignOut()}
              title="Se déconnecter"
              className="p-1.5 text-[#6B6B66] hover:text-[#B91C1C] hover:bg-[#FEF2F2] rounded-md transition-colors shrink-0"
            >
              <LogOut className="w-4 h-4" />
            </button>
          </div>
          <div className="flex items-center justify-between text-[11px] text-[#6B6B66] pt-1 border-t border-[#F0EFEA]">
            <span className="inline-flex items-center gap-1.5 text-[#15803D]">
              <Cloud className="w-3.5 h-3.5" />
              <span>Synchronisé</span>
            </span>
            <span className="font-medium">
              {currentMember.role === 'admin' ? 'Admin' : 'Opérateur'}
            </span>
          </div>
          {isDemoActive && (
            <button
              type="button"
              onClick={() => void handleToggleDemo()}
              className="w-full text-left px-2.5 py-1.5 text-[11px] font-medium text-[#721C24] bg-[#721C24]/10 border border-[#721C24]/25 rounded-md hover:bg-[#721C24]/15 transition-colors flex items-center justify-between"
            >
              <span>Mode Démo actif</span>
              <span className="underline">Retirer</span>
            </button>
          )}
        </div>
      </aside>

      {/* Main Content Area */}
      <div className="flex-1 flex flex-col min-w-0">
        {/* Top Bar */}
        <header className="h-16 bg-white border-b border-[#E5E4DF] px-4 sm:px-6 flex items-center justify-between gap-3 sticky top-0 z-30 no-print">
          <div className="flex items-center gap-2.5 min-w-0">
            <button
              onClick={() => setMobileNavOpen(true)}
              className="lg:hidden p-2 -ml-2 text-[#6B6B66] hover:text-[#141413] rounded-lg"
              aria-label="Ouvrir le menu"
            >
              <Menu className="w-5 h-5" />
            </button>
            <img
              src="/logo-lbg.png"
              alt="Le Bon Grain d’Ivresse"
              className="w-7 h-7 rounded-md object-cover border border-[#E5E4DF] lg:hidden shrink-0"
            />
            <div className="flex items-center gap-2 text-sm truncate">
              <span className="text-[#6B6B66] hidden sm:inline whitespace-nowrap">
                {settings.companyName || 'Le Bon Grain d’Ivresse'}
              </span>
              <span aria-hidden="true" className="text-[#C7C5BE] hidden sm:inline">
                /
              </span>
              <span className="font-medium text-[#141413] truncate">
                {activeNavLabel}
              </span>
            </div>
          </div>

          <div className="flex items-center gap-2 shrink-0">
            <button
              onClick={() => setAssistantOpen(true)}
              className="inline-flex items-center gap-1.5 px-2.5 sm:px-3.5 py-2 text-xs font-medium text-[#721C24] bg-[#721C24]/8 hover:bg-[#721C24]/15 border border-[#721C24]/25 rounded-lg transition-colors whitespace-nowrap shrink-0"
              title="Ouvrir l’Assistant Négoce IA (⌘K)"
            >
              <Bot className="w-3.5 h-3.5" />
              <span>Assistant IA</span>
              <kbd className="hidden md:inline-block ml-1 px-1 py-0.5 text-[10px] font-mono-num bg-white/80 border border-[#721C24]/20 rounded">
                ⌘K
              </kbd>
            </button>
            <button
              onClick={() => setInvoiceAIModalOpen(true)}
              className="inline-flex items-center gap-1.5 px-2.5 sm:px-3.5 py-2 text-xs font-medium text-[#141413] bg-[#FAF9F7] hover:bg-[#ECEAE4] border border-[#D8D6D0] rounded-lg transition-colors whitespace-nowrap shrink-0"
            >
              <Sparkles className="w-3.5 h-3.5 text-[#721C24]" />
              <span>Facture IA</span>
            </button>
            <button
              onClick={() => setImportModalOpen(true)}
              className="inline-flex items-center gap-1.5 sm:gap-2 px-3 sm:px-4 py-2 text-xs font-medium text-white bg-[#721C24] hover:bg-[#5B151C] rounded-lg transition-colors whitespace-nowrap shrink-0"
            >
              <ClipboardPaste className="w-3.5 h-3.5" />
              <span className="hidden sm:inline">Importer HelloAsso</span>
              <span className="sm:hidden">HelloAsso</span>
            </button>
          </div>
        </header>

        {/* Cloud Error Banner */}
        {cloudError && (
          <div className="mx-6 mt-4 px-4 py-3 bg-[#FEF2F2] border border-[#FECACA] text-[#B91C1C] text-xs rounded-lg flex items-center justify-between gap-4 no-print">
            <div className="flex items-center gap-2 min-w-0">
              <AlertTriangle className="w-4 h-4 shrink-0" />
              <span className="truncate">{cloudError}</span>
            </div>
            <button
              onClick={() => setCloudError(null)}
              className="text-[#B91C1C]/70 hover:text-[#B91C1C] shrink-0"
              aria-label="Fermer l’erreur"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        )}

        {/* Toast Notification */}
        {toastMessage && (
          <div className="mx-6 mt-4 px-4 py-3 bg-[#141413] text-white text-sm rounded-lg flex items-center justify-between gap-4 shadow-lg no-print">
            <span>{toastMessage}</span>
            <button
              onClick={() => setToastMessage(null)}
              className="text-white/70 hover:text-white"
              aria-label="Fermer la notification"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        )}

        {/* Active View Viewport */}
        <main className="flex-1 p-6 lg:p-8 max-w-[1440px] w-full mx-auto">
          {activeTab === 'dashboard' && (
            <DashboardView
              catalog={catalog}
              lots={lots}
              orders={orders}
              stockRows={stockRows}
              campaigns={campaigns}
              settings={settings}
              onNavigate={setActiveTab}
              onSaveCampaign={handleSaveCampaign}
              onDeleteCampaign={handleDeleteCampaign}
            />
          )}

          {activeTab === 'stock' && (
            <StockView
              stockRows={stockRows}
              lots={lots}
              adjustments={stockAdjustments}
              catalog={catalog}
              currentUserUid={firebaseUser.uid}
              isAdmin={currentMember.role === 'admin'}
              onReceiveLot={handleReceiveLot}
              onEditLot={(lot) => {
                setEditingLot(lot);
                setSupplierLotModalOpen(true);
              }}
              onToggleLotPayment={handleToggleLotPayment}
              onDeleteLot={handleDeleteLot}
              onAddAdjustment={handleAddAdjustment}
              onDeleteAdjustment={handleDeleteAdjustment}
              onOpenNewLotModal={() => {
                setEditingLot(null);
                setSupplierLotModalOpen(true);
              }}
              onOpenInvoiceAI={() => setInvoiceAIModalOpen(true)}
            />
          )}

          {activeTab === 'domains' && (
            <DomainsView
              domains={domains}
              catalog={catalog}
              stockRows={stockRows}
              lots={lots}
              purchaseOrders={purchaseOrders}
              settings={settings}
              currentUserUid={firebaseUser.uid}
              onSaveDomain={handleSaveDomain}
              onDeleteDomain={handleDeleteDomain}
              onCreatePurchaseOrder={handleCreatePurchaseOrder}
              onUpdatePurchaseOrder={handleUpdatePurchaseOrder}
              onDeletePurchaseOrder={handleDeletePurchaseOrder}
            />
          )}

          {activeTab === 'orders' && (
            <OrdersView
              orders={orders}
              catalog={catalog}
              settings={settings}
              onUpdateOrder={handleUpdateOrder}
              onDeleteOrder={handleDeleteOrder}
              onMarkCampaignDelivered={handleMarkCampaignDelivered}
              onOpenImportHelloAsso={() => setImportModalOpen(true)}
              onOpenNewDirectOrder={() => setDirectOrderModalOpen(true)}
            />
          )}

          {activeTab === 'finance' && (
            <FinanceView
              orders={orders}
              catalog={catalog}
              lots={lots}
              stockRows={stockRows}
              adjustments={stockAdjustments}
              expenses={expenses}
              invoices={invoices}
              settings={settings}
              currentUserUid={firebaseUser.uid}
              onSaveExpense={handleSaveExpense}
              onDeleteExpense={handleDeleteExpense}
            />
          )}

          {activeTab === 'accounting' && (
            <AccountingView
              orders={orders}
              catalog={catalog}
              lots={lots}
              customers={customerSummaries}
              invoices={invoices}
              expenses={expenses}
              settings={settings}
              currentUserUid={firebaseUser.uid}
              onIssueInvoice={handleIssueInvoice}
              onIssueCreditNote={handleIssueCreditNote}
              onMarkInvoicePaid={handleMarkInvoicePaid}
            />
          )}

          {activeTab === 'clients' && (
            <ClientsView
              customers={customerSummaries}
              settings={settings}
              onSaveCustomerProfile={handleSaveCustomerProfile}
              onMergeCustomers={handleMergeCustomers}
              onMarkCustomerReadyDelivered={handleMarkCustomerReadyDelivered}
            />
          )}

          {activeTab === 'catalog' && (
            <CatalogView
              catalog={catalog}
              settings={settings}
              onSaveCatalogItem={handleSaveCatalogItem}
              onDeleteCatalogItem={handleDeleteCatalogItem}
            />
          )}

          {activeTab === 'winelist' && (
            <WineListView
              stockRows={stockRows}
              settings={settings}
              onUpdateSettings={handleSaveSettings}
            />
          )}

          {activeTab === 'settings' && (
            <SettingsView
              settings={settings}
              members={members}
              invites={invites}
              currentMember={currentMember}
              isDemoActive={isDemoActive}
              onSaveSettings={handleSaveSettings}
              onCreateInvite={handleCreateInvite}
              onDeleteInvite={handleDeleteInvite}
              onUpdateMemberRole={handleUpdateMemberRole}
              onRemoveMember={handleRemoveMember}
              onExportBackup={handleExportBackup}
              onImportBackup={handleImportBackup}
              onResetExcel={handleResetExcel}
              onToggleDemo={handleToggleDemo}
            />
          )}
        </main>
      </div>

      {/* Modals */}
      <ImportHelloAssoModal
        isOpen={importModalOpen}
        onClose={() => setImportModalOpen(false)}
        catalog={catalog}
        existingRefs={existingRefs}
        onImportOrders={(newOrders, newCat) => {
          void handleImportOrders(newOrders, newCat);
        }}
      />

      <InvoiceAIModal
        isOpen={invoiceAIModalOpen}
        onClose={() => setInvoiceAIModalOpen(false)}
        catalog={catalog}
        existingInvoiceRefs={existingInvoiceRefs}
        onApplyAchat={(newLots, newCat, summary) => {
          void handleApplyInvoiceAchat(newLots, newCat, summary);
        }}
        onApplyVente={(newOrders, newCat, summary) => {
          void handleApplyInvoiceVente(newOrders, newCat, summary);
        }}
      />

      {directOrderModalOpen && (
        <NewDirectOrderModal
          catalog={catalog}
          stockRows={stockRows}
          customers={customerSummaries}
          settings={settings}
          onClose={() => setDirectOrderModalOpen(false)}
          onAddOrders={handleAddDirectOrders}
        />
      )}

      {supplierLotModalOpen && (
        <NewSupplierLotModal
          catalog={catalog}
          initialLot={editingLot}
          onClose={() => {
            setSupplierLotModalOpen(false);
            setEditingLot(null);
          }}
          onSaveLot={handleSaveLot}
        />
      )}

      <AssistantPanel
        isOpen={assistantOpen}
        onClose={() => setAssistantOpen(false)}
        ctx={{
          catalog,
          lots,
          orders,
          campaigns,
          settings,
          activeTab,
        }}
        tabLabel={activeNavLabel}
        onExecuteAction={handleExecuteAssistantAction}
        threads={assistantThreads}
        currentUserUid={firebaseUser.uid}
        userDisplayName={currentMember.displayName}
        onSaveThread={async (thread) => {
          await upsertAssistantThreadDoc(thread);
        }}
        onDeleteThread={async (threadId) => {
          await deleteAssistantThreadDoc(threadId);
        }}
      />
    </div>
  );
}
