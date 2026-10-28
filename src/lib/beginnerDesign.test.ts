import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { validateDocument } from '../core/schema/designDocument';
import { BEGINNER_DESIGN_PRESETS, createBeginnerDesignDocument } from './beginnerDesign';

describe('beginner design presets', () => {
  it('creates a valid blank document at the correct dimensions for every choice', () => {
    for (const preset of BEGINNER_DESIGN_PRESETS) {
      const document = createBeginnerDesignDocument(preset.id);
      assert.equal(validateDocument(document).success, true, preset.label);
      assert.equal(document.name, `Untitled ${preset.label}`);
      assert.deepEqual(document.canvas, {
        width: preset.width,
        height: preset.height,
        unit: 'px',
        background: { type: 'solid', color: '#ffffff' },
      });
      assert.deepEqual(document.layers, []);
    }
  });

  it('supports an optional name and custom dimensions', () => {
    const document = createBeginnerDesignDocument('a4-flyer', {
      name: '  Community day  ',
      width: 1200,
      height: 1600,
    });

    assert.equal(document.name, 'Community day');
    assert.equal(document.canvas.width, 1200);
    assert.equal(document.canvas.height, 1600);
  });

  it('rejects dimensions that are invalid or too large', () => {
    assert.throws(() => createBeginnerDesignDocument('a4-flyer', { width: 0, height: 100 }));
    assert.throws(() => createBeginnerDesignDocument('a4-flyer', { width: 1.5, height: 100 }));
    assert.throws(() => createBeginnerDesignDocument('a4-flyer', { width: 10000, height: 10001 }));
  });
});
