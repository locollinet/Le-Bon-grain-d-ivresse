import type {
  ActiveTab,
  LotStatus,
  LotType,
  OrderSource,
  OrderStatus,
  WineChannel,
  WineColor,
} from '../../types/wine';

export const ASSISTANT_TOOL_NAMES = [
  'search_catalog_and_stock',
  'logistics_and_deliveries',
  'stock_alerts_and_advances',
  'profitability_and_pricing',
  'customer_insights_and_recap',
  'accounting_and_vat',
  'prepare_operation',
] as const;

export type AssistantToolName = (typeof ASSISTANT_TOOL_NAMES)[number];

export interface AssistantScope {
  activeTab: ActiveTab;
  anonymizeClients: boolean;
  userLabel: string;
}

export interface DirectOrderPrefill {
  catalogId?: string;
  nomClient?: string;
  prenomClient?: string;
  emailClient?: string;
  qte?: number;
  prixOverride?: number;
  source?: Extract<OrderSource, 'direct' | 'perso'>;
  statut?: Extract<OrderStatus, 'attente_reception' | 'recu_lbg' | 'remis_client'>;
  notes?: string;
}

export interface SupplierLotPrefill {
  catalogId?: string;
  typeAchat?: LotType;
  qteCommandee?: number;
  coutUnitaireHT?: number;
  statutLot?: LotStatus;
  referenceFacture?: string;
  notes?: string;
}

export interface CatalogItemPrefill {
  domaine?: string;
  cuvee?: string;
  vente?: string;
  canal?: WineChannel;
  region?: string;
  color?: WineColor;
  tarifAchatHT?: number;
  prixLbgTTC?: number;
  benchTTC?: number | null;
  benchSource?: string;
}

export type AssistantAction =
  | {
      type: 'navigate';
      tab: ActiveTab;
      search?: string;
      filter?: string;
      vente?: string;
      clientKey?: string;
      periodMonth?: string;
    }
  | { type: 'prefill_direct_order'; prefill: DirectOrderPrefill }
  | { type: 'prefill_supplier_lot'; prefill: SupplierLotPrefill }
  | { type: 'prefill_catalog_item'; prefill: CatalogItemPrefill }
  | { type: 'open_modal'; modal: 'import_helloasso' | 'invoice_ai' }
  | { type: 'copy_text'; label: string; text: string };

export type MetricTone = 'neutral' | 'ok' | 'warn' | 'bad' | 'brand';

export interface ResultMetric {
  label: string;
  value: string;
  tone?: MetricTone;
}

export interface ResultCardItem {
  id: string;
  title: string;
  subtitle?: string;
  badge?: string;
  badgeTone?: MetricTone;
  rightValue?: string;
  action?: AssistantAction;
}

export interface ResultCard {
  id: string;
  title: string;
  subtitle?: string;
  tone?: MetricTone;
  metrics?: ResultMetric[];
  items?: ResultCardItem[];
  actionLabel?: string;
  action?: AssistantAction;
}

export interface AssistantContentPart {
  text?: string;
  thought?: boolean;
  thoughtSignature?: string;
  functionCall?: {
    id?: string;
    name?: string;
    args?: Record<string, unknown>;
  };
  functionResponse?: {
    id?: string;
    name?: string;
    response?: Record<string, unknown>;
  };
  [key: string]: unknown;
}

export interface AssistantContent {
  role: 'user' | 'model' | 'tool';
  parts: AssistantContentPart[];
}

export interface AssistantToolCall {
  id?: string;
  name: AssistantToolName;
  args: Record<string, unknown>;
}

export interface AssistantAnswer {
  text: string;
  citedIds: string[];
  followUps: string[];
  usedTools?: AssistantToolName[];
}

export type AssistantServerResponse =
  | {
      kind: 'tool_calls';
      questionId: string;
      model: string;
      modelContent: AssistantContent;
      calls: AssistantToolCall[];
    }
  | {
      kind: 'answer';
      questionId: string;
      model: string;
      answer: AssistantAnswer;
    };

export interface AssistantRequestBody {
  questionId: string;
  history: AssistantContent[];
  allowedTools: AssistantToolName[];
  scope: AssistantScope;
  lockedModel?: string;
  toolRound?: number;
}

export interface AssistantFeedbackPayload {
  questionId: string;
  vote: 'up' | 'down';
  model?: string;
  usedTools?: AssistantToolName[];
}

export interface ChatMessage {
  id: string;
  role: 'user' | 'assistant';
  text: string;
  cards?: ResultCard[];
  followUps?: string[];
  usedTools?: AssistantToolName[];
  model?: string;
  questionId?: string;
  vote?: 'up' | 'down';
  error?: boolean;
}

export interface AssistantThread {
  id: string;
  ownerUid: string;
  title: string;
  messages: ChatMessage[];
  history: AssistantContent[];
  messageCount: number;
  createdAt: string;
  updatedAt: string;
}
