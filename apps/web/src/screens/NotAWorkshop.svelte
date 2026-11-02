<script lang="ts">
  import type { AppState } from '../lib/state.svelte.ts';

  /** An address that is not a workshop: there is nothing to do here but follow the link you were sent. */
  let { app }: { app: AppState } = $props();
</script>

<h1>{app.copy.item('Titles', 'not a workshop')}</h1>
<p>{app.copy.text('Not a workshop')}</p>
