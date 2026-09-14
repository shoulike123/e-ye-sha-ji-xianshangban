/**
 * 对局屏幕：大厅选角 + 开打后的整张桌子。
 *
 * 上半：顶栏、求生者状态、地图。
 * 下半：行动区（一般行动确认后结束小回合；交换/额外随时可用）、装备栏、战报。
 * 网页只负责显示和收集点击，合不合法由服务器裁判。
 */
import { useEffect, useMemo, useRef, useState, type ReactElement } from 'react';
import type { Faction, PublicSnapshot, ClientAction } from './types';
import { Board } from './Board';
import { SurvivorSkillBoards, SurvivorStatusBar } from './SurvivorDock';
import { TrackChips, TrackOverlay, type TrackPanel } from './TableHud';
import { DiceOverlay } from './DiceRoll';
import { DEFAULT_SURVIVOR_LAYOUT, mergeSurvivorLayout, type SurvivorLayout } from './survivorLayout';
import { KillerActionDock } from './KillerDock';
import { PileInspect, type PileKind } from './PileInspect';
import { CardZoom } from './CardZoom';
import { cardArtSrc, cardHandCost, itemArtSrc } from './cardArt';
import { killerArtFor } from './killerArt';
import { shortestPath, passageNeighbors, generalNeighbors, roomsAtDistance } from './mapPath';
import {
  FACTION_LABEL,
  ITEM_LABEL,
  PHASE_LABEL,
  WINNER_LABEL,
  roomDisplayName,
} from './i18n';
import { UI } from './uiAssets';
import { injuredAlliesHere, killerCardBlockedReason, killerBlockadeSkipHint, effectiveCardSpeed, encounterCardAttackBonus } from './cardUse';

interface Props {
  state: PublicSnapshot;
  isHost: boolean;
  error: string | null;
  onAction: (a: ClientAction) => Promise<void>;
  onLeave?: () => void;
}

const DEFENSE_ITEM_HINT: Record<string, { bonus: number; needs?: string; hint: string }> = {
  shortsword: { bonus: 1, hint: '+1 防御（可反复使用）' },
  longsword: { bonus: 3, hint: '+3 防御（杀手抽 1）' },
  lime: { bonus: 2, hint: '+2 防御' },
  axe: { bonus: 1, hint: '+1 防御' },
  revolver: { bonus: 4, needs: 'ammo', hint: '+4 防御（需弹药包，每次弃 1）' },
};

/** 背包里哪些东西遭遇时能拿来加防（左轮须同时有弹药包） */
function usableDefenseItems(items: Record<string, number>): string[] {
  return Object.keys(DEFENSE_ITEM_HINT).filter((id) => {
    if ((items[id] ?? 0) < 1) return false;
    const need = DEFENSE_ITEM_HINT[id]?.needs;
    return !need || (items[need] ?? 0) > 0;
  });
}

const ACTION_SCALE_KEY = 'nh_action_scale';
const ACTION_SCALE_MIN = 0.5;
const ACTION_SCALE_MAX = 1.5;
const ACTION_SCALE_STEP = 0.05;

/** 行动区文字缩放夹在 0.5～1.5 之间，并按 0.05 一格对齐 */
function clampActionScale(n: number): number {
  if (!Number.isFinite(n)) return 1;
  const snapped = Math.round(n / ACTION_SCALE_STEP) * ACTION_SCALE_STEP;
  return Math.min(ACTION_SCALE_MAX, Math.max(ACTION_SCALE_MIN, Number(snapped.toFixed(2))));
}

/** 从浏览器小本本里读出上次调的字号 */
function readActionScale(): number {
  try {
    return clampActionScale(Number(localStorage.getItem(ACTION_SCALE_KEY)));
  } catch {
    return 1;
  }
}

/** 把字号记下来，下次打开网页还是这么大 */
function persistActionScale(n: number): number {
  const next = clampActionScale(n);
  try {
    localStorage.setItem(ACTION_SCALE_KEY, String(next));
  } catch {
    /* ignore quota / private mode */
  }
  return next;
}

/** 选角色大厅：选杀手/求生者、准备、房主开打 */
export function LobbyView({ state, isHost, error, onAction, onLeave }: Props) {
  const killers = state.characters.filter((c) => c.faction === 'killer');
  const survivors = state.characters.filter((c) => c.faction === 'survivor');
  const taken = new Set(
    state.players.map((p) => p.characterId).filter(Boolean) as string[],
  );
  const solo = state.mode === 'solo';
  const duo = state.mode === 'duo';
  const vs2 = state.mode === 'vs2';
  const neededSurv = state.rules.maxSurvivors ?? 3;
  const soloSurvIds = state.soloSurvivorCharacterIds ?? [];
  const soloSurvNames = soloSurvIds
    .map((id) => state.characters.find((c) => c.id === id)?.name ?? id)
    .join('、');
  const multiKillers = state.players.filter((p) => p.faction === 'killer').length;
  const multiSurvs = state.players.filter((p) => p.faction === 'survivor').length;
  const duoKillerReady = Boolean(state.players.find((p) => p.faction === 'killer')?.characterId);
  const rosterOk = solo
    ? Boolean(state.soloKillerCharacterId) && soloSurvIds.length === neededSurv
    : duo
      ? state.players.length === 2 && duoKillerReady && soloSurvIds.length === neededSurv
      : vs2
        ? state.players.length === 3 && duoKillerReady && soloSurvIds.length === neededSurv
        : multiKillers === 1 && multiSurvs === neededSurv;
  const allReady = solo
    ? state.you.ready
    : duo
      ? state.players.length === 2 && state.players.every((p) => p.faction && p.ready)
      : vs2
        ? state.players.length === 3 && state.players.every((p) => p.faction && p.ready)
        : state.players.every((p) => p.faction && p.characterId && p.ready);
  const canStart = rosterOk && allReady;

  return (
    <div className="stack">
      <div className="panel stack">
        <h2>房间 {state.roomCode}</h2>
        <p className="muted">
          {solo
            ? `单人热座：必须选好 1 名杀手和 ${neededSurv} 名求生者。你依次操控三名求生者，再操控杀手。`
            : duo
              ? `1 对 1：两人加入后一人选杀手，一人点选 ${neededSurv} 名求生者并操控她们。同学在同一 WiFi 打开本页，输入房间码 ${state.roomCode} 加入。`
              : vs2
                ? `1VS2：三人加入后一人选杀手，两人点选 ${neededSurv} 名求生者并共控她们。一般行动和额外行动需另一人确认，交换物品不用。同学在同一 WiFi 打开本页，输入房间码 ${state.roomCode} 加入。`
                : `1VS3：必须凑齐 1 名杀手 + ${neededSurv} 名求生者。每人只选并操控自己的角色；求生者只能交出自己的物品，给予或互换需对方确认，栏满只能互换。全员选角并准备后由房主开始。同学在同一 WiFi 打开本页，输入房间码 ${state.roomCode} 加入。`}
          {' '}地图：<strong>{state.map.name}</strong>
        </p>
        <p className="muted">
          阵容 {rosterOk ? '已齐' : '未齐'}：杀手{' '}
          {solo ? (state.soloKillerCharacterId ? 1 : 0) : duo || vs2 ? (duoKillerReady ? 1 : 0) : multiKillers}/1
          ，求生者 {solo || duo || vs2 ? soloSurvIds.length : multiSurvs}/{neededSurv}
        </p>
        {isHost && (
          <div className="row">
            <button
              type="button"
              className={solo ? 'primary' : undefined}
              onClick={() => onAction({ type: 'setMode', mode: 'solo' })}
            >
              单人模式
            </button>
            <button
              type="button"
              className={duo ? 'primary' : undefined}
              onClick={() => onAction({ type: 'setMode', mode: 'duo' })}
            >
              1对1
            </button>
            <button
              type="button"
              className={vs2 ? 'primary' : undefined}
              onClick={() => onAction({ type: 'setMode', mode: 'vs2' })}
            >
              1VS2
            </button>
            <button
              type="button"
              className={!solo && !duo && !vs2 ? 'primary' : undefined}
              onClick={() => onAction({ type: 'setMode', mode: 'multi' })}
            >
              1VS3
            </button>
          </div>
        )}
        <div className="stack">
          {state.players.map((p) => (
            <div key={p.id} className="row">
              <strong>{p.name}</strong>
              {p.faction && (
                <span className={`tag ${p.faction}`}>{FACTION_LABEL[p.faction] ?? p.faction}</span>
              )}
              <span className="muted">
                {solo
                  ? [
                      state.soloKillerCharacterId
                        ? `杀手：${state.characters.find((c) => c.id === state.soloKillerCharacterId)?.name}`
                        : '杀手：未选',
                      soloSurvIds.length ? `求生者：${soloSurvNames}` : '求生者：未选',
                    ].join(' · ')
                  : duo && p.faction === 'survivor'
                    ? soloSurvIds.length
                      ? `求生者：${soloSurvNames}`
                      : '求生者：未选'
                    : vs2 && p.faction === 'survivor'
                      ? soloSurvIds.length
                        ? `共控求生者：${soloSurvNames}`
                        : '求生者：未选'
                    : p.characterId
                      ? state.characters.find((c) => c.id === p.characterId)?.name
                      : '未选角色'}
              </span>
              <span className="tag">{p.ready ? '已准备' : '未准备'}</span>
              {!p.connected && <span className="tag">离线</span>}
            </div>
          ))}
        </div>
      </div>

      {solo ? (
        <div className="lobby-grid">
          <div className="panel stack">
            <h3>选择杀手（1 名）</h3>
            {killers.map((c) => (
              <button
                key={c.id}
                type="button"
                className={`char-pick${state.soloKillerCharacterId === c.id ? ' selected' : ''}`}
                onClick={() => onAction({ type: 'setSoloKiller', characterId: c.id })}
              >
                <strong>{c.name}</strong>
                <div className="muted">{c.description}</div>
              </button>
            ))}
          </div>
          <div className="panel stack">
            <h3>选择求生者（{soloSurvIds.length}/{neededSurv}）</h3>
            <p className="muted">点选最多 {neededSurv} 人，再点一次可取消。</p>
            {survivors.map((c) => (
              <button
                key={c.id}
                type="button"
                className={`char-pick${soloSurvIds.includes(c.id) ? ' selected' : ''}`}
                onClick={() => onAction({ type: 'setSoloSurvivor', characterId: c.id })}
              >
                <strong>{c.name}</strong>
                <div className="muted">{c.description}</div>
              </button>
            ))}
          </div>
        </div>
      ) : (
        <div className="lobby-grid">
          <div className="panel stack">
            <h3>阵营</h3>
            <div className="row">
              <button type="button" onClick={() => onAction({ type: 'setFaction', faction: 'killer' })}>
                杀手
              </button>
              <button
                type="button"
                onClick={() => onAction({ type: 'setFaction', faction: 'survivor' })}
              >
                求生者
              </button>
            </div>
            {(duo || vs2) && (
              <p className="muted">
                {duo
                  ? `一人选杀手并选角色，另一人选求生者并点选 ${neededSurv} 名角色。`
                  : `一人选杀手并选角色，两人选求生者并共同点选 ${neededSurv} 名角色。`}
              </p>
            )}
          </div>

          {(duo || vs2) && state.you.faction === 'survivor' ? (
            <div className="panel stack">
              <h3>选择求生者（{soloSurvIds.length}/{neededSurv}）</h3>
              <p className="muted">
                {duo
                  ? `点选最多 ${neededSurv} 人，再点一次可取消。对局中由你操控这三人。`
                  : `点选最多 ${neededSurv} 人，再点一次可取消。对局中两人一起操控这三人；一般行动和额外行动需另一人确认。`}
              </p>
              {survivors.map((c) => (
                <button
                  key={c.id}
                  type="button"
                  className={`char-pick${soloSurvIds.includes(c.id) ? ' selected' : ''}`}
                  onClick={() => onAction({ type: 'setSoloSurvivor', characterId: c.id })}
                >
                  <strong>{c.name}</strong>
                  <div className="muted">{c.description}</div>
                </button>
              ))}
            </div>
          ) : (
            <div className="panel stack">
              <h3>角色</h3>
              <p className="muted">
                {duo
                  ? '先选杀手阵营，再选 1 名杀手角色。'
                  : vs2
                    ? '先选杀手阵营，再选 1 名杀手角色。求生者那边两人一起点选 3 名角色。'
                    : `先选阵营，再选 1 名角色。1VS3：杀手 1 人、求生者 ${neededSurv} 人，每人只操控自己。`}
              </p>
              {(state.you.faction === 'killer' ? killers : survivors).map((c) => {
                const disabled =
                  state.you.faction !== c.faction ||
                  (taken.has(c.id) && state.you.characterId !== c.id);
                return (
                  <button
                    key={c.id}
                    type="button"
                    className={`char-pick${state.you.characterId === c.id ? ' selected' : ''}`}
                    disabled={disabled}
                    onClick={() => onAction({ type: 'selectCharacter', characterId: c.id })}
                  >
                    <strong>{c.name}</strong>
                    <div className="muted">{c.description}</div>
                  </button>
                );
              })}
              {!state.you.faction && <p className="muted">选择阵营后显示可选角色。</p>}
            </div>
          )}
        </div>
      )}

      <div className="row">
        <button
          type="button"
          onClick={() => onAction({ type: 'setReady', ready: !state.you.ready })}
        >
          {state.you.ready ? '取消准备' : '准备'}
        </button>
        {isHost && (
          <button
            type="button"
            className="primary"
            disabled={!canStart}
            onClick={() => onAction({ type: 'startGame' })}
          >
            开始游戏
          </button>
        )}
        {solo && onLeave && (
          <button type="button" onClick={onLeave}>
            退出主界面
          </button>
        )}
      </div>
      {error && <p className="error">{error}</p>}
      {isHost && !canStart && (
        <p className="muted">
          {solo
            ? `选齐 1 名杀手和 ${neededSurv} 名求生者，并准备后才能开始。`
            : duo
              ? `两人分别选好杀手与 ${neededSurv} 名求生者，并都准备后才能开始。`
              : vs2
                ? `三人：1 名杀手 + 2 名求生者操控者点齐 ${neededSurv} 名角色并都准备后才能开始。`
                : `选齐 1 名杀手和 ${neededSurv} 名求生者，并全员准备后才能开始。`}
        </p>
      )}
    </div>
  );
}

function killerPowerText(state: PublicSnapshot): string {
  if (state.killerPowerLabel) return state.killerPowerLabel;
  const bonus = state.killerTurnPowerBonus ?? 0;
  return bonus > 0 ? `${state.killerPower}+${bonus}` : String(state.killerPower);
}

