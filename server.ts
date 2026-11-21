import 'dotenv/config';
import express from 'express';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { activeAirQualityProvider, ProviderError } from './server/airQualityProvider.ts';
import {
  GeminiServiceError,
  generateChatResponse,
  generateStructuredRecommendation,
  VALID_RECOMMENDATION_TASKS,
  type RecommendationTaskType,
} from './server/geminiService.ts';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const PORT = Number(process.env.PORT) || 3000;

function stripControlChars(value: unknown, maxLen: number): string {
  if (typeof value !== 'string') return '';
  return value.replace(/[\u0000-\u001F\u007F]/g, '').trim().slice(0, maxLen);
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === 'object' && !Array.isArray(value));
}

function createRateLimiter(options: { windowMs: number; maxRequests: number }) {
  const hits = new Map<string, number[]>();
  return (req: express.Request, res: express.Response, next: express.NextFunction) => {
    const now = Date.now();
    const cutoff = now - options.windowMs;
    const clientIp = req.ip || req.socket.remoteAddress || 'unknown';
    const existing = (hits.get(clientIp) ?? []).filter((ts) => ts > cutoff);

    if (existing.length >= options.maxRequests) {
      const oldest = existing[0] ?? now;
      const retryAfterSec = Math.max(1, Math.ceil((oldest + options.windowMs - now) / 1000));
      res.setHeader('Retry-After', String(retryAfterSec));
      return res.status(429).json({
        error: 'RATE_LIMITED',
        message: `Too many requests. Please wait ${retryAfterSec} seconds and retry.`,
      });
    }

    existing.push(now);
    hits.set(clientIp, existing);
    if (hits.size > 500) {
      for (const [key, timestamps] of hits.entries()) {
        if (timestamps.every((ts) => ts <= cutoff)) {
          hits.delete(key);
        }
      }
    }
    return next();
  };
}

