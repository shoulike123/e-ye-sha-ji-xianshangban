/**
 * 幸存者状态条和技能/背包板。
 * 上面三张头像是谁在场；下面三块板是技能和口袋里的东西。
 */
import { useEffect, useRef, useState, type PointerEvent as ReactPointerEvent } from 'react';
import { createPortal } from 'react-dom';
import type { CharacterDef, PublicPlayerView } from './types';
import { ITEM_LABEL } from './i18n';
import { portraitSrc, skillBoardSrc, survivorArtFor } from './survivorArt';
import { UI } from './uiAssets';
import { itemArtSrc } from './cardArt';
import { boxStyle, slotBoxStyle, HUD_ROW_ASPECT, type LayoutBox, type SurvivorLayout } from './survivorLayout';
import { KeyRack, RescueTrack } from './TableHud';

interface SharedProps {
  survivors: PublicPlayerView[];
  characters: CharacterDef[];
  youId: string;
  activePlayerId: string | null;
  layout: SurvivorLayout;
}

interface StatusProps extends SharedProps {
  pickableSurvivorIds?: string[];
  selectedSurvivorId?: string | null;
  onSurvivorClick?: (playerId: string) => void;
  keysCollected?: number;
  keysNeeded?: number;
  rescueArmed?: boolean;
  rescueCountdown?: number | null;
}

interface SkillProps extends SharedProps {
  selectedId: string | null;
  onToggle: (id: string) => void;
  showItems: boolean;
  youItems?: Record<string, number>;
  tradeEnabled?: boolean;
  /** 1对3：只能从自己的栏拖出，别人给来的不能拒 */
  dragOwnOnly?: boolean;
  onTradeItem?: (args: {
    fromPlayerId: string;
    targetPlayerId: string;
    itemId: string;
    receiveItemId?: string;
  }) => void;
}

/** 把“草药×2”摊成两格，方便按格子画卡。钥匙不上栏。 */
function flattenItems(items: Record<string, number> | undefined): string[] {
  if (!items) return [];
  const out: string[] = [];
  for (const [id, n] of Object.entries(items)) {
    if (id === 'key') continue;
    for (let i = 0; i < n; i++) out.push(id);
  }
  return out;
}

const DRAG_PX = 8;

type SlotHit = { playerId: string; slotIdx: number; itemId?: string };

function topSlotAt(x: number, y: number, skip?: { playerId: string; slotIdx: number }): SlotHit | null {
  const stack = document.elementsFromPoint(x, y);
  for (const node of stack) {
    const el = node instanceof Element ? node.closest('[data-inv-slot]') : null;
    if (!(el instanceof HTMLElement)) continue;
    const playerId = el.dataset.playerId;
    const slotIdx = Number(el.dataset.slotIdx);
    if (!playerId || !Number.isFinite(slotIdx)) continue;
    if (skip && skip.playerId === playerId && skip.slotIdx === slotIdx) continue;
    const raw = el.dataset.itemId;
    return { playerId, slotIdx, itemId: raw || undefined };
  }
  return null;
}

function ItemSlots({
  playerId,
  boxes,
  packed,
  showItems,
  raiseOnClick,
  raisedIdx,
  onRaise,
  canDrag,
  dragging,
  dropHover,
  onDragPointerDown,
}: {
  playerId: string;
  boxes: LayoutBox[];
  packed: string[];
  showItems: boolean;
  raiseOnClick: boolean;
  raisedIdx: number | null;
  onRaise: (idx: number) => void;
  canDrag: boolean;
  dragging: { playerId: string; slotIdx: number } | null;
  dropHover: SlotHit | null;
  onDragPointerDown: (e: ReactPointerEvent<HTMLDivElement>, hit: SlotHit) => void;
}) {
  return (
    <>
      {boxes.map((box, idx) => {
        const itemId = showItems ? packed[idx] : undefined;
        const raised = raisedIdx === idx;
        const origin = dragging && dragging.playerId === playerId && dragging.slotIdx === idx;
        const hover =
          dropHover && dropHover.playerId === playerId && dropHover.slotIdx === idx;
        const empty = !itemId;
        if (empty && !canDrag && !dragging) return null;
        const src = itemId ? itemArtSrc(itemId) : undefined;
        return (
          <div
            key={idx}
            data-inv-slot=""
            data-player-id={playerId}
            data-slot-idx={String(idx)}
            data-item-id={itemId ?? ''}
            className={[
              'surv-item-slot',
              itemId ? 'filled' : 'empty',
              raised ? 'raised' : '',
              raiseOnClick && itemId ? 'clickable' : '',
              canDrag && itemId ? 'draggable' : '',
              dragging ? 'drop-listen' : '',
              origin ? 'dragging' : '',
              hover ? 'drop-hover' : '',
            ]
              .filter(Boolean)
              .join(' ')}
            style={{
              ...slotBoxStyle(box),
              zIndex: hover ? 50 : raised ? 30 : boxes.length - idx,
            }}
            onPointerDown={
              itemId && (canDrag || raiseOnClick)
                ? (e) => {
                    e.stopPropagation();
                    onDragPointerDown(e, { playerId, slotIdx: idx, itemId });
                  }
                : undefined
            }
            onClick={
              raiseOnClick && itemId
                ? (e) => {
                    e.stopPropagation();
                    if (dragging) return;
                    onRaise(idx);
                  }
                : undefined
            }
          >
            {src ? (
              <img
                src={encodeURI(src)}
                alt={ITEM_LABEL[itemId!] ?? itemId}
                draggable={false}
                onError={(e) => {
                  e.currentTarget.style.display = 'none';
                  const lab = e.currentTarget.nextElementSibling;
                  if (lab) (lab as HTMLElement).hidden = false;
                }}
              />
            ) : null}
            {itemId ? (
              <span hidden={Boolean(src)}>{ITEM_LABEL[itemId] ?? itemId}</span>
            ) : null}
          </div>
        );
      })}
    </>
  );
}

