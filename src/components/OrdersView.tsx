import React, { useEffect, useMemo, useState } from 'react';
import {
  ClipboardPaste,
  Download,
  Pencil,
  Plus,
  Search,
  Trash2,
  X,
} from 'lucide-react';
import {
  AppSettings,
  OrderLine,
  OrderStatus,
  WineCatalogItem,
} from '../types/wine';
import {
  computeOrderLineEconomics,
  formatDateFR,
  formatEUR,
  formatPct,
  maskClientName,
  normalizeSearchText,
} from '../utils/wineMath';

interface OrdersViewProps {
  orders: OrderLine[];
  catalog: WineCatalogItem[];
  settings: AppSettings;
  initialFocus?: { search?: string; vente?: string } | null;
  onUpdateOrderStatus: (orderId: string, statut: OrderStatus) => void;
  onUpdateOrder?: (updated: OrderLine) => void;
  onBulkUpdateCampaignStatus: (
    vente: string,
    fromStatus: OrderStatus,
    toStatus: OrderStatus
  ) => void;
  onDeleteOrder: (orderId: string) => void;
  onOpenImport: () => void;
  onOpenNewDirectOrder: () => void;
}

const STATUS_LABELS: Record<OrderStatus, string> = {
  attente_reception: 'En attente domaine',
  recu_lbg: 'Reçu par LBG',
  remis_client: 'Remis au client',
  annule: 'Annulé',
};

const SOURCE_LABELS: Record<OrderLine['source'], string> = {
  helloasso: 'HelloAsso',
  direct: 'Vente directe',
  perso: 'Cave perso',
  facture_ia: 'Facture IA',
};

