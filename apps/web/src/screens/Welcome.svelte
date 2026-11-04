<script lang="ts">
  import type { AppState } from '../lib/state.svelte.ts';

  /**
   * Welcome (docs/screen-map.md, Entry), worded for the cases a person can be in: arrived through
   * a link with a value of its own (ADR 0018), so "This link is yours" and "New here"; arrived
   * through a link without one, so "New here" alone; neither, so the screen says to open the link
   * you were sent. There is no code to type: a link's value is the way back. When the code this
   * phone remembered was refused on open (the failure behaviour's AUTH_CODE_UNKNOWN path), one
   * quiet line says so, and nothing else on the screen changes.
   */
  let { app }: { app: AppState } = $props();
  const yourLink = $derived(Boolean(app.linkCode));
  const canJoin = $derived(Boolean(yourLink || app.arrival.wave || app.arrival.invite));
</script>

<h1>{app.workshop?.config.name}</h1>
<p>{app.workshop?.config.purpose}</p>
{#if app.codeRefused}
  <p class="muted" role="status">{app.copy.text('Welcome: link not accepted')}</p>
{/if}
<section>
  {#if canJoin}
    <p>{app.copy.text(yourLink ? 'Welcome: your link' : 'Welcome: new here')}</p>
    <button class="primary" onclick={() => (app.screen = 'intro-1')}
      ><span>{app.copy.item('Buttons', 'new here')}</span></button
    >
  {:else}
    <p>{app.copy.text('Welcome: no link')}</p>
  {/if}
</section>