/** 顶上一排：钥匙架 + 三张状态卡 + 恐惧标记 + 救援板 */
export function SurvivorStatusBar({
  survivors,
  characters,
  youId,
  activePlayerId,
  layout,
  pickableSurvivorIds = [],
  selectedSurvivorId = null,
  onSurvivorClick,
  keysCollected = 0,
  keysNeeded = 5,
  rescueArmed = false,
  rescueCountdown = null,
}: StatusProps) {
  const slots = [0, 1, 2].map((i) => survivors[i] ?? null);
  const hud = layout.hudRow;

  return (
    <div className="surv-status">
      <div className="surv-hud-row" style={{ aspectRatio: HUD_ROW_ASPECT }}>
        <div className="surv-hud-pane" style={boxStyle(hud.keys)}>
          <KeyRack keysCollected={keysCollected} keysNeeded={keysNeeded} slots={layout.keySlots} />
        </div>
        <div className="surv-hud-pane" style={boxStyle(hud.status)}>
          <div className="surv-status-stage">
            <img className="surv-status-bg" src={encodeURI(UI.status)} alt="状态栏" draggable={false} />
            {layout.statusBar.cards.map((box, i) => {
              const p = slots[i];
              if (!p) {
                return (
                  <div key={`empty-${i}`} className="surv-status-card empty" style={boxStyle(box)}>
                    空位
                  </div>
                );
              }
              const ch = characters.find((c) => c.id === p.characterId);
              const art = survivorArtFor(p.characterId, ch?.name);
              const injured = p.alive && p.hp < p.maxHp;
              const src = portraitSrc(art, injured || !p.alive);
              const pickable = pickableSurvivorIds.includes(p.id);
              return (
                <button
                  key={p.id}
                  type="button"
                  className={`surv-status-card${p.id === activePlayerId ? ' acting' : ''}${p.id === youId ? ' mine' : ''}${!p.alive ? ' down' : ''}${pickable ? ' pickable' : ''}${selectedSurvivorId === p.id ? ' picked' : ''}${p.actedThisRound ? ' acted' : ''}`}
                  style={boxStyle(box)}
                  onClick={pickable ? () => onSurvivorClick?.(p.id) : undefined}
                >
                  {src ? (
                    <img src={encodeURI(src)} alt={ch?.name ?? p.name} draggable={false} />
                  ) : (
                    <span>{ch?.name ?? p.name}</span>
                  )}
                </button>
              );
            })}
            {layout.statusBar.fear.map((tok, i) => {
              const p = slots[tok.card];
              const on = Boolean(p && p.fear >= tok.index + 1);
              return (
                <img
                  key={`fear-${i}`}
                  className={`surv-token fear${on ? ' on' : ''}`}
                  src={encodeURI(UI.fear)}
                  alt=""
                  draggable={false}
                  style={boxStyle(tok)}
                />
              );
            })}
            {layout.statusBar.noise.map((tok, i) => {
              const p = slots[tok.card];
              const on = Boolean(p?.overFear);
              return (
                <img
                  key={`noise-${i}`}
                  className={`surv-token noise${on ? ' on' : ''}`}
                  src={encodeURI(UI.noise)}
                  alt=""
                  draggable={false}
                  style={boxStyle(tok)}
                />
              );
            })}
          </div>
        </div>
        <div className="surv-hud-pane" style={boxStyle(hud.rescue)}>
          <RescueTrack
            rescueArmed={rescueArmed}
            rescueCountdown={rescueCountdown}
            cells={layout.rescueCells}
          />
        </div>
      </div>
    </div>
  );
}

