import React, { useMemo, useState } from 'react';
import { Printer, Copy, Check, Search, Wine } from 'lucide-react';
import { AppSettings, StockSummaryRow } from '../types/wine';
import { formatEUR, normalizeSearchText } from '../utils/wineMath';

interface WineListViewProps {
  stockRows: StockSummaryRow[];
  settings: AppSettings;
  onUpdateSettings: (next: AppSettings) => Promise<void>;
}

export const WineListView: React.FC<WineListViewProps> = ({
  stockRows,
  settings,
  onUpdateSettings,
}) => {
  const [search, setSearch] = useState('');
  const [regionFilter, setRegionFilter] = useState<string>('all');
  const [colorFilter, setColorFilter] = useState<string>('all');
  const [onlyAvailable, setOnlyAvailable] = useState(true);
  const [priceMode, setPriceMode] = useState<'ttc' | 'ht'>(
    settings.showcaseDisplayMode ?? 'ttc'
  );
  const [copied, setCopied] = useState(false);

  const visibleWines = useMemo(() => {
    const q = normalizeSearchText(search);
    return stockRows.filter((row) => {
      if (!row.catalog.dispoPublic) return false;
      if (onlyAvailable && row.disponibleVente <= 0) return false;
      if (regionFilter !== 'all' && row.catalog.region !== regionFilter) return false;
      if (colorFilter !== 'all' && row.catalog.color !== colorFilter) return false;
      if (!q) return true;
      const hay = normalizeSearchText(
        `${row.catalog.domaine} ${row.catalog.cuvee} ${row.catalog.region} ${row.catalog.appellation ?? ''} ${row.catalog.millesime ?? ''} ${row.catalog.certification ?? ''}`
      );
      return hay.includes(q);
    });
  }, [stockRows, search, regionFilter, colorFilter, onlyAvailable]);

  const regions = useMemo(() => {
    const s = new Set<string>();
    for (const r of stockRows) if (r.catalog.dispoPublic && r.catalog.region) s.add(r.catalog.region);
    return Array.from(s).sort((a, b) => a.localeCompare(b, 'fr'));
  }, [stockRows]);

  const colors = useMemo(() => {
    const s = new Set<string>();
    for (const r of stockRows) if (r.catalog.dispoPublic && r.catalog.color) s.add(r.catalog.color);
    return Array.from(s).sort((a, b) => a.localeCompare(b, 'fr'));
  }, [stockRows]);

  const groupedByRegion = useMemo(() => {
    const map = new Map<string, StockSummaryRow[]>();
    for (const row of visibleWines) {
      const reg = row.catalog.region || 'Autres terroirs';
      const arr = map.get(reg) ?? [];
      arr.push(row);
      map.set(reg, arr);
    }
    return Array.from(map.entries()).sort((a, b) => a[0].localeCompare(b[0], 'fr'));
  }, [visibleWines]);

  const displayPrice = (ttc: number) =>
    priceMode === 'ht' ? ttc / (1 + settings.tvaRate) : ttc;

  const copyWhatsAppOffer = () => {
    const unitLabel = priceMode === 'ht' ? 'HT' : 'TTC';
    const lines: string[] = [
      `🍷 ${settings.showcaseTitle || "Le Bon Grain d'Ivresse — Sélection"}`,
      settings.showcaseSubtitle ? settings.showcaseSubtitle : '',
      '',
    ];

    for (const [region, rows] of groupedByRegion) {
      lines.push(`*${region.toUpperCase()}*`);
      for (const r of rows) {
        const meta = [r.catalog.millesime, r.catalog.format && r.catalog.format !== '75 cl' ? r.catalog.format : null]
          .filter(Boolean)
          .join(' · ');
        const stockText =
          settings.showcaseShowStock && r.disponibleVente > 0
            ? ` (${r.disponibleVente} btl)`
            : '';
        lines.push(
          `• ${r.catalog.domaine} — ${r.catalog.cuvee}${meta ? ` [${meta}]` : ''} : ${formatEUR(displayPrice(r.catalog.prixLbgTTC))} ${unitLabel}${stockText}`
        );
      }
      lines.push('');
    }

    const contactParts = [
      settings.companyName || "Le Bon Grain d'Ivresse",
      settings.companyPhone,
      settings.companyEmail,
      settings.companyWebsite,
    ].filter(Boolean);
    lines.push(contactParts.join(' · '));

    navigator.clipboard.writeText(lines.join('\n'));
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="space-y-6">
      {/* Controls bar (no-print) */}
      <div className="bg-white border border-[#E5E4DF] rounded-xl p-4 space-y-3 no-print">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div>
            <h1 className="font-serif text-2xl font-semibold text-[#18181B]">
              Carte des vins (Vitrine client &amp; Pro)
            </h1>
            <p className="text-xs text-[#6B6A65]">
              Basculez entre tarifs TTC (Particuliers / Club) et HT (Pros), puis imprimez en PDF ou copiez pour WhatsApp.
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <div className="inline-flex rounded-lg border border-[#E5E4DF] p-0.5 bg-[#F6F6F4] text-xs">
              <button
                onClick={() => {
                  setPriceMode('ttc');
                  onUpdateSettings({ ...settings, showcaseDisplayMode: 'ttc' });
                }}
                className={`px-3 py-1 rounded-md font-medium cursor-pointer ${
                  priceMode === 'ttc'
                    ? 'bg-white text-[#721C24] shadow-xs'
                    : 'text-[#6B6A65]'
                }`}
              >
                TTC (Particuliers)
              </button>
              <button
                onClick={() => {
                  setPriceMode('ht');
                  onUpdateSettings({ ...settings, showcaseDisplayMode: 'ht' });
                }}
                className={`px-3 py-1 rounded-md font-medium cursor-pointer ${
                  priceMode === 'ht'
                    ? 'bg-white text-[#721C24] shadow-xs'
                    : 'text-[#6B6A65]'
                }`}
              >
                HT (Pros)
              </button>
            </div>
            <button
              onClick={copyWhatsAppOffer}
              className="px-3 py-1.5 rounded-lg border border-[#E5E4DF] bg-white hover:bg-[#FAF9F6] text-xs font-medium flex items-center gap-1.5 cursor-pointer"
            >
              {copied ? (
                <Check className="w-3.5 h-3.5 text-[#15803D]" />
              ) : (
                <Copy className="w-3.5 h-3.5" />
              )}
              {copied ? 'Copié' : 'Copier WhatsApp'}
            </button>
            <button
              onClick={() => window.print()}
              className="px-3.5 py-1.5 rounded-lg bg-[#721C24] hover:bg-[#5E161D] text-white text-xs font-medium flex items-center gap-1.5 cursor-pointer"
            >
              <Printer className="w-3.5 h-3.5" />
              Imprimer / PDF
            </button>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-3 pt-2 border-t border-[#E5E4DF]">
          <div className="relative flex-1 min-w-[200px]">
            <Search className="w-3.5 h-3.5 text-[#6B6A65] absolute left-3 top-1/2 -translate-y-1/2" />
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Rechercher domaine, cuvée, appellation…"
              className="w-full pl-8 pr-3 py-1.5 text-xs border border-[#E5E4DF] rounded-lg"
            />
          </div>
          <select
            value={regionFilter}
            onChange={(e) => setRegionFilter(e.target.value)}
            className="text-xs border border-[#E5E4DF] rounded-lg px-2.5 py-1.5 bg-white"
          >
            <option value="all">Toutes régions</option>
            {regions.map((r) => (
              <option key={r} value={r}>
                {r}
              </option>
            ))}
          </select>
          <select
            value={colorFilter}
            onChange={(e) => setColorFilter(e.target.value)}
            className="text-xs border border-[#E5E4DF] rounded-lg px-2.5 py-1.5 bg-white"
          >
            <option value="all">Toutes couleurs</option>
            {colors.map((c) => (
              <option key={c} value={c}>
                {c}
              </option>
            ))}
          </select>
          <label className="flex items-center gap-1.5 text-xs text-[#6B6A65] cursor-pointer">
            <input
              type="checkbox"
              checked={onlyAvailable}
              onChange={(e) => setOnlyAvailable(e.target.checked)}
              className="accent-[#721C24]"
            />
            En stock dispo uniquement
          </label>
        </div>
      </div>

      {/* Editorial Printable Wine Card */}
      <div className="bg-white border border-[#E5E4DF] rounded-xl p-8 sm:p-10 space-y-8">
        <div className="text-center border-b border-[#E5E4DF] pb-6 space-y-2">
          <div className="inline-flex items-center justify-center w-9 h-9 rounded-full bg-[#FDF8F8] text-[#721C24]">
            <Wine className="w-5 h-5" />
          </div>
          <h2 className="font-serif text-3xl sm:text-4xl font-semibold text-[#18181B]">
            {settings.showcaseTitle || "Le Bon Grain d'Ivresse"}
          </h2>
          {settings.showcaseSubtitle && (
            <p className="text-sm text-[#6B6A65] max-w-xl mx-auto">
              {settings.showcaseSubtitle}
            </p>
          )}
          <div className="text-xs uppercase tracking-widest text-[#721C24] font-medium pt-1">
            Tarifs exprimés en euros {priceMode === 'ht' ? 'Hors Taxes (HT — Professionnels)' : 'TTC (Toutes Taxes Comprises)'}
          </div>
        </div>

        <div className="space-y-8">
          {groupedByRegion.map(([region, rows]) => (
            <section key={region} className="space-y-3">
              <h3 className="font-serif text-xl font-semibold text-[#721C24] border-b border-[#E5E4DF] pb-1.5">
                {region}
              </h3>
              <div className="divide-y divide-[#F0EFEA]">
                {rows.map(({ catalog: w, disponibleVente }) => {
                  const shownPrice = displayPrice(w.prixLbgTTC);
                  const benchShown =
                    w.benchTTC && settings.showcaseShowBenchmark
                      ? displayPrice(w.benchTTC)
                      : null;
                  return (
                    <div
                      key={w.id}
                      className="py-3 flex flex-col sm:flex-row sm:items-baseline justify-between gap-2"
                    >
                      <div className="space-y-0.5">
                        <div className="font-medium text-[#18181B]">
                          <span className="font-serif text-lg">{w.domaine}</span>
                          <span className="mx-2 text-[#D6D3CD]">·</span>
                          <span>{w.cuvee}</span>
                        </div>
                        <div className="text-xs text-[#6B6A65]">
                          {[
                            w.appellation,
                            w.millesime,
                            w.color,
                            w.format || '75 cl',
                            w.certification,
                            w.apogee ? `Apogée ${w.apogee}` : null,
                          ]
                            .filter(Boolean)
                            .join(' · ')}
                        </div>
                        {w.tastingNotes && (
                          <p className="text-xs italic text-[#6B6A65] pt-0.5">
                            {w.tastingNotes}
                          </p>
                        )}
                      </div>

                      <div className="text-right shrink-0 flex sm:flex-col items-baseline sm:items-end justify-between gap-2">
                        <div className="font-mono text-base font-semibold text-[#18181B] tabular-nums">
                          {formatEUR(shownPrice)}{' '}
                          <span className="text-[11px] font-normal text-[#6B6A65]">
                            {priceMode.toUpperCase()}
                          </span>
                        </div>
                        <div className="text-[11px] text-[#6B6A65] flex items-center gap-2">
                          {benchShown && (
                            <span className="line-through">
                              Marché {formatEUR(benchShown)}
                            </span>
                          )}
                          {settings.showcaseShowStock && (
                            <span
                              className={
                                disponibleVente > 0
                                  ? 'text-[#15803D] font-medium'
                                  : 'text-[#B45309]'
                              }
                            >
                              {disponibleVente > 0
                                ? `${disponibleVente} btl dispo`
                                : 'Sur allocation'}
                            </span>
                          )}
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </section>
          ))}

          {groupedByRegion.length === 0 && (
            <div className="py-12 text-center text-sm text-[#6B6A65]">
              Aucune cuvée visible avec ces filtres. Activez « Visible carte » dans le Catalogue pour afficher vos cuvées.
            </div>
          )}
        </div>

        {/* Dynamic Contact Footer from Settings (zero hardcoded personal details) */}
        <footer className="pt-6 border-t border-[#E5E4DF] text-center text-xs text-[#6B6A65] space-y-1">
          <div className="font-medium text-[#18181B]">
            {[
              settings.companyName || "Le Bon Grain d'Ivresse",
              settings.companyPhone,
              settings.companyEmail,
              settings.companyWebsite,
            ]
              .filter(Boolean)
              .join(' · ')}
          </div>
          {settings.companyLegalLine && (
            <div className="text-[11px] max-w-2xl mx-auto">
              {settings.companyLegalLine}
            </div>
          )}
        </footer>
      </div>
    </div>
  );
};
