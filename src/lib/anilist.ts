export type AnimeCharacter = {
  id: number;
  name: { full?: string; native?: string; alternative?: string[] };
  image?: { large?: string; medium?: string };
  description?: string;
  gender?: string;
  age?: string;
  dateOfBirth?: { year?: number; month?: number; day?: number };
  siteUrl?: string;
  favourites?: number;
  role?: string;
};

export type AnimeStaff = { role: string; node: { name: { full?: string } } };
export type AnimeExternalLink = { url: string; site: string; type?: string };
export type Anime = {
  id: number;
  title: { romaji?: string; english?: string; native?: string };
  description?: string;
  coverImage: { extraLarge?: string; large?: string; color?: string };
  bannerImage?: string;
  averageScore?: number;
  episodes?: number;
  status?: string;
  seasonYear?: number;
  format?: string;
  genres?: string[];
  studios?: { nodes: { name: string }[] };
  duration?: number;
  siteUrl?: string;
  nextAiringEpisode?: { episode: number; airingAt: number };
  trailer?: { id: string; site: string };
  countryOfOrigin?: string;
  source?: string;
  synonyms?: string[];
  startDate?: { year?: number; month?: number; day?: number };
  staff?: { edges: AnimeStaff[] };
  externalLinks?: AnimeExternalLink[];
  characters?: {
    pageInfo: { currentPage: number; hasNextPage: boolean };
    edges: { role: string; node: AnimeCharacter }[];
  };
};

import { supabase } from './supabase';
const fields = `
  id title { romaji english native } description(asHtml: false)
  coverImage { extraLarge large color } bannerImage averageScore episodes
  status seasonYear format genres duration countryOfOrigin siteUrl
  studios(isMain: true) { nodes { name } }
  nextAiringEpisode { episode airingAt }
  trailer { id site }
`;
type AniListResponse<T> = { data?: T; errors?: { message?: string }[] };
const memoryCache = new Map<string, { expires: number; value: unknown }>();
const inFlightRequests = new Map<string, Promise<unknown>>();
const CACHE_TTL = 10 * 60 * 1000;
const DETAIL_CACHE_TTL = 30 * 60 * 1000;

async function queryUncached<T>(queryText: string, variables: Record<string, unknown> = {}, cacheTtl = CACHE_TTL): Promise<T> {
  const cacheKey = JSON.stringify([queryText, variables]);
  const cached = memoryCache.get(cacheKey);
  if (cached && cached.expires > Date.now()) return cached.value as T;

  let lastError: Error = new Error('AniList catalogue is temporarily unavailable.');
  for (let attempt = 0; attempt < 3; attempt += 1) {
    try {
      // Use the server-side gateway first. It calls AniList with server headers
      // and retries through AniList's own website GraphQL route if needed.
      const { data: gatewayPayload, error: gatewayError } = await supabase.functions.invoke<AniListResponse<T> & { _meta?: { route?: string; fallback?: boolean } }>(
        'anilist-gateway',
        { body: { query: queryText, variables } }
      );

      if (gatewayError) {
        lastError = new Error(`AniList gateway request failed: ${gatewayError.message || 'unknown gateway error'}`);
      } else if (gatewayPayload?.data) {
        memoryCache.set(cacheKey, { expires: Date.now() + cacheTtl, value: gatewayPayload.data });
        if (memoryCache.size > 200) {
          const oldestKey = memoryCache.keys().next().value;
          if (oldestKey) memoryCache.delete(oldestKey);
        }
        return gatewayPayload.data;
      } else {
        const message = gatewayPayload?.errors?.map(error => error.message).filter(Boolean).join(' · ')
          || 'AniList gateway returned an incomplete response.';
        lastError = new Error(message);
        if (!/rate|temporar|timeout|internal|429|503/i.test(message) || attempt === 2) throw lastError;
      }
    } catch (error) {
      lastError = error instanceof Error ? error : new Error('Could not connect to AniList.');
      if (attempt === 2 || !/fetch|network|temporar|timeout|429|503|gateway/i.test(lastError.message)) throw lastError;
    }

    if (attempt < 2) await new Promise(resolve => window.setTimeout(resolve, 600 * (attempt + 1)));
  }
  throw lastError;
}

