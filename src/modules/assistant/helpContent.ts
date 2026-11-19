import type { ActiveTab } from '../../types/wine';
import { normalizeSearchText } from '../../utils/wineMath';

export interface HelpArticle {
  id: string;
  title: string;
  keywords: string[];
  summary: string;
  steps: string[];
}

export const HELP_ARTICLES: HelpArticle[] = [
  {
    id: 'help_stock_states',
    title: 'Comprendre Physique cave, Réservé et Disponible libre',
    keywords: ['stock', 'physique', 'reserve', 'disponible', 'deficit', 'commander'],
    summary:
      'Le Bon Grain d’Ivresse distingue le stock physique reçu en cave des bouteilles déjà réservées sur vos campagnes.',
    steps: [
      'Physique cave = Bouteilles reçues des domaines - Bouteilles déjà remises aux clients.',
      'En commande dom. = Lots fournisseurs payés ou en transit non encore réceptionnés.',
      'Disponible libre = (Physique cave + En commande dom.) - Réservé clients. Si négatif, il faut commander au domaine.',
    ],
  },
  {
    id: 'help_margins_excel',
    title: 'Calcul de la marge nette et tarif base conseillé (modèle LBG)',
    keywords: ['marge', 'exw', 'amont', 'aval', 'logistique', 'tarif', 'base', 'tva'],
    summary:
      'Vos prix d’achat catalogue sont en EXW HT. Le modèle LBG ajoute par défaut 1,00 € HT d’amont + 3,50 € HT d’aval (4,50 € HT/btl).',
    steps: [
      'Prix de vente HT = Prix TTC / (1 + TVA).',
      'Marge nette (€) = Prix de vente HT - (EXW HT + Logistique HT).',
      '% marge nette livré = Marge nette / (EXW HT + Logistique HT), identique à votre tableur historique.',
      'Tarif base conseillé TTC = ((EXW / (1 - 10 %)) + Logistique) × (1 + TVA).',
    ],
  },
  {
    id: 'help_lot_reception',
    title: 'Réceptionner un lot fournisseur et basculer les clients',
    keywords: ['reception', 'lot', 'fournisseur', 'recu_lbg', 'attente', 'partiel'],
    summary:
      'Depuis Stock & Achats > Lots fournisseurs, vous pouvez réceptionner tout ou partie d’un arrivage domaine.',
    steps: [
      'Cliquez sur « Réceptionner » (ou saisissez la quantité partielle reçue).',
      'L’application attribue les bouteilles reçues aux commandes clients « En attente domaine » par ordre chronologique dans la limite du stock disponible.',
      'Les clients passent alors en « Reçu par LBG » et apparaissent dans Rapports clients prêts à relancer.',
    ],
  },
  {
    id: 'help_helloasso',
    title: 'Importer un export HelloAsso sans doublons',
    keywords: ['helloasso', 'import', 'csv', 'excel', 'carte', 'doublon', 'annule', 'promo'],
    summary:
      'Collez directement vos lignes copiées depuis Excel ou importez le fichier CSV/XLSX HelloAsso brut.',
    steps: [
      'Les lignes à l’unité d’une même commande sont regroupées automatiquement en quantités.',
      'Le préfixe « Carte » est nettoyé et les codes promo sont déduits du montant TTC.',
      'Les commandes déjà importées (même Réf commande) et les annulations déjà enregistrées sont ignorées.',
    ],
  },
  {
    id: 'help_invoice_ai',
    title: 'Utiliser Facture IA (achat domaine vs vente client)',
    keywords: ['facture', 'ia', 'pdf', 'scan', 'achat', 'vente', 'port'],
    summary:
      'Facture IA lit vos PDF/photos de factures via Gemini côté serveur et propose les lignes à valider avant écriture.',
    steps: [
      'Choisissez « Détection automatique » ou forcez « Achat fournisseur » / « Vente client ».',
      'Les frais de port HT sont extraits séparément et répartis au prorata sur les lots.',
      'Aucune ligne n’est écrite tant que vous n’avez pas vérifié le tableau et cliqué sur Valider.',
    ],
  },
  {
    id: 'help_perso_vs_direct',
    title: 'Vente directe vs Prélèvement cave perso (0 €)',
    keywords: ['direct', 'perso', 'degustation', 'whatsapp', 'club'],
    summary:
      'Utilisez Vente directe pour les ventes hors HelloAsso (WhatsApp, Club, remise directe) et Cave perso pour vos dégustations.',
    steps: [
      'Une vente directe alimente votre CA, la facturation et la fiche client (rattachée automatiquement si le client existe déjà).',
      'Un prélèvement cave perso (0 €) déduit bien le stock physique mais n’affecte pas votre taux de marge commerciale.',
    ],
  },
  {
    id: 'help_winelist_notes',
    title: 'Publier la Carte des vins sans exposer vos notes internes',
    keywords: ['carte', 'vitrine', 'whatsapp', 'notes', 'degustation', 'confidentiel'],
    summary:
      'Vos notes de marge internes restent strictement privées dans Catalogue & Tarifs.',
    steps: [
      'Dans Carte des vins > Choisir les cuvées, saisissez uniquement les notes de dégustation publiques.',
      'Activez « Uniquement celles en stock libre » puis copiez le texte WhatsApp ou imprimez le PDF.',
    ],
  },
  {
    id: 'help_accounting_tva',
    title: 'Suivi TVA, factures clients et export comptable',
    keywords: ['tva', 'facture', 'comptable', 'credit', 'export'],
    summary:
      'L’onglet Facturation & TVA calcule TVA collectée, TVA déductible (achats + port) et solde net par mois.',
    steps: [
      'Émettez les numéros de facture séquentiels (FA-YYYY-XXXX) sur les commandes validées.',
      'Les factures imprimées et l’export CSV comptable conservent toujours les vrais noms clients, même si le mode présentation masquée est actif.',
    ],
  },
];

