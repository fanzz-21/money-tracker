# Rencana Remedial Codacy — money-tracker

> Dokumen handoff antar-agent. Semua item sudah diverifikasi ke kode (commit `5e083d9`, v2.2.0, 2026-08-30).
> Snapshot lengkap 126 issue: `docs/codacy-issues-2026-08-30.json`
> Cara re-verify via API: lihat bagian **Verifikasi** di bawah.

## Konteks

- Repo: `fanzz-21/money-tracker` (GitHub), folder lokal: `/root/LK`
- Frontend statis (HTML + JS ESM + beberapa script klasik), di-deploy ke Vercel
- Backend: Supabase (Postgres + Auth + RLS). Config publik di `js/config.js` (`window.LK_CONFIG`)
- Status Codacy saat snapshot: **Grade B (72)**, 126 issues, 6.096 LOC, gate policy: maxIssuePercentage 20 (sekarang 23% → GAGAL gate)
- Target akhir: grade A, 0 issue Security/Error, lolos gate

### Arsitektur global JS (penting untuk Fase 2)

- `js/config.js` (klasik, sync) → `window.LK_CONFIG` — wajib load paling awal di semua HTML
- `js/notify.js` (klasik, sync, load sebelum script ESM) → `window.LK = { toast, broadcast, on, escapeHTML }`
- `js/ready.js` (klasik, sync) → `window.waitFor`, `window.waitForAuth`, `window.waitForStorage`
- ESM modules (async): `supabase.js`, `auth.js` (→ `window.Auth`), `storage.js` (→ `window.Storage`), `realtime.js`, `budget.js` (→ `window.Budget`)
- Script klasik halaman: `dashboard.js`, `history.js`, `input.js`, `profile.js` → pakai bare reference ke global di atas → inilah sumber 65 `no-undef` (ESLint tidak kenal globals lintas-file)
- Urutan script di `index.html` (dan halaman lain) sudah benar: pwa → tailwind → config → theme → ready → (ESM: supabase, auth, storage, realtime, budget) → notify → sidebar → chart → dashboard
- `js/chart.js` ESM/classik: **tidak** mengekspos `window.Chart` (bug nyata, lihat Fase 2)

## Ringkasan issue per kategori

| Kategori | Jumlah |
|---|---|
| ErrorProne `ESLint8_no-undef` | 65 |
| Security (36) | detect-object-injection 12, xss no-mixed-html 7, no-unsanitized_property 5, semgrep insecure-innerhtml 5, semgrep insecure-document-method 5, semgrep open-redirect 1, semgrep insecure-random-generator 1 |
| UnusedCode (14) | no-unused-vars 7, @typescript-eslint no-unused-vars 7 |
| Complexity (4) | Lizard nloc-medium 3, Lizard file-nloc-medium 1 (package-lock.json) |
| ErrorProne lain (6) | PMD inaccurate-numeric-literal 4, no-constant-condition 1, no-dynamic-delete 1 |
| BestPractice (1) | Stylelint scss_function-disallowed-list di css/ui.css |

---

## FASE 1 — Security (36 issue) 🔴

### 1.1 Open redirect — `js/auth.js` L132 (`redirectAfterAuth`)
```js
const next = params.get("next") || "index.html";
if (next.includes("login.html")) { ... }
location.replace(next);  // ← `next` bisa "https://evil.com"
```
**Fix:** validasi `next` hanya boleh relatif same-origin:
- Tolak kalau diawali `http://`, `https://`, `//`, atau mengandung `:` sebelum `/`
- Allowlist opsional: `["index.html","input.html","history.html","profile.html"]` — paling aman
- `location.replace` hanya untuk yang lolos

### 1.2 Crypto weak random — `js/storage.js` L52 (`uid()`)
```js
function uid() {
  if (typeof crypto !== "undefined" && crypto.randomUUID) return crypto.randomUUID();
  return String(Date.now()) + "-" + Math.random().toString(36).slice(2, 10);  // ← L52
}
```
**Fix:** fallback pakai `crypto.getRandomValues`:
```js
const bytes = new Uint8Array(16);
crypto.getRandomValues(bytes);
return [...bytes].map(b => b.toString(16).padStart(2, "0")).join("");
```
(Di browser modern `crypto` selalu ada, jadi fallback Math.random bisa dihapus total atau dikosongkan.)

