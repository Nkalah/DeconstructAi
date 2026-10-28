import React, { useState } from 'react';
import { SceneGraph, MutationOperation } from '../types/sceneGraph';
import { SAMPLE_POSTERS, SamplePoster } from '../lib/samplePosters';
import { 
  Undo2, 
  Redo2, 
  ZoomIn, 
  ZoomOut, 
  Maximize2, 
  Download, 
  Sparkles, 
  Bot, 
  Layers, 
  Plus, 
  AlertTriangle, 
  Clock, 
  ChevronDown,
  Upload,
  Type,
  Square,
  Image as ImageIcon,
  Eye,
  Columns2,
  CheckCircle2,
  Save,
  FolderKanban,
  History
} from 'lucide-react';

interface HeaderProps {
  scene: SceneGraph | null;
  canUndo: boolean;
  canRedo: boolean;
  onUndo: () => void;
  onRedo: () => void;
  zoom: number;
  onSetZoom: (updater: (prev: number) => number) => void;
  onResetZoom: () => void;
  onOpenUploadModal: () => void;
  onOpenExportModal: () => void;
  onToggleAIAssistant: () => void;
  isAIAssistantOpen: boolean;
  onOpenFailureReview: () => void;
  onExecuteMutation: (op: MutationOperation) => void;
  onLoadSample: (sample: SamplePoster) => void;
  isDirty?: boolean;
  saveStatus?: 'Saved' | 'Saving...' | 'Offline: saved locally' | 'Save failed';
  onSave?: () => void;
  onOpenProjects?: () => void;
  onOpenVersions?: () => void;
  isPreviewMode?: boolean;
  isCompareMode?: boolean;
  onTogglePreview?: () => void;
  onToggleCompare?: () => void;
}

