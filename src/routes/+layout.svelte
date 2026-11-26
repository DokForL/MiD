<script lang="ts">
  import "../app.css";
  import { onMount, tick } from "svelte";
  import { initThemeListener } from "$lib/stores/theme";
  // Runs locale detection and sets <html lang> before the first render.
  import "$lib/i18n";

  onMount(() => {
    let stopThemeListener: (() => void) | undefined;
    let destroyed = false;
    void tick().then(() => {
      if (!destroyed) stopThemeListener = initThemeListener();
    });

    const root = document.documentElement;
    let resizeEnd: number | undefined;
    function handleResize() {
      if (resizeEnd === undefined) {
        root.classList.add("viewport-resizing");
      } else {
        window.clearTimeout(resizeEnd);
      }
      resizeEnd = window.setTimeout(() => {
        resizeEnd = undefined;
        root.classList.remove("viewport-resizing");
      }, 150);
    }
    window.addEventListener("resize", handleResize);
    return () => {
      destroyed = true;
      stopThemeListener?.();
      window.removeEventListener("resize", handleResize);
      window.clearTimeout(resizeEnd);
      root.classList.remove("viewport-resizing");
    };
  });
</script>

<slot />
