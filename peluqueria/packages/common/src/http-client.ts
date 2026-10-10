import { HttpException, Injectable, ServiceUnavailableException } from '@nestjs/common';
@Injectable()
export class InternalHttp {
 async call<T>(url:string,method:'GET'|'POST'|'PATCH'='GET',body?:unknown,extraHeaders?:Record<string,string>):Promise<T>{
  let response:Response;
  try { response=await fetch(url,{method,headers:{'Content-Type':'application/json','x-internal-key':process.env.INTERNAL_API_KEY||'',...extraHeaders},body:body===undefined?undefined:JSON.stringify(body),signal:AbortSignal.timeout(15000),cache:'no-store'}); }
  catch {throw new ServiceUnavailableException('Servicio interno no disponible');}
  const payload=await response.json().catch(()=>({message:'Respuesta inválida'}));
  if(!response.ok)throw new HttpException(payload,response.status);
  return payload as T;
 }
}
