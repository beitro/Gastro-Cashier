-- DIBUAT OTOMATIS oleh db/tools/generate-seed.ts dari src/data/initialData.ts, src/utils/authRoles.ts,
-- src/utils/posCalculations.ts, dan src/components/OrderModal.tsx. Jangan diubah manual.
-- Data demo: PIN dihash dengan pepper demo; ganti di produksi.

INSERT INTO restaurant_settings (restaurant_name, address, npwpd, service_charge_rate, pb1_rate, service_in_pb1_base, payment_flow_mode) VALUES
    ('RESTO NUSANTARA INDAH', 'Jl. Kuliner Rasa No. 88, Jakarta Selatan', '01.345.678.9-012.000', 0.05, 0.1, TRUE, 'payment_last');

INSERT INTO units (code, label) VALUES
    ('kg', 'kg'),
    ('gram', 'gram'),
    ('liter', 'liter'),
    ('ml', 'ml'),
    ('butir', 'butir'),
    ('ekor', 'ekor'),
    ('ikat', 'ikat'),
    ('porsi', 'porsi'),
    ('sisir', 'sisir'),
    ('blok', 'blok');

INSERT INTO roles (code, can_operate_pos, can_access_kds, can_access_checker, can_access_inventory, can_access_finance, can_access_owner_dashboard, can_manage_petty_cash, can_reset_demo) VALUES
    ('owner', TRUE, TRUE, TRUE, TRUE, TRUE, TRUE, TRUE, TRUE),
    ('cashier', TRUE, TRUE, TRUE, FALSE, FALSE, FALSE, FALSE, FALSE),
    ('finance', FALSE, FALSE, FALSE, TRUE, TRUE, FALSE, TRUE, FALSE);

INSERT INTO staff_accounts (id, name, role, pin_hash, nfc_tag_uid, avatar_color, role_label) VALUES
    ('staff-owner-01', 'Hendrawan Kusuma', 'owner', 'cbc8ea79af7fa68cc6884ca35a367679c8643914a560d4f03bcbd7313fb53c13', 'NFC-OWNER-99', 'bg-amber-500', 'Owner / Executive'),
    ('staff-cashier-01', 'Budi Prasetyo', 'cashier', 'f270b5428515ce62b397afe8921a64b5b19a6edd2799ae9f38d09395e0421c6a', 'NFC-CASHIER-12', 'bg-emerald-600', 'Kasir Front-of-House'),
    ('staff-finance-01', 'Ratna Dewi', 'finance', '28b7f40937a40bcd31ee1cafb8ccb50519a14de884fcaa071f4a201504646bf6', 'NFC-FINANCE-56', 'bg-indigo-600', 'Finance & Tax PB1');

INSERT INTO waiters (name, staff_id) VALUES
    ('Budi Prasetyo', 'staff-cashier-01'),
    ('Siti Rahma', NULL),
    ('Doni Setiawan', NULL),
    ('Rian Pratama', NULL);

INSERT INTO discount_rules (code, name, kind, value) VALUES
    ('member10', 'Diskon Member 10%', 'PERCENT', 10),
    ('promo20k', 'Promo Potongan Rp20.000', 'FIXED', 20000);

