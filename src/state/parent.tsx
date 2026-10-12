import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from 'react';
import { PinDialog } from '../components/PinDialog';
import { AppError } from '../lib/errors';
import { useToast } from './toast';

/**
 * Parent mode: after the PIN is verified once, it is kept in memory (never in
 * storage) for 5 minutes of activity and passed to the parent RPCs, which
 * re-check it server-side every time.
 */
const IDLE_MS = 5 * 60_000;

interface ParentCtx {
  unlocked: boolean;
  /** Ask for the PIN if needed; resolves to the verified PIN or null if cancelled. */
  requirePin: (reason?: string) => Promise<string | null>;
  /** Run a parent action with the PIN; re-prompts once if the PIN went stale. */
  withPin: <T>(fn: (pin: string) => Promise<T>, reason?: string) => Promise<T | null>;
  lock: () => void;
}

const Ctx = createContext<ParentCtx | null>(null);

export function ParentProvider({ children }: { children: ReactNode }) {
  const toast = useToast();
  const pinRef = useRef<string | null>(null);
  const lastUse = useRef(0);
  const [unlocked, setUnlocked] = useState(false);
  const [prompt, setPrompt] = useState<{ reason?: string; resolve: (pin: string | null) => void } | null>(null);

  const lock = useCallback(() => {
    pinRef.current = null;
    setUnlocked(false);
  }, []);

  useEffect(() => {
    const t = setInterval(() => {
      if (pinRef.current && Date.now() - lastUse.current > IDLE_MS) lock();
    }, 15_000);
    return () => clearInterval(t);
  }, [lock]);

  const requirePin = useCallback((reason?: string) => {
    if (pinRef.current && Date.now() - lastUse.current < IDLE_MS) {
      lastUse.current = Date.now();
      return Promise.resolve(pinRef.current);
    }
    return new Promise<string | null>((resolve) => setPrompt({ reason, resolve }));
  }, []);

  const withPin = useCallback(async <T,>(fn: (pin: string) => Promise<T>, reason?: string): Promise<T | null> => {
    for (let attempt = 0; attempt < 2; attempt++) {
      const pin = await requirePin(reason);
      if (!pin) return null;
      try {
        return await fn(pin);
      } catch (e) {
        if (e instanceof AppError && e.code === 'wrong_pin' && attempt === 0) {
          lock(); // PIN was changed on another device — ask again
          continue;
        }
        toast(e instanceof Error ? e.message : String(e), 'error');
        return null;
      }
    }
    return null;
  }, [requirePin, lock, toast]);

  const onVerified = (pin: string | null) => {
    if (pin) {
      pinRef.current = pin;
      lastUse.current = Date.now();
      setUnlocked(true);
    }
    prompt?.resolve(pin);
    setPrompt(null);
  };

  return (
    <Ctx.Provider value={{ unlocked, requirePin, withPin, lock }}>
      {children}
      {prompt && <PinDialog reason={prompt.reason} onDone={onVerified} />}
    </Ctx.Provider>
  );
}

export function useParent() {
  const ctx = useContext(Ctx);
  if (!ctx) throw new Error('useParent outside ParentProvider');
  return ctx;
}
