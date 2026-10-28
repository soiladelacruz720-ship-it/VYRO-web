
const API = "https://api.themoviedb.org/3";

export async function onRequest(context) {
  const token = context.env.TMDB_API_TOKEN;

  const json = (data, status = 200) =>
    Response.json(data, {
      status,
      headers: { "Cache-Control": "public, max-age=60" }
    });

  if (!token) {
    return json({ error: "Falta configurar TMDB_API_TOKEN en Cloudflare." }, 500);
  }

  const url = new URL(context.request.url);
  const tipo = url.searchParams.get("tipo") || "Todos";
  const pagina = Math.max(
    1,
    Math.min(500, parseInt(url.searchParams.get("pagina") || "1", 10) || 1)
  );
  const buscar = (url.searchParams.get("buscar") || "").trim().slice(0, 100);

  async function tmdb(path, params = {}) {
    const target = new URL(API + path);
    target.searchParams.set("language", "es-ES");

    for (const [key, value] of Object.entries(params)) {
      if (value !== undefined && value !== null && value !== "") {
        target.searchParams.set(key, String(value));
      }
    }

    const response = await fetch(target, {
      headers: {
        Authorization: `Bearer ${token}`,
        Accept: "application/json"
      }
    });

    if (!response.ok) {
      throw new Error(`TMDB respondió con error ${response.status}.`);
    }

    return response.json();
  }

  try {
    let items = [];

    if (buscar) {
      const data = await tmdb("/search/multi", {
        query: buscar,
        page: pagina,
        include_adult: "false"
      });

      items = (data.results || [])
        .filter(x => x.media_type === "movie" || x.media_type === "tv")
        .map(x => ({ ...x, vyro_type: x.media_type }));
    } else {
      const requests = [];

      if (tipo === "Película" || tipo === "Todos") {
        requests.push(
          tmdb("/movie/popular", { page: pagina, region: "DO" })
            .then(d => (d.results || []).map(x => ({ ...x, vyro_type: "movie" })))
        );
      }

      if (tipo === "Serie" || tipo === "Todos") {
        requests.push(
          tmdb("/tv/popular", { page: pagina })
            .then(d => (d.results || []).map(x => ({ ...x, vyro_type: "tv" })))
        );
      }

      if (tipo === "Anime" || tipo === "Todos") {
        requests.push(
          tmdb("/discover/tv", {
            page: pagina,
            with_genres: "16",
            with_origin_country: "JP",
            sort_by: "popularity.desc"
          }).then(d => (d.results || []).map(x => ({ ...x, vyro_type: "anime" })))
        );
      }

      const groups = await Promise.all(requests);
      items = groups.flat().sort(
        (a, b) => Number(b.popularity || 0) - Number(a.popularity || 0)
      );
    }

    return json({
      results: items.map(x => ({ ...x, vyro_watch_url: "" }))
    });
  } catch (error) {
    return json({ error: error.message || "Error consultando TMDB." }, 502);
  }
}

