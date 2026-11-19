import React, { useMemo, useState } from 'react';
import {
  Search,
  Plus,
  PackageCheck,
  Sparkles,
  Edit3,
  Trash2,
  ClipboardList,
  CheckCircle2,
  AlertTriangle,
  X,
} from 'lucide-react';
import {
  StockAdjustment,
  StockAdjustmentReason,
  StockSummaryRow,
  SupplierLot,
  WineCatalogItem,
} from '../types/wine';
import { formatDateFR, formatEUR, normalizeSearchText } from '../utils/wineMath';

interface StockViewProps {
  stockRows: StockSummaryRow[];
  lots: SupplierLot[];
  adjustments: StockAdjustment[];
  catalog: WineCatalogItem[];
  currentUserUid: string;
  isAdmin: boolean;
  onReceiveLot: (lotId: string) => Promise<void>;
  onEditLot: (lot: SupplierLot) => void;
  onToggleLotPayment: (lot: SupplierLot) => Promise<void>;
  onDeleteLot: (lotId: string) => Promise<void>;
  onAddAdjustment: (adj: StockAdjustment) => Promise<void>;
  onDeleteAdjustment: (adjId: string) => Promise<void>;
  onOpenNewLotModal: () => void;
  onOpenInvoiceAI: () => void;
}

const REASON_META: Record<
  StockAdjustmentReason,
  { label: string; defaultSign: 1 | -1 }
> = {
  casse: { label: 'Casse bouteille', defaultSign: -1 },
  bouchonnee: { label: 'Bouteille bouchonnée / défaut', defaultSign: -1 },
  degustation: { label: 'Dégustation / Échantillon pro', defaultSign: -1 },
  retour_client: { label: 'Retour client en cave', defaultSign: 1 },
  inventaire: { label: 'Régularisation inventaire', defaultSign: -1 },
};

