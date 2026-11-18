import {
  GoogleGenAI,
  ThinkingLevel,
  Type,
  type GenerateContentParameters,
  type GenerateContentResponse,
} from '@google/genai';

export interface AiClientLike {
  models: {
    generateContent: (
      params: GenerateContentParameters
    ) => Promise<GenerateContentResponse>;
  };
}

let customFactory: (() => AiClientLike) | null = null;

export function setAiClientFactory(factory: (() => AiClientLike) | null): void {
  customFactory = factory;
}

export function isAiConfigured(): boolean {
  if (customFactory) return true;
  if ((process.env.AI_BACKEND ?? 'gemini').toLowerCase() === 'vertex') {
    return Boolean(process.env.GOOGLE_CLOUD_PROJECT);
  }
  return Boolean(process.env.GEMINI_API_KEY);
}

export function getAiClient(): AiClientLike {
  if (customFactory) {
    return customFactory();
  }

  const backend = (process.env.AI_BACKEND ?? 'gemini').toLowerCase();
  if (backend === 'vertex') {
    const project = process.env.GOOGLE_CLOUD_PROJECT;
    const location = process.env.GOOGLE_CLOUD_LOCATION || 'europe-west1';
    if (!project) {
      throw new Error(
        'Configuration Vertex AI incomplète : GOOGLE_CLOUD_PROJECT manquant.'
      );
    }
    return new GoogleGenAI({
      vertexai: true,
      project,
      location,
    });
  }

  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    throw new Error(
      "Clé API Gemini absente côté serveur. Veuillez configurer GEMINI_API_KEY dans les secrets de l'application."
    );
  }

  return new GoogleGenAI({
    apiKey,
    httpOptions: {
      headers: {
        'User-Agent': 'aistudio-build',
      },
    },
  });
}

export function isGemini3Or4Model(model: string): boolean {
  const lower = model.toLowerCase();
  return (
    lower.startsWith('gemini-3') ||
    lower.startsWith('gemini-4') ||
    lower === 'gemini-flash-latest'
  );
}

export function assistantModelList(): string[] {
  const raw = [
    process.env.GEMINI_ASSISTANT_MODEL,
    'gemini-4-hydrogen',
    'gemini-3.1-flash-lite',
  ].filter((m): m is string => Boolean(m && m.trim()));

  const deduped = Array.from(new Set(raw.map((m) => m.trim())));
  return deduped.slice(0, 2);
}

export function buildModelConfig(
  model: string,
  base: NonNullable<GenerateContentParameters['config']>
): NonNullable<GenerateContentParameters['config']> {
  const config: NonNullable<GenerateContentParameters['config']> = { ...base };
  if (isGemini3Or4Model(model)) {
    delete config.temperature;
    config.thinkingConfig = {
      thinkingLevel: ThinkingLevel.LOW,
    };
  }
  return config;
}

export interface InvoiceCatalogHint {
  id: string;
  domaine: string;
  cuvee: string;
  tarifAchatHT: number;
  prixLbgTTC: number;
}

export interface ParseInvoiceRequest {
  fileBase64?: string;
  mimeType?: string;
  textContent?: string;
  directionHint?: 'auto' | 'achat' | 'vente';
  catalogHints?: InvoiceCatalogHint[];
}

