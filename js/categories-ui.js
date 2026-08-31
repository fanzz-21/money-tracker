// js/categories-ui.js — UI manajemen kategori custom (Phase C, fitur #6).
// Classic script (window.CategoriesUI) — di profile.html dimuat SEBELUM
// profile.js. Pakai window.waitForStorage() (pola sama dgn profile.js)
// karena ESM modules (storage.js) di-defer: classic script lebih dulu jalan.
//
// Model:
//   - Daftar kategori custom user (non-default saja yang ditampilkan).
//   - Tambah: form <input nama> + <select in/out> -> Storage.addCategory.
//   - Hapus: Storage.removeCategory (diblokir kalau masih terpakai / sistem).
//
// Semua pesan UI Bahasa Indonesia. XSS-immune (textContent/createElement).

(function () {
  "use strict";

  // Default bawaan sistem (untuk memfilter "custom" vs bawaan).
  // Disinkronkan dengan BASE_CATS di js/storage.js.
  var BASE_IN = ["Gaji", "Usaha", "Transfer masuk", "Lainnya"];
  var BASE_OUT = ["Makan", "Transport", "Tagihan", "Belanja", "Lainnya"];

  var Storage = null;
  var listIn = null;
  var listOut = null;
  var loading = false;
  var inited = false;

  function toast(msg, kind) {
    if (window.LK && typeof window.LK.toast === "function") {
      window.LK.toast(msg, kind);
    } else {
      console.warn("[CategoriesUI]", msg);
    }
  }

  function clearList(el) {
    if (el) while (el.firstChild) el.removeChild(el.firstChild);
  }

  function emptyMsg(el, txt) {
    var li = document.createElement("li");
    li.className = "cat-empty";
    li.textContent = txt;
    el.appendChild(li);
  }

  function addLi(listEl, name, type) {
    var li = document.createElement("li");
    li.className = "cat-item";
    li.textContent = name; // textContent -> XSS-immune

    var del = document.createElement("button");
    del.type = "button";
    del.className = "cat-del";
    del.textContent = "Hapus";
    del.setAttribute("aria-label", "Hapus kategori " + name);
    del.addEventListener("click", function () {
      if (!confirm("Hapus kategori \"" + name + "\"?")) return;
      Storage.removeCategory(name, type)
        .then(function () {
          toast("Kategori \"" + name + "\" dihapus.", "success");
          render();
        })
        .catch(function (e) {
          toast(e.message || String(e), "error");
        });
    });
    li.appendChild(del);
    listEl.appendChild(li);
  }

  function customCats() {
    var cats = (Storage && Storage.CATS) || { in: [], out: [] };
    var inSet = {}, outSet = {};
    BASE_IN.forEach(function (n) { inSet[n] = true; });
    BASE_OUT.forEach(function (n) { outSet[n] = true; });
    var custom = { in: [], out: [] };
    cats.in.forEach(function (n) { if (!inSet[n]) custom.in.push(n); });
    cats.out.forEach(function (n) { if (!outSet[n]) custom.out.push(n); });
    return custom;
  }

  function render() {
    if (loading) return Promise.resolve();
    loading = true;
    return Storage.loadCategories({ force: true })
      .then(function () {
        if (listIn) clearList(listIn);
        if (listOut) clearList(listOut);
        var c = customCats();
        if (listIn) {
          if (c.in.length === 0) emptyMsg(listIn, "Belum ada kategori masuk.");
          c.in.forEach(function (n) { addLi(listIn, n, "in"); });
        }
        if (listOut) {
          if (c.out.length === 0) emptyMsg(listOut, "Belum ada kategori keluar.");
          c.out.forEach(function (n) { addLi(listOut, n, "out"); });
        }
      })
      .catch(function (e) {
        toast(e.message || String(e), "error");
      })
      .then(function () { loading = false; });
  }

  function init() {
    if (inited) return;
    inited = true;
    listIn = document.getElementById("custom-cats-in");
    listOut = document.getElementById("custom-cats-out");
    var form = document.getElementById("cat-form");
    var nameInput = document.getElementById("cat-name");
    var typeSelect = document.getElementById("cat-type");
    if (!listIn || !listOut || !form) return;

    form.addEventListener("submit", function (e) {
      e.preventDefault();
      var name = (nameInput.value || "").trim();
      var type = typeSelect.value;
      if (!name) { toast("Nama kategori kosong.", "error"); return; }
      Storage.addCategory(name, type)
        .then(function (saved) {
          toast("Kategori \"" + saved + "\" ditambahkan.", "success");
          nameInput.value = "";
          render();
        })
        .catch(function (er) {
          toast(er.message || String(er), "error");
        });
    });

    render();
  }

  // Entry: tunggu module Storage siap (pola profile.js), lalu init.
  window.waitForStorage().then(function (S) {
    Storage = S;
    init();
  }).catch(function (e) {
    console.error("[CategoriesUI] init gagal:", e);
  });

  window.CategoriesUI = { render: render };
})();
