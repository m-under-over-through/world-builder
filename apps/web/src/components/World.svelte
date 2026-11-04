<script lang="ts">
  import { reminderHref } from '../lib/reminder.ts';
  import { tintOf, type AppState } from '../lib/state.svelte.ts';

  /**
   * "Your world so far" (ADR 0014, ADR 0015, ADR 0019): one tile per answer, with the words
   * where this device wrote them and a quiet line where another device did; then, under "Set
   * aside", the cards set aside in this round as tiles of the same size, white with a line
   * instead of a tint and without an answer. A tile's label is its card's area, never a number.
   * The same order in the sheet and in the laptop's column. With no answer yet, one quiet notice
   * in the place of the first tile, the size of a tile, so nothing jumps when the first one
   * lands. Under it all, in the sheet and in the column, a quiet line with "Remind me", the
   * workshop's calendar file (lib/reminder.ts; ADR 0017).
   */
  let { app, sheet = false }: { app: AppState; sheet?: boolean } = $props();
  const world = $derived(app.world);
</script>

<section class="world-section answered">
  {#if sheet}
    <h3 class="section-label">{app.copy.item('Your world', 'answered')}</h3>
  {/if}
  {#if world.tiles.length === 0}
    <div class="tiles">
      <p class="world-empty">{app.copy.item('Your world', sheet ? 'empty' : 'empty laptop')}</p>
    </div>
  {:else}
    <ul class="tiles">
      {#each world.tiles as tile (tile.key)}
        <li class="tile" style:--tint={`var(--tint-${tintOf(tile.n)})`}>
          {#if tile.area}<span class="label">{tile.area}</span>{/if}
          <span class="q">{tile.question}</span>
          {#if tile.answer === null}
            <span class="a elsewhere">{app.copy.item('Your world', 'written elsewhere')}</span>
          {:else}
            <span class="a">{tile.answer}</span>
          {/if}
        </li>
      {/each}
    </ul>
  {/if}
</section>
{#if world.aside.length > 0}
  <section class="world-section aside">
    <h3 class="section-label">{app.copy.item('Your world', 'set aside')}</h3>
    <ul class="tiles">
      {#each world.aside as tile (tile.cardId)}
        <li class="tile aside">
          {#if tile.area}<span class="label">{tile.area}</span>{/if}
          <span class="q">{tile.question}</span>
        </li>
      {/each}
    </ul>
  </section>
{/if}
{#if app.workshop}
  <p class="remind">
    {app.copy.text('Remind me')}
    <a href={reminderHref(app.workshop.config.slug)}>{app.copy.item('Buttons', 'remind me')}</a>
  </p>
{/if}
