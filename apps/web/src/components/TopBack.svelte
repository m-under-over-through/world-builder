<script lang="ts">
  /**
   * Back at the top of the about page, the terms and the policy, above the title (ADR 0019): a
   * ghost pill with a left arrow, as the design draws Back, doing what the Back at the bottom
   * does (`app.back`), so a long page can be left without scrolling to its end.
   */
  let { label, onclick }: { label: string; onclick: () => void } = $props();
</script>

<div class="top-back">
  <button type="button" class="back-pill" {onclick}>
    <svg
      aria-hidden="true"
      width="18"
      height="18"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      stroke-width="1.75"
      stroke-linecap="round"
      stroke-linejoin="round"><path d="M19 12H5M11 6l-6 6 6 6" /></svg
    >
    {label}
  </button>
</div>