function suitcaseRoomIdOf(state: PublicSnapshot): string | null {
  const tok = (state.map.tokens ?? []).find(
    (t) => t.kind === 'suitcase' || t.kind === '手提箱' || t.kind === '手提箱已用',
  );
  if (tok?.roomId) return tok.roomId;
  return state.map.id === 'cabin' ? 'R4' : null;
}

function canOpenSuitcase(state: PublicSnapshot, roomId: string | null | undefined): boolean {
  if (state.suitcaseAvailable === false) return false;
  const room = suitcaseRoomIdOf(state);
  if (!room || roomId !== room) return false;
  return (state.pileCounts?.discovery ?? 0) > 0;
}

/** 你现在用哪一边的眼睛看棋盘（求生者看不见杀手潜行位置） */
function viewerFactionOf(state: PublicSnapshot): Faction | null {
  if (state.mode === 'solo') {
    if (
      state.pendingEvolutionAck ||
      state.pendingWhizSearch ||
      state.pendingOverFearWound ||
      state.pendingBlockadeJob
    ) {
      return 'killer';
    }
    // 装备溢出弃装不整页切阵营：杀手回合里仍留在杀手界面，弃装用行动区面板
    if (state.pendingAmulet) return 'survivor';
    if (
      state.phase === 'encounter' &&
      (state.encounter?.step === 'pick' ||
        state.encounter?.step === 'defend' ||
        state.encounter?.step === 'flee')
    ) {
      return 'survivor';
    }
    if (state.phase === 'killerMain' || state.phase === 'encounter' || state.phase === 'noiseReport' || state.phase === 'upkeep') {
      return 'killer';
    }
    return 'survivor';
  }
  if (state.pendingAmulet && state.you.id === state.pendingAmulet.playerId) {
    return 'survivor';
  }
  return state.you.faction;
}

/** 单人热座点行动前弹一句“确定吗”，避免点错角色 */
function confirmAct(label: string): boolean {
  return window.confirm(`确定要${label}？`);
}

/** 杀手视角可以先把求生者立绘摆在地图上（只自己看得见，不算正式位置） */
function readPlacedStandee(key: string): Record<string, string> {
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return {};
    const parsed = JSON.parse(raw) as unknown;
    if (!parsed || typeof parsed !== 'object') return {};
    return parsed as Record<string, string>;
  } catch {
    return {};
  }
}

/** 这个房间有没有被封上的门 */
function roomHasBlockade(blockades: string[], roomId: string | null): boolean {
  if (!roomId) return false;
  return blockades.some((id) => {
    const i = id.indexOf('|');
    if (i < 0) return false;
    return id.slice(0, i) === roomId || id.slice(i + 1) === roomId;
  });
}

/** 把封堵编号 A|B 翻译成“客厅–走廊”这种人话 */
function doorEndsLabel(
  map: PublicSnapshot['map'],
  doorId: string,
  viewerFaction: Faction | null,
): string {
  const i = doorId.indexOf('|');
  if (i < 0) return doorId;
  return `${roomDisplayName(map, doorId.slice(0, i), viewerFaction)}–${roomDisplayName(map, doorId.slice(i + 1), viewerFaction)}`;
}

/** 背包里实际有的物品编号（数量大于 0） */
function ownedItemIds(items: Record<string, number> | undefined): string[] {
  return Object.entries(items ?? {})
    .filter(([id, n]) => n > 0 && id !== 'key')
    .map(([id]) => id);
}

/** 背包占了几格 */
function inventoryUsed(items: Record<string, number> | undefined): number {
  return Object.values(items ?? {}).reduce((n, v) => n + v, 0);
}

