<script lang="ts">
  import { MAX_ANSWER_CHARS } from '@wb/contracts';
  import { onMount, tick } from 'svelte';
  import { fill } from '../lib/copy.ts';
  import type { AppState } from '../lib/state.svelte.ts';
  import { codePoints, truncateCodePoints } from '../lib/text.ts';
  import { COUNTER_FROM, COUNTER_NEAR, OWN_CARD_OPENER, WORLD_PILL } from './Stack.svelte';

  /**
   * The open card (ADR 0027): the one place every card opens in. The card in front of the stack,
   * a card set aside, an answer and a blank card all open here, with the same parts in the same
   * order: a head with the card's area and ×; the part that may scroll on a phone, with the
   * question as the title (or the blank card's own title and hint), a rule on a tint, the field
   * and the dictation hint when it is open; the counter near the limit; a failed save; and the
   * row with "Prefer to talk?" and "Save". Which card is `app.writing`; what was tapped to open
   * it is lifted meanwhile (Stack.svelte, World.svelte).
   *
   * A modal dialog over the card screen, named by its title: on a laptop (`app.wide`) a box in
   * the centre of the page, and on a phone a box in the frame the keyboard leaves. A card of the
   * deck is on its tint, with no box around the field; a blank card is white, with the boxed
   * field (ADR 0024). It fades in and out where it stands and never slides. Where it came from
   * and where it goes is drawn by the travelling card (TravellingCard.svelte), never by this box.
   *
   * Focus goes into the field when it opens and stays inside; ×, Esc and a tap or click on the
   * scrim close it and keep its words (`app.closeCard`). The focus then goes back to what was
   * lifted: the card in front (Stack.svelte does that, since after a save it is the next card),
   * the tile on a laptop, the world pill on a phone for a tile, "Write your own story" for a new
   * blank card. The page behind is `inert` meanwhile (App.svelte).
   *
   * On a phone it is framed by what the keyboard leaves visible (ADR 0023; lib/viewport.ts), and
   * it is a fixed box (ADR 0025): the head, the counter and the row with "Save" never move, the
   * text scrolls inside the field, and only when the title and three lines of the field do not
   * fit does the part around them scroll (`.scrolls`). A field that takes the focus at the bottom
   * of the screen makes Safari scroll the page, which is why it never slides up. On a laptop the
   * part that scrolls is not a box of its own and nothing of that applies.
   */
  let { app }: { app: AppState } = $props();
  let dialog: HTMLElement | undefined = $state();
  let field: HTMLTextAreaElement | undefined = $state();

  const count = $derived(codePoints(app.openDraft));
  const busy = $derived(app.saving || app.closing);
  const counter = $derived(
    count >= COUNTER_FROM
      ? fill(app.copy.item('Card labels', 'counter'), {
          n: count.toLocaleString('en-US'),
          max: MAX_ANSWER_CHARS.toLocaleString('en-US'),
        })
      : '',
  );

  /** The card of the deck open here: its area and question go on top. Null for a blank card. */
  const card = $derived(app.writingCard);
  /**
   * The tint of the card (ADR 0024): a card of the deck is on its tint here, the card in front
   * and a card set aside on the tint its tile will have, an answer on the tint of its tile. A
   * blank card has none and is white, as its tile is.
   */
  const tint = $derived(app.writingTint);

  onMount(() => {
    // The field takes the focus after `tick()`: by then App.svelte has put the frame's class and
    // its two properties on the root, so the field is already where it will stay, and the
    // browser has no reason to scroll the page to show it (ADR 0025).
    void tick().then(() => field?.focus());
    const overflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    // Where the focus goes back to (ADR 0027). The card in front takes it from Stack.svelte, which
    // knows whether that is still the same card. For a tile: the tile on a laptop, the world pill
    // on a phone, whose sheet closed when the tile opened. For a new blank card: its button.
    const from = app.openedFrom;
    const id = app.writing;
    const wide = app.wide;
    const thanksAlready = thanksShown();
    return () => {
      document.body.style.overflow = overflow;
      // Once the page has drawn itself without the dialog: until then the opener is `inert`.
      void tick().then(() => {
        if (from === 'front') return;
        // The last card of the deck was answered here, and the thank-you card has just come:
        // it takes the focus (Stack.svelte), so a screen reader reads it. Not when it was there
        // already: a blank card opened under it gives the focus back to its button, as always.
        if (!thanksAlready && thanksShown()) return;
        if (from === 'new') return document.getElementById(OWN_CARD_OPENER)?.focus();
        if (!wide) return document.getElementById(WORLD_PILL)?.focus();
        const tile = [...document.querySelectorAll<HTMLElement>('[data-tile]')].find(
          (el) => el.dataset['tile'] === id,
        );
        tile?.focus();
      });
    };
  });

  /** Whether the thank-you card stands where the stack was: the deck is done and no card is in front. */
  function thanksShown(): boolean {
    return !app.card && !app.demoFront && Boolean(app.live?.deckDone);
  }

  function close() {
    void app.closeCard();
  }

  /**
   * Past the limit the input is refused, never cut through a pair (CRYPTO_BAD_TEXT). While the
   * card is being saved or is fading out, what is typed is not taken. The field is never
   * switched off for that: a field that is switched off loses the focus, and on a phone the
   * keyboard would go down under the card while it fades, and the frame would jump (ADR 0025).
   */
  function onInput(event: Event) {
    const el = event.currentTarget as HTMLTextAreaElement;
    if (busy) {
      el.value = app.openDraft;
      return;
    }
    if (codePoints(el.value) > MAX_ANSWER_CHARS)
      el.value = truncateCodePoints(el.value, MAX_ANSWER_CHARS);
    app.openDraft = el.value;
  }

  /**
   * Esc closes; Tab and Shift+Tab stay inside. Heard on the window, not on the dialog: when the
   * focus is on nothing (a button that was pressed and has gone), a key pressed is the page's,
   * and the page behind is `inert`. Esc must still close, and Tab must come back in.
   */
  function onKey(event: KeyboardEvent) {
    if (event.key === 'Escape') {
      event.preventDefault();
      close();
      return;
    }
    if (event.key !== 'Tab' || !dialog) return;
    const focusable = [
      ...dialog.querySelectorAll<HTMLElement>(
        'button, [href], input, textarea, select, [tabindex]:not([tabindex="-1"])',
      ),
    ].filter((el) => !el.hasAttribute('disabled'));
    if (focusable.length === 0) return;
    const first = focusable[0]!;
    const last = focusable.at(-1)!;
    const inside = dialog.contains(document.activeElement);
    if (event.shiftKey && (!inside || document.activeElement === first)) {
      event.preventDefault();
      last.focus();
    } else if (!event.shiftKey && (!inside || document.activeElement === last)) {
      event.preventDefault();
      first.focus();
    }
  }

  /**
   * "Prefer to talk?" opens and closes the dictation hint, and "Got it" closes it. The focus
   * goes to the field in the same press: it is where the person dictates, and on a phone a
   * focus anywhere else lowers the keyboard, which has the microphone.
   */
  function showHint(open: boolean) {
    app.hintOpen = open;
    field?.focus();
  }

  /**
   * What a screen reader says after the field's name. The dictation hint is among it while it
   * is open: "Prefer to talk?" sends the focus to the field at once, so the hint would not be
   * heard any other way. The question is never among it: it must not be on the field in any
   * form (see the note on the field, below).
   */
  const described = $derived(
    [
      ...(card ? [] : ['own-hint']),
      ...(app.platform && app.hintOpen ? ['dictation-hint'] : []),
      'open-count',
      ...(app.error ? ['open-error'] : []),
    ].join(' '),
  );
