/**
 * Waiter/checker UI for tracking dishes from KDS handoff through table service.
 *
 * Lists occupied tables, shows per-item kitchen/handoff/served status, and sends
 * serving confirmations through parent callbacks. The parent owns transaction
 * updates; isItemWaitingForWaiter supplies the shared domain predicate.
 *
 * Keep this component focused on waiter workflow and display. Printing, KDS
 * transitions, and durable transaction persistence remain outside this UI layer.
 */
import React, { useState } from 'react';
import { Table, Transaction, OrderItem } from '../types/pos';
import { isItemWaitingForWaiter } from '../utils/posCalculations';
import {
  Check,
  X,
  ChefHat,
  Wine,
  CheckCircle2,
  Printer,
  Users,
  ArrowLeft,
  Flame,
} from 'lucide-react';
import { sounds } from '../utils/soundEffects';

interface WaiterCheckerModalProps {
  tables: Table[];
  transactions: Record<string, Transaction>;
  initialTableId?: string;
  onClose: () => void;
  onToggleItemServed: (transactionId: string, itemId: string) => void;
  onMarkAllServed: (transactionId: string) => void;
  onMarkHandedOffServed?: (transactionId: string) => void;
  onOpenKds?: () => void;
  onViewSlip: (table: Table) => void;
}

