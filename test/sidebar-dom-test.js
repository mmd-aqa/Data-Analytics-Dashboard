/*
 * sidebar-dom-test.js — Behavioural test for js/sidebar.js against a minimal
 * fake DOM. Loads the REAL utils.js + sidebar.js, builds a dashboard-shaped DOM
 * (seven [role="tab"] buttons, a tablist, panels, the dataset header + preview
 * title), then asserts the navigation contract without a browser:
 *   • the rail builds 7 flat items (one per analysis section, no sub-trees)
 *   • clicking a rail item activates the matching EXISTING tab (by index)
 *   • the active highlight mirrors whichever tab reports aria-selected="true"
 *   • visibility follows #resultsSection
 * Dev verification only. Run: node test/sidebar-dom-test.js
 */
const fs = require("fs");
const path = require("path");
const vm = require("vm");
const ROOT = path.join(__dirname, "..");

/* --------------------------- Tiny fake DOM ----------------------------- */
let ID = 0;
class FakeNode {
  constructor(tag) {
    this.tagName = (tag || "div").toUpperCase();
    this.nodeId = ++ID;
    this.children = [];
    this.parentNode = null;
    this._class = "";
    this.attrs = {};
    // dataset reflects to data-* attributes (as real DOM does), so attribute
    // selectors like [data-item="x"] match.
    this.dataset = new Proxy({}, {
      set: (t, k, v) => { t[k] = v; this.attrs["data-" + String(k).replace(/[A-Z]/g, (m) => "-" + m.toLowerCase())] = String(v); return true; },
      get: (t, k) => t[k],
    });
    this._text = "";
    this._html = "";
    this.style = {};
    this.hidden = false;
    this._top = 0;
    this._listeners = {};
    this.classList = {
      add: (...c) => this._setClasses(this._classes().concat(c)),
      remove: (...c) => this._setClasses(this._classes().filter((x) => !c.includes(x))),
      toggle: (c, force) => {
        const has = this._classes().includes(c);
        const on = force === undefined ? !has : !!force;
        this._setClasses(on ? this._classes().concat([c]) : this._classes().filter((x) => x !== c));
        return on;
      },
      contains: (c) => this._classes().includes(c),
    };
  }
  _classes() { return this._class ? this._class.split(/\s+/).filter(Boolean) : []; }
  _setClasses(arr) { this._class = Array.from(new Set(arr)).join(" "); }
  get className() { return this._class; }
  set className(v) { this._class = v || ""; }
  get id() { return this.attrs.id || ""; }
  set id(v) { this.attrs.id = v; }
  get firstElementChild() { return this.children[0] || null; }
  get firstChild() { return this.children[0] || null; }
  get parentElement() { return this.parentNode; }
  setAttribute(k, v) {
    this.attrs[k] = String(v);
    if (k === "class") this._class = String(v);
    if (k === "id") this.attrs.id = String(v);
  }
  getAttribute(k) { return k in this.attrs ? this.attrs[k] : null; }
  removeAttribute(k) { delete this.attrs[k]; if (k === "class") this._class = ""; }
  hasAttribute(k) { return k in this.attrs; }
  appendChild(node) {
    if (node && node._isFragment) { node.children.slice().forEach((c) => this.appendChild(c)); node.children = []; return node; }
    node.parentNode = this;
    this.children.push(node);
    return node;
  }
  insertBefore(node, ref) {
    node.parentNode = this;
    const i = ref ? this.children.indexOf(ref) : -1;
    if (i < 0) this.children.unshift(node); else this.children.splice(i, 0, node);
    return node;
  }
  set innerHTML(v) { if (v === "") this.children = []; else this._html = String(v); }
  get innerHTML() { return this._html; }
  set textContent(v) { this._text = String(v); this.children = []; }
  get textContent() { return this._text + this.children.map((c) => c.textContent).join(""); }
  addEventListener(type, fn) { (this._listeners[type] = this._listeners[type] || []).push(fn); }
  dispatch(type, evt) {
    let node = this;
    while (node) {
      (node._listeners[type] || []).forEach((fn) => fn(evt));
      node = node.parentNode;
    }
  }
  click() { this._clicked = (this._clicked || 0) + 1; this.dispatch("click", makeEvent("click", this)); }
  getBoundingClientRect() { return { top: this._top, left: 0, bottom: this._top + 20, right: 0, width: 100, height: 20 }; }
  get offsetParent() { return this.parentNode; }
  get offsetHeight() { return 20; }
  // --- selection ---
  _all() { const out = []; const walk = (n) => n.children.forEach((c) => { out.push(c); walk(c); }); walk(this); return out; }
  querySelectorAll(sel) { return this._all().filter((n) => matchesGroups(n, sel)); }
  querySelector(sel) { return this.querySelectorAll(sel)[0] || null; }
  closest(sel) { let n = this; while (n) { if (matchesGroups(n, sel)) return n; n = n.parentNode; } return null; }
  matches(sel) { return matchesGroups(this, sel); }
}

