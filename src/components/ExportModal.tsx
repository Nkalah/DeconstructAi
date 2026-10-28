import React, { useMemo, useState } from 'react';
import { Check, Download, FileImage, FileText, Loader2, RotateCcw, Sparkles, X } from 'lucide-react';
import type { SceneGraph } from '../types/sceneGraph';
import { useDialogAccessibility } from '../hooks/useDialogAccessibility';
import {
  createExportBlob,
  EXPORT_PRESETS,
  getExportDimensions,
  getSvgLimitations,
  renderExportPreview,
  type ExportFormat,
  type ExportPresetId,
  type ExportResolution
} from '../lib/designExport';

interface ExportModalProps {
  isOpen: boolean;
  onClose: () => void;
  scene: SceneGraph;
}

const FORMATS: ExportFormat[] = ['png', 'jpg', 'pdf', 'svg'];
const SOCIAL_RESOLUTIONS: ExportResolution[] = ['1x', '2x', '3x'];
const PRINT_RESOLUTIONS: ExportResolution[] = ['150dpi', '300dpi'];

function isPrintPreset(preset: ExportPresetId): boolean {
  return preset === 'a4' || preset === 'a5';
}

function slugify(text: string): string {
  return text.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'design';
}

export const ExportModal: React.FC<ExportModalProps> = ({ isOpen, onClose, scene }) => {
  const [format, setFormat] = useState<ExportFormat>('png');
  const [preset, setPreset] = useState<ExportPresetId>('original');
  const [resolution, setResolution] = useState<ExportResolution>('2x');
  const [transparent, setTransparent] = useState(false);
  const [isExporting, setIsExporting] = useState(false);
  const [exportComplete, setExportComplete] = useState(false);
  const [exportError, setExportError] = useState<string | null>(null);
  const dialogRef = useDialogAccessibility<HTMLElement>(isOpen, onClose);

  const printSize = isPrintPreset(preset);
  const activeResolution = printSize
    ? (resolution === '150dpi' || resolution === '300dpi' ? resolution : '300dpi')
    : (resolution === '1x' || resolution === '2x' || resolution === '3x' ? resolution : '1x');
  const options = { format, preset, resolution: activeResolution, transparent };
  const dimensions = useMemo(() => {
    try {
      return getExportDimensions(scene, preset, activeResolution);
    } catch {
      return null;
    }
  }, [scene, preset, activeResolution]);
  const preview = useMemo(() => {
    try {
      return renderExportPreview(scene, options);
    } catch {
      return null;
    }
  }, [scene, format, preset, activeResolution, transparent]);
  const svgLimitations = useMemo(() => getSvgLimitations(scene), [scene]);
  const canDownload = !(format === 'svg' && svgLimitations.length > 0);

  if (!isOpen) return null;

  const clearResult = () => {
    setExportComplete(false);
    setExportError(null);
  };

  const handleExport = async () => {
    setIsExporting(true);
    setExportComplete(false);
    setExportError(null);
    let objectUrl: string | null = null;
    try {
      const result = await createExportBlob(scene, options);
      const filename = `${slugify(scene.name || 'design')}-${result.filenameSuffix}`;
      objectUrl = URL.createObjectURL(result.blob);
      const link = document.createElement('a');
      link.href = objectUrl;
      link.download = filename;
      document.body.appendChild(link);
      link.click();
      link.remove();
      setExportComplete(true);
    } catch (error) {
      console.error('Design export failed:', error);
      setExportError(error instanceof Error
        ? error.message
        : 'The export failed unexpectedly. Your design is unchanged; retry the export.');
    } finally {
      if (objectUrl) window.setTimeout(() => URL.revokeObjectURL(objectUrl as string), 30_000);
      setIsExporting(false);
    }
  };

  const resolutionOptions = printSize ? PRINT_RESOLUTIONS : SOCIAL_RESOLUTIONS;
  const outputSize = dimensions
    ? `${dimensions.width.toLocaleString()} × ${dimensions.height.toLocaleString()} px`
    : 'Invalid size';

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-3 backdrop-blur-sm sm:p-5">
      <section
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="export-title"
        tabIndex={-1}
        className="flex max-h-[94vh] w-full max-w-4xl flex-col overflow-hidden rounded-xl border border-neutral-800 bg-neutral-900 shadow-2xl"
      >
        <header className="flex items-center justify-between border-b border-neutral-800 px-4 py-3">
          <div className="flex items-center gap-2">
            <Download className="h-5 w-5 text-sky-400" aria-hidden="true" />
            <div>
              <h2 id="export-title" className="text-sm font-semibold text-neutral-100">Export design</h2>
              <p className="text-[11px] text-neutral-400">Preview and download artwork only</p>
            </div>
          </div>
          <button type="button" onClick={onClose} aria-label="Close export" className="min-h-11 min-w-11 rounded text-neutral-400 hover:bg-neutral-800 hover:text-white">
            <X className="mx-auto h-4 w-4" />
          </button>
        </header>

        <div className="grid min-h-0 flex-1 overflow-y-auto md:grid-cols-[minmax(0,1fr)_minmax(280px,0.85fr)]">
          <div className="space-y-5 p-4 sm:p-5">
            <fieldset>
              <legend className="mb-2 text-[11px] font-semibold uppercase tracking-wider text-neutral-400">File format</legend>
              <div className="grid grid-cols-4 gap-2">
                {FORMATS.map((item) => (
                  <button
                    key={item}
                    type="button"
                    onClick={() => { setFormat(item); clearResult(); }}
                    aria-pressed={format === item}
                    className={`flex min-h-14 flex-col items-center justify-center rounded-lg border text-xs font-medium uppercase transition ${
                      format === item
                        ? 'border-sky-500/60 bg-sky-500/15 text-sky-200'
                        : 'border-neutral-800 bg-neutral-950 text-neutral-400 hover:border-neutral-700 hover:text-neutral-200'
                    }`}
                  >
                    {item === 'pdf' ? <FileText className="mb-1 h-4 w-4" aria-hidden="true" /> : <FileImage className="mb-1 h-4 w-4" aria-hidden="true" />}
                    {item}
                  </button>
                ))}
              </div>
            </fieldset>

            <div>
              <label htmlFor="export-preset" className="mb-2 block text-[11px] font-semibold uppercase tracking-wider text-neutral-400">Output size</label>
              <select
                id="export-preset"
                value={preset}
                onChange={(event) => {
                  const nextPreset = event.target.value as ExportPresetId;
                  setPreset(nextPreset);
                  setResolution(nextPreset === 'a4' || nextPreset === 'a5' ? '300dpi' : '2x');
                  clearResult();
                }}
                className="min-h-11 w-full rounded-lg border border-neutral-700 bg-neutral-950 px-3 text-xs text-neutral-100 focus:border-sky-500 focus:outline-none"
              >
                {EXPORT_PRESETS.map((item) => (
                  <option key={item.id} value={item.id}>{item.label}</option>
                ))}
              </select>
            </div>

            <fieldset>
              <legend className="mb-2 text-[11px] font-semibold uppercase tracking-wider text-neutral-400">
                {printSize ? 'Print resolution' : 'Resolution scale'}
              </legend>
              <div className={`grid gap-2 ${printSize ? 'grid-cols-2' : 'grid-cols-3'}`}>
                {resolutionOptions.map((item) => (
                  <button
                    key={item}
                    type="button"
                    onClick={() => { setResolution(item); clearResult(); }}
                    aria-pressed={activeResolution === item}
                    className={`min-h-11 rounded-lg border px-2 text-xs font-medium transition ${
                      activeResolution === item
                        ? 'border-sky-500/60 bg-sky-500/15 text-sky-200'
                        : 'border-neutral-800 bg-neutral-950 text-neutral-400 hover:text-neutral-200'
                    }`}
                  >
                    {printSize ? item.toUpperCase() : `${item} ${item === '1x' ? 'standard' : item === '2x' ? 'high resolution' : 'maximum'}`}
                  </button>
                ))}
              </div>
            </fieldset>

            {format === 'png' && (
              <label className="flex min-h-11 items-center gap-2 text-xs text-neutral-200">
                <input
                  type="checkbox"
                  checked={transparent}
                  onChange={(event) => { setTransparent(event.target.checked); clearResult(); }}
                  className="accent-sky-400"
                />
                Transparent background (PNG)
              </label>
            )}

            {format === 'svg' && (
              <div className={`rounded-lg border p-3 text-[11px] leading-relaxed ${
                svgLimitations.length ? 'border-amber-500/40 bg-amber-500/10 text-amber-200' : 'border-sky-500/30 bg-sky-500/10 text-sky-100'
              }`} role="status">
                {svgLimitations.length ? (
                  <>
                    <strong>SVG is limited for this design.</strong>
                    <ul className="mt-1 list-inside list-disc">
                      {svgLimitations.map((reason) => <li key={reason}>{reason}</li>)}
                    </ul>
                  </>
                ) : (
                  <>This design can be represented with vector shapes and text. Text uses installed fonts; another device may substitute missing fonts.</>
                )}
              </div>
            )}

            {format !== 'svg' && (
              <div className="flex items-start gap-2 rounded-lg border border-neutral-800 bg-neutral-950 p-3 text-[11px] leading-relaxed text-neutral-400">
                <Sparkles className="mt-0.5 h-4 w-4 shrink-0 text-sky-400" aria-hidden="true" />
                <span>Text and image layers are rendered from the design document. Fonts available to this browser are loaded before export; unavailable fonts may use a system fallback.</span>
              </div>
            )}
          </div>

          <div className="flex min-h-[280px] flex-col border-t border-neutral-800 bg-neutral-950/60 p-4 md:border-l md:border-t-0">
            <div className="flex items-center justify-between">
              <h3 className="text-xs font-semibold text-neutral-200">Export preview</h3>
              <span className="text-right font-mono text-[10px] text-neutral-500">{outputSize}</span>
            </div>
            <div className={`mt-3 flex min-h-[220px] flex-1 items-center justify-center overflow-hidden rounded-lg border border-neutral-800 p-3 ${
              format === 'png' && transparent
                ? 'bg-[conic-gradient(#252a33_25%,#15181e_0_50%,#252a33_0_75%,#15181e_0)] bg-[length:20px_20px]'
                : 'bg-neutral-900'
            }`}>
              {preview ? (
                <img
                  src={preview}
                  alt="Preview of the design artwork that will be exported"
                  className="max-h-[42vh] max-w-full object-contain shadow-xl"
                  onError={() => setExportError('The preview could not render one or more design resources. Check image availability and retry.')}
                />
              ) : (
                <p className="text-xs text-neutral-500">Preview unavailable for this size.</p>
              )}
            </div>
            <p className="mt-2 text-[10px] text-neutral-500">
              Only the design artwork is included; editor controls, rulers, guides, and selection handles are excluded.
            </p>
          </div>
        </div>

        <footer className="border-t border-neutral-800 bg-neutral-950/70 p-4">
          {exportError && (
            <div role="alert" className="mb-3 flex items-start justify-between gap-3 rounded-lg border border-red-500/40 bg-red-500/10 p-3 text-xs text-red-200">
              <span>{exportError}</span>
              <button type="button" onClick={() => void handleExport()} disabled={isExporting || !canDownload} className="inline-flex min-h-8 shrink-0 items-center gap-1 rounded border border-red-400/40 px-2 hover:bg-red-500/20 disabled:opacity-50">
                <RotateCcw className="h-3 w-3" aria-hidden="true" /> Retry
              </button>
            </div>
          )}
          <div className="flex items-center justify-between gap-3">
            <span className="text-[11px] text-neutral-400">
              {dimensions?.dpi ? `${dimensions.dpi} DPI · ` : ''}{outputSize}
            </span>
            <div className="flex items-center gap-2">
              <button type="button" onClick={onClose} className="min-h-11 rounded-lg border border-neutral-700 px-4 text-xs text-neutral-300 hover:bg-neutral-800">
                Close
              </button>
              <button
                type="button"
                onClick={() => void handleExport()}
                disabled={isExporting || !canDownload || !dimensions}
                className="inline-flex min-h-11 items-center gap-2 rounded-lg bg-sky-500 px-4 text-xs font-semibold text-neutral-950 hover:bg-sky-400 disabled:cursor-not-allowed disabled:opacity-40"
              >
                {isExporting ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" /> : exportComplete ? <Check className="h-4 w-4" aria-hidden="true" /> : <Download className="h-4 w-4" aria-hidden="true" />}
                {isExporting ? 'Rendering…' : exportComplete ? 'Downloaded' : 'Download'}
              </button>
            </div>
          </div>
        </footer>
      </section>
    </div>
  );
};
