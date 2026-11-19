import { useState } from 'react';
import type { LedgerEntry } from '../ledger';
import { Icon } from './Icon';

export function Receipt({ entries }: { entries: LedgerEntry[] }) {
  const [open, setOpen] = useState<number | null>(null);
  const cloud = entries.filter((e) => e.where === 'cloud');
  const sent = cloud.reduce((n, e) => n + e.sentChars, 0);
  return (
    <section className="card receipt" aria-labelledby="receipt-title">
      <h2 id="receipt-title">
        <Icon name="receipt" /> Privacy receipt
      </h2>
      {entries.length === 0 ? (
        <p className="muted small">Every AI step will be listed here: where it ran and exactly what it saw.</p>
      ) : (
        <>
          <dl className="totals">
            <div>
              <dt>On this device</dt>
              <dd>{entries.length - cloud.length}</dd>
            </div>
            <div>
              <dt>Cloud calls</dt>
              <dd>{cloud.length}</dd>
            </div>
            <div>
              <dt>Hidden details sent</dt>
              <dd className="zero">0</dd>
            </div>
          </dl>
          {cloud.length > 0 && (
            <p className="muted small">
              {sent.toLocaleString()} characters of redacted text left this device.
            </p>
          )}
          <ol className="entries">
            {[...entries].reverse().map((e) => (
              <li key={e.id} className={`entry entry-${e.where}`}>
                <div className="entry-line">
                  <Icon name={e.where === 'device' ? 'chip' : 'cloud'} size={14} />
                  <strong>{e.step}</strong>
                  <span className="muted small">{e.where === 'device' ? 'on this device' : 'cloud'}</span>
                  <span className="spacer" />
                  <time className="muted small">
                    {e.at.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })}
                  </time>
                </div>
                <p className="small">{e.detail}</p>
                {e.withheld > 0 && (
                  <p className="small muted">{e.withheld} private details replaced with placeholders</p>
                )}
                {e.payload && (
                  <>
                    <button className="link small" onClick={() => setOpen(open === e.id ? null : e.id)}>
                      <Icon name="eye" size={12} /> {open === e.id ? 'Hide' : 'Inspect'} what was sent
                    </button>
                    {open === e.id && <pre className="preview">{e.payload}</pre>}
                  </>
                )}
              </li>
            ))}
          </ol>
        </>
      )}
    </section>
  );
}
