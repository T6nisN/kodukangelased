import { useState, type FormEvent } from 'react';
import { backend } from '../../lib/backend';
import { errorMessage } from '../../lib/errors';
import type { Settings } from '../../lib/types';
import { useData, useSnap } from '../../state/data';
import { useParent } from '../../state/parent';
import { useToast } from '../../state/toast';

export function SettingsAdmin() {
  const snap = useSnap();
  const { reload } = useData();
  const { withPin, lock } = useParent();
  const toast = useToast();
  const [s, setS] = useState<Settings>(snap.settings);
  const [oldPin, setOldPin] = useState('');
  const [newPin, setNewPin] = useState('');

  const save = async (e: FormEvent) => {
    e.preventDefault();
    if (await withPin((pin) => backend.saveSettings(pin, s).then(() => true))) {
      toast('Seaded salvestatud ✅', 'success');
      void reload();
    }
  };

  const changePin = async (e: FormEvent) => {
    e.preventDefault();
    try {
      await backend.changePin(oldPin, newPin);
      toast('PIN muudetud 🔐', 'success');
      setOldPin('');
      setNewPin('');
      lock(); // re-enter with the new PIN next time
    } catch (err) {
      toast(errorMessage(err), 'error');
    }
  };

  const signOut = () => {
    const text = backend.isDemo
      ? 'Kas lähtestada demo andmed?'
      : 'Kas logida see seade pere kontost välja? Uuesti sisselogimiseks on vaja pere parooli.';
    if (confirm(text)) void backend.signOut().then(() => location.reload());
  };

  return (
    <div className="admin-panel">
      <form className="card editor" onSubmit={save}>
        <h2>Üldine</h2>
        <label className="field">
          <span>Äpi nimi</span>
          <input maxLength={40} value={s.family_name} onChange={(e) => setS({ ...s, family_name: e.target.value })} />
        </label>

        <label className="switch-row">
          <input type="checkbox" checked={s.approval_required} onChange={(e) => setS({ ...s, approval_required: e.target.checked })} />
          <span className="switch" aria-hidden />
          <span>Laste tehtud ülesanded vajavad vanema kinnitust</span>
        </label>

        <div className="two-col">
          <label className="field">
            <span>🔥 Mitu päeva järjest?</span>
            <input type="number" min={2} max={30} value={s.streak_length}
              onChange={(e) => setS({ ...s, streak_length: Math.min(30, Math.max(2, Number(e.target.value) || 2)) })} />
          </label>
          <label className="field">
            <span>Boonuspunkte</span>
            <input type="number" min={0} max={100} value={s.streak_bonus}
              onChange={(e) => setS({ ...s, streak_bonus: Math.min(100, Math.max(0, Number(e.target.value) || 0)) })} />
          </label>
        </div>
        <p className="muted small">Boonus tuleb iga {s.streak_length}. järjestikuse päeva järel (ülesannetel, kus 🔥 on sees).</p>
        <button className="btn btn-primary">Salvesta</button>
      </form>

      <form className="card editor" onSubmit={changePin}>
        <h2>Muuda PIN-i</h2>
        <div className="two-col">
          <label className="field">
            <span>Praegune PIN</span>
            <input inputMode="numeric" type="password" autoComplete="off" pattern="[0-9]{4,8}" required value={oldPin} onChange={(e) => setOldPin(e.target.value)} />
          </label>
          <label className="field">
            <span>Uus PIN (4–8 numbrit)</span>
            <input inputMode="numeric" type="password" autoComplete="off" pattern="[0-9]{4,8}" required value={newPin} onChange={(e) => setNewPin(e.target.value)} />
          </label>
        </div>
        <button className="btn btn-secondary">Muuda PIN</button>
      </form>

      <div className="card editor">
        <h2>See seade</h2>
        <p className="muted small">
          {backend.isDemo
            ? 'Demorežiim: andmed on ainult selles brauseris.'
            : 'Seade on pere kontosse sisse logitud. Kui seade läheb kaotsi, muuda Supabase\'is pere parool.'}
        </p>
        <button type="button" className="btn btn-danger" onClick={signOut}>
          {backend.isDemo ? 'Lähtesta demo' : 'Logi seade välja'}
        </button>
      </div>
    </div>
  );
}
