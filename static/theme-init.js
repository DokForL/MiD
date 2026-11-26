(() => {
  let mode = "system";
  try {
    const saved = localStorage.getItem("mid-theme");
    if (saved === "light" || saved === "dark") mode = saved;
  } catch {
    // Storage can be unavailable. Use the OS preference in that case.
  }

  const root = document.documentElement;
  root.dataset.themeMode = mode;
  root.classList.toggle(
    "dark",
    mode === "dark" || (mode === "system" && matchMedia("(prefers-color-scheme: dark)").matches),
  );
})();
