-- Migration 009: Full Capability Inventory Enhancement
-- 1. Multi-UoM & Conversion Ratio (Purchase Unit to Recipe Unit)
-- 2. Receipt Attachment / Photo Proof URL
-- 3. Barcode / Quick Scan indexing & tracking
BEGIN;

-- 1. Tambah kolom UoM Konversi dan Attachment Bukti Foto pada Inventory Receipts & Items
ALTER TABLE public.inventory_items
  ADD COLUMN IF NOT EXISTS purchase_unit VARCHAR(32),
  ADD COLUMN IF NOT EXISTS conversion_ratio NUMERIC(12,4) DEFAULT 1.0 CHECK (conversion_ratio > 0);

ALTER TABLE public.inventory_receipts
  ADD COLUMN IF NOT EXISTS attachment_url TEXT,
  ADD COLUMN IF NOT EXISTS attachment_mime VARCHAR(64);

-- 2. Tambah kolom purchase_unit & conversion_ratio pada inventory_movements (agar riwayat unit beli tercatat rapi)
ALTER TABLE public.inventory_movements
  ADD COLUMN IF NOT EXISTS purchase_unit VARCHAR(32),
  ADD COLUMN IF NOT EXISTS purchase_quantity NUMERIC(16,4),
  ADD COLUMN IF NOT EXISTS conversion_ratio NUMERIC(12,4) DEFAULT 1.0;

-- 3. Index pencarian barcode untuk kecepatan quick scan via kamera/scanner USB
CREATE INDEX IF NOT EXISTS idx_inventory_items_barcode_scan 
  ON public.inventory_items(tenant_id, outlet_id, barcode) 
  WHERE barcode IS NOT NULL;

COMMIT;
