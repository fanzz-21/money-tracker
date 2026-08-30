// js/sidebar.js — Sidebar drawer (slide dari kiri) + navigasi global
// Dipakai oleh semua halaman yang load ready.js (semua kecuali login.html).
//
// Struktur list di sidebar (urutan dari atas ke bawah):
//   1. NAV utama: Dasbor, Catat Transaksi, Riwayat
//   2. Section Tampilan: Ganti tema
//   3. Section Akun (paling bawah, tepat di atas Logout): Profil & Pengaturan
//   4. Footer (paling akhir): Logout
//
// Catatan teknis: state "sedang terbuka" disimpan di module-private `_isOpen`
// (bukan dari attribute `hidden` di root), supaya toggle() tidak pernah salah
// baca state karena race antara `removeAttribute('hidden')` dan waktu
// `setTimeout(..., 250)` saat close() menyembunyikan root. Dulu pakai attribute
// `hidden` sebagai state, dan akibatnya saat klik pertama `toggle()` sempat
// membaca `!hidden` (sudah di-removeAttribute di open()) lalu click kedua di
// window delegation sempat meng-close lagi — bikin "muncul sebentar lalu ilang".

(function (global) {
  const NAV = [
    { href: "index.html",   icon: "dashboard",       label: "Dasbor" },
    { href: "input.html",   icon: "add_circle",      label: "Catat Transaksi" },
    { href: "history.html", icon: "history",         label: "Riwayat" }
  ];

  // Section Tampilan: tema toggle. Taruh sebelum section Akun.
  const TAMPILAN = [
    { action: "theme", icon: "dark_mode", label: "Ganti tema" }
  ];

  // Section Akun: Profil & Pengaturan. Taruh di paling bawah, tepat di atas
  // footer Logout (sesuai requirement #3).
  const AKUN = [
    { href: "profile.html", icon: "account_circle", label: "Profil & Pengaturan" }
  ];

  // Identifikasi halaman aktif (untuk highlight).
  function currentPage() {
    const path = location.pathname.split("/").pop() || "index.html";
    return path;
  }

  function buildSidebarHTML() {
    const here = currentPage();
    const linkHTML = (item) => item.href
      ? `<a href="${item.href}" class="lk-sidebar-link ${here === item.href ? "is-active" : ""}">
           <span class="material-symbols-outlined">${item.icon}</span>
           <span>${item.label}</span>
         </a>`
      : `<button type="button" class="lk-sidebar-link" data-sidebar-action="${item.action}" aria-label="${item.label}">
           <span class="material-symbols-outlined" data-theme-icon>${item.icon}</span>
           <span>${item.label}</span>
         </button>`;

    return `
      <div class="lk-sidebar-backdrop" data-sidebar-backdrop></div>
      <aside class="lk-sidebar" role="navigation" aria-label="Menu utama">
        <header class="lk-sidebar-header">
          <div class="flex items-center gap-2 min-w-0">
            <span class="material-symbols-outlined lk-text-accent text-2xl">account_balance_wallet</span>
            <h2 class="font-semibold text-lg truncate">Kas Harian</h2>
          </div>
          <button type="button" class="lk-sidebar-close" data-sidebar-close aria-label="Tutup menu">
            <span class="material-symbols-outlined">close</span>
          </button>
        </header>

        <nav class="lk-sidebar-nav" aria-label="Halaman">
          ${NAV.map(linkHTML).join("")}
        </nav>

        <div class="lk-sidebar-section">
          <h3 class="lk-sidebar-section-title">Tampilan</h3>
          ${TAMPILAN.map(linkHTML).join("")}
        </div>

        <div class="lk-sidebar-section">
          <h3 class="lk-sidebar-section-title">Akun</h3>
          ${AKUN.map(linkHTML).join("")}
        </div>

        <div class="lk-sidebar-footer">
          <button type="button" class="lk-sidebar-link lk-sidebar-danger" data-sidebar-action="logout">
            <span class="material-symbols-outlined">logout</span>
            <span>Keluar</span>
          </button>
        </div>
      </aside>
    `;
  }

  // State: module-private, bukan dari attribute hidden (lihat header file).
  let _isOpen = false;
  let _mount = null;

  function ensureMount() {
    if (_mount && document.body.contains(_mount)) return _mount;
    let el = document.getElementById("lk-sidebar-root");
    if (!el) {
      el = document.createElement("div");
      el.id = "lk-sidebar-root";
      document.body.appendChild(el);
    }
    el.setAttribute("hidden", "");
    el.innerHTML = "";
    _mount = el;
    return el;
  }

  function open() {
    if (_isOpen) return;            // idempotent: kalau sudah terbuka, noop
    const el = ensureMount();
    el.innerHTML = buildSidebarHTML();
    el.removeAttribute("hidden");
    document.body.classList.add("lk-sidebar-open");
    _isOpen = true;
    // Apply is-open di frame berikutnya agar CSS transition bisa jalan
    // (translateX(-100%) -> translateX(0)).
    requestAnimationFrame(() => {
      const sidebar = el.querySelector(".lk-sidebar");
      if (sidebar) sidebar.classList.add("is-open");
    });
  }

  function close() {
    if (!_isOpen) return;            // idempotent
    const el = document.getElementById("lk-sidebar-root");
    if (!el) { _isOpen = false; return; }
    const sidebar = el.querySelector(".lk-sidebar");
    if (sidebar) sidebar.classList.remove("is-open");
    document.body.classList.remove("lk-sidebar-open");
    _isOpen = false;
    // Setelah transisi selesai, kosongkan HTML supaya backdrop & tombol
    // tidak lagi di DOM (menghindari interaksi balik).
    setTimeout(() => {
      if (!_isOpen) {
        el.setAttribute("hidden", "");
        el.innerHTML = "";
      }
    }, 260);
  }

  function toggle() {
    if (_isOpen) close();
    else open();
  }

  function init() {
    // Mount point di body (hidden awalnya, di-fill saat open()).
    ensureMount();

    // Delegated handler SEMUA interaksi sidebar di document — supaya listener
    // yang dipasang sekali ini tetap work walau HTML sidebar di-render ulang
    // setiap open().
    document.addEventListener("click", (e) => {
      // Tombol toggle di header (buka/tutup)
      if (e.target.closest("[data-sidebar-toggle]")) {
        e.preventDefault();
        toggle();
        return;
      }
      // Tombol close di header sidebar / klik backdrop
      if (e.target.closest("[data-sidebar-close]") || e.target.closest("[data-sidebar-backdrop]")) {
        close();
        return;
      }
      // Tombol di dalam list sidebar
      const themeBtn = e.target.closest('[data-sidebar-action="theme"]');
      if (themeBtn) {
        if (global.Theme && typeof global.Theme.toggle === "function") global.Theme.toggle();
        return;
      }
      const logoutBtn = e.target.closest('[data-sidebar-action="logout"]');
      if (logoutBtn) {
        if (global.Auth && typeof global.Auth.logout === "function") global.Auth.logout();
        else if (global.Auth && typeof global.Auth.signOut === "function") global.Auth.signOut();
        else location.replace("login.html");
        return;
      }
    });

    // ESC to close
    document.addEventListener("keydown", (e) => {
      if (e.key === "Escape" && _isOpen) close();
    });
  }

  global.Sidebar = { open, close, toggle, init, isOpen: () => _isOpen };

  // Auto-init setelah DOM ready. Panggil dari sini juga supaya ready.js
  // tidak perlu expose init manual ke setiap page script.
  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }
})(window);
