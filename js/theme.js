(function (global) {
  const KEY = "kas-harian-theme";
  const root = document.documentElement;

  function iconFor(dark) {
    return dark ? "light_mode" : "dark_mode";
  }

  function apply(dark) {
    root.classList.toggle("dark", dark);
    root.classList.toggle("light", !dark);
    document.querySelectorAll("[data-theme-icon]").forEach((el) => {
      el.textContent = iconFor(dark);
    });
  }

  function isDark() {
    const saved = localStorage.getItem(KEY);
    if (saved === "dark") return true;
    if (saved === "light") return false;
    return window.matchMedia("(prefers-color-scheme: dark)").matches;
  }

  function toggle() {
    const next = !root.classList.contains("dark");
    localStorage.setItem(KEY, next ? "dark" : "light");
    apply(next);
  }

  function bind() {
    apply(isDark());
    document.querySelectorAll("[data-theme-toggle]").forEach((btn) => {
      btn.addEventListener("click", toggle);
    });
  }

  global.Theme = { apply, isDark, toggle, bind };
  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", bind);
  } else {
    bind();
  }
})(window);
