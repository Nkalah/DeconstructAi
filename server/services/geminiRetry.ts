import type { GoogleGenAI } from '@google/genai';

/**
 * Gemini call wrapper: rate limiting + retries + model fallback.
 *
 * Why this exists: the free tier only allows ~5 requests/minute per model, and Google
 * often returns 503 "high demand". Naive retries make the quota problem WORSE, so this
 * helper (1) never sends more than GEMINI_RPM calls per minute per model, (2) waits the
 * exact delay Google asks for after a 429, and (3) backs off on 503s.
 *
 * .env options (all optional):
 *   GEMINI_MODEL  first model to try (falls back to the defaults below)
 *   GEMINI_RPM    max calls per minute per model. Default 4 (free tier is 5). Raise it if
 *                 you enable billing on your Google project.
 */

const DEFAULT_MODELS = ['gemini-3.8-flash', 'gemini-flash-latest'];
const RETRYABLE = new Set([429, 500, 502, 503, 504]);
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

// ---- shared state (module-level, so concurrent requests cooperate) ----
const callLog: Record<string, number[]> = {};
const blockedUntil: Record<string, number> = {};

const windowMs = () => parseInt(process.env.GEMINI_WINDOW_MS || '60000', 10); // override only for tests
const maxPerWindow = () => Math.max(1, parseInt(process.env.GEMINI_RPM || '4', 10));

async function waitForSlot(model: string) {
  // Loop because several requests may be waiting at once. No `await` sits between the
  // capacity check and the push, so two callers can never grab the same slot.
  for (;;) {
    const now = Date.now();
    const win = windowMs();
    const log = (callLog[model] = (callLog[model] ?? []).filter((t) => now - t < win));
    const blockedWait = (blockedUntil[model] ?? 0) - now;
    const rateWait = log.length >= maxPerWindow() ? win - (now - log[0]) + 50 : 0;
    const wait = Math.max(blockedWait, rateWait);
    if (wait <= 0) {
      log.push(now);
      return;
    }
    console.log(`[gemini] rate-limit guard: waiting ${Math.ceil(wait / 1000)}s before calling ${model}...`);
    await sleep(Math.min(wait, 65_000));
  }
}

export function getErrorStatus(err: any): number | undefined {
  if (typeof err?.status === 'number') return err.status;
  if (typeof err?.code === 'number') return err.code;
  const m = String(err?.message || '').match(/"code"\s*:\s*(\d{3})/);
  return m ? parseInt(m[1], 10) : undefined;
}

/** Google tells us how long to wait after a 429, e.g. "Please retry in 17.19s" / "retryDelay":"17s". */
export function parseRetryDelayMs(err: any): number | undefined {
  const msg = String(err?.message || '');
  const a = msg.match(/"retryDelay"\s*:\s*"(\d+(?:\.\d+)?)s"/);
  const b = msg.match(/retry in (\d+(?:\.\d+)?)s/i);
  const secs = a ? parseFloat(a[1]) : b ? parseFloat(b[1]) : undefined;
  return secs === undefined ? undefined : Math.ceil(secs * 1000);
}

export function friendlyGeminiError(err: any): string {
  const status = getErrorStatus(err);
  const msg = String(err?.message || '');
  if (status === 429) {
    if (/PerDay/i.test(msg)) {
      return 'Your daily Gemini free quota is used up. It resets daily, or you can enable billing on your Google project for higher limits.';
    }
    const d = parseRetryDelayMs(err);
    const wait = d ? ` Wait about ${Math.ceil(d / 1000)} seconds and try again.` : ' Wait a minute and try again.';
    return `Gemini free-tier rate limit reached (about 5 requests per minute).${wait} Enabling billing on your Google project raises this limit.`;
  }
  if (status === 503) {
    return 'Google\'s Gemini model is overloaded right now (503). This is temporary on Google\'s side. Please wait a minute and try again.';
  }
  if (status === 401 || status === 403) {
    return 'Gemini rejected the API key or its permissions (check GEMINI_API_KEY in .env, then restart the server).';
  }
  if (status === 404) {
    return 'The configured Gemini model was not found for this key.';
  }
  return `Gemini analysis failed: ${msg.slice(0, 300)}`;
}

export async function generateWithRetry(
  ai: GoogleGenAI,
  params: { contents: any; config?: any },
  opts: { models?: string[]; attemptsPerModel?: number; baseDelayMs?: number } = {}
) {
  const envModel = process.env.GEMINI_MODEL;
  const models = opts.models ?? (envModel ? [envModel, ...DEFAULT_MODELS.filter((m) => m !== envModel)] : DEFAULT_MODELS);
  const attemptsPerModel = opts.attemptsPerModel ?? 3;
  const baseDelayMs = opts.baseDelayMs ?? 1500;

  // Keep the MOST INFORMATIVE error: quota (429) > overload/server (5xx) > everything else.
  const rank = (e: any) => {
    const st = getErrorStatus(e);
    if (st === 429) return 3;
    return st !== undefined && RETRYABLE.has(st) ? 2 : 1;
  };
  let bestErr: any;

  for (const model of models) {
    let quotaRetries = 0;
    for (let attempt = 1; attempt <= attemptsPerModel; attempt++) {
      await waitForSlot(model);
      try {
        const res = await ai.models.generateContent({ ...params, model });
        if (model !== models[0] || attempt > 1) {
          console.log(`[gemini] succeeded with ${model} on attempt ${attempt}`);
        }
        return res;
      } catch (err: any) {
        if (!bestErr || rank(err) > rank(bestErr)) bestErr = err;
        const status = getErrorStatus(err);
        console.warn(
          `[gemini] ${model} attempt ${attempt}/${attemptsPerModel} failed (status ${status ?? 'unknown'}): ${String(err?.message || err).slice(0, 160)}`
        );
        // Not temporary on this model (400/403/404...) -> move on to next model
        if (status === undefined || !RETRYABLE.has(status)) break;

        if (status === 429) {
          const d = parseRetryDelayMs(err) ?? 20_000;
          blockedUntil[model] = Date.now() + d + 1000; // everyone waits out Google's requested delay
          // Wait-and-retry once per model; a long delay (e.g. daily quota) means don't bother.
          if (d > 45_000 || quotaRetries++ >= 1) break;
        } else if (attempt < attemptsPerModel) {
          await sleep(baseDelayMs * 2 ** (attempt - 1)); // 503 etc: exponential backoff
        }
      }
    }
  }
  throw bestErr;
}
