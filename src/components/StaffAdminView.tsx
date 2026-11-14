import React, { useCallback, useEffect, useState } from 'react';
import {
  Users,
  ShieldCheck,
  RefreshCw,
  AlertTriangle,
  UserPlus,
  KeyRound,
  Lock,
  Unlock,
  CheckCircle2,
  X,
} from 'lucide-react';
import { StaffAccount, UserRole } from '../types/pos';
import {
  DEFAULT_STAFF_ACCOUNTS,
  getRoleAvatarColor,
  getRoleLabel,
} from '../utils/authRoles';
import {
  AdminStaffRecord,
  createAdminStaff,
  fetchAdminStaff,
  getApiToken,
  updateAdminStaffPin,
  updateAdminStaffStatus,
} from '../services/posApi';

type Tab = 'staff' | 'matrix';

const ROLE_OPTIONS: { value: UserRole; label: string }[] = [
  { value: 'manager', label: 'Manager (Outlet Manager)' },
  { value: 'inventory', label: 'Staff Inventory (Gudang & Stok)' },
  { value: 'cashier', label: 'Cashier (Kasir POS)' },
  { value: 'waiter', label: 'Waiter (Pelayan / Checker)' },
  { value: 'kitchen', label: 'Kitchen (Dapur & Bar KDS)' },
  { value: 'finance', label: 'Finance (Pembukuan & PB1)' },
  { value: 'owner', label: 'Owner (Executive)' },
];

const matrix = [
  ['Cockpit Owner', '✓', '—', '—', '—', '—', '—', '—'],
  ['POS & Floor Plan', '✓', '✓', '—', '✓', '✓', '—', '—'],
  ['KDS & Checker', '✓', '✓', '—', '✓', '✓', '✓', '—'],
  ['Input Stok & Penerimaan (Qty + Value)', '✓', '✓', '✓', '—', '—', '—', '—'],
  ['Admin Inventory & Approval Opname', '✓', '✓', '—', '—', '—', '—', '—'],
  ['Manajemen Menu & Resep BOM', '✓', '✓', '—', '—', '—', '—', '—'],
  ['Pengaturan Sistem (App Settings)', '✓', '✓', '—', '—', '—', '—', '—'],
  ['Stok Menu', '✓', '✓', '✓', '✓', '✓', '—', '✓'],
  ['Pembayaran / Settlement', '✓', '✓', '—', '✓', '—', '—', '✓'],
  ['Pembukuan & PB1', '✓', '—', '—', '—', '—', '—', '✓'],
  ['Kas Kecil', '✓', '—', '—', '—', '—', '—', '✓'],
  ['Approval pembatalan', '✓', '✓', '—', '—', '—', '—', '—'],
  ['Tambah karyawan & role', '✓', '—', '—', '—', '—', '—', '—'],
  ['Set / ubah PIN karyawan', '✓', '—', '—', '—', '—', '—', '—'],
  ['Blokir / buka blokir akun & cabut sesi', '✓', '—', '—', '—', '—', '—', '—'],
];

export interface StaffAdminViewProps {
  currentStaff: StaffAccount;
  onLockScreen: () => void;
  staffAccounts?: StaffAccount[];
  onCreateLocalStaff?: (payload: {
    displayName: string;
    roleCode: UserRole;
    pin: string;
    email?: string;
    phone?: string;
    nfcUid?: string;
  }) => StaffAccount;
  onUpdateLocalStaffPin?: (staffId: string, pin: string) => void;
  onUpdateLocalStaffStatus?: (staffId: string, status: 'active' | 'suspended') => void;
}

function mapLocalToAdminRecord(account: StaffAccount & { email?: string; phone?: string; createdAt?: string }): AdminStaffRecord {
  const isActive = account.isActive !== false && (!account.status || account.status === 'active');
  return {
    id: account.id,
    display_name: account.name,
    email: account.email || null,
    phone: account.phone || null,
    role_code: account.role,
    status: isActive ? 'active' : account.status || 'suspended',
    is_active: isActive,
    has_pin: Boolean(account.pin),
    has_nfc: Boolean(account.nfcTagUid),
    created_at: account.createdAt || new Date().toISOString(),
  };
}

