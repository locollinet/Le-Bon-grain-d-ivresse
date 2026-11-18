import express, { type Router } from 'express';
import type { Content } from '@google/genai';
import {
  ASSISTANT_TOOL_NAMES,
  type AssistantAnswer,
  type AssistantContent,
  type AssistantFeedbackPayload,
  type AssistantRequestBody,
  type AssistantScope,
  type AssistantServerResponse,
  type AssistantToolCall,
  type AssistantToolName,
} from '../src/modules/assistant/types.ts';
import {
  ASSISTANT_ANSWER_SCHEMA,
  TOOL_DECLARATIONS,
} from '../src/modules/assistant/schema.ts';
import {
  assistantModelList,
  buildModelConfig,
  getAiClient,
  isAiConfigured,
} from './gemini.ts';
import {
  checkQuestionTurn,
  getClientOwnerKey,
  requireAccessIfConfigured,
} from './guard.ts';

export const MAX_TOOL_ROUNDS = 4;
const ALLOWED_TOOL_SET = new Set<string>(ASSISTANT_TOOL_NAMES);

function isRecord(v: unknown): v is Record<string, unknown> {
  return Boolean(v) && typeof v === 'object' && !Array.isArray(v);
}

export function parseAssistantRequest(
  rawBody: unknown,
  headerQuestionId?: string
):
  | { ok: true; value: AssistantRequestBody }
  | { ok: false; status: number; error: string } {
  if (!isRecord(rawBody)) {
    return { ok: false, status: 400, error: 'Corps JSON invalide.' };
  }

  const qidRaw =
    typeof rawBody.questionId === 'string' && rawBody.questionId.trim()
      ? rawBody.questionId.trim()
      : (headerQuestionId ?? '').trim();

  if (!qidRaw || qidRaw.length > 120) {
    return { ok: false, status: 400, error: 'questionId manquant ou invalide.' };
  }

  if (!Array.isArray(rawBody.history) || rawBody.history.length === 0) {
    return { ok: false, status: 400, error: 'history doit être un tableau non vide.' };
  }

  if (rawBody.history.length > 48) {
    return { ok: false, status: 400, error: 'Historique de conversation trop long.' };
  }

  const history: AssistantContent[] = [];
  for (const turn of rawBody.history) {
    if (
      !isRecord(turn) ||
      (turn.role !== 'user' && turn.role !== 'model' && turn.role !== 'tool') ||
      !Array.isArray(turn.parts) ||
      turn.parts.length === 0
    ) {
      return { ok: false, status: 400, error: 'Format de tour history invalide.' };
    }
    history.push(turn as unknown as AssistantContent);
  }

  if (!Array.isArray(rawBody.allowedTools)) {
    return { ok: false, status: 400, error: 'allowedTools doit être un tableau.' };
  }

  const allowedTools: AssistantToolName[] = [];
  for (const t of rawBody.allowedTools) {
    if (typeof t !== 'string' || !ALLOWED_TOOL_SET.has(t)) {
      return {
        ok: false,
        status: 400,
        error: `Outil non reconnu dans allowedTools : ${String(t)}`,
      };
    }
    allowedTools.push(t as AssistantToolName);
  }

  const rawScope = isRecord(rawBody.scope) ? rawBody.scope : {};
  const scope: AssistantScope = {
    activeTab:
      typeof rawScope.activeTab === 'string'
        ? (rawScope.activeTab as AssistantScope['activeTab'])
        : 'dashboard',
    anonymizeClients: Boolean(rawScope.anonymizeClients),
    userLabel:
      typeof rawScope.userLabel === 'string' && rawScope.userLabel.trim()
        ? rawScope.userLabel.trim().slice(0, 80)
        : 'Romain Becker',
  };

  const toolRound =
    typeof rawBody.toolRound === 'number' && Number.isFinite(rawBody.toolRound)
      ? Math.max(0, Math.min(MAX_TOOL_ROUNDS, Math.floor(rawBody.toolRound)))
      : 0;

  const lockedModel =
    typeof rawBody.lockedModel === 'string' && rawBody.lockedModel.trim()
      ? rawBody.lockedModel.trim().slice(0, 80)
      : undefined;

  return {
    ok: true,
    value: {
      questionId: qidRaw,
      history,
      allowedTools,
      scope,
      lockedModel,
      toolRound,
    },
  };
}

