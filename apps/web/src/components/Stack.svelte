<script module lang="ts">
  /** The counter shows from here (DESIGN.md: "near 4,000"), and in bold from `COUNTER_NEAR`; the blank card's too. */
  export const COUNTER_FROM = 3000;
  export const COUNTER_NEAR = 3900;
  /** The id of "Write your own story", so the open card can give the focus back to it (ADR 0022). */
  export const OWN_CARD_OPENER = 'own-card-open';
  /** The id of the world pill on a phone, where the focus goes back from a tile's open card (ADR 0024). */
  export const WORLD_PILL = 'world-pill';
</script>

<script lang="ts">
  import { tick } from 'svelte';
  import { tintOf, type AppState } from '../lib/state.svelte.ts';
  import { reducedMotion, swipe, SWIPE_MS } from '../lib/swipe.ts';
  import { codePoints } from '../lib/text.ts';

  /**
   * The stack (design/DESIGN.md, Layout and Components; ADR 0015): the front card and the two
   * behind it, each in a slot that keeps its element while the cards change places, so a card
   * moving one slot forward moves on the screen. The stack shows closed cards only (ADR 0027).
   * The front card is one button, labelled with its area and nothing else (no numbers, ADR
   * 0019), with the pen and "Write an answer" at its foot: tap, click or Enter opens it in the
   * open card (components/OpenCard.svelte), as every card opens. While it is open the front card
   * is lifted: its slot keeps its place and the cards behind stay, but the card is not drawn and
   * takes no tap and no focus. After a save the next card comes forward here, behind the open
   * card as it fades. Under the stack: Set aside, which makes the card leave sideways before
   * recording it, and on a phone the hint that a swipe does the same (lib/swipe.ts). Under
   * those, "Write your own story", a quiet text button that opens a new blank card in the open
   * card (ADR 0022): there whenever a round is live,
   * also under the thank-you card, and not while the onboarding card is in front. To move it, move
   * the one line that renders the snippet `ownCardButton`.
   *
   * On the first open the onboarding card is the front (`app.demoFront`, ADR 0019): tinted,
   * "Try a card" as its label, the words large, "Got it" at its foot; the first real cards
   * wait behind it in their tints. "Got it", a swipe or Set aside sends it away, and the first
   * card comes forward one slot, as any card does.
   */
  let { app }: { app: AppState } = $props();
  let leaving = $state(false);
  let front: HTMLButtonElement | undefined = $state();

  const busy = $derived(app.saving);
  /** The card in front is in the open card (ADR 0027): it is lifted from its slot meanwhile. */
  const lifted = $derived(app.writing !== null && app.openedFrom === 'front');
  /** With the onboarding card in front, every real card sits one slot further back. */
  const behind = $derived(app.demoFront ? 1 : 0);
  /** The real cards on the screen, back to front, so the front one paints last. */
  const slots = $derived([
    ...app.backCards
      .slice(0, 2 - behind)
      .map((b, i) => ({ ...b, slot: i + 1 + behind }))
      .reverse(),
    ...(app.card ? [{ card: app.card, n: app.cardNo, slot: behind }] : []),
  ]);

  /** The question's size by its length: larger when it fits in two lines, smaller when long (DESIGN.md, Content). */
  function sizeClass(text: string): string {
    const n = codePoints(text);
    return n <= 20 ? 'q-xl' : n > 64 ? 'q-s' : n > 50 ? 'q-m' : '';
  }

  /** The front card leaves sideways, then is recorded set aside; the onboarding card just goes. */
  async function setAside() {
    if (busy || leaving || app.cardOpen) return;
    leaving = true;
    if (!reducedMotion()) await app.wait(SWIPE_MS);
    leaving = false;
    await app.setAside();
  }

  /** Every card answered or out (ADR 0020): the thank-you card stands where the stack was. */
  const thanks = $derived(!app.card && !app.demoFront && Boolean(app.live?.deckDone));
  let thanksCard: HTMLDivElement | undefined = $state();

  // The front card takes the focus when the open card it was lifted into closes, and when the
  // onboarding card goes, so the keyboard and the screen reader stay on the loop. After a save
  // that is the next card, already in front. When the last card goes, the button that sent it
  // goes too (Save, Set aside), so the thank-you card takes the focus, and a screen reader reads
  // it. While a card is open the page is `inert` and refuses the focus, so a thank-you card that
  // came behind the open card takes it once the open card has gone (ADR 0027).
  let wasLifted = false;
  let wasDemo = false;
  let wasThanks = false;
  $effect(() => {
    const isLifted = lifted;
    const isDemo = app.demoFront;
    const isThanks = thanks;
    const open = app.cardOpen;
    if ((!isLifted && wasLifted) || (!isDemo && wasDemo))
      void tick().then(() => (front ?? thanksCard)?.focus());
    else if (isThanks && !wasThanks && !open) void tick().then(() => thanksCard?.focus());
    wasLifted = isLifted;
    wasDemo = isDemo;
    wasThanks = isThanks;
  });
