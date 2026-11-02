/**
 * The install prompt (docs/screen-map.md, Install prompt; architecture plan 8.1): after the code
 * at the end of the first session, "add this to your home screen for next time", with the steps
 * for this platform. Dismissible; after two dismissals it is never shown again; an app that is
 * already installed never shows it. The count lives in the device's settings under this key.
 */
export const INSTALL_DISMISSALS = 'installDismissals';
export const MAX_INSTALL_DISMISSALS = 2;

/** The browser's own install offer, when it makes one (Chrome on Android and on a desktop). */
export interface InstallOffer extends Event {
  prompt(): Promise<unknown>;
  userChoice?: Promise<{ outcome: 'accepted' | 'dismissed' }>;
}

export function installDue(input: {
  /** The platform of the dictation hint: null means no steps to show. */
  platform: string | null;
  dismissals: number;
  installed: boolean;
}): boolean {
  return input.platform !== null && !input.installed && input.dismissals < MAX_INSTALL_DISMISSALS;
}

/** Stored as digits; anything else reads as none. */
export function readDismissals(stored: string | undefined): number {
  return stored && /^\d+$/.test(stored) ? Number(stored) : 0;
}

/** Opened from the home screen, not in a browser tab. */
export function runsInstalled(): boolean {
  if (typeof matchMedia === 'function' && matchMedia('(display-mode: standalone)').matches)
    return true;
  return (navigator as { standalone?: boolean }).standalone === true;
}
