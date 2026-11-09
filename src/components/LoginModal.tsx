import React, { useState, useEffect } from 'react';
import { StaffAccount } from '../types/pos';
import { DEFAULT_STAFF_ACCOUNTS } from '../utils/authRoles';
import { sounds } from '../utils/soundEffects';
import {
  KeyRound,
  Radio,
  Sparkles,
  Crown,
  CreditCard,
  BarChart3,
  AlertCircle,
  Delete,
  CheckCircle2,
  Scan,
} from 'lucide-react';

const MAX_PIN_ATTEMPTS = 5;
const LOCK_DURATION_MS = 30_000;

interface LoginModalProps {
  currentStaff: StaffAccount | null;
  onLoginSuccess: (staff: StaffAccount) => void;
  onCancel?: () => void;
  canCancel?: boolean;
}

export const LoginModal: React.FC<LoginModalProps> = ({
  currentStaff,
  onLoginSuccess,
  onCancel,
  canCancel = false,
}) => {
  const [pin, setPin] = useState('');
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [isNfcScanning, setIsNfcScanning] = useState(false);
  const [nfcSuccessAnimation, setNfcSuccessAnimation] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<'pin' | 'nfc'>('pin');
  const [failedAttempts, setFailedAttempts] = useState(0);
  const [lockUntil, setLockUntil] = useState<number | null>(null);
  const [lockRemainingSec, setLockRemainingSec] = useState(0);
  const isPinLocked = lockUntil !== null && Date.now() < lockUntil;

  useEffect(() => {
    if (!lockUntil) {
      setLockRemainingSec(0);
      return;
    }
    const tick = () => {
      const left = Math.max(0, Math.ceil((lockUntil - Date.now()) / 1000));
      setLockRemainingSec(left);
      if (left <= 0) {
        setLockUntil(null);
        setFailedAttempts(0);
        setErrorMessage(null);
      }
    };
    tick();
    const id = window.setInterval(tick, 250);
    return () => window.clearInterval(id);
  }, [lockUntil]);

  // Handle hardware Web NFC if available on Android Chrome
  useEffect(() => {
    let ndef: any = null;
    let abortController: AbortController | null = null;

    if (activeTab === 'nfc' && 'NDEFReader' in window) {
      try {
        abortController = new AbortController();
        // @ts-ignore
        ndef = new window.NDEFReader();
        ndef.scan({ signal: abortController.signal }).then(() => {
          setIsNfcScanning(true);
          ndef.onreading = (event: any) => {
            const serialNumber = event.serialNumber || 'NFC-STAFF-UNKNOWN';
            handleNfcAuth(serialNumber);
          };
        }).catch(() => {
          setIsNfcScanning(false);
        });
      } catch {
        setIsNfcScanning(false);
      }
    }

    return () => {
      if (abortController) abortController.abort();
    };
  }, [activeTab]);

  const handleKeyPress = (num: string) => {
    if (isPinLocked) return;
    sounds.playTapSound();
    setErrorMessage(null);
    if (pin.length < 4) {
      const nextPin = pin + num;
      setPin(nextPin);
      if (nextPin.length === 4) {
        verifyEnteredPin(nextPin);
      }
    }
  };

  const handleDelete = () => {
    if (isPinLocked) return;
    sounds.playTapSound();
    setPin((prev) => prev.slice(0, -1));
    setErrorMessage(null);
  };

  const handleClear = () => {
    if (isPinLocked) return;
    sounds.playTapSound();
    setPin('');
    setErrorMessage(null);
  };

  const verifyEnteredPin = async (inputPin: string) => {
    if (isPinLocked) { setErrorMessage('Input PIN sedang dikunci.'); setPin(''); return; }
    try {
      const response = await fetch('/api/auth/pin', { method:'POST', headers:{'Content-Type':'application/json'}, body:JSON.stringify({pin:inputPin}) });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || 'Autentikasi gagal.');
      localStorage.setItem('gastro_cashier_api_token', data.token);
      sounds.playBellSound(); setFailedAttempts(0); setLockUntil(null);
      setNfcSuccessAnimation('Selamat datang, ' + data.staff.name + '!');
      setTimeout(() => onLoginSuccess(data.staff), 400);
    } catch (error) {
      sounds.playTapSound(); const n=failedAttempts+1; setFailedAttempts(n);
      if(n>=MAX_PIN_ATTEMPTS){setLockUntil(Date.now()+LOCK_DURATION_MS);setErrorMessage('Terlalu banyak percobaan. Input dikunci 30 detik.');}
      else setErrorMessage((error instanceof Error?error.message:'PIN tidak valid')+' · Sisa percobaan: '+(MAX_PIN_ATTEMPTS-n));
      setTimeout(()=>setPin(''),600);
    }
  };
  const handleNfcAuth = async (tagUid: string) => {
    try {
      const response=await fetch('/api/auth/nfc',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({uid:tagUid})});
      const data=await response.json();
      if(!response.ok) throw new Error(data.error||'Kartu NFC tidak dikenali.');
      localStorage.setItem('gastro_cashier_api_token',data.token);
      sounds.playBellSound();setFailedAttempts(0);setLockUntil(null);
      setNfcSuccessAnimation('NFC terverifikasi: '+data.staff.name);
      setTimeout(()=>onLoginSuccess(data.staff),500);
    } catch(error){sounds.playTapSound();setErrorMessage(error instanceof Error?error.message:'Autentikasi NFC gagal.');}
  };

  const handleQuickDemoStaff = (staff: StaffAccount) => {
    if (isPinLocked) return;
    sounds.playTapSound();
    setPin(staff.pin);
    verifyEnteredPin(staff.pin);
  };

  return (
    <div className="fixed inset-0 z-50 bg-slate-950/60 backdrop-blur-md flex items-center justify-center p-3 sm:p-4 select-none">
      <div
        className="clay-modal w-full max-w-md max-h-[96vh] flex flex-col overflow-hidden text-slate-800 animate-in fade-in zoom-in-95 duration-200"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header Bar */}
        <header className="h-[76px] clay-bar px-6 flex items-center justify-between gap-3 shrink-0">
          <div className="flex items-center gap-3">
            <div className="w-11 h-11 clay-btn-emerald flex items-center justify-center shrink-0">
              <KeyRound className="w-6 h-6 text-white stroke-[2.2]" />
            </div>
            <div>
              <h3 className="text-base sm:text-lg font-black text-slate-900 leading-tight">
                Otorisasi Akses RestoPOS
              </h3>
              <span className="text-xs font-bold uppercase tracking-wider text-emerald-800">
                Login NFC Tag / Input PIN Role Staff
              </span>
            </div>
          </div>

          {canCancel && onCancel && !isPinLocked && (
            <button
              type="button"
              onClick={onCancel}
              className="clay-btn-neutral min-h-[38px] px-3.5 text-xs font-black cursor-pointer"
            >
              Batal
            </button>
          )}
        </header>

        {/* Scrollable Content */}
        <div className="flex-1 min-h-0 overflow-y-auto p-5 sm:p-6 space-y-4">
          {/* Method Tabs: PIN Keypad vs NFC Card */}
          <div className="clay-well p-1.5 flex items-center gap-1.5">
            <button
              type="button"
              onClick={() => {
                sounds.playTapSound();
                setActiveTab('pin');
                setErrorMessage(null);
              }}
              className={`flex-1 min-h-[42px] px-3 py-2 rounded-xl text-xs font-black flex items-center justify-center gap-2 cursor-pointer transition-all ${
                activeTab === 'pin'
                  ? 'clay-btn-dark text-white'
                  : 'text-slate-700 hover:text-slate-950'
              }`}
            >
              <KeyRound className="w-4 h-4" />
              <span>Input PIN 4-Digit</span>
            </button>

            <button
              type="button"
              onClick={() => {
                sounds.playTapSound();
                setActiveTab('nfc');
                setErrorMessage(null);
              }}
              className={`flex-1 min-h-[42px] px-3 py-2 rounded-xl text-xs font-black flex items-center justify-center gap-2 cursor-pointer transition-all ${
                activeTab === 'nfc'
                  ? 'clay-btn-dark text-white'
                  : 'text-slate-700 hover:text-slate-950'
              }`}
            >
              <Radio className="w-4 h-4 animate-pulse text-emerald-400" />
              <span>Tap Kartu NFC Staff</span>
            </button>
          </div>

          {isPinLocked && (
            <div className="clay-tint-rose p-3 rounded-xl flex items-center gap-2.5">
              <AlertCircle className="w-4 h-4 text-rose-700 shrink-0" />
              <span className="text-xs font-black text-rose-900">Input PIN dikunci · coba lagi dalam {lockRemainingSec}s</span>
            </div>
          )}

          {/* TAB 1: PIN NUMERIC KEYPAD */}
          {activeTab === 'pin' && (
            <div className="space-y-4">
              {/* PIN Indicator Dots */}
              <div className="clay-panel p-4 flex flex-col items-center justify-center space-y-2">
                <span className="text-[11px] font-black uppercase tracking-wider text-slate-500">
                  Masukkan 4-Digit Kode Keamanan
                </span>

                <div className="flex items-center gap-4 py-1">
                  {[0, 1, 2, 3].map((idx) => {
                    const isFilled = pin.length > idx;
                    return (
                      <div
                        key={idx}
                        className={`w-6 h-6 rounded-full transition-all duration-150 flex items-center justify-center ${
                          isFilled
                            ? 'clay-btn-emerald scale-110'
                            : 'clay-well bg-slate-200/90'
                        }`}
                      >
                        {isFilled && <div className="w-2.5 h-2.5 bg-white rounded-full" />}
                      </div>
                    );
                  })}
                </div>
              </div>

              {/* Tactile Keypad 3x4 */}
              <div className="grid grid-cols-3 gap-2.5 max-w-[290px] mx-auto">
                {['1', '2', '3', '4', '5', '6', '7', '8', '9'].map((digit) => (
                  <button
                    key={digit}
                    type="button"
                    onClick={() => handleKeyPress(digit)}
                    disabled={isPinLocked}
                    className="h-14 clay-btn-neutral text-xl font-black text-slate-900 flex items-center justify-center cursor-pointer active:scale-95 transition-transform"
                  >
                    {digit}
                  </button>
                ))}

                <button
                  type="button"
                  onClick={handleClear}
                  disabled={isPinLocked}
                  className="h-14 clay-btn-neutral text-xs font-black text-rose-700 uppercase flex items-center justify-center cursor-pointer"
                >
                  Clear
                </button>

                <button
                  type="button"
                  onClick={() => handleKeyPress('0')}
                  disabled={isPinLocked}
                  className="h-14 clay-btn-neutral text-xl font-black text-slate-900 flex items-center justify-center cursor-pointer active:scale-95 transition-transform"
                >
                  0
                </button>

                <button
                  type="button"
                  onClick={handleDelete}
                  disabled={isPinLocked}
                  className="h-14 clay-btn-neutral text-slate-700 flex items-center justify-center cursor-pointer"
                  aria-label="Hapus satu angka"
                >
                  <Delete className="w-5 h-5" />
                </button>
              </div>
            </div>
          )}

          {/* TAB 2: NFC CARD SCANNER & SIMULATION */}
          {activeTab === 'nfc' && (
            <div className="space-y-4">
              {/* NFC Sensor Reader Visual Pad */}
              <div className="clay-panel p-5 text-center flex flex-col items-center justify-center relative overflow-hidden">
                <div className="w-16 h-16 rounded-3xl clay-btn-emerald flex items-center justify-center mb-3 animate-pulse shadow-md">
                  <Scan className="w-8 h-8 text-white stroke-[2.2]" />
                </div>
                <h4 className="text-sm font-black text-slate-900">
                  Tempelkan Kartu NFC ke Area Sensor
                </h4>
                <p className="text-xs text-slate-500 mt-1 max-w-xs leading-relaxed">
                  Mendukung kartu badge NFC fisik (Web NFC pada perangkat kompatibel) atau sentuh kartu simulasi di bawah ini.
                </p>
              </div>

              {/* Virtual NFC Cards for Immediate Touch Testing */}
              <div className="space-y-2">
                <span className="text-[11px] font-black uppercase tracking-wider text-slate-600 block px-1">
                  Kartu NFC Staff Terdaftar (Sentuh untuk Tap):
                </span>

                <div className="grid grid-cols-1 gap-2.5">
                  {DEFAULT_STAFF_ACCOUNTS.map((staff) => {
                    const isOwner = staff.role === 'owner';
                    const isCashier = staff.role === 'cashier';
                    return (
                      <button
                        key={staff.id}
                        type="button"
                        onClick={() => handleNfcAuth(staff.nfcTagUid)}
                        className={`w-full p-3.5 rounded-2xl flex items-center justify-between text-left cursor-pointer transition-all hover:scale-[1.01] ${
                          isOwner
                            ? 'clay-tint-amber border border-amber-300'
                            : isCashier
                            ? 'clay-tint-emerald border border-emerald-300'
                            : 'clay-tint-indigo border border-indigo-300'
                        }`}
                      >
                        <div className="flex items-center gap-3">
                          <div
                            className={`w-10 h-10 rounded-xl flex items-center justify-center text-white shrink-0 shadow-sm ${
                              isOwner
                                ? 'bg-amber-600'
                                : isCashier
                                ? 'bg-emerald-600'
                                : 'bg-indigo-600'
                            }`}
                          >
                            {isOwner ? (
                              <Crown className="w-5 h-5" />
                            ) : isCashier ? (
                              <CreditCard className="w-5 h-5" />
                            ) : (
                              <BarChart3 className="w-5 h-5" />
                            )}
                          </div>
                          <div>
                            <div className="flex items-center gap-2">
                              <span className="text-xs font-black text-slate-900">
                                {staff.name}
                              </span>
                              <span
                                className={`text-[10px] font-black px-1.5 py-0.5 rounded-md uppercase ${
                                  isOwner
                                    ? 'bg-amber-200 text-amber-900'
                                    : isCashier
                                    ? 'bg-emerald-200 text-emerald-900'
                                    : 'bg-indigo-200 text-indigo-900'
                                }`}
                              >
                                {staff.role}
                              </span>
                            </div>
                            <span className="text-[11px] font-mono text-slate-600">
                              UID: {staff.nfcTagUid} · {staff.roleLabel}
                            </span>
                          </div>
                        </div>

                        <span className="text-xs font-black text-emerald-800 bg-white/70 px-2.5 py-1 rounded-lg">
                          Tap Kartu →
                        </span>
                      </button>
                    );
                  })}
                </div>
              </div>
            </div>
          )}

          {/* Quick PIN Presets Bar (Always visible for fast testing) */}
          <div className="clay-well p-2.5 rounded-2xl space-y-1.5">
            <span className="text-[10px] font-black uppercase tracking-wider text-slate-500 block">
              Auto-Fill Akun Demo:
            </span>
            <div className="grid grid-cols-3 gap-1.5">
              <button
                type="button"
                onClick={() => handleQuickDemoStaff(DEFAULT_STAFF_ACCOUNTS[0])}
                disabled={isPinLocked}
                className="clay-btn-neutral min-h-[38px] px-2 py-1 text-[11px] font-black flex items-center justify-center gap-1 cursor-pointer"
              >
                <Crown className="w-3.5 h-3.5 text-amber-600" />
                <span>Owner (9999)</span>
              </button>

              <button
                type="button"
                onClick={() => handleQuickDemoStaff(DEFAULT_STAFF_ACCOUNTS[1])}
                disabled={isPinLocked}
                className="clay-btn-neutral min-h-[38px] px-2 py-1 text-[11px] font-black flex items-center justify-center gap-1 cursor-pointer"
              >
                <CreditCard className="w-3.5 h-3.5 text-emerald-600" />
                <span>Kasir (1234)</span>
              </button>

              <button
                type="button"
                onClick={() => handleQuickDemoStaff(DEFAULT_STAFF_ACCOUNTS[2])}
                disabled={isPinLocked}
                className="clay-btn-neutral min-h-[38px] px-2 py-1 text-[11px] font-black flex items-center justify-center gap-1 cursor-pointer"
              >
                <BarChart3 className="w-3.5 h-3.5 text-indigo-600" />
                <span>Finance (5678)</span>
              </button>
            </div>
          </div>

          {/* Error Feedback */}
          {errorMessage && !isPinLocked && (
            <div className="clay-tint-rose p-3 rounded-xl flex items-center gap-2.5 animate-bounce">
              <AlertCircle className="w-4 h-4 text-rose-700 shrink-0" />
              <span className="text-xs font-black text-rose-900">{errorMessage}</span>
            </div>
          )}

          {/* Success Animation */}
          {nfcSuccessAnimation && (
            <div className="clay-tint-emerald p-3.5 rounded-xl flex items-center gap-2.5 animate-pulse">
              <CheckCircle2 className="w-5 h-5 text-emerald-700 shrink-0" />
              <span className="text-xs font-black text-emerald-950">
                {nfcSuccessAnimation}
              </span>
            </div>
          )}
        </div>

        {/* Footer info */}
        <footer className="h-12 clay-bar px-6 flex items-center justify-between text-[11px] font-bold text-slate-500 shrink-0 border-t border-slate-200/80">
          <div className="flex items-center gap-1.5">
            <Sparkles className="w-3.5 h-3.5 text-emerald-600" />
            <span>Hak akses layar otomatis menyesuaikan Role</span>
          </div>
          <span className="font-mono">Security v2.4</span>
        </footer>
      </div>
    </div>
  );
};
