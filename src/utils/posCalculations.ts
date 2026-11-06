/**
 * POS domain calculation and workflow helpers.
 *
 * Current scope includes:
 * - Item, discount, service-charge, tax, and settlement calculations.
 * - Routing order items and creating kitchen/bar/checker/customer print tickets.
 * - Recipe-based stock deduction and estimated menu HPP.
 * - KDS queue filtering, status progression, waiter handoff, and queue counts.
 *
 * Most functions are deterministic transformations over the supplied data.
 * Exceptions: ticket IDs and timestamps are generated here when callers do not
 * supply them. This file currently spans several domains; split it by ownership
 * (pricing, printing, inventory, kitchen) only after call sites and tests are mapped.
 *
 * Important: stock deduction clamps stock at zero and this helper does not create
 * a durable inventory ledger. It is current demo behavior, not production stock control.
 */
import {
  OrderItem,
  PrintTicket,
  Transaction,
  MenuItem,
  RawMaterial,
  RecipeIngredient,
  DiscountType,
  CookingStatus,
} from '../types/pos';

export const SERVICE_CHARGE_RATE = 0.05; // 5%
export const PB1_TAX_RATE = 0.10; // 10% Pajak Restoran (PB1)

export function formatRupiah(amount: number): string {
  return new Intl.NumberFormat('id-ID', {
    style: 'currency',
    currency: 'IDR',
    maximumFractionDigits: 0,
  }).format(amount);
}

export function calculateItemSubtotal(
  unitPrice: number,
  quantity: number,
  modifiers: { priceDelta: number }[] = []
): number {
  const modTotal = modifiers.reduce((acc, curr) => acc + (curr.priceDelta || 0), 0);
  return (unitPrice + modTotal) * Math.max(1, quantity);
}

export function computeDiscountAmount(subtotal: number, discountType: DiscountType = 'none'): number {
  const safeSubtotal = Math.max(0, subtotal);
  if (discountType === 'member10') {
    return Math.round(safeSubtotal * 0.1);
  }
  if (discountType === 'promo20k') {
    return Math.min(20000, safeSubtotal);
  }
  return 0;
}

export function calculateOrderTotals(
  items: OrderItem[],
  discountAmount: number = 0,
  serviceChargeRate: number = SERVICE_CHARGE_RATE,
  taxRate: number = PB1_TAX_RATE
): {
  subtotal: number;
  serviceChargeAmount: number;
  taxAmount: number;
  totalAmount: number;
} {
  const subtotal = items.reduce((acc, item) => acc + item.subtotal, 0);
  const afterDiscount = Math.max(0, subtotal - discountAmount);

  // Standard Indonesian F&B PB1 calculation: Service charge is taxed under PB1
  const serviceChargeAmount = Math.round(afterDiscount * serviceChargeRate);
  const taxBase = afterDiscount + serviceChargeAmount;
  const taxAmount = Math.round(taxBase * taxRate);
  const totalAmount = afterDiscount + serviceChargeAmount + taxAmount;

  return {
    subtotal,
    serviceChargeAmount,
    taxAmount,
    totalAmount,
  };
}

export function computeSettlementBreakdown(
  items: OrderItem[],
  discountType: DiscountType = 'none'
): {
  subtotal: number;
  discountAmount: number;
  serviceChargeAmount: number;
  taxAmount: number;
  totalAmount: number;
} {
  const rawSubtotal = items.reduce((acc, item) => acc + item.subtotal, 0);
  const discountAmount = computeDiscountAmount(rawSubtotal, discountType);
  const totals = calculateOrderTotals(items, discountAmount);
  return {
    ...totals,
    discountAmount,
  };
}

export function calculateChange(totalAmount: number, cashGiven: number): number {
  return Math.max(0, cashGiven - totalAmount);
}

export function routeOrderItems(items: OrderItem[]): {
  kitchenItems: OrderItem[];
  barItems: OrderItem[];
} {
  const kitchenItems = items.filter((item) => item.destination === 'kitchen');
  const barItems = items.filter((item) => item.destination === 'bar');
  return { kitchenItems, barItems };
}

