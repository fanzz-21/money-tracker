// js/auth.js — Auth Supabase (ESM)
// API publik (dipakai halaman lain):
//   Auth.signIn(identifier, password) -> { ok, user, error, created }
//   Auth.signUp(identifier, password) -> { ok, user, error }
//   Auth.logout() -> Promise<void>                  (alias untuk signOut)
//   Auth.signOut() -> Promise<void>
//   Auth.isLoggedIn() -> boolean
//   Auth.requireAuth() -> user | null  (redirect ke login.html kalau belum)
//   Auth.redirectAfterAuth() -> void
//   Auth.normId(s) -> string
//
// `identifier` adalah username (mis. "fanzz"). Internally Supabase butuh
// email, jadi kita format sebagai `<username>@lk.app` (domain internal
// yang tidak bisa dikirimi email beneran).
//
// Rules:
//   - Username: huruf/angka/underscore/dot/dash, 3-32 char, lowercase
//   - Boleh juga email valid (untuk backward compat)
//   - Password: min 6 karakter

import { supabase, currentUser } from "./supabase.js";

const INTERNAL_DOMAIN = "lk.app";

function normId(v) {
  return String(v || "").trim().toLowerCase();
}

function isValidUsername(s) {
  return /^[a-z0-9._-]{3,32}$/.test(s);
}

function isEmail(s) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(s);
}

// Terima username ATAU email. Kalau username, format jadi email internal.
function toEmail(identifier) {
  const id = normId(identifier);
  if (!id) return null;
  if (isEmail(id)) return id;                 // sudah email valid
  if (isValidUsername(id)) return `${id}@${INTERNAL_DOMAIN}`;  // username -> email
  return null;                                 // invalid
}

function translateError(msg) {
  if (!msg) return "";
  const m = String(msg).toLowerCase();
  if (m.includes("invalid login") || m.includes("invalid credentials")) return "Username/email atau password salah.";
  if (m.includes("user already registered") || m.includes("already registered")) return "Username sudah dipakai. Masuk dengan password.";
  if (m.includes("password") && m.includes("at least")) return "Password minimal 6 karakter.";
  if (m.includes("email") && m.includes("invalid")) return "Format email tidak valid.";
  if (m.includes("rate limit") || m.includes("too many")) return "Terlalu banyak percobaan. Coba lagi nanti.";
  if (m.includes("signup") && m.includes("disabled")) return "Pendaftaran ditutup.";
  return msg;
}

function validateIdentifier(identifier) {
  const id = normId(identifier);
  if (!id) return "Isi username.";
  // Tolak email kosong
  if (isEmail(id) && !id.includes(".")) return "Format email tidak valid.";
  if (!isEmail(id) && !isValidUsername(id)) {
    return "Username 3-32 karakter, hanya huruf/angka/._-";
  }
  return null;
}

export async function signIn(identifier, password) {
  const email = toEmail(identifier);
  if (!email) return { ok: false, error: "Format username/email tidak valid." };
  if (!password || password.length < 6) return { ok: false, error: "Password minimal 6 karakter." };

  const { data, error } = await supabase.auth.signInWithPassword({ email, password });
  if (error) return { ok: false, error: translateError(error.message) };
  return { ok: true, user: data.user, created: false };
}

export async function signUp(identifier, password) {
  const email = toEmail(identifier);
  if (!email) return { ok: false, error: "Format username tidak valid (3-32 karakter)." };
  if (!password || password.length < 6) return { ok: false, error: "Password minimal 6 karakter." };

  // Username-only (bukan email): pakai domain internal, disable email confirmation di project.
  // Kalau user pakai email valid, signUp normal.
  const { data, error } = await supabase.auth.signUp({
    email,
    password,
    options: {
      data: { username: normId(identifier) }   // simpan username asli di metadata
    }
  });
  if (error) return { ok: false, error: translateError(error.message) };
  return { ok: true, user: data.user, needsConfirm: !data.session };
}

export async function logout() {
  try {
    await supabase.auth.signOut();
  } catch (e) {
    console.warn("[LK] signOut error (ignored):", e.message);
  } finally {
    // Selalu redirect, meskipun ada error
    location.replace("login.html");
  }
}

// Alias untuk kompatibilitas
export const signOut = logout;

export function isLoggedIn() {
  // Supabase menyimpan session di localStorage; cek heuristik
  const keys = Object.keys(localStorage);
  return keys.some((k) => k.startsWith("sb-") && k.endsWith("-auth-token"));
}

export async function requireAuth() {
  const u = await currentUser();
  if (u) return u;
  const next = encodeURIComponent(location.pathname + location.search);
  location.replace("login.html?next=" + next);
  return null;
}

export function redirectAfterAuth() {
  const params = new URLSearchParams(location.search);
  const next = params.get("next") || "index.html";
  // Anti open-redirect: `next` hanya boleh path relatif same-origin.
  // Tolak: scheme (http/https/ftp), protocol-relative (//), backslash,
  // whitespace, DAN kontrol — `:x` saja tidak cukup (mis. "javascript:alert(1)"
  // di-encode sebagai "javascript%3aalert(1)" oleh requireAuth()).
  const safe =
    next.startsWith("/") === false &&
    !/^(?:[a-z][a-z0-9+.-]*:|\/\/|\\|\s)/i.test(next) &&
    !next.includes("\\") &&
    next.length <= 2048;
  if (!safe || next.includes("login.html")) {
    location.replace("index.html");
    return;
  }
  location.replace(next);
}

// Helper untuk deteksi akun di login step 1
// Supabase anon API tidak expose "cek email terdaftar" tanpa bocoran info
// (security risk). Kita return null dan biarkan login.js coba signIn dulu.
export async function findUser(_identifier) {
  return null;
}

export { validateIdentifier, toEmail, isValidUsername, isEmail, normId };

window.Auth = {
  signIn, signUp,
  logout, signOut,
  isLoggedIn, requireAuth, redirectAfterAuth,
  findUser, currentUser, normId,
  validateIdentifier, toEmail, isValidUsername, isEmail
};
