import { useEffect, useState, type FormEvent } from 'react';
import { Link, Route, Routes, useNavigate, useParams, useLocation } from 'react-router-dom';
import { Search, Compass, Bookmark, ShieldCheck, Play, Star, ChevronRight, ArrowLeft, Heart, Clock3, Menu, X, ExternalLink, SlidersHorizontal, Sparkles, Tv, Info, Users, FileText, Globe, Youtube, ChevronDown, RotateCw, MessageCircle } from 'lucide-react';
// The application UI and page components are defined below.
import { Anime, AnimeCharacter, cleanDescription, getAnime, getAnimeCharacters, getPopular, getSeasonal, getTrending, imageOf, searchAnime, titleOf } from './lib/anilist';
import type { User } from '@supabase/supabase-js';
import { supabase } from './lib/supabase';
import { AnimeComments } from './components/AnimeComments';

type StoredProgress = { id: number; title: string; image: string; progress: number; updated: number };
const readStore = <T,>(key: string, fallback: T): T => {
  try { const value = localStorage.getItem(key); return value ? JSON.parse(value) as T : fallback; } catch { return fallback; }
};

function Header({ user, onSignOut }: { user: User | null; onSignOut: () => void }) {
  const [open, setOpen] = useState(false);
  const [term, setTerm] = useState('');
  const navigate = useNavigate();
  const location = useLocation();
  useEffect(() => setOpen(false), [location.pathname]);
  const submit = (event: FormEvent) => { event.preventDefault(); navigate(term.trim() ? `/search?q=${encodeURIComponent(term.trim())}` : '/search'); setOpen(false); };
  return <header className="topbar"><div className="nav-wrap">
    <Link to="/" className="brand"><span className="brand-mark">R</span><span>RYKOCCLLECTION</span></Link>
    <nav className={open ? 'nav-links open' : 'nav-links'}>
      <Link to="/"><Compass size={16}/> Discover</Link><Link to="/search">Explore</Link><Link to="/watchlist"><Bookmark size={16}/> My list</Link><Link to="/video"><Tv size={16}/> Video</Link><Link to="/privacy"><ShieldCheck size={16}/> Privacy</Link>
    </nav>
    <form className="nav-search" onSubmit={submit}><Search size={17}/><input value={term} onChange={e => setTerm(e.target.value)} placeholder="Search anime..." aria-label="Search anime"/><kbd>↵</kbd></form>
    {user && <div className="nav-account"><span>{String(user.user_metadata?.display_name || "Reader")}</span><button onClick={onSignOut}>Sign out</button></div>}
    <button className="icon-btn mobile-menu" onClick={() => setOpen(!open)} aria-label="Toggle menu">{open ? <X/> : <Menu/>}</button>
  </div></header>;
}

function AnimeCard({ anime, onSave, saved }: { anime: Anime; onSave: (anime: Anime) => void; saved: boolean }) {
  return <article className="anime-card">
    <Link to={`/anime/${anime.id}`} className="poster-wrap">
      <img src={imageOf(anime)} alt={titleOf(anime)} loading="lazy"/>
      <span className="poster-format">{anime.format || 'ANIME'}</span>
      {anime.averageScore ? <span className="poster-score"><Star size={12} fill="currentColor"/> {(anime.averageScore / 10).toFixed(1)}</span> : null}
    </Link>
    <div className="card-meta"><div className="card-title-row"><Link to={`/anime/${anime.id}`} className="card-title">{titleOf(anime)}</Link><button className={saved ? 'save-mini saved' : 'save-mini'} onClick={() => onSave(anime)} aria-label={saved ? 'Remove from watchlist' : 'Add to watchlist'}><Bookmark size={15} fill={saved ? 'currentColor' : 'none'}/></button></div><p>{anime.seasonYear || 'Year unknown'} <span>·</span> {anime.episodes ? `${anime.episodes} eps` : 'Ongoing'}</p></div>
  </article>;
}

