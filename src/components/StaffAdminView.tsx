import React, { useCallback, useEffect, useState } from 'react';
import { Users, ShieldCheck, RefreshCw, AlertTriangle } from 'lucide-react';
import { StaffAccount } from '../types/pos';

type AdminStaff = {
  id: string;
  display_name: string;
  email: string | null;
  phone: string | null;
  role_code: string;
  status: string;
  has_pin: boolean;
  has_nfc: boolean;
  created_at: string;
};

type Tab = 'staff' | 'matrix';
const API = '/api/admin/staff';
const matrix = [
  ['Cockpit Owner','✓','—','—'],
  ['POS & Floor Plan','✓','✓','—'],
  ['KDS & Checker','✓','✓','—'],
  ['Stok Menu','✓','✓','✓'],
  ['Pembayaran / Settlement','✓','✓','—'],
  ['Pembukuan & PB1','✓','—','✓'],
  ['Kas Kecil','✓','—','✓'],
  ['Approval pembatalan','✓','—','—'],
  ['Kelola staff & role','READ ONLY','—','—'],
  ['Reset / enrollment PIN','READ ONLY','—','—'],
  ['Enrollment / cabut NFC','READ ONLY','—','—'],
  ['Nonaktifkan & cabut sesi staff','READ ONLY','—','—'],
];

function authHeaders() {
  const token = localStorage.getItem('gastro_cashier_api_token');
  return { 'Content-Type': 'application/json', ...(token ? { Authorization: 'Bearer ' + token } : {}) };
}

export const StaffAdminView: React.FC<{ currentStaff: StaffAccount; onLockScreen: () => void }> = ({ currentStaff, onLockScreen }) => {
  const [tab, setTab] = useState<Tab>('staff');
  const [staff, setStaff] = useState<AdminStaff[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const response = await fetch(API, { headers: authHeaders() });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || 'Gagal memuat direktori staff.');
      if (!Array.isArray(data)) throw new Error('Format direktori staff dari server tidak valid.');
      setStaff(data);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Gagal memuat direktori staff.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void load(); }, [load]);

  return (
    <div className="flex-1 min-h-0 overflow-y-auto clay-canvas p-4 sm:p-6 space-y-5">
      <header className="clay-bar rounded-2xl p-5 flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <div className="w-12 h-12 clay-btn-emerald flex items-center justify-center">
            <ShieldCheck className="w-6 h-6 text-white" />
          </div>
          <div>
            <h2 className="text-lg font-black text-slate-900">Admin & Manajemen Staff</h2>
            <p className="text-xs text-slate-600">Direktori dan matriks hak akses</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <span className="text-xs font-bold text-slate-600">{currentStaff.name} · {currentStaff.roleLabel || currentStaff.role}</span>
          <button onClick={onLockScreen} className="clay-btn-neutral px-3 py-2 text-xs font-bold">Kunci layar</button>
        </div>
      </header>

      <div className="rounded-xl border border-amber-300 bg-amber-50 text-amber-950 p-3 text-sm flex gap-2">
        <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />
        Emergency release aktif: direktori hanya-baca. Pembuatan akun, perubahan role, reset PIN, dan enrollment NFC dinonaktifkan di backend serta database.
      </div>

      <div className="clay-panel p-1.5 flex gap-1 w-fit">
        <button onClick={() => setTab('staff')} className={`px-4 py-2 rounded-xl text-xs font-black ${tab === 'staff' ? 'clay-btn-dark text-white' : 'text-slate-600'}`}>
          <Users className="inline w-4 h-4 mr-1" /> Direktori Staff
        </button>
        <button onClick={() => setTab('matrix')} className={`px-4 py-2 rounded-xl text-xs font-black ${tab === 'matrix' ? 'clay-btn-dark text-white' : 'text-slate-600'}`}>
          <ShieldCheck className="inline w-4 h-4 mr-1" /> Matrix Role
        </button>
      </div>

      {error && <div role="alert" className="rounded-xl bg-rose-50 p-3 text-sm text-rose-900 flex gap-2"><AlertTriangle className="w-4 h-4 shrink-0" />{error}</div>}

      {tab === 'staff' ? (
        <section className="clay-panel p-4 space-y-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h3 className="font-black text-slate-900">Daftar Staff ({staff.length})</h3>
            <button onClick={() => void load()} disabled={loading} className="clay-btn-neutral px-3 py-2 text-xs font-bold disabled:opacity-50">
              <RefreshCw className="inline w-3.5 h-3.5 mr-1" /> Refresh
            </button>
          </div>
          {loading ? <p className="text-sm text-slate-500 p-4">Memuat data staff…</p> :
            staff.length === 0 ? <p className="text-sm text-slate-500 p-4">Belum ada staff pada outlet ini.</p> :
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead><tr className="text-left text-[10px] text-slate-500 uppercase border-b">
                  <th className="p-2">Nama</th><th className="p-2">Role</th><th className="p-2">Kontak</th><th className="p-2">Credential</th><th className="p-2">Status</th>
                </tr></thead>
                <tbody>{staff.map(s => (
                  <tr key={s.id} className="border-b border-slate-200">
                    <td className="p-2"><b>{s.display_name}</b></td>
                    <td className="p-2 capitalize">{s.role_code}</td>
                    <td className="p-2 text-xs">{s.email || s.phone || '—'}</td>
                    <td className="p-2 text-xs">{s.has_pin ? 'PIN ✓' : 'PIN —'} · {s.has_nfc ? 'NFC ✓' : 'NFC —'}</td>
                    <td className="p-2"><span className={s.status === 'active' ? 'text-emerald-700' : 'text-rose-700'}>{s.status}</span></td>
                  </tr>
                ))}</tbody>
              </table>
            </div>}
        </section>
      ) : (
        <section className="clay-panel p-4 overflow-x-auto">
          <h3 className="font-black text-slate-900 mb-1">Matrix Hak Akses</h3>
          <p className="text-xs text-slate-500 mb-4">Hak akses operasional dipisahkan berdasarkan role. Mutasi staff tetap dikunci pada emergency release.</p>
          <table className="w-full text-sm">
            <thead><tr className="text-left text-xs uppercase text-slate-500 border-b">
              <th className="p-3">Fitur</th><th className="p-3">Owner</th><th className="p-3">Cashier</th><th className="p-3">Finance</th>
            </tr></thead>
            <tbody>{matrix.map(row => (
              <tr key={row[0]} className="border-b border-slate-100">
                <td className="p-3 font-semibold">{row[0]}</td>
                {row.slice(1).map((value, index) => (
                  <td key={index} className={`p-3 font-black ${value === '✓' ? 'text-emerald-700' : value === '—' ? 'text-slate-300' : 'text-amber-700'}`}>{value}</td>
                ))}
              </tr>
            ))}</tbody>
          </table>
        </section>
      )}
    </div>
  );
};
