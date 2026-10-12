import { useEffect, useState } from 'react';
import { backend } from '../lib/backend';
import { errorMessage } from '../lib/errors';

interface Props {
  reason?: string;
  onDone: (pin: string | null) => void;
}

/** Big-button PIN pad — no keyboard needed on the kitchen tablet. */
export function PinDialog({ reason, onDone }: Props) {
  const [pin, setPin] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [shake, setShake] = useState(false);

  const submit = async (value: string) => {
    if (value.length < 4 || busy) return;
    setBusy(true);
    try {
      await backend.verifyPin(value);
      onDone(value);
    } catch (e) {
      setError(errorMessage(e));
      setPin('');
      setShake(true);
      setTimeout(() => setShake(false), 500);
    } finally {
      setBusy(false);
    }
  };

  const press = (d: string) => {
    if (busy) return;
    setError(null);
    setPin((p) => (p.length < 8 ? p + d : p));
  };

  // Physical keyboard works too (desktop).
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (/^[0-9]$/.test(e.key)) press(e.key);
      else if (e.key === 'Backspace') setPin((p) => p.slice(0, -1));
      else if (e.key === 'Enter') void submit(pin);
      else if (e.key === 'Escape') onDone(null);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  });

  return (
    <div className="overlay" role="dialog" aria-modal="true" aria-labelledby="pin-title">
      <div className={`sheet pin-sheet ${shake ? 'shake' : ''}`}>
        <div className="pin-lock" aria-hidden>🔒</div>
        <h2 id="pin-title">Vanema PIN</h2>
        <p className="muted">{reason ?? 'See osa on ainult vanematele.'}</p>
        <div className="pin-dots" aria-label={`${pin.length} numbrit sisestatud`}>
          {Array.from({ length: Math.max(4, pin.length) }, (_, i) => (
            <span key={i} className={i < pin.length ? 'filled' : ''} />
          ))}
        </div>
        <p className="pin-error" role="alert">{error ?? ' '}</p>
        <div className="pin-pad">
          {['1', '2', '3', '4', '5', '6', '7', '8', '9'].map((d) => (
            <button key={d} type="button" className="pin-key" onClick={() => press(d)}>{d}</button>
          ))}
          <button type="button" className="pin-key pin-key-soft" onClick={() => setPin((p) => p.slice(0, -1))} aria-label="Kustuta">⌫</button>
          <button type="button" className="pin-key" onClick={() => press('0')}>0</button>
          <button type="button" className="pin-key pin-key-go" onClick={() => void submit(pin)} disabled={pin.length < 4 || busy} aria-label="Kinnita">
            {busy ? '…' : '✓'}
          </button>
        </div>
        <button type="button" className="btn btn-ghost" onClick={() => onDone(null)}>Tühista</button>
      </div>
    </div>
  );
}
