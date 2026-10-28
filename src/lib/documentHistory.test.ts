import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { DocumentHistory } from './documentHistory';
import { createEmptyDocument, type DesignDocument } from '../core/schema/designDocument';
import { documentToSceneGraph } from './documentToSceneGraph';
import { sceneGraphToDesignDocument } from './sceneGraphToDesignDocument';
import { applyMutation } from './sceneGraphMutations';

describe('bounded document history', () => {
  it('supports undo/redo for document-level edits and clears redo after a new edit', () => {
    const history = new DocumentHistory((value: { value: number }) => structuredClone(value), 10);
    let document = { value: 0 };

    for (const nextValue of [1, 2, 3, 4, 5, 6, 7, 8]) {
      history.record(document);
      document = { value: nextValue };
    }

    for (let expected = 7; expected >= 0; expected -= 1) {
      const previous = history.undo(document);
      assert.ok(previous);
      document = previous;
      assert.equal(document.value, expected);
    }
    assert.equal(history.canUndo, false);

    const redone = history.redo(document);
    assert.deepEqual(redone, { value: 1 });
    assert.equal(history.canRedo, true);
    history.record(redone!);
    assert.equal(history.canRedo, false);
  });

  it('retains only the configured number of snapshots', () => {
    const history = new DocumentHistory((value: number) => value, 2);
    history.record(0);
    history.record(1);
    history.record(2);
    assert.equal(history.undo(3), 2);
    assert.equal(history.undo(2), 1);
    assert.equal(history.undo(1), null);
  });

  it('undoes and redoes move, resize, text, delete, group, reorder, and AI edit commits', () => {
    const initial = createEmptyDocument({ id: 'history-coverage' });
    initial.layers = [
      {
        id: 'history-title',
        type: 'text',
        name: 'Title',
        x: 10,
        y: 12,
        width: 200,
        height: 40,
        rotation: 0,
        opacity: 1,
        zIndex: 1,
        locked: false,
        visible: true,
        source: { origin: 'ocr', originalBBox: { x: 10, y: 12, width: 200, height: 40 } },
        confidence: 0.9,
        needsReview: false,
        text: 'Original',
        fontFamily: 'Inter',
        fontSize: 32,
        fontWeight: 700,
        fontStyle: 'normal',
        lineHeight: 1.2,
        letterSpacing: 0,
        align: 'left',
        fill: '#111111',
        stroke: null,
        shadow: null,
        effects: [],
        uncertain: false,
      },
      {
        id: 'history-shape',
        type: 'shape',
        name: 'Card',
        x: 20,
        y: 80,
        width: 100,
        height: 50,
        rotation: 0,
        opacity: 1,
        zIndex: 2,
        locked: false,
        visible: true,
        source: { origin: 'detector', originalBBox: { x: 20, y: 80, width: 100, height: 50 } },
        confidence: 0.9,
        needsReview: false,
        shapeType: 'rect',
        fill: '#ffffff',
        gradient: null,
        stroke: null,
        strokeWidth: 0,
        cornerRadius: 0,
      },
    ];

    const applyScene = (document: DesignDocument, operation: Parameters<typeof applyMutation>[1]) => {
      const scene = documentToSceneGraph(document);
      return sceneGraphToDesignDocument(applyMutation(scene, operation).scene, document);
    };
    const history = new DocumentHistory<DesignDocument>((document) => structuredClone(document), 100);
    let document = initial;
    const committed: DesignDocument[] = [];
    const commit = (update: (current: DesignDocument) => DesignDocument) => {
      history.record(document);
      document = update(document);
      committed.push(structuredClone(document));
    };

    commit((current) => applyScene(current, {
      type: 'update_transform',
      layer_id: 'history-title',
      params: { transform: { x: 45, y: 60 } },
    }));
    commit((current) => applyScene(current, {
      type: 'update_transform',
      layer_id: 'history-title',
      params: { transform: { width: 300, height: 75 } },
    }));
    commit((current) => applyScene(current, {
      type: 'update_text',
      layer_id: 'history-title',
      params: { content: 'Edited copy' },
    }));
    commit((current) => applyScene(current, {
      type: 'delete_layer',
      layer_id: 'history-shape',
      params: {},
    }));
    commit((current) => {
      const next = structuredClone(current);
      const groupId = 'history-group';
      const children = next.layers.filter((layer) => layer.type !== 'group');
      for (const child of children) child.groupId = groupId;
      next.layers.push({
        id: groupId,
        type: 'group',
        name: 'Group',
        x: 0,
        y: 0,
        width: 400,
        height: 300,
        rotation: 0,
        opacity: 1,
        zIndex: -1,
        locked: false,
        visible: true,
        source: { origin: 'user', originalBBox: null },
        confidence: null,
        needsReview: false,
        childIds: children.map((layer) => layer.id),
      });
      return next;
    });
    commit((current) => applyScene(current, {
      type: 'reorder_layer',
      layer_id: 'history-title',
      params: { new_z_index: 1 },
    }));
    commit((current) => applyScene(current, {
      type: 'batch_mutation',
      description: 'AI edit',
      params: {
        mutations: [
          { type: 'update_text', layer_id: 'history-title', params: { content: 'AI revised copy' } },
          { type: 'set_color', layer_id: 'history-title', params: { color: '#336699' } },
        ],
      },
    }));

    for (let index = committed.length - 1; index >= 0; index -= 1) {
      const previous = history.undo(document);
      assert.ok(previous);
      document = previous;
      assert.deepEqual(document, index === 0 ? initial : committed[index - 1]);
    }
    for (const expected of committed) {
      const next = history.redo(document);
      assert.ok(next);
      document = next;
      assert.deepEqual(document, expected);
    }
    assert.equal(document.layers.find((layer) => layer.id === 'history-title')?.type === 'text'
      && document.layers.find((layer) => layer.id === 'history-title')?.text, 'AI revised copy');
  });
});
