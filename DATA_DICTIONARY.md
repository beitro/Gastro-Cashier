# Kamus Data Gastro-Cashier

> Dibuat otomatis oleh `db/tools/generate-erd.ts` dari skema PostgreSQL dan COMMENT di `db/schema.sql`. Jangan diubah manual.

Tag `[src: Antarmuka.field]` pada keterangan kolom menunjuk field TypeScript di `src/types/pos.ts` yang menjadi sumbernya. `db/tests/check-coverage.ts` memastikan setiap field di `pos.ts` punya kolom atau tercatat sebagai turunan di `db/field-map.json`.

## Temuan perilaku kode yang mempengaruhi desain

Hal-hal yang ditemukan saat membaca kode (commit d091435) dan menentukan bentuk skema. Setiap temuan sudah dicocokkan dengan baris kodenya.

| # | Temuan | Bukti | Dampak pada skema |
| --- | --- | --- | --- |
| 1 | Semua data hanya di localStorage | src/App.tsx:41-48 (delapan kunci resto_pos_*_v1), pembacaan di baris 422-481, penulisan di 532-575. | Tidak ada backend; skema ini adalah bentuk server dari data tersebut. Tanpa server, dua kasir di dua perangkat tidak berbagi data. |
| 2 | PIN staf tersimpan polos | src/utils/authRoles.ts:8, 17, 26 (pin: '9999', '1234', ...), diteruskan ke localStorage kunci resto_pos_staff_v1. | staff_accounts.pin_hash menyimpan HMAC-SHA256. Login memakai PIN saja tanpa id staf (authenticateByPin), maka pin_hash dibuat UNIQUE secara global. |
| 3 | Nomor transaksi memakai angka acak 4 digit | src/App.tsx:654 (TRX-<tanggal>-<1000..9999>) dan 763 (TRX-PF-...). | Dapat bentrok pada hari ramai. transactions.number dibuat UNIQUE; backend perlu urutan harian, bukan angka acak. |
| 4 | Payment First menulis dua record, kadang dengan id sama | src/App.tsx:763 membuat id lunas, dan App.tsx:833 (activeTxId = existingTx ? existingTx.id : settledTxId) memakainya lagi bila meja belum punya transaksi aktif. | Dimodelkan sebagai satu transactions dan banyak payments; payments.payment_number dipisah dari id transaksi. |
| 5 | Nama kasir selalu "Budi Prasetyo" | src/App.tsx:795, 875, 1107 dan src/services/googleSheets.ts:54. | payments.cashier_id mengacu ke akun yang sedang login; kode asli tidak mencatat kasir sebenarnya. |
| 6 | Stok bahan dijepit ke nol dan dibulatkan 2 desimal | src/utils/posCalculations.ts:262 (Math.max(0, Math.round(x * 100) / 100)). | Penjualan tidak pernah ditolak karena stok kurang, dan kekurangannya tidak tercatat. deduct_batch_stock mempertahankan perilaku ini tetapi mengembalikan kolom shortage; kolom disimpan 4 desimal. |
| 7 | 5 dari 18 menu tidak punya resep | src/data/initialData.ts: bev-4, bev-5, bev-6, snack-3, dessert-1 tanpa recipe. | Penjualannya tidak memotong stok. recipe_ingredients tidak memaksa setiap menu punya resep. |
| 8 | Stok porsi menu hanya tampilan | src/components/OrderModal.tsx:810 menampilkan item.stock; tidak ada pengurangan di kode. | menu_items.portion_stock disimpan apa adanya; stok nyata ada di raw_materials. |
| 9 | Status dan metode yang ada di tipe tetapi tidak pernah dihasilkan | Table.status 'reserved' dan 'billing', Transaction.status 'cancelled', paymentMethod 'split': tidak ada pengisi di src selain src/types/pos.ts. | Tetap dimasukkan ke CHECK agar sama dengan tipe, kecuali "split" yang diganti banyak baris payments. |
| 10 | Harga satuan dikirim dari klien | src/components/OrderModal.tsx:142 dan 188 menyalin menuItem.price ke OrderItem.unitPrice di klien. | transaction_items.unit_price harus diisi server dari menu_items.price; view v_integrity_item_subtotal mendeteksi selisih. |
| 11 | Data contoh memakai modifier yang tidak ada di menu | src/App.tsx:88 dan 135 (grup 'Es Batu'). | transaction_item_modifiers menyimpan nama grup dan opsi sebagai teks (bukan id) agar riwayat tetap utuh. |

## Tabel

### dining_tables

Denah meja (36 meja di initialData.ts). Field runtime Table.currentTransactionId, guestCount, openedAt, waiterName tidak disimpan di sini; lihat view v_table_board.

