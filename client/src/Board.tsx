/**
 * 桌子中间那张大地图。
 * 负责画房间、人偶、封堵、响声、修理点、能走的格子高亮。
 * 点房间 = 告诉外面“玩家点了这个房间”（移动或选地点）。
 */
import type { CSSProperties } from 'react';
import type { BlockadeMark, CardDef, Faction, MapDef, MapEdge, MapZone, PublicPlayerView } from './types';
import { killerArtFor, killerStandeeSrc } from './killerArt';
import { survivorArtFor, survivorStandeeSrc, skillCardSrc } from './survivorArt';
import { cardArtSrc, itemArtSrc } from './cardArt';
import { UI } from './uiAssets';
import type { PileKind } from './PileInspect';

interface BoardPlayer extends PublicPlayerView {
  placed?: boolean;
}

interface BoardProps {
  map: MapDef;
  players: BoardPlayer[];
  youId: string;
  viewerFaction: Faction | null;
  legalMoves: string[];
  highlightRoomIds?: string[];
  firecrackerRoomId?: string | null;
  suitcaseAvailable?: boolean;
  noises: string[];
  blockades?: string[];
  previewPath?: string[];
  repairProgress?: number;
  showRepair?: boolean;
  repairGuessable?: boolean;
  onRepairGuess?: (value: number) => void;
  onSkillClick?: (src: string, caption: string) => void;
  stealthRoomId?: string | null;
  trapRoomIds?: string[];
  rescueArmed?: boolean;
  rescueCountdown?: number | null;
  onRoomClick: (roomId: string) => void;
  pileCounts?: {
    search: number;
    discovery: number;
    treasure: number;
    discard: number;
  };
  pileCards?: {
    search: Array<{ id: string; name: string }>;
    discovery: Array<{ id: string; name: string }>;
    treasure: Array<{ id: string; name: string }>;
    discard: Array<{ id: string; name: string }>;
  };
  pileTops?: {
    search: { id: string; name: string } | null;
    discovery: { id: string; name: string } | null;
    treasure: { id: string; name: string } | null;
    discard: { id: string; name: string } | null;
  };
  cardById?: Record<string, CardDef>;
  pickableSurvivorIds?: string[];
  selectedSurvivorId?: string | null;
  activePlayerId?: string | null;
  onSurvivorClick?: (playerId: string) => void;
  onPileClick?: (kind: PileKind) => void;
  turnOrder?: string[];
}

const OVERLAY_ZONE_IDS = new Set([
  'search',
  'discovery',
  'treasure',
  'discard',
  'skill1',
  'skill2',
  'skill3',
]);

function doorKey(a: string, b: string) {
  return a < b ? `${a}|${b}` : `${b}|${a}`;
}

function isDoorPath(pathType?: string) {
  return !pathType || pathType === 'door';
}

function blockadeMarkFor(edge: MapEdge, faction: Faction | null): BlockadeMark | undefined {
  const side = faction === 'killer' ? 'killer' : 'survivor';
  return edge.blockade?.[side];
}

function hexToRgba(hex: string, alpha: number) {
  const h = hex.replace('#', '');
  const n = parseInt(h.length === 3 ? h.split('').map((c) => c + c).join('') : h, 16);
  const r = (n >> 16) & 255;
  const g = (n >> 8) & 255;
  const b = n & 255;
  return `rgba(${r},${g},${b},${alpha})`;
}

function zoneVisible(zone: Pick<MapZone, 'side'>, faction: Faction | null) {
  const side = zone.side ?? 'survivor';
  if (side === 'both') return true;
  if (faction === 'killer') return side === 'killer';
  return side === 'survivor';
}

function tokenRescueStep(id: string): number | null {
  const m = /^rescue(\d+)/.exec(id);
  if (!m) return null;
  const n = Number(m[1]);
  return Number.isFinite(n) ? n : null;
}

