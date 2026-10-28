import React, { useRef, useState, useEffect, useCallback } from 'react';
import { SceneGraph, Layer, TextLayer, ImageLayer, ShapeLayer, BackgroundFillLayer, MutationOperation } from '../types/sceneGraph';

interface CanvasEditorProps {
  scene: SceneGraph;
  selectedLayerId: string | null;
  onSelectLayer: (id: string | null) => void;
  onExecuteMutation: (op: MutationOperation) => void;
  zoom: number;
}

type HandleType = 'nw' | 'n' | 'ne' | 'e' | 'se' | 's' | 'sw' | 'w' | 'rotate' | null;

export const CanvasEditor: React.FC<CanvasEditorProps> = ({
  scene,
  selectedLayerId,
  onSelectLayer,
  onExecuteMutation,
  zoom
}) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const [isDragging, setIsDragging] = useState(false);
  const [activeHandle, setActiveHandle] = useState<HandleType>(null);
  const [dragStart, setDragStart] = useState<{ mouseX: number; mouseY: number; layerX: number; layerY: number; layerW: number; layerH: number; rotation: number } | null>(null);
  const [inlineEditingTextId, setInlineEditingTextId] = useState<string | null>(null);
  const [inlineTextVal, setInlineTextVal] = useState<string>('');

  const selectedLayer = scene.layers.find(l => l.id === selectedLayerId);

  // Deselect when clicking empty canvas space
  const handleCanvasBackgroundClick = (e: React.MouseEvent) => {
    if (e.target === e.currentTarget || (e.target as HTMLElement).id === 'canvas-board') {
      if (inlineEditingTextId) {
        commitInlineTextEdit();
      }
      onSelectLayer(null);
    }
  };

  const handleLayerMouseDown = (e: React.MouseEvent, layer: Layer) => {
    if (layer.locked) return;
    e.stopPropagation();

    if (inlineEditingTextId && inlineEditingTextId !== layer.id) {
      commitInlineTextEdit();
    }

    onSelectLayer(layer.id);
    setIsDragging(true);
    setActiveHandle(null);

    setDragStart({
      mouseX: e.clientX,
      mouseY: e.clientY,
      layerX: layer.transform.x,
      layerY: layer.transform.y,
      layerW: layer.transform.width,
      layerH: layer.transform.height,
      rotation: layer.transform.rotation || 0
    });
  };

  const handleHandleMouseDown = (e: React.MouseEvent, handle: HandleType) => {
    e.stopPropagation();
    if (!selectedLayer || selectedLayer.locked) return;

    setActiveHandle(handle);
    setIsDragging(false);

    setDragStart({
      mouseX: e.clientX,
      mouseY: e.clientY,
      layerX: selectedLayer.transform.x,
      layerY: selectedLayer.transform.y,
      layerW: selectedLayer.transform.width,
      layerH: selectedLayer.transform.height,
      rotation: selectedLayer.transform.rotation || 0
    });
  };

  const commitInlineTextEdit = useCallback(() => {
    if (!inlineEditingTextId) return;
    const layer = scene.layers.find(l => l.id === inlineEditingTextId);
    if (layer && layer.type === 'text') {
      onExecuteMutation({
        type: 'update_text',
        layer_id: inlineEditingTextId,
        params: { content: inlineTextVal }
      });
    }
    setInlineEditingTextId(null);
  }, [inlineEditingTextId, inlineTextVal, scene.layers, onExecuteMutation]);

  const handleLayerDoubleClick = (e: React.MouseEvent, layer: Layer) => {
    if (layer.type === 'text' && !layer.locked) {
      e.stopPropagation();
      setInlineEditingTextId(layer.id);
      setInlineTextVal((layer as TextLayer).type_specific.content);
    }
  };

  // Mouse move handler for drag & resize
  useEffect(() => {
    const handleMouseMove = (e: MouseEvent) => {
      if (!dragStart || !selectedLayer) return;

      const deltaX = (e.clientX - dragStart.mouseX) / zoom;
      const deltaY = (e.clientY - dragStart.mouseY) / zoom;

      // Handle layer moving
      if (isDragging) {
        const nextX = Math.round(dragStart.layerX + deltaX);
        const nextY = Math.round(dragStart.layerY + deltaY);

        onExecuteMutation({
          type: 'update_transform',
          layer_id: selectedLayer.id,
          params: {
            transform: {
              ...selectedLayer.transform,
              x: nextX,
              y: nextY
            }
          }
        });
        return;
      }

      // Handle layer rotation
      if (activeHandle === 'rotate') {
        const cx = dragStart.layerX + dragStart.layerW / 2;
        const cy = dragStart.layerY + dragStart.layerH / 2;
        // calculate angle from center to mouse position
        const rect = containerRef.current?.getBoundingClientRect();
        if (rect) {
          const mouseCanvasX = (e.clientX - rect.left) / zoom;
          const mouseCanvasY = (e.clientY - rect.top) / zoom;
          const rad = Math.atan2(mouseCanvasY - cy, mouseCanvasX - cx);
          let deg = Math.round((rad * 180) / Math.PI) + 90;
          if (deg < 0) deg += 360;
          // Snap to 15 degrees if shift held
          if (e.shiftKey) {
            deg = Math.round(deg / 15) * 15;
          }
          onExecuteMutation({
            type: 'update_transform',
            layer_id: selectedLayer.id,
            params: {
              transform: {
                ...selectedLayer.transform,
                rotation: deg
              }
            }
          });
        }
        return;
      }

      // Handle layer resizing
      if (activeHandle) {
        let newX = dragStart.layerX;
        let newY = dragStart.layerY;
        let newW = dragStart.layerW;
        let newH = dragStart.layerH;

        const isProportional = e.shiftKey || selectedLayer.type === 'image';
        const aspectRatio = dragStart.layerW / dragStart.layerH;

        if (activeHandle.includes('e')) {
          newW = Math.max(20, Math.round(dragStart.layerW + deltaX));
          if (isProportional) newH = Math.round(newW / aspectRatio);
        }
        if (activeHandle.includes('s')) {
          newH = Math.max(20, Math.round(dragStart.layerH + deltaY));
          if (isProportional) newW = Math.round(newH * aspectRatio);
        }
        if (activeHandle.includes('w')) {
          const potentialW = dragStart.layerW - deltaX;
          if (potentialW >= 20) {
            newW = Math.round(potentialW);
            newX = Math.round(dragStart.layerX + deltaX);
            if (isProportional) {
              newH = Math.round(newW / aspectRatio);
            }
          }
        }
        if (activeHandle.includes('n')) {
          const potentialH = dragStart.layerH - deltaY;
          if (potentialH >= 20) {
            newH = Math.round(potentialH);
            newY = Math.round(dragStart.layerY + deltaY);
            if (isProportional) {
              newW = Math.round(newH * aspectRatio);
            }
          }
        }

        onExecuteMutation({
          type: 'update_transform',
          layer_id: selectedLayer.id,
          params: {
            transform: {
              ...selectedLayer.transform,
              x: newX,
              y: newY,
              width: newW,
              height: newH
            }
          }
        });
      }
    };

    const handleMouseUp = () => {
      setIsDragging(false);
      setActiveHandle(null);
      setDragStart(null);
    };

    if (isDragging || activeHandle) {
      window.addEventListener('mousemove', handleMouseMove);
      window.addEventListener('mouseup', handleMouseUp);
    }

    return () => {
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('mouseup', handleMouseUp);
    };
  }, [isDragging, activeHandle, dragStart, selectedLayer, zoom, onExecuteMutation]);

  const canvasWidth = scene.canvas.width;
  const canvasHeight = scene.canvas.height;

  // Sorted layers
  const sortedLayers = [...scene.layers]
    .filter(l => l.visible !== false)
    .sort((a, b) => a.z_index - b.z_index);

  return (
    <div 
      className="relative flex-1 overflow-auto bg-neutral-950 flex items-center justify-center p-8 select-none"
      onClick={handleCanvasBackgroundClick}
    >
      {/* Canvas Artboard Container */}
      <div
        id="canvas-board"
        ref={containerRef}
        style={{
          width: `${canvasWidth * zoom}px`,
          height: `${canvasHeight * zoom}px`,
        }}
        className="relative bg-neutral-900 shadow-2xl rounded-sm transition-all duration-75 border border-neutral-800"
      >
        {/* Scaled Scene Canvas Content */}
        <div
          style={{
            width: `${canvasWidth}px`,
            height: `${canvasHeight}px`,
            transform: `scale(${zoom})`,
            transformOrigin: 'top left',
          }}
          className="absolute top-0 left-0 w-full h-full overflow-hidden"
        >
          {sortedLayers.map((layer) => {
            const isSelected = layer.id === selectedLayerId;
            const isInlineEditing = layer.id === inlineEditingTextId;

            // Extract drop shadow
            const shadow = layer.style?.effects?.shadow;
            const shadowStyle = shadow && shadow.enabled
              ? `${shadow.offset_x}px ${shadow.offset_y}px ${shadow.blur}px ${shadow.color}`
              : 'none';

            // Extract stroke
            const stroke = layer.style?.effects?.stroke;

            return (
              <div
                key={layer.id}
                id={`layer-${layer.id}`}
                onMouseDown={(e) => handleLayerMouseDown(e, layer)}
                onDoubleClick={(e) => handleLayerDoubleClick(e, layer)}
                style={{
                  position: 'absolute',
                  left: `${layer.transform.x}px`,
                  top: `${layer.transform.y}px`,
                  width: `${layer.transform.width}px`,
                  height: `${layer.transform.height}px`,
                  transform: `rotate(${layer.transform.rotation || 0}deg)`,
                  opacity: layer.opacity !== undefined ? layer.opacity : 1,
                  zIndex: layer.z_index,
                  boxShadow: layer.type !== 'text' && shadow?.enabled ? shadowStyle : 'none',
                  filter: layer.type === 'text' && shadow?.enabled ? `drop-shadow(${shadowStyle})` : 'none',
                  cursor: layer.locked ? 'not-allowed' : (isDragging && isSelected ? 'grabbing' : 'grab'),
                  outline: isSelected ? '2px solid #38bdf8' : 'none',
                  outlineOffset: '2px',
                }}
                className={`group transition-[outline] ${layer.locked ? 'pointer-events-none' : ''}`}
              >
                {/* Background Fill Layer */}
                {layer.type === 'background_fill' && (
                  <div
                    style={{
                      width: '100%',
                      height: '100%',
                      background:
                        (layer as BackgroundFillLayer).type_specific.fill_type === 'linear_gradient' &&
                        (layer as BackgroundFillLayer).type_specific.colors.length > 1
                          ? `linear-gradient(${(layer as BackgroundFillLayer).type_specific.angle || 135}deg, ${(layer as BackgroundFillLayer).type_specific.colors[0]}, ${(layer as BackgroundFillLayer).type_specific.colors[1]})`
                          : (layer as BackgroundFillLayer).type_specific.colors[0] || scene.canvas.background_color || '#0f172a',
                    }}
                    className="w-full h-full"
                  />
                )}

                {/* Shape Layer */}
                {layer.type === 'shape' && (
                  <div
                    style={{
                      width: '100%',
                      height: '100%',
                      backgroundColor: (layer as ShapeLayer).type_specific.fill_color || '#334155',
                      borderRadius:
                        (layer as ShapeLayer).type_specific.shape_type === 'pill'
                          ? '9999px'
                          : (layer as ShapeLayer).type_specific.shape_type === 'ellipse'
                          ? '50%'
                          : `${layer.style?.border_radius || 0}px`,
                      border: stroke && stroke.enabled ? `${stroke.width}px solid ${stroke.color}` : 'none',
                    }}
                  />
                )}

                {/* Image Layer */}
                {layer.type === 'image' && (
                  <div
                    style={{
                      width: '100%',
                      height: '100%',
                      borderRadius:
                        (layer as ImageLayer).type_specific.mask_shape === 'circle'
                          ? '50%'
                          : `${layer.style?.border_radius || 12}px`,
                      overflow: 'hidden',
                      border: stroke && stroke.enabled ? `${stroke.width}px solid ${stroke.color}` : 'none',
                    }}
                    className="relative"
                  >
                    <img
                      src={(layer as ImageLayer).type_specific.image_url}
                      alt={layer.name}
                      className="w-full h-full object-cover pointer-events-none select-none"
                    />
                  </div>
                )}

                {/* Text Layer */}
                {layer.type === 'text' && (
                  <div className="w-full h-full flex flex-col justify-start">
                    {isInlineEditing ? (
                      <textarea
                        autoFocus
                        value={inlineTextVal}
                        onChange={(e) => setInlineTextVal(e.target.value)}
                        onBlur={commitInlineTextEdit}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter' && !e.shiftKey) {
                            e.preventDefault();
                            commitInlineTextEdit();
                          }
                        }}
                        style={{
                          fontFamily: (layer as TextLayer).type_specific.font_family,
                          fontSize: `${(layer as TextLayer).type_specific.font_size}px`,
                          fontWeight: (layer as TextLayer).type_specific.font_weight,
                          color: (layer as TextLayer).type_specific.color,
                          textAlign: (layer as TextLayer).type_specific.alignment,
                          lineHeight: (layer as TextLayer).type_specific.line_height || 1.15,
                          letterSpacing: `${(layer as TextLayer).type_specific.letter_spacing || 0}px`,
                        }}
                        className="w-full h-full bg-black/40 border border-sky-400 p-1 resize-none rounded outline-none"
                      />
                    ) : (
                      <div
                        style={{
                          fontFamily: (layer as TextLayer).type_specific.font_family,
                          fontSize: `${(layer as TextLayer).type_specific.font_size}px`,
                          fontWeight: (layer as TextLayer).type_specific.font_weight,
                          color: (layer as TextLayer).type_specific.color,
                          textAlign: (layer as TextLayer).type_specific.alignment,
                          lineHeight: (layer as TextLayer).type_specific.line_height || 1.15,
                          letterSpacing: `${(layer as TextLayer).type_specific.letter_spacing || 0}px`,
                          WebkitTextStroke: stroke && stroke.enabled ? `${stroke.width}px ${stroke.color}` : 'none',
                        }}
                        className="whitespace-pre-wrap select-none"
                      >
                        {(layer as TextLayer).type_specific.content}
                      </div>
                    )}
                  </div>
                )}

                {/* Warning badge if low confidence / failure flags */}
                {layer.source?.warning_flags && layer.source.warning_flags.length > 0 && (
                  <div className="absolute -top-3 -right-3 z-30 flex items-center gap-1 bg-amber-500/90 text-neutral-950 font-bold text-[10px] px-1.5 py-0.5 rounded shadow pointer-events-none">
                    ⚠️ {layer.source.warning_flags.length}
                  </div>
                )}
              </div>
            );
          })}
        </div>

        {/* Selected Layer Handles Overlay (Rendered at scaled zoom level) */}
        {selectedLayer && !selectedLayer.locked && (
          <div
            style={{
              position: 'absolute',
              left: `${selectedLayer.transform.x * zoom}px`,
              top: `${selectedLayer.transform.y * zoom}px`,
              width: `${selectedLayer.transform.width * zoom}px`,
              height: `${selectedLayer.transform.height * zoom}px`,
              transform: `rotate(${selectedLayer.transform.rotation || 0}deg)`,
              pointerEvents: 'none',
            }}
            className="border-2 border-sky-400 z-50"
          >
            {/* Rotation Handle Pin */}
            <div
              onMouseDown={(e) => handleHandleMouseDown(e, 'rotate')}
              style={{
                position: 'absolute',
                top: '-26px',
                left: '50%',
                transform: 'translateX(-50%)',
                pointerEvents: 'auto',
              }}
              className="w-4 h-4 bg-sky-400 rounded-full border-2 border-neutral-950 cursor-grab active:cursor-grabbing shadow flex items-center justify-center"
              title="Drag to rotate"
            >
              <div className="w-1.5 h-1.5 bg-neutral-950 rounded-full" />
            </div>
            {/* Connecting line to rotate handle */}
            <div
              style={{
                position: 'absolute',
                top: '-18px',
                left: '50%',
                transform: 'translateX(-50%)',
              }}
              className="w-0.5 h-4 bg-sky-400 pointer-events-none"
            />

            {/* 8 Resize Handles */}
            {(['nw', 'n', 'ne', 'e', 'se', 's', 'sw', 'w'] as HandleType[]).map((handle) => {
              let posClass = '';
              let cursorClass = '';

              switch (handle) {
                case 'nw': posClass = '-top-1.5 -left-1.5'; cursorClass = 'cursor-nwse-resize'; break;
                case 'n': posClass = '-top-1.5 left-1/2 -translate-x-1/2'; cursorClass = 'cursor-ns-resize'; break;
                case 'ne': posClass = '-top-1.5 -right-1.5'; cursorClass = 'cursor-nesw-resize'; break;
                case 'e': posClass = 'top-1/2 -right-1.5 -translate-y-1/2'; cursorClass = 'cursor-ew-resize'; break;
                case 'se': posClass = '-bottom-1.5 -right-1.5'; cursorClass = 'cursor-nwse-resize'; break;
                case 's': posClass = '-bottom-1.5 left-1/2 -translate-x-1/2'; cursorClass = 'cursor-ns-resize'; break;
                case 'sw': posClass = '-bottom-1.5 -left-1.5'; cursorClass = 'cursor-nesw-resize'; break;
                case 'w': posClass = 'top-1/2 -left-1.5 -translate-y-1/2'; cursorClass = 'cursor-ew-resize'; break;
              }

              return (
                <div
                  key={handle}
                  onMouseDown={(e) => handleHandleMouseDown(e, handle)}
                  style={{ pointerEvents: 'auto' }}
                  className={`absolute w-3 h-3 bg-neutral-950 border-2 border-sky-400 rounded-sm shadow ${posClass} ${cursorClass}`}
                />
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
};
