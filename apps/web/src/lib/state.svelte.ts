import {
  formatCode,
  generateCode,
  normalizeCode,
  codeSchema,
  MAX_ANSWER_CHARS,
  type Card,
  type EventKind,
  type JoinRequest,
  type MeResponse,
  type Session,
} from '@wb/contracts';
import { sealAnswer } from '@wb/crypto';
import { api, DEFAULT_RETRY_AFTER_SECONDS, type ApiResult } from './api.ts';
import type { Copy, ListKey } from './copy.ts';
import { dayStatus } from './days.ts';
import {
  INSTALL_DISMISSALS,
  installDue,
  readDismissals,
  runsInstalled,
  type InstallOffer,
} from './install.ts';
import { detectPlatform, type Platform } from './platform.ts';
import {
  countsAsOpen,
  pageHref,
  parseArrival,
  parseRoute,
  type Arrival,
  type Page,
} from './route.ts';
import {
  currentCardId,
  latestSession,
  mergeHistory,
  position,
  replaySession,
  sessionOver,
  withAnswer,
  withDismissal,
  withShown,
  type LiveSession,
} from './session.ts';
import { localDay, WorkshopStore } from './store.ts';
import { queueJoin, reconcile, syncNow, syncOnOpen, type SyncStatus } from './sync.ts';
import { truncateCodePoints } from './text.ts';
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

/**
 * The states of a card (docs/screen-map.md, Core loop). `fresh` is the question with the field;
 * the others are the line under the card after Save, each with its words in "Card states".
 */
export type CardState = 'fresh' | ListKey<'Card states'>;

/** How long "Synced." (or "Saved on this device.") stays on the card before the next one comes. */
export const SETTLE_MS = 900;

/** The steps of the session end: the code (session 1), the install prompt, then "come back". */
export type EndStep = 'code' | 'install' | 'done';

