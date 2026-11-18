import React, { useEffect, useMemo, useState } from 'react';
import {
  Download,
  FileCheck2,
  Printer,
  Receipt,
  Sparkles,
  X,
} from 'lucide-react';
import {
  AppSettings,
  OrderLine,
  SupplierLot,
  WineCatalogItem,
} from '../types/wine';
import { formatDateFR, formatEUR, maskClientName } from '../utils/wineMath';

interface AccountingViewProps {
  catalog: WineCatalogItem[];
  lots: SupplierLot[];
  orders: OrderLine[];
  settings: AppSettings;
  initialFocus?: { periodMonth?: string } | null;
  onAssignInvoiceNumbers: (orderIds: string[], invoiceNumber: string) => void;
  onOpenInvoiceAI: () => void;
}

interface GroupedClientInvoice {
  refCommande: string;
  invoiceNumber: string | null;
  date: string;
  vente: string;
  clientName: string;
  displayClientName: string;
  clientEmail: string;
  lines: OrderLine[];
  totalTTC: number;
  totalHT: number;
  totalTVA: number;
}

export const AccountingView: React.FC<AccountingViewProps> = ({
  catalog,
  lots,
  orders,
  settings,
  initialFocus,
  onAssignInvoiceNumbers,
  onOpenInvoiceAI,
}) => {
  const [subTab, setSubTab] = useState<'tva' | 'factures' | 'achats'>('tva');
  const [periodMonth, setPeriodMonth] = useState<string>('all');
  const [previewInvoice, setPreviewInvoice] =
    useState<GroupedClientInvoice | null>(null);

  useEffect(() => {
    if (initialFocus?.periodMonth) {
      setPeriodMonth(initialFocus.periodMonth);
      setSubTab('factures');
    }
  }, [initialFocus]);

  const catalogMap = useMemo(
    () => new Map(catalog.map((c) => [c.id, c])),
    [catalog]
  );

  const availableMonths = useMemo(() => {
    const months = new Set<string>();
    orders.forEach((o) => {
      if (o.date.length >= 7) months.add(o.date.slice(0, 7));
    });
    lots.forEach((l) => {
      if (l.dateAchat.length >= 7) months.add(l.dateAchat.slice(0, 7));
    });
    return Array.from(months).sort().reverse();
  }, [orders, lots]);

  const filteredValidOrders = useMemo(() => {
    return orders.filter(
      (o) =>
        o.statut !== 'annule' &&
        o.source !== 'perso' &&
        o.prixUnitaireTTC > 0 &&
        (periodMonth === 'all' || o.date.startsWith(periodMonth))
    );
  }, [orders, periodMonth]);

  const filteredLots = useMemo(() => {
    return lots.filter(
      (l) => periodMonth === 'all' || l.dateAchat.startsWith(periodMonth)
    );
  }, [lots, periodMonth]);

  // TVA & Accounting Totals
  const vatSummary = useMemo(() => {
    let ventesTTC = 0;
    let ventesHT = 0;
    let tvaCollectee = 0;

    for (const o of filteredValidOrders) {
      const rate = (o.tvaRatePct ?? settings.tvaRate * 100) / 100;
      const lineTTC = o.prixUnitaireTTC * o.qte;
      const lineHT = lineTTC / (1 + rate);
      ventesTTC += lineTTC;
      ventesHT += lineHT;
      tvaCollectee += lineTTC - lineHT;
    }

    let achatsHT = 0;
    let tvaDeductible = 0;
    let achatsTTC = 0;

    for (const l of filteredLots) {
      const rate = (l.tvaRatePct ?? settings.tvaRate * 100) / 100;
      const baseHT = l.coutUnitaireHT * l.qteCommandee + (l.shippingHT ?? 0);
      const tva = baseHT * rate;
      achatsHT += baseHT;
      tvaDeductible += tva;
      achatsTTC += baseHT + tva;
    }

    const tvaNette = tvaCollectee - tvaDeductible;

    return {
      ventesTTC,
      ventesHT,
      tvaCollectee,
      achatsHT,
      tvaDeductible,
      achatsTTC,
      tvaNette,
    };
  }, [filteredValidOrders, filteredLots, settings.tvaRate]);

  // Grouped Client Invoices by refCommande
  const clientInvoices = useMemo(() => {
    const map = new Map<string, GroupedClientInvoice>();

    for (const o of filteredValidOrders) {
      const existing = map.get(o.refCommande);
      const rate = (o.tvaRatePct ?? settings.tvaRate * 100) / 100;
      const lineTTC = o.prixUnitaireTTC * o.qte;
      const lineHT = lineTTC / (1 + rate);
      const lineTVA = lineTTC - lineHT;

      if (existing) {
        existing.lines.push(o);
        existing.totalTTC += lineTTC;
        existing.totalHT += lineHT;
        existing.totalTVA += lineTVA;
        if (!existing.invoiceNumber && o.invoiceNumber) {
          existing.invoiceNumber = o.invoiceNumber;
        }
      } else {
        map.set(o.refCommande, {
          refCommande: o.refCommande,
          invoiceNumber: o.invoiceNumber || null,
          date: o.date,
          vente: o.vente,
          clientName: `${o.prenomClient} ${o.nomClient}`.trim(),
          displayClientName: maskClientName(
            o.prenomClient,
            o.nomClient,
            settings.anonymizeClients
          ),
          clientEmail: o.emailClient,
          lines: [o],
          totalTTC: lineTTC,
          totalHT: lineHT,
          totalTVA: lineTVA,
        });
      }
    }

    return Array.from(map.values()).sort((a, b) =>
      b.date.localeCompare(a.date)
    );
  }, [filteredValidOrders, settings.tvaRate, settings.anonymizeClients]);

  const handleIssueInvoice = (inv: GroupedClientInvoice) => {
    const year = /^\d{4}/.test(inv.date)
      ? inv.date.slice(0, 4)
      : String(new Date().getFullYear());
    let maxSeq = 0;
    for (const o of orders) {
      if (!o.invoiceNumber) continue;
      const m = o.invoiceNumber.match(/(\d+)$/);
      if (m) {
        const n = parseInt(m[1], 10);
        if (n > maxSeq) maxSeq = n;
      }
    }
    const nextNum = `FA-${year}-${String(maxSeq + 1).padStart(4, '0')}`;
    onAssignInvoiceNumbers(
      inv.lines.map((l) => l.id),
      nextNum
    );
    setPreviewInvoice({ ...inv, invoiceNumber: nextNum });
  };

  const handleExportAccountingCSV = () => {
    const headers = [
      'Type',
      'Date',
      'N° Piece',
      'Tiers',
      'Libelle',
      'Montant HT',
      'TVA',
      'Montant TTC',
    ];

    const salesRows = clientInvoices.map((inv) => [
      'VENTE',
      formatDateFR(inv.date),
      inv.invoiceNumber || inv.refCommande,
      inv.clientName,
      `${inv.vente} (${inv.lines.reduce((s, l) => s + l.qte, 0)} btl)`,
      inv.totalHT.toFixed(2).replace('.', ','),
      inv.totalTVA.toFixed(2).replace('.', ','),
      inv.totalTTC.toFixed(2).replace('.', ','),
    ]);

    const purchaseRows = filteredLots.map((l) => {
      const cat = catalogMap.get(l.catalogId);
      const rate = (l.tvaRatePct ?? settings.tvaRate * 100) / 100;
      const ht = l.coutUnitaireHT * l.qteCommandee + (l.shippingHT ?? 0);
      const tva = ht * rate;
      const ttc = ht + tva;
      return [
        'ACHAT',
        formatDateFR(l.dateAchat),
        l.referenceFacture,
        cat?.domaine ?? 'Fournisseur',
        `${cat?.cuvee ?? 'Vin'} (${l.qteCommandee} btl)`,
        ht.toFixed(2).replace('.', ','),
        tva.toFixed(2).replace('.', ','),
        ttc.toFixed(2).replace('.', ','),
      ];
    });

    const csv =
      '\uFEFF' +
      [headers, ...salesRows, ...purchaseRows]
        .map((row) =>
          row.map((v) => `"${String(v).replace(/"/g, '""')}"`).join(';')
        )
        .join('\n');

    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `journal_comptable_lbg_${periodMonth}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col lg:flex-row lg:items-end justify-between gap-4 no-print">
        <div>
          <h1 className="font-display text-3xl font-semibold text-[#141413] tracking-tight">
            Facturation, Comptabilité &amp; TVA
          </h1>
          <p className="text-sm text-[#6B6B66] mt-1">
            Suivi de TVA collectée et déductible, émission de factures clients
            et export des journaux pour votre expert-comptable.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2.5">
          <select
            value={periodMonth}
            onChange={(e) => setPeriodMonth(e.target.value)}
            className="px-3 py-2 text-sm bg-white border border-[#D8D6D0] rounded-lg focus:outline-none focus:border-[#721C24]"
          >
            <option value="all">Toute la période</option>
            {availableMonths.map((m) => (
              <option key={m} value={m}>
                Mois {m.slice(5)}/{m.slice(0, 4)}
              </option>
            ))}
          </select>

          <button
            onClick={handleExportAccountingCSV}
            className="inline-flex items-center gap-2 px-3.5 py-2 text-sm font-medium text-[#141413] bg-white hover:bg-[#F6F6F4] border border-[#D8D6D0] rounded-lg transition-colors whitespace-nowrap"
          >
            <Download className="w-4 h-4 text-[#6B6B66]" />
            <span>Export comptable CSV</span>
          </button>

          <button
            onClick={onOpenInvoiceAI}
            className="inline-flex items-center gap-2 px-4 py-2 text-sm font-medium text-white bg-[#721C24] hover:bg-[#5B151C] rounded-lg transition-colors whitespace-nowrap"
          >
            <Sparkles className="w-4 h-4" />
            <span>Scanner une facture (IA)</span>
          </button>
        </div>
      </div>

      {/* Transparent warning when deduced Excel lots without supplier invoices are present */}
      {lots.some(
        (l) => l.origin === 'excel_status_inferred' || l.origin === 'excel_dispos'
      ) && (
        <div className="bg-[#FAF9F7] border border-[#E5E4DF] rounded-xl px-4 py-3 text-xs text-[#4A4A45] no-print">
          <span className="font-semibold text-[#141413]">
            Note comptable Excel :
          </span>{' '}
          les lignes marquées <code className="px-1 py-0.5 bg-white border border-[#E5E4DF] rounded text-[11px]">EXCEL-STATUT-COL-K</code> ou{' '}
          <code className="px-1 py-0.5 bg-white border border-[#E5E4DF] rounded text-[11px]">EXCEL-DISPOS</code> estiment la TVA déductible à partir des coûts EXW catalogue (en l’absence de factures domaines dans le tableur). Importez vos vraies factures PDF via <strong>Scanner une facture (IA)</strong>.
        </div>
      )}

      {/* VAT Summary Strip */}
      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4 no-print">
        <div className="bg-white border border-[#E5E4DF] rounded-xl p-5">
          <div className="text-xs font-medium text-[#6B6B66]">
            TVA Collectée (Ventes)
          </div>
          <div className="mt-2 text-2xl font-semibold font-mono-num text-[#141413]">
            {formatEUR(vatSummary.tvaCollectee)}
          </div>
          <div className="mt-1.5 text-xs text-[#6B6B66] tabular-nums">
            Base HT : {formatEUR(vatSummary.ventesHT)} · TTC :{' '}
            {formatEUR(vatSummary.ventesTTC)}
          </div>
        </div>

        <div className="bg-white border border-[#E5E4DF] rounded-xl p-5">
          <div className="text-xs font-medium text-[#6B6B66]">
            TVA Déductible (Achats &amp; Avances)
          </div>
          <div className="mt-2 text-2xl font-semibold font-mono-num text-[#15803D]">
            {formatEUR(vatSummary.tvaDeductible)}
          </div>
          <div className="mt-1.5 text-xs text-[#6B6B66] tabular-nums">
            Base HT : {formatEUR(vatSummary.achatsHT)} · TTC :{' '}
            {formatEUR(vatSummary.achatsTTC)}
          </div>
        </div>

        <div className="bg-white border border-[#E5E4DF] rounded-xl p-5">
          <div className="text-xs font-medium text-[#6B6B66]">
            {vatSummary.tvaNette >= 0
              ? 'TVA nette à reverser'
              : 'Crédit de TVA reportable'}
          </div>
          <div
            className={`mt-2 text-2xl font-semibold font-mono-num ${
              vatSummary.tvaNette >= 0 ? 'text-[#B45309]' : 'text-[#15803D]'
            }`}
          >
            {formatEUR(Math.abs(vatSummary.tvaNette))}
          </div>
          <div className="mt-1.5 text-xs text-[#6B6B66]">
            {vatSummary.tvaNette >= 0
              ? 'Collectée supérieure aux achats de la période'
              : 'Achats en avance supérieurs aux ventes'}
          </div>
        </div>

        <div className="bg-white border border-[#E5E4DF] rounded-xl p-5">
          <div className="text-xs font-medium text-[#6B6B66]">
            Factures clients émises
          </div>
          <div className="mt-2 text-2xl font-semibold font-mono-num text-[#141413]">
            {clientInvoices.filter((i) => i.invoiceNumber).length} /{' '}
            {clientInvoices.length}
          </div>
          <div className="mt-1.5 text-xs text-[#6B6B66]">
            Commandes facturables sur la période
          </div>
        </div>
      </div>

      {/* Segmented Sub-navigation */}
      <div className="flex items-center gap-1 p-1 bg-white border border-[#E5E4DF] rounded-lg w-fit no-print">
        <button
          onClick={() => setSubTab('tva')}
          className={`px-3.5 py-1.5 text-xs font-medium rounded-md transition-colors ${
            subTab === 'tva'
              ? 'bg-[#721C24] text-white'
              : 'text-[#6B6B66] hover:text-[#141413]'
          }`}
        >
          Synthèse TVA &amp; Journal Ventes
        </button>
        <button
          onClick={() => setSubTab('factures')}
          className={`px-3.5 py-1.5 text-xs font-medium rounded-md transition-colors ${
            subTab === 'factures'
              ? 'bg-[#721C24] text-white'
              : 'text-[#6B6B66] hover:text-[#141413]'
          }`}
        >
          Facturation Clients ({clientInvoices.length})
        </button>
        <button
          onClick={() => setSubTab('achats')}
          className={`px-3.5 py-1.5 text-xs font-medium rounded-md transition-colors ${
            subTab === 'achats'
              ? 'bg-[#721C24] text-white'
              : 'text-[#6B6B66] hover:text-[#141413]'
          }`}
        >
          Journal des Achats ({filteredLots.length})
        </button>
      </div>

      {/* Tab 1 & 2: Client Invoices / Sales Journal */}
      {(subTab === 'tva' || subTab === 'factures') && (
        <div className="bg-white border border-[#E5E4DF] rounded-xl overflow-hidden no-print">
          <div className="px-6 py-4 border-b border-[#E5E4DF] flex items-center justify-between">
            <h2 className="text-base font-semibold text-[#141413]">
              {subTab === 'tva'
                ? 'Journal des ventes & TVA collectée'
                : 'Factures clients à émettre ou imprimer'}
            </h2>
            <span className="text-xs text-[#6B6B66]">
              TVA standard appliquée : {Math.round(settings.tvaRate * 100)} %
            </span>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse text-sm">
              <thead>
                <tr className="bg-[#FAF9F7] text-xs text-[#6B6B66] border-b border-[#E5E4DF]">
                  <th className="py-3 px-5 font-medium">Date</th>
                  <th className="py-3 px-4 font-medium">Réf / N° Facture</th>
                  <th className="py-3 px-4 font-medium">Client</th>
                  <th className="py-3 px-4 font-medium">Vente</th>
                  <th className="py-3 px-4 font-medium text-right">HT</th>
                  <th className="py-3 px-4 font-medium text-right">TVA</th>
                  <th className="py-3 px-4 font-medium text-right">TTC</th>
                  <th className="py-3 px-5 font-medium text-right">Facture</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#ECEAE4]">
                {clientInvoices.map((inv) => (
                  <tr
                    key={inv.refCommande}
                    className="hover:bg-[#FAF9F7] transition-colors"
                  >
                    <td className="py-3 px-5 font-mono-num text-xs whitespace-nowrap">
                      {formatDateFR(inv.date)}
                    </td>
                    <td className="py-3 px-4 font-mono-num text-xs">
                      {inv.invoiceNumber ? (
                        <span className="font-semibold text-[#15803D]">
                          {inv.invoiceNumber}
                        </span>
                      ) : (
                        <span className="text-[#6B6B66]">
                          Réf {inv.refCommande}
                        </span>
                      )}
                    </td>
                    <td className="py-3 px-4 font-medium text-[#141413] whitespace-nowrap">
                      {inv.displayClientName}
                    </td>
                    <td className="py-3 px-4 text-xs text-[#6B6B66]">
                      {inv.vente}
                    </td>
                    <td className="py-3 px-4 text-right font-mono-num">
                      {formatEUR(inv.totalHT)}
                    </td>
                    <td className="py-3 px-4 text-right font-mono-num text-[#6B6B66]">
                      {formatEUR(inv.totalTVA)}
                    </td>
                    <td className="py-3 px-4 text-right font-mono-num font-semibold">
                      {formatEUR(inv.totalTTC)}
                    </td>
                    <td className="py-3 px-5 text-right whitespace-nowrap">
                      {inv.invoiceNumber ? (
                        <button
                          onClick={() => setPreviewInvoice(inv)}
                          className="inline-flex items-center gap-1.5 px-3 py-1 text-xs font-medium text-[#141413] bg-[#F6F6F4] hover:bg-[#ECEAE4] border border-[#D8D6D0] rounded-md"
                        >
                          <FileCheck2 className="w-3.5 h-3.5 text-[#15803D]" />
                          <span>Voir / PDF</span>
                        </button>
                      ) : (
                        <button
                          onClick={() => handleIssueInvoice(inv)}
                          className="inline-flex items-center gap-1.5 px-3 py-1 text-xs font-medium text-[#721C24] hover:bg-[#721C24]/10 border border-[#721C24]/30 rounded-md"
                        >
                          <Receipt className="w-3.5 h-3.5" />
                          <span>Émettre facture</span>
                        </button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Tab 3: Supplier Purchases Journal */}
      {subTab === 'achats' && (
        <div className="bg-white border border-[#E5E4DF] rounded-xl overflow-hidden no-print">
          <div className="px-6 py-4 border-b border-[#E5E4DF]">
            <h2 className="text-base font-semibold text-[#141413]">
              Journal des achats domaines &amp; TVA déductible
            </h2>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse text-sm">
              <thead>
                <tr className="bg-[#FAF9F7] text-xs text-[#6B6B66] border-b border-[#E5E4DF]">
                  <th className="py-3 px-5 font-medium">Date</th>
                  <th className="py-3 px-4 font-medium">N° Pièce</th>
                  <th className="py-3 px-4 font-medium">Domaine · Cuvée</th>
                  <th className="py-3 px-3 font-medium text-right">Qté</th>
                  <th className="py-3 px-4 font-medium text-right">
                    Base HT (incl. port)
                  </th>
                  <th className="py-3 px-4 font-medium text-right">
                    TVA déd.
                  </th>
                  <th className="py-3 px-5 font-medium text-right">Total TTC</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#ECEAE4]">
                {filteredLots.map((l) => {
                  const cat = catalogMap.get(l.catalogId);
                  const rate = (l.tvaRatePct ?? settings.tvaRate * 100) / 100;
                  const baseHT =
                    l.coutUnitaireHT * l.qteCommandee + (l.shippingHT ?? 0);
                  const tva = baseHT * rate;
                  return (
                    <tr key={l.id} className="hover:bg-[#FAF9F7]">
                      <td className="py-3 px-5 font-mono-num text-xs">
                        {formatDateFR(l.dateAchat)}
                      </td>
                      <td className="py-3 px-4 font-mono-num text-xs text-[#6B6B66]">
                        {l.referenceFacture}
                      </td>
                      <td className="py-3 px-4">
                        <div className="font-medium text-[#141413]">
                          {cat?.domaine ?? 'Domaine'}
                        </div>
                        <div className="text-xs text-[#6B6B66]">
                          {cat?.cuvee}
                        </div>
                      </td>
                      <td className="py-3 px-3 text-right font-mono-num">
                        {l.qteCommandee}
                      </td>
                      <td className="py-3 px-4 text-right font-mono-num">
                        {formatEUR(baseHT)}
                      </td>
                      <td className="py-3 px-4 text-right font-mono-num text-[#15803D]">
                        {formatEUR(tva)}
                      </td>
                      <td className="py-3 px-5 text-right font-mono-num font-medium">
                        {formatEUR(baseHT + tva)}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Printable Client Invoice Preview Modal */}
      {previewInvoice && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"
          role="dialog"
          aria-modal="true"
        >
          <div className="w-full max-w-2xl bg-white border border-[#E5E4DF] rounded-xl shadow-2xl overflow-hidden">
            <div className="flex items-center justify-between px-6 py-3.5 border-b border-[#E5E4DF] bg-[#FAF9F7] no-print">
              <span className="text-sm font-medium text-[#141413]">
                Facture {previewInvoice.invoiceNumber}
              </span>
              <div className="flex items-center gap-2">
                <button
                  onClick={() => window.print()}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-white bg-[#721C24] hover:bg-[#5B151C] rounded-md"
                >
                  <Printer className="w-3.5 h-3.5" />
                  <span>Imprimer / PDF</span>
                </button>
                <button
                  onClick={() => setPreviewInvoice(null)}
                  className="p-1.5 text-[#6B6B66] hover:text-[#141413]"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>
            </div>

            <div className="p-8 space-y-6 text-sm text-[#141413]">
              <div className="flex justify-between items-start border-b border-[#E5E4DF] pb-6">
                <div className="flex items-start gap-4">
                  <img
                    src="/logo-lbg.png"
                    alt="Le Bon Grain d’Ivresse"
                    className="w-14 h-14 rounded-lg object-cover border border-[#E5E4DF] shrink-0"
                  />
                  <div>
                    <div className="font-display text-2xl font-semibold">
                      Le Bon Grain d’Ivresse
                    </div>
                    <div className="text-xs text-[#6B6B66] mt-1 space-y-0.5">
                      <div>Romain Becker — Négoce &amp; Sélection de Vins</div>
                      <div>www.lebongraindelivresse.com</div>
                      <div>romain.becker@live.fr · 06 86 53 19 07</div>
                      {(settings.companyAddress || settings.companySiret) && (
                        <div>
                          {[settings.companyAddress, settings.companySiret]
                            .filter(Boolean)
                            .join(' · ')}
                        </div>
                      )}
                    </div>
                  </div>
                </div>
                <div className="text-right">
                  <div className="text-xs text-[#6B6B66]">FACTURE</div>
                  <div className="text-lg font-bold font-mono-num">
                    {previewInvoice.invoiceNumber}
                  </div>
                  <div className="text-xs text-[#6B6B66] mt-1">
                    Date : {formatDateFR(previewInvoice.date)}
                  </div>
                  <div className="text-xs text-[#6B6B66]">
                    Réf commande : {previewInvoice.refCommande}
                  </div>
                </div>
              </div>

              <div>
                <div className="text-xs text-[#6B6B66] mb-1">Facturé à :</div>
                <div className="font-semibold">{previewInvoice.clientName}</div>
                {previewInvoice.clientEmail && (
                  <div className="text-xs text-[#6B6B66]">
                    {previewInvoice.clientEmail}
                  </div>
                )}
              </div>

              <table className="w-full text-left border-collapse text-xs">
                <thead>
                  <tr className="border-b border-[#141413] text-[#6B6B66]">
                    <th className="py-2 font-medium">Désignation</th>
                    <th className="py-2 font-medium text-right">Qté</th>
                    <th className="py-2 font-medium text-right">PU HT</th>
                    <th className="py-2 font-medium text-right">PU TTC</th>
                    <th className="py-2 font-medium text-right">Total TTC</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[#ECEAE4]">
                  {previewInvoice.lines.map((l) => {
                    const rate =
                      (l.tvaRatePct ?? settings.tvaRate * 100) / 100;
                    const puHT = l.prixUnitaireTTC / (1 + rate);
                    return (
                      <tr key={l.id}>
                        <td className="py-2.5 font-medium">{l.produitLabel}</td>
                        <td className="py-2.5 text-right font-mono-num">
                          {l.qte}
                        </td>
                        <td className="py-2.5 text-right font-mono-num">
                          {formatEUR(puHT)}
                        </td>
                        <td className="py-2.5 text-right font-mono-num">
                          {formatEUR(l.prixUnitaireTTC)}
                        </td>
                        <td className="py-2.5 text-right font-mono-num font-medium">
                          {formatEUR(l.prixUnitaireTTC * l.qte)}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>

              <div className="flex justify-end pt-4 border-t border-[#E5E4DF]">
                <div className="w-64 space-y-1.5 text-xs">
                  <div className="flex justify-between text-[#6B6B66]">
                    <span>Total HT</span>
                    <span className="font-mono-num">
                      {formatEUR(previewInvoice.totalHT)}
                    </span>
                  </div>
                  <div className="flex justify-between text-[#6B6B66]">
                    <span>
                      TVA (
                      {previewInvoice.totalHT > 0
                        ? Math.round(
                            (previewInvoice.totalTVA / previewInvoice.totalHT) *
                              100
                          )
                        : Math.round(settings.tvaRate * 100)}{' '}
                      %)
                    </span>
                    <span className="font-mono-num">
                      {formatEUR(previewInvoice.totalTVA)}
                    </span>
                  </div>
                  <div className="flex justify-between text-base font-bold pt-2 border-t border-[#E5E4DF]">
                    <span>Total TTC</span>
                    <span className="font-mono-num">
                      {formatEUR(previewInvoice.totalTTC)}
                    </span>
                  </div>
                </div>
              </div>

              <div className="text-[11px] text-[#6B6B66] pt-4 border-t border-[#ECEAE4]">
                Règlement effectué · En cas de retard de paiement, pénalités de
                3× le taux d’intérêt légal et indemnité forfaitaire de 40 €
                (art. L441-10 C. com.).
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
