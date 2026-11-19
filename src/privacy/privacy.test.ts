import { describe, expect, it } from 'vitest';
import { findPatternSpans } from './detectors';
import { expandSpans, mergeSpans } from './spans';
import { Vault } from './vault';
import { SAMPLES } from '../samples';

const shield = (text: string) => expandSpans(text, mergeSpans(findPatternSpans(text)));
const values = (text: string) => shield(text).map((s) => `${s.type}:${s.text}`);

describe('pattern detectors', () => {
  it('finds labeled identifiers in a lab report', () => {
    const v = values(SAMPLES[0].text);
    expect(v).toContain('PERSON:Jordan A. Rivera');
    expect(v).toContain('DATE:03/14/1985');
    expect(v).toContain('ID:00482913');
    expect(v).toContain('DATE:October 28, 2026');
    expect(v).toContain('PERSON:Amaka Eze');
    expect(v).toContain('PHONE:(217) 555-0142');
    expect(v).toContain('EMAIL:lab-results@riverside-health.example');
    // the surname alone later in the text is hidden too
    expect(v.filter((x) => x === 'PERSON:Rivera').length).toBe(1);
  });

  it('leaves clinical values alone', () => {
    const text = SAMPLES[0].text;
    const redacted = new Vault().redact(text, shield(text));
    for (const keep of ['10.9 g/dL', '13.5–17.5', 'Ferritin', '410 x10^9/L', 'iron deficiency']) {
      expect(redacted).toContain(keep);
    }
  });

  it('finds ids, money context and names in an insurance letter', () => {
    const v = values(SAMPLES[1].text);
    expect(v).toContain('PERSON:Adaeze Okafor');
    expect(v).toContain('ID:BHL-55821-907');
    expect(v).toContain('ID:2026-118842-C');
    expect(v).toContain('PHONE:1-800-555-0199');
    expect(v).toContain('ADDRESS:Hartford, CT 06103');
  });

  it('finds addresses and account numbers in a legal notice', () => {
    const v = values(SAMPLES[2].text);
    expect(v).toContain('ID:0047712290');
    expect(v).toContain('ADDRESS:1200 Lake Shore Drive');
    expect(v).toContain('PERSON:Grace Whitfield');
  });

  it('validates cards with Luhn and ignores random digit runs', () => {
    expect(values('Card 4111 1111 1111 1111 on file')).toContain('FINANCIAL:4111 1111 1111 1111');
    expect(values('Batch 1234 5678 9012 3456 shipped')).not.toContain(
      'FINANCIAL:1234 5678 9012 3456',
    );
  });

  it('does not treat "Member ID" as a name', () => {
    expect(values('Member ID: X-12345').some((x) => x.startsWith('PERSON:'))).toBe(false);
  });
});

describe('vault', () => {
  it('round-trips: redact, then rehydrate model output', () => {
    const text = SAMPLES[0].text;
    const vault = new Vault();
    const redacted = vault.redact(text, shield(text));
    expect(redacted).not.toContain('Rivera');
    expect(redacted).not.toContain('00482913');
    expect(redacted).toContain('[PERSON_1]');

    const modelOutput = 'Hi [PERSON_1], your result from [date_2] shows low hemoglobin. Ask PERSON_2.';
    const back = vault.rehydrate(modelOutput);
    expect(back).toContain('Jordan A. Rivera');
    expect(back).toContain('October 28, 2026');
    expect(back).toContain('Amaka Eze');
  });

  it('gives a surname the same token as the full name', () => {
    const vault = new Vault();
    const text = 'Patient: Jordan Rivera. Later, Mr. Rivera called.';
    const redacted = vault.redact(text, shield(text));
    expect(redacted).toBe('Patient: [PERSON_1]. Later, Mr. [PERSON_1] called.');
  });

  it('redacts known values in follow-up questions', () => {
    const vault = new Vault();
    const text = SAMPLES[1].text;
    vault.redact(text, shield(text));
    const q = vault.redactKnown('Can Adaeze Okafor appeal claim 2026-118842-C by phone?');
    expect(q).not.toContain('Okafor');
    expect(q).not.toContain('118842');
  });

  it('leaves unknown tokens untouched', () => {
    expect(new Vault().rehydrate('See [PERSON_9].')).toBe('See [PERSON_9].');
  });
});

describe('regressions', () => {
  it('does not swallow currency cents into a following date', () => {
    const text = 'rent ...... $1,950.00\n  November 2026 rent';
    const redacted = new Vault().redact(text, shield(text));
    expect(redacted).toContain('$1,950.00');
    expect(redacted).toContain('[DATE_1] rent');
  });

  it('catches addressee lines and PO boxes', () => {
    const v = values('To: Tunde Bakare and all other occupants\nPO Box 7731, Hartford, CT 06103');
    expect(v).toContain('PERSON:Tunde Bakare');
    expect(v).toContain('ADDRESS:PO Box 7731');
  });
});
