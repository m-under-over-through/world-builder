<script lang="ts">
  import { formatCode, type EventKind } from '@wb/contracts';
  import { fill } from '../lib/copy.ts';
  import { MASKED_CODE, type AppState } from '../lib/state.svelte.ts';
  import { ENV, VERSION } from '../lib/workshops.ts';

  /**
   * The privacy panel (docs/screen-map.md, Always reachable; architecture plan, section 13): the
   * live version of the trust page, every value read from the running app. The code, masked,
   * with reveal and copy; cookies, hosts, the permissions policy, the key; what the server holds
   * (the rows of GET /me, as they are, sealed bodies shown as sealed); the diagnostics (the last
   * sync and its day, what waits in the outbox, the last error code with its one line); the
   * version with a link to the source at that commit; the data management plan; the caveat;
   * "I have a code"; and "delete everything about me" in two steps.
   */
  let { app }: { app: AppState } = $props();
  let revealed = $state(false);
  let copied = $state(false);
  const label = (key: Parameters<typeof app.copy.item<'Privacy panel'>>[1]) =>
    app.copy.item('Privacy panel', key);
  const kind = (k: EventKind) => app.copy.item('Event kinds', k);

  async function copyCode() {
    await app.copyCode();
    copied = true;
    setTimeout(() => (copied = false), 2000);
  }
</script>

<h1>{app.copy.item('Titles', 'privacy panel')}</h1>
<dl>
  <div>
    <dt>{label('code')}</dt>
    <dd>
      <span class="code"
        >{app.code ? (revealed ? formatCode(app.code) : MASKED_CODE) : label('no code yet')}</span
      >
      {#if app.code}
        <div class="row">
          <button onclick={() => (revealed = !revealed)}
            >{revealed
              ? app.copy.item('Buttons', 'hide')
              : app.copy.item('Buttons', 'reveal')}</button
          >
          <button onclick={copyCode}
            >{copied
              ? app.copy.item('Buttons', 'copied')
              : app.copy.item('Buttons', 'copy')}</button
          >
        </div>
        <p class="muted">{label('code note')}</p>
      {/if}
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
      {#if app.me}
        {fill(label('stored summary'), {
          sessions: app.me.sessions.length,
          events: app.me.events.length,
        })}
        <details>
          <summary>{label('show rows')}</summary>
          <p>
            {label('joined')}
            {app.me.participant.createdDay}; {label('came through')}
            {app.me.participant.wave ?? label('an invite')}; {label('invites left')}
            {app.me.participant.invitesLeft}.
          </p>
          <p class="muted">{label('sessions')}</p>
          <ul>
            {#each app.me.sessions as session (session.id)}
              <li>
                {fill(label('session row'), { n: session.sessionNo, day: session.startedDay })}
              </li>
            {/each}
          </ul>
          <p class="muted">{label('events')}</p>
          <ul>
            {#each app.me.events as event (event.id)}
              <li>
                {fill(label('event row'), {
                  kind: kind(event.kind),
                  card: event.cardId,
                  seq: event.seq,
                  day: event.createdDay,
                  version: event.deckVersion,
                })}{#if event.body}; {fill(label('sealed body'), {
                    chars: event.body.length,
                  })}{/if}
              </li>
            {/each}
          </ul>
        </details>
      {:else if app.code}
        {label('not reachable')}
      {:else}
        {label('nothing stored')}
      {/if}
    </dd>
  </div>
  <div>
    <dt>{label('last sync')}</dt>
    <dd>
      {app.copy.item('Diagnostics', app.sync.lastResult)}{app.lastSyncDay
        ? `, ${fill(label('last sync day'), { day: app.lastSyncDay })}`
        : ''}
    </dd>
  </div>
  <div>
    <dt>{label('waiting')}</dt>
    <dd>
      {fill(label('outbox summary'), {
        events: app.sync.outboxSize,
        sessions: app.sync.outboxSessions,
      })}
    </dd>
  </div>
  <div>
    <dt>{label('last error')}</dt>
    <dd>
      {#if app.lastError}<code>{app.lastError}</code>: {app.copy.error(app.lastError)}{:else}{label(
          'no error',
        )}{/if}
    </dd>
  </div>
  <div>
    <dt>{label('version')}</dt>
    <dd>{VERSION} ({ENV}); <a href={app.sourceHref}>{label('source')}</a></dd>
  </div>
</dl>

<h2>{label('plan')}</h2>
<p>{app.copy.text('Data management plan')}</p>
<p class="muted">{app.copy.text('Privacy panel: caveat')}</p>

<section>
  <p>{label('another device')}</p>
  <button onclick={() => app.navigate('continue')}
    >{app.copy.item('Buttons', 'i have a code')}</button
  >
</section>

{#if app.error}<p>{app.copy.error(app.error)}</p>{/if}
<div class="row">
  <button onclick={() => app.closePanel()}>{app.copy.item('Buttons', 'back')}</button>
  {#if app.code && !app.confirmingDelete}
    <button onclick={() => app.askDelete()}>{app.copy.item('Buttons', 'delete')}</button>
  {/if}
</div>
{#if app.code && app.confirmingDelete}
  <section class="card">
    <p>{app.copy.text('Privacy panel: delete confirm')}</p>
    <div class="row">
      <button class="primary" onclick={() => app.deleteMe()}
        ><span>{app.copy.item('Buttons', 'yes delete')}</span></button
      >
      <button onclick={() => app.keepAnswers()}>{app.copy.item('Buttons', 'keep')}</button>
    </div>
  </section>
{/if}
