<script lang="ts">
  import type { AppState } from '../lib/state.svelte.ts';

  /**
   * Intro 3, consent (docs/screen-map.md, First session): the copy plus "I understand", which
   * generates the code, joins, and starts the first session. Intro 1 and 2 come with item 4.
   */
  let { app }: { app: AppState } = $props();
</script>

<h1>{app.copy.item('Titles', 'consent')}</h1>
<p>{app.copy.text('Intro 3, consent')}</p>
{#if app.error}<p>{app.copy.error(app.error)}</p>{/if}
<div class="row">
  <button class="primary" onclick={() => app.join()}
    ><span>{app.copy.item('Buttons', 'i understand')}</span></button
  >
</div>
