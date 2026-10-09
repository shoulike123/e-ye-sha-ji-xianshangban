/**
 * 幸存者状态条和技能/背包板。
 * 上面三张头像是谁在场；下面三块板是技能和口袋里的东西。
 */
import {
  useEffect,
  useRef,
  useState,
  type CSSProperties,
  type PointerEvent as ReactPointerEvent,
} from 'react';
import { createPortal } from 'react-dom';
import type { CharacterDef, PublicPlayerView, TraitDef } from './types';
import { ITEM_LABEL } from './i18n';
import { portraitSrc, skillBoardSrc, survivorArtFor } from './survivorArt';
import { UI, SURVIVOR_TOKEN } from './uiAssets';
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
  /** 【分头行动】：顶栏钥匙区换成模式标识（钥匙各自保管，不上架） */
  split?: boolean;
  /** 已〔中毒〕的幸存者 id。标记画在对应状态卡上。 */
  poisoned?: string[];
}

interface SkillProps extends SharedProps {
  selectedId: string | null;
  onToggle: (id: string) => void;
  showItems: boolean;
  youItems?: Record<string, number>;
  /** 「分头行动」：钥匙单独保管 —— 开关 + 各人把数（只有幸存者视角有） */
  split?: boolean;
  splitKeys?: Record<string, number>;
  /** 「分头行动」本大回合的先手棋子 id（物品栏上方标 ★ 先手） */
  splitFirstId?: string | null;
  /** 「分头行动」单独逃脱的门槛（服务端下发，默认 3 把） */
  splitEscapeKeys?: number;
  /** 【变体1】当前可见的特性卡定义 + 已经用掉的那些（用掉的卡面变暗） + 点开放大 */
  traitDefs?: TraitDef[];
  traitUsed?: string[];
  onZoomTrait?: (src: string, caption: string) => void;
  tradeEnabled?: boolean;
  /** 1对3：只能从自己的栏拖出，别人给来的不能拒 */
  dragOwnOnly?: boolean;
  onTradeItem?: (args: {
    fromPlayerId: string;
    targetPlayerId: string;
    itemId: string;
    receiveItemId?: string;
  }) => void;
  /**
   * 谁身上有哪些标记（`{ [playerId]: ['encourage' | 'resilience'] }`）。
   * 只画在装备卡里的人物身体上。
   */
  tokensByPlayer?: Record<string, string[]>;
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
  /**
   * **刚入手的物品**播放一个"跳出来"的动画（搜索摸到东西、拿到遗物、交换收到…）。
   *
   * 判据：这一格现在有物品、而上一次的清单里**没有**这件物品。
   * 用 `includes` 而不是逐位比对 —— 背包会被 `flattenItems` 重排，
   * 逐位比对会把"整理顺序"误判成"新拿到"。
   */
  const prevPackedRef = useRef<string[]>([]);
  const prevPacked = prevPackedRef.current;
  useEffect(() => {
    prevPackedRef.current = packed;
  });
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
        /** 这件物品上一次不在清单里 → 是刚拿到手的 */
        const justGot = Boolean(itemId) && !prevPacked.includes(itemId!);
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
              /** 刚入手的物品跳一下（见 `justGot` 的说明） */
              justGot ? 'pop-in' : '',
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
  /** 【分头行动】：顶栏钥匙区换成模式标识 */
  split = false,
  poisoned = [],
}: StatusProps) {
  /**
   * 状态栏卡位**由布局数据决定**（`layout.statusBar.cards` 有多少项就画多少），
   * 不再写死 3 个 —— 内容层想加第 4 名幸存者时只要多给一个卡位就行。
   */
  const slots = layout.statusBar.cards.map((_, i) => survivors[i] ?? null);
  const hud = layout.hudRow;

  return (
    <div className="surv-status">
      <div className="surv-hud-row" style={{ aspectRatio: HUD_ROW_ASPECT }}>
        <div className="surv-hud-pane" style={boxStyle(hud.keys)}>
          {/**
           * 【分头行动】**钥匙不再上架**，所以顶栏这块**换成模式标识**
           * （用户要求：「将顶栏钥匙收集区域替换成分头行动标识」）。
           * 各人的钥匙数在各自物品栏上方显示，不在这儿。
           */}
          {split ? (
            /** 官方木牌素材（用户给的）：直接铺满这一块 */
            <img
              className="split-badge-art"
              src={encodeURI(UI.splitBadge)}
              alt="分头行动"
              draggable={false}
              title="分头行动：钥匙各自保管、各自逃脱"
            />
          ) : (
            <KeyRack keysCollected={keysCollected} keysNeeded={keysNeeded} slots={layout.keySlots} />
          )}
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
            {(layout.statusBar.poison ?? []).map((tok, i) => {
              const p = slots[tok.card];
              const on = Boolean(p && poisoned.includes(p.id));
              return (
                <img
                  key={`poison-${i}`}
                  className={`surv-token poison${on ? ' on' : ''}`}
                  src={encodeURI('/Image/Killers/杀手九_女王/中毒标记.png')}
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
  tokensByPlayer,
  /**
   * 「分头行动」：钥匙不再上架，而是**各人单独保管**。
   * 这里把每个人的钥匙数显示在**他的物品栏上方**（用户要求）。
   * ⚠ `splitKeys` 只有幸存者视角才有（杀手看不到，因为"找到钥匙不报告杀手"）。
   */
  split = false,
  splitKeys,
  splitFirstId = null,
  splitEscapeKeys = 3,
  traitDefs,
  traitUsed,
  onZoomTrait,
}: SkillProps) {
  /**
   * 技能/背包板：画在场幸存者数（至少 3 格，保持空位占位不变），
   * 不写死 3 —— 第 4 名幸存者也能显示。
   */
  const boardCount = Math.max(3, survivors.length);
  const slots = Array.from({ length: boardCount }, (_, i) => survivors[i] ?? null);
  /**
   * 【变体1】把某个人的特性卡 **id** 翻成定义（拿不到定义就跳过，
   * 比如杀手视角下服务端根本没下发幸存者特性）。
   */
  const traitIdsFor = (playerId: string): TraitDef[] => {
    const ids = survivors.find((s) => s.id === playerId)?.traits ?? [];
    return ids
      .map((id) => (traitDefs ?? []).find((d) => d.id === id))
      .filter((d): d is TraitDef => Boolean(d));
  };
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

  /** 装备卡上人物身体的位置（标记就画在这里） */
  const bodyBox = layout.skillBoard.body;

  /**
   * 幸存者身上的标记：**只画在装备卡里的人物身体上**。
   * 一个身体上最多两个（鼓励标记 + 坚毅标记），左右错开一点，别完全重叠。
   */
  const bodyTokens = (p: PublicPlayerView) => {
    const list = tokensByPlayer?.[p.id] ?? [];
    if (!list.length) return null;
    return list.map((kind, i) => {
      const src = SURVIVOR_TOKEN[kind];
      if (!src) return null;
      return (
        <img
          key={`${p.id}-${kind}`}
          className="surv-body-token"
          src={encodeURI(src)}
          alt=""
          title={kind === 'encourage' ? '鼓励标记' : '坚毅标记'}
          draggable={false}
          style={{
            ...boxStyle(bodyBox),
            transform: list.length > 1 ? `translateX(${(i - (list.length - 1) / 2) * 62}%)` : undefined,
            zIndex: 8 + i,
          }}
        />
      );
    });
  };

  const slotUi = (p: PublicPlayerView, raise: boolean) => {
    const packed = flattenItems(itemsOf(p));
    const slotCount = slotCapacityOf(p);
    const slotBoxes = slotCount > 3 ? layout.skillBoard.slots6 : layout.skillBoard.slots3;
    return (
      <>
        {/**
         * **「分头行动」：先手标记**（显示在物品栏上方，**在"持有钥匙"之前**）。
         * 规则：第一个大回合由他先做一般行动，之后每个大回合后移一位。
         */}
        {split && (
          <span className="surv-first-mark">
            {splitFirstId === p.id ? '★ 先手' : ''}
          </span>
        )}
        {/**
         * **「分头行动」：这名幸存者单独保管的钥匙数**（显示在物品栏**上方**）。
         * 绝对定位，不参与物品格子的流式排布，免得挤动那三/六个槽位。
         */}
        {split && (
          <span
            className="surv-held-keys"
            title={`分头行动：攒到 ${splitEscapeKeys} 把钥匙，站在出口，下个大回合开始就自动单独逃脱（不花行动）`}
          >
            【持有钥匙】：{splitKeys?.[p.id] ?? 0} / {splitEscapeKeys} 把
          </span>
        )}
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
        {/**
         * **【变体1】特性卡**（用户要求：幸存者选完的特性卡放在**各自物品栏下方**）。
         *
         * 只画这个人自己那张 —— 幸存者特性同伴互相可见、杀手看不到
         * （可见性由服务端按视角过滤，这里拿到什么画什么）。
         * 点一下放大看；"每场游戏仅限一次"的用掉后**卡面变暗**。
         */}
        {traitDefs?.length ? (
          <div className="trait-card-row">
            {traitIdsFor(p.id).map((def) => (
              <button
                key={`trait-${p.id}-${def.id}`}
                type="button"
                className={`trait-chip${(traitUsed ?? []).includes(def.id) ? ' used' : ''}`}
                title={`${def.name}：${def.text}`}
                onClick={(e) => {
                  e.stopPropagation();
                  onZoomTrait?.(def.art, `${def.name}（幸存者特性）`);
                }}
              >
                <img src={encodeURI(def.art)} alt={def.name} draggable={false} />
              </button>
            ))}
          </div>
        ) : null}
      </>
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
            {bodyTokens(selected)}
          </div>
        </div>,
        document.body,
      );
    })();

  return (
    <>
      <div
        className="surv-skills-row"
        style={{ '--board-cols': boardCount } as CSSProperties}
      >
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
              {bodyTokens(p)}
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
