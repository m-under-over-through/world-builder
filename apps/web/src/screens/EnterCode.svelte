<script lang="ts">
  import type { AppState } from '../lib/state.svelte.ts';

  /** Enter code (docs/screen-map.md, Entry): the 16 digits, then GET /me with them. */
  let { app }: { app: AppState } = $props();
  let codeInput = $state('');
</script>

<h1>{app.copy.item('Titles', 'enter code')}</h1>
<p>{app.copy.text('Enter code')}</p>
<input
  class="code"
  inputmode="numeric"
  autocomplete="off"
  placeholder="1234 5678 9012 3456"
  aria-label={app.copy.item('Titles', 'enter code')}
  bind:value={codeInput}
/>
{#if app.tooShort}<p>{app.copy.text('Enter code: too short')}</p>{/if}
{#if app.error}<p>{app.copy.error(app.error)}</p>{/if}
<div class="row">
  <button class="primary" onclick={() => app.continueWithCode(codeInput)}
    ><span>{app.copy.item('Buttons', 'continue')}</span></button
  >
  <button onclick={() => (app.screen = 'welcome')}>{app.copy.item('Buttons', 'back')}</button>
</div>
