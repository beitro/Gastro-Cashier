import { StaffAccount, Table, Transaction, OrderItem, OrderBatch, UserRole } from '../types/pos';

declare module '../types/pos' {
  interface StaffAccount {
    status?: 'active' | 'inactive' | 'blocked';
    isActive?: boolean;
    outletId?: string;
    outletName?: string;
    tenantId?: string;
    blockedReason?: string;
    memberships?: { outletId: string; outletName: string; role: UserRole; status: 'active' | 'inactive' | 'blocked' }[];
  }
  interface Table {
    outletId?: string;
    sessionVersion?: number;
    reservedByStaffId?: string;
    reservedAt?: string;
    reservationNote?: string;
  }
  interface Transaction {
    outletId?: string;
    sessionVersion?: number;
    openedByStaffId?: string;
    openedByStaffName?: string;
    cashierName?: string;
    nextBatchNumber?: number;
  }
  interface OrderItem {
    createdByStaffId?: string;
    createdByStaffName?: string;
    createdAt?: string;
  }
  interface OrderBatch {
    createdByStaffId?: string;
    createdByStaffName?: string;
  }
}

export const DEFAULT_TENANT_ID = 'tenant-nusantara';
export const DEFAULT_OUTLET_ID = 'outlet-nusantara-01';
export const DEFAULT_OUTLET_NAME = 'Resto Nusantara - Outlet Utama';

export type AuditEvent = {
  id: string; at: string; action: string; outcome: 'allow' | 'deny';
  staffId?: string; staffName?: string; outletId?: string; tableId?: string; message: string;
};

export function audit(action: string, outcome: 'allow' | 'deny', message: string, staff?: StaffAccount | null, table?: Table) {
  try {
    const key = 'resto_pos_audit_v1';
    const old = JSON.parse(localStorage.getItem(key) || '[]') as AuditEvent[];
    old.unshift({ id: 'aud-' + Date.now() + '-' + Math.random().toString(36).slice(2, 8), at: new Date().toISOString(), action, outcome, message, staffId: staff?.id, staffName: staff?.name, outletId: staff?.outletId, tableId: table?.id });
    localStorage.setItem(key, JSON.stringify(old.slice(0, 500)));
  } catch { /* local audit is best effort; backend append-only audit is required for production */ }
}

