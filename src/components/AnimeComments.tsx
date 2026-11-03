import { useCallback, useEffect, useMemo, useState, type FormEvent } from 'react';
import type { User } from '@supabase/supabase-js';
import { ArrowBigDown, ArrowBigUp, ChevronDown, ChevronUp, MessageSquare, Pencil, Send, Trash2 } from 'lucide-react';
import { supabase } from '../lib/supabase';

type Profile = { username: string; display_name: string; avatar_url: string };
type Vote = { user_id: string; vote: number };
type CommentRow = {
  id: string;
  anilist_id: number;
  user_id: string;
  parent_comment_id: string | null;
  body: string;
  spoiler: boolean;
  created_at: string;
  updated_at: string;
  author: Profile | null;
  votes: Vote[];
};
type SortMode = 'best' | 'newest' | 'top';

const scoreOf = (comment: CommentRow) => (comment.votes || []).reduce((sum, vote) => sum + vote.vote, 0);
const sortRows = (rows: CommentRow[], mode: SortMode) => [...rows].sort((a, b) => {
  if (mode === 'newest') return new Date(b.created_at).getTime() - new Date(a.created_at).getTime();
  if (mode === 'top') return scoreOf(b) - scoreOf(a) || new Date(b.created_at).getTime() - new Date(a.created_at).getTime();
  const best = (comment: CommentRow) => {
    const ageHours = Math.max(0, (Date.now() - new Date(comment.created_at).getTime()) / 3600000);
    return scoreOf(comment) / Math.pow(ageHours + 2, 0.55);
  };
  return best(b) - best(a);
});

