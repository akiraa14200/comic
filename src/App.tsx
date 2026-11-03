import { useEffect, useState, type FormEvent } from 'react';
import { Link, Route, Routes, useNavigate, useParams, useLocation } from 'react-router-dom';
import { Search, Compass, Bookmark, ShieldCheck, Play, Star, ChevronRight, ArrowLeft, Heart, Clock3, Menu, X, ExternalLink, SlidersHorizontal, Sparkles, Tv, Info, Users, FileText, Globe, Youtube, ChevronDown, RotateCw, MessageCircle, Home as HomeIcon, UserRound, ChevronLeft, Download, Upload, FolderOpen, MoreVertical, Settings as SettingsIcon, Moon, Eye, RotateCw, Trash2, Palette, Github, HeartHandshake, Database, Bell } from 'lucide-react';
// The application UI and page components are defined below.
import { applyLibraryBackup, isNativeAndroid, LibraryBackup, makeLibraryBackup, scheduleNativeLibraryBackup } from './lib/libraryBackup';
import { Anime, AnimeCharacter, cleanDescription, getAnime, getAnimeCharacters, getPopular, getSeasonal, getTrending, getVideoCatalogue, imageOf, searchAnime, titleOf } from './lib/anilist';
import type { User } from '@supabase/supabase-js';
import { supabase } from './lib/supabase';
import { AnimeComments } from './components/AnimeComments';
import { SmartDiscovery } from './components/SmartDiscovery';

type StoredProgress = { id: number; title: string; image: string; progress: number; updated: number };
const readStore = <T,>(key: string, fallback: T): T => {
  try { const value = localStorage.getItem(key); return value ? JSON.parse(value) as T : fallback; } catch { return fallback; }
};

type CatalogueMode = 'anime' | 'manga';
function Header({ user, onSignOut, mode, onModeChange }: { user: User | null; onSignOut: () => void; mode: CatalogueMode; onModeChange: (mode: CatalogueMode) => void }) {
  const [open, setOpen] = useState(false);
  const [quickMenuOpen, setQuickMenuOpen] = useState(false);
  const [term, setTerm] = useState('');
  const navigate = useNavigate();
  const location = useLocation();
  useEffect(() => { setOpen(false); setQuickMenuOpen(false); }, [location.pathname]);
  const submit = (event: FormEvent) => { event.preventDefault(); navigate(term.trim() ? `/search?q=${encodeURIComponent(term.trim())}` : '/search'); setOpen(false); };
  return <header className="topbar"><div className="nav-wrap">
    <Link to="/" className="brand"><span className="brand-mark">R</span><span>RYKOCCLLECTION</span></Link><button className="mode-switch" onClick={()=>onModeChange(mode === 'anime' ? 'manga' : 'anime')}><span className={mode==='anime'?'mode-active':''}>Anime</span><span className={mode==='manga'?'mode-active':''}>Manga</span></button>
    <nav className={open ? 'nav-links open' : 'nav-links'}>
      <Link to="/"><Compass size={16}/> Discover</Link><Link to="/search">Explore</Link><Link to="/smart-discovery"><Sparkles size={16}/> Smart hub</Link><Link to="/watchlist"><Bookmark size={16}/> My list</Link><Link to="/video"><Tv size={16}/> Video</Link><Link to="/privacy"><ShieldCheck size={16}/> Privacy</Link>
    </nav>
    <form className="nav-search" onSubmit={submit}><Search size={17}/><input value={term} onChange={e => setTerm(e.target.value)} placeholder={`Search ${mode}...`} aria-label={`Search ${mode}`}/><kbd>↵</kbd></form>
    {user && <div className="nav-account"><span>{String(user.user_metadata?.display_name || "Reader")}</span><button onClick={onSignOut}>Sign out</button></div>}
    <div className="quick-menu-wrap"><button className="icon-btn quick-menu-trigger" onClick={()=>setQuickMenuOpen(value=>!value)} aria-label="Open more options" aria-expanded={quickMenuOpen} aria-haspopup="menu"><MoreVertical size={20}/></button>{quickMenuOpen && <><button className="quick-menu-dismiss" aria-label="Close menu" onClick={()=>setQuickMenuOpen(false)}/><div className="quick-menu-panel" role="menu"><div className="quick-menu-heading">RYKOCCLLECTION</div><Link role="menuitem" to="/settings"><SettingsIcon size={17}/>Settings<ChevronRight size={15}/></Link><Link role="menuitem" to="/about"><Info size={17}/>About<ChevronRight size={15}/></Link></div></>}</div>
    <button className="icon-btn mobile-menu" onClick={() => setOpen(!open)} aria-label="Toggle menu">{open ? <X/> : <Menu/>}</button>
  </div></header>;
}

function AnimeCard({ anime, onSave, saved, mode = 'anime' }: { anime: Anime; onSave: (anime: Anime) => void; saved: boolean; mode?: CatalogueMode }) {
  return <article className="anime-card">
    <Link to={`/${mode}/${anime.id}`} className="poster-wrap">
      <img src={imageOf(anime)} alt={titleOf(anime)} loading="lazy" decoding="async"/>
      <span className="poster-format">{anime.format || 'ANIME'}</span>
      {anime.averageScore ? <span className="poster-score"><Star size={12} fill="currentColor"/> {(anime.averageScore / 10).toFixed(1)}</span> : null}
    </Link>
    <div className="card-meta"><div className="card-title-row"><Link to={`/${mode}/${anime.id}`} className="card-title">{titleOf(anime)}</Link><button className={saved ? 'save-mini saved' : 'save-mini'} onClick={() => onSave(anime)} aria-label={saved ? 'Remove from watchlist' : 'Add to watchlist'}><Bookmark size={15} fill={saved ? 'currentColor' : 'none'}/></button></div><p>{anime.seasonYear || 'Year unknown'} <span>·</span> {mode === 'manga' ? (anime.chapters ? `${anime.chapters} ch` : anime.volumes ? `${anime.volumes} vols` : anime.status?.replaceAll('_',' ') || 'Manga') : (anime.episodes ? `${anime.episodes} eps` : 'Ongoing')}</p></div>
  </article>;
}

function Section({ title, subtitle, items, saved, onSave, to, mode = 'anime' }: { title: string; subtitle?: string; items: Anime[]; saved: number[]; onSave: (anime: Anime) => void; to?: string; mode?: CatalogueMode }) {
  if (!items.length) return null;
  return <section className="section"><div className="section-head"><div><h2>{title}</h2>{subtitle && <p>{subtitle}</p>}</div>{to && <Link to={to} className="text-link">View all <ChevronRight size={16}/></Link>}</div><div className="anime-grid">{items.map(item => <AnimeCard key={item.id} anime={item} saved={saved.includes(item.id)} onSave={onSave} mode={mode}/>)}</div></section>;
}

function useLibrary() {
  const [saved, setSaved] = useState<Anime[]>(() => readStore<Anime[]>('kairo-watchlist', []));
  const [history, setHistory] = useState<StoredProgress[]>(() => readStore<StoredProgress[]>('kairo-history', []));
  const [statuses, setStatuses] = useState<Record<number, 'Watching' | 'Plan to Watch' | 'Completed' | 'Waiting'>>(() => readStore('rykoc-library-status', {}));
  useEffect(() => localStorage.setItem('kairo-watchlist', JSON.stringify(saved)), [saved]);
  useEffect(() => localStorage.setItem('kairo-history', JSON.stringify(history)), [history]);
  useEffect(() => localStorage.setItem('rykoc-library-status', JSON.stringify(statuses)), [statuses]);
  useEffect(() => { scheduleNativeLibraryBackup(); }, [saved, history, statuses]);
  const toggle = (anime: Anime) => setSaved(old => old.some(item => item.id === anime.id) ? old.filter(item => item.id !== anime.id) : [anime, ...old]);
  const remember = (anime: Anime) => setHistory(old => [{ id: anime.id, title: titleOf(anime), image: imageOf(anime), progress: 0, updated: Date.now() }, ...old.filter(item => item.id !== anime.id)].slice(0, 20));
  const setLibraryStatus = (id: number, status: 'Watching' | 'Plan to Watch' | 'Completed' | 'Waiting') => setStatuses(old => ({ ...old, [id]: status }));
  return { saved, history, toggle, remember, statuses, setLibraryStatus };
}

