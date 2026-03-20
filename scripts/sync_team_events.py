#!/usr/bin/env python3
"""
Fetch Aquacise Team Events (GoMotion Team Events tab only — not General or Practices)
via the same public API the calendar SPA uses, and write _data/team_events.json.

Run from repo root: python3 scripts/sync_team_events.py
Requires network access.
"""
from __future__ import annotations

import html
import json
import os
import ssl
import urllib.error
import urllib.request
from datetime import date, datetime, timedelta, timezone
from typing import Any
from zoneinfo import ZoneInfo

TEAM_ALIAS = "waaqua"
BASE = "https://www.gomotionapp.com"
TZ_HEADER = "America/Los_Angeles"
CALENDAR_PAGE = f"{BASE}/team/{TEAM_ALIAS}/page/calendar"


def _post_json(path: str, body: dict[str, Any]) -> Any:
    data = json.dumps(body).encode("utf-8")
    req = urllib.request.Request(
        f"{BASE}{path}",
        data=data,
        method="POST",
        headers={
            "Content-Type": "application/json",
            "X-TU-Team": TEAM_ALIAS,
            "X-Rio-Client-TimeZone": TZ_HEADER,
            "User-Agent": "AquaciseSiteSync/1.0",
        },
    )
    ctx = ssl.create_default_context()
    with urllib.request.urlopen(req, context=ctx, timeout=60) as resp:
        return json.loads(resp.read().decode("utf-8"))


def _row_to_event(row: dict[str, Any], section: str) -> dict[str, Any]:
    eid = int(row["id"]["value"])
    title = row["title"]["value"]
    start = row["startDate"]["value"]
    end = row["endDate"]["value"]
    loc = row.get("location", {}).get("value") or ""
    desc = row.get("meetDescription", {}).get("value") or ""
    event_type = "upcoming" if section == "upcoming" else "past"
    link = f"{CALENDAR_PAGE}#/team-events/{event_type}/{eid}"
    return {
        "id": eid,
        "title": title,
        "start": start,
        "end": end,
        "location": loc,
        "description_html": desc,
        "gomotion_url": link,
    }


def main() -> None:
    tz = ZoneInfo(TZ_HEADER)
    now = datetime.now(timezone.utc)
    yesterday = (datetime.now(tz) - timedelta(days=1)).date()
    # Wide past window for “Past & Archived” (same API as GoMotion Team Events → Past)
    past_start = datetime.combine(
        date(yesterday.year - 10, 1, 1),
        datetime.min.time(),
        tzinfo=tz,
    )
    past_end = datetime.combine(yesterday, datetime.max.time()).replace(tzinfo=tz)

    raw_up = _post_json(
        "/rest/teamevent/rawData",
        {
            "isPastMeet": False,
            "isDeletedMeet": False,
            "timezone": TZ_HEADER,
        },
    )
    raw_past = _post_json(
        "/rest/teamevent/rawData",
        {
            "isPastMeet": True,
            "isDeletedMeet": False,
            "timezone": TZ_HEADER,
            "startDate": past_start.isoformat(),
            "endDate": past_end.isoformat(),
        },
    )

    upcoming = [_row_to_event(r, "upcoming") for r in raw_up]
    past = [_row_to_event(r, "past") for r in raw_past]

    upcoming.sort(key=lambda x: x["start"])
    past.sort(key=lambda x: x["start"], reverse=True)

    out = {
        "source_calendar": f"{CALENDAR_PAGE}#/team-events/upcoming",
        "synced_at": now.isoformat(),
        "synced_at_display": now.astimezone(tz).strftime("%B %e, %Y %I:%M %p %Z"),
        "upcoming": upcoming,
        "past": past,
    }

    repo_root = os.path.abspath(os.path.join(os.path.dirname(__file__), ".."))
    out_path = os.path.join(repo_root, "_data", "team_events.json")
    with open(out_path, "w", encoding="utf-8") as f:
        json.dump(out, f, ensure_ascii=False, indent=2)
        f.write("\n")

    print(f"Wrote {len(upcoming)} upcoming, {len(past)} past → {out_path}")

    render_static_events_html(repo_root, out)


def _parse_iso(s: str) -> datetime:
    # "2026-03-28T00:00:00.000-07:00"
    if s.endswith("Z"):
        s = s[:-1] + "+00:00"
    return datetime.fromisoformat(s)


def _date_key(dt: datetime) -> tuple[int, int, int]:
    return (dt.year, dt.month, dt.day)


def _format_event_dates(start_iso: str, end_iso: str) -> str:
    s = _parse_iso(start_iso)
    e = _parse_iso(end_iso)
    if _date_key(s) == _date_key(e):
        return f'<time datetime="{html.escape(start_iso)}">{s.strftime("%B %e, %Y").replace("  ", " ")}</time>'
    a = s.strftime("%b %e, %Y").replace("  ", " ")
    b = e.strftime("%b %e, %Y").replace("  ", " ")
    return (
        f'<time datetime="{html.escape(start_iso)}">{a}</time>'
        f'<span class="team-event-card__sep">–</span>'
        f'<time datetime="{html.escape(end_iso)}">{b}</time>'
    )


