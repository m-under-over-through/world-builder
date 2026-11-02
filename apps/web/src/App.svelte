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
  import { fill, type Copy } from './lib/copy.ts';
  import { codePoints, sessionCards, truncateCodePoints } from './lib/deck.ts';
  import { dayStatus } from './lib/days.ts';
  import { countsAsOpen, parseArrival, parseRoute, type Arrival } from './lib/route.ts';
  import { localDay, WorkshopStore } from './lib/store.ts';
  import { reconcile, syncNow, type SyncStatus } from './lib/sync.ts';
  import { defaultCopy, ENV, findWorkshop, VERSION, type Workshop } from './lib/workshops.ts';

  /**
   * The walking skeleton of the client: welcome, consent, one session of cards, the code reveal,
   * and the privacy panel. Screens follow docs/screen-map.md; the full intro, the Later pile,
   * install prompts and dictation hints come in week two. Every word on the screen comes from
   * the workshop's copy.md through `copy` (lib/copy.ts); nothing is typed here.
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
  let copy = $state.raw<Copy>(defaultCopy());
  let store: WorkshopStore | undefined;
  let code = $state('');
  let arrival = $state<Arrival>({});
  /** The error code of the last failure on this screen, shown through its copy.md wording. */
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
  const masked = '•••• •••• •••• ••••';

  onMount(async () => {
    const route = parseRoute(location.pathname);
    workshop = route ? findWorkshop(route.slug) : undefined;
    if (!route || !workshop) {
      screen = 'no-workshop';
      return;
    }
    copy = workshop.copy;
    store = new WorkshopStore(route.slug);
    const saved = await store.get('code');
    const stored = parseArrival(await store.get('arrival'));
    if (route.wave) {
      // A wave is not a secret, so the address stays as it is: a copied address, the share sheet
      // and Safari's tabs from other devices all still join. The open is counted once per device,
      // the first time this device arrives through this wave (lib/route.ts, countsAsOpen).
      arrival = { wave: route.wave };
      if (countsAsOpen(stored, route.wave)) {
        await store.set('arrival', JSON.stringify(arrival));
        void api(`/${route.slug}/waves/${route.wave}/opened`, { method: 'POST', body: {} });
      }
    } else if (route.invite) {
      // An invite token works once and must not linger in the address bar or travel in a share,
      // so the address is replaced by the workshop's home once the token is stored.
      arrival = { invite: route.invite };
      await store.set('arrival', JSON.stringify(arrival));
      history.replaceState(null, '', `/${route.slug}/`);
    } else {
      arrival = stored;
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

  /** Not an error code: the one local refusal, a code that is not 16 digits yet. */
  let tooShort = $state(false);

  async function continueWithCode() {
    if (!store || !workshop) return;
    error = '';
    tooShort = false;
    const typed = normalizeCode(codeInput);
    if (!codeSchema.safeParse(typed).success) {
      tooShort = true;
      return;
    }
    const res = await api(`/${workshop.config.slug}/me`, { code: typed });
    if (!res.ok) {
      if (res.error === 'WORKSHOP_CLOSED') screen = 'closed';
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
    // The browser's own record of every resource this page fetched; absent in a test DOM.
    for (const entry of performance.getEntriesByType?.('resource') ?? []) {
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
    if (!confirm(copy.text('Privacy panel: delete confirm'))) return;
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
    <span>{workshop?.config.name ?? copy.item('App labels', 'app name')}</span>
    {#if screen !== 'loading' && screen !== 'no-workshop' && screen !== 'panel'}
      <button onclick={openPanel}>{copy.item('Buttons', 'privacy')}</button>
    {/if}
  </nav>

  {#if screen === 'loading'}
    <p class="muted">{copy.item('App labels', 'loading')}</p>
  {:else if screen === 'no-workshop'}
    <h1>{copy.item('Titles', 'not a workshop')}</h1>
    <p>{copy.text('Not a workshop')}</p>
  {:else if screen === 'welcome'}
    <h1>{workshop?.config.name}</h1>
    <p>{workshop?.config.purpose}</p>
    <div class="row">
      {#if arrival.wave || arrival.invite}
        <button class="primary" onclick={() => (screen = 'consent')}
          ><span>{copy.item('Buttons', 'new here')}</span></button
        >
      {:else}
        <p class="muted">{copy.text('Welcome: no link')}</p>
      {/if}
      <button onclick={() => (screen = 'enter-code')}
        >{copy.item('Buttons', 'i have a code')}</button
      >
    </div>
  {:else if screen === 'enter-code'}
    <h1>{copy.item('Titles', 'enter code')}</h1>
    <p>{copy.text('Enter code')}</p>
    <input
      class="code"
      inputmode="numeric"
      autocomplete="off"
      placeholder="1234 5678 9012 3456"
      aria-label={copy.item('Titles', 'enter code')}
      bind:value={codeInput}
    />
    {#if tooShort}<p>{copy.text('Enter code: too short')}</p>{/if}
    {#if error}<p>{copy.error(error)}</p>{/if}
    <div class="row">
      <button class="primary" onclick={continueWithCode}
        ><span>{copy.item('Buttons', 'continue')}</span></button
      >
      <button onclick={() => (screen = 'welcome')}>{copy.item('Buttons', 'back')}</button>
    </div>
  {:else if screen === 'consent'}
    <h1>{copy.item('Titles', 'consent')}</h1>
    <p>{copy.text('Intro 3, consent')}</p>
    {#if error}<p>{copy.error(error)}</p>{/if}
    <div class="row">
      <button class="primary" onclick={join}
        ><span>{copy.item('Buttons', 'i understand')}</span></button
      >
    </div>
  {:else if screen === 'card' && card}
    <p class="muted">
      {fill(copy.item('Card labels', 'position'), { n: index + 1, total: cards.length })}
    </p>
    <div class="card">
      <p class="question">{card.text}</p>
      <textarea
        bind:value={answer}
        placeholder={copy.item('Card labels', 'placeholder')}
        aria-label={card.text}></textarea>
      <p class="muted">
        {copy.text('Card nudge')}
        {remaining < 500 ? fill(copy.item('Card labels', 'counter'), { n: remaining }) : ''}
      </p>
      {#if error}<p>{copy.item('Card labels', 'could not save')} {copy.error(error)}</p>{/if}
      <div class="row">
        <button class="primary" onclick={save} disabled={saving || !answer.trim() || remaining < 0}
          ><span>{copy.item('Buttons', 'save')}</span></button
        >
        <button onclick={setAside}>{copy.item('Buttons', 'set aside')}</button>
      </div>
    </div>
    <p class="muted">
      {#if sync.lastResult === 'ok'}{copy.item(
          'Card states',
          'synced',
        )}{:else if sync.lastResult === 'offline'}{copy.item(
          'Card states',
          'offline',
        )}{:else if sync.lastResult === 'error'}{copy.item('Card states', 'sync problem')}{/if}
    </p>
  {:else if screen === 'session-end'}
    <h1>{copy.item('Titles', 'session end')}</h1>
    <p>{fill(copy.text('Session end: your code'), { code: '' })}</p>
    <p class="code">{revealed ? formatCode(code) : masked}</p>
    <div class="row">
      <button onclick={() => (revealed = !revealed)}
        >{revealed ? copy.item('Buttons', 'hide') : copy.item('Buttons', 'reveal')}</button
      >
      <button onclick={copyCode}
        >{copied ? copy.item('Buttons', 'copied') : copy.item('Buttons', 'copy')}</button
      >
    </div>
    <p class="muted">{copy.item('Session end', 'come back')}</p>
    <p class="muted">
      {#if sync.outboxSize > 0}{fill(copy.item('Session end', 'waiting to sync'), {
          n: sync.outboxSize,
        })}{:else}{copy.item('Session end', 'all synced')}{/if}
    </p>
  {:else if screen === 'closed'}
    {#if notYetOpen && workshop}
      <h1>{copy.item('Titles', 'not open yet')}</h1>
      <p>{fill(copy.text('Not open yet'), { day: longDay(workshop.opensDay) })}</p>
    {:else}
      <h1>{copy.item('Titles', 'closed')}</h1>
      <p>{copy.text('Closed')}</p>
    {/if}
  {:else if screen === 'panel'}
    <h1>{copy.item('Titles', 'privacy panel')}</h1>
    <dl>
      <div>
        <dt>{copy.item('Privacy panel', 'code')}</dt>
        <dd class="code">
          {code
            ? revealed
              ? formatCode(code)
              : masked
            : copy.item('Privacy panel', 'no code yet')}
        </dd>
      </div>
      <div>
        <dt>{copy.item('Privacy panel', 'cookies')}</dt>
        <dd>{cookies}</dd>
      </div>
      <div>
        <dt>{copy.item('Privacy panel', 'hosts')}</dt>
        <dd>{hosts.join(', ')}</dd>
      </div>
      <div>
        <dt>{copy.item('Privacy panel', 'permissions')}</dt>
        <dd>{copy.item('Privacy panel', 'permissions value')}</dd>
      </div>
      <div>
        <dt>{copy.item('Privacy panel', 'key')}</dt>
        <dd>{workshop?.keyFingerprint} ({ENV})</dd>
      </div>
      <div>
        <dt>{copy.item('Privacy panel', 'stored')}</dt>
        <dd>
          {me
            ? fill(copy.item('Privacy panel', 'stored summary'), {
                sessions: me.sessions.length,
                events: me.events.length,
              })
            : copy.item('Privacy panel', 'nothing stored')}
        </dd>
      </div>
      <div>
        <dt>{copy.item('Privacy panel', 'waiting')}</dt>
        <dd>
          {fill(copy.item('Privacy panel', 'waiting summary'), { n: sync.outboxSize })}; {copy.item(
            'Diagnostics',
            'last sync',
          )}
          {copy.item('Diagnostics', sync.lastResult)}{sync.lastError ? ` (${sync.lastError})` : ''}
        </dd>
      </div>
      <div>
        <dt>{copy.item('Privacy panel', 'version')}</dt>
        <dd>{VERSION}</dd>
      </div>
    </dl>
    {#if error}<p>{copy.error(error)}</p>{/if}
    <div class="row">
      <button onclick={() => (revealed = !revealed)}
        >{revealed ? copy.item('Buttons', 'hide') : copy.item('Buttons', 'reveal')}</button
      >
      <button onclick={() => (screen = code ? 'card' : 'welcome')}
        >{copy.item('Buttons', 'back')}</button
      >
      {#if code}<button onclick={deleteMe}>{copy.item('Buttons', 'delete')}</button>{/if}
    </div>
  {/if}
</main>