export function searchHelpArticles(query: string, limit = 3): HelpArticle[] {
  const q = normalizeSearchText(query);
  if (!q) return [];
  const tokens = q.split(/\s+/).filter((t) => t.length > 2);
  if (tokens.length === 0) return [];

  return HELP_ARTICLES.map((art) => {
    const hay = normalizeSearchText(
      `${art.title} ${art.summary} ${art.keywords.join(' ')}`
    );
    const hits = tokens.filter((t) => hay.includes(t)).length;
    return { art, hits };
  })
    .filter((x) => x.hits > 0)
    .sort((a, b) => b.hits - a.hits)
    .slice(0, limit)
    .map((x) => x.art);
}

export function getContextualSuggestions(activeTab: ActiveTab): string[] {
  switch (activeTab) {
    case 'stock':
      return [
        'Quelles cuvées dois-je recommander au domaine ?',
        'Quel est mon stock acheté en avance disponible ?',
        'Prépare un achat en avance de 6 Sursis 2022',
      ];
    case 'orders':
      return [
        'Qui a des bouteilles prêtes en cave à remettre ?',
        'Prépare une vente directe de 2 Marsannay rouge 2023 pour Patrick Letellier',
        'Où en sont les commandes Tissot Octobre 2026 ?',
      ];
    case 'clients':
      return [
        'Quels sont mes meilleurs clients sur le Jura ?',
        'Prépare le message WhatsApp de Jérémie Rebelo',
        'Qui doit venir récupérer ses bouteilles en cave ?',
      ];
    case 'finance':
    case 'catalog':
      return [
        'Quelles cuvées ont une marge faible ou négative ?',
        "Simule Terres d'encre 2024 à 39 € TTC",
        'Quelle vente a dégagé le plus de marge nette ?',
      ];
    case 'accounting':
      return [
        'Quel est mon bilan TVA sur octobre 2026 ?',
        'Quelles commandes n’ont pas encore de facture ?',
        'Résume la TVA déductible de mes achats',
      ];
    case 'domains':
      return [
        'Quelles cuvées dois-je recommander au domaine ?',
        'Quel est mon stock acheté en avance disponible ?',
        'Quels lots fournisseurs sont encore en attente de réception ?',
      ];
    case 'winelist':
      return [
        'Quelles cuvées en stock libre sont encore masquées de la vitrine ?',
        'Quelles références sont à plus de 15 % sous le marché ?',
        'Combien j’ai de bouteilles Pattes-Loup et Pataille libres ?',
      ];
    case 'settings':
    case 'dashboard':
    default:
      return [
        'Qui a des bouteilles prêtes en cave à remettre ?',
        'Quelles cuvées dois-je recommander au domaine ?',
        'Combien j’ai d’argent immobilisé en achats d’avance ?',
      ];
  }
}
