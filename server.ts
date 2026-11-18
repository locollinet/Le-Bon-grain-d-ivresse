import 'dotenv/config';
import express from 'express';
import path from 'path';
import { fileURLToPath } from 'url';
import { GoogleGenAI, Type } from '@google/genai';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const PORT = Number(process.env.PORT || 3000);

interface CatalogHint {
  id: string;
  domaine: string;
  cuvee: string;
  tarifAchatHT: number;
  prixLbgTTC: number;
}

interface ParseInvoiceRequest {
  fileBase64?: string;
  mimeType?: string;
  textContent?: string;
  directionHint?: 'auto' | 'achat' | 'vente';
  catalogHints?: CatalogHint[];
}

async function startServer() {
  const app = express();
  app.use(express.json({ limit: '25mb' }));

  // Server-side AI Invoice Interpretation Route
  app.post('/api/parse-invoice', async (req, res) => {
    try {
      const apiKey = process.env.GEMINI_API_KEY;
      if (!apiKey) {
        return res.status(500).json({
          error:
            "Clé API Gemini absente côté serveur. Veuillez configurer GEMINI_API_KEY dans les secrets de l'application.",
        });
      }

      const body = req.body as ParseInvoiceRequest;
      if (!body.fileBase64 && !body.textContent?.trim()) {
        return res.status(400).json({
          error:
            'Veuillez fournir une image/PDF de facture ou coller le texte du document.',
        });
      }

      const ai = new GoogleGenAI({
        apiKey,
        httpOptions: {
          headers: {
            'User-Agent': 'aistudio-build',
          },
        },
      });

      const catalogListText = (body.catalogHints ?? [])
        .map(
          (c) =>
            `- ID="${c.id}" | Domaine="${c.domaine}" | Cuvée="${c.cuvee}" | AchatHT=${c.tarifAchatHT} | VenteTTC=${c.prixLbgTTC}`
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
3. Pour chaque ligne de vin, essaie de faire correspondre "matchedCatalogId" avec l'ID exact du catalogue ci-dessous si la cuvée correspond (même avec de légères variations d'écriture ou de millésime proche). Sinon mets null.
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
        model: 'gemini-4-hydrogen',
        contents: { parts },
        config: {
          systemInstruction,
          responseMimeType: 'application/json',
          responseSchema: {
            type: Type.OBJECT,
            properties: {
              direction: {
                type: Type.STRING,
                description: "'achat' pour achat fournisseur (entrée stock), 'vente' pour vente client (sortie stock)",
              },
              directionReason: {
                type: Type.STRING,
                description: 'Explication courte en français du sens de la facture (achat vs vente).',
              },
              counterpartyName: {
                type: Type.STRING,
                description: 'Nom du domaine/fournisseur (si achat) ou du client (si vente).',
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
                      description: 'ID exact du catalogue correspondant si trouvé, sinon chaîne vide.',
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
                  required: ['domaine', 'cuvee', 'quantity', 'unitPriceHT', 'unitPriceTTC'],
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
        },
      });

      const rawJson = (response.text ?? '{}').trim();
      const parsed = JSON.parse(rawJson);
      return res.json(parsed);
    } catch (err: unknown) {
      const message =
        err instanceof Error
          ? err.message
          : "Erreur lors de l'analyse IA de la facture.";
      console.error('[/api/parse-invoice] Error:', err);
      return res.status(500).json({ error: message });
    }
  });

  if (process.env.NODE_ENV !== 'production') {
    const { createServer: createViteServer } = await import('vite');
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.resolve(__dirname, 'dist');
    app.use(express.static(distPath));
    app.get('*', (_req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`Server running on http://0.0.0.0:${PORT}`);
  });
}

startServer();
