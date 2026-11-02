<script lang="ts">
  import { formatCode } from '@wb/contracts';
  import { fill } from '../lib/copy.ts';
  import { MASKED_CODE, type AppState } from '../lib/state.svelte.ts';

  /**
   * Session end (docs/screen-map.md, Core loop) with the code reveal: the code in groups of four,
   * masked by default, reveal and copy; "come back another day"; what still waits to sync.
   * Session 1 only and the install prompt come with item 6.
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
</div>
<p class="muted">{app.copy.item('Session end', 'come back')}</p>
<p class="muted">
  {#if app.sync.outboxSize > 0}{fill(app.copy.item('Session end', 'waiting to sync'), {
      n: app.sync.outboxSize,
    })}{:else}{app.copy.item('Session end', 'all synced')}{/if}
</p>
