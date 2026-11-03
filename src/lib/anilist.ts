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
  chapters?: number;
  volumes?: number;
  popularity?: number;
  favourites?: number;
  meanScore?: number;
  hashtag?: string;
  status?: string;
  seasonYear?: number;
  format?: string;
  genres?: string[];
  studios?: { nodes: { name: string }[] };
  staff?: { edges: AnimeStaff[] };
  duration?: number;
  siteUrl?: string;
  nextAiringEpisode?: { episode: number; airingAt: number };
  trailer?: { id: string; site: string };
  countryOfOrigin?: string;
  source?: string;
  synonyms?: string[];
  startDate?: { year?: number; month?: number; day?: number };
  externalLinks?: AnimeExternalLink[];
  characters?: {
    pageInfo: { currentPage: number; hasNextPage: boolean };
    edges: { role: string; node: AnimeCharacter }[];
  };
};

const endpoint = 'https://graphql.anilist.co';
const fields = `
  id title { romaji english native } description(asHtml: false)
  coverImage { extraLarge large color } bannerImage averageScore meanScore popularity favourites episodes chapters volumes
  status seasonYear format genres duration siteUrl
  studios(isMain: true) { nodes { name } }
  nextAiringEpisode { episode airingAt }
  trailer { id site }
`;
const detailFields = `
  ${fields}
  countryOfOrigin source synonyms startDate { year month day }
  staff(sort: RELEVANCE, perPage: 35) { edges { role node { name { full } } } }
  externalLinks { url site type }
  characters(page: 1, perPage: 50, sort: ROLE) {
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
`;

type AniListResponse<T> = { data?: T; errors?: { message?: string }[] };
const memoryCache = new Map<string, { expires: number; value: unknown }>();
const inFlightRequests = new Map<string, Promise<unknown>>();
const CACHE_TTL = 10 * 60 * 1000;
const DETAIL_CACHE_TTL = 30 * 60 * 1000;
const PERSISTENT_CACHE_KEY = 'rykoc-anilist-cache-v1';
const OFFLINE_CACHE_TTL = 7 * 24 * 60 * 60 * 1000;

function readPersistentCache<T>(key: string): T | null {
  try {
    const store = JSON.parse(localStorage.getItem(PERSISTENT_CACHE_KEY) || '{}') as Record<string, { expires: number; value: T }>;
    const item = store[key];
    return item && item.expires > Date.now() ? item.value : null;
  } catch { return null; }
}

function writePersistentCache(key: string, value: unknown) {
  try {
    const store = JSON.parse(localStorage.getItem(PERSISTENT_CACHE_KEY) || '{}') as Record<string, { expires: number; value: unknown }>;
    store[key] = { expires: Date.now() + OFFLINE_CACHE_TTL, value };
    const entries = Object.entries(store).slice(-60);
    localStorage.setItem(PERSISTENT_CACHE_KEY, JSON.stringify(Object.fromEntries(entries)));
  } catch { /* Browser storage can be full or unavailable; memory caching still works. */ }
}

