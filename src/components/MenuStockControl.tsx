import React, { useState } from 'react';
import { Transaction } from '../types/pos';
import { MENU_ITEMS } from '../data/initialData';
import { formatRupiah } from '../utils/posCalculations';
import { ShieldCheck, RotateCcw, Package, AlertTriangle } from 'lucide-react';

export interface CancellationRequest {
  id: string;
  transactionId: string;
  itemId: string;
  menuItemId: string;
  tableNumber: string;
  itemName: string;
  quantity: number;
  reason: string;
  requestedBy: string;
  requestedAt: string;
}

interface MenuStockControlProps {
  menuStock: Record<string, number>;
  transactions: Record<string, Transaction>;
  requests: CancellationRequest[];
  isManager: boolean;
  onRequestCancellation: (request: Omit<CancellationRequest, 'id' | 'requestedAt' | 'requestedBy'>) => void;
  onApproveCancellation: (requestId: string) => void;
  onRejectCancellation: (requestId: string) => void;
}

export const MenuStockControl: React.FC<MenuStockControlProps> = ({
  menuStock, transactions, requests, isManager,
  onRequestCancellation, onApproveCancellation, onRejectCancellation,
}) => {
  const [reasonByItem, setReasonByItem] = useState<Record<string, string>>({});
  const [showRequests, setShowRequests] = useState(false);
  const activeItems = Object.values(transactions).flatMap((tx) =>
    tx.allCurrentItems
      .filter((item) => !item.isServed && item.cookingStatus !== 'cooking' && item.cookingStatus !== 'ready' && item.cookingStatus !== 'handed_off')
      .map((item) => ({ tx, item }))
  );
  const pending = requests.filter((request) => request.id.startsWith('pending:'));

  return (
    <section className="m-4 clay-panel p-4 sm:p-5 space-y-4 overflow-y-auto">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <div className="flex items-center gap-2 text-emerald-800">
            <Package className="w-5 h-5" />
            <h3 className="text-lg font-black text-slate-900">Stok Menu per Outlet</h3>
          </div>
          <p className="text-xs text-slate-600 mt-1">Stok dikurangi saat order dikirim. Stok kembali hanya setelah persetujuan Manager.</p>
        </div>
        <button type="button" onClick={() => setShowRequests((value) => !value)} className="clay-btn-neutral px-4 py-2 text-xs font-extrabold">
          {showRequests ? 'Pilih Item' : `Permintaan Pembatalan (${pending.length})`}
        </button>
      </div>

      {showRequests ? (
        <div className="space-y-3">
          {!isManager && <p className="text-xs font-bold text-amber-800 flex items-center gap-2"><ShieldCheck className="w-4 h-4" /> Hanya Outlet Manager yang dapat menyetujui atau menolak.</p>}
          {pending.length === 0 && <p className="text-sm text-slate-500">Belum ada permintaan pembatalan.</p>}
          {pending.map((request) => (
            <article key={request.id} className="clay-card p-4 flex flex-wrap items-center justify-between gap-3">
              <div className="min-w-0">
                <p className="font-black text-slate-900">{request.itemName} × {request.quantity} · Meja {request.tableNumber}</p>
                <p className="text-xs text-slate-600 mt-1">Alasan: {request.reason} · Diajukan {request.requestedBy}</p>
              </div>
              {isManager && <div className="flex gap-2">
                <button type="button" onClick={() => onRejectCancellation(request.id)} className="clay-btn-neutral px-3 py-2 text-xs font-extrabold">Tolak</button>
                <button type="button" onClick={() => onApproveCancellation(request.id)} className="clay-btn-emerald px-3 py-2 text-xs font-extrabold text-white">Setujui & Kembalikan Stok</button>
              </div>}
            </article>
          ))}
        </div>
      ) : (
        <>
          <div className="grid grid-cols-2 sm:grid-cols-3 xl:grid-cols-4 gap-3">
            {MENU_ITEMS.map((menu) => {
              const stock = menuStock[menu.id] ?? 0;
              return <article key={menu.id} className="clay-card p-3">
                <p className="text-sm font-extrabold text-slate-900">{menu.name}</p>
                <p className="text-[11px] text-slate-500 mt-1">{menu.category} · {menu.destination === 'kitchen' ? 'Dapur' : 'Bar'}</p>
                <div className="flex items-end justify-between mt-3">
                  <span className={stock > 0 ? 'text-emerald-700 font-black text-xl' : 'text-rose-700 font-black text-xl'}>{stock}</span>
                  <span className="text-[10px] text-slate-500">tersedia</span>
                </div>
                {stock === 0 && <span className="text-[10px] font-black text-rose-700">HABIS · MENU NONAKTIF</span>}
              </article>;
            })}
          </div>
          <div className="border-t border-slate-200 pt-4 space-y-3">
            <div className="flex items-center gap-2"><RotateCcw className="w-4 h-4 text-amber-700" /><h4 className="font-black text-slate-900">Ajukan Pembatalan Item</h4></div>
            <p className="text-xs text-slate-600">Item yang sudah mulai dimasak, siap, atau tersaji tidak ditawarkan untuk pengembalian stok.</p>
            {activeItems.length === 0 && <p className="text-sm text-slate-500">Tidak ada item aktif yang memenuhi syarat pembatalan.</p>}
            {activeItems.map(({ tx, item }) => {
              const alreadyRequested = requests.some((request) => request.transactionId === tx.id && request.itemId === item.id);
              return <article key={item.id} className="clay-card p-3 flex flex-wrap items-center gap-3">
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-extrabold text-slate-900">{item.name} × {item.quantity} · Meja {tx.tableNumber}</p>
                  <p className="text-xs text-slate-500">{formatRupiah(item.subtotal)} · {item.cookingStatus || 'Belum diproses'}</p>
                </div>
                <input value={reasonByItem[item.id] || ''} onChange={(event) => setReasonByItem((prev) => ({...prev, [item.id]: event.target.value}))} placeholder="Alasan pembatalan" className="clay-input px-3 py-2 text-xs min-w-[150px]" />
                <button type="button" disabled={alreadyRequested || !reasonByItem[item.id]?.trim()} onClick={() => onRequestCancellation({ transactionId: tx.id, itemId: item.id, menuItemId: item.menuItemId, tableNumber: tx.tableNumber, itemName: item.name, quantity: item.quantity, reason: reasonByItem[item.id].trim() })} className="clay-btn-amber px-3 py-2 text-xs font-extrabold disabled:opacity-40">
                  {alreadyRequested ? 'Menunggu Manager' : 'Ajukan'}
                </button>
              </article>;
            })}
          </div>
        </>
      )}
      <p className="text-[11px] text-slate-500 flex items-start gap-2"><AlertTriangle className="w-4 h-4 shrink-0" /> Demo lokal: persetujuan Manager mengembalikan stok di browser ini. Sinkronisasi lintas kasir tetap memerlukan transaksi backend.</p>
    </section>
  );
};
