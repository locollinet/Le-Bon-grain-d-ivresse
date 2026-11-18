import React, { useState } from 'react';
import {
  ArrowDownLeft,
  ArrowUpRight,
  FileText,
  Loader2,
  Sparkles,
  Trash2,
  Upload,
  X,
} from 'lucide-react';
import {
  LotStatus,
  LotType,
  OrderLine,
  OrderStatus,
  SupplierLot,
  WineCatalogItem,
} from '../types/wine';
import { formatEUR, normalizeSearchText } from '../utils/wineMath';

interface ParsedInvoiceLine {
  matchedCatalogId: string;
  domaine: string;
  cuvee: string;
  quantity: number;
  unitPriceHT: number;
  unitPriceTTC: number;
}

interface ParsedInvoiceResult {
  direction: 'achat' | 'vente';
  directionReason: string;
  counterpartyName: string;
  counterpartyEmail: string;
  invoiceNumber: string;
  invoiceDate: string;
  tvaRatePct: number;
  shippingTotalHT: number;
  totalHT: number;
  totalTVA: number;
  totalTTC: number;
  lines: ParsedInvoiceLine[];
}

interface InvoiceAIModalProps {
  isOpen: boolean;
  onClose: () => void;
  catalog: WineCatalogItem[];
  onApplyAchat: (
    lots: SupplierLot[],
    newCatalogItems: WineCatalogItem[],
    summaryText: string
  ) => void;
  onApplyVente: (
    orders: OrderLine[],
    newCatalogItems: WineCatalogItem[],
    summaryText: string
  ) => void;
}

const SAMPLE_PURCHASE_INVOICE = `DOMAINE SYLVAIN PATAILLE - 21160 MARSANNAY-LA-CÔTE
FACTURE N° FA-2026-0842
Date : 14/11/2026
Client : LE BON GRAIN D'IVRESSE (Romain Becker)

Désignation                                  Qté    PU HT      Total HT
Marsannay Clos du Roy 2023                    12    37,00 €    444,00 €
Marsannay Blanc 2023                           6    28,50 €    171,00 €
Frais de transport France                      1    32,00 €     32,00 €

Total HT : 647,00 €
TVA 20,0 % : 129,40 €
Total TTC à payer : 776,40 €`;

const SAMPLE_SALE_INVOICE = `LE BON GRAIN D'IVRESSE — Romain Becker
FACTURE CLIENT N° LBG-2026-019
Date : 17/11/2026
Facturé à : Jérémie Rebelo (jeremie.rebelo@gmail.com)

Désignation                                  Qté    PU TTC     Total TTC
Domaine Tissot - Sursis 2022                   3    41,00 €    123,00 €
Domaine Labet - Les Champs Rouges 2022         2    65,00 €    130,00 €

Total HT : 210,83 €
TVA 20,0 % : 42,17 €
Total TTC : 253,00 € — Payé par virement`;

