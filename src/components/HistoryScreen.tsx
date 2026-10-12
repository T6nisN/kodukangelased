import type { CSSProperties } from 'react';
import { joinNames } from '../lib/logic';
import { formatRange, pts } from '../lib/time';
import { useSnap } from '../state/data';

export function HistoryScreen() {
  const snap = useSnap();

  // Hall of fame: number of weekly wins per person.
  const wins = new Map<string, number>();
  snap.pastWeeks.forEach((w) => w.winner_ids?.forEach((id) => wins.set(id, (wins.get(id) ?? 0) + 1)));

  return (
    <div className="screen">
      <header className="screen-head">
        <h1>Varasemad nädalad</h1>
        <p className="muted">Kes võitis ja mida koos tegime</p>
      </header>

      {snap.pastWeeks.length > 0 && (
        <div className="fame">
          {snap.members.filter((m) => m.active).map((m) => (
            <div key={m.id} className="fame-item" style={{ '--c': m.color } as CSSProperties}>
              <span className="fame-avatar" aria-hidden>{m.avatar}</span>
              <span className="fame-count">{wins.get(m.id) ?? 0}× 🏆</span>
              <span className="fame-name">{m.name}</span>
            </div>
          ))}
        </div>
      )}

      {snap.pastWeeks.length === 0 ? (
        <div className="card empty">
          <div className="empty-emoji" aria-hidden>📜</div>
          <p>Siia tekivad lõpetatud nädalad. Esimene võitja selgub peagi!</p>
        </div>
      ) : (
        <div className="history-list">
          {snap.pastWeeks.map((w) => {
            const standings = w.standings ?? [];
            const winners = standings.filter((s) => w.winner_ids?.includes(s.member_id));
            return (
              <article key={w.id} className="card history-card">
                <div className="history-top">
                  <span className="history-dates">{formatRange(w.started_at, w.ended_at!)}</span>
                  {w.activity ? (
                    <span className="chip chip-activity">{w.activity_emoji} {w.activity}</span>
                  ) : winners.length > 0 ? (
                    <span className="chip chip-wait">Tegevus valimata</span>
                  ) : null}
                </div>
                {winners.length > 0 ? (
                  <p className="history-winner">
                    <span aria-hidden>{winners.map((s) => s.avatar).join(' ')}</span>{' '}
                    <strong>{joinNames(winners.map((s) => s.name))}</strong> · {pts(winners[0].points)}
                  </p>
                ) : (
                  <p className="history-winner muted">Seekord võitjat polnud</p>
                )}
                <ul className="history-standings">
                  {standings.map((s) => (
                    <li key={s.member_id} style={{ '--c': s.color } as CSSProperties}>
                      <span aria-hidden>{s.avatar}</span> {s.name} <b>{s.points}</b>
                    </li>
                  ))}
                </ul>
              </article>
            );
          })}
        </div>
      )}
    </div>
  );
}
