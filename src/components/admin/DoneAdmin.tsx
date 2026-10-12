import type { ReactNode } from 'react';
import { backend } from '../../lib/backend';
import { formatLongDay, formatTime } from '../../lib/time';
import type { Completion } from '../../lib/types';
import { useData, useSnap } from '../../state/data';
import { useParent } from '../../state/parent';
import { useToast } from '../../state/toast';

/** Approvals (if enabled) and this week's completions with undo. */
export function DoneAdmin() {
  const snap = useSnap();
  const { reload } = useData();
  const { withPin } = useParent();
  const toast = useToast();

  const week = snap.completions
    .filter((c) => c.week_id === snap.openWeek.id)
    .sort((a, b) => b.created_at.localeCompare(a.created_at));
  const pending = week.filter((c) => c.status === 'pending');
  const member = (id: string) => snap.members.find((m) => m.id === id);
  const task = (id: string) => snap.tasks.find((t) => t.id === id);

  const approve = async (c: Completion) => {
    if (await withPin((pin) => backend.approveCompletion(pin, c.id).then(() => true))) {
      toast('Kinnitatud ✅', 'success');
      void reload();
    }
  };
  const remove = async (c: Completion, verb: string) => {
    if (await withPin((pin) => backend.undoCompletion(c.id, pin).then(() => true))) {
      toast(verb);
      void reload();
    }
  };

  // Group by Tallinn day.
  const byDay = new Map<string, Completion[]>();
  week.forEach((c) => byDay.set(c.day, [...(byDay.get(c.day) ?? []), c]));

  const row = (c: Completion, actions: ReactNode) => {
    const m = member(c.member_id);
    const t = task(c.task_id);
    return (
      <li key={c.id} className="admin-row">
        <span className="admin-row-emoji" aria-hidden>{t?.emoji ?? '❔'}</span>
        <span className="admin-row-body">
          <strong>{t?.name ?? 'Kustutatud ülesanne'}</strong>
          <small>
            {m?.avatar} {m?.name} · {formatTime(c.created_at)} · +{c.points}
            {c.bonus_points > 0 && ` (🔥 +${c.bonus_points})`}
            {c.status === 'pending' && ' · ootel'}
          </small>
        </span>
        <span className="admin-row-actions">{actions}</span>
      </li>
    );
  };

  return (
    <div className="admin-panel">
      {pending.length > 0 && (
        <section className="card">
          <h2>Ootavad kinnitust</h2>
          <ul className="admin-list">
            {pending.map((c) =>
              row(c, (
                <>
                  <button type="button" className="btn btn-small btn-primary" onClick={() => void approve(c)}>Kinnita</button>
                  <button type="button" className="btn btn-small btn-ghost" onClick={() => void remove(c, 'Tagasi lükatud')}>Ei</button>
                </>
              )),
            )}
          </ul>
        </section>
      )}

      <section className="card">
        <h2>Sel nädalal tehtud</h2>
        {week.length === 0 && <p className="muted">Veel pole midagi tehtud.</p>}
        {[...byDay.entries()].map(([day, items]) => (
          <div key={day}>
            <h3 className="admin-day">{formatLongDay(new Date(`${day}T12:00:00Z`))}</h3>
            <ul className="admin-list">
              {items.map((c) =>
                row(c, (
                  <button type="button" className="btn btn-small btn-ghost" onClick={() => void remove(c, 'Tagasi võetud')}>
                    Võta tagasi
                  </button>
                )),
              )}
            </ul>
          </div>
        ))}
      </section>
    </div>
  );
}
