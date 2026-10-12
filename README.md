# Kodukangelased 🏠✨

Family chore & homework app: earn points for tasks, compete on a weekly leaderboard,
the winner picks the family activity. Estonian UI, mobile-first, installable PWA.

**Stack:** Vite + React + TypeScript (static build → GitHub Pages) · Supabase (Postgres, Auth, Realtime).

Without Supabase keys the app runs in **demo mode** (data in the browser only, PIN `1234`),
so you can try it immediately: `npm install && npm run build && npm run preview`.

---

## Architecture

```
Phone / kitchen tablet ──► GitHub Pages (static JS/CSS)
          │
          └──► Supabase
                 ├─ Auth: one family account (email + password), sign-ups disabled
                 ├─ Postgres: tables readable via RLS, writes ONLY through RPC functions
                 └─ Realtime: change events → every device reloads its snapshot
```

* **Family login** (once per device) keeps strangers out: every table's RLS policy requires
  `is_family()` = the logged-in auth user is listed in `family_users`.
* **"Kes sa oled?"** picks the member on the device (no auth per person — it's a family app).
* **Parent PIN** (bcrypt hash in a non-exposed `private` schema) gates admin, approvals,
  closing the week, and undo older than 2 minutes. Checked server-side on every call;
  5 wrong attempts → 5-minute lockout.
* **Rules live in the database**, not the UI: partial unique indexes make "shared task once
  per day", "personal once per day" and "weekly once per round" race-proof across devices.
  "Today" is always `now() at time zone 'Europe/Tallinn'`.
* **Week = competition round.** It runs until a parent presses **Lõpeta nädal** (Friday
  evening). `close_week()` snapshots standings, picks winner(s) (ties → co-winners choose
  together), and opens the next round. Every device then shows the celebration screen.

### Data model

| Table | Key fields | Notes |
|---|---|---|
| `members` | name, role (`parent`/`child`), avatar, color, **multiplier** | Kids ×1.5 by default (fairness) |
| `tasks` | name, emoji, points, kind, `assignees uuid[]` (null = everyone), `weekdays smallint[]`, streak_enabled, active, archived | Deleted tasks with history are archived |
| `weeks` | started_at, ended_at, `standings jsonb`, `winner_ids uuid[]`, activity | Exactly one open week (unique partial index) |
| `completions` | task_id, member_id, week_id, kind, day (Tallinn date), base_points, multiplier, bonus_points, points, streak, status (`done`/`pending`/`removed`) | Points are snapshotted, so later multiplier changes don't rewrite history |
| `activities` | name, emoji, active | The winner's pick list |
| `settings` | family_name, approval_required, streak_length, streak_bonus | Single row |
| `family_users` | user_id → auth.users | Which auth accounts may see data |
| `private.parent_secret` | pin_hash, failed_attempts, locked_until | Not reachable through the API |

**Fairness:** points × member multiplier (kids 1.5×), kids also have more tasks available.
**Streaks:** for personal daily tasks with 🔥 on, every Nth consecutive *scheduled* day gives a
bonus (default 5 days → +10). The school-bag task is scheduled Sun–Thu only, so weekends
don't break the streak.

---

## Setup

### 1. Supabase project

1. Create a project at [supabase.com](https://supabase.com). Pick an **EU region**
   (Frankfurt or Stockholm). The free tier is enough.
2. **SQL Editor** → paste and run [`supabase/schema.sql`](supabase/schema.sql), then
   [`supabase/seed.sql`](supabase/seed.sql).
3. **Authentication → Sign In / Providers**: turn **off** "Allow new users to sign up".
4. **Authentication → Users → Add user → Create new user**: the family email and a strong
   password, with **Auto Confirm User** ticked.
5. Link that account to the family (SQL Editor, use your real email):

   ```sql
   insert into public.family_users (user_id)
   select id from auth.users where email = 'pere@example.com';
   ```

6. **Project Settings → API**: copy the **Project URL** and the **anon** (or
   **publishable**) key. Both are designed to be public; RLS is what protects the data.
   Never use the `service_role` / secret key in the frontend.

### 2. Run locally against Supabase (optional)

```powershell
Copy-Item .env.example .env.local   # then fill in the two values
npm install
npm run dev
```

### 3. GitHub repo + Pages

```powershell
git init
git add .
git commit -m "Kodukangelased"
gh repo create kodukangelased --public --source . --push
```

GitHub Pages is free for **public** repos. A private repo needs a paid GitHub plan for
Pages. Public is fine here: the code contains no secrets, and the Supabase URL and anon key
end up in the public JS bundle anyway.

Then on GitHub:

1. **Settings → Secrets and variables → Actions → Variables**: add `VITE_SUPABASE_URL` and
   `VITE_SUPABASE_ANON_KEY`.
2. **Settings → Pages → Source: GitHub Actions**.
3. Push to `main` (or run the workflow manually). The app goes live at
   `https://<user>.github.io/kodukangelased/`.

### 4. On each device

Open the URL, log in once with the family account, and use **Share → Add to Home Screen**
(iOS) or **Install app** (Android/Chrome). On the kitchen tablet, turn on **🍳 Köögitahvel**
on the "Kes sa oled?" screen: it returns to the picker after 2 idle minutes.

**First thing:** Vanemad → Seaded → change the PIN from `1234`.

---

## Notes

* **Personal data:** first names and emoji only. No birth dates or ID codes, nothing
  sensitive. Data lives in your own Supabase project (EU). Fonts are self-hosted, so the
  app makes no Google requests.
* **Lost device:** change the family password in Supabase (Authentication → Users). Every
  device has to log in again.
* **Free-tier pausing:** Supabase pauses free projects after about 1 week without activity.
  Daily use keeps it awake.
* `npm run icons` regenerates the PWA icons (`scripts/make-icons.mjs`, no dependencies).
