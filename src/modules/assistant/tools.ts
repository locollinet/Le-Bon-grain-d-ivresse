import type {
  ActiveTab,
  AppSettings,
  LotStatus,
  LotType,
  OrderLine,
  OrderStatus,
  SalesCampaign,
  SupplierLot,
  WineCatalogItem,
  WineColor,
} from '../../types/wine';
import {
  computeBottleEconomics,
  computeCustomerSummaries,
  computeOrderLineEconomics,
  computeStockSummaries,
  formatDateFR,
  formatEUR,
  formatPct,
  maskClientName,
  normalizeSearchText,
} from '../../utils/wineMath';
import {
  ASSISTANT_TOOL_NAMES,
  type AssistantAction,
  type AssistantToolName,
  type CatalogItemPrefill,
  type DirectOrderPrefill,
  type ResultCard,
  type ResultCardItem,
  type SupplierLotPrefill,
} from './types';

export interface AssistantToolContext {
  catalog: WineCatalogItem[];
  lots: SupplierLot[];
  orders: OrderLine[];
  campaigns: SalesCampaign[];
  settings: AppSettings;
  activeTab: ActiveTab;
}

export interface AssistantTool<
  I = Record<string, unknown>,
  O = Record<string, unknown>,
> {
  name: AssistantToolName;
  run: (ctx: AssistantToolContext, input: I) => Promise<O>;
  toCards: (output: O, ctx: AssistantToolContext) => ResultCard[];
}

export function availableTools(_ctx?: AssistantToolContext): AssistantToolName[] {
  return [...ASSISTANT_TOOL_NAMES];
}

export function clampLimit(
  raw: unknown,
  defaultVal = 10,
  maxVal = 20
): number {
  const n = typeof raw === 'number' ? raw : Number(raw);
  if (!Number.isFinite(n) || n <= 0) return defaultVal;
  return Math.min(maxVal, Math.max(1, Math.floor(n)));
}

const PRIVACY_EMAIL_KEYS = new Set([
  'email',
  'emailClient',
  'counterpartyEmail',
  'rawEmail',
]);

const PRIVACY_RAW_NAME_KEYS = new Set([
  'nomClient',
  'prenomClient',
  'rawClientName',
  'nom',
  'prenom',
  'clientName',
]);

const PRIVACY_DISPLAY_NAME_KEYS = new Set([
  'displayName',
  'clientDisplayName',
]);

const PRIVACY_CUSTOMER_KEY_FIELDS = new Set(['key', 'clientKey']);

function maskDisplayNameValue(raw: string): string {
  const trimmed = raw.trim();
  if (!trimmed || trimmed.includes('***')) return trimmed;
  const parts = trimmed.split(/\s+/);
  if (parts.length === 1) {
    return maskClientName('', parts[0], true);
  }
  return maskClientName(parts[0], parts.slice(1).join(' '), true);
}

/**
 * Purge / masque récursivement toute donnée personnelle client quand anonymizeClients === true,
 * et supprime systématiquement les emails bruts des sorties envoyées au LLM.
 */
export function sanitizeForPrivacy<T>(
  value: T,
  anonymizeClients: boolean,
  options?: { keepPrefillForClientUi?: boolean }
): T {
  if (value === null || value === undefined) return value;
  if (Array.isArray(value)) {
    return value.map((item) =>
      sanitizeForPrivacy(item, anonymizeClients, options)
    ) as unknown as T;
  }
  if (typeof value !== 'object') return value;

  const src = value as Record<string, unknown>;
  const out: Record<string, unknown> = {};

  for (const [k, v] of Object.entries(src)) {
    if (options?.keepPrefillForClientUi && k === 'prefill') {
      out[k] = v;
      continue;
    }
    if (PRIVACY_EMAIL_KEYS.has(k) || PRIVACY_CUSTOMER_KEY_FIELDS.has(k)) {
      continue;
    }
    if (anonymizeClients && PRIVACY_RAW_NAME_KEYS.has(k)) {
      continue;
    }
    if (anonymizeClients && k === 'whatsappDraft') {
      out[k] = null;
      continue;
    }
    if (anonymizeClients && PRIVACY_DISPLAY_NAME_KEYS.has(k) && typeof v === 'string') {
      out[k] = maskDisplayNameValue(v);
      continue;
    }
    out[k] = sanitizeForPrivacy(v, anonymizeClients, options);
  }

  return out as T;
}

function resolveCatalogMatches(
  catalog: WineCatalogItem[],
  query: string
): WineCatalogItem[] {
  const q = normalizeSearchText(query);
  if (!q) return [];

  const tokens = q.split(/\s+/).filter((t) => t.length > 1);
  const scored: Array<{ item: WineCatalogItem; score: number }> = [];

  for (const item of catalog) {
    const hay = normalizeSearchText(
      `${item.domaine} ${item.cuvee} ${item.reference} ${item.region} ${item.vente}`
    );
    const normCuvee = normalizeSearchText(item.cuvee);
    let score = 0;

    if (item.id === query || normCuvee === q || normalizeSearchText(item.reference) === q) {
      score = 1.0;
    } else if (hay.includes(q)) {
      score = 0.88;
    } else if (tokens.length > 0) {
      const matched = tokens.filter((t) => hay.includes(t)).length;
      score = matched / tokens.length;
    }

    if (score >= 0.55) {
      scored.push({ item, score });
    }
  }

  return scored.sort((a, b) => b.score - a.score).map((s) => s.item);
}

// ---------------------------------------------------------------------------
// 1. search_catalog_and_stock
// ---------------------------------------------------------------------------
interface SearchCatalogInput {
  query?: string;
  domaine?: string;
  region?: string;
  color?: string;
  vente?: string;
  stockState?: 'all' | 'dispo' | 'avance' | 'attente' | 'deficit';
  onlyPublic?: boolean;
  minDiscountVsBenchPct?: number;
  limit?: number;
}

