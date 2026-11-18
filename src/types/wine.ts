export type WineColor = 'Blanc' | 'Rouge' | 'Effervescent' | 'Jaune / Oxydatif';

export interface WineCatalogItem {
  id: string;
  vente: string;
  domaine: string;
  cuvee: string;
  reference: string;
  region: string;
  color: WineColor;
  tarifAchatHT: number;
  prixLbgTTC: number;
  benchTTC: number | null;
  benchSource: string;
  fraisLogistiqueOverride?: number;
  dispoPublic: boolean;
  notes?: string;
}

export type LotType = 'avance' | 'allocation' | 'cave';
export type LotStatus = 'commande_payee' | 'en_transit' | 'recu_cave';

export interface SupplierLot {
  id: string;
  catalogId: string;
  dateAchat: string;
  typeAchat: LotType;
  qteCommandee: number;
  qteRecue: number;
  coutUnitaireHT: number;
  tvaRatePct?: number;
  shippingHT?: number;
  statutLot: LotStatus;
  referenceFacture: string;
  notes?: string;
}

export type OrderStatus =
  | 'attente_reception'
  | 'recu_lbg'
  | 'remis_client'
  | 'annule';

export type OrderSource = 'helloasso' | 'direct' | 'perso' | 'facture_ia';

export interface OrderLine {
  id: string;
  date: string;
  refCommande: string;
  invoiceNumber?: string;
  vente: string;
  nomClient: string;
  prenomClient: string;
  emailClient: string;
  catalogId: string;
  produitLabel: string;
  prixUnitaireTTC: number;
  tvaRatePct?: number;
  qte: number;
  statut: OrderStatus;
  source: OrderSource;
  notes?: string;
}

export type CampaignStatus =
  | 'Planifiée'
  | 'En cours'
  | 'Clôturée'
  | 'En attente domaine'
  | 'Livrée';

export interface SalesCampaign {
  id: string;
  nom: string;
  domaine: string;
  dateOuverture: string;
  canal: 'HelloAsso' | 'Club' | 'WhatsApp' | 'Vente directe';
  statut: CampaignStatus;
  notes?: string;
}

export interface AppSettings {
  tvaRate: number;
  fraisLogistiqueParBouteille: number;
  anonymizeClients: boolean;
  showcaseTitle?: string;
  showcaseSubtitle?: string;
  showcaseShowStock?: boolean;
  showcaseShowBenchmark?: boolean;
}

export interface StockSummaryRow {
  catalog: WineCatalogItem;
  physiqueCave: number; // Reçu fournisseur - Remis client
  enCommandeFournisseur: number; // Commandé fournisseur non encore reçu
  reserveClients: number; // Commandes validées non encore remises (attente_reception + recu_lbg)
  attenteReceptionClients: number; // Dont en attente d'arrivée domaine
  pretARemettreClients: number; // Dont déjà reçu par LBG et prêt pour remise
  remisClients: number; // Déjà livré / remis
  disponibleVente: number; // (Physique + En commande) - Réservé
  capitalImmobiliseHT: number; // Valeur HT des bouteilles achetées/payées non remises
  hasAdvanceStock: boolean;
}

export interface CustomerSummary {
  key: string;
  nom: string;
  prenom: string;
  email: string;
  totalCommandes: number;
  totalBouteilles: number;
  caTotalTTC: number;
  margeTotaleEuro: number;
  margeMoyennePct: number;
  panierMoyenTTC: number;
  bouteillesAttenteDomaine: number;
  bouteillesPretesLBG: number;
  bouteillesRemises: number;
  bouteillesAnnulees: number;
  derniereDate: string;
  domainesFavoris: string[];
  orders: OrderLine[];
}

export type ActiveTab =
  | 'dashboard'
  | 'stock'
  | 'orders'
  | 'finance'
  | 'accounting'
  | 'clients'
  | 'catalog'
  | 'winelist';
