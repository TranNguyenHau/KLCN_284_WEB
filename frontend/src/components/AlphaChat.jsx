import { useEffect, useRef, useState } from 'react';
import { useMatch } from 'react-router-dom';
import { Bot, Check, Copy, SendHorizontal, Sparkles, Trash2, TriangleAlert, X } from 'lucide-react';
import { api } from '../services/api.js';
import { useI18n } from '../i18n/index.jsx';
import { useLocalStorage } from '../hooks/useLocalStorage.js';

const SUGGESTION_KEYS = ['chat.suggestion1', 'chat.suggestion2', 'chat.suggestion3', 'chat.suggestion4'];

function RichText({ text }) {
  return (
    <div className="space-y-1 whitespace-pre-wrap break-words text-sm leading-relaxed">
      {String(text)
        .split(/(\*\*[^*]+\*\*)/g)
        .map((part, i) => (part.startsWith('**') ? <strong key={i} className="block pt-1 font-semibold">{part.slice(2, -2)}</strong> : <span key={i}>{part}</span>))}
    </div>
  );
}

/**
 * Zalo and most chat apps show markdown marks literally, so a copied answer is stripped
 * down to plain text: no **, no ##, no bullet asterisks. The on-screen render keeps its
 * bold headings; only the clipboard copy is flattened.
 */
