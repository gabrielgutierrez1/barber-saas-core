import {spawnSync} from 'node:child_process';
const op=process.argv[2];if(!['generate','migrate'].includes(op))throw new Error('Operación inválida');
const names=['manager','catalog','reservations','payments','auth'];
for(const name of names){
 const targets=op==='generate'?[undefined]:name==='manager'?[process.env.MANAGER_DATABASE_URL]:[process.env[`TENANT1_${name.toUpperCase()}_DATABASE_URL`],process.env[`TENANT2_${name.toUpperCase()}_DATABASE_URL`]];
 for(const url of targets){
  if(op==='migrate'&&!url)throw new Error(`URL faltante para ${name}`);
  const args=['prisma',op==='generate'?'generate':'migrate',...(op==='generate'?[]:['deploy']),'--schema',`prisma/${name}/schema.prisma`];
  const res=spawnSync('npx',args,{stdio:'inherit',env:{...process.env,DATABASE_URL:url||'postgresql://unused:unused@localhost:5432/unused'}});
  if(res.status!==0)process.exit(res.status||1);
 }
}
