import {
  formatCode,
  generateCode,
  normalizeCode,
  codeSchema,
  MAX_ANSWER_CHARS,
  type Card,
  type JoinRequest,
  type MeResponse,
} from '@wb/contracts';
import { sealAnswer } from '@wb/crypto';
import { api, DEFAULT_RETRY_AFTER_SECONDS } from './api.ts';
import type { Copy } from './copy.ts';
import { sessionCards, truncateCodePoints } from './deck.ts';
import { dayStatus } from './days.ts';
import { detectPlatform, type Platform } from './platform.ts';
import {
  countsAsOpen,
  pageHref,
  parseArrival,
  parseRoute,
  type Arrival,
  type Page,
} from './route.ts';
import { localDay, WorkshopStore } from './store.ts';
import { queueJoin, reconcile, syncNow, syncOnOpen, type SyncStatus } from './sync.ts';
import { defaultCopy, findWorkshop, type Workshop } from './workshops.ts';

/**
 * The state of the client and everything that changes it, in one place a reader can follow from
 * top to bottom: which screen is showing, the workshop, the code, the session, the sync status,
 * and the rows of the privacy panel. The screens in src/screens/ only render it and call its
 * functions; App.svelte picks the screen. Screens and states follow docs/screen-map.md.
 *
 * The fields are reactive ($state): a screen re-renders when one changes. Objects from outside
 * (the workshop, the server's answer) are kept raw, so nothing wraps the copy or the deck.
 */
export type Screen =
  | 'loading'
  | 'no-workshop'
  | 'welcome'
  | 'enter-code'
  | 'intro-1'
  | 'intro-2'
  | 'consent'
  | 'demo'
  | 'card'
  | 'session-end'
  | 'panel'
  | 'closed';

/** The code as shown before "Reveal": four groups of four. */
export const MASKED_CODE = '•••• •••• •••• ••••';

export class AppState {
  screen = $state<Screen>('loading');
  workshop = $state.raw<Workshop | undefined>(undefined);
  copy = $state.raw<Copy>(defaultCopy());
  store: WorkshopStore | undefined;
  code = $state('');
  arrival = $state<Arrival>({});
  /** The error code of the last failure on this screen, shown through its copy.md wording. */
  error = $state('');
  /** Not an error code: the one local refusal, a code that is not 16 digits yet. */
  tooShort = $state(false);
  /** The platform whose dictation hint applies, or null when there is none (Linux, unknown). */
  platform = $state<Platform | null>(null);

  /**
   * The answer being written on the current card. It lives here, not in the card component, so
   * opening "Your privacy" and coming back finds it where it was (review of item 4).
   */
  draft = $state('');
  /** True while a refused join waits out the server's Retry-After before its one retry. */
  retrying = $state(false);
  /** How the join waits; a test replaces it so the wait is instant. */
  wait: (ms: number) => Promise<void> = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
  /**
   * The address this device arrived at, put back in the address bar whenever no page is shown.
   * A wave link stays there, so the page can be shared or carried to another device from the
   * address bar at any point (docs/screen-map.md, Entry); an invite is replaced by the home.
   */
  private home = '';

  // the session
  cards = $state.raw<Card[]>([]);
  index = $state(0);
  sessionId = '';
  /** 1 for the participant's first session: the demo card and the hint show only then. */
  sessionNo = $state(0);
  seq = 0;
  saving = $state(false);
  joining = $state(false);
  hintOpen = $state(false);
  sync = $state<SyncStatus>({ lastResult: 'never', outboxSize: 0 });

  // the panel
  me = $state.raw<MeResponse | null>(null);
  hosts = $state<string[]>([]);
  cookies = $state(0);
  /** The screen the panel was opened from, to go back to. */
  private before: Screen = 'loading';

  get card(): Card | undefined {
    return this.cards[this.index];
  }

