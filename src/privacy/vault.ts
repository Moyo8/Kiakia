import { ENTITY_TYPES, type EntityType, type Span } from './types';
import { nameParts } from './spans';

const norm = (s: string) => s.trim().replace(/\s+/g, ' ').toLowerCase();
const escapeRe = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/** Matches tokens like [PERSON_1], with tolerance for the model dropping brackets or changing case. */
const TOKEN_RE = new RegExp(`\\[?\\b(${ENTITY_TYPES.join('|')})_(\\d+)\\b\\]?`, 'gi');

/**
 * The vault maps real values to placeholders like [PERSON_1]. It lives only in this
 * tab's memory: it is never persisted, logged, or sent anywhere. The cloud model sees
 * placeholders; the vault turns them back into real values locally.
 */
export class Vault {
  private byValue = new Map<string, string>(); // normalized value -> token
  private byToken = new Map<string, string>(); // token -> canonical display value
  private counters = new Map<EntityType, number>();

  /** Token for a value, creating one if needed. Same value -> same token. */
  tokenFor(value: string, type: EntityType): string {
    const key = norm(value);
    const existing = this.byValue.get(key);
    if (existing) return existing;
    // A lone surname that belongs to a known full name shares its token.
    if (type === 'PERSON') {
      for (const [token, full] of this.byToken) {
        if (!token.startsWith('[PERSON_')) continue;
        if (nameParts(full).some((p) => norm(p) === key)) {
          this.byValue.set(key, token);
          return token;
        }
      }
    }
    const n = (this.counters.get(type) ?? 0) + 1;
    this.counters.set(type, n);
    const token = `[${type}_${n}]`;
    this.byValue.set(key, token);
    this.byToken.set(token, value.trim().replace(/\s+/g, ' '));
    return token;
  }

  /**
   * Replace spans with tokens. Spans must be non-overlapping (use mergeSpans).
   * Tokens are numbered in reading order, except that multi-word names are registered
   * first so a later lone "Rivera" shares Jordan Rivera's token.
   */
  redact(text: string, spans: Span[]): string {
    const ordered = [...spans].sort((a, b) => a.start - b.start);
    for (const s of ordered) {
      if (s.type === 'PERSON' && /\s/.test(s.text.trim())) this.tokenFor(s.text, s.type);
    }
    let out = '';
    let pos = 0;
    for (const s of ordered) {
      out += text.slice(pos, s.start) + this.tokenFor(s.text, s.type);
      pos = s.end;
    }
    return out + text.slice(pos);
  }

  /** Replace any value already in the vault (used for follow-up questions). */
  redactKnown(text: string): string {
    const values = [...this.byValue.keys()].sort((a, b) => b.length - a.length);
    let out = text;
    for (const v of values) {
      const pattern = escapeRe(v).replace(/\s+/g, '\\s+');
      const pre = /^\w/.test(v) ? '(?<![\\w\\[])' : '';
      const post = /\w$/.test(v) ? '(?![\\w\\]])' : '';
      out = out.replace(new RegExp(pre + pattern + post, 'gi'), this.byValue.get(v)!);
    }
    return out;
  }

  /** Turn tokens in model output back into the real values, locally. */
  rehydrate(text: string): string {
    return text.replace(TOKEN_RE, (match, type: string, n: string) => {
      const token = `[${type.toUpperCase()}_${n}]`;
      return this.byToken.get(token) ?? match;
    });
  }

  /** Split model output into plain text and token segments for highlighted rendering. */
  segments(text: string): Array<{ text: string; token?: string; value?: string }> {
    const out: Array<{ text: string; token?: string; value?: string }> = [];
    let pos = 0;
    for (const m of text.matchAll(TOKEN_RE)) {
      const token = `[${m[1].toUpperCase()}_${m[2]}]`;
      const value = this.byToken.get(token);
      if (!value) continue;
      if (m.index! > pos) out.push({ text: text.slice(pos, m.index) });
      out.push({ text: m[0], token, value });
      pos = m.index! + m[0].length;
    }
    if (pos < text.length) out.push({ text: text.slice(pos) });
    return out;
  }

  get size(): number {
    return this.byToken.size;
  }

  entries(): Array<{ token: string; value: string }> {
    return [...this.byToken].map(([token, value]) => ({ token, value }));
  }
}