const searchCatalogAndStockTool: AssistantTool<SearchCatalogInput> = {
  name: 'search_catalog_and_stock',
  async run(ctx, input) {
    const limit = clampLimit(input.limit, 12, 20);
    const stockRows = computeStockSummaries(ctx.catalog, ctx.lots, ctx.orders);

    const q = normalizeSearchText(String(input.query ?? ''));
    const dom = normalizeSearchText(String(input.domaine ?? ''));
    const reg = normalizeSearchText(String(input.region ?? ''));
    const col = normalizeSearchText(String(input.color ?? ''));
    const ven = normalizeSearchText(String(input.vente ?? ''));
    const state = input.stockState ?? 'all';
    const minDisc =
      typeof input.minDiscountVsBenchPct === 'number'
        ? input.minDiscountVsBenchPct
        : null;

    const matching = stockRows
      .map((row) => {
        const econ = computeBottleEconomics(row.catalog, ctx.settings);
        return { row, econ };
      })
      .filter(({ row, econ }) => {
        const c = row.catalog;
        if (input.onlyPublic && !c.dispoPublic) return false;
        if (dom && !normalizeSearchText(c.domaine).includes(dom)) return false;
        if (reg && !normalizeSearchText(c.region).includes(reg)) return false;
        if (col && !normalizeSearchText(c.color).includes(col)) return false;
        if (ven && !normalizeSearchText(c.vente).includes(ven)) return false;
        if (q) {
          const hay = normalizeSearchText(
            `${c.domaine} ${c.cuvee} ${c.region} ${c.vente} ${c.color}`
          );
          const tokens = q.split(/\s+/).filter((t) => t.length > 1);
          if (!hay.includes(q) && !tokens.every((t) => hay.includes(t))) {
            return false;
          }
        }
        if (state === 'dispo' && row.disponibleVente <= 0) return false;
        if (state === 'avance' && !row.hasAdvanceStock) return false;
        if (
          state === 'attente' &&
          row.enCommandeFournisseur <= 0 &&
          row.attenteReceptionClients <= 0
        ) {
          return false;
        }
        if (state === 'deficit' && row.disponibleVente >= 0) return false;
        if (
          minDisc !== null &&
          (econ.vsBenchPct === null || econ.vsBenchPct > -minDisc)
        ) {
          return false;
        }
        return true;
      })
      .sort((a, b) => {
        if (state === 'deficit') {
          return a.row.disponibleVente - b.row.disponibleVente;
        }
        if (b.row.disponibleVente !== a.row.disponibleVente) {
          return b.row.disponibleVente - a.row.disponibleVente;
        }
        return b.econ.margeEuro - a.econ.margeEuro;
      });

    const totalDispo = matching.reduce(
      (s, x) => s + Math.max(0, x.row.disponibleVente),
      0
    );
    const totalPhysique = matching.reduce((s, x) => s + x.row.physiqueCave, 0);
    const totalTransit = matching.reduce(
      (s, x) => s + x.row.enCommandeFournisseur,
      0
    );
    const totalCapitalHT = matching.reduce(
      (s, x) => s + x.row.capitalImmobiliseHT,
      0
    );

    const items = matching.slice(0, limit).map(({ row, econ }) => ({
      id: row.catalog.id,
      domaine: row.catalog.domaine,
      cuvee: row.catalog.cuvee,
      vente: row.catalog.vente,
      canal: row.catalog.canal ?? 'Standard',
      region: row.catalog.region,
      color: row.catalog.color,
      tarifAchatHT: Number(row.catalog.tarifAchatHT.toFixed(2)),
      prixLbgTTC: Number(row.catalog.prixLbgTTC.toFixed(2)),
      benchTTC: row.catalog.benchTTC,
      vsBenchPct:
        econ.vsBenchPct !== null ? Number(econ.vsBenchPct.toFixed(1)) : null,
      margeEuro: Number(econ.margeEuro.toFixed(2)),
      margePct: Number(econ.margePct.toFixed(1)),
      physiqueCave: row.physiqueCave,
      enCommandeFournisseur: row.enCommandeFournisseur,
      reserveClients: row.reserveClients,
      disponibleVente: row.disponibleVente,
      capitalImmobiliseHT: Number(row.capitalImmobiliseHT.toFixed(2)),
      hasAdvanceStock: row.hasAdvanceStock,
      dispoPublic: row.catalog.dispoPublic,
    }));

    return {
      totalMatches: matching.length,
      truncated: matching.length > limit,
      queryEcho: input.query ?? input.domaine ?? input.region ?? '',
      stockState: state,
      aggregates: {
        totalDispo,
        totalPhysique,
        totalTransit,
        totalCapitalHT: Number(totalCapitalHT.toFixed(2)),
      },
      items,
    };
  },
  toCards(output) {
    const items = (output.items as Array<Record<string, unknown>>) ?? [];
    const agg = (output.aggregates as Record<string, number>) ?? {};
    const totalMatches = Number(output.totalMatches ?? items.length);
    const queryEcho = String(output.queryEcho ?? '');

    const cardItems: ResultCardItem[] = items.slice(0, 8).map((it) => {
      const dispo = Number(it.disponibleVente ?? 0);
      const marge = Number(it.margeEuro ?? 0);
      const vsBench = it.vsBenchPct as number | null;
      return {
        id: String(it.id),
        title: `${it.domaine} — ${it.cuvee}`,
        subtitle: `${it.region} · EXW ${formatEUR(Number(it.tarifAchatHT ?? 0))} · Marge ${formatEUR(marge, true)} (${formatPct(Number(it.margePct ?? 0))})${vsBench !== null ? ` · ${formatPct(vsBench, true)} vs marché` : ''}`,
        badge:
          dispo > 0
            ? `+${dispo} btl libre`
            : dispo < 0
              ? `${dispo} à cmd`
              : Number(it.physiqueCave) > 0
                ? `${it.physiqueCave} réservées`
                : '0 stock',
        badgeTone: dispo > 0 ? 'ok' : dispo < 0 ? 'bad' : 'neutral',
        rightValue: formatEUR(Number(it.prixLbgTTC ?? 0)),
        action: {
          type: 'navigate',
          tab: 'stock',
          search: String(it.cuvee),
        },
      };
    });

    return [
      {
        id: 'card_catalog_stock',
        title: `Catalogue & Stock (${totalMatches} cuvée${totalMatches > 1 ? 's' : ''})`,
        subtitle: queryEcho ? `Filtre : « ${queryEcho} »` : undefined,
        metrics: [
          {
            label: 'Disponible libre',
            value: `${agg.totalDispo ?? 0} btl`,
            tone: (agg.totalDispo ?? 0) > 0 ? 'ok' : 'neutral',
          },
          {
            label: 'Physique cave',
            value: `${agg.totalPhysique ?? 0} btl`,
          },
          {
            label: 'Capital immobilisé HT',
            value: formatEUR(agg.totalCapitalHT ?? 0),
            tone: 'brand',
          },
        ],
        items: cardItems,
        actionLabel: 'Ouvrir Stock & Cave',
        action: {
          type: 'navigate',
          tab: 'stock',
          search: queryEcho || undefined,
          filter:
            output.stockState && output.stockState !== 'all'
              ? String(output.stockState)
              : undefined,
        },
      },
    ];
  },
};

// ---------------------------------------------------------------------------
// 2. logistics_and_deliveries
// ---------------------------------------------------------------------------
interface LogisticsInput {
  focus?: 'all' | 'ready_pickup' | 'awaiting_domain' | 'pending_lots' | 'campaigns';
  vente?: string;
  domaine?: string;
  clientQuery?: string;
  limit?: number;
}

