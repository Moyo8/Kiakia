import { useMemo, useState } from 'react';
import type { ShieldResult } from '../ai/engine';
import type { Route, RouteBlocked } from '../ai/router';
import { ENTITY_LABELS, ENTITY_TYPES, type EntityType, type Span } from '../privacy/types';
import { Icon } from './Icon';

export const spanKey = (s: Span) => `${s.start}:${s.end}`;

interface Props {
  doc: string;
  shield: ShieldResult;
  spans: Span[];
  offTypes: Set<EntityType>;
  released: Set<string>;
  onToggleType: (t: EntityType) => void;
  onToggleSpan: (s: Span) => void;
  onAddPhrase: (phrase: string, type: EntityType) => void;
  redactedPreview: string;
  route: Route | RouteBlocked;
  canAsk: boolean;
  askDisabledReason?: string;
  onAsk: () => void;
  onBack: () => void;
}

export function Review(p: Props) {
  const [phrase, setPhrase] = useState('');
  const [phraseType, setPhraseType] = useState<EntityType>('PERSON');
  const [showPreview, setShowPreview] = useState(false);

  const isActive = (s: Span) => !p.offTypes.has(s.type) && !p.released.has(spanKey(s));
  const activeCount = p.spans.filter(isActive).length;
  const counts = useMemo(() => {
    const c = new Map<EntityType, number>();
    for (const s of p.spans) c.set(s.type, (c.get(s.type) ?? 0) + 1);
    return c;
  }, [p.spans]);

  const pieces = useMemo(() => {
    const out: Array<{ text: string; span?: Span }> = [];
    let pos = 0;
    for (const s of p.spans) {
      if (s.start > pos) out.push({ text: p.doc.slice(pos, s.start) });
      out.push({ text: p.doc.slice(s.start, s.end), span: s });
      pos = s.end;
    }
    if (pos < p.doc.length) out.push({ text: p.doc.slice(pos) });
    return out;
  }, [p.doc, p.spans]);

  const blocked = 'blocked' in p.route;

  return (
    <section className="card">
      <div className="card-head">
        <button className="ghost" onClick={p.onBack}>
          <Icon name="back" /> Edit document
        </button>
        <div className={`engine ${p.shield.engine === 'nano' ? 'engine-nano' : 'engine-patterns'}`}>
          <Icon name={p.shield.engine === 'nano' ? 'chip' : 'alert'} size={14} />
          {p.shield.engine === 'nano'
            ? `Scanned on this device by Gemini Nano + patterns in ${(p.shield.ms / 1000).toFixed(1)}s`
            : 'Pattern detection only'}
        </div>
      </div>
      {p.shield.note && <p className="notice">{p.shield.note}</p>}

      <div className="review-grid">
        <div>
          <h2>
            {activeCount} private detail{activeCount === 1 ? '' : 's'} will be hidden
          </h2>
          <p className="muted small">
            Click a highlight to keep it visible. Highlighted details are swapped for placeholders like{' '}
            <code>[PERSON_1]</code> before any AI outside this device sees the text.
          </p>
          <pre className="doc-view" aria-label="Document with detected private details highlighted">
            {pieces.map((piece, i) =>
              piece.span ? (
                <button
                  key={i}
                  className={`mark t-${piece.span.type.toLowerCase()} ${isActive(piece.span) ? '' : 'released'}`}
                  onClick={() => p.onToggleSpan(piece.span!)}
                  title={`${ENTITY_LABELS[piece.span.type]} · found by ${piece.span.source}${
                    isActive(piece.span) ? ' · click to keep visible' : ' · click to hide'
                  }`}
                >
                  {piece.text}
                </button>
              ) : (
                <span key={i}>{piece.text}</span>
              ),
            )}
          </pre>
        </div>

        <aside className="review-side">
          <h3>Hide these kinds of details</h3>
          <ul className="types">
            {ENTITY_TYPES.filter((t) => counts.get(t)).map((t) => (
              <li key={t}>
                <label>
                  <input type="checkbox" checked={!p.offTypes.has(t)} onChange={() => p.onToggleType(t)} />
                  <span className={`swatch t-${t.toLowerCase()}`} />
                  {ENTITY_LABELS[t]}
                  <span className="count">{counts.get(t)}</span>
                </label>
              </li>
            ))}
          </ul>

          <h3>Something missed?</h3>
          <form
            className="add-phrase"
            onSubmit={(e) => {
              e.preventDefault();
              if (phrase.trim()) p.onAddPhrase(phrase.trim(), phraseType);
              setPhrase('');
            }}
          >
            <input
              value={phrase}
              onChange={(e) => setPhrase(e.target.value)}
              placeholder="Type a word or phrase to hide"
              aria-label="Word or phrase to hide"
            />
            <select value={phraseType} onChange={(e) => setPhraseType(e.target.value as EntityType)} aria-label="Kind of detail">
              {ENTITY_TYPES.map((t) => (
                <option key={t} value={t}>
                  {ENTITY_LABELS[t]}
                </option>
              ))}
            </select>
            <button type="submit" className="secondary" disabled={!phrase.trim()}>
              <Icon name="plus" /> Hide
            </button>
          </form>

          <button className="link small" onClick={() => setShowPreview((v) => !v)}>
            <Icon name="eye" size={14} /> {showPreview ? 'Hide' : 'Show'} exactly what the AI will see
          </button>
          {showPreview && <pre className="preview">{p.redactedPreview}</pre>}

          <div className={`route ${blocked ? 'route-blocked' : ''}`}>
            {blocked ? (
              <p>{(p.route as RouteBlocked).blocked}</p>
            ) : (
              <>
                <strong>{(p.route as Route).label}</strong>
                <p>{(p.route as Route).reason}</p>
              </>
            )}
          </div>
          <button className="primary wide" disabled={!p.canAsk} onClick={p.onAsk} title={p.askDisabledReason}>
            Explain it to me <Icon name="arrow" />
          </button>
          {p.askDisabledReason && <p className="muted small">{p.askDisabledReason}</p>}
        </aside>
      </div>
    </section>
  );
}
