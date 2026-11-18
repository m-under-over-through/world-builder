<script module lang="ts">
  /** The counter shows from here (DESIGN.md: "near 4,000"), and in bold from `COUNTER_NEAR`; the blank card's too. */
  export const COUNTER_FROM = 3000;
  export const COUNTER_NEAR = 3900;
  /** The id of "Write your own story", so the place to write can give the focus back to it (ADR 0022). */
  export const OWN_CARD_OPENER = 'own-card-open';
</script>

<script lang="ts">
  import { MAX_ANSWER_CHARS } from '@wb/contracts';
  import { tick } from 'svelte';
  import { fill } from '../lib/copy.ts';
  import { tintOf, type AppState } from '../lib/state.svelte.ts';
  import { reducedMotion, swipe, SWIPE_MS } from '../lib/swipe.ts';
  import { codePoints, truncateCodePoints } from '../lib/text.ts';
  import { growField, keepEndInView } from '../lib/viewport.ts';

  /**
   * The stack (design/DESIGN.md, Layout and Components; ADR 0015): the front card and the two
   * behind it, each in a slot that keeps its element while the cards change places, so a card
   * moving one slot forward moves on the screen. While the stack is `fresh` the front card is
   * one button, labelled with its area and nothing else (no numbers, ADR 0019), with the pen
   * and "Write an answer" at its foot: tap, click or Enter opens it (`answering`), with the
   * question as the label of the field, the counter near the limit, "Prefer to talk?" and Save.
   * × closes it and keeps the draft. The answered card leaves through `app.exiting`, drawn here
   * on its way out while the next card is already the front. Under the stack: Set aside, which
   * makes the card leave sideways before recording it, and on a phone the hint that a swipe
   * does the same (lib/swipe.ts). Under those, "Write your own story", a quiet text button that
   * opens the blank card (ADR 0022; components/OwnCard.svelte): there whenever a round is live,
   * also under the thank-you card, and not while the onboarding card is in front. To move it, move
   * the one line that renders the snippet `ownCardButton`.
   *
   * On the first open the onboarding card is the front (`app.demoFront`, ADR 0019): tinted,
   * "Try a card" as its label, the words large, "Got it" at its foot; the first real cards
   * wait behind it in their tints. "Got it", a swipe or Set aside sends it away, and the first
   * card comes forward one slot, as any card does.
   *
   * The dictation hint (architecture plan, section 7) sits inside the open card, where the
   * field is: by itself on the first card of the first session, and from "Prefer to talk?".
   *
   * On a phone the open card is framed by what the keyboard leaves visible (ADR 0023; App.svelte
   * and lib/viewport.ts): the field grows with the text, and the card scrolls, with "Save" at
   * its end. On a laptop the field keeps its height and nothing of that applies.
   */
  let { app }: { app: AppState } = $props();
  let leaving = $state(false);
  let field: HTMLTextAreaElement | undefined = $state();
  let front: HTMLButtonElement | undefined = $state();
  let openCard: HTMLDivElement | undefined = $state();

  const count = $derived(codePoints(app.draft));
  const busy = $derived(app.cardState === 'saving');
  const open = $derived(app.cardState !== 'fresh');
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

  const counter = $derived(
    count >= COUNTER_FROM
      ? fill(app.copy.item('Card labels', 'counter'), {
          n: count.toLocaleString('en-US'),
          max: MAX_ANSWER_CHARS.toLocaleString('en-US'),
        })
      : '',
  );

  /** The front card leaves sideways, then is recorded set aside; the onboarding card just goes. */
  async function setAside() {
    if (busy || leaving || open) return;
    leaving = true;
    if (!reducedMotion()) await app.wait(SWIPE_MS);
    leaving = false;
    await app.setAside();
  }

  /** Past the limit the input is refused, never cut: a cut could split an emoji (CRYPTO_BAD_TEXT). */
  function onInput(event: Event) {
    const el = event.currentTarget as HTMLTextAreaElement;
    if (codePoints(el.value) > MAX_ANSWER_CHARS)
      el.value = truncateCodePoints(el.value, MAX_ANSWER_CHARS);
    app.draft = el.value;
    if (!app.wide) {
      growField(el);
      keepEndInView(el, openCard ?? null);
    }
  }

  /** Every card answered or out (ADR 0020): the thank-you card stands where the stack was. */
  const thanks = $derived(!app.card && !app.demoFront && Boolean(app.live?.deckDone));
  let thanksCard: HTMLDivElement | undefined = $state();

  // The field takes focus when the card opens; the front card takes it when the card closes
  // or the onboarding card goes, so the keyboard and the screen reader stay on the loop. When
  // the last card goes, the button that sent it goes too (Save, Set aside), so the thank-you
  // card takes the focus, and a screen reader reads it.
  let wasOpen = false;
  let wasDemo = false;
  let wasThanks = false;
  $effect(() => {
    const isOpen = app.cardState !== 'fresh';
    const isDemo = app.demoFront;
    const isThanks = thanks;
    if (isOpen && !wasOpen)
      void tick().then(() => {
        // A draft kept from before: the field is as tall as its text from the start (ADR 0023).
        if (field && !app.wide) growField(field);
        field?.focus();
      });
    if ((!isOpen && wasOpen) || (!isDemo && wasDemo)) void tick().then(() => front?.focus());
    if (isThanks && !wasThanks) void tick().then(() => thanksCard?.focus());
    wasOpen = isOpen;
    wasDemo = isDemo;
    wasThanks = isThanks;
  });
