import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { BarChart3, Bell, CalendarDays, Check, GitCompare, History, Search, Sparkles, TrendingUp, WifiOff, X } from 'lucide-react';
import { Anime, getAnime, getTrending, imageOf, searchAnime, titleOf } from '../lib/anilist';

type Mode = 'anime' | 'manga';
type Status = 'Watching' | 'Plan to Watch' | 'Completed' | 'Waiting';
type HistoryItem = { id: number; title: string; image: string; progress: number; updated: number };
const readLocal = <T,>(key: string, fallback: T): T => {
  try { const value = localStorage.getItem(key); return value ? JSON.parse(value) as T : fallback; } catch { return fallback; }
};

export function SmartDiscovery({ mode }: { mode: Mode }) {
  const [saved, setSaved] = useState<Anime[]>(() => readLocal('kairo-watchlist', []));
  const [statuses] = useState<Record<number, Status>>(() => readLocal('rykoc-library-status', {}));
  const [history] = useState<HistoryItem[]>(() => readLocal('kairo-history', []));
  const [term, setTerm] = useState('');
  const [genre, setGenre] = useState('');
  const [status, setStatus] = useState('');
  const [format, setFormat] = useState('');
  const [year, setYear] = useState('');
  const [score, setScore] = useState('');
  const [sort, setSort] = useState('SEARCH_MATCH');
  const [results, setResults] = useState<Anime[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [compareIds, setCompareIds] = useState<number[]>([]);
  const [compareItems, setCompareItems] = useState<Anime[]>([]);
  const [compareOpen, setCompareOpen] = useState(false);
  const [suggestions, setSuggestions] = useState<string[]>(() => readLocal('rykoc-search-history', []));
  const [trending, setTrending] = useState<Anime[]>([]);

  useEffect(() => {
    let active = true;
    getTrending(mode.toUpperCase() as 'ANIME' | 'MANGA').then(items => { if (active) setTrending(items); }).catch(() => undefined);
    return () => { active = false; };
  }, [mode]);

  useEffect(() => {
    let active = true;
    const timer = window.setTimeout(() => {
      setLoading(true);
      setError('');
      searchAnime(term.trim(), 1, genre || undefined, status || undefined, format || undefined,
        mode.toUpperCase() as 'ANIME' | 'MANGA', year ? Number(year) : undefined, score ? Number(score) : undefined, sort)
        .then(items => { if (active) setResults(items); })
        .catch(reason => { if (active) setError(reason instanceof Error ? reason.message : 'Search is temporarily unavailable.'); })
        .finally(() => { if (active) setLoading(false); });
    }, 350);
    return () => { active = false; window.clearTimeout(timer); };
  }, [term, genre, status, format, year, score, sort, mode]);

  const genres = ['Action','Adventure','Comedy','Drama','Fantasy','Horror','Mystery','Romance','Sci-Fi','Slice of Life','Sports','Supernatural'];
  const savedGenres = useMemo(() => [...new Set(saved.flatMap(item => item.genres || []))], [saved]);
  const recommendations = useMemo(() => {
    const pool = [...trending, ...results].filter((item, index, all) => all.findIndex(other => other.id === item.id) === index && !saved.some(entry => entry.id === item.id));
    return pool.map(item => ({ item, score: (item.genres || []).filter(value => savedGenres.includes(value)).length }))
      .sort((a, b) => b.score - a.score || (b.item.popularity || 0) - (a.item.popularity || 0)).slice(0, 5).map(row => row.item);
  }, [trending, results, saved, savedGenres]);

  const upcoming = useMemo(() => [...saved, ...trending].filter((item, index, all) =>
    item.nextAiringEpisode && item.nextAiringEpisode.airingAt * 1000 > Date.now() &&
    all.findIndex(other => other.id === item.id) === index)
    .sort((a, b) => (a.nextAiringEpisode?.airingAt || 0) - (b.nextAiringEpisode?.airingAt || 0)).slice(0, 8), [saved, trending]);

  const toggleSaved = (item: Anime) => {
    setSaved(old => {
      const next = old.some(entry => entry.id === item.id) ? old.filter(entry => entry.id !== item.id) : [item, ...old];
      localStorage.setItem('kairo-watchlist', JSON.stringify(next));
      return next;
    });
  };
  const chooseCompare = (item: Anime) => setCompareIds(old => old.includes(item.id) ? old.filter(id => id !== item.id) : old.length < 3 ? [...old, item.id] : old);
  const openCompare = async () => {
    setCompareOpen(true);
    const rows = await Promise.all(compareIds.map(id => getAnime(id, mode.toUpperCase() as 'ANIME' | 'MANGA')));
    setCompareItems(rows.filter((item): item is Anime => Boolean(item)));
  };
  const rememberSearch = () => {
    if (!term.trim()) return;
    const next = [term.trim(), ...suggestions.filter(value => value.toLowerCase() !== term.trim().toLowerCase())].slice(0, 8);
    setSuggestions(next);
    localStorage.setItem('rykoc-search-history', JSON.stringify(next));
  };

  const stats = [
    { label: 'Saved titles', value: saved.length, icon: <BarChart3/> },
    { label: 'Watching', value: saved.filter(item => statuses[item.id] === 'Watching').length, icon: <TrendingUp/> },
    { label: 'Completed', value: saved.filter(item => statuses[item.id] === 'Completed').length, icon: <Check/> },
    { label: 'Recently viewed', value: history.length, icon: <History/> }
  ];
  const compareRows: Array<[string, (item: Anime) => string]> = [
    ['Score', item => item.averageScore ? (item.averageScore / 10).toFixed(1) + '/10' : '—'],
    ['Year', item => String(item.seasonYear || '—')],
    ['Format', item => item.format || '—'],
    ['Status', item => item.status?.replaceAll('_', ' ') || '—'],
    ['Genres', item => item.genres?.join(', ') || '—'],
    ['Popularity', item => item.popularity?.toLocaleString() || '—'],
    ['Episodes / chapters', item => String(mode === 'manga' ? item.chapters ?? '—' : item.episodes ?? '—')],
    ['Studios', item => item.studios?.nodes?.map(studio => studio.name).join(', ') || '—']
  ];

  return <main className="content-page smart-discovery">
    <div className="page-heading"><span className="eyebrow"><Sparkles size={14}/> YOUR PERSONAL DISCOVERY SPACE</span><h1>Discover <em>smarter.</em></h1><p>Recommendations, advanced search, release updates and collection insights in one place.</p></div>
    <section className="library-stat-grid">{stats.map(item => <div key={item.label}>{item.icon}<span>{item.label}</span><strong>{item.value}</strong></div>)}</section>
    <section className="section"><div className="section-head"><div><span className="eyebrow"><Search size={13}/> ADVANCED DISCOVERY</span><h2>Find the right title</h2><p>Combine filters or search by title. Search history stays on this device.</p></div></div>
      <div className="smart-search-row"><label className="large-search"><Search size={18}/><input list="rykoc-smart-suggestions" value={term} onChange={event => setTerm(event.target.value)} onKeyDown={event => { if (event.key === 'Enter') rememberSearch(); }} placeholder={'Search ' + mode + ' titles...'}/><datalist id="rykoc-smart-suggestions">{suggestions.map(value => <option key={value} value={value}/>)}</datalist></label><button className="secondary-btn" onClick={rememberSearch}>Save search</button></div>
      <div className="smart-filter-grid">
        <label className="genre-select"><span>Genre</span><select value={genre} onChange={event => setGenre(event.target.value)}><option value="">All genres</option>{genres.map(value => <option key={value}>{value}</option>)}</select></label>
        <label className="genre-select"><span>Status</span><select value={status} onChange={event => setStatus(event.target.value)}><option value="">Any status</option><option value="RELEASING">Airing</option><option value="FINISHED">Finished</option><option value="NOT_YET_RELEASED">Upcoming</option><option value="HIATUS">Hiatus</option></select></label>
        <label className="genre-select"><span>Format</span><select value={format} onChange={event => setFormat(event.target.value)}><option value="">Any format</option><option value="TV">TV</option><option value="TV_SHORT">TV Short</option><option value="MOVIE">Movie</option><option value="OVA">OVA</option><option value="ONA">ONA</option><option value="SPECIAL">Special</option><option value="MANGA">Manga</option><option value="NOVEL">Novel</option></select></label>
        <label className="genre-select"><span>Year</span><select value={year} onChange={event => setYear(event.target.value)}><option value="">Any year</option>{Array.from({length: 40}, (_, index) => new Date().getFullYear() - index).map(value => <option key={value}>{value}</option>)}</select></label>
        <label className="genre-select"><span>Minimum score</span><select value={score} onChange={event => setScore(event.target.value)}><option value="">Any score</option><option value="60">6+</option><option value="70">7+</option><option value="80">8+</option><option value="90">9+</option></select></label>
        <label className="genre-select"><span>Sort by</span><select value={sort} onChange={event => setSort(event.target.value)}><option value="SEARCH_MATCH">Best match</option><option value="TRENDING_DESC">Trending</option><option value="POPULARITY_DESC">Popularity</option><option value="SCORE_DESC">Top rated</option><option value="START_DATE_DESC">Newest</option></select></label>
      </div>
      {suggestions.length > 0 && <div className="search-history"><History size={14}/><span>Recent searches</span>{suggestions.slice(0, 5).map(value => <button key={value} onClick={() => setTerm(value)}>{value}</button>)}</div>}
      {error && <div className="notice">{error}</div>}
      <div className="smart-results-heading"><span>{loading ? 'Searching catalogue…' : results.length + ' results'}</span>{compareIds.length > 0 && <button className="primary-btn" disabled={compareIds.length < 2} onClick={openCompare}><GitCompare size={15}/> Compare {compareIds.length}/3</button>}</div>
      {loading && !results.length ? <p className="fine-print">Loading titles…</p> : results.length ? <div className="anime-grid">{results.slice(0, 30).map(item => <article className="anime-card" key={item.id}><Link to={'/' + mode + '/' + item.id} className="poster-wrap"><img src={imageOf(item)} alt={titleOf(item)} loading="lazy"/><span className="poster-format">{item.format || mode.toUpperCase()}</span>{item.averageScore ? <span className="poster-score">{(item.averageScore / 10).toFixed(1)}</span> : null}</Link><div className="card-meta"><Link className="card-title" to={'/' + mode + '/' + item.id}>{titleOf(item)}</Link><p>{item.seasonYear || 'Year unknown'} · {item.genres?.slice(0, 2).join(', ')}</p><div className="smart-card-actions"><button onClick={() => toggleSaved(item)}>{saved.some(entry => entry.id === item.id) ? 'Saved' : 'Add to library'}</button><button className={compareIds.includes(item.id) ? 'selected' : ''} onClick={() => chooseCompare(item)}><GitCompare size={12}/>{compareIds.includes(item.id) ? 'Selected' : 'Compare'}</button></div></div></article>)}</div> : <div className="empty-state"><Search size={26}/><h3>No titles match these filters</h3><p>Try removing a filter or using a shorter search.</p></div>}
    </section>
    {recommendations.length > 0 && <section className="section"><div className="section-head"><div><span className="eyebrow"><Sparkles size={13}/> PERSONALIZED</span><h2>Picked for your taste</h2><p>{savedGenres.length ? 'Matched to genres in your saved library.' : 'Start saving titles to personalize these picks.'}</p></div></div><div className="anime-grid">{recommendations.map(item => <article className="anime-card" key={item.id}><Link to={'/' + mode + '/' + item.id} className="poster-wrap"><img src={imageOf(item)} alt={titleOf(item)} loading="lazy"/></Link><div className="card-meta"><Link className="card-title" to={'/' + mode + '/' + item.id}>{titleOf(item)}</Link><p>{item.genres?.slice(0, 3).join(' · ')}</p><button className="smart-save-btn" onClick={() => toggleSaved(item)}>Add to library</button></div></article>)}</div></section>}
    <section className="section"><div className="section-head"><div><span className="eyebrow"><CalendarDays size={13}/> RELEASE CALENDAR</span><h2>Upcoming episodes</h2><p>Schedule information supplied by AniList.</p></div></div>{upcoming.length ? <div className="release-list">{upcoming.map(item => <Link className="release-row" key={item.id} to={'/' + mode + '/' + item.id}><img src={imageOf(item)} alt=""/><span className="release-name"><strong>{titleOf(item)}</strong><small>Episode {item.nextAiringEpisode?.episode}</small></span><time>{item.nextAiringEpisode ? new Date(item.nextAiringEpisode.airingAt * 1000).toLocaleString([], {weekday: 'short', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit'}) : ''}</time></Link>)}</div> : <div className="empty-state"><CalendarDays size={24}/><h3>No upcoming dates in the current cache</h3><p>Search or open more airing titles to refresh the release schedule.</p></div>}</section>
    <section className="section"><div className="section-head"><div><span className="eyebrow"><Bell size={13}/> NOTIFICATION CENTER</span><h2>Library updates</h2><p>Upcoming episodes for saved titles. These are in-app reminders, not push notifications.</p></div><span className="notification-count">{upcoming.filter(item => saved.some(entry => entry.id === item.id)).length} updates</span></div>{upcoming.filter(item => saved.some(entry => entry.id === item.id)).length ? upcoming.filter(item => saved.some(entry => entry.id === item.id)).map(item => <Link className="notification-row" key={item.id} to={'/' + mode + '/' + item.id}><span className="notification-icon"><Bell size={15}/></span><span><strong>{titleOf(item)}</strong><small>Episode {item.nextAiringEpisode?.episode} · {new Date((item.nextAiringEpisode?.airingAt || 0) * 1000).toLocaleString()}</small></span></Link>) : <p className="fine-print">Save airing titles to see their upcoming episode reminders here.</p>}</section>
    {compareOpen && <div className="character-modal-backdrop" role="presentation" onClick={() => setCompareOpen(false)}><section className="compare-modal" role="dialog" aria-modal="true" aria-label="Compare titles" onClick={event => event.stopPropagation()}><button className="character-modal-close" onClick={() => setCompareOpen(false)} aria-label="Close comparison"><X/></button><span className="eyebrow"><GitCompare size={13}/> SIDE-BY-SIDE COMPARISON</span><h2>Compare selected titles</h2>{compareItems.length < 2 ? <p className="fine-print">Select at least two titles from the results.</p> : <><div className="compare-posters">{compareItems.map(item => <div key={item.id}><img src={imageOf(item)} alt=""/><strong>{titleOf(item)}</strong></div>)}</div><div className="compare-table">{compareRows.map(([label, value]) => <div className="compare-row" key={label}><strong>{label}</strong>{compareItems.map(item => <span key={item.id}>{value(item)}</span>)}</div>)}</div></>}</section></div>}
    <p className="fine-print"><WifiOff size={13}/> Metadata viewed online is cached locally for offline access when available. Fresh release times and search results require a connection.</p>
  </main>;
}