function toPlainText(text) {
  return String(text)
    .replace(/\*\*(.+?)\*\*/g, '$1')
    .replace(/^#{1,6}\s*/gm, '')
    .replace(/^\s*[-*+]\s+/gm, '- ')
    .replace(/[*_`]/g, '')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

/** navigator.clipboard needs a secure context, so keep a hidden-textarea fallback. */
async function writeToClipboard(text) {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    /* fall through to the legacy path */
  }
  try {
    const area = document.createElement('textarea');
    area.value = text;
    area.setAttribute('readonly', '');
    area.style.position = 'fixed';
    area.style.top = '-1000px';
    document.body.appendChild(area);
    area.select();
    const copied = document.execCommand('copy');
    document.body.removeChild(area);
    return copied;
  } catch {
    return false;
  }
}

export default function AlphaChat() {
  const { t, lang } = useI18n();
  const [open, setOpen] = useState(false);
  const [messages, setMessages] = useLocalStorage('alpha-chat', []);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [copiedAt, setCopiedAt] = useState(null);
  const endRef = useRef(null);
  const inputRef = useRef(null);
  const stockMatch = useMatch('/stock/:symbol');
  const analysisMatch = useMatch('/analysis/:symbol');
  const symbol = (stockMatch || analysisMatch)?.params.symbol?.toUpperCase();

  // The KLCN-284 opening line is seeded as the first assistant turn instead of being
  // painted into the empty state, so it is part of the history sent to the model and the
  // model does not repeat it later. Clearing the conversation brings it back.
  useEffect(() => {
    const greeting = t('chat.greeting');
    if (messages.length === 0) {
      setMessages([{ role: 'assistant', content: greeting, seeded: true, at: Date.now() }]);
    } else if (messages.length === 1 && messages[0].seeded && messages[0].content !== greeting) {
      setMessages([{ ...messages[0], content: greeting }]);
    }
  }, [t, messages, setMessages]);

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, loading, open]);

  useEffect(() => {
    if (open) inputRef.current?.focus();
  }, [open]);

  const send = async (text, base = messages) => {
    const content = String(text || '').trim();
    if (!content || loading) return;
    const next = [...base, { role: 'user', content, at: Date.now() }];
    setMessages(next);
    setInput('');
    setError(null);
    setLoading(true);
    try {
      // `lang` is the selected interface language: the answer must come back in it, even
      // when the question was typed in the other one.
      const res = await api.chat({ message: content, lang, history: base.slice(-8).map(({ role, content: c }) => ({ role, content: c })), context: { symbol } });
      setMessages([...next, { role: 'assistant', content: res.reply, toolCalls: res.toolCalls, provider: res.provider, at: Date.now() }]);
    } catch (err) {
      setError({ message: err.message, retryWith: { text: content, base } });
    } finally {
      setLoading(false);
    }
  };

  const copyReply = async (content, index) => {
    const copied = await writeToClipboard(toPlainText(content));
    if (!copied) {
      setError({ title: t('chat.copyTitle'), message: t('chat.copyFailed') });
      return;
    }
    setCopiedAt(index);
    window.setTimeout(() => setCopiedAt((current) => (current === index ? null : current)), 1800);
  };

  // Other parts of the app (the command palette, the stock page) open the chat through this event.
  const sendRef = useRef(send);
  sendRef.current = send;
  useEffect(() => {
    const handler = (event) => {
      setOpen(true);
      if (event.detail?.prompt) sendRef.current(event.detail.prompt);
    };
    window.addEventListener('alpha:ask', handler);
    return () => window.removeEventListener('alpha:ask', handler);
  }, []);

  return (
    <>
      {!open && (
        <button
          className="glass fixed bottom-5 right-5 z-40 flex items-center gap-2 rounded-full bg-accent/90 px-4 py-3 text-sm font-semibold text-white shadow-2xl transition-transform duration-200 hover:scale-[1.03] dark:text-bg"
          onClick={() => setOpen(true)}
          aria-label={t('chat.openChat')}
        >
          <Sparkles size={18} />
          {t('chat.title')}
        </button>
      )}
      {open && (
        <div
          className="glass fixed inset-x-0 bottom-0 z-40 flex h-[85vh] flex-col overflow-hidden border-line/70 shadow-2xl sm:inset-x-auto sm:bottom-5 sm:right-5 sm:h-[600px] sm:w-[400px] sm:rounded-2xl"
          role="dialog"
          aria-label={t('chat.dialogLabel')}
        >
          <div className="flex items-center justify-between border-b border-line/60 px-4 py-3">
            <div className="flex items-center gap-2">
              <span className="grid h-8 w-8 place-items-center rounded-lg bg-accent/20">
                <Bot size={17} className="text-accent" />
              </span>
              <div>
                <div className="text-sm font-semibold">{t('chat.title')}</div>
                <div className="flex items-center gap-1.5 text-xs text-muted">
                  {loading && <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-up" aria-hidden="true" />}
                  {symbol ? t('chat.viewing', { symbol }) : t('chat.marketAssistant')}
                </div>
              </div>
            </div>
            <div className="flex items-center gap-1">
              <button className="btn btn-ghost btn-icon px-1.5 py-1.5" onClick={() => { setMessages([]); setError(null); }} disabled={!messages.length} aria-label={t('chat.clear')} title={t('chat.clear')}>
                <Trash2 size={14} />
              </button>
              <button className="btn btn-ghost btn-icon px-1.5 py-1.5" onClick={() => setOpen(false)} aria-label={t('chat.closeChat')}>
                <X size={14} />
              </button>
            </div>
          </div>

          <div className="flex-1 space-y-3 overflow-y-auto px-4 py-3">
            {!messages.some((message) => message.role === 'user') && (
              <div className="space-y-2">
                <p className="text-sm text-muted">{t('chat.intro')}</p>
                {SUGGESTION_KEYS.map((key) => {
                  const suggestion = t(key);
                  return (
                    <button key={key} className="block w-full rounded-lg border border-line/70 px-3 py-2 text-left text-sm transition-colors hover:border-accent/40 hover:bg-raised" onClick={() => send(suggestion)}>
                      {suggestion}
                    </button>
                  );
                })}
              </div>
            )}
            {messages.map((message, i) => (
              <div key={i} className={message.role === 'user' ? 'flex justify-end' : 'flex justify-start'}>
                <div className={`max-w-[92%] rounded-xl px-3 py-2 ${message.role === 'user' ? 'bg-accent text-white dark:text-bg' : 'border border-line/70 bg-raised/80'}`}>
                  {message.role === 'user' ? <p className="whitespace-pre-wrap text-sm">{message.content}</p> : <RichText text={message.content} />}
                  {message.role === 'assistant' && !message.seeded && (
                    <div className="mt-2 flex flex-wrap items-center gap-1 border-t border-line/60 pt-2">
                      {message.toolCalls?.map((tool, j) => (
                        <span key={j} title={tool.error} className={`rounded px-1.5 py-0.5 text-[11px] ${tool.ok ? 'bg-up/15 text-up' : 'bg-down/15 text-down'}`}>
                          {tool.tool.replace('get_', '')}
                        </span>
                      ))}
                      {message.provider && <span className="rounded bg-surface px-1.5 py-0.5 text-[11px] text-muted">{message.provider}</span>}
                      <button
                        type="button"
                        className="ml-auto flex items-center gap-1 rounded px-1.5 py-0.5 text-[11px] text-muted transition-colors hover:text-accent"
                        title={t('chat.copyHint')}
                        aria-label={t('chat.copyHint')}
                        onClick={() => copyReply(message.content, i)}
                      >
                        {copiedAt === i ? <Check size={12} /> : <Copy size={12} />}
                        {copiedAt === i ? t('chat.copied') : t('chat.copy')}
                      </button>
                    </div>
                  )}
                </div>
              </div>
            ))}
            {loading && (
              <div className="flex justify-start" aria-live="polite">
                <div className="flex items-center gap-1 rounded-xl border border-line/70 bg-raised/80 px-3 py-3" aria-label={t('chat.typing')}>
                  {[0, 150, 300].map((delay) => (
                    <span key={delay} className="h-1.5 w-1.5 animate-bounce rounded-full bg-muted" style={{ animationDelay: `${delay}ms` }} />
                  ))}
                </div>
              </div>
            )}
            {error && (
              <div className="rounded-lg border border-down/40 bg-down/10 p-3 text-sm" role="alert">
                <div className="flex items-center gap-2 font-medium text-down">
                  <TriangleAlert size={14} />
                  {error.title || t('chat.errorTitle')}
                </div>
                <p className="mt-1">{error.message}</p>
                {error.retryWith && (
                  <button className="btn mt-2" onClick={() => { const retry = error.retryWith; setError(null); send(retry.text, retry.base); }}>
                    {t('chat.retry')}
                  </button>
                )}
              </div>
            )}
            <div ref={endRef} />
          </div>

          <form className="flex gap-2 border-t border-line/60 p-3" onSubmit={(event) => { event.preventDefault(); send(input); }}>
            <input
              ref={inputRef}
              className="input"
              value={input}
              onChange={(event) => setInput(event.target.value)}
              placeholder={t('chat.placeholder')}
              maxLength={2000}
              aria-label={t('chat.messageLabel')}
            />
            <button className="btn btn-primary px-3" type="submit" disabled={loading || !input.trim()} aria-label={t('chat.send')}>
              <SendHorizontal size={16} />
            </button>
          </form>
        </div>
      )}
    </>
  );
}
