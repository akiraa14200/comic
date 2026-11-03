import { useEffect, useMemo, useState } from 'react';
import { Download, Plus, RefreshCw, Trash2, Puzzle, ExternalLink, ShieldAlert, Search } from 'lucide-react';

type ExtensionEntry = {
  id: string; name: string; version: string; description?: string; lang?: string;
  nsfw?: boolean; type?: 'web' | 'apk'; manifest?: string; apk?: string;
  icon?: string; site?: string; source?: string; packageName?: string;
  sourceCount?: number; repoFormat?: 'json' | 'protobuf';
};
type Repo = { id: string; url: string; name: string; extensions: ExtensionEntry[]; updatedAt: number; format?: string };
const REPOS_KEY = 'rykoccllection-extension-repositories-v1';
const INSTALLED_KEY = 'rykoccllection-installed-extensions-v1';
const read = <T,>(key: string, fallback: T): T => { try { const raw = localStorage.getItem(key); return raw ? JSON.parse(raw) as T : fallback; } catch { return fallback; } };
const safeHttps = (value: string) => { try { return new URL(value).protocol === 'https:'; } catch { return false; } };
const repoUrl = (raw: string) => raw.trim().replace(/\/$/, '').replace(/\/index\.(?:min\.)?(?:json|pb)$/i, '');
const resolveUrl = (base: string, path?: string) => { if (!path) return ''; try { return new URL(path, base).toString(); } catch { return ''; } };

type ProtoField = { number: number; wire: number; bytes?: Uint8Array; value?: number };
const readVarint = (bytes: Uint8Array, start: number): { value: number; next: number } => {
  let value = 0; let shift = 0; let offset = start;
  while (offset < bytes.length && shift < 53) {
    const byte = bytes[offset++];
    value += (byte & 0x7f) * Math.pow(2, shift);
    if ((byte & 0x80) === 0) return { value, next: offset };
    shift += 7;
  }
  throw new Error('Invalid Protocol Buffers varint.');
};
const readProtoFields = (bytes: Uint8Array): ProtoField[] => {
  const fields: ProtoField[] = []; let offset = 0;
  while (offset < bytes.length) {
    const tag = readVarint(bytes, offset); offset = tag.next;
    const number = Math.floor(tag.value / 8); const wire = tag.value & 7;
    if (!number) throw new Error('Invalid Protocol Buffers field number.');
    if (wire === 0) {
      const item = readVarint(bytes, offset); offset = item.next;
      fields.push({ number, wire, value: item.value });
    } else if (wire === 2) {
      const length = readVarint(bytes, offset); offset = length.next;
      if (length.value < 0 || offset + length.value > bytes.length) throw new Error('Truncated Protocol Buffers field.');
      fields.push({ number, wire, bytes: bytes.subarray(offset, offset + length.value) }); offset += length.value;
    } else if (wire === 1) {
      if (offset + 8 > bytes.length) throw new Error('Truncated Protocol Buffers fixed64 field.');
      offset += 8;
    } else if (wire === 5) {
      if (offset + 4 > bytes.length) throw new Error('Truncated Protocol Buffers fixed32 field.');
      offset += 4;
    } else {
      throw new Error('Unsupported Protocol Buffers wire type: ' + wire);
    }
  }
  return fields;
};
const fieldBytes = (fields: ProtoField[], number: number) => fields.find(field => field.number === number && field.wire === 2)?.bytes;
const fieldText = (fields: ProtoField[], number: number) => { const bytes = fieldBytes(fields, number); return bytes ? new TextDecoder().decode(bytes) : ''; };
const fieldNumber = (fields: ProtoField[], number: number) => fields.find(field => field.number === number && field.wire === 0)?.value ?? 0;
const repeatedBytes = (fields: ProtoField[], number: number) => fields.filter(field => field.number === number && field.wire === 2 && field.bytes).map(field => field.bytes as Uint8Array);
const decodeKeiyoushiIndex = (bytes: Uint8Array, base: string): { name: string; extensions: ExtensionEntry[] } => {
  const root = readProtoFields(bytes);
  const name = fieldText(root, 1) || new URL(base).hostname;
  const list = fieldBytes(root, 101);
  if (!list) throw new Error('The protobuf index does not contain an extension list (field 101).');
  const listFields = readProtoFields(list);
  const extensions = repeatedBytes(listFields, 1).map((encoded): ExtensionEntry | null => {
    const ext = readProtoFields(encoded);
    const packageName = fieldText(ext, 2);
    const version = fieldText(ext, 6);
    const extName = fieldText(ext, 1);
    const resourcesBytes = fieldBytes(ext, 3);
    if (!packageName || !version || !extName || !resourcesBytes) return null;
    const resources = readProtoFields(resourcesBytes);
    const apkPath = fieldText(resources, 1);
    if (!apkPath) return null;
    const sourceList = repeatedBytes(ext, 8).map(encodedSource => {
      const source = readProtoFields(encodedSource);
      return { name: fieldText(source, 2), lang: fieldText(source, 3), baseUrl: fieldText(source, 4) };
    });
    const languageSet = [...new Set(sourceList.map(source => source.lang).filter(Boolean))];
    const warning = fieldNumber(ext, 7);
    return {
      id: packageName, packageName, name: extName, version, type: 'apk',
      apk: resolveUrl(base, apkPath),
      icon: resolveUrl(base, fieldText(resources, 2) || 'icon/' + packageName + '.png'),
      lang: languageSet.length === 1 ? languageSet[0] : languageSet.length ? 'multiple' : 'unknown',
      nsfw: warning >= 2, sourceCount: sourceList.length, repoFormat: 'protobuf',
      description: sourceList.length ? sourceList.length + ' source(s) · Extension library ' + (fieldText(ext, 4) || 'unknown') : 'Android source extension',
    };
  }).filter((item): item is ExtensionEntry => Boolean(item) && !item!.nsfw && safeHttps(item!.apk || ''));
  return { name, extensions };
};
const fetchBytes = async (url: string): Promise<Uint8Array> => {
  const response = await fetch(url, { headers: { Accept: 'application/octet-stream, application/x-protobuf, */*' }, cache: 'no-store' });
  if (!response.ok) throw new Error('Repository returned HTTP ' + response.status + ' for ' + new URL(url).pathname);
  let bytes = new Uint8Array(await response.arrayBuffer());
  if (bytes[0] === 0x1f && bytes[1] === 0x8b) {
    if (typeof DecompressionStream === 'undefined') throw new Error('This browser cannot decompress the repository index.');
    const stream = new Blob([bytes]).stream().pipeThrough(new DecompressionStream('gzip'));
    bytes = new Uint8Array(await new Response(stream).arrayBuffer());
  }
  return bytes;
};