/** 开打后的整张桌子：顶栏、地图、行动区、战报、行动规则 */
export function GameView({ state, error, onAction, onLeave }: Props) {
  const [pendingCard, setPendingCard] = useState<string | null>(null);
  const [pendingPayIds, setPendingPayIds] = useState<string[]>([]);
  const [payForCard, setPayForCard] = useState<string | null>(null);
  const [payIds, setPayIds] = useState<string[]>([]);
  const [fleePick, setFleePick] = useState(false);
  const [moveDest, setMoveDest] = useState<string | null>(null);
  const [extraDest, setExtraDest] = useState<string | null>(null);
  const [fleeDest, setFleeDest] = useState<string | null>(null);
  const [blockadeDest, setBlockadeDest] = useState<string | null>(null);
  const standeeSnapKey = useRef<string | null>(null);
  const [pickedNextId, setPickedNextId] = useState<string | null>(null);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [actionScale, setActionScale] = useState(readActionScale);
  const [survLayout, setSurvLayout] = useState<SurvivorLayout>(DEFAULT_SURVIVOR_LAYOUT);
  const [logOpen, setLogOpen] = useState(true);
  const [extraOpen, setExtraOpen] = useState(false);
  const [killerInfoOpen, setKillerInfoOpen] = useState(false);
  const [artZoom, setArtZoom] = useState<{ src: string; caption: string } | null>(null);
  const [defenseItemId, setDefenseItemId] = useState<string | null>(null);
  const [trackOpen, setTrackOpen] = useState<TrackPanel | null>(null);
  const [tradeOpen, setTradeOpen] = useState(false);
  const [rulesOpen, setRulesOpen] = useState(false);
  const [rulesSide, setRulesSide] = useState<'survivor' | 'killer'>('survivor');
  const [placeTargetId, setPlaceTargetId] = useState<string | null>(null);
  const [standeeMoveOn, setStandeeMoveOn] = useState(false);
  const [inspectPile, setInspectPile] = useState<PileKind | null>(null);
  const [inspectCardId, setInspectCardId] = useState<string | null>(null);
  const [evoPayIds, setEvoPayIds] = useState<string[]>([]);
  const [extraPick, setExtraPick] = useState<{
    kind: 'whiskey' | 'adrenaline' | 'sprint';
    rooms: string[];
    actorPlayerId?: string;
  } | null>(null);
  const placeKey = `nh_place_${state.roomCode}_killer`;
  const [placed, setPlaced] = useState<Record<string, string>>(() => readPlacedStandee(placeKey));
  const isActive = state.controllingActive;
  const ch = state.characters.find((c) => c.id === state.you.characterId);
  const enc = state.encounter;
  const viewerFaction = viewerFactionOf(state);

  useEffect(() => {
    setDefenseItemId(null);
    setFleePick(enc?.step === 'flee');
  }, [enc?.targetId, enc?.step]);
  useEffect(() => {
    setEvoPayIds([]);
  }, [state.pendingWhizSearch, state.pendingOverFearWound?.targetId, state.pendingEvolutionAck?.toLevel]);
  const isSurvivorView = viewerFaction === 'survivor';
  const canDraftSurvivorMove =
    isActive &&
    isSurvivorView &&
    state.phase === 'survivorMain' &&
    state.you.faction === 'survivor' &&
    !state.you.mainActionUsed &&
    !state.you.actedThisRound &&
    !pendingCard &&
    !fleePick &&
    !extraPick &&
    !state.pendingAmulet;
  const canDraftKillerMove =
    isActive &&
    !isSurvivorView &&
    state.phase === 'killerMain' &&
    state.you.faction === 'killer' &&
    (state.killerTurnStep ?? 'fast') === 'main' &&
    (state.killerMainChoice ?? null) === 'actions' &&
    state.killerMainActionsLeft > 0 &&
    !state.pendingPathDraft &&
    !state.pendingSensePair &&
    !state.pendingBlockade &&
    !state.pendingBlockadePlace &&
    !state.pendingBlockadeJob &&
    !state.pendingEvolutionAck &&
    !state.pendingWhizSearch &&
    !state.pendingOverFearWound &&
    state.pendingMoveRange == null &&
    !state.pendingSenseColor;
  const canDraftMove = canDraftSurvivorMove || canDraftKillerMove;

  const sharedControl = state.mode === 'solo' || state.mode === 'duo' || state.mode === 'vs2';
  const youMustDiscard = state.pendingItemDiscard?.playerId === state.you.id;
  const canUseOwnExtras =
    isSurvivorView && state.phase === 'survivorMain' && (isActive || !sharedControl);
  const soloHint =
    state.mode === 'solo'
      ? state.pendingSurvivorPick
        ? '单人：在行动区选择下一名求生者（也可点立绘或状态栏），可随时改选，确认后才开始'
        : state.pendingDiscoveryPick
          ? '单人：在行动区选择谁来翻发现牌'
          : state.phase === 'survivorMain' || state.phase === 'discovery'
        ? `单人：当前行动「${state.you.name}」`
        : state.phase === 'noiseReport' ||
            state.phase === 'killerMain' ||
            (state.phase === 'encounter' && enc?.step === 'attack')
          ? '单人：当前操控杀手侧'
          : state.phase === 'encounter'
            ? '单人：遭遇中按提示操作'
            : null
      : state.mode === 'duo'
        ? state.you.faction === 'survivor'
          ? state.pendingSurvivorPick
            ? '1对1：在行动区选择下一名求生者（也可点立绘或状态栏），确认后才开始'
            : state.pendingDiscoveryPick
              ? '1对1：在行动区选择谁来翻发现牌'
              : `1对1：你操控 3 名求生者，当前行动「${state.you.name}」`
          : '1对1：你操控杀手'
        : state.mode === 'vs2'
          ? state.you.faction === 'survivor'
            ? '1VS2：两人共控 3 名求生者。一般行动和额外行动需另一人确认，交换物品不用。'
            : '1VS2：你操控杀手。对面两人共控 3 名求生者。'
          : state.you.faction === 'survivor'
            ? '1VS3：你只操控自己的角色。只能交出自己的物品；给予或互换需对方确认。栏满只能互换。额外行动只显示你能做的。'
            : '1VS3：你操控杀手。对面 3 名求生者各自操作。';

  useEffect(() => {
    setMoveDest(null);
  }, [state.round, state.phase, state.you.id, state.you.roomId, state.you.mainActionUsed]);

  useEffect(() => {
    if (state.phase !== 'survivorMain') {
      setTradeOpen(false);
      setExtraOpen(false);
    }
  }, [state.phase]);

  useEffect(() => {
    if (!state.pendingSurvivorPick && !state.pendingDiscoveryPick) setPickedNextId(null);
  }, [state.pendingSurvivorPick, state.pendingDiscoveryPick, state.round]);

  useEffect(() => {
    setDefenseItemId(null);
  }, [state.phase, enc?.step, state.you.id]);

  useEffect(() => {
    const load = () => {
      fetch('/api/ui/survivor-layout')
        .then((r) => (r.ok ? r.json() : null))
        .then((data: SurvivorLayout | null) => {
          if (data?.statusBar) setSurvLayout(mergeSurvivorLayout(data));
        })
        .catch(() => {
          /* keep defaults */
        });
    };
    load();
    window.addEventListener('focus', load);
    return () => window.removeEventListener('focus', load);
  }, []);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setMoveDest(null);
        setTrackOpen(null);
        setRulesOpen(false);
        setTradeOpen(false);
        setPayForCard(null);
        setPayIds([]);
        setPendingCard(null);
        setPendingPayIds([]);
        setPickedNextId(null);
        setInspectCardId(null);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  useEffect(() => {
    const saved = readPlacedStandee(placeKey);
    const start = state.map.survivorStartRoomId;
    setPlaced((prev) => {
      const next = { ...saved, ...prev };
      let changed = Object.keys(next).length !== Object.keys(prev).length;
      for (const p of state.players) {
        if (p.faction === 'survivor' && !next[p.id]) {
          next[p.id] = start;
          changed = true;
        }
      }
      return changed ? next : prev;
    });
  }, [placeKey, state.map.survivorStartRoomId, state.players]);

  useEffect(() => {
    if (isSurvivorView) return;
    try {
      localStorage.setItem(placeKey, JSON.stringify(placed));
    } catch {
      /* ignore */
    }
  }, [placeKey, placed, isSurvivorView]);

  useEffect(() => {
    if (isSurvivorView) {
      standeeSnapKey.current = null;
      return;
    }
    const enc = state.encounter;
    if (!enc) {
      standeeSnapKey.current = null;
      return;
    }
    const ids = enc.discoveredIds ?? [];
    if (ids.length === 0) return;
    const key = `${enc.roomId}:${ids.join(',')}`;
    if (standeeSnapKey.current === key) return;
    standeeSnapKey.current = key;
    setPlaced((prev) => {
      const next = { ...prev };
      let changed = false;
      for (const id of ids) {
        if (next[id] !== enc.roomId) {
          next[id] = enc.roomId;
          changed = true;
        }
      }
      return changed ? next : prev;
    });
  }, [isSurvivorView, state.encounter]);

  useEffect(() => {
    setExtraDest(null);
  }, [extraPick?.kind, extraPick?.actorPlayerId]);

  useEffect(() => {
    if (!fleePick) setFleeDest(null);
  }, [fleePick]);

  useEffect(() => {
    if (!state.pendingBlockade && !state.pendingBlockadePlace) setBlockadeDest(null);
  }, [state.pendingBlockade, state.pendingBlockadePlace]);

  const placeableSurvivors = useMemo(
    () =>
      isSurvivorView ? [] : state.players.filter((p) => p.alive && p.faction === 'survivor'),
    [state.players, isSurvivorView],
  );

  useEffect(() => {
    if (placeTargetId && placeableSurvivors.some((p) => p.id === placeTargetId)) return;
    setPlaceTargetId(placeableSurvivors[0]?.id ?? null);
  }, [placeableSurvivors, placeTargetId]);

  const displayPlayers = useMemo(() => {
    if (isSurvivorView) return state.players;
    const start = state.map.survivorStartRoomId;
    return state.players.map((p) => {
      if (p.faction !== 'survivor') return p;
      const room = placed[p.id] ?? start;
      return { ...p, roomId: room, placed: true as const };
    });
  }, [state.players, placed, isSurvivorView, state.map.survivorStartRoomId]);

  const defendItemChoices = usableDefenseItems(state.you.items);
  const youHaveTenacity =
    !!ch?.skills.some((s) => s.id === 'tenacity' || s.name.includes('坚韧')) ||
    /威廉/.test(`${ch?.name ?? ''} ${state.you.name}`);
  const startRoom = state.you.roomId;
  const senseFirst = state.pendingSensePair?.firstRoomId;
  const pathDraftRooms = state.pendingPathDraft?.rooms ?? [];
  const previewPath = pathDraftRooms.length
    ? pathDraftRooms
    : senseFirst
      ? state.pendingSensePair?.secondRoomId
        ? [senseFirst, state.pendingSensePair.secondRoomId]
        : [senseFirst]
      : extraDest && extraPick
        ? extraPick.kind === 'whiskey'
          ? [extraDest]
          : startRoom
            ? (shortestPath(state.map, startRoom, extraDest) ?? [startRoom, extraDest])
            : [extraDest]
        : fleeDest && startRoom
          ? (shortestPath(state.map, startRoom, fleeDest) ?? [startRoom, fleeDest])
          : blockadeDest
            ? [blockadeDest]
            : startRoom && moveDest
              ? (shortestPath(state.map, startRoom, moveDest) ?? [startRoom, moveDest])
              : [];
  const youRoom = state.map.rooms.find((r) => r.id === state.you.roomId);
  const killerHere =
    state.players.some(
      (pl) =>
        pl.faction === 'killer' &&
        pl.alive &&
        !pl.stealth &&
        pl.roomId != null &&
        pl.roomId === state.you.roomId,
    ) ||
    Boolean(state.stealthOriginRoomId && state.stealthOriginRoomId === state.you.roomId);
  const canSearchHere = Boolean(youRoom?.tags.includes('searchable')) && !killerHere;
  const canRepairHere =
    Boolean(youRoom?.tags.includes('repairable')) &&
    !state.repairedThisPhase &&
    state.repairProgress < state.rules.repairNeeded &&
    !killerHere;
  const canToolbox =
    canRepairHere &&
    (state.you.items.toolbox ?? 0) > 0 &&
    !state.you.mainActionUsed;
  const canUnblockHere = roomHasBlockade(state.blockades, state.you.roomId);
  const canAxeUnblock = canUnblockHere && (state.you.items.axe ?? 0) > 0;
  const canClearFear = state.rules.enableFear !== false;
  const passageEnds = state.you.roomId ? passageNeighbors(state.map, state.you.roomId) : [];
  const whiskeyRooms = state.you.roomId ? generalNeighbors(state.map, state.you.roomId) : [];
  const adrenalineRooms = state.you.roomId
    ? roomsAtDistance(state.map, state.you.roomId, 1, 1, { blockades: state.blockades })
    : [];
  const sprintRooms = state.you.roomId
    ? roomsAtDistance(state.map, state.you.roomId, 3, 3, { blockades: state.blockades })
    : [];
  const discardList = state.pileCards?.discard ?? state.yourDiscardPile ?? [];
  const discardHasItem = (itemId: string) =>
    discardList.some((c) => {
      if (c.id === itemId) return true;
      return Boolean(
        state.cardById[c.id]?.effects.some((e) => e.op === 'gainItem' && e.itemId === itemId),
      );
    });
  const marcoDiscardHas = {
    adrenaline: discardHasItem('adrenaline'),
    sedative: discardHasItem('sedative'),
  };
  const hasGeneralAction =
    Boolean(state.you.roomId) ||
    canClearFear ||
    (injuredAlliesHere(state).length > 0 &&
      ((state.you.items.herb ?? 0) > 0 || (state.you.items.marco_medkit ?? 0) > 0)) ||
    (Boolean(ch?.skills.some((s) => s.id === 'resourceful')) &&
      !state.you.skillUsedThisTurn.includes('resourceful') &&
      (marcoDiscardHas.adrenaline || marcoDiscardHas.sedative));
  const mustDoGeneral =
    isActive &&
    isSurvivorView &&
    state.phase === 'survivorMain' &&
    !state.pendingSurvivorPick &&
    !state.you.mainActionUsed &&
    !state.you.skillUsedThisTurn.includes('sophia_camera') &&
    hasGeneralAction;

  const placeStandee = (roomId: string) => {
    if (isSurvivorView || !standeeMoveOn) return;
    const target = placeTargetId ?? placeableSurvivors[0]?.id;
    if (!target) return;
    setPlaced((prev) => {
      const next = { ...prev };
      if (next[target] === roomId) delete next[target];
      else next[target] = roomId;
      return next;
    });
  };

  const runSurvivor = async (label: string, action: ClientAction, alreadyConfirmed = false) => {
    if (!alreadyConfirmed && state.mode !== 'vs2' && !confirmAct(label)) return;
    setExtraPick(null);
    await onAction(action);
  };

  const onRoomClick = async (roomId: string) => {
    const toggle = (cur: string | null) => (cur === roomId ? null : roomId);
    if (extraPick) {
      if (!extraPick.rooms.includes(roomId)) return;
      setExtraDest(toggle);
      return;
    }
    if (fleePick && state.phase === 'encounter') {
      if (state.legalMoves.includes(roomId) || roomId === fleeDest) setFleeDest(toggle);
      return;
    }
    const pickingLocation =
      Boolean(state.pendingBlockade) ||
      Boolean(state.pendingBlockadePlace) ||
      Boolean(state.pendingBlockadeJob) ||
      Boolean(state.pendingSensePair) ||
      Boolean(state.pendingPathDraft) ||
      state.pendingMoveRange != null ||
      extraPick ||
      fleePick ||
      canDraftMove;
    if (standeeMoveOn && !isSurvivorView && !pickingLocation) {
      placeStandee(roomId);
      return;
    }
    if (
      state.pendingBlockade ||
      (state.pendingBlockadeJob && state.pendingBlockadeJob.removeLeft > 0)
    ) {
      if (state.legalMoves.includes(roomId) || roomId === blockadeDest) setBlockadeDest(toggle);
      return;
    }
    if (canDraftMove) {
      if (state.legalMoves.includes(roomId) || roomId === moveDest) setMoveDest(toggle);
      return;
    }
    if (isActive && state.legalMoves.includes(roomId)) {
      await onAction({ type: 'move', toRoomId: roomId });
    }
  };

  const confirmMove = async () => {
    if (!moveDest) return;
    const name = roomDisplayName(state.map, moveDest, viewerFaction);
    if (canDraftSurvivorMove && state.mode === 'solo' && !confirmAct(`移动到${name}`)) return;
    await onAction({ type: 'move', toRoomId: moveDest });
    setMoveDest(null);
  };

  const confirmExtraDest = () => {
    if (!extraPick || !extraDest) return;
    if (extraPick.kind === 'sprint') {
      void runSurvivor(`短跑冲刺到${roomDisplayName(state.map, extraDest, viewerFaction)}`, {
        type: 'useSkill',
        skillId: 'sprint',
        toRoomId: extraDest,
        actorPlayerId: extraPick.actorPlayerId,
      });
    } else {
      void runSurvivor(
        extraPick.kind === 'whiskey'
          ? `威士忌扔向${roomDisplayName(state.map, extraDest, viewerFaction)}`
          : `肾上腺素移动到${roomDisplayName(state.map, extraDest, viewerFaction)}`,
        {
          type: 'useItem',
          itemId: extraPick.kind,
          toRoomId: extraDest,
          actorPlayerId: extraPick.actorPlayerId,
        },
      );
    }
    setExtraDest(null);
  };

  const confirmFleeDest = async () => {
    if (!fleeDest) return;
    await onAction({ type: 'encounterFlee', moveToRoomId: fleeDest });
    setFleeDest(null);
    setFleePick(false);
  };

  const confirmBlockadeDest = async () => {
    if (!blockadeDest) return;
    await onAction({ type: 'move', toRoomId: blockadeDest });
    setBlockadeDest(null);
  };

  const noiseNames = state.noises.map((id) => roomDisplayName(state.map, id, viewerFaction)).join('、');
  const killerStep = state.killerTurnStep ?? 'fast';
  const killerChoice = state.killerMainChoice ?? null;
  const discoveryCard = state.lastDiscoveryCardId
    ? state.cardById[state.lastDiscoveryCardId]
    : null;
  const discoveryOptions = state.discoveryOptions ?? [];

  const survivors = (state.turnOrder?.length
    ? state.turnOrder
        .map((id) => state.players.find((p) => p.id === id))
        .filter((p): p is NonNullable<typeof p> => Boolean(p && p.faction === 'survivor'))
    : state.players.filter((p) => p.faction === 'survivor'));
  const tradeGroups = (() => {
    const byRoom = new Map<string, typeof survivors>();
    for (const p of survivors) {
      if (!p.alive || !p.roomId) continue;
      const list = byRoom.get(p.roomId) ?? [];
      list.push(p);
      byRoom.set(p.roomId, list);
    }
    return [...byRoom.entries()]
      .filter(([, list]) => list.length >= 2)
      .filter(([roomId]) => sharedControl || roomId === state.you.roomId)
      .map(([roomId, list]) => ({ roomId, list }));
  })();
  const actingSurvivor =
    state.phase === 'survivorMain' || state.phase === 'discovery'
      ? state.players.find((p) => p.id === state.activePlayerId && p.faction === 'survivor')
      : undefined;
  const canPickSurvivorTurn =
    Boolean(state.pendingSurvivorPick) &&
    isSurvivorView &&
    (sharedControl || state.you.faction === 'survivor');
  /** 已点选但还没做一般行动：其他未行动角色仍可选，方便反复换人 */
  const canRepickSurvivor =
    sharedControl &&
    isSurvivorView &&
    state.phase === 'survivorMain' &&
    Boolean(actingSurvivor) &&
    !actingSurvivor!.mainActionUsed &&
    !actingSurvivor!.actedThisRound;
  const canPickDiscovery =
    Boolean(state.pendingDiscoveryPick) &&
    state.phase === 'discovery' &&
    isSurvivorView &&
    (sharedControl || state.you.faction === 'survivor');
  const pickableSurvivorIds =
    canPickSurvivorTurn || canPickDiscovery || canRepickSurvivor
      ? survivors
          .filter((p) => {
            if (!p.alive) return false;
            if (canPickDiscovery) return true;
            if (!sharedControl && p.id !== state.you.id) return false;
            return !p.actedThisRound;
          })
          .map((p) => p.id)
      : [];
  const showSurvivorPickRow =
    isSurvivorView && (state.pendingSurvivorPick || state.pendingDiscoveryPick || canRepickSurvivor);
  const pickSurvivor = (playerId: string) => {
    if (!pickableSurvivorIds.includes(playerId)) return;
    setPickedNextId(playerId);
    void onAction({ type: 'pickSurvivorTurn', playerId });
  };
  const pileCounts = state.pileCounts;
  const pileCards = state.pileCards;
  const inspectCards =
    inspectPile && pileCards
      ? inspectPile === 'killerDraw'
        ? pileCards.killerDraw
        : inspectPile === 'killerDiscard'
          ? pileCards.killerDiscard
          : pileCards[inspectPile]
      : [];
  const inspectHidden = Boolean(
    inspectPile &&
      pileCounts &&
      inspectCards.length === 0 &&
      ((inspectPile === 'search' && pileCounts.search > 0) ||
        (inspectPile === 'discovery' && pileCounts.discovery > 0) ||
        (inspectPile === 'killerDraw' && pileCounts.killerDraw > 0)),
  );
  const showItems = isSurvivorView;
  const killerHand = state.yourKillerHand ?? [];
  const killerBlockedReasons = useMemo(() => {
    const out: Record<string, string> = {};
    for (const cid of killerHand) {
      const reason = killerCardBlockedReason(state, state.cardById[cid]);
      if (reason) out[cid] = reason;
    }
    return out;
  }, [state, killerHand]);
  const killerPlayable = new Set(
    !isSurvivorView &&
      isActive &&
      (state.phase === 'killerMain' ||
        (state.phase === 'encounter' && enc?.step === 'attack'))
      ? killerHand.filter((cid) => {
          const card = state.cardById[cid];
          if (state.phase === 'encounter') return encounterCardAttackBonus(card) > 0;
          if (state.pendingSenseColor || state.pendingLurkPick || state.pendingAmulet) return false;
          if (
            state.pendingMoveRange != null ||
            state.pendingBlockade ||
            state.pendingBlockadePlace ||
            state.pendingSensePair
          )
            return false;
          const speed = effectiveCardSpeed(state, card);
          if (killerStep === 'fast' && speed !== 'fast') return false;
          if (killerStep === 'main' && (speed !== 'special' || killerChoice === 'actions')) return false;
          if (killerStep === 'slow' && speed !== 'slow') return false;
          if (killerBlockedReasons[cid]) return false;
          const cost = cardHandCost(card);
          return killerHand.length - 1 >= cost;
        })
      : [],
  );
  const killerMainDone =
    killerChoice === 'special' ||
    (killerChoice === 'actions' && (state.killerMainActionsLeft ?? 2) < 2);
  const killerHasPlayableSpecial = [...killerPlayable].some(
    (cid) => effectiveCardSpeed(state, state.cardById[cid]) === 'special',
  );
  const killerHasMainOption = Boolean(state.you.roomId) || (!killerChoice && killerHasPlayableSpecial);
  const canLeaveKillerMain = killerMainDone || !killerHasMainOption;
  const finishKillerPlay = (cid: string, pay: string[]) => {
    const card = state.cardById[cid];
    const skipHint = killerBlockadeSkipHint(state, card);
    if (skipHint && !window.confirm(`${skipHint}。打出后将跳过封堵。确定打出「${card?.name ?? cid}」？`)) {
      return;
    }
    setPayForCard(null);
    setPayIds([]);
    setInspectCardId(null);
    setPendingCard(null);
    setPendingPayIds([]);
    void onAction({ type: 'playKillerCard', cardId: cid, payCardIds: pay });
  };
  const playKillerCard = (cid: string) => {
    if (payForCard) {
      if (cid === payForCard) {
        setPayForCard(null);
        setPayIds([]);
        return;
      }
      const cost = cardHandCost(state.cardById[payForCard]);
      if (payIds.includes(cid)) {
        setPayIds((prev) => prev.filter((id) => id !== cid));
        return;
      }
      if (payIds.length >= cost) return;
      const next = [...payIds, cid];
      setPayIds(next);
      if (next.length === cost) finishKillerPlay(payForCard, next);
      return;
    }
    if (!killerPlayable.has(cid)) return;
    const card = state.cardById[cid];
    const cost = cardHandCost(card);
    const others = killerHand.filter((id) => id !== cid);
    if (cost > others.length) return;
    if (cost === 0 || others.length === cost) {
      finishKillerPlay(cid, cost === 0 ? [] : others);
      return;
    }
    setPendingCard(null);
    setPendingPayIds([]);
    setPayForCard(cid);
    setPayIds([]);
  };

  // 下面开始画桌子：顶栏 → 状态条 → 地图 → 行动按钮
  return (
    <div className="table-layout">
      <div className="stat-bar">
        <span className="stat">
          回合 <strong>{state.round}</strong>
        </span>
        <span className="stat">
          阶段 <strong>{PHASE_LABEL[state.phase] ?? state.phase}</strong>
        </span>
        {state.mode === 'solo' && (
          <span className="stat">
            模式 <strong>单人热座</strong>
          </span>
        )}
        {state.mode === 'duo' && (
          <span className="stat">
            模式 <strong>1对1</strong>
          </span>
        )}
        {state.mode === 'vs2' && (
          <span className="stat">
            模式 <strong>1VS2</strong>
          </span>
        )}
        <TrackChips
          keysCollected={state.keysCollected}
          keysNeeded={state.rules.keysNeeded}
          repairProgress={state.repairProgress}
          repairNeeded={state.rules.repairNeeded}
          showRepair={isSurvivorView}
          fearTotal={survivors.reduce((n, p) => n + p.fear, 0)}
          open={trackOpen}
          onToggle={(panel) => setTrackOpen((cur) => (cur === panel ? null : panel))}
        />
        <span className="stat">
          封堵 <strong>{state.blockades.length}/{state.rules.blockadeTokenMax ?? 7}</strong>
        </span>
        {state.rescueArmed && (
          <span className="stat">
            警车 <strong>{state.rescueCountdown === 0 ? '出口' : state.rescueCountdown}</strong>
          </span>
        )}
        {state.winner && (
          <span className="stat">
            胜方 <strong>{WINNER_LABEL[state.winner] ?? state.winner}</strong> — {state.winReason}
          </span>
        )}
          <button type="button" className="ghost-btn" onClick={() => setLogOpen((v) => !v)}>
          {logOpen ? '收起战报' : '战报'}
        </button>
        <button type="button" className="ghost-btn" onClick={() => setRulesOpen(true)}>
          行动规则
        </button>
        <a className="ghost-btn" href="/ui-layout/" target="_blank">
          界面校准
        </a>
        {state.mode === 'solo' && onLeave && (
          <button type="button" className="ghost-btn" onClick={onLeave}>
            退出主界面
          </button>
        )}
      </div>
      {soloHint && <p className="muted table-hint">{soloHint}</p>}

      {trackOpen && (
        <TrackOverlay
          panel={trackOpen}
          onClose={() => setTrackOpen(null)}
          keysCollected={state.keysCollected}
          keysNeeded={state.rules.keysNeeded}
          repairProgress={state.repairProgress}
          repairNeeded={state.rules.repairNeeded}
          rescueArmed={state.rescueArmed}
          rescueCountdown={state.rescueCountdown}
          survivors={survivors}
          keySlots={survLayout.keySlots}
          rescueCells={survLayout.rescueCells}
        />
      )}

      <SurvivorStatusBar
        survivors={survivors}
        characters={state.characters}
        youId={state.you.id}
        activePlayerId={state.activePlayerId}
        layout={survLayout}
        pickableSurvivorIds={pickableSurvivorIds}
        selectedSurvivorId={pickedNextId}
        onSurvivorClick={pickSurvivor}
        keysCollected={state.keysCollected}
        keysNeeded={state.rules.keysNeeded}
        rescueArmed={state.rescueArmed}
        rescueCountdown={state.rescueCountdown}
      />

      <div className="table-map">
          <Board
            map={state.map}
            players={displayPlayers}
            youId={state.you.id}
            viewerFaction={viewerFaction}
            legalMoves={
              extraPick
                ? extraPick.rooms
                : isActive &&
                    (!standeeMoveOn ||
                      state.pendingMoveRange != null ||
                      Boolean(state.pendingPathDraft) ||
                      Boolean(state.pendingBlockade) ||
                      Boolean(state.pendingBlockadePlace) ||
                      Boolean(state.pendingSensePair) ||
                      canDraftMove ||
                      fleePick)
                ? state.legalMoves
                : []
            }
            highlightRoomIds={state.highlightRoomIds ?? []}
            firecrackerRoomId={
              state.phase === 'noiseReport' ||
              state.phase === 'killerMain' ||
              state.phase === 'encounter' ||
              state.phase === 'upkeep' ||
              state.phase === 'gameOver'
                ? state.firecrackerRoomId ?? null
                : null
            }
            suitcaseAvailable={state.suitcaseAvailable !== false}
            noises={
              state.phase === 'noiseReport' ||
              state.phase === 'killerMain' ||
              state.phase === 'encounter' ||
              state.phase === 'upkeep' ||
              state.phase === 'gameOver'
                ? state.noises
                : []
            }
            blockades={state.blockades}
            previewPath={previewPath}
            repairProgress={isSurvivorView ? state.repairProgress : (state.killerRepairGuess ?? 0)}
            showRepair
            repairGuessable={!isSurvivorView && !state.rescueArmed}
            onRepairGuess={(n) => {
              const cur = state.killerRepairGuess ?? 0;
              void onAction({ type: 'setKillerRepairGuess', value: n === cur ? 0 : n });
            }}
            onSkillClick={
              !isSurvivorView
                ? (src, caption) => setArtZoom({ src, caption })
                : undefined
            }
            stealthRoomId={state.stealthOriginRoomId}
            trapRoomIds={state.trapRoomIds ?? []}
            rescueArmed={state.rescueArmed}
            rescueCountdown={state.rescueCountdown}
            onRoomClick={onRoomClick}
            pileCounts={pileCounts}
            pileCards={pileCards}
            pileTops={state.pileTops}
            cardById={state.cardById}
            pickableSurvivorIds={pickableSurvivorIds}
            selectedSurvivorId={pickedNextId}
            activePlayerId={state.activePlayerId}
            onSurvivorClick={pickSurvivor}
            onPileClick={setInspectPile}
            turnOrder={state.turnOrder}
          />
          {!isSurvivorView && (
          <div className="killer-place-bar">
            <button
              type="button"
              className={standeeMoveOn ? 'primary' : ''}
              onClick={() => setStandeeMoveOn((on) => !on)}
            >
              移动立绘：{standeeMoveOn ? '开' : '关'}
            </button>
            {standeeMoveOn &&
              placeableSurvivors.map((p) => (
                <button
                  key={p.id}
                  type="button"
                  className={placeTargetId === p.id ? 'primary' : ''}
                  onClick={() => setPlaceTargetId(p.id)}
                >
                  放置{p.name}
                </button>
              ))}
            <span className="muted">
              {!standeeMoveOn
                ? '开启后可随时移动三名求生者立绘（仅杀手地图，与真实位置无关）'
                : '点房间摆放或移动立绘，再点同一房间拿起。已知位置也可移动。'}
            </span>
          </div>
          )}
      </div>

      <div className="table-bottom-wrap">
        <div className="action-scale-bar">
          <span>行动区缩放</span>
          <button
            type="button"
            onClick={() => setActionScale((cur) => persistActionScale(cur - ACTION_SCALE_STEP))}
          >
            −
          </button>
          <input
            type="range"
            min={ACTION_SCALE_MIN}
            max={ACTION_SCALE_MAX}
            step={ACTION_SCALE_STEP}
            value={actionScale}
            onChange={(e) => setActionScale(persistActionScale(Number(e.target.value)))}
            aria-label="行动区缩放"
          />
          <button
            type="button"
            onClick={() => setActionScale((cur) => persistActionScale(cur + ACTION_SCALE_STEP))}
          >
            +
          </button>
          <span className="action-scale-pct">{Math.round(actionScale * 100)}%</span>
          <button type="button" className="ghost-btn" onClick={() => setActionScale(persistActionScale(1))}>
            重置
          </button>
        </div>
      <div className="table-bottom" style={{ zoom: actionScale }}>
          {!isSurvivorView && (
            <KillerActionDock
              players={state.players}
              characters={state.characters}
              layout={survLayout}
              hand={killerHand}
              discard={pileCards?.killerDiscard ?? state.yourDiscardPile ?? []}
              deckCount={pileCounts?.killerDraw ?? state.killerDeckCount ?? 0}
              cardById={state.cardById}
              pendingCard={pendingCard}
              playableIds={killerPlayable}
              blockedReasons={killerBlockedReasons}
              locked={state.yourKillerLocked ?? []}
              onPlayCard={playKillerCard}
              onInspectCard={(cid) => setInspectCardId(cid)}
              onInspectEvolution={() => setInspectCardId('__evolution__')}
              onInspectDeck={() => setInspectPile('killerDraw')}
              onInspectDiscard={() => setInspectPile('killerDiscard')}
              payForCard={payForCard}
              payIds={payIds}
            />
          )}
          <div className="table-chrome">
          <div className="table-actions">
            <h3>行动</h3>
            <div className="action-killer-meta">
              <span>
                杀手 Lv.{state.killerLevel ?? 1} · 力量 {killerPowerText(state)}
              </span>
              <button type="button" className="ghost-btn" onClick={() => setKillerInfoOpen(true)}>
                查看杀手信息
              </button>
            </div>
            {actingSurvivor && (
              <p className="acting-now">
                当前小回合：<strong>{actingSurvivor.name}</strong>
                {state.phase === 'discovery' ? ' · 翻发现牌' : isActive ? ' · 正在操作' : ' · 等待操作'}
              </p>
            )}
            {!isActive &&
              !state.pendingSurvivorPick &&
              !state.pendingDiscoveryPick &&
              state.phase !== 'gameOver' && (
              <p className="muted">
                {state.phase === 'survivorMain' && isSurvivorView
                  ? sharedControl
                    ? `等待「${actingSurvivor?.name ?? '当前求生者'}」进行一般行动。任何求生者仍可交换物品或额外行动。`
                    : `等待「${actingSurvivor?.name ?? '当前求生者'}」进行一般行动。你仍可交出自己的物品或做自己的额外行动；给予或互换需对方确认，栏满只能互换。`
                  : '等待当前玩家行动…'}
              </p>
            )}
            {extraPick && (
              <div className="stack">
                <p className="muted">
                  点地图选择地点，再点同一格可取消。选好后确认。
                  {extraDest
                    ? ` 已选「${roomDisplayName(state.map, extraDest, viewerFaction)}」。`
                    : ''}
                </p>
                <div className="row">
                  <button type="button" onClick={() => { setExtraPick(null); setExtraDest(null); }}>
                    取消
                  </button>
                  {extraDest && (
                    <button type="button" className="primary" onClick={confirmExtraDest}>
                      确认
                      {extraPick.kind === 'whiskey' ? '扔向' : extraPick.kind === 'adrenaline' ? '移动到' : '短跑到'}
                      {roomDisplayName(state.map, extraDest, viewerFaction)}
                    </button>
                  )}
                </div>
              </div>
            )}
            {isSurvivorView && state.phase === 'survivorMain' && (
              <div className="row">
                <button type="button" className={tradeOpen ? 'primary' : ''} onClick={() => setTradeOpen((v) => !v)}>
                  交换物品
                </button>
                <button type="button" onClick={() => setExtraOpen(true)}>
                  额外行动
                </button>
                {state.survivorActionsDone && (
                  <button
                    type="button"
                    className="primary"
                    onClick={() => void onAction({ type: 'finishSurvivorPhase' })}
                  >
                    求生者所有操作已结束
                  </button>
                )}
              </div>
            )}
            {(showSurvivorPickRow || state.pendingDiscoveryPick) && isSurvivorView && (
              <div className="stack">
                <p className="muted">
                  {state.pendingDiscoveryPick
                    ? '发现阶段：点状态栏或立绘选择翻牌的求生者。'
                    : sharedControl
                      ? '点状态栏、立绘或下方按钮选择行动者。做一般行动前可反复换人，其他角色选项会一直保留。'
                      : '点自己的立绘或下方按钮开始小回合。只能操控自己的角色。'}
                </p>
                <div className="row">
                  {survivors
                    .filter((p) => p.alive)
                    .map((p) => {
                      const pickable = pickableSurvivorIds.includes(p.id);
                      const acted = Boolean(p.actedThisRound) && !canPickDiscovery;
                      const room = p.roomId
                        ? roomDisplayName(state.map, p.roomId, viewerFaction)
                        : '未放置';
                      return (
                        <button
                          key={p.id}
                          type="button"
                          className={state.activePlayerId === p.id ? 'primary' : ''}
                          disabled={!pickable}
                          onClick={() => pickSurvivor(p.id)}
                        >
                          {p.name}
                          {acted ? '（已行动）' : `（${room}）`}
                        </button>
                      );
                    })}
                </div>
              </div>
            )}
            {(state.pendingSurvivorPick || state.pendingDiscoveryPick) && !isSurvivorView && (
              <p className="muted">
                {state.pendingDiscoveryPick
                  ? '等待求生者选择谁来翻发现牌…'
                  : sharedControl
                    ? '等待求生者选择行动顺序…'
                    : '等待求生者点选自己开始小回合…'}
              </p>
            )}

            {state.pendingTrade && isSurvivorView && (
              <p className="muted">
                {state.pendingTrade.fromPlayerId === state.you.id
                  ? `已向「${state.pendingTrade.targetName}」提出${state.pendingTrade.receiveItemName ? '交换' : '给予'}，等待对方确认。`
                  : state.pendingTrade.targetPlayerId === state.you.id
                    ? `「${state.pendingTrade.fromName}」想${state.pendingTrade.receiveItemName ? '和你交换物品' : '给你一件物品'}，请在弹窗中确认或拒绝。`
                    : `「${state.pendingTrade.fromName}」与「${state.pendingTrade.targetName}」有一笔物品交换等待确认。`}
              </p>
            )}

            {isSurvivorView &&
              state.phase === 'survivorMain' &&
              !youMustDiscard &&
              !state.pendingTrade &&
              tradeOpen && (
              <div className="stack">
                <h4>同地给予物品</h4>
                <p className="muted">
                  {sharedControl
                    ? '发现阶段之前，只要两名求生者在同一地点就可以互相给予或 1 换 1（钥匙除外）。两边背包都满了也可以互换。三人同地则任意两人之间都能给。'
                    : '只能从自己的装备栏交出物品。拖到同地队友空格是给予，拖到已有牌是互换；对方确认后才会到手。栏满只能互换，不能硬塞。'}
                </p>
                {tradeGroups.length === 0 ? (
                  <p className="muted">目前没有两名求生者在同一地点。</p>
                ) : (
                  tradeGroups.map(({ roomId, list }) => (
                    <div key={roomId} className="stack">
                      <p>
                        {roomDisplayName(state.map, roomId, viewerFaction)}（
                        {list.map((p) => p.name).join('、')}）
                      </p>
                      {list
                        .filter((giver) => sharedControl || giver.id === state.you.id)
                        .flatMap((giver) =>
                        list
                          .filter((receiver) => receiver.id !== giver.id)
                          .flatMap((receiver) => {
                            const giveIds = ownedItemIds(giver.items);
                            const recvIds = ownedItemIds(receiver.items);
                            const recvCap = receiver.inventorySlots || 3;
                            const recvFull = inventoryUsed(receiver.items) >= recvCap;
                            const canGive = !recvFull;
                            const showSwap =
                              giveIds.length > 0 &&
                              recvIds.length > 0 &&
                              (sharedControl ? giver.id < receiver.id : true);
                            const giveBtns = giveIds.map((itemId) =>
                              canGive ? (
                                <button
                                  key={`${giver.id}-${receiver.id}-${itemId}-give`}
                                  type="button"
                                  onClick={() =>
                                    void runSurvivor(
                                      `让${giver.name}把${ITEM_LABEL[itemId] ?? itemId}给${receiver.name}`,
                                      {
                                        type: 'tradeItem',
                                        fromPlayerId: giver.id,
                                        targetPlayerId: receiver.id,
                                        itemId,
                                        amount: 1,
                                      },
                                    )
                                  }
                                >
                                  {giver.name} 把 {ITEM_LABEL[itemId] ?? itemId}
                                  {(giver.items[itemId] ?? 0) > 1 ? `×${giver.items[itemId]}` : ''} 给{' '}
                                  {receiver.name}
                                </button>
                              ) : null,
                            );
                            const swapBtns =
                              showSwap
                                ? giveIds.flatMap((itemId) =>
                                    recvIds.map((rid) => (
                                      <button
                                        key={`${giver.id}-${receiver.id}-${itemId}-${rid}`}
                                        type="button"
                                        onClick={() =>
                                          void runSurvivor(
                                            `让${giver.name}用${ITEM_LABEL[itemId] ?? itemId}与${receiver.name}的${ITEM_LABEL[rid] ?? rid}互换`,
                                            {
                                              type: 'tradeItem',
                                              fromPlayerId: giver.id,
                                              targetPlayerId: receiver.id,
                                              itemId,
                                              amount: 1,
                                              receiveItemId: rid,
                                            },
                                          )
                                        }
                                      >
                                        {giver.name} 用 {ITEM_LABEL[itemId] ?? itemId} 换 {receiver.name}{' '}
                                        的 {ITEM_LABEL[rid] ?? rid}
                                      </button>
                                    )),
                                  )
                                : [];
                            const blocked =
                              !canGive && giveIds.length > 0 && recvIds.length === 0 ? (
                                <p key={`${giver.id}-${receiver.id}-full`} className="muted">
                                  {receiver.name} 栏已满且没有可换的装备，只能等对方先腾出空位再给予
                                </p>
                              ) : !canGive && giveIds.length > 0 ? (
                                <p key={`${giver.id}-${receiver.id}-swap-only`} className="muted">
                                  {receiver.name} 栏已满，只能互换
                                </p>
                              ) : null;
                            return [...giveBtns, ...swapBtns, blocked];
                          }),
                      )}
                    </div>
                  ))
                )}
              </div>
            )}

            {state.pendingItemDiscard &&
              (state.pendingItemDiscard.items != null ||
                state.pendingItemDiscard.playerId === state.you.id) && (
              <div className="stack">
                <p className="muted">
                  {state.pendingItemDiscard.name
                    ? `「${state.pendingItemDiscard.name}」`
                    : '求生者'}
                  装备栏已满（{state.pendingItemDiscard.inventorySlots ?? state.you.inventorySlots}{' '}
                  格），请弃置 {state.pendingItemDiscard.count} 件。可以弃刚拿到的，也可以弃旧的。
                </p>
                <div className="row">
                  {Object.entries(
                    state.pendingItemDiscard.items ?? state.you.items,
                  ).flatMap(([itemId, n]) =>
                    Array.from({ length: n }, (_, i) => (
                      <button
                        key={`${itemId}-${i}`}
                        type="button"
                        className="card"
                        onClick={() =>
                          void runSurvivor(`弃置${ITEM_LABEL[itemId] ?? itemId}`, {
                            type: 'discardItem',
                            itemId,
                          })
                        }
                      >
                        <h4>
                          {itemArtSrc(itemId) && (
                            <img
                              className="inline-card-art"
                              src={encodeURI(itemArtSrc(itemId)!)}
                              alt=""
                            />
                          )}
                          弃置 {ITEM_LABEL[itemId] ?? itemId}
                        </h4>
                      </button>
                    )),
                  )}
                </div>
              </div>
            )}

            {state.phase === 'discovery' && isSurvivorView && discoveryOptions.length > 0 && (
              <div className="stack">
                <h4>
                  正在翻牌：
                  {state.players.find((p) => p.id === state.discoveryActorId)?.name ?? '求生者'}
                </h4>
                <p className="muted">
                  {discoveryOptions.length === 1
                    ? '发现牌堆只剩这一张，直接收下。'
                    : state.discoveryActorId
                      ? `由「${state.players.find((p) => p.id === state.discoveryActorId)?.name ?? '求生者'}」翻牌：留 1 张，另一张进入弃牌堆。`
                      : '摸 2 选 1：留下的牌归翻牌者，另一张进入弃牌堆。'}
                  钥匙也带响声：无论要不要都会在翻牌者所在地点响；不要则进弃牌堆，钥匙架不加。
                </p>
                <div className="row">
                  {discoveryOptions.map((cid) => {
                    const card = state.cardById[cid];
                    return (
                      <button
                        key={cid}
                        type="button"
                        className="card"
                        onClick={() =>
                          void runSurvivor(`留下「${card?.name ?? cid}」`, {
                            type: 'chooseDiscovery',
                            cardId: cid,
                          })
                        }
                      >
                        <h4>
                          {cardArtSrc(card, cid) && (
                            <img className="inline-card-art" src={encodeURI(cardArtSrc(card, cid)!)} alt="" />
                          )}
                          {card?.name ?? cid}
                          {(card?.makesNoise ||
                            card?.effects.some((e) => e.op === 'gainItem' && e.itemId === 'key')) && (
                            <img className="inline-noise" src={encodeURI(UI.noise)} alt="响声" />
                          )}
                        </h4>
                        <div className="muted">{card?.text}</div>
                        <div className="muted">点选留下这张</div>
                      </button>
                    );
                  })}
                </div>
                {discoveryOptions.length === 0 && discoveryCard && (
                  <p>
                    已留下：<strong>{discoveryCard.name}</strong>
                  </p>
                )}
              </div>
            )}

            {state.phase === 'noiseReport' && isActive && (
              <button
                type="button"
                className="primary"
                onClick={() => onAction({ type: 'acknowledgeNoise' })}
              >
                <span className="noise-label">
                  {state.noises.length > 0 && (
                    <img className="inline-noise" src={encodeURI(UI.noise)} alt="响声" />
                  )}
                  确认噪音（
                  {state.firecrackerThisRound
                    ? '所有地点发出响声！'
                    : noiseNames || '无'}
                  ）并开始杀手回合
                </span>
              </button>
            )}

            {state.phase === 'encounter' && enc && !state.encounterOpenHold && (
              <div className="stack">
                <p className="muted">
                  遭遇地点：{roomDisplayName(state.map, enc.roomId, viewerFaction)}
                  {enc.targetId
                    ? ` · 对象：${state.players.find((p) => p.id === enc.targetId)?.name ?? ''}`
                    : ''}
                  {' · '}
                  {state.pendingEvolutionAck
                    ? '杀手进化，请先确认新效果'
                    : (state.pendingKillerDiscards ?? 0) > 0
                      ? '进化后手牌超额，请先弃牌'
                    : enc.step === 'pick'
                      ? '选择遭遇对象'
                      : enc.step === 'attack'
                        ? '杀手选择是否用一张卡牌加攻（每次攻击前都问）'
                        : enc.step === 'defend'
                          ? '求生者已知道杀手是否加攻，再选择是否加防'
                          : enc.step === 'flee'
                            ? '被发现的求生者可移动 1 格或取消'
                            : '遭遇中'}
                </p>
                {enc.step === 'pick' &&
                  isActive &&
                  isSurvivorView &&
                  !state.pendingEvolutionAck &&
                  !(state.pendingKillerDiscards > 0) && (
                  <div className="stack">
                    <p className="muted">
                      {Object.keys(enc.defenses).length
                        ? '伤害成功。请再选一名尚未被伤害的求生者。挡住则整场结束。'
                        : '有多人在遭遇地点，请先选择一名求生者。没有闪避和防御牌。'}
                    </p>
                    <div className="row">
                      {state.players
                        .filter(
                          (pl) =>
                            pl.faction === 'survivor' &&
                            pl.alive &&
                            pl.roomId === enc.roomId &&
                            !(pl.id in enc.defenses),
                        )
                        .map((pl) => (
                          <button
                            key={pl.id}
                            type="button"
                            className="primary"
                            onClick={() => onAction({ type: 'pickEncounterTarget', targetPlayerId: pl.id })}
                          >
                            {pl.name}
                          </button>
                        ))}
                    </div>
                  </div>
                )}
                {enc.step === 'attack' &&
                  !enc.attackChoiceMade &&
                  isActive &&
                  state.you.faction === 'killer' &&
                  !state.pendingEvolutionAck &&
                  !(state.pendingKillerDiscards > 0) && (
                  <div className="stack">
                    <p className="muted">
                      基础攻击 = 力量 {killerPowerText(state)}
                      。每次攻击前都可以选择是否用一张卡牌加攻；这次选了只对当前这一击有效。
                    </p>
                    <div className="row">
                      {killerHand
                        .filter((cid) => encounterCardAttackBonus(state.cardById[cid]) > 0)
                        .map((cid, idx) => (
                          <button
                            key={`${cid}-enc-${idx}`}
                            type="button"
                            className="card"
                            onClick={() => onAction({ type: 'playEncounterAttack', cardId: cid })}
                          >
                            <h4>
                              打出「{state.cardById[cid]?.name ?? cid}」（本次 +
                              {encounterCardAttackBonus(state.cardById[cid])}）
                            </h4>
                            <div className="muted">{state.cardById[cid]?.text}</div>
                          </button>
                        ))}
                      <button
                        type="button"
                        className="primary"
                        onClick={() => onAction({ type: 'playEncounterAttack', cardId: null })}
                      >
                        不加攻击
                      </button>
                    </div>
                  </div>
                )}
                {enc.step === 'defend' &&
                  isActive &&
                  state.you.faction === 'survivor' &&
                  enc.targetId === state.you.id &&
                  !(state.you.id in enc.defenses) &&
                  !state.pendingEvolutionAck &&
                  !(state.pendingKillerDiscards > 0) && (
                    <div className="stack">
                      <p className="muted">
                        {enc.attackCardId
                          ? `杀手已打出「${state.cardById[enc.attackCardId]?.name ?? enc.attackCardId}」，本次攻击 +${state.encounterTailBonus ?? encounterCardAttackBonus(state.cardById[enc.attackCardId])}。`
                          : enc.attackBoost
                            ? `杀手已加攻 +${state.encounterTailBonus ?? 0}。`
                            : '杀手不加攻击。'}
                      </p>
                      {defendItemChoices.length > 0 && (
                        <div className="stack">
                          <p className="muted">
                            可用自己的加防物品（只能给自己用，可选
                            {youHaveTenacity ? '；不用物品则「坚韧不拔」+1' : ''}）
                          </p>
                          <div className="row">
                            {defendItemChoices.map((id) => (
                              <button
                                key={id}
                                type="button"
                                className={defenseItemId === id ? 'primary' : ''}
                                onClick={() =>
                                  setDefenseItemId((cur) => (cur === id ? null : id))
                                }
                              >
                                {ITEM_LABEL[id] ?? id} {DEFENSE_ITEM_HINT[id]?.hint}
                              </button>
                            ))}
                          </div>
                        </div>
                      )}
                      {youHaveTenacity && (
                        <p className="muted">
                          {defenseItemId
                            ? '已选加防物品：「坚韧不拔」本场不触发。'
                            : '即使身上有加防物品，只要本场不使用，「坚韧不拔」也会 +1。'}
                        </p>
                      )}
                      <button
                        type="button"
                        className="primary"
                        onClick={() =>
                          void runSurvivor(defenseItemId ? '使用物品防御' : '不使用防御物品', {
                            type: 'playEncounterDefense',
                            cardId: null,
                            itemId: defenseItemId,
                          })
                        }
                      >
                        {defenseItemId ? `确认用${ITEM_LABEL[defenseItemId] ?? defenseItemId}` : '确认（不用物品）'}
                      </button>
                    </div>
                  )}
                {enc.step === 'flee' &&
                  isSurvivorView &&
                  enc.fleeQueue[0] === state.you.id &&
                  !state.pendingEvolutionAck &&
                  !(state.pendingKillerDiscards > 0) && (
                  <div className="stack">
                    <p className="muted">
                      点地图选 1 格，再点同一格可取消。确认后才移动。杀手看不见这次移动。
                    </p>
                    {fleeDest && (
                      <button type="button" className="primary" onClick={() => void confirmFleeDest()}>
                        确认移动到{roomDisplayName(state.map, fleeDest, viewerFaction)}
                      </button>
                    )}
                    <button
                      type="button"
                      onClick={() => {
                        void onAction({ type: 'encounterFlee', moveToRoomId: null });
                        setFleeDest(null);
                        setFleePick(false);
                      }}
                    >
                      取消移动
                    </button>
                  </div>
                )}
              </div>
            )}

            {isActive &&
              state.phase === 'survivorMain' &&
              state.you.faction === 'survivor' &&
              !state.pendingSurvivorPick && (
              <div className="stack">
                <h4>正在行动：{state.you.name}</h4>
                <p className="muted">
                  {extraPick
                    ? extraPick.kind === 'whiskey'
                      ? '点地图选一个相邻地点，再点同一格可取消，确认后才发出响声。'
                      : extraPick.kind === 'adrenaline'
                        ? '点地图选目的地（必须 1 步），再点同一格可取消，确认后才移动。'
                        : '点地图选目的地（必须刚好 3 步），再点同一格可取消，确认后才短跑。'
                    : state.you.mainActionUsed
                    ? '一般行动完成后该小回合已结束。'
                    : moveDest
                      ? `将移动到「${roomDisplayName(state.map, moveDest, viewerFaction)}」· 未确认，不影响对局`
                      : '高亮地点均可到达。点选目的地后确认或取消。'}
                </p>
                {extraPick && (
                  <div className="row">
                    <button type="button" onClick={() => { setExtraPick(null); setExtraDest(null); }}>
                      取消
                    </button>
                    {extraDest && (
                      <button type="button" className="primary" onClick={confirmExtraDest}>
                        确认
                        {extraPick.kind === 'whiskey' ? '扔向' : extraPick.kind === 'adrenaline' ? '移动到' : '短跑到'}
                        {roomDisplayName(state.map, extraDest, viewerFaction)}
                      </button>
                    )}
                  </div>
                )}
                {moveDest && (
                  <div className="row">
                    <button type="button" onClick={() => setMoveDest(null)}>
                      取消移动
                    </button>
                    <button type="button" className="primary" onClick={() => void confirmMove()}>
                      确认移动到{roomDisplayName(state.map, moveDest, viewerFaction)}
                    </button>
                  </div>
                )}
                <div className="row">
                  {canSearchHere && (
                    <button
                      type="button"
                      disabled={state.you.mainActionUsed || Boolean(moveDest)}
                      onClick={() => void runSurvivor('搜索', { type: 'search' })}
                    >
                      搜索
                    </button>
                  )}
                  {canRepairHere && (
                    <button
                      type="button"
                      disabled={state.you.mainActionUsed || Boolean(moveDest)}
                      onClick={() => void runSurvivor('修理无线电', { type: 'repair' })}
                    >
                      修理无线电
                    </button>
                  )}
                  {canClearFear && (
                    <button
                      type="button"
                      disabled={state.you.mainActionUsed || Boolean(moveDest)}
                      onClick={() => {
                        const n = state.you.fear ?? 0;
                        const ok = window.confirm(
                          n > 0
                            ? `当前恐惧 ${n}，确定要消除恐惧？这会占用一般行动并结束小回合。`
                            : '当前恐惧为 0，确定仍要消除恐惧？这会占用一般行动并结束小回合。',
                        );
                        if (!ok) return;
                        void runSurvivor('消除恐惧', { type: 'clearFear' }, true);
                      }}
                    >
                      消除恐惧
                    </button>
                  )}
                  {canUnblockHere && (
                    <button
                      type="button"
                      disabled={state.you.mainActionUsed || Boolean(moveDest)}
                      onClick={() => void runSurvivor('移除封堵', { type: 'removeBlockade' })}
                    >
                      移除封堵
                    </button>
                  )}
                  {(state.you.items.flashlight ?? 0) > 0 &&
                    passageEnds.length > 0 &&
                    passageEnds.map((rid) => (
                      <button
                        key={`fl-${rid}`}
                        type="button"
                        disabled={state.you.mainActionUsed || Boolean(moveDest)}
                        onClick={() =>
                          void runSurvivor(`用手电通过秘密通道到${roomDisplayName(state.map, rid, viewerFaction)}`, {
                            type: 'useItem',
                            itemId: 'flashlight',
                            toRoomId: rid,
                          })
                        }
                      >
                        手电通道→{roomDisplayName(state.map, rid, viewerFaction)}
                      </button>
                    ))}
                  {(state.you.items.trap ?? 0) > 0 && (
                    <button
                      type="button"
                      disabled={state.you.mainActionUsed || Boolean(moveDest) || !state.you.roomId}
                      title={!state.you.roomId ? '不在地图上，无法放置陷阱' : undefined}
                      onClick={() =>
                        void runSurvivor('在此地放置陷阱', { type: 'useItem', itemId: 'trap' })
                      }
                    >
                      放置陷阱
                    </button>
                  )}
                </div>
              </div>
            )}

            {isActive && state.you.faction === 'killer' && state.pendingKillerDiscards > 0 && (
              <div className="stack">
                <p className="muted">手牌超过上限，请弃置 {state.pendingKillerDiscards} 张。</p>
                <div className="row">
                  {(state.yourKillerHand ?? []).map((cid, idx) => (
                    <button
                      key={`${cid}-d-${idx}`}
                      type="button"
                      className="card"
                      onClick={() => onAction({ type: 'discardKillerCard', cardId: cid })}
                    >
                      <h4>弃置 {state.cardById[cid]?.name ?? cid}</h4>
                    </button>
                  ))}
                </div>
              </div>
            )}

            {isActive && state.phase === 'killerMain' && state.you.faction === 'killer' && state.pendingSenseColor && (
              <div className="stack">
                <p className="muted">请选择要感知的颜色区域，再点确认。</p>
                <div className="row">
                  {(['R', 'B', 'G'] as const).map((color) => (
                    <button
                      key={color}
                      type="button"
                      className={state.pendingSenseColorPick === color ? 'primary' : ''}
                      onClick={() => onAction({ type: 'chooseSenseColor', color })}
                    >
                      {color === 'R' ? '红色区域' : color === 'B' ? '蓝色区域' : '绿色区域'}
                    </button>
                  ))}
                </div>
                <button
                  type="button"
                  className="primary"
                  disabled={!state.pendingSenseColorPick}
                  onClick={() => onAction({ type: 'confirmSense' })}
                >
                  确认感知
                </button>
              </div>
            )}
            {isActive && state.phase === 'killerMain' && state.you.faction === 'killer' && state.pendingSensePair?.firstRoomId && state.pendingSensePair.secondRoomId && (
              <button type="button" className="primary" onClick={() => onAction({ type: 'confirmSense' })}>
                确认感知这两个地点
              </button>
            )}
            {isActive && state.phase === 'killerMain' && state.you.faction === 'killer' && state.pendingPathDraft && (
              <div className="stack">
                <p className="muted">
                  呼啸而过路径：
                  {state.pendingPathDraft.rooms
                    .map((id) => roomDisplayName(state.map, id, viewerFaction))
                    .join(' → ')}
                  （{Math.max(0, state.pendingPathDraft.rooms.length - 1)}/{state.pendingPathDraft.max} 步）
                </p>
                <button
                  type="button"
                  className="primary"
                  disabled={Math.max(0, state.pendingPathDraft.rooms.length - 1) < state.pendingPathDraft.min}
                  onClick={() => onAction({ type: 'finishPendingMove' })}
                >
                  确认路径并结算
                </button>
              </div>
            )}

            {isActive && state.phase === 'killerMain' && state.you.faction === 'killer' && state.pendingLurkPick && (
              <div className="stack">
                <p className="muted">潜藏威胁：请选择任意 1 名求生者施加惊吓。</p>
                <div className="row">
                  {state.players
                    .filter((pl) => pl.faction === 'survivor' && pl.alive)
                    .map((pl) => (
                      <button
                        key={pl.id}
                        type="button"
                        className="primary"
                        onClick={() => onAction({ type: 'chooseLurkTarget', targetPlayerId: pl.id })}
                      >
                        {pl.name}
                      </button>
                    ))}
                </div>
              </div>
            )}

            {isActive && state.phase === 'killerMain' && state.you.faction === 'killer' && state.pendingBlockade && (
              <div className="stack">
                <p className="muted">
                  请点击与你相邻的一扇<strong>白门</strong>（另一侧房间）放置封堵。再点同一格可取消。户外小径和杀手通道不能封。
                </p>
                {blockadeDest && (
                  <button type="button" className="primary" onClick={() => void confirmBlockadeDest()}>
                    确认封堵通往{roomDisplayName(state.map, blockadeDest, viewerFaction)}的门
                  </button>
                )}
              </div>
            )}

            {isActive &&
              state.you.faction === 'killer' &&
              state.pendingBlockadeJob &&
              state.pendingBlockadeJob.removeLeft > 0 && (
                <div className="stack">
                  <p className="muted">
                    可放置封堵不够，请先移除 {state.pendingBlockadeJob.removeLeft}{' '}
                    个场上封堵（每次确认）。
                    {state.pendingBlockadeJob.kind === 'sealAll'
                      ? '不能拆自己所在地点的封堵。'
                      : ''}
                    点地图选地点，或在下面点选要拆的门。再点同一格可取消。
                  </p>
                  {blockadeDest && (
                    <button type="button" className="primary" onClick={() => void confirmBlockadeDest()}>
                      确认拆除与{roomDisplayName(state.map, blockadeDest, viewerFaction)}相关的封堵
                    </button>
                  )}
                  <div className="row">
                    {(state.removableBoardBlockades ?? []).map((b) => (
                      <button
                        key={b.id}
                        type="button"
                        onClick={() => onAction({ type: 'removeBoardBlockade', doorId: b.id })}
                      >
                        拆除 {doorEndsLabel(state.map, b.id, viewerFaction)}
                      </button>
                    ))}
                  </div>
                </div>
              )}

            {isActive &&
              state.you.faction === 'killer' &&
              state.pendingBlockadeJob?.kind === 'anyDoors' &&
              state.pendingBlockadeJob.removeLeft <= 0 && (
                <div className="stack">
                  <p className="muted">
                    进化封堵：再选 {state.pendingBlockadeJob.need - state.pendingBlockadeJob.placed}{' '}
                    扇未封堵的门。先点一个地点，再点与它以门相连的地点。再点同一格可取消。
                  </p>
                  {state.pendingBlockadeJob.firstRoomId && state.pendingBlockadeJob.secondRoomId && (
                    <button
                      type="button"
                      className="primary"
                      onClick={() => onAction({ type: 'confirmEvoBlockade' })}
                    >
                      确认封堵
                      {roomDisplayName(state.map, state.pendingBlockadeJob.firstRoomId, viewerFaction)}
                      –
                      {roomDisplayName(state.map, state.pendingBlockadeJob.secondRoomId, viewerFaction)}
                    </button>
                  )}
                </div>
              )}

            {isActive && state.you.faction === 'killer' && state.pendingEvolutionAck && (
              <div className="stack">
                <p className="muted">
                  杀手进化到 {state.pendingEvolutionAck.toLevel} 级。当前生效：
                </p>
                <ul>
                  {(state.evolutionEffects ?? []).map((row) => (
                    <li key={row.level}>
                      {row.level} 级：{row.text}
                    </li>
                  ))}
                </ul>
                <button type="button" className="primary" onClick={() => onAction({ type: 'ackEvolution' })}>
                  确认新效果
                </button>
              </div>
            )}

            {isActive && state.you.faction === 'killer' && state.pendingWhizSearch && (
              <div className="stack">
                <p className="muted">呼啸而过之后：可以弃 2 张手牌搜索当前格（不占行动）。点选手牌，再确认。</p>
                <div className="row">
                  {killerHand.map((cid) => (
                    <button
                      key={cid}
                      type="button"
                      className={evoPayIds.includes(cid) ? 'primary' : ''}
                      onClick={() =>
                        setEvoPayIds((cur) =>
                          cur.includes(cid) ? cur.filter((x) => x !== cid) : cur.length < 2 ? [...cur, cid] : cur,
                        )
                      }
                    >
                      {state.cardById[cid]?.name ?? cid}
                    </button>
                  ))}
                </div>
                <div className="row">
                  <button
                    type="button"
                    className="primary"
                    disabled={evoPayIds.length !== 2}
                    onClick={() => onAction({ type: 'confirmWhizSearch', payCardIds: evoPayIds })}
                  >
                    弃 2 张并搜索
                  </button>
                  <button type="button" onClick={() => onAction({ type: 'skipWhizSearch' })}>
                    不用
                  </button>
                </div>
              </div>
            )}

            {isActive && state.you.faction === 'killer' && state.pendingOverFearWound && (
              <div className="stack">
                <p className="muted">
                  {state.players.find((pl) => pl.id === state.pendingOverFearWound?.targetId)?.name ?? '求生者'}{' '}
                  惊恐过度。可以弃 3 张手牌造成 1 点伤害（非遭遇时对方可用护符）。
                </p>
                <div className="row">
                  {killerHand.map((cid) => (
                    <button
                      key={cid}
                      type="button"
                      className={evoPayIds.includes(cid) ? 'primary' : ''}
                      onClick={() =>
                        setEvoPayIds((cur) =>
                          cur.includes(cid) ? cur.filter((x) => x !== cid) : cur.length < 3 ? [...cur, cid] : cur,
                        )
                      }
                    >
                      {state.cardById[cid]?.name ?? cid}
                    </button>
                  ))}
                </div>
                <div className="row">
                  <button
                    type="button"
                    className="primary"
                    disabled={evoPayIds.length !== 3}
                    onClick={() => onAction({ type: 'confirmOverFearWound', payCardIds: evoPayIds })}
                  >
                    弃 3 张并伤害
                  </button>
                  <button type="button" onClick={() => onAction({ type: 'skipOverFearWound' })}>
                    不用
                  </button>
                </div>
              </div>
            )}

            {isActive && state.phase === 'killerMain' && state.you.faction === 'killer' && state.pendingSensePair && (
              <p className="muted">
                {state.pendingSensePair.firstRoomId
                  ? `逻辑推理：已选「${roomDisplayName(state.map, state.pendingSensePair.firstRoomId, viewerFaction)}」${
                      state.pendingSensePair.secondRoomId
                        ? `与「${roomDisplayName(state.map, state.pendingSensePair.secondRoomId, viewerFaction)}」`
                        : '，请再点一个与它相连的地点'
                    }。再点同一格可取消。`
                  : '逻辑推理：请先点任意一个地点，再点一个与它相连的地点（门或一般通道，不含特殊通道；这两处不必与你相邻）。再点同一格可取消。'}
              </p>
            )}

            {isActive &&
              state.phase === 'killerMain' &&
              state.you.faction === 'killer' &&
              canDraftKillerMove &&
              moveDest && (
                <div className="row">
                  <button type="button" onClick={() => setMoveDest(null)}>
                    取消选择
                  </button>
                  <button type="button" className="primary" onClick={() => void confirmMove()}>
                    确认移动到{roomDisplayName(state.map, moveDest, viewerFaction)}
                  </button>
                </div>
              )}

            {isActive && state.phase === 'killerMain' && state.you.faction === 'killer' && (
              <div className="stack">
                <div className="row">
                  <span className="muted">
                    {killerStep === 'fast' && '快速卡牌阶段：可打任意张快速牌。'}
                    {killerStep === 'main' &&
                      !killerChoice &&
                      '二选一：执行 2 个普通行动（移动 1 / 搜索），或打出 1 张特殊行动牌（箭头）。'}
                    {killerStep === 'main' &&
                      killerChoice === 'actions' &&
                      `普通行动剩余 ${state.killerMainActionsLeft}：每次可移动 1 或搜索。`}
                    {killerStep === 'main' && killerChoice === 'special' && '已选择特殊行动牌。'}
                    {killerStep === 'slow' && '慢速卡牌阶段：可打出沙漏类慢速牌。'}
                    {state.you.stealth ? ' · 潜行中' : ''}
                  </span>
                </div>
                <div className="row">
                  {killerStep === 'fast' && (
                    <button type="button" className="primary" onClick={() => onAction({ type: 'advanceKillerStep' })}>
                      结束快速阶段
                    </button>
                  )}
                  {killerStep === 'main' && !killerChoice && (
                    <>
                      <button
                        type="button"
                        className="primary"
                        onClick={() => onAction({ type: 'chooseKillerMain', choice: 'actions' })}
                      >
                        选择 2 次移动/搜索
                      </button>
                      <button
                        type="button"
                        disabled={!canLeaveKillerMain}
                        title={
                          canLeaveKillerMain
                            ? undefined
                            : '第三阶段必须进行 1–2 次行动，或打出 1 张特殊行动牌'
                        }
                        onClick={() => onAction({ type: 'advanceKillerStep' })}
                      >
                        进入慢速阶段
                      </button>
                    </>
                  )}
                  {killerStep === 'main' && killerChoice === 'actions' && (
                    <>
                      <button
                        type="button"
                        disabled={state.killerMainActionsLeft <= 0 || Boolean(pendingCard)}
                        onClick={() => onAction({ type: 'search' })}
                      >
                        搜索
                      </button>
                      <button
                        type="button"
                        disabled={!canLeaveKillerMain}
                        title={
                          canLeaveKillerMain
                            ? undefined
                            : '第三阶段必须至少完成 1 次移动或搜索'
                        }
                        onClick={() => onAction({ type: 'advanceKillerStep' })}
                      >
                        进入慢速阶段
                      </button>
                    </>
                  )}
                  {killerStep === 'slow' && (
                    <button type="button" className="primary" onClick={() => onAction({ type: 'endTurn' })}>
                      结束杀手回合（抽 3 张）
                    </button>
                  )}
                </div>
                <h4>
                  {killerStep === 'fast' && '快速牌'}
                  {killerStep === 'main' && '特殊行动牌'}
                  {killerStep === 'slow' && '慢速牌'}
                </h4>
                <p className="muted">点击手牌放大查看。可打出时在放大界面点「打出」。</p>
                {payForCard && (
                  <p className="muted">
                    打出「{state.cardById[payForCard]?.name ?? payForCard}」需再选{' '}
                    {cardHandCost(state.cardById[payForCard]) - payIds.length} 张手牌一同弃置（用的牌最后进弃牌堆）。再点该牌可取消。
                  </p>
                )}
                {pendingCard && (
                  <p className="muted">请点击地图上的房间完成「{state.cardById[pendingCard]?.name ?? pendingCard}」的移动。</p>
                )}
                <div className="row">
                  {(state.yourKillerHand ?? [])
                    .filter((cid) => {
                      if (payForCard) return true;
                      const speed = effectiveCardSpeed(state, state.cardById[cid]);
                      if (killerStep === 'fast') return speed === 'fast';
                      if (killerStep === 'main') return speed === 'special' && killerChoice !== 'actions';
                      return speed === 'slow';
                    })
                    .map((cid, idx) => {
                      const card = state.cardById[cid];
                      const speedRaw = effectiveCardSpeed(state, card);
                      const speed =
                        speedRaw === 'slow' ? '慢速' : speedRaw === 'special' ? '特殊' : '快速';
                      const cost = cardHandCost(card);
                      const paying = payForCard === cid;
                      const picked = payIds.includes(cid);
                      const blocked = Boolean(killerBlockedReasons[cid]);
                      return (
                        <button
                          key={`${cid}-${idx}`}
                          type="button"
                          className={`card${paying ? ' pending' : ''}${picked ? ' pay-pick' : ''}`}
                          disabled={blocked && !payForCard}
                          onClick={() => (payForCard ? playKillerCard(cid) : setInspectCardId(cid))}
                        >
                          <h4>
                            {cardArtSrc(card, cid) && (
                              <img className="inline-card-art" src={encodeURI(cardArtSrc(card, cid)!)} alt="" />
                            )}
                            [{speed}] {card?.name ?? cid}
                            {cost > 0 ? ` · 弃${cost}` : ''}
                          </h4>
                          <div className="muted">{card?.text}</div>
                          {killerBlockadeSkipHint(state, card) && (
                            <div className="muted">此地没有能封堵的门</div>
                          )}
                          {paying && <div className="muted">正在支付弃牌费用</div>}
                          {picked && <div className="muted">将一同放入弃牌堆</div>}
                        </button>
                      );
                    })}
                </div>
              </div>
            )}

                {isActive &&
                  isSurvivorView &&
                  state.phase === 'survivorMain' &&
                  !state.you.mainActionUsed &&
                  !moveDest &&
                  (() => {
                    const healItems = ['herb', 'marco_medkit'].filter(
                      (id) => (state.you.items[id] ?? 0) > 0,
                    );
                    const healTargets = injuredAlliesHere(state);
                    if (healItems.length === 0 || healTargets.length === 0) return null;
                    return (
                      <div className="stack">
                        <h4>治疗（须同地点）</h4>
                        <p className="muted">只能治疗与你在同一地点的受伤求生者，包括自己。草药会在你所在地点发出响声。未受伤的角色不能作为治疗目标。</p>
                        {healItems.flatMap((itemId) =>
                          healTargets.map((t) => (
                            <button
                              key={`${itemId}-${t.id}`}
                              type="button"
                              onClick={() =>
                                void runSurvivor(`用${ITEM_LABEL[itemId] ?? itemId}治疗${t.name}`, {
                                  type: 'useItem',
                                  itemId,
                                  targetPlayerId: t.id,
                                })
                              }
                            >
                              {ITEM_LABEL[itemId] ?? itemId} → {t.name}
                              {t.id === state.you.id ? '（自己）' : ''}
                            </button>
                          )),
                        )}
                      </div>
                    );
                  })()}

            {canUseOwnExtras &&
              !moveDest &&
              (() => {
                const extras: ReactElement[] = [];
                if ((state.you.items.whiskey ?? 0) > 0 && whiskeyRooms.length > 0) {
                  extras.push(
                    <button
                      key="whiskey"
                      type="button"
                      onClick={() => setExtraPick({ kind: 'whiskey', rooms: whiskeyRooms })}
                    >
                      额外行动：威士忌（相邻地点响声）
                    </button>,
                  );
                }
                if ((state.you.items.adrenaline ?? 0) > 0 && adrenalineRooms.length > 0) {
                  extras.push(
                    <button
                      key="adrenaline"
                      type="button"
                      onClick={() => setExtraPick({ kind: 'adrenaline', rooms: adrenalineRooms })}
                    >
                      额外行动：肾上腺素（移动 1）
                    </button>,
                  );
                }
                if ((state.you.items.sedative ?? 0) > 0) {
                  extras.push(
                    <button
                      key="sedative"
                      type="button"
                      onClick={() => void runSurvivor('使用镇静剂', { type: 'useItem', itemId: 'sedative' })}
                    >
                      额外行动：镇静剂
                    </button>,
                  );
                }
                if ((state.you.items.firecracker ?? 0) > 0) {
                  extras.push(
                    <button
                      key="firecracker"
                      type="button"
                      onClick={() => void runSurvivor('点燃爆竹', { type: 'useItem', itemId: 'firecracker' })}
                    >
                      额外行动：爆竹
                    </button>,
                  );
                }
                if (canAxeUnblock) {
                  extras.push(
                    <button
                      key="axe"
                      type="button"
                      onClick={() => void runSurvivor('用手斧拆除封堵', { type: 'useItem', itemId: 'axe' })}
                    >
                      额外行动：用手斧拆除封堵
                    </button>,
                  );
                }
                if (canOpenSuitcase(state, state.you.roomId)) {
                  extras.push(
                    <button
                      key="suitcase"
                      type="button"
                      onClick={() => void runSurvivor('打开手提箱', { type: 'useSuitcase' })}
                    >
                      额外行动：打开手提箱（摸一张发现牌）
                    </button>,
                  );
                }
                const observant = ch?.skills.find((s) => s.id === 'observant');
                if (observant && (state.you.items.flashlight ?? 0) > 0 && passageEnds.length > 0) {
                  for (const rid of passageEnds) {
                    extras.push(
                      <button
                        key={`obs-${rid}`}
                        type="button"
                        disabled={state.you.skillUsedThisTurn.includes('observant')}
                        onClick={() =>
                          void runSurvivor(
                            `观察入微通过秘密通道到${roomDisplayName(state.map, rid, viewerFaction)}`,
                            { type: 'useSkill', skillId: 'observant', toRoomId: rid },
                          )
                        }
                      >
                        额外行动：{observant.name}→{roomDisplayName(state.map, rid, viewerFaction)}
                      </button>,
                    );
                  }
                }
                if (extras.length === 0) return null;
                return (
                  <div className="stack">
                    <h4>额外行动</h4>
                    {extras}
                  </div>
                );
              })()}

            {isActive &&
              isSurvivorView &&
              state.phase === 'survivorMain' &&
              ch &&
              (() => {
                const specials: ReactElement[] = [];
                const used = (id: string) => state.you.skillUsedThisTurn.includes(id);
                const mainGone = state.you.mainActionUsed || Boolean(moveDest);
                if (canToolbox && !mainGone) {
                  specials.push(
                    <button
                      key="toolbox"
                      type="button"
                      onClick={() => void runSurvivor('用工具箱修理', { type: 'useItem', itemId: 'toolbox' })}
                    >
                      特殊行动：使用工具箱修理（+{2 + (/约翰逊|engineer|survivor2/i.test(`${ch.id} ${ch.name}`) ? 1 : 0)}）
                    </button>,
                  );
                }
                const resourceful = ch.skills.find((s) => s.id === 'resourceful');
                if (resourceful && !used('resourceful') && !mainGone) {
                  if (marcoDiscardHas.adrenaline) {
                    specials.push(
                      <button
                        key="marco-adren"
                        type="button"
                        onClick={() =>
                          void runSurvivor('足智多谋：拿肾上腺素', {
                            type: 'useSkill',
                            skillId: 'resourceful',
                            itemId: 'adrenaline',
                          })
                        }
                      >
                        特殊行动：拿肾上腺素
                      </button>,
                    );
                  }
                  if (marcoDiscardHas.sedative) {
                    specials.push(
                      <button
                        key="marco-sed"
                        type="button"
                        onClick={() =>
                          void runSurvivor('足智多谋：拿镇静剂', {
                            type: 'useSkill',
                            skillId: 'resourceful',
                            itemId: 'sedative',
                          })
                        }
                      >
                        特殊行动：拿镇静剂
                      </button>,
                    );
                  }
                }
                const observant = ch.skills.find((s) => s.id === 'observant');
                if (
                  observant &&
                  (state.you.items.flashlight ?? 0) < 1 &&
                  passageEnds.length > 0 &&
                  !used('observant') &&
                  !mainGone
                ) {
                  for (const rid of passageEnds) {
                    specials.push(
                      <button
                        key={`obs-main-${rid}`}
                        type="button"
                        onClick={() =>
                          void runSurvivor(
                            `观察入微通过秘密通道到${roomDisplayName(state.map, rid, viewerFaction)}`,
                            { type: 'useSkill', skillId: 'observant', toRoomId: rid },
                          )
                        }
                      >
                        特殊行动：{observant.name}→{roomDisplayName(state.map, rid, viewerFaction)}
                      </button>,
                    );
                  }
                }
                const sprint = ch.skills.find((s) => s.id === 'sprint');
                if (sprint && sprintRooms.length > 0 && !used('sprint') && !mainGone) {
                  specials.push(
                    <button
                      key="sprint"
                      type="button"
                      onClick={() => setExtraPick({ kind: 'sprint', rooms: sprintRooms })}
                    >
                      特殊行动：短跑冲刺（移动 3）
                    </button>,
                  );
                }
                if (specials.length === 0) return null;
                return (
                  <div className="stack">
                    <h4>特殊行动</h4>
                    {specials}
                  </div>
                );
              })()}

            {error && <p className="error">{error}</p>}
          </div>

      {rulesOpen && (
        <div className="hud-overlay" onClick={() => setRulesOpen(false)}>
          <div
            className="hud-overlay-card rules-overlay-card"
            onClick={(e) => e.stopPropagation()}
            role="dialog"
            aria-label="行动规则"
          >
            <div className="hud-overlay-head">
              <h3>行动规则</h3>
              <div className="row">
                <button
                  type="button"
                  className={rulesSide === 'survivor' ? 'primary' : ''}
                  onClick={() => setRulesSide('survivor')}
                >
                  求生者
                </button>
                <button
                  type="button"
                  className={rulesSide === 'killer' ? 'primary' : ''}
                  onClick={() => setRulesSide('killer')}
                >
                  杀手
                </button>
                <button type="button" onClick={() => setRulesOpen(false)}>
                  关闭
                </button>
              </div>
            </div>
            <img
              src={encodeURI(rulesSide === 'survivor' ? UI.rulesSurvivor : UI.rulesKiller)}
              alt={rulesSide === 'survivor' ? '求生者行动规则' : '杀手行动规则'}
              draggable={false}
            />
          </div>
        </div>
      )}

      {isSurvivorView && (
        <SurvivorSkillBoards
          survivors={survivors}
          characters={state.characters}
          youId={state.you.id}
          activePlayerId={state.activePlayerId}
          selectedId={expandedId}
          onToggle={(id) => setExpandedId((cur) => (cur === id ? null : id))}
          showItems={showItems}
          youItems={state.you.items}
          layout={survLayout}
          tradeEnabled={state.phase === 'survivorMain' && !youMustDiscard && !state.pendingTrade}
          dragOwnOnly={!sharedControl}
          onTradeItem={({ fromPlayerId, targetPlayerId, itemId, receiveItemId }) => {
            void onAction({
              type: 'tradeItem',
              fromPlayerId,
              targetPlayerId,
              itemId,
              amount: 1,
              receiveItemId,
            });
          }}
        />
      )}

      {logOpen && (
        <div className="table-log panel">
          <h3>战报</h3>
          <div className="log-box">
            {[...state.logs].reverse().map((l, i) => (
              <div key={`${l.t}-${i}`}>{l.text}</div>
            ))}
          </div>
        </div>
      )}
          </div>

      </div>
      </div>

      {state.pendingAmulet && isSurvivorView && isActive && (
        <div className="surv-board-pop" role="dialog" aria-label="古代护符">
          <div className="surv-board-pop-stage panel stack" onClick={(e) => e.stopPropagation()}>
            <h3>古代护符</h3>
            <p>
              {state.players.find((p) => p.id === state.pendingAmulet?.playerId)?.name ?? '求生者'}{' '}
              受到牌伤。是否出示古代护符来防止这次伤害？（不能防止消灭效果）
            </p>
            <div className="row">
              <button
                type="button"
                className="primary"
                onClick={() => onAction({ type: 'confirmAmulet', use: true })}
              >
                出示护符
              </button>
              <button type="button" onClick={() => onAction({ type: 'confirmAmulet', use: false })}>
                不使用
              </button>
            </div>
          </div>
        </div>
      )}
      <DiceOverlay roll={state.lastDiceRoll} />
      {inspectPile && (
        <PileInspect
          kind={inspectPile}
          cards={inspectCards}
          hidden={inspectHidden}
          cardById={state.cardById}
          onClose={() => setInspectPile(null)}
        />
      )}
      {inspectCardId &&
        (inspectCardId === '__evolution__' ? (
          <CardZoom
            src={
              killerArtFor(
                state.players.find((p) => p.faction === 'killer')?.characterId ?? null,
                state.characters.find(
                  (c) => c.id === state.players.find((p) => p.faction === 'killer')?.characterId,
                )?.name,
              )?.evolution
            }
            caption="进化牌"
            onClose={() => setInspectCardId(null)}
          />
        ) : (
          <CardZoom
            card={state.cardById[inspectCardId]}
            cardId={inspectCardId}
            caption={
              (state.yourKillerLocked ?? []).includes(inspectCardId)
                ? `锁定牌${
                    state.cardById[inspectCardId]?.unlockLevel != null
                      ? ` · 等级 ${state.cardById[inspectCardId]?.unlockLevel} 入手`
                      : ''
                  }`
                : undefined
            }
            canPlay={killerPlayable.has(inspectCardId)}
            playHint={
              payForCard === inspectCardId
                ? `请再选 ${Math.max(0, cardHandCost(state.cardById[inspectCardId]) - payIds.length)} 张手牌弃置`
                : (() => {
                    const skip = killerBlockadeSkipHint(state, state.cardById[inspectCardId]);
                    if (skip) return `${skip}，打出后将跳过封堵`;
                    if (killerHand.includes(inspectCardId) && !killerPlayable.has(inspectCardId)) {
                      return '现在不能打出此牌';
                    }
                    return null;
                  })()
            }
            onPlay={
              killerHand.includes(inspectCardId) && payForCard !== inspectCardId
                ? () => playKillerCard(inspectCardId)
                : undefined
            }
            onClose={() => setInspectCardId(null)}
          />
        ))}
      {artZoom && (
        <CardZoom src={artZoom.src} caption={artZoom.caption} onClose={() => setArtZoom(null)} />
      )}
      {state.pendingTrade &&
        isSurvivorView &&
        (state.pendingTrade.targetPlayerId === state.you.id ||
          state.pendingTrade.fromPlayerId === state.you.id) && (
        <div className="hud-overlay">
          <div className="hud-overlay-card" onClick={(e) => e.stopPropagation()}>
            <div className="hud-overlay-head">
              <h3>
                {state.pendingTrade.receiveItemName ? '确认交换物品' : '确认给予物品'}
              </h3>
            </div>
            {(() => {
              const offer = state.pendingTrade!;
              const qty =
                offer.amount > 1 ? `${offer.amount}×${offer.itemName}` : `「${offer.itemName}」`;
              const incoming = offer.targetPlayerId === state.you.id;
              const outgoing = offer.fromPlayerId === state.you.id;
              const detail = offer.receiveItemName
                ? `${offer.fromName} 用 ${qty} 交换 ${offer.targetName} 的「${offer.receiveItemName}」`
                : `${offer.fromName} 把 ${qty} 给 ${offer.targetName}`;
              return (
                <div className="stack">
                  <p>{detail}</p>
                  {incoming ? (
                    <>
                      <p className="muted">确认后才会拿到手。栏满时只能互换，不能硬塞。</p>
                      <div className="row">
                        <button
                          type="button"
                          className="primary"
                          onClick={() => void onAction({ type: 'respondTrade', accept: true })}
                        >
                          确认收下
                        </button>
                        <button
                          type="button"
                          onClick={() => void onAction({ type: 'respondTrade', accept: false })}
                        >
                          拒绝
                        </button>
                      </div>
                    </>
                  ) : outgoing ? (
                    <>
                      <p className="muted">等待对方确认。对方拒绝或取消后物品仍留在你这边。</p>
                      <button
                        type="button"
                        onClick={() => void onAction({ type: 'respondTrade', accept: false })}
                      >
                        取消这次交换
                      </button>
                    </>
                  ) : (
                    <p className="muted">等待他们确认。</p>
                  )}
                </div>
              );
            })()}
          </div>
        </div>
      )}
      {state.pendingCoopAction &&
        isSurvivorView &&
        (state.pendingCoopAction.youAreProposer || state.pendingCoopAction.youMustConfirm) && (
        <div className="hud-overlay">
          <div className="hud-overlay-card" onClick={(e) => e.stopPropagation()}>
            <div className="hud-overlay-head">
              <h3>确认求生者行动</h3>
            </div>
            <div className="stack">
              <p>{state.pendingCoopAction.summary}</p>
              {state.pendingCoopAction.youMustConfirm ? (
                <>
                  <p className="muted">
                    「{state.pendingCoopAction.fromName}」提出此一般行动或额外行动，确认后才生效。交换物品不走这一步。
                  </p>
                  <div className="row">
                    <button
                      type="button"
                      className="primary"
                      onClick={() => void onAction({ type: 'respondCoopAction', accept: true })}
                    >
                      确认
                    </button>
                    <button
                      type="button"
                      onClick={() => void onAction({ type: 'respondCoopAction', accept: false })}
                    >
                      拒绝
                    </button>
                  </div>
                </>
              ) : (
                <>
                  <p className="muted">等待另一名求生者操控者确认。对方拒绝后不会执行。</p>
                  <button
                    type="button"
                    onClick={() => void onAction({ type: 'respondCoopAction', accept: false })}
                  >
                    取消这次行动
                  </button>
                </>
              )}
            </div>
          </div>
        </div>
      )}
      {extraOpen && isSurvivorView && state.phase === 'survivorMain' && (
        <div className="hud-overlay" onClick={() => setExtraOpen(false)}>
          <div className="hud-overlay-card" onClick={(e) => e.stopPropagation()}>
            <div className="hud-overlay-head">
              <h3>额外行动</h3>
              <button type="button" onClick={() => setExtraOpen(false)}>关闭</button>
            </div>
            <p className="muted">
              {sharedControl
                ? state.mode === 'vs2'
                  ? '两人都可以点。一般行动和额外行动需另一人确认后才生效。'
                  : '任何求生者都可以在求生者大回合内使用，不受小回合限制。'
                : '只显示你自己能做的额外行动。别人行动时你也可以用。'}
            </p>
            <div className="stack">
              {survivors.filter((p) => p.alive && (sharedControl || p.id === state.you.id)).flatMap((p) => {
                const buttons: ReactElement[] = [];
                const add = (key: string, label: string, act: () => void) => {
                  buttons.push(
                    <button key={`${p.id}-${key}`} type="button" onClick={() => { act(); setExtraOpen(false); }}>
                      {p.name}：{label}
                    </button>,
                  );
                };
                if ((p.items.sophia_camera ?? 0) > 0) {
                  add('cam', '相机（原地响声，一次性）', () =>
                    void runSurvivor(`${p.name}使用相机`, {
                      type: 'useItem',
                      itemId: 'sophia_camera',
                      actorPlayerId: p.id,
                    }),
                  );
                }
                if ((p.items.whiskey ?? 0) > 0) {
                  add('whiskey', '威士忌酒瓶（点相邻地点）', () => {
                    const rooms = p.roomId ? generalNeighbors(state.map, p.roomId) : [];
                    setExtraPick({ kind: 'whiskey', rooms, actorPlayerId: p.id });
                  });
                }
                if ((p.items.adrenaline ?? 0) > 0) {
                  add('adren', '肾上腺素（移动 1）', () => {
                    const rooms = p.roomId
                      ? roomsAtDistance(state.map, p.roomId, 1, 1, { blockades: state.blockades })
                      : [];
                    setExtraPick({ kind: 'adrenaline', rooms, actorPlayerId: p.id });
                  });
                }
                if ((p.items.sedative ?? 0) > 0) {
                  add('sed', '镇静剂', () =>
                    void runSurvivor(`${p.name}使用镇静剂`, {
                      type: 'useItem',
                      itemId: 'sedative',
                      actorPlayerId: p.id,
                    }),
                  );
                }
                if ((p.items.firecracker ?? 0) > 0) {
                  add('fire', '爆竹', () =>
                    void runSurvivor(`${p.name}点燃爆竹`, {
                      type: 'useItem',
                      itemId: 'firecracker',
                      actorPlayerId: p.id,
                    }),
                  );
                }
                if (roomHasBlockade(state.blockades, p.roomId) && (p.items.axe ?? 0) > 0) {
                  add('axe', '手斧拆除封堵', () =>
                    void runSurvivor(`${p.name}用手斧拆除封堵`, {
                      type: 'useItem',
                      itemId: 'axe',
                      actorPlayerId: p.id,
                    }),
                  );
                }
                if (canOpenSuitcase(state, p.roomId)) {
                  add('suitcase', '打开手提箱（摸一张发现牌）', () =>
                    void runSurvivor(`${p.name}打开手提箱`, {
                      type: 'useSuitcase',
                      actorPlayerId: p.id,
                    }),
                  );
                }
                const pch = state.characters.find((c) => c.id === p.characterId);
                const observant = pch?.skills.find((s) => s.id === 'observant');
                const ends = p.roomId ? passageNeighbors(state.map, p.roomId) : [];
                if (observant && (p.items.flashlight ?? 0) > 0) {
                  for (const rid of ends) {
                    add(`obs-${rid}`, `观察入微→${roomDisplayName(state.map, rid, viewerFaction)}`, () =>
                      void runSurvivor(`${p.name}观察入微`, {
                        type: 'useSkill',
                        skillId: 'observant',
                        toRoomId: rid,
                        actorPlayerId: p.id,
                      }),
                    );
                  }
                }
                if (buttons.length === 0) {
                  buttons.push(
                    <p key={`${p.id}-none`} className="muted">
                      {p.name}：当前没有可做的额外行动
                    </p>,
                  );
                }
                return buttons;
              })}
            </div>
          </div>
        </div>
      )}
      {killerInfoOpen && (
        <div className="hud-overlay" onClick={() => setKillerInfoOpen(false)}>
          <div
            className="hud-overlay-card killer-info-overlay-card"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="hud-overlay-head">
              <h3>
                杀手信息 · Lv.{state.killerLevel ?? 1} · 力量 {killerPowerText(state)}
              </h3>
              <button type="button" onClick={() => setKillerInfoOpen(false)}>
                关闭
              </button>
            </div>
            {(() => {
              const k = state.players.find((pl) => pl.faction === 'killer');
              const evo = killerArtFor(k?.characterId ?? null, k?.name)?.evolution;
              const info = survLayout.killerInfo;
              const junkNames = new Set(['疾冲', '潜伏', '封堵', '猎杀', '巡逻', '重击', '挥砍']);
              const mine = (state.allKillerCards ?? []).filter((c) => {
                if (junkNames.has(c.name)) return false;
                const def = state.cardById[c.id];
                if (!def) return false;
                if (def.type !== 'killerAction') return false;
                if (!def.owner) return false;
                return def.owner === k?.characterId || def.owner === k?.name;
              });
              const locked = mine.filter((c) => c.locked);
              const normal = mine.filter((c) => !c.locked);
              const boxAt = (list: typeof info.cards, i: number) => {
                const base = list[Math.min(i, list.length - 1)] ?? list[0];
                if (!base) return { left: `${2 + i * 8}%`, top: '78%', width: '7%', height: '20%' };
                if (i < list.length) {
                  return { left: `${base.x}%`, top: `${base.y}%`, width: `${base.w}%`, height: `${base.h}%` };
                }
                return {
                  left: `${base.x + (i - list.length + 1) * (base.w + 1)}%`,
                  top: `${base.y}%`,
                  width: `${base.w}%`,
                  height: `${base.h}%`,
                };
              };
              return (
                <div className="killer-info-stage">
                  {evo ? (
                    <button
                      type="button"
                      className="killer-info-piece evo"
                      style={{
                        left: `${info.evolution.x}%`,
                        top: `${info.evolution.y}%`,
                        width: `${info.evolution.w}%`,
                        height: `${info.evolution.h}%`,
                      }}
                      onClick={() => setArtZoom({ src: evo, caption: '进化牌' })}
                    >
                      <img src={encodeURI(evo)} alt="进化牌" draggable={false} />
                    </button>
                  ) : null}
                  <div
                    className="killer-info-piece effects"
                    style={{
                      left: `${info.effects.x}%`,
                      top: `${info.effects.y}%`,
                      width: `${info.effects.w}%`,
                      height: `${info.effects.h}%`,
                    }}
                  >
                    <h4>已生效进化</h4>
                    <ul className="killer-info-evo-list">
                      {(state.evolutionEffects ?? []).map((row) => (
                        <li key={row.level}>
                          {row.level} 级：{row.text}
                        </li>
                      ))}
                    </ul>
                  </div>
                  {locked.map((c, i) => {
                    const src = cardArtSrc(state.cardById[c.id], c.id);
                    return (
                      <button
                        key={c.id}
                        type="button"
                        className="killer-info-piece card"
                        style={boxAt(info.locked, i)}
                        onClick={() =>
                          src ? setArtZoom({ src, caption: c.name }) : setInspectCardId(c.id)
                        }
                      >
                        {src ? (
                          <img src={encodeURI(src)} alt={c.name} draggable={false} />
                        ) : (
                          c.name
                        )}
                      </button>
                    );
                  })}
                  {normal.map((c, i) => {
                    const src = cardArtSrc(state.cardById[c.id], c.id);
                    return (
                      <button
                        key={c.id}
                        type="button"
                        className="killer-info-piece card"
                        style={boxAt(info.cards, i)}
                        onClick={() =>
                          src ? setArtZoom({ src, caption: c.name }) : setInspectCardId(c.id)
                        }
                      >
                        {src ? (
                          <img src={encodeURI(src)} alt={c.name} draggable={false} />
                        ) : (
                          c.name
                        )}
                      </button>
                    );
                  })}
                </div>
              );
            })()}
          </div>
        </div>
      )}
      {state.phase === 'gameOver' && (
        <div className="hud-overlay">
          <div className="hud-overlay-card rematch-overlay-card">
            <h2 className="rematch-title">
              {state.winner === 'killer' ? '杀手胜利！' : '求生者胜利！'}
            </h2>
            {state.winReason && <p className="muted">{state.winReason}</p>}
            <button
              type="button"
              className="primary rematch-btn"
              disabled={Boolean(state.youRematchReady)}
              onClick={() => void onAction({ type: 'rematchReady' })}
            >
              {state.youRematchReady ? '已准备' : '再来一局'}
            </button>
            <p className="muted">
              {state.youRematchReady
                ? '已点击准备，等待对面也准备。'
                : '对面是否也点击准备：尚未准备。'}
              {state.rematchReady && state.rematchReady.length > 0
                ? ` 已准备：${state.rematchReady.join('、')}`
                : ''}
            </p>
          </div>
        </div>
      )}
    </div>
  );
}
