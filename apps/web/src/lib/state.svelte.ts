import {
  formatCode,
  generateCode,
  normalizeCode,
  codeSchema,
  MAX_ANSWER_CHARS,
  type Card,
  type Event,
  type EventKind,
  type JoinRequest,
  type MeResponse,
  type Session,
} from '@wb/contracts';
import { sealAnswer } from '@wb/crypto';
import { api, DEFAULT_RETRY_AFTER_SECONDS, type ApiResult } from './api.ts';
import type { Copy, ListKey } from './copy.ts';
import { dayStatus } from './days.ts';
import { installDue, runsInstalled, type InstallOffer } from './install.ts';
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
  cardNumber,
  currentCardId,
  latestSession,
  mergeHistory,
  planAsStarted,
  position,
  replaySession,
  sessionOver,
  withAnswer,
  withDismissal,
  withShown,
  type History,
  type LiveSession,
} from './session.ts';
import { answerKey, localDay, MemoryStore, WorkshopStore, type Store } from './store.ts';
import {
  LAST_SYNC_DAY,
  pendingJoin,
  queueJoin,
  reconcile,
  syncNow,
  syncOnOpen,
  type SyncStatus,
} from './sync.ts';
import { truncateCodePoints } from './text.ts';
import { defaultCopy, findWorkshop, VERSION, type Workshop } from './workshops.ts';

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
  | 'about'
  | 'terms'
  | 'privacy'
  | 'closed';

/** The two pages of text a participant can open directly (docs/screen-map.md, Always reachable). */
export type TextPage = Extract<Page, 'terms' | 'privacy'>;

/**
 * The sections of the one page about the app (ADR 0013), in order, each with the id of its
 * heading on the page: /trust opens the page at "protected", /panel at "now".
 */
export const ABOUT_SECTIONS = ['protected', 'code', 'now', 'delete'] as const;
export type AboutSection = (typeof ABOUT_SECTIONS)[number];

/** Which section of the page an older address opens; the page's own address opens the top. */
export function aboutSectionFor(page: Page): AboutSection | null {
  return page === 'trust' ? 'protected' : page === 'panel' ? 'now' : null;
}

/**
 * What the front card is doing (docs/screen-map.md, Core loop; design/DESIGN.md, States).
 * `fresh` is the stack with the question; `answering` the card opened with the field;
 * `saving` the moment the answer is sealed and written. The screen map's other rows (`saved`,
 * `synced`, `dismissed`, `deferred`) are the toast under the top bar, `toast`, while the card
 * that was answered or set aside leaves and the next one is already the front.
 */
export type CardState = 'fresh' | 'answering' | 'saving';

/** The words of the toast, from "Card states"; `saving` is the Save button's label, not a toast. */
export type Toast = Exclude<ListKey<'Card states'>, 'saving'>;

/** The answered card on its way out of the stack, drawn for the length of its exit (ADR 0015). */
export interface ExitingCard {
  card: Card;
  /** Its number in the session, for the label and the tint. */
  n: number;
  answer: string;
}

/** One answer in "Your world so far": the tile (ADR 0014, ADR 0015). */
export interface WorldTile {
  key: string;
  cardId: string;
  sessionNo: number;
  /** The card's number in its session, for the label and the tint. */
  n: number;
  area?: string;
  question: string;
  /** The words, on the device that wrote them; null on any other device. */
  answer: string | null;
}

/** One card set aside in this session: the chip. */
export interface WorldChip {
  cardId: string;
  n: number;
  area?: string;
  question: string;
}

/** A segment of the laptop's progress strip: one per card of the session as planned. */
export interface ProgressSegment {
  n: number;
  state: 'answered' | 'aside' | 'empty';
}

/** How long a toast stays up. */
export const TOAST_MS = 1600;
/** How long the answered card takes to leave the stack. */
export const EXIT_MS = 320;

/** The four tints of the design, by card number: a card keeps its tint everywhere it appears. */
export const TINTS = ['sun', 'mint', 'sky', 'lilac'] as const;
export type Tint = (typeof TINTS)[number];

export function tintOf(n: number): Tint {
  return TINTS[(((n - 1) % 4) + 4) % 4]!;
}

/** The slug of the workshop this device last opened, so the installed app's `/` can find it. */
export const LAST_WORKSHOP = 'wb:lastWorkshop';

/** The sync is retried while the outbox is not empty: first after this long, then doubling, up to the cap. */
export const RETRY_FIRST_MS = 5_000;
export const RETRY_MAX_MS = 5 * 60_000;

