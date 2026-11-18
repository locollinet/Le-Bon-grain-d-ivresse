import { OrderLine, OrderStatus, WineCatalogItem } from '../types/wine';

export interface ParsedHelloAssoRow {
  rowIndex: number;
  refCommande: string;
  dateISO: string;
  statutRaw: string;
  mappedStatus: OrderStatus;
  nomClient: string;
  prenomClient: string;
  emailClient: string;
  rawTarif: string;
  cleanCuveeName: string;
  montantTTC: number;
  codePromo?: string;
  discountTTC?: number;
  matchedCatalog: WineCatalogItem | null;
  confidence: 'exact' | 'fuzzy' | 'unmatched';
}

function normalizeText(str: string): string {
  return str
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/^carte\s+/i, '')
    .replace(/[–—-]/g, ' ')
    .replace(/[«»"'’`®]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function parseFrenchNumber(raw: string): number {
  if (!raw) return 0;
  const cleaned = raw.replace(/[€\s]/g, '').replace(',', '.');
  const num = parseFloat(cleaned);
  return Number.isFinite(num) ? num : 0;
}

function parseDateToISO(raw: string): string {
  if (!raw) return new Date().toISOString().slice(0, 10);
  const trimmed = raw.trim();
  const frMatch = trimmed.match(/^(\d{1,2})\/(\d{1,2})\/(\d{2,4})/);
  if (frMatch) {
    const day = frMatch[1].padStart(2, '0');
    const month = frMatch[2].padStart(2, '0');
    const year = frMatch[3].length === 2 ? `20${frMatch[3]}` : frMatch[3];
    return `${year}-${month}-${day}`;
  }
  const isoMatch = trimmed.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (isoMatch) {
    return `${isoMatch[1]}-${isoMatch[2]}-${isoMatch[3]}`;
  }
  return new Date().toISOString().slice(0, 10);
}

function extractYears(str: string): string[] {
  return str.match(/\b(19\d{2}|20\d{2})\b/g) ?? [];
}

function matchCatalogItem(
  cleanName: string,
  catalog: WineCatalogItem[]
): { item: WineCatalogItem | null; confidence: 'exact' | 'fuzzy' | 'unmatched' } {
  const target = normalizeText(cleanName);
  if (!target) return { item: null, confidence: 'unmatched' };

  // 1. Correspondance exacte sur cuvée ou référence (hors variantes Club/WhatsApp si même cuvée)
  const exactMatches = catalog.filter(
    (item) =>
      normalizeText(item.cuvee) === target ||
      normalizeText(item.reference) === target
  );
  if (exactMatches.length > 0) {
    const preferred =
      exactMatches.find((m) => m.canal !== 'WhatsApp') ?? exactMatches[0];
    return { item: preferred, confidence: 'exact' };
  }

  // 2. Meilleur score sur tous les candidats (priorité au millésime exact et recouvrement de tokens)
  const targetYears = extractYears(target);
  const targetTokens = target.split(' ').filter((t) => t.length > 1);

  let bestMatch: WineCatalogItem | null = null;
  let bestScore = 0;

  for (const item of catalog) {
    const normCuvee = normalizeText(item.cuvee);
    const normDomaine = normalizeText(item.domaine);
    const cand = `${normDomaine} ${normCuvee}`.trim();

    // Éviter de matcher un millésime explicitement différent
    const candYears = extractYears(normCuvee);
    if (
      targetYears.length > 0 &&
      candYears.length > 0 &&
      !targetYears.some((y) => candYears.includes(y))
    ) {
      continue;
    }

    let score = 0;
    if (normCuvee === target) {
      score = 1.0;
    } else if (normCuvee.includes(target) || target.includes(normCuvee)) {
      const lenRatio =
        Math.min(target.length, normCuvee.length) /
        Math.max(target.length, normCuvee.length, 1);
      score = 0.72 + lenRatio * 0.25;
    } else {
      const candTokens = cand.split(' ').filter((t) => t.length > 1);
      const overlap = targetTokens.filter((t) => candTokens.includes(t)).length;
      const precision = overlap / Math.max(targetTokens.length, 1);
      const recall = overlap / Math.max(candTokens.length, 1);
      score = precision * 0.7 + recall * 0.3;
    }

    if (score > bestScore && score >= 0.62) {
      bestScore = score;
      bestMatch = item;
    }
  }

  return bestMatch
    ? { item: bestMatch, confidence: bestScore >= 0.96 ? 'exact' : 'fuzzy' }
    : { item: null, confidence: 'unmatched' };
}

function splitDelimitedLine(line: string, delimiter: string): string[] {
  if (delimiter === '\t') {
    return line.split('\t').map((c) => c.trim());
  }
  const result: string[] = [];
  let current = '';
  let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (ch === '"') {
      if (inQuotes && line[i + 1] === '"') {
        current += '"';
        i++;
      } else {
        inQuotes = !inQuotes;
      }
    } else if (ch === delimiter && !inQuotes) {
      result.push(current.trim());
      current = '';
    } else {
      current += ch;
    }
  }
  result.push(current.trim());
  return result;
}

