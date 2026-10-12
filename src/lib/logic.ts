import type { Completion, Member, Snapshot, Task } from './types';
import { addDays, isoDow } from './time';

export function appliesTo(task: Task, memberId: string): boolean {
  return !task.assignees || task.assignees.length === 0 || task.assignees.includes(memberId);
}

export function scheduledOn(task: Task, day: string): boolean {
  return task.weekdays.includes(isoDow(day));
}

/** Points a member would get for a task (before any streak bonus). Mirrors complete_task(). */
export function pointsFor(task: Task, member: Member): number {
  return Math.round(task.points * member.multiplier);
}

export type TaskState =
  | { kind: 'todo' }
  | { kind: 'mine'; completion: Completion }
  | { kind: 'taken'; completion: Completion }; // shared task claimed by someone else

/** Is this task still open for the member, done by them, or taken by someone else? */
export function taskState(task: Task, memberId: string, snap: Snapshot, today: string): TaskState {
  const match = snap.completions.find((c) => {
    if (c.task_id !== task.id) return false;
    if (task.kind === 'shared_daily') return c.day === today;
    if (task.kind === 'personal_daily') return c.day === today && c.member_id === memberId;
    return c.week_id === snap.openWeek.id && c.member_id === memberId;
  });
  if (!match) return { kind: 'todo' };
  return match.member_id === memberId ? { kind: 'mine', completion: match } : { kind: 'taken', completion: match };
}

/**
 * Current streak for a personal daily task: consecutive scheduled days ending
 * today (if done) or yesterday (still alive, not yet done today).
 */
export function currentStreak(task: Task, memberId: string, completions: Completion[], today: string): number {
  if (!task.streak_enabled || task.kind !== 'personal_daily') return 0;
  const days = new Set(
    completions.filter((c) => c.task_id === task.id && c.member_id === memberId).map((c) => c.day),
  );
  let d = days.has(today) ? today : addDays(today, -1);
  let streak = 0;
  for (let i = 0; i < 90; i++) {
    if (scheduledOn(task, d)) {
      if (!days.has(d)) break;
      streak++;
    }
    d = addDays(d, -1);
  }
  return streak;
}

export interface Ranked {
  member: Member;
  points: number; // done
  pending: number; // waiting for approval
  tasks: number;
  rank: number; // ties share a rank
}

/** This week's leaderboard, highest first, tie-aware ranks. */
export function weekRanking(snap: Snapshot): Ranked[] {
  const rows = snap.members
    .filter((m) => m.active)
    .map((member) => {
      const mine = snap.completions.filter((c) => c.member_id === member.id && c.week_id === snap.openWeek.id);
      return {
        member,
        points: mine.filter((c) => c.status === 'done').reduce((s, c) => s + c.points, 0),
        pending: mine.filter((c) => c.status === 'pending').reduce((s, c) => s + c.points, 0),
        tasks: mine.length,
        rank: 0,
      };
    })
    .sort((a, b) => b.points + b.pending - (a.points + a.pending) || a.member.sort_order - b.member.sort_order);

  rows.forEach((r, i) => {
    const prev = rows[i - 1];
    r.rank = prev && prev.points + prev.pending === r.points + r.pending ? prev.rank : i + 1;
  });
  return rows;
}

export function activeMembers(snap: Snapshot): Member[] {
  return snap.members.filter((m) => m.active).sort((a, b) => a.sort_order - b.sort_order);
}

/** The latest closed week whose winner(s) still need to pick the family activity. */
export function weekAwaitingActivity(snap: Snapshot) {
  const w = snap.pastWeeks[0];
  return w && w.winner_ids && w.winner_ids.length > 0 && !w.activity ? w : null;
}

export function joinNames(names: string[]): string {
  if (names.length <= 1) return names.join('');
  return `${names.slice(0, -1).join(', ')} ja ${names[names.length - 1]}`;
}
