# ERD Gastro-Cashier (RestoPOS Touch)

> Dibuat otomatis oleh `db/tools/generate-erd.ts` dari skema yang dimuat ke PostgreSQL. Jangan diubah manual; ubah `db/schema.sql` lalu jalankan `db/tests/run.sh`.

Aplikasi saat ini hanya front-end (data di localStorage). Skema ini adalah bentuk relasional dari data itu: **19 tabel**, **21 relasi**, **8 view**.

Notasi: `||` tepat satu, `|o` nol atau satu, `o{` nol atau banyak. Ujung induk ada di kiri. Kolom hanya diberi tanda PK, FK, UK; tipe lengkap, default, dan CHECK ada di [DATA_DICTIONARY.md](DATA_DICTIONARY.md).

```mermaid
erDiagram
    dining_tables {
        varchar id PK
        varchar table_number UK
        varchar area
        smallint capacity
        varchar status
    }
    discount_rules {
        varchar code PK
        varchar name
        varchar kind
        numeric value
    }
    menu_items {
        varchar id PK
        varchar name
        varchar category
        varchar destination
        numeric price
        numeric cost
        integer portion_stock
        text image_url
        text description
    }
    modifier_groups {
        bigint id PK
        varchar menu_item_id FK
        varchar code
        varchar name
        boolean is_required
        smallint sort_order
    }
    modifier_options {
        bigint id PK
        bigint group_id FK
        varchar name
        numeric price_delta
        smallint sort_order
    }
    payments {
        uuid id PK
        varchar payment_number UK
        uuid transaction_id FK
        varchar flow
        varchar method
        varchar card_bank
        varchar discount_rule_code FK
        numeric subtotal_amount
        numeric discount_amount
        numeric service_charge_amount
        numeric tax_amount
        numeric total_amount
        numeric cash_given
        numeric change_amount
        varchar cashier_id FK
        timestamptz paid_at
    }
    petty_cash_entries {
        uuid id PK
        timestamptz occurred_at
        varchar description
        varchar category
        numeric amount
        varchar receipt_number
        varchar recorded_by FK
    }
    print_tickets {
        uuid id PK
        varchar ticket_number UK
        uuid transaction_id FK
        smallint batch_number FK
        varchar type
        varchar payment_flow
        uuid payment_id FK
        text notes
        timestamptz printed_at
    }
    raw_materials {
        varchar id PK
        varchar name
        varchar unit FK
        numeric current_stock
        numeric min_stock
        numeric cost_per_unit
        varchar storage_zone
    }
    recipe_ingredients {
        varchar menu_item_id PK,FK
        varchar raw_material_id PK,FK
        numeric amount
    }
    restaurant_settings {
        boolean singleton PK
        varchar restaurant_name
        varchar address
        varchar npwpd
        numeric service_charge_rate
        numeric pb1_rate
        boolean service_in_pb1_base
        varchar payment_flow_mode
        timestamptz updated_at
    }
    roles {
        varchar code PK
        boolean can_operate_pos
        boolean can_access_kds
        boolean can_access_checker
        boolean can_access_inventory
        boolean can_access_finance
        boolean can_access_owner_dashboard
        boolean can_manage_petty_cash
        boolean can_reset_demo
    }
    staff_accounts {
        varchar id PK
        varchar name
        varchar role FK
        char pin_hash UK
        varchar nfc_tag_uid UK
        varchar avatar_color
        varchar role_label
    }
    transaction_batches {
        uuid transaction_id PK,FK
        smallint batch_number PK
        timestamptz sent_at
    }
    transaction_item_modifiers {
        bigint id PK
        uuid transaction_item_id FK
        varchar group_name
        varchar option_name
        numeric price_delta
    }
    transaction_items {
        uuid id PK
        uuid transaction_id FK
        smallint batch_number FK
        varchar menu_item_id FK
        varchar name
        varchar category
        varchar destination
        numeric unit_price
        integer quantity
        text notes
        numeric subtotal
        boolean is_served
        timestamptz served_at
        varchar cooking_status
        timestamptz handed_off_at
        uuid payment_id FK
    }
    transactions {
        uuid id PK
        varchar number UK
        varchar table_id FK
        varchar table_number
        varchar area
        smallint guest_count
        smallint waiter_id FK
        timestamptz opened_at
        varchar status
        varchar payment_flow
        numeric service_charge_rate
        numeric tax_rate
    }
    units {
        varchar code PK
        varchar label
    }
    waiters {
        smallint id PK
        varchar name UK
        varchar staff_id FK
    }

    menu_items ||--o{ modifier_groups : "menu_item_id"
    modifier_groups ||--o{ modifier_options : "group_id"
    staff_accounts ||--o{ payments : "cashier_id"
    discount_rules |o--o{ payments : "discount_rule_code"
    transactions ||--o{ payments : "transaction_id"
    staff_accounts ||--o{ petty_cash_entries : "recorded_by"
    transaction_batches |o--o{ print_tickets : "transaction_id+batch_number"
    payments |o--o{ print_tickets : "payment_id"
    transactions ||--o{ print_tickets : "transaction_id"
    units ||--o{ raw_materials : "unit"
    menu_items ||--o{ recipe_ingredients : "menu_item_id"
    raw_materials ||--o{ recipe_ingredients : "raw_material_id"
    roles ||--o{ staff_accounts : "role"
    transactions ||--o{ transaction_batches : "transaction_id"
    transaction_items ||--o{ transaction_item_modifiers : "transaction_item_id"
    transaction_batches ||--o{ transaction_items : "transaction_id+batch_number"
    menu_items ||--o{ transaction_items : "menu_item_id"
    payments |o--o{ transaction_items : "payment_id"
    dining_tables ||--o{ transactions : "table_id"
    waiters ||--o{ transactions : "waiter_id"
    staff_accounts |o--o{ waiters : "staff_id"
```

