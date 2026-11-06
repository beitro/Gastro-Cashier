/**
 * Settlement UI for an active POS transaction.
 *
 * Displays billable items, applies the available demo discount choices, calculates
 * the settlement breakdown, and submits the cashier's settlement intent to the
 * parent through onCompleteSettlement.
 *
 * Payment scope: cash handling is local demo logic. QRIS and card/EDC selections
 * are demo placeholders and do not represent provider/bank authorization. Do not
 * mark a real-world digital payment as paid based on this UI selection; provider
 * integration and verified payment state are owned by the product team.
 *
 * Financial calculation rules are delegated to posCalculations.
 */
import React, { useState } from 'react';
import { Table, Transaction } from '../types/pos';
import { formatRupiah, calculateChange, computeSettlementBreakdown } from '../utils/posCalculations';
import {
  CreditCard,
  X,
  Banknote,
  QrCode,
  Receipt,
  Percent,
  AlertCircle,
} from 'lucide-react';
import { sounds } from '../utils/soundEffects';

interface PaymentModalProps {
  table: Table;
  transaction: Transaction;
  onClose: () => void;
  onCompleteSettlement: (params: {
    transactionId: string;
    tableId: string;
    paymentMethod: 'cash' | 'qris' | 'card';
    cashGiven?: number;
    changeAmount?: number;
    discountAmount: number;
  }) => void;
}

