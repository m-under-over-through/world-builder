<script lang="ts">
  import { MAX_ANSWER_CHARS } from '@wb/contracts';
  import { onMount, tick } from 'svelte';
  import { fill } from '../lib/copy.ts';
  import { NEW_OWN_CARD, type AppState } from '../lib/state.svelte.ts';
  import { reducedMotion } from '../lib/swipe.ts';
  import { codePoints, truncateCodePoints } from '../lib/text.ts';
  import { growField, keepEndInView } from '../lib/viewport.ts';
  import { COUNTER_FROM, COUNTER_NEAR, OWN_CARD_OPENER, WORLD_PILL } from './Stack.svelte';

  /**
   * The place to write a blank card (ADR 0022): a card with no question, which the participant
   * writes. Since ADR 0024 also the place a tile opens in: a card set aside, its area and its
   * question on top and the field empty; an answer, the same with its words in the field; a blank
   * card already written, with its title and hint and its words. Which card is `app.writing`. Over the card screen as a modal dialog: on a phone a sheet, built the way
   * WorldSheet.svelte is; on a laptop (`app.wide`) a wide card over the desk, with the same
   * content. The title, the hint, a large field with its own name for a
   * screen reader, the counter near the limit as on a card, then "Not now" and "Save".
   *
   * Focus goes into the field when it opens and stays inside; Esc, "Not now" and a tap on the
   * scrim close it, and the focus goes back to "Write your own story" (Stack.svelte), or to the
   * tile it was opened from (the world pill on a phone). The page
   * behind is `inert` meanwhile (App.svelte). Closing keeps the words in memory (`app.ownDraft`).
   *
   * On a phone the sheet is framed by what the keyboard leaves visible, as the open card is (ADR
   * 0023; lib/viewport.ts): the title, the hint, the field and the two buttons above the
   * keyboard, the field growing with the text and the sheet scrolling, with "Save" at its end.
   */
  let { app }: { app: AppState } = $props();
  const CLOSE_MS = 280;
  let dialog: HTMLElement | undefined = $state();
  let field: HTMLTextAreaElement | undefined = $state();
  let closing = $state(false);

  const count = $derived(codePoints(app.ownDraft));
  const busy = $derived(app.ownSaving);
  const counter = $derived(
    count >= COUNTER_FROM
      ? fill(app.copy.item('Card labels', 'counter'), {
          n: count.toLocaleString('en-US'),
          max: MAX_ANSWER_CHARS.toLocaleString('en-US'),
        })
      : '',
  );

  /** The card of the tile this was opened from (ADR 0024): its area and question go on top. */
  const card = $derived(app.writingCard);

  onMount(() => {
    if (field && !app.wide) growField(field);
    field?.focus();
    const overflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    // Where the focus goes back to: "Write your own story" for a new blank card; for a tile, the
    // tile on a laptop and the world pill on a phone, whose sheet closed when the tile opened.
    const from = app.writing;
    const wide = app.wide;
    return () => {
      document.body.style.overflow = overflow;
      // Once the page has drawn itself without the dialog: until then the opener is `inert`.
      void tick().then(() => {
        if (from === NEW_OWN_CARD || from === null)
          return document.getElementById(OWN_CARD_OPENER)?.focus();
        if (!wide) return document.getElementById(WORLD_PILL)?.focus();
        const tile = [...document.querySelectorAll<HTMLElement>('[data-tile]')].find(
          (el) => el.dataset['tile'] === from,
        );
        tile?.focus();
      });
    };
  });

  async function close() {
    if (closing || busy) return;
    closing = true;
    if (!reducedMotion()) await app.wait(CLOSE_MS);
    closing = false;
    app.closeOwnCard();
  }

  /** Past the limit the input is refused, never cut through a pair (CRYPTO_BAD_TEXT), as on a card. */
  function onInput(event: Event) {
    const el = event.currentTarget as HTMLTextAreaElement;
    if (codePoints(el.value) > MAX_ANSWER_CHARS)
      el.value = truncateCodePoints(el.value, MAX_ANSWER_CHARS);
    app.ownDraft = el.value;
    if (!app.wide) {
      growField(el);
      keepEndInView(el, dialog ?? null);
    }
  }

  /** Esc closes; Tab and Shift+Tab stay inside. */
  function onKey(event: KeyboardEvent) {
    if (event.key === 'Escape') {
      event.preventDefault();
      void close();
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
    if (event.shiftKey && document.activeElement === first) {
      event.preventDefault();
      last.focus();
    } else if (!event.shiftKey && document.activeElement === last) {
      event.preventDefault();
      first.focus();
    }
  }

  const described = $derived(
    [...(card ? [] : ['own-hint']), 'own-count', ...(app.error ? ['own-error'] : [])].join(' '),
  );
</script>

<!-- svelte-ignore a11y_click_events_have_key_events a11y_no_static_element_interactions -->
<div class="scrim" class:closing role="presentation" onclick={close}></div>
<div
  class="own-card"
  class:sheet={!app.wide}
  class:own-desk={app.wide}
  class:closing
  role="dialog"
  aria-modal="true"
  aria-labelledby="own-title"
  tabindex="-1"
  bind:this={dialog}
  onkeydown={onKey}
>
  {#if card}
    <!-- A card of the deck, set aside or answered (ADR 0024): its area, then its question as
         the title and the name of the field, as on the open card. -->
    {#if card.area}<span class="own-label">{card.area}</span>{/if}
    <h2 id="own-title" class="own-question">{card.text}</h2>
  {:else}
    <h2 id="own-title">{app.copy.text('Own card: title')}</h2>
    <p class="own-hint" id="own-hint">{app.copy.text('Own card: hint')}</p>
  {/if}
  <textarea
    bind:this={field}
    value={app.ownDraft}
    oninput={onInput}
    disabled={busy}
    aria-label={card ? card.text : app.copy.text('Own card: field')}
    aria-describedby={described}></textarea>
  <div class="own-meta">
    <span id="own-count" class="count" class:near={count >= COUNTER_NEAR}>{counter}</span>
  </div>
  {#if app.error}
    <!-- Said at once when Save fails, and again as the field's description (WCAG 4.1.3). -->
    <p class="error" id="own-error" role="alert">
      {app.copy.item('Card labels', 'could not save')}
      {app.copy.error(app.error)}
    </p>
  {/if}
  <div class="own-actions">
    <button type="button" class="not-now" disabled={busy} onclick={close}
      >{app.copy.item('Own card: buttons', 'not now')}</button
    >
    <button
      type="button"
      class="pill save"
      class:busy
      disabled={busy || !app.ownDraft.trim()}
      onclick={() => app.saveOwnCard()}
      >{busy
        ? app.copy.item('Card states', 'saving')
        : app.copy.item('Own card: buttons', 'save')}</button
    >
  </div>
</div>
