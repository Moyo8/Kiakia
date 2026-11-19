import { useCallback, useEffect, useState } from 'react';
import { checkDevice, type DeviceStatus } from './ai/onDevice';
import { downloadDeviceModel } from './ai/engine';

export function useOnline(): boolean {
  const [online, setOnline] = useState(() => navigator.onLine);
  useEffect(() => {
    const on = () => setOnline(true);
    const off = () => setOnline(false);
    window.addEventListener('online', on);
    window.addEventListener('offline', off);
    return () => {
      window.removeEventListener('online', on);
      window.removeEventListener('offline', off);
    };
  }, []);
  return online;
}

export function useDevice(canUseFirebase: boolean) {
  const [status, setStatus] = useState<DeviceStatus>('checking');
  const [progress, setProgress] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => setStatus(await checkDevice()), []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  // While Chrome downloads the model, poll until it's ready.
  useEffect(() => {
    if (status !== 'downloading') return;
    const id = window.setInterval(async () => {
      const s = await checkDevice();
      if (s !== 'downloading') {
        setStatus(s);
        setProgress(null);
      }
    }, 1500);
    return () => window.clearInterval(id);
  }, [status]);

  /** Must be called from a click: Chrome only allows model downloads after a user gesture. */
  const download = useCallback(async () => {
    if (!canUseFirebase) return;
    setError(null);
    setStatus('downloading');
    setProgress(0);
    try {
      await downloadDeviceModel((p) => setProgress(p));
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
      setStatus(await checkDevice());
      setProgress(null);
    }
  }, [canUseFirebase]);

  return { status, progress, error, download, refresh };
}
