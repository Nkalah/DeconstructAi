import React from 'react';
import { 
  Layer, 
  TextLayer, 
  ImageLayer, 
  ShapeLayer, 
  IconLayer,
  BackgroundFillLayer, 
  MutationOperation 
} from '../types/sceneGraph';
import { CURATED_POSTER_FONTS } from '../lib/fontCatalog';
import { TextLayerProperties } from './TextLayerProperties';
import { QrCodeProperties } from './QrCodeProperties';
import type { TextStyleClipboard } from '../types/sceneGraph';
import { 
  AlignLeft, 
  AlignCenter, 
  AlignRight, 
  Upload, 
  Sliders, 
  Type, 
  Sparkles, 
  Check, 
  AlertCircle 
} from 'lucide-react';

interface PropertyInspectorProps {
  selectedLayer: Layer | null;
  onExecuteMutation: (op: MutationOperation) => void;
  onCopyTextStyle: (style: TextStyleClipboard) => void;
  onPasteTextStyle: (layer: TextLayer) => void;
  canPasteTextStyle: boolean;
  canResetTextToOriginal: boolean;
  onResetTextToOriginal: (layerId: string) => void;
}

const getTextLayer = (layer: Layer): TextLayer | null => layer.type === 'text' ? layer : null;

export const PropertyInspector: React.FC<PropertyInspectorProps> = ({
  selectedLayer,
  onExecuteMutation,
  onCopyTextStyle,
  onPasteTextStyle,
  canPasteTextStyle,
  canResetTextToOriginal,
  onResetTextToOriginal
}) => {
  if (!selectedLayer) {
    return (
      <div className="w-80 bg-neutral-900/90 border-l border-neutral-800 p-6 flex flex-col items-center justify-center text-center text-neutral-500 select-none">
        <Sliders className="w-8 h-8 mb-2 opacity-40" />
        <p className="text-sm font-medium text-neutral-400">No element selected</p>
        <p className="text-xs text-neutral-500 mt-1">
          Click any text, photo, shape, or background layer on the canvas or layer list to edit its properties.
        </p>
      </div>
    );
  }

  // Effect toggles
  const effects = selectedLayer.style?.effects || {
    shadow: { enabled: false, offset_x: 0, offset_y: 4, blur: 8, color: '#000000', opacity: 0.35 },
    stroke: { enabled: false, width: 2, color: '#000000' }
  };

  const handleUpdateShadow = (patch: Partial<typeof effects.shadow>) => {
    onExecuteMutation({
      type: 'set_effect',
      layer_id: selectedLayer.id,
      params: { shadow: patch }
    });
  };

  const handleUpdateStroke = (patch: Partial<typeof effects.stroke>) => {
    onExecuteMutation({
      type: 'set_effect',
      layer_id: selectedLayer.id,
      params: { stroke: patch }
    });
  };

  const handleUpdateOpacity = (val: number) => {
    onExecuteMutation({
      type: 'set_effect',
      layer_id: selectedLayer.id,
      params: { opacity: val }
    });
  };

  // Image replacement file input handler
  const handleImageUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      const reader = new FileReader();
      reader.onload = (event) => {
        const dataUrl = event.target?.result as string;
        onExecuteMutation({
          type: 'replace_image',
          layer_id: selectedLayer.id,
          params: { image_url: dataUrl }
        });
      };
      reader.readAsDataURL(file);
    }
  };

  const textLayer = getTextLayer(selectedLayer);
  if (textLayer) {
    return (
      <div className="w-80 border-l border-neutral-800 bg-neutral-900/90 text-xs text-neutral-100">
        <div className="border-b border-neutral-800 p-3.5">
          <div className="flex items-center justify-between">
            <span className="text-sm font-semibold text-neutral-200">{textLayer.name}</span>
            <span className="rounded bg-neutral-800 px-2 py-0.5 font-mono text-[10px] uppercase text-neutral-400">text</span>
          </div>
          <div className="mt-1 flex items-center gap-2 text-[11px] text-neutral-400">
            <span>Confidence:</span>
            <span className="font-mono font-medium text-emerald-400">{Math.round(textLayer.source.detection_confidence * 100)}%</span>
          </div>
        </div>
        <div className="max-h-[calc(100vh-8rem)] overflow-y-auto">
          <TextLayerProperties
            layer={textLayer}
            onExecuteMutation={onExecuteMutation}
            onCopyStyle={onCopyTextStyle}
            onPasteStyle={onPasteTextStyle}
            canPasteStyle={canPasteTextStyle}
            canResetToOriginal={canResetTextToOriginal}
            onResetToOriginal={onResetTextToOriginal}
          />
        </div>
      </div>
    );
  }

  return (
    <div className="w-80 bg-neutral-900/90 border-l border-neutral-800 flex flex-col h-full overflow-y-auto select-none divide-y divide-neutral-800/60 text-xs">
      {/* Title & Metadata */}
      <div className="p-3.5 space-y-1">
        <div className="flex items-center justify-between">
          <span className="font-semibold text-neutral-200 text-sm">{selectedLayer.name}</span>
          <span className="text-[10px] bg-neutral-800 text-neutral-400 px-2 py-0.5 rounded font-mono uppercase">
            {selectedLayer.type}
          </span>
        </div>

        <div className="flex items-center gap-2 text-[11px] text-neutral-400">
          <span>Confidence:</span>
          <span className="font-mono text-emerald-400 font-medium">
            {Math.round((selectedLayer.source?.detection_confidence || 1) * 100)}%
          </span>
          {selectedLayer.source?.warning_flags && selectedLayer.source.warning_flags.length > 0 && (
            <span className="text-amber-400 flex items-center gap-0.5">
              <AlertCircle className="w-3 h-3" />
              {selectedLayer.source.warning_flags.join(', ')}
            </span>
          )}
        </div>
      </div>

      {selectedLayer.type === 'icon' && selectedLayer.type_specific.icon_name === 'qr-code' && (
        <QrCodeProperties
          layer={selectedLayer as IconLayer}
          onExecuteMutation={onExecuteMutation}
        />
      )}

      {/* ---------------- TEXT PROPERTIES ---------------- */}
      {selectedLayer.type === 'text' && (
        <div className="p-3.5 space-y-3">
          <span className="font-semibold text-[11px] text-neutral-400 uppercase tracking-wider block">
            Text Content & Typography
          </span>

          {/* Text Area */}
          <div>
            <label className="text-[11px] text-neutral-400 mb-1 block">Content</label>
            <textarea
              rows={3}
              value={(selectedLayer as TextLayer).type_specific.content}
              onChange={(e) =>
                onExecuteMutation({
                  type: 'update_text',
                  layer_id: selectedLayer.id,
                  params: { content: e.target.value }
                })
              }
              className="w-full bg-neutral-950 border border-neutral-800 rounded p-2 text-neutral-100 focus:border-sky-500 outline-none text-xs"
            />
          </div>

          {/* Matched Font Candidates Pill Selector */}
          {(selectedLayer as TextLayer).type_specific.candidate_fonts && (
            <div>
              <label className="text-[11px] text-neutral-400 mb-1 block flex items-center gap-1">
                <Sparkles className="w-3 h-3 text-sky-400" />
                <span>AI Matched Font Candidates</span>
              </label>
              <div className="space-y-1">
                {(selectedLayer as TextLayer).type_specific.candidate_fonts?.map((fc) => {
                  const isActive = (selectedLayer as TextLayer).type_specific.font_family === fc.family;
                  return (
                    <button
                      key={fc.family}
                      onClick={() =>
                        onExecuteMutation({
                          type: 'update_text',
                          layer_id: selectedLayer.id,
                          params: { font_family: fc.family }
                        })
                      }
                      className={`w-full flex items-center justify-between px-2 py-1.5 rounded border text-left transition ${
                        isActive
                          ? 'bg-sky-500/15 border-sky-500/50 text-sky-200'
                          : 'bg-neutral-950/60 border-neutral-800 text-neutral-400 hover:text-neutral-200 hover:border-neutral-700'
                      }`}
                    >
                      <span className="font-medium text-[11px]">{fc.family}</span>
                      <div className="flex items-center gap-1 text-[10px] text-neutral-500">
                        <span>{Math.round(fc.confidence * 100)}% match</span>
                        {isActive && <Check className="w-3 h-3 text-sky-400 ml-1" />}
                      </div>
                    </button>
                  );
                })}
              </div>
            </div>
          )}

          {/* Font Family Dropdown */}
          <div>
            <label className="text-[11px] text-neutral-400 mb-1 block">Font Family</label>
            <select
              value={(selectedLayer as TextLayer).type_specific.font_family}
              onChange={(e) =>
                onExecuteMutation({
                  type: 'update_text',
                  layer_id: selectedLayer.id,
                  params: { font_family: e.target.value }
                })
              }
              className="w-full bg-neutral-950 border border-neutral-800 rounded px-2.5 py-1.5 text-neutral-100 focus:border-sky-500 outline-none"
            >
              {CURATED_POSTER_FONTS.map((font) => (
                <option key={font.family} value={font.family}>
                  {font.family} ({font.category})
                </option>
              ))}
            </select>
          </div>

          {/* Size & Weight */}
          <div className="grid grid-cols-2 gap-2">
            <div>
              <label className="text-[11px] text-neutral-400 mb-1 block">Font Size (px)</label>
              <input
                type="number"
                min={8}
                max={200}
                value={(selectedLayer as TextLayer).type_specific.font_size}
                onChange={(e) =>
                  onExecuteMutation({
                    type: 'update_text',
                    layer_id: selectedLayer.id,
                    params: { font_size: Number(e.target.value) }
                  })
                }
                className="w-full bg-neutral-950 border border-neutral-800 rounded px-2 py-1.5 text-neutral-100 focus:border-sky-500 outline-none"
              />
            </div>
            <div>
              <label className="text-[11px] text-neutral-400 mb-1 block">Weight</label>
              <select
                value={(selectedLayer as TextLayer).type_specific.font_weight}
                onChange={(e) =>
                  onExecuteMutation({
                    type: 'update_text',
                    layer_id: selectedLayer.id,
                    params: { font_weight: e.target.value }
                  })
                }
                className="w-full bg-neutral-950 border border-neutral-800 rounded px-2 py-1.5 text-neutral-100 focus:border-sky-500 outline-none"
              >
                <option value="400">Regular (400)</option>
                <option value="500">Medium (500)</option>
                <option value="600">SemiBold (600)</option>
                <option value="700">Bold (700)</option>
                <option value="900">Black (900)</option>
              </select>
            </div>
          </div>

          {/* Color & Alignment */}
          <div className="flex items-center justify-between gap-2 pt-1">
            <div>
              <label className="text-[11px] text-neutral-400 mb-1 block">Text Color</label>
              <div className="flex items-center gap-2">
                <input
                  type="color"
                  value={(selectedLayer as TextLayer).type_specific.color}
                  onChange={(e) =>
                    onExecuteMutation({
                      type: 'set_color',
                      layer_id: selectedLayer.id,
                      params: { color: e.target.value }
                    })
                  }
                  className="w-8 h-8 rounded border border-neutral-700 cursor-pointer bg-transparent"
                />
                <span className="font-mono text-neutral-300">
                  {(selectedLayer as TextLayer).type_specific.color}
                </span>
              </div>
            </div>

            <div>
              <label className="text-[11px] text-neutral-400 mb-1 block">Alignment</label>
              <div className="flex border border-neutral-800 rounded overflow-hidden">
                <button
                  onClick={() =>
                    onExecuteMutation({
                      type: 'update_text',
                      layer_id: selectedLayer.id,
                      params: { alignment: 'left' }
                    })
                  }
                  className={`p-1.5 ${
                    (selectedLayer as TextLayer).type_specific.alignment === 'left'
                      ? 'bg-sky-500/20 text-sky-400'
                      : 'bg-neutral-950 text-neutral-400 hover:text-neutral-200'
                  }`}
                  title="Align Left"
                >
                  <AlignLeft className="w-3.5 h-3.5" />
                </button>
                <button
                  onClick={() =>
                    onExecuteMutation({
                      type: 'update_text',
                      layer_id: selectedLayer.id,
                      params: { alignment: 'center' }
                    })
                  }
                  className={`p-1.5 ${
                    (selectedLayer as TextLayer).type_specific.alignment === 'center'
                      ? 'bg-sky-500/20 text-sky-400'
                      : 'bg-neutral-950 text-neutral-400 hover:text-neutral-200'
                  }`}
                  title="Align Center"
                >
                  <AlignCenter className="w-3.5 h-3.5" />
                </button>
                <button
                  onClick={() =>
                    onExecuteMutation({
                      type: 'update_text',
                      layer_id: selectedLayer.id,
                      params: { alignment: 'right' }
                    })
                  }
                  className={`p-1.5 ${
                    (selectedLayer as TextLayer).type_specific.alignment === 'right'
                      ? 'bg-sky-500/20 text-sky-400'
                      : 'bg-neutral-950 text-neutral-400 hover:text-neutral-200'
                  }`}
                  title="Align Right"
                >
                  <AlignRight className="w-3.5 h-3.5" />
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ---------------- IMAGE / PHOTO PROPERTIES ---------------- */}
      {selectedLayer.type === 'image' && (
        <div className="p-3.5 space-y-3">
          <span className="font-semibold text-[11px] text-neutral-400 uppercase tracking-wider block">
            Replaceable Image / Mask
          </span>

          {/* Current Image Preview */}
          <div className="w-full h-32 bg-neutral-950 border border-neutral-800 rounded-lg overflow-hidden flex items-center justify-center p-2 relative">
            <img
              src={(selectedLayer as ImageLayer).type_specific.image_url}
              alt="Preview"
              className="max-h-full object-contain rounded"
            />
          </div>

          {/* Replace Image Button (File upload) */}
          <div>
            <label className="flex items-center justify-center gap-2 w-full bg-sky-500/10 hover:bg-sky-500/20 border border-sky-500/30 text-sky-400 py-2 rounded font-medium cursor-pointer transition">
              <Upload className="w-4 h-4" />
              <span>Replace With Uploaded Image</span>
              <input
                type="file"
                accept="image/*"
                onChange={handleImageUpload}
                className="hidden"
              />
            </label>
            <p className="text-[10px] text-neutral-500 mt-1 text-center">
              Auto-fits into existing region mask shape and crop bounds.
            </p>
          </div>

          {/* Mask Shape */}
          <div>
            <label className="text-[11px] text-neutral-400 mb-1 block">Mask Shape</label>
            <select
              value={(selectedLayer as ImageLayer).type_specific.mask_shape}
              onChange={(e) =>
                onExecuteMutation({
                  type: 'replace_image',
                  layer_id: selectedLayer.id,
                  params: { 
                    image_url: (selectedLayer as ImageLayer).type_specific.image_url,
                    mask_shape: e.target.value 
                  }
                })
              }
              className="w-full bg-neutral-950 border border-neutral-800 rounded px-2.5 py-1.5 text-neutral-100 focus:border-sky-500 outline-none"
            >
              <option value="rounded_rect">Rounded Rectangle</option>
              <option value="circle">Circular Avatar Mask</option>
              <option value="rect">Sharp Rectangle</option>
            </select>
          </div>
        </div>
      )}

      {/* ---------------- SHAPE PROPERTIES ---------------- */}
      {selectedLayer.type === 'shape' && (
        <div className="p-3.5 space-y-3">
          <span className="font-semibold text-[11px] text-neutral-400 uppercase tracking-wider block">
            Shape Style
          </span>

          {/* Shape Type */}
          <div>
            <label className="text-[11px] text-neutral-400 mb-1 block">Geometry Type</label>
            <span className="font-mono text-neutral-300 capitalize">
              {(selectedLayer as ShapeLayer).type_specific.shape_type}
            </span>
          </div>

          {/* Fill Color */}
          <div>
            <label className="text-[11px] text-neutral-400 mb-1 block">Fill Color</label>
            <div className="flex items-center gap-2">
              <input
                type="color"
                value={(selectedLayer as ShapeLayer).type_specific.fill_color}
                onChange={(e) =>
                  onExecuteMutation({
                    type: 'set_color',
                    layer_id: selectedLayer.id,
                    params: { color: e.target.value }
                  })
                }
                className="w-8 h-8 rounded border border-neutral-700 cursor-pointer bg-transparent"
              />
              <span className="font-mono text-neutral-300">
                {(selectedLayer as ShapeLayer).type_specific.fill_color}
              </span>
            </div>
          </div>
        </div>
      )}

      {/* ---------------- BACKGROUND FILL PROPERTIES ---------------- */}
      {selectedLayer.type === 'background_fill' && (
        <div className="p-3.5 space-y-3">
          <span className="font-semibold text-[11px] text-neutral-400 uppercase tracking-wider block">
            Reconstructed Background
          </span>

          <div>
            <label className="text-[11px] text-neutral-400 mb-1 block">Fill Type</label>
            <span className="font-mono text-neutral-300 capitalize">
              {(selectedLayer as BackgroundFillLayer).type_specific.fill_type.replace('_', ' ')}
            </span>
          </div>

          {/* Background Colors */}
          <div>
            <label className="text-[11px] text-neutral-400 mb-1 block">Primary Fill Color</label>
            <div className="flex items-center gap-2">
              <input
                type="color"
                value={(selectedLayer as BackgroundFillLayer).type_specific.colors[0] || '#0f172a'}
                onChange={(e) =>
                  onExecuteMutation({
                    type: 'set_color',
                    layer_id: selectedLayer.id,
                    params: { color: e.target.value }
                  })
                }
                className="w-8 h-8 rounded border border-neutral-700 cursor-pointer bg-transparent"
              />
              <span className="font-mono text-neutral-300">
                {(selectedLayer as BackgroundFillLayer).type_specific.colors[0] || '#0f172a'}
              </span>
            </div>
          </div>

          {(selectedLayer as BackgroundFillLayer).type_specific.colors.length > 1 && (
            <div>
              <label className="text-[11px] text-neutral-400 mb-1 block">Secondary Color</label>
              <div className="flex items-center gap-2">
                <input
                  type="color"
                  value={(selectedLayer as BackgroundFillLayer).type_specific.colors[1]}
                  onChange={(e) => {
                    const nextColors = [(selectedLayer as BackgroundFillLayer).type_specific.colors[0], e.target.value];
                    (selectedLayer as BackgroundFillLayer).type_specific.colors = nextColors;
                    onExecuteMutation({
                      type: 'set_effect',
                      layer_id: selectedLayer.id,
                      params: {}
                    });
                  }}
                  className="w-8 h-8 rounded border border-neutral-700 cursor-pointer bg-transparent"
                />
                <span className="font-mono text-neutral-300">
                  {(selectedLayer as BackgroundFillLayer).type_specific.colors[1]}
                </span>
              </div>
            </div>
          )}

          <div className="bg-neutral-950 p-2 rounded text-[11px] text-neutral-400 border border-neutral-800">
            ✓ Inpainting inference cached. Any layers placed above this background blend seamlessly.
          </div>
        </div>
      )}

      {/* ---------------- EFFECTS: SHADOW & STROKE & OPACITY ---------------- */}
      {selectedLayer.type !== 'background_fill' && (
        <div className="p-3.5 space-y-3">
          <span className="font-semibold text-[11px] text-neutral-400 uppercase tracking-wider block">
            Effects &amp; Styling
          </span>

          {/* Drop Shadow Section */}
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <label className="text-[11px] text-neutral-300 font-medium">Drop Shadow</label>
              <input
                type="checkbox"
                checked={effects.shadow?.enabled || false}
                onChange={(e) => handleUpdateShadow({ enabled: e.target.checked })}
                className="rounded accent-sky-500 cursor-pointer"
              />
            </div>

            {effects.shadow?.enabled && (
              <div className="space-y-2 pl-2 border-l border-neutral-800 mt-2">
                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <label className="text-[10px] text-neutral-400">Blur ({effects.shadow.blur}px)</label>
                    <input
                      type="range"
                      min={0}
                      max={40}
                      value={effects.shadow.blur}
                      onChange={(e) => handleUpdateShadow({ blur: Number(e.target.value) })}
                      className="w-full accent-sky-500"
                    />
                  </div>
                  <div>
                    <label className="text-[10px] text-neutral-400">Y Offset ({effects.shadow.offset_y}px)</label>
                    <input
                      type="range"
                      min={-20}
                      max={40}
                      value={effects.shadow.offset_y}
                      onChange={(e) => handleUpdateShadow({ offset_y: Number(e.target.value) })}
                      className="w-full accent-sky-500"
                    />
                  </div>
                </div>

                <div className="flex items-center gap-2">
                  <input
                    type="color"
                    value={effects.shadow.color || '#000000'}
                    onChange={(e) => handleUpdateShadow({ color: e.target.value })}
                    className="w-6 h-6 rounded border border-neutral-700 bg-transparent cursor-pointer"
                  />
                  <span className="font-mono text-[10px] text-neutral-400">
                    Shadow color ({effects.shadow.color})
                  </span>
                </div>
              </div>
            )}
          </div>

          {/* Stroke / Outline */}
          <div className="space-y-2 pt-2 border-t border-neutral-800">
            <div className="flex items-center justify-between">
              <label className="text-[11px] text-neutral-300 font-medium">Stroke / Border</label>
              <input
                type="checkbox"
                checked={effects.stroke?.enabled || false}
                onChange={(e) => handleUpdateStroke({ enabled: e.target.checked })}
                className="rounded accent-sky-500 cursor-pointer"
              />
            </div>

            {effects.stroke?.enabled && (
              <div className="space-y-2 pl-2 border-l border-neutral-800 mt-2">
                <div>
                  <label className="text-[10px] text-neutral-400">Width ({effects.stroke.width}px)</label>
                  <input
                    type="range"
                    min={1}
                    max={20}
                    value={effects.stroke.width}
                    onChange={(e) => handleUpdateStroke({ width: Number(e.target.value) })}
                    className="w-full accent-sky-500"
                  />
                </div>
                <div className="flex items-center gap-2">
                  <input
                    type="color"
                    value={effects.stroke.color || '#ffffff'}
                    onChange={(e) => handleUpdateStroke({ color: e.target.value })}
                    className="w-6 h-6 rounded border border-neutral-700 bg-transparent cursor-pointer"
                  />
                  <span className="font-mono text-[10px] text-neutral-400">
                    Stroke color ({effects.stroke.color})
                  </span>
                </div>
              </div>
            )}
          </div>

          {/* Opacity Slider */}
          <div className="space-y-1 pt-2 border-t border-neutral-800">
            <div className="flex justify-between text-[11px]">
              <label className="text-neutral-400">Layer Opacity</label>
              <span className="font-mono text-neutral-300">
                {Math.round((selectedLayer.opacity ?? 1) * 100)}%
              </span>
            </div>
            <input
              type="range"
              min={0}
              max={1}
              step={0.05}
              value={selectedLayer.opacity ?? 1}
              onChange={(e) => handleUpdateOpacity(Number(e.target.value))}
              className="w-full accent-sky-500"
            />
          </div>
        </div>
      )}
    </div>
  );
};
