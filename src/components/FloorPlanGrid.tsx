import React, { useState } from 'react';
import { Table, Transaction } from '../types/pos';
import { formatRupiah } from '../utils/posCalculations';
import {
  Clock,
  PlusCircle,
  Search,
  Filter,
  CheckSquare,
  CreditCard,
  X,
  Receipt,
  CheckCircle2,
} from 'lucide-react';

interface FloorPlanGridProps {
  tables: Table[];
  transactions: Record<string, Transaction>;
  onSelectTable: (table: Table) => void;
  onOpenOrder: (table: Table) => void;
  onOpenPayment: (table: Table) => void;
  onOpenChecker: (table: Table) => void;
  onClearPaidTable: (table: Table) => void;
  onReprintPaidReceipt: (table: Table) => void;
}

export const FloorPlanGrid: React.FC<FloorPlanGridProps> = ({
  tables,
  transactions,
  onSelectTable,
  onOpenOrder,
  onOpenPayment,
  onOpenChecker,
  onClearPaidTable,
  onReprintPaidReceipt,
}) => {
  const [selectedArea, setSelectedArea] = useState<'all' | 'indoor' | 'outdoor' | 'vip'>('all');
  const [statusFilter, setStatusFilter] = useState<'all' | 'available' | 'occupied' | 'reserved'>('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [activeTableAction, setActiveTableAction] = useState<Table | null>(null);

  const filteredTables = tables.filter((table) => {
    if (selectedArea !== 'all' && table.area !== selectedArea) return false;
    if (statusFilter !== 'all' && table.status !== statusFilter) return false;
    if (searchQuery.trim() !== '') {
      const q = searchQuery.toLowerCase();
      return (
        table.tableNumber.toLowerCase().includes(q) ||
        table.area.toLowerCase().includes(q)
      );
    }
    return true;
  });

  const getElapsedTime = (openedAt?: string) => {
    if (!openedAt) return '';
    const diffMs = Date.now() - new Date(openedAt).getTime();
    const diffMins = Math.floor(diffMs / 60000);
    if (diffMins < 60) return `${diffMins}m`;
    const hours = Math.floor(diffMins / 60);
    const mins = diffMins % 60;
    return `${hours}j ${mins}m`;
  };

  const handleTableClick = (table: Table) => {
    onSelectTable(table);
    if (table.status === 'available' || table.status === 'reserved') {
      onOpenOrder(table);
    } else {
      setActiveTableAction(table);
    }
  };

  return (
    <div className="flex-1 min-h-0 w-full flex flex-col p-3.5 sm:p-5 gap-4 overflow-hidden clay-canvas">
      {/* Top Filter & Area Clay Panel - Spacious Touch Controls */}
      <div className="flex flex-wrap items-center justify-between gap-3 px-4 py-3 clay-panel flex-shrink-0">
        {/* Area Filter Buttons */}
        <div className="flex items-center gap-2.5 flex-wrap">
          <span className="text-xs font-extrabold text-slate-600 uppercase tracking-wider flex items-center gap-1.5 mr-1">
            <Filter className="w-4 h-4 text-emerald-700" />
            <span>Zona Meja</span>
          </span>
          <button
            type="button"
            onClick={() => setSelectedArea('all')}
            className={`min-h-[46px] px-4 py-2.5 text-xs sm:text-sm font-extrabold whitespace-nowrap shrink-0 cursor-pointer ${
              selectedArea === 'all' ? 'clay-btn-dark' : 'clay-btn-neutral'
            }`}
          >
            Semua ({tables.length})
          </button>
          <button
            type="button"
            onClick={() => setSelectedArea('indoor')}
            className={`min-h-[46px] px-4 py-2.5 text-xs sm:text-sm font-extrabold whitespace-nowrap shrink-0 cursor-pointer ${
              selectedArea === 'indoor' ? 'clay-btn-emerald' : 'clay-btn-neutral'
            }`}
          >
            Indoor (18)
          </button>
          <button
            type="button"
            onClick={() => setSelectedArea('outdoor')}
            className={`min-h-[46px] px-4 py-2.5 text-xs sm:text-sm font-extrabold whitespace-nowrap shrink-0 cursor-pointer ${
              selectedArea === 'outdoor' ? 'clay-btn-emerald' : 'clay-btn-neutral'
            }`}
          >
            Outdoor (12)
          </button>
          <button
            type="button"
            onClick={() => setSelectedArea('vip')}
            className={`min-h-[46px] px-4 py-2.5 text-xs sm:text-sm font-extrabold whitespace-nowrap shrink-0 cursor-pointer ${
              selectedArea === 'vip' ? 'clay-btn-emerald' : 'clay-btn-neutral'
            }`}
          >
            VIP (6)
          </button>
        </div>

        {/* Status Segmented Well & Search Input */}
        <div className="flex items-center gap-3 flex-wrap">
          <div className="flex items-center gap-1.5 clay-well p-1.5 text-xs sm:text-sm">
            <button
              type="button"
              onClick={() => setStatusFilter('all')}
              className={`min-h-[42px] px-4 py-2 rounded-xl font-extrabold whitespace-nowrap cursor-pointer transition-all ${
                statusFilter === 'all'
                  ? 'clay-btn-neutral text-slate-900'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              Semua
            </button>
            <button
              type="button"
              onClick={() => setStatusFilter('available')}
              className={`min-h-[42px] px-4 py-2 rounded-xl font-extrabold whitespace-nowrap cursor-pointer transition-all ${
                statusFilter === 'available'
                  ? 'clay-btn-emerald'
                  : 'text-slate-700 hover:text-emerald-800'
              }`}
            >
              Kosong
            </button>
            <button
              type="button"
              onClick={() => setStatusFilter('occupied')}
              className={`min-h-[42px] px-4 py-2 rounded-xl font-extrabold whitespace-nowrap cursor-pointer transition-all ${
                statusFilter === 'occupied'
                  ? 'clay-btn-rose'
                  : 'text-slate-700 hover:text-rose-800'
              }`}
            >
              Terisi
            </button>
          </div>

          <div className="relative">
            <Search className="w-4 h-4 text-slate-500 absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none" />
            <input
              type="text"
              placeholder="Cari nomor meja..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="clay-input min-h-[46px] text-sm font-semibold pl-10 pr-4 py-2.5 w-36 sm:w-48 focus:w-56 transition-all"
            />
          </div>
        </div>
      </div>

      {/* 36-Table Spacious Touchscreen Claymorphism Matrix */}
      <div className="flex-1 min-h-0 overflow-y-auto px-1 py-1 grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-3.5 sm:gap-4 content-start">
        {filteredTables.map((table) => {
          const isOccupied = table.status === 'occupied' || table.status === 'billing';
          const isReserved = table.status === 'reserved';
          const currentTx = table.currentTransactionId
            ? transactions[table.currentTransactionId]
            : null;

          const servedCount = currentTx
            ? currentTx.allCurrentItems.filter((i) => i.isServed).length
            : 0;
          const totalItemsCount = currentTx ? currentTx.allCurrentItems.length : 0;
          const isFullyServed = totalItemsCount > 0 && servedCount === totalItemsCount;

          return (
            <button
              key={table.id}
              type="button"
              onClick={() => handleTableClick(table)}
              className={`min-h-[154px] sm:min-h-[168px] p-4 sm:p-4.5 flex flex-col justify-between text-left cursor-pointer select-none ${
                isOccupied ? 'clay-table-occupied' : isReserved ? 'clay-table-occupied ring-2 ring-amber-300' : 'clay-table-available'
              }`}
            >
              {/* Top Row: Large Table Number & Status Indicator */}
              <div className="flex items-start justify-between w-full gap-2">
                <div>
                  <span
                    className={`text-[11px] font-extrabold uppercase tracking-wider block ${
                      isOccupied ? 'text-rose-100' : 'text-emerald-100'
                    }`}
                  >
                    MEJA
                  </span>
                  <span className="text-3xl sm:text-4xl font-black leading-none font-mono tabular-nums text-white drop-shadow-2xs">
                    {table.tableNumber}
                  </span>
                </div>

                <div className="flex flex-col items-end gap-1">
                  <span
                    className={`px-2.5 py-1 rounded-xl text-[10px] font-black uppercase tracking-wider whitespace-nowrap ${
                      isOccupied && currentTx?.isPaid
                        ? 'bg-emerald-950/65 text-emerald-100 border border-emerald-200/40'
                        : 'bg-black/22 text-white'
                    }`}
                  >
                    {isOccupied ? (currentTx?.isPaid ? 'TERISI • LUNAS' : 'TERISI') : isReserved ? 'RESERVED' : 'KOSONG'}
                  </span>
                  <span
                    className={`text-xs font-extrabold font-mono tabular-nums ${
                      isOccupied ? 'text-rose-100' : 'text-emerald-100'
                    }`}
                  >
                    {table.capacity} Kursi
                  </span>
                </div>
              </div>

              {/* Middle Row: Occupied Details or Large Open Table Touch Area */}
              {isOccupied ? (
                <div className="my-2 space-y-1 w-full">
                  <div className="flex items-center justify-between text-xs font-bold text-rose-50 font-mono tabular-nums">
                    <span className="flex items-center gap-1">
                      <Clock className="w-3.5 h-3.5 text-rose-100" />
                      <span>{getElapsedTime(table.openedAt)}</span>
                    </span>
                    <span className="text-xs font-sans font-extrabold">
                      {table.guestCount} Tamu
                    </span>
                  </div>

                  {currentTx && (
                    <div className="text-base sm:text-lg font-black text-white font-mono tabular-nums tracking-tight truncate">
                      {formatRupiah(currentTx.totalAmount)}
                    </div>
                  )}
                </div>
              ) : (
                <div className="my-2 w-full">
                  <span className="w-full py-2 px-3 rounded-xl bg-white/18 text-white text-xs sm:text-sm font-extrabold flex items-center justify-center gap-1.5 whitespace-nowrap shadow-inner">
                    <PlusCircle className="w-4 h-4 shrink-0" />
                    <span>Buka Meja</span>
                  </span>
                </div>
              )}

              {/* Bottom Metadata Row */}
              <div className="w-full pt-2 border-t border-white/22 flex items-center justify-between text-xs text-white/95">
                <span className="capitalize font-bold">{table.area}</span>
                {isOccupied ? (
                  <span className="font-extrabold font-mono tabular-nums">
                    {isFullyServed ? 'Tersaji OK' : `${servedCount}/${totalItemsCount} Menu`}
                  </span>
                ) : (
                  <span className="font-extrabold text-emerald-50">Siap Pakai</span>
                )}
              </div>
            </button>
          );
        })}
      </div>

      {/* QUICK TABLE ACTION CLAY MODAL - Large Touch Panels */}
      {activeTableAction && (() => {
        const activeTx = activeTableAction.currentTransactionId
          ? transactions[activeTableAction.currentTransactionId]
          : null;
        const isPaidUpfront = !!activeTx?.isPaid;

        return (
          <div
            className="fixed inset-0 z-50 bg-slate-900/40 backdrop-blur-xs flex items-center justify-center p-4"
            onClick={() => setActiveTableAction(null)}
          >
            <div
              className="clay-modal p-6 sm:p-7 max-w-lg w-full relative"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="flex items-center justify-between mb-5 pb-4 border-b border-slate-200/80">
                <div>
                  <span
                    className={`text-xs uppercase tracking-wider font-extrabold block ${
                      isPaidUpfront ? 'text-emerald-700' : 'text-rose-700'
                    }`}
                  >
                    {isPaidUpfront
                      ? 'Meja Lunas (Payment First) • Sedang Disajikan'
                      : 'Pilih Aksi Operasional'}
                  </span>
                  <h3 className="text-2xl sm:text-3xl font-black text-slate-900 font-mono tabular-nums mt-0.5">
                    MEJA {activeTableAction.tableNumber}
                  </h3>
                </div>
                <button
                  type="button"
                  onClick={() => setActiveTableAction(null)}
                  className="min-w-[48px] min-h-[48px] flex items-center justify-center clay-btn-neutral cursor-pointer"
                  aria-label="Tutup Menu Meja"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>

              <div className="space-y-3">
                <button
                  type="button"
                  onClick={() => {
                    const tbl = activeTableAction;
                    setActiveTableAction(null);
                    onOpenOrder(tbl);
                  }}
                  className="w-full min-h-[78px] flex items-center gap-4 p-4 clay-tint-emerald hover:brightness-98 active:scale-98 transition-all text-left cursor-pointer"
                >
                  <div className="w-12 h-12 clay-btn-emerald flex items-center justify-center flex-shrink-0">
                    <PlusCircle className="w-6 h-6 text-white" />
                  </div>
                  <div>
                    <div className="text-base font-black text-emerald-950">
                      Tambah Pesanan (Add-Order)
                    </div>
                    <div className="text-xs sm:text-sm font-semibold text-emerald-900 mt-0.5">
                      Input menu susulan & auto-routing cetak ke dapur/bar
                    </div>
                  </div>
                </button>

                <button
                  type="button"
                  onClick={() => {
                    const tbl = activeTableAction;
                    setActiveTableAction(null);
                    onOpenChecker(tbl);
                  }}
                  className="w-full min-h-[78px] flex items-center gap-4 p-4 clay-tint-amber hover:brightness-98 active:scale-98 transition-all text-left cursor-pointer"
                >
                  <div className="w-12 h-12 clay-btn-amber flex items-center justify-center flex-shrink-0">
                    <CheckSquare className="w-6 h-6 text-white" />
                  </div>
                  <div>
                    <div className="text-base font-black text-amber-950">
                      Checker Waiter (Pencontrengan)
                    </div>
                    <div className="text-xs sm:text-sm font-semibold text-amber-900 mt-0.5">
                      Centang menu yang telah diantar ke meja pelanggan
                    </div>
                  </div>
                </button>

                {isPaidUpfront ? (
                  <>
                    <button
                      type="button"
                      onClick={() => {
                        const tbl = activeTableAction;
                        setActiveTableAction(null);
                        onReprintPaidReceipt(tbl);
                      }}
                      className="w-full min-h-[74px] flex items-center gap-4 p-4 clay-tint-indigo hover:brightness-98 active:scale-98 transition-all text-left cursor-pointer"
                    >
                      <div className="w-12 h-12 clay-btn-indigo flex items-center justify-center flex-shrink-0">
                        <Receipt className="w-6 h-6 text-white" />
                      </div>
                      <div>
                        <div className="text-base font-black text-indigo-950">
                          Cetak Ulang Struk Pembayaran (Lunas)
                        </div>
                        <div className="text-xs sm:text-sm font-semibold text-indigo-900 mt-0.5">
                          Lihat & cetak kembali bukti lunas Payment First pelanggan
                        </div>
                      </div>
                    </button>

                    <button
                      type="button"
                      onClick={() => {
                        const tbl = activeTableAction;
                        setActiveTableAction(null);
                        onClearPaidTable(tbl);
                      }}
                      className="w-full min-h-[78px] flex items-center gap-4 p-4 clay-btn-emerald text-left cursor-pointer"
                    >
                      <div className="w-12 h-12 rounded-xl bg-white/20 flex items-center justify-center flex-shrink-0">
                        <CheckCircle2 className="w-6 h-6 text-white" />
                      </div>
                      <div>
                        <div className="text-base font-black text-white">
                          Selesai Makan & Kosongkan Meja
                        </div>
                        <div className="text-xs sm:text-sm font-semibold text-emerald-50 mt-0.5">
                          Tagihan sudah LUNAS — kembalikan meja menjadi HIJAU KOSONG
                        </div>
                      </div>
                    </button>
                  </>
                ) : (
                  <button
                    type="button"
                    onClick={() => {
                      const tbl = activeTableAction;
                      setActiveTableAction(null);
                      onOpenPayment(tbl);
                    }}
                    className="w-full min-h-[82px] flex items-center gap-4 p-4 sm:p-5 clay-tint-rose hover:brightness-98 active:scale-98 transition-all text-left cursor-pointer"
                  >
                    <div className="w-13 h-13 clay-btn-rose flex items-center justify-center flex-shrink-0">
                      <CreditCard className="w-6 h-6 text-white" />
                    </div>
                    <div>
                      <div className="text-base font-black text-rose-950">
                        Pembayaran & Tutup Meja
                      </div>
                      <div className="text-xs sm:text-sm font-semibold text-rose-900 mt-0.5">
                        Hitung PB1 10%, cetak struk sah customer & buka meja
                      </div>
                    </div>
                  </button>
                )}
              </div>
            </div>
          </div>
        );
      })()}
    </div>
  );
};
