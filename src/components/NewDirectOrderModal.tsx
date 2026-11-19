import React, { useMemo, useState } from 'react';
import { X, Plus, Trash2, ShoppingBag, Wine } from 'lucide-react';
import {
  AppSettings,
  CustomerSummary,
  DeliveryMode,
  OrderLine,
  OrderSource,
  OrderStatus,
  PaymentMethod,
  PaymentStatus,
  StockSummaryRow,
  WineCatalogItem,
} from '../types/wine';
import { formatEUR, getLogisticsCostHT } from '../utils/wineMath';

interface NewDirectOrderModalProps {
  catalog: WineCatalogItem[];
  stockRows: StockSummaryRow[];
  customers: CustomerSummary[];
  settings: AppSettings;
  onClose: () => void;
  onAddOrders: (orders: OrderLine[]) => Promise<void> | void;
}

interface DraftLine {
  key: string;
  catalogId: string;
  qte: number;
  prixUnitaireTTC: number;
}

export const NewDirectOrderModal: React.FC<NewDirectOrderModalProps> = ({
  catalog,
  stockRows,
  customers,
  settings,
  onClose,
  onAddOrders,
}) => {
  const defaultWine = catalog[0];
  const [source, setSource] = useState<OrderSource>('direct');
  const [selectedCustomerKey, setSelectedCustomerKey] = useState<string>('');
  const [prenomClient, setPrenomClient] = useState('');
  const [nomClient, setNomClient] = useState('');
  const [emailClient, setEmailClient] = useState('');
  const [vente, setVente] = useState('Vente directe cave');
  const [date, setDate] = useState(new Date().toISOString().slice(0, 10));
  const [statut, setStatut] = useState<OrderStatus>('recu_lbg');

  // Payment & delivery
  const [paymentStatus, setPaymentStatus] = useState<PaymentStatus>('en_attente');
  const [paymentMethod, setPaymentMethod] = useState<PaymentMethod>('virement');
  const [amountPaidTTC, setAmountPaidTTC] = useState<string>('');
  const [deliveryMode, setDeliveryMode] = useState<DeliveryMode>('remise_main');
  const [shippingFeeTTC, setShippingFeeTTC] = useState<number>(0);
  const [deliveryAddress, setDeliveryAddress] = useState('');
  const [notes, setNotes] = useState('');

  // Multi-line items
  const [lines, setLines] = useState<DraftLine[]>(() => [
    {
      key: `line_${Date.now()}`,
      catalogId: defaultWine?.id ?? '',
      qte: 1,
      prixUnitaireTTC: defaultWine?.prixLbgTTC ?? 0,
    },
  ]);

  const [submitting, setSubmitting] = useState(false);

  const catalogMap = useMemo(
    () => new Map(catalog.map((c) => [c.id, c])),
    [catalog]
  );
  const stockMap = useMemo(
    () => new Map(stockRows.map((r) => [r.catalog.id, r])),
    [stockRows]
  );

  const handleSelectCustomer = (key: string) => {
    setSelectedCustomerKey(key);
    const c = customers.find((x) => x.key === key);
    if (c) {
      setNomClient(c.nom);
      setPrenomClient(c.prenom);
      setEmailClient(c.email);
      setDeliveryAddress(c.shippingAddress || c.billingAddress || '');
    }
  };

  const handleSourceChange = (nextSource: OrderSource) => {
    setSource(nextSource);
    if (nextSource === 'perso') {
      setNomClient('Dégustation');
      setPrenomClient('Cave LBG');
      setEmailClient('');
      setVente('Prélèvement cave perso');
      setStatut('remis_client');
      setPaymentStatus('paye');
      setShippingFeeTTC(0);
      setLines((prev) => prev.map((l) => ({ ...l, prixUnitaireTTC: 0 })));
    } else {
      setLines((prev) =>
        prev.map((l) => {
          const item = catalogMap.get(l.catalogId);
          return {
            ...l,
            prixUnitaireTTC:
              l.prixUnitaireTTC === 0 ? (item?.prixLbgTTC ?? 0) : l.prixUnitaireTTC,
          };
        })
      );
    }
  };

  const addLine = () => {
    const nextWine =
      catalog.find((c) => !lines.some((l) => l.catalogId === c.id)) ?? catalog[0];
    if (!nextWine) return;
    setLines((prev) => [
      ...prev,
      {
        key: `line_${Date.now()}_${prev.length}`,
        catalogId: nextWine.id,
        qte: 1,
        prixUnitaireTTC: source === 'perso' ? 0 : nextWine.prixLbgTTC,
      },
    ]);
  };

  const removeLine = (key: string) => {
    setLines((prev) => (prev.length <= 1 ? prev : prev.filter((l) => l.key !== key)));
  };

  const updateLine = (key: string, patch: Partial<DraftLine>) => {
    setLines((prev) =>
      prev.map((l) => {
        if (l.key !== key) return l;
        const merged = { ...l, ...patch };
        if (patch.catalogId && patch.catalogId !== l.catalogId) {
          const item = catalogMap.get(patch.catalogId);
          merged.prixUnitaireTTC = source === 'perso' ? 0 : (item?.prixLbgTTC ?? 0);
        }
        return merged;
      })
    );
  };

  const totals = useMemo(() => {
    let totalBottles = 0;
    let totalWinesTTC = 0;
    for (const l of lines) {
      totalBottles += l.qte;
      totalWinesTTC += l.prixUnitaireTTC * l.qte;
    }
    const grandTotalTTC = totalWinesTTC + (source === 'perso' ? 0 : shippingFeeTTC);
    return { totalBottles, totalWinesTTC, grandTotalTTC };
  }, [lines, shippingFeeTTC, source]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!nomClient.trim() || lines.length === 0) return;

    setSubmitting(true);
    try {
      const ts = Date.now();
      const refCommande = `${source === 'perso' ? 'PERSO' : 'DIR'}-${String(ts).slice(-6)}`;
      const selectedCustomer = customers.find((c) => c.key === selectedCustomerKey);
      const tvaPct = Math.round(settings.tvaRate * 100);
      const paidDate = paymentStatus === 'paye' ? date : undefined;

      const created: OrderLine[] = lines
        .filter((l) => l.catalogId && l.qte >= 1)
        .map((l, index) => {
          const item = catalogMap.get(l.catalogId);
          const stock = stockMap.get(l.catalogId);
          const buyHT = stock?.coutMoyenPondereHT ?? item?.tarifAchatHT ?? 0;
          const logHT = item ? getLogisticsCostHT(item, settings) : settings.fraisLogistiqueParBouteille;
          const isFirst = index === 0;
          return {
            id: `ord_${ts}_${index + 1}`,
            date,
            refCommande,
            vente: vente.trim() || 'Vente directe',
            customerId: selectedCustomer?.profileId,
            nomClient: nomClient.trim(),
            prenomClient: prenomClient.trim(),
            emailClient: emailClient.trim().toLowerCase(),
            catalogId: l.catalogId,
            produitLabel: item ? `${item.domaine} — ${item.cuvee}` : l.catalogId,
            prixUnitaireTTC: source === 'perso' ? 0 : Math.max(0, l.prixUnitaireTTC),
            coutAchatUnitaireHT: Number(buyHT.toFixed(2)),
            coutLogistiqueUnitaireHT: Number(logHT.toFixed(2)),
            tvaRatePct: tvaPct,
            qte: Math.max(1, Math.round(l.qte)),
            qteRemise: statut === 'remis_client' ? Math.max(1, Math.round(l.qte)) : 0,
            statut,
            source,
            paymentStatus,
            paymentMethod: source === 'perso' ? 'autre' : paymentMethod,
            amountPaidTTC:
              isFirst && paymentStatus === 'partiel' && amountPaidTTC
                ? Number(amountPaidTTC)
                : undefined,
            paidAt: paidDate,
            deliveryMode,
            shippingFeeClientTTC:
              isFirst && source !== 'perso' && shippingFeeTTC > 0
                ? shippingFeeTTC
                : undefined,
            deliveryAddress: deliveryAddress.trim() || undefined,
            notes: notes.trim() || undefined,
          };
        });

      await onAddOrders(created);
      onClose();
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/45 z-50 flex items-center justify-center p-4">
      <form
        onSubmit={handleSubmit}
        className="bg-white border border-[#E5E4DF] rounded-xl w-full max-w-3xl max-h-[92vh] flex flex-col overflow-hidden"
      >
        <div className="p-5 border-b border-[#E5E4DF] flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <ShoppingBag className="w-5 h-5 text-[#721C24]" />
            <div>
              <h2 className="font-serif text-xl font-semibold text-[#18181B]">
                Nouvelle commande multi-cuvées
              </h2>
              <p className="text-xs text-[#6B6A65]">
                Toutes les lignes partagent la même référence commande pour une facture unique.
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-1 text-[#6B6A65] hover:text-[#18181B] cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="p-5 overflow-y-auto space-y-5 flex-1 text-sm">
          {/* Source toggle */}
          <div className="flex gap-2">
            {(
              [
                ['direct', 'Vente directe / Club / Pro'],
                ['perso', 'Sortie cave perso / Dégustation (0 €)'],
              ] as const
            ).map(([val, label]) => (
              <button
                key={val}
                type="button"
                onClick={() => handleSourceChange(val)}
                className={`flex-1 py-2 px-3 rounded-lg border text-xs font-medium transition-colors cursor-pointer ${
                  source === val
                    ? 'border-[#721C24] bg-[#FDF8F8] text-[#721C24]'
                    : 'border-[#E5E4DF] text-[#6B6A65] hover:bg-[#F6F6F4]'
                }`}
              >
                {label}
              </button>
            ))}
          </div>

          {/* Client selection */}
          {source !== 'perso' && (
            <div className="space-y-3 bg-[#FAF9F6] border border-[#E5E4DF] rounded-lg p-3.5">
              <div>
                <label className="block text-xs font-medium text-[#6B6A65] mb-1">
                  Sélectionner un client existant (optionnel)
                </label>
                <select
                  value={selectedCustomerKey}
                  onChange={(e) => handleSelectCustomer(e.target.value)}
                  className="w-full px-3 py-2 border border-[#E5E4DF] rounded-lg bg-white text-sm"
                >
                  <option value="">— Saisir un nouveau client —</option>
                  {customers.map((c) => (
                    <option key={c.key} value={c.key}>
                      {c.prenom} {c.nom}
                      {c.companyName ? ` (${c.companyName})` : ''}
                      {c.email ? ` · ${c.email}` : ''}
                    </option>
                  ))}
                </select>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <div>
                  <label className="block text-xs font-medium text-[#6B6A65] mb-1">
                    Prénom
                  </label>
                  <input
                    value={prenomClient}
                    onChange={(e) => setPrenomClient(e.target.value)}
                    className="w-full px-3 py-1.5 border border-[#E5E4DF] rounded-lg bg-white"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-[#6B6A65] mb-1">
                    Nom *
                  </label>
                  <input
                    required
                    value={nomClient}
                    onChange={(e) => setNomClient(e.target.value)}
                    className="w-full px-3 py-1.5 border border-[#E5E4DF] rounded-lg bg-white"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-[#6B6A65] mb-1">
                    Email
                  </label>
                  <input
                    type="email"
                    value={emailClient}
                    onChange={(e) => setEmailClient(e.target.value)}
                    className="w-full px-3 py-1.5 border border-[#E5E4DF] rounded-lg bg-white"
                  />
                </div>
              </div>
            </div>
          )}

          {/* Wine lines */}
          <div className="space-y-2.5">
            <div className="flex items-center justify-between">
              <label className="text-xs font-semibold uppercase tracking-wider text-[#6B6A65] flex items-center gap-1.5">
                <Wine className="w-3.5 h-3.5 text-[#721C24]" />
                Cuvées commandées ({lines.length})
              </label>
              <button
                type="button"
                onClick={addLine}
                className="text-xs font-medium text-[#721C24] hover:underline flex items-center gap-1 cursor-pointer"
              >
                <Plus className="w-3.5 h-3.5" />
                Ajouter une cuvée
              </button>
            </div>

            <div className="space-y-2">
              {lines.map((line) => {
                const st = stockMap.get(line.catalogId);
                return (
                  <div
                    key={line.key}
                    className="grid grid-cols-12 gap-2 items-center p-2.5 rounded-lg border border-[#E5E4DF] bg-white"
                  >
                    <div className="col-span-12 sm:col-span-6">
                      <select
                        value={line.catalogId}
                        onChange={(e) =>
                          updateLine(line.key, { catalogId: e.target.value })
                        }
                        className="w-full px-2.5 py-1.5 border border-[#E5E4DF] rounded text-xs"
                      >
                        {catalog.map((c) => {
                          const s = stockMap.get(c.id);
                          return (
                            <option key={c.id} value={c.id}>
                              {c.domaine} — {c.cuvee} (Dispo:{' '}
                              {s?.disponibleVente ?? 0})
                            </option>
                          );
                        })}
                      </select>
                      {st && (
                        <div className="text-[11px] text-[#6B6A65] mt-0.5 pl-0.5">
                          Cave : {st.physiqueCave} · Dispo vente :{' '}
                          <span
                            className={
                              st.disponibleVente < line.qte
                                ? 'text-[#B45309] font-medium'
                                : 'text-[#15803D]'
                            }
                          >
                            {st.disponibleVente}
                          </span>
                        </div>
                      )}
                    </div>
                    <div className="col-span-4 sm:col-span-2">
                      <label className="block text-[10px] text-[#6B6A65]">Qté</label>
                      <input
                        type="number"
                        min="1"
                        value={line.qte}
                        onChange={(e) =>
                          updateLine(line.key, {
                            qte: Math.max(1, Math.round(Number(e.target.value) || 1)),
                          })
                        }
                        className="w-full px-2 py-1 border border-[#E5E4DF] rounded font-mono text-right text-xs"
                      />
                    </div>
                    <div className="col-span-6 sm:col-span-3">
                      <label className="block text-[10px] text-[#6B6A65]">
                        Prix unit. TTC (€)
                      </label>
                      <input
                        type="number"
                        min="0"
                        step="0.1"
                        disabled={source === 'perso'}
                        value={line.prixUnitaireTTC}
                        onChange={(e) =>
                          updateLine(line.key, {
                            prixUnitaireTTC: Math.max(0, Number(e.target.value) || 0),
                          })
                        }
                        className="w-full px-2 py-1 border border-[#E5E4DF] rounded font-mono text-right text-xs disabled:bg-[#F6F6F4]"
                      />
                    </div>
                    <div className="col-span-2 sm:col-span-1 flex justify-end">
                      <button
                        type="button"
                        onClick={() => removeLine(line.key)}
                        disabled={lines.length <= 1}
                        className="p-1.5 text-[#6B6A65] hover:text-[#B91C1C] disabled:opacity-30 cursor-pointer"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Date, Campaign, Status */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <div>
              <label className="block text-xs font-medium text-[#6B6A65] mb-1">
                Date
              </label>
              <input
                type="date"
                value={date}
                onChange={(e) => setDate(e.target.value)}
                className="w-full px-3 py-2 border border-[#E5E4DF] rounded-lg"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-[#6B6A65] mb-1">
                Campagne / Vente
              </label>
              <input
                value={vente}
                onChange={(e) => setVente(e.target.value)}
                className="w-full px-3 py-2 border border-[#E5E4DF] rounded-lg"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-[#6B6A65] mb-1">
                Statut logistique
              </label>
              <select
                value={statut}
                onChange={(e) => setStatut(e.target.value as OrderStatus)}
                className="w-full px-3 py-2 border border-[#E5E4DF] rounded-lg bg-white"
              >
                <option value="attente_reception">En attente domaine</option>
                <option value="recu_lbg">Prêt à remettre (Reçu LBG)</option>
                <option value="remis_client">Remis au client</option>
              </select>
            </div>
          </div>

          {/* Payment & Shipping */}
          {source !== 'perso' && (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 pt-2 border-t border-[#E5E4DF]">
              <div>
                <label className="block text-xs font-medium text-[#6B6A65] mb-1">
                  Statut paiement
                </label>
                <select
                  value={paymentStatus}
                  onChange={(e) => setPaymentStatus(e.target.value as PaymentStatus)}
                  className="w-full px-3 py-2 border border-[#E5E4DF] rounded-lg bg-white text-xs"
                >
                  <option value="en_attente">En attente de règlement</option>
                  <option value="partiel">Acompte / Partiel</option>
                  <option value="paye">Payé</option>
                </select>
              </div>
              <div>
                <label className="block text-xs font-medium text-[#6B6A65] mb-1">
                  Mode de paiement
                </label>
                <select
                  value={paymentMethod}
                  onChange={(e) => setPaymentMethod(e.target.value as PaymentMethod)}
                  className="w-full px-3 py-2 border border-[#E5E4DF] rounded-lg bg-white text-xs"
                >
                  <option value="virement">Virement</option>
                  <option value="cb">Carte bancaire</option>
                  <option value="helloasso">HelloAsso</option>
                  <option value="especes">Espèces</option>
                  <option value="cheque">Chèque</option>
                  <option value="autre">Autre</option>
                </select>
              </div>
              <div>
                <label className="block text-xs font-medium text-[#6B6A65] mb-1">
                  Mode de livraison
                </label>
                <select
                  value={deliveryMode}
                  onChange={(e) => setDeliveryMode(e.target.value as DeliveryMode)}
                  className="w-full px-3 py-2 border border-[#E5E4DF] rounded-lg bg-white text-xs"
                >
                  <option value="remise_main">Remise en main propre</option>
                  <option value="expedition">Expédition transporteur</option>
                  <option value="garde_cave">Garde en cave LBG</option>
                </select>
              </div>
              <div>
                <label className="block text-xs font-medium text-[#6B6A65] mb-1">
                  Frais de port facturés TTC (€)
                </label>
                <input
                  type="number"
                  min="0"
                  step="1"
                  value={shippingFeeTTC}
                  onChange={(e) =>
                    setShippingFeeTTC(Math.max(0, Number(e.target.value) || 0))
                  }
                  className="w-full px-3 py-2 border border-[#E5E4DF] rounded-lg font-mono text-xs"
                />
              </div>

              {paymentStatus === 'partiel' && (
                <div className="sm:col-span-2">
                  <label className="block text-xs font-medium text-[#6B6A65] mb-1">
                    Montant déjà encaissé TTC (€)
                  </label>
                  <input
                    type="number"
                    min="0"
                    step="0.5"
                    value={amountPaidTTC}
                    onChange={(e) => setAmountPaidTTC(e.target.value)}
                    className="w-full px-3 py-1.5 border border-[#E5E4DF] rounded-lg font-mono text-xs"
                  />
                </div>
              )}

              {deliveryMode === 'expedition' && (
                <div className="sm:col-span-2 lg:col-span-4">
                  <label className="block text-xs font-medium text-[#6B6A65] mb-1">
                    Adresse d’expédition
                  </label>
                  <input
                    value={deliveryAddress}
                    onChange={(e) => setDeliveryAddress(e.target.value)}
                    placeholder="Rue, Code postal, Ville, instructions…"
                    className="w-full px-3 py-1.5 border border-[#E5E4DF] rounded-lg text-xs"
                  />
                </div>
              )}
            </div>
          )}

          <div>
            <label className="block text-xs font-medium text-[#6B6A65] mb-1">
              Notes internes
            </label>
            <input
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Remise club, demande particulière…"
              className="w-full px-3 py-2 border border-[#E5E4DF] rounded-lg text-xs"
            />
          </div>
        </div>

        <div className="p-4 border-t border-[#E5E4DF] bg-[#FAF9F6] flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div className="text-sm">
            Total commande :{' '}
            <strong className="font-mono">{totals.totalBottles} btl</strong> ·{' '}
            <strong className="font-mono text-[#721C24]">
              {formatEUR(totals.grandTotalTTC)} TTC
            </strong>
          </div>
          <div className="flex gap-2">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 rounded-lg border border-[#E5E4DF] bg-white text-sm cursor-pointer"
            >
              Annuler
            </button>
            <button
              type="submit"
              disabled={submitting}
              className="px-4 py-2 rounded-lg bg-[#721C24] hover:bg-[#5E161D] disabled:opacity-50 text-white text-sm font-medium cursor-pointer"
            >
              {submitting ? 'Enregistrement…' : 'Valider la commande'}
            </button>
          </div>
        </div>
      </form>
    </div>
  );
};
