import React, { useState, useEffect, useRef } from 'react';
import {
  Table,
  Transaction,
  OrderItem,
  PrintTicket,
  OrderBatch,
  RawMaterial,
  CookingStatus,
  PaymentFlowMode,
  StaffAccount,
  PettyCashEntry,
} from './types/pos';
import { INITIAL_TABLES, MENU_ITEMS, RAW_MATERIALS } from './data/initialData';
import {
  calculateOrderTotals,
  generatePrintTickets,
  deductRecipeMaterials,
  handoffTransactionItemsToWaiter,
  countActiveKdsItems,
  countWaiterPickupItems,
  isItemWaitingForWaiter,
} from './utils/posCalculations';
import { assertTableAccess, authenticateStaff, canApproveCancellation, canOperatePOS, createSession, migrateTables, migrateTransactions, appendBatch } from './utils/auditFlow';
import { sounds } from './utils/soundEffects';
import { getApiToken, loadPosSnapshot, openApiSession, submitApiOrder, settleApiSession, mapPaymentToTransaction, mapApiMenuToStock } from './services/posApi';

import { Navbar, NavTabId } from './components/Navbar';
import { FloorPlanGrid } from './components/FloorPlanGrid';
import { OrderModal } from './components/OrderModal';
import { PrinterModal } from './components/PrinterModal';
import { WaiterCheckerModal } from './components/WaiterCheckerModal';
import { PaymentModal } from './components/PaymentModal';
import { SalesSummaryModal } from './components/SalesSummaryModal';
import { KDSModal } from './components/KDSModal';
import { GoogleSheetsModal } from './components/GoogleSheetsModal';
import { LoginModal } from './components/LoginModal';
import { FinanceView } from './components/FinanceView';
import { OwnerDashboardView } from './components/OwnerDashboardView';
import { MenuStockControl, CancellationRequest } from './components/MenuStockControl';
import { StaffAdminView } from './components/StaffAdminView';

const STORAGE_KEY_TABLES = 'resto_pos_tables_v1';
const STORAGE_KEY_TRANSACTIONS = 'resto_pos_tx_v1';
const STORAGE_KEY_SETTLED = 'resto_pos_settled_v1';
const STORAGE_KEY_TICKETS = 'resto_pos_tickets_v1';
const STORAGE_KEY_MATERIALS = 'resto_pos_materials_v1';
const STORAGE_KEY_PAYMENT_MODE = 'resto_pos_payment_mode_v1';
const STORAGE_KEY_STAFF = 'resto_pos_staff_v1';
const STORAGE_KEY_PETTY_CASH = 'resto_pos_petty_cash_v1';
const STORAGE_KEY_MENU_STOCK = 'resto_pos_menu_stock_v1';
const STORAGE_KEY_CANCELLATIONS = 'resto_pos_cancellation_requests_v1';

