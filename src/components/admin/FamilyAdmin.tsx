import { useState, type CSSProperties, type FormEvent } from 'react';
import { backend } from '../../lib/backend';
import { AVATARS, COLORS, MULTIPLIERS } from '../../lib/choices';
import type { MemberInput } from '../../lib/types';
import { useData, useSnap } from '../../state/data';
import { useParent } from '../../state/parent';
import { useToast } from '../../state/toast';

const EMPTY: MemberInput = { name: '', role: 'child', avatar: '🐼', color: COLORS[5], multiplier: 1.5, active: true };

export function FamilyAdmin() {
  const snap = useSnap();
  const [editing, setEditing] = useState<MemberInput | null>(null);

  if (editing) return <MemberEditor initial={editing} onDone={() => setEditing(null)} />;

  return (
    <div className="admin-panel">
      <div className="card explainer">
        <strong>⚖️ Õiglane mäng</strong>
        <p className="muted">
          Kordaja korrutab ülesande punkte. Lastel on vaikimisi ×1,5 — nii on neil päriselt võimalus vanemaid võita.
        </p>
      </div>
      <ul className="admin-list card">
        {[...snap.members].sort((a, b) => a.sort_order - b.sort_order).map((m) => (
          <li key={m.id} className={`admin-row ${m.active ? '' : 'inactive'}`}>
            <span className="admin-row-emoji avatar-dot" style={{ '--c': m.color } as CSSProperties} aria-hidden>{m.avatar}</span>
            <span className="admin-row-body">
              <strong>{m.name}</strong>
              <small>{m.role === 'parent' ? 'Vanem' : 'Laps'} · kordaja ×{String(m.multiplier).replace(".", ",")}{!m.active && ' · peidetud'}</small>
            </span>
            <span className="admin-row-actions">
              <button type="button" className="btn btn-small btn-ghost" onClick={() => setEditing({ ...m })}>Muuda</button>
            </span>
          </li>
        ))}
      </ul>
      <button type="button" className="btn btn-secondary" onClick={() => setEditing({ ...EMPTY })}>➕ Lisa pereliige</button>
    </div>
  );
}

function MemberEditor({ initial, onDone }: { initial: MemberInput; onDone: () => void }) {
  const { reload } = useData();
  const { withPin } = useParent();
  const toast = useToast();
  const [m, setM] = useState<MemberInput>(initial);
  const set = <K extends keyof MemberInput>(k: K, v: MemberInput[K]) => setM((p) => ({ ...p, [k]: v }));

  const save = async (e: FormEvent) => {
    e.preventDefault();
    const ok = await withPin((pin) => backend.saveMember(pin, { ...m, name: m.name.trim() }).then(() => true));
    if (ok) {
      toast('Salvestatud ✅', 'success');
      void reload();
      onDone();
    }
  };

  return (
    <form className="admin-panel card editor" onSubmit={save}>
      <div className="member-preview" style={{ '--c': m.color } as CSSProperties}>
        <span aria-hidden>{m.avatar}</span>
        <strong>{m.name || 'Nimi'}</strong>
      </div>

      <label className="field">
        <span>Nimi</span>
        <input required maxLength={30} value={m.name} onChange={(e) => set('name', e.target.value)} />
      </label>

      <fieldset className="field">
        <legend>Pilt</legend>
        <div className="emoji-picker">
          {AVATARS.map((a) => (
            <button key={a} type="button" className={m.avatar === a ? 'picked' : ''} onClick={() => set('avatar', a)} aria-label={a}>{a}</button>
          ))}
        </div>
      </fieldset>

      <fieldset className="field">
        <legend>Värv</legend>
        <div className="color-picker">
          {COLORS.map((c) => (
            <button
              key={c}
              type="button"
              className={m.color === c ? 'picked' : ''}
              style={{ background: c }}
              aria-label={`Värv ${c}`}
              aria-pressed={m.color === c}
              onClick={() => set('color', c)}
            />
          ))}
        </div>
      </fieldset>

      <fieldset className="field">
        <legend>Roll</legend>
        <div className="segmented">
          <button type="button" className={m.role === 'parent' ? 'active' : ''} onClick={() => set('role', 'parent')}>Vanem</button>
          <button type="button" className={m.role === 'child' ? 'active' : ''} onClick={() => set('role', 'child')}>Laps</button>
        </div>
      </fieldset>

      <fieldset className="field">
        <legend>Punktide kordaja</legend>
        <div className="segmented">
          {MULTIPLIERS.map((x) => (
            <button key={x} type="button" className={m.multiplier === x ? 'active' : ''} onClick={() => set('multiplier', x)}>
              ×{String(x).replace('.', ',')}
            </button>
          ))}
        </div>
      </fieldset>

      <label className="switch-row">
        <input type="checkbox" checked={m.active ?? true} onChange={(e) => set('active', e.target.checked)} />
        <span className="switch" aria-hidden />
        <span>Näita valikus ja edetabelis</span>
      </label>

      <div className="row editor-actions">
        <span className="spacer" />
        <button type="button" className="btn btn-ghost" onClick={onDone}>Tühista</button>
        <button className="btn btn-primary" disabled={!m.name.trim()}>Salvesta</button>
      </div>
    </form>
  );
}
