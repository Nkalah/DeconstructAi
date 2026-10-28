import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { detectSmartData, matchesForBulkAction, replaceSmartDataMatches } from './smartData';

describe('smart data detection', () => {
  it('detects contact details, prices, dates, and addresses with confidence', () => {
    const matches = detectSmartData('Call +1 415 555 0123 or email hello@example.com. Visit https://example.com/@studio, price $29.99 on Oct 14, 2026 at 123 Market Street.');
    assert.equal(matches.find((match) => match.kind === 'phone')?.value, '+1 415 555 0123');
    assert.equal(matches.find((match) => match.kind === 'email')?.value, 'hello@example.com');
    assert.equal(matches.find((match) => match.kind === 'url')?.value, 'https://example.com/@studio');
    assert.equal(matches.find((match) => match.kind === 'price')?.value, '$29.99');
    assert.equal(matches.find((match) => match.kind === 'date')?.value, 'Oct 14, 2026');
    assert.equal(matches.find((match) => match.kind === 'address')?.value, '123 Market Street');
    assert.ok(matches.every((match) => match.confidence >= 0 && match.confidence <= 1));
  });

  it('groups social handles with URL replacements and avoids phone-like dates', () => {
    const matches = detectSmartData('Follow @design_team on 2026-10-03');
    assert.deepEqual(matchesForBulkAction(matches, 'url').map((match) => match.value), ['@design_team']);
    assert.equal(matches.some((match) => match.kind === 'phone'), false);
  });

  it('does not misclassify the year before an address as the street number', () => {
    const matches = detectSmartData('Event on Oct 14, 2026 at 123 Market Street.');
    assert.equal(matches.find((match) => match.kind === 'address')?.value, '123 Market Street');
  });

  it('replaces all detected spans without shifting offsets or changing surrounding text', () => {
    const text = 'Call +1 415 555 0123 or +1 212 555 0199 today.';
    const phones = matchesForBulkAction(detectSmartData(text), 'phone');
    assert.equal(replaceSmartDataMatches(text, phones, '555-0100'), 'Call 555-0100 or 555-0100 today.');
  });
});
