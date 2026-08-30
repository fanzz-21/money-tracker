// js/input.js — Form input transaksi (no-redirect UX)
(async function () {
  const Auth = await window.waitForAuth();
  const Storage = await window.waitForStorage();
  const session = await Auth.requireAuth();
  if (!session) return;

  const form = document.getElementById("tx-form");
  const typeRadios = form.querySelectorAll('input[name="type"]');
  const amount = document.getElementById("amount");
  const category = document.getElementById("category");
  const note = document.getElementById("note");
  const noteCount = document.getElementById("note-count");
  const date = document.getElementById("date");
  const btnSave = document.getElementById("btn-save");
  const btnSaveAdd = document.getElementById("btn-save-add");
  const btnLabel = btnSave.querySelector("[data-btn-label]");
  const btnIcon = btnSave.querySelector("[data-btn-icon]");

  const errType = document.getElementById("err-type");
  const errAmount = document.getElementById("err-amount");
  const errCategory = document.getElementById("err-category");
  const errDate = document.getElementById("err-date");

  const budgetRow = document.getElementById("budget-row");
  const budgetText = document.getElementById("budget-text");
  const budgetBar = document.getElementById("budget-bar");
  const btnBudgetSet = document.getElementById("btn-budget-set");

  // Load items sekali untuk hitung spent per kategori di bulan ini
  let allItems = await Storage.loadAll();

  // Default today
  date.value = Storage.todayISO();
  noteCount.textContent = "0";

  function setCategoryOptions(type) {
    const cats = (type === "in" ? Storage.CATS.in : Storage.CATS.out) || [];
    category.innerHTML = '<option value="" disabled selected>Pilih kategori</option>';
    cats.forEach((c) => {
      const opt = document.createElement("option");
      opt.value = c;
      opt.textContent = c;
      category.appendChild(opt);
    });
  }

  function fmtRp(n) {
    return "Rp " + Math.round(Number(n) || 0).toLocaleString("id-ID");
  }

  function spentThisMonth(cat) {
    if (!cat) return 0;
    const ym = (date.value || Storage.todayISO()).slice(0, 7);
    let sum = 0;
    for (const t of allItems) {
      if (t.type === "out" && t.category === cat && t.date && t.date.slice(0, 7) === ym) {
        sum += Number(t.amount) || 0;
      }
    }
    return sum;
  }

  function updateBudgetRow() {
    const cat = category.value;
    const budget = window.Budget ? window.Budget.get(cat) : 0;
    if (!cat || !budget) {
      budgetRow.classList.add("hidden");
      return;
    }
    const spent = spentThisMonth(cat);
    const pct = Math.min(100, Math.round((spent / budget) * 100));
    const over = spent > budget;
    budgetText.textContent = fmtRp(spent) + " / " + fmtRp(budget) + (over ? " ⚠" : "");
    budgetText.className = "tabular-nums font-medium " + (over ? "lk-text-danger" : "lk-text-muted");
    budgetBar.style.width = pct + "%";
    budgetBar.style.background = over ? "var(--lk-danger)" : pct >= 80 ? "var(--lk-warning, #f59e0b)" : "var(--lk-success)";
    budgetRow.classList.remove("hidden");
  }

  function promptSetBudget() {
    const cat = category.value;
    if (!cat) { window.LK.toast("Pilih kategori dulu.", "error"); return; }
    const current = window.Budget.get(cat);
    const v = window.prompt("Budget bulanan untuk \"" + cat + "\" (rupiah):", current ? String(current) : "");
    if (v === null) return;
    try {
      const n = Math.round(Number(String(v).replace(/[^\d]/g, "")));
      if (!n || n < 1) {
        if (String(v).trim() === "") { window.Budget.remove(cat); window.LK.toast("Budget dihapus.", "success"); }
        else window.LK.toast("Nominal tidak valid.", "error");
      } else {
        window.Budget.set(cat, n);
        window.LK.toast("Budget disimpan: " + fmtRp(n), "success");
      }
      updateBudgetRow();
    } catch (err) {
      window.LK.toast(err.message || "Gagal menyimpan budget.", "error");
    }
  }

  btnBudgetSet.addEventListener("click", promptSetBudget);

  function showErr(el, msg) {
    el.textContent = msg || "";
    el.classList.toggle("hidden", !msg);
  }

  function clearErrs() {
    [errType, errAmount, errCategory, errDate].forEach((e) => showErr(e, ""));
  }

  function validate() {
    clearErrs();
    let ok = true;
    const type = form.type.value;
    if (!type) { showErr(errType, "Pilih jenis transaksi."); ok = false; }
    const amt = Number(amount.value);
    if (!amt || amt < 1) { showErr(errAmount, "Masukkan jumlah valid (minimal 1)."); ok = false; }
    else if (amt > 1000000000) { showErr(errAmount, "Jumlah terlalu besar."); ok = false; }
    if (!category.value) { showErr(errCategory, "Pilih kategori."); ok = false; }
    if (!date.value) { showErr(errDate, "Pilih tanggal."); ok = false; }
    return ok;
  }

  function setSaving(state) {
    btnSave.disabled = state;
    btnSaveAdd.disabled = state;
    if (state) {
      btnLabel.textContent = "Menyimpan...";
      btnIcon.textContent = "sync";
      btnIcon.classList.add("animate-spin");
    } else {
      btnLabel.textContent = "Simpan Transaksi";
      btnIcon.textContent = "save";
      btnIcon.classList.remove("animate-spin");
    }
  }

  async function save() {
    if (!validate()) return null;
    setSaving(true);
    try {
      // Cek budget warning (untuk type=out saja, hanya info, tidak block)
      const t = form.type.value;
      if (t === "out" && window.Budget) {
        const cat = category.value;
        const b = window.Budget.get(cat);
        if (b > 0) {
          const cur = spentThisMonth(cat);
          const after = cur + Number(amount.value);
          if (after > b) {
            window.LK.toast("⚠ Over budget: " + fmtRp(after) + " / " + fmtRp(b), "error");
          } else if (after >= b * 0.8) {
            window.LK.toast("Hampir capai budget (" + Math.round((after / b) * 100) + "%)", "info");
          }
        }
      }
      const row = await Storage.addTx({
        date: date.value,
        type: t,
        amount: Number(amount.value),
        category: category.value,
        note: note.value.trim()
      });
      // Update cache lokal supaya budget bar langsung reflect item baru
      allItems = [row, ...allItems];
      // Broadcast supaya dashboard/history tab lain auto-refresh
      window.LK.broadcast("tx:added", row);
      return row;
    } catch (err) {
      showErr(errAmount, err.message || "Gagal menyimpan. Coba lagi.");
      return null;
    } finally {
      setSaving(false);
    }
  }

  function resetForm(keepDateAndType = true) {
    amount.value = "";
    note.value = "";
    noteCount.textContent = "0";
    if (!keepDateAndType) {
      date.value = Storage.todayISO();
      typeRadios.forEach((r) => (r.checked = false));
    }
    clearErrs();
    updateBudgetRow();
    amount.focus();
  }

  typeRadios.forEach((r) => {
    r.addEventListener("change", () => {
      setCategoryOptions(r.value);
      showErr(errType, "");
      updateBudgetRow();
    });
  });

  category.addEventListener("change", updateBudgetRow);
  date.addEventListener("change", updateBudgetRow);

  note.addEventListener("input", () => {
    noteCount.textContent = String(note.value.length);
  });

  form.addEventListener("submit", async (e) => {
    e.preventDefault();
    const row = await save();
    if (row) {
      window.LK.toast("Tersimpan", "success");
      // TIDAK redirect — tetap di halaman, form reset untuk entry berikutnya
      resetForm(true);
    }
  });

  btnSaveAdd.addEventListener("click", async () => {
    const row = await save();
    if (row) {
      window.LK.toast(`+ Rp ${Number(row.amount).toLocaleString("id-ID")}`, "success");
      resetForm(true);
      amount.focus();
    }
  });

  // Default ke "out" (pengeluaran lebih sering daripada pemasukan)
  const defaultType = document.querySelector('input[name="type"][value="out"]');
  if (defaultType) {
    defaultType.checked = true;
    setCategoryOptions("out");
  }
})();