function Home({ mode }: { mode: CatalogueMode }) {
  const [trending, setTrending] = useState<Anime[]>([]);
  const [popular, setPopular] = useState<Anime[]>([]);
  const [seasonal, setSeasonal] = useState<Anime[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const { saved, history, toggle } = useLibrary();
  useEffect(() => {
    let active = true;
    Promise.all([getTrending(mode.toUpperCase() as 'ANIME'|'MANGA'), getPopular(mode.toUpperCase() as 'ANIME'|'MANGA'), getSeasonal(mode.toUpperCase() as 'ANIME'|'MANGA')])
      .then(([a,b,c]) => { if (active) { setTrending(a); setPopular(b); setSeasonal(c); } })
      .catch(e => { if (active) setError(e instanceof Error ? e.message : 'Could not load anime right now.'); })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [mode]);
  const [heroIndex, setHeroIndex] = useState(0);
  const featured = trending.slice(0, 5);
  const hero = featured[heroIndex] || trending[0];
  useEffect(() => {
    if (featured.length < 2 || readStore('rykoc-auto-carousel', true) === false) return;
    const timer = window.setInterval(() => {
      if (document.visibilityState === 'visible') {
        setHeroIndex(index => (index + 1) % featured.length);
      }
    }, 5000);
    return () => window.clearInterval(timer);
  }, [featured.length]);
  return <main className="page-shell">
    <Link to="/smart-discovery" className="smart-hub-banner"><span><Sparkles size={17}/><strong>Your Smart Discovery hub</strong><small>Personal picks · release calendar · compare · advanced search</small></span><ChevronRight size={18}/></Link>
    {hero && <section className="hero" aria-label="Featured anime carousel">
      <img className="hero-banner-image" src={hero.bannerImage || imageOf(hero)} alt="" fetchPriority="high" decoding="async"/>
      <div className="hero-copy"><span className="eyebrow"><Sparkles size={14}/> YOUR NEXT FAVORITE STARTS HERE</span><h1>Find your next<br/><em>anime obsession.</em></h1><p>Explore stories worth getting lost in. Discover trending series, seasonal gems and timeless favorites.</p><div className="hero-actions"><Link className="primary-btn" to={hero ? `/${mode}/${hero.id}` : '/search'}><Play size={16} fill="currentColor"/> Explore featured</Link><Link className="secondary-btn" to="/search">Browse library <ChevronRight size={16}/></Link></div><div className="hero-featured">{hero && <><span>FEATURED PICK · {heroIndex + 1}/5</span><strong>{titleOf(hero)}</strong></>}</div><div className="hero-carousel-controls"><button aria-label="Previous featured anime" onClick={() => setHeroIndex(i => (i + 4) % Math.max(1, featured.length))}><ChevronLeft size={16}/></button>{featured.map((item,index)=><button key={item.id} aria-label={`Show ${titleOf(item)}`} className={index===heroIndex?"active":""} onClick={()=>setHeroIndex(index)} />)}<button aria-label="Next featured anime" onClick={() => setHeroIndex(i => (i + 1) % Math.max(1, featured.length))}><ChevronRight size={16}/></button></div></div>
    </section>}
    {!hero && <div className="hero hero-loading"><div className="hero-copy"><span className="eyebrow">RYKOCCLLECTION ANIME DISCOVERY</span><h1>Stories that stay<br/><em>with you.</em></h1><p>Find your next anime, one discovery at a time.</p><Link className="primary-btn" to="/search">Explore anime <ChevronRight size={16}/></Link></div></div>}
    {error && <div className="notice"><strong>Catalogue unavailable.</strong> {error} Check your connection and try again.</div>}
    {loading && <div className="section"><div className="section-head"><h2>Finding something great</h2></div><div className="anime-grid">{Array.from({length: 6}, (_,i) => <div className="skeleton-card" key={i}><div className="skeleton-poster"/><div className="skeleton-line"/></div>)}</div></div>}
    <Section title="Trending now" subtitle={`Popular ${mode} right now`} items={trending} saved={saved.map(a => a.id)} onSave={toggle} to="/search?sort=trending" mode={mode}/>
    <Section title={mode === "manga" ? "Recently released" : "This season"} subtitle={mode === "manga" ? "Fresh manga picks from AniList" : "Fresh stories airing right now"} items={seasonal} saved={saved.map(a => a.id)} onSave={toggle} mode={mode}/>
    <Section title="Popular picks" subtitle="Fan favorites worth your time" items={popular} saved={saved.map(a => a.id)} onSave={toggle} mode={mode}/>
    {history.length > 0 && <section className="section"><div className="section-head"><div><h2>Pick up where you left off</h2><p>Your recently opened anime</p></div></div><div className="history-row">{history.slice(0,5).map(item => <Link to={`/${mode}/${item.id}`} className="history-item" key={item.id}><img src={item.image} alt=""/><span>{item.title}</span><small>Recently viewed</small></Link>)}</div></section>}
    <div className="api-credit">Anime metadata provided by AniList. RykocCllection is an independent discovery interface.</div>
  </main>;
}

function SearchPage({ mode }: { mode: CatalogueMode }) {
  const location = useLocation();
  const params = new URLSearchParams(location.search);
  const [term, setTerm] = useState(params.get('q') || '');
  const [genre, setGenre] = useState('');
  const [status, setStatus] = useState('');
  const [format, setFormat] = useState('');
  const [items, setItems] = useState<Anime[]>([]);
  const [busy, setBusy] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [page, setPage] = useState(1);
  const [hasMore, setHasMore] = useState(true);
  const [error, setError] = useState('');
  const { saved, toggle } = useLibrary();
  useEffect(() => { setTerm(params.get('q') || ''); }, [location.search]);
  useEffect(() => {
    let active = true;
    const timer = window.setTimeout(() => {
      setBusy(true); setError(''); setPage(1); setHasMore(true);
      searchAnime(term.trim(), 1, genre || undefined, status || undefined, format || undefined, mode.toUpperCase() as 'ANIME'|'MANGA')
        .then(data => { if (active) { setItems(data); setHasMore(data.length === 50); } })
        .catch(e => { if (active) setError(e instanceof Error ? e.message : 'Search failed.'); })
        .finally(() => { if (active) setBusy(false); });
    }, 450);
    return () => { active = false; window.clearTimeout(timer); };
  }, [term, genre, status, format, mode]);

  const loadMore = async () => {
    if (loadingMore || !hasMore) return;
    setLoadingMore(true); setError('');
    const next = page + 1;
    try {
      const data = await searchAnime(term.trim(), next, genre || undefined, status || undefined, format || undefined, mode.toUpperCase() as 'ANIME'|'MANGA');
      setItems(old => { const ids = new Set(old.map(item => item.id)); return [...old, ...data.filter(item => !ids.has(item.id))]; });
      setPage(next); setHasMore(data.length === 50);
    } catch (e) { setError(e instanceof Error ? e.message : 'Could not load more anime.'); }
    finally { setLoadingMore(false); }
  };
  const genres = ['Action','Adventure','Comedy','Drama','Fantasy','Horror','Mystery','Romance','Sci-Fi','Slice of Life','Sports','Supernatural'];
  return <main className="content-page browse-page"><div className="page-heading"><span className="eyebrow">THE {mode.toUpperCase()} CATALOGUE</span><h1>Explore <em>{mode}.</em></h1><p>Search for a favorite or let a new story find you.</p></div>
    <div className="filter-bar browse-filters"><label className="large-search"><Search size={19}/><input value={term} onChange={e => setTerm(e.target.value)} placeholder={`Search ${mode} titles, series, stories...`} autoComplete="off"/></label>
      <div className="browse-filter-selects"><label className="genre-select"><span>Genre</span><select aria-label="Filter by genre" value={genre} onChange={e => setGenre(e.target.value)}><option value="">All genres</option>{genres.map(g => <option key={g}>{g}</option>)}</select></label>
      <label className="genre-select"><span>Status</span><select aria-label="Filter by status" value={status} onChange={e=>setStatus(e.target.value)}><option value="">Any status</option><option value="RELEASING">Airing</option><option value="FINISHED">Finished</option><option value="NOT_YET_RELEASED">Upcoming</option><option value="HIATUS">Hiatus</option></select></label>
      <label className="genre-select"><span>Format</span><select aria-label="Filter by format" value={format} onChange={e=>setFormat(e.target.value)}><option value="">Any format</option><option value="TV">TV</option><option value="TV_SHORT">TV Short</option><option value="MOVIE">Movie</option><option value="OVA">OVA</option><option value="ONA">ONA</option><option value="SPECIAL">Special</option></select></label></div>
    </div>
    <div className="browse-results-head"><div className="results-caption">{busy ? 'Updating catalogue…' : `${items.length} titles loaded`}{term && <span> for “{term}”</span>}</div></div>
    {error && <div className="notice">{error}</div>}
    {busy && !items.length ? <div className="anime-grid">{Array.from({length:8},(_,i)=><div className="skeleton-card" key={i}><div className="skeleton-poster"/><div className="skeleton-line"/></div>)}</div> :
      items.length ? <><div className="anime-grid">{items.map(item=><AnimeCard key={item.id} anime={item} saved={saved.some(a=>a.id===item.id)} onSave={toggle} mode={mode}/>)}</div>{hasMore && <div className="load-more-wrap"><button className="secondary-btn load-more-btn" onClick={loadMore} disabled={loadingMore}>{loadingMore?'Loading more titles…':'Load more titles'}</button></div>}</> :
      <div className="empty-state"><Search size={28}/><h3>No {mode} found</h3><p>Try another title or choose a different filter.</p></div>}
  </main>;
}

function CharacterDetails({ character, role }: { character: AnimeCharacter; role: string }) {
  const raw = character.description || '';
  const decoded = cleanDescription(raw);
  const markers = [...decoded.matchAll(/(?:^|\s)__([^_\n:]{1,32}):__\s*/g)];
  const facts: { label: string; value: string }[] = [];
  let biography = decoded;
  if (markers.length) {
    const first = markers[0].index || 0;
    const prefix = decoded.slice(0, first).trim();
    const chunks = markers.map((match, index) => {
      const start = (match.index || 0) + match[0].length;
      const end = index + 1 < markers.length ? (markers[index + 1].index || decoded.length) : decoded.length;
      return { label: match[1].trim(), value: decoded.slice(start, end).trim() };
    });
    chunks.forEach((chunk, index) => {
      const next = chunks[index + 1];
      const boundary = chunk.value.match(/[.!?)]\s+(?=[A-Z])/);
      const sentenceEnd = boundary ? boundary.index! + 1 : -1;
      const value = next || sentenceEnd < 0 ? chunk.value : chunk.value.slice(0, sentenceEnd);
      if (value) facts.push({ label: chunk.label, value: value.trim() });
      if (!next && sentenceEnd >= 0) biography = [prefix, chunk.value.slice(sentenceEnd + 1)].filter(Boolean).join(' ');
    });
    if (!biography || biography === decoded) biography = prefix;
  }
  if (character.gender) facts.push({ label: 'Gender', value: character.gender });
  if (character.age) facts.push({ label: 'Age', value: character.age });
  if (character.dateOfBirth && !facts.some(f => /birthday|birth|born/i.test(f.label))) facts.push({ label: 'Birthday', value: [character.dateOfBirth.month, character.dateOfBirth.day].filter(Boolean).join('/') || 'Not listed' });
  if (character.favourites) facts.push({ label: 'Favorites', value: character.favourites.toLocaleString() });
  const paragraphs = (biography || decoded).split(/\n{2,}/).map(part => part.trim()).filter(Boolean);
  return <div className="character-details">
    <div className="character-role-line"><span>ROLE</span><strong>{role}</strong></div>
    {facts.length > 0 && <section className="character-detail-group"><h3>Quick details</h3><div className="character-facts">{facts.map((fact,index)=><span key={index}><strong>{fact.label}</strong>{fact.value}</span>)}</div></section>}
    {paragraphs.length > 0 && <section className="character-detail-group"><h3>Biography</h3><div className="character-bio">{paragraphs.map((paragraph,index)=><p key={index}>{paragraph}</p>)}</div></section>}
    {!decoded && <div className="character-bio">No biography is available for this character yet.</div>}
  </div>;
}
function DetailPage({ user, mode }: { user: User | null; mode: CatalogueMode }) {
  const { id } = useParams();
  const [anime, setAnime] = useState<Anime | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [attempt, setAttempt] = useState(0);
  const [activeTab, setActiveTab] = useState<'overview' | 'characters' | 'details' | 'comments'>('overview');
  const [selectedCharacter, setSelectedCharacter] = useState<AnimeCharacter | null>(null);
  const [characterPage, setCharacterPage] = useState(1);
  const [loadingCharacters, setLoadingCharacters] = useState(false);
  const [characterError, setCharacterError] = useState('');
  const { saved, toggle, remember } = useLibrary();
  const [showPlayer, setShowPlayer] = useState(false);
  const [source, setSource] = useState('');

  useEffect(() => {
    let active = true;
    setLoading(true); setError(''); setAnime(null); setActiveTab('overview'); setSelectedCharacter(null); setCharacterPage(1);
    const animeId = Number(id);
    getAnime(animeId, mode.toUpperCase() as 'ANIME'|'MANGA')
      .then(data => { if (active) { setAnime(data); if (!data) setError('AniList could not find this entry.'); } })
      .catch(e => { if (active) setError(e instanceof Error ? e.message : 'Could not load anime metadata.'); })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [id, attempt, mode]);

  const loadMoreCharacters = async () => {
    if (!anime?.characters?.pageInfo.hasNextPage || loadingCharacters) return;
    const nextPage = characterPage + 1;
    setLoadingCharacters(true); setCharacterError('');
    try {
      const result = await getAnimeCharacters(anime.id, nextPage, mode.toUpperCase() as 'ANIME'|'MANGA');
      setAnime(current => current ? {
        ...current,
        characters: {
          pageInfo: result.pageInfo,
          edges: [...(current.characters?.edges || []), ...result.edges.filter(edge => !(current.characters?.edges || []).some(old => old.node.id === edge.node.id))]
        }
      } : current);
      setCharacterPage(nextPage);
    } catch (e) {
      setCharacterError(e instanceof Error ? e.message : 'Could not load more characters.');
    } finally { setLoadingCharacters(false); }
  };

  if (loading) return <main className="content-page"><div className="detail-skeleton"/><p className="metadata-loading-note">Loading entry information and character data…</p></main>;
  if (!anime) return <main className="content-page"><div className="empty-state"><h2>Entry unavailable</h2><p>{error || 'This title may no longer be available.'}</p><button className="secondary-btn" onClick={() => setAttempt(value => value + 1)}><RotateCw size={15}/> Try again</button><Link className="secondary-btn" to="/search">Back to explore</Link></div></main>;

  const isSaved = saved.some(a => a.id === anime.id);
  const start = () => { remember(anime); setShowPlayer(true); };
  const trailerId = anime.trailer?.site?.toLowerCase() === 'youtube' && /^[a-zA-Z0-9_-]{6,}$/.test(anime.trailer.id) ? anime.trailer.id : null;
  const staff = anime.staff?.edges || [];
  const authors = staff.filter(item => /author|writer|original creator|story/i.test(item.role)).map(item => item.node.name.full).filter(Boolean);
  const artists = staff.filter(item => /artist|illustrat|character design|art direction|story & art/i.test(item.role)).map(item => item.node.name.full).filter(Boolean);
  const releaseDate = anime.startDate?.year
    ? [anime.startDate.year, anime.startDate.month, anime.startDate.day].filter(Boolean).join('-')
    : anime.seasonYear ? String(anime.seasonYear) : 'Not announced';
  const sourceName = anime.source?.replaceAll('_', ' ').toLowerCase().replace(/\b\w/g, char => char.toUpperCase()) || 'Not specified';
  const tabs = [
    { id: 'overview' as const, label: 'Overview', icon: <Info size={16}/> },
    { id: 'characters' as const, label: 'Characters', icon: <Users size={16}/>, count: anime.characters?.edges.length },
    { id: 'details' as const, label: 'Details', icon: <FileText size={16}/> },
    { id: 'comments' as const, label: 'Comments', icon: <MessageCircle size={16}/> }
  ];

  return <main className="detail-page">
    <div className="detail-backdrop" style={{backgroundImage:`linear-gradient(0deg,#08090d 0%,rgba(8,9,13,.72) 100%),url(${anime.bannerImage || imageOf(anime)})`}}/>
    <div className="detail-content">
      <Link to="/search" className="back-link"><ArrowLeft size={16}/> Back to explore</Link>
      <div className="detail-main">
        <img className="detail-poster" src={imageOf(anime) || '/placeholder-poster.svg'} alt={titleOf(anime)} onError={event => { event.currentTarget.style.visibility = 'hidden'; }}/>
        <div className="detail-info">
          <span className="eyebrow">{anime.format || 'ANIME'} {anime.seasonYear ? `· ${anime.seasonYear}` : ''}</span>
          <h1>{titleOf(anime)}</h1>
          {anime.title.native && <p className="native-title">{anime.title.native}</p>}
          <div className="detail-stats">
            {anime.averageScore ? <span><Star size={15} fill="currentColor"/> {(anime.averageScore/10).toFixed(1)} / 10</span> : null}
            <span>{mode === 'manga' ? <FileText size={14}/> : <Play size={14}/>} {mode === 'manga' ? (anime.chapters ? `${anime.chapters} chapters` : anime.volumes ? `${anime.volumes} volumes` : 'Chapter count unknown') : `${anime.episodes ?? '—'} episodes`}</span>
            <span><Clock3 size={14}/> {anime.status?.replaceAll('_',' ') || 'Unknown status'}</span>
          </div>
          <div className="genre-tags">{anime.genres?.map(g=><span key={g}>{g}</span>)}</div>
          <div className="hero-actions">\n            {mode === 'anime' && <button className="primary-btn" onClick={start}><Play size={16} fill="currentColor"/> Open player</button>}
            <button className="secondary-btn" onClick={()=>toggle(anime)}>{isSaved ? <Heart size={16} fill="currentColor"/> : <Bookmark size={16}/>} {isSaved ? 'In my list' : 'Add to list'}</button>
            {anime.siteUrl && <a className="secondary-btn" href={anime.siteUrl} target="_blank" rel="noreferrer">AniList <ExternalLink size={14}/></a>}
          </div>
        </div>
      </div>

      <div className="entry-tabs" role="tablist" aria-label="Anime entry sections">
        {tabs.map(tab=><button key={tab.id} type="button" role="tab" aria-selected={activeTab===tab.id} className={activeTab===tab.id?'entry-tab active':'entry-tab'} onClick={()=>{setActiveTab(tab.id);setSelectedCharacter(null);}}>
          {tab.icon}<span>{tab.label}</span>{tab.id==='characters' && typeof tab.count==='number' && <small>{tab.count}{anime.characters?.pageInfo.hasNextPage?'+':''}</small>}
        </button>)}
      </div>

      {activeTab === 'overview' && <section className="entry-panel overview-panel">
        <div className="entry-section-heading"><span className="eyebrow">THE STORY</span><h2>Overview</h2></div>
        <div className="overview-description">{cleanDescription(anime.description) || 'No description is available for this entry yet.'}</div>
        {mode === 'anime' && <div className="overview-trailer">
          <div className="entry-section-heading"><span className="eyebrow">OFFICIAL PREVIEW</span><h2>Trailer</h2></div>
          {trailerId ? <div className="entry-trailer-frame"><iframe src={`https://www.youtube-nocookie.com/embed/${trailerId}?rel=0`} title={`Trailer for ${titleOf(anime)}`} allow="accelerometer; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share" allowFullScreen referrerPolicy="strict-origin-when-cross-origin"/></div> :
            <div className="entry-empty"><Youtube size={22}/><span>No supported trailer is listed for this entry.</span>{anime.siteUrl && <a href={anime.siteUrl} target="_blank" rel="noreferrer">Check entry sources <ExternalLink size={13}/></a>}</div>}
        </div>}
      </section>}

      {activeTab === 'characters' && <section className="entry-panel characters-panel">
        <div className="entry-section-heading"><span className="eyebrow">CAST & PROFILES</span><h2>Characters <small>{anime.characters?.edges.length || 0}{anime.characters?.pageInfo.hasNextPage?'+':''}</small></h2><p>Select a character to open their profile.</p></div>
        {anime.characters?.edges.length ? <div className="entry-character-grid">{anime.characters.edges.map(({node,role})=><button className="entry-character-card" key={node.id} onClick={()=>setSelectedCharacter(node)}>
          <img src={node.image?.large || node.image?.medium || ''} alt={node.name.full || 'Character'} loading="lazy" onError={event=>{event.currentTarget.style.visibility='hidden';}}/>
          <span className="entry-character-name">{node.name.full || 'Unknown character'}</span><small>{role || 'Character'}</small>
        </button>)}</div> : <div className="entry-empty"><Users size={22}/><span>Character information is not available for this entry yet.</span></div>}
        {characterError && <p className="metadata-error">{characterError}</p>}
        {anime.characters?.pageInfo.hasNextPage && <button className="secondary-btn load-characters-btn" onClick={loadMoreCharacters} disabled={loadingCharacters}>{loadingCharacters?'Loading…':'Load more characters'} <ChevronDown size={15}/></button>}
        {selectedCharacter && <div className="character-modal-backdrop" role="presentation" onClick={()=>setSelectedCharacter(null)}>
          <section className="character-modal" role="dialog" aria-modal="true" aria-label={selectedCharacter.name.full || 'Character details'} onClick={event=>event.stopPropagation()}>
            <button className="character-modal-close" onClick={()=>setSelectedCharacter(null)} aria-label="Close character details"><X size={18}/></button>
            <div className="character-modal-top"><img src={selectedCharacter.image?.large || selectedCharacter.image?.medium || ''} alt={selectedCharacter.name.full || 'Character'} onError={event=>{event.currentTarget.style.visibility='hidden';}}/><div><span className="eyebrow">CHARACTER PROFILE</span><h2>{selectedCharacter.name.full || 'Unknown character'}</h2>{selectedCharacter.name.native && <p>{selectedCharacter.name.native}</p>}<span className="character-role">{anime.characters?.edges.find(edge=>edge.node.id===selectedCharacter.id)?.role || 'Character'}</span></div></div>
            <CharacterDetails character={selectedCharacter} role={anime.characters?.edges.find(edge=>edge.node.id===selectedCharacter.id)?.role || 'Character'}/>
            {selectedCharacter.siteUrl && <a className="secondary-btn" href={selectedCharacter.siteUrl} target="_blank" rel="noreferrer">Full character profile <ExternalLink size={14}/></a>}
          </section>
        </div>}
      </section>}

      {activeTab === 'details' && <section className="entry-panel details-panel">
        <div className="entry-section-heading"><span className="eyebrow">ENTRY INFORMATION</span><h2>Details</h2></div>
        <div className="entry-details-grid">
          <div><span>Type</span><strong>{anime.format || (mode === 'manga' ? 'Manga' : 'Anime')}</strong></div>
          <div><span>Status</span><strong>{anime.status?.replaceAll('_',' ') || 'Not listed'}</strong></div>
          <div><span>{mode === 'manga' ? 'Start date' : 'Release'}</span><strong>{releaseDate}</strong></div>
          <div><span>Author / creator</span><strong>{authors.length?authors.join(', '):'Not listed by AniList'}</strong></div>
          <div><span>Artist</span><strong>{artists.length?artists.join(', '):'Not listed by AniList'}</strong></div>
          <div><span>Country</span><strong>{anime.countryOfOrigin || 'Not listed'}</strong></div>
          <div className="detail-wide"><span>Alternative titles</span><strong>{[anime.title.english,anime.title.romaji,anime.title.native,...(anime.synonyms||[])].filter((value,index,array)=>value && array.indexOf(value)===index).join(' · ') || 'Not listed'}</strong></div>
          <div><span>Source material</span><strong>{sourceName}</strong></div>
          {mode === 'manga' ? <><div><span>Chapters</span><strong>{anime.chapters ?? 'Not announced'}</strong></div><div><span>Volumes</span><strong>{anime.volumes ?? 'Not announced'}</strong></div></> : <div><span>Studio</span><strong>{anime.studios?.nodes?.map(studio=>studio.name).join(', ') || 'Not listed'}</strong></div>}
        </div>
        <div className="entry-source-links"><h3><Globe size={17}/> Source links</h3><div>{anime.siteUrl && <a href={anime.siteUrl} target="_blank" rel="noreferrer">AniList entry <ExternalLink size={13}/></a>}{(anime.externalLinks||[]).filter(link=>link.url?.startsWith('https://')).slice(0,12).map(link=><a key={link.url} href={link.url} target="_blank" rel="noreferrer">{link.site || 'External source'} <ExternalLink size={13}/></a>)}</div></div>
      </section>}

      {activeTab === 'comments' && <div className="entry-comments-panel"><AnimeComments animeId={anime.id} animeTitle={titleOf(anime)} user={user}/></div>}

      {showPlayer && <div className="player-panel"><div className="section-head"><div><h2>Watch panel</h2><p>Use a video URL you are authorized to access.</p></div><button className="icon-btn" onClick={()=>setShowPlayer(false)} aria-label="Close player"><X/></button></div><div className="source-input"><input value={source} onChange={e=>setSource(e.target.value)} placeholder="Paste an authorized HTTPS video URL"/><button className="primary-btn" onClick={()=>{if(source.startsWith('https://')) window.open(source,'_blank','noopener,noreferrer');}}>Open source</button></div><p className="fine-print">RykocCllection does not host episodes or provide unauthorized streams. Playback and advertising behavior on external providers is controlled by those providers.</p></div>}
    </div>
  </main>;
}

function WatchlistPage() {
  const { saved, toggle, statuses, setLibraryStatus } = useLibrary();
  const groups: Array<'Watching' | 'Plan to Watch' | 'Completed' | 'Waiting'> = ['Watching', 'Plan to Watch', 'Completed', 'Waiting'];
  return <main className="content-page"><div className="page-heading"><span className="eyebrow">YOUR PERSONAL COLLECTION</span><h1>Your <em>Library.</em></h1><p>Organize saved anime by your watch progress.</p></div>
    {!saved.length ? <div className="empty-state"><Bookmark size={28}/><h3>Your library is waiting</h3><p>Save anime from Home or Browse and they will appear here.</p><Link className="primary-btn" to="/search">Discover anime</Link></div> :
    groups.map(group => { const entries = saved.filter(item => (statuses[item.id] || 'Plan to Watch') === group); return <section className="section library-group" key={group}><div className="section-head"><div><h2>{group}</h2><p>{entries.length} {entries.length===1?'title':'titles'}</p></div></div>{entries.length ? <div className="anime-grid">{entries.map(item=><article className="anime-card" key={item.id}><Link to={`/anime/${item.id}`} className="poster-wrap"><img src={imageOf(item)} alt={titleOf(item)} loading="lazy"/></Link><div className="card-meta"><Link to={`/anime/${item.id}`} className="card-title">{titleOf(item)}</Link><select aria-label={`Status for ${titleOf(item)}`} value={statuses[item.id] || 'Plan to Watch'} onChange={event=>setLibraryStatus(item.id,event.target.value as typeof groups[number])}>{groups.map(status=><option key={status}>{status}</option>)}</select><button className="library-remove" onClick={()=>toggle(item)}>Remove from library</button></div></article>)}</div> : <p className="library-empty">No titles in this category yet.</p>}</section>; })}
  </main>;
}
function VideoPage() {
  const [videos, setVideos] = useState<Anime[]>([]);
  const [videoTerm, setVideoTerm] = useState('');
  const [videoGenre, setVideoGenre] = useState('');
  const [videoSearching, setVideoSearching] = useState(false);
  const [videoSearchingMore, setVideoSearchingMore] = useState(false);
  const [videoPage, setVideoPage] = useState(1);
  const [videoHasMore, setVideoHasMore] = useState(true);
  const [selected, setSelected] = useState<Anime | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const onlyWithTrailers = (items: Anime[]) => items.filter(item =>
    item.trailer?.site?.toLowerCase() === 'youtube' &&
    /^[a-zA-Z0-9_-]{6,}$/.test(item.trailer.id)
  );

  useEffect(() => {
    let active = true;
    setLoading(true);
    getVideoCatalogue(1).then(items => {
      if (!active) return;
      const clips = onlyWithTrailers(items);
      setVideos(clips);
      setSelected(clips[0] || null);
      setVideoPage(1);
      setVideoHasMore(items.length === 50);
    }).catch(e => { if (active) setError(e instanceof Error ? e.message : 'Could not load anime previews.'); })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, []);

  useEffect(() => {
    if (!videoTerm.trim() && !videoGenre) return;
    let active = true;
    const timer = window.setTimeout(() => {
      setVideoSearching(true);
      setError('');
      const request = videoTerm.trim()
        ? searchAnime(videoTerm.trim(), 1, videoGenre || undefined)
        : getVideoCatalogue(1, videoGenre || undefined);
      request.then(items => {
        if (!active) return;
        const clips = onlyWithTrailers(items);
        setVideos(clips);
        setSelected(clips[0] || null);
        setVideoPage(1);
        setVideoHasMore(items.length === 50);
      }).catch(e => { if (active) setError(e instanceof Error ? e.message : 'Video search failed.'); })
        .finally(() => { if (active) setVideoSearching(false); });
    }, 450);
    return () => { active = false; window.clearTimeout(timer); };
  }, [videoTerm, videoGenre]);

  const loadMoreVideos = async () => {
    if (videoSearchingMore || !videoHasMore) return;
    setVideoSearchingMore(true);
    setError('');
    const nextPage = videoPage + 1;
    try {
      const items = videoTerm.trim()
        ? await searchAnime(videoTerm.trim(), nextPage, videoGenre || undefined)
        : await getVideoCatalogue(nextPage, videoGenre || undefined);
      const clips = onlyWithTrailers(items);
      setVideos(old => {
        const known = new Set(old.map(item => item.id));
        return [...old, ...clips.filter(item => !known.has(item.id))];
      });
      setVideoPage(nextPage);
      setVideoHasMore(items.length === 50);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not load more trailers.');
    } finally {
      setVideoSearchingMore(false);
    }
  };

  const trailerId = selected?.trailer?.id;
  const videoGenres = ['Action','Adventure','Comedy','Drama','Fantasy','Horror','Mystery','Romance','Sci-Fi','Slice of Life','Sports','Supernatural'];
  return <main className="video-page">
    <div className="video-toolbar">
      <div><span className="eyebrow">RYKOCCLLECTION VIDEO</span><h1>Anime <em>trailers.</em></h1><p>Discover anime promotional videos from across the catalogue.</p></div>
      {selected?.siteUrl && <a className="secondary-btn" href={selected.siteUrl} target="_blank" rel="noopener noreferrer">Anime details <ExternalLink size={14}/></a>}
    </div>
    {videoTerm.trim() && <div className="video-external-search"><span>Want more results?</span><a href={`https://www.youtube.com/results?search_query=${encodeURIComponent(videoTerm.trim()+ " anime trailer")}`} target="_blank" rel="noopener noreferrer">Search YouTube for “{videoTerm.trim()}” <ExternalLink size={13}/></a></div>}
    <div className="video-search-tools"><label className="large-search"><Search/><input value={videoTerm} onChange={event=>setVideoTerm(event.target.value)} placeholder="Search anime to find related videos..." autoComplete="off"/></label><label className="genre-select"><SlidersHorizontal size={16}/><select value={videoGenre} onChange={event=>setVideoGenre(event.target.value)}><option value="">All genres</option>{videoGenres.map(value=><option key={value}>{value}</option>)}</select></label></div>
    {error && <div className="notice">{error}</div>}
    {loading || videoSearching ? <div className="video-loading">Discovering trailers…</div> : selected && trailerId ? <section className="video-feature">
      <div className="video-player-wrap"><iframe key={trailerId} src={`https://www.youtube-nocookie.com/embed/${trailerId}?rel=0`} title={`Trailer for ${titleOf(selected)}`} loading="lazy" allow="accelerometer; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share" allowFullScreen referrerPolicy="strict-origin-when-cross-origin"/></div>
      <div className="video-selected"><div><span className="eyebrow">NOW SELECTED</span><h2>{titleOf(selected)}</h2><p>{selected.seasonYear || 'Release year unavailable'} · {selected.format || 'Anime'} · {selected.episodes || 'Episode count unavailable'} episodes</p></div><a className="secondary-btn" href={`https://www.youtube.com/watch?v=${trailerId}`} target="_blank" rel="noopener noreferrer">Open on YouTube <ExternalLink size={14}/></a></div>
    </section> : <div className="empty-state"><Play size={28}/><h3>No trailers found in this batch</h3><p>Try another title or load another batch of catalogue entries.</p></div>}
    {videos.length > 0 && <section className="section video-library"><div className="section-head"><div><h2>More previews</h2><p>Choose a title to watch its trailer</p></div><span className="results-caption">{videos.length} trailers found</span></div><div className="video-trailer-grid">{videos.map(anime => <button key={anime.id} className={selected?.id === anime.id ? 'video-trailer-card selected' : 'video-trailer-card'} onClick={() => { setSelected(anime); window.scrollTo({top: 0, behavior: 'smooth'}); }}><span className="video-trailer-image"><img src={imageOf(anime)} alt="" loading="lazy" decoding="async"/><span className="video-play-icon"><Play size={19} fill="currentColor"/></span></span><span className="video-trailer-title">{titleOf(anime)}</span><span className="video-trailer-meta">{anime.seasonYear || 'Year unknown'} · {anime.format || 'Anime'}</span></button>)}</div></section>}
    {!loading && videoHasMore && <div className="load-more-wrap"><button className="secondary-btn load-more-btn" onClick={loadMoreVideos} disabled={videoSearchingMore}>{videoSearchingMore?'Finding more trailers…':'Load more videos'}</button></div>}
    {!loading && !videoHasMore && videos.length > 0 && <p className="fine-print">You have reached the end of the available AniList catalogue results for these filters.</p>}
    <p className="fine-print">Trailer availability depends on AniList metadata and YouTube publishers. RykocCllection does not host full episodes or video files.</p>
  </main>;
}
function BottomNavigation() {
  const location = useLocation();
  const links = [
    { to: '/', label: 'Home', icon: <HomeIcon size={19}/> },
    { to: '/search', label: 'Browse', icon: <Compass size={19}/> },
    { to: '/video', label: 'Video', icon: <Play size={19}/> },
    { to: '/watchlist', label: 'Library', icon: <Bookmark size={19}/> },
    { to: '/account', label: 'Account', icon: <UserRound size={19}/> }
  ];
  return <nav className="bottom-navigation" aria-label="Main navigation">{links.map(item => {
    const active = item.to === '/' ? location.pathname === '/' : location.pathname === item.to;
    return <Link key={item.to} to={item.to} className={active?'bottom-nav-item active':'bottom-nav-item'} aria-current={active?'page':undefined}>{item.icon}<span>{item.label}</span></Link>;
  })}</nav>;
}

function AccountPage({ user }: { user: User | null }) {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [mode, setMode] = useState<'signin'|'signup'>('signin');
  const [message, setMessage] = useState('');
  const [busy, setBusy] = useState(false);
  const submit = async (event: FormEvent) => {
    event.preventDefault(); setBusy(true); setMessage('');
    try {
      if (mode === 'signup') {
        const { error } = await supabase.auth.signUp({ email, password, options: { data: { display_name: displayName.trim() || email.split('@')[0] } } });
        if (error) throw error;
        setMessage('Account created. Check your email if confirmation is enabled.');
      } else {
        const { error } = await supabase.auth.signInWithPassword({ email, password });
        if (error) throw error;
        setMessage('Signed in successfully.');
      }
    } catch (error) { setMessage(error instanceof Error ? error.message : 'Could not complete sign in.'); }
    finally { setBusy(false); }
  };
  return <main className="content-page account-page"><div className="page-heading"><span className="eyebrow">YOUR RYKOCCLLECTION PROFILE</span><h1>Your <em>Account.</em></h1><p>Sign in to join discussions and keep your profile connected.</p></div>
    {user ? <section className="account-card"><div className="account-avatar">{String(user.user_metadata?.display_name || user.email || 'R').slice(0,1).toUpperCase()}</div><div><span className="eyebrow">SIGNED IN</span><h2>{String(user.user_metadata?.display_name || user.email?.split('@')[0] || 'Anime fan')}</h2><p>{user.email}</p><button className="secondary-btn" onClick={()=>void supabase.auth.signOut()}>Sign out</button></div></section> :
    <form className="account-card account-form" onSubmit={submit}><div className="account-avatar"><UserRound/></div><h2>{mode==='signin'?'Welcome back':'Create your account'}</h2><p>{mode==='signin'?'Sign in to your RykocCllection account.':'Create a profile to participate in community features.'}</p>
      {mode==='signup' && <input value={displayName} onChange={event=>setDisplayName(event.target.value)} placeholder="Display name" autoComplete="nickname"/>}
      <input type="email" value={email} onChange={event=>setEmail(event.target.value)} placeholder="Email address" autoComplete="email" required/>
      <input type="password" value={password} onChange={event=>setPassword(event.target.value)} placeholder="Password" autoComplete={mode==='signin'?'current-password':'new-password'} minLength={6} required/>
      <button className="primary-btn" disabled={busy}>{busy?'Please wait…':mode==='signin'?'Sign in':'Create account'}</button>
      <button type="button" className="account-switch" onClick={()=>{setMode(mode==='signin'?'signup':'signin');setMessage('');}}>{mode==='signin'?'New here? Create an account':'Already have an account? Sign in'}</button>
      {message && <p className="account-message">{message}</p>}
    </form>}
  </main>;
}

function SettingsPage({ mode, onModeChange }: { mode: CatalogueMode; onModeChange: (mode: CatalogueMode) => void }) {
  const [reduceMotion,setReduceMotion]=useState(()=>readStore('rykoc-reduce-motion',false));
  const [autoCarousel,setAutoCarousel]=useState(()=>readStore('rykoc-auto-carousel',true));
  const [showScores,setShowScores]=useState(()=>readStore('rykoc-show-scores',true));
  const [message,setMessage]=useState('');
  useEffect(()=>{localStorage.setItem('rykoc-reduce-motion',JSON.stringify(reduceMotion));document.documentElement.classList.toggle('reduce-motion',reduceMotion);},[reduceMotion]);
  useEffect(()=>{localStorage.setItem('rykoc-auto-carousel',JSON.stringify(autoCarousel));},[autoCarousel]);
  useEffect(()=>{localStorage.setItem('rykoc-show-scores',JSON.stringify(showScores));document.documentElement.classList.toggle('hide-scores',!showScores);},[showScores]);
  const clearSearchHistory=()=>{localStorage.removeItem('rykoc-search-history');setMessage('Recent search suggestions cleared from this device.');};
  const clearMetadataCache=()=>{localStorage.removeItem('rykoc-anilist-cache-v1');setMessage('Cached catalogue metadata cleared. Your saved library and backup files were not changed.');};
  const resetPreferences=()=>{setReduceMotion(false);setAutoCarousel(true);setShowScores(true);onModeChange('anime');setMessage('Display preferences restored to defaults.');};
  return <main className="content-page settings-page"><div className="page-heading"><span className="eyebrow"><SettingsIcon size={14}/> PERSONALIZE YOUR EXPERIENCE</span><h1>App <em>settings.</em></h1><p>These preferences are saved locally on this device.</p></div>
    <section className="settings-group"><div className="settings-group-heading"><Palette/><div><h2>Display & experience</h2><p>Choose how RykocCllection looks and behaves.</p></div></div>
      <div className="settings-row"><span className="settings-row-icon"><Compass/></span><span className="settings-row-copy"><strong>Default catalogue</strong><small>Choose which catalogue opens when you launch the app.</small></span><select aria-label="Default catalogue" value={mode} onChange={event=>onModeChange(event.target.value as CatalogueMode)}><option value="anime">Anime</option><option value="manga">Manga</option></select></div>
      <div className="settings-row"><span className="settings-row-icon"><RotateCw/></span><span className="settings-row-copy"><strong>Auto-rotate featured titles</strong><small>Automatically change the featured title on the home screen.</small></span><button className={autoCarousel?'settings-switch active':'settings-switch'} role="switch" aria-checked={autoCarousel} onClick={()=>setAutoCarousel(value=>!value)}><span/></button></div>
      <div className="settings-row"><span className="settings-row-icon"><Eye/></span><span className="settings-row-copy"><strong>Show catalogue scores</strong><small>Display community scores on title cards.</small></span><button className={showScores?'settings-switch active':'settings-switch'} role="switch" aria-checked={showScores} onClick={()=>setShowScores(value=>!value)}><span/></button></div>
      <div className="settings-row"><span className="settings-row-icon"><Moon/></span><span className="settings-row-copy"><strong>Reduce motion</strong><small>Reduce animated transitions and movement.</small></span><button className={reduceMotion?'settings-switch active':'settings-switch'} role="switch" aria-checked={reduceMotion} onClick={()=>setReduceMotion(value=>!value)}><span/></button></div>
    </section>
    <section className="settings-group"><div className="settings-group-heading"><Database/><div><h2>Local data</h2><p>Manage temporary data without deleting your library.</p></div></div>
      <div className="settings-row"><span className="settings-row-icon"><History/></span><span className="settings-row-copy"><strong>Recent search history</strong><small>Remove saved search suggestions from this device.</small></span><button className="settings-action" onClick={clearSearchHistory}>Clear</button></div>
      <div className="settings-row"><span className="settings-row-icon"><Trash2/></span><span className="settings-row-copy"><strong>Catalogue cache</strong><small>Clear cached AniList metadata. It will reload when you browse online.</small></span><button className="settings-action" onClick={clearMetadataCache}>Clear cache</button></div>
      <div className="settings-row"><span className="settings-row-icon"><ShieldCheck/></span><span className="settings-row-copy"><strong>Privacy & backup</strong><small>Review privacy information and protect your personal library.</small></span><Link className="settings-action" to="/privacy">Open</Link></div>
    </section>
    <div className="settings-footer"><button className="secondary-btn" onClick={resetPreferences}>Reset display preferences</button>{message && <p role="status" className="settings-message">{message}</p>}</div>
    <p className="fine-print">Settings do not delete your watchlist, progress, account, or existing backup files. Notification reminders are shown inside the app; push notifications are not currently supported.</p>
  </main>;
}

function AboutPage() {
  return <main className="content-page about-page"><section className="about-hero"><div className="about-brand-mark">R</div><span className="eyebrow">INDEPENDENT ANIME & MANGA DISCOVERY</span><h1>RYKO<em>CCLLECTION</em></h1><p>Discover stories. Find your next world.</p><span className="about-version">A fan-made discovery project</span></section>
    <section className="about-card"><span className="eyebrow">OUR PURPOSE</span><h2>Made for curious fans.</h2><p>RykocCllection is an independent catalogue and discovery experience for anime and manga fans. Explore titles, learn about characters, keep a personal library, discover trailers and find your next favourite story.</p><p>We are a discovery platform, not a chapter-reading or full-episode hosting service. We do not claim ownership of third-party titles, artwork, characters or video content.</p></section>
    <section className="about-card"><span className="eyebrow">CREDITS & ATTRIBUTION</span><div className="credit-row"><span className="credit-icon"><Database/></span><div><strong>AniList</strong><p>Public anime and manga metadata, catalogue information, scores and character data.</p><a href="https://anilist.co" target="_blank" rel="noopener noreferrer">Visit AniList <ExternalLink size={13}/></a></div></div><div className="credit-row"><span className="credit-icon"><Youtube/></span><div><strong>YouTube</strong><p>Trailer playback is embedded from YouTube when an official or linked trailer is available. Video rights remain with their respective publishers.</p><a href="https://www.youtube.com" target="_blank" rel="noopener noreferrer">Visit YouTube <ExternalLink size={13}/></a></div></div><div className="credit-row"><span className="credit-icon"><HeartHandshake/></span><div><strong>Open-source community</strong><p>Built with React, Vite, Capacitor, Supabase and Lucide icons.</p><a href="https://react.dev" target="_blank" rel="noopener noreferrer">React <ExternalLink size={13}/></a><a href="https://capacitorjs.com" target="_blank" rel="noopener noreferrer">Capacitor <ExternalLink size={13}/></a><a href="https://supabase.com" target="_blank" rel="noopener noreferrer">Supabase <ExternalLink size={13}/></a></div></div></section>
    <section className="about-card about-disclaimer"><span className="eyebrow">IMPORTANT</span><p>RykocCllection is an independent fan project and is not affiliated with, endorsed by, or sponsored by AniList, YouTube, animation studios, publishers or rights holders. Metadata and external media are provided by their respective services and owners.</p></section>
    <p className="about-footer">RYKOCCLLECTION · Discover stories. Find your next world.</p>
  </main>;
}

function PrivacyPage() {
  const [protection, setProtection] = useState(()=>readStore('kairo-privacy', true));
  const [backupMessage, setBackupMessage] = useState('');
  const [busy, setBusy] = useState(false);
  const [nativeFolder, setNativeFolder] = useState(false);
  const native = isNativeAndroid();
  useEffect(()=>localStorage.setItem('kairo-privacy', JSON.stringify(protection)),[protection]);
  useEffect(()=>{ if(native) LibraryBackup.hasFolder().then(result=>setNativeFolder(result.selected)).catch(()=>setNativeFolder(false)); },[native]);

  const exportBackup = () => {
    try {
      const blob = new Blob([makeLibraryBackup()], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const anchor = document.createElement('a');
      anchor.href = url;
      anchor.download = `rykoccllection-backup-${new Date().toISOString().slice(0,10)}.json`;
      document.body.appendChild(anchor); anchor.click(); anchor.remove();
      URL.revokeObjectURL(url);
      setBackupMessage('Backup file created. Save it in a folder you can access after reinstalling.');
    } catch { setBackupMessage('Could not create a backup. Please try again.'); }
  };

  const chooseBackupFolder = async () => {
    setBusy(true); setBackupMessage('');
    try {
      await LibraryBackup.chooseFolder();
      setNativeFolder(true);
      await LibraryBackup.writeBackup({ content: makeLibraryBackup() });
      setBackupMessage('Backup folder selected. Automatic backups are now enabled on this device.');
    } catch (error) {
      setBackupMessage(error instanceof Error ? error.message : 'Could not select the backup folder.');
    } finally { setBusy(false); }
  };

  const restoreNativeBackup = async () => {
    setBusy(true); setBackupMessage('');
    try {
      const result = await LibraryBackup.restoreBackup();
      applyLibraryBackup(result.content);
      setBackupMessage('Backup restored successfully. Reloading your library…');
      window.setTimeout(() => window.location.reload(), 700);
    } catch (error) {
      setBackupMessage(error instanceof Error ? error.message : 'Could not restore this backup.');
    } finally { setBusy(false); }
  };

  const importBackup = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;
    setBusy(true); setBackupMessage('');
    try {
      applyLibraryBackup(await file.text());
      setBackupMessage('Backup restored successfully. Reloading your library…');
      window.setTimeout(() => window.location.reload(), 700);
    } catch (error) {
      setBackupMessage(error instanceof Error ? error.message : 'Could not restore this backup.');
    } finally { setBusy(false); event.target.value = ''; }
  };

  return <main className="content-page privacy-page"><div className="page-heading"><span className="eyebrow">YOUR DATA, YOUR CHOICE</span><h1>Privacy <em>center.</em></h1><p>Simple controls and clear information about what this app can protect.</p></div>
    <div className="privacy-card"><div className="privacy-icon"><ShieldCheck/></div><div className="privacy-copy"><h2>Privacy-friendly mode</h2><p>Controls optional local preferences and keeps this app free of injected ad scripts and third-party analytics.</p></div><button className={protection?'toggle active':'toggle'} onClick={()=>setProtection(!protection)} aria-label="Toggle privacy mode"><span/></button></div>
    <section className="backup-panel"><div className="backup-panel-heading"><div className="privacy-icon"><FolderOpen/></div><div><span className="eyebrow">PERSONAL LIBRARY</span><h2>Backup & restore</h2><p>Keep your saved titles, history and progress safe outside the app.</p></div></div>
      {native && <div className="native-backup-status"><span className={nativeFolder?'status-good':'status-neutral'}>{nativeFolder?'Folder selected · Automatic backup on':'No backup folder selected'}</span><button className="secondary-btn" onClick={chooseBackupFolder} disabled={busy}><FolderOpen size={16}/>{nativeFolder?'Change folder':'Choose storage folder'}</button></div>}
      <div className="backup-actions"><button className="primary-btn" onClick={native && nativeFolder ? async()=>{setBusy(true);try{await LibraryBackup.writeBackup({content:makeLibraryBackup()});setBackupMessage('Backup saved to your selected folder.');}catch(e){setBackupMessage(e instanceof Error?e.message:'Backup failed.');}finally{setBusy(false);}} : exportBackup} disabled={busy}><Download size={16}/> {busy?'Please wait…':native && nativeFolder?'Back Up Now':'Download Backup'}</button>
      {native ? <button className="secondary-btn" onClick={restoreNativeBackup} disabled={busy}><Upload size={16}/> Restore from device</button> : <label className="secondary-btn backup-import"><Upload size={16}/> Restore Backup<input type="file" accept="application/json,.json" onChange={importBackup} disabled={busy}/></label>}</div>
      {backupMessage && <p className="backup-message" role="status">{backupMessage}</p>}
      <p className="fine-print">{native?'Choose a folder in shared device storage. RykocCllection will keep one backup file there and update it automatically when your library changes. After reinstalling, select the same folder again or use Restore from device.':'Backups are downloaded as a JSON file that you choose where to store. After reinstalling, open this page and restore that file. Browser security does not allow silent folder access.'}</p>
    </section>
    <div className="privacy-grid"><div className="privacy-info"><h3><ShieldCheck size={17}/> First-party protection</h3><p>No advertising SDKs or analytics trackers are bundled by this application. External links open with safe browser isolation attributes.</p><span className="status-good">Enabled by design</span></div><div className="privacy-info"><h3><ExternalLink size={17}/> External video providers</h3><p>This is a regular website, not a network-level ad blocker. It cannot filter requests inside cross-origin video iframes or control ads served by an external player.</p><span className="status-neutral">Provider controlled</span></div><div className="privacy-info"><h3><Bookmark size={17}/> Local data</h3><p>Your watchlist and recently viewed titles are stored locally on this device. They are not synced to a server.</p><span className="status-good">Stored on this device</span></div><div className="privacy-info"><h3><ShieldCheck size={17}/> Protection limits</h3><p>For stronger network-wide filtering, use a reputable browser content blocker or device-level DNS filtering. Do not disable provider security or access controls.</p><span className="status-neutral">Browser limitation</span></div></div>
    <p className="fine-print">AniList is used for public anime metadata. Requests are sent directly from your browser to AniList's public GraphQL API. Privacy mode does not claim to block all advertisements on third-party websites.</p>
  </main>;
}

export default function App() {
  const [user, setUser] = useState<User | null>(null);
  const [mode, setMode] = useState<CatalogueMode>(() => readStore<CatalogueMode>('rykoc-catalogue-mode', 'anime'));
  const navigate = useNavigate();
  const changeMode = (next: CatalogueMode) => { setMode(next); localStorage.setItem('rykoc-catalogue-mode', next); navigate('/'); };
  useEffect(() => {
    let active = true;
    supabase.auth.getSession().then(({ data }) => {
      if (active) setUser(data.session?.user ?? null);
    });
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      setUser(session?.user ?? null);
    });
    return () => { active = false; subscription.unsubscribe(); };
  }, []);
  const signOut = () => { void supabase.auth.signOut(); };
  return <><Header user={user} onSignOut={signOut} mode={mode} onModeChange={changeMode}/><Routes><Route path="/" element={<Home mode={mode}/>}/><Route path="/search" element={<SearchPage mode={mode}/>}/><Route path="/smart-discovery" element={<SmartDiscovery mode={mode}/>}/><Route path="/anime/:id" element={<DetailPage user={user} mode="anime"/>}/><Route path="/manga/:id" element={<DetailPage user={user} mode="manga"/>}/><Route path="/watchlist" element={<WatchlistPage/>}/><Route path="/video" element={<VideoPage/>}/><Route path="/account" element={<AccountPage user={user}/>}/><Route path="/settings" element={<SettingsPage mode={mode} onModeChange={changeMode}/>}/><Route path="/about" element={<AboutPage/>}/><Route path="/privacy" element={<PrivacyPage/>}/><Route path="*" element={<main className="content-page empty-state"><h1>Page not found</h1><Link to="/">Return home</Link></main>}/></Routes><BottomNavigation/><footer className="footer"><Link to="/" className="brand"><span className="brand-mark">K</span><span>RYKOCCLLECTION</span></Link><p>Discover stories. Find your next world.</p><span>Anime metadata via AniList · Independent fan discovery project</span></footer></>;
}