export class AppState {
  screen = $state<Screen>('loading');
  workshop = $state.raw<Workshop | undefined>(undefined);
  copy = $state.raw<Copy>(defaultCopy());
  store: Store | undefined;
  /** True when the browser refused storage: this open runs in memory and the code must be written down. */
  storageUnavailable = $state(false);
  /** True when the stored code was refused on open (AUTH_CODE_UNKNOWN) and forgotten: the welcome says so. */
  codeRefused = $state(false);
  /** True while the retry loop runs, so only one does. */
  private retryLoop = false;
  /** The server said WORKSHOP_CLOSED: the closed screen, and no session is started. */
  private closedByServer = false;
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
   * opening "About this app" and coming back finds it where it was (review of item 4). Closing
   * the card with × keeps it too; `drafts` holds the half-written answers of cards set aside,
   * in memory only, so a card coming round again shows what was started (design/DESIGN.md).
   */
  draft = $state('');
  private drafts = new Map<string, string>();
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
  /** The card's number in this session, its place in the queue as planned (lib/session.ts, cardNumber). */
  cardNo = $state(0);
  cardState = $state<CardState>('fresh');
  /** The words of the toast under the top bar, or nothing. */
  toast = $state<Toast | ''>('');
  private toastToken = 0;
  /** The answered card leaving the stack, for the length of its exit; null when none is. */
  exiting = $state.raw<ExitingCard | null>(null);
  private exitToken = 0;
  /**
   * Everything this participant did, on this device and on the server, as one history
   * (lib/session.ts): the sessions and the events. "Your world so far" is read from it.
   */
  history = $state.raw<History>({ sessions: [], events: [] });
  /** The readable copies of the answers written on this device, by `answerKey` (ADR 0014). */
  copies = $state.raw<ReadonlyMap<string, string>>(new Map());
  /** True on a screen 600 pixels or wider: the world is a column beside the stack, not a sheet. */
  wide = $state(false);
  /** The sheet "Your world so far" is open (phone). */
  worldOpen = $state(false);
  joining = $state(false);
  hintOpen = $state(false);
  sync = $state<SyncStatus>({ lastResult: 'never', outboxSize: 0, outboxSessions: 0 });
  /** The last error code of any kind, server or client, for the panel's diagnostics. */
  lastError = $state('');
  /** The day of the last sync the server accepted, for the panel; empty when there was none. */
  lastSyncDay = $state('');
  /** The two-step delete: the question is on the screen, with "yes" and "keep". */
  confirmingDelete = $state(false);
  /** The sync in flight, so two never run at once (one after a save, one after a set-aside). */
  private syncing: Promise<SyncStatus> | null = null;
  /** True while the session end shows the install offer: the first session, where it is due (lib/install.ts). */
  installOffered = $state(false);
  /** The browser's own install offer, kept from `beforeinstallprompt` until the prompt uses it. */
  installOffer = $state.raw<InstallOffer | null>(null);
  /** Leaves this page for another address; a test replaces it. */
  go: (href: string) => void = (href) => location.replace(href);

  // the page about the app
  me = $state.raw<MeResponse | null>(null);
  hosts = $state<string[]>([]);
  cookies = $state(0);
  /** The section the page scrolls to when it opens from /trust or /panel; null is the top. */
  aboutSection = $state<AboutSection | null>(null);
  /**
   * The screens behind the one showing, for Back: the screen the page about the app was opened
   * from, then the page itself when the terms or the policy are opened from it. Empty when a
   * page was opened directly by its address: Back then lands where the device lands.
   */
  private trail: Screen[] = [];

  /** Show an error on this screen, and remember it for the panel's diagnostics. */
  private fail(code: string): void {
    this.error = code;
    this.lastError = code;
  }

  /**
   * A sync status as it comes back: kept, its error, if any, remembered for the diagnostics, a
   * closed workshop shown, and a retry scheduled while anything waits.
   */
  private note(status: SyncStatus): SyncStatus {
    this.sync = status;
    if (status.lastError) this.lastError = status.lastError;
    if (status.lastError === 'WORKSHOP_CLOSED') {
      this.closedByServer = true;
      this.screen = 'closed';
    }
    if (status.lastResult !== 'ok' && status.outboxSize + status.outboxSessions > 0)
      void this.retryWhileWaiting();
    return status;
  }

