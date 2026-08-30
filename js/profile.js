// js/profile.js — Logic untuk halaman profile.html
// Load user info, stats, handle ganti password, budget editor, danger zone.

(async function () {
  const Auth = await waitForAuth();
  const Storage = await waitForStorage();
  const Budget = window.Budget;
  const supabase = window.supabase || (await import("./supabase.js")).supabase;

  // Tunggu session dengan retry
  let session = await Auth.requireAuth();
  if (!session) {
    await new Promise((r) => setTimeout(r, 1000));
    session = await Auth.requireAuth();
  }
  if (!session) {
    location.replace("login.html");
    return;
  }

  // Sidebar auto-init via sidebar.js (DOMContentLoaded).
  // Tidak perlu panggil Sidebar.init() manual di sini.

  // === Render user info ===
  const avatar = document.getElementById("avatar");
  const displayName = document.getElementById("display-name");
  const displayEmail = document.getElementById("display-email");
  const displayMeta = document.getElementById("display-meta");

  const user = session.user || session;
  const email = user.email || "(tanpa email)";
  const username = (user.user_metadata && user.user_metadata.username) || email.split("@")[0];
  const initial = (username[0] || "?").toUpperCase();
  const created = user.created_at ? new Date(user.created_at).toLocaleDateString("id-ID", { day: "numeric", month: "long", year: "numeric" }) : "?";

  if (avatar) avatar.textContent = initial;
  if (displayName) displayName.textContent = username;
  if (displayEmail) displayEmail.textContent = email;
  if (displayMeta) displayMeta.textContent = `Akun dibuat: ${created}`;

  // === Load stats ===
  try {
    const items = await Storage.loadAll();
    const now = new Date();
    const ym = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
    const mt = Storage.monthTotals(items, ym);
    const fmt = (n) => "Rp " + Number(n || 0).toLocaleString("id-ID");
    document.getElementById("stat-count").textContent = String(items.length);
    document.getElementById("stat-in").textContent = fmt(mt.masuk);
    document.getElementById("stat-out").textContent = fmt(mt.keluar);
  } catch (e) {
    console.error("[profile] stats load failed:", e);
  }

  // === Budget editor ===
  const budgetList = document.getElementById("budget-list");
  const budgetForm = document.getElementById("form-budget");
  const budgetCat = document.getElementById("budget-cat");
  const budgetAmt = document.getElementById("budget-amt");

  async function renderBudgets() {
    if (!budgetList) return;
    budgetList.innerHTML = "";
    let items = [];
    try { items = await Storage.loadAll(); } catch (e) { items = []; }
    const all = Budget.getAll();
    const monthKey = `${new Date().getFullYear()}-${String(new Date().getMonth() + 1).padStart(2, "0")}`;

    const categories = ["Makan", "Transport", "Tagihan", "Belanja", "Lainnya"];
    for (const cat of categories) {
      const budget = all[cat];
      if (!budget) continue;
      const spent = items
        .filter(t => t.type === "out" && t.category === cat && (t.date || "").slice(0, 7) === monthKey)
        .reduce((s, t) => s + Number(t.amount || 0), 0);
      const check = Budget.check(cat, spent);
      const pct = Math.min(100, Math.round(check.pct * 100));
      const statusClass = check.status === "over" ? "is-over" : (check.status === "warn" ? "is-warn" : "is-ok");
      const statusLabel = check.status === "over" ? "Over" : (check.status === "warn" ? "Hampir" : "Aman");
      const statusColor = check.status === "over" ? "lk-text-danger" : (check.status === "warn" ? "" : "lk-text-success");
      const row = document.createElement("div");
      row.className = "lk-budget-row";
      row.innerHTML = `
        <div class="flex-1 min-w-0">
          <div class="flex items-center justify-between gap-2 mb-1">
            <span class="font-medium truncate">${cat}</span>
            <span class="text-xs ${statusColor} font-semibold shrink-0">${statusLabel}</span>
          </div>
          <div class="lk-budget-bar">
            <div class="lk-budget-bar-fill ${statusClass}" style="width:${pct}%"></div>
          </div>
          <div class="flex items-center justify-between gap-2 mt-1 text-xs text-[var(--lk-text-muted)] tabular-nums">
            <span>${fmt(spent)} / ${fmt(budget)}</span>
            <span>${pct}%</span>
          </div>
        </div>
        <button type="button" data-remove-budget="${cat}" class="lk-btn-danger-ghost p-1.5" aria-label="Hapus budget ${cat}">
          <span class="material-symbols-outlined text-lg">delete</span>
        </button>
      `;
      budgetList.appendChild(row);
    }

    if (Object.keys(all).length === 0) {
      budgetList.innerHTML = '<p class="text-sm text-center text-[var(--lk-text-faint)] py-2">Belum ada budget. Tambahkan di bawah.</p>';
    }
  }

  if (budgetForm) {
    budgetForm.addEventListener("submit", (e) => {
      e.preventDefault();
      try {
        Budget.set(budgetCat.value, Number(budgetAmt.value));
        budgetForm.reset();
        if (window.LK) LK.toast("Budget disimpan", "success");
        renderBudgets();
      } catch (err) {
        if (window.LK) LK.toast(err.message || "Gagal simpan budget", "error");
      }
    });
  }

  if (budgetList) {
    budgetList.addEventListener("click", (e) => {
      const btn = e.target.closest("[data-remove-budget]");
      if (!btn) return;
      const cat = btn.dataset.removeBudget;
      if (confirm(`Hapus budget untuk kategori "${cat}"?`)) {
        Budget.remove(cat);
        if (window.LK) LK.toast("Budget dihapus", "success");
        renderBudgets();
      }
    });
  }

  renderBudgets();

  // Cross-tab refresh
  if (window.LK) {
    LK.on("tx:added", async () => renderBudgets());
    LK.on("tx:removed", async () => renderBudgets());
  }

  // === Ganti password ===
  const pwForm = document.getElementById("form-password");
  const pwError = document.getElementById("pw-error");
  const pwSuccess = document.getElementById("pw-success");
  const pwCurrent = document.getElementById("pw-current");
  const pwNew = document.getElementById("pw-new");
  const pwConfirm = document.getElementById("pw-confirm");

  function showPwError(msg) {
    if (pwError) { pwError.textContent = msg; pwError.classList.remove("hidden"); }
    if (pwSuccess) pwSuccess.classList.add("hidden");
  }
  function showPwSuccess(msg) {
    if (pwSuccess) { pwSuccess.textContent = msg; pwSuccess.classList.remove("hidden"); }
    if (pwError) pwError.classList.add("hidden");
  }

  if (pwForm) {
    pwForm.addEventListener("submit", async (e) => {
      e.preventDefault();
      const cur = pwCurrent.value;
      const next = pwNew.value;
      const conf = pwConfirm.value;
      if (next.length < 6) return showPwError("Password baru minimal 6 karakter.");
      if (next !== conf) return showPwError("Konfirmasi password tidak cocok.");

      // Supabase Auth: updateUser butuh session baru login
      // Cara yang supported: signIn ulang dengan password saat ini, lalu update
      try {
        const lr = await supabase.auth.signInWithPassword({ email, password: cur });
        if (lr.error) return showPwError("Password saat ini salah.");
        const upd = await supabase.auth.updateUser({ password: next });
        if (upd.error) return showPwError(upd.error.message);
        showPwSuccess("Password berhasil diupdate. Silakan login ulang di sesi lain.");
        pwForm.reset();
        // Sign out setelah update agar user login ulang (best practice)
        setTimeout(async () => {
          if (window.LK) LK.toast("Anda akan logout untuk konfirmasi password baru", "info");
          setTimeout(() => Auth.logout(), 1500);
        }, 1000);
      } catch (err) {
        showPwError(err.message || "Gagal ganti password.");
      }
    });
  }

  // === Danger zone ===
  const resetBtn = document.getElementById("btn-reset");
  const logoutBtn = document.getElementById("btn-logout");

  if (resetBtn) {
    resetBtn.addEventListener("click", async () => {
      const ok1 = confirm("PERINGATAN: Hapus SEMUA transaksi Anda?\n\nTindakan ini tidak bisa dibatalkan. Backup dulu di Riwayat → Backup & Restore.");
      if (!ok1) return;
      const typed = prompt('Ketik "HAPUS" (huruf besar) untuk konfirmasi:');
      if (typed !== "HAPUS") {
        if (window.LK) LK.toast("Dibatalkan", "info");
        return;
      }
      try {
        const count = await Storage.clearAll();
        if (window.LK) {
          LK.toast(`${count} transaksi dihapus`, "success");
          LK.broadcast("tx:removed", { reset: true });
        }
        renderBudgets();
        // Update stats
        document.getElementById("stat-count").textContent = "0";
        document.getElementById("stat-in").textContent = "Rp 0";
        document.getElementById("stat-out").textContent = "Rp 0";
      } catch (err) {
        if (window.LK) LK.toast("Gagal: " + (err.message || "unknown"), "error");
      }
    });
  }

  if (logoutBtn) {
    logoutBtn.addEventListener("click", () => {
      if (confirm("Keluar dari akun?")) Auth.logout();
    });
  }
})();
