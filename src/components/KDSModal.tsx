/**
 * Kitchen Display System (KDS) UI for kitchen and bar production stations.
 *
 * Shows active preparation queues and handed-off history, filters by station,
 * advances item status, and initiates handoff to the waiter/checker workflow.
 * Transaction updates are delegated to parent callbacks; queue projections and
 * status progression are provided by posCalculations.
 *
 * This component is a presentation/workflow surface, not a durable real-time
 * messaging service. Multi-device LAN/cloud delivery belongs in the backend/
 * local-network architecture.
 */
import React, { useState } from 'react';
import { Transaction, OrderItem, CookingStatus } from '../types/pos';
import {
  advanceKdsItemStatus,
  getActiveKdsTickets,
  getHandedOffKdsTickets,
  countWaiterPickupItems,
} from '../utils/posCalculations';
import {
  ChefHat,
  Wine,
  Clock,
  X,
  Utensils,
  ArrowLeft,
  Send,
  CheckSquare,
  RotateCcw,
  CheckCircle2,
} from 'lucide-react';
import { sounds } from '../utils/soundEffects';

interface KDSModalProps {
  transactions: Record<string, Transaction>;
  onClose: () => void;
  onUpdateCookingStatus: (transactionId: string, itemId: string, status: CookingStatus) => void;
  onHandoffTicketToWaiter: (
    transactionId: string,
    options?: {
      stationFilter?: 'all' | 'kitchen' | 'bar';
      onlyReady?: boolean;
      openCheckerTableId?: string;
    }
  ) => void;
  onOpenWaiterChecker: (tableId?: string) => void;
}