// Seed sample active transactions for occupied tables
const INITIAL_TRANSACTIONS: Record<string, Transaction> = {
  'TRX-SAMPLE-001': {
    id: 'TRX-SAMPLE-001',
    tableId: 'T05',
    tableNumber: '05',
    area: 'indoor',
    guestCount: 3,
    waiterName: 'Doni Setiawan',
    openedAt: new Date(Date.now() - 35 * 60000).toISOString(),
    status: 'active',
    batches: [
      {
        batchNumber: 1,
        timestamp: new Date(Date.now() - 35 * 60000).toISOString(),
        items: [
          {
            id: 'item-sample-1',
            menuItemId: 'food-1',
            name: 'Nasi Goreng Spesial Resto',
            category: 'makanan',
            destination: 'kitchen',
            unitPrice: 38000,
            quantity: 2,
            selectedModifiers: [{ groupName: 'Level Pedas', optionName: 'Pedas Sedang', priceDelta: 0 }],
            notes: 'Acar dipisah',
            subtotal: 76000,
            batchNumber: 1,
            isServed: true,
          },
          {
            id: 'item-sample-2',
            menuItemId: 'bev-1',
            name: 'Es Teh Manis Jasmine',
            category: 'minuman',
            destination: 'bar',
            unitPrice: 9000,
            quantity: 3,
            selectedModifiers: [{ groupName: 'Es Batu', optionName: 'Es Normal', priceDelta: 0 }],
            notes: '',
            subtotal: 27000,
            batchNumber: 1,
            isServed: true,
          },
          {
            id: 'item-sample-3',
            menuItemId: 'snack-2',
            name: 'Tahu Cabe Garam Crispy',
            category: 'snack',
            destination: 'kitchen',
            unitPrice: 20000,
            quantity: 1,
            selectedModifiers: [],
            notes: 'Goreng garing',
            subtotal: 20000,
            batchNumber: 1,
            isServed: false,
            cookingStatus: 'ready',
          },
        ],
      },
    ],
    allCurrentItems: [
      {
        id: 'item-sample-1',
        menuItemId: 'food-1',
        name: 'Nasi Goreng Spesial Resto',
        category: 'makanan',
        destination: 'kitchen',
        unitPrice: 38000,
        quantity: 2,
        selectedModifiers: [{ groupName: 'Level Pedas', optionName: 'Pedas Sedang', priceDelta: 0 }],
        notes: 'Acar dipisah',
        subtotal: 76000,
        batchNumber: 1,
        isServed: true,
      },
      {
        id: 'item-sample-2',
        menuItemId: 'bev-1',
        name: 'Es Teh Manis Jasmine',
        category: 'minuman',
        destination: 'bar',
        unitPrice: 9000,
        quantity: 3,
        selectedModifiers: [{ groupName: 'Es Batu', optionName: 'Es Normal', priceDelta: 0 }],
        notes: '',
        subtotal: 27000,
        batchNumber: 1,
        isServed: true,
      },
      {
        id: 'item-sample-3',
        menuItemId: 'snack-2',
        name: 'Tahu Cabe Garam Crispy',
        category: 'snack',
        destination: 'kitchen',
        unitPrice: 20000,
        quantity: 1,
        selectedModifiers: [],
        notes: 'Goreng garing',
        subtotal: 20000,
        batchNumber: 1,
        isServed: false,
        cookingStatus: 'ready',
      },
    ],
    subtotal: 123000,
    serviceChargeRate: 0.05,
    serviceChargeAmount: 6150,
    taxRate: 0.1,
    taxAmount: 12915,
    discountAmount: 0,
    totalAmount: 142065,
  },
  'TRX-SAMPLE-002': {
    id: 'TRX-SAMPLE-002',
    tableId: 'T09',
    tableNumber: '09',
    area: 'indoor',
    guestCount: 2,
    waiterName: 'Siti Rahma',
    openedAt: new Date(Date.now() - 15 * 60000).toISOString(),
    status: 'active',
    batches: [
      {
        batchNumber: 1,
        timestamp: new Date(Date.now() - 15 * 60000).toISOString(),
        items: [
          {
            id: 'item-sample-4',
            menuItemId: 'food-2',
            name: 'Ayam Bakar Madu Pedas',
            category: 'makanan',
            destination: 'kitchen',
            unitPrice: 42000,
            quantity: 2,
            selectedModifiers: [{ groupName: 'Pilihan Potongan', optionName: 'Paha Atas & Bawah', priceDelta: 0 }],
            notes: 'Sambal terasi',
            subtotal: 84000,
            batchNumber: 1,
            isServed: true,
          },
          {
            id: 'item-sample-5',
            menuItemId: 'bev-3',
            name: 'Kopi Susu Gula Aren Barista',
            category: 'minuman',
            destination: 'bar',
            unitPrice: 24000,
            quantity: 2,
            selectedModifiers: [{ groupName: 'Level Gula Aren', optionName: 'Normal 100%', priceDelta: 0 }],
            notes: '',
            subtotal: 48000,
            batchNumber: 1,
            isServed: true,
          },
        ],
      },
    ],
    allCurrentItems: [
      {
        id: 'item-sample-4',
        menuItemId: 'food-2',
        name: 'Ayam Bakar Madu Pedas',
        category: 'makanan',
        destination: 'kitchen',
        unitPrice: 42000,
        quantity: 2,
        selectedModifiers: [{ groupName: 'Pilihan Potongan', optionName: 'Paha Atas & Bawah', priceDelta: 0 }],
        notes: 'Sambal terasi',
        subtotal: 84000,
        batchNumber: 1,
        isServed: true,
      },
      {
        id: 'item-sample-5',
        menuItemId: 'bev-3',
        name: 'Kopi Susu Gula Aren Barista',
        category: 'minuman',
        destination: 'bar',
        unitPrice: 24000,
        quantity: 2,
        selectedModifiers: [{ groupName: 'Level Gula Aren', optionName: 'Normal 100%', priceDelta: 0 }],
        notes: '',
        subtotal: 48000,
        batchNumber: 1,
        isServed: true,
      },
    ],
    subtotal: 132000,
    serviceChargeRate: 0.05,
    serviceChargeAmount: 6600,
    taxRate: 0.1,
    taxAmount: 13860,
    discountAmount: 0,
    totalAmount: 152460,
  },
  'TRX-SAMPLE-003': {
    id: 'TRX-SAMPLE-003',
    tableId: 'T15',
    tableNumber: '15',
    area: 'indoor',
    guestCount: 4,
    waiterName: 'Budi Prasetyo',
    openedAt: new Date(Date.now() - 50 * 60000).toISOString(),
    status: 'active',
    batches: [
      {
        batchNumber: 1,
        timestamp: new Date(Date.now() - 50 * 60000).toISOString(),
        items: [
          {
            id: 'item-sample-6',
            menuItemId: 'food-4',
            name: 'Gurame Bakar Jimbaran (Porsi 2-3 Org)',
            category: 'makanan',
            destination: 'kitchen',
            unitPrice: 85000,
            quantity: 1,
            selectedModifiers: [],
            notes: 'Pedas manis mantap',
            subtotal: 85000,
            batchNumber: 1,
            isServed: true,
          },
          {
            id: 'item-sample-7',
            menuItemId: 'food-8',
            name: 'Tumis Kangkung Belacan Hotplate',
            category: 'makanan',
            destination: 'kitchen',
            unitPrice: 24000,
            quantity: 2,
            selectedModifiers: [],
            notes: '',
            subtotal: 48000,
            batchNumber: 1,
            isServed: true,
          },
        ],
      },
    ],
    allCurrentItems: [
      {
        id: 'item-sample-6',
        menuItemId: 'food-4',
        name: 'Gurame Bakar Jimbaran (Porsi 2-3 Org)',
        category: 'makanan',
        destination: 'kitchen',
        unitPrice: 85000,
        quantity: 1,
        selectedModifiers: [],
        notes: 'Pedas manis mantap',
        subtotal: 85000,
        batchNumber: 1,
        isServed: true,
      },
      {
        id: 'item-sample-7',
        menuItemId: 'food-8',
        name: 'Tumis Kangkung Belacan Hotplate',
        category: 'makanan',
        destination: 'kitchen',
        unitPrice: 24000,
        quantity: 2,
        selectedModifiers: [],
        notes: '',
        subtotal: 48000,
        batchNumber: 1,
        isServed: true,
      },
    ],
    subtotal: 133000,
    serviceChargeRate: 0.05,
    serviceChargeAmount: 6650,
    taxRate: 0.1,
    taxAmount: 13965,
    discountAmount: 0,
    totalAmount: 153615,
  },
  'TRX-SAMPLE-004': {
    id: 'TRX-SAMPLE-004',
    tableId: 'T21',
    tableNumber: '21',
    area: 'outdoor',
    guestCount: 2,
    waiterName: 'Doni Setiawan',
    openedAt: new Date(Date.now() - 20 * 60000).toISOString(),
    status: 'active',
    batches: [
      {
        batchNumber: 1,
        timestamp: new Date(Date.now() - 20 * 60000).toISOString(),
        items: [
          {
            id: 'item-sample-8',
            menuItemId: 'food-5',
            name: 'Sate Ayam Madura (10 Tusuk)',
            category: 'makanan',
            destination: 'kitchen',
            unitPrice: 36000,
            quantity: 2,
            selectedModifiers: [],
            notes: 'Bumbu kacang kental',
            subtotal: 72000,
            batchNumber: 1,
            isServed: false,
            cookingStatus: 'cooking',
          },
          {
            id: 'item-sample-9',
            menuItemId: 'bev-2',
            name: 'Es Jeruk Peras Murni',
            category: 'minuman',
            destination: 'bar',
            unitPrice: 18000,
            quantity: 2,
            selectedModifiers: [],
            notes: 'Es dingin',
            subtotal: 36000,
            batchNumber: 1,
            isServed: true,
          },
        ],
      },
    ],
    allCurrentItems: [
      {
        id: 'item-sample-8',
        menuItemId: 'food-5',
        name: 'Sate Ayam Madura (10 Tusuk)',
        category: 'makanan',
        destination: 'kitchen',
        unitPrice: 36000,
        quantity: 2,
        selectedModifiers: [],
        notes: 'Bumbu kacang kental',
        subtotal: 72000,
        batchNumber: 1,
        isServed: false,
        cookingStatus: 'cooking',
      },
      {
        id: 'item-sample-9',
        menuItemId: 'bev-2',
        name: 'Es Jeruk Peras Murni',
        category: 'minuman',
        destination: 'bar',
        unitPrice: 18000,
        quantity: 2,
        selectedModifiers: [],
        notes: 'Es dingin',
        subtotal: 36000,
        batchNumber: 1,
        isServed: true,
      },
    ],
    subtotal: 108000,
    serviceChargeRate: 0.05,
    serviceChargeAmount: 5400,
    taxRate: 0.1,
    taxAmount: 11340,
    discountAmount: 0,
    totalAmount: 124740,
  },
};

