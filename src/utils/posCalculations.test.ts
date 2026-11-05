import test from 'node:test';
import assert from 'node:assert/strict';
import {
  calculateItemSubtotal,
  calculateOrderTotals,
  computeDiscountAmount,
  computeSettlementBreakdown,
  calculateChange,
  generatePrintTickets,
  deductRecipeMaterials,
  advanceKdsItemStatus,
  getActiveKdsTickets,
  getHandedOffKdsTickets,
  handoffTransactionItemsToWaiter,
  countActiveKdsItems,
  countWaiterPickupItems,
} from './posCalculations';
import { OrderItem, Transaction, RawMaterial, MenuItem } from '../types/pos';

const sampleFoodItem: OrderItem = {
  id: 'item-1',
  menuItemId: 'food-1',
  name: 'Nasi Goreng Spesial Resto',
  category: 'makanan',
  destination: 'kitchen',
  unitPrice: 38000,
  quantity: 2,
  selectedModifiers: [],
  notes: '',
  subtotal: 76000,
  batchNumber: 1,
  isServed: false,
};

const sampleDrinkItem: OrderItem = {
  id: 'item-2',
  menuItemId: 'bev-1',
  name: 'Es Teh Manis Jasmine',
  category: 'minuman',
  destination: 'bar',
  unitPrice: 9000,
  quantity: 2,
  selectedModifiers: [],
  notes: '',
  subtotal: 18000,
  batchNumber: 1,
  isServed: false,
};

function makeSampleTx(items: OrderItem[], overrides: Partial<Transaction> = {}): Transaction {
  const totals = calculateOrderTotals(items, overrides.discountAmount || 0);
  return {
    id: 'TRX-TEST-001',
    tableId: 'T02',
    tableNumber: '02',
    area: 'indoor',
    guestCount: 2,
    waiterName: 'Budi Prasetyo',
    openedAt: '2026-11-02T10:00:00.000Z',
    status: 'active',
    batches: [{ batchNumber: 1, timestamp: '2026-11-02T10:00:00.000Z', items }],
    allCurrentItems: items,
    subtotal: totals.subtotal,
    serviceChargeRate: 0.05,
    serviceChargeAmount: totals.serviceChargeAmount,
    taxRate: 0.1,
    taxAmount: totals.taxAmount,
    discountAmount: overrides.discountAmount || 0,
    totalAmount: totals.totalAmount,
    ...overrides,
  };
}

test('calculateItemSubtotal sums modifiers and respects quantity', () => {
  assert.equal(calculateItemSubtotal(38000, 2, [{ priceDelta: 5000 }]), 86000);
  assert.equal(calculateItemSubtotal(20000, 0, []), 20000);
});

test('computeSettlementBreakdown calculates discounts, 5% service charge, and 10% PB1 accurately', () => {
  const items = [sampleFoodItem, sampleDrinkItem]; // subtotal = 94,000
  const noDisc = computeSettlementBreakdown(items, 'none');
  assert.equal(noDisc.subtotal, 94000);
  assert.equal(noDisc.discountAmount, 0);
  assert.equal(noDisc.serviceChargeAmount, 4700); // 5% of 94,000
  assert.equal(noDisc.taxAmount, 9870); // 10% of (94,000 + 4,700)
  assert.equal(noDisc.totalAmount, 108570);

  const memberDisc = computeSettlementBreakdown(items, 'member10');
  assert.equal(memberDisc.discountAmount, 9400);
  // afterDiscount = 84,600 -> service 5% = 4,230 -> PB1 10% of 88,830 = 8,883 -> total = 97,713
  assert.equal(memberDisc.serviceChargeAmount, 4230);
  assert.equal(memberDisc.taxAmount, 8883);
  assert.equal(memberDisc.totalAmount, 97713);

  assert.equal(computeDiscountAmount(15000, 'promo20k'), 15000);
  assert.equal(computeDiscountAmount(50000, 'promo20k'), 20000);
});

test('calculateChange returns exact change and clamps negative change to zero', () => {
  assert.equal(calculateChange(108570, 150000), 41430);
  assert.equal(calculateChange(108570, 108570), 0);
  assert.equal(calculateChange(108570, 50000), 0);
});

test('generatePrintTickets for Payment Last (type="order") emits Kitchen, Bar, and Checker without Receipt', () => {
  const items = [sampleFoodItem, sampleDrinkItem];
  const tx = makeSampleTx(items, { paymentFlow: 'payment_last', isPaid: false });
  const tickets = generatePrintTickets({
    transaction: tx,
    batchItems: items,
    batchNumber: 1,
    type: 'order',
  });

  assert.equal(tickets.length, 3);
  assert.deepEqual(
    tickets.map((t) => t.type),
    ['kitchen', 'bar', 'checker']
  );
  assert.equal(tickets.every((t) => t.paymentFlow === 'payment_last'), true);
});

