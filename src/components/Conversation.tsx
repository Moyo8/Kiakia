import { useState } from 'react';
import Markdown from 'react-markdown';
import { InferenceMode, InferenceSource } from 'firebase/ai';
import type { Route } from '../ai/router';
import type { Vault } from '../privacy/vault';
import { Icon } from './Icon';

export interface ChatTurn {
  id: number;
  question?: { raw: string; redacted: string };
  /** Model output exactly as received: placeholders intact. */
  answer: string;
  source?: InferenceSource;
  /** null when the question was blocked before any model ran. */
  route: Route | null;
  streaming: boolean;
  error?: string;
  ms?: number;
}

function fallbackNote(t: ChatTurn): string | null {
  if (!t.source || t.streaming || !t.route) return null;
  if (t.route.mode === InferenceMode.PREFER_ON_DEVICE && t.source === InferenceSource.IN_CLOUD)
    return 'Gemini Nano was busy or unavailable, so this fell back to the cloud. Only redacted text was sent.';
  if (t.route.mode === InferenceMode.PREFER_IN_CLOUD && t.source === InferenceSource.ON_DEVICE)
    return 'The cloud model couldn’t be reached, so Gemini Nano answered on this device instead.';
  return null;
}

function SourceBadge({ source, streaming }: { source?: InferenceSource; streaming: boolean }) {
  if (!source)
    return <span className="badge badge-pending">{streaming ? 'Thinking…' : 'Not answered'}</span>;
  return source === InferenceSource.ON_DEVICE ? (
    <span className="badge badge-device">
      <Icon name="chip" size={14} /> Answered on this device · Gemini Nano
    </span>
  ) : (
    <span className="badge badge-cloud">
      <Icon name="cloud" size={14} /> Answered by Gemini in the cloud · saw redacted text only
    </span>
  );
}

function AnswerCard({ turn, vault }: { turn: ChatTurn; vault: Vault }) {
  const [raw, setRaw] = useState(false);
  const note = fallbackNote(turn);
  return (
    <article className="answer">
      <header>
        <SourceBadge source={turn.source} streaming={turn.streaming} />
        {turn.ms !== undefined && <span className="muted small">{(turn.ms / 1000).toFixed(1)}s</span>}
        <div className="spacer" />
        {turn.answer && (
          <button className="link small" onClick={() => setRaw((r) => !r)}>
            <Icon name="eye" size={14} /> {raw ? 'Show with my details' : 'Show what the AI saw'}
          </button>
        )}
      </header>
      {note && <p className="notice small">{note}</p>}
      {turn.error ? (
        <p className="error">{turn.error}</p>
      ) : (
        <div className={`md ${raw ? 'md-raw' : ''}`}>
          <Markdown>{raw ? turn.answer : vault.rehydrate(turn.answer)}</Markdown>
          {turn.streaming && <span className="caret" />}
        </div>
      )}
      {raw && !turn.error && (
        <p className="muted small">
          Placeholders were filled back in on your device. The AI never saw what they stand for.
        </p>
      )}
    </article>
  );
}

interface Props {
  turns: ChatTurn[];
  vault: Vault;
  busy: boolean;
  onAsk: (q: string) => void;
  onRestart: () => void;
  onBack: () => void;
  nextRouteLabel: string | null;
}

export function Conversation({ turns, vault, busy, onAsk, onRestart, onBack, nextRouteLabel }: Props) {
  const [q, setQ] = useState('');
  return (
    <section className="card">
      <div className="card-head">
        <button className="ghost" onClick={onBack}>
          <Icon name="back" /> Review hidden details
        </button>
        <button className="ghost" onClick={onRestart}>
          New document
        </button>
      </div>
      {turns.map((t) => (
        <div key={t.id} className="turn">
          {t.question && (
            <div className="question">
              <p>{t.question.raw}</p>
              {t.question.redacted !== t.question.raw && (
                <p className="muted small">
                  <Icon name="lock" size={12} /> Sent as: {t.question.redacted}
                </p>
              )}
            </div>
          )}
          <AnswerCard turn={t} vault={vault} />
        </div>
      ))}
      <form
        className="ask"
        onSubmit={(e) => {
          e.preventDefault();
          if (!q.trim() || busy) return;
          onAsk(q.trim());
          setQ('');
        }}
      >
        <input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Ask a follow-up, like “What should I say when I call?”"
          aria-label="Follow-up question"
          disabled={busy}
        />
        <button className="primary" type="submit" disabled={busy || !q.trim()}>
          <Icon name="send" /> Ask
        </button>
      </form>
      {nextRouteLabel && <p className="muted small">Next answer: {nextRouteLabel}. Your question is redacted on this device first.</p>}
    </section>
  );
}