function AuthPanel() {
  const [mode, setMode] = useState<'signin' | 'signup'>('signin');
  const [displayName, setDisplayName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    setBusy(true); setError(''); setMessage('');
    try {
      if (mode === 'signup') {
        const { data, error: authError } = await supabase.auth.signUp({
          email: email.trim(),
          password,
          options: { data: { display_name: displayName.trim() || 'Reader' } }
        });
        if (authError) throw authError;
        if (!data.session) setMessage('Account created. Check your email for the confirmation link, then sign in.');
        else setMessage('Account created. You can now join the discussion.');
      } else {
        const { error: authError } = await supabase.auth.signInWithPassword({ email: email.trim(), password });
        if (authError) throw authError;
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Authentication failed. Please try again.');
    } finally {
      setBusy(false);
    }
  };

  return <div className="anime-auth-card">
    <div className="anime-auth-copy"><strong>{mode === 'signin' ? 'Join the discussion' : 'Create your community account'}</strong><p>Sign in to post, reply and vote on anime discussions.</p></div>
    <form className="anime-auth-form" onSubmit={submit}>
      {mode === 'signup' && <input value={displayName} onChange={e => setDisplayName(e.target.value)} placeholder="Display name (optional)" maxLength={40}/>}
      <input type="email" autoComplete="email" required value={email} onChange={e => setEmail(e.target.value)} placeholder="Email address"/>
      <input type="password" autoComplete={mode === 'signup' ? 'new-password' : 'current-password'} required minLength={8} value={password} onChange={e => setPassword(e.target.value)} placeholder="Password (at least 8 characters)"/>
      <button className="primary-btn" type="submit" disabled={busy}>{busy ? 'Please wait…' : mode === 'signin' ? 'Sign in' : 'Create account'}</button>
    </form>
    {error && <p className="anime-comment-error">{error}</p>}
    {message && <p className="anime-comment-success">{message}</p>}
    <button className="anime-auth-switch" onClick={() => { setMode(mode === 'signin' ? 'signup' : 'signin'); setError(''); setMessage(''); }}>
      {mode === 'signin' ? 'New here? Create an account' : 'Already have an account? Sign in'}
    </button>
  </div>;
}

type ThreadProps = {
  comment: CommentRow;
  allComments: CommentRow[];
  user: User | null;
  sort: SortMode;
  onVote: (comment: CommentRow, vote: number) => void;
  onReply: (parentId: string, body: string, spoiler: boolean) => Promise<void>;
  onEdit: (commentId: string, body: string) => Promise<void>;
  onDelete: (commentId: string) => Promise<void>;
};

function CommentThread({ comment, allComments, user, sort, onVote, onReply, onEdit, onDelete }: ThreadProps) {
  const [spoilerOpen, setSpoilerOpen] = useState(!comment.spoiler);
  const [replyOpen, setReplyOpen] = useState(false);
  const [replyText, setReplyText] = useState('');
  const [replySpoiler, setReplySpoiler] = useState(false);
  const [editing, setEditing] = useState(false);
  const [editText, setEditText] = useState(comment.body);
  const [busy, setBusy] = useState(false);
  const score = scoreOf(comment);
  const myVote = comment.votes?.find(vote => vote.user_id === user?.id)?.vote || 0;
  const children = sortRows(allComments.filter(row => row.parent_comment_id === comment.id), sort);
  const authorName = comment.author?.display_name || 'Reader';
  const date = new Date(comment.created_at).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });

  const submitReply = async (event: FormEvent) => {
    event.preventDefault();
    if (!replyText.trim()) return;
    setBusy(true);
    await onReply(comment.id, replyText.trim(), replySpoiler);
    setReplyText(''); setReplySpoiler(false); setReplyOpen(false); setBusy(false);
  };
  const saveEdit = async (event: FormEvent) => {
    event.preventDefault();
    if (!editText.trim()) return;
    setBusy(true); await onEdit(comment.id, editText.trim()); setEditing(false); setBusy(false);
  };

  return <article className="anime-comment">
    <div className="anime-comment-votes">
      <button className={myVote === 1 ? 'vote-btn active' : 'vote-btn'} onClick={() => onVote(comment, 1)} disabled={!user} aria-label="Upvote"><ArrowBigUp size={21}/></button>
      <strong>{score}</strong>
      <button className={myVote === -1 ? 'vote-btn active down' : 'vote-btn'} onClick={() => onVote(comment, -1)} disabled={!user} aria-label="Downvote"><ArrowBigDown size={21}/></button>
    </div>
    <div className="anime-comment-main">
      <div className="anime-comment-meta"><span className="comment-avatar">{authorName.slice(0, 1).toUpperCase()}</span><strong>{authorName}</strong><span>@{comment.author?.username || 'reader'}</span><i>·</i><time>{date}</time>{comment.updated_at !== comment.created_at && <span className="comment-edited">edited</span>}{comment.spoiler && <span className="spoiler-tag">SPOILER</span>}</div>
      {editing ? <form className="anime-comment-edit" onSubmit={saveEdit}><textarea value={editText} onChange={e => setEditText(e.target.value)} maxLength={3000} required/><div><button className="secondary-btn" type="button" onClick={() => { setEditing(false); setEditText(comment.body); }}>Cancel</button><button className="primary-btn" disabled={busy}>Save edit</button></div></form> :
        comment.spoiler && !spoilerOpen ? <button className="spoiler-reveal" onClick={() => setSpoilerOpen(true)}><span>⚠ Spoiler hidden</span><strong>Reveal spoiler</strong></button> :
        <p className={comment.spoiler ? 'anime-comment-body spoiler-body' : 'anime-comment-body'}>{comment.body}</p>}
      <div className="anime-comment-actions">
        <button onClick={() => setReplyOpen(!replyOpen)} disabled={!user}><MessageSquare size={14}/> Reply</button>
        {user?.id === comment.user_id && !editing && <button onClick={() => { setEditText(comment.body); setEditing(true); }}><Pencil size={13}/> Edit</button>}
        {user?.id === comment.user_id && <button onClick={() => onDelete(comment.id)}><Trash2 size={13}/> Delete</button>}
        {comment.spoiler && spoilerOpen && <button onClick={() => setSpoilerOpen(false)}>Hide spoiler</button>}
      </div>
      {replyOpen && <form className="anime-reply-form" onSubmit={submitReply}><textarea value={replyText} onChange={e => setReplyText(e.target.value)} placeholder="Write a thoughtful reply…" maxLength={3000} required/><label><input type="checkbox" checked={replySpoiler} onChange={e => setReplySpoiler(e.target.checked)}/> Mark as spoiler</label><button className="primary-btn" disabled={busy || !replyText.trim()}><Send size={14}/> Reply</button></form>}
      {children.length > 0 && <div className="anime-comment-children">{children.map(child => <CommentThread key={child.id} comment={child} allComments={allComments} user={user} sort={sort} onVote={onVote} onReply={onReply} onEdit={onEdit} onDelete={onDelete}/>)}</div>}
    </div>
  </article>;
}

