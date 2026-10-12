/** Error codes raised by the SQL functions (and the demo backend), mapped to friendly Estonian. */
const MESSAGES: Record<string, string> = {
  already_claimed: 'Keegi jõudis sinust ette! 🏃',
  already_done: 'See on juba tehtud — tubli!',
  not_today: 'See ülesanne pole täna kavas.',
  not_assigned: 'See ülesanne pole sinu jaoks.',
  task_unavailable: 'Seda ülesannet enam pole.',
  member_unavailable: 'Seda pereliiget enam pole.',
  wrong_pin: 'Vale PIN. Proovi uuesti.',
  pin_locked: 'Liiga palju valesid katseid. Oota 5 minutit.',
  invalid_pin: 'PIN peab olema 4–8 numbrit.',
  week_closed: 'See nädal on juba lõppenud.',
  already_closed: 'Nädal on juba lõpetatud.',
  activity_already_chosen: 'Tegevus on juba valitud!',
  invalid_activity: 'Kirjuta tegevuse nimi (kuni 80 tähemärki).',
  not_found: 'Seda ei leitud — võib-olla muutis keegi just midagi.',
  not_family: 'Sellel kontol pole ligipääsu pere andmetele.',
  invalid_login: 'E-post või parool ei klapi.',
  network: 'Internetiühendus on kadunud. Proovi uuesti.',
};

export class AppError extends Error {
  constructor(public code: string) {
    super(MESSAGES[code] ?? 'Midagi läks viltu. Proovi uuesti.');
  }
}

/** Extract our error code from a Postgres/PostgREST error message. */
export function toAppError(err: unknown): AppError {
  if (err instanceof AppError) return err;
  const msg = (err as { message?: string })?.message ?? String(err);
  const code = Object.keys(MESSAGES).find((c) => msg.includes(c));
  if (code) return new AppError(code);
  if (/fetch|network/i.test(msg)) return new AppError('network');
  console.error(err);
  return new AppError('unknown');
}

export function errorMessage(err: unknown): string {
  return toAppError(err).message;
}
