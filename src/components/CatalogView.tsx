import React, { useMemo, useState } from 'react';
import {
  Search,
  Plus,
  Edit3,
  Trash2,
  Eye,
  EyeOff,
  X,
  Info,
} from 'lucide-react';
import {
  AppSettings,
  WineCatalogItem,
  WineCertification,
  WineColor,
  WineFormat,
} from '../types/wine';
import {
  computeBottleEconomics,
  extractVintageFromCuvee,
  formatEUR,
  formatPct,
  normalizeSearchText,
} from '../utils/wineMath';

interface CatalogViewProps {
  catalog: WineCatalogItem[];
  settings: AppSettings;
  onSaveCatalogItem: (item: WineCatalogItem) => Promise<void>;
  onDeleteCatalogItem: (catalogId: string) => Promise<void>;
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

const WINE_FORMATS: WineFormat[] = [
  '37,5 cl',
  '50 cl',
  '62 cl (Clavelin)',
  '75 cl',
  '150 cl (Magnum)',
  '300 cl (Jéroboam)',
];

const WINE_CERTIFICATIONS: WineCertification[] = [
  'Conventionnel',
  'Raisonné',
  'Bio (AB)',
  'Biodynamie',
  'Nature / Sans sulfites',
];

export const CatalogView: React.FC<CatalogViewProps> = ({
  catalog,
  settings,
  onSaveCatalogItem,
  onDeleteCatalogItem,
}) => {
  const [search, setSearch] = useState('');
  const [regionFilter, setRegionFilter] = useState('all');
  const [editing, setEditing] = useState<WineCatalogItem | null>(null);
  const [isNew, setIsNew] = useState(false);

  const regions = useMemo(() => {
    const s = new Set<string>();
    for (const c of catalog) if (c.region) s.add(c.region);
    return Array.from(s).sort((a, b) => a.localeCompare(b, 'fr'));
  }, [catalog]);

  const filtered = useMemo(() => {
    const q = normalizeSearchText(search);
    return catalog.filter((w) => {
      if (regionFilter !== 'all' && w.region !== regionFilter) return false;
      if (!q) return true;
      const hay = normalizeSearchText(
        `${w.domaine} ${w.cuvee} ${w.region} ${w.appellation ?? ''} ${w.millesime ?? ''} ${w.vente} ${w.certification ?? ''}`
      );
      return hay.includes(q);
    });
  }, [catalog, search, regionFilter]);

  const openNewWine = () => {
    setIsNew(true);
    setEditing({
      id: `cat_${Date.now()}`,
      vente: 'Vente directe',
      canal: 'Club',
      domaine: '',
      cuvee: '',
      millesime: '',
      appellation: '',
      format: '75 cl',
      certification: 'Bio (AB)',
      apogee: '',
      fournisseur: '',
      reference: '',
      region: '',
      color: 'Blanc',
      tarifAchatHT: 0,
      prixLbgTTC: 0,
      benchTTC: null,
      benchSource: '',
      dispoPublic: true,
      tastingNotes: '',
      notes: '',
    });
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editing || !editing.domaine.trim() || !editing.cuvee.trim()) return;
    const millesime =
      editing.millesime?.trim() || extractVintageFromCuvee(editing.cuvee);
    await onSaveCatalogItem({
      ...editing,
      millesime: millesime || undefined,
      reference:
        editing.reference.trim() || `${editing.domaine} - ${editing.cuvee}`,
    });
    setEditing(null);
  };

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-4">
        <div>
          <h1 className="font-serif text-3xl font-semibold text-[#18181B]">
            Catalogue &amp; Tarifs
          </h1>
          <p className="text-sm text-[#6B6A65] mt-1">
            Fiches vins enrichies (millésime, appellation, format, certification, apogée) et calcul de marges nettes livrées.
          </p>
        </div>
        <button
          onClick={openNewWine}
          className="px-4 py-2 rounded-lg bg-[#721C24] hover:bg-[#5E161D] text-white text-xs font-medium flex items-center gap-1.5 self-start sm:self-auto cursor-pointer"
        >
          <Plus className="w-4 h-4" />
          Nouvelle cuvée
        </button>
      </div>

