import { parsePhoneNumberFromString } from 'libphonenumber-js';

export type SmartDataKind = 'phone' | 'email' | 'url' | 'handle' | 'price' | 'date' | 'address';

export interface SmartDataMatch {
  kind: SmartDataKind;
  value: string;
  start: number;
  end: number;
  confidence: number;
}

const patterns: Array<{ kind: Exclude<SmartDataKind, 'phone'>; regex: RegExp; confidence: number }> = [
  {
    kind: 'email',
    regex: /(?<![\w.+-])[\w.!#$%&'*+/=?^`{|}~-]+@[a-z\d](?:[a-z\d-]{0,61}[a-z\d])?(?:\.[a-z\d](?:[a-z\d-]{0,61}[a-z\d])?)+/gi,
    confidence: 0.98
  },
  {
    kind: 'url',
    regex: /\b(?:https?:\/\/|www\.)[^\s<>()]+|\b[a-z\d](?:[a-z\d-]*[a-z\d])?(?:\.[a-z](?:[a-z\d-]*[a-z\d])?)+(?:\/[^\s<>()]*)?/gi,
    confidence: 0.9
  },
  {
    kind: 'handle',
    regex: /(?<![\w@])@[A-Za-z0-9_](?:[A-Za-z0-9_.]{0,28}[A-Za-z0-9_])?/g,
    confidence: 0.9
  },
  {
    kind: 'price',
    regex: /(?<![\w.])(?:[$€£¥]\s?\d{1,3}(?:,\d{3})*(?:\.\d{1,2})?|\d{1,3}(?:,\d{3})*(?:\.\d{1,2})?\s?(?:USD|EUR|GBP|JPY|CAD|AUD))(?!\w)/gi,
    confidence: 0.9
  },
  {
    kind: 'date',
    regex: /\b(?:\d{4}-\d{1,2}-\d{1,2}|\d{1,2}[/-]\d{1,2}(?:[/-]\d{2,4})?|\d{1,2}\s+(?:Jan(?:uary)?|Feb(?:ruary)?|Mar(?:ch)?|Apr(?:il)?|May|Jun(?:e)?|Jul(?:y)?|Aug(?:ust)?|Sep(?:tember)?|Oct(?:ober)?|Nov(?:ember)?|Dec(?:ember)?)(?:,?\s+\d{2,4})?|(?:Jan(?:uary)?|Feb(?:ruary)?|Mar(?:ch)?|Apr(?:il)?|May|Jun(?:e)?|Jul(?:y)?|Aug(?:ust)?|Sep(?:tember)?|Oct(?:ober)?|Nov(?:ember)?|Dec(?:ember)?)\s+\d{1,2}(?:,?\s+\d{2,4})?)\b/gi,
    confidence: 0.88
  },
  {
    kind: 'address',
    regex: /\b(?!\d{4}\s+(?:at|on)\b)\d{1,6}\s+[A-Za-z0-9.'-]+(?:\s+[A-Za-z0-9.'-]+){0,5}\s+(?:Street|St|Avenue|Ave|Road|Rd|Boulevard|Blvd|Drive|Dr|Lane|Ln|Way|Court|Ct|Highway|Hwy)\b/gi,
    confidence: 0.82
  }
];

function trimMatch(text: string, start: number, rawValue: string): { value: string; end: number } {
  const value = rawValue.replace(/[.,!?;:]+$/, '');
  return { value, end: start + value.length };
}

export function detectSmartData(text: string): SmartDataMatch[] {
  const matches: SmartDataMatch[] = [];
  for (const { kind, regex, confidence } of patterns) {
    regex.lastIndex = 0;
    for (const match of text.matchAll(regex)) {
      const start = match.index ?? 0;
      const value = kind === 'url' ? trimMatch(text, start, match[0]).value : match[0];
      if (!value) continue;
      const end = start + value.length;
      if (matches.some((item) => start < item.end && end > item.start)) continue;
      matches.push({ kind, value, start, end, confidence });
    }
  }

  const phonePattern = /(?<![\p{L}\d])\+?\d[\d\s().-]{5,}\d(?![\p{L}\d])/gu;
  for (const match of text.matchAll(phonePattern)) {
    const start = match.index ?? 0;
    const value = match[0].trim();
    const end = start + match[0].length;
    if (matches.some((item) => start < item.end && end > item.start)) continue;
    if (/^\d{4}[-/]\d{1,2}[-/]\d{1,2}$/.test(value)) continue;
    const digits = value.replace(/\D/g, '');
    if (digits.length < 7 || digits.length > 15) continue;
    const parsed = parsePhoneNumberFromString(value, 'US');
    const confidence = parsed?.isValid() ? 0.98 : parsed?.isPossible() ? 0.82 : 0.62;
    matches.push({ kind: 'phone', value, start, end, confidence });
  }

  const order: SmartDataKind[] = ['email', 'url', 'handle', 'phone', 'price', 'date', 'address'];
  return matches.sort((left, right) => left.start - right.start
    || order.indexOf(left.kind) - order.indexOf(right.kind));
}

export function matchesForBulkAction<T extends SmartDataMatch>(matches: T[], action: 'phone' | 'email' | 'url'): T[] {
  return matches.filter((match) => action === 'url'
    ? match.kind === 'url' || match.kind === 'handle'
    : match.kind === action);
}

export function replaceSmartDataMatches(text: string, matches: SmartDataMatch[], replacement: string): string {
  return [...matches]
    .sort((left, right) => right.start - left.start)
    .reduce((content, match) => content.slice(0, match.start) + replacement + content.slice(match.end), text);
}
