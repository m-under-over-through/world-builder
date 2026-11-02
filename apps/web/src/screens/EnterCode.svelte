<script lang="ts">
  import { groupDigits } from '../lib/code-input.ts';
  import type { AppState } from '../lib/state.svelte.ts';

  /**
   * Enter code (docs/screen-map.md, Entry), at /<slug>/continue: a 16-digit field on a numeric
   * keypad, the digits grouped by four as they are typed and never more than sixteen
   * (lib/code-input.ts), then GET /me with the code. Enter on the keypad is Continue.
   */
  let { app }: { app: AppState } = $props();
  let codeInput = $state('');

  function onInput(event: Event) {
    const field = event.currentTarget as HTMLInputElement;
    codeInput = groupDigits(field.value);
    field.value = codeInput;
  }
</script>

<h1>{app.copy.item('Titles', 'enter code')}</h1>
<p>{app.copy.text('Enter code')}</p>
<form
  onsubmit={(event) => {
    event.preventDefault();
    void app.continueWithCode(codeInput);
  }}
>
  <input
    class="code"
    inputmode="numeric"
    autocomplete="off"
    enterkeyhint="go"
    maxlength="19"
    placeholder="1234 5678 9012 3456"
    aria-label={app.copy.item('Titles', 'enter code')}
    value={codeInput}
    oninput={onInput}
  />
  {#if app.tooShort}<p>{app.copy.text('Enter code: too short')}</p>{/if}
  {#if app.error}<p>{app.copy.error(app.error)}</p>{/if}
  <div class="row">
    <button class="primary" type="submit"
      ><span>{app.copy.item('Buttons', 'continue')}</span></button
    >
    <button type="button" onclick={() => app.navigate()}>{app.copy.item('Buttons', 'back')}</button>
  </div>
</form>