  /** Today against the workshop's days, judged on the device (lib/days.ts); the server has the last word. */
  today(): 'before' | 'open' | 'after' {
    return this.workshop
      ? dayStatus(localDay(), this.workshop.opensDay, this.workshop.config.closesDay)
      : 'open';
  }

  get notYetOpen(): boolean {
    return this.workshop !== undefined && this.today() === 'before';
  }

  /** The screen for an address: the entry rows of the screen map. */
  async open(pathname: string): Promise<void> {
    const route = parseRoute(pathname);
    this.workshop = route ? findWorkshop(route.slug) : undefined;
    if (!route || !this.workshop) {
      this.screen = 'no-workshop';
      return;
    }
    this.copy = this.workshop.copy;
    this.platform = detectPlatform(navigator.userAgent, navigator.maxTouchPoints);
    this.store = new WorkshopStore(route.slug);
    const saved = await this.store.get('code');
    const stored = parseArrival(await this.store.get('arrival'));
    this.home = pageHref(route.slug);
    if (route.wave) {
      // A wave is not a secret, so the address stays as it is: a copied address, the share sheet
      // and Safari's tabs from other devices all still join. The open is counted once per device,
      // the first time this device arrives through this wave (lib/route.ts, countsAsOpen).
      this.arrival = { wave: route.wave };
      this.home = `/${route.slug}/join/${route.wave}`;
      if (countsAsOpen(stored, route.wave)) {
        await this.store.set('arrival', JSON.stringify(this.arrival));
        void api(`/${route.slug}/waves/${route.wave}/opened`, { method: 'POST', body: {} });
      }
    } else if (route.invite) {
      // An invite token works once and must not linger in the address bar or travel in a share,
      // so the address is replaced by the workshop's home once the token is stored.
      this.arrival = { invite: route.invite };
      await this.store.set('arrival', JSON.stringify(this.arrival));
      history.replaceState(null, '', `/${route.slug}/`);
    } else {
      this.arrival = stored;
    }
    if (saved) {
      // With a stored code the device syncs on every open, before any screen: opened at /panel
      // or /continue as much as at the home, so nothing waits for Back.
      this.code = saved;
      await this.syncOnOpen();
    }
    if (route.page === 'continue') {
      this.screen = 'enter-code';
      return;
    }
    if (route.page === 'panel') {
      // The sync on open has just read GET /me; the panel shows it rather than asking again.
      this.showPanel();
      return;
    }
    await this.land();
  }

  /**
   * Move to a page a participant can open directly, and put its address in the address bar
   * (docs/screen-map.md, Entry): "I have a code" is /<slug>/continue; Back from it, or no page,
   * is the address the device arrived at and where the device lands. The address is replaced,
   * not pushed, so the browser's back goes to wherever the person came from, never to a stale
   * screen.
   */
  async navigate(page?: Page): Promise<void> {
    if (!this.workshop) return;
    history.replaceState(null, '', page ? pageHref(this.workshop.config.slug, page) : this.home);
    this.error = '';
    this.tooShort = false;
    if (page === 'continue') this.screen = 'enter-code';
    else if (page === 'panel') await this.openPanel();
    else await this.land();
  }

  /**
   * Where a device lands after the arrival is known and the sync on open is done: the next card
   * with a code, welcome without, closed outside the workshop's days. The days are judged on the
   * device before any request, so the screen does not depend on the API answering.
   */
  private async land(): Promise<void> {
    if (this.today() !== 'open') this.screen = 'closed';
    else if (this.code) await this.startSession();
    else this.screen = 'welcome';
  }

  /**
   * The sync on open (lib/sync.ts, syncOnOpen): the queued join, then GET /me, then the outbox.
   * Also what a code typed on "I have a code" goes through before its first card.
   */
  private async syncOnOpen(): Promise<void> {
    if (!this.store || !this.workshop) return;
    const { me, sync } = await syncOnOpen(this.store, this.workshop.config.slug, this.code);
    this.me = me;
    this.sync = sync;
  }

