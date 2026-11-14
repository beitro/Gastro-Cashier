import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  AlertTriangle,
  Boxes,
  CheckCircle2,
  ClipboardCheck,
  ChefHat,
  FilePlus2,
  History,
  Layers,
  PackagePlus,
  Plus,
  RefreshCw,
  Save,
  Search,
  Settings,
  Sliders,
  Trash2,
  Truck,
  UtensilsCrossed,
  XCircle,
} from 'lucide-react';
import { MenuItem, RawMaterial, StaffAccount } from '../types/pos';
import { getApiToken } from '../services/posApi';
import {
  AdminMenuItem,
  InventoryItem,
  InventoryMovement,
  InventorySummary,
  MenuCategory,
  ReceiptLineInput,
  ReceiptSummary,
  Recipe,
  StockStatus,
  StockTakeLine,
  StockTakeSummary,
  Supplier,
  SystemSettings,
  inventoryApi,
  menuAdminApi,
  newIdempotencyKey,
  settingsApi,
} from '../services/inventoryApi';
import { formatRupiah } from '../utils/posCalculations';

const computeStockStatus = (qty: number, reorder: number): StockStatus =>
  qty <= 0 ? 'out' : qty <= reorder ? 'low' : 'ok';

export type WorkspaceSection =
  | 'receipt'
  | 'stock_take'
  | 'waste'
  | 'admin_stock'
  | 'suppliers'
  | 'ledger'
  | 'menu_admin'
  | 'app_settings';

interface InventoryWorkspaceViewProps {
  currentStaff: StaffAccount;
  initialSection?: WorkspaceSection;
  localMaterials: RawMaterial[];
  onSyncLocalMaterials?: (next: RawMaterial[]) => void;
  localMenuItems?: MenuItem[];
  localMenuStock?: Record<string, number>;
  onUpdateLocalMenuStock?: (menuId: string, qty: number) => void;
}

const STORAGE_LOCAL_INV_ITEMS = 'gastro_inv_items_v1';
const STORAGE_LOCAL_INV_MOVEMENTS = 'gastro_inv_movements_v1';
const STORAGE_LOCAL_INV_RECEIPTS = 'gastro_inv_receipts_v1';
const STORAGE_LOCAL_INV_SUPPLIERS = 'gastro_inv_suppliers_v1';
const STORAGE_LOCAL_INV_TAKES = 'gastro_inv_takes_v1';
const STORAGE_LOCAL_ADMIN_MENU = 'gastro_admin_menu_v1';
const STORAGE_LOCAL_SETTINGS = 'gastro_system_settings_v1';

const DEFAULT_ZONES = ['Dry Storage', 'Walk-in Chiller', 'Deep Freezer', 'Bar Station'];
const DEFAULT_UNITS = ['kg', 'gram', 'liter', 'ml', 'butir', 'pcs', 'ikat', 'ekor', 'pack', 'kaleng'];

const DEFAULT_SETTINGS: SystemSettings = {
  tenant: {
    serviceChargeRate: 0.05,
    taxRate: 0.1,
    serviceInTaxBase: true,
    defaultPaymentFlow: 'payment_last',
  },
  outlet: { serviceChargeRate: null, taxRate: null },
  effective: { serviceChargeRate: 0.05, taxRate: 0.1 },
  inventory: {
    deductIngredients: true,
    negativeStockPolicy: 'allow',
    costingMethod: 'weighted_average',
    lowStockAlerts: true,
    expiryWarningDays: 7,
    stockTakeRequiresApproval: true,
    staffCanCreateItems: true,
    maxReceiptBackdateDays: 7,
  },
  app: {
    restaurantName: 'Resto Nusantara',
    receiptFooter: 'Terima kasih atas kunjungan Anda',
    receiptShowTax: true,
    autoPrintReceipt: false,
    soundEnabled: true,
    locale: 'id-ID',
  },
};

function seedItemsFromRawMaterials(materials: RawMaterial[]): InventoryItem[] {
  try {
    const raw = localStorage.getItem(STORAGE_LOCAL_INV_ITEMS);
    if (raw) return JSON.parse(raw) as InventoryItem[];
  } catch {}
  return materials.map((m, idx) => {
    const qty = Number(m.currentStock || 0);
    const reorder = Number(m.minStock || 0);
    const avg = Number(m.costPerUnit || 0);
    return {
      id: m.id,
      sku: `SKU-${String(idx + 1).padStart(3, '0')}`,
      name: m.name,
      unitCode: m.unit,
      category: m.storageZone,
      barcode: null,
      storageZone: m.storageZone,
      currentQuantity: qty,
      reorderLevel: reorder,
      maxLevel: reorder > 0 ? reorder * 5 : 100,
      averageUnitCost: avg,
      lastPurchaseCost: avg,
      stockValue: Math.round(qty * avg),
      defaultSupplierId: null,
      isActive: true,
      status: qty <= 0 ? 'out' : qty <= reorder ? 'low' : 'ok',
      nextExpiry: null,
    };
  });
}

