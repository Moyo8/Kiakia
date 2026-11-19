import { useCallback, useEffect, useMemo, useState } from 'react';
import { InferenceSource } from 'firebase/ai';
import { friendlyError, runShield, streamAnswer, type ShieldResult } from './ai/engine';
import { analysisPrompt, followUpPrompt, type DocKind, type Turn } from './ai/prompts';
import { decideRoute, isBlocked, type Preference, type Route } from './ai/router';
import { getTunables, isConfigured, loadTunables } from './firebase';
import { useDevice, useOnline } from './hooks';
import { newEntry, type LedgerEntry } from './ledger';
import { findPatternSpans } from './privacy/detectors';
import { expandSpans, findOccurrences, mergeSpans } from './privacy/spans';
import type { EntityType, Span } from './privacy/types';
import { Vault } from './privacy/vault';
import { Compose } from './components/Compose';
import { Conversation, type ChatTurn } from './components/Conversation';
import { Icon } from './components/Icon';
import { Receipt } from './components/Receipt';
import { Review, spanKey } from './components/Review';
import { StatusBar } from './components/StatusBar';

type Stage = 'compose' | 'review' | 'answer';

interface Session {
  vault: Vault;
  redacted: string;
  turns: ChatTurn[];
}

const STEPS: Array<{ id: Stage; label: string }> = [
  { id: 'compose', label: 'Paste' },
  { id: 'review', label: 'Review what’s hidden' },
  { id: 'answer', label: 'Understand it' },
];

let turnId = 1;