INSERT INTO dining_tables (id, table_number, area, capacity, status) VALUES
    ('T01', '01', 'indoor', 2, 'available'),
    ('T02', '02', 'indoor', 2, 'available'),
    ('T03', '03', 'indoor', 4, 'available'),
    ('T04', '04', 'indoor', 4, 'available'),
    ('T05', '05', 'indoor', 4, 'available'),
    ('T06', '06', 'indoor', 6, 'available'),
    ('T07', '07', 'indoor', 4, 'available'),
    ('T08', '08', 'indoor', 4, 'available'),
    ('T09', '09', 'indoor', 4, 'available'),
    ('T10', '10', 'indoor', 2, 'available'),
    ('T11', '11', 'indoor', 2, 'available'),
    ('T12', '12', 'indoor', 6, 'available'),
    ('T13', '13', 'indoor', 4, 'available'),
    ('T14', '14', 'indoor', 4, 'available'),
    ('T15', '15', 'indoor', 4, 'available'),
    ('T16', '16', 'indoor', 8, 'available'),
    ('T17', '17', 'indoor', 4, 'available'),
    ('T18', '18', 'indoor', 4, 'available'),
    ('T19', '19', 'outdoor', 4, 'available'),
    ('T20', '20', 'outdoor', 4, 'available'),
    ('T21', '21', 'outdoor', 4, 'available'),
    ('T22', '22', 'outdoor', 4, 'available'),
    ('T23', '23', 'outdoor', 6, 'available'),
    ('T24', '24', 'outdoor', 6, 'available'),
    ('T25', '25', 'outdoor', 2, 'available'),
    ('T26', '26', 'outdoor', 2, 'available'),
    ('T27', '27', 'outdoor', 4, 'available'),
    ('T28', '28', 'outdoor', 4, 'available'),
    ('T29', '29', 'outdoor', 4, 'available'),
    ('T30', '30', 'outdoor', 8, 'available'),
    ('T31', 'VIP-1', 'vip', 8, 'available'),
    ('T32', 'VIP-2', 'vip', 10, 'available'),
    ('T33', 'VIP-3', 'vip', 12, 'available'),
    ('T34', 'VIP-4', 'vip', 6, 'available'),
    ('T35', 'VIP-5', 'vip', 8, 'available'),
    ('T36', 'VIP-6', 'vip', 10, 'available');

INSERT INTO raw_materials (id, name, unit, current_stock, min_stock, cost_per_unit, storage_zone) VALUES
    ('raw-beras', 'Beras Pandan Wangi', 'kg', 30, 6, 15000, 'Dry Storage'),
    ('raw-ayam', 'Daging Ayam Pejantan', 'porsi', 45, 10, 14000, 'Walk-in Chiller'),
    ('raw-bebek', 'Bebek Ungkep Kuning', 'porsi', 25, 5, 22000, 'Walk-in Chiller'),
    ('raw-gurame', 'Gurame Hidup Segar', 'ekor', 15, 3, 35000, 'Walk-in Chiller'),
    ('raw-buntut', 'Buntut Sapi Impor', 'porsi', 20, 4, 32000, 'Deep Freezer'),
    ('raw-mie', 'Mie Telur Basah', 'porsi', 35, 8, 6000, 'Walk-in Chiller'),
    ('raw-kangkung', 'Kangkung Segar', 'ikat', 30, 8, 4000, 'Walk-in Chiller'),
    ('raw-teh', 'Teh Melati Wangi', 'kg', 8, 2, 65000, 'Dry Storage'),
    ('raw-jeruk', 'Jeruk Manis Peras', 'kg', 40, 10, 22000, 'Walk-in Chiller'),
    ('raw-kopi', 'Biji Kopi Espresso Blend', 'kg', 9, 2, 180000, 'Bar Station'),
    ('raw-susu', 'Susu Fresh Milk Pasteurisasi', 'liter', 30, 8, 21000, 'Bar Station'),
    ('raw-aren', 'Gula Aren Organik', 'liter', 18, 4, 34000, 'Bar Station'),
    ('raw-pisang', 'Pisang Kepok Kuning', 'sisir', 35, 8, 12000, 'Dry Storage'),
    ('raw-tahu', 'Tahu Sutra Bandung', 'blok', 40, 10, 5500, 'Walk-in Chiller');

