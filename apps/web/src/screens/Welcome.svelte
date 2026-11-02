<script lang="ts">
  import type { AppState } from '../lib/state.svelte.ts';

  /**
   * Welcome (docs/screen-map.md, Entry): two choices. "New here" needs a remembered wave or
   * invite; without one the screen says to open the link you were sent. "I have a code" is
   * always there.
   */
  let { app }: { app: AppState } = $props();
  const canJoin = $derived(Boolean(app.arrival.wave || app.arrival.invite));
</script>

<h1>{app.workshop?.config.name}</h1>
<p>{app.workshop?.config.purpose}</p>
<div class="row">
  {#if canJoin}
    <button class="primary" onclick={() => (app.screen = 'consent')}
      ><span>{app.copy.item('Buttons', 'new here')}</span></button
    >
  {:else}
    <p class="muted">{app.copy.text('Welcome: no link')}</p>
  {/if}
  <button onclick={() => (app.screen = 'enter-code')}
    >{app.copy.item('Buttons', 'i have a code')}</button
  >
</div>