export const KDSModal: React.FC<KDSModalProps> = ({
  transactions,
  onClose,
  onUpdateCookingStatus,
  onHandoffTicketToWaiter,
  onOpenWaiterChecker,
}) => {
  const [stationFilter, setStationFilter] = useState<'all' | 'kitchen' | 'bar'>('all');
  const [kdsViewMode, setKdsViewMode] = useState<'active' | 'handed_off'>('active');
  const [lastHandoffInfo, setLastHandoffInfo] = useState<{
    tableId: string;
    tableNumber: string;
    label: string;
  } | null>(null);

  const activeTickets = getActiveKdsTickets(transactions, stationFilter);
  const handedOffTickets = getHandedOffKdsTickets(transactions, stationFilter);

  const activeItemCount = activeTickets.reduce((acc, t) => acc + t.items.length, 0);
  const handedOffItemCount = handedOffTickets.reduce((acc, t) => acc + t.items.length, 0);
  const waiterPickupCount = countWaiterPickupItems(transactions);

  const getElapsedTime = (timestamp: string) => {
    const diffMs = Date.now() - new Date(timestamp).getTime();
    const diffMins = Math.max(0, Math.floor(diffMs / 60000));
    return `${diffMins}m`;
  };

  const handleAdvanceItem = (tx: Transaction, item: OrderItem) => {
    const next = advanceKdsItemStatus(item.cookingStatus);
    if (next === 'ready' || next === 'handed_off') {
      sounds.playBellSound();
    } else {
      sounds.playTapSound();
    }
    onUpdateCookingStatus(tx.id, item.id, next);

    if (next === 'handed_off') {
      setLastHandoffInfo({
        tableId: tx.tableId,
        tableNumber: tx.tableNumber,
        label: `${item.quantity}x ${item.name}`,
      });
    }
  };

  const handleHandoffTicket = (
    tx: Transaction,
    itemCount: number,
    options?: { onlyReady?: boolean; openChecker?: boolean }
  ) => {
    sounds.playBellSound();
    onHandoffTicketToWaiter(tx.id, {
      stationFilter,
      onlyReady: options?.onlyReady,
      openCheckerTableId: options?.openChecker ? tx.tableId : undefined,
    });
    if (!options?.openChecker) {
      setLastHandoffInfo({
        tableId: tx.tableId,
        tableNumber: tx.tableNumber,
        label: `${itemCount} menu Meja #${tx.tableNumber}`,
      });
    }
  };

  const handleRecallItemToKitchen = (txId: string, itemId: string) => {
    sounds.playTapSound();
    onUpdateCookingStatus(txId, itemId, 'cooking');
  };

  return (
    <div className="fixed inset-0 z-50 clay-canvas text-slate-800 flex flex-col w-screen h-screen overflow-hidden select-none">
      {/* Claymorphism Header Bar */}
      <header className="h-20 clay-bar px-4 sm:px-6 flex items-center justify-between flex-shrink-0 gap-3">
        <div className="flex items-center gap-3.5">
          <div className="w-12 h-12 clay-btn-amber flex items-center justify-center shrink-0">
            <ChefHat className="w-6 h-6 text-white" />
          </div>
          <div>
            <h3 className="text-base sm:text-lg font-extrabold text-slate-900">
              KDS Live Station (Dapur &amp; Bar)
            </h3>
            <span className="text-xs font-bold uppercase tracking-wider text-emerald-800 hidden sm:inline">
              Antrean Masak Real-Time · Otomatis Hilang Saat Dioper ke Waiter
            </span>
          </div>
        </div>

        <div className="flex items-center gap-2.5">
          <button
            type="button"
            onClick={() => onOpenWaiterChecker(lastHandoffInfo?.tableId)}
            className={`min-h-[44px] px-4 py-2 text-xs sm:text-sm font-extrabold flex items-center gap-2 whitespace-nowrap shrink-0 cursor-pointer ${
              waiterPickupCount > 0 ? 'clay-btn-emerald' : 'clay-btn-neutral'
            }`}
          >
            <CheckSquare className="w-4 h-4 shrink-0" />
            <span>Checker Waiter</span>
            {waiterPickupCount > 0 && (
              <span className="px-2 py-0.5 rounded-lg bg-white/20 text-white font-mono tabular-nums text-[11px] font-extrabold">
                {waiterPickupCount} Siap Antar
              </span>
            )}
          </button>

          <button
            type="button"
            onClick={onClose}
            className="min-w-[46px] min-h-[46px] clay-btn-neutral flex items-center justify-center text-slate-700 hover:text-slate-950 cursor-pointer shrink-0"
            aria-label="Tutup KDS"
          >
            <X className="w-5 h-5" />
          </button>
        </div>
      </header>

      {/* Sub-Header Filter Clay Panel */}
      <div className="px-4 sm:px-6 pt-4 flex-shrink-0">
        <div className="clay-panel px-4 py-3 flex flex-wrap items-center justify-between gap-3">
          <div className="flex flex-wrap items-center gap-3">
            <button
              type="button"
              onClick={onClose}
              className="clay-btn-neutral min-h-[42px] px-4 py-2 text-xs font-extrabold flex items-center gap-1.5 whitespace-nowrap shrink-0 cursor-pointer"
            >
              <ArrowLeft className="w-4 h-4" />
              <span>Floor Plan</span>
            </button>

            {/* Active Cooking Queue vs Handed-Off History Toggle */}
            <div className="clay-well p-1.5 flex items-center gap-1.5">
              <button
                type="button"
                onClick={() => setKdsViewMode('active')}
                className={`min-h-[38px] px-3.5 py-1.5 rounded-xl text-xs font-extrabold whitespace-nowrap shrink-0 cursor-pointer transition-all ${
                  kdsViewMode === 'active'
                    ? 'clay-btn-dark text-white'
                    : 'text-slate-700 hover:text-slate-950'
                }`}
              >
                Antrean Masak Aktif ({activeItemCount})
              </button>
              <button
                type="button"
                onClick={() => setKdsViewMode('handed_off')}
                className={`min-h-[38px] px-3.5 py-1.5 rounded-xl text-xs font-extrabold whitespace-nowrap shrink-0 cursor-pointer transition-all ${
                  kdsViewMode === 'handed_off'
                    ? 'clay-btn-emerald text-white'
                    : 'text-slate-700 hover:text-emerald-800'
                }`}
              >
                Sudah Dioper ke Waiter ({handedOffItemCount})
              </button>
            </div>
          </div>

          {/* Station Filter Well */}
          <div className="clay-well p-1.5 flex items-center gap-1.5">
            <button
              type="button"
              onClick={() => setStationFilter('all')}
              className={`min-h-[38px] px-3.5 py-1.5 rounded-xl text-xs font-extrabold whitespace-nowrap shrink-0 cursor-pointer transition-all ${
                stationFilter === 'all'
                  ? 'clay-btn-dark text-white'
                  : 'text-slate-700 hover:text-slate-950'
              }`}
            >
              Semua Stasiun
            </button>
            <button
              type="button"
              onClick={() => setStationFilter('kitchen')}
              className={`min-h-[38px] px-3.5 py-1.5 rounded-xl text-xs font-extrabold flex items-center gap-1.5 whitespace-nowrap shrink-0 cursor-pointer transition-all ${
                stationFilter === 'kitchen'
                  ? 'clay-btn-amber text-white'
                  : 'text-slate-700 hover:text-amber-800'
              }`}
            >
              <ChefHat className="w-3.5 h-3.5" />
              <span>Dapur (Koki)</span>
            </button>
            <button
              type="button"
              onClick={() => setStationFilter('bar')}
              className={`min-h-[38px] px-3.5 py-1.5 rounded-xl text-xs font-extrabold flex items-center gap-1.5 whitespace-nowrap shrink-0 cursor-pointer transition-all ${
                stationFilter === 'bar'
                  ? 'clay-btn-cyan text-white'
                  : 'text-slate-700 hover:text-sky-800'
              }`}
            >
              <Wine className="w-3.5 h-3.5" />
              <span>Bar (Barista)</span>
            </button>
          </div>
        </div>
      </div>

      {/* Live Handoff Confirmation Banner */}
      {lastHandoffInfo && kdsViewMode === 'active' && (
        <div className="px-4 sm:px-6 pt-3 flex-shrink-0">
          <div className="clay-tint-emerald px-4 py-3 flex flex-wrap items-center justify-between gap-3">
            <div className="flex items-center gap-2 text-xs sm:text-sm text-emerald-950 font-bold">
              <CheckCircle2 className="w-4 h-4 text-emerald-700 shrink-0" />
              <span>
                <strong>{lastHandoffInfo.label}</strong> selesai dimasak, berhasil dioper ke Waiter, dan otomatis dihapus dari antrean KDS!
              </span>
            </div>

            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => onOpenWaiterChecker(lastHandoffInfo.tableId)}
                className="min-h-[38px] px-3.5 py-1.5 clay-btn-emerald text-xs font-extrabold uppercase tracking-wider flex items-center gap-1.5 whitespace-nowrap shrink-0 cursor-pointer"
              >
                <CheckSquare className="w-3.5 h-3.5" />
                <span>Lihat di Checker Meja #{lastHandoffInfo.tableNumber}</span>
              </button>
              <button
                type="button"
                onClick={() => setLastHandoffInfo(null)}
                aria-label="Tutup notifikasi oper waiter"
                className="min-w-[38px] min-h-[38px] clay-btn-neutral flex items-center justify-center text-emerald-900 cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Main KDS Grid */}
      <div className="flex-1 min-h-0 overflow-y-auto p-4 sm:p-6">
        {kdsViewMode === 'active' ? (
          activeTickets.length === 0 ? (
            <div className="h-full flex flex-col items-center justify-center text-center p-6 clay-panel">
              <Utensils className="w-12 h-12 text-slate-400 mb-3" />
              <p className="text-lg font-extrabold text-slate-900">
                Semua Pesanan Dapur &amp; Bar Selesai &amp; Sudah Dioper ke Waiter
              </p>
              <p className="text-sm text-slate-600 mt-1.5 max-w-md leading-relaxed">
                Tidak ada antrean tiket masak aktif saat ini. Pesanan yang telah dioper ke waiter otomatis hilang dari layar ini.
              </p>
              {waiterPickupCount > 0 && (
                <button
                  type="button"
                  onClick={() => onOpenWaiterChecker(lastHandoffInfo?.tableId)}
                  className="mt-5 min-h-[46px] px-5 py-2.5 clay-btn-emerald text-xs sm:text-sm font-extrabold flex items-center gap-2 whitespace-nowrap cursor-pointer"
                >
                  <CheckSquare className="w-4 h-4" />
                  <span>Buka Checker Waiter ({waiterPickupCount} Menu Siap Antar)</span>
                </button>
              )}
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-5 items-start">
              {activeTickets.map(({ transaction: tx, items: itemsToDisplay, readyCount }) => {
                const isAllReady = readyCount === itemsToDisplay.length;

                return (
                  <div key={tx.id} className="clay-card overflow-hidden flex flex-col">
                    {/* Ticket Header */}
                    <div
                      className={`px-5 py-3.5 border-b flex items-center justify-between ${
                        isAllReady
                          ? 'bg-emerald-50 border-emerald-200'
                          : 'bg-amber-50/80 border-amber-200/80'
                      }`}
                    >
                      <div className="flex items-center gap-2.5">
                        <span className="text-base font-black text-slate-900 font-mono tabular-nums">
                          Meja #{tx.tableNumber}
                        </span>
                        <span aria-hidden="true" className="text-slate-400">·</span>
                        <span className="text-xs font-bold text-slate-600">{tx.waiterName}</span>
                      </div>

                      <span className="flex items-center gap-1 text-xs font-mono tabular-nums font-extrabold text-slate-800">
                        <Clock className="w-3.5 h-3.5 text-slate-500" />
                        <span>{getElapsedTime(tx.openedAt)}</span>
                      </span>
                    </div>

                    {/* Ticket Items */}
                    <div className="divide-y divide-slate-200/75">
                      {itemsToDisplay.map((item) => {
                        const status = item.cookingStatus || 'queue';
                        const isFood = item.destination === 'kitchen';

                        return (
                          <div
                            key={item.id}
                            className={`min-h-[72px] px-5 py-3.5 flex items-center justify-between gap-3 transition-colors ${
                              status === 'ready'
                                ? 'bg-emerald-50/55'
                                : status === 'cooking'
                                ? 'bg-amber-50/45'
                                : 'bg-white'
                            }`}
                          >
                            <div className="flex-1 min-w-0">
                              <div className="text-sm font-extrabold text-slate-900 flex items-center gap-2 flex-wrap">
                                <span
                                  className={`text-[10px] font-black uppercase tracking-wider ${
                                    isFood ? 'text-amber-700' : 'text-sky-700'
                                  }`}
                                >
                                  {isFood ? 'DAPUR' : 'BAR'}
                                </span>
                                <span>
                                  <span className="font-mono tabular-nums mr-1">{item.quantity}x</span>
                                  {item.name}
                                </span>
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
                            </div>

                            <div className="text-right flex-shrink-0">
                              <button
                                type="button"
                                onClick={() => handleAdvanceItem(tx, item)}
                                aria-label={
                                  status === 'ready'
                                    ? `Oper ${item.name} Meja ${tx.tableNumber} ke Waiter`
                                    : status === 'cooking'
                                    ? `Tandai matang ${item.name} Meja ${tx.tableNumber}`
                                    : `Mulai masak ${item.name} Meja ${tx.tableNumber}`
                                }
                                className={`min-h-[42px] text-[11px] px-3.5 py-2 font-extrabold uppercase tracking-wider whitespace-nowrap shrink-0 inline-flex items-center justify-center gap-1.5 cursor-pointer ${
                                  status === 'ready'
                                    ? 'clay-btn-emerald'
                                    : status === 'cooking'
                                    ? 'clay-btn-amber'
                                    : 'clay-btn-indigo'
                                }`}
                              >
                                {status === 'ready' && (
                                  <>
                                    <Send className="w-3.5 h-3.5" />
                                    <span>Oper ke Waiter</span>
                                  </>
                                )}
                                {status === 'cooking' && <span>Dimasak · Tandai Matang</span>}
                                {status === 'queue' && <span>Antrean · Mulai Masak</span>}
                              </button>
                            </div>
                          </div>
                        );
                      })}
                    </div>

                    {/* Card Footer with One-Tap Handoff Actions */}
                    <div className="px-5 py-4 border-t border-slate-200/80 bg-slate-50/75 flex flex-col gap-3">
                      <div className="flex items-center justify-between text-xs text-slate-600 font-semibold">
                        <span>
                          Siap Saji:{' '}
                          <strong className="font-mono tabular-nums font-extrabold text-slate-900">
                            {readyCount}/{itemsToDisplay.length}
                          </strong>{' '}
                          Menu Aktif
                        </span>
                        <span className="text-[11px]">
                          {isAllReady ? 'Semua matang — siap dioper!' : 'Klik tombol untuk proses / oper'}
                        </span>
                      </div>

                      <div className="flex items-center gap-2">
                        {readyCount > 0 && !isAllReady && (
                          <button
                            type="button"
                            onClick={() => handleHandoffTicket(tx, readyCount, { onlyReady: true })}
                            className="flex-1 min-h-[42px] px-3 py-2 clay-btn-neutral text-xs font-extrabold uppercase tracking-wider flex items-center justify-center gap-1.5 whitespace-nowrap shrink-0 cursor-pointer"
                          >
                            <Send className="w-3.5 h-3.5 text-emerald-700" />
                            <span>Oper Siap Saji ({readyCount})</span>
                          </button>
                        )}

                        <button
                          type="button"
                          onClick={() => handleHandoffTicket(tx, itemsToDisplay.length)}
                          className={`flex-1 min-h-[42px] px-3.5 py-2 text-xs font-extrabold uppercase tracking-wider flex items-center justify-center gap-1.5 whitespace-nowrap shrink-0 cursor-pointer ${
                            isAllReady ? 'clay-btn-emerald' : 'clay-btn-indigo'
                          }`}
                        >
                          <Send className="w-3.5 h-3.5" />
                          <span>Selesai &amp; Oper Meja #{tx.tableNumber}</span>
                        </button>

                        <button
                          type="button"
                          onClick={() =>
                            handleHandoffTicket(tx, itemsToDisplay.length, { openChecker: true })
                          }
                          title="Oper ke Waiter lalu langsung buka Checker Meja ini"
                          aria-label={`Oper Meja ${tx.tableNumber} dan buka Checker Waiter`}
                          className="min-h-[42px] px-3 py-2 clay-btn-neutral text-xs font-extrabold uppercase tracking-wider flex items-center justify-center gap-1 whitespace-nowrap shrink-0 cursor-pointer"
                        >
                          <CheckSquare className="w-3.5 h-3.5 text-indigo-700" />
                          <span>Checker</span>
                        </button>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )
        ) : handedOffTickets.length === 0 ? (
          <div className="h-full flex flex-col items-center justify-center text-center p-6 clay-panel">
            <Utensils className="w-12 h-12 text-slate-400 mb-3" />
            <p className="text-lg font-extrabold text-slate-900">
              Belum Ada Riwayat Menu yang Dioper
            </p>
            <p className="text-sm text-slate-600 mt-1">
              Menu yang telah selesai dimasak dan dioper ke Waiter akan tercatat di sini.
            </p>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-5 items-start">
            {handedOffTickets.map(({ transaction: tx, items }) => (
              <div key={tx.id} className="clay-card overflow-hidden flex flex-col">
                <div className="px-5 py-3.5 border-b border-slate-200/80 bg-slate-50 flex items-center justify-between">
                  <div className="flex items-center gap-2.5">
                    <span className="text-base font-black text-slate-900 font-mono tabular-nums">
                      Meja #{tx.tableNumber}
                    </span>
                    <span aria-hidden="true" className="text-slate-400">·</span>
                    <span className="text-xs font-bold text-slate-600">{tx.waiterName}</span>
                  </div>
                  <button
                    type="button"
                    onClick={() => onOpenWaiterChecker(tx.tableId)}
                    className="min-h-[34px] px-3 py-1 clay-btn-neutral text-xs font-extrabold text-indigo-800 flex items-center gap-1.5 whitespace-nowrap cursor-pointer"
                  >
                    <CheckSquare className="w-3.5 h-3.5" />
                    <span>Buka Checker</span>
                  </button>
                </div>

                <div className="divide-y divide-slate-200/75">
                  {items.map((item) => (
                    <div
                      key={item.id}
                      className="min-h-[64px] px-5 py-3.5 flex items-center justify-between gap-3 bg-white"
                    >
                      <div>
                        <div className="text-sm font-extrabold text-slate-900">
                          <span className="font-mono tabular-nums mr-1">{item.quantity}x</span>
                          {item.name}
                        </div>
                        <div className="text-xs font-semibold text-slate-600 mt-0.5">
                          {item.isServed
                            ? 'Sudah Tersaji di Meja Pelanggan ✓'
                            : 'Dioper ke Waiter · Menunggu Diantar ke Meja'}
                        </div>
                      </div>

                      {!item.isServed && (
                        <button
                          type="button"
                          onClick={() => handleRecallItemToKitchen(tx.id, item.id)}
                          className="min-h-[38px] px-3 py-1.5 clay-btn-neutral text-[11px] font-extrabold uppercase tracking-wider flex items-center gap-1 whitespace-nowrap shrink-0 cursor-pointer"
                        >
                          <RotateCcw className="w-3 h-3" />
                          <span>Kembalikan ke KDS</span>
                        </button>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
};
