'use client';
import { useState } from 'react';
import Link from 'next/link';
import { Plus, ArrowUpRight, CalendarDays, LogOut, LayoutDashboard } from 'lucide-react';
import { apiFetch, money, SalonService } from '../../lib/types';
type Reservation={id:string;customerName:string;customerEmail:string;startsAt:string;status:string;priceSnapshot:number;service:{name:string}};
export default function Admin(){
 const [email,setEmail]=useState('');const [password,setPassword]=useState('');
 const [token,setToken]=useState('');const [role,setRole]=useState('');const [salon,setSalon]=useState('');const [services,setServices]=useState<SalonService[]>([]);const [reservations,setReservations]=useState<Reservation[]>([]);
 const [error,setError]=useState('');const [loading,setLoading]=useState(false);
 const [name,setName]=useState('');const [description,setDescription]=useState('');const [price,setPrice]=useState('');const [duration,setDuration]=useState('30');
 const headers=(t:string)=>({Authorization:`Bearer ${t}`});
 async function reload(t:string){
  const [s,r]=await Promise.all([apiFetch<SalonService[]>('/api/admin/services',{headers:headers(t)}),apiFetch<Reservation[]>('/api/admin/reservations',{headers:headers(t)})]);
  setServices(s);setReservations(r);
 }
 async function login(event:React.FormEvent){event.preventDefault();setError('');setLoading(true);
  try{const result=await apiFetch<{accessToken:string;user:{role:string};tenant:{name:string}}>('/api/auth/login',{method:'POST',body:JSON.stringify({email,password})});
   await reload(result.accessToken);setToken(result.accessToken);setRole(result.user.role);setSalon(result.tenant.name);setPassword('');
  }catch(e){setError(e instanceof Error?e.message:'No se pudo iniciar sesión')}finally{setLoading(false)}
 }
 async function create(e:React.FormEvent){e.preventDefault();setError('');setLoading(true);
  try{await apiFetch('/api/admin/services',{method:'POST',headers:headers(token),body:JSON.stringify({name,description,price:Number(price),durationMin:Number(duration)})});
   setName('');setDescription('');setPrice('');await reload(token);
  }catch(e){setError(e instanceof Error?e.message:'No se pudo crear el servicio')}finally{setLoading(false)}
 }
 async function toggle(service:SalonService){setError('');try{await apiFetch(`/api/admin/services/${service.id}`,{method:'PATCH',headers:headers(token),body:JSON.stringify({active:!service.active})});await reload(token)}catch(e){setError(e instanceof Error?e.message:'No se pudo actualizar')}}
 return <main className="min-h-screen"><header className="shell py-7 border-b border-[#e5e0d5] flex justify-between items-center"><Link href="/" className="brand-script">{salon || 'Mi Salón'}</Link>{token?<button className="nav-link" onClick={()=>{setToken('');setRole('');setReservations([]);setServices([])}}><LogOut size={15} className="inline mr-2"/>Cerrar sesión</button>:<Link href="/" className="nav-link">Volver <ArrowUpRight size={14} className="inline"/></Link>}</header>
 {!token?<section className="shell flex justify-center py-20"><form onSubmit={login} className="surface w-full max-w-md p-9 md:p-12 space-y-6"><p className="mini-label text-[#a88260]">ÁREA PRIVADA</p><h1 className="serif text-5xl">Administra tu salón.</h1><p className="text-sm text-[#76776e] leading-7">Inicia sesión con las credenciales de tu peluquería.</p>
  <div><label className="field-label" htmlFor="email">Correo</label><input id="email" type="email" autoComplete="username" className="input" value={email} onChange={e=>setEmail(e.target.value)} required/></div>
  <div><label className="field-label" htmlFor="password">Contraseña</label><input id="password" type="password" autoComplete="current-password" className="input" value={password} onChange={e=>setPassword(e.target.value)} required/></div>
  {error&&<div role="alert" className="status-error">{error}</div>}<button disabled={loading} className="btn-dark w-full">{loading?'Ingresando…':'Ingresar al panel'}</button></form></section>:<div className="shell py-12 lg:py-16">
  <p className="mini-label text-[#ae835f] flex gap-2 items-center"><LayoutDashboard size={14}/> PANEL DE CONTROL</p><div className="flex items-end justify-between gap-4 flex-wrap mb-12"><h1 className="serif text-5xl mt-4">Hola, {salon}.</h1><Link className="btn-outline" href="/" target="_blank">Ver mi sitio <ArrowUpRight size={14} className="inline ml-2"/></Link></div>
  <div className="grid md:grid-cols-3 gap-4 mb-12">{[{label:'Servicios',value:services.length},{label:'Reservas registradas',value:reservations.length},{label:'Confirmadas',value:reservations.filter(r=>r.status==='CONFIRMED').length}].map(stat=><div className="surface p-7" key={stat.label}><p className="mini-label text-[#85867b]">{stat.label}</p><p className="serif text-5xl mt-4">{stat.value}</p></div>)}</div>
  {error&&<div role="alert" className="status-error mb-8">{error}</div>}
  <div className="grid lg:grid-cols-[.8fr_1.2fr] gap-7 mb-10">{role==='OWNER'&&<section className="surface p-8"><p className="mini-label mb-4" style={{color:'#a88260'}}>CATÁLOGO</p><h2 className="serif text-4xl mb-7">Nuevo servicio</h2><form onSubmit={create} className="space-y-5"><div><label htmlFor="new-name" className="field-label">Nombre</label><input id="new-name" className="input" minLength={2} maxLength={80} value={name} onChange={e=>setName(e.target.value)} required/></div><div><label htmlFor="new-desc" className="field-label">Descripción</label><input id="new-desc" className="input" maxLength={500} value={description} onChange={e=>setDescription(e.target.value)}/></div><div><label htmlFor="new-price" className="field-label">Precio (CLP)</label><input id="new-price" type="number" className="input" min={1000} max={1000000} value={price} onChange={e=>setPrice(e.target.value)} required/></div><div><label htmlFor="new-duration" className="field-label">Duración (minutos)</label><select id="new-duration" className="input" value={duration} onChange={e=>setDuration(e.target.value)}>{[30,60,90,120].map(v=><option key={v} value={v}>{v}</option>)}</select></div><button className="btn-dark w-full" disabled={loading}><Plus size={15} className="inline mr-2"/>Agregar servicio</button></form></section>}
  <section className="surface p-8"><h2 className="serif text-4xl mb-7">Mis servicios</h2><div className="space-y-4">{services.map(s=><div key={s.id} className="border-b border-[#ebe7dd] pb-4 flex gap-4 items-center justify-between"><div><p className="font-bold text-sm mb-1">{s.name} {!s.active&&<span className="text-[#b66750]">(Oculto)</span>}</p><p className="text-xs text-[#85877d]">{s.durationMin} min · {money(s.price)}</p></div>{role==='OWNER'&&<button onClick={()=>void toggle(s)} className="text-xs border border-[#ccc6b8] px-3 py-2 min-w-24">{s.active?'Ocultar':'Publicar'}</button>}</div>)}{!services.length&&<p className="text-sm text-[#77796f]">No hay servicios aún.</p>}</div></section></div>
  <section className="surface p-8 overflow-x-auto"><p className="mini-label text-[#aa835f] mb-4"><CalendarDays size={15} className="inline mr-2"/> RESERVAS</p><h2 className="serif text-4xl mb-7">Últimas reservas</h2><table className="w-full text-sm text-left min-w-[610px]"><thead className="bg-[#f2f0ea] text-[#6e7066]"><tr><th className="p-3">Cliente</th><th className="p-3">Servicio</th><th className="p-3">Fecha</th><th className="p-3">Monto</th><th className="p-3">Estado</th></tr></thead><tbody>{reservations.map(r=><tr key={r.id} className="border-b border-[#ede8df]"><td className="p-3"><b>{r.customerName}</b><p className="text-xs text-[#898a80]">{r.customerEmail}</p></td><td className="p-3">{r.service.name}</td><td className="p-3">{new Intl.DateTimeFormat('es-CL',{dateStyle:'medium',timeStyle:'short',timeZone:'America/Santiago'}).format(new Date(r.startsAt))}</td><td className="p-3">{money(r.priceSnapshot)}</td><td className="p-3 text-xs">{r.status}</td></tr>)}</tbody></table>{!reservations.length&&<p className="text-sm text-[#818279] mt-5">Todavía no hay reservas.</p>}</section>
 </div>}
 </main>
}
