import React from 'react';
import { FileSpreadsheet, RotateCcw, Sparkles, Upload } from 'lucide-react';

interface DataSourceBannerProps {
  isDemoMode: boolean;
  onEnableDemoMode: () => void;
  onDisableDemoMode: () => void;
  onOpenInvoiceAI?: () => void;
  catalogCount?: number;
  variant?: 'dashboard' | 'stock';
}

/**
 * Bandeau explicatif indiquant de façon transparente si l'écran affiche
 * strictement les données du tableur Excel LBG ou le scénario Démo enrichi.
 */
export const DataSourceBanner: React.FC<DataSourceBannerProps> = ({
  isDemoMode,
  onEnableDemoMode,
  onDisableDemoMode,
  onOpenInvoiceAI,
  catalogCount,
  variant = 'dashboard',
}) => {
  if (isDemoMode) {
    return (
      <div className="bg-[#721C24]/[0.05] border border-[#721C24]/25 rounded-xl px-4 py-3.5 flex flex-col lg:flex-row lg:items-center justify-between gap-3">
        <div className="flex items-start gap-3">
          <Sparkles className="w-4 h-4 text-[#721C24] mt-0.5 shrink-0" />
          <div className="text-xs leading-relaxed text-[#141413]">
            <span className="font-semibold text-[#721C24]">
              Mode Démo avancé actif :
            </span>{' '}
            {variant === 'stock'
              ? 'des lots fictifs (commandes Tissot payées, caisses d’avance Sursis/Pataille/Belargus et transit Deiss) ont été ajoutés pour illustrer les réceptions FIFO et alertes.'
              : 'vos données Excel sont complétées par des achats domaines fictifs (Tissot commandé, stocks d’avance Pataille/Belargus, transit Deiss) pour explorer toutes les fonctions.'}
          </div>
        </div>
        <button
          type="button"
          onClick={onDisableDemoMode}
          className="inline-flex items-center justify-center gap-1.5 px-3 py-1.5 text-xs font-medium text-[#721C24] bg-white hover:bg-[#FAF9F7] border border-[#721C24]/30 rounded-lg transition-colors whitespace-nowrap shrink-0"
        >
          <RotateCcw className="w-3.5 h-3.5" />
          <span>Revenir aux données Excel strictes</span>
        </button>
      </div>
    );
  }

  return (
    <div className="bg-[#FAF9F7] border border-[#E5E4DF] rounded-xl px-4 py-3.5 flex flex-col lg:flex-row lg:items-center justify-between gap-3">
      <div className="flex items-start gap-3">
        <FileSpreadsheet className="w-4 h-4 text-[#15803D] mt-0.5 shrink-0" />
        <div className="text-xs leading-relaxed text-[#4A4A45]">
          <span className="font-semibold text-[#141413]">
            Mode Données exactes de votre Excel
            {catalogCount ? ` (${catalogCount} cuvées Tarifs)` : ''} :
          </span>{' '}
          {variant === 'stock'
            ? 'le stock cave provient uniquement de vos 6 lignes Dispos (Pattes-Loup 2024) et du statut « Reçu par LBG » (col. K). Aucune facture domaine n’étant dans l’Excel, Tissot affiche le besoin réel à commander.'
            : 'vous retrouvez 100 % de vos tarifs, ventes HelloAsso/Historique, Dispos Pattes-Loup et planning, sans stock inventé. Les lignes anciennes sans colonne K (Vernay, Geoffroy) sont classées Remis client.'}
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-2 shrink-0">
        {onOpenInvoiceAI && (
          <button
            type="button"
            onClick={onOpenInvoiceAI}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-[#141413] bg-white hover:bg-[#F3F1EC] border border-[#D8D6D0] rounded-lg transition-colors whitespace-nowrap"
          >
            <Upload className="w-3.5 h-3.5 text-[#721C24]" />
            <span>Importer une facture domaine</span>
          </button>
        )}
        <button
          type="button"
          onClick={onEnableDemoMode}
          className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-[#721C24] bg-white hover:bg-[#721C24]/5 border border-[#721C24]/30 rounded-lg transition-colors whitespace-nowrap"
        >
          <Sparkles className="w-3.5 h-3.5" />
          <span>Ajouter des données démo (+ stocks/avances)</span>
        </button>
      </div>
    </div>
  );
};
