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
};

const endpoint = 'https://graphql.anilist.co';
const fields = `
  id title { romaji english native } description(asHtml: false)
  coverImage { extraLarge large color } bannerImage averageScore episodes
  status seasonYear format genres duration siteUrl
  studios(isMain: true) { nodes { name } }
  nextAiringEpisode { episode airingAt }
`;

async function query<T>(queryText: string, variables: Record<string, unknown> = {}): Promise<T> {
  const response = await fetch(endpoint, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
    body: JSON.stringify({ query: queryText, variables })
  });
  if (!response.ok) throw new Error(`Anime catalogue request failed (${response.status})`);
  const payload = await response.json();
  if (payload.errors?.length) throw new Error(payload.errors[0].message || 'Catalogue error');
  return payload.data as T;
}

export async function getTrending(): Promise<Anime[]> {
  const data = await query<{ Page: { media: Anime[] } }>(`query { Page(perPage: 12) { media(type: ANIME, sort: TRENDING_DESC, isAdult: false) { ${fields} } } }`);
  return data.Page.media;
}

export async function getPopular(): Promise<Anime[]> {
  const data = await query<{ Page: { media: Anime[] } }>(`query { Page(perPage: 12) { media(type: ANIME, sort: POPULARITY_DESC, isAdult: false) { ${fields} } } }`);
  return data.Page.media;
}

export async function getSeasonal(): Promise<Anime[]> {
  const now = new Date();
  const month = now.getMonth();
  const season = month < 3 ? 'WINTER' : month < 6 ? 'SPRING' : month < 9 ? 'SUMMER' : 'FALL';
  const data = await query<{ Page: { media: Anime[] } }>(
    `query($season: MediaSeason!, $year: Int!) { Page(perPage: 12) { media(type: ANIME, season: $season, seasonYear: $year, sort: POPULARITY_DESC, isAdult: false) { ${fields} } } }`,
    { season, year: now.getFullYear() }
  );
  return data.Page.media;
}

export async function searchAnime(search: string, page = 1, genre?: string): Promise<Anime[]> {
  const data = await query<{ Page: { media: Anime[] } }>(
    `query($search: String, $page: Int, $genre: String) { Page(page: $page, perPage: 24) { media(type: ANIME, search: $search, genre: $genre, sort: SEARCH_MATCH, isAdult: false) { ${fields} } } }`,
    { search: search || undefined, page, genre: genre || undefined }
  );
  return data.Page.media;
}

export async function getAnime(id: number): Promise<Anime | null> {
  const data = await query<{ Media: Anime | null }>(
    `query($id: Int) { Media(id: $id, type: ANIME) { ${fields} } }`,
    { id }
  );
  return data.Media;
}

export const titleOf = (anime: Anime) => anime.title.english || anime.title.romaji || anime.title.native || 'Untitled anime';
export const imageOf = (anime: Anime) => anime.coverImage.extraLarge || anime.coverImage.large || '';
export const cleanDescription = (value = '') => value.replace(/<[^>]*>/g, '').replace(/&#039;/g, "'").replace(/&amp;/g, '&').replace(/&quot;/g, '"');