Kunci utama: `id`

| Kolom | Tipe | Null | Default | Relasi | Keterangan |
| --- | --- | --- | --- | --- | --- |
| id | VARCHAR(10) | tidak |  |  | Contoh: T01. [src: Table.id] |
| table_number | VARCHAR(20) | tidak |  |  | Contoh: 01 atau VIP-1. [src: Table.tableNumber] |
| area | VARCHAR(10) | tidak |  |  | [src: Table.area] |
| capacity | SMALLINT | tidak |  |  | [src: Table.capacity] |
| status | VARCHAR(10) | tidak | 'available'::character varying |  | available dan occupied dijaga trigger dari transaksi aktif. reserved dan billing ada di tipe TableStatus tetapi tidak pernah diisi oleh kode (belum ada fitur reservasi). [src: Table.status] |

Aturan dan indeks:

- `dining_tables_area_check`: `CHECK (((area)::text = ANY ((ARRAY['indoor'::character varying, 'outdoor'::character varying, 'vip'::character varying])::text[])))`
- `dining_tables_capacity_check`: `CHECK ((capacity > 0))`
- `dining_tables_status_check`: `CHECK (((status)::text = ANY ((ARRAY['available'::character varying, 'occupied'::character varying, 'reserved'::character varying, 'billing'::character varying])::text[])))`
- `dining_tables_table_number_key`: `UNIQUE (table_number)`

### discount_rules

Aturan diskon dari computeDiscountAmount(): member10 = 10% dari subtotal; promo20k = Rp20.000 dibatasi subtotal. DiscountType "none" berarti tanpa aturan (NULL di payments). [src: DiscountType]

Kunci utama: `code`

| Kolom | Tipe | Null | Default | Relasi | Keterangan |
| --- | --- | --- | --- | --- | --- |
| code | VARCHAR(20) | tidak |  |  |  |
| name | VARCHAR(80) | tidak |  |  |  |
| kind | VARCHAR(10) | tidak |  |  |  |
| value | NUMERIC(14,2) | tidak |  |  |  |

Aturan dan indeks:

- `chk_discount_percent`: `CHECK ((((kind)::text = 'FIXED'::text) OR (value <= (100)::numeric)))`
- `discount_rules_kind_check`: `CHECK (((kind)::text = ANY ((ARRAY['PERCENT'::character varying, 'FIXED'::character varying])::text[])))`
- `discount_rules_value_check`: `CHECK ((value > (0)::numeric))`

### menu_items

Katalog menu (18 baris di initialData.ts). [src: MenuItem.modifierGroups, MenuItem.recipe] disimpan di modifier_groups dan recipe_ingredients.

Kunci utama: `id`

| Kolom | Tipe | Null | Default | Relasi | Keterangan |
| --- | --- | --- | --- | --- | --- |
| id | VARCHAR(40) | tidak |  |  | Contoh: food-1, bev-1. [src: MenuItem.id] |
| name | VARCHAR(150) | tidak |  |  | [src: MenuItem.name] |
| category | VARCHAR(10) | tidak |  |  | [src: MenuItem.category] |
| destination | VARCHAR(10) | tidak |  |  | Rute cetak otomatis: kitchen atau bar (routeOrderItems). [src: MenuItem.destination] |
| price | NUMERIC(14,2) | tidak |  |  | [src: MenuItem.price] |
| cost | NUMERIC(14,2) | tidak |  |  | HPP per porsi, dipakai calculateOrderHPP. [src: MenuItem.cost] |
| portion_stock | INTEGER | tidak | 0 |  | Hanya ditampilkan ("Stok 50") di OrderModal; tidak pernah dikurangi oleh kode. [src: MenuItem.stock] |
| image_url | TEXT | ya |  |  | [src: MenuItem.image] |
| description | TEXT | ya |  |  | [src: MenuItem.description] |

Aturan dan indeks:

- `menu_items_category_check`: `CHECK (((category)::text = ANY ((ARRAY['makanan'::character varying, 'minuman'::character varying, 'snack'::character varying, 'dessert'::character varying])::text[])))`
- `menu_items_cost_check`: `CHECK ((cost >= (0)::numeric))`
- `menu_items_destination_check`: `CHECK (((destination)::text = ANY ((ARRAY['kitchen'::character varying, 'bar'::character varying])::text[])))`
- `menu_items_portion_stock_check`: `CHECK ((portion_stock >= 0))`
- `menu_items_price_check`: `CHECK ((price >= (0)::numeric))`
- `idx_menu_items_category`: `menu_items USING btree (category)`

### modifier_groups

Grup pilihan per menu (level pedas, pilihan telur). [src: MenuItem.modifierGroups]

