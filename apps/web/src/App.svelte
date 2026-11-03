<script lang="ts">
  import { onMount } from 'svelte';
  import { AppState } from './lib/state.svelte.ts';
  import Card from './screens/Card.svelte';
  import Closed from './screens/Closed.svelte';
  import DemoCard from './screens/DemoCard.svelte';
  import EnterCode from './screens/EnterCode.svelte';
  import Intro from './screens/Intro.svelte';
  import NotAWorkshop from './screens/NotAWorkshop.svelte';
  import PrivacyPanel from './screens/PrivacyPanel.svelte';
  import SessionEnd from './screens/SessionEnd.svelte';
  import TextPage from './screens/TextPage.svelte';
  import Trust from './screens/Trust.svelte';
  import Welcome from './screens/Welcome.svelte';

  /**
   * The client: one component per screen of docs/screen-map.md under src/screens/, the state and
   * everything that changes it in lib/state.svelte.ts, and this file, which reads the address on
   * open and shows the screen the state says. Every word comes from the workshop's copy.md.
   */
  // A test may hand in its own state (with an instant `wait`); the app makes one.
  let { app = new AppState() }: { app?: AppState } = $props();

  onMount(() => {
    // Chrome's own install offer, if it makes one: kept for the install prompt (lib/install.ts).
    const keep = (event: Event) => {
      event.preventDefault();
      app.installOffer = event as AppState['installOffer'];
    };
    window.addEventListener('beforeinstallprompt', keep);
    // The network is back: the outbox goes out now, not at the retry timer's next tick.
    const online = () => void app.reconnected();
    window.addEventListener('online', online);
    void app.open(location.pathname);
    return () => {
      window.removeEventListener('beforeinstallprompt', keep);
      window.removeEventListener('online', online);
    };
  });
</script>

<main>
  <nav>
    <span>{app.workshop?.config.name ?? app.copy.item('App labels', 'app name')}</span>
    {#if app.screen !== 'loading' && app.screen !== 'no-workshop' && app.screen !== 'panel'}
      <button onclick={() => app.openPanel()}>{app.copy.item('Buttons', 'privacy')}</button>
    {/if}
  </nav>

  {#if app.storageUnavailable}
    <p class="warning" role="status">{app.copy.error('CLIENT_STORAGE_UNAVAILABLE')}</p>
  {/if}
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
  {:else if app.screen === 'card'}
    <Card {app} />
  {:else if app.screen === 'session-end'}
    <SessionEnd {app} />
  {:else if app.screen === 'closed'}
    <Closed {app} />
  {:else if app.screen === 'panel'}
    <PrivacyPanel {app} />
  {:else if app.screen === 'trust'}
    <Trust {app} />
  {:else if app.screen === 'terms' || app.screen === 'privacy'}
    <TextPage {app} />
  {/if}
  {#if app.workshop && app.screen !== 'trust' && app.screen !== 'terms' && app.screen !== 'privacy'}
    <footer class="muted">
      <button class="link" onclick={() => app.openPage('trust')}
        >{app.copy.item('Buttons', 'trust page')}</button
      >
      <button class="link" onclick={() => app.openPage('terms')}
        >{app.copy.item('Trust page links', 'terms')}</button
      >
      <button class="link" onclick={() => app.openPage('privacy')}
        >{app.copy.item('Trust page links', 'privacy policy')}</button
      >
    </footer>
  {/if}
</main>
