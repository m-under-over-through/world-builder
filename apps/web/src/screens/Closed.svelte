<script lang="ts">
  import { fill } from '../lib/copy.ts';
  import type { AppState } from '../lib/state.svelte.ts';

  /**
   * Closed (docs/screen-map.md, Offline and failure behaviour): the workshop is past its close
   * day, or, for a new arrival before the opening day, not open yet. The link to the trust page
   * comes with item 8.
   */
  let { app }: { app: AppState } = $props();
  /** "16 November 2026" in the phone's language; noon avoids the day shifting at a timezone edge. */
  const longDay = (day: string) =>
    new Date(`${day}T12:00:00`).toLocaleDateString(undefined, {
      day: 'numeric',
      month: 'long',
      year: 'numeric',
    });
</script>

{#if app.notYetOpen && app.workshop}
  <h1>{app.copy.item('Titles', 'not open yet')}</h1>
  <p>{fill(app.copy.text('Not open yet'), { day: longDay(app.workshop.opensDay) })}</p>
{:else}
  <h1>{app.copy.item('Titles', 'closed')}</h1>
  <p>{app.copy.text('Closed')}</p>
{/if}
