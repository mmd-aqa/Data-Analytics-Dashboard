/*
 * smoke-test.js — Node smoke test for the pure-logic modules.
 * Stubs the few browser globals the logic touches, loads the App.* modules,
 * feeds the Titanic sample, and asserts KPI / missing / correlation / filter
 * computations. Not shipped — dev verification only. Run: node test/smoke-test.js
 */
const fs = require("fs");
const path = require("path");
const vm = require("vm");

const ROOT = path.join(__dirname, "..");

// Minimal DOM/document stubs — enough for the logic modules (no rendering used).
const noop = () => {};
const fakeEl = () => ({
  className: "", innerHTML: "", style: {}, dataset: {},
  appendChild: noop, querySelector: () => fakeEl(), querySelectorAll: () => [],
  addEventListener: noop, classList: { add: noop, remove: noop, contains: () => false, toggle: () => false },
  setAttribute: noop, remove: noop, click: noop,
});
const sandbox = {
  window: {},
  document: {
    documentElement: { classList: { contains: () => false } },
    createElement: fakeEl,
    getElementById: () => fakeEl(),
    querySelector: () => fakeEl(),
    querySelectorAll: () => [],
    addEventListener: noop,
    body: fakeEl(),
  },
  console,
  setTimeout,
  clearTimeout,
};
sandbox.window.document = sandbox.document;
sandbox.window.matchMedia = () => ({ matches: false });
vm.createContext(sandbox);

function load(file) {
  const code = fs.readFileSync(path.join(ROOT, file), "utf8");
  vm.runInContext(code, sandbox, { filename: file });
}

// Load only the modules whose logic we test (skip UI-heavy ones).
["js/utils.js", "js/state.js"].forEach(load);
// statistics.js & correlation.js reference App.ui/App.charts at module load via
// destructuring; provide harmless stubs first.
sandbox.window.App.ui = { alertBox: () => fakeEl(), buildTable: () => fakeEl(), buildSortableTable: () => fakeEl() };
sandbox.window.App.charts = { plot: noop, layout: () => ({}), GREEN: "#217346" };
["js/statistics.js", "js/correlation.js", "js/insights.js"].forEach(load);

const App = sandbox.window.App;

/* ------------------------------- Test data ----------------------------- */
const sampleSrc = fs.readFileSync(path.join(ROOT, "assets/sample-data.js"), "utf8");
vm.runInContext(sampleSrc, sandbox);
const csv = sandbox.window.SAMPLE_CSV;

// Tiny CSV parser (sample has quoted fields).
function parseCSV(text) {
  const lines = text.trim().split("\n");
  const headers = splitLine(lines[0]);
  return lines.slice(1).map((line) => {
    const cells = splitLine(line);
    const row = {};
    headers.forEach((h, i) => {
      let v = cells[i] === undefined ? "" : cells[i];
      if (v !== "" && !isNaN(Number(v))) v = Number(v);
      row[h] = v;
    });
    return row;
  });
}
function splitLine(line) {
  const out = []; let cur = ""; let q = false;
  for (let i = 0; i < line.length; i++) {
    const c = line[i];
    if (c === '"') { if (q && line[i + 1] === '"') { cur += '"'; i++; } else q = !q; }
    else if (c === "," && !q) { out.push(cur); cur = ""; }
    else cur += c;
  }
  out.push(cur);
  return out;
}

const rows = parseCSV(csv);
const columns = Object.keys(rows[0]);
App.state.setData(rows, columns, { isExample: true, fileName: "titanic.csv" });

/* ------------------------------- Assertions ---------------------------- */
let pass = 0, fail = 0;
function assert(name, cond, detail) {
  if (cond) { pass++; console.log("  ✓ " + name); }
  else { fail++; console.log("  ✗ " + name + (detail ? " — " + detail : "")); }
}

console.log("\n[Phase 11] modules loaded");
assert("App namespace populated", App.state && App.statistics && App.correlation);

console.log("\n[load] dataset");
assert("rows parsed", rows.length > 50, `got ${rows.length}`);
assert("columns detected", columns.length === 12, `got ${columns.length}`);

console.log("\n[state] type detection");
assert("Age is numeric", App.state.isNumericCol("Age"));
assert("Sex is categorical", !App.state.isNumericCol("Sex"));
assert("numeric columns found", App.state.numericColumns().length >= 5);

console.log("\n[Phase 2] KPI summary");
const s = App.statistics.computeSummary();
assert("summary.rows matches", s.rows === rows.length, `${s.rows}`);
assert("summary.columns = 12", s.columns === 12, `${s.columns}`);
assert("numeric + categorical = total", s.numeric + s.categorical === s.columns);
assert("missing is a number >= 0", typeof s.missing === "number" && s.missing >= 0, `${s.missing}`);
assert("duplicates is a number >= 0", typeof s.duplicates === "number" && s.duplicates >= 0, `${s.duplicates}`);

console.log("\n[Phase 3] missing values");
const miss = App.statistics.missingByColumn();
const ageMiss = miss.find((m) => m["ستون"] === "Age");
assert("Age has missing values", ageMiss && ageMiss["تعداد گمشده"] > 0, JSON.stringify(ageMiss));
assert("missing pct within 0..100", miss.every((m) => m._pct >= 0 && m._pct <= 100));

