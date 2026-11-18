import React, { useMemo, useState } from 'react';
import {
  ClipboardPaste,
  Download,
  Plus,
  Search,
  Trash2,
} from 'lucide-react';
import {
  AppSettings,
  OrderLine,
  OrderStatus,
  WineCatalogItem,
} from '../types/wine';
import {
  computeBottleEconomics,
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
  onUpdateOrderStatus: (orderId: string, statut: OrderStatus) => void;
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

export const OrdersView: React.FC<OrdersViewProps> = ({
  orders,
  catalog,
  settings,
  onUpdateOrderStatus,
  onBulkUpdateCampaignStatus,
  onDeleteOrder,
  onOpenImport,
  onOpenNewDirectOrder,
}) => {
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<OrderStatus | 'all'>('all');
  const [venteFilter, setVenteFilter] = useState<string>('all');

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
      bottles += o.qte;
      caTTC += o.prixUnitaireTTC * o.qte;
      const cat = catalogMap.get(o.catalogId);
      if (cat) {
        const econ = computeBottleEconomics(cat, settings, o.prixUnitaireTTC);
        margeTotal += econ.margeEuro * o.qte;
      }
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
      'Marge unitaire EUR',
      'Statut',
      'Source',
    ];
    const rows = filteredOrders.map((o) => {
      const cat = catalogMap.get(o.catalogId);
      const econ = cat
        ? computeBottleEconomics(cat, settings, o.prixUnitaireTTC)
        : null;
      return [
        formatDateFR(o.date),
        o.refCommande,
        o.vente,
        `${o.prenomClient} ${o.nomClient}`.trim(),
        o.produitLabel,
        o.prixUnitaireTTC.toFixed(2).replace('.', ','),
        String(o.qte),
        econ ? econ.margeEuro.toFixed(2).replace('.', ',') : '0,00',
        STATUS_LABELS[o.statut],
        o.source,
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
                const econ = cat
                  ? computeBottleEconomics(cat, settings, o.prixUnitaireTTC)
                  : null;
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
                          {o.source === 'direct' ? 'Vente directe' : 'Cave perso'}
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
                      ) : econ ? (
                        <div>
                          <span
                            className={`font-medium ${
                              econ.margeEuro >= 0
                                ? 'text-[#15803D]'
                                : 'text-[#B91C1C]'
                            }`}
                          >
                            {formatEUR(econ.margeEuro * o.qte, true)}
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
                    <td className="py-2.5 px-3 text-right">
                      <button
                        onClick={() => onDeleteOrder(o.id)}
                        className="p-1.5 text-[#9E9B93] hover:text-[#B91C1C] rounded-md transition-colors"
                        title="Supprimer la ligne"
                        aria-label="Supprimer la ligne"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
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
    </div>
  );
};
