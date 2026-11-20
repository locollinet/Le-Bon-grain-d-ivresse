import React, { useMemo, useState } from 'react';
import {
  TrendingUp,
  Wine,
  ArrowRight,
  AlertTriangle,
  CheckCircle2,
  Clock,
  Calendar,
  Plus,
  Edit3,
  Trash2,
  X,
  Wallet,
  CreditCard,
} from 'lucide-react';
import {
  ActiveTab,
  AppSettings,
  CampaignStatus,
  OrderLine,
  SalesCampaign,
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
import { PLANNING_PROJECTS } from '../data/seedData';

interface DashboardViewProps {
  catalog: WineCatalogItem[];
  lots: SupplierLot[];
  orders: OrderLine[];
  stockRows: StockSummaryRow[];
  campaigns: SalesCampaign[];
  settings: AppSettings;
  onNavigate: (tab: ActiveTab) => void;
  onSaveCampaign: (campaign: SalesCampaign) => Promise<void>;
  onDeleteCampaign: (campaignId: string) => Promise<void>;
}

const CAMPAIGN_STATUSES: CampaignStatus[] = [
  'Envisagée',
  'Planifiée',
  'En cours',
  'En attente domaine',
  'Clôturée',
  'Livrée',
];

const STATUS_DOT: Record<CampaignStatus, string> = {
  Envisagée: 'bg-[#9CA3AF]',
  Planifiée: 'bg-[#6B6A65]',
  'En cours': 'bg-[#721C24]',
  'En attente domaine': 'bg-[#B45309]',
  Clôturée: 'bg-[#18181B]',
  Livrée: 'bg-[#15803D]',
};

export const DashboardView: React.FC<DashboardViewProps> = ({
  catalog,
  lots,
  orders,
  stockRows,
  campaigns,
  settings,
  onNavigate,
  onSaveCampaign,
  onDeleteCampaign,
}) => {
  const [editingCampaign, setEditingCampaign] = useState<SalesCampaign | null>(null);
  const [isNewCampaign, setIsNewCampaign] = useState(false);

  const catalogMap = useMemo(
    () => new Map(catalog.map((c) => [c.id, c])),
    [catalog]
  );

  const metrics = useMemo(() => {
    const validOrders = orders.filter((o) => o.statut !== 'annule');
    let caTTC = 0;
    let caHT = 0;
    let margeNetEuro = 0;
    let coutTotalHT = 0;
    let totalBottlesSold = 0;
    let attenteDomaine = 0;
    let pretRemise = 0;
    let remisClient = 0;
    let resteAEncaisserTTC = 0;
    const unpaidOrderRefs = new Set<string>();

    for (const o of validOrders) {
      totalBottlesSold += o.qte;
      const econ = computeOrderLineEconomics(o, catalogMap.get(o.catalogId), settings);
      caTTC += econ.caTTC;
      caHT += econ.caHT;
      margeNetEuro += econ.margeEuroTotal;
      coutTotalHT += econ.coutVinHT + econ.fraisLogistiqueHT;

      const unpaid = getOrderLineUnpaidTTC(o);
      if (unpaid > 0.01) {
        resteAEncaisserTTC += unpaid;
        unpaidOrderRefs.add(o.refCommande);
      }

      if (o.statut === 'attente_reception') attenteDomaine += o.qte;
      else if (o.statut === 'recu_lbg') pretRemise += o.qte;
      else if (o.statut === 'remis_client') remisClient += o.qte;
    }

    const capitalImmobiliseHT = stockRows.reduce((s, r) => s + r.capitalImmobiliseHT, 0);
    const physiqueCaveTotal = stockRows.reduce((s, r) => s + r.physiqueCave, 0);
    const dispoTotal = stockRows.reduce((s, r) => s + Math.max(0, r.disponibleVente), 0);
    const deficitTotal = stockRows.reduce((s, r) => s + Math.max(0, -r.disponibleVente), 0);

    const unpaidLots = lots.filter((l) => l.paymentStatus === 'non_paye');
    const facturesDomainesAPayerHT = unpaidLots.reduce(
      (s, l) => s + l.coutUnitaireHT * l.qteCommandee + (l.shippingHT ?? 0),
      0
    );

    const lowMarginWines = catalog.filter((item) => {
      if (item.tarifAchatHT <= 0 || item.prixLbgTTC <= 0) return false;
      const ht = item.prixLbgTTC / (1 + settings.tvaRate);
      const cost =
        item.tarifAchatHT +
        (item.fraisLogistiqueOverride ?? settings.fraisLogistiqueParBouteille);
      return ht - cost < 0;
    });

    return {
      caTTC,
      caHT,
      margeNetEuro,
      margePct: coutTotalHT > 0 ? (margeNetEuro / coutTotalHT) * 100 : 0,
      totalBottlesSold,
      attenteDomaine,
      pretRemise,
      remisClient,
      resteAEncaisserTTC,
      unpaidOrderCount: unpaidOrderRefs.size,
      facturesDomainesAPayerHT,
      unpaidLotsCount: unpaidLots.length,
      capitalImmobiliseHT,
      physiqueCaveTotal,
      dispoTotal,
      deficitTotal,
      lowMarginWines,
    };
  }, [orders, catalog, catalogMap, settings, stockRows, lots]);

  const sortedCampaigns = useMemo(
    () =>
      [...campaigns].sort((a, b) => b.dateOuverture.localeCompare(a.dateOuverture)),
    [campaigns]
  );

  const openNewCampaign = () => {
    setIsNewCampaign(true);
    setEditingCampaign({
      id: `camp_${Date.now()}`,
      nom: '',
      domaine: '',
      dateOuverture: new Date().toISOString().slice(0, 10),
      canal: 'Club',
      contact: 'Romain',
      statut: 'Planifiée',
      notes: '',
    });
  };

  const handleSaveCampaignSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingCampaign || !editingCampaign.nom.trim()) return;
    await onSaveCampaign(editingCampaign);
    setEditingCampaign(null);
  };

  return (
    <div className="space-y-6">
      {/* Page Title */}
      <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-4">
        <div>
          <h1 className="font-serif text-3xl font-semibold text-[#18181B]">
            Tableau de bord
          </h1>
          <p className="text-sm text-[#6B6A65] mt-1">
            Vue synthétique des ventes, de la trésorerie et du pilotage des allocations.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <button
            onClick={() => onNavigate('domains')}
            className="px-3.5 py-2 rounded-lg border border-[#E5E4DF] bg-white hover:bg-[#FAF9F6] text-xs font-medium text-[#18181B] flex items-center gap-1.5 cursor-pointer"
          >
            Domaines &amp; Achats
            <ArrowRight className="w-3.5 h-3.5" />
          </button>
          <button
            onClick={() => onNavigate('orders')}
            className="px-3.5 py-2 rounded-lg bg-[#721C24] hover:bg-[#5E161D] text-white text-xs font-medium flex items-center gap-1.5 cursor-pointer"
          >
            Commandes clients
            <ArrowRight className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>

      {/* Primary KPI Grid (Commercial & Treasury) */}
      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4">
        <div className="bg-white border border-[#E5E4DF] rounded-xl p-5">
          <div className="flex items-center justify-between text-xs font-medium text-[#6B6A65] uppercase tracking-wider">
            <span>Chiffre d’affaires TTC</span>
            <TrendingUp className="w-4 h-4 text-[#721C24]" />
          </div>
          <div className="mt-2 font-mono text-2xl font-semibold text-[#18181B] tabular-nums">
            {formatEUR(metrics.caTTC)}
          </div>
          <div className="mt-1 text-xs text-[#6B6A65]">
            <span className="font-mono">{formatEUR(metrics.caHT)} HT</span> ·{' '}
            {metrics.totalBottlesSold} btl vendues
          </div>
        </div>

        <div className="bg-white border border-[#E5E4DF] rounded-xl p-5">
          <div className="flex items-center justify-between text-xs font-medium text-[#6B6A65] uppercase tracking-wider">
            <span>Marge nette commerciale</span>
            <Wine className="w-4 h-4 text-[#15803D]" />
          </div>
          <div className="mt-2 font-mono text-2xl font-semibold text-[#15803D] tabular-nums">
            {formatEUR(metrics.margeNetEuro, true)}
          </div>
          <div className="mt-1 text-xs text-[#6B6A65]">
            Taux net livré :{' '}
            <span className="font-mono font-medium text-[#18181B]">
              {formatPct(metrics.margePct)}
            </span>
          </div>
        </div>

        <button
          onClick={() => onNavigate('orders')}
          className="bg-white border border-[#E5E4DF] hover:border-[#721C24] rounded-xl p-5 text-left transition-colors cursor-pointer"
        >
          <div className="flex items-center justify-between text-xs font-medium text-[#6B6A65] uppercase tracking-wider">
            <span>Reste à encaisser clients</span>
            <Wallet className="w-4 h-4 text-[#B45309]" />
          </div>
          <div
            className={`mt-2 font-mono text-2xl font-semibold tabular-nums ${
              metrics.resteAEncaisserTTC > 0 ? 'text-[#B45309]' : 'text-[#15803D]'
            }`}
          >
            {formatEUR(metrics.resteAEncaisserTTC)}
          </div>
          <div className="mt-1 text-xs text-[#6B6A65]">
            {metrics.unpaidOrderCount > 0
              ? `${metrics.unpaidOrderCount} commande(s) non soldée(s)`
              : 'Toutes les commandes sont réglées'}
          </div>
        </button>

        <button
          onClick={() => onNavigate('stock')}
          className="bg-white border border-[#E5E4DF] hover:border-[#721C24] rounded-xl p-5 text-left transition-colors cursor-pointer"
        >
          <div className="flex items-center justify-between text-xs font-medium text-[#6B6A65] uppercase tracking-wider">
            <span>Factures domaines à régler</span>
            <CreditCard className="w-4 h-4 text-[#B91C1C]" />
          </div>
          <div
            className={`mt-2 font-mono text-2xl font-semibold tabular-nums ${
              metrics.facturesDomainesAPayerHT > 0 ? 'text-[#B91C1C]' : 'text-[#15803D]'
            }`}
          >
            {formatEUR(metrics.facturesDomainesAPayerHT)}
          </div>
          <div className="mt-1 text-xs text-[#6B6A65]">
            {metrics.unpaidLotsCount > 0
              ? `${metrics.unpaidLotsCount} lot(s) à payer · Cave ${formatEUR(metrics.capitalImmobiliseHT)} HT`
              : `Aucun impayé · Cave ${formatEUR(metrics.capitalImmobiliseHT)} HT`}
          </div>
        </button>
      </div>

      {/* Operational Logistics & Alerts Strip */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <div className="bg-white border border-[#E5E4DF] rounded-xl p-5 space-y-3">
          <div className="text-xs font-semibold uppercase tracking-wider text-[#6B6A65]">
            Flux bouteilles clients
          </div>
          <div className="grid grid-cols-3 gap-2 pt-1">
            <div>
              <div className="text-xs text-[#B45309] flex items-center gap-1">
                <Clock className="w-3.5 h-3.5" /> Attente
              </div>
              <div className="font-mono text-xl font-semibold tabular-nums mt-0.5">
                {metrics.attenteDomaine}
              </div>
            </div>
            <div>
              <div className="text-xs text-[#721C24] flex items-center gap-1">
                <Wine className="w-3.5 h-3.5" /> Prêtes LBG
              </div>
              <div className="font-mono text-xl font-semibold tabular-nums mt-0.5">
                {metrics.pretRemise}
              </div>
            </div>
            <div>
              <div className="text-xs text-[#15803D] flex items-center gap-1">
                <CheckCircle2 className="w-3.5 h-3.5" /> Remises
              </div>
              <div className="font-mono text-xl font-semibold tabular-nums mt-0.5">
                {metrics.remisClient}
              </div>
            </div>
          </div>
        </div>

        <div className="bg-white border border-[#E5E4DF] rounded-xl p-5 space-y-3">
          <div className="text-xs font-semibold uppercase tracking-wider text-[#6B6A65]">
            État du stock cave
          </div>
          <div className="grid grid-cols-3 gap-2 pt-1">
            <div>
              <div className="text-xs text-[#6B6A65]">Physique</div>
              <div className="font-mono text-xl font-semibold tabular-nums mt-0.5">
                {metrics.physiqueCaveTotal}
              </div>
            </div>
            <div>
              <div className="text-xs text-[#15803D]">Dispo vente</div>
              <div className="font-mono text-xl font-semibold text-[#15803D] tabular-nums mt-0.5">
                {metrics.dispoTotal}
              </div>
            </div>
            <div>
              <div className="text-xs text-[#B91C1C]">À commander</div>
              <div
                className={`font-mono text-xl font-semibold tabular-nums mt-0.5 ${
                  metrics.deficitTotal > 0 ? 'text-[#B91C1C]' : 'text-[#6B6A65]'
                }`}
              >
                {metrics.deficitTotal}
              </div>
            </div>
          </div>
        </div>

        <div className="bg-white border border-[#E5E4DF] rounded-xl p-5 flex flex-col justify-between">
          <div className="text-xs font-semibold uppercase tracking-wider text-[#6B6A65]">
            Points de vigilance
          </div>
          <div className="space-y-2 mt-2 text-xs">
            {metrics.deficitTotal > 0 && (
              <button
                onClick={() => onNavigate('domains')}
                className="w-full text-left flex items-center justify-between text-[#B45309] hover:underline cursor-pointer"
              >
                <span className="flex items-center gap-1.5">
                  <AlertTriangle className="w-3.5 h-3.5 shrink-0" />
                  {metrics.deficitTotal} btl à commander aux domaines
                </span>
                <span>→</span>
              </button>
            )}
            {metrics.lowMarginWines.length > 0 && (
              <button
                onClick={() => onNavigate('catalog')}
                className="w-full text-left flex items-center justify-between text-[#B91C1C] hover:underline cursor-pointer"
              >
                <span className="flex items-center gap-1.5">
                  <AlertTriangle className="w-3.5 h-3.5 shrink-0" />
                  {metrics.lowMarginWines.length} cuvée(s) à marge nette négative
                </span>
                <span>→</span>
              </button>
            )}
            {metrics.pretRemise > 0 && (
              <button
                onClick={() => onNavigate('clients')}
                className="w-full text-left flex items-center justify-between text-[#721C24] hover:underline cursor-pointer"
              >
                <span>
                  {metrics.pretRemise} btl prêtes en cave à remettre aux clients
                </span>
                <span>→</span>
              </button>
            )}
            {metrics.deficitTotal === 0 &&
              metrics.lowMarginWines.length === 0 &&
              metrics.pretRemise === 0 && (
                <div className="text-[#15803D] flex items-center gap-1.5">
                  <CheckCircle2 className="w-4 h-4" />
                  Aucune alerte opérationnelle en cours.
                </div>
              )}
          </div>
        </div>
      </div>

      {/* Campaign Planning */}
      <section className="bg-white border border-[#E5E4DF] rounded-xl overflow-hidden">
        <div className="p-5 border-b border-[#E5E4DF] flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <Calendar className="w-5 h-5 text-[#721C24]" />
            <div>
              <h2 className="font-serif text-xl font-semibold text-[#18181B]">
                Planning des campagnes &amp; allocations
              </h2>
              <p className="text-xs text-[#6B6A65]">
                Suivi des ventes ouvertes, clôtures, livraisons estimées et objectifs bouteilles.
              </p>
            </div>
          </div>
          <button
            onClick={openNewCampaign}
            className="px-3.5 py-2 rounded-lg bg-[#18181B] hover:bg-[#3F3F46] text-white text-xs font-medium flex items-center gap-1.5 self-start sm:self-auto cursor-pointer"
          >
            <Plus className="w-3.5 h-3.5" />
            Planifier une campagne
          </button>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-[#F6F6F4] text-xs text-[#6B6A65] uppercase">
              <tr>
                <th className="text-left py-2.5 px-4 font-medium">Campagne · Domaine</th>
                <th className="text-left py-2.5 px-3 font-medium">Dates</th>
                <th className="text-left py-2.5 px-3 font-medium">Canal · Référent</th>
                <th className="text-right py-2.5 px-3 font-medium">Objectif</th>
                <th className="text-left py-2.5 px-3 font-medium">Statut</th>
                <th className="text-right py-2.5 px-4 font-medium">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[#E5E4DF]">
              {sortedCampaigns.map((c) => (
                <tr key={c.id} className="hover:bg-[#FAF9F6]">
                  <td className="py-3 px-4">
                    <div className="font-medium text-[#18181B]">{c.nom}</div>
                    <div className="text-xs text-[#6B6A65]">
                      {c.domaine}
                      {c.notes ? ` · ${c.notes}` : ''}
                    </div>
                  </td>
                  <td className="py-3 px-3 text-xs text-[#6B6A65] font-mono whitespace-nowrap">
                    <div>Ouv. {formatDateFR(c.dateOuverture)}</div>
                    {c.dateCloture && <div>Clôt. {formatDateFR(c.dateCloture)}</div>}
                    {c.dateLivraisonEstimee && (
                      <div className="text-[#721C24]">
                        Liv. {formatDateFR(c.dateLivraisonEstimee)}
                      </div>
                    )}
                  </td>
                  <td className="py-3 px-3 text-xs text-[#6B6A65]">
                    {c.canal}
                    {c.contact ? ` · ${c.contact}` : ''}
                  </td>
                  <td className="py-3 px-3 text-right font-mono text-xs tabular-nums">
                    {c.targetBottles ? `${c.targetBottles} btl` : '—'}
                  </td>
                  <td className="py-3 px-3">
                    <div className="flex items-center gap-2">
                      <span
                        className={`w-2 h-2 rounded-full shrink-0 ${STATUS_DOT[c.statut]}`}
                      />
                      <select
                        value={c.statut}
                        onChange={(e) =>
                          onSaveCampaign({
                            ...c,
                            statut: e.target.value as CampaignStatus,
                          })
                        }
                        className="text-xs border border-[#E5E4DF] rounded px-2 py-1 bg-white"
                      >
                        {CAMPAIGN_STATUSES.map((st) => (
                          <option key={st} value={st}>
                            {st}
                          </option>
                        ))}
                      </select>
                    </div>
                  </td>
                  <td className="py-3 px-4 text-right whitespace-nowrap">
                    <button
                      onClick={() => {
                        setIsNewCampaign(false);
                        setEditingCampaign({ ...c });
                      }}
                      className="p-1.5 text-[#6B6A65] hover:text-[#18181B] cursor-pointer"
                      title="Modifier"
                    >
                      <Edit3 className="w-3.5 h-3.5" />
                    </button>
                    <button
                      onClick={() => onDeleteCampaign(c.id)}
                      className="p-1.5 text-[#6B6A65] hover:text-[#B91C1C] cursor-pointer"
                      title="Supprimer"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </td>
                </tr>
              ))}
              {sortedCampaigns.length === 0 && (
                <tr>
                  <td colSpan={6} className="py-8 text-center text-xs text-[#6B6A65]">
                    Aucune campagne planifiée pour le moment.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>

        {PLANNING_PROJECTS.length > 0 && (
          <div className="px-5 py-3.5 border-t border-[#E5E4DF] bg-[#FAF9F7]/60">
            <div className="text-[11px] font-medium uppercase tracking-wide text-[#6B6A65] mb-2">
              Projets à l’étude
            </div>
            <div className="flex flex-wrap gap-1.5">
              {PLANNING_PROJECTS.map((project) => (
                <span
                  key={project}
                  className="px-2.5 py-0.5 text-xs bg-white border border-[#E5E4DF] rounded-md text-[#3D3D3A]"
                >
                  {project}
                </span>
              ))}
            </div>
          </div>
        )}
      </section>

      {/* Edit / Add Campaign Modal */}
      {editingCampaign && (
        <div className="fixed inset-0 bg-black/45 z-50 flex items-center justify-center p-4">
          <form
            onSubmit={handleSaveCampaignSubmit}
            className="bg-white border border-[#E5E4DF] rounded-xl w-full max-w-lg p-6 space-y-4 text-sm"
          >
            <div className="flex items-center justify-between pb-3 border-b border-[#E5E4DF]">
              <h3 className="font-serif text-xl font-semibold">
                {isNewCampaign ? 'Nouvelle campagne' : 'Modifier la campagne'}
              </h3>
              <button
                type="button"
                onClick={() => setEditingCampaign(null)}
                className="p-1 text-[#6B6A65] cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-medium text-[#6B6A65] mb-1">
                  Nom de la campagne *
                </label>
                <input
                  required
                  value={editingCampaign.nom}
                  onChange={(e) =>
                    setEditingCampaign({ ...editingCampaign, nom: e.target.value })
                  }
                  placeholder="ex: Domaine Tissot Automne"
                  className="w-full px-3 py-2 border border-[#E5E4DF] rounded-lg"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-[#6B6A65] mb-1">
                  Domaine
                </label>
                <input
                  value={editingCampaign.domaine}
                  onChange={(e) =>
                    setEditingCampaign({
                      ...editingCampaign,
                      domaine: e.target.value,
                    })
                  }
                  className="w-full px-3 py-2 border border-[#E5E4DF] rounded-lg"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-[#6B6A65] mb-1">
                  Date d’ouverture
                </label>
                <input
                  type="date"
                  value={editingCampaign.dateOuverture}
                  onChange={(e) =>
                    setEditingCampaign({
                      ...editingCampaign,
                      dateOuverture: e.target.value,
                    })
                  }
                  className="w-full px-3 py-2 border border-[#E5E4DF] rounded-lg"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-[#6B6A65] mb-1">
                  Date de clôture
                </label>
                <input
                  type="date"
                  value={editingCampaign.dateCloture ?? ''}
                  onChange={(e) =>
                    setEditingCampaign({
                      ...editingCampaign,
                      dateCloture: e.target.value || undefined,
                    })
                  }
                  className="w-full px-3 py-2 border border-[#E5E4DF] rounded-lg"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-[#6B6A65] mb-1">
                  Livraison estimée
                </label>
                <input
                  type="date"
                  value={editingCampaign.dateLivraisonEstimee ?? ''}
                  onChange={(e) =>
                    setEditingCampaign({
                      ...editingCampaign,
                      dateLivraisonEstimee: e.target.value || undefined,
                    })
                  }
                  className="w-full px-3 py-2 border border-[#E5E4DF] rounded-lg"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-[#6B6A65] mb-1">
                  Objectif (bouteilles)
                </label>
                <input
                  type="number"
                  min="0"
                  value={editingCampaign.targetBottles ?? ''}
                  onChange={(e) =>
                    setEditingCampaign({
                      ...editingCampaign,
                      targetBottles: e.target.value ? Number(e.target.value) : undefined,
                    })
                  }
                  className="w-full px-3 py-2 border border-[#E5E4DF] rounded-lg font-mono"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-[#6B6A65] mb-1">
                  Canal
                </label>
                <select
                  value={editingCampaign.canal}
                  onChange={(e) =>
                    setEditingCampaign({
                      ...editingCampaign,
                      canal: e.target.value as SalesCampaign['canal'],
                    })
                  }
                  className="w-full px-3 py-2 border border-[#E5E4DF] rounded-lg bg-white"
                >
                  <option value="Club">Club</option>
                  <option value="HelloAsso">HelloAsso</option>
                  <option value="WhatsApp">WhatsApp</option>
                  <option value="Vente directe">Vente directe</option>
                </select>
              </div>
              <div>
                <label className="block text-xs font-medium text-[#6B6A65] mb-1">
                  Référent
                </label>
                <input
                  value={editingCampaign.contact ?? ''}
                  onChange={(e) =>
                    setEditingCampaign({
                      ...editingCampaign,
                      contact: e.target.value || undefined,
                    })
                  }
                  className="w-full px-3 py-2 border border-[#E5E4DF] rounded-lg"
                />
              </div>
              <div className="sm:col-span-2">
                <label className="block text-xs font-medium text-[#6B6A65] mb-1">
                  Notes
                </label>
                <textarea
                  rows={2}
                  value={editingCampaign.notes ?? ''}
                  onChange={(e) =>
                    setEditingCampaign({
                      ...editingCampaign,
                      notes: e.target.value || undefined,
                    })
                  }
                  className="w-full px-3 py-2 border border-[#E5E4DF] rounded-lg"
                />
              </div>
            </div>

            <div className="flex justify-end gap-2 pt-3 border-t border-[#E5E4DF]">
              <button
                type="button"
                onClick={() => setEditingCampaign(null)}
                className="px-4 py-2 rounded-lg border border-[#E5E4DF] text-sm cursor-pointer"
              >
                Annuler
              </button>
              <button
                type="submit"
                className="px-4 py-2 rounded-lg bg-[#721C24] hover:bg-[#5E161D] text-white text-sm font-medium cursor-pointer"
              >
                Enregistrer
              </button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
};
