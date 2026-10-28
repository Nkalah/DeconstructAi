import React, { useState, useEffect, useRef, useCallback } from 'react';
import { SAMPLE_POSTERS, SamplePoster } from './lib/samplePosters';
import { useDesignDocumentEditor } from './hooks/useDesignDocumentEditor';
import { sceneGraphToDesignDocument } from './lib/sceneGraphToDesignDocument';
import { Header } from './components/Header';
import { DesignDocumentCanvas } from './components/DesignDocumentCanvas';
import { LayerPanel } from './components/LayerPanel';
import { PropertyInspector } from './components/PropertyInspector';
import { Layers, Loader2 } from 'lucide-react';
import { EditorToolSidebar } from './components/EditorToolSidebar';
import type { TextStyleClipboard, TextLayer } from './types/sceneGraph';
import { loadLocalProject, loadMostRecentLocalProject, saveLocalProject } from './lib/projectStore';

const SmartDataDialog = React.lazy(() => import('./components/SmartDataDialog').then((module) => ({ default: module.SmartDataDialog })));
const AIAssistantDrawer = React.lazy(() => import('./components/AIAssistantDrawer').then((module) => ({ default: module.AIAssistantDrawer })));
const ExportModal = React.lazy(() => import('./components/ExportModal').then((module) => ({ default: module.ExportModal })));
const UploadModal = React.lazy(() => import('./components/UploadModal').then((module) => ({ default: module.UploadModal })));
const FailureModeReview = React.lazy(() => import('./components/FailureModeReview').then((module) => ({ default: module.FailureModeReview })));
const ProjectsPage = React.lazy(() => import('./components/ProjectsPage').then((module) => ({ default: module.ProjectsPage })));
const ProjectVersionsDialog = React.lazy(() => import('./components/ProjectVersionsDialog').then((module) => ({ default: module.ProjectVersionsDialog })));
const ComparisonView = React.lazy(() => import('./components/ComparisonView').then((module) => ({ default: module.ComparisonView })));
const BeginnerStartScreen = React.lazy(() => import('./components/BeginnerStartScreen').then((module) => ({ default: module.BeginnerStartScreen })));

