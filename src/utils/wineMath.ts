import {
  AppSettings,
  CustomerSummary,
  OrderLine,
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
  const parts = isoDate.split('-');
  if (parts.length !== 3) return isoDate;
  return `${parts[2]}/${parts[1]}/${parts[0]}`;
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
  overrideBuyHT?: number
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
  const coutLogistiqueHT = getLogisticsCostHT(item, settings);
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
  // Formule LBG : % marge nette livré = Marge nette / Coût de revient livré HT
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

  if (isPerso) {
    const unitBuy = item?.tarifAchatHT ?? 0;
    return {
      caTTC: 0,
      caHT: 0,
      coutVinHT: unitBuy * order.qte,
      fraisLogistiqueHT: 0,
      margeEuroTotal: 0,
      margePct: 0,
      isPerso: true,
    };
  }

  const caTTC = order.prixUnitaireTTC * order.qte;
  const caHT = caTTC / (1 + tvaRate);
  if (!item) {
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

  const econ = computeBottleEconomics(
    item,
    settings,
    order.prixUnitaireTTC,
    order.tvaRatePct
  );
  return {
    caTTC,
    caHT,
    coutVinHT: item.tarifAchatHT * order.qte,
    fraisLogistiqueHT: econ.coutLogistiqueHT * order.qte,
    margeEuroTotal: econ.margeEuro * order.qte,
    margePct: econ.margePct,
    isPerso: false,
  };
}

export function computeStockSummaries(
  catalog: WineCatalogItem[],
  lots: SupplierLot[],
  orders: OrderLine[]
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

  return catalog.map((item) => {
    const itemLots = lotsByCat.get(item.id) ?? [];
    const itemOrders = ordersByCat.get(item.id) ?? [];

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
      .reduce((sum, o) => sum + o.qte, 0);

    const pretARemettreClients = itemOrders
      .filter((o) => o.statut === 'recu_lbg')
      .reduce((sum, o) => sum + o.qte, 0);

    const remisClients = itemOrders
      .filter((o) => o.statut === 'remis_client')
      .reduce((sum, o) => sum + o.qte, 0);

    const reserveClients = attenteReceptionClients + pretARemettreClients;
    const physiqueCave = Math.max(0, totalRecuFournisseur - remisClients);
    const disponibleVente =
      totalRecuFournisseur +
      enCommandeFournisseur -
      remisClients -
      reserveClients;

    const totalLotQty = itemLots.reduce((s, l) => s + l.qteCommandee, 0);
    const avgCost =
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

    const capitalImmobiliseHT = bottlesHeldOrPaid * avgCost;
    const hasAdvanceStock = itemLots.some(
      (l) => l.typeAchat === 'avance' || l.typeAchat === 'cave'
    );

    return {
      catalog: item,
      physiqueCave,
      enCommandeFournisseur,
      reserveClients,
      attenteReceptionClients,
      pretARemettreClients,
      remisClients,
      disponibleVente,
      capitalImmobiliseHT,
      hasAdvanceStock,
    };
  });
}

function normalizedNameKey(nom: string, prenom: string): string {
  return `${normalizeSearchText(nom)}_${normalizeSearchText(prenom)}`;
}

export function resolveCustomerKey(
  order: Pick<OrderLine, 'emailClient' | 'nomClient' | 'prenomClient'>,
  nameToEmail?: Map<string, string>
): string {
  const cleanEmail = order.emailClient?.trim().toLowerCase();
  if (cleanEmail) return cleanEmail;
  const nKey = normalizedNameKey(order.nomClient, order.prenomClient);
  return nameToEmail?.get(nKey) ?? nKey;
}

export function computeCustomerSummaries(
  orders: OrderLine[],
  catalogMap: Map<string, WineCatalogItem>,
  settings: AppSettings
): CustomerSummary[] {
  const nameToEmail = new Map<string, string>();
  for (const order of orders) {
    const cleanEmail = order.emailClient?.trim().toLowerCase();
    if (cleanEmail) {
      const nKey = normalizedNameKey(order.nomClient, order.prenomClient);
      if (!nameToEmail.has(nKey)) {
        nameToEmail.set(nKey, cleanEmail);
      }
    }
  }

  const byClient = new Map<string, OrderLine[]>();

  for (const order of orders) {
    // Exclure les prélèvements personnels de dégustation du palmarès clients
    if (order.source === 'perso') continue;
    const key = resolveCustomerKey(order, nameToEmail);
    const arr = byClient.get(key) ?? [];
    arr.push(order);
    byClient.set(key, arr);
  }

  const summaries: CustomerSummary[] = [];

  for (const [key, clientOrders] of byClient.entries()) {
    const validOrders = clientOrders.filter((o) => o.statut !== 'annule');
    const cancelledOrders = clientOrders.filter((o) => o.statut === 'annule');

    const refOrder =
      clientOrders.find((o) => o.emailClient?.trim()) ?? clientOrders[0];
    const orderRefs = new Set(validOrders.map((o) => o.refCommande));

    let caTotalTTC = 0;
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

      const cat = catalogMap.get(o.catalogId);
      if (cat) {
        const econ = computeBottleEconomics(
          cat,
          settings,
          o.prixUnitaireTTC,
          o.tvaRatePct
        );
        coutRevientTotalHT += econ.coutTotalHT * o.qte;
        margeTotaleEuro += econ.margeEuro * o.qte;
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
      nom: refOrder.nomClient,
      prenom: refOrder.prenomClient,
      email: refOrder.emailClient,
      totalCommandes: orderRefs.size,
      totalBouteilles,
      caTotalTTC,
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
