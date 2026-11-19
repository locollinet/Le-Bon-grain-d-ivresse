import React, { useMemo, useState } from 'react';
import {
  FileText,
  Printer,
  Download,
  Lock,
  RotateCcw,
  CheckCircle2,
  X,
  AlertTriangle,
  Wallet,
} from 'lucide-react';
import {
  AppSettings,
  CustomerSummary,
  FiscalCompanySnapshot,
  FiscalCustomerSnapshot,
  FiscalDocument,
  FiscalDocumentLine,
  OperatingExpense,
  OrderLine,
  PaymentStatus,
  SupplierLot,
  WineCatalogItem,
} from '../types/wine';
import {
  computeNextDocNumber,
  formatDateFR,
  formatEUR,
  getEffectiveOrderPaymentStatus,
  maskClientName,
  normalizeSearchText,
} from '../utils/wineMath';

interface AccountingViewProps {
  orders: OrderLine[];
  catalog: WineCatalogItem[];
  lots: SupplierLot[];
  customers: CustomerSummary[];
  invoices: FiscalDocument[];
  expenses: OperatingExpense[];
  settings: AppSettings;
  currentUserUid: string;
  onIssueInvoice: (
    docItem: FiscalDocument,
    linkedOrderIds: string[],
    nextInvoiceSeq: number
  ) => Promise<void>;
  onIssueCreditNote: (
    creditNote: FiscalDocument,
    originalInvoice: FiscalDocument,
    nextCreditNoteSeq: number
  ) => Promise<void>;
  onMarkInvoicePaid: (invoice: FiscalDocument) => Promise<void>;
}

const PAYMENT_STATUS_LABEL: Record<PaymentStatus, string> = {
  en_attente: 'En attente de règlement',
  partiel: 'Acompte reçu — Solde dû',
  paye: 'Règlement effectué',
  rembourse: 'Remboursé / Annulé par avoir',
};