export function buildSystemPrompt(scope: AssistantScope): string {
  return `Tu es l'assistant métier IA intégré à "Le Bon Grain d'Ivresse" (négoce en vin de Romain Becker & Alice : ventes Club, WhatsApp, HelloAsso, achats en avance et allocations).
Contexte actif :
- Onglet affiché : "${scope.activeTab}"
- Mode confidentialité noms clients : ${scope.anonymizeClients ? 'ACTIF (noms/emails masqués)' : 'INACTIF'}

Règles impératives :
1. NE CALCULE JAMAIS de stock, de marge, de TVA ou de totaux de tête, et N'INVENTE JAMAIS un nom de cuvée, prix ou client : appelle systématiquement les outils fournis pour interroger les données réelles.
2. Vocabulaire métier de l'application :
   - Les prix d'achat catalogue sont EXW HT. Par défaut, les frais logistiques LBG sont de 1,00 € HT amont + 3,50 € HT aval = 4,50 € HT/btl livré (sauf override spécifique).
   - "% marge nette" = Marge nette HT / Coût de revient livré HT.
   - "Disponible libre" = (Physique cave + En commande domaine) - Réservé clients.
   - Les sorties "cave perso" (0 €) sont suivies à part pour ne pas fausser la marge commerciale.
3. Tu ne modifies JAMAIS les données directement : pour toute création/saisie demandée par l'utilisateur (vente directe, lot fournisseur, nouvelle cuvée, import HelloAsso, facture IA), appelle "prepare_operation" qui vérifiera les doublons et fournira un bouton ouvrant l'écran pré-rempli.
4. Si une question est hors du domaine du négoce en vin / de l'application, recadre poliment et brièvement en français.
5. Réponds en français clair, synthétique (2 à 5 phrases ou puces courtes), sans répéter inutilement chaque ligne déjà affichée dans les cartes visuelles.`;
}

export function parseFinalAnswerJson(
  rawText: string,
  usedTools: AssistantToolName[]
): AssistantAnswer {
  const cleaned = rawText
    .trim()
    .replace(/^```(?:json)?\s*/i, '')
    .replace(/\s*```$/i, '');

  try {
    const parsed = JSON.parse(cleaned) as Partial<AssistantAnswer>;
    if (typeof parsed.text === 'string' && parsed.text.trim()) {
      return {
        text: parsed.text.trim(),
        citedIds: Array.isArray(parsed.citedIds)
          ? parsed.citedIds.filter((x): x is string => typeof x === 'string')
          : [],
        followUps: Array.isArray(parsed.followUps)
          ? parsed.followUps
              .filter((x): x is string => typeof x === 'string')
              .slice(0, 3)
          : [],
        usedTools,
      };
    }
  } catch {
    // Fallback propre si le modèle a répondu en texte libre avant le tour final
  }

  return {
    text:
      cleaned ||
      'Je n’ai pas pu formuler de réponse complète à partir des données disponibles.',
    citedIds: [],
    followUps: [],
    usedTools,
  };
}

function collectUsedToolsFromHistory(
  history: AssistantContent[]
): AssistantToolName[] {
  const used = new Set<AssistantToolName>();
  for (const turn of history) {
    for (const part of turn.parts) {
      const fnName = part.functionResponse?.name;
      if (fnName && ALLOWED_TOOL_SET.has(fnName)) {
        used.add(fnName as AssistantToolName);
      }
    }
  }
  return Array.from(used);
}

