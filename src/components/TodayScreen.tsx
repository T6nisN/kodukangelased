import type { CSSProperties } from 'react';
import { backend } from '../lib/backend';
import { errorMessage } from '../lib/errors';
import { appliesTo, currentStreak, pointsFor, scheduledOn, taskState, weekRanking } from '../lib/logic';
import { formatLongDay, pts } from '../lib/time';
import type { Member, Task } from '../lib/types';
import { useData, useSnap } from '../state/data';
import { useToast } from '../state/toast';
import { TaskCard } from './TaskCard';

const SECTIONS: { kind: Task['kind']; title: string; hint: string }[] = [
  { kind: 'shared_daily', title: 'Ühised ülesanded', hint: 'Kes esimesena teeb, see punktid saab!' },
  { kind: 'personal_daily', title: 'Minu tänased', hint: 'Igaüks teeb enda omad' },
  { kind: 'personal_weekly', title: 'Selle nädala', hint: 'Üks kord nädalas' },
];

export function TodayScreen({ member }: { member: Member }) {
  const snap = useSnap();
  const { today, reload } = useData();
  const toast = useToast();

  const ranking = weekRanking(snap);
  const me = ranking.find((r) => r.member.id === member.id);
  const myTasks = snap.tasks.filter((t) => t.active && appliesTo(t, member.id) && scheduledOn(t, today));
  const states = new Map(myTasks.map((t) => [t.id, taskState(t, member.id, snap, today)]));
  const open = myTasks.filter((t) => states.get(t.id)!.kind === 'todo').length;

  const complete = async (task: Task) => {
    try {
      const r = await backend.completeTask(task.id, member.id);
      void reload();
      if (r.status === 'pending') toast('Super! Vanem kinnitab selle varsti. ⏳', 'success');
      return r;
    } catch (e) {
      toast(errorMessage(e), 'error');
      void reload();
      return null;
    }
  };

  const undo = async (completionId: string) => {
    try {
      await backend.undoCompletion(completionId);
      toast('Tagasi võetud 👍');
    } catch (e) {
      toast(errorMessage(e), 'error');
    }
    void reload();
  };

  return (
    <div className="screen">
      <header className="hello" style={{ '--c': member.color } as CSSProperties}>
        <div>
          <p className="hello-date">{formatLongDay()}</p>
          <h1>Tere, {member.name}! <span className="wave" aria-hidden>👋</span></h1>
          <p className="hello-sub">
            {myTasks.length === 0
              ? 'Täna sinu jaoks ülesandeid pole. Puhka!'
              : open === 0
                ? 'Kõik tänased tehtud — oled tõeline kodukangelane! 🦸'
                : `Täna ootab sind veel ${open} ${open === 1 ? 'ülesanne' : 'ülesannet'}.`}
          </p>
        </div>
        {me && (
          <div className="hello-score" aria-label={`Sel nädalal ${pts(me.points + me.pending)}, koht ${me.rank}`}>
            <span className="hello-score-num">{me.points + me.pending}</span>
            <span className="hello-score-label">punkti</span>
            <span className="hello-rank">{me.rank}. koht</span>
          </div>
        )}
      </header>

      {SECTIONS.map((section) => {
        const tasks = myTasks.filter((t) => t.kind === section.kind);
        if (tasks.length === 0) return null;
        return (
          <section key={section.kind} className="task-section">
            <h2>{section.title}</h2>
            <p className="section-hint">{section.hint}</p>
            <div className="task-list">
              {tasks.map((task) => {
                const state = states.get(task.id)!;
                return (
                  <TaskCard
                    key={task.id}
                    task={task}
                    state={state}
                    points={pointsFor(task, member)}
                    claimer={state.kind === 'taken' ? snap.members.find((m) => m.id === state.completion.member_id) : undefined}
                    streak={currentStreak(task, member.id, snap.completions, today)}
                    streakLength={snap.settings.streak_length}
                    onComplete={() => complete(task)}
                    onUndo={undo}
                  />
                );
              })}
            </div>
          </section>
        );
      })}
    </div>
  );
}
