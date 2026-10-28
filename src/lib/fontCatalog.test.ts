import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { matchFontCandidatesSafely } from './fontCatalog';

describe('font matching fallback', () => {
  it('offers closest category-matched font choices if font detection throws', () => {
    const result = matchFontCandidatesSafely(
      { category: 'serif' },
      () => { throw new Error('simulated font detector failure'); }
    );

    assert.equal(result.failed, true);
    assert.equal(result.isApproximate, true);
    assert.equal(result.topFont, 'Playfair Display');
    assert.deepEqual(result.candidates.map((candidate) => candidate.family), [
      'Playfair Display', 'Lora', 'Libre Baskerville'
    ]);
    assert.ok(result.candidates.every((candidate) => candidate.confidence < 0.75));
  });
});
