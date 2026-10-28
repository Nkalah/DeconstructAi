import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { createEmptyDocument, DesignLayerSchema } from '../core/schema/designDocument';
import {
  applyAssistantOperations,
  AssistantDocumentSummarySchema,
  summarizeDocumentForAssistant,
  validateAssistantOperations
} from './assistantOperations';

function makeTextLayer(id: string, name: string, text: string) {
  return DesignLayerSchema.parse({
    id,
    type: 'text',
    name,
    x: 20,
    y: 30,
    width: 260,
    height: 60,
    rotation: 0,
    opacity: 1,
    zIndex: 0,
    locked: false,
    visible: true,
    source: { origin: 'ocr', originalBBox: null },
    confidence: 0.9,
    needsReview: false,
    text,
    fontFamily: 'Arial',
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
    uncertain: false
  });
}

describe('structured AI assistant operations', () => {
  it('summarizes the document and applies multiple validated edits to the structured document', () => {
    const document = createEmptyDocument({ id: 'assistant-test', width: 1080, height: 1350 });
    document.layers = [
      makeTextLayer('business-name', 'Business name', 'Old Business'),
      makeTextLayer('phone', 'Phone', 'Call 555-123-4567')
    ];
    const summary = summarizeDocumentForAssistant(document);
    assert.deepEqual(AssistantDocumentSummarySchema.parse(summary), summary);
    assert.equal(summary.layers[0].text, 'Old Business');
    assert.equal(summary.layers[0].x, 20);

    const operations = validateAssistantOperations([
      { op: 'replaceText', layerId: 'business-name', text: 'New Business' },
      { op: 'replaceText', layerId: 'phone', text: 'Call 555-000-1111' },
      { op: 'resizeCanvas', width: 210, height: 297, unit: 'mm' }
    ], summary);
    const edited = applyAssistantOperations(document, operations);

    assert.equal(edited.layers.find((layer) => layer.id === 'business-name')?.type, 'text');
    const title = edited.layers.find((layer) => layer.id === 'business-name');
    assert.equal(title?.type === 'text' ? title.text : '', 'New Business');
    assert.equal(edited.canvas.width, 210);
    assert.equal(edited.canvas.height, 297);
    assert.equal(edited.canvas.unit, 'mm');
    assert.notEqual(edited.layers[0].x, document.layers[0].x);
  });

  it('rejects unknown operations, unknown ids, invalid target types, and locked layers', () => {
    const document = createEmptyDocument({ id: 'assistant-validation' });
    document.layers = [makeTextLayer('locked-title', 'Locked title', 'Keep me')];
    document.layers[0].locked = true;
    const summary = summarizeDocumentForAssistant(document);

    assert.throws(() => validateAssistantOperations([{ op: 'paintPoster', layerId: 'locked-title' }], summary));
    assert.throws(() => validateAssistantOperations([{ op: 'replaceText', layerId: 'missing', text: 'Nope' }], summary), /unknown layer/);
    assert.throws(() => validateAssistantOperations([{ op: 'replaceText', layerId: 'locked-title', text: 'Nope' }], summary), /locked layer/);
    assert.throws(() => validateAssistantOperations([{ op: 'translateText', layerId: 'locked-title', translatedText: 'Nope' }], summary), /locked layer/);
    assert.throws(() => validateAssistantOperations([{ op: 'reorder', layerId: 'locked-title', position: 2 }], summary), /locked layer/);
    assert.throws(() => validateAssistantOperations([{ op: 'resizeCanvas', width: 1080, height: 1080 }], summary), /locked layers/);
  });

  it('groups, reorders, and validates edits to created layers', () => {
    const document = createEmptyDocument({ id: 'assistant-groups' });
    document.layers = [
      makeTextLayer('one', 'One', 'First'),
      makeTextLayer('two', 'Two', 'Second')
    ];
    const summary = summarizeDocumentForAssistant(document);
    const groupLayer = {
      id: 'created-title',
      type: 'text',
      name: 'New title',
      x: 100,
      y: 100,
      width: 300,
      height: 60,
      rotation: 0,
      opacity: 1,
      zIndex: 2,
      locked: false,
      visible: true,
      source: { origin: 'user', originalBBox: null },
      confidence: null,
      needsReview: false,
      text: 'Created text',
      fontFamily: 'Arial',
      fontSize: 28,
      fontWeight: 700,
      fontStyle: 'normal',
      lineHeight: 1.2,
      letterSpacing: 0,
      align: 'left',
      fill: '#111111',
      stroke: null,
      shadow: null,
      effects: [],
      uncertain: false
    };
    const operations = validateAssistantOperations([
      { op: 'createLayer', layer: groupLayer },
      { op: 'replaceText', layerId: 'created-title', text: 'Created and edited' },
      { op: 'groupLayers', layerIds: ['one', 'two'], name: 'Services' },
      { op: 'reorder', layerId: 'created-title', position: 0 }
    ], summary);
    const edited = applyAssistantOperations(document, operations);

    assert.equal(edited.layers.find((layer) => layer.id === 'created-title')?.type === 'text'
      ? edited.layers.find((layer) => layer.id === 'created-title')?.text
      : undefined, 'Created and edited');
    assert.ok(edited.layers.some((layer) => layer.type === 'group' && layer.name === 'Services'));
  });
});
