import { useState, type FormEvent } from 'react';
import { backend } from '../lib/backend';
import { errorMessage } from '../lib/errors';

/** One-time family login per device. The session then stays on the device. */
export function LoginScreen({ notFamily }: { notFamily?: boolean }) {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(
    notFamily ? 'See konto pole pere nimekirjas. Vaata README juhendit (family_users).' : null,
  );
  const [busy, setBusy] = useState(false);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      await backend.signIn(email.trim(), password);
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusy(false);
    }
  };

  return (
    <main className="center-screen">
      <form className="card login-card" onSubmit={submit}>
        <div className="login-hero" aria-hidden>🏠✨</div>
        <h1>Kodukangelased</h1>
        <p className="muted">Logi selle seadmega pere kontole sisse. Seda on vaja teha ainult üks kord.</p>
        <label className="field">
          <span>Pere e-post</span>
          <input type="email" autoComplete="username" required value={email} onChange={(e) => setEmail(e.target.value)} />
        </label>
        <label className="field">
          <span>Parool</span>
          <input type="password" autoComplete="current-password" required value={password} onChange={(e) => setPassword(e.target.value)} />
        </label>
        {error && <p className="form-error" role="alert">{error}</p>}
        {notFamily && (
          <button type="button" className="btn btn-ghost" onClick={() => void backend.signOut()}>Logi välja</button>
        )}
        <button className="btn btn-primary btn-big" disabled={busy}>{busy ? 'Hetk…' : 'Logi sisse'}</button>
      </form>
    </main>
  );
}
