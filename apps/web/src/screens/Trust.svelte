<script lang="ts">
  import { fill, inline } from '../lib/copy.ts';
  import type { AppState } from '../lib/state.svelte.ts';

  /**
   * The trust page (docs/screen-map.md, Always reachable; architecture plan, section 13): the
   * seven sections from copy.md, with the key fingerprint from the workshop file and the source
   * address filled in by the app, so the page cannot drift from the key it describes; then the
   * links that need no trust in us (the source at this version, the two scanners), and the terms
   * and the privacy policy.
   */
  let { app }: { app: AppState } = $props();
  const variable = (key: Parameters<typeof app.copy.item<'Trust page variables'>>[1]) =>
    app.copy.item('Trust page variables', key);
  const link = (key: Parameters<typeof app.copy.item<'Trust page links'>>[1]) =>
    app.copy.item('Trust page links', key);
  const sections = [
    ['what we store', 'Trust page: what we store'],
    ['what we never collect', 'Trust page: what we never collect'],
    ['how it is protected', 'Trust page: how it is protected'],
    ['check it yourself', 'Trust page: check it yourself'],
    ['your controls', 'Trust page: your controls'],
    ['who, where, until when', 'Trust page: who, where, until when'],
    ['the honest limit', 'Trust page: the honest limit'],
  ] as const;
  const slots = $derived({
    'key fingerprint': app.workshop?.keyFingerprint ?? '',
    source: variable('source'),
  });
</script>

<h1>{app.copy.item('Titles', 'trust page')}</h1>
{#each sections as [heading, block] (block)}
  <section>
    <h2>{app.copy.item('Trust page headings', heading)}</h2>
    {#each app.copy.paragraphs(block) as paragraph, i (i)}
      <p>
        {#each inline(fill(paragraph, slots)) as run, j (j)}
          {#if run.bold}<strong>{run.text}</strong>{:else}{run.text}{/if}
        {/each}
      </p>
    {/each}
  </section>
{/each}
<ul>
  <li><a href={app.sourceHref}>{link('source')}</a></li>
  <li><a href={variable('webbkoll')}>{link('webbkoll')}</a></li>
  <li><a href={variable('blacklight')}>{link('blacklight')}</a></li>
</ul>
<div class="row">
  <button onclick={() => app.openPage('terms')}>{link('terms')}</button>
  <button onclick={() => app.openPage('privacy')}>{link('privacy policy')}</button>
  <button onclick={() => app.closePage()}>{app.copy.item('Buttons', 'back')}</button>
</div>