INSERT INTO menu_items (id, name, category, destination, price, cost, portion_stock, image_url, description) VALUES
    ('food-1', 'Nasi Goreng Spesial Resto', 'makanan', 'kitchen', 38000, 13200, 50, NULL, 'Nasi goreng bumbu gurih dengan suwiran ayam, udang, telur mata sapi, acar & kerupuk.'),
    ('food-2', 'Ayam Bakar Madu Pedas', 'makanan', 'kitchen', 42000, 16500, 35, NULL, 'Ayam pejantan bakar balutan bumbu madu rempah bakar arang wangi, lalapan & sambal.'),
    ('food-3', 'Bebek Goreng Serundeng Gurih', 'makanan', 'kitchen', 48000, 24000, 25, NULL, 'Bebek ungkep bumbu kuning digoreng garing dengan taburan serundeng kelapa & sambal korek.'),
    ('food-4', 'Gurame Bakar Jimbaran (Porsi 2-3 Org)', 'makanan', 'kitchen', 85000, 38000, 15, NULL, 'Ikan gurame segar dibakar dengan pasta bumbu khas Jimbaran Bali bercita rasa gurih pedas manis.'),
    ('food-5', 'Sate Ayam Madura (10 Tusuk)', 'makanan', 'kitchen', 36000, 14500, 40, NULL, 'Daging ayam tanpa kulit dipanggang arang disiram bumbu kacang lembut kental & irisan lontong.'),
    ('food-6', 'Sop Buntut Sapi Kuah Hangat', 'makanan', 'kitchen', 72000, 35000, 20, NULL, 'Buntut sapi empuk dengan kuah kaldu rempah bening gurih, wortel, kentang & emping melinjo.'),
    ('food-7', 'Mie Goreng Seafood Wok', 'makanan', 'kitchen', 39000, 15000, 30, NULL, 'Mie telur ditumis cepat dengan api besar (wok hei), cumi segar, udang, bakso & sawi hijau.'),
    ('food-8', 'Tumis Kangkung Belacan Hotplate', 'makanan', 'kitchen', 24000, 6500, 45, NULL, 'Kangkung muda renyah ditumis terasi udang belacan harum dengan irisan cabai merah.'),
    ('bev-1', 'Es Teh Manis Jasmine', 'minuman', 'bar', 9000, 1200, 150, NULL, 'Teh melati seduh harum khas nusantara disajikan segar dingin.'),
    ('bev-2', 'Es Jeruk Peras Murni', 'minuman', 'bar', 18000, 5500, 80, NULL, '100% jeruk segar peras tanpa pemanis buatan, kaya vitamin C.'),
    ('bev-3', 'Kopi Susu Gula Aren Barista', 'minuman', 'bar', 24000, 6800, 60, NULL, 'Espresso blend Arabika-Robusta dengan susu segar creamy dan sirup gula aren organik.'),
    ('bev-4', 'Jus Alpukat Kerok Saus Cokelat', 'minuman', 'bar', 26000, 9000, 40, NULL, 'Alpukat mentega legit diblend kental dengan lelehan susu kental manis cokelat.'),
    ('bev-5', 'Lychee Iced Tea with Real Fruit', 'minuman', 'bar', 22000, 6000, 50, NULL, 'Teh beraroma leci segar dengan 2 buah leci utuh dan daun mint dingin.'),
    ('bev-6', 'Wedang Jahe Susu Rempah', 'minuman', 'bar', 20000, 5000, 35, NULL, 'Sari jahe merah geprek rebusan kapulaga, cengkeh & susu kental manis hangat.'),
    ('snack-1', 'Pisang Goreng Keju Cokelat', 'snack', 'kitchen', 22000, 6500, 40, NULL, 'Pisang kepok matang dibalut tepung krispi dengan taburan keju cheddar parut melimpah & meses ceres.'),
    ('snack-2', 'Tahu Cabe Garam Crispy', 'snack', 'kitchen', 20000, 4500, 45, NULL, 'Potongan tahu sutra garing berbumbu bawang putih cincang gurih, cabai rawit potong & garam laut.'),
    ('snack-3', 'Singkong Keju Sambal Roa Manado', 'snack', 'kitchen', 24000, 6000, 30, NULL, 'Singkong empuk merekah dengan sambal roa asap khas Manado pedas mantap.'),
    ('dessert-1', 'Es Cendol Durian Legit', 'dessert', 'bar', 28000, 11000, 25, NULL, 'Cendol pandan kenyal dengan kuah santan gurih, gula kelapa asli, dan 1 butir daging durian montong.');

