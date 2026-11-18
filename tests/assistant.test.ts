import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import type http from 'node:http';
import type { AddressInfo } from 'node:net';
import { createApp } from '../server.ts';
import { setAiClientFactory, type AiClientLike } from '../server/gemini.ts';
import { MAX_CALLS_PER_QUESTION, resetGuardsForTest } from '../server/guard.ts';
import {
  DEFAULT_SETTINGS,
  INITIAL_CAMPAIGNS,
  INITIAL_CATALOG,
  INITIAL_LOTS,
  INITIAL_ORDERS,
  SAMPLE_HELLOASSO_PASTE,
} from '../src/data/seedData.ts';
import {
  computeBottleEconomics,
  computeCustomerSummaries,
  computeOrderLineEconomics,
  computeRecommendedBasePriceTTC,
  computeStockSummaries,
} from '../src/utils/wineMath.ts';
import {
  groupParsedRowsToOrderLines,
  parseHelloAssoText,
} from '../src/utils/helloAssoParser.ts';
import {
  availableTools,
  sanitizeForPrivacy,
  TOOLS,
  type AssistantToolContext,
} from '../src/modules/assistant/tools.ts';
import { ASSISTANT_TOOL_NAMES } from '../src/modules/assistant/types.ts';
import { trimHistorySafely } from '../src/modules/assistant/client.ts';
import { searchHelpArticles } from '../src/modules/assistant/helpContent.ts';

function buildSeedContext(overrides?: Partial<AssistantToolContext>): AssistantToolContext {
  return {
    catalog: INITIAL_CATALOG,
    lots: INITIAL_LOTS,
    orders: INITIAL_ORDERS,
    campaigns: INITIAL_CAMPAIGNS,
    settings: { ...DEFAULT_SETTINGS },
    activeTab: 'dashboard',
    ...overrides,
  };
}

async function withTestServer(
  run: (baseUrl: string) => Promise<void>
): Promise<void> {
  resetGuardsForTest();
  const app = createApp();
  const server = await new Promise<http.Server>((resolve) => {
    const s = app.listen(0, '127.0.0.1', () => resolve(s));
  });
  try {
    const addr = server.address() as AddressInfo;
    await run(`http://127.0.0.1:${addr.port}`);
  } finally {
    setAiClientFactory(null);
    resetGuardsForTest();
    await new Promise<void>((resolve, reject) => {
      server.close((err) => (err ? reject(err) : resolve()));
    });
  }
}

test('Excel economics formulas match user spreadsheet', () => {
  const tissotDd = INITIAL_CATALOG.find((c) => c.id === 'cat_tissot_dd');
  assert.ok(tissotDd, 'Tissot DD 2024 should exist in seed catalog');

  const ddEcon = computeBottleEconomics(tissotDd, DEFAULT_SETTINGS);
  assert.ok(Math.abs(ddEcon.coutTotalHT - 19.1) < 1e-6);
  assert.ok(Math.abs(ddEcon.margeEuro - 0.9) < 1e-6);
  assert.ok(Math.abs(ddEcon.margePct - 4.71204188) < 1e-3);

  const recommended = computeRecommendedBasePriceTTC(
    tissotDd.tarifAchatHT,
    DEFAULT_SETTINGS,
    tissotDd
  );
  assert.equal(recommended, 24.87);

  const vernayEncre = INITIAL_CATALOG.find((c) => c.id === 'cat_vernay_terres_encre');
  assert.ok(vernayEncre, 'Vernay Terres d encre should exist');
  const encreEcon = computeBottleEconomics(vernayEncre, DEFAULT_SETTINGS);
  assert.ok(Math.abs(encreEcon.margeEuro - -1 / 3) < 1e-6);

  // Perso tasting at 0 € must never distort commercial margin
  const persoEcon = computeOrderLineEconomics(
    {
      id: 'ord_test_perso',
      date: '2026-10-15',
      refCommande: 'TEST-PERSO-1',
      vente: 'Tissot Octobre 2026',
      nomClient: 'Becker',
      prenomClient: 'Romain',
      emailClient: '',
      catalogId: tissotDd.id,
      produitLabel: tissotDd.cuvee,
      prixUnitaireTTC: 0,
      qte: 2,
      statut: 'remis_client',
      source: 'perso',
    },
    tissotDd,
    DEFAULT_SETTINGS
  );
  assert.equal(persoEcon.isPerso, true);
  assert.equal(persoEcon.margeEuroTotal, 0);
  assert.equal(persoEcon.coutVinHT, 29.2);
});

