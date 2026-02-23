const test = require("node:test");
const assert = require("node:assert/strict");
const path = require("node:path");
const fsp = require("node:fs/promises");

test("dashboard UI uses dark theme + card grid layout", async () => {
  const htmlPath = path.join(__dirname, "..", "public", "index.html");
  const cssPath = path.join(__dirname, "..", "public", "styles.css");

  const [html, css] = await Promise.all([
    fsp.readFile(htmlPath, "utf8"),
    fsp.readFile(cssPath, "utf8"),
  ]);

  assert.match(html, /<link\s+[^>]*href="\/styles\.css"/i);
  assert.match(html, /<script\s+[^>]*src="\/app\.js"[^>]*defer/i);
  assert.match(html, /data-testid="session-grid"/);
  assert.match(html, /data-testid="last-refreshed"/);
  assert.match(html, /id="refresh-capture"/);

  assert.match(css, /color-scheme:\s*dark\s*;/i);
  assert.match(css, /\.grid\s*\{[^}]*display:\s*grid\s*;/is);
  assert.match(css, /grid-template-columns:\s*repeat\(\s*auto-fit\s*,\s*minmax\(/i);
  assert.match(css, /\.empty-state\b/);
  assert.match(css, /@keyframes\s+emptyPulse\b/i);
});

test("cards have left accent bar per status and hover transitions", async () => {
  const cssPath = path.join(__dirname, "..", "public", "styles.css");
  const css = await fsp.readFile(cssPath, "utf8");

  // Accent bar: each status maps to a colored left border
  assert.match(css, /\.card\.status-running\s*\{[^}]*border-left-color:\s*var\(--run\)/is);
  assert.match(css, /\.card\.status-completed\s*\{[^}]*border-left-color:\s*var\(--ok\)/is);
  assert.match(css, /\.card\.status-stalled\s*\{[^}]*border-left-color:\s*var\(--warn\)/is);
  assert.match(css, /\.card\.status-error\s*\{[^}]*border-left-color:\s*var\(--bad\)/is);

  // Card has transition for smooth hover effect
  assert.match(css, /\.card\s*\{[^}]*transition:/is);

  // Hover state includes transform
  assert.match(css, /\.card:hover\s*\{[^}]*transform:/is);
});

test("filter chips toggle visually via checked/unchecked styles", async () => {
  const cssPath = path.join(__dirname, "..", "public", "styles.css");
  const css = await fsp.readFile(cssPath, "utf8");

  // Checked styling should apply either via JS-applied class or via :has() when supported.
  assert.match(css, /\.filter-chip\.is-checked\b/);
  assert.match(css, /\.filter-chip\.active\b/);
  assert.match(css, /\.filter-chip:has\(input:checked\)/);

  // Ensure unsupported browsers don't drop the entire rule due to an unknown selector
  // inside a comma-separated selector list.
  assert.doesNotMatch(css, /\.filter-chip\.is-checked\s*,\s*\.filter-chip:has\(input:checked\)\s*\{/);

  // The input must remain interactive (not display:none), otherwise some browsers won't toggle reliably.
  assert.doesNotMatch(css, /\.filter-chip input\s*\{[^}]*display:\s*none\s*;/is);
  assert.match(css, /\.filter-chip\s*\{[^}]*position:\s*relative\s*;/is);
  assert.match(css, /\.filter-chip input\s*\{[^}]*position:\s*absolute\s*;/is);
  assert.match(css, /\.filter-chip input\s*\{[^}]*opacity:\s*0\s*;/is);

  // Unchecked state should visually downplay the pip.
  assert.match(css, /\.filter-chip:not\(\.is-checked\):not\(\.active\)\s+\.pip\b/);
  assert.match(css, /\.filter-chip:has\(input:not\(:checked\)\)\s+\.pip\b/);
});

test("terminal preview has polished styling: contrast, glow, scrollbar, line numbers", async () => {
  const cssPath = path.join(__dirname, "..", "public", "styles.css");
  const css = await fsp.readFile(cssPath, "utf8");

  // Higher contrast background
  assert.match(css, /\.term\s*\{[^}]*background:\s*rgba\(0,\s*0,\s*0,\s*0\.45\)/is);

  // Subdued text for terminal (lower in hierarchy)
  assert.match(css, /\.term\s*\{[^}]*color:\s*rgba\(231,\s*237,\s*247,\s*0\.78\)/is);

  // Glow effect via box-shadow
  assert.match(css, /\.term\s*\{[^}]*box-shadow:/is);

  // Firefox thin scrollbar
  assert.match(css, /\.term\s*\{[^}]*scrollbar-width:\s*thin/is);

  // WebKit scrollbar styling
  assert.match(css, /\.term::-webkit-scrollbar\b/);
  assert.match(css, /\.term::-webkit-scrollbar-thumb\b/);

  // Line number styling
  assert.match(css, /\.term\s+\.line-num\b/);
  assert.match(css, /\.line-num\s*\{[^}]*user-select:\s*none/is);
});

test("capture panel has polished scrollbar styling", async () => {
  const cssPath = path.join(__dirname, "..", "public", "styles.css");
  const css = await fsp.readFile(cssPath, "utf8");

  assert.match(css, /\.capture\s*\{[^}]*scrollbar-width:\s*thin/is);
  assert.match(css, /\.capture::-webkit-scrollbar\b/);
  assert.match(css, /\.capture::-webkit-scrollbar-thumb\b/);
  assert.match(css, /\.capture\s*\{[^}]*color:\s*rgba\(231,\s*237,\s*247,\s*0\.95\)/is);
});

test("header has subtle bottom border and session count badge", async () => {
  const htmlPath = path.join(__dirname, "..", "public", "index.html");
  const cssPath = path.join(__dirname, "..", "public", "styles.css");

  const [html, css] = await Promise.all([
    fsp.readFile(htmlPath, "utf8"),
    fsp.readFile(cssPath, "utf8"),
  ]);

  // HTML: badge element exists with correct attributes
  assert.match(html, /id="session-count"/);
  assert.match(html, /data-testid="session-count"/);
  assert.match(html, /class="session-count-badge"/);
  assert.match(html, /class="brand-row"/);

  // CSS: header has bottom border for separation
  assert.match(css, /\.top\s*\{[^}]*border-bottom:/is);

  // CSS: badge has pill shape and themed background
  assert.match(css, /\.session-count-badge\s*\{[^}]*border-radius:\s*999px/is);
  assert.match(css, /\.session-count-badge\s*\{[^}]*background:/is);

  // CSS: brand-row aligns title and badge inline
  assert.match(css, /\.brand-row\s*\{[^}]*display:\s*flex/is);
  assert.match(css, /\.brand-row\s*\{[^}]*align-items:\s*center/is);
});

test("card fade animations exist for filtering transitions", async () => {
  const cssPath = path.join(__dirname, "..", "public", "styles.css");
  const css = await fsp.readFile(cssPath, "utf8");

  // Keyframes for fade-in and fade-out
  assert.match(css, /@keyframes\s+cardFadeIn\b/);
  assert.match(css, /@keyframes\s+cardFadeOut\b/);

  // .fade-in class applies cardFadeIn animation
  assert.match(css, /\.card\.fade-in\s*\{[^}]*animation:\s*cardFadeIn\b/is);

  // .fade-out class applies cardFadeOut animation and disables pointer events
  assert.match(css, /\.card\.fade-out\s*\{[^}]*animation:\s*cardFadeOut\b/is);
  assert.match(css, /\.card\.fade-out\s*\{[^}]*pointer-events:\s*none/is);

  // Empty state also gets fade-in
  assert.match(css, /\.empty-state\.fade-in\s*\{[^}]*animation:\s*cardFadeIn\b/is);
});

test("filter chips have tactile press effect and status-colored glow", async () => {
  const cssPath = path.join(__dirname, "..", "public", "styles.css");
  const css = await fsp.readFile(cssPath, "utf8");

  // Press effect: scale down on :active
  assert.match(css, /\.filter-chip:active\s*\{[^}]*transform:[^}]*scale\(/is);

  // Hover lifts the chip
  assert.match(css, /\.filter-chip:hover\s*\{[^}]*transform:[^}]*translateY\(/is);

  // Status-colored glow when checked — each status has its own border-color
  assert.match(css, /\.filter-chip\.running\.is-checked[\s\S]*?border-color:/);
  assert.match(css, /\.filter-chip\.completed\.is-checked[\s\S]*?border-color:/);
  assert.match(css, /\.filter-chip\.stalled\.is-checked[\s\S]*?border-color:/);
  assert.match(css, /\.filter-chip\.error\.is-checked[\s\S]*?border-color:/);

  // Status-colored box-shadow glow when checked
  assert.match(css, /\.filter-chip\.running\.is-checked[\s\S]*?box-shadow:/);
  assert.match(css, /\.filter-chip\.completed\.is-checked[\s\S]*?box-shadow:/);
  assert.match(css, /\.filter-chip\.stalled\.is-checked[\s\S]*?box-shadow:/);
  assert.match(css, /\.filter-chip\.error\.is-checked[\s\S]*?box-shadow:/);
});

test("filter chips have checkmark icon that shows when checked", async () => {
  const htmlPath = path.join(__dirname, "..", "public", "index.html");
  const cssPath = path.join(__dirname, "..", "public", "styles.css");

  const [html, css] = await Promise.all([
    fsp.readFile(htmlPath, "utf8"),
    fsp.readFile(cssPath, "utf8"),
  ]);

  // HTML: each filter chip has an SVG checkmark with class="check"
  const checkCount = (html.match(/class="check"/g) || []).length;
  assert.ok(checkCount >= 4, `expected at least 4 checkmark icons, found ${checkCount}`);

  // CSS: checkmark hidden by default, shown when checked
  assert.match(css, /\.filter-chip\s+\.check\s*\{[^}]*display:\s*none/is);
  assert.match(css, /\.filter-chip\.is-checked\s+\.check[\s\S]*?display:\s*block/);
  assert.match(css, /\.filter-chip:has\(input:checked\)\s+\.check[\s\S]*?display:\s*block/);
});

test("filter chip pip scales down when unchecked for tactile feedback", async () => {
  const cssPath = path.join(__dirname, "..", "public", "styles.css");
  const css = await fsp.readFile(cssPath, "utf8");

  // Pip has transition for smooth state changes
  assert.match(css, /\.filter-chip\s+\.pip\s*\{[^}]*transition:/is);

  // Unchecked pip scales down
  assert.match(css, /\.filter-chip:not\(\.is-checked\):not\(\.active\)\s+\.pip\s*\{[^}]*transform:[^}]*scale\(/is);
  assert.match(css, /\.filter-chip:has\(input:not\(:checked\)\)\s+\.pip\s*\{[^}]*transform:[^}]*scale\(/is);
});

test("typography hierarchy: name > meta > kv > terminal with decreasing size and opacity", async () => {
  const cssPath = path.join(__dirname, "..", "public", "styles.css");
  const css = await fsp.readFile(cssPath, "utf8");

  // Session name: largest, boldest — primary hierarchy level
  assert.match(css, /\.name\s*\{[^}]*font-size:\s*15px/is);
  assert.match(css, /\.name\s*\{[^}]*font-weight:\s*650/is);
  assert.match(css, /\.name\s*\{[^}]*line-height:\s*1\.3/is);

  // Meta: uppercase label style — secondary hierarchy level
  assert.match(css, /\.meta\s*\{[^}]*font-size:\s*12px/is);
  assert.match(css, /\.meta\s*\{[^}]*text-transform:\s*uppercase/is);
  assert.match(css, /\.meta\s*\{[^}]*letter-spacing:\s*0\.3px/is);

  // KV labels: smallest uppercase — tertiary hierarchy level
  assert.match(css, /\.kv\s+\.k\s*\{[^}]*font-size:\s*11px/is);
  assert.match(css, /\.kv\s+\.k\s*\{[^}]*text-transform:\s*uppercase/is);
  assert.match(css, /\.kv\s+\.k\s*\{[^}]*letter-spacing:\s*0\.4px/is);

  // Terminal: smallest font, reduced opacity — lowest hierarchy level
  assert.match(css, /\.term\s*\{[^}]*font-size:\s*11px/is);
  assert.match(css, /\.term\s*\{[^}]*color:\s*rgba\(231,\s*237,\s*247,\s*0\.78\)/is);

  // Line numbers: even smaller and more recessive
  assert.match(css, /\.term\s+\.line-num\s*\{[^}]*font-size:\s*10px/is);

  // Progress labels: medium weight, smaller than name
  assert.match(css, /\.progress-label\s*\{[^}]*font-weight:\s*500/is);
  assert.match(css, /\.progress-top\s*\{[^}]*font-size:\s*12px/is);

  // Current task: italic to distinguish from other text
  assert.match(css, /\.task\s*\{[^}]*font-style:\s*italic/is);
  assert.match(css, /\.task\s*\{[^}]*font-size:\s*12px/is);
});

test("smooth scroll behavior is enabled on html element", async () => {
  const cssPath = path.join(__dirname, "..", "public", "styles.css");
  const css = await fsp.readFile(cssPath, "utf8");

  assert.match(css, /html\s*\{[^}]*scroll-behavior:\s*smooth/is);
});

test("smooth scroll respects prefers-reduced-motion", async () => {
  const cssPath = path.join(__dirname, "..", "public", "styles.css");
  const css = await fsp.readFile(cssPath, "utf8");

  assert.match(css, /prefers-reduced-motion[\s\S]*?html\s*\{[^}]*scroll-behavior:\s*auto/);
});

test("capture modal uses overlay dialog markup", async () => {
  const htmlPath = path.join(__dirname, "..", "public", "index.html");
  const html = await fsp.readFile(htmlPath, "utf8");

  assert.match(html, /id="modal-backdrop"/);
  assert.match(html, /class="modal"[^>]*role="dialog"/);
  assert.match(html, /class="modal"[^>]*aria-modal="true"/);
  assert.match(html, /id="close"[^>]*aria-label="Close"/);
});

test("capture modal has dark backdrop, centered layout, and scrollable content", async () => {
  const cssPath = path.join(__dirname, "..", "public", "styles.css");
  const css = await fsp.readFile(cssPath, "utf8");

  assert.match(css, /\.modal-backdrop\s*\{[^}]*position:\s*fixed/is);
  assert.match(css, /\.modal-backdrop\s*\{[^}]*inset:\s*0/is);
  assert.match(css, /\.modal-backdrop\s*\{[^}]*background:\s*rgba\(0,\s*0,\s*0,\s*0\.65\)/is);
  assert.match(css, /\.modal-backdrop\s*\{[^}]*place-items:\s*center/is);
  assert.match(css, /\.modal\s*\{[^}]*max-width:\s*700px/is);
  assert.match(css, /\.modal\s*\{[^}]*max-height:\s*80vh/is);
  assert.match(css, /max-width:\s*768px[\s\S]*?\.modal\s*\{[^}]*max-width:\s*90vw/is);
  assert.match(css, /\.capture\s*\{[^}]*overflow:\s*auto/is);
  assert.match(css, /\.capture\s*\{[^}]*min-height:\s*0/is);
});

test("tablet breakpoint at 768px stacks header, expands search, wraps filters, and uses one-column cards", async () => {
  const cssPath = path.join(__dirname, "..", "public", "styles.css");
  const css = await fsp.readFile(cssPath, "utf8");

  // 768px breakpoint exists
  assert.match(css, /@media\s*\(\s*max-width:\s*768px\s*\)/);

  // Inside 768px: header stacks vertically
  assert.match(css, /max-width:\s*768px[\s\S]*?\.top\s*\{[^}]*flex-direction:\s*column/);
  assert.match(css, /max-width:\s*768px[\s\S]*?\.controls\s*\{[^}]*align-items:\s*stretch/);

  // Search control takes a full row and input spans full width
  assert.match(css, /max-width:\s*768px[\s\S]*?\.search\s*\{[^}]*flex:\s*1\s+1\s+100%/);
  assert.match(css, /max-width:\s*768px[\s\S]*?\.search input\s*\{[^}]*width:\s*100%/);

  // Filter chips still wrap and take a full row
  assert.match(css, /\.status-filters\s*\{[^}]*flex-wrap:\s*wrap/);
  assert.match(css, /max-width:\s*768px[\s\S]*?\.status-filters\s*\{[^}]*flex:\s*1\s+1\s+100%/);

  // Cards become single column
  assert.match(css, /max-width:\s*768px[\s\S]*?\.grid\s*\{[^}]*grid-template-columns:\s*1fr/);

  // Inside 768px: wrap has reduced padding
  assert.match(css, /max-width:\s*768px[\s\S]*?\.wrap\s*\{[^}]*padding:/);
});

test("mobile widths 414px and 375px use compact controls and typography rules", async () => {
  const cssPath = path.join(__dirname, "..", "public", "styles.css");
  const css = await fsp.readFile(cssPath, "utf8");

  const maxWidthBreakpoints = Array.from(css.matchAll(/@media\s*\(\s*max-width:\s*(\d+)px\s*\)/g), (m) => Number(m[1]));
  const hasCoverage = (width) => maxWidthBreakpoints.some((bp) => width <= bp);

  // Ensure the target mobile widths are covered by at least one max-width query.
  assert.ok(hasCoverage(414), "expected responsive CSS coverage for 414px viewport");
  assert.ok(hasCoverage(375), "expected responsive CSS coverage for 375px viewport");
  assert.match(css, /@media\s*\(\s*max-width:\s*480px\s*\)/);
  assert.match(css, /@media\s*\(\s*max-width:\s*414px\s*\)/);
  assert.match(css, /@media\s*\(\s*max-width:\s*375px\s*\)/);

  // Inside 480px: tighter spacing and smaller type for readability.
  assert.match(css, /max-width:\s*480px[\s\S]*?\.top\s*\{[^}]*padding:\s*12px\s+12px\s+10px/);
  assert.match(css, /max-width:\s*480px[\s\S]*?h1\s*\{[^}]*font-size:\s*16px/);
  assert.match(css, /max-width:\s*480px[\s\S]*?\.card\s*\{[^}]*padding:\s*12px\s+12px\s+10px\s+14px/);
  assert.match(css, /max-width:\s*480px[\s\S]*?\.filter-chip\s*\{[^}]*font-size:\s*11px/);
  assert.match(css, /max-width:\s*480px[\s\S]*?button\s*\{[^}]*font-size:\s*13px/);
  assert.match(css, /max-width:\s*480px[\s\S]*?\.term\s*\{[^}]*padding:\s*8px\s+10px/);
  assert.match(css, /max-width:\s*480px[\s\S]*?\.term\s*\{[^}]*font-size:\s*9\.5px/);
  assert.match(css, /max-width:\s*480px[\s\S]*?\.term\s+\.line-num\s*\{[^}]*font-size:\s*9px/);

  // 414px: chips move to a 2-column grid and refresh becomes full width for easier tap targets.
  assert.match(css, /max-width:\s*414px[\s\S]*?\.status-filters\s*\{[^}]*display:\s*grid/);
  assert.match(css, /max-width:\s*414px[\s\S]*?\.status-filters\s*\{[^}]*grid-template-columns:\s*repeat\(2,\s*minmax\(0,\s*1fr\)\)/);
  assert.match(css, /max-width:\s*414px[\s\S]*?\.filter-chip\s*\{[^}]*justify-content:\s*center/);
  assert.match(css, /max-width:\s*414px[\s\S]*?#refresh\s*\{[^}]*width:\s*100%/);

  // 375px: compact header/modal actions prevent cramped controls on narrow phones.
  assert.match(css, /max-width:\s*375px[\s\S]*?\.brand-row\s*\{[^}]*flex-wrap:\s*wrap/);
  assert.match(css, /max-width:\s*375px[\s\S]*?\.modal-actions\s*\{[^}]*width:\s*100%/);
  assert.match(css, /max-width:\s*375px[\s\S]*?\.modal-actions button\s*\{[^}]*flex:\s*1\s+1\s+0/);
});

test("viewport meta tag includes viewport-fit=cover for notched devices", async () => {
  const htmlPath = path.join(__dirname, "..", "public", "index.html");
  const html = await fsp.readFile(htmlPath, "utf8");

  assert.match(html, /viewport-fit=cover/);
});

test("updateSessionCount updates badge text content", async () => {
  const appPath = path.join(__dirname, "..", "public", "app.js");
  const vm = require("node:vm");
  const appSource = await fsp.readFile(appPath, "utf8");

  const badge = { textContent: "0" };
  const ctx = vm.createContext({
    __AGENT_DASHBOARD_NO_BOOT__: true,
    window: { setInterval() {} },
    localStorage: { getItem() { return null; }, setItem() {} },
    document: {
      getElementById(id) {
        if (id === "session-count") return badge;
        return null;
      },
      querySelector() { return null; },
    },
    fetch() { throw new Error("unexpected fetch"); },
    console,
  });

  vm.runInContext(appSource, ctx, { filename: "app.js" });
  const ex = ctx.__agentDashboardExports;

  ex.updateSessionCount(5);
  assert.equal(badge.textContent, "5");

  ex.updateSessionCount(0);
  assert.equal(badge.textContent, "0");
});

test("search input has focus-visible ring with transition", async () => {
  const cssPath = path.join(__dirname, "..", "public", "styles.css");
  const css = await fsp.readFile(cssPath, "utf8");

  // Search input has transition for border-color and box-shadow
  assert.match(css, /\.search input\s*\{[^}]*transition:[^}]*border-color/is);
  assert.match(css, /\.search input\s*\{[^}]*transition:[^}]*box-shadow/is);

  // Focus-visible produces a blue ring
  assert.match(css, /\.search input:focus-visible\s*\{[^}]*border-color:/is);
  assert.match(css, /\.search input:focus-visible\s*\{[^}]*box-shadow:\s*0 0 0 3px/is);
});

test("buttons have smooth transition and focus-visible ring", async () => {
  const cssPath = path.join(__dirname, "..", "public", "styles.css");
  const css = await fsp.readFile(cssPath, "utf8");

  // Button base has transition for background, border-color, box-shadow, and transform
  assert.match(css, /^button\s*\{[^}]*transition:[^}]*background/ism);
  assert.match(css, /^button\s*\{[^}]*transition:[^}]*border-color/ism);
  assert.match(css, /^button\s*\{[^}]*transition:[^}]*box-shadow/ism);
  assert.match(css, /^button\s*\{[^}]*transition:[^}]*transform/ism);

  // Hover brightens border
  assert.match(css, /^button:hover\s*\{[^}]*border-color:/ism);

  // Active has shorter transition for snappy feel
  assert.match(css, /^button:active\s*\{[^}]*transition-duration:\s*0\.05s/ism);

  // Focus-visible produces a blue ring
  assert.match(css, /^button:focus-visible\s*\{[^}]*border-color:/ism);
  assert.match(css, /^button:focus-visible\s*\{[^}]*box-shadow:\s*0 0 0 3px/ism);
});

