<script lang="ts">
  import { onMount, tick } from 'svelte';
  import Invitations from './components/Invitations.svelte';
  import OwnCard from './components/OwnCard.svelte';
  import { WORLD_PILL } from './components/Stack.svelte';
  import WorldSheet from './components/WorldSheet.svelte';
  import { fill } from './lib/copy.ts';
  import { AppState } from './lib/state.svelte.ts';
  import { followViewport } from './lib/viewport.ts';
  import About from './screens/About.svelte';
  import Card from './screens/Card.svelte';
  import Closed from './screens/Closed.svelte';
  import NotAWorkshop from './screens/NotAWorkshop.svelte';
  import TextPage from './screens/TextPage.svelte';
  import Welcome from './screens/Welcome.svelte';

  /**
   * The client: one component per screen of docs/screen-map.md under src/screens/, the state and
   * everything that changes it in lib/state.svelte.ts, and this file, which reads the address on
   * open and shows the screen the state says. Every word comes from the workshop's copy.md.
   *
   * The shell is the design's (design/DESIGN.md, Layout) as ADR 0023 changed it: the header, the
   * same on every screen and at every width, with the app's name and the organizer on the left
   * and on the right a round "?" that opens the one page about the app (ADR 0013), named "About
   * this app" for a screen reader; on the laptop's card screen the count of cards answered so far
   * sits to its left (no numbers of a round, no strip, no toast: ADR 0019). The about page, the
   * terms and the policy have their Back and no "?". Then the screen; and on a phone's card
   * screen only, a foot with the pill that opens "Your world so far" (ADR 0015). No other screen
   * has a foot.
   */
  // A test may hand in its own state (with an instant `wait`); the app makes one.
  let { app = new AppState() }: { app?: AppState } = $props();
  /**
   * The "?" in the header: on every screen of a workshop but the about page, the terms and the
   * policy, which have Back (ADR 0023). Not while the app is loading, and not on an address that
   * is not a workshop: there is no page about a workshop to open there.
   */
  const aboutMark = $derived(
    Boolean(app.workshop) &&
      app.screen !== 'loading' &&
      app.screen !== 'about' &&
      app.screen !== 'terms' &&
      app.screen !== 'privacy',
  );
  /** The core loop: the card screen, where rounds follow one another without a screen between them (ADR 0017). */
  const loop = $derived(app.screen === 'card');
  const phoneLoop = $derived(loop && !app.wide);
  let worldPill: HTMLButtonElement | undefined = $state();
  /**
   * While the sheet is open on a phone, the page behind it is `inert`: no tap, no Tab and no
   * screen-reader swipe reaches it. `aria-modal` says the same, but not every screen reader
   * honours it, so the page says it too (design/DESIGN.md, Accessibility). The hidden line for
   * the screen reader stays outside, so it can still speak. The same holds while the place to
   * write a blank card is open, on a phone and on a laptop alike (ADR 0022).
   */
  const ownCardShown = $derived(app.ownCardOpen && app.ownCardOffered);
  const behindSheet = $derived((app.worldOpen && !app.wide) || ownCardShown);

  /**
   * The open card above the keyboard (ADR 0023; lib/viewport.ts). While a card or the blank card
   * is open on a phone, the app's root carries the visual viewport's height and top, and the
   * stylesheet makes the open card's frame that box (`framed`), with a strip free under it while
   * the keyboard is up (`keyboard-up`), where Safari floats its address bar. Where the browser
   * has no visual viewport nothing is set and the card is laid out as before. When the card
   * closes the page goes back to where it was, in case the browser scrolled it for the field.
   */
  let root: HTMLDivElement | undefined = $state();
  let framed = $state(false);
  let keyboardIsUp = $state(false);
  const writing = $derived(!app.wide && ((loop && app.cardState !== 'fresh') || ownCardShown));
  $effect(() => {
    if (!writing || !root) return;
    const scrolled = window.scrollY;
    const stop = followViewport(root, { onChange: (frame) => (keyboardIsUp = frame.keyboard) });
    if (!stop) return;
    framed = true;
    return () => {
      stop();
      framed = false;
      keyboardIsUp = false;
      if (window.scrollY !== scrolled) window.scrollTo(0, scrolled);
    };
  });

  /**
   * A screen that replaces another takes the button that was pressed with it ("I understand",
   * "About this app", Back), and the focus would fall to the top of the document. Once the new
   * screen is drawn, focus goes to its title, the one h1, so a screen reader starts there and
   * a keyboard goes on from there. Not on the first screen after the open, and not when the
   * new screen has put the focus somewhere itself (the open card puts it in the field).
   */
  let shown: string | undefined;
  $effect(() => {
    const now = app.screen;
    const before = shown;
    shown = now;
    if (before === undefined || before === 'loading' || before === now) return;
    void tick().then(() => {
      const active = document.activeElement;
      if (active && active !== document.body) return;
      const title = document.querySelector<HTMLElement>('h1');
      if (!title) return;
      title.tabIndex = -1;
      title.focus();
    });
  });
  /** "6 answered": the figure large and the words around it small, the words from copy.md. */
  const answeredSoFar = $derived.by(() => {
    const [before = '', after = ''] = app.copy.item('Your world', 'answered so far').split('[n]');
    return { before, n: app.world.tiles.length, after };
  });

  onMount(() => {
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
      window.removeEventListener('online', online);
      stopWide();
    };
  });
