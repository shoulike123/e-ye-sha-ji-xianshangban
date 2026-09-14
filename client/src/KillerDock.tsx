/**
 * 杀手公开条：进化牌、等级、力量。
 * 以及杀手自己的行动区（手牌、潜行标记）。
 */
import type { CardDef, CharacterDef, PublicPlayerView } from './types';
import { boxStyle, type SurvivorLayout } from './survivorLayout';
import { killerArtFor, killerStandeeSrc } from './killerArt';
import { cardArtSrc } from './cardArt';

/** 桌上那名杀手棋子 */
function killerPlayer(players: PublicPlayerView[]): PublicPlayerView | undefined {
  return players.find((p) => p.faction === 'killer');
}

/** 大家都看得见的杀手等级和力量（默认紧凑；点开「查看杀手信息」后放大） */
export function PublicKillerStrip({
  players,
  characters,
  killerLevel,
  killerPower,
  layout,
  compact = false,
  onOpenInfo,
}: {
  players: PublicPlayerView[];
  characters: CharacterDef[];
  killerLevel: number;
  killerPower: string | number;
  layout: SurvivorLayout;
  compact?: boolean;
  onOpenInfo?: () => void;
}) {
  const killer = killerPlayer(players);
  const ch = characters.find((c) => c.id === killer?.characterId);
  const art = killerArtFor(killer?.characterId ?? null, ch?.name ?? killer?.name);
  const strip = layout.publicStrip;
  return (
    <div className={`public-strip${compact ? ' compact' : ''}`}>
      <button
        type="button"
        className="public-strip-stage"
        onClick={onOpenInfo}
        title={onOpenInfo ? '查看更大的杀手信息' : undefined}
      >
        {art && (
          <img
            className="public-strip-evo"
            src={encodeURI(art.evolution)}
            alt="进化牌"
            draggable={false}
            style={boxStyle(strip.evolution)}
          />
        )}
        <div className="public-strip-num level" style={boxStyle(strip.level)}>
          {killerLevel}
        </div>
        <div className="public-strip-num power" style={boxStyle(strip.power)}>
          {killerPower}
        </div>
      </button>
    </div>
  );
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
  const lockedBoxes = dock.locked?.length ? dock.locked : [{ x: 54, y: 62, w: 12, h: 34 }];

  return (
    <div className="killer-dock">
      <div className="killer-dock-stage">
        {standee && (
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
            <img src={encodeURI(discardSrc)} alt={topDiscard?.name ?? '弃牌'} draggable={false} />
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
              className={`killer-dock-hand${playable && !paying ? ' playable' : ''}${pending || isPayCard ? ' pending' : ''}${isPayPick ? ' pay-pick' : ''}`}
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
    </div>
  );
}
