// js/profile.js — Logic untuk halaman profile.html
// Load user info, stats, handle ganti password, budget editor, danger zone.
//
// Keamanan: semua data di-render via textContent/createElement (XSS-immune).
// Budget dibaca via Budget.get() (Map-based, tidak ada akses properti dinamis).
// Kompleksitas: IIFE utama dipecah ke sub-fungsi bernama.

function fmtRp(n) {
  return "Rp " + Number(n || 0).toLocaleString("id-ID");
}

function currentYM() {
  const now = new Date();
  return now.getFullYear() + "-" + String(now.getMonth() + 1).padStart(2, "0");
}

function makeBudgetRowDOM(cat, spent, check) {
  const pct = Math.min(100, Math.round(check.pct * 100));
  const statusClass = check.status === "over" ? "is-over" : (check.status === "warn" ? "is-warn" : "is-ok");
  const statusLabel = check.status === "over" ? "Over" : (check.status === "warn" ? "Hampir" : "Aman");
  const statusColor = check.status === "over" ? "lk-text-danger" : (check.status === "warn" ? "" : "lk-text-success");

  const row = document.createElement("div");
  row.className = "lk-budget-row";

  const left = document.createElement("div");
  left.className = "flex-1 min-w-0";

  const head = document.createElement("div");
  head.className = "flex items-center justify-between gap-2 mb-1";
  const catSpan = document.createElement("span");
  catSpan.className = "font-medium truncate";
  catSpan.textContent = cat;
  const statusSpan = document.createElement("span");
  statusSpan.className = "text-xs " + statusColor + " font-semibold shrink-0";
  statusSpan.textContent = statusLabel;
  head.append(catSpan, statusSpan);

  const bar = document.createElement("div");
  bar.className = "lk-budget-bar";
  const fill = document.createElement("div");
  fill.className = "lk-budget-bar-fill " + statusClass;
  fill.style.width = pct + "%";
  bar.appendChild(fill);

  const foot = document.createElement("div");
  foot.className = "flex items-center justify-between gap-2 mt-1 text-xs text-[var(--lk-text-muted)] tabular-nums";
  const amtSpan = document.createElement("span");
  amtSpan.textContent = fmtRp(spent) + " / " + fmtRp(check.budget);
  const pctSpan = document.createElement("span");
  pctSpan.textContent = pct + "%";
  foot.append(amtSpan, pctSpan);

  left.append(head, bar, foot);

  const btn = document.createElement("button");
  btn.type = "button";
  btn.setAttribute("data-remove-budget", cat);
  btn.className = "lk-btn-danger-ghost p-1.5";
  btn.setAttribute("aria-label", "Hapus budget " + cat);
  const icon = document.createElement("span");
  icon.className = "material-symbols-outlined text-lg";
  icon.textContent = "delete";
  btn.appendChild(icon);

  row.append(left, btn);
  return row;
}

function spentThisMonthFor(items, cat, ym) {
  return items
    .filter((t) => t.type === "out" && t.category === cat && (t.date || "").slice(0, 7) === ym)
    .reduce((s, t) => s + (Number(t.amount) || 0), 0);
}

async function renderStats(Storage) {
  try {
    const items = await Storage.loadAll();
    const mt = Storage.monthTotals(items, currentYM());
    const countEl = document.getElementById("stat-count");
    const inEl = document.getElementById("stat-in");
    const outEl = document.getElementById("stat-out");
    if (countEl) countEl.textContent = String(items.length);
    if (inEl) inEl.textContent = fmtRp(mt.masuk);
    if (outEl) outEl.textContent = fmtRp(mt.keluar);
  } catch (e) {
    console.error("[profile] stats load failed:", e);
  }
}

function renderUser(session) {
  const avatar = document.getElementById("avatar");
  const displayName = document.getElementById("display-name");
  const displayEmail = document.getElementById("display-email");
  const displayMeta = document.getElementById("display-meta");

  const user = session.user || session;
  const email = user.email || "(tanpa email)";
  const username = (user.user_metadata && user.user_metadata.username) || email.split("@")[0];
  const initial = (username[0] || "?").toUpperCase();
  const created = user.created_at
    ? new Date(user.created_at).toLocaleDateString("id-ID", { day: "numeric", month: "long", year: "numeric" })
    : "?";

  if (avatar) avatar.textContent = initial;
  if (displayName) displayName.textContent = username;
  if (displayEmail) displayEmail.textContent = email;
  if (displayMeta) displayMeta.textContent = "Akun dibuat: " + created;
}

async function renderBudgets(Storage, budgetList) {
  if (!budgetList) return;
  budgetList.innerHTML = "";
  let items = [];
  try { items = await Storage.loadAll(); } catch (e) { items = []; }
  const all = window.Budget.getAll();
  const ym = currentYM();
  const categories = ["Makan", "Transport", "Tagihan", "Belanja", "Lainnya"];
  for (const cat of categories) {
    const budget = window.Budget.get(cat);
    if (!budget) continue;
    const spent = spentThisMonthFor(items, cat, ym);
    budgetList.appendChild(makeBudgetRowDOM(cat, spent, window.Budget.check(cat, spent)));
  }
  if (Object.keys(all).length === 0) {
    budgetList.innerHTML =
      '<p class="text-sm text-center text-[var(--lk-text-faint)] py-2">Belum ada budget. Tambahkan di bawah.</p>';
  }
}