/** The slug of the workshop this device last opened, so the installed app's `/` can find it. */
export const LAST_WORKSHOP = 'wb:lastWorkshop';

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
  /**
   * The session being played, rebuilt from its seed and its events (lib/session.ts) and replaced
   * whole on every change. Null before a session starts.
   */
  live = $state.raw<LiveSession | null>(null);
  /** The card on the screen. It stays while its answer is saved and synced; then the next one comes. */
  card = $state.raw<Card | undefined>(undefined);
  cardState = $state<CardState>('fresh');
  joining = $state(false);
  hintOpen = $state(false);
  sync = $state<SyncStatus>({ lastResult: 'never', outboxSize: 0 });
  /** The sync in flight, so two never run at once (one after a save, one after a set-aside). */
  private syncing: Promise<SyncStatus> | null = null;
  /** Where the session end stands: the code first on session 1, then the install prompt, then "come back". */
  endStep = $state<EndStep>('done');
  /** The browser's own install offer, kept from `beforeinstallprompt` until the prompt uses it. */
  installOffer = $state.raw<InstallOffer | null>(null);
  /** Leaves this page for another address; a test replaces it. */
  go: (href: string) => void = (href) => location.replace(href);

  // the panel
  me = $state.raw<MeResponse | null>(null);
  hosts = $state<string[]>([]);
  cookies = $state(0);
  /** The screen the panel was opened from, to go back to. */
  private before: Screen = 'loading';

  /** 1 for the participant's first session: the demo card and the hint show only then. */
  get sessionNo(): number {
    return this.live?.session.sessionNo ?? 0;
  }

  /** "Card n of total", as the queue stands now. */
  get position(): { n: number; total: number } {
    return this.live ? position(this.live) : { n: 0, total: 0 };
  }

  get saving(): boolean {
    return this.cardState === 'saving';
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
      // The installed app starts at `/` (apps/web/pwa.ts); it goes on to the workshop this device
      // last opened. With none remembered, this is not a workshop.
      const last = !route ? this.lastWorkshop() : null;
      if (last && findWorkshop(last)) {
        this.go(pageHref(last));
        return;
      }
      this.screen = 'no-workshop';
      return;
    }
    this.copy = this.workshop.copy;
    this.rememberWorkshop(route.slug);
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

  private lastWorkshop(): string | null {
    try {
      return localStorage.getItem(LAST_WORKSHOP);
    } catch {
      return null;
    }
  }

  private rememberWorkshop(slug: string): void {
    try {
      localStorage.setItem(LAST_WORKSHOP, slug);
    } catch {
      /* storage refused: the installed app's `/` will say "not a workshop" */
    }
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
    else if (this.code) await this.enterSession();
    else this.screen = 'welcome';
  }

  /**
   * The sync on open (lib/sync.ts, syncOnOpen): the queued join, then GET /me, then the outbox.
   * Also what a code typed on "I have a code" goes through before its first card, with the
   * answer that checked the code handed in so the server is not asked twice.
   */
  private async syncOnOpen(answer?: ApiResult<unknown>): Promise<void> {
    if (!this.store || !this.workshop) return;
    const { me, sync } = await syncOnOpen(this.store, this.workshop.config.slug, this.code, answer);
    this.me = me;
    this.sync = sync;
  }

  /**
   * With a code: resume the latest session when the engine says it is not over, else start a new
   * one. Resume is replay (lib/session.ts), never a stored queue: a reload lands on the same card,
   * and a second device with the same code continues where the first left off, since the history
   * is the device's rows and the server's together.
   */
  async enterSession(): Promise<void> {
    if (!this.store || !this.workshop) return;
    const { deck, config } = this.workshop;
    const history = mergeHistory(await this.store.history(), this.me);
    const latest = latestSession(history);
    if (latest) {
      const replayed = replaySession(deck, config, latest, history);
      if (!sessionOver(replayed)) {
        this.live = replayed;
        await this.showCard();
        return;
      }
    }
    const session: Session = {
      id: crypto.randomUUID(),
      sessionNo: (latest?.sessionNo ?? 0) + 1,
      startedDay: localDay(),
      deckVersion: deck.version,
      seed: Array.from(crypto.getRandomValues(new Uint8Array(8)), (b) =>
        b.toString(16).padStart(2, '0'),
      ).join(''),
    };
    await this.store.sessions.put({ ...session, synced: 0 });
    this.live = replaySession(deck, config, session, history);
    await this.showCard();
  }

  /**
   * Show the card the engine says is next, recording `shown`; or the session end when it says
   * the session is over. The first session opens with the demo card, once, and the hint for this
   * platform on its first card (architecture plan, 8.1).
   */
  private async showCard(): Promise<void> {
    if (!this.store || !this.workshop || !this.live) return;
    this.draft = '';
    this.error = '';
    this.cardState = 'fresh';
    if (sessionOver(this.live)) {
      this.card = undefined;
      await this.endSession();
      return;
    }
    // The demo card: before anything was done in the first session, once per device. A second
    // device continuing a first session already under way skips it.
    if (this.sessionNo === 1 && this.live.untouched && !(await this.store.get('demoSeen'))) {
      this.screen = 'demo';
      return;
    }
    const id = currentCardId(this.live);
    this.card = this.workshop.deck.cards.find((c) => c.id === id);
    this.hintOpen = this.sessionNo === 1 && this.live.untouched && this.platform !== null;
    await this.record('shown');
    this.live = withShown(this.live);
    this.screen = 'card';
  }

  /**
   * The session end (docs/screen-map.md; architecture plan 8.1): on session 1 the code first,
   * so someone who installs after seeing it can type it into the installed app; then the install
   * prompt, while it is due; then "come back another day". Later sessions go straight there.
   */
  private async endSession(): Promise<void> {
    this.endStep = this.sessionNo === 1 ? 'code' : (await this.installIsDue()) ? 'install' : 'done';
    this.screen = 'session-end';
  }

  /** The install prompt is due until dismissed twice, and never in an app that is installed. */
  private async installIsDue(): Promise<boolean> {
    if (!this.store) return false;
    return installDue({
      platform: this.platform,
      dismissals: readDismissals(await this.store.get(INSTALL_DISMISSALS)),
      installed: runsInstalled(),
    });
  }

  /** "Next" under the code: the install prompt if it is due, else "come back". */
  async nextFromCode(): Promise<void> {
    this.endStep = (await this.installIsDue()) ? 'install' : 'done';
  }

  /** "Not now" on the install prompt: counted, and after the second one never asked again. */
  async dismissInstall(): Promise<void> {
    if (this.store) {
      const n = readDismissals(await this.store.get(INSTALL_DISMISSALS)) + 1;
      await this.store.set(INSTALL_DISMISSALS, String(n));
    }
    this.endStep = 'done';
  }

  /** "Install", where the browser made the offer: its own dialog, then "come back" either way. */
  async install(): Promise<void> {
    const offer = this.installOffer;
    this.installOffer = null;
    if (offer) {
      try {
        await offer.prompt();
        await offer.userChoice;
      } catch {
        /* the browser withdrew the offer; the steps stay on the screen next time */
      }
    }
    this.endStep = 'done';
  }

  /** "Got it" on the demo card, or a swipe: seen once per device, then the first card. */
  async dismissDemo(): Promise<void> {
    await this.store?.set('demoSeen', localDay());
    await this.showCard();
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
        await this.enterSession();
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
    const res = await api<unknown>(`/${this.workshop.config.slug}/me`, { code: typed });
    if (!res.ok) {
      if (res.error === 'WORKSHOP_CLOSED') this.screen = 'closed';
      else this.error = res.error;
      return;
    }
    this.code = typed;
    await this.store.set('code', this.code);
    await this.syncOnOpen(res);
    await this.land();
  }

  /** One event, as the contract spells it, with this session's next seq; the engine names the kind. */
  private async record(kind: EventKind, body?: string): Promise<void> {
    if (!this.store || !this.workshop || !this.live || !this.card) return;
    await this.store.events.put({
      id: crypto.randomUUID(),
      sessionId: this.live.session.id,
      cardId: this.card.id,
      seq: this.live.nextSeq,
      kind,
      createdDay: localDay(),
      deckVersion: this.workshop.deck.version,
      synced: 0,
      ...(body === undefined ? {} : { body }),
    });
  }

  /**
   * Save: seal the draft, write the outbox (`saving`), say so (`saved`), sync and say how that
   * went (`synced`, or offline, or a problem), then, after a beat, the next card. The card stays
   * on the screen through all of it, so the line always speaks of the answer it is under.
   * Returns whether the answer was taken.
   */
  async save(answer = this.draft): Promise<boolean> {
    if (!this.workshop || !this.live || !this.card || this.cardState !== 'fresh') return false;
    this.error = '';
    let sealed: string;
    try {
      sealed = sealAnswer(this.workshop.publicKey, truncateCodePoints(answer, MAX_ANSWER_CHARS));
    } catch {
      // Whatever the sealing failed on (a lone surrogate, a bad key), to a participant it is
      // one thing: nothing was saved. The crypto package's own codes have no wording in copy.md.
      this.error = 'CLIENT_SEAL_FAILED';
      return false;
    }
    this.cardState = 'saving';
    await this.record('answered', sealed);
    this.live = withAnswer(this.live, this.card.id);
    this.draft = '';
    this.cardState = 'saved';
    const status = await this.requestSync();
    this.cardState =
      status.lastResult === 'ok'
        ? 'synced'
        : status.lastResult === 'offline'
          ? 'offline'
          : 'sync problem';
    await this.wait(SETTLE_MS);
    await this.showCard();
    return true;
  }

  /**
   * "Set aside", by button or swipe: the engine moves the card to the end of the queue the first
   * time (`dismissed`) and out of it the second (`deferred`); the event is recorded, the sync
   * runs in the background, and the next card comes at once.
   */
  async setAside(): Promise<void> {
    if (!this.live || !this.card || this.cardState !== 'fresh') return;
    const { live, event } = withDismissal(this.live, this.card.id);
    if (!event) return;
    await this.record(event);
    this.live = live;
    void this.requestSync();
    await this.showCard();
  }

  /** One sync at a time: a request while one runs waits for it, then runs. Safe to repeat. */
  private requestSync(): Promise<SyncStatus> {
    const run = async () => {
      if (!this.store || !this.workshop) return this.sync;
      this.sync = await syncNow(this.store, this.workshop.config.slug, this.code);
      return this.sync;
    };
    const next = (this.syncing ?? Promise.resolve()).then(run, run);
    this.syncing = next;
    void next.finally(() => {
      if (this.syncing === next) this.syncing = null;
    });
    return next;
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
