import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { createEmptyDocument, type DesignDocument } from '../core/schema/designDocument';
import { DocumentHistory } from './documentHistory';
import { documentToSceneGraph } from './documentToSceneGraph';
import { sceneGraphToDesignDocument } from './sceneGraphToDesignDocument';
import { applyMutation } from './sceneGraphMutations';

describe('QR code layer updates', () => {
  it('regenerates a QR in place without replacing the original poster and supports undo', () => {
    const document = createEmptyDocument({ id: 'qr-document', width: 800, height: 1000 });
    document.assets['poster-original'] = {
      id: 'poster-original',
      mimeType: 'image/png',
      uri: 'data:image/png;base64,cG9zdGVy',
      name: 'Original poster'
    };
    document.layers.push({
      id: 'detected-qr',
      type: 'qr',
      name: 'QR code',
      x: 600,
      y: 700,
      width: 120,
      height: 120,
      rotation: 0,
      opacity: 1,
      zIndex: 5,
      locked: false,
      visible: true,
      source: { origin: 'detector', originalBBox: { x: 600, y: 700, width: 120, height: 120 } },
      confidence: 0.5,
      needsReview: true,
      value: null,
      assetId: 'poster-original',
      crop: { x: 600, y: 700, width: 120, height: 120 },
      decodedOk: false,
      errorCorrection: 'M'
    });
    const history = new DocumentHistory<DesignDocument>((value) => structuredClone(value));
    const scene = documentToSceneGraph(document);
    const historyDocument = sceneGraphToDesignDocument(scene, document);
    history.record(historyDocument);
    const updatedScene = applyMutation(scene, {
      type: 'update_qr',
      layer_id: 'detected-qr',
      params: { value: 'https://example.test/new', image_url: 'data:image/png;base64,cXJjb2Rl' }
    }).scene;
    const updated = sceneGraphToDesignDocument(updatedScene, historyDocument);
    const qr = updated.layers.find((layer) => layer.type === 'qr');

    assert.equal(qr?.type === 'qr' && qr.value, 'https://example.test/new');
    assert.equal(qr?.type === 'qr' && qr.decodedOk, true);
    assert.equal(qr?.type === 'qr' && qr.generated, true);
    assert.equal(qr?.type === 'qr' && qr.crop, null);
    assert.equal(qr?.type === 'qr' && qr.assetId, 'qr-detected-qr');
    assert.equal(updated.assets['poster-original'].uri, 'data:image/png;base64,cG9zdGVy');
    const undone = history.undo(updated);
    const originalQr = undone?.layers.find((layer) => layer.type === 'qr');
    assert.equal(originalQr?.type === 'qr' && originalQr.value, null);
    assert.equal(originalQr?.type === 'qr' && originalQr.crop?.x, 600);
  });
});