</script>

<svelte:window onkeydown={onKey} />

<!-- svelte-ignore a11y_click_events_have_key_events a11y_no_static_element_interactions -->
<div class="scrim" class:closing={app.closing} role="presentation" onclick={close}></div>
<div
  class="open-card"
  class:sheet={!app.wide}
  class:open-desk={app.wide}
  class:tinted={tint !== null}
  class:closing={app.closing}
  style:--tint={tint === null ? undefined : `var(--tint-${tint})`}
  role="dialog"
  aria-modal="true"
  aria-labelledby="open-title"
  tabindex="-1"
  bind:this={dialog}
>
  <!-- The head never moves (ADR 0025): the card's area on the left, × on the right. A card
       without an area keeps an empty label; a blank card has the × only. -->
  <div class="head">
    {#if card}
      {#if card.area}<span class="label">{card.area}</span>{:else}<span
          class="label"
          aria-hidden="true"
        ></span>{/if}
    {/if}
    <button
      type="button"
      class="close"
      aria-label={app.copy.item('Card labels', 'close without saving')}
      disabled={busy}
      onclick={close}
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
  <!-- The part that scrolls on a phone (ADR 0025): the title, the rule, the field and the
       dictation hint. The head above and the counter and the row with Save below never move.
       On a laptop it is not a box of its own (display: contents). -->
  <div class="scrolls">
    {#if card}
      <h2 id="open-title" class="question">{card.text}</h2>
      <!-- On a tint the field has no box: a rule under the question. -->
      {#if tint !== null}<div class="rule"></div>{/if}
    {:else}
      <h2 id="open-title">{app.copy.text('Own card: title')}</h2>
      <p class="own-hint" id="own-hint">{app.copy.text('Own card: hint')}</p>
    {/if}
    <!-- The field is named "Write an answer", not by the question. Safari on an iPhone reads
         the words that label a field to guess what belongs in it, and offers to fill it from
         the person's own contact card: under "What does the street smell like?" it offered a
         home address. An answer must never be a name or an address by accident (CLAUDE.md, no
         personal data). Safari ignores `autocomplete="off"`, Apple's documentation says so; it
         is set for the browsers that honour it. The two `data-` attributes ask the two most
         used password managers to leave the field alone. A screen reader hears the question
         as the name of the dialog. -->
    <textarea
      bind:this={field}
      value={app.openDraft}
      oninput={onInput}
      autocomplete="off"
      data-1p-ignore
      data-lpignore="true"
      aria-label={card
        ? app.copy.item('Card labels', 'write an answer')
        : app.copy.text('Own card: field')}
      aria-describedby={described}></textarea>
    {#if app.platform && app.hintOpen}
      <!-- The hint has no title of its own on the screen: "Prefer to talk?" is the button
           under it, which stays in its place, so the words are there once. The title is the
           hint's name for a screen reader. -->
      <div
        class="hint"
        id="dictation-hint"
        role="group"
        aria-label={app.copy.item('Titles', 'dictation hint')}
      >
        <p>{app.copy.item('Dictation hint', app.platform)}</p>
        <button type="button" onclick={() => showHint(false)}
          >{app.copy.item('Buttons', 'got it')}</button
        >
      </div>
    {/if}
  </div>
  <div class="meta">
    <span id="open-count" class="count" class:near={count >= COUNTER_NEAR}>{counter}</span>
  </div>
  {#if app.error}
    <!-- Said at once when Save fails, and again as the field's description (WCAG 4.1.3). -->
    <p class="error" id="open-error" role="alert">
      {app.copy.item('Card labels', 'could not save')}
      {app.copy.error(app.error)}
    </p>
  {/if}
  <div class="actions">
    <!-- "Prefer to talk?" stays in its place while its hint is open, and a second press closes
         the hint: a button that goes away when pressed leaves a gap, and nothing to press
         to change one's mind. "Got it" in the hint closes it too. -->
    {#if app.platform}
      <button
        type="button"
        class="talk"
        aria-expanded={app.hintOpen}
        aria-controls={app.hintOpen ? 'dictation-hint' : undefined}
        onclick={() => showHint(!app.hintOpen)}
      >
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
      class:busy={app.saving}
      disabled={busy || !app.openDraft.trim()}
      onclick={() => app.save()}
      >{app.saving
        ? app.copy.item('Card states', 'saving')
        : app.copy.item('Buttons', 'save')}</button
    >
  </div>
</div>
