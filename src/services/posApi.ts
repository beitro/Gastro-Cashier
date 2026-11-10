import type { MenuItem, OrderItem, Table, Transaction, OrderBatch } from '../types/pos';

const TOKEN_KEY = 'gastro_cashier_api_token';
const API_BASE = (import.meta.env.VITE_API_BASE_URL || '').replace(/\/$/, '');

type ApiRow = Record<string, any>;
export type PosSnapshot = { tables: Table[]; transactions: Record<string, Transaction>; menu: ApiRow[] };

export function getApiToken(): string | null {
  return typeof window === 'undefined' ? null : window.localStorage.getItem(TOKEN_KEY);
}

async function request<T>(path: string, init: RequestInit = {}): Promise<T> {
  const token = getApiToken();
  if (!token) throw new Error('Sesi API tidak tersedia. Silakan login ulang.');
  const response = await fetch(API_BASE + path, {
    ...init,
    headers: {
      Accept: 'application/json',
      'Content-Type': 'application/json',
      Authorization: 'Bearer ' + token,
      ...(init.headers || {}),
    },
  });
  const body = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(body.error || 'Permintaan POS gagal (' + response.status + ').');
  return body as T;
}

function mapTable(row: ApiRow): Table {
  const state = String(row.table_state || 'available');
  return {
    id: row.table_id,
    tableNumber: row.table_code,
    area: row.area === 'outdoor' || row.area === 'vip' ? row.area : 'indoor',
    capacity: Number(row.capacity || 2),
    status: state === 'occupied' || state === 'billing' || state === 'reserved' ? state : 'available',
    currentTransactionId: row.session_id || undefined,
    guestCount: row.guest_count == null ? undefined : Number(row.guest_count),
    openedAt: row.opened_at || undefined,
    waiterName: row.waiter_name || undefined,
    outletId: row.outlet_id,
    sessionVersion: Number(row.session_version || 0),
  };
}

function mapOrder(row: ApiRow): OrderItem {
  const unitPrice = Number(row.unit_price || 0);
  const quantity = Number(row.quantity || 0);
  return {
    id: row.id,
    menuItemId: row.menu_item_id,
    name: row.item_name_snapshot,
    category: String(row.category_snapshot || '').toLowerCase().includes('minum') ? 'minuman' :
      String(row.category_snapshot || '').toLowerCase().includes('snack') ? 'snack' :
      String(row.category_snapshot || '').toLowerCase().includes('dessert') ? 'dessert' : 'makanan',
    destination: row.destination === 'bar' ? 'bar' : 'kitchen',
    unitPrice,
    quantity,
    selectedModifiers: [],
    notes: row.notes || '',
    subtotal: Number(row.line_total || unitPrice * quantity),
    batchNumber: Number(row.batch_number || 1),
    isServed: Boolean(row.is_served),
    cookingStatus: row.cooking_status || 'queue',
  };
}

function mapSession(row: ApiRow, table: Table, orders: ApiRow[]): Transaction {
  const batchesMap = new Map<number, OrderItem[]>();
  for (const raw of orders) {
    if (!raw.id) continue;
    const n = Number(raw.batch_number || 1);
    batchesMap.set(n, [...(batchesMap.get(n) || []), mapOrder(raw)]);
  }
  const batches: OrderBatch[] = [...batchesMap.entries()].map(([batchNumber, items]) => ({
    batchNumber, timestamp: row.opened_at, items,
  }));
  const allCurrentItems = batches.flatMap(batch => batch.items);
  const subtotal = allCurrentItems.reduce((sum, item) => sum + item.subtotal, 0);
  const serviceChargeRate = Number(row.service_charge_rate || 0);
  const taxRate = Number(row.tax_rate || 0);
  const serviceChargeAmount = (subtotal * serviceChargeRate);
  const taxAmount = ((subtotal + serviceChargeAmount) * taxRate);
  return {
    id: row.id,
    tableId: table.id,
    tableNumber: table.tableNumber,
    area: table.area,
    guestCount: Number(row.guest_count || 1),
    waiterName: row.waiter_name || 'Staff',
    openedAt: row.opened_at,
    status: 'active',
    paymentFlow: row.payment_flow || 'payment_last',
    isPaid: false,
    batches,
    allCurrentItems,
    subtotal,
    serviceChargeRate,
    serviceChargeAmount,
    taxRate,
    taxAmount,
    discountAmount: 0,
    totalAmount: subtotal + serviceChargeAmount + taxAmount,
    outletId: row.outlet_id,
    sessionVersion: Number(row.version || 1),
    openedByStaffId: row.opened_by_staff_id,
    cashierName: row.waiter_name || 'Staff',
    nextBatchNumber: Math.max(1, ...batches.map(batch => batch.batchNumber + 1)),
  } as Transaction;
}

