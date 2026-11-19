import React, { useMemo, useState } from 'react';
import {
  Search,
  Upload,
  Plus,
  Download,
  Truck,
  CheckCircle2,
  Edit3,
  Printer,
  Trash2,
  X,
  Lock,
  Wallet,
} from 'lucide-react';
import {
  AppSettings,
  DeliveryMode,
  OrderLine,
  OrderStatus,
  PaymentMethod,
  PaymentStatus,
  WineCatalogItem,
} from '../types/wine';
import {
  formatDateFR,
  formatEUR,
  getEffectiveOrderPaymentStatus,
  getOrderLineUnpaidTTC,
  maskClientName,
  maskEmail,
  normalizeSearchText,
} from '../utils/wineMath';

interface OrdersViewProps {
  orders: OrderLine[];
  catalog: WineCatalogItem[];
  settings: AppSettings;
  onUpdateOrder: (order: OrderLine) => Promise<void>;
  onDeleteOrder: (orderId: string) => Promise<void>;
  onMarkCampaignDelivered: (vente: string) => Promise<void>;
  onOpenImportHelloAsso: () => void;
  onOpenNewDirectOrder: () => void;
}

const ORDER_STATUS_META: Record<OrderStatus, { label: string; color: string }> = {
  attente_reception: { label: 'Attente domaine', color: 'text-[#B45309]' },
  recu_lbg: { label: 'Prêt LBG', color: 'text-[#721C24]' },
  remis_client: { label: 'Remis client', color: 'text-[#15803D]' },
  annule: { label: 'Annulé', color: 'text-[#6B6A65] line-through' },
};

const PAYMENT_META: Record<PaymentStatus, { label: string; color: string }> = {
  en_attente: { label: 'À encaisser', color: 'text-[#B45309]' },
  partiel: { label: 'Partiel', color: 'text-[#B45309]' },
  paye: { label: 'Payé', color: 'text-[#15803D]' },
  rembourse: { label: 'Remboursé', color: 'text-[#6B6A65]' },
};

const DELIVERY_LABEL: Record<DeliveryMode, string> = {
  remise_main: 'Main propre',
  expedition: 'Expédition',
  garde_cave: 'Garde cave',
};

