-- ============================================================================
-- RESTOPOS TOUCH (GASTRO-CASHIER) - SKEMA POSTGRESQL HASIL REVERSE ENGINEERING
-- Sumber: src/types/pos.ts, src/data/initialData.ts, src/utils/posCalculations.ts,
--         src/utils/authRoles.ts, src/App.tsx, src/components/*.tsx (commit d091435)
--
-- Aplikasi saat ini hanya front-end: seluruh data disimpan di localStorage
-- (delapan kunci resto_pos_*_v1). Skema ini adalah bentuk relasional dari data itu.
--
-- Konvensi:
--   * Uang dalam Rupiah: NUMERIC(14,2). Kode membulatkan dengan Math.round ke Rupiah penuh.
--   * Data master memakai id teks dari kode ('T01', 'raw-beras', 'food-1') agar seed
--     dari initialData.ts dapat dimuat apa adanya. Entitas runtime memakai UUID,
--     nomor yang tercetak (TRX-..., TKT-...) disimpan di kolom number terpisah.
--   * Setiap kolom yang berasal dari field TypeScript diberi tag [src: Antarmuka.field]
--     pada COMMENT-nya; db/tests memeriksa bahwa seluruh field di pos.ts terpetakan.
--   * Temuan perilaku kode yang mempengaruhi desain: lihat db/DATA_DICTIONARY.md.
-- ============================================================================

-- ============================================================================
-- 1. KONFIGURASI DAN DATA ACUAN
-- ============================================================================

CREATE TABLE restaurant_settings (
    singleton BOOLEAN PRIMARY KEY DEFAULT TRUE CHECK (singleton),
    restaurant_name VARCHAR(120) NOT NULL,
    address VARCHAR(200) NOT NULL,
    npwpd VARCHAR(40) NOT NULL,
    service_charge_rate NUMERIC(5, 4) NOT NULL DEFAULT 0.0500 CHECK (service_charge_rate >= 0 AND service_charge_rate <= 1),
    pb1_rate NUMERIC(5, 4) NOT NULL DEFAULT 0.1000 CHECK (pb1_rate >= 0 AND pb1_rate <= 0.1000),
    service_in_pb1_base BOOLEAN NOT NULL DEFAULT TRUE,
    payment_flow_mode VARCHAR(15) NOT NULL DEFAULT 'payment_last'
        CHECK (payment_flow_mode IN ('payment_last', 'payment_first')),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
COMMENT ON TABLE restaurant_settings IS 'Satu baris: identitas di header struk (ThermalReceipt.tsx), tarif PB1 dan service charge (posCalculations.ts), dan mode alur bayar yang dipilih kasir. [src: PaymentFlowMode]';
COMMENT ON COLUMN restaurant_settings.payment_flow_mode IS 'Mode bayar default di layar order; tersimpan di localStorage kunci resto_pos_payment_mode_v1.';
COMMENT ON COLUMN restaurant_settings.service_in_pb1_base IS 'TRUE = PB1 dihitung dari (subtotal - diskon + service charge), sesuai calculateOrderTotals. Wajib dicek dengan perda daerah target.';

CREATE TABLE units (
    code VARCHAR(20) PRIMARY KEY,
    label VARCHAR(40)
);
COMMENT ON TABLE units IS 'Satuan bahan baku. Komentar RawMaterial.unit hanya menyebut kg, gram, liter, ml, butir, ekor, ikat; data awal juga memakai porsi, sisir, blok. Konversi antar satuan tidak ada di kode.';

CREATE TABLE roles (
    code VARCHAR(10) PRIMARY KEY CHECK (code IN ('owner', 'cashier', 'finance')),
    can_operate_pos BOOLEAN NOT NULL,
    can_access_kds BOOLEAN NOT NULL,
    can_access_checker BOOLEAN NOT NULL,
    can_access_inventory BOOLEAN NOT NULL,
    can_access_finance BOOLEAN NOT NULL,
    can_access_owner_dashboard BOOLEAN NOT NULL,
    can_manage_petty_cash BOOLEAN NOT NULL,
    can_reset_demo BOOLEAN NOT NULL
);
COMMENT ON TABLE roles IS 'Matriks izin per peran, dari getRolePermissions() di authRoles.ts. [src: UserRole]';

CREATE TABLE staff_accounts (
    id VARCHAR(40) PRIMARY KEY,
    name VARCHAR(100) NOT NULL,
    role VARCHAR(10) NOT NULL REFERENCES roles(code),
    pin_hash CHAR(64) NOT NULL UNIQUE,
    nfc_tag_uid VARCHAR(40) NOT NULL UNIQUE CHECK (nfc_tag_uid = UPPER(nfc_tag_uid)),
    avatar_color VARCHAR(40) NOT NULL,
    role_label VARCHAR(60) NOT NULL
);
COMMENT ON TABLE staff_accounts IS 'Akun login kasir/owner/finance. Login memakai PIN saja (authenticateByPin tidak menerima id staf), maka PIN harus unik global.';
COMMENT ON COLUMN staff_accounts.id IS 'Contoh: staff-owner-01. [src: StaffAccount.id]';
COMMENT ON COLUMN staff_accounts.name IS '[src: StaffAccount.name]';
COMMENT ON COLUMN staff_accounts.role IS '[src: StaffAccount.role]';
COMMENT ON COLUMN staff_accounts.pin_hash IS 'HMAC-SHA256 heksadesimal dari PIN dengan pepper sisi server. Kode saat ini menyimpan PIN polos di localStorage dan di bundel JS. [src: StaffAccount.pin]';
COMMENT ON COLUMN staff_accounts.nfc_tag_uid IS 'Huruf besar; authenticateByNfc membandingkan setelah toUpperCase. [src: StaffAccount.nfcTagUid]';
COMMENT ON COLUMN staff_accounts.avatar_color IS 'Kelas Tailwind (bg-amber-500); detail tampilan yang ikut tersimpan di kode. [src: StaffAccount.avatarColor]';
COMMENT ON COLUMN staff_accounts.role_label IS 'Label per akun, bukan per peran. [src: StaffAccount.roleLabel]';

CREATE TABLE waiters (
    id SMALLINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    name VARCHAR(100) NOT NULL UNIQUE,
    staff_id VARCHAR(40) REFERENCES staff_accounts(id)
);
COMMENT ON TABLE waiters IS 'Pramusaji. Daftar pilihan di OrderModal.tsx (4 nama) terpisah dari akun login; satu orang (Budi Prasetyo) ada di keduanya, maka staff_id opsional.';

-- ============================================================================
-- 2. DENAH MEJA
-- ============================================================================

CREATE TABLE dining_tables (
    id VARCHAR(10) PRIMARY KEY,
    table_number VARCHAR(20) NOT NULL UNIQUE,
    area VARCHAR(10) NOT NULL CHECK (area IN ('indoor', 'outdoor', 'vip')),
    capacity SMALLINT NOT NULL CHECK (capacity > 0),
    status VARCHAR(10) NOT NULL DEFAULT 'available'
        CHECK (status IN ('available', 'occupied', 'reserved', 'billing'))
);
COMMENT ON TABLE dining_tables IS 'Denah meja (36 meja di initialData.ts). Field runtime Table.currentTransactionId, guestCount, openedAt, waiterName tidak disimpan di sini; lihat view v_table_board.';
COMMENT ON COLUMN dining_tables.id IS 'Contoh: T01. [src: Table.id]';
COMMENT ON COLUMN dining_tables.table_number IS 'Contoh: 01 atau VIP-1. [src: Table.tableNumber]';
COMMENT ON COLUMN dining_tables.area IS '[src: Table.area]';
COMMENT ON COLUMN dining_tables.capacity IS '[src: Table.capacity]';
COMMENT ON COLUMN dining_tables.status IS 'available dan occupied dijaga trigger dari transaksi aktif. reserved dan billing ada di tipe TableStatus tetapi tidak pernah diisi oleh kode (belum ada fitur reservasi). [src: Table.status]';

-- ============================================================================
-- 3. BAHAN BAKU, MENU, MODIFIER, RESEP
-- ============================================================================

CREATE TABLE raw_materials (
    id VARCHAR(40) PRIMARY KEY,
    name VARCHAR(150) NOT NULL,
    unit VARCHAR(20) NOT NULL REFERENCES units(code),
    current_stock NUMERIC(14, 4) NOT NULL DEFAULT 0 CHECK (current_stock >= 0),
    min_stock NUMERIC(14, 4) NOT NULL DEFAULT 0 CHECK (min_stock >= 0),
    cost_per_unit NUMERIC(14, 2) NOT NULL DEFAULT 0 CHECK (cost_per_unit >= 0),
    storage_zone VARCHAR(20) NOT NULL
        CHECK (storage_zone IN ('Dry Storage', 'Walk-in Chiller', 'Deep Freezer', 'Bar Station'))
);
COMMENT ON TABLE raw_materials IS 'Bahan baku (14 baris di initialData.ts). Tanpa batch, tanpa buku besar mutasi: kode langsung menimpa currentStock.';
COMMENT ON COLUMN raw_materials.id IS 'Contoh: raw-beras. [src: RawMaterial.id]';
COMMENT ON COLUMN raw_materials.name IS '[src: RawMaterial.name]';
COMMENT ON COLUMN raw_materials.unit IS '[src: RawMaterial.unit]';
COMMENT ON COLUMN raw_materials.current_stock IS 'Kode menjepit ke 0 (Math.max(0, ...)) sehingga penjualan melebihi stok tidak terdeteksi. [src: RawMaterial.currentStock]';
COMMENT ON COLUMN raw_materials.min_stock IS 'Batas ROP; stok dianggap rendah bila current_stock <= min_stock. [src: RawMaterial.minStock]';
COMMENT ON COLUMN raw_materials.cost_per_unit IS '[src: RawMaterial.costPerUnit]';
COMMENT ON COLUMN raw_materials.storage_zone IS '[src: RawMaterial.storageZone]';

CREATE TABLE menu_items (
    id VARCHAR(40) PRIMARY KEY,
    name VARCHAR(150) NOT NULL,
    category VARCHAR(10) NOT NULL CHECK (category IN ('makanan', 'minuman', 'snack', 'dessert')),
    destination VARCHAR(10) NOT NULL CHECK (destination IN ('kitchen', 'bar')),
    price NUMERIC(14, 2) NOT NULL CHECK (price >= 0),
    cost NUMERIC(14, 2) NOT NULL CHECK (cost >= 0),
    portion_stock INTEGER NOT NULL DEFAULT 0 CHECK (portion_stock >= 0),
    image_url TEXT,
    description TEXT
);
COMMENT ON TABLE menu_items IS 'Katalog menu (18 baris di initialData.ts). [src: MenuItem.modifierGroups, MenuItem.recipe] disimpan di modifier_groups dan recipe_ingredients.';
COMMENT ON COLUMN menu_items.id IS 'Contoh: food-1, bev-1. [src: MenuItem.id]';
COMMENT ON COLUMN menu_items.name IS '[src: MenuItem.name]';
COMMENT ON COLUMN menu_items.category IS '[src: MenuItem.category]';
COMMENT ON COLUMN menu_items.destination IS 'Rute cetak otomatis: kitchen atau bar (routeOrderItems). [src: MenuItem.destination]';
COMMENT ON COLUMN menu_items.price IS '[src: MenuItem.price]';
COMMENT ON COLUMN menu_items.cost IS 'HPP per porsi, dipakai calculateOrderHPP. [src: MenuItem.cost]';
COMMENT ON COLUMN menu_items.portion_stock IS 'Hanya ditampilkan ("Stok 50") di OrderModal; tidak pernah dikurangi oleh kode. [src: MenuItem.stock]';
COMMENT ON COLUMN menu_items.image_url IS '[src: MenuItem.image]';
COMMENT ON COLUMN menu_items.description IS '[src: MenuItem.description]';

CREATE INDEX idx_menu_items_category ON menu_items(category);

CREATE TABLE modifier_groups (
    id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    menu_item_id VARCHAR(40) NOT NULL REFERENCES menu_items(id) ON DELETE CASCADE,
    code VARCHAR(40) NOT NULL,
    name VARCHAR(100) NOT NULL,
    is_required BOOLEAN NOT NULL DEFAULT FALSE,
    sort_order SMALLINT NOT NULL DEFAULT 0,
    CONSTRAINT uq_modifier_group_code UNIQUE (menu_item_id, code)
);
COMMENT ON TABLE modifier_groups IS 'Grup pilihan per menu (level pedas, pilihan telur). [src: MenuItem.modifierGroups]';
COMMENT ON COLUMN modifier_groups.code IS 'Contoh: pedas-1. [src: ModifierGroup.id]';
COMMENT ON COLUMN modifier_groups.name IS '[src: ModifierGroup.name]';
COMMENT ON COLUMN modifier_groups.is_required IS '[src: ModifierGroup.required]';

CREATE TABLE modifier_options (
    id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    group_id BIGINT NOT NULL REFERENCES modifier_groups(id) ON DELETE CASCADE,
    name VARCHAR(100) NOT NULL,
    price_delta NUMERIC(14, 2) NOT NULL DEFAULT 0,
    sort_order SMALLINT NOT NULL DEFAULT 0,
    CONSTRAINT uq_modifier_option_name UNIQUE (group_id, name)
);
COMMENT ON TABLE modifier_options IS 'Opsi dalam grup. [src: ModifierGroup.options]';
COMMENT ON COLUMN modifier_options.name IS 'Nama dapat memuat harga ("Sangat Pedas (+Rp 2.000)"); harga sebenarnya di price_delta. [src: ModifierOption.name]';
COMMENT ON COLUMN modifier_options.price_delta IS '[src: ModifierOption.priceDelta]';

CREATE TABLE recipe_ingredients (
    menu_item_id VARCHAR(40) NOT NULL REFERENCES menu_items(id) ON DELETE CASCADE,
    raw_material_id VARCHAR(40) NOT NULL REFERENCES raw_materials(id) ON DELETE RESTRICT,
    amount NUMERIC(14, 4) NOT NULL CHECK (amount > 0),
    PRIMARY KEY (menu_item_id, raw_material_id)
);
COMMENT ON TABLE recipe_ingredients IS 'Resep (BOM) per 1 porsi. Jumlah dalam satuan raw_materials.unit (0.015 untuk teh dalam kg = 15 gram); 5 dari 18 menu belum punya resep (bev-4, bev-5, bev-6, snack-3, dessert-1), sehingga penjualannya tidak memotong stok. [src: MenuItem.recipe]';
COMMENT ON COLUMN recipe_ingredients.raw_material_id IS '[src: RecipeIngredient.rawMaterialId]';
COMMENT ON COLUMN recipe_ingredients.amount IS '[src: RecipeIngredient.amount]';

CREATE INDEX idx_recipe_ingredients_material ON recipe_ingredients(raw_material_id);

CREATE TABLE discount_rules (
    code VARCHAR(20) PRIMARY KEY,
    name VARCHAR(80) NOT NULL,
    kind VARCHAR(10) NOT NULL CHECK (kind IN ('PERCENT', 'FIXED')),
    value NUMERIC(14, 2) NOT NULL CHECK (value > 0),
    CONSTRAINT chk_discount_percent CHECK (kind = 'FIXED' OR value <= 100)
);
COMMENT ON TABLE discount_rules IS 'Aturan diskon dari computeDiscountAmount(): member10 = 10% dari subtotal; promo20k = Rp20.000 dibatasi subtotal. DiscountType "none" berarti tanpa aturan (NULL di payments). [src: DiscountType]';

-- ============================================================================
-- 4. TRANSAKSI (BILL MEJA), BATCH, PEMBAYARAN, ITEM
-- ============================================================================

CREATE TABLE transactions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    number VARCHAR(40) NOT NULL UNIQUE,
    table_id VARCHAR(10) NOT NULL REFERENCES dining_tables(id),
    table_number VARCHAR(20) NOT NULL,
    area VARCHAR(10) NOT NULL CHECK (area IN ('indoor', 'outdoor', 'vip')),
    guest_count SMALLINT NOT NULL CHECK (guest_count > 0),
    waiter_id SMALLINT NOT NULL REFERENCES waiters(id),
    opened_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    status VARCHAR(10) NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'settled', 'cancelled')),
    payment_flow VARCHAR(15) CHECK (payment_flow IN ('payment_last', 'payment_first')),
    service_charge_rate NUMERIC(5, 4) NOT NULL DEFAULT 0.0500,
    tax_rate NUMERIC(5, 4) NOT NULL DEFAULT 0.1000
);
COMMENT ON TABLE transactions IS 'Satu kunjungan/bill per meja. Total uang tidak disimpan di sini: kode menimpa total transaksi setiap ada batch atau pelunasan, sehingga totalnya diturunkan dari item dan payments (view v_transaction_summary).';
COMMENT ON COLUMN transactions.number IS 'Contoh: TRX-20261023-4821, TRX-PF-... Kode membuatnya dengan angka acak 4 digit sehingga bisa bentrok; backend wajib memakai urutan. [src: Transaction.id]';
COMMENT ON COLUMN transactions.table_id IS '[src: Transaction.tableId]';
COMMENT ON COLUMN transactions.table_number IS 'Salinan nomor meja saat transaksi dibuat (dicetak di struk). [src: Transaction.tableNumber]';
COMMENT ON COLUMN transactions.area IS 'Salinan area meja saat transaksi dibuat. [src: Transaction.area]';
COMMENT ON COLUMN transactions.guest_count IS '[src: Transaction.guestCount]';
COMMENT ON COLUMN transactions.waiter_id IS 'Kode menyimpan nama pramusaji sebagai teks. [src: Transaction.waiterName]';
COMMENT ON COLUMN transactions.opened_at IS 'Waktu meja dibuka. KDS menghitung lama masak dari kolom ini, bukan dari waktu batch dikirim. [src: Transaction.openedAt]';
COMMENT ON COLUMN transactions.status IS 'cancelled ada di tipe tetapi tidak pernah diisi oleh kode (belum ada fitur batal/void). [src: Transaction.status]';
COMMENT ON COLUMN transactions.payment_flow IS 'Alur bayar terakhir pada transaksi ini. [src: Transaction.paymentFlow]';
COMMENT ON COLUMN transactions.service_charge_rate IS 'Salinan tarif saat transaksi dibuat. [src: Transaction.serviceChargeRate]';
COMMENT ON COLUMN transactions.tax_rate IS 'Salinan tarif PB1 saat transaksi dibuat. [src: Transaction.taxRate]';

-- Satu meja hanya boleh punya satu transaksi aktif (Table.currentTransactionId bernilai tunggal)
CREATE UNIQUE INDEX uq_transactions_one_active_per_table ON transactions(table_id) WHERE status = 'active';
CREATE INDEX idx_transactions_opened_at ON transactions(opened_at DESC);

CREATE TABLE transaction_batches (
    transaction_id UUID NOT NULL REFERENCES transactions(id) ON DELETE CASCADE,
    batch_number SMALLINT NOT NULL CHECK (batch_number >= 1),
    sent_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    PRIMARY KEY (transaction_id, batch_number)
);
COMMENT ON TABLE transaction_batches IS 'Gelombang pesanan "Pesanan ke-N" pada satu meja; tiap batch dicetak ke dapur/bar/checker. [src: Transaction.batches]';
COMMENT ON COLUMN transaction_batches.batch_number IS '[src: OrderBatch.batchNumber]';
COMMENT ON COLUMN transaction_batches.sent_at IS '[src: OrderBatch.timestamp]';

CREATE TABLE payments (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    payment_number VARCHAR(50) NOT NULL UNIQUE,
    transaction_id UUID NOT NULL REFERENCES transactions(id),
    flow VARCHAR(15) NOT NULL CHECK (flow IN ('payment_last', 'payment_first')),
    method VARCHAR(10) NOT NULL CHECK (method IN ('cash', 'qris', 'card')),
    card_bank VARCHAR(40),
    discount_rule_code VARCHAR(20) REFERENCES discount_rules(code),
    subtotal_amount NUMERIC(14, 2) NOT NULL CHECK (subtotal_amount >= 0),
    discount_amount NUMERIC(14, 2) NOT NULL DEFAULT 0 CHECK (discount_amount >= 0),
    service_charge_amount NUMERIC(14, 2) NOT NULL DEFAULT 0 CHECK (service_charge_amount >= 0),
    tax_amount NUMERIC(14, 2) NOT NULL DEFAULT 0 CHECK (tax_amount >= 0),
    total_amount NUMERIC(14, 2) NOT NULL CHECK (total_amount >= 0),
    cash_given NUMERIC(14, 2) NOT NULL CHECK (cash_given >= 0),
    change_amount NUMERIC(14, 2) NOT NULL DEFAULT 0 CHECK (change_amount >= 0),
    cashier_id VARCHAR(40) NOT NULL REFERENCES staff_accounts(id),
    paid_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT chk_payment_discount_le_subtotal CHECK (discount_amount <= subtotal_amount),
    CONSTRAINT chk_payment_total CHECK (
        total_amount = subtotal_amount - discount_amount + service_charge_amount + tax_amount
    ),
    CONSTRAINT chk_payment_cash CHECK (
        (method = 'cash' AND cash_given >= total_amount AND change_amount = cash_given - total_amount)
        OR (method <> 'cash' AND cash_given = total_amount AND change_amount = 0)
    ),
    CONSTRAINT chk_payment_card_bank CHECK (method = 'card' OR card_bank IS NULL)
);
COMMENT ON TABLE payments IS 'Satu baris per pelunasan (setiap record "settled" di kode). Satu transaksi bisa punya banyak pembayaran: Payment First melunasi batch tertentu di depan, sisanya dilunasi saat pelanggan selesai. Pendapatan = SUM(total_amount).';
COMMENT ON COLUMN payments.payment_number IS 'Nomor bukti bayar. Kode memakai ulang id transaksi; pada Payment First di meja yang belum punya transaksi aktif, record aktif dan record lunas bahkan memakai id yang sama (App.tsx: activeTxId = settledTxId). Backend harus menerbitkan nomor unik.';
COMMENT ON COLUMN payments.flow IS 'payment_first = dibayar saat memesan; payment_last = dibayar saat selesai.';
COMMENT ON COLUMN payments.method IS 'Nilai split pada tipe Transaction.paymentMethod tidak pernah dihasilkan UI; pembayaran terbagi dimodelkan sebagai beberapa baris. [src: Transaction.paymentMethod]';
COMMENT ON COLUMN payments.card_bank IS 'Pilihan bank EDC di layar bayar (default BCA EDC); di kode hanya state UI dan hilang setelah bayar.';
COMMENT ON COLUMN payments.discount_rule_code IS 'Jenis diskon yang dipilih; kode hanya menyimpan nominalnya.';
COMMENT ON COLUMN payments.subtotal_amount IS 'Jumlah subtotal item yang dilunasi pada pembayaran ini. [src: Transaction.subtotal]';
COMMENT ON COLUMN payments.discount_amount IS '[src: Transaction.discountAmount]';
COMMENT ON COLUMN payments.service_charge_amount IS '[src: Transaction.serviceChargeAmount]';
COMMENT ON COLUMN payments.tax_amount IS 'PB1. [src: Transaction.taxAmount]';
COMMENT ON COLUMN payments.total_amount IS '[src: Transaction.totalAmount]';
COMMENT ON COLUMN payments.cash_given IS 'Untuk non-tunai kode mengisi sama dengan total. [src: Transaction.cashGiven]';
COMMENT ON COLUMN payments.change_amount IS '[src: Transaction.changeAmount]';
COMMENT ON COLUMN payments.cashier_id IS 'Kode menulis cashierName tetap "Budi Prasetyo" untuk semua pembayaran, bukan staf yang sedang login. [src: Transaction.cashierName]';
COMMENT ON COLUMN payments.paid_at IS '[src: Transaction.paidAt]';

CREATE INDEX idx_payments_transaction ON payments(transaction_id);
CREATE INDEX idx_payments_paid_at ON payments(paid_at DESC);

CREATE TABLE transaction_items (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    transaction_id UUID NOT NULL,
    batch_number SMALLINT NOT NULL,
    menu_item_id VARCHAR(40) NOT NULL REFERENCES menu_items(id),
    name VARCHAR(150) NOT NULL,
    category VARCHAR(10) NOT NULL CHECK (category IN ('makanan', 'minuman', 'snack', 'dessert')),
    destination VARCHAR(10) NOT NULL CHECK (destination IN ('kitchen', 'bar')),
    unit_price NUMERIC(14, 2) NOT NULL CHECK (unit_price >= 0),
    quantity INTEGER NOT NULL CHECK (quantity >= 1),
    notes TEXT NOT NULL DEFAULT '',
    subtotal NUMERIC(14, 2) NOT NULL CHECK (subtotal >= 0),
    is_served BOOLEAN NOT NULL DEFAULT FALSE,
    served_at TIMESTAMPTZ,
    cooking_status VARCHAR(10) NOT NULL DEFAULT 'queue'
        CHECK (cooking_status IN ('queue', 'cooking', 'ready', 'handed_off')),
    handed_off_at TIMESTAMPTZ,
    payment_id UUID REFERENCES payments(id),
    CONSTRAINT fk_item_batch FOREIGN KEY (transaction_id, batch_number)
        REFERENCES transaction_batches(transaction_id, batch_number) ON DELETE CASCADE
);
COMMENT ON TABLE transaction_items IS 'Baris pesanan. Nama, kategori, tujuan, dan harga disalin dari menu saat dipesan. [src: Transaction.allCurrentItems, OrderBatch.items]';
COMMENT ON COLUMN transaction_items.id IS '[src: OrderItem.id]';
COMMENT ON COLUMN transaction_items.batch_number IS '[src: OrderItem.batchNumber]';
COMMENT ON COLUMN transaction_items.menu_item_id IS '[src: OrderItem.menuItemId]';
COMMENT ON COLUMN transaction_items.name IS 'Salinan. [src: OrderItem.name]';
COMMENT ON COLUMN transaction_items.category IS 'Salinan. [src: OrderItem.category]';
COMMENT ON COLUMN transaction_items.destination IS 'Salinan. [src: OrderItem.destination]';
COMMENT ON COLUMN transaction_items.unit_price IS 'Harga satuan di klien lalu disalin ke transaksi (celah yang sama dengan blueprint Gastro-Knowledge): backend harus mengambil dari menu_items. [src: OrderItem.unitPrice]';
COMMENT ON COLUMN transaction_items.quantity IS '[src: OrderItem.quantity]';
COMMENT ON COLUMN transaction_items.notes IS '[src: OrderItem.notes]';
COMMENT ON COLUMN transaction_items.subtotal IS '(unit_price + jumlah price_delta modifier) x quantity. [src: OrderItem.subtotal]';
COMMENT ON COLUMN transaction_items.is_served IS 'Centang pramusaji saat makanan sampai di meja. [src: OrderItem.isServed]';
COMMENT ON COLUMN transaction_items.served_at IS '[src: OrderItem.servedAt]';
COMMENT ON COLUMN transaction_items.cooking_status IS 'Status KDS: queue, cooking, ready, handed_off. Kode menganggap undefined sebagai queue. [src: OrderItem.cookingStatus]';
COMMENT ON COLUMN transaction_items.handed_off_at IS '[src: OrderItem.handedOffAt]';
COMMENT ON COLUMN transaction_items.payment_id IS 'NULL = belum dibayar. Menggantikan flag OrderItem.isPaid dan menunjuk pembayaran yang melunasi item ini. [src: OrderItem.isPaid]';

CREATE INDEX idx_transaction_items_transaction ON transaction_items(transaction_id, batch_number);
CREATE INDEX idx_transaction_items_payment ON transaction_items(payment_id) WHERE payment_id IS NOT NULL;
CREATE INDEX idx_transaction_items_kds ON transaction_items(destination, cooking_status) WHERE is_served = FALSE;

CREATE TABLE transaction_item_modifiers (
    id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    transaction_item_id UUID NOT NULL REFERENCES transaction_items(id) ON DELETE CASCADE,
    group_name VARCHAR(100) NOT NULL,
    option_name VARCHAR(100) NOT NULL,
    price_delta NUMERIC(14, 2) NOT NULL DEFAULT 0
);
COMMENT ON TABLE transaction_item_modifiers IS 'Pilihan modifier pada item, disalin berdasarkan nama (bukan id) sehingga tetap utuh bila menu diubah. Data contoh di App.tsx memakai grup "Es Batu" yang tidak ada di menu. [src: OrderItem.selectedModifiers]';
COMMENT ON COLUMN transaction_item_modifiers.group_name IS '[src: SelectedModifier.groupName]';
COMMENT ON COLUMN transaction_item_modifiers.option_name IS '[src: SelectedModifier.optionName]';
COMMENT ON COLUMN transaction_item_modifiers.price_delta IS '[src: SelectedModifier.priceDelta]';

CREATE INDEX idx_item_modifiers_item ON transaction_item_modifiers(transaction_item_id);

-- ============================================================================
-- 5. TIKET CETAK DAN KAS KECIL
-- ============================================================================

CREATE TABLE print_tickets (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    ticket_number VARCHAR(60) NOT NULL UNIQUE,
    transaction_id UUID NOT NULL REFERENCES transactions(id) ON DELETE CASCADE,
    batch_number SMALLINT,
    type VARCHAR(10) NOT NULL CHECK (type IN ('kitchen', 'bar', 'checker', 'receipt')),
    payment_flow VARCHAR(15) CHECK (payment_flow IN ('payment_last', 'payment_first')),
    payment_id UUID REFERENCES payments(id),
    notes TEXT,
    printed_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT fk_ticket_batch FOREIGN KEY (transaction_id, batch_number)
        REFERENCES transaction_batches(transaction_id, batch_number),
    CONSTRAINT chk_ticket_receipt_has_payment CHECK ((type = 'receipt') = (payment_id IS NOT NULL))
);
COMMENT ON TABLE print_tickets IS 'Riwayat cetak: struk dapur, bar, checker per batch, dan struk pembayaran. Isi tiket diturunkan, bukan disalin: dapur/bar = item batch dengan destination yang sama, checker = semua item batch, receipt = item yang dilunasi payment_id. Kode menyimpan salinan item di tiket sehingga status dilayani harus diperbarui di dua tempat. [src: PrintTicket.items, PrintTicket.financials]';
COMMENT ON COLUMN print_tickets.ticket_number IS 'Contoh: TKT-DAPUR-<ms>-<batch>, RCP-<ms>. [src: PrintTicket.id]';
COMMENT ON COLUMN print_tickets.transaction_id IS '[src: PrintTicket.transactionId]';
COMMENT ON COLUMN print_tickets.batch_number IS '[src: PrintTicket.batchNumber]';
COMMENT ON COLUMN print_tickets.type IS '[src: PrintTicket.type]';
COMMENT ON COLUMN print_tickets.payment_flow IS '[src: PrintTicket.paymentFlow]';
COMMENT ON COLUMN print_tickets.notes IS '[src: PrintTicket.notes]';
COMMENT ON COLUMN print_tickets.printed_at IS '[src: PrintTicket.timestamp]';

CREATE INDEX idx_print_tickets_transaction ON print_tickets(transaction_id, printed_at DESC);

CREATE TABLE petty_cash_entries (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    occurred_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    description VARCHAR(200) NOT NULL,
    category VARCHAR(20) NOT NULL CHECK (category IN ('operasional', 'bahan_darurat', 'utilitas', 'lainnya')),
    amount NUMERIC(14, 2) NOT NULL CHECK (amount > 0),
    receipt_number VARCHAR(40),
    recorded_by VARCHAR(40) NOT NULL REFERENCES staff_accounts(id)
);
COMMENT ON TABLE petty_cash_entries IS 'Pengeluaran kas kecil (FinanceView). Kode boleh menghapus entri; di backend sebaiknya dibatalkan, bukan dihapus.';
COMMENT ON COLUMN petty_cash_entries.id IS '[src: PettyCashEntry.id]';
COMMENT ON COLUMN petty_cash_entries.occurred_at IS '[src: PettyCashEntry.timestamp]';
COMMENT ON COLUMN petty_cash_entries.description IS '[src: PettyCashEntry.description]';
COMMENT ON COLUMN petty_cash_entries.category IS '[src: PettyCashEntry.category]';
COMMENT ON COLUMN petty_cash_entries.amount IS '[src: PettyCashEntry.amount]';
COMMENT ON COLUMN petty_cash_entries.receipt_number IS '[src: PettyCashEntry.receiptNumber]';
COMMENT ON COLUMN petty_cash_entries.recorded_by IS 'Kode menyimpan nama staf sebagai teks. [src: PettyCashEntry.recordedBy]';

CREATE INDEX idx_petty_cash_occurred_at ON petty_cash_entries(occurred_at DESC);

-- ============================================================================
-- 6. FUNGSI PERHITUNGAN (padanan posCalculations.ts)
-- ============================================================================

-- computeDiscountAmount(): member10 = Math.round(subtotal x 0.1), promo20k = Math.min(20000, subtotal)
CREATE OR REPLACE FUNCTION calc_discount(p_subtotal NUMERIC, p_rule_code VARCHAR)
RETURNS NUMERIC AS $$
DECLARE
    v_rule discount_rules%ROWTYPE;
    v_safe NUMERIC := GREATEST(0, p_subtotal);
BEGIN
    IF p_rule_code IS NULL THEN
        RETURN 0;
    END IF;
    SELECT * INTO v_rule FROM discount_rules WHERE code = p_rule_code;
    IF NOT FOUND THEN
        RAISE EXCEPTION 'Unknown discount rule: %', p_rule_code USING ERRCODE = 'GK006';
    END IF;
    IF v_rule.kind = 'PERCENT' THEN
        RETURN ROUND(v_safe * v_rule.value / 100, 0);
    END IF;
    RETURN LEAST(v_rule.value, v_safe);
END;
$$ LANGUAGE plpgsql STABLE;

-- calculateOrderTotals(): service = round(setelah diskon x rate); PB1 = round((setelah diskon + service) x rate)
CREATE OR REPLACE FUNCTION calc_settlement(
    p_subtotal NUMERIC,
    p_discount NUMERIC,
    p_service_rate NUMERIC,
    p_tax_rate NUMERIC,
    p_service_in_pb1_base BOOLEAN DEFAULT TRUE,
    OUT o_service NUMERIC,
    OUT o_tax NUMERIC,
    OUT o_total NUMERIC
) AS $$
DECLARE
    v_after NUMERIC := GREATEST(0, p_subtotal - p_discount);
BEGIN
    o_service := ROUND(v_after * p_service_rate, 0);
    IF p_service_in_pb1_base THEN
        o_tax := ROUND((v_after + o_service) * p_tax_rate, 0);
    ELSE
        o_tax := ROUND(v_after * p_tax_rate, 0);
    END IF;
    o_total := v_after + o_service + o_tax;
END;
$$ LANGUAGE plpgsql IMMUTABLE;

-- deductRecipeMaterials(): potong bahan baku dari resep untuk satu batch.
-- Perilaku kode dipertahankan: stok dijepit ke 0 (penjualan tetap jalan). Selisih
-- dikembalikan sebagai baris shortage supaya backend dapat memberi peringatan.
-- Kode membulatkan stok ke 2 desimal; fungsi ini memakai presisi kolom (4 desimal).
CREATE OR REPLACE FUNCTION deduct_batch_stock(p_transaction_id UUID, p_batch_number INTEGER)
RETURNS TABLE (
    raw_material_id VARCHAR(40),
    qty_used NUMERIC(14, 4),
    stock_before NUMERIC(14, 4),
    stock_after NUMERIC(14, 4),
    shortage NUMERIC(14, 4),
    is_low BOOLEAN
) AS $$
DECLARE
    v_need RECORD;
    v_before NUMERIC(14, 4);
    v_after NUMERIC(14, 4);
    v_min NUMERIC(14, 4);
BEGIN
    FOR v_need IN
        SELECT ri.raw_material_id AS rm_id, SUM(ri.amount * ti.quantity) AS used
        FROM transaction_items ti
        JOIN recipe_ingredients ri ON ri.menu_item_id = ti.menu_item_id
        WHERE ti.transaction_id = p_transaction_id AND ti.batch_number = p_batch_number
        GROUP BY ri.raw_material_id
        ORDER BY ri.raw_material_id COLLATE "C"
    LOOP
        SELECT rm.current_stock, rm.min_stock INTO v_before, v_min
        FROM raw_materials rm WHERE rm.id = v_need.rm_id FOR UPDATE;

        v_after := GREATEST(0, v_before - v_need.used);
        UPDATE raw_materials SET current_stock = v_after WHERE id = v_need.rm_id;

        raw_material_id := v_need.rm_id;
        qty_used := v_need.used;
        stock_before := v_before;
        stock_after := v_after;
        shortage := GREATEST(0, v_need.used - v_before);
        is_low := v_after <= v_min;
        RETURN NEXT;
    END LOOP;
END;
$$ LANGUAGE plpgsql;

-- ============================================================================
-- 7. TRIGGER: status meja mengikuti transaksi aktif
-- ============================================================================

CREATE OR REPLACE FUNCTION sync_table_status() RETURNS TRIGGER AS $$
BEGIN
    IF NEW.status = 'active' THEN
        UPDATE dining_tables SET status = 'occupied' WHERE id = NEW.table_id AND status <> 'occupied';
    ELSIF NOT EXISTS (
        SELECT 1 FROM transactions WHERE table_id = NEW.table_id AND status = 'active'
    ) THEN
        UPDATE dining_tables SET status = 'available'
        WHERE id = NEW.table_id AND status IN ('occupied', 'billing');
    END IF;
    RETURN NULL;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_transactions_table_status
AFTER INSERT OR UPDATE OF status ON transactions
FOR EACH ROW EXECUTE FUNCTION sync_table_status();

-- ============================================================================
-- 8. VIEW TURUNAN (field di TypeScript yang sengaja tidak disimpan)
-- ============================================================================

-- Table.currentTransactionId, guestCount, openedAt, waiterName
CREATE VIEW v_table_board AS
SELECT dt.id,
       dt.table_number,
       dt.area,
       dt.capacity,
       dt.status,
       t.number AS current_transaction_number,
       t.guest_count,
       t.opened_at,
       w.name AS waiter_name
FROM dining_tables dt
LEFT JOIN transactions t ON t.table_id = dt.id AND t.status = 'active'
LEFT JOIN waiters w ON w.id = t.waiter_id;

-- Transaction.isPaid, subtotal, dan sisa tagihan per transaksi
CREATE VIEW v_transaction_summary AS
SELECT t.id AS transaction_id,
       t.number,
       t.status,
       COUNT(ti.id) AS item_count,
       COALESCE(SUM(ti.subtotal), 0) AS items_subtotal,
       COALESCE(SUM(ti.subtotal) FILTER (WHERE ti.payment_id IS NOT NULL), 0) AS paid_subtotal,
       COALESCE(SUM(ti.subtotal) FILTER (WHERE ti.payment_id IS NULL), 0) AS unpaid_subtotal,
       COUNT(ti.id) FILTER (WHERE ti.payment_id IS NULL) AS unpaid_item_count,
       (COUNT(ti.id) > 0 AND COUNT(ti.id) FILTER (WHERE ti.payment_id IS NULL) = 0) AS is_paid,
       COALESCE((SELECT SUM(p.total_amount) FROM payments p WHERE p.transaction_id = t.id), 0) AS payments_total
FROM transactions t
LEFT JOIN transaction_items ti ON ti.transaction_id = t.id
GROUP BY t.id, t.number, t.status;

-- isKdsItemActive() dan getActiveKdsTickets(): item belum dilayani dan belum diserahkan ke pramusaji
CREATE VIEW v_kds_active_items AS
SELECT ti.id AS item_id, t.number AS transaction_number, t.table_number, ti.destination AS station,
       ti.name, ti.quantity, ti.notes, ti.cooking_status, ti.batch_number, t.opened_at
FROM transaction_items ti
JOIN transactions t ON t.id = ti.transaction_id
WHERE t.status = 'active' AND ti.is_served = FALSE AND ti.cooking_status <> 'handed_off';

-- isItemWaitingForWaiter(): selesai di KDS, belum dicentang pramusaji
CREATE VIEW v_waiter_pickup_items AS
SELECT ti.id AS item_id, t.number AS transaction_number, t.table_number, ti.destination AS station,
       ti.name, ti.quantity, ti.handed_off_at
FROM transaction_items ti
JOIN transactions t ON t.id = ti.transaction_id
WHERE t.status = 'active' AND ti.is_served = FALSE AND ti.cooking_status = 'handed_off';

-- Rekap harian: omzet, service charge, PB1, diskon, dan rincian per metode bayar
-- (calculateFinanceMetrics). Hari dihitung menurut WIB.
CREATE VIEW v_daily_settlement AS
SELECT (p.paid_at AT TIME ZONE 'Asia/Jakarta')::DATE AS business_date,
       COUNT(*) AS payment_count,
       SUM(p.total_amount) AS total_omzet,
       SUM(p.subtotal_amount) AS total_subtotal,
       SUM(p.service_charge_amount) AS total_service_charge,
       SUM(p.tax_amount) AS total_pb1,
       SUM(p.discount_amount) AS total_discount,
       COALESCE(SUM(p.total_amount) FILTER (WHERE p.method = 'cash'), 0) AS cash_total,
       COALESCE(SUM(p.total_amount) FILTER (WHERE p.method = 'qris'), 0) AS qris_total,
       COALESCE(SUM(p.total_amount) FILTER (WHERE p.method = 'card'), 0) AS card_total
FROM payments p
GROUP BY (p.paid_at AT TIME ZONE 'Asia/Jakarta')::DATE;

-- buildInventorySheetRows(): status stok dan nilai aset
CREATE VIEW v_stock_status AS
SELECT rm.id,
       rm.name,
       rm.storage_zone,
       rm.current_stock,
       rm.unit,
       rm.min_stock,
       rm.cost_per_unit,
       ROUND(rm.current_stock * rm.cost_per_unit, 0) AS asset_value,
       (rm.current_stock <= rm.min_stock) AS is_low
FROM raw_materials rm;

-- Pemeriksaan integritas yang tidak bisa dinyatakan dengan CHECK lintas tabel.
-- Semua view di bawah harus kosong pada data yang sehat.
CREATE VIEW v_integrity_item_subtotal AS
SELECT ti.id AS item_id, ti.subtotal AS stored_subtotal,
       (ti.unit_price + COALESCE((SELECT SUM(m.price_delta) FROM transaction_item_modifiers m
                                  WHERE m.transaction_item_id = ti.id), 0)) * ti.quantity AS expected_subtotal
FROM transaction_items ti
WHERE ti.subtotal <> (ti.unit_price + COALESCE((SELECT SUM(m.price_delta) FROM transaction_item_modifiers m
                                                WHERE m.transaction_item_id = ti.id), 0)) * ti.quantity;

CREATE VIEW v_integrity_payment AS
SELECT p.id AS payment_id, p.payment_number,
       p.subtotal_amount AS stored_subtotal,
       COALESCE(SUM(ti.subtotal), 0) AS items_subtotal,
       p.discount_amount AS stored_discount,
       calc_discount(p.subtotal_amount, p.discount_rule_code) AS expected_discount,
       p.service_charge_amount AS stored_service,
       p.tax_amount AS stored_tax,
       cs.o_service AS expected_service,
       cs.o_tax AS expected_tax
FROM payments p
LEFT JOIN transaction_items ti ON ti.payment_id = p.id
JOIN transactions t ON t.id = p.transaction_id
CROSS JOIN LATERAL calc_settlement(p.subtotal_amount, p.discount_amount, t.service_charge_rate, t.tax_rate) cs
GROUP BY p.id, p.payment_number, p.subtotal_amount, p.discount_amount, p.discount_rule_code,
         p.service_charge_amount, p.tax_amount, cs.o_service, cs.o_tax
HAVING p.subtotal_amount <> COALESCE(SUM(ti.subtotal), 0)
    OR p.discount_amount <> calc_discount(p.subtotal_amount, p.discount_rule_code)
    OR p.service_charge_amount <> cs.o_service
    OR p.tax_amount <> cs.o_tax;