export const AccountingView: React.FC<AccountingViewProps> = ({
  orders,
  catalog,
  lots,
  customers,
  invoices,
  expenses,
  settings,
  currentUserUid,
  onIssueInvoice,
  onIssueCreditNote,
  onMarkInvoicePaid,
}) => {
  const [subTab, setSubTab] = useState<'pending' | 'issued' | 'vat'>('pending');
  const [previewDoc, setPreviewDoc] = useState<FiscalDocument | null>(null);
  const [busyRef, setBusyRef] = useState<string | null>(null);
  const [confirmCreditNote, setConfirmCreditNote] =
    useState<FiscalDocument | null>(null);

  const catalogMap = useMemo(
    () => new Map(catalog.map((c) => [c.id, c])),
    [catalog]
  );

  // Group non-cancelled, non-perso, non-invoiced orders by refCommande
  const pendingOrdersByRef = useMemo(() => {
    const map = new Map<string, OrderLine[]>();
    for (const o of orders) {
      if (o.statut === 'annule' || o.source === 'perso' || o.invoiceId) continue;
      const arr = map.get(o.refCommande) ?? [];
      arr.push(o);
      map.set(o.refCommande, arr);
    }
    return Array.from(map.entries())
      .map(([ref, lines]) => {
        const totalTTC = lines.reduce(
          (s, l) => s + l.prixUnitaireTTC * l.qte + (l.shippingFeeClientTTC ?? 0),
          0
        );
        const totalBottles = lines.reduce((s, l) => s + l.qte, 0);
        const first = lines[0];
        return {
          refCommande: ref,
          date: first.date,
          vente: first.vente,
          nomClient: first.nomClient,
          prenomClient: first.prenomClient,
          emailClient: first.emailClient,
          paymentStatus: getEffectiveOrderPaymentStatus(first),
          totalBottles,
          totalTTC,
          lines,
        };
      })
      .sort((a, b) => b.date.localeCompare(a.date));
  }, [orders]);

  const sortedInvoices = useMemo(
    () =>
      [...invoices].sort(
        (a, b) =>
          b.date.localeCompare(a.date) ||
          b.invoiceNumber.localeCompare(a.invoiceNumber)
      ),
    [invoices]
  );

  // VAT computation (net of credit notes!)
  const vatSummary = useMemo(() => {
    // 1. TVA collectée : factures émises + avoirs (négatifs) + ventes valides non encore facturées
    let tvaCollecteeFacturee = 0;
    let caFactureHT = 0;
    for (const doc of invoices) {
      tvaCollecteeFacturee += doc.totalTVA;
      caFactureHT += doc.totalHT;
    }

    let tvaCollecteeNonFacturee = 0;
    for (const o of orders) {
      if (o.statut === 'annule' || o.source === 'perso' || o.invoiceId) continue;
      const tvaRate =
        o.tvaRatePct !== undefined ? o.tvaRatePct / 100 : settings.tvaRate;
      const ttc = o.prixUnitaireTTC * o.qte + (o.shippingFeeClientTTC ?? 0);
      tvaCollecteeNonFacturee += ttc - ttc / (1 + tvaRate);
    }

    // 2. TVA déductible sur lots fournisseurs + charges d'exploitation
    const tvaDeductibleLots = lots.reduce((s, l) => {
      const rate = (l.tvaRatePct ?? 20) / 100;
      const ht = l.coutUnitaireHT * l.qteCommandee + (l.shippingHT ?? 0);
      return s + ht * rate;
    }, 0);

    const tvaDeductibleCharges = expenses.reduce(
      (s, e) => s + e.amountHT * (e.tvaRatePct / 100),
      0
    );

    const tvaCollecteeTotale = tvaCollecteeFacturee + tvaCollecteeNonFacturee;
    const tvaDeductibleTotale = tvaDeductibleLots + tvaDeductibleCharges;
    const soldeTva = tvaCollecteeTotale - tvaDeductibleTotale;

    return {
      caFactureHT,
      tvaCollecteeFacturee,
      tvaCollecteeNonFacturee,
      tvaCollecteeTotale,
      tvaDeductibleLots,
      tvaDeductibleCharges,
      tvaDeductibleTotale,
      soldeTva,
    };
  }, [invoices, orders, lots, expenses, settings.tvaRate]);

  const buildCompanySnapshot = (): FiscalCompanySnapshot => ({
    companyName: settings.companyName || "Le Bon Grain d'Ivresse",
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
  });

  const handleEmitInvoice = async (group: (typeof pendingOrdersByRef)[number]) => {
    setBusyRef(group.refCommande);
    try {
      const { docNumber, nextSeq } = computeNextDocNumber(
        'FA',
        invoices.filter((i) => i.docType === 'facture').map((i) => i.invoiceNumber),
        new Date().getFullYear(),
        settings.nextInvoiceSeq ?? 1
      );

      const first = group.lines[0];
      const matchedCustomer = customers.find(
        (c) =>
          (first.customerId && c.profileId === first.customerId) ||
          (first.emailClient &&
            c.email.toLowerCase() === first.emailClient.toLowerCase()) ||
          normalizeSearchText(`${c.nom}_${c.prenom}`) ===
            normalizeSearchText(`${first.nomClient}_${first.prenomClient}`)
      );

      const customerSnapshot: FiscalCustomerSnapshot = {
        customerType: matchedCustomer?.customerType ?? 'particulier',
        nom: matchedCustomer?.nom || first.nomClient,
        prenom: matchedCustomer?.prenom || first.prenomClient,
        companyName: matchedCustomer?.companyName,
        siret: matchedCustomer?.siret,
        vatNumber: matchedCustomer?.vatNumber,
        email: matchedCustomer?.email || first.emailClient,
        phone: matchedCustomer?.phone,
        billingAddress:
          matchedCustomer?.billingAddress || first.deliveryAddress,
        shippingAddress:
          matchedCustomer?.shippingAddress || first.deliveryAddress,
      };

      let totalHT = 0;
      let totalTVA = 0;
      let totalTTC = 0;
      let shippingTTC = 0;

      const docLines: FiscalDocumentLine[] = group.lines.map((l) => {
        const cat = catalogMap.get(l.catalogId);
        const tvaRatePct = l.tvaRatePct ?? Math.round(settings.tvaRate * 100);
        const lineTTC = Number((l.prixUnitaireTTC * l.qte).toFixed(2));
        const lineHT = Number((lineTTC / (1 + tvaRatePct / 100)).toFixed(2));
        const lineTVA = Number((lineTTC - lineHT).toFixed(2));
        shippingTTC += l.shippingFeeClientTTC ?? 0;
        totalHT += lineHT;
        totalTVA += lineTVA;
        totalTTC += lineTTC;
        return {
          orderId: l.id,
          catalogId: l.catalogId,
          domaine: cat?.domaine ?? '',
          cuvee: cat?.cuvee ?? l.produitLabel,
          millesime: cat?.millesime,
          format: cat?.format || '75 cl',
          qte: l.qte,
          prixUnitaireTTC: l.prixUnitaireTTC,
          tvaRatePct,
          totalHT: lineHT,
          totalTVA: lineTVA,
          totalTTC: lineTTC,
        };
      });

      if (shippingTTC > 0) {
        const shipHT = Number((shippingTTC / (1 + settings.tvaRate)).toFixed(2));
        const shipTVA = Number((shippingTTC - shipHT).toFixed(2));
        totalHT += shipHT;
        totalTVA += shipTVA;
        totalTTC += shippingTTC;
      }

      const today = new Date().toISOString().slice(0, 10);
      const paymentStatus = getEffectiveOrderPaymentStatus(first);
      const newDoc: FiscalDocument = {
        id: `inv_${Date.now()}`,
        docType: 'facture',
        invoiceNumber: docNumber,
        refCommande: group.refCommande,
        date: today,
        dueDate: paymentStatus === 'paye' ? today : undefined,
        vente: group.vente,
        customerId: matchedCustomer?.profileId,
        customerSnapshot,
        companySnapshot: buildCompanySnapshot(),
        lines: docLines,
        shippingTTC: shippingTTC > 0 ? Number(shippingTTC.toFixed(2)) : undefined,
        totalHT: Number(totalHT.toFixed(2)),
        totalTVA: Number(totalTVA.toFixed(2)),
        totalTTC: Number(totalTTC.toFixed(2)),
        paymentStatus,
        paymentMethod: first.paymentMethod ?? (first.source === 'helloasso' ? 'helloasso' : 'virement'),
        paidAt: paymentStatus === 'paye' ? first.paidAt ?? first.date : undefined,
        createdByUid: currentUserUid,
        createdAt: new Date().toISOString(),
      };

      await onIssueInvoice(
        newDoc,
        group.lines.map((l) => l.id),
        nextSeq
      );
      setSubTab('issued');
      setPreviewDoc(newDoc);
    } finally {
      setBusyRef(null);
    }
  };

  const handleEmitCreditNote = async (original: FiscalDocument) => {
    setBusyRef(original.id);
    try {
      const { docNumber, nextSeq } = computeNextDocNumber(
        'AV',
        invoices.filter((i) => i.docType === 'avoir').map((i) => i.invoiceNumber),
        new Date().getFullYear(),
        settings.nextCreditNoteSeq ?? 1
      );
      const today = new Date().toISOString().slice(0, 10);
      const creditNote: FiscalDocument = {
        id: `av_${Date.now()}`,
        docType: 'avoir',
        invoiceNumber: docNumber,
        relatedInvoiceId: original.id,
        relatedInvoiceNumber: original.invoiceNumber,
        refCommande: original.refCommande,
        date: today,
        vente: original.vente,
        customerId: original.customerId,
        customerSnapshot: original.customerSnapshot,
        companySnapshot: buildCompanySnapshot(),
        lines: original.lines.map((l) => ({
          ...l,
          totalHT: -Math.abs(l.totalHT),
          totalTVA: -Math.abs(l.totalTVA),
          totalTTC: -Math.abs(l.totalTTC),
        })),
        shippingTTC: original.shippingTTC ? -Math.abs(original.shippingTTC) : undefined,
        totalHT: -Math.abs(original.totalHT),
        totalTVA: -Math.abs(original.totalTVA),
        totalTTC: -Math.abs(original.totalTTC),
        paymentStatus: 'rembourse',
        paymentMethod: original.paymentMethod,
        notes: `Avoir d'annulation totale sur facture ${original.invoiceNumber}`,
        createdByUid: currentUserUid,
        createdAt: new Date().toISOString(),
      };

      await onIssueCreditNote(creditNote, original, nextSeq);
      setConfirmCreditNote(null);
      setPreviewDoc(creditNote);
    } finally {
      setBusyRef(null);
    }
  };

  const exportPcgCsv = () => {
    const headers = [
      'Journal',
      'Date',
      'Piece',
      'ComptePCG',
      'Libelle',
      'Debit',
      'Credit',
    ];
    const rows: string[][] = [];

    // 1. Journal VE (Factures et Avoirs émis)
    for (const doc of invoices) {
      const clientLabel =
        doc.customerSnapshot.companyName ||
        `${doc.customerSnapshot.prenom} ${doc.customerSnapshot.nom}`.trim();
      const label = `${doc.docType === 'avoir' ? 'Avoir' : 'Facture'} ${doc.invoiceNumber} - ${clientLabel}`;
      const isAvoir = doc.docType === 'avoir';
      const absTTC = Math.abs(doc.totalTTC).toFixed(2);
      const absHT = Math.abs(doc.totalHT).toFixed(2);
      const absTVA = Math.abs(doc.totalTVA).toFixed(2);

      if (!isAvoir) {
        rows.push(['VE', doc.date, doc.invoiceNumber, '411000', label, absTTC, '0.00']);
        rows.push(['VE', doc.date, doc.invoiceNumber, '707000', label, '0.00', absHT]);
        rows.push(['VE', doc.date, doc.invoiceNumber, '445710', `TVA collectée ${doc.invoiceNumber}`, '0.00', absTVA]);
      } else {
        rows.push(['VE', doc.date, doc.invoiceNumber, '707000', label, absHT, '0.00']);
        rows.push(['VE', doc.date, doc.invoiceNumber, '445710', `TVA avoir ${doc.invoiceNumber}`, absTVA, '0.00']);
        rows.push(['VE', doc.date, doc.invoiceNumber, '411000', label, '0.00', absTTC]);
      }
    }

    // 2. Journal AC (Lots fournisseurs)
    for (const lot of lots) {
      const cat = catalogMap.get(lot.catalogId);
      const ht = lot.coutUnitaireHT * lot.qteCommandee + (lot.shippingHT ?? 0);
      const tva = ht * ((lot.tvaRatePct ?? 20) / 100);
      const ttc = ht + tva;
      const label = `Achat ${cat?.domaine ?? ''} - ${cat?.cuvee ?? lot.catalogId}`;
      rows.push(['AC', lot.dateAchat, lot.referenceFacture, '607000', label, ht.toFixed(2), '0.00']);
      rows.push(['AC', lot.dateAchat, lot.referenceFacture, '445660', `TVA déd. ${lot.referenceFacture}`, tva.toFixed(2), '0.00']);
      rows.push(['AC', lot.dateAchat, lot.referenceFacture, '401000', label, '0.00', ttc.toFixed(2)]);
    }

    // 3. Journal OD / AC (Charges d'exploitation)
    const expAccountMap: Record<string, string> = {
      stockage: '613200',
      transport: '624100',
      emballage: '602600',
      commissions: '622200',
      degustation: '625700',
      autre: '628000',
    };
    for (const exp of expenses) {
      const tva = exp.amountHT * (exp.tvaRatePct / 100);
      const ttc = exp.amountHT + tva;
      const acct = expAccountMap[exp.category] ?? '628000';
      rows.push(['AC', exp.date, exp.id, acct, exp.label, exp.amountHT.toFixed(2), '0.00']);
      if (tva > 0) {
        rows.push(['AC', exp.date, exp.id, '445660', `TVA ${exp.label}`, tva.toFixed(2), '0.00']);
      }
      rows.push(['AC', exp.date, exp.id, '401000', exp.supplier || exp.label, '0.00', ttc.toFixed(2)]);
    }

    const csv =
      '\uFEFF' +
      [
        headers.join(';'),
        ...rows.map((r) =>
          r.map((c) => `"${String(c).replace(/"/g, '""')}"`).join(';')
        ),
      ].join('\n');
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `lbg_export_comptable_pcg_${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-4 no-print">
        <div>
          <h1 className="font-serif text-3xl font-semibold text-[#18181B]">
            Facturation, Avoirs &amp; Comptabilité
          </h1>
          <p className="text-sm text-[#6B6A65] mt-1">
            Factures conformes verrouillées (FA), avoirs d’annulation (AV), suivi TVA et export PCG.
          </p>
        </div>
        <button
          onClick={exportPcgCsv}
          className="px-4 py-2 rounded-lg bg-[#18181B] hover:bg-[#3F3F46] text-white text-xs font-medium flex items-center gap-2 self-start sm:self-auto cursor-pointer"
        >
          <Download className="w-4 h-4" />
          Export Comptable PCG (CSV)
        </button>
      </div>

      {/* Missing Legal Info Warning */}
      {(!settings.companySiret || !settings.companyVatNumber) && (
        <div className="p-3.5 rounded-xl bg-[#FEF3C7] border border-[#FDE68A] text-xs text-[#92400E] flex items-center gap-2 no-print">
          <AlertTriangle className="w-4 h-4 shrink-0" />
          <span>
            Complétez votre <strong>SIRET</strong>, <strong>N° TVA intracom</strong> et{' '}
            <strong>IBAN</strong> dans l’onglet <strong>Paramètres</strong> pour qu’ils figurent automatiquement sur vos prochaines factures.
          </span>
        </div>
      )}

      {/* Sub-tabs */}
      <div className="bg-white border border-[#E5E4DF] rounded-xl overflow-hidden no-print">
        <div className="flex border-b border-[#E5E4DF] px-4">
          {(
            [
              ['pending', `Commandes à facturer (${pendingOrdersByRef.length})`],
              ['issued', `Factures & Avoirs émis (${invoices.length})`],
              ['vat', 'Synthèse TVA'],
            ] as const
          ).map(([id, label]) => (
            <button
              key={id}
              onClick={() => setSubTab(id)}
              className={`px-4 py-3 text-xs font-medium border-b-2 transition-colors cursor-pointer ${
                subTab === id
                  ? 'border-[#721C24] text-[#721C24]'
                  : 'border-transparent text-[#6B6A65] hover:text-[#18181B]'
              }`}
            >
              {label}
            </button>
          ))}
        </div>

        {/* Tab 1: Pending orders to invoice */}
        {subTab === 'pending' && (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-[#F6F6F4] text-xs text-[#6B6A65] uppercase">
                <tr>
                  <th className="text-left py-2.5 px-4 font-medium">Réf · Date</th>
                  <th className="text-left py-2.5 px-3 font-medium">Client</th>
                  <th className="text-left py-2.5 px-3 font-medium">Campagne</th>
                  <th className="text-right py-2.5 px-3 font-medium">Btl</th>
                  <th className="text-right py-2.5 px-3 font-medium">Total TTC</th>
                  <th className="text-left py-2.5 px-3 font-medium">Paiement</th>
                  <th className="text-right py-2.5 px-4 font-medium">Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#E5E4DF]">
                {pendingOrdersByRef.map((g) => (
                  <tr key={g.refCommande} className="hover:bg-[#FAF9F6]">
                    <td className="py-2.5 px-4 whitespace-nowrap">
                      <div className="font-mono text-xs font-medium text-[#18181B]">
                        {g.refCommande}
                      </div>
                      <div className="text-[11px] text-[#6B6A65]">
                        {formatDateFR(g.date)}
                      </div>
                    </td>
                    <td className="py-2.5 px-3 font-medium text-[#18181B]">
                      {maskClientName(
                        g.prenomClient,
                        g.nomClient,
                        settings.anonymizeClients
                      )}
                    </td>
                    <td className="py-2.5 px-3 text-xs text-[#6B6A65]">{g.vente}</td>
                    <td className="py-2.5 px-3 text-right font-mono">
                      {g.totalBottles}
                    </td>
                    <td className="py-2.5 px-3 text-right font-mono font-semibold">
                      {formatEUR(g.totalTTC)}
                    </td>
                    <td className="py-2.5 px-3 text-xs">
                      {g.paymentStatus === 'paye' ? (
                        <span className="text-[#15803D]">Payé</span>
                      ) : (
                        <span className="text-[#B45309]">À encaisser</span>
                      )}
                    </td>
                    <td className="py-2.5 px-4 text-right">
                      <button
                        disabled={busyRef === g.refCommande}
                        onClick={() => handleEmitInvoice(g)}
                        className="px-3 py-1.5 rounded-lg bg-[#721C24] hover:bg-[#5E161D] disabled:opacity-50 text-white text-xs font-medium inline-flex items-center gap-1.5 cursor-pointer"
                      >
                        <FileText className="w-3.5 h-3.5" />
                        {busyRef === g.refCommande
                          ? 'Émission…'
                          : 'Émettre facture'}
                      </button>
                    </td>
                  </tr>
                ))}
                {pendingOrdersByRef.length === 0 && (
                  <tr>
                    <td colSpan={7} className="py-10 text-center text-xs text-[#6B6A65]">
                      Toutes les commandes valides ont déjà été facturées.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        )}

        {/* Tab 2: Issued immutable Invoices & Credit Notes */}
        {subTab === 'issued' && (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-[#F6F6F4] text-xs text-[#6B6A65] uppercase">
                <tr>
                  <th className="text-left py-2.5 px-4 font-medium">N° Pièce · Date</th>
                  <th className="text-left py-2.5 px-3 font-medium">Client</th>
                  <th className="text-right py-2.5 px-3 font-medium">Total HT</th>
                  <th className="text-right py-2.5 px-3 font-medium">TVA</th>
                  <th className="text-right py-2.5 px-3 font-medium">Total TTC</th>
                  <th className="text-left py-2.5 px-3 font-medium">Statut</th>
                  <th className="text-right py-2.5 px-4 font-medium">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#E5E4DF]">
                {sortedInvoices.map((doc) => {
                  const isAvoir = doc.docType === 'avoir';
                  const hasCreditNote = Boolean(doc.creditNoteNumber);
                  return (
                    <tr key={doc.id} className="hover:bg-[#FAF9F6]">
                      <td className="py-2.5 px-4 whitespace-nowrap">
                        <div className="font-mono text-xs font-semibold flex items-center gap-1.5">
                          <Lock className="w-3 h-3 text-[#721C24]" />
                          <span className={isAvoir ? 'text-[#B91C1C]' : 'text-[#18181B]'}>
                            {doc.invoiceNumber}
                          </span>
                        </div>
                        <div className="text-[11px] text-[#6B6A65]">
                          {formatDateFR(doc.date)} · Réf {doc.refCommande}
                          {doc.relatedInvoiceNumber
                            ? ` · Annule ${doc.relatedInvoiceNumber}`
                            : ''}
                        </div>
                      </td>
                      <td className="py-2.5 px-3">
                        <div className="font-medium text-[#18181B]">
                          {doc.customerSnapshot.companyName ||
                            maskClientName(
                              doc.customerSnapshot.prenom,
                              doc.customerSnapshot.nom,
                              settings.anonymizeClients
                            )}
                        </div>
                        <div className="text-[11px] text-[#6B6A65]">
                          {doc.vente}
                        </div>
                      </td>
                      <td className="py-2.5 px-3 text-right font-mono">
                        {formatEUR(doc.totalHT)}
                      </td>
                      <td className="py-2.5 px-3 text-right font-mono text-xs text-[#6B6A65]">
                        {formatEUR(doc.totalTVA)}
                      </td>
                      <td className="py-2.5 px-3 text-right font-mono font-semibold">
                        {formatEUR(doc.totalTTC)}
                      </td>
                      <td className="py-2.5 px-3 text-xs whitespace-nowrap">
                        {isAvoir ? (
                          <span className="text-[#B91C1C] font-medium">Avoir émis</span>
                        ) : hasCreditNote ? (
                          <span className="text-[#6B6A65] line-through">
                            Annulée ({doc.creditNoteNumber})
                          </span>
                        ) : doc.paymentStatus === 'paye' ? (
                          <span className="text-[#15803D] font-medium">Payée</span>
                        ) : (
                          <button
                            onClick={() => onMarkInvoicePaid(doc)}
                            className="text-[#B45309] hover:underline font-medium flex items-center gap-1 cursor-pointer"
                          >
                            <Wallet className="w-3 h-3" />
                            Encaisser
                          </button>
                        )}
                      </td>
                      <td className="py-2.5 px-4 text-right whitespace-nowrap">
                        <button
                          onClick={() => setPreviewDoc(doc)}
                          className="px-2.5 py-1 rounded border border-[#E5E4DF] hover:bg-[#F6F6F4] text-xs inline-flex items-center gap-1 mr-1.5 cursor-pointer"
                        >
                          <Printer className="w-3.5 h-3.5" />
                          Voir / PDF
                        </button>
                        {!isAvoir && !hasCreditNote && (
                          <button
                            onClick={() => setConfirmCreditNote(doc)}
                            className="px-2.5 py-1 rounded border border-[#FECACA] text-[#B91C1C] hover:bg-[#FEF2F2] text-xs inline-flex items-center gap-1 cursor-pointer"
                          >
                            <RotateCcw className="w-3.5 h-3.5" />
                            Avoir
                          </button>
                        )}
                      </td>
                    </tr>
                  );
                })}
                {sortedInvoices.length === 0 && (
                  <tr>
                    <td colSpan={7} className="py-10 text-center text-xs text-[#6B6A65]">
                      Aucune facture ou avoir émis pour le moment. Émettez votre première facture depuis l’onglet « Commandes à facturer ».
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        )}

        {/* Tab 3: VAT Summary */}
        {subTab === 'vat' && (
          <div className="p-6 space-y-5">
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              <div className="p-4 rounded-xl bg-[#FAF9F6] border border-[#E5E4DF]">
                <div className="text-xs uppercase text-[#6B6A65]">
                  TVA Collectée (nette d’avoirs)
                </div>
                <div className="mt-1 font-mono text-2xl font-semibold text-[#18181B]">
                  {formatEUR(vatSummary.tvaCollecteeTotale)}
                </div>
                <div className="text-[11px] text-[#6B6A65] mt-1">
                  Facturée : {formatEUR(vatSummary.tvaCollecteeFacturee)} · Non fact. :{' '}
                  {formatEUR(vatSummary.tvaCollecteeNonFacturee)}
                </div>
              </div>

              <div className="p-4 rounded-xl bg-[#FAF9F6] border border-[#E5E4DF]">
                <div className="text-xs uppercase text-[#6B6A65]">
                  TVA Déductible (achats &amp; charges)
                </div>
                <div className="mt-1 font-mono text-2xl font-semibold text-[#15803D]">
                  {formatEUR(vatSummary.tvaDeductibleTotale)}
                </div>
                <div className="text-[11px] text-[#6B6A65] mt-1">
                  Lots : {formatEUR(vatSummary.tvaDeductibleLots)} · Charges :{' '}
                  {formatEUR(vatSummary.tvaDeductibleCharges)}
                </div>
              </div>

              <div className="p-4 rounded-xl bg-[#FAF9F6] border border-[#E5E4DF]">
                <div className="text-xs uppercase text-[#6B6A65]">
                  {vatSummary.soldeTva >= 0
                    ? 'TVA nette à décaisser'
                    : 'Crédit de TVA'}
                </div>
                <div
                  className={`mt-1 font-mono text-2xl font-semibold ${
                    vatSummary.soldeTva >= 0 ? 'text-[#721C24]' : 'text-[#15803D]'
                  }`}
                >
                  {formatEUR(Math.abs(vatSummary.soldeTva))}
                </div>
                <div className="text-[11px] text-[#6B6A65] mt-1">
                  CA facturé net HT : {formatEUR(vatSummary.caFactureHT)}
                </div>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Confirm Credit Note Modal */}
      {confirmCreditNote && (
        <div className="fixed inset-0 bg-black/45 z-50 flex items-center justify-center p-4 no-print">
          <div className="bg-white border border-[#E5E4DF] rounded-xl w-full max-w-md p-6 space-y-4 text-sm">
            <h3 className="font-serif text-xl font-semibold text-[#B91C1C]">
              Émettre un avoir d’annulation
            </h3>
            <p className="text-xs text-[#6B6A65] leading-relaxed">
              Vous allez créer un avoir comptable immuable (<code>AV-AAAA-XXXX</code>) qui annule intégralement la facture{' '}
              <strong className="font-mono text-[#18181B]">
                {confirmCreditNote.invoiceNumber}
              </strong>{' '}
              ({formatEUR(confirmCreditNote.totalTTC)} TTC). Les bouteilles seront libérées en stock et la TVA collectée sera neutralisée.
            </p>
            <div className="flex justify-end gap-2 pt-2">
              <button
                onClick={() => setConfirmCreditNote(null)}
                className="px-4 py-2 rounded-lg border border-[#E5E4DF] cursor-pointer"
              >
                Annuler
              </button>
              <button
                disabled={busyRef === confirmCreditNote.id}
                onClick={() => handleEmitCreditNote(confirmCreditNote)}
                className="px-4 py-2 rounded-lg bg-[#B91C1C] text-white font-medium cursor-pointer"
              >
                {busyRef === confirmCreditNote.id
                  ? 'Émission…'
                  : "Confirmer l'avoir"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Compliant Printable Invoice / Credit Note Preview */}
      {previewDoc && (
        <div className="fixed inset-0 bg-black/55 z-50 flex items-center justify-center p-4 overflow-y-auto">
          <div className="bg-white rounded-xl w-full max-w-3xl overflow-hidden shadow-xl">
            <div className="p-4 border-b border-[#E5E4DF] flex items-center justify-between bg-[#FAF9F6] no-print">
              <span className="font-mono text-sm font-semibold">
                {previewDoc.docType === 'avoir' ? 'Avoir' : 'Facture'}{' '}
                {previewDoc.invoiceNumber}
              </span>
              <div className="flex items-center gap-2">
                {previewDoc.docType === 'facture' &&
                  previewDoc.paymentStatus !== 'paye' &&
                  !previewDoc.creditNoteNumber && (
                    <button
                      onClick={async () => {
                        await onMarkInvoicePaid(previewDoc);
                        setPreviewDoc({
                          ...previewDoc,
                          paymentStatus: 'paye',
                          paidAt: new Date().toISOString().slice(0, 10),
                        });
                      }}
                      className="px-3 py-1.5 rounded-lg border border-[#15803D] text-[#15803D] bg-white text-xs font-medium flex items-center gap-1 cursor-pointer"
                    >
                      <CheckCircle2 className="w-3.5 h-3.5" />
                      Marquer payée
                    </button>
                  )}
                <button
                  onClick={() => window.print()}
                  className="px-3.5 py-1.5 rounded-lg bg-[#721C24] text-white text-xs font-medium flex items-center gap-1.5 cursor-pointer"
                >
                  <Printer className="w-3.5 h-3.5" />
                  Imprimer / PDF
                </button>
                <button
                  onClick={() => setPreviewDoc(null)}
                  className="p-1.5 text-[#6B6A65] cursor-pointer"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>
            </div>

            <div className="p-8 space-y-6 text-[#18181B]">
              {/* Legal Header */}
              <div className="flex justify-between items-start border-b border-[#E5E4DF] pb-5 gap-6">
                <div className="space-y-1">
                  <h2 className="font-serif text-2xl font-semibold text-[#721C24]">
                    {previewDoc.companySnapshot.companyName}
                  </h2>
                  <p className="text-xs text-[#6B6A65] leading-relaxed">
                    {[
                      previewDoc.companySnapshot.companyLegalForm,
                      previewDoc.companySnapshot.companyCapital
                        ? `au capital de ${previewDoc.companySnapshot.companyCapital}`
                        : null,
                    ]
                      .filter(Boolean)
                      .join(' ')}
                    {previewDoc.companySnapshot.companyAddress && (
                      <>
                        <br />
                        {previewDoc.companySnapshot.companyAddress}
                      </>
                    )}
                    {(previewDoc.companySnapshot.companySiret ||
                      previewDoc.companySnapshot.companyRcs) && (
                      <>
                        <br />
                        {[
                          previewDoc.companySnapshot.companySiret
                            ? `SIRET : ${previewDoc.companySnapshot.companySiret}`
                            : null,
                          previewDoc.companySnapshot.companyRcs,
                        ]
                          .filter(Boolean)
                          .join(' · ')}
                      </>
                    )}
                    {previewDoc.companySnapshot.companyVatNumber && (
                      <>
                        <br />
                        TVA intracom. : {previewDoc.companySnapshot.companyVatNumber}
                      </>
                    )}
                    {(previewDoc.companySnapshot.companyEmail ||
                      previewDoc.companySnapshot.companyPhone) && (
                      <>
                        <br />
                        {[
                          previewDoc.companySnapshot.companyEmail,
                          previewDoc.companySnapshot.companyPhone,
                        ]
                          .filter(Boolean)
                          .join(' · ')}
                      </>
                    )}
                  </p>
                </div>

                <div className="text-right shrink-0">
                  <div
                    className={`text-xs uppercase tracking-widest font-semibold ${
                      previewDoc.docType === 'avoir'
                        ? 'text-[#B91C1C]'
                        : 'text-[#6B6A65]'
                    }`}
                  >
                    {previewDoc.docType === 'avoir'
                      ? "Facture d'avoir"
                      : 'Facture'}
                  </div>
                  <div className="font-mono text-2xl font-bold mt-0.5">
                    {previewDoc.invoiceNumber}
                  </div>
                  <div className="text-xs text-[#6B6A65] mt-1">
                    Date d’émission : {formatDateFR(previewDoc.date)}
                  </div>
                  <div className="text-xs text-[#6B6A65]">
                    Réf. commande : {previewDoc.refCommande}
                  </div>
                  {previewDoc.relatedInvoiceNumber && (
                    <div className="text-xs text-[#B91C1C] font-medium mt-0.5">
                      Annule facture {previewDoc.relatedInvoiceNumber}
                    </div>
                  )}
                </div>
              </div>

              {/* Client Box */}
              <div className="bg-[#FAF9F6] border border-[#E5E4DF] rounded-lg p-4 text-sm flex justify-between gap-4">
                <div>
                  <div className="text-[11px] uppercase tracking-wider text-[#6B6A65]">
                    Facturé à
                  </div>
                  {previewDoc.customerSnapshot.companyName && (
                    <div className="font-semibold text-base">
                      {previewDoc.customerSnapshot.companyName}
                    </div>
                  )}
                  <div className="font-medium">
                    {previewDoc.customerSnapshot.prenom}{' '}
                    {previewDoc.customerSnapshot.nom}
                  </div>
                  {previewDoc.customerSnapshot.billingAddress && (
                    <div className="text-xs text-[#6B6A65] mt-0.5">
                      {previewDoc.customerSnapshot.billingAddress}
                    </div>
                  )}
                  {(previewDoc.customerSnapshot.siret ||
                    previewDoc.customerSnapshot.vatNumber) && (
                    <div className="text-xs font-mono text-[#6B6A65] mt-1">
                      {[
                        previewDoc.customerSnapshot.siret
                          ? `SIRET : ${previewDoc.customerSnapshot.siret}`
                          : null,
                        previewDoc.customerSnapshot.vatNumber
                          ? `TVA : ${previewDoc.customerSnapshot.vatNumber}`
                          : null,
                      ]
                        .filter(Boolean)
                        .join(' · ')}
                    </div>
                  )}
                </div>
                <div className="text-right text-xs text-[#6B6A65]">
                  <div>Campagne : {previewDoc.vente}</div>
                  {previewDoc.customerSnapshot.email && (
                    <div>{previewDoc.customerSnapshot.email}</div>
                  )}
                </div>
              </div>

              {/* Lines Table */}
              <table className="w-full text-sm border-collapse">
                <thead>
                  <tr className="border-b-2 border-[#18181B] text-xs uppercase text-[#6B6A65]">
                    <th className="text-left py-2">Désignation</th>
                    <th className="text-right py-2">Qté</th>
                    <th className="text-right py-2">PU TTC</th>
                    <th className="text-right py-2">TVA</th>
                    <th className="text-right py-2">Total HT</th>
                    <th className="text-right py-2">Total TTC</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[#E5E4DF]">
                  {previewDoc.lines.map((l, idx) => (
                    <tr key={`${l.orderId}_${idx}`}>
                      <td className="py-2.5">
                        <div className="font-medium">
                          {l.domaine ? `${l.domaine} — ` : ''}
                          {l.cuvee}
                        </div>
                        <div className="text-xs text-[#6B6A65]">
                          {[l.millesime, l.format].filter(Boolean).join(' · ')}
                        </div>
                      </td>
                      <td className="py-2.5 text-right font-mono">{l.qte}</td>
                      <td className="py-2.5 text-right font-mono">
                        {formatEUR(l.prixUnitaireTTC)}
                      </td>
                      <td className="py-2.5 text-right font-mono text-xs text-[#6B6A65]">
                        {l.tvaRatePct} %
                      </td>
                      <td className="py-2.5 text-right font-mono">
                        {formatEUR(l.totalHT)}
                      </td>
                      <td className="py-2.5 text-right font-mono font-semibold">
                        {formatEUR(l.totalTTC)}
                      </td>
                    </tr>
                  ))}
                  {previewDoc.shippingTTC && previewDoc.shippingTTC !== 0 && (
                    <tr>
                      <td className="py-2.5 text-xs text-[#6B6A65]">
                        Frais de port &amp; emballage
                      </td>
                      <td className="py-2.5 text-right font-mono">1</td>
                      <td className="py-2.5 text-right font-mono">
                        {formatEUR(Math.abs(previewDoc.shippingTTC))}
                      </td>
                      <td className="py-2.5 text-right font-mono text-xs text-[#6B6A65]">
                        {Math.round(settings.tvaRate * 100)} %
                      </td>
                      <td className="py-2.5 text-right font-mono">
                        {formatEUR(previewDoc.shippingTTC / (1 + settings.tvaRate))}
                      </td>
                      <td className="py-2.5 text-right font-mono font-semibold">
                        {formatEUR(previewDoc.shippingTTC)}
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>

              {/* Totals & Real Payment Status */}
              <div className="flex flex-col sm:flex-row justify-between gap-6 pt-4 border-t border-[#E5E4DF]">
                <div className="text-xs space-y-1.5 max-w-sm">
                  <div className="font-semibold text-[#18181B]">
                    Statut de règlement :{' '}
                    <span
                      className={
                        previewDoc.paymentStatus === 'paye'
                          ? 'text-[#15803D]'
                          : 'text-[#B45309]'
                      }
                    >
                      {
                        PAYMENT_STATUS_LABEL[
                          previewDoc.paymentStatus ?? 'en_attente'
                        ]
                      }
                    </span>
                  </div>
                  {previewDoc.paidAt && previewDoc.paymentStatus === 'paye' && (
                    <div className="text-[#6B6A65]">
                      Payé le {formatDateFR(previewDoc.paidAt)}
                      {previewDoc.paymentMethod
                        ? ` (${previewDoc.paymentMethod})`
                        : ''}
                    </div>
                  )}
                  {previewDoc.docType === 'facture' &&
                    previewDoc.paymentStatus !== 'paye' &&
                    previewDoc.companySnapshot.companyIban && (
                      <div className="p-2.5 rounded bg-[#FAF9F6] border border-[#E5E4DF] font-mono text-[11px]">
                        <div>IBAN : {previewDoc.companySnapshot.companyIban}</div>
                        {previewDoc.companySnapshot.companyBic && (
                          <div>BIC : {previewDoc.companySnapshot.companyBic}</div>
                        )}
                      </div>
                    )}
                </div>

                <div className="w-64 space-y-1.5 text-sm ml-auto">
                  <div className="flex justify-between">
                    <span className="text-[#6B6A65]">Total HT</span>
                    <span className="font-mono">{formatEUR(previewDoc.totalHT)}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-[#6B6A65]">TVA</span>
                    <span className="font-mono">{formatEUR(previewDoc.totalTVA)}</span>
                  </div>
                  <div className="flex justify-between text-base font-bold pt-2 border-t border-[#18181B]">
                    <span>
                      {previewDoc.docType === 'avoir'
                        ? 'Net à déduire TTC'
                        : 'Net à payer TTC'}
                    </span>
                    <span className="font-mono text-[#721C24]">
                      {formatEUR(previewDoc.totalTTC)}
                    </span>
                  </div>
                </div>
              </div>

              {/* Legal Footer */}
              {previewDoc.companySnapshot.companyLegalLine && (
                <div className="pt-4 border-t border-[#E5E4DF] text-[10px] text-[#6B6A65] text-center leading-relaxed">
                  {previewDoc.companySnapshot.companyLegalLine}
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
