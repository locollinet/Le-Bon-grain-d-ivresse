import { Type, type FunctionDeclaration, type Schema } from '@google/genai';
import {
  ASSISTANT_TOOL_NAMES,
  type AssistantToolName,
} from './types.ts';

export { ASSISTANT_TOOL_NAMES, type AssistantToolName };

export const TOOL_DECLARATIONS: FunctionDeclaration[] = [
  {
    name: 'search_catalog_and_stock',
    description:
      'Recherche des cuvées dans le catalogue et leur état de stock temps réel (physique en cave, en commande domaine, réservé clients, disponible libre, capital immobilisé, écart prix vs benchmark caviste). Toujours appeler cet outil pour répondre sur les vins disponibles, prix, régions, domaines ou comparatifs marché.',
    parameters: {
      type: Type.OBJECT,
      properties: {
        query: {
          type: Type.STRING,
          description: 'Texte libre : nom de cuvée, domaine, appellation ou millésime.',
        },
        domaine: {
          type: Type.STRING,
          description: 'Nom (même partiel) du domaine viticole, ex: "Tissot", "Pataille", "Labet".',
        },
        region: {
          type: Type.STRING,
          description: 'Région viticole, ex: "Jura", "Bourgogne", "Champagne", "Alsace", "Loire", "Vallée du Rhône".',
        },
        color: {
          type: Type.STRING,
          description: 'Couleur / style : Blanc, Rouge, Rosé, Orange, Effervescent, Jaune / Oxydatif, Doux / Liquoreux.',
        },
        vente: {
          type: Type.STRING,
          description: 'Nom partiel de la vente / campagne, ex: "Tissot Octobre 2026", "Fourny".',
        },
        stockState: {
          type: Type.STRING,
          enum: ['all', 'dispo', 'avance', 'attente', 'deficit'],
          description:
            'Filtre de stock : "dispo" (bouteilles libres à vendre), "avance" (lots achetés en avance), "attente" (en attente de livraison domaine), "deficit" (à commander), "all" (tout).',
        },
        onlyPublic: {
          type: Type.BOOLEAN,
          description: 'Si true, filtre uniquement les cuvées exposées sur la Carte des vins publique.',
        },
        minDiscountVsBenchPct: {
          type: Type.NUMBER,
          description: 'Filtre les cuvées au moins X % moins chères que le benchmark caviste (ex: 15 pour >= 15 % sous le marché).',
        },
        limit: {
          type: Type.INTEGER,
          description: 'Nombre max de cuvées retournées (1 à 20).',
        },
      },
    },
  },
  {
    name: 'logistics_and_deliveries',
    description:
      'Suit la logistique quotidienne du négoce : bouteilles prêtes en cave à remettre aux clients (recu_lbg), commandes encore en attente domaine (attente_reception), lots fournisseurs en transit/à réceptionner et état du planning des ventes.',
    parameters: {
      type: Type.OBJECT,
      properties: {
        focus: {
          type: Type.STRING,
          enum: ['all', 'ready_pickup', 'awaiting_domain', 'pending_lots', 'campaigns'],
          description:
            '"ready_pickup" = clients ayant des bouteilles prêtes en cave ; "awaiting_domain" = commandes en attente domaine ; "pending_lots" = lots fournisseurs non encore reçus ; "campaigns" = planning des ventes ; "all" = vue complète.',
        },
        vente: {
          type: Type.STRING,
          description: 'Filtrer sur une vente / campagne spécifique.',
        },
        domaine: {
          type: Type.STRING,
          description: 'Filtrer sur un domaine.',
        },
        clientQuery: {
          type: Type.STRING,
          description: 'Filtrer sur un nom ou prénom de client.',
        },
        limit: {
          type: Type.INTEGER,
          description: 'Nombre max de résultats retournés (1 à 20).',
        },
      },
    },
  },
  {
    name: 'stock_alerts_and_advances',
    description:
      'Détecte les alertes stock prioritaires : cuvées en déficit (disponibleVente < 0 à commander au domaine), stock acheté en avance dormant encore invendu et capital immobilisé HT.',
    parameters: {
      type: Type.OBJECT,
      properties: {
        kind: {
          type: Type.STRING,
          enum: ['all', 'deficit', 'advance_unsold'],
          description: '"deficit" = cuvées à commander ; "advance_unsold" = stock payé en avance/cave encore libre à vendre ; "all" = les deux.',
        },
        limit: {
          type: Type.INTEGER,
          description: 'Nombre max d’alertes retournées (1 à 20).',
        },
      },
    },
  },
  {
    name: 'profitability_and_pricing',
    description:
      'Calcule de façon déterministe le P&L (CA TTC, TVA, CA HT, coût EXW, logistique amont+aval, marge nette €, % marge livré), repère les cuvées sous seuil de marge, et simule un changement de prix TTC ou de coût HT sans modifier les données.',
    parameters: {
      type: Type.OBJECT,
      properties: {
        groupBy: {
          type: Type.STRING,
          enum: ['campaign', 'domaine', 'cuvee'],
          description: 'Axe d’agrégation du bilan de rentabilité.',
        },
        vente: {
          type: Type.STRING,
          description: 'Filtrer sur une vente donnée.',
        },
        domaine: {
          type: Type.STRING,
          description: 'Filtrer sur un domaine donné.',
        },
        lowMarginThresholdPct: {
          type: Type.NUMBER,
          description: 'Seuil de marge nette (%) pour lister les cuvées peu rentables (ex: 5 ou 10).',
        },
        simulateQuery: {
          type: Type.STRING,
          description: 'Nom de cuvée ou ID catalogue pour simuler un nouveau prix de vente TTC.',
        },
        simulatePriceTTC: {
          type: Type.NUMBER,
          description: 'Prix TTC simulé en euros pour la cuvée ciblée.',
        },
        simulateBuyHT: {
          type: Type.NUMBER,
          description: 'Optionnel : nouveau tarif EXW HT simulé en euros.',
        },
        limit: {
          type: Type.INTEGER,
          description: 'Nombre max de lignes retournées (1 à 20).',
        },
      },
    },
  },
  {
    name: 'customer_insights_and_recap',
    description:
      'Analyse les clients (CA, bouteilles, marge générée, domaines favoris), identifie les meilleurs acheteurs pour une région/domaine donné (ciblage d’allocation), et prépare un récapitulatif WhatsApp prêt à copier pour un client.',
    parameters: {
      type: Type.OBJECT,
      properties: {
        clientQuery: {
          type: Type.STRING,
          description: 'Nom, prénom ou email partiel d’un client.',
        },
        affinityQuery: {
          type: Type.STRING,
          description: 'Domaine ou région recherché pour trouver les clients ayant une affinité (ex: "Jura", "Champagne", "Tissot").',
        },
        onlyReadyForPickup: {
          type: Type.BOOLEAN,
          description: 'Si true, ne garde que les clients ayant au moins 1 bouteille prête en cave (recu_lbg).',
        },
        includeWhatsAppDraft: {
          type: Type.BOOLEAN,
          description: 'Si true et un client est ciblé, génère le message récapitulatif WhatsApp prêt à copier.',
        },
        limit: {
          type: Type.INTEGER,
          description: 'Nombre max de clients retournés (1 à 20).',
        },
      },
    },
  },
  {
    name: 'accounting_and_vat',
    description:
      'Calcule la situation comptable et TVA sur une période (TVA collectée ventes, TVA déductible achats + port, TVA nette à reverser ou crédit), liste les commandes validées sans numéro de facture et les factures fournisseurs.',
    parameters: {
      type: Type.OBJECT,
      properties: {
        periodMonth: {
          type: Type.STRING,
          description: 'Mois au format YYYY-MM (ex: "2026-10") ou "all" pour toute la période.',
        },
        onlyUninvoiced: {
          type: Type.BOOLEAN,
          description: 'Si true, met en avant les commandes validées non encore facturées.',
        },
        limit: {
          type: Type.INTEGER,
          description: 'Nombre max de pièces retournées (1 à 20).',
        },
      },
    },
  },
  {
    name: 'prepare_operation',
    description:
      'Prépare une opération utilisateur sans jamais écrire en base directement : vérifie les doublons (client / cuvée) et le stock disponible, puis fournit un bouton ouvrant la modale existante pré-remplie (vente directe, sortie cave perso, achat fournisseur, nouvelle cuvée, import HelloAsso ou Facture IA) ou navigue vers un onglet filtré.',
    parameters: {
      type: Type.OBJECT,
      properties: {
        operation: {
          type: Type.STRING,
          enum: [
            'direct_order',
            'perso_tasting',
            'supplier_lot',
            'new_catalog_item',
            'import_helloasso',
            'invoice_ai',
            'navigate_tab',
          ],
          description: 'Type d’opération ou d’écran à ouvrir pré-rempli.',
        },
        cuveeQuery: {
          type: Type.STRING,
          description: 'Nom de cuvée (et millésime) concerné.',
        },
        domaine: {
          type: Type.STRING,
          description: 'Nom du domaine viticole.',
        },
        clientName: {
          type: Type.STRING,
          description: 'Prénom et nom du client pour une vente directe.',
        },
        quantity: {
          type: Type.INTEGER,
          description: 'Nombre de bouteilles.',
        },
        unitPriceTTC: {
          type: Type.NUMBER,
          description: 'Prix unitaire TTC proposé pour une vente directe.',
        },
        unitCostHT: {
          type: Type.NUMBER,
          description: 'Coût unitaire HT (EXW) pour un lot fournisseur ou nouvelle cuvée.',
        },
        lotType: {
          type: Type.STRING,
          enum: ['avance', 'allocation', 'cave'],
          description: 'Nature du lot fournisseur.',
        },
        lotStatus: {
          type: Type.STRING,
          enum: ['commande_payee', 'en_transit', 'recu_cave'],
          description: 'État de réception du lot.',
        },
        orderStatus: {
          type: Type.STRING,
          enum: ['attente_reception', 'recu_lbg', 'remis_client'],
          description: 'Statut logistique initial de la commande.',
        },
        region: {
          type: Type.STRING,
          description: 'Région pour une nouvelle cuvée.',
        },
        color: {
          type: Type.STRING,
          description: 'Couleur pour une nouvelle cuvée.',
        },
        vente: {
          type: Type.STRING,
          description: 'Nom de la vente / campagne.',
        },
        referenceFacture: {
          type: Type.STRING,
          description: 'Référence de facture fournisseur.',
        },
        notes: {
          type: Type.STRING,
          description: 'Commentaire ou précision.',
        },
        targetTab: {
          type: Type.STRING,
          enum: [
            'dashboard',
            'stock',
            'orders',
            'finance',
            'accounting',
            'clients',
            'catalog',
            'winelist',
          ],
          description: 'Onglet cible si operation="navigate_tab".',
        },
      },
      required: ['operation'],
    },
  },
];

export const ASSISTANT_ANSWER_SCHEMA: Schema = {
  type: Type.OBJECT,
  properties: {
    text: {
      type: Type.STRING,
      description:
        'Réponse concise et actionnable en français (2 à 5 phrases max ou puces courtes). N’invente jamais de chiffres absents des sorties d’outils.',
    },
    citedIds: {
      type: Type.ARRAY,
      items: { type: Type.STRING },
      description: 'Liste des IDs exacts cités depuis les résultats d’outils (ex: cat_..., lot_..., refCommande).',
    },
    followUps: {
      type: Type.ARRAY,
      items: { type: Type.STRING },
      description: '2 ou 3 suggestions de questions suivantes courtes et utiles pour Romain.',
    },
  },
  required: ['text', 'citedIds', 'followUps'],
};
