import { useCallback, useEffect, useState, type CSSProperties } from 'react';
import { AdminScreen } from './components/admin/AdminScreen';
import { Celebration } from './components/Celebration';
import { HistoryScreen } from './components/HistoryScreen';
import { Leaderboard } from './components/Leaderboard';
import { LoginScreen } from './components/LoginScreen';
import { TodayScreen } from './components/TodayScreen';
import { WhoAreYou } from './components/WhoAreYou';
import { backend } from './lib/backend';
import { weekAwaitingActivity } from './lib/logic';
import { DataProvider, useData } from './state/data';
import { ParentProvider, useParent } from './state/parent';
import { ToastProvider } from './state/toast';

type AuthState = 'checking' | 'signed-out' | 'not-family' | 'ok';
type Tab = 'today' | 'board' | 'history' | 'admin';

const KITCHEN_IDLE_MS = 2 * 60_000;

// Per-device preferences. Storage can be unavailable (private mode) — degrade gracefully.
function readPref(key: string): string | null {
  try { return localStorage.getItem(key); } catch { return null; }
}
function writePref(key: string, value: string | null) {
  try {
    if (value === null) localStorage.removeItem(key);
    else localStorage.setItem(key, value);
  } catch { /* ignore */ }
}

export default function App() {
  const [auth, setAuth] = useState<AuthState>('checking');

  useEffect(() => {
    const check = async () => {
      try {
        if (!(await backend.getSessionEmail())) return setAuth('signed-out');
        setAuth((await backend.isFamily()) ? 'ok' : 'not-family');
      } catch {
        setAuth('signed-out');
      }
    };
    void check();
    return backend.onAuthChange(() => void check());
  }, []);

  return (
    <ToastProvider>
      {auth === 'checking' && <Loading />}
      {auth === 'signed-out' && <LoginScreen />}
      {auth === 'not-family' && <LoginScreen notFamily />}
      {auth === 'ok' && (
        <DataProvider>
          <ParentProvider>
            <Shell />
          </ParentProvider>
        </DataProvider>
      )}
    </ToastProvider>
  );
}

function Loading() {
  return (
    <main className="center-screen">
      <div className="loader" aria-label="Laadin…">🏠</div>
    </main>
  );
}

function Shell() {
  const { snap, error, reload } = useData();
  const { lock } = useParent();
  const [memberId, setMemberIdState] = useState<string | null>(() => readPref('kk-member'));
  const [kitchenMode, setKitchenModeState] = useState(() => readPref('kk-kitchen') === '1');
  const [tab, setTab] = useState<Tab>('today');
  const [celebrating, setCelebrating] = useState<string | null>(null);
  const [dismissed, setDismissed] = useState<string | null>(null);

  const setMemberId = useCallback((id: string | null) => {
    setMemberIdState(id);
    writePref('kk-member', id);
  }, []);
  const setKitchenMode = (on: boolean) => {
    setKitchenModeState(on);
    writePref('kk-kitchen', on ? '1' : null);
  };

  // Kitchen tablet: after 2 idle minutes go back to "Kes sa oled?" and lock parent mode.
  useEffect(() => {
    if (!kitchenMode) return;
    let timer = setTimeout(reset, KITCHEN_IDLE_MS);
    function reset() {
      setMemberId(null);
      setTab('today');
      lock();
    }
    const poke = () => {
      clearTimeout(timer);
      timer = setTimeout(reset, KITCHEN_IDLE_MS);
    };
    const events = ['pointerdown', 'keydown', 'scroll'] as const;
    events.forEach((e) => window.addEventListener(e, poke, { passive: true }));
    return () => {
      clearTimeout(timer);
      events.forEach((e) => window.removeEventListener(e, poke));
    };
  }, [kitchenMode, setMemberId, lock]);

  // Pop the celebration on every device as soon as a week is closed.
  const awaiting = snap ? weekAwaitingActivity(snap) : null;
  const awaitingId = awaiting?.id ?? null;
  useEffect(() => {
    if (awaitingId && awaitingId !== dismissed) setCelebrating(awaitingId);
  }, [awaitingId, dismissed]);

  if (!snap) {
    return error ? (
      <main className="center-screen">
        <div className="card empty">
          <div className="empty-emoji" aria-hidden>🙈</div>
          <p>Andmeid ei õnnestunud laadida.</p>
          <p className="muted small">{error}</p>
          <button type="button" className="btn btn-primary" onClick={() => void reload()}>Proovi uuesti</button>
        </div>
      </main>
    ) : <Loading />;
  }

  const member = snap.members.find((m) => m.id === memberId && m.active) ?? null;
  const celebrationWeek = celebrating ? snap.pastWeeks.find((w) => w.id === celebrating) : undefined;

  const closeCelebration = () => {
    setDismissed(celebrating);
    setCelebrating(null);
  };

  return (
    <>
      {!member ? (
        <WhoAreYou onPick={(id) => { setMemberId(id); setTab('today'); }} kitchenMode={kitchenMode} onKitchenMode={setKitchenMode} />
      ) : (
        <div className="app" style={{ '--c': member.color } as CSSProperties}>
          <header className="topbar">
            <span className="brand">
              <span aria-hidden>🏠</span> <span className="brand-name">{snap.settings.family_name}</span>
              {backend.isDemo && <span className="demo-badge">DEMO</span>}
            </span>
            <button type="button" className="me" onClick={() => setMemberId(null)} aria-label={`${member.name} — vaheta kasutajat`}>
              <span className="me-avatar" aria-hidden>{member.avatar}</span>
              <span className="me-name">{member.name}</span>
              <span className="me-switch" aria-hidden>⇄</span>
            </button>
          </header>

          {error && <div className="offline">Ühendus katkes — proovin uuesti…</div>}

          <main className="content">
            {tab === 'today' && <TodayScreen member={member} />}
            {tab === 'board' && <Leaderboard onOpenCelebration={() => awaiting && setCelebrating(awaiting.id)} />}
            {tab === 'history' && <HistoryScreen />}
            {tab === 'admin' && <AdminScreen />}
          </main>

          <nav className="tabbar" aria-label="Põhimenüü">
            {([
              ['today', '✅', 'Täna'],
              ['board', '🏆', 'Edetabel'],
              ['history', '📜', 'Ajalugu'],
              ['admin', '🔒', 'Vanemad'],
            ] as const).map(([id, icon, label]) => (
              <button
                key={id}
                type="button"
                className={tab === id ? 'active' : ''}
                aria-current={tab === id ? 'page' : undefined}
                onClick={() => setTab(id)}
              >
                <span className="tab-icon" aria-hidden>{icon}</span>
                <span>{label}</span>
              </button>
            ))}
          </nav>
        </div>
      )}

      {celebrationWeek && <Celebration week={celebrationWeek} onClose={closeCelebration} />}
    </>
  );
}
