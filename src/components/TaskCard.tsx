import { useEffect, useMemo, useState, type CSSProperties } from 'react';
import type { TaskState } from '../lib/logic';
import { pts } from '../lib/time';
import type { CompleteResult, Member, Task } from '../lib/types';

const UNDO_WINDOW_MS = 2 * 60_000; // matches undo_completion() in SQL

interface Props {
  task: Task;
  state: TaskState;
  points: number; // what this member would earn
  claimer?: Member; // for shared tasks taken by someone else
  streak: number;
  streakLength: number;
  onComplete: () => Promise<CompleteResult | null>;
  onUndo: (completionId: string) => Promise<void>;
}

const KIND_LABEL: Record<Task['kind'], string> = {
  shared_daily: 'Kes ees, see mees',
  personal_daily: 'Iga päev',
  personal_weekly: 'Kord nädalas',
};

export function TaskCard({ task, state, points, claimer, streak, streakLength, onComplete, onUndo }: Props) {
  const [busy, setBusy] = useState(false);
  const [party, setParty] = useState<CompleteResult | null>(null);
  const [, forceTick] = useState(0);

  const completion = state.kind === 'todo' ? null : state.completion;
  const canUndo = state.kind === 'mine' && Date.now() - Date.parse(state.completion.created_at) < UNDO_WINDOW_MS;

  // Re-render when the undo window closes so the button disappears.
  useEffect(() => {
    if (!canUndo || !completion) return;
    const left = UNDO_WINDOW_MS - (Date.now() - Date.parse(completion.created_at));
    const t = setTimeout(() => forceTick((n) => n + 1), left + 50);
    return () => clearTimeout(t);
  }, [canUndo, completion]);

  // Random sparkle directions, fixed per celebration.
  const sparkles = useMemo(
    () => Array.from({ length: 12 }, (_, i) => {
      const angle = (i / 12) * Math.PI * 2 + Math.random() * 0.4;
      const dist = 50 + Math.random() * 40;
      return { dx: Math.cos(angle) * dist, dy: Math.sin(angle) * dist, glyph: ['✨', '⭐', '💫', '🌟'][i % 4] };
    }),
    [party],
  );

  const tap = async () => {
    if (state.kind !== 'todo' || busy) return;
    setBusy(true);
    const result = await onComplete();
    setBusy(false);
    if (result) {
      setParty(result);
      navigator.vibrate?.(30);
      setTimeout(() => setParty(null), 1800);
    }
  };

  const status =
    state.kind === 'taken' ? 'taken'
      : state.kind === 'mine' ? (state.completion.status === 'pending' ? 'pending' : 'done')
        : 'todo';

  const nextStreak = streak + 1;
  const bonusSoon = task.streak_enabled && state.kind === 'todo' && nextStreak % streakLength === 0;

  return (
    <div className={`task task-${status} ${party ? 'task-pop' : ''} ${busy ? 'task-busy' : ''}`}>
      <button
        type="button"
        className="task-main"
        onClick={tap}
        disabled={state.kind !== 'todo'}
        aria-label={state.kind === 'todo' ? `${task.name}, ${pts(points)}. Märgi tehtuks.` : `${task.name}: tehtud`}
      >
        <span className="task-emoji" aria-hidden>{task.emoji}</span>
        <span className="task-body">
          <span className="task-name">{task.name}</span>
          <span className="task-meta">
            {status === 'taken' && claimer && (
              <span className="chip chip-soft" style={{ '--c': claimer.color } as CSSProperties}>
                {claimer.avatar} {claimer.name} jõudis ette
              </span>
            )}
            {status === 'pending' && <span className="chip chip-wait">⏳ Ootab vanema kinnitust</span>}
            {status === 'todo' && <span className="chip chip-points">+{points}</span>}
            {(status === 'done' || status === 'pending') && completion && (
              <span className="chip chip-points">+{completion.points}</span>
            )}
            <span className="task-kind">{KIND_LABEL[task.kind]}</span>
            {task.streak_enabled && streak > 0 && (
              <span className="chip chip-streak" title={`${streak} päeva järjest`}>🔥 {streak}</span>
            )}
            {bonusSoon && <span className="chip chip-bonus">Täna boonus!</span>}
          </span>
        </span>
        <span className="task-check" aria-hidden>
          {status === 'todo' ? '' : status === 'pending' ? '⏳' : '✓'}
        </span>
      </button>

      {canUndo && completion && (
        <button type="button" className="task-undo" onClick={() => void onUndo(completion.id)}>
          Oih, võta tagasi
        </button>
      )}

      {party && (
        <div className="party" aria-live="assertive">
          {sparkles.map((s, i) => (
            <span key={i} className="sparkle" style={{ '--dx': `${s.dx}px`, '--dy': `${s.dy}px` } as CSSProperties}>
              {s.glyph}
            </span>
          ))}
          <span className="float-points">+{pts(party.points)}!</span>
          {party.bonus > 0 && <span className="float-bonus">🔥 {party.streak} päeva järjest! +{party.bonus} boonust</span>}
        </div>
      )}
    </div>
  );
}
