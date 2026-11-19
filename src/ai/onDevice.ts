/**
 * Gemini Nano (Chrome's built-in Prompt API) availability, plus Kiakia's fail-closed
 * privacy guard.
 *
 * Why the guard exists: in the Firebase AI Logic Web SDK, a model created with
 * InferenceMode.ONLY_ON_DEVICE only enforces "on-device" when the browser exposes
 * `window.LanguageModel`. In browsers without it (Firefox, Safari, older Chrome) no
 * on-device adapter is created and the request is sent to the cloud model instead.
 * For a privacy filter that would leak the raw document, so Kiakia checks availability
 * itself before every on-device-only call and refuses to proceed otherwise.
 */

export type DeviceStatus =
  | 'checking'
  | 'unsupported' // browser has no Prompt API at all
  | 'unavailable' // API exists, but this device can't run the model
  | 'downloadable'
  | 'downloading'
  | 'available';

/** Shared with the Firebase hybrid models so both ask Chrome the same question. */
export const ON_DEVICE_CREATE_OPTIONS = {
  expectedInputs: [{ type: 'text' as const, languages: ['en'] }],
  expectedOutputs: [{ type: 'text' as const, languages: ['en'] }],
};

interface LanguageModelStatic {
  availability(options?: unknown): Promise<string>;
}

function languageModel(): LanguageModelStatic | undefined {
  return (globalThis as { LanguageModel?: LanguageModelStatic }).LanguageModel;
}

export async function checkDevice(): Promise<DeviceStatus> {
  const LM = languageModel();
  if (!LM) return 'unsupported';
  try {
    const a = await LM.availability(ON_DEVICE_CREATE_OPTIONS);
    if (a === 'available' || a === 'downloadable' || a === 'downloading') return a;
    return 'unavailable';
  } catch {
    return 'unavailable';
  }
}

export class PrivacyGuardError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'PrivacyGuardError';
  }
}

/** Throws unless Gemini Nano can serve a request on this device right now. */
export async function assertOnDevice(): Promise<void> {
  const status = await checkDevice();
  if (status !== 'available') {
    throw new PrivacyGuardError(
      `On-device model is ${status}; refusing to run a private step anywhere else.`,
    );
  }
}

export const DEVICE_STATUS_TEXT: Record<DeviceStatus, string> = {
  checking: 'Checking on-device AI…',
  unsupported: 'On-device AI not supported in this browser',
  unavailable: 'On-device AI unavailable on this device',
  downloadable: 'Gemini Nano not downloaded yet',
  downloading: 'Downloading Gemini Nano…',
  available: 'Gemini Nano ready on this device',
};
