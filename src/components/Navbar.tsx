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
  FileSpreadsheet,
  Crown,
  Lock,
  ShieldCheck,
} from 'lucide-react';
import { PaymentFlowMode, Table, StaffAccount } from '../types/pos';
import { downloadFigmaWireframe } from '../utils/figmaWireframe';
import { sounds } from '../utils/soundEffects';

export type NavTabId = 'floor' | 'checker' | 'printer' | 'sales' | 'kds' | 'inventory' | 'owner' | 'admin' | 'finance';

interface NavbarProps {
  tables: Table[];
  activeTab: NavTabId;
  setActiveTab: (tab: NavTabId) => void;
  soundEnabled: boolean;
  setSoundEnabled: (enabled: boolean) => void;
  onResetData: () => void;
  recentTicketsCount: number;
  lowStockAlertCount: number;
  activeKdsCount?: number;
  waiterPickupCount?: number;
  paymentFlowMode?: PaymentFlowMode;
  onOpenGoogleSheets?: () => void;
  currentStaff?: StaffAccount | null;
  onLockScreen?: () => void;
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
  onOpenGoogleSheets,
  currentStaff,
  onLockScreen,
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
      currentRole: currentStaff?.role,
      staffName: currentStaff?.name,
    });
    setWireframeDownloaded(true);
    setTimeout(() => setWireframeDownloaded(false), 2600);
  };

  // Role-based Nav Items
  const role = currentStaff?.role || 'cashier';

  const allNavItems: {
    id: NavTabId;
    label: string;
    icon: React.ReactNode;
    badge?: number;
    alert?: boolean;
    roles: ('owner' | 'cashier' | 'finance')[];
  }[] = [
    {
      id: 'owner',
      label: 'Cockpit Owner',
      icon: <Crown className="w-4 h-4 stroke-[2.2] text-amber-500" />,
      roles: ['owner'],
    },
    {
      id: 'admin',
      label: 'Admin & Staff',
      icon: <ShieldCheck className="w-4 h-4 stroke-[2]" />,
      roles: ['owner'],
    },
    {
      id: 'floor',
      label: 'Floor Plan',
      icon: <Store className="w-4 h-4 stroke-[2]" />,
      roles: ['owner', 'cashier'],
    },
    {
      id: 'kds',
      label: 'KDS Dapur',
      icon: <Flame className="w-4 h-4 stroke-[2]" />,
      badge: activeKdsCount > 0 ? activeKdsCount : undefined,
      roles: ['owner', 'cashier'],
    },
    {
      id: 'checker',
      label: 'Checker',
      icon: <CheckSquare className="w-4 h-4 stroke-[2]" />,
      badge: waiterPickupCount > 0 ? waiterPickupCount : undefined,
      alert: waiterPickupCount > 0,
      roles: ['owner', 'cashier'],
    },
    {
      id: 'inventory',
      label: 'Stok Menu',
      icon: <Boxes className="w-4 h-4 stroke-[2]" />,
      badge: lowStockAlertCount > 0 ? lowStockAlertCount : undefined,
      alert: lowStockAlertCount > 0,
      roles: ['owner', 'finance', 'cashier'],
    },
    {
      id: 'printer',
      label: 'Printer Hub',
      icon: <Printer className="w-4 h-4 stroke-[2]" />,
      badge: recentTicketsCount > 0 ? recentTicketsCount : undefined,
      roles: ['owner', 'cashier'],
    },
    {
      id: 'finance',
      label: 'Pembukuan & PB1',
      icon: <BarChart3 className="w-4 h-4 stroke-[2]" />,
      roles: ['owner', 'finance'],
    },
  ];

  const visibleNavItems = allNavItems.filter((item) => item.roles.includes(role));

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
          {visibleNavItems.map((item) => {
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

      {/* Right: Staff Chip + Occupancy Readout + Download Figma Wireframe CTA + Tactile Utility Controls */}
      <div className="flex items-center gap-2 sm:gap-2.5 shrink-0">
        {/* Active Staff Badge & Lock Screen Button */}
        {currentStaff && (
          <button
            type="button"
            onClick={() => {
              if (soundEnabled) sounds.playTapSound();
              if (onLockScreen) onLockScreen();
            }}
            title="Klik untuk Kunci Layar / Ganti User (NFC Tag / PIN)"
            className={`min-h-[42px] px-2.5 sm:px-3 py-1.5 rounded-2xl flex items-center gap-2 cursor-pointer transition-all ${
              currentStaff.role === 'owner'
                ? 'clay-tint-amber text-amber-950 border border-amber-300'
                : currentStaff.role === 'finance'
                ? 'clay-tint-indigo text-indigo-950 border border-indigo-300'
                : 'clay-tint-emerald text-emerald-950 border border-emerald-300'
            }`}
          >
            <div
              className={`w-7 h-7 rounded-xl flex items-center justify-center text-white text-xs font-black shadow-sm shrink-0 ${
                currentStaff.role === 'owner'
                  ? 'bg-amber-600'
                  : currentStaff.role === 'finance'
                  ? 'bg-indigo-600'
                  : 'bg-emerald-600'
              }`}
            >
              {currentStaff.role === 'owner' ? (
                <Crown className="w-4 h-4" />
              ) : currentStaff.role === 'finance' ? (
                <BarChart3 className="w-4 h-4" />
              ) : (
                <Store className="w-4 h-4" />
              )}
            </div>
            <div className="text-left hidden lg:block">
              <div className="text-[11px] font-black leading-tight flex items-center gap-1.5">
                <span>{currentStaff.name.split(' ')[0]}</span>
                <span className="text-[9px] uppercase px-1 py-0.2 rounded bg-white/70 font-mono font-bold">
                  {currentStaff.role}
                </span>
              </div>
              <span className="text-[10px] text-slate-500 font-bold block flex items-center gap-0.5">
                <Lock className="w-2.5 h-2.5" /> Kunci / Ganti
              </span>
            </div>
          </button>
        )}
        <div className="hidden xl:flex items-center gap-2 text-xs text-slate-600 font-mono tabular-nums whitespace-nowrap pr-1">
          <span className="text-emerald-700 font-extrabold">{availableCount} Kosong</span>
          <span aria-hidden="true" className="text-slate-300">·</span>
          <span className="text-rose-700 font-extrabold">{occupiedCount} Terisi</span>
          <span aria-hidden="true" className="text-slate-300">·</span>
          <span className="text-slate-500 font-semibold">
            {currentTime.toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' })}
          </span>
        </div>

        {/* Google Sheets Integration Button */}
        {onOpenGoogleSheets && (
          <button
            type="button"
            onClick={() => {
              if (soundEnabled) sounds.playTapSound();
              onOpenGoogleSheets();
            }}
            aria-label="Integrasi Google Sheets"
            title="Ekspor Rekap Omzet PB1 dan Inventaris Bahan ke Google Sheets"
            className="min-h-[42px] px-3.5 py-2 text-xs font-black flex items-center gap-2 whitespace-nowrap shrink-0 cursor-pointer clay-btn-emerald text-white"
          >
            <FileSpreadsheet className="w-4 h-4 shrink-0 stroke-[2.2]" />
            <span className="hidden sm:inline">Google Sheets</span>
          </button>
        )}

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
