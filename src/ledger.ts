/** One line in the privacy receipt: every AI call, where it ran, and what it saw. */
export interface LedgerEntry {
  id: number;
  at: Date;
  step: 'Shield' | 'Explain' | 'Follow-up';
  where: 'device' | 'cloud';
  detail: string;
  /** Characters sent off the device (0 when on-device). */
  sentChars: number;
  /** Number of private details replaced by placeholders before this call. */
  withheld: number;
  /** Exactly what left the device, for inspection. */
  payload?: string;
}

let nextId = 1;
export const newEntry = (e: Omit<LedgerEntry, 'id' | 'at'>): LedgerEntry => ({
  ...e,
  id: nextId++,
  at: new Date(),
});
