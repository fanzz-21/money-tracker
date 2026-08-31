// chart-skeleton.mjs — regression test untuk bug: "skeleton loading chart
// (aliran kas + pengeluaran per kategori) stuck, tidak pernah hilang".
//
// Root cause: di index.html, <canvas id="flow-chart"/"cat-chart"> diberi
// atribut `hidden` (display:none) dan dibungkus div .lk-skeleton. Tidak ada
// kode yang membuka canvas / menghapus skeleton, sehingga:
//   1) canvas display:none -> getBoundingClientRect() = 0x0 -> chart tergambar
//      ke ukuran nol, dan
//   2) shimmer skeleton tidak pernah dihapus -> user stuck di skeleton.
//
// Fix di js/dashboard.js: refreshCharts() memanggil revealChart() yang
// membuka canvas + menghapus skeleton SEBELUM menggambar.
//
// Test ini: load chart.js + dashboard.js dengan stub Auth/Storage, seed DOM
// dalam keadaan "skeleton masih ada + canvas hidden", biarkan IIFE async
// dashboard berjalan, lalu assert canvas dibuka & skeleton terhapus.

import { readFileSync } from "node:fs";
import vm from "node:vm";
import path from "node:path";

const ROOT = path.join(path.dirname(new URL(import.meta.url).pathname), "..");

// ---- 2D canvas context stub (cukup untuk chart.js) ----
function makeCtx() {
  const noop = () => {};
  return {
    clearRect: noop, scale: noop, beginPath: noop, moveTo: noop, lineTo: noop,
    stroke: noop, setLineDash: noop, fillText: noop, fill: noop, arc: noop,
    closePath: noop, rect: noop, clip: noop, save: noop, restore: noop,
    font: "", fillStyle: "", strokeStyle: "", textAlign: "", textBaseline: "",
    lineWidth: 1, lineCap: "", lineJoin: "",
  };
}

// ---- DOM element stub ----
const elementsById = {};
function makeEl(id) {
  const listeners = {};
  const el = {
    id: id || "",
    hidden: false,
    style: {},
    children: [],
    setAttribute(k, v) { this["attr_" + k] = v; },
    getAttribute(k) { return this["attr_" + k]; },
    removeAttribute(k) { delete this["attr_" + k]; },
    addEventListener(t, fn) { (listeners[t] ||= []).push(fn); },
    removeEventListener() {},
    appendChild(c) { this.children.push(c); return c; },
    append(...n) { this.children.push(...n); },
    prepend(c) { this.children.unshift(c); },
    remove() { if (this.id) delete elementsById[this.id]; },
    insertBefore(c) { return c; },
    replaceChildren(...a) { this.children = [...a]; },
    querySelector() { return makeEl(); },
    querySelectorAll() { return []; },
    getBoundingClientRect() { return { top: 0, left: 0, width: 100, height: 100 }; },
    getContext() { return makeCtx(); },
    focus() {}, blur() {}, click() {},
    classList: { add() {}, remove() {}, toggle() {}, contains() { return false; } },
  };
  Object.defineProperty(el, "textContent", { get() { return this._t; }, set(v) { this._t = String(v); } });
  Object.defineProperty(el, "innerHTML", { get() { return this._h; }, set(v) { this._h = String(v); } });
  Object.defineProperty(el, "value", { get() { return this._v || ""; }, set(v) { this._v = v; } });
  return el;
}
function getEl(id) { return elementsById[id] ||= makeEl(id); }

const now = "2026-08-31";
const items = [
  { id: "a", type: "out", category: "Makan", note: "lunch", amount: 25000, date: "2026-08-31", ts: Date.parse("2026-08-31T12:00:00") },
  { id: "b", type: "in", category: "Gaji", note: "pay", amount: 500000, date: "2026-08-01", ts: Date.parse("2026-08-01T09:00:00") },
];

const StorageStub = {
  CATS: { in: ["Gaji", "Lainnya"], out: ["Makan", "Transport", "Lainnya"] },
  todayISO: () => now,
  loadAll: async () => items,
  monthTotals: () => ({ masuk: 500000, keluar: 25000, net: 475000 }),
  byDate: (all, d) => all.filter((t) => t.date === d),
  flowSeries: () => [
    { ym: "2026-07", label: "07", masuk: 100, keluar: 50 },
    { ym: "2026-08", label: "08", masuk: 500000, keluar: 25000 },
  ],
  spendByCategory: () => [{ name: "Makan", amount: 25000 }],
  invalidate: () => {},
  addTx: async () => {}, removeTx: async () => {}, clearDate: async () => {},
};
const AuthStub = {
  requireAuth: async () => ({ user: { email: "t@x.com", user_metadata: { username: "tester" } } }),
  logout: () => {},
};

