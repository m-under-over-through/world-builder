<script lang="ts">
  import { onMount } from 'svelte';
  import WorldSheet from './components/WorldSheet.svelte';
  import { fill } from './lib/copy.ts';
  import { AppState, tintOf } from './lib/state.svelte.ts';
  import About from './screens/About.svelte';
  import Card from './screens/Card.svelte';
  import Closed from './screens/Closed.svelte';
  import DemoCard from './screens/DemoCard.svelte';
  import EnterCode from './screens/EnterCode.svelte';
  import Intro from './screens/Intro.svelte';
  import NotAWorkshop from './screens/NotAWorkshop.svelte';
  import SessionEnd from './screens/SessionEnd.svelte';
  import TextPage from './screens/TextPage.svelte';
  import Welcome from './screens/Welcome.svelte';

  /**
   * The client: one component per screen of docs/screen-map.md under src/screens/, the state and
   * everything that changes it in lib/state.svelte.ts, and this file, which reads the address on
   * open and shows the screen the state says. Every word comes from the workshop's copy.md.
   *
   * The shell is the design's (design/DESIGN.md, Layout): the top bar with the app's name and
   * the organizer, two centered lines on a phone and a block on the left on a laptop, where it
   * also carries the progress strip while a session runs; under it the toast; the screen; and
   * at the foot one small link, "About this app", the one place that explains the app, shows
   * the code and the facts, and deletes everything (ADR 0013), with, on a phone's card screen,
   * the pill that opens "Your world so far" (ADR 0015). The page itself and the two texts have
   * their own foot.
   */
  // A test may hand in its own state (with an instant `wait`); the app makes one.
  let { app = new AppState() }: { app?: AppState } = $props();
  const onAPage = $derived(
    app.screen === 'about' || app.screen === 'terms' || app.screen === 'privacy',
  );
  /** The core loop's two screens: the card, and the session end that follows it. */
  const loop = $derived(app.screen === 'card' || app.screen === 'session-end');
  const phoneLoop = $derived(loop && !app.wide);
  let worldPill: HTMLButtonElement | undefined = $state();

  onMount(() => {
    // Chrome's own install offer, if it makes one: kept for the install offer (lib/install.ts).
    const keep = (event: Event) => {
      event.preventDefault();
      app.installOffer = event as AppState['installOffer'];
    };
    window.addEventListener('beforeinstallprompt', keep);
    // The network is back: the outbox goes out now, not at the retry timer's next tick.
    const online = () => void app.reconnected();
    window.addEventListener('online', online);
    // The layout: the world is a sheet behind a pill under 600 pixels and a column beside the
    // stack from there (DESIGN.md, Layout). Read once, and again whenever the window crosses
    // the line, so a resize switches without a reload. A test DOM has no matchMedia and keeps
    // what the test set.
    let stopWide = () => {};
    if (typeof matchMedia === 'function') {
      const query = matchMedia('(min-width: 600px)');
      const apply = () => (app.wide = query.matches);
      apply();
      query.addEventListener?.('change', apply);
      stopWide = () => query.removeEventListener?.('change', apply);
    }
    void app.open(location.pathname);
    return () => {
      window.removeEventListener('beforeinstallprompt', keep);
      window.removeEventListener('online', online);
      stopWide();
    };
  });
</script>

<div class="app" class:wide={app.wide} class:phone-loop={phoneLoop}>
  <header class="topbar">
    <div class="lines">
      <span class="name">{app.copy.item('App labels', 'app name')}</span>
      {#if app.workshop}<span class="organizer">{app.workshop.config.organizer}</span>{/if}
    </div>
    {#if app.wide && loop && app.live}
      <div class="progress-row">
        <div class="progress" aria-hidden="true">
          {#each app.progress as seg (seg.n)}
            <span class="seg {seg.state}" style:--tint={`var(--tint-${tintOf(seg.n)})`}></span>
          {/each}
        </div>
        <span class="progress-text"
          >{fill(app.copy.item('Your world', 'progress'), {
            n: app.answeredCount,
            total: app.queueLength,
          })}</span
        >
      </div>
    {/if}
  </header>

  {#if loop}
    <div class="toast-slot" role="status" aria-live="polite">
      {#if app.toast}
        {#key app.toast}
          <span class="toast">
            <span class="tick">
              <svg
                aria-hidden="true"
                width="13"
                height="13"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                stroke-width="2.5"
                stroke-linecap="round"
                stroke-linejoin="round"><path d="M5 12l4 4L19 7" /></svg
              >
            </span>
            {app.copy.item('Card states', app.toast)}
          </span>
        {/key}
      {/if}
    </div>
  {/if}

  {#if app.storageUnavailable}
    <p class="warning" role="status">{app.copy.error('CLIENT_STORAGE_UNAVAILABLE')}</p>
  {/if}
  {#if app.screen === 'card' || (app.screen === 'session-end' && app.wide)}
    {#if app.wide}
      <main class="page-main"><Card {app} /></main>
    {:else}
      <main class="loop" class:answering={app.cardState !== 'fresh'}><Card {app} /></main>
    {/if}
  {:else}
    <main class="text">
      {#if app.screen === 'loading'}
        <p class="muted">{app.copy.item('App labels', 'loading')}</p>
      {:else if app.screen === 'no-workshop'}
        <NotAWorkshop {app} />
      {:else if app.screen === 'welcome'}
        <Welcome {app} />
      {:else if app.screen === 'enter-code'}
        <EnterCode {app} />
      {:else if app.screen === 'intro-1' || app.screen === 'intro-2' || app.screen === 'consent'}
        <Intro {app} />
      {:else if app.screen === 'demo'}
        <DemoCard {app} />
      {:else if app.screen === 'session-end'}
        <SessionEnd {app} />
      {:else if app.screen === 'closed'}
        <Closed {app} />
      {:else if app.screen === 'about'}
        <About {app} />
      {:else if app.screen === 'terms' || app.screen === 'privacy'}
        <TextPage {app} />
      {/if}
    </main>
  {/if}
  {#if app.workshop && !onAPage}
    <footer class="foot">
      {#if phoneLoop}
        <button
          type="button"
          class="pill world"
          bind:this={worldPill}
          aria-label={fill(app.copy.item('Your world', 'pill label'), {
            n: app.world.tiles.length,
          })}
          onclick={() => app.openWorld()}
        >
          <svg
            aria-hidden="true"
            width="18"
            height="18"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            stroke-width="1.75"
            stroke-linecap="round"
            stroke-linejoin="round"
          >
            <rect x="3" y="7" width="15" height="13" rx="2.5" />
            <path d="M8 4h11a2 2 0 0 1 2 2v11" />
          </svg>
          {app.copy.item('Your world', 'title')}
          <span class="badge" aria-hidden="true">{app.world.tiles.length}</span>
        </button>
      {/if}
      <button type="button" class="link about" onclick={() => app.openAbout()}
        >{app.copy.item('Buttons', 'about')}</button
      >
    </footer>
  {/if}
  {#if app.worldOpen && !app.wide}
    <WorldSheet {app} returnTo={worldPill} />
  {/if}
</div>