Kunci utama: `id`

| Kolom | Tipe | Null | Default | Relasi | Keterangan |
| --- | --- | --- | --- | --- | --- |
| id | BIGINT | tidak | identity |  |  |
| menu_item_id | VARCHAR(40) | tidak |  | menu_items(id) |  |
| code | VARCHAR(40) | tidak |  |  | Contoh: pedas-1. [src: ModifierGroup.id] |
| name | VARCHAR(100) | tidak |  |  | [src: ModifierGroup.name] |
| is_required | BOOLEAN | tidak | false |  | [src: ModifierGroup.required] |
| sort_order | SMALLINT | tidak | 0 |  |  |

Aturan dan indeks:

- `uq_modifier_group_code`: `UNIQUE (menu_item_id, code)`

### modifier_options

Opsi dalam grup. [src: ModifierGroup.options]

Kunci utama: `id`

| Kolom | Tipe | Null | Default | Relasi | Keterangan |
| --- | --- | --- | --- | --- | --- |
| id | BIGINT | tidak | identity |  |  |
| group_id | BIGINT | tidak |  | modifier_groups(id) |  |
| name | VARCHAR(100) | tidak |  |  | Nama dapat memuat harga ("Sangat Pedas (+Rp 2.000)"); harga sebenarnya di price_delta. [src: ModifierOption.name] |
| price_delta | NUMERIC(14,2) | tidak | 0 |  | [src: ModifierOption.priceDelta] |
| sort_order | SMALLINT | tidak | 0 |  |  |

Aturan dan indeks:

- `uq_modifier_option_name`: `UNIQUE (group_id, name)`

### payments

Satu baris per pelunasan (setiap record "settled" di kode). Satu transaksi bisa punya banyak pembayaran: Payment First melunasi batch tertentu di depan, sisanya dilunasi saat pelanggan selesai. Pendapatan = SUM(total_amount).

Kunci utama: `id`

| Kolom | Tipe | Null | Default | Relasi | Keterangan |
| --- | --- | --- | --- | --- | --- |
| id | UUID | tidak | gen_random_uuid() |  |  |
| payment_number | VARCHAR(50) | tidak |  |  | Nomor bukti bayar. Kode memakai ulang id transaksi; pada Payment First di meja yang belum punya transaksi aktif, record aktif dan record lunas bahkan memakai id yang sama (App.tsx: activeTxId = settledTxId). Backend harus menerbitkan nomor unik. |
| transaction_id | UUID | tidak |  | transactions(id) |  |
| flow | VARCHAR(15) | tidak |  |  | payment_first = dibayar saat memesan; payment_last = dibayar saat selesai. |
| method | VARCHAR(10) | tidak |  |  | Nilai split pada tipe Transaction.paymentMethod tidak pernah dihasilkan UI; pembayaran terbagi dimodelkan sebagai beberapa baris. [src: Transaction.paymentMethod] |
| card_bank | VARCHAR(40) | ya |  |  | Pilihan bank EDC di layar bayar (default BCA EDC); di kode hanya state UI dan hilang setelah bayar. |
| discount_rule_code | VARCHAR(20) | ya |  | discount_rules(code) | Jenis diskon yang dipilih; kode hanya menyimpan nominalnya. |
| subtotal_amount | NUMERIC(14,2) | tidak |  |  | Jumlah subtotal item yang dilunasi pada pembayaran ini. [src: Transaction.subtotal] |
| discount_amount | NUMERIC(14,2) | tidak | 0 |  | [src: Transaction.discountAmount] |
| service_charge_amount | NUMERIC(14,2) | tidak | 0 |  | [src: Transaction.serviceChargeAmount] |
| tax_amount | NUMERIC(14,2) | tidak | 0 |  | PB1. [src: Transaction.taxAmount] |
| total_amount | NUMERIC(14,2) | tidak |  |  | [src: Transaction.totalAmount] |
| cash_given | NUMERIC(14,2) | tidak |  |  | Untuk non-tunai kode mengisi sama dengan total. [src: Transaction.cashGiven] |
| change_amount | NUMERIC(14,2) | tidak | 0 |  | [src: Transaction.changeAmount] |
| cashier_id | VARCHAR(40) | tidak |  | staff_accounts(id) | Kode menulis cashierName tetap "Budi Prasetyo" untuk semua pembayaran, bukan staf yang sedang login. [src: Transaction.cashierName] |
| paid_at | TIMESTAMPTZ | tidak | now() |  | [src: Transaction.paidAt] |

Aturan dan indeks:

- `chk_payment_card_bank`: `CHECK ((((method)::text = 'card'::text) OR (card_bank IS NULL)))`
- `chk_payment_cash`: `CHECK (((((method)::text = 'cash'::text) AND (cash_given >= total_amount) AND (change_amount = (cash_given - total_amount))) OR (((method)::text <> 'cash'::text) AND (cash_given = total_amount) AND (change_amount = (0)::numeric))))`
- `chk_payment_discount_le_subtotal`: `CHECK ((discount_amount <= subtotal_amount))`
- `chk_payment_total`: `CHECK ((total_amount = (((subtotal_amount - discount_amount) + service_charge_amount) + tax_amount)))`
- `payments_cash_given_check`: `CHECK ((cash_given >= (0)::numeric))`
- `payments_change_amount_check`: `CHECK ((change_amount >= (0)::numeric))`
- `payments_discount_amount_check`: `CHECK ((discount_amount >= (0)::numeric))`
- `payments_flow_check`: `CHECK (((flow)::text = ANY ((ARRAY['payment_last'::character varying, 'payment_first'::character varying])::text[])))`
- `payments_method_check`: `CHECK (((method)::text = ANY ((ARRAY['cash'::character varying, 'qris'::character varying, 'card'::character varying])::text[])))`
- `payments_service_charge_amount_check`: `CHECK ((service_charge_amount >= (0)::numeric))`
- `payments_subtotal_amount_check`: `CHECK ((subtotal_amount >= (0)::numeric))`
- `payments_tax_amount_check`: `CHECK ((tax_amount >= (0)::numeric))`
- `payments_total_amount_check`: `CHECK ((total_amount >= (0)::numeric))`
- `payments_payment_number_key`: `UNIQUE (payment_number)`
- `idx_payments_paid_at`: `payments USING btree (paid_at DESC)`
- `idx_payments_transaction`: `payments USING btree (transaction_id)`

### petty_cash_entries

Pengeluaran kas kecil (FinanceView). Kode boleh menghapus entri; di backend sebaiknya dibatalkan, bukan dihapus.

Kunci utama: `id`

| Kolom | Tipe | Null | Default | Relasi | Keterangan |
| --- | --- | --- | --- | --- | --- |
| id | UUID | tidak | gen_random_uuid() |  | [src: PettyCashEntry.id] |
| occurred_at | TIMESTAMPTZ | tidak | now() |  | [src: PettyCashEntry.timestamp] |
| description | VARCHAR(200) | tidak |  |  | [src: PettyCashEntry.description] |
| category | VARCHAR(20) | tidak |  |  | [src: PettyCashEntry.category] |
| amount | NUMERIC(14,2) | tidak |  |  | [src: PettyCashEntry.amount] |
| receipt_number | VARCHAR(40) | ya |  |  | [src: PettyCashEntry.receiptNumber] |
| recorded_by | VARCHAR(40) | tidak |  | staff_accounts(id) | Kode menyimpan nama staf sebagai teks. [src: PettyCashEntry.recordedBy] |

Aturan dan indeks:

- `petty_cash_entries_amount_check`: `CHECK ((amount > (0)::numeric))`
- `petty_cash_entries_category_check`: `CHECK (((category)::text = ANY ((ARRAY['operasional'::character varying, 'bahan_darurat'::character varying, 'utilitas'::character varying, 'lainnya'::character varying])::text[])))`
- `idx_petty_cash_occurred_at`: `petty_cash_entries USING btree (occurred_at DESC)`

### print_tickets

Riwayat cetak: struk dapur, bar, checker per batch, dan struk pembayaran. Isi tiket diturunkan, bukan disalin: dapur/bar = item batch dengan destination yang sama, checker = semua item batch, receipt = item yang dilunasi payment_id. Kode menyimpan salinan item di tiket sehingga status dilayani harus diperbarui di dua tempat. [src: PrintTicket.items, PrintTicket.financials]

Kunci utama: `id`

| Kolom | Tipe | Null | Default | Relasi | Keterangan |
| --- | --- | --- | --- | --- | --- |
| id | UUID | tidak | gen_random_uuid() |  |  |
| ticket_number | VARCHAR(60) | tidak |  |  | Contoh: TKT-DAPUR-<ms>-<batch>, RCP-<ms>. [src: PrintTicket.id] |
| transaction_id | UUID | tidak |  | transaction_batches(transaction_id, batch_number); transactions(id) | [src: PrintTicket.transactionId] |
| batch_number | SMALLINT | ya |  | transaction_batches(transaction_id, batch_number) | [src: PrintTicket.batchNumber] |
| type | VARCHAR(10) | tidak |  |  | [src: PrintTicket.type] |
| payment_flow | VARCHAR(15) | ya |  |  | [src: PrintTicket.paymentFlow] |
| payment_id | UUID | ya |  | payments(id) |  |
| notes | TEXT | ya |  |  | [src: PrintTicket.notes] |
| printed_at | TIMESTAMPTZ | tidak | now() |  | [src: PrintTicket.timestamp] |