export const OrdersView: React.FC<OrdersViewProps> = ({
  orders,
  catalog,
  settings,
  initialFocus,
  onUpdateOrderStatus,
  onUpdateOrder,
  onBulkUpdateCampaignStatus,
  onDeleteOrder,
  onOpenImport,
  onOpenNewDirectOrder,
}) => {
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<OrderStatus | 'all'>('all');
  const [venteFilter, setVenteFilter] = useState<string>('all');
  const [editingOrder, setEditingOrder] = useState<OrderLine | null>(null);
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);

  useEffect(() => {
    if (!initialFocus) return;
    if (initialFocus.search !== undefined) setSearch(initialFocus.search);
    if (initialFocus.vente !== undefined) setVenteFilter(initialFocus.vente);
  }, [initialFocus]);

  const catalogMap = useMemo(
    () => new Map(catalog.map((c) => [c.id, c])),
    [catalog]
  );

  const uniqueVentes = useMemo(() => {
    return Array.from(new Set(orders.map((o) => o.vente))).sort();
  }, [orders]);

  const filteredOrders = useMemo(() => {
    const q = normalizeSearchText(search);
    return orders
      .filter((o) => {
        if (statusFilter !== 'all' && o.statut !== statusFilter) return false;
        if (venteFilter !== 'all' && o.vente !== venteFilter) return false;
        if (q) {
          const cat = catalogMap.get(o.catalogId);
          const hay = normalizeSearchText(
            `${o.refCommande} ${o.nomClient} ${o.prenomClient} ${o.produitLabel} ${cat?.domaine ?? ''} ${o.vente}`
          );
          if (!hay.includes(q)) return false;
        }
        return true;
      })
      .sort((a, b) => b.date.localeCompare(a.date));
  }, [orders, statusFilter, venteFilter, search, catalogMap]);

  const filteredTotals = useMemo(() => {
    const active = filteredOrders.filter((o) => o.statut !== 'annule');
    let bottles = 0;
    let caTTC = 0;
    let margeTotal = 0;
    for (const o of active) {
      const cat = catalogMap.get(o.catalogId);
      const econ = computeOrderLineEconomics(o, cat, settings);
      if (econ.isPerso) continue;
      bottles += o.qte;
      caTTC += econ.caTTC;
      margeTotal += econ.margeEuroTotal;
    }
    return { bottles, caTTC, margeTotal };
  }, [filteredOrders, catalogMap, settings]);

  const handleExportCSV = () => {
    const headers = [
      'Date',
      'Ref commande',
      'Vente',
      'Client',
      'Produit',
      'Prix unitaire TTC',
      'Qte',
      'Marge totale EUR',
      'Statut',
      'Source',
    ];
    const rows = filteredOrders.map((o) => {
      const cat = catalogMap.get(o.catalogId);
      const econ = computeOrderLineEconomics(o, cat, settings);
      return [
        formatDateFR(o.date),
        o.refCommande,
        o.vente,
        `${o.prenomClient} ${o.nomClient}`.trim(),
        o.produitLabel,
        o.prixUnitaireTTC.toFixed(2).replace('.', ','),
        String(o.qte),
        econ.margeEuroTotal.toFixed(2).replace('.', ','),
        STATUS_LABELS[o.statut],
        SOURCE_LABELS[o.source],
      ]
        .map((v) => `"${v.replace(/"/g, '""')}"`)
        .join(';');
    });
    const csv = '\uFEFF' + [headers.join(';'), ...rows].join('\n');
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `commandes_lbg_${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const canBulkReceive =
    venteFilter !== 'all' &&
    filteredOrders.some((o) => o.statut === 'attente_reception');

  const canBulkDeliver =
    venteFilter !== 'all' &&
    filteredOrders.some((o) => o.statut === 'recu_lbg');

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col lg:flex-row lg:items-end justify-between gap-4">
        <div>
          <h1 className="font-display text-3xl font-semibold text-[#141413] tracking-tight">
            Commandes &amp; suivi logistique
          </h1>
          <p className="text-sm text-[#6B6B66] mt-1">
            Centralisez vos imports HelloAsso et ventes directes, puis faites
            avancer les statuts en un clic.
          </p>
          <p className="text-xs text-[#9E9B93] mt-0.5">
            Règle Excel : les ventes historiques sans colonne K (Vernay, Geoffroy juil. 2026) sont classées en « Remis au client » ; tout import HelloAsso brut démarre en « En attente domaine ».
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2.5">
          <button
            onClick={handleExportCSV}
            className="inline-flex items-center gap-2 px-3.5 py-2 text-sm font-medium text-[#141413] bg-white hover:bg-[#F6F6F4] border border-[#D8D6D0] rounded-lg transition-colors whitespace-nowrap"
          >
            <Download className="w-4 h-4 text-[#6B6B66]" />
            <span>Exporter CSV</span>
          </button>
          <button
            onClick={onOpenNewDirectOrder}
            className="inline-flex items-center gap-2 px-3.5 py-2 text-sm font-medium text-[#141413] bg-white hover:bg-[#F6F6F4] border border-[#D8D6D0] rounded-lg transition-colors whitespace-nowrap"
          >
            <Plus className="w-4 h-4 text-[#721C24]" />
            <span>Vente directe</span>
          </button>
          <button
            onClick={onOpenImport}
            className="inline-flex items-center gap-2 px-4 py-2 text-sm font-medium text-white bg-[#721C24] hover:bg-[#5B151C] rounded-lg transition-colors whitespace-nowrap"
          >
            <ClipboardPaste className="w-4 h-4" />
            <span>Importer HelloAsso</span>
          </button>
        </div>
      </div>

      {/* Filters Bar */}
      <div className="bg-white border border-[#E5E4DF] rounded-xl p-4 space-y-3">
        <div className="flex flex-col xl:flex-row xl:items-center justify-between gap-3">
          <div className="flex flex-wrap items-center gap-1 p-1 bg-[#F6F6F4] rounded-lg w-fit">
            {(
              [
                ['all', 'Toutes'],
                ['attente_reception', 'En attente domaine'],
                ['recu_lbg', 'Reçu par LBG'],
                ['remis_client', 'Remis client'],
                ['annule', 'Annulées'],
              ] as const
            ).map(([key, label]) => (
              <button
                key={key}
                onClick={() => setStatusFilter(key)}
                className={`px-3 py-1.5 text-xs font-medium rounded-md transition-colors whitespace-nowrap ${
                  statusFilter === key
                    ? 'bg-white text-[#141413] shadow-sm'
                    : 'text-[#6B6B66] hover:text-[#141413]'
                }`}
              >
                {label}
              </button>
            ))}
          </div>

          <div className="flex flex-wrap items-center gap-3">
            <select
              value={venteFilter}
              onChange={(e) => setVenteFilter(e.target.value)}
              className="px-3 py-1.5 text-sm bg-[#FAF9F7] border border-[#D8D6D0] rounded-lg focus:outline-none focus:border-[#721C24] max-w-full"
            >
              <option value="all">Toutes les ventes</option>
              {uniqueVentes.map((v) => (
                <option key={v} value={v}>
                  {v}
                </option>
              ))}
            </select>

            <div className="relative w-full sm:w-56">
              <Search className="w-4 h-4 text-[#6B6B66] absolute left-3 top-1/2 -translate-y-1/2" />
              <input
                type="text"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Client, réf, cuvée..."
                className="pl-9 pr-3 py-1.5 text-sm bg-[#FAF9F7] border border-[#D8D6D0] rounded-lg focus:outline-none focus:border-[#721C24] w-full"
              />
            </div>
          </div>
        </div>

        {/* Summary & Campaign Bulk Action */}
        <div className="flex flex-wrap items-center justify-between gap-3 pt-2 border-t border-[#ECEAE4] text-xs text-[#6B6B66]">
          <div className="flex items-center gap-3 tabular-nums">
            <span>{filteredOrders.length} lignes affichées</span>
            <span aria-hidden="true">·</span>
            <span className="font-medium text-[#141413]">
              {filteredTotals.bottles} bouteilles actives
            </span>
            <span aria-hidden="true">·</span>
            <span className="font-medium text-[#141413]">
              {formatEUR(filteredTotals.caTTC)} TTC
            </span>
            <span aria-hidden="true">·</span>
            <span className="font-medium text-[#15803D]">
              Marge nette : {formatEUR(filteredTotals.margeTotal, true)}
            </span>
          </div>

          {(canBulkReceive || canBulkDeliver) && (
            <div className="flex items-center gap-2">
              {canBulkReceive && (
                <button
                  onClick={() =>
                    onBulkUpdateCampaignStatus(
                      venteFilter,
                      'attente_reception',
                      'recu_lbg'
                    )
                  }
                  className="px-3 py-1 text-xs font-medium text-[#15803D] bg-[#15803D]/10 hover:bg-[#15803D]/18 rounded-md transition-colors"
                >
                  Tout passer en « Reçu par LBG » ({venteFilter})
                </button>
              )}
              {canBulkDeliver && (
                <button
                  onClick={() =>
                    onBulkUpdateCampaignStatus(
                      venteFilter,
                      'recu_lbg',
                      'remis_client'
                    )
                  }
                  className="px-3 py-1 text-xs font-medium text-[#141413] bg-[#F6F6F4] hover:bg-[#E5E4DF] border border-[#D8D6D0] rounded-md transition-colors"
                >
                  Tout passer en « Remis au client » ({venteFilter})
                </button>
              )}
            </div>
          )}
        </div>
      </div>

      {/* Orders Table */}
      <div className="bg-white border border-[#E5E4DF] rounded-xl overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse text-sm">
            <thead>
              <tr className="bg-[#FAF9F7] text-xs text-[#6B6B66] border-b border-[#E5E4DF]">
                <th className="py-3 px-4 font-medium">Date · Réf</th>
                <th className="py-3 px-4 font-medium">Vente</th>
                <th className="py-3 px-4 font-medium">Client</th>
                <th className="py-3 px-4 font-medium">Cuvée</th>
                <th className="py-3 px-3 font-medium text-right">PU TTC</th>
                <th className="py-3 px-3 font-medium text-right">Qté</th>
                <th className="py-3 px-4 font-medium text-right">
                  Marge nette
                </th>
                <th className="py-3 px-4 font-medium">Statut logistique</th>
                <th className="py-3 px-3 font-medium text-right"></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[#ECEAE4]">
              {filteredOrders.map((o) => {
                const cat = catalogMap.get(o.catalogId);
                const econ = computeOrderLineEconomics(o, cat, settings);
                const isCancelled = o.statut === 'annule';
                return (
                  <tr
                    key={o.id}
                    className={`hover:bg-[#FAF9F7] transition-colors ${
                      isCancelled ? 'opacity-55 bg-[#FEF2F2]/40' : ''
                    }`}
                  >
                    <td className="py-2.5 px-4 whitespace-nowrap">
                      <div className="font-mono-num text-xs text-[#141413]">
                        {formatDateFR(o.date)}
                      </div>
                      <div className="text-[11px] font-mono-num text-[#6B6B66]">
                        {o.refCommande}
                      </div>
                    </td>
                    <td className="py-2.5 px-4 text-xs text-[#6B6B66] whitespace-nowrap">
                      <div>{o.vente}</div>
                      {o.source !== 'helloasso' && (
                        <div className="text-[#721C24] font-medium">
                          {SOURCE_LABELS[o.source]}
                        </div>
                      )}
                    </td>
                    <td className="py-2.5 px-4 whitespace-nowrap font-medium text-[#141413]">
                      {maskClientName(
                        o.prenomClient,
                        o.nomClient,
                        settings.anonymizeClients
                      )}
                    </td>
                    <td className="py-2.5 px-4">
                      <div className="font-medium text-[#141413]">
                        {o.produitLabel}
                      </div>
                      {cat && (
                        <div className="text-xs text-[#6B6B66]">
                          {cat.domaine}
                        </div>
                      )}
                    </td>
                    <td className="py-2.5 px-3 text-right font-mono-num">
                      {formatEUR(o.prixUnitaireTTC)}
                    </td>
                    <td className="py-2.5 px-3 text-right font-mono-num font-medium">
                      {o.qte}
                    </td>
                    <td className="py-2.5 px-4 text-right font-mono-num">
                      {isCancelled ? (
                        <span className="text-[#6B6B66]">—</span>
                      ) : econ.isPerso ? (
                        <span className="text-xs text-[#6B6B66]">
                          Perso (0 €)
                        </span>
                      ) : cat ? (
                        <div>
                          <span
                            className={`font-medium ${
                              econ.margeEuroTotal >= 0
                                ? 'text-[#15803D]'
                                : 'text-[#B91C1C]'
                            }`}
                          >
                            {formatEUR(econ.margeEuroTotal, true)}
                          </span>
                          <div className="text-[11px] text-[#6B6B66]">
                            {formatPct(econ.margePct)}
                          </div>
                        </div>
                      ) : (
                        '—'
                      )}
                    </td>
                    <td className="py-2.5 px-4 whitespace-nowrap">
                      <select
                        value={o.statut}
                        onChange={(e) =>
                          onUpdateOrderStatus(
                            o.id,
                            e.target.value as OrderStatus
                          )
                        }
                        className={`px-2.5 py-1 text-xs font-medium rounded-md border bg-white cursor-pointer focus:outline-none ${
                          o.statut === 'attente_reception'
                            ? 'border-[#F59E0B]/50 text-[#B45309]'
                            : o.statut === 'recu_lbg'
                              ? 'border-[#15803D]/50 text-[#15803D]'
                              : o.statut === 'annule'
                                ? 'border-[#DC2626]/40 text-[#B91C1C]'
                                : 'border-[#D8D6D0] text-[#6B6B66]'
                        }`}
                      >
                        <option value="attente_reception">
                          En attente domaine
                        </option>
                        <option value="recu_lbg">Reçu par LBG</option>
                        <option value="remis_client">Remis au client</option>
                        <option value="annule">Annulé</option>
                      </select>
                    </td>
                    <td className="py-2.5 px-3 text-right whitespace-nowrap">
                      <div className="inline-flex items-center gap-1">
                        {onUpdateOrder && (
                          <button
                            type="button"
                            onClick={() => setEditingOrder({ ...o })}
                            className="p-1.5 text-[#9E9B93] hover:text-[#141413] rounded-md transition-colors"
                            title="Modifier la commande"
                            aria-label="Modifier la commande"
                          >
                            <Pencil className="w-3.5 h-3.5" />
                          </button>
                        )}
                        <button
                          type="button"
                          onClick={() => setConfirmDeleteId(o.id)}
                          className="p-1.5 text-[#9E9B93] hover:text-[#B91C1C] rounded-md transition-colors"
                          title="Supprimer la ligne"
                          aria-label="Supprimer la ligne"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              })}

              {filteredOrders.length === 0 && (
                <tr>
                  <td
                    colSpan={9}
                    className="py-12 text-center text-sm text-[#6B6B66]"
                  >
                    Aucune commande trouvée pour ces critères.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Edit Order Modal */}
      {editingOrder && onUpdateOrder && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/45 p-4"
          role="dialog"
          aria-modal="true"
        >
          <div className="w-full max-w-md bg-white border border-[#E5E4DF] rounded-xl shadow-2xl overflow-hidden">
            <div className="flex items-center justify-between px-5 py-4 border-b border-[#E5E4DF]">
              <h3 className="text-base font-semibold text-[#141413]">
                Modifier la ligne commande ({editingOrder.refCommande})
              </h3>
              <button
                type="button"
                onClick={() => setEditingOrder(null)}
                className="p-1 text-[#6B6B66] hover:text-[#141413]"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
            <form
              onSubmit={(e) => {
                e.preventDefault();
                onUpdateOrder(editingOrder);
                setEditingOrder(null);
              }}
              className="p-5 space-y-3 text-xs"
            >
              <div>
                <label className="block font-medium text-[#6B6B66] mb-1">
                  Cuvée catalogue associée
                </label>
                <select
                  value={editingOrder.catalogId}
                  onChange={(e) => {
                    const cat = catalogMap.get(e.target.value);
                    setEditingOrder({
                      ...editingOrder,
                      catalogId: e.target.value,
                      produitLabel: cat?.cuvee ?? editingOrder.produitLabel,
                    });
                  }}
                  className="w-full px-3 py-2 border border-[#D8D6D0] rounded-lg"
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
                  <label className="block font-medium text-[#6B6B66] mb-1">
                    Quantité
                  </label>
                  <input
                    type="number"
                    min={1}
                    value={editingOrder.qte}
                    onChange={(e) =>
                      setEditingOrder({
                        ...editingOrder,
                        qte: Math.max(1, Number(e.target.value)),
                      })
                    }
                    className="w-full px-3 py-2 font-mono-num border border-[#D8D6D0] rounded-lg"
                  />
                </div>
                <div>
                  <label className="block font-medium text-[#6B6B66] mb-1">
                    PU TTC (€)
                  </label>
                  <input
                    type="number"
                    step="0.5"
                    min={0}
                    value={editingOrder.prixUnitaireTTC}
                    onChange={(e) =>
                      setEditingOrder({
                        ...editingOrder,
                        prixUnitaireTTC: Math.max(0, Number(e.target.value)),
                      })
                    }
                    className="w-full px-3 py-2 font-mono-num border border-[#D8D6D0] rounded-lg"
                  />
                </div>
              </div>
              <div>
                <label className="block font-medium text-[#6B6B66] mb-1">
                  Vente / Campagne
                </label>
                <input
                  type="text"
                  value={editingOrder.vente}
                  onChange={(e) =>
                    setEditingOrder({ ...editingOrder, vente: e.target.value })
                  }
                  className="w-full px-3 py-2 border border-[#D8D6D0] rounded-lg"
                />
              </div>
              <div className="flex justify-end gap-2 pt-2 border-t border-[#E5E4DF]">
                <button
                  type="button"
                  onClick={() => setEditingOrder(null)}
                  className="px-3.5 py-1.5 text-[#6B6B66]"
                >
                  Annuler
                </button>
                <button
                  type="submit"
                  className="px-4 py-1.5 font-medium text-white bg-[#721C24] rounded-lg"
                >
                  Enregistrer
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Delete Confirmation Modal */}
      {confirmDeleteId && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/45 p-4"
          role="dialog"
          aria-modal="true"
        >
          <div className="w-full max-w-sm bg-white border border-[#E5E4DF] rounded-xl shadow-2xl p-5 space-y-4">
            <h3 className="text-base font-semibold text-[#141413]">
              Supprimer cette ligne de commande ?
            </h3>
            <p className="text-xs text-[#6B6B66]">
              Si la commande a été annulée par le client, préférez le statut «
              Annulé » pour garder la trace comptable.
            </p>
            <div className="flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setConfirmDeleteId(null)}
                className="px-3.5 py-1.5 text-xs font-medium text-[#6B6B66]"
              >
                Annuler
              </button>
              <button
                type="button"
                onClick={() => {
                  onDeleteOrder(confirmDeleteId);
                  setConfirmDeleteId(null);
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