export default function App() {
  const [isInitializing, setIsInitializing] = useState<boolean>(false);
  const [isAIAssistantOpen, setIsAIAssistantOpen] = useState<boolean>(false);
  const [isExportModalOpen, setIsExportModalOpen] = useState<boolean>(false);
  const [isUploadModalOpen, setIsUploadModalOpen] = useState<boolean>(false);
  const [isFailureReviewOpen, setIsFailureReviewOpen] = useState<boolean>(false);
  const [isPreviewMode, setIsPreviewMode] = useState(false);
  const [isCompareMode, setIsCompareMode] = useState(false);
  const [mobilePanel, setMobilePanel] = useState<'layers' | 'properties' | null>(null);
  const [fitZoom, setFitZoom] = useState(0.65);
  const [providerStatus, setProviderStatus] = useState<{ gemini: boolean }>({ gemini: false });
  const [textStyleClipboard, setTextStyleClipboard] = useState<TextStyleClipboard | null>(null);
  const [showProjects, setShowProjects] = useState(false);
  const [showBeginnerMode, setShowBeginnerMode] = useState(false);
  const [showVersionHistory, setShowVersionHistory] = useState(false);
  const [showSmartData, setShowSmartData] = useState(false);
  const [saveStatus, setSaveStatus] = useState<'Saved' | 'Saving...' | 'Offline: saved locally' | 'Save failed'>('Saved');
  const [persistenceError, setPersistenceError] = useState<string | null>(null);
  const recoveryAttempted = useRef(false);

  useEffect(() => {
    async function loadHealth() {
      try {
        const res = await fetch('/api/health');
        const data = await res.json();
        setProviderStatus({ gemini: Boolean(data?.providers?.gemini) });
      } catch {
        setProviderStatus({ gemini: false });
      }
    }

    loadHealth();
  }, []);

  const {
    scene,
    document,
    setDesignDocument,
    clearDesignDocument,
    restoreDesignDocument,
    renameDocument,
    selectedLayerIds,
    selectedLayerId,
    setSelectedLayerId,
    setSelectedLayerIds,
    selectedLayer,
    executeMutation,
    commitDocumentEdit,
    undo,
    redo,
    canUndo,
    canRedo,
    zoom,
    setZoom,
    isDirty,
    markSaved,
    duplicateLayers,
    deleteLayers,
    groupLayers,
    ungroupLayers,
    moveLayers,
    commitTransforms,
    resetLayerToOriginal
  } = useDesignDocumentEditor(null);
  const currentDocument = useRef(document);
  currentDocument.current = document;

  useEffect(() => {
    if (recoveryAttempted.current) return;
    recoveryAttempted.current = true;
    void loadMostRecentLocalProject()
      .then((recovered) => {
        if (!recovered || currentDocument.current) return;
        setDesignDocument(recovered, false);
        setSaveStatus('Saved');
      })
      .catch((error: unknown) => {
        console.error('Could not recover the most recent local project:', error);
        setPersistenceError('Could not recover the most recent local project from this device.');
      });
  }, [setDesignDocument]);

  const canResetTextToOriginal = Boolean(selectedLayer?.type === 'text' && document?.layers.some(
    (layer) => layer.id === selectedLayer.id && layer.type === 'text' && layer.reconstructedOriginal
  ));
  const pasteTextStyle = (layer: TextLayer) => {
    if (!textStyleClipboard) return;
    executeMutation({
      type: 'batch_mutation',
      description: 'Pasted text style',
      params: {
        mutations: [
          {
            type: 'update_text',
            layer_id: layer.id,
            params: {
              font_family: textStyleClipboard.font_family,
              font_size: textStyleClipboard.font_size,
              font_weight: textStyleClipboard.font_weight,
              font_style: textStyleClipboard.font_style,
              direction: textStyleClipboard.direction,
              line_height: textStyleClipboard.line_height,
              letter_spacing: textStyleClipboard.letter_spacing,
              alignment: textStyleClipboard.alignment
            }
          },
          { type: 'set_color', layer_id: layer.id, params: { color: textStyleClipboard.color } },
          {
            type: 'set_effect',
            layer_id: layer.id,
            params: {
              opacity: textStyleClipboard.opacity,
              stroke: textStyleClipboard.stroke,
              shadow: textStyleClipboard.shadow
            }
          },
          { type: 'update_transform', layer_id: layer.id, params: { transform: { rotation: textStyleClipboard.rotation } } }
        ]
      }
    });
  };
  const textPropertyInspectorProps = {
    selectedLayer,
    onExecuteMutation: executeMutation,
    onCopyTextStyle: setTextStyleClipboard,
    onPasteTextStyle: pasteTextStyle,
    canPasteTextStyle: textStyleClipboard !== null,
    canResetTextToOriginal,
    onResetTextToOriginal: resetLayerToOriginal
  };
  useEffect(() => {
    const handleShortcut = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement;
      if (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable) return;
      const modifier = event.ctrlKey || event.metaKey;
      if (modifier && event.key.toLowerCase() === 'z') {
        event.preventDefault();
        if (event.shiftKey) redo();
        else undo();
      } else if (modifier && event.key.toLowerCase() === 'y') {
        event.preventDefault();
        redo();
      } else if (modifier && event.key.toLowerCase() === 'd') {
        event.preventDefault();
        duplicateLayers(selectedLayerIds);
      } else if (modifier && event.key.toLowerCase() === 'g') {
        event.preventDefault();
        groupLayers(selectedLayerIds);
      } else if (event.key === 'Delete' || event.key === 'Backspace') {
        if (selectedLayerIds.length) {
          event.preventDefault();
          deleteLayers(selectedLayerIds);
        }
      } else if (selectedLayerIds.length && ['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown'].includes(event.key)) {
        event.preventDefault();
        const amount = event.shiftKey ? 10 : 1;
        moveLayers(
          selectedLayerIds,
          event.key === 'ArrowLeft' ? -amount : event.key === 'ArrowRight' ? amount : 0,
          event.key === 'ArrowUp' ? -amount : event.key === 'ArrowDown' ? amount : 0
        );
      }
    };
    window.addEventListener('keydown', handleShortcut);
    return () => window.removeEventListener('keydown', handleShortcut);
  }, [selectedLayerIds, duplicateLayers, groupLayers, deleteLayers, moveLayers, undo, redo]);

  const saveDocument = useCallback(async (target: typeof document, createSnapshot: boolean) => {
    if (!target) return;
    setSaveStatus('Saving...');
    setPersistenceError(null);
    try {
      await saveLocalProject(target, { snapshot: createSnapshot });
    } catch (error) {
      console.error('Could not save project locally:', error);
      setSaveStatus('Save failed');
      setPersistenceError(error instanceof Error ? error.message : 'Could not save this project on this device.');
      return;
    }

    let synced = false;
    try {
      const response = await fetch('/api/documents', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ document: target })
      });
      if (!response.ok) throw new Error(`Server sync failed (${response.status}).`);
      synced = true;
    } catch (error) {
      console.info('Project is safe locally; server sync is unavailable.', error);
    }
    if (currentDocument.current === target) {
      markSaved(target);
      setSaveStatus(synced ? 'Saved' : 'Offline: saved locally');
    }
  }, [markSaved]);

  const manualSave = useCallback(() => {
    void saveDocument(document, true);
  }, [document, saveDocument]);

  // Save locally after each edit; server sync is best-effort and never replaces the local copy.
  useEffect(() => {
    if (!document || !isDirty) return;
    setSaveStatus('Saving...');
    const timer = setTimeout(() => { void saveDocument(document, false); }, 1000);
    return () => clearTimeout(timer);
  }, [document, isDirty, saveDocument]);

  const handleLoadSample = async (sample: SamplePoster) => {
    setIsInitializing(true);
    try {
      const res = await fetch('/api/pipeline/analyze', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          imagePayload: sample.svgDataUri,
          designName: sample.title,
          canvasWidth: sample.width,
          canvasHeight: sample.height
        })
      });
      const data = await res.json();
      if (data.success && data.scene) {
        setDesignDocument(sceneGraphToDesignDocument(data.scene));
      }
    } catch (err) {
      console.error('Failed to load sample:', err);
    } finally {
      setIsInitializing(false);
    }
  };

  const openProject = async (projectId: string) => {
    const loaded = await loadLocalProject(projectId);
    if (!loaded) throw new Error('Project not found on this device.');
    setDesignDocument(loaded, false);
    setSaveStatus('Saved');
    setShowProjects(false);
  };
  const createProject = (newDocument: NonNullable<typeof document>) => {
    setDesignDocument(newDocument);
    setSaveStatus('Saving...');
    setShowProjects(false);
  };
  const createBeginnerProject = (newDocument: NonNullable<typeof document>) => {
    setDesignDocument(newDocument);
    setSaveStatus('Saving...');
    setShowBeginnerMode(false);
    setShowProjects(false);
  };

  if (showProjects) {
    return (
      <React.Suspense fallback={<div className="min-h-screen bg-neutral-950" role="status">Loading projects…</div>}>
        <ProjectsPage
          activeProjectId={document?.id}
          onOpenProject={openProject}
          onCreateProject={createProject}
          onStartBeginnerMode={() => {
            setShowProjects(false);
            setShowBeginnerMode(true);
          }}
          onBack={() => setShowProjects(false)}
          onProjectRenamed={(projectId, name) => {
            if (document?.id === projectId) renameDocument(name);
          }}
          onProjectDeleted={(projectId) => {
            if (document?.id === projectId) clearDesignDocument();
          }}
        />
      </React.Suspense>
    );
  }

  if (showBeginnerMode) {
    return (
      <React.Suspense fallback={<div className="min-h-screen bg-neutral-950" role="status">Loading design options…</div>}>
        <BeginnerStartScreen
          onBack={() => setShowBeginnerMode(false)}
          onCreate={createBeginnerProject}
        />
      </React.Suspense>
    );
  }

  if (isInitializing && !scene) {
    return (
      <div className="h-screen w-screen bg-neutral-950 flex flex-col items-center justify-center text-neutral-300 gap-3">
        <Loader2 className="w-8 h-8 text-sky-400 animate-spin" />
        <p className="text-sm font-semibold tracking-wide">Deconstructing Poster Layers...</p>
        <p className="text-xs text-neutral-500">Running multi-stage vision pipeline on initial poster</p>
      </div>
    );
  }

  if (!scene || !document) {
    return (
      <div className="relative flex min-h-screen w-screen flex-col overflow-hidden bg-neutral-950 text-neutral-100">
        <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_50%_30%,rgba(14,165,233,0.12),transparent_55%)]" />
        <header className="relative flex h-16 items-center border-b border-neutral-800/80 px-6">
          <div className="flex items-center gap-2 text-sm font-semibold tracking-wide">
            <div className="flex h-8 w-8 items-center justify-center rounded-lg border border-sky-500/30 bg-sky-500/10 text-sky-400">
              <Layers className="h-4 w-4" />
            </div>
            DeconstructAI
          </div>
          <button
            type="button"
            onClick={() => setShowProjects(true)}
            className="ml-auto min-h-11 rounded-lg border border-neutral-700 px-4 text-sm text-neutral-200 hover:bg-neutral-900"
          >
            Your projects
          </button>
        </header>
        <main className="relative flex flex-1 flex-col items-center justify-center px-5 py-16 text-center">
          {persistenceError && <p role="alert" className="mb-4 rounded-lg border border-rose-500/40 bg-rose-500/10 p-3 text-sm text-rose-200">{persistenceError}</p>}
          <div className="max-w-3xl">
            <p className="mb-5 text-xs font-semibold uppercase tracking-[0.24em] text-sky-400">Poster to editable design</p>
            <h1 className="text-4xl font-bold tracking-tight text-white sm:text-6xl">
              Upload a poster. Make it editable.
            </h1>
            <p className="mx-auto mt-5 max-w-xl text-base leading-7 text-neutral-400 sm:text-lg">
              Start with your image, choose what you want to do, and bring its design into the editor.
            </p>
            <div className="mt-9 flex flex-col items-center justify-center gap-3 sm:flex-row">
              <button
                onClick={() => setIsUploadModalOpen(true)}
                className="rounded-xl bg-sky-500 px-6 py-3 text-sm font-semibold text-neutral-950 transition hover:bg-sky-400"
              >
                Upload Poster
              </button>
              <button
                type="button"
                onClick={() => setShowBeginnerMode(true)}
                className="rounded-xl border border-neutral-700 px-6 py-3 text-sm font-semibold text-neutral-200 transition hover:border-sky-400/60 hover:bg-neutral-900"
              >
                Start with a simple design
              </button>
              <button
                onClick={() => handleLoadSample(SAMPLE_POSTERS[0])}
                className="rounded-xl border border-neutral-700 px-6 py-3 text-sm font-semibold text-neutral-200 transition hover:border-neutral-500 hover:bg-neutral-900"
              >
                Try a sample poster
              </button>
            </div>
            <p className="mt-5 text-xs text-neutral-500">JPG, JPEG, PNG, and WebP supported</p>
          </div>
        </main>
        <UploadModal
          isOpen={isUploadModalOpen}
          onClose={() => setIsUploadModalOpen(false)}
          onDeconstructionComplete={setDesignDocument}
        />
      </div>
    );
  }

  const layerPanelProps = {
    scene,
    document,
    selectedLayerIds,
    onSelectLayerIds: setSelectedLayerIds,
    onExecuteMutation: executeMutation,
    onDuplicateLayers: duplicateLayers,
    onDeleteLayers: deleteLayers,
    onGroupLayers: groupLayers,
    onUngroupLayers: ungroupLayers,
    onOpenFailureReview: () => setIsFailureReviewOpen(true)
  };
  const detectedElements = document.layers.filter((layer) =>
    layer.type !== 'group' && !(layer.type === 'image' && layer.source.origin === 'fallback')
  );
  const textLayerCount = detectedElements.filter((layer) => layer.type === 'text').length;
  const shapeLayerCount = detectedElements.filter((layer) => layer.type === 'shape').length;
  const imageLayers = detectedElements.filter((layer) => layer.type === 'image');
  const isolatedImageCount = imageLayers.filter((layer) => layer.type === 'image' && layer.backgroundRemoved).length;
  const decodedQrCount = detectedElements.filter((layer) => layer.type === 'qr' && layer.decodedOk).length;
  const editableLayerCount = textLayerCount + shapeLayerCount + isolatedImageCount + decodedQrCount;
  const editabilityScore = detectedElements.length
    ? Math.round(editableLayerCount / detectedElements.length * 100)
    : 0;
  const backgroundReconstructionVerified = document.analysis.stages.some((stage) =>
    stage.name === 'background reconstruction'
    && stage.status === 'completed'
    && stage.message?.includes('verificationPassed')
  ) || Boolean(document.assets[`clean-background-${document.id}`]);
  const hasRasterBackground = document.layers.some((layer) =>
    layer.type === 'image' && layer.source.origin === 'fallback'
  );

  return (
    <div className="h-screen w-screen bg-neutral-950 text-neutral-100 flex flex-col overflow-hidden font-sans">
      {document.originalAsset && (
        <section aria-label="Reconstruction editability" className="shrink-0 border-b border-sky-500/20 bg-sky-950/30 px-4 py-2">
          <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs">
            <strong className="text-sky-200">Editability: {editabilityScore}% of detected elements represented as editable layers</strong>
            <span className="text-neutral-300">{detectedElements.length} element layers</span>
            <span className="text-neutral-400">{textLayerCount} text · {imageLayers.length} images ({isolatedImageCount} isolated) · {shapeLayerCount} shapes</span>
          </div>
          {(hasRasterBackground || isolatedImageCount < imageLayers.length) && (
            <p className="mt-1 text-[11px] leading-4 text-amber-200">
              {hasRasterBackground && (backgroundReconstructionVerified
                ? 'The background is reconstructed raster artwork, not independently editable. '
                : 'Background reconstruction was not verified; the original poster is raster-only. ')}
              {imageLayers.length > isolatedImageCount && 'Some image layers are rectangular raster crops, not isolated objects; they are locked to prevent misleading edits.'}
            </p>
          )}
          <p className="sr-only">This is an editability estimate based on detected layer types, not a visual similarity score.</p>
        </section>
      )}
      {document.analysis.status === 'partial' && document.analysis.warnings.length > 0 && (
        <details className="shrink-0 border-b border-amber-500/40 bg-neutral-900 px-4 py-2 text-sm text-neutral-100">
          <summary className="min-h-11 cursor-pointer py-3 font-medium">
            Analysis finished with {document.analysis.warnings.length} note{document.analysis.warnings.length === 1 ? '' : 's'}; the original image is kept and manual editing is available.
          </summary>
          <ul className="max-h-32 list-inside list-disc space-y-1 overflow-y-auto pb-3 text-sm leading-5 text-neutral-300">
            {document.analysis.warnings.map((warning, index) => <li key={`${index}-${warning}`}>{warning}</li>)}
          </ul>
        </details>
      )}
      {!providerStatus.gemini && (
        <div role="status" className="border-b border-amber-500/30 bg-amber-500/10 px-4 py-2 text-center text-sm text-amber-100">
          No AI provider is configured yet. Manual editing remains available; add GEMINI_API_KEY in your server .env and restart to enable AI-assisted features.
        </div>
      )}

      {/* Studio Header */}
      <Header
        scene={scene}
        canUndo={canUndo}
        canRedo={canRedo}
        onUndo={undo}
        onRedo={redo}
        zoom={zoom}
        onSetZoom={setZoom}
        onResetZoom={() => setZoom(fitZoom)}
        onOpenUploadModal={() => setIsUploadModalOpen(true)}
        onOpenExportModal={() => setIsExportModalOpen(true)}
        onToggleAIAssistant={() => setIsAIAssistantOpen(!isAIAssistantOpen)}
        isAIAssistantOpen={isAIAssistantOpen}
        onOpenFailureReview={() => setIsFailureReviewOpen(true)}
        onExecuteMutation={executeMutation}
        onLoadSample={handleLoadSample}
        isDirty={isDirty}
        saveStatus={saveStatus}
        onSave={manualSave}
        onOpenProjects={() => setShowProjects(true)}
        onOpenVersions={() => setShowVersionHistory(true)}
        isPreviewMode={isPreviewMode}
        isCompareMode={isCompareMode}
        onTogglePreview={() => setIsPreviewMode((value) => !value)}
        onToggleCompare={() => setIsCompareMode((value) => !value)}
      />

      {/* Main Studio Body: Left Layer Panel + Middle Interactive Canvas + Right Property Inspector */}
      <div className="relative flex min-h-0 flex-1 overflow-hidden">
        <EditorToolSidebar
          scene={scene}
          onExecuteMutation={executeMutation}
          onSelectLayerId={setSelectedLayerId}
          onOpenUpload={() => setIsUploadModalOpen(true)}
          onOpenSmartData={() => setShowSmartData(true)}
          onToggleAI={() => setIsAIAssistantOpen((open) => !open)}
          onLoadTemplate={() => handleLoadSample(SAMPLE_POSTERS[0])}
        />
        {/* Layer Panel */}
        <div className="hidden h-full xl:flex">
          <LayerPanel {...layerPanelProps} />
        </div>

        {/* Center Interactive Canvas Artboard */}
        <DesignDocumentCanvas
          scene={scene}
          selectedLayerIds={selectedLayerIds}
          onSelectLayerIds={setSelectedLayerIds}
          onExecuteMutation={executeMutation}
          onCommitTransforms={commitTransforms}
          zoom={zoom}
          onSetZoom={setZoom}
          onFitZoomChange={setFitZoom}
          previewMode={isPreviewMode}
        />

        {/* Property Inspector */}
        <div className="hidden h-full xl:flex">
          <PropertyInspector
            {...textPropertyInspectorProps}
          />
        </div>

        {/* AI Assistant Chat Drawer */}
        {isAIAssistantOpen && (
          <React.Suspense fallback={null}>
            <AIAssistantDrawer
              isOpen={isAIAssistantOpen}
              onClose={() => setIsAIAssistantOpen(false)}
              document={document}
              onApplyOperations={commitDocumentEdit}
            />
          </React.Suspense>
        )}
      </div>

      <div className="fixed inset-x-0 bottom-10 z-40 flex justify-center gap-2 xl:hidden">
        <button
          type="button"
          onClick={() => setIsPreviewMode((value) => !value)}
          aria-pressed={isPreviewMode}
          className="min-h-11 rounded-full border border-neutral-700 bg-neutral-900 px-4 text-xs text-white shadow-lg"
        >
          Preview
        </button>
        <button
          type="button"
          onClick={() => setIsCompareMode((value) => !value)}
          aria-pressed={isCompareMode}
          className="min-h-11 rounded-full border border-neutral-700 bg-neutral-900 px-4 text-xs text-white shadow-lg"
        >
          Compare
        </button>
        <button
          type="button"
          onClick={() => setMobilePanel((panel) => panel === 'layers' ? null : 'layers')}
          className="min-h-11 rounded-full border border-neutral-700 bg-neutral-900 px-4 text-xs text-white shadow-lg"
        >
          Layers
        </button>
        <button
          type="button"
          onClick={() => setMobilePanel((panel) => panel === 'properties' ? null : 'properties')}
          className="min-h-11 rounded-full border border-neutral-700 bg-neutral-900 px-4 text-xs text-white shadow-lg"
        >
          Properties
        </button>
      </div>
      {mobilePanel && (
        <div className="fixed inset-x-0 bottom-20 top-16 z-40 bg-black/40 xl:hidden" onClick={() => setMobilePanel(null)}>
          <div
            className={`mobile-editor-panel absolute bottom-0 top-0 w-[min(88vw,360px)] overflow-hidden border border-neutral-700 bg-neutral-900 shadow-2xl ${mobilePanel === 'layers' ? 'left-0' : 'right-0'}`}
            onClick={(event) => event.stopPropagation()}
          >
            {mobilePanel === 'layers' ? (
              <LayerPanel {...layerPanelProps} />
            ) : (
              <PropertyInspector {...textPropertyInspectorProps} />
            )}
          </div>
        </div>
      )}

      <footer className="flex min-h-10 shrink-0 items-center justify-between gap-2 border-t border-neutral-800 bg-neutral-900 px-3 text-[11px] text-neutral-400">
        <span>{Math.round(zoom * 100)}% · {scene.canvas.width} × {scene.canvas.height} px</span>
        <span className="hidden sm:block">Shift-click to select multiple · Ctrl+D duplicate · Ctrl+G group · arrows nudge</span>
        <span className="hidden md:block">{saveStatus} · Stored on this device</span>
      </footer>

      {/* Modals & Dialogs */}
      {isExportModalOpen && (
        <React.Suspense fallback={null}>
          <ExportModal
            isOpen={isExportModalOpen}
            onClose={() => setIsExportModalOpen(false)}
            scene={scene}
          />
        </React.Suspense>
      )}
      {isUploadModalOpen && (
        <React.Suspense fallback={null}>
          <UploadModal
            isOpen={isUploadModalOpen}
            onClose={() => setIsUploadModalOpen(false)}
            onDeconstructionComplete={(newDocument) => {
              setDesignDocument(newDocument);
            }}
          />
        </React.Suspense>
      )}
      {isFailureReviewOpen && (
        <React.Suspense fallback={null}>
          <FailureModeReview
            isOpen={isFailureReviewOpen}
            onClose={() => setIsFailureReviewOpen(false)}
            scene={scene}
            onSelectLayer={(id) => setSelectedLayerId(id)}
            onExecuteMutation={executeMutation}
          />
        </React.Suspense>
      )}
      {showVersionHistory && (
        <React.Suspense fallback={null}>
          <ProjectVersionsDialog
            projectId={document.id}
            onClose={() => setShowVersionHistory(false)}
            onRestore={(restored) => {
              restoreDesignDocument(restored);
              setShowVersionHistory(false);
              setSaveStatus('Saving...');
            }}
          />
        </React.Suspense>
      )}
      {isCompareMode && (
        <React.Suspense fallback={null}>
          <ComparisonView scene={scene} onClose={() => setIsCompareMode(false)} />
        </React.Suspense>
      )}
      {showSmartData && document && (
        <React.Suspense fallback={null}>
          <SmartDataDialog
            document={document}
            onClose={() => setShowSmartData(false)}
            onExecuteMutation={executeMutation}
          />
        </React.Suspense>
      )}
      {persistenceError && (
        <div role="alert" className="fixed bottom-14 left-1/2 z-50 -translate-x-1/2 rounded-lg border border-rose-500/40 bg-neutral-900 px-4 py-2 text-xs text-rose-200 shadow-xl">
          {persistenceError}
        </div>
      )}
    </div>
  );
}