### 1.3 Cluster XSS — innerHTML dengan data user
Semua titik di bawah merender data yang berasal dari DB/kategori/note user ke `innerHTML`. Data paling berisiko: `row.category`, `row.note`, nama kategori dari `Budget`, hasil `fmtRp`.

| File | Line | Masalah |
|---|---|---|
| `js/dashboard.js` | 73 | `row.innerHTML` + Semgrep innerHTML/document-method + no-unsanitized_property |
| `js/dashboard.js` | 75 | `no-mixed-html` — `window.LK.escapeHTML` dipakai di context mixed-html (pola `${esc(x)}` di template literal yang juga berisi HTML statis → ESLint security flag; konfirmasi manual apakah escape sudah benar, kalau benar ini false positive → bulk-ignore nanti) |
| `js/dashboard.js` | 77 | `no-mixed-html` — return `fmtRp` di HTML |
| `js/dashboard.js` | 81 | `no-mixed-html` — `pct` di HTML |
| `js/dashboard.js` | 114 | `art.innerHTML` + 3 flag semgrep/ESLint |
| `js/history.js` | 151 | `art.innerHTML` + 3 flag |
| `js/profile.js` | 83 | `row.innerHTML` + 3 flag |
| `js/sidebar.js` | 68, 73, 78 | `no-mixed-html` — `NAV.map` / `TAMPILAN.map` / `AKUN.map` memasukkan string yang dianggap HTML |
| `js/sidebar.js` | 112 | `el.innerHTML = buildSidebarHTML(...)` + no-mixed-html + 3 flag |

**Strategi fix (konsisten untuk semua titik):**
1. Prioritas: build DOM via `document.createElement` / `textContent` / `insertAdjacentHTML` per-field → immune XSS
2. Kalau tetap pakai template literal (biar cepat), pastikan **setiap** interpolasi data dinamis lewat `LK.escapeHTML()` — termasuk output `fmtRp` (fmtRp harus di-escape setelahnya) dan angka `pct` (angka safe, tapi flag tetap ada; bisa `String(pct)`)
3. Untuk `sidebar.js`: `NAV/TAMPILAN/AKUN` adalah data statis developer (bukan user input) → candidate false positive; tetap escape label untuk konsisten, lalu bulk-ignore sisa flag
4. `dashboard.js` L75: periksa apakah memang sudah di-escape — kalau iya, false positive

### 1.4 Object injection (12 issue)
Pattern: `obj[keyUser]` di mana `key` berasal dari data (DB) → bisa `__proto__` / `constructor` pollution.

| File | Line | Konteks |
|---|---|---|
| `js/budget.js` | 26, 27, 44, 53, 60 | `load()`: `n > 0` dari JSON localStorage; `set()`: `all[cat] = n`; `get()`: `all[cat]`; `remove()`: `delete all[cat]` |
| `js/storage.js` | 242, 245 | `spendByCategory()`: `map[k]` dengan `k = t.category` dari DB |
| `js/dashboard.js` | 67 | dynamic key (cek konteks saat edit) |
| `js/input.js` | 38 | dynamic key (cek konteks saat edit) |
| `js/profile.js` | 71 | variable → sink |
| `js/ready.js` | 8, 14 | `global[name]` — `name` hardcoded "Auth"/"Storage" → **false positive** |

**Fix:**
- Guard helper di satu tempat (mis. `js/storage.js` atau file util baru `js/guard.js`):
  ```js
  export function safeKey(k) {
    return (typeof k === "string" && k && k !== "__proto__"
            && k !== "constructor" && k !== "prototype") ? k : null;
  }
  ```
- `budget.js`: karena data-nya dari localStorage (semi-tepercaya) + key sudah divalidasi `typeof cat === "string"` di `set()`, pakai `Object.create(null)` untuk map internal + validasi `safeKey` → menutup `__proto__`
- `storage.js spendByCategory`: `Object.create(null)` untuk `map`
- `ready.js`: biarkan, bulk-ignore (false positive)
- `dashboard.js` L67 / `input.js` L38 / `profile.js` L71: baca konteks saat implementasi, terapkan pola yang sama

---

## FASE 2 — no-undef (65 issue) 🔧

### 2.1 BUG NYATA (perbaiki dulu, di luar scope lint)
1. **`js/profile.js` — `fmt` tidak defined** (L49, 50, 93 dipanggil; tidak ada deklarasi):
   - Ada `fmtRp` di dashboard.js/history.js (lokal per-file). Profile.js butuh define `fmt` sendiri — salin implementasi `fmtRp` dari `history.js` L94 ke profile.js (atau expose `LK.fmtRp` dari notify.js biar satu implementasi)