async function queryUncached<T>(queryText: string, variables: Record<string, unknown> = {}, cacheTtl = CACHE_TTL): Promise<T> {
  const cacheKey = JSON.stringify([queryText, variables]);
  const cached = memoryCache.get(cacheKey);
  if (cached && cached.expires > Date.now()) return cached.value as T;
  const offlineCached = readPersistentCache<T>(cacheKey);
  if (offlineCached) memoryCache.set(cacheKey, { expires: Date.now() + cacheTtl, value: offlineCached });

  let lastError: Error = new Error('Anime catalogue is temporarily unavailable.');
  for (let attempt = 0; attempt < 2; attempt += 1) {
    const controller = new AbortController();
    const timeout = window.setTimeout(() => controller.abort(), 8000);
    try {
      const response = await fetch(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
        body: JSON.stringify({ query: queryText, variables }),
        signal: controller.signal
      });
      window.clearTimeout(timeout);

      // AniList can return useful GraphQL error details with non-2xx responses.
      // Read the body before deciding whether to retry so users see the real cause.
      const rawBody = await response.text();
      let payload: AniListResponse<T> | null = null;
      try { payload = rawBody ? JSON.parse(rawBody) as AniListResponse<T> : null; } catch { /* non-JSON proxy/server response */ }

      if (!response.ok) {
        const retryable = response.status === 429 || response.status >= 500;
        const retryAfter = Number(response.headers.get('Retry-After') || 0);
        const apiMessage = payload?.errors?.map(error => error.message).filter(Boolean).join(' · ');
        lastError = new Error(response.status === 429
          ? 'AniList is receiving too many requests. Please wait a moment.'
          : apiMessage
            ? `AniList rejected the catalogue query: ${apiMessage}`
            : response.status === 400
              ? 'AniList rejected the catalogue request (400). The API did not provide a readable query error.'
              : `Anime catalogue request failed (${response.status}).`);
        if (retryable && attempt < 2) {
          await new Promise(resolve => window.setTimeout(resolve, retryAfter > 0 ? Math.min(retryAfter * 1000, 5000) : 500 * (attempt + 1)));
          continue;
        }
        throw lastError;
      }

      if (!payload) {
        lastError = new Error('AniList returned an unreadable response. Please try again.');
        throw lastError;
      }
      if (payload.data) {
        memoryCache.set(cacheKey, { expires: Date.now() + cacheTtl, value: payload.data });
        writePersistentCache(cacheKey, payload.data);
        if (memoryCache.size > 200) {
          const oldestKey = memoryCache.keys().next().value;
          if (oldestKey) memoryCache.delete(oldestKey);
        }
        return payload.data;
      }
      lastError = new Error(payload.errors?.map(error => error.message).filter(Boolean).join(' · ') || 'AniList returned an incomplete response.');
      if (attempt < 2 && /rate|temporar|timeout|internal/i.test(lastError.message)) {
        await new Promise(resolve => window.setTimeout(resolve, 400 * (attempt + 1)));
        continue;
      }
      throw lastError;
    } catch (error) {
      window.clearTimeout(timeout);
      lastError = error instanceof Error
        ? (error.name === 'AbortError' ? new Error('AniList took too long to respond. Please try again.') : error)
        : new Error('Could not connect to AniList.');
      if (attempt < 2 && (lastError.name === 'AbortError' || /fetch|network|temporar|timed out/i.test(lastError.message))) {
        await new Promise(resolve => window.setTimeout(resolve, 450 * (attempt + 1)));
        continue;
      }
      if (offlineCached) return offlineCached;
      throw lastError;
    }
  }
  if (offlineCached) return offlineCached;
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

export async function getVideoCatalogue(page = 1, genre?: string): Promise<Anime[]> {
  const data = await query<{ Page: { media: Anime[] } }>(
    `query($page: Int, $genre: String) { Page(page: $page, perPage: 50) { media(type: ANIME, genre: $genre, sort: TRENDING_DESC, isAdult: false) { ${fields} } } }`,
    { page, genre: genre || undefined }
  );
  return data.Page?.media || [];
}

export async function getTrending(type: 'ANIME' | 'MANGA' = 'ANIME'): Promise<Anime[]> {
  const data = await query<{ Page: { media: Anime[] } }>(`query($type: MediaType!) { Page(perPage: 12) { media(type: $type, sort: TRENDING_DESC, isAdult: false) { ${fields} } } }`, {type});
  return data.Page?.media || [];
}

export async function getPopular(type: 'ANIME' | 'MANGA' = 'ANIME'): Promise<Anime[]> {
  const data = await query<{ Page: { media: Anime[] } }>(`query($type: MediaType!) { Page(perPage: 12) { media(type: $type, sort: POPULARITY_DESC, isAdult: false) { ${fields} } } }`, {type});
  return data.Page?.media || [];
}

