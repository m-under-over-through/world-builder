import type { ListKey } from './copy.ts';

/**
 * Which platform's dictation hint to show (architecture plan, section 7 and 8.1): the keyboard's
 * microphone key on iPhone, iPad and Android; the shortcut on Mac, Windows and ChromeOS; nothing
 * on Linux and anything unknown. The names are the keys of the "Dictation hint" list in copy.md.
 *
 * Read from the browser's user agent string on the device, for this one choice, and never sent,
 * stored or logged: the hint is picked and the string is forgotten. An iPad with a desktop-class
 * browser calls itself a Mac; the touch points tell it apart.
 */
export type Platform = ListKey<'Dictation hint'>;

export function detectPlatform(userAgent: string, maxTouchPoints = 0): Platform | null {
  if (/iPhone|iPad|iPod/.test(userAgent)) return 'iPhone and iPad';
  if (/Android/.test(userAgent)) return 'Android';
  if (/CrOS/.test(userAgent)) return 'ChromeOS';
  if (/Windows/.test(userAgent)) return 'Windows';
  if (/Macintosh|Mac OS X/.test(userAgent)) return maxTouchPoints > 1 ? 'iPhone and iPad' : 'Mac';
  return null;
}

/**
 * A mouse or a trackpad is on this device: the front card says "Click to answer" rather than
 * "Tap to answer" (design/DESIGN.md, Components). A phone answers false; a test DOM has no
 * matchMedia and answers false too.
 */
export function finePointer(): boolean {
  return typeof matchMedia === 'function' && matchMedia('(pointer: fine)').matches;
}
