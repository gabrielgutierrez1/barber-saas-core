import 'dotenv/config';
import { PrismaClient as Directory } from '@generated/manager';
import { PrismaClient as Catalog } from '@generated/catalog';
import { PrismaClient as Auth } from '@generated/auth';
import bcrypt from 'bcryptjs';
const host=process.env.POSTGRES_HOST||'postgres';
const user=process.env.POSTGRES_USER||'app';const pass=process.env.POSTGRES_PASSWORD;
if(!pass)throw new Error('POSTGRES_PASSWORD required');
const uri=(dbname:string)=>`postgresql://${encodeURIComponent(user)}:${encodeURIComponent(pass)}@${host}:5432/${dbname}?schema=public`;
const tenants=[
 {id:'11111111-1111-4111-8111-111111111111',slug:'estudio-norte',name:'Estudio Norte',description:'Belleza y cuidado profesional, con reserva en línea.',primaryColor:'#bb865d',timeZone:'America/Santiago',openingHour:9,closingHour:19},
 {id:'22222222-2222-4222-8222-222222222222',slug:'barberia-central',name:'Barbería Central',description:'Cortes y cuidado masculino.',primaryColor:'#967459',timeZone:'America/Santiago',openingHour:10,closingHour:20}
];
const schemas=['catalog','reservations','payments','auth'];
async function main(){
 const directory=new Directory({datasources:{db:{url:process.env.MANAGER_DATABASE_URL}}});
 const password=process.env.SEED_ADMIN_PASSWORD||'';if(password.length<12||password.startsWith('CAMBIAR_'))throw new Error('SEED_ADMIN_PASSWORD insegura');
 const email=(process.env.SEED_ADMIN_EMAIL||'admin@demo.cl').toLowerCase();
 const hash=await bcrypt.hash(password,12);
 try {
  for(let index=0;index<tenants.length;index++){
   const t=tenants[index];await directory.tenant.upsert({where:{id:t.id},create:t,update:{...t}});
   const id=index+1;
   for(const kind of schemas){const url=uri(`tenant${id}_${kind}`);await directory.tenantDatabase.upsert({where:{tenantId_service:{tenantId:t.id,service:kind}},update:{connectionUrl:url},create:{tenantId:t.id,service:kind,connectionUrl:url}});}
   const catalog=new Catalog({datasources:{db:{url:uri(`tenant${id}_catalog`)}}});
   const auth=new Auth({datasources:{db:{url:uri(`tenant${id}_auth`)}}});
   try {
    if(await catalog.service.count()===0){await catalog.service.createMany({data:index===0?
     [{name:'Corte clásico',description:'Lavado y corte profesional.',price:12000,durationMin:30},{name:'Color y estilo',description:'Coloración y acabado.',price:32000,durationMin:90}]:
     [{name:'Corte de cabello',description:'Corte y peinado.',price:10000,durationMin:30},{name:'Barba y perfilado',description:'Perfilado de barba.',price:8000,durationMin:30}]});}
    await auth.user.upsert({where:{email},create:{email,name:'Administrador',role:'OWNER',passwordHash:hash},update:{passwordHash:hash}});
   }finally{await catalog.$disconnect();await auth.$disconnect();}
  }
 }finally{await directory.$disconnect();}
 console.log('Tenant Manager y bases aisladas provisionadas');
}
main().catch(e=>{console.error(e);process.exit(1)});
