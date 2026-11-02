<script lang="ts">
  import type { AppState } from '../lib/state.svelte.ts';

  /**
   * The demo card (docs/screen-map.md, First session): a card that explains tap-to-answer and
   * swipe-to-set-aside, shown once before the first real card and never recorded. "Got it"
   * goes to the first card.
   */
  let { app }: { app: AppState } = $props();
</script>

<h1>{app.copy.item('Titles', 'demo card')}</h1>
<div class="card">
  <p class="question">{app.copy.text('Demo card')}</p>
  <div class="row">
    <button class="primary" onclick={() => app.dismissDemo()}
      ><span>{app.copy.item('Buttons', 'got it')}</span></button
    >
  </div>
</div>