console.log("\n[Phase 4] correlation");
const r = App.correlation.pearson("Age", "Age");
assert("self-correlation = 1", Math.abs(r - 1) < 1e-9, `${r}`);
const { cols, matrix, pairs } = App.correlation.computeMatrix();
assert("matrix is square", matrix.length === cols.length && matrix.every((row) => row.length === cols.length));
assert("diagonal = 1", cols.every((_, i) => Math.abs(matrix[i][i] - 1) < 1e-9));
assert("all r within [-1,1]", pairs.every((p) => p.r >= -1.0001 && p.r <= 1.0001));

console.log("\n[Phase 8] outliers (IQR)");
const fareOut = App.statistics.outlierCount("Fare");
assert("Fare outlier count >= 0", fareOut.count >= 0, JSON.stringify(fareOut));
assert("Fare bounds computed", isFinite(fareOut.lower) && isFinite(fareOut.upper));

console.log("\n[describe] stats");
const desc = App.statistics.describeRows();
assert("describe has 8 stat rows", desc.length === 8, `${desc.length}`);
const meanRow = desc.find((d) => d["آماره"] === "mean");
assert("mean Age is plausible (20..40)", meanRow.Age > 20 && meanRow.Age < 40, `${meanRow.Age}`);

console.log("\n[Phase 6/7] filters + search");
App.state.setFilters([{ col: "Sex", kind: "categorical", op: "=", value: ["female"] }]);
const femView = App.state.getView();
assert("filter Sex=female reduces rows", femView.length > 0 && femView.length < rows.length, `${femView.length}`);
assert("filtered rows are all female", femView.every((r) => r.Sex === "female"));
App.state.setFilters([{ col: "Age", kind: "numeric", op: ">", value: 30 }]);
const ageView = App.state.getView();
assert("numeric filter Age>30 works", ageView.every((r) => Number(r.Age) > 30), `${ageView.length} rows`);
App.state.setFilters([]);
App.state.setSearch("Heikkinen");
const searchView = App.state.getView();
assert("global search finds match", searchView.length >= 1 && searchView.length < rows.length, `${searchView.length}`);
App.state.setSearch("");

/* ---------------------- Audit fixes & new features --------------------- */
console.log("\n[audit] subscriber leak fix");
let fireCount = 0;
App.state.subscribe(() => fireCount++);
App.state.refresh();
assert("subscriber fires once after one subscribe", fireCount === 1, `${fireCount}`);
// Reloading data must clear old subscribers (no accumulation).
App.state.setData(rows, columns, { isExample: true, fileName: "titanic.csv" });
fireCount = 0;
App.state.refresh();
assert("setData clears old subscribers", fireCount === 0, `${fireCount}`);

console.log("\n[audit] correlation ignores blanks (not coerced to 0)");
// Build a tiny dataset where one column has nulls; null must be skipped, not 0.
const tiny = [
  { x: 1, y: 2 }, { x: 2, y: 4 }, { x: 3, y: 6 },
  { x: 4, y: null }, { x: 5, y: "" },
];
App.state.setData(tiny, ["x", "y"], { fileName: "tiny" });
const rxy = App.correlation.pearson("x", "y");
assert("perfect linear corr on present pairs = 1", Math.abs(rxy - 1) < 1e-9, `${rxy}`);
// restore sample
App.state.setData(rows, columns, { isExample: true, fileName: "titanic.csv" });

console.log("\n[Phase 9] dataset meta");
const meta = App.state.meta();
assert("meta has fileName", meta.name === "titanic.csv", meta.name);
assert("meta memory estimate > 0", meta.memoryBytes > 0, `${meta.memoryBytes}`);

console.log("\n[Phase 7] quality score");
const q = App.statistics.computeQualityScore();
assert("score within 0..100", q.score >= 0 && q.score <= 100, `${q.score}`);
assert("rating assigned", ["عالی", "خوب", "متوسط", "ضعیف"].includes(q.rating), q.rating);
assert("breakdown components present", ["completeness", "uniqueness", "cleanliness", "structural"].every((k) => typeof q[k] === "number"));
assert("column quality covers all columns", q.colq.length === columns.length, `${q.colq.length}`);

console.log("\n[Phase 7] constant/empty column detection");
const constData = [
  { a: 5, b: "x", c: "" }, { a: 5, b: "y", c: "" }, { a: 5, b: "z", c: "" },
];
App.state.setData(constData, ["a", "b", "c"], { fileName: "const" });
const q2 = App.statistics.computeQualityScore();
assert("constant column 'a' detected", q2.constantColumns.includes("a"), JSON.stringify(q2.constantColumns));
assert("empty column 'c' detected", q2.emptyColumns.includes("c"), JSON.stringify(q2.emptyColumns));
App.state.setData(rows, columns, { isExample: true, fileName: "titanic.csv" });

console.log("\n[Phase 8] auto-insights");
const ins = App.insights.compute();
assert("insights produced", Array.isArray(ins) && ins.length >= 3, `${ins.length}`);
assert("each insight has tone+text", ins.every((i) => i.tone && i.text));
assert("first insight mentions row/col counts", /ستون|ردیف/.test(ins[0].text));

console.log(`\nRESULT: ${pass} passed, ${fail} failed\n`);
process.exit(fail ? 1 : 0);
