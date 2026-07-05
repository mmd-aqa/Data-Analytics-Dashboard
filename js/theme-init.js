// Theme initialization — runs before first paint to avoid a flash of the wrong
// theme (FOUC). Must stay a render-blocking <script src> in <head>, ahead of the
// rest of the app. Default to Light Mode on first visit; respect the saved choice
// otherwise. Kept in its own file (no inline script) for maintainability and
// future CSP compatibility.
(function () {
  const dark = localStorage.getItem("theme") === "dark";
  document.documentElement.classList.toggle("dark", dark);
})();
