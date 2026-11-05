import React from 'react';
import { Transaction } from '../types/pos';
import { formatRupiah } from '../utils/posCalculations';
import {
  X,
  Receipt,
  Printer,
  ArrowLeft,
  BarChart3,
  FileSpreadsheet,
} from 'lucide-react';

interface SalesSummaryModalProps {
  settledTransactions: Transaction[];
  onClose: () => void;
  onReprintReceipt: (transaction: Transaction) => void;
  onOpenGoogleSheets?: () => void;
}

export const SalesSummaryModal: React.FC<SalesSummaryModalProps> = ({
  settledTransactions,
  onClose,
  onReprintReceipt,
  onOpenGoogleSheets,
}) => {
  const totalOmzetKotor = settledTransactions.reduce((acc, tx) => acc + tx.totalAmount, 0);
  const totalSubtotal = settledTransactions.reduce((acc, tx) => acc + tx.subtotal, 0);
  const totalServiceCharge = settledTransactions.reduce((acc, tx) => acc + tx.serviceChargeAmount, 0);
  const totalTaxPB1 = settledTransactions.reduce((acc, tx) => acc + tx.taxAmount, 0);
  const totalDiscounts = settledTransactions.reduce((acc, tx) => acc + tx.discountAmount, 0);

  return (
    <div className="fixed inset-0 z-50 clay-canvas text-slate-800 flex flex-col w-screen h-screen overflow-hidden select-none">
      {/* Claymorphism Header Bar */}
      <header className="h-20 clay-bar px-4 sm:px-6 flex items-center justify-between flex-shrink-0 gap-3">
        <div className="flex items-center gap-3.5">
          <div className="w-12 h-12 clay-btn-emerald flex items-center justify-center shrink-0">
            <BarChart3 className="w-6 h-6 text-white" />
          </div>
          <div>
            <h3 className="text-base sm:text-lg font-extrabold text-slate-900">
              Reports · Rekap Omzet &amp; PB1 (Z-Report)
            </h3>
            <span className="text-xs font-bold uppercase tracking-wider text-emerald-800 hidden sm:inline">
              Laporan Penjualan Shift · Pajak Restoran PB1 10% &amp; Service 5%
            </span>
          </div>
        </div>

        <button
          type="button"
          onClick={onClose}
          className="min-w-[46px] min-h-[46px] clay-btn-neutral flex items-center justify-center text-slate-700 hover:text-slate-950 cursor-pointer shrink-0"
          aria-label="Tutup Laporan"
        >
          <X className="w-5 h-5" />
        </button>
      </header>

      {/* Sub-Header Bar */}
      <div className="px-4 sm:px-6 pt-4 flex-shrink-0">
        <div className="clay-panel px-4 py-3 flex items-center justify-between gap-3">
          <button
            type="button"
            onClick={onClose}
            className="clay-btn-neutral min-h-[42px] px-4 py-2 text-xs font-extrabold flex items-center gap-1.5 whitespace-nowrap shrink-0 cursor-pointer"
          >
            <ArrowLeft className="w-4 h-4" />
            <span>Floor Plan</span>
          </button>

          <div className="flex items-center gap-3">
            <span className="text-xs font-mono tabular-nums font-extrabold text-slate-600 hidden sm:inline">
              {settledTransactions.length} Transaksi Selesai Shift Ini
            </span>
            {onOpenGoogleSheets && (
              <button
                type="button"
                onClick={onOpenGoogleSheets}
                className="clay-btn-emerald min-h-[42px] px-4 py-2 text-xs font-black flex items-center gap-2 whitespace-nowrap shrink-0 cursor-pointer text-white"
                title="Ekspor Rekap Omzet & Pajak PB1 ke Google Sheets"
              >
                <FileSpreadsheet className="w-4 h-4 stroke-[2.2]" />
                <span>Ekspor ke Google Sheets</span>
              </button>
            )}
          </div>
        </div>
      </div>

      {/* Claymorphism Financial KPI Strip */}
      <div className="px-4 sm:px-6 pt-4 grid grid-cols-2 lg:grid-cols-5 gap-3.5 flex-shrink-0">
        <div className="clay-tint-emerald px-5 py-4">
          <span className="text-[11px] font-extrabold uppercase tracking-wider text-emerald-900 block">
            Total Omzet Penjualan
          </span>
          <div className="text-xl font-black text-emerald-950 font-mono tabular-nums mt-1">
            {formatRupiah(totalOmzetKotor)}
          </div>
          <span className="text-xs font-bold text-emerald-800 mt-0.5 block">
            {settledTransactions.length} Meja Ditutup / Lunas
          </span>
        </div>

        <div className="clay-card px-5 py-4">
          <span className="text-[11px] font-extrabold uppercase tracking-wider text-slate-500 block">
            Pajak Restoran PB1 (10%)
          </span>
          <div className="text-xl font-black text-slate-900 font-mono tabular-nums mt-1">
            {formatRupiah(totalTaxPB1)}
          </div>
          <span className="text-xs font-semibold text-slate-500 mt-0.5 block">
            Setoran Kas Daerah Bapenda
          </span>
        </div>

        <div className="clay-card px-5 py-4">
          <span className="text-[11px] font-extrabold uppercase tracking-wider text-slate-500 block">
            Estimasi HPP Bahan (BOM)
          </span>
          <div className="text-xl font-black text-rose-700 font-mono tabular-nums mt-1">
            {formatRupiah(Math.round(totalSubtotal * 0.36))}
          </div>
          <span className="text-xs font-semibold text-slate-500 mt-0.5 block">
            Food Cost ~36.0% (FEFO)
          </span>
        </div>

        <div className="clay-card px-5 py-4">
          <span className="text-[11px] font-extrabold uppercase tracking-wider text-slate-500 block">
            Laba Kotor Resto (Gross)
          </span>
          <div className="text-xl font-black text-emerald-700 font-mono tabular-nums mt-1">
            {formatRupiah(Math.round(totalSubtotal * 0.64 - totalDiscounts))}
          </div>
          <span className="text-xs font-bold text-emerald-700 mt-0.5 block">
            Gross Margin ~64.0%
          </span>
        </div>

        <div className="clay-card px-5 py-4 col-span-2 lg:col-span-1">
          <span className="text-[11px] font-extrabold uppercase tracking-wider text-slate-500 block">
            Service Charge (5%)
          </span>
          <div className="text-xl font-black text-indigo-800 font-mono tabular-nums mt-1">
            {formatRupiah(totalServiceCharge)}
          </div>
          <span className="text-xs font-semibold text-slate-500 mt-0.5 block">
            Alokasi Insentif Staf
          </span>
        </div>
      </div>

      {/* Settled Transactions Data Table */}
      <div className="flex-1 min-h-0 p-4 sm:p-6 flex flex-col overflow-hidden">
        <div className="flex-1 min-h-0 clay-panel flex flex-col overflow-hidden">
          <div className="flex-1 min-h-0 overflow-y-auto bg-white/60">
            {settledTransactions.length === 0 ? (
              <div className="h-full flex flex-col items-center justify-center p-12 text-center max-w-md mx-auto">
                <Receipt className="w-12 h-12 mb-3 text-slate-400" />
                <p className="text-lg font-extrabold text-slate-900">
                  Belum Ada Transaksi yang Ditutup
                </p>
                <p className="text-sm text-slate-600 mt-1.5 leading-relaxed">
                  Selesaikan pembayaran pada salah satu meja terisi (atau gunakan mode Payment First) untuk mencatat omzet dan pajak PB1 di laporan ini.
                </p>
              </div>
            ) : (
              <table className="w-full text-left border-collapse text-sm">
                <thead>
                  <tr className="border-b border-slate-200 text-[11px] font-extrabold uppercase tracking-wider text-slate-500 bg-slate-50/95 sticky top-0 z-10">
                    <th className="py-3.5 pl-6 pr-3">MEJA #</th>
                    <th className="py-3.5 px-3">STATUS</th>
                    <th className="py-3.5 px-3">WAKTU BAYAR</th>
                    <th className="py-3.5 px-3">BILL ID &amp; METODE</th>
                    <th className="py-3.5 px-3 text-right">SUBTOTAL</th>
                    <th className="py-3.5 px-3 text-right">PB1 (10%)</th>
                    <th className="py-3.5 px-3 text-right">TOTAL AKHIR</th>
                    <th className="py-3.5 pl-3 pr-6 text-right">STRUK</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-200/75">
                  {settledTransactions.map((tx) => (
                    <tr key={tx.id} className="hover:bg-slate-50/90 transition-colors bg-white/80">
                      <td className="py-3.5 pl-6 pr-3 font-extrabold text-slate-900 font-mono tabular-nums">
                        #{tx.tableNumber}
                      </td>
                      <td className="py-3.5 px-3 text-xs font-extrabold text-emerald-700">
                        Lunas
                      </td>
                      <td className="py-3.5 px-3 text-slate-600 font-mono tabular-nums text-xs font-semibold">
                        {tx.paidAt ? new Date(tx.paidAt).toLocaleTimeString('id-ID') : '-'}
                      </td>
                      <td className="py-3.5 px-3 text-xs">
                        <span className="font-mono tabular-nums text-slate-900 font-bold">{tx.id}</span>
                        <span className="mx-1.5 text-slate-300">·</span>
                        <span className="uppercase font-extrabold text-indigo-700">{tx.paymentMethod}</span>
                      </td>
                      <td className="py-3.5 px-3 text-right font-mono tabular-nums font-semibold text-slate-600">
                        {formatRupiah(tx.subtotal)}
                      </td>
                      <td className="py-3.5 px-3 text-right font-mono tabular-nums font-semibold text-slate-600">
                        {formatRupiah(tx.taxAmount)}
                      </td>
                      <td className="py-3.5 px-3 text-right font-black font-mono tabular-nums text-slate-900">
                        {formatRupiah(tx.totalAmount)}
                      </td>
                      <td className="py-3.5 pl-3 pr-6 text-right">
                        <button
                          type="button"
                          onClick={() => onReprintReceipt(tx)}
                          className="min-h-[38px] px-3.5 py-1.5 clay-btn-indigo text-xs font-extrabold inline-flex items-center gap-1.5 whitespace-nowrap shrink-0 cursor-pointer"
                        >
                          <Printer className="w-3.5 h-3.5" />
                          <span>Cetak Ulang</span>
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>

          {/* Footer */}
          <div className="px-6 py-4 border-t border-slate-200/85 bg-slate-50/90 flex justify-end flex-shrink-0">
            <button
              type="button"
              onClick={onClose}
              className="min-h-[44px] px-6 py-2 clay-btn-dark text-xs font-extrabold whitespace-nowrap shrink-0 cursor-pointer"
            >
              Tutup Rekap Z-Report
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