## Daftar relasi

| Induk | Anak | Kolom FK | Kardinalitas (induk : anak) | ON DELETE |
| --- | --- | --- | --- | --- |
| menu_items (id) | modifier_groups | menu_item_id | 1 : 0..N | CASCADE |
| modifier_groups (id) | modifier_options | group_id | 1 : 0..N | CASCADE |
| staff_accounts (id) | payments | cashier_id | 1 : 0..N | NO ACTION |
| discount_rules (code) | payments | discount_rule_code | 0..1 : 0..N | NO ACTION |
| transactions (id) | payments | transaction_id | 1 : 0..N | NO ACTION |
| staff_accounts (id) | petty_cash_entries | recorded_by | 1 : 0..N | NO ACTION |
| transaction_batches (transaction_id, batch_number) | print_tickets | transaction_id, batch_number | 0..1 : 0..N | NO ACTION |
| payments (id) | print_tickets | payment_id | 0..1 : 0..N | NO ACTION |
| transactions (id) | print_tickets | transaction_id | 1 : 0..N | CASCADE |
| units (code) | raw_materials | unit | 1 : 0..N | NO ACTION |
| menu_items (id) | recipe_ingredients | menu_item_id | 1 : 0..N | CASCADE |
| raw_materials (id) | recipe_ingredients | raw_material_id | 1 : 0..N | RESTRICT |
| roles (code) | staff_accounts | role | 1 : 0..N | NO ACTION |
| transactions (id) | transaction_batches | transaction_id | 1 : 0..N | CASCADE |
| transaction_items (id) | transaction_item_modifiers | transaction_item_id | 1 : 0..N | CASCADE |
| transaction_batches (transaction_id, batch_number) | transaction_items | transaction_id, batch_number | 1 : 0..N | CASCADE |
| menu_items (id) | transaction_items | menu_item_id | 1 : 0..N | NO ACTION |
| payments (id) | transaction_items | payment_id | 0..1 : 0..N | NO ACTION |
| dining_tables (id) | transactions | table_id | 1 : 0..N | NO ACTION |
| waiters (id) | transactions | waiter_id | 1 : 0..N | NO ACTION |
| staff_accounts (id) | waiters | staff_id | 0..1 : 0..N | NO ACTION |

## View turunan

Field di `src/types/pos.ts` yang sengaja tidak disimpan sebagai kolom karena bisa dihitung.

| View | Fungsi |
| --- | --- |
| v_daily_settlement | Rekap harian: omzet, service charge, PB1, diskon, rincian per metode bayar (calculateFinanceMetrics). |
| v_integrity_item_subtotal | Pemeriksaan: subtotal item harus sama dengan (harga + modifier) x jumlah. Harus kosong. |
| v_integrity_payment | Pemeriksaan: subtotal, diskon, service charge, dan PB1 pada pembayaran harus sama dengan hitung ulang. Harus kosong. |
| v_kds_active_items | Antrean KDS: item yang belum dilayani dan belum diserahkan ke pramusaji (isKdsItemActive). |
| v_stock_status | Status stok dan nilai aset per bahan baku (buildInventorySheetRows). |
| v_table_board | Field runtime Table (currentTransactionId, guestCount, openedAt, waiterName) dan status meja beserta bill aktifnya. |
| v_transaction_summary | Transaction.isPaid, subtotal item, jumlah dibayar dan sisa tagihan per transaksi. |
| v_waiter_pickup_items | Item yang sudah selesai di KDS dan menunggu dicentang pramusaji (isItemWaitingForWaiter). |
