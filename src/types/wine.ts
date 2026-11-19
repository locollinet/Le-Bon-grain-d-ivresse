export type WineColor =
  | 'Blanc'
  | 'Rouge'
  | 'Rosé'
  | 'Orange'
  | 'Effervescent'
  | 'Jaune / Oxydatif'
  | 'Doux / Liquoreux';

export type WineChannel = 'Standard' | 'Club' | 'WhatsApp';

export type WineFormat =
  | '37,5 cl'
  | '50 cl'
  | '62 cl (Clavelin)'
  | '75 cl'
  | '150 cl (Magnum)'
  | '300 cl (Jéroboam)';

export type WineCertification =
  | 'Conventionnel'
  | 'Raisonné'
  | 'Bio (AB)'
  | 'Biodynamie'
  | 'Nature / Sans sulfites';

export interface WineCatalogItem {
  id: string;
  vente: string;
  dateVente?: string;
  canal?: WineChannel;
  domaine: string;
  domaineId?: string;
  fournisseur?: string;
  cuvee: string;
  millesime?: string;
  appellation?: string;
  format?: string;
  certification?: string;
  apogee?: string;
  reference: string;
  region: string;
  color: WineColor;
  /** Prix d'achat domaine HT EXW (hors transport amont/aval) */
  tarifAchatHT: number;
  prixLbgTTC: number;
  benchTTC: number | null;
  benchSource: string;
  /** Coût logistique HT total spécifique par bouteille (si différent de amont + aval) */
  fraisLogistiqueOverride?: number;
  dispoPublic: boolean;
  /** Note publique de dégustation affichée sur la Carte des vins & WhatsApp clients */
  tastingNotes?: string;
  /** Note interne confidentielle (alertes marge, suivi achat) — jamais exposée aux clients */
  notes?: string;
  updatedAt?: string;
}

export interface DomainSupplier {
  id: string;
  nom: string;
  region: string;
  contactName?: string;
  email?: string;
  phone?: string;
  address?: string;
  iban?: string;
  francoPortHT?: number;
  delaiPaiement?: string;
  notesAllocation?: string;
  updatedAt?: string;
}

export type LotType = 'avance' | 'allocation' | 'cave';
export type LotStatus = 'commande_payee' | 'en_transit' | 'recu_cave';
export type LotPaymentStatus = 'non_paye' | 'paye';
export type LotOrigin =
  | 'excel_dispos'
  | 'excel_status_inferred'
  | 'demo'
  | 'manual'
  | 'po_generated';

export interface SupplierLot {
  id: string;
  catalogId: string;
  domaineId?: string;
  purchaseOrderId?: string;
  dateAchat: string;
  typeAchat: LotType;
  qteCommandee: number;
  qteRecue: number;
  coutUnitaireHT: number;
  tvaRatePct?: number;
  shippingHT?: number;
  statutLot: LotStatus;
  referenceFacture: string;
  paymentStatus?: LotPaymentStatus;
  paymentDueDate?: string;
  paidAt?: string;
  origin?: LotOrigin;
  notes?: string;
  updatedAt?: string;
}

export type StockAdjustmentReason =
  | 'casse'
  | 'bouchonnee'
  | 'degustation'
  | 'retour_client'
  | 'inventaire';

export interface StockAdjustment {
  id: string;
  catalogId: string;
  date: string;
  reason: StockAdjustmentReason;
  qtyDelta: number;
  unitCostHT: number;
  notes?: string;
  createdByUid: string;
  createdAt: string;
}

export type CustomerType = 'particulier' | 'club' | 'pro';

export interface CustomerProfile {
  id: string;
  customerType: CustomerType;
  nom: string;
  prenom: string;
  companyName?: string;
  siret?: string;
  vatNumber?: string;
  email: string;
  phone?: string;
  billingAddress?: string;
  shippingAddress?: string;
  notes?: string;
  mergedEmails?: string[];
  updatedAt?: string;
}

export type OrderStatus =
  | 'attente_reception'
  | 'recu_lbg'
  | 'remis_client'
  | 'annule';

export type OrderSource = 'helloasso' | 'direct' | 'perso' | 'facture_ia';

