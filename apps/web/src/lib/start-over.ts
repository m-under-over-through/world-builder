import { codeSchema, slugLikeSchema } from '@wb/contracts';

/**
 * The note "Delete everything" leaves for the page load that follows it (ADR 0026;
 * docs/learn/14-what-a-tab-remembers.md).
 *
 * Deleting wipes the device's store, and the page is then loaded afresh so that nothing of the
 * participant stays in memory. A fresh page knows nothing: not the link this device came through,
 * so the welcome could only say "open the link you were sent". The person has not gone anywhere,
 * though: the tab is still open. So the delete leaves one note for the next load: the code the
 * device held and the wave it joined through. With them the welcome can offer "I understand"
 * again, and the join starts the same link over, exactly as opening the email's link again would
 * (ADR 0018).
 *
 * The note is in the tab's session storage, which belongs to this tab and goes when the tab is
 * closed. It is read once and erased in the same breath, before anything else happens on the next
 * load. After that the code is in memory only, never back in the device's store, so a reload or a
 * closed tab forgets it and "Delete everything" has left nothing on the device.
 *
 * Only a device that came through a wave leaves a note. An invite token works once and has been
 * used, so a device that came through one has no way back in from here, and is told to open the
 * link it was sent, as before.
 */
export const START_OVER = 'wb:startOver';

export interface StartOver {
  code: string;
  wave: string;
}

/** Leave the note. Quietly nothing where the browser refuses storage: the welcome then asks for the link. */
export function leaveStartOver(slug: string, code: string, wave: string | undefined): void {
  if (wave === undefined || !codeSchema.safeParse(code).success) return;
  try {
    sessionStorage.setItem(START_OVER, JSON.stringify({ slug, code, wave }));
  } catch {
    /* no session storage: the next load starts as any load without a link */
  }
}

/**
 * Take the note and erase it. None when there is none, when it was left for another workshop, or
 * when it is not what `leaveStartOver` writes: storage is a boundary like any other, and whatever
 * is found there is checked before it is believed.
 */
export function takeStartOver(slug: string): StartOver | null {
  let raw: string | null;
  try {
    raw = sessionStorage.getItem(START_OVER);
    if (raw !== null) sessionStorage.removeItem(START_OVER);
  } catch {
    return null;
  }
  if (raw === null) return null;
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return null;
  }
  if (typeof parsed !== 'object' || parsed === null) return null;
  const note = parsed as Record<string, unknown>;
  if (note['slug'] !== slug) return null;
  const code = codeSchema.safeParse(note['code']);
  if (!code.success) return null;
  const wave = slugLikeSchema.safeParse(note['wave']);
  if (!wave.success) return null;
  return { code: code.data, wave: wave.data };
}
