// js/realtime.js — Multi-device sync via Supabase Realtime (ESM)
// Subscribe ke Postgres changes pada tabel `transactions` filtered by
// user_id user yang sedang login. Setiap perubahan dari device manapun
// (HP, laptop, dll) di-broadcast lewat window.LK.broadcast("tx:added" /
// "tx:removed") sehingga dashboard.js / history.js auto-rerender tanpa
// refresh halaman. Cross-tab (BroadcastChannel) sudah ada di notify.js;
// file ini melengkapi dengan multi-device.
//
// API publik: subscribe sekali setelah SIGNED_IN, unsubscribe saat SIGNED_OUT.
// Aman dipanggil berulang — channel lama di-unsubscribe dulu.
//
// Tidak menambah apa-apa ke window. Import dari auth.js bila perlu manual.

import { supabase } from "./supabase.js";

let currentChannel = null;
let currentUserId = null;

function teardown() {
  if (currentChannel) {
    try { supabase.removeChannel(currentChannel); } catch (e) { /* ignore */ }
    currentChannel = null;
    currentUserId = null;
  }
}

function setup(uid) {
  if (!uid) return;
  if (currentChannel && currentUserId === uid) return; // idempotent
  teardown();

  const channelName = "lk-realtime-" + uid;
  const ch = supabase
    .channel(channelName)
    .on(
      "postgres_changes",
      { event: "INSERT", schema: "public", table: "transactions", filter: "user_id=eq." + uid },
      (payload) => {
        if (window.LK && typeof window.LK.broadcast === "function") {
          window.LK.broadcast("tx:added", { row: payload.new, source: "realtime" });
        }
      }
    )
    .on(
      "postgres_changes",
      { event: "DELETE", schema: "public", table: "transactions", filter: "user_id=eq." + uid },
      (payload) => {
        if (window.LK && typeof window.LK.broadcast === "function") {
          window.LK.broadcast("tx:removed", { id: payload.old && payload.old.id, source: "realtime" });
        }
      }
    )
    .subscribe((status) => {
      // Log halus; tidak ganggu UI. Status: SUBSCRIBED / CHANNEL_ERROR / TIMED_OUT / CLOSED.
      if (status === "CHANNEL_ERROR" || status === "TIMED_OUT") {
        // Auto-retry setelah 5 detik — penting saat device wake dari sleep.
        setTimeout(() => {
          if (currentUserId === uid) setup(uid);
        }, 5000);
      }
    });

  currentChannel = ch;
  currentUserId = uid;
}

// Auto-wire: dengarkan perubahan auth Supabase supaya subscribe/unsubscribe otomatis.
function autoWire() {
  if (!supabase || !supabase.auth) return;
  supabase.auth.onAuthStateChange((event, session) => {
    const uid = session && session.user ? session.user.id : null;
    if (event === "SIGNED_IN" && uid) {
      try { window.LK_CURRENT_USER_ID = uid; } catch (e) { /* ignore */ }
      setup(uid);
    } else if (event === "SIGNED_OUT") {
      try { delete window.LK_CURRENT_USER_ID; } catch (e) { /* ignore */ }
      teardown();
    }
  });
}

// Best-effort: kalau modul dimuat setelah session sudah ada (race), tetap subscribe.
async function bootstrap() {
  try {
    const { data: { user } } = await supabase.auth.getUser();
    if (user) {
      try { window.LK_CURRENT_USER_ID = user.id; } catch (e) { /* ignore */ }
      setup(user.id);
    }
  } catch (e) { /* ignore */ }
  autoWire();
}

bootstrap();

// Expor untuk pengujian manual (mis. panggil Realtime.teardown() di console)
export default { setup, teardown };
