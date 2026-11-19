import { DEVICE_STATUS_TEXT, type DeviceStatus } from '../ai/onDevice';
import type { Preference } from '../ai/router';
import { Icon } from './Icon';

interface Props {
  device: DeviceStatus;
  progress: number | null;
  onDownload: () => void;
  online: boolean;
  pref: Preference;
  onPref: (p: Preference) => void;
  configured: boolean;
}

const PREFS: Array<{ id: Preference; label: string; hint: string }> = [
  { id: 'auto', label: 'Auto', hint: 'Short documents on-device, long ones to the cloud (always redacted)' },
  { id: 'private', label: 'Private', hint: 'Everything stays on this device' },
  { id: 'best', label: 'Best quality', hint: 'Cloud first on redacted text, on-device fallback' },
];

export function StatusBar({ device, progress, onDownload, online, pref, onPref, configured }: Props) {
  const tone =
    device === 'available' ? 'good' : device === 'downloadable' || device === 'downloading' ? 'warn' : 'muted';
  return (
    <div className="statusbar">
      <div className={`chip chip-${tone}`} title={DEVICE_STATUS_TEXT[device]}>
        <Icon name="chip" />
        <span>
          {device === 'downloading' && progress !== null
            ? `Downloading Gemini Nano ${Math.round(progress * 100)}%`
            : DEVICE_STATUS_TEXT[device]}
        </span>
        {device === 'downloadable' && configured && (
          <button className="chip-action" onClick={onDownload}>
            <Icon name="download" size={14} /> Download
          </button>
        )}
      </div>
      <div className={`chip ${online ? 'chip-good' : 'chip-warn'}`}>
        <Icon name={online ? 'wifi' : 'wifiOff'} />
        <span>{online ? 'Online' : 'Offline'}</span>
      </div>
      <div className="segmented" role="radiogroup" aria-label="Where answers run">
        {PREFS.map((p) => (
          <button
            key={p.id}
            role="radio"
            aria-checked={pref === p.id}
            className={pref === p.id ? 'active' : ''}
            title={p.hint}
            onClick={() => onPref(p.id)}
          >
            {p.label}
          </button>
        ))}
      </div>
    </div>
  );
}