/** 桌边三块技能与背包板，点开能放大 */
export function SurvivorSkillBoards({
  survivors,
  characters,
  youId,
  activePlayerId,
  selectedId,
  onToggle,
  showItems,
  youItems,
  layout,
  tradeEnabled = false,
  dragOwnOnly = false,
  onTradeItem,
}: SkillProps) {
  const slots = [0, 1, 2].map((i) => survivors[i] ?? null);
  const selected = slots.find((p) => p && p.id === selectedId) ?? null;
  const [raisedIdx, setRaisedIdx] = useState<number | null>(null);
  const dragRef = useRef<{
    playerId: string;
    itemId: string;
    slotIdx: number;
    pointerId: number;
    startX: number;
    startY: number;
    moved: boolean;
  } | null>(null);
  const skipBoardClick = useRef(false);
  const [hold, setHold] = useState(false);
  const [drag, setDrag] = useState<{
    playerId: string;
    itemId: string;
    slotIdx: number;
    x: number;
    y: number;
  } | null>(null);
  const [dropHover, setDropHover] = useState<SlotHit | null>(null);

  const itemsOf = (p: PublicPlayerView) =>
    p.id === youId && youItems ? youItems : p.items;

  /** 这名幸存者的装备栏上限。Server 侧同序兜底：棋子 inventorySlots → 立绘表 slots → 角色定义 → 3。
   *  拖拽投放判定与槽位绘制必须共用这一个函数，否则会出现「看着有空位却拖不进去」。 */
  const slotCapacityOf = (p: PublicPlayerView) => {
    const ch = characters.find((c) => c.id === p.characterId);
    const art = survivorArtFor(p.characterId, ch?.name);
    return p.inventorySlots || art?.slots || ch?.inventorySlots || 3;
  };

  const tradeOk = (fromId: string, toId: string) => {
    if (!tradeEnabled || fromId === toId) return false;
    if (dragOwnOnly && fromId !== youId) return false;
    const a = survivors.find((s) => s.id === fromId);
    const b = survivors.find((s) => s.id === toId);
    if (!a?.alive || !b?.alive || !a.roomId || a.roomId !== b.roomId) return false;
    return true;
  };

  const validHover = (origin: { playerId: string; itemId: string }, hit: SlotHit | null) => {
    if (!hit || !tradeOk(origin.playerId, hit.playerId)) return null;
    if (hit.itemId) return hit;
    const recv = survivors.find((s) => s.id === hit.playerId);
    if (!recv) return null;
    const cap = slotCapacityOf(recv);
    if (flattenItems(itemsOf(recv)).length >= cap) return null;
    return hit;
  };

  useEffect(() => {
    setRaisedIdx(null);
  }, [selectedId]);

  useEffect(() => {
    if (!selectedId) return;
    const onKey = (ev: KeyboardEvent) => {
      if (raisedIdx != null) {
        ev.preventDefault();
        setRaisedIdx(null);
        return;
      }
      if (ev.key === 'Escape') onToggle(selectedId);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [selectedId, onToggle, raisedIdx]);

  useEffect(() => {
    if (!hold) return;
    const onMove = (e: PointerEvent) => {
      const cur = dragRef.current;
      if (!cur) return;
      const dx = e.clientX - cur.startX;
      const dy = e.clientY - cur.startY;
      if (!cur.moved && dx * dx + dy * dy >= DRAG_PX * DRAG_PX) {
        cur.moved = true;
        skipBoardClick.current = true;
        if (selectedId) onToggle(selectedId);
      }
      if (!cur.moved) return;
      e.preventDefault();
      setDrag({
        playerId: cur.playerId,
        itemId: cur.itemId,
        slotIdx: cur.slotIdx,
        x: e.clientX,
        y: e.clientY,
      });
      setDropHover(validHover(cur, topSlotAt(e.clientX, e.clientY, cur)));
    };
    const onUp = (e: PointerEvent) => {
      const cur = dragRef.current;
      dragRef.current = null;
      setHold(false);
      setDrag(null);
      setDropHover(null);
      if (!cur?.moved || !onTradeItem) return;
      const hit = validHover(cur, topSlotAt(e.clientX, e.clientY, cur));
      if (!hit) return;
      onTradeItem({
        fromPlayerId: cur.playerId,
        targetPlayerId: hit.playerId,
        itemId: cur.itemId,
        receiveItemId: hit.itemId,
      });
    };
    window.addEventListener('pointermove', onMove, { passive: false });
    window.addEventListener('pointerup', onUp);
    window.addEventListener('pointercancel', onUp);
    document.body.classList.add('surv-item-dragging');
    return () => {
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', onUp);
      window.removeEventListener('pointercancel', onUp);
      document.body.classList.remove('surv-item-dragging');
    };
  }, [hold, selectedId, onToggle, survivors, tradeEnabled, dragOwnOnly, youItems, youId, onTradeItem]);

  const onDragPointerDown = (e: ReactPointerEvent<HTMLDivElement>, hit: SlotHit) => {
    if (!hit.itemId || e.button !== 0 || !tradeEnabled) return;
    if (dragOwnOnly && hit.playerId !== youId) return;
    e.preventDefault();
    dragRef.current = {
      playerId: hit.playerId,
      itemId: hit.itemId,
      slotIdx: hit.slotIdx,
      pointerId: e.pointerId,
      startX: e.clientX,
      startY: e.clientY,
      moved: false,
    };
    setHold(true);
  };

  const slotUi = (p: PublicPlayerView, raise: boolean) => {
    const packed = flattenItems(itemsOf(p));
    const slotCount = slotCapacityOf(p);
    const slotBoxes = slotCount > 3 ? layout.skillBoard.slots6 : layout.skillBoard.slots3;
    return (
      <ItemSlots
        playerId={p.id}
        boxes={slotBoxes}
        packed={packed}
        showItems={showItems}
        raiseOnClick={raise && slotCount > 3}
        raisedIdx={raise ? raisedIdx : null}
        onRaise={(idx) => {
          if (skipBoardClick.current) return;
          setRaisedIdx(idx);
        }}
        canDrag={tradeEnabled && (!dragOwnOnly || p.id === youId)}
        dragging={drag}
        dropHover={dropHover}
        onDragPointerDown={onDragPointerDown}
      />
    );
  };

  const ghostSrc = drag ? itemArtSrc(drag.itemId) : undefined;
  const ghost = drag && createPortal(
    <div
      className="surv-item-ghost"
      style={{ left: drag.x, top: drag.y }}
    >
      {ghostSrc ? (
        <img src={encodeURI(ghostSrc)} alt="" draggable={false} />
      ) : (
        <span>{ITEM_LABEL[drag.itemId] ?? drag.itemId}</span>
      )}
    </div>,
    document.body,
  );

  const pop =
    selected &&
    (() => {
      const ch = characters.find((c) => c.id === selected.characterId);
      const art = survivorArtFor(selected.characterId, ch?.name);
      const board = skillBoardSrc(art);
      return createPortal(
        <div
          className="surv-board-pop"
          role="dialog"
          aria-label={ch?.name ?? selected.name}
          onClick={() => onToggle(selected.id)}
        >
          <div className="surv-board-pop-stage" onClick={(e) => e.stopPropagation()}>
            {board ? (
              <img
                className="surv-skill-bg"
                src={encodeURI(board)}
                alt={ch?.name ?? selected.name}
                draggable={false}
              />
            ) : (
              <div className="surv-skill-fallback">
                <strong>{ch?.name ?? selected.name}</strong>
                <span>{art?.role}</span>
              </div>
            )}
            {slotUi(selected, true)}
          </div>
        </div>,
        document.body,
      );
    })();

  return (
    <>
      <div className="surv-skills-row">
        {slots.map((p, i) => {
          if (!p) {
            return (
              <div key={`empty-board-${i}`} className="surv-skill-wrap empty">
                空位
              </div>
            );
          }
          const ch = characters.find((c) => c.id === p.characterId);
          const art = survivorArtFor(p.characterId, ch?.name);
          const board = skillBoardSrc(art);
          const open = selectedId === p.id;
          const mine = p.id === youId;

          return (
            <div
              key={p.id}
              role="button"
              tabIndex={0}
              className={`surv-skill-wrap${open ? ' open' : ''}${p.id === activePlayerId ? ' acting' : ''}${mine ? ' mine' : ''}`}
              onClick={() => {
                if (skipBoardClick.current) {
                  skipBoardClick.current = false;
                  return;
                }
                onToggle(p.id);
              }}
              onKeyDown={(e) => {
                if (e.key === 'Enter' || e.key === ' ') {
                  e.preventDefault();
                  onToggle(p.id);
                }
              }}
            >
              {board ? (
                <img className="surv-skill-bg" src={encodeURI(board)} alt={ch?.name ?? p.name} draggable={false} />
              ) : (
                <div className="surv-skill-fallback">
                  <strong>{ch?.name ?? p.name}</strong>
                  <span>{art?.role}</span>
                </div>
              )}
              {slotUi(p, false)}
              {!open && <span className="surv-skill-hint">点击放大</span>}
            </div>
          );
        })}
      </div>
      {pop}
      {ghost}
    </>
  );
}
