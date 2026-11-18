import React, { useMemo, useState } from 'react';
import { Check, Copy, Eye, Printer, Search, Sliders } from 'lucide-react';
import {
  AppSettings,
  StockSummaryRow,
  WineCatalogItem,
} from '../types/wine';
import {
  computeBottleEconomics,
  formatEUR,
  formatPct,
  normalizeSearchText,
} from '../utils/wineMath';

interface WineListViewProps {
  catalog: WineCatalogItem[];
  stockRows: StockSummaryRow[];
  settings: AppSettings;
  onUpdateCatalogItem: (updated: WineCatalogItem) => void;
  onBatchUpdateCatalog: (
    updater: (prev: WineCatalogItem[]) => WineCatalogItem[]
  ) => void;
  onUpdateSettings: (next: AppSettings) => void;
}

export const WineListView: React.FC<WineListViewProps> = ({
  catalog,
  stockRows,
  settings,
  onUpdateCatalogItem,
  onBatchUpdateCatalog,
  onUpdateSettings,
}) => {
  const [mode, setMode] = useState<'curate' | 'showcase'>('showcase');
  const [regionFilter, setRegionFilter] = useState<string>('all');
  const [colorFilter, setColorFilter] = useState<string>('all');
  const [onlyInStock, setOnlyInStock] = useState(false);
  const [search, setSearch] = useState('');
  const [copiedCard, setCopiedCard] = useState(false);

  const stockMap = useMemo(
    () => new Map(stockRows.map((r) => [r.catalog.id, r])),
    [stockRows]
  );

  const regions = useMemo(
    () => Array.from(new Set(catalog.map((c) => c.region))).sort(),
    [catalog]
  );

  const selectedWines = useMemo(
    () => catalog.filter((c) => c.dispoPublic),
    [catalog]
  );

  const curateWines = useMemo(() => {
    const q = normalizeSearchText(search);
    if (!q) return catalog;
    return catalog.filter((w) => {
      const hay = normalizeSearchText(
        `${w.domaine} ${w.cuvee} ${w.region} ${w.tastingNotes ?? ''}`
      );
      return hay.includes(q);
    });
  }, [catalog, search]);

  const showcaseWines = useMemo(() => {
    const q = normalizeSearchText(search);
    return selectedWines.filter((w) => {
      if (onlyInStock && (stockMap.get(w.id)?.disponibleVente ?? 0) <= 0) {
        return false;
      }
      if (regionFilter !== 'all' && w.region !== regionFilter) return false;
      if (colorFilter !== 'all' && w.color !== colorFilter) return false;
      if (q) {
        const hay = normalizeSearchText(
          `${w.domaine} ${w.cuvee} ${w.region} ${w.tastingNotes ?? ''}`
        );
        if (!hay.includes(q)) return false;
      }
      return true;
    });
  }, [selectedWines, onlyInStock, stockMap, regionFilter, colorFilter, search]);

  const groupedByRegion = useMemo(() => {
    const map = new Map<string, WineCatalogItem[]>();
    for (const w of showcaseWines) {
      const arr = map.get(w.region) ?? [];
      arr.push(w);
      map.set(w.region, arr);
    }
    return Array.from(map.entries()).sort((a, b) => a[0].localeCompare(b[0]));
  }, [showcaseWines]);

  const handleSelectAvailableOnly = () => {
    onBatchUpdateCatalog((prev) =>
      prev.map((item) => {
        const stock = stockMap.get(item.id);
        return {
          ...item,
          dispoPublic: (stock?.disponibleVente ?? 0) > 0,
        };
      })
    );
  };

  const handleToggleAll = (visible: boolean) => {
    onBatchUpdateCatalog((prev) =>
      prev.map((item) => ({ ...item, dispoPublic: visible }))
    );
  };

  const handleCopyWineListText = () => {
    const title =
      settings.showcaseTitle || 'CARTE DES VINS — LE BON GRAIN D’IVRESSE';
    const lines: string[] = [title, ''];

    groupedByRegion.forEach(([region, items]) => {
      lines.push(`— ${region.toUpperCase()} —`);
      items.forEach((item) => {
        const stock = stockMap.get(item.id);
        const econ = computeBottleEconomics(item, settings);
        const stockText =
          settings.showcaseShowStock !== false && stock && stock.disponibleVente > 0
            ? ` (${stock.disponibleVente} btl dispo)`
            : '';
        const benchText =
          settings.showcaseShowBenchmark &&
          econ.vsBenchPct !== null &&
          econ.vsBenchPct < -2
            ? ` [${formatPct(econ.vsBenchPct, true)} vs caviste]`
            : '';
        lines.push(
          `• ${item.domaine} — ${item.cuvee} : ${formatEUR(item.prixLbgTTC)}${stockText}${benchText}`
        );
        if (item.tastingNotes) {
          lines.push(`  ${item.tastingNotes}`);
        }
      });
      lines.push('');
    });

    lines.push('Commandes & réservations : Romain Becker · 06 86 53 19 07');
    navigator.clipboard.writeText(lines.join('\n'));
    setCopiedCard(true);
    setTimeout(() => setCopiedCard(false), 2000);
  };

  return (
    <div className="space-y-6">
      {/* Header Toolbar */}
      <div className="flex flex-col lg:flex-row lg:items-end justify-between gap-4 no-print">
        <div>
          <h1 className="font-display text-3xl font-semibold text-[#141413] tracking-tight">
            Carte des vins &amp; Vitrine
          </h1>
          <p className="text-sm text-[#6B6B66] mt-1">
            Choisissez librement les cuvées à exposer à vos clients et partagez
            une carte claire sur WhatsApp, par email ou en PDF.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2.5">
          <div className="flex items-center gap-1 p-1 bg-white border border-[#E5E4DF] rounded-lg">
            <button
              onClick={() => setMode('showcase')}
              className={`inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-md transition-colors ${
                mode === 'showcase'
                  ? 'bg-[#721C24] text-white'
                  : 'text-[#6B6B66] hover:text-[#141413]'
              }`}
            >
              <Eye className="w-3.5 h-3.5" />
              <span>Aperçu Vitrine ({selectedWines.length})</span>
            </button>
            <button
              onClick={() => setMode('curate')}
              className={`inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-md transition-colors ${
                mode === 'curate'
                  ? 'bg-[#721C24] text-white'
                  : 'text-[#6B6B66] hover:text-[#141413]'
              }`}
            >
              <Sliders className="w-3.5 h-3.5" />
              <span>Choisir les cuvées</span>
            </button>
          </div>

          <button
            onClick={handleCopyWineListText}
            className="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-medium text-[#141413] bg-white hover:bg-[#F6F6F4] border border-[#D8D6D0] rounded-lg transition-colors whitespace-nowrap"
          >
            {copiedCard ? (
              <Check className="w-3.5 h-3.5 text-[#15803D]" />
            ) : (
              <Copy className="w-3.5 h-3.5" />
            )}
            <span>
              {copiedCard ? 'Carte copiée !' : 'Copier pour WhatsApp / Mail'}
            </span>
          </button>

          <button
            onClick={() => window.print()}
            className="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-medium text-white bg-[#141413] hover:bg-[#2A2A28] rounded-lg transition-colors whitespace-nowrap"
          >
            <Printer className="w-3.5 h-3.5" />
            <span>Imprimer / PDF</span>
          </button>
        </div>
      </div>

      {/* Mode 1: Curate Selection */}
      {mode === 'curate' && (
        <div className="space-y-4">
          <div className="bg-white border border-[#E5E4DF] rounded-xl p-5 space-y-4">
            <div className="flex flex-wrap items-center justify-between gap-4 border-b border-[#ECEAE4] pb-4">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3 flex-1">
                <div>
                  <label className="block text-xs font-medium text-[#6B6B66] mb-1">
                    Titre de la vitrine
                  </label>
                  <input
                    type="text"
                    value={
                      settings.showcaseTitle ??
                      'Sélection de Cave & Allocations — Automne 2026'
                    }
                    onChange={(e) =>
                      onUpdateSettings({
                        ...settings,
                        showcaseTitle: e.target.value,
                      })
                    }
                    className="w-full px-3 py-1.5 text-sm border border-[#D8D6D0] rounded-lg"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-[#6B6B66] mb-1">
                    Sous-titre / Note aux amateurs
                  </label>
                  <input
                    type="text"
                    value={
                      settings.showcaseSubtitle ??
                      'Bouteilles disponibles immédiatement en cave ou sur allocation domaine.'
                    }
                    onChange={(e) =>
                      onUpdateSettings({
                        ...settings,
                        showcaseSubtitle: e.target.value,
                      })
                    }
                    className="w-full px-3 py-1.5 text-sm border border-[#D8D6D0] rounded-lg"
                  />
                </div>
              </div>

              <div className="flex flex-wrap items-center gap-4 text-xs text-[#141413]">
                <label className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={settings.showcaseShowStock !== false}
                    onChange={(e) =>
                      onUpdateSettings({
                        ...settings,
                        showcaseShowStock: e.target.checked,
                      })
                    }
                    className="rounded border-[#D8D6D0]"
                  />
                  <span>Afficher les quantités dispos</span>
                </label>
                <label className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={Boolean(settings.showcaseShowBenchmark)}
                    onChange={(e) =>
                      onUpdateSettings({
                        ...settings,
                        showcaseShowBenchmark: e.target.checked,
                      })
                    }
                    className="rounded border-[#D8D6D0]"
                  />
                  <span>Afficher écart prix caviste</span>
                </label>
              </div>
            </div>

            <div className="flex flex-wrap items-center justify-between gap-3">
              <div className="flex flex-wrap items-center gap-3">
                <div className="text-xs text-[#6B6B66]">
                  <span className="font-semibold text-[#141413]">
                    {selectedWines.length}
                  </span>{' '}
                  cuvée(s) sélectionnée(s) sur {catalog.length}
                </div>
                <div className="relative">
                  <Search className="w-3.5 h-3.5 text-[#6B6B66] absolute left-2.5 top-1/2 -translate-y-1/2" />
                  <input
                    type="text"
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                    placeholder="Filtrer une cuvée..."
                    className="pl-8 pr-3 py-1.5 text-xs bg-[#FAF9F7] border border-[#D8D6D0] rounded-lg w-48"
                  />
                </div>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <button
                  type="button"
                  onClick={handleSelectAvailableOnly}
                  className="px-3 py-1.5 text-xs font-medium text-[#15803D] bg-[#F0FDF4] hover:bg-[#DCFCE7] border border-[#BBF7D0] rounded-md"
                >
                  Uniquement celles en stock libre
                </button>
                <button
                  type="button"
                  onClick={() => handleToggleAll(true)}
                  className="px-3 py-1.5 text-xs font-medium text-[#141413] bg-[#F6F6F4] hover:bg-[#ECEAE4] rounded-md"
                >
                  Tout cocher
                </button>
                <button
                  type="button"
                  onClick={() => handleToggleAll(false)}
                  className="px-3 py-1.5 text-xs font-medium text-[#6B6B66] bg-[#F6F6F4] hover:bg-[#ECEAE4] rounded-md"
                >
                  Tout décocher
                </button>
              </div>
            </div>
          </div>

          <div className="bg-white border border-[#E5E4DF] rounded-xl overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse text-sm">
                <thead>
                  <tr className="bg-[#FAF9F7] text-xs text-[#6B6B66] border-b border-[#E5E4DF]">
                    <th className="py-3 px-4 font-medium w-16 text-center">
                      Carte
                    </th>
                    <th className="py-3 px-4 font-medium">Domaine &amp; Cuvée</th>
                    <th className="py-3 px-4 font-medium">
                      Texte de présentation (vitrine)
                    </th>
                    <th className="py-3 px-4 font-medium text-right">
                      Dispo cave
                    </th>
                    <th className="py-3 px-5 font-medium text-right">
                      Prix TTC
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[#ECEAE4]">
                  {curateWines.map((item) => {
                    const stock = stockMap.get(item.id);
                    const dispo = stock?.disponibleVente ?? 0;
                    return (
                      <tr
                        key={item.id}
                        className={`transition-colors ${
                          item.dispoPublic ? 'bg-white' : 'bg-[#FAF9F7]/70 opacity-70'
                        }`}
                      >
                        <td className="py-3 px-4 text-center">
                          <input
                            type="checkbox"
                            checked={item.dispoPublic}
                            onChange={(e) =>
                              onUpdateCatalogItem({
                                ...item,
                                dispoPublic: e.target.checked,
                              })
                            }
                            className="w-4 h-4 rounded border-[#D8D6D0] text-[#721C24] focus:ring-[#721C24] cursor-pointer"
                          />
                        </td>
                        <td className="py-3 px-4">
                          <div className="font-medium text-[#141413]">
                            {item.cuvee}
                          </div>
                          <div className="text-xs text-[#6B6B66]">
                            {item.domaine} · {item.region} · {item.color}
                          </div>
                        </td>
                        <td className="py-3 px-4">
                          <input
                            type="text"
                            value={item.tastingNotes ?? ''}
                            onChange={(e) =>
                              onUpdateCatalogItem({
                                ...item,
                                tastingNotes: e.target.value,
                              })
                            }
                            placeholder="Ajouter une note de dégustation publique..."
                            className="w-full min-w-[220px] px-2.5 py-1.5 text-xs bg-[#FAF9F7] border border-[#D8D6D0] rounded focus:outline-none focus:border-[#721C24] focus:bg-white"
                          />
                        </td>
                        <td className="py-3 px-4 text-right font-mono-num text-xs">
                          {dispo > 0 ? (
                            <span className="text-[#15803D] font-medium">
                              {dispo} btl
                            </span>
                          ) : (
                            <span className="text-[#6B6B66]">0</span>
                          )}
                        </td>
                        <td className="py-3 px-5 text-right font-mono-num font-semibold">
                          {formatEUR(item.prixLbgTTC)}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* Mode 2: Public Vitrine Showcase */}
      {mode === 'showcase' && (
        <div className="space-y-6">
          {/* Showcase Filters */}
          <div className="flex flex-wrap items-center justify-between gap-3 bg-white border border-[#E5E4DF] rounded-xl p-3.5 no-print">
            <div className="flex flex-wrap items-center gap-2 max-w-full">
              <select
                value={regionFilter}
                onChange={(e) => setRegionFilter(e.target.value)}
                className="px-3 py-1.5 text-xs bg-[#FAF9F7] border border-[#D8D6D0] rounded-lg max-w-full"
              >
                <option value="all">Toutes les régions ({regions.length})</option>
                {regions.map((r) => (
                  <option key={r} value={r}>
                    {r}
                  </option>
                ))}
              </select>

              <div className="flex flex-wrap items-center gap-1 p-1 bg-[#F6F6F4] rounded-lg max-w-full">
                {(
                  [
                    'all',
                    'Blanc',
                    'Rouge',
                    'Rosé',
                    'Orange',
                    'Effervescent',
                    'Jaune / Oxydatif',
                    'Doux / Liquoreux',
                  ] as const
                ).map(
                  (col) => (
                    <button
                      key={col}
                      onClick={() => setColorFilter(col)}
                      className={`px-2.5 py-1 text-xs font-medium rounded transition-colors whitespace-nowrap ${
                        colorFilter === col
                          ? 'bg-white text-[#141413] shadow-sm'
                          : 'text-[#6B6B66] hover:text-[#141413]'
                      }`}
                    >
                      {col === 'all' ? 'Toutes couleurs' : col}
                    </button>
                  )
                )}
              </div>

              <button
                type="button"
                onClick={() => setOnlyInStock((v) => !v)}
                className={`px-2.5 py-1.5 text-xs font-medium rounded-lg border transition-colors whitespace-nowrap ${
                  onlyInStock
                    ? 'bg-[#15803D] text-white border-[#15803D]'
                    : 'bg-[#FAF9F7] text-[#4A4A45] border-[#D8D6D0] hover:bg-[#F3F1EC]'
                }`}
              >
                En stock dispo uniquement
              </button>
            </div>

            <div className="relative w-full sm:w-52">
              <Search className="w-3.5 h-3.5 text-[#6B6B66] absolute left-3 top-1/2 -translate-y-1/2" />
              <input
                type="text"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Filtrer domaine ou cuvée..."
                className="pl-8 pr-3 py-1.5 text-xs bg-[#FAF9F7] border border-[#D8D6D0] rounded-lg w-full"
              />
            </div>
          </div>

          {/* Editorial Wine List Card */}
          <div className="bg-white border border-[#E5E4DF] rounded-xl px-5 py-7 sm:px-8 sm:py-10 md:px-12 max-w-4xl mx-auto">
            <div className="text-center border-b border-[#E5E4DF] pb-8 mb-8">
              <img
                src="/logo-lbg.png"
                alt="Le Bon Grain d’Ivresse"
                className="w-16 h-16 rounded-xl object-cover mx-auto mb-3 shadow-sm border border-[#E5E4DF]"
              />
              <div className="text-xs tracking-widest text-[#721C24] font-medium uppercase">
                Le Bon Grain d’Ivresse
              </div>
              <h2 className="font-display text-3xl md:text-4xl font-semibold text-[#141413] mt-2 text-balance">
                {settings.showcaseTitle ||
                  'Sélection de Cave & Allocations — Automne 2026'}
              </h2>
              <p className="text-sm text-[#6B6B66] mt-2 max-w-xl mx-auto">
                {settings.showcaseSubtitle ||
                  'Bouteilles disponibles immédiatement en cave ou sur allocation domaine.'}
              </p>
            </div>

            {groupedByRegion.length > 0 ? (
              <div className="space-y-10">
                {groupedByRegion.map(([region, items]) => (
                  <section key={region} className="space-y-4">
                    <h3 className="font-display text-xl font-semibold text-[#721C24] border-b border-[#ECEAE4] pb-2">
                      {region}
                    </h3>
                    <div className="divide-y divide-[#F0EFEA]">
                      {items.map((item) => {
                        const stock = stockMap.get(item.id);
                        const dispo = stock?.disponibleVente ?? 0;
                        const econ = computeBottleEconomics(item, settings);

                        return (
                          <div
                            key={item.id}
                            className="py-3.5 flex flex-col sm:flex-row sm:items-baseline justify-between gap-2"
                          >
                            <div className="space-y-0.5 max-w-xl">
                              <div className="flex flex-wrap items-baseline gap-2">
                                <span className="font-semibold text-[#141413]">
                                  {item.domaine}
                                </span>
                                <span className="text-[#141413]">
                                  — {item.cuvee}
                                </span>
                                <span className="text-xs text-[#6B6B66]">
                                  · {item.color}
                                </span>
                              </div>
                              {item.tastingNotes && (
                                <p className="text-xs text-[#6B6B66]">
                                  {item.tastingNotes}
                                </p>
                              )}
                            </div>

                            <div className="flex items-baseline gap-4 shrink-0 sm:text-right">
                              {settings.showcaseShowStock !== false && (
                                <span
                                  className={`text-xs font-mono-num ${
                                    dispo > 0
                                      ? 'text-[#15803D]'
                                      : 'text-[#6B6B66]'
                                  }`}
                                >
                                  {dispo > 0
                                    ? `${dispo} btl dispo`
                                    : 'Sur allocation'}
                                </span>
                              )}

                              {settings.showcaseShowBenchmark &&
                                econ.vsBenchPct !== null &&
                                econ.vsBenchPct < -2 && (
                                  <span className="text-xs font-mono-num text-[#721C24]">
                                    {formatPct(econ.vsBenchPct, true)} vs{' '}
                                    {item.benchSource}
                                  </span>
                                )}

                              <span className="text-base font-semibold font-mono-num text-[#141413] min-w-[68px] text-right">
                                {formatEUR(item.prixLbgTTC)}
                              </span>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </section>
                ))}
              </div>
            ) : (
              <div className="py-12 text-center text-sm text-[#6B6B66]">
                Aucune cuvée sélectionnée pour la vitrine. Cliquez sur « Choisir
                les cuvées » pour composer votre carte.
              </div>
            )}

            <div className="mt-10 pt-6 border-t border-[#E5E4DF] flex flex-col sm:flex-row items-center justify-between gap-2 text-xs text-[#6B6B66]">
              <span>Romain Becker · www.lebongraindelivresse.com</span>
              <span>Réservations : romain.becker@live.fr · 06 86 53 19 07</span>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