2. **`js/dashboard.js` — `Chart` tidak defined** (L38, 40, 41: `Chart.drawFlowChart`, `Chart.drawCatChart`, `Chart.renderCatLegend`):
   - `js/chart.js` tidak pernah menyetel `window.Chart` → chart di dashboard **sebenarnya tidak berfungsi** (ataukah `chart.js` di-load sebagai classic script dan fungsinya global? Verifikasi: baca chart.js — definisi `drawFlowChart` dst. Kalau function declaration global, tinggal `window.Chart = { drawFlowChart, drawCatChart, renderCatLegend }` di akhir chart.js; kalau di dalam IIFE/module, expose-kan)

### 2.2 Solusi sistemik untuk 63 sisa `no-undef`
Simbol: `LK` (38), `Budget` (7), `Auth` (7), `waitForStorage` (4), `waitForAuth` (4), `Chart` (3), `fmt` (1), `tailwind` (1 — cek `js/tailwind-config.js` L1)

**Pilihan (pilih SATU, rekomendasikan A):**

**A. Tambah ESLint config** (`.eslintrc.json` di root):
```json
{
  "env": { "browser": true, "es2022": true },
  "globals": {
    "LK": "readonly", "Budget": "readonly", "Auth": "readonly",
    "Storage": "readonly", "Chart": "readonly",
    "waitFor": "readonly", "waitForAuth": "readonly", "waitForStorage": "readonly"
  },
  "rules": {
    "no-undef": "error"
  }
}
```
Catatan: Codacy pakai ESLint8 + rule set sendiri; declare globals di `.eslintrc` project biasanya dihormati Codacy (override file-level). Kalau Codacy tetap flag, fallback ke opsi B.

**B. Ganti bare reference → `window.X`** di script klasik (dashboard, history, input, profile):
- `LK.toast(...)` → `window.LK.toast(...)` (sudah pakai pattern `if (window.LK)` di beberapa tempat)
- `Budget.set(...)` → `window.Budget.set(...)`
- `const Auth = await waitForAuth()` → `await window.waitForAuth()`
- Ini更显式 tapi touching banyak baris; pilih A dulu, B kalau A ditolak Codacy

**C (pelengkap, di-FASE 5):** ESLint lokal dengan config yang sama → bisa test sebelum push

`js/tailwind-config.js` L1 (`tailwind` not defined): file ini set `tailwind.config` ke plugin CDN — kalau `tailwind` global dari CDN tidak selalu ada saat load, guard dengan `if (window.tailwind)` → sekaligus menyelesaikan flag

---

## FASE 3 — Hygiene (15 issue)

### 3.1 Unused vars (10 unik, 14 flag)
| File | Line | Var |
|---|---|---|
| `js/auth.js` | 138 | `_identifier` (parameter — beri prefix `_` sudah ada; ESLint8 default flag tetap → exclude via config `argsIgnorePattern: "^_"` ATAU hapus param) |
| `js/dashboard.js` | 12, 21, 137 | `todayItems`, `chartLegend`, `row` |
| `js/history.js` | 29 | `summaryBar` |
| `js/realtime.js` | 19 | `userId` |
| `js/storage.js` | 89 | `invalidate` |

**Fix:** hapus deklarasi yang benar-benar tidak dipakai; untuk `argsIgnorePattern` tambahkan ke ESLint config Fase 2A. Hati-hati `row` di dashboard L137 & `chartLegend` L21 — cek apakah memang dead atau seharusnya dipakai (possible lost feature).

### 3.2 Numeric literals (4x)
| File | Line | Sekarang → Jadi |
|---|---|---|
| `js/budget.js` | 27 (load: `n <= 1e9`), 51 (`n > 1e9`) | `1e9` → `1000000000` (literal exact) |
| `js/input.js` | 120 (`amt > 1e9`) | `1e9` → `1000000000` |
| `js/storage.js` | 35 | `1_000_000_000` → `1000000000` |
| `js/storage-backup.js` | 11 | `1_000_000_000` → `1000000000` |

Catatan: `1_000_000_000` (numeric separator) valid ES2021 — flag ini dari parser lama PMD; tetap ganti biar konsisten & quiet.

