// js/sidebar.js — Sidebar drawer (slide dari kiri) + navigasi global
// Dipakai oleh semua halaman yang load ready.js (semua kecuali login.html).
//
// Struktur list di sidebar (urutan dari atas ke bawah):
//   1. NAV utama: Dasbor, Catat Transaksi, Riwayat
//   2. Section Tampilan: Ganti tema
//   3. Section Akun (paling bawah, tepat di atas Logout): Profil & Pengaturan
//   4. Footer (paling akhir): Logout
//
// Keamanan: sidebar dibangun 100% via createElement/setAttribute/textContent
// (TIDAK ada innerHTML berisi data — data NAV/TAMPILAN/AKUN developer-
// controlled, tapi tetap XSS-immune).
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
    { href: "index.html", icon: "dashboard", label: "Dasbor" },
    { href: "input.html", icon: "add_circle", label: "Catat Transaksi" },
    { href: "history.html", icon: "history", label: "Riwayat" },
    { href: "recurring.html", icon: "repeat", label: "Berulang" },
    { href: "savings.html", icon: "savings", label: "Tabungan" }
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

  function makeIcon(cls, text) {
    const s = document.createElement("span");
    s.className = cls;
    s.textContent = text;
    return s;
  }

  function makeLink(item, active) {
    if (item.href) {
      const a = document.createElement("a");
      a.href = item.href;
      a.className = "lk-sidebar-link" + (active ? " is-active" : "");
      a.append(makeIcon("material-symbols-outlined", item.icon),
        document.createTextNode(item.label));
      return a;
    }
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = "lk-sidebar-link";
    btn.setAttribute("data-sidebar-action", item.action);
    btn.setAttribute("aria-label", item.label);
    const icon = makeIcon("material-symbols-outlined", item.icon);
    icon.setAttribute("data-theme-icon", "");
    btn.append(icon, document.createTextNode(item.label));
    return btn;
  }

  function makeSection(title, items) {
    const sec = document.createElement("div");
    sec.className = "lk-sidebar-section";
    const h = document.createElement("h3");
    h.className = "lk-sidebar-section-title";
    h.textContent = title;
    sec.appendChild(h);
    const here = currentPage();
    for (const item of items) sec.appendChild(makeLink(item, item.href === here));
    return sec;
  }

  function buildSidebar() {
    const here = currentPage();

    const backdrop = document.createElement("div");
    backdrop.className = "lk-sidebar-backdrop";
    backdrop.setAttribute("data-sidebar-backdrop", "");

    const aside = document.createElement("aside");
    aside.className = "lk-sidebar";
    aside.setAttribute("role", "navigation");
    aside.setAttribute("aria-label", "Menu utama");

    const header = document.createElement("header");
    header.className = "lk-sidebar-header";
    const brandRow = document.createElement("div");
    brandRow.className = "flex items-center gap-2 min-w-0";
    brandRow.appendChild(makeIcon("material-symbols-outlined lk-text-accent text-2xl", "account_balance_wallet"));
    const h2 = document.createElement("h2");
    h2.className = "font-semibold text-lg truncate";
    h2.textContent = "Fintrack";
    brandRow.appendChild(h2);
    const closeBtn = document.createElement("button");
    closeBtn.type = "button";
    closeBtn.className = "lk-sidebar-close";
    closeBtn.setAttribute("data-sidebar-close", "");
    closeBtn.setAttribute("aria-label", "Tutup menu");
    closeBtn.appendChild(makeIcon("material-symbols-outlined", "close"));
    header.append(brandRow, closeBtn);

    const nav = document.createElement("nav");
    nav.className = "lk-sidebar-nav";
    nav.setAttribute("aria-label", "Halaman");
    for (const item of NAV) nav.appendChild(makeLink(item, item.href === here));

    const footer = document.createElement("div");
    footer.className = "lk-sidebar-footer";
    const logout = document.createElement("button");
    logout.type = "button";
    logout.className = "lk-sidebar-link lk-sidebar-danger";
    logout.setAttribute("data-sidebar-action", "logout");
    logout.append(makeIcon("material-symbols-outlined", "logout"),
      document.createTextNode("Keluar"));
    footer.appendChild(logout);

    aside.append(header, nav,
      makeSection("Tampilan", TAMPILAN),
      makeSection("Akun", AKUN),
      footer);

    const root = document.createElement("div");
    root.append(backdrop, aside);
    return root;
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
    el.replaceChildren(buildSidebar());
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
        el.replaceChildren();
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
    // yang dipasang sekali ini tetap work walau DOM sidebar di-render ulang
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