</script>

<div
  class="app"
  class:wide={app.wide}
  class:phone-loop={phoneLoop}
  class:framed
  class:keyboard-up={keyboardIsUp}
  bind:this={root}
>
  <header class="topbar" inert={behindSheet || framed}>
    <div class="lines">
      <!-- The card screen has no title of its own, so the app's name is its h1; every other
           screen has its title in the page, and the name is a line here. -->
      {#if loop}
        <h1 class="name">{app.copy.item('App labels', 'app name')}</h1>
      {:else}
        <span class="name">{app.copy.item('App labels', 'app name')}</span>
      {/if}
      {#if app.workshop}<span class="organizer">{app.workshop.config.organizer}</span>{/if}
    </div>
    {#if (app.wide && loop && app.live) || aboutMark}
      <div class="end">
        {#if app.wide && loop && app.live}
          <p class="answered-so-far">
            <svg
              aria-hidden="true"
              width="16"
              height="16"
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
            {#if answeredSoFar.before}<span class="words">{answeredSoFar.before}</span>{/if}<span
              class="figure">{answeredSoFar.n}</span
            ><span class="words">{answeredSoFar.after}</span>
          </p>
        {/if}
        {#if aboutMark}
          <button
            type="button"
            class="about-mark"
            aria-label={app.copy.item('Buttons', 'about')}
            onclick={() => app.openAbout()}><span aria-hidden="true">?</span></button
          >
        {/if}
      </div>
    {/if}
  </header>

  {#if app.storageUnavailable}
    <p class="warning" role="status" inert={behindSheet}>
      {app.copy.error('CLIENT_STORAGE_UNAVAILABLE')}
    </p>
  {/if}
  {#if loop}
    <p class="sr-only" aria-live="polite">
      {#key app.announcement.n}{app.announcement.text}{/key}
    </p>
    {#if app.wide}
      <main class="page-main" inert={behindSheet}><Card {app} /></main>
    {:else}
      <main class="loop" class:answering={app.cardState !== 'fresh'} inert={behindSheet}>
        <Card {app} />
      </main>
    {/if}
  {:else}
    <main class="text">
      {#if app.screen === 'loading'}
        <p class="muted">{app.copy.item('App labels', 'loading')}</p>
      {:else if app.screen === 'no-workshop'}
        <NotAWorkshop {app} />
      {:else if app.screen === 'welcome'}
        <Welcome {app} />
      {:else if app.screen === 'closed'}
        <Closed {app} />
      {:else if app.screen === 'about'}
        <About {app} />
      {:else if app.screen === 'terms' || app.screen === 'privacy'}
        <TextPage {app} />
      {:else if app.screen === 'invitations'}
        <Invitations {app} />
      {/if}
    </main>
  {/if}
  {#if app.workshop && phoneLoop}
    <footer class="foot" inert={behindSheet || framed}>
      <button
        type="button"
        class="pill world"
        id={WORLD_PILL}
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
    </footer>
  {/if}
  {#if app.worldOpen && !app.wide}
    <WorldSheet {app} returnTo={worldPill} />
  {/if}
  {#if ownCardShown}
    <OwnCard {app} />
  {/if}
</div>