export const StaffAdminView: React.FC<StaffAdminViewProps> = ({
  currentStaff,
  onLockScreen,
  staffAccounts,
  onCreateLocalStaff,
  onUpdateLocalStaffPin,
  onUpdateLocalStaffStatus,
}) => {
  const [tab, setTab] = useState<Tab>('staff');
  const [staff, setStaff] = useState<AdminStaffRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');
  const [successMessage, setSuccessMessage] = useState('');
  const [isApiMode, setIsApiMode] = useState<boolean>(() => Boolean(getApiToken()));

  // Create Staff Form State
  const [newName, setNewName] = useState('');
  const [newRole, setNewRole] = useState<UserRole>('cashier');
  const [newPin, setNewPin] = useState('');
  const [newEmail, setNewEmail] = useState('');
  const [newPhone, setNewPhone] = useState('');
  const [newNfcUid, setNewNfcUid] = useState('');

  // Change PIN Modal / Inline State
  const [editingPinStaff, setEditingPinStaff] = useState<AdminStaffRecord | null>(null);
  const [updatedPinValue, setUpdatedPinValue] = useState('');

  const getLocalAccounts = useCallback((): StaffAccount[] => {
    if (staffAccounts && staffAccounts.length > 0) return staffAccounts;
    try {
      const saved = localStorage.getItem('resto_pos_staff_accounts_v1');
      if (saved) {
        const parsed = JSON.parse(saved);
        if (Array.isArray(parsed) && parsed.length > 0) return parsed;
      }
    } catch {}
    return DEFAULT_STAFF_ACCOUNTS;
  }, [staffAccounts]);

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    const hasToken = Boolean(getApiToken());
    if (hasToken) {
      try {
        const rows = await fetchAdminStaff();
        setStaff(rows);
        setIsApiMode(true);
        setLoading(false);
        return;
      } catch (e) {
        setError(e instanceof Error ? e.message : 'Gagal memuat direktori staff dari API.');
      }
    }
    setIsApiMode(false);
    setStaff(getLocalAccounts().map(mapLocalToAdminRecord));
    setLoading(false);
  }, [getLocalAccounts]);

  useEffect(() => {
    void load();
  }, [load]);

  const handleCreateStaff = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setSuccessMessage('');

    const displayName = newName.trim();
    const pin = newPin.trim();
    const email = newEmail.trim();
    const phone = newPhone.trim();
    const nfcUid = newNfcUid.trim().toUpperCase();

    if (!displayName) {
      setError('Nama lengkap karyawan wajib diisi.');
      return;
    }
    if (!/^\d{4,8}$/.test(pin)) {
      setError('PIN Baru harus terdiri dari 4–8 digit angka.');
      return;
    }
    if (email && !/^\S+@\S+\.\S+$/.test(email)) {
      setError('Format email tidak valid.');
      return;
    }

    setSubmitting(true);
    try {
      const localList = getLocalAccounts();
      if (localList.some((acc) => acc.pin === pin)) {
        throw new Error('PIN ini sudah digunakan oleh akun lain. Gunakan PIN lain yang unik.');
      }

      if (getApiToken()) {
        await createAdminStaff({
          displayName,
          roleCode: newRole,
          pin,
          email: email || undefined,
          phone: phone || undefined,
          nfcUid: nfcUid || undefined,
        });
        if (onCreateLocalStaff) {
          onCreateLocalStaff({
            displayName,
            roleCode: newRole,
            pin,
            email: email || undefined,
            phone: phone || undefined,
            nfcUid: nfcUid || undefined,
          });
        }
        await load();
      } else {
        if (onCreateLocalStaff) {
          onCreateLocalStaff({
            displayName,
            roleCode: newRole,
            pin,
            email: email || undefined,
            phone: phone || undefined,
            nfcUid: nfcUid || undefined,
          });
        } else {
          const created: StaffAccount = {
            id: `staff-${Date.now()}`,
            name: displayName,
            role: newRole,
            pin,
            nfcTagUid: nfcUid || `NFC-${newRole.toUpperCase()}-${pin.slice(0, 2)}`,
            avatarColor: getRoleAvatarColor(newRole),
            roleLabel: getRoleLabel(newRole),
            status: 'active',
            isActive: true,
          };
          const next = [...localList, created];
          localStorage.setItem('resto_pos_staff_accounts_v1', JSON.stringify(next));
          setStaff(next.map(mapLocalToAdminRecord));
        }
      }
      setNewName('');
      setNewPin('');
      setNewEmail('');
      setNewPhone('');
      setNewNfcUid('');
      setSuccessMessage(`Karyawan baru "${displayName}" (${newRole.toUpperCase()}) berhasil ditambahkan dengan PIN aktif.`);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Gagal menyimpan karyawan baru.');
    } finally {
      setSubmitting(false);
    }
  };

  const handleSaveNewPin = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingPinStaff) return;
    setError('');
    setSuccessMessage('');

    const cleanPin = updatedPinValue.trim();
    if (!/^\d{4,8}$/.test(cleanPin)) {
      setError('PIN baru harus terdiri dari 4–8 digit angka.');
      return;
    }

    setSubmitting(true);
    try {
      const localList = getLocalAccounts();
      const existingAccount = localList.find((acc) => acc.pin === cleanPin);
      if (existingAccount) {
        if (existingAccount.id === editingPinStaff.id) {
          throw new Error('PIN baru tidak boleh sama dengan PIN saat ini.');
        } else {
          throw new Error('PIN ini sudah digunakan oleh akun lain. Gunakan PIN lain yang unik.');
        }
      }

      if (getApiToken()) {
        await updateAdminStaffPin(editingPinStaff.id, cleanPin);
        if (onUpdateLocalStaffPin) {
          onUpdateLocalStaffPin(editingPinStaff.id, cleanPin);
        }
        await load();
      } else {
        if (onUpdateLocalStaffPin) {
          onUpdateLocalStaffPin(editingPinStaff.id, cleanPin);
        } else {
          const next = localList.map((acc) =>
            acc.id === editingPinStaff.id ? { ...acc, pin: cleanPin } : acc
          );
          localStorage.setItem('resto_pos_staff_accounts_v1', JSON.stringify(next));
          setStaff(next.map(mapLocalToAdminRecord));
        }
      }
      setSuccessMessage(`PIN untuk "${editingPinStaff.display_name}" berhasil diperbarui.`);
      setEditingPinStaff(null);
      setUpdatedPinValue('');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Gagal mengubah PIN karyawan.');
    } finally {
      setSubmitting(false);
    }
  };

  const handleToggleAccountStatus = async (target: AdminStaffRecord) => {
    setError('');
    setSuccessMessage('');

    const currentlyActive = target.status === 'active' && target.is_active !== false;
    const nextStatus: 'active' | 'suspended' = currentlyActive ? 'suspended' : 'active';

    if (target.id === currentStaff.id && nextStatus !== 'active') {
      setError('Tidak dapat memblokir akun Owner yang sedang digunakan.');
      return;
    }

    setSubmitting(true);
    try {
      if (getApiToken()) {
        await updateAdminStaffStatus(target.id, nextStatus);
        if (onUpdateLocalStaffStatus) {
          onUpdateLocalStaffStatus(target.id, nextStatus);
        }
        await load();
      } else {
        if (onUpdateLocalStaffStatus) {
          onUpdateLocalStaffStatus(target.id, nextStatus);
        } else {
          const localList = getLocalAccounts();
          const next = localList.map((acc) =>
            acc.id === target.id
              ? {
                  ...acc,
                  status: (nextStatus === 'active' ? 'active' : 'blocked') as 'active' | 'blocked',
                  isActive: nextStatus === 'active',
                }
              : acc
          );
          localStorage.setItem('resto_pos_staff_accounts_v1', JSON.stringify(next));
          setStaff(next.map(mapLocalToAdminRecord));
        }
      }
      setSuccessMessage(
        nextStatus === 'active'
          ? `Akun "${target.display_name}" berhasil dibuka blokirnya (AKTIF).`
          : `Akun "${target.display_name}" berhasil diblokir (DIBLOKIR) dan sesi aktif telah dicabut.`
      );
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Gagal memperbarui status akun karyawan.');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="flex-1 min-h-0 overflow-y-auto clay-canvas p-4 sm:p-6 space-y-5">
      <header className="clay-bar rounded-2xl p-5 flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <div className="w-12 h-12 clay-btn-emerald flex items-center justify-center">
            <ShieldCheck className="w-6 h-6 text-white" />
          </div>
          <div>
            <h2 className="text-lg font-black text-slate-900">
              Manajemen Karyawan & Kontrol Akun (Owner)
            </h2>
            <p className="text-xs text-slate-600">
              Tambah karyawan baru, atur/reset PIN 4–8 digit, dan blokir/buka blokir akses akun POS ·{' '}
              <span className="font-bold text-emerald-700">
                {isApiMode ? 'Mode API PostgreSQL Terhubung' : 'Mode QA / Lokal Aktif'}
              </span>
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <span className="text-xs font-bold text-slate-600">
            {currentStaff.name} · {currentStaff.roleLabel || currentStaff.role}
          </span>
          <button
            type="button"
            onClick={onLockScreen}
            className="clay-btn-neutral px-3 py-2 text-xs font-bold cursor-pointer"
          >
            Kunci layar
          </button>
        </div>
      </header>

      <div className="clay-panel p-1.5 flex gap-1 w-fit">
        <button
          type="button"
          onClick={() => setTab('staff')}
          className={`px-4 py-2 rounded-xl text-xs font-black cursor-pointer ${
            tab === 'staff' ? 'clay-btn-dark text-white' : 'text-slate-600'
          }`}
        >
          <Users className="inline w-4 h-4 mr-1" /> Direktori & Kontrol Akun
        </button>
        <button
          type="button"
          onClick={() => setTab('matrix')}
          className={`px-4 py-2 rounded-xl text-xs font-black cursor-pointer ${
            tab === 'matrix' ? 'clay-btn-dark text-white' : 'text-slate-600'
          }`}
        >
          <ShieldCheck className="inline w-4 h-4 mr-1" /> Matrix Role
        </button>
      </div>

      {error && (
        <div
          role="alert"
          className="rounded-xl border border-rose-300 bg-rose-50 p-3 text-sm text-rose-900 font-semibold flex items-center justify-between gap-2"
        >
          <div className="flex items-center gap-2">
            <AlertTriangle className="w-4 h-4 shrink-0 text-rose-700" />
            <span>{error}</span>
          </div>
          <button
            type="button"
            onClick={() => setError('')}
            className="text-xs font-bold text-rose-700 hover:underline cursor-pointer"
          >
            Tutup
          </button>
        </div>
      )}

      {successMessage && (
        <div
          role="status"
          className="rounded-xl border border-emerald-300 bg-emerald-50 p-3 text-sm text-emerald-950 font-semibold flex items-center justify-between gap-2"
        >
          <div className="flex items-center gap-2">
            <CheckCircle2 className="w-4 h-4 shrink-0 text-emerald-700" />
            <span>{successMessage}</span>
          </div>
          <button
            type="button"
            onClick={() => setSuccessMessage('')}
            className="text-xs font-bold text-emerald-800 hover:underline cursor-pointer"
          >
            Tutup
          </button>
        </div>
      )}

      {tab === 'staff' ? (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-5 items-start">
          {/* FORM TAMBAH KARYAWAN BARU */}
          <section className="clay-panel p-5 space-y-4 lg:col-span-1">
            <div className="flex items-center gap-2.5">
              <div className="w-9 h-9 rounded-xl clay-btn-emerald flex items-center justify-center text-white">
                <UserPlus className="w-4 h-4" />
              </div>
              <div>
                <h3 className="font-black text-slate-900 text-sm">
                  Tambah Karyawan Baru
                </h3>
                <p className="text-[11px] text-slate-500">
                  Buat akun staff baru beserta PIN login 4–8 digit
                </p>
              </div>
            </div>

            <form onSubmit={handleCreateStaff} className="space-y-3">
              <div>
                <label className="block text-xs font-extrabold text-slate-700 mb-1">
                  Nama Lengkap Karyawan *
                </label>
                <input
                  type="text"
                  required
                  maxLength={120}
                  value={newName}
                  onChange={(e) => setNewName(e.target.value)}
                  placeholder="Contoh: Andi Pratama"
                  className="w-full clay-well px-3 py-2.5 rounded-xl text-sm font-semibold text-slate-900 focus:outline-none"
                />
              </div>

              <div>
                <label className="block text-xs font-extrabold text-slate-700 mb-1">
                  Role / Jabatan Operasional *
                </label>
                <select
                  value={newRole}
                  onChange={(e) => setNewRole(e.target.value as UserRole)}
                  className="w-full clay-well px-3 py-2.5 rounded-xl text-sm font-bold text-slate-900 focus:outline-none"
                >
                  {ROLE_OPTIONS.map((opt) => (
                    <option key={opt.value} value={opt.value}>
                      {opt.label}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-xs font-extrabold text-slate-700 mb-1">
                  PIN Login Baru (4–8 Digit Angka) *
                </label>
                <input
                  type="password"
                  inputMode="numeric"
                  required
                  minLength={4}
                  maxLength={8}
                  pattern="\d{4,8}"
                  value={newPin}
                  onChange={(e) => setNewPin(e.target.value.replace(/\D/g, '').slice(0, 8))}
                  placeholder="Masukkan 4–8 digit angka (mis. 2468)"
                  className="w-full clay-well px-3 py-2.5 rounded-xl text-sm font-mono font-bold text-slate-900 focus:outline-none"
                />
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                <div>
                  <label className="block text-[11px] font-bold text-slate-600 mb-1">
                    Email (Opsional)
                  </label>
                  <input
                    type="email"
                    value={newEmail}
                    onChange={(e) => setNewEmail(e.target.value)}
                    placeholder="nama@resto.id"
                    className="w-full clay-well px-3 py-2 rounded-xl text-xs font-semibold text-slate-900 focus:outline-none"
                  />
                </div>
                <div>
                  <label className="block text-[11px] font-bold text-slate-600 mb-1">
                    No. Telepon (Opsional)
                  </label>
                  <input
                    type="tel"
                    value={newPhone}
                    onChange={(e) => setNewPhone(e.target.value)}
                    placeholder="0812xxxx"
                    className="w-full clay-well px-3 py-2 rounded-xl text-xs font-semibold text-slate-900 focus:outline-none"
                  />
                </div>
              </div>

              <div>
                <label className="block text-[11px] font-bold text-slate-600 mb-1">
                  UID Kartu NFC (Opsional)
                </label>
                <input
                  type="text"
                  value={newNfcUid}
                  onChange={(e) => setNewNfcUid(e.target.value.toUpperCase())}
                  placeholder="Contoh: NFC-WAITER-01"
                  className="w-full clay-well px-3 py-2 rounded-xl text-xs font-mono font-semibold text-slate-900 focus:outline-none"
                />
              </div>

              <button
                type="submit"
                disabled={submitting}
                className="w-full min-h-[44px] clay-btn-emerald text-white text-xs font-black uppercase tracking-wider cursor-pointer disabled:opacity-50 flex items-center justify-center gap-2"
              >
                <UserPlus className="w-4 h-4" />
                <span>{submitting ? 'Menyimpan...' : 'Simpan Karyawan Baru'}</span>
              </button>
            </form>
          </section>

          {/* DAFTAR KARYAWAN & KONTROL PIN / BLOKIR AKUN */}
          <section className="clay-panel p-5 space-y-4 lg:col-span-2">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div>
                <h3 className="font-black text-slate-900">
                  Daftar Karyawan ({staff.length})
                </h3>
                <p className="text-xs text-slate-500">
                  Kelola PIN login atau blokir/aktifkan kembali akun karyawan
                </p>
              </div>
              <button
                type="button"
                onClick={() => void load()}
                disabled={loading || submitting}
                className="clay-btn-neutral px-3 py-2 text-xs font-bold disabled:opacity-50 cursor-pointer"
              >
                <RefreshCw className="inline w-3.5 h-3.5 mr-1" /> Refresh
              </button>
            </div>

            {editingPinStaff && (
              <form
                onSubmit={handleSaveNewPin}
                className="rounded-2xl border border-emerald-300 bg-emerald-50/90 p-4 space-y-3"
              >
                <div className="flex items-center justify-between gap-2">
                  <div className="flex items-center gap-2">
                    <KeyRound className="w-4 h-4 text-emerald-700" />
                    <span className="text-xs font-black text-slate-900">
                      Set / Ubah PIN Baru untuk: {editingPinStaff.display_name} ({editingPinStaff.role_code.toUpperCase()})
                    </span>
                  </div>
                  <button
                    type="button"
                    onClick={() => {
                      setEditingPinStaff(null);
                      setUpdatedPinValue('');
                    }}
                    className="p-1 text-slate-500 hover:text-slate-800 cursor-pointer"
                    aria-label="Tutup form ubah PIN"
                  >
                    <X className="w-4 h-4" />
                  </button>
                </div>
                <div className="flex flex-wrap items-center gap-2.5">
                  <input
                    type="password"
                    inputMode="numeric"
                    required
                    minLength={4}
                    maxLength={8}
                    pattern="\d{4,8}"
                    value={updatedPinValue}
                    onChange={(e) => setUpdatedPinValue(e.target.value.replace(/\D/g, '').slice(0, 8))}
                    placeholder="Ketik PIN baru 4–8 digit angka"
                    className="flex-1 min-w-[200px] clay-well bg-white px-3 py-2 rounded-xl text-sm font-mono font-bold text-slate-900 focus:outline-none"
                  />
                  <button
                    type="submit"
                    disabled={submitting}
                    className="clay-btn-emerald px-4 py-2 text-xs font-black text-white cursor-pointer disabled:opacity-50"
                  >
                    Simpan PIN Baru
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setEditingPinStaff(null);
                      setUpdatedPinValue('');
                    }}
                    className="clay-btn-neutral px-3 py-2 text-xs font-bold cursor-pointer"
                  >
                    Batal
                  </button>
                </div>
              </form>
            )}

            {loading ? (
              <p className="text-sm text-slate-500 p-4">Memuat data staff…</p>
            ) : staff.length === 0 ? (
              <p className="text-sm text-slate-500 p-4">Belum ada staff pada outlet ini.</p>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="text-left text-[10px] text-slate-500 uppercase border-b border-slate-200">
                      <th className="p-2.5">Nama Karyawan</th>
                      <th className="p-2.5">Role</th>
                      <th className="p-2.5">Kontak</th>
                      <th className="p-2.5">Kredensial</th>
                      <th className="p-2.5">Status Akun</th>
                      <th className="p-2.5 text-right">Aksi Kontrol</th>
                    </tr>
                  </thead>
                  <tbody>
                    {staff.map((s) => {
                      const isActive = s.status === 'active' && s.is_active !== false;
                      const isSelf = s.id === currentStaff.id;
                      return (
                        <tr key={s.id} className="border-b border-slate-200/80 hover:bg-white/40">
                          <td className="p-2.5">
                            <div className="font-bold text-slate-900">{s.display_name}</div>
                            {isSelf && (
                              <span className="text-[10px] font-extrabold text-amber-700 uppercase">
                                Akun Anda
                              </span>
                            )}
                          </td>
                          <td className="p-2.5">
                            <span className="px-2 py-0.5 rounded-md bg-slate-200/80 text-slate-800 text-xs font-bold uppercase">
                              {s.role_code}
                            </span>
                          </td>
                          <td className="p-2.5 text-xs text-slate-600">
                            {s.email || s.phone || '—'}
                          </td>
                          <td className="p-2.5 text-xs font-semibold text-slate-700">
                            {s.has_pin ? 'PIN ✓' : 'PIN —'} · {s.has_nfc ? 'NFC ✓' : 'NFC —'}
                          </td>
                          <td className="p-2.5">
                            {isActive ? (
                              <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[11px] font-black bg-emerald-100 text-emerald-800 border border-emerald-300">
                                AKTIF
                              </span>
                            ) : (
                              <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[11px] font-black bg-rose-100 text-rose-800 border border-rose-300">
                                DIBLOKIR
                              </span>
                            )}
                          </td>
                          <td className="p-2.5 text-right">
                            <div className="inline-flex flex-wrap items-center justify-end gap-1.5">
                              <button
                                type="button"
                                disabled={submitting}
                                onClick={() => {
                                  setEditingPinStaff(s);
                                  setUpdatedPinValue('');
                                  setError('');
                                  setSuccessMessage('');
                                }}
                                className="clay-btn-neutral px-2.5 py-1.5 text-xs font-bold flex items-center gap-1 cursor-pointer disabled:opacity-50"
                              >
                                <KeyRound className="w-3.5 h-3.5 text-emerald-700" />
                                <span>Ubah PIN</span>
                              </button>

                              {isActive ? (
                                <button
                                  type="button"
                                  disabled={submitting || isSelf}
                                  onClick={() => void handleToggleAccountStatus(s)}
                                  title={
                                    isSelf
                                      ? 'Tidak dapat memblokir akun Owner yang sedang digunakan'
                                      : 'Blokir akun dan cabut sesi login karyawan ini'
                                  }
                                  className="clay-btn-rose px-2.5 py-1.5 text-xs font-bold text-white flex items-center gap-1 cursor-pointer disabled:opacity-40"
                                >
                                  <Lock className="w-3.5 h-3.5" />
                                  <span>Blokir Akun</span>
                                </button>
                              ) : (
                                <button
                                  type="button"
                                  disabled={submitting}
                                  onClick={() => void handleToggleAccountStatus(s)}
                                  className="clay-btn-emerald px-2.5 py-1.5 text-xs font-bold text-white flex items-center gap-1 cursor-pointer disabled:opacity-50"
                                >
                                  <Unlock className="w-3.5 h-3.5" />
                                  <span>Buka Blokir (Aktifkan)</span>
                                </button>
                              )}
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </section>
        </div>
      ) : (
        <section className="clay-panel p-4 overflow-x-auto">
          <h3 className="font-black text-slate-900 mb-1">Matrix Hak Akses Role POS</h3>
          <p className="text-xs text-slate-500 mb-4">
            Hak akses operasional dipisahkan berdasarkan 7 role standar Gastro-Cashier.
          </p>
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-xs uppercase text-slate-500 border-b">
                <th className="p-3">Fitur</th>
                <th className="p-3">Owner</th>
                <th className="p-3">Manager</th>
                <th className="p-3">Inventory</th>
                <th className="p-3">Cashier</th>
                <th className="p-3">Waiter</th>
                <th className="p-3">Kitchen</th>
                <th className="p-3">Finance</th>
              </tr>
            </thead>
            <tbody>
              {matrix.map((row) => (
                <tr key={row[0]} className="border-b border-slate-100">
                  <td className="p-3 font-semibold">{row[0]}</td>
                  {row.slice(1).map((value, index) => (
                    <td
                      key={index}
                      className={`p-3 font-black ${
                        value === '✓'
                          ? 'text-emerald-700'
                          : value === '—'
                          ? 'text-slate-300'
                          : 'text-amber-700'
                      }`}
                    >
                      {value}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </section>
      )}
    </div>
  );
};
