import { useState } from 'react';
import { useSnap } from '../../state/data';
import { useParent } from '../../state/parent';
import { ActivitiesAdmin } from './ActivitiesAdmin';
import { DoneAdmin } from './DoneAdmin';
import { FamilyAdmin } from './FamilyAdmin';
import { SettingsAdmin } from './SettingsAdmin';
import { TasksAdmin } from './TasksAdmin';

type Tab = 'done' | 'tasks' | 'family' | 'activities' | 'settings';

export function AdminScreen() {
  const snap = useSnap();
  const { unlocked, requirePin, lock } = useParent();
  const [tab, setTab] = useState<Tab>('done');
  const pending = snap.completions.filter((c) => c.status === 'pending').length;

  if (!unlocked) {
    return (
      <div className="screen">
        <div className="card empty">
          <div className="empty-emoji" aria-hidden>🔒</div>
          <h1>Vanemate nurk</h1>
          <p className="muted">Siin saab muuta ülesandeid, pereliikmeid, tegevusi ja seadeid.</p>
          <button type="button" className="btn btn-primary btn-big" onClick={() => void requirePin()}>Sisesta PIN</button>
        </div>
      </div>
    );
  }

  const tabs: { id: Tab; label: string }[] = [
    { id: 'done', label: pending ? `Tehtud (${pending})` : 'Tehtud' },
    { id: 'tasks', label: 'Ülesanded' },
    { id: 'family', label: 'Pere' },
    { id: 'activities', label: 'Tegevused' },
    { id: 'settings', label: 'Seaded' },
  ];

  return (
    <div className="screen">
      <header className="screen-head admin-head">
        <h1>Vanemate nurk</h1>
        <button type="button" className="btn btn-ghost btn-small" onClick={lock}>🔒 Lukusta</button>
      </header>
      <nav className="segmented" aria-label="Vanemate menüü">
        {tabs.map((t) => (
          <button
            key={t.id}
            type="button"
            className={tab === t.id ? 'active' : ''}
            aria-current={tab === t.id ? 'page' : undefined}
            onClick={() => setTab(t.id)}
          >
            {t.label}
          </button>
        ))}
      </nav>
      {tab === 'done' && <DoneAdmin />}
      {tab === 'tasks' && <TasksAdmin />}
      {tab === 'family' && <FamilyAdmin />}
      {tab === 'activities' && <ActivitiesAdmin />}
      {tab === 'settings' && <SettingsAdmin />}
    </div>
  );
}
