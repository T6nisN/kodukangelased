import { useState, type CSSProperties, type FormEvent } from 'react';
import { backend } from '../../lib/backend';
import { TASK_EMOJI } from '../../lib/choices';
import { activeMembers } from '../../lib/logic';
import { WEEKDAY_SHORT } from '../../lib/time';
import type { Task, TaskInput, TaskKind } from '../../lib/types';
import { useData, useSnap } from '../../state/data';
import { useParent } from '../../state/parent';
import { useToast } from '../../state/toast';

const KINDS: { id: TaskKind; title: string; desc: string }[] = [
  { id: 'shared_daily', title: 'Ühine, iga päev', desc: 'Üks inimene päevas — kes ees, see mees' },
  { id: 'personal_daily', title: 'Isiklik, iga päev', desc: 'Igaüks saab teha kord päevas' },
  { id: 'personal_weekly', title: 'Isiklik, kord nädalas', desc: 'Igaüks saab teha kord nädalas' },
];

const EMPTY: TaskInput = {
  name: '', emoji: '⭐', points: 10, kind: 'personal_daily', assignees: null,
  weekdays: [1, 2, 3, 4, 5, 6, 7], streak_enabled: false, active: true,
};

export function TasksAdmin() {
  const snap = useSnap();
  const [editing, setEditing] = useState<TaskInput | null>(null);
  const kindTitle = (k: TaskKind) => KINDS.find((x) => x.id === k)!.title;
  const who = (t: Task) =>
    !t.assignees?.length ? 'Kõik' : t.assignees.map((id) => snap.members.find((m) => m.id === id)?.avatar ?? '').join(' ');

  if (editing) return <TaskEditor initial={editing} onDone={() => setEditing(null)} />;

  return (
    <div className="admin-panel">
      <button type="button" className="btn btn-primary btn-big" onClick={() => setEditing({ ...EMPTY })}>
        ➕ Uus ülesanne
      </button>
      <ul className="admin-list card">
        {snap.tasks.map((t) => (
          <li key={t.id} className={`admin-row ${t.active ? '' : 'inactive'}`}>
            <span className="admin-row-emoji" aria-hidden>{t.emoji}</span>
            <span className="admin-row-body">
              <strong>{t.name}</strong>
              <small>
                {kindTitle(t.kind)} · {t.points} p · {who(t)}
                {t.weekdays.length < 7 && ` · ${t.weekdays.map((d) => WEEKDAY_SHORT[d - 1]).join(' ')}`}
                {t.streak_enabled && ' · 🔥'}
                {!t.active && ' · peatatud'}
              </small>
            </span>
            <span className="admin-row-actions">
              <button type="button" className="btn btn-small btn-ghost" onClick={() => setEditing({ ...t })}>Muuda</button>
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}

function TaskEditor({ initial, onDone }: { initial: TaskInput; onDone: () => void }) {
  const snap = useSnap();
  const { reload } = useData();
  const { withPin } = useParent();
  const toast = useToast();
  const [t, setT] = useState<TaskInput>(initial);
  const [busy, setBusy] = useState(false);
  const set = <K extends keyof TaskInput>(k: K, v: TaskInput[K]) => setT((p) => ({ ...p, [k]: v }));

  const assignees = t.assignees ?? [];
  const weekdays = t.weekdays ?? [1, 2, 3, 4, 5, 6, 7];
  const toggle = <V,>(list: V[], v: V) => (list.includes(v) ? list.filter((x) => x !== v) : [...list, v]);

  const save = async (e: FormEvent) => {
    e.preventDefault();
    setBusy(true);
    const ok = await withPin((pin) => backend.saveTask(pin, { ...t, name: t.name.trim() }).then(() => true));
    setBusy(false);
    if (ok) {
      toast('Salvestatud ✅', 'success');
      void reload();
      onDone();
    }
  };

  const remove = async () => {
    if (!t.id || !confirm(`Kas kustutada „${t.name}”? Varasemad punktid jäävad alles.`)) return;
    const ok = await withPin((pin) => backend.deleteTask(pin, t.id!).then(() => true));
    if (ok) {
      toast('Kustutatud');
      void reload();
      onDone();
    }
  };

  return (
    <form className="admin-panel card editor" onSubmit={save}>
      <h2>{t.id ? 'Muuda ülesannet' : 'Uus ülesanne'}</h2>

      <label className="field">
        <span>Nimi</span>
        <input required maxLength={80} value={t.name} onChange={(e) => set('name', e.target.value)} placeholder="nt Prügi välja viimine" />
      </label>

      <fieldset className="field">
        <legend>Ikoon</legend>
        <div className="emoji-picker">
          {TASK_EMOJI.map((em) => (
            <button key={em} type="button" className={t.emoji === em ? 'picked' : ''} onClick={() => set('emoji', em)} aria-label={em}>{em}</button>
          ))}
          <input className="emoji-input" value={t.emoji} maxLength={4} onChange={(e) => set('emoji', e.target.value)} aria-label="Oma emoji" />
        </div>
      </fieldset>

      <fieldset className="field">
        <legend>Punktid</legend>
        <div className="stepper">
          <button type="button" onClick={() => set('points', Math.max(1, t.points - 1))} aria-label="Vähem">−</button>
          <input type="number" min={1} max={100} value={t.points} onChange={(e) => set('points', Math.min(100, Math.max(1, Number(e.target.value) || 1)))} />
          <button type="button" onClick={() => set('points', Math.min(100, t.points + 1))} aria-label="Rohkem">+</button>
        </div>
      </fieldset>

      <fieldset className="field">
        <legend>Tüüp</legend>
        <div className="kind-cards">
          {KINDS.map((k) => (
            <label key={k.id} className={`kind-card ${t.kind === k.id ? 'picked' : ''}`}>
              <input type="radio" name="kind" checked={t.kind === k.id} onChange={() => set('kind', k.id)} />
              <strong>{k.title}</strong>
              <small>{k.desc}</small>
            </label>
          ))}
        </div>
      </fieldset>

      <fieldset className="field">
        <legend>Kellele? <small className="muted">(midagi valimata = kõigile)</small></legend>
        <div className="avatar-toggles">
          {activeMembers(snap).map((m) => (
            <button
              key={m.id}
              type="button"
              className={`avatar-toggle ${assignees.includes(m.id) ? 'picked' : ''}`}
              style={{ '--c': m.color } as CSSProperties}
              aria-pressed={assignees.includes(m.id)}
              onClick={() => set('assignees', toggle(assignees, m.id))}
            >
              <span aria-hidden>{m.avatar}</span> {m.name}
            </button>
          ))}
        </div>
      </fieldset>

      <fieldset className="field">
        <legend>Millistel päevadel?</legend>
        <div className="weekday-toggles">
          {WEEKDAY_SHORT.map((label, i) => (
            <button
              key={label}
              type="button"
              className={weekdays.includes(i + 1) ? 'picked' : ''}
              aria-pressed={weekdays.includes(i + 1)}
              onClick={() => {
                const next = toggle(weekdays, i + 1);
                if (next.length) set('weekdays', next);
              }}
            >
              {label}
            </button>
          ))}
        </div>
      </fieldset>

      {t.kind === 'personal_daily' && (
        <label className="switch-row">
          <input type="checkbox" checked={!!t.streak_enabled} onChange={(e) => set('streak_enabled', e.target.checked)} />
          <span className="switch" aria-hidden />
          <span>🔥 Järjestikuste päevade boonus ({snap.settings.streak_length} päeva = +{snap.settings.streak_bonus} p)</span>
        </label>
      )}

      <label className="switch-row">
        <input type="checkbox" checked={t.active ?? true} onChange={(e) => set('active', e.target.checked)} />
        <span className="switch" aria-hidden />
        <span>Aktiivne</span>
      </label>

      <div className="row editor-actions">
        {t.id && <button type="button" className="btn btn-danger" onClick={() => void remove()}>Kustuta</button>}
        <span className="spacer" />
        <button type="button" className="btn btn-ghost" onClick={onDone}>Tühista</button>
        <button className="btn btn-primary" disabled={busy || !t.name.trim()}>Salvesta</button>
      </div>
    </form>
  );
}
