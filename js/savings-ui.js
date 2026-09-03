// js/savings-ui.js — UI halaman Target Tabungan (Phase E)
// Classic script, menunggu ESM module Savings siap via window.waitFor.

(function () {
  "use strict";

  var Savings = null;
  var list = null;
  var form = null;
  var nameInput = null;
  var targetInput = null;
  var deadlineInput = null;
  var noteInput = null;
  var countEl = null;
  var loading = false;

  function toast(msg, kind) {
    if (window.LK && typeof window.LK.toast === "function") {
      window.LK.toast(msg, kind);
    } else {
      console.warn("[SavingsUI]", msg);
    }
  }

  function rupiah(n) {
    return "Rp " + Math.round(Number(n) || 0).toLocaleString("id-ID");
  }

  function pct(saved, target) {
    if (!target || target <= 0) return 0;
    return Math.min(100, Math.round((saved / target) * 100));
  }

  function clearList() {
    if (list) while (list.firstChild) list.removeChild(list.firstChild);
  }

  function emptyMsg(txt) {
    var li = document.createElement("li");
    li.className = "text-center text-sm text-[var(--lk-text-muted)] py-6";
    li.textContent = txt;
    list.appendChild(li);
  }

  function addCard(g) {
    var li = document.createElement("li");
    li.className = "lk-card p-4 min-w-0" + (g.active ? "" : " opacity-50");

    var head = document.createElement("div");
    head.className = "flex items-start justify-between gap-2 mb-2";

    var titleWrap = document.createElement("div");
    titleWrap.className = "min-w-0 flex-1";
    var name = document.createElement("h3");
    name.className = "font-semibold truncate";
    name.textContent = g.name;
    titleWrap.appendChild(name);

    if (g.deadline) {
      var dl = document.createElement("p");
      dl.className = "text-xs text-[var(--lk-text-faint)]";
      dl.textContent = "Deadline: " + g.deadline;
      titleWrap.appendChild(dl);
    }

    var badge = document.createElement("span");
    var p = pct(g.saved_amount, g.target_amount);
    badge.className = "text-xs font-medium px-2 py-0.5 rounded-full shrink-0 " +
      (p >= 100 ? "bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200" :
       "bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200");
    badge.textContent = p + "%";

    head.append(titleWrap, badge);
    li.appendChild(head);

    // Progress bar
    var barWrap = document.createElement("div");
    barWrap.className = "h-2.5 rounded-full bg-[var(--lk-border)] overflow-hidden mb-2";
    var bar = document.createElement("div");
    bar.className = "h-full rounded-full transition-all duration-500";
    bar.style.width = p + "%";
    bar.style.background = p >= 100 ? "var(--lk-success)" : "var(--lk-primary)";
    barWrap.appendChild(bar);
    li.appendChild(barWrap);

    // Amounts
    var amounts = document.createElement("div");
    amounts.className = "flex items-center justify-between text-sm mb-3";
    var saved = document.createElement("span");
    saved.className = "font-medium tabular-nums";
    saved.textContent = rupiah(g.saved_amount) + " / " + rupiah(g.target_amount);
    var remaining = document.createElement("span");
    remaining.className = "text-[var(--lk-text-muted)] tabular-nums";
    var left = Math.max(0, (g.target_amount || 0) - (g.saved_amount || 0));
    remaining.textContent = p >= 100 ? "Tercapai! 🎉" : "Sisa " + rupiah(left);
    amounts.append(saved, remaining);
    li.appendChild(amounts);

    // Actions
    var actions = document.createElement("div");
    actions.className = "flex items-center gap-2 flex-wrap";

    var addBtn = document.createElement("button");
    addBtn.type = "button";
    addBtn.className = "lk-btn-primary text-xs flex items-center gap-1";
    addBtn.innerHTML = '<span class="material-symbols-outlined text-sm">add</span> Tabung';
    addBtn.addEventListener("click", function () {
      var amt = prompt("Jumlah yang ditabung (Rp):");
      if (!amt) return;
      var n = Math.round(Number(amt.replace(/\D/g, "")));
      if (!n || n < 1) { toast("Jumlah tidak valid.", "error"); return; }
      Savings.updateProgress(g.id, n)
        .then(function () { toast("+" + rupiah(n) + " ditambahkan!", "success"); render(); })
        .catch(function (e) { toast(e.message || String(e), "error"); });
    });
    actions.appendChild(addBtn);

    var toggleBtn = document.createElement("button");
    toggleBtn.type = "button";
    toggleBtn.className = "lk-btn-secondary text-xs";
    toggleBtn.textContent = g.active ? "Nonaktifkan" : "Aktifkan";
    toggleBtn.addEventListener("click", function () {
      Savings.toggleGoal(g.id, !g.active)
        .then(function () { render(); })
        .catch(function (e) { toast(e.message || String(e), "error"); });
    });
    actions.appendChild(toggleBtn);

    var delBtn = document.createElement("button");
    delBtn.type = "button";
    delBtn.className = "text-xs text-red-500 hover:text-red-700 px-2 py-1";
    delBtn.textContent = "Hapus";
    delBtn.setAttribute("aria-label", "Hapus target " + g.name);
    delBtn.addEventListener("click", function () {
      if (!confirm("Hapus target \"" + g.name + "\"?")) return;
      Savings.deleteGoal(g.id)
        .then(function () { toast("Target dihapus.", "success"); render(); })
        .catch(function (e) { toast(e.message || String(e), "error"); });
    });
    actions.appendChild(delBtn);

    li.appendChild(actions);
    list.appendChild(li);
  }

  function render() {
    if (loading || !Savings) return;
    loading = true;
    Savings.loadGoals()
      .then(function (goals) {
        clearList();
        if (countEl) countEl.textContent = goals.length ? goals.length + " target" : "";
        if (!goals.length) {
          emptyMsg("Belum ada target tabungan. Tambahkan di form atas.");
          return;
        }
        goals.forEach(addCard);
      })
      .catch(function (e) {
        clearList();
        emptyMsg("Gagal memuat target: " + (e.message || e));
      })
      .then(function () { loading = false; });
  }

  function onFormSubmit(e) {
    e.preventDefault();
    if (!Savings) return;
    Savings.createGoal({
      name: nameInput.value,
      targetAmount: Number(targetInput.value),
      deadline: deadlineInput.value || null,
      note: noteInput.value
    })
      .then(function () {
        toast("Target \"" + (nameInput.value || "").trim() + "\" ditambahkan.", "success");
        nameInput.value = "";
        targetInput.value = "";
        deadlineInput.value = "";
        noteInput.value = "";
        render();
      })
      .catch(function (err) {
        toast(err.message || String(err), "error");
      });
  }

  function init() {
    list = document.getElementById("sav-list");
    form = document.getElementById("savings-form");
    nameInput = document.getElementById("sav-name");
    targetInput = document.getElementById("sav-target");
    deadlineInput = document.getElementById("sav-deadline");
    noteInput = document.getElementById("sav-note");
    countEl = document.getElementById("sav-count");
    if (!list || !form) return;
    form.addEventListener("submit", onFormSubmit);
    render();
  }

  window.waitFor("Savings")
    .then(function (S) {
      Savings = S;
      init();
    })
    .catch(function (e) {
      console.error("[SavingsUI] init gagal:", e);
    });

  window.SavingsUI = { render: render };
})();

