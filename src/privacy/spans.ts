import type { EntityType, Span, SpanSource } from './types';

const escapeRe = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/**
 * Find every occurrence of `value` in `text` (case-insensitive, whitespace-tolerant,
 * on word boundaries) so a name the model spotted once is hidden everywhere it appears.
 */
export function findOccurrences(
  text: string,
  value: string,
  type: EntityType,
  source: SpanSource,
): Span[] {
  const v = value.trim();
  if (v.length < 2) return [];
  const pattern = escapeRe(v).replace(/\s+/g, '\\s+');
  // Only enforce a word boundary where the value starts/ends with a word character.
  const pre = /^\w/.test(v) ? '(?<![\\w])' : '';
  const post = /\w$/.test(v) ? '(?![\\w])' : '';
  const re = new RegExp(pre + pattern + post, 'gi');
  const out: Span[] = [];
  for (const m of text.matchAll(re)) {
    out.push({ start: m.index!, end: m.index! + m[0].length, text: m[0], type, source });
  }
  return out;
}

/**
 * For multi-word names, also hide the individual surname/given name when it appears
 * alone later ("Jordan Rivera" ... "Mr. Rivera"). Over-redaction is the safe failure.
 */
export function nameParts(name: string): string[] {
  return name
    .split(/\s+/)
    .map((p) => p.replace(/[.,]$/, ''))
    .filter((p) => p.length >= 3 && /^[A-Z]/.test(p));
}

const SOURCE_RANK: Record<SpanSource, number> = { you: 3, 'on-device': 2, pattern: 1 };

/**
 * Resolve overlaps: when spans overlap, keep the longest (ties: user > on-device >
 * pattern). Returns non-overlapping spans sorted by position.
 */
export function mergeSpans(spans: Span[]): Span[] {
  const sorted = [...spans].sort(
    (a, b) =>
      b.end - b.start - (a.end - a.start) ||
      SOURCE_RANK[b.source] - SOURCE_RANK[a.source] ||
      a.start - b.start,
  );
  const kept: Span[] = [];
  for (const s of sorted) {
    if (!kept.some((k) => s.start < k.end && k.start < s.end)) kept.push(s);
  }
  return kept.sort((a, b) => a.start - b.start);
}

/** Make sure every detected value is hidden at all of its occurrences. */
export function expandSpans(text: string, spans: Span[]): Span[] {
  const all: Span[] = [...spans];
  const seen = new Set<string>();
  for (const s of spans) {
    const key = `${s.type}:${s.text.toLowerCase()}`;
    if (seen.has(key)) continue;
    seen.add(key);
    all.push(...findOccurrences(text, s.text, s.type, s.source));
    if (s.type === 'PERSON') {
      for (const part of nameParts(s.text)) {
        all.push(...findOccurrences(text, part, 'PERSON', s.source));
      }
    }
  }
  return mergeSpans(all);
}
