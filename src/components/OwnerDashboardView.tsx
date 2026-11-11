import React from 'react';
import { Table, Transaction, RawMaterial, StaffAccount, PettyCashEntry } from '../types/pos';
import { calculateFinanceMetrics } from '../utils/authRoles';
import { formatRupiah } from '../utils/posCalculations';
import {
  Crown,
  TrendingUp,
  Store,
  Boxes,
  FileSpreadsheet,
  RefreshCw,
  Lock,
  ArrowRight,
  Flame,
  CheckCircle2,
  AlertTriangle,
} from 'lucide-react';

interface OwnerDashboardViewProps {
  currentStaff: StaffAccount;
  tables: Table[];
  transactions: Record<string, Transaction>;
  settledTransactions: Transaction[];
  rawMaterials: RawMaterial[];
  pettyCashEntries: PettyCashEntry[];
  onOpenGoogleSheets: () => void;
  onSwitchToFloorPlan: () => void;
  onSwitchToFinance: () => void;
  onRestockMaterial: (materialId: string, amount: number) => void;
  onResetData: () => void;
  onLockScreen: () => void;
}

export const OwnerDashboardView: React.FC<OwnerDashboardViewProps> = ({
  currentStaff,
  tables,
  transactions,
  settledTransactions,
  rawMaterials,
  pettyCashEntries,
  onOpenGoogleSheets,
  onSwitchToFloorPlan,
  onSwitchToFinance,
  onRestockMaterial,
  onResetData,
  onLockScreen,
}) => {
  const metrics = calculateFinanceMetrics(settledTransactions, pettyCashEntries);

  const availableTables = tables.filter((t) => t.status === 'available').length;
  const occupiedTables = tables.filter((t) => t.status === 'occupied').length;
  const lowStockMaterials = rawMaterials.filter((m) => m.currentStock <= m.minStock);
  const totalRawAssetValue = rawMaterials.reduce((acc, m) => acc + m.currentStock * m.costPerUnit, 0);

  // Active cooking items across all active tables
  const allActiveItems = Object.values(transactions).flatMap((tx) => tx.allCurrentItems);
  const cookingCount = allActiveItems.filter((i) => i.cookingStatus === 'cooking').length;
  const readyCount = allActiveItems.filter((i) => i.cookingStatus === 'ready').length;

  return (
    <div className="flex-1 min-h-0 flex flex-col overflow-hidden clay-canvas text-slate-800">
      {/* Executive Header */}
      <header className="h-[74px] clay-bar px-4 sm:px-6 flex items-center justify-between gap-3 shrink-0">
        <div className="flex items-center gap-3">
          <div className="w-11 h-11 clay-btn-amber flex items-center justify-center shrink-0">
            <Crown className="w-6 h-6 text-white stroke-[2.2]" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h2 className="text-base sm:text-lg font-black text-slate-900 leading-tight">
                Executive Cockpit &amp; Pengawasan Bisnis Restoran
              </h2>
              <span className="text-[10px] font-black px-2 py-0.5 rounded-md bg-amber-200 text-amber-900 uppercase">
                Owner Mode: {currentStaff.name}
              </span>
            </div>
            <span className="text-xs text-slate-500 font-bold hidden sm:inline">
              Visibilitas Real-time Omzet, Okupansi Meja, Efisiensi Dapur, dan Biaya HPP
            </span>
          </div>
        </div>

        {/* Action Controls */}
        <div className="flex items-center gap-2.5 shrink-0">
          <button
            type="button"
            onClick={onOpenGoogleSheets}
            className="min-h-[42px] px-3.5 py-2 text-xs font-black flex items-center gap-2 whitespace-nowrap shrink-0 cursor-pointer clay-btn-emerald text-white"
          >
            <FileSpreadsheet className="w-4 h-4 stroke-[2.2]" />
            <span className="hidden md:inline">Google Sheets</span>
          </button>

          <button
            type="button"
            onClick={onResetData}
            className="min-h-[42px] px-3 py-2 text-xs font-black flex items-center gap-1.5 whitespace-nowrap shrink-0 cursor-pointer clay-btn-neutral text-slate-700 hover:text-emerald-700"
            title="Refresh Data & Sinkronisasi API"
          >
            <RefreshCw className="w-4 h-4" />
            <span className="hidden lg:inline">Refresh Data</span>
          </button>

          <button
            type="button"
            onClick={onLockScreen}
            className="min-h-[42px] px-3.5 py-2 text-xs font-black flex items-center gap-2 whitespace-nowrap shrink-0 cursor-pointer clay-btn-neutral text-slate-700 hover:text-slate-950"
          >
            <Lock className="w-4 h-4" />
            <span className="hidden sm:inline">Kunci Layar</span>
          </button>
        </div>
      </header>

      {/* Main Content Dashboard */}
      <div className="flex-1 min-h-0 overflow-y-auto p-4 sm:p-6 space-y-5">
        {/* Quick Navigation Cards */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div
            onClick={onSwitchToFloorPlan}
            className="clay-card p-5 flex items-center justify-between cursor-pointer hover:scale-[1.01] transition-transform group"
          >
            <div className="flex items-center gap-3.5">
              <div className="w-12 h-12 rounded-2xl clay-btn-emerald flex items-center justify-center text-white shrink-0">
                <Store className="w-6 h-6 stroke-[2.2]" />
              </div>
              <div>
                <h3 className="text-sm font-black text-slate-900 group-hover:text-emerald-800 transition-colors">
                  Buka Floor Plan Kasir &amp; Pemesanan Meja
                </h3>
                <p className="text-xs text-slate-500 mt-0.5">
                  Pantau 36 meja terisi ({occupiedTables} meja terisi, {availableTables} meja kosong)
                </p>
              </div>
            </div>
            <div className="w-9 h-9 clay-btn-neutral flex items-center justify-center text-slate-700 shrink-0">
              <ArrowRight className="w-4 h-4" />
            </div>
          </div>

          <div
            onClick={onSwitchToFinance}
            className="clay-card p-5 flex items-center justify-between cursor-pointer hover:scale-[1.01] transition-transform group"
          >
            <div className="flex items-center gap-3.5">
              <div className="w-12 h-12 rounded-2xl clay-btn-indigo flex items-center justify-center text-white shrink-0">
                <TrendingUp className="w-6 h-6 stroke-[2.2]" />
              </div>
              <div>
                <h3 className="text-sm font-black text-slate-900 group-hover:text-indigo-800 transition-colors">
                  Buka Pembukuan Keuangan &amp; Pajak PB1
                </h3>
                <p className="text-xs text-slate-500 mt-0.5">
                  Laba bersih operasional {formatRupiah(metrics.netOperatingProfit)} · Kas laci {formatRupiah(metrics.cashInDrawer)}
                </p>
              </div>
            </div>
            <div className="w-9 h-9 clay-btn-neutral flex items-center justify-center text-slate-700 shrink-0">
              <ArrowRight className="w-4 h-4" />
            </div>
          </div>
        </div>

        {/* 4 Pillars of Operations */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3.5">
          <div className="clay-tint-emerald p-4 rounded-2xl">
            <span className="text-[11px] font-black uppercase tracking-wider text-emerald-900 block">
              Gross Omzet Hari Ini
            </span>
            <div className="text-xl sm:text-2xl font-black text-emerald-950 font-mono tabular-nums mt-1">
              {formatRupiah(metrics.totalOmzetKotor)}
            </div>
            <span className="text-xs font-bold text-emerald-800 mt-0.5 block">
              {metrics.totalTransactions} Meja Ditutup
            </span>
          </div>

          <div className="clay-card p-4 rounded-2xl">
            <span className="text-[11px] font-black uppercase tracking-wider text-slate-500 block">
              Estimasi Laba Operasional
            </span>
            <div className="text-xl sm:text-2xl font-black text-emerald-700 font-mono tabular-nums mt-1">
              {formatRupiah(metrics.netOperatingProfit)}
            </div>
            <span className="text-xs font-bold text-slate-500 mt-0.5 block">
              Margin Bersih ~{metrics.totalSubtotal > 0 ? Math.round((metrics.netOperatingProfit / metrics.totalSubtotal) * 100) : 0}%
            </span>
          </div>

          <div className="clay-card p-4 rounded-2xl">
            <span className="text-[11px] font-black uppercase tracking-wider text-slate-500 block">
              Okupansi Meja Resto
            </span>
            <div className="text-xl sm:text-2xl font-black text-slate-900 font-mono tabular-nums mt-1">
              {occupiedTables} / {tables.length}
            </div>
            <span className="text-xs font-bold text-emerald-700 mt-0.5 block">
              {availableTables} Meja Siap Tampung Tamu
            </span>
          </div>

          <div className="clay-card p-4 rounded-2xl">
            <span className="text-[11px] font-black uppercase tracking-wider text-slate-500 block">
              Total Aset Bahan Baku (BOM)
            </span>
            <div className="text-xl sm:text-2xl font-black text-indigo-800 font-mono tabular-nums mt-1">
              {formatRupiah(totalRawAssetValue)}
            </div>
            <span className="text-xs font-bold text-slate-500 mt-0.5 block">
              {rawMaterials.length} Komponen Resep
            </span>
          </div>
        </div>

        {/* Critical BOM Stocks & Kitchen Operations */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          {/* Critical Stocks Panel */}
          <div className="clay-panel p-5 space-y-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Boxes className="w-5 h-5 text-indigo-600" />
                <h3 className="text-sm font-black text-slate-900">
                  Status Bahan Baku Kritis (Batas ROP)
                </h3>
              </div>
              <span
                className={`text-xs font-mono font-bold px-2 py-0.5 rounded-md ${
                  lowStockMaterials.length > 0
                    ? 'bg-rose-100 text-rose-800'
                    : 'bg-emerald-100 text-emerald-800'
                }`}
              >
                {lowStockMaterials.length} Bahan Menipis
              </span>
            </div>

            {lowStockMaterials.length === 0 ? (
              <div className="p-6 text-center text-slate-500 bg-white/60 rounded-xl">
                <CheckCircle2 className="w-8 h-8 text-emerald-600 mx-auto mb-1.5" />
                <p className="text-xs font-bold text-slate-700">Semua Stok Bahan Baku Dalam Batas Aman</p>
                <p className="text-[11px] text-slate-500 mt-0.5">Pemotongan resep otomatis FEFO berjalan normal.</p>
              </div>
            ) : (
              <div className="space-y-2">
                {lowStockMaterials.map((mat) => (
                  <div
                    key={mat.id}
                    className="p-3 bg-white/80 rounded-xl border border-rose-200/80 flex items-center justify-between gap-3"
                  >
                    <div>
                      <div className="flex items-center gap-1.5">
                        <AlertTriangle className="w-4 h-4 text-rose-600 shrink-0" />
                        <span className="text-xs font-black text-slate-900">{mat.name}</span>
                      </div>
                      <span className="text-[11px] text-slate-500 font-mono">
                        Sisa: <b className="text-rose-700">{mat.currentStock} {mat.unit}</b> (Min: {mat.minStock} {mat.unit})
                      </span>
                    </div>

                    <div className="flex items-center gap-1.5 shrink-0">
                      <button
                        type="button"
                        onClick={() => onRestockMaterial(mat.id, 5)}
                        className="clay-btn-neutral min-h-[34px] px-2.5 text-xs font-mono font-black cursor-pointer"
                      >
                        +5
                      </button>
                      <button
                        type="button"
                        onClick={() => onRestockMaterial(mat.id, 10)}
                        className="clay-btn-emerald min-h-[34px] px-2.5 text-xs font-mono font-black cursor-pointer text-white"
                      >
                        +10
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Real-time Kitchen & Bar Queue Panel */}
          <div className="clay-panel p-5 space-y-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Flame className="w-5 h-5 text-amber-600" />
                <h3 className="text-sm font-black text-slate-900">
                  Antrean Produksi Dapur &amp; Barista (KDS)
                </h3>
              </div>
              <span className="text-xs font-mono font-bold bg-amber-100 text-amber-900 px-2 py-0.5 rounded-md">
                {cookingCount + readyCount} Menu Dalam Proses
              </span>
            </div>

            <div className="grid grid-cols-2 gap-3 pt-1">
              <div className="clay-card p-4 space-y-1">
                <span className="text-[11px] font-black uppercase text-amber-700 block">
                  Sedang Dimasak / Racik
                </span>
                <span className="text-2xl font-black font-mono text-slate-900 block">
                  {cookingCount} Item
                </span>
                <span className="text-[11px] text-slate-500">KDS Dapur &amp; Barista</span>
              </div>

              <div className="clay-card p-4 space-y-1">
                <span className="text-[11px] font-black uppercase text-emerald-700 block">
                  Siap Diantar Waiter
                </span>
                <span className="text-2xl font-black font-mono text-emerald-700 block">
                  {readyCount} Item
                </span>
                <span className="text-[11px] text-slate-500">Di Station Checker</span>
              </div>
            </div>

            <p className="text-xs text-slate-500 leading-relaxed bg-white/60 p-3 rounded-xl">
              Alur pesanan terhubung langsung dari Kasir ke KDS Dapur, Checker, dan otomatis memotong kartu stok bahan baku BOM saat pesanan dibuat.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
};