  async afterCode(): Promise<void> {
    await this.syncOnOpen();
    await this.land();
  }

  async startSession(): Promise<void> {
    if (!this.store || !this.workshop) return;
    // What this participant has already answered: the device's record and the server's, combined,
    // so a new device (or a wiped one) continues where the others left off.
    const answered = await this.store.answeredCardIds();
    for (const e of this.me?.events ?? []) if (e.kind === 'answered') answered.add(e.cardId);
    this.cards = sessionCards(this.workshop.deck, this.workshop.config, answered);
    this.index = 0;
    this.seq = 0;
    this.sessionId = crypto.randomUUID();
    this.sessionNo = Math.max(await this.store.sessions.count(), this.me?.sessions.length ?? 0) + 1;
    const seed = Array.from(crypto.getRandomValues(new Uint8Array(8)), (b) =>
      b.toString(16).padStart(2, '0'),
    ).join('');
    await this.store.sessions.put({
      id: this.sessionId,
      sessionNo: this.sessionNo,
      startedDay: localDay(),
      deckVersion: this.workshop.deck.version,
      seed,
      synced: 0,
    });
    // The first session opens with the demo card and the dictation hint (architecture plan, 8.1).
    this.hintOpen = this.sessionNo === 1 && this.platform !== null;
    if (!this.cards.length) this.screen = 'session-end';
    else this.screen = this.sessionNo === 1 ? 'demo' : 'card';
  }

  dismissDemo(): void {
    this.screen = 'card';
  }

  /**
   * Consent: generate the code, create the participant, start the first session.
   * A taken code (JOIN_CODE_TAKEN, astronomically unlikely) is retried once, silently, with a
   * fresh code. A join refused for the minute's budget (RATE_LIMITED, a newsletter landing all at
   * once) waits as long as the server's Retry-After says and is retried once; a second refusal
   * is shown. Offline, the join is queued on the device and the session starts anyway; the join
   * goes out before the first sync (lib/sync.ts). The server's other refusals are shown.
   */
  async join(): Promise<void> {
    if (!this.store || !this.workshop || this.joining) return;
    this.joining = true;
    this.error = '';
    try {
      let retriedTaken = false;
      let waited = false;
      for (;;) {
        const fresh = generateCode();
        const body: JoinRequest = this.arrival.invite
          ? { code: fresh, invite: this.arrival.invite }
          : { code: fresh, wave: this.arrival.wave ?? 'wave-1' };
        const res = await api(`/${this.workshop.config.slug}/join`, { body });
        if (!res.ok && res.error === 'JOIN_CODE_TAKEN' && !retriedTaken) {
          retriedTaken = true;
          continue;
        }
        if (!res.ok && res.error === 'RATE_LIMITED' && !waited) {
          waited = true;
          this.retrying = true;
          await this.wait((res.retryAfter ?? DEFAULT_RETRY_AFTER_SECONDS) * 1000);
          this.retrying = false;
          continue;
        }
        if (!res.ok && res.status !== 0) {
          if (res.error === 'WORKSHOP_CLOSED') this.screen = 'closed';
          else this.error = res.error;
          return;
        }
        if (!res.ok) await queueJoin(this.store, body);
        this.code = fresh;
        await this.store.set('code', this.code);
        await this.store.set('consent', localDay());
        await this.startSession();
        return;
      }
    } finally {
      this.joining = false;
      this.retrying = false;
    }
  }

  /** Enter code: the typed digits, checked here, then asked of the server. */
  async continueWithCode(input: string): Promise<void> {
    if (!this.store || !this.workshop) return;
    this.error = '';
    this.tooShort = false;
    const typed = normalizeCode(input);
    if (!codeSchema.safeParse(typed).success) {
      this.tooShort = true;
      return;
    }
    const res = await api(`/${this.workshop.config.slug}/me`, { code: typed });
    if (!res.ok) {
      if (res.error === 'WORKSHOP_CLOSED') this.screen = 'closed';
      else this.error = res.error;
      return;
    }
    this.code = typed;
    await this.store.set('code', this.code);
    await this.afterCode();
  }

