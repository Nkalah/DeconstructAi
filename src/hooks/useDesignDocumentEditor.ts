import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { DesignDocumentSchema, type DesignDocument } from '../core/schema/designDocument';
import type { Layer, LayerTransform, MutationOperation, SceneGraph } from '../types/sceneGraph';
import { documentToSceneGraph } from '../lib/documentToSceneGraph';
import { sceneGraphToDesignDocument } from '../lib/sceneGraphToDesignDocument';
import { applyMutation } from '../lib/sceneGraphMutations';
import { DocumentHistory } from '../lib/documentHistory';

export function useDesignDocumentEditor(initialDocument: DesignDocument | null) {
  const [document, setDocumentState] = useState<DesignDocument | null>(initialDocument);
  const [selectedLayerIds, setSelectedLayerIds] = useState<string[]>([]);
  const [zoom, setZoom] = useState(0.65);
  const [lastActionSummary, setLastActionSummary] = useState('Ready');
  const [isDirty, setIsDirty] = useState(false);
  const documentRef = useRef(document);
  documentRef.current = document;
  const history = useRef<DocumentHistory<DesignDocument> | null>(null);
  if (!history.current) history.current = new DocumentHistory((value) => structuredClone(value), 100);
  const [canUndo, setCanUndo] = useState(false);
  const [canRedo, setCanRedo] = useState(false);

  useEffect(() => {
    setDocumentState(initialDocument);
    setSelectedLayerIds([]);
    history.current?.clear();
    setCanUndo(false);
    setCanRedo(false);
    setIsDirty(false);
  }, [initialDocument?.id]);

  const scene = useMemo(() => document ? documentToSceneGraph(document) : null, [document]);
  const selectedLayer = scene?.layers.find((layer) => layer.id === selectedLayerIds[0]) ?? null;

  const updateHistory = useCallback(() => {
    setCanUndo(history.current?.canUndo ?? false);
    setCanRedo(history.current?.canRedo ?? false);
  }, []);

  const captureReconstructedText = useCallback((input: DesignDocument): DesignDocument => {
    const next = structuredClone(input);
    for (const layer of next.layers) {
      if (layer.type !== 'text' || layer.reconstructedOriginal) continue;
      layer.reconstructedOriginal = {
        text: layer.text,
        x: layer.x,
        y: layer.y,
        width: layer.width,
        height: layer.height,
        rotation: layer.rotation,
        opacity: layer.opacity,
        fontFamily: layer.fontFamily,
        fontSize: layer.fontSize,
        fontWeight: layer.fontWeight,
        fontStyle: layer.fontStyle,
        lineHeight: layer.lineHeight,
        letterSpacing: layer.letterSpacing,
        align: layer.align,
        fill: layer.fill,
        stroke: layer.stroke ? { ...layer.stroke } : null,
        shadow: layer.shadow ? { ...layer.shadow } : null,
        direction: layer.direction ?? 'auto',
        uncertain: layer.uncertain,
        fontFamilyConfidence: layer.fontCandidates?.find((candidate) => candidate.family === layer.fontFamily)?.confidence
          ?? layer.confidence
          ?? 0
      };
    }
    return next;
  }, []);

  const commitScene = useCallback((nextScene: SceneGraph, summary: string) => {
    if (!document) return;
    history.current?.record(document);
    updateHistory();
    setDocumentState(sceneGraphToDesignDocument(nextScene, document));
    setIsDirty(true);
    setLastActionSummary(summary);
  }, [document, updateHistory]);

  const setDesignDocument = useCallback((next: DesignDocument, dirty = true) => {
    history.current?.clear();
    updateHistory();
    setDocumentState(captureReconstructedText(next));
    setIsDirty(dirty);
    setSelectedLayerIds([]);
  }, [updateHistory, captureReconstructedText]);

  const clearDesignDocument = useCallback(() => {
    history.current?.clear();
    updateHistory();
    setDocumentState(null);
    setSelectedLayerIds([]);
    setIsDirty(false);
  }, [updateHistory]);

  const restoreDesignDocument = useCallback((next: DesignDocument) => {
    if (document) history.current?.record(document);
    updateHistory();
    setDocumentState(captureReconstructedText(next));
    setSelectedLayerIds([]);
    setIsDirty(true);
    setLastActionSummary('Restored a saved version');
  }, [document, updateHistory, captureReconstructedText]);

  const renameDocument = useCallback((name: string) => {
    if (!document || !name.trim()) return;
    history.current?.record(document);
    updateHistory();
    setDocumentState({ ...document, name: name.trim(), updatedAt: new Date().toISOString() });
    setIsDirty(true);
    setLastActionSummary(`Renamed project to "${name.trim()}"`);
  }, [document, updateHistory]);

  const setScene = useCallback((nextScene: SceneGraph) => {
    const next = sceneGraphToDesignDocument(nextScene, document ?? undefined);
    setDesignDocument(next);
  }, [document, setDesignDocument]);

  const commitDocumentEdit = useCallback((nextDocument: DesignDocument, summary: string) => {
    if (!document) throw new Error('Cannot apply an assistant edit without an active document.');
    const validated = DesignDocumentSchema.parse(nextDocument);
    if (validated.id !== document.id) throw new Error('An assistant edit cannot change the active document id.');
    history.current?.record(document);
    updateHistory();
    setDocumentState(validated);
    setIsDirty(true);
    setLastActionSummary(summary);
  }, [document, updateHistory]);

  const executeMutation = useCallback((operation: MutationOperation) => {
    if (!scene) return;
    const result = applyMutation(scene, operation);
    commitScene(result.scene, result.summary);
    if (operation.layer_id) setSelectedLayerIds([operation.layer_id]);
  }, [scene, commitScene]);

  const undo = useCallback(() => {
    if (!document || !history.current?.canUndo) return;
    const previous = history.current.undo(document);
    if (!previous) return;
    setDocumentState(previous);
    setIsDirty(true);
    updateHistory();
  }, [document, updateHistory]);

  const redo = useCallback(() => {
    if (!document || !history.current?.canRedo) return;
    const next = history.current.redo(document);
    if (!next) return;
    setDocumentState(next);
    setIsDirty(true);
    updateHistory();
  }, [document, updateHistory]);

  const duplicateLayers = useCallback((ids: string[]) => {
    if (!scene) return;
    const targets = scene.layers.filter((layer) => ids.includes(layer.id) && layer.type !== 'background_fill');
    if (!targets.length) return;
    let nextScene = scene;
    const newIds: string[] = [];
    for (const target of targets) {
      const clone = structuredClone(target) as Layer;
      clone.id = `${target.type}-${crypto.randomUUID()}`;
      clone.name = `${target.name} copy`;
      clone.transform.x += 20;
      clone.transform.y += 20;
      newIds.push(clone.id);
      nextScene = applyMutation(nextScene, { type: 'add_layer', params: { layer: clone } }).scene;
    }
    commitScene(nextScene, `Duplicated ${targets.length} layer(s)`);
    setSelectedLayerIds(newIds);
  }, [scene, commitScene]);

  const deleteLayers = useCallback((ids: string[]) => {
    if (!scene) return;
    let nextScene = scene;
    let deletedCount = 0;
    for (const id of ids) {
      const target = nextScene.layers.find((layer) => layer.id === id);
      if (target && target.type !== 'background_fill' && !target.locked) {
        nextScene = applyMutation(nextScene, { type: 'delete_layer', layer_id: id, params: {} }).scene;
        deletedCount += 1;
      }
    }
    if (deletedCount) {
      commitScene(nextScene, `Deleted ${deletedCount} layer(s)`);
      setSelectedLayerIds([]);
    }
  }, [scene, commitScene]);

  const groupLayers = useCallback((ids: string[]) => {
    if (!document || ids.length < 2) return;
    const selected = document.layers.filter((layer) => ids.includes(layer.id) && layer.type !== 'group');
    if (selected.length < 2) return;
    const groupId = `group-${crypto.randomUUID()}`;
    const next = structuredClone(document);
    const oldGroupIds = new Set(selected.flatMap((layer) => layer.groupId ? [layer.groupId] : []));
    for (const oldGroupId of oldGroupIds) {
      const oldGroup = next.layers.find((layer) => layer.id === oldGroupId && layer.type === 'group');
      if (!oldGroup || oldGroup.type !== 'group') continue;
      oldGroup.childIds = oldGroup.childIds.filter((childId) => !ids.includes(childId));
    }
    next.layers = next.layers.filter((layer) => layer.type !== 'group' || layer.childIds.length > 0);
    for (const layer of next.layers) {
      if (ids.includes(layer.id) && layer.type !== 'group') layer.groupId = groupId;
    }
    const left = Math.min(...selected.map((layer) => layer.x));
    const top = Math.min(...selected.map((layer) => layer.y));
    const right = Math.max(...selected.map((layer) => layer.x + layer.width));
    const bottom = Math.max(...selected.map((layer) => layer.y + layer.height));
    next.layers.push({
      id: groupId,
      type: 'group',
      name: 'Group',
      x: left,
      y: top,
      width: right - left,
      height: bottom - top,
      rotation: 0,
      opacity: 1,
      zIndex: -1,
      locked: false,
      visible: true,
      source: { origin: 'user', originalBBox: null },
      confidence: null,
      needsReview: false,
      childIds: selected.map((layer) => layer.id)
    });
    history.current?.record(document);
    updateHistory();
    setDocumentState(next);
    setSelectedLayerIds(selected.map((layer) => layer.id));
    setIsDirty(true);
    setLastActionSummary(`Grouped ${selected.length} layers`);
  }, [document, updateHistory]);

  const ungroupLayers = useCallback((ids: string[]) => {
    if (!document) return;
    const groupIds = new Set(document.layers.flatMap((layer) =>
      ids.includes(layer.id) && layer.type !== 'group' && layer.groupId ? [layer.groupId] : [],
    ));
    if (!groupIds.size) return;
    const next = structuredClone(document);
    const ungroupedIds: string[] = [];
    for (const layer of next.layers) {
      if (layer.type !== 'group' && layer.groupId && groupIds.has(layer.groupId)) {
        delete layer.groupId;
        ungroupedIds.push(layer.id);
      }
    }
    next.layers = next.layers.filter((layer) => layer.type !== 'group' || !groupIds.has(layer.id));
    history.current?.record(document);
    updateHistory();
    setDocumentState(next);
    setSelectedLayerIds(ungroupedIds);
    setIsDirty(true);
    setLastActionSummary(`Ungrouped ${ungroupedIds.length} layers`);
  }, [document, updateHistory]);

  const moveLayers = useCallback((ids: string[], dx: number, dy: number) => {
    if (!scene || (!dx && !dy)) return;
    const nextScene = structuredClone(scene);
    for (const layer of nextScene.layers) {
      if (ids.includes(layer.id) && !layer.locked) {
        layer.transform.x += dx;
        layer.transform.y += dy;
      }
    }
    commitScene(nextScene, `Moved ${ids.length} layer(s)`);
  }, [scene, commitScene]);

  const commitTransforms = useCallback((transforms: Record<string, LayerTransform>) => {
    if (!scene) return;
    const nextScene = structuredClone(scene);
    for (const layer of nextScene.layers) {
      const transform = transforms[layer.id];
      if (transform && !layer.locked) layer.transform = { ...transform };
    }
    commitScene(nextScene, `Transformed ${Object.keys(transforms).length} layer(s)`);
  }, [scene, commitScene]);

  const resetLayerToOriginal = useCallback((layerId: string) => {
    if (!scene || !document) return;
    const original = document.layers.find((layer) => layer.id === layerId);
    if (!original || original.type !== 'text' || !original.reconstructedOriginal) return;
    const baseline = original.reconstructedOriginal;
    const mutations: MutationOperation[] = [
      {
        type: 'update_text',
        layer_id: layerId,
        params: {
          content: baseline.text,
          direction: baseline.direction ?? 'auto',
          uncertain: baseline.uncertain,
          font_family_confidence: baseline.fontFamilyConfidence,
          font_family: baseline.fontFamily,
          font_size: baseline.fontSize,
          font_weight: baseline.fontWeight,
          font_style: baseline.fontStyle,
          line_height: baseline.lineHeight,
          letter_spacing: baseline.letterSpacing,
          alignment: baseline.align
        }
      },
      { type: 'set_color', layer_id: layerId, params: { color: baseline.fill } },
      {
        type: 'set_effect',
        layer_id: layerId,
        params: {
          opacity: baseline.opacity,
          stroke: baseline.stroke
            ? { enabled: true, width: baseline.stroke.width, color: baseline.stroke.color }
            : { enabled: false },
          shadow: baseline.shadow
            ? {
              enabled: true,
              offset_x: baseline.shadow.offsetX,
              offset_y: baseline.shadow.offsetY,
              blur: baseline.shadow.blur,
              color: baseline.shadow.color,
              opacity: baseline.shadow.opacity
            }
            : { enabled: false }
        }
      },
      {
        type: 'update_transform',
        layer_id: layerId,
        params: {
          transform: {
            x: baseline.x,
            y: baseline.y,
            width: baseline.width,
            height: baseline.height,
            rotation: baseline.rotation
          }
        }
      }
    ];
    const result = applyMutation(scene, { type: 'batch_mutation', params: { mutations }, description: 'Reset text to reconstructed original' });
    commitScene(result.scene, `Reset "${original.name}" to reconstructed original`);
  }, [scene, document, commitScene]);

  const markSaved = useCallback((savedDocument?: DesignDocument) => {
    if (!savedDocument || documentRef.current === savedDocument) setIsDirty(false);
  }, []);
  const resetZoom = useCallback(() => setZoom(0.65), []);

  return {
    document,
    scene,
    selectedLayerIds,
    selectedLayerId: selectedLayerIds[0] ?? null,
    setSelectedLayerIds,
    setSelectedLayerId: (id: string | null) => setSelectedLayerIds(id ? [id] : []),
    selectedLayer,
    executeMutation,
    undo,
    redo,
    canUndo,
    canRedo,
    zoom,
    setZoom,
    resetZoom,
    isDirty,
    lastActionSummary,
    setDesignDocument,
    clearDesignDocument,
    restoreDesignDocument,
    renameDocument,
    setScene,
    commitDocumentEdit,
    duplicateLayers,
    deleteLayers,
    groupLayers,
    ungroupLayers,
    moveLayers,
    commitTransforms,
    resetLayerToOriginal,
    markSaved
  };
}
