import React, { useMemo, useState } from 'react';
import {
  AlertTriangle,
  ArrowRight,
  CheckCircle2,
  ClipboardPaste,
  PackagePlus,
  Plus,
  Wine,
  X,
} from 'lucide-react';
import {
  ActiveTab,
  AppSettings,
  OrderLine,
  SalesCampaign,
  StockSummaryRow,
  WineCatalogItem,
} from '../types/wine';
import {
  computeBottleEconomics,
  computeOrderLineEconomics,
  formatDateFR,
  formatEUR,
  formatPct,
} from '../utils/wineMath';
import { DataSourceBanner } from './DataSourceBanner';

interface DashboardViewProps {
  catalog: WineCatalogItem[];
  orders: OrderLine[];
  stockRows: StockSummaryRow[];
  campaigns: SalesCampaign[];
  settings: AppSettings;
  isDemoMode: boolean;
  onEnableDemoMode: () => void;
  onDisableDemoMode: () => void;
  onNavigate: (tab: ActiveTab) => void;
  onOpenCampaignOrders?: (vente: string) => void;
  onOpenImport: () => void;
  onOpenInvoiceAI: () => void;
  onOpenNewLot: () => void;
  onOpenNewDirectOrder: () => void;
  onUpdateCampaignStatus: (
    campaignId: string,
    statut: SalesCampaign['statut']
  ) => void;
  onAddCampaign: (camp: SalesCampaign) => void;
}