async function query<T>(queryText: string, variables: Record<string, unknown> = {}, cacheTtl = CACHE_TTL): Promise<T> {
  const key = JSON.stringify([queryText, variables]);
  const existing = inFlightRequests.get(key);
  if (existing) return existing as Promise<T>;
  const request = queryUncached<T>(queryText, variables, cacheTtl);
  inFlightRequests.set(key, request);
  try { return await request; }
  finally { inFlightRequests.delete(key); }
}

export async function getVideoCatalogue(page = 1, genre?: string, mediaType: 'ANIME' | 'MANGA' = 'ANIME'): Promise<Anime[]> {
  const data = await query<{ Page: { media: Anime[] } }>(
    `query($page: Int, $genre: String, $type: MediaType!) { Page(page: $page, perPage: 50) { media(type: $type, genre: $genre, sort: TRENDING_DESC, isAdult: false) { ${fields} } } }`,
    { page, genre: genre || undefined, type: mediaType }
  );
  return data.Page?.media || [];
}

export async function getMangaVideoCatalogue(page = 1, genre?: string): Promise<Anime[]> {
  return getVideoCatalogue(page, genre, 'MANGA');
}
export async function getTrendingManga(): Promise<Anime[]> {
  const data = await query<{ Page: { media: Anime[] } }>(
    `query { Page(perPage: 18) { media(type: MANGA, sort: TRENDING_DESC, isAdult: false) { ${fields} } } }`
  );
  return data.Page?.media || [];
}

export async function getPopularManga(): Promise<Anime[]> {
  const data = await query<{ Page: { media: Anime[] } }>(
    `query { Page(perPage: 18) { media(type: MANGA, sort: POPULARITY_DESC, isAdult: false) { ${fields} } } }`
  );
  return data.Page?.media || [];
}

export async function searchMedia(
  search = '',
  page = 1,
  genre?: string,
  status?: string,
  format?: string,
  mediaType?: 'ANIME' | 'MANGA',
  country?: 'KR' | 'CN'
): Promise<Anime[]> {
  const validFormats = ['TV','TV_SHORT','MOVIE','SPECIAL','OVA','ONA','MUSIC','MANGA','NOVEL','ONE_SHOT'];
  const apiFormat = format && validFormats.includes(format) ? format : undefined;
  const data = await query<{ Page: { media: Anime[] } }>(
    `query($search: String, $page: Int, $genre: String, $status: MediaStatus, $format: MediaFormat, $type: MediaType, $country: CountryCode, $sort: [MediaSort]) {
      Page(page: $page, perPage: 50) {
        media(type: $type, search: $search, genre: $genre, status: $status, format: $format, countryOfOrigin: $country, sort: $sort, isAdult: false) { ${fields} }
      }
    }`,
    {
      search: search.trim() || undefined,
      page,
      genre: genre || undefined,
      status: status || undefined,
      format: apiFormat,
      type: mediaType,
      country,
      sort: search.trim() ? ['SEARCH_MATCH'] : ['POPULARITY_DESC']
    }
  );
  return data.Page?.media || [];
}

export async function getAniListMediaById(id: number, mediaType: 'ANIME' | 'MANGA' = 'ANIME'): Promise<Anime | null> {
  if (!Number.isInteger(id) || id <= 0) return null;
  const data = await query<{ Media: Anime | null }>(
    `query($id: Int!, $type: MediaType!) { Media(id: $id, type: $type) { ${fields} source synonyms startDate { year month day } } }`,
    { id, type: mediaType },
    DETAIL_CACHE_TTL
  );
  const media = data.Media;
  if (!media) return null;

  // Keep essential title/cover fields independent from optional cast/staff fields.
  // A single optional GraphQL field must never make the whole detail page disappear.
  const [extras, characters] = await Promise.allSettled([
    query<{ Media: Pick<Anime, 'staff' | 'externalLinks'> | null }>(
      `query($id: Int!, $type: MediaType!) { Media(id: $id, type: $type) { staff(sort: RELEVANCE, perPage: 35) { edges { role node { name { full } } } } externalLinks { url site type } } }`,
      { id, type: mediaType }, DETAIL_CACHE_TTL
    ),
    getMediaCharacters(id, 1, mediaType)
  ]);
  if (extras.status === 'fulfilled' && extras.value.Media) {
    media.staff = extras.value.Media.staff;
    media.externalLinks = extras.value.Media.externalLinks;
  }
  if (characters.status === 'fulfilled') media.characters = characters.value;
  else media.characters = { pageInfo: { currentPage: 1, hasNextPage: false }, edges: [] };
  return media;
}