function Section({ title, subtitle, items, saved, onSave, to }: { title: string; subtitle?: string; items: Anime[]; saved: number[]; onSave: (anime: Anime) => void; to?: string }) {
  if (!items.length) return null;
  return <section className="section"><div className="section-head"><div><h2>{title}</h2>{subtitle && <p>{subtitle}</p>}</div>{to && <Link to={to} className="text-link">View all <ChevronRight size={16}/></Link>}</div><div className="anime-grid">{items.map(item => <AnimeCard key={item.id} anime={item} saved={saved.includes(item.id)} onSave={onSave}/>)}</div></section>;
}

function useLibrary() {
  const [saved, setSaved] = useState<Anime[]>(() => readStore<Anime[]>('kairo-watchlist', []));
  const [history, setHistory] = useState<StoredProgress[]>(() => readStore<StoredProgress[]>('kairo-history', []));
  useEffect(() => localStorage.setItem('kairo-watchlist', JSON.stringify(saved)), [saved]);
  useEffect(() => localStorage.setItem('kairo-history', JSON.stringify(history)), [history]);
  const toggle = (anime: Anime) => setSaved(old => old.some(item => item.id === anime.id) ? old.filter(item => item.id !== anime.id) : [anime, ...old]);
  const remember = (anime: Anime) => setHistory(old => [{ id: anime.id, title: titleOf(anime), image: imageOf(anime), progress: 0, updated: Date.now() }, ...old.filter(item => item.id !== anime.id)].slice(0, 20));
  return { saved, history, toggle, remember };
}

