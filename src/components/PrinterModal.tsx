import React, { useState } from 'react';
import { PrintTicket } from '../types/pos';
import { ThermalReceipt } from './ThermalReceipt';
import {
  Printer,
  X,
  ChefHat,
  Wine,
  CheckSquare,
  Receipt,
  Layers,
} from 'lucide-react';

interface PrinterModalProps {
  tickets: PrintTicket[];
  onClose: () => void;
  onToggleServed?: (itemId: string) => void;
}

export const PrinterModal: React.FC<PrinterModalProps> = ({
  tickets,
  onClose,
  onToggleServed,
}) => {
  const [selectedTicketIndex, setSelectedTicketIndex] = useState<number>(0);
  const [viewMode, setViewMode] = useState<'single' | 'all'>('all');

  const currentTicket = tickets[selectedTicketIndex] || tickets[0];

  const getTicketIcon = (type: PrintTicket['type']) => {
    switch (type) {
      case 'kitchen':
        return <ChefHat className="w-4 h-4 text-amber-600" />;
      case 'bar':
        return <Wine className="w-4 h-4 text-sky-600" />;
      case 'checker':
        return <CheckSquare className="w-4 h-4 text-emerald-600" />;
      case 'receipt':
        return <Receipt className="w-4 h-4 text-indigo-600" />;
    }
  };

  const getTicketTitle = (type: PrintTicket['type']) => {
    switch (type) {
      case 'kitchen':
        return 'Printer Dapur (Koki)';
      case 'bar':
        return 'Printer Bar (Barista)';
      case 'checker':
        return 'Printer Checker Waiter';
      case 'receipt':
        return 'Struk Kasir Customer';
    }
  };

  return (
    <div className="fixed inset-0 z-50 clay-canvas flex flex-col w-screen h-screen overflow-hidden select-none text-slate-800">
      {/* Header */}
      <div className="h-20 clay-bar px-4 sm:px-6 flex items-center justify-between flex-shrink-0 gap-3">
        <div className="flex items-center gap-3.5">
          <div className="w-12 h-12 clay-btn-cyan flex items-center justify-center font-bold">
            <Printer className="w-6 h-6 text-white" />
          </div>
          <div>
            <h3 className="text-base sm:text-lg font-extrabold text-slate-900">
              Auto-Routing Printer Hub
            </h3>
            <span className="text-xs font-bold uppercase tracking-wider text-emerald-800 hidden sm:inline">
              {tickets.some((t) => t.type === 'receipt') && tickets.some((t) => t.type !== 'receipt')
                ? 'Payment First: Cetak Struk Pembayaran Lunas + Dapur, Bar & Checker'
                : 'Distribusi Otomatis Struk Dapur, Bar, Checker & Kasir'}
            </span>
          </div>
        </div>

        <div className="flex items-center gap-3">
          <div className="clay-well p-1.5 flex items-center gap-1.5 text-xs sm:text-sm">
            <button
              type="button"
              onClick={() => setViewMode('all')}
              className={`min-h-[44px] px-4 py-2 rounded-xl font-extrabold flex items-center gap-2 whitespace-nowrap cursor-pointer ${
                viewMode === 'all' ? 'clay-btn-dark' : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              <Layers className="w-4 h-4" />
              <span>Semua Struk ({tickets.length})</span>
            </button>
            <button
              type="button"
              onClick={() => setViewMode('single')}
              className={`min-h-[44px] px-4 py-2 rounded-xl font-extrabold whitespace-nowrap cursor-pointer ${
                viewMode === 'single' ? 'clay-btn-dark' : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              Tunggal
            </button>
          </div>

          <button
            type="button"
            onClick={onClose}
            className="min-w-[48px] min-h-[48px] flex items-center justify-center clay-btn-neutral cursor-pointer"
            aria-label="Tutup Printer Hub"
          >
            <X className="w-6 h-6" />
          </button>
        </div>
      </div>

      {/* Tickets Selector Tab (When in single mode) */}
      {viewMode === 'single' && (
        <div className="px-4 sm:px-6 pt-3.5 flex items-center gap-3 overflow-x-auto flex-shrink-0">
          {tickets.map((t, idx) => (
            <button
              key={t.id}
              type="button"
              onClick={() => setSelectedTicketIndex(idx)}
              className={`min-h-[48px] px-4 py-2.5 text-xs sm:text-sm font-extrabold flex items-center gap-2 whitespace-nowrap shrink-0 cursor-pointer ${
                selectedTicketIndex === idx ? 'clay-btn-cyan' : 'clay-btn-neutral'
              }`}
            >
              {selectedTicketIndex === idx ? (
                <Printer className="w-4 h-4 text-white" />
              ) : (
                getTicketIcon(t.type)
              )}
              <span>{getTicketTitle(t.type)}</span>
              <span
                className={`text-xs font-mono tabular-nums font-bold ${
                  selectedTicketIndex === idx ? 'text-white/90' : 'text-slate-500'
                }`}
              >
                Meja {t.tableNumber}
              </span>
            </button>
          ))}
        </div>
      )}

      {/* Content Area */}
      <div className="flex-1 min-h-0 overflow-y-auto p-4 sm:p-6">
        {tickets.length === 0 ? (
          <div className="h-full flex items-center justify-center">
            <div className="clay-panel p-8 max-w-md text-center">
              <Printer className="w-12 h-12 text-slate-400 mx-auto mb-3" />
              <p className="text-base font-extrabold text-slate-800">Belum Ada Antrean Cetak</p>
              <p className="text-sm text-slate-500 mt-1.5">
                Struk Dapur, Bar, Checker, dan Kasir akan otomatis muncul saat pesanan dikonfirmasi.
              </p>
            </div>
          </div>
        ) : viewMode === 'all' ? (
          <div
            className={`grid grid-cols-1 md:grid-cols-2 ${
              tickets.length >= 4 ? 'xl:grid-cols-4 max-w-7xl' : 'xl:grid-cols-3 max-w-6xl'
            } gap-5 items-start justify-center mx-auto`}
          >
            {tickets.map((t) => (
              <div key={t.id} className="space-y-3">
                <div className="clay-card-sm px-4 py-2.5 flex items-center justify-between text-xs sm:text-sm font-extrabold text-slate-800 max-w-[380px] mx-auto">
                  <span className="flex items-center gap-2">
                    {getTicketIcon(t.type)}
                    <span>{getTicketTitle(t.type)}</span>
                  </span>
                  <span className="text-xs font-mono tabular-nums text-slate-500">
                    Meja {t.tableNumber}
                  </span>
                </div>
                <ThermalReceipt
                  ticket={t}
                  onToggleServed={onToggleServed}
                  interactiveChecklist={true}
                />
              </div>
            ))}
          </div>
        ) : (
          <div className="max-w-md mx-auto py-2">
            {currentTicket && (
              <ThermalReceipt
                ticket={currentTicket}
                onToggleServed={onToggleServed}
                interactiveChecklist={true}
              />
            )}
          </div>
        )}
      </div>

      {/* Footer */}
      <div className="px-4 sm:px-6 py-4 clay-bar flex flex-wrap items-center justify-between gap-3 text-xs sm:text-sm flex-shrink-0">
        <div className="flex items-center gap-2 text-slate-600 font-semibold">
          <span>
            Printer Aktif: <strong className="text-emerald-800 font-extrabold">LAN Thermal POS 80mm</strong>
          </span>
        </div>

        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={() => window.print()}
            className="min-h-[48px] px-5 py-3 clay-btn-neutral font-extrabold flex items-center gap-2 whitespace-nowrap cursor-pointer"
          >
            <Printer className="w-4 h-4 text-sky-600" />
            <span>Cetak Semua ke Printer Fisik</span>
          </button>
          <button
            type="button"
            onClick={onClose}
            className="min-h-[48px] px-6 py-3 clay-btn-emerald font-extrabold whitespace-nowrap cursor-pointer"
          >
            Selesai / Lanjut Operasional
          </button>
        </div>
      </div>
    </div>
  );
};
