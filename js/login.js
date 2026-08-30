// js/login.js — Flow login 2 langkah dengan Supabase
// Step 1: username (3-32 char, huruf/angka/._-) -> validasi
// Step 2: password (min 6) -> signIn (existing) atau signUp (baru)
// Setelah berhasil, redirect ke `next` param.

(async function () {
  // Tunggu auth.js & supabase.js selesai load sebagai module
  await new Promise((r) => setTimeout(r, 50));

  if (window.Auth && window.Auth.isLoggedIn()) {
    window.Auth.redirectAfterAuth();
    return;
  }

  const step1 = document.getElementById("step-1");
  const step2 = document.getElementById("step-2");
  const form1 = document.getElementById("form-step-1");
  const form2 = document.getElementById("form-step-2");
  const identifier = document.getElementById("identifier");
  const password = document.getElementById("password");
  const display = document.getElementById("display-identifier");
  const hint = document.getElementById("mode-hint");
  const submitBtn = document.getElementById("btn-submit");
  const err1 = document.getElementById("err-1");
  const err2 = document.getElementById("err-2");

  let pendingId = "";
  let isExisting = false; // false => signUp, true => signIn

  function showErr(el, msg) {
    el.textContent = msg || "";
    el.classList.toggle("hidden", !msg);
  }

  function goStep2() {
    step1.classList.remove("step-visible");
    step1.classList.add("step-hidden");
    step2.classList.remove("step-hidden");
    step2.classList.add("step-visible");
    password.value = "";
    password.focus();
  }

  function goStep1() {
    step2.classList.remove("step-visible");
    step2.classList.add("step-hidden");
    step1.classList.remove("step-hidden");
    step1.classList.add("step-visible");
    showErr(err2, "");
    identifier.focus();
  }

  form1.addEventListener("submit", (e) => {
    e.preventDefault();
    const id = identifier.value.trim();
    const validationErr = window.Auth.validateIdentifier(id);
    if (validationErr) {
      showErr(err1, validationErr);
      return;
    }
    showErr(err1, "");
    pendingId = id;
    display.textContent = id;
    // Supabase tidak expose "cek username terdaftar" via anon API.
    // Kita coba signIn dulu. Kalau error "Invalid credentials" -> signUp.
    hint.textContent = "Masukkan password (min. 6 karakter).";
    submitBtn.textContent = "Lanjut";
    isExisting = true;
    goStep2();
  });

  document.getElementById("btn-back").addEventListener("click", goStep1);

  form2.addEventListener("submit", async (e) => {
    e.preventDefault();
    if (!pendingId) return;

    const pwd = password.value;
    if (!pwd || pwd.length < 6) {
      showErr(err2, "Password minimal 6 karakter.");
      return;
    }

    submitBtn.disabled = true;
    submitBtn.textContent = "Memproses...";

    try {
      let result;
      if (isExisting) {
        result = await window.Auth.signIn(pendingId, pwd);
        if (!result.ok && /salah|tidak valid|invalid/i.test(result.error || "")) {
          // Coba signUp — kemungkinan user baru
          const up = await window.Auth.signUp(pendingId, pwd);
          if (up.ok) {
            const sess = up.user && (await window.Auth.currentUser());
            if (sess) {
              await runMigrations();
              window.Auth.redirectAfterAuth();
              return;
            }
            showErr(err2, "Akun dibuat. Cek email untuk konfirmasi (atau matikan email confirmation di Supabase).");
            submitBtn.disabled = false;
            submitBtn.textContent = "Daftar & masuk";
            return;
          }
          result = up;
        }
      } else {
        result = await window.Auth.signUp(pendingId, pwd);
      }

      if (!result.ok) {
        showErr(err2, result.error || "Gagal. Coba lagi.");
        return;
      }

      if (result.needsConfirm) {
        showErr(err2, "Akun dibuat. Cek email untuk konfirmasi.");
        return;
      }

      await runMigrations();
      window.Auth.redirectAfterAuth();
    } catch (err) {
      showErr(err2, err.message || "Gagal. Coba lagi.");
    } finally {
      submitBtn.disabled = false;
      submitBtn.textContent = "Masuk";
    }
  });

  async function runMigrations() {
    try {
      const mod = await import("./migrate.js");
      await mod.migrateLocalToSupabase();
    } catch (e) {
      console.warn("[LK] Migrasi dilewati:", e.message);
    }
  }
})();
