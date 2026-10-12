/**
 * In-browser demo backend: same contract and rules as the Supabase SQL
 * functions, stored in localStorage. Used when no Supabase keys are configured,
 * so the app can be tried (and previewed locally) without any setup.
 * Data never leaves the browser. Demo parent PIN: 1234.
 */
import { AppError } from './errors';
import { addDays, isoDow, tallinnToday } from './time';
import type {
  Activity, Backend, CompleteResult, Completion, Member, Settings, Snapshot, Task, Week,
} from './types';

const STORAGE_KEY = 'kodukangelased-demo-v1';

interface DemoDb {
  members: Member[];
  tasks: Task[];
  activities: Activity[];
  settings: Settings;
  weeks: Week[];
  completions: Completion[];
  pin: string;
  failedAttempts: number;
  lockedUntil: number | null;
}

const id = () => crypto.randomUUID();
const hoursAgo = (h: number) => new Date(Date.now() - h * 3600_000).toISOString();

function seed(): DemoDb {
  const m = (name: string, role: Member['role'], avatar: string, color: string, multiplier: number, sort_order: number): Member =>
    ({ id: id(), name, role, avatar, color, multiplier, sort_order, active: true });
  const members = [
    m('Tõnis', 'parent', '🐻', '#2563eb', 1, 1),
    m('Riin', 'parent', '🦊', '#ea580c', 1, 2),
    m('Trevor', 'child', '🦖', '#16a34a', 1.5, 3),
    m('Rosanna', 'child', '🦄', '#c026d3', 1.5, 4),
  ];
  const kids = members.filter((x) => x.role === 'child').map((x) => x.id);
  const all = [1, 2, 3, 4, 5, 6, 7];
  const t = (name: string, emoji: string, points: number, kind: Task['kind'], sort_order: number,
    assignees: string[] | null = null, weekdays = all, streak_enabled = false): Task =>
    ({ id: id(), name, emoji, points, kind, assignees, weekdays, streak_enabled, active: true, archived: false, sort_order });
  const tasks = [
    t('Nõudepesumasina tühjendamine', '🍽️', 10, 'shared_daily', 1),
    t('Laua katmine', '🍴', 6, 'shared_daily', 2),
    t('Oma toa koristamine', '🧸', 8, 'personal_daily', 3),
    t('Kooliks harjutamine', '📚', 10, 'personal_daily', 4, kids),
    t('Koolikoti ja asjade valmis panemine järgmiseks päevaks', '🎒', 5, 'personal_daily', 5, kids, [1, 2, 3, 4, 7], true),
    t('Koolipäeviku täitmine järgmiseks nädalaks', '📒', 15, 'personal_weekly', 6, kids),
  ];
  const activities = [
    ['Filmiõhtu diivanil', '🎬'], ['Lauamänguõhtu', '🎲'], ['Pitsaõhtu', '🍕'], ['Väljasõit', '🚗'],
    ['Matk metsas', '🌲'], ['Veekeskus või ujula', '🏊'], ['Pannkoogihommik', '🥞'], ['Kinoskäik', '🍿'],
    ['Piknik', '🧺'], ['Bowling', '🎳'],
  ].map(([name, emoji], i) => ({ id: id(), name, emoji, active: true, sort_order: i + 1 }));

  const [tonis, riin, trevor, rosanna] = members;
  const pastWeek: Week = {
    id: id(), started_at: hoursAgo(24 * 10), ended_at: hoursAgo(24 * 3),
    standings: [
      { member_id: rosanna.id, name: rosanna.name, avatar: rosanna.avatar, color: rosanna.color, points: 142, tasks: 17 },
      { member_id: trevor.id, name: trevor.name, avatar: trevor.avatar, color: trevor.color, points: 128, tasks: 15 },
      { member_id: riin.id, name: riin.name, avatar: riin.avatar, color: riin.color, points: 96, tasks: 12 },
      { member_id: tonis.id, name: tonis.name, avatar: tonis.avatar, color: tonis.color, points: 74, tasks: 9 },
    ],
    winner_ids: [rosanna.id], activity: 'Pitsaõhtu', activity_emoji: '🍕', activity_chosen_at: hoursAgo(24 * 3 - 1),
  };
  const openWeek: Week = {
    id: id(), started_at: pastWeek.ended_at!, ended_at: null, standings: null, winner_ids: null,
    activity: null, activity_emoji: null, activity_chosen_at: null,
  };

  const db: DemoDb = {
    members, tasks, activities, weeks: [openWeek, pastWeek], completions: [],
    settings: { family_name: 'Kodukangelased', approval_required: false, streak_length: 5, streak_bonus: 10 },
    pin: '1234', failedAttempts: 0, lockedUntil: null,
  };

  // A little activity from the last two days so the leaderboard isn't empty.
  const today = tallinnToday();
  const add = (task: Task, member: Member, daysAgo: number) => {
    const day = addDays(today, -daysAgo);
    db.completions.push({
      id: id(), task_id: task.id, member_id: member.id, week_id: openWeek.id, kind: task.kind, day,
      base_points: task.points, multiplier: member.multiplier, bonus_points: 0,
      points: Math.round(task.points * member.multiplier), streak: 0, status: 'done',
      created_at: hoursAgo(daysAgo * 24 + 2),
    });
  };
  add(tasks[0], riin, 1); add(tasks[1], trevor, 1); add(tasks[2], rosanna, 1);
  add(tasks[0], tonis, 2); add(tasks[3], trevor, 2); add(tasks[3], rosanna, 1);
  if (tasks[4].weekdays.includes(isoDow(addDays(today, -1)))) add(tasks[4], trevor, 1);
  return db;
}

