import React, { useEffect, useState } from 'react';
import { useSiSecure, type MessageSearchResult } from '../SiSecureContext';
import { Search, MessageSquare } from 'lucide-react';
import { formatTime } from '../lib/utils';

// A snippet of `content` centered on the first match of `query`, so a hit in
// the middle of a long message doesn't just show its (irrelevant) start.
function buildSnippet(content: string, query: string, radius = 40): { before: string; match: string; after: string } {
  const idx = content.toLowerCase().indexOf(query.toLowerCase());
  if (idx === -1) return { before: content.slice(0, radius * 2), match: '', after: '' };
  const start = Math.max(0, idx - radius);
  const end = Math.min(content.length, idx + query.length + radius);
  return {
    before: (start > 0 ? '…' : '') + content.slice(start, idx),
    match: content.slice(idx, idx + query.length),
    after: content.slice(idx + query.length, end) + (end < content.length ? '…' : '')
  };
}

export function MessageSearchResults({ query, onSelect }: { query: string; onSelect: (chatId: string) => void }) {
  const { contacts, groups, searchMessages } = useSiSecure();
  const [messageResults, setMessageResults] = useState<MessageSearchResult[]>([]);
  const [loading, setLoading] = useState(false);

  // Debounced — decrypting the whole message table on every keystroke would
  // be wasteful, and pointless mid-typing anyway.
  useEffect(() => {
    const q = query.trim();
    if (!q) {
      setMessageResults([]);
      return;
    }
    setLoading(true);
    const handle = setTimeout(async () => {
      const results = await searchMessages(q);
      setMessageResults(results);
      setLoading(false);
    }, 250);
    return () => clearTimeout(handle);
  }, [query, searchMessages]);

  const q = query.trim().toLowerCase();
  const matchedContacts = q
    ? contacts.filter(c => c.status !== 'pending' && c.displayName.toLowerCase().includes(q))
    : [];
  const matchedGroups = q ? groups.filter(g => g.name.toLowerCase().includes(q)) : [];

  if (!q) return null;

  const nothingFound = !loading && matchedContacts.length === 0 && matchedGroups.length === 0 && messageResults.length === 0;

  return (
    <div className="px-3 space-y-5">
      {(matchedContacts.length > 0 || matchedGroups.length > 0) && (
        <div>
          <div className="mb-2 text-[10px] uppercase tracking-widest text-zinc-600 px-3 font-bold">Contacts &amp; Groups</div>
          {matchedContacts.map(c => (
            <button
              key={c.id}
              onClick={() => onSelect(c.publicKey)}
              className="w-full flex items-center p-3 rounded-xl transition-all mb-1 hover:bg-zinc-900/40 border border-transparent text-left"
            >
              <div className="w-10 h-10 rounded-full bg-zinc-800 flex items-center justify-center border border-white/5 shrink-0">
                <span className="text-sm font-medium text-zinc-400">{c.displayName.charAt(0).toUpperCase()}</span>
              </div>
              <span className="ml-3 text-sm font-semibold text-zinc-200 truncate">{c.displayName}</span>
            </button>
          ))}
          {matchedGroups.map(g => (
            <button
              key={g.id}
              onClick={() => onSelect(g.id)}
              className="w-full flex items-center p-3 rounded-xl transition-all mb-1 hover:bg-zinc-900/40 border border-transparent text-left"
            >
              <div className="w-10 h-10 rounded-xl bg-purple-500/10 flex items-center justify-center border border-purple-500/20 shrink-0">
                <span className="text-sm font-medium text-purple-400">{g.name.charAt(0).toUpperCase()}</span>
              </div>
              <span className="ml-3 text-sm font-semibold text-zinc-200 truncate">{g.name}</span>
            </button>
          ))}
        </div>
      )}

      {messageResults.length > 0 && (
        <div>
          <div className="mb-2 text-[10px] uppercase tracking-widest text-zinc-600 px-3 font-bold">Messages</div>
          {messageResults.map(r => {
            const snippet = buildSnippet(r.message.content, q);
            return (
              <button
                key={r.message.id}
                onClick={() => onSelect(r.chatId)}
                className="w-full flex items-start p-3 rounded-xl transition-all mb-1 hover:bg-zinc-900/40 border border-transparent text-left"
              >
                <div
                  className={
                    'w-10 h-10 rounded-xl flex items-center justify-center border shrink-0 ' +
                    (r.isGroup ? 'bg-purple-500/10 border-purple-500/20' : 'bg-zinc-800 border-white/5 rounded-full')
                  }
                >
                  <span className={'text-sm font-medium ' + (r.isGroup ? 'text-purple-400' : 'text-zinc-400')}>
                    {r.chatName.charAt(0).toUpperCase()}
                  </span>
                </div>
                <div className="ml-3 flex-1 min-w-0">
                  <div className="flex justify-between items-baseline mb-0.5">
                    <span className="text-sm font-semibold text-zinc-200 truncate">{r.chatName}</span>
                    <span className="text-[10px] text-zinc-600 font-mono shrink-0 ml-2">{formatTime(r.message.timestamp)}</span>
                  </div>
                  <p className="text-xs text-zinc-500 truncate">
                    {snippet.before}
                    <span className="text-blue-400 font-semibold">{snippet.match}</span>
                    {snippet.after}
                  </p>
                </div>
              </button>
            );
          })}
        </div>
      )}

      {nothingFound && (
        <div className="flex flex-col items-center justify-center p-8 mt-6">
          <div className="w-12 h-12 rounded-xl bg-white/[0.03] border border-dashed border-white/10 flex items-center justify-center mb-4">
            <Search className="w-6 h-6 text-zinc-700" />
          </div>
          <p className="text-[10px] text-zinc-600 font-bold uppercase tracking-widest">No results</p>
        </div>
      )}

      {loading && messageResults.length === 0 && matchedContacts.length === 0 && matchedGroups.length === 0 && (
        <div className="flex flex-col items-center justify-center p-8 mt-6 text-zinc-700">
          <MessageSquare className="w-5 h-5 animate-pulse" />
        </div>
      )}
    </div>
  );
}