test('generatePrintTickets for Payment First (type="payment_first") emits Official Receipt FIRST plus Kitchen, Bar, and Checker', () => {
  const items = [sampleFoodItem, sampleDrinkItem];
  const tx = makeSampleTx(items, {
    status: 'settled',
    paymentFlow: 'payment_first',
    isPaid: true,
    paymentMethod: 'cash',
    cashGiven: 120000,
    changeAmount: 11430,
  });

  const tickets = generatePrintTickets({
    transaction: tx,
    batchItems: items,
    batchNumber: 1,
    type: 'payment_first',
  });

  assert.equal(tickets.length, 4);
  assert.deepEqual(
    tickets.map((t) => t.type),
    ['receipt', 'kitchen', 'bar', 'checker']
  );
  assert.equal(tickets[0].paymentFlow, 'payment_first');
  assert.equal(tickets[0].financials?.paymentFlow, 'payment_first');
  assert.equal(tickets[0].financials?.total, 108570);
  assert.equal(tickets[0].financials?.cashGiven, 120000);
  assert.equal(tickets[0].financials?.change, 11430);
});

test('generatePrintTickets for Settlement (type="settlement") emits Customer Receipt only', () => {
  const items = [sampleFoodItem];
  const tx = makeSampleTx(items, {
    status: 'settled',
    paymentFlow: 'payment_last',
    isPaid: true,
    paymentMethod: 'qris',
  });

  const tickets = generatePrintTickets({
    transaction: tx,
    batchItems: items,
    batchNumber: 1,
    type: 'settlement',
  });

  assert.equal(tickets.length, 1);
  assert.equal(tickets[0].type, 'receipt');
  assert.equal(tickets[0].financials?.paymentMethod, 'qris');
});

test('deductRecipeMaterials deducts BOM ingredients and reports low stock alerts', () => {
  const materials: RawMaterial[] = [
    {
      id: 'rm-rice',
      name: 'Beras Pandan Wangi',
      unit: 'kg',
      currentStock: 2.2,
      minStock: 2.0,
      costPerUnit: 15000,
      storageZone: 'Dry Storage',
    },
  ];
  const menus: MenuItem[] = [
    {
      id: 'food-1',
      name: 'Nasi Goreng Spesial Resto',
      category: 'makanan',
      destination: 'kitchen',
      price: 38000,
      cost: 12000,
      stock: 50,
      recipe: [{ rawMaterialId: 'rm-rice', amount: 0.2 }],
    },
  ];

  const result = deductRecipeMaterials([sampleFoodItem], materials, menus);
  assert.equal(result.updatedMaterials[0].currentStock, 1.8);
  assert.equal(result.lowStockAlerts.length, 1);
});

test('advanceKdsItemStatus progresses queue -> cooking -> ready -> handed_off without cycling back to queue', () => {
  assert.equal(advanceKdsItemStatus(undefined), 'cooking');
  assert.equal(advanceKdsItemStatus('queue'), 'cooking');
  assert.equal(advanceKdsItemStatus('cooking'), 'ready');
  assert.equal(advanceKdsItemStatus('ready'), 'handed_off');
  assert.equal(advanceKdsItemStatus('handed_off'), 'handed_off');
});

test('KDS active tickets remove handed-off and served items and transfer them to waiter pickup count', () => {
  const itemA: OrderItem = { ...sampleFoodItem, id: 'kds-1', cookingStatus: 'ready', isServed: false };
  const itemB: OrderItem = { ...sampleDrinkItem, id: 'kds-2', cookingStatus: 'cooking', isServed: false };
  const tx = makeSampleTx([itemA, itemB], { id: 'TRX-KDS-1', tableNumber: '05' });

  // Initially both items appear in active KDS
  assert.equal(countActiveKdsItems({ [tx.id]: tx }), 2);
  assert.equal(countWaiterPickupItems({ [tx.id]: tx }), 0);
  assert.equal(getActiveKdsTickets({ [tx.id]: tx }, 'all')[0].items.length, 2);

  // Handoff only ready items (itemA) -> itemA disappears from KDS and enters Waiter Pickup queue
  const afterReadyHandoff = handoffTransactionItemsToWaiter(tx, {
    onlyReady: true,
    nowIso: '2026-11-02T10:15:00.000Z',
  });
  const map1 = { [tx.id]: afterReadyHandoff };
  assert.equal(countActiveKdsItems(map1), 1);
  assert.equal(countWaiterPickupItems(map1), 1);
  assert.equal(getActiveKdsTickets(map1, 'all')[0].items.length, 1);
  assert.equal(getActiveKdsTickets(map1, 'all')[0].items[0].id, 'kds-2');
  assert.equal(getActiveKdsTickets(map1, 'kitchen').length, 0); // Kitchen ticket completely gone!
  assert.equal(getHandedOffKdsTickets(map1, 'all')[0].items.length, 1);

  // Handoff remaining items on table -> entire table ticket disappears from active KDS
  const afterFullHandoff = handoffTransactionItemsToWaiter(afterReadyHandoff, {
    nowIso: '2026-11-02T10:18:00.000Z',
  });
  const map2 = { [tx.id]: afterFullHandoff };
  assert.equal(countActiveKdsItems(map2), 0);
  assert.equal(countWaiterPickupItems(map2), 2);
  assert.equal(getActiveKdsTickets(map2, 'all').length, 0);

  // Waiter checks off items as served -> waiter pickup count drops to 0 and KDS remains empty
  const afterWaiterServed: Transaction = {
    ...afterFullHandoff,
    allCurrentItems: afterFullHandoff.allCurrentItems.map((i) => ({ ...i, isServed: true })),
  };
  const map3 = { [tx.id]: afterWaiterServed };
  assert.equal(countActiveKdsItems(map3), 0);
  assert.equal(countWaiterPickupItems(map3), 0);
});

