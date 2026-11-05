import test from 'node:test';
import assert from 'node:assert/strict';
import {
  authenticateByPin,
  authenticateByNfc,
  getRolePermissions,
  calculateFinanceMetrics,
  DEFAULT_STAFF_ACCOUNTS,
} from './authRoles';
import { Transaction, PettyCashEntry } from '../types/pos';

test('authenticateByPin authenticates owner, cashier, and finance accurately', () => {
  // Test Owner (9999)
  const ownerAuth = authenticateByPin('9999');
  assert.equal(ownerAuth.success, true);
  assert.equal(ownerAuth.staff?.role, 'owner');
  assert.equal(ownerAuth.staff?.name, 'Hendrawan Kusuma');

  // Test Cashier (1234)
  const cashierAuth = authenticateByPin('1234');
  assert.equal(cashierAuth.success, true);
  assert.equal(cashierAuth.staff?.role, 'cashier');
  assert.equal(cashierAuth.staff?.name, 'Budi Prasetyo');

  // Test Finance (5678)
  const financeAuth = authenticateByPin('5678');
  assert.equal(financeAuth.success, true);
  assert.equal(financeAuth.staff?.role, 'finance');
  assert.equal(financeAuth.staff?.name, 'Ratna Dewi');

  // Test Invalid PIN
  const invalidAuth = authenticateByPin('0000');
  assert.equal(invalidAuth.success, false);
  assert.match(invalidAuth.error || '', /PIN tidak terdaftar/);

  // Test Empty PIN
  const emptyAuth = authenticateByPin('');
  assert.equal(emptyAuth.success, false);
});

test('authenticateByNfc authenticates via NFC tag UID', () => {
  const nfcOwner = authenticateByNfc('NFC-OWNER-99');
  assert.equal(nfcOwner.success, true);
  assert.equal(nfcOwner.staff?.role, 'owner');

  const nfcCashier = authenticateByNfc('nfc-cashier-12'); // case-insensitive
  assert.equal(nfcCashier.success, true);
  assert.equal(nfcCashier.staff?.role, 'cashier');

  const invalidNfc = authenticateByNfc('UNKNOWN-TAG-XYZ');
  assert.equal(invalidNfc.success, false);
  assert.match(invalidNfc.error || '', /tidak dikenali/);
});

test('getRolePermissions assigns distinct capabilities per role', () => {
  const ownerPerms = getRolePermissions('owner');
  assert.equal(ownerPerms.canOperatePOS, true);
  assert.equal(ownerPerms.canAccessFinance, true);
  assert.equal(ownerPerms.canAccessOwnerDashboard, true);
  assert.equal(ownerPerms.canResetDemo, true);

  const cashierPerms = getRolePermissions('cashier');
  assert.equal(cashierPerms.canOperatePOS, true);
  assert.equal(cashierPerms.canAccessFinance, false);
  assert.equal(cashierPerms.canAccessOwnerDashboard, false);
  assert.equal(cashierPerms.canResetDemo, false);

  const financePerms = getRolePermissions('finance');
  assert.equal(financePerms.canOperatePOS, false);
  assert.equal(financePerms.canAccessFinance, true);
  assert.equal(financePerms.canManagePettyCash, true);
  assert.equal(financePerms.canAccessOwnerDashboard, false);
});

test('calculateFinanceMetrics sums revenue, tax, and petty cash expenses accurately', () => {
  const mockSettledTx: Transaction[] = [
    {
      id: 'TX-1',
      tableId: 'T1',
      tableNumber: '01',
      area: 'indoor',
      guestCount: 2,
      waiterName: 'Doni',
      openedAt: '2026-11-04T12:00:00Z',
      paidAt: '2026-11-04T12:45:00Z',
      status: 'settled',
      isPaid: true,
      paymentMethod: 'cash',
      subtotal: 100000,
      serviceChargeRate: 0.05,
      serviceChargeAmount: 5000,
      taxRate: 0.1,
      taxAmount: 10500,
      discountAmount: 0,
      totalAmount: 115500,
      batches: [],
      allCurrentItems: [],
    },
    {
      id: 'TX-2',
      tableId: 'T2',
      tableNumber: '02',
      area: 'indoor',
      guestCount: 3,
      waiterName: 'Siti',
      openedAt: '2026-11-04T12:10:00Z',
      paidAt: '2026-11-04T12:55:00Z',
      status: 'settled',
      isPaid: true,
      paymentMethod: 'qris',
      subtotal: 200000,
      serviceChargeRate: 0.05,
      serviceChargeAmount: 10000,
      taxRate: 0.1,
      taxAmount: 21000,
      discountAmount: 0,
      totalAmount: 231000,
      batches: [],
      allCurrentItems: [],
    },
  ];

  const mockPettyCash: PettyCashEntry[] = [
    {
      id: 'PC-1',
      timestamp: '2026-11-04T13:00:00Z',
      description: 'Isi Ulang Gas LPG 12kg',
      category: 'operasional',
      amount: 45000,
      recordedBy: 'Ratna Dewi',
    },
  ];

  const metrics = calculateFinanceMetrics(mockSettledTx, mockPettyCash);
  assert.equal(metrics.totalOmzetKotor, 346500);
  assert.equal(metrics.totalTaxPB1, 31500);
  assert.equal(metrics.cashPayments, 115500);
  assert.equal(metrics.qrisPayments, 231000);
  assert.equal(metrics.totalPettyCash, 45000);
  assert.equal(metrics.cashInDrawer, 115500 - 45000); // 70500
  assert.equal(metrics.totalTransactions, 2);
});
