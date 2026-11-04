<script lang="ts">
  import { onMount } from 'svelte';
  import { fill } from '../lib/copy.ts';
  import type { AppState } from '../lib/state.svelte.ts';
  import { reducedMotion } from '../lib/swipe.ts';
  import World from './World.svelte';

  /**
   * The sheet (phone; design/DESIGN.md, Components and Accessibility; ADR 0015): "Your world so
   * far" from 112 pixels down over a scrim, as a modal dialog, its head fixed and its body (the
   * answers, the cards set aside, "Remind me") scrolling as one. Focus moves to × when it opens
   * and stays inside; Esc, ×, a tap on the scrim or a swipe down on its head close it, and
   * focus returns to the pill that opened it. The page behind does not scroll meanwhile.
   */
  let { app, returnTo }: { app: AppState; returnTo?: HTMLElement | undefined } = $props();
  const SHEET_MS = 280;
  /** A drag this far down on the sheet's head closes it. */
  const SWIPE_DOWN_PX = 80;
  let sheet: HTMLElement | undefined = $state();
  let closeButton: HTMLButtonElement | undefined = $state();
  let closing = $state(false);
  let startY: number | null = null;

  const world = $derived(app.world);
  const summary = $derived(
    fill(app.copy.item('Your world', 'summary'), {
      answered: world.tiles.length,
      aside: world.aside.length,
    }),
  );

  onMount(() => {
    closeButton?.focus();
    const overflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = overflow;
      returnTo?.focus();
    };
  });

  async function close() {
    if (closing) return;
    closing = true;
    if (!reducedMotion()) await app.wait(SHEET_MS);
    closing = false;
    app.closeWorld();
  }

  /** Esc closes; Tab and Shift+Tab stay inside the sheet. */
  function onKey(event: KeyboardEvent) {
    if (event.key === 'Escape') {
      event.preventDefault();
      void close();
      return;
    }
    if (event.key !== 'Tab' || !sheet) return;
    const focusable = [
      ...sheet.querySelectorAll<HTMLElement>(
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

  /** A swipe down that starts on the head (not in the scrolling body) closes the sheet. */
  function onDown(event: PointerEvent) {
    const target = event.target instanceof Element ? event.target : null;
    startY = target?.closest('.sheet-body, button') ? null : event.clientY;
  }
  function onUp(event: PointerEvent) {
    if (startY !== null && event.clientY - startY > SWIPE_DOWN_PX) void close();
    startY = null;
  }
</script>

<!-- svelte-ignore a11y_click_events_have_key_events a11y_no_static_element_interactions -->
<div class="scrim" class:closing role="presentation" onclick={close}></div>
<div
  class="sheet"
  class:closing
  role="dialog"
  aria-modal="true"
  aria-labelledby="world-title"
  tabindex="-1"
  bind:this={sheet}
  onkeydown={onKey}
  onpointerdown={onDown}
  onpointerup={onUp}
  onpointercancel={() => (startY = null)}
>
  <div class="grabber" aria-hidden="true"></div>
  <div class="sheet-head">
    <div class="titles">
      <h2 id="world-title">{app.copy.item('Your world', 'title')}</h2>
      <span class="summary">{summary}</span>
    </div>
    <button
      type="button"
      class="close"
      aria-label={app.copy.item('Your world', 'close')}
      bind:this={closeButton}
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
  <div class="sheet-body">
    <World {app} sheet />
  </div>
</div>
