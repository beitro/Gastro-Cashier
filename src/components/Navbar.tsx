import React, { useState, useEffect } from 'react';
import {
  Store,
  Printer,
  CheckSquare,
  BarChart3,
  Volume2,
  VolumeX,
  RotateCcw,
  Flame,
  Boxes,
  Download,
  Check,
} from 'lucide-react';
import { PaymentFlowMode, Table } from '../types/pos';
import { downloadFigmaWireframe } from '../utils/figmaWireframe';
import { sounds } from '../utils/soundEffects';

interface NavbarProps {
  tables: Table[];
  activeTab: 'floor' | 'checker' | 'printer' | 'sales' | 'kds' | 'inventory';
  setActiveTab: (tab: 'floor' | 'checker' | 'printer' | 'sales' | 'kds' | 'inventory') => void;
  soundEnabled: boolean;
  setSoundEnabled: (enabled: boolean) => void;
  onResetData: () => void;
  recentTicketsCount: number;
  lowStockAlertCount: number;
  activeKdsCount?: number;
  waiterPickupCount?: number;
  paymentFlowMode?: PaymentFlowMode;
}

export const Navbar: React.FC<NavbarProps> = ({
  tables,
  activeTab,
  setActiveTab,
  soundEnabled,
  setSoundEnabled,
  onResetData,
  recentTicketsCount,
  lowStockAlertCount,
  activeKdsCount = 0,
  waiterPickupCount = 0,
  paymentFlowMode = 'payment_last',
}) => {
  const [currentTime, setCurrentTime] = useState(new Date());
  const [wireframeDownloaded, setWireframeDownloaded] = useState(false);

  useEffect(() => {
    const timer = setInterval(() => setCurrentTime(new Date()), 1000);
    return () => clearInterval(timer);
  }, []);

  const availableCount = tables.filter((t) => t.status === 'available').length;
  const occupiedCount = tables.filter((t) => t.status === 'occupied').length;

  const handleDownloadWireframe = () => {
    if (soundEnabled) sounds.playTapSound();
    downloadFigmaWireframe({
      restaurantName: 'Resto Nusantara',
      totalTables: tables.length,
      availableTables: availableCount,
      occupiedTables: occupiedCount,
      paymentFlowMode,
    });
    setWireframeDownloaded(true);
    setTimeout(() => setWireframeDownloaded(false), 2600);
  };

  const navItems: {
    id: 'floor' | 'kds' | 'checker' | 'inventory' | 'printer' | 'sales';
    label: string;
    icon: React.ReactNode;
    badge?: number;
    alert?: boolean;
  }[] = [
    {
      id: 'floor',
      label: 'Floor Plan',
      icon: <Store className="w-4 h-4 stroke-[2]" />,
    },
    {
      id: 'kds',
      label: 'KDS Dapur',
      icon: <Flame className="w-4 h-4 stroke-[2]" />,
      badge: activeKdsCount > 0 ? activeKdsCount : undefined,
    },
    {
      id: 'checker',
      label: 'Checker',
      icon: <CheckSquare className="w-4 h-4 stroke-[2]" />,
      badge: waiterPickupCount > 0 ? waiterPickupCount : undefined,
      alert: waiterPickupCount > 0,
    },
    {
      id: 'inventory',
      label: 'BOM Stok',
      icon: <Boxes className="w-4 h-4 stroke-[2]" />,
      badge: lowStockAlertCount > 0 ? lowStockAlertCount : undefined,
      alert: lowStockAlertCount > 0,
    },
    {
      id: 'printer',
      label: 'Printer Hub',
      icon: <Printer className="w-4 h-4 stroke-[2]" />,
      badge: recentTicketsCount > 0 ? recentTicketsCount : undefined,
    },
    {
      id: 'sales',
      label: 'Omzet & PB1',
      icon: <BarChart3 className="w-4 h-4 stroke-[2]" />,
    },
  ];

  return (
    <header className="h-[68px] clay-bar select-none flex-shrink-0 z-30 px-3.5 sm:px-5 flex items-center justify-between gap-3 w-full">
      {/* Left: Tactile Clay Brand Mark + Segmented Navigation Well */}
      <div className="flex items-center gap-3 min-w-0 flex-1">
        <div className="flex items-center gap-2.5 shrink-0">
          <div className="w-10 h-10 clay-btn-emerald flex items-center justify-center shrink-0">
            <Store className="w-5 h-5 text-white stroke-[2.2]" />
          </div>
          <span className="text-base font-black tracking-tight text-slate-900 whitespace-nowrap hidden sm:inline">
            RestoPOS
          </span>
        </div>

        {/* Recessed Clay Well Navigation Track */}
        <nav
          className="clay-well p-1 flex items-center gap-1 overflow-x-auto no-scrollbar max-w-full"
          aria-label="Main Navigation"
        >
          {navItems.map((item) => {
            const isActive = activeTab === item.id;
            return (
              <button
                key={item.id}
                type="button"
                onClick={() => setActiveTab(item.id)}
                className={`min-h-[42px] px-3 py-1.5 rounded-xl flex items-center gap-1.5 text-xs font-extrabold whitespace-nowrap shrink-0 cursor-pointer transition-all ${
                  isActive
                    ? 'clay-btn-dark text-white'
                    : 'text-slate-700 hover:text-slate-950 hover:bg-white/60'
                }`}
              >
                <span className={isActive ? 'text-emerald-300' : 'text-slate-500'}>
                  {item.icon}
                </span>
                <span>{item.label}</span>
                {item.badge !== undefined && (
                  <span
                    className={`text-[11px] font-mono tabular-nums font-extrabold px-1.5 py-0.5 rounded-lg ${
                      item.alert
                        ? 'bg-emerald-600 text-white'
                        : isActive
                        ? 'bg-white/20 text-white'
                        : 'bg-slate-200/90 text-slate-800'
                    }`}
                  >
                    {item.badge}
                  </span>
                )}
              </button>
            );
          })}
        </nav>
      </div>

      {/* Right: Occupancy Readout + Download Figma Wireframe CTA + Tactile Utility Controls */}
      <div className="flex items-center gap-2 sm:gap-2.5 shrink-0">
        <div className="hidden xl:flex items-center gap-2 text-xs text-slate-600 font-mono tabular-nums whitespace-nowrap pr-1">
          <span className="text-emerald-700 font-extrabold">{availableCount} Kosong</span>
          <span aria-hidden="true" className="text-slate-300">·</span>
          <span className="text-rose-700 font-extrabold">{occupiedCount} Terisi</span>
          <span aria-hidden="true" className="text-slate-300">·</span>
          <span className="text-slate-500 font-semibold">
            {currentTime.toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' })}
          </span>
        </div>

        {/* Download Figma Wireframe Button */}
        <button
          type="button"
          onClick={handleDownloadWireframe}
          aria-label="Download Figma Wireframe"
          title="Unduh file SVG Wireframe Claymorphism siap import ke Figma"
          className={`min-h-[42px] px-3.5 py-2 text-xs font-extrabold flex items-center gap-2 whitespace-nowrap shrink-0 cursor-pointer ${
            wireframeDownloaded ? 'clay-btn-emerald' : 'clay-btn-indigo'
          }`}
        >
          {wireframeDownloaded ? (
            <>
              <Check className="w-4 h-4 shrink-0 stroke-[2.5]" />
              <span>Wireframe Terunduh</span>
            </>
          ) : (
            <>
              <Download className="w-4 h-4 shrink-0 stroke-[2.2]" />
              <span>Figma Wireframe</span>
            </>
          )}
        </button>

        {/* Tactile Audio & Reset Utility Buttons */}
        <button
          type="button"
          onClick={() => setSoundEnabled(!soundEnabled)}
          title={soundEnabled ? 'Matikan Suara Audio' : 'Aktifkan Suara Audio'}
          aria-label={soundEnabled ? 'Matikan Suara Audio' : 'Aktifkan Suara Audio'}
          className="min-w-[42px] min-h-[42px] clay-btn-neutral flex items-center justify-center text-slate-700 hover:text-slate-950 cursor-pointer shrink-0"
        >
          {soundEnabled ? (
            <Volume2 className="w-[18px] h-[18px] stroke-[2]" />
          ) : (
            <VolumeX className="w-[18px] h-[18px] stroke-[2] text-slate-400" />
          )}
        </button>

        <button
          type="button"
          onClick={onResetData}
          title="Reset Data Demo"
          aria-label="Reset Data Demo"
          className="min-w-[42px] min-h-[42px] clay-btn-neutral flex items-center justify-center text-slate-700 hover:text-rose-700 cursor-pointer shrink-0"
        >
          <RotateCcw className="w-[18px] h-[18px] stroke-[2]" />
        </button>
      </div>
    </header>
  );
};
