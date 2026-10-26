const API = 'https://api.themoviedb.org/3';
exports.handler = async (event) => {
  const token = process.env.TMDB_API_TOKEN;
  if (!token) return reply(500, { error: 'El administrador debe configurar TMDB_API_TOKEN en Netlify.' });
  const q = event.queryStringParameters || {};
  const tipo = q.tipo || 'Todos';
  const pagina = Math.max(1, Math.min(500, parseInt(q.pagina || '1', 10) || 1));
  const buscar = (q.buscar || '').trim().slice(0, 100);
  try {
    let items = [];
    if (buscar) {
      const d = await tmdb('/search/multi', { query: buscar, page: pagina, include_adult: 'false' }, token);
      items = (d.results || []).filter(x => x.media_type === 'movie' || x.media_type === 'tv').map(x => ({ ...x, vyro_type: x.media_type }));
    } else if (tipo === 'Película') {
      const d = await tmdb('/movie/popular', { page: pagina, region: 'DO' }, token); items = (d.results || []).map(x => ({ ...x, vyro_type: 'movie' }));
    } else if (tipo === 'Serie') {
      const d = await tmdb('/tv/popular', { page: pagina }, token); items = (d.results || []).map(x => ({ ...x, vyro_type: 'tv' }));
    } else if (tipo === 'Anime') {
      const d = await tmdb('/discover/tv', { page: pagina, with_genres: '16', with_origin_country: 'JP', sort_by: 'popularity.desc' }, token); items = (d.results || []).map(x => ({ ...x, vyro_type: 'anime' }));
    } else {
      const [m, s, a] = await Promise.all([
        tmdb('/movie/popular', { page: pagina, region: 'DO' }, token),
        tmdb('/tv/popular', { page: pagina }, token),
        tmdb('/discover/tv', { page: pagina, with_genres: '16', with_origin_country: 'JP', sort_by: 'popularity.desc' }, token)
      ]);
      items = [...(m.results || []).map(x => ({ ...x, vyro_type: 'movie' })), ...(s.results || []).map(x => ({ ...x, vyro_type: 'tv' })), ...(a.results || []).map(x => ({ ...x, vyro_type: 'anime' }))].sort((x,y) => Number(y.popularity || 0) - Number(x.popularity || 0));
    }
    let links = {};
    try { const { getStore } = require('@netlify/blobs'); links = (await getStore('vyro-admin').get('links', { type: 'json' })) || {}; } catch (_) {}
    items = items.map(x => ({ ...x, vyro_watch_url: (links[(x.media_type || (x.vyro_type === 'anime' ? 'tv' : x.vyro_type)) + ':' + x.id] || {}).url || '' }));
    return reply(200, { results: items });
  } catch (e) { return reply(e.status || 502, { error: e.message || 'Error consultando TMDB.' }); }
};
async function tmdb(path, params, token) {
  const url = new URL(API + path); url.searchParams.set('language', 'es-ES');
  Object.entries(params).forEach(([k,v]) => { if (v !== undefined && v !== null && v !== '') url.searchParams.set(k, String(v)); });
  const r = await fetch(url, { headers: { Authorization: 'Bearer ' + token, Accept: 'application/json' } });
  if (!r.ok) { const e = new Error(r.status === 401 ? 'TMDB rechazó la credencial configurada en Netlify.' : 'TMDB respondió con error ' + r.status + '.'); e.status = r.status === 401 ? 502 : r.status; throw e; }
  return r.json();
}
function reply(statusCode, data) { return { statusCode, headers: { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'public, max-age=60' }, body: JSON.stringify(data) }; }
