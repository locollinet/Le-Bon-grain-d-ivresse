import React, { useState } from 'react';
import { X, PackagePlus } from 'lucide-react';
import {
  LotPaymentStatus,
  LotStatus,
  LotType,
  SupplierLot,
  WineCatalogItem,
} from '../types/wine';
import { formatEUR } from '../utils/wineMath';

interface NewSupplierLotModalProps {
  catalog: WineCatalogItem[];
  initialLot?: SupplierLot | null;
  onClose: () => void;
  onSaveLot: (lot: SupplierLot) => Promise<void> | void;
}

export const NewSupplierLotModal: React.FC<NewSupplierLotModalProps> = ({
  catalog,
  initialLot,
  onClose,
  onSaveLot,
}) => {
  const defaultWine =
    catalog.find((c) => c.id === initialLot?.catalogId) ?? catalog[0];

  const [catalogId, setCatalogId] = useState(
    initialLot?.catalogId ?? defaultWine?.id ?? ''
  );
  const [dateAchat, setDateAchat] = useState(
    initialLot?.dateAchat ?? new Date().toISOString().slice(0, 10)
  );
  const [typeAchat, setTypeAchat] = useState<LotType>(
    initialLot?.typeAchat ?? 'avance'
  );
  const [statutLot, setStatutLot] = useState<LotStatus>(
    initialLot?.statutLot ?? 'commande_payee'
  );
  const [qteCommandee, setQteCommandee] = useState(
    initialLot?.qteCommandee ?? 6
  );
  const [qteRecue, setQteRecue] = useState(initialLot?.qteRecue ?? 0);
  const [coutUnitaireHT, setCoutUnitaireHT] = useState(
    initialLot?.coutUnitaireHT ?? defaultWine?.tarifAchatHT ?? 0
  );
  const [shippingHT, setShippingHT] = useState(initialLot?.shippingHT ?? 0);
  const [tvaRatePct, setTvaRatePct] = useState(initialLot?.tvaRatePct ?? 20);
  const [referenceFacture, setReferenceFacture] = useState(
    initialLot?.referenceFacture ?? ''
  );
  const [paymentStatus, setPaymentStatus] = useState<LotPaymentStatus>(
    initialLot?.paymentStatus ?? 'non_paye'
  );
  const [paymentDueDate, setPaymentDueDate] = useState(
    initialLot?.paymentDueDate ?? ''
  );
  const [notes, setNotes] = useState(initialLot?.notes ?? '');
  const [saving, setSaving] = useState(false);

  const handleWineChange = (id: string) => {
    setCatalogId(id);
    const wine = catalog.find((c) => c.id === id);
    if (wine && !initialLot) {
      setCoutUnitaireHT(wine.tarifAchatHT);
    }
  };

  const handleStatusChange = (next: LotStatus) => {
    setStatutLot(next);
    if (next === 'recu_cave' && qteRecue === 0) {
      setQteRecue(qteCommandee);
    }
  };

  const totalHT = qteCommandee * coutUnitaireHT + shippingHT;
  const totalTTC = totalHT * (1 + tvaRatePct / 100);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!catalogId) return;
    setSaving(true);
    try {
      const lot: SupplierLot = {
        id: initialLot?.id ?? `lot_${Date.now()}`,
        catalogId,
        domaineId: initialLot?.domaineId,
        purchaseOrderId: initialLot?.purchaseOrderId,
        dateAchat,
        typeAchat,
        qteCommandee: Math.max(1, Math.round(qteCommandee)),
        qteRecue:
          statutLot === 'recu_cave'
            ? Math.max(qteRecue, qteCommandee)
            : Math.min(Math.max(0, Math.round(qteRecue)), qteCommandee),
        coutUnitaireHT: Math.max(0, coutUnitaireHT),
        tvaRatePct,
        shippingHT: shippingHT > 0 ? shippingHT : undefined,
        statutLot,
        referenceFacture: referenceFacture.trim() || `LOT-${dateAchat}`,
        paymentStatus,
        paymentDueDate: paymentDueDate || undefined,
        paidAt:
          paymentStatus === 'paye'
            ? initialLot?.paidAt ?? new Date().toISOString().slice(0, 10)
            : undefined,
        origin: initialLot?.origin ?? 'manual',
        notes: notes.trim() || undefined,
      };
      await onSaveLot(lot);
      onClose();
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/45 z-50 flex items-center justify-center p-4">
      <form
        onSubmit={handleSubmit}
        className="bg-white border border-[#E5E4DF] rounded-xl w-full max-w-xl max-h-[92vh] overflow-y-auto p-6 space-y-4 text-sm"
      >
        <div className="flex items-center justify-between pb-3 border-b border-[#E5E4DF]">
          <div className="flex items-center gap-2">
            <PackagePlus className="w-5 h-5 text-[#721C24]" />
            <h2 className="font-serif text-xl font-semibold">
              {initialLot ? 'Modifier le lot fournisseur' : 'Nouveau lot fournisseur'}
            </h2>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-1 text-[#6B6A65] hover:text-[#18181B] cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <div>
          <label className="block text-xs font-medium text-[#6B6A65] mb-1">
            Cuvée du catalogue *
          </label>
          <select
            value={catalogId}
            onChange={(e) => handleWineChange(e.target.value)}
            className="w-full px-3 py-2 border border-[#E5E4DF] rounded-lg bg-white"
          >
            {catalog.map((c) => (
              <option key={c.id} value={c.id}>
                {c.domaine} — {c.cuvee} ({formatEUR(c.tarifAchatHT)} HT)
              </option>
            ))}
          </select>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          <div>
            <label className="block text-xs font-medium text-[#6B6A65] mb-1">
              Date d’achat
            </label>
            <input
              type="date"
              value={dateAchat}
              onChange={(e) => setDateAchat(e.target.value)}
              className="w-full px-3 py-2 border border-[#E5E4DF] rounded-lg"
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-[#6B6A65] mb-1">
              Type d’achat
            </label>
            <select
              value={typeAchat}
              onChange={(e) => setTypeAchat(e.target.value as LotType)}
              className="w-full px-3 py-2 border border-[#E5E4DF] rounded-lg bg-white"
            >
              <option value="allocation">Allocation (sur vente)</option>
              <option value="avance">Achat en avance (tampon)</option>
              <option value="cave">Stock cave permanent</option>
            </select>
          </div>
          <div>
            <label className="block text-xs font-medium text-[#6B6A65] mb-1">
              Statut logistique
            </label>
            <select
              value={statutLot}
              onChange={(e) => handleStatusChange(e.target.value as LotStatus)}
              className="w-full px-3 py-2 border border-[#E5E4DF] rounded-lg bg-white"
            >
              <option value="commande_payee">Commandé domaine</option>
              <option value="en_transit">En transit</option>
              <option value="recu_cave">Reçu en cave</option>
            </select>
          </div>
        </div>

        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          <div>
            <label className="block text-xs font-medium text-[#6B6A65] mb-1">
              Qté commandée
            </label>
            <input
              type="number"
              min="1"
              value={qteCommandee}
              onChange={(e) =>
                setQteCommandee(Math.max(1, Math.round(Number(e.target.value) || 1)))
              }
              className="w-full px-3 py-2 border border-[#E5E4DF] rounded-lg font-mono"
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-[#6B6A65] mb-1">
              Qté reçue
            </label>
            <input
              type="number"
              min="0"
              max={qteCommandee}
              value={qteRecue}
              onChange={(e) =>
                setQteRecue(Math.max(0, Math.round(Number(e.target.value) || 0)))
              }
              className="w-full px-3 py-2 border border-[#E5E4DF] rounded-lg font-mono"
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-[#6B6A65] mb-1">
              Coût unit. HT (€)
            </label>
            <input
              type="number"
              min="0"
              step="0.01"
              value={coutUnitaireHT}
              onChange={(e) =>
                setCoutUnitaireHT(Math.max(0, Number(e.target.value) || 0))
              }
              className="w-full px-3 py-2 border border-[#E5E4DF] rounded-lg font-mono"
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-[#6B6A65] mb-1">
              Port facturé HT (€)
            </label>
            <input
              type="number"
              min="0"
              step="0.5"
              value={shippingHT}
              onChange={(e) =>
                setShippingHT(Math.max(0, Number(e.target.value) || 0))
              }
              className="w-full px-3 py-2 border border-[#E5E4DF] rounded-lg font-mono"
            />
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          <div>
            <label className="block text-xs font-medium text-[#6B6A65] mb-1">
              Réf. facture / BC
            </label>
            <input
              value={referenceFacture}
              onChange={(e) => setReferenceFacture(e.target.value)}
              placeholder="FA-DOM-2026-01"
              className="w-full px-3 py-2 border border-[#E5E4DF] rounded-lg font-mono text-xs"
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-[#6B6A65] mb-1">
              Règlement domaine
            </label>
            <select
              value={paymentStatus}
              onChange={(e) => setPaymentStatus(e.target.value as LotPaymentStatus)}
              className="w-full px-3 py-2 border border-[#E5E4DF] rounded-lg bg-white"
            >
              <option value="non_paye">À payer</option>
              <option value="paye">Réglé</option>
            </select>
          </div>
          <div>
            <label className="block text-xs font-medium text-[#6B6A65] mb-1">
              Échéance paiement
            </label>
            <input
              type="date"
              value={paymentDueDate}
              onChange={(e) => setPaymentDueDate(e.target.value)}
              className="w-full px-3 py-2 border border-[#E5E4DF] rounded-lg"
            />
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          <div>
            <label className="block text-xs font-medium text-[#6B6A65] mb-1">
              TVA achat (%)
            </label>
            <input
              type="number"
              min="0"
              max="30"
              step="0.5"
              value={tvaRatePct}
              onChange={(e) => setTvaRatePct(Math.max(0, Number(e.target.value) || 0))}
              className="w-full px-3 py-2 border border-[#E5E4DF] rounded-lg font-mono"
            />
          </div>
          <div className="sm:col-span-2">
            <label className="block text-xs font-medium text-[#6B6A65] mb-1">
              Notes
            </label>
            <input
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Transporteur, numéro de palette…"
              className="w-full px-3 py-2 border border-[#E5E4DF] rounded-lg"
            />
          </div>
        </div>

        <div className="p-3 rounded-lg bg-[#FAF9F6] border border-[#E5E4DF] flex items-center justify-between text-xs">
          <span className="text-[#6B6A65]">
            Total lot (port inclus) :{' '}
            <strong className="font-mono text-[#18181B]">{formatEUR(totalHT)} HT</strong>
          </span>
          <span className="font-mono font-semibold text-[#721C24]">
            {formatEUR(totalTTC)} TTC
          </span>
        </div>

        <div className="flex justify-end gap-2 pt-2 border-t border-[#E5E4DF]">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 rounded-lg border border-[#E5E4DF] text-sm cursor-pointer"
          >
            Annuler
          </button>
          <button
            type="submit"
            disabled={saving}
            className="px-4 py-2 rounded-lg bg-[#721C24] hover:bg-[#5E161D] disabled:opacity-50 text-white text-sm font-medium cursor-pointer"
          >
            {saving ? 'Enregistrement…' : initialLot ? 'Mettre à jour' : 'Ajouter le lot'}
          </button>
        </div>
      </form>
    </div>
  );
};
