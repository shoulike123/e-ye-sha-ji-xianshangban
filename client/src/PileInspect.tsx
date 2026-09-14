/**
 * 翻开某个牌堆看看里面有什么。
 * 杀手摸牌堆对求生者是牌背；弃牌堆从晚到早排，方便找到刚丢掉的牌。
 */
import { cardArtSrc, itemArtSrc } from './cardArt';
import type { CardDef } from './types';

/** 哪一种牌堆：搜索、发现、弃牌、杀手摸/弃 */
export type PileKind = 'search' | 'discovery' | 'treasure' | 'discard' | 'killerDraw' | 'killerDiscard';

const PILE_TITLE: Record<PileKind, string> = {
  search: '搜索牌堆（按名称）',
  discovery: '发现牌堆（按名称）',
  treasure: '宝藏牌堆（按名称）',
  discard: '弃牌堆（从晚到早）',
  killerDraw: '杀手摸牌堆（按名称）',
  killerDiscard: '杀手弃牌堆（从晚到早）',
};

export function PileInspect({
  kind,
  cards,
  hidden,
  cardById,
  onClose,
}: {
  kind: PileKind;
  cards: Array<{ id: string; name: string }>;
  hidden?: boolean;
  cardById: Record<string, CardDef>;
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
          <div className="pile-inspect-list">
            {cards.map((c, i) => {
              const src = cardArtSrc(cardById[c.id], c.id) ?? itemArtSrc(c.id);
              return (
                <div key={`${c.id}-${i}`} className="pile-inspect-row">
                  {src ? <img src={encodeURI(src)} alt="" draggable={false} /> : null}
                  <span>
                    {i + 1}. {c.name}
                  </span>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
