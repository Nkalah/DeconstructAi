import React, { useEffect, useMemo, useRef, useState } from 'react';
import { AlertTriangle, Check, Columns2, Eye, Layers3, SlidersHorizontal, X } from 'lucide-react';
import type { Layer, SceneGraph } from '../types/sceneGraph';
import { renderSceneToSvgString } from '../lib/sceneSvgRenderer';
import { useDialogAccessibility } from '../hooks/useDialogAccessibility';

type ComparisonMode = 'original' | 'recreated' | 'side-by-side' | 'overlay';

interface ComparisonViewProps {
  scene: SceneGraph;
  onClose: () => void;
}

interface ReviewLayer {
  layer: Layer;
  reason: string;
}

function overlayDefaultLayers(layers: Layer[]): Layer[] {
  return layers.filter((layer) =>
    layer.type !== 'background_fill'
    && layer.visible
    && !(layer.type === 'image' && layer.name === 'Original poster background')
  );
}

const MODES: Array<{ id: ComparisonMode; label: string; icon: React.ComponentType<{ className?: string }> }> = [
  { id: 'original', label: 'Original', icon: Eye },
  { id: 'recreated', label: 'Recreated', icon: Layers3 },
  { id: 'side-by-side', label: 'Side by side', icon: Columns2 },
  { id: 'overlay', label: 'Overlay', icon: SlidersHorizontal }
];

