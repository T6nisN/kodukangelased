import { useState, type FormEvent } from 'react';
import { backend } from '../../lib/backend';
import { ACTIVITY_EMOJI } from '../../lib/choices';
import type { Activity } from '../../lib/types';
import { useData, useSnap } from '../../state/data';
import { useParent } from '../../state/parent';
import { useToast } from '../../state/toast';

/** The list the weekly winner picks from. */
export function ActivitiesAdmin() {
  const snap = useSnap();
  const { reload } = useData();
  const { withPin } = useParent();
  const toast = useToast();
  const [name, setName] = useState('');
  const [emoji, setEmoji] = useState(ACTIVITY_EMOJI[0]);

  const run = async (fn: (pin: string) => Promise<void>, msg?: string) => {
    if (await withPin((pin) => fn(pin).then(() => true))) {
      if (msg) toast(msg, 'success');
      void reload();
      return true;
    }
    return false;
  };

  const add = async (e: FormEvent) => {
    e.preventDefault();
    if (!name.trim()) return;
    if (await run((pin) => backend.saveActivity(pin, { name: name.trim(), emoji }), 'Lisatud ✅')) setName('');
  };

  const toggle = (a: Activity) => run((pin) => backend.saveActivity(pin, { ...a, active: !a.active }));
  const remove = (a: Activity) => {
    if (confirm(`Kas kustutada „${a.name}”?`)) void run((pin) => backend.deleteActivity(pin, a.id), 'Kustutatud');
  };

  return (
    <div className="admin-panel">
      <form className="card editor" onSubmit={add}>
        <h2>Lisa uus tegevus</h2>
        <div className="emoji-picker">
          {ACTIVITY_EMOJI.map((em) => (
            <button key={em} type="button" className={emoji === em ? 'picked' : ''} onClick={() => setEmoji(em)} aria-label={em}>{em}</button>
          ))}
        </div>
        <div className="row">
          <input className="grow" maxLength={60} value={name} onChange={(e) => setName(e.target.value)} placeholder="nt Batuudikeskus" aria-label="Tegevuse nimi" />
          <button className="btn btn-primary" disabled={!name.trim()}>Lisa</button>
        </div>
      </form>

      <ul className="admin-list card">
        {snap.activities.map((a) => (
          <li key={a.id} className={`admin-row ${a.active ? '' : 'inactive'}`}>
            <span className="admin-row-emoji" aria-hidden>{a.emoji}</span>
            <span className="admin-row-body"><strong>{a.name}</strong>{!a.active && <small>peidetud</small>}</span>
            <span className="admin-row-actions">
              <button type="button" className="btn btn-small btn-ghost" onClick={() => void toggle(a)}>{a.active ? 'Peida' : 'Näita'}</button>
              <button type="button" className="btn btn-small btn-ghost" onClick={() => remove(a)} aria-label={`Kustuta ${a.name}`}>🗑️</button>
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}
