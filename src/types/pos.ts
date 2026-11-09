export type TableStatus = 'available' | 'occupied' | 'reserved' | 'billing';

export type Destination = 'kitchen' | 'bar' | 'checker' | 'cashier';

export interface ModifierOption {
  name: string;
  priceDelta?: number;
}

export interface ModifierGroup {
  id: string;
  name: string;
  required?: boolean;
  options: ModifierOption[];
}

export interface RecipeIngredient {
  rawMaterialId: string;
  amount: number;
}

export interface MenuItem {
  id: string;
  name: string;
  category: 'makanan' | 'minuman' | 'snack' | 'dessert';
  destination: 'kitchen' | 'bar';
  price: number;
  cost: number; // HPP (Food cost)
  stock: number;
  image?: string;
  description?: string;
  modifierGroups?: ModifierGroup[];
  recipe?: RecipeIngredient[];
  outletId?: string;
}

export interface RawMaterial {
  id: string;
  name: string;
  unit: string; // 'kg' | 'gram' | 'liter' | 'ml' | 'butir' | 'ekor' | 'ikat'
  currentStock: number;
  minStock: number; // ROP threshold
  costPerUnit: number;
  storageZone: 'Dry Storage' | 'Walk-in Chiller' | 'Deep Freezer' | 'Bar Station';
  outletId?: string;
}

export type CookingStatus = 'queue' | 'cooking' | 'ready' | 'handed_off';

export type PaymentFlowMode = 'payment_last' | 'payment_first';

export type DiscountType = 'none' | 'member10' | 'promo20k';

export interface SelectedModifier {
  groupName: string;
  optionName: string;
  priceDelta: number;
}

export interface OrderItem {
  id: string; // unique item uuid in order
  menuItemId: string;
  name: string;
  category: 'makanan' | 'minuman' | 'snack' | 'dessert';
  destination: 'kitchen' | 'bar';
  unitPrice: number;
  quantity: number;
  selectedModifiers: SelectedModifier[];
  notes: string;
  subtotal: number;
  batchNumber: number;
  isServed: boolean; // checked by waiter
  isPaid?: boolean; // true when settled upfront via Payment First
  cookingStatus?: CookingStatus; // KDS live status ('queue' | 'cooking' | 'ready' | 'handed_off')
  handedOffAt?: string; // timestamp when passed from KDS to waiter
  servedAt?: string;
  createdByStaffId?: string;
  createdByStaffName?: string;
  createdAt?: string;
}

export interface OrderBatch {
  batchNumber: number;
  timestamp: string;
  items: OrderItem[];
  createdByStaffId?: string;
  createdByStaffName?: string;
}

export interface Table {
  id: string;
  tableNumber: string;
  area: 'indoor' | 'outdoor' | 'vip';
  capacity: number;
  status: TableStatus;
  currentTransactionId?: string;
  guestCount?: number;
  openedAt?: string;
  waiterName?: string;
  outletId?: string;
  sessionVersion?: number;
  reservedByStaffId?: string;
  reservedAt?: string;
  reservationNote?: string;
  nextBatchNumber?: number;
}

export interface Transaction {
  id: string; // e.g. TRX-20261023-0001
  tableId: string;
  tableNumber: string;
  area: 'indoor' | 'outdoor' | 'vip';
  guestCount: number;
  waiterName: string;
  openedAt: string;
  status: 'active' | 'settled' | 'cancelled';
  paymentFlow?: PaymentFlowMode;
  isPaid?: boolean;
  batches: OrderBatch[];
  allCurrentItems: OrderItem[];
  subtotal: number;
  serviceChargeRate: number; // e.g. 0.05 (5%)
  serviceChargeAmount: number;
  taxRate: number; // PB1 0.10 (10%)
  taxAmount: number;
  discountAmount: number;
  totalAmount: number;
  // Settlement info
  paidAt?: string;
  paymentMethod?: 'cash' | 'qris' | 'card' | 'split';
  cashGiven?: number;
  changeAmount?: number;
  cashierName?: string;
  outletId?: string;
  sessionVersion?: number;
  openedByStaffId?: string;
  openedByStaffName?: string;
  nextBatchNumber?: number;
}

export interface PrintTicket {
  id: string;
  transactionId: string;
  tableNumber: string;
  type: 'kitchen' | 'bar' | 'checker' | 'receipt';
  paymentFlow?: PaymentFlowMode;
  batchNumber?: number;
  timestamp: string;
  waiterName: string;
  items: OrderItem[];
  notes?: string;
  financials?: {
    subtotal: number;
    serviceCharge: number;
    tax: number;
    discount: number;
    total: number;
    cashGiven?: number;
    change?: number;
    paymentMethod?: string;
    paymentFlow?: PaymentFlowMode;
  };
}

export type UserRole = 'owner' | 'cashier' | 'finance';
export type AccountStatus = 'active' | 'inactive' | 'blocked';

export interface StaffAccount {
  id: string;
  name: string;
  role: UserRole;
  pin: string;
  nfcTagUid: string;
  avatarColor: string;
  roleLabel: string;
  status?: AccountStatus;
  isActive?: boolean;
  outletId?: string;
  outletName?: string;
  tenantId?: string;
  memberships?: OutletMembership[];
  blockedReason?: string;
}


export interface OutletMembership { outletId: string; outletName: string; role: UserRole; status: AccountStatus; }
export interface AuthSession { staff: StaffAccount; tenantId: string; outletId: string; outletName: string; role: UserRole; loggedInAt: string; }
export type AuditOutcome = 'allow' | 'deny';
export interface AuditEvent { id: string; at: string; action: string; outcome: AuditOutcome; staffId?: string; staffName?: string; outletId?: string; tableId?: string; message: string; meta?: Record<string, unknown>; }
export type TableAccessResult =
 | { ok: true; action: 'create_session'; table: Table }
 | { ok: true; action: 'join_session'; table: Table; transactionId: string; sessionVersion: number }
 | { ok: false; reason: 'unauthenticated' | 'inactive' | 'blocked' | 'unauthorized_outlet' | 'reservation_denied' | 'invalid_state'; message: string };

export interface PettyCashEntry {
  id: string;
  timestamp: string;
  description: string;
  category: 'operasional' | 'bahan_darurat' | 'utilitas' | 'lainnya';
  amount: number;
  receiptNumber?: string;
  recordedBy: string;
}