Aturan dan indeks:

- `chk_ticket_receipt_has_payment`: `CHECK ((((type)::text = 'receipt'::text) = (payment_id IS NOT NULL)))`
- `print_tickets_payment_flow_check`: `CHECK (((payment_flow)::text = ANY ((ARRAY['payment_last'::character varying, 'payment_first'::character varying])::text[])))`
- `print_tickets_type_check`: `CHECK (((type)::text = ANY ((ARRAY['kitchen'::character varying, 'bar'::character varying, 'checker'::character varying, 'receipt'::character varying])::text[])))`
- `print_tickets_ticket_number_key`: `UNIQUE (ticket_number)`
- `idx_print_tickets_transaction`: `print_tickets USING btree (transaction_id, printed_at DESC)`

### raw_materials

Bahan baku (14 baris di initialData.ts). Tanpa batch, tanpa buku besar mutasi: kode langsung menimpa currentStock.

Kunci utama: `id`

| Kolom | Tipe | Null | Default | Relasi | Keterangan |
| --- | --- | --- | --- | --- | --- |
| id | VARCHAR(40) | tidak |  |  | Contoh: raw-beras. [src: RawMaterial.id] |
| name | VARCHAR(150) | tidak |  |  | [src: RawMaterial.name] |
| unit | VARCHAR(20) | tidak |  | units(code) | [src: RawMaterial.unit] |
| current_stock | NUMERIC(14,4) | tidak | 0 |  | Kode menjepit ke 0 (Math.max(0, ...)) sehingga penjualan melebihi stok tidak terdeteksi. [src: RawMaterial.currentStock] |
| min_stock | NUMERIC(14,4) | tidak | 0 |  | Batas ROP; stok dianggap rendah bila current_stock <= min_stock. [src: RawMaterial.minStock] |
| cost_per_unit | NUMERIC(14,2) | tidak | 0 |  | [src: RawMaterial.costPerUnit] |
| storage_zone | VARCHAR(20) | tidak |  |  | [src: RawMaterial.storageZone] |

Aturan dan indeks:

- `raw_materials_cost_per_unit_check`: `CHECK ((cost_per_unit >= (0)::numeric))`
- `raw_materials_current_stock_check`: `CHECK ((current_stock >= (0)::numeric))`
- `raw_materials_min_stock_check`: `CHECK ((min_stock >= (0)::numeric))`
- `raw_materials_storage_zone_check`: `CHECK (((storage_zone)::text = ANY ((ARRAY['Dry Storage'::character varying, 'Walk-in Chiller'::character varying, 'Deep Freezer'::character varying, 'Bar Station'::character varying])::text[])))`

### recipe_ingredients

Resep (BOM) per 1 porsi. Jumlah dalam satuan raw_materials.unit (0.015 untuk teh dalam kg = 15 gram); 5 dari 18 menu belum punya resep (bev-4, bev-5, bev-6, snack-3, dessert-1), sehingga penjualannya tidak memotong stok. [src: MenuItem.recipe]

Kunci utama: `menu_item_id`, `raw_material_id`

| Kolom | Tipe | Null | Default | Relasi | Keterangan |
| --- | --- | --- | --- | --- | --- |
| menu_item_id | VARCHAR(40) | tidak |  | menu_items(id) |  |
| raw_material_id | VARCHAR(40) | tidak |  | raw_materials(id) | [src: RecipeIngredient.rawMaterialId] |
| amount | NUMERIC(14,4) | tidak |  |  | [src: RecipeIngredient.amount] |

Aturan dan indeks:

- `recipe_ingredients_amount_check`: `CHECK ((amount > (0)::numeric))`
- `idx_recipe_ingredients_material`: `recipe_ingredients USING btree (raw_material_id)`

### restaurant_settings

Satu baris: identitas di header struk (ThermalReceipt.tsx), tarif PB1 dan service charge (posCalculations.ts), dan mode alur bayar yang dipilih kasir. [src: PaymentFlowMode]

Kunci utama: `singleton`

