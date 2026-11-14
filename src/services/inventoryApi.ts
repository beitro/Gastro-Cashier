// Typed client for the inventory, settings, and menu-administration API (server/inventory.mjs, server/management.mjs).
import { request } from './posApi';

export type StockStatus = 'ok' | 'low' | 'out' | 'over';

export interface InventoryItem {
  id: string;
  sku: string | null;
  name: string;
  unitCode: string;
  category: string | null;
  barcode: string | null;
  storageZone: string | null;
  currentQuantity: number;
  reorderLevel: number;
  maxLevel: number | null;
  averageUnitCost: number;
  lastPurchaseCost: number;
  stockValue: number;
  defaultSupplierId: string | null;
  isActive: boolean;
  status: StockStatus;
  purchaseUnit?: string | null;
  conversionRatio?: number;
  nextExpiry: string | null;
  updatedAt?: string;
}

export type MovementType = 'opening' | 'purchase' | 'sale' | 'waste' | 'adjustment' | 'transfer_in' | 'transfer_out' | 'return';

export interface InventoryMovement {
  id: string;
  itemId: string;
  itemName: string;
  unitCode: string;
  type: MovementType;
  quantityDelta: number;
  unitCost: number;
  totalValue: number | null;
  balanceAfter: number | null;
  referenceType: string | null;
  referenceId: string | null;
  invoiceNo: string | null;
  expiryDate: string | null;
  supplierId: string | null;
  note: string | null;
  createdBy: string | null;
  createdAt: string;
}

export interface Supplier {
  id: string;
  name: string;
  contactName: string | null;
  phone: string | null;
  email: string | null;
  address: string | null;
  note: string | null;
  isActive: boolean;
}

export interface ReceiptLineInput {
  itemId: string;
  quantity: number;
  /** Provide exactly one of unitCost or totalValue. */
  unitCost?: number;
  totalValue?: number;
  expiryDate?: string;
  lotNo?: string;
  note?: string;
}

export interface ReceiptInput {
  idempotencyKey: string;
  supplierId?: string;
  invoiceNo?: string;
  receivedAt?: string;
  note?: string;
  attachmentUrl?: string;
  attachmentMime?: string;
  lines: ReceiptLineInput[];
}

export interface ReceiptSummary {
  id: string;
  receiptNumber: string;
  supplierId: string | null;
  supplierName: string | null;
  invoiceNo: string | null;
  receivedAt: string;
  totalValue: number;
  lineCount: number;
  note: string | null;
  createdBy: string | null;
  attachmentUrl?: string | null;
  attachmentMime?: string | null;
}

export interface StockTakeSummary {
  id: string;
  takeNumber: string;
  status: 'submitted' | 'approved' | 'rejected';
  storageZone: string | null;
  note: string | null;
  submittedBy: string | null;
  submittedAt: string;
  reviewedBy: string | null;
  reviewedAt: string | null;
  reviewNote: string | null;
  lineCount: number;
  varianceValue: number;
}

export interface StockTakeLine {
  itemId: string;
  name: string;
  unitCode: string;
  systemQuantity: number;
  countedQuantity: number;
  varianceQuantity: number;
  unitCost: number;
  varianceValue: number;
  note: string | null;
}

export interface InventorySummary {
  totals: { items: number; stockValue: number; outOfStock: number; lowStock: number };
  byZone: { zone: string; items: number; value: number }[];
  lowStock: InventoryItem[];
  expiringLots: { lotId: string; lotNo: string | null; expiryDate: string; quantityRemaining: number; itemId: string; name: string; unitCode: string }[];
  month: { purchases: number; waste: number; ingredientUsage: number };
  pendingStockTakes: number;
  expiryWarningDays: number;
}

export interface InventorySettings {
  deductIngredients: boolean;
  negativeStockPolicy: 'allow' | 'block';
  costingMethod: 'weighted_average';
  lowStockAlerts: boolean;
  expiryWarningDays: number;
  stockTakeRequiresApproval: boolean;
  staffCanCreateItems: boolean;
  maxReceiptBackdateDays: number;
}