export async function getTrending(): Promise<Anime[]> {
  const data = await query<{ Page: { media: Anime[] } }>(`query { Page(perPage: 12) { media(type: ANIME, sort: TRENDING_DESC, isAdult: false) { ${fields} } } }`);
  return data.Page?.media || [];
}

export async function getPopular(): Promise<Anime[]> {
  const data = await query<{ Page: { media: Anime[] } }>(`query { Page(perPage: 12) { media(type: ANIME, sort: POPULARITY_DESC, isAdult: false) { ${fields} } } }`);
  return data.Page?.media || [];
}

export async function getSeasonal(): Promise<Anime[]> {
  const now = new Date();
  const month = now.getMonth();
  const season = month < 3 ? 'WINTER' : month < 6 ? 'SPRING' : month < 9 ? 'SUMMER' : 'FALL';
  const data = await query<{ Page: { media: Anime[] } }>(
    `query($season: MediaSeason!, $year: Int!) { Page(perPage: 12) { media(type: ANIME, season: $season, seasonYear: $year, sort: POPULARITY_DESC, isAdult: false) { ${fields} } } }`,
    { season, year: now.getFullYear() }
  );
  return data.Page?.media || [];
}

export async function searchAnime(search: string, page = 1, genre?: string, status?: string, format?: string): Promise<Anime[]> {
  const data = await query<{ Page: { media: Anime[] } }>(
    `query($search: String, $page: Int, $genre: String, $status: MediaStatus, $format: MediaFormat) { Page(page: $page, perPage: 50) { media(type: ANIME, search: $search, genre: $genre, status: $status, format: $format, sort: SEARCH_MATCH, isAdult: false) { ${fields} } } }`,
    { search: search || undefined, page, genre: genre || undefined, status: status || undefined, format: format || undefined }
  );
  return data.Page?.media || [];
}

export async function getAnime(id: number): Promise<Anime | null> {
  return getAniListMediaById(id, 'ANIME');
}

export async function getMediaCharacters(
  id: number,
  page = 1,
  mediaType: 'ANIME' | 'MANGA' = 'ANIME'
): Promise<NonNullable<Anime['characters']>> {
  if (!Number.isInteger(id) || id <= 0 || !Number.isInteger(page) || page < 1) {
    return { pageInfo: { currentPage: Math.max(1, page || 1), hasNextPage: false }, edges: [] };
  }
  const data = await query<{ Media: { characters: NonNullable<Anime['characters']> } | null }>(
    `query($id: Int!, $page: Int!, $type: MediaType!) {
      Media(id: $id, type: $type) {
        characters(page: $page, perPage: 30, sort: ROLE) {
          pageInfo { currentPage hasNextPage }
          edges {
            role
            node {
              id name { full native alternative } image { large medium }
              description(asHtml: false) gender age dateOfBirth { year month day }
              siteUrl favourites
            }
          }
        }
      }
    }`,
    { id, page, type: mediaType },
    DETAIL_CACHE_TTL
  );
  return data.Media?.characters || { pageInfo: { currentPage: page, hasNextPage: false }, edges: [] };
}

export async function getAnimeCharacters(id: number, page: number): Promise<NonNullable<Anime['characters']>> {
  return getMediaCharacters(id, page, 'ANIME');
}

export async function getMangaCharacters(id: number, page = 1): Promise<NonNullable<Anime['characters']>> {
  return getMediaCharacters(id, page, 'MANGA');
}

export const titleOf = (anime: Anime) => anime.title?.english || anime.title?.romaji || anime.title?.native || 'Untitled anime';
export const imageOf = (anime: Anime) => anime.coverImage?.extraLarge || anime.coverImage?.large || anime.bannerImage || '';
export const cleanDescription = (value = '') => value
  .replace(/<[^>]*>/g, ' ')
  .replace(/&lt;/g, '<').replace(/&gt;/g, '>')
  .replace(/&#039;|&#39;/g, "'").replace(/&amp;/g, '&')
  .replace(/&quot;/g, '"').replace(/&#x([0-9a-f]+);/gi, (_, code: string) => String.fromCodePoint(parseInt(code, 16)))
  .replace(/&#(\d+);/g, (_, code: string) => String.fromCodePoint(Number(code)))
  .replace(/\s+/g, ' ').trim();
