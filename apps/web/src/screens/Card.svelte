<script lang="ts">
  import { MAX_ANSWER_CHARS } from '@wb/contracts';
  import { fill } from '../lib/copy.ts';
  import { codePoints } from '../lib/deck.ts';
  import type { AppState } from '../lib/state.svelte.ts';

  /**
   * The card (docs/screen-map.md, Core loop): the question, the answer field, Save and Set aside,
   * and the line that says where the answer is. The answer lives here until `app.save` has
   * sealed it; the limit is counted in code points so an emoji is never cut in half.
   *
   * The dictation hint (architecture plan, section 7) opens by itself on the first card of the
   * first session, on platforms that have dictation, and from "Prefer to talk?" on every card.
   */
  let { app }: { app: AppState } = $props();
  let answer = $state('');
  const remaining = $derived(MAX_ANSWER_CHARS - codePoints(answer));

  async function save() {
    if (await app.save(answer)) answer = '';
  }
  async function setAside() {
    answer = '';
    await app.setAside();
  }
</script>

{#if app.card}
  <p class="muted">
    {fill(app.copy.item('Card labels', 'position'), { n: app.index + 1, total: app.cards.length })}
  </p>
  <div class="card">
    <p class="question">{app.card.text}</p>
    <textarea
      bind:value={answer}
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
        onclick={save}
        disabled={app.saving || !answer.trim() || remaining < 0}
        ><span>{app.copy.item('Buttons', 'save')}</span></button
      >
      <button onclick={setAside}>{app.copy.item('Buttons', 'set aside')}</button>
      {#if app.platform && !app.hintOpen}
        <button onclick={() => (app.hintOpen = true)}
          >{app.copy.item('Buttons', 'prefer to talk')}</button
        >
      {/if}
    </div>
  </div>
  {#if app.platform && app.hintOpen}
    <aside class="hint" aria-label={app.copy.item('Titles', 'dictation hint')}>
      <p>{app.copy.item('Dictation hint', app.platform)}</p>
      <button onclick={() => (app.hintOpen = false)}>{app.copy.item('Buttons', 'got it')}</button>
    </aside>
  {/if}
  <p class="muted">
    {#if app.sync.lastResult === 'ok'}{app.copy.item(
        'Card states',
        'synced',
      )}{:else if app.sync.lastResult === 'offline'}{app.copy.item(
        'Card states',
        'offline',
      )}{:else if app.sync.lastResult === 'error'}{app.copy.item(
        'Card states',
        'sync problem',
      )}{/if}
  </p>
{/if}