export interface AppSettings {
  restaurantName: string;
  receiptFooter: string;
  receiptShowTax: boolean;
  autoPrintReceipt: boolean;
  soundEnabled: boolean;
  locale: 'id-ID' | 'en-US';
}

export interface SystemSettings {
  tenant: { serviceChargeRate: number; taxRate: number; serviceInTaxBase: boolean; defaultPaymentFlow: 'payment_last' | 'payment_first' };
  outlet: { serviceChargeRate: number | null; taxRate: number | null };
  effective: { serviceChargeRate: number; taxRate: number };
  inventory: InventorySettings;
  app: AppSettings;
  permissions?: { editFinancial: boolean; editInventory: boolean; editApp: boolean };
}

export type SettingsPatch = {
  tenant?: Partial<SystemSettings['tenant']>;
  outlet?: Partial<SystemSettings['outlet']>;
  inventory?: Partial<InventorySettings>;
  app?: Partial<AppSettings>;
};

export interface AdminMenuItem {
  id: string;
  sku: string | null;
  name: string;
  description: string | null;
  destination: 'kitchen' | 'bar' | 'other';
  price: number;
  costPrice: number;
  imageUrl: string | null;
  categoryId: string | null;
  categoryName: string | null;
  isAvailable: boolean;
  sortOrder: number;
  scope: 'tenant' | 'outlet';
  trackStock: boolean;
  stockQuantity: number | null;
  hasRecipe: boolean;
  recipeCost: number;
  marginPercent: number;
}

export interface MenuCategory {
  id: string;
  code: string;
  name: string;
  sortOrder: number;
  isActive: boolean;
}

export interface MenuInput {
  name: string;
  price: number;
  costPrice?: number;
  categoryId?: string | null;
  destination?: 'kitchen' | 'bar' | 'other';
  sku?: string | null;
  description?: string | null;
  imageUrl?: string | null;
  isAvailable?: boolean;
  sortOrder?: number;
  scope?: 'tenant' | 'outlet';
  stock?: { trackStock: boolean; quantity: number };
}

export interface RecipeLine {
  itemId: string;
  name: string;
  unitCode: string;
  quantity: number;
  unitCost: number;
  lineCost: number;
}

export interface Recipe {
  version: number;
  lines: RecipeLine[];
  totalCost: number;
}

const json = (body: unknown): RequestInit => ({ body: JSON.stringify(body) });
const qs = (params: Record<string, string | number | boolean | undefined | null>): string => {
  const entries = Object.entries(params).filter(([, v]) => v !== undefined && v !== null && v !== '');
  return entries.length ? '?' + entries.map(([k, v]) => encodeURIComponent(k) + '=' + encodeURIComponent(String(v))).join('&') : '';
};

export const newIdempotencyKey = (prefix = 'inv'): string =>
  prefix + '-' + (globalThis.crypto?.randomUUID?.() ?? Date.now().toString(36) + Math.random().toString(36).slice(2, 10));