export type PaymentStatus = 'en_attente' | 'partiel' | 'paye' | 'rembourse';

export type PaymentMethod =
  | 'helloasso'
  | 'virement'
  | 'cb'
  | 'especes'
  | 'cheque'
  | 'autre';

export type DeliveryMode = 'remise_main' | 'expedition' | 'garde_cave';

export interface OrderLine {
  id: string;
  date: string;
  refCommande: string;
  invoiceId?: string;
  invoiceNumber?: string;
  creditNoteId?: string;
  creditNoteNumber?: string;
  vente: string;
  customerId?: string;
  nomClient: string;
  prenomClient: string;
  emailClient: string;
  catalogId: string;
  produitLabel: string;
  prixUnitaireTTC: number;
  /** Coût d'achat HT figé au moment de la commande / facturation (protège les marges historiques) */
  coutAchatUnitaireHT?: number;
  /** Coût logistique HT figé par bouteille */
  coutLogistiqueUnitaireHT?: number;
  tvaRatePct?: number;
  qte: number;
  qteRemise?: number;
  statut: OrderStatus;
  source: OrderSource;
  paymentStatus?: PaymentStatus;
  paymentMethod?: PaymentMethod;
  amountPaidTTC?: number;
  paidAt?: string;
  deliveryMode?: DeliveryMode;
  shippingFeeClientTTC?: number;
  carrier?: string;
  trackingNumber?: string;
  deliveryAddress?: string;
  codePromo?: string;
  discountTTC?: number;
  notes?: string;
  locked?: boolean;
  updatedAt?: string;
}

export interface FiscalDocumentLine {
  orderId: string;
  catalogId: string;
  domaine: string;
  cuvee: string;
  millesime?: string;
  format?: string;
  qte: number;
  prixUnitaireTTC: number;
  tvaRatePct: number;
  totalHT: number;
  totalTVA: number;
  totalTTC: number;
}

export interface FiscalCustomerSnapshot {
  customerType: CustomerType;
  nom: string;
  prenom: string;
  companyName?: string;
  siret?: string;
  vatNumber?: string;
  email: string;
  phone?: string;
  billingAddress?: string;
  shippingAddress?: string;
}

export interface FiscalCompanySnapshot {
  companyName: string;
  companyLegalForm?: string;
  companyCapital?: string;
  companyAddress?: string;
  companySiret?: string;
  companyRcs?: string;
  companyVatNumber?: string;
  companyIban?: string;
  companyBic?: string;
  companyEmail?: string;
  companyPhone?: string;
  companyWebsite?: string;
  companyLegalLine?: string;
}

export interface FiscalDocument {
  id: string;
  docType: 'facture' | 'avoir';
  invoiceNumber: string;
  relatedInvoiceId?: string;
  relatedInvoiceNumber?: string;
  refCommande: string;
  date: string;
  dueDate?: string;
  vente: string;
  customerId?: string;
  customerSnapshot: FiscalCustomerSnapshot;
  companySnapshot: FiscalCompanySnapshot;
  lines: FiscalDocumentLine[];
  shippingTTC?: number;
  totalHT: number;
  totalTVA: number;
  totalTTC: number;
  paymentStatus?: PaymentStatus;
  paymentMethod?: PaymentMethod;
  paidAt?: string;
  creditNoteId?: string;
  creditNoteNumber?: string;
  notes?: string;
  createdByUid: string;
  createdAt: string;
}

export type PurchaseOrderStatus = 'brouillon' | 'envoye' | 'recu';

export interface PurchaseOrderLine {
  catalogId: string;
  cuvee: string;
  millesime?: string;
  format?: string;
  qte: number;
  coutUnitaireHT: number;
  totalHT: number;
}

export interface SupplierPurchaseOrder {
  id: string;
  poNumber: string;
  domaineId?: string;
  domaineName: string;
  date: string;
  expectedDeliveryDate?: string;
  statut: PurchaseOrderStatus;
  lines: PurchaseOrderLine[];
  totalBottles: number;
  totalHT: number;
  notes?: string;
  createdByUid: string;
  createdAt: string;
  updatedAt: string;
}

