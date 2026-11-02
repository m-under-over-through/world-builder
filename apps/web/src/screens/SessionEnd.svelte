<script lang="ts">
  import { formatCode } from '@wb/contracts';
  import { fill } from '../lib/copy.ts';
  import { MASKED_CODE, type AppState } from '../lib/state.svelte.ts';

  /**
   * Session end (docs/screen-map.md, Core loop), in steps (`app.endStep`): on session 1 the code
   * reveal (the code in groups of four, masked by default, reveal and copy), then the install
   * prompt with the steps for this platform while it is due, then "come back another day" with
   * what still waits to sync. Every later session goes straight to the last step with its own
   * words. The order is section 8.1's: the code before the install, so the installed app can be
   * given it.
   */
  let { app }: { app: AppState } = $props();
  let revealed = $state(false);
  let copied = $state(false);

  async function copyCode() {
    await app.copyCode();
    copied = true;
    setTimeout(() => (copied = false), 2000);
  }
</script>

{#if app.endStep === 'code'}
  <h1>{app.copy.item('Titles', 'session end')}</h1>
  <p>{fill(app.copy.text('Session end: your code'), { code: '' })}</p>
  <p class="code">{revealed ? formatCode(app.code) : MASKED_CODE}</p>
  <div class="row">
    <button onclick={() => (revealed = !revealed)}
      >{revealed ? app.copy.item('Buttons', 'hide') : app.copy.item('Buttons', 'reveal')}</button
    >
    <button onclick={copyCode}
      >{copied ? app.copy.item('Buttons', 'copied') : app.copy.item('Buttons', 'copy')}</button
    >
    <button class="primary" onclick={() => app.nextFromCode()}
      ><span>{app.copy.item('Buttons', 'next')}</span></button
    >
  </div>
{:else if app.endStep === 'install'}
  <h1>{app.copy.item('Titles', 'install')}</h1>
  <p>
    {fill(app.copy.text('Session end: install'), {
      'per-platform steps': app.platform ? app.copy.item('Install steps', app.platform) : '',
    })}
  </p>
  <div class="row">
    {#if app.installOffer}
      <button class="primary" onclick={() => app.install()}
        ><span>{app.copy.item('Buttons', 'install')}</span></button
      >
    {/if}
    <button onclick={() => app.dismissInstall()}>{app.copy.item('Buttons', 'not now')}</button>
  </div>
{:else}
  <h1>{app.copy.item('Titles', 'session end')}</h1>
  {#if app.sessionNo > 1}
    <p>{app.copy.text('Session end: another session')}</p>
  {/if}
  <p class="muted">{app.copy.item('Session end', 'come back')}</p>
  <p class="muted">
    {#if app.sync.outboxSize > 0}{fill(app.copy.item('Session end', 'waiting to sync'), {
        n: app.sync.outboxSize,
      })}{:else}{app.copy.item('Session end', 'all synced')}{/if}
  </p>
{/if}
