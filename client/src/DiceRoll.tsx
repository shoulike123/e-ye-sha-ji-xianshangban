/**
 * 掷骰子动画。服务器已经算好点数，这里只是把筛子转一转给大家看。
 * 当前遭遇主要用物品加防，这套动画留给以后或特殊效果。
 */
import { useEffect, useMemo, useState } from 'react';
import type { DiceRoll as DiceRollData } from './types';
import { DICE_FACES } from './uiAssets';

const LAND: Record<number, string> = {
  0: 'rotateX(0deg) rotateY(0deg)',
  1: 'rotateX(0deg) rotateY(180deg)',
  2: 'rotateX(0deg) rotateY(-90deg)',
  3: 'rotateX(0deg) rotateY(90deg)',
  4: 'rotateX(-90deg) rotateY(0deg)',
  5: 'rotateX(90deg) rotateY(0deg)',
};

/** 找到一张“点数等于 value”的骰子面，尽量不重复用同一张画 */
function faceIndexForValue(value: number, used: boolean[]): number {
  const hits = DICE_FACES.map((f, i) => (f.value === value && !used[i] ? i : -1)).filter((i) => i >= 0);
  const pick = hits[Math.floor(Math.random() * Math.max(hits.length, 1))] ?? DICE_FACES.findIndex((f) => f.value === value);
  if (pick >= 0) used[pick] = true;
  return pick < 0 ? 0 : pick;
}

/** 屏幕中间弹出骰子，转一会儿再停，几秒后自己消失 */
export function DiceOverlay({ roll }: { roll: DiceRollData | null }) {
  const [shown, setShown] = useState<DiceRollData | null>(null);
  const [rolling, setRolling] = useState(false);

  useEffect(() => {
    if (!roll) return;
    setShown(roll);
    setRolling(true);
    const t = window.setTimeout(() => setRolling(false), 1400);
    const hide = window.setTimeout(() => setShown(null), 4200);
    return () => {
      window.clearTimeout(t);
      window.clearTimeout(hide);
    };
  }, [roll?.id]);

  if (!shown) return null;

  return (
    <div className="dice-overlay" aria-live="polite">
      <DiceTray values={shown.values} seed={shown.id} rolling={rolling} />
      {!rolling && (
        <div className="dice-caption">
          {shown.survivorName} {shown.values.join(' + ')} = {shown.total}
          {shown.success ? ' · 防住' : ` · 未过 ${shown.attack}`}
        </div>
      )}
    </div>
  );
}

/**
 * 一排 3D 骰子。
 * `selectable` 时每颗可点选（再点一次取消），选中的外轮廓高亮 —— 「鸿运当骰」重掷用。
 */
export function DiceTray({
  values,
  seed,
  rolling = false,
  selectable = false,
  selected = [],
  onToggle,
}: {
  values: number[];
  seed: number | string;
  rolling?: boolean;
  selectable?: boolean;
  selected?: number[];
  onToggle?: (index: number) => void;
}) {
  const faces = useMemo(() => {
    const used = DICE_FACES.map(() => false);
    return values.map((v) => faceIndexForValue(v, used));
  }, [values.join(','), seed]);

  return (
    <div className="dice-tray">
      {faces.map((fi, i) => {
        const picked = selected.includes(i);
        return (
          <div
            key={`${seed}-${i}`}
            className={`dice-wrap${selectable ? ' dice-pick' : ''}${picked ? ' dice-picked' : ''}`}
            onClick={selectable && onToggle ? () => onToggle(i) : undefined}
            role={selectable ? 'button' : undefined}
            title={selectable ? (picked ? '再点一次取消' : '点选这颗骰子重掷') : undefined}
          >
            <div
              className={`dice-cube${rolling ? ' rolling' : ' landed'}`}
              style={{ ['--land' as string]: LAND[fi] }}
            >
              {DICE_FACES.map((f, idx) => (
                <div
                  key={f.src}
                  className={`dice-face df-${idx}`}
                  style={{ backgroundImage: `url(${encodeURI(f.src)})` }}
                />
              ))}
            </div>
          </div>
        );
      })}
    </div>
  );
}
