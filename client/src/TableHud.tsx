/**
 * 顶栏上的三颗小药丸：钥匙、修理、恐惧。
 * 点开会弹出大图，看钥匙架、修理进度、每个人怕不怕。
 */
import { ITEM_ICON, UI } from './uiAssets';
import type { PublicPlayerView } from './types';
import {
  boxStyle,
  DEFAULT_SURVIVOR_LAYOUT,
  type LayoutBox,
  type RescueCellBox,
} from './survivorLayout';

export type TrackPanel = 'keys' | 'repair' | 'fear';

/** 顶栏那一排小按钮 */
export function TrackChips({
  keysCollected,
  keysNeeded,
  repairProgress,
  repairNeeded,
  showRepair,
  fearTotal,
  open,
  onToggle,
}: {
  keysCollected: number;
  keysNeeded: number;
  repairProgress: number;
  repairNeeded: number;
  showRepair: boolean;
  fearTotal: number;
  open: TrackPanel | null;
  onToggle: (panel: TrackPanel) => void;
}) {
  return (
    <div className="track-chips">
      <button
        type="button"
        className={`track-chip${open === 'keys' ? ' on' : ''}`}
        onClick={() => onToggle('keys')}
      >
        <img src={encodeURI(ITEM_ICON.key)} alt="" draggable={false} />
        <span>
          钥匙 <strong>{keysCollected}/{keysNeeded}</strong>
        </span>
      </button>
      {showRepair && (
        <button
          type="button"
          className={`track-chip${open === 'repair' ? ' on' : ''}`}
          onClick={() => onToggle('repair')}
        >
          <img src={encodeURI(UI.repair)} alt="" draggable={false} />
          <span>
            修理 <strong>{repairProgress}/{repairNeeded}</strong>
          </span>
        </button>
      )}
      <button
        type="button"
        className={`track-chip${open === 'fear' ? ' on' : ''}`}
        onClick={() => onToggle('fear')}
      >
        <img src={encodeURI(UI.fear)} alt="" draggable={false} />
        <span>
          恐惧 <strong>{fearTotal}</strong>
        </span>
      </button>
    </div>
  );
}

/** 钥匙架：有几把钥匙就点亮几把 */
export function KeyRack({
  keysCollected,
  keysNeeded,
  slots,
}: {
  keysCollected: number;
  keysNeeded: number;
  slots?: LayoutBox[];
}) {
  const boxes = slots?.length ? slots : DEFAULT_SURVIVOR_LAYOUT.keySlots;
  const n = Math.max(keysNeeded, boxes.length);
  return (
    <div className="key-rack">
      <img className="hud-board" src={encodeURI(UI.keys)} alt="钥匙架" draggable={false} />
      {Array.from({ length: n }, (_, i) => {
        const box = boxes[i] ?? boxes[boxes.length - 1];
        if (!box) return null;
        return (
          <div key={i} className="key-slot-abs" style={boxStyle(box)}>
            {i < keysCollected && (
              <img
                className="pop-in"
                src={encodeURI(ITEM_ICON.key)}
                alt={`钥匙 ${i + 1}`}
                draggable={false}
              />
            )}
          </div>
        );
      })}
    </div>
  );
}

/** 救援板：警车从 5 开到 0（出口） */
export function RescueTrack({
  rescueArmed,
  rescueCountdown,
  cells,
}: {
  rescueArmed: boolean;
  rescueCountdown: number | null;
  cells?: RescueCellBox[];
}) {
  const list = cells?.length ? cells : DEFAULT_SURVIVOR_LAYOUT.rescueCells;
  const cell =
    rescueArmed && rescueCountdown != null
      ? list.find((c) => c.step === rescueCountdown) ?? null
      : null;
  return (
    <div className={`rescue-track${rescueArmed ? ' armed' : ''}`}>
      <img className="hud-board" src={encodeURI(UI.rescue)} alt="救援板块" draggable={false} />
      {cell && (
        <img
          className="police-car"
          src={encodeURI(UI.car)}
          alt="警车"
          draggable={false}
          style={boxStyle(cell)}
        />
      )}
    </div>
  );
}

function FearRow({ p }: { p: PublicPlayerView }) {
  return (
    <div className="fear-detail-row">
      <span className="fear-detail-name">{p.name}</span>
      <div className="fear-track">
        <img
          className={`fear-mark${p.fear >= 1 ? ' on' : ''}`}
          src={encodeURI(UI.fear)}
          alt="恐惧"
          draggable={false}
        />
        <span className="fear-arrow">›</span>
        <img
          className={`fear-mark${p.fear >= 2 ? ' on' : ''}`}
          src={encodeURI(UI.fear)}
          alt="恐惧"
          draggable={false}
        />
        <span className="fear-arrow">›</span>
        <img
          className={`noise-mark${p.overFear ? ' on' : ''}`}
          src={encodeURI(UI.noise)}
          alt="响声"
          draggable={false}
        />
      </div>
    </div>
  );
}

/** 点顶栏小药丸后弹出的大图 */
export function TrackOverlay({
  panel,
  onClose,
  keysCollected,
  keysNeeded,
  repairProgress,
  repairNeeded,
  rescueArmed,
  rescueCountdown,
  survivors,
  keySlots,
  rescueCells,
}: {
  panel: TrackPanel;
  onClose: () => void;
  keysCollected: number;
  keysNeeded: number;
  repairProgress: number;
  repairNeeded: number;
  rescueArmed: boolean;
  rescueCountdown: number | null;
  survivors: PublicPlayerView[];
  keySlots?: LayoutBox[];
  rescueCells?: RescueCellBox[];
}) {
  const title = panel === 'keys' ? '钥匙架' : panel === 'repair' ? '修理进度' : '恐惧标记';
  return (
    <div className="hud-overlay" onClick={onClose} role="presentation">
      <div
        className={`hud-overlay-card hud-${panel}`}
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-label={title}
      >
        <div className="hud-overlay-head">
          <h3>{title}</h3>
          <button type="button" className="ghost-btn" onClick={onClose}>
            关闭
          </button>
        </div>
        {panel === 'keys' && (
          <KeyRack keysCollected={keysCollected} keysNeeded={keysNeeded} slots={keySlots} />
        )}
        {panel === 'repair' && (
          <div className="repair-detail">
            <p className="muted">
              修理进度 {repairProgress}/{repairNeeded}
              {rescueArmed ? ` · 救援倒计时 ${rescueCountdown}` : ''}
            </p>
            <div className="repair-pips">
              {Array.from({ length: repairNeeded }, (_, i) => (
                <img
                  key={i}
                  className={`repair-pip${i < repairProgress ? ' on' : ''}`}
                  src={encodeURI(UI.repair)}
                  alt={i < repairProgress ? `已修理 ${i + 1}` : '未修理'}
                  draggable={false}
                />
              ))}
            </div>
            {rescueArmed && (
              <RescueTrack
                rescueArmed={rescueArmed}
                rescueCountdown={rescueCountdown}
                cells={rescueCells}
              />
            )}
          </div>
        )}
        {panel === 'fear' && (
          <div className="fear-detail">
            {survivors.length === 0 ? (
              <p className="muted">场上没有幸存者</p>
            ) : (
              survivors.map((p) => <FearRow key={p.id} p={p} />)
            )}
          </div>
        )}
      </div>
    </div>
  );
}