export default function App() {
  const online = useOnline();
  const device = useDevice(isConfigured);
  const [tunables, setTunables] = useState(getTunables());
  useEffect(() => {
    void loadTunables().then(setTunables);
  }, []);

  const [stage, setStage] = useState<Stage>('compose');
  const [doc, setDoc] = useState('');
  const [kind, setKind] = useState<DocKind>('medical');
  const [pref, setPref] = useState<Preference>('auto');

  const [shield, setShield] = useState<ShieldResult | null>(null);
  const [scanning, setScanning] = useState<{ done: number; total: number } | null>(null);
  const [userSpans, setUserSpans] = useState<Span[]>([]);
  const [offTypes, setOffTypes] = useState<Set<EntityType>>(new Set());
  const [released, setReleased] = useState<Set<string>>(new Set());

  const [session, setSession] = useState<Session | null>(null);
  const [busy, setBusy] = useState(false);
  const [ledger, setLedger] = useState<LedgerEntry[]>([]);
  const log = useCallback((e: Omit<LedgerEntry, 'id' | 'at'>) => setLedger((l) => [...l, newEntry(e)]), []);

  const nanoReady = isConfigured && device.status === 'available';

  /* ---------- Step 1 → 2: shield on-device ---------- */

  const onShield = async () => {
    setScanning({ done: 0, total: 1 });
    const result = await runShield(doc, {
      useNano: nanoReady,
      chunkChars: tunables.shieldChunkChars,
      onProgress: (done, total) => setScanning({ done, total }),
    });
    setScanning(null);
    setShield(result);
    setUserSpans([]);
    setOffTypes(new Set());
    setReleased(new Set());
    setSession(null);
    setStage('review');
    log({
      step: 'Shield',
      where: 'device',
      detail:
        result.engine === 'nano'
          ? `Gemini Nano + patterns found ${result.spans.length} private details (on-device only mode, verified).`
          : `Pattern detection found ${result.spans.length} private details in your browser.`,
      sentChars: 0,
      withheld: 0,
    });
  };

  const spans = useMemo(
    () => (shield ? expandSpans(doc, mergeSpans([...shield.spans, ...userSpans])) : []),
    [doc, shield, userSpans],
  );
  const activeSpans = useMemo(
    () => spans.filter((s) => !offTypes.has(s.type) && !released.has(spanKey(s))),
    [spans, offTypes, released],
  );
  const preview = useMemo(() => new Vault().redact(doc, activeSpans), [doc, activeSpans]);

  const routeFor = (chars: number) =>
    decideRoute(pref, {
      online,
      device: isConfigured ? device.status : 'unsupported',
      chars,
      autoOnDeviceMaxChars: tunables.autoOnDeviceMaxChars,
    });

  const reviewRoute = routeFor(preview.length);

  /* ---------- Answers ---------- */

  const runTurn = async (s: Session, route: Route, prompt: string, question?: ChatTurn['question']) => {
    const turn: ChatTurn = { id: turnId++, question, answer: '', route, streaming: true };
    const update = (patch: Partial<ChatTurn>) =>
      setSession((cur) =>
        cur ? { ...cur, turns: cur.turns.map((t) => (t.id === turn.id ? { ...t, ...patch } : t)) } : cur,
      );
    setSession({ ...s, turns: [...s.turns, turn] });
    setBusy(true);
    try {
      const ans = await streamAnswer(route.mode, prompt, (text, source) => update({ answer: text, source }));
      update({ answer: ans.text, source: ans.source, streaming: false, ms: ans.ms });
      const cloud = ans.source === InferenceSource.IN_CLOUD;
      log({
        step: question ? 'Follow-up' : 'Explain',
        where: cloud ? 'cloud' : 'device',
        detail: `${route.label} → ran ${cloud ? `in the cloud (${tunables.cloudModel})` : 'on this device (Gemini Nano)'}.`,
        sentChars: cloud ? prompt.length : 0,
        withheld: s.vault.size,
        payload: cloud ? prompt : undefined,
      });
    } catch (e) {
      update({ streaming: false, error: friendlyError(e) });
    } finally {
      setBusy(false);
    }
  };

  const onAsk = () => {
    if (isBlocked(reviewRoute)) return;
    const vault = new Vault();
    const redacted = vault.redact(doc, activeSpans);
    const s: Session = { vault, redacted, turns: [] };
    setStage('answer');
    void runTurn(s, reviewRoute, analysisPrompt(kind, redacted));
  };

  const onFollowUp = (raw: string) => {
    if (!session) return;
    // Redact the question on-device too: known values first, then patterns for new ones.
    const known = session.vault.redactKnown(raw);
    const redactedQ = session.vault.redact(known, mergeSpans(findPatternSpans(known)));
    const history: Turn[] = session.turns
      .filter((t) => !t.error)
      .map((t) => ({ question: t.question?.redacted ?? '(asked for an explanation)', answer: t.answer }));
    const prompt = followUpPrompt(kind, session.redacted, history, redactedQ);
    const route = routeFor(prompt.length);
    if (isBlocked(route)) {
      const turn: ChatTurn = {
        id: turnId++,
        question: { raw, redacted: redactedQ },
        answer: '',
        route: null,
        streaming: false,
        error: route.blocked,
      };
      setSession({ ...session, turns: [...session.turns, turn] });
      return;
    }
    void runTurn(session, route, prompt, { raw, redacted: redactedQ });
  };

  const nextRoute = session ? routeFor(session.redacted.length + 400) : null;

  const askDisabledReason = !isConfigured
    ? 'Connect a Firebase project to ask the AI (see README → Setup). Detection above works without it.'
    : isBlocked(reviewRoute)
      ? undefined
      : activeSpans.length === 0
        ? 'Nothing will be hidden. Check the highlights, or continue if the document has no private details.'
        : undefined;

  const restart = () => {
    setStage('compose');
    setShield(null);
    setSession(null);
    setDoc('');
  };

  return (
    <div className="app">
      <header className="top">
        <div className="brand">
          <div className="logo" aria-hidden="true">
            <Icon name="shield" size={20} />
          </div>
          <div>
            <h1>Kiakia</h1>
            <p>Private help with sensitive documents</p>
          </div>
        </div>
        <StatusBar
          device={isConfigured ? device.status : 'unsupported'}
          progress={device.progress}
          onDownload={device.download}
          online={online}
          pref={pref}
          onPref={setPref}
          configured={isConfigured}
        />
      </header>

      {!isConfigured && (
        <p className="banner">
          <Icon name="alert" /> Demo mode: no Firebase project connected. Private-detail detection works in your
          browser; AI answers need setup (README → Setup).
        </p>
      )}
      {device.error && <p className="banner">Couldn’t download Gemini Nano: {device.error}</p>}

      {stage === 'compose' && (
        <div className="hero">
          <h2>Understand medical, insurance and legal letters with AI, without giving away who you are.</h2>
          <p>
            Kiakia finds names, dates, ID numbers and addresses <strong>on your device</strong>, swaps them for
            placeholders, and only then asks the AI. Answers come back with your details filled in, locally.
          </p>
        </div>
      )}

      <ol className="stepper">
        {STEPS.map((s, i) => (
          <li
            key={s.id}
            className={
              s.id === stage ? 'current' : STEPS.findIndex((x) => x.id === stage) > i ? 'done' : ''
            }
          >
            <span>{i + 1}</span> {s.label}
          </li>
        ))}
      </ol>

      <main className="layout">
        <div className="flow">
          {stage === 'compose' && (
            <Compose
              doc={doc}
              onDoc={setDoc}
              kind={kind}
              onKind={setKind}
              onShield={onShield}
              scanning={scanning}
              nanoReady={nanoReady}
            />
          )}
          {stage === 'review' && shield && (
            <Review
              doc={doc}
              shield={shield}
              spans={spans}
              offTypes={offTypes}
              released={released}
              onToggleType={(t) =>
                setOffTypes((cur) => {
                  const next = new Set(cur);
                  if (next.has(t)) next.delete(t);
                  else next.add(t);
                  return next;
                })
              }
              onToggleSpan={(s) =>
                setReleased((cur) => {
                  const next = new Set(cur);
                  const k = spanKey(s);
                  if (next.has(k)) next.delete(k);
                  else next.add(k);
                  return next;
                })
              }
              onAddPhrase={(phrase, type) => {
                const found = findOccurrences(doc, phrase, type, 'you');
                setUserSpans((cur) => [...cur, ...found]);
              }}
              redactedPreview={preview}
              route={reviewRoute}
              canAsk={isConfigured && !isBlocked(reviewRoute) && !busy}
              askDisabledReason={askDisabledReason}
              onAsk={onAsk}
              onBack={() => setStage('compose')}
            />
          )}
          {stage === 'answer' && session && (
            <Conversation
              turns={session.turns}
              vault={session.vault}
              busy={busy}
              onAsk={onFollowUp}
              onRestart={restart}
              onBack={() => setStage('review')}
              nextRouteLabel={nextRoute && !isBlocked(nextRoute) ? nextRoute.label.toLowerCase() : null}
            />
          )}
        </div>
        <aside className="side">
          <Receipt entries={ledger} />
          <section className="card how">
            <h2>How Kiakia uses hybrid AI</h2>
            <ol>
              <li>
                <Icon name="chip" size={14} /> <strong>Find</strong>: Gemini Nano scans the raw document{' '}
                <em>on-device only</em>. If it isn’t available, Kiakia falls back to pattern detection, never to
                the cloud.
              </li>
              <li>
                <Icon name="lock" size={14} /> <strong>Hide</strong>: details become placeholders. The real values
                stay in this tab’s memory and are never saved.
              </li>
              <li>
                <Icon name="cloud" size={14} /> <strong>Explain</strong>: short documents are answered on-device;
                long ones go to Gemini in the cloud as redacted text, with on-device fallback.
              </li>
              <li>
                <Icon name="shield" size={14} /> <strong>Restore</strong>: placeholders in the answer are filled
                back in on your device.
              </li>
            </ol>
          </section>
        </aside>
      </main>
      <footer className="foot">
        Kiakia gives general information, not medical, legal or financial advice. Built with Firebase AI Logic hybrid
        inference.
      </footer>
    </div>
  );
}
