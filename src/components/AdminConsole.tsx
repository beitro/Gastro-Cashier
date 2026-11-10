import React, { useMemo, useState } from 'react';
import { Activity, Building2, Check, CircleUserRound, KeyRound, Plus, ShieldCheck, Users, X } from 'lucide-react';
import { StaffAccount, UserRole } from '../types/pos';

type AdminTab = 'overview' | 'staff' | 'permissions' | 'outlets' | 'sessions' | 'audit';
type ManagedStaff = { id: string; name: string; role: UserRole; outlet: string; active: boolean; createdAt: string };

const STORAGE_KEY = 'restopos_admin_staff_demo_v1';
const seed: ManagedStaff[] = [
  { id: 'staff-owner-01', name: 'Hendrawan Kusuma', role: 'owner', outlet: 'Outlet Utama', active: true, createdAt: 'Akun demo' },
  { id: 'staff-cashier-01', name: 'Budi Prasetyo', role: 'cashier', outlet: 'Outlet Utama', active: true, createdAt: 'Akun demo' },
  { id: 'staff-finance-01', name: 'Ratna Dewi', role: 'finance', outlet: 'Outlet Utama', active: true, createdAt: 'Akun demo' },
];
const tabs: { id: AdminTab; label: string; icon: React.ReactNode }[] = [
  { id: 'overview', label: 'Ringkasan', icon: <Activity size={16}/> },
  { id: 'staff', label: 'Staff', icon: <Users size={16}/> },
  { id: 'permissions', label: 'Role Matrix', icon: <ShieldCheck size={16}/> },
  { id: 'outlets', label: 'Outlet', icon: <Building2 size={16}/> },
  { id: 'sessions', label: 'Sesi', icon: <KeyRound size={16}/> },
  { id: 'audit', label: 'Audit Log', icon: <CircleUserRound size={16}/> },
];
const roleLabel: Record<UserRole,string> = { owner: 'Owner', cashier: 'Cashier', finance: 'Finance' };

