import 'dotenv/config';
import fs from 'node:fs';
import path from 'node:path';
import type http from 'node:http';
import type { AddressInfo } from 'node:net';
import { createApp } from '../../server.ts';
import { isAiConfigured } from '../../server/gemini.ts';
import {
  DEFAULT_SETTINGS,
  INITIAL_CAMPAIGNS,
  INITIAL_CATALOG,
  INITIAL_LOTS,
  INITIAL_ORDERS,
} from '../../src/data/seedData.ts';
import {
  availableTools,
  sanitizeForPrivacy,
  TOOLS,
  type AssistantToolContext,
} from '../../src/modules/assistant/tools.ts';
import type {
  AssistantContent,
  AssistantServerResponse,
  AssistantToolCall,
} from '../../src/modules/assistant/types.ts';
import type { ActiveTab } from '../../src/types/wine.ts';

interface GoldenCase {
  id: string;
  category: string;
  activeTab: ActiveTab;
  anonymizeClients: boolean;
  prompt: string;
  expectedTools: string[];
  forbiddenSubstrings?: string[];
  expectRefusalOrRedirect?: boolean;
}

async function runCase(
  baseUrl: string,
  testCase: GoldenCase
): Promise<{ id: string; ok: boolean; reason?: string; toolsUsed: string[] }> {
  const ctx: AssistantToolContext = {
    catalog: INITIAL_CATALOG,
    lots: INITIAL_LOTS,
    orders: INITIAL_ORDERS,
    campaigns: INITIAL_CAMPAIGNS,
    settings: {
      ...DEFAULT_SETTINGS,
      anonymizeClients: testCase.anonymizeClients,
    },
    activeTab: testCase.activeTab,
  };

  const allowedTools = availableTools(ctx);
  const questionId = `eval_${testCase.id}_${Date.now()}`;
  const history: AssistantContent[] = [
    { role: 'user', parts: [{ text: testCase.prompt }] },
  ];

  const toolsUsed: string[] = [];
  let lockedModel: string | undefined;

  for (let round = 0; round <= 4; round++) {
    const res = await fetch(`${baseUrl}/api/ai/assistant`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-question-id': questionId,
      },
      body: JSON.stringify({
        questionId,
        history,
        allowedTools,
        lockedModel,
        toolRound: round,
        scope: {
          activeTab: testCase.activeTab,
          anonymizeClients: testCase.anonymizeClients,
          userLabel: 'Eval',
        },
      }),
    });

    if (!res.ok) {
      return {
        id: testCase.id,
        ok: false,
        reason: `HTTP ${res.status}: ${await res.text()}`,
        toolsUsed,
      };
    }

    const payload = (await res.json()) as AssistantServerResponse;
    lockedModel = payload.model;

    if (payload.kind === 'tool_calls') {
      history.push(payload.modelContent);
      const responseParts: AssistantContent['parts'] = [];
      for (const call of payload.calls as AssistantToolCall[]) {
        toolsUsed.push(call.name);
        const tool = TOOLS[call.name];
        const raw = await tool.run(ctx, call.args);
        const safe = sanitizeForPrivacy(raw, testCase.anonymizeClients);
        responseParts.push({
          functionResponse: {
            id: call.id,
            name: call.name,
            response: { result: safe },
          },
        });
      }
      history.push({ role: 'user', parts: responseParts });
      continue;
    }

    // Final answer assertions
    const answerText = payload.answer.text;
    for (const expectedTool of testCase.expectedTools) {
      if (!toolsUsed.includes(expectedTool)) {
        return {
          id: testCase.id,
          ok: false,
          reason: `Outil attendu "${expectedTool}" non appelé (appelés : ${toolsUsed.join(', ') || 'aucun'})`,
          toolsUsed,
        };
      }
    }

    if (testCase.forbiddenSubstrings) {
      for (const forbidden of testCase.forbiddenSubstrings) {
        if (answerText.includes(forbidden)) {
          return {
            id: testCase.id,
            ok: false,
            reason: `Fuite de confidentialité détectée : "${forbidden}"`,
            toolsUsed,
          };
        }
      }
    }

    if (testCase.expectRefusalOrRedirect && toolsUsed.length > 0) {
      return {
        id: testCase.id,
        ok: false,
        reason: `Question hors-scope ne devrait pas appeler d'outil (${toolsUsed.join(', ')})`,
        toolsUsed,
      };
    }

    return { id: testCase.id, ok: true, toolsUsed };
  }

  return {
    id: testCase.id,
    ok: false,
    reason: 'Dépassement de tours maximum sans réponse finale.',
    toolsUsed,
  };
}

async function main() {
  if (!isAiConfigured()) {
    console.error(
      'GEMINI_API_KEY (ou GOOGLE_CLOUD_PROJECT) non configurée : impossible de lancer eval.ts.'
    );
    process.exit(1);
  }

  const goldenPath = path.resolve(process.cwd(), 'tests/assistant/golden.json');
  const cases = JSON.parse(fs.readFileSync(goldenPath, 'utf8')) as GoldenCase[];

  const app = createApp();
  const server = await new Promise<http.Server>((resolve) => {
    const s = app.listen(0, '127.0.0.1', () => resolve(s));
  });

  try {
    const addr = server.address() as AddressInfo;
    const baseUrl = `http://127.0.0.1:${addr.port}`;
    let passed = 0;

    for (const c of cases) {
      const result = await runCase(baseUrl, c);
      if (result.ok) {
        passed++;
        console.log(`PASS ${c.id} [${result.toolsUsed.join(', ') || 'direct'}]`);
      } else {
        console.error(`FAIL ${c.id}: ${result.reason}`);
      }
    }

    console.log(`\nScore Eval Golden : ${passed}/${cases.length}`);
    if (passed < cases.length) {
      process.exitCode = 1;
    }
  } finally {
    await new Promise<void>((resolve, reject) => {
      server.close((err) => (err ? reject(err) : resolve()));
    });
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
