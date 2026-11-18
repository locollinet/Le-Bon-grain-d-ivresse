import React, { useEffect, useMemo, useState } from 'react';
import {
  Check,
  PackageCheck,
  PackagePlus,
  Search,
  Trash2,
  Warehouse,
} from 'lucide-react';
import { StockSummaryRow, SupplierLot, WineCatalogItem } from '../types/wine';
import { formatDateFR, formatEUR, normalizeSearchText } from '../utils/wineMath';
import { DataSourceBanner } from './DataSourceBanner';

export type StockFilter = 'all' | 'avance' | 'dispo' | 'attente' | 'deficit';

interface StockViewProps {
  stockRows: StockSummaryRow[];
  lots: SupplierLot[];
  catalog: WineCatalogItem[];
  isDemoMode: boolean;
  onEnableDemoMode: () => void;
  onDisableDemoMode: () => void;
  onOpenInvoiceAI?: () => void;
  initialFocus?: {
    search?: string;
    filter?: StockFilter;
    subTab?: 'inventory' | 'lots';
  } | null;
  onOpenNewLot: (preselectedCatalogId?: string) => void;
  onReceiveLot: (
    lotId: string,
    alsoUpdateOrders: boolean,
    qtyReceivedTotal?: number
  ) => void;
  onDeleteLot?: (lotId: string) => void;
}

const LOT_ORIGIN_BADGES: Record<
  NonNullable<SupplierLot['origin']>,
  { label: string; className: string }
> = {
  excel_dispos: {
    label: 'Tableur Dispos (col. S)',
    className: 'bg-[#15803D]/10 text-[#15803D] border-[#15803D]/25',
  },
  excel_status_inferred: {
    label: 'Déduit col. K (sans facture)',
    className: 'bg-[#B45309]/10 text-[#B45309] border-[#B45309]/25',
  },
  demo: {
    label: 'Scénario Démo',
    className: 'bg-[#721C24]/10 text-[#721C24] border-[#721C24]/25',
  },
  manual: {
    label: 'Saisie / Facture IA',
    className: 'bg-[#F6F6F4] text-[#4A4A45] border-[#D8D6D0]',
  },
};