export function generatePrintTickets(params: {
  transaction: Transaction;
  batchItems: OrderItem[];
  batchNumber: number;
  type?: 'order' | 'settlement' | 'payment_first';
}): PrintTicket[] {
  const { transaction, batchItems, batchNumber, type = 'order' } = params;
  const now = new Date().toISOString();
  const tickets: PrintTicket[] = [];
  const flowMode =
    type === 'payment_first'
      ? 'payment_first'
      : transaction.paymentFlow || 'payment_last';

  if (type === 'payment_first') {
    // 1. Struk Pembayaran Sah (Customer Receipt - LUNAS DI DEPAN) dicetak pertama
    tickets.push({
      id: `RCP-FIRST-${Date.now()}-${batchNumber}`,
      transactionId: transaction.id,
      tableNumber: transaction.tableNumber,
      type: 'receipt',
      paymentFlow: 'payment_first',
      batchNumber,
      timestamp: now,
      waiterName: transaction.waiterName,
      items: transaction.allCurrentItems,
      notes: `LUNAS DI DEPAN (Payment First) - Batch #${batchNumber}`,
      financials: {
        subtotal: transaction.subtotal,
        serviceCharge: transaction.serviceChargeAmount,
        tax: transaction.taxAmount,
        discount: transaction.discountAmount,
        total: transaction.totalAmount,
        cashGiven: transaction.cashGiven,
        change: transaction.changeAmount,
        paymentMethod: transaction.paymentMethod,
        paymentFlow: 'payment_first',
      },
    });
  }

  if (type === 'order' || type === 'payment_first') {
    const { kitchenItems, barItems } = routeOrderItems(batchItems);

    // Struk Dapur (jika ada pesanan makanan/kitchen)
    if (kitchenItems.length > 0) {
      tickets.push({
        id: `TKT-DAPUR-${Date.now()}-${batchNumber}`,
        transactionId: transaction.id,
        tableNumber: transaction.tableNumber,
        type: 'kitchen',
        paymentFlow: flowMode,
        batchNumber,
        timestamp: now,
        waiterName: transaction.waiterName,
        items: kitchenItems,
        notes: `Batch #${batchNumber} - Pesanan Dapur${flowMode === 'payment_first' ? ' (LUNAS)' : ''}`,
      });
    }

    // Struk Bar (jika ada pesanan minuman/bar)
    if (barItems.length > 0) {
      tickets.push({
        id: `TKT-BAR-${Date.now()}-${batchNumber}`,
        transactionId: transaction.id,
        tableNumber: transaction.tableNumber,
        type: 'bar',
        paymentFlow: flowMode,
        batchNumber,
        timestamp: now,
        waiterName: transaction.waiterName,
        items: barItems,
        notes: `Batch #${batchNumber} - Pesanan Bar${flowMode === 'payment_first' ? ' (LUNAS)' : ''}`,
      });
    }

    // Struk Waiter / Checker (Daftar semua menu batch tersebut dengan checkbox checklist)
    if (batchItems.length > 0) {
      tickets.push({
        id: `TKT-CHECKER-${Date.now()}-${batchNumber}`,
        transactionId: transaction.id,
        tableNumber: transaction.tableNumber,
        type: 'checker',
        paymentFlow: flowMode,
        batchNumber,
        timestamp: now,
        waiterName: transaction.waiterName,
        items: batchItems,
        notes: `Batch #${batchNumber} - Checker Pelayan / Antar Makanan`,
      });
    }
  } else if (type === 'settlement') {
    // Struk Pembayaran Sah (Customer Receipt - Bayar Belakang)
    tickets.push({
      id: `RCP-${Date.now()}`,
      transactionId: transaction.id,
      tableNumber: transaction.tableNumber,
      type: 'receipt',
      paymentFlow: flowMode,
      timestamp: now,
      waiterName: transaction.waiterName,
      items: transaction.allCurrentItems,
      financials: {
        subtotal: transaction.subtotal,
        serviceCharge: transaction.serviceChargeAmount,
        tax: transaction.taxAmount,
        discount: transaction.discountAmount,
        total: transaction.totalAmount,
        cashGiven: transaction.cashGiven,
        change: transaction.changeAmount,
        paymentMethod: transaction.paymentMethod,
        paymentFlow: flowMode,
      },
    });
  }

  return tickets;
}

export function calculateOrderHPP(items: OrderItem[], menuItems: MenuItem[]): number {
  const menuMap = new Map<string, number>();
  menuItems.forEach((m) => menuMap.set(m.id, m.cost || 0));

  return items.reduce((acc, item) => {
    const unitCost = menuMap.get(item.menuItemId) || 0;
    return acc + unitCost * item.quantity;
  }, 0);
}

export function deductRecipeMaterials(
  items: OrderItem[],
  materials: RawMaterial[],
  menuItems: MenuItem[]
): {
  updatedMaterials: RawMaterial[];
  deductedUsage: Record<string, number>;
  lowStockAlerts: string[];
} {
  const recipeMap = new Map<string, RecipeIngredient[]>();
  menuItems.forEach((m) => {
    if (m.recipe) recipeMap.set(m.id, m.recipe);
  });

  const deductedUsage: Record<string, number> = {};

  items.forEach((item) => {
    const ingredients = recipeMap.get(item.menuItemId);
    if (ingredients) {
      ingredients.forEach((ing) => {
        const totalAmount = ing.amount * item.quantity;
        deductedUsage[ing.rawMaterialId] = (deductedUsage[ing.rawMaterialId] || 0) + totalAmount;
      });
    }
  });

  const lowStockAlerts: string[] = [];

  const updatedMaterials = materials.map((mat) => {
    const used = deductedUsage[mat.id] || 0;
    const newStock = Math.max(0, Math.round((mat.currentStock - used) * 100) / 100);

    if (newStock <= mat.minStock) {
      lowStockAlerts.push(`${mat.name} tersisa ${newStock} ${mat.unit} (Di bawah batas aman ${mat.minStock} ${mat.unit})`);
    }

    return {
      ...mat,
      currentStock: newStock,
    };
  });

  return { updatedMaterials, deductedUsage, lowStockAlerts };
}