export function parseHelloAssoText(
  rawText: string,
  catalog: WineCatalogItem[]
): ParsedHelloAssoRow[] {
  const lines = rawText
    .split(/\r?\n/)
    .map((l) => l.trimEnd())
    .filter((l) => l.trim().length > 0);

  if (lines.length === 0) return [];

  // Détecter le séparateur (tab depuis Excel, ; depuis CSV FR, , depuis CSV HelloAsso brut)
  const firstLine = lines[0];
  const tabCount = (firstLine.match(/\t/g) ?? []).length;
  const semiCount = (firstLine.match(/;/g) ?? []).length;
  const delimiter = tabCount >= 3 ? '\t' : semiCount >= 3 ? ';' : ',';

  const firstCells = splitDelimitedLine(firstLine, delimiter).map((c) =>
    normalizeText(c)
  );

  const hasHeader =
    firstCells.some((c) => c.includes('tarif') || c.includes('payeur')) ||
    firstCells.some((c) => c.includes('statut'));

  let idxRef = 0;
  let idxDate = 1;
  let idxStatut = 2;
  let idxNom = 3;
  let idxPrenom = 4;
  let idxEmail = 5;
  let idxTarif = 8;
  let idxMontant = 9;
  let idxPromoCode = 10;
  let idxPromoAmount = 11;

  if (hasHeader) {
    const findIdx = (patterns: string[], fallback: number, exactOnly?: boolean) => {
      for (const p of patterns) {
        const idx = firstCells.findIndex((c) =>
          exactOnly ? c === p : c.includes(p)
        );
        if (idx >= 0) return idx;
      }
      return fallback;
    };
    idxRef = findIdx(['reference commande', 'ref commande', 'ref', 'commande', 'id'], 0);
    idxDate = findIdx(['date de la commande', 'date'], 1);
    idxStatut = findIdx(['statut de la commande', 'statut', 'status'], 2);
    idxNom = findIdx(['nom payeur', 'nom'], 3);
    idxPrenom = findIdx(['prenom payeur', 'prenom'], 4);
    idxEmail = findIdx(['email payeur', 'email', 'mail'], 5);
    idxTarif = findIdx(['tarif', 'produit', 'billet'], 8, true);
    if (idxTarif === 8 && firstCells[8] !== 'tarif') {
      idxTarif = findIdx(['tarif', 'produit', 'billet'], 8);
    }
    idxMontant = findIdx(['montant tarif', 'montant', 'prix'], 9);
    idxPromoCode = findIdx(['code promo'], 10);
    idxPromoAmount = findIdx(['montant code promo'], 11);
  }

  const startRow = hasHeader ? 1 : 0;
  const parsed: ParsedHelloAssoRow[] = [];

  for (let i = startRow; i < lines.length; i++) {
    const cells = splitDelimitedLine(lines[i], delimiter);
    if (cells.length < 4) continue;

    const refCommande =
      cells[idxRef] || `HA-${Date.now().toString().slice(-6)}-${i}`;
    const dateISO = parseDateToISO(cells[idxDate] || '');
    const statutRaw = cells[idxStatut] || 'Validé';
    const isCancelled = normalizeText(statutRaw).includes('annul');

    const nomClient = cells[idxNom] || 'Client';
    const prenomClient = cells[idxPrenom] || '';
    const emailClient = cells[idxEmail] || '';

    let rawTarif = cells[idxTarif] || '';
    let montantRaw = cells[idxMontant] || '';

    if (!rawTarif && cells.length >= 7) {
      const carteIdx = cells.findIndex((c) => /^carte\s+/i.test(c));
      if (carteIdx >= 0) {
        rawTarif = cells[carteIdx];
        montantRaw = cells[carteIdx + 1] || '';
      }
    }

    if (!rawTarif) continue;

    const cleanCuveeName = rawTarif.replace(/^carte\s+/i, '').trim();
    const rawMontantTTC = parseFrenchNumber(montantRaw);
    const codePromo = cells[idxPromoCode]?.trim() || undefined;
    const discountTTC = Math.abs(parseFrenchNumber(cells[idxPromoAmount] || ''));
    const { item, confidence } = matchCatalogItem(cleanCuveeName, catalog);

    const baseMontant =
      rawMontantTTC > 0 ? rawMontantTTC : item?.prixLbgTTC ?? 0;
    const finalMontant = Math.max(0, Number((baseMontant - discountTTC).toFixed(2)));

    parsed.push({
      rowIndex: i + 1,
      refCommande,
      dateISO,
      statutRaw,
      mappedStatus: isCancelled ? 'annule' : 'attente_reception',
      nomClient,
      prenomClient,
      emailClient,
      rawTarif,
      cleanCuveeName,
      montantTTC: finalMontant,
      codePromo,
      discountTTC: discountTTC > 0 ? discountTTC : undefined,
      matchedCatalog: item,
      confidence,
    });
  }

  return parsed;
}

