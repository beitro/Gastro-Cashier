import React, { useState } from 'react';
import {
  Table,
  MenuItem,
  OrderItem,
  SelectedModifier,
  Transaction,
  PaymentFlowMode,
  DiscountType,
} from '../types/pos';
import { MENU_ITEMS } from '../data/initialData';
import {
  formatRupiah,
  calculateItemSubtotal,
  calculateOrderTotals,
  computeSettlementBreakdown,
  calculateChange,
} from '../utils/posCalculations';
import {
  X,
  Search,
  Plus,
  Minus,
  Trash2,
  Send,
  Utensils,
  Coffee,
  Users,
  Edit3,
  Info,
  CreditCard,
  Clock,
  ArrowLeft,
  Banknote,
  QrCode,
  Receipt,
  Percent,
  AlertCircle,
  CheckCircle2,
} from 'lucide-react';
import { sounds } from '../utils/soundEffects';

interface OrderModalProps {
  table: Table;
  existingTransaction?: Transaction;
  menuStock: Record<string, number>;
  paymentFlowMode: PaymentFlowMode;
  onChangePaymentFlowMode: (mode: PaymentFlowMode) => void;
  onClose: () => void;
  onSubmitOrder: (params: {
    table: Table;
    guestCount: number;
    waiterName: string;
    newItems: OrderItem[];
    batchNumber: number;
  }) => void;
  onSubmitPaymentFirstOrder: (params: {
    table: Table;
    guestCount: number;
    waiterName: string;
    newItems: OrderItem[];
    batchNumber: number;
    paymentMethod: 'cash' | 'qris' | 'card';
    cashGiven: number;
    changeAmount: number;
    discountAmount: number;
    keepTableAvailable?: boolean;
  }) => void;
}

