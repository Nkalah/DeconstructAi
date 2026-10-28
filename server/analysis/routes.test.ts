import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { parseImagePayload, validateAnalysisDimensions } from './routes.js';

describe('analysis upload validation', () => {
  it('rejects a declared image MIME type that does not match the image bytes', () => {
    const png = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
    assert.throws(() => parseImagePayload(`data:image/jpeg;base64,${png.toString('base64')}`), /do not match/);
  });

  it('accepts supported image signatures and enforces decoded canvas limits', () => {
    const png = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
    assert.equal(parseImagePayload(`data:image/png;base64,${png.toString('base64')}`).mimeType, 'image/png');
    assert.doesNotThrow(() => validateAnalysisDimensions(30_000, 3_000));
    assert.throws(() => validateAnalysisDimensions(30_001, 1), /30,000/);
    assert.throws(() => validateAnalysisDimensions(10_001, 10_000), /100 million/);
    assert.throws(() => validateAnalysisDimensions(1.5, 10), /whole pixels/);
  });
});
