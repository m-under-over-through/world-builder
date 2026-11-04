import {
  generateCode,
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
import type { Copy } from './copy.ts';
import { dayStatus } from './days.ts';
import { codeFromValue, valueFromHash } from './identity.ts';
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
  'loading' | 'no-workshop' | 'welcome' | 'card' | 'about' | 'terms' | 'privacy' | 'closed';

/** The two pages of text a participant can open directly (docs/screen-map.md, Always reachable). */
export type TextPage = Extract<Page, 'terms' | 'privacy'>;

/**
 * The sections of the one page about the app (ADR 0013), in order, each with the id of its
 * heading on the page: /trust opens the page at "protected", /panel at "now".
 */
export const ABOUT_SECTIONS = ['protected', 'now', 'delete'] as const;
export type AboutSection = (typeof ABOUT_SECTIONS)[number];

/** Which section of the page an older address opens; the page's own address opens the top. */
export function aboutSectionFor(page: Page): AboutSection | null {
  return page === 'trust' ? 'protected' : page === 'panel' ? 'now' : null;
}

/**
 * What the front card is doing (docs/screen-map.md, Core loop; design/DESIGN.md, States).
 * `fresh` is the stack with the question; `answering` the card opened with the field;
 * `saving` the moment the answer is sealed and written. There is no toast after a save or a set
 * aside (ADR 0019, Marco's morning pass): the card leaving and the next one coming to the
 * front is the feedback, and the about page's diagnostics keep the sync's facts.
 */
export type CardState = 'fresh' | 'answering' | 'saving';

/** The answered card on its way out of the stack, drawn for the length of its exit (ADR 0015). */
export interface ExitingCard {
  card: Card;
  /** Its number in the session, for the tint; never shown (no numbers on the screen, ADR 0019). */
  n: number;
  answer: string;
}

/** One answer in "Your world so far": the tile (ADR 0014, ADR 0015). */
export interface WorldTile {
  key: string;
  cardId: string;
  sessionNo: number;
  /** The card's number in its session, for the tint; never shown (ADR 0019). */
  n: number;
  area?: string;
  question: string;
  /** The words, on the device that wrote them; null on any other device. */
  answer: string | null;
}

/**
 * One card set aside in this round: a tile like an answered one, white with a line instead of
 * a tint, with its area and its question and no answer (ADR 0019).
 */
export interface AsideTile {
  cardId: string;
  area?: string;
  question: string;
}

/** How long the answered card takes to leave the stack. */
export const EXIT_MS = 320;

/** The four tints of the design, by card number: a card keeps its tint everywhere it appears. */
export const TINTS = ['sun', 'mint', 'sky', 'lilac'] as const;
export type Tint = (typeof TINTS)[number];

export function tintOf(n: number): Tint {
  return TINTS[(((n - 1) % 4) + 4) % 4]!;
}

/**
 * A round is done when the engine says it is over and it had cards to give (ADR 0017). One that
 * planned none is never done, so an empty plan cannot start round after round for ever.
 */
function roundDone(live: LiveSession): boolean {
  return live.queueAsPlanned.length > 0 && sessionOver(live);
}

/** The slug of the workshop this device last opened, so the installed app's `/` can find it. */
export const LAST_WORKSHOP = 'wb:lastWorkshop';

/**
 * The store's key for a code made from a link's value that is not yet this device's participant
 * (ADR 0018): kept so a reload in the middle of the intro, once the value has left the address,
 * still joins with it. The value itself is never stored, only the code it makes.
 */
export const LINK_CODE = 'linkCode';

/** The sync is retried while the outbox is not empty: first after this long, then doubling, up to the cap. */
export const RETRY_FIRST_MS = 5_000;
export const RETRY_MAX_MS = 5 * 60_000;

export class AppState {
  screen = $state<Screen>('loading');
  workshop = $state.raw<Workshop | undefined>(undefined);
  copy = $state.raw<Copy>(defaultCopy());
  store: Store | undefined;
  /** True when the browser refused storage: this open runs in memory and nothing is kept after it. */
  storageUnavailable = $state(false);
  /** True when the stored code was refused on open (AUTH_CODE_UNKNOWN) and forgotten: the welcome says so. */
  codeRefused = $state(false);
  /**
   * The code a link's value made, when the server has not met it yet (ADR 0018): a new
   * participant, so the welcome ("This link is yours"), the intro, and a join with this code
   * rather than a fresh one. Empty when the link carried no value, or once the code is the
   * device's participant (`code`).
   */
  linkCode = $state('');
  /** True while the retry loop runs, so only one does. */
  private retryLoop = false;
  /** The server said WORKSHOP_CLOSED: the closed screen, and no session is started. */
  private closedByServer = false;
  code = $state('');
  arrival = $state<Arrival>({});
  /** The error code of the last failure on this screen, shown through its copy.md wording. */
  error = $state('');
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
  /** The last thing done to a card, for a screen reader: the leaving card is drawn as decoration (ADR 0019). */
  announcement = $state<{ n: number; text: string }>({ n: 0, text: '' });
  /**
   * True while the onboarding card is the front of the stack (ADR 0019): on the first open of a
   * first round, once per device (`demoSeen`). The first real card is already `card`, behind
   * it, and is recorded `shown` only once the onboarding card has gone.
   */
  demoFront = $state(false);
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

  /** 1 for the participant's first session: the onboarding card and the hint show only then. */
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
   * and the cards set aside in this round, as white tiles (ADR 0019). No count of the cards
   * still to come: rounds follow one another, so there is no end to count down to.
   */
  get world(): { tiles: WorldTile[]; aside: AsideTile[] } {
    if (!this.workshop) return { tiles: [], aside: [] };
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
    const aside: AsideTile[] = [];
    if (this.live) {
      // From the round's own record of what was set aside, the dismissed cards first and then the
      // deferred ones, each in the order recorded, and never
      // from the queue: a card set aside may leave the queue (the deck engine decides where it
      // comes back), and the list must keep it all the same.
      const { answered, dismissed, deferred } = this.live;
      const ids = new Set([...dismissed, ...deferred]);
      for (const id of ids) {
        const card = cards.get(id);
        if (!card || answered.has(id)) continue;
        aside.push({
          cardId: id,
          ...(card.area === undefined ? {} : { area: card.area }),
          question: card.text,
        });
      }
    }
    return { tiles, aside };
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

  /**
   * The screen for an address: the entry rows of the screen map. `hash` is the part after `#`,
   * which never reaches a server: a link's value is read from it (ADR 0018), and the fragment is
   * taken out of the address at once, so a share or a copy of the address does not carry it on.
   */
  async open(pathname: string, hash: string = location.hash): Promise<void> {
    const value = valueFromHash(hash);
    if (hash || location.href.endsWith('#'))
      history.replaceState(null, '', location.pathname + location.search);
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
    // A link's value makes the code (lib/identity.ts). Kept until the server has met it, so a
    // reload during the intro, with the value gone from the address, still has it.
    const fromValue = value ? await codeFromValue(value) : null;
    if (fromValue && fromValue !== saved) await this.store.set(LINK_CODE, fromValue);
    else if (fromValue) await this.store.unset(LINK_CODE);
    const fromLink = fromValue ?? (await this.store.get(LINK_CODE));
    if (fromLink && fromLink !== saved) {
      // The link wins over a different stored code: someone else's phone opening their own link.
      await this.openWithLink(fromLink, saved);
    } else if (saved) {
      // With a stored code the device syncs on every open, before any screen: opened at /panel
      // as much as at the home, so nothing waits for Back.
      this.code = saved;
      await this.syncOnOpen();
      // The link's own code was refused (its participant was deleted): the link makes the same
      // code again, so this is a new participant, with the welcome and the intro (ADR 0018).
      if (!this.code && fromLink) {
        this.codeRefused = false;
        this.linkCode = fromLink;
        await this.store.set(LINK_CODE, fromLink);
      }
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
   * A code from a link's value that this device does not hold yet (ADR 0018). GET /me with it
   * says who this is. Known: the link was opened before, on this device or another, and the
   * consent was given then; the code becomes this device's participant and the device lands on
   * the cards, no intro. Not known (AUTH_CODE_UNKNOWN), or no answer: a new participant as far as
   * this device can tell, so the welcome and the intro, and the join goes out with this code
   * (`join`); a join that finds the code taken continues as the same participant.
   */
  private async openWithLink(code: string, saved: string | undefined): Promise<void> {
    if (!this.store || !this.workshop) return;
    const res = await api<unknown>(`/${this.workshop.config.slug}/me`, { code });
    if (res.ok) {
      if (await this.adopt(code, saved)) {
        await this.syncOnOpen(res);
      } else {
        // The old participant's outbox could not go out: they stay for this open (`adopt`).
        this.code = saved!;
        await this.syncOnOpen();
      }
      return;
    }
    if (res.error === 'WORKSHOP_CLOSED') this.closedByServer = true;
    if (res.error !== 'AUTH_CODE_UNKNOWN') this.lastError = res.error;
    this.linkCode = code;
  }

  /**
   * The link's code becomes this device's participant. A different code stored before (someone
   * else's phone, or a code this device made on an earlier open without a value) loses to it: its
   * outbox goes out first with its own code, as far as the network allows, then the device's rows
   * are wiped, so one participant's readable answers never show under another's (ADR 0014) and
   * nothing of theirs is synced under the new code. The arrival is kept. Nothing is wiped while
   * the old outbox cannot go out (offline, a refusal): the old participant stays for this open,
   * the link's code waits in the store, and the next open tries again. Returns whether the link's
   * code is now the device's.
   */
  private async adopt(code: string, saved: string | undefined): Promise<boolean> {
    if (!this.store || !this.workshop) return false;
    const slug = this.workshop.config.slug;
    if (saved && saved !== code) {
      const sent = await syncNow(this.store, slug, saved);
      if (sent.lastResult !== 'ok' || sent.outboxSize > 0 || sent.outboxSessions > 0) {
        await this.store.set(LINK_CODE, code);
        return false;
      }
      const arrival = await this.store.get('arrival');
      await this.store.wipe();
      this.store = await this.openStore(slug);
      if (arrival) await this.store.set('arrival', arrival);
    }
    await this.store.set('code', code);
    await this.store.unset(LINK_CODE);
    this.code = code;
    this.linkCode = '';
    return true;
  }

  /**
   * The device's store, or, when the browser refuses it (private browsing with storage blocked,
   * a full disk), one in memory for this open: the cards still run for as long as the tab stays
   * open, and the app warns (docs/screen-map.md, CLIENT_STORAGE_UNAVAILABLE).
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
   * (docs/screen-map.md, Entry); no page is the address the device arrived at and where the
   * device lands. The address is replaced, not pushed, so the browser's back goes to wherever
   * the person came from, never to a stale screen.
   */
  async navigate(page?: Page): Promise<void> {
    if (!this.workshop) return;
    history.replaceState(null, '', page ? pageHref(this.workshop.config.slug, page) : this.home);
    this.error = '';
    if (page === 'terms' || page === 'privacy') this.openPage(page);
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
   * Also what a link's code goes through once the server has said it knows it, with that answer
   * handed in so the server is not asked twice.
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
   * With a code: resume the latest session when the engine says it is not over, else start the
   * next one. Resume is replay (lib/session.ts), never a stored queue: a reload lands on the same
   * card, and a second device with the same code continues where the first left off, since the
   * history is the device's rows and the server's together.
   */
  async enterSession(): Promise<void> {
    if (!this.store || !this.workshop) return;
    const { deck, config } = this.workshop;
    const history = mergeHistory(await this.store.history(), this.me);
    this.history = history;
    this.copies = new Map((await this.store.answers()).map((a) => [a.key, a.text]));
    const latest = latestSession(history);
    const replayed = latest ? replaySession(deck, config, latest, history) : null;
    if (replayed && !roundDone(replayed)) this.live = replayed;
    else await this.startRound(latest?.sessionNo ?? 0);
    await this.showCard();
  }

  /**
   * The next session, as a round (ADR 0017): a new row numbered after `previous`, with a fresh
   * seed, stored for the sync, and replayed into the live session. The engine puts the previous
   * round's deferred cards first on its own (lib/session.ts, planAsStarted). Nothing is shown for
   * it: the participant sees the stack go on.
   */
  private async startRound(previous: number): Promise<void> {
    if (!this.store || !this.workshop) return;
    const { deck, config } = this.workshop;
    const session: Session = {
      id: crypto.randomUUID(),
      sessionNo: previous + 1,
      startedDay: localDay(),
      deckVersion: deck.version,
      seed: Array.from(crypto.getRandomValues(new Uint8Array(8)), (b) =>
        b.toString(16).padStart(2, '0'),
      ).join(''),
    };
    await this.store.putSession({ ...session, synced: 0 });
    this.history = { ...this.history, sessions: [...this.history.sessions, session] };
    this.live = replaySession(deck, config, session, this.history);
  }

  /**
   * Show the card the engine says is next, recording `shown`. When the engine says the round is
   * over, the next round starts at once and its first card is the front (ADR 0017): there is no
   * screen between rounds and no end of the deck, since an answered card comes round again once
   * the unanswered ones of its set have run out. The first round of the first open starts with
   * the onboarding card in front of the stack, once (ADR 0019), and the hint for this platform on
   * its first card (architecture plan, 8.1).
   */
  private async showCard(): Promise<void> {
    if (!this.store || !this.workshop || !this.live) return;
    this.error = '';
    this.cardState = 'fresh';
    if (roundDone(this.live)) await this.startRound(this.live.session.sessionNo);
    // Still over: the round planned nothing (a workshop.json asking for no cards, or a deck
    // without them), or a new round was over at once. Either way the stack is empty and no
    // further round is started (`roundDone` needs a plan), so one open starts at most one round.
    if (sessionOver(this.live)) {
      this.card = undefined;
      this.cardNo = 0;
      this.screen = 'card';
      return;
    }
    const id = currentCardId(this.live);
    this.card = this.workshop.deck.cards.find((c) => c.id === id);
    this.cardNo = id === undefined ? 0 : cardNumber(this.live.queueAsPlanned, id);
    this.draft = (id === undefined ? undefined : this.drafts.get(id)) ?? '';
    this.hintOpen = this.sessionNo === 1 && this.live.untouched && this.platform !== null;
    // The onboarding card: in front of the first card before anything was done in the first
    // session, once per device (ADR 0019). A second device continuing a first session already
    // under way skips it. The card behind it is not shown yet, so nothing is recorded.
    this.demoFront =
      this.sessionNo === 1 && this.live.untouched && !(await this.store.get('demoSeen'));
    // Once per card per session: a resumed session or a card coming round again is not a new showing.
    if (this.card && !this.demoFront && !this.live.shown.has(this.card.id)) {
      await this.record('shown');
      this.live = withShown(this.live, this.card.id);
    }
    this.screen = 'card';
  }

  /**
   * "Got it" on the onboarding card, a swipe, or Set aside: seen once per device; it leaves the
   * stack and the first card, already behind it, comes to the front and is recorded `shown`.
   */
  async dismissDemo(): Promise<void> {
    if (!this.demoFront) return;
    await this.store?.set('demoSeen', localDay());
    await this.showCard();
  }

  /**
   * "I understand" on the welcome, the consent (ADR 0019): create the participant, start the
   * first session. The code is the link's when the
   * link carried a value (ADR 0018), else a fresh one the device makes. For the link's code a
   * taken code (JOIN_CODE_TAKEN) means "this is me": the same participant on another device, so
   * the code is kept and the device continues where that participant is. For a device-made code
   * it is astronomically unlikely, and retried once, silently, with a fresh code. A join refused for the minute's budget (RATE_LIMITED, a newsletter landing all at
   * once) waits as long as the server's Retry-After says and is retried once; a second refusal
   * is shown. Offline, the join is queued on the device and the session starts anyway; the join
   * goes out before the first sync (lib/sync.ts). The server's other refusals are shown.
   */
  async join(): Promise<void> {
    if (!this.store || !this.workshop || this.joining) return;
    this.joining = true;
    this.error = '';
    try {
      const fromLink = this.linkCode;
      let retriedTaken = false;
      let waited = false;
      for (;;) {
        const fresh = fromLink || generateCode();
        const body: JoinRequest = this.arrival.invite
          ? { code: fresh, invite: this.arrival.invite }
          : { code: fresh, wave: this.arrival.wave ?? 'wave-1' };
        const res = await api(`/${this.workshop.config.slug}/join`, { body });
        if (!res.ok && res.error === 'JOIN_CODE_TAKEN' && fromLink) {
          const saved = await this.store.get('code');
          if (await this.adopt(fromLink, saved)) {
            await this.store.set('consent', localDay());
            await this.syncOnOpen();
          } else {
            this.code = saved!;
          }
          await this.land();
          return;
        }
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
        // The code is stored before the queued join, since taking over from a different stored
        // code wipes the device's rows (`adopt`). When that cannot happen yet, the old participant
        // stays for this open and no join is queued under the link's code.
        if (fromLink) {
          const saved = await this.store.get('code');
          if (!(await this.adopt(fromLink, saved))) {
            this.code = saved!;
            await this.land();
            return;
          }
        } else {
          this.code = fresh;
          await this.store.set('code', this.code);
        }
        if (!res.ok) await queueJoin(this.store, body);
        await this.store.set('consent', localDay());
        await this.enterSession();
        return;
      }
    } finally {
      this.joining = false;
      this.retrying = false;
    }
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
    if (!this.card || this.demoFront || this.cardState !== 'fresh') return;
    this.cardState = 'answering';
  }

  /** × on the open card: back to the stack. The draft stays, so opening the card again finds it. */
  closeCard(): void {
    if (this.cardState !== 'answering') return;
    this.cardState = 'fresh';
  }

  /** Said once, to a screen reader only, each time a card is saved or set aside; `n` makes the same words say again. */
  private announce(key: 'saved' | 'set aside' | 'set aside for later'): void {
    this.announcement = { n: this.announcement.n + 1, text: this.copy.item('Announcements', key) };
  }

  /** The answered card leaves the stack: drawn on its way out for EXIT_MS, then gone. */
  private leave(exiting: ExitingCard): void {
    const token = ++this.exitToken;
    this.exiting = exiting;
    this.announce('saved');
    void this.wait(EXIT_MS).then(() => {
      if (this.exitToken === token) this.exiting = null;
    });
  }

  /**
   * Save: seal the draft and write the outbox (`saving`); keep the readable copy next to it,
   * for this participant on this device (ADR 0014); let the answered card leave while the next
   * one is already the front, which is all the feedback there is (no toast, ADR 0019); and sync
   * in the background. Returns whether the answer was taken; the promise settles once the sync
   * has answered, which nothing waits for on the screen.
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
    this.leave({ card, n, answer: text });
    await this.showCard();
    await this.requestSync();
    return true;
  }

  /**
   * "Set aside", by button or swipe: the engine moves the card to the end of the queue the first
   * time (`dismissed`) and out of it the second (`deferred`); the event is recorded; the sync
   * runs in the background; the next card comes at once, with no toast (ADR 0019). A half-written
   * answer waits in memory for the card to come round. With the onboarding card in front, the
   * button and the swipe send it away instead, as "Got it" does: nothing is recorded.
   */
  async setAside(): Promise<void> {
    if (this.demoFront) return this.dismissDemo();
    if (!this.live || !this.card || this.cardState === 'saving') return;
    const card = this.card;
    const { live, event } = withDismissal(this.live, card.id);
    if (!event) return;
    if (this.draft.trim()) this.drafts.set(card.id, this.draft);
    else this.drafts.delete(card.id);
    await this.record(event);
    this.announce(event === 'deferred' ? 'set aside for later' : 'set aside');
    this.live = live;
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
    history.replaceState(null, '', this.home);
    if (to) this.screen = to;
    else await this.land();
  }

  /** "Delete everything and start over": the question first; nothing is sent until "yes". */
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
}
