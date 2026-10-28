import 'dotenv/config';
import express from 'express';
import { createServer as createViteServer } from 'vite';
import path from 'path';
import { fileURLToPath } from 'url';
import dotenv from 'dotenv';
import { runAnalysisPipeline } from './server/services/analysisPipeline.js';
import { AssistantUnavailableError, processAssistantCommand, validateAssistantRequestSummary } from './server/services/aiAssistant.js';
import { store } from './server/services/storage.js';
import { renderSceneToSvgString } from './src/lib/sceneSvgRenderer.js';
import { createAnalysisRouter } from './server/analysis/routes.js';
import { validateDocument } from './src/core/schema/designDocument.js';
import { SceneGraphSchema } from './server/sceneValidation.js';

function getProviderStatus() {
  return {
    gemini: Boolean(process.env.GEMINI_API_KEY && process.env.GEMINI_API_KEY.trim().length > 0),
  };
}

dotenv.config();

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const MAX_ANALYSIS_IMAGE_BYTES = 12 * 1024 * 1024;
const UPLOAD_MODES = new Set(['recreate', 'extract-text', 'redesign', 'quick-edit']);

function sanitizeDesignName(value: unknown): string {
  if (typeof value !== 'string') return 'Uploaded Poster';
  const name = value
    .replace(/[<>:"/\\|?*\u0000-\u001f]/g, ' ')
    .replace(/\s+/g, ' ')
    .replace(/^\.+|\.+$/g, '')
    .trim()
    .slice(0, 80);
  return name || 'Uploaded Poster';
}

function getRasterMimeFromBytes(bytes: Buffer): string | null {
  if (bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) {
    return 'image/jpeg';
  }
  if (bytes.length >= 8 && bytes.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) {
    return 'image/png';
  }
  if (bytes.length >= 12 && bytes.toString('ascii', 0, 4) === 'RIFF' && bytes.toString('ascii', 8, 12) === 'WEBP') {
    return 'image/webp';
  }
  return null;
}

async function startServer() {
  const app = express();
  const PORT = process.env.PORT ? parseInt(process.env.PORT, 10) : 3000;
  const HOST = process.env.HOST?.trim() || '127.0.0.1';

  app.use(express.json({ limit: '20mb' }));
  app.use((error: unknown, _req: express.Request, res: express.Response, next: express.NextFunction) => {
    const parserError = error as { type?: string; status?: number; message?: string };
    if (parserError?.type === 'entity.too.large') {
      res.status(413).json({ error: 'The request is too large. Optimize the image or send fewer design assets.' });
      return;
    }
    if (parserError instanceof SyntaxError && (error as { status?: number }).status === 400) {
      res.status(400).json({ error: 'The request body must contain valid JSON.' });
      return;
    }
    next(error);
  });
  app.use('/api/analysis', createAnalysisRouter());

  app.get('/api/health', (_req, res) => {
    const providers = getProviderStatus();
    res.json({
      success: true,
      providers,
      hasAIProvider: Object.values(providers).some(Boolean),
      message: providers.gemini
        ? 'AI provider configured.'
        : 'No AI provider configured. Manual editing remains available.'
    });
  });

  // API Routes
  app.post('/api/pipeline/analyze', async (req, res) => {
    try {
      const { imagePayload, designName, canvasWidth, canvasHeight, resumeFromStage } = req.body;
      if (!imagePayload) {
        return res.status(400).json({ error: 'Missing imagePayload' });
      }

      if (req.body.mode !== undefined) {
        if (!UPLOAD_MODES.has(req.body.mode)) {
          return res.status(400).json({ error: 'Choose a valid poster mode.' });
        }
        const matches = typeof imagePayload === 'string'
          ? imagePayload.match(/^data:(image\/(?:jpeg|png|webp));base64,([A-Za-z0-9+/]+={0,2})$/)
          : null;
        if (!matches) {
          return res.status(400).json({ error: 'Upload a valid JPG, PNG, or WebP image.' });
        }
        const base64 = matches[2];
        const imageBytes = Buffer.from(base64, 'base64');
        if (
          imageBytes.length === 0 ||
          imageBytes.length > MAX_ANALYSIS_IMAGE_BYTES ||
          imageBytes.toString('base64') !== base64
        ) {
          return res.status(413).json({ error: 'The optimized image is too large. Try a smaller poster.' });
        }
        if (getRasterMimeFromBytes(imageBytes) !== matches[1]) {
          return res.status(400).json({ error: 'The image contents do not match the selected file type.' });
        }
      }

      const designId = 'dsgn_' + Date.now().toString(36) + Math.random().toString(36).substring(2, 6);
      const scene = await runAnalysisPipeline({
        designId,
        imagePayload,
        designName: req.body.mode ? sanitizeDesignName(designName) : designName,
        canvasWidth,
        canvasHeight,
        resumeFromStage
      });

      res.json({ success: true, scene });
    } catch (err: any) {
      console.error('Pipeline analyze error:', err);
      res.status(500).json({ 
        error: err.message || 'Pipeline analysis failed',
        stage: 'pipeline_execution'
      });
    }
  });

  app.use((err: any, req: express.Request, res: express.Response, next: express.NextFunction) => {
    if (req.path === '/api/pipeline/analyze' && err?.type === 'entity.too.large') {
      res.status(413).json({ error: 'The image payload is too large. Optimize the image and try again.' });
      return;
    }
    next(err);
  });

  app.post('/api/assistant/chat', async (req, res) => {
    try {
      const { instruction, documentSummary, previewImage } = req.body ?? {};
      if (typeof instruction !== 'string' || !instruction.trim() || instruction.length > 2000) {
        return res.status(400).json({ error: 'Enter an instruction up to 2,000 characters.' });
      }
      let summary;
      try {
        summary = validateAssistantRequestSummary(documentSummary);
      } catch (error) {
        return res.status(400).json({
          error: 'The current document summary is invalid.',
          details: error instanceof Error ? error.message : String(error)
        });
      }
      if (JSON.stringify(summary).length > 180_000) {
        return res.status(413).json({ error: 'The design summary is too large for an AI edit request. Try with fewer or shorter text layers.' });
      }
      let validatedPreview: { mimeType: string; data: string } | undefined;
      if (previewImage !== undefined) {
        if (
          !previewImage || typeof previewImage !== 'object'
          || !['image/png', 'image/jpeg', 'image/webp'].includes(previewImage.mimeType)
          || typeof previewImage.data !== 'string'
          || previewImage.data.length > 1_400_000
          || !/^[A-Za-z0-9+/]+={0,2}$/.test(previewImage.data)
        ) {
          return res.status(400).json({ error: 'The optional preview image is invalid or too large.' });
        }
        const bytes = Buffer.from(previewImage.data, 'base64');
        if (!bytes.length || bytes.toString('base64') !== previewImage.data) {
          return res.status(400).json({ error: 'The optional preview image is invalid.' });
        }
        validatedPreview = { mimeType: previewImage.mimeType, data: previewImage.data };
      }
      const result = await processAssistantCommand(instruction.trim(), summary, validatedPreview);
      res.json({ success: true, ...result });
    } catch (err: unknown) {
      if (err instanceof AssistantUnavailableError) {
        res.status(503).json({ error: err.message });
        return;
      }
      console.error('Assistant chat error:', err);
      res.status(400).json({
        error: err instanceof Error ? err.message : 'Assistant failed to validate the requested edit.'
      });
    }
  });

  app.post('/api/designs', (req, res) => {
    const validation = SceneGraphSchema.safeParse(req.body?.scene);
    if (!validation.success) {
      res.status(400).json({ error: 'Invalid scene graph.', details: validation.error.flatten() });
      return;
    }
    store.saveDesign(validation.data);
    res.json({ success: true, designId: validation.data.design_id });
  });

  app.post('/api/documents', (req, res) => {
    const validation = validateDocument(req.body?.document);
    if (!validation.success) {
      res.status(400).json({ error: 'Invalid DesignDocument.', details: validation.error.flatten() });
      return;
    }
    store.saveDocument(validation.data);
    res.json({ success: true, documentId: validation.data.id });
  });

  app.get('/api/documents/:id', (req, res) => {
    const document = store.getDocument(req.params.id);
    if (!document) {
      res.status(404).json({ error: 'DesignDocument not found.' });
      return;
    }
    res.json({ success: true, document });
  });

  app.delete('/api/documents/:id', (req, res) => {
    if (req.params.id.length > 120) {
      res.status(400).json({ error: 'DesignDocument id is invalid.' });
      return;
    }
    store.deleteDocument(req.params.id);
    res.json({ success: true });
  });

  app.get('/api/designs/:id', (req, res) => {
    const scene = store.getDesign(req.params.id);
    if (!scene) {
      return res.status(404).json({ error: 'Design not found' });
    }
    res.json({ success: true, scene });
  });

  app.post('/api/render/svg', (req, res) => {
    const validation = SceneGraphSchema.safeParse(req.body?.scene);
    if (!validation.success) {
      res.status(400).json({ error: 'Invalid scene graph.', details: validation.error.flatten() });
      return;
    }
    const multiplier = req.body?.multiplier ?? 1;
    if (typeof multiplier !== 'number' || !Number.isFinite(multiplier) || multiplier < 0.01 || multiplier > 10) {
      res.status(400).json({ error: 'Render scale must be between 0.01 and 10.' });
      return;
    }
    try {
      const svg = renderSceneToSvgString(validation.data, multiplier);
      res.setHeader('Content-Type', 'image/svg+xml');
      res.send(svg);
    } catch (error) {
      res.status(400).json({ error: error instanceof Error ? error.message : 'Could not render this scene.' });
    }
  });

  // Mount Vite or static server
  if (process.env.NODE_ENV === 'production') {
    app.use(express.static(path.join(__dirname, 'dist')));
    app.get('*', (req, res) => {
      res.sendFile(path.join(__dirname, 'dist', 'index.html'));
    });
  } else {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  }

  app.listen(PORT, HOST, () => {
    console.log(`DeconstructAI Server running on http://${HOST}:${PORT}`);
  });
}

startServer().catch((err) => {
  console.error('Failed to start server:', err);
  process.exit(1);
});