| Kolom | Tipe | Null | Default | Relasi | Keterangan |
| --- | --- | --- | --- | --- | --- |
| singleton | BOOLEAN | tidak | true |  |  |
| restaurant_name | VARCHAR(120) | tidak |  |  |  |
| address | VARCHAR(200) | tidak |  |  |  |
| npwpd | VARCHAR(40) | tidak |  |  |  |
| service_charge_rate | NUMERIC(5,4) | tidak | 0.0500 |  |  |
| pb1_rate | NUMERIC(5,4) | tidak | 0.1000 |  |  |
| service_in_pb1_base | BOOLEAN | tidak | true |  | TRUE = PB1 dihitung dari (subtotal - diskon + service charge), sesuai calculateOrderTotals. Wajib dicek dengan perda daerah target. |
| payment_flow_mode | VARCHAR(15) | tidak | 'payment_last'::character varying |  | Mode bayar default di layar order; tersimpan di localStorage kunci resto_pos_payment_mode_v1. |
| updated_at | TIMESTAMPTZ | tidak | now() |  |  |

Aturan dan indeks:

- `restaurant_settings_payment_flow_mode_check`: `CHECK (((payment_flow_mode)::text = ANY ((ARRAY['payment_last'::character varying, 'payment_first'::character varying])::text[])))`
- `restaurant_settings_pb1_rate_check`: `CHECK (((pb1_rate >= (0)::numeric) AND (pb1_rate <= 0.1000)))`
- `restaurant_settings_service_charge_rate_check`: `CHECK (((service_charge_rate >= (0)::numeric) AND (service_charge_rate <= (1)::numeric)))`
- `restaurant_settings_singleton_check`: `CHECK (singleton)`

### roles

Matriks izin per peran, dari getRolePermissions() di authRoles.ts. [src: UserRole]

Kunci utama: `code`

| Kolom | Tipe | Null | Default | Relasi | Keterangan |
| --- | --- | --- | --- | --- | --- |
| code | VARCHAR(10) | tidak |  |  |  |
| can_operate_pos | BOOLEAN | tidak |  |  |  |
| can_access_kds | BOOLEAN | tidak |  |  |  |
| can_access_checker | BOOLEAN | tidak |  |  |  |
| can_access_inventory | BOOLEAN | tidak |  |  |  |
| can_access_finance | BOOLEAN | tidak |  |  |  |
| can_access_owner_dashboard | BOOLEAN | tidak |  |  |  |
| can_manage_petty_cash | BOOLEAN | tidak |  |  |  |
| can_reset_demo | BOOLEAN | tidak |  |  |  |

Aturan dan indeks:

- `roles_code_check`: `CHECK (((code)::text = ANY ((ARRAY['owner'::character varying, 'cashier'::character varying, 'finance'::character varying])::text[])))`

### staff_accounts

Akun login kasir/owner/finance. Login memakai PIN saja (authenticateByPin tidak menerima id staf), maka PIN harus unik global.

Kunci utama: `id`

| Kolom | Tipe | Null | Default | Relasi | Keterangan |
| --- | --- | --- | --- | --- | --- |
| id | VARCHAR(40) | tidak |  |  | Contoh: staff-owner-01. [src: StaffAccount.id] |
| name | VARCHAR(100) | tidak |  |  | [src: StaffAccount.name] |
| role | VARCHAR(10) | tidak |  | roles(code) | [src: StaffAccount.role] |
| pin_hash | CHAR(64) | tidak |  |  | HMAC-SHA256 heksadesimal dari PIN dengan pepper sisi server. Kode saat ini menyimpan PIN polos di localStorage dan di bundel JS. [src: StaffAccount.pin] |
| nfc_tag_uid | VARCHAR(40) | tidak |  |  | Huruf besar; authenticateByNfc membandingkan setelah toUpperCase. [src: StaffAccount.nfcTagUid] |
| avatar_color | VARCHAR(40) | tidak |  |  | Kelas Tailwind (bg-amber-500); detail tampilan yang ikut tersimpan di kode. [src: StaffAccount.avatarColor] |
| role_label | VARCHAR(60) | tidak |  |  | Label per akun, bukan per peran. [src: StaffAccount.roleLabel] |

Aturan dan indeks:

- `staff_accounts_nfc_tag_uid_check`: `CHECK (((nfc_tag_uid)::text = upper((nfc_tag_uid)::text)))`
- `staff_accounts_nfc_tag_uid_key`: `UNIQUE (nfc_tag_uid)`
- `staff_accounts_pin_hash_key`: `UNIQUE (pin_hash)`

### transaction_batches

Gelombang pesanan "Pesanan ke-N" pada satu meja; tiap batch dicetak ke dapur/bar/checker. [src: Transaction.batches]

Kunci utama: `transaction_id`, `batch_number`

| Kolom | Tipe | Null | Default | Relasi | Keterangan |
| --- | --- | --- | --- | --- | --- |
| transaction_id | UUID | tidak |  | transactions(id) |  |
| batch_number | SMALLINT | tidak |  |  | [src: OrderBatch.batchNumber] |
| sent_at | TIMESTAMPTZ | tidak | now() |  | [src: OrderBatch.timestamp] |

