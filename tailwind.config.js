/** @type {import('tailwindcss').Config} */
module.exports = {
  // Preflight off: globals.css owns the base styles. Tailwind is additive,
  // used by the sidebar, dropdown and calendar patterns.
  corePlugins: { preflight: false },
  content: ["./app/**/*.{js,jsx}", "./components/**/*.{js,jsx}"],
  theme: { extend: {} },
  plugins: [],
};