export function groupParsedRowsToOrderLines(
  rows: ParsedHelloAssoRow[],
  defaultVente: string,
  defaultStatus: OrderStatus = 'attente_reception'
): OrderLine[] {
  // HelloAsso sort 1 ligne par bouteille : consolider (ref + client + cuvée + prix + statut) en quantité
  const grouped = new Map<string, OrderLine>();

  rows.forEach((r, idx) => {
    const catId = r.matchedCatalog?.id ?? `unmatched_${r.cleanCuveeName.toLowerCase()}`;
    const status: OrderStatus =
      r.mappedStatus === 'annule' ? 'annule' : defaultStatus;
    const key = `${r.refCommande}__${r.nomClient}__${r.prenomClient}__${catId}__${r.cleanCuveeName}__${r.montantTTC}__${status}`;

    const existing = grouped.get(key);
    if (existing) {
      existing.qte += 1;
      if (r.discountTTC) {
        existing.discountTTC = (existing.discountTTC ?? 0) + r.discountTTC;
      }
    } else {
      grouped.set(key, {
        id: `ord_imp_${Date.now()}_${idx}`,
        date: r.dateISO,
        refCommande: r.refCommande,
        vente: r.matchedCatalog?.vente || defaultVente,
        nomClient: r.nomClient,
        prenomClient: r.prenomClient,
        emailClient: r.emailClient,
        catalogId: catId,
        produitLabel: r.matchedCatalog?.cuvee ?? r.cleanCuveeName,
        prixUnitaireTTC: r.montantTTC,
        qte: 1,
        statut: status,
        source: 'helloasso',
        codePromo: r.codePromo,
        discountTTC: r.discountTTC,
        notes: r.codePromo ? `Code promo : ${r.codePromo}` : undefined,
      });
    }
  });

  return Array.from(grouped.values());
}
