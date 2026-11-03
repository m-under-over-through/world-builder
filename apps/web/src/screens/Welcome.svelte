<script lang="ts">
  import type { AppState } from '../lib/state.svelte.ts';

  /**
   * Welcome (docs/screen-map.md, Entry), worded for the three cases a person can be in (build
   * log, 29 October 2026): arrived through a link, so "New here" can start; has a code from an
   * earlier session on another phone, so the small "I have a code" link under it continues;
   * neither, so the screen says to open the link you were sent. The first and the third exclude
   * each other; the second is always there. When the code this phone remembered was refused on
   * open (the failure behaviour's AUTH_CODE_UNKNOWN path), one quiet line says so, and nothing
   * else on the screen changes.
   */
  let { app }: { app: AppState } = $props();
  const canJoin = $derived(Boolean(app.arrival.wave || app.arrival.invite));
</script>

<h1>{app.workshop?.config.name}</h1>
<p>{app.workshop?.config.purpose}</p>
{#if app.codeRefused}
  <p class="muted" role="status">{app.copy.text('Welcome: code not accepted')}</p>
{/if}
<section>
  {#if canJoin}
    <p>{app.copy.text('Welcome: new here')}</p>
    <button class="primary" onclick={() => (app.screen = 'intro-1')}
      ><span>{app.copy.item('Buttons', 'new here')}</span></button
    >
  {:else}
    <p>{app.copy.text('Welcome: no link')}</p>
  {/if}
  <p class="muted aside">
    {app.copy.text('Welcome: I have a code')}
    <button class="link" onclick={() => app.navigate('continue')}
      >{app.copy.item('Buttons', 'i have a code')}</button
    >
  </p>
</section>
