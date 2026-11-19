import {
  AppSettings,
  CustomerProfile,
  CustomerSummary,
  DomainSupplier,
  OrderLine,
  StockAdjustment,
  StockSummaryRow,
  SupplierLot,
  WineCatalogItem,
} from '../types/wine';

export function normalizeSearchText(value: string): string {
  return value
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .trim();
}

export function formatEUR(value: number, showSign = false): string {
  const absFormatted = new Intl.NumberFormat('fr-FR', {
    style: 'currency',
    currency: 'EUR',
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(Math.abs(value));

  if (value < -0.004) {
    return `-${absFormatted}`;
  }
  if (showSign && value > 0.004) {
    return `+${absFormatted}`;
  }
  return absFormatted;
}

export function formatPct(value: number, showSign = false): string {
  const formatted = new Intl.NumberFormat('fr-FR', {
    minimumFractionDigits: 1,
    maximumFractionDigits: 1,
  }).format(Math.abs(value));

  if (value < -0.04) {
    return `-${formatted} %`;
  }
  if (showSign && value > 0.04) {
    return `+${formatted} %`;
  }
  return `${formatted} %`;
}

export function formatDateFR(isoDate: string): string {
  if (!isoDate) return '—';
  const parts = isoDate.slice(0, 10).split('-');
  if (parts.length !== 3) return isoDate;
  return `${parts[2]}/${parts[1]}/${parts[0]}`;
}

export function extractVintageFromCuvee(cuvee: string): string {
  const match = cuvee.match(/\b(19[6-9]\d|20[0-3]\d)\b/);
  return match ? match[1] : '';
}

export function getDefaultLogisticsPerBottle(settings: AppSettings): number {
  const amont = settings.fraisLogistiqueAmont;
  const aval = settings.fraisLogistiqueAval;
  if (Number.isFinite(amont) && Number.isFinite(aval)) {
    return amont + aval;
  }
  return settings.fraisLogistiqueParBouteille ?? 4.5;
}

export function getLogisticsCostHT(
  item: WineCatalogItem,
  settings: AppSettings
): number {
  if (item.fraisLogistiqueOverride !== undefined) {
    return item.fraisLogistiqueOverride;
  }
  return getDefaultLogisticsPerBottle(settings);
}

/**
 * Formule exacte du tableur LBG :
 * Tarif LBG base TTC = ((EXW / (1 - tauxMarque)) + amont + aval) * (1 + TVA)
 */
export function computeRecommendedBasePriceTTC(
  tarifAchatHT: number,
  settings: AppSettings,
  item?: WineCatalogItem
): number {
  if (tarifAchatHT <= 0) return 0;
  const tauxMarque = Math.min(0.8, Math.max(0, settings.tauxMarqueCibleExw ?? 0.1));
  const logistics = item
    ? getLogisticsCostHT(item, settings)
    : getDefaultLogisticsPerBottle(settings);
  const htBase = tarifAchatHT / (1 - tauxMarque) + logistics;
  return Number((htBase * (1 + settings.tvaRate)).toFixed(2));
}

export function computeBottleEconomics(
  item: WineCatalogItem,
  settings: AppSettings,
  overrideSellPriceTTC?: number,
  overrideTvaRatePct?: number,
  overrideBuyHT?: number,
  overrideLogisticsHT?: number
): {
  prixTTC: number;
  prixHT: number;
  coutLogistiqueHT: number;
  coutTotalHT: number;
  margeEuro: number;
  margePct: number;
  margeSurCaPct: number;
  tarifBaseConseilleTTC: number;
  vsBenchPct: number | null;
} {
  const prixTTC = overrideSellPriceTTC ?? item.prixLbgTTC;
  const tvaRate =
    overrideTvaRatePct !== undefined
      ? Math.max(0, overrideTvaRatePct) / 100
      : settings.tvaRate;
  const buyHT = overrideBuyHT !== undefined ? overrideBuyHT : item.tarifAchatHT;
  const coutLogistiqueHT =
    overrideLogisticsHT !== undefined
      ? overrideLogisticsHT
      : getLogisticsCostHT(item, settings);
  const coutTotalHT = buyHT + coutLogistiqueHT;
  const tarifBaseConseilleTTC = computeRecommendedBasePriceTTC(
    buyHT,
    settings,
    item
  );

  // Sorties cave perso / offertes à 0 € : coût suivi séparément, marge commerciale neutre (0)
  if (prixTTC <= 0) {
    return {
      prixTTC: 0,
      prixHT: 0,
      coutLogistiqueHT,
      coutTotalHT: buyHT,
      margeEuro: 0,
      margePct: 0,
      margeSurCaPct: 0,
      tarifBaseConseilleTTC,
      vsBenchPct: null,
    };
  }

  const prixHT = prixTTC / (1 + tvaRate);
  const margeEuro = prixHT - coutTotalHT;
  const margePct = coutTotalHT > 0 ? (margeEuro / coutTotalHT) * 100 : 0;
  const margeSurCaPct = prixHT > 0 ? (margeEuro / prixHT) * 100 : 0;

  let vsBenchPct: number | null = null;
  if (item.benchTTC && item.benchTTC > 0) {
    vsBenchPct = ((prixTTC - item.benchTTC) / item.benchTTC) * 100;
  }

  return {
    prixTTC,
    prixHT,
    coutLogistiqueHT,
    coutTotalHT,
    margeEuro,
    margePct,
    margeSurCaPct,
    tarifBaseConseilleTTC,
    vsBenchPct,
  };
}

export function getEffectiveOrderPaymentStatus(
  order: OrderLine
): 'en_attente' | 'partiel' | 'paye' | 'rembourse' {
  if (order.paymentStatus) return order.paymentStatus;
  if (order.statut === 'annule') return 'rembourse';
  if (order.source === 'helloasso' || order.source === 'perso') return 'paye';
  if (order.statut === 'remis_client') return 'paye';
  return 'en_attente';
}

export function getOrderLineUnpaidTTC(order: OrderLine): number {
  if (order.statut === 'annule' || order.source === 'perso') return 0;
  const status = getEffectiveOrderPaymentStatus(order);
  if (status === 'paye' || status === 'rembourse') return 0;
  const lineTotal = order.prixUnitaireTTC * order.qte + (order.shippingFeeClientTTC ?? 0);
  if (status === 'partiel' && order.amountPaidTTC !== undefined) {
    return Math.max(0, lineTotal - order.amountPaidTTC);
  }
  return lineTotal;
}

export function computeOrderLineEconomics(
  order: OrderLine,
  item: WineCatalogItem | undefined,
  settings: AppSettings
): {
  caTTC: number;
  caHT: number;
  coutVinHT: number;
  fraisLogistiqueHT: number;
  margeEuroTotal: number;
  margePct: number;
  isPerso: boolean;
} {
  const isPerso = order.source === 'perso' || order.prixUnitaireTTC <= 0;
  const tvaRate =
    order.tvaRatePct !== undefined
      ? Math.max(0, order.tvaRatePct) / 100
      : settings.tvaRate;

  const frozenBuyHT = order.coutAchatUnitaireHT ?? item?.tarifAchatHT ?? 0;

  if (isPerso) {
    return {
      caTTC: 0,
      caHT: 0,
      coutVinHT: frozenBuyHT * order.qte,
      fraisLogistiqueHT: 0,
      margeEuroTotal: 0,
      margePct: 0,
      isPerso: true,
    };
  }

  const caTTC = order.prixUnitaireTTC * order.qte;
  const caHT = caTTC / (1 + tvaRate);
  if (!item && order.coutAchatUnitaireHT === undefined) {
    return {
      caTTC,
      caHT,
      coutVinHT: 0,
      fraisLogistiqueHT: 0,
      margeEuroTotal: 0,
      margePct: 0,
      isPerso: false,
    };
  }

  const fallbackItem: WineCatalogItem = item ?? {
    id: order.catalogId,
    vente: order.vente,
    domaine: '',
    cuvee: order.produitLabel,
    reference: order.produitLabel,
    region: '',
    color: 'Blanc',
    tarifAchatHT: frozenBuyHT,
    prixLbgTTC: order.prixUnitaireTTC,
    benchTTC: null,
    benchSource: '',
    dispoPublic: false,
  };

  const econ = computeBottleEconomics(
    fallbackItem,
    settings,
    order.prixUnitaireTTC,
    order.tvaRatePct,
    frozenBuyHT,
    order.coutLogistiqueUnitaireHT
  );

  return {
    caTTC,
    caHT,
    coutVinHT: frozenBuyHT * order.qte,
    fraisLogistiqueHT: econ.coutLogistiqueHT * order.qte,
    margeEuroTotal: econ.margeEuro * order.qte,
    margePct: econ.margePct,
    isPerso: false,
  };
}

export function computeStockSummaries(
  catalog: WineCatalogItem[],
  lots: SupplierLot[],
  orders: OrderLine[],
  adjustments: StockAdjustment[] = []
): StockSummaryRow[] {
  const lotsByCat = new Map<string, SupplierLot[]>();
  for (const l of lots) {
    const arr = lotsByCat.get(l.catalogId);
    if (arr) arr.push(l);
    else lotsByCat.set(l.catalogId, [l]);
  }

  const ordersByCat = new Map<string, OrderLine[]>();
  for (const o of orders) {
    if (o.statut === 'annule') continue;
    const arr = ordersByCat.get(o.catalogId);
    if (arr) arr.push(o);
    else ordersByCat.set(o.catalogId, [o]);
  }

  const adjByCat = new Map<string, number>();
  for (const a of adjustments) {
    adjByCat.set(a.catalogId, (adjByCat.get(a.catalogId) ?? 0) + a.qtyDelta);
  }

  return catalog.map((item) => {
    const itemLots = lotsByCat.get(item.id) ?? [];
    const itemOrders = ordersByCat.get(item.id) ?? [];
    const ajustementsNet = adjByCat.get(item.id) ?? 0;

    const totalRecuFournisseur = itemLots.reduce(
      (sum, l) => sum + l.qteRecue,
      0
    );
    const enCommandeFournisseur = itemLots.reduce(
      (sum, l) => sum + Math.max(0, l.qteCommandee - l.qteRecue),
      0
    );

    const attenteReceptionClients = itemOrders
      .filter((o) => o.statut === 'attente_reception')
      .reduce((sum, o) => sum + Math.max(0, o.qte - (o.qteRemise ?? 0)), 0);

    const pretARemettreClients = itemOrders
      .filter((o) => o.statut === 'recu_lbg')
      .reduce((sum, o) => sum + Math.max(0, o.qte - (o.qteRemise ?? 0)), 0);

    const remisClients = itemOrders.reduce((sum, o) => {
      if (o.statut === 'remis_client') return sum + o.qte;
      return sum + Math.min(o.qte, o.qteRemise ?? 0);
    }, 0);

    const reserveClients = attenteReceptionClients + pretARemettreClients;
    const physiqueCave = Math.max(
      0,
      totalRecuFournisseur + ajustementsNet - remisClients
    );
    const disponibleVente =
      totalRecuFournisseur +
      ajustementsNet +
      enCommandeFournisseur -
      remisClients -
      reserveClients;

    const totalLotQty = itemLots.reduce((s, l) => s + l.qteCommandee, 0);
    const coutMoyenPondereHT =
      itemLots.length > 0 && totalLotQty > 0
        ? itemLots.reduce(
            (s, l) =>
              s + l.coutUnitaireHT * l.qteCommandee + (l.shippingHT ?? 0),
            0
          ) / totalLotQty
        : item.tarifAchatHT;

    const bottlesHeldOrPaid = Math.max(
      0,
      totalRecuFournisseur +
        ajustementsNet +
        itemLots
          .filter(
            (l) => l.statutLot !== 'en_transit' || l.typeAchat === 'avance'
          )
          .reduce(
            (s, l) => s + Math.max(0, l.qteCommandee - l.qteRecue),
            0
          ) -
        remisClients
    );

    const capitalImmobiliseHT = bottlesHeldOrPaid * coutMoyenPondereHT;
    const hasAdvanceStock = itemLots.some(
      (l) => l.typeAchat === 'avance' || l.typeAchat === 'cave'
    );

    return {
      catalog: item,
      physiqueCave,
      ajustementsNet,
      enCommandeFournisseur,
      reserveClients,
      attenteReceptionClients,
      pretARemettreClients,
      remisClients,
      disponibleVente,
      coutMoyenPondereHT,
      capitalImmobiliseHT,
      hasAdvanceStock,
    };
  });
}

function normalizedNameKey(nom: string, prenom: string): string {
  return `${normalizeSearchText(nom)}_${normalizeSearchText(prenom)}`;
}

export function resolveCustomerKey(
  order: Pick<OrderLine, 'emailClient' | 'nomClient' | 'prenomClient' | 'customerId'>,
  nameToEmail?: Map<string, string>,
  aliasToKey?: Map<string, string>
): string {
  const cleanEmail = order.emailClient?.trim().toLowerCase();
  if (cleanEmail && aliasToKey?.has(cleanEmail)) {
    return aliasToKey.get(cleanEmail)!;
  }
  if (cleanEmail) return cleanEmail;
  const nKey = normalizedNameKey(order.nomClient, order.prenomClient);
  if (aliasToKey?.has(nKey)) return aliasToKey.get(nKey)!;
  return nameToEmail?.get(nKey) ?? nKey;
}

export function computeCustomerSummaries(
  orders: OrderLine[],
  catalogMap: Map<string, WineCatalogItem>,
  settings: AppSettings,
  profiles: CustomerProfile[] = []
): CustomerSummary[] {
  const profileByKey = new Map<string, CustomerProfile>();
  const aliasToKey = new Map<string, string>();
  const nameToEmail = new Map<string, string>();

  for (const p of profiles) {
    const cleanEmail = p.email?.trim().toLowerCase();
    const nKey = normalizedNameKey(p.nom, p.prenom);
    const primaryKey = cleanEmail || nKey || p.id;
    profileByKey.set(primaryKey, p);
    if (cleanEmail) {
      aliasToKey.set(cleanEmail, primaryKey);
      if (nKey !== '_') nameToEmail.set(nKey, primaryKey);
    }
    if (nKey !== '_') aliasToKey.set(nKey, primaryKey);
    for (const merged of p.mergedEmails ?? []) {
      const m = merged.trim().toLowerCase();
      if (m) aliasToKey.set(m, primaryKey);
    }
  }

  for (const order of orders) {
    const cleanEmail = order.emailClient?.trim().toLowerCase();
    if (cleanEmail) {
      const nKey = normalizedNameKey(order.nomClient, order.prenomClient);
      if (!nameToEmail.has(nKey)) {
        nameToEmail.set(nKey, aliasToKey.get(cleanEmail) ?? cleanEmail);
      }
    }
  }

  const byClient = new Map<string, OrderLine[]>();

  // Inclure tous les profils CRM créés (même sans commande encore)
  for (const key of profileByKey.keys()) {
    byClient.set(key, []);
  }

  for (const order of orders) {
    if (order.source === 'perso') continue;
    const key = resolveCustomerKey(order, nameToEmail, aliasToKey);
    const arr = byClient.get(key) ?? [];
    arr.push(order);
    byClient.set(key, arr);
  }

  const summaries: CustomerSummary[] = [];

  for (const [key, clientOrders] of byClient.entries()) {
    const profile = profileByKey.get(key);
    const validOrders = clientOrders.filter((o) => o.statut !== 'annule');
    const cancelledOrders = clientOrders.filter((o) => o.statut === 'annule');

    const refOrder =
      clientOrders.find((o) => o.emailClient?.trim()) ?? clientOrders[0];
    const orderRefs = new Set(validOrders.map((o) => o.refCommande));

    let caTotalTTC = 0;
    let resteAEncaisserTTC = 0;
    let coutRevientTotalHT = 0;
    let margeTotaleEuro = 0;
    let totalBouteilles = 0;
    let bouteillesAttenteDomaine = 0;
    let bouteillesPretesLBG = 0;
    let bouteillesRemises = 0;
    const domaineCount = new Map<string, number>();

    for (const o of validOrders) {
      totalBouteilles += o.qte;
      caTotalTTC += o.prixUnitaireTTC * o.qte;
      resteAEncaisserTTC += getOrderLineUnpaidTTC(o);

      const cat = catalogMap.get(o.catalogId);
      const econ = computeOrderLineEconomics(o, cat, settings);
      coutRevientTotalHT += econ.coutVinHT + econ.fraisLogistiqueHT;
      margeTotaleEuro += econ.margeEuroTotal;
      if (cat) {
        domaineCount.set(
          cat.domaine,
          (domaineCount.get(cat.domaine) ?? 0) + o.qte
        );
      }

      if (o.statut === 'attente_reception') {
        bouteillesAttenteDomaine += o.qte;
      } else if (o.statut === 'recu_lbg') {
        bouteillesPretesLBG += o.qte;
      } else if (o.statut === 'remis_client') {
        bouteillesRemises += o.qte;
      }
    }

    const bouteillesAnnulees = cancelledOrders.reduce((s, o) => s + o.qte, 0);
    const derniereDate =
      clientOrders
        .map((o) => o.date)
        .sort()
        .reverse()[0] ?? '';

    const domainesFavoris = Array.from(domaineCount.entries())
      .sort((a, b) => b[1] - a[1])
      .slice(0, 3)
      .map((d) => d[0]);

    summaries.push({
      key,
      profileId: profile?.id,
      customerType: profile?.customerType ?? 'club',
      nom: profile?.nom || refOrder?.nomClient || '',
      prenom: profile?.prenom || refOrder?.prenomClient || '',
      companyName: profile?.companyName,
      siret: profile?.siret,
      vatNumber: profile?.vatNumber,
      email: profile?.email || refOrder?.emailClient || '',
      phone: profile?.phone,
      billingAddress: profile?.billingAddress,
      shippingAddress: profile?.shippingAddress,
      notes: profile?.notes,
      mergedEmails: profile?.mergedEmails,
      totalCommandes: orderRefs.size,
      totalBouteilles,
      caTotalTTC,
      resteAEncaisserTTC,
      margeTotaleEuro,
      margeMoyennePct:
        coutRevientTotalHT > 0
          ? (margeTotaleEuro / coutRevientTotalHT) * 100
          : 0,
      panierMoyenTTC: orderRefs.size > 0 ? caTotalTTC / orderRefs.size : 0,
      bouteillesAttenteDomaine,
      bouteillesPretesLBG,
      bouteillesRemises,
      bouteillesAnnulees,
      derniereDate,
      domainesFavoris,
      orders: [...clientOrders].sort((a, b) => b.date.localeCompare(a.date)),
    });
  }

  return summaries.sort((a, b) => b.caTotalTTC - a.caTotalTTC);
}

export function deriveInitialDomains(catalog: WineCatalogItem[]): DomainSupplier[] {
  const map = new Map<string, DomainSupplier>();
  for (const item of catalog) {
    const key = normalizeSearchText(item.domaine);
    if (!key || map.has(key)) continue;
    const slug = key.replace(/[^a-z0-9]+/g, '_').replace(/^_|_$/g, '').slice(0, 48);
    map.set(key, {
      id: `dom_${slug || map.size + 1}`,
      nom: item.domaine.trim(),
      region: item.region || '',
      delaiPaiement: '30 jours net',
    });
  }
  return Array.from(map.values()).sort((a, b) => a.nom.localeCompare(b.nom, 'fr'));
}

export function deriveInitialCustomers(orders: OrderLine[]): CustomerProfile[] {
  const seen = new Map<string, CustomerProfile>();
  for (const o of orders) {
    if (o.source === 'perso') continue;
    const cleanEmail = o.emailClient?.trim().toLowerCase() ?? '';
    const nKey = normalizedNameKey(o.nomClient, o.prenomClient);
    const key = cleanEmail || nKey;
    if (!key || seen.has(key)) continue;
    const slug = key.replace(/[^a-z0-9]+/g, '_').replace(/^_|_$/g, '').slice(0, 48);
    seen.set(key, {
      id: `cust_${slug || seen.size + 1}`,
      customerType: 'club',
      nom: o.nomClient.trim(),
      prenom: o.prenomClient.trim(),
      email: cleanEmail,
    });
  }
  return Array.from(seen.values());
}

export function computeNextDocNumber(
  prefix: 'FA' | 'AV' | 'PO',
  existingNumbers: string[],
  year = new Date().getFullYear(),
  minSeq = 1
): { docNumber: string; nextSeq: number } {
  const regex = new RegExp(`^${prefix}-${year}-(\\d+)$`);
  let maxSeq = Math.max(0, minSeq - 1);
  for (const num of existingNumbers) {
    const m = num.match(regex);
    if (m) {
      const parsed = parseInt(m[1], 10);
      if (Number.isFinite(parsed) && parsed > maxSeq) {
        maxSeq = parsed;
      }
    }
  }
  const seq = maxSeq + 1;
  return {
    docNumber: `${prefix}-${year}-${String(seq).padStart(4, '0')}`,
    nextSeq: seq + 1,
  };
}

export function maskClientName(
  prenom: string,
  nom: string,
  anonymize: boolean,
  index?: number
): string {
  if (!anonymize) {
    return `${prenom} ${nom}`.trim();
  }
  const pInit = prenom ? prenom.charAt(0).toUpperCase() + '.' : '';
  const nInit = nom ? nom.charAt(0).toUpperCase() + '***' : '';
  return index !== undefined
    ? `Client #${index + 1} (${pInit} ${nInit})`
    : `${pInit} ${nInit}`;
}

export function maskEmail(email: string, anonymize: boolean): string {
  if (!anonymize || !email) return email;
  const [local, domain] = email.split('@');
  if (!domain) return '***';
  return `${local.slice(0, 2)}***@${domain}`;
}
