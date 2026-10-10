import type { MetadataRoute } from 'next';
export default function manifest():MetadataRoute.Manifest{
 return {name:'Agenda Studio',short_name:'Agenda',description:'Reservas de peluquería y barbería',start_url:'/',display:'standalone',background_color:'#f7f5f0',theme_color:'#f7f5f0',lang:'es',icons:[{src:'/icon-192.png',sizes:'192x192',type:'image/png'},{src:'/icon-512.png',sizes:'512x512',type:'image/png'}]};
}