function bindBudgetEditor(Storage, budgetList, budgetForm, budgetCat, budgetAmt) {
  if (budgetForm) {
    budgetForm.addEventListener("submit", (e) => {
      e.preventDefault();
      try {
        window.Budget.set(budgetCat.value, Number(budgetAmt.value));
        budgetForm.reset();
        if (window.LK) window.LK.toast("Budget disimpan", "success");
        renderBudgets(Storage, budgetList);
      } catch (err) {
        if (window.LK) window.LK.toast((err && err.message) || "Gagal simpan budget", "error");
      }
    });
  }
  if (budgetList) {
    budgetList.addEventListener("click", (e) => {
      const btn = e.target.closest("[data-remove-budget]");
      if (!btn) return;
      const cat = btn.getAttribute("data-remove-budget");
      if (confirm('Hapus budget untuk kategori "' + cat + '"?')) {
        window.Budget.remove(cat);
        if (window.LK) window.LK.toast("Budget dihapus", "success");
        renderBudgets(Storage, budgetList);
      }
    });
  }
}

function bindPasswordForm(Auth, email) {
  const pwForm = document.getElementById("form-password");
  const pwError = document.getElementById("pw-error");
  const pwSuccess = document.getElementById("pw-success");
  const pwCurrent = document.getElementById("pw-current");
  const pwNew = document.getElementById("pw-new");
  const pwConfirm = document.getElementById("pw-confirm");
  if (!pwForm) return;

  function showErr(msg) {
    if (pwError) { pwError.textContent = msg; pwError.classList.remove("hidden"); }
    if (pwSuccess) pwSuccess.classList.add("hidden");
  }
  function showOk(msg) {
    if (pwSuccess) { pwSuccess.textContent = msg; pwSuccess.classList.remove("hidden"); }
    if (pwError) pwError.classList.add("hidden");
  }

  pwForm.addEventListener("submit", async (e) => {
    e.preventDefault();
    const cur = pwCurrent.value;
    const next = pwNew.value;
    const conf = pwConfirm.value;
    if (next.length < 6) { showErr("Password baru minimal 6 karakter."); return; }
    if (next !== conf) { showErr("Konfirmasi password tidak cocok."); return; }
    try {
      const supabase = window.supabase || (await import("./supabase.js")).supabase;
      // Supabase Auth: updateUser butuh session fresh — signIn ulang dulu.
      const lr = await supabase.auth.signInWithPassword({ email, password: cur });
      if (lr.error) { showErr("Password saat ini salah."); return; }
      const upd = await supabase.auth.updateUser({ password: next });
      if (upd.error) { showErr(upd.error.message); return; }
      showOk("Password berhasil diupdate. Silakan login ulang di sesi lain.");
      pwForm.reset();
      setTimeout(async () => {
        if (window.LK) window.LK.toast("Anda akan logout untuk konfirmasi password baru", "info");
        setTimeout(() => Auth.logout(), 1500);
      }, 1000);
    } catch (err) {
      showErr((err && err.message) || "Gagal ganti password.");
    }
  });
}

function bindDangerZone(Auth, Storage) {
  const resetBtn = document.getElementById("btn-reset");
  const logoutBtn = document.getElementById("btn-logout");

  if (resetBtn) {
    resetBtn.addEventListener("click", async () => {
      const ok1 = confirm("PERINGATAN: Hapus SEMUA transaksi Anda?\n\nTindakan ini tidak bisa dibatalkan. Backup dulu di Riwayat \u2192 Backup & Restore.");
      if (!ok1) return;
      const typed = prompt('Ketik "HAPUS" (huruf besar) untuk konfirmasi:');
      if (typed !== "HAPUS") {
        if (window.LK) window.LK.toast("Dibatalkan", "info");
        return;
      }
      try {
        const count = await Storage.clearAll();
        if (window.LK) {
          window.LK.toast(count + " transaksi dihapus", "success");
          window.LK.broadcast("tx:removed", { reset: true });
        }
        const c = document.getElementById("stat-count");
        const i = document.getElementById("stat-in");
        const o = document.getElementById("stat-out");
        if (c) c.textContent = "0";
        if (i) i.textContent = "Rp 0";
        if (o) o.textContent = "Rp 0";
      } catch (err) {
        if (window.LK) window.LK.toast("Gagal: " + ((err && err.message) || "unknown"), "error");
      }
    });
  }

  if (logoutBtn) {
    logoutBtn.addEventListener("click", () => {
      if (confirm("Keluar dari akun?")) Auth.logout();
    });
  }
}

(async function () {
  const Auth = await window.waitForAuth();
  const Storage = await window.waitForStorage();

  // Tunggu session dengan retry (race condition di HP).
  let session = await Auth.requireAuth();
  if (!session) {
    await new Promise((r) => setTimeout(r, 1000));
    session = await Auth.requireAuth();
  }
  if (!session) {
    location.replace("login.html");
    return;
  }

  renderUser(session);
  await renderStats(Storage);

  const budgetList = document.getElementById("budget-list");
  const budgetForm = document.getElementById("form-budget");
  const budgetCat = document.getElementById("budget-cat");
  const budgetAmt = document.getElementById("budget-amt");
  bindBudgetEditor(Storage, budgetList, budgetForm, budgetCat, budgetAmt);
  renderBudgets(Storage, budgetList);

  // Cross-tab refresh
  if (window.LK) {
    window.LK.on("tx:added", () => renderBudgets(Storage, budgetList));
    window.LK.on("tx:removed", () => renderBudgets(Storage, budgetList));
  }

  bindPasswordForm(Auth, (session.user || session).email);
  bindDangerZone(Auth, Storage);
})();