export const AdminConsole: React.FC<{ currentStaff: StaffAccount }> = ({ currentStaff }) => {
  const [tab,setTab] = useState<AdminTab>('overview');
  const [staff,setStaff] = useState<ManagedStaff[]>(() => {
    try { const raw=localStorage.getItem(STORAGE_KEY); if(raw) return JSON.parse(raw) as ManagedStaff[]; } catch {}
    return seed;
  });
  const [name,setName] = useState('');
  const [role,setRole] = useState<UserRole>('cashier');
  const [outlet,setOutlet] = useState('Outlet Utama');
  const [showForm,setShowForm] = useState(false);
  const [notice,setNotice] = useState('Panel demo lokal — perubahan hanya tersimpan di browser ini.');
  const [events,setEvents] = useState<string[]>(['Admin console dibuka oleh '+currentStaff.name]);
  const activeCount=useMemo(()=>staff.filter(s=>s.active).length,[staff]);
  const persist=(next:ManagedStaff[])=>{setStaff(next);try{localStorage.setItem(STORAGE_KEY,JSON.stringify(next));}catch{}};
  const addStaff=()=> {
    if(!name.trim()) return;
    const item:ManagedStaff={id:'demo-'+Date.now(),name:name.trim(),role,outlet,active:true,createdAt:new Date().toLocaleString('id-ID')};
    persist([...staff,item]); setEvents(prev=>['Akun demo dibuat: '+item.name,...prev]); setName('');setShowForm(false);
    setNotice('Akun demo ditambahkan. PIN/NFC dan autentikasi backend belum dikonfigurasi.');
  };
  const toggleStaff=(item:ManagedStaff)=> {
    if(item.role==='owner' && item.active && staff.filter(s=>s.role==='owner'&&s.active).length===1){setNotice('Tidak bisa menonaktifkan satu-satunya Owner aktif.');return;}
    persist(staff.map(s=>s.id===item.id?{...s,active:!s.active}:s));
    setEvents(prev=>[(item.active?'Akun dinonaktifkan: ':'Akun diaktifkan: ')+item.name,...prev]);
  };
  const permissionRows=[
    ['Cockpit Owner',true,false,false],['Admin & Staff',true,false,false],['Floor Plan',true,true,false],
    ['KDS & Checker',true,true,false],['Stok Menu',true,true,true],['Pembukuan & PB1',true,false,true],
    ['Kelola outlet',true,false,false],['Audit & sesi staff',true,false,false],
  ];
  return <div className="flex-1 min-h-0 overflow-y-auto bg-slate-100/70 p-4 sm:p-6">
    <div className="max-w-7xl mx-auto space-y-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div><div className="text-xs font-black uppercase tracking-[.18em] text-amber-700">Owner workspace</div><h1 className="text-2xl sm:text-3xl font-black text-slate-900 mt-1">Admin & Staff</h1><p className="text-sm text-slate-500 mt-1">Kontrol akses, keanggotaan outlet, dan aktivitas operasional.</p></div>
        <div className="rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-xs font-bold text-amber-900">Demo lokal · bukan kontrol produksi</div>
      </div>
      <div className="flex gap-2 overflow-x-auto pb-1">{tabs.map(t=><button key={t.id} onClick={()=>setTab(t.id)} className={`shrink-0 inline-flex items-center gap-2 rounded-xl px-3 py-2.5 text-sm font-bold ${tab===t.id?'bg-slate-900 text-white shadow':'bg-white text-slate-600 border border-slate-200'}`}>{t.icon}{t.label}</button>)}</div>
      <div className="text-xs rounded-xl bg-white border border-slate-200 px-4 py-3 text-slate-600">{notice}</div>
      {tab==='overview'&&<><div className="grid grid-cols-1 sm:grid-cols-3 gap-3">{[['Total Staff',staff.length,'users'],['Staff Aktif',activeCount,'check'],['Outlet Terdaftar',1,'store']].map(([label,value])=><div key={String(label)} className="rounded-2xl bg-white border border-slate-200 p-5"><div className="text-sm text-slate-500">{label}</div><div className="text-3xl font-black text-slate-900 mt-2">{value}</div></div>)}</div><div className="grid lg:grid-cols-2 gap-4"><section className="rounded-2xl bg-white border border-slate-200 p-5"><h2 className="font-black text-slate-900">Akses cepat</h2><div className="grid grid-cols-2 gap-2 mt-4">{tabs.slice(1).map(t=><button key={t.id} onClick={()=>setTab(t.id)} className="text-left rounded-xl bg-slate-50 hover:bg-emerald-50 p-3 text-sm font-bold text-slate-700">{t.icon}<span className="block mt-2">{t.label}</span></button>)}</div></section><section className="rounded-2xl bg-white border border-slate-200 p-5"><h2 className="font-black text-slate-900">Perlu perhatian</h2><ul className="text-sm text-slate-600 mt-3 space-y-3"><li>• Login demo masih menggunakan PIN frontend.</li><li>• Staff dan perubahan panel tersimpan di localStorage browser.</li><li>• Role matrix ini dokumentasi UI, bukan enforcement backend.</li><li>• Sesi aktif dan audit server belum terhubung.</li></ul></section></div></>}
      {tab==='staff'&&<section className="rounded-2xl bg-white border border-slate-200 overflow-hidden"><div className="p-4 sm:p-5 flex flex-wrap justify-between items-center gap-3"><div><h2 className="font-black text-lg">Direktori Staff</h2><p className="text-xs text-slate-500">Kelola tampilan akun demo per outlet.</p></div><button onClick={()=>setShowForm(v=>!v)} className="rounded-xl bg-emerald-700 text-white px-4 py-2.5 text-sm font-bold inline-flex gap-2 items-center"><Plus size={16}/> Tambah Staff</button></div>{showForm&&<div className="mx-4 mb-4 p-4 rounded-xl bg-slate-50 grid sm:grid-cols-4 gap-2"><input value={name} onChange={e=>setName(e.target.value)} placeholder="Nama staff" className="rounded-lg border p-2 text-sm"/><select value={role} onChange={e=>setRole(e.target.value as UserRole)} className="rounded-lg border p-2 text-sm"><option value="cashier">Cashier</option><option value="finance">Finance</option><option value="owner">Owner</option></select><input value={outlet} onChange={e=>setOutlet(e.target.value)} className="rounded-lg border p-2 text-sm" placeholder="Outlet"/><div className="flex gap-2"><button onClick={addStaff} className="bg-emerald-700 text-white rounded-lg px-3 text-sm font-bold">Simpan</button><button onClick={()=>setShowForm(false)} className="bg-white border rounded-lg px-3"><X size={16}/></button></div></div>}<div className="overflow-x-auto"><table className="w-full text-sm"><thead className="bg-slate-50 text-slate-500"><tr><th className="text-left p-3">Nama</th><th className="text-left p-3">Role</th><th className="text-left p-3">Outlet</th><th className="text-left p-3">Status</th><th className="p-3">Aksi</th></tr></thead><tbody>{staff.map(s=><tr key={s.id} className="border-t border-slate-100"><td className="p-3 font-bold">{s.name}</td><td className="p-3">{roleLabel[s.role]}</td><td className="p-3">{s.outlet}</td><td className="p-3"><span className={`rounded-full px-2 py-1 text-xs font-bold ${s.active?'bg-emerald-100 text-emerald-800':'bg-slate-100 text-slate-500'}`}>{s.active?'Aktif':'Nonaktif'}</span></td><td className="p-3 text-center"><button onClick={()=>toggleStaff(s)} className="rounded-lg border px-3 py-1.5 text-xs font-bold">{s.active?'Nonaktifkan':'Aktifkan'}</button></td></tr>)}</tbody></table></div></section>}
      {tab==='permissions'&&<section className="rounded-2xl bg-white border border-slate-200 p-4 overflow-x-auto"><h2 className="font-black text-lg mb-1">Matriks Hak Akses</h2><p className="text-xs text-slate-500 mb-4">Baseline UI. Enforcement wajib dilakukan ulang di server/API dan database.</p><table className="w-full text-sm"><thead><tr className="bg-slate-50"><th className="text-left p-3">Modul</th><th className="p-3">Owner</th><th className="p-3">Cashier</th><th className="p-3">Finance</th></tr></thead><tbody>{permissionRows.map(r=><tr key={String(r[0])} className="border-t"><td className="p-3 font-semibold">{r[0]}</td>{r.slice(1).map((v,i)=><td key={i} className="text-center p-3">{v?<Check className="inline text-emerald-600" size={17}/>:<X className="inline text-slate-300" size={17}/>}</td>)}</tr>)}</tbody></table></section>}
      {tab==='outlets'&&<section className="rounded-2xl bg-white border border-slate-200 p-5"><h2 className="font-black text-lg">Tenant & Outlet</h2><div className="mt-4 flex items-center gap-3 rounded-xl bg-slate-50 p-4"><Building2 className="text-emerald-700"/><div><div className="font-bold">Resto Nusantara · Outlet Utama</div><div className="text-xs text-slate-500">Outlet demo aktif · data lokal browser</div></div><span className="ml-auto text-xs font-bold text-emerald-700">Aktif</span></div><p className="text-xs text-slate-500 mt-4">Pembuatan tenant, pemindahan staff, dan isolasi outlet belum diaktifkan sebelum API multi-tenant tersedia.</p></section>}
      {tab==='sessions'&&<section className="rounded-2xl bg-white border border-slate-200 p-5"><h2 className="font-black text-lg">Sesi Staff</h2><p className="text-sm text-slate-500 mt-2">Belum ada koneksi ke registry sesi backend. Sesi login demo saat ini dikelola oleh aplikasi lokal.</p><div className="mt-4 rounded-xl bg-amber-50 text-amber-900 p-3 text-sm">Revoke sesi dan reset credential tidak tersedia di panel demo ini.</div></section>}
      {tab==='audit'&&<section className="rounded-2xl bg-white border border-slate-200 p-5"><h2 className="font-black text-lg">Aktivitas Panel</h2><ul className="mt-4 space-y-2">{events.map((e,i)=><li key={i} className="border-b border-slate-100 py-2 text-sm text-slate-700">{e}</li>)}</ul><p className="text-xs text-slate-400 mt-3">Log sementara di memori browser, bukan audit trail server.</p></section>}
      <div className="text-xs text-slate-400 flex items-center gap-2"><ShieldCheck size={14}/> Masuk sebagai {currentStaff.name} · {roleLabel[currentStaff.role]} · fitur administrasi demo</div>
    </div>
  </div>;
};
