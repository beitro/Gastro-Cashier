import type { MenuItem, OrderItem, SelectedModifier, Table, Transaction, OrderBatch } from '../types/pos';

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
  if (!response.ok) {
    const err = new Error(body.error || 'Permintaan POS gagal (' + response.status + ').') as Error & {
      status?: number;
      code?: string;
      body?: Record<string, any>;
    };
    err.status = response.status;
    err.code = body.code;
    err.body = body;
    throw err;
  }
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

const MODIFIERS_PREFIX = '[Modifiers: ';

function serializeOrderNotes(modifiers: SelectedModifier[] | undefined, userNotes: string | undefined): string {
  const cleanNotes = (userNotes || '').trim();
  if (!modifiers || modifiers.length === 0) return cleanNotes;
  const serialized = modifiers
    .map((m) => {
      const group = String(m.groupName || 'Option').replace(/[|;\]]/g, '').trim();
      const option = String(m.optionName || '').replace(/[|;\]]/g, '').trim();
      const delta = Number(m.priceDelta || 0);
      return `${group}: ${option} (+Rp${delta})`;
    })
    .join('; ');
  const prefix = `${MODIFIERS_PREFIX}${serialized}]`;
  return cleanNotes ? `${prefix} ${cleanNotes}` : prefix;
}

function parseOrderNotes(rawNotes: string | null | undefined): { selectedModifiers: SelectedModifier[]; notes: string } {
  const raw = String(rawNotes || '');
  if (!raw.startsWith(MODIFIERS_PREFIX)) {
    return { selectedModifiers: [], notes: raw };
  }
  const endIdx = raw.indexOf(']');
  if (endIdx === -1) {
    return { selectedModifiers: [], notes: raw };
  }
  const inner = raw.slice(MODIFIERS_PREFIX.length, endIdx);
  const rest = raw.slice(endIdx + 1).trim();
  const selectedModifiers: SelectedModifier[] = inner
    .split(';')
    .map((part) => part.trim())
    .filter(Boolean)
    .map((entry) => {
      const match = entry.match(/^([^:]+):\s*(.+?)\s*\(\+Rp(-?\d+(?:\.\d+)?)\)$/);
      if (match) {
        return {
          groupName: match[1].trim(),
          optionName: match[2].trim(),
          priceDelta: Number(match[3]) || 0,
        };
      }
      const [groupName, ...optParts] = entry.split(':');
      return {
        groupName: (groupName || 'Option').trim(),
        optionName: optParts.join(':').trim() || entry,
        priceDelta: 0,
      };
    });
  return { selectedModifiers, notes: rest };
}

function mapOrder(row: ApiRow): OrderItem {
  const unitPrice = Number(row.unit_price || 0);
  const quantity = Number(row.quantity || 0);
  const { selectedModifiers, notes } = parseOrderNotes(row.notes);
  const modifierDeltaPerUnit = selectedModifiers.reduce((sum, m) => sum + Number(m.priceDelta || 0), 0);
  const baseLineTotal = Number(row.line_total || unitPrice * quantity);
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
    selectedModifiers,
    notes,
    subtotal: baseLineTotal + modifierDeltaPerUnit * quantity,
    batchNumber: Number(row.batch_number || 1),
    isServed: Boolean(row.is_served),
    cookingStatus: row.cooking_status || 'queue',
    servedAt: row.served_at || undefined,
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
  try {
    return await request<ApiRow>('/api/sessions', {
      method: 'POST',
      body: JSON.stringify({ tableId: table.id, guestCount, waiterStaffId }),
    });
  } catch (error: any) {
    if (error?.status === 409 && error?.body?.sessionId) {
      return { id: String(error.body.sessionId), existing: true };
    }
    throw error;
  }
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
    const menuItemId = bySku.get(item.menuItemId) || (menu.some(row => String(row.id) === item.menuItemId) ? item.menuItemId : undefined);
    if (!menuItemId) throw new Error('SKU menu ' + item.menuItemId + ' tidak ditemukan di katalog API. Pesanan tidak dikirim.');
    return { menuItemId, quantity: item.quantity, notes: serializeOrderNotes(item.selectedModifiers, item.notes) };
  });
  const fingerprint=JSON.stringify(payload);
  let hash=2166136261;
  for(let i=0;i<fingerprint.length;i++) hash=Math.imul(hash^fingerprint.charCodeAt(i),16777619);
  const storageKey='gastro_order_idem:'+sessionId+':'+(hash>>>0).toString(36);
  const store=typeof window!=='undefined'?window.sessionStorage:null;
  const idempotencyKey=store?.getItem(storageKey)||('order-'+crypto.randomUUID());
  store?.setItem(storageKey,idempotencyKey);
  const result=await request<ApiRow>('/api/sessions/' + encodeURIComponent(sessionId) + '/orders', {
    method: 'POST', body: JSON.stringify({ items: payload, idempotencyKey }),
  });
  store?.removeItem(storageKey);
  return result;
}

export async function settleApiSession(sessionId: string, method: 'cash' | 'qris' | 'card' | 'transfer', discountAmount: number, cashReceived?: number, cardBank?: string): Promise<ApiRow> {
  const fingerprint=[method,Number(discountAmount),method==='cash'?Number(cashReceived||0):0,cardBank||''].join(':');
  const storageKey='gastro_payment_idem:'+sessionId+':'+encodeURIComponent(fingerprint);
  const store=typeof window!=='undefined'?window.sessionStorage:null;
  const idempotencyKey=store?.getItem(storageKey)||('payment-'+crypto.randomUUID());
  store?.setItem(storageKey,idempotencyKey);
  const result=await request<ApiRow>('/api/sessions/' + encodeURIComponent(sessionId) + '/payments', {
    method: 'POST',
    body: JSON.stringify({ method, discountAmount, cashReceived: method === 'cash' ? cashReceived : undefined, cardBank, idempotencyKey }),
  });
  store?.removeItem(storageKey);
  return result;
}

export async function cancelApiOrderItem(itemId: string, reason?: string): Promise<ApiRow> {
  return request<ApiRow>('/api/order-items/' + encodeURIComponent(itemId) + '/cancel', {
    method: 'PATCH',
    body: JSON.stringify(reason ? { reason } : {}),
  });
}

export function mapPaymentToTransaction(transaction: Transaction, payment: ApiRow): Transaction {
  return {
    ...transaction,
    status: 'settled',
    isPaid: true,
    paidAt: payment.paid_at,
    paymentMethod: payment.method === 'other' ? 'card' : payment.method,
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
    stock[item.id] = !match ? 0 : match.track_stock ? Math.max(0, Number(match.stock_quantity || 0)) : 999;
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
    stock: row.track_stock ? Math.max(0, Number(row.stock_quantity || 0)) : 999,
    image: row.image_url || undefined,
    description: row.description || undefined,
  }));
}
