import type { CSSProperties } from 'react';
import { activeMembers, weekRanking } from '../lib/logic';
import { pts } from '../lib/time';
import { useSnap } from '../state/data';

interface Props {
  onPick: (memberId: string) => void;
  kitchenMode: boolean;
  onKitchenMode: (on: boolean) => void;
}

/** "Kes sa oled?" — tap your avatar, no typing. */
export function WhoAreYou({ onPick, kitchenMode, onKitchenMode }: Props) {
  const snap = useSnap();
  const points = new Map(weekRanking(snap).map((r) => [r.member.id, r.points + r.pending]));

  return (
    <main className="who">
      <h1 className="who-title">Kes sa oled?</h1>
      <p className="muted who-sub">Puuduta oma pilti</p>
      <div className="who-grid">
        {activeMembers(snap).map((m, i) => (
          <button
            key={m.id}
            type="button"
            className="who-card"
            style={{ '--c': m.color, animationDelay: `${i * 70}ms` } as CSSProperties}
            onClick={() => onPick(m.id)}
          >
            <span className="who-avatar" aria-hidden>{m.avatar}</span>
            <span className="who-name">{m.name}</span>
            <span className="who-points">{pts(points.get(m.id) ?? 0)}</span>
          </button>
        ))}
      </div>
      <label className="switch-row who-kitchen">
        <input type="checkbox" checked={kitchenMode} onChange={(e) => onKitchenMode(e.target.checked)} />
        <span className="switch" aria-hidden />
        <span>🍳 Köögitahvel: tagasi siia 2 minuti pärast</span>
      </label>
    </main>
  );
}
