# Catatan Serah Terima Developer — Gastro Cashier

> **Tujuan:** memberi tim developer peta kondisi implementasi, batas aman, dan pekerjaan lanjutan.
> **Basis catatan:** metadata PR dan keterangan validasi yang tercatat di GitHub per 10 November 2026. Status runtime, secret hosting, dan database tetap harus diverifikasi langsung sebelum rilis.
> **Branch dokumentasi:** `docs/dev-handoff-indonesia`
> **Branch acuan kode:** `feat/postgres-consolidated`
>
> Dokumen ini hanya dokumentasi. Tidak mengubah kode aplikasi, skema database, secret, workflow deployment, maupun data Neon.

## 1. Ringkasan status

- **Belum boleh dianggap siap Production (NO-GO).** CI yang lulus bukan pengganti tes HTTP end-to-end, verifikasi konfigurasi Production, dan cutover database.
- Jalur utama POS yang tercatat sudah terhubung ke API: login, daftar meja/sesi, menu, pesanan, status KDS/konfirmasi served, pembayaran, dan receipt.
- Admin Console saat ini sengaja **read-only**. Mutasi data staf tetap dikunci di backend/database.
- Pengujian E2E HTTP penuh belum selesai. Catatan PR #16 menyebut Preview Vercel terhalang kuota deployment 24 jam dan PIN staf E2E terisolasi belum tersedia.
- CI PostgreSQL menggunakan database sementara/ephemeral. Jangan menyimpulkan database Neon atau Production sudah dimigrasikan atau tervalidasi.

## 2. Fitur yang sudah ada — tetap perlu verifikasi alur nyata

| Area | Kondisi tercatat | Catatan untuk reviewer |
|---|---|---|
| Login staf | API-backed | Uji PIN/NFC, throttling, sesi, logout, dan penolakan kredensial salah. |
| Meja dan sesi | API-backed | Uji isolasi tenant/outlet, buka/tutup sesi, dan konflik sesi aktif. |
| Menu | API-backed read | Cocokkan UUID kategori/item dengan data fixture dan outlet aktif. |
| Pesanan | API-backed | Uji tambah item, batch order, validasi waiter, dan kepemilikan item terhadap sesi. |
| KDS / served | Persistensi API untuk status memasak dan konfirmasi served | Pastikan perubahan bertahan setelah refresh dan tidak bisa mengubah item milik sesi lain. |
| Pembayaran | Endpoint settlement dan idempotency tersedia | Uji nominal, payload, pengulangan request, dan penolakan pembayaran lintas sesi. |
| Receipt | Alur receipt termasuk dalam jalur API POS | Verifikasi isi, total, pembulatan, dan konsistensi dengan transaksi tersimpan. |
| Admin Console | Read-only / emergency lock | Jangan mengaktifkan tombol mutasi hanya dengan mengubah UI. |

## 3. Fitur belum selesai atau belum terbukti end-to-end

### P0 — Penghalang sebelum Production

1. **HTTP E2E transaksi penuh belum PASS.**
   - Jalankan skenario login → pilih meja → buka sesi → tambah pesanan → update KDS/served → pembayaran → receipt.
   - Siapkan PIN staf khusus E2E pada environment/fixture development yang terisolasi.
   - Jangan menggunakan PIN atau data staf Production sebagai fixture.
   - Simpan bukti request/response, hasil assertion, dan commit SHA yang diuji.

2. **Konfigurasi secret HMAC belum boleh diasumsikan selesai.**
   - `RLS_CONTEXT_HMAC_SECRET` di hosting API harus identik dengan `NEON_RLS_CONTEXT_HMAC_SECRET` di GitHub Actions Environment.
   - Nilai harus berupa secret acak minimal 32 byte dan tidak boleh ditulis ke repo, log, komentar PR, atau file dokumentasi.
   - Verifikasi keberadaan dan kecocokannya melalui mekanisme aman; jangan menampilkan nilainya.
   - PR #10 menambahkan signed RLS context dan tes negatif/positif pada PostgreSQL sementara, tetapi konfigurasi hosting dan Neon tetap pekerjaan operasional terpisah.

3. **Migrasi dan role runtime pada Neon/Production belum dinyatakan telah diterapkan.**
   - PR #7 menyatakan migrasi existing database belum dijalankan.
   - Lakukan backup terverifikasi terlebih dahulu, lalu ikuti urutan cutover pada panduan deployment dan approval gate.
   - Provision role runtime dengan hak minimum; jangan menjalankan API dengan owner/admin database.
   - Jangan dispatch workflow migrasi atau melakukan cutover sebelum secret, backup, approval, dan maintenance window tervalidasi.

### P1 — Fungsi bisnis yang belum lengkap

