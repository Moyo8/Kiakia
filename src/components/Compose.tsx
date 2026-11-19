import { DOC_KINDS, type DocKind } from '../ai/prompts';
import { SAMPLES } from '../samples';
import { Icon } from './Icon';

interface Props {
  doc: string;
  onDoc: (s: string) => void;
  kind: DocKind;
  onKind: (k: DocKind) => void;
  onShield: () => void;
  scanning: { done: number; total: number } | null;
  nanoReady: boolean;
}

export function Compose({ doc, onDoc, kind, onKind, onShield, scanning, nanoReady }: Props) {
  return (
    <section className="card">
      <div className="card-head">
        <h2>Paste a document</h2>
        <div className="samples">
          <span className="muted">Try a sample:</span>
          {SAMPLES.map((s) => (
            <button
              key={s.id}
              className="link"
              onClick={() => {
                onDoc(s.text);
                onKind(s.kind);
              }}
            >
              {s.label}
            </button>
          ))}
        </div>
      </div>
      <textarea
        className="doc-input"
        value={doc}
        onChange={(e) => onDoc(e.target.value)}
        placeholder="Paste a lab report, insurance letter, bill or legal notice…"
        spellCheck={false}
        aria-label="Document text"
      />
      <div className="row">
        <label className="field">
          <span>This is a</span>
          <select value={kind} onChange={(e) => onKind(e.target.value as DocKind)}>
            {DOC_KINDS.map((k) => (
              <option key={k.id} value={k.id}>
                {k.label}
              </option>
            ))}
          </select>
          <span>document</span>
        </label>
        <div className="spacer" />
        <button className="primary" disabled={!doc.trim() || !!scanning} onClick={onShield}>
          <Icon name="shield" />
          {scanning
            ? `Scanning on this device${scanning.total > 1 ? ` (${scanning.done}/${scanning.total})` : ''}…`
            : 'Find private details'}
        </button>
      </div>
      <p className="fineprint">
        <Icon name="lock" size={14} />
        {nanoReady
          ? 'Gemini Nano scans your document right here in Chrome. Nothing is uploaded at this step.'
          : 'Pattern detection runs right here in your browser. Nothing is uploaded at this step.'}
      </p>
    </section>
  );
}
