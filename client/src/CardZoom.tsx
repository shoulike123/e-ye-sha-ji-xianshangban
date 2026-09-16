/**
 * 点卡牌后的放大镜：大图 + 名字 + 能不能打出。
 * 点周围黑底或关闭就会收起来。
 */
import { cardArtSrc, cardHandCost } from './cardArt';
import type { CardDef } from './types';

/** 这张杀手牌是快速、慢速还是特殊 */
export function killerActionKind(card: CardDef | undefined | null): string | null {
  if (!card) return null;
  if (card.speed === 'fast') return '快速行动';
  if (card.speed === 'slow') return '慢速行动';
  if (card.speed === 'special') return '特殊行动';
  return card.type === 'killerAction' ? '行动' : null;
}

export function CardZoom({
  card,
  cardId,
  src,
  caption,
  canPlay,
  playHint,
  size = 'card',
  fallbackName,
  onPlay,
  onClose,
}: {
  card?: CardDef | null;
  cardId?: string;
  src?: string | null;
  caption?: string | null;
  canPlay?: boolean;
  playHint?: string | null;
  /** card=普通卡牌尺寸；art=整张立绘/技能图/牌堆里的牌面，放大显示 */
  size?: 'card' | 'art';
  /** cardById 里查不到定义时（例如牌堆里的牌）用来显示名字 */
  fallbackName?: string | null;
  onPlay?: () => void;
  onClose: () => void;
}) {
  const art = src ?? cardArtSrc(card ?? undefined, cardId);
  const name = card?.name ?? fallbackName ?? caption ?? cardId ?? '卡牌';
  const kind = killerActionKind(card);
  const cost = cardHandCost(card);
  return (
    <div className="card-zoom-mask" onClick={onClose} role="presentation">
      <div
        className={`card-zoom${size === 'art' ? ' art' : ''}`}
        role="dialog"
        aria-label={name}
        onClick={(e) => e.stopPropagation()}
      >
        {art ? (
          <img className="card-zoom-art" src={encodeURI(art)} alt={name} draggable={false} />
        ) : (
          <div className="card-zoom-art empty">{name}</div>
        )}
        <div className="card-zoom-meta">
          <h3>{name}</h3>
          {caption && caption !== name && <p className="muted">{caption}</p>}
          {kind && (
            <p>
              <span className="muted">行动</span> {kind}
            </p>
          )}
          {card && cost > 0 && (
            <p>
              <span className="muted">消耗</span> {cost} 张手牌
            </p>
          )}
          {card?.text && (
            <p className="card-zoom-effect">
              <span className="muted">效果</span> {card.text}
            </p>
          )}
          {playHint && <p className="muted">{playHint}</p>}
        </div>
        <div className="card-zoom-actions">
          {onPlay && (
            <button type="button" className="primary" disabled={!canPlay} onClick={onPlay}>
              打出
            </button>
          )}
          <button type="button" onClick={onClose}>
            关闭
          </button>
        </div>
      </div>
    </div>
  );
}
