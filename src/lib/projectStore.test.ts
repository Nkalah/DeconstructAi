import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { createEmptyDocument, serializeDocument } from '../core/schema/designDocument';
import { encodeDocumentAssets } from './projectStore';

describe('local project asset encoding', () => {
  it('stores generated images separately and retains original poster references', async () => {
    const document = createEmptyDocument({ id: 'project-encoding' });
    document.originalAsset = { assetId: 'original-asset' };
    document.assets['original-asset'] = {
      id: 'original-asset',
      mimeType: 'image/jpeg',
      uri: 'blob:https://local/original',
      name: 'poster.jpg',
    };
    document.assets['original-projectEncoding'] = {
      id: 'original-projectEncoding',
      mimeType: 'image/jpeg',
      uri: 'blob:https://local/original',
      name: 'Poster (raster fallback)',
    };
    document.assets['generated-crop'] = {
      id: 'generated-crop',
      mimeType: 'image/png',
      uri: 'data:image/png;base64,AQID',
      name: 'Product crop',
    };
    document.assets['generated-vector'] = {
      id: 'generated-vector',
      mimeType: 'image/svg+xml',
      uri: 'data:image/svg+xml,%3Csvg%3E%3C%2Fsvg%3E',
      name: 'Generated vector',
    };

    const encoded = await encodeDocumentAssets(document, document.id);
    assert.equal(encoded.assets.length, 2);
    assert.equal(encoded.document.assets['original-asset'].uri, 'poster-original://original-asset');
    assert.equal(encoded.document.assets['original-projectEncoding'].uri, 'poster-original://original-asset');
    assert.match(encoded.document.assets['generated-crop'].uri, /^project-asset:\/\//);
    assert.match(encoded.document.assets['generated-vector'].uri, /^project-asset:\/\//);
    assert.deepEqual(Array.from(new Uint8Array(await encoded.assets[0].blob.arrayBuffer())), [1, 2, 3]);
    assert.equal(JSON.parse(serializeDocument(encoded.document)).id, document.id);
  });
});
