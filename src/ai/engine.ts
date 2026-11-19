import {
  AIError,
  getGenerativeModel,
  InferenceMode,
  InferenceSource,
  type GenerativeModel,
} from 'firebase/ai';
import { getAILogic, getTunables } from '../firebase';
import { findPatternSpans } from '../privacy/detectors';
import { expandSpans, findOccurrences } from '../privacy/spans';
import { ENTITY_TYPES, type EntityType, type Span } from '../privacy/types';
import { assertOnDevice, ON_DEVICE_CREATE_OPTIONS, PrivacyGuardError } from './onDevice';
import { SHIELD_SCHEMA, shieldPrompt } from './prompts';

/* ---------------- Models ---------------- */

const models = new Map<string, GenerativeModel>();

/**
 * One Firebase AI Logic hybrid model per (mode, cloud model, output format). The same
 * SDK call runs on Gemini Nano in Chrome or on Gemini in the cloud, depending on mode.
 */
function hybridModel(mode: InferenceMode, json = false): GenerativeModel {
  const { cloudModel } = getTunables();
  const key = `${mode}|${cloudModel}|${json}`;
  let m = models.get(key);
  if (!m) {
    m = getGenerativeModel(getAILogic(), {
      mode,
      onDeviceParams: {
        createOptions: structuredClone(ON_DEVICE_CREATE_OPTIONS),
        ...(json ? { promptOptions: { responseConstraint: SHIELD_SCHEMA } } : {}),
      },
      inCloudParams: {
        model: cloudModel,
        generationConfig: { temperature: 0.3, maxOutputTokens: 2048 },
      },
    });
    models.set(key, m);
  }
  return m;
}

/**
 * Start (or resume) the Gemini Nano download. Must be called from a user gesture.
 * Chrome reports progress from 0 to 1.
 */
export async function downloadDeviceModel(onProgress: (p: number) => void): Promise<void> {
  await hybridModel(InferenceMode.PREFER_ON_DEVICE).initializeDeviceModel(onProgress);
}

/* ---------------- Shield: on-device only ---------------- */

export type ShieldEngine = 'nano' | 'patterns';

export interface ShieldResult {
  spans: Span[];
  engine: ShieldEngine;
  /** Shown to the user when Gemini Nano couldn't be used. */
  note?: string;
  ms: number;
}

const GENERIC = new Set([
  'patient', 'the patient', 'doctor', 'physician', 'hospital', 'clinic', 'tenant',
  'landlord', 'insurer', 'member', 'claimant', 'applicant', 'you', 'your', 'we', 'us',
  'n/a', 'none', 'unknown',
]);

function acceptItem(t: string, type: EntityType, chunk: string): boolean {
  if (t.length < 2 || t.length > 120 || t.includes('\n')) return false;
  if (GENERIC.has(t.toLowerCase())) return false;
  if (/^\[?[A-Z]+_\d+\]?$/.test(t)) return false;
  if (/^\d{1,3}$/.test(t)) return false;
  if ((type === 'PERSON' || type === 'ORG') && !/[A-Z]/.test(t)) return false;
  if (t.length > chunk.length / 2) return false;
  // Only accept text that really is in the document (guards against hallucination).
  return chunk.toLowerCase().includes(t.toLowerCase());
}

export function chunkText(text: string, size: number): string[] {
  const chunks: string[] = [];
  let cur = '';
  for (const line of text.split(/(?<=\n)/)) {
    if (cur.length + line.length > size && cur) {
      chunks.push(cur);
      cur = '';
    }
    if (line.length > size) {
      for (let i = 0; i < line.length; i += size) chunks.push(line.slice(i, i + size));
    } else {
      cur += line;
    }
  }
  if (cur.trim()) chunks.push(cur);
  return chunks;
}

async function shieldChunk(chunk: string): Promise<Array<{ text: string; type: EntityType }>> {
  // Fail closed: verify Gemini Nano is really here before the raw text goes anywhere.
  await assertOnDevice();
  const result = await hybridModel(InferenceMode.ONLY_ON_DEVICE, true).generateContent(
    shieldPrompt(chunk),
  );
  if (result.response.inferenceSource !== InferenceSource.ON_DEVICE) {
    throw new PrivacyGuardError('Shield step did not run on-device.');
  }
  const parsed = JSON.parse(result.response.text()) as { items?: Array<{ text?: string; type?: string }> };
  return (parsed.items ?? [])
    .map((i) => ({
      text: (i.text ?? '').trim(),
      type: (ENTITY_TYPES as string[]).includes(i.type ?? '') ? (i.type as EntityType) : 'ID',
    }))
    .filter((i) => acceptItem(i.text, i.type, chunk));
}

