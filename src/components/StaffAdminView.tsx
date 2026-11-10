import React, { useCallback, useEffect, useState } from 'react';
import { Users, ShieldCheck, UserPlus, Radio, RefreshCw, Save, UserX, UserCheck, AlertTriangle } from 'lucide-react';
import { StaffAccount } from '../types/pos';

type AdminStaff = { id:string; display_name:string; email:string|null; phone:string|null; role_code:string; status:string; has_pin:boolean; has_nfc:boolean; created_at:string };
type Tab = 'staff' | 'matrix';
const API='/api/admin/staff';
const roles = [
  { code:'owner', label:'Owner', description:'Kontrol penuh outlet, user, credential, approval dan laporan.' },
  { code:'cashier', label:'Cashier', description:'Operasional POS, meja, pesanan, pembayaran, KDS dan checker.' },
  { code:'finance', label:'Finance', description:'Audit transaksi, rekonsiliasi, PB1 dan kas kecil.' },
];
const matrix = [
  ['Cockpit Owner','✓','—','—'],['POS & Floor Plan','✓','✓','—'],['KDS & Checker','✓','✓','—'],
  ['Stok Menu','✓','✓','✓'],['Pembayaran / Settlement','✓','✓','—'],['Pembukuan & PB1','✓','—','✓'],
  ['Kas Kecil','✓','—','✓'],['Approval pembatalan','✓','—','—'],['Kelola staff & role','✓','—','—'],
  ['Reset / enrollment PIN','✓','—','—'],['Enrollment / cabut NFC','✓','—','—'],['Kunci / cabut sesi staff','✓','—','—'],
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
  const [name,setName]=useState('');
  const [email,setEmail]=useState('');
  const [phone,setPhone]=useState('');
  const [role,setRole]=useState('cashier');
  const [pin,setPin]=useState('');
  const [selected,setSelected]=useState<AdminStaff|null>(null);
  const [newPin,setNewPin]=useState('');
  const [nfcUid,setNfcUid]=useState('');
  const [scanState,setScanState]=useState('');
  const load=useCallback(async()=>{
    setLoading(true);setError('');
    try { const r=await fetch(API,{headers:authHeaders()}); const d=await r.json(); if(!r.ok)throw new Error(d.error||'Gagal memuat staff.'); setStaff(d); }
    catch(e){setError(e instanceof Error?e.message:'Gagal memuat data staff.');}
    finally{setLoading(false);}
  },[]);
  useEffect(()=>{void load();},[load]);
  const submitNew=async(e:React.FormEvent)=>{
    e.preventDefault();setSaving(true);setError('');setNotice('');
    try{
      const r=await fetch(API,{method:'POST',headers:authHeaders(),body:JSON.stringify({name,email:email||null,phone:phone||null,role,pin})});
      const d=await r.json();if(!r.ok)throw new Error(d.error||'Gagal membuat staff.');
      setName('');setEmail('');setPhone('');setPin('');setRole('cashier');setNotice('Staff berhasil dibuat. PIN hanya ditampilkan saat pembuatan dan tidak disimpan di browser.');
      await load();
    }catch(e){setError(e instanceof Error?e.message:'Gagal membuat staff.');}
    finally{setSaving(false);}
  };
  const patchStaff=async(id:string,body:Record<string,unknown>)=>{
    setSaving(true);setError('');setNotice('');
    try{const r=await fetch(API+'/'+id,{method:'PATCH',headers:authHeaders(),body:JSON.stringify(body)});const d=await r.json();if(!r.ok)throw new Error(d.error||'Perubahan ditolak.');setNotice('Perubahan staff tersimpan.');setSelected(null);await load();}
    catch(e){setError(e instanceof Error?e.message:'Perubahan gagal.');}finally{setSaving(false);}
  };
  const saveCredentials=async()=>{
    if(!selected)return;
    setSaving(true);setError('');setNotice('');
    try{const r=await fetch(API+'/'+selected.id+'/credentials',{method:'POST',headers:authHeaders(),body:JSON.stringify({pin:newPin||undefined,nfcUid:nfcUid||undefined})});const d=await r.json();if(!r.ok)throw new Error(d.error||'Gagal memperbarui credential.');setNewPin('');setNfcUid('');setNotice('Credential diperbarui. Sesi aktif pada outlet ini telah dicabut.');await load();}
    catch(e){setError(e instanceof Error?e.message:'Gagal memperbarui credential.');}finally{setSaving(false);}
  };
  const scanNfc=async()=>{
    if(!('NDEFReader' in window)){setError('Web NFC tidak tersedia. Gunakan Android Chrome dengan NFC aktif.');return;}
    try{
      setScanState('Dekatkan kartu NFC…');
      // @ts-ignore Web NFC is not included in the standard TypeScript DOM types.
      const reader=new window.NDEFReader(); await reader.scan();
      reader.onreading=(event:any)=>{const uid=String(event.serialNumber||'').trim();if(!uid){setError('UID NFC tidak terbaca.');setScanState('');return;}setNfcUid(uid);setScanState('Kartu terbaca. Simpan untuk mendaftarkan.');};
      reader.onreadingerror=()=>{setError('Gagal membaca kartu NFC.');setScanState('');};
    }catch{setError('Izin NFC ditolak atau pemindaian gagal.');setScanState('');}
  };
  return <div className="flex-1 min-h-0 overflow-y-auto clay-canvas p-4 sm:p-6 space-y-5">
    <header className="clay-bar rounded-2xl p-5 flex flex-wrap items-center justify-between gap-3">
      <div className="flex items-center gap-3"><div className="w-12 h-12 clay-btn-emerald flex items-center justify-center"><ShieldCheck className="w-6 h-6 text-white"/></div><div><h2 className="text-lg font-black text-slate-900">Admin & Manajemen Staff</h2><p className="text-xs text-slate-600">Kelola akun, role, PIN, kartu NFC dan akses outlet</p></div></div>
      <div className="flex items-center gap-2"><span className="text-xs font-bold text-slate-600">{currentStaff.name} · Owner</span><button onClick={onLockScreen} className="clay-btn-neutral px-3 py-2 text-xs font-bold">Kunci layar</button></div>
    </header>
    <div className="clay-panel p-1.5 flex gap-1 w-fit"><button onClick={()=>setTab('staff')} className={`px-4 py-2 rounded-xl text-xs font-black ${tab==='staff'?'clay-btn-dark text-white':'text-slate-600'}`}><Users className="inline w-4 h-4 mr-1"/> Staff & Credential</button><button onClick={()=>setTab('matrix')} className={`px-4 py-2 rounded-xl text-xs font-black ${tab==='matrix'?'clay-btn-dark text-white':'text-slate-600'}`}><ShieldCheck className="inline w-4 h-4 mr-1"/> Matrix Role</button></div>
    {error&&<div className="clay-tint-rose rounded-xl p-3 text-sm text-rose-900 flex gap-2"><AlertTriangle className="w-4 h-4 shrink-0"/>{error}</div>}
    {notice&&<div className="clay-tint-emerald rounded-xl p-3 text-sm text-emerald-900">{notice}</div>}
    {tab==='staff'?<div className="grid grid-cols-1 xl:grid-cols-[minmax(0,1.4fr)_minmax(320px,0.8fr)] gap-4">
      <section className="clay-panel p-4 space-y-3">
        <div className="flex items-center justify-between"><h3 className="font-black text-slate-900">Daftar Staff ({staff.length})</h3><button onClick={()=>void load()} className="clay-btn-neutral px-3 py-2 text-xs font-bold"><RefreshCw className="inline w-3.5 h-3.5 mr-1"/> Refresh</button></div>
        {loading?<p className="text-sm text-slate-500 p-4">Memuat data staff…</p>:staff.length===0?<p className="text-sm text-slate-500 p-4">Belum ada staff pada outlet ini.</p>:<div className="overflow-x-auto"><table className="w-full text-sm"><thead><tr className="text-left text-[10px] text-slate-500 uppercase border-b"><th className="p-2">Nama</th><th className="p-2">Role</th><th className="p-2">Credential</th><th className="p-2">Status</th><th className="p-2">Aksi</th></tr></thead><tbody>{staff.map(s=><tr key={s.id} className="border-b border-slate-200"><td className="p-2"><b>{s.display_name}</b><div className="text-[11px] text-slate-500">{s.email||s.phone||'—'}</div></td><td className="p-2 capitalize">{s.role_code}</td><td className="p-2 text-xs">{s.has_pin?'PIN ✓':'PIN —'} · {s.has_nfc?'NFC ✓':'NFC —'}</td><td className="p-2"><span className={s.status==='active'?'text-emerald-700':'text-rose-700'}>{s.status}</span></td><td className="p-2"><button onClick={()=>{setSelected(s);setNewPin('');setNfcUid('');}} className="clay-btn-neutral px-3 py-1.5 text-xs font-bold">Kelola</button></td></tr>)}</tbody></table></div>}
      </section>
      <section className="clay-panel p-4 space-y-3"><div className="flex items-center gap-2"><UserPlus className="w-5 h-5 text-emerald-700"/><h3 className="font-black">Tambah Staff</h3></div>
        <form onSubmit={submitNew} className="space-y-3">
          <label className="block text-xs font-bold">Nama lengkap<input required value={name} onChange={e=>setName(e.target.value)} className="mt-1 w-full clay-well rounded-xl p-3 text-sm" maxLength={120}/></label>
          <label className="block text-xs font-bold">Email (opsional)<input type="email" value={email} onChange={e=>setEmail(e.target.value)} className="mt-1 w-full clay-well rounded-xl p-3 text-sm"/></label>
          <label className="block text-xs font-bold">Nomor telepon (opsional)<input type="tel" value={phone} onChange={e=>setPhone(e.target.value)} className="mt-1 w-full clay-well rounded-xl p-3 text-sm" maxLength={40}/></label>
          <p className="text-[11px] text-slate-500">Isi email atau nomor telepon sebagai kontak akun.</p>
          <label className="block text-xs font-bold">Role<select value={role} onChange={e=>setRole(e.target.value)} className="mt-1 w-full clay-well rounded-xl p-3 text-sm">{roles.map(r=><option key={r.code} value={r.code}>{r.label}</option>)}</select></label>
          <label className="block text-xs font-bold">PIN awal (4–8 digit)<input required inputMode="numeric" pattern="[0-9]{4,8}" minLength={4} maxLength={8} value={pin} onChange={e=>setPin(e.target.value.replace(/\D/g,'').slice(0,8))} className="mt-1 w-full clay-well rounded-xl p-3 text-sm font-mono tracking-widest"/></label>
          <button disabled={saving} className="clay-btn-emerald text-white rounded-xl px-4 py-3 w-full text-sm font-black disabled:opacity-50"><UserPlus className="inline w-4 h-4 mr-2"/> Buat akun staff</button>
        </form>
      </section>
      {selected&&<section className="xl:col-span-2 clay-panel p-4 space-y-4">
        <div className="flex justify-between gap-3"><div><h3 className="font-black">Kelola: {selected.display_name}</h3><p className="text-xs text-slate-500">ID {selected.id}</p></div><button onClick={()=>setSelected(null)} className="clay-btn-neutral px-3 py-1.5 text-xs">Tutup</button></div>
        <div className="grid md:grid-cols-3 gap-3">
          <label className="text-xs font-bold">Role<select value={selected.role_code} onChange={e=>setSelected({...selected,role_code:e.target.value})} className="mt-1 w-full clay-well p-3 rounded-xl">{roles.map(r=><option key={r.code} value={r.code}>{r.label}</option>)}</select><button disabled={saving} onClick={()=>void patchStaff(selected.id,{role:selected.role_code})} className="mt-2 clay-btn-neutral p-2 rounded-lg text-xs font-bold">Simpan role</button></label>
          <div className="text-xs font-bold">Status akun<div className="mt-2 flex gap-2"><button disabled={saving||selected.id===currentStaff.id} onClick={()=>void patchStaff(selected.id,{status:'active'})} className="clay-btn-emerald text-white p-2 rounded-lg text-xs"><UserCheck className="inline w-4 h-4 mr-1"/>Aktifkan</button><button disabled={saving||selected.id===currentStaff.id} onClick={()=>void patchStaff(selected.id,{status:'inactive'})} className="clay-btn-neutral p-2 rounded-lg text-xs text-rose-700"><UserX className="inline w-4 h-4 mr-1"/>Nonaktifkan</button></div></div>
          <div className="text-xs font-bold">Reset / daftarkan credential<label className="block mt-2">PIN baru<input value={newPin} onChange={e=>setNewPin(e.target.value.replace(/\D/g,'').slice(0,8))} placeholder="4–8 digit" className="mt-1 w-full clay-well p-2 rounded-lg font-mono" inputMode="numeric"/></label><label className="block mt-2">NFC UID<input value={nfcUid} onChange={e=>setNfcUid(e.target.value)} placeholder="Tap kartu atau masukkan UID" className="mt-1 w-full clay-well p-2 rounded-lg"/></label><div className="flex gap-2 mt-2"><button onClick={()=>void scanNfc()} className="clay-btn-neutral px-3 py-2 rounded-lg text-xs"><Radio className="inline w-3.5 h-3.5 mr-1"/>Scan NFC</button><button disabled={saving||(!newPin&&!nfcUid)} onClick={()=>void saveCredentials()} className="clay-btn-emerald text-white px-3 py-2 rounded-lg text-xs"><Save className="inline w-3.5 h-3.5 mr-1"/>Simpan</button></div>{scanState&&<p className="mt-1 text-[11px] text-emerald-700">{scanState}</p>}</div>
        </div>
        <p className="text-[11px] text-amber-800 bg-amber-50 rounded-lg p-3">PIN/NFC lama tidak pernah ditampilkan. Reset PIN akan mengganti hash; penggantian credential juga mencabut sesi staff pada outlet aktif.</p>
      </section>}
    </div>:<section className="clay-panel p-4 overflow-x-auto"><h3 className="font-black text-slate-900 mb-1">Matrix Hak Akses</h3><p className="text-xs text-slate-500 mb-4">Role merupakan izin maksimum. API tetap memvalidasi hak akses di server; menyembunyikan menu bukan kontrol keamanan.</p><table className="w-full text-sm"><thead><tr className="text-left text-xs uppercase text-slate-500 border-b"><th className="p-3">Fitur</th><th className="p-3">Owner</th><th className="p-3">Cashier</th><th className="p-3">Finance</th></tr></thead><tbody>{matrix.map(row=><tr key={row[0]} className="border-b border-slate-100"><td className="p-3 font-semibold">{row[0]}</td>{row.slice(1).map((v,i)=><td key={i} className={`p-3 font-black ${v==='✓'?'text-emerald-700':'text-slate-300'}`}>{v}</td>)}</tr>)}</tbody></table><div className="mt-4 grid md:grid-cols-3 gap-3">{roles.map(r=><div key={r.code} className="clay-card rounded-xl p-3"><b className="text-sm">{r.label}</b><p className="text-xs text-slate-600 mt-1">{r.description}</p></div>)}</div></section>}
  </div>;
};
