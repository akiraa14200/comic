import type { Anime } from './catalogue';

type ProviderResult = { provider: string; anime: Anime };

const clean = (value: unknown) => typeof value === 'string' ? value : '';
const first = (...values: unknown[]) => values.find(value => typeof value === 'string' && value.trim()) as string | undefined;

function mapJikan(item: any, manga: boolean): Anime {
  const title = first(item.title_english, item.title, item.title_japanese) || 'Untitled';
  const image = first(item.images?.webp?.large_image_url, item.images?.jpg?.large_image_url, item.images?.webp?.image_url, item.images?.jpg?.image_url) || '';
  return {
    id: `fallback-jikan-${manga ? 'm' : 'a'}-${item.mal_id}`,
    title: { english: first(item.title_english, item.title), romaji: item.title, native: item.title_japanese },
    description: clean(item.synopsis),
    coverImage: { extraLarge: image, large: image },
    bannerImage: '',
    averageScore: typeof item.score === 'number' ? Math.round(item.score * 10) : undefined,
    episodes: manga ? undefined : item.episodes || undefined,
    status: item.status || 'Unknown',
    seasonYear: item.year || (item.published?.from ? new Date(item.published.from).getFullYear() : undefined),
    format: manga ? 'Manga' : item.type === 'Movie' ? 'Movie' : item.type === 'TV' ? 'TV Series' : item.type || 'Anime',
    genres: [...(item.genres || []), ...(item.themes || [])].map((entry: any) => entry.name).filter(Boolean),
    studios: { nodes: (item.studios || []).map((studio: any) => ({ name: studio.name })) },
    siteUrl: item.url || (manga ? `https://myanimelist.net/manga/${item.mal_id}` : `https://myanimelist.net/anime/${item.mal_id}`),
    trailer: item.trailer?.youtube_id ? { id: item.trailer.youtube_id, site: 'youtube' } : undefined,
    countryOfOrigin: '',
    source: 'MyAnimeList',
    synonyms: item.title_synonyms || [],
    startDate: item.aired?.prop?.from || item.published?.prop?.from || undefined,
    staff: { edges: [] },
    externalLinks: [
      { site: 'MyAnimeList', url: item.url || (manga ? `https://myanimelist.net/manga/${item.mal_id}` : `https://myanimelist.net/anime/${item.mal_id}`) },
      { site: 'AniDB search', url: `https://anidb.net/search?q=${encodeURIComponent(title)}` }
    ],
    characters: { pageInfo: { currentPage: 1, hasNextPage: false }, edges: [] }
  };
}

function mapKitsu(item: any, manga: boolean): Anime {
  const attr = item.attributes || {};
  const titles = attr.titles || {};
  const title = first(attr.canonicalTitle, titles.en, titles.en_jp, titles.ja_jp) || 'Untitled';
  const image = first(attr.posterImage?.large, attr.posterImage?.original, attr.coverImage?.large, attr.coverImage?.original) || '';
  const kitsuType = manga ? 'Manga' : (attr.subtype || 'Anime');
  const url = `https://kitsu.io/${manga ? 'manga' : 'anime'}/${item.id}`;
  return {
    id: `fallback-kitsu-${manga ? 'm' : 'a'}-${item.id}`,
    title: { english: first(titles.en, attr.canonicalTitle), romaji: first(titles.en_jp, attr.canonicalTitle), native: titles.ja_jp },
    description: clean(attr.synopsis),
    coverImage: { extraLarge: image, large: image },
    bannerImage: first(attr.coverImage?.original, attr.coverImage?.large) || '',
    averageScore: Number.isFinite(Number(attr.averageRating)) ? Math.round(Number(attr.averageRating)) : undefined,
    episodes: manga ? undefined : attr.episodeCount || undefined,
    status: attr.status || 'Unknown',
    seasonYear: attr.startDate ? Number(String(attr.startDate).slice(0,4)) || undefined : undefined,
    format: kitsuType,
    genres: [],
    studios: { nodes: [] },
    siteUrl: url,
    source: 'Kitsu',
    synonyms: Object.values(titles).filter((v): v is string => typeof v === 'string' && v !== title),
    startDate: attr.startDate ? { year: Number(String(attr.startDate).slice(0,4)) || undefined } : undefined,
    staff: { edges: [] },
    externalLinks: [{ site: 'Kitsu', url }, { site: 'AniDB search', url: `https://anidb.net/search?q=${encodeURIComponent(title)}` }],
    characters: { pageInfo: { currentPage: 1, hasNextPage: false }, edges: [] }
  };
}

