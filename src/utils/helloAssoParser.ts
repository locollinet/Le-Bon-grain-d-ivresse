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
  // Match DD/MM/YYYY
  const frMatch = trimmed.match(/^(\d{1,2})\/(\d{1,2})\/(\d{2,4})/);
  if (frMatch) {
    const day = frMatch[1].padStart(2, '0');
    const month = frMatch[2].padStart(2, '0');
    const year = frMatch[3].length === 2 ? `20${frMatch[3]}` : frMatch[3];
    return `${year}-${month}-${day}`;
  }
  // Match YYYY-MM-DD
  const isoMatch = trimmed.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (isoMatch) {
    return `${isoMatch[1]}-${isoMatch[2]}-${isoMatch[3]}`;
  }
  return new Date().toISOString().slice(0, 10);
}

function matchCatalogItem(
  cleanName: string,
  catalog: WineCatalogItem[]
): { item: WineCatalogItem | null; confidence: 'exact' | 'fuzzy' | 'unmatched' } {
  const target = normalizeText(cleanName);
  if (!target) return { item: null, confidence: 'unmatched' };

  // 1. Exact cuvee or reference match
  for (const item of catalog) {
    if (
      normalizeText(item.cuvee) === target ||
      normalizeText(item.reference) === target
    ) {
      return { item, confidence: 'exact' };
    }
  }

  // 2. Substring / token overlap match
  let bestMatch: WineCatalogItem | null = null;
  let bestScore = 0;

  const targetTokens = target.split(' ').filter((t) => t.length > 2);

  for (const item of catalog) {
    const cand = normalizeText(`${item.domaine} ${item.cuvee}`);
    if (cand.includes(target) || target.includes(normalizeText(item.cuvee))) {
      return { item, confidence: 'fuzzy' };
    }
    const candTokens = cand.split(' ').filter((t) => t.length > 2);
    const overlap = targetTokens.filter((t) => candTokens.includes(t)).length;
    const score = overlap / Math.max(targetTokens.length, 1);
    if (score > bestScore && score >= 0.6) {
      bestScore = score;
      bestMatch = item;
    }
  }

  return bestMatch
    ? { item: bestMatch, confidence: 'fuzzy' }
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
      inQuotes = !inQuotes;
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

  // Detect delimiter (tab from Excel copy-paste, semicolon from French CSV, comma)
  const firstLine = lines[0];
  const tabCount = (firstLine.match(/\t/g) ?? []).length;
  const semiCount = (firstLine.match(/;/g) ?? []).length;
  const delimiter = tabCount >= 3 ? '\t' : semiCount >= 3 ? ';' : ',';

  const firstCells = splitDelimitedLine(firstLine, delimiter).map((c) =>
    normalizeText(c)
  );

  // Detect header columns dynamically
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

  if (hasHeader) {
    const findIdx = (patterns: string[], fallback: number) => {
      const idx = firstCells.findIndex((c) =>
        patterns.some((p) => c.includes(p))
      );
      return idx >= 0 ? idx : fallback;
    };
    idxRef = findIdx(['ref', 'commande', 'id'], 0);
    idxDate = findIdx(['date'], 1);
    idxStatut = findIdx(['statut', 'status'], 2);
    idxNom = findIdx(['nom payeur', 'nom'], 3);
    idxPrenom = findIdx(['prenom payeur', 'prenom'], 4);
    idxEmail = findIdx(['email', 'mail'], 5);
    idxTarif = findIdx(['tarif', 'produit', 'billet'], 8);
    idxMontant = findIdx(['montant tarif', 'montant', 'prix'], 9);
  }

  const startRow = hasHeader ? 1 : 0;
  const parsed: ParsedHelloAssoRow[] = [];

  for (let i = startRow; i < lines.length; i++) {
    const cells = splitDelimitedLine(lines[i], delimiter);
    if (cells.length < 4) continue;

    // Support both full 10+ col HelloAsso export and compact 6-col paste
    const refCommande = cells[idxRef] || `HA-${Date.now().toString().slice(-6)}-${i}`;
    const dateISO = parseDateToISO(cells[idxDate] || '');
    const statutRaw = cells[idxStatut] || 'Validé';
    const isCancelled = normalizeText(statutRaw).includes('annul');

    const nomClient = cells[idxNom] || 'Client';
    const prenomClient = cells[idxPrenom] || '';
    const emailClient = cells[idxEmail] || '';

    // Handle cases where Raison sociale / Moyen columns were omitted
    let rawTarif = cells[idxTarif] || '';
    let montantRaw = cells[idxMontant] || '';

    if (!rawTarif && cells.length >= 7) {
      // Try finding first cell starting with "Carte "
      const carteIdx = cells.findIndex((c) => /^carte\s+/i.test(c));
      if (carteIdx >= 0) {
        rawTarif = cells[carteIdx];
        montantRaw = cells[carteIdx + 1] || '';
      }
    }

    if (!rawTarif) continue;

    const cleanCuveeName = rawTarif.replace(/^carte\s+/i, '').trim();
    const montantTTC = parseFrenchNumber(montantRaw);
    const { item, confidence } = matchCatalogItem(cleanCuveeName, catalog);

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
      montantTTC: montantTTC > 0 ? montantTTC : item?.prixLbgTTC ?? 0,
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
  // HelloAsso outputs 1 line per bottle! Consolidate identical (ref + client + cuvee) into Qty
  const grouped = new Map<string, OrderLine>();

  rows.forEach((r, idx) => {
    const catId = r.matchedCatalog?.id ?? `unmatched_${idx}`;
    const status: OrderStatus =
      r.mappedStatus === 'annule' ? 'annule' : defaultStatus;
    const key = `${r.refCommande}__${r.nomClient}__${r.prenomClient}__${catId}__${r.cleanCuveeName}__${status}`;

    const existing = grouped.get(key);
    if (existing) {
      existing.qte += 1;
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
      });
    }
  });

  return Array.from(grouped.values());
}
