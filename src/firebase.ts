import { initializeApp, type FirebaseApp } from 'firebase/app';
import { CustomProvider, initializeAppCheck, ReCaptchaEnterpriseProvider } from 'firebase/app-check';
import { getAI, GoogleAIBackend, type AI } from 'firebase/ai';
import {
  fetchAndActivate,
  getRemoteConfig,
  getValue,
  type RemoteConfig,
} from 'firebase/remote-config';

declare global {
  // Read by the App Check SDK to enable the debug provider during local development.
  var FIREBASE_APPCHECK_DEBUG_TOKEN: boolean | string | undefined;
}

const env = import.meta.env;

const firebaseConfig = {
  apiKey: env.VITE_FIREBASE_API_KEY,
  authDomain: env.VITE_FIREBASE_AUTH_DOMAIN,
  projectId: env.VITE_FIREBASE_PROJECT_ID,
  storageBucket: env.VITE_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: env.VITE_FIREBASE_MESSAGING_SENDER_ID,
  appId: env.VITE_FIREBASE_APP_ID,
};

export const isConfigured = Boolean(
  firebaseConfig.apiKey && firebaseConfig.projectId && firebaseConfig.appId,
);

/**
 * Tunables served by Firebase Remote Config, so routing can be adjusted (or the cloud
 * model upgraded) without shipping a new build. These defaults apply offline too.
 */
export interface Tunables {
  /** Cloud model used for redacted analysis. */
  cloudModel: string;
  /** In Auto routing, redacted documents up to this length are answered on-device first. */
  autoOnDeviceMaxChars: number;
  /** Size of each slice the on-device shield reads (Gemini Nano has a small context). */
  shieldChunkChars: number;
}

const DEFAULTS: Tunables = {
  cloudModel: 'gemini-3.5-flash-lite',
  autoOnDeviceMaxChars: 2500,
  shieldChunkChars: 2400,
};

let app: FirebaseApp | undefined;
let ai: AI | undefined;
let remoteConfig: RemoteConfig | undefined;
let appCheckReady = false;

function init(): FirebaseApp {
  if (app) return app;
  if (!isConfigured) throw new Error('Firebase is not configured. See README → Setup.');
  app = initializeApp(firebaseConfig);

  // App Check is required by Firebase AI Logic. In development the debug provider is
  // used: a token comes from .env.local, or the SDK prints one to the console.
  if (env.DEV) {
    self.FIREBASE_APPCHECK_DEBUG_TOKEN = env.VITE_APPCHECK_DEBUG_TOKEN || true;
  }
  const siteKey = env.VITE_RECAPTCHA_ENTERPRISE_SITE_KEY;
  if (siteKey || env.DEV) {
    initializeAppCheck(app, {
      // Without a site key (local dev only), the debug token is the only attestation;
      // a no-op provider avoids loading reCAPTCHA with an invalid key.
      provider: siteKey
        ? new ReCaptchaEnterpriseProvider(siteKey)
        : new CustomProvider({
            getToken: () => Promise.reject(new Error('No reCAPTCHA site key; using the debug token.')),
          }),
      isTokenAutoRefreshEnabled: true,
    });
    appCheckReady = true;
  } else {
    console.warn('[Veil] No reCAPTCHA Enterprise site key: App Check is off, cloud calls will be rejected.');
  }
  return app;
}

export function getAILogic(): AI {
  if (ai) return ai;
  ai = getAI(init(), {
    backend: new GoogleAIBackend(),
    // Fresh limited-use App Check tokens give replay protection for AI requests.
    useLimitedUseAppCheckTokens: true,
  });
  return ai;
}

export function appCheckEnabled(): boolean {
  return appCheckReady;
}

let tunables: Tunables = { ...DEFAULTS };

export function getTunables(): Tunables {
  return tunables;
}

/** Fetch Remote Config once at startup; silently keeps defaults when offline. */
export async function loadTunables(): Promise<Tunables> {
  if (!isConfigured) return tunables;
  try {
    remoteConfig ??= getRemoteConfig(init());
    remoteConfig.settings.minimumFetchIntervalMillis = env.DEV ? 60_000 : 10 * 60_000;
    remoteConfig.defaultConfig = {
      cloud_model: DEFAULTS.cloudModel,
      auto_on_device_max_chars: DEFAULTS.autoOnDeviceMaxChars,
      shield_chunk_chars: DEFAULTS.shieldChunkChars,
    };
    await fetchAndActivate(remoteConfig);
    tunables = {
      cloudModel: getValue(remoteConfig, 'cloud_model').asString() || DEFAULTS.cloudModel,
      autoOnDeviceMaxChars:
        getValue(remoteConfig, 'auto_on_device_max_chars').asNumber() ||
        DEFAULTS.autoOnDeviceMaxChars,
      shieldChunkChars:
        getValue(remoteConfig, 'shield_chunk_chars').asNumber() || DEFAULTS.shieldChunkChars,
    };
  } catch (e) {
    console.info('[Veil] Remote Config unavailable, using defaults.', e);
  }
  return tunables;
}