export function createAssistantRouter(): Router {
  const router = express.Router();
  router.use(express.json({ limit: '200kb' }));
  router.use(requireAccessIfConfigured);

  router.post('/', async (req, res) => {
    const startedAt = Date.now();
    const headerQid =
      typeof req.headers['x-question-id'] === 'string'
        ? req.headers['x-question-id']
        : undefined;

    const parsedReq = parseAssistantRequest(req.body, headerQid);
    if (!parsedReq.ok) {
      return res.status(parsedReq.status).json({ error: parsedReq.error });
    }

    const input = parsedReq.value;
    const ownerKey = getClientOwnerKey(req);
    const guard = checkQuestionTurn(input.questionId, ownerKey);
    if (!guard.allowed) {
      return res.status(429).json({ error: guard.error });
    }

    if (!isAiConfigured()) {
      return res.status(503).json({
        error:
          "Assistant IA indisponible : GEMINI_API_KEY n'est pas configurée côté serveur.",
      });
    }

    const allowedSet = new Set<AssistantToolName>(input.allowedTools);
    const forceFinalJson =
      input.toolRound !== undefined && input.toolRound >= MAX_TOOL_ROUNDS;
    const declarations = forceFinalJson
      ? []
      : TOOL_DECLARATIONS.filter(
          (d) => d.name && allowedSet.has(d.name as AssistantToolName)
        );

    const candidates = input.lockedModel
      ? [input.lockedModel]
      : assistantModelList();

    const ai = getAiClient();
    const systemInstruction = buildSystemPrompt(input.scope);

    let lastError: unknown = null;
    for (let i = 0; i < candidates.length; i++) {
      const model = candidates[i];
      try {
        const baseConfig =
          declarations.length > 0
            ? {
                systemInstruction,
                tools: [{ functionDeclarations: declarations }],
              }
            : {
                systemInstruction,
                responseMimeType: 'application/json',
                responseSchema: ASSISTANT_ANSWER_SCHEMA,
              };

        const response = await ai.models.generateContent({
          model,
          contents: input.history as unknown as Content[],
          config: buildModelConfig(model, baseConfig),
        });

        const candidateContent = response.candidates?.[0]?.content as
          | AssistantContent
          | undefined;

        const rawCalls = (candidateContent?.parts ?? [])
          .filter((p) => Boolean(p.functionCall?.name))
          .map((p) => p.functionCall!)
          .filter(
            (fc) =>
              typeof fc.name === 'string' &&
              allowedSet.has(fc.name as AssistantToolName)
          );

        if (
          rawCalls.length > 0 &&
          candidateContent &&
          (input.toolRound ?? 0) < MAX_TOOL_ROUNDS
        ) {
          const calls: AssistantToolCall[] = rawCalls.map((fc) => ({
            id: fc.id,
            name: fc.name as AssistantToolName,
            args: isRecord(fc.args) ? fc.args : {},
          }));

          const payload: AssistantServerResponse = {
            kind: 'tool_calls',
            questionId: input.questionId,
            model,
            modelContent: candidateContent,
            calls,
          };

          console.info(
            JSON.stringify({
              event: 'assistant_tool_calls',
              model,
              toolRound: input.toolRound ?? 0,
              tools: calls.map((c) => c.name),
              durationMs: Date.now() - startedAt,
            })
          );
          return res.json(payload);
        }

        const usedTools = collectUsedToolsFromHistory(input.history);
        const answer = parseFinalAnswerJson(response.text ?? '', usedTools);
        const payload: AssistantServerResponse = {
          kind: 'answer',
          questionId: input.questionId,
          model,
          answer,
        };

        console.info(
          JSON.stringify({
            event: 'assistant_answer',
            model,
            toolRound: input.toolRound ?? 0,
            usedTools,
            durationMs: Date.now() - startedAt,
          })
        );
        return res.json(payload);
      } catch (err) {
        lastError = err;
        // Repli uniquement au premier tour quand aucun modèle n'est encore verrouillé
        if (input.lockedModel || (input.toolRound ?? 0) > 0) {
          break;
        }
      }
    }

    const message =
      lastError instanceof Error
        ? lastError.message
        : "Erreur lors de l'appel à Gemini.";
    console.error('[assistant_error]', { message });
    return res.status(500).json({ error: message });
  });

  router.post('/feedback', (req, res) => {
    if (!isRecord(req.body)) {
      return res.status(400).json({ error: 'Payload feedback invalide.' });
    }
    const body = req.body as Partial<AssistantFeedbackPayload>;
    if (
      typeof body.questionId !== 'string' ||
      !body.questionId.trim() ||
      (body.vote !== 'up' && body.vote !== 'down')
    ) {
      return res.status(400).json({ error: 'vote ou questionId invalide.' });
    }

    const usedTools = Array.isArray(body.usedTools)
      ? body.usedTools.filter(
          (t): t is AssistantToolName =>
            typeof t === 'string' && ALLOWED_TOOL_SET.has(t)
        )
      : [];

    console.info(
      JSON.stringify({
        event: 'assistant_feedback',
        questionId: body.questionId.trim(),
        vote: body.vote,
        model: typeof body.model === 'string' ? body.model : undefined,
        usedTools,
      })
    );
    return res.json({ ok: true });
  });

  return router;
}
