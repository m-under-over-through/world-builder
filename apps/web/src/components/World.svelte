<script lang="ts">
  import { reminderHref } from '../lib/reminder.ts';
  import { tintOf, type AppState, type WorldTile } from '../lib/state.svelte.ts';

  /**
   * "Your world so far" (ADR 0014, ADR 0015, ADR 0019): one tile per answer, with the words
   * where this device wrote them and a quiet line where another device did; then, under "Set
   * aside", the cards set aside as tiles of the same size, white with a line
   * instead of a tint and without an answer. A tile's label is its card's area, never a number.
   * The same order in the sheet and in the laptop's column. With no answer yet, one quiet notice
   * in the place of the first tile, the size of a tile, so nothing jumps when the first one
   * lands. Under it all, in the sheet and in the column, a quiet line with "Remind me", the
   * workshop's calendar file (lib/reminder.ts; ADR 0017). A blank card (ADR 0022) is a tile
   * with no question and no tint: its label is the copy file's "Own card: tile", then the words.
   *
   * A tile opens (ADR 0024): it is a button, named by what it shows and then by the words of its
   * small pen, and a tap opens that card in the open card (components/OpenCard.svelte, ADR 0027).
   * A card set aside, in any round, always opens; an answer or a blank card opens where this
   * device holds the words of its latest version. A tile written on another device stays as it
   * was, not a button. One tile per card: it stands where the first answer put it. While its card
   * is open the tile is lifted: its place in the list stays, but it is not drawn.
   */
  let { app, sheet = false }: { app: AppState; sheet?: boolean } = $props();
  const world = $derived(app.world);
  /**
   * The tile of the card that is open, lifted meanwhile (ADR 0027), from wherever the card was
   * opened: a card set aside that has come round has a tile here and is the card in front too.
   */
  const lifted = (cardId: string) => app.writing === cardId;
</script>

{#snippet pen(words: string)}
  <!-- The small pen of the front card's "Write an answer", so a tile reads as something to tap;
       its words are said after what the tile shows (ADR 0024). -->
  <svg
    class="pen"
    aria-hidden="true"
    width="14"
    height="14"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    stroke-width="1.75"
    stroke-linecap="round"
    stroke-linejoin="round"
  >
    <path d="M12 20h9" />
    <path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4Z" />
  </svg>
  <span class="sr-only">{words}</span>
{/snippet}

{#snippet answerBody(tile: WorldTile)}
  {#if tile.own}
    <span class="label">{app.copy.text('Own card: tile')}</span>
  {:else}
    {#if tile.area}<span class="label">{tile.area}</span>{/if}
    <span class="q">{tile.question}</span>
  {/if}
  {#if tile.answer === null}
    <span class="a elsewhere">{app.copy.item('Your world', 'written elsewhere')}</span>
  {:else}
    <span class="a">{tile.answer}</span>
  {/if}
{/snippet}

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
        {#if tile.opens}
          <li class="tile-item">
            <button
              type="button"
              class="tile opens"
              class:own={tile.own}
              class:lifted={lifted(tile.cardId)}
              data-tile={tile.cardId}
              style:--tint={tile.own ? undefined : `var(--tint-${tintOf(tile.n)})`}
              onclick={() => app.openTile(tile.cardId)}
            >
              {@render answerBody(tile)}
              {@render pen(app.copy.item('Your world', 'open answer'))}
            </button>
          </li>
        {:else}
          <!-- Written on another device: nothing here to change, so not a button (ADR 0024). -->
          <li
            class="tile"
            class:own={tile.own}
            style:--tint={tile.own ? undefined : `var(--tint-${tintOf(tile.n)})`}
          >
            {@render answerBody(tile)}
          </li>
        {/if}
      {/each}
    </ul>
  {/if}
</section>
{#if world.aside.length > 0}
  <section class="world-section aside">
    <h3 class="section-label">{app.copy.item('Your world', 'set aside')}</h3>
    <ul class="tiles">
      {#each world.aside as tile (tile.cardId)}
        <li class="tile-item">
          <button
            type="button"
            class="tile aside opens"
            class:lifted={lifted(tile.cardId)}
            data-tile={tile.cardId}
            onclick={() => app.openTile(tile.cardId)}
          >
            {#if tile.area}<span class="label">{tile.area}</span>{/if}
            <span class="q">{tile.question}</span>
            {@render pen(app.copy.item('Your world', 'open aside'))}
          </button>
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
