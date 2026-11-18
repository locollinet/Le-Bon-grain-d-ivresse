import {
  availableTools,
  sanitizeForPrivacy,
  TOOLS,
  type AssistantToolContext,
} from './tools';
import type {
  AssistantAnswer,
  AssistantContent,
  AssistantFeedbackPayload,
  AssistantRequestBody,
  AssistantServerResponse,
  AssistantToolName,
  ResultCard,
} from './types';

export const MAX_HISTORY_TURNS = 16;
const MAX_CLIENT_ROUNDS = 5;

const TOOL_STEP_LABELS: Record<AssistantToolName, string> = {
  search_catalog_and_stock: 'Je consulte le catalogue et le stock temps réel…',
  logistics_and_deliveries: 'Je vérifie les réceptions et remises clients…',
  stock_alerts_and_advances: 'J’analyse les déficits et le capital en avance…',
  profitability_and_pricing: 'Je calcule les marges nettes et benchmarks…',
  customer_insights_and_recap: 'J’analyse l’historique des clients…',
  accounting_and_vat: 'Je vérifie la TVA et les factures à émettre…',
  prepare_operation: 'Je vérifie les doublons et prépare le formulaire…',
};

function generateQuestionId(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }
  return `q_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;
}

export function trimHistorySafely(
  history: AssistantContent[],
  maxTurns = MAX_HISTORY_TURNS
): AssistantContent[] {
  if (history.length <= maxTurns) return history;
  let start = history.length - maxTurns;
  while (start < history.length) {
    const turn = history[start];
    const isPlainUserTurn =
      turn.role === 'user' &&
      turn.parts.some((p) => typeof p.text === 'string' && p.text.trim().length > 0) &&
      !turn.parts.some((p) => Boolean(p.functionResponse));
    if (isPlainUserTurn) {
      return history.slice(start);
    }
    start += 1;
  }
  return history.slice(-1);
}

async function postAssistant(
  url: string,
  body: unknown,
  questionId?: string
): Promise<unknown> {
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
  };
  if (questionId) {
    headers['X-Question-Id'] = questionId;
  }

  const response = await fetch(url, {
    method: 'POST',
    headers,
    body: JSON.stringify(body),
  });

  const rawText = await response.text();
  if (!rawText.trim()) {
    throw new Error(
      `Réponse vide du serveur (HTTP ${response.status}). Vérifiez que le serveur Express tourne bien.`
    );
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(rawText);
  } catch {
    throw new Error(
      `Réponse invalide du serveur (HTTP ${response.status}) : impossible de lire le JSON.`
    );
  }

  if (!response.ok) {
    const errObj = parsed as { error?: string };
    throw new Error(
      errObj?.error || `Erreur serveur HTTP ${response.status}.`
    );
  }

  return parsed;
}

function isValidServerResponse(data: unknown): data is AssistantServerResponse {
  if (!data || typeof data !== 'object') return false;
  const obj = data as Record<string, unknown>;
  if (obj.kind === 'answer') {
    return Boolean(obj.answer && typeof obj.answer === 'object');
  }
  if (obj.kind === 'tool_calls') {
    return (
      Array.isArray(obj.calls) &&
      Boolean(obj.modelContent && typeof obj.modelContent === 'object')
    );
  }
  return false;
}

export interface AskAssistantResult {
  questionId: string;
  model: string;
  answer: AssistantAnswer;
  cards: ResultCard[];
  history: AssistantContent[];
}

export async function askAssistant(params: {
  question: string;
  history: AssistantContent[];
  ctx: AssistantToolContext;
  onStep?: (label: string) => void;
}): Promise<AskAssistantResult> {
  const { question, ctx, onStep } = params;
  const questionId = generateQuestionId();
  const allowedTools = availableTools(ctx);

  let workingHistory: AssistantContent[] = trimHistorySafely([
    ...params.history,
    { role: 'user', parts: [{ text: question.trim() }] },
  ]);

  let lockedModel: string | undefined;
  const collectedCards: ResultCard[] = [];
  const usedTools = new Set<AssistantToolName>();

  onStep?.('Analyse de votre demande…');

  for (let round = 0; round < MAX_CLIENT_ROUNDS; round++) {
    const reqBody: AssistantRequestBody = {
      questionId,
      history: workingHistory,
      allowedTools,
      scope: {
        activeTab: ctx.activeTab,
        anonymizeClients: ctx.settings.anonymizeClients,
        userLabel: 'Romain Becker',
      },
      lockedModel,
      toolRound: round,
    };

    const raw = await postAssistant('/api/ai/assistant', reqBody, questionId);
    if (!isValidServerResponse(raw)) {
      throw new Error('Format de réponse assistant inattendu.');
    }

    lockedModel = raw.model;

    if (raw.kind === 'answer') {
      const finalHistory = trimHistorySafely([
        ...workingHistory,
        { role: 'model', parts: [{ text: raw.answer.text }] },
      ]);
      return {
        questionId,
        model: raw.model,
        answer: {
          ...raw.answer,
          usedTools: Array.from(usedTools),
        },
        cards: collectedCards,
        history: finalHistory,
      };
    }

    // Conservation intacte de modelContent (inclut thought / thoughtSignature)
    workingHistory = [...workingHistory, raw.modelContent];

    const responseParts: AssistantContent['parts'] = [];
    for (const call of raw.calls) {
      const tool = TOOLS[call.name];
      if (!tool) continue;

      usedTools.add(call.name);
      onStep?.(TOOL_STEP_LABELS[call.name] ?? `Exécution de ${call.name}…`);

      const rawOutput = await tool.run(ctx, call.args);
      const cards = tool.toCards(rawOutput, ctx);
      collectedCards.push(...cards);

      const safeOutputForModel = sanitizeForPrivacy(
        rawOutput,
        ctx.settings.anonymizeClients
      );

      responseParts.push({
        functionResponse: {
          id: call.id,
          name: call.name,
          response: { result: safeOutputForModel },
        },
      });
    }

    workingHistory = [
      ...workingHistory,
      { role: 'user', parts: responseParts },
    ];
    onStep?.('Synthèse de la réponse…');
  }

  throw new Error(
    "L'assistant a atteint le nombre maximum d'étapes pour cette question."
  );
}

export async function sendAssistantFeedback(
  payload: AssistantFeedbackPayload
): Promise<void> {
  await postAssistant('/api/ai/assistant/feedback', payload);
}