def _render_event_cards(events: list[dict[str, Any]]) -> str:
    parts: list[str] = []
    for ev in events:
        desc = ev.get("description_html") or ""
        loc = ev.get("location") or ""
        parts.append('<article class="team-event-card">')
        parts.append('<div class="team-event-card__dates">')
        parts.append(_format_event_dates(ev["start"], ev["end"]))
        parts.append("</div>")
        parts.append('<div class="team-event-card__body">')
        parts.append(
            f'<h4 class="team-event-card__title"><a href="{html.escape(ev["gomotion_url"])}">'
            f"{html.escape(ev['title'])}</a></h4>"
        )
        if loc:
            parts.append(f'<p class="team-event-card__location">{html.escape(loc)}</p>')
        if desc:
            parts.append(f'<div class="team-event-card__description">{desc}</div>')
        parts.append(
            f'<p class="team-event-card__link"><a href="{html.escape(ev["gomotion_url"])}">'
            "View on GoMotion calendar</a></p>"
        )
        parts.append("</div></article>")
    return "\n".join(parts)


def render_static_events_html(repo_root: str, data: dict[str, Any]) -> None:
    """Write _site/events/index.html for environments without Jekyll."""
    footer_path = os.path.join(repo_root, "_includes", "footer.html")
    analytics_path = os.path.join(repo_root, "_includes", "analytics.html")
    with open(footer_path, encoding="utf-8") as f:
        footer_html = f.read().strip()
    with open(analytics_path, encoding="utf-8") as f:
        analytics_html = f.read().strip()
    upcoming = data.get("upcoming") or []
    past = data.get("past") or []
    synced_disp = html.escape(data.get("synced_at_display") or "")
    synced_iso = html.escape(data.get("synced_at") or "")

    if upcoming:
        up_html = f'<div class="team-event-list">\n{_render_event_cards(upcoming)}\n</div>'
    else:
        up_html = '<p class="events-empty">No upcoming team events right now.</p>'

    if past:
        past_html = f'<div class="team-event-list">\n{_render_event_cards(past)}\n</div>'
    else:
        past_html = "<p class=\"events-empty\">No past team events in the selected range.</p>"

    synced_block = ""
    if synced_disp and synced_iso:
        synced_block = (
            f'<p class="events-synced">Last synced: <time datetime="{synced_iso}">{synced_disp}</time></p>'
        )

    body = f"""<div class="events-page">
\t<h2>Events</h2>
\t<p class="events-source">
\t\tTeam events from
\t\t<a href="https://www.gomotionapp.com/team/waaqua/page/calendar#/team-events/upcoming">Aquacise Swimming — Calendar (Team Events)</a>
\t\t(GoMotion). General calendar items and practices are not listed here.
\t</p>
\t{synced_block}
\t<section class="events-section" aria-labelledby="events-upcoming-heading">
\t\t<h3 id="events-upcoming-heading" class="events-section__title">Current &amp; upcoming</h3>
\t\t{up_html}
\t</section>
\t<section class="events-section" aria-labelledby="events-past-heading">
\t\t<h3 id="events-past-heading" class="events-section__title">Past &amp; archived</h3>
\t\t{past_html}
\t</section>
</div>
"""

    shell = f"""<!DOCTYPE html>
<html>
<head>
\t<meta charset="utf-8">
\t<meta http-equiv="x-ua-compatible" content="ie=edge">
\t<meta name="viewport" content="width=device-width, initial-scale=1">
\t<title>Events</title>
\t<link rel="stylesheet" href="/css/main.css">
\t<link rel="canonical" href="http://localhost:4000/events/">
\t<link href='https://fonts.googleapis.com/css?family=Open+Sans:400,300,700,800,600' rel='stylesheet' type='text/css'>
\t<link href='https://fonts.googleapis.com/css?family=Muli:400,300' rel='stylesheet' type='text/css'>
</head>
<body>
\t<aside>
\t<div class="container">
\t\t<nav>
\t\t\t<ul class="site-nav">
\t\t\t\t<li><a href="/">Home</a></li>
\t\t\t\t<li class="nav-dropdown">
\t\t\t\t\t<span class="nav-dropdown-label" tabindex="0" role="button" aria-haspopup="true" aria-expanded="false">About</span>
\t\t\t\t\t<ul class="nav-dropdown-menu">
\t\t\t\t\t\t<li><a href="/instructor/">Instructor</a></li>
\t\t\t\t\t\t<li><a href="/facilities/">Facilities</a></li>
\t\t\t\t\t</ul>
\t\t\t\t</li>
\t\t\t\t<li><a href="/announcements/">Announcements</a></li>
\t\t\t\t<li><a href="/events/">Events</a></li>
\t\t\t\t<li><a href="/book-private-lesson/">Book Private Lessons</a></li>
\t\t\t\t<li><a href="/contact/">Contact</a></li>
\t\t\t</ul>
\t\t</nav>
\t</div>
</aside>
<header>
    <h1>Aquacise</h1>
</header>
\t<main>
\t\t<article>
{body}
\t\t</article>
\t\t{footer_html}
\t</main>
{analytics_html}
</body>
</html>
"""
    out_dir = os.path.join(repo_root, "_site", "events")
    os.makedirs(out_dir, exist_ok=True)
    out_file = os.path.join(out_dir, "index.html")
    with open(out_file, "w", encoding="utf-8") as f:
        f.write(shell)
    print(f"Wrote {out_file}")


if __name__ == "__main__":
    try:
        main()
    except urllib.error.HTTPError as e:
        print(f"HTTP {e.code}: {e.reason}")
        raise SystemExit(1) from e
