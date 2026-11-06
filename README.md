# Skema database Gastro-Cashier (RestoPOS Touch)

Hasil reverse engineering dari kode front-end pada commit `d091435`. Aplikasi saat ini menyimpan semuanya di `localStorage` (delapan kunci `resto_pos_*_v1`); folder ini memuat bentuk relasionalnya untuk backend PostgreSQL.

| File | Isi |
| --- | --- |
| `schema.sql` | DDL PostgreSQL 15+: 19 tabel, 8 view, fungsi hitung (diskon, service charge, PB1, potong stok per batch), trigger status meja. Setiap kolom dari field TypeScript diberi tag `[src: Antarmuka.field]` di COMMENT. |
| `ERD.md` | Diagram ERD (Mermaid, tampil langsung di GitHub) dan daftar relasi. Dibuat otomatis. |
| `DATA_DICTIONARY.md` | Temuan perilaku kode yang mempengaruhi desain, lalu kamus kolom, aturan CHECK, dan indeks tiap tabel. Dibuat otomatis. |
| `seed.sql` | Data master dari kode: 36 meja, 14 bahan baku, 18 menu beserta modifier dan resep, 3 akun staf, peran, aturan diskon. Dibuat otomatis oleh `tools/generate-seed.ts`. |
| `field-map.json` | Field `pos.ts` yang sengaja tidak punya kolom (diturunkan lewat view) dan perbedaan tipe yang diizinkan. |
| `tests/` | `run.sh` menjalankan semuanya; `scenarios.sql` (skenario kasir), `parity-gen.ts` (hitungan SQL lawan TypeScript), `check-coverage.ts` (cakupan field). |
| `tools/` | `generate-seed.ts`, `generate-erd.ts`. |

## Menjalankan pengujian

Butuh PostgreSQL 15 atau lebih baru (`psql` di PATH, koneksi lewat variabel `PG*`) dan [bun](https://bun.sh).

```bash
bash db/tests/run.sh
```

Skrip ini menghapus dan membuat ulang database `gc_test` (ubah dengan `GC_TEST_DB`), memuat skema dan seed, lalu memeriksa:

1. seed sama persis dengan keluaran generator dari data di kode;
2. skenario kasir: bayar belakang, bayar depan dengan beberapa batch, dua pembayaran pada satu bill, status meja, antrean KDS dan pramusaji, potong stok, serta penolakan data yang tidak valid;
3. paritas hitungan: untuk 90.730 nilai subtotal dan tiga jenis diskon, fungsi SQL menghasilkan angka yang sama dengan `posCalculations.ts`;
4. setiap field di `src/types/pos.ts` punya kolom atau tercatat sebagai turunan, dan setiap nilai enum sama dengan CHECK di skema;
5. `ERD.md` dan `DATA_DICTIONARY.md` sama dengan hasil generator dari skema saat ini.

Setelah mengubah `schema.sql`, muat ke database uji lalu jalankan `bun db/tools/generate-erd.ts` untuk memperbarui dua dokumen itu. Jika `run.sh` menampilkan "sudah usang", file sudah dibuat ulang; periksa dan commit.

## Keputusan desain

- **Uang** memakai `NUMERIC(14,2)`; kode membulatkan ke Rupiah penuh dengan `Math.round`, dan fungsi SQL meniru pembulatannya.
- **Data master** memakai id teks dari kode (`T01`, `raw-beras`, `food-1`) agar seed apa adanya. Entitas yang dibuat saat berjalan memakai UUID, dan nomor cetak (`TRX-...`, `TKT-...`) disimpan di kolom terpisah.
- **Total transaksi tidak disimpan** di `transactions`: kode menimpa total setiap ada batch atau pelunasan. Uang tercatat di `payments` (satu baris per pelunasan), dan sisa tagihan diturunkan lewat `v_transaction_summary`.
- **Status bayar item** adalah `transaction_items.payment_id` (NULL = belum dibayar), menggantikan flag `isPaid` dan menunjuk pembayaran yang melunasinya.
- **Satu meja, satu transaksi aktif** dijaga indeks unik parsial; status meja `available` / `occupied` mengikuti transaksi lewat trigger.
- **PIN** disimpan sebagai HMAC-SHA256 dengan pepper dari server. Pepper di `seed.sql` hanya untuk demo.
- **Tarif PB1 dan service charge** ada di `restaurant_settings` dan disalin ke tiap transaksi. Opsi `service_in_pb1_base` (default TRUE) mengikuti `calculateOrderTotals` di kode: PB1 dihitung dari subtotal setelah diskon ditambah service charge. Cek ke perda daerah target sebelum dipakai di klien.

## Yang sengaja belum ada

Kode belum punya fitur ini, jadi skema tidak mengarangnya: shift kasir dan Z-Report, void atau pembatalan transaksi, reservasi meja, multi-outlet, batch stok dan tanggal kedaluwarsa, supplier dan PO, riwayat mutasi stok, dan pembayaran terbagi per item. Beberapa di antaranya sudah ada di blueprint `Gastro-Knowledge` (batch FEFO, PO, buku besar stok). Bila kedua repo disatukan, perbedaan yang perlu diselesaikan: id bahan (`raw-beras` lawan SKU `RAW-BERAS-01`), model stok (satu angka lawan batch), dan model pesanan (`transactions` dengan batch lawan `orders`).
