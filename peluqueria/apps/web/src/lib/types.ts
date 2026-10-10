export type Tenant={slug:string;name:string;description:string|null;logoUrl:string|null;primaryColor:string;timeZone:string;openingHour:number;closingHour:number};
export type SalonService={id:string;name:string;description:string|null;price:number;durationMin:number;active:boolean};
export const money=(value:number)=>new Intl.NumberFormat('es-CL',{style:'currency',currency:'CLP',maximumFractionDigits:0}).format(value);
export const api=process.env.NEXT_PUBLIC_API_URL||'http://localhost:4000';
export const tenantId=process.env.NEXT_PUBLIC_TENANT_ID||'';
export async function apiFetch<T>(path:string,init?:RequestInit):Promise<T>{
 if(!tenantId)throw new Error('NEXT_PUBLIC_TENANT_ID no configurada');
 const response=await fetch(`${api}${path}`,{...init,headers:{...(init?.headers||{}),'Content-Type':'application/json','x-tenant-id':tenantId},cache:'no-store'});
 const data=await response.json().catch(()=>({message:'Error de conexión'}));
 if(!response.ok){const msg=Array.isArray(data.message)?data.message.join(', '):data.message||'No se pudo procesar la solicitud';throw new Error(msg);}
 return data as T;
}
