import React, { useMemo, useState } from 'react';
import * as XLSX from 'xlsx';
import {
  AlertTriangle,
  Check,
  ClipboardPaste,
  FileSpreadsheet,
  Upload,
  X,
} from 'lucide-react';
import { OrderLine, OrderStatus, WineCatalogItem } from '../types/wine';
import {
  groupParsedRowsToOrderLines,
  ParsedHelloAssoRow,
  parseHelloAssoText,
} from '../utils/helloAssoParser';
import { SAMPLE_HELLOASSO_PASTE } from '../data/seedData';
import { formatDateFR, formatEUR } from '../utils/wineMath';

interface ImportHelloAssoModalProps {
  isOpen: boolean;
  onClose: () => void;
  catalog: WineCatalogItem[];
  existingRefs: Set<string>;
  onImportOrders: (
    newOrders: OrderLine[],
    newCatalogItems: WineCatalogItem[]
  ) => void;
}

export const ImportHelloAssoModal: React.FC<ImportHelloAssoModalProps> = ({
  isOpen,
  onClose,
  catalog,
  existingRefs,
  onImportOrders,
}) => {
  const [rawText, setRawText] = useState('');
  const [defaultVente, setDefaultVente] = useState('Vente Novembre 2026');
  const [defaultStatus, setDefaultStatus] =
    useState<OrderStatus>('attente_reception');
  const [manualMatchOverrides, setManualMatchOverrides] = useState<
    Record<number, string>
  >({});
  const [skipDuplicates, setSkipDuplicates] = useState(true);
  const [fileError, setFileError] = useState<string | null>(null);

  const parsedRows: ParsedHelloAssoRow[] = useMemo(() => {
    if (!rawText.trim()) return [];
    const base = parseHelloAssoText(rawText, catalog);
    return base.map((row) => {
      const overrideId = manualMatchOverrides[row.rowIndex];
      if (overrideId) {
        const found = catalog.find((c) => c.id === overrideId) ?? null;
        return {
          ...row,
          matchedCatalog: found,
          confidence: found ? 'exact' : row.confidence,
        };
      }
      return row;
    });
  }, [rawText, catalog, manualMatchOverrides]);

  const stats = useMemo(() => {
    const valid = parsedRows.filter((r) => r.mappedStatus !== 'annule');
    const cancelled = parsedRows.filter((r) => r.mappedStatus === 'annule');
    const duplicates = parsedRows.filter((r) => existingRefs.has(r.refCommande));
    const importableRows = skipDuplicates
      ? parsedRows.filter((r) => !existingRefs.has(r.refCommande))
      : parsedRows;
    const importableValid = importableRows.filter(
      (r) => r.mappedStatus !== 'annule'
    );
    const unmatched = importableValid.filter((r) => !r.matchedCatalog);
    const totalTTC = importableValid.reduce((s, r) => s + r.montantTTC, 0);
    return {
      totalRows: parsedRows.length,
      validCount: valid.length,
      importableCount: importableValid.length,
      importableAllCount: importableRows.length,
      cancelledCount: cancelled.length,
      unmatchedCount: unmatched.length,
      duplicateCount: duplicates.length,
      totalTTC,
    };
  }, [parsedRows, existingRefs, skipDuplicates]);

  if (!isOpen) return null;

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    setFileError(null);
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      const ext = file.name.split('.').pop()?.toLowerCase();
      if (ext === 'csv' || ext === 'tsv' || ext === 'txt') {
        const text = await file.text();
        setRawText(text);
      } else {
        const buf = await file.arrayBuffer();
        const wb = XLSX.read(buf, { type: 'array' });
        const sheetName =
          wb.SheetNames.find((n) => n.toLowerCase().includes('helloasso')) ||
          wb.SheetNames[0];
        const ws = wb.Sheets[sheetName];
        const tsv = XLSX.utils.sheet_to_csv(ws, { FS: '\t' });
        setRawText(tsv);
      }
    } catch {
      setFileError(
        "Impossible de lire ce fichier. Essayez un export CSV/XLSX HelloAsso ou copiez-collez les lignes depuis Excel."
      );
    }
  };

  const handleConfirmImport = () => {
    const filteredRows = skipDuplicates
      ? parsedRows.filter((r) => !existingRefs.has(r.refCommande))
      : parsedRows;

    // Auto-create lightweight catalog entries for unmatched cuvées so nothing gets lost
    const createdCatalog: WineCatalogItem[] = [];
    const createdByCleanName = new Map<string, WineCatalogItem>();

    const resolvedRows = filteredRows.map((row) => {
      if (row.matchedCatalog) return row;
      const key = row.cleanCuveeName.toLowerCase();
      let cat = createdByCleanName.get(key);
      if (!cat) {
        const estimatedExw = Math.max(
          0,
          Number((((row.montantTTC / 1.2) - 4.5) * 0.9).toFixed(2))
        );
        cat = {
          id: `cat_auto_${Date.now()}_${createdCatalog.length}`,
          vente: defaultVente,
          domaine: 'Domaine à préciser',
          cuvee: row.cleanCuveeName,
          reference: row.cleanCuveeName,
          region: 'À classer',
          color: 'Blanc',
          tarifAchatHT: estimatedExw,
          prixLbgTTC: row.montantTTC,
          benchTTC: null,
          benchSource: 'À renseigner',
          dispoPublic: false,
          notes:
            "Créée automatiquement lors de l'import HelloAsso (vérifier EXW HT, domaine et région).",
        };
        createdCatalog.push(cat);
        createdByCleanName.set(key, cat);
      }
      return {
        ...row,
        matchedCatalog: cat,
        confidence: 'exact' as const,
      };
    });

    const newOrders = groupParsedRowsToOrderLines(
      resolvedRows,
      defaultVente,
      defaultStatus
    );

    onImportOrders(newOrders, createdCatalog);
    setRawText('');
    setManualMatchOverrides({});
    onClose();
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/45 p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="import-modal-title"
    >
      <div className="w-full max-w-5xl max-h-[90vh] flex flex-col bg-white border border-[#E5E4DF] rounded-xl shadow-2xl overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-[#E5E4DF]">
          <div>
            <h2
              id="import-modal-title"
              className="text-xl font-semibold text-[#141413]"
            >
              Importer un listing HelloAsso
            </h2>
            <p className="text-sm text-[#6B6B66] mt-0.5">
              Collez directement vos lignes copiées depuis Excel / HelloAsso ou
              déposez un fichier .xlsx / .csv.
            </p>
          </div>
          <button
            onClick={onClose}
            className="p-2 text-[#6B6B66] hover:text-[#141413] hover:bg-[#F6F6F4] rounded-lg transition-colors"
            aria-label="Fermer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto p-6 space-y-5">
          {/* Controls Row */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div>
              <label className="block text-xs font-medium text-[#6B6B66] mb-1.5">
                Nom de la vente / campagne
              </label>
              <input
                type="text"
                value={defaultVente}
                onChange={(e) => setDefaultVente(e.target.value)}
                className="w-full px-3 py-2 text-sm bg-white border border-[#D8D6D0] rounded-lg focus:outline-none focus:border-[#721C24]"
                placeholder="Ex : Tissot Octobre 2026"
              />
            </div>

            <div>
              <label className="block text-xs font-medium text-[#6B6B66] mb-1.5">
                Statut initial des commandes validées
              </label>
              <select
                value={defaultStatus}
                onChange={(e) =>
                  setDefaultStatus(e.target.value as OrderStatus)
                }
                className="w-full px-3 py-2 text-sm bg-white border border-[#D8D6D0] rounded-lg focus:outline-none focus:border-[#721C24]"
              >
                <option value="attente_reception">
                  En attente de réception domaine (Précommande)
                </option>
                <option value="recu_lbg">
                  Reçu par LBG (Vente sur stock en cave)
                </option>
              </select>
            </div>

            <div className="flex items-end gap-2">
              <label className="flex-1 flex items-center justify-center gap-2 px-4 py-2 text-sm font-medium text-[#141413] bg-[#F6F6F4] hover:bg-[#ECEAE4] border border-[#D8D6D0] rounded-lg cursor-pointer transition-colors whitespace-nowrap">
                <Upload className="w-4 h-4 text-[#721C24]" />
                <span>Charger .xlsx / .csv</span>
                <input
                  type="file"
                  accept=".xlsx,.xls,.csv,.tsv,.txt"
                  onChange={handleFileUpload}
                  className="hidden"
                />
              </label>
              <button
                type="button"
                onClick={() => setRawText(SAMPLE_HELLOASSO_PASTE)}
                className="px-3.5 py-2 text-sm font-medium text-[#721C24] bg-[#721C24]/8 hover:bg-[#721C24]/15 rounded-lg transition-colors whitespace-nowrap"
              >
                Exemple réel
              </button>
            </div>
          </div>

          {fileError && (
            <div className="p-3 text-sm text-[#B91C1C] bg-[#FEF2F2] border border-[#FECACA] rounded-lg">
              {fileError}
            </div>
          )}

          {/* Paste Area */}
          <div>
            <div className="flex items-center justify-between mb-1.5">
              <label className="text-xs font-medium text-[#6B6B66] flex items-center gap-1.5">
                <ClipboardPaste className="w-3.5 h-3.5" />
                Zone de collage direct (Réf · Date · Statut · Nom · Prénom ·
                Email · Tarif · Montant)
              </label>
              {rawText && (
                <button
                  type="button"
                  onClick={() => {
                    setRawText('');
                    setManualMatchOverrides({});
                  }}
                  className="text-xs text-[#6B6B66] hover:text-[#141413] underline"
                >
                  Vider la zone
                </button>
              )}
            </div>
            <textarea
              rows={5}
              value={rawText}
              onChange={(e) => setRawText(e.target.value)}
              placeholder="Collez ici les lignes copiées depuis votre export HelloAsso (avec ou sans ligne d'en-tête)..."
              className="w-full p-3 text-xs font-mono-num bg-[#FAF9F7] border border-[#D8D6D0] rounded-lg focus:outline-none focus:border-[#721C24] focus:bg-white"
            />
          </div>

          {/* Live Analysis Preview */}
          {parsedRows.length > 0 && (
            <div className="space-y-3">
              <div className="flex flex-wrap items-center justify-between gap-4 py-3 px-4 bg-[#F6F6F4] border border-[#E5E4DF] rounded-lg">
                <div className="flex flex-wrap items-center gap-4 text-sm">
                  <span className="font-medium text-[#141413]">
                    {stats.totalRows} lignes détectées
                  </span>
                  <span aria-hidden="true" className="text-[#C7C5BE]">
                    ·
                  </span>
                  <span className="text-[#15803D] font-medium tabular-nums">
                    {stats.importableCount} bouteille(s) à importer (
                    {formatEUR(stats.totalTTC)})
                  </span>
                  {stats.cancelledCount > 0 && (
                    <>
                      <span aria-hidden="true" className="text-[#C7C5BE]">
                        ·
                      </span>
                      <span className="text-[#B91C1C] tabular-nums">
                        {stats.cancelledCount} annulée(s) exclue(s) du CA
                      </span>
                    </>
                  )}
                  {stats.unmatchedCount > 0 && (
                    <>
                      <span aria-hidden="true" className="text-[#C7C5BE]">
                        ·
                      </span>
                      <span className="text-[#B45309] flex items-center gap-1">
                        <AlertTriangle className="w-3.5 h-3.5" />
                        {stats.unmatchedCount} cuvée(s) nouvelle(s) à associer
                      </span>
                    </>
                  )}
                </div>

                {stats.duplicateCount > 0 && (
                  <label className="flex items-center gap-2 text-xs text-[#6B6B66] cursor-pointer">
                    <input
                      type="checkbox"
                      checked={skipDuplicates}
                      onChange={(e) => setSkipDuplicates(e.target.checked)}
                      className="rounded border-[#D8D6D0] text-[#721C24] focus:ring-[#721C24]"
                    />
                    <span>
                      Ignorer {stats.duplicateCount} ligne(s) déjà importée(s)
                    </span>
                  </label>
                )}
              </div>

              <div className="border border-[#E5E4DF] rounded-lg overflow-hidden">
                <div className="max-h-64 overflow-y-auto">
                  <table className="w-full text-left border-collapse text-xs">
                    <thead className="bg-[#F6F6F4] text-[#6B6B66] sticky top-0 border-b border-[#E5E4DF]">
                      <tr>
                        <th className="py-2.5 px-3 font-medium">Réf</th>
                        <th className="py-2.5 px-3 font-medium">Date</th>
                        <th className="py-2.5 px-3 font-medium">Client</th>
                        <th className="py-2.5 px-3 font-medium">
                          Libellé HelloAsso (nettoyé)
                        </th>
                        <th className="py-2.5 px-3 font-medium">
                          Correspondance Catalogue
                        </th>
                        <th className="py-2.5 px-3 font-medium text-right">
                          Montant TTC
                        </th>
                        <th className="py-2.5 px-3 font-medium">Statut</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-[#ECEAE4]">
                      {parsedRows.map((row) => {
                        const isDup = existingRefs.has(row.refCommande);
                        return (
                          <tr
                            key={row.rowIndex}
                            className={
                              row.mappedStatus === 'annule'
                                ? 'bg-[#FEF2F2]/60 text-[#6B6B66]'
                                : isDup && skipDuplicates
                                  ? 'bg-[#F6F6F4] opacity-55'
                                  : 'bg-white'
                            }
                          >
                            <td className="py-2 px-3 font-mono-num">
                              {row.refCommande}
                            </td>
                            <td className="py-2 px-3 font-mono-num whitespace-nowrap">
                              {formatDateFR(row.dateISO)}
                            </td>
                            <td className="py-2 px-3 whitespace-nowrap">
                              {row.prenomClient} {row.nomClient}
                            </td>
                            <td className="py-2 px-3 font-medium text-[#141413]">
                              {row.cleanCuveeName}
                            </td>
                            <td className="py-2 px-3">
                              <select
                                value={row.matchedCatalog?.id ?? ''}
                                onChange={(e) =>
                                  setManualMatchOverrides((prev) => ({
                                    ...prev,
                                    [row.rowIndex]: e.target.value,
                                  }))
                                }
                                className={`w-full max-w-[240px] px-2 py-1 text-xs rounded border ${
                                  row.matchedCatalog
                                    ? 'border-[#D8D6D0] bg-white text-[#141413]'
                                    : 'border-[#F59E0B] bg-[#FFFBEB] text-[#92400E]'
                                }`}
                              >
                                <option value="">
                                  + Créer nouvelle cuvée automatiquement
                                </option>
                                {catalog.map((c) => (
                                  <option key={c.id} value={c.id}>
                                    {c.domaine} — {c.cuvee}
                                  </option>
                                ))}
                              </select>
                            </td>
                            <td className="py-2 px-3 text-right font-mono-num">
                              {formatEUR(row.montantTTC)}
                            </td>
                            <td className="py-2 px-3 whitespace-nowrap">
                              {row.mappedStatus === 'annule' ? (
                                <span className="text-[#B91C1C] font-medium">
                                  Annulé
                                </span>
                              ) : isDup && skipDuplicates ? (
                                <span className="text-[#6B6B66]">
                                  Déjà présent
                                </span>
                              ) : (
                                <span className="text-[#15803D] font-medium inline-flex items-center gap-1">
                                  <Check className="w-3 h-3" /> Validé
                                </span>
                              )}
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

          {parsedRows.length === 0 && (
            <div className="flex flex-col items-center justify-center py-8 px-4 border border-dashed border-[#D8D6D0] rounded-lg bg-[#FAF9F7] text-center">
              <FileSpreadsheet className="w-8 h-8 text-[#6B6B66] mb-2" />
              <p className="text-sm font-medium text-[#141413]">
                Prêt à analyser votre export HelloAsso
              </p>
              <p className="text-xs text-[#6B6B66] max-w-md mt-1">
                Le préfixe « Carte » est supprimé automatiquement, les
                bouteilles identiques d’une même commande sont regroupées en
                quantités, et les lignes annulées sont écartées du chiffre
                d’affaires.
              </p>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between gap-4 px-6 py-4 border-t border-[#E5E4DF] bg-[#FAF9F7]">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 text-sm font-medium text-[#6B6B66] hover:text-[#141413] transition-colors"
          >
            Annuler
          </button>
          <div className="flex items-center gap-3">
            {parsedRows.length > 0 &&
              stats.importableAllCount === 0 &&
              stats.duplicateCount > 0 && (
                <span className="text-xs text-[#6B6B66]">
                  Toutes ces commandes sont déjà enregistrées.
                </span>
              )}
            <button
              type="button"
              disabled={parsedRows.length === 0 || stats.importableAllCount === 0}
              onClick={handleConfirmImport}
              className="px-5 py-2 text-sm font-medium text-white bg-[#721C24] hover:bg-[#5B151C] disabled:opacity-40 disabled:cursor-not-allowed rounded-lg transition-colors whitespace-nowrap"
            >
              Importer{' '}
              {stats.importableCount > 0
                ? `(${stats.importableCount} bouteille${stats.importableCount > 1 ? 's' : ''})`
                : ''}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
