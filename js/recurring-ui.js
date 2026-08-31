// js/recurring-ui.js — UI halaman transaksi berulang (Phase D, fitur #8).
// Classic script (window.RecurringUI) di recurring.html — dimuat setelah
// module js/recurring.js, tapi dijalankan LEBIH DULU (classic tidak deferred),
// jadi pakai window.waitForStorage()/window.waitFor("Recurring") (pola
// categories-ui.js) untuk menunggu ESM modules siap.
//
// Model:
//   - Form aturan baru: nama, tipe (in/out), jumlah, kategori (dari
//     Storage.loadCategories — ikut kategori custom), tanggal 1-28, catatan.
//   - List aturan: toggle aktif/non-aktif + hapus (confirm).
//   - Auto-insert dilakukan di js/recurring.js (dashboard) — halaman ini
//     hanya CRUD aturan.
//
// Semua pesan UI Bahasa Indonesia. XSS-immune (textContent/createElement).

(function () {
  "use strict";

  var BULAN = ["Jan", "Feb", "Mar", "Apr", "Mei", "Jun", "Jul", "Agu", "Sep", "Okt", "Nov", "Des"];

  var Storage = null;
  var Recurring = null;
  var list = null;
  var form = null;
  var nameInput = null;
  var typeSel = null;
  var amountInput = null;
  var catSel = null;
  var daySel = null;
  var noteInput = null;
  var countEl = null;
  var loading = false;

  function toast(msg, kind) {
    if (window.LK && typeof window.LK.toast === "function") {
      window.LK.toast(msg, kind);
    } else {
      console.warn("[RecurringUI]", msg);
    }
  }

  function rupiah(n) {
    return "Rp " + Math.round(Number(n) || 0).toLocaleString("id-ID");
  }

  function monthLabel(ym) {
    var p = String(ym || "").split("-");
    if (p.length !== 2) return "";
    var m = Number(p[1]);
    if (m < 1 || m > 12) return "";
    return BULAN[m - 1] + " " + p[0];
  }

  function fillDays() {
    if (!daySel) return;
    daySel.innerHTML = "";
    for (var d = 1; d <= 28; d++) {
      var o = document.createElement("option");
      o.value = String(d);
      o.textContent = "Tanggal " + d;
      daySel.appendChild(o);
    }
    daySel.value = "5";
  }

  // Kategori mengikuti tipe (in/out) — muat dari Storage.loadCategories()
  // supaya kategori custom ikut muncul (pola input.js).
  function fillCats() {
    if (!catSel || !Storage || typeof Storage.loadCategories !== "function") return;
    Storage.loadCategories()
      .then(function (cats) {
        var type = typeSel ? typeSel.value : "out";
        var arr = (cats && cats[type]) || [];
        var prev = catSel.value;
        catSel.innerHTML = "";
        var ph = document.createElement("option");
        ph.value = "";
        ph.disabled = true;
        ph.textContent = "Pilih kategori";
        catSel.appendChild(ph);
        arr.forEach(function (n) {
          var o = document.createElement("option");
          o.value = n;
          o.textContent = n;
          catSel.appendChild(o);
        });
        // Pertahankan pilihan sebelumnya kalau masih ada (opsional).
        for (var i = 0; i < catSel.options.length; i++) {
          if (catSel.options[i].value === prev) { catSel.value = prev; break; }
        }
      })
      .catch(function (e) {
        toast("Gagal memuat kategori: " + (e.message || e), "error");
      });
  }

  function clearList() {
    if (list) while (list.firstChild) list.removeChild(list.firstChild);
  }

  function emptyMsg(txt) {
    var li = document.createElement("li");
    li.className = "rec-empty";
    li.textContent = txt;
    list.appendChild(li);
  }

  function addLi(r) {
    var li = document.createElement("li");
    li.className = "rec-item" + (r.active ? "" : " is-inactive");

    var main = document.createElement("div");
    main.className = "rec-item-main";

    var name = document.createElement("span");
    name.className = "rec-item-name";
    name.textContent = r.name;
    main.appendChild(name);

    var badge = document.createElement("span");
    badge.className = "rec-item-badge" + (r.active ? "" : " is-off");
    badge.textContent = r.active ? "Aktif" : "Nonaktif";
    main.appendChild(badge);

    var meta = document.createElement("span");
    meta.className = "rec-item-meta";
    meta.textContent = rupiah(r.amount) + " · " + r.category + " · tanggal " + r.day;
    main.appendChild(meta);

    var last = document.createElement("span");
    last.className = "rec-item-last";
    var ml = monthLabel(r.last_generated_month);
    last.textContent = ml ? "Terakhir dibuat: " + ml : "Belum pernah dibuat";
    main.appendChild(last);

    var actions = document.createElement("div");
    actions.className = "rec-item-actions";

    var toggle = document.createElement("button");
    toggle.type = "button";
    toggle.className = "rec-toggle lk-btn-secondary";
    toggle.textContent = r.active ? "Nonaktifkan" : "Aktifkan";
    toggle.addEventListener("click", function () {
      Recurring.toggleRule(r.id, !r.active)
        .then(function () { render(); })
        .catch(function (e) { toast(e.message || String(e), "error"); });
    });
    actions.appendChild(toggle);

    var del = document.createElement("button");
    del.type = "button";
    del.className = "rec-del";
    del.textContent = "Hapus";
    del.setAttribute("aria-label", "Hapus aturan " + r.name);
    del.addEventListener("click", function () {
      if (!confirm("Hapus aturan \"" + r.name + "\"? Transaksi yang sudah dibuat tidak ikut terhapus.")) return;
      Recurring.deleteRule(r.id)
        .then(function () {
          toast("Aturan \"" + r.name + "\" dihapus.", "success");
          render();
        })
        .catch(function (e) { toast(e.message || String(e), "error"); });
    });
    actions.appendChild(del);

    li.appendChild(main);
    li.appendChild(actions);
    list.appendChild(li);
  }

  function render() {
    if (loading || !Recurring) return;
    loading = true;
    Recurring.loadRules()
      .then(function (rules) {
        clearList();
        if (countEl) countEl.textContent = rules.length ? rules.length + " aturan" : "";
        if (!rules.length) {
          emptyMsg("Belum ada aturan. Tambahkan di form atas.");
          return;
        }
        rules.forEach(addLi);
      })
      .catch(function (e) {
        clearList();
        emptyMsg("Gagal memuat aturan: " + (e.message || e));
      })
      .then(function () { loading = false; });
  }

  function onFormSubmit(e) {
    e.preventDefault();
    if (!Recurring) return;
    Recurring.createRule({
      name: nameInput.value,
      type: typeSel.value,
      amount: Number(amountInput.value),
      category: catSel.value,
      note: noteInput.value,
      day: Number(daySel.value)
    })
      .then(function () {
        toast("Aturan \"" + (nameInput.value || "").trim() + "\" ditambahkan.", "success");
        nameInput.value = "";
        amountInput.value = "";
        noteInput.value = "";
        render();
      })
      .catch(function (err) {
        toast(err.message || String(err), "error");
      });
  }

  function init() {
    list = document.getElementById("rec-list");
    form = document.getElementById("rec-form");
    nameInput = document.getElementById("rec-name");
    typeSel = document.getElementById("rec-type");
    amountInput = document.getElementById("rec-amount");
    catSel = document.getElementById("rec-category");
    daySel = document.getElementById("rec-day");
    noteInput = document.getElementById("rec-note");
    countEl = document.getElementById("rec-count");
    if (!list || !form) return;

    fillDays();
    fillCats();
    if (typeSel) typeSel.addEventListener("change", fillCats);
    form.addEventListener("submit", onFormSubmit);
    render();
  }

  // Entry: tunggu Storage (untuk kategori) lalu Recurring (module ESM).
  window.waitForStorage()
    .then(function (S) {
      Storage = S;
      return window.waitFor("Recurring");
    })
    .then(function (R) {
      Recurring = R;
      init();
    })
    .catch(function (e) {
      console.error("[RecurringUI] init gagal:", e);
    });

  window.RecurringUI = { render: render };
})();