  /**
   * The outbox is tried again on a timer, 5 seconds then doubling up to 5 minutes, until it is
   * empty or the workshop is closed; and at once when the browser says the network is back
   * (`online`, from App.svelte). One loop at a time.
   */
  private async retryWhileWaiting(): Promise<void> {
    if (this.retryLoop) return;
    this.retryLoop = true;
    try {
      let delay = RETRY_FIRST_MS;
      while (this.code && this.screen !== 'closed' && this.store) {
        await this.wait(delay);
        const status = await this.requestSync();
        if (status.lastResult === 'ok' || status.outboxSize + status.outboxSessions === 0) return;
        delay = Math.min(delay * 2, RETRY_MAX_MS);
      }
    } finally {
      this.retryLoop = false;
    }
  }

  /** The browser's `online` event: try the outbox now rather than at the timer's next tick. */
  async reconnected(): Promise<void> {
    if (!this.code || !this.store) return;
    const { sessions, events } = await this.store.pending();
    if (sessions.length + events.length > 0 || (await pendingJoin(this.store)))
      await this.requestSync();
  }

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

  /** How many cards this session has, as planned: the M of "n of M". */
  get queueLength(): number {
    return this.live?.queueAsPlanned.length ?? 0;
  }

  /** Cards answered in this session, for "n of M answered". */
  get answeredCount(): number {
    return this.live?.answered.size ?? 0;
  }

  /** The next two cards of the queue behind the front one, with their numbers: the backs of the stack. */
  get backCards(): { card: Card; n: number }[] {
    if (!this.live || !this.workshop || !this.card) return [];
    const front = this.card.id;
    const open = this.live.plan.queue.filter(
      (id) => id !== front && !this.live!.answered.has(id) && !this.live!.deferred.has(id),
    );
    const index = this.live.plan.queue.indexOf(front);
    // Only cards behind the front one in the queue, never one that was set aside and stands
    // ahead of it in the file.
    const behind = open.filter((id) => this.live!.plan.queue.indexOf(id) > index);
    return behind
      .slice(0, 2)
      .map((id) => ({
        card: this.workshop!.deck.cards.find((c) => c.id === id)!,
        n: cardNumber(this.live!.queueAsPlanned, id),
      }))
      .filter((b) => b.card !== undefined);
  }

  /**
   * "Your world so far" (ADR 0014, ADR 0015): one tile per answer in the history, session by
   * session and in card order within a session, with the words where this device wrote them;
   * the cards set aside in this session as chips; and how many cards this session still has.
   */
  get world(): { tiles: WorldTile[]; chips: WorldChip[]; left: number } {
    if (!this.workshop) return { tiles: [], chips: [], left: 0 };
    const { deck, config } = this.workshop;
    const cards = new Map(deck.cards.map((c) => [c.id, c]));
    const tiles: WorldTile[] = [];
    const sessions = [...this.history.sessions].sort((a, b) => a.sessionNo - b.sessionNo);
    for (const session of sessions) {
      const queue =
        this.live?.session.id === session.id
          ? this.live.queueAsPlanned
          : planAsStarted(deck, config, session, this.history).queue;
      const answered = this.history.events
        .filter((e) => e.kind === 'answered' && e.sessionId === session.id && cards.has(e.cardId))
        .map((e) => ({ cardId: e.cardId, n: cardNumber(queue, e.cardId) }))
        .sort((a, b) => a.n - b.n);
      for (const { cardId, n } of answered) {
        const card = cards.get(cardId)!;
        const key = answerKey(session.id, cardId);
        tiles.push({
          key,
          cardId,
          sessionNo: session.sessionNo,
          n,
          ...(card.area === undefined ? {} : { area: card.area }),
          question: card.text,
          answer: this.copies.get(key) ?? null,
        });
      }
    }
    const chips: WorldChip[] = [];
    let left = 0;
    if (this.live) {
      const { answered, dismissed, deferred, plan, queueAsPlanned } = this.live;
      const aside = [
        ...plan.queue.filter((id) => dismissed.has(id)),
        ...[...deferred].filter((id) => !dismissed.has(id)),
      ];
      for (const id of aside) {
        const card = cards.get(id);
        if (!card || answered.has(id)) continue;
        chips.push({
          cardId: id,
          n: cardNumber(queueAsPlanned, id),
          ...(card.area === undefined ? {} : { area: card.area }),
          question: card.text,
        });
      }
      left = plan.queue.filter((id) => !answered.has(id) && !deferred.has(id)).length;
    }
    return { tiles, chips, left };
  }