export const StockView: React.FC<StockViewProps> = ({
  stockRows,
  lots,
  catalog,
  isDemoMode,
  onEnableDemoMode,
  onDisableDemoMode,
  onOpenInvoiceAI,
  initialFocus,
  onOpenNewLot,
  onReceiveLot,
  onDeleteLot,
}) => {
  const [subTab, setSubTab] = useState<'inventory' | 'lots'>('inventory');
  const [search, setSearch] = useState('');
  const [filter, setFilter] = useState<StockFilter>('all');
  const [showZeroRows, setShowZeroRows] = useState(false);
  const [partialQtyDraft, setPartialQtyDraft] = useState<Record<string, number>>({});
  const [confirmDeleteLotId, setConfirmDeleteLotId] = useState<string | null>(null);

  useEffect(() => {
    if (!initialFocus) return;
    if (initialFocus.search !== undefined) setSearch(initialFocus.search);
    if (initialFocus.filter !== undefined) setFilter(initialFocus.filter);
    if (initialFocus.subTab !== undefined) setSubTab(initialFocus.subTab);
  }, [initialFocus]);

  const catalogMap = useMemo(
    () => new Map(catalog.map((c) => [c.id, c])),
    [catalog]
  );

  const totals = useMemo(() => {
    return stockRows.reduce(
      (acc, r) => ({
        physique: acc.physique + r.physiqueCave,
        transit: acc.transit + r.enCommandeFournisseur,
        reserve: acc.reserve + r.reserveClients,
        dispo: acc.dispo + Math.max(0, r.disponibleVente),
        capitalHT: acc.capitalHT + r.capitalImmobiliseHT,
      }),
      { physique: 0, transit: 0, reserve: 0, dispo: 0, capitalHT: 0 }
    );
  }, [stockRows]);

  const activeStockCount = useMemo(
    () =>
      stockRows.filter(
        (r) =>
          r.physiqueCave > 0 ||
          r.enCommandeFournisseur > 0 ||
          r.reserveClients > 0 ||
          r.disponibleVente !== 0 ||
          r.hasAdvanceStock
      ).length,
    [stockRows]
  );

  const filteredStock = useMemo(() => {
    const q = normalizeSearchText(search);
    const hasActiveMovement = (r: StockSummaryRow) =>
      r.physiqueCave > 0 ||
      r.enCommandeFournisseur > 0 ||
      r.reserveClients > 0 ||
      r.disponibleVente !== 0 ||
      r.hasAdvanceStock;

    return stockRows
      .filter((r) => {
        if (q) {
          const hay = normalizeSearchText(
            `${r.catalog.domaine} ${r.catalog.cuvee} ${r.catalog.vente}`
          );
          if (!hay.includes(q)) return false;
        }
        if (filter === 'avance') return r.hasAdvanceStock;
        if (filter === 'dispo') return r.disponibleVente > 0;
        if (filter === 'attente')
          return r.enCommandeFournisseur > 0 || r.attenteReceptionClients > 0;
        if (filter === 'deficit') return r.disponibleVente < 0;
        if (!q && !showZeroRows && !hasActiveMovement(r)) return false;
        return true;
      })
      .sort((a, b) => {
        const rank = (r: StockSummaryRow) => {
          if (r.disponibleVente < 0) return 0; // À commander en priorité
          if (r.disponibleVente > 0) return 1; // Dispo libre
          if (r.reserveClients > 0 || r.enCommandeFournisseur > 0) return 2;
          if (r.physiqueCave > 0) return 3;
          return 4;
        };
        const diff = rank(a) - rank(b);
        if (diff !== 0) return diff;
        return a.disponibleVente - b.disponibleVente;
      });
  }, [stockRows, search, filter, showZeroRows]);

  const sortedLots = useMemo(() => {
    const q = normalizeSearchText(search);
    return [...lots]
      .filter((l) => {
        if (!q) return true;
        const cat = catalogMap.get(l.catalogId);
        const hay = normalizeSearchText(
          `${cat?.domaine ?? ''} ${cat?.cuvee ?? ''} ${l.referenceFacture}`
        );
        return hay.includes(q);
      })
      .sort((a, b) => b.dateAchat.localeCompare(a.dateAchat));
  }, [lots, search, catalogMap]);

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-end justify-between gap-4">
        <div>
          <h1 className="font-display text-3xl font-semibold text-[#141413] tracking-tight">
            Stock, dispos &amp; achats domaines
          </h1>
          <p className="text-sm text-[#6B6B66] mt-1">
            Suivez vos bouteilles disponibles (Dispos), achats d’avance et besoins à
            commander — même sans stockage permanent entre domaine et client.
          </p>
        </div>

        <button
          onClick={() => onOpenNewLot()}
          className="inline-flex items-center gap-2 px-4 py-2 text-sm font-medium text-white bg-[#721C24] hover:bg-[#5B151C] rounded-lg transition-colors whitespace-nowrap shrink-0"
        >
          <PackagePlus className="w-4 h-4" />
          <span>Nouvel achat domaine</span>
        </button>
      </div>

      {/* Transparent Excel vs Demo Mode Indicator */}
      <DataSourceBanner
        isDemoMode={isDemoMode}
        onEnableDemoMode={onEnableDemoMode}
        onDisableDemoMode={onDisableDemoMode}
        onOpenInvoiceAI={onOpenInvoiceAI}
        variant="stock"
      />

      {/* 4 Stock KPIs */}
      <div className="grid grid-cols-2 lg:grid-cols-5 gap-4">
        <div className="bg-white border border-[#E5E4DF] rounded-xl p-4">
          <div className="text-xs text-[#6B6B66]">Reçu par LBG (stock)</div>
          <div className="mt-1.5 text-xl font-semibold text-[#141413] font-mono-num">
            {totals.physique} btl
          </div>
        </div>
        <div className="bg-white border border-[#E5E4DF] rounded-xl p-4">
          <div className="text-xs text-[#6B6B66]">En transit / commandé</div>
          <div className="mt-1.5 text-xl font-semibold text-[#B45309] font-mono-num">
            {totals.transit} btl
          </div>
        </div>
        <div className="bg-white border border-[#E5E4DF] rounded-xl p-4">
          <div className="text-xs text-[#6B6B66]">Réservé clients</div>
          <div className="mt-1.5 text-xl font-semibold text-[#141413] font-mono-num">
            {totals.reserve} btl
          </div>
        </div>
        <div className="bg-white border border-[#E5E4DF] rounded-xl p-4">
          <div className="text-xs text-[#6B6B66]">Disponible libre</div>
          <div className="mt-1.5 text-xl font-semibold text-[#15803D] font-mono-num">
            {totals.dispo} btl
          </div>
        </div>
        <div className="bg-white border border-[#E5E4DF] rounded-xl p-4 col-span-2 lg:col-span-1">
          <div className="text-xs text-[#6B6B66]">Capital immobilisé HT</div>
          <div className="mt-1.5 text-xl font-semibold text-[#721C24] font-mono-num">
            {formatEUR(totals.capitalHT)}
          </div>
        </div>
      </div>

      {/* Toolbar: Segmented Subtabs + Search + Filters */}
      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4 bg-white border border-[#E5E4DF] rounded-xl p-4">
        <div className="flex flex-wrap items-center gap-1 p-1 bg-[#F6F6F4] rounded-lg w-fit max-w-full">
          <button
            onClick={() => setSubTab('inventory')}
            className={`px-3.5 py-1.5 text-xs font-medium rounded-md transition-colors whitespace-nowrap ${
              subTab === 'inventory'
                ? 'bg-white text-[#141413] shadow-sm'
                : 'text-[#6B6B66] hover:text-[#141413]'
            }`}
          >
            Position par cuvée ({activeStockCount} actives)
          </button>
          <button
            onClick={() => setSubTab('lots')}
            className={`px-3.5 py-1.5 text-xs font-medium rounded-md transition-colors whitespace-nowrap ${
              subTab === 'lots'
                ? 'bg-white text-[#141413] shadow-sm'
                : 'text-[#6B6B66] hover:text-[#141413]'
            }`}
          >
            Lots fournisseurs &amp; réceptions ({lots.length})
          </button>
        </div>

        <div className="flex flex-wrap items-center gap-3">
          {subTab === 'inventory' && (
            <div className="flex flex-wrap items-center gap-1 p-1 bg-[#F6F6F4] rounded-lg">
              {(
                [
                  ['all', 'Tout'],
                  ['avance', 'Acheté en avance'],
                  ['dispo', 'Dispo à vendre'],
                  ['attente', 'En attente domaine'],
                  ['deficit', 'À commander'],
                ] as const
              ).map(([key, label]) => (
                <button
                  key={key}
                  onClick={() => setFilter(key)}
                  className={`px-2.5 py-1 text-xs font-medium rounded-md transition-colors whitespace-nowrap ${
                    filter === key
                      ? 'bg-white text-[#141413] shadow-sm'
                      : 'text-[#6B6B66] hover:text-[#141413]'
                  }`}
                >
                  {label}
                </button>
              ))}
            </div>
          )}

          {subTab === 'inventory' && filter === 'all' && !search.trim() && stockRows.length > activeStockCount && (
            <button
              type="button"
              onClick={() => setShowZeroRows((v) => !v)}
              className="px-2.5 py-1.5 text-xs font-medium text-[#6B6B66] hover:text-[#141413] bg-[#FAF9F7] hover:bg-[#F3F1EC] border border-[#D8D6D0] rounded-lg transition-colors whitespace-nowrap"
            >
              {showZeroRows
                ? `Masquer les ${stockRows.length - activeStockCount} sans mouvement`
                : `Tout voir (${stockRows.length})`}
            </button>
          )}

          <div className="relative w-full sm:w-64">
            <Search className="w-4 h-4 text-[#6B6B66] absolute left-3 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Rechercher domaine, cuvée, facture..."
              className="pl-9 pr-3 py-1.5 text-sm bg-[#FAF9F7] border border-[#D8D6D0] rounded-lg focus:outline-none focus:border-[#721C24] w-full"
            />
          </div>
        </div>
      </div>

      {/* Subtab 1: Stock Table */}
      {subTab === 'inventory' && (
        <div className="bg-white border border-[#E5E4DF] rounded-xl overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse text-sm">
              <thead>
                <tr className="bg-[#FAF9F7] text-xs text-[#6B6B66] border-b border-[#E5E4DF]">
                  <th className="py-3 px-5 font-medium">Domaine &amp; Cuvée</th>
                  <th className="py-3 px-4 font-medium text-right">
                    Reçu LBG
                  </th>
                  <th className="py-3 px-4 font-medium text-right">
                    En commande dom.
                  </th>
                  <th className="py-3 px-4 font-medium text-right">
                    Réservé clients
                  </th>
                  <th className="py-3 px-4 font-medium text-right">
                    Dispo réel vente
                  </th>
                  <th className="py-3 px-4 font-medium text-right">
                    Capital HT
                  </th>
                  <th className="py-3 px-5 font-medium text-right">Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#ECEAE4]">
                {filteredStock.map((row) => (
                  <tr
                    key={row.catalog.id}
                    className="hover:bg-[#FAF9F7] transition-colors"
                  >
                    <td className="py-3 px-5">
                      <div className="font-medium text-[#141413]">
                        {row.catalog.cuvee}
                      </div>
                      <div className="text-xs text-[#6B6B66] flex items-center gap-1.5 mt-0.5">
                        <span>{row.catalog.domaine}</span>
                        <span aria-hidden="true">·</span>
                        <span>{row.catalog.vente}</span>
                        {row.hasAdvanceStock && (
                          <>
                            <span aria-hidden="true">·</span>
                            <span className="text-[#721C24] font-medium">
                              Achat d’avance
                            </span>
                          </>
                        )}
                      </div>
                    </td>
                    <td className="py-3 px-4 text-right font-mono-num text-[#141413]">
                      {row.physiqueCave}
                    </td>
                    <td className="py-3 px-4 text-right font-mono-num text-[#B45309]">
                      {row.enCommandeFournisseur > 0
                        ? row.enCommandeFournisseur
                        : '—'}
                    </td>
                    <td className="py-3 px-4 text-right font-mono-num">
                      <div className="text-[#141413]">{row.reserveClients}</div>
                      {row.reserveClients > 0 && (
                        <div className="text-[11px] text-[#6B6B66]">
                          {row.pretARemettreClients > 0
                            ? `${row.pretARemettreClients} prêt`
                            : `${row.attenteReceptionClients} att.`}
                        </div>
                      )}
                    </td>
                    <td className="py-3 px-4 text-right font-mono-num font-semibold">
                      {row.disponibleVente > 0 ? (
                        <span className="text-[#15803D]">
                          +{row.disponibleVente} btl
                        </span>
                      ) : row.disponibleVente < 0 ? (
                        <span className="text-[#B91C1C]">
                          {row.disponibleVente} (À commander)
                        </span>
                      ) : (
                        <span className="text-[#6B6B66]">0</span>
                      )}
                    </td>
                    <td className="py-3 px-4 text-right font-mono-num text-[#141413]">
                      {row.capitalImmobiliseHT > 0
                        ? formatEUR(row.capitalImmobiliseHT)
                        : '—'}
                    </td>
                    <td className="py-3 px-5 text-right whitespace-nowrap">
                      <button
                        onClick={() => onOpenNewLot(row.catalog.id)}
                        className="px-3 py-1.5 text-xs font-medium text-[#721C24] hover:bg-[#721C24]/10 border border-[#721C24]/25 rounded-md transition-colors"
                      >
                        + Approvisionner
                      </button>
                    </td>
                  </tr>
                ))}

                {filteredStock.length === 0 && (
                  <tr>
                    <td
                      colSpan={7}
                      className="py-12 text-center text-sm text-[#6B6B66]"
                    >
                      <Warehouse className="w-7 h-7 mx-auto mb-2 text-[#9E9B93]" />
                      Aucune cuvée ne correspond à ce filtre.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Subtab 2: Supplier Lots & 1-click Reception */}
      {subTab === 'lots' && (
        <div className="bg-white border border-[#E5E4DF] rounded-xl overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse text-sm">
              <thead>
                <tr className="bg-[#FAF9F7] text-xs text-[#6B6B66] border-b border-[#E5E4DF]">
                  <th className="py-3 px-5 font-medium">Date · Facture</th>
                  <th className="py-3 px-4 font-medium">Domaine &amp; Cuvée</th>
                  <th className="py-3 px-4 font-medium">Nature</th>
                  <th className="py-3 px-4 font-medium text-right">
                    Reçu / Cmd
                  </th>
                  <th className="py-3 px-4 font-medium text-right">
                    Coût HT / btl
                  </th>
                  <th className="py-3 px-4 font-medium text-right">
                    Total HT
                  </th>
                  <th className="py-3 px-5 font-medium text-right">
                    Réception
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#ECEAE4]">
                {sortedLots.map((lot) => {
                  const cat = catalogMap.get(lot.catalogId);
                  const isReceived = lot.qteRecue >= lot.qteCommandee;
                  return (
                    <tr
                      key={lot.id}
                      className="hover:bg-[#FAF9F7] transition-colors"
                    >
                      <td className="py-3 px-5 whitespace-nowrap">
                        <div className="font-mono-num text-xs text-[#141413]">
                          {formatDateFR(lot.dateAchat)}
                        </div>
                        <div className="text-xs text-[#6B6B66] font-mono-num">
                          {lot.referenceFacture}
                        </div>
                      </td>
                      <td className="py-3 px-4">
                        <div className="font-medium text-[#141413]">
                          {cat?.cuvee ?? 'Cuvée inconnue'}
                        </div>
                        <div className="text-xs text-[#6B6B66] flex flex-wrap items-center gap-1.5 mt-0.5">
                          <span>{cat?.domaine}</span>
                          {(() => {
                            const originInfo =
                              LOT_ORIGIN_BADGES[lot.origin ?? 'manual'];
                            return (
                              <span
                                className={`inline-block px-1.5 py-0.5 text-[10px] font-medium border rounded ${originInfo.className}`}
                              >
                                {originInfo.label}
                              </span>
                            );
                          })()}
                          {lot.notes && <span>· {lot.notes}</span>}
                        </div>
                      </td>
                      <td className="py-3 px-4 text-xs whitespace-nowrap">
                        {lot.typeAchat === 'avance' ? (
                          <span className="font-medium text-[#721C24]">
                            Achat en avance
                          </span>
                        ) : lot.typeAchat === 'cave' ? (
                          <span className="font-medium text-[#141413]">
                            Stock cave
                          </span>
                        ) : (
                          <span className="text-[#6B6B66]">
                            Allocation vente
                          </span>
                        )}
                      </td>
                      <td className="py-3 px-4 text-right font-mono-num">
                        <span
                          className={
                            isReceived ? 'text-[#15803D]' : 'text-[#B45309]'
                          }
                        >
                          {lot.qteRecue}
                        </span>
                        <span className="text-[#6B6B66]">
                          {' '}
                          / {lot.qteCommandee}
                        </span>
                      </td>
                      <td className="py-3 px-4 text-right font-mono-num">
                        {formatEUR(lot.coutUnitaireHT)}
                      </td>
                      <td className="py-3 px-4 text-right font-mono-num font-medium">
                        {formatEUR(lot.coutUnitaireHT * lot.qteCommandee)}
                      </td>
                      <td className="py-3 px-5 text-right whitespace-nowrap">
                        <div className="inline-flex items-center justify-end gap-2">
                          {isReceived ? (
                            <span className="inline-flex items-center gap-1 text-xs font-medium text-[#15803D]">
                              <Check className="w-3.5 h-3.5" /> Reçu en cave
                            </span>
                          ) : (
                            <div className="inline-flex items-center gap-1.5">
                              <input
                                type="number"
                                min={Math.max(1, lot.qteRecue)}
                                max={lot.qteCommandee}
                                value={
                                  partialQtyDraft[lot.id] ?? lot.qteCommandee
                                }
                                onChange={(e) => {
                                  const raw = Number(e.target.value);
                                  const safe = Number.isFinite(raw)
                                    ? raw
                                    : lot.qteRecue;
                                  setPartialQtyDraft((prev) => ({
                                    ...prev,
                                    [lot.id]: Math.max(
                                      lot.qteRecue,
                                      Math.min(lot.qteCommandee, safe)
                                    ),
                                  }));
                                }}
                                aria-label="Quantité reçue"
                                className="w-14 px-2 py-1 text-xs text-right font-mono-num border border-[#D8D6D0] rounded"
                              />
                              <button
                                onClick={() =>
                                  onReceiveLot(
                                    lot.id,
                                    true,
                                    partialQtyDraft[lot.id] ?? lot.qteCommandee
                                  )
                                }
                                className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-white bg-[#15803D] hover:bg-[#166534] rounded-md transition-colors"
                                title="Enregistre la réception en cave ET attribue les bouteilles aux commandes clients en attente (dans la limite du disponible)"
                              >
                                <PackageCheck className="w-3.5 h-3.5" />
                                <span>Réceptionner</span>
                              </button>
                            </div>
                          )}
                          {onDeleteLot && (
                            <button
                              type="button"
                              onClick={() => setConfirmDeleteLotId(lot.id)}
                              className="p-1.5 text-[#9E9B93] hover:text-[#B91C1C] rounded-md transition-colors"
                              title="Supprimer ce lot"
                              aria-label="Supprimer ce lot"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {confirmDeleteLotId && onDeleteLot && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/45 p-4"
          role="dialog"
          aria-modal="true"
        >
          <div className="w-full max-w-sm bg-white border border-[#E5E4DF] rounded-xl shadow-2xl p-5 space-y-4">
            <h3 className="text-base font-semibold text-[#141413]">
              Supprimer ce lot fournisseur ?
            </h3>
            <p className="text-xs text-[#6B6B66]">
              Cette action mettra immédiatement à jour votre stock physique, vos
              achats en transit et votre journal des achats TVA.
            </p>
            <div className="flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setConfirmDeleteLotId(null)}
                className="px-3.5 py-1.5 text-xs font-medium text-[#6B6B66]"
              >
                Annuler
              </button>
              <button
                type="button"
                onClick={() => {
                  onDeleteLot(confirmDeleteLotId);
                  setConfirmDeleteLotId(null);
                }}
                className="px-4 py-1.5 text-xs font-medium text-white bg-[#B91C1C] hover:bg-[#991B1B] rounded-lg"
              >
                Supprimer
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
