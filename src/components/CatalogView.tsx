import React, { useMemo, useState } from 'react';
import { Plus, Search, X } from 'lucide-react';
import { AppSettings, WineCatalogItem, WineColor } from '../types/wine';
import {
  computeBottleEconomics,
  formatEUR,
  formatPct,
  normalizeSearchText,
} from '../utils/wineMath';

interface CatalogViewProps {
  catalog: WineCatalogItem[];
  settings: AppSettings;
  onUpdateCatalogItem: (updated: WineCatalogItem) => void;
  onAddCatalogItem: (item: WineCatalogItem) => void;
}

export const CatalogView: React.FC<CatalogViewProps> = ({
  catalog,
  settings,
  onUpdateCatalogItem,
  onAddCatalogItem,
}) => {
  const [search, setSearch] = useState('');
  const [domaineFilter, setDomaineFilter] = useState('all');
  const [isAddOpen, setIsAddOpen] = useState(false);

  // Add form state
  const [newDomaine, setNewDomaine] = useState('');
  const [newCuvee, setNewCuvee] = useState('');
  const [newVente, setNewVente] = useState('Vente Novembre 2026');
  const [newRegion, setNewRegion] = useState('Bourgogne');
  const [newColor, setNewColor] = useState<WineColor>('Blanc');
  const [newAchatHT, setNewAchatHT] = useState('25');
  const [newPrixTTC, setNewPrixTTC] = useState('39');
  const [newBenchTTC, setNewBenchTTC] = useState('48');
  const [newBenchSource, setNewBenchSource] = useState('Caviste');

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
          `${c.domaine} ${c.cuvee} ${c.vente} ${c.region}`
        );
        if (!hay.includes(q)) return false;
      }
      return true;
    });
  }, [catalog, domaineFilter, search]);

  const handleCreate = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newDomaine.trim() || !newCuvee.trim()) return;
    const item: WineCatalogItem = {
      id: `cat_${Date.now()}`,
      vente: newVente.trim() || 'Catalogue général',
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
    };
    onAddCatalogItem(item);
    setNewDomaine('');
    setNewCuvee('');
    setIsAddOpen(false);
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
            Modifiez un prix de vente TTC ou un tarif d’achat HT directement
            dans la grille pour vérifier la marge nette face au marché.
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
                  Achat HT (€)
                </th>
                <th className="py-3 px-3 font-medium text-right">
                  Prix LBG TTC (€)
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
                <th className="py-3 px-5 font-medium text-right">Marge %</th>
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
                      </div>
                    </td>
                    <td className="py-2.5 px-3 text-xs text-[#6B6B66] whitespace-nowrap">
                      {item.vente}
                    </td>
                    <td className="py-2.5 px-3 text-right">
                      <input
                        type="number"
                        step="0.1"
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
                      className={`py-2.5 px-5 text-right font-mono-num text-xs ${
                        econ.margeEuro < 0
                          ? 'text-[#B91C1C] font-semibold'
                          : econ.margePct < 5
                            ? 'text-[#B45309] font-medium'
                            : 'text-[#141413]'
                      }`}
                    >
                      {formatPct(econ.margePct)}
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
                    placeholder="Ex : Domaine Ganevat"
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
                  placeholder="Ex : Les Chalasses Marnes Bleues 2022"
                  className="w-full px-3 py-2 text-sm border border-[#D8D6D0] rounded-lg"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
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
                    <option value="Blanc">Blanc</option>
                    <option value="Rouge">Rouge</option>
                    <option value="Effervescent">Effervescent</option>
                    <option value="Jaune / Oxydatif">Jaune / Oxydatif</option>
                  </select>
                </div>
              </div>

              <div className="grid grid-cols-4 gap-3">
                <div>
                  <label className="block text-xs font-medium text-[#6B6B66] mb-1">
                    Achat HT (€)
                  </label>
                  <input
                    type="number"
                    step="0.1"
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
    </div>
  );
};