### 3.3 Lainnya (2)
- `js/storage-backup.js` L95: `while (true)` → refactor jadi `while (hasNext)` / for loop eksplisit (baca fungsi: kemungkinan retry loop — tambahkan condition exit yang jelas, mis. `while (attempt < MAX)`)
- `js/budget.js` L60: `delete all[cat]` (dynamic delete) → rebuild:
  ```js
  const all = load();
  const { [cat]: _removed, ...rest } = all;  // atau
  const keys = Object.keys(all).filter(k => k !== cat);
  const rest = {}; keys.forEach(k => rest[k] = all[k]);
  save(rest);
  ```
  (destructure rest cleaner; `_removed` unused → pastikan `ignoreRestSiblings` atau hapus via filter approach)

---

## FASE 4 — Complexity & config (5 issue)

### 4.1 Pecah IIFE besar (3)
| File | Line | Ukuran |
|---|---|---|
| `js/profile.js` | 4 | 75 nloc (limit 50) |
| `js/history.js` | 2 | 72 nloc |
| `js/dashboard.js` | 2 | 53 nloc |

**Fix:** extract sub-fungsi bernama (renderX, loadY, bindEvents) dari dalam IIFE. Ini juga memperbaiki readability. Jalankan SETELAH Fase 1-3 supaya refactor tidak bentrok dengan patch keamanan.

### 4.2 False positive config (2)
- `package-lock.json` (Lizard file-nloc-medium): exclude di Codacy repo settings → "File extensions" / analysis ignore path `package-lock.json` (atau matikan Lizard untuk JSON). Via UI: repo Settings → Analysis → ignore path. (API v3 tidak punya endpoint untuk ignore path → manual di UI)
- `css/ui.css` (Stylelint `scss_function-disallowed-list` — rule SCSS diaplikasikan ke file `.css`): ini bug config Stylelint Codacy. Opsi: (a) matikan rule `scss_function-disallowed-list` di Codacy standards, atau (b) rename file ke `.scss` — TIDAK, file ini murni CSS. Pilihan: via UI Codacy repo → coding standard → disable rule `scss_function-disallowed-list` (file CSS bukan SCSS)

---

## FASE 5 — Verifikasi & otomasi

### 5.1 Bulk-ignore false positive di Codacy
Endpoint: `POST /analysis/organizations/gh/fanzz-21/repositories/money-tracker/issues/bulk-ignore`
Body: `{"issueIds": ["..."]}` (maks 100/request)
Candidate false positive (verifikasi dulu sebelum ignore!):
- `js/ready.js` L8, L14 (object injection — name hardcoded)
- `js/dashboard.js` L75 (sudah di-escape)
- `js/sidebar.js` L68, 73, 78 (data statis)
- `js/auth.js` L138 `_identifier` (jika pakai `argsIgnorePattern`)
ID issue ada di `docs/codacy-issues-2026-08-30.json` (field `issueId`) — tapi ID bisa berubah setelah re-analysis; cari ulang via issues/search per pattern+file.

### 5.2 Re-run & verifikasi
1. Commit per fase (1 commit per fase, pesan: `v2.3.0: Fase N remedial — <ringkasan>`)
2. Push → Codacy auto-analyze (post-commit hook aktif, ~1-2 menit per analisis)
3. Cek hasil:
   ```bash
   curl -s "https://api.codacy.com/api/v3/analysis/organizations/gh/fanzz-21/repositories/money-tracker" \
     -H "api-token: $CODACY_API_TOKEN"
   ```
   (token di `~/.hermes/.env` sebagai `CODACY_API_TOKEN` — ini ACCOUNT token v3; token repo lama `2feb750a...` tidak valid di v3)
4. Target: grade A, 0 issue Error/Security tersisa, issue% < 20 (gate pass)
5. Smoke test manual: buka tiap halaman (login, index, input, history, profile) — pastikan tidak ada regresi runtime (terutama setelah Fase 1.3 refactor DOM & Fase 2.1 fix Chart/fmt yang sebelumnya mungkin silent-broken)

### 5.3 Otomasi opsional (post-remedial)
- ESLint lokal: `npm i -D eslint eslint-plugin-security` + config Fase 2A → run di pre-deploy
- Webhook Codacy → Hermes: repo Settings → Integrations → Add channel → Webhook → URL endpoint Hermes (`hermes webhook subscribe codacy-... --deliver telegram`) agar tiap analysis selesai langsung dilaporkan ke Telegram
- Codacy AI Reviewer per-PR: `POST .../pull-requests/{n}/ai-reviewer/trigger`