export const InventoryWorkspaceView: React.FC<InventoryWorkspaceViewProps> = ({
  currentStaff,
  initialSection,
  localMaterials,
  onSyncLocalMaterials,
  localMenuItems = [],
  localMenuStock = {},
  onUpdateLocalMenuStock,
}) => {
  const isManagerOrOwner = currentStaff.role === 'owner' || currentStaff.role === 'manager';
  const isOwner = currentStaff.role === 'owner';
  const canWriteInventory =
    currentStaff.role === 'owner' ||
    currentStaff.role === 'manager' ||
    currentStaff.role === 'inventory';

  const defaultTab: WorkspaceSection =
    initialSection || (isManagerOrOwner ? 'admin_stock' : 'receipt');
  const [section, setSection] = useState<WorkspaceSection>(defaultTab);

  useEffect(() => {
    if (initialSection) setSection(initialSection);
  }, [initialSection]);

  const [isOnlineApi, setIsOnlineApi] = useState<boolean>(() => Boolean(getApiToken()));
  const [loading, setLoading] = useState<boolean>(false);
  const [banner, setBanner] = useState<{ type: 'ok' | 'err'; text: string } | null>(null);

  // Core state
  const [items, setItems] = useState<InventoryItem[]>(() =>
    seedItemsFromRawMaterials(localMaterials)
  );
  const [suppliers, setSuppliers] = useState<Supplier[]>(() => {
    try {
      const saved = localStorage.getItem(STORAGE_LOCAL_INV_SUPPLIERS);
      if (saved) return JSON.parse(saved);
    } catch {}
    return [
      {
        id: 'sup-local-1',
        name: 'PT Pangan Nusantara Segar',
        contactName: 'Hendra Wijaya',
        phone: '0812-8800-1122',
        email: 'order@pangannusantara.co.id',
        address: 'Jl. Industri Raya No. 18, Jakarta',
        note: 'Supplier utama daging & sayur segar',
        isActive: true,
      },
      {
        id: 'sup-local-2',
        name: 'CV Sembako Makmur Jaya',
        contactName: 'Siti Rahma',
        phone: '0813-9900-3344',
        email: 'sales@sembakomakmur.id',
        address: 'Pasar Induk Kramat Jati Blok B2',
        note: 'Beras, tepung, minyak, bumbu kering',
        isActive: true,
      },
    ];
  });
  const [receipts, setReceipts] = useState<ReceiptSummary[]>(() => {
    try {
      const saved = localStorage.getItem(STORAGE_LOCAL_INV_RECEIPTS);
      if (saved) return JSON.parse(saved);
    } catch {}
    return [];
  });
  const [movements, setMovements] = useState<InventoryMovement[]>(() => {
    try {
      const saved = localStorage.getItem(STORAGE_LOCAL_INV_MOVEMENTS);
      if (saved) return JSON.parse(saved);
    } catch {}
    return [];
  });
  const [stockTakes, setStockTakes] = useState<StockTakeSummary[]>(() => {
    try {
      const saved = localStorage.getItem(STORAGE_LOCAL_INV_TAKES);
      if (saved) return JSON.parse(saved);
    } catch {}
    return [];
  });
  const [localTakeLines, setLocalTakeLines] = useState<Record<string, StockTakeLine[]>>({});
  const [summary, setSummary] = useState<InventorySummary | null>(null);

  // Menu & Settings state
  const [categories, setCategories] = useState<MenuCategory[]>([
    { id: 'cat-makanan', code: 'makanan', name: 'Makanan', sortOrder: 1, isActive: true },
    { id: 'cat-minuman', code: 'minuman', name: 'Minuman', sortOrder: 2, isActive: true },
    { id: 'cat-snack', code: 'snack', name: 'Snack', sortOrder: 3, isActive: true },
    { id: 'cat-dessert', code: 'dessert', name: 'Dessert', sortOrder: 4, isActive: true },
  ]);
  const [adminMenus, setAdminMenus] = useState<AdminMenuItem[]>(() => {
    try {
      const saved = localStorage.getItem(STORAGE_LOCAL_ADMIN_MENU);
      if (saved) return JSON.parse(saved);
    } catch {}
    return localMenuItems.map((m, idx) => {
      const stockQty = localMenuStock[m.id] ?? m.stock ?? 25;
      const margin = m.price > 0 ? Number((((m.price - m.cost) / m.price) * 100).toFixed(1)) : 0;
      return {
        id: m.id,
        sku: `MNU-${String(idx + 1).padStart(3, '0')}`,
        name: m.name,
        description: m.description || null,
        destination: m.destination,
        price: m.price,
        costPrice: m.cost,
        imageUrl: m.image || null,
        categoryId: `cat-${m.category}`,
        categoryName: m.category.toUpperCase(),
        isAvailable: stockQty > 0,
        sortOrder: idx + 1,
        scope: 'tenant',
        trackStock: true,
        stockQuantity: stockQty,
        hasRecipe: Boolean(m.recipe && m.recipe.length > 0),
        recipeCost: m.cost,
        marginPercent: margin,
      };
    });
  });
  const [settings, setSettings] = useState<SystemSettings>(() => {
    try {
      const saved = localStorage.getItem(STORAGE_LOCAL_SETTINGS);
      if (saved) return JSON.parse(saved);
    } catch {}
    return DEFAULT_SETTINGS;
  });

  const notify = (type: 'ok' | 'err', text: string) => {
    setBanner({ type, text });
    setTimeout(() => {
      setBanner((prev) => (prev?.text === text ? null : prev));
    }, 5000);
  };

  // Persist local fallback state & keep App rawMaterials in sync
  const persistLocalInventory = useCallback(
    (
      nextItems: InventoryItem[],
      nextMovements?: InventoryMovement[],
      nextReceipts?: ReceiptSummary[],
      nextTakes?: StockTakeSummary[],
      nextSuppliers?: Supplier[]
    ) => {
      setItems(nextItems);
      try {
        localStorage.setItem(STORAGE_LOCAL_INV_ITEMS, JSON.stringify(nextItems));
        if (nextMovements)
          localStorage.setItem(STORAGE_LOCAL_INV_MOVEMENTS, JSON.stringify(nextMovements));
        if (nextReceipts)
          localStorage.setItem(STORAGE_LOCAL_INV_RECEIPTS, JSON.stringify(nextReceipts));
        if (nextTakes) localStorage.setItem(STORAGE_LOCAL_INV_TAKES, JSON.stringify(nextTakes));
        if (nextSuppliers)
          localStorage.setItem(STORAGE_LOCAL_INV_SUPPLIERS, JSON.stringify(nextSuppliers));
      } catch {}

      if (onSyncLocalMaterials) {
        const mapped: RawMaterial[] = nextItems
          .filter((i) => i.isActive)
          .map((i) => ({
            id: i.id,
            name: i.name,
            unit: i.unitCode,
            currentStock: i.currentQuantity,
            minStock: i.reorderLevel,
            costPerUnit: Math.round(i.averageUnitCost),
            storageZone: (DEFAULT_ZONES.includes(i.storageZone || '')
              ? i.storageZone
              : 'Dry Storage') as RawMaterial['storageZone'],
          }));
        onSyncLocalMaterials(mapped);
      }
    },
    [onSyncLocalMaterials]
  );

  // Load from Neon API when token exists
  const refreshAll = useCallback(async () => {
    const hasToken = Boolean(getApiToken());
    setIsOnlineApi(hasToken);
    if (!hasToken) return;

    setLoading(true);
    try {
      const [apiItems, apiSuppliers, apiReceipts, apiMoves, apiTakes, apiSummary, apiSettings] =
        await Promise.all([
          inventoryApi.items({ includeInactive: isManagerOrOwner }),
          inventoryApi.suppliers(),
          inventoryApi.receipts(),
          inventoryApi.movements({ limit: 150 }),
          inventoryApi.stockTakes(),
          inventoryApi.summary(),
          settingsApi.get().catch(() => null),
        ]);
      setItems(apiItems);
      setSuppliers(apiSuppliers);
      setReceipts(apiReceipts);
      setMovements(apiMoves);
      setStockTakes(apiTakes);
      setSummary(apiSummary);
      if (apiSettings) setSettings(apiSettings);

      if (isManagerOrOwner) {
        const [apiMenus, apiCats] = await Promise.all([
          menuAdminApi.list().catch(() => []),
          menuAdminApi.categories().catch(() => []),
        ]);
        if (apiMenus.length) setAdminMenus(apiMenus);
        if (apiCats.length) setCategories(apiCats);
      }
    } catch (err: any) {
      notify('err', err?.message || 'Gagal memuat data inventaris dari server Neon.');
    } finally {
      setLoading(false);
    }
  }, [isManagerOrOwner]);

  useEffect(() => {
    void refreshAll();
  }, [refreshAll]);

  // Derived summary when offline or before summary loads
  const computedSummary: InventorySummary = useMemo(() => {
    if (summary && isOnlineApi) return summary;
    const active = items.filter((i) => i.isActive);
    const stockValue = active.reduce((acc, i) => acc + i.currentQuantity * i.averageUnitCost, 0);
    const outOfStock = active.filter((i) => i.currentQuantity <= 0).length;
    const lowStockList = active.filter(
      (i) => i.currentQuantity > 0 && i.currentQuantity <= i.reorderLevel
    );
    const zoneMap = new Map<string, { items: number; value: number }>();
    for (const i of active) {
      const z = i.storageZone || 'Tanpa Zona';
      const cur = zoneMap.get(z) || { items: 0, value: 0 };
      cur.items += 1;
      cur.value += i.currentQuantity * i.averageUnitCost;
      zoneMap.set(z, cur);
    }
    const purchases = movements
      .filter((m) => m.type === 'purchase')
      .reduce((acc, m) => acc + Number(m.totalValue || 0), 0);
    const waste = movements
      .filter((m) => m.type === 'waste')
      .reduce((acc, m) => acc + Number(m.totalValue || 0), 0);
    const usage = movements
      .filter((m) => m.type === 'sale')
      .reduce((acc, m) => acc + Number(m.totalValue || 0), 0);
    return {
      totals: {
        items: active.length,
        stockValue: Math.round(stockValue),
        outOfStock,
        lowStock: lowStockList.length,
      },
      byZone: Array.from(zoneMap.entries()).map(([zone, v]) => ({
        zone,
        items: v.items,
        value: Math.round(v.value),
      })),
      lowStock: active.filter((i) => i.currentQuantity <= i.reorderLevel),
      expiringLots: [],
      month: {
        purchases: Math.round(purchases),
        waste: Math.round(waste),
        ingredientUsage: Math.round(usage),
      },
      pendingStockTakes: stockTakes.filter((t) => t.status === 'submitted').length,
      expiryWarningDays: settings.inventory.expiryWarningDays,
    };
  }, [summary, isOnlineApi, items, movements, stockTakes, settings.inventory.expiryWarningDays]);

  // ============================================================================
  // 1. GOODS RECEIPT (STAFF INPUT STOK: JUMLAH + VALUE)
  // ============================================================================
  interface DraftReceiptRow {
    rowId: string;
    itemId: string;
    quantity: string;
    pricingMode: 'unit' | 'total';
    unitCost: string;
    totalValue: string;
    expiryDate: string;
    lotNo: string;
    note: string;
  }

  const createEmptyReceiptRow = (firstItemId = ''): DraftReceiptRow => ({
    rowId: 'r-' + Math.random().toString(36).slice(2, 9),
    itemId: firstItemId,
    quantity: '',
    pricingMode: 'total',
    unitCost: '',
    totalValue: '',
    expiryDate: '',
    lotNo: '',
    note: '',
  });

  const [rcSupplierId, setRcSupplierId] = useState<string>('');
  const [rcInvoiceNo, setRcInvoiceNo] = useState<string>('');
  const [rcNote, setRcNote] = useState<string>('');
  const [rcRows, setRcRows] = useState<DraftReceiptRow[]>(() => [
    createEmptyReceiptRow(items[0]?.id || ''),
  ]);

  const updateReceiptRow = (rowId: string, patch: Partial<DraftReceiptRow>) => {
    setRcRows((prev) =>
      prev.map((r) => {
        if (r.rowId !== rowId) return r;
        const next = { ...r, ...patch };
        const qty = parseFloat(next.quantity);
        if (Number.isFinite(qty) && qty > 0) {
          if (next.pricingMode === 'total' && patch.totalValue !== undefined) {
            const tv = parseFloat(next.totalValue);
            next.unitCost = Number.isFinite(tv) && tv >= 0 ? String(Math.round((tv / qty) * 100) / 100) : '';
          } else if (next.pricingMode === 'unit' && patch.unitCost !== undefined) {
            const uc = parseFloat(next.unitCost);
            next.totalValue = Number.isFinite(uc) && uc >= 0 ? String(Math.round(uc * qty)) : '';
          } else if (patch.quantity !== undefined) {
            if (next.pricingMode === 'total') {
              const tv = parseFloat(next.totalValue);
              if (Number.isFinite(tv) && tv >= 0) {
                next.unitCost = String(Math.round((tv / qty) * 100) / 100);
              }
            } else {
              const uc = parseFloat(next.unitCost);
              if (Number.isFinite(uc) && uc >= 0) {
                next.totalValue = String(Math.round(uc * qty));
              }
            }
          }
        }
        return next;
      })
    );
  };

  const receiptGrandTotal = useMemo(() => {
    return rcRows.reduce((acc, r) => {
      const qty = parseFloat(r.quantity);
      const tv = parseFloat(r.totalValue);
      const uc = parseFloat(r.unitCost);
      if (!Number.isFinite(qty) || qty <= 0) return acc;
      if (r.pricingMode === 'total' && Number.isFinite(tv) && tv >= 0) return acc + tv;
      if (r.pricingMode === 'unit' && Number.isFinite(uc) && uc >= 0) return acc + qty * uc;
      return acc;
    }, 0);
  }, [rcRows]);

  const handleSubmitReceipt = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!canWriteInventory) {
      notify('err', 'Role Anda tidak memiliki izin untuk menginput penerimaan barang.');
      return;
    }

    const lines: ReceiptLineInput[] = [];
    for (const r of rcRows) {
      const qty = parseFloat(r.quantity);
      if (!r.itemId || !Number.isFinite(qty) || qty <= 0) {
        notify('err', 'Pastikan setiap baris memiliki bahan baku dan jumlah (Quantity > 0).');
        return;
      }
      if (r.pricingMode === 'total') {
        const tv = parseFloat(r.totalValue);
        if (!Number.isFinite(tv) || tv < 0) {
          notify('err', 'Masukkan Total Nilai Belanja (Rp) yang valid pada setiap baris.');
          return;
        }
        lines.push({
          itemId: r.itemId,
          quantity: qty,
          totalValue: tv,
          expiryDate: r.expiryDate || undefined,
          lotNo: r.lotNo || undefined,
          note: r.note || undefined,
        });
      } else {
        const uc = parseFloat(r.unitCost);
        if (!Number.isFinite(uc) || uc < 0) {
          notify('err', 'Masukkan Harga Satuan (Rp) yang valid pada setiap baris.');
          return;
        }
        lines.push({
          itemId: r.itemId,
          quantity: qty,
          unitCost: uc,
          expiryDate: r.expiryDate || undefined,
          lotNo: r.lotNo || undefined,
          note: r.note || undefined,
        });
      }
    }

    setLoading(true);
    try {
      if (isOnlineApi) {
        const res = await inventoryApi.postReceipt({
          idempotencyKey: newIdempotencyKey('rcpt'),
          supplierId: rcSupplierId || undefined,
          invoiceNo: rcInvoiceNo.trim() || undefined,
          note: rcNote.trim() || undefined,
          lines,
        });
        notify(
          'ok',
          `Penerimaan ${res.receipt.receipt_number} berhasil disimpan ke Neon (${formatRupiah(
            Number(res.receipt.total_value)
          )}).`
        );
        await refreshAll();
      } else {
        // Local weighted-average update
        const now = new Date().toISOString();
        const receiptNo = 'GR-' + now.replace(/[-:TZ.]/g, '').slice(0, 12);
        let totalVal = 0;
        const newMoves: InventoryMovement[] = [];
        const nextItems = items.map((item) => {
          const matching = lines.filter((l) => l.itemId === item.id);
          if (!matching.length) return item;
          let curQty = item.currentQuantity;
          let curAvg = item.averageUnitCost;
          let lastCost = item.lastPurchaseCost;
          for (const l of matching) {
            const lineTotal =
              l.totalValue !== undefined ? l.totalValue : Number(l.unitCost || 0) * l.quantity;
            const unitCost = l.quantity > 0 ? lineTotal / l.quantity : 0;
            const nextQty = Number((curQty + l.quantity).toFixed(4));
            const nextAvg =
              curQty > 0
                ? Number(((curQty * curAvg + l.quantity * unitCost) / nextQty).toFixed(4))
                : Number(unitCost.toFixed(4));
            curQty = nextQty;
            curAvg = nextAvg;
            lastCost = Number(unitCost.toFixed(4));
            totalVal += lineTotal;
            newMoves.push({
              id: 'mv-' + Math.random().toString(36).slice(2, 10),
              itemId: item.id,
              itemName: item.name,
              unitCode: item.unitCode,
              type: 'purchase',
              quantityDelta: l.quantity,
              unitCost: lastCost,
              totalValue: Math.round(lineTotal),
              balanceAfter: curQty,
              referenceType: 'receipt',
              referenceId: receiptNo,
              invoiceNo: rcInvoiceNo.trim() || null,
              expiryDate: l.expiryDate || null,
              supplierId: rcSupplierId || null,
              note: l.note || rcNote.trim() || 'Penerimaan barang gudang',
              createdBy: currentStaff.name,
              createdAt: now,
            });
          }
          return {
            ...item,
            currentQuantity: curQty,
            averageUnitCost: curAvg,
            lastPurchaseCost: lastCost,
            stockValue: Math.round(curQty * curAvg),
            status: computeStockStatus(curQty, item.reorderLevel),
          };
        });
        const supName = suppliers.find((s) => s.id === rcSupplierId)?.name || null;
        const newReceipt: ReceiptSummary = {
          id: receiptNo,
          receiptNumber: receiptNo,
          supplierId: rcSupplierId || null,
          supplierName: supName,
          invoiceNo: rcInvoiceNo.trim() || null,
          receivedAt: now,
          totalValue: Math.round(totalVal),
          lineCount: lines.length,
          note: rcNote.trim() || null,
          createdBy: currentStaff.name,
        };
        const nextReceipts = [newReceipt, ...receipts];
        const nextMoves = [...newMoves, ...movements];
        setReceipts(nextReceipts);
        setMovements(nextMoves);
        persistLocalInventory(nextItems, nextMoves, nextReceipts);
        notify(
          'ok',
          `Penerimaan ${receiptNo} tersimpan (${lines.length} item · Total ${formatRupiah(
            Math.round(totalVal)
          )}). HPP Rata-rata (WAC) diperbarui.`
        );
      }
      setRcInvoiceNo('');
      setRcNote('');
      setRcRows([createEmptyReceiptRow(items[0]?.id || '')]);
    } catch (err: any) {
      notify('err', err?.message || 'Gagal menyimpan penerimaan barang.');
    } finally {
      setLoading(false);
    }
  };

  // ============================================================================
  // 2. WASTE / SPOILAGE
  // ============================================================================
  const [wasteItemId, setWasteItemId] = useState<string>('');
  const [wasteQty, setWasteQty] = useState<string>('');
  const [wasteReason, setWasteReason] = useState<string>('');

  const selectedWasteItem = useMemo(
    () => items.find((i) => i.id === (wasteItemId || items[0]?.id)),
    [items, wasteItemId]
  );

  const handleRecordWaste = async (e: React.FormEvent) => {
    e.preventDefault();
    const targetItem = selectedWasteItem;
    const qty = parseFloat(wasteQty);
    if (!targetItem || !Number.isFinite(qty) || qty <= 0 || wasteReason.trim().length < 3) {
      notify('err', 'Pilih bahan, masukkan jumlah > 0, dan alasan minimal 3 karakter.');
      return;
    }
    if (qty > targetItem.currentQuantity) {
      notify('err', `Stok ${targetItem.name} hanya tersisa ${targetItem.currentQuantity} ${targetItem.unitCode}.`);
      return;
    }

    setLoading(true);
    try {
      if (isOnlineApi) {
        const mv = await inventoryApi.recordWaste({
          itemId: targetItem.id,
          quantity: qty,
          reason: wasteReason.trim(),
        });
        notify(
          'ok',
          `Waste ${targetItem.name} (-${qty} ${targetItem.unitCode} · ${formatRupiah(
            Number(mv.totalValue || 0)
          )}) tercatat.`
        );
        await refreshAll();
      } else {
        const now = new Date().toISOString();
        const lossVal = Math.round(qty * targetItem.averageUnitCost);
        const nextQty = Number((targetItem.currentQuantity - qty).toFixed(4));
        const mv: InventoryMovement = {
          id: 'mv-' + Math.random().toString(36).slice(2, 10),
          itemId: targetItem.id,
          itemName: targetItem.name,
          unitCode: targetItem.unitCode,
          type: 'waste',
          quantityDelta: -qty,
          unitCost: targetItem.averageUnitCost,
          totalValue: lossVal,
          balanceAfter: nextQty,
          referenceType: 'waste',
          referenceId: null,
          invoiceNo: null,
          expiryDate: null,
          supplierId: null,
          note: wasteReason.trim(),
          createdBy: currentStaff.name,
          createdAt: now,
        };
        const nextItems = items.map((i) =>
          i.id === targetItem.id
            ? {
                ...i,
                currentQuantity: nextQty,
                stockValue: Math.round(nextQty * i.averageUnitCost),
                status: computeStockStatus(nextQty, i.reorderLevel),
              }
            : i
        );
        const nextMoves = [mv, ...movements];
        setMovements(nextMoves);
        persistLocalInventory(nextItems, nextMoves);
        notify('ok', `Waste ${targetItem.name} (-${qty} ${targetItem.unitCode}) berhasil dicatat.`);
      }
      setWasteQty('');
      setWasteReason('');
    } catch (err: any) {
      notify('err', err?.message || 'Gagal mencatat waste.');
    } finally {
      setLoading(false);
    }
  };

  // ============================================================================
  // 3. STOCK OPNAME (PHYSICAL COUNT & MANAGER APPROVAL)
  // ============================================================================
  const [opnameZone, setOpnameZone] = useState<string>('all');
  const [opnameNote, setOpnameNote] = useState<string>('');
  const [countedMap, setCountedMap] = useState<Record<string, string>>({});
  const [inspectTakeId, setInspectTakeId] = useState<string | null>(null);
  const [inspectLines, setInspectLines] = useState<StockTakeLine[]>([]);

  const opnameCandidates = useMemo(() => {
    return items.filter(
      (i) => i.isActive && (opnameZone === 'all' || i.storageZone === opnameZone)
    );
  }, [items, opnameZone]);

  const handleSubmitStockTake = async (e: React.FormEvent) => {
    e.preventDefault();
    const lines: { itemId: string; countedQuantity: number }[] = [];
    for (const item of opnameCandidates) {
      const raw = countedMap[item.id];
      if (raw === undefined || raw.trim() === '') continue;
      const val = parseFloat(raw);
      if (!Number.isFinite(val) || val < 0) {
        notify('err', `Jumlah hitung fisik untuk ${item.name} tidak valid.`);
        return;
      }
      lines.push({ itemId: item.id, countedQuantity: val });
    }
    if (!lines.length) {
      notify('err', 'Isi minimal 1 hasil hitung fisik bahan baku untuk disubmit.');
      return;
    }

    setLoading(true);
    try {
      if (isOnlineApi) {
        const res = await inventoryApi.submitStockTake({
          storageZone: opnameZone === 'all' ? undefined : opnameZone,
          note: opnameNote.trim() || undefined,
          lines,
        });
        notify(
          'ok',
          `Stock Opname ${res.takeNumber} berhasil dikirim (Status: ${res.status.toUpperCase()}).`
        );
        setCountedMap({});
        setOpnameNote('');
        await refreshAll();
      } else {
        const now = new Date().toISOString();
        const takeNo = 'SO-' + now.replace(/[-:TZ.]/g, '').slice(0, 12);
        const detailLines: StockTakeLine[] = lines.map((l) => {
          const item = items.find((i) => i.id === l.itemId)!;
          const variance = Number((l.countedQuantity - item.currentQuantity).toFixed(4));
          const varVal = Math.round(variance * item.averageUnitCost);
          return {
            itemId: item.id,
            name: item.name,
            unitCode: item.unitCode,
            systemQuantity: item.currentQuantity,
            countedQuantity: l.countedQuantity,
            varianceQuantity: variance,
            unitCost: item.averageUnitCost,
            varianceValue: varVal,
            note: null,
          };
        });
        const totalVarVal = detailLines.reduce((acc, d) => acc + d.varianceValue, 0);
        const autoApprove = !settings.inventory.stockTakeRequiresApproval && isManagerOrOwner;
        const newTake: StockTakeSummary = {
          id: takeNo,
          takeNumber: takeNo,
          status: autoApprove ? 'approved' : 'submitted',
          storageZone: opnameZone === 'all' ? 'Semua Zona' : opnameZone,
          note: opnameNote.trim() || null,
          submittedBy: currentStaff.name,
          submittedAt: now,
          reviewedBy: autoApprove ? currentStaff.name : null,
          reviewedAt: autoApprove ? now : null,
          reviewNote: autoApprove ? 'Auto-approved' : null,
          lineCount: detailLines.length,
          varianceValue: totalVarVal,
        };
        setLocalTakeLines((prev) => ({ ...prev, [takeNo]: detailLines }));
        const nextTakes = [newTake, ...stockTakes];
        setStockTakes(nextTakes);
        if (autoApprove) {
          const nextItems = items.map((i) => {
            const d = detailLines.find((x) => x.itemId === i.id);
            if (!d) return i;
            return {
              ...i,
              currentQuantity: d.countedQuantity,
              stockValue: Math.round(d.countedQuantity * i.averageUnitCost),
            };
          });
          persistLocalInventory(nextItems, undefined, undefined, nextTakes);
        } else {
          persistLocalInventory(items, undefined, undefined, nextTakes);
        }
        setCountedMap({});
        setOpnameNote('');
        notify('ok', `Stock Opname ${takeNo} berhasil diajukan (${detailLines.length} bahan).`);
      }
    } catch (err: any) {
      notify('err', err?.message || 'Gagal mengirim Stock Opname.');
    } finally {
      setLoading(false);
    }
  };

  const handleInspectTake = async (takeId: string) => {
    setInspectTakeId(takeId);
    if (isOnlineApi) {
      try {
        const lines = await inventoryApi.stockTakeLines(takeId);
        setInspectLines(lines);
      } catch (err: any) {
        notify('err', err?.message || 'Gagal memuat rincian opname.');
      }
    } else {
      setInspectLines(localTakeLines[takeId] || []);
    }
  };

  const handleApproveTake = async (takeId: string) => {
    if (!isManagerOrOwner) return;
    setLoading(true);
    try {
      if (isOnlineApi) {
        await inventoryApi.approveStockTake(takeId, 'Disetujui oleh ' + currentStaff.name);
        notify('ok', 'Stock Opname disetujui dan saldo stok telah disesuaikan.');
        await refreshAll();
      } else {
        const lines = localTakeLines[takeId] || [];
        const now = new Date().toISOString();
        const nextItems = items.map((i) => {
          const l = lines.find((x) => x.itemId === i.id);
          if (!l) return i;
          const nextQty = Number((i.currentQuantity + l.varianceQuantity).toFixed(4));
          return {
            ...i,
            currentQuantity: nextQty,
            stockValue: Math.round(nextQty * i.averageUnitCost),
            status: computeStockStatus(nextQty, i.reorderLevel),
          };
        });
        const nextTakes = stockTakes.map((t) =>
          t.id === takeId
            ? {
                ...t,
                status: 'approved' as const,
                reviewedBy: currentStaff.name,
                reviewedAt: now,
              }
            : t
        );
        setStockTakes(nextTakes);
        persistLocalInventory(nextItems, undefined, undefined, nextTakes);
        notify('ok', `Stock Opname ${takeId} disetujui.`);
      }
    } catch (err: any) {
      notify('err', err?.message || 'Gagal menyetujui Stock Opname.');
    } finally {
      setLoading(false);
    }
  };

  const handleRejectTake = async (takeId: string) => {
    if (!isManagerOrOwner) return;
    const reason = window.prompt('Alasan penolakan Stock Opname:', 'Perlu hitung ulang');
    if (!reason || reason.trim().length < 3) return;
    setLoading(true);
    try {
      if (isOnlineApi) {
        await inventoryApi.rejectStockTake(takeId, reason.trim());
        notify('ok', 'Stock Opname ditolak.');
        await refreshAll();
      } else {
        const nextTakes = stockTakes.map((t) =>
          t.id === takeId
            ? {
                ...t,
                status: 'rejected' as const,
                reviewedBy: currentStaff.name,
                reviewedAt: new Date().toISOString(),
                reviewNote: reason.trim(),
              }
            : t
        );
        setStockTakes(nextTakes);
        persistLocalInventory(items, undefined, undefined, nextTakes);
        notify('ok', `Stock Opname ${takeId} ditolak.`);
      }
    } catch (err: any) {
      notify('err', err?.message || 'Gagal menolak Stock Opname.');
    } finally {
      setLoading(false);
    }
  };

  // ============================================================================
  // 4. ADMIN INVENTORY: CREATE ITEM & MANUAL ADJUSTMENT
  // ============================================================================
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [zoneFilter, setZoneFilter] = useState<string>('all');
  const [showNewItemModal, setShowNewItemModal] = useState<boolean>(false);
  const [newItemForm, setNewItemForm] = useState({
    name: '',
    sku: '',
    unitCode: 'kg',
    storageZone: 'Dry Storage',
    reorderLevel: '5',
    maxLevel: '50',
    openingQuantity: '0',
    openingUnitCost: '0',
  });

  const [adjustModalItem, setAdjustModalItem] = useState<InventoryItem | null>(null);
  const [adjustNewQty, setAdjustNewQty] = useState<string>('');
  const [adjustReason, setAdjustReason] = useState<string>('');

  const filteredItems = useMemo(() => {
    return items.filter((i) => {
      if (zoneFilter !== 'all' && i.storageZone !== zoneFilter) return false;
      if (searchQuery.trim() !== '') {
        const q = searchQuery.toLowerCase();
        return (
          i.name.toLowerCase().includes(q) ||
          (i.sku || '').toLowerCase().includes(q) ||
          (i.category || '').toLowerCase().includes(q)
        );
      }
      return true;
    });
  }, [items, zoneFilter, searchQuery]);

  const handleCreateItem = async (e: React.FormEvent) => {
    e.preventDefault();
    const name = newItemForm.name.trim();
    const reorder = parseFloat(newItemForm.reorderLevel) || 0;
    const max = parseFloat(newItemForm.maxLevel) || null;
    const openQty = isManagerOrOwner ? parseFloat(newItemForm.openingQuantity) || 0 : 0;
    const openCost = isManagerOrOwner ? parseFloat(newItemForm.openingUnitCost) || 0 : 0;
    if (!name) {
      notify('err', 'Nama bahan baku wajib diisi.');
      return;
    }

    setLoading(true);
    try {
      if (isOnlineApi) {
        const created = await inventoryApi.createItem({
          name,
          sku: newItemForm.sku.trim() || undefined,
          unitCode: newItemForm.unitCode,
          storageZone: newItemForm.storageZone,
          category: newItemForm.storageZone,
          reorderLevel: reorder,
          maxLevel: max,
          openingQuantity: openQty,
          openingUnitCost: openCost,
        });
        notify('ok', `Bahan baku "${created.name}" berhasil ditambahkan.`);
        await refreshAll();
      } else {
        const created: InventoryItem = {
          id: 'rm-' + Date.now(),
          sku: newItemForm.sku.trim() || `SKU-${items.length + 1}`,
          name,
          unitCode: newItemForm.unitCode,
          category: newItemForm.storageZone,
          barcode: null,
          storageZone: newItemForm.storageZone,
          currentQuantity: openQty,
          reorderLevel: reorder,
          maxLevel: max,
          averageUnitCost: openCost,
          lastPurchaseCost: openCost,
          stockValue: Math.round(openQty * openCost),
          defaultSupplierId: null,
          isActive: true,
          status: openQty <= 0 ? 'out' : openQty <= reorder ? 'low' : 'ok',
          nextExpiry: null,
        };
        persistLocalInventory([...items, created]);
        notify('ok', `Bahan baku "${created.name}" berhasil ditambahkan.`);
      }
      setShowNewItemModal(false);
      setNewItemForm({
        name: '',
        sku: '',
        unitCode: 'kg',
        storageZone: 'Dry Storage',
        reorderLevel: '5',
        maxLevel: '50',
        openingQuantity: '0',
        openingUnitCost: '0',
      });
    } catch (err: any) {
      notify('err', err?.message || 'Gagal membuat bahan baku baru.');
    } finally {
      setLoading(false);
    }
  };

  const handleManualAdjust = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!adjustModalItem || !isManagerOrOwner) return;
    const newQty = parseFloat(adjustNewQty);
    if (!Number.isFinite(newQty) || newQty < 0 || adjustReason.trim().length < 3) {
      notify('err', 'Masukkan jumlah stok baru (≥ 0) dan alasan koreksi (min. 3 karakter).');
      return;
    }

    setLoading(true);
    try {
      if (isOnlineApi) {
        await inventoryApi.adjust({
          itemId: adjustModalItem.id,
          newQuantity: newQty,
          reason: adjustReason.trim(),
        });
        notify('ok', `Stok ${adjustModalItem.name} disesuaikan menjadi ${newQty} ${adjustModalItem.unitCode}.`);
        await refreshAll();
      } else {
        const delta = Number((newQty - adjustModalItem.currentQuantity).toFixed(4));
        const mv: InventoryMovement = {
          id: 'mv-' + Math.random().toString(36).slice(2, 10),
          itemId: adjustModalItem.id,
          itemName: adjustModalItem.name,
          unitCode: adjustModalItem.unitCode,
          type: 'adjustment',
          quantityDelta: delta,
          unitCost: adjustModalItem.averageUnitCost,
          totalValue: Math.round(Math.abs(delta) * adjustModalItem.averageUnitCost),
          balanceAfter: newQty,
          referenceType: 'adjustment',
          referenceId: null,
          invoiceNo: null,
          expiryDate: null,
          supplierId: null,
          note: adjustReason.trim(),
          createdBy: currentStaff.name,
          createdAt: new Date().toISOString(),
        };
        const nextItems = items.map((i) =>
          i.id === adjustModalItem.id
            ? {
                ...i,
                currentQuantity: newQty,
                stockValue: Math.round(newQty * i.averageUnitCost),
                status: computeStockStatus(newQty, i.reorderLevel),
              }
            : i
        );
        const nextMoves = [mv, ...movements];
        setMovements(nextMoves);
        persistLocalInventory(nextItems, nextMoves);
        notify('ok', `Stok ${adjustModalItem.name} dikoreksi menjadi ${newQty} ${adjustModalItem.unitCode}.`);
      }
      setAdjustModalItem(null);
      setAdjustReason('');
    } catch (err: any) {
      notify('err', err?.message || 'Gagal menyesuaikan stok.');
    } finally {
      setLoading(false);
    }
  };

  // ============================================================================
  // 5. SUPPLIERS
  // ============================================================================
  const [supForm, setSupForm] = useState({
    name: '',
    contactName: '',
    phone: '',
    email: '',
    address: '',
    note: '',
  });

  const handleCreateSupplier = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!supForm.name.trim()) {
      notify('err', 'Nama supplier wajib diisi.');
      return;
    }
    setLoading(true);
    try {
      if (isOnlineApi) {
        const s = await inventoryApi.createSupplier({
          name: supForm.name.trim(),
          contactName: supForm.contactName.trim() || undefined,
          phone: supForm.phone.trim() || undefined,
          email: supForm.email.trim() || undefined,
          address: supForm.address.trim() || undefined,
          note: supForm.note.trim() || undefined,
        });
        setSuppliers((prev) => [...prev, s]);
        notify('ok', `Supplier "${s.name}" ditambahkan.`);
      } else {
        const s: Supplier = {
          id: 'sup-' + Date.now(),
          name: supForm.name.trim(),
          contactName: supForm.contactName.trim() || null,
          phone: supForm.phone.trim() || null,
          email: supForm.email.trim() || null,
          address: supForm.address.trim() || null,
          note: supForm.note.trim() || null,
          isActive: true,
        };
        const next = [...suppliers, s];
        setSuppliers(next);
        persistLocalInventory(items, undefined, undefined, undefined, next);
        notify('ok', `Supplier "${s.name}" ditambahkan.`);
      }
      setSupForm({ name: '', contactName: '', phone: '', email: '', address: '', note: '' });
    } catch (err: any) {
      notify('err', err?.message || 'Gagal menambah supplier.');
    } finally {
      setLoading(false);
    }
  };

  // ============================================================================
  // 6. MENU MANAGEMENT & RECIPE BOM (MANAGER / OWNER)
  // ============================================================================
  const [menuForm, setMenuForm] = useState({
    name: '',
    sku: '',
    categoryId: '',
    destination: 'kitchen' as 'kitchen' | 'bar' | 'other',
    price: '',
    costPrice: '',
    description: '',
    trackStock: true,
    stockQuantity: '30',
  });
  const [newCategoryName, setNewCategoryName] = useState<string>('');
  const [selectedRecipeMenu, setSelectedRecipeMenu] = useState<AdminMenuItem | null>(null);
  const [recipeLines, setRecipeLines] = useState<{ itemId: string; quantity: string }[]>([]);
  const [recipeVersion, setRecipeVersion] = useState<number>(0);

  const handleCreateCategory = async () => {
    if (!newCategoryName.trim()) return;
    try {
      if (isOnlineApi) {
        const cat = await menuAdminApi.createCategory({ name: newCategoryName.trim() });
        setCategories((prev) => [...prev, cat]);
        setMenuForm((prev) => ({ ...prev, categoryId: cat.id }));
      } else {
        const code = newCategoryName.trim().toLowerCase().replace(/[^a-z0-9]+/g, '_');
        const cat: MenuCategory = {
          id: 'cat-' + code,
          code,
          name: newCategoryName.trim(),
          sortOrder: categories.length + 1,
          isActive: true,
        };
        setCategories((prev) => [...prev, cat]);
        setMenuForm((prev) => ({ ...prev, categoryId: cat.id }));
      }
      setNewCategoryName('');
      notify('ok', 'Kategori menu ditambahkan.');
    } catch (err: any) {
      notify('err', err?.message || 'Gagal membuat kategori.');
    }
  };

  const handleCreateMenu = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!isManagerOrOwner) return;
    const price = parseFloat(menuForm.price);
    const cost = parseFloat(menuForm.costPrice) || 0;
    const qty = parseInt(menuForm.stockQuantity, 10) || 0;
    if (!menuForm.name.trim() || !Number.isFinite(price) || price < 0) {
      notify('err', 'Nama menu dan harga jual (≥ 0) wajib valid.');
      return;
    }

    setLoading(true);
    try {
      if (isOnlineApi) {
        const created = await menuAdminApi.create({
          name: menuForm.name.trim(),
          sku: menuForm.sku.trim() || undefined,
          categoryId: menuForm.categoryId || null,
          destination: menuForm.destination,
          price,
          costPrice: cost,
          description: menuForm.description.trim() || undefined,
          isAvailable: true,
          stock: { trackStock: menuForm.trackStock, quantity: qty },
        });
        setAdminMenus((prev) => [...prev, created]);
        notify('ok', `Menu "${created.name}" berhasil ditambahkan ke katalog Neon.`);
      } else {
        const catName =
          categories.find((c) => c.id === menuForm.categoryId)?.name || 'MAKANAN';
        const margin = price > 0 ? Number((((price - cost) / price) * 100).toFixed(1)) : 0;
        const created: AdminMenuItem = {
          id: 'm-' + Date.now(),
          sku: menuForm.sku.trim() || `MNU-${adminMenus.length + 1}`,
          name: menuForm.name.trim(),
          description: menuForm.description.trim() || null,
          destination: menuForm.destination,
          price,
          costPrice: cost,
          imageUrl: null,
          categoryId: menuForm.categoryId || null,
          categoryName: catName,
          isAvailable: true,
          sortOrder: adminMenus.length + 1,
          scope: 'tenant',
          trackStock: menuForm.trackStock,
          stockQuantity: qty,
          hasRecipe: false,
          recipeCost: 0,
          marginPercent: margin,
        };
        const next = [...adminMenus, created];
        setAdminMenus(next);
        try {
          localStorage.setItem(STORAGE_LOCAL_ADMIN_MENU, JSON.stringify(next));
        } catch {}
        if (onUpdateLocalMenuStock) onUpdateLocalMenuStock(created.id, qty);
        notify('ok', `Menu "${created.name}" berhasil ditambahkan.`);
      }
      setMenuForm({
        name: '',
        sku: '',
        categoryId: menuForm.categoryId,
        destination: 'kitchen',
        price: '',
        costPrice: '',
        description: '',
        trackStock: true,
        stockQuantity: '30',
      });
    } catch (err: any) {
      notify('err', err?.message || 'Gagal menambah menu baru.');
    } finally {
      setLoading(false);
    }
  };

  const handleOpenRecipeEditor = async (menu: AdminMenuItem) => {
    setSelectedRecipeMenu(menu);
    if (isOnlineApi) {
      try {
        const r: Recipe = await menuAdminApi.recipe(menu.id);
        setRecipeVersion(r.version);
        setRecipeLines(
          r.lines.length
            ? r.lines.map((l) => ({ itemId: l.itemId, quantity: String(l.quantity) }))
            : [{ itemId: items[0]?.id || '', quantity: '1' }]
        );
      } catch {
        setRecipeVersion(0);
        setRecipeLines([{ itemId: items[0]?.id || '', quantity: '1' }]);
      }
    } else {
      setRecipeVersion(1);
      setRecipeLines([{ itemId: items[0]?.id || '', quantity: '0.1' }]);
    }
  };

  const calculatedRecipeCost = useMemo(() => {
    return recipeLines.reduce((acc, l) => {
      const item = items.find((i) => i.id === l.itemId);
      const q = parseFloat(l.quantity);
      if (!item || !Number.isFinite(q) || q <= 0) return acc;
      return acc + q * item.averageUnitCost;
    }, 0);
  }, [recipeLines, items]);

  const handleSaveRecipe = async (syncCostPrice: boolean) => {
    if (!selectedRecipeMenu) return;
    const validLines: { itemId: string; quantity: number }[] = [];
    for (const l of recipeLines) {
      const q = parseFloat(l.quantity);
      if (!l.itemId || !Number.isFinite(q) || q <= 0) continue;
      validLines.push({ itemId: l.itemId, quantity: q });
    }

    setLoading(true);
    try {
      if (isOnlineApi) {
        const saved = await menuAdminApi.saveRecipe(
          selectedRecipeMenu.id,
          validLines,
          syncCostPrice
        );
        notify(
          'ok',
          `Resep ${selectedRecipeMenu.name} (v${saved.version}) tersimpan · HPP Resep ${formatRupiah(
            saved.totalCost
          )}.`
        );
        await refreshAll();
      } else {
        const cost = Math.round(calculatedRecipeCost);
        const next = adminMenus.map((m) => {
          if (m.id !== selectedRecipeMenu.id) return m;
          const nextCost = syncCostPrice ? cost : m.costPrice;
          const margin =
            m.price > 0 ? Number((((m.price - cost) / m.price) * 100).toFixed(1)) : 0;
          return {
            ...m,
            costPrice: nextCost,
            hasRecipe: validLines.length > 0,
            recipeCost: cost,
            marginPercent: margin,
          };
        });
        setAdminMenus(next);
        try {
          localStorage.setItem(STORAGE_LOCAL_ADMIN_MENU, JSON.stringify(next));
        } catch {}
        notify('ok', `Resep BOM ${selectedRecipeMenu.name} berhasil disimpan.`);
      }
      setSelectedRecipeMenu(null);
    } catch (err: any) {
      notify('err', err?.message || 'Gagal menyimpan resep BOM.');
    } finally {
      setLoading(false);
    }
  };

  const handleQuickMenuToggle = async (menu: AdminMenuItem, nextAvailable: boolean) => {
    try {
      if (isOnlineApi) {
        const updated = await menuAdminApi.update(menu.id, { isAvailable: nextAvailable });
        setAdminMenus((prev) => prev.map((m) => (m.id === menu.id ? updated : m)));
      } else {
        const next = adminMenus.map((m) =>
          m.id === menu.id ? { ...m, isAvailable: nextAvailable } : m
        );
        setAdminMenus(next);
        try {
          localStorage.setItem(STORAGE_LOCAL_ADMIN_MENU, JSON.stringify(next));
        } catch {}
      }
    } catch (err: any) {
      notify('err', err?.message || 'Gagal mengubah status menu.');
    }
  };

  // ============================================================================
  // 7. SYSTEM & APP SETTINGS
  // ============================================================================
  const handleSaveSettings = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!isManagerOrOwner) return;
    setLoading(true);
    try {
      if (isOnlineApi) {
        const payload = {
          inventory: settings.inventory,
          app: settings.app,
          ...(isOwner ? { tenant: settings.tenant, outlet: settings.outlet } : {}),
        };
        const updated = await settingsApi.update(payload);
        setSettings(updated);
        notify('ok', 'Pengaturan sistem berhasil disimpan ke database Neon.');
      } else {
        try {
          localStorage.setItem(STORAGE_LOCAL_SETTINGS, JSON.stringify(settings));
        } catch {}
        notify('ok', 'Pengaturan sistem berhasil disimpan.');
      }
    } catch (err: any) {
      notify('err', err?.message || 'Gagal menyimpan pengaturan sistem.');
    } finally {
      setLoading(false);
    }
  };

  // Navigation pills inside the workspace
  const navSections: {
    id: WorkspaceSection;
    label: string;
    icon: React.ReactNode;
    badge?: number;
    visible: boolean;
  }[] = [
    {
      id: 'receipt',
      label: 'Penerimaan Stok (Qty & Value)',
      icon: <PackagePlus className="w-4 h-4" />,
      visible: canWriteInventory,
    },
    {
      id: 'stock_take',
      label: 'Stock Opname',
      icon: <ClipboardCheck className="w-4 h-4" />,
      badge: computedSummary.pendingStockTakes || undefined,
      visible: true,
    },
    {
      id: 'waste',
      label: 'Input Waste / Rusak',
      icon: <Trash2 className="w-4 h-4" />,
      visible: canWriteInventory,
    },
    {
      id: 'admin_stock',
      label: 'Admin Inventory & Valuasi',
      icon: <Boxes className="w-4 h-4" />,
      badge:
        computedSummary.totals.outOfStock + computedSummary.totals.lowStock > 0
          ? computedSummary.totals.outOfStock + computedSummary.totals.lowStock
          : undefined,
      visible: true,
    },
    {
      id: 'suppliers',
      label: 'Supplier',
      icon: <Truck className="w-4 h-4" />,
      visible: true,
    },
    {
      id: 'ledger',
      label: 'Kartu Stok (Ledger)',
      icon: <History className="w-4 h-4" />,
      visible: true,
    },
    {
      id: 'menu_admin',
      label: 'Input Menu & Resep BOM',
      icon: <UtensilsCrossed className="w-4 h-4" />,
      visible: isManagerOrOwner,
    },
    {
      id: 'app_settings',
      label: 'System App Settings',
      icon: <Settings className="w-4 h-4" />,
      visible: isManagerOrOwner,
    },
  ];

  return (
    <div className="flex-1 min-h-0 overflow-y-auto clay-canvas p-4 sm:p-6 text-slate-800">
      <div className="max-w-7xl mx-auto space-y-5">
        {/* Top Workspace Header */}
        <div className="clay-panel p-4 sm:p-5 flex flex-wrap items-center justify-between gap-4">
          <div className="flex items-center gap-3.5">
            <div className="w-12 h-12 clay-btn-indigo flex items-center justify-center text-white shrink-0">
              <Boxes className="w-6 h-6" />
            </div>
            <div>
              <div className="flex items-center gap-2 flex-wrap">
                <span className="text-[11px] font-black uppercase tracking-widest text-indigo-800">
                  Warehouse · Menu BOM · System Control
                </span>
                <span
                  className={`text-[10px] font-black uppercase px-2 py-0.5 rounded-full ${
                    isOnlineApi
                      ? 'bg-emerald-100 text-emerald-900 border border-emerald-300'
                      : 'bg-amber-100 text-amber-900 border border-amber-300'
                  }`}
                >
                  {isOnlineApi ? 'Neon PostgreSQL Live' : 'Mode Lokal / Offline Sync'}
                </span>
              </div>
              <h1 className="text-xl sm:text-2xl font-black text-slate-900">
                Manajemen Inventaris, Menu &amp; Pengaturan Sistem
              </h1>
              <p className="text-xs text-slate-600">
                Login sebagai <strong>{currentStaff.name}</strong> ({currentStaff.role.toUpperCase()}) ·
                Valuasi Weighted Average Cost (WAC) &amp; FEFO Batch
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2.5">
            {canWriteInventory && (
              <button
                type="button"
                onClick={() => setShowNewItemModal(true)}
                className="clay-btn-emerald min-h-[42px] px-4 py-2 text-xs font-black text-white flex items-center gap-1.5 cursor-pointer"
              >
                <Plus className="w-4 h-4 stroke-[2.4]" />
                <span>Bahan Baku Baru</span>
              </button>
            )}
            <button
              type="button"
              onClick={() => void refreshAll()}
              disabled={loading}
              className="clay-btn-neutral min-h-[42px] px-3.5 py-2 text-xs font-extrabold flex items-center gap-1.5 cursor-pointer"
            >
              <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
              <span>Sinkronkan</span>
            </button>
          </div>
        </div>

        {/* KPI Valuation Strip */}
        <div className="grid grid-cols-2 lg:grid-cols-5 gap-3">
          <div className="clay-card-sm p-3.5">
            <div className="text-[11px] font-extrabold uppercase text-slate-500">
              Total Nilai Aset Stok
            </div>
            <div className="text-lg sm:text-xl font-black text-slate-900 mt-1">
              {formatRupiah(computedSummary.totals.stockValue)}
            </div>
            <div className="text-[11px] font-bold text-slate-500 mt-0.5">
              {computedSummary.totals.items} bahan aktif (WAC)
            </div>
          </div>

          <div className="clay-card-sm p-3.5">
            <div className="text-[11px] font-extrabold uppercase text-emerald-700">
              Belanja Stok (Bulan Ini)
            </div>
            <div className="text-lg sm:text-xl font-black text-emerald-900 mt-1">
              {formatRupiah(computedSummary.month.purchases)}
            </div>
            <div className="text-[11px] font-bold text-slate-500 mt-0.5">
              {receipts.length} dokumen penerimaan
            </div>
          </div>

          <div className="clay-card-sm p-3.5">
            <div className="text-[11px] font-extrabold uppercase text-indigo-700">
              Pemakaian Resep (HPP)
            </div>
            <div className="text-lg sm:text-xl font-black text-indigo-900 mt-1">
              {formatRupiah(computedSummary.month.ingredientUsage)}
            </div>
            <div className="text-[11px] font-bold text-slate-500 mt-0.5">
              Otomatis dari order POS
            </div>
          </div>

          <div className="clay-card-sm p-3.5">
            <div className="text-[11px] font-extrabold uppercase text-rose-700">
              Nilai Waste / Spoilage
            </div>
            <div className="text-lg sm:text-xl font-black text-rose-900 mt-1">
              {formatRupiah(computedSummary.month.waste)}
            </div>
            <div className="text-[11px] font-bold text-slate-500 mt-0.5">
              Kerusakan / kedaluwarsa
            </div>
          </div>

          <div className="clay-card-sm p-3.5">
            <div className="text-[11px] font-extrabold uppercase text-amber-800">
              Peringatan ROP &amp; Opname
            </div>
            <div className="text-lg sm:text-xl font-black text-amber-900 mt-1">
              {computedSummary.totals.lowStock + computedSummary.totals.outOfStock} Kritis
            </div>
            <div className="text-[11px] font-bold text-slate-500 mt-0.5">
              {computedSummary.pendingStockTakes} opname menunggu approval
            </div>
          </div>
        </div>

        {/* Sub-navigation tabs */}
        <div className="clay-well p-1.5 flex items-center gap-1.5 overflow-x-auto no-scrollbar">
          {navSections
            .filter((s) => s.visible)
            .map((tab) => {
              const active = section === tab.id;
              return (
                <button
                  key={tab.id}
                  type="button"
                  onClick={() => setSection(tab.id)}
                  className={`min-h-[40px] px-3.5 py-2 rounded-xl text-xs font-extrabold flex items-center gap-2 whitespace-nowrap cursor-pointer transition-all ${
                    active
                      ? 'clay-btn-dark text-white shadow'
                      : 'text-slate-700 hover:text-slate-950'
                  }`}
                >
                  {tab.icon}
                  <span>{tab.label}</span>
                  {tab.badge !== undefined && tab.badge > 0 && (
                    <span className="px-1.5 py-0.5 text-[10px] font-black rounded-full bg-amber-500 text-white">
                      {tab.badge}
                    </span>
                  )}
                </button>
              );
            })}
        </div>

        {/* Feedback Banner */}
        {banner && (
          <div
            className={`rounded-2xl px-4 py-3 text-xs font-bold flex items-center justify-between gap-3 border ${
              banner.type === 'ok'
                ? 'bg-emerald-50 border-emerald-300 text-emerald-950'
                : 'bg-rose-50 border-rose-300 text-rose-950'
            }`}
          >
            <div className="flex items-center gap-2">
              {banner.type === 'ok' ? (
                <CheckCircle2 className="w-4 h-4 text-emerald-700 shrink-0" />
              ) : (
                <AlertTriangle className="w-4 h-4 text-rose-700 shrink-0" />
              )}
              <span>{banner.text}</span>
            </div>
            <button
              type="button"
              onClick={() => setBanner(null)}
              className="text-xs font-black underline cursor-pointer"
            >
              Tutup
            </button>
          </div>
        )}

        {/* ====================================================================
            SECTION 1: STAFF INPUT STOK (GOODS RECEIPT: JUMLAH + VALUE)
           ==================================================================== */}
        {section === 'receipt' && (
          <div className="space-y-5">
            <form onSubmit={handleSubmitReceipt} className="clay-panel p-4 sm:p-5 space-y-4">
              <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-200/80 pb-3">
                <div>
                  <h2 className="text-base sm:text-lg font-black text-slate-900">
                    Input Penerimaan Stok Barang (Jumlah &amp; Nilai Belanja)
                  </h2>
                  <p className="text-xs text-slate-600">
                    Staff gudang dapat menginput jumlah fisik yang datang beserta nilai Rp (Harga
                    Satuan atau Total Belanja). Sistem otomatis menghitung ulang HPP Rata-rata
                    Tertimbang (WAC) dan membuat batch FEFO.
                  </p>
                </div>
                <div className="text-right">
                  <div className="text-[11px] font-bold uppercase text-slate-500">
                    Total Nilai Dokumen
                  </div>
                  <div className="text-lg font-black text-emerald-800">
                    {formatRupiah(Math.round(receiptGrandTotal))}
                  </div>
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <div>
                  <label className="block text-xs font-extrabold text-slate-700 mb-1">
                    Supplier (Opsional)
                  </label>
                  <select
                    value={rcSupplierId}
                    onChange={(e) => setRcSupplierId(e.target.value)}
                    className="w-full clay-input px-3 py-2.5 text-xs font-bold"
                  >
                    <option value="">-- Pilih Supplier --</option>
                    {suppliers
                      .filter((s) => s.isActive)
                      .map((s) => (
                        <option key={s.id} value={s.id}>
                          {s.name}
                        </option>
                      ))}
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-extrabold text-slate-700 mb-1">
                    No. Nota / Faktur / Surat Jalan
                  </label>
                  <input
                    type="text"
                    value={rcInvoiceNo}
                    onChange={(e) => setRcInvoiceNo(e.target.value)}
                    placeholder="Contoh: INV-2026-0089"
                    className="w-full clay-input px-3 py-2.5 text-xs font-bold"
                  />
                </div>
                <div>
                  <label className="block text-xs font-extrabold text-slate-700 mb-1">
                    Catatan Penerimaan
                  </label>
                  <input
                    type="text"
                    value={rcNote}
                    onChange={(e) => setRcNote(e.target.value)}
                    placeholder="Kondisi barang segar, diterima shift pagi"
                    className="w-full clay-input px-3 py-2.5 text-xs font-bold"
                  />
                </div>
              </div>

              {/* Multi-line receipt rows */}
              <div className="space-y-3">
                {rcRows.map((row, idx) => {
                  const selectedItem = items.find((i) => i.id === row.itemId);
                  return (
                    <div
                      key={row.rowId}
                      className="clay-card-sm p-3.5 grid grid-cols-1 md:grid-cols-12 gap-2.5 items-end"
                    >
                      <div className="md:col-span-3">
                        <label className="block text-[11px] font-extrabold text-slate-600 mb-1">
                          #{idx + 1} Bahan Baku
                        </label>
                        <select
                          value={row.itemId}
                          onChange={(e) => updateReceiptRow(row.rowId, { itemId: e.target.value })}
                          className="w-full clay-input px-2.5 py-2 text-xs font-bold"
                        >
                          <option value="">-- Pilih Bahan --</option>
                          {items
                            .filter((i) => i.isActive)
                            .map((i) => (
                              <option key={i.id} value={i.id}>
                                {i.name} ({i.unitCode}) · Stok: {i.currentQuantity}
                              </option>
                            ))}
                        </select>
                      </div>

                      <div className="md:col-span-2">
                        <label className="block text-[11px] font-extrabold text-slate-600 mb-1">
                          Jumlah ({selectedItem?.unitCode || 'Unit'})
                        </label>
                        <input
                          type="number"
                          step="any"
                          min="0"
                          required
                          value={row.quantity}
                          onChange={(e) =>
                            updateReceiptRow(row.rowId, { quantity: e.target.value })
                          }
                          placeholder="0"
                          className="w-full clay-input px-2.5 py-2 text-xs font-black"
                        />
                      </div>

                      <div className="md:col-span-2">
                        <label className="block text-[11px] font-extrabold text-slate-600 mb-1">
                          Mode Input Nilai
                        </label>
                        <select
                          value={row.pricingMode}
                          onChange={(e) =>
                            updateReceiptRow(row.rowId, {
                              pricingMode: e.target.value as 'unit' | 'total',
                            })
                          }
                          className="w-full clay-input px-2.5 py-2 text-xs font-bold"
                        >
                          <option value="total">Total Nilai (Rp)</option>
                          <option value="unit">Harga / Satuan (Rp)</option>
                        </select>
                      </div>

                      <div className="md:col-span-2">
                        <label className="block text-[11px] font-extrabold text-slate-600 mb-1">
                          Total Nilai Belanja (Rp)
                        </label>
                        <input
                          type="number"
                          step="any"
                          min="0"
                          value={row.totalValue}
                          onChange={(e) =>
                            updateReceiptRow(row.rowId, {
                              pricingMode: 'total',
                              totalValue: e.target.value,
                            })
                          }
                          placeholder="Rp Total"
                          className="w-full clay-input px-2.5 py-2 text-xs font-black"
                        />
                      </div>

                      <div className="md:col-span-2">
                        <label className="block text-[11px] font-extrabold text-slate-600 mb-1">
                          Harga / {selectedItem?.unitCode || 'Satuan'} (Rp)
                        </label>
                        <input
                          type="number"
                          step="any"
                          min="0"
                          value={row.unitCost}
                          onChange={(e) =>
                            updateReceiptRow(row.rowId, {
                              pricingMode: 'unit',
                              unitCost: e.target.value,
                            })
                          }
                          placeholder="Rp / unit"
                          className="w-full clay-input px-2.5 py-2 text-xs font-bold"
                        />
                      </div>

                      <div className="md:col-span-1 flex items-center justify-end gap-1">
                        <input
                          type="date"
                          title="Tanggal Kedaluwarsa (FEFO Opsional)"
                          value={row.expiryDate}
                          onChange={(e) =>
                            updateReceiptRow(row.rowId, { expiryDate: e.target.value })
                          }
                          className="w-full clay-input px-1.5 py-2 text-[10px] font-bold"
                        />
                        {rcRows.length > 1 && (
                          <button
                            type="button"
                            onClick={() =>
                              setRcRows((prev) => prev.filter((x) => x.rowId !== row.rowId))
                            }
                            className="clay-btn-rose p-2 text-white cursor-pointer shrink-0"
                            title="Hapus baris"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>

              <div className="flex flex-wrap items-center justify-between gap-3 pt-2">
                <button
                  type="button"
                  onClick={() =>
                    setRcRows((prev) => [...prev, createEmptyReceiptRow(items[0]?.id || '')])
                  }
                  className="clay-btn-neutral min-h-[40px] px-4 py-2 text-xs font-extrabold flex items-center gap-1.5 cursor-pointer"
                >
                  <FilePlus2 className="w-4 h-4" />
                  <span>+ Tambah Baris Barang</span>
                </button>

                <button
                  type="submit"
                  disabled={loading}
                  className="clay-btn-emerald min-h-[44px] px-6 py-2.5 text-xs font-black text-white flex items-center gap-2 cursor-pointer"
                >
                  <Save className="w-4 h-4" />
                  <span>Posting Penerimaan &amp; Update Nilai Stok</span>
                </button>
              </div>
            </form>

            {/* Recent Receipts History */}
            <div className="clay-panel p-4 sm:p-5">
              <h3 className="text-sm font-black text-slate-900 mb-3">
                Riwayat Dokumen Penerimaan Barang (Goods Receipts)
              </h3>
              {receipts.length === 0 ? (
                <div className="text-xs text-slate-500 py-6 text-center">
                  Belum ada dokumen penerimaan barang yang tercatat.
                </div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-xs">
                    <thead>
                      <tr className="border-b border-slate-200 text-left text-slate-500 uppercase">
                        <th className="py-2 px-3">No. Dokumen</th>
                        <th className="py-2 px-3">Waktu</th>
                        <th className="py-2 px-3">Supplier</th>
                        <th className="py-2 px-3">No. Nota</th>
                        <th className="py-2 px-3">Jumlah Item</th>
                        <th className="py-2 px-3">Total Nilai</th>
                        <th className="py-2 px-3">Diinput Oleh</th>
                      </tr>
                    </thead>
                    <tbody>
                      {receipts.map((r) => (
                        <tr key={r.id} className="border-b border-slate-100">
                          <td className="py-2.5 px-3 font-black text-slate-900">
                            {r.receiptNumber}
                          </td>
                          <td className="py-2.5 px-3 text-slate-600">
                            {new Date(r.receivedAt).toLocaleString('id-ID')}
                          </td>
                          <td className="py-2.5 px-3 font-bold">{r.supplierName || '—'}</td>
                          <td className="py-2.5 px-3">{r.invoiceNo || '—'}</td>
                          <td className="py-2.5 px-3 font-bold">{r.lineCount} baris</td>
                          <td className="py-2.5 px-3 font-black text-emerald-800">
                            {formatRupiah(r.totalValue)}
                          </td>
                          <td className="py-2.5 px-3 text-slate-600">{r.createdBy || 'Staff'}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          </div>
        )}

        {/* ====================================================================
            SECTION 2: STOCK OPNAME (COUNT & APPROVAL)
           ==================================================================== */}
        {section === 'stock_take' && (
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-5">
            <form
              onSubmit={handleSubmitStockTake}
              className="lg:col-span-7 clay-panel p-4 sm:p-5 space-y-4"
            >
              <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-200 pb-3">
                <div>
                  <h2 className="text-base font-black text-slate-900">
                    Formulir Stock Opname (Perhitungan Fisik Gudang)
                  </h2>
                  <p className="text-xs text-slate-600">
                    Masukkan hasil hitung fisik aktual. Sistem otomatis menghitung selisih kuantitas
                    dan selisih nilai rupiah berdasarkan HPP rata-rata saat ini.
                  </p>
                </div>
                <select
                  value={opnameZone}
                  onChange={(e) => setOpnameZone(e.target.value)}
                  className="clay-input px-3 py-2 text-xs font-bold"
                >
                  <option value="all">Semua Zona Penyimpanan</option>
                  {DEFAULT_ZONES.map((z) => (
                    <option key={z} value={z}>
                      {z}
                    </option>
                  ))}
                </select>
              </div>

              <div className="max-h-[420px] overflow-y-auto pr-1 space-y-2">
                {opnameCandidates.map((item) => {
                  const raw = countedMap[item.id] ?? '';
                  const counted = parseFloat(raw);
                  const hasCount = raw.trim() !== '' && Number.isFinite(counted);
                  const diff = hasCount
                    ? Number((counted - item.currentQuantity).toFixed(4))
                    : 0;
                  const diffValue = Math.round(diff * item.averageUnitCost);
                  return (
                    <div
                      key={item.id}
                      className="clay-card-sm p-3 flex flex-wrap items-center justify-between gap-3"
                    >
                      <div className="min-w-[180px] flex-1">
                        <div className="text-xs font-black text-slate-900">{item.name}</div>
                        <div className="text-[11px] font-semibold text-slate-500">
                          Stok Sistem: <strong>{item.currentQuantity}</strong> {item.unitCode} · HPP{' '}
                          {formatRupiah(item.averageUnitCost)}/{item.unitCode}
                        </div>
                      </div>

                      <div className="flex items-center gap-3">
                        <div className="w-32">
                          <input
                            type="number"
                            step="any"
                            min="0"
                            value={raw}
                            onChange={(e) =>
                              setCountedMap((prev) => ({ ...prev, [item.id]: e.target.value }))
                            }
                            placeholder={`Fisik (${item.unitCode})`}
                            className="w-full clay-input px-2.5 py-1.5 text-xs font-black"
                          />
                        </div>
                        <div className="w-32 text-right text-xs font-bold">
                          {hasCount ? (
                            <span
                              className={
                                diff === 0
                                  ? 'text-slate-500'
                                  : diff > 0
                                  ? 'text-emerald-700'
                                  : 'text-rose-700'
                              }
                            >
                              {diff > 0 ? `+${diff}` : diff} {item.unitCode}
                              <br />
                              <span className="text-[10px]">
                                ({diffValue >= 0 ? '+' : ''}
                                {formatRupiah(diffValue)})
                              </span>
                            </span>
                          ) : (
                            <span className="text-slate-400">Belum dihitung</span>
                          )}
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>

              <div className="flex flex-wrap items-center justify-between gap-3 pt-2">
                <input
                  type="text"
                  value={opnameNote}
                  onChange={(e) => setOpnameNote(e.target.value)}
                  placeholder="Catatan opname (contoh: Opname penutupan shift malam)"
                  className="flex-1 min-w-[220px] clay-input px-3 py-2 text-xs font-bold"
                />
                {canWriteInventory && (
                  <button
                    type="submit"
                    disabled={loading}
                    className="clay-btn-indigo min-h-[42px] px-5 py-2 text-xs font-black text-white flex items-center gap-2 cursor-pointer"
                  >
                    <ClipboardCheck className="w-4 h-4" />
                    <span>Kirim Hasil Stock Opname</span>
                  </button>
                )}
              </div>
            </form>

            {/* Approval Queue */}
            <div className="lg:col-span-5 clay-panel p-4 sm:p-5 space-y-3">
              <h3 className="text-sm font-black text-slate-900">
                Daftar Pengajuan Stock Opname &amp; Approval Manager
              </h3>
              {stockTakes.length === 0 ? (
                <div className="text-xs text-slate-500 py-8 text-center">
                  Belum ada pengajuan Stock Opname.
                </div>
              ) : (
                <div className="space-y-2.5">
                  {stockTakes.map((t) => (
                    <div key={t.id} className="clay-card-sm p-3.5 space-y-2">
                      <div className="flex items-center justify-between gap-2">
                        <div>
                          <span className="text-xs font-black text-slate-900">{t.takeNumber}</span>
                          <span className="ml-2 text-[11px] font-bold text-slate-500">
                            ({t.lineCount} bahan)
                          </span>
                        </div>
                        <span
                          className={`text-[10px] font-black uppercase px-2 py-0.5 rounded-full ${
                            t.status === 'approved'
                              ? 'bg-emerald-100 text-emerald-900'
                              : t.status === 'rejected'
                              ? 'bg-rose-100 text-rose-900'
                              : 'bg-amber-100 text-amber-900'
                          }`}
                        >
                          {t.status}
                        </span>
                      </div>
                      <div className="text-[11px] text-slate-600 flex flex-wrap justify-between gap-2">
                        <span>
                          Oleh: <strong>{t.submittedBy || 'Staff'}</strong> ·{' '}
                          {new Date(t.submittedAt).toLocaleString('id-ID')}
                        </span>
                        <span
                          className={`font-black ${
                            t.varianceValue < 0 ? 'text-rose-700' : 'text-emerald-700'
                          }`}
                        >
                          Selisih Nilai: {formatRupiah(t.varianceValue)}
                        </span>
                      </div>
                      {t.note && <div className="text-[11px] italic text-slate-500">"{t.note}"</div>}
                      <div className="flex items-center justify-end gap-2 pt-1">
                        <button
                          type="button"
                          onClick={() => void handleInspectTake(t.id)}
                          className="clay-btn-neutral px-3 py-1.5 text-[11px] font-extrabold cursor-pointer"
                        >
                          Lihat Rincian
                        </button>
                        {t.status === 'submitted' && isManagerOrOwner && (
                          <>
                            <button
                              type="button"
                              onClick={() => void handleApproveTake(t.id)}
                              className="clay-btn-emerald px-3 py-1.5 text-[11px] font-black text-white cursor-pointer"
                            >
                              Setujui (Approve)
                            </button>
                            <button
                              type="button"
                              onClick={() => void handleRejectTake(t.id)}
                              className="clay-btn-rose px-3 py-1.5 text-[11px] font-black text-white cursor-pointer"
                            >
                              Tolak
                            </button>
                          </>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              )}

              {inspectTakeId && (
                <div className="clay-well p-3 space-y-2 mt-3">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-black">Rincian Opname #{inspectTakeId}</span>
                    <button
                      type="button"
                      onClick={() => setInspectTakeId(null)}
                      className="text-xs font-bold underline cursor-pointer"
                    >
                      Tutup
                    </button>
                  </div>
                  {inspectLines.map((l) => (
                    <div
                      key={l.itemId}
                      className="text-[11px] flex items-center justify-between border-b border-slate-200/60 py-1"
                    >
                      <span className="font-bold">{l.name}</span>
                      <span>
                        Sistem {l.systemQuantity} → Fisik <strong>{l.countedQuantity}</strong>{' '}
                        {l.unitCode} ({l.varianceQuantity >= 0 ? '+' : ''}
                        {l.varianceQuantity} · {formatRupiah(l.varianceValue)})
                      </span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        )}

        {/* ====================================================================
            SECTION 3: WASTE / SPOILAGE
           ==================================================================== */}
        {section === 'waste' && (
          <form onSubmit={handleRecordWaste} className="clay-panel p-4 sm:p-5 max-w-2xl space-y-4">
            <div>
              <h2 className="text-base font-black text-slate-900">
                Pencatatan Bahan Rusak / Basi / Tumpah (Waste &amp; Spoilage)
              </h2>
              <p className="text-xs text-slate-600">
                Pemotongan stok rusak otomatis memotong lot tertua (FEFO) dan menghitung nilai
                kerugian berdasarkan HPP rata-rata saat ini.
              </p>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-extrabold text-slate-700 mb-1">
                  Pilih Bahan Baku
                </label>
                <select
                  value={wasteItemId || items[0]?.id || ''}
                  onChange={(e) => setWasteItemId(e.target.value)}
                  className="w-full clay-input px-3 py-2.5 text-xs font-bold"
                >
                  {items
                    .filter((i) => i.isActive)
                    .map((i) => (
                      <option key={i.id} value={i.id}>
                        {i.name} (Sisa: {i.currentQuantity} {i.unitCode})
                      </option>
                    ))}
                </select>
              </div>

              <div>
                <label className="block text-xs font-extrabold text-slate-700 mb-1">
                  Jumlah Rusak ({selectedWasteItem?.unitCode || 'Unit'})
                </label>
                <input
                  type="number"
                  step="any"
                  min="0"
                  required
                  value={wasteQty}
                  onChange={(e) => setWasteQty(e.target.value)}
                  placeholder="0"
                  className="w-full clay-input px-3 py-2.5 text-xs font-black"
                />
              </div>
            </div>

            <div>
              <label className="block text-xs font-extrabold text-slate-700 mb-1">
                Alasan Kerusakan / Waste (Wajib diisi)
              </label>
              <input
                type="text"
                required
                value={wasteReason}
                onChange={(e) => setWasteReason(e.target.value)}
                placeholder="Contoh: Kemasan bocor di chiller / melewati batas kedaluwarsa"
                className="w-full clay-input px-3 py-2.5 text-xs font-bold"
              />
            </div>

            {selectedWasteItem && parseFloat(wasteQty) > 0 && (
              <div className="clay-well p-3 text-xs font-bold text-rose-900 flex items-center justify-between">
                <span>Estimasi Nilai Kerugian (WAC):</span>
                <span className="text-sm font-black">
                  {formatRupiah(
                    Math.round(parseFloat(wasteQty) * selectedWasteItem.averageUnitCost)
                  )}
                </span>
              </div>
            )}

            <button
              type="submit"
              disabled={loading}
              className="clay-btn-rose min-h-[44px] px-5 py-2.5 text-xs font-black text-white flex items-center gap-2 cursor-pointer"
            >
              <Trash2 className="w-4 h-4" />
              <span>Simpan Pencatatan Waste</span>
            </button>
          </form>
        )}

        {/* ====================================================================
            SECTION 4: ADMIN INVENTORY & VALUATION TABLE
           ==================================================================== */}
        {section === 'admin_stock' && (
          <div className="space-y-4">
            <div className="clay-panel p-4 flex flex-wrap items-center justify-between gap-3">
              <div className="flex items-center gap-1.5 overflow-x-auto no-scrollbar">
                {['all', ...DEFAULT_ZONES].map((z) => (
                  <button
                    key={z}
                    type="button"
                    onClick={() => setZoneFilter(z)}
                    className={`min-h-[36px] px-3 py-1.5 rounded-xl text-xs font-extrabold cursor-pointer ${
                      zoneFilter === z
                        ? 'clay-btn-dark text-white'
                        : 'clay-btn-neutral text-slate-700'
                    }`}
                  >
                    {z === 'all' ? 'Semua Zona' : z}
                  </button>
                ))}
              </div>

              <div className="relative w-64">
                <Search className="w-4 h-4 text-slate-500 absolute left-3 top-1/2 -translate-y-1/2" />
                <input
                  type="text"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  placeholder="Cari nama bahan / SKU..."
                  className="w-full clay-input pl-9 pr-3 py-2 text-xs font-bold"
                />
              </div>
            </div>

            <div className="clay-panel p-4 overflow-x-auto">
              <table className="w-full text-xs">
                <thead>
                  <tr className="border-b border-slate-200 text-left text-slate-500 uppercase">
                    <th className="py-2.5 px-3">SKU &amp; Nama Bahan</th>
                    <th className="py-2.5 px-3">Zona Gudang</th>
                    <th className="py-2.5 px-3">Stok Saat Ini</th>
                    <th className="py-2.5 px-3">Batas ROP</th>
                    <th className="py-2.5 px-3">HPP Rata-rata (WAC)</th>
                    <th className="py-2.5 px-3">Harga Beli Terakhir</th>
                    <th className="py-2.5 px-3">Nilai Aset Stok</th>
                    <th className="py-2.5 px-3">Status</th>
                    <th className="py-2.5 px-3 text-right">Aksi</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredItems.map((item) => (
                    <tr key={item.id} className="border-b border-slate-100 hover:bg-white/40">
                      <td className="py-3 px-3">
                        <div className="font-black text-slate-900">{item.name}</div>
                        <div className="text-[10px] font-bold text-slate-500">
                          {item.sku || 'TANPA-SKU'}
                          {item.nextExpiry ? ` · Exp terdekat: ${item.nextExpiry}` : ''}
                        </div>
                      </td>
                      <td className="py-3 px-3 font-bold text-slate-700">
                        {item.storageZone || '—'}
                      </td>
                      <td className="py-3 px-3 font-black text-slate-900">
                        {item.currentQuantity} {item.unitCode}
                      </td>
                      <td className="py-3 px-3 text-slate-600">
                        {item.reorderLevel} {item.unitCode}
                      </td>
                      <td className="py-3 px-3 font-bold text-indigo-900">
                        {formatRupiah(Math.round(item.averageUnitCost))} / {item.unitCode}
                      </td>
                      <td className="py-3 px-3 text-slate-600">
                        {formatRupiah(Math.round(item.lastPurchaseCost))}
                      </td>
                      <td className="py-3 px-3 font-black text-emerald-900">
                        {formatRupiah(Math.round(item.stockValue))}
                      </td>
                      <td className="py-3 px-3">
                        <span
                          className={`px-2 py-0.5 rounded-full text-[10px] font-black uppercase ${
                            item.status === 'out'
                              ? 'bg-rose-100 text-rose-900'
                              : item.status === 'low'
                              ? 'bg-amber-100 text-amber-900'
                              : 'bg-emerald-100 text-emerald-900'
                          }`}
                        >
                          {item.status === 'out'
                            ? 'Habis'
                            : item.status === 'low'
                            ? 'Di Bawah ROP'
                            : 'Aman'}
                        </span>
                      </td>
                      <td className="py-3 px-3 text-right">
                        <div className="inline-flex items-center gap-1.5">
                          {canWriteInventory && (
                            <button
                              type="button"
                              onClick={() => {
                                setRcRows([createEmptyReceiptRow(item.id)]);
                                setSection('receipt');
                              }}
                              className="clay-btn-emerald px-2.5 py-1 text-[11px] font-black text-white cursor-pointer"
                            >
                              + Terima Stok
                            </button>
                          )}
                          {isManagerOrOwner && (
                            <button
                              type="button"
                              onClick={() => {
                                setAdjustModalItem(item);
                                setAdjustNewQty(String(item.currentQuantity));
                                setAdjustReason('');
                              }}
                              className="clay-btn-neutral px-2.5 py-1 text-[11px] font-extrabold cursor-pointer"
                            >
                              Koreksi Admin
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* ====================================================================
            SECTION 5: SUPPLIERS
           ==================================================================== */}
        {section === 'suppliers' && (
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-5">
            {canWriteInventory && (
              <form
                onSubmit={handleCreateSupplier}
                className="lg:col-span-5 clay-panel p-4 sm:p-5 space-y-3"
              >
                <h2 className="text-base font-black text-slate-900">Tambah Supplier Baru</h2>
                <input
                  type="text"
                  required
                  value={supForm.name}
                  onChange={(e) => setSupForm((p) => ({ ...p, name: e.target.value }))}
                  placeholder="Nama Perusahaan / Supplier *"
                  className="w-full clay-input px-3 py-2 text-xs font-bold"
                />
                <div className="grid grid-cols-2 gap-2">
                  <input
                    type="text"
                    value={supForm.contactName}
                    onChange={(e) => setSupForm((p) => ({ ...p, contactName: e.target.value }))}
                    placeholder="Nama PIC / Kontak"
                    className="w-full clay-input px-3 py-2 text-xs font-bold"
                  />
                  <input
                    type="text"
                    value={supForm.phone}
                    onChange={(e) => setSupForm((p) => ({ ...p, phone: e.target.value }))}
                    placeholder="No. Telepon / WA"
                    className="w-full clay-input px-3 py-2 text-xs font-bold"
                  />
                </div>
                <input
                  type="email"
                  value={supForm.email}
                  onChange={(e) => setSupForm((p) => ({ ...p, email: e.target.value }))}
                  placeholder="Email Pemesanan"
                  className="w-full clay-input px-3 py-2 text-xs font-bold"
                />
                <input
                  type="text"
                  value={supForm.address}
                  onChange={(e) => setSupForm((p) => ({ ...p, address: e.target.value }))}
                  placeholder="Alamat Gudang / Pengiriman"
                  className="w-full clay-input px-3 py-2 text-xs font-bold"
                />
                <button
                  type="submit"
                  disabled={loading}
                  className="clay-btn-emerald min-h-[42px] px-4 py-2 text-xs font-black text-white cursor-pointer"
                >
                  Simpan Supplier
                </button>
              </form>
            )}

            <div
              className={`${
                canWriteInventory ? 'lg:col-span-7' : 'lg:col-span-12'
              } clay-panel p-4 sm:p-5 space-y-3`}
            >
              <h3 className="text-sm font-black text-slate-900">Daftar Mitra Supplier</h3>
              <div className="space-y-2">
                {suppliers.map((s) => (
                  <div
                    key={s.id}
                    className="clay-card-sm p-3.5 flex flex-wrap items-center justify-between gap-2"
                  >
                    <div>
                      <div className="text-xs font-black text-slate-900">{s.name}</div>
                      <div className="text-[11px] text-slate-600">
                        PIC: {s.contactName || '—'} · Telp: {s.phone || '—'} · {s.email || ''}
                      </div>
                      {s.address && (
                        <div className="text-[11px] text-slate-500">{s.address}</div>
                      )}
                    </div>
                    <span className="px-2 py-0.5 text-[10px] font-black uppercase rounded-full bg-emerald-100 text-emerald-900">
                      Aktif
                    </span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}

        {/* ====================================================================
            SECTION 6: KARTU STOK / LEDGER MUTASI
           ==================================================================== */}
        {section === 'ledger' && (
          <div className="clay-panel p-4 sm:p-5 space-y-3">
            <h2 className="text-base font-black text-slate-900">
              Kartu Stok &amp; Buku Besar Mutasi (Append-Only Ledger)
            </h2>
            {movements.length === 0 ? (
              <div className="text-xs text-slate-500 py-8 text-center">
                Belum ada riwayat pergerakan stok tercatat.
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-xs">
                  <thead>
                    <tr className="border-b border-slate-200 text-left text-slate-500 uppercase">
                      <th className="py-2 px-3">Waktu</th>
                      <th className="py-2 px-3">Bahan Baku</th>
                      <th className="py-2 px-3">Tipe Mutasi</th>
                      <th className="py-2 px-3">Perubahan (Delta)</th>
                      <th className="py-2 px-3">Harga Satuan</th>
                      <th className="py-2 px-3">Nilai Mutasi</th>
                      <th className="py-2 px-3">Saldo Akhir</th>
                      <th className="py-2 px-3">Keterangan / Petugas</th>
                    </tr>
                  </thead>
                  <tbody>
                    {movements.map((m) => (
                      <tr key={m.id} className="border-b border-slate-100">
                        <td className="py-2.5 px-3 text-slate-600">
                          {new Date(m.createdAt).toLocaleString('id-ID')}
                        </td>
                        <td className="py-2.5 px-3 font-black text-slate-900">{m.itemName}</td>
                        <td className="py-2.5 px-3">
                          <span className="px-2 py-0.5 rounded-full text-[10px] font-black uppercase bg-slate-200 text-slate-800">
                            {m.type}
                          </span>
                        </td>
                        <td
                          className={`py-2.5 px-3 font-black ${
                            m.quantityDelta >= 0 ? 'text-emerald-700' : 'text-rose-700'
                          }`}
                        >
                          {m.quantityDelta >= 0 ? `+${m.quantityDelta}` : m.quantityDelta}{' '}
                          {m.unitCode}
                        </td>
                        <td className="py-2.5 px-3">
                          {formatRupiah(Math.round(m.unitCost))}
                        </td>
                        <td className="py-2.5 px-3 font-bold">
                          {m.totalValue != null ? formatRupiah(Math.round(m.totalValue)) : '—'}
                        </td>
                        <td className="py-2.5 px-3 font-black">
                          {m.balanceAfter != null ? `${m.balanceAfter} ${m.unitCode}` : '—'}
                        </td>
                        <td className="py-2.5 px-3 text-slate-600">
                          {m.note || '—'}{' '}
                          {m.createdBy ? <span className="font-bold">({m.createdBy})</span> : null}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        )}

        {/* ====================================================================
            SECTION 7: INPUT MENU & RESEP BOM (MANAGER / OWNER)
           ==================================================================== */}
        {section === 'menu_admin' && isManagerOrOwner && (
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-5">
            <form
              onSubmit={handleCreateMenu}
              className="lg:col-span-4 clay-panel p-4 sm:p-5 space-y-3"
            >
              <div className="flex items-center gap-2">
                <ChefHat className="w-5 h-5 text-indigo-700" />
                <h2 className="text-base font-black text-slate-900">
                  Input Menu Baru (Manager / Owner)
                </h2>
              </div>

              <div>
                <label className="block text-xs font-extrabold text-slate-700 mb-1">
                  Nama Menu *
                </label>
                <input
                  type="text"
                  required
                  value={menuForm.name}
                  onChange={(e) => setMenuForm((p) => ({ ...p, name: e.target.value }))}
                  placeholder="Contoh: Nasi Goreng Kambing Spesial"
                  className="w-full clay-input px-3 py-2 text-xs font-bold"
                />
              </div>

              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="block text-xs font-extrabold text-slate-700 mb-1">
                    SKU Menu
                  </label>
                  <input
                    type="text"
                    value={menuForm.sku}
                    onChange={(e) => setMenuForm((p) => ({ ...p, sku: e.target.value }))}
                    placeholder="MNU-015"
                    className="w-full clay-input px-3 py-2 text-xs font-bold"
                  />
                </div>
                <div>
                  <label className="block text-xs font-extrabold text-slate-700 mb-1">
                    Destinasi KDS
                  </label>
                  <select
                    value={menuForm.destination}
                    onChange={(e) =>
                      setMenuForm((p) => ({
                        ...p,
                        destination: e.target.value as 'kitchen' | 'bar' | 'other',
                      }))
                    }
                    className="w-full clay-input px-3 py-2 text-xs font-bold"
                  >
                    <option value="kitchen">Dapur (Kitchen)</option>
                    <option value="bar">Bar &amp; Beverage</option>
                    <option value="other">Lainnya</option>
                  </select>
                </div>
              </div>

              <div>
                <label className="block text-xs font-extrabold text-slate-700 mb-1">
                  Kategori Menu
                </label>
                <div className="flex gap-1.5">
                  <select
                    value={menuForm.categoryId}
                    onChange={(e) => setMenuForm((p) => ({ ...p, categoryId: e.target.value }))}
                    className="flex-1 clay-input px-3 py-2 text-xs font-bold"
                  >
                    <option value="">-- Pilih Kategori --</option>
                    {categories.map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.name}
                      </option>
                    ))}
                  </select>
                  <input
                    type="text"
                    value={newCategoryName}
                    onChange={(e) => setNewCategoryName(e.target.value)}
                    placeholder="+ Kategori"
                    className="w-28 clay-input px-2 py-2 text-xs font-bold"
                  />
                  {newCategoryName.trim() && (
                    <button
                      type="button"
                      onClick={() => void handleCreateCategory()}
                      className="clay-btn-neutral px-2.5 text-xs font-black cursor-pointer"
                    >
                      +
                    </button>
                  )}
                </div>
              </div>

              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="block text-xs font-extrabold text-slate-700 mb-1">
                    Harga Jual (Rp) *
                  </label>
                  <input
                    type="number"
                    min="0"
                    required
                    value={menuForm.price}
                    onChange={(e) => setMenuForm((p) => ({ ...p, price: e.target.value }))}
                    placeholder="45000"
                    className="w-full clay-input px-3 py-2 text-xs font-black"
                  />
                </div>
                <div>
                  <label className="block text-xs font-extrabold text-slate-700 mb-1">
                    Estimasi HPP (Rp)
                  </label>
                  <input
                    type="number"
                    min="0"
                    value={menuForm.costPrice}
                    onChange={(e) => setMenuForm((p) => ({ ...p, costPrice: e.target.value }))}
                    placeholder="16000"
                    className="w-full clay-input px-3 py-2 text-xs font-bold"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-2 items-end">
                <label className="flex items-center gap-2 text-xs font-extrabold text-slate-700">
                  <input
                    type="checkbox"
                    checked={menuForm.trackStock}
                    onChange={(e) =>
                      setMenuForm((p) => ({ ...p, trackStock: e.target.checked }))
                    }
                  />
                  <span>Lacak Kuota Porsi</span>
                </label>
                {menuForm.trackStock && (
                  <div>
                    <label className="block text-[11px] font-bold text-slate-600 mb-1">
                      Stok Awal Porsi
                    </label>
                    <input
                      type="number"
                      min="0"
                      value={menuForm.stockQuantity}
                      onChange={(e) =>
                        setMenuForm((p) => ({ ...p, stockQuantity: e.target.value }))
                      }
                      className="w-full clay-input px-3 py-1.5 text-xs font-black"
                    />
                  </div>
                )}
              </div>

              <textarea
                rows={2}
                value={menuForm.description}
                onChange={(e) => setMenuForm((p) => ({ ...p, description: e.target.value }))}
                placeholder="Deskripsi menu singkat..."
                className="w-full clay-input px-3 py-2 text-xs font-bold"
              />

              <button
                type="submit"
                disabled={loading}
                className="w-full clay-btn-emerald min-h-[42px] py-2.5 text-xs font-black text-white cursor-pointer"
              >
                + Simpan Menu ke Katalog
              </button>
            </form>

            {/* Menu List & Recipe BOM Editor */}
            <div className="lg:col-span-8 clay-panel p-4 sm:p-5 space-y-4">
              <div className="flex items-center justify-between">
                <div>
                  <h3 className="text-base font-black text-slate-900">
                    Katalog Menu &amp; Pengaturan Resep BOM (Bill of Materials)
                  </h3>
                  <p className="text-xs text-slate-600">
                    Klik <strong>Atur Resep BOM</strong> untuk menghubungkan menu dengan pemotongan
                    bahan baku gudang dan kalkulasi HPP otomatis.
                  </p>
                </div>
              </div>

              {selectedRecipeMenu && (
                <div className="clay-well p-4 space-y-3 border border-indigo-200">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div>
                      <span className="text-[10px] font-black uppercase text-indigo-700">
                        Editor Resep BOM (Versi {recipeVersion + 1})
                      </span>
                      <h4 className="text-sm font-black text-slate-900">
                        Komposisi Bahan untuk 1 Porsi: {selectedRecipeMenu.name}
                      </h4>
                    </div>
                    <div className="text-right">
                      <div className="text-[11px] font-bold text-slate-600">
                        Total HPP Resep Otomatis
                      </div>
                      <div className="text-sm font-black text-indigo-900">
                        {formatRupiah(Math.round(calculatedRecipeCost))} (Harga Jual:{' '}
                        {formatRupiah(selectedRecipeMenu.price)})
                      </div>
                    </div>
                  </div>

                  <div className="space-y-2">
                    {recipeLines.map((line, idx) => {
                      const ing = items.find((i) => i.id === line.itemId);
                      const lineCost =
                        ing && parseFloat(line.quantity) > 0
                          ? Math.round(parseFloat(line.quantity) * ing.averageUnitCost)
                          : 0;
                      return (
                        <div key={idx} className="flex flex-wrap items-center gap-2">
                          <select
                            value={line.itemId}
                            onChange={(e) =>
                              setRecipeLines((prev) =>
                                prev.map((x, i) =>
                                  i === idx ? { ...x, itemId: e.target.value } : x
                                )
                              )
                            }
                            className="flex-1 min-w-[200px] clay-input px-3 py-1.5 text-xs font-bold"
                          >
                            <option value="">-- Pilih Bahan Baku --</option>
                            {items
                              .filter((i) => i.isActive)
                              .map((i) => (
                                <option key={i.id} value={i.id}>
                                  {i.name} ({formatRupiah(Math.round(i.averageUnitCost))}/
                                  {i.unitCode})
                                </option>
                              ))}
                          </select>
                          <input
                            type="number"
                            step="any"
                            min="0"
                            value={line.quantity}
                            onChange={(e) =>
                              setRecipeLines((prev) =>
                                prev.map((x, i) =>
                                  i === idx ? { ...x, quantity: e.target.value } : x
                                )
                              )
                            }
                            placeholder="Takaran"
                            className="w-28 clay-input px-2.5 py-1.5 text-xs font-black"
                          />
                          <span className="text-xs font-bold text-slate-600 w-14">
                            {ing?.unitCode || ''}
                          </span>
                          <span className="text-xs font-black text-indigo-900 w-24 text-right">
                            {formatRupiah(lineCost)}
                          </span>
                          <button
                            type="button"
                            onClick={() =>
                              setRecipeLines((prev) => prev.filter((_, i) => i !== idx))
                            }
                            className="clay-btn-rose p-1.5 text-white cursor-pointer"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      );
                    })}
                  </div>

                  <div className="flex flex-wrap items-center justify-between gap-2 pt-2">
                    <button
                      type="button"
                      onClick={() =>
                        setRecipeLines((prev) => [
                          ...prev,
                          { itemId: items[0]?.id || '', quantity: '0.1' },
                        ])
                      }
                      className="clay-btn-neutral px-3 py-1.5 text-xs font-extrabold cursor-pointer"
                    >
                      + Tambah Bahan Komposisi
                    </button>
                    <div className="flex items-center gap-2">
                      <button
                        type="button"
                        onClick={() => setSelectedRecipeMenu(null)}
                        className="clay-btn-neutral px-3 py-1.5 text-xs font-bold cursor-pointer"
                      >
                        Batal
                      </button>
                      <button
                        type="button"
                        onClick={() => void handleSaveRecipe(true)}
                        className="clay-btn-indigo px-4 py-1.5 text-xs font-black text-white cursor-pointer"
                      >
                        Simpan Resep &amp; Sinkronkan HPP Menu
                      </button>
                    </div>
                  </div>
                </div>
              )}

              <div className="overflow-x-auto max-h-[460px]">
                <table className="w-full text-xs">
                  <thead>
                    <tr className="border-b border-slate-200 text-left text-slate-500 uppercase">
                      <th className="py-2 px-2.5">Menu</th>
                      <th className="py-2 px-2.5">Destinasi</th>
                      <th className="py-2 px-2.5">Harga Jual</th>
                      <th className="py-2 px-2.5">HPP / Margin</th>
                      <th className="py-2 px-2.5">Stok Porsi</th>
                      <th className="py-2 px-2.5">Status</th>
                      <th className="py-2 px-2.5 text-right">Resep BOM</th>
                    </tr>
                  </thead>
                  <tbody>
                    {adminMenus.map((m) => (
                      <tr key={m.id} className="border-b border-slate-100">
                        <td className="py-2.5 px-2.5">
                          <div className="font-black text-slate-900">{m.name}</div>
                          <div className="text-[10px] text-slate-500">
                            {m.sku || '—'} · {m.categoryName || 'Umum'}
                          </div>
                        </td>
                        <td className="py-2.5 px-2.5 uppercase font-bold text-slate-600">
                          {m.destination}
                        </td>
                        <td className="py-2.5 px-2.5 font-black text-slate-900">
                          {formatRupiah(m.price)}
                        </td>
                        <td className="py-2.5 px-2.5">
                          <div className="font-bold text-slate-800">
                            {formatRupiah(m.hasRecipe ? m.recipeCost : m.costPrice)}
                          </div>
                          <div className="text-[10px] font-black text-emerald-700">
                            Margin {m.marginPercent}%
                          </div>
                        </td>
                        <td className="py-2.5 px-2.5 font-black">
                          {m.trackStock ? `${m.stockQuantity ?? 0} porsi` : 'Tanpa Batas'}
                        </td>
                        <td className="py-2.5 px-2.5">
                          <button
                            type="button"
                            onClick={() => void handleQuickMenuToggle(m, !m.isAvailable)}
                            className={`px-2 py-0.5 rounded-full text-[10px] font-black uppercase cursor-pointer ${
                              m.isAvailable
                                ? 'bg-emerald-100 text-emerald-900'
                                : 'bg-rose-100 text-rose-900'
                            }`}
                          >
                            {m.isAvailable ? 'Tersedia' : 'Nonaktif'}
                          </button>
                        </td>
                        <td className="py-2.5 px-2.5 text-right">
                          <button
                            type="button"
                            onClick={() => void handleOpenRecipeEditor(m)}
                            className="clay-btn-neutral px-2.5 py-1 text-[11px] font-extrabold inline-flex items-center gap-1 cursor-pointer"
                          >
                            <Layers className="w-3.5 h-3.5 text-indigo-700" />
                            <span>{m.hasRecipe ? 'Edit BOM' : 'Atur BOM'}</span>
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        )}

        {/* ====================================================================
            SECTION 8: SYSTEM APP SETTINGS
           ==================================================================== */}
        {section === 'app_settings' && isManagerOrOwner && (
          <form onSubmit={handleSaveSettings} className="space-y-5">
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
              {/* Inventory policy */}
              <div className="clay-panel p-4 sm:p-5 space-y-3">
                <div className="flex items-center gap-2 border-b border-slate-200 pb-2">
                  <Sliders className="w-4 h-4 text-indigo-700" />
                  <h3 className="text-sm font-black text-slate-900">
                    Kebijakan Inventaris &amp; Pemotongan Stok
                  </h3>
                </div>

                <label className="flex items-start gap-2.5 text-xs font-bold text-slate-800 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={settings.inventory.deductIngredients}
                    onChange={(e) =>
                      setSettings((p) => ({
                        ...p,
                        inventory: { ...p.inventory, deductIngredients: e.target.checked },
                      }))
                    }
                    className="mt-0.5"
                  />
                  <span>
                    Potong Bahan Baku Gudang Otomatis (BOM FEFO) saat Pesanan POS Dibuat
                  </span>
                </label>

                <div>
                  <label className="block text-xs font-extrabold text-slate-700 mb-1">
                    Kebijakan Saat Stok Bahan Tidak Cukup
                  </label>
                  <select
                    value={settings.inventory.negativeStockPolicy}
                    onChange={(e) =>
                      setSettings((p) => ({
                        ...p,
                        inventory: {
                          ...p.inventory,
                          negativeStockPolicy: e.target.value as 'allow' | 'block',
                        },
                      }))
                    }
                    className="w-full clay-input px-3 py-2 text-xs font-bold"
                  >
                    <option value="allow">
                      Izinkan Stok Negatif Sementara (Order POS Tetap Jalan)
                    </option>
                    <option value="block">
                      Blokir Order POS Jika Bahan Baku Resep Habis (Strict)
                    </option>
                  </select>
                </div>

                <label className="flex items-start gap-2.5 text-xs font-bold text-slate-800 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={settings.inventory.stockTakeRequiresApproval}
                    onChange={(e) =>
                      setSettings((p) => ({
                        ...p,
                        inventory: {
                          ...p.inventory,
                          stockTakeRequiresApproval: e.target.checked,
                        },
                      }))
                    }
                    className="mt-0.5"
                  />
                  <span>Stock Opname Wajib Persetujuan (Approval) Manager / Owner</span>
                </label>

                <label className="flex items-start gap-2.5 text-xs font-bold text-slate-800 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={settings.inventory.staffCanCreateItems}
                    onChange={(e) =>
                      setSettings((p) => ({
                        ...p,
                        inventory: { ...p.inventory, staffCanCreateItems: e.target.checked },
                      }))
                    }
                    className="mt-0.5"
                  />
                  <span>Izinkan Staff Inventory Menambah Master Bahan Baku Baru</span>
                </label>

                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <label className="block text-[11px] font-extrabold text-slate-700 mb-1">
                      Alert Kedaluwarsa (Hari)
                    </label>
                    <input
                      type="number"
                      min="0"
                      max="365"
                      value={settings.inventory.expiryWarningDays}
                      onChange={(e) =>
                        setSettings((p) => ({
                          ...p,
                          inventory: {
                            ...p.inventory,
                            expiryWarningDays: parseInt(e.target.value, 10) || 0,
                          },
                        }))
                      }
                      className="w-full clay-input px-3 py-1.5 text-xs font-black"
                    />
                  </div>
                  <div>
                    <label className="block text-[11px] font-extrabold text-slate-700 mb-1">
                      Maks. Backdate Nota (Hari)
                    </label>
                    <input
                      type="number"
                      min="0"
                      max="90"
                      value={settings.inventory.maxReceiptBackdateDays}
                      onChange={(e) =>
                        setSettings((p) => ({
                          ...p,
                          inventory: {
                            ...p.inventory,
                            maxReceiptBackdateDays: parseInt(e.target.value, 10) || 0,
                          },
                        }))
                      }
                      className="w-full clay-input px-3 py-1.5 text-xs font-black"
                    />
                  </div>
                </div>
              </div>

              {/* App & Receipt Settings */}
              <div className="clay-panel p-4 sm:p-5 space-y-3">
                <div className="flex items-center gap-2 border-b border-slate-200 pb-2">
                  <Settings className="w-4 h-4 text-emerald-700" />
                  <h3 className="text-sm font-black text-slate-900">
                    Pengaturan Aplikasi &amp; Struk Kasir
                  </h3>
                </div>

                <div>
                  <label className="block text-xs font-extrabold text-slate-700 mb-1">
                    Nama Restoran / Brand di Struk
                  </label>
                  <input
                    type="text"
                    value={settings.app.restaurantName}
                    onChange={(e) =>
                      setSettings((p) => ({
                        ...p,
                        app: { ...p.app, restaurantName: e.target.value },
                      }))
                    }
                    className="w-full clay-input px-3 py-2 text-xs font-bold"
                  />
                </div>

                <div>
                  <label className="block text-xs font-extrabold text-slate-700 mb-1">
                    Pesan Footer Struk Thermal
                  </label>
                  <input
                    type="text"
                    value={settings.app.receiptFooter}
                    onChange={(e) =>
                      setSettings((p) => ({
                        ...p,
                        app: { ...p.app, receiptFooter: e.target.value },
                      }))
                    }
                    className="w-full clay-input px-3 py-2 text-xs font-bold"
                  />
                </div>

                <label className="flex items-center gap-2 text-xs font-bold text-slate-800 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={settings.app.receiptShowTax}
                    onChange={(e) =>
                      setSettings((p) => ({
                        ...p,
                        app: { ...p.app, receiptShowTax: e.target.checked },
                      }))
                    }
                  />
                  <span>Tampilkan Rincian PB1 &amp; Service Charge di Struk</span>
                </label>

                <label className="flex items-center gap-2 text-xs font-bold text-slate-800 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={settings.app.autoPrintReceipt}
                    onChange={(e) =>
                      setSettings((p) => ({
                        ...p,
                        app: { ...p.app, autoPrintReceipt: e.target.checked },
                      }))
                    }
                  />
                  <span>Cetak Struk Otomatis Saat Settlement Selesai</span>
                </label>

                <label className="flex items-center gap-2 text-xs font-bold text-slate-800 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={settings.app.soundEnabled}
                    onChange={(e) =>
                      setSettings((p) => ({
                        ...p,
                        app: { ...p.app, soundEnabled: e.target.checked },
                      }))
                    }
                  />
                  <span>Aktifkan Efek Suara Tombol &amp; Notifikasi KDS</span>
                </label>
              </div>

              {/* Financial & Tax Settings (Owner only) */}
              <div className="clay-panel p-4 sm:p-5 space-y-3">
                <div className="flex items-center justify-between border-b border-slate-200 pb-2">
                  <h3 className="text-sm font-black text-slate-900">
                    Tarif Pajak PB1, Service &amp; Alur Bayar
                  </h3>
                  <span className="text-[10px] font-black uppercase px-2 py-0.5 rounded-full bg-amber-100 text-amber-900">
                    {isOwner ? 'Owner Access' : 'Hanya Owner'}
                  </span>
                </div>

                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <label className="block text-xs font-extrabold text-slate-700 mb-1">
                      Pajak Restoran PB1 (%)
                    </label>
                    <input
                      type="number"
                      step="0.1"
                      min="0"
                      max="100"
                      disabled={!isOwner}
                      value={Math.round(settings.tenant.taxRate * 1000) / 10}
                      onChange={(e) =>
                        setSettings((p) => ({
                          ...p,
                          tenant: {
                            ...p.tenant,
                            taxRate: Math.max(0, Math.min(1, (parseFloat(e.target.value) || 0) / 100)),
                          },
                        }))
                      }
                      className="w-full clay-input px-3 py-2 text-xs font-black disabled:opacity-60"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-extrabold text-slate-700 mb-1">
                      Service Charge (%)
                    </label>
                    <input
                      type="number"
                      step="0.1"
                      min="0"
                      max="100"
                      disabled={!isOwner}
                      value={Math.round(settings.tenant.serviceChargeRate * 1000) / 10}
                      onChange={(e) =>
                        setSettings((p) => ({
                          ...p,
                          tenant: {
                            ...p.tenant,
                            serviceChargeRate: Math.max(
                              0,
                              Math.min(1, (parseFloat(e.target.value) || 0) / 100)
                            ),
                          },
                        }))
                      }
                      className="w-full clay-input px-3 py-2 text-xs font-black disabled:opacity-60"
                    />
                  </div>
                </div>

                <div>
                  <label className="block text-xs font-extrabold text-slate-700 mb-1">
                    Alur Pembayaran Default (Payment Flow)
                  </label>
                  <select
                    disabled={!isOwner}
                    value={settings.tenant.defaultPaymentFlow}
                    onChange={(e) =>
                      setSettings((p) => ({
                        ...p,
                        tenant: {
                          ...p.tenant,
                          defaultPaymentFlow: e.target.value as 'payment_last' | 'payment_first',
                        },
                      }))
                    }
                    className="w-full clay-input px-3 py-2 text-xs font-bold disabled:opacity-60"
                  >
                    <option value="payment_last">Bayar di Akhir (Open Bill / Dine-In)</option>
                    <option value="payment_first">Bayar di Awal (Kasir Langsung)</option>
                  </select>
                </div>

                <label className="flex items-center gap-2 text-xs font-bold text-slate-800">
                  <input
                    type="checkbox"
                    disabled={!isOwner}
                    checked={settings.tenant.serviceInTaxBase}
                    onChange={(e) =>
                      setSettings((p) => ({
                        ...p,
                        tenant: { ...p.tenant, serviceInTaxBase: e.target.checked },
                      }))
                    }
                  />
                  <span>Service Charge termasuk dasar pengenaan Pajak PB1</span>
                </label>
              </div>
            </div>

            <div className="flex justify-end">
              <button
                type="submit"
                disabled={loading}
                className="clay-btn-emerald min-h-[44px] px-6 py-2.5 text-xs font-black text-white flex items-center gap-2 cursor-pointer"
              >
                <Save className="w-4 h-4" />
                <span>Simpan Seluruh Pengaturan Sistem</span>
              </button>
            </div>
          </form>
        )}
      </div>

      {/* Modal: Create New Inventory Item */}
      {showNewItemModal && (
        <div className="fixed inset-0 z-50 bg-slate-900/40 backdrop-blur-xs flex items-center justify-center p-4">
          <form
            onSubmit={handleCreateItem}
            className="clay-modal p-5 w-full max-w-md space-y-3 text-slate-800"
          >
            <div className="flex items-center justify-between">
              <h3 className="text-base font-black text-slate-900">Tambah Master Bahan Baku</h3>
              <button
                type="button"
                onClick={() => setShowNewItemModal(false)}
                className="text-slate-500 hover:text-slate-900 cursor-pointer"
              >
                <XCircle className="w-5 h-5" />
              </button>
            </div>

            <div>
              <label className="block text-xs font-extrabold mb-1">Nama Bahan Baku *</label>
              <input
                type="text"
                required
                value={newItemForm.name}
                onChange={(e) => setNewItemForm((p) => ({ ...p, name: e.target.value }))}
                placeholder="Contoh: Daging Sapi Has Dalam"
                className="w-full clay-input px-3 py-2 text-xs font-bold"
              />
            </div>

            <div className="grid grid-cols-2 gap-2">
              <div>
                <label className="block text-xs font-extrabold mb-1">Kode SKU</label>
                <input
                  type="text"
                  value={newItemForm.sku}
                  onChange={(e) => setNewItemForm((p) => ({ ...p, sku: e.target.value }))}
                  placeholder="RM-BEEF-01"
                  className="w-full clay-input px-3 py-2 text-xs font-bold"
                />
              </div>
              <div>
                <label className="block text-xs font-extrabold mb-1">Satuan Ukur</label>
                <select
                  value={newItemForm.unitCode}
                  onChange={(e) => setNewItemForm((p) => ({ ...p, unitCode: e.target.value }))}
                  className="w-full clay-input px-3 py-2 text-xs font-bold"
                >
                  {DEFAULT_UNITS.map((u) => (
                    <option key={u} value={u}>
                      {u}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-2">
              <div>
                <label className="block text-xs font-extrabold mb-1">Zona Gudang</label>
                <select
                  value={newItemForm.storageZone}
                  onChange={(e) =>
                    setNewItemForm((p) => ({ ...p, storageZone: e.target.value }))
                  }
                  className="w-full clay-input px-3 py-2 text-xs font-bold"
                >
                  {DEFAULT_ZONES.map((z) => (
                    <option key={z} value={z}>
                      {z}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-xs font-extrabold mb-1">Batas Minimum (ROP)</label>
                <input
                  type="number"
                  step="any"
                  min="0"
                  value={newItemForm.reorderLevel}
                  onChange={(e) =>
                    setNewItemForm((p) => ({ ...p, reorderLevel: e.target.value }))
                  }
                  className="w-full clay-input px-3 py-2 text-xs font-bold"
                />
              </div>
            </div>

            {isManagerOrOwner && (
              <div className="grid grid-cols-2 gap-2 pt-1 border-t border-slate-200">
                <div>
                  <label className="block text-xs font-extrabold mb-1">Stok Awal (Opsional)</label>
                  <input
                    type="number"
                    step="any"
                    min="0"
                    value={newItemForm.openingQuantity}
                    onChange={(e) =>
                      setNewItemForm((p) => ({ ...p, openingQuantity: e.target.value }))
                    }
                    className="w-full clay-input px-3 py-2 text-xs font-bold"
                  />
                </div>
                <div>
                  <label className="block text-xs font-extrabold mb-1">HPP Awal / Unit (Rp)</label>
                  <input
                    type="number"
                    step="any"
                    min="0"
                    value={newItemForm.openingUnitCost}
                    onChange={(e) =>
                      setNewItemForm((p) => ({ ...p, openingUnitCost: e.target.value }))
                    }
                    className="w-full clay-input px-3 py-2 text-xs font-bold"
                  />
                </div>
              </div>
            )}

            <div className="flex justify-end gap-2 pt-2">
              <button
                type="button"
                onClick={() => setShowNewItemModal(false)}
                className="clay-btn-neutral px-4 py-2 text-xs font-bold cursor-pointer"
              >
                Batal
              </button>
              <button
                type="submit"
                disabled={loading}
                className="clay-btn-emerald px-5 py-2 text-xs font-black text-white cursor-pointer"
              >
                Simpan Bahan
              </button>
            </div>
          </form>
        </div>
      )}

      {/* Modal: Manual Adjustment (Manager / Owner) */}
      {adjustModalItem && (
        <div className="fixed inset-0 z-50 bg-slate-900/40 backdrop-blur-xs flex items-center justify-center p-4">
          <form
            onSubmit={handleManualAdjust}
            className="clay-modal p-5 w-full max-w-md space-y-3 text-slate-800"
          >
            <div className="flex items-center justify-between">
              <h3 className="text-base font-black text-slate-900">
                Koreksi Stok Admin: {adjustModalItem.name}
              </h3>
              <button
                type="button"
                onClick={() => setAdjustModalItem(null)}
                className="text-slate-500 hover:text-slate-900 cursor-pointer"
              >
                <XCircle className="w-5 h-5" />
              </button>
            </div>
            <p className="text-xs text-slate-600">
              Stok Tercatat Saat Ini:{' '}
              <strong>
                {adjustModalItem.currentQuantity} {adjustModalItem.unitCode}
              </strong>{' '}
              (HPP: {formatRupiah(Math.round(adjustModalItem.averageUnitCost))}/
              {adjustModalItem.unitCode})
            </p>
            <div>
              <label className="block text-xs font-extrabold mb-1">
                Jumlah Stok Aktual Baru ({adjustModalItem.unitCode}) *
              </label>
              <input
                type="number"
                step="any"
                min="0"
                required
                value={adjustNewQty}
                onChange={(e) => setAdjustNewQty(e.target.value)}
                className="w-full clay-input px-3 py-2 text-xs font-black"
              />
            </div>
            <div>
              <label className="block text-xs font-extrabold mb-1">
                Alasan Koreksi Audit (Min. 3 Karakter) *
              </label>
              <input
                type="text"
                required
                value={adjustReason}
                onChange={(e) => setAdjustReason(e.target.value)}
                placeholder="Contoh: Penyesuaian audit bulanan manager"
                className="w-full clay-input px-3 py-2 text-xs font-bold"
              />
            </div>
            <div className="flex justify-end gap-2 pt-2">
              <button
                type="button"
                onClick={() => setAdjustModalItem(null)}
                className="clay-btn-neutral px-4 py-2 text-xs font-bold cursor-pointer"
              >
                Batal
              </button>
              <button
                type="submit"
                disabled={loading}
                className="clay-btn-indigo px-5 py-2 text-xs font-black text-white cursor-pointer"
              >
                Simpan Koreksi
              </button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
};
