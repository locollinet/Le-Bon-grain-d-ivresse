import React, { useState } from 'react';
import { X } from 'lucide-react';
import {
  OrderLine,
  OrderSource,
  OrderStatus,
  WineCatalogItem,
} from '../types/wine';
import { formatEUR } from '../utils/wineMath';

interface NewDirectOrderModalProps {
  isOpen: boolean;
  onClose: () => void;
  catalog: WineCatalogItem[];
  onAddOrder: (order: OrderLine) => void;
}

export const NewDirectOrderModal: React.FC<NewDirectOrderModalProps> = ({
  isOpen,
  onClose,
  catalog,
  onAddOrder,
}) => {
  const [catalogId, setCatalogId] = useState(catalog[0]?.id ?? '');
  const [nomClient, setNomClient] = useState('');
  const [prenomClient, setPrenomClient] = useState('');
  const [emailClient, setEmailClient] = useState('');
  const [qte, setQte] = useState(1);
  const [prixOverride, setPrixOverride] = useState<string>('');
  const [source, setSource] = useState<OrderSource>('direct');
  const [statut, setStatut] = useState<OrderStatus>('recu_lbg');
  const [date, setDate] = useState(new Date().toISOString().slice(0, 10));
  const [notes, setNotes] = useState('');

  if (!isOpen) return null;

  const selectedItem = catalog.find((c) => c.id === catalogId) ?? catalog[0];
  const effectivePrice =
    source === 'perso'
      ? 0
      : prixOverride !== ''
        ? Number(prixOverride)
        : selectedItem?.prixLbgTTC ?? 0;

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedItem || !nomClient.trim()) return;

    const newOrder: OrderLine = {
      id: `ord_dir_${Date.now()}`,
      date,
      refCommande:
        source === 'perso'
          ? `CAVE-${Date.now().toString().slice(-5)}`
          : `DIR-${Date.now().toString().slice(-5)}`,
      vente: selectedItem.vente,
      nomClient: nomClient.trim(),
      prenomClient: prenomClient.trim(),
      emailClient: emailClient.trim(),
      catalogId: selectedItem.id,
      produitLabel: selectedItem.cuvee,
      prixUnitaireTTC: effectivePrice,
      qte: Math.max(1, qte),
      statut,
      source,
      notes: notes.trim() || undefined,
    };

    onAddOrder(newOrder);
    setNomClient('');
    setPrenomClient('');
    setEmailClient('');
    setQte(1);
    setPrixOverride('');
    setNotes('');
    onClose();
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/45 p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="direct-order-title"
    >
      <div className="w-full max-w-xl bg-white border border-[#E5E4DF] rounded-xl shadow-2xl overflow-hidden">
        <div className="flex items-center justify-between px-6 py-4 border-b border-[#E5E4DF]">
          <div>
            <h2
              id="direct-order-title"
              className="text-xl font-semibold text-[#141413]"
            >
              Saisir une vente directe ou sortie de cave
            </h2>
            <p className="text-sm text-[#6B6B66] mt-0.5">
              Pour les ventes hors HelloAsso (WhatsApp, Club, remise directe) ou
              dégustations perso.
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
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-medium text-[#6B6B66] mb-1">
                Type d’opération
              </label>
              <select
                value={source}
                onChange={(e) => {
                  const val = e.target.value as OrderSource;
                  setSource(val);
                  if (val === 'perso') setStatut('remis_client');
                }}
                className="w-full px-3 py-2 text-sm bg-white border border-[#D8D6D0] rounded-lg focus:outline-none focus:border-[#721C24]"
              >
                <option value="direct">Vente directe / WhatsApp / Club</option>
                <option value="perso">Prélèvement cave / Dégustation (0 €)</option>
              </select>
            </div>
            <div>
              <label className="block text-xs font-medium text-[#6B6B66] mb-1">
                Date
              </label>
              <input
                type="date"
                value={date}
                onChange={(e) => setDate(e.target.value)}
                className="w-full px-3 py-2 text-sm bg-white border border-[#D8D6D0] rounded-lg focus:outline-none focus:border-[#721C24]"
              />
            </div>
          </div>

          <div>
            <label className="block text-xs font-medium text-[#6B6B66] mb-1">
              Cuvée
            </label>
            <select
              value={catalogId}
              onChange={(e) => {
                setCatalogId(e.target.value);
                setPrixOverride('');
              }}
              className="w-full px-3 py-2 text-sm bg-white border border-[#D8D6D0] rounded-lg focus:outline-none focus:border-[#721C24]"
            >
              {catalog.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.domaine} — {c.cuvee} ({formatEUR(c.prixLbgTTC)})
                </option>
              ))}
            </select>
          </div>

          <div className="grid grid-cols-3 gap-3">
            <div>
              <label className="block text-xs font-medium text-[#6B6B66] mb-1">
                Prénom client
              </label>
              <input
                type="text"
                value={prenomClient}
                onChange={(e) => setPrenomClient(e.target.value)}
                placeholder="Ex : Romain"
                className="w-full px-3 py-2 text-sm bg-white border border-[#D8D6D0] rounded-lg focus:outline-none focus:border-[#721C24]"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-[#6B6B66] mb-1">
                Nom client *
              </label>
              <input
                type="text"
                required
                value={nomClient}
                onChange={(e) => setNomClient(e.target.value)}
                placeholder="Ex : Pasquet"
                className="w-full px-3 py-2 text-sm bg-white border border-[#D8D6D0] rounded-lg focus:outline-none focus:border-[#721C24]"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-[#6B6B66] mb-1">
                Email (optionnel)
              </label>
              <input
                type="email"
                value={emailClient}
                onChange={(e) => setEmailClient(e.target.value)}
                placeholder="client@email.fr"
                className="w-full px-3 py-2 text-sm bg-white border border-[#D8D6D0] rounded-lg focus:outline-none focus:border-[#721C24]"
              />
            </div>
          </div>

          <div className="grid grid-cols-3 gap-3">
            <div>
              <label className="block text-xs font-medium text-[#6B6B66] mb-1">
                Quantité (btl)
              </label>
              <input
                type="number"
                min={1}
                value={qte}
                onChange={(e) => setQte(Number(e.target.value))}
                className="w-full px-3 py-2 text-sm font-mono-num bg-white border border-[#D8D6D0] rounded-lg focus:outline-none focus:border-[#721C24]"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-[#6B6B66] mb-1">
                Prix unitaire TTC (€)
              </label>
              <input
                type="number"
                step="0.5"
                min={0}
                disabled={source === 'perso'}
                value={
                  source === 'perso'
                    ? '0'
                    : prixOverride !== ''
                      ? prixOverride
                      : String(selectedItem?.prixLbgTTC ?? 0)
                }
                onChange={(e) => setPrixOverride(e.target.value)}
                className="w-full px-3 py-2 text-sm font-mono-num bg-white border border-[#D8D6D0] rounded-lg focus:outline-none focus:border-[#721C24] disabled:bg-[#F6F6F4]"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-[#6B6B66] mb-1">
                Statut logistique
              </label>
              <select
                value={statut}
                onChange={(e) => setStatut(e.target.value as OrderStatus)}
                className="w-full px-3 py-2 text-sm bg-white border border-[#D8D6D0] rounded-lg focus:outline-none focus:border-[#721C24]"
              >
                <option value="recu_lbg">Reçu par LBG (en cave)</option>
                <option value="attente_reception">En attente domaine</option>
                <option value="remis_client">Déjà remis au client</option>
              </select>
            </div>
          </div>

          <div>
            <label className="block text-xs font-medium text-[#6B6B66] mb-1">
              Note (optionnel)
            </label>
            <input
              type="text"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Ex : Règlement virement / Remise en main propre"
              className="w-full px-3 py-2 text-sm bg-white border border-[#D8D6D0] rounded-lg focus:outline-none focus:border-[#721C24]"
            />
          </div>

          <div className="flex items-center justify-between pt-3 border-t border-[#E5E4DF]">
            <div className="text-sm text-[#6B6B66]">
              Total commande :{' '}
              <span className="font-semibold text-[#141413] font-mono-num">
                {formatEUR(effectivePrice * Math.max(1, qte))}
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
                Enregistrer
              </button>
            </div>
          </div>
        </form>
      </div>
    </div>
  );
};
