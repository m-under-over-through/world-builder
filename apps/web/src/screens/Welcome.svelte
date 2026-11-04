<script lang="ts">
  import type { AppState } from '../lib/state.svelte.ts';

  /**
   * The welcome, the one page before the cards (docs/screen-map.md, Entry and First session;
   * ADR 0019), in the layout of the design's Welcome artboard: the fanned cards, decoration;
   * the title and the purpose line; one paragraph that says what this is, how it works and the
   * consent; one button, "I understand", which is the consent and does what the consent screen
   * did (`app.join`: the link's code or a fresh one, the join, the first card). Under the
   * paragraph, one line for the case a person is in: arrived through a link with a value of its
   * own (ADR 0018), "This link is yours"; through a link without one, nothing more; neither, the
   * line says to open the link you were sent, and there is no button. When the code this phone
   * remembered was refused on open (AUTH_CODE_UNKNOWN), one quiet line says so.
   */
  let { app }: { app: AppState } = $props();
  const yourLink = $derived(Boolean(app.linkCode));
  const canJoin = $derived(Boolean(yourLink || app.arrival.wave || app.arrival.invite));
  /** The fanned cards of the artboard, back to front: tint and turn. */
  const FAN = [
    ['lilac', -14],
    ['mint', -5],
    ['sun', 4],
    ['sky', 13],
  ] as const;
</script>

<div class="welcome">
  <div class="fan" aria-hidden="true">
    {#each FAN as [tint, turn] (tint)}
      <span style:--tint={`var(--tint-${tint})`} style:--turn={`${turn}deg`}></span>
    {/each}
  </div>
  <div class="words">
    <h1>{app.copy.text('Welcome: title')}</h1>
    <p class="purpose">{app.copy.text('Welcome: purpose')}</p>
    {#each app.copy.paragraphs('Welcome') as paragraph, i (i)}
      <p>{paragraph}</p>
    {/each}
    {#if app.codeRefused}
      <p class="line" role="status">{app.copy.text('Welcome: link not accepted')}</p>
    {/if}
    {#if canJoin}
      {#if yourLink}<p class="line">{app.copy.text('Welcome: your link')}</p>{/if}
    {:else}
      <p class="line">{app.copy.text('Welcome: no link')}</p>
    {/if}
  </div>
  {#if canJoin}
    <div class="go">
      {#if app.error}<p>{app.copy.error(app.error)}</p>{/if}
      {#if app.retrying}<p class="muted">{app.copy.item('App labels', 'retrying')}</p>{/if}
      <button class="primary wide" onclick={() => app.join()} disabled={app.joining}
        ><span>{app.copy.item('Buttons', 'i understand')}</span></button
      >
    </div>
  {/if}
</div>