export const StockView: React.FC<StockViewProps> = ({
  stockRows,
  lots,
  adjustments,
  catalog,
  currentUserUid,
  isAdmin,
  onReceiveLot,
  onEditLot,
  onToggleLotPayment,
  onDeleteLot,
  onAddAdjustment,
  onDeleteAdjustment,
  onOpenNewLotModal,
  onOpenInvoiceAI,
}) => {
  const [subTab, setSubTab] = useState<'inventory' | 'lots' | 'adjustments'>(
    'inventory'
  );
  const [search, setSearch] = useState('');
  const [filterMode, setFilterMode] = useState<
    'all' | 'dispo' | 'deficit' | 'cave'
  >('all');

  // Adjustment modal
  const [adjModalOpen, setAdjModalOpen] = useState(false);
  const [adjCatalogId, setAdjCatalogId] = useState(catalog[0]?.id ?? '');
  const [adjDate, setAdjDate] = useState(new Date().toISOString().slice(0, 10));
  const [adjReason, setAdjReason] = useState<StockAdjustmentReason>('casse');
  const [adjQty, setAdjQty] = useState(1);
  const [adjDirection, setAdjDirection] = useState<'out' | 'in'>('out');
  const [adjNotes, setAdjNotes] = useState('');
  const [adjSaving, setAdjSaving] = useState(false);

  const catalogMap = useMemo(
    () => new Map(catalog.map((c) => [c.id, c])),
    [catalog]
  );

  const filteredStock = useMemo(() => {
    const q = normalizeSearchText(search);
    return stockRows.filter((r) => {
      if (filterMode === 'dispo' && r.disponibleVente <= 0) return false;
      if (filterMode === 'deficit' && r.disponibleVente >= 0) return false;
      if (filterMode === 'cave' && r.physiqueCave <= 0) return false;
      if (!q) return true;
      const hay = normalizeSearchText(
        `${r.catalog.domaine} ${r.catalog.cuvee} ${r.catalog.region} ${r.catalog.vente} ${r.catalog.millesime ?? ''}`
      );
      return hay.includes(q);
    });
  }, [stockRows, search, filterMode]);

  const filteredLots = useMemo(() => {
    const q = normalizeSearchText(search);
    return [...lots]
      .filter((l) => {
        if (!q) return true;
        const cat = catalogMap.get(l.catalogId);
        const hay = normalizeSearchText(
          `${l.referenceFacture} ${cat?.domaine ?? ''} ${cat?.cuvee ?? ''} ${l.notes ?? ''}`
        );
        return hay.includes(q);
      })
      .sort((a, b) => b.dateAchat.localeCompare(a.dateAchat));
  }, [lots, search, catalogMap]);

  const totals = useMemo(() => {
    let physique = 0;
    let enCmd = 0;
    let dispo = 0;
    let deficit = 0;
    let capital = 0;
    for (const r of stockRows) {
      physique += r.physiqueCave;
      enCmd += r.enCommandeFournisseur;
      if (r.disponibleVente > 0) dispo += r.disponibleVente;
      if (r.disponibleVente < 0) deficit += Math.abs(r.disponibleVente);
      capital += r.capitalImmobiliseHT;
    }
    const totalAdjustCostHT = adjustments.reduce(
      (s, a) => s + (a.qtyDelta < 0 ? Math.abs(a.qtyDelta) * a.unitCostHT : 0),
      0
    );
    return { physique, enCmd, dispo, deficit, capital, totalAdjustCostHT };
  }, [stockRows, adjustments]);

  const handleCreateAdjustment = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!adjCatalogId || adjQty <= 0) return;
    setAdjSaving(true);
    try {
      const cat = catalogMap.get(adjCatalogId);
      const stockRow = stockRows.find((r) => r.catalog.id === adjCatalogId);
      const signedDelta = adjDirection === 'out' ? -Math.abs(adjQty) : Math.abs(adjQty);
      const adj: StockAdjustment = {
        id: `adj_${Date.now()}`,
        catalogId: adjCatalogId,
        date: adjDate,
        reason: adjReason,
        qtyDelta: signedDelta,
        unitCostHT: Number(
          (stockRow?.coutMoyenPondereHT ?? cat?.tarifAchatHT ?? 0).toFixed(2)
        ),
        notes: adjNotes.trim() || undefined,
        createdByUid: currentUserUid,
        createdAt: new Date().toISOString(),
      };
      await onAddAdjustment(adj);
      setAdjModalOpen(false);
      setAdjNotes('');
      setAdjQty(1);
    } finally {
      setAdjSaving(false);
    }
  };

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-4">
        <div>
          <h1 className="font-serif text-3xl font-semibold text-[#18181B]">
            Stock, Lots &amp; Inventaire
          </h1>
          <p className="text-sm text-[#6B6A65] mt-1">
            Suivi temps réel cave physique, allocations en cours, réceptions domaines et mouvements d’inventaire.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <button
            onClick={() => {
              setAdjCatalogId(catalog[0]?.id ?? '');
              setAdjModalOpen(true);
            }}
            className="px-3 py-2 rounded-lg border border-[#E5E4DF] bg-white hover:bg-[#FAF9F6] text-xs font-medium flex items-center gap-1.5 cursor-pointer"
          >
            <ClipboardList className="w-3.5 h-3.5" />
            Mouvement cave
          </button>
          <button
            onClick={onOpenInvoiceAI}
            className="px-3 py-2 rounded-lg border border-[#721C24] text-[#721C24] bg-[#FDF8F8] hover:bg-[#FAF0F0] text-xs font-medium flex items-center gap-1.5 cursor-pointer"
          >
            <Sparkles className="w-3.5 h-3.5" />
            Importer facture IA
          </button>
          <button
            onClick={onOpenNewLotModal}
            className="px-3.5 py-2 rounded-lg bg-[#721C24] hover:bg-[#5E161D] text-white text-xs font-medium flex items-center gap-1.5 cursor-pointer"
          >
            <Plus className="w-3.5 h-3.5" />
            Nouveau lot
          </button>
        </div>
      </div>

      {/* KPI Strip */}
      <div className="grid grid-cols-2 lg:grid-cols-5 gap-3">
        <div className="bg-white border border-[#E5E4DF] rounded-xl p-4">
          <div className="text-[11px] uppercase tracking-wider text-[#6B6A65]">
            Physique en cave
          </div>
          <div className="mt-1 font-mono text-2xl font-semibold tabular-nums">
            {totals.physique} btl
          </div>
        </div>
        <div className="bg-white border border-[#E5E4DF] rounded-xl p-4">
          <div className="text-[11px] uppercase tracking-wider text-[#6B6A65]">
            En commande domaine
          </div>
          <div className="mt-1 font-mono text-2xl font-semibold tabular-nums">
            {totals.enCmd} btl
          </div>
        </div>
        <div className="bg-white border border-[#E5E4DF] rounded-xl p-4">
          <div className="text-[11px] uppercase tracking-wider text-[#6B6A65]">
            Disponible vente
          </div>
          <div className="mt-1 font-mono text-2xl font-semibold text-[#15803D] tabular-nums">
            {totals.dispo} btl
          </div>
        </div>
        <div className="bg-white border border-[#E5E4DF] rounded-xl p-4">
          <div className="text-[11px] uppercase tracking-wider text-[#6B6A65]">
            Déficit à commander
          </div>
          <div
            className={`mt-1 font-mono text-2xl font-semibold tabular-nums ${
              totals.deficit > 0 ? 'text-[#B91C1C]' : 'text-[#6B6A65]'
            }`}
          >
            {totals.deficit} btl
          </div>
        </div>
        <div className="bg-white border border-[#E5E4DF] rounded-xl p-4 col-span-2 lg:col-span-1">
          <div className="text-[11px] uppercase tracking-wider text-[#6B6A65]">
            Capital stock HT
          </div>
          <div className="mt-1 font-mono text-2xl font-semibold text-[#721C24] tabular-nums">
            {formatEUR(totals.capital)}
          </div>
        </div>
      </div>

      {/* Sub-tabs & Search */}
      <div className="bg-white border border-[#E5E4DF] rounded-xl overflow-hidden">
        <div className="px-4 pt-3 border-b border-[#E5E4DF] flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div className="flex gap-1">
            {(
              [
                ['inventory', `Inventaire cuvées (${stockRows.length})`],
                ['lots', `Lots fournisseurs (${lots.length})`],
                ['adjustments', `Mouvements & Casse (${adjustments.length})`],
              ] as const
            ).map(([id, label]) => (
              <button
                key={id}
                onClick={() => setSubTab(id)}
                className={`px-3.5 py-2.5 text-xs font-medium border-b-2 transition-colors cursor-pointer ${
                  subTab === id
                    ? 'border-[#721C24] text-[#721C24]'
                    : 'border-transparent text-[#6B6A65] hover:text-[#18181B]'
                }`}
              >
                {label}
              </button>
            ))}
          </div>

          <div className="flex items-center gap-2 pb-2 sm:pb-2.5">
            <div className="relative">
              <Search className="w-3.5 h-3.5 text-[#6B6A65] absolute left-2.5 top-1/2 -translate-y-1/2" />
              <input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Filtrer…"
                className="pl-8 pr-3 py-1.5 text-xs border border-[#E5E4DF] rounded-lg w-48 sm:w-56"
              />
            </div>
            {subTab === 'inventory' && (
              <select
                value={filterMode}
                onChange={(e) =>
                  setFilterMode(e.target.value as typeof filterMode)
                }
                className="text-xs border border-[#E5E4DF] rounded-lg px-2.5 py-1.5 bg-white"
              >
                <option value="all">Tout</option>
                <option value="dispo">Disponibles (&gt;0)</option>
                <option value="deficit">À commander (&lt;0)</option>
                <option value="cave">En cave physique</option>
              </select>
            )}
          </div>
        </div>

        {/* Sub-tab 1: Inventory */}
        {subTab === 'inventory' && (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-[#F6F6F4] text-xs text-[#6B6A65] uppercase">
                <tr>
                  <th className="text-left py-2.5 px-4 font-medium">Domaine · Cuvée</th>
                  <th className="text-right py-2.5 px-2.5 font-medium">Cave</th>
                  <th className="text-right py-2.5 px-2.5 font-medium">Ajust.</th>
                  <th className="text-right py-2.5 px-2.5 font-medium">En cmd</th>
                  <th className="text-right py-2.5 px-2.5 font-medium">Réservé</th>
                  <th className="text-right py-2.5 px-2.5 font-medium">Dispo</th>
                  <th className="text-right py-2.5 px-4 font-medium">Capital HT</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#E5E4DF]">
                {filteredStock.map((r) => (
                  <tr key={r.catalog.id} className="hover:bg-[#FAF9F6]">
                    <td className="py-2.5 px-4">
                      <div className="font-medium text-[#18181B]">
                        {r.catalog.domaine} — {r.catalog.cuvee}
                      </div>
                      <div className="text-xs text-[#6B6A65]">
                        {[r.catalog.region, r.catalog.millesime, r.catalog.format || '75 cl', r.catalog.color]
                          .filter(Boolean)
                          .join(' · ')}
                      </div>
                    </td>
                    <td className="py-2.5 px-2.5 text-right font-mono tabular-nums">
                      {r.physiqueCave}
                    </td>
                    <td
                      className={`py-2.5 px-2.5 text-right font-mono text-xs tabular-nums ${
                        r.ajustementsNet < 0
                          ? 'text-[#B91C1C]'
                          : r.ajustementsNet > 0
                            ? 'text-[#15803D]'
                            : 'text-[#6B6A65]'
                      }`}
                    >
                      {r.ajustementsNet !== 0
                        ? `${r.ajustementsNet > 0 ? '+' : ''}${r.ajustementsNet}`
                        : '—'}
                    </td>
                    <td className="py-2.5 px-2.5 text-right font-mono tabular-nums">
                      {r.enCommandeFournisseur}
                    </td>
                    <td className="py-2.5 px-2.5 text-right font-mono tabular-nums">
                      <div>{r.reserveClients}</div>
                      {r.pretARemettreClients > 0 && (
                        <div className="text-[10px] text-[#721C24]">
                          {r.pretARemettreClients} prêt
                        </div>
                      )}
                    </td>
                    <td
                      className={`py-2.5 px-2.5 text-right font-mono font-semibold tabular-nums ${
                        r.disponibleVente < 0
                          ? 'text-[#B91C1C]'
                          : r.disponibleVente > 0
                            ? 'text-[#15803D]'
                            : 'text-[#6B6A65]'
                      }`}
                    >
                      {r.disponibleVente < 0
                        ? `À cmd ${Math.abs(r.disponibleVente)}`
                        : r.disponibleVente}
                    </td>
                    <td className="py-2.5 px-4 text-right font-mono tabular-nums">
                      {formatEUR(r.capitalImmobiliseHT)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {/* Sub-tab 2: Supplier Lots */}
        {subTab === 'lots' && (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-[#F6F6F4] text-xs text-[#6B6A65] uppercase">
                <tr>
                  <th className="text-left py-2.5 px-4 font-medium">Date · Facture</th>
                  <th className="text-left py-2.5 px-3 font-medium">Cuvée</th>
                  <th className="text-right py-2.5 px-2.5 font-medium">Reçu / Cmd</th>
                  <th className="text-right py-2.5 px-2.5 font-medium">PU HT · Port</th>
                  <th className="text-left py-2.5 px-3 font-medium">Règlement</th>
                  <th className="text-right py-2.5 px-4 font-medium">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#E5E4DF]">
                {filteredLots.map((lot) => {
                  const cat = catalogMap.get(lot.catalogId);
                  const isReceived =
                    lot.statutLot === 'recu_cave' && lot.qteRecue >= lot.qteCommandee;
                  const isUnpaid = lot.paymentStatus === 'non_paye';

                  return (
                    <tr key={lot.id} className="hover:bg-[#FAF9F6]">
                      <td className="py-2.5 px-4 whitespace-nowrap">
                        <div className="font-mono text-xs text-[#18181B]">
                          {lot.referenceFacture}
                        </div>
                        <div className="text-[11px] text-[#6B6A65]">
                          {formatDateFR(lot.dateAchat)} · {lot.typeAchat}
                        </div>
                      </td>
                      <td className="py-2.5 px-3">
                        <div className="font-medium text-[#18181B]">
                          {cat ? `${cat.domaine} — ${cat.cuvee}` : lot.catalogId}
                        </div>
                        {lot.notes && (
                          <div className="text-[11px] text-[#6B6A65] truncate max-w-xs">
                            {lot.notes}
                          </div>
                        )}
                      </td>
                      <td className="py-2.5 px-2.5 text-right font-mono tabular-nums">
                        {lot.qteRecue} / {lot.qteCommandee}
                      </td>
                      <td className="py-2.5 px-2.5 text-right font-mono tabular-nums whitespace-nowrap">
                        <div>{formatEUR(lot.coutUnitaireHT)}</div>
                        {(lot.shippingHT ?? 0) > 0 && (
                          <div className="text-[10px] text-[#6B6A65]">
                            + port {formatEUR(lot.shippingHT ?? 0)} HT
                          </div>
                        )}
                      </td>
                      <td className="py-2.5 px-3 whitespace-nowrap">
                        <button
                          onClick={() => onToggleLotPayment(lot)}
                          className={`text-xs font-medium hover:underline cursor-pointer ${
                            isUnpaid ? 'text-[#B91C1C]' : 'text-[#15803D]'
                          }`}
                        >
                          {isUnpaid ? 'À payer' : 'Réglé'}
                        </button>
                        {lot.paymentDueDate && isUnpaid && (
                          <div className="text-[10px] text-[#6B6A65]">
                            Éch. {formatDateFR(lot.paymentDueDate)}
                          </div>
                        )}
                      </td>
                      <td className="py-2.5 px-4 text-right whitespace-nowrap">
                        {!isReceived ? (
                          <button
                            onClick={() => onReceiveLot(lot.id)}
                            className="px-2.5 py-1 rounded bg-[#15803D] hover:bg-[#166534] text-white text-xs font-medium inline-flex items-center gap-1 mr-1 cursor-pointer"
                          >
                            <PackageCheck className="w-3.5 h-3.5" />
                            Réceptionner
                          </button>
                        ) : (
                          <span className="text-xs text-[#15803D] inline-flex items-center gap-1 mr-2">
                            <CheckCircle2 className="w-3.5 h-3.5" />
                            En cave
                          </span>
                        )}
                        <button
                          onClick={() => onEditLot(lot)}
                          title="Modifier le lot"
                          className="p-1.5 text-[#6B6A65] hover:text-[#721C24] cursor-pointer"
                        >
                          <Edit3 className="w-3.5 h-3.5" />
                        </button>
                        <button
                          onClick={() => onDeleteLot(lot.id)}
                          title="Supprimer le lot"
                          className="p-1.5 text-[#6B6A65] hover:text-[#B91C1C] cursor-pointer"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}

        {/* Sub-tab 3: Stock Adjustments */}
        {subTab === 'adjustments' && (
          <div>
            {totals.totalAdjustCostHT > 0 && (
              <div className="px-4 py-2.5 bg-[#FAF9F6] border-b border-[#E5E4DF] text-xs text-[#6B6A65] flex items-center justify-between">
                <span className="flex items-center gap-1.5">
                  <AlertTriangle className="w-3.5 h-3.5 text-[#B45309]" />
                  Coût HT cumulé des sorties hors-vente (casse, bouchonnée, dégustation) :
                </span>
                <strong className="font-mono text-[#B91C1C]">
                  {formatEUR(totals.totalAdjustCostHT)} HT
                </strong>
              </div>
            )}
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-[#F6F6F4] text-xs text-[#6B6A65] uppercase">
                  <tr>
                    <th className="text-left py-2.5 px-4 font-medium">Date</th>
                    <th className="text-left py-2.5 px-3 font-medium">Cuvée</th>
                    <th className="text-left py-2.5 px-3 font-medium">Motif</th>
                    <th className="text-right py-2.5 px-3 font-medium">Delta</th>
                    <th className="text-right py-2.5 px-3 font-medium">Impact coût HT</th>
                    <th className="text-right py-2.5 px-4 font-medium">Action</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[#E5E4DF]">
                  {[...adjustments]
                    .sort((a, b) => b.date.localeCompare(a.date))
                    .map((adj) => {
                      const cat = catalogMap.get(adj.catalogId);
                      const costImpact = adj.qtyDelta * adj.unitCostHT;
                      return (
                        <tr key={adj.id}>
                          <td className="py-2.5 px-4 font-mono text-xs whitespace-nowrap">
                            {formatDateFR(adj.date)}
                          </td>
                          <td className="py-2.5 px-3">
                            <div className="font-medium text-[#18181B]">
                              {cat ? `${cat.domaine} — ${cat.cuvee}` : adj.catalogId}
                            </div>
                            {adj.notes && (
                              <div className="text-xs text-[#6B6A65]">{adj.notes}</div>
                            )}
                          </td>
                          <td className="py-2.5 px-3 text-xs">
                            {REASON_META[adj.reason]?.label ?? adj.reason}
                          </td>
                          <td
                            className={`py-2.5 px-3 text-right font-mono font-semibold ${
                              adj.qtyDelta < 0 ? 'text-[#B91C1C]' : 'text-[#15803D]'
                            }`}
                          >
                            {adj.qtyDelta > 0 ? `+${adj.qtyDelta}` : adj.qtyDelta} btl
                          </td>
                          <td className="py-2.5 px-3 text-right font-mono text-xs">
                            {formatEUR(costImpact, true)}
                          </td>
                          <td className="py-2.5 px-4 text-right">
                            {isAdmin && (
                              <button
                                onClick={() => onDeleteAdjustment(adj.id)}
                                title="Supprimer le mouvement (admin)"
                                className="p-1.5 text-[#6B6A65] hover:text-[#B91C1C] cursor-pointer"
                              >
                                <Trash2 className="w-3.5 h-3.5" />
                              </button>
                            )}
                          </td>
                        </tr>
                      );
                    })}
                  {adjustments.length === 0 && (
                    <tr>
                      <td colSpan={6} className="py-10 text-center text-xs text-[#6B6A65]">
                        Aucun mouvement d’inventaire enregistré (casse, bouchonnée, dégustation, retour).
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </div>

      {/* Stock Adjustment Modal */}
      {adjModalOpen && (
        <div className="fixed inset-0 bg-black/45 z-50 flex items-center justify-center p-4">
          <form
            onSubmit={handleCreateAdjustment}
            className="bg-white border border-[#E5E4DF] rounded-xl w-full max-w-md p-6 space-y-4 text-sm"
          >
            <div className="flex items-center justify-between pb-3 border-b border-[#E5E4DF]">
              <h3 className="font-serif text-xl font-semibold">
                Mouvement d’inventaire cave
              </h3>
              <button
                type="button"
                onClick={() => setAdjModalOpen(false)}
                className="p-1 text-[#6B6A65] cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div>
              <label className="block text-xs font-medium text-[#6B6A65] mb-1">
                Cuvée *
              </label>
              <select
                value={adjCatalogId}
                onChange={(e) => setAdjCatalogId(e.target.value)}
                className="w-full px-3 py-2 border border-[#E5E4DF] rounded-lg bg-white"
              >
                {catalog.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.domaine} — {c.cuvee}
                  </option>
                ))}
              </select>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-medium text-[#6B6A65] mb-1">
                  Motif
                </label>
                <select
                  value={adjReason}
                  onChange={(e) => {
                    const r = e.target.value as StockAdjustmentReason;
                    setAdjReason(r);
                    setAdjDirection(REASON_META[r].defaultSign < 0 ? 'out' : 'in');
                  }}
                  className="w-full px-3 py-2 border border-[#E5E4DF] rounded-lg bg-white"
                >
                  {Object.entries(REASON_META).map(([k, m]) => (
                    <option key={k} value={k}>
                      {m.label}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-xs font-medium text-[#6B6A65] mb-1">
                  Sens &amp; Quantité
                </label>
                <div className="flex gap-1.5">
                  <select
                    value={adjDirection}
                    onChange={(e) =>
                      setAdjDirection(e.target.value as 'out' | 'in')
                    }
                    className="px-2 py-2 border border-[#E5E4DF] rounded-lg bg-white font-mono text-xs"
                  >
                    <option value="out">Sortie (-)</option>
                    <option value="in">Entrée (+)</option>
                  </select>
                  <input
                    type="number"
                    min="1"
                    value={adjQty}
                    onChange={(e) =>
                      setAdjQty(Math.max(1, Math.round(Number(e.target.value) || 1)))
                    }
                    className="w-full px-2.5 py-2 border border-[#E5E4DF] rounded-lg font-mono"
                  />
                </div>
              </div>
            </div>

            <div>
              <label className="block text-xs font-medium text-[#6B6A65] mb-1">
                Date
              </label>
              <input
                type="date"
                value={adjDate}
                onChange={(e) => setAdjDate(e.target.value)}
                className="w-full px-3 py-2 border border-[#E5E4DF] rounded-lg"
              />
            </div>

            <div>
              <label className="block text-xs font-medium text-[#6B6A65] mb-1">
                Commentaire (ex: dégustation client, casse colis…)
              </label>
              <input
                value={adjNotes}
                onChange={(e) => setAdjNotes(e.target.value)}
                className="w-full px-3 py-2 border border-[#E5E4DF] rounded-lg"
              />
            </div>

            <div className="flex justify-end gap-2 pt-3 border-t border-[#E5E4DF]">
              <button
                type="button"
                onClick={() => setAdjModalOpen(false)}
                className="px-4 py-2 rounded-lg border border-[#E5E4DF] cursor-pointer"
              >
                Annuler
              </button>
              <button
                type="submit"
                disabled={adjSaving}
                className="px-4 py-2 rounded-lg bg-[#721C24] text-white font-medium cursor-pointer"
              >
                {adjSaving ? 'Enregistrement…' : 'Valider le mouvement'}
              </button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
};