Aturan dan indeks:

- `transaction_batches_batch_number_check`: `CHECK ((batch_number >= 1))`

### transaction_item_modifiers

Pilihan modifier pada item, disalin berdasarkan nama (bukan id) sehingga tetap utuh bila menu diubah. Data contoh di App.tsx memakai grup "Es Batu" yang tidak ada di menu. [src: OrderItem.selectedModifiers]

Kunci utama: `id`

| Kolom | Tipe | Null | Default | Relasi | Keterangan |
| --- | --- | --- | --- | --- | --- |
| id | BIGINT | tidak | identity |  |  |
| transaction_item_id | UUID | tidak |  | transaction_items(id) |  |
| group_name | VARCHAR(100) | tidak |  |  | [src: SelectedModifier.groupName] |
| option_name | VARCHAR(100) | tidak |  |  | [src: SelectedModifier.optionName] |
| price_delta | NUMERIC(14,2) | tidak | 0 |  | [src: SelectedModifier.priceDelta] |

Aturan dan indeks:

- `idx_item_modifiers_item`: `transaction_item_modifiers USING btree (transaction_item_id)`

### transaction_items

Baris pesanan. Nama, kategori, tujuan, dan harga disalin dari menu saat dipesan. [src: Transaction.allCurrentItems, OrderBatch.items]

Kunci utama: `id`

| Kolom | Tipe | Null | Default | Relasi | Keterangan |
| --- | --- | --- | --- | --- | --- |
| id | UUID | tidak | gen_random_uuid() |  | [src: OrderItem.id] |
| transaction_id | UUID | tidak |  | transaction_batches(transaction_id, batch_number) |  |
| batch_number | SMALLINT | tidak |  | transaction_batches(transaction_id, batch_number) | [src: OrderItem.batchNumber] |
| menu_item_id | VARCHAR(40) | tidak |  | menu_items(id) | [src: OrderItem.menuItemId] |
| name | VARCHAR(150) | tidak |  |  | Salinan. [src: OrderItem.name] |
| category | VARCHAR(10) | tidak |  |  | Salinan. [src: OrderItem.category] |
| destination | VARCHAR(10) | tidak |  |  | Salinan. [src: OrderItem.destination] |
| unit_price | NUMERIC(14,2) | tidak |  |  | Harga satuan di klien lalu disalin ke transaksi (celah yang sama dengan blueprint Gastro-Knowledge): backend harus mengambil dari menu_items. [src: OrderItem.unitPrice] |
| quantity | INTEGER | tidak |  |  | [src: OrderItem.quantity] |
| notes | TEXT | tidak | ''::text |  | [src: OrderItem.notes] |
| subtotal | NUMERIC(14,2) | tidak |  |  | (unit_price + jumlah price_delta modifier) x quantity. [src: OrderItem.subtotal] |
| is_served | BOOLEAN | tidak | false |  | Centang pramusaji saat makanan sampai di meja. [src: OrderItem.isServed] |
| served_at | TIMESTAMPTZ | ya |  |  | [src: OrderItem.servedAt] |
| cooking_status | VARCHAR(10) | tidak | 'queue'::character varying |  | Status KDS: queue, cooking, ready, handed_off. Kode menganggap undefined sebagai queue. [src: OrderItem.cookingStatus] |
| handed_off_at | TIMESTAMPTZ | ya |  |  | [src: OrderItem.handedOffAt] |
| payment_id | UUID | ya |  | payments(id) | NULL = belum dibayar. Menggantikan flag OrderItem.isPaid dan menunjuk pembayaran yang melunasi item ini. [src: OrderItem.isPaid] |

Aturan dan indeks:

- `transaction_items_category_check`: `CHECK (((category)::text = ANY ((ARRAY['makanan'::character varying, 'minuman'::character varying, 'snack'::character varying, 'dessert'::character varying])::text[])))`
- `transaction_items_cooking_status_check`: `CHECK (((cooking_status)::text = ANY ((ARRAY['queue'::character varying, 'cooking'::character varying, 'ready'::character varying, 'handed_off'::character varying])::text[])))`
- `transaction_items_destination_check`: `CHECK (((destination)::text = ANY ((ARRAY['kitchen'::character varying, 'bar'::character varying])::text[])))`
- `transaction_items_quantity_check`: `CHECK ((quantity >= 1))`
- `transaction_items_subtotal_check`: `CHECK ((subtotal >= (0)::numeric))`
- `transaction_items_unit_price_check`: `CHECK ((unit_price >= (0)::numeric))`
- `idx_transaction_items_kds`: `transaction_items USING btree (destination, cooking_status) WHERE (is_served = false)`
- `idx_transaction_items_payment`: `transaction_items USING btree (payment_id) WHERE (payment_id IS NOT NULL)`
- `idx_transaction_items_transaction`: `transaction_items USING btree (transaction_id, batch_number)`

