// smoke-test.js — runtime smoke test klasik script (tanpa CDN).
// Memuat classic scripts dalam Node dengan stub DOM/window/localStorage
// untuk menangkap top-level ReferenceError (regresi dari window.X / IIFE split).
// ESM modules (import CDN) TIDAK di-load di sini (butuh mock supabase).

import { readFileSync } from "node:fs";
import { writeFileSync } from "node:fs";
import vm from "node:vm";
import path from "node:path";

const ROOT = path.join(path.dirname(new URL(import.meta.url).pathname), "..");

// ---- Stub DOM minimal ----
function makeEl(id) {
  const listeners = {};
  const el = {
    id: id || "",
    _text: "",
    _html: "",
    style: {},
    dataset: {},
    children: [],
    classes: new Set(),
    setAttribute(k, v) { this["attr_" + k] = v; },
    getAttribute(k) { return this["attr_" + k]; },
    removeAttribute(k) { delete this["attr_" + k]; },
    addEventListener(t, fn) { (listeners[t] ||= []).push(fn); },
    removeEventListener() {},
    appendChild(c) { this.children.push(c); return c; },
    append(...nodes) { this.children.push(...nodes); },
    prepend(c) { this.children.unshift(c); },
    remove() {},
    insertBefore(c) { return c; },
    replaceChildren(...a) { this.children = [...a]; },
    removeAttributeNodes() {},
    querySelector() { return makeEl(); },
    querySelectorAll() { return []; },
    getBoundingClientRect() { return { top:0,left:0,width:100,height:100 }; },
    focus() {}, blur() {}, click() {},
    classList: { add(){}, remove(){}, toggle(){}, contains(){ return false; } },
  };
  Object.defineProperty(el, "textContent", { get(){ return this._text; }, set(v){ this._text = String(v); } });
  Object.defineProperty(el, "innerHTML", { get(){ return this._html; }, set(v){ this._html = String(v); } });
  Object.defineProperty(el, "innerText", { get(){ return this._text; }, set(v){ this._text = String(v); } });
  Object.defineProperty(el, "value", { get(){ return this._val||""; }, set(v){ this._val=v; } });
  return el;
}

const elementsById = {};
function getEl(id) { return elementsById[id] ||= makeEl(id); }

const windowStub = {
  document: {
    documentElement: makeEl("html"),
    body: makeEl("body"),
    head: makeEl("head"),
    getElementById: (id) => getEl(id),
    querySelector: () => makeEl(),
    querySelectorAll: () => [],
    createElement: (t) => makeEl(t),
    createTextNode: (t) => ({ text: t }),
    addEventListener: () => {},
    removeEventListener: () => {},
    readyState: "complete",
    title: "LK",
  },
  addEventListener: () => {},
  removeEventListener: () => {},
  matchMedia: () => ({ matches: false, addEventListener(){}, addListener(){} }),
  localStorage: {
    _s: {},
    getItem(k){ return k in this._s ? this._s[k] : null; },
    setItem(k,v){ this._s[k] = String(v); },
    removeItem(k){ delete this._s[k]; },
    clear(){ this._s = {}; },
  },
  location: { href: "http://localhost/index.html", search: "", hash: "", pathname: "/index.html", replace(){}, assign(){}, reload(){}, origin:"http://localhost" },
  setTimeout, clearTimeout, setInterval, clearInterval,
  requestAnimationFrame: (fn) => 0,
  cancelAnimationFrame: () => {},
  getComputedStyle: () => ({ getPropertyValue: () => "" }),
  console,
  URL, URLSearchParams,
  navigator: { onLine: true, userAgent: "smoketest" },
  crypto: { getRandomValues(arr){ for (let i=0;i<arr.length;i++) arr[i]=(Math.random()*256)|0; return arr; } },
  CustomEvent: class { constructor(t){ this.type=t; } },
  Event: class { constructor(t){ this.type=t; } },
  setTimeout: setTimeout,
};
windowStub.window = windowStub;
windowStub.globalThis = windowStub;
windowStub.self = windowStub;
windowStub.top = windowStub;
// buat property window tersedia sebagai global
const g = {
  window: windowStub,
  document: windowStub.document,
  navigator: windowStub.navigator,
  localStorage: windowStub.localStorage,
  location: windowStub.location,
  console,
  setTimeout, clearTimeout, setInterval, clearInterval,
  requestAnimationFrame: windowStub.requestAnimationFrame,
  getComputedStyle: windowStub.getComputedStyle,
  URL, URLSearchParams,
  crypto: windowStub.crypto,
  CustomEvent: windowStub.CustomEvent,
  Event: windowStub.Event,
  performance: { now: () => 0 },
};
g.globalThis = g;
g.window = windowStub;

const sandbox = vm.createContext(g);

const results = [];
function runFile(rel) {
  const p = path.join(ROOT, rel);
  let src;
  try { src = readFileSync(p, "utf8"); } catch (e) { results.push([rel, "LOAD-ERR", e.message]); return; }
  try {
    vm.runInContext(src, sandbox, { filename: rel });
    results.push([rel, "OK", ""]);
  } catch (e) {
    results.push([rel, "RUNTIME-ERR", (e && (e.stack || e.message) || String(e)).split("\n").slice(0,4).join(" | ")]);
  }
}

// Urutan klasik per halaman (khusus yang relevan, dedupe).
// classic script yang di-load di semua/ sebagian HTML:
runFile("js/config.js");
runFile("js/theme.js");
runFile("js/ready.js");
runFile("js/notify.js");
runFile("js/sidebar.js");
runFile("js/chart.js");
// tailwind-config: butuh window.tailwind (stub)
windowStub.tailwind = { config: {} };
runFile("js/tailwind-config.js");
// page scripts (butuh waitFor* — classic, aman di-load)
runFile("js/dashboard.js");
runFile("js/input.js");
runFile("js/history.js");
runFile("js/profile.js");
runFile("js/login.js");

console.log("===== SMOKE TEST HASIL =====");
let fails = 0;
for (const [f, s, m] of results) {
  console.log(`${s.padEnd(12)} ${f}${m ? "  ->  " + m : ""}`);
  if (s !== "OK") fails++;
}
console.log(`\nTotal: ${results.length} file, ${fails} gagal`);
process.exit(fails ? 1 : 0);
