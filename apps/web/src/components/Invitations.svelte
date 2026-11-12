<script lang="ts">
  import { tick } from 'svelte';
  import { invitationText, newLinkSet } from '../lib/invitations.ts';
  import type { AppState } from '../lib/state.svelte.ts';

  /**
   * The invitation page (ADR 0021): the person at Mechanism presses "New set", copies the text of
   * one invitation, and pastes it into one email. The text lives in this component only, never
   * in the state, the store or the address, and it is copied once: after a good copy it leaves
   * the page, so the easy way to send one set to two people is gone. "New set" always replaces
   * what was there. The page asks the server nothing.
   */
  let { app }: { app: AppState } = $props();

  const COPY_FAILED = 'CLIENT_COPY_FAILED';
  /** The text of the set on the page, or empty: none made yet, or copied. */
  let text = $state('');
  let copied = $state(false);
  let failed = $state(false);
  let field: HTMLTextAreaElement | undefined = $state();
  let newButton: HTMLButtonElement | undefined = $state();

  function newSet(): void {
    const slug = app.workshop?.config.slug ?? '';
    text = invitationText(app.copy, newLinkSet(location.origin, slug, app.invitationWave));
    copied = false;
    failed = false;
  }

  async function copyText(): Promise<void> {
    try {
      // A browser without the clipboard API, or one that refuses it, is the one failure path.
      if (!navigator.clipboard?.writeText) throw new Error(COPY_FAILED);
      await navigator.clipboard.writeText(text);
    } catch {
      failed = true;
      // The text stays, selected, so Cmd or Ctrl and C copies it by hand (ADR 0021).
      await tick();
      field?.focus();
      field?.select();
      return;
    }
    // Copied once: the text leaves the page and this component's memory.
    text = '';
    failed = false;
    copied = true;
    // The button pressed is gone; the focus goes to the next thing to do.
    await tick();
    newButton?.focus();
  }
</script>

<div class="invitations">
  <h1 id="invitations-title">{app.copy.text('Invitation page: title')}</h1>
  <p>{app.copy.text('Invitation page: intro')}</p>
  <ul class="rules">
    {#each app.copy.paragraphs('Invitation page: rules') as rule, i (i)}
      <li>{rule}</li>
    {/each}
  </ul>
  <div class="row">
    <button type="button" class="primary" bind:this={newButton} onclick={newSet}
      >{app.copy.item('Invitation page: buttons', 'new')}</button
    >
    {#if text}
      <button type="button" onclick={copyText}
        >{app.copy.item('Invitation page: buttons', 'copy')}</button
      >
    {/if}
  </div>
  <!-- Present from the start, so a screen reader says the line when it appears. -->
  <p class="said" role="status">{copied ? app.copy.text('Invitation page: copied') : ''}</p>
  {#if failed}
    <p role="alert"><code>{COPY_FAILED}</code>: {app.copy.error(COPY_FAILED)}</p>
  {/if}
  {#if text}
    <textarea
      bind:this={field}
      readonly
      rows="14"
      spellcheck="false"
      aria-labelledby="invitations-title"
      value={text}></textarea>
  {/if}
</div>
