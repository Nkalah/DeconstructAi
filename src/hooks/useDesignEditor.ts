import { useState, useCallback, useRef, useEffect } from 'react';
import { SceneGraph, Layer, MutationOperation } from '../types/sceneGraph';
import { applyMutation } from '../lib/sceneGraphMutations';

export interface UseDesignEditorReturn {
  scene: SceneGraph | null;
  setScene: (scene: SceneGraph) => void;
  selectedLayerId: string | null;
  setSelectedLayerId: (id: string | null) => void;
  selectedLayer: Layer | null;
  executeMutation: (op: MutationOperation) => void;
  undo: () => void;
  redo: () => void;
  canUndo: boolean;
  canRedo: boolean;
  zoom: number;
  setZoom: (z: number | ((prev: number) => number)) => void;
  resetZoom: () => void;
  isDirty: boolean;
  lastActionSummary: string;
}

export function useDesignEditor(initialScene: SceneGraph | null) {
  const [scene, setSceneState] = useState<SceneGraph | null>(initialScene);
  const [selectedLayerId, setSelectedLayerId] = useState<string | null>(null);
  const [zoom, setZoom] = useState<number>(0.65);
  const [lastActionSummary, setLastActionSummary] = useState<string>('Ready');

  // History stacks
  const historyRef = useRef<SceneGraph[]>([]);
  const futureRef = useRef<SceneGraph[]>([]);
  const [canUndo, setCanUndo] = useState<boolean>(false);
  const [canRedo, setCanRedo] = useState<boolean>(false);
  const [isDirty, setIsDirty] = useState<boolean>(false);

  // Sync initial scene
  useEffect(() => {
    if (initialScene && (!scene || scene.design_id !== initialScene.design_id)) {
      setSceneState(initialScene);
      historyRef.current = [];
      futureRef.current = [];
      setCanUndo(false);
      setCanRedo(false);
      setIsDirty(false);
      // Auto select headline or first text layer
      const firstText = initialScene.layers.find(l => l.type === 'text');
      if (firstText) {
        setSelectedLayerId(firstText.id);
      }
    }
  }, [initialScene]);

  const updateHistoryState = useCallback(() => {
    setCanUndo(historyRef.current.length > 0);
    setCanRedo(futureRef.current.length > 0);
  }, []);

  const setScene = useCallback((newScene: SceneGraph) => {
    if (scene) {
      historyRef.current.push(JSON.parse(JSON.stringify(scene)));
      if (historyRef.current.length > 50) historyRef.current.shift();
      futureRef.current = [];
      updateHistoryState();
      setIsDirty(true);
    }
    setSceneState(newScene);
  }, [scene, updateHistoryState]);

  const executeMutation = useCallback((op: MutationOperation) => {
    if (!scene) return;
    
    // Save current to history
    historyRef.current.push(JSON.parse(JSON.stringify(scene)));
    if (historyRef.current.length > 50) historyRef.current.shift();
    futureRef.current = [];

    const result = applyMutation(scene, op);
    setSceneState(result.scene);
    setLastActionSummary(result.summary);
    updateHistoryState();
    setIsDirty(true);

    // If target layer was updated, keep it selected
    if (op.layer_id) {
      setSelectedLayerId(op.layer_id);
    }
  }, [scene, updateHistoryState]);

  const undo = useCallback(() => {
    if (historyRef.current.length === 0 || !scene) return;
    const prev = historyRef.current.pop()!;
    futureRef.current.push(JSON.parse(JSON.stringify(scene)));
    setSceneState(prev);
    setLastActionSummary('Undo previous change');
    updateHistoryState();
    setIsDirty(true);
  }, [scene, updateHistoryState]);

  const redo = useCallback(() => {
    if (futureRef.current.length === 0 || !scene) return;
    const next = futureRef.current.pop()!;
    historyRef.current.push(JSON.parse(JSON.stringify(scene)));
    setSceneState(next);
    setLastActionSummary('Redo change');
    updateHistoryState();
    setIsDirty(true);
  }, [scene, updateHistoryState]);

  // Keyboard shortcut listener for Undo/Redo
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Don't trigger if typing in an input or textarea
      const target = e.target as HTMLElement;
      if (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable) {
        return;
      }

      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'z') {
        e.preventDefault();
        if (e.shiftKey) {
          redo();
        } else {
          undo();
        }
      } else if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'y') {
        e.preventDefault();
        redo();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [undo, redo]);

  const resetZoom = useCallback(() => {
    setZoom(0.65);
  }, []);

  const selectedLayer = scene?.layers.find(l => l.id === selectedLayerId) || null;

  return {
    scene,
    setScene,
    selectedLayerId,
    setSelectedLayerId,
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
    lastActionSummary
  };
}