/**
 * Returns true if an item still belongs in the active KDS cooking/bar queue.
 * Once handed off to the waiter ('handed_off') or already served ('isServed'),
 * it disappears from the active KDS board.
 */
export function isKdsItemActive(item: OrderItem): boolean {
  return !item.isServed && item.cookingStatus !== 'handed_off';
}

/**
 * Returns true if KDS has finished & handed the item off to the waiter,
 * and the waiter has not yet ticked it as served at the table.
 */
export function isItemWaitingForWaiter(item: OrderItem): boolean {
  return !item.isServed && item.cookingStatus === 'handed_off';
}

/**
 * Advances KDS item status monotonically:
 * queue -> cooking -> ready -> handed_off (never loops back to queue).
 */
export function advanceKdsItemStatus(current?: CookingStatus): CookingStatus {
  const status = current || 'queue';
  if (status === 'queue') return 'cooking';
  if (status === 'cooking') return 'ready';
  return 'handed_off';
}

export interface KdsTicketView {
  transaction: Transaction;
  items: OrderItem[];
  readyCount: number;
}

/**
 * Builds the active KDS ticket list. Completed/handed-off items and tables
 * with zero remaining active items automatically disappear from KDS.
 */
export function getActiveKdsTickets(
  transactions: Record<string, Transaction>,
  stationFilter: 'all' | 'kitchen' | 'bar' = 'all'
): KdsTicketView[] {
  return Object.values(transactions)
    .filter((tx) => tx.status === 'active')
    .map((tx) => {
      const items = tx.allCurrentItems.filter((item) => {
        if (!isKdsItemActive(item)) return false;
        if (stationFilter !== 'all' && item.destination !== stationFilter) return false;
        return true;
      });
      const readyCount = items.filter((item) => item.cookingStatus === 'ready').length;
      return { transaction: tx, items, readyCount };
    })
    .filter((entry) => entry.items.length > 0);
}

/**
 * Builds the handed-off KDS history list (items already passed to waiter or served)
 * so kitchen/bar staff can review or recall an accidentally bumped item.
 */
export function getHandedOffKdsTickets(
  transactions: Record<string, Transaction>,
  stationFilter: 'all' | 'kitchen' | 'bar' = 'all'
): { transaction: Transaction; items: OrderItem[] }[] {
  return Object.values(transactions)
    .filter((tx) => tx.status === 'active')
    .map((tx) => {
      const items = tx.allCurrentItems.filter((item) => {
        if (isKdsItemActive(item)) return false;
        if (stationFilter !== 'all' && item.destination !== stationFilter) return false;
        return true;
      });
      return { transaction: tx, items };
    })
    .filter((entry) => entry.items.length > 0);
}

/**
 * Pure transformer that hands off targeted items in a transaction from KDS to Waiter.
 */
export function handoffTransactionItemsToWaiter(
  tx: Transaction,
  options: {
    itemIds?: string[];
    stationFilter?: 'all' | 'kitchen' | 'bar';
    onlyReady?: boolean;
    nowIso?: string;
  } = {}
): Transaction {
  const { itemIds, stationFilter = 'all', onlyReady = false, nowIso = new Date().toISOString() } = options;
  const idSet = itemIds ? new Set(itemIds) : null;

  const shouldHandoff = (item: OrderItem): boolean => {
    if (!isKdsItemActive(item)) return false;
    if (idSet && !idSet.has(item.id)) return false;
    if (stationFilter !== 'all' && item.destination !== stationFilter) return false;
    if (onlyReady && item.cookingStatus !== 'ready') return false;
    return true;
  };

  const mapItem = (item: OrderItem): OrderItem =>
    shouldHandoff(item)
      ? {
          ...item,
          cookingStatus: 'handed_off',
          handedOffAt: nowIso,
        }
      : item;

  return {
    ...tx,
    allCurrentItems: tx.allCurrentItems.map(mapItem),
    batches: tx.batches.map((b) => ({
      ...b,
      items: b.items.map(mapItem),
    })),
  };
}

export function countActiveKdsItems(transactions: Record<string, Transaction>): number {
  return Object.values(transactions)
    .filter((tx) => tx.status === 'active')
    .reduce((acc, tx) => acc + tx.allCurrentItems.filter(isKdsItemActive).length, 0);
}

export function countWaiterPickupItems(transactions: Record<string, Transaction>): number {
  return Object.values(transactions)
    .filter((tx) => tx.status === 'active')
    .reduce((acc, tx) => acc + tx.allCurrentItems.filter(isItemWaitingForWaiter).length, 0);
}
