<script lang="ts">
  import { MAX_ANSWER_CHARS } from '@wb/contracts';
  import { fill } from '../lib/copy.ts';
  import type { AppState } from '../lib/state.svelte.ts';
  import { reducedMotion, swipe } from '../lib/swipe.ts';
  import { codePoints } from '../lib/text.ts';

  /**
   * The card (docs/screen-map.md, Core loop): the question, the answer field, Save and Set aside,
   * and, after Save, the line that says where the answer is (`app.cardState`), on this card,
   * before the next one comes. The answer being written is `app.draft`, kept in the state rather
   * than here, so it survives "Your privacy" and Back; the limit is counted in code points so an
   * emoji is never cut in half. A swipe sideways sets the card aside as the button does
   * (lib/swipe.ts); the button makes the card leave the same way before recording it.
   *
   * The dictation hint (architecture plan, section 7) opens by itself on the first card of the
   * first session, on platforms that have dictation, and from "Prefer to talk?" on every card.
   */
  let { app }: { app: AppState } = $props();
  const remaining = $derived(MAX_ANSWER_CHARS - codePoints(app.draft));
  const busy = $derived(app.cardState !== 'fresh');
  let leaving = $state(false);

  async function setAside() {
    if (busy || leaving) return;
    leaving = true;
    if (!reducedMotion()) await app.wait(220);
    leaving = false;
    await app.setAside();
  }
</script>

{#if app.card}
  <p class="muted">
    {fill(app.copy.item('Card labels', 'position'), app.position)}
  </p>
  <div
    class="card"
    class:leaving
    use:swipe={{ onDismiss: () => app.setAside(), enabled: () => !busy && !leaving }}
  >
    <p class="question">{app.card.text}</p>
    <textarea
      bind:value={app.draft}
      disabled={busy}
      placeholder={app.copy.item('Card labels', 'placeholder')}
      aria-label={app.card.text}></textarea>
    <p class="muted">
      {app.copy.text('Card nudge')}
      {remaining < 500 ? fill(app.copy.item('Card labels', 'counter'), { n: remaining }) : ''}
    </p>
    {#if app.error}<p>
        {app.copy.item('Card labels', 'could not save')}
        {app.copy.error(app.error)}
      </p>{/if}
    <div class="row">
      <button
        class="primary"
        onclick={() => app.save()}
        disabled={busy || !app.draft.trim() || remaining < 0}
        ><span>{app.copy.item('Buttons', 'save')}</span></button
      >
      <button onclick={setAside} disabled={busy}>{app.copy.item('Buttons', 'set aside')}</button>
      {#if app.platform && !app.hintOpen}
        <button onclick={() => (app.hintOpen = true)}
          >{app.copy.item('Buttons', 'prefer to talk')}</button
        >
      {/if}
    </div>
    <p class="muted state" aria-live="polite">
      {#if app.cardState !== 'fresh'}{app.copy.item('Card states', app.cardState)}{/if}
    </p>
  </div>
  {#if app.platform && app.hintOpen}
    <aside class="hint">
      <h2>{app.copy.item('Titles', 'dictation hint')}</h2>
      <p>{app.copy.item('Dictation hint', app.platform)}</p>
      <button onclick={() => (app.hintOpen = false)}>{app.copy.item('Buttons', 'got it')}</button>
    </aside>
  {/if}
{/if}