function Home() {
  const [trending, setTrending] = useState<Anime[]>([]);
  const [popular, setPopular] = useState<Anime[]>([]);
  const [seasonal, setSeasonal] = useState<Anime[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const { saved, history, toggle } = useLibrary();
  useEffect(() => {
    let active = true;
    Promise.all([getTrending(), getPopular(), getSeasonal()])
      .then(([a,b,c]) => { if (active) { setTrending(a); setPopular(b); setSeasonal(c); } })
      .catch(e => { if (active) setError(e instanceof Error ? e.message : 'Could not load anime right now.'); })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, []);
  const hero = trending[0];
  return <main className="page-shell">
    {hero && <section className="hero" style={{ backgroundImage: `linear-gradient(90deg, #08090d 3%, rgba(8,9,13,.94) 35%, rgba(8,9,13,.32) 100%), linear-gradient(0deg,#08090d 0%,transparent 55%), url(${hero.bannerImage || imageOf(hero)})` }}>
      <div className="hero-copy"><span className="eyebrow"><Sparkles size={14}/> YOUR NEXT FAVORITE STARTS HERE</span><h1>Find your next<br/><em>anime obsession.</em></h1><p>Explore stories worth getting lost in. Discover trending series, seasonal gems and timeless favorites.</p><div className="hero-actions"><Link className="primary-btn" to={hero ? `/anime/${hero.id}` : '/search'}><Play size={16} fill="currentColor"/> Explore featured</Link><Link className="secondary-btn" to="/search">Browse library <ChevronRight size={16}/></Link></div><div className="hero-featured">{hero && <><span>FEATURED PICK</span><strong>{titleOf(hero)}</strong></>}</div></div>
      <div className="hero-art">{hero && <img src={imageOf(hero)} alt={titleOf(hero)}/>}</div>
    </section>}
    {!hero && <div className="hero hero-loading"><div className="hero-copy"><span className="eyebrow">RYKOCCLLECTION ANIME DISCOVERY</span><h1>Stories that stay<br/><em>with you.</em></h1><p>Find your next anime, one discovery at a time.</p><Link className="primary-btn" to="/search">Explore anime <ChevronRight size={16}/></Link></div></div>}
    {error && <div className="notice"><strong>Catalogue unavailable.</strong> {error} Check your connection and try again.</div>}
    {loading && <div className="section"><div className="section-head"><h2>Finding something great</h2></div><div className="anime-grid">{Array.from({length: 6}, (_,i) => <div className="skeleton-card" key={i}><div className="skeleton-poster"/><div className="skeleton-line"/></div>)}</div></div>}
    <Section title="Trending now" subtitle="What the anime community is watching" items={trending} saved={saved.map(a => a.id)} onSave={toggle} to="/search?sort=trending"/>
    <Section title="This season" subtitle="Fresh stories airing right now" items={seasonal} saved={saved.map(a => a.id)} onSave={toggle}/>
    <Section title="Popular picks" subtitle="Fan favorites worth your time" items={popular} saved={saved.map(a => a.id)} onSave={toggle}/>
    {history.length > 0 && <section className="section"><div className="section-head"><div><h2>Pick up where you left off</h2><p>Your recently opened anime</p></div></div><div className="history-row">{history.slice(0,5).map(item => <Link to={`/anime/${item.id}`} className="history-item" key={item.id}><img src={item.image} alt=""/><span>{item.title}</span><small>Recently viewed</small></Link>)}</div></section>}
    <div className="api-credit">Anime metadata provided by AniList. RykocCllection is an independent discovery interface.</div>
  </main>;
}

function SearchPage() {
  const location = useLocation();
  const params = new URLSearchParams(location.search);
  const [term, setTerm] = useState(params.get('q') || '');
  const [genre, setGenre] = useState('');
  const [items, setItems] = useState<Anime[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const { saved, toggle } = useLibrary();
  useEffect(() => { setTerm(params.get('q') || ''); }, [location.search]);
  useEffect(() => {
    let active = true;
    const timer = window.setTimeout(() => {
      setBusy(true); setError('');
      searchAnime(term.trim(), 1, genre || undefined).then(data => { if (active) setItems(data); })
        .catch(e => { if (active) setError(e instanceof Error ? e.message : 'Search failed.'); })
        .finally(() => { if (active) setBusy(false); });
    }, 350);
    return () => { active = false; window.clearTimeout(timer); };
  }, [term, genre]);
  const genres = ['Action','Adventure','Comedy','Drama','Fantasy','Horror','Mystery','Romance','Sci-Fi','Slice of Life','Sports','Supernatural'];
  return <main className="content-page"><div className="page-heading"><span className="eyebrow">THE ANIME CATALOGUE</span><h1>Explore <em>anime.</em></h1><p>Search for a favorite or let a new story find you.</p></div>
    <div className="filter-bar"><div className="large-search"><Search/><input value={term} onChange={e => setTerm(e.target.value)} placeholder="Search titles, series, stories..." autoFocus/></div><label className="genre-select"><SlidersHorizontal size={16}/><select value={genre} onChange={e => setGenre(e.target.value)}><option value="">All genres</option>{genres.map(g => <option key={g}>{g}</option>)}</select></label></div>
    <div className="results-caption">{busy ? 'Searching catalogue…' : `${items.length} results shown`}{term && <span> for “{term}”</span>}</div>
    {error && <div className="notice">{error}</div>}
    {busy && !items.length ? <div className="anime-grid">{Array.from({length:8},(_,i)=><div className="skeleton-card" key={i}><div className="skeleton-poster"/><div className="skeleton-line"/></div>)}</div> :
      items.length ? <div className="anime-grid">{items.map(item=><AnimeCard key={item.id} anime={item} saved={saved.some(a=>a.id===item.id)} onSave={toggle}/>)}</div> :
      <div className="empty-state"><Search size={28}/><h3>No anime found</h3><p>Try another title or choose a different genre.</p></div>}
  </main>;
}

function DetailPage({ user }: { user: User | null }) {
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
    getAnime(animeId)
      .then(data => { if (active) { setAnime(data); if (!data) setError('AniList could not find this entry.'); } })
      .catch(e => { if (active) setError(e instanceof Error ? e.message : 'Could not load anime metadata.'); })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [id, attempt]);

  const loadMoreCharacters = async () => {
    if (!anime?.characters?.pageInfo.hasNextPage || loadingCharacters) return;
    const nextPage = characterPage + 1;
    setLoadingCharacters(true); setCharacterError('');
    try {
      const result = await getAnimeCharacters(anime.id, nextPage);
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
            <span><Play size={14}/> {anime.episodes ?? '—'} episodes</span>
            <span><Clock3 size={14}/> {anime.status?.replaceAll('_',' ') || 'Unknown status'}</span>
          </div>
          <div className="genre-tags">{anime.genres?.map(g=><span key={g}>{g}</span>)}</div>
          <div className="hero-actions">
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
        <div className="overview-trailer">
          <div className="entry-section-heading"><span className="eyebrow">OFFICIAL PREVIEW</span><h2>Trailer</h2></div>
          {trailerId ? <div className="entry-trailer-frame"><iframe src={`https://www.youtube-nocookie.com/embed/${trailerId}?rel=0`} title={`Trailer for ${titleOf(anime)}`} allow="accelerometer; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share" allowFullScreen referrerPolicy="strict-origin-when-cross-origin"/></div> :
            <div className="entry-empty"><Youtube size={22}/><span>No supported trailer is listed for this entry.</span>{anime.siteUrl && <a href={anime.siteUrl} target="_blank" rel="noreferrer">Check entry sources <ExternalLink size={13}/></a>}</div>}
        </div>
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
            <div className="character-facts">{selectedCharacter.gender && <span><strong>Gender</strong>{selectedCharacter.gender}</span>}{selectedCharacter.age && <span><strong>Age</strong>{selectedCharacter.age}</span>}{selectedCharacter.dateOfBirth && <span><strong>Birthday</strong>{[selectedCharacter.dateOfBirth.month,selectedCharacter.dateOfBirth.day].filter(Boolean).join('/') || 'Not listed'}</span>}{selectedCharacter.favourites ? <span><strong>Favorites</strong>{selectedCharacter.favourites.toLocaleString()}</span> : null}</div>
            <div className="character-bio">{cleanDescription(selectedCharacter.description) || 'No biography is available for this character yet.'}</div>
            {selectedCharacter.voiceActors?.length ? <div className="character-voice-actors"><h3>Japanese voice actors</h3>{selectedCharacter.voiceActors.slice(0,4).map(actor=><span key={actor.id}>{actor.image?.large && <img src={actor.image.large} alt=""/>}{actor.name.full || 'Voice actor'}</span>)}</div>:null}
            {selectedCharacter.siteUrl && <a className="secondary-btn" href={selectedCharacter.siteUrl} target="_blank" rel="noreferrer">Full character profile <ExternalLink size={14}/></a>}
          </section>
        </div>}
      </section>}

      {activeTab === 'details' && <section className="entry-panel details-panel">
        <div className="entry-section-heading"><span className="eyebrow">ENTRY INFORMATION</span><h2>Details</h2></div>
        <div className="entry-details-grid">
          <div><span>Type</span><strong>{anime.format || 'Not listed'}</strong></div>
          <div><span>Status</span><strong>{anime.status?.replaceAll('_',' ') || 'Not listed'}</strong></div>
          <div><span>Release</span><strong>{releaseDate}</strong></div>
          <div><span>Author / creator</span><strong>{authors.length?authors.join(', '):'Not listed by AniList'}</strong></div>
          <div><span>Artist</span><strong>{artists.length?artists.join(', '):'Not listed by AniList'}</strong></div>
          <div><span>Country</span><strong>{anime.countryOfOrigin || 'Not listed'}</strong></div>
          <div className="detail-wide"><span>Alternative titles</span><strong>{[anime.title.english,anime.title.romaji,anime.title.native,...(anime.synonyms||[])].filter((value,index,array)=>value && array.indexOf(value)===index).join(' · ') || 'Not listed'}</strong></div>
          <div><span>Source material</span><strong>{sourceName}</strong></div>
          <div><span>Studio</span><strong>{anime.studios?.nodes?.map(studio=>studio.name).join(', ') || 'Not listed'}</strong></div>
        </div>
        <div className="entry-source-links"><h3><Globe size={17}/> Source links</h3><div>{anime.siteUrl && <a href={anime.siteUrl} target="_blank" rel="noreferrer">AniList entry <ExternalLink size={13}/></a>}{(anime.externalLinks||[]).filter(link=>link.url?.startsWith('https://')).slice(0,12).map(link=><a key={link.url} href={link.url} target="_blank" rel="noreferrer">{link.site || 'External source'} <ExternalLink size={13}/></a>)}</div></div>
      </section>}

      {activeTab === 'comments' && <div className="entry-comments-panel"><AnimeComments animeId={anime.id} animeTitle={titleOf(anime)} user={user}/></div>}

      {showPlayer && <div className="player-panel"><div className="section-head"><div><h2>Watch panel</h2><p>Use a video URL you are authorized to access.</p></div><button className="icon-btn" onClick={()=>setShowPlayer(false)} aria-label="Close player"><X/></button></div><div className="source-input"><input value={source} onChange={e=>setSource(e.target.value)} placeholder="Paste an authorized HTTPS video URL"/><button className="primary-btn" onClick={()=>{if(source.startsWith('https://')) window.open(source,'_blank','noopener,noreferrer');}}>Open source</button></div><p className="fine-print">RykocCllection does not host episodes or provide unauthorized streams. Playback and advertising behavior on external providers is controlled by those providers.</p></div>}
    </div>
  </main>;
}

function WatchlistPage() {
  const { saved, toggle } = useLibrary();
  return <main className="content-page"><div className="page-heading"><span className="eyebrow">YOUR PERSONAL COLLECTION</span><h1>My <em>watchlist.</em></h1><p>Keep the stories you want to come back to close.</p></div>{saved.length ? <div className="anime-grid">{saved.map(a=><AnimeCard key={a.id} anime={a} saved onSave={toggle}/>)}</div> : <div className="empty-state"><Bookmark size={28}/><h3>Your list is waiting</h3><p>Save anime from the catalogue and they will appear here.</p><Link className="primary-btn" to="/search">Discover anime</Link></div>}</main>;
}

function VideoPage() {
  const [videos, setVideos] = useState<Anime[]>([]);
  const [selected, setSelected] = useState<Anime | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    let active = true;
    Promise.all([getTrending(), getPopular(), getSeasonal()])
      .then(groups => {
        if (!active) return;
        const seen = new Set<number>();
        const clips = groups.flat().filter(anime => {
          const id = anime.trailer?.id || '';
          const valid = anime.trailer?.site?.toLowerCase() === 'youtube' && /^[a-zA-Z0-9_-]{6,}$/.test(id);
          if (!valid || seen.has(anime.id)) return false;
          seen.add(anime.id);
          return true;
        });
        setVideos(clips);
        setSelected(clips[0] || null);
      })
      .catch(e => { if (active) setError(e instanceof Error ? e.message : 'Could not load anime previews.'); })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, []);

  const trailerId = selected?.trailer?.id;
  return <main className="video-page">
    <div className="video-toolbar">
      <div><span className="eyebrow">RYKOCCLLECTION VIDEO</span><h1>Anime <em>trailers.</em></h1><p>Watch promotional previews linked through AniList metadata and YouTube.</p></div>
      {selected?.siteUrl && <a className="secondary-btn" href={selected.siteUrl} target="_blank" rel="noopener noreferrer">Anime details <ExternalLink size={14}/></a>}
    </div>
    {error && <div className="notice">{error}</div>}
    {loading ? <div className="video-loading">Loading anime previews…</div> : selected && trailerId ? <section className="video-feature">
      <div className="video-player-wrap"><iframe key={trailerId} src={`https://www.youtube-nocookie.com/embed/${trailerId}?rel=0`} title={`Trailer for ${titleOf(selected)}`} allow="accelerometer; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share" allowFullScreen referrerPolicy="strict-origin-when-cross-origin"/></div>
      <div className="video-selected"><div><span className="eyebrow">NOW SELECTED</span><h2>{titleOf(selected)}</h2><p>{selected.seasonYear || 'Release year unavailable'} · {selected.format || 'Anime'} · {selected.episodes || 'Episode count unavailable'} episodes</p></div><a className="secondary-btn" href={`https://www.youtube.com/watch?v=${trailerId}`} target="_blank" rel="noopener noreferrer">Open on YouTube <ExternalLink size={14}/></a></div>
    </section> : <div className="empty-state"><Play size={28}/><h3>No trailers available right now</h3><p>AniList has not returned supported YouTube trailer IDs for the current catalogue.</p><Link className="secondary-btn" to="/search">Explore anime</Link></div>}
    {videos.length > 0 && <section className="section video-library"><div className="section-head"><div><h2>More previews</h2><p>Select a title to watch its trailer</p></div><span className="results-caption">{videos.length} trailers</span></div><div className="video-trailer-grid">{videos.map(anime => <button key={anime.id} className={selected?.id === anime.id ? 'video-trailer-card selected' : 'video-trailer-card'} onClick={() => { setSelected(anime); window.scrollTo({top: 0, behavior: 'smooth'}); }}><span className="video-trailer-image"><img src={imageOf(anime)} alt="" loading="lazy"/><span className="video-play-icon"><Play size={19} fill="currentColor"/></span></span><span className="video-trailer-title">{titleOf(anime)}</span><span className="video-trailer-meta">{anime.seasonYear || 'Year unknown'} · {anime.format || 'Anime'}</span></button>)}</div></section>}
    <p className="fine-print">RykocCllection displays trailer metadata from AniList and embeds YouTube previews. These are promotional videos, not full episodes. Playback, availability, content ratings and advertisements are controlled by YouTube and the video publisher. RykocCllection does not host video files or extract streams.</p>
  </main>;
}
function PrivacyPage() {
  const [protection, setProtection] = useState(()=>readStore('kairo-privacy', true));
  useEffect(()=>localStorage.setItem('kairo-privacy', JSON.stringify(protection)),[protection]);
  return <main className="content-page privacy-page"><div className="page-heading"><span className="eyebrow">YOUR DATA, YOUR CHOICE</span><h1>Privacy <em>center.</em></h1><p>Simple controls and clear information about what this app can protect.</p></div>
    <div className="privacy-card"><div className="privacy-icon"><ShieldCheck/></div><div className="privacy-copy"><h2>Privacy-friendly mode</h2><p>Controls optional local preferences and keeps this app free of injected ad scripts and third-party analytics.</p></div><button className={protection?'toggle active':'toggle'} onClick={()=>setProtection(!protection)} aria-label="Toggle privacy mode"><span/></button></div>
    <div className="privacy-grid"><div className="privacy-info"><h3><ShieldCheck size={17}/> First-party protection</h3><p>No advertising SDKs or analytics trackers are bundled by this application. External links open with safe browser isolation attributes.</p><span className="status-good">Enabled by design</span></div><div className="privacy-info"><h3><ExternalLink size={17}/> External video providers</h3><p>This is a regular website, not a network-level ad blocker. It cannot filter requests inside cross-origin video iframes or control ads served by an external player.</p><span className="status-neutral">Provider controlled</span></div><div className="privacy-info"><h3><Bookmark size={17}/> Local data</h3><p>Your watchlist and recently viewed titles are stored in this browser's local storage. They are not synced to a server.</p><span className="status-good">Stored on this device</span></div><div className="privacy-info"><h3><ShieldCheck size={17}/> Protection limits</h3><p>For stronger network-wide filtering, use a reputable browser content blocker or device-level DNS filtering. Do not disable provider security or access controls.</p><span className="status-neutral">Browser limitation</span></div></div>
    <p className="fine-print">AniList is used for public anime metadata. Requests are sent directly from your browser to AniList's public GraphQL API. Privacy mode does not claim to block all advertisements on third-party websites.</p>
  </main>;
}

export default function App() {
  const [user, setUser] = useState<User | null>(null);
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
  return <><Header user={user} onSignOut={signOut}/><Routes><Route path="/" element={<Home/>}/><Route path="/search" element={<SearchPage/>}/><Route path="/anime/:id" element={<DetailPage user={user}/>}/><Route path="/watchlist" element={<WatchlistPage/>}/><Route path="/video" element={<VideoPage/>}/><Route path="/privacy" element={<PrivacyPage/>}/><Route path="*" element={<main className="content-page empty-state"><h1>Page not found</h1><Link to="/">Return home</Link></main>}/></Routes><footer className="footer"><Link to="/" className="brand"><span className="brand-mark">K</span><span>RYKOCCLLECTION</span></Link><p>Discover stories. Find your next world.</p><span>Anime metadata via AniList · Independent fan discovery project</span></footer></>;
}