function makeEvent(type, target) {
  return { type, target, preventDefault() {}, stopPropagation() {}, key: undefined };
}

/* selector matching: comma groups → space-separated compounds (descendant) */
function parseCompound(str) {
  const c = { tag: null, id: null, classes: [], attrs: [], not: [] };
  const re = /(:not\([^)]*\)|[#.]?[\w-]+|\[[^\]]+\])/g;
  let m;
  while ((m = re.exec(str))) {
    const t = m[1];
    if (t.startsWith(":not(")) c.not.push(parseCompound(t.slice(5, -1)));
    else if (t[0] === "#") c.id = t.slice(1);
    else if (t[0] === ".") c.classes.push(t.slice(1));
    else if (t[0] === "[") {
      const inner = t.slice(1, -1);
      const eq = inner.indexOf("=");
      if (eq < 0) c.attrs.push([inner.trim(), null]);
      else c.attrs.push([inner.slice(0, eq).trim(), inner.slice(eq + 1).trim().replace(/^["']|["']$/g, "")]);
    } else c.tag = t.toUpperCase();
  }
  return c;
}
function matchCompound(node, c) {
  if (c.tag && node.tagName !== c.tag) return false;
  if (c.id && node.id !== c.id) return false;
  for (const cl of c.classes) if (!node.classList.contains(cl)) return false;
  for (const [k, v] of c.attrs) {
    if (!(k in node.attrs)) return false;
    if (v !== null && node.attrs[k] !== v) return false;
  }
  if (c.not && c.not.some((n) => matchCompound(node, n))) return false;
  return true;
}
function matchesSequence(node, compounds) {
  if (!matchCompound(node, compounds[compounds.length - 1])) return false;
  let idx = compounds.length - 2;
  let anc = node.parentNode;
  while (idx >= 0 && anc) {
    if (matchCompound(anc, compounds[idx])) idx--;
    anc = anc.parentNode;
  }
  return idx < 0;
}
function matchesGroups(node, sel) {
  return sel.split(",").some((g) => {
    const compounds = g.trim().split(/\s+/).map(parseCompound);
    return matchesSequence(node, compounds);
  });
}

/* ------------------------- Document + globals -------------------------- */
const document = {
  createElement: (t) => new FakeNode(t),
  createDocumentFragment: () => { const f = new FakeNode("#fragment"); f._isFragment = true; return f; },
  getElementById(id) { return this.body._all().find((n) => n.id === id) || (this.body.id === id ? this.body : null); },
  querySelector(sel) { return this.body.querySelector(sel); },
  querySelectorAll(sel) { return this.body.querySelectorAll(sel); },
  addEventListener() {},
  documentElement: new FakeNode("html"),
  readyState: "complete",
};
document.body = new FakeNode("body");

const store = {};
const window = {
  document,
  matchMedia: () => ({ matches: false }), // desktop
  addEventListener() {},
  scrollTo() {},
  scrollY: 0,
  localStorage: { getItem: (k) => (k in store ? store[k] : null), setItem: (k, v) => (store[k] = String(v)) },
  requestAnimationFrame: (fn) => fn(),
  MutationObserver: class { observe() {} disconnect() {} },
};

/* ---------------------- Build a dashboard-shaped DOM -------------------- */
// body > shell > (header[with #themeToggle], main > #resultsSection > #content)
const shell = new FakeNode("div"); document.body.appendChild(shell);
const header = new FakeNode("header"); shell.appendChild(header);
const hgroup = new FakeNode("div"); hgroup.id = "headerActions"; header.appendChild(hgroup); // sidebar.js injects #sbToggle here
const themeToggle = new FakeNode("button"); themeToggle.id = "themeToggle"; hgroup.appendChild(themeToggle);

const results = new FakeNode("section"); results.id = "resultsSection";
results.classList.add("hidden"); // start on the landing screen
shell.appendChild(results);
const content = new FakeNode("div"); content.id = "content"; results.appendChild(content);

// Populate #content the way dashboard.js render() does (only what sidebar reads).
const TAB_NAMES = ["overview", "missing", "correlation", "charts", "valuecounts", "groupby", "quality"];
function populateContent() {
  content.children = [];
  const datasetHeader = new FakeNode("div"); datasetHeader._top = 80; content.appendChild(datasetHeader); // first child
  const previewTitle = new FakeNode("h2"); previewTitle.classList.add("section-title"); previewTitle._top = 400;
  content.appendChild(previewTitle);
  const tablist = new FakeNode("div"); tablist.setAttribute("role", "tablist"); tablist._top = 800;
  content.appendChild(tablist);
  const panels = new FakeNode("div"); content.appendChild(panels);
  const tabBtns = [];
  TAB_NAMES.forEach((name, i) => {
    const b = new FakeNode("button"); b.setAttribute("role", "tab");
    b.setAttribute("aria-selected", i === 0 ? "true" : "false"); b.textContent = name;
    b.dataset.section = name; // stable id the sidebar binds to (matches tabDefs)
    // Emulate dashboard.js: clicking a tab selects it (toggles aria-selected).
    b.addEventListener("click", () => {
      tabBtns.forEach((x) => x.setAttribute("aria-selected", "false"));
      b.setAttribute("aria-selected", "true");
    });
    tablist.appendChild(b); tabBtns.push(b);
    const p = new FakeNode("div"); p.setAttribute("role", "tabpanel");
    if (i !== 0) p.classList.add("hidden");
    panels.appendChild(p);
  });
  return tabBtns;
}
let tabBtns = populateContent();

/* ----------------------------- Load code ------------------------------- */
const sandbox = {
  window, document, console,
  setTimeout: (fn) => fn(), clearTimeout() {},
  requestAnimationFrame: window.requestAnimationFrame,
  localStorage: window.localStorage,
  MutationObserver: window.MutationObserver,
};
window.App = {};
sandbox.window.App = window.App;
vm.createContext(sandbox);
function load(f) { vm.runInContext(fs.readFileSync(path.join(ROOT, f), "utf8"), sandbox, { filename: f }); }
load("js/utils.js");
load("js/sidebar.js");

// Model the dashboard's public navigator: activate a section by its STABLE id
// (reusing the tab button's own click → lazy render + aria-selected flip). The
// sidebar depends only on this contract, never on tab order or DOM position.
// `lastShown` records the id so we can assert the routing (incl. "overview").
let lastShown = null;
window.App.dashboard = {
  showSection(id) {
    lastShown = id;
    const btn = tabBtns.find((b) => b.getAttribute("data-section") === id);
    if (btn && btn.getAttribute("aria-selected") !== "true") btn.click();
  },
};

/* ------------------------------ Assertions ----------------------------- */
let pass = 0, fail = 0;
function assert(name, cond, detail) {
  if (cond) { pass++; console.log("  ✓ " + name); }
  else { fail++; console.log("  ✗ " + name + (detail ? " — " + detail : "")); }
}

console.log("\n[build] rail structure");
const aside = document.getElementById("dashSidebar");
assert("aside injected", !!aside);
const items = aside.querySelectorAll(".sb-item");
assert("7 flat nav items built", items.length === 7, `got ${items.length}`);
assert("no sub-tree categories", aside.querySelectorAll(".sb-cat").length === 0);
assert("every item carries data-nav", items.every((n) => !!n.getAttribute("data-nav")));
assert("toggle injected into header group", !!document.getElementById("sbToggle"));

console.log("\n[visibility] follows #resultsSection");
assert("hidden on landing (no is-visible)", !aside.classList.contains("is-visible"));
// Simulate dashboard load: reveal results + populate content, then refresh.
results.classList.remove("hidden");
tabBtns = populateContent();
window.App.sidebar.refresh();
assert("visible after dataset loads", aside.classList.contains("is-visible"));
assert("shell gains offset class", shell.classList.contains("dash-has-sidebar"));

console.log("\n[navigate] item click activates the matching existing tab");
function clickItem(navId) {
  const btn = aside.querySelector(`.sb-item[data-nav="${navId}"]`);
  btn.dispatch("click", makeEvent("click", btn));
  return btn;
}
clickItem("correlation"); // → tab index 2
assert("correlation tab (index 2) selected", tabBtns[2].getAttribute("aria-selected") === "true");
assert("correlation tab was clicked once", tabBtns[2]._clicked === 1, `clicks=${tabBtns[2]._clicked}`);
assert("clicked item marked active", aside.querySelector('.sb-item[data-nav="correlation"]').classList.contains("is-active"));

clickItem("quality"); // → tab index 6
assert("quality tab (index 6) selected", tabBtns[6].getAttribute("aria-selected") === "true");
assert("only one active item at a time", aside.querySelectorAll(".sb-item.is-active").length === 1);

clickItem("overview"); // home screen — routes by stable id, not position
assert("overview rail item routes to showSection('overview')", lastShown === "overview");
assert("overview item marked active", aside.querySelector('.sb-item[data-nav="overview"]').classList.contains("is-active"));

console.log("\n[active] highlight mirrors the selected tab");
// Selecting overview (index 0) directly, then refreshing, moves the highlight.
tabBtns.forEach((b, i) => b.setAttribute("aria-selected", i === 0 ? "true" : "false"));
window.App.sidebar.refresh();
assert("overview item active when its tab is selected",
  aside.querySelector('.sb-item[data-nav="overview"]').classList.contains("is-active"));
// No tab selected → no rail highlight (the initial summary-only state).
tabBtns.forEach((b) => b.setAttribute("aria-selected", "false"));
window.App.sidebar.refresh();
assert("no highlight when no tab is open", aside.querySelectorAll(".sb-item.is-active").length === 0);

console.log("\n[hide] returning to upload hides the panel");
results.classList.add("hidden");
window.App.sidebar.refresh();
assert("panel hidden when results hidden", !aside.classList.contains("is-visible"));
assert("shell offset removed", !shell.classList.contains("dash-has-sidebar"));

console.log(`\nRESULT: ${pass} passed, ${fail} failed\n`);
process.exit(fail ? 1 : 0);