const windowStub = {
  document: {
    documentElement: makeEl("html"),
    body: makeEl("body"),
    getElementById: (id) => getEl(id),
    querySelector: () => makeEl(),
    querySelectorAll: () => [],
    createElement: (t) => makeEl(t),
    createTextNode: (t) => ({ text: t }),
    addEventListener: () => {}, removeEventListener: () => {},
    readyState: "complete", title: "LK",
  },
  addEventListener: () => {}, removeEventListener: () => {},
  matchMedia: () => ({ matches: false, addEventListener() {}, addListener() {} }),
  localStorage: { _s: {}, getItem(k){ return k in this._s ? this._s[k] : null; }, setItem(k,v){ this._s[k]=String(v); }, removeItem(k){ delete this._s[k]; }, clear(){ this._s={}; } },
  location: { href: "http://localhost/index.html", search: "", hash: "", pathname: "/index.html", replace() {}, assign() {}, reload() {}, origin: "http://localhost" },
  setTimeout, clearTimeout, setInterval, clearInterval,
  requestAnimationFrame: (fn) => 0, cancelAnimationFrame: () => {},
  getComputedStyle: () => ({ getPropertyValue: () => "" }),
  console,
  URL, URLSearchParams,
  navigator: { onLine: true, userAgent: "smoketest" },
  crypto: { getRandomValues(arr){ for (let i=0;i<arr.length;i++) arr[i]=0; return arr; } },
  CustomEvent: class { constructor(t){ this.type=t; } },
  Event: class { constructor(t){ this.type=t; } },
  devicePixelRatio: 1,
  Path2D: class { moveTo() {} lineTo() {} closePath() {} },
  // modul "ready" di-seed supaya waitForAuth/waitForStorage resolve langsung
  Auth: AuthStub,
  Storage: StorageStub,
};
windowStub.window = windowStub;
windowStub.globalThis = windowStub;
windowStub.self = windowStub;

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
  Path2D: windowStub.Path2D,
  devicePixelRatio: 1,
  performance: { now: () => 0 },
};
g.globalThis = g;
g.window = windowStub;
const sandbox = vm.createContext(g);

function runFile(rel) {
  vm.runInContext(readFileSync(path.join(ROOT, rel), "utf8"), sandbox, { filename: rel });
}

// ---- Seed DOM persis seperti index.html: skeleton ada, canvas hidden ----
const flowSk = getEl("flow-skeleton");
const catSk = getEl("cat-skeleton");
const flowCanvas = getEl("flow-chart");
const catCanvas = getEl("cat-chart");
flowCanvas.hidden = true;   // atribut `hidden` di HTML
catCanvas.hidden = true;

let failures = 0;
function assert(cond, msg) {
  console.log((cond ? "  PASS  " : "  FAIL  ") + msg);
  if (!cond) failures++;
}

// ---- Load: ready.js (waitFor*) + notify.js (window.LK) + chart.js + dashboard.js
runFile("js/ready.js");
runFile("js/notify.js");
runFile("js/chart.js");
runFile("js/dashboard.js");

// beri waktu IIFE async dashboard selesai (waitFor sudah resolve instan)
setTimeout(() => {
  console.log("===== CHART SKELETON REGRESSION =====");
  assert(flowCanvas.hidden === false, "canvas #flow-chart dibuka (hidden=false)");
  assert(catCanvas.hidden === false, "canvas #cat-chart dibuka (hidden=false)");
  assert(!elementsById["flow-skeleton"], "skeleton #flow-skeleton terhapus");
  assert(!elementsById["cat-skeleton"], "skeleton #cat-skeleton terhapus");
  // chart benar-benar tergambar: legend kategori terisi (renderCatLegend)
  const legend = getEl("cat-legend");
  assert(legend.children.length >= 1, "legend kategori terisi (renderCatLegend jalan)");
  assert(flowCanvas.getBoundingClientRect().width > 0, "canvas punya lebar > 0 saat digambar");
  console.log(`\n${failures === 0 ? "SEMOGA GREEN: skeleton chart tidak stuck." : failures + " assertion GAGAL."}`);
  process.exit(failures ? 1 : 0);
}, 30);