</script>

{#snippet label(area: string | undefined)}
  {#if area}<span class="label">{area}</span>{:else}<span class="label" aria-hidden="true"
    ></span>{/if}
{/snippet}

<div class="stack" class:answering={open}>
  {#each slots as entry (entry.card.id)}
    <div class="slot slot-{entry.slot}" style:--tint={`var(--tint-${tintOf(entry.n)})`}>
      {#if entry.slot === 0 && !open}
        <button
          type="button"
          class="card front"
          class:leaving
          bind:this={front}
          use:swipe={{
            onDismiss: () => app.setAside(),
            enabled: () => !busy && !leaving && !open,
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
      {:else if entry.slot === 0}
        <div class="card open" bind:this={openCard}>
          <div class="head">
            {@render label(entry.card.area)}
            <button
              type="button"
              class="close"
              aria-label={app.copy.item('Card labels', 'close without saving')}
              disabled={busy}
              onclick={() => app.closeCard()}
            >
              <svg
                aria-hidden="true"
                width="16"
                height="16"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                stroke-width="2"
                stroke-linecap="round"><path d="M6 6l12 12M18 6 6 18" /></svg
              >
            </button>
          </div>
          <label for="answer">{entry.card.text}</label>
          <div class="rule"></div>
          <textarea
            id="answer"
            bind:this={field}
            value={app.draft}
            oninput={onInput}
            disabled={busy}
            aria-describedby={app.error ? 'answer-count answer-error' : 'answer-count'}></textarea>
          <div class="meta">
            <span id="answer-count" class="count" class:near={count >= COUNTER_NEAR}>{counter}</span
            >
          </div>
          {#if app.error}
            <!-- Said at once when Save fails, and again as the field's description (WCAG 4.1.3). -->
            <p class="error" id="answer-error" role="alert">
              {app.copy.item('Card labels', 'could not save')}
              {app.copy.error(app.error)}
            </p>
          {/if}
          {#if app.platform && app.hintOpen}
            <aside class="hint">
              <h2>{app.copy.item('Titles', 'dictation hint')}</h2>
              <p>{app.copy.item('Dictation hint', app.platform)}</p>
              <button type="button" onclick={() => (app.hintOpen = false)}
                >{app.copy.item('Buttons', 'got it')}</button
              >
            </aside>
          {/if}
          <div class="actions">
            {#if app.platform && !app.hintOpen}
              <button type="button" class="talk" onclick={() => (app.hintOpen = true)}>
                <svg
                  aria-hidden="true"
                  width="16"
                  height="16"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  stroke-width="1.75"
                  stroke-linecap="round"
                >
                  <rect x="9" y="3" width="6" height="11" rx="3" />
                  <path d="M5 11a7 7 0 0 0 14 0M12 18v3" />
                </svg>
                {app.copy.item('Buttons', 'prefer to talk')}
              </button>
            {:else}
              <span></span>
            {/if}
            <button
              type="button"
              class="pill save"
              class:busy
              disabled={busy || !app.draft.trim()}
              onclick={() => app.save()}
              >{busy
                ? app.copy.item('Card states', 'saving')
                : app.copy.item('Buttons', 'save')}</button
            >
          </div>
        </div>
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
  {#if app.exiting}
    <div class="slot exit" aria-hidden="true" style:--tint={`var(--tint-${tintOf(app.exiting.n)})`}>
      <div class="card done">
        {@render label(app.exiting.card.area)}
        <span class="question">{app.exiting.card.text}</span>
        <span class="answer">{app.exiting.answer}</span>
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

{#if !open && (app.card || app.demoFront || app.ownCardOffered)}
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
