import 'dotenv/config';
import express from 'express';
import path from 'path';
import { fileURLToPath } from 'url';
import {
  isAiConfigured,
  parseInvoiceWithGemini,
  type ParseInvoiceRequest,
} from './server/gemini.ts';
import { createAssistantRouter } from './server/aiAssistant.ts';
import {
  checkInvoiceRateLimit,
  getClientOwnerKey,
  requireAccessIfConfigured,
} from './server/guard.ts';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const PORT = Number(process.env.PORT || 3000);

export function createApp() {
  const app = express();

  app.get('/api/health', (_req, res) => {
    res.json({ ok: true, aiConfigured: isAiConfigured() });
  });

  app.use('/api/ai/assistant', createAssistantRouter());

  // Server-side AI Invoice Interpretation Route
  app.post(
    '/api/parse-invoice',
    express.json({ limit: '25mb' }),
    requireAccessIfConfigured,
    async (req, res) => {
      try {
        const ownerKey = getClientOwnerKey(req);
        const rate = checkInvoiceRateLimit(ownerKey);
        if (!rate.allowed) {
          return res.status(429).json({ error: rate.error });
        }

        if (!isAiConfigured()) {
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

        const parsed = await parseInvoiceWithGemini(body);
        return res.json(parsed);
      } catch (err: unknown) {
        const message =
          err instanceof Error
            ? err.message
            : "Erreur lors de l'analyse IA de la facture.";
        console.error('[/api/parse-invoice] Error:', err);
        return res.status(500).json({ error: message });
      }
    }
  );

  return app;
}

async function startServer() {
  const app = createApp();

  if (process.env.NODE_ENV !== 'production') {
    const { createServer: createViteServer } = await import('vite');
    const vite = await createViteServer({
      server: {
        middlewareMode: true,
        hmr: false,
      },
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

const isDirectEntry =
  process.argv[1] &&
  path.resolve(process.argv[1]) === path.resolve(__filename);

if (isDirectEntry) {
  startServer();
}