/**
 * Find identifiers in the raw document. Patterns always run; Gemini Nano adds names,
 * addresses and facilities that patterns miss. The raw text never leaves the device:
 * if Gemini Nano isn't available, Kiakia falls back to patterns only, never to the cloud.
 */
export async function runShield(
  text: string,
  opts: { useNano: boolean; chunkChars: number; onProgress?: (done: number, total: number) => void },
): Promise<ShieldResult> {
  const t0 = performance.now();
  const spans: Span[] = findPatternSpans(text);
  let engine: ShieldEngine = 'patterns';
  let note: string | undefined;

  if (opts.useNano) {
    const chunks = chunkText(text, opts.chunkChars);
    try {
      for (let i = 0; i < chunks.length; i++) {
        opts.onProgress?.(i, chunks.length);
        for (const item of await shieldChunk(chunks[i])) {
          spans.push(...findOccurrences(text, item.text, item.type, 'on-device'));
        }
      }
      opts.onProgress?.(chunks.length, chunks.length);
      engine = 'nano';
    } catch (e) {
      console.warn('[Kiakia] On-device shield failed; using patterns only.', e);
      note =
        e instanceof PrivacyGuardError
          ? 'Gemini Nano wasn’t available, so only pattern detection ran. Your document still never left this device. Review the highlights carefully.'
          : 'Gemini Nano couldn’t finish the scan, so some detections come from patterns only. Review the highlights carefully.';
    }
  } else {
    note =
      'Gemini Nano isn’t available in this browser, so only pattern detection ran. Your document never left this device. Review the highlights and add anything that was missed.';
  }

  return { spans: expandSpans(text, spans), engine, note, ms: performance.now() - t0 };
}

/* ---------------- Answers: routed hybrid inference ---------------- */

export interface Answer {
  text: string;
  source: InferenceSource;
  ms: number;
}

export async function streamAnswer(
  mode: InferenceMode,
  prompt: string,
  onUpdate: (textSoFar: string, source: InferenceSource | undefined) => void,
): Promise<Answer> {
  const t0 = performance.now();
  // "On-device only" must mean on-device even in browsers where the SDK can't enforce it.
  if (mode === InferenceMode.ONLY_ON_DEVICE) await assertOnDevice();

  const result = await hybridModel(mode).generateContentStream(prompt);
  let text = '';
  let source: InferenceSource | undefined;
  for await (const chunk of result.stream) {
    source ??= chunk.inferenceSource;
    try {
      text += chunk.text();
    } catch {
      /* a chunk with no text (e.g. finish metadata) */
    }
    onUpdate(text, source);
  }
  const final = await result.response;
  return {
    text,
    source: final.inferenceSource ?? source ?? InferenceSource.IN_CLOUD,
    ms: performance.now() - t0,
  };
}

/** Plain-language error text for the UI. */
export function friendlyError(e: unknown): string {
  if (e instanceof PrivacyGuardError) {
    return 'Stopped to protect your privacy: Gemini Nano isn’t available on this device, so this private step can’t run.';
  }
  const msg = e instanceof Error ? e.message : String(e);
  if (e instanceof AIError || /firebase|vertex|gemini/i.test(msg)) {
    if (/app.?check|403|attestation/i.test(msg))
      return 'The cloud model refused the request because App Check could not verify this app. If you are developing locally, register your App Check debug token (see README).';
    if (/api.?not.?enabled|PERMISSION_DENIED|has not been used/i.test(msg))
      return 'Firebase AI Logic isn’t enabled for this Firebase project yet. Run `npx firebase-tools init ailogic` (see README).';
    if (/quota|429|RESOURCE_EXHAUSTED/i.test(msg))
      return 'The cloud model is rate-limited right now. Try again in a minute, or switch to Private mode.';
    if (/fetch|network|Failed to fetch/i.test(msg))
      return 'Couldn’t reach the cloud model. Check your connection, or use Private mode.';
  }
  return `Something went wrong: ${msg}`;
}
