import React, { useEffect, useRef, useState } from 'react';
import {
  AlignCenter,
  AlignJustify,
  AlignLeft,
  AlignRight,
  AlertTriangle,
  Clipboard,
  ClipboardPaste,
  RotateCcw,
  Sparkles
} from 'lucide-react';
import { CURATED_POSTER_FONTS } from '../lib/fontCatalog';
import type { MutationOperation, TextLayer, TextStyleClipboard } from '../types/sceneGraph';

interface TextLayerPropertiesProps {
  layer: TextLayer;
  onExecuteMutation: (operation: MutationOperation) => void;
  onCopyStyle: (style: TextStyleClipboard) => void;
  onPasteStyle: (layer: TextLayer) => void;
  canPasteStyle: boolean;
  canResetToOriginal: boolean;
  onResetToOriginal: (layerId: string) => void;
}

const controlClass = 'min-h-11 w-full rounded border border-neutral-700 bg-neutral-950 px-2.5 text-sm text-neutral-100 outline-none focus:border-sky-500';

export const TextLayerProperties: React.FC<TextLayerPropertiesProps> = ({
  layer,
  onExecuteMutation,
  onCopyStyle,
  onPasteStyle,
  canPasteStyle,
  canResetToOriginal,
  onResetToOriginal
}) => {
  const text = layer.type_specific;
  const editorRef = useRef<HTMLTextAreaElement>(null);
  const [contentDraft, setContentDraft] = useState(text.content);
  const uncertain = Boolean(text.uncertain || text.font_family_confidence < 0.75);
  const hasFontAlternatives = Boolean(text.candidate_fonts?.length)
    && (uncertain || text.font_family_confidence < 0.75);

  useEffect(() => setContentDraft(text.content), [layer.id, text.content]);

  const updateText = (params: Record<string, unknown>) => {
    onExecuteMutation({ type: 'update_text', layer_id: layer.id, params });
  };
  const updateEffect = (params: Record<string, unknown>) => {
    onExecuteMutation({ type: 'set_effect', layer_id: layer.id, params });
  };
  const updateRotation = (rotation: number) => {
    onExecuteMutation({
      type: 'update_transform',
      layer_id: layer.id,
      params: { transform: { rotation } }
    });
  };
  const focusTextEditor = () => {
    editorRef.current?.focus();
    editorRef.current?.select();
  };

  return (
    <div className="space-y-4 p-3.5">
      <h2 className="text-sm font-semibold text-neutral-100">Change text</h2>

      {uncertain && (
        <div className="space-y-2 rounded-lg border border-amber-500/40 bg-amber-500/10 p-3" role="status">
          <p className="flex items-center gap-2 font-semibold text-amber-200">
            <AlertTriangle className="h-4 w-4 shrink-0" />
            Check this text
          </p>
          <p className="text-xs leading-5 text-neutral-300">
            The text or font match may not be exact. Review it against your original poster.
          </p>
          <button
            type="button"
            onClick={focusTextEditor}
            className="min-h-11 w-full rounded bg-amber-400 px-3 font-semibold text-neutral-950"
          >
            Fix this text
          </button>
        </div>
      )}

      <div>
        <label htmlFor={`text-content-${layer.id}`} className="mb-1 block text-xs text-neutral-300">Text</label>
        <textarea
          ref={editorRef}
          id={`text-content-${layer.id}`}
          rows={3}
          dir={text.direction ?? 'auto'}
          value={contentDraft}
          onChange={(event) => setContentDraft(event.target.value)}
          onBlur={() => {
            if (contentDraft !== text.content) updateText({ content: contentDraft, uncertain: false });
          }}
          className={`${controlClass} min-h-20 resize-y py-2 [unicode-bidi:plaintext]`}
          aria-label="Change text"
        />
        <p className="mt-1 text-[11px] text-neutral-500">Unicode, emoji, and right-to-left text are supported.</p>
      </div>

      <section className="space-y-3 border-t border-neutral-800 pt-3">
        <h3 className="text-xs font-semibold text-neutral-300">Font</h3>
        {hasFontAlternatives && (
          <div className="rounded border border-sky-500/30 bg-sky-500/5 p-2">
            <p className="mb-2 flex items-center gap-1 text-xs text-sky-200">
              <Sparkles className="h-3.5 w-3.5" />
              Closest font matches
            </p>
            <div className="space-y-1">
              {text.candidate_fonts?.slice(0, 3).map((candidate) => (
                <button
                  key={candidate.family}
                  type="button"
                  onClick={() => updateText({ font_family: candidate.family, font_family_confidence: 1 })}
                  className="flex min-h-11 w-full items-center justify-between rounded px-2 text-left text-xs text-neutral-200 hover:bg-neutral-800"
                  style={{ fontFamily: candidate.family }}
                >
                  <span>{candidate.family}</span>
                  <span className="text-neutral-500">{Math.round(candidate.confidence * 100)}% match</span>
                </button>
              ))}
            </div>
          </div>
        )}

        <label htmlFor={`font-family-${layer.id}`} className="block text-xs text-neutral-400">Font family</label>
        <select
          id={`font-family-${layer.id}`}
          value={text.font_family}
          onChange={(event) => updateText({ font_family: event.target.value, font_family_confidence: 1 })}
          className={controlClass}
        >
          {CURATED_POSTER_FONTS.map((font) => (
            <option key={font.family} value={font.family} style={{ fontFamily: font.family }}>
              {font.family} · {font.category}
            </option>
          ))}
        </select>
        <div
          aria-label="Font preview"
          className="min-h-12 rounded border border-neutral-800 bg-neutral-950 p-2 text-neutral-100"
          style={{ fontFamily: text.font_family, fontWeight: text.font_weight, fontStyle: text.font_style }}
          dir={text.direction ?? 'auto'}
        >
          {contentDraft || 'Preview your text'}
        </div>

        <div className="grid grid-cols-2 gap-2">
          <label className="space-y-1 text-xs text-neutral-400">
            Size
            <input
              type="number"
              min={1}
              max={1000}
              value={text.font_size}
              onChange={(event) => updateText({ font_size: Number(event.target.value) })}
              className={controlClass}
              aria-label="Font size"
            />
          </label>
          <label className="space-y-1 text-xs text-neutral-400">
            Weight
            <select
              value={String(text.font_weight)}
              onChange={(event) => updateText({ font_weight: Number(event.target.value) })}
              className={controlClass}
              aria-label="Font weight"
            >
              {[300, 400, 500, 600, 700, 800, 900].map((weight) => (
                <option key={weight} value={weight}>{weight}</option>
              ))}
            </select>
          </label>
        </div>
        <label className="block space-y-1 text-xs text-neutral-400">
          Make bigger
          <input
            type="range"
            min={6}
            max={300}
            step={1}
            value={Math.max(6, Math.min(300, text.font_size))}
            onChange={(event) => updateText({ font_size: Number(event.target.value) })}
            className="min-h-11 w-full accent-sky-500"
            aria-label="Make bigger"
          />
        </label>
        <label className="block space-y-1 text-xs text-neutral-400">
          Font style
          <select
            value={text.font_style ?? 'normal'}
            onChange={(event) => updateText({ font_style: event.target.value })}
            className={controlClass}
          >
            <option value="normal">Regular</option>
            <option value="italic">Italic</option>
          </select>
        </label>
        <div className="grid grid-cols-2 gap-2">
          <label className="space-y-1 text-xs text-neutral-400">
            Line height
            <input
              type="number"
              min={0.5}
              max={5}
              step={0.1}
              value={text.line_height ?? 1.2}
              onChange={(event) => updateText({ line_height: Number(event.target.value) })}
              className={controlClass}
            />
          </label>
          <label className="space-y-1 text-xs text-neutral-400">
            Letter spacing
            <input
              type="number"
              min={-20}
              max={100}
              step={0.5}
              value={text.letter_spacing ?? 0}
              onChange={(event) => updateText({ letter_spacing: Number(event.target.value) })}
              className={controlClass}
            />
          </label>
        </div>
        <label className="block space-y-1 text-xs text-neutral-400">
          Text direction
          <select
            value={text.direction ?? 'auto'}
            onChange={(event) => updateText({ direction: event.target.value })}
            className={controlClass}
          >
            <option value="auto">Automatic</option>
            <option value="ltr">Left to right</option>
            <option value="rtl">Right to left</option>
          </select>
        </label>
        <div>
          <span className="mb-1 block text-xs text-neutral-400">Alignment</span>
          <div className="grid grid-cols-4 gap-1">
            {([
              ['left', AlignLeft, 'Align left'],
              ['center', AlignCenter, 'Align center'],
              ['right', AlignRight, 'Align right'],
              ['justify', AlignJustify, 'Justify']
            ] as const).map(([alignment, Icon, label]) => (
              <button
                key={alignment}
                type="button"
                aria-label={label}
                aria-pressed={text.alignment === alignment}
                onClick={() => updateText({ alignment })}
                className={`min-h-11 rounded border ${text.alignment === alignment ? 'border-sky-500 bg-sky-500/15 text-sky-200' : 'border-neutral-800 bg-neutral-950 text-neutral-400'}`}
              >
                <Icon className="mx-auto h-4 w-4" />
              </button>
            ))}
          </div>
        </div>
        <label className="flex min-h-11 items-center justify-between rounded border border-neutral-800 px-2 text-xs text-neutral-300">
          Text color
          <input
            type="color"
            value={text.color}
            onChange={(event) => onExecuteMutation({ type: 'set_color', layer_id: layer.id, params: { color: event.target.value } })}
            aria-label="Text color"
            className="h-9 w-12 cursor-pointer rounded border border-neutral-700 bg-transparent"
          />
        </label>
      </section>

      <section className="space-y-3 border-t border-neutral-800 pt-3">
        <h3 className="text-xs font-semibold text-neutral-300">Outline and shadow</h3>
        <label className="flex min-h-11 items-center justify-between text-xs text-neutral-300">
          Text outline
          <input
            type="checkbox"
            checked={layer.style.effects.stroke.enabled}
            onChange={(event) => updateEffect({ stroke: { enabled: event.target.checked } })}
            aria-label="Enable text outline"
          />
        </label>
        {layer.style.effects.stroke.enabled && (
          <div className="grid grid-cols-2 gap-2">
            <label className="space-y-1 text-xs text-neutral-400">
              Outline width
              <input
                type="number"
                min={0}
                max={50}
                value={layer.style.effects.stroke.width}
                onChange={(event) => updateEffect({ stroke: { width: Number(event.target.value) } })}
                className={controlClass}
              />
            </label>
            <label className="space-y-1 text-xs text-neutral-400">
              Outline color
              <input
                type="color"
                value={layer.style.effects.stroke.color}
                onChange={(event) => updateEffect({ stroke: { color: event.target.value } })}
                className="h-11 w-full rounded border border-neutral-700 bg-neutral-950"
              />
            </label>
          </div>
        )}
        <label className="flex min-h-11 items-center justify-between text-xs text-neutral-300">
          Drop shadow
          <input
            type="checkbox"
            checked={layer.style.effects.shadow.enabled}
            onChange={(event) => updateEffect({ shadow: { enabled: event.target.checked } })}
            aria-label="Enable text shadow"
          />
        </label>
        {layer.style.effects.shadow.enabled && (
          <div className="grid grid-cols-2 gap-2">
            <label className="space-y-1 text-xs text-neutral-400">
              Shadow blur
              <input
                type="number"
                min={0}
                max={100}
                value={layer.style.effects.shadow.blur}
                onChange={(event) => updateEffect({ shadow: { blur: Number(event.target.value) } })}
                className={controlClass}
              />
            </label>
            <label className="space-y-1 text-xs text-neutral-400">
              Vertical offset
              <input
                type="number"
                min={-100}
                max={100}
                value={layer.style.effects.shadow.offset_y}
                onChange={(event) => updateEffect({ shadow: { offset_y: Number(event.target.value) } })}
                className={controlClass}
              />
            </label>
            <label className="space-y-1 text-xs text-neutral-400">
              Shadow color
              <input
                type="color"
                value={layer.style.effects.shadow.color}
                onChange={(event) => updateEffect({ shadow: { color: event.target.value } })}
                className="h-11 w-full rounded border border-neutral-700 bg-neutral-950"
              />
            </label>
            <label className="space-y-1 text-xs text-neutral-400">
              Shadow opacity
              <input
                type="number"
                min={0}
                max={1}
                step={0.05}
                value={layer.style.effects.shadow.opacity}
                onChange={(event) => updateEffect({ shadow: { opacity: Number(event.target.value) } })}
                className={controlClass}
              />
            </label>
          </div>
        )}
        <div className="rounded border border-neutral-800 bg-neutral-950 p-2 text-xs text-neutral-400">
          Curved or warped text is not supported yet. Text remains editable; adjust its rotation and line spacing instead.
        </div>
      </section>

      <section className="space-y-3 border-t border-neutral-800 pt-3">
        <h3 className="text-xs font-semibold text-neutral-300">Position and style</h3>
        <label className="block space-y-1 text-xs text-neutral-400">
          Rotation
          <input
            type="number"
            min={-360}
            max={360}
            value={layer.transform.rotation}
            onChange={(event) => updateRotation(Number(event.target.value))}
            className={controlClass}
          />
        </label>
        <label className="block space-y-1 text-xs text-neutral-400">
          Opacity
          <input
            type="range"
            min={0}
            max={1}
            step={0.01}
            value={layer.opacity}
            onChange={(event) => updateEffect({ opacity: Number(event.target.value) })}
            className="min-h-11 w-full accent-sky-500"
          />
          <span>{Math.round(layer.opacity * 100)}%</span>
        </label>
        <div className="grid grid-cols-2 gap-2">
          <button
            type="button"
            onClick={() => onCopyStyle({
              font_family: text.font_family,
              font_size: text.font_size,
              font_weight: text.font_weight,
              font_style: text.font_style ?? 'normal',
              direction: text.direction ?? 'auto',
              line_height: text.line_height ?? 1.2,
              letter_spacing: text.letter_spacing ?? 0,
              alignment: text.alignment,
              color: text.color,
              rotation: layer.transform.rotation,
              opacity: layer.opacity,
              stroke: { ...layer.style.effects.stroke },
              shadow: { ...layer.style.effects.shadow }
            })}
            className="flex min-h-11 items-center justify-center gap-2 rounded border border-neutral-700 text-xs text-neutral-200 hover:bg-neutral-800"
          >
            <Clipboard className="h-4 w-4" /> Copy style
          </button>
          <button
            type="button"
            disabled={!canPasteStyle}
            onClick={() => onPasteStyle(layer)}
            className="flex min-h-11 items-center justify-center gap-2 rounded border border-neutral-700 text-xs text-neutral-200 hover:bg-neutral-800 disabled:opacity-40"
          >
            <ClipboardPaste className="h-4 w-4" /> Paste style
          </button>
        </div>
        <button
          type="button"
          disabled={!canResetToOriginal}
          onClick={() => onResetToOriginal(layer.id)}
          className="flex min-h-11 w-full items-center justify-center gap-2 rounded border border-neutral-700 text-xs text-neutral-200 hover:bg-neutral-800 disabled:opacity-40"
        >
          <RotateCcw className="h-4 w-4" /> Reset to reconstructed original
        </button>
      </section>
    </div>
  );
};
