export type Role = 'parent' | 'child';
export type TaskKind = 'shared_daily' | 'personal_daily' | 'personal_weekly';
export type CompletionStatus = 'done' | 'pending' | 'removed';

export interface Member {
  id: string;
  name: string;
  role: Role;
  avatar: string;
  color: string;
  multiplier: number;
  sort_order: number;
  active: boolean;
}

export interface Task {
  id: string;
  name: string;
  emoji: string;
  points: number;
  kind: TaskKind;
  assignees: string[] | null; // null/empty = everyone
  weekdays: number[]; // ISO 1 = Mon … 7 = Sun
  streak_enabled: boolean;
  active: boolean;
  archived: boolean;
  sort_order: number;
}

export interface Standing {
  member_id: string;
  name: string;
  avatar: string;
  color: string;
  points: number;
  tasks: number;
}

export interface Week {
  id: string;
  started_at: string;
  ended_at: string | null;
  standings: Standing[] | null;
  winner_ids: string[] | null;
  activity: string | null;
  activity_emoji: string | null;
  activity_chosen_at: string | null;
}

export interface Completion {
  id: string;
  task_id: string;
  member_id: string;
  week_id: string;
  kind: TaskKind;
  day: string; // YYYY-MM-DD, Europe/Tallinn
  base_points: number;
  multiplier: number;
  bonus_points: number;
  points: number;
  streak: number;
  status: CompletionStatus;
  created_at: string;
}

export interface Activity {
  id: string;
  name: string;
  emoji: string;
  active: boolean;
  sort_order: number;
}

export interface Settings {
  family_name: string;
  approval_required: boolean;
  streak_length: number;
  streak_bonus: number;
}

/** Everything the UI needs, loaded in one go and refreshed on realtime changes. */
export interface Snapshot {
  members: Member[];
  tasks: Task[];
  activities: Activity[];
  settings: Settings;
  openWeek: Week;
  pastWeeks: Week[]; // newest first
  completions: Completion[]; // not removed; open week + last ~40 days (for streaks)
}

export interface CompleteResult {
  id: string;
  points: number;
  bonus: number;
  streak: number;
  status: 'done' | 'pending';
}

export type TaskInput = Partial<Omit<Task, 'archived'>> & Pick<Task, 'name' | 'emoji' | 'points' | 'kind'>;
export type MemberInput = Partial<Member> & Pick<Member, 'name' | 'role' | 'avatar' | 'color' | 'multiplier'>;
export type ActivityInput = Partial<Activity> & Pick<Activity, 'name' | 'emoji'>;

/** The contract both the Supabase backend and the in-browser demo backend implement. */
export interface Backend {
  readonly isDemo: boolean;
  // Auth (demo: always signed in)
  getSessionEmail(): Promise<string | null>;
  signIn(email: string, password: string): Promise<void>;
  signOut(): Promise<void>;
  onAuthChange(cb: () => void): () => void;
  isFamily(): Promise<boolean>;
  // Data
  load(): Promise<Snapshot>;
  subscribe(onChange: () => void): () => void;
  // Everyone
  completeTask(taskId: string, memberId: string): Promise<CompleteResult>;
  undoCompletion(completionId: string, pin?: string | null): Promise<void>;
  chooseActivity(weekId: string, activity: string, emoji?: string | null): Promise<void>;
  // Parent (PIN)
  verifyPin(pin: string): Promise<void>;
  changePin(oldPin: string, newPin: string): Promise<void>;
  approveCompletion(pin: string, completionId: string): Promise<void>;
  closeWeek(pin: string, weekId: string): Promise<{ closedWeekId: string; winnerIds: string[] | null }>;
  saveTask(pin: string, task: TaskInput): Promise<void>;
  deleteTask(pin: string, taskId: string): Promise<void>;
  saveMember(pin: string, member: MemberInput): Promise<void>;
  saveActivity(pin: string, activity: ActivityInput): Promise<void>;
  deleteActivity(pin: string, activityId: string): Promise<void>;
  saveSettings(pin: string, settings: Partial<Settings>): Promise<void>;
}