  /** The laptop's progress strip: one segment per card of the session as planned, in that order. */
  get progress(): ProgressSegment[] {
    if (!this.live) return [];
    const { answered, dismissed, deferred, queueAsPlanned } = this.live;
    return queueAsPlanned.map((id, i) => ({
      n: i + 1,
      state: answered.has(id)
        ? 'answered'
        : dismissed.has(id) || deferred.has(id)
          ? 'aside'
          : 'empty',
    }));
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
    this.store = await this.openStore(route.slug);
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
    if (route.page === 'terms' || route.page === 'privacy') {
      this.openPage(route.page);
      return;
    }
    if (route.page) {
      // The sync on open has just read GET /me; the page shows it rather than asking again.
      await this.showAbout(aboutSectionFor(route.page));
      return;
    }
    await this.land();
  }

  /**
   * The device's store, or, when the browser refuses it (private browsing with storage blocked,
   * a full disk), one in memory for this open: the app still runs one session, warns, and shows
   * the code at the end (docs/screen-map.md, CLIENT_STORAGE_UNAVAILABLE).
   */
  private async openStore(slug: string): Promise<Store> {
    try {
      const store = new WorkshopStore(slug);
      await store.get('code');
      return store;
    } catch {
      this.storageUnavailable = true;
      this.lastError = 'CLIENT_STORAGE_UNAVAILABLE';
      return new MemoryStore();
    }
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
    else if (page === 'terms' || page === 'privacy') this.openPage(page);
    else if (page) await this.openAbout(aboutSectionFor(page));
    else await this.land();
  }

  /**
   * The terms or the privacy policy, from the page about the app (or by their address); Back
   * returns to the page when it was open.
   */
  openPage(page: TextPage): void {
    if (!this.workshop) return;
    if (this.screen === 'about') this.trail.push('about');
    history.replaceState(null, '', pageHref(this.workshop.config.slug, page));
    this.screen = page;
  }

  /** Back from a page of text: the same rule as Back from the page about the app. */
  async closePage(): Promise<void> {
    await this.back();
  }

  /**
   * Where a device lands after the arrival is known and the sync on open is done: the next card
   * with a code, welcome without, closed outside the workshop's days. The days are judged on the
   * device before any request, so the screen does not depend on the API answering.
   */
  private async land(): Promise<void> {
    if (this.today() !== 'open' || this.closedByServer) this.screen = 'closed';
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
    const { me, sync, error } = await syncOnOpen(
      this.store,
      this.workshop.config.slug,
      this.code,
      answer,
    );
    this.me = me;
    if (error) this.lastError = error;
    this.note(sync);
    // The stored code is not the server's any more (the participant deleted themselves from
    // another device, or the workshop was reset): forgotten, and the welcome says so. Never while
    // a join is still queued: then the server has simply not met the code yet.
    if (error === 'AUTH_CODE_UNKNOWN' && !(await pendingJoin(this.store))) {
      await this.store.unset('code');
      this.code = '';
      this.me = null;
      this.codeRefused = true;
    }
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
    this.history = history;
    this.copies = new Map((await this.store.answers()).map((a) => [a.key, a.text]));
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
    await this.store.putSession({ ...session, synced: 0 });
    this.history = { ...history, sessions: [...history.sessions, session] };
    this.live = replaySession(deck, config, session, this.history);
    await this.showCard();
  }

  /**
   * Show the card the engine says is next, recording `shown`; or the session end when it says
   * the session is over. The first session opens with the demo card, once, and the hint for this
   * platform on its first card (architecture plan, 8.1).
   */
  private async showCard(): Promise<void> {
    if (!this.store || !this.workshop || !this.live) return;
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
    this.cardNo = id === undefined ? 0 : cardNumber(this.live.queueAsPlanned, id);
    this.draft = (id === undefined ? undefined : this.drafts.get(id)) ?? '';
    this.hintOpen = this.sessionNo === 1 && this.live.untouched && this.platform !== null;
    // Once per card per session: a resumed session or a card coming round again is not a new showing.
    if (this.card && !this.live.shown.has(this.card.id)) {
      await this.record('shown');
      this.live = withShown(this.live, this.card.id);
    }
    this.screen = 'card';
  }

  /**
   * The session end (docs/screen-map.md, Session end; ADR 0013): one screen. On session 1 the
   * code, so someone who installs after seeing it can type it into the installed app, then the
   * install offer where it is due; on every session "the next cards wait for you another day"
   * with the reminder. The offer is shown this once: nothing is stored about it.
   */
  private async endSession(): Promise<void> {
    this.installOffered =
      this.sessionNo === 1 && installDue({ platform: this.platform, installed: runsInstalled() });
    this.screen = 'session-end';
  }

