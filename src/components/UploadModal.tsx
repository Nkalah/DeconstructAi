import React, { useEffect, useRef, useState } from 'react';
import type { DesignDocument } from '../core/schema/designDocument';
import { hydrateDesignDocumentFromOriginal } from '../lib/hydrateDesignDocument';
import {
  MAX_ANALYSIS_PAYLOAD_SIZE,
  MAX_HARD_FILE_SIZE,
  MAX_ORIGINAL_FILE_SIZE,
  blobToDataUrl,
  createAnalysisCopy,
  inspectImageFile,
  sanitizeFileName,
  deleteStoredOriginalPoster,
  storeOriginalPoster
} from '../lib/posterUpload';
import { AlertCircle, ArrowRight, Image, Loader2, ShieldCheck, Upload, X } from 'lucide-react';
import { useDialogAccessibility } from '../hooks/useDialogAccessibility';

type UploadMode = 'recreate' | 'extract-text' | 'redesign' | 'quick-edit';

const MODES: { id: UploadMode; title: string; description: string }[] = [
  { id: 'recreate', title: 'Recreate & Edit', description: 'Turn the poster into editable layers.' },
  { id: 'extract-text', title: 'Extract Text', description: 'Focus on editable copy and typography.' },
  { id: 'redesign', title: 'Redesign', description: 'Use the poster as a starting point.' },
  { id: 'quick-edit', title: 'Quick Edit', description: 'Make a focused, lightweight edit.' }
];

interface UploadModalProps {
  isOpen: boolean;
  onClose: () => void;
  onDeconstructionComplete: (document: DesignDocument) => void;
}

function formatBytes(bytes: number): string {
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
}

function friendlyUploadError(error: unknown): string {
  if (error instanceof Error) {
    if (error.name === 'QuotaExceededError') {
      return 'Your browser is out of storage space. Free up local storage and try again.';
    }
    if (error.message === 'wrong-type') return 'That file type is not supported. Choose a JPG, JPEG, PNG, or WebP image.';
    if (error.message === 'too-large') return 'This image is too large to prepare. Try optimizing it or choosing a smaller image.';
    if (error.message === 'corrupt') return 'We couldn’t open this image. It may be damaged or incomplete.';
    if (error instanceof TypeError) return 'We couldn’t reach the server. Check your connection and try again.';
    return error.message;
  }
  return 'Something went wrong while preparing your poster. Please try again.';
}

