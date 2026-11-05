import React, { useState, useEffect } from 'react';
import { User } from 'firebase/auth';
import { Transaction, RawMaterial } from '../types/pos';
import {
  signInWithGoogle,
  signOutGoogle,
  onAuthChanged,
  getStoredAccessToken,
} from '../services/firebaseAuth';
import {
  createRestoSpreadsheet,
  exportSalesToExistingSpreadsheet,
  exportInventoryToExistingSpreadsheet,
  extractSpreadsheetId,
  CreateSpreadsheetResult,
} from '../services/googleSheets';
import { formatRupiah } from '../utils/posCalculations';
import { sounds } from '../utils/soundEffects';
import {
  X,
  FileSpreadsheet,
  ExternalLink,
  Copy,
  Check,
  Loader2,
  LogOut,
  Plus,
  RefreshCw,
  AlertCircle,
  Database,
  CheckCircle2,
} from 'lucide-react';

interface GoogleSheetsModalProps {
  settledTransactions: Transaction[];
  materials: RawMaterial[];
  initialMode?: 'create' | 'sales' | 'inventory';
  onClose: () => void;
}

export const GoogleSheetsModal: React.FC<GoogleSheetsModalProps> = ({
  settledTransactions,
  materials,
  initialMode = 'create',
  onClose,
}) => {
  const [currentUser, setCurrentUser] = useState<User | null>(null);
  const [isAuthLoading, setIsAuthLoading] = useState(false);
  const [activeAction, setActiveAction] = useState<'create' | 'existing'>(
    initialMode === 'create' ? 'create' : 'existing'
  );

  // New sheet configuration
  const [sheetTitle, setSheetTitle] = useState(
    `RestoPOS - Laporan Operasional & PB1 (${new Date().toLocaleDateString('id-ID').replace(/\//g, '-')})`
  );

  // Existing sheet configuration
  const [existingSheetInput, setExistingSheetInput] = useState('');
  const [exportTarget, setExportTarget] = useState<'sales' | 'inventory'>('sales');

  // Operation state
  const [isProcessing, setIsProcessing] = useState(false);
  const [successResult, setSuccessResult] = useState<{
    url: string;
    message: string;
    subDetails?: string;
  } | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [copiedLink, setCopiedLink] = useState(false);

  // Listen to Firebase Auth state
  useEffect(() => {
    const unsubscribe = onAuthChanged((user) => {
      setCurrentUser(user);
    });
    return () => unsubscribe();
  }, []);

  const totalOmzet = settledTransactions.reduce((acc, tx) => acc + tx.totalAmount, 0);
  const totalPB1 = settledTransactions.reduce((acc, tx) => acc + tx.taxAmount, 0);
  const totalMaterialValue = materials.reduce((acc, m) => acc + m.currentStock * m.costPerUnit, 0);

  // Sign in handler
  const handleSignIn = async () => {
    sounds.playTapSound();
    setIsAuthLoading(true);
    setErrorMessage(null);
    try {
      const { user } = await signInWithGoogle();
      setCurrentUser(user);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Gagal login dengan akun Google';
      setErrorMessage(msg);
    } finally {
      setIsAuthLoading(false);
    }
  };

  // Sign out handler
  const handleSignOut = async () => {
    sounds.playTapSound();
    try {
      await signOutGoogle();
      setCurrentUser(null);
      setSuccessResult(null);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Gagal keluar akun Google';
      setErrorMessage(msg);
    }
  };

  // Create new spreadsheet
  const handleCreateNewSpreadsheet = async () => {
    sounds.playTapSound();
    let token = getStoredAccessToken();
    if (!token) {
      try {
        const authRes = await signInWithGoogle();
        token = authRes.accessToken;
      } catch (err: unknown) {
        setErrorMessage(err instanceof Error ? err.message : 'Izin Google Sheets diperlukan.');
        return;
      }
    }

    setIsProcessing(true);
    setErrorMessage(null);
    setSuccessResult(null);

    try {
      const result: CreateSpreadsheetResult = await createRestoSpreadsheet(token, {
        title: sheetTitle.trim(),
        sales: settledTransactions,
        materials,
      });

      setSuccessResult({
        url: result.spreadsheetUrl,
        message: 'Google Spreadsheet Baru Berhasil Dibuat!',
        subDetails: `${result.salesRowCount} transaksi penjualan & ${result.inventoryRowCount} bahan baku berhasil ditulis ke dua tab.`,
      });
      sounds.playBellSound();
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Gagal membuat Google Spreadsheet';
      setErrorMessage(msg);
    } finally {
      setIsProcessing(false);
    }
  };

  // Export to existing spreadsheet
  const handleExportExisting = async () => {
    sounds.playTapSound();
    const cleanId = extractSpreadsheetId(existingSheetInput);
    if (!cleanId) {
      setErrorMessage('Silakan masukkan ID atau tautan Google Spreadsheet tujuan.');
      return;
    }

    let token = getStoredAccessToken();
    if (!token) {
      try {
        const authRes = await signInWithGoogle();
        token = authRes.accessToken;
      } catch (err: unknown) {
        setErrorMessage(err instanceof Error ? err.message : 'Izin Google Sheets diperlukan.');
        return;
      }
    }

    setIsProcessing(true);
    setErrorMessage(null);
    setSuccessResult(null);

    try {
      if (exportTarget === 'sales') {
        const res = await exportSalesToExistingSpreadsheet(token, cleanId, settledTransactions, 'overwrite');
        setSuccessResult({
          url: res.spreadsheetUrl,
          message: 'Rekap Penjualan & PB1 Berhasil Disinkronkan!',
          subDetails: `${res.rowCount} transaksi berhasil diperbarui di tab "Rekap Penjualan & PB1".`,
        });
      } else {
        const res = await exportInventoryToExistingSpreadsheet(token, cleanId, materials);
        setSuccessResult({
          url: res.spreadsheetUrl,
          message: 'Inventaris Stok BOM Berhasil Disinkronkan!',
          subDetails: `${res.rowCount} bahan baku berhasil diperbarui di tab "Inventaris Stok BOM".`,
        });
      }
      sounds.playBellSound();
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Gagal memperbarui Google Spreadsheet';
      setErrorMessage(msg);
    } finally {
      setIsProcessing(false);
    }
  };

  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text);
    setCopiedLink(true);
    sounds.playTapSound();
    setTimeout(() => setCopiedLink(false), 2200);
  };

  return (
    <div
      className="fixed inset-0 z-50 bg-slate-900/40 backdrop-blur-xs flex items-center justify-center p-3 sm:p-5 select-none"
      onClick={onClose}
    >
      <div
        className="clay-modal w-full max-w-2xl max-h-[92vh] flex flex-col overflow-hidden text-slate-800"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <header className="h-[74px] clay-bar px-5 sm:px-6 flex items-center justify-between gap-3 shrink-0">
          <div className="flex items-center gap-3">
            <div className="w-11 h-11 clay-btn-emerald flex items-center justify-center shrink-0">
              <FileSpreadsheet className="w-6 h-6 text-white stroke-[2.2]" />
            </div>
            <div>
              <h3 className="text-base sm:text-lg font-black text-slate-900 leading-tight">
                Integrasi Google Sheets &amp; Drive
              </h3>
              <span className="text-xs font-bold uppercase tracking-wider text-emerald-800">
                Ekspor Rekap Omzet PB1 (Z-Report) &amp; Inventaris BOM
              </span>
            </div>
          </div>

          <button
            type="button"
            onClick={onClose}
            className="min-w-[42px] min-h-[42px] clay-btn-neutral flex items-center justify-center text-slate-700 hover:text-slate-950 cursor-pointer shrink-0"
            aria-label="Tutup Jendela"
          >
            <X className="w-5 h-5" />
          </button>
        </header>

        {/* Content Body */}
        <div className="flex-1 min-h-0 overflow-y-auto p-5 sm:p-6 space-y-5">
          {/* Auth Bar */}
          <div className="clay-panel p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            {currentUser ? (
              <div className="flex items-center gap-3 min-w-0">
                {currentUser.photoURL ? (
                  <img
                    src={currentUser.photoURL}
                    alt={currentUser.displayName || 'Akun'}
                    className="w-10 h-10 rounded-xl ring-2 ring-emerald-500 shrink-0"
                  />
                ) : (
                  <div className="w-10 h-10 rounded-xl bg-emerald-600 text-white font-extrabold flex items-center justify-center shrink-0">
                    {currentUser.displayName?.[0] || currentUser.email?.[0] || 'G'}
                  </div>
                )}
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-black text-slate-900 truncate">
                      {currentUser.displayName || 'Pengguna Google'}
                    </span>
                    <span className="text-[10px] font-extrabold px-1.5 py-0.5 rounded-md bg-emerald-100 text-emerald-800 uppercase">
                      Terhubung
                    </span>
                  </div>
                  <span className="text-xs text-slate-500 font-mono truncate block">
                    {currentUser.email}
                  </span>
                </div>
              </div>
            ) : (
              <div className="space-y-1">
                <span className="text-xs font-black uppercase tracking-wider text-slate-600 block">
                  Autentikasi Akun Google
                </span>
                <p className="text-xs text-slate-500 leading-relaxed">
                  Hubungkan akun Google Drive untuk membuat dan menyinkronkan spreadsheet secara otomatis.
                </p>
              </div>
            )}

            <div className="shrink-0">
              {currentUser ? (
                <button
                  type="button"
                  onClick={handleSignOut}
                  className="clay-btn-neutral min-h-[38px] px-3.5 py-1.5 text-xs font-extrabold flex items-center gap-1.5 cursor-pointer text-slate-700 hover:text-rose-700"
                >
                  <LogOut className="w-3.5 h-3.5" />
                  <span>Keluar Akun</span>
                </button>
              ) : (
                <button
                  type="button"
                  onClick={handleSignIn}
                  disabled={isAuthLoading}
                  className="clay-btn-neutral min-h-[44px] px-4 py-2 text-xs font-extrabold flex items-center gap-2.5 cursor-pointer text-slate-800 hover:text-slate-950 bg-white"
                >
                  {isAuthLoading ? (
                    <Loader2 className="w-4 h-4 animate-spin text-emerald-600" />
                  ) : (
                    <svg className="w-4 h-4" viewBox="0 0 24 24">
                      <path
                        fill="#4285F4"
                        d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
                      />
                      <path
                        fill="#34A853"
                        d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
                      />
                      <path
                        fill="#FBBC05"
                        d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.06H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.94l2.85-2.22.81-.63z"
                      />
                      <path
                        fill="#EA4335"
                        d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.06l3.66 2.84c.87-2.6 3.3-4.52 6.16-4.52z"
                      />
                    </svg>
                  )}
                  <span>Masuk dengan Google</span>
                </button>
              )}
            </div>
          </div>

          {/* Action Mode Toggle */}
          <div className="clay-well p-1.5 flex items-center gap-1.5">
            <button
              type="button"
              onClick={() => {
                sounds.playTapSound();
                setActiveAction('create');
                setErrorMessage(null);
              }}
              className={`flex-1 min-h-[42px] px-4 py-2 rounded-xl text-xs font-black flex items-center justify-center gap-2 cursor-pointer transition-all ${
                activeAction === 'create'
                  ? 'clay-btn-dark text-white'
                  : 'text-slate-700 hover:text-slate-950'
              }`}
            >
              <Plus className="w-4 h-4" />
              <span>Buat Spreadsheet Baru</span>
            </button>

            <button
              type="button"
              onClick={() => {
                sounds.playTapSound();
                setActiveAction('existing');
                setErrorMessage(null);
              }}
              className={`flex-1 min-h-[42px] px-4 py-2 rounded-xl text-xs font-black flex items-center justify-center gap-2 cursor-pointer transition-all ${
                activeAction === 'existing'
                  ? 'clay-btn-dark text-white'
                  : 'text-slate-700 hover:text-slate-950'
              }`}
            >
              <RefreshCw className="w-4 h-4" />
              <span>Update Spreadsheet yang Ada</span>
            </button>
          </div>

          {/* Action 1: Create New Spreadsheet */}
          {activeAction === 'create' && (
            <div className="space-y-4">
              <div className="space-y-1.5">
                <label className="text-xs font-black uppercase tracking-wider text-slate-700">
                  Judul File Google Spreadsheet
                </label>
                <input
                  type="text"
                  value={sheetTitle}
                  onChange={(e) => setSheetTitle(e.target.value)}
                  placeholder="Judul spreadsheet..."
                  className="w-full clay-input min-h-[46px] px-4 text-sm font-bold text-slate-900"
                />
              </div>

              {/* Data Summary Grid Preview */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div className="clay-card p-4 space-y-1">
                  <div className="flex items-center justify-between">
                    <span className="text-[11px] font-extrabold uppercase tracking-wider text-emerald-800">
                      Tab 1: Rekap Penjualan
                    </span>
                    <span className="text-xs font-mono font-bold px-2 py-0.5 rounded-md bg-emerald-100 text-emerald-900">
                      {settledTransactions.length} Transaksi
                    </span>
                  </div>
                  <div className="text-base font-black text-slate-900 font-mono tabular-nums">
                    {formatRupiah(totalOmzet)}
                  </div>
                  <span className="text-xs text-slate-500 block">
                    Pajak PB1: {formatRupiah(totalPB1)} · Service: 5%
                  </span>
                </div>

                <div className="clay-card p-4 space-y-1">
                  <div className="flex items-center justify-between">
                    <span className="text-[11px] font-extrabold uppercase tracking-wider text-indigo-800">
                      Tab 2: Inventaris BOM
                    </span>
                    <span className="text-xs font-mono font-bold px-2 py-0.5 rounded-md bg-indigo-100 text-indigo-900">
                      {materials.length} Bahan Baku
                    </span>
                  </div>
                  <div className="text-base font-black text-slate-900 font-mono tabular-nums">
                    {formatRupiah(totalMaterialValue)}
                  </div>
                  <span className="text-xs text-slate-500 block">
                    Auto-deduct resep FEFO &amp; peringatan ROP
                  </span>
                </div>
              </div>

              {/* Create Button */}
              <button
                type="button"
                onClick={handleCreateNewSpreadsheet}
                disabled={isProcessing}
                className="w-full min-h-[52px] clay-btn-emerald text-sm font-black flex items-center justify-center gap-2 cursor-pointer text-white shadow-lg"
              >
                {isProcessing ? (
                  <>
                    <Loader2 className="w-5 h-5 animate-spin" />
                    <span>Sedang Membuat &amp; Mengunggah ke Google Sheets...</span>
                  </>
                ) : (
                  <>
                    <FileSpreadsheet className="w-5 h-5 stroke-[2.2]" />
                    <span>Konfirmasi &amp; Buat Google Spreadsheet Baru</span>
                  </>
                )}
              </button>
            </div>
          )}

          {/* Action 2: Existing Spreadsheet */}
          {activeAction === 'existing' && (
            <div className="space-y-4">
              <div className="space-y-1.5">
                <label className="text-xs font-black uppercase tracking-wider text-slate-700">
                  ID atau URL Google Spreadsheet Tujuan
                </label>
                <input
                  type="text"
                  value={existingSheetInput}
                  onChange={(e) => setExistingSheetInput(e.target.value)}
                  placeholder="https://docs.google.com/spreadsheets/d/... atau Spreadsheet ID"
                  className="w-full clay-input min-h-[46px] px-4 text-xs font-mono font-bold text-slate-900"
                />
                <span className="text-[11px] text-slate-500">
                  Contoh: https://docs.google.com/spreadsheets/d/1BxiMVs0.../edit
                </span>
              </div>

              <div className="space-y-1.5">
                <label className="text-xs font-black uppercase tracking-wider text-slate-700">
                  Target Data yang Disinkronkan
                </label>
                <div className="grid grid-cols-2 gap-3">
                  <button
                    type="button"
                    onClick={() => setExportTarget('sales')}
                    className={`min-h-[46px] p-3 rounded-xl text-xs font-black flex items-center justify-center gap-2 cursor-pointer transition-all ${
                      exportTarget === 'sales'
                        ? 'clay-btn-dark text-white'
                        : 'clay-card text-slate-700'
                    }`}
                  >
                    <span>Rekap Omzet &amp; PB1 ({settledTransactions.length})</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => setExportTarget('inventory')}
                    className={`min-h-[46px] p-3 rounded-xl text-xs font-black flex items-center justify-center gap-2 cursor-pointer transition-all ${
                      exportTarget === 'inventory'
                        ? 'clay-btn-dark text-white'
                        : 'clay-card text-slate-700'
                    }`}
                  >
                    <span>Stok Bahan BOM ({materials.length})</span>
                  </button>
                </div>
              </div>

              <button
                type="button"
                onClick={handleExportExisting}
                disabled={isProcessing}
                className="w-full min-h-[52px] clay-btn-indigo text-sm font-black flex items-center justify-center gap-2 cursor-pointer text-white shadow-lg"
              >
                {isProcessing ? (
                  <>
                    <Loader2 className="w-5 h-5 animate-spin" />
                    <span>Sedang Menyinkronkan Data ke Google Sheets...</span>
                  </>
                ) : (
                  <>
                    <RefreshCw className="w-5 h-5" />
                    <span>Sinkronkan ke Spreadsheet Ini</span>
                  </>
                )}
              </button>
            </div>
          )}

          {/* Error Banner */}
          {errorMessage && (
            <div className="clay-tint-rose p-4 rounded-2xl flex items-start gap-3">
              <AlertCircle className="w-5 h-5 text-rose-700 shrink-0 mt-0.5" />
              <div className="min-w-0">
                <span className="text-xs font-black text-rose-900 block">Terjadi Kendala:</span>
                <p className="text-xs text-rose-800 mt-0.5 leading-relaxed">{errorMessage}</p>
              </div>
            </div>
          )}

          {/* Success Banner */}
          {successResult && (
            <div className="clay-tint-emerald p-4 sm:p-5 rounded-2xl space-y-3">
              <div className="flex items-start gap-3">
                <CheckCircle2 className="w-6 h-6 text-emerald-700 shrink-0 mt-0.5" />
                <div className="min-w-0 flex-1">
                  <h4 className="text-sm font-black text-emerald-950">{successResult.message}</h4>
                  {successResult.subDetails && (
                    <p className="text-xs text-emerald-800 mt-1">{successResult.subDetails}</p>
                  )}
                </div>
              </div>

              <div className="flex flex-wrap items-center gap-2.5 pt-1">
                <a
                  href={successResult.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="clay-btn-emerald min-h-[44px] px-4 py-2 text-xs font-black flex items-center gap-2 text-white shrink-0 cursor-pointer no-underline"
                >
                  <ExternalLink className="w-4 h-4" />
                  <span>Buka di Google Sheets</span>
                </a>

                <button
                  type="button"
                  onClick={() => copyToClipboard(successResult.url)}
                  className="clay-btn-neutral min-h-[44px] px-3.5 py-2 text-xs font-extrabold flex items-center gap-1.5 shrink-0 cursor-pointer"
                >
                  {copiedLink ? (
                    <>
                      <Check className="w-4 h-4 text-emerald-700 stroke-[2.5]" />
                      <span className="text-emerald-800">Tautan Disalin</span>
                    </>
                  ) : (
                    <>
                      <Copy className="w-4 h-4" />
                      <span>Salin Tautan</span>
                    </>
                  )}
                </button>
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        <footer className="px-6 py-4 clay-bar border-t border-slate-200/80 flex items-center justify-between shrink-0">
          <div className="flex items-center gap-2 text-[11px] font-semibold text-slate-500">
            <Database className="w-3.5 h-3.5 text-slate-400" />
            <span>Google Sheets REST API v4 · Firebase Auth OAuth Client</span>
          </div>

          <button
            type="button"
            onClick={onClose}
            className="min-h-[40px] px-5 py-2 clay-btn-neutral text-xs font-black cursor-pointer"
          >
            Tutup
          </button>
        </footer>
      </div>
    </div>
  );
};