export const Header: React.FC<HeaderProps> = ({
  scene,
  canUndo,
  canRedo,
  onUndo,
  onRedo,
  zoom,
  onSetZoom,
  onResetZoom,
  onOpenUploadModal,
  onOpenExportModal,
  onToggleAIAssistant,
  isAIAssistantOpen,
  onOpenFailureReview,
  onExecuteMutation,
  onLoadSample,
  isDirty = false,
  saveStatus = isDirty ? 'Saving...' : 'Saved',
  onSave,
  onOpenProjects,
  onOpenVersions,
  isPreviewMode = false,
  isCompareMode = false,
  onTogglePreview,
  onToggleCompare
}) => {
  const [isAddMenuOpen, setIsAddMenuOpen] = useState(false);
  const [isSampleMenuOpen, setIsSampleMenuOpen] = useState(false);

  const handleAddText = (type: 'headline' | 'subhead' | 'body') => {
    if (!scene) return;
    const canvasW = scene.canvas.width;
    const canvasH = scene.canvas.height;

    const isHeadline = type === 'headline';
    const isSubhead = type === 'subhead';

    const newLayer = {
      id: `text-${Date.now().toString(36)}`,
      name: isHeadline ? 'New Headline' : isSubhead ? 'New Subhead' : 'New Body Text',
      type: 'text' as const,
      z_index: scene.layers.length + 1,
      transform: {
        x: Math.round(canvasW * 0.2),
        y: Math.round(canvasH * 0.4),
        width: Math.round(canvasW * 0.6),
        height: isHeadline ? 80 : 45,
        rotation: 0
      },
      opacity: 1,
      visible: true,
      locked: false,
      style: {
        effects: {
          shadow: { enabled: false, offset_x: 0, offset_y: 4, blur: 8, color: '#000000', opacity: 0.3 },
          stroke: { enabled: false, width: 2, color: '#000000' }
        }
      },
      type_specific: {
        content: isHeadline ? 'NEW HEADLINE' : isSubhead ? 'Event Subheadline Goes Here' : 'Paragraph body copy details here.',
        font_family: isHeadline ? 'Montserrat' : 'Inter',
        font_family_confidence: 1,
        font_size: isHeadline ? 54 : isSubhead ? 24 : 16,
        font_weight: isHeadline ? 800 : 500,
        color: '#ffffff',
        alignment: 'center' as const,
        line_height: 1.2
      }
    };

    onExecuteMutation({
      type: 'add_layer',
      params: { layer: newLayer }
    });
    setIsAddMenuOpen(false);
  };

  const handleAddShape = (shapeType: 'rect' | 'pill' | 'ellipse') => {
    if (!scene) return;
    const canvasW = scene.canvas.width;
    const canvasH = scene.canvas.height;

    const newLayer = {
      id: `shape-${Date.now().toString(36)}`,
      name: `New ${shapeType.toUpperCase()} Shape`,
      type: 'shape' as const,
      z_index: scene.layers.length + 1,
      transform: {
        x: Math.round(canvasW * 0.3),
        y: Math.round(canvasH * 0.45),
        width: Math.round(canvasW * 0.4),
        height: shapeType === 'pill' ? 60 : 140,
        rotation: 0
      },
      opacity: 1,
      visible: true,
      locked: false,
      style: {
        effects: {
          shadow: { enabled: true, offset_x: 0, offset_y: 6, blur: 12, color: '#000000', opacity: 0.25 },
          stroke: { enabled: false, width: 2, color: '#38bdf8' }
        },
        border_radius: shapeType === 'pill' ? 9999 : shapeType === 'ellipse' ? 9999 : 12
      },
      type_specific: {
        shape_type: shapeType,
        fill_color: '#38bdf8'
      }
    };

    onExecuteMutation({
      type: 'add_layer',
      params: { layer: newLayer }
    });
    setIsAddMenuOpen(false);
  };

  const totalWarnings = scene?.layers.reduce((acc, l) => acc + (l.source?.warning_flags?.length || 0), 0) || 0;
  const pipelineDuration = scene?.pipeline_meta?.total_duration_ms;
  const overallConf = scene?.pipeline_meta?.overall_confidence;

  return (
    <header className="min-h-14 bg-neutral-900 border-b border-neutral-800 px-2 sm:px-4 flex items-center justify-between gap-2 select-none z-30 shrink-0">
      {/* Left: Branding & Poster Switcher */}
      <div className="flex items-center gap-3">
        <div className="hidden items-center gap-2 pr-3 border-r border-neutral-800 sm:flex">
          <div className="w-8 h-8 rounded-lg bg-gradient-to-tr from-sky-600 to-indigo-500 flex items-center justify-center text-white shadow-md">
            <Layers className="w-4 h-4" />
          </div>
          <div>
            <h1 className="font-bold text-sm text-neutral-100 tracking-tight leading-none flex items-center gap-1.5">
              <span>DeconstructAI</span>
              <span className="text-[9px] bg-sky-500/20 text-sky-400 border border-sky-500/40 px-1 py-0.2 rounded font-mono font-normal">
                STUDIO
              </span>
            </h1>
            <p className="text-[10px] text-neutral-400 leading-none mt-0.5">Poster to Editable Layers</p>
          </div>
        </div>

        {/* Sample Posters Selector Dropdown */}
        <div className="relative">
          <button
            onClick={() => setIsSampleMenuOpen(!isSampleMenuOpen)}
            className="flex min-h-11 items-center gap-2 bg-neutral-950 hover:bg-neutral-800/80 border border-neutral-800 px-2.5 py-1.5 rounded-lg text-xs text-neutral-200 transition"
          >
            <span className="truncate max-w-[160px] font-medium">
              {scene?.name || 'Select Poster'}
            </span>
            <ChevronDown className="w-3.5 h-3.5 text-neutral-400" />
          </button>

          {isSampleMenuOpen && (
            <div className="absolute top-full left-0 mt-1 w-64 bg-neutral-900 border border-neutral-800 rounded-xl shadow-2xl py-1.5 z-50 text-xs">
              <div className="px-3 py-1 text-[10px] font-semibold text-neutral-500 uppercase tracking-wider">
                Preset Test Posters
              </div>
              {SAMPLE_POSTERS.map((sample) => (
                <button
                  key={sample.id}
                  onClick={() => {
                    onLoadSample(sample);
                    setIsSampleMenuOpen(false);
                  }}
                  className="w-full text-left px-3 py-2 hover:bg-neutral-800 text-neutral-200 flex flex-col transition"
                >
                  <span className="font-medium text-xs">{sample.title}</span>
                  <span className="text-[10px] text-neutral-400">{sample.category} • {sample.aspectRatio}</span>
                </button>
              ))}

              <div className="border-t border-neutral-800 my-1" />
              <button
                onClick={() => {
                  setIsSampleMenuOpen(false);
                  onOpenUploadModal();
                }}
                className="w-full text-left px-3 py-2 hover:bg-sky-500/10 text-sky-400 font-medium flex items-center gap-1.5 transition"
              >
                <Upload className="w-3.5 h-3.5" />
                <span>Upload Custom Poster Image</span>
              </button>
            </div>
          )}
        </div>

        <div className="flex items-center gap-1 text-[11px] text-neutral-400" aria-live="polite">
          {saveStatus === 'Saving...'
            ? <Clock className="h-3.5 w-3.5 text-amber-300" />
            : saveStatus === 'Saved'
              ? <CheckCircle2 className="h-3.5 w-3.5 text-emerald-300" />
              : <AlertTriangle className="h-3.5 w-3.5 text-amber-300" />}
          <span className="max-w-[84px] truncate text-[10px] sm:max-w-none sm:text-[11px]">{saveStatus}</span>
        </div>

        {/* Pipeline Telemetry Pill */}
        {pipelineDuration !== undefined && (
          <div className="hidden lg:flex items-center gap-2 text-[11px] bg-neutral-950 px-2.5 py-1 rounded-md border border-neutral-800 text-neutral-400">
            <Clock className="w-3 h-3 text-sky-400" />
            <span>{(pipelineDuration / 1000).toFixed(1)}s pass</span>
            <span>•</span>
            <span className="font-mono text-emerald-400 font-medium">
              {Math.round((overallConf || 0.9) * 100)}% conf
            </span>
          </div>
        )}
      </div>

      {/* Middle: Undo/Redo & Zoom Controls */}
      <div className="flex items-center gap-1 bg-neutral-950 border border-neutral-800 rounded-lg p-1">
        <button
          onClick={onUndo}
          disabled={!canUndo}
          className="min-h-11 min-w-11 p-1.5 text-neutral-400 hover:text-neutral-100 disabled:opacity-30 rounded hover:bg-neutral-800 transition"
          title="Undo (Ctrl+Z)"
        >
          <Undo2 className="w-4 h-4" />
        </button>
        <button
          onClick={onRedo}
          disabled={!canRedo}
          className="min-h-11 min-w-11 p-1.5 text-neutral-400 hover:text-neutral-100 disabled:opacity-30 rounded hover:bg-neutral-800 transition"
          title="Redo (Ctrl+Y)"
        >
          <Redo2 className="w-4 h-4" />
        </button>

        <div className="w-px h-4 bg-neutral-800 mx-1" />

        <button
          onClick={() => onSetZoom((z) => Math.max(0.03, z - 0.1))}
          className="hidden min-h-11 min-w-11 p-1.5 text-neutral-400 hover:text-neutral-100 rounded hover:bg-neutral-800 transition sm:block"
          title="Zoom out"
        >
          <ZoomOut className="w-4 h-4" />
        </button>
        <span className="hidden font-mono text-xs text-neutral-300 w-11 text-center sm:block">
          {Math.round(zoom * 100)}%
        </span>
        <button
          onClick={() => onSetZoom((z) => Math.min(2.5, z + 0.1))}
          className="hidden min-h-11 min-w-11 p-1.5 text-neutral-400 hover:text-neutral-100 rounded hover:bg-neutral-800 transition sm:block"
          title="Zoom in"
        >
          <ZoomIn className="w-4 h-4" />
        </button>
        <button
          onClick={onResetZoom}
          className="hidden min-h-11 min-w-11 p-1.5 text-neutral-400 hover:text-neutral-100 rounded hover:bg-neutral-800 transition text-[11px] sm:block"
          title="Fit to Screen"
        >
          <Maximize2 className="w-3.5 h-3.5" />
        </button>
      </div>

      {/* Right Actions: Add Element, AI Assistant, Failure Mode, Export */}
      <div className="flex items-center gap-2">
        {onOpenProjects && (
          <button
            type="button"
            onClick={onOpenProjects}
            className="inline-flex min-h-11 items-center gap-1.5 rounded-lg border border-neutral-800 px-2.5 text-xs text-neutral-300 hover:bg-neutral-800"
          >
            <FolderKanban className="h-4 w-4" /><span className="hidden md:inline">Projects</span>
          </button>
        )}
        {onOpenVersions && (
          <button
            type="button"
            onClick={onOpenVersions}
            className="inline-flex min-h-11 items-center gap-1.5 rounded-lg border border-neutral-800 px-2.5 text-xs text-neutral-300 hover:bg-neutral-800"
          >
            <History className="h-4 w-4" /><span className="hidden lg:inline">History</span>
          </button>
        )}
        {onSave && (
          <button
            type="button"
            onClick={onSave}
            disabled={!scene || saveStatus === 'Saving...'}
            aria-label={saveStatus === 'Offline: saved locally' || saveStatus === 'Save failed' ? 'Retry saving and server sync' : 'Save project'}
            title={saveStatus === 'Offline: saved locally' || saveStatus === 'Save failed' ? 'Your work is stored on this device. Retry server sync.' : 'Save project'}
            className="inline-flex min-h-11 items-center gap-1.5 rounded-lg bg-sky-500 px-3 text-xs font-semibold text-neutral-950 hover:bg-sky-400 disabled:opacity-50"
          >
            <Save className="h-4 w-4" /><span>{saveStatus === 'Offline: saved locally' || saveStatus === 'Save failed' ? 'Retry' : 'Save'}</span>
          </button>
        )}
        <button
          type="button"
          onClick={onTogglePreview}
          aria-pressed={isPreviewMode}
          className={`hidden min-h-11 items-center gap-1.5 rounded-lg border px-2.5 text-xs transition lg:flex ${isPreviewMode ? 'border-sky-400 bg-sky-500/15 text-sky-200' : 'border-neutral-800 text-neutral-300 hover:bg-neutral-800'}`}
        >
          <Eye className="h-4 w-4" /><span>Preview</span>
        </button>
        <button
          type="button"
          onClick={onToggleCompare}
          aria-pressed={isCompareMode}
          className={`hidden min-h-11 items-center gap-1.5 rounded-lg border px-2.5 text-xs transition xl:flex ${isCompareMode ? 'border-sky-400 bg-sky-500/15 text-sky-200' : 'border-neutral-800 text-neutral-300 hover:bg-neutral-800'}`}
        >
          <Columns2 className="h-4 w-4" /><span>Compare</span>
        </button>
        {/* Add Element Menu */}
        <div className="relative hidden sm:block">
          <button
            onClick={() => setIsAddMenuOpen(!isAddMenuOpen)}
            className="flex items-center gap-1.5 bg-neutral-800 hover:bg-neutral-700 text-neutral-200 px-3 py-1.5 rounded-lg text-xs font-medium transition"
          >
            <Plus className="w-3.5 h-3.5 text-sky-400" />
            <span>Add</span>
            <ChevronDown className="w-3 h-3 text-neutral-400" />
          </button>

          {isAddMenuOpen && (
            <div className="absolute top-full right-0 mt-1 w-48 bg-neutral-900 border border-neutral-800 rounded-xl shadow-2xl py-1 z-50 text-xs">
              <button
                onClick={() => handleAddText('headline')}
                className="w-full text-left px-3 py-2 hover:bg-neutral-800 text-neutral-200 flex items-center gap-2"
              >
                <Type className="w-3.5 h-3.5 text-sky-400" />
                <span>Text Headline</span>
              </button>
              <button
                onClick={() => handleAddText('body')}
                className="w-full text-left px-3 py-2 hover:bg-neutral-800 text-neutral-200 flex items-center gap-2"
              >
                <Type className="w-3.5 h-3.5 text-neutral-400" />
                <span>Body Text Box</span>
              </button>
              <div className="border-t border-neutral-800 my-1" />
              <button
                onClick={() => handleAddShape('rect')}
                className="w-full text-left px-3 py-2 hover:bg-neutral-800 text-neutral-200 flex items-center gap-2"
              >
                <Square className="w-3.5 h-3.5 text-amber-400" />
                <span>Rectangle Shape</span>
              </button>
              <button
                onClick={() => handleAddShape('pill')}
                className="w-full text-left px-3 py-2 hover:bg-neutral-800 text-neutral-200 flex items-center gap-2"
              >
                <div className="w-3.5 h-2 rounded-full border border-sky-400" />
                <span>Pill Badge</span>
              </button>
            </div>
          )}
        </div>

        {/* AI Assistant Button */}
        <button
          onClick={onToggleAIAssistant}
          className={`hidden min-h-11 items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition sm:flex ${
            isAIAssistantOpen
              ? 'bg-sky-500 text-neutral-950'
              : 'bg-neutral-800 hover:bg-neutral-700 text-sky-300 border border-sky-500/30'
          }`}
        >
          <Bot className="w-3.5 h-3.5" />
          <span className="hidden lg:inline">AI Assistant</span>
        </button>

        {/* Failure Mode Review Badge */}
        {totalWarnings > 0 && (
          <button
            onClick={onOpenFailureReview}
            className="flex min-h-11 items-center gap-1 px-2.5 py-1.5 rounded-lg text-xs font-medium bg-amber-500/10 hover:bg-amber-500/20 text-amber-400 border border-amber-500/30 transition"
            title="Review low-confidence layers"
          >
            <AlertTriangle className="w-3.5 h-3.5" />
            <span>{totalWarnings} Flags</span>
          </button>
        )}

        {/* Export Button */}
        <button
          onClick={onOpenExportModal}
          className="flex min-h-11 min-w-11 items-center justify-center gap-1.5 bg-sky-500 hover:bg-sky-400 text-neutral-950 px-2 sm:px-3.5 py-1.5 rounded-lg text-xs font-semibold shadow transition"
        >
          <Download className="w-3.5 h-3.5" />
          <span className="hidden sm:inline">Export</span>
        </button>
      </div>
    </header>
  );
};