export const InvoiceAIModal: React.FC<InvoiceAIModalProps> = ({
  isOpen,
  onClose,
  catalog,
  onApplyAchat,
  onApplyVente,
}) => {
  const [directionHint, setDirectionHint] = useState<'auto' | 'achat' | 'vente'>(
    'auto'
  );
  const [textContent, setTextContent] = useState('');
  const [fileName, setFileName] = useState<string | null>(null);
  const [fileBase64, setFileBase64] = useState<string | null>(null);
  const [mimeType, setMimeType] = useState<string | null>(null);

  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [result, setResult] = useState<ParsedInvoiceResult | null>(null);

  // Stock execution options
  const [achatLotType, setAchatLotType] = useState<LotType>('avance');
  const [achatLotStatus, setAchatLotStatus] =
    useState<LotStatus>('recu_cave');
  const [venteOrderStatus, setVenteOrderStatus] =
    useState<OrderStatus>('remis_client');

  if (!isOpen) return null;

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setErrorMsg(null);
    const file = e.target.files?.[0];
    if (!file) return;
    setFileName(file.name);
    setMimeType(file.type || 'application/pdf');
    const reader = new FileReader();
    reader.onload = () => {
      const dataUrl = String(reader.result || '');
      const base64 = dataUrl.includes(',') ? dataUrl.split(',')[1] : dataUrl;
      setFileBase64(base64);
    };
    reader.readAsDataURL(file);
  };

  const handleAnalyze = async () => {
    if (!fileBase64 && !textContent.trim()) {
      setErrorMsg(
        'Ajoutez un fichier (image/PDF) ou collez le texte d’une facture.'
      );
      return;
    }

    setIsAnalyzing(true);
    setErrorMsg(null);
    setResult(null);

    try {
      const response = await fetch('/api/parse-invoice', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          fileBase64: fileBase64 || undefined,
          mimeType: mimeType || undefined,
          textContent: textContent.trim() || undefined,
          directionHint,
          catalogHints: catalog.map((c) => ({
            id: c.id,
            domaine: c.domaine,
            cuvee: c.cuvee,
            tarifAchatHT: c.tarifAchatHT,
            prixLbgTTC: c.prixLbgTTC,
          })),
        }),
      });

      const data = await response.json();
      if (!response.ok) {
        throw new Error(
          data.error || "Échec de l'analyse de la facture par le serveur."
        );
      }

      const findCatalogFallback = (domaine: string, cuvee: string): string => {
        const needle = normalizeSearchText(`${domaine} ${cuvee}`);
        const cuveeNeedle = normalizeSearchText(cuvee);
        if (!cuveeNeedle) return '';
        const exact = catalog.find(
          (c) =>
            normalizeSearchText(c.cuvee) === cuveeNeedle ||
            normalizeSearchText(`${c.domaine} ${c.cuvee}`) === needle
        );
        if (exact) return exact.id;
        const partial = catalog.find((c) => {
          const candCuvee = normalizeSearchText(c.cuvee);
          return (
            (candCuvee.length > 4 && cuveeNeedle.includes(candCuvee)) ||
            (cuveeNeedle.length > 4 && candCuvee.includes(cuveeNeedle))
          );
        });
        return partial?.id ?? '';
      };

      const tvaRatePct = Number(data.tvaRatePct ?? 20);
      const tvaFactor = 1 + tvaRatePct / 100;

      const normalized: ParsedInvoiceResult = {
        direction: data.direction === 'vente' ? 'vente' : 'achat',
        directionReason: data.directionReason || '',
        counterpartyName: data.counterpartyName || '',
        counterpartyEmail: data.counterpartyEmail || '',
        invoiceNumber: data.invoiceNumber || `FAC-${Date.now().toString().slice(-5)}`,
        invoiceDate:
          data.invoiceDate || new Date().toISOString().slice(0, 10),
        tvaRatePct,
        shippingTotalHT: Number(data.shippingTotalHT ?? 0),
        totalHT: Number(data.totalHT ?? 0),
        totalTVA: Number(data.totalTVA ?? 0),
        totalTTC: Number(data.totalTTC ?? 0),
        lines: Array.isArray(data.lines)
          ? data.lines.map((l: Partial<ParsedInvoiceLine>) => {
              const rawMatched = l.matchedCatalogId || '';
              const validMatched = catalog.some((c) => c.id === rawMatched)
                ? rawMatched
                : findCatalogFallback(
                    l.domaine || data.counterpartyName || '',
                    l.cuvee || ''
                  );
              const ht = Number(l.unitPriceHT ?? 0);
              const ttc = Number(l.unitPriceTTC ?? 0);
              const unitPriceHT =
                ht > 0 ? ht : ttc > 0 ? Number((ttc / tvaFactor).toFixed(2)) : 0;
              const unitPriceTTC =
                ttc > 0 ? ttc : ht > 0 ? Number((ht * tvaFactor).toFixed(2)) : 0;
              return {
                matchedCatalogId: validMatched,
                domaine: l.domaine || data.counterpartyName || 'Domaine',
                cuvee: l.cuvee || 'Cuvée sans libellé',
                quantity: Math.max(1, Number(l.quantity ?? 1)),
                unitPriceHT,
                unitPriceTTC,
              };
            })
          : [],
      };

      setResult(normalized);
    } catch (err: unknown) {
      setErrorMsg(
        err instanceof Error
          ? err.message
          : "Erreur inattendue lors de l'analyse."
      );
    } finally {
      setIsAnalyzing(false);
    }
  };

  const recomputeTotals = (
    lines: ParsedInvoiceLine[],
    shippingTotalHT: number,
    tvaRatePct: number
  ) => {
    const winesHT = lines.reduce(
      (s, l) => s + l.unitPriceHT * l.quantity,
      0
    );
    const totalHT = Number((winesHT + shippingTotalHT).toFixed(2));
    const totalTVA = Number(((totalHT * tvaRatePct) / 100).toFixed(2));
    const totalTTC = Number((totalHT + totalTVA).toFixed(2));
    return { totalHT, totalTVA, totalTTC };
  };

  const updateLine = (
    idx: number,
    patch: Partial<ParsedInvoiceLine>
  ) => {
    if (!result) return;
    const factor = 1 + result.tvaRatePct / 100;
    const nextLines = result.lines.map((l, i) => {
      if (i !== idx) return l;
      const merged = { ...l, ...patch };
      if (patch.unitPriceHT !== undefined && patch.unitPriceTTC === undefined) {
        merged.unitPriceTTC = Number((patch.unitPriceHT * factor).toFixed(2));
      } else if (
        patch.unitPriceTTC !== undefined &&
        patch.unitPriceHT === undefined
      ) {
        merged.unitPriceHT = Number((patch.unitPriceTTC / factor).toFixed(2));
      }
      return merged;
    });
    const totals = recomputeTotals(
      nextLines,
      result.shippingTotalHT,
      result.tvaRatePct
    );
    setResult({ ...result, lines: nextLines, ...totals });
  };

  const removeLine = (idx: number) => {
    if (!result) return;
    const nextLines = result.lines.filter((_, i) => i !== idx);
    const totals = recomputeTotals(
      nextLines,
      result.shippingTotalHT,
      result.tvaRatePct
    );
    setResult({ ...result, lines: nextLines, ...totals });
  };

  const handleConfirm = () => {
    if (!result || result.lines.length === 0) return;

    const newCatalogItems: WineCatalogItem[] = [];
    const totalBottles = result.lines.reduce((s, l) => s + l.quantity, 0);
    const shippingPerBottle =
      totalBottles > 0 ? result.shippingTotalHT / totalBottles : 0;

    const resolvedIds = result.lines.map((line, idx) => {
      if (line.matchedCatalogId) {
        const exists = catalog.some((c) => c.id === line.matchedCatalogId);
        if (exists) return line.matchedCatalogId;
      }
      const created: WineCatalogItem = {
        id: `cat_ia_${Date.now()}_${idx}`,
        vente:
          result.direction === 'achat'
            ? `Achat ${line.domaine}`
            : 'Vente Facture IA',
        domaine: line.domaine || result.counterpartyName || 'Domaine',
        cuvee: line.cuvee,
        reference: `${line.domaine} - ${line.cuvee}`,
        region: 'À classer',
        color: 'Blanc',
        tarifAchatHT:
          result.direction === 'achat'
            ? line.unitPriceHT
            : Number((line.unitPriceHT * 0.75).toFixed(2)),
        prixLbgTTC:
          result.direction === 'vente'
            ? line.unitPriceTTC
            : Number((line.unitPriceHT * 1.45 * 1.2).toFixed(2)),
        benchTTC: null,
        benchSource: 'À renseigner',
        dispoPublic: false,
        notes: `Créée via lecture IA facture ${result.invoiceNumber}`,
      };
      newCatalogItems.push(created);
      return created.id;
    });

    if (result.direction === 'achat') {
      const newLots: SupplierLot[] = result.lines.map((line, idx) => ({
        id: `lot_ia_${Date.now()}_${idx}`,
        catalogId: resolvedIds[idx],
        dateAchat: result.invoiceDate,
        typeAchat: achatLotType,
        qteCommandee: line.quantity,
        qteRecue: achatLotStatus === 'recu_cave' ? line.quantity : 0,
        coutUnitaireHT: line.unitPriceHT,
        tvaRatePct: result.tvaRatePct,
        shippingHT: Number((shippingPerBottle * line.quantity).toFixed(2)),
        statutLot: achatLotStatus,
        referenceFacture: result.invoiceNumber,
        notes: `Import IA (${result.counterpartyName})`,
      }));

      onApplyAchat(
        newLots,
        newCatalogItems,
        `Facture d'achat ${result.invoiceNumber} intégrée : +${totalBottles} bouteille(s) ajoutée(s) au stock.`
      );
    } else {
      const nameParts = result.counterpartyName.trim().split(/\s+/);
      const prenomClient = nameParts.length > 1 ? nameParts[0] : '';
      const nomClient =
        nameParts.length > 1
          ? nameParts.slice(1).join(' ')
          : result.counterpartyName || 'Client';

      const newOrders: OrderLine[] = result.lines.map((line, idx) => ({
        id: `ord_ia_${Date.now()}_${idx}`,
        date: result.invoiceDate,
        refCommande: result.invoiceNumber,
        invoiceNumber: result.invoiceNumber,
        vente: 'Vente Facturée',
        nomClient,
        prenomClient,
        emailClient: result.counterpartyEmail || '',
        catalogId: resolvedIds[idx],
        produitLabel: line.cuvee,
        prixUnitaireTTC: line.unitPriceTTC,
        tvaRatePct: result.tvaRatePct,
        qte: line.quantity,
        statut: venteOrderStatus,
        source: 'facture_ia',
        notes: `Import IA facture client ${result.invoiceNumber}`,
      }));

      onApplyVente(
        newOrders,
        newCatalogItems,
        `Facture client ${result.invoiceNumber} intégrée : -${totalBottles} bouteille(s) déduite(s) du stock disponible.`
      );
    }

    setResult(null);
    setTextContent('');
    setFileName(null);
    setFileBase64(null);
    onClose();
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/45 p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="ia-invoice-title"
    >
      <div className="w-full max-w-5xl max-h-[92vh] flex flex-col bg-white border border-[#E5E4DF] rounded-xl shadow-2xl overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-[#E5E4DF]">
          <div>
            <h2
              id="ia-invoice-title"
              className="text-xl font-semibold text-[#141413] flex items-center gap-2"
            >
              <Sparkles className="w-5 h-5 text-[#721C24]" />
              <span>Interprétation IA de facture (Achat ou Vente)</span>
            </h2>
            <p className="text-sm text-[#6B6B66] mt-0.5">
              Déposez un PDF/photo de facture ou collez le texte : l’IA extrait
              les cuvées, quantités, HT, TVA et port, puis met à jour le stock.
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

        {/* Body */}
        <div className="flex-1 overflow-y-auto p-6 space-y-5">
          {/* Step 1: Clear Direction Selector + Upload / Paste */}
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
            <div className="lg:col-span-3 flex flex-wrap items-center justify-between gap-3 p-3.5 bg-[#FAF9F7] border border-[#E5E4DF] rounded-lg">
              <div className="text-xs font-medium text-[#141413]">
                Sens de l’opération sur le stock :
              </div>
              <div className="flex flex-wrap items-center gap-1 p-1 bg-[#ECEAE4] rounded-lg">
                <button
                  type="button"
                  onClick={() => setDirectionHint('auto')}
                  className={`px-3 py-1.5 text-xs font-medium rounded-md transition-colors ${
                    directionHint === 'auto'
                      ? 'bg-white text-[#141413] shadow-sm'
                      : 'text-[#6B6B66] hover:text-[#141413]'
                  }`}
                >
                  Détection automatique (IA)
                </button>
                <button
                  type="button"
                  onClick={() => setDirectionHint('achat')}
                  className={`inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-md transition-colors ${
                    directionHint === 'achat'
                      ? 'bg-[#15803D] text-white shadow-sm'
                      : 'text-[#15803D] hover:bg-white/60'
                  }`}
                >
                  <ArrowDownLeft className="w-3.5 h-3.5" />
                  <span>Achat fournisseur (+ Stock)</span>
                </button>
                <button
                  type="button"
                  onClick={() => setDirectionHint('vente')}
                  className={`inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-md transition-colors ${
                    directionHint === 'vente'
                      ? 'bg-[#721C24] text-white shadow-sm'
                      : 'text-[#721C24] hover:bg-white/60'
                  }`}
                >
                  <ArrowUpRight className="w-3.5 h-3.5" />
                  <span>Vente client (- Stock)</span>
                </button>
              </div>
            </div>

            {/* File upload */}
            <div className="bg-[#FAF9F7] border border-dashed border-[#D8D6D0] rounded-lg p-4 flex flex-col justify-between">
              <div>
                <div className="text-xs font-medium text-[#141413] mb-1">
                  1. Importer un PDF ou une photo
                </div>
                <p className="text-xs text-[#6B6B66]">
                  Facture vigneron, transporteur ou bon de vente (.pdf, .png,
                  .jpg).
                </p>
              </div>

              <div className="mt-4 space-y-2">
                <label className="w-full flex items-center justify-center gap-2 px-4 py-2 text-xs font-medium text-[#141413] bg-white hover:bg-[#ECEAE4] border border-[#D8D6D0] rounded-lg cursor-pointer transition-colors">
                  <Upload className="w-4 h-4 text-[#721C24]" />
                  <span>
                    {fileName ? 'Changer le fichier' : 'Choisir un fichier'}
                  </span>
                  <input
                    type="file"
                    accept="application/pdf,image/*"
                    onChange={handleFileChange}
                    className="hidden"
                  />
                </label>
                {fileName && (
                  <div className="flex items-center justify-between text-xs text-[#15803D] bg-white px-2.5 py-1.5 border border-[#BBF7D0] rounded">
                    <span className="truncate flex items-center gap-1.5">
                      <FileText className="w-3.5 h-3.5 shrink-0" />
                      {fileName}
                    </span>
                    <button
                      type="button"
                      onClick={() => {
                        setFileName(null);
                        setFileBase64(null);
                        setMimeType(null);
                      }}
                      className="text-[#6B6B66] hover:text-[#141413] ml-2"
                    >
                      ×
                    </button>
                  </div>
                )}
              </div>
            </div>

            {/* Text paste */}
            <div className="lg:col-span-2 space-y-2">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <label className="text-xs font-medium text-[#141413]">
                  2. Ou coller le texte d’une facture / confirmation par email
                </label>
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => {
                      setTextContent(SAMPLE_PURCHASE_INVOICE);
                      setDirectionHint('auto');
                      setResult(null);
                    }}
                    className="text-xs font-medium text-[#15803D] hover:underline"
                  >
                    Tester facture Achat
                  </button>
                  <span aria-hidden="true" className="text-[#C7C5BE]">
                    ·
                  </span>
                  <button
                    type="button"
                    onClick={() => {
                      setTextContent(SAMPLE_SALE_INVOICE);
                      setDirectionHint('auto');
                      setResult(null);
                    }}
                    className="text-xs font-medium text-[#721C24] hover:underline"
                  >
                    Tester facture Vente
                  </button>
                </div>
              </div>
              <textarea
                rows={5}
                value={textContent}
                onChange={(e) => setTextContent(e.target.value)}
                placeholder="Collez ici le texte d'une facture domaine, d'un mail de confirmation ou d'une facture client..."
                className="w-full p-3 text-xs font-mono-num bg-[#FAF9F7] border border-[#D8D6D0] rounded-lg focus:outline-none focus:border-[#721C24] focus:bg-white"
              />
              <div className="flex justify-end">
                <button
                  type="button"
                  disabled={isAnalyzing || (!fileBase64 && !textContent.trim())}
                  onClick={handleAnalyze}
                  className="inline-flex items-center gap-2 px-4 py-2 text-xs font-medium text-white bg-[#141413] hover:bg-[#2A2A28] disabled:opacity-40 rounded-lg transition-colors"
                >
                  {isAnalyzing ? (
                    <Loader2 className="w-3.5 h-3.5 animate-spin" />
                  ) : (
                    <Sparkles className="w-3.5 h-3.5" />
                  )}
                  <span>
                    {isAnalyzing
                      ? 'Analyse en cours...'
                      : 'Analyser le document avec l’IA'}
                  </span>
                </button>
              </div>
            </div>
          </div>

          {errorMsg && (
            <div className="p-3.5 text-sm text-[#B91C1C] bg-[#FEF2F2] border border-[#FECACA] rounded-lg">
              {errorMsg}
            </div>
          )}

          {/* Step 2: Explicit Editable Verification Panel */}
          {result && (
            <div className="space-y-4 pt-2 border-t border-[#E5E4DF]">
              {/* Crystal-clear Action Banner (Achat vs Vente) */}
              <div
                className={`p-4 rounded-xl border flex flex-col md:flex-row md:items-center justify-between gap-4 ${
                  result.direction === 'achat'
                    ? 'bg-[#F0FDF4] border-[#BBF7D0]'
                    : 'bg-[#FDF2F4] border-[#F5C2C7]'
                }`}
              >
                <div className="space-y-1">
                  <div className="flex items-center gap-2">
                    {result.direction === 'achat' ? (
                      <ArrowDownLeft className="w-4 h-4 text-[#15803D]" />
                    ) : (
                      <ArrowUpRight className="w-4 h-4 text-[#721C24]" />
                    )}
                    <span
                      className={`text-sm font-semibold ${
                        result.direction === 'achat'
                          ? 'text-[#166534]'
                          : 'text-[#721C24]'
                      }`}
                    >
                      {result.direction === 'achat'
                        ? 'ENTRÉE DE STOCK — Facture d’achat fournisseur'
                        : 'SORTIE DE STOCK — Facture de vente client'}
                    </span>
                  </div>
                  <p className="text-xs text-[#141413]/80">
                    {result.directionReason}
                  </p>
                </div>

                {/* Manual override switch in case user wants to flip */}
                <div className="flex items-center gap-1 p-1 bg-white/80 border border-[#D8D6D0] rounded-lg shrink-0">
                  <button
                    type="button"
                    onClick={() =>
                      setResult({ ...result, direction: 'achat' })
                    }
                    className={`px-3 py-1 text-xs font-medium rounded ${
                      result.direction === 'achat'
                        ? 'bg-[#15803D] text-white'
                        : 'text-[#6B6B66]'
                    }`}
                  >
                    + Entrée (Achat)
                  </button>
                  <button
                    type="button"
                    onClick={() =>
                      setResult({ ...result, direction: 'vente' })
                    }
                    className={`px-3 py-1 text-xs font-medium rounded ${
                      result.direction === 'vente'
                        ? 'bg-[#721C24] text-white'
                        : 'text-[#6B6B66]'
                    }`}
                  >
                    - Sortie (Vente)
                  </button>
                </div>
              </div>

              {/* Metadata Fields */}
              <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
                <div className="col-span-2 md:col-span-1">
                  <label className="block text-[11px] font-medium text-[#6B6B66] mb-1">
                    {result.direction === 'achat'
                      ? 'Fournisseur / Domaine'
                      : 'Client'}
                  </label>
                  <input
                    type="text"
                    value={result.counterpartyName}
                    onChange={(e) =>
                      setResult({
                        ...result,
                        counterpartyName: e.target.value,
                      })
                    }
                    className="w-full px-2.5 py-1.5 text-xs bg-white border border-[#D8D6D0] rounded-md"
                  />
                </div>
                <div>
                  <label className="block text-[11px] font-medium text-[#6B6B66] mb-1">
                    N° Facture
                  </label>
                  <input
                    type="text"
                    value={result.invoiceNumber}
                    onChange={(e) =>
                      setResult({ ...result, invoiceNumber: e.target.value })
                    }
                    className="w-full px-2.5 py-1.5 text-xs font-mono-num bg-white border border-[#D8D6D0] rounded-md"
                  />
                </div>
                <div>
                  <label className="block text-[11px] font-medium text-[#6B6B66] mb-1">
                    Date facture
                  </label>
                  <input
                    type="date"
                    value={result.invoiceDate}
                    onChange={(e) =>
                      setResult({ ...result, invoiceDate: e.target.value })
                    }
                    className="w-full px-2.5 py-1.5 text-xs font-mono-num bg-white border border-[#D8D6D0] rounded-md"
                  />
                </div>
                <div>
                  <label className="block text-[11px] font-medium text-[#6B6B66] mb-1">
                    TVA (%) &amp; Port HT
                  </label>
                  <div className="flex gap-1.5">
                    <input
                      type="number"
                      value={result.tvaRatePct}
                      onChange={(e) =>
                        setResult({
                          ...result,
                          tvaRatePct: Number(e.target.value),
                        })
                      }
                      className="w-16 px-2 py-1.5 text-xs font-mono-num bg-white border border-[#D8D6D0] rounded-md"
                      title="Taux TVA (%)"
                    />
                    <input
                      type="number"
                      step="0.5"
                      value={result.shippingTotalHT}
                      onChange={(e) =>
                        setResult({
                          ...result,
                          shippingTotalHT: Number(e.target.value),
                        })
                      }
                      className="w-full px-2 py-1.5 text-xs font-mono-num bg-white border border-[#D8D6D0] rounded-md"
                      title="Port HT (€)"
                    />
                  </div>
                </div>
                <div>
                  <label className="block text-[11px] font-medium text-[#6B6B66] mb-1">
                    {result.direction === 'achat'
                      ? 'Destination du stock'
                      : 'Statut livraison'}
                  </label>
                  {result.direction === 'achat' ? (
                    <div className="flex gap-1">
                      <select
                        value={achatLotType}
                        onChange={(e) =>
                          setAchatLotType(e.target.value as LotType)
                        }
                        className="w-1/2 px-1.5 py-1.5 text-xs bg-white border border-[#D8D6D0] rounded-md"
                      >
                        <option value="avance">Avance</option>
                        <option value="allocation">Alloc.</option>
                        <option value="cave">Cave</option>
                      </select>
                      <select
                        value={achatLotStatus}
                        onChange={(e) =>
                          setAchatLotStatus(e.target.value as LotStatus)
                        }
                        className="w-1/2 px-1.5 py-1.5 text-xs bg-white border border-[#D8D6D0] rounded-md"
                      >
                        <option value="recu_cave">Reçu cave</option>
                        <option value="en_transit">En transit</option>
                        <option value="commande_payee">Commandé</option>
                      </select>
                    </div>
                  ) : (
                    <select
                      value={venteOrderStatus}
                      onChange={(e) =>
                        setVenteOrderStatus(e.target.value as OrderStatus)
                      }
                      className="w-full px-2 py-1.5 text-xs bg-white border border-[#D8D6D0] rounded-md"
                    >
                      <option value="remis_client">Remis au client</option>
                      <option value="recu_lbg">Prêt en cave (LBG)</option>
                      <option value="attente_reception">
                        En attente domaine
                      </option>
                    </select>
                  )}
                </div>
              </div>

              {/* Extracted Lines Table */}
              <div className="border border-[#E5E4DF] rounded-lg overflow-hidden">
                <table className="w-full text-left border-collapse text-xs">
                  <thead>
                    <tr className="bg-[#FAF9F7] text-[#6B6B66] border-b border-[#E5E4DF]">
                      <th className="py-2.5 px-3 font-medium">
                        Cuvée extraite
                      </th>
                      <th className="py-2.5 px-3 font-medium">
                        Rattachement Catalogue
                      </th>
                      <th className="py-2.5 px-3 font-medium text-right">
                        Qté
                      </th>
                      <th className="py-2.5 px-3 font-medium text-right">
                        PU HT (€)
                      </th>
                      <th className="py-2.5 px-3 font-medium text-right">
                        PU TTC (€)
                      </th>
                      <th className="py-2.5 px-3 font-medium text-right">
                        Total ligne
                      </th>
                      <th className="py-2.5 px-2 font-medium w-8"></th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-[#ECEAE4]">
                    {result.lines.map((line, idx) => (
                      <tr key={idx}>
                        <td className="py-2 px-3">
                          <div className="font-medium text-[#141413]">
                            {line.cuvee}
                          </div>
                          <div className="text-[11px] text-[#6B6B66]">
                            {line.domaine}
                          </div>
                        </td>
                        <td className="py-2 px-3">
                          <select
                            value={line.matchedCatalogId}
                            onChange={(e) =>
                              updateLine(idx, {
                                matchedCatalogId: e.target.value,
                              })
                            }
                            className={`w-full max-w-[230px] px-2 py-1 text-xs rounded border ${
                              line.matchedCatalogId
                                ? 'border-[#D8D6D0] bg-white'
                                : 'border-[#F59E0B] bg-[#FFFBEB]'
                            }`}
                          >
                            <option value="">
                              + Créer cette cuvée au catalogue
                            </option>
                            {catalog.map((c) => (
                              <option key={c.id} value={c.id}>
                                {c.domaine} — {c.cuvee}
                              </option>
                            ))}
                          </select>
                        </td>
                        <td className="py-2 px-3 text-right">
                          <input
                            type="number"
                            min={1}
                            value={line.quantity}
                            onChange={(e) =>
                              updateLine(idx, {
                                quantity: Math.max(1, Number(e.target.value)),
                              })
                            }
                            className="w-16 px-2 py-1 text-right font-mono-num border border-[#D8D6D0] rounded"
                          />
                        </td>
                        <td className="py-2 px-3 text-right">
                          <input
                            type="number"
                            step="0.01"
                            value={line.unitPriceHT}
                            onChange={(e) =>
                              updateLine(idx, {
                                unitPriceHT: Number(e.target.value),
                              })
                            }
                            className="w-20 px-2 py-1 text-right font-mono-num border border-[#D8D6D0] rounded"
                          />
                        </td>
                        <td className="py-2 px-3 text-right">
                          <input
                            type="number"
                            step="0.01"
                            value={line.unitPriceTTC}
                            onChange={(e) =>
                              updateLine(idx, {
                                unitPriceTTC: Number(e.target.value),
                              })
                            }
                            className="w-20 px-2 py-1 text-right font-mono-num border border-[#D8D6D0] rounded"
                          />
                        </td>
                        <td className="py-2 px-3 text-right font-mono-num font-medium">
                          {formatEUR(
                            (result.direction === 'achat'
                              ? line.unitPriceHT
                              : line.unitPriceTTC) * line.quantity
                          )}
                        </td>
                        <td className="py-2 px-2 text-right">
                          <button
                            type="button"
                            onClick={() => removeLine(idx)}
                            className="p-1 text-[#9E9B93] hover:text-[#B91C1C] rounded"
                            title="Retirer cette ligne"
                            aria-label="Retirer cette ligne"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              <div className="flex flex-wrap items-center justify-between gap-4 text-xs text-[#6B6B66] bg-[#FAF9F7] px-4 py-2.5 rounded-lg border border-[#E5E4DF] tabular-nums">
                <div>
                  Total HT :{' '}
                  <span className="font-semibold text-[#141413]">
                    {formatEUR(result.totalHT)}
                  </span>
                </div>
                <div>
                  TVA ({result.tvaRatePct} %) :{' '}
                  <span className="font-semibold text-[#141413]">
                    {formatEUR(result.totalTVA)}
                  </span>
                </div>
                <div>
                  Port HT :{' '}
                  <span className="font-semibold text-[#141413]">
                    {formatEUR(result.shippingTotalHT)}
                  </span>
                </div>
                <div>
                  Total TTC :{' '}
                  <span className="font-semibold text-[#141413]">
                    {formatEUR(result.totalTTC)}
                  </span>
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between px-6 py-4 border-t border-[#E5E4DF] bg-[#FAF9F7]">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 text-sm font-medium text-[#6B6B66] hover:text-[#141413]"
          >
            Fermer
          </button>
          <button
            type="button"
            disabled={!result || result.lines.length === 0}
            onClick={handleConfirm}
            className={`px-5 py-2 text-sm font-medium text-white rounded-lg transition-colors disabled:opacity-40 disabled:cursor-not-allowed ${
              result?.direction === 'vente'
                ? 'bg-[#721C24] hover:bg-[#5B151C]'
                : 'bg-[#15803D] hover:bg-[#166534]'
            }`}
          >
            {result
              ? result.direction === 'achat'
                ? `Valider l'entrée en stock (+${result.lines.reduce((s, l) => s + l.quantity, 0)} btl)`
                : `Valider la sortie de stock (-${result.lines.reduce((s, l) => s + l.quantity, 0)} btl)`
              : 'Valider la facture'}
          </button>
        </div>
      </div>
    </div>
  );
};
