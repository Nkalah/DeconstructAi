import React from 'react';
import { SceneGraph, Layer, MutationOperation, WarningFlag } from '../types/sceneGraph';
import { CURATED_POSTER_FONTS } from '../lib/fontCatalog';
import { 
  AlertTriangle, 
  X, 
  Sparkles, 
  Check, 
  ArrowRight, 
  ShieldAlert, 
  SlidersHorizontal 
} from 'lucide-react';

interface FailureModeReviewProps {
  isOpen: boolean;
  onClose: () => void;
  scene: SceneGraph;
  onSelectLayer: (id: string) => void;
  onExecuteMutation: (op: MutationOperation) => void;
}

export const FailureModeReview: React.FC<FailureModeReviewProps> = ({
  isOpen,
  onClose,
  scene,
  onSelectLayer,
  onExecuteMutation,
}) => {
  if (!isOpen) return null;

  // Find all layers with warning flags or confidence < 0.85
  const flaggedLayers = scene.layers.filter(
    (l) => (l.source?.warning_flags && l.source.warning_flags.length > 0) || l.source?.detection_confidence < 0.85
  );

  const getWarningExplanation = (flag: WarningFlag, layer: Layer) => {
    switch (flag) {
      case 'approximate_font':
        return {
          title: 'Approximate Font Match',
          description:
            'A confident 1:1 typeface match could not be confirmed for this custom/display lettering. A categorized typographic substitute from the curated catalog has been mapped.',
          fixAction: 'Choose an alternative font candidate below or adjust font weight/letter-spacing.'
        };
      case 'low_confidence_face_overlap':
        return {
          title: 'Text Over Photo / Face Boundary',
          description:
            'This text element was detected overlapping a photo or person region. Automatic inpainting was restricted to avoid destructive facial blur.',
          fixAction: 'Nudge text position off the face, or enable a drop shadow / card badge behind it for legibility.'
        };
      case 'clipped_on_resize':
        return {
          title: 'Extends Beyond Canvas Boundary',
          description:
            'Canvas aspect-ratio reflow pushed this layer near or outside the new canvas boundaries.',
          fixAction: 'Fit within bounds proportionally.'
        };
      case 'seam_detected':
        return {
          title: 'Inpainting Seam Variance Flagged',
          description:
            'Edge discontinuity was detected around this layer mask boundary.',
          fixAction: 'Convert background region to deterministic uniform fill.'
        };
      default:
        return {
          title: 'Derivation Ambiguity',
          description: 'Element required heuristic classification.',
          fixAction: 'Review layer properties.'
        };
    }
  };

  const handleFixClipped = (layer: Layer) => {
    const maxX = scene.canvas.width - layer.transform.width;
    const maxY = scene.canvas.height - layer.transform.height;
    const clampedX = Math.max(20, Math.min(maxX - 20, layer.transform.x));
    const clampedY = Math.max(20, Math.min(maxY - 20, layer.transform.y));

    // Remove clipped flag
    const updatedFlags = (layer.source?.warning_flags || []).filter(f => f !== 'clipped_on_resize');

    onExecuteMutation({
      type: 'update_transform',
      layer_id: layer.id,
      params: {
        transform: {
          ...layer.transform,
          x: clampedX,
          y: clampedY
        }
      }
    });
    layer.source.warning_flags = updatedFlags;
  };

  const handleAddBackingCard = (layer: Layer) => {
    onExecuteMutation({
      type: 'set_effect',
      layer_id: layer.id,
      params: {
        shadow: {
          enabled: true,
          offset_x: 0,
          offset_y: 4,
          blur: 16,
          color: '#000000',
          opacity: 0.8
        }
      }
    });
    // Remove warning flag once high-contrast backing shadow is applied
    layer.source.warning_flags = (layer.source.warning_flags || []).filter(f => f !== 'low_confidence_face_overlap');
  };

  return (
    <div className="fixed inset-0 bg-black/70 backdrop-blur-sm z-50 flex items-center justify-center p-4 select-none">
      <div className="bg-neutral-900 border border-neutral-800 rounded-xl w-full max-w-xl shadow-2xl flex flex-col max-h-[85vh] overflow-hidden">
        {/* Header */}
        <div className="p-4 border-b border-neutral-800 flex items-center justify-between bg-neutral-950">
          <div className="flex items-center gap-2">
            <div className="w-7 h-7 rounded-lg bg-amber-500/20 border border-amber-500/40 flex items-center justify-center text-amber-400">
              <ShieldAlert className="w-4 h-4" />
            </div>
            <div>
              <h3 className="font-semibold text-neutral-100 text-sm">
                Confidence &amp; Failure-Mode Review
              </h3>
              <p className="text-[11px] text-neutral-400">
                Auditing low-confidence matches, face overlaps, and boundary clips
              </p>
            </div>
          </div>
          <button onClick={onClose} className="text-neutral-400 hover:text-neutral-200 p-1 rounded">
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Content */}
        <div className="p-5 flex-1 overflow-y-auto space-y-4 text-xs">
          {flaggedLayers.length === 0 ? (
            <div className="p-8 text-center text-neutral-400 space-y-2">
              <Check className="w-8 h-8 text-emerald-400 mx-auto" />
              <p className="text-sm font-semibold text-neutral-200">No Failure Flags Detected</p>
              <p className="text-xs text-neutral-500 max-w-sm mx-auto">
                All layers achieved high extraction confidence with clean font mappings and verified background continuity.
              </p>
            </div>
          ) : (
            flaggedLayers.map((layer) => {
              const flags = layer.source?.warning_flags || ['approximate_font'];
              const conf = Math.round((layer.source?.detection_confidence || 0.7) * 100);

              return (
                <div
                  key={layer.id}
                  className="bg-neutral-950 border border-neutral-800 rounded-lg p-4 space-y-3"
                >
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <span className="font-semibold text-neutral-200 text-xs">{layer.name}</span>
                      <span className="text-[10px] bg-neutral-800 text-neutral-400 px-1.5 py-0.5 rounded font-mono">
                        {conf}% confidence
                      </span>
                    </div>

                    <button
                      onClick={() => {
                        onSelectLayer(layer.id);
                        onClose();
                      }}
                      className="text-sky-400 hover:text-sky-300 text-[11px] flex items-center gap-1"
                    >
                      <span>Focus on Canvas</span>
                      <ArrowRight className="w-3 h-3" />
                    </button>
                  </div>

                  {flags.map((flag) => {
                    const info = getWarningExplanation(flag, layer);
                    return (
                      <div
                        key={flag}
                        className="bg-neutral-900/80 border border-neutral-800 p-3 rounded-md space-y-2 text-[11px]"
                      >
                        <div className="flex items-center gap-1.5 text-amber-400 font-semibold">
                          <AlertTriangle className="w-3.5 h-3.5" />
                          <span>{info.title}</span>
                        </div>
                        <p className="text-neutral-400 leading-relaxed">{info.description}</p>

                        {/* Action buttons */}
                        <div className="pt-1 flex items-center gap-2">
                          {flag === 'clipped_on_resize' && (
                            <button
                              onClick={() => handleFixClipped(layer)}
                              className="px-2.5 py-1 bg-sky-500/20 hover:bg-sky-500/30 text-sky-300 border border-sky-500/40 rounded text-[10px] font-semibold transition"
                            >
                              Auto-Fit Inside Canvas Bounds
                            </button>
                          )}

                          {flag === 'low_confidence_face_overlap' && (
                            <button
                              onClick={() => handleAddBackingCard(layer)}
                              className="px-2.5 py-1 bg-sky-500/20 hover:bg-sky-500/30 text-sky-300 border border-sky-500/40 rounded text-[10px] font-semibold transition"
                            >
                              Add High-Contrast Backing Shadow
                            </button>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              );
            })
          )}
        </div>

        {/* Footer */}
        <div className="p-3 border-t border-neutral-800 bg-neutral-950 flex justify-end">
          <button
            onClick={onClose}
            className="px-4 py-1.5 bg-neutral-800 hover:bg-neutral-700 text-neutral-200 rounded text-xs font-semibold transition"
          >
            Close Audit
          </button>
        </div>
      </div>
    </div>
  );
};