export const OrdersView: React.FC<OrdersViewProps> = ({
  orders,
  catalog,
  settings,
  onUpdateOrder,
  onDeleteOrder,
  onMarkCampaignDelivered,
  onOpenImportHelloAsso,
  onOpenNewDirectOrder,
}) => {
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<
    'all' | OrderStatus | 'impayes'
  >('all');
  const [campaignFilter, setCampaignFilter] = useState<string>('all');

  const [editingOrder, setEditingOrder] = useState<OrderLine | null>(null);
  const [deliverySlipRef, setDeliverySlipRef] = useState<string | null>(null);

  const catalogMap = useMemo(
    () => new Map(catalog.map((c) => [c.id, c])),
    [catalog]
  );

  const campaigns = useMemo(() => {
    const set = new Set<string>();
    for (const o of orders) if (o.vente) set.add(o.vente);
    return Array.from(set).sort((a, b) => a.localeCompare(b, 'fr'));
  }, [orders]);

  const counts = useMemo(() => {
    let attente = 0;
    let recu = 0;
    let remis = 0;
    let annule = 0;
    let impayes = 0;
    for (const o of orders) {
      if (o.statut === 'attente_reception') attente++;
      else if (o.statut === 'recu_lbg') recu++;
      else if (o.statut === 'remis_client') remis++;
      else if (o.statut === 'annule') annule++;
      if (getOrderLineUnpaidTTC(o) > 0.01) impayes++;
    }
    return { attente, recu, remis, annule, impayes };
  }, [orders]);

  const filtered = useMemo(() => {
    const q = normalizeSearchText(search);
    return orders
      .filter((o) => {
        if (campaignFilter !== 'all' && o.vente !== campaignFilter) return false;
        if (statusFilter === 'impayes') {
          if (getOrderLineUnpaidTTC(o) <= 0.01) return false;
        } else if (statusFilter !== 'all' && o.statut !== statusFilter) {
          return false;
        }
        if (!q) return true;
        const cat = catalogMap.get(o.catalogId);
        const hay = normalizeSearchText(
          `${o.refCommande} ${o.invoiceNumber ?? ''} ${o.nomClient} ${o.prenomClient} ${o.emailClient} ${o.produitLabel} ${cat?.domaine ?? ''} ${o.trackingNumber ?? ''} ${o.vente}`
        );
        return hay.includes(q);
      })
      .sort((a, b) => b.date.localeCompare(a.date) || b.refCommande.localeCompare(a.refCommande));
  }, [orders, search, statusFilter, campaignFilter, catalogMap]);

  const exportCsv = () => {
    const headers = [
      'Date',
      'RefCommande',
      'Facture',
      'Campagne',
      'Client',
      'Email',
      'Domaine',
      'Cuvee',
      'Qte',
      'QteRemise',
      'PU_TTC',
      'Port_TTC',
      'Total_TTC',
      'StatutLogistique',
      'StatutPaiement',
      'ModePaiement',
      'ModeLivraison',
      'Transporteur',
      'Tracking',
    ];
    const rows = filtered.map((o) => {
      const cat = catalogMap.get(o.catalogId);
      const paySt = getEffectiveOrderPaymentStatus(o);
      return [
        o.date,
        o.refCommande,
        o.invoiceNumber ?? '',
        o.vente,
        maskClientName(o.prenomClient, o.nomClient, settings.anonymizeClients),
        maskEmail(o.emailClient, settings.anonymizeClients),
        cat?.domaine ?? '',
        o.produitLabel,
        o.qte,
        o.qteRemise ?? (o.statut === 'remis_client' ? o.qte : 0),
        o.prixUnitaireTTC.toFixed(2),
        (o.shippingFeeClientTTC ?? 0).toFixed(2),
        (o.prixUnitaireTTC * o.qte + (o.shippingFeeClientTTC ?? 0)).toFixed(2),
        o.statut,
        paySt,
        o.paymentMethod ?? '',
        o.deliveryMode ?? 'remise_main',
        o.carrier ?? '',
        o.trackingNumber ?? '',
      ]
        .map((v) => `"${String(v).replace(/"/g, '""')}"`)
        .join(';');
    });
    const csv = '\uFEFF' + [headers.join(';'), ...rows].join('\n');
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `lbg_commandes_${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const quickMarkPaid = async (o: OrderLine) => {
    await onUpdateOrder({
      ...o,
      paymentStatus: 'paye',
      paidAt: new Date().toISOString().slice(0, 10),
      amountPaidTTC: undefined,
    });
  };

  const deliverySlipOrders = useMemo(() => {
    if (!deliverySlipRef) return [];
    return orders.filter(
      (o) => o.refCommande === deliverySlipRef && o.statut !== 'annule'
    );
  }, [deliverySlipRef, orders]);

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-4 no-print">
        <div>
          <h1 className="font-serif text-3xl font-semibold text-[#18181B]">
            Commandes &amp; Expéditions
          </h1>
          <p className="text-sm text-[#6B6A65] mt-1">
            Suivi des ventes, paiements clients, livraisons partielles, tracking colis et bons de livraison.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <button
            onClick={exportCsv}
            className="px-3 py-2 rounded-lg border border-[#E5E4DF] bg-white hover:bg-[#FAF9F6] text-xs font-medium flex items-center gap-1.5 cursor-pointer"
          >
            <Download className="w-3.5 h-3.5" />
            Export CSV
          </button>
          <button
            onClick={onOpenImportHelloAsso}
            className="px-3 py-2 rounded-lg border border-[#E5E4DF] bg-white hover:bg-[#FAF9F6] text-xs font-medium flex items-center gap-1.5 cursor-pointer"
          >
            <Upload className="w-3.5 h-3.5" />
            Import HelloAsso
          </button>
          <button
            onClick={onOpenNewDirectOrder}
            className="px-3.5 py-2 rounded-lg bg-[#721C24] hover:bg-[#5E161D] text-white text-xs font-medium flex items-center gap-1.5 cursor-pointer"
          >
            <Plus className="w-3.5 h-3.5" />
            Nouvelle commande
          </button>
        </div>
      </div>

      {/* Filters */}
      <div className="bg-white border border-[#E5E4DF] rounded-xl p-4 space-y-3 no-print">
        <div className="flex flex-wrap items-center gap-2 border-b border-[#E5E4DF] pb-3 text-xs">
          {(
            [
              ['all', `Toutes (${orders.length})`],
              ['attente_reception', `Attente domaine (${counts.attente})`],
              ['recu_lbg', `Prêtes LBG (${counts.recu})`],
              ['remis_client', `Remises (${counts.remis})`],
              ['impayes', `Impayés (${counts.impayes})`],
              ['annule', `Annulées (${counts.annule})`],
            ] as const
          ).map(([id, label]) => (
            <button
              key={id}
              onClick={() => setStatusFilter(id)}
              className={`px-3 py-1.5 rounded-lg font-medium transition-colors cursor-pointer ${
                statusFilter === id
                  ? id === 'impayes'
                    ? 'bg-[#B45309] text-white'
                    : 'bg-[#721C24] text-white'
                  : 'text-[#6B6A65] hover:bg-[#F6F6F4]'
              }`}
            >
              {label}
            </button>
          ))}
        </div>

        <div className="flex flex-col sm:flex-row gap-3">
          <div className="relative flex-1">
            <Search className="w-4 h-4 text-[#6B6A65] absolute left-3 top-1/2 -translate-y-1/2" />
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Client, cuvée, réf. commande, facture, n° de suivi…"
              className="w-full pl-9 pr-3 py-2 text-sm border border-[#E5E4DF] rounded-lg focus:outline-none focus:border-[#721C24]"
            />
          </div>
          <select
            value={campaignFilter}
            onChange={(e) => setCampaignFilter(e.target.value)}
            className="px-3 py-2 text-sm border border-[#E5E4DF] rounded-lg bg-white"
          >
            <option value="all">Toutes les campagnes ({campaigns.length})</option>
            {campaigns.map((c) => (
              <option key={c} value={c}>
                {c}
              </option>
            ))}
          </select>
          {campaignFilter !== 'all' && (
            <button
              onClick={() => onMarkCampaignDelivered(campaignFilter)}
              className="px-3 py-2 rounded-lg border border-[#15803D] text-[#15803D] hover:bg-[#F0FDF4] text-xs font-medium flex items-center gap-1.5 whitespace-nowrap cursor-pointer"
            >
              <CheckCircle2 className="w-3.5 h-3.5" />
              Tout marquer remis
            </button>
          )}
        </div>
      </div>

      {/* Table */}
      <div className="bg-white border border-[#E5E4DF] rounded-xl overflow-hidden no-print">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-[#F6F6F4] text-xs text-[#6B6A65] uppercase">
              <tr>
                <th className="text-left py-2.5 px-4 font-medium">Date · Réf</th>
                <th className="text-left py-2.5 px-3 font-medium">Client</th>
                <th className="text-left py-2.5 px-3 font-medium">Cuvée · Campagne</th>
                <th className="text-right py-2.5 px-2 font-medium">Qté</th>
                <th className="text-right py-2.5 px-3 font-medium">Total TTC</th>
                <th className="text-left py-2.5 px-3 font-medium">Paiement</th>
                <th className="text-left py-2.5 px-3 font-medium">Livraison &amp; Statut</th>
                <th className="text-right py-2.5 px-4 font-medium">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[#E5E4DF]">
              {filtered.map((o) => {
                const cat = catalogMap.get(o.catalogId);
                const payStatus = getEffectiveOrderPaymentStatus(o);
                const payMeta = PAYMENT_META[payStatus];
                const unpaid = getOrderLineUnpaidTTC(o);
                const totalTTC =
                  o.prixUnitaireTTC * o.qte + (o.shippingFeeClientTTC ?? 0);
                const partialRemis =
                  o.statut !== 'remis_client' && (o.qteRemise ?? 0) > 0;

                return (
                  <tr key={o.id} className="hover:bg-[#FAF9F6]">
                    <td className="py-2.5 px-4 whitespace-nowrap">
                      <div className="font-mono text-xs text-[#18181B] flex items-center gap-1">
                        {o.refCommande}
                        {o.locked && (
                          <span title={`Verrouillé par facture ${o.invoiceNumber ?? ''}`}>
                            <Lock className="w-3 h-3 text-[#721C24]" />
                          </span>
                        )}
                      </div>
                      <div className="text-[11px] text-[#6B6A65]">
                        {formatDateFR(o.date)}
                        {o.invoiceNumber ? ` · ${o.invoiceNumber}` : ''}
                      </div>
                    </td>

                    <td className="py-2.5 px-3">
                      <div className="font-medium text-[#18181B]">
                        {maskClientName(
                          o.prenomClient,
                          o.nomClient,
                          settings.anonymizeClients
                        )}
                      </div>
                      <div className="text-[11px] text-[#6B6A65] truncate max-w-[180px]">
                        {o.emailClient
                          ? maskEmail(o.emailClient, settings.anonymizeClients)
                          : o.source}
                      </div>
                    </td>

                    <td className="py-2.5 px-3">
                      <div className="text-[#18181B]">{o.produitLabel}</div>
                      <div className="text-[11px] text-[#6B6A65]">
                        {cat?.domaine ? `${cat.domaine} · ` : ''}
                        {o.vente}
                      </div>
                    </td>

                    <td className="py-2.5 px-2 text-right font-mono tabular-nums">
                      <div>{o.qte}</div>
                      {partialRemis && (
                        <div className="text-[10px] text-[#B45309]">
                          {o.qteRemise}/{o.qte} rem.
                        </div>
                      )}
                    </td>

                    <td className="py-2.5 px-3 text-right font-mono tabular-nums whitespace-nowrap">
                      <div className="font-medium text-[#18181B]">
                        {formatEUR(totalTTC)}
                      </div>
                      {(o.shippingFeeClientTTC ?? 0) > 0 && (
                        <div className="text-[10px] text-[#6B6A65]">
                          dont port {formatEUR(o.shippingFeeClientTTC ?? 0)}
                        </div>
                      )}
                    </td>

                    <td className="py-2.5 px-3 whitespace-nowrap">
                      <div className={`text-xs font-medium ${payMeta.color}`}>
                        {payMeta.label}
                      </div>
                      {unpaid > 0.01 ? (
                        <button
                          onClick={() => quickMarkPaid(o)}
                          className="text-[11px] text-[#721C24] hover:underline flex items-center gap-1 mt-0.5 cursor-pointer"
                        >
                          <Wallet className="w-3 h-3" />
                          Marquer payé
                        </button>
                      ) : (
                        <div className="text-[11px] text-[#6B6A65]">
                          {o.paymentMethod ?? o.source}
                        </div>
                      )}
                    </td>

                    <td className="py-2.5 px-3 whitespace-nowrap">
                      <select
                        value={o.statut}
                        onChange={(e) => {
                          const nextStatut = e.target.value as OrderStatus;
                          onUpdateOrder({
                            ...o,
                            statut: nextStatut,
                            qteRemise:
                              nextStatut === 'remis_client' ? o.qte : o.qteRemise,
                          });
                        }}
                        className={`text-xs border border-[#E5E4DF] rounded px-2 py-1 bg-white font-medium ${ORDER_STATUS_META[o.statut].color}`}
                      >
                        <option value="attente_reception">Attente domaine</option>
                        <option value="recu_lbg">Prêt LBG</option>
                        <option value="remis_client">Remis client</option>
                        <option value="annule">Annulé</option>
                      </select>
                      <div className="text-[11px] text-[#6B6A65] mt-0.5 flex items-center gap-1">
                        <Truck className="w-3 h-3" />
                        {DELIVERY_LABEL[o.deliveryMode ?? 'remise_main']}
                        {o.trackingNumber ? ` · ${o.trackingNumber}` : ''}
                      </div>
                    </td>

                    <td className="py-2.5 px-4 text-right whitespace-nowrap">
                      <button
                        onClick={() => setDeliverySlipRef(o.refCommande)}
                        title="Bon de livraison (BL) sans prix"
                        className="p-1.5 text-[#6B6A65] hover:text-[#18181B] cursor-pointer"
                      >
                        <Printer className="w-3.5 h-3.5" />
                      </button>
                      <button
                        onClick={() => setEditingOrder({ ...o })}
                        title="Éditer paiement, expédition, remise partielle"
                        className="p-1.5 text-[#6B6A65] hover:text-[#721C24] cursor-pointer"
                      >
                        <Edit3 className="w-3.5 h-3.5" />
                      </button>
                      {!o.locked && (
                        <button
                          onClick={() => onDeleteOrder(o.id)}
                          title="Supprimer la ligne"
                          className="p-1.5 text-[#6B6A65] hover:text-[#B91C1C] cursor-pointer"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      )}
                    </td>
                  </tr>
                );
              })}
              {filtered.length === 0 && (
                <tr>
                  <td colSpan={8} className="py-10 text-center text-xs text-[#6B6A65]">
                    Aucune commande ne correspond à ces filtres.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Edit Order Modal (Payment, Shipping, Partial Delivery) */}
      {editingOrder && (
        <div className="fixed inset-0 bg-black/45 z-50 flex items-center justify-center p-4 no-print">
          <form
            onSubmit={async (e) => {
              e.preventDefault();
              await onUpdateOrder(editingOrder);
              setEditingOrder(null);
            }}
            className="bg-white border border-[#E5E4DF] rounded-xl w-full max-w-lg max-h-[90vh] overflow-y-auto p-6 space-y-4 text-sm"
          >
            <div className="flex items-center justify-between pb-3 border-b border-[#E5E4DF]">
              <div>
                <h3 className="font-serif text-xl font-semibold">
                  Commande {editingOrder.refCommande}
                </h3>
                <p className="text-xs text-[#6B6A65]">
                  {editingOrder.produitLabel} · {editingOrder.prenomClient}{' '}
                  {editingOrder.nomClient}
                </p>
              </div>
              <button
                type="button"
                onClick={() => setEditingOrder(null)}
                className="p-1 text-[#6B6A65] cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {editingOrder.locked && (
              <div className="p-3 rounded-lg bg-[#FDF8F8] border border-[#E5E4DF] text-xs text-[#721C24] flex items-center gap-2">
                <Lock className="w-4 h-4 shrink-0" />
                Ligne verrouillée par la facture{' '}
                <strong className="font-mono">{editingOrder.invoiceNumber}</strong>.
                Les montants et quantités sont figés (émettez un avoir en Comptabilité pour rectifier). Le suivi paiement et livraison reste modifiable.
              </div>
            )}

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-medium text-[#6B6A65] mb-1">
                  Quantité commandée
                </label>
                <input
                  type="number"
                  min="1"
                  disabled={editingOrder.locked}
                  value={editingOrder.qte}
                  onChange={(e) =>
                    setEditingOrder({
                      ...editingOrder,
                      qte: Math.max(1, Math.round(Number(e.target.value) || 1)),
                    })
                  }
                  className="w-full px-3 py-2 border border-[#E5E4DF] rounded-lg font-mono disabled:bg-[#F6F6F4]"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-[#6B6A65] mb-1">
                  Prix unitaire TTC (€)
                </label>
                <input
                  type="number"
                  min="0"
                  step="0.1"
                  disabled={editingOrder.locked}
                  value={editingOrder.prixUnitaireTTC}
                  onChange={(e) =>
                    setEditingOrder({
                      ...editingOrder,
                      prixUnitaireTTC: Math.max(0, Number(e.target.value) || 0),
                    })
                  }
                  className="w-full px-3 py-2 border border-[#E5E4DF] rounded-lg font-mono disabled:bg-[#F6F6F4]"
                />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3 pt-2 border-t border-[#E5E4DF]">
              <div>
                <label className="block text-xs font-medium text-[#6B6A65] mb-1">
                  Statut paiement
                </label>
                <select
                  value={getEffectiveOrderPaymentStatus(editingOrder)}
                  onChange={(e) =>
                    setEditingOrder({
                      ...editingOrder,
                      paymentStatus: e.target.value as PaymentStatus,
                      paidAt:
                        e.target.value === 'paye'
                          ? editingOrder.paidAt ?? new Date().toISOString().slice(0, 10)
                          : editingOrder.paidAt,
                    })
                  }
                  className="w-full px-3 py-2 border border-[#E5E4DF] rounded-lg bg-white"
                >
                  <option value="en_attente">À encaisser</option>
                  <option value="partiel">Acompte / Partiel</option>
                  <option value="paye">Payé</option>
                  <option value="rembourse">Remboursé</option>
                </select>
              </div>
              <div>
                <label className="block text-xs font-medium text-[#6B6A65] mb-1">
                  Mode de règlement
                </label>
                <select
                  value={editingOrder.paymentMethod ?? 'virement'}
                  onChange={(e) =>
                    setEditingOrder({
                      ...editingOrder,
                      paymentMethod: e.target.value as PaymentMethod,
                    })
                  }
                  className="w-full px-3 py-2 border border-[#E5E4DF] rounded-lg bg-white"
                >
                  <option value="helloasso">HelloAsso</option>
                  <option value="virement">Virement</option>
                  <option value="cb">Carte bancaire</option>
                  <option value="especes">Espèces</option>
                  <option value="cheque">Chèque</option>
                  <option value="autre">Autre</option>
                </select>
              </div>
              {editingOrder.paymentStatus === 'partiel' && (
                <div className="col-span-2">
                  <label className="block text-xs font-medium text-[#6B6A65] mb-1">
                    Montant déjà encaissé TTC (€)
                  </label>
                  <input
                    type="number"
                    min="0"
                    step="0.5"
                    value={editingOrder.amountPaidTTC ?? 0}
                    onChange={(e) =>
                      setEditingOrder({
                        ...editingOrder,
                        amountPaidTTC: Math.max(0, Number(e.target.value) || 0),
                      })
                    }
                    className="w-full px-3 py-2 border border-[#E5E4DF] rounded-lg font-mono"
                  />
                </div>
              )}
            </div>

            <div className="grid grid-cols-2 gap-3 pt-2 border-t border-[#E5E4DF]">
              <div>
                <label className="block text-xs font-medium text-[#6B6A65] mb-1">
                  Mode de livraison
                </label>
                <select
                  value={editingOrder.deliveryMode ?? 'remise_main'}
                  onChange={(e) =>
                    setEditingOrder({
                      ...editingOrder,
                      deliveryMode: e.target.value as DeliveryMode,
                    })
                  }
                  className="w-full px-3 py-2 border border-[#E5E4DF] rounded-lg bg-white"
                >
                  <option value="remise_main">Remise en main propre</option>
                  <option value="expedition">Expédition transporteur</option>
                  <option value="garde_cave">Garde en cave LBG</option>
                </select>
              </div>
              <div>
                <label className="block text-xs font-medium text-[#6B6A65] mb-1">
                  Qté déjà remise (partielle)
                </label>
                <input
                  type="number"
                  min="0"
                  max={editingOrder.qte}
                  value={editingOrder.qteRemise ?? 0}
                  onChange={(e) => {
                    const rem = Math.min(
                      editingOrder.qte,
                      Math.max(0, Math.round(Number(e.target.value) || 0))
                    );
                    setEditingOrder({
                      ...editingOrder,
                      qteRemise: rem,
                      statut:
                        rem >= editingOrder.qte ? 'remis_client' : editingOrder.statut,
                    });
                  }}
                  className="w-full px-3 py-2 border border-[#E5E4DF] rounded-lg font-mono"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-[#6B6A65] mb-1">
                  Transporteur
                </label>
                <input
                  value={editingOrder.carrier ?? ''}
                  onChange={(e) =>
                    setEditingOrder({
                      ...editingOrder,
                      carrier: e.target.value || undefined,
                    })
                  }
                  placeholder="Chronopost, Colissimo, Geodis…"
                  className="w-full px-3 py-2 border border-[#E5E4DF] rounded-lg"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-[#6B6A65] mb-1">
                  Numéro de suivi (tracking)
                </label>
                <input
                  value={editingOrder.trackingNumber ?? ''}
                  onChange={(e) =>
                    setEditingOrder({
                      ...editingOrder,
                      trackingNumber: e.target.value || undefined,
                    })
                  }
                  className="w-full px-3 py-2 border border-[#E5E4DF] rounded-lg font-mono text-xs"
                />
              </div>
              <div className="col-span-2">
                <label className="block text-xs font-medium text-[#6B6A65] mb-1">
                  Adresse de livraison
                </label>
                <input
                  value={editingOrder.deliveryAddress ?? ''}
                  onChange={(e) =>
                    setEditingOrder({
                      ...editingOrder,
                      deliveryAddress: e.target.value || undefined,
                    })
                  }
                  className="w-full px-3 py-2 border border-[#E5E4DF] rounded-lg"
                />
              </div>
              <div className="col-span-2">
                <label className="block text-xs font-medium text-[#6B6A65] mb-1">
                  Notes
                </label>
                <input
                  value={editingOrder.notes ?? ''}
                  onChange={(e) =>
                    setEditingOrder({
                      ...editingOrder,
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
                onClick={() => setEditingOrder(null)}
                className="px-4 py-2 rounded-lg border border-[#E5E4DF] cursor-pointer"
              >
                Annuler
              </button>
              <button
                type="submit"
                className="px-4 py-2 rounded-lg bg-[#721C24] text-white font-medium cursor-pointer"
              >
                Enregistrer
              </button>
            </div>
          </form>
        </div>
      )}

      {/* Printable Delivery Slip (Bon de livraison — strictly no prices or margins) */}
      {deliverySlipRef && deliverySlipOrders.length > 0 && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4 overflow-y-auto">
          <div className="bg-white rounded-xl w-full max-w-2xl overflow-hidden shadow-xl">
            <div className="p-4 border-b border-[#E5E4DF] flex items-center justify-between bg-[#FAF9F6] no-print">
              <span className="font-mono text-sm font-semibold">
                Bon de livraison · Commande {deliverySlipRef}
              </span>
              <div className="flex items-center gap-2">
                <button
                  onClick={() => window.print()}
                  className="px-3 py-1.5 rounded-lg bg-[#721C24] text-white text-xs font-medium flex items-center gap-1.5 cursor-pointer"
                >
                  <Printer className="w-3.5 h-3.5" />
                  Imprimer le BL
                </button>
                <button
                  onClick={() => setDeliverySlipRef(null)}
                  className="p-1.5 text-[#6B6A65] cursor-pointer"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>
            </div>

            <div className="p-8 space-y-6 text-[#18181B]">
              <div className="flex justify-between items-start border-b border-[#E5E4DF] pb-4">
                <div>
                  <h2 className="font-serif text-2xl font-semibold text-[#721C24]">
                    {settings.companyName || "Le Bon Grain d'Ivresse"}
                  </h2>
                  <p className="text-xs text-[#6B6A65] mt-1">
                    {settings.companyAddress}
                    {settings.companyPhone ? ` · ${settings.companyPhone}` : ''}
                  </p>
                </div>
                <div className="text-right">
                  <div className="text-xs uppercase tracking-wider text-[#6B6A65]">
                    Bon de livraison
                  </div>
                  <div className="font-mono text-lg font-bold">
                    BL-{deliverySlipRef}
                  </div>
                  <div className="text-xs text-[#6B6A65]">
                    Date : {formatDateFR(deliverySlipOrders[0].date)}
                  </div>
                </div>
              </div>

              <div className="bg-[#FAF9F6] border border-[#E5E4DF] rounded-lg p-4 text-sm">
                <div className="text-xs uppercase tracking-wider text-[#6B6A65]">
                  Destinataire
                </div>
                <div className="font-semibold mt-0.5">
                  {deliverySlipOrders[0].prenomClient}{' '}
                  {deliverySlipOrders[0].nomClient}
                </div>
                {deliverySlipOrders[0].deliveryAddress && (
                  <div className="text-xs text-[#6B6A65] mt-0.5">
                    {deliverySlipOrders[0].deliveryAddress}
                  </div>
                )}
                {deliverySlipOrders[0].carrier && (
                  <div className="text-xs text-[#6B6A65] mt-1">
                    Transporteur : {deliverySlipOrders[0].carrier}
                    {deliverySlipOrders[0].trackingNumber
                      ? ` · Suivi : ${deliverySlipOrders[0].trackingNumber}`
                      : ''}
                  </div>
                )}
              </div>

              <table className="w-full text-sm border-collapse">
                <thead>
                  <tr className="border-b-2 border-[#18181B] text-xs uppercase text-[#6B6A65]">
                    <th className="text-left py-2">Domaine &amp; Cuvée</th>
                    <th className="text-right py-2">Qté commandée</th>
                    <th className="text-right py-2">Contrôle colis</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[#E5E4DF]">
                  {deliverySlipOrders.map((line) => {
                    const cat = catalogMap.get(line.catalogId);
                    return (
                      <tr key={line.id}>
                        <td className="py-2.5">
                          <div className="font-medium">{line.produitLabel}</div>
                          {cat && (
                            <div className="text-xs text-[#6B6A65]">
                              {[cat.domaine, cat.millesime, cat.format || '75 cl']
                                .filter(Boolean)
                                .join(' · ')}
                            </div>
                          )}
                        </td>
                        <td className="py-2.5 text-right font-mono font-semibold">
                          {line.qte} btl
                        </td>
                        <td className="py-2.5 text-right text-xs text-[#6B6A65]">
                          [ &nbsp; ] Vérifié
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>

              <div className="flex justify-between items-end pt-6 border-t border-[#E5E4DF] text-xs text-[#6B6A65]">
                <div>
                  Total colis :{' '}
                  <strong className="font-mono text-[#18181B]">
                    {deliverySlipOrders.reduce((s, o) => s + o.qte, 0)} bouteilles
                  </strong>
                </div>
                <div className="w-56 border-t border-[#18181B] pt-1 text-center">
                  Date &amp; signature réception client
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