test("filter chips have focus-within ring for keyboard accessibility", async () => {
  const cssPath = path.join(__dirname, "..", "public", "styles.css");
  const css = await fsp.readFile(cssPath, "utf8");

  assert.match(css, /\.filter-chip:focus-within\s*\{[^}]*border-color:/is);
  assert.match(css, /\.filter-chip:focus-within\s*\{[^}]*box-shadow:\s*0 0 0 3px/is);
});

test("link buttons have color transition and focus-visible outline", async () => {
  const cssPath = path.join(__dirname, "..", "public", "styles.css");
  const css = await fsp.readFile(cssPath, "utf8");

  // Transition on color and text-decoration-color
  assert.match(css, /\.link\s*\{[^}]*transition:[^}]*color/is);
  assert.match(css, /\.link\s*\{[^}]*transition:[^}]*text-decoration-color/is);

  // Hover brightens to white
  assert.match(css, /\.link:hover\s*\{[^}]*color:\s*#fff/is);

  // Focus-visible uses outline instead of box-shadow (inline element)
  assert.match(css, /\.link:focus-visible\s*\{[^}]*outline:/is);
  assert.match(css, /\.link:focus-visible\s*\{[^}]*outline-offset:/is);
});

test("ghost buttons have distinct hover background", async () => {
  const cssPath = path.join(__dirname, "..", "public", "styles.css");
  const css = await fsp.readFile(cssPath, "utf8");

  assert.match(css, /\.ghost\s*\{[^}]*background:\s*transparent/is);
  assert.match(css, /\.ghost:hover\s*\{[^}]*background:/is);
});

test("prefers-reduced-motion disables transitions and hover transforms", async () => {
  const cssPath = path.join(__dirname, "..", "public", "styles.css");
  const css = await fsp.readFile(cssPath, "utf8");

  // Reduced-motion block shortens transition-duration for interactive elements
  assert.match(css, /prefers-reduced-motion[\s\S]*?button[\s\S]*?transition-duration/);
  assert.match(css, /prefers-reduced-motion[\s\S]*?\.filter-chip[\s\S]*?transition-duration/);
  assert.match(css, /prefers-reduced-motion[\s\S]*?\.search input[\s\S]*?transition-duration/);

  // Hover transforms are disabled
  assert.match(css, /prefers-reduced-motion[\s\S]*?\.card:hover[\s\S]*?transform:\s*none/);
  assert.match(css, /prefers-reduced-motion[\s\S]*?\.filter-chip:hover[\s\S]*?transform:\s*none/);
});
