# The calendar file

"Remind me", at the foot of "Your world so far" and on the about page, opens a small text file, and the phone's own calendar offers to add what is in it. No service of ours is involved, nothing is stored on our side, and the file is the same for everyone. This note is what the file is, how the build makes it, and how to read one.

## The idea

A calendar file is the iCalendar format, RFC 5545: plain text, one property per line, `NAME:VALUE`, between `BEGIN:VCALENDAR` and `END:VCALENDAR`. Every calendar program reads it: an iPhone shows "Add All", Android hands it to the calendar app, a laptop opens it in Calendar or Outlook. An event is a `VEVENT` block inside it. A repeating event is one `VEVENT` with a rule, `RRULE`, that says how it repeats; the calendar unfolds the rule into dates itself. An alarm is a `VALARM` block inside the event.

Ours (`apps/web/src/lib/reminder.ts`) says: one event, Wednesdays and Sundays at six in the evening, fifteen minutes long, from the day after the workshop opens until its close day, with a notice at the time of the event, and the workshop's home address in it.

```
BEGIN:VCALENDAR
VERSION:2.0
PRODID:-//World Builder//reminder//EN
BEGIN:VEVENT
UID:reminder-rural-manufacturing@worldbuilder.under-over-through.co
DTSTAMP:20261116T000000Z
DTSTART:20261118T180000
DURATION:PT15M
RRULE:FREQ=WEEKLY;BYDAY=WE,SU;UNTIL=20261206T180000
SUMMARY:World Builder: a few more cards
DESCRIPTION:A few quiet minutes with the next cards\, whenever it suits you.
  https://worldbuilder.under-over-through.co/rural-manufacturing/
URL:https://worldbuilder.under-over-through.co/rural-manufacturing/
BEGIN:VALARM
ACTION:DISPLAY
DESCRIPTION:World Builder: a few more cards
TRIGGER:PT0M
END:VALARM
END:VEVENT
END:VCALENDAR
```

Three things in it are worth knowing.

- **Floating time.** `DTSTART:20261118T180000` has no `Z` at the end and no time zone name. The format calls that "floating": six in the evening wherever the phone is. A participant in Ohio and one in Oregon both get it at six, their own six. Nothing about where anyone is goes into the file.
- **The repeat rule.** `FREQ=WEEKLY;BYDAY=WE,SU` is every week on those two days; `UNTIL` is the last moment an occurrence may fall on, and it is inclusive, so the close day's evening is the last reminder. The rule's `UNTIL` must be the same kind of time as the start, floating here, which is why it carries the hour.
- **Two lines of bookkeeping.** `UID` is the event's identity: adding the file twice updates one event rather than making two. `DTSTAMP` is required by the format and means "when this was written"; ours is the workshop's opening day at midnight, a day and not a moment, so the file never carries the time of a build.

The rest is the format's small print: lines end in CRLF; a line longer than 75 bytes is folded onto a next line that starts with a space; commas, semicolons and backslashes in a text are escaped with a backslash. The code does those three things in three short functions, and a test reads a long line back through the fold.

## Why a file, and why one for everyone

A reminder could be a service (a calendar API, a push subscription) or a mail. Each would be a vendor, an address of the person, or both, and the trust page could no longer say that the app talks to one origin and keeps nothing about anyone. A file on our own origin is none of those. The price is that the file cannot know when a participant's first session was, so the series starts the day after the workshop opens: a participant who adds it on the twentieth sees the eighteenth in the past, and a past alarm never rings.

A file could be made on the phone, in the browser, with the right first day. It would then be a `blob:` address, and an iPhone does not open those with the add-to-calendar sheet the way it opens a `text/calendar` address on a site. It would also be the one thing the service worker could not keep for the installed app.

## The procedure in this repository

1. `apps/web/vite.config.ts` lists the workshop folders, reads each one's `workshop.json` for the two days and its `copy.md` for the "Reminder" block, and works out the absolute address: in production Netlify's `URL` (the site's own domain), on a branch deploy or a preview `DEPLOY_PRIME_URL` (that deploy's address), on a laptop `http://localhost:5173`.
2. `workshopReminders` in `apps/web/pwa.ts` writes one file per workshop into the build at `/<slug>/reminder.ics`, the way the manifests are written, and serves the same bytes on the development server so "Remind me" can be tried without a build.
3. `apps/web/public/_headers` tells Netlify to serve `/*/reminder.ics` as `text/calendar`. That header is what makes a phone open the file with its calendar rather than show it as text.
4. The service worker keeps the file with the client's own files, so "Remind me" works in an installed app offline, and the file's address is on the list of addresses the service worker never answers with the client's page (`REMINDER_PATH`). Without that line, a tap on the link in an installed app would open the app's page instead of the calendar.
5. The app links to the file with a plain anchor. No `download` attribute: on an iPhone that would save the file instead of offering to add it.

## Check it yourself

```
npm run build:web
cat apps/web/dist/rural-manufacturing/reminder.ics
grep -c rural-manufacturing/reminder.ics apps/web/dist/sw.js      # 1: kept offline
curl -sI https://staging--worldbuilder-uot.netlify.app/rural-manufacturing/reminder.ics | grep -i content-type
```

On a phone: finish a session on the deploy preview, tap "Remind me". An iPhone shows a sheet with "Add All"; after it, the calendar has an event on the next Wednesday or Sunday at six, repeating until 6 December 2026, with a notice. Android downloads the file and offers to open it with the calendar.

## What can go wrong

- **The link opens the app instead of the calendar.** The service worker answered the navigation with the client's page: `REMINDER_PATH` is missing from the deny list, or an older service worker is still installed (remove the app from the home screen and add it again).
- **The phone shows the file as text.** The `Content-Type` header is missing: check `_headers` and the `curl` above.
- **The calendar refuses the file.** A line is not CRLF, a line is longer than 75 bytes, or `UNTIL` is a different kind of time from `DTSTART`. The test in `apps/web/test/reminder.test.ts` holds all three.
- **The link in the event points at a preview.** The file was built for a preview; production's file carries the site's own address because the build reads `URL` in the production context.

## What it does not do

It does not know who added it, when, or whether they came back. It does not change when the workshop's days change until the next build, and it does not change on a phone that already added it: the calendar keeps its copy.
