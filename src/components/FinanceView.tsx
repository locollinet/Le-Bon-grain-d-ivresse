import React, { useEffect, useMemo, useState } from 'react';
import { AlertCircle, SlidersHorizontal, TrendingUp } from 'lucide-react';
import { AppSettings, OrderLine, WineCatalogItem } from '../types/wine';
import {
  computeBottleEconomics,
  computeOrderLineEconomics,
  formatEUR,
  formatPct,
} from '../utils/wineMath';

interface FinanceViewProps {
  catalog: WineCatalogItem[];
  orders: OrderLine[];
  settings: AppSettings;
  initialFocus?: { vente?: string } | null;
  onUpdateSettings: (next: AppSettings) => void;
}

type BreakdownMode = 'campaign' | 'domaine' | 'cuvee';

export const FinanceView: React.FC<FinanceViewProps> = ({
  catalog,
  orders,
  settings,
  initialFocus,
  onUpdateSettings,
}) => {
  const [mode, setMode] = useState<BreakdownMode>('campaign');
  const [campaignFilter, setCampaignFilter] = useState<string>('all');

  useEffect(() => {
    if (initialFocus?.vente) {
      setCampaignFilter(initialFocus.vente);
    }
  }, [initialFocus]);

  const catalogMap = useMemo(
    () => new Map(catalog.map((c) => [c.id, c])),
    [catalog]
  );

  const uniqueCampaigns = useMemo(
    () => Array.from(new Set(orders.map((o) => o.vente))).sort(),
    [orders]
  );

  const activeOrders = useMemo(() => {
    return orders.filter(
      (o) =>
        o.statut !== 'annule' &&
        (campaignFilter === 'all' || o.vente === campaignFilter)
    );
  }, [orders, campaignFilter]);

  const pnlSummary = useMemo(() => {
    let caTTC = 0;
    let caHT = 0;
    let coutVinHT = 0;
    let fraisLogistique = 0;
    let margeNette = 0;
    let totalBottles = 0;
    let persoBottles = 0;
    let benchSumTTC = 0;
    let lbgVsBenchSumTTC = 0;

    for (const o of activeOrders) {
      const cat = catalogMap.get(o.catalogId);
      const lineEcon = computeOrderLineEconomics(o, cat, settings);
      if (lineEcon.isPerso) {
        persoBottles += o.qte;
        continue;
      }

      totalBottles += o.qte;
      caTTC += lineEcon.caTTC;
      caHT += lineEcon.caHT;
      coutVinHT += lineEcon.coutVinHT;
      fraisLogistique += lineEcon.fraisLogistiqueHT;
      margeNette += lineEcon.margeEuroTotal;

      if (cat?.benchTTC && cat.benchTTC > 0) {
        benchSumTTC += cat.benchTTC * o.qte;
        lbgVsBenchSumTTC += o.prixUnitaireTTC * o.qte;
      }
    }

    const tvaCollectee = caTTC - caHT;
    const totalCostHT = coutVinHT + fraisLogistique;
    const margePct = totalCostHT > 0 ? (margeNette / totalCostHT) * 100 : 0;
    const avgDiscountVsBench =
      benchSumTTC > 0
        ? ((lbgVsBenchSumTTC - benchSumTTC) / benchSumTTC) * 100
        : 0;

    return {
      totalBottles,
      persoBottles,
      caTTC,
      tvaCollectee,
      caHT,
      coutVinHT,
      fraisLogistique,
      margeNette,
      margePct,
      avgDiscountVsBench,
    };
  }, [activeOrders, catalogMap, settings]);

  const groupedRows = useMemo(() => {
    const map = new Map<
      string,
      {
        key: string;
        sublabel: string;
        bottles: number;
        caTTC: number;
        caHT: number;
        coutVinHT: number;
        coutTotalHT: number;
        margeNette: number;
        benchDeltaSum: number;
        benchBaseSum: number;
      }
    >();

    for (const o of activeOrders) {
      const cat = catalogMap.get(o.catalogId);
      const lineEcon = computeOrderLineEconomics(o, cat, settings);
      if (lineEcon.isPerso) continue;

      let key = o.vente;
      let sublabel = '';

      if (mode === 'domaine') {
        key = cat?.domaine ?? 'Autre domaine';
        sublabel = cat?.region ?? '';
      } else if (mode === 'cuvee') {
        key = cat ? `${cat.domaine} — ${cat.cuvee}` : o.produitLabel;
        sublabel = o.vente;
      } else {
        sublabel = cat?.region ?? 'Campagne';
      }

      const existing = map.get(key) ?? {
        key,
        sublabel,
        bottles: 0,
        caTTC: 0,
        caHT: 0,
        coutVinHT: 0,
        coutTotalHT: 0,
        margeNette: 0,
        benchDeltaSum: 0,
        benchBaseSum: 0,
      };

      existing.bottles += o.qte;
      existing.caTTC += lineEcon.caTTC;
      existing.caHT += lineEcon.caHT;
      existing.coutVinHT += lineEcon.coutVinHT;
      existing.coutTotalHT += lineEcon.coutVinHT + lineEcon.fraisLogistiqueHT;
      existing.margeNette += lineEcon.margeEuroTotal;

      if (cat?.benchTTC && cat.benchTTC > 0) {
        existing.benchBaseSum += cat.benchTTC * o.qte;
        existing.benchDeltaSum += (o.prixUnitaireTTC - cat.benchTTC) * o.qte;
      }

      map.set(key, existing);
    }

    return Array.from(map.values()).sort((a, b) => b.margeNette - a.margeNette);
  }, [activeOrders, catalogMap, mode, settings]);

  const maxBarCA = useMemo(
    () => Math.max(1, ...groupedRows.map((r) => r.caTTC)),
    [groupedRows]
  );

  const negativeMarginCuvees = useMemo(() => {
    return catalog
      .map((c) => ({
        item: c,
        econ: computeBottleEconomics(c, settings),
      }))
      .filter((x) => x.econ.margeEuro < 1.0)
      .sort((a, b) => a.econ.margeEuro - b.econ.margeEuro);
  }, [catalog, settings]);

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col lg:flex-row lg:items-end justify-between gap-4">
        <div>
          <h1 className="font-display text-3xl font-semibold text-[#141413] tracking-tight">
            Bilans financiers &amp; rentabilité
          </h1>
          <p className="text-sm text-[#6B6B66] mt-1">
            Comprenez exactement ce qui génère de la marge nette, par vente,
            par domaine et par cuvée.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-3">
          <select
            value={campaignFilter}
            onChange={(e) => setCampaignFilter(e.target.value)}
            className="px-3 py-2 text-sm bg-white border border-[#D8D6D0] rounded-lg focus:outline-none focus:border-[#721C24]"
          >
            <option value="all">Toutes les ventes cumulées</option>
            {uniqueCampaigns.map((v) => (
              <option key={v} value={v}>
                {v}
              </option>
            ))}
          </select>
        </div>
      </div>

      {/* P&L Waterfall Card */}
      <div className="bg-white border border-[#E5E4DF] rounded-xl p-6 space-y-5">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-[#ECEAE4] pb-4">
          <div className="flex items-center gap-2">
            <TrendingUp className="w-4 h-4 text-[#721C24]" />
            <h2 className="text-base font-semibold text-[#141413]">
              Compte de résultat synthétique (
              {campaignFilter === 'all' ? 'Toutes ventes' : campaignFilter})
            </h2>
          </div>

          {/* Interactive Assumption Control (Amont + Aval + Marque EXW) */}
          <div className="flex flex-wrap items-center gap-3 text-xs text-[#6B6B66]">
            <div className="flex items-center gap-1.5">
              <SlidersHorizontal className="w-3.5 h-3.5" />
              <span>Amont :</span>
              <input
                type="number"
                step="0.25"
                min="0"
                max="10"
                value={settings.fraisLogistiqueAmont}
                onChange={(e) => {
                  const raw = Number(e.target.value);
                  const amont = Number.isFinite(raw) ? Math.max(0, raw) : 0;
                  onUpdateSettings({
                    ...settings,
                    fraisLogistiqueAmont: amont,
                    fraisLogistiqueParBouteille: amont + settings.fraisLogistiqueAval,
                  });
                }}
                className="w-16 px-2 py-1 font-mono-num text-[#141413] bg-[#FAF9F7] border border-[#D8D6D0] rounded"
              />
              <span>€</span>
            </div>
            <div className="flex items-center gap-1.5">
              <span>Aval :</span>
              <input
                type="number"
                step="0.25"
                min="0"
                max="15"
                value={settings.fraisLogistiqueAval}
                onChange={(e) => {
                  const raw = Number(e.target.value);
                  const aval = Number.isFinite(raw) ? Math.max(0, raw) : 0;
                  onUpdateSettings({
                    ...settings,
                    fraisLogistiqueAval: aval,
                    fraisLogistiqueParBouteille: settings.fraisLogistiqueAmont + aval,
                  });
                }}
                className="w-16 px-2 py-1 font-mono-num text-[#141413] bg-[#FAF9F7] border border-[#D8D6D0] rounded"
              />
              <span>€ HT</span>
            </div>
          </div>
        </div>

        <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-6 gap-4">
          <div>
            <div className="text-xs text-[#6B6B66]">CA Encaissé TTC</div>
            <div className="mt-1 text-lg font-semibold font-mono-num text-[#141413]">
              {formatEUR(pnlSummary.caTTC)}
            </div>
            <div className="text-[11px] text-[#6B6B66] mt-0.5 tabular-nums">
              {pnlSummary.totalBottles} btl validées
            </div>
          </div>

          <div>
            <div className="text-xs text-[#6B6B66]">TVA Collectée (20 %)</div>
            <div className="mt-1 text-lg font-semibold font-mono-num text-[#6B6B66]">
              -{formatEUR(pnlSummary.tvaCollectee)}
            </div>
            <div className="text-[11px] text-[#6B6B66] mt-0.5 tabular-nums">
              CA HT : {formatEUR(pnlSummary.caHT)}
            </div>
          </div>

          <div>
            <div className="text-xs text-[#6B6B66]">Coût d’achat vin HT</div>
            <div className="mt-1 text-lg font-semibold font-mono-num text-[#6B6B66]">
              -{formatEUR(pnlSummary.coutVinHT)}
            </div>
            <div className="text-[11px] text-[#6B6B66] mt-0.5">
              Factures domaines
            </div>
          </div>

          <div>
            <div className="text-xs text-[#6B6B66]">Port &amp; emballage HT</div>
            <div className="mt-1 text-lg font-semibold font-mono-num text-[#6B6B66]">
              -{formatEUR(pnlSummary.fraisLogistique)}
            </div>
            <div className="text-[11px] text-[#6B6B66] mt-0.5">
              Transport &amp; cartons
            </div>
          </div>

          <div>
            <div className="text-xs text-[#6B6B66]">Bénéfice Net Réel</div>
            <div
              className={`mt-1 text-xl font-bold font-mono-num ${
                pnlSummary.margeNette >= 0
                  ? 'text-[#15803D]'
                  : 'text-[#B91C1C]'
              }`}
            >
              {formatEUR(pnlSummary.margeNette, true)}
            </div>
            <div className="text-[11px] font-medium text-[#15803D] mt-0.5 tabular-nums">
              Marge nette : {formatPct(pnlSummary.margePct)}
            </div>
          </div>

          <div>
            <div className="text-xs text-[#6B6B66]">Positionnement Marché</div>
            <div className="mt-1 text-lg font-semibold font-mono-num text-[#721C24]">
              {formatPct(pnlSummary.avgDiscountVsBench, true)}
            </div>
            <div className="text-[11px] text-[#6B6B66] mt-0.5">
              vs Benchmark caviste
            </div>
          </div>
        </div>
      </div>

      {/* Mode Switch + Visual Bar Chart & Table */}
      <div className="grid grid-cols-1 xl:grid-cols-3 gap-6">
        {/* Main Breakdown (2 cols) */}
        <div className="xl:col-span-2 bg-white border border-[#E5E4DF] rounded-xl overflow-hidden">
          <div className="flex flex-wrap items-center justify-between gap-3 px-6 py-4 border-b border-[#E5E4DF]">
            <h2 className="text-base font-semibold text-[#141413]">
              Décomposition de la rentabilité
            </h2>
            <div className="flex items-center gap-1 p-1 bg-[#F6F6F4] rounded-lg">
              {(
                [
                  ['campaign', 'Par vente'],
                  ['domaine', 'Par domaine'],
                  ['cuvee', 'Par cuvée'],
                ] as const
              ).map(([k, label]) => (
                <button
                  key={k}
                  onClick={() => setMode(k)}
                  className={`px-3 py-1 text-xs font-medium rounded-md transition-colors whitespace-nowrap ${
                    mode === k
                      ? 'bg-white text-[#141413] shadow-sm'
                      : 'text-[#6B6B66] hover:text-[#141413]'
                  }`}
                >
                  {label}
                </button>
              ))}
            </div>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse text-sm">
              <thead>
                <tr className="bg-[#FAF9F7] text-xs text-[#6B6B66] border-b border-[#E5E4DF]">
                  <th className="py-3 px-5 font-medium">
                    {mode === 'campaign'
                      ? 'Vente'
                      : mode === 'domaine'
                        ? 'Domaine'
                        : 'Cuvée'}
                  </th>
                  <th className="py-3 px-3 font-medium text-right">Btl</th>
                  <th className="py-3 px-4 font-medium text-right">CA TTC</th>
                  <th className="py-3 px-4 font-medium text-right">
                    Achat HT
                  </th>
                  <th className="py-3 px-4 font-medium text-right">
                    Marge nette €
                  </th>
                  <th className="py-3 px-4 font-medium text-right">Marge %</th>
                  <th className="py-3 px-5 font-medium text-right">
                    vs Marché
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#ECEAE4]">
                {groupedRows.map((r) => {
                  const pct =
                    r.coutTotalHT > 0 ? (r.margeNette / r.coutTotalHT) * 100 : 0;
                  const benchPct =
                    r.benchBaseSum > 0
                      ? (r.benchDeltaSum / r.benchBaseSum) * 100
                      : null;
                  const barWidth = Math.max(4, (r.caTTC / maxBarCA) * 100);

                  return (
                    <tr
                      key={r.key}
                      className="hover:bg-[#FAF9F7] transition-colors"
                    >
                      <td className="py-3 px-5">
                        <div className="font-medium text-[#141413]">
                          {r.key}
                        </div>
                        <div className="mt-1.5 w-full max-w-[200px] h-1.5 bg-[#ECEAE4] rounded-full overflow-hidden">
                          <div
                            className="h-full bg-[#721C24]"
                            style={{ width: `${barWidth}%` }}
                          />
                        </div>
                      </td>
                      <td className="py-3 px-3 text-right font-mono-num">
                        {r.bottles}
                      </td>
                      <td className="py-3 px-4 text-right font-mono-num font-medium">
                        {formatEUR(r.caTTC)}
                      </td>
                      <td className="py-3 px-4 text-right font-mono-num text-[#6B6B66]">
                        {formatEUR(r.coutVinHT)}
                      </td>
                      <td
                        className={`py-3 px-4 text-right font-mono-num font-semibold ${
                          r.margeNette >= 0
                            ? 'text-[#15803D]'
                            : 'text-[#B91C1C]'
                        }`}
                      >
                        {formatEUR(r.margeNette, true)}
                      </td>
                      <td
                        className={`py-3 px-4 text-right font-mono-num ${
                          pct < 5 ? 'text-[#B45309]' : 'text-[#141413]'
                        }`}
                      >
                        {formatPct(pct)}
                      </td>
                      <td className="py-3 px-5 text-right font-mono-num text-xs text-[#6B6B66]">
                        {benchPct !== null ? formatPct(benchPct, true) : '—'}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>

        {/* Right Panel: Margin Watchlist */}
        <div className="bg-white border border-[#E5E4DF] rounded-xl p-5 space-y-4 h-fit">
          <div className="flex items-center gap-2">
            <AlertCircle className="w-4 h-4 text-[#B91C1C]" />
            <h2 className="text-base font-semibold text-[#141413]">
              Cuvées à marge faible ou négative
            </h2>
          </div>
          <p className="text-xs text-[#6B6B66] leading-relaxed">
            Ces références dégagent moins de 1,00 € net par bouteille après TVA
            et port. Un ajustement de +2 € à +4 € TTC reste souvent bien
            en-dessous du benchmark caviste.
          </p>

          <div className="divide-y divide-[#ECEAE4]">
            {negativeMarginCuvees.map(({ item, econ }) => (
              <div key={item.id} className="py-3 first:pt-0 last:pb-0">
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <div className="text-sm font-medium text-[#141413]">
                      {item.cuvee}
                    </div>
                    <div className="text-xs text-[#6B6B66]">
                      {item.domaine} · LBG {formatEUR(item.prixLbgTTC)}
                      {item.benchTTC
                        ? ` vs Bench ${formatEUR(item.benchTTC)}`
                        : ''}
                    </div>
                  </div>
                  <div className="text-right font-mono-num shrink-0">
                    <div
                      className={`text-sm font-semibold ${
                        econ.margeEuro < 0
                          ? 'text-[#B91C1C]'
                          : 'text-[#B45309]'
                      }`}
                    >
                      {formatEUR(econ.margeEuro, true)}
                    </div>
                    <div className="text-[11px] text-[#6B6B66]">
                      {formatPct(econ.margePct)}
                    </div>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
};
