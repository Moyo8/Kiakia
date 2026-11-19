import { InferenceMode } from 'firebase/ai';
import type { DeviceStatus } from './onDevice';

/** What the user asked for. */
export type Preference = 'auto' | 'private' | 'best';

export interface Route {
  mode: InferenceMode;
  /** Short label for the badge. */
  label: string;
  /** One sentence the user can read to understand the decision. */
  reason: string;
}

export interface RouteBlocked {
  blocked: string;
}

export interface RouteContext {
  online: boolean;
  device: DeviceStatus;
  /** Length of the redacted prompt context. */
  chars: number;
  /** Remote Config threshold for Auto routing. */
  autoOnDeviceMaxChars: number;
}

/**
 * Decide where an answer step runs. Everything routed here is already redacted, so
 * every mode is safe; the choice trades quality, speed, cost and connectivity.
 * The private shield step never goes through this router: it is always on-device.
 */
export function decideRoute(pref: Preference, ctx: RouteContext): Route | RouteBlocked {
  const nano = ctx.device === 'available';

  if (pref === 'private') {
    if (!nano)
      return {
        blocked:
          'Private mode needs Gemini Nano on this device. Download it, or switch to Auto: the cloud would only ever see the redacted text.',
      };
    return {
      mode: InferenceMode.ONLY_ON_DEVICE,
      label: 'On-device only',
      reason: 'Private mode: Gemini Nano answers on this device and nothing is sent anywhere.',
    };
  }

  if (!ctx.online) {
    if (!nano)
      return {
        blocked:
          "You're offline and Gemini Nano isn't available here, so there's no model to answer. Reconnect, or use Chrome with on-device AI.",
      };
    return {
      mode: InferenceMode.ONLY_ON_DEVICE,
      label: 'Offline · on-device',
      reason: "You're offline, so Gemini Nano answers on this device.",
    };
  }

  if (pref === 'best') {
    return {
      mode: InferenceMode.PREFER_IN_CLOUD,
      label: 'Cloud first',
      reason: nano
        ? 'Best quality: Gemini in the cloud reads the redacted text. If the cloud is unreachable, Gemini Nano answers instead.'
        : 'Best quality: Gemini in the cloud reads the redacted text.',
    };
  }

  // Auto
  if (!nano) {
    return {
      mode: InferenceMode.PREFER_IN_CLOUD,
      label: 'Cloud',
      reason:
        "Gemini Nano isn't available in this browser, so the redacted text goes to Gemini in the cloud.",
    };
  }
  if (ctx.chars <= ctx.autoOnDeviceMaxChars) {
    return {
      mode: InferenceMode.PREFER_ON_DEVICE,
      label: 'Device first',
      reason: `Short enough for Gemini Nano (${ctx.chars.toLocaleString()} of ${ctx.autoOnDeviceMaxChars.toLocaleString()} characters): answered on this device, instantly and for free. Falls back to the cloud if needed.`,
    };
  }
  return {
    mode: InferenceMode.PREFER_IN_CLOUD,
    label: 'Cloud first',
    reason: `Long document (${ctx.chars.toLocaleString()} characters, over the ${ctx.autoOnDeviceMaxChars.toLocaleString()} on-device limit): the redacted text goes to Gemini in the cloud for depth. Gemini Nano is the fallback.`,
  };
}

export function isBlocked(r: Route | RouteBlocked): r is RouteBlocked {
  return 'blocked' in r;
}
