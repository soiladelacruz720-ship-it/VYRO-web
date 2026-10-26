const crypto = require('crypto');
const { getStore, connectLambda } = require('@netlify/blobs');
const COOKIE = 'vyro_admin_session';
const store = () => getStore('vyro-admin');
function response(statusCode, data, extra={}) {
  return { statusCode, headers: {'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store','X-Content-Type-Options':'nosniff',...extra}, body: JSON.stringify(data) };
}
function sign(value) { return crypto.createHmac('sha256', process.env.ADMIN_SESSION_SECRET || '').update(value).digest('hex'); }
function makeCookie(exp) { const v=String(exp); return v+'.'+sign(v); }
function valid(event) {
  const raw=(event.headers.cookie||event.headers.Cookie||'').split(';').map(x=>x.trim()).find(x=>x.startsWith(COOKIE+'='));
  if(!raw) return false;
  const val=decodeURIComponent(raw.slice(COOKIE.length+1)), parts=val.split('.');
  if(parts.length!==2 || !/^\d+$/.test(parts[0]) || Number(parts[0])<Date.now()) return false;
  const expected=sign(parts[0]);
  return parts[1].length===expected.length && crypto.timingSafeEqual(Buffer.from(parts[1]),Buffer.from(expected));
}
const cookieOptions = 'Path=/; HttpOnly; Secure; SameSite=Strict; Max-Age=28800';
exports.handler = async (event) => {
  connectLambda(event);
  const method=event.httpMethod;
  const path=event.path||'';
  const secret=process.env.ADMIN_PASSWORD, sessionSecret=process.env.ADMIN_SESSION_SECRET;
  if(!secret || !sessionSecret) return response(503,{error:'Configura ADMIN_PASSWORD y ADMIN_SESSION_SECRET en las variables de entorno de Netlify.'});
  if(method==='POST') {
    let body={}; try { body=JSON.parse(event.body||'{}'); } catch { return response(400,{error:'Solicitud no válida.'}); }
    if(body.action==='login') {
      const supplied=String(body.password||'');
      const a=Buffer.from(supplied), b=Buffer.from(secret);
      if(a.length!==b.length || !crypto.timingSafeEqual(a,b)) return response(401,{error:'Contraseña incorrecta.'});
      const cookie=COOKIE+'='+encodeURIComponent(makeCookie(Date.now()+8*60*60*1000))+'; '+cookieOptions;
      return response(200,{ok:true},{'Set-Cookie':cookie});
    }
    if(body.action==='logout') return response(200,{ok:true},{'Set-Cookie':COOKIE+'=; Path=/; HttpOnly; Secure; SameSite=Strict; Max-Age=0'});
    if(!valid(event)) return response(401,{error:'Inicia sesión de nuevo.'});
    if(body.action==='save') {
      const id=String(body.id||'').trim(), media=String(body.mediaType||'').trim(), title=String(body.title||'').trim().slice(0,180), url=String(body.url||'').trim();
      if(!/^\d{1,12}$/.test(id) || !['movie','tv'].includes(media) || !title) return response(400,{error:'Elige una película o serie válida.'});
      let parsed; try { parsed=new URL(url); } catch { return response(400,{error:'Escribe un enlace HTTPS válido.'}); }
      if(parsed.protocol!=='https:' || !/\.(mp4|webm)$/i.test(parsed.pathname)) return response(400,{error:'El enlace debe ser HTTPS y terminar en .mp4 o .webm.'});
      const links=(await store().get('links',{type:'json'}))||{};
      links[media+':'+id]={title, url:parsed.href, mediaType:media, id, updatedAt:new Date().toISOString()};
      await store().setJSON('links',links);
      return response(200,{ok:true});
    }
    if(body.action==='delete') {
      const id=String(body.id||''), media=String(body.mediaType||'');
      if(!/^\d{1,12}$/.test(id)||!['movie','tv'].includes(media)) return response(400,{error:'Título no válido.'});
      const links=(await store().get('links',{type:'json'}))||{}; delete links[media+':'+id]; await store().setJSON('links',links);
      return response(200,{ok:true});
    }
    return response(400,{error:'Acción desconocida.'});
  }
  if(method==='GET') {
    if(!valid(event)) return response(401,{error:'No has iniciado sesión.'});
    const links=(await store().get('links',{type:'json'}))||{};
    return response(200,{links});
  }
  return response(405,{error:'Método no permitido.'},{Allow:'GET, POST'});
};