export default function App() {
  // State Initialization
  const [tables, setTables] = useState<Table[]>(() => {
    if (localStorage.getItem('gastro_cashier_api_token')) return [];
    try {
      const saved = localStorage.getItem(STORAGE_KEY_TABLES);
      if (saved) return migrateTables(JSON.parse(saved));
    } catch {}
    return INITIAL_TABLES;
  });

  const [activeTransactions, setActiveTransactions] = useState<Record<string, Transaction>>(() => {
    if (localStorage.getItem('gastro_cashier_api_token')) return {};
    try {
      const saved = localStorage.getItem(STORAGE_KEY_TRANSACTIONS);
      if (saved) return migrateTransactions(JSON.parse(saved));
    } catch {}
    return INITIAL_TRANSACTIONS;
  });

  const [settledTransactions, setSettledTransactions] = useState<Transaction[]>(() => {
    try {
      const saved = localStorage.getItem(STORAGE_KEY_SETTLED);
      if (saved) return JSON.parse(saved);
    } catch {}
    return [];
  });

  const [allPrintTickets, setAllPrintTickets] = useState<PrintTicket[]>(() => {
    try {
      const saved = localStorage.getItem(STORAGE_KEY_TICKETS);
      if (saved) return JSON.parse(saved);
    } catch {}
    return [];
  });

  const [rawMaterials, setRawMaterials] = useState<RawMaterial[]>(() => {
    try {
      const saved = localStorage.getItem(STORAGE_KEY_MATERIALS);
      if (saved) return JSON.parse(saved);
    } catch {}
    return RAW_MATERIALS;
  });

  const [menuStock, setMenuStock] = useState<Record<string, number>>(() => {
    try {
      const saved = localStorage.getItem(STORAGE_KEY_MENU_STOCK);
      if (saved) return JSON.parse(saved);
    } catch {}
    return Object.fromEntries(MENU_ITEMS.map((item) => [item.id, item.stock]));
  });
  // Synchronous local reservation guard: prevents stale React state from overselling
  // within this browser session. Cross-device concurrency still requires a backend transaction.
  const menuStockRef = useRef(menuStock);
  const reserveMenuStock = (items: OrderItem[]) => {
    const requested = items.reduce<Record<string, number>>((acc, item) => {
      acc[item.menuItemId] = (acc[item.menuItemId] || 0) + item.quantity;
      return acc;
    }, {});
    const shortage = Object.entries(requested).find(([menuId, qty]) =>
      (menuStockRef.current[menuId] ?? 0) < qty
    );
    if (shortage) {
      const menu = MENU_ITEMS.find((item) => item.id === shortage[0]);
      window.alert(`Stok ${menu?.name || shortage[0]} tidak mencukupi. Tersedia: ${menuStockRef.current[shortage[0]] ?? 0}.`);
      return false;
    }
    const next = { ...menuStockRef.current };
    Object.entries(requested).forEach(([menuId, qty]) => { next[menuId] -= qty; });
    menuStockRef.current = next;
    setMenuStock(next);
    return true;
  };

  const [cancellationRequests, setCancellationRequests] = useState<CancellationRequest[]>(() => {
    try {
      const saved = localStorage.getItem(STORAGE_KEY_CANCELLATIONS);
      if (saved) return JSON.parse(saved);
    } catch {}
    return [];
  });

  const [paymentFlowMode, setPaymentFlowMode] = useState<PaymentFlowMode>(() => {
    try {
      const saved = localStorage.getItem(STORAGE_KEY_PAYMENT_MODE);
      if (saved === 'payment_first' || saved === 'payment_last') return saved;
    } catch {}
    return 'payment_last';
  });

  // Staff Authentication & Role State
  const [currentStaff, setCurrentStaff] = useState<StaffAccount | null>(() => {
    try {
      const saved = localStorage.getItem(STORAGE_KEY_STAFF);
      if (saved) return authenticateStaff(JSON.parse(saved));
    } catch {}
    return null;
  });

  const [apiMenu, setApiMenu] = useState<Record<string, any>[]>([]);

  useEffect(() => {
    if (!currentStaff) return;
    if (!getApiToken()) { setCurrentStaff(null); return; }
    let cancelled = false;
    loadPosSnapshot().then(snapshot => {
      if (cancelled) return;
      setTables(snapshot.tables);
      setActiveTransactions(snapshot.transactions);
      setApiMenu(snapshot.menu);
      const stock = mapApiMenuToStock(snapshot.menu, MENU_ITEMS);
      menuStockRef.current = stock;
      setMenuStock(stock);
      setPaymentFlowMode('payment_last');
    }).catch(error => {
      if (!cancelled) window.alert('Gagal memuat data POS dari server: ' + (error instanceof Error ? error.message : 'Unknown error'));
    });
    return () => { cancelled = true; };
  }, [currentStaff?.id]);


  const [isLocked, setIsLocked] = useState<boolean>(false);

  const [pettyCashEntries, setPettyCashEntries] = useState<PettyCashEntry[]>(() => {
    try {
      const saved = localStorage.getItem(STORAGE_KEY_PETTY_CASH);
      if (saved) return JSON.parse(saved);
    } catch {}
    return [
      {
        id: 'pc-init-1',
        timestamp: new Date(Date.now() - 120 * 60000).toISOString(),
        description: 'Isi Ulang Gas LPG 12kg Dapur',
        category: 'operasional',
        amount: 45000,
        recordedBy: 'Ratna Dewi',
        receiptNumber: 'B-8821',
      },
      {
        id: 'pc-init-2',
        timestamp: new Date(Date.now() - 60 * 60000).toISOString(),
        description: 'Es Kristal Balok Tambahan Bar Station',
        category: 'bahan_darurat',
        amount: 25000,
        recordedBy: 'Ratna Dewi',
        receiptNumber: 'B-8839',
      },
    ];
  });

  // UI Navigation & Modals
  const [activeTab, setActiveTab] = useState<NavTabId>('floor');
  const [soundEnabled, setSoundEnabled] = useState(true);

  // Active modal targets
  const [orderModalTable, setOrderModalTable] = useState<Table | null>(null);
  const [paymentModalTable, setPaymentModalTable] = useState<Table | null>(null);
  const [checkerModalTableId, setCheckerModalTableId] = useState<string | undefined>(undefined);
  const [showCheckerModal, setShowCheckerModal] = useState(false);
  const [showPrinterModal, setShowPrinterModal] = useState(false);
  const [printerModalTickets, setPrinterModalTickets] = useState<PrintTicket[]>([]);
  const [showSalesModal, setShowSalesModal] = useState(false);
  const [showResetConfirm, setShowResetConfirm] = useState(false);
  const [showSheetsModal, setShowSheetsModal] = useState(false);
  const [sheetsModalMode, setSheetsModalMode] = useState<'create' | 'sales' | 'inventory'>('create');

  const handleOpenGoogleSheets = (mode: 'create' | 'sales' | 'inventory' = 'create') => {
    sounds.playTapSound();
    setSheetsModalMode(mode);
    setShowSheetsModal(true);
  };

  const handleLoginSuccess = (rawStaff: StaffAccount) => {
    const staff = authenticateStaff(rawStaff);
    if (!staff) { window.alert('Akun tidak aktif atau tidak memiliki membership outlet aktif.'); return; }
    setCurrentStaff(staff);
    setIsLocked(false);
    try {
      localStorage.setItem(STORAGE_KEY_STAFF, JSON.stringify(staff));
    } catch {}
    // Automatically navigate to role-specific landing view
    if (staff.role === 'owner') {
      setActiveTab('owner');
    } else if (staff.role === 'finance') {
      setActiveTab('finance');
    } else {
      setActiveTab('floor');
    }
  };

  const handleLockScreen = () => {
    sounds.playTapSound();
    setIsLocked(true);
  };

  const handleAddPettyCash = (entry: Omit<PettyCashEntry, 'id' | 'timestamp'>) => {
    const newEntry: PettyCashEntry = {
      ...entry,
      id: `pc-${Date.now()}-${Math.floor(100 + Math.random() * 900)}`,
      timestamp: new Date().toISOString(),
    };
    setPettyCashEntries((prev) => [newEntry, ...prev]);
  };

  const handleDeletePettyCash = (id: string) => {
    sounds.playTapSound();
    setPettyCashEntries((prev) => prev.filter((p) => p.id !== id));
  };

  // Sync to LocalStorage
  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY_TABLES, JSON.stringify(tables));
      localStorage.setItem(STORAGE_KEY_TRANSACTIONS, JSON.stringify(activeTransactions));
      localStorage.setItem(STORAGE_KEY_SETTLED, JSON.stringify(settledTransactions));
      localStorage.setItem(STORAGE_KEY_TICKETS, JSON.stringify(allPrintTickets));
      localStorage.setItem(STORAGE_KEY_MATERIALS, JSON.stringify(rawMaterials));
      localStorage.setItem(STORAGE_KEY_MENU_STOCK, JSON.stringify(menuStock));
      localStorage.setItem(STORAGE_KEY_CANCELLATIONS, JSON.stringify(cancellationRequests));
      localStorage.setItem(STORAGE_KEY_PAYMENT_MODE, paymentFlowMode);
      if (currentStaff) localStorage.setItem(STORAGE_KEY_STAFF, JSON.stringify(currentStaff));
      localStorage.setItem(STORAGE_KEY_PETTY_CASH, JSON.stringify(pettyCashEntries));
    } catch {}
  }, [tables, activeTransactions, settledTransactions, allPrintTickets, rawMaterials, menuStock, cancellationRequests, paymentFlowMode, currentStaff, pettyCashEntries]);

  // RESET DEMO DATA
  const handleResetData = () => {
    setShowResetConfirm(true);
  };

  const confirmResetData = () => {
    setTables(INITIAL_TABLES);
    setActiveTransactions(INITIAL_TRANSACTIONS);
    setSettledTransactions([]);
    setAllPrintTickets([]);
    setRawMaterials(RAW_MATERIALS);
    const initialMenuStock = Object.fromEntries(MENU_ITEMS.map((item) => [item.id, item.stock]));
    menuStockRef.current = initialMenuStock;
    setMenuStock(initialMenuStock);
    setCancellationRequests([]);
    setPaymentFlowMode('payment_last');
    setPettyCashEntries([
      {
        id: 'pc-init-1',
        timestamp: new Date(Date.now() - 120 * 60000).toISOString(),
        description: 'Isi Ulang Gas LPG 12kg Dapur',
        category: 'operasional',
        amount: 45000,
        recordedBy: 'Ratna Dewi',
        receiptNumber: 'B-8821',
      },
      {
        id: 'pc-init-2',
        timestamp: new Date(Date.now() - 60 * 60000).toISOString(),
        description: 'Es Kristal Balok Tambahan Bar Station',
        category: 'bahan_darurat',
        amount: 25000,
        recordedBy: 'Ratna Dewi',
        receiptNumber: 'B-8839',
      },
    ]);
    localStorage.clear();
    setShowResetConfirm(false);
    if (soundEnabled) sounds.playBellSound();
  };

  // FLOW 1 (EXISTING): PAYMENT LAST (BAYAR BELAKANG) — OPEN TABLE & SEND TO KITCHEN/BAR
  const handleSubmitOrder = async (params: {
    table: Table; guestCount: number; waiterName: string; newItems: OrderItem[]; batchNumber: number;
  }) => {
    const { table, guestCount, waiterName } = params;
    if (!currentStaff || !canOperatePOS(currentStaff) || !getApiToken()) { window.alert('Sesi API POS tidak aktif. Silakan login ulang.'); return; }
    if (!apiMenu.length) { window.alert('Katalog API belum dimuat. Pesanan tidak dikirim.'); return; }
    try {
      let sessionId = table.currentTransactionId;
      if (!sessionId) {
        const created = await openApiSession(table, guestCount, currentStaff.id);
        sessionId = created.id;
      }
      await submitApiOrder(sessionId, params.newItems, apiMenu);
      const snapshot = await loadPosSnapshot();
      const transaction = snapshot.transactions[sessionId];
      if (!transaction) throw new Error('Sesi tersimpan tetapi tidak ditemukan saat refresh.');
      const stampedItems = transaction.batches[transaction.batches.length - 1]?.items || [];
      const newTickets = generatePrintTickets({ transaction, batchItems: stampedItems, batchNumber: stampedItems[0]?.batchNumber || params.batchNumber, type: 'order' });
      setTables(snapshot.tables);
      setActiveTransactions(snapshot.transactions);
      setApiMenu(snapshot.menu);
      setAllPrintTickets(prev => [...newTickets, ...prev]);
      setOrderModalTable(null);
      setPrinterModalTickets(newTickets);
      setShowPrinterModal(true);
      if (soundEnabled) { sounds.playPrinterSound(); setTimeout(() => sounds.playBellSound(), 350); }
    } catch (error) {
      window.alert('Pesanan gagal disimpan ke database. Tidak ada transaksi lokal pengganti yang dibuat. ' + (error instanceof Error ? error.message : 'Unknown error'));
    }
  };

  // FLOW 2 (NEW): PAYMENT FIRST (LANGSUNG BAYAR DI DEPAN) — SETTLE IMMEDIATELY + PRINT RECEIPT & KITCHEN/BAR/CHECKER
  const handleSubmitPaymentFirstOrder = (_params: {
    table: Table; guestCount: number; waiterName: string; newItems: OrderItem[]; batchNumber: number;
    paymentMethod: 'cash' | 'qris' | 'card'; cashGiven: number; changeAmount: number; discountAmount: number; keepTableAvailable?: boolean;
  }) => {
    window.alert('Payment First sementara dinonaktifkan sampai backend mendukung pembayaran parsial dan sesi layanan setelah pelunasan. Gunakan Payment Last agar pembayaran tercatat atomik di database.');
  };

  // KDS Dapur & Barista Cooking Status Management
  const handleUpdateCookingStatus = (transactionId: string, itemId: string, status: CookingStatus) => {
    const now = new Date().toISOString();
    setActiveTransactions((prev) => {
      const tx = prev[transactionId];
      if (!tx) return prev;

      const updatedItems = tx.allCurrentItems.map((item) =>
        item.id === itemId
          ? {
              ...item,
              cookingStatus: status,
              handedOffAt: status === 'handed_off' ? now : item.handedOffAt,
            }
          : item
      );

      const updatedBatches = tx.batches.map((b) => ({
        ...b,
        items: b.items.map((item) =>
          item.id === itemId
            ? {
                ...item,
                cookingStatus: status,
                handedOffAt: status === 'handed_off' ? now : item.handedOffAt,
              }
            : item
        ),
      }));

      return {
        ...prev,
        [transactionId]: {
          ...tx,
          allCurrentItems: updatedItems,
          batches: updatedBatches,
        },
      };
    });
  };

  // KDS -> Waiter Ticket Handoff (removes completed items/ticket from KDS & moves to Waiter Checker)
  const handleHandoffTicketToWaiter = (
    transactionId: string,
    options?: {
      stationFilter?: 'all' | 'kitchen' | 'bar';
      onlyReady?: boolean;
      openCheckerTableId?: string;
    }
  ) => {
    setActiveTransactions((prev) => {
      const tx = prev[transactionId];
      if (!tx) return prev;
      return {
        ...prev,
        [transactionId]: handoffTransactionItemsToWaiter(tx, {
          stationFilter: options?.stationFilter,
          onlyReady: options?.onlyReady,
        }),
      };
    });

    if (options?.openCheckerTableId) {
      setCheckerModalTableId(options.openCheckerTableId);
      setActiveTab('checker');
      setShowCheckerModal(true);
    }
  };

  const handleRequestCancellation = (request: Omit<CancellationRequest, 'id' | 'requestedAt' | 'requestedBy'>) => {
    const exists = cancellationRequests.some((entry) => entry.transactionId === request.transactionId && entry.itemId === request.itemId);
    if (exists) return;
    setCancellationRequests((prev) => [{
      ...request,
      id: `pending:${Date.now()}:${request.itemId}`,
      requestedAt: new Date().toISOString(),
      requestedBy: currentStaff?.name || 'Staff',
    }, ...prev]);
  };

  const handleRejectCancellation = (requestId: string) => {
    if (!canApproveCancellation(currentStaff)) {
      window.alert('Hanya Outlet Manager (role Owner pada demo) yang dapat memproses pembatalan.');
      return;
    }
    setCancellationRequests((prev) => prev.filter((request) => request.id !== requestId));
  };

  const handleApproveCancellation = (requestId: string) => {
    if (!canApproveCancellation(currentStaff)) {
      window.alert('Hanya Outlet Manager (role Owner pada demo) yang dapat menyetujui pengembalian stok.');
      return;
    }
    const request = cancellationRequests.find((entry) => entry.id === requestId);
    if (!request) return;
    const tx = activeTransactions[request.transactionId];
    const item = tx?.allCurrentItems.find((entry) => entry.id === request.itemId);
    if (!tx || !item || item.isServed || ['cooking', 'ready', 'handed_off'].includes(item.cookingStatus || '')) {
      window.alert('Item sudah diproses/tersaji atau tidak lagi aktif. Stok tidak dikembalikan.');
      setCancellationRequests((prev) => prev.filter((entry) => entry.id !== requestId));
      return;
    }
    const nextStock = { ...menuStockRef.current, [request.menuItemId]: (menuStockRef.current[request.menuItemId] || 0) + item.quantity };
    menuStockRef.current = nextStock;
    setMenuStock(nextStock);
    const remainingItems = tx.allCurrentItems.filter((entry) => entry.id !== item.id);
    const remainingBatches = tx.batches.map((batch) => ({ ...batch, items: batch.items.filter((entry) => entry.id !== item.id) })).filter((batch) => batch.items.length > 0);
    const totals = calculateOrderTotals(remainingItems, tx.discountAmount);
    setActiveTransactions((prev) => ({
      ...prev,
      [tx.id]: { ...tx, allCurrentItems: remainingItems, batches: remainingBatches, subtotal: totals.subtotal, serviceChargeAmount: totals.serviceChargeAmount, taxAmount: totals.taxAmount, totalAmount: totals.totalAmount },
    }));
    setCancellationRequests((prev) => prev.filter((entry) => entry.id !== requestId));
  };

  // RestoSync Feature - Quick Restock Material
  const handleRestockMaterial = (materialId: string, amount: number) => {
    setRawMaterials((prev) =>
      prev.map((m) =>
        m.id === materialId
          ? { ...m, currentStock: Number((m.currentStock + amount).toFixed(2)) }
          : m
      )
    );
  };

  // STEP 5: TOGGLE SERVED ITEM (Pencontrengan Waiter)
  const handleToggleItemServed = (transactionId: string, itemId: string) => {
    setActiveTransactions((prev) => {
      const tx = prev[transactionId];
      if (!tx) return prev;

      const updatedItems = tx.allCurrentItems.map((item) =>
        item.id === itemId
          ? {
              ...item,
              isServed: !item.isServed,
              servedAt: !item.isServed ? new Date().toISOString() : undefined,
            }
          : item
      );

      return {
        ...prev,
        [transactionId]: {
          ...tx,
          allCurrentItems: updatedItems,
        },
      };
    });

    // Also update tickets in state if present
    setAllPrintTickets((prev) =>
      prev.map((t) => ({
        ...t,
        items: t.items.map((i) =>
          i.id === itemId
            ? { ...i, isServed: !i.isServed }
            : i
        ),
      }))
    );
  };

  // Mark all served for a table
  const handleMarkAllServed = (transactionId: string) => {
    const now = new Date().toISOString();
    setActiveTransactions((prev) => {
      const tx = prev[transactionId];
      if (!tx) return prev;

      const updatedItems = tx.allCurrentItems.map((item) => ({
        ...item,
        isServed: true,
        cookingStatus: 'handed_off' as const,
        servedAt: item.servedAt || now,
      }));

      return {
        ...prev,
        [transactionId]: {
          ...tx,
          allCurrentItems: updatedItems,
        },
      };
    });
  };

  // Mark all handed-off (Siap Antar) items served for a table
  const handleMarkHandedOffServed = (transactionId: string) => {
    const now = new Date().toISOString();
    setActiveTransactions((prev) => {
      const tx = prev[transactionId];
      if (!tx) return prev;

      const updatedItems = tx.allCurrentItems.map((item) =>
        isItemWaitingForWaiter(item)
          ? {
              ...item,
              isServed: true,
              servedAt: now,
            }
          : item
      );

      return {
        ...prev,
        [transactionId]: {
          ...tx,
          allCurrentItems: updatedItems,
        },
      };
    });
  };

  // STEP 7: SETTLEMENT & CLOSE TABLE
  const handleCompleteSettlement = async (params: {
    transactionId: string;
    tableId: string;
    paymentMethod: 'cash' | 'qris' | 'card';
    cashGiven?: number;
    changeAmount?: number;
    discountAmount: number;
  }) => {
    const { transactionId, tableId, paymentMethod, cashGiven, discountAmount } = params;
    const currentTx = activeTransactions[transactionId];
    if (!currentTx || !canOperatePOS(currentStaff) || !getApiToken()) return;
    try {
      const payment = await settleApiSession(transactionId, paymentMethod, discountAmount, cashGiven);
      const completedTx = mapPaymentToTransaction(currentTx, payment);
      const receiptTicket = generatePrintTickets({
        transaction: completedTx,
        batchItems: completedTx.allCurrentItems,
        batchNumber: completedTx.batches.length,
        type: 'settlement',
      });
      const snapshot = await loadPosSnapshot();
      setTables(snapshot.tables);
      setActiveTransactions(snapshot.transactions);
      setSettledTransactions(prev => [completedTx, ...prev]);
      setAllPrintTickets(prev => [...receiptTicket, ...prev]);
      setPaymentModalTable(null);
      setPrinterModalTickets(receiptTicket);
      setShowPrinterModal(true);
      if (soundEnabled) sounds.playPrinterSound();
    } catch (error) {
      window.alert('Pembayaran belum dikonfirmasi oleh database. Jangan ulangi dengan nominal berbeda. ' + (error instanceof Error ? error.message : 'Unknown error'));
    }
  };

  // Clear an already-paid (Payment First) table back to Available without double-counting revenue
  const handleClearPaidTable = (table: Table) => {
    const txId = table.currentTransactionId;
    if (txId) {
      setActiveTransactions((prev) => {
        const copy = { ...prev };
        delete copy[txId];
        return copy;
      });
    }
    setTables((prev) =>
      prev.map((t) =>
        t.id === table.id
          ? {
              ...t,
              status: 'available',
              currentTransactionId: undefined,
              guestCount: undefined,
              openedAt: undefined,
              waiterName: undefined,
            }
          : t
      )
    );
    if (soundEnabled) sounds.playBellSound();
  };

  // Reprint receipt for an active Payment First (Lunas) table
  const handleReprintPaidReceipt = (table: Table) => {
    if (!table.currentTransactionId) return;
    const tx = activeTransactions[table.currentTransactionId];
    if (!tx) return;
    const receiptTicket = generatePrintTickets({
      transaction: tx,
      batchItems: tx.allCurrentItems,
      batchNumber: tx.batches.length,
      type: 'settlement',
    });
    setPrinterModalTickets(receiptTicket);
    setShowPrinterModal(true);
    if (soundEnabled) sounds.playPrinterSound();
  };

  // Reprint helper
  const handleReprintReceipt = (tx: Transaction) => {
    const receiptTicket = generatePrintTickets({
      transaction: tx,
      batchItems: tx.allCurrentItems,
      batchNumber: tx.batches.length,
      type: 'settlement',
    });
    setPrinterModalTickets(receiptTicket);
    setShowPrinterModal(true);
    if (soundEnabled) sounds.playPrinterSound();
  };

  // View slip from checker
  const handleViewSlip = (table: Table) => {
    if (!table.currentTransactionId) return;
    const tx = activeTransactions[table.currentTransactionId];
    if (!tx) return;

    const tickets = generatePrintTickets({
      transaction: tx,
      batchItems: tx.allCurrentItems,
      batchNumber: tx.batches.length,
      type: 'order',
    });
    setPrinterModalTickets(tickets);
    setShowPrinterModal(true);
  };

  return (
    <div className="h-screen w-screen overflow-hidden clay-canvas text-slate-800 flex flex-col font-sans selection:bg-emerald-600 selection:text-white">
      {/* Top POS Navbar */}
      <Navbar
        tables={tables}
        activeTab={activeTab}
        setActiveTab={(tab) => {
          sounds.playTapSound();
          setActiveTab(tab);
          if (tab === 'sales') setShowSalesModal(true);
          if (tab === 'printer') {
            setPrinterModalTickets(allPrintTickets.slice(0, 6));
            setShowPrinterModal(true);
          }
          if (tab === 'checker') {
            setShowCheckerModal(true);
          }
        }}
        soundEnabled={soundEnabled}
        setSoundEnabled={setSoundEnabled}
        onResetData={handleResetData}
        recentTicketsCount={allPrintTickets.length}
        lowStockAlertCount={Object.values(menuStock).filter((stock) => stock === 0).length}
        activeKdsCount={countActiveKdsItems(activeTransactions)}
        waiterPickupCount={countWaiterPickupItems(activeTransactions)}
        paymentFlowMode={paymentFlowMode}
        onOpenGoogleSheets={() => handleOpenGoogleSheets('create')}
        currentStaff={currentStaff}
        onLockScreen={handleLockScreen}
      />

      {/* Main Dynamic View: Owner Dashboard, Finance Workspace, or Cashier Floor Plan */}
      <main className="flex-1 min-h-0 flex flex-col overflow-hidden">
        {activeTab === 'admin' && currentStaff?.role === 'owner' ? (
          <StaffAdminView currentStaff={currentStaff} onLockScreen={handleLockScreen} />
        ) : activeTab === 'owner' && currentStaff?.role === 'owner' ? (
          <OwnerDashboardView
            currentStaff={currentStaff}
            tables={tables}
            transactions={activeTransactions}
            settledTransactions={settledTransactions}
            rawMaterials={rawMaterials}
            pettyCashEntries={pettyCashEntries}
            onOpenGoogleSheets={() => handleOpenGoogleSheets('sales')}
            onSwitchToFloorPlan={() => setActiveTab('floor')}
            onSwitchToFinance={() => setActiveTab('finance')}
            onRestockMaterial={handleRestockMaterial}
            onResetData={handleResetData}
            onLockScreen={handleLockScreen}
          />
        ) : activeTab === 'finance' && (currentStaff?.role === 'finance' || currentStaff?.role === 'owner') ? (
          <FinanceView
            currentStaff={currentStaff}
            settledTransactions={settledTransactions}
            pettyCashEntries={pettyCashEntries}
            onAddPettyCash={handleAddPettyCash}
            onDeletePettyCash={handleDeletePettyCash}
            onOpenGoogleSheets={() => handleOpenGoogleSheets('sales')}
            onReprintReceipt={handleReprintReceipt}
            onLockScreen={handleLockScreen}
          />
        ) : (
          <FloorPlanGrid
            tables={tables}
            transactions={activeTransactions}
            onSelectTable={(table) => {
              sounds.playTapSound();
              const access = assertTableAccess(currentStaff, table, activeTransactions);
              if (!access.ok) window.alert(access.message);
            }}
            onOpenOrder={async (table) => {
              const access = assertTableAccess(currentStaff, table, activeTransactions);
              if (!access.ok || !currentStaff) { if (!access.ok) window.alert(access.message); return; }
              try {
                let sessionId = table.currentTransactionId;
                if (!sessionId) {
                  const created = await openApiSession(table, table.guestCount || Math.min(table.capacity, 2), currentStaff.id);
                  sessionId = created.id;
                }
                const snapshot = await loadPosSnapshot();
                const opened = snapshot.tables.find(t => t.id === table.id);
                if (!opened || !snapshot.transactions[sessionId]) throw new Error('Sesi meja tidak ditemukan setelah dibuat.');
                setTables(snapshot.tables);
                setActiveTransactions(snapshot.transactions);
                setOrderModalTable(opened);
              } catch (error) {
                window.alert('Gagal membuka meja melalui API: ' + (error instanceof Error ? error.message : 'Unknown error'));
              }
            }}
            onOpenPayment={(table) => {
              sounds.playTapSound();
              const access = assertTableAccess(currentStaff, table, activeTransactions);
              if (!access.ok) { window.alert(access.message); return; }
              setPaymentModalTable(table);
            }}
            onOpenChecker={(table) => {
              sounds.playTapSound();
              setCheckerModalTableId(table.id);
              setShowCheckerModal(true);
            }}
            onClearPaidTable={handleClearPaidTable}
            onReprintPaidReceipt={handleReprintPaidReceipt}
          />
        )}
      </main>

      {/* ORDER MODAL (Open Table or Add Order — Supports Payment Last & Payment First) */}
      {orderModalTable && (
        <OrderModal
          table={orderModalTable}
          existingTransaction={
            orderModalTable.currentTransactionId
              ? activeTransactions[orderModalTable.currentTransactionId]
              : undefined
          }
          paymentFlowMode={paymentFlowMode}
          onChangePaymentFlowMode={setPaymentFlowMode}
          onClose={() => setOrderModalTable(null)}
          onSubmitOrder={handleSubmitOrder}
          onSubmitPaymentFirstOrder={handleSubmitPaymentFirstOrder}
          menuStock={menuStock}
          staffName={currentStaff?.name}
        />
      )}

      {/* PAYMENT & SETTLEMENT MODAL */}
      {paymentModalTable && paymentModalTable.currentTransactionId && (
        <PaymentModal
          table={paymentModalTable}
          transaction={activeTransactions[paymentModalTable.currentTransactionId]}
          onClose={() => setPaymentModalTable(null)}
          onCompleteSettlement={handleCompleteSettlement}
        />
      )}

      {/* WAITER CHECKER MODAL (Pencontrengan saat antar makanan) */}
      {showCheckerModal && (
        <WaiterCheckerModal
          tables={tables}
          transactions={activeTransactions}
          initialTableId={checkerModalTableId}
          onClose={() => {
            setShowCheckerModal(false);
            setCheckerModalTableId(undefined);
            if (activeTab === 'checker') setActiveTab('floor');
          }}
          onToggleItemServed={handleToggleItemServed}
          onMarkAllServed={handleMarkAllServed}
          onMarkHandedOffServed={handleMarkHandedOffServed}
          onOpenKds={() => {
            setShowCheckerModal(false);
            setCheckerModalTableId(undefined);
            setActiveTab('kds');
          }}
          onViewSlip={handleViewSlip}
        />
      )}

      {/* KDS (Kitchen Display System) MODAL - RestoSync Feature */}
      {activeTab === 'kds' && (
        <KDSModal
          transactions={activeTransactions}
          onClose={() => setActiveTab('floor')}
          onUpdateCookingStatus={handleUpdateCookingStatus}
          onHandoffTicketToWaiter={handleHandoffTicketToWaiter}
          onOpenWaiterChecker={(tableId) => {
            setCheckerModalTableId(tableId);
            setActiveTab('checker');
            setShowCheckerModal(true);
          }}
        />
      )}

      {/* INVENTORY & MENU STOCK CONTROL */}
      {activeTab === 'inventory' && (
        <MenuStockControl
          menuStock={menuStock}
          transactions={activeTransactions}
          requests={cancellationRequests}
          isManager={currentStaff?.role === 'owner'}
          onRequestCancellation={handleRequestCancellation}
          onApproveCancellation={handleApproveCancellation}
          onRejectCancellation={handleRejectCancellation}
        />
      )}

      {/* PRINTER AUTO-ROUTING HUB MODAL */}
      {showPrinterModal && (
        <PrinterModal
          tickets={
            printerModalTickets.length > 0
              ? printerModalTickets
              : allPrintTickets.slice(0, 4)
          }
          onClose={() => {
            setShowPrinterModal(false);
            if (activeTab === 'printer') setActiveTab('floor');
          }}
          onToggleServed={(itemId) => {
            // Find active transaction that has this item
            const foundTx = Object.values(activeTransactions).find((tx) =>
              tx.allCurrentItems.some((i) => i.id === itemId)
            );
            if (foundTx) {
              handleToggleItemServed(foundTx.id, itemId);
            }
          }}
        />
      )}

      {/* SALES & PB1 SUMMARY MODAL */}
      {showSalesModal && (
        <SalesSummaryModal
          settledTransactions={settledTransactions}
          onClose={() => {
            setShowSalesModal(false);
            if (activeTab === 'sales') setActiveTab('floor');
          }}
          onReprintReceipt={handleReprintReceipt}
          onOpenGoogleSheets={() => handleOpenGoogleSheets('sales')}
        />
      )}

      {/* GOOGLE SHEETS EXPORT MODAL */}
      {showSheetsModal && (
        <GoogleSheetsModal
          settledTransactions={settledTransactions}
          materials={rawMaterials}
          initialMode={sheetsModalMode}
          onClose={() => setShowSheetsModal(false)}
        />
      )}

      {/* CLAYMORPHISM RESET DEMO CONFIRMATION MODAL */}
      {showResetConfirm && (
        <div
          className="fixed inset-0 z-50 bg-slate-900/35 backdrop-blur-xs flex items-center justify-center p-4"
          onClick={() => setShowResetConfirm(false)}
        >
          <div
            className="clay-modal p-6 sm:p-7 max-w-md w-full space-y-5"
            onClick={(e) => e.stopPropagation()}
          >
            <div>
              <span className="text-xs font-extrabold uppercase tracking-wider text-amber-700 block">
                Konfirmasi Sistem
              </span>
              <h3 className="text-xl font-black text-slate-900 mt-1">
                Reset Data Operasional Demo?
              </h3>
              <p className="text-sm text-slate-600 mt-2 leading-relaxed">
                Seluruh status 36 meja, antrean pesanan aktif, stok bahan baku BOM, dan riwayat struk akan dikembalikan ke kondisi awal.
              </p>
            </div>
            <div className="flex items-center justify-end gap-3 pt-2">
              <button
                type="button"
                onClick={() => setShowResetConfirm(false)}
                className="clay-btn-neutral min-h-[48px] px-5 py-2.5 text-sm font-extrabold whitespace-nowrap cursor-pointer"
              >
                Batal
              </button>
              <button
                type="button"
                onClick={confirmResetData}
                className="clay-btn-rose min-h-[48px] px-5 py-2.5 text-sm font-extrabold whitespace-nowrap cursor-pointer"
              >
                Ya, Reset Data
              </button>
            </div>
          </div>
        </div>
      )}

      {/* NFC / PIN STAFF LOGIN MODAL */}
      {(isLocked || !currentStaff) && (
        <LoginModal
          currentStaff={currentStaff}
          onLoginSuccess={handleLoginSuccess}
          canCancel={!!currentStaff}
          onCancel={() => setIsLocked(false)}
        />
      )}
    </div>
  );
}
