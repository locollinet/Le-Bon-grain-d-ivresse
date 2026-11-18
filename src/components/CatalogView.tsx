import React, { useEffect, useMemo, useState } from 'react';
import { Pencil, Plus, Search, Trash2, X } from 'lucide-react';
import {
  AppSettings,
  WineCatalogItem,
  WineChannel,
  WineColor,
} from '../types/wine';
import {
  computeBottleEconomics,
  formatEUR,
  formatPct,
  normalizeSearchText,
} from '../utils/wineMath';
import type { CatalogItemPrefill } from '../modules/assistant/types';

interface CatalogViewProps {
  catalog: WineCatalogItem[];
  settings: AppSettings;
  initialFocus?: { search?: string } | null;
  prefillNew?: CatalogItemPrefill | null;
  onClearPrefillNew?: () => void;
  onUpdateCatalogItem: (updated: WineCatalogItem) => void;
  onAddCatalogItem: (item: WineCatalogItem) => void;
  onDeleteCatalogItem?: (id: string) => void;
}

const WINE_COLORS: WineColor[] = [
  'Blanc',
  'Rouge',
  'Rosé',
  'Orange',
  'Effervescent',
  'Jaune / Oxydatif',
  'Doux / Liquoreux',
];

export const CatalogView: React.FC<CatalogViewProps> = ({
  catalog,
  settings,
  initialFocus,
  prefillNew,
  onClearPrefillNew,
  onUpdateCatalogItem,
  onAddCatalogItem,
  onDeleteCatalogItem,
}) => {
  const [search, setSearch] = useState('');
  const [domaineFilter, setDomaineFilter] = useState('all');
  const [isAddOpen, setIsAddOpen] = useState(false);
  const [editingItem, setEditingItem] = useState<WineCatalogItem | null>(null);
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);

  // Add form state
  const [newDomaine, setNewDomaine] = useState('');
  const [newCuvee, setNewCuvee] = useState('');
  const [newVente, setNewVente] = useState('Vente Novembre 2026');
  const [newCanal, setNewCanal] = useState<WineChannel>('Standard');
  const [newRegion, setNewRegion] = useState('Bourgogne');
  const [newColor, setNewColor] = useState<WineColor>('Blanc');
  const [newAchatHT, setNewAchatHT] = useState('25');
  const [newPrixTTC, setNewPrixTTC] = useState('39');
  const [newBenchTTC, setNewBenchTTC] = useState('48');
  const [newBenchSource, setNewBenchSource] = useState('Caviste');
  const [newTastingNotes, setNewTastingNotes] = useState('');

  useEffect(() => {
    if (initialFocus?.search !== undefined) {
      setSearch(initialFocus.search);
    }
  }, [initialFocus]);

  useEffect(() => {
    if (!prefillNew) return;
    setNewDomaine(prefillNew.domaine ?? '');
    setNewCuvee(prefillNew.cuvee ?? '');
    setNewVente(prefillNew.vente ?? 'Vente Novembre 2026');
    setNewCanal(prefillNew.canal ?? 'Standard');
    setNewRegion(prefillNew.region ?? 'Bourgogne');
    setNewColor(prefillNew.color ?? 'Blanc');
    setNewAchatHT(
      prefillNew.tarifAchatHT !== undefined
        ? String(prefillNew.tarifAchatHT)
        : '25'
    );
    setNewPrixTTC(
      prefillNew.prixLbgTTC !== undefined ? String(prefillNew.prixLbgTTC) : '39'
    );
    setNewBenchTTC(
      prefillNew.benchTTC !== undefined && prefillNew.benchTTC !== null
        ? String(prefillNew.benchTTC)
        : ''
    );
    setNewBenchSource(prefillNew.benchSource ?? 'Caviste');
    setIsAddOpen(true);
    onClearPrefillNew?.();
  }, [prefillNew, onClearPrefillNew]);

  const domaines = useMemo(
    () => Array.from(new Set(catalog.map((c) => c.domaine))).sort(),
    [catalog]
  );

  const filtered = useMemo(() => {
    const q = normalizeSearchText(search);
    return catalog.filter((c) => {
      if (domaineFilter !== 'all' && c.domaine !== domaineFilter) return false;
      if (q) {
        const hay = normalizeSearchText(
          `${c.domaine} ${c.cuvee} ${c.vente} ${c.region} ${c.canal ?? ''}`
        );
        if (!hay.includes(q)) return false;
      }
      return true;
    });
  }, [catalog, domaineFilter, search]);

  const handleCreate = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newDomaine.trim() || !newCuvee.trim()) return;
    const uid =
      typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function'
        ? crypto.randomUUID().slice(0, 8)
        : String(Date.now());
    const item: WineCatalogItem = {
      id: `cat_${uid}_${Date.now()}`,
      vente: newVente.trim() || 'Catalogue général',
      canal: newCanal,
      domaine: newDomaine.trim(),
      cuvee: newCuvee.trim(),
      reference: `${newDomaine.trim()} - ${newCuvee.trim()}`,
      region: newRegion.trim() || 'France',
      color: newColor,
      tarifAchatHT: Number(newAchatHT) || 0,
      prixLbgTTC: Number(newPrixTTC) || 0,
      benchTTC: newBenchTTC ? Number(newBenchTTC) : null,
      benchSource: newBenchSource.trim() || 'Marché',
      dispoPublic: true,
      tastingNotes: newTastingNotes.trim() || undefined,
    };
    onAddCatalogItem(item);
    setNewDomaine('');
    setNewCuvee('');
    setNewTastingNotes('');
    setIsAddOpen(false);
  };

  const handleSaveEdit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingItem) return;
    onUpdateCatalogItem({
      ...editingItem,
      reference: `${editingItem.domaine.trim()} - ${editingItem.cuvee.trim()}`,
    });
    setEditingItem(null);
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col lg:flex-row lg:items-end justify-between gap-4">
        <div>
          <h1 className="font-display text-3xl font-semibold text-[#141413] tracking-tight">
            Catalogue, tarifs &amp; simulateur de marge
          </h1>
          <p className="text-sm text-[#6B6B66] mt-1">
            Tarifs EXW HT, logistique amont+aval ({formatEUR(settings.fraisLogistiqueAmont + settings.fraisLogistiqueAval)}/btl),
            prix base conseillé (marque {Math.round((settings.tauxMarqueCibleExw ?? 0.1) * 100)} %) et benchmark marché.
          </p>
        </div>

        <button
          onClick={() => setIsAddOpen(true)}
          className="inline-flex items-center gap-2 px-4 py-2 text-sm font-medium text-white bg-[#721C24] hover:bg-[#5B151C] rounded-lg transition-colors whitespace-nowrap shrink-0"
        >
          <Plus className="w-4 h-4" />
          <span>Ajouter une cuvée</span>
        </button>
      </div>

      {/* Filter Bar */}
      <div className="flex flex-wrap items-center justify-between gap-3 bg-white border border-[#E5E4DF] rounded-xl p-4">
        <div className="flex flex-wrap items-center gap-3">
          <select
            value={domaineFilter}
            onChange={(e) => setDomaineFilter(e.target.value)}
            className="px-3 py-1.5 text-sm bg-[#FAF9F7] border border-[#D8D6D0] rounded-lg focus:outline-none focus:border-[#721C24]"
          >
            <option value="all">Tous les domaines ({domaines.length})</option>
            {domaines.map((d) => (
              <option key={d} value={d}>
                {d}
              </option>
            ))}
          </select>

          <span className="text-xs text-[#6B6B66]">
            {filtered.length} référence(s) affichée(s)
          </span>
        </div>

        <div className="relative w-full sm:w-64">
          <Search className="w-4 h-4 text-[#6B6B66] absolute left-3 top-1/2 -translate-y-1/2" />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Rechercher domaine, cuvée..."
            className="pl-9 pr-3 py-1.5 text-sm bg-[#FAF9F7] border border-[#D8D6D0] rounded-lg focus:outline-none focus:border-[#721C24] w-full"
          />
        </div>
      </div>

      {/* Pricing Grid */}
      <div className="bg-white border border-[#E5E4DF] rounded-xl overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse text-sm">
            <thead>
              <tr className="bg-[#FAF9F7] text-xs text-[#6B6B66] border-b border-[#E5E4DF]">
                <th className="py-3 px-5 font-medium">Domaine &amp; Cuvée</th>
                <th className="py-3 px-3 font-medium">Vente</th>
                <th className="py-3 px-3 font-medium text-right">
                  Achat EXW HT
                </th>
                <th className="py-3 px-3 font-medium text-right">
                  Prix LBG TTC
                </th>
                <th className="py-3 px-3 font-medium text-right">
                  Bench TTC
                </th>
                <th className="py-3 px-3 font-medium text-right">
                  vs Bench
                </th>
                <th className="py-3 px-3 font-medium text-right">
                  Marge nette €
                </th>
                <th className="py-3 px-3 font-medium text-right">
                  Marge livrée %
                </th>
                <th className="py-3 px-4 font-medium text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[#ECEAE4]">
              {filtered.map((item) => {
                const econ = computeBottleEconomics(item, settings);
                return (
                  <tr
                    key={item.id}
                    className="hover:bg-[#FAF9F7] transition-colors"
                  >
                    <td className="py-2.5 px-5">
                      <div className="font-medium text-[#141413]">
                        {item.cuvee}
                      </div>
                      <div className="text-xs text-[#6B6B66]">
                        {item.domaine} · {item.region} · {item.color}
                        {item.canal && item.canal !== 'Standard'
                          ? ` · ${item.canal}`
                          : ''}
                      </div>
                      {item.notes && (
                        <div className="text-[11px] text-[#B45309] mt-0.5">
                          {item.notes}
                        </div>
                      )}
                    </td>
                    <td className="py-2.5 px-3 text-xs text-[#6B6B66] whitespace-nowrap">
                      {item.vente}
                    </td>
                    <td className="py-2.5 px-3 text-right">
                      <input
                        type="number"
                        step="0.05"
                        min="0"
                        value={item.tarifAchatHT}
                        onFocus={(e) => e.target.select()}
                        onChange={(e) =>
                          onUpdateCatalogItem({
                            ...item,
                            tarifAchatHT: Math.max(0, Number(e.target.value)),
                          })
                        }
                        className="w-20 px-2 py-1 text-right text-xs font-mono-num bg-[#FAF9F7] border border-[#D8D6D0] rounded focus:outline-none focus:border-[#721C24]"
                      />
                    </td>
                    <td className="py-2.5 px-3 text-right">
                      <input
                        type="number"
                        step="0.5"
                        min="0"
                        value={item.prixLbgTTC}
                        onFocus={(e) => e.target.select()}
                        onChange={(e) =>
                          onUpdateCatalogItem({
                            ...item,
                            prixLbgTTC: Math.max(0, Number(e.target.value)),
                          })
                        }
                        className="w-20 px-2 py-1 text-right text-xs font-mono-num font-semibold bg-white border border-[#D8D6D0] rounded focus:outline-none focus:border-[#721C24]"
                      />
                      <div className="text-[10px] font-mono-num text-[#6B6B66] mt-0.5">
                        Base : {formatEUR(econ.tarifBaseConseilleTTC)}
                      </div>
                    </td>
                    <td className="py-2.5 px-3 text-right font-mono-num text-xs text-[#6B6B66] whitespace-nowrap">
                      {item.benchTTC ? (
                        <div>
                          <div>{formatEUR(item.benchTTC)}</div>
                          <div className="text-[10px]">
                            {item.benchSource}
                          </div>
                        </div>
                      ) : (
                        '—'
                      )}
                    </td>
                    <td className="py-2.5 px-3 text-right font-mono-num text-xs">
                      {econ.vsBenchPct !== null ? (
                        <span
                          className={
                            econ.vsBenchPct <= 0
                              ? 'text-[#15803D] font-medium'
                              : 'text-[#B91C1C]'
                          }
                        >
                          {formatPct(econ.vsBenchPct, true)}
                        </span>
                      ) : (
                        '—'
                      )}
                    </td>
                    <td
                      className={`py-2.5 px-3 text-right font-mono-num font-semibold ${
                        econ.margeEuro < 0
                          ? 'text-[#B91C1C]'
                          : econ.margePct < 5
                            ? 'text-[#B45309]'
                            : 'text-[#15803D]'
                      }`}
                    >
                      {formatEUR(econ.margeEuro, true)}
                    </td>
                    <td
                      className={`py-2.5 px-3 text-right font-mono-num text-xs ${
                        econ.margeEuro < 0
                          ? 'text-[#B91C1C] font-semibold'
                          : econ.margePct < 5
                            ? 'text-[#B45309] font-medium'
                            : 'text-[#141413]'
                      }`}
                    >
                      {formatPct(econ.margePct)}
                    </td>
                    <td className="py-2.5 px-4 text-right whitespace-nowrap">
                      <div className="inline-flex items-center gap-1">
                        <button
                          type="button"
                          onClick={() => setEditingItem({ ...item })}
                          className="p-1.5 text-[#6B6B66] hover:text-[#141413] hover:bg-[#ECEAE4] rounded"
                          title="Modifier la fiche complète"
                          aria-label={`Modifier ${item.cuvee}`}
                        >
                          <Pencil className="w-3.5 h-3.5" />
                        </button>
                        {onDeleteCatalogItem && (
                          <button
                            type="button"
                            onClick={() => setConfirmDeleteId(item.id)}
                            className="p-1.5 text-[#9E9B93] hover:text-[#B91C1C] hover:bg-[#FEF2F2] rounded"
                            title="Supprimer la cuvée"
                            aria-label={`Supprimer ${item.cuvee}`}
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

      {/* Add Cuvee Modal */}
      {isAddOpen && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/45 p-4"
          role="dialog"
          aria-modal="true"
        >
          <div className="w-full max-w-lg bg-white border border-[#E5E4DF] rounded-xl shadow-2xl overflow-hidden">
            <div className="flex items-center justify-between px-6 py-4 border-b border-[#E5E4DF]">
              <h2 className="text-lg font-semibold text-[#141413]">
                Nouvelle cuvée au catalogue
              </h2>
              <button
                onClick={() => setIsAddOpen(false)}
                className="p-1.5 text-[#6B6B66] hover:text-[#141413] rounded-lg"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
            <form onSubmit={handleCreate} className="p-6 space-y-4">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-medium text-[#6B6B66] mb-1">
                    Domaine *
                  </label>
                  <input
                    type="text"
                    required
                    value={newDomaine}
                    onChange={(e) => setNewDomaine(e.target.value)}
                    placeholder="Ex : Domaine Tissot"
                    className="w-full px-3 py-2 text-sm border border-[#D8D6D0] rounded-lg"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-[#6B6B66] mb-1">
                    Vente / Campagne
                  </label>
                  <input
                    type="text"
                    value={newVente}
                    onChange={(e) => setNewVente(e.target.value)}
                    className="w-full px-3 py-2 text-sm border border-[#D8D6D0] rounded-lg"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-medium text-[#6B6B66] mb-1">
                  Nom exact de la cuvée (matching HelloAsso) *
                </label>
                <input
                  type="text"
                  required
                  value={newCuvee}
                  onChange={(e) => setNewCuvee(e.target.value)}
                  placeholder="Ex : Sursis 2022"
                  className="w-full px-3 py-2 text-sm border border-[#D8D6D0] rounded-lg"
                />
              </div>

              <div className="grid grid-cols-3 gap-3">
                <div>
                  <label className="block text-xs font-medium text-[#6B6B66] mb-1">
                    Région
                  </label>
                  <input
                    type="text"
                    value={newRegion}
                    onChange={(e) => setNewRegion(e.target.value)}
                    className="w-full px-3 py-2 text-sm border border-[#D8D6D0] rounded-lg"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-[#6B6B66] mb-1">
                    Couleur
                  </label>
                  <select
                    value={newColor}
                    onChange={(e) => setNewColor(e.target.value as WineColor)}
                    className="w-full px-3 py-2 text-sm border border-[#D8D6D0] rounded-lg"
                  >
                    {WINE_COLORS.map((c) => (
                      <option key={c} value={c}>
                        {c}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-medium text-[#6B6B66] mb-1">
                    Canal
                  </label>
                  <select
                    value={newCanal}
                    onChange={(e) => setNewCanal(e.target.value as WineChannel)}
                    className="w-full px-3 py-2 text-sm border border-[#D8D6D0] rounded-lg"
                  >
                    <option value="Standard">Standard</option>
                    <option value="Club">Club</option>
                    <option value="WhatsApp">WhatsApp</option>
                  </select>
                </div>
              </div>

              <div className="grid grid-cols-4 gap-3">
                <div>
                  <label className="block text-xs font-medium text-[#6B6B66] mb-1">
                    EXW HT (€)
                  </label>
                  <input
                    type="number"
                    step="0.05"
                    value={newAchatHT}
                    onChange={(e) => setNewAchatHT(e.target.value)}
                    className="w-full px-3 py-2 text-sm font-mono-num border border-[#D8D6D0] rounded-lg"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-[#6B6B66] mb-1">
                    Prix LBG TTC
                  </label>
                  <input
                    type="number"
                    step="0.5"
                    value={newPrixTTC}
                    onChange={(e) => setNewPrixTTC(e.target.value)}
                    className="w-full px-3 py-2 text-sm font-mono-num border border-[#D8D6D0] rounded-lg"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-[#6B6B66] mb-1">
                    Bench TTC
                  </label>
                  <input
                    type="number"
                    step="0.5"
                    value={newBenchTTC}
                    onChange={(e) => setNewBenchTTC(e.target.value)}
                    className="w-full px-3 py-2 text-sm font-mono-num border border-[#D8D6D0] rounded-lg"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-[#6B6B66] mb-1">
                    Source Bench
                  </label>
                  <input
                    type="text"
                    value={newBenchSource}
                    onChange={(e) => setNewBenchSource(e.target.value)}
                    className="w-full px-3 py-2 text-sm border border-[#D8D6D0] rounded-lg"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-medium text-[#6B6B66] mb-1">
                  Note de dégustation publique (vitrine)
                </label>
                <input
                  type="text"
                  value={newTastingNotes}
                  onChange={(e) => setNewTastingNotes(e.target.value)}
                  placeholder="Optionnel : affiché sur la Carte des vins clients"
                  className="w-full px-3 py-2 text-sm border border-[#D8D6D0] rounded-lg"
                />
              </div>

              <div className="flex justify-end gap-3 pt-3 border-t border-[#E5E4DF]">
                <button
                  type="button"
                  onClick={() => setIsAddOpen(false)}
                  className="px-4 py-2 text-sm text-[#6B6B66]"
                >
                  Annuler
                </button>
                <button
                  type="submit"
                  className="px-5 py-2 text-sm font-medium text-white bg-[#721C24] hover:bg-[#5B151C] rounded-lg"
                >
                  Ajouter au catalogue
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Full Edit Cuvee Modal */}
      {editingItem && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/45 p-4"
          role="dialog"
          aria-modal="true"
        >
          <div className="w-full max-w-xl bg-white border border-[#E5E4DF] rounded-xl shadow-2xl overflow-hidden">
            <div className="flex items-center justify-between px-6 py-4 border-b border-[#E5E4DF]">
              <h2 className="text-lg font-semibold text-[#141413]">
                Modifier la fiche cuvée
              </h2>
              <button
                onClick={() => setEditingItem(null)}
                className="p-1.5 text-[#6B6B66] hover:text-[#141413] rounded-lg"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
            <form onSubmit={handleSaveEdit} className="p-6 space-y-4">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-medium text-[#6B6B66] mb-1">
                    Domaine *
                  </label>
                  <input
                    type="text"
                    required
                    value={editingItem.domaine}
                    onChange={(e) =>
                      setEditingItem({ ...editingItem, domaine: e.target.value })
                    }
                    className="w-full px-3 py-2 text-sm border border-[#D8D6D0] rounded-lg"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-[#6B6B66] mb-1">
                    Vente / Campagne
                  </label>
                  <input
                    type="text"
                    value={editingItem.vente}
                    onChange={(e) =>
                      setEditingItem({ ...editingItem, vente: e.target.value })
                    }
                    className="w-full px-3 py-2 text-sm border border-[#D8D6D0] rounded-lg"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-medium text-[#6B6B66] mb-1">
                  Cuvée *
                </label>
                <input
                  type="text"
                  required
                  value={editingItem.cuvee}
                  onChange={(e) =>
                    setEditingItem({ ...editingItem, cuvee: e.target.value })
                  }
                  className="w-full px-3 py-2 text-sm border border-[#D8D6D0] rounded-lg"
                />
              </div>

              <div className="grid grid-cols-3 gap-3">
                <div>
                  <label className="block text-xs font-medium text-[#6B6B66] mb-1">
                    Région
                  </label>
                  <input
                    type="text"
                    value={editingItem.region}
                    onChange={(e) =>
                      setEditingItem({ ...editingItem, region: e.target.value })
                    }
                    className="w-full px-3 py-2 text-sm border border-[#D8D6D0] rounded-lg"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-[#6B6B66] mb-1">
                    Couleur
                  </label>
                  <select
                    value={editingItem.color}
                    onChange={(e) =>
                      setEditingItem({
                        ...editingItem,
                        color: e.target.value as WineColor,
                      })
                    }
                    className="w-full px-3 py-2 text-sm border border-[#D8D6D0] rounded-lg"
                  >
                    {WINE_COLORS.map((c) => (
                      <option key={c} value={c}>
                        {c}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-medium text-[#6B6B66] mb-1">
                    Logistique override (€ HT)
                  </label>
                  <input
                    type="number"
                    step="0.25"
                    placeholder={`${settings.fraisLogistiqueAmont + settings.fraisLogistiqueAval}`}
                    value={editingItem.fraisLogistiqueOverride ?? ''}
                    onChange={(e) =>
                      setEditingItem({
                        ...editingItem,
                        fraisLogistiqueOverride:
                          e.target.value === ''
                            ? undefined
                            : Number(e.target.value),
                      })
                    }
                    className="w-full px-3 py-2 text-sm font-mono-num border border-[#D8D6D0] rounded-lg"
                  />
                </div>
              </div>

              <div className="grid grid-cols-4 gap-3">
                <div>
                  <label className="block text-xs font-medium text-[#6B6B66] mb-1">
                    EXW HT
                  </label>
                  <input
                    type="number"
                    step="0.05"
                    value={editingItem.tarifAchatHT}
                    onChange={(e) =>
                      setEditingItem({
                        ...editingItem,
                        tarifAchatHT: Number(e.target.value),
                      })
                    }
                    className="w-full px-3 py-2 text-sm font-mono-num border border-[#D8D6D0] rounded-lg"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-[#6B6B66] mb-1">
                    Prix LBG TTC
                  </label>
                  <input
                    type="number"
                    step="0.5"
                    value={editingItem.prixLbgTTC}
                    onChange={(e) =>
                      setEditingItem({
                        ...editingItem,
                        prixLbgTTC: Number(e.target.value),
                      })
                    }
                    className="w-full px-3 py-2 text-sm font-mono-num border border-[#D8D6D0] rounded-lg"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-[#6B6B66] mb-1">
                    Bench TTC
                  </label>
                  <input
                    type="number"
                    step="0.5"
                    value={editingItem.benchTTC ?? ''}
                    onChange={(e) =>
                      setEditingItem({
                        ...editingItem,
                        benchTTC:
                          e.target.value === ''
                            ? null
                            : Number(e.target.value),
                      })
                    }
                    className="w-full px-3 py-2 text-sm font-mono-num border border-[#D8D6D0] rounded-lg"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-[#6B6B66] mb-1">
                    Source Bench
                  </label>
                  <input
                    type="text"
                    value={editingItem.benchSource}
                    onChange={(e) =>
                      setEditingItem({
                        ...editingItem,
                        benchSource: e.target.value,
                      })
                    }
                    className="w-full px-3 py-2 text-sm border border-[#D8D6D0] rounded-lg"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-medium text-[#6B6B66] mb-1">
                  Note publique de dégustation (visible clients)
                </label>
                <input
                  type="text"
                  value={editingItem.tastingNotes ?? ''}
                  onChange={(e) =>
                    setEditingItem({
                      ...editingItem,
                      tastingNotes: e.target.value,
                    })
                  }
                  className="w-full px-3 py-2 text-sm border border-[#D8D6D0] rounded-lg"
                />
              </div>

              <div>
                <label className="block text-xs font-medium text-[#6B6B66] mb-1">
                  Note interne négoce (confidentielle — masquée aux clients)
                </label>
                <input
                  type="text"
                  value={editingItem.notes ?? ''}
                  onChange={(e) =>
                    setEditingItem({ ...editingItem, notes: e.target.value })
                  }
                  className="w-full px-3 py-2 text-sm border border-[#D8D6D0] rounded-lg"
                />
              </div>

              <div className="flex justify-end gap-3 pt-3 border-t border-[#E5E4DF]">
                <button
                  type="button"
                  onClick={() => setEditingItem(null)}
                  className="px-4 py-2 text-sm text-[#6B6B66]"
                >
                  Annuler
                </button>
                <button
                  type="submit"
                  className="px-5 py-2 text-sm font-medium text-white bg-[#721C24] hover:bg-[#5B151C] rounded-lg"
                >
                  Enregistrer les modifications
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Delete Confirmation Modal */}
      {confirmDeleteId && onDeleteCatalogItem && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/45 p-4"
          role="dialog"
          aria-modal="true"
        >
          <div className="w-full max-w-sm bg-white border border-[#E5E4DF] rounded-xl shadow-2xl p-6 space-y-4">
            <h3 className="text-base font-semibold text-[#141413]">
              Supprimer cette cuvée du catalogue ?
            </h3>
            <p className="text-xs text-[#6B6B66]">
              Cette action retire la référence de la grille tarifaire. Les
              commandes existantes conservent leur libellé.
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
                  onDeleteCatalogItem(confirmDeleteId);
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