### transactions

Satu kunjungan/bill per meja. Total uang tidak disimpan di sini: kode menimpa total transaksi setiap ada batch atau pelunasan, sehingga totalnya diturunkan dari item dan payments (view v_transaction_summary).

Kunci utama: `id`

| Kolom | Tipe | Null | Default | Relasi | Keterangan |
| --- | --- | --- | --- | --- | --- |
| id | UUID | tidak | gen_random_uuid() |  |  |
| number | VARCHAR(40) | tidak |  |  | Contoh: TRX-20261023-4821, TRX-PF-... Kode membuatnya dengan angka acak 4 digit sehingga bisa bentrok; backend wajib memakai urutan. [src: Transaction.id] |
| table_id | VARCHAR(10) | tidak |  | dining_tables(id) | [src: Transaction.tableId] |
| table_number | VARCHAR(20) | tidak |  |  | Salinan nomor meja saat transaksi dibuat (dicetak di struk). [src: Transaction.tableNumber] |
| area | VARCHAR(10) | tidak |  |  | Salinan area meja saat transaksi dibuat. [src: Transaction.area] |
| guest_count | SMALLINT | tidak |  |  | [src: Transaction.guestCount] |
| waiter_id | SMALLINT | tidak |  | waiters(id) | Kode menyimpan nama pramusaji sebagai teks. [src: Transaction.waiterName] |
| opened_at | TIMESTAMPTZ | tidak | now() |  | Waktu meja dibuka. KDS menghitung lama masak dari kolom ini, bukan dari waktu batch dikirim. [src: Transaction.openedAt] |
| status | VARCHAR(10) | tidak | 'active'::character varying |  | cancelled ada di tipe tetapi tidak pernah diisi oleh kode (belum ada fitur batal/void). [src: Transaction.status] |
| payment_flow | VARCHAR(15) | ya |  |  | Alur bayar terakhir pada transaksi ini. [src: Transaction.paymentFlow] |
| service_charge_rate | NUMERIC(5,4) | tidak | 0.0500 |  | Salinan tarif saat transaksi dibuat. [src: Transaction.serviceChargeRate] |
| tax_rate | NUMERIC(5,4) | tidak | 0.1000 |  | Salinan tarif PB1 saat transaksi dibuat. [src: Transaction.taxRate] |

Aturan dan indeks:

- `transactions_area_check`: `CHECK (((area)::text = ANY ((ARRAY['indoor'::character varying, 'outdoor'::character varying, 'vip'::character varying])::text[])))`
- `transactions_guest_count_check`: `CHECK ((guest_count > 0))`
- `transactions_payment_flow_check`: `CHECK (((payment_flow)::text = ANY ((ARRAY['payment_last'::character varying, 'payment_first'::character varying])::text[])))`
- `transactions_status_check`: `CHECK (((status)::text = ANY ((ARRAY['active'::character varying, 'settled'::character varying, 'cancelled'::character varying])::text[])))`
- `transactions_number_key`: `UNIQUE (number)`
- `idx_transactions_opened_at`: `transactions USING btree (opened_at DESC)`
- `uq_transactions_one_active_per_table`: `UNIQUE transactions USING btree (table_id) WHERE ((status)::text = 'active'::text)`

### units

Satuan bahan baku. Komentar RawMaterial.unit hanya menyebut kg, gram, liter, ml, butir, ekor, ikat; data awal juga memakai porsi, sisir, blok. Konversi antar satuan tidak ada di kode.

Kunci utama: `code`

| Kolom | Tipe | Null | Default | Relasi | Keterangan |
| --- | --- | --- | --- | --- | --- |
| code | VARCHAR(20) | tidak |  |  |  |
| label | VARCHAR(40) | ya |  |  |  |

### waiters

Pramusaji. Daftar pilihan di OrderModal.tsx (4 nama) terpisah dari akun login; satu orang (Budi Prasetyo) ada di keduanya, maka staff_id opsional.

Kunci utama: `id`

| Kolom | Tipe | Null | Default | Relasi | Keterangan |
| --- | --- | --- | --- | --- | --- |
| id | SMALLINT | tidak | identity |  |  |
| name | VARCHAR(100) | tidak |  |  |  |
| staff_id | VARCHAR(40) | ya |  | staff_accounts(id) |  |

Aturan dan indeks:

- `waiters_name_key`: `UNIQUE (name)`