- **Inventory:** alur stok, mutasi masuk/keluar, penyesuaian, dan audit stok belum selesai.
- **Refund/void:** alur pengembalian dana dan pembatalan transaksi belum lengkap; wajib ada otorisasi, alasan, audit trail, dan aturan status pembayaran.
- **Petty cash:** pencatatan kas kecil dan rekonsiliasinya belum lengkap.
- **Finance/reporting:** laporan keuangan dan rekonsiliasi belum lengkap; angka harus bersumber dari transaksi tersimpan, bukan state UI.
- **Multi-outlet selection:** pemilihan outlet dan validasi perpindahan konteks belum lengkap.
- **Admin staff management:** tambah staf, ubah role/PIN, nonaktifkan staf, dan revoke sesi belum tersedia untuk penggunaan normal karena emergency lock. Pertahankan lock sampai endpoint, RLS, otorisasi Owner, audit log, dan tes lintas tenant/outlet selesai.
- **Migrasi state frontend:** audit sisa penggunaan `localStorage` masih diperlukan. Jalur inti POS sudah API-backed menurut PR #16, tetapi jangan menganggap seluruh layar/fitur React sudah bebas dari localStorage.
- **Token browser:** bearer token masih tercatat disimpan di `localStorage`. Sebelum public deployment, evaluasi migrasi ke cookie `Secure`, `HttpOnly`, dan `SameSite`, termasuk proteksi CSRF dan strategi rotasi sesi.

## 4. Keamanan dan database — hal yang wajib dipertahankan

- Pertahankan forced RLS pada tabel aplikasi dan `security_invoker` pada view yang relevan.
- Pertahankan signed capability context yang diverifikasi di sisi database; jangan mengembalikan otorisasi berbasis custom GUC yang dapat diatur caller.
- Kunci HMAC harus tetap berada di sisi server/secret manager. Runtime role tidak boleh dapat membaca signing key.
- Runtime role harus non-owner, `NOSUPERUSER`, `NOBYPASSRLS`, dan memiliki grant minimum.
- Jangan memberikan grant luas pada `staff_accounts`, `staff_sessions`, schema, sequence, atau function hanya agar fitur terlihat berjalan.
- Pertahankan idempotency, transaction locking, tenant/outlet scoping, dan negative test lintas tenant/outlet.
- Jangan menonaktifkan emergency lock staff mutation sebelum jalur backend dan database lulus pengujian.

## 5. Urutan kerja yang disarankan untuk tim

1. Verifikasi commit SHA dan branch yang sedang diuji; jangan menguji branch yang berbeda dari target review.
2. Jalankan lint/typecheck, build, backend integration checks, PostgreSQL 15 schema smoke test, dan database safety tests.
3. Siapkan fixture development terisolasi (tenant, outlet, staf E2E, meja, kategori, menu) dengan UUID yang konsisten.
4. Selesaikan HTTP E2E transaksi penuh dan lampirkan bukti hasilnya.
5. Selesaikan konfigurasi secret, backup/restore drill, runtime role, dan preflight migrasi pada environment non-production.
6. Implementasikan inventory, refund/void, petty cash, finance, multi-outlet, lalu staff admin management dengan tes otorisasi.
7. Audit dan kurangi ketergantungan localStorage; tangani token browser sebelum deployment publik.
8. Minta review keamanan dan operasional. Status GO hanya setelah semua gate yang relevan PASS dan disetujui.

## 6. Bukti dan referensi GitHub

- PR #7 — konsolidasi backend PostgreSQL/Neon dan batasan yang masih terbuka: https://github.com/beitro/Gastro-Cashier/pull/7
- PR #9 — dokumentasi audit trust boundary RLS: https://github.com/beitro/Gastro-Cashier/pull/9
- PR #10 — signed RLS context, migration 004, serta tes database sementara: https://github.com/beitro/Gastro-Cashier/pull/10
- PR #16 — integrasi alur POS, KDS/served, Admin read-only, dan keterbatasan HTTP E2E: https://github.com/beitro/Gastro-Cashier/pull/16

## 7. Checklist reviewer

- [ ] Commit SHA yang diuji sama dengan commit yang akan direview.
- [ ] Tidak ada secret, PIN, token, atau kredensial dalam source/log/fixture yang ter-commit.
- [ ] HTTP E2E login sampai receipt lulus.
- [ ] RLS menolak akses tanpa konteks dan akses lintas tenant/outlet.
- [ ] Signed context menolak token palsu, replay lintas transaksi, dan perubahan payload.
- [ ] Runtime role tidak memiliki privilege owner/BYPASSRLS atau grant berlebih.
- [ ] Backup dapat dipulihkan dan diverifikasi sebelum migrasi.
- [ ] Fitur bisnis yang belum selesai diberi status eksplisit dan tidak dipresentasikan sebagai siap.
- [ ] Emergency staff mutation lock tetap aktif sampai penggantinya terbukti aman.

---
**Catatan pemeliharaan:** perbarui dokumen ini setiap kali status fitur berubah. Cantumkan tanggal, branch, commit SHA, test yang dijalankan, hasil, dan bukti CI. Jangan mengubah status menjadi “selesai” hanya karena UI tersedia atau build berhasil.