export function AnimeComments({ animeId, animeTitle, user }: { animeId: number; animeTitle: string; user: User | null }) {
  const [comments, setComments] = useState<CommentRow[]>([]);
  const [sort, setSort] = useState<SortMode>('best');
  const [draft, setDraft] = useState('');
  const [spoiler, setSpoiler] = useState(false);
  const [loading, setLoading] = useState(true);
  const [posting, setPosting] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');

  const loadComments = useCallback(async () => {
    setLoading(true); setError('');
    const { data, error: queryError } = await supabase
      .from('anime_entry_comments')
      .select('id, anilist_id, user_id, parent_comment_id, body, spoiler, created_at, updated_at, author:anime_entry_profiles!anime_entry_comments_user_id_fkey(username, display_name, avatar_url), votes:anime_entry_comment_votes!anime_entry_comment_votes_comment_id_fkey(user_id, vote)')
      .eq('anilist_id', animeId);
    if (queryError) setError(queryError.message);
    else setComments((data || []) as unknown as CommentRow[]);
    setLoading(false);
  }, [animeId]);

  useEffect(() => { void loadComments(); }, [loadComments]);

  const sortedRoots = useMemo(() => sortRows(comments.filter(comment => !comment.parent_comment_id), sort), [comments, sort]);

  const postComment = async (body: string, parentId: string | null, hasSpoiler: boolean) => {
    if (!user) { setError('Sign in to join the discussion.'); return; }
    const { error: insertError } = await supabase.from('anime_entry_comments').insert({
      anilist_id: animeId,
      user_id: user.id,
      parent_comment_id: parentId,
      body,
      spoiler: hasSpoiler
    });
    if (insertError) { setError(insertError.message); return; }
    setError(''); setNotice('Your comment was posted.'); await loadComments();
  };

  const submitComment = async (event: FormEvent) => {
    event.preventDefault();
    if (!draft.trim()) return;
    setPosting(true); setNotice('');
    await postComment(draft.trim(), null, spoiler);
    setDraft(''); setSpoiler(false); setPosting(false);
  };

  const voteComment = async (comment: CommentRow, value: number) => {
    if (!user) return;
    const current = comment.votes?.find(vote => vote.user_id === user.id)?.vote;
    const result = current === value
      ? await supabase.from('anime_entry_comment_votes').delete().eq('comment_id', comment.id).eq('user_id', user.id)
      : await supabase.from('anime_entry_comment_votes').upsert({ comment_id: comment.id, user_id: user.id, vote: value }, { onConflict: 'comment_id,user_id' });
    if (result.error) setError(result.error.message);
    else await loadComments();
  };

  const editComment = async (commentId: string, body: string) => {
    const { error: updateError } = await supabase.from('anime_entry_comments').update({ body }).eq('id', commentId);
    if (updateError) setError(updateError.message); else await loadComments();
  };

  const deleteComment = async (commentId: string) => {
    if (!window.confirm('Delete this comment and its replies?')) return;
    const { error: deleteError } = await supabase.from('anime_entry_comments').delete().eq('id', commentId);
    if (deleteError) setError(deleteError.message); else await loadComments();
  };

  const replyComment = async (parentId: string, body: string, hasSpoiler: boolean) => {
    await postComment(body, parentId, hasSpoiler);
  };

  return <section className="anime-discussion" id="discussion">
    <div className="anime-discussion-heading"><div><span className="eyebrow">COMMUNITY DISCUSSION</span><h2>What do you think?</h2><p>Share your thoughts about <strong>{animeTitle}</strong>.</p></div><span className="discussion-count">{comments.length} {comments.length === 1 ? 'comment' : 'comments'}</span></div>
    {user ? <form className="anime-comment-composer" onSubmit={submitComment}>
      <div className="composer-avatar">{String(user.user_metadata?.display_name || 'R').slice(0, 1).toUpperCase()}</div>
      <div className="composer-main"><textarea value={draft} onChange={e => setDraft(e.target.value)} placeholder="Start a discussion… Be respectful and avoid sharing personal information." maxLength={3000} required/><div className="composer-controls"><label className="spoiler-check"><input type="checkbox" checked={spoiler} onChange={e => setSpoiler(e.target.checked)}/> Mark as spoiler</label><span>{draft.length}/3000</span><button className="primary-btn" disabled={posting || !draft.trim()}><Send size={14}/> {posting ? 'Posting…' : 'Comment'}</button></div></div>
    </form> : <AuthPanel/>}
    {notice && <p className="anime-comment-success">{notice}</p>}
    {error && <p className="anime-comment-error">{error}</p>}
    <div className="anime-discussion-toolbar"><span>DISCUSSION</span><label>Sort by <select value={sort} onChange={e => setSort(e.target.value as SortMode)}><option value="best">Best</option><option value="newest">Newest</option><option value="top">Top</option></select></label></div>
    {loading ? <div className="anime-comments-loading">Loading discussion…</div> : sortedRoots.length ? <div className="anime-comment-list">{sortedRoots.map(comment => <CommentThread key={comment.id} comment={comment} allComments={comments} user={user} sort={sort} onVote={voteComment} onReply={replyComment} onEdit={editComment} onDelete={deleteComment}/>)}</div> : <div className="anime-comments-empty"><MessageSquare size={25}/><strong>No comments yet</strong><p>Start the conversation for this anime.</p></div>}
  </section>;
}
