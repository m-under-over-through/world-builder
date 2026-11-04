<script lang="ts">
  import { MAX_ANSWER_CHARS } from '@wb/contracts';
  import { tick } from 'svelte';
  import { fill } from '../lib/copy.ts';
  import { finePointer } from '../lib/platform.ts';
  import { tintOf, type AppState } from '../lib/state.svelte.ts';
  import { reducedMotion, swipe, SWIPE_MS } from '../lib/swipe.ts';
  import { codePoints, truncateCodePoints } from '../lib/text.ts';

  /**
   * The stack (design/DESIGN.md, Layout and Components; ADR 0015): the front card and the two
   * behind it, each in a slot that keeps its element while the cards change places, so a card
   * moving one slot forward moves on the screen. While the stack is `fresh` the front card is
   * one button: tap, click or Enter opens it (`answering`), with the question as the label of
   * the field, the nudge, the counter near the limit, "Prefer to talk?" and Save. × closes it
   * and keeps the draft. The answered card leaves through `app.exiting`, drawn here on its way
   * out while the next card is already the front. Under the stack: Set aside, which makes the
   * card leave sideways before recording it, and on a phone the hint that a swipe does the
   * same (lib/swipe.ts).
   *
   * The dictation hint (architecture plan, section 7) sits inside the open card, where the
   * field is: by itself on the first card of the first session, and from "Prefer to talk?".
   */
  let { app }: { app: AppState } = $props();
  /** The counter shows from here (DESIGN.md: "near 4,000"), and in bold from `COUNTER_NEAR`. */
  const COUNTER_FROM = 3000;
  const COUNTER_NEAR = 3900;
  let leaving = $state(false);
  let field: HTMLTextAreaElement | undefined = $state();
  let front: HTMLButtonElement | undefined = $state();

  const count = $derived(codePoints(app.draft));
  const busy = $derived(app.cardState === 'saving');
  const open = $derived(app.cardState !== 'fresh');
  /** The cards on the screen, back to front, so the front one paints last. */
  const slots = $derived([
    ...app.backCards.map((b, i) => ({ ...b, slot: i + 1 })).reverse(),
    ...(app.card ? [{ card: app.card, n: app.cardNo, slot: 0 }] : []),
  ]);

  /** "03 of 4 · Everyday life", or "03 of 4" for a card without an area. */
  function label(n: number, area?: string): string {
    const parts = { n: String(n).padStart(2, '0'), total: app.queueLength };
    return area
      ? fill(app.copy.item('Card labels', 'position with area'), { ...parts, area })
      : fill(app.copy.item('Card labels', 'position'), parts);
  }

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
  }

  // The field takes focus when the card opens; the front card takes it when the card closes
  // or the next one comes, so the keyboard and the screen reader stay on the loop.
  let wasOpen = false;
  $effect(() => {
    const isOpen = app.cardState !== 'fresh';
    if (isOpen && !wasOpen) void tick().then(() => field?.focus());
    if (!isOpen && wasOpen) void tick().then(() => front?.focus());
    wasOpen = isOpen;
  });
</script>

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
          <span class="label">{label(entry.n, entry.card.area)}</span>
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
            >
              <circle cx="12" cy="12" r="3.5" />
              <path d="M4.5 12a7.5 7.5 0 0 1 2.2-5.3M19.5 12a7.5 7.5 0 0 1-2.2 5.3" />
            </svg>
            {app.copy.item('Card labels', finePointer() ? 'click to answer' : 'tap to answer')}
          </span>
        </button>
      {:else if entry.slot === 0}
        <div class="card open">
          <div class="head">
            <span class="label">{label(entry.n, entry.card.area)}</span>
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
            placeholder={app.copy.item('Card labels', 'placeholder')}
            aria-describedby="answer-nudge answer-count"></textarea>
          <div class="meta">
            <span id="answer-nudge">{app.copy.text('Card nudge')}</span>
            <span id="answer-count" class="count" class:near={count >= COUNTER_NEAR}>{counter}</span
            >
          </div>
          {#if app.error}
            <p class="error">
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
  {#if app.exiting}
    <div class="slot exit" aria-hidden="true" style:--tint={`var(--tint-${tintOf(app.exiting.n)})`}>
      <div class="card done">
        <span class="label">{label(app.exiting.n, app.exiting.card.area)}</span>
        <span class="question">{app.exiting.card.text}</span>
        <span class="answer">{app.exiting.answer}</span>
      </div>
    </div>
  {/if}
</div>
{#if !open && app.card}
  <div class="aside-row">
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
  </div>
{/if}
