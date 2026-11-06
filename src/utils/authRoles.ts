/**
 * Demo staff identity, role capabilities, and finance summary helpers.
 *
 * Responsibilities:
 * - Supplies sample staff accounts used by the current demo login flow.
 * - Matches demo PIN/NFC values against the supplied staff list.
 * - Maps application roles to UI capability flags.
 * - Calculates the finance dashboard's current summary metrics.
 *
 * Security boundary: the sample credentials and client-side checks in this module
 * are not production authentication or authorization. Production access decisions
 * must be enforced by a trusted backend; never treat these values as secrets.
 *
 * Note: finance calculations are colocated here today for compatibility, but belong
 * in a finance domain module when the source organization is split.
 */
import { StaffAccount, UserRole, Transaction, PettyCashEntry } from '../types/pos';

export const DEFAULT_STAFF_ACCOUNTS: StaffAccount[] = [
  {
    id: 'staff-owner-01',
    name: 'Hendrawan Kusuma',
    role: 'owner',
    pin: '9999',
    nfcTagUid: 'NFC-OWNER-99',
    avatarColor: 'bg-amber-500',
    roleLabel: 'Owner / Executive',
  },
  {
    id: 'staff-cashier-01',
    name: 'Budi Prasetyo',
    role: 'cashier',
    pin: '1234',
    nfcTagUid: 'NFC-CASHIER-12',
    avatarColor: 'bg-emerald-600',
    roleLabel: 'Kasir Front-of-House',
  },
  {
    id: 'staff-finance-01',
    name: 'Ratna Dewi',
    role: 'finance',
    pin: '5678',
    nfcTagUid: 'NFC-FINANCE-56',
    avatarColor: 'bg-indigo-600',
    roleLabel: 'Finance & Tax PB1',
  },
];

export interface AuthResult {
  success: boolean;
  staff?: StaffAccount;
  error?: string;
}

/**
 * Authenticate staff using numeric PIN (4 digits).
 */
export function authenticateByPin(
  pin: string,
  staffList: StaffAccount[] = DEFAULT_STAFF_ACCOUNTS
): AuthResult {
  const cleanPin = pin.trim();
  if (!cleanPin) {
    return { success: false, error: 'Masukkan PIN 4 digit Anda.' };
  }

  const found = staffList.find((s) => s.pin === cleanPin);
  if (!found) {
    return { success: false, error: 'PIN tidak terdaftar. Periksa kembali PIN Anda.' };
  }

  return { success: true, staff: found };
}

/**
 * Authenticate staff using NFC Tag UID / Serial.
 */
export function authenticateByNfc(
  tagUid: string,
  staffList: StaffAccount[] = DEFAULT_STAFF_ACCOUNTS
): AuthResult {
  const cleanUid = tagUid.trim().toUpperCase();
  if (!cleanUid) {
    return { success: false, error: 'NFC Tag tidak terdeteksi.' };
  }

  const found = staffList.find((s) => s.nfcTagUid.toUpperCase() === cleanUid);
  if (!found) {
    return { success: false, error: 'Kartu NFC tidak dikenali oleh sistem resto.' };
  }

  return { success: true, staff: found };
}

export interface RolePermissions {
  canOperatePOS: boolean;
  canAccessKds: boolean;
  canAccessChecker: boolean;
  canAccessInventory: boolean;
  canAccessFinance: boolean;
  canAccessOwnerDashboard: boolean;
  canManagePettyCash: boolean;
  canResetDemo: boolean;
}

/**
 * Get distinct granular capabilities for each role.
 */
export function getRolePermissions(role: UserRole): RolePermissions {
  switch (role) {
    case 'owner':
      return {
        canOperatePOS: true,
        canAccessKds: true,
        canAccessChecker: true,
        canAccessInventory: true,
        canAccessFinance: true,
        canAccessOwnerDashboard: true,
        canManagePettyCash: true,
        canResetDemo: true,
      };
    case 'finance':
      return {
        canOperatePOS: false,
        canAccessKds: false,
        canAccessChecker: false,
        canAccessInventory: true,
        canAccessFinance: true,
        canAccessOwnerDashboard: false,
        canManagePettyCash: true,
        canResetDemo: false,
      };
    case 'cashier':
    default:
      return {
        canOperatePOS: true,
        canAccessKds: true,
        canAccessChecker: true,
        canAccessInventory: false,
        canAccessFinance: false,
        canAccessOwnerDashboard: false,
        canManagePettyCash: false,
        canResetDemo: false,
      };
  }
}

/**
 * Financial metrics calculation for Finance & Owner views
 */
export function calculateFinanceMetrics(
  settledTx: Transaction[],
  pettyCash: PettyCashEntry[]
) {
  const totalOmzetKotor = settledTx.reduce((acc, tx) => acc + tx.totalAmount, 0);
  const totalSubtotal = settledTx.reduce((acc, tx) => acc + tx.subtotal, 0);
  const totalServiceCharge = settledTx.reduce((acc, tx) => acc + tx.serviceChargeAmount, 0);
  const totalTaxPB1 = settledTx.reduce((acc, tx) => acc + tx.taxAmount, 0);
  const totalDiscounts = settledTx.reduce((acc, tx) => acc + tx.discountAmount, 0);

  // Breakdown by payment method
  const cashPayments = settledTx
    .filter((tx) => tx.paymentMethod === 'cash')
    .reduce((acc, tx) => acc + tx.totalAmount, 0);
  const qrisPayments = settledTx
    .filter((tx) => tx.paymentMethod === 'qris')
    .reduce((acc, tx) => acc + tx.totalAmount, 0);
  const cardPayments = settledTx
    .filter((tx) => tx.paymentMethod === 'card')
    .reduce((acc, tx) => acc + tx.totalAmount, 0);

  // Total petty cash expenses
  const totalPettyCash = pettyCash.reduce((acc, p) => acc + p.amount, 0);

  // Cash in drawer = Cash collected - Petty Cash out
  const cashInDrawer = Math.max(0, cashPayments - totalPettyCash);

  // Estimated Food Cost HPP ~36% of subtotal
  const estimatedHpp = Math.round(totalSubtotal * 0.36);

  // Gross profit before petty cash
  const grossProfit = Math.round(totalSubtotal * 0.64 - totalDiscounts);

  // Net operating profit = Gross Profit - Petty Cash expenses
  const netOperatingProfit = Math.round(grossProfit - totalPettyCash);

  return {
    totalOmzetKotor,
    totalSubtotal,
    totalServiceCharge,
    totalTaxPB1,
    totalDiscounts,
    cashPayments,
    qrisPayments,
    cardPayments,
    totalPettyCash,
    cashInDrawer,
    estimatedHpp,
    grossProfit,
    netOperatingProfit,
    totalTransactions: settledTx.length,
  };
}
