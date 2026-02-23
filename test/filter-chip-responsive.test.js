const test = require("node:test");
const assert = require("node:assert/strict");
const path = require("node:path");
const fsp = require("node:fs/promises");

test("filter chips wrap by default and become horizontally scrollable on ultra-small screens", async () => {
  const cssPath = path.join(__dirname, "..", "public", "styles.css");
  const css = await fsp.readFile(cssPath, "utf8");

  assert.match(css, /\.status-filters\s*\{[^}]*flex-wrap:\s*wrap/is);
  assert.match(css, /max-width:\s*360px[\s\S]*?\.status-filters\s*\{[^}]*display:\s*flex\s*!important/is);
  assert.match(css, /max-width:\s*360px[\s\S]*?\.status-filters\s*\{[^}]*grid-template-columns:\s*none\s*!important/is);
  assert.match(css, /max-width:\s*360px[\s\S]*?\.status-filters\s*\{[^}]*flex-wrap:\s*nowrap/is);
  assert.match(css, /max-width:\s*360px[\s\S]*?\.status-filters\s*\{[^}]*overflow-x:\s*auto/is);
  assert.match(css, /max-width:\s*360px[\s\S]*?\.filter-chip\s*\{[^}]*flex:\s*0\s+0\s+auto/is);
});