---

## Verifikasi data (referensi agent berikutnya)

```bash
# Token
source ~/.hermes/.env   # CODACY_API_TOKEN (account token v3)
BASE="https://api.codacy.com/api/v3"
# CATATAN (diperbaiki 2026-08-31): repo endpoint pakai ORG="gh/fanzz-21" (bukan
# "gh/fanzz-21/money-tracker") + suffix /repositories[/money-tracker].
ORG="gh/fanzz-21"
REPO="money-tracker"

# Repo + grade (GET; field: gradeLetter, grade, issuesCount, issuesPercentage, loc)
curl -s "$BASE/analysis/organizations/$ORG/repositories" -H "api-token: $CODACY_API_TOKEN"

# Issue overview (POST)
curl -s -X POST "$BASE/analysis/organizations/$ORG/repositories/$REPO/issues/overview" -H "api-token: $CODACY_API_TOKEN" -H "Content-Type: application/json" -d '{}'

# Cari issue per kategori (pagination kursor di API ini BUG/terbatas — tarik per-kategori)
for c in Security ErrorProne Complexity BestPractice UnusedCode; do
  curl -s -X POST "$BASE/analysis/organizations/$ORG/repositories/$REPO/issues/search" \
    -H "api-token: $CODACY_API_TOKEN" -H "Content-Type: application/json" \
    -d "{\"issueCategories\":[\"$c\"],\"limit\":50}"
done

# Bulk-ignore (POST, max 100 issue, body: {"issueIds":[...]})
curl -s -X POST "$BASE/analysis/organizations/$ORG/repositories/$REPO/issues/bulk-ignore" \
  -H "api-token: $CODACY_API_TOKEN" -H "Content-Type: application/json" \
  -d '{"issueIds":["<id1>","<id2>"]}'
```

Catatan pagination: `issues/search` dengan cursor berulang tidak memajukan (sisa 26 dari 126 tak muncul) — selalu tarik per-kategori lalu dedupe by `issueId`.

## Checklist progres

- [x] 2026-08-30: repo disinkron ke v2.2.0 (5e083d9), 126 issue dipetakan, plan dituliskan
- [x] Fase 1: Security (36) — commit `e4f73b2`
- [x] Fase 2: no-undef (65) — commit `67380c8` + verifikasi strict ESLint (0 no-undef)
- [x] Fase 3: Hygiene (15) — commit `d6fb248`
- [x] Fase 4: Complexity & config (5) — commit `404e4ed`
- [x] Fase 5: bulk-ignore 7 FP + re-run + verifikasi — **GRADE A (98/100)**
- [ ] (Opsional) Webhook Codacy → Hermes

## Hasil akhir (2026-08-31)

| Metrik | Sebelum | Sesudah |
|---|---|---|
| Grade | B (72) | **A (98)** |
| Issues | 126 | 7 (semua FP, di-ignore) |
| Issue % | 23% (gate FAIL) | **0% (gate PASS)** |
| LOC | 6.096 | 8.349 |

Issue yang di-fix di kode (bukan di-ignore): 65 no-undef, 9 XSS, 12 object injection,
open redirect (di-upgrade ke allowlist), crypto weak random, XSS dashboard/history,
4 unused vars, numeric literals (7→1 sisa FP), linefeed, `while(true)`,
dynamic delete, ConsistentReturn, CSS `rgba()`/`min()` → hex-8/max-width,
IIFE >50 NLOC dipecah (profile, history, dashboard, tailwind-config).

7 issue bulk-ignore (semua false positive, justifikasi per item):
1. `js/auth.js:135` Semgrep open-redirect — `next` sudah allowlist ketat (4 path tetap)
2-5. `storage.js:36`, `budget.js:22`, `input.js:120`, `storage-backup.js:11` PMD InnaccurateNumericLiteral — `1000000000` presisi eksak (≪ 2^53), rule over-aggressive untuk ECMAScript
6. `css/ui.css:1` Stylelint — error config Codacy sendiri: "Unknown rule scss_function-disallowed-list"
7. `package-lock.json:1` Lizard — file generated, bukan kode

Commit remedial: `e4f73b2` (Fase 1) → `67380c8` (Fase 2) → `d6fb248` (Fase 3) → `404e4ed` (Fase 4) → `fe2d090` (Fase 5: ConsistentReturn + allowlist).