test('HelloAsso parser handles raw comma CSV, promos, cancellations and duplicate refs', () => {
  const rows = parseHelloAssoText(SAMPLE_HELLOASSO_PASTE, INITIAL_CATALOG);
  assert.equal(rows.length, 6);
  assert.equal(rows[0].cleanCuveeName, 'Marsannay rouge 2023');
  assert.equal(rows[0].mappedStatus, 'attente_reception');
  assert.equal(rows[5].mappedStatus, 'annule');

  // Group without skipping duplicates first, then verify duplicate ref exclusion
  const grouped = groupParsedRowsToOrderLines(rows, 'Vente Novembre 2026');
  // First command 196410220 has 2x Marsannay + 1x Sursis, 2nd has 1x Marsannay + 1x Quarts 37.5cl, 3rd Annulé
  const validated = grouped.filter((g) => g.statut !== 'annule');
  assert.equal(validated.length, 4);
  assert.equal(validated[0].qte, 2);

  // Promo code deduction test
  const promoCsv = [
    'Référence commande,Date de la commande,Statut de la commande,Nom payeur,Prénom payeur,Email payeur,Raison sociale,Moyen de paiement,Tarif,Montant tarif,Code Promo,Montant code promo',
    '199000001,2026-11-18 10:00:00,Validé,Martin,Luc,luc@example.com,,Carte bancaire,Carte Sursis 2022,41,AMI,-5',
  ].join('\n');
  const promoRows = parseHelloAssoText(promoCsv, INITIAL_CATALOG);
  assert.equal(promoRows.length, 1);
  assert.equal(promoRows[0].cleanCuveeName, 'Sursis 2022');
  assert.equal(promoRows[0].montantTTC, 36);
  assert.equal(promoRows[0].codePromo, 'AMI');
  assert.equal(promoRows[0].discountTTC, 5);
});

test('Customer merge resolves email-less direct orders into main email profile', () => {
  const stockRows = computeStockSummaries(INITIAL_CATALOG, INITIAL_LOTS, INITIAL_ORDERS);
  assert.ok(stockRows.length >= INITIAL_CATALOG.length);

  const syntheticOrders = [
    {
      id: 'o1',
      date: '2026-10-01',
      refCommande: 'HA-TEST-1',
      vente: 'Tissot Octobre 2026',
      nomClient: 'Pasquet',
      prenomClient: 'Romain',
      emailClient: 'romain.pasquet@test.fr',
      catalogId: 'cat_tissot_sursis',
      produitLabel: 'Sursis 2022',
      prixUnitaireTTC: 41,
      qte: 1,
      statut: 'recu_lbg' as const,
      source: 'helloasso' as const,
    },
    {
      id: 'o2',
      date: '2026-10-05',
      refCommande: 'DIR-TEST-2',
      vente: 'Tissot Octobre 2026',
      nomClient: 'Pasquet',
      prenomClient: 'Romain',
      emailClient: '',
      catalogId: 'cat_tissot_dd',
      produitLabel: 'DD 2024',
      prixUnitaireTTC: 24,
      qte: 2,
      statut: 'recu_lbg' as const,
      source: 'direct' as const,
    },
  ];

  const catalogMap = new Map(INITIAL_CATALOG.map((c) => [c.id, c]));
  const summaries = computeCustomerSummaries(
    syntheticOrders,
    catalogMap,
    DEFAULT_SETTINGS
  );
  assert.equal(summaries.length, 1);
  assert.equal(summaries[0].totalBouteilles, 3);
  assert.equal(summaries[0].bouteillesPretesLBG, 3);
});

