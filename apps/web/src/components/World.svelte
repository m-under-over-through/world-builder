<script lang="ts">
  import { fill } from '../lib/copy.ts';
  import { tintOf, type AppState } from '../lib/state.svelte.ts';

  /**
   * "Your world so far" (ADR 0014, ADR 0015): one tile per answer, with the words where this
   * device wrote them and a quiet line where another device did; and the cards set aside in
   * this session as chips, with their questions. In the sheet the chips come before the tiles,
   * as the design draws it; in the laptop's column they come after. The chips carry no button:
   * "bring back" is a second stage (ADR 0015, Open).
   */
  let { app, sheet = false }: { app: AppState; sheet?: boolean } = $props();
  const world = $derived(app.world);

  /** "01 · Everyday life", or "01" for a card without an area. */
  function tileLabel(n: number, area?: string): string {
    const nn = String(n).padStart(2, '0');
    return area
      ? fill(app.copy.item('Your world', 'tile label'), { n: nn, area })
      : fill(app.copy.item('Your world', 'tile label without area'), { n: nn });
  }
</script>

{#snippet chips()}
  {#if world.chips.length > 0}
    <section class="world-section aside">
      <h3 class="section-label">{app.copy.item('Your world', 'set aside')}</h3>
      <ul class="chips">
        {#each world.chips as chip (chip.cardId)}
          <li class="chip">{chip.question}</li>
        {/each}
      </ul>
    </section>
  {/if}
{/snippet}

{#snippet tiles()}
  <section class="world-section answered">
    {#if sheet}
      <h3 class="section-label">{app.copy.item('Your world', 'answered')}</h3>
    {/if}
    {#if world.tiles.length === 0}
      <p class="empty">{app.copy.item('Your world', sheet ? 'empty' : 'empty laptop')}</p>
    {:else}
      <ul class="tiles">
        {#each world.tiles as tile (tile.key)}
          <li class="tile" style:--tint={`var(--tint-${tintOf(tile.n)})`}>
            <span class="label">{tileLabel(tile.n, tile.area)}</span>
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
{/snippet}

{#if sheet}
  {@render chips()}
  {@render tiles()}
{:else}
  {@render tiles()}
  {@render chips()}
{/if}