function svgDataUri(scene: SceneGraph): string {
  return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(renderSceneToSvgString(scene))}`;
}

function getReviewLayers(layers: Layer[]): ReviewLayer[] {
  return layers.flatMap((layer) => {
    if (layer.type === 'background_fill' || !layer.visible) return [];
    const reasons: string[] = [];
    const confidence = layer.source.detection_confidence;
    if (confidence === null || confidence < 0.75) reasons.push('Low detection confidence');
    if (layer.source.warning_flags?.length) reasons.push(...layer.source.warning_flags.map((flag) => flag.replaceAll('_', ' ')));
    if (layer.type === 'text') {
      if (layer.type_specific.uncertain) reasons.push('Text needs review');
      if (layer.type_specific.font_family_confidence < 0.75) reasons.push('Font match needs review');
    }
    return reasons.length ? [{ layer, reason: reasons.join(' · ') }] : [];
  });
}

interface ComparisonArtboardProps {
  scene: SceneGraph;
  imageUrl: string | null;
  label: string;
  imageOpacity?: number;
  overlayUrl?: string;
  overlayOpacity?: number;
  reviewLayers?: ReviewLayer[];
  showHighlights?: boolean;
  unavailableLabel?: string;
}

const ComparisonArtboard: React.FC<ComparisonArtboardProps> = ({
  scene,
  imageUrl,
  label,
  imageOpacity = 1,
  overlayUrl,
  overlayOpacity = 1,
  reviewLayers = [],
  showHighlights = false,
  unavailableLabel = 'No original poster image is available for this design.'
}) => {
  const frameRef = useRef<HTMLDivElement>(null);
  const [frameSize, setFrameSize] = useState({ width: 0, height: 0 });

  useEffect(() => {
    const frame = frameRef.current;
    if (!frame) return;
    const observer = new ResizeObserver(([entry]) => {
      setFrameSize({ width: entry.contentRect.width, height: entry.contentRect.height });
    });
    observer.observe(frame);
    return () => observer.disconnect();
  }, []);

  const scale = Math.min(
    frameSize.width / scene.canvas.width,
    frameSize.height / scene.canvas.height
  );
  const boardWidth = Number.isFinite(scale) && scale > 0 ? scene.canvas.width * scale : 0;
  const boardHeight = Number.isFinite(scale) && scale > 0 ? scene.canvas.height * scale : 0;

  return (
    <div ref={frameRef} className="flex min-h-0 min-w-0 flex-1 items-center justify-center overflow-hidden p-3">
      <div
        className="relative shrink-0 overflow-hidden bg-neutral-950 shadow-2xl"
        style={{
          width: boardWidth,
          height: boardHeight,
          backgroundColor: scene.canvas.background_color ?? '#ffffff'
        }}
        aria-label={`${label} comparison artwork`}
      >
        {imageUrl ? (
          <img
            src={imageUrl}
            alt={label}
            className="absolute inset-0 h-full w-full object-fill"
            style={{ opacity: imageOpacity }}
            draggable={false}
          />
        ) : (
          <div className="absolute inset-0 flex items-center justify-center bg-neutral-900 p-6 text-center text-sm text-neutral-400">
            {unavailableLabel}
          </div>
        )}
        {imageUrl && overlayUrl && (
          <img
            src={overlayUrl}
            alt="Editable recreated layers over the original poster"
            className="absolute inset-0 h-full w-full object-fill"
            style={{ opacity: overlayOpacity }}
            draggable={false}
          />
        )}
        {showHighlights && reviewLayers.map(({ layer, reason }) => (
          <div
            key={layer.id}
            className="pointer-events-none absolute border-2 border-amber-300/90"
            style={{
              left: `${layer.transform.x / scene.canvas.width * 100}%`,
              top: `${layer.transform.y / scene.canvas.height * 100}%`,
              width: `${layer.transform.width / scene.canvas.width * 100}%`,
              height: `${layer.transform.height / scene.canvas.height * 100}%`
            }}
            aria-label={`Needs review: ${layer.name}. ${reason}`}
            title={`${layer.name}: ${reason}`}
          >
            <span
              className={`absolute left-0 z-10 inline-flex max-w-[90vw] items-center gap-1.5 rounded bg-neutral-950/95 px-2 py-1 text-[10px] font-semibold leading-tight text-amber-100 shadow ${layer.transform.y < 36 ? 'top-0 translate-y-1' : 'bottom-full -translate-y-1'}`}
            >
              <AlertTriangle className="h-3 w-3 shrink-0 text-amber-300" aria-hidden="true" />
              <span className="max-w-48 truncate">{layer.name}</span>
              <span className="shrink-0 text-amber-200">Needs review</span>
            </span>
          </div>
        ))}
      </div>
    </div>
  );
};

export const ComparisonView: React.FC<ComparisonViewProps> = ({ scene, onClose }) => {
  const dialogRef = useDialogAccessibility<HTMLDivElement>(true, onClose);
  const [mode, setMode] = useState<ComparisonMode>('side-by-side');
  const [overlayOpacity, setOverlayOpacity] = useState(50);
  const [showHighlights, setShowHighlights] = useState(true);
  const [enabledLayerIds, setEnabledLayerIds] = useState<string[]>(() =>
    overlayDefaultLayers(scene.layers).map((layer) => layer.id)
  );
  const visibleLayers = useMemo(
    () => scene.layers.filter((layer) => layer.type !== 'background_fill' && layer.visible),
    [scene.layers]
  );
  const reviewLayers = useMemo(() => getReviewLayers(scene.layers), [scene.layers]);
  const recreatedUrl = useMemo(() => svgDataUri(scene), [scene]);
  const overlayUrl = useMemo(() => {
    const selected = new Set(enabledLayerIds);
    const overlayScene: SceneGraph = {
      ...scene,
      layers: scene.layers.filter((layer) => layer.type !== 'background_fill' && selected.has(layer.id))
    };
    return svgDataUri(overlayScene);
  }, [scene, enabledLayerIds]);

  useEffect(() => {
    setEnabledLayerIds(overlayDefaultLayers(scene.layers).map((layer) => layer.id));
  }, [scene.design_id]);

  const toggleLayer = (layerId: string) => {
    setEnabledLayerIds((current) => current.includes(layerId)
      ? current.filter((id) => id !== layerId)
      : [...current, layerId]);
  };

  const toggleAllLayers = () => {
    setEnabledLayerIds((current) => current.length === visibleLayers.length ? [] : visibleLayers.map((layer) => layer.id));
  };

  const renderArtwork = (artworkMode: 'original' | 'recreated', label: string) => (
    <ComparisonArtboard
      scene={scene}
      imageUrl={artworkMode === 'original' ? scene.original_image_url ?? null : recreatedUrl}
      label={label}
      reviewLayers={reviewLayers}
      showHighlights={showHighlights && artworkMode !== 'original'}
      unavailableLabel={artworkMode === 'original'
        ? 'No original poster image is available for this design.'
        : 'The recreated design could not be rendered.'}
    />
  );

  return (
    <div
      ref={dialogRef}
      className="fixed inset-0 z-[80] flex flex-col bg-neutral-950 text-neutral-100"
      role="dialog"
      aria-modal="true"
      aria-labelledby="comparison-title"
      tabIndex={-1}
    >
      <header className="flex flex-wrap items-center justify-between gap-3 border-b border-neutral-800 bg-neutral-900 px-4 py-3">
        <div className="flex items-center gap-3">
          <div>
            <h1 id="comparison-title" className="text-base font-semibold">Compare designs</h1>
            <p className="mt-0.5 text-xs text-neutral-400">Review the original poster against the off-screen rendered editable design.</p>
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-1.5" role="group" aria-label="Comparison view">
          {MODES.map(({ id, label: modeLabel, icon: Icon }) => (
            <button
              key={id}
              type="button"
              onClick={() => setMode(id)}
              aria-pressed={mode === id}
              className={`inline-flex min-h-11 items-center gap-1.5 rounded-lg border px-3 text-xs ${mode === id ? 'border-sky-400 bg-sky-500/15 text-sky-100' : 'border-neutral-700 text-neutral-300 hover:bg-neutral-800'}`}
            >
              <Icon className="h-4 w-4" aria-hidden="true" /> {modeLabel}
            </button>
          ))}
          <button type="button" onClick={onClose} aria-label="Close comparison" className="ml-1 min-h-11 min-w-11 rounded-lg border border-neutral-700 text-neutral-200 hover:bg-neutral-800">
            <X className="mx-auto h-4 w-4" />
          </button>
        </div>
      </header>

      <div className="flex min-h-0 flex-1 flex-col md:flex-row">
        <main className="flex min-h-0 min-w-0 flex-1 flex-col">
          <div className="flex min-h-0 flex-1 gap-3 p-3">
            {mode === 'original' && (
              <figure className="flex min-h-0 min-w-0 flex-1 flex-col rounded-lg border border-neutral-800 bg-[#111318]">
                <figcaption className="shrink-0 border-b border-neutral-800 px-3 py-2 text-xs font-medium text-neutral-200">Original</figcaption>
                {renderArtwork('original', 'Original poster')}
              </figure>
            )}
            {mode === 'recreated' && (
              <figure className="flex min-h-0 min-w-0 flex-1 flex-col rounded-lg border border-neutral-800 bg-[#111318]">
                <figcaption className="shrink-0 border-b border-neutral-800 px-3 py-2 text-xs font-medium text-neutral-200">Recreated (editable)</figcaption>
                {renderArtwork('recreated', 'Recreated editable design')}
              </figure>
            )}
            {mode === 'side-by-side' && (
              <>
                <figure className="flex min-h-0 min-w-0 flex-1 flex-col rounded-lg border border-neutral-800 bg-[#111318]">
                  <figcaption className="shrink-0 border-b border-neutral-800 px-3 py-2 text-xs font-medium text-neutral-200">Original</figcaption>
                  {renderArtwork('original', 'Original poster')}
                </figure>
                <figure className="flex min-h-0 min-w-0 flex-1 flex-col rounded-lg border border-neutral-800 bg-[#111318]">
                  <figcaption className="shrink-0 border-b border-neutral-800 px-3 py-2 text-xs font-medium text-neutral-200">Recreated (editable)</figcaption>
                  {renderArtwork('recreated', 'Recreated editable design')}
                </figure>
              </>
            )}
            {mode === 'overlay' && (
              <figure className="flex min-h-0 min-w-0 flex-1 flex-col rounded-lg border border-neutral-800 bg-[#111318]">
                <figcaption className="shrink-0 border-b border-neutral-800 px-3 py-2 text-xs font-medium text-neutral-200">Editable layers over original</figcaption>
                <div className="relative flex min-h-0 flex-1">
                  <ComparisonArtboard
                    scene={scene}
                    imageUrl={scene.original_image_url ?? null}
                    label="Original poster with recreated layers"
                    overlayUrl={overlayUrl}
                    overlayOpacity={overlayOpacity / 100}
                    reviewLayers={reviewLayers}
                    showHighlights={showHighlights}
                    unavailableLabel="No original poster image is available for this design."
                  />
                </div>
                <div className="flex shrink-0 items-center gap-3 border-t border-neutral-800 px-4 py-2">
                  <label htmlFor="comparison-overlay-opacity" className="text-xs text-neutral-300">Recreated layer opacity</label>
                  <input
                    id="comparison-overlay-opacity"
                    type="range"
                    min="0"
                    max="100"
                    value={overlayOpacity}
                    onChange={(event) => setOverlayOpacity(Number(event.target.value))}
                    className="min-h-11 flex-1 accent-sky-400"
                    aria-label="Recreated layer opacity"
                  />
                  <span className="w-10 text-right font-mono text-xs text-neutral-300">{overlayOpacity}%</span>
                </div>
              </figure>
            )}
          </div>
          <div className="flex min-h-12 shrink-0 items-center justify-between gap-3 border-t border-neutral-800 px-4 text-xs text-neutral-400">
            <label className="inline-flex min-h-11 items-center gap-2">
              <input
                type="checkbox"
                checked={showHighlights}
                onChange={(event) => setShowHighlights(event.target.checked)}
                className="accent-amber-400"
              />
              <AlertTriangle className="h-4 w-4 text-amber-300" aria-hidden="true" />
              <span>Highlight low-confidence / needs review</span>
            </label>
            <span>{reviewLayers.length} layer{reviewLayers.length === 1 ? '' : 's'} flagged for review</span>
          </div>
        </main>

        {mode === 'overlay' && (
          <aside className="flex h-52 w-full shrink-0 flex-col border-t border-neutral-800 bg-neutral-900/80 md:h-auto md:w-72 md:border-l md:border-t-0 lg:w-80" aria-label="Layers shown over original">
            <div className="flex items-center justify-between border-b border-neutral-800 px-3 py-3">
              <div>
                <h2 className="text-sm font-semibold">Editable layers</h2>
                <p className="mt-1 text-[11px] text-neutral-400">Toggle layers over the original</p>
              </div>
              <button type="button" onClick={toggleAllLayers} className="min-h-10 rounded border border-neutral-700 px-2 text-[11px] text-neutral-200 hover:bg-neutral-800">
                {enabledLayerIds.length === visibleLayers.length ? 'Clear' : 'All'}
              </button>
            </div>
            <div className="min-h-0 flex-1 space-y-1 overflow-y-auto p-2">
              {visibleLayers.length === 0 && <p className="p-3 text-xs text-neutral-400">No recreated layers are available.</p>}
              {visibleLayers.map((layer) => {
                const checked = enabledLayerIds.includes(layer.id);
                const review = reviewLayers.find((item) => item.layer.id === layer.id);
                return (
                  <label key={layer.id} className="flex min-h-11 cursor-pointer items-start gap-2 rounded px-2 py-2 hover:bg-neutral-800/70">
                    <input
                      type="checkbox"
                      checked={checked}
                      onChange={() => toggleLayer(layer.id)}
                      className="mt-0.5 accent-sky-400"
                      aria-label={`Show ${layer.name} over original`}
                    />
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-xs text-neutral-100">{layer.name}</span>
                      <span className="mt-0.5 block text-[10px] text-neutral-500">{layer.type}</span>
                    </span>
                    {review && (
                      <span className="inline-flex shrink-0 items-center gap-1 text-[10px] font-medium text-amber-200" title={review.reason}>
                        <AlertTriangle className="h-3 w-3" aria-hidden="true" /> Review
                      </span>
                    )}
                    {checked && !review && <Check className="h-3.5 w-3.5 shrink-0 text-sky-300" aria-hidden="true" />}
                  </label>
                );
              })}
            </div>
          </aside>
        )}
      </div>
    </div>
  );
};