export const PaymentModal: React.FC<PaymentModalProps> = ({
  table,
  transaction,
  onClose,
  onCompleteSettlement,
}) => {
  const [paymentMethod, setPaymentMethod] = useState<'cash' | 'qris' | 'card'>('cash');
  const [discountType, setDiscountType] = useState<'none' | 'member10' | 'promo20k'>('none');
  const [cashGiven, setCashGiven] = useState<number>(0);
  const [selectedBank, setSelectedBank] = useState<string>('BCA EDC');

  // Charge only unpaid items if previous batches were already settled via Payment First
  const unpaidItems = transaction.allCurrentItems.filter((i) => !i.isPaid);
  const billItems = unpaidItems.length > 0 ? unpaidItems : transaction.allCurrentItems;
  const breakdown = computeSettlementBreakdown(billItems, discountType);
  const discountAmount = breakdown.discountAmount;
  const serviceCharge = breakdown.serviceChargeAmount;
  const pb1Tax = breakdown.taxAmount;
  const finalTotal = breakdown.totalAmount;

  // Calculate change
  const changeAmount = calculateChange(finalTotal, cashGiven);
  const isCashSufficient = paymentMethod !== 'cash' || cashGiven >= finalTotal;

  // Quick cash buttons based on final total
  const quickCashOptions = [
    { label: 'Uang Pas', value: finalTotal },
    { label: 'Rp 50.000', value: 50000 },
    { label: 'Rp 100.000', value: 100000 },
    { label: 'Rp 200.000', value: 200000 },
    { label: 'Rp 300.000', value: 300000 },
    { label: 'Rp 500.000', value: 500000 },
  ].filter((opt) => opt.value >= finalTotal || opt.label === 'Uang Pas');

  const handleSelectQuickCash = (val: number) => {
    sounds.playTapSound();
    setCashGiven(val);
  };

  const handleProcessPayment = () => {
    if (!isCashSufficient) return;

    sounds.playCashRegisterSound();
    onCompleteSettlement({
      transactionId: transaction.id,
      tableId: table.id,
      paymentMethod,
      cashGiven: paymentMethod === 'cash' ? cashGiven : finalTotal,
      changeAmount: paymentMethod === 'cash' ? changeAmount : 0,
      discountAmount,
    });
  };

  return (
    <div className="fixed inset-0 z-50 clay-canvas flex flex-col w-screen h-screen overflow-hidden select-none text-slate-800">
      {/* Header */}
      <div className="h-20 clay-bar px-4 sm:px-6 flex items-center justify-between flex-shrink-0">
        <div className="flex items-center gap-3.5">
          <span className="text-base font-black clay-btn-emerald px-4 py-2 font-mono tabular-nums whitespace-nowrap">
            MEJA {table.tableNumber}
          </span>
          <div>
            <h3 className="text-base sm:text-lg font-extrabold text-slate-900">
              Kasir & Settlement PB1
            </h3>
            <span className="text-xs font-mono tabular-nums font-bold text-slate-500 hidden sm:inline">
              No. Bill: {transaction.id}
            </span>
          </div>
        </div>

        <button
          type="button"
          onClick={onClose}
          className="min-w-[48px] min-h-[48px] flex items-center justify-center clay-btn-neutral cursor-pointer"
          aria-label="Tutup Pembayaran"
        >
          <X className="w-6 h-6" />
        </button>
      </div>

      {/* Content Body: Split into Bill Breakdown (Left) & Payment Processing (Right) */}
      <div className="flex-1 min-h-0 flex flex-col lg:flex-row overflow-hidden p-3.5 sm:p-5 gap-4 sm:gap-5">
        {/* LEFT: Bill Items & Financial Breakdown */}
        <div className="flex-1 min-h-0 clay-panel p-4 sm:p-5 flex flex-col overflow-hidden">
          <div className="flex items-center justify-between mb-3">
            <h4 className="text-xs sm:text-sm font-extrabold text-slate-700 uppercase tracking-wider">
              Rincian Pesanan Pelanggan
            </h4>
            <span className="text-xs sm:text-sm font-mono tabular-nums font-extrabold text-slate-600">
              {billItems.length} Menu
            </span>
          </div>

          {/* Recessed Clay Items Tray */}
          <div className="flex-1 min-h-0 overflow-y-auto space-y-2.5 p-3.5 clay-well">
            {billItems.map((item, idx) => (
              <div
                key={item.id || idx}
                className="clay-card-sm p-3.5 flex justify-between items-start text-sm"
              >
                <div>
                  <div className="font-extrabold text-slate-900 flex items-center gap-2">
                    <span className="text-emerald-800 font-mono tabular-nums font-black">{item.quantity}x</span>
                    <span>{item.name}</span>
                  </div>
                  {item.selectedModifiers.length > 0 && (
                    <div className="text-xs font-semibold text-amber-800 pl-5 mt-0.5">
                      ↳ {item.selectedModifiers.map((m) => m.optionName).join(', ')}
                    </div>
                  )}
                </div>
                <span className="font-mono tabular-nums text-slate-900 font-extrabold">
                  {formatRupiah(item.subtotal)}
                </span>
              </div>
            ))}
          </div>

          {/* Discount Selector - Generous Touch Buttons */}
          <div className="mt-4 pt-3.5 border-t border-slate-200/80 space-y-2.5">
            <span className="text-xs sm:text-sm font-extrabold text-slate-700 flex items-center gap-1.5">
              <Percent className="w-4 h-4 text-amber-600" />
              <span>Program Diskon / Voucher</span>
            </span>
            <div className="grid grid-cols-3 gap-3">
              <button
                type="button"
                onClick={() => setDiscountType('none')}
                className={`min-h-[48px] py-2.5 px-3 text-xs sm:text-sm font-extrabold whitespace-nowrap cursor-pointer ${
                  discountType === 'none' ? 'clay-btn-dark' : 'clay-btn-neutral'
                }`}
              >
                Tanpa Diskon
              </button>
              <button
                type="button"
                onClick={() => setDiscountType('member10')}
                className={`min-h-[48px] py-2.5 px-3 text-xs sm:text-sm font-extrabold whitespace-nowrap cursor-pointer ${
                  discountType === 'member10' ? 'clay-btn-emerald' : 'clay-btn-neutral'
                }`}
              >
                Member VIP (10%)
              </button>
              <button
                type="button"
                onClick={() => setDiscountType('promo20k')}
                className={`min-h-[48px] py-2.5 px-3 text-xs sm:text-sm font-extrabold whitespace-nowrap cursor-pointer ${
                  discountType === 'promo20k' ? 'clay-btn-emerald' : 'clay-btn-neutral'
                }`}
              >
                Voucher Rp 20rb
              </button>
            </div>
          </div>

          {/* Tax & PB1 Calculation Breakdown */}
          <div className="mt-4 pt-3.5 border-t border-slate-200/80 space-y-1.5 text-xs sm:text-sm">
            <div className="flex justify-between text-slate-600">
              <span className="font-semibold">Subtotal Pesanan:</span>
              <span className="font-mono tabular-nums font-bold text-slate-900">
                {formatRupiah(breakdown.subtotal)}
              </span>
            </div>

            {discountAmount > 0 && (
              <div className="flex justify-between text-emerald-800 font-bold">
                <span>Diskon:</span>
                <span className="font-mono tabular-nums">-{formatRupiah(discountAmount)}</span>
              </div>
            )}

            <div className="flex justify-between text-slate-600">
              <span className="font-semibold">Service Charge Resto (5%):</span>
              <span className="font-mono tabular-nums font-bold text-slate-800">
                {formatRupiah(serviceCharge)}
              </span>
            </div>

            <div className="flex justify-between text-slate-600">
              <span className="flex items-center gap-2 font-semibold">
                <span>Pajak Restoran PB1 (10%):</span>
                <span className="text-[11px] font-extrabold uppercase tracking-wider text-amber-700">
                  Sah Daerah
                </span>
              </span>
              <span className="font-mono tabular-nums font-bold text-slate-800">
                {formatRupiah(pb1Tax)}
              </span>
            </div>

            <div className="flex justify-between items-baseline text-lg sm:text-xl font-black text-slate-900 pt-2.5 border-t border-slate-200/80">
              <span>TOTAL HARUS DIBAYAR:</span>
              <span className="font-mono tabular-nums text-emerald-800 text-2xl">
                {formatRupiah(finalTotal)}
              </span>
            </div>
          </div>
        </div>

        {/* RIGHT: Wider Payment Processing Clay Touch Panel */}
        <div className="w-full lg:w-[490px] xl:w-[540px] clay-panel p-5 flex flex-col justify-between overflow-y-auto">
          <div>
            <h4 className="text-xs sm:text-sm font-extrabold text-slate-700 uppercase tracking-wider mb-3.5">
              Pilih Metode Pembayaran
            </h4>

            {/* Method Switcher Clay Touch Buttons */}
            <div className="grid grid-cols-3 gap-3 mb-5">
              <button
                type="button"
                onClick={() => setPaymentMethod('cash')}
                className={`min-h-[76px] py-3.5 px-3 text-xs sm:text-sm font-extrabold flex flex-col items-center justify-center gap-2 cursor-pointer ${
                  paymentMethod === 'cash' ? 'clay-btn-emerald' : 'clay-btn-neutral'
                }`}
              >
                <Banknote className="w-6 h-6" />
                <span className="whitespace-nowrap">Tunai (Cash)</span>
              </button>

              <button
                type="button"
                onClick={() => setPaymentMethod('qris')}
                className={`min-h-[76px] py-3.5 px-3 text-xs sm:text-sm font-extrabold flex flex-col items-center justify-center gap-2 cursor-pointer ${
                  paymentMethod === 'qris' ? 'clay-btn-cyan' : 'clay-btn-neutral'
                }`}
              >
                <QrCode className="w-6 h-6" />
                <span className="whitespace-nowrap">QRIS Nasional</span>
              </button>

              <button
                type="button"
                onClick={() => setPaymentMethod('card')}
                className={`min-h-[76px] py-3.5 px-3 text-xs sm:text-sm font-extrabold flex flex-col items-center justify-center gap-2 cursor-pointer ${
                  paymentMethod === 'card' ? 'clay-btn-indigo' : 'clay-btn-neutral'
                }`}
              >
                <CreditCard className="w-6 h-6" />
                <span className="whitespace-nowrap">Debit / Kartu</span>
              </button>
            </div>

            {/* METHOD 1: CASH */}
            {paymentMethod === 'cash' && (
              <div className="space-y-4 clay-card p-5">
                <div>
                  <label
                    htmlFor="customCashInput"
                    className="text-xs sm:text-sm font-extrabold text-slate-700 block mb-2"
                  >
                    Nominal Uang Diterima dari Pelanggan
                  </label>
                  <div className="relative">
                    <span className="absolute left-4 top-1/2 -translate-y-1/2 text-base font-extrabold text-slate-500">
                      Rp
                    </span>
                    <input
                      id="customCashInput"
                      type="number"
                      value={cashGiven || ''}
                      onChange={(e) => setCashGiven(Number(e.target.value))}
                      placeholder={finalTotal.toString()}
                      className="w-full clay-input min-h-[56px] text-xl font-mono tabular-nums font-black pl-12 pr-4 py-3"
                    />
                  </div>
                </div>

                {/* Quick Cash Clay Touch Buttons */}
                <div>
                  <span className="text-xs text-slate-600 font-bold block mb-2.5">
                    Pilihan Cepat Kasir:
                  </span>
                  <div className="grid grid-cols-2 sm:grid-cols-3 gap-2.5">
                    {quickCashOptions.map((opt, i) => (
                      <button
                        key={i}
                        type="button"
                        onClick={() => handleSelectQuickCash(opt.value)}
                        className={`min-h-[50px] py-3 px-3 text-xs sm:text-sm font-mono tabular-nums font-extrabold whitespace-nowrap cursor-pointer ${
                          cashGiven === opt.value ? 'clay-btn-emerald' : 'clay-btn-neutral'
                        }`}
                      >
                        {opt.label}
                      </button>
                    ))}
                  </div>
                </div>

                {/* Kembalian Display */}
                <div className="pt-3.5 border-t border-slate-200/80 flex items-center justify-between">
                  <div>
                    <span className="text-sm font-extrabold text-slate-700 block">
                      Uang Kembalian:
                    </span>
                    {!isCashSufficient && (
                      <span className="text-xs text-rose-600 flex items-center gap-1 font-bold mt-0.5">
                        <AlertCircle className="w-4 h-4" />
                        <span>Nominal uang kurang</span>
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

            {/* METHOD 2: QRIS */}
            {paymentMethod === 'qris' && (
              <div className="clay-card p-6 text-center space-y-3.5">
                <div className="inline-block bg-white p-4 rounded-2xl shadow-sm border border-slate-200">
                  <img
                    src={`https://api.qrserver.com/v1/create-qr-code/?size=200x200&data=RESTO-NUSANTARA-TRX-${transaction.id}-TOTAL-${finalTotal}`}
                    alt="QRIS QR Code"
                    className="w-44 h-44 mx-auto"
                    loading="lazy"
                  />
                  <div className="text-[11px] font-sans font-extrabold text-slate-600 mt-2 uppercase tracking-wider">
                    QRIS Standar Pembayaran Nasional
                  </div>
                </div>
                <div className="text-sm text-slate-600">
                  <p className="font-black font-mono tabular-nums text-emerald-800 text-xl">
                    {formatRupiah(finalTotal)}
                  </p>
                  <p className="text-xs text-slate-500 mt-1">
                    Scan melalui GoPay, OVO, Dana, BCA Mobile, Livin, atau m-Banking lainnya.
                  </p>
                </div>
              </div>
            )}

            {/* METHOD 3: CARD */}
            {paymentMethod === 'card' && (
              <div className="clay-card p-5 space-y-3.5">
                <span className="text-sm font-extrabold text-slate-700 block">
                  Pilih Mesin EDC / Bank:
                </span>
                <div className="grid grid-cols-2 gap-3">
                  {['BCA EDC', 'Mandiri EDC', 'BRI EDC', 'BNI EDC'].map((bank) => (
                    <button
                      key={bank}
                      type="button"
                      onClick={() => setSelectedBank(bank)}
                      className={`min-h-[54px] p-4 text-sm font-extrabold text-left cursor-pointer ${
                        selectedBank === bank ? 'clay-btn-indigo' : 'clay-btn-neutral'
                      }`}
                    >
                      {bank}
                    </button>
                  ))}
                </div>
                <p className="text-xs text-slate-500 pt-1 leading-relaxed">
                  Pastikan struk EDC telah keluar dan berstatus APPROVAL sebelum menutup meja.
                </p>
              </div>
            )}
          </div>

          {/* Bottom Actions: Selesaikan Transaksi */}
          <div className="mt-5 pt-4 border-t border-slate-200/80 space-y-2.5">
            <button
              type="button"
              disabled={!isCashSufficient}
              onClick={handleProcessPayment}
              className={`w-full min-h-[60px] py-4 px-5 font-black text-sm sm:text-base flex items-center justify-center gap-2.5 whitespace-nowrap ${
                isCashSufficient
                  ? 'clay-btn-emerald cursor-pointer'
                  : 'clay-btn-disabled cursor-not-allowed'
              }`}
            >
              <Receipt className="w-5 h-5 shrink-0" />
              <span>SELESAIKAN PEMBAYARAN & TUTUP MEJA</span>
            </button>
            <p className="text-xs text-center text-slate-500 font-semibold">
              Struk resmi customer dicetak, omzet tercatat, dan Meja {table.tableNumber} kembali HIJAU PEKAT (Kosong).
            </p>
          </div>
        </div>
      </div>
    </div>
  );
};