export function ExtensionPage() {
  const [repos, setRepos] = useState<Repo[]>(() => read(REPOS_KEY, []));
  const [installed, setInstalled] = useState<string[]>(() => read(INSTALLED_KEY, []));
  const [repoInput, setRepoInput] = useState('');
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState('');
  const [filter, setFilter] = useState('');
  const [tab, setTab] = useState<'all'|'web'|'apk'|'installed'>('all');
  useEffect(() => { localStorage.setItem(REPOS_KEY, JSON.stringify(repos)); }, [repos]);
  useEffect(() => { localStorage.setItem(INSTALLED_KEY, JSON.stringify(installed)); }, [installed]);
  const extensions = useMemo(() => repos.flatMap(repo => repo.extensions.map(extension => ({...extension, _repo: repo.id, _base: repo.url}))), [repos]);
  const visible = extensions.filter(item => (tab === 'all' || tab === 'installed' || item.type === tab) && (tab !== 'installed' || installed.includes(item.id)) && (item.name+' '+(item.description||'')+' '+(item.lang||'')).toLowerCase().includes(filter.toLowerCase()));

  const readIndex = async (raw: string): Promise<Repo> => {
    const base = repoUrl(raw);
    if (!safeHttps(base)) throw new Error('Repository must use a valid HTTPS URL.');
    const explicitPb = /\.pb$/i.test(raw.trim());
    const explicitJson = /\.json$/i.test(raw.trim());
    const candidates = explicitPb ? [raw.trim(), base + '/index.min.json', base + '/index.json'] : explicitJson ? [raw.trim()] : [base + '/index.pb', base + '/index.min.json', base + '/index.json'];
    let lastError = 'Repository index not found.';
    for (const target of candidates) {
      try {
        if (/\.pb(?:\?|$)/i.test(target)) {
          const decoded = decodeKeiyoushiIndex(await fetchBytes(target), base);
          if (!decoded.extensions.length) throw new Error('The protobuf index was read, but it contains no supported non-restricted Android extensions.');
          return { id: base, url: base, name: decoded.name, extensions: decoded.extensions, updatedAt: Date.now(), format: 'Protocol Buffers (index.pb)' };
        }
        const response = await fetch(target, { headers: { Accept: 'application/json' }, cache: 'no-store' });
        if (!response.ok) { lastError = 'Repository returned HTTP ' + response.status + ' for ' + new URL(target).pathname; continue; }
        const data = await response.json() as unknown;
        const ids = new Set<string>();
        const legacyItems = Array.isArray(data) ? data : null;
        const modernItems = !Array.isArray(data) && data && typeof data === 'object'
          ? ((data as { extensions?: unknown; extensionList?: { extensions?: unknown } }).extensions
            ?? (data as { extensionList?: { extensions?: unknown } }).extensionList?.extensions)
          : null;
        const rawItems = legacyItems ?? (Array.isArray(modernItems) ? modernItems : null);
        if (!rawItems) {
          const repoMetadata = data && typeof data === 'object' ? data as { index_v2?: unknown; meta?: { name?: string } } : null;
          if (typeof repoMetadata?.index_v2 === 'string' && safeHttps(repoMetadata.index_v2)) {
            const decoded = decodeKeiyoushiIndex(await fetchBytes(repoMetadata.index_v2), base);
            if (!decoded.extensions.length) throw new Error('Repository metadata was valid, but its index contains no supported non-restricted extensions.');
            return { id: base, url: base, name: repoMetadata.meta?.name || decoded.name, extensions: decoded.extensions, updatedAt: Date.now(), format: 'Repository metadata → Protocol Buffers' };
          }
          lastError = 'Unsupported repository JSON: expected an extension array or a Mihon extension-list object.';
          continue;
        }
        const valid = rawItems.map((raw): ExtensionEntry | null => {
          if (!raw || typeof raw !== 'object') return null;
          const item = raw as {
            id?: string; pkg?: string; packageName?: string; name?: string; version?: string;
            apk?: string; lang?: string; nsfw?: number | boolean; sources?: Array<{name?:string;lang?:string}>;
            icon?: string; iconUrl?: string; description?: string; type?: string; manifest?: string;
          };
          const id = item.id || item.pkg || item.packageName;
          if (!id || !item.name || !item.version || ids.has(id)) return null;
          ids.add(id);
          const restricted = item.nsfw === true || (typeof item.nsfw === 'number' && item.nsfw > 0);
          if (restricted) return null;
          const apkUrl = item.apk ? (/^https:\/\//i.test(item.apk) ? item.apk : resolveUrl(base, 'apk/' + item.apk.replace(/^\/+/, ''))) : '';
          const iconUrl = item.iconUrl || item.icon || resolveUrl(base, 'icon/' + id + '.png');
          if (item.apk) {
            if (!safeHttps(apkUrl)) return null;
            const sourceList = Array.isArray(item.sources) ? item.sources : [];
            const langs = [...new Set(sourceList.map(source => source?.lang).filter((value): value is string => Boolean(value)))];
            return {
              id, packageName: id, name: item.name.replace(/^Tachiyomi:\\s*/, ''), version: item.version,
              type: 'apk', apk: apkUrl, icon: safeHttps(iconUrl) ? iconUrl : undefined,
              lang: item.lang || (langs.length === 1 ? langs[0] : langs.length ? 'multiple' : 'unknown'),
              sourceCount: sourceList.length, repoFormat: 'json',
              description: item.description || (sourceList.length ? sourceList.length + ' source(s)' : 'Android source extension'),
            };
          }
          if (item.type === 'web' && item.manifest && safeHttps(resolveUrl(target, item.manifest))) {
            return { id, name: item.name, version: item.version, type: 'web', manifest: resolveUrl(target, item.manifest), lang: item.lang || 'unknown', description: item.description, repoFormat: 'json' };
          }
          return null;
        }).filter((item): item is ExtensionEntry => Boolean(item));
        return { id: base, url: base, name: (data && !Array.isArray(data) && typeof data === 'object' ? (data as { name?: string; meta?: { name?: string } }).name || (data as { meta?: { name?: string } }).meta?.name : undefined) || new URL(base).host, extensions: valid, updatedAt: Date.now(), format: legacyItems ? 'Legacy JSON index' : 'Mihon JSON index' };
      } catch (error) {
        lastError = error instanceof Error ? error.message : 'Could not read repository index.';
        if (/Failed to fetch|NetworkError|Load failed/i.test(lastError)) lastError = 'Could not reach the repository from this browser. The host may block CORS requests.';
      }
    }
    throw new Error(lastError);
  };

  const addRepository = async () => {
    if (busy || !repoInput.trim()) return;
    setBusy(true); setNotice('');
    try {
      const repo = await readIndex(repoInput);
      setRepos(old => [...old.filter(item => item.id !== repo.id), repo]);
      setRepoInput('');
      setNotice('Repository added: ' + repo.name + ' (' + repo.extensions.length + ' supported extensions · ' + repo.format + ').');
    } catch (error) { setNotice(error instanceof Error ? error.message : 'Could not add repository.'); }
    finally { setBusy(false); }
  };
  const refreshRepo = async (repo: Repo) => {
    setBusy(true); setNotice('');
    try { const updated = await readIndex(repo.id); setRepos(old => old.map(item => item.id === repo.id ? updated : item)); setNotice('Repository refreshed: ' + updated.extensions.length + ' supported extensions.'); }
    catch (error) { setNotice(error instanceof Error ? error.message : 'Refresh failed.'); }
    finally { setBusy(false); }
  };
  const installWeb = async (item: ExtensionEntry & {_repo:string;_base:string}) => {
    if (!item.manifest || !safeHttps(item.manifest)) return;
    setBusy(true); setNotice('');
    try {
      const response = await fetch(item.manifest, {headers:{Accept:'application/json'}});
      if (!response.ok) throw new Error('Manifest download failed: HTTP '+response.status);
      const manifest = await response.json() as { id?:string; name?:string; version?:string; apiVersion?:number; description?:string; source?:string; baseUrl?:string };
      if (manifest.id !== item.id || manifest.version !== item.version || manifest.apiVersion !== 1) throw new Error('Manifest identity, version or API compatibility check failed.');
      if (!manifest.source || !safeHttps(resolveUrl(item.manifest, manifest.source))) throw new Error('Manifest must declare an HTTPS source descriptor.');
      const sourceResponse = await fetch(resolveUrl(item.manifest,manifest.source), {headers:{Accept:'application/json'}});
      if (!sourceResponse.ok) throw new Error('Source descriptor download failed.');
      const source = await sourceResponse.json() as { id?:string; name?:string; baseUrl?:string; searchPath?:string; searchParam?:string };
      if (source.id !== item.id || !source.baseUrl || !safeHttps(source.baseUrl) || !source.searchPath) throw new Error('Invalid source descriptor. Only declarative HTTPS sources are supported.');
      const record = {id:item.id,name:item.name,version:item.version,manifest:item.manifest,source,installedAt:Date.now()};
      localStorage.setItem('rykoccllection-web-extension:'+item.id,JSON.stringify(record));
      setInstalled(old => [...new Set([...old,item.id])]);
      setNotice(item.name+' installed. Review the source privacy policy before using it.');
    } catch (error) { setNotice(error instanceof Error ? error.message : 'Extension installation failed.'); }
    finally { setBusy(false); }
  };
  const removeExtension = (id:string) => { localStorage.removeItem('rykoccllection-web-extension:'+id); setInstalled(old=>old.filter(value=>value!==id)); setNotice('Extension removed from this device.'); };

  return <main className="content-page extension-page">
    <div className="page-heading"><span className="eyebrow">MANGA READER · SOURCE MANAGER</span><h1>Extensions <em>hub.</em></h1><p>Add JSON web sources and Mihon-compatible Android extension repositories.</p></div>
    <div className="extension-warning"><ShieldAlert size={18}/><p>Only add repositories you trust. Extensions can expose browsing activity to their source providers. Restricted-content extensions are hidden. Android APKs are downloaded only; this web interface does not silently install or execute APK packages.</p></div>
    <section className="extension-repo-card"><div><span className="eyebrow">REPOSITORY MANAGER</span><h2>Add extension repository</h2><p>Supports index.pb (Protocol Buffers), index.min.json and index.json.</p></div><div className="extension-add-row"><input value={repoInput} onChange={event=>setRepoInput(event.target.value)} placeholder="https://github.com/keiyoushi/extensions/raw/repo/index.pb" inputMode="url"/><button className="primary-btn" onClick={()=>void addRepository()} disabled={busy||!repoInput.trim()}><Plus size={16}/>{busy?'Checking…':'Add repository'}</button></div>
    {repos.length>0 && <div className="extension-repo-list">{repos.map(repo=><div className="extension-repo" key={repo.id}><div><strong>{repo.name}</strong><span>{repo.extensions.length} supported extensions · {repo.format || new URL(repo.url).host}</span></div><button title="Refresh repository" onClick={()=>void refreshRepo(repo)} disabled={busy}><RefreshCw size={16}/></button><button title="Remove repository" onClick={()=>setRepos(old=>old.filter(item=>item.id!==repo.id))}><Trash2 size={16}/></button></div>)}</div>}</section>
    {notice && <p className="extension-notice" role="status">{notice}</p>}
    <div className="extension-toolbar"><label className="large-search"><Search size={17}/><input value={filter} onChange={event=>setFilter(event.target.value)} placeholder="Search extensions…"/></label><div className="extension-tabs">{(['all','web','apk','installed'] as const).map(value=><button key={value} className={tab===value?'active':''} onClick={()=>setTab(value)}>{value==='all'?'All':value==='web'?'Web':value==='apk'?'Android APK':'Installed'}</button>)}</div></div>
    <div className="extension-grid">{visible.map(item=><article className="extension-card" key={item.id}><div className="extension-card-icon">{item.icon ? <img src={item.icon} alt="" /> : <Puzzle size={22}/>}</div><div className="extension-card-main"><div className="extension-card-title"><h3>{item.name}</h3><span className="extension-type">{item.type==='apk'?'ANDROID APK':'WEB SOURCE'}</span></div><p>{item.description||'Community source extension.'}</p><div className="extension-meta"><span>{item.lang||'Unknown language'}</span><span>v{item.version}</span>{item.sourceCount ? <span>{item.sourceCount} sources</span> : null}</div><div className="extension-actions">{item.type==='web' ? installed.includes(item.id) ? <button className="secondary-btn" onClick={()=>removeExtension(item.id)}>Uninstall</button> : <button className="primary-btn" disabled={busy} onClick={()=>void installWeb(item)}> <Download size={15}/> Install</button> : <a className="primary-btn" href={item.apk} target="_blank" rel="noopener noreferrer"><Download size={15}/> Download APK</a>}{item.site && <a className="secondary-btn" href={item.site} target="_blank" rel="noopener noreferrer">Website <ExternalLink size={13}/></a>}</div></div></article>)}</div>
    {!visible.length && <div className="extension-empty"><Puzzle size={26}/><h3>{repos.length?'No extensions found':'No repositories added yet'}</h3><p>Add a supported repository to discover compatible sources.</p></div>}
    <div className="extension-help"><h3>Repository compatibility</h3><p>Keiyoushi index.pb is decoded using its Protocol Buffers field layout. Compatible APK entries are listed with their source metadata and official download URL.</p><p>Important: listing and downloading an APK is not the same as loading it. Native Mihon/Yōkai extension execution requires a compatible Android extension runtime, which is not yet part of this Capacitor web app.</p></div>
  </main>;
}