test('sanitizeForPrivacy strips emails always and hides raw names when anonymizeClients is true', () => {
  const samplePayload = {
    nomClient: 'Piereschi',
    prenomClient: 'Didier',
    emailClient: 'didierpiereschi@yahoo.fr',
    displayName: 'Didier Piereschi',
    nested: {
      email: 'simon@example.com',
      clientDisplayName: 'Simon Milléquand',
    },
    prefill: {
      nomClient: 'Pasquet',
      prenomClient: 'Romain',
      emailClient: 'romain@example.com',
    },
  };

  // Even when anonymizeClients is false, raw email keys are stripped
  const publicSafe = sanitizeForPrivacy(samplePayload, false) as Record<string, any>;
  assert.equal('emailClient' in publicSafe, false);
  assert.equal('email' in publicSafe.nested, false);
  assert.equal(publicSafe.displayName, 'Didier Piereschi');

  // When anonymizeClients is true, customer names are masked too
  const anonSafe = sanitizeForPrivacy(samplePayload, true) as Record<string, any>;
  const serialized = JSON.stringify(anonSafe);
  assert.equal(serialized.includes('Piereschi'), false);
  assert.equal(serialized.includes('Milléquand'), false);
  assert.equal(serialized.includes('yahoo.fr'), false);
  assert.equal(serialized.includes('example.com'), false);
});

test('All 7 assistant tools run deterministically with cards and safety checks', async () => {
  const ctx = buildSeedContext();
  assert.deepEqual(availableTools(ctx), [...ASSISTANT_TOOL_NAMES]);

  // 1. search_catalog_and_stock
  const searchOut = await TOOLS.search_catalog_and_stock.run(ctx, {
    region: 'Jura',
    stockState: 'dispo',
    limit: 5,
  });
  assert.ok(Array.isArray(searchOut.items));
  assert.ok(TOOLS.search_catalog_and_stock.toCards(searchOut, ctx).length > 0);

  // 2. logistics_and_deliveries
  const logOut = await TOOLS.logistics_and_deliveries.run(ctx, {
    focus: 'ready_pickup',
    limit: 10,
  });
  assert.ok((logOut.totals as any).readyTotalBottles > 0);
  assert.ok(TOOLS.logistics_and_deliveries.toCards(logOut, ctx).length > 0);

  // 3. stock_alerts_and_advances
  const alertOut = await TOOLS.stock_alerts_and_advances.run(ctx, {
    kind: 'all',
    limit: 10,
  });
  assert.ok(typeof (alertOut.totals as any).totalCapitalAdvanceHT === 'number');
  assert.ok(TOOLS.stock_alerts_and_advances.toCards(alertOut, ctx).length > 0);

  // 4. profitability_and_pricing + simulation
  const simOut = await TOOLS.profitability_and_pricing.run(ctx, {
    simulateQuery: "Terres d'encre",
    simulatePriceTTC: 39,
  });
  const sim = simOut.simulation as any;
  assert.ok(sim, 'Simulation should find Vernay Terres d encre');
  assert.ok(sim.before.margeEuro < 0);
  assert.ok(sim.after.margeEuro > 2.5);
  assert.ok(TOOLS.profitability_and_pricing.toCards(simOut, ctx).length > 0);

  // 5. customer_insights_and_recap + anonymization + WhatsApp draft
  const custOut = await TOOLS.customer_insights_and_recap.run(
    buildSeedContext({ settings: { ...DEFAULT_SETTINGS, anonymizeClients: true } }),
    { clientQuery: 'Piereschi', includeWhatsAppDraft: true }
  );
  const safeCustOut = sanitizeForPrivacy(custOut, true);
  const serializedCust = JSON.stringify(safeCustOut);
  assert.equal(serializedCust.includes('Piereschi'), false);
  assert.equal(serializedCust.includes('Didier'), false);
  assert.equal(serializedCust.includes('yahoo.fr'), false);
  assert.equal(custOut.whatsappDraft, null);

  // 6. accounting_and_vat
  const vatOut = await TOOLS.accounting_and_vat.run(ctx, { periodMonth: 'all' });
  assert.ok((vatOut.vat as any).ventesTTC > 0);
  assert.ok(TOOLS.accounting_and_vat.toCards(vatOut, ctx).length > 0);

  // 7. prepare_operation duplicate detection + stock warning
  const dupOut = await TOOLS.prepare_operation.run(ctx, {
    operation: 'new_catalog_item',
    domaine: 'Champagne Geoffroy',
    cuveeQuery: 'Les Tiersaudes 2019',
  });
  assert.equal(dupOut.duplicateDetected, true);

  const oversizeOrderOut = await TOOLS.prepare_operation.run(ctx, {
    operation: 'direct_order',
    cuveeQuery: 'DD 2024',
    clientName: 'Romain Pasquet',
    quantity: 200,
  });
  assert.ok(
    typeof oversizeOrderOut.stockWarning === 'string' &&
      oversizeOrderOut.stockWarning.length > 0
  );
});