export function createDemoBackend(): Backend {
  let db: DemoDb;
  try {
    db = JSON.parse(localStorage.getItem(STORAGE_KEY) ?? '') as DemoDb;
    if (!db?.members) throw new Error('empty');
  } catch {
    db = seed();
  }

  const listeners = new Set<() => void>();
  const commit = () => {
    try { localStorage.setItem(STORAGE_KEY, JSON.stringify(db)); } catch { /* private mode: keep in memory */ }
    listeners.forEach((l) => l());
  };
  commit();

  const openWeek = () => db.weeks.find((w) => !w.ended_at)!;
  const live = () => db.completions.filter((c) => c.status !== 'removed');

  function checkPin(pin: string | null | undefined) {
    if (db.lockedUntil && db.lockedUntil > Date.now()) throw new AppError('pin_locked');
    if (pin === db.pin) {
      db.failedAttempts = 0; db.lockedUntil = null;
      return;
    }
    db.failedAttempts += 1;
    if (db.failedAttempts >= 5) {
      db.failedAttempts = 0; db.lockedUntil = Date.now() + 5 * 60_000;
      commit();
      throw new AppError('pin_locked');
    }
    commit();
    throw new AppError('wrong_pin');
  }

  const pause = () => new Promise((r) => setTimeout(r, 120)); // feel like a network call

  return {
    isDemo: true,
    async getSessionEmail() { return 'demo@kodukangelased'; },
    async signIn() {},
    async signOut() { localStorage.removeItem(STORAGE_KEY); db = seed(); commit(); },
    onAuthChange() { return () => {}; },
    async isFamily() { return true; },

    async load(): Promise<Snapshot> {
      const weeks = [...db.weeks].sort((a, b) => b.started_at.localeCompare(a.started_at));
      return structuredClone({
        members: [...db.members].sort((a, b) => a.sort_order - b.sort_order),
        tasks: db.tasks.filter((t) => !t.archived).sort((a, b) => a.sort_order - b.sort_order),
        activities: [...db.activities].sort((a, b) => a.sort_order - b.sort_order),
        settings: db.settings,
        openWeek: openWeek(),
        pastWeeks: weeks.filter((w) => w.ended_at),
        completions: live(),
      });
    },

    subscribe(onChange) {
      listeners.add(onChange);
      return () => { listeners.delete(onChange); };
    },

    async completeTask(taskId, memberId): Promise<CompleteResult> {
      await pause();
      const t = db.tasks.find((x) => x.id === taskId && x.active && !x.archived);
      if (!t) throw new AppError('task_unavailable');
      const m = db.members.find((x) => x.id === memberId && x.active);
      if (!m) throw new AppError('member_unavailable');
      if (t.assignees?.length && !t.assignees.includes(m.id)) throw new AppError('not_assigned');
      const today = tallinnToday();
      if (!t.weekdays.includes(isoDow(today))) throw new AppError('not_today');
      const week = openWeek();

      const clash = live().some((c) => c.task_id === t.id && (
        t.kind === 'shared_daily' ? c.day === today
          : t.kind === 'personal_daily' ? c.day === today && c.member_id === m.id
            : c.week_id === week.id && c.member_id === m.id));
      if (clash) throw new AppError(t.kind === 'shared_daily' ? 'already_claimed' : 'already_done');

      let streak = 0;
      let bonus = 0;
      if (t.streak_enabled && t.kind === 'personal_daily') {
        const days = new Set(live().filter((c) => c.task_id === t.id && c.member_id === m.id).map((c) => c.day));
        streak = 1;
        let d = addDays(today, -1);
        for (let i = 0; i < 90; i++) {
          if (t.weekdays.includes(isoDow(d))) {
            if (!days.has(d)) break;
            streak++;
          }
          d = addDays(d, -1);
        }
        if (db.settings.streak_bonus > 0 && streak % db.settings.streak_length === 0) bonus = db.settings.streak_bonus;
      }
      const points = Math.round(t.points * m.multiplier) + bonus;
      const status = db.settings.approval_required && m.role === 'child' ? 'pending' : 'done';
      const c: Completion = {
        id: id(), task_id: t.id, member_id: m.id, week_id: week.id, kind: t.kind, day: today,
        base_points: t.points, multiplier: m.multiplier, bonus_points: bonus, points, streak, status,
        created_at: new Date().toISOString(),
      };
      db.completions.push(c);
      commit();
      return { id: c.id, points, bonus, streak, status };
    },

    async undoCompletion(completionId, pin) {
      await pause();
      const c = db.completions.find((x) => x.id === completionId && x.status !== 'removed');
      if (!c) throw new AppError('not_found');
      if (c.week_id !== openWeek().id) throw new AppError('week_closed');
      if (Date.parse(c.created_at) < Date.now() - 2 * 60_000) checkPin(pin);
      c.status = 'removed';
      commit();
    },

    async chooseActivity(weekId, activity, emoji) {
      await pause();
      const name = activity.trim();
      if (!name || name.length > 80) throw new AppError('invalid_activity');
      const w = db.weeks.find((x) => x.id === weekId && x.ended_at && !x.activity);
      if (!w) throw new AppError('activity_already_chosen');
      w.activity = name; w.activity_emoji = emoji?.trim() || '🎉'; w.activity_chosen_at = new Date().toISOString();
      commit();
    },

    async verifyPin(pin) { await pause(); checkPin(pin); commit(); },

    async changePin(oldPin, newPin) {
      checkPin(oldPin);
      if (!/^[0-9]{4,8}$/.test(newPin)) throw new AppError('invalid_pin');
      db.pin = newPin;
      commit();
    },

    async approveCompletion(pin, completionId) {
      checkPin(pin);
      const c = db.completions.find((x) => x.id === completionId && x.status === 'pending');
      if (!c) throw new AppError('not_found');
      c.status = 'done';
      commit();
    },

    async closeWeek(pin, weekId) {
      await pause();
      checkPin(pin);
      const w = openWeek();
      if (w.id !== weekId) throw new AppError('already_closed');
      db.completions.forEach((c) => { if (c.week_id === w.id && c.status === 'pending') c.status = 'done'; });
      const standings = [...db.members]
        .map((m) => {
          const mine = db.completions.filter((c) => c.member_id === m.id && c.week_id === w.id && c.status === 'done');
          return {
            member: m,
            row: { member_id: m.id, name: m.name, avatar: m.avatar, color: m.color,
              points: mine.reduce((s, c) => s + c.points, 0), tasks: mine.length },
          };
        })
        .filter((x) => x.member.active || x.row.tasks > 0)
        .sort((a, b) => b.row.points - a.row.points || a.member.sort_order - b.member.sort_order)
        .map((x) => x.row);
      const max = Math.max(0, ...standings.map((s) => s.points));
      const winners = max > 0 ? standings.filter((s) => s.points === max).map((s) => s.member_id) : null;
      w.ended_at = new Date().toISOString(); w.standings = standings; w.winner_ids = winners;
      db.weeks.push({ id: id(), started_at: new Date().toISOString(), ended_at: null, standings: null,
        winner_ids: null, activity: null, activity_emoji: null, activity_chosen_at: null });
      commit();
      return { closedWeekId: w.id, winnerIds: winners };
    },

    async saveTask(pin, input) {
      checkPin(pin);
      const streak = !!input.streak_enabled && input.kind === 'personal_daily';
      const weekdays = input.weekdays?.length ? [...new Set(input.weekdays)].sort() : [1, 2, 3, 4, 5, 6, 7];
      const assignees = input.assignees?.length ? input.assignees : null;
      const existing = input.id ? db.tasks.find((t) => t.id === input.id && !t.archived) : undefined;
      if (input.id && !existing) throw new AppError('not_found');
      const fields = {
        name: input.name.trim(), emoji: input.emoji.trim() || '⭐', points: input.points, kind: input.kind,
        assignees, weekdays, streak_enabled: streak, active: input.active ?? true,
      };
      if (existing) Object.assign(existing, fields);
      else db.tasks.push({ id: id(), archived: false, sort_order: Math.max(0, ...db.tasks.map((t) => t.sort_order)) + 1, ...fields });
      commit();
    },

    async deleteTask(pin, taskId) {
      checkPin(pin);
      const t = db.tasks.find((x) => x.id === taskId);
      if (!t) return;
      if (db.completions.some((c) => c.task_id === taskId)) { t.archived = true; t.active = false; }
      else db.tasks = db.tasks.filter((x) => x.id !== taskId);
      commit();
    },

    async saveMember(pin, input) {
      checkPin(pin);
      const existing = input.id ? db.members.find((m) => m.id === input.id) : undefined;
      if (input.id && !existing) throw new AppError('not_found');
      const fields = {
        name: input.name.trim(), role: input.role, avatar: input.avatar, color: input.color,
        multiplier: input.multiplier, active: input.active ?? true,
      };
      if (existing) Object.assign(existing, fields);
      else db.members.push({ id: id(), sort_order: Math.max(0, ...db.members.map((m) => m.sort_order)) + 1, ...fields });
      commit();
    },

    async saveActivity(pin, input) {
      checkPin(pin);
      const existing = input.id ? db.activities.find((a) => a.id === input.id) : undefined;
      if (existing) Object.assign(existing, { name: input.name.trim(), emoji: input.emoji, active: input.active ?? existing.active });
      else db.activities.push({ id: id(), name: input.name.trim(), emoji: input.emoji || '🎉', active: true,
        sort_order: Math.max(0, ...db.activities.map((a) => a.sort_order)) + 1 });
      commit();
    },

    async deleteActivity(pin, activityId) {
      checkPin(pin);
      db.activities = db.activities.filter((a) => a.id !== activityId);
      commit();
    },

    async saveSettings(pin, settings) {
      checkPin(pin);
      db.settings = { ...db.settings, ...settings };
      commit();
    },
  };
}
