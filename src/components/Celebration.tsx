import confetti from 'canvas-confetti';
import { useEffect, useState, type CSSProperties } from 'react';
import { backend } from '../lib/backend';
import { errorMessage } from '../lib/errors';
import { joinNames } from '../lib/logic';
import { pts } from '../lib/time';
import type { Week } from '../lib/types';
import { useData, useSnap } from '../state/data';
import { useToast } from '../state/toast';

function burst() {
  if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
  const colors = ['#6d4aff', '#ffc83d', '#2ec4a6', '#ff6b8b', '#4cc9f0'];
  const end = Date.now() + 2200;
  const frame = () => {
    confetti({ particleCount: 5, angle: 60, spread: 70, origin: { x: 0, y: 0.7 }, colors, zIndex: 1000 });
    confetti({ particleCount: 5, angle: 120, spread: 70, origin: { x: 1, y: 0.7 }, colors, zIndex: 1000 });
    if (Date.now() < end) requestAnimationFrame(frame);
  };
  confetti({ particleCount: 120, spread: 100, origin: { y: 0.45 }, colors, zIndex: 1000 });
  frame();
}

interface Props {
  week: Week;
  onClose: () => void;
}

/** End-of-week party: the winner(s) pick the family activity. */
export function Celebration({ week, onClose }: Props) {
  const snap = useSnap();
  const { reload } = useData();
  const toast = useToast();
  const [custom, setCustom] = useState('');
  const [busy, setBusy] = useState(false);
  const [chosen, setChosen] = useState<{ name: string; emoji: string } | null>(
    week.activity ? { name: week.activity, emoji: week.activity_emoji ?? '🎉' } : null,
  );

  const standings = week.standings ?? [];
  const winners = standings.filter((s) => week.winner_ids?.includes(s.member_id));
  const tie = winners.length > 1;
  const names = joinNames(winners.map((w) => w.name));

  useEffect(burst, []);

  const choose = async (name: string, emoji: string) => {
    if (busy || !name.trim()) return;
    setBusy(true);
    try {
      await backend.chooseActivity(week.id, name, emoji);
      setChosen({ name: name.trim(), emoji });
      burst();
      void reload();
    } catch (e) {
      toast(errorMessage(e), 'error');
      void reload();
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="overlay celebrate" role="dialog" aria-modal="true" aria-labelledby="celebrate-title">
      <div className="sheet celebrate-sheet">
        <p className="celebrate-kicker">{tie ? 'Viik! Nädala kangelased on…' : 'Nädala kangelane on…'}</p>
        <div className="winners">
          {winners.map((w, i) => (
            <div key={w.member_id} className="winner" style={{ '--c': w.color, animationDelay: `${i * 150}ms` } as CSSProperties}>
              <span className="winner-crown" aria-hidden>👑</span>
              <span className="winner-avatar" aria-hidden>{w.avatar}</span>
              <span className="winner-name">{w.name}</span>
            </div>
          ))}
        </div>
        <h2 id="celebrate-title" className="celebrate-title">
          Palju õnne, {names}! 🎉
        </h2>
        <p className="muted">{pts(winners[0]?.points ?? 0)} — {tie ? 'täpselt sama palju! Valige koos.' : 'see on super tulemus!'}</p>

        {chosen ? (
          <div className="chosen">
            <span className="chosen-emoji" aria-hidden>{chosen.emoji}</span>
            <p>Sel nädalal teeme koos:</p>
            <p className="chosen-name">{chosen.name}</p>
            <button type="button" className="btn btn-primary btn-big" onClick={onClose}>Jee! 🙌</button>
          </div>
        ) : (
          <>
            <h3 className="pick-title">{tie ? 'Mida pere koos teeb?' : `${names}, mida pere koos teeb?`}</h3>
            <div className="activity-grid">
              {snap.activities.filter((a) => a.active).map((a) => (
                <button key={a.id} type="button" className="activity" disabled={busy} onClick={() => void choose(a.name, a.emoji)}>
                  <span className="activity-emoji" aria-hidden>{a.emoji}</span>
                  <span>{a.name}</span>
                </button>
              ))}
            </div>
            <form
              className="custom-activity"
              onSubmit={(e) => { e.preventDefault(); void choose(custom, '💡'); }}
            >
              <input
                value={custom}
                onChange={(e) => setCustom(e.target.value)}
                placeholder="Või kirjuta oma idee…"
                maxLength={80}
                aria-label="Oma idee"
              />
              <button className="btn btn-primary" disabled={busy || !custom.trim()}>Valin selle!</button>
            </form>
            <button type="button" className="btn btn-ghost" onClick={onClose}>Valime hiljem</button>
          </>
        )}
      </div>
    </div>
  );
}