export const UploadModal: React.FC<UploadModalProps> = ({
  isOpen,
  onClose,
  onDeconstructionComplete
}) => {
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [dimensions, setDimensions] = useState<{ width: number; height: number } | null>(null);
  const [mode, setMode] = useState<UploadMode>('recreate');
  const [analysisCopy, setAnalysisCopy] = useState<Blob | null>(null);
  const [isOptimized, setIsOptimized] = useState(false);
  const [isOptimizing, setIsOptimizing] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);
  const [progressStages, setProgressStages] = useState<{ name: string; status: string; message?: string }[]>([]);
  const [currentStage, setCurrentStage] = useState<string | null>(null);
  const activeJobId = useRef<string | null>(null);
  const pendingOriginalId = useRef<string | null>(null);
  const cancelRequested = useRef(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const dialogRef = useDialogAccessibility<HTMLDivElement>(isOpen, () => {
    if (!isProcessing) onClose();
  });

  interface AnalysisJobResponse {
    success?: boolean;
    jobId?: string;
    error?: string;
    document?: DesignDocument;
    progress?: {
      status: string;
      currentStage: string | null;
      message?: string;
      stages: { name: string; status: string; message?: string }[];
    };
  }

  useEffect(() => {
    if (!selectedFile) {
      setPreviewUrl(null);
      return;
    }
    const url = URL.createObjectURL(selectedFile);
    setPreviewUrl(url);
    return () => URL.revokeObjectURL(url);
  }, [selectedFile]);

  if (!isOpen) return null;

  const handleFileChange = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file) return;

    setSelectedFile(file);
    setAnalysisCopy(null);
    setIsOptimized(false);
    setDimensions(null);
    setErrorMsg(null);
    try {
      const imageDimensions = await inspectImageFile(file);
      setDimensions(imageDimensions);
      if (file.size > MAX_ORIGINAL_FILE_SIZE) {
        setErrorMsg(`This image is ${formatBytes(file.size)}. Optimize it for analysis to continue; your full-resolution original will stay untouched.`);
      }
    } catch (error) {
      setErrorMsg(friendlyUploadError(error));
    }
  };

  const handleOptimize = async () => {
    if (!selectedFile) return;
    setIsProcessing(true);
    setIsOptimizing(true);
    setErrorMsg(null);
    try {
      const copy = await createAnalysisCopy(selectedFile);
      setAnalysisCopy(copy);
      setIsOptimized(true);
      setErrorMsg(null);
    } catch (error) {
      setErrorMsg(friendlyUploadError(error));
    } finally {
      setIsOptimizing(false);
      setIsProcessing(false);
    }
  };

  const handleStartModularUpload = async () => {
    if (!selectedFile || !dimensions || !mode) return;
    cancelRequested.current = false;
    setIsProcessing(true);
    setProgressStages([]);
    setCurrentStage(null);
    setErrorMsg(null);
    try {
      if (selectedFile.size > MAX_HARD_FILE_SIZE) throw new Error('too-large');
      if (selectedFile.size > MAX_ORIGINAL_FILE_SIZE && !isOptimized) {
        throw new Error(`This image is larger than ${formatBytes(MAX_ORIGINAL_FILE_SIZE)}. Optimize it for analysis to continue.`);
      }
      const copy = analysisCopy || await createAnalysisCopy(selectedFile);
      if (copy.size > MAX_ANALYSIS_PAYLOAD_SIZE) throw new Error('too-large');
      const id = crypto.randomUUID();
      pendingOriginalId.current = id;
      await storeOriginalPoster({
        id,
        blob: selectedFile,
        fileName: `${sanitizeFileName(selectedFile.name)}.${selectedFile.name.split('.').pop()?.toLowerCase() || 'jpg'}`,
        mimeType: selectedFile.type,
        size: selectedFile.size,
        width: dimensions.width,
        height: dimensions.height,
        createdAt: new Date().toISOString()
      });
      if (cancelRequested.current) {
        await deleteStoredOriginalPoster(id);
        pendingOriginalId.current = null;
        return;
      }

      const imagePayload = await blobToDataUrl(copy);
      if (cancelRequested.current) {
        await deleteStoredOriginalPoster(id);
        pendingOriginalId.current = null;
        return;
      }
      const response = await fetch('/api/analysis/jobs', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          imagePayload,
          designName: sanitizeFileName(selectedFile.name),
          canvasWidth: dimensions.width,
          canvasHeight: dimensions.height,
          width: dimensions.width,
          height: dimensions.height,
          originalAssetId: id,
          mode
        })
      });

      let data: AnalysisJobResponse;
      try {
        data = await response.json();
      } catch {
        throw new Error('The server returned an unreadable response. Please try again.');
      }
      if (!response.ok || !data.success || !data.jobId) {
        throw new Error(data.error || 'We couldn’t process this poster. Please try again.');
      }

      activeJobId.current = data.jobId;
      if (cancelRequested.current) {
        await fetch(`/api/analysis/jobs/${encodeURIComponent(data.jobId)}`, { method: 'DELETE' });
        activeJobId.current = null;
        return;
      }
      let jobState: AnalysisJobResponse = data;
      while (!cancelRequested.current && (jobState.progress?.status === 'queued' || jobState.progress?.status === 'running')) {
        setProgressStages(jobState.progress.stages);
        setCurrentStage(jobState.progress.currentStage);
        await new Promise((resolve) => setTimeout(resolve, 700));
        if (cancelRequested.current) break;
        const pollResponse = await fetch(`/api/analysis/jobs/${encodeURIComponent(data.jobId)}`);
        if (!pollResponse.ok) throw new Error('Could not retrieve analysis progress. Please try again.');
        jobState = await pollResponse.json();
      }

      if (cancelRequested.current) return;
      setProgressStages(jobState.progress?.stages ?? []);
      setCurrentStage(null);
      if (!jobState.document) throw new Error(jobState.progress?.message || 'Analysis did not produce a design document.');
      const hydratedDocument = await hydrateDesignDocumentFromOriginal(jobState.document, id);
      onDeconstructionComplete(hydratedDocument);
      pendingOriginalId.current = null;
      onClose();
    } catch (error) {
      if (pendingOriginalId.current) {
        try {
          await deleteStoredOriginalPoster(pendingOriginalId.current);
          pendingOriginalId.current = null;
        } catch (cleanupError) {
          console.error('Could not remove an unreferenced uploaded original:', cleanupError);
        }
      }
      setErrorMsg(friendlyUploadError(error));
    } finally {
      activeJobId.current = null;
      setIsProcessing(false);
    }
  };

  const handleCancel = async () => {
    cancelRequested.current = true;
    if (activeJobId.current) {
      await fetch(`/api/analysis/jobs/${encodeURIComponent(activeJobId.current)}`, { method: 'DELETE' }).catch(() => undefined);
      activeJobId.current = null;
    }
    if (pendingOriginalId.current) {
      try {
        await deleteStoredOriginalPoster(pendingOriginalId.current);
        pendingOriginalId.current = null;
      } catch (error) {
        console.error('Could not remove the cancelled uploaded original:', error);
        setErrorMsg('Analysis cancelled, but the original could not be removed from local storage.');
        setIsProcessing(false);
        setCurrentStage(null);
        return;
      }
    }
    setIsProcessing(false);
    setCurrentStage(null);
    setErrorMsg('Analysis cancelled.');
  };

  const canOptimize = Boolean(
    selectedFile &&
    dimensions &&
    selectedFile.size > MAX_ORIGINAL_FILE_SIZE &&
    selectedFile.size <= MAX_HARD_FILE_SIZE &&
    !analysisCopy
  );
  const canSubmit = Boolean(
    selectedFile &&
    dimensions &&
    (selectedFile.size <= MAX_ORIGINAL_FILE_SIZE || isOptimized)
  );

  return (
    <div ref={dialogRef} role="dialog" aria-modal="true" aria-labelledby="upload-title" tabIndex={-1} className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 p-4 backdrop-blur-md">
      <div className="flex max-h-[92vh] w-full max-w-3xl flex-col overflow-hidden rounded-2xl border border-neutral-800 bg-neutral-900 shadow-2xl">
        <div className="flex items-center justify-between border-b border-neutral-800 bg-neutral-950/80 p-5">
          <div>
            <h2 id="upload-title" className="text-lg font-semibold text-neutral-100">Upload a poster</h2>
            <p className="mt-1 text-sm text-neutral-400">Preview your image and choose how you want to work with it.</p>
          </div>
          <button
            type="button"
            onClick={onClose}
            disabled={isProcessing}
            aria-label="Close upload"
            className="rounded-lg p-2 text-neutral-400 transition hover:bg-neutral-800 hover:text-neutral-100 disabled:opacity-50"
            title="Close upload dialog"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="space-y-6 overflow-y-auto p-5 sm:p-6">
          <div>
            <label className="mb-2 block text-sm font-medium text-neutral-200">Poster file</label>
            <label className="flex cursor-pointer flex-col items-center justify-center rounded-xl border-2 border-dashed border-neutral-700 bg-neutral-950/60 px-5 py-6 text-center transition hover:border-sky-500/80">
              <Upload className="mb-2 h-7 w-7 text-sky-400" />
              <span className="text-sm font-medium text-neutral-100">
                {selectedFile ? selectedFile.name : 'Choose an image'}
              </span>
              <span className="mt-1 text-xs text-neutral-500">JPG, JPEG, PNG, or WebP · maximum 200 MB</span>
              <input
                type="file"
                accept=".jpg,.jpeg,.png,.webp,image/jpeg,image/png,image/webp"
                onChange={handleFileChange}
                className="sr-only"
                disabled={isProcessing}
              />
            </label>
          </div>

          {selectedFile && dimensions && previewUrl && (
            <div className="grid gap-4 rounded-xl border border-neutral-800 bg-neutral-950/70 p-4 sm:grid-cols-[minmax(0,1fr)_180px]">
              <div className="min-w-0">
                <div className="mb-3 flex items-center gap-2 text-sm font-medium text-neutral-100">
                  <Image className="h-4 w-4 text-sky-400" />
                  Original preview
                </div>
                <div className="flex h-52 items-center justify-center overflow-hidden rounded-lg border border-neutral-800 bg-neutral-900">
                  <img src={previewUrl} alt="Selected poster preview" className="max-h-full max-w-full object-contain" />
                </div>
              </div>
              <dl className="grid grid-cols-2 content-start gap-x-3 gap-y-4 text-sm sm:grid-cols-1">
                <div>
                  <dt className="text-xs text-neutral-500">Dimensions</dt>
                  <dd className="mt-1 font-medium text-neutral-200">{dimensions.width} × {dimensions.height} px</dd>
                </div>
                <div>
                  <dt className="text-xs text-neutral-500">File size</dt>
                  <dd className="mt-1 font-medium text-neutral-200">{formatBytes(selectedFile.size)}</dd>
                </div>
                <div className="col-span-2 flex items-start gap-2 text-xs leading-5 text-neutral-400 sm:col-span-1">
                  <ShieldCheck className="mt-0.5 h-4 w-4 shrink-0 text-emerald-400" />
                  Your full-resolution original is saved separately and never modified.
                </div>
              </dl>
            </div>
          )}

          <fieldset>
            <legend className="mb-2 text-sm font-medium text-neutral-200">Choose a mode</legend>
            <div className="grid gap-2 sm:grid-cols-2">
              {MODES.map((option) => (
                <button
                  key={option.id}
                  type="button"
                  aria-pressed={mode === option.id}
                  onClick={() => setMode(option.id)}
                  className={`rounded-xl border p-3 text-left transition ${
                    mode === option.id
                      ? 'border-sky-400 bg-sky-500/10'
                      : 'border-neutral-800 bg-neutral-950/50 hover:border-neutral-600'
                  }`}
                >
                  <span className="block text-sm font-semibold text-neutral-100">{option.title}</span>
                  <span className="mt-1 block text-xs text-neutral-400">{option.description}</span>
                </button>
              ))}
            </div>
          </fieldset>

          <p className="rounded-lg border border-neutral-800 bg-neutral-950/70 p-3 text-xs leading-5 text-neutral-300">
            For analysis, a smaller, metadata-stripped copy is sent to this app’s server and may be processed by its configured AI provider (Google Gemini). Your full-resolution original stays in local browser storage. Do not upload an image you do not want processed by an external provider.
          </p>

          {errorMsg && (
            <div role="alert" className="flex items-start gap-2 rounded-lg border border-rose-500/30 bg-rose-500/10 p-3 text-sm text-rose-200">
              <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
              <span className="flex-1">{errorMsg}</span>
              {canOptimize && (
                <button
                  type="button"
                  onClick={handleOptimize}
                  disabled={isProcessing}
                  className="shrink-0 font-semibold text-rose-100 underline underline-offset-2 hover:text-white"
                >
                  Optimize for analysis
                </button>
              )}
            </div>
          )}

          {isProcessing && (
            <div role="status" className="flex items-center gap-2 text-sm text-sky-300">
              <Loader2 className="h-4 w-4 animate-spin" />
              {isOptimizing
                ? 'Optimizing the analysis copy…'
                : currentStage
                  ? `${currentStage} in progress…`
                  : 'Preparing the analysis copy and saving your original…'}
            </div>
          )}
          {isProcessing && progressStages.length > 0 && (
            <ol aria-label="Analysis progress" className="space-y-1.5 rounded-xl border border-neutral-800 bg-neutral-950/70 p-3">
              {progressStages.map((stage) => (
                <li key={stage.name} className="flex items-start justify-between gap-3 text-xs">
                  <span className={stage.status === 'failed' ? 'text-rose-300' : stage.status === 'completed' ? 'text-emerald-300' : 'text-neutral-300'}>
                    {stage.name}
                  </span>
                  <span className="text-right text-neutral-500">{stage.message || stage.status}</span>
                </li>
              ))}
            </ol>
          )}
        </div>

        <div className="flex items-center justify-between gap-4 border-t border-neutral-800 bg-neutral-950 px-5 py-4">
          <p className="hidden text-xs text-neutral-500 sm:block">Analysis uses a metadata-stripped copy capped at 1600 px.</p>
          <button
            type="button"
            onClick={isProcessing ? handleCancel : handleStartModularUpload}
            disabled={!isProcessing && !canSubmit}
            className="ml-auto inline-flex items-center gap-2 rounded-lg bg-sky-500 px-4 py-2.5 text-sm font-semibold text-neutral-950 transition hover:bg-sky-400 disabled:cursor-not-allowed disabled:opacity-40"
          >
            {isProcessing ? 'Cancel analysis' : errorMsg ? 'Retry analysis' : 'Continue'}
            {!isProcessing && <ArrowRight className="h-4 w-4" />}
          </button>
        </div>
      </div>
    </div>
  );
};
