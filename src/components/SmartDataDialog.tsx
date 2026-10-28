import React, { useMemo, useState } from 'react';
import { X } from 'lucide-react';
import type { DesignDocument, TextDesignLayer } from '../core/schema/designDocument';
import type { MutationOperation } from '../types/sceneGraph';
import { detectSmartData, matchesForBulkAction, replaceSmartDataMatches, type SmartDataKind } from '../lib/smartData';

type BulkAction = 'phone' | 'email' | 'url';

interface SmartDataDialogProps {
  document: DesignDocument;
  onClose: () => void;
  onExecuteMutation: (operation: MutationOperation) => void;
}

const ACTION_LABELS: Record<BulkAction, string> = {
  phone: 'Replace all phone numbers',
  email: 'Replace all emails',
  url: 'Replace all URLs / handles'
};

const KIND_LABELS: Record<SmartDataKind, string> = {
  phone: 'Phone',
  email: 'Email',
  url: 'URL',
  handle: 'Social handle',
  price: 'Price',
  date: 'Date',
  address: 'Address'
};

export const SmartDataDialog: React.FC<SmartDataDialogProps> = ({ document, onClose, onExecuteMutation }) => {
  const textLayers = document.layers.filter((layer): layer is TextDesignLayer => layer.type === 'text');
  const detections = useMemo(() => textLayers.flatMap((layer) => detectSmartData(layer.text).map((match) => ({
    ...match,
    layerId: layer.id,
    layerName: layer.name
  }))), [textLayers]);
  const counts = useMemo(() => detections.reduce<Record<SmartDataKind, number>>((totals, match) => {
    totals[match.kind] += 1;
    return totals;
  }, { phone: 0, email: 0, url: 0, handle: 0, price: 0, date: 0, address: 0 }), [detections]);
  const [action, setAction] = useState<BulkAction | null>(null);
  const [replacement, setReplacement] = useState<string | null>(null);
  const matches = action ? matchesForBulkAction(detections, action) : [];
  const replacementPreview = replacement ?? '';

  const confirm = () => {
    if (!action || replacement === null || !matches.length) return;
    const byLayer = new Map<string, typeof matches>();
    for (const match of matches) {
      const current = byLayer.get(match.layerId) ?? [];
      current.push(match);
      byLayer.set(match.layerId, current);
    }
    const mutations = Array.from(byLayer, ([layerId, layerMatches]) => {
      const layer = textLayers.find((item) => item.id === layerId);
      if (!layer) return null;
      const nextContent = replaceSmartDataMatches(layer.text, layerMatches, replacementPreview);
      return { type: 'update_text' as const, layer_id: layerId, params: { content: nextContent, uncertain: false } };
    }).filter((mutation): mutation is NonNullable<typeof mutation> => Boolean(mutation));
    if (!mutations.length) return;
    onExecuteMutation({
      type: 'batch_mutation',
      params: { mutations },
      description: ACTION_LABELS[action]
    });
    onClose();
  };

  return (
    <div className="fixed inset-0 z-[70] flex items-center justify-center bg-black/70 p-4" role="dialog" aria-modal="true" aria-labelledby="smart-data-title">
      <section className="flex max-h-[90vh] w-full max-w-3xl flex-col overflow-hidden rounded-xl border border-neutral-700 bg-neutral-900 shadow-2xl">
        <header className="flex items-center justify-between border-b border-neutral-800 p-4">
          <div>
            <h2 id="smart-data-title" className="text-base font-semibold text-neutral-100">Smart data</h2>
            <p className="mt-1 text-xs text-neutral-400">Detected in editable text. Review each match before replacing it.</p>
          </div>
          <button type="button" onClick={onClose} aria-label="Close smart data" className="min-h-11 min-w-11 rounded hover:bg-neutral-800">
            <X className="mx-auto h-4 w-4" />
          </button>
        </header>
        <div className="min-h-0 space-y-4 overflow-y-auto p-4">
          <div className="flex flex-wrap gap-2" aria-label="Detected smart data summary">
            {(Object.entries(counts) as [SmartDataKind, number][]).map(([kind, count]) => (
              <span key={kind} className="rounded-full border border-neutral-700 px-2.5 py-1 text-xs text-neutral-300">
                {KIND_LABELS[kind]}: {count}
              </span>
            ))}
          </div>
          <div className="grid gap-2 sm:grid-cols-3">
            {(Object.keys(ACTION_LABELS) as BulkAction[]).map((key) => {
              const count = matchesForBulkAction(detections, key).length;
              return (
                <button
                  key={key}
                  type="button"
                  onClick={() => {
                    setAction(key);
                    setReplacement(null);
                  }}
                  disabled={!count}
                  className={`min-h-11 rounded border px-3 text-xs font-medium disabled:cursor-not-allowed disabled:opacity-40 ${action === key ? 'border-sky-500 bg-sky-500/10 text-sky-200' : 'border-neutral-700 text-neutral-200 hover:bg-neutral-800'}`}
                >
                  {ACTION_LABELS[key]} ({count})
                </button>
              );
            })}
          </div>

          {action && (
            <section className="space-y-3 rounded-lg border border-neutral-800 bg-neutral-950/60 p-3" aria-label="Replacement preview">
              <label className="block space-y-1 text-xs text-neutral-300">
                Replace every match with
                <input
                  value={replacement ?? ''}
                  onChange={(event) => setReplacement(event.target.value)}
                  className="min-h-11 w-full rounded border border-neutral-700 bg-neutral-950 px-2.5 text-sm text-neutral-100 outline-none focus:border-sky-500"
                  aria-label="Replacement text"
                  placeholder="Type replacement text (leave empty to remove)"
                />
              </label>
              <div className="space-y-2">
                {matches.map((match, index) => (
                  <div key={`${match.layerId}:${match.start}:${match.kind}`} className="grid gap-1 rounded border border-neutral-800 p-2 text-xs sm:grid-cols-[1fr_auto_1fr] sm:items-center">
                    <span className="min-w-0 break-all text-neutral-200">
                      <span className="mr-1 text-neutral-500">{match.layerName} · {KIND_LABELS[match.kind]}</span>
                      <span>{match.value}</span>
                    </span>
                    <span className="text-neutral-500 sm:px-2">→</span>
                    <span className="min-w-0 break-all text-sky-200">{replacementPreview || '(remove)'}</span>
                    <span className="text-[10px] text-neutral-500">Confidence {Math.round(match.confidence * 100)}% · match {index + 1}</span>
                  </div>
                ))}
              </div>
            </section>
          )}

          {!detections.length && (
            <p className="rounded border border-neutral-800 p-4 text-sm text-neutral-400">
              No phone numbers, emails, URLs, social handles, prices, dates, or addresses were detected in text layers.
            </p>
          )}
          <p className="text-[11px] leading-5 text-neutral-500">
            Detection is local and heuristic. Phone confidence uses number-pattern and libphonenumber validation; verify every match in the preview.
          </p>
        </div>
        <footer className="flex justify-end gap-2 border-t border-neutral-800 p-4">
          <button type="button" onClick={() => { setAction(null); setReplacement(null); }} className="min-h-11 rounded border border-neutral-700 px-4 text-sm text-neutral-200">
            {action ? 'Back' : 'Close'}
          </button>
          <button
            type="button"
            onClick={confirm}
            disabled={!action || replacement === null || !matches.length}
            className="min-h-11 rounded bg-sky-500 px-4 text-sm font-semibold text-neutral-950 disabled:opacity-40"
          >
            Confirm replacement
          </button>
        </footer>
      </section>
    </div>
  );
};