/** 求生者 repair1…5；杀手地图猜测齿轮 krepair1…5 */
function tokenRepairStep(id: string): number | null {
  const m = /^(?:k)?repair(\d+)$/.exec(id);
  if (!m) return null;
  const n = Number(m[1]);
  return Number.isFinite(n) ? n : null;
}

function isKillerRepairToken(t: { id: string; side?: string }) {
  return t.id.startsWith('krepair') || t.side === 'killer';
}

function isSuitcaseToken(t: { id: string; kind: string }) {
  return (
    t.kind === 'suitcase' ||
    t.kind === '手提箱' ||
    t.kind === '手提箱已用' ||
    t.id === 'suitcaseOpen' ||
    t.id === 'suitcaseUsed'
  );
}

function isUsedSuitcaseToken(t: { id: string; kind: string }) {
  return t.id === 'suitcaseUsed' || t.kind === '手提箱已用' || /used|已用/i.test(`${t.id}${t.kind}`);
}

function tokenTransform(x: number, y: number, w: number, h: number, rotation = 0) {
  const cx = x + w / 2;
  const cy = y + h / 2;
  return `translate(${cx} ${cy}) rotate(${rotation}) translate(${-w / 2} ${-h / 2})`;
}

const STANDEE_H = 68;
const SURVIVOR_STANDEE_W = Math.round(STANDEE_H * (489 / 781));
const KILLER_STANDEE_W = Math.round(STANDEE_H * (934 / 1040));

function standeeFor(
  p: BoardPlayer,
  viewerFaction: Faction | null,
): { src: string; w: number; h: number } | null {
  if (!p.alive || !p.roomId) return null;
  if (p.faction === 'killer') {
    if (p.stealth && viewerFaction !== 'killer') return null;
    const src = killerStandeeSrc(killerArtFor(p.characterId, p.name));
    if (!src) return null;
    return { src, w: KILLER_STANDEE_W, h: STANDEE_H };
  }
  const src = survivorStandeeSrc(survivorArtFor(p.characterId, p.name));
  if (!src) return null;
  return { src, w: SURVIVOR_STANDEE_W, h: STANDEE_H };
}

