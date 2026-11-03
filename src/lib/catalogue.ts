import { supabase } from './supabase';

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
export type AnimeExternalLink = { url: string; site: string; type?: string };\nexport type RelatedVideo = { id: string; titleId: string; videoUrl: string; platform: 'youtube' | 'instagram' | 'dailymotion'; videoTitle: string; creatorName: string; creatorAvatarUrl: string; actionType: 'read' | 'watch'; actionUrl: string; sortOrder: number; createdAt: string; titleName?: string; titleCover?: string; titleFormat?: string; releaseYear?: number };
export type Anime = {
  id: string;
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
  trailerUrl?: string;\n  relatedVideos?: RelatedVideo[];
  countryOfOrigin?: string;
  source?: string;
  synonyms?: string[];
  startDate?: { year?: number; month?: number; day?: number };
  staff?: { edges: AnimeStaff[] };
  externalLinks?: AnimeExternalLink[];
  characters?: { pageInfo: { currentPage: number; hasNextPage: boolean }; edges: { role: string; node: AnimeCharacter }[] };
};
type TitleRow = {
  id: string; name: string; alternative_names?: string[]; media_type?: string; synopsis?: string;
  cover_url?: string; banner_url?: string; genres?: string[]; themes?: string[]; status?: string;
  release_year?: number; season?: string; rating?: number; popularity?: number; chapters?: string;
  episodes?: string; author?: string; artist?: string; studio?: string; country?: string;
  source_url?: string; anilist_id?: number; trailer_url?: string; is_trending?: boolean; is_featured?: boolean;
};
type CharacterRow = { id: string; name: string; role?: string; description?: string; image_url?: string };
const cache = new Map<string, { at: number; value: unknown }>();
const TTL = 90_000;
const hashId = (value: string) => Array.from(value).reduce((h, c) => ((h * 31 + c.charCodeAt(0)) >>> 0), 7);
const youtubeId = (url = '') => {
  try {
    const parsed = new URL(url);
    const host = parsed.hostname.replace(/^www\./, '').toLowerCase();
    if (host === 'youtu.be') return parsed.pathname.split('/').filter(Boolean)[0] || '';
    if (host.endsWith('youtube.com') || host.endsWith('youtube-nocookie.com')) {
      if (parsed.pathname === '/watch') return parsed.searchParams.get('v') || '';
      const parts = parsed.pathname.split('/').filter(Boolean);
      if (['embed', 'shorts', 'live'].includes(parts[0])) return parts[1] || '';
    }
  } catch { /* invalid or non-YouTube URL */ }
  return '';
};

