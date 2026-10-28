import { createHash, randomUUID } from 'node:crypto';
import { Router, type Request, type Response } from 'express';
import { clearAnalysisCache, createAnalysisImage, runModularAnalysis } from './pipeline.js';
import type { AnalysisProgress } from './types.js';
import type { ModularAnalysisResult } from './pipeline.js';

const MAX_ANALYSIS_IMAGE_BYTES = 12 * 1024 * 1024;
const JOB_TTL_MS = 30 * 60 * 1000;
const MAX_RETAINED_JOBS = 100;

interface AnalysisJob {
  id: string;
  createdAt: number;
  controller: AbortController;
  progress: AnalysisProgress;
  imageHash: string;
  result?: ModularAnalysisResult;
}

const jobs = new Map<string, AnalysisJob>();

export function parseImagePayload(payload: unknown): { bytes: Buffer; mimeType: string } {
  if (typeof payload !== 'string') throw new Error('Missing imagePayload.');
  const match = payload.match(/^data:(image\/(?:jpeg|png|webp));base64,([A-Za-z0-9+/]+={0,2})$/);
  if (!match) throw new Error('Upload a valid JPEG, PNG, or WebP analysis image.');
  const bytes = Buffer.from(match[2], 'base64');
  if (!bytes.length || bytes.length > MAX_ANALYSIS_IMAGE_BYTES || bytes.toString('base64') !== match[2]) {
    throw new Error('The analysis image must be between 1 byte and 12 MB.');
  }
  const mimeType = match[1];
  const actualMimeType = bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff
    ? 'image/jpeg'
    : bytes.length >= 8 && bytes.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))
      ? 'image/png'
      : bytes.length >= 12 && bytes.toString('ascii', 0, 4) === 'RIFF' && bytes.toString('ascii', 8, 12) === 'WEBP'
        ? 'image/webp'
        : null;
  if (actualMimeType !== mimeType) throw new Error('The image contents do not match the declared image type.');
  return { bytes, mimeType };
}

export function validateAnalysisDimensions(width: unknown, height: unknown): asserts width is number {
  if (
    typeof width !== 'number' || typeof height !== 'number' ||
    !Number.isSafeInteger(width) || !Number.isSafeInteger(height) ||
    width <= 0 || height <= 0 || width > 30_000 || height > 30_000 ||
    width * height > 100_000_000
  ) {
    throw new Error('Image dimensions must be whole pixels, no more than 30,000 per side, and no more than 100 million pixels total.');
  }
}

export function deleteAnalysisJob(jobId: string): void {
  const job = jobs.get(jobId);
  if (!job) return;
  job.controller.abort();
  clearAnalysisCache(job.imageHash);
  jobs.delete(jobId);
}

function pruneJobs(): void {
  const now = Date.now();
  for (const [id, job] of jobs) {
    if (now - job.createdAt > JOB_TTL_MS) {
      job.controller.abort();
      jobs.delete(id);
    }
  }
  while (jobs.size > MAX_RETAINED_JOBS) {
    const oldestFinished = [...jobs.values()].find((job) =>
      job.progress.status !== 'queued' && job.progress.status !== 'running'
    );
    if (!oldestFinished) break;
    jobs.delete(oldestFinished.id);
  }
}

function jobView(job: AnalysisJob) {
  return {
    jobId: job.id,
    progress: job.progress,
    ...(job.result ? {
      document: job.result.document,
      stageReport: job.result.stageReport,
      imageHash: job.result.imageHash
    } : {})
  };
}

export function createAnalysisRouter(): Router {
  const router = Router();

  router.post('/jobs', (req: Request, res: Response) => {
    let parsed: ReturnType<typeof parseImagePayload>;
    try {
      parsed = parseImagePayload(req.body?.imagePayload);
    } catch (error) {
      res.status(400).json({ error: error instanceof Error ? error.message : String(error) });
      return;
    }
    const { width, height, designName, originalAssetId } = req.body ?? {};
    try {
      validateAnalysisDimensions(width, height);
    } catch (error) {
      res.status(400).json({ error: error instanceof Error ? error.message : 'Image dimensions are invalid.' });
      return;
    }
    if (originalAssetId !== undefined && (typeof originalAssetId !== 'string' || originalAssetId.length > 120)) {
      res.status(400).json({ error: 'Original asset reference is invalid.' });
      return;
    }

    pruneJobs();
    if (jobs.size >= MAX_RETAINED_JOBS) {
      res.status(503).json({ error: 'The analysis queue is full. Please try again shortly.' });
      return;
    }
    const id = randomUUID();
    const controller = new AbortController();
    const job: AnalysisJob = {
      id,
      createdAt: Date.now(),
      controller,
      imageHash: createHash('sha256').update(parsed.bytes).digest('hex'),
      progress: { currentStage: null, stages: [], status: 'queued', message: 'Analysis queued.' }
    };
    jobs.set(id, job);

    void runModularAnalysis({
      image: createAnalysisImage(parsed.bytes, parsed.mimeType, width, height),
      designId: id,
      designName: typeof designName === 'string' ? designName : 'Uploaded Poster',
      originalAssetId,
      signal: controller.signal,
      onProgress: (progress) => { job.progress = progress; }
    }).then((result) => {
      job.result = result;
      job.progress = {
        ...job.progress,
        status: result.status,
        currentStage: null,
        message: result.status === 'completed' ? 'Analysis completed.' : `Analysis ${result.status}.`
      };
    }).catch((error: unknown) => {
      job.progress = {
        ...job.progress,
        currentStage: null,
        status: controller.signal.aborted ? 'cancelled' : 'failed',
        message: error instanceof Error ? error.message : 'Analysis failed.'
      };
    });

    res.status(202).json({ success: true, ...jobView(job) });
  });

  router.get('/jobs/:id', (req: Request, res: Response) => {
    const job = jobs.get(req.params.id);
    if (!job) {
      res.status(404).json({ error: 'Analysis job not found or expired.' });
      return;
    }
    res.json({ success: true, ...jobView(job) });
  });

  router.delete('/jobs/:id', (req: Request, res: Response) => {
    deleteAnalysisJob(req.params.id);
    res.json({ success: true });
  });

  return router;
}
