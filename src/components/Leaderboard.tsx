import { useEffect, useRef, useState, type CSSProperties } from 'react';
import { backend } from '../lib/backend';
import { joinNames, weekAwaitingActivity, weekRanking, type Ranked } from '../lib/logic';
import { formatWeekdayTime, isoDow, pts, tallinnHour } from '../lib/time';
import { useData, useSnap } from '../state/data';
import { useParent } from '../state/parent';
import { useToast } from '../state/toast';

/** Animates a number from 0 to `value` on mount / change. */
function CountUp({ value }: { value: number }) {
  const [shown, setShown] = useState(0);
  const current = useRef(0);
  useEffect(() => {
    const set = (n: number) => { current.current = n; setShown(n); };
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
      set(value);
      return;
    }
    const start = performance.now();
    const from = current.current;
    let raf = 0;
    const step = (t: number) => {
      const k = Math.min(1, (t - start) / 700);
      set(Math.round(from + (value - from) * (1 - (1 - k) ** 3)));
      if (k < 1) raf = requestAnimationFrame(step);
    };
    raf = requestAnimationFrame(step);
    return () => cancelAnimationFrame(raf);
  }, [value]);
  return <>{shown}</>;
}

const MEDALS = ['🥇', '🥈', '🥉'];

export function Leaderboard({ onOpenCelebration }: { onOpenCelebration: () => void }) {
  const snap = useSnap();
  const { today, reload } = useData();
  const { withPin } = useParent();
  const toast = useToast();
  const [confirming, setConfirming] = useState(false);

  const ranking = weekRanking(snap);
  const total = (r: Ranked) => r.points + r.pending;
  const max = Math.max(1, ...ranking.map(total));
  const nobodyYet = ranking.every((r) => total(r) === 0);
  const podium = ranking.slice(0, 3);
  // Classic podium order: 2nd, 1st, 3rd.
  const podiumOrder = [podium[1], podium[0], podium[2]].filter(Boolean) as Ranked[];
  const awaiting = weekAwaitingActivity(snap);
  const isFridayEvening = isoDow(today) === 5 && tallinnHour() >= 16;
  const leaders = ranking.filter((r) => r.rank === 1 && total(r) > 0);

  const closeWeek = async () => {
    setConfirming(false);
    const r = await withPin((pin) => backend.closeWeek(pin, snap.openWeek.id), 'Nädala lõpetamiseks sisesta PIN.');
    if (r) {
      await reload();
      if (!r.winnerIds?.length) toast('Nädal lõpetatud. Seekord punkte ei kogutud — uus nädal, uued võimalused!');
    }
  };

  return (
    <div className="screen">
      <header className="screen-head">
        <h1>Nädala edetabel</h1>
        <p className="muted">Nädal algas {formatWeekdayTime(snap.openWeek.started_at)}</p>
      </header>

      {awaiting && (
        <button type="button" className="banner banner-gold" onClick={onOpenCelebration}>
          🏆 {joinNames(snap.members.filter((m) => awaiting.winner_ids!.includes(m.id)).map((m) => m.name))}{' '}
          {awaiting.winner_ids!.length > 1 ? 'valivad' : 'valib'} veel pere tegevust — puuduta siia!
        </button>
      )}
      {isFridayEvening && !nobodyYet && (
        <div className="banner banner-purple">🌟 Täna õhtul selgub nädala kangelane!</div>
      )}

      {nobodyYet ? (
        <div className="card empty">
          <div className="empty-emoji" aria-hidden>🚀</div>
          <p>Nädal alles algas — kes teeb esimese ülesande?</p>
        </div>
      ) : (
        <div className="podium" aria-label="Poodium">
          {podiumOrder.map((r) => (
            <div
              key={r.member.id}
              className={`podium-spot podium-${r.rank}`}
              style={{ '--c': r.member.color } as CSSProperties}
            >
              {r.rank === 1 && <span className="crown" aria-hidden>👑</span>}
              <span className="podium-avatar" aria-hidden>{r.member.avatar}</span>
              <span className="podium-name">{r.member.name}</span>
              <span className="podium-points"><CountUp value={total(r)} /></span>
              <div className="podium-step">
                <span>{MEDALS[r.rank - 1] ?? r.rank}</span>
              </div>
            </div>
          ))}
        </div>
      )}

      <ol className="ranking">
        {ranking.map((r, i) => (
          <li
            key={r.member.id}
            className="rank-row"
            style={{ '--c': r.member.color, animationDelay: `${i * 80}ms` } as CSSProperties}
          >
            <span className="rank-num">{r.rank}.</span>
            <span className="rank-avatar" aria-hidden>{r.member.avatar}</span>
            <div className="rank-body">
              <div className="rank-top">
                <span className="rank-name">
                  {r.member.name}
                  {r.member.multiplier !== 1 && (
                    <span className="mult" title="Punktide kordaja">×{String(r.member.multiplier).replace(".", ",")}</span>
                  )}
                </span>
                <span className="rank-points">
                  <CountUp value={total(r)} /> <small>p</small>
                </span>
              </div>
              <div className="bar" aria-hidden>
                <div className="bar-fill" style={{ width: `${(r.points / max) * 100}%` }} />
                {r.pending > 0 && (
                  <div className="bar-pending" style={{ width: `${(r.pending / max) * 100}%` }} />
                )}
              </div>
              <span className="rank-sub">
                {r.tasks} {r.tasks === 1 ? 'ülesanne' : 'ülesannet'}
                {r.pending > 0 && ` · ${pts(r.pending)} ootel`}
              </span>
            </div>
          </li>
        ))}
      </ol>

      <div className="close-week">
        {!confirming ? (
          <button type="button" className="btn btn-secondary" onClick={() => setConfirming(true)}>
            🏁 Lõpeta nädal
          </button>
        ) : (
          <div className="card confirm">
            <p>
              <strong>Lõpetame nädala?</strong>{' '}
              {leaders.length === 0
                ? 'Keegi pole veel punkte kogunud.'
                : `Võitja: ${joinNames(leaders.map((l) => l.member.name))} (${pts(total(leaders[0]))}).`}{' '}
              Punktid nullitakse ja algab uus nädal.
            </p>
            <div className="row">
              <button type="button" className="btn btn-ghost" onClick={() => setConfirming(false)}>Veel mitte</button>
              <button type="button" className="btn btn-primary" onClick={() => void closeWeek()}>Jah, lõpeta</button>
            </div>
          </div>
        )}
        <p className="muted small">Ainult vanematele · tavaliselt reede õhtul</p>
      </div>
    </div>
  );
}
