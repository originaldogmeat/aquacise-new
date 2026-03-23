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

2. In this repo, edit **`_config.yml`**:

```yaml
booking:
  supabase_url: "https://YOUR-PROJECT.supabase.co"
  supabase_anon_key: "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...."
```

3. Commit and push. GitHub Actions will rebuild the site.

The **anon** key is expected to be in the built HTML; security comes from **RLS** (row level security). Never commit the **service_role** key.

## 4. Configure available times (no database)

Edit **`_data/private_lesson_booking.yml`** in GitHub or locally:

- `timezone` — e.g. `America/Los_Angeles`
- `weekdays` — `1` = Monday … `7` = Sunday (Luxon/ISO)
- `daily_start` / `daily_end` — `HH:MM` on each open weekday
- `slot_duration_minutes` — length of each slot
- `closed_dates` — `YYYY-MM-DD` with no lessons

The calendar only shows the **next 14 days** (enforced in `assets/js/booking-app.js`).

Push changes to update the schedule.

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