test('Help articles search and trimHistorySafely preserve tool-call boundaries', () => {
  const articles = searchHelpArticles('marge exw');
  assert.ok(articles.length > 0);

  const history = [
    { role: 'user' as const, parts: [{ text: 'Q1' }] },
    { role: 'model' as const, parts: [{ functionCall: { name: 'search_catalog_and_stock', args: {} } }] },
    { role: 'tool' as const, parts: [{ functionResponse: { name: 'search_catalog_and_stock', response: {} } }] },
    { role: 'model' as const, parts: [{ text: 'R1' }] },
    { role: 'user' as const, parts: [{ text: 'Q2' }] },
  ];
  const trimmed = trimHistorySafely(history, 3);
  assert.equal(trimmed[0].role, 'user');
});

test('golden.json contains valid scenarios across all expected tools', () => {
  const goldenPath = path.resolve(
    process.cwd(),
    'tests/assistant/golden.json'
  );
  const cases = JSON.parse(fs.readFileSync(goldenPath, 'utf8')) as Array<{
    id: string;
    prompt: string;
    expectedTools: string[];
  }>;
  assert.ok(cases.length >= 25);
  const validToolSet = new Set<string>(ASSISTANT_TOOL_NAMES);
  for (const item of cases) {
    assert.ok(item.id && item.prompt);
    for (const t of item.expectedTools) {
      assert.equal(validToolSet.has(t), true, `Unknown tool ${t} in ${item.id}`);
    }
  }
});