type RelatedVideoRow = {
  id: string; title_id: string; video_url: string; platform: 'youtube' | 'instagram' | 'dailymotion';
  video_title?: string; creator_name?: string; creator_avatar_url?: string; action_type?: 'read' | 'watch';
  action_url?: string; sort_order?: number; created_at: string;
};
const mapRelatedVideo = (row: RelatedVideoRow): RelatedVideo => ({
  id: row.id, titleId: row.title_id, videoUrl: row.video_url, platform: row.platform,
  videoTitle: row.video_title || '', creatorName: row.creator_name || '',
  creatorAvatarUrl: row.creator_avatar_url || '', actionType: row.action_type || 'watch',
  actionUrl: row.action_url || row.video_url, sortOrder: row.sort_order || 0, createdAt: row.created_at
});
export async function getRelatedVideos(page = 1, titleId?: string): Promise<RelatedVideo[]> {
  const from = (page - 1) * 40;
  let request = supabase.from('related_videos').select('id,title_id,video_url,platform,video_title,creator_name,creator_avatar_url,action_type,action_url,sort_order,created_at').order('sort_order', { ascending: true }).order('created_at', { ascending: false }).range(from, from + 39);
  if (titleId) request = request.eq('title_id', titleId);
  const { data, error } = await request;
  throwIf(error);
  const videos = ((data || []) as RelatedVideoRow[]).map(mapRelatedVideo);
  const titleIds = [...new Set(videos.map(video => video.titleId))];
  if (titleIds.length) {
    const { data: titles, error: titleError } = await supabase.from('titles').select('id,name,cover_url,media_type,release_year').in('id', titleIds);
    throwIf(titleError);
    const byId = new Map((titles || []).map((title: any) => [title.id, title]));
    videos.forEach(video => {
      const title: any = byId.get(video.titleId);
      if (title) { video.titleName = title.name; video.titleCover = title.cover_url; video.titleFormat = title.media_type; video.releaseYear = title.release_year; }
    });
  }
  return videos;
}
\nconst mapTitle = (row: TitleRow): Anime => {
  const trailerId = youtubeId(row.trailer_url || '');
  return {
    id: row.id,
    title: { english: row.name, romaji: row.name, native: row.alternative_names?.[0] },
    description: row.synopsis || '',
    coverImage: { extraLarge: row.cover_url || '', large: row.cover_url || '' },
    bannerImage: row.banner_url || '',
    averageScore: row.rating == null ? undefined : Math.round(row.rating * 10),
    episodes: Number(row.episodes) || undefined,
    status: row.status || 'Unknown',
    seasonYear: row.release_year || undefined,
    format: row.media_type || 'Anime',
    genres: row.genres || [],
    studios: { nodes: row.studio ? [{ name: row.studio }] : [] },
    siteUrl: row.source_url || '',
    trailer: trailerId ? { id: trailerId, site: 'youtube' } : undefined,
    trailerUrl: row.trailer_url || '',
    countryOfOrigin: row.country || '',
    source: row.author || '',
    synonyms: row.alternative_names || [],
    startDate: row.release_year ? { year: row.release_year } : undefined,
    staff: { edges: [] },
    externalLinks: row.source_url ? [{ url: row.source_url, site: 'Source' }] : [],
    characters: { pageInfo: { currentPage: 1, hasNextPage: false }, edges: [] }
  };
};
async function cached<T>(key: string, load: () => Promise<T>): Promise<T> {
  const old = cache.get(key);
  if (old && Date.now() - old.at < TTL) return old.value as T;
  const value = await load();
  cache.set(key, { at: Date.now(), value });
  if (cache.size > 100) cache.delete(cache.keys().next().value || '');
  return value;
}
function throwIf(error: { message: string } | null) { if (error) throw new Error(error.message); }
async function fetchTitles(query: any): Promise<Anime[]> {
  const { data, error } = await query;
  throwIf(error);
  return ((data || []) as TitleRow[]).map(mapTitle);
}
export async function getTrending(): Promise<Anime[]> {
  return cached('trending', () => fetchTitles(supabase.from('titles').select('*').or('is_featured.eq.true,is_trending.eq.true').order('popularity', { ascending: false }).limit(18)));
}
export async function getPopular(): Promise<Anime[]> {
  return cached('popular', () => fetchTitles(supabase.from('titles').select('*').order('popularity', { ascending: false }).limit(18)));
}
export async function getSeasonal(): Promise<Anime[]> {
  return cached('seasonal', () => fetchTitles(supabase.from('titles').select('*').in('status', ['Airing','Ongoing']).order('release_year', { ascending: false }).limit(18)));
}
export async function getVideoCatalogue(page = 1, genre?: string): Promise<Anime[]> {
  const from = (page - 1) * 50;
  let request = supabase.from('titles').select('*').not('trailer_url', 'is', null).neq('trailer_url', '').order('popularity', { ascending: false }).range(from, from + 49);
  if (genre) request = request.contains('genres', [genre]);
  return fetchTitles(request);
}
export async function searchAnime(search: string, page = 1, genre?: string, status?: string, format?: string): Promise<Anime[]> {
  const from = (page - 1) * 50;
  let request = supabase.from('titles').select('*').order('popularity', { ascending: false }).range(from, from + 49);
  if (search.trim()) request = request.or(`name.ilike.%${search.trim().replace(/[(),]/g, ' ')}%,synopsis.ilike.%${search.trim().replace(/[(),]/g, ' ')}%`);
  if (genre) request = request.contains('genres', [genre]);
  if (status) {
    const mapped: Record<string,string> = { RELEASING: 'Airing', FINISHED: 'Completed', NOT_YET_RELEASED: 'Upcoming', HIATUS: 'Hiatus' };
    request = request.eq('status', mapped[status] || status);
  }
  if (format) request = request.eq('media_type', format);
  return fetchTitles(request);
}
export async function getAnime(id: string): Promise<Anime | null> {
  if (!id) return null;
  return cached(`detail:${id}`, async () => {
    const { data, error } = await supabase.from('titles').select('*').eq('id', id).maybeSingle();
    throwIf(error);
    if (!data) return null;
    const anime = mapTitle(data as TitleRow);
    const { data: characters, error: characterError } = await supabase.from('characters').select('*').eq('title_id', id).order('created_at').limit(50);
    throwIf(characterError);
    anime.characters = {
      pageInfo: { currentPage: 1, hasNextPage: false },
      edges: ((characters || []) as CharacterRow[]).map(row => ({
        role: row.role || 'Supporting',
        node: { id: hashId(row.id), name: { full: row.name }, image: { large: row.image_url || '', medium: row.image_url || '' }, description: row.description || '', role: row.role || 'Supporting' }
      }))
    };
    return anime;
  });
}
export async function getAnimeCharacters(id: string, page: number): Promise<NonNullable<Anime['characters']>> {
  if (page > 1) return { pageInfo: { currentPage: page, hasNextPage: false }, edges: [] };
  const anime = await getAnime(id);
  return anime?.characters || { pageInfo: { currentPage: page, hasNextPage: false }, edges: [] };
}
export const titleOf = (anime: Anime) => anime.title?.english || anime.title?.romaji || anime.title?.native || 'Untitled';
export const imageOf = (anime: Anime) => anime.coverImage?.extraLarge || anime.coverImage?.large || anime.bannerImage || '';
export const cleanDescription = (value = '') => value.replace(/<[^>]*>/g, ' ').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&#039;|&#39;/g, "'").replace(/&amp;/g, '&').replace(/&quot;/g, '"').replace(/\s+/g, ' ').trim();
