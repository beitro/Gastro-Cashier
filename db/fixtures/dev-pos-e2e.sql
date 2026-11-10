-- Development-only POS E2E fixtures.
-- Guarded to the isolated CI tenant on the gastro-test-seed Neon branch.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM public.tenants t
    JOIN public.outlets o ON o.tenant_id=t.id
    WHERE t.slug='gastro-ci-test-20261110' AND o.slug='ci-test-outlet'
  ) THEN
    RAISE EXCEPTION 'Refusing to seed: expected isolated gastro CI tenant/outlet was not found';
  END IF;
END $$;

WITH target AS (
  SELECT t.id AS tenant_id, o.id AS outlet_id
  FROM public.tenants t JOIN public.outlets o ON o.tenant_id=t.id
  WHERE t.slug='gastro-ci-test-20261110' AND o.slug='ci-test-outlet'
),
categories(code,name,sort_order) AS (
  VALUES ('makanan','makanan',1),('minuman','minuman',2),('snack','snack',3),('dessert','dessert',4)
)
INSERT INTO public.menu_categories(tenant_id,code,name,sort_order)
SELECT target.tenant_id,categories.code,categories.name,categories.sort_order
FROM target CROSS JOIN categories
ON CONFLICT DO NOTHING;

WITH target AS (
  SELECT t.id AS tenant_id, o.id AS outlet_id
  FROM public.tenants t JOIN public.outlets o ON o.tenant_id=t.id
  WHERE t.slug='gastro-ci-test-20261110' AND o.slug='ci-test-outlet'
),
items(sku,name,category,destination,price,cost_price,sort_order) AS (
  VALUES
    ('food-1','Nasi Goreng Spesial Resto','makanan','kitchen',38000,13200,1),
    ('food-2','Ayam Bakar Madu Pedas','makanan','kitchen',42000,16500,2),
    ('food-3','Bebek Goreng Serundeng Gurih','makanan','kitchen',48000,24000,3),
    ('food-4','Gurame Bakar Jimbaran (Porsi 2-3 Org)','makanan','kitchen',85000,38000,4),
    ('food-5','Sate Ayam Madura (10 Tusuk)','makanan','kitchen',36000,14500,5),
    ('food-6','Sop Buntut Sapi Kuah Hangat','makanan','kitchen',72000,35000,6),
    ('food-7','Mie Goreng Seafood Wok','makanan','kitchen',39000,15000,7),
    ('food-8','Tumis Kangkung Belacan Hotplate','makanan','kitchen',24000,6500,8),
    ('bev-1','Es Teh Manis Jasmine','minuman','bar',9000,1200,9),
    ('bev-2','Es Jeruk Peras Murni','minuman','bar',18000,5500,10),
    ('bev-3','Kopi Susu Gula Aren Barista','minuman','bar',24000,6800,11),
    ('bev-4','Jus Alpukat Kerok Saus Cokelat','minuman','bar',26000,9000,12),
    ('bev-5','Lychee Iced Tea with Real Fruit','minuman','bar',22000,6000,13),
    ('bev-6','Wedang Jahe Susu Rempah','minuman','bar',20000,5000,14),
    ('snack-1','Pisang Goreng Keju Cokelat','snack','kitchen',22000,6500,15),
    ('snack-2','Tahu Cabe Garam Crispy','snack','kitchen',20000,4500,16),
    ('snack-3','Singkong Keju Sambal Roa Manado','snack','kitchen',24000,6000,17),
    ('dessert-1','Es Cendol Durian Legit','dessert','bar',28000,11000,18)
)
INSERT INTO public.menu_items(tenant_id,outlet_id,category_id,sku,name,destination,price,cost_price,sort_order,is_available)
SELECT target.tenant_id,target.outlet_id,mc.id,items.sku,items.name,items.destination,items.price,items.cost_price,items.sort_order,true
FROM target CROSS JOIN items
JOIN public.menu_categories mc ON mc.tenant_id=target.tenant_id AND mc.code=items.category
ON CONFLICT DO NOTHING;

WITH target AS (
  SELECT t.id AS tenant_id, o.id AS outlet_id
  FROM public.tenants t JOIN public.outlets o ON o.tenant_id=t.id
  WHERE t.slug='gastro-ci-test-20261110' AND o.slug='ci-test-outlet'
),
tables(table_code,display_name,area,capacity,sort_order) AS (
  VALUES
    ('01','Meja 01','indoor',2,1),
    ('02','Meja 02','indoor',4,2),
    ('03','Meja 03','indoor',4,3),
    ('04','Meja 04','indoor',6,4),
    ('19','Meja 19','outdoor',4,5),
    ('VIP-1','VIP 1','vip',8,6)
)
INSERT INTO public.dining_tables(tenant_id,outlet_id,table_code,display_name,area,capacity,sort_order,is_active)
SELECT target.tenant_id,target.outlet_id,tables.table_code,tables.display_name,tables.area,tables.capacity,tables.sort_order,true
FROM target CROSS JOIN tables
ON CONFLICT DO NOTHING;

UPDATE public.tenant_settings ts
SET service_charge_rate=0.05,tax_rate=0.10,default_payment_flow='payment_last',updated_at=now()
FROM public.tenants t
WHERE ts.tenant_id=t.id AND t.slug='gastro-ci-test-20261110';

UPDATE public.outlet_settings os
SET service_charge_rate=0.05,tax_rate=0.10,updated_at=now()
FROM public.tenants t JOIN public.outlets o ON o.tenant_id=t.id
WHERE os.tenant_id=t.id AND os.outlet_id=o.id
  AND t.slug='gastro-ci-test-20261110' AND o.slug='ci-test-outlet';
