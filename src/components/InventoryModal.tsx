import React, { useState } from 'react';
import { RawMaterial } from '../types/pos';
import { formatRupiah } from '../utils/posCalculations';
import {
  X,
  AlertTriangle,
  Search,
  ArrowLeft,
  Boxes,
} from 'lucide-react';
import { sounds } from '../utils/soundEffects';

interface InventoryModalProps {
  materials: RawMaterial[];
  onClose: () => void;
  onRestockMaterial: (materialId: string, amount: number) => void;
}

export const InventoryModal: React.FC<InventoryModalProps> = ({
  materials,
  onClose,
  onRestockMaterial,
}) => {
  const [selectedZone, setSelectedZone] = useState<string>('all');
  const [searchQuery, setSearchQuery] = useState('');

  const filteredMaterials = materials.filter((m) => {
    if (selectedZone !== 'all' && m.storageZone !== selectedZone) return false;
    if (searchQuery.trim() !== '') {
      return m.name.toLowerCase().includes(searchQuery.toLowerCase());
    }
    return true;
  });

  const totalAssetValue = materials.reduce((acc, m) => acc + m.currentStock * m.costPerUnit, 0);
  const lowStockCount = materials.filter((m) => m.currentStock <= m.minStock).length;

  const handleRestock = (id: string, amount: number) => {
    sounds.playTapSound();
    onRestockMaterial(id, amount);
  };

  return (
    <div className="fixed inset-0 z-50 clay-canvas text-slate-800 flex flex-col w-screen h-screen overflow-hidden select-none">
      {/* Claymorphism Header Bar */}
      <header className="h-20 clay-bar px-4 sm:px-6 flex items-center justify-between flex-shrink-0 gap-3">
        <div className="flex items-center gap-3.5">
          <div className="w-12 h-12 clay-btn-indigo flex items-center justify-center shrink-0">
            <Boxes className="w-6 h-6 text-white" />
          </div>
          <div>
            <h3 className="text-base sm:text-lg font-extrabold text-slate-900">
              Inventaris &amp; Resep BOM
            </h3>
            <span className="text-xs font-bold uppercase tracking-wider text-indigo-800 hidden sm:inline">
              Pemotongan Bahan Baku Otomatis (FEFO) · Kontrol Batas ROP
            </span>
          </div>
        </div>

        <button
          type="button"
          onClick={onClose}
          className="min-w-[46px] min-h-[46px] clay-btn-neutral flex items-center justify-center text-slate-700 hover:text-slate-950 cursor-pointer shrink-0"
          aria-label="Tutup Inventaris"
        >
          <X className="w-5 h-5" />
        </button>
      </header>

      {/* Sub-Header Filter Clay Panel */}
      <div className="px-4 sm:px-6 pt-4 flex-shrink-0">
        <div className="clay-panel px-4 py-3 flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-2.5 overflow-x-auto no-scrollbar max-w-full">
            <button
              type="button"
              onClick={onClose}
              className="clay-btn-neutral min-h-[42px] px-4 py-2 text-xs font-extrabold flex items-center gap-1.5 whitespace-nowrap shrink-0 cursor-pointer"
            >
              <ArrowLeft className="w-4 h-4" />
              <span>Floor Plan</span>
            </button>

            <div className="clay-well p-1.5 flex items-center gap-1.5">
              {['all', 'Dry Storage', 'Walk-in Chiller', 'Deep Freezer', 'Bar Station'].map((zone) => (
                <button
                  key={zone}
                  type="button"
                  onClick={() => setSelectedZone(zone)}
                  className={`min-h-[36px] px-3.5 py-1.5 rounded-xl text-xs font-extrabold whitespace-nowrap shrink-0 cursor-pointer transition-all ${
                    selectedZone === zone
                      ? 'clay-btn-dark text-white'
                      : 'text-slate-700 hover:text-slate-950'
                  }`}
                >
                  {zone === 'all' ? 'Semua Zona' : zone}
                </button>
              ))}
            </div>
          </div>

          <div className="relative w-48 sm:w-60 flex-shrink-0">
            <Search className="w-4 h-4 text-slate-500 absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none" />
            <input
              type="text"
              aria-label="Cari bahan baku"
              placeholder="Cari bahan baku..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full clay-input min-h-[42px] text-xs sm:text-sm font-semibold pl-10 pr-4 py-2"
            />
          </div>
        </div>
      </div>

      {/* Claymorphism KPI Cards Strip */}
      <div className="px-4 sm:px-6 pt-4 grid grid-cols-2 lg:grid-cols-4 gap-3.5 flex-shrink-0">
        <div className="clay-card px-5 py-3.5">
          <span className="text-[11px] font-extrabold uppercase tracking-wider text-slate-500 block">
            Nilai Total Bahan Baku
          </span>
          <span className="text-lg font-black text-slate-900 font-mono tabular-nums mt-0.5 block">
            {formatRupiah(totalAssetValue)}
          </span>
        </div>

        <div className={lowStockCount > 0 ? 'clay-tint-rose px-5 py-3.5' : 'clay-card px-5 py-3.5'}>
          <span className="text-[11px] font-extrabold uppercase tracking-wider text-slate-600 block">
            Bahan Di Bawah Batas ROP
          </span>
          <span
            className={`text-lg font-black font-mono tabular-nums mt-0.5 block ${
              lowStockCount > 0 ? 'text-rose-700' : 'text-emerald-700'
            }`}
          >
            {lowStockCount} Bahan {lowStockCount > 0 ? '(Perlu Restock)' : '(Aman)'}
          </span>
        </div>

        <div className="clay-card px-5 py-3.5">
          <span className="text-[11px] font-extrabold uppercase tracking-wider text-slate-500 block">
            Metode Pengurangan
          </span>
          <span className="text-sm font-extrabold text-slate-900 mt-1 block">
            FEFO · Auto-Deduct Resep
          </span>
        </div>

        <div className="clay-card px-5 py-3.5">
          <span className="text-[11px] font-extrabold uppercase tracking-wider text-slate-500 block">
            Total Komponen BOM
          </span>
          <span className="text-lg font-black text-slate-900 font-mono tabular-nums mt-0.5 block">
            {materials.length} Bahan
          </span>
        </div>
      </div>

      {/* Materials Clay Panel Data Table */}
      <div className="flex-1 min-h-0 p-4 sm:p-6 flex flex-col overflow-hidden">
        <div className="flex-1 min-h-0 clay-panel overflow-y-auto">
          <table className="w-full text-left border-collapse text-sm">
            <thead>
              <tr className="border-b border-slate-200 text-[11px] font-extrabold uppercase tracking-wider text-slate-500 bg-slate-50/95 sticky top-0 z-10">
                <th className="py-3.5 pl-6 pr-3">BAHAN BAKU</th>
                <th className="py-3.5 px-3">ZONA SIMPAN</th>
                <th className="py-3.5 px-3 text-right">STOK TERKINI</th>
                <th className="py-3.5 px-3 text-right">BATAS ROP</th>
                <th className="py-3.5 px-3 text-right">HPP / SATUAN</th>
                <th className="py-3.5 px-3 text-right">TOTAL NILAI</th>
                <th className="py-3.5 pl-3 pr-6 text-right">RESTOCK CEPAT</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-200/75 bg-white/70">
              {filteredMaterials.map((mat) => {
                const isLow = mat.currentStock <= mat.minStock;
                return (
                  <tr
                    key={mat.id}
                    className={`transition-colors ${
                      isLow ? 'bg-rose-50/65 hover:bg-rose-50' : 'hover:bg-slate-50/90'
                    }`}
                  >
                    <td className="py-3.5 pl-6 pr-3">
                      <div className="font-extrabold text-slate-900 flex items-center gap-2">
                        {isLow && <AlertTriangle className="w-4 h-4 text-rose-600 shrink-0" />}
                        <span>{mat.name}</span>
                      </div>
                    </td>

                    <td className="py-3.5 px-3 text-xs font-semibold text-slate-600">{mat.storageZone}</td>

                    <td className="py-3.5 px-3 text-right font-mono tabular-nums font-extrabold">
                      <span className={isLow ? 'text-rose-700' : 'text-emerald-700'}>
                        {mat.currentStock} {mat.unit}
                      </span>
                    </td>

                    <td className="py-3.5 px-3 text-right font-mono tabular-nums font-semibold text-slate-500">
                      {mat.minStock} {mat.unit}
                    </td>

                    <td className="py-3.5 px-3 text-right font-mono tabular-nums font-semibold text-slate-600">
                      {formatRupiah(mat.costPerUnit)}
                    </td>

                    <td className="py-3.5 px-3 text-right font-mono tabular-nums font-extrabold text-slate-900">
                      {formatRupiah(Math.round(mat.currentStock * mat.costPerUnit))}
                    </td>

                    <td className="py-3.5 pl-3 pr-6 text-right">
                      <div className="inline-flex items-center justify-end gap-2">
                        <button
                          type="button"
                          onClick={() => handleRestock(mat.id, 5)}
                          className="min-h-[38px] min-w-[50px] px-3 py-1.5 clay-btn-neutral font-mono tabular-nums text-xs font-extrabold cursor-pointer whitespace-nowrap shrink-0"
                        >
                          +5
                        </button>
                        <button
                          type="button"
                          onClick={() => handleRestock(mat.id, 10)}
                          className="min-h-[38px] min-w-[50px] px-3 py-1.5 clay-btn-emerald font-mono tabular-nums text-xs font-extrabold cursor-pointer whitespace-nowrap shrink-0"
                        >
                          +10
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};
