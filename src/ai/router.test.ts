import { describe, expect, it } from 'vitest';
import { InferenceMode } from 'firebase/ai';
import { decideRoute, isBlocked, type Route } from './router';
import { chunkText } from './engine';

const ctx = { online: true, device: 'available' as const, chars: 1000, autoOnDeviceMaxChars: 2500 };
const mode = (r: ReturnType<typeof decideRoute>) => (isBlocked(r) ? 'blocked' : (r as Route).mode);

describe('router', () => {
  it('auto: short docs prefer on-device, long docs prefer cloud', () => {
    expect(mode(decideRoute('auto', ctx))).toBe(InferenceMode.PREFER_ON_DEVICE);
    expect(mode(decideRoute('auto', { ...ctx, chars: 9000 }))).toBe(InferenceMode.PREFER_IN_CLOUD);
  });

  it('auto without Gemini Nano goes to the cloud', () => {
    expect(mode(decideRoute('auto', { ...ctx, device: 'unsupported' }))).toBe(InferenceMode.PREFER_IN_CLOUD);
  });

  it('offline uses on-device only, or blocks when there is no local model', () => {
    expect(mode(decideRoute('best', { ...ctx, online: false }))).toBe(InferenceMode.ONLY_ON_DEVICE);
    expect(mode(decideRoute('auto', { ...ctx, online: false, device: 'downloadable' }))).toBe('blocked');
  });

  it('private never routes to the cloud', () => {
    expect(mode(decideRoute('private', ctx))).toBe(InferenceMode.ONLY_ON_DEVICE);
    expect(mode(decideRoute('private', { ...ctx, device: 'unsupported' }))).toBe('blocked');
  });

  it('best quality prefers the cloud', () => {
    expect(mode(decideRoute('best', ctx))).toBe(InferenceMode.PREFER_IN_CLOUD);
  });
});

describe('chunkText', () => {
  it('splits on line boundaries and never loses text', () => {
    const text = Array.from({ length: 50 }, (_, i) => `line ${i} ${'x'.repeat(40)}\n`).join('');
    const chunks = chunkText(text, 500);
    expect(chunks.join('')).toBe(text);
    expect(chunks.every((c) => c.length <= 500)).toBe(true);
  });
});
