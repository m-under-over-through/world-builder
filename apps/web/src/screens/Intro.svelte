<script lang="ts">
  import type { AppState } from '../lib/state.svelte.ts';

  /**
   * The intro (docs/screen-map.md, First session; architecture plan 8.1): three screens at
   * most. Intro 1 and 2 are copy with Back and Next; Intro 3 is the consent, with "I understand",
   * which generates the code, joins, and starts the first session. Back on Intro 1 is the welcome.
   */
  let { app }: { app: AppState } = $props();
  const step = $derived(app.screen === 'intro-1' ? 1 : app.screen === 'intro-2' ? 2 : 3);

  function back() {
    if (step === 1) app.screen = 'welcome';
    else if (step === 2) app.screen = 'intro-1';
    else app.screen = 'intro-2';
  }
</script>

{#if step === 1}
  <h1>{app.copy.item('Titles', 'intro 1')}</h1>
  <p>{app.copy.text('Intro 1')}</p>
  <div class="row">
    <button class="primary" onclick={() => (app.screen = 'intro-2')}
      ><span>{app.copy.item('Buttons', 'next')}</span></button
    >
    <button onclick={back}>{app.copy.item('Buttons', 'back')}</button>
  </div>
{:else if step === 2}
  <h1>{app.copy.item('Titles', 'intro 2')}</h1>
  <p>{app.copy.text('Intro 2')}</p>
  <div class="row">
    <button class="primary" onclick={() => (app.screen = 'consent')}
      ><span>{app.copy.item('Buttons', 'next')}</span></button
    >
    <button onclick={back}>{app.copy.item('Buttons', 'back')}</button>
  </div>
{:else}
  <h1>{app.copy.item('Titles', 'consent')}</h1>
  <p>{app.copy.text('Intro 3, consent')}</p>
  {#if app.error}<p>{app.copy.error(app.error)}</p>{/if}
  {#if app.retrying}<p class="muted">{app.copy.item('App labels', 'retrying')}</p>{/if}
  <div class="row">
    <button class="primary" onclick={() => app.join()} disabled={app.joining}
      ><span>{app.copy.item('Buttons', 'i understand')}</span></button
    >
    <button onclick={back}>{app.copy.item('Buttons', 'back')}</button>
  </div>
{/if}