export function createApp() {
  const app = express();
  const dataRateLimiter = createRateLimiter({ windowMs: 60_000, maxRequests: 90 });
  const aiRateLimiter = createRateLimiter({ windowMs: 60_000, maxRequests: 30 });

  app.disable('x-powered-by');
  app.use(express.json({ limit: '100kb' }));

  app.use((_req, res, next) => {
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
    res.setHeader('Permissions-Policy', 'camera=(), microphone=(), geolocation=(self)');
    next();
  });

  app.get('/api/health', (_req, res) => {
    const key = process.env.GEMINI_API_KEY?.trim();
    const geminiConfigured = Boolean(key && key !== 'MY_GEMINI_API_KEY');
    res.json({
      ok: true,
      provider: activeAirQualityProvider.displayName,
      geminiConfigured,
      timestamp: new Date().toISOString(),
    });
  });

  app.get('/api/location/search', dataRateLimiter, async (req, res) => {
    const q = stripControlChars(req.query.q, 100);
    if (q.length < 2 || q.length > 100) {
      return res.status(400).json({
        error: 'INVALID_QUERY',
        message: 'Please enter at least 2 characters to search for a city or location.',
      });
    }
    try {
      const results = await activeAirQualityProvider.searchLocations(q);
      return res.json({ results });
    } catch (err) {
      if (err instanceof ProviderError) {
        return res.status(err.status).json({ error: err.code, message: err.message });
      }
      return res.status(502).json({
        error: 'LOCATION_SEARCH_FAILED',
        message: 'Could not complete location search right now.',
      });
    }
  });

  app.get('/api/air-quality', dataRateLimiter, async (req, res) => {
    const lat = Number(req.query.lat);
    const lon = Number(req.query.lon);
    const name = stripControlChars(req.query.name, 100) || 'Selected Location';
    const country = stripControlChars(req.query.country, 80);
    const admin1Raw = stripControlChars(req.query.admin1, 80);
    const admin1 = admin1Raw || undefined;

    if (
      !Number.isFinite(lat) ||
      !Number.isFinite(lon) ||
      lat < -90 ||
      lat > 90 ||
      lon < -180 ||
      lon > 180
    ) {
      return res.status(400).json({
        error: 'INVALID_COORDINATES',
        message: 'Valid latitude (-90 to 90) and longitude (-180 to 180) are required.',
      });
    }

    try {
      const snapshot = await activeAirQualityProvider.fetchAirQuality({
        id: `loc-${lat.toFixed(3)}-${lon.toFixed(3)}`,
        name,
        admin1,
        country,
        latitude: lat,
        longitude: lon,
      });
      return res.json({ snapshot });
    } catch (err) {
      if (err instanceof ProviderError) {
        return res.status(err.status).json({ error: err.code, message: err.message });
      }
      return res.status(502).json({
        error: 'AIR_QUALITY_UNAVAILABLE',
        message: 'Live air quality data could not be retrieved.',
      });
    }
  });

  app.get('/api/air-quality/grid', dataRateLimiter, async (req, res) => {
    const lat = Number(req.query.lat);
    const lon = Number(req.query.lon);
    const name = stripControlChars(req.query.name, 80) || 'Selected Area';

    if (
      !Number.isFinite(lat) ||
      !Number.isFinite(lon) ||
      lat < -90 ||
      lat > 90 ||
      lon < -180 ||
      lon > 180
    ) {
      return res.status(400).json({
        error: 'INVALID_COORDINATES',
        message: 'Valid coordinates are required for regional map data.',
      });
    }

    try {
      const stations = await activeAirQualityProvider.fetchRegionalGrid(lat, lon, name);
      return res.json({ stations });
    } catch (err) {
      if (err instanceof ProviderError) {
        return res.status(err.status).json({ error: err.code, message: err.message });
      }
      return res.status(502).json({
        error: 'GRID_UNAVAILABLE',
        message: 'Regional air quality grid is temporarily unavailable.',
      });
    }
  });

  app.post('/api/ai/chat', aiRateLimiter, async (req, res) => {
    try {
      const body = isPlainObject(req.body) ? req.body : {};
      const message = typeof body.message === 'string' ? body.message : '';
      const history = Array.isArray(body.history) ? body.history : [];
      const context = isPlainObject(body.context) ? body.context : {};
      const result = await generateChatResponse({
        message,
        history,
        context,
      });
      return res.json(result);
    } catch (err) {
      if (err instanceof GeminiServiceError) {
        return res.status(err.status).json({ error: err.code, message: err.message });
      }
      return res.status(500).json({
        error: 'AI_ERROR',
        message: 'Unexpected error while contacting AI assistant.',
      });
    }
  });

  app.post('/api/ai/recommend', aiRateLimiter, async (req, res) => {
    try {
      const body = isPlainObject(req.body) ? req.body : {};
      const { taskType, context, payload } = body;
      if (!VALID_RECOMMENDATION_TASKS.includes(taskType as RecommendationTaskType)) {
        return res.status(400).json({
          error: 'INVALID_TASK_TYPE',
          message: 'Unsupported AI recommendation task type.',
        });
      }
      const data = await generateStructuredRecommendation({
        taskType: taskType as RecommendationTaskType,
        context: isPlainObject(context) ? context : {},
        payload: isPlainObject(payload) ? payload : {},
      });
      return res.json({ data });
    } catch (err) {
      if (err instanceof GeminiServiceError) {
        return res.status(err.status).json({ error: err.code, message: err.message });
      }
      return res.status(500).json({
        error: 'AI_RECOMMEND_ERROR',
        message: 'Unexpected error while generating structured guidance.',
      });
    }
  });

  app.use((err: unknown, req: express.Request, res: express.Response, next: express.NextFunction) => {
    if (err && typeof err === 'object' && 'type' in err && (err as { type?: string }).type === 'entity.parse.failed') {
      return res.status(400).json({
        error: 'BAD_REQUEST',
        message: 'Invalid JSON request payload.',
      });
    }
    if (err && typeof err === 'object' && 'type' in err && (err as { type?: string }).type === 'entity.too.large') {
      return res.status(413).json({
        error: 'PAYLOAD_TOO_LARGE',
        message: 'Request payload exceeds maximum allowed size.',
      });
    }
    if (req.path.startsWith('/api/')) {
      return res.status(500).json({
        error: 'INTERNAL_ERROR',
        message: 'An unexpected server error occurred.',
      });
    }
    return next(err);
  });

  return app;
}

async function startServer() {
  const app = createApp();

  if (process.env.NODE_ENV !== 'production') {
    const { createServer: createViteServer } = await import('vite');
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distDir = path.resolve(__dirname, 'dist');
    if (fs.existsSync(distDir)) {
      app.use(express.static(distDir));
      app.get('*', (_req, res) => {
        res.sendFile(path.join(distDir, 'index.html'));
      });
    }
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`BreatheWise AI server listening on http://0.0.0.0:${PORT}`);
  });
}

const isDirectRun =
  process.argv[1] && path.resolve(process.argv[1]) === path.resolve(__filename);
if (isDirectRun) {
  startServer().catch((err) => {
    console.error('Failed to start server:', err);
    process.exit(1);
  });
}
