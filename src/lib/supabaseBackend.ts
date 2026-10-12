import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { AppError, toAppError } from './errors';
import { addDays, tallinnToday } from './time';
import type { Activity, Backend, Completion, Member, Settings, Snapshot, Task, Week } from './types';

const REALTIME_TABLES = ['members', 'tasks', 'weeks', 'completions', 'activities', 'settings'];

export function createSupabaseBackend(url: string, anonKey: string): Backend {
  const sb: SupabaseClient = createClient(url, anonKey, {
    auth: { persistSession: true, autoRefreshToken: true },
  });

  /** Call an RPC; throw AppError for both SQL exceptions and {"error": "..."} results. */
  async function rpc<T = Record<string, unknown>>(fn: string, args: Record<string, unknown>): Promise<T> {
    const { data, error } = await sb.rpc(fn, args);
    if (error) throw toAppError(error);
    if (data && typeof data === 'object' && 'error' in data) throw new AppError(String(data.error));
    return data as T;
  }

  async function rows<T>(query: PromiseLike<{ data: unknown; error: unknown }>): Promise<T> {
    const { data, error } = await query;
    if (error) throw toAppError(error);
    return data as T;
  }

  return {
    isDemo: false,

    async getSessionEmail() {
      const { data } = await sb.auth.getSession();
      return data.session?.user.email ?? null;
    },

    async signIn(email, password) {
      const { error } = await sb.auth.signInWithPassword({ email, password });
      if (error) throw new AppError(/invalid/i.test(error.message) ? 'invalid_login' : 'network');
    },

    async signOut() {
      await sb.auth.signOut();
    },

    onAuthChange(cb) {
      const { data } = sb.auth.onAuthStateChange((event) => {
        if (event === 'SIGNED_IN' || event === 'SIGNED_OUT') cb();
      });
      return () => data.subscription.unsubscribe();
    },

    async isFamily() {
      return rpc<boolean>('is_family', {});
    },

    async load(): Promise<Snapshot> {
      const [members, tasks, activities, settings, weeks] = await Promise.all([
        rows<Member[]>(sb.from('members').select('*').order('sort_order')),
        rows<Task[]>(sb.from('tasks').select('*').eq('archived', false).order('sort_order')),
        rows<Activity[]>(sb.from('activities').select('*').order('sort_order')),
        rows<Settings>(sb.from('settings').select('*').single()),
        rows<Week[]>(sb.from('weeks').select('*').order('started_at', { ascending: false }).limit(53)),
      ]);
      const openWeek = weeks.find((w) => !w.ended_at);
      if (!openWeek) throw new Error('No open week — did you run seed.sql?');

      // The open week plus ~40 days back, so streaks can be shown across week boundaries.
      const since = addDays(tallinnToday(), -40);
      const completions = await rows<Completion[]>(
        sb.from('completions')
          .select('*')
          .neq('status', 'removed')
          .or(`week_id.eq.${openWeek.id},day.gte.${since}`)
          .order('created_at'),
      );

      return {
        members, tasks, activities, settings, openWeek, completions,
        pastWeeks: weeks.filter((w) => w.ended_at),
      };
    },

    subscribe(onChange) {
      const channel = sb.channel('family-changes');
      for (const table of REALTIME_TABLES) {
        channel.on('postgres_changes', { event: '*', schema: 'public', table }, onChange);
      }
      channel.subscribe();
      return () => { void sb.removeChannel(channel); };
    },

    async completeTask(taskId, memberId) {
      return rpc('complete_task', { p_task_id: taskId, p_member_id: memberId });
    },
    async undoCompletion(completionId, pin) {
      await rpc('undo_completion', { p_completion_id: completionId, p_pin: pin ?? null });
    },
    async chooseActivity(weekId, activity, emoji) {
      await rpc('choose_activity', { p_week_id: weekId, p_activity: activity, p_emoji: emoji ?? null });
    },
    async verifyPin(pin) {
      await rpc('verify_pin', { p_pin: pin });
    },
    async changePin(oldPin, newPin) {
      await rpc('change_pin', { p_old_pin: oldPin, p_new_pin: newPin });
    },
    async approveCompletion(pin, completionId) {
      await rpc('approve_completion', { p_pin: pin, p_completion_id: completionId });
    },
    async closeWeek(pin, weekId) {
      const r = await rpc<{ closed_week_id: string; winner_ids: string[] | null }>('close_week', {
        p_pin: pin, p_week_id: weekId,
      });
      return { closedWeekId: r.closed_week_id, winnerIds: r.winner_ids };
    },
    async saveTask(pin, task) {
      await rpc('save_task', { p_pin: pin, p_task: task });
    },
    async deleteTask(pin, taskId) {
      await rpc('delete_task', { p_pin: pin, p_task_id: taskId });
    },
    async saveMember(pin, member) {
      await rpc('save_member', { p_pin: pin, p_member: member });
    },
    async saveActivity(pin, activity) {
      await rpc('save_activity', { p_pin: pin, p_activity: activity });
    },
    async deleteActivity(pin, activityId) {
      await rpc('delete_activity', { p_pin: pin, p_activity_id: activityId });
    },
    async saveSettings(pin, settings) {
      await rpc('save_settings', { p_pin: pin, p_settings: settings });
    },
  };
}
