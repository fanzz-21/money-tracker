// tests/helpers/esm-loader.mjs — Infra untuk test ESM modules (js/*.js yang
// import satu sama lain) di Node, dengan js/supabase.js di-stub (modul aslinya
// import dari CDN — tidak bisa dijalankan di Node tanpa network).
//
// Cara kerja:
//   1. Stub window/document/localStorage/... dipasang ke globalThis MAIN
//      REalm (modul ESM hasil `import()` dievaluasi di main realm, jadi bare
//      references `document`/`localStorage`/`window` resolve ke stub ini).
//      Tiap test = proses Node sendiri, jadi polusi global aman.
//   2. node:module register() resolve hook mengalihkan specifier yang
//      end-with "supabase.js" ke stub lokal (.supabase-stub.mjs) yang expose
//      `supabase` = mock yang diset caller via globalThis.__SUPABASE_MOCK__.
//   3. Caller dynamic import modul aslinya (file://) dan mem-assert.
//
// Pemakaian (dari tests/*.mjs):
//   import { loadEsmModule } from "./helpers/esm-loader.mjs";
//   const { Storage, window: win } = await loadEsmModule("js/storage.js", {
//     supabaseMock: { from(){...}, auth:{ getUser: async () => ({data:{}}) } }
//   });

import path from "node:path";
import { pathToFileURL, fileURLToPath } from "node:url";
import { register } from "node:module";
import { writeFileSync } from "node:fs";

// Loader ada di tests/helpers/ -> project root = 2 level ke atas.
const ROOT = path.resolve(fileURLToPath(new URL("../..", import.meta.url)));
const HOOKS_URL = pathToFileURL(path.join(import.meta.dirname, "supabase-redirect-hooks.mjs")).href;
const STUB_FILE = path.join(import.meta.dirname, ".supabase-stub.mjs");

// ---- stub DOM minimal (cukup untuk module init + render) ----
function makeEl(id) {
  const el = {
    id: id || "",
    style: {},
    dataset: {},
    children: [],
    setAttribute(k, v) { this["attr_" + k] = v; },
    getAttribute(k) { return this["attr_" + k]; },
    removeAttribute(k) { delete this["attr_" + k]; },
    addEventListener() {}, removeEventListener() {},
    appendChild(c) { this.children.push(c); return c; },
    append(...n) { this.children.push(...n); },
    prepend(c) { this.children.unshift(c); },
    remove() {},
    replaceChildren(...a) { this.children = [...a]; },
    querySelector() { return makeEl(); },
    querySelectorAll() { return []; },
    getBoundingClientRect() { return { top: 0, left: 0, width: 100, height: 100 }; },
    focus() {}, blur() {}, click() {},
    classList: { add() {}, remove() {}, toggle() {}, contains() { return false; } },
  };
  Object.defineProperty(el, "textContent", { get() { return this._t || ""; }, set(v) { this._t = String(v); } });
  Object.defineProperty(el, "innerHTML", { get() { return this._h || ""; }, set(v) { this._h = String(v); } });
  Object.defineProperty(el, "value", { get() { return this._v || ""; }, set(v) { this._v = v; } });
  return el;
}

function makeWindowStub() {
  const els = {};
  const getEl = (id) => (els[id] ||= makeEl(id));
  const stub = {
    document: {
      documentElement: makeEl("html"),
      body: makeEl("body"),
      getElementById: (id) => getEl(id),
      querySelector: () => makeEl(),
      querySelectorAll: () => [],
      createElement: (t) => makeEl(t),
      createTextNode: (t) => ({ text: String(t) }),
      addEventListener() {}, removeEventListener() {},
      readyState: "complete", title: "LK",
    },
    addEventListener() {}, removeEventListener() {},
    matchMedia: () => ({ matches: false, addEventListener() {}, removeEventListener() {} }),
    localStorage: {
      _s: {},
      getItem(k) { return k in this._s ? this._s[k] : null; },
      setItem(k, v) { this._s[k] = String(v); },
      removeItem(k) { delete this._s[k]; },
      clear() { this._s = {}; },
    },
    location: { href: "http://localhost/index.html", pathname: "/index.html", search: "", hash: "", origin: "http://localhost", replace() {}, assign() {}, reload() {} },
    setTimeout, clearTimeout, setInterval, clearInterval,
    requestAnimationFrame: () => 0, cancelAnimationFrame() {},
    getComputedStyle: () => ({ getPropertyValue: () => "" }),
    console,
    URL, URLSearchParams,
    navigator: { onLine: true, userAgent: "esm-test" },
    crypto: {
      randomUUID: () => "00000000-0000-4000-8000-000000000000",
      getRandomValues(arr) { for (let i = 0; i < arr.length; i++) arr[i] = 0; return arr; },
    },
    CustomEvent: class { constructor(t) { this.type = t; } },
    Event: class { constructor(t) { this.type = t; } },
  };
  stub.window = stub;
  stub.self = stub;
  return stub;
}

// Source stub: ESM yang expose `supabase` dari mock yang diset caller.
const SUPABASE_STUB_SRC = `
export const supabase = globalThis.__SUPABASE_MOCK__;
export async function currentUser() {
  const { data } = await supabase.auth.getUser();
  return data && data.user ? data.user : null;
}
`;

let _hooked = false;
function ensureHook() {
  if (_hooked) return;
  writeFileSync(STUB_FILE, SUPABASE_STUB_SRC, "utf8");
  register(HOOKS_URL, import.meta.url);
  _hooked = true;
}

// Keys global yang di-stub (di-restore setelah load supaya antar-load dalam
// satu proses tetap terisolasi — walaupun tiap test biasanya proses sendiri).
const GLOBAL_KEYS = [
  "window", "document", "navigator", "localStorage", "location",
  "getComputedStyle", "matchMedia", "__SUPABASE_MOCK__",
];

/**
 * Load modul ESM asli (relPath relatif ke ROOT) dengan stub DOM + mock supabase.
 * @returns {Promise<{mod: object, window: object}>}
 */
export async function loadEsmModule(relPath, { supabaseMock = null } = {}) {
  const windowStub = makeWindowStub();
  ensureHook();

  const saved = {};
  for (const k of GLOBAL_KEYS) saved[k] = { had: k in globalThis, val: globalThis[k] };
  for (const [k, v] of [
    ["window", windowStub],
    ["document", windowStub.document],
    ["navigator", windowStub.navigator],
    ["localStorage", windowStub.localStorage],
    ["location", windowStub.location],
    ["getComputedStyle", windowStub.getComputedStyle],
    ["matchMedia", windowStub.matchMedia],
    ["__SUPABASE_MOCK__", supabaseMock],
  ]) {
    // navigator & localStorage di Node 22+ bisa getter-only — pakai defineProperty.
    Object.defineProperty(globalThis, k, { value: v, configurable: true, writable: true });
  }
  let mod;
  try {
    mod = await import(pathToFileURL(path.join(ROOT, relPath)).href);
  } finally {
    for (const k of GLOBAL_KEYS) {
      if (!saved[k].had) delete globalThis[k];
      else Object.defineProperty(globalThis, k, { value: saved[k].val, configurable: true, writable: true });
    }
  }
  return { mod, window: windowStub };
}
