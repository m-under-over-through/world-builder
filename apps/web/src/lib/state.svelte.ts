import {
  generateCode,
  isOwnCardId,
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
import { newOwnCardId } from './own-card.ts';
import { detectPlatform, type Platform } from './platform.ts';
import { reducedMotion } from './swipe.ts';
import {
  countsAsOpen,
  pageHref,
  parseArrival,
  parseRoute,
  type Arrival,
  type Page,
} from './route.ts';
import { leaveStartOver, takeStartOver } from './start-over.ts';
import {
  cardNumber,
  currentCardId,
  firstAnswers,
  latestAnswers,
  latestSession,
  mergeHistory,
  planAsStarted,
  position,
  replaySession,
  sessionOver,
  setAsideCards,
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
  refusedForGood,
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
  | 'card'
  | 'about'
  | 'terms'
  | 'privacy'
  | 'closed'
  | 'invitations';

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
 * Where the open card was opened from (ADR 0027): the card in front of the stack, a tile in "Your
 * world so far", or "Write your own story" for a new blank card. That thing is lifted while the
 * card is open, and the focus goes back to it when the card closes without a save.
 */
export type OpenedFrom = 'front' | 'tile' | 'new';

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
  /** True for a blank card (ADR 0022): no question and no area; the tile shows its own label. */
  own?: boolean;
  /** True when the tile opens in the open card: this device holds its words (ADR 0024, ADR 0027). */
  opens: boolean;
}

/**
 * One card set aside in any round and not answered since: a tile like an answered one, white
 * with a line instead of a tint, with its area and its question and no answer (ADR 0019). It
 * always opens in the open card, on any device (ADR 0024, ADR 0027).
 */
export interface AsideTile {
  cardId: string;
  area?: string;
  question: string;
}

/**
 * The open card open for a new blank card, rather than for a card of the deck or a blank card
 * already written (ADR 0022, ADR 0027). Empty, so it can never be a card id.
 */
export const NEW_OWN_CARD = '';

/** How long the open card takes to fade out where it stands, closed or saved (ADR 0025, ADR 0027). */
export const CLOSE_MS = 280;

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
  #screen = $state<Screen>('loading');
  /**
   * The screen showing. Leaving the cards (a sync that finds the workshop closed, the about page)
   * also closes the open card, keeping its words, so it is not found open on the way back (ADR
   * 0022, ADR 0027).
   */
  get screen(): Screen {
    return this.#screen;
  }
  set screen(screen: Screen) {
    this.#screen = screen;
    if (screen !== 'card') this.putAway();
  }
  workshop = $state.raw<Workshop | undefined>(undefined);
  copy = $state.raw<Copy>(defaultCopy());
  store: Store | undefined;
  /** True when the browser refused storage: this open runs in memory and nothing is kept after it. */
  storageUnavailable = $state(false);
  /** True when the stored code was refused on open (AUTH_CODE_UNKNOWN) and forgotten: the welcome says so. */
  codeRefused = $state(false);
  /**
   * The code a link's value made, when the server has not met it yet (ADR 0018): a new
   * participant, so the welcome, and a join with this code rather than a fresh one. Empty when
   * the link carried no value, or once the code is the device's participant (`code`).
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
  /** The wave whose links the invitation page makes (ADR 0021); empty on every other screen. */
  invitationWave = $state('');
  /** The platform whose dictation hint applies, or null when there is none (Linux, unknown). */
  platform = $state<Platform | null>(null);

  /**
   * The answer begun on the card in front. It lives here, not in a component, so opening "About
   * this app" and coming back finds it where it was (review of item 4). Closing the open card
   * keeps it too; `drafts` holds the half-written answers of every other card, in memory only,
   * so a card set aside and coming round again, or a tile opened again, shows what was started
   * (design/DESIGN.md). One draft per card id (ADR 0024).
   */
  draft = $state('');
  private drafts = new Map<string, string>();
  /**
   * The open card (ADR 0027): which card it is open for, its words, and whether they are being
   * saved or the card is fading out. `writing` is null while it is closed, `NEW_OWN_CARD` for a
   * new blank card, else a card id: the card in front, a card set aside, an answer, or a blank
   * card already written. `openDraft` holds the words while it is open; closing puts them back
   * under the card's id (`draft` for the card in front, `drafts` for any other), so they are
   * there the next time. `openedFrom` says what was tapped, which is lifted meanwhile.
   */
  writing = $state<string | null>(null);
  openDraft = $state('');
  openedFrom = $state<OpenedFrom>('front');
  /** True from Save until the open card has gone: the answer is sealed, written and the card fades. */
  saving = $state(false);
  /** True while the open card fades out where it stands, closed or saved. */
  closing = $state(false);
  /**
   * The card id the words being saved are recorded under, from the moment it is known until the
   * open card has gone; null otherwise. It is `writing`, except for a new blank card, whose id is
   * made at the save (`newOwnCardId`). Its tile exists as soon as the answer is recorded, and is
   * lifted until the open card has gone, as the tile of any card saved (World.svelte), so the
   * travelling card can land on it as it shows (ADR 0027; components/TravellingCard.svelte).
   */
  savedAs = $state<string | null>(null);
  /**
   * True while the card in front is on its way out sideways, before "Set aside" is recorded
   * (Stack.svelte). No card opens meanwhile: a card opened then would leave the set-aside undone.
   */
  leaving = $state(false);
  /** Whether the dictation hint opens by itself on the card in front: its first card of the first round. */
  private frontHint = false;
  /** True while a card is open, whichever card. */
  get cardOpen(): boolean {
    return this.writing !== null;
  }
  /**
   * What the open card shows on top: a card of the deck by its area and its question, or nothing
   * for a blank card, new or written, which keeps its own title and hint (ADR 0024).
   */
  get writingCard(): Card | null {
    const id = this.writing;
    if (id === null || id === NEW_OWN_CARD || isOwnCardId(id)) return null;
    return this.workshop?.deck.cards.find((c) => c.id === id) ?? null;
  }
  /**
   * The tint of the open card (ADR 0024): a card of the deck is on a tint there too. An
   * answer has the tint of its tile in "Your world so far". A card set aside has the tint its
   * tile will have once it is answered here: its number in the round in progress. For a card
   * this round plans, that is its tint in the stack of this round; a card set aside earlier
   * that this round does not plan has number 0 (lib/session.ts, cardNumber), here as on its
   * tile. The two are the same reckoning (see `world`), so the card keeps its tint while the
   * answer is saved. None for a blank card: it is in no deck and has no number, and its tile is
   * white.
   */
  get writingTint(): Tint | null {
    const card = this.writingCard;
    if (!card || !this.live) return null;
    const tile = this.world.tiles.find((t) => t.cardId === card.id);
    return tintOf(tile ? tile.n : cardNumber(this.live.queueAsPlanned, card.id));
  }
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
  /** The last thing done to a card, for a screen reader: "saved", "set aside" (ADR 0019). */
  announcement = $state<{ n: number; text: string }>({ n: 0, text: '' });
  /**
   * True while the onboarding card is the front of the stack (ADR 0019): on the first open of a
   * first round, once per device (`demoSeen`). The first real card is already `card`, behind
   * it, and is recorded `shown` only once the onboarding card has gone.
   */
  demoFront = $state(false);
  /**
   * Everything this participant did, on this device and on the server, as one history
   * (lib/session.ts): the sessions and the events. "Your world so far" is read from it.
   */
  history = $state.raw<History>({ sessions: [], events: [] });
  /** The readable copies of the answers written on this device, by `answerKey` (ADR 0014). */
  copies = $state.raw<ReadonlyMap<string, string>>(new Map());
  /** Which `answered` event each copy is the words of, by the same key (ADR 0024; lib/store.ts). */
  copyEvents = $state.raw<ReadonlyMap<string, string>>(new Map());
  /** True on a screen 600 pixels or wider: the world is a column beside the stack, not a sheet. */
  wide = $state(false);
  /** The sheet "Your world so far" is open (phone). */
  worldOpen = $state(false);
  joining = $state(false);
  /** The dictation hint is open on the open card: by itself on the first card, else from "Prefer to talk?". */
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
    if (
      status.lastResult !== 'ok' &&
      status.outboxSize + status.outboxSessions > 0 &&
      !refusedForGood(status)
    )
      void this.retryWhileWaiting();
    return status;
  }

  /**
   * The outbox is tried again on a timer, 5 seconds then doubling up to 5 minutes, until it is
   * empty or the workshop is closed; and at once when the browser says the network is back
   * (`online`, from App.svelte). One loop at a time. A refusal that sending again cannot change
   * (lib/sync.ts, refusedForGood) ends the loop: the outbox waits for the next open, the next
   * saved answer or the network coming back, each of which tries once.
   */
  private async retryWhileWaiting(): Promise<void> {
    if (this.retryLoop) return;
    this.retryLoop = true;
    try {
      let delay = RETRY_FIRST_MS;
      while (this.code && this.screen !== 'closed' && this.store) {
        await this.wait(delay);
        const status = await this.requestSync();
        if (
          status.lastResult === 'ok' ||
          status.outboxSize + status.outboxSessions === 0 ||
          refusedForGood(status)
        )
          return;
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
   * "Your world so far" (ADR 0014, ADR 0015, ADR 0024): one tile per card that has an answer,
   * session by session and in card order within a session, standing where its first answer put
   * it and showing the words of its latest answer (`latestAnswers`) where this device wrote them;
   * then the cards set aside in any round and never answered, oldest first, as white tiles (ADR
   * 0019, ADR 0024). Each tile says whether it opens in the open card: a card set aside
   * always, an answer only where this device holds the words of its latest version. No count of
   * the cards still to come: rounds follow one another, so there is no end to count down to.
   */
  get world(): { tiles: WorldTile[]; aside: AsideTile[] } {
    if (!this.workshop) return { tiles: [], aside: [] };
    const { deck, config } = this.workshop;
    const cards = new Map(deck.cards.map((c) => [c.id, c]));
    const first = firstAnswers(this.history);
    const latest = latestAnswers(this.history);
    const tiles: WorldTile[] = [];
    const sessions = [...this.history.sessions].sort((a, b) => a.sessionNo - b.sessionNo);
    for (const session of sessions) {
      const queue =
        this.live?.session.id === session.id
          ? this.live.queueAsPlanned
          : planAsStarted(deck, config, session, this.history).queue;
      // The first answers of this round: one per card, so a card answered twice is one tile.
      const ofSession = [...first.values()].filter((e) => e.sessionId === session.id);
      // The words of the latest answer, if this device wrote that very answer (ADR 0024). The
      // copy is keyed by round and card, and a second phone can answer the card again in the
      // same round: this phone's copy would then be of the earlier answer. So the copy must be
      // of the latest event. A copy from before copies named their event counts only when the
      // round holds one answer to the card.
      const words = (cardId: string) => {
        const last = latest.get(cardId)!;
        const key = answerKey(last.sessionId, cardId);
        const text = this.copies.get(key);
        if (text === undefined) return null;
        const of = this.copyEvents.get(key);
        if (of !== undefined) return of === last.id ? text : null;
        const inRound = this.history.events.filter(
          (e) => e.kind === 'answered' && e.sessionId === last.sessionId && e.cardId === cardId,
        ).length;
        return inRound === 1 ? text : null;
      };
      const answered = ofSession
        .filter((e) => cards.has(e.cardId))
        .map((e) => ({ cardId: e.cardId, n: cardNumber(queue, e.cardId) }))
        .sort((a, b) => a.n - b.n);
      for (const { cardId, n } of answered) {
        const card = cards.get(cardId)!;
        const answer = words(cardId);
        tiles.push({
          key: answerKey(session.id, cardId),
          cardId,
          sessionNo: session.sessionNo,
          n,
          ...(card.area === undefined ? {} : { area: card.area }),
          question: card.text,
          answer,
          opens: answer !== null,
        });
      }
      // A blank card is in no deck, so the line above leaves it out; it is a tile all the same,
      // after the round's cards, in the order written (ADR 0022). It has no number in the round,
      // so `n` is 0 and the tile does not take a tint from it.
      const own = ofSession.filter((e) => isOwnCardId(e.cardId)).sort((a, b) => a.seq - b.seq);
      for (const { cardId } of own) {
        const answer = words(cardId);
        tiles.push({
          key: answerKey(session.id, cardId),
          cardId,
          sessionNo: session.sessionNo,
          n: 0,
          question: '',
          answer,
          own: true,
          opens: answer !== null,
        });
      }
    }
    const aside: AsideTile[] = [];
    // From the history, never from the queue: a card set aside may leave the queue (the deck
    // engine decides where it comes back), and the list must keep it all the same.
    for (const id of setAsideCards(this.history)) {
      const card = cards.get(id);
      if (!card) continue;
      aside.push({
        cardId: id,
        ...(card.area === undefined ? {} : { area: card.area }),
        question: card.text,
      });
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
    if (route.invitations && route.wave) {
      // The invitation page is for the person sending the invitations, not a participant: no
      // store, no code, no sync, no wave open counted, nothing remembered (ADR 0021).
      this.invitationWave = route.wave;
      // Back from the page about the app, opened from the header's "?" (ADR 0023), comes here.
      this.home = pathname;
      this.screen = 'invitations';
      return;
    }
    this.rememberWorkshop(route.slug);
    this.platform = detectPlatform(navigator.userAgent, navigator.maxTouchPoints);
    this.store = await this.openStore(route.slug);
    const saved = await this.store.get('code');
    const stored = parseArrival(await this.store.get('arrival'));
    // What "Delete everything" left for this load, in this tab (ADR 0026). Taken at once, so it
    // is erased whatever this open turns out to be.
    const startOver = takeStartOver(route.slug);
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
    } else if (startOver && !fromLink && !route.wave && !route.invite) {
      // Everything was deleted a moment ago, in this tab, and the person is still here (ADR
      // 0026): the welcome offers "I understand" again, and the join starts the same link over,
      // as opening the email's link again would. In memory only: nothing goes back into the
      // store, so a reload or a closed tab forgets it. A link opened just now wins over the note.
      // Only at an address that names no wave and no invite, as the home the delete loads does:
      // a wave link or an invite opened in this tab instead is a new arrival, and joins as one.
      this.linkCode = startOver.code;
      if (!this.arrival.wave && !this.arrival.invite) this.arrival = { wave: startOver.wave };
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
    const held = await this.store.answers();
    this.copies = new Map(held.map((a) => [a.key, a.text]));
    this.copyEvents = new Map(
      held.flatMap((a) => (a.eventId === undefined ? [] : [[a.key, a.eventId] as const])),
    );
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
    // The dictation hint opens by itself on this card only when it is the first of the first
    // round (architecture plan, 8.1); it shows when the card is opened (`openCard`).
    this.frontHint = this.sessionNo === 1 && this.live.untouched && this.platform !== null;
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

  /**
   * One event, as the contract spells it, with this session's next seq; the engine names the kind.
   * For the front card unless a card id is given: the open card's (ADR 0022, ADR 0027).
   */
  private async record(
    kind: EventKind,
    body?: string,
    cardId = this.card?.id,
  ): Promise<Event | undefined> {
    if (!this.store || !this.workshop || !this.live || cardId === undefined) return undefined;
    const event: Event = {
      id: crypto.randomUUID(),
      sessionId: this.live.session.id,
      cardId,
      seq: this.live.nextSeq,
      kind,
      createdDay: localDay(),
      deckVersion: this.workshop.deck.version,
      ...(body === undefined ? {} : { body }),
    };
    await this.store.putEvent({ ...event, synced: 0 });
    this.history = { ...this.history, events: [...this.history.events, event] };
    return event;
  }

  /** Keep the readable words of an answer just recorded, with the event they belong to. */
  private async keepCopy(
    key: string,
    sessionId: string,
    cardId: string,
    text: string,
    event: Event | undefined,
  ): Promise<void> {
    if (!this.store) return;
    await this.store.putAnswer({
      key,
      sessionId,
      cardId,
      text,
      ...(event === undefined ? {} : { eventId: event.id }),
    });
    this.copies = new Map(this.copies).set(key, text);
    if (event !== undefined) this.copyEvents = new Map(this.copyEvents).set(key, event.id);
  }

  /** Said once, to a screen reader only, each time a card is saved or set aside; `n` makes the same words say again. */
  private announce(key: 'saved' | 'set aside' | 'set aside for later'): void {
    this.announcement = { n: this.announcement.n + 1, text: this.copy.item('Announcements', key) };
  }

  /**
   * "Set aside", by button or swipe: the engine moves the card to the end of the queue the first
   * time (`dismissed`) and out of it the second (`deferred`); the event is recorded; the sync
   * runs in the background; the next card comes at once, with no toast (ADR 0019). A half-written
   * answer waits in memory for the card to come round. With the onboarding card in front, the
   * button and the swipe send it away instead, as "Got it" does: nothing is recorded. It acts on
   * the card in front while it is closed; while a card is open it does nothing (ADR 0027).
   */
  async setAside(): Promise<void> {
    if (this.demoFront) return this.dismissDemo();
    if (!this.live || !this.card || this.saving || this.writing !== null) return;
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

  /**
   * Whether a card can be open now (ADR 0027): on the card screen whenever a round is live, also
   * once the deck is done; never on the welcome or the about page, and never while the onboarding
   * card is in front, since a person writes after they have seen what this is.
   */
  get canWrite(): boolean {
    return this.screen === 'card' && this.live !== null && !this.demoFront;
  }

  /** Whether "Write your own story" is offered (ADR 0022): wherever a card can be open. */
  get ownCardOffered(): boolean {
    return this.canWrite;
  }

  /**
   * Tap, click or Enter on the card in front: it opens in the open card (ADR 0027), with the words
   * begun on it. The dictation hint is open when this is the first card of the first round.
   */
  openCard(): void {
    if (!this.card || !this.canWrite || this.writing !== null || this.saving || this.leaving)
      return;
    this.openFor(this.card.id, 'front');
  }

  /** "Write your own story": the open card opens for a new blank card, with the words left there last time. */
  openOwnCard(): void {
    if (!this.canWrite || this.writing !== null || this.saving || this.leaving) return;
    this.openFor(NEW_OWN_CARD, 'new');
  }

  /**
   * A tap on a tile in "Your world so far" (ADR 0024): the open card opens for that card. A card
   * set aside opens empty, or with the words it was set aside with; an answer, or a blank card,
   * opens with the words of its latest version, or with what was left there when it closed. Only
   * a tile that opens: an answer whose latest words are not on this device has nothing to change.
   * On a phone the sheet closes first.
   */
  openTile(cardId: string): void {
    if (!this.canWrite || this.writing !== null || this.saving || this.leaving) return;
    if (!this.tileOpens(cardId)) return;
    this.worldOpen = false;
    this.openFor(cardId, 'tile');
  }

  /**
   * The one way a card opens (ADR 0027): its words, the hint, what was tapped, then the card. The
   * hint opens by itself only on the card in front, when `showCard` said so; on any other card it
   * waits for "Prefer to talk?".
   */
  private openFor(cardId: string, from: OpenedFrom): void {
    this.error = '';
    this.openDraft = this.draftOf(cardId);
    this.hintOpen = from === 'front' && this.frontHint;
    this.openedFrom = from;
    this.writing = cardId;
  }

  /** Whether the tile of this card opens: a card set aside always, an answer when its words are here. */
  private tileOpens(cardId: string): boolean {
    const { tiles, aside } = this.world;
    return (
      aside.some((t) => t.cardId === cardId) || tiles.some((t) => t.cardId === cardId && t.opens)
    );
  }

  /**
   * The words a card opens with. One draft per card id: the front card's is the stack's own
   * (`draft`), any other card's waits in `drafts`, a new blank card's under `NEW_OWN_CARD`; with
   * none, an answer opens with the words of its latest version, a card set aside empty.
   */
  private draftOf(cardId: string): string {
    if (cardId !== NEW_OWN_CARD && this.card?.id === cardId) return this.draft;
    const kept = this.drafts.get(cardId);
    if (kept !== undefined) return kept;
    if (cardId === NEW_OWN_CARD) return '';
    return this.world.tiles.find((t) => t.cardId === cardId)?.answer ?? '';
  }

  /**
   * The open card closes and its words are kept for the next time, under its card id. The words
   * of an answer left as they were are not a draft: the next time opens with the answer. The card
   * in front keeps its hint open or closed as it was.
   */
  private putAway(): void {
    const key = this.writing;
    if (key === null) return;
    // The words of a card being saved are an answer, not a draft: when the screen changes under
    // a save (the workshop closed meanwhile), nothing is kept for the next time.
    if (this.saving) {
      this.writing = null;
      return;
    }
    const text = this.openDraft;
    const answer =
      key === NEW_OWN_CARD ? undefined : this.world.tiles.find((t) => t.cardId === key)?.answer;
    const keep = text.trim() !== '' && text !== answer;
    // The front card's draft is the stack's own: what was written here is what the card shows.
    if (key !== NEW_OWN_CARD && this.card?.id === key) this.draft = text;
    else if (keep) this.drafts.set(key, text);
    else this.drafts.delete(key);
    if (this.openedFrom === 'front') this.frontHint = this.hintOpen;
    this.writing = null;
  }

  /**
   * The open card fades out where it stands (ADR 0025, ADR 0027). It never slides. Under reduced
   * motion it goes at once, as the place to write did.
   */
  private async fadeOut(): Promise<void> {
    this.closing = true;
    try {
      if (!reducedMotion()) await this.wait(CLOSE_MS);
    } finally {
      this.closing = false;
    }
  }

  /**
   * ×, Esc, a tap or click on the scrim: the open card fades out and closes, and its words stay
   * in memory for the next time, for every card (ADR 0027). Not while it is being saved.
   */
  async closeCard(): Promise<void> {
    if (this.writing === null || this.saving || this.closing) return;
    this.error = '';
    await this.fadeOut();
    this.putAway();
  }

  /**
   * Save, the one save for every card (ADR 0027): cut to the limit by code points, sealed before
   * anything is written (CLIENT_SEAL_FAILED when it cannot be), one `answered` event on the live
   * round with its next seq, through the outbox, the readable copy next to it under this round's
   * key with the event's id (ADR 0014, ADR 0024), "saved" for a screen reader, then the sync in
   * the background. An empty text, or spaces only, is not saved. Returns whether it was taken;
   * the promise settles once the sync has answered, which nothing waits for on the screen.
   *
   * Which card is the open one: a fresh id from `newOwnCardId` for a new blank card (ADR 0022);
   * else its own id. Nothing stored is changed: an answer changed is one more event for the same
   * card id, and the latest one is the answer.
   *
   * The round is replayed from its events afterwards, so it is the round a reload would find. For
   * a card of the queue that is the round `withAnswer` gave before ADR 0027 (the test "a save from
   * the stack gives the round withAnswer gave" proves it). A changed answer or a blank card leaves
   * the round as it was: the card in front, its draft, the queue and the stack do not move, and no
   * `shown` is recorded. When the card answered is the card in front (opened from the stack, or a
   * card set aside that came round, opened from its tile), the next card comes forward and is
   * recorded `shown`, while the open card still stands over it; then the open card fades out.
   */
  async save(answer = this.openDraft): Promise<boolean> {
    if (!this.workshop || !this.live || !this.store || this.saving || this.closing) return false;
    const target = this.writing;
    if (target === null || !this.canWrite || !answer.trim()) return false;
    const front = target !== NEW_OWN_CARD && this.card?.id === target;
    if (target !== NEW_OWN_CARD && !front && !this.tileOpens(target)) return false;
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
    this.saving = true;
    // Once the event is written the card is answered, and the open card goes whatever happens
    // after: left standing, a second "Save" would record the answer twice.
    let recorded = false;
    let sync: Promise<unknown> = Promise.resolve();
    try {
      const cardId = target === NEW_OWN_CARD ? newOwnCardId() : target;
      this.savedAs = cardId;
      const session = this.live.session;
      const event = await this.record('answered', sealed, cardId);
      recorded = true;
      // The readable copy goes next to the outbox, never into it: the event above carries the
      // sealed text only, and `putAnswer` writes a table no sync ever reads (lib/store.ts).
      const key = answerKey(session.id, cardId);
      await this.keepCopy(key, session.id, cardId, text, event);
      // The round as a reload would replay it (ADR 0024): the card joins the round's answered
      // ids, which the deck engine ignores for a card not in the queue, and a blank card is not
      // a touch of the round, so the first card keeps its hints (lib/session.ts).
      this.live = replaySession(this.workshop.deck, this.workshop.config, session, this.history);
      this.drafts.delete(target);
      if (front) this.draft = '';
      this.announce('saved');
      // The next card comes forward behind the open card, which still shows the card answered.
      if (front) await this.showCard();
      // The sync starts now, as it did before ADR 0027, and not after the fade: what is on the
      // screen never waits for it, and it never waits for what is on the screen.
      sync = this.requestSync();
      await this.fadeOut();
    } finally {
      if (recorded) {
        this.openDraft = '';
        this.writing = null;
      }
      this.savedAs = null;
      this.saving = false;
    }
    await sync;
    return true;
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
   * "About this app", the "?" in the header of any screen (ADR 0023): a fresh GET /me, so the
   * rows are what the server holds now; then the page, at a section when an older address asked
   * for one. The invitation page has no store and no code (ADR 0021): the page opens without
   * asking the server anything.
   */
  async openAbout(section: AboutSection | null = null): Promise<void> {
    if (!this.workshop) return;
    if (this.store && this.code) {
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

  /**
   * The second step: DELETE /me, then the device wiped, then the workshop's home, loaded afresh
   * so nothing of the participant stays in memory. One note goes to that load, in the tab's
   * session storage: the code and the wave, so the welcome can start the same link over without
   * the email (ADR 0026; lib/start-over.ts). It is left only once the server has deleted and the
   * device is wiped.
   */
  async deleteMe(): Promise<void> {
    if (!this.store || !this.workshop || !this.confirmingDelete) return;
    const code = this.code;
    // The wave the server recorded for this participant, when it has said (GET /me): none for
    // one who came through an invite. Only when it has not said, the wave this device last
    // arrived through, which is the same unless it opened another wave's link since it joined.
    const wave = this.me ? (this.me.participant.wave ?? undefined) : this.arrival.wave;
    const res = await api(`/${this.workshop.config.slug}/me`, {
      method: 'DELETE',
      code,
    });
    if (!res.ok) {
      this.fail(res.error);
      return;
    }
    await this.store.wipe();
    // The readable copies went with the database (ADR 0014); nothing of them stays in memory either.
    this.copies = new Map();
    this.copyEvents = new Map();
    this.history = { sessions: [], events: [] };
    this.live = null;
    try {
      localStorage.removeItem(LAST_WORKSHOP);
    } catch {
      /* nothing to remove where storage is refused */
    }
    leaveStartOver(this.workshop.config.slug, code, wave);
    this.go(pageHref(this.workshop.config.slug));
  }

  /** The source at the commit that is running, for the page about the app. */
  get sourceHref(): string {
    const source = this.copy.item('Trust page variables', 'source');
    return VERSION === 'local' ? source : `${source}/tree/${VERSION}`;
  }
}