export function Board({
  map,
  players,
  youId,
  viewerFaction,
  legalMoves,
  highlightRoomIds = [],
  firecrackerRoomId = null,
  suitcaseAvailable = true,
  noises,
  blockades = [],
  previewPath = [],
  repairProgress = 0,
  showRepair = false,
  repairGuessable = false,
  onRepairGuess,
  onSkillClick,
  stealthRoomId = null,
  trapRoomIds = [],
  rescueArmed = false,
  rescueCountdown = null,
  onRoomClick,
  pileCounts,
  pileCards,
  pileTops,
  cardById = {},
  pickableSurvivorIds = [],
  selectedSurvivorId = null,
  activePlayerId = null,
  onSurvivorClick,
  onPileClick,
  turnOrder = [],
}: BoardProps) {
  const roomMap = new Map(map.rooms.map((r) => [r.id, r]));
  const you = players.find((p) => p.id === youId);
  const bg =
    viewerFaction === 'killer'
      ? map.backgrounds?.killer
      : map.backgrounds?.survivor ?? map.backgrounds?.killer;
  const zones = (map.zones ?? []).filter(
    (z) => zoneVisible(z, viewerFaction) && !OVERLAY_ZONE_IDS.has(z.id),
  );
  const previewRoomId = previewPath.length ? previewPath[previewPath.length - 1] : null;
  const previewPts = previewPath
    .map((id) => roomMap.get(id))
    .filter((r): r is NonNullable<typeof r> => Boolean(r));

  return (
    <div className="board-wrap">
      <div className="map-stage">
      {bg && <img className="map-bg" src={encodeURI(bg)} alt={map.name} draggable={false} />}
      <svg
        className="map-svg"
        viewBox={`0 0 ${map.width} ${map.height}`}
        preserveAspectRatio="none"
        role="img"
        aria-label={map.name}
      >
        {zones.map((z) =>
          z.shape === 'circle' ? (
            <g key={z.id} className="map-zone" pointerEvents="none">
              <circle
                cx={z.x}
                cy={z.y}
                r={z.r ?? 20}
                fill={hexToRgba(z.color, 0.22)}
                stroke={z.color}
                strokeWidth={2}
              />
              {z.label ? (
                <text className="zone-label" x={z.x} y={(z.y ?? 0) + (z.r ?? 20) + 12} fill={z.color} textAnchor="middle">
                  {z.label}
                </text>
              ) : null}
              {showRepair &&
                /^repair\d+$/.test(z.id) &&
                (tokenRepairStep(z.id) ?? 0) <= repairProgress &&
                (tokenRepairStep(z.id) ?? 0) > 0 &&
                !(map.tokens ?? []).some((t) => t.id === z.id && t.kind === 'repair' && (t.side ?? 'survivor') !== 'killer') && (
                <image
                  href={encodeURI(UI.repair)}
                  x={z.x - 14}
                  y={z.y - 14}
                  width={28}
                  height={28}
                  pointerEvents="none"
                />
              )}
              {repairGuessable && /^repair\d+$/.test(z.id) && (
                <circle
                  cx={z.x}
                  cy={z.y}
                  r={z.r ?? 20}
                  fill="transparent"
                  pointerEvents="auto"
                  style={{ cursor: 'pointer' }}
                  onClick={(e) => {
                    e.stopPropagation();
                    const n = tokenRepairStep(z.id);
                    if (n != null) onRepairGuess?.(n);
                  }}
                />
              )}
            </g>
          ) : (
            <g key={z.id} className="map-zone" pointerEvents="none">
              <rect
                x={z.x}
                y={z.y}
                width={z.w ?? 40}
                height={z.h ?? 40}
                rx={6}
                fill={hexToRgba(z.color, 0.22)}
                stroke={z.color}
                strokeWidth={2}
              />
              {z.label ? (
                <text
                  className="zone-label"
                  x={z.x + (z.w ?? 40) / 2}
                  y={z.y + (z.h ?? 40) / 2 + 4}
                  fill={z.color}
                  textAnchor="middle"
                >
                  {z.label}
                </text>
              ) : null}
            </g>
          ),
        )}

        {map.edges.map((e, i) => {
          const a = roomMap.get(e.from);
          const b = roomMap.get(e.to);
          if (!a || !b) return null;
          const door = isDoorPath(e.pathType);
          const blocked = door && blockades.includes(doorKey(e.from, e.to));
          const mark = blocked ? blockadeMarkFor(e, viewerFaction) : undefined;
          const bw = mark?.w ?? 44;
          const bh = mark?.h ?? 22;
          const x = mark ? mark.x : (a.x + b.x) / 2 - bw / 2;
          const y = mark ? mark.y : (a.y + b.y) / 2 - bh / 2;
          const angle =
            mark?.rotation ?? (Math.atan2(b.y - a.y, b.x - a.x) * 180) / Math.PI;
          return (
            <g key={`${e.from}-${e.to}-${i}`}>
              <line
                className={`edge-line ${e.pathType === 'dash' ? 'dash' : e.pathType === 'killer' ? 'killer' : 'door'}`}
                x1={a.x}
                y1={a.y}
                x2={b.x}
                y2={b.y}
              />
              {blocked && (
                <image
                  href={encodeURI(UI.blockade)}
                  width={bw}
                  height={bh}
                  transform={tokenTransform(x, y, bw, bh, angle)}
                  pointerEvents="none"
                />
              )}
            </g>
          );
        })}

        {(map.passages ?? []).map((e, i) => {
          const a = roomMap.get(e.from);
          const b = roomMap.get(e.to);
          if (!a || !b) return null;
          return (
            <line
              key={`p-${e.from}-${e.to}-${i}`}
              className="edge-line passage"
              x1={a.x}
              y1={a.y}
              x2={b.x}
              y2={b.y}
            />
          );
        })}

        {(map.tokens ?? [])
          .filter((t) => zoneVisible(t, viewerFaction))
          .filter((t) => {
            if (t.kind === 'stealth' || t.kind === 'blockade' || t.kind === '封堵') return false;
            if (isSuitcaseToken(t)) {
              return isUsedSuitcaseToken(t) ? !suitcaseAvailable : suitcaseAvailable;
            }
            if (t.kind === 'repair') {
              if (!showRepair) return false;
              const n = tokenRepairStep(t.id);
              return n != null && n > 0 && n <= repairProgress;
            }
            if (t.kind === 'rescue') {
              // 杀手地图用齿轮记猜测修理，不显示警车。
              if (viewerFaction === 'killer' || t.side === 'killer') return false;
              if (!rescueArmed || rescueCountdown == null) return false;
              const step = tokenRescueStep(t.id);
              if (step == null) return false;
              return step === rescueCountdown;
            }
            return true;
          })
          .map((t) => (
            <image
              key={`tok-${t.id}`}
              href={encodeURI(t.src)}
              width={t.w}
              height={t.h}
              transform={tokenTransform(t.x, t.y, t.w, t.h, t.rotation ?? 0)}
              pointerEvents="none"
            />
          ))}

        {repairGuessable &&
          (map.tokens ?? [])
            .filter((t) => zoneVisible(t, viewerFaction) && t.kind === 'repair' && isKillerRepairToken(t))
            .map((t) => {
              const n = tokenRepairStep(t.id);
              if (n == null) return null;
              return (
                <rect
                  key={`guess-${t.id}`}
                  x={t.x}
                  y={t.y}
                  width={t.w}
                  height={t.h}
                  fill="transparent"
                  pointerEvents="auto"
                  style={{ cursor: 'pointer' }}
                  onClick={(e) => {
                    e.stopPropagation();
                    onRepairGuess?.(n);
                  }}
                />
              );
            })}

        {previewPts.length > 1 && (
          <polyline
            className="preview-path"
            fill="none"
            points={previewPts.map((r) => `${r.x},${r.y}`).join(' ')}
          />
        )}

        {map.rooms.map((room) => {
          const legal = legalMoves.includes(room.id);
          const colorHit = highlightRoomIds.includes(room.id);
          const noise = noises.includes(room.id);
          const firecrackerHere = firecrackerRoomId === room.id;
          const blocked = blockades.some((id) => id.includes(room.id));
          const here = you?.roomId === room.id && !previewRoomId;
          const previewHere = previewRoomId === room.id;
          const occupants = players.filter((p) => p.roomId === room.id && p.alive);
          const standees = occupants
            .map((p) => {
              const art = standeeFor(p, viewerFaction);
              return art ? { p, ...art } : null;
            })
            .filter((x): x is NonNullable<typeof x> => Boolean(x));
          const name = viewerFaction === 'killer' && room.nameKiller ? room.nameKiller : room.name;
          const label = name.startsWith(room.id) ? name : `${room.id}${name}`;
          return (
            <g key={room.id} onClick={() => onRoomClick(room.id)}>
              <circle
                className={`room-node${legal ? ' legal' : ' clickable'}${colorHit ? ' sense-color' : ''}${noise ? ' noise' : ''}${blocked ? ' blocked' : ''}${here ? ' here' : ''}${previewHere ? ' preview' : ''}`}
                cx={room.x}
                cy={room.y}
                r={18}
              />
              <text className="room-label" x={room.x} y={room.y + 4} textAnchor="middle">
                {label}
              </text>
              <text className="room-tag" x={room.x} y={room.y + 22} textAnchor="middle">
                {[
                  room.tags.includes('repairable') ? '⚙' : '',
                  room.tags.includes('searchable') ? '🔑' : '',
                  room.tags.includes('hiddenExit') ? '⎋' : '',
                  room.tags.includes('entrance') ? '⌂' : '',
                  blocked ? '▣' : '',
                ].join('')}
              </text>
              {standees.map((s, idx) => {
                const n = standees.length;
                const gap = s.w * 0.62;
                const cx = room.x + (idx - (n - 1) / 2) * gap;
                const x = cx - s.w / 2;
                const y = room.y - s.h + 12;
                const pickable = pickableSurvivorIds.includes(s.p.id) && s.p.faction === 'survivor';
                const acting = s.p.id === activePlayerId;
                return (
                  <g
                    key={s.p.id}
                    className={`map-standee${s.p.id === youId ? ' mine' : ''}${acting ? ' acting' : ''}${s.p.placed ? ' placed' : ''}${pickable ? ' pickable' : ''}${selectedSurvivorId === s.p.id ? ' picked' : ''}${s.p.actedThisRound ? ' acted' : ''}`}
                    pointerEvents={pickable ? 'auto' : 'none'}
                    onClick={
                      pickable
                        ? (e) => {
                            e.stopPropagation();
                            onSurvivorClick?.(s.p.id);
                          }
                        : undefined
                    }
                    style={pickable ? { cursor: 'pointer' } : undefined}
                  >
                    <image
                      href={encodeURI(s.src)}
                      width={s.w}
                      height={s.h}
                      x={x}
                      y={y}
                    />
                    {(acting || s.p.id === youId) && (
                      <rect
                        className={acting ? 'standee-acting' : 'standee-you'}
                        x={x - 1}
                        y={y - 1}
                        width={s.w + 2}
                        height={s.h + 2}
                        rx={2}
                      />
                    )}
                  </g>
                );
              })}
              {firecrackerHere && (
                <image
                  href={encodeURI(UI.firecrackerNoise)}
                  x={room.x - 16}
                  y={room.y - 42}
                  width={32}
                  height={32}
                  pointerEvents="none"
                />
              )}
              {noise && (
                <image
                  href={encodeURI(UI.noise)}
                  x={room.x + 14}
                  y={room.y - 28}
                  width={22}
                  height={20}
                />
              )}
              {stealthRoomId === room.id && (() => {
                const tok = (map.tokens ?? []).find((t) => t.kind === 'stealth');
                const tw = tok?.w ?? 32;
                const th = tok?.h ?? 32;
                const x = room.x + 22;
                const y = room.y - th / 2;
                return (
                  <image
                    href={encodeURI(tok?.src ?? UI.stealth)}
                    width={tw}
                    height={th}
                    transform={tokenTransform(x, y, tw, th, 0)}
                  />
                );
              })()}
              {trapRoomIds.includes(room.id) && (
                <image
                  href={encodeURI(UI.trap)}
                  width={36}
                  height={36}
                  x={room.x - 18}
                  y={room.y + 20}
                  pointerEvents="none"
                />
              )}
              {previewHere && (
                <text className="token preview-token" x={room.x} y={room.y + 32} textAnchor="middle">
                  预览
                </text>
              )}
            </g>
          );
        })}
      </svg>
      <MapPileOverlays
        map={map}
        viewerFaction={viewerFaction}
        players={players}
        turnOrder={turnOrder}
        pileCounts={pileCounts}
        pileCards={pileCards}
        pileTops={pileTops}
        cardById={cardById}
        onPileClick={onPileClick}
        onSkillClick={onSkillClick}
      />
      </div>
    </div>
  );
}

