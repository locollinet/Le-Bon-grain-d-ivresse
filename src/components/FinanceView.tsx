import React, { useMemo, useState } from 'react';
import {
  TrendingUp,
  Plus,
  Trash2,
  Wallet,
  CreditCard,
  Package,
  Receipt,
  AlertTriangle,
  X,
} from 'lucide-react';
import {
  AppSettings,
  ExpenseCategory,
  FiscalDocument,
  OperatingExpense,
  OrderLine,
  StockAdjustment,
  StockSummaryRow,
  SupplierLot,
  WineCatalogItem,
} from '../types/wine';
import {
  computeOrderLineEconomics,
  formatDateFR,
  formatEUR,
  formatPct,
  getOrderLineUnpaidTTC,
} from '../utils/wineMath';

interface FinanceViewProps {
  orders: OrderLine[];
  catalog: WineCatalogItem[];
  lots: SupplierLot[];
  stockRows: StockSummaryRow[];
  adjustments: StockAdjustment[];
  expenses: OperatingExpense[];
  invoices: FiscalDocument[];
  settings: AppSettings;
  currentUserUid: string;
  onSaveExpense: (expense: OperatingExpense) => Promise<void>;
  onDeleteExpense: (expenseId: string) => Promise<void>;
}

const EXPENSE_CAT_LABELS: Record<ExpenseCategory, string> = {
  stockage: 'Stockage / Entrepôt cave',
  transport: 'Transport / Livraisons',
  emballage: 'Cartons & Emballages',
  commissions: 'Commissions (HelloAsso / CB)',
  degustation: 'Dégustations / Événements',
  autre: 'Autres frais généraux',
};

function matchesPeriod(
  isoDate: string,
  periodType: 'all' | 'year' | 'quarter' | 'month',
  selectedYear: number,
  selectedQuarter: number,
  selectedMonth: number
): boolean {
  if (periodType === 'all') return true;
  if (!isoDate || isoDate.length < 7) return false;
  const y = parseInt(isoDate.slice(0, 4), 10);
  const m = parseInt(isoDate.slice(5, 7), 10);
  if (y !== selectedYear) return false;
  if (periodType === 'year') return true;
  if (periodType === 'month') return m === selectedMonth;
  if (periodType === 'quarter') {
    const q = Math.floor((m - 1) / 3) + 1;
    return q === selectedQuarter;
  }
  return true;
}