INSERT INTO modifier_groups (menu_item_id, code, name, is_required, sort_order) VALUES
    ('food-1', 'pedas-1', 'Level Pedas', TRUE, 0),
    ('food-1', 'telur-1', 'Pilihan Telur', FALSE, 1),
    ('food-2', 'potongan-ayam', 'Pilihan Potongan', TRUE, 0),
    ('food-2', 'sambal-ayam', 'Pilihan Sambal', FALSE, 1),
    ('bev-1', 'gula-teh', 'Tingkat Manis', FALSE, 0);

INSERT INTO modifier_options (group_id, name, price_delta, sort_order) VALUES
    ((SELECT id FROM modifier_groups WHERE menu_item_id = 'food-1' AND code = 'pedas-1'), 'Tidak Pedas', 0, 0),
    ((SELECT id FROM modifier_groups WHERE menu_item_id = 'food-1' AND code = 'pedas-1'), 'Pedas Sedang', 0, 1),
    ((SELECT id FROM modifier_groups WHERE menu_item_id = 'food-1' AND code = 'pedas-1'), 'Sangat Pedas (+Rp 2.000)', 2000, 2),
    ((SELECT id FROM modifier_groups WHERE menu_item_id = 'food-1' AND code = 'telur-1'), 'Mata Sapi Setengah Matang', 0, 0),
    ((SELECT id FROM modifier_groups WHERE menu_item_id = 'food-1' AND code = 'telur-1'), 'Mata Sapi Matang', 0, 1),
    ((SELECT id FROM modifier_groups WHERE menu_item_id = 'food-1' AND code = 'telur-1'), 'Telur Dadar', 0, 2),
    ((SELECT id FROM modifier_groups WHERE menu_item_id = 'food-2' AND code = 'potongan-ayam'), 'Paha Atas & Bawah', 0, 0),
    ((SELECT id FROM modifier_groups WHERE menu_item_id = 'food-2' AND code = 'potongan-ayam'), 'Dada & Sayap', 0, 1),
    ((SELECT id FROM modifier_groups WHERE menu_item_id = 'food-2' AND code = 'sambal-ayam'), 'Sambal Terasi Bakar', 0, 0),
    ((SELECT id FROM modifier_groups WHERE menu_item_id = 'food-2' AND code = 'sambal-ayam'), 'Sambal Bawang Korek', 0, 1),
    ((SELECT id FROM modifier_groups WHERE menu_item_id = 'food-2' AND code = 'sambal-ayam'), 'Sambal Kecap Rawit', 0, 2),
    ((SELECT id FROM modifier_groups WHERE menu_item_id = 'bev-1' AND code = 'gula-teh'), 'Normal Manis', 0, 0),
    ((SELECT id FROM modifier_groups WHERE menu_item_id = 'bev-1' AND code = 'gula-teh'), 'Less Sugar', 0, 1),
    ((SELECT id FROM modifier_groups WHERE menu_item_id = 'bev-1' AND code = 'gula-teh'), 'Tawar (No Sugar)', 0, 2);

INSERT INTO recipe_ingredients (menu_item_id, raw_material_id, amount) VALUES
    ('food-1', 'raw-beras', 0.15),
    ('food-1', 'raw-ayam', 0.5),
    ('food-2', 'raw-ayam', 1),
    ('food-3', 'raw-bebek', 1),
    ('food-4', 'raw-gurame', 1),
    ('food-5', 'raw-ayam', 1),
    ('food-6', 'raw-buntut', 1),
    ('food-7', 'raw-mie', 1),
    ('food-8', 'raw-kangkung', 1),
    ('bev-1', 'raw-teh', 0.015),
    ('bev-2', 'raw-jeruk', 0.25),
    ('bev-3', 'raw-kopi', 0.018),
    ('bev-3', 'raw-susu', 0.12),
    ('bev-3', 'raw-aren', 0.025),
    ('snack-1', 'raw-pisang', 0.2),
    ('snack-2', 'raw-tahu', 1);