export async function loadPosSnapshot(): Promise<PosSnapshot> {
  const [tableRows, sessions, menu] = await Promise.all([
    request<ApiRow[]>('/api/tables'),
    request<ApiRow[]>('/api/sessions'),
    request<ApiRow[]>('/api/menu'),
  ]);
  const tables = tableRows.map(mapTable);
  const tableById = new Map(tables.map(table => [table.id, table]));
  const transactions: Record<string, Transaction> = {};
  await Promise.all(sessions.map(async session => {
    const table = tableById.get(session.table_id);
    if (!table) return;
    const orders = await request<ApiRow[]>('/api/sessions/' + encodeURIComponent(session.id) + '/orders');
    transactions[session.id] = mapSession(session, table, orders);
  }));
  return { tables, transactions, menu };
}

export async function openApiSession(table: Table, guestCount: number, waiterStaffId?: string): Promise<ApiRow> {
  return request<ApiRow>('/api/sessions', {
    method: 'POST',
    body: JSON.stringify({ tableId: table.id, guestCount, waiterStaffId }),
  });
}

export async function updateApiOrderItem(
  sessionId: string,
  itemId: string,
  update: { cookingStatus?: 'queue' | 'cooking' | 'ready' | 'handed_off'; isServed?: boolean },
): Promise<ApiRow> {
  return request<ApiRow>('/api/sessions/' + encodeURIComponent(sessionId) + '/orders/' + encodeURIComponent(itemId), {
    method: 'PATCH',
    body: JSON.stringify(update),
  });
}

export async function submitApiOrder(sessionId: string, items: OrderItem[], menu: ApiRow[]): Promise<ApiRow> {
  const bySku = new Map(menu.filter(row => row.sku).map(row => [String(row.sku), String(row.id)]));
  const payload = items.map(item => {
    if (item.selectedModifiers?.length) throw new Error('Pilihan modifier belum didukung oleh API transaksi. Hapus modifier sebelum mengirim pesanan.');
    const menuItemId = bySku.get(item.menuItemId);
    if (!menuItemId) throw new Error('SKU menu ' + item.menuItemId + ' tidak ditemukan di katalog API. Pesanan tidak dikirim.');
    return { menuItemId, quantity: item.quantity, notes: item.notes || '' };
  });
  return request<ApiRow>('/api/sessions/' + encodeURIComponent(sessionId) + '/orders', {
    method: 'POST', body: JSON.stringify({ items: payload }),
  });
}

export async function settleApiSession(sessionId: string, method: 'cash' | 'qris' | 'card', discountAmount: number, cashReceived?: number, cardBank?: string): Promise<ApiRow> {
  const idempotencyKey = ['pos', sessionId, method, Number(discountAmount), method === 'cash' ? Number(cashReceived || 0) : 0].join('-');
  return request<ApiRow>('/api/sessions/' + encodeURIComponent(sessionId) + '/payments', {
    method: 'POST',
    body: JSON.stringify({ method, discountAmount, cashReceived: method === 'cash' ? cashReceived : undefined, cardBank, idempotencyKey }),
  });
}

export function mapPaymentToTransaction(transaction: Transaction, payment: ApiRow): Transaction {
  return {
    ...transaction,
    status: 'settled',
    isPaid: true,
    paidAt: payment.paid_at,
    paymentMethod: payment.method === 'transfer' || payment.method === 'other' ? 'card' : payment.method,
    cashGiven: Number(payment.cash_received || 0),
    changeAmount: Number(payment.change_amount || 0),
    discountAmount: Number(payment.discount_amount || 0),
    subtotal: Number(payment.subtotal_amount || 0),
    serviceChargeAmount: Number(payment.service_charge_amount || 0),
    taxAmount: Number(payment.tax_amount || 0),
    totalAmount: Number(payment.total_amount || 0),
    receiptNumber: payment.receipt_number,
    paymentId: payment.id,
    allCurrentItems: transaction.allCurrentItems.map(item => ({ ...item, isPaid: true })),
    batches: transaction.batches.map(batch => ({ ...batch, items: batch.items.map(item => ({ ...item, isPaid: true })) })),
  } as Transaction;
}

export function mapApiMenuToStock(menu: ApiRow[], fallback: MenuItem[]): Record<string, number> {
  const stock: Record<string, number> = {};
  for (const item of fallback) {
    const match = menu.find(row => String(row.sku || '') === item.id);
    stock[item.id] = match ? 999 : 0;
  }
  return stock;
}

export function mapApiMenuToMenuItems(menu: ApiRow[]): MenuItem[] {
  return menu.map(row => ({
    id: String(row.sku || row.id),
    name: String(row.name || 'Menu'),
    category: row.category_name === 'minuman' ? 'minuman' : row.category_name === 'snack' ? 'snack' : row.category_name === 'dessert' ? 'dessert' : 'makanan',
    destination: row.destination === 'bar' ? 'bar' : 'kitchen',
    price: Number(row.price || 0),
    cost: Number(row.cost_price || 0),
    stock: 999,
    image: row.image_url || undefined,
    description: row.description || undefined,
  }));
}