export async function getSeasonal(type: 'ANIME' | 'MANGA' = 'ANIME'): Promise<Anime[]> {
  if (type === 'MANGA') {
    const data = await query<{ Page: { media: Anime[] } }>(`query { Page(perPage: 12) { media(type: MANGA, sort: UPDATED_AT_DESC, isAdult: false) { ${fields} } } }`);
    return data.Page?.media || [];
  }
  const now = new Date();
  const month = now.getMonth();
  const season = month < 3 ? 'WINTER' : month < 6 ? 'SPRING' : month < 9 ? 'SUMMER' : 'FALL';
  const data = await query<{ Page: { media: Anime[] } }>(
    `query($season: MediaSeason!, $year: Int!, $type: MediaType!) { Page(perPage: 12) { media(type: $type, season: $season, seasonYear: $year, sort: POPULARITY_DESC, isAdult: false) { ${fields} } } }`,
    { season, year: now.getFullYear(), type }
  );
  return data.Page?.media || [];
}

export async function searchAnime(search: string, page = 1, genre?: string, status?: string, format?: string, type: 'ANIME' | 'MANGA' = 'ANIME', year?: number, minScore?: number, sort: string = 'SEARCH_MATCH'): Promise<Anime[]> {
  const data = await query<{ Page: { media: Anime[] } }>(
    `query($search: String, $page: Int, $genre: String, $status: MediaStatus, $format: MediaFormat, $type: MediaType!, $year: Int, $minScore: Int, $sort: [MediaSort!]) { Page(page: $page, perPage: 50) { media(type: $type, search: $search, genre: $genre, status: $status, format: $format, seasonYear: $year, averageScore_greater: $minScore, sort: $sort, isAdult: false) { ${fields} } } }`,
    { search: search || undefined, page, genre: genre || undefined, status: status || undefined, format: format || undefined, type, year: year || undefined, minScore: minScore || undefined, sort: [sort] }
  );
  return data.Page?.media || [];
}

export async function getAnime(id: number, type: 'ANIME' | 'MANGA' = 'ANIME'): Promise<Anime | null> {
  if (!Number.isInteger(id) || id <= 0) return null;
  const data = await query<{ Media: Anime | null }>(
    `query($id: Int, $type: MediaType!) { Media(id: $id, type: $type) { ${detailFields} } }`,
    { id, type },
    DETAIL_CACHE_TTL
  );
  return data.Media || null;
}

export async function getAnimeCharacters(id: number, page: number, type: 'ANIME' | 'MANGA' = 'ANIME'): Promise<NonNullable<Anime['characters']>> {
  const data = await query<{ Media: { characters: NonNullable<Anime['characters']> } | null }>(
    `query($id: Int, $page: Int, $type: MediaType!) { Media(id: $id, type: $type) { characters(page: $page, perPage: 50, sort: ROLE) {
      pageInfo { currentPage hasNextPage }
      edges { role node { id name { full native alternative } image { large medium } description(asHtml: false) gender age dateOfBirth { year month day } siteUrl favourites } }
    } } }`,
    { id, page, type },
    DETAIL_CACHE_TTL
  );
  return data.Media?.characters || { pageInfo: { currentPage: page, hasNextPage: false }, edges: [] };
}

export const titleOf = (anime: Anime) => anime.title?.english || anime.title?.romaji || anime.title?.native || 'Untitled title';
export const imageOf = (anime: Anime) => anime.coverImage?.extraLarge || anime.coverImage?.large || anime.bannerImage || '';
export const cleanDescription = (value = '') => value
  .replace(/<[^>]*>/g, ' ')
  .replace(/&lt;/g, '<').replace(/&gt;/g, '>')
  .replace(/&#039;|&#39;/g, "'").replace(/&amp;/g, '&')
  .replace(/&quot;/g, '"').replace(/&#x([0-9a-f]+);/gi, (_, code: string) => String.fromCodePoint(parseInt(code, 16)))
  .replace(/&#(\d+);/g, (_, code: string) => String.fromCodePoint(Number(code)))
  .replace(/\s+/g, ' ').trim();