const logisticsAndDeliveriesTool: AssistantTool<LogisticsInput> = {
  name: 'logistics_and_deliveries',
  async run(ctx, input) {
    const limit = clampLimit(input.limit, 12, 20);
    const focus = input.focus ?? 'all';
    const ven = normalizeSearchText(String(input.vente ?? ''));
    const dom = normalizeSearchText(String(input.domaine ?? ''));
    const cli = normalizeSearchText(String(input.clientQuery ?? ''));
    const catalogMap = new Map(ctx.catalog.map((c) => [c.id, c]));

    const customers = computeCustomerSummaries(ctx.orders, catalogMap, ctx.settings);
    const readyCustomersAll = customers.filter((c) => {
      if (c.bouteillesPretesLBG <= 0) return false;
      if (cli) {
        const hay = normalizeSearchText(`${c.prenom} ${c.nom}`);
        if (!hay.includes(cli)) return false;
      }
      if (ven || dom) {
        return c.orders.some((o) => {
          if (o.statut !== 'recu_lbg') return false;
          const cat = catalogMap.get(o.catalogId);
          if (ven && !normalizeSearchText(o.vente).includes(ven)) return false;
          if (dom && !normalizeSearchText(cat?.domaine ?? '').includes(dom)) return false;
          return true;
        });
      }
      return true;
    });

    const pendingLotsAll = ctx.lots
      .filter((l) => {
        if (l.qteRecue >= l.qteCommandee) return false;
        const cat = catalogMap.get(l.catalogId);
        if (ven && !normalizeSearchText(cat?.vente ?? '').includes(ven)) return false;
        if (dom && !normalizeSearchText(cat?.domaine ?? '').includes(dom)) return false;
        return true;
      })
      .map((l) => {
        const cat = catalogMap.get(l.catalogId);
        return {
          id: l.id,
          catalogId: l.catalogId,
          domaine: cat?.domaine ?? 'Domaine',
          cuvee: cat?.cuvee ?? l.catalogId,
          dateAchat: l.dateAchat,
          referenceFacture: l.referenceFacture,
          qteCommandee: l.qteCommandee,
          qteRecue: l.qteRecue,
          restantARecevoir: l.qteCommandee - l.qteRecue,
          statutLot: l.statutLot,
          origin: l.origin ?? 'manual',
        };
      });

    const awaitingOrdersByVente = new Map<string, { vente: string; bottles: number; lines: number }>();
    for (const o of ctx.orders) {
      if (o.statut !== 'attente_reception') continue;
      const cat = catalogMap.get(o.catalogId);
      if (ven && !normalizeSearchText(o.vente).includes(ven)) continue;
      if (dom && !normalizeSearchText(cat?.domaine ?? '').includes(dom)) continue;
      const cur = awaitingOrdersByVente.get(o.vente) ?? {
        vente: o.vente,
        bottles: 0,
        lines: 0,
      };
      cur.bottles += o.qte;
      cur.lines += 1;
      awaitingOrdersByVente.set(o.vente, cur);
    }

    const campaigns = ctx.campaigns
      .filter((c) => {
        if (ven && !normalizeSearchText(c.nom).includes(ven)) return false;
        if (dom && !normalizeSearchText(c.domaine).includes(dom)) return false;
        return true;
      })
      .slice(0, limit);

    const readyTotalBottles = readyCustomersAll.reduce(
      (s, c) => s + c.bouteillesPretesLBG,
      0
    );
    const awaitingTotalBottles = Array.from(awaitingOrdersByVente.values()).reduce(
      (s, x) => s + x.bottles,
      0
    );
    const pendingLotBottles = pendingLotsAll.reduce(
      (s, l) => s + l.restantARecevoir,
      0
    );

    const readyCustomers = readyCustomersAll.slice(0, limit).map((c, idx) => ({
      key: c.key,
      displayName: maskClientName(
        c.prenom,
        c.nom,
        ctx.settings.anonymizeClients,
        idx
      ),
      bouteillesPretesLBG: c.bouteillesPretesLBG,
      bouteillesAttenteDomaine: c.bouteillesAttenteDomaine,
      ventes: Array.from(
        new Set(c.orders.filter((o) => o.statut === 'recu_lbg').map((o) => o.vente))
      ),
    }));

    return {
      focus,
      totals: {
        readyClientsCount: readyCustomersAll.length,
        readyTotalBottles,
        awaitingTotalBottles,
        pendingLotsCount: pendingLotsAll.length,
        pendingLotBottles,
      },
      readyCustomers,
      pendingLots: pendingLotsAll.slice(0, limit),
      awaitingByVente: Array.from(awaitingOrdersByVente.values()).slice(0, limit),
      campaigns,
    };
  },
  toCards(output) {
    const totals = (output.totals as Record<string, number>) ?? {};
    const readyCustomers = (output.readyCustomers as Array<Record<string, unknown>>) ?? [];
    const pendingLots = (output.pendingLots as Array<Record<string, unknown>>) ?? [];
    const campaigns = (output.campaigns as SalesCampaign[]) ?? [];
    const focus = String(output.focus ?? 'all');

    const cards: ResultCard[] = [];

    if (focus === 'all' || focus === 'ready_pickup') {
      cards.push({
        id: 'card_ready_pickup',
        title: 'Remises clients prêtes en cave',
        metrics: [
          {
            label: 'Prêtes en cave',
            value: `${totals.readyTotalBottles ?? 0} btl`,
            tone: (totals.readyTotalBottles ?? 0) > 0 ? 'ok' : 'neutral',
          },
          {
            label: 'Clients concernés',
            value: String(totals.readyClientsCount ?? 0),
          },
          {
            label: 'Attente domaine',
            value: `${totals.awaitingTotalBottles ?? 0} btl`,
            tone: (totals.awaitingTotalBottles ?? 0) > 0 ? 'warn' : 'neutral',
          },
        ],
        items: readyCustomers.slice(0, 8).map((c) => ({
          id: String(c.key),
          title: String(c.displayName),
          subtitle: `Ventes : ${(c.ventes as string[]).join(', ') || '—'}${Number(c.bouteillesAttenteDomaine) > 0 ? ` · +${c.bouteillesAttenteDomaine} btl en attente` : ''}`,
          badge: `${c.bouteillesPretesLBG} prête(s)`,
          badgeTone: 'ok',
          action: {
            type: 'navigate',
            tab: 'clients',
            clientKey: String(c.key),
          },
        })),
        actionLabel: 'Voir Rapports clients',
        action: { type: 'navigate', tab: 'clients' },
      });
    }

    if ((focus === 'all' || focus === 'pending_lots' || focus === 'awaiting_domain') && pendingLots.length > 0) {
      cards.push({
        id: 'card_pending_lots',
        title: `Lots fournisseurs à réceptionner (${totals.pendingLotsCount ?? 0})`,
        items: pendingLots.slice(0, 8).map((l) => ({
          id: String(l.id),
          title: `${l.domaine} — ${l.cuvee}`,
          subtitle: `${l.referenceFacture} · ${formatDateFR(String(l.dateAchat))}`,
          badge: `${l.restantARecevoir} btl attendue(s)`,
          badgeTone: 'warn',
          action: {
            type: 'navigate',
            tab: 'stock',
            search: String(l.cuvee),
            filter: 'attente',
          },
        })),
        actionLabel: 'Ouvrir Lots & Réceptions',
        action: { type: 'navigate', tab: 'stock', filter: 'attente' },
      });
    }

    if (focus === 'campaigns' && campaigns.length > 0) {
      cards.push({
        id: 'card_campaigns',
        title: 'Planning des ventes',
        items: campaigns.slice(0, 8).map((c) => ({
          id: c.id,
          title: c.nom,
          subtitle: `${formatDateFR(c.dateOuverture)} · ${c.canal}${c.contact ? ` · ${c.contact}` : ''}`,
          badge: c.statut,
          badgeTone:
            c.statut === 'En cours'
              ? 'brand'
              : c.statut === 'En attente domaine'
                ? 'warn'
                : 'neutral',
          action: { type: 'navigate', tab: 'dashboard' },
        })),
      });
    }

    return cards;
  },
};

// ---------------------------------------------------------------------------
// 3. stock_alerts_and_advances
// ---------------------------------------------------------------------------
interface StockAlertsInput {
  kind?: 'all' | 'deficit' | 'advance_unsold';
  limit?: number;
}