export const OrderModal: React.FC<OrderModalProps> = ({
  table,
  existingTransaction,
  menuStock,
  paymentFlowMode,
  onChangePaymentFlowMode,
  onClose,
  onSubmitOrder,
  onSubmitPaymentFirstOrder,
}) => {
  const isAddOrder = !!existingTransaction && existingTransaction.status === 'active';
  const batchNumber = isAddOrder ? existingTransaction.batches.length + 1 : 1;

  const [guestCount, setGuestCount] = useState<number>(
    existingTransaction?.guestCount || Math.min(table.capacity, 2)
  );
  const [waiterName, setWaiterName] = useState<string>(
    existingTransaction?.waiterName || 'Budi Prasetyo'
  );
  const [categoryFilter, setCategoryFilter] = useState<'all' | 'makanan' | 'minuman' | 'snack' | 'dessert'>('all');
  const [searchQuery, setSearchQuery] = useState('');

  // Cart for current batch
  const [cartItems, setCartItems] = useState<OrderItem[]>([]);

  // Payment First Direct Checkout Flow state
  const [showDirectCheckout, setShowDirectCheckout] = useState(false);
  const [paymentMethod, setPaymentMethod] = useState<'cash' | 'qris' | 'card'>('cash');
  const [discountType, setDiscountType] = useState<DiscountType>('none');
  const [cashGiven, setCashGiven] = useState<number>(0);
  const [selectedBank, setSelectedBank] = useState<string>('BCA EDC');
  const [tableAfterPayMode, setTableAfterPayMode] = useState<'occupy_paid' | 'keep_available'>('occupy_paid');

  // Item customization popover
  const [customizingItem, setCustomizingItem] = useState<{
    menuItem: MenuItem;
    existingCartIndex?: number;
    selectedMods: SelectedModifier[];
    notes: string;
  } | null>(null);

  const filteredMenuItems = MENU_ITEMS.filter((item) => {
    if (categoryFilter !== 'all' && item.category !== categoryFilter) return false;
    if (searchQuery.trim() !== '') {
      return item.name.toLowerCase().includes(searchQuery.toLowerCase());
    }
    return true;
  });

  // Fast 1-Tap Add to Cart
  const handleQuickAdd = (menuItem: MenuItem) => {
    sounds.playTapSound();

    const currentStock = menuStock[menuItem.id] ?? 0;
    const alreadyInCart = cartItems.filter((item) => item.menuItemId === menuItem.id).reduce((sum, item) => sum + item.quantity, 0);
    if (alreadyInCart >= currentStock) {
      window.alert(currentStock <= 0 ? 'Menu sedang habis.' : `Stok tersisa hanya ${currentStock}.`);
      return;
    }

    const existingIndex = cartItems.findIndex(
      (c) => c.menuItemId === menuItem.id && c.selectedModifiers.length === 0 && !c.notes
    );

    if (existingIndex >= 0) {
      setCartItems((prev) => {
        const copy = [...prev];
        const target = { ...copy[existingIndex] };
        target.quantity += 1;
        target.subtotal = calculateItemSubtotal(target.unitPrice, target.quantity, target.selectedModifiers);
        copy[existingIndex] = target;
        return copy;
      });
    } else {
      const newItem: OrderItem = {
        id: `item-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`,
        menuItemId: menuItem.id,
        name: menuItem.name,
        category: menuItem.category,
        destination: menuItem.destination,
        unitPrice: menuItem.price,
        quantity: 1,
        selectedModifiers: [],
        notes: '',
        subtotal: menuItem.price,
        batchNumber,
        isServed: false,
      };
      setCartItems((prev) => [...prev, newItem]);
    }
  };

  const handleOpenCustomize = (menuItem: MenuItem, existingCartIndex?: number) => {
    sounds.playTapSound();
    const existing = existingCartIndex !== undefined ? cartItems[existingCartIndex] : null;

    setCustomizingItem({
      menuItem,
      existingCartIndex,
      selectedMods: existing ? [...existing.selectedModifiers] : [],
      notes: existing ? existing.notes : '',
    });
  };

  const handleSaveCustomization = () => {
    if (!customizingItem) return;
    const { menuItem, existingCartIndex, selectedMods, notes } = customizingItem;

    if (existingCartIndex !== undefined && cartItems[existingCartIndex]) {
      setCartItems((prev) => {
        const copy = [...prev];
        const target = { ...copy[existingCartIndex] };
        target.selectedModifiers = selectedMods;
        target.notes = notes.trim();
        target.subtotal = calculateItemSubtotal(target.unitPrice, target.quantity, selectedMods);
        copy[existingCartIndex] = target;
        return copy;
      });
    } else {
      const subtotal = calculateItemSubtotal(menuItem.price, 1, selectedMods);
      const newItem: OrderItem = {
        id: `item-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`,
        menuItemId: menuItem.id,
        name: menuItem.name,
        category: menuItem.category,
        destination: menuItem.destination,
        unitPrice: menuItem.price,
        quantity: 1,
        selectedModifiers: selectedMods,
        notes: notes.trim(),
        subtotal,
        batchNumber,
        isServed: false,
      };
      setCartItems((prev) => [...prev, newItem]);
    }

    setCustomizingItem(null);
  };

  const handleUpdateQty = (index: number, delta: number) => {
    sounds.playTapSound();
    setCartItems((prev) => {
      const copy = [...prev];
      const target = { ...copy[index] };
      const newQty = target.quantity + delta;
      if (newQty <= 0) {
        return copy.filter((_, i) => i !== index);
      }
      target.quantity = newQty;
      target.subtotal = calculateItemSubtotal(target.unitPrice, newQty, target.selectedModifiers);
      copy[index] = target;
      return copy;
    });
  };

  const handleRemove = (index: number) => {
    sounds.playTapSound();
    setCartItems((prev) => prev.filter((_, i) => i !== index));
  };

  const handleSwitchMode = (mode: PaymentFlowMode) => {
    sounds.playTapSound();
    onChangePaymentFlowMode(mode);
  };

  const batchTotals = calculateOrderTotals(cartItems);

  // Items to settle if using Payment First right now:
  // Includes any previously unpaid items on this table (if open bill existed) + new cartItems
  const unpaidExistingItems =
    isAddOrder && existingTransaction
      ? existingTransaction.allCurrentItems.filter((i) => !i.isPaid)
      : [];
  const payableItems = [...unpaidExistingItems, ...cartItems];
  const directSettlement = computeSettlementBreakdown(payableItems, discountType);
  const changeAmount = calculateChange(directSettlement.totalAmount, cashGiven);
  const isCashSufficient =
    paymentMethod !== 'cash' || cashGiven >= directSettlement.totalAmount;

  const quickCashOptions = [
    { label: 'Uang Pas', value: directSettlement.totalAmount },
    { label: 'Rp 50.000', value: 50000 },
    { label: 'Rp 100.000', value: 100000 },
    { label: 'Rp 200.000', value: 200000 },
    { label: 'Rp 300.000', value: 300000 },
    { label: 'Rp 500.000', value: 500000 },
  ].filter((opt) => opt.value >= directSettlement.totalAmount || opt.label === 'Uang Pas');

  // Existing Flow: Payment Last (Bayar Belakang)
  const handleSubmitPaymentLast = () => {
    if (cartItems.length === 0) return;
    onSubmitOrder({
      table,
      guestCount,
      waiterName,
      newItems: cartItems,
      batchNumber,
    });
  };

  // New Flow Step 1: Open Direct Payment Screen
  const handleOpenDirectCheckout = () => {
    if (cartItems.length === 0) return;
    sounds.playTapSound();
    setShowDirectCheckout(true);
  };

  // New Flow Step 2: Confirm Payment First & Print Payment + Station Tickets
  const handleConfirmPaymentFirst = () => {
    if (cartItems.length === 0 || !isCashSufficient) return;
    sounds.playCashRegisterSound();
    onSubmitPaymentFirstOrder({
      table,
      guestCount,
      waiterName,
      newItems: cartItems,
      batchNumber,
      paymentMethod,
      cashGiven: paymentMethod === 'cash' ? cashGiven : directSettlement.totalAmount,
      changeAmount: paymentMethod === 'cash' ? changeAmount : 0,
      discountAmount: directSettlement.discountAmount,
      keepTableAvailable: tableAfterPayMode === 'keep_available',
    });
  };

  return (
    <div className="fixed inset-0 z-50 clay-canvas flex flex-col w-screen h-screen overflow-hidden select-none text-slate-800">
      {/* Top Clay Header Bar */}
      <div className="h-20 clay-bar px-4 sm:px-6 flex items-center justify-between flex-shrink-0 gap-3">
        <div className="flex items-center gap-3.5">
          <span className="text-base font-black clay-btn-emerald px-4 py-2 font-mono tabular-nums whitespace-nowrap">
            MEJA {table.tableNumber}
          </span>
          <div>
            <h2 className="text-base sm:text-lg font-extrabold text-slate-900">
              {showDirectCheckout
                ? `Kasir Payment First (Bayar Langsung)`
                : isAddOrder
                ? `Tambah Pesanan (Batch #${batchNumber})`
                : 'Input Pesanan Baru'}
            </h2>
            <span className="text-xs font-bold uppercase tracking-wider text-slate-500 hidden sm:inline">
              Zona {table.area} •{' '}
              {paymentFlowMode === 'payment_first'
                ? 'Kategori Resto: Payment First (Bayar di Depan)'
                : 'Kategori Resto: Payment Last (Bayar Belakang)'}
            </span>
          </div>
        </div>

        {/* Waiter, Guest, and Close Button */}
        <div className="flex items-center gap-3 text-xs sm:text-sm">
          <div className="min-h-[46px] flex items-center gap-2 clay-well px-3.5 py-2">
            <Users className="w-4 h-4 text-emerald-700" />
            <label htmlFor="tamuSelect" className="text-slate-600 font-bold text-xs">
              Tamu:
            </label>
            <select
              id="tamuSelect"
              value={guestCount}
              onChange={(e) => setGuestCount(Number(e.target.value))}
              className="bg-transparent text-slate-900 font-extrabold focus:outline-none cursor-pointer text-xs sm:text-sm font-mono tabular-nums"
            >
              {Array.from({ length: 12 }).map((_, i) => (
                <option key={i + 1} value={i + 1} className="bg-white text-slate-900">
                  {i + 1} Org
                </option>
              ))}
            </select>
          </div>

          <div className="hidden md:flex min-h-[46px] items-center gap-2 clay-well px-3.5 py-2">
            <label htmlFor="waiterSelect" className="text-slate-600 font-bold text-xs">
              Waiter:
            </label>
            <select
              id="waiterSelect"
              value={waiterName}
              onChange={(e) => setWaiterName(e.target.value)}
              className="bg-transparent text-emerald-800 font-extrabold focus:outline-none cursor-pointer text-xs sm:text-sm"
            >
              <option value="Budi Prasetyo" className="bg-white text-slate-900">Budi Prasetyo</option>
              <option value="Siti Rahma" className="bg-white text-slate-900">Siti Rahma</option>
              <option value="Doni Setiawan" className="bg-white text-slate-900">Doni Setiawan</option>
              <option value="Rian Pratama" className="bg-white text-slate-900">Rian Pratama</option>
            </select>
          </div>

          <button
            type="button"
            onClick={onClose}
            className="min-w-[48px] min-h-[48px] flex items-center justify-center clay-btn-neutral cursor-pointer"
            aria-label="Tutup Layar Order"
          >
            <X className="w-6 h-6" />
          </button>
        </div>
      </div>

      {/* VIEW A: NEW FLOW - DIRECT PAYMENT FIRST CHECKOUT */}
      {showDirectCheckout ? (
        <div className="flex-1 min-h-0 flex flex-col lg:flex-row overflow-hidden p-3.5 sm:p-5 gap-4 sm:gap-5">
          {/* LEFT: Order Summary & Discount Breakdown */}
          <div className="flex-1 min-h-0 clay-panel p-4 sm:p-5 flex flex-col overflow-hidden">
            <div className="flex flex-wrap items-center justify-between gap-2 pb-3.5 border-b border-slate-200/80">
              <div className="flex items-center gap-3">
                <button
                  type="button"
                  onClick={() => {
                    sounds.playTapSound();
                    setShowDirectCheckout(false);
                  }}
                  className="min-h-[46px] px-4 py-2 clay-btn-neutral text-xs sm:text-sm font-extrabold flex items-center gap-2 cursor-pointer"
                >
                  <ArrowLeft className="w-4 h-4" />
                  <span>Kembali ke Menu</span>
                </button>
                <div>
                  <h3 className="text-sm sm:text-base font-extrabold text-slate-900">
                    Rincian Tagihan Payment First
                  </h3>
                  <p className="text-xs font-semibold text-indigo-700">
                    Bayar di depan • Struk Pembayaran & Struk Dapur/Bar langsung dicetak
                  </p>
                </div>
              </div>
              <span className="px-3 py-1.5 rounded-xl bg-indigo-100 text-indigo-900 text-xs font-black font-mono tabular-nums">
                {payableItems.length} Menu
              </span>
            </div>

            {unpaidExistingItems.length > 0 && (
              <div className="mt-3 clay-tint-amber p-3 text-xs font-bold flex items-center gap-2">
                <Info className="w-4 h-4 shrink-0 text-amber-800" />
                <span>
                  Termasuk pelunasan {unpaidExistingItems.length} pesanan sebelumnya di Meja {table.tableNumber}.
                </span>
              </div>
            )}

            {/* Payable Items List */}
            <div className="flex-1 min-h-0 overflow-y-auto my-3.5 space-y-2.5 p-3.5 clay-well">
              {payableItems.map((item, idx) => (
                <div
                  key={item.id || idx}
                  className="clay-card-sm p-3.5 flex justify-between items-start text-sm"
                >
                  <div>
                    <div className="font-extrabold text-slate-900 flex items-center gap-2">
                      <span className="text-emerald-800 font-mono tabular-nums font-black">
                        {item.quantity}x
                      </span>
                      <span>{item.name}</span>
                    </div>
                    {item.selectedModifiers.length > 0 && (
                      <div className="text-xs font-semibold text-amber-800 pl-5 mt-0.5">
                        ↳ {item.selectedModifiers.map((m) => m.optionName).join(', ')}
                      </div>
                    )}
                    {item.notes && (
                      <div className="text-xs font-bold text-rose-700 pl-5 mt-0.5">
                        Catatan: {item.notes}
                      </div>
                    )}
                  </div>
                  <span className="font-mono tabular-nums text-slate-900 font-extrabold">
                    {formatRupiah(item.subtotal)}
                  </span>
                </div>
              ))}
            </div>

            {/* Discount Program */}
            <div className="pt-3 border-t border-slate-200/80 space-y-2">
              <span className="text-xs sm:text-sm font-extrabold text-slate-700 flex items-center gap-1.5">
                <Percent className="w-4 h-4 text-amber-600" />
                <span>Program Diskon / Voucher</span>
              </span>
              <div className="grid grid-cols-3 gap-2.5">
                <button
                  type="button"
                  onClick={() => setDiscountType('none')}
                  className={`min-h-[46px] py-2 px-3 text-xs sm:text-sm font-extrabold whitespace-nowrap cursor-pointer ${
                    discountType === 'none' ? 'clay-btn-dark' : 'clay-btn-neutral'
                  }`}
                >
                  Tanpa Diskon
                </button>
                <button
                  type="button"
                  onClick={() => setDiscountType('member10')}
                  className={`min-h-[46px] py-2 px-3 text-xs sm:text-sm font-extrabold whitespace-nowrap cursor-pointer ${
                    discountType === 'member10' ? 'clay-btn-emerald' : 'clay-btn-neutral'
                  }`}
                >
                  Member VIP (10%)
                </button>
                <button
                  type="button"
                  onClick={() => setDiscountType('promo20k')}
                  className={`min-h-[46px] py-2 px-3 text-xs sm:text-sm font-extrabold whitespace-nowrap cursor-pointer ${
                    discountType === 'promo20k' ? 'clay-btn-emerald' : 'clay-btn-neutral'
                  }`}
                >
                  Voucher Rp 20rb
                </button>
              </div>
            </div>

            {/* Financial Totals */}
            <div className="mt-3.5 pt-3 border-t border-slate-200/80 space-y-1.5 text-xs sm:text-sm">
              <div className="flex justify-between text-slate-600">
                <span className="font-semibold">Subtotal Pesanan:</span>
                <span className="font-mono tabular-nums font-bold text-slate-900">
                  {formatRupiah(directSettlement.subtotal)}
                </span>
              </div>
              {directSettlement.discountAmount > 0 && (
                <div className="flex justify-between text-emerald-800 font-bold">
                  <span>Diskon:</span>
                  <span className="font-mono tabular-nums">
                    -{formatRupiah(directSettlement.discountAmount)}
                  </span>
                </div>
              )}
              <div className="flex justify-between text-slate-600">
                <span className="font-semibold">Service Charge Resto (5%):</span>
                <span className="font-mono tabular-nums font-bold text-slate-800">
                  {formatRupiah(directSettlement.serviceChargeAmount)}
                </span>
              </div>
              <div className="flex justify-between text-slate-600">
                <span className="font-semibold">Pajak Restoran PB1 (10%):</span>
                <span className="font-mono tabular-nums font-bold text-slate-800">
                  {formatRupiah(directSettlement.taxAmount)}
                </span>
              </div>
              <div className="flex justify-between items-baseline text-lg sm:text-xl font-black text-slate-900 pt-2 border-t border-slate-200/80">
                <span>TOTAL BAYAR SEKARANG:</span>
                <span className="font-mono tabular-nums text-emerald-800 text-2xl">
                  {formatRupiah(directSettlement.totalAmount)}
                </span>
              </div>
            </div>
          </div>

          {/* RIGHT: Payment Method, Cash/QRIS/EDC & Instant Print Action */}
          <div className="w-full lg:w-[490px] xl:w-[540px] clay-panel p-5 flex flex-col justify-between overflow-y-auto">
            <div className="space-y-4">
              {/* Post-Payment Table Handling Option */}
              <div>
                <span className="text-xs font-extrabold text-slate-600 uppercase tracking-wider block mb-2">
                  Mode Layanan Meja {table.tableNumber}
                </span>
                <div className="clay-well p-1.5 grid grid-cols-2 gap-2">
                  <button
                    type="button"
                    onClick={() => setTableAfterPayMode('occupy_paid')}
                    className={`min-h-[46px] px-3 py-2 text-xs font-extrabold cursor-pointer ${
                      tableAfterPayMode === 'occupy_paid' ? 'clay-btn-emerald' : 'clay-btn-neutral'
                    }`}
                  >
                    Dine-In (Meja Terisi • Lunas)
                  </button>
                  <button
                    type="button"
                    onClick={() => setTableAfterPayMode('keep_available')}
                    className={`min-h-[46px] px-3 py-2 text-xs font-extrabold cursor-pointer ${
                      tableAfterPayMode === 'keep_available' ? 'clay-btn-indigo' : 'clay-btn-neutral'
                    }`}
                  >
                    Takeaway (Meja Tetap Kosong)
                  </button>
                </div>
              </div>

              <div>
                <h4 className="text-xs sm:text-sm font-extrabold text-slate-700 uppercase tracking-wider mb-2.5">
                  Pilih Metode Pembayaran Langsung
                </h4>
                <div className="grid grid-cols-3 gap-3">
                  <button
                    type="button"
                    onClick={() => setPaymentMethod('cash')}
                    className={`min-h-[72px] py-3 px-3 text-xs sm:text-sm font-extrabold flex flex-col items-center justify-center gap-1.5 cursor-pointer ${
                      paymentMethod === 'cash' ? 'clay-btn-emerald' : 'clay-btn-neutral'
                    }`}
                  >
                    <Banknote className="w-6 h-6" />
                    <span className="whitespace-nowrap">Tunai (Cash)</span>
                  </button>

                  <button
                    type="button"
                    onClick={() => setPaymentMethod('qris')}
                    className={`min-h-[72px] py-3 px-3 text-xs sm:text-sm font-extrabold flex flex-col items-center justify-center gap-1.5 cursor-pointer ${
                      paymentMethod === 'qris' ? 'clay-btn-cyan' : 'clay-btn-neutral'
                    }`}
                  >
                    <QrCode className="w-6 h-6" />
                    <span className="whitespace-nowrap">QRIS Nasional</span>
                  </button>

                  <button
                    type="button"
                    onClick={() => setPaymentMethod('card')}
                    className={`min-h-[72px] py-3 px-3 text-xs sm:text-sm font-extrabold flex flex-col items-center justify-center gap-1.5 cursor-pointer ${
                      paymentMethod === 'card' ? 'clay-btn-indigo' : 'clay-btn-neutral'
                    }`}
                  >
                    <CreditCard className="w-6 h-6" />
                    <span className="whitespace-nowrap">Debit / Kartu</span>
                  </button>
                </div>
              </div>

              {/* CASH */}
              {paymentMethod === 'cash' && (
                <div className="space-y-3.5 clay-card p-4 sm:p-5">
                  <div>
                    <label
                      htmlFor="paymentFirstCashInput"
                      className="text-xs sm:text-sm font-extrabold text-slate-700 block mb-2"
                    >
                      Nominal Uang Diterima dari Pelanggan
                    </label>
                    <div className="relative">
                      <span className="absolute left-4 top-1/2 -translate-y-1/2 text-base font-extrabold text-slate-500">
                        Rp
                      </span>
                      <input
                        id="paymentFirstCashInput"
                        type="number"
                        value={cashGiven || ''}
                        onChange={(e) => setCashGiven(Number(e.target.value))}
                        placeholder={directSettlement.totalAmount.toString()}
                        className="w-full clay-input min-h-[54px] text-xl font-mono tabular-nums font-black pl-12 pr-4 py-2.5"
                      />
                    </div>
                  </div>

                  <div>
                    <span className="text-xs text-slate-600 font-bold block mb-2">
                      Pilihan Cepat Kasir:
                    </span>
                    <div className="grid grid-cols-2 sm:grid-cols-3 gap-2.5">
                      {quickCashOptions.map((opt, i) => (
                        <button
                          key={i}
                          type="button"
                          onClick={() => {
                            sounds.playTapSound();
                            setCashGiven(opt.value);
                          }}
                          className={`min-h-[48px] py-2.5 px-3 text-xs sm:text-sm font-mono tabular-nums font-extrabold whitespace-nowrap cursor-pointer ${
                            cashGiven === opt.value ? 'clay-btn-emerald' : 'clay-btn-neutral'
                          }`}
                        >
                          {opt.label}
                        </button>
                      ))}
                    </div>
                  </div>

                  <div className="pt-3 border-t border-slate-200/80 flex items-center justify-between">
                    <div>
                      <span className="text-sm font-extrabold text-slate-700 block">
                        Uang Kembalian:
                      </span>
                      {!isCashSufficient && (
                        <span className="text-xs text-rose-600 flex items-center gap-1 font-bold mt-0.5">
                          <AlertCircle className="w-4 h-4" />
                          <span>Pilih Uang Pas / masukkan nominal cukup</span>
                        </span>
                      )}
                    </div>
                    <span
                      className={`text-2xl font-black font-mono tabular-nums ${
                        isCashSufficient ? 'text-emerald-800' : 'text-rose-600'
                      }`}
                    >
                      {formatRupiah(changeAmount)}
                    </span>
                  </div>
                </div>
              )}

              {/* QRIS */}
              {paymentMethod === 'qris' && (
                <div className="clay-card p-5 text-center space-y-3">
                  <div className="inline-block bg-white p-3.5 rounded-2xl shadow-sm border border-slate-200">
                    <img
                      src={`https://api.qrserver.com/v1/create-qr-code/?size=180x180&data=RESTO-FIRST-MEJA-${table.tableNumber}-TOTAL-${directSettlement.totalAmount}`}
                      alt="QRIS QR Code"
                      className="w-40 h-40 mx-auto"
                      loading="lazy"
                    />
                    <div className="text-[11px] font-sans font-extrabold text-slate-600 mt-2 uppercase tracking-wider">
                      QRIS Standar Pembayaran Nasional
                    </div>
                  </div>
                  <p className="font-black font-mono tabular-nums text-emerald-800 text-xl">
                    {formatRupiah(directSettlement.totalAmount)}
                  </p>
                </div>
              )}

              {/* CARD */}
              {paymentMethod === 'card' && (
                <div className="clay-card p-5 space-y-3">
                  <span className="text-sm font-extrabold text-slate-700 block">
                    Pilih Mesin EDC / Bank:
                  </span>
                  <div className="grid grid-cols-2 gap-3">
                    {['BCA EDC', 'Mandiri EDC', 'BRI EDC', 'BNI EDC'].map((bank) => (
                      <button
                        key={bank}
                        type="button"
                        onClick={() => setSelectedBank(bank)}
                        className={`min-h-[52px] p-3.5 text-sm font-extrabold text-left cursor-pointer ${
                          selectedBank === bank ? 'clay-btn-indigo' : 'clay-btn-neutral'
                        }`}
                      >
                        {bank}
                      </button>
                    ))}
                  </div>
                </div>
              )}
            </div>

            <div className="mt-4 pt-3.5 border-t border-slate-200/80 space-y-2">
              <button
                type="button"
                disabled={!isCashSufficient}
                onClick={handleConfirmPaymentFirst}
                className={`w-full min-h-[60px] py-4 px-5 font-black text-sm sm:text-base flex items-center justify-center gap-2.5 whitespace-nowrap ${
                  isCashSufficient
                    ? 'clay-btn-emerald cursor-pointer'
                    : 'clay-btn-disabled cursor-not-allowed'
                }`}
              >
                <Receipt className="w-5 h-5 shrink-0" />
                <span>BAYAR SEKARANG & CETAK PEMBAYARAN</span>
              </button>
              <p className="text-xs text-center text-slate-500 font-semibold">
                Otomatis mencetak Struk Pembayaran Sah (Lunas) + Struk Dapur, Bar & Checker sekaligus.
              </p>
            </div>
          </div>
        </div>
      ) : (
        /* VIEW B: MAIN SPLIT WORKSPACE: Menu Catalog (Left) + Live Bill & Payment Category Toggle (Right) */
        <div className="flex-1 min-h-0 flex flex-col md:flex-row overflow-hidden p-3.5 sm:p-5 gap-4 sm:gap-5">
          {/* LEFT: Menu Catalog */}
          <div className="flex-1 min-h-0 flex flex-col overflow-hidden gap-3.5">
            {/* Category Filter Chips & Search */}
            <div className="p-3.5 clay-panel flex flex-wrap items-center justify-between gap-3 flex-shrink-0">
              <div className="flex flex-wrap items-center gap-2.5 max-w-full">
                <button
                  type="button"
                  onClick={() => setCategoryFilter('all')}
                  className={`min-h-[48px] px-4 sm:px-5 py-2.5 text-xs sm:text-sm font-extrabold whitespace-nowrap shrink-0 cursor-pointer ${
                    categoryFilter === 'all' ? 'clay-btn-dark' : 'clay-btn-neutral'
                  }`}
                >
                  Semua Menu
                </button>
                <button
                  type="button"
                  onClick={() => setCategoryFilter('makanan')}
                  className={`min-h-[48px] px-4 sm:px-5 py-2.5 text-xs sm:text-sm font-extrabold whitespace-nowrap shrink-0 flex items-center gap-2 cursor-pointer ${
                    categoryFilter === 'makanan' ? 'clay-btn-amber' : 'clay-btn-neutral'
                  }`}
                >
                  <Utensils className="w-4 h-4" />
                  <span>Dapur (Makanan)</span>
                </button>
                <button
                  type="button"
                  onClick={() => setCategoryFilter('minuman')}
                  className={`min-h-[48px] px-4 sm:px-5 py-2.5 text-xs sm:text-sm font-extrabold whitespace-nowrap shrink-0 flex items-center gap-2 cursor-pointer ${
                    categoryFilter === 'minuman' ? 'clay-btn-cyan' : 'clay-btn-neutral'
                  }`}
                >
                  <Coffee className="w-4 h-4" />
                  <span>Bar (Minuman)</span>
                </button>
                <button
                  type="button"
                  onClick={() => setCategoryFilter('snack')}
                  className={`min-h-[48px] px-4 sm:px-5 py-2.5 text-xs sm:text-sm font-extrabold whitespace-nowrap shrink-0 cursor-pointer ${
                    categoryFilter === 'snack' ? 'clay-btn-indigo' : 'clay-btn-neutral'
                  }`}
                >
                  Snack & Dessert
                </button>
              </div>

              <div className="relative w-44 sm:w-60 flex-shrink-0">
                <Search className="w-4 h-4 text-slate-500 absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none" />
                <input
                  type="text"
                  aria-label="Cari nama menu"
                  placeholder="Cari nama menu..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="w-full clay-input min-h-[48px] text-sm font-semibold pl-10 pr-4 py-2.5"
                />
              </div>
            </div>

            {/* Menu Items Spacious Touch Matrix */}
            <div className="flex-1 min-h-0 overflow-y-auto px-1 py-1 grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-3.5 sm:gap-4 content-start">
              {filteredMenuItems.map((item) => {
                const isFood = item.destination === 'kitchen';
                const inCartQty = cartItems
                  .filter((c) => c.menuItemId === item.id)
                  .reduce((sum, c) => sum + c.quantity, 0);
                const availableStock = menuStock[item.id] ?? 0;
                const isOutOfStock = availableStock <= 0 || inCartQty >= availableStock;

                return (
                  <article
                    key={item.id}
                    className="clay-card min-h-[164px] p-4 sm:p-5 flex flex-col justify-between relative"
                  >
                    <button
                      type="button"
                      onClick={() => handleQuickAdd(item)}
                      disabled={isOutOfStock}
                      className={`text-left w-full flex-1 flex flex-col justify-between focus:outline-none ${isOutOfStock ? 'cursor-not-allowed opacity-55' : 'cursor-pointer'}`}
                    >
                      {/* Top Destination Eyebrow, Active Qty & Stock */}
                      <div className="flex items-center justify-between gap-2 mb-1.5 w-full">
                        <span
                          className={`text-xs font-extrabold uppercase tracking-wider ${
                            isFood ? 'text-amber-700' : 'text-sky-700'
                          }`}
                        >
                          {isFood ? 'DAPUR' : 'BAR'}
                        </span>

                        <div className="flex items-center gap-2">
                          {inCartQty > 0 && (
                            <span className="px-2.5 py-0.5 rounded-lg bg-emerald-700 text-white text-xs font-black font-mono tabular-nums">
                              {inCartQty}x Dipilih
                            </span>
                          )}
                          <span className="text-xs text-slate-500 font-mono tabular-nums font-bold">
                            Stok {availableStock}
                          </span>
                        </div>
                      </div>

                      {/* Menu Title */}
                      <div className="my-2">
                        <h4 className="text-sm sm:text-base font-extrabold text-slate-900 leading-snug line-clamp-2">
                          {item.name}
                        </h4>
                      </div>
                    </button>

                    {/* Price & Generous Tactile Clay Touch Actions */}
                    <div className="mt-2 pt-3 border-t border-slate-200/80 flex items-center justify-between gap-2">
                      <span className="text-sm sm:text-base font-black text-emerald-800 font-mono tabular-nums">
                        {formatRupiah(item.price)}
                      </span>

                      <div className="flex items-center gap-2">
                        <button
                          type="button"
                          onClick={() => handleOpenCustomize(item)}
                          title="Pilih Catatan / Modifier"
                          aria-label={`Catatan atau modifier untuk ${item.name}`}
                          className="min-w-[46px] min-h-[46px] flex items-center justify-center clay-btn-neutral text-amber-700 cursor-pointer"
                        >
                          <Edit3 className="w-4 h-4" />
                        </button>

                        <button
                          type="button"
                          onClick={() => handleQuickAdd(item)}
                          aria-label={`Pilih ${item.name}`}
                          className="min-h-[46px] px-4 py-2.5 clay-btn-emerald font-extrabold text-xs sm:text-sm flex items-center gap-1.5 whitespace-nowrap shrink-0 cursor-pointer"
                        >
                          <Plus className="w-4 h-4" />
                          <span>Pilih</span>
                        </button>
                      </div>
                    </div>
                  </article>
                );
              })}
            </div>
          </div>

          {/* RIGHT: Wider Live Bill Clay Touch Panel + Kategori Resto Payment Mode Activation */}
          <div className="w-full md:w-[410px] lg:w-[470px] xl:w-[510px] clay-panel p-4 sm:p-5 flex flex-col flex-shrink-0 h-[52vh] md:h-full">
            {/* Cart Header */}
            <div className="pb-3 border-b border-slate-200/80 flex items-center justify-between gap-2">
              <div>
                <div className="flex items-center gap-2">
                  <h3 className="text-base font-extrabold text-slate-900">
                    Pesanan Meja {table.tableNumber}
                  </h3>
                  <span className="text-xs font-extrabold uppercase tracking-wider text-emerald-800 font-mono tabular-nums">
                    Batch #{batchNumber}
                  </span>
                </div>
                <p className="text-xs text-slate-500 font-semibold mt-0.5">
                  {cartItems.length} menu siap diproses
                </p>
              </div>

              {cartItems.length > 0 && (
                <button
                  type="button"
                  onClick={() => setCartItems([])}
                  className="min-h-[40px] px-3.5 py-2 clay-btn-neutral text-xs text-rose-700 hover:text-rose-800 font-extrabold cursor-pointer whitespace-nowrap"
                >
                  Kosongkan
                </button>
              )}
            </div>

            {/* KATEGORI RESTO ACTIVATION BUTTONS: PAYMENT LAST vs PAYMENT FIRST */}
            <div className="mt-3 space-y-2 flex-shrink-0">
              <div className="flex items-center justify-between text-[11px] font-extrabold uppercase tracking-wider">
                <span className="text-slate-600">Kategori Resto (Mode Bayar)</span>
                <span
                  className={`flex items-center gap-1 px-2 py-0.5 rounded-lg ${
                    paymentFlowMode === 'payment_first'
                      ? 'bg-indigo-100 text-indigo-800'
                      : 'bg-emerald-100 text-emerald-800'
                  }`}
                >
                  <CheckCircle2 className="w-3.5 h-3.5" />
                  <span>
                    {paymentFlowMode === 'payment_first'
                      ? 'Aktif: Bayar Langsung'
                      : 'Aktif: Bayar Belakang'}
                  </span>
                </span>
              </div>

              <div className="clay-well p-1.5 grid grid-cols-2 gap-2" role="group" aria-label="Kategori Pembayaran Resto">
                <button
                  type="button"
                  aria-pressed={paymentFlowMode === 'payment_last'}
                  onClick={() => handleSwitchMode('payment_last')}
                  className={`min-h-[52px] px-3 py-2 text-left flex items-center gap-2.5 cursor-pointer ${
                    paymentFlowMode === 'payment_last' ? 'clay-btn-emerald' : 'clay-btn-neutral'
                  }`}
                >
                  <Clock className="w-4 h-4 shrink-0" />
                  <div className="leading-tight">
                    <div className="text-xs sm:text-sm font-black whitespace-nowrap">Payment Last</div>
                    <div
                      className={`text-[10px] font-bold ${
                        paymentFlowMode === 'payment_last' ? 'text-emerald-50' : 'text-slate-500'
                      }`}
                    >
                      Bayar Belakang
                    </div>
                  </div>
                </button>

                <button
                  type="button"
                  aria-pressed={paymentFlowMode === 'payment_first'}
                  onClick={() => handleSwitchMode('payment_first')}
                  className={`min-h-[52px] px-3 py-2 text-left flex items-center gap-2.5 cursor-pointer ${
                    paymentFlowMode === 'payment_first' ? 'clay-btn-indigo' : 'clay-btn-neutral'
                  }`}
                >
                  <CreditCard className="w-4 h-4 shrink-0" />
                  <div className="leading-tight">
                    <div className="text-xs sm:text-sm font-black whitespace-nowrap">Payment First</div>
                    <div
                      className={`text-[10px] font-bold ${
                        paymentFlowMode === 'payment_first' ? 'text-indigo-100' : 'text-slate-500'
                      }`}
                    >
                      Langsung Bayar
                    </div>
                  </div>
                </button>
              </div>
            </div>

            {/* Existing Items Notice (for Add-Order) */}
            {isAddOrder && existingTransaction && (
              <div className="mt-2.5 clay-tint-amber p-2.5 text-xs font-bold flex items-center gap-2">
                <Info className="w-4 h-4 flex-shrink-0 text-amber-800" />
                <span>
                  {existingTransaction.isPaid
                    ? `Meja sudah LUNAS (${existingTransaction.allCurrentItems.length} menu). Tambahan ini dihitung terpisah.`
                    : `Open Bill aktif: ${existingTransaction.allCurrentItems.length} menu (${formatRupiah(existingTransaction.totalAmount)}).`}
                </span>
              </div>
            )}

            {/* Recessed Clay Cart Tray */}
            <div className="flex-1 min-h-0 overflow-y-auto my-3 p-3 clay-well space-y-2.5">
              {cartItems.length === 0 ? (
                <div className="h-full flex flex-col items-center justify-center text-center p-4 text-slate-500">
                  <p className="text-sm font-extrabold text-slate-700">Pesanan Masih Kosong</p>
                  <p className="text-xs text-slate-500 mt-1.5 leading-relaxed">
                    Sentuh kartu menu di sebelah kiri untuk langsung menambahkan pesanan pelanggan.
                  </p>
                </div>
              ) : (
                cartItems.map((item, index) => {
                  const sourceMenuItem = MENU_ITEMS.find((m) => m.id === item.menuItemId);
                  return (
                    <div
                      key={item.id}
                      className="clay-card-sm p-3.5 flex flex-col gap-2.5"
                    >
                      <div className="flex items-start justify-between gap-2.5">
                        <div className="flex-1">
                          <div className="flex items-center gap-2">
                            <span
                              className={`text-[10px] font-black uppercase tracking-wider ${
                                item.destination === 'kitchen' ? 'text-amber-700' : 'text-sky-700'
                              }`}
                            >
                              {item.destination === 'kitchen' ? 'DAPUR' : 'BAR'}
                            </span>
                            <span className="text-sm font-extrabold text-slate-900 line-clamp-1">
                              {item.name}
                            </span>
                          </div>

                          {item.selectedModifiers.length > 0 && (
                            <div className="text-xs font-semibold text-amber-800 pl-2 mt-1">
                              ↳ {item.selectedModifiers.map((m) => m.optionName).join(', ')}
                            </div>
                          )}

                          {item.notes && (
                            <div className="text-xs font-bold text-rose-700 mt-1">
                              Catatan: {item.notes}
                            </div>
                          )}
                        </div>

                        <div className="text-right font-mono tabular-nums font-black text-emerald-800 text-sm">
                          {formatRupiah(item.subtotal)}
                        </div>
                      </div>

                      {/* Large 44px Touchscreen Quantity & Edit Controls */}
                      <div className="flex items-center justify-between pt-2 border-t border-slate-200/80">
                        <div className="flex items-center gap-2">
                          <span className="text-xs text-slate-500 font-mono tabular-nums font-bold">
                            @{formatRupiah(item.unitPrice)}
                          </span>
                          {sourceMenuItem && (
                            <button
                              type="button"
                              onClick={() => handleOpenCustomize(sourceMenuItem, index)}
                              className="min-h-[38px] px-2.5 py-1.5 clay-btn-neutral text-amber-700 text-xs font-extrabold flex items-center gap-1 cursor-pointer"
                            >
                              <Edit3 className="w-3.5 h-3.5" />
                              <span>Catatan</span>
                            </button>
                          )}
                        </div>

                        <div className="flex items-center gap-2">
                          <button
                            type="button"
                            onClick={() => handleUpdateQty(index, -1)}
                            aria-label={`Kurangi jumlah ${item.name}`}
                            className="w-11 h-11 clay-btn-neutral flex items-center justify-center font-bold cursor-pointer"
                          >
                            <Minus className="w-4 h-4" />
                          </button>
                          <span className="w-8 text-center font-mono tabular-nums font-black text-base text-slate-900">
                            {item.quantity}
                          </span>
                          <button
                            type="button"
                            onClick={() => handleUpdateQty(index, 1)}
                            aria-label={`Tambah jumlah ${item.name}`}
                            className="w-11 h-11 clay-btn-emerald flex items-center justify-center font-bold cursor-pointer"
                          >
                            <Plus className="w-4 h-4" />
                          </button>
                          <button
                            type="button"
                            onClick={() => handleRemove(index)}
                            aria-label={`Hapus ${item.name}`}
                            className="w-11 h-11 clay-btn-neutral text-rose-600 hover:text-rose-700 flex items-center justify-center ml-0.5 cursor-pointer"
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        </div>
                      </div>
                    </div>
                  );
                })
              )}
            </div>

            {/* Cart Footer & Dynamic Mode Primary CTA Button */}
            <div className="space-y-3 flex-shrink-0">
              <div className="space-y-1 text-xs sm:text-sm font-mono tabular-nums">
                <div className="flex justify-between text-slate-600 text-xs">
                  <span className="font-sans font-semibold">Subtotal:</span>
                  <span className="font-bold text-slate-900">{formatRupiah(batchTotals.subtotal)}</span>
                </div>
                <div className="flex justify-between text-slate-600 text-xs">
                  <span className="font-sans font-semibold">Service (5%) + PB1 (10%):</span>
                  <span className="font-bold text-slate-700">
                    {formatRupiah(batchTotals.serviceChargeAmount + batchTotals.taxAmount)}
                  </span>
                </div>
                <div className="flex justify-between items-baseline text-base font-black text-slate-900 pt-1.5 border-t border-slate-200/80">
                  <span className="font-sans">
                    {paymentFlowMode === 'payment_first' ? 'Total Bayar Langsung:' : 'Total Estimasi:'}
                  </span>
                  <span
                    className={`text-lg sm:text-xl ${
                      paymentFlowMode === 'payment_first' ? 'text-indigo-800' : 'text-emerald-800'
                    }`}
                  >
                    {formatRupiah(batchTotals.totalAmount)}
                  </span>
                </div>
              </div>

              {paymentFlowMode === 'payment_first' ? (
                <button
                  type="button"
                  disabled={cartItems.length === 0}
                  onClick={handleOpenDirectCheckout}
                  className={`w-full min-h-[58px] py-4 px-5 font-black text-sm sm:text-base flex items-center justify-center gap-2.5 whitespace-nowrap ${
                    cartItems.length > 0
                      ? 'clay-btn-indigo cursor-pointer'
                      : 'clay-btn-disabled cursor-not-allowed'
                  }`}
                >
                  <CreditCard className="w-5 h-5 shrink-0" />
                  <span>LANJUT BAYAR & CETAK PEMBAYARAN</span>
                </button>
              ) : (
                <button
                  type="button"
                  disabled={cartItems.length === 0}
                  onClick={handleSubmitPaymentLast}
                  className={`w-full min-h-[58px] py-4 px-5 font-black text-sm sm:text-base flex items-center justify-center gap-2.5 whitespace-nowrap ${
                    cartItems.length > 0
                      ? 'clay-btn-emerald cursor-pointer'
                      : 'clay-btn-disabled cursor-not-allowed'
                  }`}
                >
                  <Send className="w-5 h-5 shrink-0" />
                  <span>KIRIM & CETAK DAPUR, BAR & CHECKER</span>
                </button>
              )}
            </div>
          </div>
        </div>
      )}

      {/* CLAYMORPHISM MODIFIER & NOTE MODAL - Spacious Touch Options */}
      {customizingItem && (
        <div
          className="fixed inset-0 z-60 bg-slate-900/40 backdrop-blur-xs flex items-center justify-center p-4"
          onClick={() => setCustomizingItem(null)}
        >
          <div
            className="clay-modal max-w-lg w-full p-6 sm:p-7"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex justify-between items-start mb-5 pb-3.5 border-b border-slate-200/80">
              <div>
                <h3 className="text-base sm:text-lg font-extrabold text-slate-900">
                  {customizingItem.menuItem.name}
                </h3>
                <span className="text-sm font-black text-emerald-800 font-mono tabular-nums">
                  {formatRupiah(customizingItem.menuItem.price)}
                </span>
              </div>
              <button
                type="button"
                onClick={() => setCustomizingItem(null)}
                className="min-w-[46px] min-h-[46px] flex items-center justify-center clay-btn-neutral cursor-pointer"
                aria-label="Tutup Modifier"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Modifier Groups */}
            <div className="space-y-4 max-h-[55vh] overflow-y-auto pr-1">
              {customizingItem.menuItem.modifierGroups?.map((group) => (
                <div key={group.id} className="space-y-2.5">
                  <span className="text-xs font-extrabold text-slate-600 block uppercase tracking-wider">
                    {group.name}
                  </span>
                  <div className="grid grid-cols-2 gap-2.5">
                    {group.options.map((opt) => {
                      const isSelected = customizingItem.selectedMods.some(
                        (m) => m.groupName === group.name && m.optionName === opt.name
                      );
                      return (
                        <button
                          key={opt.name}
                          type="button"
                          onClick={() => {
                            setCustomizingItem((prev) => {
                              if (!prev) return null;
                              const filtered = prev.selectedMods.filter((m) => m.groupName !== group.name);
                              return {
                                ...prev,
                                selectedMods: [
                                  ...filtered,
                                  { groupName: group.name, optionName: opt.name, priceDelta: opt.priceDelta || 0 },
                                ],
                              };
                            });
                          }}
                          className={`min-h-[52px] p-3.5 text-xs sm:text-sm font-extrabold text-left cursor-pointer ${
                            isSelected ? 'clay-btn-emerald' : 'clay-btn-neutral'
                          }`}
                        >
                          <div>{opt.name}</div>
                          {opt.priceDelta ? (
                            <div
                              className={`text-xs font-mono tabular-nums mt-0.5 ${
                                isSelected ? 'text-emerald-50' : 'text-emerald-800'
                              }`}
                            >
                              +{formatRupiah(opt.priceDelta)}
                            </div>
                          ) : null}
                        </button>
                      );
                    })}
                  </div>
                </div>
              ))}

              <div className="space-y-2 pt-3 border-t border-slate-200/80">
                <label htmlFor="customNoteInput" className="text-xs font-extrabold text-slate-600 uppercase tracking-wider block">
                  Catatan Koki / Barista
                </label>
                <input
                  id="customNoteInput"
                  type="text"
                  placeholder="Contoh: Tanpa kol, es sedikit, sambal pisah..."
                  value={customizingItem.notes}
                  onChange={(e) =>
                    setCustomizingItem((prev) => (prev ? { ...prev, notes: e.target.value } : null))
                  }
                  className="w-full clay-input min-h-[48px] text-sm font-semibold px-4 py-3"
                />
              </div>
            </div>

            <div className="mt-6 pt-4 border-t border-slate-200/80 flex justify-end gap-3">
              <button
                type="button"
                onClick={() => setCustomizingItem(null)}
                className="min-h-[48px] px-5 py-2.5 text-sm font-extrabold clay-btn-neutral whitespace-nowrap cursor-pointer"
              >
                Batal
              </button>
              <button
                type="button"
                onClick={handleSaveCustomization}
                className="min-h-[48px] px-5 py-2.5 text-sm font-extrabold clay-btn-emerald whitespace-nowrap cursor-pointer"
              >
                Simpan ke Pesanan
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
