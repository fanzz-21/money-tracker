// js/exports.js — Modul unduh berkas (CSV BOM, XLSX via SheetJS, JSON).
// Dipakai js/history.js via window.waitForExports().
//
// SheetJS (XLSX) di-load dinamis dari CDN pinned 0.18.5 HANYA saat tombol
// Excel diklik — tidak menambah beban halaman. Kalau CDN down, CSV tetap jalan.

import Storage from "./storage.js";

function downloadBlob(blob, filename) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

// Nama file ber-brand "fintrack-" (bukan "kas-harian-" lama).
function baseName() {
  return "fintrack-riwayat-" + Storage.todayISO();
}

// CSV dengan BOM \uFEFF (Excel-safe untuk karakter non-ASCII).
function csv(items) {
  downloadBlob(
    new Blob([Storage.toCsvBom(items)], { type: "text/csv;charset=utf-8;" }),
    baseName() + ".csv"
  );
}

// XLSX via SheetJS (json_to_sheet; kolom rapi, bisa dibuka Excel/Google Sheets).
async function xlsx(items) {
  const XLSX = await import("https://cdn.jsdelivr.net/npm/xlsx@0.18.5/dist/xlsx.full.min.js");
  const rows = items.map((t) => ({
    tanggal: t.date,
    jenis: t.type === "in" ? "masuk" : "keluar",
    jumlah: t.amount,
    kategori: t.category,
    keterangan: t.note || "",
    waktu: t.ts
  }));
  const ws = XLSX.utils.json_to_sheet(rows);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, "Riwayat");
  XLSX.writeFile(wb, baseName() + ".xlsx");
}

const Exports = { csv, xlsx, downloadBlob, baseName };
window.Exports = Exports;
export default Exports;