const stockAlertsAndAdvancesTool: AssistantTool<StockAlertsInput> = {
  name: 'stock_alerts_and_advances',
  async run(ctx, input) {
    const limit = clampLimit(input.limit, 12, 20);
    const kind = input.kind ?? 'all';
    const stockRows = computeStockSummaries(ctx.catalog, ctx.lots, ctx.orders);

    const deficitsAll = stockRows
      .filter((r) => r.disponibleVente < 0)
      .sort((a, b) => a.disponibleVente - b.disponibleVente);

    const advanceAll = stockRows
      .filter((r) => r.hasAdvanceStock && r.disponibleVente > 0)
      .sort((a, b) => b.capitalImmobiliseHT - a.capitalImmobiliseHT);

    const totalCapitalAdvanceHT = advanceAll.reduce(
      (s, r) => s + r.capitalImmobiliseHT,
      0
    );
    const totalAdvanceBottles = advanceAll.reduce(
      (s, r) => s + r.disponibleVente,
      0
    );
    const totalDeficitBottles = deficitsAll.reduce(
      (s, r) => s + Math.abs(r.disponibleVente),
      0
    );

    const isDemoMode = ctx.lots.some((l) => l.origin === 'demo');

    return {
      kind,
      dataMode: isDemoMode ? 'demo' : 'excel_strict',
      totals: {
        deficitCuveesCount: deficitsAll.length,
        totalDeficitBottles,
        advanceCuveesCount: advanceAll.length,
        totalAdvanceBottles,
        totalCapitalAdvanceHT: Number(totalCapitalAdvanceHT.toFixed(2)),
      },
      deficits: deficitsAll.slice(0, limit).map((r) => ({
        catalogId: r.catalog.id,
        domaine: r.catalog.domaine,
        cuvee: r.catalog.cuvee,
        tarifAchatHT: r.catalog.tarifAchatHT,
        missingBottles: Math.abs(r.disponibleVente),
        reserveClients: r.reserveClients,
        physiqueCave: r.physiqueCave,
      })),
      advances: advanceAll.slice(0, limit).map((r) => ({
        catalogId: r.catalog.id,
        domaine: r.catalog.domaine,
        cuvee: r.catalog.cuvee,
        disponibleVente: r.disponibleVente,
        physiqueCave: r.physiqueCave,
        enCommandeFournisseur: r.enCommandeFournisseur,
        capitalImmobiliseHT: Number(r.capitalImmobiliseHT.toFixed(2)),
        prixLbgTTC: r.catalog.prixLbgTTC,
        dispoPublic: r.catalog.dispoPublic,
      })),
    };
  },
  toCards(output) {
    const totals = (output.totals as Record<string, number>) ?? {};
    const deficits = (output.deficits as Array<Record<string, unknown>>) ?? [];
    const advances = (output.advances as Array<Record<string, unknown>>) ?? [];
    const kind = String(output.kind ?? 'all');
    const cards: ResultCard[] = [];

    if ((kind === 'all' || kind === 'deficit') && deficits.length > 0) {
      cards.push({
        id: 'card_deficits',
        title: `Déficits à commander au domaine (${totals.deficitCuveesCount ?? 0})`,
        tone: 'bad',
        metrics: [
          {
            label: 'Manquants',
            value: `${totals.totalDeficitBottles ?? 0} btl`,
            tone: 'bad',
          },
        ],
        items: deficits.slice(0, 8).map((d) => ({
          id: String(d.catalogId),
          title: `${d.domaine} — ${d.cuvee}`,
          subtitle: `Réservé : ${d.reserveClients} · En cave : ${d.physiqueCave} · Clic pour pré-remplir le réassort`,
          badge: `-${d.missingBottles} btl`,
          badgeTone: 'bad',
          action: {
            type: 'prefill_supplier_lot',
            prefill: {
              catalogId: String(d.catalogId),
              typeAchat: 'allocation',
              qteCommandee: Number(d.missingBottles ?? 6),
              coutUnitaireHT: Number(d.tarifAchatHT ?? 0),
              statutLot: 'commande_payee',
            },
          },
        })),
        actionLabel: 'Voir déficits dans Stock',
        action: { type: 'navigate', tab: 'stock', filter: 'deficit' },
      });
    }

    if (kind === 'all' || kind === 'advance_unsold') {
      cards.push({
        id: 'card_advances',
        title: `Stock acheté en avance disponible (${totals.totalAdvanceBottles ?? 0} btl)`,
        metrics: [
          {
            label: 'Capital immobilisé HT',
            value: formatEUR(totals.totalCapitalAdvanceHT ?? 0),
            tone: 'brand',
          },
          {
            label: 'Références libres',
            value: String(totals.advanceCuveesCount ?? 0),
          },
        ],
        items: advances.slice(0, 8).map((a) => ({
          id: String(a.catalogId),
          title: `${a.domaine} — ${a.cuvee}`,
          subtitle: `Cave : ${a.physiqueCave} · Transit : ${a.enCommandeFournisseur} · Prix LBG ${formatEUR(Number(a.prixLbgTTC ?? 0))}`,
          badge: `+${a.disponibleVente} btl`,
          badgeTone: 'ok',
          rightValue: formatEUR(Number(a.capitalImmobiliseHT ?? 0)),
          action: {
            type: 'navigate',
            tab: 'stock',
            search: String(a.cuvee),
          },
        })),
        actionLabel: 'Ouvrir Carte des vins',
        action: { type: 'navigate', tab: 'winelist' },
      });
    }

    return cards;
  },
};

// ---------------------------------------------------------------------------
// 4. profitability_and_pricing
// ---------------------------------------------------------------------------
interface ProfitabilityInput {
  groupBy?: 'campaign' | 'domaine' | 'cuvee';
  vente?: string;
  domaine?: string;
  lowMarginThresholdPct?: number;
  simulateQuery?: string;
  simulatePriceTTC?: number;
  simulateBuyHT?: number;
  limit?: number;
}

