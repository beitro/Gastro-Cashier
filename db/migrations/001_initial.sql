-- Gastro-Cashier PostgreSQL 15 canonical baseline.
-- Fresh database only. Replaces the former single-restaurant draft.
-- Runtime MUST set app.tenant_id and app.outlet_id inside each transaction.
BEGIN;
CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE TABLE tenants (
 id UUID PRIMARY KEY DEFAULT gen_random_uuid(), slug VARCHAR(80) NOT NULL UNIQUE,
 name VARCHAR(160) NOT NULL, status VARCHAR(16) NOT NULL DEFAULT 'active' CHECK(status IN ('active','suspended','closed')),
 timezone VARCHAR(64) NOT NULL DEFAULT 'Asia/Jakarta', currency CHAR(3) NOT NULL DEFAULT 'IDR',
 created_at TIMESTAMPTZ NOT NULL DEFAULT now(), updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE TABLE outlets (
 id UUID PRIMARY KEY DEFAULT gen_random_uuid(), tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE RESTRICT,
 slug VARCHAR(80) NOT NULL, name VARCHAR(160) NOT NULL, address TEXT, phone VARCHAR(40),
 timezone VARCHAR(64) NOT NULL DEFAULT 'Asia/Jakarta', status VARCHAR(16) NOT NULL DEFAULT 'active' CHECK(status IN ('active','inactive','closed')),
 created_at TIMESTAMPTZ NOT NULL DEFAULT now(), updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
 UNIQUE(tenant_id,id), UNIQUE(tenant_id,slug)
);
CREATE TABLE staff_accounts (
 id UUID PRIMARY KEY DEFAULT gen_random_uuid(), email VARCHAR(254), phone VARCHAR(40), display_name VARCHAR(120) NOT NULL,
 pin_hash TEXT, nfc_credential_hash TEXT, status VARCHAR(16) NOT NULL DEFAULT 'active' CHECK(status IN ('active','inactive','blocked')),
 failed_login_count INTEGER NOT NULL DEFAULT 0 CHECK(failed_login_count>=0), locked_until TIMESTAMPTZ, last_login_at TIMESTAMPTZ,
 created_at TIMESTAMPTZ NOT NULL DEFAULT now(), updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
 CHECK(email IS NOT NULL OR phone IS NOT NULL)
);
CREATE UNIQUE INDEX uq_staff_email_ci ON staff_accounts(lower(email)) WHERE email IS NOT NULL;
CREATE UNIQUE INDEX uq_staff_phone ON staff_accounts(phone) WHERE phone IS NOT NULL;
CREATE TABLE tenant_memberships (
 id UUID PRIMARY KEY DEFAULT gen_random_uuid(), tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE RESTRICT,
 staff_id UUID NOT NULL REFERENCES staff_accounts(id) ON DELETE RESTRICT,
 role_code VARCHAR(24) NOT NULL CHECK(role_code IN ('owner','admin','manager','cashier','waiter','finance','kitchen')),
 status VARCHAR(16) NOT NULL DEFAULT 'active' CHECK(status IN ('active','inactive','revoked')),
 created_at TIMESTAMPTZ NOT NULL DEFAULT now(), UNIQUE(tenant_id,id), UNIQUE(tenant_id,staff_id)
);
CREATE TABLE outlet_memberships (
 id UUID PRIMARY KEY DEFAULT gen_random_uuid(), tenant_id UUID NOT NULL, outlet_id UUID NOT NULL, tenant_membership_id UUID NOT NULL,
 role_code VARCHAR(24) NOT NULL CHECK(role_code IN ('owner','admin','manager','cashier','waiter','finance','kitchen')),
 status VARCHAR(16) NOT NULL DEFAULT 'active' CHECK(status IN ('active','inactive','revoked')), created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
 FOREIGN KEY(tenant_id,outlet_id) REFERENCES outlets(tenant_id,id) ON DELETE RESTRICT,
 FOREIGN KEY(tenant_id,tenant_membership_id) REFERENCES tenant_memberships(tenant_id,id) ON DELETE RESTRICT,
 UNIQUE(tenant_id,outlet_id,id), UNIQUE(tenant_id,outlet_id,tenant_membership_id)
);
CREATE TABLE tenant_settings (
 tenant_id UUID PRIMARY KEY REFERENCES tenants(id) ON DELETE CASCADE,
 service_charge_rate NUMERIC(7,6) NOT NULL DEFAULT 0 CHECK(service_charge_rate BETWEEN 0 AND 1),
 tax_rate NUMERIC(7,6) NOT NULL DEFAULT 0 CHECK(tax_rate BETWEEN 0 AND 1),
 service_in_tax_base BOOLEAN NOT NULL DEFAULT TRUE,
 default_payment_flow VARCHAR(16) NOT NULL DEFAULT 'payment_last' CHECK(default_payment_flow IN ('payment_last','payment_first')),
 settings JSONB NOT NULL DEFAULT '{}'::jsonb, updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE TABLE outlet_settings (
 tenant_id UUID NOT NULL, outlet_id UUID NOT NULL, service_charge_rate NUMERIC(7,6) CHECK(service_charge_rate BETWEEN 0 AND 1),
 tax_rate NUMERIC(7,6) CHECK(tax_rate BETWEEN 0 AND 1), settings JSONB NOT NULL DEFAULT '{}'::jsonb,
 updated_at TIMESTAMPTZ NOT NULL DEFAULT now(), PRIMARY KEY(tenant_id,outlet_id),
 FOREIGN KEY(tenant_id,outlet_id) REFERENCES outlets(tenant_id,id) ON DELETE CASCADE
);
CREATE TABLE dining_tables (
 id UUID PRIMARY KEY DEFAULT gen_random_uuid(), tenant_id UUID NOT NULL, outlet_id UUID NOT NULL,
 table_code VARCHAR(24) NOT NULL, display_name VARCHAR(48) NOT NULL,
 area VARCHAR(24) NOT NULL DEFAULT 'indoor' CHECK(area IN ('indoor','outdoor','vip','private','other')),
 capacity SMALLINT NOT NULL CHECK(capacity>0), sort_order INTEGER NOT NULL DEFAULT 0, is_active BOOLEAN NOT NULL DEFAULT TRUE,
 created_at TIMESTAMPTZ NOT NULL DEFAULT now(), updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
 FOREIGN KEY(tenant_id,outlet_id) REFERENCES outlets(tenant_id,id) ON DELETE RESTRICT,
 UNIQUE(tenant_id,outlet_id,id), UNIQUE(tenant_id,outlet_id,table_code)
);
CREATE TABLE reservations (
 id UUID PRIMARY KEY DEFAULT gen_random_uuid(), tenant_id UUID NOT NULL, outlet_id UUID NOT NULL, table_id UUID,
 reservation_code VARCHAR(40) NOT NULL, guest_name VARCHAR(120) NOT NULL, guest_phone VARCHAR(40),
 guest_count SMALLINT NOT NULL CHECK(guest_count>0), starts_at TIMESTAMPTZ NOT NULL, ends_at TIMESTAMPTZ,
 status VARCHAR(16) NOT NULL DEFAULT 'confirmed' CHECK(status IN ('pending','confirmed','seated','cancelled','no_show','expired')),
 notes TEXT, created_by_staff_id UUID REFERENCES staff_accounts(id) ON DELETE SET NULL,
 created_at TIMESTAMPTZ NOT NULL DEFAULT now(), updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
 FOREIGN KEY(tenant_id,outlet_id) REFERENCES outlets(tenant_id,id) ON DELETE RESTRICT,
 FOREIGN KEY(tenant_id,outlet_id,table_id) REFERENCES dining_tables(tenant_id,outlet_id,id) ON DELETE RESTRICT,
 UNIQUE(tenant_id,outlet_id,id), UNIQUE(tenant_id,outlet_id,reservation_code),
 CHECK(ends_at IS NULL OR ends_at>starts_at)
);
CREATE INDEX idx_reservations_schedule ON reservations(tenant_id,outlet_id,starts_at) WHERE status IN ('pending','confirmed');
CREATE TABLE dining_sessions (
 id UUID PRIMARY KEY DEFAULT gen_random_uuid(), tenant_id UUID NOT NULL, outlet_id UUID NOT NULL, table_id UUID NOT NULL,
 session_number VARCHAR(48) NOT NULL, reservation_id UUID, guest_count SMALLINT NOT NULL CHECK(guest_count>0),
 status VARCHAR(16) NOT NULL DEFAULT 'active' CHECK(status IN ('active','billing','closed','cancelled')),
 opened_by_staff_id UUID REFERENCES staff_accounts(id) ON DELETE SET NULL,
 waiter_staff_id UUID REFERENCES staff_accounts(id) ON DELETE SET NULL,
 opened_at TIMESTAMPTZ NOT NULL DEFAULT now(), closed_at TIMESTAMPTZ,
 version INTEGER NOT NULL DEFAULT 1 CHECK(version>0),
 payment_flow VARCHAR(16) NOT NULL DEFAULT 'payment_last' CHECK(payment_flow IN ('payment_last','payment_first')),
 service_charge_rate NUMERIC(7,6) NOT NULL DEFAULT 0 CHECK(service_charge_rate BETWEEN 0 AND 1),
 tax_rate NUMERIC(7,6) NOT NULL DEFAULT 0 CHECK(tax_rate BETWEEN 0 AND 1), notes TEXT,
 FOREIGN KEY(tenant_id,outlet_id) REFERENCES outlets(tenant_id,id) ON DELETE RESTRICT,
 FOREIGN KEY(tenant_id,outlet_id,table_id) REFERENCES dining_tables(tenant_id,outlet_id,id) ON DELETE RESTRICT,
 FOREIGN KEY(tenant_id,outlet_id,reservation_id) REFERENCES reservations(tenant_id,outlet_id,id) ON DELETE RESTRICT,
 UNIQUE(tenant_id,outlet_id,id), UNIQUE(tenant_id,outlet_id,session_number),
 CHECK((status IN ('active','billing') AND closed_at IS NULL) OR (status IN ('closed','cancelled') AND closed_at IS NOT NULL))
);
CREATE UNIQUE INDEX uq_reservation_one_session ON dining_sessions(tenant_id,outlet_id,reservation_id) WHERE reservation_id IS NOT NULL;
CREATE UNIQUE INDEX uq_one_open_session_per_table ON dining_sessions(tenant_id,outlet_id,table_id) WHERE status IN ('active','billing');
CREATE INDEX idx_sessions_open ON dining_sessions(tenant_id,outlet_id,opened_at DESC) WHERE status IN ('active','billing');

CREATE TABLE menu_categories (
 id UUID PRIMARY KEY DEFAULT gen_random_uuid(), tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
 code VARCHAR(40) NOT NULL, name VARCHAR(100) NOT NULL, sort_order INTEGER NOT NULL DEFAULT 0, is_active BOOLEAN NOT NULL DEFAULT TRUE,
 UNIQUE(tenant_id,id), UNIQUE(tenant_id,code)
);
CREATE TABLE menu_items (
 id UUID PRIMARY KEY DEFAULT gen_random_uuid(), tenant_id UUID NOT NULL, outlet_id UUID, category_id UUID, sku VARCHAR(48),
 name VARCHAR(160) NOT NULL, description TEXT, destination VARCHAR(16) NOT NULL DEFAULT 'kitchen' CHECK(destination IN ('kitchen','bar','other')),
 price NUMERIC(14,2) NOT NULL CHECK(price>=0), cost_price NUMERIC(14,2) NOT NULL DEFAULT 0 CHECK(cost_price>=0),
 image_url TEXT, is_available BOOLEAN NOT NULL DEFAULT TRUE, sort_order INTEGER NOT NULL DEFAULT 0,
 created_at TIMESTAMPTZ NOT NULL DEFAULT now(), updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
 FOREIGN KEY(tenant_id) REFERENCES tenants(id) ON DELETE CASCADE,
 FOREIGN KEY(tenant_id,outlet_id) REFERENCES outlets(tenant_id,id) ON DELETE CASCADE,
 FOREIGN KEY(tenant_id,category_id) REFERENCES menu_categories(tenant_id,id) ON DELETE RESTRICT,
 UNIQUE(tenant_id,id)
);
CREATE UNIQUE INDEX uq_menu_sku_scope ON menu_items(tenant_id,COALESCE(outlet_id,'00000000-0000-0000-0000-000000000000'::uuid),sku) WHERE sku IS NOT NULL;
CREATE INDEX idx_menu_available ON menu_items(tenant_id,outlet_id,category_id) WHERE is_available;
CREATE TABLE modifier_groups (
 id UUID PRIMARY KEY DEFAULT gen_random_uuid(), tenant_id UUID NOT NULL, menu_item_id UUID NOT NULL,
 name VARCHAR(100) NOT NULL, is_required BOOLEAN NOT NULL DEFAULT FALSE, min_select SMALLINT NOT NULL DEFAULT 0 CHECK(min_select>=0),
 max_select SMALLINT NOT NULL DEFAULT 1 CHECK(max_select>=min_select), sort_order INTEGER NOT NULL DEFAULT 0,
 FOREIGN KEY(tenant_id,menu_item_id) REFERENCES menu_items(tenant_id,id) ON DELETE CASCADE, UNIQUE(tenant_id,id)
);
CREATE TABLE modifier_options (
 id UUID PRIMARY KEY DEFAULT gen_random_uuid(), tenant_id UUID NOT NULL, group_id UUID NOT NULL,
 name VARCHAR(100) NOT NULL, price_delta NUMERIC(14,2) NOT NULL DEFAULT 0, is_available BOOLEAN NOT NULL DEFAULT TRUE,
 sort_order INTEGER NOT NULL DEFAULT 0,
 FOREIGN KEY(tenant_id,group_id) REFERENCES modifier_groups(tenant_id,id) ON DELETE CASCADE,
 UNIQUE(tenant_id,id), UNIQUE(tenant_id,group_id,name)
);
CREATE TABLE inventory_items (
 id UUID PRIMARY KEY DEFAULT gen_random_uuid(), tenant_id UUID NOT NULL, outlet_id UUID NOT NULL, sku VARCHAR(48),
 name VARCHAR(160) NOT NULL, unit_code VARCHAR(20) NOT NULL, current_quantity NUMERIC(16,4) NOT NULL DEFAULT 0,
 reorder_level NUMERIC(16,4) NOT NULL DEFAULT 0 CHECK(reorder_level>=0),
 average_unit_cost NUMERIC(14,2) NOT NULL DEFAULT 0 CHECK(average_unit_cost>=0), storage_zone VARCHAR(48), is_active BOOLEAN NOT NULL DEFAULT TRUE,
 FOREIGN KEY(tenant_id,outlet_id) REFERENCES outlets(tenant_id,id) ON DELETE RESTRICT,
 UNIQUE(tenant_id,outlet_id,id), UNIQUE(tenant_id,outlet_id,sku)
);
CREATE TABLE recipes (
 id UUID PRIMARY KEY DEFAULT gen_random_uuid(), tenant_id UUID NOT NULL, outlet_id UUID, menu_item_id UUID NOT NULL,
 version INTEGER NOT NULL DEFAULT 1 CHECK(version>0), is_active BOOLEAN NOT NULL DEFAULT TRUE, created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
 FOREIGN KEY(tenant_id,menu_item_id) REFERENCES menu_items(tenant_id,id) ON DELETE CASCADE,
 FOREIGN KEY(tenant_id,outlet_id) REFERENCES outlets(tenant_id,id) ON DELETE CASCADE,
 UNIQUE(tenant_id,id), UNIQUE(tenant_id,outlet_id,menu_item_id,version)
);
CREATE TABLE recipe_lines (
 tenant_id UUID NOT NULL, recipe_id UUID NOT NULL, inventory_item_id UUID NOT NULL, quantity NUMERIC(16,4) NOT NULL CHECK(quantity>0),
 PRIMARY KEY(tenant_id,recipe_id,inventory_item_id),
 FOREIGN KEY(tenant_id,recipe_id) REFERENCES recipes(tenant_id,id) ON DELETE CASCADE,
 FOREIGN KEY(tenant_id,inventory_item_id) REFERENCES inventory_items(tenant_id,id) ON DELETE RESTRICT
);
CREATE TABLE order_batches (
 id UUID PRIMARY KEY DEFAULT gen_random_uuid(), tenant_id UUID NOT NULL, outlet_id UUID NOT NULL, session_id UUID NOT NULL,
 batch_number INTEGER NOT NULL CHECK(batch_number>0), created_by_staff_id UUID REFERENCES staff_accounts(id) ON DELETE SET NULL,
 status VARCHAR(16) NOT NULL DEFAULT 'submitted' CHECK(status IN ('draft','submitted','in_progress','ready','served','voided')),
 note TEXT, created_at TIMESTAMPTZ NOT NULL DEFAULT now(), submitted_at TIMESTAMPTZ,
 FOREIGN KEY(tenant_id,outlet_id,session_id) REFERENCES dining_sessions(tenant_id,outlet_id,id) ON DELETE RESTRICT,
 UNIQUE(tenant_id,outlet_id,id), UNIQUE(tenant_id,outlet_id,session_id,batch_number)
);
CREATE TABLE payments (
 id UUID PRIMARY KEY DEFAULT gen_random_uuid(), tenant_id UUID NOT NULL, outlet_id UUID NOT NULL, session_id UUID NOT NULL,
 receipt_number VARCHAR(48) NOT NULL, status VARCHAR(16) NOT NULL DEFAULT 'settled' CHECK(status IN ('pending','settled','voided','refunded')),
 method VARCHAR(16) NOT NULL CHECK(method IN ('cash','qris','card','transfer','other')), card_bank VARCHAR(48),
 subtotal_amount NUMERIC(14,2) NOT NULL CHECK(subtotal_amount>=0), discount_amount NUMERIC(14,2) NOT NULL DEFAULT 0 CHECK(discount_amount>=0),
 service_charge_amount NUMERIC(14,2) NOT NULL DEFAULT 0 CHECK(service_charge_amount>=0), tax_amount NUMERIC(14,2) NOT NULL DEFAULT 0 CHECK(tax_amount>=0),
 total_amount NUMERIC(14,2) NOT NULL CHECK(total_amount>=0), cash_received NUMERIC(14,2) NOT NULL DEFAULT 0 CHECK(cash_received>=0),
 change_amount NUMERIC(14,2) NOT NULL DEFAULT 0 CHECK(change_amount>=0), cashier_staff_id UUID REFERENCES staff_accounts(id) ON DELETE SET NULL,
 idempotency_key VARCHAR(128) NOT NULL, paid_at TIMESTAMPTZ NOT NULL DEFAULT now(),
 FOREIGN KEY(tenant_id,outlet_id,session_id) REFERENCES dining_sessions(tenant_id,outlet_id,id) ON DELETE RESTRICT,
 UNIQUE(tenant_id,outlet_id,id), UNIQUE(tenant_id,outlet_id,receipt_number), UNIQUE(tenant_id,outlet_id,idempotency_key),
 CHECK(discount_amount<=subtotal_amount),
 CHECK(total_amount=subtotal_amount-discount_amount+service_charge_amount+tax_amount),
 CHECK((method='cash' AND cash_received>=total_amount AND change_amount=cash_received-total_amount)
    OR (method<>'cash' AND cash_received=total_amount AND change_amount=0))
);
CREATE TABLE order_items (
 id UUID PRIMARY KEY DEFAULT gen_random_uuid(), tenant_id UUID NOT NULL, outlet_id UUID NOT NULL, session_id UUID NOT NULL, batch_id UUID NOT NULL,
 menu_item_id UUID, item_name_snapshot VARCHAR(160) NOT NULL, category_snapshot VARCHAR(100),
 destination VARCHAR(16) NOT NULL CHECK(destination IN ('kitchen','bar','other')), unit_price NUMERIC(14,2) NOT NULL CHECK(unit_price>=0),
 quantity INTEGER NOT NULL CHECK(quantity>0), modifier_total NUMERIC(14,2) NOT NULL DEFAULT 0,
 line_total NUMERIC(14,2) NOT NULL CHECK(line_total>=0), notes TEXT,
 cooking_status VARCHAR(16) NOT NULL DEFAULT 'queue' CHECK(cooking_status IN ('queue','cooking','ready','handed_off','cancelled')),
 is_served BOOLEAN NOT NULL DEFAULT FALSE, served_at TIMESTAMPTZ, created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
 FOREIGN KEY(tenant_id,outlet_id,session_id) REFERENCES dining_sessions(tenant_id,outlet_id,id) ON DELETE RESTRICT,
 FOREIGN KEY(tenant_id,outlet_id,batch_id) REFERENCES order_batches(tenant_id,outlet_id,id) ON DELETE RESTRICT,
 FOREIGN KEY(tenant_id,menu_item_id) REFERENCES menu_items(tenant_id,id) ON DELETE RESTRICT,
 UNIQUE(tenant_id,outlet_id,id)
);
CREATE INDEX idx_order_items_kds ON order_items(tenant_id,outlet_id,destination,cooking_status,created_at) WHERE cooking_status NOT IN ('handed_off','cancelled');
CREATE INDEX idx_order_items_session ON order_items(tenant_id,outlet_id,session_id,created_at);
CREATE TABLE order_item_modifiers (
 id UUID PRIMARY KEY DEFAULT gen_random_uuid(), tenant_id UUID NOT NULL, outlet_id UUID NOT NULL, order_item_id UUID NOT NULL,
 group_name_snapshot VARCHAR(100) NOT NULL, option_name_snapshot VARCHAR(100) NOT NULL, price_delta NUMERIC(14,2) NOT NULL DEFAULT 0,
 FOREIGN KEY(tenant_id,outlet_id,order_item_id) REFERENCES order_items(tenant_id,outlet_id,id) ON DELETE CASCADE
);
CREATE TABLE payment_allocations (
 id UUID PRIMARY KEY DEFAULT gen_random_uuid(), tenant_id UUID NOT NULL, outlet_id UUID NOT NULL, payment_id UUID NOT NULL,
 order_item_id UUID NOT NULL, amount NUMERIC(14,2) NOT NULL CHECK(amount>0), allocated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
 FOREIGN KEY(tenant_id,outlet_id,payment_id) REFERENCES payments(tenant_id,outlet_id,id) ON DELETE RESTRICT,
 FOREIGN KEY(tenant_id,outlet_id,order_item_id) REFERENCES order_items(tenant_id,outlet_id,id) ON DELETE RESTRICT,
 UNIQUE(tenant_id,outlet_id,payment_id,order_item_id)
);
CREATE TABLE inventory_movements (
 id UUID PRIMARY KEY DEFAULT gen_random_uuid(), tenant_id UUID NOT NULL, outlet_id UUID NOT NULL, inventory_item_id UUID NOT NULL,
 movement_type VARCHAR(20) NOT NULL CHECK(movement_type IN ('opening','purchase','sale','waste','adjustment','transfer_in','transfer_out','return')),
 quantity_delta NUMERIC(16,4) NOT NULL CHECK(quantity_delta<>0), unit_cost NUMERIC(14,2) NOT NULL DEFAULT 0 CHECK(unit_cost>=0),
 reference_type VARCHAR(32), reference_id UUID, note TEXT, created_by_staff_id UUID REFERENCES staff_accounts(id) ON DELETE SET NULL,
 created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
 FOREIGN KEY(tenant_id,outlet_id,inventory_item_id) REFERENCES inventory_items(tenant_id,outlet_id,id) ON DELETE RESTRICT
);
CREATE INDEX idx_inventory_ledger ON inventory_movements(tenant_id,outlet_id,inventory_item_id,created_at DESC);
CREATE TABLE audit_logs (
 id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY, tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE RESTRICT,
 outlet_id UUID, actor_staff_id UUID REFERENCES staff_accounts(id) ON DELETE SET NULL, action VARCHAR(80) NOT NULL,
 entity_type VARCHAR(80) NOT NULL, entity_id TEXT, request_id UUID, ip_address INET, user_agent TEXT,
 before_data JSONB, after_data JSONB, metadata JSONB NOT NULL DEFAULT '{}'::jsonb, created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
 FOREIGN KEY(tenant_id,outlet_id) REFERENCES outlets(tenant_id,id) ON DELETE RESTRICT
);
CREATE INDEX idx_audit_tenant_time ON audit_logs(tenant_id,created_at DESC);
CREATE INDEX idx_audit_outlet_time ON audit_logs(tenant_id,outlet_id,created_at DESC);
CREATE TABLE outbox_events (
 id UUID PRIMARY KEY DEFAULT gen_random_uuid(), tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE RESTRICT,
 outlet_id UUID, aggregate_type VARCHAR(80) NOT NULL, aggregate_id UUID NOT NULL, event_type VARCHAR(100) NOT NULL,
 payload JSONB NOT NULL, occurred_at TIMESTAMPTZ NOT NULL DEFAULT now(), published_at TIMESTAMPTZ,
 attempts INTEGER NOT NULL DEFAULT 0 CHECK(attempts>=0), last_error TEXT,
 FOREIGN KEY(tenant_id,outlet_id) REFERENCES outlets(tenant_id,id) ON DELETE RESTRICT
);
CREATE INDEX idx_outbox_pending ON outbox_events(occurred_at) WHERE published_at IS NULL;
CREATE TABLE idempotency_keys (
 tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE, outlet_id UUID NOT NULL, key VARCHAR(128) NOT NULL,
 operation VARCHAR(80) NOT NULL, response_status SMALLINT, response_body JSONB, created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
 expires_at TIMESTAMPTZ NOT NULL DEFAULT(now()+interval '24 hours'), PRIMARY KEY(tenant_id,outlet_id,key),
 FOREIGN KEY(tenant_id,outlet_id) REFERENCES outlets(tenant_id,id) ON DELETE CASCADE
);
CREATE INDEX idx_idempotency_expiry ON idempotency_keys(expires_at);

CREATE FUNCTION reject_audit_log_mutation() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN RAISE EXCEPTION 'audit_logs is append-only'; END;
$$;
CREATE TRIGGER trg_audit_logs_immutable BEFORE UPDATE OR DELETE ON audit_logs
FOR EACH ROW EXECUTE FUNCTION reject_audit_log_mutation();

CREATE VIEW v_table_board AS
SELECT t.tenant_id,t.outlet_id,t.id AS table_id,t.table_code,t.display_name,t.area,t.capacity,t.is_active,
 CASE WHEN s.status='billing' THEN 'billing' WHEN s.status='active' THEN 'occupied' ELSE 'available' END AS table_state,
 s.id AS session_id,s.session_number,s.guest_count,s.opened_at,s.waiter_staff_id,s.version AS session_version
FROM dining_tables t LEFT JOIN dining_sessions s
 ON s.tenant_id=t.tenant_id AND s.outlet_id=t.outlet_id AND s.table_id=t.id AND s.status IN ('active','billing');

-- Tables with outlet_id use tenant + outlet RLS scope.
DO $$
DECLARE tbl TEXT;
BEGIN
 FOREACH tbl IN ARRAY ARRAY['outlet_memberships','outlet_settings','dining_tables','reservations','dining_sessions',
 'menu_items','recipes','inventory_items','order_batches','payments','order_items','order_item_modifiers',
 'payment_allocations','inventory_movements','audit_logs','outbox_events','idempotency_keys']
 LOOP
  EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY',tbl);
  EXECUTE format('CREATE POLICY tenant_outlet_isolation ON %I USING (tenant_id=nullif(current_setting(''app.tenant_id'',true),'''')::uuid AND (outlet_id IS NULL OR outlet_id=nullif(current_setting(''app.outlet_id'',true),'''')::uuid)) WITH CHECK (tenant_id=nullif(current_setting(''app.tenant_id'',true),'''')::uuid AND (outlet_id IS NULL OR outlet_id=nullif(current_setting(''app.outlet_id'',true),'''')::uuid))',tbl);
 END LOOP;
 FOREACH tbl IN ARRAY ARRAY['outlets','tenant_memberships','tenant_settings','menu_categories','modifier_groups','modifier_options','recipe_lines']
 LOOP
  EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY',tbl);
  EXECUTE format('CREATE POLICY tenant_isolation ON %I USING (tenant_id=nullif(current_setting(''app.tenant_id'',true),'''')::uuid) WITH CHECK (tenant_id=nullif(current_setting(''app.tenant_id'',true),'''')::uuid)',tbl);
 END LOOP;
 ALTER TABLE tenants ENABLE ROW LEVEL SECURITY;
 CREATE POLICY tenant_self_scope ON tenants USING(id=nullif(current_setting('app.tenant_id',true),'')::uuid)
 WITH CHECK(id=nullif(current_setting('app.tenant_id',true),'')::uuid);
END $$;
COMMIT;