function zoneBoxStyle(map: MapDef, z: MapZone): CSSProperties {
  return {
    left: `${(z.x / map.width) * 100}%`,
    top: `${(z.y / map.height) * 100}%`,
    width: `${((z.w ?? 80) / map.width) * 100}%`,
    height: `${((z.h ?? 80) / map.height) * 100}%`,
  };
}

function MapPileOverlays({
  map,
  viewerFaction,
  players,
  turnOrder,
  pileCounts,
  pileCards,
  pileTops,
  cardById,
  onPileClick,
  onSkillClick,
}: {
  map: MapDef;
  viewerFaction: Faction | null;
  players: BoardPlayer[];
  turnOrder: string[];
  pileCounts?: BoardProps['pileCounts'];
  pileCards?: BoardProps['pileCards'];
  pileTops?: BoardProps['pileTops'];
  cardById: Record<string, CardDef>;
  onPileClick?: (kind: PileKind) => void;
  onSkillClick?: (src: string, caption: string) => void;
}) {
  const zones = map.zones ?? [];
  const survivors = (turnOrder.length
    ? turnOrder.map((id) => players.find((p) => p.id === id)).filter((p): p is BoardPlayer => Boolean(p))
    : players
  ).filter((p) => p.faction === 'survivor');
  const skillZones = ['skill1', 'skill2', 'skill3']
    .map((id) => zones.find((z) => z.id === id))
    .filter((z): z is MapZone => Boolean(z && zoneVisible(z, viewerFaction)));

  const pileDefs: Array<{
    id: 'search' | 'discovery' | 'treasure' | 'discard';
    kind: PileKind;
    count: number;
  }> = [
    { id: 'search', kind: 'search', count: pileCounts?.search ?? 0 },
    { id: 'discovery', kind: 'discovery', count: pileCounts?.discovery ?? 0 },
    { id: 'treasure', kind: 'treasure', count: pileCounts?.treasure ?? 0 },
    { id: 'discard', kind: 'discard', count: pileCounts?.discard ?? 0 },
  ];

  const topDiscard = pileTops?.discard ?? pileCards?.discard?.[0];
  const discardSrc = topDiscard
    ? (cardArtSrc(cardById[topDiscard.id], topDiscard.id) ?? itemArtSrc(topDiscard.id))
    : undefined;

  return (
    <>
      {pileDefs.map((pile) => {
        const z = zones.find((zone) => zone.id === pile.id);
        if (!z || !zoneVisible(z, viewerFaction)) return null;
        return (
          <button
            key={pile.id}
            type="button"
            className="map-pile"
            style={zoneBoxStyle(map, z)}
            onClick={() => onPileClick?.(pile.kind)}
            title={z.label ?? pile.id}
          >
            <div className="map-pile-art">
              {pile.id === 'search' && pile.count > 0 && (
                <>
                  {pile.count > 1 && (
                    <img className="map-pile-back under" src={encodeURI(UI.searchBackLast)} alt="" draggable={false} />
                  )}
                  <img
                    className="map-pile-back"
                    src={encodeURI(pile.count === 1 ? UI.searchBackLast : UI.searchBack)}
                    alt="搜索牌堆"
                    draggable={false}
                  />
                </>
              )}
              {pile.id === 'discovery' && pile.count > 0 && (
                <>
                  {pile.count > 1 && (
                    <img className="map-pile-back under" src={encodeURI(UI.discoveryBack)} alt="" draggable={false} />
                  )}
                  <img
                    className="map-pile-back"
                    src={encodeURI(UI.discoveryBack)}
                    alt="发现牌堆"
                    draggable={false}
                  />
                </>
              )}
              {pile.id === 'discard' && discardSrc && (
                <img className="map-pile-back" src={encodeURI(discardSrc)} alt={topDiscard?.name ?? '弃牌'} draggable={false} />
              )}
            </div>
            <span className="map-pile-count">{pile.count}</span>
          </button>
        );
      })}
      {skillZones.map((z, i) => {
        const p = survivors[i];
        const src = p ? skillCardSrc(survivorArtFor(p.characterId, p.name)) : null;
        if (!src) return null;
        return (
          <button
            key={z.id}
            type="button"
            className="map-skill-card"
            style={{ ...zoneBoxStyle(map, z), cursor: onSkillClick ? 'zoom-in' : 'default' }}
            onClick={() => onSkillClick?.(src, `${p?.name ?? '求生者'}技能`)}
          >
            <img src={encodeURI(src)} alt={`${p?.name ?? ''}技能`} draggable={false} />
          </button>
        );
      })}
    </>
  );
}
