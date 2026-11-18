import React, { useState } from 'react';
import { X } from 'lucide-react';
import { LotStatus, LotType, SupplierLot, WineCatalogItem } from '../types/wine';
import { formatEUR } from '../utils/wineMath';
import type { SupplierLotPrefill } from '../modules/assistant/types';

interface NewSupplierLotModalProps {
  isOpen: boolean;
  onClose: () => void;
  catalog: WineCatalogItem[];
  preselectedCatalogId?: string;
  prefill?: SupplierLotPrefill | null;
  onAddLot: (lot: SupplierLot) => void;
}

export const NewSupplierLotModal: React.FC<NewSupplierLotModalProps> = ({
  isOpen,
  onClose,
  catalog,
  preselectedCatalogId,
  prefill,
  onAddLot,
}) => {
  const [catalogId, setCatalogId] = useState(
    preselectedCatalogId || catalog[0]?.id || ''
  );
  const [typeAchat, setTypeAchat] = useState<LotType>('avance');
  const [qteCommandee, setQteCommandee] = useState(6);
  const [statutLot, setStatutLot] = useState<LotStatus>('recu_cave');
  const [coutUnitaireHT, setCoutUnitaireHT] = useState<string>('');
  const [dateAchat, setDateAchat] = useState(
    new Date().toISOString().slice(0, 10)
  );
  const [referenceFacture, setReferenceFacture] = useState('');
  const [notes, setNotes] = useState('');

  React.useEffect(() => {
    if (!isOpen) return;
    setCatalogId(
      prefill?.catalogId || preselectedCatalogId || catalog[0]?.id || ''
    );
    setTypeAchat(prefill?.typeAchat ?? 'avance');
    setQteCommandee(
      prefill?.qteCommandee ? Math.max(1, prefill.qteCommandee) : 6
    );
    setStatutLot(prefill?.statutLot ?? 'recu_cave');
    setCoutUnitaireHT(
      prefill?.coutUnitaireHT !== undefined
        ? String(prefill.coutUnitaireHT)
        : ''
    );
    setDateAchat(new Date().toISOString().slice(0, 10));
    setReferenceFacture(prefill?.referenceFacture ?? '');
    setNotes(prefill?.notes ?? '');
  }, [isOpen, preselectedCatalogId, prefill, catalog]);

  if (!isOpen) return null;

  const selectedItem = catalog.find((c) => c.id === catalogId) ?? catalog[0];
  const effectiveCost =
    coutUnitaireHT !== ''
      ? Number(coutUnitaireHT)
      : selectedItem?.tarifAchatHT ?? 0;

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedItem || qteCommandee <= 0) return;

    const newLot: SupplierLot = {
      id: `lot_${Date.now()}`,
      catalogId: selectedItem.id,
      dateAchat,
      typeAchat,
      qteCommandee,
      qteRecue: statutLot === 'recu_cave' ? qteCommandee : 0,
      coutUnitaireHT: effectiveCost,
      statutLot,
      referenceFacture:
        referenceFacture.trim() || `FAC-${Date.now().toString().slice(-5)}`,
      notes: notes.trim() || undefined,
    };

    onAddLot(newLot);
    setReferenceFacture('');
    setNotes('');
    setCoutUnitaireHT('');
    onClose();
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/45 p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="lot-modal-title"
    >
      <div className="w-full max-w-xl bg-white border border-[#E5E4DF] rounded-xl shadow-2xl overflow-hidden">
        <div className="flex items-center justify-between px-6 py-4 border-b border-[#E5E4DF]">
          <div>
            <h2
              id="lot-modal-title"
              className="text-xl font-semibold text-[#141413]"
            >
              Enregistrer un achat fournisseur / stock en avance
            </h2>
            <p className="text-sm text-[#6B6B66] mt-0.5">
              Suivez le vin payé d’avance avant mise en vente ou les réassorts
              domaines.
            </p>
          </div>
          <button
            onClick={onClose}
            className="p-2 text-[#6B6B66] hover:text-[#141413] hover:bg-[#F6F6F4] rounded-lg"
            aria-label="Fermer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-6 space-y-4">
          <div>
            <label className="block text-xs font-medium text-[#6B6B66] mb-1">
              Cuvée concernée
            </label>
            <select
              value={catalogId}
              onChange={(e) => {
                setCatalogId(e.target.value);
                setCoutUnitaireHT('');
              }}
              className="w-full px-3 py-2 text-sm bg-white border border-[#D8D6D0] rounded-lg focus:outline-none focus:border-[#721C24]"
            >
              {catalog.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.domaine} — {c.cuvee} (Achat réf. {formatEUR(c.tarifAchatHT)}{' '}
                  HT)
                </option>
              ))}
            </select>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-medium text-[#6B6B66] mb-1">
                Nature de l’achat
              </label>
              <select
                value={typeAchat}
                onChange={(e) => setTypeAchat(e.target.value as LotType)}
                className="w-full px-3 py-2 text-sm bg-white border border-[#D8D6D0] rounded-lg focus:outline-none focus:border-[#721C24]"
              >
                <option value="avance">
                  Achat en avance (avant mise en vente)
                </option>
                <option value="allocation">
                  Allocation (couvre une vente HelloAsso)
                </option>
                <option value="cave">Stock cave existant</option>
              </select>
            </div>
            <div>
              <label className="block text-xs font-medium text-[#6B6B66] mb-1">
                État de réception
              </label>
              <select
                value={statutLot}
                onChange={(e) => setStatutLot(e.target.value as LotStatus)}
                className="w-full px-3 py-2 text-sm bg-white border border-[#D8D6D0] rounded-lg focus:outline-none focus:border-[#721C24]"
              >
                <option value="recu_cave">Reçu en cave LBG</option>
                <option value="en_transit">En transit / Chez transporteur</option>
                <option value="commande_payee">
                  Commandé &amp; payé (en attente domaine)
                </option>
              </select>
            </div>
          </div>

          <div className="grid grid-cols-3 gap-3">
            <div>
              <label className="block text-xs font-medium text-[#6B6B66] mb-1">
                Quantité (bouteilles)
              </label>
              <input
                type="number"
                min={1}
                value={qteCommandee}
                onChange={(e) => setQteCommandee(Number(e.target.value))}
                className="w-full px-3 py-2 text-sm font-mono-num bg-white border border-[#D8D6D0] rounded-lg focus:outline-none focus:border-[#721C24]"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-[#6B6B66] mb-1">
                Coût unitaire HT (€)
              </label>
              <input
                type="number"
                step="0.01"
                min={0}
                value={
                  coutUnitaireHT !== ''
                    ? coutUnitaireHT
                    : String(selectedItem?.tarifAchatHT ?? 0)
                }
                onChange={(e) => setCoutUnitaireHT(e.target.value)}
                className="w-full px-3 py-2 text-sm font-mono-num bg-white border border-[#D8D6D0] rounded-lg focus:outline-none focus:border-[#721C24]"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-[#6B6B66] mb-1">
                Date d’achat
              </label>
              <input
                type="date"
                value={dateAchat}
                onChange={(e) => setDateAchat(e.target.value)}
                className="w-full px-3 py-2 text-sm bg-white border border-[#D8D6D0] rounded-lg focus:outline-none focus:border-[#721C24]"
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-medium text-[#6B6B66] mb-1">
                N° Facture / Référence domaine
              </label>
              <input
                type="text"
                value={referenceFacture}
                onChange={(e) => setReferenceFacture(e.target.value)}
                placeholder="Ex : FAC-TIS-2026-112"
                className="w-full px-3 py-2 text-sm bg-white border border-[#D8D6D0] rounded-lg focus:outline-none focus:border-[#721C24]"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-[#6B6B66] mb-1">
                Notes
              </label>
              <input
                type="text"
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                placeholder="Ex : Caisse bois 6 btl"
                className="w-full px-3 py-2 text-sm bg-white border border-[#D8D6D0] rounded-lg focus:outline-none focus:border-[#721C24]"
              />
            </div>
          </div>

          <div className="flex items-center justify-between pt-3 border-t border-[#E5E4DF]">
            <div className="text-sm text-[#6B6B66]">
              Engagement HT :{' '}
              <span className="font-semibold text-[#141413] font-mono-num">
                {formatEUR(effectiveCost * qteCommandee)}
              </span>
            </div>
            <div className="flex items-center gap-3">
              <button
                type="button"
                onClick={onClose}
                className="px-4 py-2 text-sm font-medium text-[#6B6B66] hover:text-[#141413]"
              >
                Annuler
              </button>
              <button
                type="submit"
                className="px-5 py-2 text-sm font-medium text-white bg-[#721C24] hover:bg-[#5B151C] rounded-lg transition-colors"
              >
                Ajouter au stock
              </button>
            </div>
          </div>
        </form>
      </div>
    </div>
  );
};