const profitabilityAndPricingTool: AssistantTool<ProfitabilityInput> = {
  name: 'profitability_and_pricing',
  async run(ctx, input) {
    const limit = clampLimit(input.limit, 12, 20);
    const groupBy = input.groupBy ?? 'campaign';
    const ven = normalizeSearchText(String(input.vente ?? ''));
    const dom = normalizeSearchText(String(input.domaine ?? ''));
    const threshold =
      typeof input.lowMarginThresholdPct === 'number'
        ? input.lowMarginThresholdPct
        : 5;

    const catalogMap = new Map(ctx.catalog.map((c) => [c.id, c]));

    let caTTC = 0;
    let caHT = 0;
    let coutVinHT = 0;
    let fraisLogistique = 0;
    let margeNette = 0;
    let totalBottles = 0;
    let persoBottles = 0;
    let persoCostHT = 0;

    const groups = new Map<
      string,
      {
        label: string;
        bottles: number;
        caTTC: number;
        coutTotalHT: number;
        margeNette: number;
      }
    >();

    for (const o of ctx.orders) {
      if (o.statut === 'annule') continue;
      const cat = catalogMap.get(o.catalogId);
      if (ven && !normalizeSearchText(o.vente).includes(ven)) continue;
      if (dom && !normalizeSearchText(cat?.domaine ?? '').includes(dom)) continue;

      const lineEcon = computeOrderLineEconomics(o, cat, ctx.settings);
      if (lineEcon.isPerso) {
        persoBottles += o.qte;
        persoCostHT += lineEcon.coutVinHT;
        continue;
      }

      totalBottles += o.qte;
      caTTC += lineEcon.caTTC;
      caHT += lineEcon.caHT;
      coutVinHT += lineEcon.coutVinHT;
      fraisLogistique += lineEcon.fraisLogistiqueHT;
      margeNette += lineEcon.margeEuroTotal;

      const key =
        groupBy === 'domaine'
          ? cat?.domaine ?? 'Autre domaine'
          : groupBy === 'cuvee'
            ? cat
              ? `${cat.domaine} — ${cat.cuvee}`
              : o.produitLabel
            : o.vente;

      const cur = groups.get(key) ?? {
        label: key,
        bottles: 0,
        caTTC: 0,
        coutTotalHT: 0,
        margeNette: 0,
      };
      cur.bottles += o.qte;
      cur.caTTC += lineEcon.caTTC;
      cur.coutTotalHT += lineEcon.coutVinHT + lineEcon.fraisLogistiqueHT;
      cur.margeNette += lineEcon.margeEuroTotal;
      groups.set(key, cur);
    }

    const totalCostHT = coutVinHT + fraisLogistique;
    const margePct = totalCostHT > 0 ? (margeNette / totalCostHT) * 100 : 0;

    const rankedGroups = Array.from(groups.values())
      .map((g) => ({
        ...g,
        caTTC: Number(g.caTTC.toFixed(2)),
        margeNette: Number(g.margeNette.toFixed(2)),
        margePct:
          g.coutTotalHT > 0
            ? Number(((g.margeNette / g.coutTotalHT) * 100).toFixed(1))
            : 0,
      }))
      .sort((a, b) => b.margeNette - a.margeNette)
      .slice(0, limit);

    const lowMarginCuvees = ctx.catalog
      .filter((c) => {
        if (ven && !normalizeSearchText(c.vente).includes(ven)) return false;
        if (dom && !normalizeSearchText(c.domaine).includes(dom)) return false;
        return c.prixLbgTTC > 0;
      })
      .map((c) => ({
        item: c,
        econ: computeBottleEconomics(c, ctx.settings),
      }))
      .filter((x) => x.econ.margePct < threshold || x.econ.margeEuro < 1)
      .sort((a, b) => a.econ.margeEuro - b.econ.margeEuro)
      .slice(0, limit)
      .map(({ item, econ }) => ({
        id: item.id,
        domaine: item.domaine,
        cuvee: item.cuvee,
        tarifAchatHT: item.tarifAchatHT,
        prixLbgTTC: item.prixLbgTTC,
        benchTTC: item.benchTTC,
        tarifBaseConseilleTTC: econ.tarifBaseConseilleTTC,
        margeEuro: Number(econ.margeEuro.toFixed(2)),
        margePct: Number(econ.margePct.toFixed(1)),
      }));

    let simulation: Record<string, unknown> | null = null;
    if (input.simulateQuery) {
      const matched = resolveCatalogMatches(ctx.catalog, input.simulateQuery)[0];
      if (matched) {
        const before = computeBottleEconomics(matched, ctx.settings);
        const targetTTC =
          typeof input.simulatePriceTTC === 'number' && input.simulatePriceTTC > 0
            ? input.simulatePriceTTC
            : matched.prixLbgTTC;
        const targetBuyHT =
          typeof input.simulateBuyHT === 'number' && input.simulateBuyHT >= 0
            ? input.simulateBuyHT
            : matched.tarifAchatHT;
        const after = computeBottleEconomics(
          matched,
          ctx.settings,
          targetTTC,
          undefined,
          targetBuyHT
        );

        simulation = {
          catalogId: matched.id,
          domaine: matched.domaine,
          cuvee: matched.cuvee,
          benchTTC: matched.benchTTC,
          benchSource: matched.benchSource,
          before: {
            prixTTC: before.prixTTC,
            tarifAchatHT: matched.tarifAchatHT,
            margeEuro: Number(before.margeEuro.toFixed(2)),
            margePct: Number(before.margePct.toFixed(1)),
            vsBenchPct:
              before.vsBenchPct !== null
                ? Number(before.vsBenchPct.toFixed(1))
                : null,
          },
          after: {
            prixTTC: after.prixTTC,
            tarifAchatHT: targetBuyHT,
            margeEuro: Number(after.margeEuro.toFixed(2)),
            margePct: Number(after.margePct.toFixed(1)),
            vsBenchPct:
              after.vsBenchPct !== null
                ? Number(after.vsBenchPct.toFixed(1))
                : null,
            tarifBaseConseilleTTC: after.tarifBaseConseilleTTC,
          },
        };
      }
    }

    return {
      groupBy,
      summary: {
        totalBottles,
        caTTC: Number(caTTC.toFixed(2)),
        caHT: Number(caHT.toFixed(2)),
        coutVinHT: Number(coutVinHT.toFixed(2)),
        fraisLogistique: Number(fraisLogistique.toFixed(2)),
        margeNette: Number(margeNette.toFixed(2)),
        margePct: Number(margePct.toFixed(1)),
        persoBottles,
        persoCostHT: Number(persoCostHT.toFixed(2)),
      },
      rankedGroups,
      lowMarginCuvees,
      simulation,
    };
  },
  toCards(output) {
    const summary = (output.summary as Record<string, number>) ?? {};
    const ranked = (output.rankedGroups as Array<Record<string, unknown>>) ?? [];
    const lowMargin =
      (output.lowMarginCuvees as Array<Record<string, unknown>>) ?? [];
    const sim = output.simulation as Record<string, unknown> | null;
    const cards: ResultCard[] = [];

    if (sim) {
      const before = sim.before as Record<string, number | null>;
      const after = sim.after as Record<string, number | null>;
      cards.push({
        id: 'card_price_simulation',
        title: `Simulation tarif — ${sim.domaine} ${sim.cuvee}`,
        subtitle: sim.benchTTC
          ? `Benchmark ${sim.benchSource || 'caviste'} : ${formatEUR(Number(sim.benchTTC))}`
          : undefined,
        metrics: [
          {
            label: 'Marge avant',
            value: `${formatEUR(Number(before.margeEuro ?? 0), true)} (${formatPct(Number(before.margePct ?? 0))})`,
            tone: Number(before.margeEuro ?? 0) < 0 ? 'bad' : 'neutral',
          },
          {
            label: 'Marge simulée',
            value: `${formatEUR(Number(after.margeEuro ?? 0), true)} (${formatPct(Number(after.margePct ?? 0))})`,
            tone: Number(after.margeEuro ?? 0) > 0 ? 'ok' : 'bad',
          },
          {
            label: 'Écart marché',
            value:
              after.vsBenchPct !== null
                ? formatPct(Number(after.vsBenchPct), true)
                : '—',
          },
        ],
        actionLabel: 'Ajuster dans Catalogue',
        action: {
          type: 'navigate',
          tab: 'catalog',
          search: String(sim.cuvee),
        },
      });
    }

    cards.push({
      id: 'card_profitability',
      title: 'Rentabilité nette du négoce',
      metrics: [
        {
          label: 'CA TTC validé',
          value: formatEUR(summary.caTTC ?? 0),
        },
        {
          label: 'Marge nette',
          value: formatEUR(summary.margeNette ?? 0, true),
          tone: (summary.margeNette ?? 0) >= 0 ? 'ok' : 'bad',
        },
        {
          label: 'Taux net livré',
          value: formatPct(summary.margePct ?? 0),
        },
      ],
      items: ranked.slice(0, 8).map((g) => ({
        id: String(g.label),
        title: String(g.label),
        subtitle: `${g.bottles} btl · CA ${formatEUR(Number(g.caTTC ?? 0))}`,
        badge: formatPct(Number(g.margePct ?? 0)),
        badgeTone: Number(g.margeNette ?? 0) >= 0 ? 'ok' : 'bad',
        rightValue: formatEUR(Number(g.margeNette ?? 0), true),
        action: {
          type: 'navigate',
          tab: 'finance',
          vente: output.groupBy === 'campaign' ? String(g.label) : undefined,
        },
      })),
      actionLabel: 'Ouvrir Bilans financiers',
      action: { type: 'navigate', tab: 'finance' },
    });

    if (!sim && lowMargin.length > 0) {
      cards.push({
        id: 'card_low_margin',
        title: `Cuvées à surveiller (< 1 € ou sous seuil)`,
        tone: 'warn',
        items: lowMargin.slice(0, 6).map((x) => ({
          id: String(x.id),
          title: `${x.domaine} — ${x.cuvee}`,
          subtitle: `LBG ${formatEUR(Number(x.prixLbgTTC ?? 0))} · Conseillé base ${formatEUR(Number(x.tarifBaseConseilleTTC ?? 0))}`,
          badge: formatPct(Number(x.margePct ?? 0)),
          badgeTone: Number(x.margeEuro ?? 0) < 0 ? 'bad' : 'warn',
          rightValue: formatEUR(Number(x.margeEuro ?? 0), true),
          action: {
            type: 'navigate',
            tab: 'catalog',
            search: String(x.cuvee),
          },
        })),
      });
    }

    return cards;
  },
};

// ---------------------------------------------------------------------------
// 5. customer_insights_and_recap
// ---------------------------------------------------------------------------
interface CustomerInsightsInput {
  clientQuery?: string;
  affinityQuery?: string;
  onlyReadyForPickup?: boolean;
  includeWhatsAppDraft?: boolean;
  limit?: number;
}

