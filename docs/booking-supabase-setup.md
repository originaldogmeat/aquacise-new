# Private lesson booking — Supabase setup

The Aquacise site is static (GitHub Pages). **Bookings are stored in Supabase** (free tier). You configure **which times can appear** in the repo file `_data/private_lesson_booking.yml`; **who booked what** lives in a Supabase table you can open like a spreadsheet and export to CSV.

## 1. Create a project

1. Go to [supabase.com](https://supabase.com) and sign in.
2. **New project** → choose organization, name, database password, region (e.g. West US).
3. Wait until the project is ready.

## 2. Create the `bookings` table

In the Supabase dashboard: **SQL Editor** → **New query**. Paste and run:

```sql
create table public.bookings (
  id uuid primary key default gen_random_uuid(),
  starts_at timestamptz not null,
  ends_at timestamptz not null,
  name text not null,
  email text not null,
  phone text,
  created_at timestamptz not null default now()
);

-- Prevent two lessons starting at the same instant (simple double-booking guard)
create unique index bookings_starts_at_key on public.bookings (starts_at);

alter table public.bookings enable row level security;

-- Public insert/read for the booking page (anon key in the browser).
-- Tighten later if you want (e.g. hide emails from anonymous reads).
create policy "bookings_insert_anon" on public.bookings
  for insert to anon with check (true);

create policy "bookings_select_anon" on public.bookings
  for select to anon using (true);
```

## 3. Connect the Jekyll site

1. **Project Settings** → **API**:
   - **Project URL** → copy (e.g. `https://abcdefgh.supabase.co`).
   - **anon public** key → copy (long JWT).

2. In this repo, edit **`_config.yml`** — the `booking:` block must be at the **top level** (not nested under `sass` or `kramdown`). Example:

```yaml
booking:
  supabase_url: "https://YOUR-PROJECT.supabase.co"
  supabase_anon_key: "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...."
```

Use the **anon public** JWT from **Settings → API** (usually starts with `eyJ`). If booking requests return **401**, try that JWT instead of a newer “publishable” key — PostgREST expects the anon JWT for `apikey` / `Authorization` headers.

3. Commit and push. GitHub Actions will rebuild the site.

The **anon** key is expected to be in the built HTML; security comes from **RLS** (row level security). Never commit the **service_role** key.

## 4. Configure available times (no database)

Edit **`_data/private_lesson_booking.yml`** in GitHub or locally, then commit and push.

### Simple schedule (same window on each open day)

- **`timezone`** — e.g. `America/Los_Angeles`
- **`weekdays`** — list of weekday numbers: `1` = Monday … `7` = Sunday. Example: only Tue & Thu → `[2, 4]`.
- **`daily_start` / `daily_end`** — clock times `HH:MM` for the **first possible start** and **end of the last slot** on each open day. Example: only 3–6 PM → `daily_start: "15:00"`, `daily_end: "18:00"`.
- **`slot_duration_minutes`** — length of each bookable block (e.g. `30`).
- **`closed_dates`** — list of `YYYY-MM-DD` dates with **no** slots (holidays, etc.).

### Different hours per weekday (optional)

If you set **`weekday_hours`** to a non-empty map, **only** those days and hours are used; **`weekdays`**, **`daily_start`**, and **`daily_end`** are ignored for generation.

One window per day:

```yaml
weekday_hours:
  "1": { start: "09:00", end: "12:00" }   # Monday
  "3": { start: "14:00", end: "17:00" }   # Wednesday
```

Several windows on the same day (e.g. Sat morning + evening):

```yaml
weekday_hours:
  "6":
    - { start: "09:00", end: "12:00" }
    - { start: "16:00", end: "19:00" }
```

Days not listed get **no** slots.

### Hide specific slots (optional)

**`blocked_slot_starts`** — list of exact slot **start** times to remove (local timezone, format `YYYY-MM-DD HH:mm`):

```yaml
blocked_slot_starts:
  - "2026-03-25 15:00"
  - "2026-03-25 15:30"
```

The calendar only lists the **next 14 days** (see `assets/js/booking-app.js`).

## 5. View and export bookings (“file you can access”)

- **Table Editor** → `bookings` — sort by `starts_at`, see name, email, phone, times.
- **⋯** menu on the table → export **CSV** when you need a file.

Optional: schedule **Database backups** or use Supabase **SQL** / integrations for email alerts (not included in this repo).

## 6. Optional: hide customer details from the public API

Right now the calendar only **requests** `starts_at` and `ends_at` for display, but RLS still allows `select` on the full row if someone calls the API manually. To harden:

- Remove `bookings_select_anon` and add a **view** that exposes only `starts_at`, `ends_at`, and grant `select` on the view to `anon`.
- Or use a **Supabase Edge Function** as the only public endpoint (more setup).

## Troubleshooting

| Issue | What to check |
|--------|----------------|
| “Online booking is not connected” | `booking.supabase_url` and `booking.supabase_anon_key` in `_config.yml` are non-empty and pushed. |
| Calendar error after load | Browser console (F12); RLS policies; table name exactly `bookings`; column names match SQL. |
| Double booking | Unique index on `starts_at` should return an error; user sees “That time was just taken.” |
