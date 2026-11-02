import {
  formatCode,
  generateCode,
  normalizeCode,
  codeSchema,
  MAX_ANSWER_CHARS,
  type Card,
  type MeResponse,
} from '@wb/contracts';
import { sealAnswer } from '@wb/crypto';
import { api } from './api.ts';
import type { Copy } from './copy.ts';
import { sessionCards, truncateCodePoints } from './deck.ts';
import { dayStatus } from './days.ts';
import {
  countsAsOpen,
  pageHref,
  parseArrival,
  parseRoute,
  type Arrival,
  type Page,
} from './route.ts';
import { localDay, WorkshopStore } from './store.ts';
import { reconcile, syncNow, type SyncStatus } from './sync.ts';
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
  | 'consent'
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

  // the session
  cards = $state.raw<Card[]>([]);
  index = $state(0);
  sessionId = '';
  seq = 0;
  saving = $state(false);
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
    this.store = new WorkshopStore(route.slug);
    const saved = await this.store.get('code');
    const stored = parseArrival(await this.store.get('arrival'));
    if (route.wave) {
      // A wave is not a secret, so the address stays as it is: a copied address, the share sheet
      // and Safari's tabs from other devices all still join. The open is counted once per device,
      // the first time this device arrives through this wave (lib/route.ts, countsAsOpen).
      this.arrival = { wave: route.wave };
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
    if (saved) this.code = saved;
    if (route.page === 'continue') {
      this.screen = 'enter-code';
      return;
    }
    if (route.page === 'panel') {
      await this.openPanel();
      return;
    }
    await this.land();
  }

  /**
   * Move to a page a participant can open directly, and put its address in the address bar
   * (docs/screen-map.md, Entry): "I have a code" is /<slug>/continue; Back from it, or no page,
   * is /<slug>/ and where the device lands. The address is replaced, not pushed, so the
   * browser's back goes to wherever the person came from, never to a stale screen.
   */
  async navigate(page?: Page): Promise<void> {
    if (!this.workshop) return;
    history.replaceState(null, '', pageHref(this.workshop.config.slug, page));
    this.error = '';
    this.tooShort = false;
    if (page === 'continue') this.screen = 'enter-code';
    else if (page === 'panel') await this.openPanel();
    else await this.land();
  }

  /** Where a device lands after the arrival is known: the next card, or welcome, or closed. */
  private async land(): Promise<void> {
    if (this.code) {
      await this.afterCode();
    } else {
      // A new arrival outside the workshop's days is told so here, before any request, so the
      // screen does not depend on the API answering (it may not, before hardening week).
      this.screen = this.today() === 'open' ? 'welcome' : 'closed';
    }
  }

  async afterCode(): Promise<void> {
    if (!this.store || !this.workshop) return;
    this.me = await reconcile(this.store, this.workshop.config.slug, this.code);
    this.sync = await syncNow(this.store, this.workshop.config.slug, this.code);
    if (this.today() !== 'open') {
      this.screen = 'closed';
      return;
    }
    await this.startSession();
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
    const sessionNo =
      Math.max(await this.store.sessions.count(), this.me?.sessions.length ?? 0) + 1;
    const seed = Array.from(crypto.getRandomValues(new Uint8Array(8)), (b) =>
      b.toString(16).padStart(2, '0'),
    ).join('');
    await this.store.sessions.put({
      id: this.sessionId,
      sessionNo,
      startedDay: localDay(),
      deckVersion: this.workshop.deck.version,
      seed,
      synced: 0,
    });
    this.screen = this.cards.length ? 'card' : 'session-end';
  }

  /** Consent: generate the code, create the participant, start the first session. */
  async join(): Promise<void> {
    if (!this.store || !this.workshop) return;
    this.error = '';
    const fresh = generateCode();
    const body = this.arrival.invite
      ? { code: fresh, invite: this.arrival.invite }
      : { code: fresh, wave: this.arrival.wave ?? 'wave-1' };
    const res = await api(`/${this.workshop.config.slug}/join`, { body });
    if (!res.ok) {
      if (res.error === 'WORKSHOP_CLOSED') this.screen = 'closed';
      else this.error = res.error;
      return;
    }
    this.code = fresh;
    await this.store.set('code', this.code);
    await this.store.set('consent', localDay());
    await this.startSession();
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

  /** Seal the answer, write the outbox, move on. Returns whether the answer was taken. */
  async save(answer: string): Promise<boolean> {
    if (!this.workshop || this.saving) return false;
    this.saving = true;
    this.error = '';
    try {
      const sealed = sealAnswer(
        this.workshop.publicKey,
        truncateCodePoints(answer, MAX_ANSWER_CHARS),
      );
      await this.record('answered', sealed);
      await this.next();
      return true;
    } catch (e) {
      this.error = (e as { code?: string }).code ?? 'CLIENT_SEAL_FAILED';
      return false;
    } finally {
      this.saving = false;
    }
  }

  async setAside(): Promise<void> {
    await this.record('dismissed');
    await this.next();
  }

  private async next(): Promise<void> {
    if (!this.store || !this.workshop) return;
    this.sync = await syncNow(this.store, this.workshop.config.slug, this.code);
    if (this.index + 1 < this.cards.length) this.index += 1;
    else this.screen = 'session-end';
  }

  async openPanel(): Promise<void> {
    if (!this.store || !this.workshop) return;
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
    if (this.code) this.me = await reconcile(this.store, this.workshop.config.slug, this.code);
    this.screen = 'panel';
  }

  /** Back from the panel: to the screen it was opened from, or, opened directly, where the device lands. */
  async closePanel(): Promise<void> {
    if (this.before === 'loading' || this.before === 'panel') await this.land();
    else this.screen = this.before;
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