  private async record(kind: 'answered' | 'dismissed', body?: string): Promise<void> {
    if (!this.store || !this.workshop || !this.card) return;
    const event = {
      id: crypto.randomUUID(),
      sessionId: this.sessionId,
      cardId: this.card.id,
      seq: this.seq++,
      kind,
      createdDay: localDay(),
      deckVersion: this.workshop.deck.version,
      synced: 0 as const,
      ...(body === undefined ? {} : { body }),
    };
    await this.store.events.put(event);
  }

  /** Seal the draft, write the outbox, move on. Returns whether the answer was taken. */
  async save(answer = this.draft): Promise<boolean> {
    if (!this.workshop || this.saving) return false;
    this.saving = true;
    this.error = '';
    try {
      let sealed: string;
      try {
        sealed = sealAnswer(this.workshop.publicKey, truncateCodePoints(answer, MAX_ANSWER_CHARS));
      } catch {
        // Whatever the sealing failed on (a lone surrogate, a bad key), to a participant it is
        // one thing: nothing was saved. The crypto package's own codes have no wording in copy.md.
        this.error = 'CLIENT_SEAL_FAILED';
        return false;
      }
      await this.record('answered', sealed);
      this.draft = '';
      await this.next();
      return true;
    } finally {
      this.saving = false;
    }
  }

  async setAside(): Promise<void> {
    this.draft = '';
    await this.record('dismissed');
    await this.next();
  }

  private async next(): Promise<void> {
    if (!this.store || !this.workshop) return;
    this.hintOpen = false;
    this.sync = await syncNow(this.store, this.workshop.config.slug, this.code);
    if (this.index + 1 < this.cards.length) this.index += 1;
    else this.screen = 'session-end';
  }

  /** "Your privacy" from any screen: a fresh GET /me, so the rows are what the server holds now. */
  async openPanel(): Promise<void> {
    if (!this.store || !this.workshop) return;
    if (this.code) this.me = await reconcile(this.store, this.workshop.config.slug, this.code);
    this.showPanel();
  }

  private showPanel(): void {
    this.before = this.screen;
    this.cookies = document.cookie.split(';').filter((c) => c.trim()).length;
    const seen = new Set<string>([location.host]);
    // The browser's own record of every resource this page fetched; absent in a test DOM.
    for (const entry of performance.getEntriesByType?.('resource') ?? []) {
      try {
        seen.add(new URL(entry.name).host);
      } catch {
        /* data: URLs and the like */
      }
    }
    this.hosts = [...seen];
    this.screen = 'panel';
  }

  /**
   * Back from the panel: to the screen it was opened from, or, opened directly at /panel, where
   * the device lands. The address bar follows, so a reload shows that screen and not the panel.
   */
  async closePanel(): Promise<void> {
    if (!this.workshop) return;
    const back = this.before === 'loading' || this.before === 'panel' ? undefined : this.before;
    history.replaceState(
      null,
      '',
      back === 'enter-code' ? pageHref(this.workshop.config.slug, 'continue') : this.home,
    );
    if (back) this.screen = back;
    else await this.land();
  }

  async deleteMe(): Promise<void> {
    if (!this.store || !this.workshop) return;
    if (!confirm(this.copy.text('Privacy panel: delete confirm'))) return;
    const res = await api(`/${this.workshop.config.slug}/me`, {
      method: 'DELETE',
      code: this.code,
    });
    if (!res.ok) {
      this.error = res.error;
      return;
    }
    await this.store.wipe();
    location.href = `/${this.workshop.config.slug}/`;
  }

  async copyCode(): Promise<void> {
    await navigator.clipboard.writeText(formatCode(this.code));
  }
}
