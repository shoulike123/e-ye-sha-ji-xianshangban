/**
 * 翻开某个牌堆看看里面有什么。
 * 杀手摸牌堆对幸存者是牌背；弃牌堆从晚到早排，方便找到刚丢掉的牌。
 *
 * ⚠️ 未翻开的摸牌堆（搜索/发现/杀手摸牌）列表是**按牌名排序**的，
 * 服务端不会把真实牌序发出来，所以看这个列表推断不出下一张摸到什么。
 */
import { cardArtSrc, itemArtSrc } from './cardArt';
import type { CardDef } from './types';

/** 哪一种牌堆：搜索、发现、弃牌、杀手摸/弃 */
export type PileKind = 'search' | 'discovery' | 'treasure' | 'discard' | 'killerDraw' | 'killerDiscard';

const PILE_TITLE: Record<PileKind, string> = {
  search: '搜索牌堆',
  discovery: '发现牌堆',
  treasure: '宝藏牌堆',
  discard: '弃牌堆（最近的在前）',
  killerDraw: '杀手摸牌堆',
  killerDiscard: '杀手弃牌堆（最近的在前）',
};

/** 这些堆是「未翻开的摸牌堆」：只能看有哪些牌，看不到顺序 */
const SORTED_BY_NAME: ReadonlySet<PileKind> = new Set<PileKind>([
  'search',
  'discovery',
  'treasure',
  'killerDraw',
]);

export function PileInspect({
  kind,
  cards,
  hidden,
  cardById,
  onCardClick,
  onClose,
}: {
  kind: PileKind;
  cards: Array<{ id: string; name: string }>;
  hidden?: boolean;
  cardById: Record<string, CardDef>;
  /** 点某一张牌：交给上层弹放大图 */
  onCardClick?: (cardId: string) => void;
  onClose: () => void;
}) {
  return (
    <div className="pile-inspect-mask" onClick={onClose} role="presentation">
      <div
        className="pile-inspect"
        role="dialog"
        aria-label={PILE_TITLE[kind]}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="pile-inspect-head">
          <strong>{PILE_TITLE[kind]}</strong>
          <button type="button" onClick={onClose}>
            关闭
          </button>
        </div>
        {hidden ? (
          <p className="muted">剩余牌面仅本阵营可见。</p>
        ) : cards.length === 0 ? (
          <p className="muted">空</p>
        ) : (
          <>
            {SORTED_BY_NAME.has(kind) && (
              <p className="muted">以下按牌名排列，与摸牌顺序无关。</p>
            )}
            <div className="pile-inspect-list">
              {cards.map((c, i) => {
                const src = cardArtSrc(cardById[c.id], c.id) ?? itemArtSrc(c.id);
                const canZoom = Boolean(onCardClick);
                return (
                  <button
                    key={`${c.id}-${i}`}
                    type="button"
                    className="pile-inspect-row"
                    onClick={canZoom ? () => onCardClick!(c.id) : undefined}
                    disabled={!canZoom}
                    title={canZoom ? '点击放大查看' : undefined}
                    style={canZoom ? { cursor: 'zoom-in' } : undefined}
                  >
                    {src ? <img src={encodeURI(src)} alt="" draggable={false} /> : null}
                    <span>
                      {i + 1}. {c.name}
                    </span>
                  </button>
                );
              })}
            </div>
          </>
        )}
      </div>
    </div>
  );
}
