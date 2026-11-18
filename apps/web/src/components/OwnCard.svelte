<script lang="ts">
  import { MAX_ANSWER_CHARS } from '@wb/contracts';
  import { onMount, tick } from 'svelte';
  import { fill } from '../lib/copy.ts';
  import type { AppState } from '../lib/state.svelte.ts';
  import { reducedMotion } from '../lib/swipe.ts';
  import { codePoints, truncateCodePoints } from '../lib/text.ts';
  import { COUNTER_FROM, COUNTER_NEAR, OWN_CARD_OPENER } from './Stack.svelte';

  /**
   * The place to write a blank card (ADR 0022): a card with no question, which the participant
   * writes. Over the card screen as a modal dialog: on a phone a sheet, built the way
   * WorldSheet.svelte is; on a laptop (`app.wide`) a wide card over the desk, with the same
   * content. The title, the hint, a large field with its own name for a
   * screen reader, the counter near the limit as on a card, then "Not now" and "Save".
   *
   * Focus goes into the field when it opens and stays inside; Esc, "Not now" and a tap on the
   * scrim close it, and the focus goes back to "Write your own story" (Stack.svelte). The page
   * behind is `inert` meanwhile (App.svelte). Closing keeps the words in memory (`app.ownDraft`).
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

  onMount(() => {
    field?.focus();
    const overflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = overflow;
      // Once the page has drawn itself without the dialog: until then the opener is `inert`.
      void tick().then(() => document.getElementById(OWN_CARD_OPENER)?.focus());
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
    ['own-hint', 'own-count', ...(app.error ? ['own-error'] : [])].join(' '),
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
  <h2 id="own-title">{app.copy.text('Own card: title')}</h2>
  <p class="own-hint" id="own-hint">{app.copy.text('Own card: hint')}</p>
  <textarea
    bind:this={field}
    value={app.ownDraft}
    oninput={onInput}
    disabled={busy}
    aria-label={app.copy.text('Own card: field')}
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