export const FinanceView: React.FC<FinanceViewProps> = ({
  orders,
  catalog,
  lots,
  stockRows,
  adjustments,
  expenses,
  invoices,
  settings,
  currentUserUid,
  onSaveExpense,
  onDeleteExpense,
}) => {
  const currentYear = new Date().getFullYear();
  const [periodType, setPeriodType] = useState<'all' | 'year' | 'quarter' | 'month'>('all');
  const [selectedYear, setSelectedYear] = useState<number>(2026);
  const [selectedQuarter, setSelectedQuarter] = useState<number>(4);
  const [selectedMonth, setSelectedMonth] = useState<number>(10);
  const [campaignFilter, setCampaignFilter] = useState<string>('all');

  // New expense modal
  const [expModalOpen, setExpModalOpen] = useState(false);
  const [expDate, setExpDate] = useState(new Date().toISOString().slice(0, 10));
  const [expCat, setExpCat] = useState<ExpenseCategory>('stockage');
  const [expLabel, setExpLabel] = useState('');
  const [expSupplier, setExpSupplier] = useState('');
  const [expAmountHT, setExpAmountHT] = useState<number>(0);
  const [expTvaPct, setExpTvaPct] = useState<number>(20);
  const [expNotes, setExpNotes] = useState('');
  const [expSaving, setExpSaving] = useState(false);

  const catalogMap = useMemo(
    () => new Map(catalog.map((c) => [c.id, c])),
    [catalog]
  );

  const availableYears = useMemo(() => {
    const s = new Set<number>([currentYear, 2026, 2025]);
    for (const o of orders) {
      const y = parseInt(o.date.slice(0, 4), 10);
      if (Number.isFinite(y)) s.add(y);
    }
    return Array.from(s).sort((a, b) => b - a);
  }, [orders, currentYear]);

  const campaigns = useMemo(() => {
    const s = new Set<string>();
    for (const o of orders) if (o.vente) s.add(o.vente);
    return Array.from(s).sort((a, b) => a.localeCompare(b, 'fr'));
  }, [orders]);

  const pnl = useMemo(() => {
    const filteredOrders = orders.filter(
      (o) =>
        o.statut !== 'annule' &&
        (campaignFilter === 'all' || o.vente === campaignFilter) &&
        matchesPeriod(o.date, periodType, selectedYear, selectedQuarter, selectedMonth)
    );

    const filteredExpenses = expenses.filter((e) =>
      matchesPeriod(e.date, periodType, selectedYear, selectedQuarter, selectedMonth)
    );

    const filteredLots = lots.filter((l) =>
      matchesPeriod(l.dateAchat, periodType, selectedYear, selectedQuarter, selectedMonth)
    );

    const filteredAdjustments = adjustments.filter((a) =>
      matchesPeriod(a.date, periodType, selectedYear, selectedQuarter, selectedMonth)
    );

    const filteredCreditNotes = invoices.filter(
      (i) =>
        i.docType === 'avoir' &&
        matchesPeriod(i.date, periodType, selectedYear, selectedQuarter, selectedMonth)
    );

    let caTTC = 0;
    let caHT = 0;
    let shippingClientHT = 0;
    let coutVinHT = 0;
    let fraisLogistiqueTheoriqueHT = 0;
    let margeCommercialeHT = 0;
    let coutPersoHT = 0;
    let bottlesSold = 0;
    let bottlesPerso = 0;

    const byCampaign = new Map<
      string,
      {
        vente: string;
        bottles: number;
        caTTC: number;
        caHT: number;
        coutVinHT: number;
        logHT: number;
        margeHT: number;
      }
    >();

    for (const o of filteredOrders) {
      const econ = computeOrderLineEconomics(o, catalogMap.get(o.catalogId), settings);
      if (econ.isPerso) {
        coutPersoHT += econ.coutVinHT;
        bottlesPerso += o.qte;
        continue;
      }

      const tvaRate =
        o.tvaRatePct !== undefined ? o.tvaRatePct / 100 : settings.tvaRate;
      const shipHT = (o.shippingFeeClientTTC ?? 0) / (1 + tvaRate);

      bottlesSold += o.qte;
      caTTC += econ.caTTC + (o.shippingFeeClientTTC ?? 0);
      caHT += econ.caHT;
      shippingClientHT += shipHT;
      coutVinHT += econ.coutVinHT;
      fraisLogistiqueTheoriqueHT += econ.fraisLogistiqueHT;
      margeCommercialeHT += econ.margeEuroTotal;

      const campKey = o.vente || 'Sans campagne';
      const entry = byCampaign.get(campKey) ?? {
        vente: campKey,
        bottles: 0,
        caTTC: 0,
        caHT: 0,
        coutVinHT: 0,
        logHT: 0,
        margeHT: 0,
      };
      entry.bottles += o.qte;
      entry.caTTC += econ.caTTC;
      entry.caHT += econ.caHT;
      entry.coutVinHT += econ.coutVinHT;
      entry.logHT += econ.fraisLogistiqueHT;
      entry.margeHT += econ.margeEuroTotal;
      byCampaign.set(campKey, entry);
    }

    const totalExpensesHT = filteredExpenses.reduce((s, e) => s + e.amountHT, 0);
    const actualLotShippingHT = filteredLots.reduce(
      (s, l) => s + (l.shippingHT ?? 0),
      0
    );
    const coutCasseAjustementHT = filteredAdjustments.reduce(
      (s, a) => s + (a.qtyDelta < 0 ? Math.abs(a.qtyDelta) * a.unitCostHT : 0),
      0
    );
    const totalAvoirsHT = filteredCreditNotes.reduce((s, av) => s + Math.abs(av.totalHT), 0);

    // Marge brute vins (CA HT + port refacturé - coût vin HT)
    const margeBruteVinsHT = caHT + shippingClientHT - coutVinHT;
    // Résultat d'exploitation net réel (après charges réelles, port lots, sorties perso & casse)
    const resultatNetExploitationHT =
      margeBruteVinsHT -
      actualLotShippingHT -
      totalExpensesHT -
      coutPersoHT -
      coutCasseAjustementHT;

    // Treasury (global current snapshot, not period-truncated)
    const resteAEncaisserTTC = orders.reduce(
      (s, o) => s + getOrderLineUnpaidTTC(o),
      0
    );
    const dettesDomainesHT = lots
      .filter((l) => l.paymentStatus === 'non_paye')
      .reduce((s, l) => s + l.coutUnitaireHT * l.qteCommandee + (l.shippingHT ?? 0), 0);
    const stockValoriseHT = stockRows.reduce((s, r) => s + r.capitalImmobiliseHT, 0);

    return {
      caTTC,
      caHT,
      shippingClientHT,
      coutVinHT,
      margeBruteVinsHT,
      fraisLogistiqueTheoriqueHT,
      actualLotShippingHT,
      margeCommercialeHT,
      totalExpensesHT,
      coutPersoHT,
      coutCasseAjustementHT,
      resultatNetExploitationHT,
      totalAvoirsHT,
      bottlesSold,
      bottlesPerso,
      filteredExpenses,
      campaignsBreakdown: Array.from(byCampaign.values()).sort(
        (a, b) => b.caTTC - a.caTTC
      ),
      resteAEncaisserTTC,
      dettesDomainesHT,
      stockValoriseHT,
    };
  }, [
    orders,
    expenses,
    lots,
    adjustments,
    invoices,
    stockRows,
    catalogMap,
    settings,
    campaignFilter,
    periodType,
    selectedYear,
    selectedQuarter,
    selectedMonth,
  ]);

  const handleAddExpense = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!expLabel.trim() || expAmountHT <= 0) return;
    setExpSaving(true);
    try {
      const ts = new Date().toISOString();
      await onSaveExpense({
        id: `exp_${Date.now()}`,
        date: expDate,
        category: expCat,
        label: expLabel.trim(),
        supplier: expSupplier.trim() || undefined,
        amountHT: expAmountHT,
        tvaRatePct: expTvaPct,
        notes: expNotes.trim() || undefined,
        createdByUid: currentUserUid,
        createdAt: ts,
        updatedAt: ts,
      });
      setExpModalOpen(false);
      setExpLabel('');
      setExpSupplier('');
      setExpAmountHT(0);
      setExpNotes('');
    } finally {
      setExpSaving(false);
    }
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-4">
        <div>
          <h1 className="font-serif text-3xl font-semibold text-[#18181B]">
            Finances, Marges &amp; Trésorerie
          </h1>
          <p className="text-sm text-[#6B6A65] mt-1">
            Compte de résultat filtrable par période, charges d’exploitation réelles et position de trésorerie.
          </p>
        </div>
        <button
          onClick={() => setExpModalOpen(true)}
          className="px-4 py-2 rounded-lg bg-[#721C24] hover:bg-[#5E161D] text-white text-xs font-medium flex items-center gap-1.5 self-start sm:self-auto cursor-pointer"
        >
          <Plus className="w-4 h-4" />
          Ajouter une charge
        </button>
      </div>

      {/* Period & Campaign Filter Bar */}
      <div className="bg-white border border-[#E5E4DF] rounded-xl p-4 flex flex-wrap items-center gap-3 text-xs">
        <div className="inline-flex rounded-lg border border-[#E5E4DF] p-0.5 bg-[#F6F6F4]">
          {(
            [
              ['all', 'Tout'],
              ['year', 'Année'],
              ['quarter', 'Trimestre'],
              ['month', 'Mois'],
            ] as const
          ).map(([id, label]) => (
            <button
              key={id}
              onClick={() => setPeriodType(id)}
              className={`px-3 py-1 rounded-md font-medium cursor-pointer ${
                periodType === id
                  ? 'bg-white text-[#721C24] shadow-xs'
                  : 'text-[#6B6A65]'
              }`}
            >
              {label}
            </button>
          ))}
        </div>

        {periodType !== 'all' && (
          <select
            value={selectedYear}
            onChange={(e) => setSelectedYear(Number(e.target.value))}
            className="px-2.5 py-1.5 border border-[#E5E4DF] rounded-lg bg-white font-mono"
          >
            {availableYears.map((y) => (
              <option key={y} value={y}>
                {y}
              </option>
            ))}
          </select>
        )}

        {periodType === 'quarter' && (
          <select
            value={selectedQuarter}
            onChange={(e) => setSelectedQuarter(Number(e.target.value))}
            className="px-2.5 py-1.5 border border-[#E5E4DF] rounded-lg bg-white"
          >
            <option value={1}>T1 (Jan–Mar)</option>
            <option value={2}>T2 (Avr–Juin)</option>
            <option value={3}>T3 (Juil–Sep)</option>
            <option value={4}>T4 (Oct–Déc)</option>
          </select>
        )}

        {periodType === 'month' && (
          <select
            value={selectedMonth}
            onChange={(e) => setSelectedMonth(Number(e.target.value))}
            className="px-2.5 py-1.5 border border-[#E5E4DF] rounded-lg bg-white"
          >
            {[
              'Janvier',
              'Février',
              'Mars',
              'Avril',
              'Mai',
              'Juin',
              'Juillet',
              'Août',
              'Septembre',
              'Octobre',
              'Novembre',
              'Décembre',
            ].map((m, idx) => (
              <option key={m} value={idx + 1}>
                {m}
              </option>
            ))}
          </select>
        )}

        <select
          value={campaignFilter}
          onChange={(e) => setCampaignFilter(e.target.value)}
          className="px-2.5 py-1.5 border border-[#E5E4DF] rounded-lg bg-white ml-auto"
        >
          <option value="all">Toutes les campagnes</option>
          {campaigns.map((c) => (
            <option key={c} value={c}>
              {c}
            </option>
          ))}
        </select>
      </div>

      {/* Treasury Strip */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div className="bg-white border border-[#E5E4DF] rounded-xl p-4">
          <div className="flex items-center justify-between text-xs text-[#6B6A65] uppercase tracking-wider">
            <span>Créances clients (à encaisser)</span>
            <Wallet className="w-4 h-4 text-[#B45309]" />
          </div>
          <div className="mt-1.5 font-mono text-2xl font-semibold text-[#B45309] tabular-nums">
            {formatEUR(pnl.resteAEncaisserTTC)}
          </div>
          <div className="text-xs text-[#6B6A65] mt-0.5">TTC en attente de règlement</div>
        </div>

        <div className="bg-white border border-[#E5E4DF] rounded-xl p-4">
          <div className="flex items-center justify-between text-xs text-[#6B6A65] uppercase tracking-wider">
            <span>Dettes domaines (à régler)</span>
            <CreditCard className="w-4 h-4 text-[#B91C1C]" />
          </div>
          <div className="mt-1.5 font-mono text-2xl font-semibold text-[#B91C1C] tabular-nums">
            {formatEUR(pnl.dettesDomainesHT)}
          </div>
          <div className="text-xs text-[#6B6A65] mt-0.5">HT sur lots non encore réglés</div>
        </div>

        <div className="bg-white border border-[#E5E4DF] rounded-xl p-4">
          <div className="flex items-center justify-between text-xs text-[#6B6A65] uppercase tracking-wider">
            <span>Stock valorisé (cave + payé)</span>
            <Package className="w-4 h-4 text-[#721C24]" />
          </div>
          <div className="mt-1.5 font-mono text-2xl font-semibold text-[#18181B] tabular-nums">
            {formatEUR(pnl.stockValoriseHT)}
          </div>
          <div className="text-xs text-[#6B6A65] mt-0.5">Coût moyen pondéré HT</div>
        </div>
      </div>

      {/* P&L Waterfall */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        <div className="lg:col-span-6 bg-white border border-[#E5E4DF] rounded-xl p-5 space-y-3">
          <div className="flex items-center gap-2 pb-2 border-b border-[#E5E4DF]">
            <TrendingUp className="w-4 h-4 text-[#721C24]" />
            <h2 className="font-serif text-xl font-semibold">
              Compte de résultat synthétique (HT)
            </h2>
          </div>

          <div className="space-y-2 text-sm">
            <div className="flex justify-between">
              <span className="text-[#6B6A65]">
                Chiffre d’affaires vins HT ({pnl.bottlesSold} btl)
              </span>
              <span className="font-mono font-medium">{formatEUR(pnl.caHT)}</span>
            </div>
            {pnl.shippingClientHT > 0 && (
              <div className="flex justify-between text-xs">
                <span className="text-[#6B6A65]">+ Port refacturé clients HT</span>
                <span className="font-mono">{formatEUR(pnl.shippingClientHT)}</span>
              </div>
            )}
            <div className="flex justify-between">
              <span className="text-[#6B6A65]">− Coût d’achat vins HT (EXW figé)</span>
              <span className="font-mono text-[#B91C1C]">
                -{formatEUR(pnl.coutVinHT)}
              </span>
            </div>

            <div className="flex justify-between pt-2 border-t border-[#E5E4DF] font-semibold">
              <span>= Marge brute vins HT</span>
              <span className="font-mono text-[#18181B]">
                {formatEUR(pnl.margeBruteVinsHT)}
              </span>
            </div>

            <div className="flex justify-between text-xs text-[#6B6A65] pt-1">
              <span>− Port réel facturé sur lots domaines HT</span>
              <span className="font-mono">-{formatEUR(pnl.actualLotShippingHT)}</span>
            </div>
            <div className="flex justify-between text-xs text-[#6B6A65]">
              <span>− Charges d’exploitation saisies HT</span>
              <span className="font-mono">-{formatEUR(pnl.totalExpensesHT)}</span>
            </div>
            {(pnl.coutPersoHT > 0 || pnl.coutCasseAjustementHT > 0) && (
              <div className="flex justify-between text-xs text-[#B45309]">
                <span className="flex items-center gap-1">
                  <AlertTriangle className="w-3.5 h-3.5" />
                  − Sorties cave perso ({pnl.bottlesPerso} btl) &amp; casse/dégust. HT
                </span>
                <span className="font-mono">
                  -{formatEUR(pnl.coutPersoHT + pnl.coutCasseAjustementHT)}
                </span>
              </div>
            )}

            <div className="flex justify-between pt-3 border-t-2 border-[#18181B] text-base font-semibold">
              <span>= Résultat d’exploitation net HT</span>
              <span
                className={`font-mono ${
                  pnl.resultatNetExploitationHT >= 0
                    ? 'text-[#15803D]'
                    : 'text-[#B91C1C]'
                }`}
              >
                {formatEUR(pnl.resultatNetExploitationHT, true)}
              </span>
            </div>
          </div>

          <div className="pt-3 border-t border-[#E5E4DF] text-xs text-[#6B6A65] space-y-1">
            <div className="flex justify-between">
              <span>Rappel : Marge commerciale modèle (forfait logistique {formatEUR(pnl.fraisLogistiqueTheoriqueHT)})</span>
              <span className="font-mono font-medium text-[#18181B]">
                {formatEUR(pnl.margeCommercialeHT, true)}
              </span>
            </div>
            {pnl.totalAvoirsHT > 0 && (
              <div className="flex justify-between text-[#B45309]">
                <span>Avoirs émis sur la période (déjà annulés)</span>
                <span className="font-mono">{formatEUR(pnl.totalAvoirsHT)} HT</span>
              </div>
            )}
          </div>
        </div>

        {/* Operating Expenses List */}
        <div className="lg:col-span-6 bg-white border border-[#E5E4DF] rounded-xl overflow-hidden flex flex-col">
          <div className="p-5 border-b border-[#E5E4DF] flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Receipt className="w-4 h-4 text-[#721C24]" />
              <h2 className="font-serif text-xl font-semibold">
                Charges d’exploitation ({pnl.filteredExpenses.length})
              </h2>
            </div>
            <span className="font-mono text-sm font-semibold text-[#B91C1C]">
              {formatEUR(pnl.totalExpensesHT)} HT
            </span>
          </div>

          <div className="divide-y divide-[#E5E4DF] flex-1 overflow-y-auto max-h-[360px]">
            {pnl.filteredExpenses
              .slice()
              .sort((a, b) => b.date.localeCompare(a.date))
              .map((exp) => (
                <div
                  key={exp.id}
                  className="p-3.5 flex items-center justify-between gap-3 text-sm"
                >
                  <div>
                    <div className="font-medium text-[#18181B]">{exp.label}</div>
                    <div className="text-xs text-[#6B6A65]">
                      {formatDateFR(exp.date)} · {EXPENSE_CAT_LABELS[exp.category]}
                      {exp.supplier ? ` · ${exp.supplier}` : ''}
                    </div>
                  </div>
                  <div className="flex items-center gap-3 shrink-0">
                    <div className="text-right">
                      <div className="font-mono font-semibold text-[#18181B]">
                        {formatEUR(exp.amountHT)} HT
                      </div>
                      <div className="text-[10px] font-mono text-[#6B6A65]">
                        TVA {exp.tvaRatePct}%
                      </div>
                    </div>
                    <button
                      onClick={() => onDeleteExpense(exp.id)}
                      className="p-1 text-[#6B6A65] hover:text-[#B91C1C] cursor-pointer"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>
              ))}
            {pnl.filteredExpenses.length === 0 && (
              <div className="p-8 text-center text-xs text-[#6B6A65]">
                Aucune charge enregistrée sur cette période (stockage, transport, emballage, commissions…).
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Breakdown by Campaign */}
      <div className="bg-white border border-[#E5E4DF] rounded-xl overflow-hidden">
        <div className="p-5 border-b border-[#E5E4DF]">
          <h2 className="font-serif text-xl font-semibold">
            Rentabilité par campagne / vente
          </h2>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-[#F6F6F4] text-xs text-[#6B6A65] uppercase">
              <tr>
                <th className="text-left py-2.5 px-4 font-medium">Campagne</th>
                <th className="text-right py-2.5 px-3 font-medium">Btl</th>
                <th className="text-right py-2.5 px-3 font-medium">CA TTC</th>
                <th className="text-right py-2.5 px-3 font-medium">CA HT</th>
                <th className="text-right py-2.5 px-3 font-medium">Achat HT</th>
                <th className="text-right py-2.5 px-3 font-medium">Marge nette €</th>
                <th className="text-right py-2.5 px-4 font-medium">Taux net</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[#E5E4DF]">
              {pnl.campaignsBreakdown.map((c) => {
                const cost = c.coutVinHT + c.logHT;
                const pct = cost > 0 ? (c.margeHT / cost) * 100 : 0;
                return (
                  <tr key={c.vente} className="hover:bg-[#FAF9F6]">
                    <td className="py-2.5 px-4 font-medium text-[#18181B]">
                      {c.vente}
                    </td>
                    <td className="py-2.5 px-3 text-right font-mono">{c.bottles}</td>
                    <td className="py-2.5 px-3 text-right font-mono">
                      {formatEUR(c.caTTC)}
                    </td>
                    <td className="py-2.5 px-3 text-right font-mono">
                      {formatEUR(c.caHT)}
                    </td>
                    <td className="py-2.5 px-3 text-right font-mono text-[#6B6A65]">
                      {formatEUR(c.coutVinHT)}
                    </td>
                    <td
                      className={`py-2.5 px-3 text-right font-mono font-semibold ${
                        c.margeHT >= 0 ? 'text-[#15803D]' : 'text-[#B91C1C]'
                      }`}
                    >
                      {formatEUR(c.margeHT, true)}
                    </td>
                    <td className="py-2.5 px-4 text-right font-mono text-xs">
                      {formatPct(pct)}
                    </td>
                  </tr>
                );
              })}
              {pnl.campaignsBreakdown.length === 0 && (
                <tr>
                  <td colSpan={7} className="py-8 text-center text-xs text-[#6B6A65]">
                    Aucune vente sur cette période.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Add Operating Expense Modal */}
      {expModalOpen && (
        <div className="fixed inset-0 bg-black/45 z-50 flex items-center justify-center p-4">
          <form
            onSubmit={handleAddExpense}
            className="bg-white border border-[#E5E4DF] rounded-xl w-full max-w-md p-6 space-y-4 text-sm"
          >
            <div className="flex items-center justify-between pb-3 border-b border-[#E5E4DF]">
              <h3 className="font-serif text-xl font-semibold">
                Nouvelle charge d’exploitation
              </h3>
              <button
                type="button"
                onClick={() => setExpModalOpen(false)}
                className="p-1 text-[#6B6A65] cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-medium text-[#6B6A65] mb-1">
                  Date
                </label>
                <input
                  type="date"
                  value={expDate}
                  onChange={(e) => setExpDate(e.target.value)}
                  className="w-full px-3 py-2 border border-[#E5E4DF] rounded-lg"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-[#6B6A65] mb-1">
                  Catégorie
                </label>
                <select
                  value={expCat}
                  onChange={(e) => setExpCat(e.target.value as ExpenseCategory)}
                  className="w-full px-3 py-2 border border-[#E5E4DF] rounded-lg bg-white"
                >
                  {Object.entries(EXPENSE_CAT_LABELS).map(([k, l]) => (
                    <option key={k} value={k}>
                      {l}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            <div>
              <label className="block text-xs font-medium text-[#6B6A65] mb-1">
                Libellé *
              </label>
              <input
                required
                value={expLabel}
                onChange={(e) => setExpLabel(e.target.value)}
                placeholder="ex: Loyer garde-vin octobre, Cartons 6 btl…"
                className="w-full px-3 py-2 border border-[#E5E4DF] rounded-lg"
              />
            </div>

            <div>
              <label className="block text-xs font-medium text-[#6B6A65] mb-1">
                Fournisseur / Prestataire
              </label>
              <input
                value={expSupplier}
                onChange={(e) => setExpSupplier(e.target.value)}
                className="w-full px-3 py-2 border border-[#E5E4DF] rounded-lg"
              />
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-medium text-[#6B6A65] mb-1">
                  Montant HT (€) *
                </label>
                <input
                  required
                  type="number"
                  min="0.01"
                  step="0.01"
                  value={expAmountHT || ''}
                  onChange={(e) =>
                    setExpAmountHT(Math.max(0, Number(e.target.value) || 0))
                  }
                  className="w-full px-3 py-2 border border-[#E5E4DF] rounded-lg font-mono"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-[#6B6A65] mb-1">
                  TVA (%)
                </label>
                <input
                  type="number"
                  min="0"
                  max="30"
                  step="0.5"
                  value={expTvaPct}
                  onChange={(e) =>
                    setExpTvaPct(Math.max(0, Number(e.target.value) || 0))
                  }
                  className="w-full px-3 py-2 border border-[#E5E4DF] rounded-lg font-mono"
                />
              </div>
            </div>

            <div>
              <label className="block text-xs font-medium text-[#6B6A65] mb-1">
                Notes
              </label>
              <input
                value={expNotes}
                onChange={(e) => setExpNotes(e.target.value)}
                className="w-full px-3 py-2 border border-[#E5E4DF] rounded-lg"
              />
            </div>

            <div className="flex justify-end gap-2 pt-3 border-t border-[#E5E4DF]">
              <button
                type="button"
                onClick={() => setExpModalOpen(false)}
                className="px-4 py-2 rounded-lg border border-[#E5E4DF] cursor-pointer"
              >
                Annuler
              </button>
              <button
                type="submit"
                disabled={expSaving}
                className="px-4 py-2 rounded-lg bg-[#721C24] text-white font-medium cursor-pointer"
              >
                {expSaving ? 'Enregistrement…' : 'Enregistrer la charge'}
              </button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
};
