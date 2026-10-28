import { SceneGraph } from '../../src/types/sceneGraph';
import type { DesignDocument } from '../../src/core/schema/designDocument';

export interface StoredJob {
  jobId: string;
  designId: string;
  status: 'pending' | 'processing' | 'completed' | 'failed';
  currentStage: number;
  totalStages: number;
  logs: { stage: number; message: string; timestamp: string }[];
  result?: SceneGraph;
  error?: string;
}

class DesignStore {
  private designs: Map<string, SceneGraph> = new Map();
  private documents: Map<string, DesignDocument> = new Map();
  private jobs: Map<string, StoredJob> = new Map();
  private stageCache: Map<string, Record<number, any>> = new Map(); // For stage resumability

  saveDesign(design: SceneGraph): void {
    this.designs.set(design.design_id, JSON.parse(JSON.stringify(design)));
  }

  getDesign(designId: string): SceneGraph | undefined {
    const d = this.designs.get(designId);
    return d ? JSON.parse(JSON.stringify(d)) : undefined;
  }

  saveDocument(document: DesignDocument): void {
    this.documents.set(document.id, structuredClone(document));
  }

  getDocument(documentId: string): DesignDocument | undefined {
    const document = this.documents.get(documentId);
    return document ? structuredClone(document) : undefined;
  }

  deleteDocument(documentId: string): void {
    this.documents.delete(documentId);
    this.designs.delete(documentId);
  }

  createJob(jobId: string, designId: string): StoredJob {
    const job: StoredJob = {
      jobId,
      designId,
      status: 'pending',
      currentStage: 0,
      totalStages: 6,
      logs: [{ stage: 0, message: 'Job initialized', timestamp: new Date().toISOString() }]
    };
    this.jobs.set(jobId, job);
    return job;
  }

  getJob(jobId: string): StoredJob | undefined {
    return this.jobs.get(jobId);
  }

  updateJob(jobId: string, update: Partial<StoredJob>): void {
    const existing = this.jobs.get(jobId);
    if (existing) {
      Object.assign(existing, update);
    }
  }

  cacheStageOutput(designId: string, stage: number, data: any): void {
    if (!this.stageCache.has(designId)) {
      this.stageCache.set(designId, {});
    }
    this.stageCache.get(designId)![stage] = data;
  }

  getStageOutput(designId: string, stage: number): any | undefined {
    return this.stageCache.get(designId)?.[stage];
  }
}

export const store = new DesignStore();
