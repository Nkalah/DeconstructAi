import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { createEmptyDocument } from '../../src/core/schema/designDocument.js';
import { summarizeDocumentForAssistant } from '../../src/lib/assistantOperations.js';
import { AssistantUnavailableError, processAssistantCommand } from './aiAssistant.js';

describe('AI provider failure handling', () => {
  it('returns an explicit unavailable error without changing the document when no provider is configured', async () => {
    const previousKey = process.env.GEMINI_API_KEY;
    delete process.env.GEMINI_API_KEY;
    const document = createEmptyDocument({ id: 'manual-edit-still-available' });

    try {
      await assert.rejects(
        processAssistantCommand('Add a heading', summarizeDocumentForAssistant(document)),
        (error: unknown) => error instanceof AssistantUnavailableError && /Manual editing is still available/.test(error.message)
      );
      assert.deepEqual(document.layers, []);
    } finally {
      if (previousKey === undefined) delete process.env.GEMINI_API_KEY;
      else process.env.GEMINI_API_KEY = previousKey;
    }
  });
});
