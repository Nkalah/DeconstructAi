import React, { useEffect, useMemo, useRef, useState } from 'react';
import { AlertTriangle, CalendarDays, Heart, MapPin, QrCode, Star } from 'lucide-react';
import type { Layer, LayerTransform, MutationOperation, SceneGraph } from '../types/sceneGraph';

type TransformMode = 'move' | 'resize' | 'rotate' | 'pan';
type ResizeHandle = 'nw' | 'n' | 'ne' | 'e' | 'se' | 's' | 'sw' | 'w';

interface DesignDocumentCanvasProps {
  scene: SceneGraph;
  selectedLayerIds: string[];
  onSelectLayerIds: (ids: string[]) => void;
  onExecuteMutation: (operation: MutationOperation) => void;
  onCommitTransforms: (transforms: Record<string, LayerTransform>) => void;
  zoom: number;
  onSetZoom: (zoom: number | ((previous: number) => number)) => void;
  onFitZoomChange?: (zoom: number) => void;
  previewMode?: boolean;
}

interface ActiveTransform {
  mode: TransformMode;
  pointerId: number;
  startX: number;
  startY: number;
  layerId?: string;
  selectedIds: string[];
  x: number;
  y: number;
  width: number;
  height: number;
  rotation: number;
  handle?: ResizeHandle;
}

const RESIZE_HANDLES: ResizeHandle[] = ['nw', 'n', 'ne', 'e', 'se', 's', 'sw', 'w'];