  /** "Install", where the browser made the offer: its own dialog, then the offer is gone either way. */
  async install(): Promise<void> {
    const offer = this.installOffer;
    this.installOffer = null;
    if (offer) {
      try {
        await offer.prompt();
        await offer.userChoice;
      } catch {
        /* the browser withdrew the offer; the steps stay on the screen */
      }
    }
    this.installOffered = false;
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
          else this.fail(res.error);
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
      else this.fail(res.error);
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
    const event: Event = {
      id: crypto.randomUUID(),
      sessionId: this.live.session.id,
      cardId: this.card.id,
      seq: this.live.nextSeq,
      kind,
      createdDay: localDay(),
      deckVersion: this.workshop.deck.version,
      ...(body === undefined ? {} : { body }),
    };
    await this.store.putEvent({ ...event, synced: 0 });
    this.history = { ...this.history, events: [...this.history.events, event] };
  }

  /** Tap, click or Enter on the front card: it opens with the field (`answering`). */
  openCard(): void {
    if (!this.card || this.cardState !== 'fresh') return;
    this.cardState = 'answering';
  }

  /** × on the open card: back to the stack. The draft stays, so opening the card again finds it. */
  closeCard(): void {
    if (this.cardState !== 'answering') return;
    this.cardState = 'fresh';
  }

  /** The toast under the top bar: these words, for TOAST_MS, unless other words replace them first. */
  private flash(words: Toast): void {
    const token = ++this.toastToken;
    this.toast = words;
    void this.wait(TOAST_MS).then(() => {
      if (this.toastToken === token) this.toast = '';
    });
  }

  /** The answered card leaves the stack: drawn on its way out for EXIT_MS, then gone. */
  private leave(exiting: ExitingCard): void {
    const token = ++this.exitToken;
    this.exiting = exiting;
    void this.wait(EXIT_MS).then(() => {
      if (this.exitToken === token) this.exiting = null;
    });
  }

  /**
   * Save: seal the draft and write the outbox (`saving`); keep the readable copy next to it,
   * for this participant on this device (ADR 0014); say so in the toast ("Saved on this
   * device"); let the answered card leave while the next one is already the front; and sync in
   * the background. When the server takes the answer while the toast is still up, the toast
   * says "Synced"; later, it says nothing (design/DESIGN.md, States). Returns whether the
   * answer was taken; the promise settles once the sync has answered, which nothing waits for
   * on the screen.
   */
  async save(answer = this.draft): Promise<boolean> {
    if (!this.workshop || !this.live || !this.card || !this.store || this.cardState === 'saving')
      return false;
    this.error = '';
    const text = truncateCodePoints(answer, MAX_ANSWER_CHARS);
    let sealed: string;
    try {
      sealed = sealAnswer(this.workshop.publicKey, text);
    } catch {
      // Whatever the sealing failed on (a lone surrogate, a bad key), to a participant it is
      // one thing: nothing was saved. The crypto package's own codes have no wording in copy.md.
      this.fail('CLIENT_SEAL_FAILED');
      return false;
    }
    this.cardState = 'saving';
    const card = this.card;
    const session = this.live.session;
    const n = this.cardNo;
    await this.record('answered', sealed);
    // The readable copy goes next to the outbox, never into it: the event above carries the
    // sealed text only, and `putAnswer` writes a table no sync ever reads (lib/store.ts).
    const key = answerKey(session.id, card.id);
    await this.store.putAnswer({ key, sessionId: session.id, cardId: card.id, text });
    this.copies = new Map(this.copies).set(key, text);
    this.live = withAnswer(this.live, card.id);
    this.drafts.delete(card.id);
    this.draft = '';
    this.flash('saved');
    this.leave({ card, n, answer: text });
    await this.showCard();
    const status = await this.requestSync();
    if (this.toast === 'saved')
      this.flash(
        status.lastResult === 'ok'
          ? 'synced'
          : status.lastResult === 'offline'
            ? 'offline'
            : 'sync problem',
      );
    return true;
  }