</script>

{#snippet label(area: string | undefined)}
  {#if area}<span class="label">{area}</span>{:else}<span class="label" aria-hidden="true"
    ></span>{/if}
{/snippet}

<div class="stack">
  {#each slots as entry (entry.card.id)}
    <div class="slot slot-{entry.slot}" style:--tint={`var(--tint-${tintOf(entry.n)})`}>
      {#if entry.slot === 0}
        <button
          type="button"
          class="card front"
          class:leaving
          class:lifted
          bind:this={front}
          use:swipe={{
            onDismiss: () => app.setAside(),
            enabled: () => !busy && !leaving && !app.cardOpen,
          }}
          onclick={() => app.openCard()}
        >
          {@render label(entry.card.area)}
          <span class="question {sizeClass(entry.card.text)}">{entry.card.text}</span>
          <span class="affordance">
            <svg
              aria-hidden="true"
              width="18"
              height="18"
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
            {app.copy.item('Card labels', 'write an answer')}
          </span>
        </button>
      {:else}
        <div class="card back" aria-hidden="true"></div>
      {/if}
    </div>
  {/each}
  {#if app.demoFront}
    <div class="slot slot-0" style:--tint={`var(--tint-${tintOf(0)})`}>
      <div
        class="card front demo"
        class:leaving
        use:swipe={{ onDismiss: () => app.dismissDemo(), enabled: () => !leaving }}
      >
        <span class="label">{app.copy.item('Card labels', 'demo label')}</span>
        <p class="demo-words">{app.copy.text('Demo card')}</p>
        <button type="button" class="pill" disabled={leaving} onclick={setAside}
          >{app.copy.item('Buttons', 'got it')}</button
        >
      </div>
    </div>
  {/if}
  {#if thanks}
    <!-- The last card: every card answered or out (ADR 0020). Nothing to tap, nothing after it. -->
    <div class="slot slot-0" style:--tint={`var(--tint-${tintOf(1)})`}>
      <div class="card front thanks" role="note" tabindex="-1" bind:this={thanksCard}>
        <p class="demo-words">{app.copy.text('Thank you card')}</p>
      </div>
    </div>
  {/if}
</div>
{#snippet ownCardButton()}
  <button
    type="button"
    class="link own-open"
    id={OWN_CARD_OPENER}
    disabled={busy || leaving}
    onclick={() => app.openOwnCard()}>{app.copy.text('Own card: button')}</button
  >
{/snippet}

{#if app.card || app.demoFront || app.ownCardOffered}
  <div class="aside-row">
    {#if app.card || app.demoFront}
      <button type="button" class="ghost" disabled={busy || leaving} onclick={setAside}>
        {app.copy.item('Buttons', 'set aside')}
        <svg
          aria-hidden="true"
          width="18"
          height="18"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          stroke-width="1.75"
          stroke-linecap="round"
          stroke-linejoin="round"><path d="M5 12h14M13 6l6 6-6 6" /></svg
        >
      </button>
      <span class="swipe-hint">{app.copy.item('Card labels', 'swipe hint')}</span>
    {/if}
    {#if app.ownCardOffered}{@render ownCardButton()}{/if}
  </div>
{/if}