export const WaiterCheckerModal: React.FC<WaiterCheckerModalProps> = ({
  tables,
  transactions,
  initialTableId,
  onClose,
  onToggleItemServed,
  onMarkAllServed,
  onMarkHandedOffServed,
  onOpenKds,
  onViewSlip,
}) => {
  const occupiedTables = tables.filter((t) => t.status === 'occupied');
  const firstTableWithPickup = occupiedTables.find((t) => {
    const tx = t.currentTransactionId ? transactions[t.currentTransactionId] : null;
    return tx?.allCurrentItems.some(isItemWaitingForWaiter);
  });

  const [selectedTableId, setSelectedTableId] = useState<string>(
    initialTableId || firstTableWithPickup?.id || occupiedTables[0]?.id || ''
  );

  const selectedTable = tables.find((t) => t.id === selectedTableId);
  const activeTx = selectedTable?.currentTransactionId
    ? transactions[selectedTable.currentTransactionId]
    : null;

  const items = activeTx?.allCurrentItems || [];
  const servedCount = items.filter((i) => i.isServed).length;
  const waitingPickupCount = items.filter(isItemWaitingForWaiter).length;
  const totalCount = items.length;
  const isAllServed = totalCount > 0 && servedCount === totalCount;
  const progressPercent = totalCount > 0 ? Math.round((servedCount / totalCount) * 100) : 0;

  const handleToggle = (itemId: string) => {
    if (!activeTx) return;
    sounds.playTapSound();
    onToggleItemServed(activeTx.id, itemId);
  };

  const handleCompleteAll = () => {
    if (!activeTx) return;
    sounds.playBellSound();
    onMarkAllServed(activeTx.id);
  };

  const handleServeHandedOff = () => {
    if (!activeTx || !onMarkHandedOffServed) return;
    sounds.playBellSound();
    onMarkHandedOffServed(activeTx.id);
  };

  const getKitchenStatusLabel = (item: OrderItem) => {
    if (item.isServed) {
      return {
        text: 'Sudah Tersaji di Meja',
        tone: 'text-[#059669]',
      };
    }
    if (item.cookingStatus === 'handed_off') {
      return {
        text: 'SIAP DIANTAR (Dioper KDS)',
        tone: 'text-[#047857] font-bold',
      };
    }
    if (item.cookingStatus === 'ready') {
      return {
        text: 'Matang (Belum Dioper KDS)',
        tone: 'text-[#b45309] font-semibold',
      };
    }
    if (item.cookingStatus === 'cooking') {
      return {
        text: 'Sedang Dimasak di KDS',
        tone: 'text-[#b51f63] font-semibold',
      };
    }
    return {
      text: 'Antrean Dapur / Bar',
      tone: 'text-[#64748b]',
    };
  };

  return (
    <div className="fixed inset-0 z-50 clay-canvas text-slate-800 flex flex-col w-screen h-screen overflow-hidden select-none">
      {/* Claymorphism Header Bar */}
      <header className="h-20 clay-bar px-4 sm:px-6 flex items-center justify-between flex-shrink-0 gap-3">
        <div className="flex items-center gap-3.5">
          <div className="w-12 h-12 clay-btn-emerald flex items-center justify-center shrink-0">
            <CheckCircle2 className="w-6 h-6 text-white" />
          </div>
          <div>
            <h3 className="text-base sm:text-lg font-extrabold text-slate-900">
              Checker Waiter (Pencontrengan &amp; Operan KDS)
            </h3>
            <span className="text-xs font-bold uppercase tracking-wider text-emerald-800 hidden sm:inline">
              Verifikasi Sajian Meja · Sinkron Otomatis dengan Dapur &amp; Bar
            </span>
          </div>
        </div>

        <div className="flex items-center gap-2.5">
          {onOpenKds && (
            <button
              type="button"
              onClick={onOpenKds}
              className="min-h-[44px] px-4 py-2 clay-btn-neutral text-xs sm:text-sm font-extrabold flex items-center gap-2 whitespace-nowrap shrink-0 cursor-pointer"
            >
              <Flame className="w-4 h-4 text-amber-600 shrink-0" />
              <span>Kembali ke KDS Dapur</span>
            </button>
          )}

          <button
            type="button"
            onClick={onClose}
            className="min-w-[46px] min-h-[46px] clay-btn-neutral flex items-center justify-center text-slate-700 hover:text-slate-950 cursor-pointer shrink-0"
            aria-label="Tutup Checker"
          >
            <X className="w-5 h-5" />
          </button>
        </div>
      </header>

      {/* Sub-Header Bar: Back Button + Occupied Tables Selector */}
      <div className="px-4 sm:px-6 pt-4 flex-shrink-0">
        <div className="clay-panel px-4 py-3 flex items-center gap-2.5 overflow-x-auto no-scrollbar">
          <button
            type="button"
            onClick={onClose}
            className="clay-btn-neutral min-h-[42px] px-4 py-2 text-xs font-extrabold flex items-center gap-1.5 whitespace-nowrap shrink-0 cursor-pointer"
          >
            <ArrowLeft className="w-4 h-4" />
            <span>Floor Plan</span>
          </button>

          <div className="h-6 w-px bg-slate-200 mx-1 shrink-0" />

          {occupiedTables.length === 0 ? (
            <span className="text-xs font-semibold text-slate-600">Tidak ada meja terisi saat ini.</span>
          ) : (
            occupiedTables.map((tbl) => {
              const tx = tbl.currentTransactionId ? transactions[tbl.currentTransactionId] : null;
              const sCount = tx ? tx.allCurrentItems.filter((i) => i.isServed).length : 0;
              const pickupCount = tx ? tx.allCurrentItems.filter(isItemWaitingForWaiter).length : 0;
              const tCount = tx ? tx.allCurrentItems.length : 0;
              const isDone = tCount > 0 && sCount === tCount;
              const isSelected = tbl.id === selectedTableId;

              return (
                <button
                  key={tbl.id}
                  type="button"
                  onClick={() => setSelectedTableId(tbl.id)}
                  className={`min-h-[42px] px-4 py-2 text-xs font-extrabold flex items-center gap-2 whitespace-nowrap shrink-0 cursor-pointer ${
                    isSelected
                      ? 'clay-btn-dark text-white'
                      : pickupCount > 0
                      ? 'clay-tint-emerald text-emerald-900'
                      : 'clay-btn-neutral text-slate-800'
                  }`}
                >
                  <span className="font-mono tabular-nums font-extrabold">Meja #{tbl.tableNumber}</span>
                  {pickupCount > 0 ? (
                    <span
                      className={`font-mono tabular-nums text-[11px] font-extrabold ${
                        isSelected ? 'text-emerald-300' : 'text-emerald-700'
                      }`}
                    >
                      · {pickupCount} Siap Antar!
                    </span>
                  ) : (
                    <span
                      className={`font-mono tabular-nums text-[11px] font-bold ${
                        isSelected
                          ? 'text-white/85'
                          : isDone
                          ? 'text-emerald-700'
                          : 'text-rose-700'
                      }`}
                    >
                      ({isDone ? 'Lengkap' : `${sCount}/${tCount}`})
                    </span>
                  )}
                </button>
              );
            })
          )}
        </div>
      </div>

      {/* Main Content */}
      <div className="flex-1 min-h-0 p-4 sm:p-6 flex flex-col overflow-hidden">
        {selectedTable && activeTx ? (
          <div className="flex-1 min-h-0 clay-panel flex flex-col overflow-hidden">
            {/* Table Summary Strip */}
            <div className="px-6 py-4 bg-white/80 border-b border-slate-200/85 flex flex-col md:flex-row md:items-center justify-between gap-4 flex-shrink-0">
              <div>
                <div className="flex items-center gap-3 flex-wrap">
                  <span className="text-xl font-black text-slate-900 font-mono tabular-nums">
                    Meja #{selectedTable.tableNumber}
                  </span>
                  <span className="text-xs font-bold capitalize text-slate-600">
                    Zona {selectedTable.area}
                  </span>
                  <span aria-hidden="true" className="text-slate-300">·</span>
                  <span className="text-xs text-slate-800 flex items-center gap-1 font-extrabold">
                    <Users className="w-3.5 h-3.5 text-slate-500" />
                    <span>{selectedTable.guestCount || 2} Tamu</span>
                  </span>
                  <span aria-hidden="true" className="text-slate-300">·</span>
                  <span className="text-xs font-semibold text-slate-600">
                    Waiter: <strong className="text-slate-900 font-extrabold">{activeTx.waiterName}</strong>
                  </span>
                  {waitingPickupCount > 0 && (
                    <>
                      <span aria-hidden="true" className="text-slate-300">·</span>
                      <span className="text-xs font-extrabold text-emerald-700">
                        {waitingPickupCount} Menu Siap Diantar dari Dapur/Bar!
                      </span>
                    </>
                  )}
                </div>
                <p className="text-xs text-slate-500 mt-1 font-mono tabular-nums font-semibold">
                  Bill ID: {activeTx.id}
                </p>
              </div>

              <div className="w-full md:w-76 space-y-2">
                <div className="flex justify-between items-center text-xs">
                  <span className="font-extrabold text-slate-600">Progres Sajian:</span>
                  <span
                    className={`font-extrabold font-mono tabular-nums ${
                      isAllServed ? 'text-emerald-700' : 'text-slate-900'
                    }`}
                  >
                    {servedCount}/{totalCount} Menu ({progressPercent}%)
                  </span>
                </div>
                <progress
                  value={progressPercent}
                  max={100}
                  className={`clay-progress ${isAllServed ? 'clay-progress-complete' : ''}`}
                />
              </div>
            </div>

            {/* Checklist Table */}
            <div className="flex-1 min-h-0 overflow-y-auto bg-white/50">
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="border-b border-slate-200 text-[11px] font-extrabold uppercase tracking-wider text-slate-500 bg-slate-50/90 sticky top-0 z-10">
                    <th className="py-3.5 pl-6 pr-3 w-16">CEK</th>
                    <th className="py-3.5 px-3">STASIUN</th>
                    <th className="py-3.5 px-3">QTY &amp; MENU</th>
                    <th className="py-3.5 px-3">STATUS DAPUR / BAR</th>
                    <th className="py-3.5 px-3 hidden sm:table-cell">BATCH</th>
                    <th className="py-3.5 pl-3 pr-6 text-right">AKSI WAITER</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-200/70 text-sm">
                  {items.map((item, index) => {
                    const isFood = item.destination === 'kitchen';
                    const isWaitingPickup = isItemWaitingForWaiter(item);
                    const kitchenState = getKitchenStatusLabel(item);

                    return (
                      <tr
                        key={item.id || index}
                        onClick={() => handleToggle(item.id)}
                        className={`cursor-pointer transition-colors ${
                          item.isServed
                            ? 'bg-slate-50/80'
                            : isWaitingPickup
                            ? 'bg-emerald-50/75 hover:bg-emerald-100/60'
                            : 'bg-white hover:bg-slate-50'
                        }`}
                      >
                        <td className="py-4 pl-6 pr-3">
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              handleToggle(item.id);
                            }}
                            aria-label={`Contreng ${item.name}`}
                            className={`w-10 h-10 flex items-center justify-center cursor-pointer ${
                              item.isServed
                                ? 'clay-btn-emerald'
                                : 'clay-btn-neutral'
                            }`}
                          >
                            {item.isServed && <Check className="w-5 h-5 stroke-[3] text-white" />}
                          </button>
                        </td>

                        <td className="py-4 px-3 whitespace-nowrap">
                          <span className="text-xs font-extrabold uppercase tracking-wider text-slate-600 inline-flex items-center gap-1.5">
                            {isFood ? (
                              <ChefHat className="w-4 h-4 text-amber-600" />
                            ) : (
                              <Wine className="w-4 h-4 text-sky-600" />
                            )}
                            <span>{isFood ? 'Dapur' : 'Bar'}</span>
                          </span>
                        </td>

                        <td className="py-4 px-3">
                          <div
                            className={`font-extrabold ${
                              item.isServed ? 'line-through text-slate-500' : 'text-slate-900'
                            }`}
                          >
                            <span className="font-mono tabular-nums mr-1.5">{item.quantity}x</span>
                            {item.name}
                          </div>
                          {item.selectedModifiers && item.selectedModifiers.length > 0 && (
                            <div className="text-xs text-slate-600 font-medium mt-0.5">
                              {item.selectedModifiers.map((m) => m.optionName).join(' · ')}
                            </div>
                          )}
                          {item.notes && (
                            <div className="text-xs font-bold text-rose-700 mt-0.5">
                              Catatan: {item.notes}
                            </div>
                          )}
                        </td>

                        <td className="py-4 px-3 text-xs whitespace-nowrap">
                          <span className={kitchenState.tone}>{kitchenState.text}</span>
                        </td>

                        <td className="py-4 px-3 font-mono tabular-nums text-xs font-semibold text-slate-500 hidden sm:table-cell">
                          Batch #{item.batchNumber}
                        </td>

                        <td className="py-4 pl-3 pr-6 text-right">
                          <span
                            className={`min-h-[40px] px-4 py-2 text-xs font-extrabold uppercase tracking-wider inline-flex items-center justify-center gap-1.5 whitespace-nowrap ${
                              item.isServed
                                ? 'clay-tint-emerald text-emerald-800'
                                : isWaitingPickup
                                ? 'clay-btn-emerald'
                                : 'clay-btn-indigo'
                            }`}
                          >
                            {item.isServed
                              ? 'Tersaji ✓'
                              : isWaitingPickup
                              ? 'Antar & Contreng'
                              : 'Contreng'}
                          </span>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

            {/* Bottom Bar */}
            <div className="px-6 py-4 border-t border-slate-200/85 bg-slate-50/90 flex flex-wrap items-center justify-between gap-3 flex-shrink-0">
              <span className="text-xs font-semibold text-slate-600">
                Menu yang dioper dari KDS otomatis muncul dengan status <strong className="text-emerald-800">SIAP DIANTAR</strong> untuk dicontreng waiter.
              </span>

              <div className="flex flex-wrap items-center gap-3">
                <button
                  type="button"
                  onClick={() => onViewSlip(selectedTable)}
                  className="min-h-[44px] px-4 py-2 clay-btn-neutral text-xs uppercase tracking-wider font-extrabold flex items-center gap-2 whitespace-nowrap shrink-0 cursor-pointer"
                >
                  <Printer className="w-4 h-4 text-indigo-700" />
                  <span>Lihat Struk Checker</span>
                </button>

                {waitingPickupCount > 0 && onMarkHandedOffServed && (
                  <button
                    type="button"
                    onClick={handleServeHandedOff}
                    className="min-h-[44px] px-4 py-2 clay-btn-emerald text-xs font-extrabold uppercase tracking-wider flex items-center gap-2 whitespace-nowrap shrink-0 cursor-pointer"
                  >
                    <CheckCircle2 className="w-4 h-4" />
                    <span>Contreng Siap Antar ({waitingPickupCount})</span>
                  </button>
                )}

                {!isAllServed ? (
                  <button
                    type="button"
                    onClick={handleCompleteAll}
                    className="min-h-[44px] px-5 py-2 clay-btn-indigo text-xs font-extrabold uppercase tracking-wider flex items-center gap-2 whitespace-nowrap shrink-0 cursor-pointer"
                  >
                    <CheckCircle2 className="w-4 h-4" />
                    <span>Contreng Semua Tersaji</span>
                  </button>
                ) : (
                  <span className="min-h-[44px] px-4 py-2 clay-tint-emerald text-emerald-800 font-extrabold text-xs flex items-center gap-2 whitespace-nowrap">
                    <CheckCircle2 className="w-4 h-4" />
                    <span>Seluruh Pesanan Lengkap Disajikan</span>
                  </span>
                )}
              </div>
            </div>
          </div>
        ) : (
          <div className="flex-1 clay-panel flex flex-col items-center justify-center p-8 text-center">
            <p className="text-lg font-extrabold text-slate-900">Tidak Ada Meja Terpilih</p>
            <p className="text-sm text-slate-600 mt-1">
              Silakan pilih salah satu meja yang sedang terisi pada daftar di atas.
            </p>
          </div>
        )}
      </div>
    </div>
  );
};