const customerInsightsAndRecapTool: AssistantTool<CustomerInsightsInput> = {
  name: 'customer_insights_and_recap',
  async run(ctx, input) {
    const limit = clampLimit(input.limit, 10, 20);
    const catalogMap = new Map(ctx.catalog.map((c) => [c.id, c]));
    const customers = computeCustomerSummaries(ctx.orders, catalogMap, ctx.settings);

    const cli = normalizeSearchText(String(input.clientQuery ?? ''));
    const aff = normalizeSearchText(String(input.affinityQuery ?? ''));

    const filtered = customers.filter((c) => {
      if (input.onlyReadyForPickup && c.bouteillesPretesLBG <= 0) return false;
      if (cli) {
        const hay = normalizeSearchText(`${c.prenom} ${c.nom} ${c.email}`);
        const tokens = cli.split(/\s+/).filter((t) => t.length > 1);
        if (!hay.includes(cli) && !tokens.every((t) => hay.includes(t))) {
          return false;
        }
      }
      if (aff) {
        const hasAffinity = c.orders.some((o) => {
          if (o.statut === 'annule') return false;
          const cat = catalogMap.get(o.catalogId);
          const hay = normalizeSearchText(
            `${cat?.domaine ?? ''} ${cat?.region ?? ''} ${cat?.color ?? ''} ${o.produitLabel} ${o.vente}`
          );
          return hay.includes(aff);
        });
        if (!hasAffinity) return false;
      }
      return true;
    });

    let whatsappDraft: { clientDisplayName: string; text: string } | null = null;
    if (
      (input.includeWhatsAppDraft || cli) &&
      filtered.length === 1 &&
      !ctx.settings.anonymizeClients
    ) {
      const target = filtered[0];
      const readyLines = target.orders.filter((o) => o.statut === 'recu_lbg');
      const waitingLines = target.orders.filter(
        (o) => o.statut === 'attente_reception'
      );
      if (readyLines.length > 0 || waitingLines.length > 0) {
        const lines: string[] = [
          `Bonjour ${target.prenom || target.nom},`,
          `Voici le point sur vos réservations Le Bon Grain d'Ivresse :`,
          '',
        ];
        if (readyLines.length > 0) {
          lines.push('Bouteilles reçues et prêtes à être remises :');
          readyLines.forEach((o) =>
            lines.push(`- ${o.qte}x ${o.produitLabel} (${o.vente})`)
          );
          lines.push('');
        }
        if (waitingLines.length > 0) {
          lines.push('Bouteilles encore en attente de réception domaine :');
          waitingLines.forEach((o) =>
            lines.push(`- ${o.qte}x ${o.produitLabel} (${o.vente})`)
          );
          lines.push('');
        }
        lines.push('À très vite,\nRomain — Le Bon Grain d’Ivresse');
        whatsappDraft = {
          clientDisplayName: `${target.prenom} ${target.nom}`.trim(),
          text: lines.join('\n'),
        };
      }
    }

    const mapped = filtered.slice(0, limit).map((c, idx) => ({
      key: c.key,
      displayName: maskClientName(
        c.prenom,
        c.nom,
        ctx.settings.anonymizeClients,
        idx
      ),
      totalCommandes: c.totalCommandes,
      totalBouteilles: c.totalBouteilles,
      caTotalTTC: Number(c.caTotalTTC.toFixed(2)),
      margeTotaleEuro: Number(c.margeTotaleEuro.toFixed(2)),
      margeMoyennePct: Number(c.margeMoyennePct.toFixed(1)),
      panierMoyenTTC: Number(c.panierMoyenTTC.toFixed(2)),
      bouteillesPretesLBG: c.bouteillesPretesLBG,
      bouteillesAttenteDomaine: c.bouteillesAttenteDomaine,
      derniereDate: c.derniereDate,
      domainesFavoris: c.domainesFavoris,
    }));

    return {
      totalClients: filtered.length,
      anonymized: ctx.settings.anonymizeClients,
      customers: mapped,
      whatsappDraft,
    };
  },
  toCards(output) {
    const customers = (output.customers as Array<Record<string, unknown>>) ?? [];
    const draft = output.whatsappDraft as {
      clientDisplayName: string;
      text: string;
    } | null;

    const cards: ResultCard[] = [
      {
        id: 'card_customers',
        title: `Clients (${Number(output.totalClients ?? customers.length)})`,
        items: customers.slice(0, 8).map((c) => ({
          id: String(c.key),
          title: String(c.displayName),
          subtitle: `${c.totalBouteilles} btl · Marge ${formatEUR(Number(c.margeTotaleEuro ?? 0), true)} · Favoris : ${(c.domainesFavoris as string[]).join(', ') || '—'}`,
          badge:
            Number(c.bouteillesPretesLBG) > 0
              ? `${c.bouteillesPretesLBG} prête(s)`
              : Number(c.bouteillesAttenteDomaine) > 0
                ? `${c.bouteillesAttenteDomaine} att.`
                : 'À jour',
          badgeTone:
            Number(c.bouteillesPretesLBG) > 0
              ? 'ok'
              : Number(c.bouteillesAttenteDomaine) > 0
                ? 'warn'
                : 'neutral',
          rightValue: formatEUR(Number(c.caTotalTTC ?? 0)),
          action: {
            type: 'navigate',
            tab: 'clients',
            clientKey: String(c.key),
          },
        })),
        actionLabel: 'Ouvrir Rapports clients',
        action: { type: 'navigate', tab: 'clients' },
      },
    ];

    if (draft) {
      cards.push({
        id: 'card_whatsapp_draft',
        title: `Message WhatsApp prêt pour ${draft.clientDisplayName}`,
        subtitle: draft.text.split('\n').slice(0, 4).join(' · '),
        actionLabel: 'Copier le message client',
        action: {
          type: 'copy_text',
          label: `Récap WhatsApp (${draft.clientDisplayName})`,
          text: draft.text,
        },
      });
    }

    return cards;
  },
};

// ---------------------------------------------------------------------------
// 6. accounting_and_vat
// ---------------------------------------------------------------------------
interface AccountingInput {
  periodMonth?: string;
  onlyUninvoiced?: boolean;
  limit?: number;
}

