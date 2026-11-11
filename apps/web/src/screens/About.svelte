<script lang="ts">
  import type { EventKind } from '@wb/contracts';
  import { tick } from 'svelte';
  import TopBack from '../components/TopBack.svelte';
  import { fill, inline, TRUST_BLOCKS } from '../lib/copy.ts';
  import { reminderHref } from '../lib/reminder.ts';
  import type { AppState } from '../lib/state.svelte.ts';
  import { ENV, VERSION } from '../lib/workshops.ts';

  /**
   * The one page about the app (docs/screen-map.md, Always reachable; ADR 0013), reached from
   * the small "About this app" link at the foot of every screen. In this order (ADR 0019): Back
   * at the top; what this is, with the "Remind me" line under it (ADR 0017); a few plain
   * sentences; then one closed fold, "The technical details", holding how answers are protected
   * (the trust page's six paragraphs, the key fingerprint and the source address filled in, the
   * links that need no trust in us) and the facts read from the running app (the privacy
   * panel's rows: cookies, hosts, the permissions policy with a plain note on dictation, the
   * key, what the server holds, the diagnostics, the version); "delete everything and start
   * over" in two steps; Back; and at the foot the terms and the privacy policy. Opened from
   * /trust or /panel, the fold is open and the page scrolls to that section. The code is not on
   * it: a link's value is the way back on another device (ADR 0018).
   */
  let { app }: { app: AppState } = $props();
  const label = (key: Parameters<typeof app.copy.item<'Privacy panel'>>[1]) =>
    app.copy.item('Privacy panel', key);
  const variable = (key: Parameters<typeof app.copy.item<'Trust page variables'>>[1]) =>
    app.copy.item('Trust page variables', key);
  const link = (key: Parameters<typeof app.copy.item<'Trust page links'>>[1]) =>
    app.copy.item('Trust page links', key);
  const kind = (k: EventKind) => app.copy.item('Event kinds', k);
  const slots = $derived({
    'key fingerprint': app.workshop?.keyFingerprint ?? '',
    source: variable('source'),
  });
  /** The fold is open when an older address asked for a section inside it. */
  const detailsOpen = $derived(app.aboutSection === 'protected' || app.aboutSection === 'now');

  /**
   * Delete in two steps swaps one button for a question and two buttons, and back: the button
   * that was pressed is gone each time. The focus follows, to the question, which a screen
   * reader then reads, and back to the first button after "Keep my answers".
   */
  let question: HTMLParagraphElement | undefined = $state();
  let deleteButton: HTMLButtonElement | undefined = $state();
  async function ask() {
    app.askDelete();
    await tick();
    question?.focus();
  }
  async function keep() {
    app.keepAnswers();
    await tick();
    deleteButton?.focus();
  }

  // The section an older address asked for, once the page is on the screen; the test DOM has
  // no scrolling, so the call is optional there.
  $effect(() => {
    const section = app.aboutSection;
    if (!section) return;
    document.getElementById(`about-${section}`)?.scrollIntoView?.({ block: 'start' });
  });
</script>

<TopBack label={app.copy.item('Buttons', 'back')} onclick={() => app.back()} />
<h1>{app.copy.item('Titles', 'about')}</h1>
<p class="lead">{app.copy.text('About: what this is')}</p>
{#if app.workshop}
  <p class="remind">
    {app.copy.text('Remind me')}
    <a href={reminderHref(app.workshop.config.slug)}>{app.copy.item('Buttons', 'remind me')}</a>
  </p>
{/if}
{#each app.copy.paragraphs('About: in short') as paragraph, i (i)}
  <p class="in-short">{paragraph}</p>
{/each}

<details class="technical" open={detailsOpen}>
  <summary>
    {app.copy.item('Titles', 'technical details')}
    <svg
      class="caret"
      aria-hidden="true"
      width="18"
      height="18"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      stroke-width="1.75"
      stroke-linecap="round"
      stroke-linejoin="round"><path d="M6 9l6 6 6-6" /></svg
    >
  </summary>
  <section id="about-protected">
    <h2>{app.copy.item('Titles', 'trust page')}</h2>
    {#each TRUST_BLOCKS as block (block)}
      {#each app.copy.paragraphs(block) as paragraph, i (i)}
        <p>
          {#each inline(fill(paragraph, slots)) as run, j (j)}
            {#if run.bold}<strong>{run.text}</strong>{:else}{run.text}{/if}
          {/each}
        </p>
      {/each}
    {/each}
    <ul class="links">
      <li><a href={app.sourceHref}>{link('source')}</a></li>
      <li><a href={variable('webbkoll')}>{link('webbkoll')}</a></li>
      <li><a href={variable('blacklight')}>{link('blacklight')}</a></li>
    </ul>
  </section>

  <section id="about-now">
    <h2>{app.copy.item('Titles', 'privacy panel')}</h2>
    <dl>
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
        <dd>
          {label('permissions value')}
          <span class="note">{label('permissions note')}</span>
        </dd>
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
          {#if app.lastError}<code>{app.lastError}</code>: {app.copy.error(
              app.lastError,
            )}{:else}{label('no error')}{/if}
        </dd>
      </div>
      <div>
        <dt>{label('version')}</dt>
        <dd>{VERSION} ({ENV}); <a href={app.sourceHref}>{label('source')}</a></dd>
      </div>
    </dl>
  </section>
</details>

{#if app.code}
  <section id="about-delete">
    <p>{app.copy.text('About: delete')}</p>
    {#if app.error}<p role="alert">{app.copy.error(app.error)}</p>{/if}
    {#if app.confirmingDelete}
      <p class="confirm" tabindex="-1" bind:this={question}>
        {app.copy.text('Privacy panel: delete confirm')}
      </p>
      <div class="row">
        <button class="primary" onclick={() => app.deleteMe()}
          ><span>{app.copy.item('Buttons', 'yes delete')}</span></button
        >
        <button onclick={keep}>{app.copy.item('Buttons', 'keep')}</button>
      </div>
    {:else}
      <div class="row">
        <button bind:this={deleteButton} onclick={ask}>{app.copy.item('Buttons', 'delete')}</button>
      </div>
    {/if}
  </section>
{/if}

<div class="row">
  <button onclick={() => app.back()}>{app.copy.item('Buttons', 'back')}</button>
</div>
<footer class="page-foot">
  <button class="link" onclick={() => app.openPage('terms')}>{link('terms')}</button>
  <button class="link" onclick={() => app.openPage('privacy')}>{link('privacy policy')}</button>
</footer>
