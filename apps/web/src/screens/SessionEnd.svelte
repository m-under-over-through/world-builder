<script lang="ts">
  import { formatCode } from '@wb/contracts';
  import { reminderHref } from '../lib/reminder.ts';
  import type { AppState } from '../lib/state.svelte.ts';

  /**
   * The session end (docs/screen-map.md, Session end; ADR 0013): one heading, "Thank you", and
   * nothing said twice. On the first session, the code in one sentence with Copy, then the
   * install offer where it is due (`app.installOffered`), with the steps for this platform; on
   * every session, "the next cards wait for you another day" once, with the "Remind me" link to
   * the workshop's calendar file (lib/reminder.ts), and, only while answers still wait on the
   * phone, the quiet line that says so. The order is the architecture plan's (8.1): the code
   * before the install, so the installed app can be given it.
   */
  let { app }: { app: AppState } = $props();
  let copied = $state(false);
  /** The sentence around the code: the words before `[code]` and the words after. */
  const codeSentence = $derived(app.copy.text('Session end: your code').split('[code]'));

  async function copyCode() {
    await app.copyCode();
    copied = true;
    setTimeout(() => (copied = false), 2000);
  }
</script>

<h1>{app.copy.item('Titles', 'session end')}</h1>
{#if app.sessionNo === 1}
  <p>
    {codeSentence[0]}<span class="code">{formatCode(app.code)}</span>{codeSentence[1] ?? ''}
  </p>
  <div class="row">
    <button onclick={copyCode}
      >{copied ? app.copy.item('Buttons', 'copied') : app.copy.item('Buttons', 'copy')}</button
    >
  </div>
  {#if app.installOffered && app.platform}
    <aside class="hint">
      <h2>{app.copy.item('Titles', 'install')}</h2>
      <p>
        {app.copy.text('Session end: install').split('[per-platform steps]')[0]}
        {app.copy.item('Install steps', app.platform)}
      </p>
      {#if app.installOffer}
        <button class="primary" onclick={() => app.install()}
          ><span>{app.copy.item('Buttons', 'install')}</span></button
        >
      {/if}
    </aside>
  {/if}
{/if}
<p>
  {app.copy.text('Session end: come back')}
  {#if app.workshop}
    <a href={reminderHref(app.workshop.config.slug)}>{app.copy.item('Buttons', 'remind me')}</a>
  {/if}
</p>
{#if app.sync.outboxSize > 0}
  <p class="muted">
    {app.copy.item('Session end', 'waiting to sync').split('[n]').join(String(app.sync.outboxSize))}
  </p>
{/if}
