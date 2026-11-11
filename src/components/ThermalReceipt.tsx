import React from 'react';
import { PrintTicket, OrderItem } from '../types/pos';
import { formatRupiah } from '../utils/posCalculations';
import { Printer, Check, CheckSquare } from 'lucide-react';

interface ThermalReceiptProps {
  ticket: PrintTicket;
  onToggleServed?: (itemId: string) => void;
  interactiveChecklist?: boolean;
}

export const ThermalReceipt: React.FC<ThermalReceiptProps> = ({
  ticket,
  onToggleServed,
  interactiveChecklist = true,
}) => {
  const isKitchen = ticket.type === 'kitchen';
  const isBar = ticket.type === 'bar';
  const isChecker = ticket.type === 'checker';
  const isReceipt = ticket.type === 'receipt';

  const handlePrint = () => {
    window.print();
  };

  const formattedDate = new Date(ticket.timestamp).toLocaleString('id-ID', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  });

  return (
    <div className="bg-[#FFFDF7] text-slate-900 font-mono tabular-nums text-xs rounded-2xl shadow-lg border border-amber-200/80 p-5 w-full max-w-[380px] mx-auto relative select-text transition-shadow hover:shadow-xl">
      {/* Visual Serrated Top Edge */}
      <div className="absolute -top-2 left-2 right-2 h-2 flex justify-between overflow-hidden opacity-75">
        {Array.from({ length: 28 }).map((_, i) => (
          <span
            key={i}
            className="inline-block w-2.5 h-2 bg-[#FFFDF7] rotate-45 transform origin-bottom-left"
          />
        ))}
      </div>

      {/* Header */}
      <div className="text-center mb-3 pb-3 border-b-2 border-dashed border-slate-300">
        <div className="text-[10px] tracking-widest uppercase font-bold text-slate-500">
          {isKitchen && '••• STRUK DAPUR (KITCHEN TICKET) •••'}
          {isBar && '••• STRUK BAR (BEVERAGE TICKET) •••'}
          {isChecker && '••• STRUK WAITER / CHECKER SLIP •••'}
          {isReceipt && '••• STRUK RESMI PEMBAYARAN SAH •••'}
        </div>

        <h3 className="text-base font-black tracking-tight mt-1 text-slate-950 uppercase">
          RESTO NUSANTARA INDAH
        </h3>
        <p className="text-[10px] text-slate-600">
          Jl. Kuliner Rasa No. 88, Jakarta Selatan
        </p>
        <p className="text-[9px] text-slate-500">
          NPWPD: 01.345.678.9-012.000 | PB1 10%
        </p>

        {isChecker && (
          <div className="mt-2.5 py-1.5 px-2.5 clay-tint-amber font-sans text-[11px] font-bold flex items-center justify-center gap-1.5">
            <CheckSquare className="w-3.5 h-3.5 shrink-0" />
            <span>Contreng [ ✓ ] saat menu tiba di meja</span>
          </div>
        )}
      </div>

      {/* Ticket Meta Info */}
      <div className="space-y-1 mb-3 pb-2.5 border-b border-dashed border-slate-300 text-[11px]">
        <div className="flex justify-between items-center">
          <span className="font-bold text-slate-600">NO. MEJA:</span>
          <span className="text-base font-black bg-slate-900 text-white px-2.5 py-0.5 rounded border border-slate-900 font-mono tabular-nums">
            MEJA {ticket.tableNumber}
          </span>
        </div>
        <div className="flex justify-between">
          <span className="text-slate-500">No. Order / Bill:</span>
          <span className="font-bold text-slate-800">{ticket.transactionId}</span>
        </div>
        <div className="flex justify-between">
          <span className="text-slate-500">Waktu Cetak:</span>
          <span className="text-slate-700">{formattedDate}</span>
        </div>
        <div className="flex justify-between">
          <span className="text-slate-500">Pramusaji (Waiter):</span>
          <span className="font-bold text-slate-800">{ticket.waiterName || 'Staff Resto'}</span>
        </div>
        {ticket.batchNumber && (
          <div className="flex justify-between items-center text-amber-900 bg-amber-100/70 px-2 py-0.5 rounded-lg text-[10px] mt-1">
            <span>Pesanan ke:</span>
            <span className="font-black">BATCH #{ticket.batchNumber}</span>
          </div>
        )}
        {ticket.paymentFlow === 'payment_first' && (
          <div className="flex justify-between items-center text-emerald-950 bg-emerald-200/80 px-2 py-1 rounded-lg text-[10px] mt-1 font-sans font-extrabold">
            <span>Status Tagihan:</span>
            <span>LUNAS • PAYMENT FIRST</span>
          </div>
        )}
      </div>

      {/* Items Section */}
      <div className="mb-3 space-y-2.5">
        <div className="flex justify-between text-[10px] font-bold text-slate-500 uppercase tracking-wider pb-1 border-b border-slate-300">
          <span>{isChecker ? 'QTY & MENU SAJIAN' : 'QTY & MENU'}</span>
          <span>{isReceipt ? 'TOTAL' : isChecker ? 'AKSI / STATUS SAJI' : 'STASIUN'}</span>
        </div>

        {(ticket.items || []).map((item: OrderItem, idx: number) => {
          return (
            <div
              key={item.id || idx}
              onClick={() => {
                if (isChecker && interactiveChecklist && onToggleServed) {
                  onToggleServed(item.id);
                }
              }}
              className={`p-2.5 rounded-xl border transition-colors ${
                isChecker && interactiveChecklist && onToggleServed ? 'cursor-pointer' : ''
              } ${
                item.isServed
                  ? 'bg-emerald-100/80 border-emerald-300 text-emerald-950'
                  : 'bg-white/70 border-slate-200/80 hover:border-slate-300'
              }`}
            >
              <div className="flex items-start justify-between gap-2.5">
                <div className="flex-1 min-w-0">
                  <div className="font-bold text-slate-900 text-[12px] flex items-center gap-1.5 flex-wrap">
                    <span className="px-1.5 py-0.5 bg-slate-200/90 text-slate-900 rounded-md font-black text-[11px]">
                      {item.quantity}x
                    </span>
                    <span className={item.isServed ? 'line-through text-slate-600' : ''}>
                      {item.name}
                    </span>
                  </div>

                  {/* Modifiers */}
                  {item.selectedModifiers && item.selectedModifiers.length > 0 && (
                    <div className="text-[10px] text-amber-900 font-semibold pl-2 mt-0.5">
                      ↳ {item.selectedModifiers.map((m) => m.optionName).join(' | ')}
                    </div>
                  )}

                  {/* Kitchen Special Notes */}
                  {item.notes && (
                    <div className="text-[10px] font-bold text-rose-700 bg-rose-50 px-1.5 py-0.5 rounded-md border border-rose-200 mt-1 inline-block">
                      ★ CATATAN: {item.notes}
                    </div>
                  )}
                </div>

                {/* Right side: Price for receipt or single clear labeled action/status for checker */}
                <div className="text-right text-[11px] font-bold text-slate-800 shrink-0">
                  {isReceipt && formatRupiah(item.subtotal)}
                  {isChecker && interactiveChecklist && onToggleServed && (
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        onToggleServed(item.id);
                      }}
                      title={
                        item.isServed
                          ? 'Klik untuk membatalkan status tersaji'
                          : 'Klik untuk menandai menu ini sudah tersaji di meja'
                      }
                      aria-label={`Ubah status saji ${item.name}`}
                      className={`min-h-[32px] px-2.5 py-1 rounded-lg font-sans text-[10px] font-extrabold inline-flex items-center gap-1 cursor-pointer transition-all ${
                        item.isServed
                          ? 'bg-emerald-700 text-white shadow-xs hover:bg-emerald-800'
                          : 'bg-amber-100 text-amber-950 border border-amber-400 hover:bg-amber-200'
                      }`}
                    >
                      {item.isServed ? (
                        <>
                          <Check className="w-3.5 h-3.5 stroke-[3]" />
                          <span>✓ Tersaji (Klik Batal)</span>
                        </>
                      ) : (
                        <>
                          <CheckSquare className="w-3.5 h-3.5 text-amber-800" />
                          <span>Contreng Saji</span>
                        </>
                      )}
                    </button>
                  )}
                  {isChecker && (!interactiveChecklist || !onToggleServed) && (
                    <span
                      className={`text-[10px] px-2 py-1 rounded-md font-sans font-extrabold uppercase inline-flex items-center gap-1 ${
                        item.isServed
                          ? 'bg-emerald-700 text-white'
                          : 'bg-amber-200 text-amber-950'
                      }`}
                    >
                      {item.isServed ? '[✓ TERSAJI]' : '[BELUM SAJI]'}
                    </span>
                  )}
                  {(isKitchen || isBar) && (
                    <span className="text-[9px] font-mono font-bold text-slate-600 bg-slate-200/70 px-1.5 py-0.5 rounded">
                      [{item.destination.toUpperCase()}]
                    </span>
                  )}
                </div>
              </div>
            </div>
          );
        })}
      </div>

      {/* Financials Breakdown (For Customer Receipt) */}
      {isReceipt && ticket.financials && (
        <div className="pt-2.5 border-t-2 border-dashed border-slate-300 text-[11px] space-y-1">
          <div className="flex justify-between text-slate-600">
            <span>Subtotal:</span>
            <span className="font-bold text-slate-800">{formatRupiah(ticket.financials.subtotal)}</span>
          </div>

          {ticket.financials.discount > 0 && (
            <div className="flex justify-between text-emerald-700 font-bold">
              <span>Diskon:</span>
              <span>-{formatRupiah(ticket.financials.discount)}</span>
            </div>
          )}

          <div className="flex justify-between text-slate-600">
            <span>Service Charge (5%):</span>
            <span className="font-bold text-slate-800">{formatRupiah(ticket.financials.serviceCharge)}</span>
          </div>

          <div className="flex justify-between text-slate-600">
            <span>Pajak Restoran PB1 (10%):</span>
            <span className="font-bold text-slate-800">{formatRupiah(ticket.financials.tax)}</span>
          </div>

          <div className="flex justify-between text-base font-black text-slate-950 pt-2 pb-1 border-t border-slate-300">
            <span>TOTAL AKHIR:</span>
            <span>{formatRupiah(ticket.financials.total)}</span>
          </div>

          <div className="flex justify-between text-slate-700 pt-1">
            <span>Kategori Resto:</span>
            <span className="font-bold uppercase">
              {ticket.financials.paymentFlow === 'payment_first' || ticket.paymentFlow === 'payment_first'
                ? 'PAYMENT FIRST (BAYAR DI DEPAN)'
                : 'PAYMENT LAST (BAYAR BELAKANG)'}
            </span>
          </div>

          <div className="flex justify-between text-slate-700">
            <span>Metode Bayar:</span>
            <span className="font-bold uppercase">{ticket.financials.paymentMethod || 'TUNAI'}</span>
          </div>

          {ticket.financials.cashGiven !== undefined && ticket.financials.cashGiven > 0 && (
            <>
              <div className="flex justify-between text-slate-700">
                <span>Uang Tunai:</span>
                <span>{formatRupiah(ticket.financials.cashGiven)}</span>
              </div>
              <div className="flex justify-between text-slate-900 font-bold">
                <span>Kembalian:</span>
                <span className="text-emerald-700 font-black">
                  {formatRupiah(ticket.financials.change || 0)}
                </span>
              </div>
            </>
          )}

          <div className="mt-2 py-1.5 px-2.5 rounded-lg bg-emerald-100 text-emerald-900 text-center font-sans font-extrabold text-[11px] uppercase tracking-wider">
            {ticket.financials.paymentFlow === 'payment_first' || ticket.paymentFlow === 'payment_first'
              ? 'LUNAS DI DEPAN • SIAP DIPROSES DAPUR/BAR'
              : 'LUNAS • TRANSAKSI SELESAI'}
          </div>
        </div>
      )}

      {/* Footer Notes */}
      <div className="mt-4 pt-3 border-t border-dashed border-slate-300 text-center text-[10px] text-slate-500">
        {isReceipt ? (
          <div>
            <p className="font-bold text-slate-800">TERIMA KASIH ATAS KUNJUNGAN ANDA</p>
            <p>Makanan & Minuman yang sudah dibeli tidak dapat ditukar</p>
            <p className="mt-1 text-[9px] text-slate-400">Printed with RestoPOS Touch Engine</p>
          </div>
        ) : (
          <div>
            <p className="font-bold text-slate-700">
              {isKitchen && 'HARAP SEGERA DIMASAK & DISERAHKAN KE WAITER'}
              {isBar && 'HARAP DISIAPKAN MINUMAN DENGAN CEPAT & HIGIENIS'}
              {isChecker && 'PASTIKAN SEMUA MENU TERCETAK DICONTRENG LENGKAP'}
            </p>
            <p className="text-[9px] mt-0.5 text-slate-400">Resto Auto-Routing Dispatch System</p>
          </div>
        )}
      </div>

      {/* Action Footer (Not visible in physical print) */}
      <div className="mt-4 pt-3 border-t-2 border-dashed border-slate-300 flex flex-col gap-1.5 print:hidden">
        <button
          type="button"
          onClick={handlePrint}
          title="Cetak slip termal ini ke printer 80mm"
          className="w-full min-h-[44px] flex items-center justify-center gap-2 py-2.5 px-4 clay-btn-indigo font-sans text-xs font-extrabold cursor-pointer whitespace-nowrap text-white"
        >
          <Printer className="w-4 h-4 shrink-0" />
          <span>Cetak Struk Ini (80mm)</span>
        </button>
      </div>

      {/* Visual Serrated Bottom Edge */}
      <div className="absolute -bottom-2 left-2 right-2 h-2 flex justify-between overflow-hidden opacity-75 pointer-events-none">
        {Array.from({ length: 28 }).map((_, i) => (
          <span
            key={i}
            className="inline-block w-2.5 h-2 bg-[#FFFDF7] -rotate-45 transform origin-top-left"
          />
        ))}
      </div>
    </div>
  );
};