export const DashboardView: React.FC<DashboardViewProps> = ({
  catalog,
  orders,
  stockRows,
  campaigns,
  settings,
  isDemoMode,
  onEnableDemoMode,
  onDisableDemoMode,
  onNavigate,
  onOpenCampaignOrders,
  onOpenImport,
  onOpenInvoiceAI,
  onOpenNewLot,
  onOpenNewDirectOrder,
  onUpdateCampaignStatus,
  onAddCampaign,
}) => {
  const [showGuide, setShowGuide] = useState<boolean>(() => {
    try {
      return localStorage.getItem('lbg_hide_guide_v1') !== '1';
    } catch {
      return true;
    }
  });
  const [addingCampaign, setAddingCampaign] = useState(false);
  const [newCampName, setNewCampName] = useState('');
  const [newCampDate, setNewCampDate] = useState(
    new Date().toISOString().slice(0, 10)
  );
  const [newCampCanal, setNewCampCanal] =
    useState<SalesCampaign['canal']>('Club');
  const [newCampContact, setNewCampContact] = useState('Romain');

  const dismissGuide = () => {
    setShowGuide(false);
    try {
      localStorage.setItem('lbg_hide_guide_v1', '1');
    } catch {
      // ignore
    }
  };

  const handleCreateCampaign = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newCampName.trim()) return;
    onAddCampaign({
      id: `camp_${Date.now()}`,
      nom: newCampName.trim(),
      domaine: newCampName.trim(),
      dateOuverture: newCampDate,
      canal: newCampCanal,
      contact: newCampContact.trim() || undefined,
      statut: 'Planifiée',
    });
    setNewCampName('');
    setAddingCampaign(false);
  };
  const catalogMap = useMemo(
    () => new Map(catalog.map((c) => [c.id, c])),
    [catalog]
  );

  const metrics = useMemo(() => {
    const validOrders = orders.filter((o) => o.statut !== 'annule');
    let caTTC = 0;
    let caHT = 0;
    let coutTotalHT = 0;
    let margeTotal = 0;
    let totalBottles = 0;
    let readyToDeliver = 0;
    let awaitingDomain = 0;

    for (const o of validOrders) {
      const cat = catalogMap.get(o.catalogId);
      const lineEcon = computeOrderLineEconomics(o, cat, settings);
      if (!lineEcon.isPerso) {
        totalBottles += o.qte;
        caTTC += lineEcon.caTTC;
        caHT += lineEcon.caHT;
        coutTotalHT += lineEcon.coutVinHT + lineEcon.fraisLogistiqueHT;
        margeTotal += lineEcon.margeEuroTotal;
      }
      if (o.statut === 'recu_lbg') readyToDeliver += o.qte;
      if (o.statut === 'attente_reception') awaitingDomain += o.qte;
    }

    const capitalImmobiliseHT = stockRows.reduce(
      (s, r) => s + r.capitalImmobiliseHT,
      0
    );
    const bottlesDispoVente = stockRows.reduce(
      (s, r) => s + Math.max(0, r.disponibleVente),
      0
    );

    const lowMarginItems = catalog
      .filter((c) => c.prixLbgTTC > 0)
      .map((c) => ({
        item: c,
        econ: computeBottleEconomics(c, settings),
      }))
      .filter((x) => x.econ.margePct < 5);

    const stockDeficitRows = stockRows.filter((r) => r.disponibleVente < 0);
    const advanceUnsoldRows = stockRows.filter(
      (r) => r.hasAdvanceStock && r.disponibleVente > 0
    );

    return {
      caTTC,
      caHT,
      margeTotal,
      margePct: coutTotalHT > 0 ? (margeTotal / coutTotalHT) * 100 : 0,
      totalBottles,
      readyToDeliver,
      awaitingDomain,
      capitalImmobiliseHT,
      bottlesDispoVente,
      lowMarginItems,
      stockDeficitRows,
      advanceUnsoldRows,
    };
  }, [orders, catalogMap, settings, stockRows, catalog]);

  const campaignPerformance = useMemo(() => {
    const byVente = new Map<
      string,
      {
        vente: string;
        bottles: number;
        caTTC: number;
        coutTotalHT: number;
        marge: number;
        ready: number;
        waiting: number;
        delivered: number;
      }
    >();

    for (const o of orders) {
      if (o.statut === 'annule') continue;
      const cat = catalogMap.get(o.catalogId);
      const lineEcon = computeOrderLineEconomics(o, cat, settings);
      const existing = byVente.get(o.vente) ?? {
        vente: o.vente,
        bottles: 0,
        caTTC: 0,
        coutTotalHT: 0,
        marge: 0,
        ready: 0,
        waiting: 0,
        delivered: 0,
      };
      if (!lineEcon.isPerso) {
        existing.bottles += o.qte;
        existing.caTTC += lineEcon.caTTC;
        existing.coutTotalHT += lineEcon.coutVinHT + lineEcon.fraisLogistiqueHT;
        existing.marge += lineEcon.margeEuroTotal;
      }
      if (o.statut === 'recu_lbg') existing.ready += o.qte;
      if (o.statut === 'attente_reception') existing.waiting += o.qte;
      if (o.statut === 'remis_client') existing.delivered += o.qte;
      byVente.set(o.vente, existing);
    }

    return Array.from(byVente.values()).sort((a, b) => b.caTTC - a.caTTC);
  }, [orders, catalogMap, settings]);

  return (
    <div className="space-y-8">
      {/* Header Intro & Quick Actions */}
      <div className="flex flex-col lg:flex-row lg:items-end justify-between gap-4">
        <div>
          <h1 className="font-display text-3xl font-semibold text-[#141413] tracking-tight">
            Vue d’ensemble du négoce
          </h1>
          <p className="text-sm text-[#6B6B66] mt-1">
            Synthèse des ventes HelloAsso, suivi des achats en avance et
            rentabilité nette par campagne.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2.5">
          <button
            onClick={onOpenNewLot}
            className="inline-flex items-center gap-2 px-4 py-2 text-sm font-medium text-[#141413] bg-white hover:bg-[#F6F6F4] border border-[#D8D6D0] rounded-lg transition-colors whitespace-nowrap shrink-0"
          >
            <PackagePlus className="w-4 h-4 text-[#721C24]" />
            <span>Achat en avance</span>
          </button>
          <button
            onClick={onOpenNewDirectOrder}
            className="inline-flex items-center gap-2 px-4 py-2 text-sm font-medium text-[#141413] bg-white hover:bg-[#F6F6F4] border border-[#D8D6D0] rounded-lg transition-colors whitespace-nowrap shrink-0"
          >
            <Plus className="w-4 h-4 text-[#721C24]" />
            <span>Vente directe</span>
          </button>
          <button
            onClick={onOpenImport}
            className="inline-flex items-center gap-2 px-4 py-2 text-sm font-medium text-white bg-[#721C24] hover:bg-[#5B151C] rounded-lg transition-colors whitespace-nowrap shrink-0"
          >
            <ClipboardPaste className="w-4 h-4" />
            <span>Importer HelloAsso</span>
          </button>
        </div>
      </div>

      {/* Transparent Excel vs Demo Mode Indicator */}
      <DataSourceBanner
        isDemoMode={isDemoMode}
        onEnableDemoMode={onEnableDemoMode}
        onDisableDemoMode={onDisableDemoMode}
        onOpenInvoiceAI={onOpenInvoiceAI}
        catalogCount={catalog.length}
        variant="dashboard"
      />

      {/* Quick Daily Workflow Guide (dismissible) */}
      {showGuide && (
        <div className="bg-white border border-[#E5E4DF] rounded-xl p-4 sm:px-5">
          <div className="flex items-center justify-between gap-4 mb-3">
            <span className="text-xs font-semibold uppercase tracking-wider text-[#721C24]">
              Vos 3 réflexes au quotidien
            </span>
            <button
              type="button"
              onClick={dismissGuide}
              className="text-xs text-[#6B6B66] hover:text-[#141413] inline-flex items-center gap-1"
            >
              <span>Masquer</span>
              <X className="w-3.5 h-3.5" />
            </button>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3 text-xs">
            <button
              type="button"
              onClick={onOpenImport}
              className="text-left p-3 bg-[#FAF9F7] hover:bg-[#F3F1EC] border border-[#ECEAE4] rounded-lg transition-colors"
            >
              <div className="font-semibold text-[#141413]">
                1. Importer vos ventes ou factures
              </div>
              <div className="text-[#6B6B66] mt-0.5">
                Collez votre export HelloAsso ou analysez une facture domaine par IA.
              </div>
            </button>
            <button
              type="button"
              onClick={() => onNavigate('stock')}
              className="text-left p-3 bg-[#FAF9F7] hover:bg-[#F3F1EC] border border-[#ECEAE4] rounded-lg transition-colors"
            >
              <div className="font-semibold text-[#141413]">
                2. Réceptionner les cartons en cave
              </div>
              <div className="text-[#6B6B66] mt-0.5">
                Un clic sur « Réceptionner » bascule les commandes clients prêtes.
              </div>
            </button>
            <button
              type="button"
              onClick={() => onNavigate('clients')}
              className="text-left p-3 bg-[#FAF9F7] hover:bg-[#F3F1EC] border border-[#ECEAE4] rounded-lg transition-colors"
            >
              <div className="font-semibold text-[#141413]">
                3. Remettre, facturer &amp; partager la carte
              </div>
              <div className="text-[#6B6B66] mt-0.5">
                Copiez le récap WhatsApp par client ou publiez la Carte des vins.
              </div>
            </button>
          </div>
        </div>
      )}

      {/* 4-Column KPI Strip */}
      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4">
        <div className="bg-white border border-[#E5E4DF] rounded-xl p-5">
          <div className="text-xs font-medium text-[#6B6B66]">
            Chiffre d’affaires validé (TTC)
          </div>
          <div className="mt-2 text-2xl font-semibold text-[#141413] font-mono-num">
            {formatEUR(metrics.caTTC)}
          </div>
          <div className="mt-2 text-xs text-[#6B6B66] flex items-center gap-1.5 tabular-nums">
            <span>{formatEUR(metrics.caHT)} HT</span>
            <span aria-hidden="true">·</span>
            <span>{metrics.totalBottles} bouteilles vendues</span>
          </div>
        </div>

        <div className="bg-white border border-[#E5E4DF] rounded-xl p-5">
          <div className="text-xs font-medium text-[#6B6B66]">
            Marge nette réalisée
          </div>
          <div className="mt-2 text-2xl font-semibold text-[#15803D] font-mono-num">
            {formatEUR(metrics.margeTotal, true)}
          </div>
          <div className="mt-2 text-xs text-[#6B6B66] flex items-center gap-1.5 tabular-nums">
            <span>Taux net : {formatPct(metrics.margePct)}</span>
            <span aria-hidden="true">·</span>
            <span>TVA &amp; port déduits</span>
          </div>
        </div>

        <div className="bg-white border border-[#E5E4DF] rounded-xl p-5">
          <div className="text-xs font-medium text-[#6B6B66]">
            Capital immobilisé (cave &amp; avances)
          </div>
          <div className="mt-2 text-2xl font-semibold text-[#141413] font-mono-num">
            {formatEUR(metrics.capitalImmobiliseHT)}
          </div>
          <div className="mt-2 text-xs text-[#6B6B66] flex items-center gap-1.5 tabular-nums">
            <span>{metrics.bottlesDispoVente} btl libres à vendre</span>
            <span aria-hidden="true">·</span>
            <button
              onClick={() => onNavigate('stock')}
              className="text-[#721C24] hover:underline font-medium"
            >
              Voir le stock
            </button>
          </div>
        </div>

        <div className="bg-white border border-[#E5E4DF] rounded-xl p-5">
          <div className="text-xs font-medium text-[#6B6B66]">
            Logistique en cours
          </div>
          <div className="mt-2 text-2xl font-semibold text-[#141413] font-mono-num">
            {metrics.readyToDeliver + metrics.awaitingDomain} btl
          </div>
          <div className="mt-2 text-xs flex items-center gap-1.5 tabular-nums">
            <span className="text-[#15803D] font-medium">
              {metrics.readyToDeliver} prêtes en cave
            </span>
            <span aria-hidden="true" className="text-[#C7C5BE]">
              ·
            </span>
            <span className="text-[#B45309] font-medium">
              {metrics.awaitingDomain} attente domaine
            </span>
          </div>
        </div>
      </div>

      {/* Main Split: Campaign P&L + Actionable Alerts */}
      <div className="grid grid-cols-1 xl:grid-cols-3 gap-6">
        {/* Left 2 cols: Performance par Campagne */}
        <div className="xl:col-span-2 bg-white border border-[#E5E4DF] rounded-xl overflow-hidden">
          <div className="flex items-center justify-between px-6 py-4 border-b border-[#E5E4DF]">
            <div>
              <h2 className="text-base font-semibold text-[#141413]">
                Bilan par vente &amp; allocation
              </h2>
              <p className="text-xs text-[#6B6B66] mt-0.5">
                Hors commandes annulées · Marge nette après TVA (
                {Math.round(settings.tvaRate * 100)} %) et frais logistiques
              </p>
            </div>
            <button
              onClick={() => onNavigate('finance')}
              className="inline-flex items-center gap-1 text-xs font-medium text-[#721C24] hover:underline whitespace-nowrap"
            >
              <span>Analyse complète</span>
              <ArrowRight className="w-3.5 h-3.5" />
            </button>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse text-sm">
              <thead>
                <tr className="bg-[#FAF9F7] text-xs text-[#6B6B66] border-b border-[#E5E4DF]">
                  <th className="py-3 px-5 font-medium">Vente / Campagne</th>
                  <th className="py-3 px-4 font-medium text-right">Btl</th>
                  <th className="py-3 px-4 font-medium text-right">CA TTC</th>
                  <th className="py-3 px-4 font-medium text-right">
                    Marge nette
                  </th>
                  <th className="py-3 px-4 font-medium text-right">Taux</th>
                  <th className="py-3 px-5 font-medium">Avancement</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#ECEAE4]">
                {campaignPerformance.map((row) => {
                  const pct =
                    row.coutTotalHT > 0 ? (row.marge / row.coutTotalHT) * 100 : 0;
                  return (
                    <tr
                      key={row.vente}
                      onClick={() => onOpenCampaignOrders?.(row.vente)}
                      className={`hover:bg-[#FAF9F7] transition-colors ${
                        onOpenCampaignOrders ? 'cursor-pointer' : ''
                      }`}
                    >
                      <td className="py-3.5 px-5 font-medium text-[#141413]">
                        {row.vente}
                      </td>
                      <td className="py-3.5 px-4 text-right font-mono-num text-[#141413]">
                        {row.bottles}
                      </td>
                      <td className="py-3.5 px-4 text-right font-mono-num text-[#141413]">
                        {formatEUR(row.caTTC)}
                      </td>
                      <td
                        className={`py-3.5 px-4 text-right font-mono-num font-medium ${
                          row.marge >= 0 ? 'text-[#15803D]' : 'text-[#B91C1C]'
                        }`}
                      >
                        {formatEUR(row.marge, true)}
                      </td>
                      <td className="py-3.5 px-4 text-right font-mono-num text-[#6B6B66]">
                        {formatPct(pct)}
                      </td>
                      <td className="py-3.5 px-5 text-xs whitespace-nowrap">
                        {row.waiting > 0 ? (
                          <span className="text-[#B45309] font-medium">
                            {row.waiting} btl en attente domaine
                          </span>
                        ) : row.ready > 0 ? (
                          <span className="text-[#15803D] font-medium">
                            {row.ready} btl prêtes en cave
                          </span>
                        ) : (
                          <span className="text-[#6B6B66]">
                            Clôturée · {row.delivered} remises
                          </span>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>

        {/* Right col: Points d'attention & Planning */}
        <div className="space-y-6">
          <div className="bg-white border border-[#E5E4DF] rounded-xl p-5 space-y-4">
            <h2 className="text-base font-semibold text-[#141413]">
              Points d’attention négoce
            </h2>

            <div className="divide-y divide-[#ECEAE4]">
              {/* Alert 1: Negative / low margin cuvees */}
              <div className="py-3 first:pt-0">
                <div className="flex items-start gap-2.5">
                  <AlertTriangle className="w-4 h-4 text-[#B91C1C] shrink-0 mt-0.5" />
                  <div className="text-xs space-y-1">
                    <div className="font-medium text-[#141413]">
                      {metrics.lowMarginItems.length} cuvée(s) sous 5 % de marge
                      nette
                    </div>
                    <p className="text-[#6B6B66] leading-relaxed">
                      {metrics.lowMarginItems
                        .slice(0, 2)
                        .map(
                          (x) =>
                            `${x.item.cuvee} (${formatEUR(x.econ.margeEuro, true)})`
                        )
                        .join(' · ')}
                    </p>
                    <button
                      onClick={() => onNavigate('catalog')}
                      className="text-[#721C24] font-medium hover:underline inline-block pt-0.5"
                    >
                      Ajuster les tarifs →
                    </button>
                  </div>
                </div>
              </div>

              {/* Alert 2: Advance stock ready to sell */}
              <div className="py-3">
                <div className="flex items-start gap-2.5">
                  <Wine className="w-4 h-4 text-[#721C24] shrink-0 mt-0.5" />
                  <div className="text-xs space-y-1">
                    <div className="font-medium text-[#141413]">
                      Stock acheté en avance disponible
                    </div>
                    <p className="text-[#6B6B66] leading-relaxed">
                      {metrics.advanceUnsoldRows.length > 0
                        ? metrics.advanceUnsoldRows
                            .slice(0, 3)
                            .map(
                              (r) =>
                                `${r.catalog.domaine} ${r.catalog.cuvee} (${r.disponibleVente} btl)`
                            )
                            .join(' · ')
                        : 'Aucun stock libre acheté en avance.'}
                    </p>
                    <button
                      onClick={() => onNavigate('stock')}
                      className="text-[#721C24] font-medium hover:underline inline-block pt-0.5"
                    >
                      Ouvrir la cave &amp; avances →
                    </button>
                  </div>
                </div>
              </div>

              {/* Alert 3: Bottles ready for client pickup */}
              <div className="py-3 last:pb-0">
                <div className="flex items-start gap-2.5">
                  <CheckCircle2 className="w-4 h-4 text-[#15803D] shrink-0 mt-0.5" />
                  <div className="text-xs space-y-1">
                    <div className="font-medium text-[#141413]">
                      {metrics.readyToDeliver} bouteilles reçues prêtes à
                      remettre
                    </div>
                    <p className="text-[#6B6B66] leading-relaxed">
                      Générez les récapitulatifs par client pour organiser vos
                      remises groupées.
                    </p>
                    <button
                      onClick={() => onNavigate('clients')}
                      className="text-[#721C24] font-medium hover:underline inline-block pt-0.5"
                    >
                      Voir les rapports clients →
                    </button>
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* Planning des ventes (from Planning tab) */}
          <div className="bg-white border border-[#E5E4DF] rounded-xl p-5">
            <div className="flex items-center justify-between gap-2 mb-3">
              <h2 className="text-base font-semibold text-[#141413]">
                Planning des ventes
              </h2>
              <button
                type="button"
                onClick={() => setAddingCampaign((v) => !v)}
                className="text-xs font-medium text-[#721C24] hover:underline whitespace-nowrap"
              >
                {addingCampaign ? 'Fermer' : '+ Planifier'}
              </button>
            </div>

            {addingCampaign && (
              <form
                onSubmit={handleCreateCampaign}
                className="mb-3 p-3 bg-[#FAF9F7] border border-[#E5E4DF] rounded-lg space-y-2"
              >
                <input
                  type="text"
                  required
                  value={newCampName}
                  onChange={(e) => setNewCampName(e.target.value)}
                  placeholder="Nom de la vente (ex : Ganevat Décembre)"
                  className="w-full px-2.5 py-1.5 text-xs bg-white border border-[#D8D6D0] rounded"
                />
                <div className="flex flex-wrap items-center gap-2">
                  <input
                    type="date"
                    value={newCampDate}
                    onChange={(e) => setNewCampDate(e.target.value)}
                    className="flex-1 px-2 py-1 text-xs bg-white border border-[#D8D6D0] rounded"
                  />
                  <select
                    value={newCampCanal}
                    onChange={(e) =>
                      setNewCampCanal(e.target.value as SalesCampaign['canal'])
                    }
                    className="px-2 py-1 text-xs bg-white border border-[#D8D6D0] rounded"
                  >
                    <option value="Club">Club</option>
                    <option value="WhatsApp">WhatsApp</option>
                    <option value="HelloAsso">HelloAsso</option>
                    <option value="Vente directe">Vente directe</option>
                  </select>
                  <input
                    type="text"
                    value={newCampContact}
                    onChange={(e) => setNewCampContact(e.target.value)}
                    placeholder="Contact (Romain/Alice)"
                    className="w-24 px-2 py-1 text-xs bg-white border border-[#D8D6D0] rounded"
                  />
                  <button
                    type="submit"
                    className="px-3 py-1 text-xs font-medium text-white bg-[#721C24] rounded hover:bg-[#5B151C]"
                  >
                    Ajouter
                  </button>
                </div>
              </form>
            )}

            <div className="divide-y divide-[#ECEAE4]">
              {campaigns.map((camp) => (
                <div
                  key={camp.id}
                  className="py-2.5 first:pt-0 last:pb-0 flex items-center justify-between gap-3"
                >
                  <div className="min-w-0">
                    <div className="text-sm font-medium text-[#141413] truncate">
                      {camp.nom}
                    </div>
                    <div className="text-xs text-[#6B6B66] flex items-center gap-1.5">
                      <span>{formatDateFR(camp.dateOuverture)}</span>
                      <span aria-hidden="true">·</span>
                      <span>{camp.canal}</span>
                      {camp.contact && (
                        <>
                          <span aria-hidden="true">·</span>
                          <span>{camp.contact}</span>
                        </>
                      )}
                    </div>
                  </div>
                  <select
                    aria-label={`Statut de ${camp.nom}`}
                    value={camp.statut}
                    onChange={(e) =>
                      onUpdateCampaignStatus(
                        camp.id,
                        e.target.value as SalesCampaign['statut']
                      )
                    }
                    className={`px-2 py-1 text-xs font-medium bg-[#FAF9F7] border border-[#E5E4DF] rounded cursor-pointer focus:outline-none ${
                      camp.statut === 'Planifiée'
                        ? 'text-[#721C24]'
                        : camp.statut === 'Envisagée'
                          ? 'text-[#6B6B66]'
                          : camp.statut === 'En attente domaine'
                            ? 'text-[#B45309]'
                            : camp.statut === 'Clôturée' || camp.statut === 'Livrée'
                              ? 'text-[#15803D]'
                              : 'text-[#141413]'
                    }`}
                  >
                    <option value="Envisagée">Envisagée</option>
                    <option value="Planifiée">Planifiée</option>
                    <option value="En cours">En cours</option>
                    <option value="En attente domaine">En attente domaine</option>
                    <option value="Clôturée">Clôturée</option>
                    <option value="Livrée">Livrée</option>
                  </select>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