export const DesignDocumentCanvas: React.FC<DesignDocumentCanvasProps> = ({
  scene,
  selectedLayerIds,
  onSelectLayerIds,
  onExecuteMutation,
  onCommitTransforms,
  zoom,
  onSetZoom,
  onFitZoomChange,
  previewMode = false
}) => {
  const viewportRef = useRef<HTMLDivElement>(null);
  const activeTransform = useRef<ActiveTransform | null>(null);
  const spaceHeld = useRef(false);
  const [pan, setPan] = useState({ x: 0, y: 0 });
  const [snapToGrid, setSnapToGrid] = useState(true);
  const [guides, setGuides] = useState<{ x?: number; y?: number }>({});
  const [draftTransforms, setDraftTransforms] = useState<Record<string, LayerTransform>>({});
  const [inlineText, setInlineText] = useState<{ id: string; value: string } | null>(null);

  useEffect(() => {
    const viewport = viewportRef.current;
    if (!viewport) return;
    let frame = 0;
    const fitViewport = () => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(() => {
      const bounds = viewport.getBoundingClientRect();
      const fit = Math.min(
        0.65,
        (bounds.width - 64) / scene.canvas.width,
        (bounds.height - 100) / scene.canvas.height
      );
      const fittedZoom = Math.max(0.03, fit);
      onSetZoom(fittedZoom);
      onFitZoomChange?.(fittedZoom);
      setPan({ x: 0, y: 0 });
      });
    };
    const observer = new ResizeObserver(fitViewport);
    observer.observe(viewport);
    fitViewport();
    return () => {
      observer.disconnect();
      cancelAnimationFrame(frame);
    };
  }, [scene.canvas.width, scene.canvas.height, onSetZoom, onFitZoomChange]);

  const sortedLayers = useMemo(
    () => [...scene.layers].filter((layer) => layer.visible).sort((left, right) => left.z_index - right.z_index),
    [scene.layers]
  );
  const selectedLayers = sortedLayers.filter((layer) => selectedLayerIds.includes(layer.id));
  const rulerStep = Math.max(100, Math.ceil(60 / (zoom * 100)) * 100);

  const beginTransform = (event: React.PointerEvent, layer: Layer, mode: TransformMode, handle?: ResizeHandle) => {
    if (previewMode || layer.locked) return;
    event.preventDefault();
    event.stopPropagation();
    const multiple = event.shiftKey || event.ctrlKey || event.metaKey;
    let ids = selectedLayerIds;
    if (!multiple && !selectedLayerIds.includes(layer.id)) {
      ids = [layer.id];
      onSelectLayerIds(ids);
    } else if (multiple) {
      ids = selectedLayerIds.includes(layer.id)
        ? selectedLayerIds.filter((id) => id !== layer.id)
        : [...selectedLayerIds, layer.id];
      onSelectLayerIds(ids);
      if (!ids.includes(layer.id)) return;
    }
    activeTransform.current = {
      mode,
      pointerId: event.pointerId,
      startX: event.clientX,
      startY: event.clientY,
      layerId: layer.id,
      selectedIds: ids,
      x: layer.transform.x,
      y: layer.transform.y,
      width: layer.transform.width,
      height: layer.transform.height,
      rotation: layer.transform.rotation,
      handle
    };
    (event.currentTarget as HTMLElement).setPointerCapture?.(event.pointerId);
  };

  const handleCanvasPointerDown = (event: React.PointerEvent<HTMLDivElement>) => {
    const target = event.target as HTMLElement;
    const isBlankCanvas = !target.closest('[data-editable-layer]');
    const layerId = target.closest<HTMLElement>('[data-editable-layer]')?.dataset.editableLayer;
    const touchedLayer = scene.layers.find((layer) => layer.id === layerId);
    const touchPan = event.pointerType === 'touch' && (isBlankCanvas || touchedLayer?.locked);
    if (event.button === 1 || spaceHeld.current || touchPan) {
      event.preventDefault();
      activeTransform.current = {
        mode: 'pan',
        pointerId: event.pointerId,
        startX: event.clientX,
        startY: event.clientY,
        selectedIds: [],
        x: pan.x,
        y: pan.y,
        width: 0,
        height: 0,
        rotation: 0
      };
      event.currentTarget.setPointerCapture(event.pointerId);
      return;
    }
    if (event.target === event.currentTarget || target.id === 'poster-artboard' || isBlankCanvas) {
      onSelectLayerIds([]);
      setInlineText(null);
    }
  };

  const handlePointerMove = (event: React.PointerEvent) => {
    const active = activeTransform.current;
    if (!active || active.pointerId !== event.pointerId) return;
    if (active.mode === 'pan') {
      setPan({ x: active.x + event.clientX - active.startX, y: active.y + event.clientY - active.startY });
      return;
    }
    if (!active.layerId) return;
    const layer = scene.layers.find((item) => item.id === active.layerId);
    if (!layer) return;

    const dx = (event.clientX - active.startX) / zoom;
    const dy = (event.clientY - active.startY) / zoom;
    if (active.mode === 'move') {
      let nextX = active.x + dx;
      let nextY = active.y + dy;
      const snapThreshold = 8 / zoom;
      const peers = scene.layers.filter((item) => item.visible && !active.selectedIds.includes(item.id));
      const xCandidates = [
        scene.canvas.width / 2,
        ...peers.flatMap((item) => [item.transform.x, item.transform.x + item.transform.width / 2, item.transform.x + item.transform.width])
      ];
      const yCandidates = [
        scene.canvas.height / 2,
        ...peers.flatMap((item) => [item.transform.y, item.transform.y + item.transform.height / 2, item.transform.y + item.transform.height])
      ];
      for (let first = 0; first < peers.length; first += 1) {
        for (let second = first + 1; second < peers.length; second += 1) {
          const left = peers[first];
          const right = peers[second];
          const sameRow = Math.abs(left.transform.y + left.transform.height / 2 - (right.transform.y + right.transform.height / 2))
            <= Math.max(left.transform.height, right.transform.height) / 2;
          if (sameRow) {
            const ordered = left.transform.x <= right.transform.x ? [left, right] : [right, left];
            const gap = ordered[1].transform.x - (ordered[0].transform.x + ordered[0].transform.width);
            if (gap >= 0) {
              const x = ordered[0].transform.x + ordered[0].transform.width + (gap - active.width) / 2;
              xCandidates.push(x + active.width / 2);
            }
          }
          const sameColumn = Math.abs(left.transform.x + left.transform.width / 2 - (right.transform.x + right.transform.width / 2))
            <= Math.max(left.transform.width, right.transform.width) / 2;
          if (sameColumn) {
            const ordered = left.transform.y <= right.transform.y ? [left, right] : [right, left];
            const gap = ordered[1].transform.y - (ordered[0].transform.y + ordered[0].transform.height);
            if (gap >= 0) {
              const y = ordered[0].transform.y + ordered[0].transform.height + (gap - active.height) / 2;
              yCandidates.push(y + active.height / 2);
            }
          }
        }
      }
      const centerX = nextX + active.width / 2;
      const centerY = nextY + active.height / 2;
      const nearestX = xCandidates.reduce((nearest, candidate) =>
        Math.abs(candidate - centerX) < Math.abs(nearest - centerX) ? candidate : nearest
      );
      const nearestY = yCandidates.reduce((nearest, candidate) =>
        Math.abs(candidate - centerY) < Math.abs(nearest - centerY) ? candidate : nearest
      );
      const alignX = Math.abs(nearestX - centerX) <= snapThreshold ? nearestX : undefined;
      const alignY = Math.abs(nearestY - centerY) <= snapThreshold ? nearestY : undefined;
      if (alignX !== undefined) nextX = alignX - active.width / 2;
      if (alignY !== undefined) nextY = alignY - active.height / 2;
      setGuides({ x: alignX, y: alignY });
      if (snapToGrid) {
        nextX = Math.round(nextX / 10) * 10;
        nextY = Math.round(nextY / 10) * 10;
      }
      const moveX = nextX - active.x;
      const moveY = nextY - active.y;
      const draft: Record<string, LayerTransform> = {};
      for (const id of active.selectedIds) {
        const selected = scene.layers.find((item) => item.id === id);
        if (selected && !selected.locked) {
          draft[id] = {
            ...selected.transform,
            x: id === active.layerId ? nextX : selected.transform.x + moveX,
            y: id === active.layerId ? nextY : selected.transform.y + moveY
          };
        }
      }
      setDraftTransforms(draft);
      return;
    }
    if (active.mode === 'rotate') {
      const centerX = active.x + active.width / 2;
      const centerY = active.y + active.height / 2;
      const rect = document.getElementById('poster-artboard')?.getBoundingClientRect();
      const boardX = (event.clientX - (rect?.left ?? 0)) / zoom;
      const boardY = (event.clientY - (rect?.top ?? 0)) / zoom;
      let rotation = Math.round((Math.atan2(boardY - centerY, boardX - centerX) * 180) / Math.PI + 90);
      if (rotation < 0) rotation += 360;
      if (event.shiftKey) rotation = Math.round(rotation / 15) * 15;
      setDraftTransforms({ [active.layerId]: { ...layer.transform, rotation } });
      return;
    }

    const handle = active.handle || 'se';
    const minSize = 12;
    let x = active.x;
    let y = active.y;
    let width = active.width;
    let height = active.height;
    if (handle.includes('e')) width = Math.max(minSize, active.width + dx);
    if (handle.includes('s')) height = Math.max(minSize, active.height + dy);
    if (handle.includes('w')) {
      width = Math.max(minSize, active.width - dx);
      x = active.x + active.width - width;
    }
    if (handle.includes('n')) {
      height = Math.max(minSize, active.height - dy);
      y = active.y + active.height - height;
    }
    if (event.shiftKey || layer.type === 'image') {
      const ratio = active.width / Math.max(1, active.height);
      const isHorizontalEdge = handle === 'e' || handle === 'w';
      const isVerticalEdge = handle === 'n' || handle === 's';
      if (isHorizontalEdge) {
        height = width / ratio;
        y = active.y + (active.height - height) / 2;
      } else if (isVerticalEdge) {
        width = height * ratio;
        x = active.x + (active.width - width) / 2;
      } else if (Math.abs(dx) > Math.abs(dy)) {
        height = width / ratio;
      } else {
        width = height * ratio;
      }
      if (handle.includes('w')) x = active.x + active.width - width;
      if (handle.includes('n')) y = active.y + active.height - height;
    }
    setDraftTransforms({ [active.layerId]: { ...layer.transform, x, y, width, height } });
  };

  const endTransform = (event: React.PointerEvent) => {
    if (activeTransform.current?.pointerId === event.pointerId) {
      if (activeTransform.current.mode !== 'pan' && Object.keys(draftTransforms).length) {
        onCommitTransforms(draftTransforms);
      }
      activeTransform.current = null;
      setDraftTransforms({});
      setGuides({});
    }
  };

  React.useEffect(() => {
    const down = (event: KeyboardEvent) => { if (event.code === 'Space') spaceHeld.current = true; };
    const up = (event: KeyboardEvent) => { if (event.code === 'Space') spaceHeld.current = false; };
    window.addEventListener('keydown', down);
    window.addEventListener('keyup', up);
    return () => {
      window.removeEventListener('keydown', down);
      window.removeEventListener('keyup', up);
    };
  }, []);

  const handleWheel = (event: React.WheelEvent) => {
    if (!event.ctrlKey && !event.metaKey) return;
    event.preventDefault();
    onSetZoom((value) => Math.max(0.03, Math.min(2.5, value + (event.deltaY < 0 ? 0.05 : -0.05))));
  };

  const renderLayer = (layer: Layer) => {
    const isSelected = selectedLayerIds.includes(layer.id);
    const transform = draftTransforms[layer.id] ?? layer.transform;
    const layerStyle: React.CSSProperties = {
      position: 'absolute',
      left: transform.x,
      top: transform.y,
      width: transform.width,
      height: transform.height,
      transform: `rotate(${transform.rotation}deg)`,
      opacity: layer.opacity,
      zIndex: layer.z_index,
      cursor: previewMode ? 'default' : layer.locked ? 'not-allowed' : 'move',
      outline: isSelected && !previewMode ? '2px solid #38bdf8' : undefined,
      outlineOffset: 2,
      touchAction: 'none'
    };
    const commonEvents = {
      onPointerDown: (event: React.PointerEvent<HTMLDivElement>) => beginTransform(event, layer, 'move'),
      onDoubleClick: () => {
        if (layer.type === 'text' && !layer.locked) {
          setInlineText({ id: layer.id, value: layer.type_specific.content });
        }
      }
    };

    return (
      <div
        key={layer.id}
        data-editable-layer={layer.id}
        {...commonEvents}
        style={layerStyle}
        className="select-none focus-visible:outline focus-visible:outline-2 focus-visible:outline-amber-300 focus-visible:outline-offset-2"
        role="group"
        tabIndex={previewMode ? -1 : 0}
        aria-label={`${layer.name}, ${layer.type}${layer.source.warning_flags?.length ? ', needs review' : ''}. Press Enter to select.`}
        onKeyDown={(event) => {
          if (event.target !== event.currentTarget || (event.key !== 'Enter' && event.key !== ' ')) return;
          event.preventDefault();
          onSelectLayerIds([layer.id]);
        }}
      >
        {layer.type === 'background_fill' && (
          <div
            className="h-full w-full"
            style={{
              background: layer.type_specific.fill_type === 'transparent'
                ? 'transparent'
                : layer.type_specific.fill_type === 'reconstructed_texture' && layer.type_specific.reconstructed_image_url
                  ? `url("${layer.type_specific.reconstructed_image_url}") center / cover`
                  : layer.type_specific.colors.length > 1 && layer.type_specific.fill_type === 'linear_gradient'
                    ? `linear-gradient(${layer.type_specific.angle}deg, ${layer.type_specific.colors.join(',')})`
                    : layer.type_specific.colors.length > 1 && layer.type_specific.fill_type === 'radial_gradient'
                      ? `radial-gradient(circle, ${layer.type_specific.colors.join(',')})`
                      : layer.type_specific.colors[0] || scene.canvas.background_color || 'transparent'
            }}
          />
        )}
        {layer.type === 'image' && (
          <img
            src={layer.type_specific.image_url}
            alt={layer.name}
            draggable={false}
            className="pointer-events-none h-full w-full select-none object-cover"
            style={{
              borderRadius: ['circle', 'ellipse'].includes(layer.type_specific.mask_shape)
                ? '50%'
                : layer.type_specific.mask_shape === 'rounded_rect' ? (layer.style.border_radius ?? 16) : layer.style.border_radius,
              clipPath: layer.type_specific.mask_shape === 'custom_path' ? 'inset(0)' : undefined,
              objectFit: layer.type_specific.object_fit || 'cover'
            }}
          />
        )}
        {layer.type === 'shape' && (
          <div
            className="h-full w-full"
            style={{
              background: layer.style.effects.gradient?.enabled
                ? layer.style.effects.gradient.type === 'radial'
                  ? `radial-gradient(circle, ${layer.style.effects.gradient.stops.map((stop) => `${stop.color} ${stop.offset * 100}%`).join(', ')})`
                  : `linear-gradient(${layer.style.effects.gradient.angle ?? 0}deg, ${layer.style.effects.gradient.stops.map((stop) => `${stop.color} ${stop.offset * 100}%`).join(', ')})`
                : layer.type_specific.fill_color === 'transparent' ? 'transparent' : layer.type_specific.fill_color,
              borderRadius: layer.type_specific.shape_type === 'ellipse' ? '50%' : layer.type_specific.shape_type === 'pill' ? '9999px' : layer.style.border_radius,
              clipPath: layer.type_specific.shape_type === 'polygon' ? 'polygon(50% 0, 100% 100%, 0 100%)' : undefined,
              height: layer.type_specific.shape_type === 'divider' ? Math.max(1, layer.style.effects.stroke.width) : undefined,
              border: layer.style.effects.stroke.enabled
                ? `${layer.style.effects.stroke.width}px solid ${layer.style.effects.stroke.color}`
                : undefined
            }}
          >
            {layer.type_specific.shape_type === 'path' && layer.type_specific.path_data && (
              <svg viewBox="0 0 100 100" preserveAspectRatio="none" className="h-full w-full">
                <path d={layer.type_specific.path_data} fill={layer.type_specific.fill_color} />
              </svg>
            )}
          </div>
        )}
        {layer.type === 'text' && (
          inlineText?.id === layer.id ? (
            <textarea
              autoFocus
              value={inlineText.value}
              dir={layer.type_specific.direction ?? 'auto'}
              onPointerDown={(event) => event.stopPropagation()}
              onChange={(event) => setInlineText({ id: layer.id, value: event.target.value })}
              onBlur={() => {
                if (inlineText.value !== layer.type_specific.content) {
                  onExecuteMutation({
                    type: 'update_text',
                    layer_id: layer.id,
                    params: { content: inlineText.value, uncertain: false }
                  });
                }
                setInlineText(null);
              }}
              className="h-full w-full resize-none border border-sky-400 bg-black/80 p-1 text-white outline-none [unicode-bidi:plaintext]"
              style={{
                fontSize: layer.type_specific.font_size,
                fontFamily: layer.type_specific.font_family,
                fontWeight: layer.type_specific.font_weight,
                fontStyle: layer.type_specific.font_style,
                lineHeight: layer.type_specific.line_height || 1.2,
                letterSpacing: layer.type_specific.letter_spacing
              }}
            />
          ) : (
            <div
              className="h-full w-full whitespace-pre-wrap break-words"
              dir={layer.type_specific.direction ?? 'auto'}
              style={{
                fontFamily: layer.type_specific.font_family,
                fontSize: layer.type_specific.font_size,
                fontWeight: layer.type_specific.font_weight,
                fontStyle: layer.type_specific.font_style,
                color: layer.type_specific.color,
                unicodeBidi: 'plaintext',
                textAlign: layer.type_specific.alignment,
                lineHeight: layer.type_specific.line_height || 1.2,
                letterSpacing: layer.type_specific.letter_spacing,
                WebkitTextStroke: layer.style.effects.stroke.enabled
                  ? `${layer.style.effects.stroke.width}px ${layer.style.effects.stroke.color}`
                  : undefined,
                textShadow: layer.style.effects.shadow.enabled
                  ? `${layer.style.effects.shadow.offset_x}px ${layer.style.effects.shadow.offset_y}px ${layer.style.effects.shadow.blur}px ${layer.style.effects.shadow.color}`
                  : undefined
              }}
            >
              {layer.type_specific.content}
            </div>
          )
        )}
        {layer.type === 'text'
          && (layer.type_specific.uncertain
            || layer.type_specific.font_family_confidence < 0.75)
          && (
            <div
              className="absolute -top-7 left-0 z-50 flex items-center gap-1 whitespace-nowrap rounded bg-amber-300 px-2 py-1 text-[10px] font-semibold text-neutral-950 shadow"
              aria-label="This text may need review"
              title="This text may need review"
            >
              <AlertTriangle className="h-3 w-3" aria-hidden="true" />
              Check text
            </div>
          )}
        {layer.type === 'icon' && (
            <div className={`relative flex h-full w-full items-center justify-center ${layer.type_specific.qr_fallback_crop ? 'overflow-hidden' : ''}`} style={{ color: layer.type_specific.fill_color }}>
            {layer.type_specific.image_url
                ? (
                  <img
                    src={layer.type_specific.image_url}
                    alt={layer.name}
                    className={layer.type_specific.qr_fallback_crop ? 'pointer-events-none absolute max-w-none select-none' : 'h-full w-full object-fill'}
                    draggable={false}
                    style={layer.type_specific.qr_fallback_crop ? {
                      width: `${scene.canvas.width / layer.type_specific.qr_fallback_crop.width * 100}%`,
                      height: `${scene.canvas.height / layer.type_specific.qr_fallback_crop.height * 100}%`,
                      left: `${-layer.type_specific.qr_fallback_crop.x / layer.type_specific.qr_fallback_crop.width * 100}%`,
                      top: `${-layer.type_specific.qr_fallback_crop.y / layer.type_specific.qr_fallback_crop.height * 100}%`
                    } : undefined}
                  />
                )
                : layer.type_specific.icon_name === 'qr-code'
              ? <QrCode className="h-full w-full" strokeWidth={1.6} />
              : layer.type_specific.icon_name === 'map-pin'
                ? <MapPin className="h-full w-full" />
                : layer.type_specific.icon_name === 'calendar'
                  ? <CalendarDays className="h-full w-full" />
                  : layer.type_specific.icon_name === 'heart'
                    ? <Heart className="h-full w-full" />
                    : <Star className="h-full w-full" />}
          </div>
        )}
        {isSelected && selectedLayerIds[0] === layer.id && !previewMode && !layer.locked && (
          <>
            <button
              type="button"
              aria-label={`Rotate ${layer.name}`}
              onPointerDown={(event) => beginTransform(event, layer, 'rotate')}
              className="absolute left-1/2 top-0 z-50 h-11 w-11 -translate-x-1/2 -translate-y-full rounded-full border border-sky-300 bg-neutral-950/90 text-sky-300 touch-manipulation"
              style={{ touchAction: 'none' }}
            >↻</button>
            {RESIZE_HANDLES.map((handle) => (
              <button
                key={handle}
                type="button"
                aria-label={`Resize ${layer.name} ${handle}`}
                onPointerDown={(event) => beginTransform(event, layer, 'resize', handle)}
                className="absolute z-50 h-11 w-11 rounded-full border border-sky-300 bg-neutral-950/85 touch-manipulation"
                style={{
                  left: handle.includes('w') ? 0 : handle.includes('e') ? '100%' : '50%',
                  top: handle.includes('n') ? 0 : handle.includes('s') ? '100%' : '50%',
                  transform: `translate(${handle.includes('w') ? '-50%' : handle.includes('e') ? '-50%' : '-50%'}, ${handle.includes('n') ? '-50%' : handle.includes('s') ? '-50%' : '-50%'})`,
                  touchAction: 'none'
                }}
              />
            ))}
          </>
        )}
      </div>
    );
  };

  return (
    <section className="relative flex min-w-0 flex-1 flex-col overflow-hidden bg-[#111318]" aria-label="Design canvas">
      <div className="relative flex min-h-0 flex-1 overflow-hidden">
        <div className="absolute left-0 right-0 top-0 z-20 flex h-7 items-center justify-end border-b border-neutral-700/70 bg-neutral-900/90 px-3 text-[10px] text-neutral-400">
          <label className="flex min-h-11 items-center gap-2 py-1">
            <input type="checkbox" checked={snapToGrid} onChange={(event) => setSnapToGrid(event.target.checked)} />
            <span>Snap to grid</span>
          </label>
        </div>
        <div
          ref={viewportRef}
          onPointerDown={handleCanvasPointerDown}
          onPointerMove={handlePointerMove}
          onPointerUp={endTransform}
          onPointerCancel={endTransform}
          onWheel={handleWheel}
          className="flex min-h-0 flex-1 touch-none items-center justify-center overflow-hidden pt-7"
          style={{ backgroundImage: 'radial-gradient(#343944 0.75px, transparent 0.75px)', backgroundSize: '18px 18px' }}
        >
          <div
            id="poster-artboard"
            className="relative shrink-0 shadow-2xl"
            style={{
              width: scene.canvas.width * zoom,
              height: scene.canvas.height * zoom,
              transform: `translate(${pan.x}px, ${pan.y}px)`,
              backgroundColor: scene.canvas.background_color ?? 'transparent',
              backgroundImage: scene.canvas.background_color ? undefined : 'conic-gradient(#dedede 25%, transparent 0 50%, #dedede 0 75%, transparent 0)',
              backgroundSize: scene.canvas.background_color ? undefined : `${16 * zoom}px ${16 * zoom}px`,
              touchAction: 'none'
            }}
          >
            <div
              className="absolute left-0 top-0 origin-top-left"
              style={{ width: scene.canvas.width, height: scene.canvas.height, transform: `scale(${zoom})` }}
            >
                <div className="pointer-events-none absolute -top-6 left-0 h-6 w-full border-b border-sky-400/60 bg-neutral-950/75 text-[9px] text-sky-200">
                  {Array.from({ length: Math.floor(scene.canvas.width / rulerStep) + 1 }, (_, index) => index * rulerStep).map((unit) => (
                    <div key={unit} className="absolute top-4 h-2 border-l border-sky-300/70" style={{ left: unit }}>
                      <span className="absolute bottom-2 left-1 whitespace-nowrap">{unit}</span>
                    </div>
                  ))}
                </div>
                <div className="pointer-events-none absolute -left-6 top-0 h-full w-6 border-r border-sky-400/60 bg-neutral-950/75 text-[9px] text-sky-200">
                  {Array.from({ length: Math.floor(scene.canvas.height / rulerStep) + 1 }, (_, index) => index * rulerStep).map((unit) => (
                    <div key={unit} className="absolute left-4 w-2 border-t border-sky-300/70" style={{ top: unit }}>
                      <span className="absolute right-2 top-0 -translate-y-1/2 whitespace-nowrap">{unit}</span>
                    </div>
                  ))}
                </div>
                {sortedLayers.map(renderLayer)}
              {guides.x !== undefined && <div className="pointer-events-none absolute inset-y-0 z-[999] border-l border-fuchsia-400" style={{ left: guides.x }} />}
              {guides.y !== undefined && <div className="pointer-events-none absolute inset-x-0 z-[999] border-t border-fuchsia-400" style={{ top: guides.y }} />}
            </div>
          </div>
        </div>
        <div className="absolute bottom-3 right-3 z-30 flex items-center gap-1 rounded-lg border border-neutral-700 bg-neutral-900/95 p-1 shadow-lg">
          <button
            type="button"
            onClick={() => {
              const bounds = viewportRef.current?.getBoundingClientRect();
              if (!bounds) return;
              const fittedZoom = Math.max(0.03, Math.min(0.65, (bounds.width - 64) / scene.canvas.width, (bounds.height - 100) / scene.canvas.height));
              onSetZoom(fittedZoom);
              onFitZoomChange?.(fittedZoom);
              setPan({ x: 0, y: 0 });
            }}
            className="min-h-11 rounded px-2 text-xs text-neutral-200 hover:bg-neutral-800"
            aria-label="Fit canvas to view"
          >
            Fit
          </button>
          <button type="button" onClick={() => onSetZoom((value) => Math.max(0.03, value - 0.1))} className="min-h-11 min-w-11 rounded text-neutral-200 hover:bg-neutral-800" aria-label="Zoom out">−</button>
          <span className="min-w-12 text-center font-mono text-xs text-neutral-200">{Math.round(zoom * 100)}%</span>
          <button type="button" onClick={() => onSetZoom((value) => Math.min(2.5, value + 0.1))} className="min-h-11 min-w-11 rounded text-neutral-200 hover:bg-neutral-800" aria-label="Zoom in">+</button>
        </div>
        {selectedLayers.length > 1 && (
          <div className="absolute bottom-3 left-3 z-30 rounded-lg border border-neutral-700 bg-neutral-900/95 px-3 py-2 text-xs text-neutral-200">
            {selectedLayers.length} layers selected · Ctrl+G to group
          </div>
        )}
      </div>
      <div className="flex h-8 shrink-0 items-center justify-between border-t border-neutral-800 bg-neutral-900 px-3 text-[10px] text-neutral-500">
        <span>Canvas {scene.canvas.width} × {scene.canvas.height} px</span>
        <span>Space + drag to pan · Ctrl/⌘ + wheel to zoom · Shift-click for multi-select</span>
      </div>
    </section>
  );
};