export const inventoryApi = {
  summary: () => request<InventorySummary>('/api/inventory/summary'),
  items: (p: { q?: string; zone?: string; category?: string; status?: StockStatus; includeInactive?: boolean } = {}) =>
    request<InventoryItem[]>('/api/inventory/items' + qs(p)),
  createItem: (b: {
    name: string; unitCode: string; sku?: string; category?: string; barcode?: string; storageZone?: string;
    reorderLevel?: number; maxLevel?: number | null; openingQuantity?: number; openingUnitCost?: number; defaultSupplierId?: string;
    purchaseUnit?: string; conversionRatio?: number;
  }) => request<InventoryItem>('/api/inventory/items', { method: 'POST', ...json(b) }),
  updateItem: (id: string, b: Partial<{
    name: string; unitCode: string; sku: string | null; category: string | null; barcode: string | null; storageZone: string | null;
    reorderLevel: number; maxLevel: number | null; isActive: boolean; defaultSupplierId: string | null;
    purchaseUnit: string | null; conversionRatio: number;
  }>) => request<InventoryItem>('/api/inventory/items/' + id, { method: 'PATCH', ...json(b) }),
  itemMovements: (id: string) => request<InventoryMovement[]>('/api/inventory/items/' + id + '/movements'),
  movements: (p: { type?: MovementType; from?: string; to?: string; limit?: number } = {}) =>
    request<InventoryMovement[]>('/api/inventory/movements' + qs(p)),
  postReceipt: (b: ReceiptInput) =>
    request<{ receipt: { id: string; receipt_number: string; total_value: string }; lines?: InventoryMovement[]; duplicate?: boolean }>(
      '/api/inventory/receipts', { method: 'POST', ...json(b) }),
  receipts: () => request<ReceiptSummary[]>('/api/inventory/receipts'),
  recordWaste: (b: { itemId: string; quantity: number; reason: string }) =>
    request<InventoryMovement>('/api/inventory/waste', { method: 'POST', ...json(b) }),
  adjust: (b: { itemId: string; reason: string; newQuantity?: number; delta?: number }) =>
    request<{ movement?: InventoryMovement; item: InventoryItem; unchanged?: boolean }>('/api/inventory/adjustments', { method: 'POST', ...json(b) }),
  stockTakes: (status?: StockTakeSummary['status']) => request<StockTakeSummary[]>('/api/inventory/stock-takes' + qs({ status })),
  stockTakeLines: (id: string) => request<StockTakeLine[]>('/api/inventory/stock-takes/' + id),
  submitStockTake: (b: { note?: string; storageZone?: string; lines: { itemId: string; countedQuantity: number; note?: string }[] }) =>
    request<{ id: string; takeNumber: string; status: StockTakeSummary['status']; varianceValue: number | null }>(
      '/api/inventory/stock-takes', { method: 'POST', ...json(b) }),
  approveStockTake: (id: string, note?: string) =>
    request<{ id: string; status: 'approved'; varianceValue: number }>('/api/inventory/stock-takes/' + id + '/approve', { method: 'POST', ...json({ note }) }),
  rejectStockTake: (id: string, note: string) =>
    request<{ id: string; status: 'rejected' }>('/api/inventory/stock-takes/' + id + '/reject', { method: 'POST', ...json({ note }) }),
  suppliers: () => request<Supplier[]>('/api/inventory/suppliers'),
  createSupplier: (b: { name: string; contactName?: string; phone?: string; email?: string; address?: string; note?: string }) =>
    request<Supplier>('/api/inventory/suppliers', { method: 'POST', ...json(b) }),
  updateSupplier: (id: string, b: Partial<Omit<Supplier, 'id'>>) =>
    request<Supplier>('/api/inventory/suppliers/' + id, { method: 'PATCH', ...json(b) }),
};

export const settingsApi = {
  get: () => request<SystemSettings>('/api/settings'),
  update: (patch: SettingsPatch) => request<SystemSettings>('/api/settings', { method: 'PUT', ...json(patch) }),
};

export const menuAdminApi = {
  list: () => request<AdminMenuItem[]>('/api/admin/menu'),
  create: (b: MenuInput) => request<AdminMenuItem>('/api/admin/menu', { method: 'POST', ...json(b) }),
  update: (id: string, b: Partial<MenuInput>) => request<AdminMenuItem>('/api/admin/menu/' + id, { method: 'PATCH', ...json(b) }),
  categories: () => request<MenuCategory[]>('/api/admin/menu/categories'),
  createCategory: (b: { name: string; code?: string; sortOrder?: number }) =>
    request<MenuCategory>('/api/admin/menu/categories', { method: 'POST', ...json(b) }),
  recipe: (id: string) => request<Recipe>('/api/admin/menu/' + id + '/recipe'),
  saveRecipe: (id: string, lines: { itemId: string; quantity: number }[], syncCostPrice = false) =>
    request<Recipe>('/api/admin/menu/' + id + '/recipe', { method: 'PUT', ...json({ lines, syncCostPrice }) }),
};
