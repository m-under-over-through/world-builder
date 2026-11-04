<script lang="ts">
  import TopBack from '../components/TopBack.svelte';
  import { inline } from '../lib/copy.ts';
  import type { AppState } from '../lib/state.svelte.ts';

  /**
   * The terms and the privacy policy (docs/screen-map.md, Always reachable): static text from
   * copy.md, paragraph by paragraph, the drafts' `**lead-ins**` shown in bold without any HTML
   * from the file. Which of the two is `app.screen`. Back at the top and at the bottom.
   */
  let { app }: { app: AppState } = $props();
  const policy = $derived(app.screen === 'privacy');
</script>

<TopBack label={app.copy.item('Buttons', 'back')} onclick={() => app.closePage()} />
<h1>{app.copy.item('Titles', policy ? 'privacy policy' : 'terms')}</h1>
{#each app.copy.paragraphs(policy ? 'Privacy policy' : 'Terms') as paragraph, i (i)}
  <p>
    {#each inline(paragraph) as run, j (j)}
      {#if run.bold}<strong>{run.text}</strong>{:else}{run.text}{/if}
    {/each}
  </p>
{/each}
<div class="row">
  <button onclick={() => app.closePage()}>{app.copy.item('Buttons', 'back')}</button>
</div>