test('Express /api/ai/assistant preserves thoughtSignature, validates allowedTools, enforces turn quota and exempts feedback', async () => {
  await withTestServer(async (baseUrl) => {
    let callCount = 0;
    const seenPayloads: Array<{ contents: unknown; config: Record<string, unknown> }> = [];

    const mockClient: AiClientLike = {
      models: {
        async generateContent(params) {
          callCount++;
          seenPayloads.push({
            contents: params.contents,
            config: (params.config ?? {}) as Record<string, unknown>,
          });

          if (callCount === 1) {
            return {
              candidates: [
                {
                  content: {
                    role: 'model',
                    parts: [
                      {
                        thoughtSignature: 'sig-abc-123',
                        functionCall: {
                          id: 'call_1',
                          name: 'stock_alerts_and_advances',
                          args: { kind: 'deficit' },
                        },
                      },
                    ],
                  },
                },
              ],
            } as any;
          }

          return {
            text: JSON.stringify({
              text: 'Les déficits prioritaires ont été identifiés.',
              citedIds: ['cat_test'],
              followUps: ['Voir les achats fournisseurs'],
            }),
            candidates: [
              {
                content: {
                  role: 'model',
                  parts: [{ text: '{}' }],
                },
              },
            ],
          } as any;
        },
      },
    };

    setAiClientFactory(() => mockClient);

    // 1. Invalid tool must return 400
    const badRes = await fetch(`${baseUrl}/api/ai/assistant`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        questionId: 'q-bad-tool',
        history: [{ role: 'user', parts: [{ text: 'Bonjour' }] }],
        allowedTools: ['drop_database'],
        scope: { activeTab: 'dashboard', anonymizeClients: false, userLabel: 'Test' },
      }),
    });
    assert.equal(badRes.status, 400);

    // 2. Multi-turn flow preserving modelContent + thoughtSignature
    const qid = 'q-valid-loop';
    const turn1Res = await fetch(`${baseUrl}/api/ai/assistant`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-question-id': qid },
      body: JSON.stringify({
        questionId: qid,
        history: [{ role: 'user', parts: [{ text: 'Quels déficits avons-nous ?' }] }],
        allowedTools: [...ASSISTANT_TOOL_NAMES],
        scope: { activeTab: 'stock', anonymizeClients: false, userLabel: 'Romain' },
        toolRound: 0,
      }),
    });
    assert.equal(turn1Res.status, 200);
    const turn1 = (await turn1Res.json()) as any;
    assert.equal(turn1.kind, 'tool_calls');
    assert.equal(turn1.modelContent.parts[0].thoughtSignature, 'sig-abc-123');
    // Gemini 3/4 config check: temperature must be omitted when thinkingConfig is active
    assert.equal('temperature' in seenPayloads[0].config, false);

    const turn2Res = await fetch(`${baseUrl}/api/ai/assistant`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-question-id': qid },
      body: JSON.stringify({
        questionId: qid,
        lockedModel: turn1.model,
        toolRound: 1,
        allowedTools: [...ASSISTANT_TOOL_NAMES],
        scope: { activeTab: 'stock', anonymizeClients: false, userLabel: 'Romain' },
        history: [
          { role: 'user', parts: [{ text: 'Quels déficits avons-nous ?' }] },
          turn1.modelContent,
          {
            role: 'user',
            parts: [
              {
                functionResponse: {
                  id: 'call_1',
                  name: 'stock_alerts_and_advances',
                  response: { deficits: [] },
                },
              },
            ],
          },
        ],
      }),
    });
    assert.equal(turn2Res.status, 200);
    const turn2 = (await turn2Res.json()) as any;
    assert.equal(turn2.kind, 'answer');
    assert.deepEqual(turn2.answer.usedTools, ['stock_alerts_and_advances']);

    const sentHistory = seenPayloads[1].contents as Array<{ parts: Array<Record<string, unknown>> }>;
    assert.equal(sentHistory[1].parts[0].thoughtSignature, 'sig-abc-123');

    // 3. Turn quota: MAX_CALLS_PER_QUESTION = 5, 6th call with same questionId -> 429
    const quotaQid = 'q-quota-test';
    for (let i = 0; i < MAX_CALLS_PER_QUESTION; i++) {
      const r = await fetch(`${baseUrl}/api/ai/assistant`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          questionId: quotaQid,
          history: [{ role: 'user', parts: [{ text: 'Test quota' }] }],
          allowedTools: [],
          scope: { activeTab: 'dashboard', anonymizeClients: false, userLabel: 'Test' },
        }),
      });
      assert.equal(r.status, 200);
    }
    const sixth = await fetch(`${baseUrl}/api/ai/assistant`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        questionId: quotaQid,
        history: [{ role: 'user', parts: [{ text: 'Test quota 6' }] }],
        allowedTools: [],
        scope: { activeTab: 'dashboard', anonymizeClients: false, userLabel: 'Test' },
      }),
    });
    assert.equal(sixth.status, 429);

    // 4. Feedback endpoint remains allowed even after questionId quota is exhausted
    const fbRes = await fetch(`${baseUrl}/api/ai/assistant/feedback`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        questionId: quotaQid,
        vote: 'up',
        usedTools: ['stock_alerts_and_advances'],
      }),
    });
    assert.equal(fbRes.status, 200);
  });
});
