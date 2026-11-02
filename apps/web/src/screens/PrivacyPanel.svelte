<script lang="ts">
  import { formatCode } from '@wb/contracts';
  import { fill } from '../lib/copy.ts';
  import { MASKED_CODE, type AppState } from '../lib/state.svelte.ts';
  import { ENV, VERSION } from '../lib/workshops.ts';

  /**
   * The privacy panel (docs/screen-map.md, Always reachable): live values read from the running
   * app. The rows of "what we store", the day of the last sync, the two-step delete and the rest
   * of item 7 come later; this is the skeleton's panel with its words from copy.md.
   */
  let { app }: { app: AppState } = $props();
  let revealed = $state(false);
  const label = (key: Parameters<typeof app.copy.item<'Privacy panel'>>[1]) =>
    app.copy.item('Privacy panel', key);
</script>

<h1>{app.copy.item('Titles', 'privacy panel')}</h1>
<dl>
  <div>
    <dt>{label('code')}</dt>
    <dd class="code">
      {app.code ? (revealed ? formatCode(app.code) : MASKED_CODE) : label('no code yet')}
    </dd>
  </div>
  <div>
    <dt>{label('cookies')}</dt>
    <dd>{app.cookies}</dd>
  </div>
  <div>
    <dt>{label('hosts')}</dt>
    <dd>{app.hosts.join(', ')}</dd>
  </div>
  <div>
    <dt>{label('permissions')}</dt>
    <dd>{label('permissions value')}</dd>
  </div>
  <div>
    <dt>{label('key')}</dt>
    <dd>{app.workshop?.keyFingerprint} ({ENV})</dd>
  </div>
  <div>
    <dt>{label('stored')}</dt>
    <dd>
      {app.me
        ? fill(label('stored summary'), {
            sessions: app.me.sessions.length,
            events: app.me.events.length,
          })
        : label('nothing stored')}
    </dd>
  </div>
  <div>
    <dt>{label('waiting')}</dt>
    <dd>
      {fill(label('waiting summary'), { n: app.sync.outboxSize })}; {app.copy.item(
        'Diagnostics',
        'last sync',
      )}
      {app.copy.item('Diagnostics', app.sync.lastResult)}{app.sync.lastError
        ? ` (${app.sync.lastError})`
        : ''}
    </dd>
  </div>
  <div>
    <dt>{label('version')}</dt>
    <dd>{VERSION}</dd>
  </div>
</dl>
{#if app.error}<p>{app.copy.error(app.error)}</p>{/if}
<div class="row">
  <button onclick={() => (revealed = !revealed)}
    >{revealed ? app.copy.item('Buttons', 'hide') : app.copy.item('Buttons', 'reveal')}</button
  >
  <button onclick={() => app.closePanel()}>{app.copy.item('Buttons', 'back')}</button>
  {#if app.code}<button onclick={() => app.deleteMe()}>{app.copy.item('Buttons', 'delete')}</button
    >{/if}
</div>
