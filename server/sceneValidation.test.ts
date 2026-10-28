import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { createEmptyDocument } from '../src/core/schema/designDocument.js';
import { documentToSceneGraph } from '../src/lib/documentToSceneGraph.js';
import { SceneGraphSchema } from './sceneValidation.js';

describe('server-side scene validation', () => {
  it('accepts a valid converted design and rejects unsafe canvas sizes and malformed layers', () => {
    const scene = documentToSceneGraph(createEmptyDocument({ id: 'validated-scene' }));
    assert.equal(SceneGraphSchema.safeParse(scene).success, true);
    assert.equal(SceneGraphSchema.safeParse({
      ...scene,
      canvas: { ...scene.canvas, width: 100_000, height: 100_000 }
    }).success, false);
    assert.equal(SceneGraphSchema.safeParse({ ...scene, layers: [{ id: 'bad' }] }).success, false);
  });
});
