import React, { useCallback, useEffect, useState } from 'react';
import { Users, ShieldCheck, RefreshCw, AlertTriangle, UserPlus } from 'lucide-react';
import { StaffAccount } from '../types/pos';

type AdminStaff = {
  id:string; display_name:string; email:string|null; phone:string|null;
  role_code:string; status:string; has_pin:boolean; has_nfc:boolean; created_at:string;
};
type Tab = 'staff' | 'matrix';
const API='/api/admin/staff';
const matrix = [
  ['Cockpit Owner','✓','—','—'],['POS & Floor Plan','✓','✓','—'],['KDS & Checker','✓','✓','—'],
  ['Stok Menu','✓','✓','✓'],['Pembayaran / Settlement','✓','✓','—'],['Pembukuan & PB1','✓','—','✓'],
  ['Kas Kecil','✓','—','✓'],['Approval pembatalan','✓','—','—'],['Kelola staff & role','✓','—','—'],
  ['Reset / enrollment PIN','✓','—','—'],['Enrollment / cabut NFC','✓','—','—'],['Nonaktifkan & cabut sesi staff','✓','—','—'],
];
function authHeaders() {
  const token=localStorage.getItem('gastro_cashier_api_token');
  return { 'Content-Type':'application/json', ...(token?{Authorization:'Bearer '+token}:{}) };
}
export const StaffAdminView: React.FC<{ currentStaff:StaffAccount; onLockScreen:()=>void }> = ({currentStaff,onLockScreen}) => {
  const [tab,setTab]=useState<Tab>('staff');
  const [staff,setStaff]=useState<AdminStaff[]>([]);
  const [loading,setLoading]=useState(true);
  const [error,setError]=useState('');
  const [notice,setNotice]=useState('');
  const [saving,setSaving]=useState(false);
  const [showCreate,setShowCreate]=useState(false);
  const [form,setForm]=useState({name:'',email:'',phone:'',role:'cashier',pin:''});
  const load=useCallback(async()=>{
    setLoading(true);setError('');
    try {
      const response=await fetch(API,{headers:authHeaders()});
      const data=await response.json();
      if(!response.ok) throw new Error(data.error||'Gagal memuat direktori staff.');
      setStaff(data);
    } catch(e) { setError(e instanceof Error?e.message:'Gagal memuat direktori staff.'); }
    finally { setLoading(false); }
  },[]);
  useEffect(()=>{void load();},[load]);
  const createStaff=async(e:React.FormEvent)=>{
    e.preventDefault();setSaving(true);setError('');setNotice('');
    try {
      const response=await fetch(API,{method:'POST',headers:authHeaders(),body:JSON.stringify({...form,email:form.email.trim()||undefined,phone:form.phone.trim()||undefined})});
      const data=await response.json().catch(()=>({}));
      if(!response.ok) throw new Error(data.error||`Gagal membuat staff (HTTP ${response.status}).`);
      setForm({name:'',email:'',phone:'',role:'cashier',pin:''});setShowCreate(false);
      setNotice('Akun staff berhasil dibuat. Bagikan PIN awal secara aman kepada staff.');
      await load();
    } catch(e) { setError(e instanceof Error?e.message:'Gagal membuat staff.'); }
    finally { setSaving(false); }
  };
  return <div className="flex-1 min-h-0 overflow-y-auto clay-canvas p-4 sm:p-6 space-y-5">
    <header className="clay-bar rounded-2xl p-5 flex flex-wrap items-center justify-between gap-3">
      <div className="flex items-center gap-3"><div className="w-12 h-12 clay-btn-emerald flex items-center justify-center"><ShieldCheck className="w-6 h-6 text-white"/></div><div><h2 className="text-lg font-black text-slate-900">Admin & Manajemen Staff</h2><p className="text-xs text-slate-600">Direktori, pembuatan akun, dan matriks akses</p></div></div>
      <div className="flex items-center gap-2"><span className="text-xs font-bold text-slate-600">{currentStaff.name} · Owner</span><button onClick={onLockScreen} className="clay-btn-neutral px-3 py-2 text-xs font-bold">Kunci layar</button></div>
    </header>
    <div className="rounded-xl border border-amber-300 bg-amber-50 text-amber-950 p-3 text-sm flex gap-2"><AlertTriangle className="w-4 h-4 shrink-0 mt-0.5"/>Mutasi staff tetap dikunci oleh emergency release backend sampai runtime role, HMAC, RLS, dan grant database development lulus verifikasi. Form tidak dapat melewati penguncian backend.</div>
    <div className="clay-panel p-1.5 flex gap-1 w-fit">
      <button onClick={()=>setTab('staff')} className={`px-4 py-2 rounded-xl text-xs font-black ${tab==='staff'?'clay-btn-dark text-white':'text-slate-600'}`}><Users className="inline w-4 h-4 mr-1"/> Direktori Staff</button>
      <button onClick={()=>setTab('matrix')} className={`px-4 py-2 rounded-xl text-xs font-black ${tab==='matrix'?'clay-btn-dark text-white':'text-slate-600'}`}><ShieldCheck className="inline w-4 h-4 mr-1"/> Matrix Role</button>
    </div>
    {error&&<div role="alert" className="rounded-xl bg-rose-50 p-3 text-sm text-rose-900 flex gap-2"><AlertTriangle className="w-4 h-4 shrink-0"/>{error}</div>}
    {notice&&<div role="status" className="rounded-xl bg-emerald-50 p-3 text-sm text-emerald-900">{notice}</div>}
    {tab==='staff'?<section className="clay-panel p-4 space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2"><h3 className="font-black text-slate-900">Daftar Staff ({staff.length})</h3><div className="flex gap-2"><button onClick={()=>setShowCreate(v=>!v)} className="clay-btn-emerald px-3 py-2 text-xs font-bold text-white"><UserPlus className="inline w-3.5 h-3.5 mr-1"/>Tambah Staff</button><button onClick={()=>void load()} className="clay-btn-neutral px-3 py-2 text-xs font-bold"><RefreshCw className="inline w-3.5 h-3.5 mr-1"/> Refresh</button></div></div>
      {showCreate&&<form onSubmit={createStaff} className="rounded-xl border border-slate-200 p-4 grid grid-cols-1 sm:grid-cols-2 gap-3">
        <label className="text-xs font-bold">Nama lengkap<input required maxLength={120} value={form.name} onChange={e=>setForm({...form,name:e.target.value})} className="mt-1 w-full rounded-lg border p-2 text-sm font-normal" /></label>
        <label className="text-xs font-bold">Role<select value={form.role} onChange={e=>setForm({...form,role:e.target.value})} className="mt-1 w-full rounded-lg border p-2 text-sm font-normal"><option value="cashier">Cashier</option><option value="finance">Finance</option></select></label>
        <label className="text-xs font-bold">Email (isi email atau telepon)<input type="email" maxLength={254} value={form.email} onChange={e=>setForm({...form,email:e.target.value})} className="mt-1 w-full rounded-lg border p-2 text-sm font-normal" /></label>
        <label className="text-xs font-bold">Telepon<input maxLength={40} value={form.phone} onChange={e=>setForm({...form,phone:e.target.value})} className="mt-1 w-full rounded-lg border p-2 text-sm font-normal" /></label>
        <label className="text-xs font-bold">PIN awal (4 digit)<input required inputMode="numeric" pattern="[0-9]{4}" minLength={4} maxLength={4} value={form.pin} onChange={e=>setForm({...form,pin:e.target.value.replace(/\D/g,'').slice(0,4)})} className="mt-1 w-full rounded-lg border p-2 text-sm font-normal tracking-widest" /></label>
        <div className="sm:col-span-2 flex gap-2"><button disabled={saving||(!form.email.trim()&&!form.phone.trim())} className="clay-btn-dark px-4 py-2 rounded-lg text-xs font-bold text-white disabled:opacity-50">{saving?'Menyimpan…':'Buat akun staff'}</button><button type="button" onClick={()=>setShowCreate(false)} className="clay-btn-neutral px-4 py-2 rounded-lg text-xs font-bold">Batal</button></div>
      </form>}
      {loading?<p className="text-sm text-slate-500 p-4">Memuat data staff…</p>:staff.length===0?<p className="text-sm text-slate-500 p-4">Belum ada staff pada outlet ini.</p>:<div className="overflow-x-auto"><table className="w-full text-sm"><thead><tr className="text-left text-[10px] text-slate-500 uppercase border-b"><th className="p-2">Nama</th><th className="p-2">Role</th><th className="p-2">Kontak</th><th className="p-2">Credential</th><th className="p-2">Status</th></tr></thead><tbody>{staff.map(s=><tr key={s.id} className="border-b border-slate-200"><td className="p-2"><b>{s.display_name}</b></td><td className="p-2 capitalize">{s.role_code}</td><td className="p-2 text-xs">{s.email||s.phone||'—'}</td><td className="p-2 text-xs">{s.has_pin?'PIN ✓':'PIN —'} · {s.has_nfc?'NFC ✓':'NFC —'}</td><td className="p-2"><span className={s.status==='active'?'text-emerald-700':'text-rose-700'}>{s.status}</span></td></tr>)}</tbody></table></div>}
    </section>:<section className="clay-panel p-4 overflow-x-auto"><h3 className="font-black text-slate-900 mb-1">Matrix Hak Akses</h3><p className="text-xs text-slate-500 mb-4">Hanya Owner dapat mengelola staff. Mutasi tetap dilindungi oleh backend dan database.</p><table className="w-full text-sm"><thead><tr className="text-left text-xs uppercase text-slate-500 border-b"><th className="p-3">Fitur</th><th className="p-3">Owner</th><th className="p-3">Cashier</th><th className="p-3">Finance</th></tr></thead><tbody>{matrix.map(row=><tr key={row[0]} className="border-b border-slate-100"><td className="p-3 font-semibold">{row[0]}</td>{row.slice(1).map((v,i)=><td key={i} className={`p-3 font-black ${v==='✓'?'text-emerald-700':v==='—'?'text-slate-300':'text-amber-700'}`}>{v}</td>)}</tr>)}</tbody></table></section>}
  </div>;
};