export function migrateStaff(staff: StaffAccount | null): StaffAccount | null {
  if (!staff) return null;
  const status = staff.status || (staff.isActive === false ? 'inactive' : 'active');
  const outletId = staff.outletId || DEFAULT_OUTLET_ID;
  const outletName = staff.outletName || DEFAULT_OUTLET_NAME;
  return { ...staff, status, isActive: status === 'active', outletId, outletName, tenantId: staff.tenantId || DEFAULT_TENANT_ID,
    memberships: staff.memberships?.length ? staff.memberships : [{ outletId, outletName, role: staff.role, status }] };
}
export function migrateTables(tables: Table[]): Table[] {
  return (tables || []).map(t => ({ ...t, outletId: t.outletId || DEFAULT_OUTLET_ID, sessionVersion: t.sessionVersion ?? ((t.status === 'occupied' || t.status === 'billing') ? 1 : 0) }));
}
export function migrateTransactions(map: Record<string, Transaction>): Record<string, Transaction> {
  const out: Record<string, Transaction> = {};
  Object.entries(map || {}).forEach(([id, tx]) => {
    const batches = (tx.batches || []).map(b => ({ ...b, items: (b.items || []).map(i => ({ ...i })) }));
    const max = batches.reduce((n, b) => Math.max(n, b.batchNumber || 0), 0);
    out[id] = { ...tx, outletId: tx.outletId || DEFAULT_OUTLET_ID, sessionVersion: tx.sessionVersion ?? 1, batches, allCurrentItems: (tx.allCurrentItems || []).map(i => ({ ...i })), nextBatchNumber: tx.nextBatchNumber ?? max + 1 };
  });
  return out;
}
export function authenticateStaff(staff: StaffAccount): StaffAccount | null {
  const migrated = migrateStaff(staff)!;
  if ((migrated.status || 'active') !== 'active') return null;
  const membership = (migrated.memberships || []).find(m => m.status === 'active');
  if (!membership) return null;
  return { ...migrated, role: membership.role, outletId: membership.outletId, outletName: membership.outletName };
}
export function canOperatePOS(staff: StaffAccount | null): boolean {
  return !!staff && staff.status !== 'blocked' && staff.status !== 'inactive' && staff.role !== 'finance';
}
export function canApproveCancellation(staff: StaffAccount | null): boolean { return !!staff && staff.role === 'owner' && staff.status !== 'blocked' && staff.status !== 'inactive'; }
export function isSameOutlet(staff: StaffAccount | null, table: Table): boolean {
  if (!staff) return false;
  if (staff.role === 'owner') return true;
  return (staff.outletId || DEFAULT_OUTLET_ID) === (table.outletId || DEFAULT_OUTLET_ID);
}
export function assertTableAccess(staff: StaffAccount | null, table: Table, txs: Record<string, Transaction>) {
  if (!staff) { audit('table.select','deny','Belum login',staff,table); return { ok:false as const, message:'Belum login.' }; }
  if (staff.status && staff.status !== 'active') { audit('table.select','deny','Akun nonaktif/diblokir',staff,table); return { ok:false as const, message:'Akun staff tidak aktif.' }; }
  if (!canOperatePOS(staff)) { audit('table.select','deny','Role tidak memiliki akses POS',staff,table); return { ok:false as const, message:'Role Anda tidak memiliki akses POS.' }; }
  if (!isSameOutlet(staff,table)) { audit('table.select','deny','Outlet tidak cocok',staff,table); return { ok:false as const, message:'Akses ditolak: meja berada di outlet lain.' }; }
  if (table.status === 'reserved' && table.reservedByStaffId && table.reservedByStaffId !== staff.id && staff.role !== 'owner') {
    audit('table.reserved','deny','Izin reservasi ditolak',staff,table); return { ok:false as const, message:'Reservasi ini hanya dapat dibuka oleh staff yang ditugaskan.' };
  }
  audit('table.select','allow','Akses meja diizinkan',staff,table);
  return { ok:true as const };
}
export function nextBatchNumber(tx?: Transaction): number {
  if (!tx) return 1;
  return Math.max(tx.nextBatchNumber || 1, tx.batches.reduce((n,b)=>Math.max(n,(b.batchNumber||0)+1),1));
}
export function nextTransactionId(outletId?: string): string {
  const prefix = (outletId || 'TX').replace(/[^a-z0-9]/gi,'').slice(-4).toUpperCase();
  return 'TRX-' + prefix + '-' + Date.now().toString(36).toUpperCase() + '-' + Math.random().toString(36).slice(2,8).toUpperCase();
}
export function createSession(table: Table, staff: StaffAccount, guestCount: number, txs: Record<string,Transaction>) {
  if (table.currentTransactionId && txs[table.currentTransactionId]) return { ok:true as const, transaction:txs[table.currentTransactionId], created:false };
  if (table.status === 'occupied' || table.status === 'billing') return { ok:false as const, message:'Meja berstatus terisi tetapi sesi aktif tidak ditemukan. Muat ulang data atau periksa transaksi.' };
  const now = new Date().toISOString();
  const outletId = table.outletId || staff.outletId || DEFAULT_OUTLET_ID;
  const id = nextTransactionId(outletId);
  const tx: Transaction = { id, tableId:table.id, tableNumber:table.tableNumber, area:table.area, guestCount, waiterName:staff.name, openedAt:now, status:'active', paymentFlow:'payment_last', batches:[], allCurrentItems:[], subtotal:0, serviceChargeRate:0.05, serviceChargeAmount:0, taxRate:0.1, taxAmount:0, discountAmount:0, totalAmount:0, outletId, sessionVersion:1, openedByStaffId:staff.id, openedByStaffName:staff.name, cashierName:staff.name, nextBatchNumber:1 };
  audit('session.create_local','allow','Dining session dibuat secara lokal',staff,table);
  return { ok:true as const, transaction:tx, created:true };
}
export function appendBatch(tx: Transaction, items: OrderItem[], staff: StaffAccount): Transaction {
  const batchNumber = nextBatchNumber(tx);
  const now = new Date().toISOString();
  const stamped = items.map(item => ({ ...item, batchNumber, createdByStaffId:staff.id, createdByStaffName:staff.name, createdAt:now }));
  const batch: OrderBatch = { batchNumber, timestamp:now, items:stamped, createdByStaffId:staff.id, createdByStaffName:staff.name };
  return { ...tx, batches:[...tx.batches,batch], allCurrentItems:[...tx.allCurrentItems,...stamped], sessionVersion:(tx.sessionVersion || 1)+1, nextBatchNumber:batchNumber+1, cashierName:staff.name };
}
