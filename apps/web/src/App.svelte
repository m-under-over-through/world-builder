<script lang="ts">
  import { onMount } from 'svelte';
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
  import { api } from './lib/api.ts';
  import { codePoints, sessionCards, truncateCodePoints } from './lib/deck.ts';
  import { dayStatus } from './lib/days.ts';
  import { parseRoute } from './lib/route.ts';
  import { localDay, WorkshopStore } from './lib/store.ts';
  import { reconcile, syncNow, type SyncStatus } from './lib/sync.ts';
  import { ENV, findWorkshop, VERSION, type Workshop } from './lib/workshops.ts';

  /**
   * The walking skeleton of the client: welcome, consent, one session of cards, the code reveal,
   * and the privacy panel. Screens follow docs/screen-map.md; the full intro, the Later pile,
   * install prompts and dictation hints come in week two.
   */
  type Screen =
    | 'loading'
    | 'no-workshop'
    | 'welcome'
    | 'enter-code'
    | 'consent'
    | 'card'
    | 'session-end'
    | 'panel'
    | 'closed';

  let screen = $state<Screen>('loading');
  let workshop = $state<Workshop | undefined>();
  let store: WorkshopStore | undefined;
  let code = $state('');
  let arrival = $state<{ wave?: string; invite?: string }>({});
  let error = $state('');
  let codeInput = $state('');
  let revealed = $state(false);
  let copied = $state(false);

  // the session
  let cards = $state<Card[]>([]);
  let index = $state(0);
  let answer = $state('');
  let sessionId = '';
  let seq = 0;
  let saving = $state(false);
  let sync = $state<SyncStatus>({ lastResult: 'never', outboxSize: 0 });

  // the panel
  let me = $state<MeResponse | null>(null);
  let hosts = $state<string[]>([]);
  let cookies = $state(0);

  const card = $derived(cards[index]);
  /** Today against the workshop's days, judged on the device (lib/days.ts); the server has the last word. */
  const today = () =>
    workshop ? dayStatus(localDay(), workshop.opensDay, workshop.config.closesDay) : 'open';
  const notYetOpen = $derived(workshop !== undefined && today() === 'before');
  /** "16 November 2026" in the phone's language; noon avoids the day shifting at a timezone edge. */
  const longDay = (day: string) =>
    new Date(`${day}T12:00:00`).toLocaleDateString(undefined, {
      day: 'numeric',
      month: 'long',
      year: 'numeric',
    });
  const remaining = $derived(MAX_ANSWER_CHARS - codePoints(answer));

  onMount(async () => {
    const route = parseRoute(location.pathname);
    workshop = route ? findWorkshop(route.slug) : undefined;
    if (!route || !workshop) {
      screen = 'no-workshop';
      return;
    }
    store = new WorkshopStore(route.slug);
    const saved = await store.get('code');
    if (route.wave) {
      arrival = { wave: route.wave };
      await store.set('arrival', JSON.stringify(arrival));
      void api(`/${route.slug}/waves/${route.wave}/opened`, { method: 'POST', body: {} });
      history.replaceState(null, '', `/${route.slug}/`);
    } else if (route.invite) {
      arrival = { invite: route.invite };
      await store.set('arrival', JSON.stringify(arrival));
      history.replaceState(null, '', `/${route.slug}/`);
    } else {
      const a = await store.get('arrival');
      if (a) arrival = JSON.parse(a);
    }
    if (saved) {
      code = saved;
      await afterCode();
    } else {
      // A new arrival outside the workshop's days is told so here, before any request, so the
      // screen does not depend on the API answering (it may not, before hardening week).
      screen = today() === 'open' ? 'welcome' : 'closed';
    }
  });

  async function afterCode() {
    if (!store || !workshop) return;
    me = await reconcile(store, workshop.config.slug, code);
    sync = await syncNow(store, workshop.config.slug, code);
    if (today() !== 'open') {
      screen = 'closed';
      return;
    }
    await startSession();
  }

  async function startSession() {
    if (!store || !workshop) return;
    // What this participant has already answered: the device's record and the server's, combined,
    // so a new device (or a wiped one) continues where the others left off.
    const answered = await store.answeredCardIds();
    for (const e of me?.events ?? []) if (e.kind === 'answered') answered.add(e.cardId);
    cards = sessionCards(workshop.deck, workshop.config, answered);
    index = 0;
    seq = 0;
    sessionId = crypto.randomUUID();
    const sessionNo = Math.max(await store.sessions.count(), me?.sessions.length ?? 0) + 1;
    const seed = Array.from(crypto.getRandomValues(new Uint8Array(8)), (b) =>
      b.toString(16).padStart(2, '0'),
    ).join('');
    await store.sessions.put({
      id: sessionId,
      sessionNo,
      startedDay: localDay(),
      deckVersion: workshop.deck.version,
      seed,
      synced: 0,
    });
    screen = cards.length ? 'card' : 'session-end';
  }

  async function join() {
    if (!store || !workshop) return;
    error = '';
    const fresh = generateCode();
    const body = arrival.invite
      ? { code: fresh, invite: arrival.invite }
      : { code: fresh, wave: arrival.wave ?? 'wave-1' };
    const res = await api(`/${workshop.config.slug}/join`, { body });
    if (!res.ok) {
      if (res.error === 'WORKSHOP_CLOSED') screen = 'closed';
      else error = res.error;
      return;
    }
    code = fresh;
    await store.set('code', code);
    await store.set('consent', localDay());
    await startSession();
  }

  async function continueWithCode() {
    if (!store || !workshop) return;
    error = '';
    const typed = normalizeCode(codeInput);
    if (!codeSchema.safeParse(typed).success) {
      error = 'That is not a 16-digit code.';
      return;
    }
    const res = await api(`/${workshop.config.slug}/me`, { code: typed });
    if (!res.ok) {
      if (res.error === 'WORKSHOP_CLOSED') screen = 'closed';
      else if (res.error === 'AUTH_CODE_UNKNOWN')
        error = 'That code is not ours. Check the digits.';
      else error = res.error;
      return;
    }
    code = typed;
    await store.set('code', code);
    await afterCode();
  }

  async function record(kind: 'answered' | 'dismissed', body?: string) {
    if (!store || !workshop || !card) return;
    const event = {
      id: crypto.randomUUID(),
      sessionId,
      cardId: card.id,
      seq: seq++,
      kind,
      createdDay: localDay(),
      deckVersion: workshop.deck.version,
      synced: 0 as const,
      ...(body === undefined ? {} : { body }),
    };
    await store.events.put(event);
  }

  async function save() {
    if (!workshop || saving) return;
    saving = true;
    error = '';
    try {
      const sealed = sealAnswer(workshop.publicKey, truncateCodePoints(answer, MAX_ANSWER_CHARS));
      await record('answered', sealed);
      answer = '';
      await next();
    } catch (e) {
      error = (e as { code?: string }).code ?? 'CLIENT_SEAL_FAILED';
    } finally {
      saving = false;
    }
  }

  async function setAside() {
    await record('dismissed');
    answer = '';
    await next();
  }

  async function next() {
    if (!store || !workshop) return;
    sync = await syncNow(store, workshop.config.slug, code);
    if (index + 1 < cards.length) index += 1;
    else screen = 'session-end';
  }

  async function openPanel() {
    if (!store || !workshop) return;
    cookies = document.cookie.split(';').filter((c) => c.trim()).length;
    const seen = new Set<string>([location.host]);
    for (const entry of performance.getEntriesByType('resource')) {
      try {
        seen.add(new URL(entry.name).host);
      } catch {
        /* data: URLs and the like */
      }
    }
    hosts = [...seen];
    if (code) me = await reconcile(store, workshop.config.slug, code);
    screen = 'panel';
  }

  async function deleteMe() {
    if (!store || !workshop) return;
    if (
      !confirm(
        'Delete everything about you, on this device and on our server? This cannot be undone.',
      )
    )
      return;
    const res = await api(`/${workshop.config.slug}/me`, { method: 'DELETE', code });
    if (!res.ok) {
      error = res.error;
      return;
    }
    await store.wipe();
    location.href = `/${workshop.config.slug}/`;
  }

  async function copyCode() {
    await navigator.clipboard.writeText(formatCode(code));
    copied = true;
    setTimeout(() => (copied = false), 2000);
  }