const accountingAndVatTool: AssistantTool<AccountingInput> = {
  name: 'accounting_and_vat',
  async run(ctx, input) {
    const limit = clampLimit(input.limit, 12, 20);
    const periodMonth =
      input.periodMonth && /^\d{4}-\d{2}$/.test(input.periodMonth.trim())
        ? input.periodMonth.trim()
        : 'all';

    const validOrders = ctx.orders.filter(
      (o) =>
        o.statut !== 'annule' &&
        o.source !== 'perso' &&
        o.prixUnitaireTTC > 0 &&
        (periodMonth === 'all' || o.date.startsWith(periodMonth))
    );
    const lots = ctx.lots.filter(
      (l) => periodMonth === 'all' || l.dateAchat.startsWith(periodMonth)
    );

    let ventesTTC = 0;
    let ventesHT = 0;
    let tvaCollectee = 0;

    const invoiceGroups = new Map<
      string,
      {
        refCommande: string;
        invoiceNumber: string | null;
        date: string;
        vente: string;
        clientDisplayName: string;
        totalTTC: number;
      }
    >();

    for (const o of validOrders) {
      const rate = (o.tvaRatePct ?? ctx.settings.tvaRate * 100) / 100;
      const lineTTC = o.prixUnitaireTTC * o.qte;
      const lineHT = lineTTC / (1 + rate);
      ventesTTC += lineTTC;
      ventesHT += lineHT;
      tvaCollectee += lineTTC - lineHT;

      const cur = invoiceGroups.get(o.refCommande);
      if (cur) {
        cur.totalTTC += lineTTC;
        if (!cur.invoiceNumber && o.invoiceNumber) {
          cur.invoiceNumber = o.invoiceNumber;
        }
      } else {
        invoiceGroups.set(o.refCommande, {
          refCommande: o.refCommande,
          invoiceNumber: o.invoiceNumber || null,
          date: o.date,
          vente: o.vente,
          clientDisplayName: maskClientName(
            o.prenomClient,
            o.nomClient,
            ctx.settings.anonymizeClients
          ),
          totalTTC: lineTTC,
        });
      }
    }

    let achatsHT = 0;
    let tvaDeductible = 0;
    for (const l of lots) {
      const rate = (l.tvaRatePct ?? ctx.settings.tvaRate * 100) / 100;
      const baseHT = l.coutUnitaireHT * l.qteCommandee + (l.shippingHT ?? 0);
      achatsHT += baseHT;
      tvaDeductible += baseHT * rate;
    }

    const allInvoices = Array.from(invoiceGroups.values()).sort((a, b) =>
      b.date.localeCompare(a.date)
    );
    const uninvoiced = allInvoices.filter((i) => !i.invoiceNumber);

    return {
      periodMonth,
      vat: {
        ventesTTC: Number(ventesTTC.toFixed(2)),
        ventesHT: Number(ventesHT.toFixed(2)),
        tvaCollectee: Number(tvaCollectee.toFixed(2)),
        achatsHT: Number(achatsHT.toFixed(2)),
        tvaDeductible: Number(tvaDeductible.toFixed(2)),
        tvaNette: Number((tvaCollectee - tvaDeductible).toFixed(2)),
      },
      counts: {
        totalBillableOrders: allInvoices.length,
        invoicedCount: allInvoices.length - uninvoiced.length,
        uninvoicedCount: uninvoiced.length,
      },
      uninvoicedOrders: uninvoiced.slice(0, limit).map((i) => ({
        ...i,
        totalTTC: Number(i.totalTTC.toFixed(2)),
      })),
    };
  },
  toCards(output) {
    const vat = (output.vat as Record<string, number>) ?? {};
    const counts = (output.counts as Record<string, number>) ?? {};
    const uninvoiced =
      (output.uninvoicedOrders as Array<Record<string, unknown>>) ?? [];
    const periodMonth = String(output.periodMonth ?? 'all');

    return [
      {
        id: 'card_vat',
        title: `TVA & Facturation (${periodMonth === 'all' ? 'Toute période' : periodMonth})`,
        metrics: [
          {
            label: 'TVA collectée',
            value: formatEUR(vat.tvaCollectee ?? 0),
          },
          {
            label: 'TVA déductible',
            value: formatEUR(vat.tvaDeductible ?? 0),
            tone: 'ok',
          },
          {
            label:
              (vat.tvaNette ?? 0) >= 0 ? 'TVA à reverser' : 'Crédit de TVA',
            value: formatEUR(Math.abs(vat.tvaNette ?? 0)),
            tone: (vat.tvaNette ?? 0) >= 0 ? 'warn' : 'ok',
          },
        ],
        items: uninvoiced.slice(0, 8).map((u) => ({
          id: String(u.refCommande),
          title: `${u.clientDisplayName} — Réf ${u.refCommande}`,
          subtitle: `${formatDateFR(String(u.date))} · ${u.vente}`,
          badge: 'À facturer',
          badgeTone: 'warn',
          rightValue: formatEUR(Number(u.totalTTC ?? 0)),
          action: {
            type: 'navigate',
            tab: 'accounting',
            periodMonth,
          },
        })),
        actionLabel: `Ouvrir Comptabilité (${counts.uninvoicedCount ?? 0} à émettre)`,
        action: {
          type: 'navigate',
          tab: 'accounting',
          periodMonth,
        },
      },
    ];
  },
};

// ---------------------------------------------------------------------------
// 7. prepare_operation (aide à la saisie pré-remplie + anti-doublon)
// ---------------------------------------------------------------------------
interface PrepareOperationInput {
  operation:
    | 'direct_order'
    | 'perso_tasting'
    | 'supplier_lot'
    | 'new_catalog_item'
    | 'import_helloasso'
    | 'invoice_ai'
    | 'navigate_tab';
  cuveeQuery?: string;
  domaine?: string;
  clientName?: string;
  quantity?: number;
  unitPriceTTC?: number;
  unitCostHT?: number;
  lotType?: LotType;
  lotStatus?: LotStatus;
  orderStatus?: Exclude<OrderStatus, 'annule'>;
  region?: string;
  color?: WineColor;
  vente?: string;
  referenceFacture?: string;
  notes?: string;
  targetTab?: ActiveTab;
}

