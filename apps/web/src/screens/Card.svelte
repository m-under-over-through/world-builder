<script lang="ts">
  import Stack from '../components/Stack.svelte';
  import World from '../components/World.svelte';
  import { fill } from '../lib/copy.ts';
  import type { AppState } from '../lib/state.svelte.ts';
  import SessionEnd from './SessionEnd.svelte';

  /**
   * The card screen (docs/screen-map.md, Core loop; design/DESIGN.md; ADR 0015). On a phone
   * it is the stack (components/Stack.svelte); the world is a sheet behind the pill at the
   * foot, which App.svelte draws. From 600 pixels (`app.wide`) it is the page: the stack in
   * the left column, "Your world so far" in the right one with the tiles and the set-aside
   * row, and when the queue is done the session end in place of the stack. The columns are
   * flex-basis driven, so between about 600 and 1030 pixels they stack into one column, and
   * the page scrolls as one. The states of the card are the state's (`app.cardState`,
   * `app.toast`, `app.exiting`).
   */
  let { app }: { app: AppState } = $props();
  const world = $derived(app.world);
  const summary = $derived(
    fill(app.copy.item('Your world', 'summary'), {
      answered: world.tiles.length,
      aside: world.chips.length,
      left: world.left,
    }),
  );
</script>

{#if app.wide}
  <div class="page">
    <div class="col-stack">
      {#if app.screen === 'session-end'}
        <div class="text"><SessionEnd {app} /></div>
      {:else}
        <div class="loop" class:answering={app.cardState !== 'fresh'}><Stack {app} /></div>
      {/if}
    </div>
    <section class="col-world" aria-labelledby="world-title">
      <div class="world-head">
        <h2 id="world-title">{app.copy.item('Your world', 'title')}</h2>
        <span class="summary">{summary}</span>
      </div>
      <World {app} />
    </section>
  </div>
{:else}
  <Stack {app} />
{/if}
