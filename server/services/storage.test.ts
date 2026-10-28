import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { createEmptyDocument } from '../../src/core/schema/designDocument.js';
import { documentToSceneGraph } from '../../src/lib/documentToSceneGraph.js';
import { store } from './storage.js';

describe('server-side project deletion', () => {
  it('removes synced document and scene assets by project id', () => {
    const document = createEmptyDocument({ id: 'delete-private-project' });
    store.saveDocument(document);
    store.saveDesign(documentToSceneGraph(document));

    store.deleteDocument(document.id);

    assert.equal(store.getDocument(document.id), undefined);
    assert.equal(store.getDesign(document.id), undefined);
  });
});