export type CampaignStatus =
  | 'Envisagée'
  | 'Planifiée'
  | 'En cours'
  | 'En attente domaine'
  | 'Clôturée'
  | 'Livrée';

export interface SalesCampaign {
  id: string;
  nom: string;
  domaine: string;
  domaineId?: string;
  dateOuverture: string;
  dateCloture?: string;
  dateLivraisonEstimee?: string;
  canal: 'HelloAsso' | 'Club' | 'WhatsApp' | 'Vente directe';
  contact?: string;
  targetBottles?: number;
  statut: CampaignStatus;
  notes?: string;
  updatedAt?: string;
}

export type ExpenseCategory =
  | 'stockage'
  | 'transport'
  | 'emballage'
  | 'commissions'
  | 'degustation'
  | 'autre';

export interface OperatingExpense {
  id: string;
  date: string;
  category: ExpenseCategory;
  label: string;
  supplier?: string;
  amountHT: number;
  tvaRatePct: number;
  notes?: string;
  createdByUid: string;
  createdAt: string;
  updatedAt: string;
}

export interface WorkspaceMember {
  uid: string;
  email: string;
  displayName: string;
  role: 'admin' | 'operator';
  createdAt: string;
  updatedAt: string;
}

export interface WorkspaceInvite {
  email: string;
  role: 'admin' | 'operator';
  invitedByUid: string;
  createdAt: string;
}

export interface AppSettings {
  tvaRate: number;
  fraisLogistiqueAmont: number;
  fraisLogistiqueAval: number;
  /** Total amont + aval par défaut (€ HT / bouteille) */
  fraisLogistiqueParBouteille: number;
  /** Taux de marque cible sur prix EXW (ex: 0.10 = 10 %) */
  tauxMarqueCibleExw: number;
  anonymizeClients: boolean;
  showcaseTitle?: string;
  showcaseSubtitle?: string;
  showcaseShowStock?: boolean;
  showcaseShowBenchmark?: boolean;
  showcaseDisplayMode?: 'ttc' | 'ht';
  companyName?: string;
  companyLegalForm?: string;
  companyCapital?: string;
  companyAddress?: string;
  companySiret?: string;
  companyRcs?: string;
  companyVatNumber?: string;
  companyIban?: string;
  companyBic?: string;
  companyEmail?: string;
  companyPhone?: string;
  companyWebsite?: string;
  companyLegalLine?: string;
  nextInvoiceSeq?: number;
  nextCreditNoteSeq?: number;
  nextPoSeq?: number;
  updatedAt?: string;
}

export interface StockSummaryRow {
  catalog: WineCatalogItem;
  physiqueCave: number; // Reçu fournisseur + ajustements - Remis client
  ajustementsNet: number; // Somme des StockAdjustments (casse, bouchonnée, dégustation, retour, inventaire)
  enCommandeFournisseur: number; // Commandé fournisseur non encore reçu
  reserveClients: number; // Commandes validées non encore remises (attente_reception + recu_lbg)
  attenteReceptionClients: number; // Dont en attente d'arrivée domaine
  pretARemettreClients: number; // Dont déjà reçu par LBG et prêt pour remise
  remisClients: number; // Déjà livré / remis
  disponibleVente: number; // (Physique + En commande) - Réservé
  coutMoyenPondereHT: number; // Coût moyen pondéré des lots (shippingHT inclus) ou tarifAchatHT
  capitalImmobiliseHT: number; // Valeur HT des bouteilles achetées/payées non remises
  hasAdvanceStock: boolean;
}

export interface CustomerSummary {
  key: string;
  profileId?: string;
  customerType: CustomerType;
  nom: string;
  prenom: string;
  companyName?: string;
  siret?: string;
  vatNumber?: string;
  email: string;
  phone?: string;
  billingAddress?: string;
  shippingAddress?: string;
  notes?: string;
  mergedEmails?: string[];
  totalCommandes: number;
  totalBouteilles: number;
  caTotalTTC: number;
  resteAEncaisserTTC: number;
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
  | 'domains'
  | 'orders'
  | 'finance'
  | 'accounting'
  | 'clients'
  | 'catalog'
  | 'winelist'
  | 'settings';
