// js/savings.js — Target Tabungan / Savings Goals (Phase E)
//
// Model: user bisa buat banyak target tabungan. Progress disimpan sebagai
// kolom `saved_amount` di tabel savings_goals yang di-update client-side
// saat user "menabung" (tambah jumlah ke goal). Ini sederhana, idempotent,
// dan tidak butuh trigger DB kompleks.
//
// API publik (window.Savings):
//   loadGoals()                              -> Promise<Goal[]>
//   createGoal({name,targetAmount,deadline?,note?}) -> Promise<Goal>
//   updateProgress(id, amount)               -> Promise<void>  (add to saved)
//   deleteGoal(id)                           -> Promise<void>
//   toggleGoal(id, active)                   -> Promise<void>

import { supabase } from "./supabase.js";

const MAX_AMOUNT = 1000000000;
const MAX_NAME = 100;
const MAX_NOTE = 500;

async function loadGoals() {
  const { data, error } = await supabase
    .from("savings_goals")
    .select("*")
    .order("created_at", { ascending: false });
  if (error) throw new Error(error.message);
  return data || [];
}

async function createGoal({ name, targetAmount, deadline, note }) {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error("Belum login.");

  const cleanName = String(name || "").trim();
  if (!cleanName) throw new Error("Nama target wajib diisi.");
  if (cleanName.length > MAX_NAME) throw new Error("Nama target terlalu panjang (maks 100).");

  const n = Math.round(Number(targetAmount));
  if (!Number.isFinite(n) || n < 1) throw new Error("Jumlah target tidak valid (min 1).");
  if (n > MAX_AMOUNT) throw new Error("Jumlah target terlalu besar.");

  const cleanNote = String(note || "").trim().slice(0, MAX_NOTE);
  const dl = deadline || null;

  const { data, error } = await supabase
    .from("savings_goals")
    .insert({
      user_id: user.id,
      name: cleanName,
      target_amount: n,
      saved_amount: 0,
      deadline: dl,
      note: cleanNote,
      active: true
    })
    .select()
    .single();
  if (error) throw new Error(error.message);
  return data;
}

// Tambah jumlah ke saved_amount (bukan set absolute).
async function updateProgress(id, amount) {
  const add = Math.round(Number(amount));
  if (!Number.isFinite(add) || add < 1) throw new Error("Jumlah tidak valid.");

  // Fetch current first to avoid race + validate cap
  const { data: row, error: fetchErr } = await supabase
    .from("savings_goals")
    .select("saved_amount, target_amount")
    .eq("id", id)
    .single();
  if (fetchErr) throw new Error(fetchErr.message);
  if (!row) throw new Error("Target tidak ditemukan.");

  const newSaved = (row.saved_amount || 0) + add;
  if (newSaved > MAX_AMOUNT) throw new Error("Jumlah tabungan melebihi batas.");

  const { error } = await supabase
    .from("savings_goals")
    .update({ saved_amount: newSaved })
    .eq("id", id);
  if (error) throw new Error(error.message);
}

async function deleteGoal(id) {
  const { error } = await supabase
    .from("savings_goals")
    .delete()
    .eq("id", id);
  if (error) throw new Error(error.message);
}

async function toggleGoal(id, active) {
  const { error } = await supabase
    .from("savings_goals")
    .update({ active: !!active })
    .eq("id", id);
  if (error) throw new Error(error.message);
}

const Savings = {
  loadGoals,
  createGoal,
  updateProgress,
  deleteGoal,
  toggleGoal
};

window.Savings = Savings;
export default Savings;
export { loadGoals, createGoal, updateProgress, deleteGoal, toggleGoal };