function mapMangaDex(item: any): Anime {
  const attr = item.attributes || {};
  const names = attr.title || {};
  const name = first(names.en, ...Object.values(names)) || 'Untitled';
  const cover = (item.relationships || []).find((r: any) => r.type === 'cover_art')?.attributes?.fileName;
  const image = cover ? `https://uploads.mangadex.org/covers/${item.id}/${cover}.256.jpg` : '';
  return { id: `fallback-mangadex-${item.id}`, title: { english: name, romaji: name }, description: first(attr.description?.en, ...Object.values(attr.description || {})) || '', coverImage: { extraLarge: image, large: image }, status: attr.status || 'Unknown', format: 'Manga', genres: [], studios: { nodes: [] }, siteUrl: `https://mangadex.org/title/${item.id}`, source: 'MangaDex', synonyms: attr.altTitles?.flatMap((x: any) => Object.values(x)) || [], staff: { edges: [] }, externalLinks: [{site:'MangaDex',url:`https://mangadex.org/title/${item.id}`}], characters: { pageInfo: {currentPage:1,hasNextPage:false}, edges: [] } } as Anime;
}

async function fetchJson(url: string, timeoutMs = 7000): Promise<any> {
  const controller = new AbortController();
  const timer = window.setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(url, { headers: { Accept: 'application/json' }, signal: controller.signal });
    if (!response.ok) throw new Error(`Provider returned ${response.status}`);
    return await response.json();
  } finally { window.clearTimeout(timer); }
}

export async function getFallbackMetadataById(id: string): Promise<Anime | null> {
  const jikan = id.match(/^fallback-jikan-([am])-(\\d+)$/);
  if (jikan) {
    const manga = jikan[1] === 'm';
    const data = await fetchJson(`https://api.jikan.moe/v4/${manga ? 'manga' : 'anime'}/${jikan[2]}/full`);
    return data.data ? mapJikan(data.data, manga) : null;
  }
  const kitsu = id.match(/^fallback-kitsu-([am])-(\\d+)$/);
  if (kitsu) {
    const manga = kitsu[1] === 'm';
    const data = await fetchJson(`https://kitsu.io/api/edge/${manga ? 'manga' : 'anime'}/${kitsu[2]}`);
    return data.data ? mapKitsu(data.data, manga) : null;
  }
  const mangadex = id.match(/^fallback-mangadex-([0-9a-f-]{36})$/i);
  if (mangadex) {
    const data = await fetchJson(`https://api.mangadex.org/manga/${mangadex[1]}?includes[]=cover_art`);
    return data.data ? mapMangaDex(data.data) : null;
  }
  return null;
}

export async function searchFallbackMetadata(title: string, manga = false): Promise<ProviderResult[]> {
  const query = title.trim();
  if (query.length < 2) return [];
  const encoded = encodeURIComponent(query);
  const results: ProviderResult[] = [];
  const providers = manga
    ? [
        { name: 'Jikan / MyAnimeList', run: async () => (await fetchJson(`https://api.jikan.moe/v4/manga?q=${encoded}&limit=5&sfw=true`)).data?.map((item: any) => mapJikan(item, true)) || [] },
        { name: 'Kitsu', run: async () => (await fetchJson(`https://kitsu.io/api/edge/manga?filter[text]=${encoded}&page[limit]=5`)).data?.map((item: any) => mapKitsu(item, true)) || [] },
        { name: 'MangaDex', run: async () => {
          const data = await fetchJson(`https://api.mangadex.org/manga?title=${encoded}&limit=5&includes[]=cover_art&contentRating[]=safe&contentRating[]=suggestive`);
return (data.data || []).map(mapMangaDex);
        } }
      ]
    : [
        { name: 'Jikan / MyAnimeList', run: async () => (await fetchJson(`https://api.jikan.moe/v4/anime?q=${encoded}&limit=5&sfw=true`)).data?.map((item: any) => mapJikan(item, false)) || [] },
        { name: 'Kitsu', run: async () => (await fetchJson(`https://kitsu.io/api/edge/anime?filter[text]=${encoded}&page[limit]=5`)).data?.map((item: any) => mapKitsu(item, false)) || [] }
      ];
  const responses = await Promise.allSettled(providers.map(async provider => ({ provider: provider.name, items: await provider.run() })));
  responses.forEach(response => {
    if (response.status === 'fulfilled') response.value.items.forEach((anime: Anime) => results.push({ provider: response.value.provider, anime }));
  });
  const seen = new Set<string>();
  return results.filter(result => {
    const key = result.anime.title.english || result.anime.title.romaji || result.anime.id;
    const normalized = key.toLowerCase().replace(/[^a-z0-9]/g, '');
    if (seen.has(normalized)) return false;
    seen.add(normalized); return true;
  }).slice(0, 12);
}