      {/* Filters */}
      <div className="bg-white border border-[#E5E4DF] rounded-xl p-4 flex flex-col sm:flex-row gap-3">
        <div className="relative flex-1">
          <Search className="w-4 h-4 text-[#6B6A65] absolute left-3 top-1/2 -translate-y-1/2" />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Rechercher domaine, cuvée, appellation, millésime, certification…"
            className="w-full pl-9 pr-3 py-2 text-sm border border-[#E5E4DF] rounded-lg"
          />
        </div>
        <select
          value={regionFilter}
          onChange={(e) => setRegionFilter(e.target.value)}
          className="px-3 py-2 text-sm border border-[#E5E4DF] rounded-lg bg-white"
        >
          <option value="all">Toutes régions ({regions.length})</option>
          {regions.map((r) => (
            <option key={r} value={r}>
              {r}
            </option>
          ))}
        </select>
      </div>

      {/* Table */}
      <div className="bg-white border border-[#E5E4DF] rounded-xl overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-[#F6F6F4] text-xs text-[#6B6A65] uppercase">
              <tr>
                <th className="text-left py-2.5 px-4 font-medium">
                  Domaine · Cuvée
                </th>
                <th className="text-right py-2.5 px-3 font-medium">Achat EXW HT</th>
                <th className="text-right py-2.5 px-3 font-medium">Prix LBG TTC</th>
                <th className="text-right py-2.5 px-3 font-medium">Marge nette</th>
                <th className="text-right py-2.5 px-3 font-medium">vs Marché</th>
                <th className="text-center py-2.5 px-3 font-medium">Carte</th>
                <th className="text-right py-2.5 px-4 font-medium">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[#E5E4DF]">
              {filtered.map((w) => {
                const econ = computeBottleEconomics(w, settings);
                const vintage = w.millesime || extractVintageFromCuvee(w.cuvee);
                return (
                  <tr key={w.id} className="hover:bg-[#FAF9F6]">
                    <td className="py-2.5 px-4">
                      <div className="font-medium text-[#18181B]">
                        {w.domaine} — {w.cuvee}
                      </div>
                      <div className="text-xs text-[#6B6A65]">
                        {[
                          w.appellation || w.region,
                          vintage,
                          w.format || '75 cl',
                          w.color,
                          w.certification,
                          w.apogee ? `Apogée ${w.apogee}` : null,
                        ]
                          .filter(Boolean)
                          .join(' · ')}
                      </div>
                    </td>
                    <td className="py-2.5 px-3 text-right font-mono tabular-nums">
                      {formatEUR(w.tarifAchatHT)}
                    </td>
                    <td className="py-2.5 px-3 text-right font-mono font-semibold tabular-nums">
                      {formatEUR(w.prixLbgTTC)}
                    </td>
                    <td className="py-2.5 px-3 text-right font-mono tabular-nums whitespace-nowrap">
                      <div
                        className={
                          econ.margeEuro < 0
                            ? 'text-[#B91C1C] font-semibold'
                            : 'text-[#15803D] font-medium'
                        }
                      >
                        {formatEUR(econ.margeEuro, true)}
                      </div>
                      <div className="text-[11px] text-[#6B6A65]">
                        {formatPct(econ.margePct)}
                      </div>
                    </td>
                    <td className="py-2.5 px-3 text-right font-mono text-xs tabular-nums">
                      {econ.vsBenchPct !== null ? (
                        <span
                          className={
                            econ.vsBenchPct <= 0
                              ? 'text-[#15803D]'
                              : 'text-[#B45309]'
                          }
                        >
                          {formatPct(econ.vsBenchPct, true)}
                        </span>
                      ) : (
                        <span className="text-[#6B6A65]">—</span>
                      )}
                    </td>
                    <td className="py-2.5 px-3 text-center">
                      <button
                        onClick={() =>
                          onSaveCatalogItem({ ...w, dispoPublic: !w.dispoPublic })
                        }
                        title={
                          w.dispoPublic
                            ? 'Visible sur la Carte des vins'
                            : 'Masqué de la Carte des vins'
                        }
                        className={`p-1.5 rounded cursor-pointer ${
                          w.dispoPublic
                            ? 'text-[#15803D] hover:bg-[#F0FDF4]'
                            : 'text-[#9CA3AF] hover:bg-[#F6F6F4]'
                        }`}
                      >
                        {w.dispoPublic ? (
                          <Eye className="w-4 h-4" />
                        ) : (
                          <EyeOff className="w-4 h-4" />
                        )}
                      </button>
                    </td>
                    <td className="py-2.5 px-4 text-right whitespace-nowrap">
                      <button
                        onClick={() => {
                          setIsNew(false);
                          setEditing({ ...w });
                        }}
                        className="p-1.5 text-[#6B6A65] hover:text-[#721C24] cursor-pointer"
                      >
                        <Edit3 className="w-3.5 h-3.5" />
                      </button>
                      <button
                        onClick={() => onDeleteCatalogItem(w.id)}
                        className="p-1.5 text-[#6B6A65] hover:text-[#B91C1C] cursor-pointer"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      {/* Add / Edit Wine Modal */}
      {editing && (
        <div className="fixed inset-0 bg-black/45 z-50 flex items-center justify-center p-4">
          <form
            onSubmit={handleSave}
            className="bg-white border border-[#E5E4DF] rounded-xl w-full max-w-2xl max-h-[92vh] overflow-y-auto p-6 space-y-4 text-sm"
          >
            <div className="flex items-center justify-between pb-3 border-b border-[#E5E4DF]">
              <h3 className="font-serif text-xl font-semibold">
                {isNew ? 'Ajouter une cuvée' : `Modifier · ${editing.cuvee}`}
              </h3>
              <button
                type="button"
                onClick={() => setEditing(null)}
                className="p-1 text-[#6B6A65] cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {!isNew && (
              <div className="p-3 rounded-lg bg-[#FAF9F6] border border-[#E5E4DF] text-xs text-[#6B6A65] flex items-start gap-2">
                <Info className="w-4 h-4 text-[#721C24] shrink-0 mt-0.5" />
                <span>
                  La modification du tarif d’achat EXW s’appliquera aux nouvelles commandes sans altérer les marges figées sur les commandes passées.
                </span>
              </div>
            )}

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-medium text-[#6B6A65] mb-1">
                  Domaine *
                </label>
                <input
                  required
                  value={editing.domaine}
                  onChange={(e) =>
                    setEditing({ ...editing, domaine: e.target.value })
                  }
                  className="w-full px-3 py-2 border border-[#E5E4DF] rounded-lg"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-[#6B6A65] mb-1">
                  Cuvée *
                </label>
                <input
                  required
                  value={editing.cuvee}
                  onChange={(e) =>
                    setEditing({ ...editing, cuvee: e.target.value })
                  }
                  className="w-full px-3 py-2 border border-[#E5E4DF] rounded-lg"
                />
              </div>

              <div>
                <label className="block text-xs font-medium text-[#6B6A65] mb-1">
                  Région
                </label>
                <input
                  value={editing.region}
                  onChange={(e) =>
                    setEditing({ ...editing, region: e.target.value })
                  }
                  placeholder="Jura, Bourgogne, Rhône…"
                  className="w-full px-3 py-2 border border-[#E5E4DF] rounded-lg"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-[#6B6A65] mb-1">
                  Appellation (AOC / IGP)
                </label>
                <input
                  value={editing.appellation ?? ''}
                  onChange={(e) =>
                    setEditing({
                      ...editing,
                      appellation: e.target.value || undefined,
                    })
                  }
                  placeholder="Arbois, Chablis 1er Cru, Condrieu…"
                  className="w-full px-3 py-2 border border-[#E5E4DF] rounded-lg"
                />
              </div>

              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="block text-xs font-medium text-[#6B6A65] mb-1">
                    Millésime
                  </label>
                  <input
                    value={editing.millesime ?? ''}
                    onChange={(e) =>
                      setEditing({
                        ...editing,
                        millesime: e.target.value || undefined,
                      })
                    }
                    placeholder="2022 ou NM"
                    className="w-full px-3 py-2 border border-[#E5E4DF] rounded-lg font-mono"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-[#6B6A65] mb-1">
                    Format
                  </label>
                  <select
                    value={editing.format ?? '75 cl'}
                    onChange={(e) =>
                      setEditing({ ...editing, format: e.target.value })
                    }
                    className="w-full px-2 py-2 border border-[#E5E4DF] rounded-lg bg-white text-xs"
                  >
                    {WINE_FORMATS.map((f) => (
                      <option key={f} value={f}>
                        {f}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="block text-xs font-medium text-[#6B6A65] mb-1">
                    Couleur
                  </label>
                  <select
                    value={editing.color}
                    onChange={(e) =>
                      setEditing({
                        ...editing,
                        color: e.target.value as WineColor,
                      })
                    }
                    className="w-full px-2 py-2 border border-[#E5E4DF] rounded-lg bg-white text-xs"
                  >
                    {WINE_COLORS.map((c) => (
                      <option key={c} value={c}>
                        {c}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-medium text-[#6B6A65] mb-1">
                    Culture / Certif.
                  </label>
                  <select
                    value={editing.certification ?? ''}
                    onChange={(e) =>
                      setEditing({
                        ...editing,
                        certification: e.target.value || undefined,
                      })
                    }
                    className="w-full px-2 py-2 border border-[#E5E4DF] rounded-lg bg-white text-xs"
                  >
                    <option value="">Non précisé</option>
                    {WINE_CERTIFICATIONS.map((c) => (
                      <option key={c} value={c}>
                        {c}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              <div>
                <label className="block text-xs font-medium text-[#6B6A65] mb-1">
                  Apogée / Fenêtre de garde
                </label>
                <input
                  value={editing.apogee ?? ''}
                  onChange={(e) =>
                    setEditing({
                      ...editing,
                      apogee: e.target.value || undefined,
                    })
                  }
                  placeholder="2026–2035"
                  className="w-full px-3 py-2 border border-[#E5E4DF] rounded-lg"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-[#6B6A65] mb-1">
                  Fournisseur / Agent (si différent du domaine)
                </label>
                <input
                  value={editing.fournisseur ?? ''}
                  onChange={(e) =>
                    setEditing({
                      ...editing,
                      fournisseur: e.target.value || undefined,
                    })
                  }
                  className="w-full px-3 py-2 border border-[#E5E4DF] rounded-lg"
                />
              </div>

              <div className="grid grid-cols-3 gap-2 sm:col-span-2 pt-2 border-t border-[#E5E4DF]">
                <div>
                  <label className="block text-xs font-medium text-[#6B6A65] mb-1">
                    Achat EXW HT (€)
                  </label>
                  <input
                    type="number"
                    min="0"
                    step="0.01"
                    value={editing.tarifAchatHT}
                    onChange={(e) =>
                      setEditing({
                        ...editing,
                        tarifAchatHT: Math.max(0, Number(e.target.value) || 0),
                      })
                    }
                    className="w-full px-3 py-2 border border-[#E5E4DF] rounded-lg font-mono"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-[#6B6A65] mb-1">
                    Prix vente LBG TTC (€)
                  </label>
                  <input
                    type="number"
                    min="0"
                    step="0.1"
                    value={editing.prixLbgTTC}
                    onChange={(e) =>
                      setEditing({
                        ...editing,
                        prixLbgTTC: Math.max(0, Number(e.target.value) || 0),
                      })
                    }
                    className="w-full px-3 py-2 border border-[#E5E4DF] rounded-lg font-mono"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-[#6B6A65] mb-1">
                    Benchmark marché TTC (€)
                  </label>
                  <input
                    type="number"
                    min="0"
                    step="0.5"
                    value={editing.benchTTC ?? ''}
                    onChange={(e) =>
                      setEditing({
                        ...editing,
                        benchTTC: e.target.value ? Number(e.target.value) : null,
                      })
                    }
                    className="w-full px-3 py-2 border border-[#E5E4DF] rounded-lg font-mono"
                  />
                </div>
              </div>

              <div className="sm:col-span-2">
                <label className="block text-xs font-medium text-[#6B6A65] mb-1">
                  Note de dégustation publique (affichée sur la Carte des vins)
                </label>
                <textarea
                  rows={2}
                  value={editing.tastingNotes ?? ''}
                  onChange={(e) =>
                    setEditing({
                      ...editing,
                      tastingNotes: e.target.value || undefined,
                    })
                  }
                  className="w-full px-3 py-2 border border-[#E5E4DF] rounded-lg"
                />
              </div>

              <div className="sm:col-span-2">
                <label className="block text-xs font-medium text-[#6B6A65] mb-1">
                  Note interne confidentielle (jamais exposée aux clients)
                </label>
                <input
                  value={editing.notes ?? ''}
                  onChange={(e) =>
                    setEditing({
                      ...editing,
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
                onClick={() => setEditing(null)}
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
    </div>
  );
};