</script>

<main>
  <nav>
    <span>{workshop?.config.name ?? 'World Builder'}</span>
    {#if screen !== 'loading' && screen !== 'no-workshop' && screen !== 'panel'}
      <button onclick={openPanel}>Your privacy</button>
    {/if}
  </nav>

  {#if screen === 'loading'}
    <p class="muted">Loading…</p>
  {:else if screen === 'no-workshop'}
    <h1>World Builder</h1>
    <p>This address is not a workshop. Use the link you were sent.</p>
  {:else if screen === 'welcome'}
    <h1>{workshop?.config.name}</h1>
    <p>{workshop?.config.purpose}</p>
    <div class="row">
      {#if arrival.wave || arrival.invite}
        <button class="primary" onclick={() => (screen = 'consent')}><span>New here</span></button>
      {:else}
        <p class="muted">To start, open the link you were sent.</p>
      {/if}
      <button onclick={() => (screen = 'enter-code')}>I have a code</button>
    </div>
  {:else if screen === 'enter-code'}
    <h1>Your code</h1>
    <p>The 16 digits you were shown at the end of your first session.</p>
    <input
      class="code"
      inputmode="numeric"
      autocomplete="off"
      placeholder="1234 5678 9012 3456"
      bind:value={codeInput}
    />
    {#if error}<p>{error}</p>{/if}
    <div class="row">
      <button class="primary" onclick={continueWithCode}><span>Continue</span></button>
      <button onclick={() => (screen = 'welcome')}>Back</button>
    </div>
  {:else if screen === 'consent'}
    <h1>Before you start</h1>
    <p>
      Your answers are anonymous. We do not ask for your name or email, we set no cookies, and your
      answers are encrypted on your device before they are sent. They will be used by {workshop
        ?.config.organizer} to imagine the future of local manufacturing and may be quoted, without any
      way to trace them to you.
    </p>
    {#if error}<p>Something went wrong: {error}</p>{/if}
    <div class="row">
      <button class="primary" onclick={join}><span>I understand</span></button>
    </div>
  {:else if screen === 'card' && card}
    <p class="muted">Card {index + 1} of {cards.length}</p>
    <div class="card">
      <p class="question">{card.text}</p>
      <textarea
        bind:value={answer}
        placeholder="Type, or tap the mic on your keyboard to dictate."
        aria-label={card.text}></textarea>
      <p class="muted">
        Please do not name real people. {remaining < 500 ? `${remaining} characters left.` : ''}
      </p>
      {#if error}<p>Could not save: {error}</p>{/if}
      <div class="row">
        <button class="primary" onclick={save} disabled={saving || !answer.trim() || remaining < 0}
          ><span>Save</span></button
        >
        <button onclick={setAside}>Set aside</button>
      </div>
    </div>
    <p class="muted">
      {#if sync.lastResult === 'ok'}Synced.{:else if sync.lastResult === 'offline'}Saved on this
        device. Will sync when online.{:else if sync.lastResult === 'error'}Saved on this device.
        Sync problem: {sync.lastError}.{/if}
    </p>
  {:else if screen === 'session-end'}
    <h1>That is a session.</h1>
    <p>
      This code is you. It is random, and it is the only thing that identifies you to us. Save it if
      you want to continue on another device.
    </p>
    <p class="code">{revealed ? formatCode(code) : '•••• •••• •••• ••••'}</p>
    <div class="row">
      <button onclick={() => (revealed = !revealed)}>{revealed ? 'Hide' : 'Reveal'}</button>
      <button onclick={copyCode}>{copied ? 'Copied' : 'Copy'}</button>
    </div>
    <p class="muted">Come back another day for the next cards.</p>
    <p class="muted">
      {#if sync.outboxSize > 0}{sync.outboxSize} answer(s) still waiting to sync; keep the app open a
        moment when you are online.{:else}Everything is synced.{/if}
    </p>
  {:else if screen === 'closed'}
    {#if notYetOpen && workshop}
      <h1>Not open yet.</h1>
      <p>This opens on {longDay(workshop.opensDay)}. Keep the link and come back then.</p>
    {:else}
      <h1>This workshop has closed.</h1>
      <p>Thank you. The answers are being read now.</p>
    {/if}
  {:else if screen === 'panel'}
    <h1>Your privacy</h1>
    <dl>
      <div>
        <dt>Your code</dt>
        <dd class="code">
          {code ? (revealed ? formatCode(code) : '•••• •••• •••• ••••') : 'none yet'}
        </dd>
      </div>
      <div>
        <dt>Cookies set by this app</dt>
        <dd>{cookies}</dd>
      </div>
      <div>
        <dt>Hosts this app has contacted</dt>
        <dd>{hosts.join(', ')}</dd>
      </div>
      <div>
        <dt>Microphone, camera, location</dt>
        <dd>blocked by policy</dd>
      </div>
      <div>
        <dt>Answers encrypted to key</dt>
        <dd>{workshop?.keyFingerprint} ({ENV})</dd>
      </div>
      <div>
        <dt>Stored on our server about you</dt>
        <dd>
          {me
            ? `${me.sessions.length} session(s), ${me.events.length} event(s), answers sealed`
            : 'nothing yet'}
        </dd>
      </div>
      <div>
        <dt>Waiting to sync</dt>
        <dd>
          {sync.outboxSize} event(s); last sync {sync.lastResult}{sync.lastError
            ? ` (${sync.lastError})`
            : ''}
        </dd>
      </div>
      <div>
        <dt>Version</dt>
        <dd>{VERSION}</dd>
      </div>
    </dl>
    {#if error}<p>{error}</p>{/if}
    <div class="row">
      <button onclick={() => (revealed = !revealed)}
        >{revealed ? 'Hide code' : 'Reveal code'}</button
      >
      <button onclick={() => (screen = code ? 'card' : 'welcome')}>Back</button>
      {#if code}<button onclick={deleteMe}>Delete everything about me</button>{/if}
    </div>
  {/if}
</main>
