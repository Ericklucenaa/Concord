import { useCallback, useEffect, useRef, useState } from 'react';
import { listenToMessages, listenToTyping, setTyping, clearTyping, scopeKey, PAGE_SIZE } from '../services/cloud/messages';
import { quietly } from '../services/log';

/**
 * Live, paginated message history for a scope. `loadMore` grows the window by
 * one page; the listener keeps every loaded message live (edits, reactions).
 */
export function useMessages(scope) {
  const key = scope ? scopeKey(scope) : null;
  const [pages, setPages] = useState(1);
  const [state, setState] = useState({ messages: [], hasMore: false, loading: true, error: null });

  useEffect(() => {
    setPages(1);
    setState({ messages: [], hasMore: false, loading: true, error: null });
  }, [key]);

  useEffect(() => {
    if (!scope || !key) return undefined;
    return listenToMessages(
      scope,
      pages * PAGE_SIZE,
      (messages, { hasMore }) => setState({ messages, hasMore, loading: false, error: null }),
      (error) => setState((prev) => ({ ...prev, loading: false, error }))
    );
    // The scope object is identified by its key.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key, pages]);

  const hasMoreRef = useRef(false);
  hasMoreRef.current = state.hasMore && !state.loading;

  const loadMore = useCallback(() => {
    if (!hasMoreRef.current) return;
    hasMoreRef.current = false;
    setPages((p) => p + 1);
  }, []);

  return { ...state, loadMore, pages };
}

/** "X está digitando…" for a scope, plus a throttled notifier for my own typing. */
export function useTyping(scope, user) {
  const key = scope ? scopeKey(scope) : null;
  const scopeRef = useRef(scope);
  scopeRef.current = scope;
  const [typingNames, setTypingNames] = useState([]);
  const lastSentRef = useRef(0);
  const stopTimerRef = useRef(null);

  useEffect(() => {
    setTypingNames([]);
    if (!key || !user?.id) return undefined;
    return listenToTyping(scopeRef.current, user.id, setTypingNames);
  }, [key, user?.id]);

  const stop = useCallback(() => {
    clearTimeout(stopTimerRef.current);
    if (lastSentRef.current && key && user?.id) {
      lastSentRef.current = 0;
      quietly('clear typing', clearTyping(scopeRef.current, user.id));
    }
  }, [key, user?.id]);

  const notifyTyping = useCallback(() => {
    if (!key || !user?.id) return;
    const now = Date.now();
    if (now - lastSentRef.current > 4000) {
      lastSentRef.current = now;
      quietly('set typing', setTyping(scopeRef.current, user));
    }
    clearTimeout(stopTimerRef.current);
    stopTimerRef.current = setTimeout(stop, 5000);
  }, [key, user, stop]);

  useEffect(() => stop, [stop]);

  return { typingNames, notifyTyping, stopTyping: stop };
}