  /**
   * "Set aside", by button or swipe: the engine moves the card to the end of the queue the first
   * time (`dismissed`) and out of it the second (`deferred`); the event is recorded and the toast
   * says which; the sync runs in the background; the next card comes at once. A half-written
   * answer waits in memory for the card to come round.
   */
  async setAside(): Promise<void> {
    if (!this.live || !this.card || this.cardState === 'saving') return;
    const card = this.card;
    const { live, event } = withDismissal(this.live, card.id);
    if (!event) return;
    if (this.draft.trim()) this.drafts.set(card.id, this.draft);
    else this.drafts.delete(card.id);
    await this.record(event);
    this.live = live;
    this.flash(event);
    void this.requestSync();
    await this.showCard();
  }

  /** The pill "Your world so far" on a phone: the sheet opens; × , the scrim, Esc or a swipe down closes it. */
  openWorld(): void {
    this.worldOpen = true;
  }

  closeWorld(): void {
    this.worldOpen = false;
  }

  /**
   * One sync at a time: a request while one runs waits for it, then runs. Safe to repeat. Nothing
   * is sent without a code: once a refused code has been forgotten, a retry the earlier failure
   * scheduled has nobody to sync for.
   */
  private requestSync(): Promise<SyncStatus> {
    const run = async () => {
      if (!this.store || !this.workshop || !this.code) return this.sync;
      return this.note(await syncNow(this.store, this.workshop.config.slug, this.code));
    };
    const next = (this.syncing ?? Promise.resolve()).then(run, run);
    this.syncing = next;
    void next.finally(() => {
      if (this.syncing === next) this.syncing = null;
    });
    return next;
  }

  /**
   * "About this app" from the foot of any screen: a fresh GET /me, so the rows are what the
   * server holds now; then the page, at a section when an older address asked for one.
   */
  async openAbout(section: AboutSection | null = null): Promise<void> {
    if (!this.store || !this.workshop) return;
    if (this.code) {
      const { me, error } = await reconcile(this.store, this.workshop.config.slug, this.code);
      this.me = me;
      if (error) this.lastError = error;
    }
    await this.showAbout(section);
  }

  private async showAbout(section: AboutSection | null): Promise<void> {
    if (!this.workshop) return;
    const pages: Screen[] = ['loading', 'about', 'terms', 'privacy'];
    this.trail = pages.includes(this.screen) ? [] : [this.screen];
    history.replaceState(null, '', pageHref(this.workshop.config.slug, 'about'));
    this.aboutSection = section;
    this.confirmingDelete = false;
    this.lastSyncDay = (await this.store?.get(LAST_SYNC_DAY)) ?? '';
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
    this.screen = 'about';
  }

  /**
   * Back from the page about the app, the terms or the policy: to the screen behind it (the page
   * about the app when the text was opened from there), or, opened directly by its address,
   * where the device lands. The address bar follows, so a reload shows that screen.
   */
  async back(): Promise<void> {
    if (!this.workshop) return;
    const slug = this.workshop.config.slug;
    const to = this.trail.pop();
    if (to === 'about') {
      history.replaceState(null, '', pageHref(slug, 'about'));
      this.aboutSection = null;
      this.screen = 'about';
      return;
    }
    history.replaceState(null, '', to === 'enter-code' ? pageHref(slug, 'continue') : this.home);
    if (to) this.screen = to;
    else await this.land();
  }

  /** "Delete everything I sent": the question first; nothing is sent until "yes". */
  askDelete(): void {
    this.confirmingDelete = true;
  }

  keepAnswers(): void {
    this.confirmingDelete = false;
  }

  /** The second step: DELETE /me, then the device wiped, then the workshop's home. */
  async deleteMe(): Promise<void> {
    if (!this.store || !this.workshop || !this.confirmingDelete) return;
    const res = await api(`/${this.workshop.config.slug}/me`, {
      method: 'DELETE',
      code: this.code,
    });
    if (!res.ok) {
      this.fail(res.error);
      return;
    }
    await this.store.wipe();
    // The readable copies went with the database (ADR 0014); nothing of them stays in memory either.
    this.copies = new Map();
    this.history = { sessions: [], events: [] };
    this.live = null;
    try {
      localStorage.removeItem(LAST_WORKSHOP);
    } catch {
      /* nothing to remove where storage is refused */
    }
    this.go(pageHref(this.workshop.config.slug));
  }

  /** The source at the commit that is running, for the page about the app. */
  get sourceHref(): string {
    const source = this.copy.item('Trust page variables', 'source');
    return VERSION === 'local' ? source : `${source}/tree/${VERSION}`;
  }

  async copyCode(): Promise<void> {
    await navigator.clipboard.writeText(formatCode(this.code));
  }
}
