import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from 'react';
import { backend } from '../lib/backend';
import { tallinnToday } from '../lib/time';
import type { Snapshot } from '../lib/types';

interface DataCtx {
  snap: Snapshot | null;
  error: string | null;
  today: string; // Tallinn YYYY-MM-DD; updates at midnight
  reload: () => Promise<void>;
}

const Ctx = createContext<DataCtx | null>(null);

export function DataProvider({ children }: { children: ReactNode }) {
  const [snap, setSnap] = useState<Snapshot | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [today, setToday] = useState(tallinnToday());
  const loading = useRef<Promise<void> | null>(null);
  const again = useRef(false);

  // Coalesce bursts of realtime events into at most one in-flight load + one follow-up.
  const reload = useCallback(async () => {
    if (loading.current) {
      again.current = true;
      return loading.current;
    }
    loading.current = (async () => {
      try {
        do {
          again.current = false;
          setSnap(await backend.load());
          setError(null);
        } while (again.current);
      } catch (e) {
        setError(e instanceof Error ? e.message : String(e));
      } finally {
        loading.current = null;
      }
    })();
    return loading.current;
  }, []);

  useEffect(() => {
    void reload();
    let timer: ReturnType<typeof setTimeout> | undefined;
    const unsub = backend.subscribe(() => {
      clearTimeout(timer);
      timer = setTimeout(() => void reload(), 150);
    });
    // Tablets sleep; refresh when the app comes back to the foreground.
    const onVisible = () => {
      if (document.visibilityState === 'visible') {
        setToday(tallinnToday());
        void reload();
      }
    };
    document.addEventListener('visibilitychange', onVisible);
    // Notice the Tallinn date rolling over at midnight.
    const tick = setInterval(() => setToday(tallinnToday()), 30_000);
    return () => {
      unsub();
      clearTimeout(timer);
      clearInterval(tick);
      document.removeEventListener('visibilitychange', onVisible);
    };
  }, [reload]);

  return <Ctx.Provider value={{ snap, error, today, reload }}>{children}</Ctx.Provider>;
}

export function useData() {
  const ctx = useContext(Ctx);
  if (!ctx) throw new Error('useData outside DataProvider');
  return ctx;
}

/** Use only below the "loaded" gate in App. */
export function useSnap(): Snapshot {
  const { snap } = useData();
  if (!snap) throw new Error('Snapshot not loaded');
  return snap;
}