export async function parseInvoiceWithGemini(body: ParseInvoiceRequest): Promise<unknown> {
  const ai = getAiClient();
  const model = process.env.GEMINI_INVOICE_MODEL?.trim() || 'gemini-4-hydrogen';

  const catalogListText = (body.catalogHints ?? [])
    .slice(0, 120)
    .map(
      (c) =>
        `- ID="${c.id}" | Domaine="${c.domaine}" | Cuvée="${c.cuvee}" | EXW=${c.tarifAchatHT} | VenteTTC=${c.prixLbgTTC}`
    )
    .join('\n');

  const directionInstruction =
    body.directionHint === 'achat'
      ? "L'utilisateur indique qu'il s'agit d'un ACHAT fournisseur (entrée de stock)."
      : body.directionHint === 'vente'
        ? "L'utilisateur indique qu'il s'agit d'une VENTE client (sortie de stock)."
        : "Détermine automatiquement s'il s'agit d'un ACHAT fournisseur (facture d'un domaine/vigneron/grossiste adressée à Le Bon Grain d'Ivresse / Romain Becker -> direction='achat') ou d'une VENTE client (facture ou bon de commande émis par Le Bon Grain d'Ivresse pour un client -> direction='vente').";

  const systemInstruction = `Tu es un assistant comptable et expert en négoce de vin pour "Le Bon Grain d'Ivresse" (Romain Becker).
Analyse la facture ou le bon de commande fourni et extrais les données structurées en JSON strict.
Règles métier critiques :
1. ${directionInstruction}
2. Explique clairement en français dans "directionReason" pourquoi c'est un achat (entrée en cave/transit) ou une vente (sortie de stock).
3. Pour chaque ligne de vin, essaie de faire correspondre "matchedCatalogId" avec l'ID exact du catalogue ci-dessous si la cuvée correspond (même avec de légères variations d'écriture ou de millésime proche). Sinon mets une chaîne vide "".
4. Si les prix unitaires sur une facture fournisseur sont uniquement HT, calcule unitPriceTTC avec la TVA détectée (souvent 20%). Si uniquement TTC (vente client), calcule unitPriceHT = unitPriceTTC / (1 + tvaRatePct/100).
5. Extrais les frais de port/transport s'ils apparaissent sur une ligne séparée dans "shippingTotalHT" (et ne les mets pas dans les lignes de bouteilles).
6. Format de date strict YYYY-MM-DD.

Catalogue existant de Le Bon Grain d'Ivresse :
${catalogListText || '(Catalogue vide)'}`;

  const parts: Array<
    { text: string } | { inlineData: { mimeType: string; data: string } }
  > = [];

  if (body.fileBase64 && body.mimeType) {
    parts.push({
      inlineData: {
        mimeType: body.mimeType,
        data: body.fileBase64,
      },
    });
  }

  if (body.textContent?.trim()) {
    parts.push({
      text: `Contenu texte du document à analyser :\n\n${body.textContent.trim()}`,
    });
  } else {
    parts.push({
      text: 'Analyse ce document (facture ou bon de commande de vin) et extrais toutes les informations structurées.',
    });
  }

  const response = await ai.models.generateContent({
    model,
    contents: { parts },
    config: buildModelConfig(model, {
      systemInstruction,
      responseMimeType: 'application/json',
      responseSchema: {
        type: Type.OBJECT,
        properties: {
          direction: {
            type: Type.STRING,
            description:
              "'achat' pour achat fournisseur (entrée stock), 'vente' pour vente client (sortie stock)",
          },
          directionReason: {
            type: Type.STRING,
            description:
              'Explication courte en français du sens de la facture (achat vs vente).',
          },
          counterpartyName: {
            type: Type.STRING,
            description:
              'Nom du domaine/fournisseur (si achat) ou du client (si vente).',
          },
          counterpartyEmail: {
            type: Type.STRING,
            description: 'Email si présent, sinon chaîne vide.',
          },
          invoiceNumber: {
            type: Type.STRING,
            description: 'Numéro de facture ou référence.',
          },
          invoiceDate: {
            type: Type.STRING,
            description: 'Date au format YYYY-MM-DD.',
          },
          tvaRatePct: {
            type: Type.NUMBER,
            description: 'Taux de TVA principal en pourcentage (ex: 20 ou 0).',
          },
          shippingTotalHT: {
            type: Type.NUMBER,
            description: 'Frais de transport / port HT totaux si facturés.',
          },
          totalHT: {
            type: Type.NUMBER,
            description: 'Total HT de la facture.',
          },
          totalTVA: {
            type: Type.NUMBER,
            description: 'Montant total de TVA.',
          },
          totalTTC: {
            type: Type.NUMBER,
            description: 'Total TTC de la facture.',
          },
          lines: {
            type: Type.ARRAY,
            items: {
              type: Type.OBJECT,
              properties: {
                matchedCatalogId: {
                  type: Type.STRING,
                  description:
                    'ID exact du catalogue correspondant si trouvé, sinon chaîne vide.',
                },
                domaine: {
                  type: Type.STRING,
                  description: 'Nom du domaine viticole.',
                },
                cuvee: {
                  type: Type.STRING,
                  description: 'Nom de la cuvée et millésime.',
                },
                quantity: {
                  type: Type.INTEGER,
                  description: 'Nombre de bouteilles.',
                },
                unitPriceHT: {
                  type: Type.NUMBER,
                  description: 'Prix unitaire HT en euros.',
                },
                unitPriceTTC: {
                  type: Type.NUMBER,
                  description: 'Prix unitaire TTC en euros.',
                },
              },
              required: [
                'domaine',
                'cuvee',
                'quantity',
                'unitPriceHT',
                'unitPriceTTC',
              ],
            },
          },
        },
        required: [
          'direction',
          'directionReason',
          'counterpartyName',
          'invoiceNumber',
          'invoiceDate',
          'tvaRatePct',
          'totalHT',
          'totalTTC',
          'lines',
        ],
      },
    }),
  });

  const rawJson = (response.text ?? '{}')
    .trim()
    .replace(/^```(?:json)?\s*/i, '')
    .replace(/\s*```$/i, '');
  return JSON.parse(rawJson);
}
