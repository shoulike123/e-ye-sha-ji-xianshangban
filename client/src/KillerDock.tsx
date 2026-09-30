/**
 * 杀手公开条：进化牌、等级、力量。
 * 以及杀手自己的行动区（手牌、潜行标记）。
 */
import { useEffect, useRef } from 'react';
import type { CardDef, CharacterDef, PublicPlayerView, TraitDef } from './types';
import { boxStyle, type SurvivorLayout } from './survivorLayout';
import { killerArtFor, killerStandeeSrc, killerStatueSrc } from './killerArt';
import { cardArtSrc } from './cardArt';

/** 桌上那名杀手棋子 */
function killerPlayer(players: PublicPlayerView[]): PublicPlayerView | undefined {
  return players.find((p) => p.faction === 'killer');
}


/** 杀手自己的操作台：手牌、阶段提示 */
export function KillerActionDock({
  players,
  characters,
  layout,
  hand,
  locked,
  discard,
  deckCount,
  cardById,
  pendingCard,
  playableIds,
  blockedReasons,
  onPlayCard,
  onInspectCard,
  onInspectEvolution,
  onInspectDeck,
  onInspectDiscard,
  payForCard,
  payIds,
  /** 【雕像】本局有 4 尊雕像时，立绘区要画 4 个（用 `statueStandees` 那套色块） */
  statueCount = 0,
  /**
   * 【变体1】**杀手特性卡**（用户要求：杀手卡牌区里也要放一份）。
   * 按杀手分组（2对3 两名杀手各一块）；空组由调用方过滤掉。
   */
  traitGroups,
  traitUsed,
  onZoomTrait,
  onUseTrait,
  activeTraitId,
  traitDisabledReasons,
  traitPayHint,
  onCancelTraitPay,
}: {
  players: PublicPlayerView[];
  characters: CharacterDef[];
  layout: SurvivorLayout;
  hand: string[];
  locked?: string[];
  discard: Array<{ id: string; name: string }>;
  deckCount: number;
  cardById: Record<string, CardDef>;
  pendingCard: string | null;
  playableIds: Set<string>;
  blockedReasons?: Record<string, string>;
  onPlayCard: (cardId: string) => void;
  onInspectCard?: (cardId: string) => void;
  onInspectEvolution?: () => void;
  onInspectDeck?: () => void;
  onInspectDiscard?: () => void;
  payForCard?: string | null;
  payIds?: string[];
  statueCount?: number;
  traitGroups?: Array<{ id: string; name: string; defs: TraitDef[] }>;
  traitUsed?: string[];
  onZoomTrait?: (src: string, caption: string) => void;
  /**
   * 【变体1】点自己的特性卡 = **发动**（只有杀手视角会传）。
   * 需要弃牌的由调用方进入选牌模式。
   */
  onUseTrait?: (traitId: string) => void;
  /** 正在为哪张特性选弃牌（高亮它） */
  activeTraitId?: string | null;
  /** 【变体1】这些特性卡现在不能发动 + 原因（手牌不够等），置灰并写进 title */
  traitDisabledReasons?: Record<string, string>;
  /** 「发动「XX」需要弃 N 张：点手牌选（已选 n/N）」这类提示；null = 不显示 */
  traitPayHint?: string | null;
  onCancelTraitPay?: () => void;
}) {
  const killer = killerPlayer(players);
  const ch = characters.find((c) => c.id === killer?.characterId);
  const art = killerArtFor(killer?.characterId ?? null, ch?.name ?? killer?.name);
  const standee = killerStandeeSrc(art);
  const dock = layout.killerDock;
  const topDiscard = discard.length ? discard[0] : null;
  const discardSrc = topDiscard
    ? cardArtSrc(cardById[topDiscard.id], topDiscard.id)
    : undefined;
  const paying = Boolean(payForCard);
  const picked = new Set(payIds ?? []);
  const lockedIds = locked ?? [];
  /**
   * 锁定牌槽位：
   *  - **未命名**等"有专属槽位"的杀手走 `lockedByKiller[角色id]`（他有 2 张）；
   *  - 其余杀手继续用共用的 `locked`（1 格）。
   *
   * 用户明确：「未命名的第一张锁定牌不要跟其他杀手的绑定调整」——
   * 所以这两份是独立的，调一边不会带偏另一边。
   */
  const perKillerBoxes = killer?.characterId
    ? dock.lockedByKiller?.[killer.characterId]
    : undefined;
  const lockedBoxes = perKillerBoxes?.length
    ? perKillerBoxes
    : dock.locked?.length
      ? dock.locked
      : [{ x: 54, y: 62, w: 12, h: 34 }];
  /**
   * **摸牌动画**：手牌是**往末尾追加**的（`drawKillerCards` 一张张 push），
   * 所以「下标 >= 上一次的长度」就是这把刚摸进来的牌 —— 给它一个滑入动画。
   *
   * ⚠ 用"长度增长"判断，不比对牌 id：同一张牌可能有好几份，id 比不出来。
   * 打出牌会让长度 -1，下把摸回来时可能刚好补平 —— 那种情况不播动画，
   * 属于可接受的保守取舍（宁可少播，也不要乱播）。
   */
  const prevHandLenRef = useRef(0);
  const prevHandLen = prevHandLenRef.current;
  useEffect(() => {
    prevHandLenRef.current = hand.length;
  });
  /**
   * **打出牌 → 进弃牌堆**的动画：给弃牌堆顶上那张牌一个 `key`，
   * 换牌时元素会重新挂载，动画自然重播。
   */
  const discardTopKey = topDiscard?.id ?? 'empty';

  return (
    <div className="killer-dock">
      <div className="killer-dock-stage">
        {/**
          * 【雕像】4 尊立绘**各占一个可校准的色块**（`statueStandees`）。
          *
          * 用户要求："雕像的立绘有 4 个，都放上，我来调整图层和位置" ——
          * 原来的 `standee` 是单值，雕像局里只画得出一尊。
          * `layer` 直接当 `z-index`，四尊叠在一起时能调谁盖谁。
          */}
        {statueCount > 0
          ? dock.statueStandees.slice(0, statueCount).map((box, i) => {
              const src = killerStatueSrc(art, i + 1);
              if (!src) return null;
              return (
                <img
                  key={`statue-${i}`}
                  className="killer-dock-piece"
                  src={encodeURI(src)}
                  alt={`雕像 ${i + 1}`}
                  draggable={false}
                  style={{ ...boxStyle(box), zIndex: box.layer ?? 0 }}
                />
              );
            })
          : standee && (
              <img
                className="killer-dock-piece"
                src={encodeURI(standee)}
                alt={ch?.name ?? '杀手立绘'}
                draggable={false}
                style={boxStyle(dock.standee)}
              />
            )}
        <button
          type="button"
          className="killer-dock-pile"
          style={boxStyle(dock.deck)}
          onClick={onInspectDeck}
          title="查看摸牌堆"
        >
          {art && (
            <img
              className={deckCount > 0 ? undefined : 'empty'}
              src={encodeURI(art.back)}
              alt={deckCount > 0 ? '摸牌堆' : '牌堆空'}
              draggable={false}
            />
          )}
          <span className="killer-dock-label">牌堆</span>
          <span className="killer-dock-count">{deckCount}</span>
        </button>
        <button
          type="button"
          className="killer-dock-pile"
          style={boxStyle(dock.discard)}
          onClick={onInspectDiscard}
          title="查看弃牌堆"
        >
          {discardSrc ? (
            <img
              key={discardTopKey}
              className="card-drop-in"
              src={encodeURI(discardSrc)}
              alt={topDiscard?.name ?? '弃牌'}
              draggable={false}
            />
          ) : art ? (
            <img className="empty" src={encodeURI(art.back)} alt="弃牌堆空" draggable={false} />
          ) : null}
          <span className="killer-dock-label">弃牌</span>
          <span className="killer-dock-count">{discard.length}</span>
        </button>
        {dock.hand.slice(0, 5).map((box, i) => {
          const cid = hand[i];
          const card = cid ? cardById[cid] : undefined;
          const src = cid ? cardArtSrc(card, cid) : undefined;
          const playable = Boolean(cid && playableIds.has(cid));
          const pending = cid != null && pendingCard === cid;
          const isPayCard = cid != null && cid === payForCard;
          const isPayPick = cid != null && picked.has(cid);
          if (!cid) {
            return <div key={`hand-${i}`} className="killer-dock-hand empty" style={boxStyle(box)} />;
          }
          return (
            <button
              key={`${cid}-${i}`}
              type="button"
              className={`killer-dock-hand${playable && !paying ? ' playable' : ''}${pending || isPayCard ? ' pending' : ''}${isPayPick ? ' pay-pick' : ''}${i >= prevHandLen ? ' card-enter' : ''}`}
              style={boxStyle(box)}
              onClick={() => (paying ? onPlayCard(cid) : onInspectCard?.(cid))}
              title={card?.name ?? cid}
            >
              {src ? (
                <img src={encodeURI(src)} alt={card?.name ?? cid} draggable={false} />
              ) : (
                <span>{card?.name ?? cid}</span>
              )}
            </button>
          );
        })}
        {art && (
          <button
            type="button"
            className="killer-dock-evo"
            style={boxStyle(dock.evolution)}
            onClick={onInspectEvolution}
            title="进化牌"
          >
            <img src={encodeURI(art.evolution)} alt="进化牌" draggable={false} />
          </button>
        )}
        <div className="killer-dock-evo-label" style={boxStyle(dock.evolutionLabel ?? { x: 4, y: 40, w: 16, h: 6 })}>
          进化牌
        </div>
        {lockedIds.map((cid, i) => {
          const base = lockedBoxes[Math.min(i, lockedBoxes.length - 1)] ?? lockedBoxes[0];
          const box =
            i < lockedBoxes.length ? base : { ...base, x: base.x + (i - lockedBoxes.length + 1) * 8 };
          const card = cardById[cid];
          const src = cardArtSrc(card, cid);
          const lv = card?.unlockLevel;
          return (
            <button
              key={`${cid}-lock-${i}`}
              type="button"
              className="killer-dock-locked"
              style={boxStyle(box)}
              onClick={() => onInspectCard?.(cid)}
              title={card?.name ?? cid}
            >
              {src ? (
                <img src={encodeURI(src)} alt={card?.name ?? cid} draggable={false} />
              ) : (
                <span>{card?.name ?? cid}</span>
              )}
              <span className="killer-dock-lock-badge">锁{lv != null ? ` · 等级${lv}` : ''}</span>
            </button>
          );
        })}
      </div>
      {/**
       * **【变体1】杀手特性卡**（用户要求：**杀手卡牌区里也要放**）。
       *
       * 和杀手信息面板里那块是同一份数据（按杀手分组）；这里放在卡牌区末尾，
       * 用 `.killer-dock-traits` 绝对定位在卡牌区下缘 —— **位置你自己在 CSS 里调**。
       */}
      {traitGroups?.length ? (
        <div className="killer-dock-traits">
          {/**
           * 【变体1】发动提示条 —— 字段是**独立的**（`traitPayHint`），
           * 不会借用"打出某张牌的代价"那套文案。
           */}
          {traitPayHint && (
            <div className="killer-dock-trait-pay">
              <span>{traitPayHint}</span>
              {onCancelTraitPay && (
                <button type="button" onClick={onCancelTraitPay}>
                  取消
                </button>
              )}
            </div>
          )}
          {traitGroups.map((group) => (
            <div key={`dock-trait-grp-${group.id}`} className="killer-dock-trait-group">
              {traitGroups.length > 1 && (
                <span className="killer-dock-trait-name">{group.name}</span>
              )}
              <div className="trait-card-row">
                {group.defs.map((def) => (
                  <button
                    key={`dock-trait-${group.id}-${def.id}`}
                    type="button"
                    disabled={Boolean(onUseTrait) && Boolean(traitDisabledReasons?.[def.id])}
                    className={`trait-chip${(traitUsed ?? []).includes(def.id) ? ' used' : ''}${
                      activeTraitId === def.id ? ' pending' : ''
                    }${traitDisabledReasons?.[def.id] ? ' blocked' : ''}`}
                    title={
                      traitDisabledReasons?.[def.id]
                        ? `${def.name}：${def.text}\n现在不能发动 —— ${traitDisabledReasons[def.id]}`
                        : onUseTrait
                          ? `${def.name}：${def.text}（点一下发动）`
                          : `${def.name}：${def.text}`
                    }
                    onClick={() => {
                      /**
                       * 杀手视角：点卡 = **发动**；右键/放大走别的入口（面板里那份可以点开放大）。
                       * 幸存者视角（`onUseTrait` 没传）：点开看大图。
                       */
                      if (onUseTrait) onUseTrait(def.id);
                      else onZoomTrait?.(def.art, `${def.name}（杀手特性）`);
                    }}
                  >
                    <img src={encodeURI(def.art)} alt={def.name} draggable={false} />
                  </button>
                ))}
              </div>
            </div>
          ))}
        </div>
      ) : null}
    </div>
  );
}