const prepareOperationTool: AssistantTool<PrepareOperationInput> = {
  name: 'prepare_operation',
  async run(ctx, input) {
    const op = input.operation;

    if (op === 'import_helloasso') {
      return {
        operation: op,
        action: { type: 'open_modal', modal: 'import_helloasso' } as AssistantAction,
        summary: 'Ouverture de l’assistant d’import HelloAsso.',
      };
    }

    if (op === 'invoice_ai') {
      return {
        operation: op,
        action: { type: 'open_modal', modal: 'invoice_ai' } as AssistantAction,
        summary: 'Ouverture de l’analyseur IA de facture (PDF, photo ou texte).',
      };
    }

    if (op === 'navigate_tab') {
      const tab = input.targetTab ?? 'dashboard';
      return {
        operation: op,
        action: {
          type: 'navigate',
          tab,
          search: input.cuveeQuery || input.domaine || input.clientName,
          vente: input.vente,
        } as AssistantAction,
        summary: `Ouverture de l’onglet ${tab}.`,
      };
    }

    const searchNeedle = [input.domaine, input.cuveeQuery]
      .filter(Boolean)
      .join(' ')
      .trim();
    const matchedItems = searchNeedle
      ? resolveCatalogMatches(ctx.catalog, searchNeedle)
      : [];
    const matchedWine = matchedItems[0] ?? null;
    const stockRows = computeStockSummaries(ctx.catalog, ctx.lots, ctx.orders);
    const matchedStock = matchedWine
      ? stockRows.find((r) => r.catalog.id === matchedWine.id) ?? null
      : null;

    if (op === 'new_catalog_item') {
      const duplicateMatches = matchedItems.slice(0, 3).map((m) => ({
        id: m.id,
        domaine: m.domaine,
        cuvee: m.cuvee,
        tarifAchatHT: m.tarifAchatHT,
        prixLbgTTC: m.prixLbgTTC,
      }));

      const prefill: CatalogItemPrefill = {
        domaine: input.domaine?.trim() || '',
        cuvee: input.cuveeQuery?.trim() || '',
        vente: input.vente?.trim() || 'Nouvelle sélection 2026',
        region: input.region?.trim() || 'Bourgogne',
        color: input.color || 'Blanc',
        tarifAchatHT:
          typeof input.unitCostHT === 'number' ? input.unitCostHT : undefined,
        prixLbgTTC:
          typeof input.unitPriceTTC === 'number'
            ? input.unitPriceTTC
            : undefined,
      };

      return {
        operation: op,
        duplicateDetected: duplicateMatches.length > 0,
        duplicateMatches,
        prefill,
        action: {
          type: 'prefill_catalog_item',
          prefill,
        } as AssistantAction,
      };
    }

    if (op === 'supplier_lot') {
      const qty = Math.max(1, Number(input.quantity ?? 6));
      const prefill: SupplierLotPrefill = {
        catalogId: matchedWine?.id,
        typeAchat: input.lotType ?? 'avance',
        qteCommandee: qty,
        coutUnitaireHT:
          typeof input.unitCostHT === 'number'
            ? input.unitCostHT
            : matchedWine?.tarifAchatHT,
        statutLot: input.lotStatus ?? 'commande_payee',
        referenceFacture: input.referenceFacture?.trim() || undefined,
        notes: input.notes?.trim() || undefined,
      };

      return {
        operation: op,
        matchedWine: matchedWine
          ? {
              id: matchedWine.id,
              domaine: matchedWine.domaine,
              cuvee: matchedWine.cuvee,
              tarifAchatHT: matchedWine.tarifAchatHT,
              disponibleVente: matchedStock?.disponibleVente ?? 0,
            }
          : null,
        prefill,
        action: {
          type: 'prefill_supplier_lot',
          prefill,
        } as AssistantAction,
      };
    }

    // direct_order ou perso_tasting
    const isPerso = op === 'perso_tasting';
    const qty = Math.max(1, Number(input.quantity ?? 1));
    const catalogMap = new Map(ctx.catalog.map((c) => [c.id, c]));
    const customers = computeCustomerSummaries(ctx.orders, catalogMap, ctx.settings);

    let matchedCustomer: (typeof customers)[number] | null = null;
    let prenomClient = '';
    let nomClient = '';
    let emailClient = '';

    if (isPerso) {
      prenomClient = 'Romain';
      nomClient = 'Becker (Cave perso)';
    } else if (input.clientName?.trim()) {
      const cNeedle = normalizeSearchText(input.clientName);
      const tokens = cNeedle.split(/\s+/).filter(Boolean);
      matchedCustomer =
        customers.find((c) => {
          const full = normalizeSearchText(`${c.prenom} ${c.nom}`);
          return full.includes(cNeedle) || tokens.every((t) => full.includes(t));
        }) ?? null;

      if (matchedCustomer) {
        prenomClient = matchedCustomer.prenom;
        nomClient = matchedCustomer.nom;
        emailClient = matchedCustomer.email;
      } else {
        const parts = input.clientName.trim().split(/\s+/);
        prenomClient = parts.length > 1 ? parts[0] : '';
        nomClient =
          parts.length > 1 ? parts.slice(1).join(' ') : input.clientName.trim();
      }
    }

    const dispo = matchedStock?.disponibleVente ?? 0;
    const stockWarning =
      matchedWine && qty > dispo
        ? `Attention : seulement ${dispo} btl disponibles à la vente pour ${matchedWine.cuvee} (demande : ${qty} btl).`
        : null;

    const prefill: DirectOrderPrefill = {
      catalogId: matchedWine?.id,
      prenomClient: prenomClient || undefined,
      nomClient: nomClient || undefined,
      emailClient: emailClient || undefined,
      qte: qty,
      prixOverride: isPerso
        ? 0
        : typeof input.unitPriceTTC === 'number'
          ? input.unitPriceTTC
          : matchedWine?.prixLbgTTC,
      source: isPerso ? 'perso' : 'direct',
      statut: isPerso
        ? 'remis_client'
        : input.orderStatus ??
          (matchedStock && matchedStock.physiqueCave >= qty
            ? 'recu_lbg'
            : 'attente_reception'),
      notes: input.notes?.trim() || undefined,
    };

    return {
      operation: op,
      matchedWine: matchedWine
        ? {
            id: matchedWine.id,
            domaine: matchedWine.domaine,
            cuvee: matchedWine.cuvee,
            prixLbgTTC: matchedWine.prixLbgTTC,
            disponibleVente: dispo,
          }
        : null,
      matchedExistingCustomer: matchedCustomer
        ? {
            key: matchedCustomer.key,
            displayName: maskClientName(
              matchedCustomer.prenom,
              matchedCustomer.nom,
              ctx.settings.anonymizeClients
            ),
          }
        : null,
      stockWarning,
      prefill,
      action: {
        type: 'prefill_direct_order',
        prefill,
      } as AssistantAction,
    };
  },
  toCards(output) {
    const op = String(output.operation ?? '');
    const action = output.action as AssistantAction | undefined;

    if (op === 'import_helloasso') {
      return [
        {
          id: 'card_prep_helloasso',
          title: 'Import listing HelloAsso',
          subtitle: 'Collez vos lignes Excel/CSV ou déposez votre fichier .xlsx.',
          actionLabel: 'Ouvrir Importer HelloAsso',
          action,
        },
      ];
    }

    if (op === 'invoice_ai') {
      return [
        {
          id: 'card_prep_invoice',
          title: 'Analyse IA de facture',
          subtitle: 'Importez un PDF/photo de facture domaine ou client.',
          actionLabel: 'Ouvrir Facture IA',
          action,
        },
      ];
    }

    if (op === 'navigate_tab') {
      return [
        {
          id: 'card_prep_nav',
          title: String(output.summary ?? 'Navigation'),
          actionLabel: 'Aller à l’écran',
          action,
        },
      ];
    }

    if (op === 'new_catalog_item') {
      const dupes =
        (output.duplicateMatches as Array<Record<string, unknown>>) ?? [];
      const prefill = output.prefill as CatalogItemPrefill;
      return [
        {
          id: 'card_prep_catalog',
          title: dupes.length > 0
            ? 'Doublon potentiel détecté au catalogue'
            : `Nouvelle cuvée prête : ${prefill.domaine} ${prefill.cuvee}`,
          tone: dupes.length > 0 ? 'warn' : 'brand',
          subtitle:
            dupes.length > 0
              ? 'Vérifiez si la cuvée existe déjà ci-dessous avant d’en créer une nouvelle.'
              : `${prefill.region} · ${prefill.color}`,
          items: dupes.map((d) => ({
            id: String(d.id),
            title: `${d.domaine} — ${d.cuvee}`,
            subtitle: `EXW ${formatEUR(Number(d.tarifAchatHT ?? 0))} · Vente ${formatEUR(Number(d.prixLbgTTC ?? 0))}`,
            badge: 'Déjà au catalogue',
            badgeTone: 'warn',
            action: {
              type: 'prefill_supplier_lot',
              prefill: {
                catalogId: String(d.id),
                typeAchat: 'avance',
                qteCommandee: 6,
                coutUnitaireHT: Number(d.tarifAchatHT ?? 0),
              },
            },
          })),
          actionLabel:
            dupes.length > 0
              ? 'Créer quand même (pré-rempli)'
              : 'Ouvrir formulaire nouvelle cuvée',
          action,
        },
      ];
    }

    if (op === 'supplier_lot') {
      const wine = output.matchedWine as Record<string, unknown> | null;
      const prefill = output.prefill as SupplierLotPrefill;
      return [
        {
          id: 'card_prep_lot',
          title: wine
            ? `Achat fournisseur préparé : ${wine.domaine} — ${wine.cuvee}`
            : 'Nouvel achat fournisseur / avance',
          tone: 'brand',
          metrics: [
            { label: 'Quantité', value: `${prefill.qteCommandee ?? 6} btl` },
            {
              label: 'Coût EXW HT',
              value: formatEUR(Number(prefill.coutUnitaireHT ?? 0)),
            },
            {
              label: 'Nature',
              value:
                prefill.typeAchat === 'avance'
                  ? 'Achat en avance'
                  : prefill.typeAchat === 'cave'
                    ? 'Stock cave'
                    : 'Allocation',
            },
          ],
          actionLabel: 'Ouvrir formulaire pré-rempli',
          action,
        },
      ];
    }

    // direct_order / perso_tasting
    const wine = output.matchedWine as Record<string, unknown> | null;
    const prefill = output.prefill as DirectOrderPrefill;
    const warning = output.stockWarning as string | null;
    return [
      {
        id: 'card_prep_order',
        title:
          op === 'perso_tasting'
            ? 'Sortie cave perso préparée'
            : 'Vente directe préparée (à valider)',
        subtitle: warning ?? (wine ? `${wine.domaine} — ${wine.cuvee}` : 'Sélectionner la cuvée dans le formulaire'),
        tone: warning ? 'warn' : 'brand',
        metrics: [
          { label: 'Quantité', value: `${prefill.qte ?? 1} btl` },
          {
            label: 'Prix unitaire TTC',
            value: formatEUR(Number(prefill.prixOverride ?? 0)),
          },
          {
            label: 'Stock libre actuel',
            value: wine ? `${wine.disponibleVente} btl` : '—',
            tone: warning ? 'bad' : 'ok',
          },
        ],
        actionLabel: 'Ouvrir formulaire pré-rempli',
        action,
      },
    ];
  },
};

export const TOOLS: Record<AssistantToolName, AssistantTool<any, any>> = {
  search_catalog_and_stock: searchCatalogAndStockTool,
  logistics_and_deliveries: logisticsAndDeliveriesTool,
  stock_alerts_and_advances: stockAlertsAndAdvancesTool,
  profitability_and_pricing: profitabilityAndPricingTool,
  customer_insights_and_recap: customerInsightsAndRecapTool,
  accounting_and_vat: accountingAndVatTool,
  prepare_operation: prepareOperationTool,
};
