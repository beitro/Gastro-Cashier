import React, { useState } from 'react';
import { Transaction, PettyCashEntry, StaffAccount } from '../types/pos';
import { calculateFinanceMetrics } from '../utils/authRoles';
import { formatRupiah } from '../utils/posCalculations';
import { sounds } from '../utils/soundEffects';
import {
  BarChart3,
  FileSpreadsheet,
  Plus,
  Receipt,
  Printer,
  Trash2,
  Lock,
  Wallet,
  Coins,
  CreditCard,
  QrCode,
  DollarSign,
  TrendingUp,
} from 'lucide-react';

interface FinanceViewProps {
  currentStaff: StaffAccount;
  settledTransactions: Transaction[];
  pettyCashEntries: PettyCashEntry[];
  onAddPettyCash: (entry: Omit<PettyCashEntry, 'id' | 'timestamp'>) => void;
  onDeletePettyCash: (id: string) => void;
  onOpenGoogleSheets: () => void;
  onReprintReceipt: (transaction: Transaction) => void;
  onLockScreen: () => void;
}

export const FinanceView: React.FC<FinanceViewProps> = ({
  currentStaff,
  settledTransactions,
  pettyCashEntries,
  onAddPettyCash,
  onDeletePettyCash,
  onOpenGoogleSheets,
  onReprintReceipt,
  onLockScreen,
}) => {
  // New Petty Cash entry form state
  const [desc, setDesc] = useState('');
  const [amount, setAmount] = useState('');
  const [category, setCategory] = useState<PettyCashEntry['category']>('operasional');
  const [receiptNumber, setReceiptNumber] = useState('');
  const [activeTab, setActiveTab] = useState<'audit' | 'petty_cash' | 'reconciliation'>('audit');

  const metrics = calculateFinanceMetrics(settledTransactions, pettyCashEntries);

  const handleCreatePettyCash = (e: React.FormEvent) => {
    e.preventDefault();
    const numAmount = parseInt(amount.replace(/[^0-9]/g, ''), 10);
    if (!desc.trim() || isNaN(numAmount) || numAmount <= 0) {
      return;
    }

    sounds.playTapSound();
    onAddPettyCash({
      description: desc.trim(),
      amount: numAmount,
      category,
      receiptNumber: receiptNumber.trim() || undefined,
      recordedBy: currentStaff.name,
    });

    setDesc('');
    setAmount('');
    setReceiptNumber('');
  };

  return (
    <div className="flex-1 min-h-0 flex flex-col overflow-hidden clay-canvas text-slate-800">
      {/* Top Finance Header Bar */}
      <header className="h-[74px] clay-bar px-4 sm:px-6 flex items-center justify-between gap-3 shrink-0">
        <div className="flex items-center gap-3">
          <div className="w-11 h-11 clay-btn-indigo flex items-center justify-center shrink-0">
            <BarChart3 className="w-6 h-6 text-white stroke-[2.2]" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h2 className="text-base sm:text-lg font-black text-slate-900 leading-tight">
                Workspace Pembukuan &amp; Pajak Resto (PB1)
              </h2>
              <span className="text-[10px] font-black px-2 py-0.5 rounded-md bg-indigo-100 text-indigo-900 uppercase">
                Peran: Finance
              </span>
            </div>
            <span className="text-xs text-slate-500 font-bold hidden sm:inline">
              Audit Penerimaan Kasir · Rekonsiliasi EDC &amp; QRIS · Biaya Kas Kecil Operasional
            </span>
          </div>
        </div>

        {/* Action Toolbar */}
        <div className="flex items-center gap-2.5 shrink-0">
          <button
            type="button"
            onClick={onOpenGoogleSheets}
            className="min-h-[42px] px-3.5 py-2 text-xs font-black flex items-center gap-2 whitespace-nowrap shrink-0 cursor-pointer clay-btn-emerald text-white"
            title="Ekspor Rekap Pembukuan ke Google Sheets"
          >
            <FileSpreadsheet className="w-4 h-4 stroke-[2.2]" />
            <span className="hidden md:inline">Ekspor ke Google Sheets</span>
          </button>

          <button
            type="button"
            onClick={onLockScreen}
            className="min-h-[42px] px-3.5 py-2 text-xs font-black flex items-center gap-2 whitespace-nowrap shrink-0 cursor-pointer clay-btn-neutral text-slate-700 hover:text-slate-950"
            title="Kunci Layar atau Ganti Pengguna"
          >
            <Lock className="w-4 h-4" />
            <span className="hidden sm:inline">Kunci / Ganti User</span>
          </button>
        </div>
      </header>

      {/* Financial KPIs Banner */}
      <div className="p-4 sm:p-5 pb-2 grid grid-cols-2 lg:grid-cols-6 gap-3 shrink-0">
        <div className="clay-tint-emerald p-4 rounded-2xl">
          <div className="flex items-center justify-between">
            <span className="text-[11px] font-black uppercase tracking-wider text-emerald-900">
              Kas di Laci Kasir
            </span>
            <Wallet className="w-4 h-4 text-emerald-800" />
          </div>
          <div className="text-lg sm:text-xl font-black text-emerald-950 font-mono tabular-nums mt-1">
            {formatRupiah(metrics.cashInDrawer)}
          </div>
          <span className="text-[11px] font-bold text-emerald-800 block mt-0.5">
            Tunai Bersih (Setelah Kas Kecil)
          </span>
        </div>

        <div className="clay-card p-4 rounded-2xl">
          <div className="flex items-center justify-between">
            <span className="text-[11px] font-black uppercase tracking-wider text-slate-500">
              Total Omzet Kotor
            </span>
            <Coins className="w-4 h-4 text-slate-400" />
          </div>
          <div className="text-lg sm:text-xl font-black text-slate-900 font-mono tabular-nums mt-1">
            {formatRupiah(metrics.totalOmzetKotor)}
          </div>
          <span className="text-[11px] font-semibold text-slate-500 block mt-0.5">
            {metrics.totalTransactions} Transaksi Lunas
          </span>
        </div>

        <div className="clay-card p-4 rounded-2xl">
          <div className="flex items-center justify-between">
            <span className="text-[11px] font-black uppercase tracking-wider text-slate-500">
              Pajak Resto PB1 (10%)
            </span>
            <Receipt className="w-4 h-4 text-slate-400" />
          </div>
          <div className="text-lg sm:text-xl font-black text-slate-900 font-mono tabular-nums mt-1">
            {formatRupiah(metrics.totalTaxPB1)}
          </div>
          <span className="text-[11px] font-semibold text-slate-500 block mt-0.5">
            Kasda Bapenda Daerah
          </span>
        </div>

        <div className="clay-card p-4 rounded-2xl">
          <div className="flex items-center justify-between">
            <span className="text-[11px] font-black uppercase tracking-wider text-slate-500">
              Service Charge (5%)
            </span>
            <DollarSign className="w-4 h-4 text-slate-400" />
          </div>
          <div className="text-lg sm:text-xl font-black text-indigo-800 font-mono tabular-nums mt-1">
            {formatRupiah(metrics.totalServiceCharge)}
          </div>
          <span className="text-[11px] font-semibold text-slate-500 block mt-0.5">
            Alokasi Insentif Tim
          </span>
        </div>

        <div className="clay-card p-4 rounded-2xl">
          <div className="flex items-center justify-between">
            <span className="text-[11px] font-black uppercase tracking-wider text-slate-500">
              Total Kas Kecil Keluar
            </span>
            <Receipt className="w-4 h-4 text-rose-500" />
          </div>
          <div className="text-lg sm:text-xl font-black text-rose-700 font-mono tabular-nums mt-1">
            {formatRupiah(metrics.totalPettyCash)}
          </div>
          <span className="text-[11px] font-semibold text-slate-500 block mt-0.5">
            {pettyCashEntries.length} Nota Pengeluaran
          </span>
        </div>

        <div className="clay-card p-4 rounded-2xl">
          <div className="flex items-center justify-between">
            <span className="text-[11px] font-black uppercase tracking-wider text-slate-500">
              Estimasi Laba Bersih
            </span>
            <TrendingUp className="w-4 h-4 text-emerald-600" />
          </div>
          <div className="text-lg sm:text-xl font-black text-emerald-700 font-mono tabular-nums mt-1">
            {formatRupiah(metrics.netOperatingProfit)}
          </div>
          <span className="text-[11px] font-bold text-emerald-700 block mt-0.5">
            Setelah HPP &amp; Kas Kecil
          </span>
        </div>
      </div>

      {/* Main Workspace Tabs */}
      <div className="px-4 sm:px-6 pt-2 shrink-0">
        <div className="clay-panel px-4 py-2.5 flex items-center justify-between gap-3">
          <div className="clay-well p-1 flex items-center gap-1">
            <button
              type="button"
              onClick={() => setActiveTab('audit')}
              className={`min-h-[38px] px-3.5 py-1.5 rounded-xl text-xs font-black cursor-pointer transition-all ${
                activeTab === 'audit' ? 'clay-btn-dark text-white' : 'text-slate-700 hover:text-slate-950'
              }`}
            >
              Audit Struk &amp; Omzet ({settledTransactions.length})
            </button>

            <button
              type="button"
              onClick={() => setActiveTab('reconciliation')}
              className={`min-h-[38px] px-3.5 py-1.5 rounded-xl text-xs font-black cursor-pointer transition-all ${
                activeTab === 'reconciliation' ? 'clay-btn-dark text-white' : 'text-slate-700 hover:text-slate-950'
              }`}
            >
              Rekonsiliasi Pembayaran
            </button>

            <button
              type="button"
              onClick={() => setActiveTab('petty_cash')}
              className={`min-h-[38px] px-3.5 py-1.5 rounded-xl text-xs font-black cursor-pointer transition-all ${
                activeTab === 'petty_cash' ? 'clay-btn-dark text-white' : 'text-slate-700 hover:text-slate-950'
              }`}
            >
              Buku Kas Kecil ({pettyCashEntries.length})
            </button>
          </div>

          <span className="text-xs font-mono font-bold text-slate-500 hidden sm:inline">
            Kasir Bertugas: Budi Prasetyo · Shift Siang
          </span>
        </div>
      </div>

      {/* Tab Contents */}
      <div className="flex-1 min-h-0 p-4 sm:p-6 pt-3 flex flex-col overflow-hidden">
        {/* TAB 1: AUDIT STRUK & OMZET */}
        {activeTab === 'audit' && (
          <div className="flex-1 min-h-0 clay-panel flex flex-col overflow-hidden">
            <div className="flex-1 min-h-0 overflow-y-auto bg-white/70">
              {settledTransactions.length === 0 ? (
                <div className="h-full flex flex-col items-center justify-center p-8 text-center text-slate-500">
                  <Receipt className="w-12 h-12 text-slate-400 mb-2" />
                  <p className="text-sm font-black text-slate-800">Belum Ada Transaksi Ditutup Shift Ini</p>
                  <p className="text-xs text-slate-500 mt-1">Transaksi yang diselesaikan kasir akan masuk ke audit ini.</p>
                </div>
              ) : (
                <table className="w-full text-left border-collapse text-sm">
                  <thead>
                    <tr className="border-b border-slate-200 text-[11px] font-black uppercase tracking-wider text-slate-500 bg-slate-50/95 sticky top-0 z-10">
                      <th className="py-3 pl-6 pr-3">MEJA #</th>
                      <th className="py-3 px-3">WAKTU BAYAR</th>
                      <th className="py-3 px-3">BILL ID</th>
                      <th className="py-3 px-3">METODE</th>
                      <th className="py-3 px-3 text-right">SUBTOTAL</th>
                      <th className="py-3 px-3 text-right">SERVICE (5%)</th>
                      <th className="py-3 px-3 text-right">PB1 (10%)</th>
                      <th className="py-3 px-3 text-right">TOTAL</th>
                      <th className="py-3 pl-3 pr-6 text-right">AKSI</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-200/80 bg-white/60">
                    {settledTransactions.map((tx) => (
                      <tr key={tx.id} className="hover:bg-slate-50 transition-colors">
                        <td className="py-3 pl-6 pr-3 font-black text-slate-900 font-mono">
                          #{tx.tableNumber}
                        </td>
                        <td className="py-3 px-3 text-xs font-mono text-slate-600">
                          {tx.paidAt ? new Date(tx.paidAt).toLocaleTimeString('id-ID') : '-'}
                        </td>
                        <td className="py-3 px-3 text-xs font-mono font-bold text-slate-800">
                          {tx.id}
                        </td>
                        <td className="py-3 px-3 text-xs">
                          <span className="font-black uppercase px-2 py-0.5 rounded-md bg-indigo-100 text-indigo-900">
                            {tx.paymentMethod || 'cash'}
                          </span>
                        </td>
                        <td className="py-3 px-3 text-right font-mono text-slate-600">
                          {formatRupiah(tx.subtotal)}
                        </td>
                        <td className="py-3 px-3 text-right font-mono text-slate-600">
                          {formatRupiah(tx.serviceChargeAmount)}
                        </td>
                        <td className="py-3 px-3 text-right font-mono text-slate-600">
                          {formatRupiah(tx.taxAmount)}
                        </td>
                        <td className="py-3 px-3 text-right font-black font-mono text-slate-900">
                          {formatRupiah(tx.totalAmount)}
                        </td>
                        <td className="py-3 pl-3 pr-6 text-right">
                          <button
                            type="button"
                            onClick={() => onReprintReceipt(tx)}
                            className="clay-btn-neutral min-h-[34px] px-3 py-1 text-xs font-black inline-flex items-center gap-1.5 cursor-pointer"
                          >
                            <Printer className="w-3.5 h-3.5" />
                            <span>Struk</span>
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
          </div>
        )}

        {/* TAB 2: REKONSILIASI PEMBAYARAN */}
        {activeTab === 'reconciliation' && (
          <div className="flex-1 min-h-0 clay-panel p-6 overflow-y-auto space-y-6">
            <h3 className="text-sm font-black uppercase tracking-wider text-slate-700">
              Rekonsiliasi Penerimaan Kasir &amp; Kanal EDC
            </h3>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              {/* Cash Box */}
              <div className="clay-card p-5 space-y-3">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <Wallet className="w-5 h-5 text-emerald-600" />
                    <span className="text-sm font-black text-slate-900">Pembayaran Tunai (Cash)</span>
                  </div>
                  <span className="text-xs font-mono font-bold bg-emerald-100 text-emerald-900 px-2 py-0.5 rounded-md">
                    {settledTransactions.filter((tx) => tx.paymentMethod === 'cash').length} Tx
                  </span>
                </div>
                <div className="text-2xl font-black text-slate-900 font-mono">
                  {formatRupiah(metrics.cashPayments)}
                </div>
                <div className="text-xs text-slate-500 pt-2 border-t border-slate-200 space-y-1">
                  <div className="flex justify-between">
                    <span>Uang Fisik Diterima:</span>
                    <span className="font-mono font-bold text-slate-700">{formatRupiah(metrics.cashPayments)}</span>
                  </div>
                  <div className="flex justify-between text-rose-700">
                    <span>Dipakai Kas Kecil:</span>
                    <span className="font-mono font-bold">-{formatRupiah(metrics.totalPettyCash)}</span>
                  </div>
                  <div className="flex justify-between font-black text-emerald-800 pt-1 border-t border-slate-200">
                    <span>Saldo Fisik Laci:</span>
                    <span className="font-mono">{formatRupiah(metrics.cashInDrawer)}</span>
                  </div>
                </div>
              </div>

              {/* QRIS Box */}
              <div className="clay-card p-5 space-y-3">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <QrCode className="w-5 h-5 text-indigo-600" />
                    <span className="text-sm font-black text-slate-900">QRIS Dinamis &amp; Static</span>
                  </div>
                  <span className="text-xs font-mono font-bold bg-indigo-100 text-indigo-900 px-2 py-0.5 rounded-md">
                    {settledTransactions.filter((tx) => tx.paymentMethod === 'qris').length} Tx
                  </span>
                </div>
                <div className="text-2xl font-black text-slate-900 font-mono">
                  {formatRupiah(metrics.qrisPayments)}
                </div>
                <p className="text-xs text-slate-500 pt-2 border-t border-slate-200 leading-relaxed">
                  Penyelesaian otomatis masuk ke rekening penampungan settlement H+0 / H+1 merchant bank.
                </p>
              </div>

              {/* EDC / Card Box */}
              <div className="clay-card p-5 space-y-3">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <CreditCard className="w-5 h-5 text-amber-600" />
                    <span className="text-sm font-black text-slate-900">Mesin EDC Kartu</span>
                  </div>
                  <span className="text-xs font-mono font-bold bg-amber-100 text-amber-900 px-2 py-0.5 rounded-md">
                    {settledTransactions.filter((tx) => tx.paymentMethod === 'card').length} Tx
                  </span>
                </div>
                <div className="text-2xl font-black text-slate-900 font-mono">
                  {formatRupiah(metrics.cardPayments)}
                </div>
                <p className="text-xs text-slate-500 pt-2 border-t border-slate-200 leading-relaxed">
                  Cocokkan struk audit fisik dari mesin EDC BCA/Mandiri dengan total tagihan POS.
                </p>
              </div>
            </div>
          </div>
        )}

        {/* TAB 3: BUKU KAS KECIL */}
        {activeTab === 'petty_cash' && (
          <div className="flex-1 min-h-0 grid grid-cols-1 lg:grid-cols-3 gap-4 overflow-hidden">
            {/* Form Add Petty Cash */}
            <form
              onSubmit={handleCreatePettyCash}
              className="clay-panel p-5 space-y-3 flex flex-col shrink-0"
            >
              <h3 className="text-sm font-black text-slate-900 flex items-center gap-2">
                <Plus className="w-4 h-4 text-emerald-700" />
                <span>Catat Pengeluaran Kas Kecil</span>
              </h3>

              <div className="space-y-1">
                <label className="text-[11px] font-black uppercase text-slate-600">
                  Keterangan Belanja
                </label>
                <input
                  type="text"
                  required
                  placeholder="Contoh: Isi Ulang Gas LPG 12kg"
                  value={desc}
                  onChange={(e) => setDesc(e.target.value)}
                  className="w-full clay-input min-h-[42px] px-3.5 text-xs font-bold"
                />
              </div>

              <div className="space-y-1">
                <label className="text-[11px] font-black uppercase text-slate-600">
                  Nominal (Rp)
                </label>
                <input
                  type="number"
                  required
                  min="1000"
                  placeholder="Contoh: 45000"
                  value={amount}
                  onChange={(e) => setAmount(e.target.value)}
                  className="w-full clay-input min-h-[42px] px-3.5 text-sm font-mono font-bold"
                />
              </div>

              <div className="grid grid-cols-2 gap-2">
                <div className="space-y-1">
                  <label className="text-[11px] font-black uppercase text-slate-600">
                    Kategori
                  </label>
                  <select
                    value={category}
                    onChange={(e) => setCategory(e.target.value as any)}
                    className="w-full clay-input min-h-[42px] px-2.5 text-xs font-bold"
                  >
                    <option value="operasional">Operasional</option>
                    <option value="bahan_darurat">Bahan Baku Darurat</option>
                    <option value="utilitas">Utilitas &amp; Listrik</option>
                    <option value="lainnya">Lain-lain</option>
                  </select>
                </div>

                <div className="space-y-1">
                  <label className="text-[11px] font-black uppercase text-slate-600">
                    No. Nota / Bon
                  </label>
                  <input
                    type="text"
                    placeholder="Opsional"
                    value={receiptNumber}
                    onChange={(e) => setReceiptNumber(e.target.value)}
                    className="w-full clay-input min-h-[42px] px-3 text-xs font-mono"
                  />
                </div>
              </div>

              <button
                type="submit"
                className="w-full clay-btn-indigo min-h-[44px] text-xs font-black flex items-center justify-center gap-2 text-white cursor-pointer mt-2"
              >
                <Plus className="w-4 h-4" />
                <span>Simpan Pengeluaran Kasir</span>
              </button>
            </form>

            {/* List Petty Cash Entries */}
            <div className="lg:col-span-2 flex-1 min-h-0 clay-panel flex flex-col overflow-hidden">
              <div className="flex-1 min-h-0 overflow-y-auto bg-white/70">
                {pettyCashEntries.length === 0 ? (
                  <div className="h-full flex flex-col items-center justify-center p-8 text-center text-slate-500">
                    <p className="text-sm font-black text-slate-800">Belum Ada Pengeluaran Kas Kecil</p>
                    <p className="text-xs text-slate-500 mt-1">Uang tunai di laci kasir masih utuh 100%.</p>
                  </div>
                ) : (
                  <table className="w-full text-left border-collapse text-sm">
                    <thead>
                      <tr className="border-b border-slate-200 text-[11px] font-black uppercase tracking-wider text-slate-500 bg-slate-50/95 sticky top-0 z-10">
                        <th className="py-3 pl-5 pr-3">WAKTU</th>
                        <th className="py-3 px-3">KETERANGAN</th>
                        <th className="py-3 px-3">KATEGORI</th>
                        <th className="py-3 px-3 text-right">NOMINAL</th>
                        <th className="py-3 pl-3 pr-5 text-right">AKSI</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-200/80 bg-white/60">
                      {pettyCashEntries.map((entry) => (
                        <tr key={entry.id} className="hover:bg-slate-50 transition-colors">
                          <td className="py-3 pl-5 pr-3 text-xs font-mono text-slate-500">
                            {new Date(entry.timestamp).toLocaleTimeString('id-ID', {
                              hour: '2-digit',
                              minute: '2-digit',
                            })}
                          </td>
                          <td className="py-3 px-3">
                            <span className="text-xs font-black text-slate-900 block">{entry.description}</span>
                            {entry.receiptNumber && (
                              <span className="text-[10px] font-mono text-slate-500">
                                Bon: {entry.receiptNumber} · Otorisasi: {entry.recordedBy}
                              </span>
                            )}
                          </td>
                          <td className="py-3 px-3">
                            <span className="text-[10px] font-black uppercase px-2 py-0.5 rounded-md bg-slate-100 text-slate-700">
                              {entry.category.replace('_', ' ')}
                            </span>
                          </td>
                          <td className="py-3 px-3 text-right font-black font-mono text-rose-700">
                            -{formatRupiah(entry.amount)}
                          </td>
                          <td className="py-3 pl-3 pr-5 text-right">
                            <button
                              type="button"
                              onClick={() => onDeletePettyCash(entry.id)}
                              className="text-slate-400 hover:text-rose-600 p-1.5 rounded-lg cursor-pointer transition-colors"
                              title="Hapus Catatan"
                            >
                              <Trash2 className="w-4 h-4" />
                            </button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                )}
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
