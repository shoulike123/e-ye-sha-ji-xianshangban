/**
 * 对局屏幕：大厅选角 + 开打后的整张桌子。
 *
 * 上半：顶栏、幸存者状态、地图。
 * 下半：行动区（一般行动确认后结束小回合；交换/额外随时可用）、装备栏、战报。
 * 网页只负责显示和收集点击，合不合法由服务器裁判。
 */
import { useEffect, useMemo, useRef, useState, type ReactElement } from 'react';
import type { Faction, PublicSnapshot, ClientAction, TraitDef } from './types';

/**
 * 【变体1】杀手特性里"弃 N 张卡牌来发动"的张数 —— **和服务端
 * `traits.ts` 的 `KILLER_TRAIT_PAY` 保持一致**（服务端会按这个数校验，
 * 客户端只用来决定"是先选牌还是直接发动"）。
 */
const KILLER_TRAIT_PAY_CLIENT: Record<string, number> = {
  trait_k01: 2,
  trait_k05: 2,
  trait_k06: 1,
  trait_k07: 1,
  trait_k10: 1,
  trait_k15: 1,
  trait_k20: 1,
};
import { Board } from './Board';
import { SurvivorSkillBoards, SurvivorStatusBar } from './SurvivorDock';
import { TrackChips, TrackOverlay, type TrackPanel } from './TableHud';
import { DiceOverlay, DiceTray } from './DiceRoll';
import { DEFAULT_SURVIVOR_LAYOUT, mergeSurvivorLayout, type SurvivorLayout } from './survivorLayout';
import { KillerActionDock } from './KillerDock';
import { PileInspect, type PileKind } from './PileInspect';
import { CardZoom } from './CardZoom';
import { cardArtSrc, effectiveHandCost, itemArtSrc } from './cardArt';
import { killerArtFor } from './killerArt';
import { shortestPath, passageNeighbors, generalNeighbors, roomsAtDistance, neighbors } from './mapPath';
import {
  FACTION_LABEL,
  ITEM_LABEL,
  PHASE_LABEL,
  WINNER_LABEL,
  roomDisplayName,
} from './i18n';
import { UI } from './uiAssets';
import { healableAlliesHere, killerCardBlockedReason, killerBlockadeSkipHint, killerCardPlayBlockReason, effectiveCardSpeed, encounterCardAttackBonus, canPlayAsEncounterAttack } from './cardUse';

interface Props {
  state: PublicSnapshot;
  isHost: boolean;
  error: string | null;
  onAction: (a: ClientAction) => Promise<void>;
  onLeave?: () => void;
  /** 同队幸存者正在预选的地点（1对2 / 1对3） */
  cursors?: Array<{ playerId: string; roomId: string }>;
  /** 把本机鼠标预选的地点报给同队 */
  onCursorRoom?: (roomId: string | null) => void;
  /**
   * 「额外行动」弹窗**初始是否展开**。
   *
   * 那个弹窗是 `useState(false)`，要靠点击才出现 —— 服务端渲染（测试用）
   * 点不了，所以就渲染不出里面的按钮。给个初始值，测试才能真的断言
   * "某个按钮在不在这个弹窗里"。默认 `false`，实际游戏不受影响。
   */
  initialExtraOpen?: boolean;
  /**
   * 【变体3】计划卡弹窗也**默认收起**（要点「📋 计划卡」才开）—— 同样给个初始值，
   * 让服务端渲染的测试能断言弹窗里的内容。默认 `false`。
   */
  initialPlanOpen?: boolean;
  /**
   * 选人界面的「【更多设置】」也**默认收起**（替换牌堆 / 变体1 / 变体2 / 变体3 都收在里面）。
   * 同样给个初始值，服务端渲染的测试才能断言里面的开关。默认 `false`。
   */
  initialMoreSettingsOpen?: boolean;
}

/**
 * 遭遇防御物品的清单**由服务端下发**（快照的 `defenseItemChoices`），
 * 客户端不再自己维护一份 —— 以前那份漏了煤油灯和狼人宝箱的银质武器，
 * 结果"拿到银质匕首却在遭遇里选不出来"。
 */
function usableDefenseItems(state: PublicSnapshot): Array<{ id: string; name: string; hint: string }> {
  return state.defenseItemChoices ?? [];
}

/**
 * 幸存者专属物品（「求生者相关物品」弹窗用）。
 * 按幸存者编号给出各自的专属物品；安娜/约翰逊没有专属物品。
 * 乔治的 3 张笔记固定放在同一行。
 */
/**
 * 幸存者的**专属物品**（开局或技能带来的、不是从牌堆摸的东西）。
 * 图片在 `cardArt.ts` 的 `ITEM_CARD` / `ITEM_ICON` 里映射。
 */
const SURVIVOR_PERSONAL_ITEMS: Record<string, string[]> = {
  survivor3: ['marco_medkit'],
  survivor4: ['sophia_camera'],
  survivor6: ['george_note_blockade', 'george_note_noise', 'george_note_defense'],
  // 凯莱布「幸运币」：开局就有的专属物品
  survivor8: ['lucky_coin'],
  // 迪伦「坚毅」：开局就有的专属标记
  survivor9: ['resilience'],
};

/**
 * 杀手「进化卡牌」：和进化牌（等级表）不是一回事。
 * 未命名有 4 张，等级 2 / 4 时各选 1 张（永久生效）。
 * 文件名 = 文件夹下的「进化卡牌_XXX.png」。
 */
const KILLER_EVOLUTION_CARDS: Record<string, Array<{ cardId: string; file: string }>> = {
  杀手七_未命名: [
    { cardId: 'evo_un_camouflage', file: '进化卡牌_保护色.png' },
    { cardId: 'evo_un_crawl', file: '进化卡牌_爬虫爬行.png' },
    { cardId: 'evo_un_sonar', file: '进化卡牌_音波感知.png' },
    { cardId: 'evo_un_slime', file: '进化卡牌_粘液腺体.png' },
  ],
};

/**
 * 「进化卡牌」（未命名那 4 张）的**卡面图**。
 *
 * 它们不在 `cardArtSrc` 的素材表里（那是"行动牌"的表），
 * 文件名规则是 `Image/Killers/<杀手文件夹>/进化卡牌_XXX.png` ——
 * 所以这里按当前杀手查出文件夹，再对 id 找文件。找不到就返回 null。
 *
 * ⚠ 用户要求「**能选牌的地方都要有卡面**」：进化卡牌的选择面板原来只写了卡名。
 */
function evolutionCardArt(state: PublicSnapshot, cardId: string): string | null {
  const killerPiece =
    state.players.find((p) => p.id === state.activePlayerId && p.faction === 'killer') ??
    state.players.find((p) => p.faction === 'killer');
  const ch = state.characters.find((c) => c.id === killerPiece?.characterId);
  const folder = killerArtFor(killerPiece?.characterId ?? null, ch?.name)?.folder;
  const file = (KILLER_EVOLUTION_CARDS[folder ?? ''] ?? []).find((e) => e.cardId === cardId)?.file;
  return folder && file ? `/Image/Killers/${folder}/${file}` : null;
}

/**
 * 【處決】是雕像的特殊牌：不加攻击力，但要能被打出 ——
 * 打完后等目标掷完防御骰，再按「力量 vs 防御」判定是否消灭。
 */
/**
 * 「或」牌：把一组效果翻译成一句人话，给杀手选。
 *
 * ⚠ 这里必须覆盖**所有会出现在 `alternatives` 里的 op**，
 * 否则 `default` 会直接把英文 op 名显示给玩家（以前
 * `moveCoreToAdjacent` / `senseRange` / `stealthToPassage` 就是这样漏出来的）。
 * 客户端的 3 张「或」牌：
 *  - 傳送聚合：`teleportToCore` / `moveCoreToAdjacent`
 *  - 红外探測：`senseColor` / `senseRange`
 *  - 恐詭管道：`stealthAndMove` / `stealthToPassage`
 */
function describeEffectGroup(
  group: Array<{ op: string; value?: unknown; min?: number }>,
  /**
   * 【保護色】持有这张进化卡牌时，「恐詭管道」的落点是**整张地图** ——
   * 按钮文案要跟着变，否则写着"带秘密通道的地点"、实际满地图都能点。
   */
  passageAnywhere = false,
): string {
  return group
    .map((fx) => {
      switch (fx.op) {
        case 'move':
          return `〔移動〕×${typeof fx.min === 'number' && fx.min > 0 ? `${fx.min}-` : '0-'}${fx.value}`;
        case 'stealth':
          return '〔潛行〕';
        case 'senseAllNoise':
          return '〔感知〕所有响声地点';
        case 'senseRoom':
          return '〔感知〕任意一个地点';
        case 'senseColor':
          return '〔感知〕一个颜色区域';
        /** 红外探測：`senseRange(state, 距离)` —— 距离内的所有地点 */
        case 'senseRange':
          return `〔感知〕距离 ${typeof fx.value === 'number' ? fx.value : 1} 内的所有地点`;
        case 'searchSurvivors':
          return '〔搜索〕';
        case 'attackValue':
          return `本次攻击 +${fx.value}`;
        case 'addFearRange':
          return `〔驚嚇〕距离 ${fx.value} 内`;
        /** 恐詭管道：潜行到任意一个带秘密通道的地点（保護色 → 任何地点） */
        case 'stealthToPassage':
          return passageAnywhere
            ? '〔潛行〕到任意一个地点（保護色）'
            : '〔潛行〕到任意一个带有秘密通道的地点';
        /** 恐詭管道的基础用法：潜行 + 移动 0-1（等价于 stealthAndMove） */
        case 'stealthAndMove':
          return `〔潛行〕×${typeof fx.min === 'number' && fx.min > 0 ? `${fx.min}-` : '0-'}${typeof fx.value === 'number' ? fx.value : 1}`;
        /** 傳送聚合：传送到一个带核心标记或封堵标记的地点 */
        case 'teleportToCore':
          return '传送到一个带有核心标记或封堵标记的地点';
        /** 傳送聚合的另一种用法：把 1 个核心标记移到相邻地点 */
        case 'moveCoreToAdjacent':
          return '移动任意一个核心标记到一个相邻地点';
        default:
          return fx.op;
      }
    })
    .join(' ＋ ');
}

/**
 * 这张牌现在能不能打（杀手回合内）。
 *
 * - 多时机牌（`timings`）：只认杀手回合的三个阶段 `fast`/`slow`/`special`；
 *   `attack` 时机不在这里判 —— 它属于**遭遇的攻击时机**，由遭遇流程自己处理。
 * - 普通牌：按 `speed` 判阶段。
 */
function cardPlayableAtStep(
  state: PublicSnapshot,
  card: { timings?: string[] } | undefined,
  speed: string | undefined,
  killerStep: string,
  killerChoice: string | null,
): boolean {
  void state;
  const allTimings: string[] = card?.timings ?? [];
  const turnTimings = allTimings.filter(
    (t) => t === 'fast' || t === 'slow' || t === 'special',
  );
  if (turnTimings.length) {
    if (!turnTimings.some((t) => t === killerStep)) return false;
    if (killerStep === 'main' && killerChoice === 'actions') return false;
    return true;
  }
  if (killerStep === 'fast') return speed === 'fast';
  if (killerStep === 'main') return speed === 'special' && killerChoice !== 'actions';
  return speed === 'slow';
}

function isStatueExecuteCard(card: { id: string } | undefined): boolean {
  return Boolean(card && /^statue_execute$/.test(card.id));
}

const ACTION_SCALE_KEY = 'nh_action_scale';
const ACTION_SCALE_MIN = 0.5;
const ACTION_SCALE_MAX = 1.5;
const ACTION_SCALE_STEP = 0.05;

/**
 * 【变体3】计划能力里**额外行动**那几条的短标签（「额外行动」窗口里的按钮文案）。
 * 卡面原文太长，塞进按钮里会把行动区撑爆；认不出来的就用原文。
 */
const PLAN_EXTRA_LABEL: Record<string, string> = {
  extraMove12: '本小回合额外移动 +2 格',
  healClearFear: '治疗自己并移除所有恐惧',
  noiseOnPlanMarker: '在带计划标记的地点发出响声',
};
/** 【变体3】计划能力里**特殊行动**那几条的短标签（「特殊行动」区按钮文案） */
const PLAN_SPECIAL_LABEL: Record<string, string> = {
  spendToolboxForKey: '弃工具箱取钥匙（限主要出口）',
  finishRepairNow: '弃 3 个工具箱立刻完成修理',
  placePlanMarker: '弃工具箱在本地点放计划标记',
  spendAmuletDraw3: '弃古代护符抽 3 张',
  moveThroughPassage: '移动通过一条秘密通道',
};

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

/**
 * 选择界面的角色顺序（从上往下）。
 * 按角色编号排：killer1..killer9 / survivor1..survivor6，
 * 不依赖 content 文件的扫描顺序，保证界面显示稳定。
 */
function characterOrder(id: string | null | undefined): number {
  const m = /^(killer|survivor)(\d+)$/.exec(id ?? '');
  if (!m) return 9999;
  /** 与 server/src/content/loader.ts 的 characterOrder 保持一致：杀手在前、幸存者在后 */
  return (m[1] === 'killer' ? 0 : 1000) + Number(m[2]);
}

/**
 * 【解散房间】最顶栏。
 *
 * 规则（用户要求）：除观众以外所有人都有这个按钮；点一下不会立刻散伙，
 * 而是进入"等其他人确认"的状态；**所有人都确认之后**才退回主界面、解散房间。
 * 所以这里有两种形态：还没人发起时是一颗按钮，已经有人发起时是确认面板。
 */
function DisbandBar({ state, onAction }: Pick<Props, 'state' | 'onAction'>) {
  if (!state.canRequestDisband) return null;
  const d = state.disband ?? null;
  if (!d) {
    return (
      <div className="row disband-bar">
        <button
          type="button"
          className="ghost-btn"
          onClick={() => void onAction({ type: 'requestDisband' })}
        >
          解散房间
        </button>
      </div>
    );
  }
  return (
    <div className="panel stack disband-bar">
      <strong>{d.requestedByName} 发起【解散房间】，等其他人确认</strong>
      <p className="muted">
        已确认：{d.confirmed.length ? d.confirmed.join('、') : '（无）'}
        {d.waiting.length ? ` ｜ 还差：${d.waiting.join('、')}` : ' ｜ 全员已确认，房间即将解散'}
      </p>
      <div className="row">
        {!d.youConfirmed && (
          <button type="button" className="primary" onClick={() => void onAction({ type: 'confirmDisband' })}>
            确认解散
          </button>
        )}
        <button type="button" onClick={() => void onAction({ type: 'cancelDisband' })}>
          取消解散
        </button>
      </div>
    </div>
  );
}

/** 选角色大厅：选杀手/幸存者、准备、房主开打 */
export function LobbyView({ state, isHost, error, onAction, onLeave, initialMoreSettingsOpen = false }: Props) {
  /**
   * 【更多设置】折叠：promo（替换牌堆）/ 变体1 / 变体2 按这个顺序收在里面
   * （用户要求：加一个【更多设置】按钮把它们收进去）。
   */
  const [moreSettingsOpen, setMoreSettingsOpen] = useState(initialMoreSettingsOpen);
  const killers = state.characters
    .filter((c) => c.faction === 'killer')
    .sort((a, b) => characterOrder(a.id) - characterOrder(b.id));
  const survivors = state.characters
    .filter((c) => c.faction === 'survivor')
    .sort((a, b) => characterOrder(a.id) - characterOrder(b.id));
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
        : state.mode === '2v3'
          /** 2对3：2 名杀手 + 3 名幸存者，各自选自己的角色 */
          ? multiKillers === 2 && multiSurvs === 3
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
      <DisbandBar state={state} onAction={onAction} />
      <div className="panel stack">
        <h2>房间 {state.roomCode}</h2>
        <p className="muted">
          {solo
            ? `单人热座：必须选好 1 名杀手和 ${neededSurv} 名幸存者。你依次操控三名幸存者，再操控杀手。`
            : duo
              ? `1 对 1：两人加入后一人选杀手，一人点选 ${neededSurv} 名幸存者并操控她们。同学在同一 WiFi 打开本页，输入房间码 ${state.roomCode} 加入。`
              : vs2
                ? `1对2：三人加入后一人选杀手，两人点选 ${neededSurv} 名幸存者并共控她们。一般行动和额外行动需另一人确认，交换物品不用。同学在同一 WiFi 打开本页，输入房间码 ${state.roomCode} 加入。`
                : state.mode === '2v3'
                  ? `2对3：必须凑齐 2 名杀手 + 3 名幸存者（共 5 人）。两名杀手**各有一套牌库、手牌与行动区**，共用地图与战报；开局两人各选先后手（一致才生效），每轮交替行动。开局钥匙进度 +1、修理进度 +1。同学在同一 WiFi 打开本页，输入房间码 ${state.roomCode} 加入。`
                  : `1对3：必须凑齐 1 名杀手 + ${neededSurv} 名幸存者。每人只选并操控自己的角色；幸存者只能交出自己的物品，给予或互换需对方确认，栏满只能互换。全员选角并准备后由房主开始。同学在同一 WiFi 打开本页，输入房间码 ${state.roomCode} 加入。`}
          {' '}地图：<strong>{state.map.name}</strong>
        </p>
        <p className="muted">
          阵容 {rosterOk ? '已齐' : '未齐'}：杀手{' '}
          {solo ? (state.soloKillerCharacterId ? 1 : 0)
            : duo || vs2 ? (duoKillerReady ? 1 : 0)
              : multiKillers}
          /{state.mode === '2v3' ? 2 : 1}
          {state.mode === '2v3' ? '（2对3 需要 2 名杀手）' : ''}
          ，幸存者 {solo || duo || vs2 ? soloSurvIds.length : multiSurvs}/{state.mode === '2v3' ? 3 : neededSurv}
        </p>
        {isHost && (
          <div className="stack">
            <span className="muted">选择地图（换图后所有人会看到新底图）</span>
            <div className="row">
              {(state.playableMaps ?? []).map((m) => (
                <button
                  key={m.id}
                  type="button"
                  className={state.map.id === m.id ? 'primary' : undefined}
                  onClick={() => onAction({ type: 'setMap', mapId: m.id })}
                >
                  {m.name}
                </button>
              ))}
            </div>
          </div>
        )}
        {/* 设置：可选规则 */}
        {isHost && (
          <div className="stack">
            <div className="row">
              <span className="muted">设置</span>
              <button type="button" onClick={() => setMoreSettingsOpen((v) => !v)}>
                【更多设置】{moreSettingsOpen ? '收起' : '展开'}
              </button>
            </div>
            {moreSettingsOpen && (
              <>
                <div className="row">
                  <button
                    type="button"
                    className={state.replacementDeck ? 'primary' : undefined}
                    onClick={() =>
                      onAction({ type: 'setReplacementDeck', on: !state.replacementDeck })
                    }
                  >
                    Promo：{state.replacementDeck ? '开' : '关'}
                  </button>
                </div>
                {state.replacementDeck && (
                  <p className="muted">
                    搜索牌堆里的 1 个手斧、1 瓶威士忌酒瓶、1 张石灰粉 会换成
                    鸿运当骰、煤油灯、神秘包裹。
                  </p>
                )}
              </>
            )}
          </div>
        )}
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
              1对2
            </button>
            <button
              type="button"
              className={!solo && !duo && !vs2 && state.mode !== '2v3' ? 'primary' : undefined}
              onClick={() => onAction({ type: 'setMode', mode: 'multi' })}
            >
              1对3
            </button>
            <button
              type="button"
              className={state.mode === '2v3' ? 'primary' : undefined}
              onClick={() => onAction({ type: 'setMode', mode: '2v3' })}
            >
              2对3
            </button>
          </div>
        )}
        {/**
         * **【变体1】特性卡开关 + 生存难度**（房主选，开局前可改；所有模式都能开）。
         *
         * 四档难度**幸存者侧完全一样**（每人抽 2 选 1），差别只在杀手侧：
         * 简单不抽 / 普通 2选1 / 困难 4选2 / 噩梦 6选3。
         */}
        {moreSettingsOpen && isHost && (state.phase === 'lobby' || state.phase === 'characterSelect') && (
          <div className="panel stack">
            <div className="row">
              <button
                type="button"
                className={state.variant1 ? 'primary' : undefined}
                onClick={() => onAction({ type: 'setVariant1', on: !state.variant1 })}
              >
                【变体1】特性卡：{state.variant1 ? '开' : '关'}
              </button>
              {state.variant1 && (
                <span className="muted">
                  生存难度：
                  {(
                    [
                      ['easy', '简单'],
                      ['normal', '普通'],
                      ['hard', '困难'],
                      ['nightmare', '噩梦'],
                    ] as const
                  ).map(([key, label]) => (
                    <button
                      key={key}
                      type="button"
                      className={(state.traitDifficulty ?? 'normal') === key ? 'primary' : undefined}
                      style={{ marginLeft: '0.25rem' }}
                      onClick={() => onAction({ type: 'setTraitDifficulty', difficulty: key })}
                    >
                      {label}
                    </button>
                  ))}
                </span>
              )}
            </div>
            {state.variant1 && (
              <p className="muted">
                {solo ? '单人' : duo ? '1对1' : vs2 ? '1对2' : state.mode === '2v3' ? '2对3' : '1对3'}：
                幸存者每人抽 2 张选 1 张；杀手侧
                {(state.traitDifficulty ?? 'normal') === 'easy'
                  ? '不抽特性卡'
                  : (state.traitDifficulty ?? 'normal') === 'normal'
                    ? '每名杀手抽 2 选 1'
                    : (state.traitDifficulty ?? 'normal') === 'hard'
                      ? '每名杀手抽 4 选 2'
                      : '每名杀手抽 6 选 3'}
                。一局不会发出重复的特性卡，幸存者先选、杀手后选。
              </p>
            )}
            {/**
             * **【变体3】计划卡开关**（房主选，开局前可改；所有模式都能开）。
             *
             * 开了之后开局给幸存者方**随机发 2 张计划卡**；他们在每个大回合的
             * 发现阶段之前可以确认 / 改变计划（要所有幸存者玩家同意）。
             * **杀手看不到这些卡。**
             */}
            <div className="row" style={{ marginTop: '0.4rem' }}>
              <button
                type="button"
                className={state.variant3 ? 'primary' : undefined}
                onClick={() => onAction({ type: 'setVariant3', on: !state.variant3 })}
              >
                【变体3】计划卡：{state.variant3 ? '开' : '关'}
              </button>
            </div>
            {state.variant3 && (
              <p className="muted">
                开局给幸存者方随机发 2 张计划卡。他们在**发现阶段之前**可以确认 / 改变计划
                （每次都要所有幸存者玩家同意）；**发现阶段结束后**按**人物位置**判定能不能推进进度，
                每个大回合最多推进一条。整张计划完成后全队获得它的能力。
                **杀手完全看不到这些卡。**
              </p>
            )}
          </div>
        )}

        {/**
         * **【变体2】「分头行动」开关**（用户命名：分头行动 = 变体2）。
         *
         * ⚠ **只有 1对3 / 2对3 能选**（`multi` / `2v3`）—— 这里直接按模式白名单判断，
         * 服务端 `setSplit` 也有一道同样的校验。
         *
         * 打开后：杀手杀人**不结束游戏**（要全员逃脱或被杀死才结束）、
         * 钥匙单独保管且不报告杀手、每名幸存者各自结算胜利。
         */}
        {moreSettingsOpen &&
          (state.mode === 'multi' || state.mode === '2v3') &&
          (state.phase === 'lobby' || state.phase === 'characterSelect') && (
          <div className="row">
            <button
              type="button"
              className={state.split ? 'primary' : undefined}
              onClick={() => onAction({ type: 'setSplit', split: !state.split })}
            >
              【变体2】分头行动：{state.split ? '开' : '关'}
            </button>
            <span className="muted">
              杀手每杀死一人就升一级，且**杀人不结束游戏**；钥匙各自保管、不报告杀手；
              攒到 {state.splitEscapeKeys ?? 3} 把钥匙站在出口
              （或拿秘密地图站到隐藏出口），**下个大回合一开始就自动单独逃脱**、不花行动；
              全员逃脱或被杀死后各自结算胜负（0–1 人：杀手失败，2 人：胜利，3 人：完全胜利）。
            </span>
          </div>
        )}
        {/**
         * **「分头行动」选先手**（选角后、开局前，和 2v3 选杀手先后同一时机）。
         *
         * 规则：第一个大回合由他先做一般行动，然后**从左往右轮**；
         * 每个大回合结束后先手自动后移一位（所以这里只管第一回合的）。
         *
         * ⚠ **开局之后就藏起来**：服务端在 `round > 1` 时会拒绝这个操作，
         * 留着按钮只会让人点了报错。开局后先手是谁由幸存者栏的「★ 先手」显示。
         */}
        {moreSettingsOpen && state.split && (state.phase === 'lobby' || state.phase === 'characterSelect') && (
          <div className="panel stack">
            <strong>【变体2】分头行动：选本大回合的先手</strong>
            <p className="muted">
              第一个大回合由他先做一般行动，然后按座位从左往右轮；之后每个大回合自动后移一位。
              {state.splitFirstId
                ? `当前先手：${state.players.find((p) => p.id === state.splitFirstId)?.name ?? '—'}`
                : '（还没选，按座位第一个先手）'}
            </p>
            <div className="row">
              {state.players
                .filter((p) => p.faction === 'survivor')
                .map((p) => (
                  <button
                    key={`split-first-${p.id}`}
                    type="button"
                    className={state.splitFirstId === p.id ? 'primary' : undefined}
                    onClick={() => onAction({ type: 'pickSplitFirst', playerId: p.id })}
                  >
                    {p.name}
                  </button>
                ))}
            </div>
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
                      soloSurvIds.length ? `幸存者：${soloSurvNames}` : '幸存者：未选',
                    ].join(' · ')
                  : duo && p.faction === 'survivor'
                    ? soloSurvIds.length
                      ? `幸存者：${soloSurvNames}`
                      : '幸存者：未选'
                    : vs2 && p.faction === 'survivor'
                      ? soloSurvIds.length
                        ? `共控幸存者：${soloSurvNames}`
                        : '幸存者：未选'
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
            <h3>选择幸存者（{soloSurvIds.length}/{neededSurv}）</h3>
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
          {/**
           * 女王对局：十字弩持有者改为**进入游戏后**在幸存者行动区指定
           * （不在这里选）。
           */}
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
                幸存者
              </button>
              <button
                type="button"
                onClick={() => onAction({ type: 'setFaction', faction: 'spectator' })}
                title="观战：不占座位，最多 3 人"
              >
                观众
              </button>
            </div>
            {state.you.faction === 'spectator' && (
              <p className="muted">
                你是【观众】：不占杀手 / 幸存者座位，开局不需要「准备」。
                进游戏后**默认幸存者界面**，行动区可以随时切换到杀手视角。
              </p>
            )}
            {(duo || vs2) && (
              <p className="muted">
                {duo
                  ? `一人选杀手并选角色，另一人选幸存者并点选 ${neededSurv} 名角色。`
                  : `一人选杀手并选角色，两人选幸存者并共同点选 ${neededSurv} 名角色。`}
              </p>
            )}
            {/**
              * 2对3：两名杀手各选一个先后手偏好，**两人一致才生效**。
              * 两人都选同一个（都先 / 都后）时按座位顺序。
              */}
            {state.mode === '2v3' && state.you.faction === 'killer' && (
              <div className="stack">
                <h3>先后手（两人一致才生效）</h3>
                <p className="muted">
                  你选一个偏好；两名杀手选的**一致**才生效（都选先手 / 都选后手也算一致，那就按座位顺序）。
                  每轮结束后先手与后手互换。
                </p>
                <div className="row">
                  <button
                    type="button"
                    className={state.you.orderPick === 'first' ? 'primary' : undefined}
                    onClick={() => onAction({ type: 'pickKillerOrder', order: 'first' })}
                  >
                    我要先手
                  </button>
                  <button
                    type="button"
                    className={state.you.orderPick === 'second' ? 'primary' : undefined}
                    onClick={() => onAction({ type: 'pickKillerOrder', order: 'second' })}
                  >
                    我要后手
                  </button>
                </div>
                <p className="muted">
                  {state.killerOrderDecided
                    ? `顺序已定：先手 ${state.players.find((p) => p.id === state.killerTurnOrder?.[0])?.name ?? '？'}。换偏好后需再点「准备」。`
                    : '还没定：两名杀手都选完且一致后生效。'}
                </p>
              </div>
            )}
          </div>

          {(duo || vs2) && state.you.faction === 'survivor' ? (
            <div className="panel stack">
              <h3>选择幸存者（{soloSurvIds.length}/{neededSurv}）</h3>
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
                    ? '先选杀手阵营，再选 1 名杀手角色。幸存者那边两人一起点选 3 名角色。'
                    : state.mode === '2v3'
                      ? '先选阵营，再选 1 名角色。2对3：**两名**杀手 + 3 名幸存者，每人只操控自己；两名杀手有自己的牌库与行动区。'
                      : `先选阵营，再选 1 名角色。1对3：杀手 1 人、幸存者 ${neededSurv} 人，每人只操控自己。`}
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
            ? `选齐 1 名杀手和 ${neededSurv} 名幸存者，并准备后才能开始。`
            : duo
              ? `两人分别选好杀手与 ${neededSurv} 名幸存者，并都准备后才能开始。`
              : vs2
                ? `三人：1 名杀手 + 2 名幸存者操控者点齐 ${neededSurv} 名角色并都准备后才能开始。`
                : `选齐 1 名杀手和 ${neededSurv} 名幸存者，并全员准备后才能开始。`}
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
    (t) => t.kind === 'suitcase' || t.kind === '手提箱',
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

/** 你现在用哪一边的眼睛看棋盘（幸存者看不见杀手潜行位置） */
/**
 * 【变体1】开局选特性卡的弹窗。
 *
 * 每人从牌堆抽 2 张（杀手按难度抽 2/4/6 张），选 1/2/3 张作为自己的特性；
 * **抽出来没选中的那张直接弃掉**（一局不会发出重复的特性卡）。
 * 每一张都能点「放大看」，选满张数才能确认。
 */
function TraitPickOverlay({
  pick,
  defs,
  onConfirm,
  onZoom,
}: {
  pick: { playerId: string; playerName: string; options: string[]; keep: number };
  defs: TraitDef[];
  onConfirm: (ids: string[]) => void;
  onZoom: (src: string, caption: string) => void;
}) {
  const [picked, setPicked] = useState<string[]>([]);
  const byId = new Map(defs.map((d) => [d.id, d]));
  const toggle = (id: string) =>
    setPicked((cur) => {
      if (cur.includes(id)) return cur.filter((x) => x !== id);
      /** 选满了再点新的：把最早选的那张顶掉（避免"必须先取消再选"的别扭操作） */
      if (cur.length >= pick.keep) return [...cur.slice(1), id];
      return [...cur, id];
    });
  return (
    <div className="hud-overlay">
      <div className="hud-overlay-card trait-pick-card" onClick={(e) => e.stopPropagation()}>
        <div className="hud-overlay-head">
          <h3>
            【变体1】为「{pick.playerName}」选特性卡（{picked.length}/{pick.keep}）
          </h3>
        </div>
        <p className="muted">
          抽到 {pick.options.length} 张，选 {pick.keep} 张作为他的特性。
          没选中的会直接弃掉，本局不会再出现。
        </p>
        <div className="trait-pick-grid">
          {pick.options.map((id) => {
            const def = byId.get(id);
            const on = picked.includes(id);
            return (
              <button
                key={id}
                type="button"
                className={`trait-pick-item${on ? ' picked' : ''}`}
                onClick={() => toggle(id)}
              >
                {def ? (
                  <img
                    src={encodeURI(def.art)}
                    alt={def.name}
                    draggable={false}
                    title="点图片放大查看（点卡片其它地方 = 选中）"
                    /**
                     * **点图片 = 只看大图**（用户要求：不要"放大看"按钮，点图就放大）。
                     * 所以这里阻止冒泡，免得顺手把卡片也选/取消选中了。
                     */
                    onClick={(e) => {
                      e.stopPropagation();
                      onZoom(
                        def.art,
                        `${def.name}（${def.faction === 'killer' ? '杀手' : '幸存者'}特性）`,
                      );
                    }}
                  />
                ) : (
                  <span>{id}</span>
                )}
                <span className="trait-pick-name">{def?.name ?? id}</span>
                <span className="trait-pick-text">{def?.text ?? ''}</span>
              </button>
            );
          })}
        </div>
        <div className="row">
          <button
            type="button"
            className="primary"
            disabled={picked.length !== pick.keep}
            onClick={() => onConfirm(picked)}
          >
            确认（{picked.length}/{pick.keep}）
          </button>
          <span className="muted">
            点图片可放大查看；点卡片其它地方选中／取消。选满 {pick.keep} 张才能确认。
          </span>
        </div>
      </div>
    </div>
  );
}

/** 你现在用哪一边的眼睛看棋盘（幸存者看不见杀手潜行位置） */
export function viewerFactionOf(state: PublicSnapshot): Faction | null {
  /**
   * 女王局的**十字弩指定**：这一步是**幸存者**决定的（第 1 回合之前），
   * 而且必须**先于**下面那些"按阶段判阵营"的分支 ——
   * 因为 `crossbowSetup` 不在 `survivorMain`，`state.you` 会被解析成
   * **杀手棋子**，于是这里会误判成杀手界面、面板根本不显示。
   *
   * ⚠ **但不能无脑返回 `'survivor'`** —— 那样**杀手玩家也会被切到幸存者界面**
   * （用户报的："幸存者选十字弩时杀手方会看到幸存者界面"）。
   * 谁能决定这一步由服务端的 `canPickCrossbowHolder` 说了算：
   * 它 = 这个操控者**手上有存活幸存者棋子**。纯杀手玩家就是 false → 留在杀手界面。
   */
  if (state.phase === 'crossbowSetup') {
    return state.canPickCrossbowHolder ? 'survivor' : 'killer';
  }
  /**
   * 【变体1】开局选特性卡：**按"现在轮到谁选"决定界面**。
   *
   * ⚠ 单人 / 1对1 / 1对2 里一个操控者管多个棋子（幸存者先选、杀手后选），
   * 所以轮到他手上的**杀手**选特性时**必须切到杀手界面** ——
   * 以前这里没有分支，于是"选杀手特性时还是幸存者界面"（用户报的）。
   */
  if (state.phase === 'traitDraft') {
    const pick = state.yourTraitPick;
    if (pick) {
      const who = state.players.find((p) => p.id === pick.playerId);
      if (who?.faction === 'killer') return 'killer';
      if (who?.faction === 'survivor') return 'survivor';
    }
    /** 还没轮到自己：还在等杀手选就给杀手界面，否则留在幸存者界面等 */
    const waiting = (state.traitPickerIds ?? [])
      .map((id) => state.players.find((p) => p.id === id)?.faction)
      .filter(Boolean);
    if (waiting.includes('killer') && !waiting.includes('survivor')) return 'killer';
    return 'survivor';
  }
  /**
   * 【墓穴】坍塌收尾：这一步不是"谁的回合"，而是"**轮到谁离开废墟**"。
   *
   * ⚠ 必须排在**最前面** —— 坍塌是"杀手升级"触发的同时发生的，
   * 所以 `pendingEvolutionAck` 和 `pendingCollapseMoves` 会**同时存在**；
   * 而下面 solo 那支一看到 `pendingEvolutionAck` 就返回 'killer'，
   * 于是**被压到的幸存者玩家界面突然变成杀手界面**、自己的坍塌移动面板
   * 被顶掉（用户报的"什么也点不了"）。
   *
   * 服务端 `resolveYouForController` 也是把 collapseMover 排在最前，
   * 所以 `state.you` 已经是"该走的那个人"，直接按他的阵营显示即可。
   */
  if (state.pendingCollapseMoves && !state.pendingCollapseMoves.waiting) {
    return state.you.faction === 'survivor' ? 'survivor' : 'killer';
  }
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
    /**
     * **开局准备阶段**按"谁来决定"分界面：
     *  - `statueSetup` 雕像选主雕像（杀手自己选）→ 杀手界面
     *  - `trapSetup`   女猎手布陷阱（杀手自己布）→ 杀手界面
     * （`crossbowSetup` 已经在函数开头处理了 —— 它是**幸存者**决定的）
     */
    if (state.phase === 'trapSetup' || state.phase === 'statueSetup') {
      return 'killer';
    }
    return 'survivor';
  }
  if (state.pendingAmulet && state.you.id === state.pendingAmulet.playerId) {
    return 'survivor';
  }
  return state.you.faction;
}

/**
 * 【观众】的界面：
 *  - **一开始默认幸存者界面**（不管现在是谁的回合）
 *  - 行动区只有一个按钮：切到另一边
 *  - 观众**不做任何操作**（`controllingActive` 为 false，所以不会出现行动按钮）
 */
const SPECTATOR_TOGGLE: Record<'survivor' | 'killer', 'killer' | 'survivor'> = {
  survivor: 'killer',
  killer: 'survivor',
};

/**
 * 【一般行动的确认】—— 现在挂在**行动区**里，不再用浏览器弹窗。
 *
 * 以前这里是 `window.confirm()`：它不只是"弹一句"，还会
 * **遮住整个棋盘、并且冻住主线程** —— 于是刚加的移动/摸牌动画根本看不见
 * （用户反馈"总是有弹窗确认，导致这些动态效果都看不到"）。
 *
 * 现在只把"待确认的动作"挂起来，由行动区渲染一条确认栏；
 * 点「确定」才真的发出去，地图全程不被遮挡。
 * `label` 会原样显示给玩家，所以要写清楚"要做什么"。
 */
type PendingAct = { label: string; run: () => void };

/** 杀手视角可以先把幸存者立绘摆在地图上（只自己看得见，不算正式位置） */
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
/**
 * 【墓穴】坍塌收尾面板要显示什么（**纯函数**，方便单独验证）。
 *
 * 规则：坍塌后屋里的人**一个一个**选择移动一步离开 ——
 * 所以任意时刻只有一个人的面板是"可操作"的，其他人只看得到在等谁。
 *
 * @returns `null` = 没有坍塌收尾；否则给出房间名、轮到谁、能去哪。
 */
export function collapseMovePanelFor(
  state: Pick<PublicSnapshot, 'pendingCollapseMoves' | 'map'>,
  displayName: (roomId: string) => string,
): {
  roomLabel: string;
  name: string;
  waiting: boolean;
  isKiller: boolean;
  faction: Faction | null;
  options: Array<{ roomId: string; label: string }>;
} | null {
  const pend = state.pendingCollapseMoves;
  if (!pend) return null;
  return {
    roomLabel: displayName(pend.roomId),
    name: pend.name,
    waiting: Boolean(pend.waiting),
    isKiller: Boolean(pend.isKiller),
    /** 轮到的这个人是哪一方的（决定这块面板画在哪个界面上） */
    faction: pend.faction ?? (pend.isKiller ? 'killer' : null),
    options: pend.waiting
      ? []
      : (pend.options ?? []).map((roomId) => ({ roomId, label: displayName(roomId) })),
  };
}

export function GameView({ state, error, onAction, onLeave, cursors = [], onCursorRoom, initialExtraOpen = false, initialPlanOpen = false, initialMoreSettingsOpen = false }: Props) {
  const [pendingCard, setPendingCard] = useState<string | null>(null);
  const [pendingPayIds, setPendingPayIds] = useState<string[]>([]);
  const [payForCard, setPayForCard] = useState<string | null>(null);
  /**
   * 正在为哪一类打出付费：
   *  - `killerCard`      普通打牌（`playKillerCard`）
   *  - `encounterAttack` 遭遇攻击阶段打牌（`playEncounterAttack`）
   * 两者费用规则一样，但结算走的 action 不同。
   */
  const [payPurpose, setPayPurpose] = useState<'killerCard' | 'encounterAttack' | null>(null);
  const [payIds, setPayIds] = useState<string[]>([]);
  const [fleePick, setFleePick] = useState(false);
  /**
   * 幸存者移动的**路径草稿**：玩家一步一步点出来的完整路径（含起点）。
   *
   * 为什么不用「单个目的地」：那样服务端只能自己算最短路径，
   * 玩家点 R3 再点 B5，实际会走成 B2→B5 —— 走的不是他选的路线。
   * 现在路径由玩家点，确认后原样发给服务端（`move` 的 `path`）。
   *
   * **杀手不用这个** —— 杀手走原来的 `moveDest`（单个目的地）。
   */
  const [moveDraftRooms, setMoveDraftRooms] = useState<string[]>([]);
  /**
   * 威廉「短跑冲刺」的路径草稿：和普通移动同一套玩法，
   * 区别是**必须刚好 3 步**才能确认。
   */
  const [sprintDraftRooms, setSprintDraftRooms] = useState<string[]>([]);
  /** 杀手移动的目的地（原样保留，没动） */
  const [moveDest, setMoveDest] = useState<string | null>(null);
  /** 幸存者路径的末端 = 他这次要去的格子（没选任何步时为 null） */
  const survivorMoveDest =
    moveDraftRooms.length > 1 ? moveDraftRooms[moveDraftRooms.length - 1]! : null;
  const [extraDest, setExtraDest] = useState<string | null>(null);
  const [fleeDest, setFleeDest] = useState<string | null>(null);
  const [blockadeDest, setBlockadeDest] = useState<string | null>(null);
  const standeeSnapKey = useRef<string | null>(null);
  const [pickedNextId, setPickedNextId] = useState<string | null>(null);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [actionScale, setActionScale] = useState(readActionScale);
  const [survLayout, setSurvLayout] = useState<SurvivorLayout>(DEFAULT_SURVIVOR_LAYOUT);
  const [logOpen, setLogOpen] = useState(true);
  /** 战报滚动容器：新的一条写进来后自动滚到底部 */
  const logBoxRef = useRef<HTMLDivElement | null>(null);
  const [extraOpen, setExtraOpen] = useState(initialExtraOpen);
  const [killerInfoOpen, setKillerInfoOpen] = useState(false);
  /** 【变体3】计划卡弹窗（只有幸存者视角有这张卡）；`initialPlanOpen` 只给测试/预览用 */
  const [planOpen, setPlanOpen] = useState(initialPlanOpen);
  const [artZoom, setArtZoom] = useState<{ src: string; caption: string } | null>(null);
  const [defenseItemId, setDefenseItemId] = useState<string | null>(null);
  /**
   * **剛毅之盾**（墓穴遗物）：它**不占"一次防御只能选一件物品"的名额**，
   * 所以单独一个开关，可以和上面那件防御物品同时用。
   */
  const [shieldPicked, setShieldPicked] = useState(false);
  const [trackOpen, setTrackOpen] = useState<TrackPanel | null>(null);
  const [tradeOpen, setTradeOpen] = useState(false);
  const [rulesOpen, setRulesOpen] = useState(false);
  const [rulesSide, setRulesSide] = useState<'survivor' | 'killer'>('survivor');
  const [placeTargetId, setPlaceTargetId] = useState<string | null>(null);
  const [standeeMoveOn, setStandeeMoveOn] = useState(false);
  /** 「移动立绘」被拒绝时的一句话提示（比如点到已坍塌的地点） */
  const [standeeHint, setStandeeHint] = useState<string | null>(null);
  /**
   * 地图右边那一栏（幸存者看的"杀手打出的牌" / 杀手看的"获得的信息"）
   * 是否展开。收起后只留一条竖排的「展开」按钮，地图占满整宽。
   */
  const [mapSideOpen, setMapSideOpen] = useState(true);
  /**
   * **待确认的动作**（一般行动 / 移动 / 拿笔记…）。
   * 挂在行动区里显示，不用 `window.confirm`（那会遮地图、冻住动画）。
   */
  const [pendingAct, setPendingAct] = useState<PendingAct | null>(null);
  /**
   * **挑笔记弹窗里的二次确认**（用户报的「点不了确定」）。
   *
   * 以前点笔记卡走的是 `pendingAct`，而那条确认栏画在**行动区**里 ——
   * "挑笔记"是全屏 `hud-overlay`，正好把行动区盖住 → 确定点不到、笔记拿不了。
   * 现在这类"弹窗里发起的动作"用**弹窗内**的确认，不再往行动区放。
   */
  const [noteConfirm, setNoteConfirm] = useState<{ id: string; name: string } | null>(null);
  /**
   * 【杀手界面】「本大回合战报」的滚动条：**默认停在最新那条**（用户口径：
   * 「最新在下，但是默认显示最新的」）。
   *
   * 所以列表顺序**不动**（旧 → 新），只把滚动位置贴到底；
   * 但如果玩家自己往上翻着看，新战报进来**不要**把他拽回底部。
   */
  const roundLogBoxRef = useRef<HTMLDivElement | null>(null);
  const roundLogStickBottomRef = useRef(true);
  const roundLogCount = (state.roundLogs ?? []).length;
  /** 挑笔记的弹窗收掉时，跟着清掉那个二次确认（免得下次打开还挂着旧的） */
  const georgeNoteOpen = Boolean(state.pendingGeorgeNote);
  useEffect(() => {
    if (!georgeNoteOpen) setNoteConfirm(null);
  }, [georgeNoteOpen]);
  /** 战报多了一条：一直贴底的话就跟着滚到最新（往上翻过就不动） */
  useEffect(() => {
    const el = roundLogBoxRef.current;
    if (!el || !roundLogStickBottomRef.current) return;
    el.scrollTop = el.scrollHeight;
  }, [roundLogCount]);
  /**
   * 【變形 / 戰鬥適應】"从弃牌堆挑牌永久移除"里**已经点选**的那张。
   * 用户要求：要弹窗、列出弃牌堆里的牌（带卡面图片）、**选完再确认**。
   */
  const [discardRemovePick, setDiscardRemovePick] = useState<string | null>(null);
  const [inspectPile, setInspectPile] = useState<PileKind | null>(null);
  /** 在牌堆面板里点开的那一张（放大看牌面） */
  const [pileCardZoom, setPileCardZoom] = useState<{ id: string; name: string } | null>(null);
  const [inspectCardId, setInspectCardId] = useState<string | null>(null);
  /**
   * 【变体1】特殊行动特性 08「紧急救治」：点了按钮后先选**同地点的另一名幸存者**
   * （存的是正在等选人的那张特性卡 id；再点一次同一个按钮就收起）。
   */
  const [traitTargetPick, setTraitTargetPick] = useState<string | null>(null);
  /**
   * 【变体1】特殊行动 02「调度人员」：一次发动要让**同地点的其他幸存者各移动 1–2 步**，
   * 所以逐个选 —— 这里记"还没选的人 / 已经选好的 / 现在轮到谁"。
   */
  const [traitDispatch, setTraitDispatch] = useState<{
    actorId: string;
    current: string;
    queue: string[];
    moves: Array<{ playerId: string; toRoomId: string; steps: number }>;
  } | null>(null);
  /** 【变体1】杀手特性 14「嘲讽战术」：杀手点选手牌来弃（要弃几张由快照给） */
  const [traitDiscardPick, setTraitDiscardPick] = useState<string[]>([]);
  /**
   * 【变体1】**杀手特性"弃 N 张卡牌来发动"的选牌过程**。
   *
   * ⚠ 用户要求「显示的字段不要乱套」：这里**完全独立于打牌支付的
   * `payForCard` / `payPurpose` / `payIds`** —— 那三个是"打出某张牌的代价"，
   * 有自己的文案和金额；这里是"发动特性卡要弃几张"，提示语只说特性卡的事。
   */
  const [traitPay, setTraitPay] = useState<{
    traitId: string;
    traitName: string;
    need: number;
  } | null>(null);
  const [traitPayIds, setTraitPayIds] = useState<string[]>([]);
  const [evoPayIds, setEvoPayIds] = useState<string[]>([]);
  const [extraPick, setExtraPick] = useState<{
    kind: 'whiskey' | 'adrenaline' | 'sprint' | 'noteNoise' | 'traitRoom';
    rooms: string[];
    actorPlayerId?: string;
    noteId?: string;
    /**
     * 【变体1】正在点地图选地点的**特性卡**（`kind === 'traitRoom'` 时用）：
     *  - 速度爆发（01）：选 2–4 步的目的地，步数按实际距离推
     *  - 声音诱饵（13）：任意地点响
     *  - 明智之举（19）：`choice === 'noise'` 时选相邻地点；`'removeBlockade'` 时选要拆的门所在地点
     *  - 迅速反应（20）：相邻地点移动 1 步
     */
    traitId?: string;
    traitChoice?: 'removeBlockade' | 'clearFear' | 'noise';
  } | null>(null);
  /** 乔治的笔记图鉴 / 挑笔记弹窗 */
  const [georgePanelOpen, setGeorgePanelOpen] = useState(false);
  /** 求生者相关物品弹窗（按 3 名幸存者分行显示专属物品） */
  const [survivorItemsOpen, setSurvivorItemsOpen] = useState(false);
  /** 雕像：幸存者的「停滞雕像」选择面板 */
  const [haltStatueOpen, setHaltStatueOpen] = useState(false);
  /**
   * 欧菲莉亚「言语鼓励」：点了「特殊行动」按钮后，在这里列目标让你挑。
   * 和威廉短跑的 `extraPick` 是同一套思路 —— 按钮先出，点了再选。
   */
  const [encouragePicking, setEncouragePicking] = useState<string | null>(null);
  /** 【实验室】急救箱：正在选治疗目标 */
  const [firstAidPicking, setFirstAidPicking] = useState<string | null>(null);
  /**
   * 【城堡】机关大门：正在**点门**（先点一个房间、再点与它相邻的房间 = 选中那扇门）。
   * `gatePicking` = 是否处于选门模式；`gateDoorFrom` = 已点的第一端。
   */
  const [gatePicking, setGatePicking] = useState(false);
  const [gateDoorFrom, setGateDoorFrom] = useState<string | null>(null);
  /**
   * 【城堡 R1】控制杆：**是谁在操作**（弹窗里点的是谁的名字）。
   *
   * 必须记住人：额外行动弹窗是按**每个幸存者**列按钮的，
   * 而发出去的 `placeLeverGate` 要带上 `actorPlayerId`（和宝箱同款），
   * 否则共享控制模式下会记到"当前行动者"头上、然后报「你不在 R1」。
   */
  const [gateActorId, setGateActorId] = useState<string | null>(null);
  /** 【城堡】杀手过门要弃的 3 张牌（客户端先点、确认后一次发出去） */
  const [gatePayIds, setGatePayIds] = useState<string[]>([]);
  /**
   * 【墓穴遗物】鏡之門戶：正在选要传送到哪个 🌀 地点。
   * （遗物**就是背包物品**，没有单独的遗物栏，所以不需要额外的查看状态。）
   */
  const [mirrorPicking, setMirrorPicking] = useState(false);
  /** 这些"选择中"的临时状态在条件消失时要收掉，免得下次进来还亮着 */
  useEffect(() => {
    if (!state.canUseMirrorPortal) setMirrorPicking(false);
  }, [state.canUseMirrorPortal]);
  useEffect(() => {
    if (!state.canUseFirstAidKit) setFirstAidPicking(null);
  }, [state.canUseFirstAidKit]);
  /**
   * 【城堡 R1】控制杆：「现在正在操作控制杆的那个人」还在 R1 吗。
   *
   * ⚠ **不要用 `state.canPlaceLeverGate`** —— 那个字段是"针对 `state.you`"算的，
   * 共享控制模式下常常指向另一个人（甚至带着 `!mainActionUsed`），
   * 用它会出现「点了弹窗里的按钮、点地图却毫无反应 / 状态被立刻收掉」。
   * 这里按**点了按钮的那个人**判，服务端最后还会再校验一次。
   */
  const gateActor = gateActorId ? state.players.find((x) => x.id === gateActorId) : null;
  const gateUsable =
    gatePicking && state.map.id === 'castle' && gateActor?.roomId === 'R1';
  useEffect(() => {
    if (gatePicking && !gateUsable) {
      setGatePicking(false);
      setGateDoorFrom(null);
      setGateActorId(null);
    }
  }, [gatePicking, gateUsable]);
  useEffect(() => {
    if (!state.pendingGatePay) setGatePayIds([]);
  }, [state.pendingGatePay]);
  /** 十字弩：已选中的僵尸 id（至多 pendingCrossbow.max 个） */
  const [crossbowPicked, setCrossbowPicked] = useState<string[]>([]);
  const toggleCrossbowPick = (zid: string) => {
    setCrossbowPicked((cur) => {
      if (cur.includes(zid)) return cur.filter((x) => x !== zid);
      const max = state.pendingCrossbow?.max ?? 0;
      if (cur.length >= max) return cur;
      return [...cur, zid];
    });
  };
  /** 十字弩待选结束时清空已选 */
  useEffect(() => {
    if (!state.pendingCrossbow) setCrossbowPicked([]);
  }, [state.pendingCrossbow]);
  /** 鸿运当骰：选中的骰子下标 */
  const [diceSelect, setDiceSelect] = useState<number[]>([]);
  /**
   * 杀手手动摆放立绘的本地缓存键。
   *
   * ⚠ **必须带上 `matchId`**：`roomCode` 在"重新开始"后**不变**、棋子 id 也复用，
   * 只按房间码缓存的话，上一局的摆放会被新一局继承（换地图时那些房间 id
   * 甚至在新图上不存在）—— 用户报的"重新开始后立绘不在主要出口"就是这个。
   */
  const placeKey = `nh_place_${state.roomCode}_${state.matchId ?? 'legacy'}_killer`;
  const [placed, setPlaced] = useState<Record<string, string>>(() => readPlacedStandee(placeKey));
  const isActive = state.controllingActive;
  /**
   * 【观众】看哪一边的界面：**默认幸存者**，点按钮切换。
   * 只影响"用哪边的眼睛看"，不影响对局（观众不能操作）。
   */
  const [spectatorView, setSpectatorView] = useState<'survivor' | 'killer'>('survivor');
  const isSpectator = state.you.faction === 'spectator';
  /**
   * 2对3：【查看另一名杀手界面】。
   *
   * 与观众切换同一套思路 —— **只读**：切过去只是把对方的卡牌区/行动区信息显示出来，
   * 所有操作按钮照旧只作用于自己的棋子（对方那套信息里也没有可点的入口）。
   */
  const [otherKillerView, setOtherKillerView] = useState(false);
  const otherKiller = state.mode === '2v3' ? (state.otherKiller ?? null) : null;
  /** 对方信息不可用时（非 2v3、或不是杀手）自动收起，避免留下过期的面板 */
  useEffect(() => {
    if (!otherKiller) setOtherKillerView(false);
  }, [otherKiller]);
  const ch = state.characters.find((c) => c.id === state.you.characterId);
  const enc = state.encounter;
  /**
   * 【单人热座】**手动切换"现在看哪一边"**（用户要求：行动区加一个按钮）。
   *
   * 单人模式一个人管杀手 + 三名幸存者，界面本来靠阶段自动推断；
   * 但自动推断偶尔会和玩家的预期不一致（例如坍塌砸到幸存者时没切过去），
   * 所以给一个随时能自己切的按钮 —— **手动选择优先，直到玩家再切回来**。
   */
  const [manualFaction, setManualFaction] = useState<Faction | null>(null);
  useEffect(() => {
    /** 换模式 / 离开单人局时把手动选择清掉，免得残留到别的模式 */
    if (state.mode !== 'solo') setManualFaction(null);
  }, [state.mode]);
  const viewerFaction = isSpectator
    ? spectatorView
    : (state.mode === 'solo' ? (manualFaction ?? viewerFactionOf(state)) : viewerFactionOf(state));

  useEffect(() => {
    setDefenseItemId(null);
    setShieldPicked(false);
    /**
     * ⚠ **（甲）撤离先选人**：只有"名单里已经点中了正在撤离的那个人"才允许点地图。
     *
     * 以前这里只看 `enc.step === 'flee'`，于是**没轮到的人也以为可以点地图** ——
     * 那正是「点了变成普通移动 / 弹请使用逃离操作」的入口。
     * 现在把"是谁"也纳入判定：`fleeTargetId` 必须是自己。
     */
    setFleePick(enc?.step === 'flee' && enc?.fleeTargetId === state.you.id);
    setFleeDest(null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [enc?.targetId, enc?.step, enc?.fleeTargetId, state.you.id]);
  useEffect(() => {
    setEvoPayIds([]);
  }, [state.pendingWhizSearch, state.pendingOverFearWound?.targetId, state.pendingEvolutionAck?.toLevel]);
  const isSurvivorView = viewerFaction === 'survivor';
  /**
   * **现在是不是"杀手回合期间"** ——
   * 地图右边那两栏（幸存者看的"杀手打出的牌"、杀手看的"获得的信息"）
   * 用户限定只在这段时间显示：
   * 响声报告 / 杀手主阶段 / 遭遇 / 收尾，都算杀手回合。
   */
  const inKillerTurnWindow =
    state.phase === 'noiseReport' ||
    state.phase === 'killerMain' ||
    state.phase === 'encounter' ||
    state.phase === 'upkeep';
  /**
   * 幸运币「不是钥匙」那条：〔移動〕×0-2。
   * 服务端会建一条 `owner: 'survivor'` 的路径草稿，**由本人一步一步点并确认**。
   * 这种情况下即使已经做过一般行动、也不占一般行动，所以单独放行。
   */
  const coinPathDraft =
    isSurvivorView &&
    state.you.faction === 'survivor' &&
    state.pendingPathDraft?.owner === 'survivor';
  /**
   * 幸运币草稿还能走到的格子（从草稿末端起，最多 `max - 已走步数` 步）。
   * 只用于**地图高亮**，点击仍由服务端校验。
   */
  const coinReachableRooms = useMemo(() => {
    const d = state.pendingPathDraft;
    if (!coinPathDraft || !d) return [] as string[];
    const from = d.rooms[d.rooms.length - 1];
    if (!from) return [] as string[];
    const left = Math.max(0, d.max - (d.rooms.length - 1));
    if (left <= 0) return [] as string[];
    const out = new Set<string>();
    let frontier = [from];
    const seen = new Set<string>([from]);
    for (let step = 0; step < left; step++) {
      const next: string[] = [];
      for (const cur of frontier) {
        for (const nb of neighbors(state.map, cur, {
          blockades: state.blockades,
          /** 机关大门：幸存者（幸运币也是幸存者移动）过不去 */
          gateDoor: state.leverGateDoorId ?? null,
        })) {
          if (seen.has(nb)) continue;
          seen.add(nb);
          out.add(nb);
          next.push(nb);
        }
      }
      frontier = next;
    }
    return [...out];
  }, [coinPathDraft, state.pendingPathDraft, state.map, state.blockades, state.leverGateDoorId]);
  const canDraftSurvivorMove =
    (isActive &&
      isSurvivorView &&
      state.phase === 'survivorMain' &&
      state.you.faction === 'survivor' &&
      !state.you.mainActionUsed &&
      !state.you.actedThisRound &&
      !pendingCard &&
      !fleePick &&
      !extraPick &&
      !state.pendingAmulet) ||
    Boolean(coinPathDraft);
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
  /**
   * **「现在正在点地图选点」的统一清单。**
   *
   * ⚠ 这个清单必须**同时**管两件事，少一处就会冒出用户报的那种毛病
   * 「点了好像没反应、也没有高亮」：
   *  1. `onRoomClick` 里「手动摆放立绘」要不要让位（否则点击被摆立绘吃掉）；
   *  2. `Board` 的 `legalMoves` 放行条件 —— 服务端费劲算好的高亮，
   *     客户端这里不认就**一格都不画**（猎手本能、召唤石碑、恐詭管道…全都中招过）。
   *
   * 以后再加"点地图选点"的待选状态，**只往这里加一条**即可。
   */
  const mapPickActive = Boolean(
    state.pendingSensePair ||
      state.pendingPathDraft ||
      state.pendingBlockade ||
      state.pendingBlockadePlace ||
      state.pendingBlockadeJob ||
      state.pendingMoveRange != null ||
      extraPick ||
      fleePick ||
      canDraftMove ||
      /** —— 杀手"点地图选点"的各种待选（以前这里一条都没有 → 高亮全丢）—— */
      state.killerSenseRoomActive ||
      state.pendingSenseRoom != null ||
      state.pendingStatueSeal ||
      (state.pendingPassagePick?.length ?? 0) > 0 ||
      state.pendingAcidPick ||
      (state.pendingTeleportPick?.length ?? 0) > 0 ||
      state.pendingCorePick != null ||
      state.pendingQueenSpawnRooms != null ||
      state.pendingStranglerCoreRooms != null ||
      (state.pendingZombieHordeFrom?.length ?? 0) > 0 ||
      state.pendingZombieHordeTo != null,
  );
  /**
   * 界面上「这次移动要去哪」的统一取值：
   *  - 幸存者普通移动：路径末端（`survivorMoveDest`）
   *  - 短跑冲刺：短跑草稿的末端（必须刚好 3 步）
   *  - 杀手：原来的 `moveDest`（那套没动）
   */
  const activeMoveDest = canDraftSurvivorMove ? survivorMoveDest : moveDest;
  /** 短跑草稿的末端（满 3 步才有值） */
  const sprintDest = sprintDraftRooms.length >= 4 ? sprintDraftRooms[3]! : null;

  /**
   * **封堵时「可点的门」通向哪些房间**。
   *
   * ⚠ 这里**不能用 `state.legalMoves`**（那是"移动范围"）——
   * 封堵常常发生在**杀手移动范围之外**的房间（枝条生长可以封任意带核心标记的地点），
   * 而且慢速阶段 `legalMoves` 本来就是空的。
   * 以前用 `legalMoves.includes(roomId)` 判定，导致**点门被静默吞掉、连高亮都没有**。
   *
   * 正确口径和服务端 `doorsAt` / `isDoorEdge` 一致：
   *  - 只有 **door 边**（未标 `pathType` 或 `pathType === 'door'`）= 「白门」可以封
   *  - 虚线小径（`dash`）、杀手通道（`killer`）等都不能封
   *  - 已经被封的门不能再封
   *  - **机关大门上也不能封**（用户口径：机关大门和封堵不能共存）
   *
   * 另外还要管**「任选门封堵」的先拆阶段**（`pendingBlockadeJob.removeLeft > 0`）：
   * 那时候能点的是**场上已有的封堵**所在的地点（点了就是选它来拆，
   * 服务端 `move` 会把它当成"拆这扇"）。以前这里没这一支，地图点击被
   * 上面那个 `if` 吃掉 —— 只有行动区的按钮能拆。
   */
  const blockadeTargetRooms = useMemo(() => {
    const job = state.pendingBlockadeJob;
    if (job && job.removeLeft > 0) {
      const out: string[] = [];
      for (const b of state.removableBoardBlockades ?? []) {
        if (!out.includes(b.from)) out.push(b.from);
        if (!out.includes(b.to)) out.push(b.to);
      }
      return out;
    }
    const active = Boolean(state.pendingBlockade) || Boolean(state.pendingBlockadePlace);
    if (!active) return [] as string[];
    /**
     * 封堵的「起点房间」优先级：
     *  1. 封堵任务的地点（`pendingBlockadeJob.roomId`，如"就地全封"）
     *  2. `pendingBlockadeRoom`（**枝条生长/茂盛可以在别的地点封**，服务端专门记了这个）
     *  3. 杀手当前所在地点
     */
    const from =
      state.pendingBlockadeJob?.roomId ??
      state.pendingBlockadeRoom ??
      state.you.roomId ??
      null;
    if (!from) return [] as string[];
    const blocked = new Set(state.blockades ?? []);
    const out: string[] = [];
    for (const e of state.map.edges ?? []) {
      const door = !e.pathType || e.pathType === 'door';
      if (!door) continue;
      let other: string | null = null;
      if (e.from === from) other = e.to;
      else if ((e.bidirectional ?? true) && e.to === from) other = e.from;
      if (!other) continue;
      const key = from < other ? `${from}|${other}` : `${other}|${from}`;
      if (blocked.has(key)) continue;
      if (state.leverGateDoorId === key) continue;
      out.push(other);
    }
    return out;
  }, [
    state.pendingBlockade,
    state.pendingBlockadePlace,
    state.pendingBlockadeJob,
    state.pendingBlockadeRoom,
    state.blockades,
    state.leverGateDoorId,
    state.removableBoardBlockades,
    state.map.edges,
    state.you.roomId,
  ]);

  const sharedControl = state.mode === 'solo' || state.mode === 'duo' || state.mode === 'vs2';
  const youMustDiscard = state.pendingItemDiscard?.playerId === state.you.id;
  /**
   * **「我现在能不能做自己的一般行动」**。各模式口径（玩家确认过的规则）：
   *
   *  - **单人 / 1对1 / 1对2**（共享控制）：多名幸存者由同一操作者控制，
   *    **一次只让一名做一般行动** → 必须 `activePlayerId === state.you.id`。
   *    没选行动者时 `activePlayerId` 是 `null` → false，
   *    所以不会「没选人就显示第一个人的特殊行动」。
   *  - **1对3**：每人控制自己的角色，**三人可以同时行动、互不限制**。
   *    所以这里不看 `activePlayerId`（它只有一个值，代表不了"我"），
   *    改看**这名幸存者自己本大回合有没有做过一般行动** ——
   *    `actedThisRound` 是**按人**记的，天然支持同时行动。
   *
   * 用途：**只影响「一般行动」类面板的显示**。
   * 额外行动 / 交换物品**不受此限制**。
   */
  const iAmActingPiece = sharedControl
    ? Boolean(state.activePlayerId) && state.activePlayerId === state.you.id
    : !state.you.actedThisRound;
  /**
   * 十字弩指定是**开局准备步骤**（还没有「当前行动者」），
   * 所以这一步不要求 iAmActingPiece —— 由幸存者先指定谁拿。
   */
  const crossbowSetupStep = state.phase === 'crossbowSetup';
  /**
   * 行内额外行动列表的开关。
   *
   * 这一列用的是 `state.you`，所以只有在**这个人自己可以行动**时才代表他。
   *  - 共享控制模式：`iAmActingPiece` 已经包含「必须选出行使者」，
   *    所以没选人时整个面板不出现。
   *  - 1对3：`iAmActingPiece` = 自己本大回合还没行动，三人各自独立。
   *
   * 想给**别的**幸存者做额外行动，走「额外行动」按钮那个弹窗
   * （那个按钮不受此限制 —— 额外行动不占小回合）。
   */
  const canUseOwnExtras =
    isSurvivorView && (state.phase === 'survivorMain' || state.phase === 'crossbowSetup');
  const soloHint =
    state.mode === 'solo'
      ? !isSurvivorView && (state.phase === 'survivorMain' || state.phase === 'discovery')
        ? '幸存者正在行动'
        : state.pendingSurvivorPick
        ? '单人：在行动区选择下一名幸存者（也可点立绘或状态栏），可随时改选，确认后才开始'
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
            ? '1对1：在行动区选择下一名幸存者（也可点立绘或状态栏），确认后才开始'
            : state.pendingDiscoveryPick
              ? '1对1：在行动区选择谁来翻发现牌'
              : `1对1：你操控 3 名幸存者，当前行动「${state.you.name}」`
          : '1对1：你操控杀手'
        : state.mode === 'vs2'
          ? state.you.faction === 'survivor'
            ? '1对2：两人共控 3 名幸存者。一般行动和额外行动需另一人确认，交换物品不用。'
            : '1对2：你操控杀手。对面两人共控 3 名幸存者。'
          : state.you.faction === 'survivor'
            ? '1对3：你只操控自己的角色。只能交出自己的物品；给予或互换需对方确认。栏满只能互换。额外行动只显示你能做的。'
            : '1对3：你操控杀手。对面 3 名幸存者各自操作。';

  useEffect(() => {
    /** 换人 / 换回合 / 做完一般行动 → 清掉幸存者的路径草稿（杀手那份由服务端管） */
    setMoveDraftRooms([]);
  }, [state.round, state.phase, state.you.id, state.you.roomId, state.you.mainActionUsed]);

  useEffect(() => {
    if (state.phase !== 'survivorMain') {
      setTradeOpen(false);
      setExtraOpen(false);
    }
  }, [state.phase]);

  /** 战报有新内容时滚到底，保证最新一条始终可见 */
  useEffect(() => {
    if (!logOpen) return;
    const box = logBoxRef.current;
    if (box) box.scrollTop = box.scrollHeight;
  }, [state.logs, logOpen]);

  useEffect(() => {
    if (!state.pendingSurvivorPick && !state.pendingDiscoveryPick) setPickedNextId(null);
  }, [state.pendingSurvivorPick, state.pendingDiscoveryPick, state.round]);

  useEffect(() => {
    setDefenseItemId(null);
    setShieldPicked(false);
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
        setMoveDraftRooms([]);
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
    /**
     * ⚠ **缓存的房间 id 必须验证它在这张图上存在**。
     *
     * 本地缓存是按"这一局"存的，但换地图 / 老数据里可能留着**别的地图**的
     * 房间 id（比如上一局是豪宅、这局是小屋）—— 那样立绘会画到一个不存在的
     * 房间里，表现为"开局时幸存者立绘没有摆在主要出口"（用户报的）。
     * 找不到就退回**幸存者起始地点**（地图上的「主要出口」）。
     */
    const validRooms = new Set(state.map.rooms.map((r) => r.id));
    /** 已坍塌的地点也当"不存在"：立绘不能留在废墟上（用户口径） */
    const gone = new Set(state.collapsedRooms ?? []);
    return state.players.map((p) => {
      if (p.faction !== 'survivor') return p;
      const cached = placed[p.id];
      const room = cached && validRooms.has(cached) && !gone.has(cached) ? cached : start;
      return { ...p, roomId: room, placed: true as const };
    });
  }, [
    state.players,
    placed,
    isSurvivorView,
    state.map.rooms,
    state.map.survivorStartRoomId,
    state.collapsedRooms,
  ]);

  const defendItemChoices = usableDefenseItems(state);
  const youHaveTenacity =
    !!ch?.skills.some((s) => s.id === 'tenacity' || s.name.includes('坚韧')) ||
    /威廉/.test(`${ch?.name ?? ''} ${state.you.name}`);
  const startRoom = state.you.roomId;
  const senseFirst = state.pendingSensePair?.firstRoomId;
  const pathDraftRooms = state.pendingPathDraft?.rooms ?? [];
  /**
   * 预览路线的约束**必须和服务端一致**，否则会出现「预览绕远路」或
   * 「预览的路线实际走不通」。
   *
   * 关键：**杀手密道只在「杀手本人在移动」时才计入**。
   * 其他任何移动都不算 —— 包括幸存者用额外行动（肾上腺素 / 威士忌）、
   * 酸液喷吐选相邻地点、核心标记相邻等。所以这里按
   * `state.you.faction`（谁在动）判断，**不能按视角**判断：
   * 单人热座下杀手回合里也可能操控幸存者用额外行动。
   */
  /**
   * **【未命名】进化 1 级：「你可以〔移動〕通过秘密通道」。**
   *
   * 只在**杀手本人移动**时把秘密通道算成一条路 —— 和服务端
   * `killerUsesSecretPassages` + `tryMove` 完全同口径。
   *
   * ⚠ 感知范围 / 惊吓距离 / 恐惧范围这些**距离计算**一律不用它
   * （规则：秘密通道只影响「移动」，不影响任何"几格以内"的判定），
   * 所以这里只喂给 `pathOpts`，绝不要传给 `roomsAtDistance` / `mapDist`。
   */
  const youUsesSecretPassages =
    state.you.faction === 'killer' &&
    (state.killerLevel ?? 1) >= 1 &&
    /killer7|未命名|unidentified/i.test(`${state.you.characterId ?? ''} ${ch?.name ?? ''}`);
  /**
   * **【城堡】机关大门：幸存者绝对不能过** —— 对幸存者来说它和"被封堵的门"
   * 一样是墙。所以幸存者的移动预览、逐格点选都要把它排除掉，
   * 否则会出现"点得动、走不过去"（服务端会拒）。
   *
   * 杀手不一样：他过机关大门要走"弃 3 张牌"的付费流程，
   * 所以**杀手的 `pathOpts` 不带这个**，让服务端去触发付费提示。
   */
  const survivorGateDoor = state.leverGateDoorId ?? null;
  const pathOpts =
    state.you.faction === 'killer'
      ? { allowKiller: true, allowPassages: youUsesSecretPassages }
      : { blockades: state.blockades, gateDoor: survivorGateDoor };
  /** 普通移动的可达上限：优先用服务端算好的 moveLeft（已含被动加成），没有就退回规则值 */
  const moveRange = state.you.moveLeft > 0 ? state.you.moveLeft : state.rules.survivorMoveRange ?? 2;
  /**
   * 预览路线必须同时满足「不被封堵挡住」和「步数在移动力以内」。
   * 否则会出现「画出了路线、但目标房间不可点」的误导
   * （例如绕开封锁要 4 步，而他只有 2 步移动力）。
   */
  const reachablePreview = (path: string[] | null, maxSteps: number) =>
    path && path.length - 1 <= maxSteps ? path : null;
  /**
   * **已经"点选"、等确认的格子**（用户口径：点选后才要高亮）。
   *
   * ⚠ 候选格**不高亮**（棋盘本来就没给候选样式，只有 hover 描边）——
   * 玩家点选哪一格，哪一格才亮成"已选中"（金色，同 `.path-picked`）。
   *
   * 这里把各类"选点待确认"的已选状态统一收进来，免得每加一种选点就漏一个
   * （用户报的"有些没做到"就是这种漏法）。
   */
  const pickedSpotRooms: string[] = (() => {
    const first =
      state.pendingPassageRoom ||
      state.pendingSenseRoom ||
      state.pendingStatueSealFrom ||
      state.pendingSensePair?.firstRoomId ||
      null;
    if (!first) return [];
    /** 逻辑推理（感知相连两格）：第二格也画出来 */
    if (state.pendingSensePair?.firstRoomId && state.pendingSensePair.secondRoomId)
      return [first, state.pendingSensePair.secondRoomId];
    return [first];
  })();
  const previewPath = pathDraftRooms.length
    ? pathDraftRooms
    : senseFirst
      ? state.pendingSensePair?.secondRoomId
        ? [senseFirst, state.pendingSensePair.secondRoomId]
        : [senseFirst]
      : /**
         * **短跑冲刺**：用玩家自己点出来的路径画预览。
         * 必须放在 `extraDest && extraPick` **之前** —— 否则会被当成
         * 「选一个目的地」去算最短路径，高亮就错了（以前完全没高亮）。
         */
        extraPick?.kind === 'sprint' && sprintDraftRooms.length
        ? sprintDraftRooms
        : extraDest && extraPick
          ? extraPick.kind === 'whiskey' ||
            extraPick.kind === 'noteNoise' ||
            extraPick.kind === 'traitRoom'
            ? [extraDest]
            : startRoom
              ? (shortestPath(state.map, startRoom, extraDest, pathOpts) ?? [startRoom, extraDest])
              : [extraDest]
          : fleeDest && startRoom
            ? (reachablePreview(shortestPath(state.map, startRoom, fleeDest, pathOpts), 1) ??
              [startRoom, fleeDest])
            : pickedSpotRooms.length
              ? pickedSpotRooms
              : blockadeDest
                ? [blockadeDest]
              : /** 幸运币的草稿：服务端 `pendingPathDraft` 就是路线本身（含起点） */
                coinPathDraft
                ? pathDraftRooms
                : canDraftSurvivorMove && moveDraftRooms.length
                  /** 幸存者：直接用**玩家自己点出来的路径**画预览（不再算最短路径） */
                  ? moveDraftRooms
                  : startRoom && activeMoveDest
                    ? (reachablePreview(shortestPath(state.map, startRoom, activeMoveDest, pathOpts), moveRange) ??
                      [])
                    : [];
  const youRoom = state.map.rooms.find((r) => r.id === state.you.roomId);
  /**
   * **"有杀手在你这个地点吗"** —— 直接用服务端的结论（`killerInRoom`）。
   *
   * ⚠ 以前这里自己遍历棋子判一遍，漏了"**雕像不算在场**"那条：
   * 雕像局里那个残留的主体棋子还停在杀手起始房间（墓穴 = 隐藏出口 G1），
   * 站在那儿的乔治就搜不了、修不了（用户报的「1对1、墓穴、杀手是雕像、
   * 乔治在 G1 没有显示搜索」）。两份判定必然漂移，所以改成**只信服务端**。
   */
  const killerHere = Boolean(state.killerInYourRoom);
  /**
   * 可搜索：默认要有 searchable 标签；
   * 凯莱布「神秘狂热粉」让他能在螺旋地点搜索 —— 由服务端算好放进快照。
   */
  const canSearchHere = Boolean(state.canSearchHere) && !killerHere;
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
  /**
   * 个人物品只能本人使用（服务端也会拦）：索菲亚的相机、马尔科的医药包。
   * 界面就不该给不是本人的人显示这两个按钮。
   */
  const isSophiaPiece = (p: { id: string; characterId: string | null; name: string }) => {
    const c = state.characters.find((x) => x.id === p.characterId);
    return /survivor4|索菲亚|索菲娅|sophia/i.test(`${p.characterId ?? ''} ${c?.name ?? ''} ${p.name}`);
  };
  const isMarcoPiece = (p: { id: string; characterId: string | null; name: string }) => {
    const c = state.characters.find((x) => x.id === p.characterId);
    return /survivor3|马尔科|marco/i.test(`${p.characterId ?? ''} ${c?.name ?? ''} ${p.name}`);
  };
  /** 乔治·卡朋特（笔记的主人） */
  const isGeorgePiece = (p: { id: string; characterId: string | null; name: string }) => {
    const c = state.characters.find((x) => x.id === p.characterId);
    return /survivor6|乔治|george/i.test(`${p.characterId ?? ''} ${c?.name ?? ''} ${p.name}`);
  };
  const canUseOwnPersonalItem = (itemId: string) =>
    itemId === 'sophia_camera'
      ? isSophiaPiece(state.you)
      : itemId === 'marco_medkit'
        ? isMarcoPiece(state.you)
        : true;
  /** 这件个人物品能不能落在 p 手里（服务端同样会拦） */
  const canPieceHoldItem = (p: { id: string; characterId: string | null; name: string }, itemId: string) =>
    itemId === 'sophia_camera'
      ? isSophiaPiece(p)
      : itemId === 'marco_medkit'
        ? isMarcoPiece(p)
        : true;
  /**
   * 【变体3】秘密通道出口：**优先用服务端给的**（`state.plans.passageEnds`）——
   * 「通道調查 ①」把整张地图的秘密通道互连之后，客户端自己按地图算会漏掉那些新连线。
   */
  const passageEnds = state.plans?.passageEnds?.length
    ? state.plans.passageEnds
    : state.you.roomId
      ? passageNeighbors(state.map, state.you.roomId)
      : [];
  const whiskeyRooms = state.you.roomId ? generalNeighbors(state.map, state.you.roomId) : [];
  const adrenalineRooms = state.you.roomId
    ? roomsAtDistance(state.map, state.you.roomId, 1, 1, {
        blockades: state.blockades,
        gateDoor: survivorGateDoor,
      })
    : [];
  /**
   * 短跑冲刺的路径草稿：和普通移动一样一步一步点。
   *
   * ⚠ **这里必须用 `0–3 步可达`，不能用 `3–3`**。
   * 用「刚好 3 步」的话，第一个中间步（1 步远）就不在集合里 → 根本点不动，
   * 而唯一的 3 步格子又跟起点不相邻 → 也被相邻性检查拒掉，两条检查互相矛盾。
   * 「必须刚好 3 步」在**确认时**由服务端校验（`path.length - 1 === 3`）。
   */
  const sprintRooms = state.you.roomId
    ? roomsAtDistance(state.map, state.you.roomId, 0, 3, {
        blockades: state.blockades,
        gateDoor: survivorGateDoor,
      })
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
    /** 草药：只能治受伤/中毒的 */
    ((state.you.items.herb ?? 0) > 0 && healableAlliesHere(state).length > 0) ||
    /** 医药包（只有马尔科）：还能治健康但有恐惧的 */
    ((state.you.items.marco_medkit ?? 0) > 0 &&
      isMarcoPiece(state.you) &&
      healableAlliesHere(state, true).length > 0) ||
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
    /**
     * **已坍塌的地点不存在了，立绘不能放上去**（用户口径）。
     * 静默不生效会让人以为"点了没反应"，所以顺手给一句提示。
     */
    if ((state.collapsedRooms ?? []).includes(roomId)) {
      setStandeeHint('那个地点已经坍塌了，立绘不能放上去。');
      return;
    }
    setStandeeHint(null);
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
    /**
     * 需要确认时**不立刻发**，只挂到行动区的确认栏里（见 `PendingAct`）。
     * `setExtraPick(null)` 也挪进回调 —— 免得玩家还没确认，选点面板就先关了。
     */
    if (!alreadyConfirmed && state.mode !== 'vs2') {
      setPendingAct({
        label,
        run: () => {
          setExtraPick(null);
          void onAction(action);
        },
      });
      return;
    }
    setExtraPick(null);
    await onAction(action);
  };

  /** 雕像杀手：幸存者猜某个雕像是主雕像（只是标记，不影响对局） */
  const runSurvivorGuess = async (statueId: string) => {
    await onAction({
      type: 'guessMainStatue',
      statueId,
      actorPlayerId: state.you.faction === 'survivor' ? state.you.id : undefined,
    });
  };

  const onRoomClick = async (roomId: string) => {
    const toggle = (cur: string | null) => (cur === roomId ? null : roomId);
    /**
     * 【女猎手・猎手本能】点地图**任选一个地点**（选完在行动区确认）。
     *
     * ⚠ 以前客户端**完全没有这一支**：打牌后点地图发出去的是 `move`，
     * 而服务端在 `move` 里被 `killerSenseRoomActive` 截走、当成"选感知地点"。
     * 于是用户看到两件怪事：
     *  - 「【猎手本能】不能选择地点」（点了好像没反应、也没有高亮）；
     *  - 「在一般行动中选了一个地点后会突然变成【猎手本能】所选的地点」
     *    （那次移动的点击又被感知分支吃掉了）。
     * 放在最前面，别被下面的移动分支抢走。
     */
    if (viewerFaction === 'killer' && (state.killerSenseRoomActive || state.pendingSenseRoom != null)) {
      void onAction({ type: 'move', toRoomId: roomId });
      return;
    }
    /**
     * 【雕像・召唤石碑】选门模式：点两个相邻地点 = 选中它们之间那扇门。
     * 放在最前面 —— 这时候点地图就是在选门。
     */
    if (state.pendingStatueSeal) {
      void onAction({ type: 'pickSummonSealRoom', roomId });
      return;
    }
    /**
     * 【恐詭管道】选了「潛行到带秘密通道的地点」之后，**点地图选落点**。
     * ⚠ 以前客户端**完全没有这个分支**、服务端也没有 action 消费它，
     * 所以玩家点了地点也没反应（用户报的"无法选择秘密通道口处"）。
     */
    if ((state.pendingPassagePick?.length ?? 0) > 0) {
      if (!state.pendingPassagePick!.includes(roomId)) return;
      void onAction({ type: 'pickPassageRoom', roomId });
      return;
    }
    /**
     * 【屍群來了】选了出发地之后，**点地图选目的地**。
     * 以前只显示了"请点一个目的地"的文字，地图点击没接上 → 选不了。
     */
    if (state.pendingZombieHordeTo) {
      void onAction({ type: 'pickZombieHorde', roomId });
      return;
    }
    /**
     * 【墓穴】坍塌收尾：**轮到谁离开废墟**时，直接点目的地就走。
     * 放在最前面 —— 这时候任何别的选点模式都不该抢走点击。
     * （面板上也有按钮，点地图只是更顺手的一条路。）
     */
    const collapsePend = state.pendingCollapseMoves;
    if (collapsePend && !collapsePend.waiting && collapsePend.currentId) {
      if (collapsePend.options.includes(roomId)) {
        void onAction({ type: 'collapseMove', toRoomId: roomId });
      }
      return;
    }
    /**
     * 【城堡】机关大门选门模式：**点两个相邻地点 = 选中它们之间那扇门**。
     * 放在最前面，别被下面的移动/封堵分支抢走点击。
     *
     * ⚠ 守卫用 `gateUsable`（按"点了按钮的那个人还在不在 R1"算），
     * **不要用 `state.canPlaceLeverGate`** —— 那个字段针对 `state.you`，
     * 共享控制下常指向另一个人，会出现"点了按钮、点地图却没反应"。
     */
    if (gateUsable) {
      if (!gateDoorFrom) {
        setGateDoorFrom(roomId);
        return;
      }
      if (roomId === gateDoorFrom) {
        setGateDoorFrom(null);
        return;
      }
      /**
       * ⚠ **机关大门不能放在已经被封堵的门上**（用户要求）。
       * 服务端也会拒，这里提前拦一下，免得点完才吃到错误。
       */
      const key = [gateDoorFrom, roomId].sort().join('|');
      if ((state.blockades ?? []).includes(key)) {
        window.alert(
          `「${roomDisplayName(state.map, gateDoorFrom, viewerFaction)}」–「${roomDisplayName(state.map, roomId, viewerFaction)}」这扇门已经被封堵了，机关大门不能放在它上面（先拆掉那个封堵）。`,
        );
        return;
      }
      void onAction({
        type: 'placeLeverGate',
        fromRoomId: gateDoorFrom,
        toRoomId: roomId,
        /** 是哪名幸存者操作的控制杆（共享控制模式下必须带） */
        actorPlayerId: gateActorId ?? undefined,
      });
      setGatePicking(false);
      setGateDoorFrom(null);
      setGateActorId(null);
      return;
    }
    /**
     * 扼杀者的核心标记落点（打「茂盛 / 枝條生長 / 傳送聚合」后点地图）。
     * 放在最前面，避免被下面的移动/封堵分支抢走。
     */
    if (viewerFaction === 'killer' && state.pendingCorePick) {
      if (state.pendingCorePick === 'place') {
        void onAction({ type: 'placeCoreMarker', roomId });
        return;
      }
      if (state.pendingCorePick === 'remove') {
        // 已达 5 个上限：点一个已有核心标记的地点 = 选它被移除
        if (!(state.pendingCoreRooms ?? []).includes(roomId)) return;
        void onAction({ type: 'placeCoreMarker', roomId });
        return;
      }
      if (state.pendingCorePick === 'placeBlockade') {
        if (!(state.pendingCoreRooms ?? []).includes(roomId)) return;
        void onAction({ type: 'blockadeAtCore', roomId });
        return;
      }
      if (state.pendingCorePick === 'moveFrom') {
        void onAction({ type: 'moveCoreMarker', roomId });
        return;
      }
      if (state.pendingCorePick === 'moveTo') {
        if (!(state.pendingCoreNeighbors ?? []).includes(roomId)) return;
        void onAction({ type: 'moveCoreMarker', roomId });
        return;
      }
    }
    /**
     * ⚠ `pendingTeleportPick` / `pendingCoreRooms` / `pendingQueenSpawnRooms` 都是**数组**，
     * 服务端没待选时给的是 `[]` —— 而**空数组是 truthy**。
     * 所以必须判**长度**，否则「杀手点任何格子」都会在这里被 return 掉，
     * 表现为「杀手的格子点不动、连高亮都没有」（幸存者不受影响，因为条件是 killer）。
     */
    if (viewerFaction === 'killer' && (state.pendingTeleportPick?.length ?? 0) > 0) {
      if (!state.pendingTeleportPick!.includes(roomId)) return;
      void onAction({ type: 'teleportToCore', roomId });
      return;
    }
    /** 未命名「酸液喷吐」：点地点 = 选一个相邻地点（相邻性由服务端校验） */
    if (viewerFaction === 'killer' && state.pendingAcidPick) {
      void onAction({ type: 'sprayAcid', roomId });
      return;
    }
    /** 女王等级 4：点地点 = 选一个生成僵尸的位置（服务端给的是空数组，所以判 null） */
    if (viewerFaction === 'killer' && state.pendingQueenSpawnRooms != null) {
      void onAction({ type: 'pickQueenSpawnRoom', roomId });
      return;
    }
    /** 扼杀者等级 4：点地点 = 选一个放核心标记的位置（要 2 个不同地点） */
    if (viewerFaction === 'killer' && state.pendingStranglerCoreRooms != null) {
      void onAction({ type: 'pickStranglerCoreRoom', roomId });
      return;
    }
    /**
     * **威廉「短跑冲刺」**：和普通移动一样一步一步点，但**必须刚好 3 步**才能确认。
     * 必须放在 `if (extraPick)` 那支**之前** ——
     * 否则点击会被「威士忌/肾上腺素选目的地」那支吃掉，而短跑面板没有那个确认按钮 → 卡死。
     */
    const isSprintPick = isSurvivorView && extraPick?.kind === 'sprint';
    if (isSprintPick) {
      const draft = sprintDraftRooms.length ? sprintDraftRooms : state.you.roomId ? [state.you.roomId] : [];
      const last = draft.length ? draft[draft.length - 1]! : null;
      /**
       * **点最新选的那一格 = 取消那一步**（退回到上一格）。
       * 注意不能写成「点路径上任何一格就退回那里」——
       * 那样就**禁止回头路**了（R1 → R2 → R1 这种走法是允许的）。
       */
      if (draft.length > 1 && roomId === last) {
        setSprintDraftRooms(draft.slice(0, -1));
        return;
      }
      if (!last) return;
      if (!sprintRooms.includes(roomId)) return;
      if (!neighbors(state.map, last, pathOpts).includes(roomId)) return;
      if (draft.length - 1 >= 3) return;
      setSprintDraftRooms([...draft, roomId]);
      return;
    }
    if (extraPick) {
      if (!extraPick.rooms.includes(roomId)) return;
      setExtraDest(toggle);
      return;
    }
    if (fleePick && state.phase === 'encounter') {
      if (state.legalMoves.includes(roomId) || roomId === fleeDest) setFleeDest(toggle);
      return;
    }
    /**
     * ⚠ **撤离步骤里，任何点击都不许掉进"普通移动"那一套**（用户口径：
     * 「遭遇后撤离跟其他所有移动都不一样，别弄混了」）。
     *
     * 没被选中的人点地图 = 什么都不做（上面那个分支不匹配时会被这里拦下），
     * 绝不再往下走到路径草稿/普通移动的分支去。
     */
    if (state.phase === 'encounter' && state.encounter?.step === 'flee') {
      return;
    }
    /**
     * 女猎手放置陷阱：**位置由她自己选**（任意地点），
     * 所以点任何一格都直接拿 roomId 去放；再点已放过的同一格 = 取消那个。
     */
    if (
      state.isHuntressKiller &&
      viewerFaction === 'killer' &&
      state.trapPlacement &&
      !state.trapPlacement.done &&
      state.trapPlacement.kind
    ) {
      void onAction({ type: 'placeHunterTrap', tokenId: roomId });
      return;
    }
    const pickingLocation = mapPickActive;
    if (standeeMoveOn && !isSurvivorView && !pickingLocation) {
      placeStandee(roomId);
      return;
    }
    if (
      state.pendingBlockade ||
      (state.pendingBlockadeJob && state.pendingBlockadeJob.removeLeft > 0)
    ) {
      /**
       * ⚠ **不能用 `state.legalMoves`**（那是移动范围）。
       * 封堵常常发生在移动范围之外（枝条生长可封任意带核心标记的地点），
       * 而且慢速阶段 `legalMoves` 是空的 —— 用它会**静默吞掉点击、连高亮都没有**。
       * 这里改成「与该地点相连、且还没被封的**白门**通向的房间」。
       */
      if (blockadeTargetRooms.includes(roomId) || roomId === blockadeDest) {
        setBlockadeDest(toggle);
      }
      return;
    }
    /**
     * **幸存者**：一步一步点路径（草稿在客户端 `moveDraftRooms`），点完发 `move` + `path`。
     *
     * 杀手走下面原来的分支（`canDraftMove`）—— **那套不要动**：
     * 普通行动选目的地由客户端 `moveDest` 管，移动牌的路径草稿由服务端 `pendingPathDraft` 管。
     */
    /**
     * **凯莱布「幸运币」的〔移動〕×0-2**（额外行动，不占小回合）。
     *
     * ⚠ 必须**单独一支**，不能落到下面「幸存者一般行动移动」那支 ——
     * 那支有两道不合用的门槛：
     *  1. `state.legalMoves.includes(roomId)`：那是**当前行动者**的移动范围，
     *     幸运币常常发生在"他已经做完一般行动"之后，`legalMoves` 是空的
     *  2. `moveRange`：来自 `state.you.moveLeft`，做过一般行动后是 0
     * 结果就是点地图**完全没反应**。
     *
     * 这里也**不维护本地草稿** —— 服务端的 `pendingPathDraft` 才是权威
     * （它已经在 `owner === 'survivor'` 的分支里做追加/取消/相邻性校验），
     * 客户端只管把点击发过去。否则两边各记一份、很容易走岔。
     */
    if (isSurvivorView && coinPathDraft) {
      void onAction({ type: 'move', toRoomId: roomId });
      return;
    }
    if (isSurvivorView && canDraftSurvivorMove) {
      /** 草稿起点必须在数组里，否则第一次点击会因为没有末端被丢掉 */
      const draft = moveDraftRooms.length
        ? moveDraftRooms
        : state.you.roomId
          ? [state.you.roomId]
          : [];
      const last = draft.length ? draft[draft.length - 1]! : null;
      /**
       * **点最新选的那一格 = 取消那一步**。
       * 不能写成「点路径上任何一格就退回那里」—— 那样会**禁止回头路**，
       * 而规则允许 R1 → R2 → R1 这种走法（移动力 2 步）。
       */
      if (draft.length > 1 && roomId === last) {
        setMoveDraftRooms(draft.slice(0, -1));
        return;
      }
      if (!last) return;
      if (!state.legalMoves.includes(roomId)) return;
      /** 相邻性：和预览、服务端用同一套（含封堵过滤） */
      if (!neighbors(state.map, last, pathOpts).includes(roomId)) return;
      if (draft.length - 1 >= moveRange) return;
      setMoveDraftRooms([...draft, roomId]);
      return;
    }
    /** 杀手 / 其他：原来的逻辑，不动 */
    if (canDraftMove) {
      if (state.legalMoves.includes(roomId) || roomId === moveDest) setMoveDest(toggle);
      return;
    }
    if (isActive && state.legalMoves.includes(roomId)) {
      await onAction({ type: 'move', toRoomId: roomId });
    }
  };

  const confirmMove = async () => {
    /** 幸存者：目的地 = 路径末端；杀手：目的地 = `moveDest`（原样） */
    const dest = canDraftSurvivorMove ? survivorMoveDest : moveDest;
    if (!dest) return;
    const name = roomDisplayName(state.map, dest, viewerFaction);
    /**
     * 幸存者：把**玩家点出来的完整路径**一起发出去。
     * 只发目的地的话，服务端会自己算最短路径 —— 走出来的就不是玩家选的路线。
     * 杀手照旧只发目的地。
     */
    const doMove = () => {
      void onAction({
        type: 'move',
        toRoomId: dest,
        ...(canDraftSurvivorMove ? { path: [...moveDraftRooms] } : {}),
      });
      if (canDraftSurvivorMove) setMoveDraftRooms([]);
      else setMoveDest(null);
    };
    /** 单人热座要点一下确认（在**行动区**里确认，不用浏览器弹窗） */
    if (canDraftSurvivorMove && state.mode === 'solo') {
      setPendingAct({ label: `移动到${name}`, run: doMove });
      return;
    }
    doMove();
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
    } else if (extraPick.kind === 'traitRoom') {
      /**
       * 【变体1】特性卡点地图：目的地就是 `extraDest`。
       *
       * - 速度爆发（01）：步数按**实际距离**推（2–4 步，服务端要求"正好 N 步"）；
       * - **调度人员（02）：这里是"为当前这个人选一步"** —— 记下来之后自动轮到下一个，
       *   全部选完才一次性提交（`moves`）；
       * - 明智之举（19）：带 `choice`（拆封堵 / 相邻响声）；
       * - 声音诱饵（13）、迅速反应（20）：不需要额外参数。
       */
      const start =
        state.players.find((pl) => pl.id === (extraPick.actorPlayerId ?? state.you.id))?.roomId ??
        state.you.roomId;
      const pathLen = start
        ? (shortestPath(state.map, start, extraDest, pathOpts)?.length ?? 1) - 1
        : 1;
      if (extraPick.traitId === 'trait_s02' && traitDispatch) {
        const steps = Math.max(1, Math.min(2, pathLen));
        const moves = [
          ...traitDispatch.moves,
          { playerId: traitDispatch.current, toRoomId: extraDest, steps },
        ];
        const next = traitDispatch.queue[0];
        const nextRoom = next
          ? state.players.find((pl) => pl.id === next)?.roomId
          : null;
        if (next && nextRoom) {
          /** 还没选完：记下这一步，接着为下一个人选 */
          setTraitDispatch({
            ...traitDispatch,
            current: next,
            queue: traitDispatch.queue.slice(1),
            moves,
          });
          setExtraPick({
            ...extraPick,
            rooms: roomsAtDistance(state.map, nextRoom, 1, 2, { blockades: state.blockades }),
            actorPlayerId: next,
          });
          setExtraDest(null);
          return;
        }
        /** 全部选完 → 一次性提交 */
        setTraitDispatch(null);
        void runSurvivor('发动「调度人员」', {
          type: 'useTrait',
          traitId: 'trait_s02',
          actorPlayerId: traitDispatch.actorId,
          moves,
        });
        return;
      }
      void runSurvivor(
        `发动特性卡（${roomDisplayName(state.map, extraDest, viewerFaction)}）`,
        {
          type: 'useTrait',
          traitId: extraPick.traitId ?? '',
          actorPlayerId: extraPick.actorPlayerId,
          /** 12 英勇阻截：这里点的是"轮到的那个人"走哪一格 */
          targetPlayerId: extraPick.traitId === 'trait_s12' ? extraPick.actorPlayerId : undefined,
          toRoomId: extraDest,
          steps: extraPick.traitId === 'trait_s01' ? Math.max(2, Math.min(4, pathLen)) : undefined,
          choice: extraPick.traitChoice,
        },
      );
    } else if (extraPick.kind === 'noteNoise') {
      void runSurvivor(
        `用乔治的笔记在${roomDisplayName(state.map, extraDest, viewerFaction)}发出响声`,
        {
          type: 'useNote',
          noteId: extraPick.noteId ?? 'george_note_noise',
          toRoomId: extraDest,
          actorPlayerId: extraPick.actorPlayerId,
        },
      );
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

  /**
   * 界面上幸存者的显示顺序（三张状态卡 / 三个物品栏都吃它）。
   *
   * ⚠ **【分头行动】界面顺序固定按"座位"排**（用户选的方案 B）：
   * 这个模式的行动顺序是"从先手开始、沿座位绕一圈"，服务端为此把
   * `turnOrder` **旋转**了；但界面**不能跟着转** —— 否则每换一次先手，
   * 三张卡片就整体挪一次位。所以这里改用**不动的座位基准** `splitOrderBase`，
   * 只让 ★ 先手标记跟着人走。
   */
  const survivors = (() => {
    if (state.split && state.splitOrderBase?.length) {
      return state.splitOrderBase
        .map((id) => state.players.find((p) => p.id === id))
        .filter((p): p is NonNullable<typeof p> => Boolean(p && p.faction === 'survivor'));
    }
    return state.turnOrder?.length
      ? state.turnOrder
          .map((id) => state.players.find((p) => p.id === id))
          .filter((p): p is NonNullable<typeof p> => Boolean(p && p.faction === 'survivor'))
      : state.players.filter((p) => p.faction === 'survivor');
  })();
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
  /**
   * 【变体1】**每名杀手各自的特性卡**（用户要求：放进**各自**的卡牌区）。
   *
   * ⚠ 2对3 里两名杀手各自抽各自选，所以这里**按杀手分组**、不混成一行；
   * 雕像局 4 尊雕像共用主雕像那一份，所以只有主雕像那组是非空的
   * （空组直接跳过，不会画出 3 个空块）。
   */
  const killerTraitGroups = (() => {
    const groups: Array<{ id: string; name: string; defs: TraitDef[] }> = [];
    for (const pl of state.players) {
      if (pl.faction !== 'killer') continue;
      const ids = pl.traits ?? [];
      if (!ids.length) continue;
      groups.push({
        id: pl.id,
        name: pl.name,
        defs: ids
          .map((id) => (state.traitDefs ?? []).find((d) => d.id === id))
          .filter((d): d is TraitDef => Boolean(d)),
      });
    }
    return groups;
  })();
  /**
   * 【变体1】**我自己的行动型特性卡**，按卡面的行动类型分流 ——
   * 用户要求：**特殊行动的只放进「特殊行动」区，额外行动的只放进「额外行动」窗口**，
   * 不许在别处乱开区域。
   *
   * 过滤掉"每场一次且已经用掉"的（那些卡面已变暗）。
   */
  const myTraits = (state.you.traits ?? [])
    .map((id) => (state.traitDefs ?? []).find((d) => d.id === id))
    .filter((d): d is TraitDef => Boolean(d))
    .filter((d) => !(d.oncePerGame && (state.traitUsed ?? []).includes(d.id)));
  const mySpecialTraits = myTraits.filter((d) => d.kind === 'special');
  const myExtraTraits = myTraits.filter((d) => d.kind === 'extra');
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
  /**
   * 地图上的牌堆里只有搜索 / 发现 / 宝藏 / 遗物 / 弃牌这几种，
   * 杀手摸牌堆和弃牌堆画在杀手面板上，不在地图上 —— 所以这里把两个字段摘掉。
   */
  const pileTopsOnMap = state.pileTops
    ? {
        search: state.pileTops.search,
        discovery: state.pileTops.discovery,
        treasure: state.pileTops.treasure,
        relic: state.pileTops.relic,
        discard: state.pileTops.discard,
      }
    : undefined;
  /**
   * 【墓穴】坍塌收尾面板的内容（纯函数算，见 `collapseMovePanelFor`）。
   * 地点名按**当前视角**取（杀手地图上的房间名可能不一样）。
   */
  const collapsePanel = collapseMovePanelFor(state, (rid) =>
    roomDisplayName(state.map, rid, viewerFaction),
  );
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

  /**
   * 【变体1】杀手特性里**现在不能发动**的那些 + 原因（手牌不够等）——
   * 杀手卡牌区据此把卡置灰并写明原因（用户要求：弃牌得有足够手牌）。
   */
  const traitDisabledReasons: Record<string, string> = {};
  if (!isSurvivorView && state.variant1) {
    for (const group of killerTraitGroups) {
      if (group.id !== state.you.id) continue;
      for (const def of group.defs) {
        const need = KILLER_TRAIT_PAY_CLIENT[def.id] ?? 0;
        if (need > 0 && killerHand.length < need)
          traitDisabledReasons[def.id] = `手牌只有 ${killerHand.length} 张，不够弃 ${need} 张`;
      }
    }
  }
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
          if (state.phase === 'encounter') return canPlayAsEncounterAttack(card);
          /**
           * ⚠ **服务端说了"还在等一张牌的选择"就一张都不给打**。
           *
           * 规则：上一张打完（效果全部结算完）才能打下一张。
           * 以前这里逐个查 `pendingMoveRange / pendingBlockade / ...`，
           * 漏了 `pendingEffectChoice`（「或」牌二选一）和 `pendingMoveChoices`
           * （超听觉选路径）—— 用户报的"选择效果期间还能打别的快速牌"就是这个。
           * 现在直接用服务端下发的答案，不再两边各写一份。
           */
          if (state.pendingKillerChoice) return false;
          if (state.pendingSenseColor || state.pendingLurkPick || state.pendingAmulet) return false;
          if (
            state.pendingMoveRange != null ||
            state.pendingBlockade ||
            state.pendingBlockadePlace ||
            state.pendingSensePair
          )
            return false;
          const speed = effectiveCardSpeed(state, card);
          if (!cardPlayableAtStep(state, card, speed, killerStep, killerChoice)) return false;
          if (killerBlockedReasons[cid]) return false;
          const cost = effectiveHandCost(state, card);
          return killerHand.length - 1 >= cost;
        })
      : [],
  );
  const finishKillerPlay = (cid: string, pay: string[]) => {
    const card = state.cardById[cid];
    /**
     * **攻击阶段**打出的牌走另一条路（`playEncounterAttack`），
     * 但费用规则一样：先弃够 `handCost` 张别的牌才生效。
     */
    if (payPurpose === 'encounterAttack') {
      setPayForCard(null);
      setPayPurpose(null);
      setPayIds([]);
      setPendingPayIds([]);
      /**
       * ⚠ **还要关掉卡牌详情窗口**。用户报的："玩女猎手总是有要弃牌的时候
       * 卡牌详情没关闭，还要我再点一次关闭" —— 女猎手很多牌是**攻击时机**打的
       * 而且常带 `handCost`（要弃牌），走的就是这一支，以前这里漏了这句。
       */
      setInspectCardId(null);
      setPendingCard(null);
      void onAction({ type: 'playEncounterAttack', cardId: cid, payCardIds: pay });
      return;
    }
    const doPlay = () => {
      setPayForCard(null);
      setPayPurpose(null);
      setPayIds([]);
      setInspectCardId(null);
      setPendingCard(null);
      setPendingPayIds([]);
      void onAction({ type: 'playKillerCard', cardId: cid, payCardIds: pay });
    };
    /** 会跳过封堵时要点一下确认 —— 同样放在**行动区**，不用浏览器弹窗 */
    const skipHint = killerBlockadeSkipHint(state, card);
    if (skipHint) {
      setPendingAct({
        label: `${skipHint}（打出「${card?.name ?? cid}」后将跳过封堵）`,
        run: doPlay,
      });
      return;
    }
    doPlay();
  };
  const playKillerCard = (cid: string) => {
    /**
     * 【变体1】**正在为发动杀手特性选要弃的牌** —— 点手牌就是选/取消选中，
     * 选够张数立刻提交 `useTrait { payCardIds }`。
     *
     * ⚠ 必须排在最前面：否则点手牌会被下面"打牌 / 支付"那套吃掉，
     * 变成"以为在给特性选祭品、结果把牌打出去了"。
     */
    if (traitPay) {
      const picked = traitPayIds.includes(cid)
        ? traitPayIds.filter((x) => x !== cid)
        : traitPayIds.length >= traitPay.need
          ? traitPayIds
          : [...traitPayIds, cid];
      setTraitPayIds(picked);
      if (!traitPayIds.includes(cid) && picked.length === traitPay.need) {
        const pay = picked;
        setTraitPay(null);
        setTraitPayIds([]);
        void onAction({
          type: 'useTrait',
          traitId: traitPay.traitId,
          actorPlayerId: state.you.id,
          payCardIds: pay,
        });
      }
      return;
    }
    if (payForCard) {
      if (cid === payForCard) {
        setPayForCard(null);
        setPayPurpose(null);
        setPayIds([]);
        return;
      }
      const cost = effectiveHandCost(state, state.cardById[payForCard]);
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
    const cost = effectiveHandCost(state, card);
    const others = killerHand.filter((id) => id !== cid);
    if (cost > others.length) return;
    if (cost === 0 || others.length === cost) {
      finishKillerPlay(cid, cost === 0 ? [] : others);
      return;
    }
    setPendingCard(null);
    setPendingPayIds([]);
    setPayForCard(cid);
    setPayPurpose('killerCard');
    setPayIds([]);
  };

  /**
   * **攻击阶段**点一张加攻牌：
   * 费用为 0 → 直接打；有费用 → 走和普通打牌同一套「选弃牌」流程
   * （否则费用就被白送了 —— 服务端以前根本没查 `handCost`）。
   */
  const playEncounterAttackCard = (cid: string) => {
    const card = state.cardById[cid];
    const cost = effectiveHandCost(state, card);
    const others = killerHand.filter((id) => id !== cid);
    if (cost > others.length) return;
    if (cost === 0 || others.length === cost) {
      void onAction({
        type: 'playEncounterAttack',
        cardId: cid,
        payCardIds: cost === 0 ? [] : others,
      });
      return;
    }
    setPendingCard(null);
    setPendingPayIds([]);
    setPayForCard(cid);
    setPayPurpose('encounterAttack');
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
            模式 <strong>1对2</strong>
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
        {/**
         * 女王：显示地图上僵尸数量（上限 6）与中毒人数。
         */}
        {state.isQueenKiller && (
          <span className="stat">
            僵尸 <strong>{state.zombies?.length ?? 0}/{state.zombieMax ?? 6}</strong>
          </span>
        )}
        {(state.poisoned?.length ?? 0) > 0 && (
          <span className="stat">
            中毒 <strong>{state.poisoned!.length}</strong>
          </span>
        )}
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
        {state.canRequestDisband && !state.disband && (
          <button
            type="button"
            className="ghost-btn"
            onClick={() => void onAction({ type: 'requestDisband' })}
          >
            解散房间
          </button>
        )}
        {/**
         * 【重新开始】：和解散房间**同一套确认流程**，区别是确认完
         * **不解散房间** —— 只回到大厅重新选地图 / 身份 / 角色。
         */}
        {state.canRequestRestart && !state.restart && (
          <button
            type="button"
            className="ghost-btn"
            onClick={() => void onAction({ type: 'requestRestart' })}
          >
            重新开始
          </button>
        )}
      </div>
      {state.restart && (
        <div className="panel stack disband-bar">
          <strong>{state.restart.requestedByName} 发起【重新开始】，等其他人确认</strong>
          <p className="muted">
            不会解散房间：全员确认后回到大厅，重新选地图、身份与角色，各自点准备再开局。
          </p>
          <p className="muted">
            已确认：{state.restart.confirmed.length ? state.restart.confirmed.join('、') : '（无）'}
            {state.restart.waiting.length
              ? ` ｜ 还差：${state.restart.waiting.join('、')}`
              : ' ｜ 全员已确认，即将回到大厅'}
          </p>
          <div className="row">
            {!state.restart.youConfirmed && (
              <button
                type="button"
                className="primary"
                onClick={() => void onAction({ type: 'confirmRestart' })}
              >
                确认重新开始
              </button>
            )}
            <button type="button" onClick={() => void onAction({ type: 'cancelRestart' })}>
              取消重新开始
            </button>
          </div>
        </div>
      )}
      {state.disband && (
        <div className="panel stack disband-bar">
          <strong>{state.disband.requestedByName} 发起【解散房间】，等其他人确认</strong>
          <p className="muted">
            已确认：{state.disband.confirmed.length ? state.disband.confirmed.join('、') : '（无）'}
            {state.disband.waiting.length
              ? ` ｜ 还差：${state.disband.waiting.join('、')}`
              : ' ｜ 全员已确认，房间即将解散'}
          </p>
          <div className="row">
            {!state.disband.youConfirmed && (
              <button
                type="button"
                className="primary"
                onClick={() => void onAction({ type: 'confirmDisband' })}
              >
                确认解散
              </button>
            )}
            <button type="button" onClick={() => void onAction({ type: 'cancelDisband' })}>
              取消解散
            </button>
          </div>
        </div>
      )}
      {soloHint && <p className="muted table-hint">{soloHint}</p>}
      {/**
       * 【城堡 R1 監視室】控制杆：正在"选门"。
       *
       * 入口在左上角的「额外行动」弹窗里，点了之后那弹窗会关掉 ——
       * 所以这里必须给一行提示，不然玩家会不知道接下来该点哪里。
       */}
      {gateUsable && (
        <p className="muted table-hint">
          放置机关大门（{gateActor?.name ?? '幸存者'}）：先点一个地点，再点与它**相邻**的地点 = 选中它们之间那扇门。
          <button
            type="button"
            className="ghost-btn"
            onClick={() => {
              setGatePicking(false);
              setGateDoorFrom(null);
              setGateActorId(null);
            }}
          >
            取消放置
          </button>
        </p>
      )}

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
        /** 「分头行动」：顶栏钥匙区换成模式标识（钥匙各自保管） */
        split={state.split === true}
      />

      <div className="table-map">
        {/**
         * **地图 + 右侧信息栏**（用户要求）。
         *
         *  - 幸存者视角：右边显示**杀手当前打出的卡牌**（卡面），
         *    让幸存者知道杀手这回合打了什么；
         *  - 杀手视角：右边是**获得的信息区**（类似战报的一块），
         *    只放"打出卡牌获得的信息"（感知看到了谁、追蹤距离、红外探测…）。
         *    原来这些信息是在行动区弹一块、还要点「知道了」确认 —— 那套流程已删。
         *
         * ⚠ 只是**地图旁边多一栏**，战报本身一个字都没动。
         */}
        <div className="map-row">
          <Board
            map={state.map}
            players={displayPlayers}
            youId={state.you.id}
            viewerFaction={viewerFaction}
            legalMoves={
              /**
               * 女猎手放陷阱期间：**合法落点** = 开局布置的允许区域（常规搜索位/修理位），
               * 或陷阱重置时的全部地点。这样地图会高亮能放的位置、也只能点那些格子。
               */
              state.trapPlacement && !state.trapPlacement.done && state.trapPlacement.kind
                ? state.trapPlacement.restricted
                  ? state.trapPlacement.allowedRooms ?? []
                  : state.map.rooms.map((r) => r.id)
                : /** 封堵时高亮「可封的白门」通向的房间（不能用 legalMoves） */
                  blockadeTargetRooms.length > 0 && (state.pendingBlockade || state.pendingBlockadePlace)
                  ? blockadeTargetRooms
                  : /**
                     * **幸运币的草稿**：高亮「从草稿末端还能走到的格子」。
                     * 不能用 `state.legalMoves`（那是当前行动者的移动范围，
                     * 幸运币常在他做完一般行动之后，那时它是空的）。
                     */
                    coinPathDraft
                    ? coinReachableRooms
                    : extraPick
                      ? extraPick.rooms
                      : /**
                         * ⚠ 这里以前是一长串「哪些状态才放行 `state.legalMoves`」的**白名单**，
                         * 每加一种"点地图选点"的待选状态就会漏一个 ——
                         * 服务端把高亮算好了，客户端却不画，表现就是
                         * 「点了好像没反应、也没有高亮」。
                         * 现在只保留一个**黑名单**条件：手动摆放立绘时压掉高亮，
                         * 其余情况下只要轮到你，就照服务端给的 `legalMoves` 画。
                         */
                        isActive && (!standeeMoveOn || mapPickActive)
                        ? state.legalMoves
                        : []
            }
            highlightRoomIds={state.highlightRoomIds ?? []}
            /**
             * 【封堵】**已经点选、还没确认**的那一格画实心金圈
             * （用户要求："选择封堵时，被选择的地点要高亮"）。
             * 候选格仍然是 `legalMoves` 的流动虚线圈。
             *
             * ⚠ 「任选门封堵」（进化 4 级 / 特性 13、18）**不走 `blockadeDest`** ——
             * 它每点一格就直接发 `move`，两格记在服务端的
             * `pendingBlockadeJob.firstRoomId / secondRoomId` 上。
             * 以前只认 `blockadeDest` → 那两格在图上**一点标记都没有**
             * （用户报的「谋杀者 4 级放四个封堵预选时地点没高亮」）。
             */
            pickedRoomIds={[
              ...(blockadeDest ? [blockadeDest] : []),
              ...(state.pendingBlockadeJob?.kind === 'anyDoors'
                ? [state.pendingBlockadeJob.firstRoomId, state.pendingBlockadeJob.secondRoomId].filter(
                    (r): r is string => Boolean(r),
                  )
                : []),
            ]}
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
            pileTops={pileTopsOnMap}
            cardById={state.cardById}
            pickableSurvivorIds={pickableSurvivorIds}
            selectedSurvivorId={pickedNextId}
            activePlayerId={state.activePlayerId}
            onSurvivorClick={pickSurvivor}
            onPileClick={setInspectPile}
            /**
             * ⚠ 【分头行动】给 Board 的也必须是**固定座位顺序**（方案 B）：
             * 它同时决定"同队预选颜色"（`playerIndexOf`）和立绘的槽位排列 ——
             * 传旋转过的 `turnOrder` 会让同一个人每个大回合换个颜色、立绘也跟着挪。
             */
            turnOrder={
              state.split && state.splitOrderBase?.length ? state.splitOrderBase : state.turnOrder
            }
            remoteCursors={
              /**
               * 只有 1对2 / 1对3 需要互看预选：
               * 1对1 和单人热座下幸存者就一个操控者，看了没意义。
               */
              state.mode === 'vs2' || state.mode === 'multi'
                ? cursors.filter((c) => c.playerId !== state.you.id)
                : []
            }
            onRoomHover={
              state.mode === 'vs2' || state.mode === 'multi'
                ? (roomId) => onCursorRoom?.(roomId)
                : undefined
            }
            statues={state.statues ?? []}
            killerCharacterId={
              state.players.find((pl) => pl.faction === 'killer')?.characterId ?? null
            }
            killerCharacterName={state.players.find((pl) => pl.faction === 'killer')?.name ?? null}
            onStatueClick={(statueId) => {
              /**
               * 杀手点雕像 = 选它当主雕像（还要在行动区确认）；
               * 幸存者点雕像 = 猜它是主雕像。
               *
               * 【分头行动】里逃脱/被杀的人**已经退出场上**，点了只会被服务端拒绝，
               * 所以干脆不让他点（各管各的）。
               */
              if (viewerFaction === 'killer') {
                if (state.statues?.find((s) => s.id === statueId)?.main) return;
                onAction({ type: 'pickMainStatue', statueId });
              } else if (!(state.split === true && state.you.alive === false)) {
                void runSurvivorGuess(statueId);
              }
            }}
            onStatueDoubleClick={(statueId) => {
              // 双击：幸存者猜主雕像
              if (
                viewerFaction !== 'killer' &&
                !(state.split === true && state.you.alive === false)
              )
                void runSurvivorGuess(statueId);
            }}
            treasureChests={state.treasureChests ?? []}
            /** 杀手视角：立绘按「目击位置」摆（幸存者侧为空） */
            witnessedAt={state.witnessedAt ?? {}}
            hunterTraps={state.hunterTraps ?? []}
            trapPartRooms={state.trapPartRooms ?? []}
            coreMarkers={state.coreMarkers ?? []}
            /** 【变体3】地图上的计划标记（幸存者视角才有；杀手拿到的是空数组） */
            planMarkers={state.plans?.markers ?? []}
            zombies={state.zombies ?? []}
            poisoned={state.poisoned ?? []}
            /** 杀手视角的右键菜单只在遭遇期间列幸存者 */
            encounterRoomId={state.encounter?.roomId ?? null}
            /** 地图特殊规则的标记：城堡的机关大门、实验室的急救箱 */
            leverGateDoorId={state.leverGateDoorId ?? null}
            firstAidKit={state.firstAidKit === true}
            firstAidRoomId={state.firstAidRoomId ?? null}
            /**
             * 【女猎手】开局布置：能放陷阱的地点画白圈。
             * 四个都放完（`allPlaced`）之后就不传了 → 圈变回黄色。
             * 「陷阱重置」时不受区域限制，画白圈没意义（全图都能放），所以也不传。
             */
            trapSpotRooms={
              state.trapPlacement &&
              !state.trapPlacement.done &&
              !state.trapPlacement.allPlaced &&
              state.trapPlacement.restricted
                ? state.trapPlacement.allowedRooms ?? []
                : []
            }
            /** 【雕像・停滞】正在选目标 → 可选的雕像立绘上下浮动 */
            statueHaltPickable={haltStatueOpen}
            /** 【墓穴】坍塌板块 + 遗物标记正反面 */
            collapsedRooms={state.collapsedRooms ?? []}
            relicMarkerFaceUp={state.relicMarkerFaceUp !== false}
            markerOffsets={survLayout.roomMarkerOffsets}
          />
          <aside className={`map-side${mapSideOpen ? '' : ' collapsed'}`}>
            {/**
             * 收起 / 展开（两个视角各有一个，同一时刻只会渲染当前视角那一个）。
             * 收起时只留一条竖排的「展开」按钮，地图占满整宽。
             */}
            <button
              type="button"
              className="map-side-toggle"
              onClick={() => setMapSideOpen((open) => !open)}
              title={mapSideOpen ? '收起这一栏' : '展开这一栏'}
            >
              {mapSideOpen ? '收起' : '展开'}
            </button>
            {!mapSideOpen ? null : isSurvivorView ? (
              /**
               * **幸存者：杀手当前打出的卡牌。**
               * 打出的牌本来就摊在桌上，幸存者看得到卡面；
               * `currentKillerCardId` 是"本回合最后打出的那张"，回合开始清空。
               *
               * 用户限定"**杀手回合期间**"，所以别的阶段只给一句说明。
               */
              !inKillerTurnWindow ? (
                <p className="muted">杀手回合期间，这里会显示杀手打出的牌。</p>
              ) : state.currentKillerCardId ? (
                <div className="map-side-card">
                  <h4>杀手打出的牌</h4>
                  {(() => {
                    const cid = state.currentKillerCardId;
                    const card = state.cardById?.[cid];
                    const src = cardArtSrc(card, cid);
                    return (
                      <>
                        {src && (
                          <img
                            src={encodeURI(src)}
                            alt={card?.name ?? cid}
                            draggable={false}
                          />
                        )}
                        <p className="map-side-card-name">{card?.name ?? cid}</p>
                        {card?.text && <p className="muted">{card.text}</p>}
                      </>
                    );
                  })()}
                </div>
              ) : (
                <p className="muted">杀手本回合还没有打出卡牌。</p>
              )
            ) : (
              /**
               * **杀手：地图旁边这块信息栏**。
               *
               * 用户口径（改过两次）：
               *  1. 这里要放「**本大回合的全部战报**」；
               *  2. 原来那块「**获得的信息**」（打牌拿到的感知/追蹤/红外探测…）**去掉** ——
               *     那些信息本来就都会写进战报，现在这块战报里已经有了，不需要再列一遍。
               *
               * 服务端按 `state.round` 筛好、并按"杀手本来就看得见"过滤，这里只管画。
               * 顺序仍然是**旧 → 新**（用户口径），但滚动条默认停在最新那条：
               * 面板撑满地图高度，一进来就贴底。
               */
              <div className="map-side-intel">
                <h4>本大回合战报</h4>
                {(state.roundLogs ?? []).length === 0 ? (
                  <p className="muted">本大回合还没有战报。</p>
                ) : (
                  <div
                    className="round-log-box"
                    ref={roundLogBoxRef}
                    onScroll={(e) => {
                      const el = e.currentTarget;
                      roundLogStickBottomRef.current =
                        el.scrollHeight - el.scrollTop - el.clientHeight < 24;
                    }}
                  >
                    {(state.roundLogs ?? []).map((line, i) => (
                      <div key={`${i}-${line}`}>{line}</div>
                    ))}
                  </div>
                )}
              </div>
            )}
          </aside>
        </div>
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
                ? '开启后可随时移动三名幸存者立绘（仅杀手地图，与真实位置无关）'
                : '点房间摆放或移动立绘，再点同一房间拿起。已知位置也可移动。'}
            </span>
            {standeeMoveOn && standeeHint && <span className="standee-hint">{standeeHint}</span>}
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
          {/**
           * ⚠ **顺序**：行动区在上、杀手卡牌区在下（地图 → 行动区 → 卡牌区 → 战报）。
           * `.table-bottom` 是竖向 flex，DOM 顺序即视觉顺序，所以这两块不能对调回去。
           */}
          <div className="table-chrome">
          <div className="table-actions">
            <h3>行动</h3>
            <div className="action-killer-meta">
              <span>
                杀手 Lv.{state.killerLevel ?? 1} · 力量 {killerPowerText(state)}
              </span>
              {/**
               * 【单人热座】手动切换"现在看哪一边"。
               *
               * 用户要求：单人模式在行动区放一个切换按钮 —— 一个人管着杀手和三名幸存者，
               * 光靠阶段自动推断偶尔会不对（例如坍塌砸到幸存者时没切到幸存者界面），
               * 有这颗按钮就能随时自己切过去处理那一步。
               */}
              {state.mode === 'solo' && !isSpectator && (
                <button
                  type="button"
                  className="ghost-btn viewer-switch-btn"
                  onClick={() =>
                    setManualFaction(viewerFaction === 'killer' ? 'survivor' : 'killer')}
                >
                  切到{viewerFaction === 'killer' ? '幸存者' : '杀手'}界面
                </button>
              )}
              <button type="button" className="ghost-btn" onClick={() => setKillerInfoOpen(true)}>
                查看杀手信息
              </button>
              <button type="button" className="ghost-btn" onClick={() => setSurvivorItemsOpen(true)}>
                求生者相关物品
              </button>
            </div>
            {/**
             * 【变体3】**计划卡按钮**（幸存者行动区右侧）。
             *
             * 用户要求：「幸存者行动区右侧加『计划卡』按钮，点开能看这 2 张卡」。
             * 还没确认计划 / 正在等大家确认时，按钮高亮提醒。
             */}
            {isSurvivorView && state.plans && (
              <div className="row plan-bar">
                <button
                  type="button"
                  className={
                    !state.plans.currentId ||
                    state.plans.pendingSwitch ||
                    state.plans.pendingTarget
                      ? 'primary'
                      : 'ghost-btn'
                  }
                  onClick={() => setPlanOpen(true)}
                >
                  📋 计划卡
                  {!state.plans.currentId
                    ? '（还没确认）'
                    : state.plans.pendingSwitch
                      ? '（等人确认）'
                      : state.plans.pendingTarget
                        ? '（选人抽牌）'
                        : ''}
                </button>
                <span className="muted">
                  {(() => {
                    /** 【情報分享】完成时要先选一名幸存者抽牌 —— 这里提醒去点 */
                    if (state.plans.pendingTarget) {
                      return `情報分享：请选一名幸存者从搜索牌库抽 1 张（点开计划卡）`;
                    }
                    const cur = state.plans.cards.find((c) => c.active);
                    if (!cur) return '先确认一张计划（要所有幸存者玩家同意）';
                    const total = cur.progress.length;
                    return `当前进行「${cur.name}」：进度 ${state.plans.step}/${total}` +
                      (state.plans.step >= total ? '（已完成）' : '');
                  })()}
                </span>
              </div>
            )}
            {/**
             * 雕像：正在依次移动时，明确写出「当前是雕像 N 在移动」，
             * 免得杀手分不清现在拖的是哪一尊。
             */}
            {state.isStatueKiller && state.pendingStatueStepIndex != null && (
              <p className="acting-now statue-moving-now">
                当前移动中：<strong>雕像 {state.pendingStatueStepIndex}</strong>
                {state.pendingPathDraft
                  ? ` · 已选 ${Math.max(0, state.pendingPathDraft.rooms.length - 1)} 步（${
                      state.pendingPathDraft.min
                    }–${state.pendingPathDraft.max} 步）`
                  : ''}
              </p>
            )}
            {/**
             * **开局准备：雕像选主雕像**（`statueSetup`）。
             * 这是游戏开始前的准备动作，**不占杀手回合**；选定后本局锁定，不能再改。
             *
             * ⚠ 用户要求"选择要确认"：点一尊只记下选择（服务端记在
             * `pendingStatueSwitch`），再点下面的「确认主雕像」才生效。
             */}
            {state.phase === 'statueSetup' && !isSurvivorView && (
              <div className="stack">
                <h4>开局准备：选择主雕像</h4>
                <p className="muted">
                  雕像有 4 尊（1、2 号在主要出口，3、4 号在隐藏出口）。
                  请选一尊作为**主雕像**，再点「确认主雕像」—— **确认后本局不能再改**。
                </p>
                <div className="row">
                  {(state.statues ?? []).map((st) => {
                    const picked = state.pendingStatueSwitch === st.id;
                    return (
                      <button
                        key={`setup-main-${st.id}`}
                        type="button"
                        className={`statue-pick${st.main ? ' main' : ''}${picked ? ' picked' : ''}`}
                        onClick={() => void onAction({ type: 'chooseMainStatue', statueId: st.id })}
                      >
                        <span className="statue-pick-idx">雕像 {st.index}</span>
                        <span className="statue-pick-room">
                          {roomDisplayName(state.map, st.roomId, viewerFaction)}
                        </span>
                      </button>
                    );
                  })}
                </div>
                <div className="row">
                  <button
                    type="button"
                    className="primary"
                    disabled={!state.pendingStatueSwitch}
                    onClick={() => void onAction({ type: 'confirmMainStatue' })}
                  >
                    确认主雕像
                  </button>
                </div>
              </div>
            )}
            {/**
             * 雕像在选主雕像时，幸存者这边给个说明（免得看着空白以为卡住）。
             */}
            {state.phase === 'statueSetup' && isSurvivorView && (
              <p className="muted">开局准备：雕像杀手正在选择主雕像。选完就开始第 1 回合。</p>
            )}
            {/**
             * 开局准备阶段：女猎手在布陷阱，幸存者这边给个说明，
             * 免得看着一片空白以为卡住了。
             */}
            {state.phase === 'trapSetup' && isSurvivorView && (
              <p className="muted">
                开局准备：女猎手正在秘密布下猎手陷阱。地图上带「?」的地方就是陷阱位置，
                走过去会触发（经过也算），但只有女猎手知道哪个是什么陷阱。
              </p>
            )}
            {/**
             * 女猎手放置陷阱（**开局准备步骤**，不是杀手回合）：
             * 行动区给 3 个按钮（捕熊 / 白骨 / 捕网）。
             * 点一个按钮 → 再点地图上的地点来放（再点同一格取消）；
             * 捕网要放两个；全部放完后出现「确认」。
             *
             * 服务端会停在 'trapSetup' 阶段，布完才进入第 1 回合。
             */}
            {state.isHuntressKiller &&
              viewerFaction === 'killer' &&
              state.trapPlacement &&
              !state.trapPlacement.done && (
                <div className="trap-place">
                  <span className="muted">
                    <strong>{state.phase === 'trapSetup' ? '开局准备：' : '陷阱重置：'}</strong>
                    布下猎手陷阱（2 捕网 / 1 白骨 / 1 捕熊）。先选陷阱类型，
                    {state.trapPlacement.restricted
                      ? '再点地图上的「常规搜索位 / 常规修理位」放置'
                      : '再点地图上任意一个地点放置'}
                    （4 个陷阱要在 4 个不同地点；再点同一格可取消）。
                    {state.trapPlacement.restricted
                      ? '开局布置只能放这些位置。'
                      : '陷阱重置不受位置限制。'}
                    放好后幸存者地图上那些地点才出现「?」。
                  </span>
                  <div className="row">
                    {(
                      [
                        ['bear', '放置捕熊陷阱'],
                        ['bone', '放置白骨陷阱'],
                        ['net', '放置捕网陷阱'],
                      ] as const
                    ).map(([kind, label]) => {
                      const left = state.trapPlacement!.remaining[kind];
                      return (
                        <button
                          key={kind}
                          type="button"
                          className={state.trapPlacement!.kind === kind ? 'primary' : undefined}
                          disabled={left <= 0}
                          onClick={() => void onAction({ type: 'pickTrapKind', kind })}
                        >
                          {label}
                          {left > 0 ? `（还剩 ${left}）` : '（已放完）'}
                        </button>
                      );
                    })}
                  </div>
                  {state.trapPlacement.kind && (
                    <p className="muted">
                      已选「
                      {state.trapPlacement.kind === 'bear'
                        ? '捕熊陷阱'
                        : state.trapPlacement.kind === 'bone'
                          ? '白骨陷阱'
                          : '捕网陷阱'}
                      」，请点地图上带问号的位置放置。
                    </p>
                  )}
                  {/**
                   * **重置陷阱放置**（用户要求）：确认之前可以清掉已点的，
                   * 重新选一遍类型和位置。
                   */}
                  <div className="row">
                    <button
                      type="button"
                      onClick={() => void onAction({ type: 'resetTrapPlacement' })}
                    >
                      重置陷阱放置
                    </button>
                  </div>
                  {state.trapPlacement.allPlaced && (
                    <div className="row">
                      <button
                        type="button"
                        className="primary"
                        onClick={() => void onAction({ type: 'confirmTrapPlacement' })}
                      >
                        确认陷阱放置
                      </button>
                    </div>
                  )}
                </div>
              )}
            {/**
             * 雕像杀手：列出雕像 1–4。选一尊后地图上对应立绘高亮，
             * 然后在行动区确认才真正切换主雕像。
             * 也可以直接点地图上的非主雕像立绘（同样要回来确认）。
             *
             * ⚠ **只在"真的能切换"时才显示** —— 主雕像在开局准备选定后本局锁定
             * （服务端 `pickMainStatue` 会拒），所以平时不该一直挂着这个面板。
             *
             * 两个合法时机各有各的面板，这里只管**重整旗鼓**：
             *  - 进化等级 1「每当你升级时都可以转换主雕像」→ 上方 `pendingStatueEvoSwitch` 那一块
             *  - 打出「重整旗鼓」后 → 本面板（且这次机会还没用掉）
             */}
            {state.isStatueKiller &&
              viewerFaction === 'killer' &&
              (state.statues?.length ?? 0) > 0 &&
              state.phase !== 'statueSetup' &&
              state.pendingStatueEvoSwitch !== true &&
              state.pendingStatueRally === true &&
              state.pendingStatueRallySwitched !== true && (
              <div className="statue-switch">
                <span className="muted">
                  重整旗鼓：你可以切换主雕像（也可以不切）。选一尊后确认。
                </span>
                <div className="row">
                  {(state.statues ?? []).map((st) => {
                    const picked = state.pendingStatueSwitch === st.id;
                    /**
                     * **当前主雕像不能再选** —— 切换必须换成**另一尊**。
                     * 服务端本来就会拒（「它已经是主雕像」），这里直接禁用 + 说明，
                     * 免得玩家点了才吃到报错。
                     */
                    return (
                      <button
                        key={st.id}
                        type="button"
                        className={`statue-pick${st.main ? ' main' : ''}${picked ? ' picked' : ''}${st.halted ? ' halted' : ''}`}
                        disabled={st.main}
                        onClick={() => onAction({ type: 'pickMainStatue', statueId: st.id })}
                        title={
                          st.main
                            ? '它已经是主雕像 —— 切换要选另一尊'
                            : st.halted
                              ? '本回合被停滞'
                              : '选它作为新的主雕像'
                        }
                      >
                        <span className="statue-pick-idx">雕像 {st.index}</span>
                        <span className="statue-pick-room">
                          {roomDisplayName(state.map, st.roomId, 'killer')}
                        </span>
                        {st.main && <span className="statue-pick-tag">主雕像</span>}
                        {st.halted && <span className="statue-pick-tag halted">已停滞</span>}
                      </button>
                    );
                  })}
                </div>
                {state.pendingStatueSwitch && (
                  <div className="row">
                    <button
                      type="button"
                      className="primary"
                      onClick={() => onAction({ type: 'confirmMainStatue' })}
                    >
                      确认切换主雕像
                    </button>
                    <button type="button" onClick={() => onAction({ type: 'cancelMainStatue' })}>
                      取消
                    </button>
                  </div>
                )}
              </div>
            )}
            {/* 幸存者侧：明确写出现在轮到谁。杀手侧一律只见「幸存者正在行动」——
                轮到谁行动、谁在翻发现牌，都是幸存者层情报，不能透给杀手。 */}
            {actingSurvivor && isSurvivorView && (
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
                    ? `等待「${actingSurvivor?.name ?? '当前幸存者'}」进行一般行动。任何幸存者仍可交换物品或额外行动。`
                    : `等待「${actingSurvivor?.name ?? '当前幸存者'}」进行一般行动。你仍可交出自己的物品或做自己的额外行动；给予或互换需对方确认，栏满只能互换。`
                  : isSurvivorView
                    ? '等待当前玩家行动…'
                    : '幸存者正在行动'}
              </p>
            )}
            {/**
             * `extraPick` 有 4 种：whiskey / adrenaline / sprint / noteNoise。
             * ⚠ `sprint` 有自己的面板（见下面的短跑冲刺块），不会走到这里；
             * `noteNoise`（乔治笔记·响声）以前漏了，落到 else 分支后
             * 按钮会显示成「**短跑到**某处」—— 这里补齐各自的文案。
             */}
            {extraPick && extraPick.kind !== 'sprint' && (
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
                      {extraPick.kind === 'whiskey'
                        ? '扔向'
                        : extraPick.kind === 'adrenaline'
                          ? '移动到'
                          : extraPick.kind === 'noteNoise'
                            ? '在'
                            : extraPick.kind === 'traitRoom'
                              ? extraPick.traitChoice === 'removeBlockade'
                                ? '拆除这里的封堵'
                                : extraPick.traitChoice === 'noise'
                                  ? '在这里'
                                  : '发动特性卡 →'
                              : '移动到'}
                      {roomDisplayName(state.map, extraDest, viewerFaction)}
                      {extraPick.kind === 'noteNoise'
                        ? ' 制造响声'
                        : extraPick.kind === 'traitRoom' && extraPick.traitChoice === 'noise'
                          ? ' 制造响声'
                          : ''}
                    </button>
                  )}
                </div>
              </div>
            )}
            {/**
             * **【分头行动】你已经出局了**（逃脱或被杀）。
             *
             * 用户规则：幸存者**各自结算、各管各的** —— 逃脱的人带着自己的钥匙和
             * 物品走了；被杀的人倒在原地，钥匙和物品**留在那个地点**等队友来拿。
             * 两种情况都**不能再行动**，所以这里给一块说明，并把行动按钮收掉
             * （否则点了只会被服务端顶回来「已倒下」）。
             */}
            {state.split === true && isSurvivorView && state.you.alive === false && (
              <div className="panel stack">
                <strong>
                  {state.you.escaped ? '你已经逃脱了' : '你已经倒下了'}
                </strong>
                <p className="muted">
                  {state.you.escaped
                    ? '分头行动：你带着自己的钥匙和物品离开了，剩下的队友各自结算。你只能旁观。'
                    : '分头行动：你倒在了原地，钥匙和物品留在那个地点，同地点的队友可以拿走。你已经不能行动。'}
                </p>
              </div>
            )}
            {isSurvivorView &&
              state.phase === 'survivorMain' &&
              !(state.split === true && state.you.alive === false) && (
              <div className="row">
                <button type="button" className={tradeOpen ? 'primary' : ''} onClick={() => setTradeOpen((v) => !v)}>
                  交换物品
                </button>
                <button type="button" onClick={() => setExtraOpen(true)}>
                  额外行动
                </button>
                {/*
                  雕像：停滞。必须是这名幸存者本回合的唯一行动 ——
                  做过其他任何行动（含额外行动、交换物品）就选不了。
                  而且**只能停滞与自己同一地点的雕像**，所以所在地点没有雕像时不显示这个按钮。
                */}
                {state.isStatueKiller &&
                  (state.statues ?? []).some(
                    (st) => st.roomId && st.roomId === state.you.roomId && !st.halted,
                  ) && (
                    <button type="button" onClick={() => setHaltStatueOpen((v) => !v)}>
                      停滞雕像
                    </button>
                  )}
                {/**
                 * 狼人宝藏：幸存者在自己所在地点有没开过的宝箱时，可以开一个。
                 * 开箱 → 抽 1 张宝藏牌、那个宝箱图标消失。
                 */}
                {(() => {
                  const chestId = (state.treasureChests ?? []).find((id) =>
                    (state.map.tokens ?? []).some(
                      (t) => t.id === id && t.kind === 'treasureChest' && t.roomId === state.you.roomId,
                    ),
                  );
                  if (!chestId) return null;
                  return (
                    <button
                      type="button"
                      className="primary"
                      onClick={() =>
                        void onAction({
                          type: 'openChest',
                          chestId,
                          actorPlayerId: state.you.faction === 'survivor' ? state.you.id : undefined,
                        })
                      }
                    >
                      开宝箱（宝藏牌堆剩 {state.treasureDeckCount ?? 0}）
                    </button>
                  );
                })()}
                {state.survivorActionsDone && (
                  <button
                    type="button"
                    className="primary"
                    onClick={() => void onAction({ type: 'finishSurvivorPhase' })}
                  >
                    幸存者所有操作已结束
                  </button>
                )}
              </div>
            )}
            {state.isStatueKiller && isSurvivorView && haltStatueOpen && (
              <div className="statue-halt">
                <p className="muted">
                  选择要停滞的雕像：本回合该雕像不能移动和搜索。
                  <strong>只能停滞与你同一地点的雕像</strong>。
                  <strong>停滞必须是这名幸存者本回合的唯一行动</strong> ——
                  做过其他行动（含额外行动、交换物品）就不能再停滞。
                </p>
                <div className="row">
                  {/**
                   * **只列"与你同一地点、且还没被停滞"的雕像**（用户要求：
                   * 「只有当地有未被停滞的雕像时才能选择停滞雕像，
                   * 只能选未被停滞的一个雕像」）。
                   * 「停滞雕像」那颗按钮已经保证"当地至少有一尊可停滞"，所以这里不会空。
                   */}
                  {(state.statues ?? [])
                    .filter(
                      (st) =>
                        Boolean(state.you.roomId) &&
                        st.roomId === state.you.roomId &&
                        !st.halted,
                    )
                    .map((st) => {
                      return (
                        <button
                          key={st.id}
                          type="button"
                          /**
                           * ⚠ **不给主雕像加高亮**：这是**幸存者**的面板，
                           * 而"哪尊是主雕像"是杀手的秘密（用户要求：
                           * 「雕像游戏中，幸存者界面不能有正确的主雕像的高亮显示」）。
                           * 幸存者只能看到编号和所在地点，自己猜。
                           */
                          className="statue-pick"
                          onClick={() =>
                            void onAction({
                              type: 'haltStatue',
                              statueId: st.id,
                              actorPlayerId:
                                state.you.faction === 'survivor' ? state.you.id : undefined,
                            })
                          }
                        >
                          <span className="statue-pick-idx">雕像 {st.index}</span>
                          <span className="statue-pick-room">
                            {roomDisplayName(state.map, st.roomId, viewerFaction)}
                          </span>
                        </button>
                      );
                    })}
                  <button type="button" onClick={() => setHaltStatueOpen(false)}>
                    取消
                  </button>
                </div>
              </div>
            )}
            {(showSurvivorPickRow || state.pendingDiscoveryPick) && isSurvivorView && (
              <div className="stack">
                <p className="muted">
                  {state.pendingDiscoveryPick
                    ? '发现阶段：点状态栏或立绘选择翻牌的幸存者。'
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
            {/**
             * 【变体1】02 玩弄猎物：遭遇爆发时**先问杀手**要不要取消这次遭遇
             * （用户顺序：先杀手取不取消，再幸存者用不用 12）。
             */}
            {!isSurvivorView && state.variant1 && state.pendingPreyOffer && (
              <div className="panel stack">
                <strong>【变体1】玩弄猎物：要取消这次遭遇吗？</strong>
                <p className="muted">
                  取消的话：立刻结束这次遭遇、**额外抽 3 张卡牌**，然后本回合结束
                  （回合结束的常规摸牌照常）。不取消就继续打，回头还会问幸存者的「英勇阻截」。
                </p>
                <div className="row">
                  <button
                    type="button"
                    className="primary"
                    onClick={() => void onAction({ type: 'useTrait', traitId: 'trait_k02' })}
                  >
                    取消遭遇（额外抽 3 张并结束回合）
                  </button>
                  <button
                    type="button"
                    onClick={() =>
                      void onAction({ type: 'useTrait', traitId: 'trait_k02', decline: true })
                    }
                  >
                    不取消，继续遭遇
                  </button>
                </div>
              </div>
            )}
            {/**
             * 【变体1】12 英勇阻截：遭遇爆发、**告知杀手发现名单之后**问持有人要不要发动
             * （卡面写"可以"）。发动后逐个给其他幸存者选 1 格方向。
             */}
            {state.variant1 && state.pendingHeroicBlock && !state.pendingHeroicBlock.started && (
              <div className="panel stack">
                <strong>【变体1】英勇阻截（每局一次）</strong>
                <p className="muted">
                  你和别人一起遭遇了杀手 —— 要不要让其他幸存者各【移动】1 格逃离这次攻击？
                  跑掉的人会脱离这次遭遇。
                </p>
                <div className="row">
                  <button
                    type="button"
                    className="primary"
                    onClick={() =>
                      void onAction({
                        type: 'useTrait',
                        traitId: 'trait_s12',
                        actorPlayerId: state.you.id,
                      })
                    }
                  >
                    发动
                  </button>
                  <button
                    type="button"
                    onClick={() =>
                      void onAction({
                        type: 'useTrait',
                        traitId: 'trait_s12',
                        actorPlayerId: state.you.id,
                        decline: true,
                      })
                    }
                  >
                    不发动
                  </button>
                </div>
              </div>
            )}
            {state.variant1 &&
              state.pendingHeroicBlock?.started &&
              state.pendingHeroicBlock.queue.length > 0 &&
              (() => {
                const nextId = state.pendingHeroicBlock!.queue[0]!;
                const next = state.players.find((x) => x.id === nextId);
                return (
                  <div className="panel stack">
                    <strong>【变体1】英勇阻截：为 {next?.name ?? '—'} 选 1 格方向</strong>
                    <div className="row">
                      <button
                        type="button"
                        onClick={() => {
                          const start = next?.roomId;
                          setExtraPick({
                            kind: 'traitRoom',
                            traitId: 'trait_s12',
                            rooms: start ? generalNeighbors(state.map, start) : [],
                            actorPlayerId: nextId,
                          });
                        }}
                      >
                        点地图选方向
                      </button>
                      <span className="muted">
                        还剩 {state.pendingHeroicBlock!.queue.length} 人选方向；跑掉（不在遭遇地点）的人会脱离这次遭遇。
                      </span>
                    </div>
                  </div>
                );
              })()}
            {/**
             * 【变体1】17 压迫威慑：升级到 3/4/5 级时，**由杀手点一名幸存者**惊吓
             * （用户要求：卡面写"任意"的都要自己选）。
             */}
            {!isSurvivorView && state.pendingTraitVictim && (
              <div className="panel stack">
                <strong>
                  【变体1】压迫威慑（升级到 {state.pendingTraitVictim.level} 级）：选 1 名幸存者
                  【惊吓】
                </strong>
                <div className="row">
                  {state.players
                    .filter((x) => x.faction === 'survivor' && x.alive)
                    .map((x) => (
                      <button
                        key={`k17-${x.id}`}
                        type="button"
                        onClick={() =>
                          void onAction({
                            type: 'useTrait',
                            traitId: state.pendingTraitVictim!.traitId,
                            actorPlayerId: state.you.id,
                            targetPlayerId: x.id,
                          })
                        }
                      >
                        {x.name}
                      </button>
                    ))}
                </div>
              </div>
            )}
            {/**
             * 【变体1】特性 11「安静搜查」的询问（用户口径：**每次发现要响时都问一句**）。
             * 只发给本人；两个按钮决定这次响声取不取消（每局只能取消一次）。
             */}
            {state.variant1 && state.pendingQuietSearch && (
              <div className="panel stack">
                <strong>【变体1】安静搜查（每局一次）</strong>
                <p className="muted">
                  {state.pendingQuietSearch.from === 'suitcase'
                    ? '手提箱翻到的发现牌带有响声标记'
                    : '这次发现牌带有响声标记'}
                  ——要不要用「安静搜查」取消这次响声？
                </p>
                <div className="row">
                  <button
                    type="button"
                    className="primary"
                    onClick={() => void onAction({ type: 'resolveQuietSearch', use: true })}
                  >
                    取消这次响声
                  </button>
                  <button
                    type="button"
                    onClick={() => void onAction({ type: 'resolveQuietSearch', use: false })}
                  >
                    让它照响
                  </button>
                </div>
              </div>
            )}
            {/**
             * 【变体1】还没轮到你选（或别人还没选完）时的等待提示 ——
             * 所有人都选完才会开始第 1 回合。
             */}
            {state.variant1 && (state.traitPickerIds ?? []).length > 0 && !state.yourTraitPick && (
              <p className="muted">
                【变体1】特性卡：等待{' '}
                {(state.traitPickerIds ?? [])
                  .map((id) => state.players.find((p) => p.id === id)?.name ?? '玩家')
                  .join('、')}{' '}
                选特性卡…（所有人都选完才开始第 1 回合）
              </p>
            )}
            {(state.pendingSurvivorPick || state.pendingDiscoveryPick) && !isSurvivorView && (
              <p className="muted">
                {state.pendingDiscoveryPick
                  ? '等待幸存者选择谁来翻发现牌…'
                  : sharedControl
                    ? '等待幸存者选择行动顺序…'
                    : '等待幸存者点选自己开始小回合…'}
              </p>
            )}

            {/**
             * **【分头行动】给钥匙**（额外行动）。
             *
             * 钥匙单独保管、不在物品栏里，所以拖拽那套（`tradeItem`）用不上 ——
             * 这里给一个直白的入口：**点谁 → 点几把**，对方在弹窗里确认。
             * 规则要求"同一地点"，所以只列同地点、还活着的其他幸存者。
             */}
            {state.split === true &&
              isSurvivorView &&
              state.phase === 'survivorMain' &&
              (state.splitKeys?.[state.you.id] ?? 0) > 0 &&
              (() => {
                const mine = state.splitKeys?.[state.you.id] ?? 0;
                const targets = survivors.filter(
                  (p) => p.alive && p.id !== state.you.id && p.roomId === state.you.roomId,
                );
                if (!targets.length) return null;
                const maxPick = Math.min(5, mine);
                return (
                  <div className="panel stack">
                    <p className="muted">
                      分头行动：**给钥匙**（额外行动，同一地点才给得出去；对方要在弹窗里确认）。
                      你现在有 {mine} 把。
                    </p>
                    {targets.map((t) => (
                      <div className="row" key={`givekeys-${t.id}`}>
                        <strong>{t.name}</strong>
                        {Array.from({ length: maxPick }, (_, i) => i + 1).map((n) => (
                          <button
                            key={n}
                            type="button"
                            onClick={() =>
                              void onAction({
                                type: 'tradeKeys',
                                targetPlayerId: t.id,
                                amount: n,
                                fromPlayerId: state.you.id,
                              })
                            }
                          >
                            给 {n} 把
                          </button>
                        ))}
                        <button
                          type="button"
                          onClick={() =>
                            void onAction({
                              type: 'tradeKeys',
                              targetPlayerId: t.id,
                              amount: mine,
                              fromPlayerId: state.you.id,
                            })
                          }
                        >
                          全部（{mine} 把）
                        </button>
                      </div>
                    ))}
                  </div>
                );
              })()}

            {/**
             * **【分头行动】拿取遗留物**（额外行动）。
             *
             * 被杀的幸存者**立绘留在原地变暗**，身上的钥匙和物品也留在那里，
             * 同地点的人可以直接拿走（人已经倒下，不需要对方确认）。
             *
             * ⚠ **逃脱的人不算**：用户规则「逃脱的幸存者就不留物品和钥匙了，
             * 改为一律清零」—— 他只剩一个变暗的立绘，身上没东西可拿。
             */}
            {state.split === true &&
              isSurvivorView &&
              state.phase === 'survivorMain' &&
              (() => {
                const corpses = survivors.filter(
                  (p) =>
                    p.downed &&
                    !p.escaped &&
                    p.roomId &&
                    p.roomId === state.you.roomId,
                );
                if (!corpses.length) return null;
                return (
                  <div className="panel stack">
                    <p className="muted">
                      分头行动：**拿取同地遗留物**（额外行动）。被杀的队友留在了这个地点，
                      他身上的钥匙和物品可以直接拿走 —— 不需要对方确认。
                    </p>
                    {corpses.map((c) => {
                      const ids = ownedItemIds(c.items);
                      const keys = state.splitKeys?.[c.id] ?? c.keys ?? 0;
                      return (
                        <div className="stack" key={`loot-${c.id}`}>
                          <p>
                            <strong>{c.name}</strong>（已倒下）
                            {keys > 0 ? ` · 钥匙 ${keys} 把` : ''}
                            {ids.length
                              ? ` · ${ids
                                  .map(
                                    (id) =>
                                      `${ITEM_LABEL[id] ?? id}${
                                        (c.items[id] ?? 0) > 1 ? `×${c.items[id]}` : ''
                                      }`,
                                  )
                                  .join('、')}`
                              : ''}
                          </p>
                          <div className="row">
                            {Array.from({ length: Math.min(5, keys) }, (_, i) => i + 1).map((n) => (
                              <button
                                key={`lootkeys-${c.id}-${n}`}
                                type="button"
                                onClick={() =>
                                  void onAction({
                                    type: 'lootFrom',
                                    fromPlayerId: c.id,
                                    amount: n,
                                  })
                                }
                              >
                                拿 {n} 把钥匙
                              </button>
                            ))}
                            {ids.map((itemId) => (
                              <button
                                key={`lootitem-${c.id}-${itemId}`}
                                type="button"
                                onClick={() =>
                                  void onAction({
                                    type: 'lootFrom',
                                    fromPlayerId: c.id,
                                    itemId,
                                  })
                                }
                              >
                                拿 {ITEM_LABEL[itemId] ?? itemId}
                                {(c.items[itemId] ?? 0) > 1 ? `×${c.items[itemId]}` : ''}
                              </button>
                            ))}
                            {keys === 0 && ids.length === 0 && (
                              <span className="muted">他身上没有东西了。</span>
                            )}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                );
              })()}

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
                    ? '发现阶段之前，只要两名幸存者在同一地点就可以互相给予或 1 换 1（钥匙除外）。两边背包都满了也可以互换。三人同地则任意两人之间都能给。'
                    : '只能从自己的装备栏交出物品。拖到同地队友空格是给予，拖到已有牌是互换；对方确认后才会到手。栏满只能互换，不能硬塞。'}
                </p>
                {tradeGroups.length === 0 ? (
                  <p className="muted">目前没有两名幸存者在同一地点。</p>
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
                            {/* 个人物品可以交给队友保管，但只有本人能用（服务端会把关使用） */}
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

            {/**
             * ⚠ **发现阶段还有候选时，先让玩家选牌，别抢着提示弃置**
             * （用户口径：「翻发现牌，如果幸存者背包满了，应该**先选择要拿的发现牌**，
             * 再选择弃置哪张牌」）。
             *
             * 背包满的旧账常常是上一个动作（搜索拿到物品）留下的；
             * 以前这块面板不管三七二十一先画出来，玩家一进发现阶段只看到
             * "请弃置一件装备"，那两张候选反而看不见（用户报的截图就是这个）。
             */}
            {state.pendingItemDiscard &&
              (state.pendingItemDiscard.items != null ||
                state.pendingItemDiscard.playerId === state.you.id) &&
              !(state.phase === 'discovery' && discoveryOptions.length > 0) && (
              <div className="stack">
                <p className="muted">
                  {state.pendingItemDiscard.name
                    ? `「${state.pendingItemDiscard.name}」`
                    : '幸存者'}
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
                  {state.players.find((p) => p.id === state.discoveryActorId)?.name ?? '幸存者'}
                </h4>
                <p className="muted">
                  {discoveryOptions.length === 1
                    ? '发现牌堆只剩这一张，直接收下。'
                    : state.discoveryActorId
                      ? `由「${state.players.find((p) => p.id === state.discoveryActorId)?.name ?? '幸存者'}」翻牌：留 1 张，另一张进入弃牌堆。`
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
                        /** 摸 2 选 1 的牌：用同一个"摸牌滑入"动画（这块每次翻牌都重新挂载，所以会重播） */
                        className="card card-enter"
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

            {/**
             * 2对3：【查看另一名杀手界面】。
             *
             * 两名杀手各自只看自己的行动区与卡牌区；这个按钮切到**只读**的对方界面，
             * 看他的手牌 / 牌堆 / 弃牌 / 力量 / 等级 / 进化效果。
             * 切过去以后**不提供任何操作入口** —— 操作仍然只作用于自己的棋子。
             */}
            {otherKiller && (
              <div className="stack">
                <div className="row">
                  <button
                    type="button"
                    className={otherKillerView ? 'primary' : undefined}
                    onClick={() => setOtherKillerView((v) => !v)}
                  >
                    {otherKillerView ? '返回我的界面' : `查看另一名杀手界面（${otherKiller.name}）`}
                  </button>
                  {otherKiller.isActing && (
                    <span className="tag">对方正在行动</span>
                  )}
                </div>
                {otherKillerView && (
                  <div className="panel stack">
                    <h3>
                      {otherKiller.name}（{otherKiller.characterName}）—— 只读
                    </h3>
                    <p className="muted">
                      力量 <strong>{otherKiller.power}</strong>
                      ，进化等级 <strong>{otherKiller.level}</strong>
                      ，摸牌堆 <strong>{otherKiller.deckCount}</strong> 张
                      ，猜的修理进度 <strong>{otherKiller.repairGuess}</strong>
                      {otherKiller.isActing ? '（现在轮到他行动）' : '（还没轮到 / 已行动完）'}
                    </p>
                    <div>
                      <strong>手牌（{otherKiller.hand.length}）</strong>
                      {otherKiller.hand.length === 0 ? (
                        <span className="muted"> 无</span>
                      ) : (
                        <ul className="muted">
                          {otherKiller.hand.map((c, i) => (
                            <li key={`${c.id}-${i}`}>{c.name}</li>
                          ))}
                        </ul>
                      )}
                    </div>
                    {otherKiller.locked.length > 0 && (
                      <div>
                        <strong>未解锁（{otherKiller.locked.length}）</strong>
                        <ul className="muted">
                          {otherKiller.locked.map((c, i) => (
                            <li key={`${c.id}-${i}`}>{c.name}</li>
                          ))}
                        </ul>
                      </div>
                    )}
                    {otherKiller.discard.length > 0 && (
                      <div>
                        <strong>弃牌堆（{otherKiller.discard.length}）</strong>
                        <ul className="muted">
                          {otherKiller.discard.slice(-8).map((c, i) => (
                            <li key={`${c.id}-${i}`}>{c.name}</li>
                          ))}
                        </ul>
                      </div>
                    )}
                    {otherKiller.evolutionEffects.length > 0 && (
                      <div>
                        <strong>已生效的进化效果</strong>
                        <ul className="muted">
                          {otherKiller.evolutionEffects.map((e) => (
                            <li key={e.level}>
                              {e.level} 级：{e.text}
                            </li>
                          ))}
                        </ul>
                      </div>
                    )}
                    <p className="muted">
                      这只是查看 —— 你不能替对方出牌或行动。
                    </p>
                  </div>
                )}
              </div>
            )}

            {/**
             * 【观众】行动区**只有一个选项**：切换视角（默认幸存者界面）。
             * 观众 `controllingActive` 为 false，所以其它行动按钮都不会出现。
             */}
            {isSpectator && (
              <div className="stack">
                <p className="muted">
                  你在以【观众】身份观战 —— 当前是
                  <strong>{spectatorView === 'survivor' ? '幸存者' : '杀手'}</strong>
                  视角。观众不能操作对局。
                </p>
                <div className="row">
                  <button
                    type="button"
                    className="primary"
                    onClick={() => setSpectatorView((v) => SPECTATOR_TOGGLE[v])}
                  >
                    切换{SPECTATOR_TOGGLE[spectatorView] === 'survivor' ? '幸存者' : '杀手'}视角
                  </button>
                </div>
              </div>
            )}
            {/**
             * 【墓穴】坍塌收尾：屋里的人**轮流走一步**离开。
             *
             * 规则：屋里的人一个一个选（一次只问一个人），所以这个面板
             * 在任何阶段都可能出现 —— 排在机关大门面板**前面**，因为
             * 坍塌是"升级的最第一时间"触发的，优先级最高。
             *
             * ⚠ **只能画在"该走的那一方"的界面上**（用户要求：
             * 「不要让杀手看到幸存者界面，幸存者不要看到杀手界面」）：
             * 以前不判阵营，于是**杀手界面上问幸存者怎么走**
             * （用户报的截图：杀手进化途中，下面却在问幸存者的移动）。
             *
             *  - 轮到我方：列出能去的相邻地点，点了就走（幸存者不能留在原地）
             *  - 轮到别人：只显示"正在等谁"（这是公开信息），一个按钮都不给
             */}
            {collapsePanel &&
              (collapsePanel.waiting || collapsePanel.faction === viewerFaction) && (
              <div className="stack">
                {collapsePanel.waiting || collapsePanel.faction !== viewerFaction ? (
                  <p className="muted">
                    「{collapsePanel.roomLabel}」坍塌了，正在等{' '}
                    <strong>{collapsePanel.name}</strong>
                    选择移动一步离开……
                  </p>
                ) : (
                  <>
                    <p>
                      💥「{collapsePanel.roomLabel}」坍塌了！
                      <strong>{collapsePanel.name}</strong>
                      必须**移动一步**离开这里
                      {collapsePanel.isKiller ? '（并弃光全部手牌）' : ''}。
                    </p>
                    <div className="row">
                      {collapsePanel.options.length === 0 ? (
                        <span className="muted">所有相邻地点都不通，只能留在原地。</span>
                      ) : (
                        collapsePanel.options.map((opt) => (
                          <button
                            key={opt.roomId}
                            type="button"
                            onClick={() => void onAction({ type: 'collapseMove', toRoomId: opt.roomId })}
                          >
                            移到 {opt.label}
                          </button>
                        ))
                      )}
                    </div>
                  </>
                )}
              </div>
            )}

            {/**
             * 【城堡】机关大门：杀手要过门，得**自选弃 3 张手牌**。
             * 服务端在"移动被大门挡住"时挂起 `pendingGatePay`，这里让杀手点牌 + 确认。
             * 确认后大门被拆除、那次移动自动完成；也可以放弃（不移动、不付费）。
             */}
            {isActive && state.you.faction === 'killer' && state.pendingGatePay && (
              <div className="stack">
                <p className="muted">
                  机关大门挡路
                  {state.pendingGatePay.ownerName
                    ? `（${state.pendingGatePay.ownerName} 操作控制杆放置的）`
                    : ''}
                  ：从手牌里选 <strong>{state.pendingGatePay.cost}</strong> 张弃掉，
                  才能通过并拆除大门（当前手里 {killerHand.length} 张）。
                  通过后你会走到
                  {roomDisplayName(state.map, state.pendingGatePay.toRoomId, viewerFaction)}。
                </p>
                <div className="row">
                  {killerHand.map((cid, idx) => {
                    const picked = gatePayIds.includes(cid);
                    const cost = state.pendingGatePay?.cost ?? 3;
                    /** ⚠ 要选牌的地方都要有卡面（用户要求：别只写卡名） */
                    const card = state.cardById[cid];
                    const art = cardArtSrc(card, cid);
                    return (
                      <button
                        key={`${cid}-gate-${idx}`}
                        type="button"
                        className={picked ? 'card picked' : 'card'}
                        style={picked ? { outline: '2px solid var(--accent, #d98b3a)' } : undefined}
                        onClick={() =>
                          setGatePayIds((cur) =>
                            cur.includes(cid)
                              ? cur.filter((x) => x !== cid)
                              : cur.length < cost
                                ? [...cur, cid]
                                : cur,
                          )
                        }
                      >
                        {art && <img className="inline-card-art" src={encodeURI(art)} alt="" />}
                        <h4>{card?.name ?? cid}</h4>
                        <span className="muted">{picked ? '已选中' : '点击选中'}</span>
                      </button>
                    );
                  })}
                </div>
                <div className="row">
                  <button
                    type="button"
                    className="primary"
                    disabled={gatePayIds.length !== (state.pendingGatePay.cost ?? 3)}
                    onClick={() => {
                      void onAction({ type: 'confirmGatePay', cardIds: gatePayIds });
                      setGatePayIds([]);
                    }}
                  >
                    弃 {state.pendingGatePay.cost} 张并通过
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      void onAction({ type: 'cancelGatePay' });
                      setGatePayIds([]);
                    }}
                  >
                    放弃通过
                  </button>
                </div>
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
                  确认响声（
                  {state.firecrackerThisRound ? '全场' : noiseNames || '无'}
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
                          ? '幸存者已知道杀手是否加攻，再选择是否加防'
                          : enc.step === 'flee'
                            ? '被发现的幸存者可移动 1 格或取消'
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
                        ? '伤害成功。请再选一名尚未被伤害的幸存者。挡住则整场结束。'
                        : '有多人在遭遇地点，请先选择一名幸存者。没有闪避和防御牌。'}
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
                  !(state.pendingKillerDiscards > 0) &&
                  /** 正在为这张牌选弃牌费用时，把攻击面板收起来，避免两个面板打架 */
                  !payForCard && (
                  <div className="stack">
                    <p className="muted">
                      基础攻击 = 力量 {killerPowerText(state)}
                      。每次攻击前都可以选择是否用一张卡牌加攻；这次选了只对当前这一击有效。
                      （有「弃N」的牌要先选够 N 张手牌一同弃置）
                    </p>
                    <div className="row">
                      {killerHand
                        .filter(
                          (cid) =>
                            /**
                             * ⚠ 以前的条件是 `encounterCardAttackBonus > 0`，
                             * 于是**【扼殺】在核心标记为 0 时加攻为 0 → 按钮根本不显示**，
                             * 玩家以为「打不出扼杀」。
                             * 正确口径：**只要是攻击时机能打的牌就列出来**
                             * （扼殺是 attackValuePerCore，张数随核心标记变）。
                             */
                            canPlayAsEncounterAttack(state.cardById[cid]) ||
                            isStatueExecuteCard(state.cardById[cid]),
                        )
                        .map((cid, idx) => {
                          const card = state.cardById[cid];
                          const bonus = encounterCardAttackBonus(state, card);
                          const isExec = isStatueExecuteCard(card);
                          const cost = effectiveHandCost(state, card);
                          const payAll = cost > 0 && killerHand.filter((x) => x !== cid).length === cost;
                          const canPay = cost === 0 || payAll || killerHand.filter((x) => x !== cid).length > cost;
                          return (
                            <button
                              key={`${cid}-enc-${idx}`}
                              type="button"
                              className="card"
                              disabled={!canPay}
                              title={!canPay ? `需要再弃 ${cost} 张手牌，但手牌不够` : undefined}
                              onClick={() => playEncounterAttackCard(cid)}
                            >
                              <h4>
                                {/** ⚠ 要选牌的地方都要有卡面（用户要求：别只写卡名） */}
                                {cardArtSrc(card, cid) && (
                                  <img
                                    className="inline-card-art"
                                    src={encodeURI(cardArtSrc(card, cid)!)}
                                    alt=""
                                  />
                                )}
                                {isExec
                                  ? `打出「${card?.name ?? cid}」（掷完防御骰后判定）`
                                  : bonus > 0
                                    ? `打出「${card?.name ?? cid}」（本次 +${bonus}）`
                                    : `打出「${card?.name ?? cid}」`}
                                {cost > 0 ? ` · 弃${cost}` : ''}
                              </h4>
                              <div className="muted">{card?.text}</div>
                            </button>
                          );
                        })}
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
                {/**
                 * **攻击牌要弃牌时，就地把可弃的手牌列出来**（用户要求：
                 * 「当杀手的攻击卡牌需要弃牌时在行动区列出选项」）。
                 *
                 * ⚠ 以前选了「弃N」的攻击牌后：上面那个攻击面板因为 `!payForCard`
                 * 收起来了，而"选弃牌"那块只画在**杀手手牌区**里 ——
                 * 遭遇阶段手牌区并不渲染，于是**两个面板全没了**，
                 * 玩家只看到"什么都没发生"。
                 */}
                {enc.step === 'attack' &&
                  !enc.attackChoiceMade &&
                  isActive &&
                  state.you.faction === 'killer' &&
                  payForCard &&
                  payPurpose === 'encounterAttack' && (
                  <div className="stack">
                    <p className="muted">
                      打出「{state.cardById[payForCard]?.name ?? payForCard}」需再选{' '}
                      <strong>
                        {Math.max(
                          0,
                          effectiveHandCost(state, state.cardById[payForCard]) - payIds.length,
                        )}
                      </strong>{' '}
                      张手牌一同弃置（选够就会自动打出；再点已选的牌可取消）。
                    </p>
                    <div className="row">
                      {killerHand
                        .filter((cid) => cid !== payForCard)
                        .map((cid, idx) => {
                          const card = state.cardById[cid];
                          const picked = payIds.includes(cid);
                          return (
                            <button
                              key={`${cid}-encpay-${idx}`}
                              type="button"
                              className={`card${picked ? ' pay-pick' : ''}`}
                              /** `payForCard` 非空时，`playKillerCard` 这一支就是"选/取消支付" */
                              onClick={() => playKillerCard(cid)}
                            >
                              <h4>{card?.name ?? cid}</h4>
                              <div className="muted">{card?.text}</div>
                            </button>
                          );
                        })}
                    </div>
                    <div className="row">
                      <button
                        type="button"
                        onClick={() => {
                          setPayForCard(null);
                          setPayPurpose(null);
                          setPayIds([]);
                        }}
                      >
                        取消（不打出这张攻击牌）
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
                          ? `杀手已打出「${state.cardById[enc.attackCardId]?.name ?? enc.attackCardId}」，本次攻击 +${state.encounterTailBonus ?? encounterCardAttackBonus(state, state.cardById[enc.attackCardId])}。`
                          : enc.attackBoost
                            ? `杀手已加攻 +${state.encounterTailBonus ?? 0}。`
                            : '杀手不加攻击。'}
                      </p>
                      {/**
                       * **剛毅之盾**要从"一次只能选一件"里**拆出来**单独做一个开关
                       * （用户要求：「剛毅之盾在防御时也要有选项，只是不占用防御物品名额」）。
                       * 服务端把它算进 `defenseItemChoices` 只是为了让它出现在这里。
                       *
                       * ⚠ 荊棘纏繞（`enc.blockItems`）时**物品和盾都不能用**（用户明确），
                       * 所以按钮直接禁用 + 给一句说明，免得点了才吃报错。
                       */}
                      {enc.blockItems && (
                        <p className="muted">
                          荊棘纏繞：本次攻击中你**不能使用任何物品**（含剛毅之盾）。
                        </p>
                      )}
                      {(() => {
                        const blocked = Boolean(enc.blockItems);
                        const shieldChoice = defendItemChoices.find((c) => c.id === 'relic_shield');
                        const itemChoices = defendItemChoices.filter((c) => c.id !== 'relic_shield');
                        return (
                          <>
                            {itemChoices.length > 0 && (
                              <div className="stack">
                                <p className="muted">
                                  **一次防御只能选一件**（骰子自动），可选
                                  {youHaveTenacity ? '；不用物品则「坚韧不拔」+1' : ''}
                                </p>
                                <div className="row">
                                  {itemChoices.map((choice) => (
                                    <button
                                      key={choice.id}
                                      type="button"
                                      disabled={blocked}
                                      className={defenseItemId === choice.id ? 'primary' : ''}
                                      onClick={() =>
                                        setDefenseItemId((cur) => (cur === choice.id ? null : choice.id))
                                      }
                                    >
                                      {choice.name}（{choice.hint}）
                                    </button>
                                  ))}
                                </div>
                              </div>
                            )}
                            {shieldChoice && (
                              <div className="stack">
                                <div className="row">
                                  <button
                                    type="button"
                                    disabled={blocked}
                                    className={shieldPicked ? 'primary' : ''}
                                    onClick={() => setShieldPicked((on) => !on)}
                                  >
                                    {shieldPicked ? '✓ ' : ''}
                                    {shieldChoice.name}（{shieldChoice.hint}）
                                  </button>
                                  <span className="muted">
                                    遗物，**不占防御物品名额** —— 可以和上面那件一起用
                                  </span>
                                </div>
                              </div>
                            )}
                          </>
                        );
                      })()}
                      {youHaveTenacity && (
                        <p className="muted">
                          {defenseItemId || shieldPicked
                            ? '已选加防物品/遗物：「坚韧不拔」本场不触发。'
                            : '即使身上有加防物品，只要本场不使用，「坚韧不拔」也会 +1。'}
                        </p>
                      )}
                      <button
                        type="button"
                        className="primary"
                        onClick={() =>
                          void runSurvivor(
                            defenseItemId
                              ? '使用物品防御'
                              : shieldPicked
                                ? '使用剛毅之盾防御'
                                : '不使用防御物品',
                            {
                              type: 'playEncounterDefense',
                              cardId: null,
                              itemId: defenseItemId,
                              shield: shieldPicked,
                            },
                          )
                        }
                      >
                        {defenseItemId
                          ? `确认用${ITEM_LABEL[defenseItemId] ?? defenseItemId}${shieldPicked ? ' + 剛毅之盾' : ''}`
                          : shieldPicked
                            ? '确认用剛毅之盾（+1）'
                            : '确认（不用物品）'}
                      </button>
                    </div>
                  )}
                {/**
                 * 【变体3】**燃燒瓶的第二段**：防御物品**确认之后**，单独问一次
                 * "要不要弃掉一个威士忌酒瓶 +2 防御"。
                 *
                 * 用户口径：酒瓶是**弃置**（进弃牌堆），不算使用物品、不占防御物品名额，
                 * 也不影响威廉「坚韧不拔」/ 剛毅之盾 —— 所以这一步排在确认之后、掷骰之前。
                 */}
                {enc.step === 'defend' &&
                  enc.whiskeyOffer?.playerId === state.you.id &&
                  !state.pendingDice && (
                    <div className="stack">
                      <p>
                        【燃燒瓶】你还可以<strong>弃置一个威士忌酒瓶</strong>来让本次防御
                        <strong> +2</strong> —— 这不算使用物品，也不占防御物品名额。
                      </p>
                      <div className="row">
                        <button
                          type="button"
                          className="primary"
                          disabled={(state.you.items.whiskey ?? 0) <= 0}
                          title={
                            (state.you.items.whiskey ?? 0) <= 0 ? '你没有威士忌酒瓶' : undefined
                          }
                          onClick={() => void onAction({ type: 'confirmWhiskeyDefense', use: true })}
                        >
                          弃置威士忌酒瓶（+2）
                        </button>
                        <button
                          type="button"
                          onClick={() => void onAction({ type: 'confirmWhiskeyDefense', use: false })}
                        >
                          不用（照常结算）
                        </button>
                      </div>
                    </div>
                  )}
                {/* 鸿运当骰：掷完骰、点选要重掷的骰子（只能重掷 1 次） */}
                {enc.step === 'defend' && state.pendingDice && state.pendingDice.playerId === state.you.id && (
                  <div className="stack">
                    <p className="muted">
                      掷骰结果：
                      <strong>
                        {state.pendingDice.values.join(' + ')} ={' '}
                        {state.pendingDice.values.reduce((a, b) => a + b, 0)}
                      </strong>
                      （杀手攻击力 {state.pendingDice.attack}）
                    </p>
                    <DiceTray
                      values={state.pendingDice.values}
                      seed={`${state.pendingDice.playerId}-${state.pendingDice.attack}`}
                      selectable
                      selected={diceSelect}
                      onToggle={(i) =>
                        setDiceSelect((cur) =>
                          cur.includes(i) ? cur.filter((x) => x !== i) : [...cur, i],
                        )
                      }
                    />
                    <p className="muted">
                      「鸿运当骰」本场可重掷 <strong>1 次</strong>：
                      点骰子选中要重掷的那些（再点一次取消，选中的外轮廓会高亮），
                      没选中的保持不变。<strong>重掷后的结果必须接受。</strong>
                      {state.pendingDice.extra <= 0 && '（本场已经用过了）'}
                    </p>
                    <div className="row">
                      <button
                        type="button"
                        disabled={state.pendingDice.extra <= 0 || diceSelect.length === 0}
                        onClick={() => {
                          void onAction({ type: 'rerollEncounterDice', diceIndexes: diceSelect });
                          setDiceSelect([]);
                        }}
                      >
                        重掷选中的 {diceSelect.length} 颗
                      </button>
                      <button
                        type="button"
                        className="primary"
                        onClick={() => void onAction({ type: 'resolveEncounterDice' })}
                      >
                        接受这个结果
                      </button>
                    </div>
                  </div>
                )}
                {/* 别人在决定重掷时，双方都能看到当前点数 */}
                {enc.step === 'defend' && state.pendingDice && state.pendingDice.playerId !== state.you.id && (
                  <p className="muted">
                    {state.players.find((pl) => pl.id === state.pendingDice?.playerId)?.name ?? '幸存者'} 掷骰：
                    <strong>{state.pendingDice.values.join(' + ')}</strong>
                    （攻击力 {state.pendingDice.attack}）· 正在决定是否用「鸿运当骰」重掷
                  </p>
                )}
                {/**
                 * **（甲）撤离：先选人，再撤离。**
                 *
                 * 用户口径：遭遇结束时先弹出"谁来撤离"的名单，**选中谁谁才走**
                 * （和遭遇里"选下一名遭遇对象"同一种做法）。
                 * 撤离是独立的一套，**不共用**普通移动那套路径草稿/确认。
                 *
                 *  - 还没点人（`fleeTargetId` 为空）→ 显示名单按钮；
                 *  - 点了人 → 只给**那一个人**显示"点地图选 1 格 / 留在原地"。
                 */}
                {enc.step === 'flee' &&
                  isSurvivorView &&
                  !state.pendingEvolutionAck &&
                  !(state.pendingKillerDiscards > 0) && (
                  <>
                    {!enc.fleeTargetId && (enc.fleeReadyIds ?? []).length > 0 && (
                      <div className="stack">
                        <p className="muted">
                          <strong>谁来撤离？</strong>
                          （遭遇地点：{roomDisplayName(state.map, enc.roomId, viewerFaction)}）
                          —— 点一个人，让他先撤离；每人在本场遭遇只移动这一次。
                        </p>
                        <div className="row">
                          {(enc.fleeReadyIds ?? []).map((id) => {
                            const pl = state.players.find((x) => x.id === id);
                            if (!pl) return null;
                            return (
                              <button
                                key={id}
                                type="button"
                                className="primary"
                                onClick={() => void onAction({ type: 'pickFleeSurvivor', targetPlayerId: id })}
                              >
                                让 {pl.name} 撤离
                              </button>
                            );
                          })}
                        </div>
                      </div>
                    )}
                    {enc.fleeTargetId && (
                      <div className="stack">
                        <p className="muted">
                          轮到 <strong>{state.players.find((pl) => pl.id === enc.fleeTargetId)?.name ?? '幸存者'}</strong>
                          ：点地图选相邻 1 格，再点同一格可取消，确认后才移动。杀手看不见这次移动。
                          （本场遭遇每人只移动这一次）
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
                          留在原地
                        </button>
                      </div>
                    )}
                  </>
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
                        : extraPick.kind === 'noteNoise'
                          ? '乔治的笔记：点地图选**任意一个地点**，再点同一格可取消，确认后在那个地点发出响声。'
                          : extraPick.kind === 'traitRoom'
                            ? extraPick.traitId === 'trait_s01'
                              ? '【变体1】速度爆发：点地图选目的地（**2–4 步**，按实际距离算），确认后先在本地发出响声再移动。'
                              : extraPick.traitChoice === 'removeBlockade'
                                ? '【变体1】明智之举：点地图选**有封堵标记**的地点（或门），确认后拆掉那里的一个封堵。'
                                : extraPick.traitChoice === 'noise'
                                  ? '【变体1】明智之举：点地图选一个**相邻地点**，确认后在那个地点发出响声。'
                                  : extraPick.traitId === 'trait_s13'
                                    ? '【变体1】声音诱饵：点地图选**任意一个地点**，确认后在那个地点发出响声。'
                                    : '【变体1】迅速反应：点地图选一个**相邻地点**，确认后移动 1 步。'
                            : `短跑冲刺：一步一步点相邻地点选路线（再点路径上的格子可退回）。当前 ${Math.max(0, sprintDraftRooms.length - 1)}/3 步 —— **必须刚好 3 步**才能确认。`
                    : state.you.mainActionUsed
                    ? '一般行动完成后该小回合已结束。'
                    : activeMoveDest
                      ? `将按「${moveDraftRooms.map((id) => roomDisplayName(state.map, id, viewerFaction)).join(' → ')}」移动（${moveDraftRooms.length - 1} 步）· 未确认，不影响对局`
                      : '一步一步点相邻地点选路线（再点路径上的格子可退回）；选好后确认。'}
                </p>                {extraPick && extraPick.kind === 'sprint' && (
                  <div className="stack">
                    {sprintDraftRooms.length > 1 && (
                      <p className="muted">
                        路线：{sprintDraftRooms.map((id) => roomDisplayName(state.map, id, viewerFaction)).join(' → ')}
                        （{sprintDraftRooms.length - 1}/3 步）
                      </p>
                    )}
                    <div className="row">
                      <button type="button" onClick={() => { setExtraPick(null); setSprintDraftRooms([]); }}>
                        取消
                      </button>
                      {sprintDraftRooms.length > 1 && (
                        <button type="button" onClick={() => setSprintDraftRooms((r) => r.slice(0, -1))}>
                          退回一步
                        </button>
                      )}
                      <button
                        type="button"
                        className="primary"
                        disabled={sprintDraftRooms.length !== 4}
                        onClick={() => {
                          if (!sprintDest) return;
                          void runSurvivor(`短跑冲刺到${roomDisplayName(state.map, sprintDest, viewerFaction)}`, {
                            type: 'useSkill',
                            skillId: 'sprint',
                            toRoomId: sprintDest,
                            path: [...sprintDraftRooms],
                            actorPlayerId: state.you.id,
                          });
                          setExtraPick(null);
                          setSprintDraftRooms([]);
                        }}
                      >
                        确认短跑（{Math.max(0, sprintDraftRooms.length - 1)}/3 步）
                      </button>
                    </div>
                  </div>
                )}
                {extraPick && extraPick.kind !== 'sprint' && (
                  <div className="row">
                    <button type="button" onClick={() => { setExtraPick(null); setExtraDest(null); }}>
                      取消
                    </button>
                    {extraDest && (
                      <button type="button" className="primary" onClick={confirmExtraDest}>
                        确认
                        {extraPick.kind === 'whiskey' ? '扔向' : '移动到'}
                        {roomDisplayName(state.map, extraDest, viewerFaction)}
                      </button>
                    )}
                  </div>
                )}
                {activeMoveDest && (
                  <div className="row">
                    <button type="button" onClick={() => setMoveDraftRooms([])}>
                      取消移动
                    </button>
                    <button type="button" onClick={() => setMoveDraftRooms((r) => r.slice(0, -1))}>
                      退回一步
                    </button>
                    <button type="button" className="primary" onClick={() => void confirmMove()}>
                      确认移动到{roomDisplayName(state.map, activeMoveDest, viewerFaction)}
                    </button>
                  </div>
                )}
                <div className="row">
                  {canSearchHere && (
                    <button
                      type="button"
                      disabled={state.you.mainActionUsed || Boolean(activeMoveDest)}
                      onClick={() => void runSurvivor('搜索物资', { type: 'search' })}
                    >
                      搜索物资
                    </button>
                  )}
                  {canRepairHere && (
                    <button
                      type="button"
                      disabled={state.you.mainActionUsed || Boolean(activeMoveDest)}
                      onClick={() => void runSurvivor('修理', { type: 'repair' })}
                    >
                      修理
                    </button>
                  )}
                  {canClearFear && (
                    <button
                      type="button"
                      disabled={state.you.mainActionUsed || Boolean(activeMoveDest)}
                      onClick={() => {
                        const n = state.you.fear ?? 0;
                        /** 确认放在**行动区**（原来这里是 window.confirm，会遮地图） */
                        setPendingAct({
                          label:
                            n > 0
                              ? `消除恐惧（当前恐惧 ${n}）—— 会占用一般行动并结束小回合`
                              : '消除恐惧（当前恐惧为 0）—— 仍会占用一般行动并结束小回合',
                          run: () => void runSurvivor('消除恐惧', { type: 'clearFear' }, true),
                        });
                      }}
                    >
                      消除恐惧
                    </button>
                  )}
                  {canUnblockHere && (
                    <button
                      type="button"
                      disabled={state.you.mainActionUsed || Boolean(activeMoveDest)}
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
                        disabled={state.you.mainActionUsed || Boolean(activeMoveDest)}
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
                      disabled={state.you.mainActionUsed || Boolean(activeMoveDest) || !state.you.roomId}
                      title={!state.you.roomId ? '不在地图上，无法放置陷阱' : undefined}
                      onClick={() =>
                        void runSurvivor('在此地放置陷阱', { type: 'useItem', itemId: 'trap' })
                      }
                    >
                      放置陷阱
                    </button>
                  )}
                </div>

                {/* —— 乔治专属：聪明绝顶 + 笔记 —— */}
                {(() => {
                  const george = state.you;
                  const isGeo = /survivor6|乔治|george/i.test(
                    `${george.characterId ?? ''} ${
                      state.characters.find((c) => c.id === george.characterId)?.name ?? ''
                    } ${george.name}`,
                  );
                  if (!isGeo) return null;
                  const bookHere = Boolean(youRoom?.tags.includes('special-book'));
                  const brilliantLeft = !state.you.skillUsedThisTurn.includes('brilliant');
                  const canBrilliant =
                    bookHere && !killerHere && brilliantLeft && !state.you.mainActionUsed && !activeMoveDest;
                  const noteIds = Object.keys(state.you.items).filter((id) =>
                    id.startsWith('george_note_'),
                  );
                  return (
                    <div className="stack" style={{ marginTop: '0.4rem' }}>
                      {/**
                       * 「聪明绝顶」的选项**只在书本标记地点才出现** ——
                       * 不在书本地点时这一整块（说明 + 两个按钮）都不显示，
                       * 而不是显示成灰按钮（灰按钮会让玩家以为"现在不能用、待会儿能"）。
                       */}
                      {bookHere && (
                        <>
                          <span className="muted">乔治·聪明绝顶（书本地点 · 同地无杀手 · 每回合 1 次）</span>
                          <div className="row">
                            <button
                              type="button"
                              className="primary"
                              disabled={!canBrilliant}
                              title={
                                killerHere
                                  ? '与杀手同地不能使用'
                                  : !brilliantLeft
                                    ? '本回合已经用过'
                                    : undefined
                              }
                              onClick={() =>
                                void runSurvivor('聪明绝顶：弃工具箱 +1 修理', {
                                  type: 'georgeToolboxRepair',
                                })
                              }
                            >
                              弃工具箱 +1 修理（{state.you.items.toolbox ?? 0}）
                            </button>
                            <button
                              type="button"
                              disabled={!canBrilliant}
                              onClick={() =>
                                void runSurvivor('聪明绝顶：抽一张搜索牌', { type: 'georgeDraw' })
                              }
                            >
                              抽一张搜索牌
                            </button>
                          </div>
                        </>
                      )}
                      {noteIds.length > 0 && (
                        /**
                         * ⚠ **乔治笔记的入口不在这里**（用户要求：
                         * 「额外行动就不要放在额外行动弹窗以外了」）。
                         * 「拆除封堵」「响声」两张都是额外行动，入口收进了
                         * 左上角那颗「额外行动」按钮的弹窗；这里只留一句说明，
                         * 免得玩家以为笔记不见了（防御笔记那种常驻效果不用操作）。
                         */
                        <span className="muted">
                          乔治的笔记：「拆除封堵」「响声」是**额外行动** ——
                          入口在左上角的「额外行动」按钮里；其余笔记是常驻效果，不用操作。
                        </span>
                      )}
                    </div>
                  );
                })()}
              </div>
            )}

            {/**
             * 乔治「拆封堵」笔记：**由玩家选要拆哪几个**（最多 2 个）。
             * 打出笔记后进入这个状态；选完点确认才真的拆、才消耗笔记。
             * 0 个也能确认（等于放弃这张笔记）。
             */}
            {state.pendingGeorgeBlockade && isSurvivorView && (
              <div className="stack">
                <p className="muted">
                  乔治的笔记（拆封堵）：请选要拆的封堵（最多 2 个，再点已选的取消）。
                  已选 {state.pendingGeorgeBlockade.picked.length}/2。
                </p>
                <div className="row">
                  {state.pendingGeorgeBlockade.doors.map((doorId) => {
                    const picked = state.pendingGeorgeBlockade!.picked.includes(doorId);
                    return (
                      <button
                        key={doorId}
                        type="button"
                        className={picked ? 'primary' : ''}
                        onClick={() => void onAction({ type: 'pickNoteBlockade', doorId })}
                      >
                        {picked ? '✓ ' : ''}拆除 {doorEndsLabel(state.map, doorId, viewerFaction)}
                      </button>
                    );
                  })}
                </div>
                <div className="row">
                  <button
                    type="button"
                    className="primary"
                    onClick={() => void onAction({ type: 'confirmNoteBlockade' })}
                  >
                    确认拆除 {state.pendingGeorgeBlockade.picked.length} 块
                  </button>
                </div>
              </div>
            )}

            {/**
             * ⚠ 这里原来有「杀手打牌后拿到的信息 + 知道了（继续）」那块确认面板。
             * 用户要求**删掉这套确认流程** —— 信息现在只画在**地图右边的信息区**
             * （见 `map-side` 那块），不挡任何操作。
             */}

            {/**
             * **【快进】按钮（只有单人热座）** —— 用户为了快速测后期的各种效果要的。
             *
             *  - 幸存者侧：还没做一般行动的幸存者**全部「消除恐惧」** → 进发现阶段 →
             *    直接发给第一个幸存者、**选第一张**发现物 → 响声报告；
             *  - 杀手侧：**不打出任何卡牌** → 一般行动阶段**原地搜索两次** →
             *    结束回合（自动摸牌收尾，落到下一轮幸存者大回合开始）。
             */}
            {state.mode === 'solo' &&
              ((isSurvivorView && state.phase === 'survivorMain') ||
                (!isSurvivorView && state.phase === 'killerMain')) && (
                <div className="row fast-forward-bar">
                  <button
                    type="button"
                    className="ghost-btn"
                    onClick={() => void onAction({ type: 'fastForward' })}
                  >
                    ⏩ 快进
                  </button>
                  <span className="muted">
                    {isSurvivorView
                      ? '没做一般行动的幸存者全部消除恐惧 → 发现阶段发给第一个幸存者、直接选第一张'
                      : state.killerTurnStep === 'slow'
                        /**
                         * ⚠ **慢速阶段快进 ≠ 搜索**（用户口径）：
                         * 这里只跳过出牌、直接结束回合，不会替他搜索（也就不会冒出遭遇）。
                         */
                        ? '跳过慢速阶段的出牌 → 直接结束回合（进下一轮幸存者大回合）'
                        : '不打出卡牌 → 原地搜索 2 次 → 结束回合（进下一轮幸存者大回合）'}
                  </span>
                </div>
              )}

            {/**
             * **一般行动的确认栏**（用户要求：确认放在行动区）。
             *
             * 以前用 `window.confirm`，会遮住棋盘并冻住主线程，
             * 导致移动/摸牌动画看不见。现在是一条行动区里的普通面板：
             * 不挡地图、不冻界面，动作要先点「确定」才发出去。
             */}
            {pendingAct && (
              <div className="panel stack pending-act-bar">
                <strong>确定要{pendingAct.label}？</strong>
                <div className="row">
                  <button
                    type="button"
                    className="primary"
                    onClick={() => {
                      const act = pendingAct;
                      setPendingAct(null);
                      act.run();
                    }}
                  >
                    确定
                  </button>
                  <button type="button" onClick={() => setPendingAct(null)}>
                    取消
                  </button>
                </div>
              </div>
            )}

            {isActive && state.you.faction === 'killer' && state.pendingKillerDiscards > 0 && (
              <div className="stack">
                <p className="muted">
                  手牌超过上限，请弃置 {state.pendingKillerDiscards} 张。
                  {(state.justUnlockedCards ?? []).length > 0 && '（刚由进化入手的牌本次不能弃）'}
                </p>
                <div className="row">
                  {(state.yourKillerHand ?? [])
                    .filter((cid) => !(state.justUnlockedCards ?? []).includes(cid))
                    .map((cid, idx) => {
                      /** ⚠ 要选牌的地方都要有卡面（用户要求：别只写卡名） */
                      const card = state.cardById[cid];
                      const art = cardArtSrc(card, cid);
                      return (
                        <button
                          key={`${cid}-d-${idx}`}
                          type="button"
                          className="card"
                          onClick={() => onAction({ type: 'discardKillerCard', cardId: cid })}
                        >
                          {art && <img className="inline-card-art" src={encodeURI(art)} alt="" />}
                          <h4>弃置 {card?.name ?? cid}</h4>
                        </button>
                      );
                    })}
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
            {/**
             * **路径草稿的确认面板**。
             *
             * 两种归属：
             *  - `owner === 'survivor'`：凯莱布「幸运币」的〔移動〕×0-2 —— **幸存者界面**，
             *    由本人确认（这条以前完全没有入口，所以幸运币的移动效果用不了）。
             *  - 其余：杀手牌在走（追逐 / 呼啸而过 / 巡邏 / 汽化…）—— 杀手界面。
             */}
            {state.pendingPathDraft?.owner === 'survivor' && isSurvivorView && coinPathDraft && (
              <div className="stack">
                <p className="muted">
                  幸运币〔移動〕×0-{state.pendingPathDraft.max}：
                  {state.pendingPathDraft.rooms
                    .map((id) => roomDisplayName(state.map, id, viewerFaction))
                    .join(' → ')}
                  （{Math.max(0, state.pendingPathDraft.rooms.length - 1)}/{state.pendingPathDraft.max} 步）
                  · 点相邻地点追加，点末端取消那一步
                </p>
                <div className="row">
                  <button
                    type="button"
                    onClick={() => void onAction({ type: 'finishPendingMove' })}
                  >
                    留在原地（不走）
                  </button>
                  <button
                    type="button"
                    className="primary"
                    disabled={
                      Math.max(0, state.pendingPathDraft.rooms.length - 1) <
                        state.pendingPathDraft.min ||
                      Math.max(0, state.pendingPathDraft.rooms.length - 1) >
                        state.pendingPathDraft.max
                    }
                    onClick={() => void onAction({ type: 'finishPendingMove' })}
                  >
                    确认移动并结算
                  </button>
                </div>
              </div>
            )}
            {isActive &&
              state.phase === 'killerMain' &&
              state.you.faction === 'killer' &&
              state.pendingPathDraft &&
              state.pendingPathDraft.owner !== 'survivor' && (
              <div className="stack">
                <p className="muted">
                  移动路径：
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
                <p className="muted">潜藏威胁：请选择任意 1 名幸存者施加惊吓。</p>
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

            {/**
             * ⚠ **"回合结束时"的效果都在回合结束之前做**（用户口径）：
             * 杀手还在自己回合里（`killerMain`）就把门点完，处理完才切给幸存者。
             * 所以这条提示的主场景就是 `killerMain`。
             *
             * 顺手把 `upkeep` 也认上：收尾流程里 `phase` 有可能已经被推进过
             * （例如同时欠着超额弃牌 / 4 级封堵作业），那时提示不该凭空消失 ——
             * 服务端 `legalMoves` 那一支早就连 `upkeep` 一起认了，这里跟它一致。
             */}
            {isActive &&
              (state.phase === 'killerMain' || state.phase === 'upkeep') &&
              state.you.faction === 'killer' &&
              state.pendingBlockade && (
              <div className="stack">
                <p className="muted">
                  {state.pendingBlockadeRoom
                    ? <>请点击与「<strong>{roomDisplayName(state.map, state.pendingBlockadeRoom, viewerFaction)}</strong>」相连的一扇<strong>白门</strong>放置封堵。</>
                    : <>请点击与你相邻的一扇<strong>白门</strong>（另一侧房间）放置封堵。</>}
                  {(state.pendingBlockadeRemaining ?? 0) > 0 && <>本次还要再封 {state.pendingBlockadeRemaining} 扇。</>}
                  再点同一格可取消。户外小径和杀手通道不能封。
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
                  {/**
                   * 只点了第一格时也要有反馈（地图上那一格已经画了实心金圈，
                   * 这里把名字也写出来，和"点了没反应"区分开）。
                   */}
                  {state.pendingBlockadeJob.firstRoomId && (
                    <p className="muted">
                      已选「
                      <strong>
                        {roomDisplayName(state.map, state.pendingBlockadeJob.firstRoomId, viewerFaction)}
                      </strong>
                      」，请再点一个与它以门相连的地点。
                    </p>
                  )}
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

            {/**
             * 【變形 / 戰鬥適應】从**弃牌堆**里自己挑要永久移除的牌。
             * （以前是自动从堆顶拿，玩家没得选。）
             */}
            {isActive && state.pendingDiscardRemove && (
              <div className="stack">
                <p className="muted">
                  <strong>{state.pendingDiscardRemove.cardName}</strong>：请从**弃牌堆**里选{' '}
                  <strong>{state.pendingDiscardRemove.remaining}</strong> 张永久移除
                  —— 点牌面选中，再按「确认移除」。（移除的牌本局不会再洗回来）
                </p>
                <div className="row">
                  {state.pendingDiscardRemove.options.map((c) => {
                    const art = cardArtSrc(state.cardById[c.id], c.id);
                    /**
                     * ⚠ 同一张卡在牌组里有多份（爬行×3）→ **按 `uid` 认"哪一份"**，
                     * 不然点一份会两份一起高亮、React 也会报重复 key。
                     */
                    const uid = c.uid ?? c.id;
                    const picked = discardRemovePick === uid;
                    return (
                      <button
                        key={uid}
                        type="button"
                        className={picked ? 'card picked' : 'card'}
                        style={picked ? { outline: '2px solid var(--accent, #d98b3a)' } : undefined}
                        onClick={() => setDiscardRemovePick(picked ? null : uid)}
                      >
                        {art && (
                          <img
                            className="inline-card-art"
                            src={encodeURI(art)}
                            alt=""
                          />
                        )}
                        <h4>{c.name}</h4>
                        <span className="muted">{picked ? '已选中' : '点击选中'}</span>
                      </button>
                    );
                  })}
                </div>
                <div className="row">
                  <button
                    type="button"
                    className="primary"
                    disabled={!discardRemovePick}
                    onClick={() => {
                      if (!discardRemovePick) return;
                      /** `discardRemovePick` 存的是 uid，发回服务端的是那张**卡**的 id */
                      const pickedCard = state.pendingDiscardRemove?.options.find(
                        (c) => (c.uid ?? c.id) === discardRemovePick,
                      );
                      if (!pickedCard) return;
                      void onAction({ type: 'pickDiscardRemove', cardId: pickedCard.id });
                      setDiscardRemovePick(null);
                    }}
                  >
                    确认移除{discardRemovePick ? `「${state.pendingDiscardRemove?.options.find((c) => (c.uid ?? c.id) === discardRemovePick)?.name ?? ''}」` : ''}
                  </button>
                  {discardRemovePick && (
                    <button type="button" onClick={() => setDiscardRemovePick(null)}>
                      取消选择
                    </button>
                  )}
                </div>
              </div>
            )}

            {/**
             * 【雕像・召唤石碑】选门提示：点了牌之后必须点地图选一扇门才结算。
             * （以前这里什么都不显示、服务端也没人消费这个状态 → 点了牌就"结束了"。）
             */}
            {isActive && state.pendingStatueSeal && (
              <div className="stack">
                <p className="muted">
                  召唤石碑：请点地图选一扇门来封堵 ——{' '}
                  {state.pendingStatueSealFrom
                    ? `已选「${roomDisplayName(state.map, state.pendingStatueSealFrom, viewerFaction)}」，请再点一个与它以门相连的地点（点同一格取消）。`
                    : '先点一个地点，再点与它相邻的地点。'}
                  封上后这两个地点的幸存者都会被惊吓。
                </p>
              </div>
            )}

            {/**
             * **【巡邏 / 圍困】选下一尊雕像**（用户要求：顺序由杀手自己选，
             * 移动段和搜索段各选各的）。
             *
             * ⚠ 选项里只会有**能动的、还没选过的** —— 被停滞的、已经行动过的
             * 服务端直接不给（不是显示出来再禁用）。
             * `active` 非空 = 那一尊正在走路径，这时不显示选项。
             */}
            {isActive &&
              !isSurvivorView &&
              state.pendingStatuePick &&
              !state.pendingStatuePick.active && (
                <div className="stack">
                  <p className="muted">
                    {state.pendingStatuePick.kind === 'move' ? '雕像移动' : '雕像搜索'}：
                    请选**下一尊**要{state.pendingStatuePick.kind === 'move' ? '移动' : '搜索'}的雕像
                    （被停滞的、已经行动过的不在下面）。
                  </p>
                  <div className="row">
                    {state.pendingStatuePick.options.map((o) => (
                      <button
                        key={o.id}
                        type="button"
                        className="primary"
                        onClick={() => void onAction({ type: 'pickStatueStep', statueId: o.id })}
                      >
                        雕像 {o.index}（{roomDisplayName(state.map, o.roomId, viewerFaction)}）
                      </button>
                    ))}
                  </div>
                </div>
              )}

            {/**
             * **幸存者侧的待选面板（第六感 / 坚毅）**。
             *
             * ⚠ 这两块以前写在「杀手回合」的区块里（`phase === 'killerMain' && 你是杀手`），
             * 而搜索（第六感）和受伤（坚毅）都发生在**幸存者回合** ——
             * 于是面板永远不显示、服务端又在等玩家选，整局卡死。
             * 现在放在通用待选区：任何阶段、任何阵营都可能出现。
             */}
            {/**
             * 欧菲莉亚「第六感」：摸 2 张，选 1 张留下，
             * 另 1 张放回搜索牌库顶（返回的那张不会触发警报）。
             */}
            {isSurvivorView && state.pendingSixthSense && (
              <div className="effect-choice">
                <p className="muted">
                  第六感：请选 1 张留下，另一张放回搜索牌库顶（返回的卡牌不会触发警报）。
                </p>
                <div className="row">
                  {state.pendingSixthSense.cards.map((c) => {
                    /** ⚠ 要选牌的地方都要有卡面（用户要求：别只写卡名） */
                    const art = cardArtSrc(state.cardById[c.id], c.id);
                    return (
                      <button
                        key={c.id}
                        type="button"
                        className="card"
                        onClick={() => void onAction({ type: 'resolveSixthSense', cardId: c.id })}
                      >
                        {art && <img className="inline-card-art" src={encodeURI(art)} alt="" />}
                        <h4>留下「{c.name}」</h4>
                      </button>
                    );
                  })}
                </div>
              </div>
            )}
            {/**
             * 迪伦·温「坚毅」：用坚毅标记挡掉这次伤害（或不用）。
             */}
            {isSurvivorView &&
              state.pendingResilience &&
              state.pendingResilience.playerId === state.you.id && (
                <div className="effect-choice">
                  <p className="muted">
                    你受到 {state.pendingResilience.amount} 点伤害。
                    要移除<strong>坚毅标记</strong>来防止这次伤害吗？（整局只有一次）
                  </p>
                  <div className="row">
                    <button
                      type="button"
                      className="primary"
                      onClick={() => void onAction({ type: 'confirmResilience', use: true })}
                    >
                      用坚毅标记免伤
                    </button>
                    <button
                      type="button"
                      onClick={() => void onAction({ type: 'confirmResilience', use: false })}
                    >
                      照常受伤
                    </button>
                  </div>
                </div>
              )}

            {/**
             * **十字弩的选僵尸面板（已从杀手区块搬出）**。
             *
             * ⚠ 它以前写在「杀手回合」的区块里（`phase === 'killerMain' && 你是杀手`），
             * 而十字弩是**幸存者**的特殊行动 —— 于是幸存者永远看不到选僵尸的列表，
             * 点了「用十字弩」之后就像"什么都没发生"。
             */}
            {/**
             * 十字弩：幸存者点选要消灭的僵尸（至多 2 个）。
             */}
            {isSurvivorView && state.pendingCrossbow && (
              <div className="effect-choice">
                <p className="muted">
                  十字弩：请点选最多 {state.pendingCrossbow.max} 个要消灭的僵尸
                  （已选 {crossbowPicked.length} 个）。
                </p>
                <div className="row">
                  {state.pendingCrossbow.zombieIds.map((zid) => {
                    const z = (state.zombies ?? []).find((x) => x.id === zid);
                    const on = crossbowPicked.includes(zid);
                    return (
                      <button
                        key={zid}
                        type="button"
                        className={on ? 'primary' : ''}
                        onClick={() => toggleCrossbowPick(zid)}
                      >
                        {on ? '✓ ' : ''}僵尸 @ {z ? roomDisplayName(state.map, z.roomId, viewerFaction) : '?'}
                      </button>
                    );
                  })}
                </div>
                <button
                  type="button"
                  className="primary"
                  disabled={crossbowPicked.length > state.pendingCrossbow.max}
                  onClick={() => void onAction({ type: 'confirmCrossbow', zombieIds: crossbowPicked })}
                >
                  确认消灭 {crossbowPicked.length} 个
                </button>
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
                {/**
                 * ⚠ **进化时可能同时要求做别的选择**（解锁二选一 / 选进化卡牌 /
                 * 雕像转主雕像），这些面板以前放在下面的"杀手行动区"里、
                 * 而那块被 `!pendingEvolutionAck` 挡着 ——
                 * 结果就是**面板显示不出来、确认按钮又被服务端拒绝，整局卡死**。
                 * 现在它们和确认按钮在同一个面板里。
                 */}
                {state.pendingUnlockChoice && (
                  <div className="effect-choice">
                    <p className="muted">进化：请选一张锁定牌解锁入手（另一张不再解锁）。</p>
                    <div className="row">
                      {state.pendingUnlockChoice.map((c) => {
                        /** ⚠ 要选牌的地方都要有卡面（锁定牌也是真卡，`cardArtSrc` 认得） */
                        const art = cardArtSrc(state.cardById[c.id], c.id);
                        return (
                          <button
                            key={c.id}
                            type="button"
                            className="card"
                            title={c.text}
                            onClick={() => void onAction({ type: 'pickUnlockChoice', cardId: c.id })}
                          >
                            {art && <img className="inline-card-art" src={encodeURI(art)} alt="" />}
                            <h4>{c.name}</h4>
                            <div className="muted">{c.text}</div>
                          </button>
                        );
                      })}
                    </div>
                  </div>
                )}
                {state.pendingEvolutionCardPick && (
                  <div className="effect-choice">
                    <p className="muted">未命名进化：请选一张进化卡牌（永久生效）。</p>
                    <div className="row">
                      {state.pendingEvolutionCardPick.map((c) => {
                        /** ⚠ 进化卡牌的卡面（`Image/Killers/<文件夹>/进化卡牌_XXX.png`） */
                        const art = evolutionCardArt(state, c.id);
                        return (
                          <button
                            key={c.id}
                            type="button"
                            className="card"
                            title={c.text}
                            onClick={() => void onAction({ type: 'pickEvolutionCard', cardId: c.id })}
                          >
                            {art && <img className="inline-card-art" src={encodeURI(art)} alt="" />}
                            <h4>{c.name}</h4>
                            <div className="muted">{c.text}</div>
                          </button>
                        );
                      })}
                    </div>
                  </div>
                )}
                {(state.pendingStatueEvoSwitch || state.pendingStatueEvoTarget) && (
                  <div className="effect-choice">
                    <p className="muted">
                      雕像进化：你可以转换主雕像（也可以不切）。**选一尊**，再点下面的「确认新效果」。
                    </p>
                    <div className="row">
                      {(state.statues ?? []).map((st) => {
                        /** 已经点过但还没确认的那一尊（选择要确认，点了不立刻生效） */
                        const picked = state.pendingStatueEvoTarget === st.id;
                        return (
                          <button
                            key={st.id}
                            type="button"
                            className={`statue-pick${st.main ? ' main' : ''}${picked ? ' picked' : ''}`}
                            /**
                             * ⚠ 这里**只记下选择**，不立刻切换 ——
                             * 用户要求"选择要确认"，切换在「确认新效果」时一并执行。
                             */
                            onClick={() => void onAction({ type: 'pickStatueEvoSwitch', statueId: st.id })}
                          >
                            <span className="statue-pick-idx">雕像 {st.index}</span>
                            <span className="statue-pick-room">
                              {roomDisplayName(state.map, st.roomId, viewerFaction)}
                            </span>
                            {st.main && <span className="statue-pick-tag">主雕像</span>}
                          </button>
                        );
                      })}
                      <button type="button" onClick={() => void onAction({ type: 'skipStatueEvoSwitch' })}>
                        不转换
                      </button>
                    </div>
                  </div>
                )}
                {(() => {
                  /**
                   * ⚠ **顺序变了**（用户口径：确认 → 坍塌 → 变体1特性 → 执行进化效果）：
                   * 那些"要你选的东西"（选卡 / 解锁二选一 / 转主雕像）现在**排在确认之后**。
                   *
                   * 所以第一次点「确认新效果」时**不能被它们挡住**（那时它们还没挂出来）；
                   * 确认之后它们才会出现，那时再挡住后续的确认。
                   */
                  const pendingPick = Boolean(
                    state.pendingUnlockChoice ||
                      state.pendingEvolutionCardPick ||
                      state.pendingStatueEvoSwitch ||
                      state.pendingStatueEvoTarget,
                  );
                  return (
                    <>
                      {pendingPick && (
                        <p className="muted">请先在上面选好，进化才会继续结算。</p>
                      )}
                      <button
                        type="button"
                        className="primary"
                        disabled={pendingPick}
                        onClick={() => onAction({ type: 'ackEvolution' })}
                      >
                        确认新效果
                      </button>
                    </>
                  );
                })()}
              </div>
            )}

            {isActive && state.you.faction === 'killer' && state.pendingWhizSearch && (
              <div className="stack">
                <p className="muted">呼啸而过之后：可以弃 2 张手牌搜索房间当前格（不占行动）。点选手牌，再确认。</p>
                <div className="row">
                  {/**
                   * ⚠ **要显示卡面**（用户报过："幽魂的 2 级、3 级在弃牌时没有显示牌的图片"）。
                   * 用和"选牌弃置"其它地方同一套写法：`card` 按钮 + `inline-card-art`。
                   */}
                  {killerHand.map((cid, idx) => {
                    const card = state.cardById[cid];
                    const art = cardArtSrc(card, cid);
                    const picked = evoPayIds.includes(cid);
                    return (
                      <button
                        key={`${cid}-whiz-${idx}`}
                        type="button"
                        className={picked ? 'card picked' : 'card'}
                        style={picked ? { outline: '2px solid var(--accent, #d98b3a)' } : undefined}
                        onClick={() =>
                          setEvoPayIds((cur) =>
                            cur.includes(cid) ? cur.filter((x) => x !== cid) : cur.length < 2 ? [...cur, cid] : cur,
                          )
                        }
                      >
                        {art && <img className="inline-card-art" src={encodeURI(art)} alt="" />}
                        <h4>{card?.name ?? cid}</h4>
                        <span className="muted">{picked ? '已选中' : '点击选中'}</span>
                      </button>
                    );
                  })}
                </div>
                <div className="row">
                  <button
                    type="button"
                    className="primary"
                    disabled={evoPayIds.length !== 2}
                    onClick={() => onAction({ type: 'confirmWhizSearch', payCardIds: evoPayIds })}
                  >
                    弃 2 张并搜索房间
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
                  {state.players.find((pl) => pl.id === state.pendingOverFearWound?.targetId)?.name ?? '幸存者'}{' '}
                  惊恐过度。可以弃 3 张手牌造成 1 点伤害（非遭遇时对方可用护符）。
                </p>
                <div className="row">
                  {/** 同上：3 级这条弃牌也要显示卡面 */}
                  {killerHand.map((cid, idx) => {
                    const card = state.cardById[cid];
                    const art = cardArtSrc(card, cid);
                    const picked = evoPayIds.includes(cid);
                    return (
                      <button
                        key={`${cid}-wound-${idx}`}
                        type="button"
                        className={picked ? 'card picked' : 'card'}
                        style={picked ? { outline: '2px solid var(--accent, #d98b3a)' } : undefined}
                        onClick={() =>
                          setEvoPayIds((cur) =>
                            cur.includes(cid) ? cur.filter((x) => x !== cid) : cur.length < 3 ? [...cur, cid] : cur,
                          )
                        }
                      >
                        {art && <img className="inline-card-art" src={encodeURI(art)} alt="" />}
                        <h4>{card?.name ?? cid}</h4>
                        <span className="muted">{picked ? '已选中' : '点击选中'}</span>
                      </button>
                    );
                  })}
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
                    {killerStep === 'fast' &&
                      '快速卡牌阶段：可打任意张快速牌。此时点地图没有用 —— 先点「结束快速阶段」，再选「执行 2 个普通行动」，之后才能点地图移动。'}
                    {killerStep === 'main' &&
                      !killerChoice &&
                      '二选一：执行 2 个普通行动（移动 1 / 搜索房间），或打出 1 张特殊行动牌（箭头）。选「普通行动」之后才能点地图移动。'}
                    {killerStep === 'main' &&
                      killerChoice === 'actions' &&
                      `普通行动剩余 ${state.killerMainActionsLeft}：**现在可以点地图移动**，或搜索房间。`}
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
                    <button
                      type="button"
                      className="primary"
                      onClick={() => onAction({ type: 'chooseKillerMain', choice: 'actions' })}
                    >
                      选择 2 次移动/搜索房间
                    </button>
                  )}
                  {killerStep === 'main' && killerChoice === 'actions' && (
                    <>
                      <button
                        type="button"
                        disabled={state.killerMainActionsLeft <= 0 || Boolean(pendingCard)}
                        onClick={() => onAction({ type: 'search' })}
                      >
                        搜索房间
                      </button>
                      {/* 第三阶段必须行动：不再提供「进入慢速阶段」。
                          2 次普通行动用完、或打出特殊牌后，会自动进入慢速阶段。 */}
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
                {/**
                 * 「或」牌（如狼人领地意识）：打出后停下来让杀手二选一。
                 */}
                {state.pendingEffectChoice && (
                  <div className="effect-choice">
                    <p className="muted">这张牌有两种用法，请选一种：</p>
                    <div className="row">
                      {state.pendingEffectChoice.options.map((group, i) => (
                        <button
                          key={i}
                          type="button"
                          className="primary"
                          onClick={() => void onAction({ type: 'chooseEffectOption', optionIndex: i })}
                        >
                          {describeEffectGroup(group, state.passageStealthAnywhere === true)}
                        </button>
                      ))}
                    </div>
                  </div>
                )}
                {/**
                 * 可选效果（牌面写了「可以」的）：让杀手选执行 / 跳过。
                 * 没写「可以」的效果不会出现在这里（引擎直接执行）。
                 */}
                {state.pendingOptionalEffect && (
                  <div className="effect-choice">
                    {/**
                     * ⚠ 这一问是**针对某一张牌**的（比如刺耳噪声的"放回牌库顶"），
                     * 所以把那张牌的卡面一起画出来 —— 用户要求"要选牌的地方都要有卡面"，
                     * 这里至少要让玩家看清问的是哪张牌。
                     */}
                    {state.pendingDeckTopCard && (() => {
                      const cid = state.pendingDeckTopCard!.id;
                      const art = cardArtSrc(state.cardById[cid], cid);
                      if (!art) return null;
                      return (
                        <img
                          className="inline-card-art"
                          src={encodeURI(art)}
                          alt={state.pendingDeckTopCard!.name}
                        />
                      );
                    })()}
                    <p className="muted">
                      {state.pendingDeckTopCard
                        ? `「${state.pendingDeckTopCard.name}」：`
                        : ''}
                      {state.pendingOptionalEffect.label}：可以执行，也可以跳过。
                    </p>
                    <div className="row">
                      <button
                        type="button"
                        className="primary"
                        onClick={() => void onAction({ type: 'resolveOptionalEffect', use: true })}
                      >
                        执行
                      </button>
                      <button
                        type="button"
                        onClick={() => void onAction({ type: 'resolveOptionalEffect', use: false })}
                      >
                        跳过
                      </button>
                    </div>
                  </div>
                )}
                {/**
                 * 扼杀者等级 4：点 2 个不同地点各放 1 个核心标记。
                 */}
                {!isSurvivorView && state.pendingStranglerCoreRooms != null && (
                  <div className="effect-choice">
                    <p className="muted">
                      扼杀者进化 4 级：请在任意 2 个<strong>不同</strong>地点各放置一个核心标记
                      （已选 {state.pendingStranglerCoreRooms.length}/2）。
                    </p>
                  </div>
                )}
                {/**
                 * 【恐詭管道】落点：**点地图只是选中，按这里才真的潜行过去**
                 * （用户口径：选择了地点后要确认）。
                 */}
                {!isSurvivorView && (state.pendingPassagePick?.length ?? 0) > 0 && (
                  <div className="effect-choice">
                    <p className="muted">
                      {state.passageStealthAnywhere
                        ? '【保護色】恐詭管道：可以潛行到**任何地点**。'
                        : '恐詭管道：请点一个有秘密通道的地点。'}
                      {state.pendingPassageRoom
                        ? `已选「${roomDisplayName(state.map, state.pendingPassageRoom, viewerFaction)}」，`
                        : '还没选地点，'}
                      点地图选中（再点同一格取消），按「确认潜入」才移动。
                    </p>
                    <div className="row">
                      <button
                        type="button"
                        className="primary"
                        disabled={!state.pendingPassageRoom}
                        onClick={() => void onAction({ type: 'confirmPassagePick' })}
                      >
                        确认潜入
                        {state.pendingPassageRoom
                          ? `到${roomDisplayName(state.map, state.pendingPassageRoom, viewerFaction)}`
                          : ''}
                      </button>
                    </div>
                  </div>
                )}
                {/**
                 * 女王等级 4：点 2 个不同地点各生成 1 个僵尸。
                 */}
                {!isSurvivorView && (state.pendingQueenSpawnRooms?.length ?? 0) > 0 && (
                  <div className="effect-choice">
                    <p className="muted">
                      女王进化 4 级：请在任意 2 个<strong>不同</strong>地点各生成一个丧尸
                      （已选 {state.pendingQueenSpawnRooms!.length}/2）。
                    </p>
                  </div>
                )}
                {/**
                 * 女王（killer9）：移动时选「带几个僵尸一起走」。
                 */}
                {!isSurvivorView && state.pendingQueenMove && (
                  <div className="effect-choice">
                    <p className="muted">
                      女王移动前所在位置有 {state.pendingQueenMove.zombieCount} 个僵尸：
                      选择带几个一起移到「
                      {roomDisplayName(state.map, state.pendingQueenMove.toRoomId, viewerFaction)}」。
                    </p>
                    <div className="row">
                      {Array.from({ length: state.pendingQueenMove.zombieCount + 1 }, (_, n) => (
                        <button
                          key={n}
                          type="button"
                          className={n > 0 ? 'primary' : ''}
                          onClick={() => void onAction({ type: 'confirmQueenMove', count: n })}
                        >
                          带 {n} 个
                        </button>
                      ))}
                      <button
                        type="button"
                        onClick={() => void onAction({ type: 'confirmQueenMove', cancel: true })}
                      >
                        取消同行
                      </button>
                    </div>
                  </div>
                )}
                {/**
                 * 女王：抓住他們！—— 选一个僵尸去搜索。
                 */}
                {!isSurvivorView && state.pendingZombieSearch && (
                  <div className="effect-choice">
                    <p className="muted">抓住他們！：请选一个僵尸让他〔搜索〕。</p>
                    <div className="row">
                      {state.pendingZombieSearch.map((zid) => {
                        const z = (state.zombies ?? []).find((x) => x.id === zid);
                        return (
                          <button
                            key={zid}
                            type="button"
                            className="primary"
                            onClick={() => void onAction({ type: 'pickZombieSearch', zombieId: zid })}
                          >
                            僵尸 @ {z ? roomDisplayName(state.map, z.roomId, viewerFaction) : '?'}
                          </button>
                        );
                      })}
                    </div>
                  </div>
                )}
                {/**
                 * 女王：屍群來了 —— 选出发地点，再选目的地。
                 */}
                {!isSurvivorView && (state.pendingZombieHordeFrom || state.pendingZombieHordeTo) && (
                  <div className="effect-choice">
                    <p className="muted">
                      {state.pendingZombieHordeFrom
                        ? '屍群來了：请点一个有僵尸的地点作为出发地。'
                        : `屍群來了：出发地「${state.pendingZombieHordeTo ? roomDisplayName(state.map, state.pendingZombieHordeTo, viewerFaction) : ''}」，请点一个目的地。`}
                    </p>
                    {state.pendingZombieHordeFrom && (
                      <div className="row">
                        {state.pendingZombieHordeFrom.map((rid) => (
                          <button
                            key={rid}
                            type="button"
                            className="primary"
                            onClick={() => void onAction({ type: 'pickZombieHorde', roomId: rid })}
                          >
                            {roomDisplayName(state.map, rid, viewerFaction)}
                          </button>
                        ))}
                      </div>
                    )}
                  </div>
                )}
                {/**
                 * 女王：屍體爆炸 —— 选一个要献祭的僵尸。
                 */}
                {!isSurvivorView && state.pendingZombieSacrifice && (
                  <div className="effect-choice">
                    <p className="muted">屍體爆炸：请选一个要献祭的僵尸（距离 1 内所有幸存者〔中毒〕）。</p>
                    <div className="row">
                      {state.pendingZombieSacrifice.map((zid) => {
                        const z = (state.zombies ?? []).find((x) => x.id === zid);
                        return (
                          <button
                            key={zid}
                            type="button"
                            className="primary"
                            onClick={() => void onAction({ type: 'pickZombieSacrifice', zombieId: zid })}
                          >
                            僵尸 @ {z ? roomDisplayName(state.map, z.roomId, viewerFaction) : '?'}
                          </button>
                        );
                      })}
                    </div>
                  </div>
                )}
                {/**
                 * 扼杀者：核心标记的落点提示（点地图上的地点完成）。
                 *
                 * 注意 'pendingTeleportPick' 是**数组**，服务端没待选时给的是 '[]' ——
                 * 而空数组是 truthy，直接写 '|| state.pendingTeleportPick' 会让
                 * 这个面板在**每一局**的杀手视角下都渲染（内容为空，只漏出提示文字）。
                 * 所以必须显式判长度。
                 */}
                {!isSurvivorView &&
                  (state.pendingCorePick || (state.pendingTeleportPick?.length ?? 0) > 0) && (
                  <div className="effect-choice">
                    <p className="muted">
                      {state.pendingCorePick === 'place' && '请点一个地点放置核心标记。'}
                      {state.pendingCorePick === 'remove' &&
                        `核心标记已达 5 个上限：请点一个要移除的核心标记（移除后会放到「${state.pendingCoreOverflowPlaceAt
                          ? roomDisplayName(state.map, state.pendingCoreOverflowPlaceAt, viewerFaction)
                          : '?'}」）。`}
                      {state.pendingCorePick === 'placeBlockade' &&
                        `请点一个带核心标记的地点封堵×1：${(state.pendingCoreRooms ?? [])
                          .map((id) => roomDisplayName(state.map, id, viewerFaction))
                          .join('、')}`}
                      {state.pendingCorePick === 'moveFrom' && '请点一个要移走核心标记的地点。'}
                      {state.pendingCorePick === 'moveTo' &&
                        `请点一个相邻地点放下核心标记：${(state.pendingCoreNeighbors ?? [])
                          .map((id) => roomDisplayName(state.map, id, viewerFaction))
                          .join('、')}`}
                      {(state.pendingTeleportPick?.length ?? 0) > 0 &&
                        `傳送聚合：请点一个带核心标记或封堵标记的地点：${state.pendingTeleportPick!
                          .map((id) => roomDisplayName(state.map, id, viewerFaction))
                          .join('、')}`}
                    </p>
                  </div>
                )}
                {/**
                 * 君臨天下：目击后选一名目击者来移动（0–2 步，路径随后由杀手点）。
                 */}
                {!isSurvivorView && (state.pendingMoveSurvivorPick?.length ?? 0) > 0 && (
                  <div className="effect-choice">
                    <p className="muted">
                      君臨天下：你目击了
                      {state.pendingMoveSurvivorPick!
                        .map((id) => state.players.find((x) => x.id === id)?.name ?? id)
                        .join('、')}
                      ，请选其中 1 名移动 0–2 步。
                    </p>
                    <div className="row">
                      {state.pendingMoveSurvivorPick!.map((id) => {
                        const v = state.players.find((x) => x.id === id);
                        return (
                          <button
                            key={`mv-${id}`}
                            type="button"
                            onClick={() => void onAction({ type: 'pickMoveSurvivor', targetPlayerId: id })}
                          >
                            {v?.name ?? id}
                            {v?.roomId ? `（${roomDisplayName(state.map, v.roomId, viewerFaction)}）` : ''}
                          </button>
                        );
                      })}
                    </div>
                  </div>
                )}
                {/**
                 * 未命名「酸液喷吐」：等杀手点一个相邻地点。
                 */}
                {!isSurvivorView && state.pendingAcidPick && (
                  <div className="effect-choice">
                    <p className="muted">
                      酸液喷吐：请点一个**相邻地点**（会伤害你所在地点和该地点的所有幸存者，
                      并封堵两点之间的门；两点之间没有门时跳过封堵）。
                    </p>
                  </div>
                )}
                {/**
                 * 解锁二选一 / 选进化卡牌 / 雕像转主雕像：
                 * **已挪到上面的「进化确认」面板里** ——
                 * 它们和进化确认是同时出现的，留在这里会被 `!pendingEvolutionAck`
                 * 挡掉、导致选不了而卡死。
                 */}
                {/**
                 * 【超听觉】有多条并列最快路径时，让杀手在行动区选一条。
                 */}
                {state.pendingMoveChoices && state.pendingMoveChoices.length > 1 && (
                  <div className="effect-choice">
                    <p className="muted">超听觉：有 {state.pendingMoveChoices.length} 条最快路径，请选一条：</p>
                    <div className="row">
                      {state.pendingMoveChoices.map((choice, i) => (
                        <button
                          key={i}
                          type="button"
                          className="primary"
                          title={choice.rooms.map((r) => r.name).join(' → ')}
                          onClick={() => void onAction({ type: 'chooseMovePath', pathIndex: i })}
                        >
                          {choice.label}
                        </button>
                      ))}
                    </div>
                  </div>
                )}
                {/**
                 * 猎手本能：点地图选一个地点，然后在行动区确认。
                 */}
                {state.killerSenseRoomActive && (
                  <div className="row">
                    <p className="muted">
                      猎手本能：
                      {state.pendingSenseRoom
                        ? `已选「${roomDisplayName(state.map, state.pendingSenseRoom, viewerFaction)}」，`
                        : '请点地图任选一个地点，'}
                      再点确认（点地图同一格可取消）。
                    </p>
                    <button
                      type="button"
                      className="primary"
                      disabled={!state.pendingSenseRoom}
                      onClick={() => void onAction({ type: 'confirmSenseRoom' })}
                    >
                      确认感知
                    </button>
                  </div>
                )}
                {/**
                 * 追踪：杀手选一名幸存者，展示他与你的距离（双方都能看到）。
                 */}
                {state.pendingTrackerPick && (
                  <div className="stack">
                    <p className="muted">追蹤：选择一名幸存者来展示距离。</p>
                    <div className="row">
                      {state.players
                        .filter((pl) => pl.faction === 'survivor' && pl.alive)
                        .map((pl) => (
                          <button
                            key={pl.id}
                            type="button"
                            onClick={() =>
                              void onAction({ type: 'pickTrackerTarget', targetPlayerId: pl.id })
                            }
                          >
                            {pl.name}
                          </button>
                        ))}
                    </div>
                  </div>
                )}
                <p className="muted">点击手牌放大查看。可打出时在放大界面点「打出」。</p>
                {payForCard && (
                  <p className="muted">
                    打出「{state.cardById[payForCard]?.name ?? payForCard}」需再选{' '}
                    {effectiveHandCost(state, state.cardById[payForCard]) - payIds.length} 张手牌一同弃置（用的牌最后进弃牌堆）。再点该牌可取消。
                  </p>
                )}
                {pendingCard && (
                  <p className="muted">请点击地图上的房间完成「{state.cardById[pendingCard]?.name ?? pendingCard}」的移动。</p>
                )}
                <div className="row">
                  {(state.yourKillerHand ?? [])
                    .filter((cid) => {
                      // 支付费用时：正在打出的那张牌不参与支付，只能点它取消
                      if (payForCard) return cid !== payForCard;
                      const speed = effectiveCardSpeed(state, state.cardById[cid]);
                      return cardPlayableAtStep(
                        state,
                        state.cardById[cid],
                        speed,
                        killerStep,
                        killerChoice,
                      );
                    })
                    .map((cid, idx) => {
                      const card = state.cardById[cid];
                      const speedRaw = effectiveCardSpeed(state, card);
                      /**
                       * 卡牌类型标签。`attack` 是**攻击卡牌**（只在遭遇的攻击时机打出），
                       * 不能回落成「快速」——否则攻击牌会被标错。
                       */
                      const speed =
                        speedRaw === 'slow'
                          ? '慢速'
                          : speedRaw === 'special'
                            ? '特殊'
                            : speedRaw === 'attack'
                              ? '攻击'
                              : '快速';
                      const cost = effectiveHandCost(state, card);
                      const paying = payForCard === cid;
                      const picked = payIds.includes(cid);
                      const blocked = Boolean(killerBlockedReasons[cid]);
                      /**
                       * **前置条件不满足就不给打**（服务端也会拒）。
                       * 例：枝條生長在"没有带核心标记且还有可封门的地点"时不能打；
                       * 茂盛在核心标记满 5 个时不能打。
                       */
                      const playBlock = killerCardPlayBlockReason(state, card);
                      return (
                        <button
                          key={`${cid}-${idx}`}
                          type="button"
                          className={`card${paying ? ' pending' : ''}${picked ? ' pay-pick' : ''}`}
                          disabled={(blocked || Boolean(playBlock)) && !payForCard}
                          title={playBlock ?? undefined}
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
                          {playBlock && <div className="muted">★ 现在不能打出：{playBlock}</div>}
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
                  /** 「治疗」是一般行动 → 必须是当前行动者本人（没选人时不显示） */
                  iAmActingPiece &&
                  !state.you.mainActionUsed &&
                  !activeMoveDest &&
                  (() => {
                    const healItems = ['herb', 'marco_medkit'].filter(
                      (id) => (state.you.items[id] ?? 0) > 0 && canUseOwnPersonalItem(id),
                    );
                    /**
                     * 每种治疗物品的合法目标**不一样**：
                     *  - 草药：受伤/中毒的
                     *  - 医药包：受伤/中毒/**健康但有恐惧**的（牌面写了「并消除目标恐惧」）
                     */
                    const rows = healItems.flatMap((itemId) =>
                      healableAlliesHere(state, itemId === 'marco_medkit').map((t) => ({ itemId, t })),
                    );
                    if (rows.length === 0) return null;
                    return (
                      <div className="stack">
                        <h4>治疗（须同地点）</h4>
                        <p className="muted">
                          只能治疗与你在同一地点的幸存者，包括自己。草药会在你所在地点发出响声。
                          未受伤、没有中毒的角色不能作为治疗目标。
                          {healItems.includes('marco_medkit')
                            ? '医药包是马尔科的个人物品，只有他能用；它还会消除目标的恐惧，所以健康但有恐惧的人也能治。'
                            : ''}
                        </p>
                        {rows.map(({ itemId, t }) => (
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
                        ))}
                      </div>
                    );
                  })()}

            {/**
             * 行内额外行动（威士忌 / 肾上腺素 / 镇静剂 / 爆竹 / 手斧 / 手提箱 / 观察入微）。
             *
             * `iAmActingPiece` 不能省：这一列用的是 `state.you`，
             * 只有「我就是当前行动者」时才代表他自己的额外行动。
             * 没选行动者时（共享模式）`activePlayerId` 为 null → 不列出，
             * 免得显示成「第一个人的额外行动」。
             *
             * 想给**别的**幸存者做额外行动，走「额外行动」按钮那个弹窗
             * （1对3 只列自己；共享模式列全部）。
             */}
            {canUseOwnExtras &&
              (iAmActingPiece || crossbowSetupStep) &&
              !activeMoveDest &&
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
                /**
                 * 女王：进入游戏后在**幸存者行动区**指定十字弩由谁持有。
                 * 指定后那人才拿到十字弩，之后他就能用「特殊行动」消灭僵尸。
                 */
                if (state.canPickCrossbowHolder && isSurvivorView) {
                  extras.push(
                    <div key="crossbow-holder" className="stack">
                      <h4>指定十字弩持有者</h4>
                      <p className="muted">
                        面对女王时有一副十字弩。指定一名幸存者持有它（指定后不可更改）。
                      </p>
                      <div className="row">
                        {survivors.map((sp) => (
                          <button
                            key={`cb-${sp.id}`}
                            type="button"
                            onClick={() =>
                              void runSurvivor(`把十字弩交给${sp.name}`, {
                                type: 'pickCrossbowHolder',
                                holderId: sp.id,
                              })
                            }
                          >
                            给 {sp.name}
                          </button>
                        ))}
                      </div>
                    </div>,
                  );
                }
                /**
                 * 凯莱布「幸运币」（额外行动）：弃搜索牌库顶 1 张；
                 * 是钥匙→治疗，不是→移动 0-2。
                 */
                {(() => {
                  const ch = state.characters.find((c) => c.id === state.you.characterId);
                  if (!ch?.skills.some((s) => s.id === 'lucky_coin')) return null;
                  if ((state.you.items.lucky_coin ?? 0) < 1) return null;
                  return (
                    <button
                      type="button"
                      disabled={Boolean(state.luckyCoinUsedThisTurn)}
                      onClick={() =>
                        void runSurvivor('使用幸运币', {
                          type: 'useLuckyCoin',
                          actorPlayerId: state.you.id,
                        })
                      }
                    >
                      额外行动：幸运币（弃搜索牌库顶 1 张）
                    </button>
                  );
                })()}

                /**
                 * 迪伦「机械知识」（额外行动）：在锤子地点从弃牌堆拿工具箱。
                 * 弃牌堆没有工具箱就不能用；有就能一直用。
                 */
                {(() => {
                  const ch = state.characters.find((c) => c.id === state.you.characterId);
                  if (!ch?.skills.some((s) => s.id === 'mechanical_knack')) return null;
                  if (!state.isHammerRoomHere) return null;
                  return (
                    <button
                      type="button"
                      onClick={() =>
                        void runSurvivor('机械知识：从弃牌堆拿工具箱', {
                          type: 'useMechanicalKnack',
                          actorPlayerId: state.you.id,
                        })
                      }
                    >
                      额外行动：机械知识（从弃牌堆拿工具箱）
                    </button>
                  );
                })()}
                /**
                 * 十字弩（女王特殊规则）：幸存者特殊行动 ——
                 * 消灭所在地点和相邻地点中的最多 2 个僵尸。
                 * 属于「一般行动第 4 项：使用一个特殊行动」，会结束小回合。
                 *
                 * ⚠ 按钮上**不写「一般行动：」前缀**（用户要求）——
                 * 它和下面「移除核心标记」一样，都是特殊行动那一类，
                 * 行动区里本来就有分类，不用在每颗按钮上重复。
                 */
                if (state.canUseCrossbow) {
                  extras.push(
                    <button
                      key="crossbow"
                      type="button"
                      onClick={() => void runSurvivor('使用十字弩', { type: 'useCrossbow' })}
                    >
                      用十字弩消灭至多 2 个僵尸
                    </button>,
                  );
                }
                /**
                 * 扼杀者规则：移除自己地点的一个核心标记 ——
                 * 这是**一般行动第 4 项「使用一个特殊行动」**，所以会结束小回合。
                 */
                if (state.canRemoveCoreMarker) {
                  extras.push(
                    <button
                      key="remove-core"
                      type="button"
                      onClick={() =>
                        void runSurvivor('移除核心标记', {
                          type: 'removeCoreMarker',
                          actorPlayerId: state.you.id,
                        })
                      }
                    >
                      移除此地点的 1 个核心标记
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
                /**
                 * 【城堡 R1 監視室】控制杆的入口**不在这里** ——
                 * 用户要求它"放在额外行动里、不要单独列出来"，
                 * 所以入口移到了左上角那颗「额外行动」按钮的弹窗里（见 `extraOpen` 那块）。
                 * 这里只负责"正在选门"时的取消入口（见地图上方的提示行）。
                 */
                /**
                 * 【墓穴 R6 遺物室】遗物标记：**额外行动** —— 抽 1 张遗物，
                 * 抽完标记翻面（下一个幸存者大回合才翻回正面）。
                 * 服务端 `canDrawRelic` 已经判好"在 R6 + 标记正面 + 牌堆还有牌"。
                 */
                if (state.canDrawRelic) {
                  extras.push(
                    <button
                      key="draw-relic"
                      type="button"
                      onClick={() => void runSurvivor('抽取遗物', { type: 'drawRelic' })}
                    >
                      额外行动：抽取遗物（牌堆剩 {state.relicDeckCount ?? 0}）
                    </button>,
                  );
                }
                /**
                 * **【墓穴遗物】鏡之門戶**：额外行动，传送到 🌀 螺旋地点。
                 * 点了进入"选地点"模式：下面列出所有螺旋地点，点一个就传送。
                 */
                if (state.canUseMirrorPortal) {
                  extras.push(
                    <button
                      key="relic-mirror"
                      type="button"
                      className={mirrorPicking ? 'primary' : ''}
                      onClick={() => setMirrorPicking((cur) => !cur)}
                    >
                      额外行动：鏡之門戶 → 传送到 🌀 地点
                      {mirrorPicking ? '（点下面的地点）' : ''}
                    </button>,
                  );
                  if (mirrorPicking) {
                    for (const rid of state.mirrorTargets ?? []) {
                      extras.push(
                        <button
                          key={`mirror-${rid}`}
                          type="button"
                          onClick={() =>
                            void runSurvivor(
                              `鏡之門戶传送到${roomDisplayName(state.map, rid, viewerFaction)}`,
                              { type: 'useMirrorPortal', toRoomId: rid },
                            )
                          }
                        >
                          🌀 {roomDisplayName(state.map, rid, viewerFaction)}
                        </button>,
                      );
                    }
                  }
                }
                /**
                 * ⚠ **额外行动一律只从「额外行动」弹窗进**（用户要求：
                 * 「额外行动就不要放在额外行动弹窗以外了」）。
                 *
                 * 这个 `extras` 数组里混着两类东西，这里只放行**不是额外行动**的那些：
                 *  - `crossbow`（用十字弩）/ `remove-core`（移除核心标记）
                 *    —— 它们是**特殊行动**（属于一般行动），本来就该在行动区；
                 *  - `crossbow-holder`（开局指定十字弩持有者）—— 开局准备动作；
                 *  - `mirror-*` —— 点了弹窗里的「鏡之門戶」之后的**目标选择**按钮，
                 *    不是入口（入口已经收进弹窗了）。
                 *
                 * 被滤掉的：威士忌 / 肾上腺素 / 镇静剂 / 爆竹 / 手斧 / 手提箱 /
                 * 机械知识 / 观察入微 / 抽取遗物 / 鏡之門戶（入口）——
                 * 它们在弹窗里都有，而且**不受小回合限制**，做完小回合也能用。
                 */
                const EXTRA_KEEP = /^(crossbow$|remove-core$|crossbow-holder$|mirror-)/;
                const shown = extras.filter((el) => EXTRA_KEEP.test(String(el.key ?? '')));
                if (shown.length === 0) return null;
                return (
                  <div className="stack">
                    <h4>特殊行动</h4>
                    {shown}
                  </div>
                );
              })()}

            {/**
             * 幸存者「特殊行动」—— 属于**一般行动**，所以必须是当前行动者本人。
             *
             * 守卫 `iAmActingPiece` 不能省：共享控制模式下 `controllingActive`
             * 在**还没选行动者**时就是 true（整个幸存者方都归你控制），
             * 而 `state.you` 固定指向行动顺序第一个，于是会
             * 「没选人就显示第一个人的特殊行动」（威廉的短跑冲刺）。
             * 没选人时 `activePlayerId` 是 null → `iAmActingPiece` 为 false。
             *
             * 注意：**额外行动不受这个限制**（1对3 里别人行动时自己也能做任何行动）。
             */}
            {isActive &&
              isSurvivorView &&
              state.phase === 'survivorMain' &&
              iAmActingPiece &&
              ch &&
              (() => {
                const specials: ReactElement[] = [];
                const used = (id: string) => state.you.skillUsedThisTurn.includes(id);
                const mainGone = state.you.mainActionUsed || Boolean(activeMoveDest);
                /**
                 * 【变体1】**特殊行动型特性卡** —— 只放在这个「特殊行动」区
                 * （用户要求：特殊行动的只放特殊行动的地方）。
                 * 它们占一般行动，所以 `mainGone`（一般行动已用/已在移动）时不列出来。
                 *
                 * 需要选人的（08 紧急救治）在这里展开一排人选；
                 * 需要选地点的（01/02）走点地图，下一批接。
                 */
                if (!mainGone) {
                  const actorId = state.you.id;
                  for (const t of mySpecialTraits) {
                    if (t.id === 'trait_s08') {
                      specials.push(
                        <button
                          key={`trait-${t.id}`}
                          type="button"
                          onClick={() =>
                            setTraitTargetPick((cur) => (cur === t.id ? null : t.id))
                          }
                        >
                          特殊行动：【变体1】{t.name}（选同地点的另一名幸存者）
                        </button>,
                      );
                      if (traitTargetPick === t.id) {
                        const here = survivors.filter(
                          (s) =>
                            s.alive &&
                            s.id !== actorId &&
                            s.roomId &&
                            s.roomId === state.you.roomId,
                        );
                        if (!here.length) {
                          specials.push(
                            <span key="trait-08-none" className="muted">
                              这个地点没有其他幸存者。
                            </span>,
                          );
                        }
                        for (const s of here) {
                          specials.push(
                            <button
                              key={`trait-08-${s.id}`}
                              type="button"
                              onClick={() => {
                                setTraitTargetPick(null);
                                void runSurvivor(`紧急救治：治疗${s.name}`, {
                                  type: 'useTrait',
                                  traitId: t.id,
                                  actorPlayerId: actorId,
                                  targetPlayerId: s.id,
                                });
                              }}
                            >
                              治疗 {s.name}
                            </button>,
                          );
                        }
                      }
                      continue;
                    }
                    /** 01 速度爆发：点地图选 2–4 步的目的地（步数按实际距离推） */
                    if (t.id === 'trait_s01') {
                      specials.push(
                        <button
                          key={`trait-${t.id}`}
                          type="button"
                          onClick={() => {
                            const start = state.you.roomId;
                            const rooms = start
                              ? roomsAtDistance(state.map, start, 2, 4, { blockades: state.blockades })
                              : [];
                            setExtraPick({
                              kind: 'traitRoom',
                              traitId: t.id,
                              rooms,
                              actorPlayerId: actorId,
                            });
                          }}
                        >
                          特殊行动：【变体1】{t.name}（点地图选 2–4 步）
                        </button>,
                      );
                      continue;
                    }
                    /** 02 调度人员：逐个为同地点其他人选目的地（`traitDispatch` 队列） */
                    if (t.id === 'trait_s02') {
                      const here = survivors.filter(
                        (s) =>
                          s.alive &&
                          s.id !== actorId &&
                          s.roomId &&
                          s.roomId === state.you.roomId,
                      );
                      specials.push(
                        <button
                          key={`trait-${t.id}`}
                          type="button"
                          disabled={!here.length}
                          onClick={() => {
                            const first = here[0];
                            if (!first?.roomId) return;
                            setTraitDispatch({
                              actorId,
                              current: first.id,
                              queue: here.slice(1).map((s) => s.id),
                              moves: [],
                            });
                            setExtraPick({
                              kind: 'traitRoom',
                              traitId: t.id,
                              rooms: roomsAtDistance(state.map, first.roomId, 1, 2, {
                                blockades: state.blockades,
                              }),
                              actorPlayerId: first.id,
                            });
                          }}
                        >
                          特殊行动：【变体1】{t.name}（让同地点其他人各移 1–2 步）
                          {here.length ? `：${here.map((s) => s.name).join('、')}` : '：这个地点没有其他人'}
                        </button>,
                      );
                      /** 正在选的时候，把"轮到谁 / 已选好谁"摆出来 */
                      if (traitDispatch) {
                        specials.push(
                          <span key="trait-02-status" className="muted">
                            调度中：现在为{' '}
                            {survivors.find((s) => s.id === traitDispatch.current)?.name ?? '—'}{' '}
                            选目的地；已选好 {traitDispatch.moves.length} 人
                            {traitDispatch.queue.length
                              ? `，还剩 ${traitDispatch.queue.length} 人`
                              : '，选完这次就发动'}
                            。
                          </span>,
                        );
                      }
                      continue;
                    }
                    /** 10 鼓舞士气 / 14 嘲讽战术：不需要参数，直接发动 */
                    specials.push(
                      <button
                        key={`trait-${t.id}`}
                        type="button"
                        onClick={() =>
                          void runSurvivor(`发动特性「${t.name}」`, {
                            type: 'useTrait',
                            traitId: t.id,
                            actorPlayerId: actorId,
                          })
                        }
                      >
                        特殊行动：【变体1】{t.name}
                      </button>,
                    );
                  }
                }
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
                /**
                 * 【墓穴遗物】**洞察之球**：**特殊行动** —— 在可搜索的地点**依次摸两张牌**。
                 * 两张各自完整结算（各自可能出钥匙上架并可能直接获胜）。
                 */
                if (state.canUseInsightOrb && !mainGone) {
                  specials.push(
                    <button
                      key="insight-orb"
                      type="button"
                      onClick={() => void runSurvivor('使用洞察之球', { type: 'useInsightOrb' })}
                    >
                      特殊行动：洞察之球（依次摸两张牌）
                    </button>,
                  );
                }
                /**
                 * 欧菲莉亚「言语鼓励」：和短跑冲刺同一个结构 ——
                 * 先在「特殊行动」里出一个按钮，点了再选目标（不限地点）。
                 */
                const encourage = ch.skills.find((s) => s.id === 'encourage');
                const encourageCands = survivors.filter(
                  (sp) => sp.alive && !(state.encouragedIds ?? []).includes(sp.id),
                );
                if (encourage && !mainGone && encourageCands.length > 0) {
                  specials.push(
                    <button
                      key="encourage"
                      type="button"
                      className={encouragePicking ? 'primary' : undefined}
                      onClick={() => setEncouragePicking((cur) => (cur ? null : ch.id))}
                    >
                      特殊行动：言语鼓励
                    </button>,
                  );
                }
                /**
                 * 【实验室 G3 急救室】急救箱：**特殊行动**（占一般行动），
                 * 治疗同地点一名幸存者并移除其全部恐惧，然后标记消失（一次性）。
                 * 服务端 `canUseFirstAidKit` 已经判好了"在 G3 + 标记还在 + 有一般行动"。
                 */
                if (state.canUseFirstAidKit && !mainGone) {
                  const aidCands = survivors.filter(
                    (sp) => sp.alive && sp.roomId === state.you.roomId,
                  );
                  specials.push(
                    <button
                      key="first-aid"
                      type="button"
                      className={firstAidPicking ? 'primary' : undefined}
                      onClick={() => setFirstAidPicking((cur) => (cur ? null : state.you.id))}
                    >
                      特殊行动：用急救箱（治疗同地点一人 + 消除其恐惧）
                    </button>,
                  );
                  if (firstAidPicking) {
                    for (const cand of aidCands) {
                      specials.push(
                        <button
                          key={`first-aid-${cand.id}`}
                          type="button"
                          onClick={() =>
                            void runSurvivor(
                              `用急救箱治疗${cand.name}`,
                              { type: 'useFirstAidKit', targetPlayerId: cand.id },
                            )
                          }
                        >
                          急救箱 → {cand.name}
                          {cand.id === state.you.id ? '（自己）' : ''}
                          {cand.fear > 0 ? `（有 ${cand.fear} 恐惧）` : ''}
                        </button>,
                      );
                    }
                  }
                }
                /**
                 * 【变体3】**计划里的「特殊行動」** —— 和别的特殊行动一样，
                 * 只放在这个「特殊行动」区（用户要求：「特殊行动也要标明计划相关能力，
                 * 放在特殊行动对应的位置」）。
                 *
                 * 这几条都占一般行动，所以 `mainGone` 时整组不列出来；
                 * 能不能发动由**服务端**算好（`usable` / `blockReason`）。
                 *
                 * ⚠ 「通道調查 ②」要选一个通道出口 —— 出口列表由服务端给
                 * （`plans.passageEnds`，①「互相連接」之后就是整个通道网络）。
                 */
                if (!mainGone) {
                  const planSpecialEls: ReactElement[] = [];
                  for (const card of (state.plans?.cards ?? [])) {
                    if (!card.completed) continue;
                    card.abilities.forEach((a, i) => {
                      if (a.kind !== 'special') return;
                      const label = PLAN_SPECIAL_LABEL[a.impl ?? ''] ?? a.text;
                      if (a.needsPassage) {
                        const ends = [
                          ...new Set([
                            ...(state.plans?.pendingPassage ?? []),
                            ...(state.plans?.passageEnds ?? []),
                          ]),
                        ];
                        planSpecialEls.push(
                          <span key={`plan-${card.id}-${i}-head`} className="muted">
                            特殊行动：计划·{card.name}（{label}）—— 选一个通道出口：
                          </span>,
                        );
                        for (const rid of ends) {
                          planSpecialEls.push(
                            <button
                              key={`plan-${card.id}-${i}-${rid}`}
                              type="button"
                              disabled={!a.usable}
                              title={a.blockReason ?? '从这条秘密通道移动过去（占一般行动）'}
                              onClick={() =>
                                void runSurvivor(
                                  `计划通道→${roomDisplayName(state.map, rid, viewerFaction)}`,
                                  {
                                    type: 'usePlanAbility',
                                    planId: card.id,
                                    index: i,
                                    toRoomId: rid,
                                  },
                                )}
                            >
                              通道→{roomDisplayName(state.map, rid, viewerFaction)}
                            </button>,
                          );
                        }
                        if (!a.usable && a.blockReason) {
                          planSpecialEls.push(
                            <span key={`plan-${card.id}-${i}-why`} className="muted">
                              （{a.blockReason}）
                            </span>,
                          );
                        }
                        return;
                      }
                      planSpecialEls.push(
                        <button
                          key={`plan-${card.id}-${i}`}
                          type="button"
                          disabled={!a.usable}
                          title={a.blockReason ?? `发动计划能力「${card.name}」`}
                          onClick={() =>
                            void runSurvivor(`发动计划能力「${card.name}」`, {
                              type: 'usePlanAbility',
                              planId: card.id,
                              index: i,
                            })}
                        >
                          特殊行动：计划·{card.name}（{label}）
                          {a.used ? '，本局已用过' : ''}
                        </button>,
                      );
                    });
                  }
                  if (planSpecialEls.length > 0) {
                    specials.push(
                      <h4 key="plan-special-head" className="extra-group-head">
                        计划相关能力
                      </h4>,
                    );
                    specials.push(...planSpecialEls);
                  }
                }
                if (specials.length === 0) return null;
                return (
                  <div className="stack">
                    <h4>特殊行动</h4>
                    {specials}
                  </div>
                );
              })()}

            {/**
             * 欧菲莉亚「言语鼓励」选目标：点了「特殊行动：言语鼓励」之后出现。
             * 不限地点，所以直接把所有还没持标记的存活幸存者列出来。
             */}
            {isActive &&
              isSurvivorView &&
              state.phase === 'survivorMain' &&
              encouragePicking &&
              (() => {
                const actor = state.activePlayerId
                  ? state.players.find((x) => x.id === state.activePlayerId)
                  : undefined;
                const ch = state.characters.find((c) => c.id === actor?.characterId);
                if (!ch?.skills.some((s) => s.id === 'encourage')) return null;
                const cands = survivors.filter(
                  (sp) => sp.alive && !(state.encouragedIds ?? []).includes(sp.id),
                );
                if (!cands.length) return null;
                return (
                  <div className="stack">
                    <h4>言语鼓励：选目标（不限地点）</h4>
                    <p className="muted">
                      移除目标的所有恐惧，并给他一个鼓励标记
                      （该标记会在「增加恐惧前」或「遭遇加防御前」自动生效一次）。
                    </p>
                    <div className="row">
                      {cands.map((sp) => (
                        <button
                          key={`enc-${sp.id}`}
                          type="button"
                          onClick={() => {
                            setEncouragePicking(null);
                            void runSurvivor(`言语鼓励 ${sp.name}`, {
                              type: 'useEncourage',
                              targetPlayerId: sp.id,
                              actorPlayerId: actor?.id ?? state.you.id,
                            });
                          }}
                        >
                          鼓励 {sp.name}
                        </button>
                      ))}
                      <button type="button" onClick={() => setEncouragePicking(null)}>
                        取消
                      </button>
                    </div>
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
                  幸存者
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
              alt={rulesSide === 'survivor' ? '幸存者行动规则' : '杀手行动规则'}
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
          tokensByPlayer={Object.fromEntries(
            survivors.map((sp) => [
              sp.id,
              [
                ...(sp.hasEncourageToken ? ['encourage'] : []),
                ...(sp.hasResilienceToken ? ['resilience'] : []),
              ],
            ]),
          )}
          tradeEnabled={state.phase === 'survivorMain' && !youMustDiscard && !state.pendingTrade}
          dragOwnOnly={!sharedControl}
          /** 「分头行动」：钥匙各自单独保管，显示在每个人的物品栏上方 */
          split={state.split === true}
          splitKeys={state.splitKeys}
          splitFirstId={state.splitFirstId ?? null}
          splitEscapeKeys={state.splitEscapeKeys ?? 3}
          /** 【变体1】特性卡：画在各自物品栏下方，点开放大，用掉的变暗 */
          traitDefs={state.traitDefs ?? []}
          traitUsed={state.traitUsed ?? []}
          onZoomTrait={(src, caption) => setArtZoom({ src, caption })}
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

      {/**
       * 杀手卡牌区（手牌 / 摸牌堆 / 弃牌堆 / 锁定牌）。
       *
       * ⚠ 放在**行动区之后**：布局要求是「地图 → 行动区 → 卡牌区 → 战报」。
       * `.table-bottom` 是竖向 flex，DOM 顺序就是视觉顺序。
       */}
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
          /**
           * 【雕像】有 4 尊雕像时，立绘区画 4 个（每尊一个自己校准过的色块）。
           */
          statueCount={(state.statues ?? []).length}
          /** 【变体1】杀手卡牌区里也放一份特性卡（按杀手分组，2对3 各一块） */
          traitGroups={killerTraitGroups}
          traitUsed={state.traitUsed ?? []}
          onZoomTrait={(src, caption) => setArtZoom({ src, caption })}
          /**
           * 【变体1】点自己的特性卡 = **发动**（需要弃牌的先进入选牌模式）。
           * 只有杀手视角才传这个回调 —— 幸存者那边只是"看"，点不动。
           */
          onUseTrait={
            isSurvivorView
              ? undefined
              : (traitId) => {
                  const def = (state.traitDefs ?? []).find((d) => d.id === traitId);
                  const need = KILLER_TRAIT_PAY_CLIENT[traitId] ?? 0;
                  if (!def) return;
                  if (need === 0) {
                    void onAction({
                      type: 'useTrait',
                      traitId,
                      actorPlayerId: state.you.id,
                    });
                    return;
                  }
                  setTraitPay({ traitId, traitName: def.name, need });
                  setTraitPayIds([]);
                }
          }
          activeTraitId={traitPay?.traitId ?? null}
          traitDisabledReasons={traitDisabledReasons}
          traitPayHint={
            traitPay
              ? `发动「${traitPay.traitName}」需要弃 ${traitPay.need} 张卡牌：点手牌选（已选 ${traitPayIds.length}/${traitPay.need}）`
              : null
          }
          onCancelTraitPay={
            traitPay
              ? () => {
                  setTraitPay(null);
                  setTraitPayIds([]);
                }
              : undefined
          }
        />
      )}

      {logOpen && (
        <div className="table-log panel">
          <h3>战报</h3>
          {/* 战报历史全程保留：从开局到现在都看得到，最新的一条在最下面并自动滚动过去 */}
          <div className="log-box" ref={logBoxRef}>
            {state.logs.map((l, i) => (
              <div key={`${l.t}-${i}`}>{l.text}</div>
            ))}
          </div>
        </div>
      )}
          </div>

      </div>
      </div>

      {state.pendingAmulet && isSurvivorView && isActive && (
        <div
          className="surv-board-pop"
          role="dialog"
          aria-label={state.pendingAmulet.relic === 'guard' ? '守護之石' : '古代护符'}
        >
          {/**
            * ⚠ **不要用 `.surv-board-pop-stage`** —— 那个类是给"带背景图的技能弹窗"用的，
            * 它为了贴图设了 `line-height: 0`，纯文字面板套上去**每行都会叠在一起**
            * （用户报的"守护之石的文字叠层了"）。
            */}
          <div className="surv-board-pop-card panel stack" onClick={(e) => e.stopPropagation()}>
            <h3>{state.pendingAmulet.relic === 'guard' ? '守護之石（遗物）' : '古代护符'}</h3>
            <p>
              {state.players.find((p) => p.id === state.pendingAmulet?.playerId)?.name ?? '幸存者'}{' '}
              {state.pendingAmulet.relic === 'guard'
                ? '受到伤害。是否出示遗物「守護之石」来防止这次伤害？（遭遇中的直接伤害也能挡；用了进弃牌堆）'
                : '受到伤害。是否出示古代护符来防止这次伤害？（不能防止消灭效果）'}
            </p>
            <div className="row">
              <button
                type="button"
                className="primary"
                onClick={() => onAction({ type: 'confirmAmulet', use: true })}
              >
                {state.pendingAmulet.relic === 'guard' ? '出示守護之石' : '出示护符'}
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
          onCardClick={(cardId) => {
            const found = inspectCards.find((c) => c.id === cardId);
            setPileCardZoom({ id: cardId, name: found?.name ?? cardId });
          }}
          onClose={() => setInspectPile(null)}
        />
      )}
      {pileCardZoom && (
        <CardZoom
          card={state.cardById[pileCardZoom.id]}
          cardId={pileCardZoom.id}
          fallbackName={pileCardZoom.name}
          size="art"
          onClose={() => setPileCardZoom(null)}
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
                ? `请再选 ${Math.max(0, effectiveHandCost(state, state.cardById[inspectCardId]) - payIds.length)} 张手牌弃置`
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
        <CardZoom src={artZoom.src} caption={artZoom.caption} size="art" onClose={() => setArtZoom(null)} />
      )}
      {/**
       * **【变体1】开局选特性卡的弹窗**：轮到谁选就弹给谁（服务端只把"你自己那份"下发）。
       * 单人 / 1对1 / 1对2 里一个操控者管多个棋子，所以服务端会按座位顺序依次弹。
       */}
      {/**
       * 【变体1】杀手特性 14「嘲讽战术」：幸存者发动后，**弃哪 3 张由杀手自己选**，
       * 选完抽 1 张（回合结束的摸牌照常）。快照里 `pendingTraitDiscard` 只发给杀手。
       */}
      {!isSurvivorView &&
        (state.pendingTraitDiscard ?? 0) > 0 &&
        (() => {
          const need = state.pendingTraitDiscard ?? 0;
          return (
            <div className="hud-overlay">
              <div
                className="hud-overlay-card trait-pick-card"
                onClick={(e) => e.stopPropagation()}
              >
                <div className="hud-overlay-head">
                  <h3>
                    【变体1】「嘲讽战术」：请弃掉 {need} 张卡牌（{traitDiscardPick.length}/
                    {need}）
                  </h3>
                </div>
                <p className="muted">
                  幸存者发动了「嘲讽战术」。弃哪几张**由你决定**；弃完你抽 1 张
                  （回合结束的摸牌照常）。
                </p>
                <div className="trait-pick-grid">
                  {killerHand.map((cid) => {
                    const card = state.cardById[cid];
                    const on = traitDiscardPick.includes(cid);
                    const src = cardArtSrc(card, cid);
                    return (
                      <button
                        key={`td-${cid}`}
                        type="button"
                        className={`trait-pick-item${on ? ' picked' : ''}`}
                        onClick={() =>
                          setTraitDiscardPick((cur) => {
                            if (cur.includes(cid)) return cur.filter((x) => x !== cid);
                            if (cur.length >= need) return [...cur.slice(1), cid];
                            return [...cur, cid];
                          })
                        }
                      >
                        {src ? (
                          <img src={encodeURI(src)} alt={card?.name ?? cid} draggable={false} />
                        ) : (
                          <span>{card?.name ?? cid}</span>
                        )}
                        <span className="trait-pick-name">{card?.name ?? cid}</span>
                      </button>
                    );
                  })}
                </div>
                <div className="row">
                  <button
                    type="button"
                    className="primary"
                    disabled={traitDiscardPick.length !== need}
                    onClick={() => {
                      void onAction({
                        type: 'resolveTraitDiscard',
                        cardIds: traitDiscardPick,
                      });
                      setTraitDiscardPick([]);
                    }}
                  >
                    确认弃牌（{traitDiscardPick.length}/{need}）
                  </button>
                </div>
              </div>
            </div>
          );
        })()}
      {state.variant1 && state.yourTraitPick && (
        <TraitPickOverlay
          pick={state.yourTraitPick}
          defs={state.traitDefs ?? []}
          onConfirm={(ids) =>
            void onAction({
              type: 'pickTrait',
              playerId: state.yourTraitPick?.playerId,
              traitIds: ids,
            })
          }
          onZoom={(src, caption) => setArtZoom({ src, caption })}
        />
      )}
      {state.pendingTrade &&
        isSurvivorView &&
        (state.pendingTrade.targetPlayerId === state.you.id ||
          state.pendingTrade.fromPlayerId === state.you.id) && (
        <div className="hud-overlay">
          <div className="hud-overlay-card" onClick={(e) => e.stopPropagation()}>
            <div className="hud-overlay-head">
              <h3>
                {state.pendingTrade.kind === 'keys'
                  ? '确认收下钥匙'
                  : state.pendingTrade.receiveItemName
                    ? '确认交换物品'
                    : '确认给予物品'}
              </h3>
            </div>
            {(() => {
              const offer = state.pendingTrade!;
              const qty =
                offer.amount > 1 ? `${offer.amount}×${offer.itemName}` : `「${offer.itemName}」`;
              const incoming = offer.targetPlayerId === state.you.id;
              const outgoing = offer.fromPlayerId === state.you.id;
              const detail =
                offer.kind === 'keys'
                  ? `${offer.fromName} 给你 ${offer.amount} 把钥匙`
                  : offer.receiveItemName
                    ? `${offer.fromName} 用 ${qty} 交换 ${offer.targetName} 的「${offer.receiveItemName}」`
                    : `${offer.fromName} 把 ${qty} 给 ${offer.targetName}`;
              return (
                <div className="stack">
                  <p>{detail}</p>
                  {incoming ? (
                    <>
                      <p className="muted">
                        {offer.kind === 'keys'
                          ? '确认后钥匙才会转到他名下（钥匙不占物品格、没有上限）。'
                          : '确认后才会拿到手。栏满时只能互换，不能硬塞。'}
                      </p>
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
                      <p className="muted">
                        {offer.kind === 'keys'
                          ? '等待对方确认。对方拒绝或取消后钥匙仍在你手上。'
                          : '等待对方确认。对方拒绝或取消后物品仍留在你这边。'}
                      </p>
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
              <h3>确认幸存者行动</h3>
            </div>
            <div className="stack">
              <p>{state.pendingCoopAction.summary}</p>
              {state.pendingCoopAction.youMustConfirm ? (
                <>
                  <p className="muted">
                    「{state.pendingCoopAction.fromName}」提出此一般行动或额外行动，确认后才生效。交换物品不需要这一步。
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
                  <p className="muted">等待另一名幸存者操控者确认。对方拒绝后不会执行。</p>
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
                  : '任何幸存者都可以在幸存者大回合内使用，不受小回合限制。'
                : '只显示你自己能做的额外行动。别人行动时你也可以用。'}
            </p>
            <div className="stack">
              {survivors.filter((p) => p.alive && (sharedControl || p.id === state.you.id)).flatMap((p) => {
                const buttons: ReactElement[] = [];
                /** 【变体3】计划里的**额外行动**：单独一组「计划相关能力」放最下面 */
                const planExtras: ReactElement[] = [];
                const add = (key: string, label: string, act: () => void) => {
                  buttons.push(
                    <button key={`${p.id}-${key}`} type="button" onClick={() => { act(); setExtraOpen(false); }}>
                      {p.name}：{label}
                    </button>,
                  );
                };
                if ((p.items.sophia_camera ?? 0) > 0 && canPieceHoldItem(p, 'sophia_camera')) {
                  add('cam', '相机（原地响声，一次性）', () =>
                    void runSurvivor(`${p.name}使用相机`, {
                      type: 'useItem',
                      itemId: 'sophia_camera',
                      actorPlayerId: p.id,
                    }),
                  );
                }
                // —— 乔治的笔记（额外行动，只有乔治本人能用）——
                if (isGeorgePiece(p) && (p.items.george_note_blockade ?? 0) > 0) {
                  const onHere = p.roomId
                    ? state.blockades.filter((b) => {
                        const pair = b.split('|');
                        return pair[0] === p.roomId || pair[1] === p.roomId;
                      }).length
                    : 0;
                  add(
                    'noteBlock',
                    onHere > 0
                      ? `笔记·拆除封堵（本格 ${Math.min(2, onHere)} 块）`
                      : '笔记·拆除封堵（本格没有封堵）',
                    () => {
                      if (onHere === 0) return;
                      void runSurvivor(`${p.name}用笔记拆除封堵`, {
                        type: 'useNote',
                        noteId: 'george_note_blockade',
                        actorPlayerId: p.id,
                      });
                    },
                  );
                }
                if (isGeorgePiece(p) && (p.items.george_note_noise ?? 0) > 0) {
                  add('noteNoise', '笔记·响声（任意一格）', () => {
                    setExtraPick({
                      kind: 'noteNoise',
                      noteId: 'george_note_noise',
                      rooms: state.map.rooms.map((r) => r.id),
                      actorPlayerId: p.id,
                    });
                  });
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
                      ? roomsAtDistance(state.map, p.roomId, 1, 1, {
                          blockades: state.blockades,
                          /** 机关大门：幸存者过不去 */
                          gateDoor: state.leverGateDoorId ?? null,
                        })
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
                /**
                 * 狼人宝藏：这名幸存者**自己所在地点**有没开过的宝箱时，可以开一个。
                 * （和主行动区那个按钮同一套判定，只是这里按**被检查的角色**算，
                 *   不能再用 `state.you` —— 否则多人热座下只有第一个幸存者能开箱。）
                 */
                {
                  const chestId = (state.treasureChests ?? []).find((id) =>
                    (state.map.tokens ?? []).some(
                      (t) => t.id === id && t.kind === 'treasureChest' && t.roomId === p.roomId,
                    ),
                  );
                  if (chestId) {
                    add('chest', `开宝箱（宝藏牌堆剩 ${state.treasureDeckCount ?? 0}）`, () =>
                      void runSurvivor(`${p.name}开宝箱`, {
                        type: 'openChest',
                        chestId,
                        actorPlayerId: p.id,
                      }),
                    );
                  }
                }
                /**
                 * 【城堡 R1 監視室】控制杆：**额外行动** —— 把机关大门放到任意一扇门上。
                 *
                 * 用户要求：「放在额外行动里，不要单独列出来」——
                 * 所以它只出现在**左上角那颗「额外行动」按钮的弹窗**里，
                 * 不再在行动区单独占一行。
                 *
                 * 点了之后进入"选门"模式：先点一个地点、再点与它相邻的地点
                 * = 选中它们之间那扇门。弹窗会自己关掉，地图上方给提示 + 取消。
                 *
                 * ⚠ 这里按**每一个幸存者 `p`** 判（不用 `state.canPlaceLeverGate`）：
                 * 那个字段是"针对 `state.you`"算的，共享控制模式下
                 * 会把这个按钮挂到错误的人名下。R1 是城堡地图的固定地点 id
                 * （服务端 `LEVER_ROOM`）。
                 *
                 * ⚠ **不要再加 `!p.mainActionUsed`**（以前的 bug）：
                 * 额外行动**不占一般行动、做完小回合也能做**。
                 * 走到 R1 这个动作本身就是他的一般行动，一加这条，
                 * 「走到控制杆这里」就永远看不到这个按钮了
                 * —— 和狼人宝箱（`openChest`）的挂法保持一致。
                 */
                if (state.map.id === 'castle' && p.roomId === 'R1') {
                  add(
                    'leverGate',
                    gatePicking && gateActorId === p.id
                      ? '操作控制杆放置机关大门（正在选门…）'
                      : '操作控制杆放置机关大门',
                    () => {
                      setGateActorId(p.id);
                      setGatePicking(true);
                      setGateDoorFrom(null);
                    },
                  );
                }
                /**
                 * 【墓穴 R6】**抽取遗物**（额外行动）。
                 * 用户要求："所有的额外行动都并入幸存者的额外行动按钮里面……
                 * 要不然幸存者执行完自己的小回合后就无法做这些额外行动了"。
                 */
                if (
                  state.relicRoomId &&
                  p.roomId === state.relicRoomId &&
                  state.relicMarkerFaceUp !== false &&
                  (state.relicDeckCount ?? 0) > 0
                ) {
                  add('relic', `抽取遗物（牌堆剩 ${state.relicDeckCount ?? 0}）`, () =>
                    /**
                     * ⚠ 必须带 `actorPlayerId`（和宝箱同款）：
                     * 弹窗是**按每个人**列按钮的，不带就会记到"当前行动者"头上。
                     */
                    void runSurvivor(`${p.name}抽取遗物`, {
                      type: 'drawRelic',
                      actorPlayerId: p.id,
                    }),
                  );
                }
                /**
                 * 【墓穴遗物】**鏡之門戶**（额外行动）：传送到 🌀 地点。
                 * 点了先进"选地点"模式（下面那一列 🌀 按钮）。
                 */
                if (
                  (p.items.relic_mirror ?? 0) > 0 &&
                  !p.haltedThisRound &&
                  (state.mirrorTargets ?? []).length > 0
                ) {
                  add('mirror', '鏡之門戶（传送到 🌀 地点）', () => setMirrorPicking(true));
                }
                /**
                 * 迪伦「机械知识」：在锤子地点从弃牌堆拿回工具箱。
                 *
                 * ⚠ **不限次数**（用户明确："迪伦的二技能是只要弃牌堆有工具箱
                 * 就能无限用的"）—— 所以这里**不查**"本大回合用过没有"，
                 * 只看"他在锤子地点"。弃牌堆里还有没有工具箱由服务端拦。
                 */
                {
                  const pchMech = state.characters.find((c) => c.id === p.characterId);
                  const hasMech = pchMech?.skills.some((s) => s.id === 'mechanical_knack');
                  const roomHere = state.map.rooms.find((r) => r.id === p.roomId);
                  if (hasMech && (roomHere?.tags ?? []).includes('special-hammer')) {
                    add('mech', '机械知识（从弃牌堆拿工具箱）', () =>
                      void runSurvivor(`${p.name}使用机械知识`, {
                        type: 'useMechanicalKnack',
                        actorPlayerId: p.id,
                      }),
                    );
                  }
                }
                /**
                 * 凯莱布「幸运币」（额外行动）：**不限地点**，任何时候都能用。
                 * 条件只看「他有这个技能 + 还有币 + 本大回合没用过」。
                 */
                {
                  const pchLucky = state.characters.find((c) => c.id === p.characterId);
                  if (
                    pchLucky?.skills.some((s) => s.id === 'lucky_coin') &&
                    (p.items.lucky_coin ?? 0) >= 1 &&
                    !p.luckyCoinUsedThisTurn
                  ) {
                    add('lucky', '幸运币（弃搜索牌库顶 1 张）', () =>
                      void runSurvivor(`${p.name}使用幸运币`, {
                        type: 'useLuckyCoin',
                        actorPlayerId: p.id,
                      }),
                    );
                  }
                }
                /**
                 * 【变体1】**额外行动型特性卡** —— 只放进这个「额外行动」窗口
                 * （用户要求：额外行动的只放额外行动窗口内）。
                 *
                 * 13 声音诱饵：任意地点响 ⚠（点地图）
                 * 19 明智之举：三选一 —— 拆一个封堵 / 清空自己恐惧 / 相邻地点响 ⚠
                 * 20 迅速反应：移动 1 步（点地图选相邻地点）
                 */
                for (const t of (p.id === state.you.id ? myExtraTraits : [])) {
                  if (t.id === 'trait_s13') {
                    add('trait-13', `【变体1】${t.name}（任意地点响 ⚠，每局一次）`, () => {
                      setExtraPick({
                        kind: 'traitRoom',
                        traitId: t.id,
                        rooms: state.map.rooms.map((r) => r.id),
                        actorPlayerId: p.id,
                      });
                    });
                    continue;
                  }
                  if (t.id === 'trait_s19') {
                    add('trait-19-fear', `【变体1】${t.name}：移除自己的所有恐惧`, () =>
                      void runSurvivor(`${p.name}发动明智之举（清恐惧）`, {
                        type: 'useTrait',
                        traitId: t.id,
                        actorPlayerId: p.id,
                        choice: 'clearFear',
                      }),
                    );
                    add('trait-19-block', `【变体1】${t.name}：拆除一个封堵标记`, () => {
                      setExtraPick({
                        kind: 'traitRoom',
                        traitId: t.id,
                        traitChoice: 'removeBlockade',
                        /** 有封堵标记的地点才算候选 */
                        rooms: [
                          ...new Set(
                            state.blockades.flatMap((d) => {
                              const pair = d.split('|');
                              return pair.length === 2 ? [pair[0]!, pair[1]!] : [];
                            }),
                          ),
                        ],
                        actorPlayerId: p.id,
                      });
                    });
                    add('trait-19-noise', `【变体1】${t.name}：在相邻地点响 ⚠`, () => {
                      const start = p.roomId;
                      setExtraPick({
                        kind: 'traitRoom',
                        traitId: t.id,
                        traitChoice: 'noise',
                        rooms: start ? generalNeighbors(state.map, start) : [],
                        actorPlayerId: p.id,
                      });
                    });
                    continue;
                  }
                  if (t.id === 'trait_s20') {
                    add('trait-20', `【变体1】${t.name}（额外移动 1 步）`, () => {
                      const start = p.roomId;
                      setExtraPick({
                        kind: 'traitRoom',
                        traitId: t.id,
                        rooms: start
                          ? generalNeighbors(state.map, start).filter(
                              (r) => !state.blockades.some((d) => {
                                const pair = d.split('|');
                                return pair.length === 2 && pair.includes(start) && pair.includes(r);
                              }),
                            )
                          : [],
                        actorPlayerId: p.id,
                      });
                    });
                  }
                }
                /**
                 * 【变体3】**计划相关能力（额外行动）** —— 只放进这个「额外行动」窗口
                 * （用户要求：「额外行动都放额外行动窗口里，多开一个『计划相关能力』，
                 * 在这里放计划相关额外行动」）。
                 *
                 * 只列**已完成计划**里 `kind === 'extra'` 的那几条：
                 * 現場研究（+2 移动力）、秘術草藥（治疗+清恐惧）、蜂鳴器②（在带标记处响）。
                 * 「特殊行動」那几条仍在计划卡弹窗里（要选地点/道具）。
                 *
                 * ⚠ 能不能发动由**服务端**算好（`usable` / `blockReason`），
                 * 但那是按**观众自己那颗棋子**算的 —— 所以别人操控的棋子只标"用过了"，
                 * 其余交给服务端判（点错了会给一句服端报错）。
                 */
                for (const card of (state.plans?.cards ?? [])) {
                  if (!card.completed) continue;
                  card.abilities.forEach((a, i) => {
                    if (a.kind !== 'extra') return;
                    const mine = p.id === state.you.id;
                    const label = PLAN_EXTRA_LABEL[a.impl ?? ''] ?? a.text;
                    planExtras.push(
                      <button
                        key={`${p.id}-plan-${card.id}-${i}`}
                        type="button"
                        disabled={a.used || (mine && a.usable === false)}
                        title={
                          a.used
                            ? '这一条本局已经用过了'
                            : mine
                              ? (a.blockReason ?? `发动计划能力「${card.name}」`)
                              : undefined
                        }
                        onClick={() => {
                          setExtraOpen(false);
                          void runSurvivor(`${p.name}发动计划能力「${card.name}」`, {
                            type: 'usePlanAbility',
                            planId: card.id,
                            index: i,
                            actorPlayerId: p.id,
                          });
                        }}
                      >
                        {p.name}：计划·{card.name}（{label}
                        {a.used ? '，已用过' : ''}）
                      </button>,
                    );
                  });
                }
                if (planExtras.length > 0) {
                  /** 【变体3】单独一组（用户要求：多开一个「计划相关能力」） */
                  buttons.push(
                    <h4 key={`${p.id}-plan-head`} className="extra-group-head">
                      计划相关能力
                    </h4>,
                  );
                  buttons.push(...planExtras);
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
      {/**
       * 【变体3】**计划卡弹窗**（幸存者视角）。
       *
       * 用户要求：点开能看这 2 张卡；这里同时提供"确认 / 改变计划"的入口
       * （点了要所有幸存者玩家各自同意）与确认进度。
       * 卡面上的**进度标识**按 `survLayout.planCards` 的校准位置画。
       */}
      {planOpen && isSurvivorView && state.plans && (
        <div className="hud-overlay" onClick={() => setPlanOpen(false)}>
          <div
            className="hud-overlay-card plan-cards-overlay-card"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="hud-overlay-head">
              <h3>计划卡</h3>
              <button type="button" onClick={() => setPlanOpen(false)}>
                关闭
              </button>
            </div>
            {(() => {
              const plans = state.plans!;
              const myVoterId = plans.myVoterId;
              const pend = plans.pendingSwitch;
              return (
                <div className="stack">
                  {/**
                   * 【变体3】「情報分享」完成时：**选一名幸存者从搜索牌库抽 1 张**。
                   * 谁来选由服务端定（`chooserId`）—— 只有他能点。
                   */}
                  {plans.pendingTarget && (
                    <div className="panel stack plan-pending">
                      <p>
                        情報分享：请
                        {plans.pendingTarget.chooserName ?? '一名幸存者'}
                        选择一名幸存者，从搜索牌库抽取一张牌。
                      </p>
                      <div className="row">
                        {plans.pendingTarget.candidates.map((cand) => (
                          <button
                            key={`pt-${cand.id}`}
                            type="button"
                            className="primary"
                            onClick={() =>
                              void onAction({ type: 'pickPlanTarget', playerId: cand.id })}
                          >
                            {cand.name} 抽 1 张
                          </button>
                        ))}
                      </div>
                      {state.you.id !== plans.pendingTarget.chooserId && (
                        <p className="muted">由 {plans.pendingTarget.chooserName} 来选，其他人等一等。</p>
                      )}
                    </div>
                  )}
                  {pend && (
                    <div className="panel stack plan-pending">
                      <p className="muted">
                        正在确认计划「
                        {plans.cards.find((c) => c.id === pend.toId)?.name ?? pend.toId}」：
                        {pend.confirmed.length
                          ? `已同意 ${pend.confirmed.join('、')}`
                          : '还没有人同意'}
                        {pend.waiting.length ? `；等待 ${pend.waiting.join('、')}` : '；所有人都同意了'}
                      </p>
                      {myVoterId && pend.waitingIds.includes(myVoterId) && (
                        <div className="row">
                          <button
                            type="button"
                            className="primary"
                            onClick={() => void onAction({ type: 'votePlan', accept: true })}
                          >
                            同意
                          </button>
                          <button
                            type="button"
                            onClick={() => void onAction({ type: 'votePlan', accept: false })}
                          >
                            不同意
                          </button>
                        </div>
                      )}
                    </div>
                  )}
                  {!plans.canPick && !pend && (
                    <p className="muted">
                      现在不能确认 / 改变计划 —— 只能在**幸存者大回合、发现阶段之前**改
                      （分头行动时只有先手能改）。
                    </p>
                  )}
                  <div className="plan-cards-row">
                    {plans.cards.map((c) => {
                      const lineBox = (i: number) =>
                        survLayout.planCards.lines[Math.min(i, survLayout.planCards.lines.length - 1)];
                      /** 进度标识：进行中的计划，画在当前进度那一行的左侧 */
                      const markerLine = c.active
                        ? Math.min(plans.step, Math.max(0, c.progress.length - 1))
                        : -1;
                      /** 整张计划完成 且 能力有框 → 标识转 90° 放到能力右侧（用掉就消失） */
                      const boxAbility = c.abilities.find((a) => a.hasBox);
                      const showAbilityMarker =
                        c.completed && Boolean(boxAbility) && !boxAbility?.used;
                      return (
                        <div className="plan-card" key={c.id}>
                          <h4>
                            {c.name}
                            {c.active ? '（进行中）' : c.completed ? '（已完成）' : ''}
                          </h4>
                          <div className="plan-card-stage">
                            <img className="plan-card-art" src={encodeURI(c.art)} alt={c.name} />
                            {markerLine >= 0 && (
                              <img
                                className="plan-card-progress-marker"
                                src={encodeURI('/Image/UI/计划进度标识.png')}
                                alt="进度"
                                style={(() => {
                                  const b = lineBox(markerLine);
                                  return {
                                    left: `${b.x}%`,
                                    top: `${b.y}%`,
                                    width: `${b.w}%`,
                                    height: `${b.h}%`,
                                  };
                                })()}
                              />
                            )}
                            {showAbilityMarker && (
                              <img
                                className="plan-card-progress-marker used-marker"
                                src={encodeURI('/Image/UI/计划进度标识.png')}
                                alt="已用"
                                style={{
                                  left: `${survLayout.planCards.abilityMarker.x}%`,
                                  top: `${survLayout.planCards.abilityMarker.y}%`,
                                  width: `${survLayout.planCards.abilityMarker.w}%`,
                                  height: `${survLayout.planCards.abilityMarker.h}%`,
                                  transform: 'rotate(90deg)',
                                }}
                              />
                            )}
                          </div>
                          <ul className="plan-progress-list">
                            {c.progress.map((p, i) => (
                              <li
                                key={i}
                                className={p.done ? 'done' : p.current ? 'current' : undefined}
                              >
                                {p.done ? '✅ ' : p.current ? '▶ ' : '· '}
                                {p.text}
                              </li>
                            ))}
                          </ul>
                          <ul className="plan-ability-list">
                            {c.abilities.map((a, i) => (
                              <li key={i} className={a.used ? 'used' : undefined}>
                                {a.text}
                                {a.oncePerGame && (
                                  <span className="muted">
                                    （每场一次{a.used ? '，已用过' : ''}）
                                  </span>
                                )}
                                {/**
                                 * ⚠ **计划能力不在这个弹窗里发动**（用户要求）：
                                 *  - 「額外行動」→ 左上角「额外行动」窗口里的「计划相关能力」；
                                 *  - 「特殊行動」→ 行动区的**「特殊行动」区**里的「计划相关能力」。
                                 *
                                 * 所以这里只标一句"去哪点"（顺带把不可发动的原因写出来，
                                 * 免得玩家点开别处才发现点不了）。
                                 */}
                                {c.completed && a.active && (
                                  <span className="muted">
                                    （{a.kind === 'extra' ? '额外行动' : '特殊行动'} →{' '}
                                    {a.kind === 'extra'
                                      ? '左上角「额外行动」窗口'
                                      : '行动区「特殊行动」区'}
                                    {' · 计划相关能力'}
                                    {a.used ? ' · 本局已用过' : ''}
                                    {!a.used && !a.usable && a.blockReason
                                      ? ` · 现在不能发动：${a.blockReason}`
                                      : ''}
                                    ）
                                  </span>
                                )}
                              </li>
                            ))}
                          </ul>
                          {plans.canPick && !c.active && !c.completed && (
                            <button
                              type="button"
                              className="primary"
                              onClick={() => void onAction({ type: 'pickPlan', planId: c.id })}
                            >
                              {plans.currentId ? `改变到这个计划` : '确认这个计划'}
                            </button>
                          )}
                          {c.active && !c.completed && (
                            <p className="muted">
                              第 {plans.step + 1} 条进度：{c.progress[plans.step]?.text ?? '（已全部完成）'}
                            </p>
                          )}
                        </div>
                      );
                    })}
                  </div>
                </div>
              );
            })()}
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
              {/** 【变体1】特性卡块搬到面板最下方（见文件后段） */}
              <button type="button" onClick={() => setKillerInfoOpen(false)}>
                关闭
              </button>
            </div>
            {(() => {
              const k = state.players.find((pl) => pl.faction === 'killer');
              const kArt = killerArtFor(k?.characterId ?? null, k?.name);
              const evo = kArt?.evolution;
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
                      {/**
                       * 未命名：获得的进化卡牌效果排在**已生效进化的下一行**，
                       * 并且和上方那张卡牌的轮廓高亮呼应（金色）。
                       */}
                      {(state.chosenEvolutionCards ?? []).map((c) => (
                        <li key={c.id} className="evo-card-line">
                          进化卡牌「{c.name}」：{c.text}
                        </li>
                      ))}
                    </ul>
                  </div>
                  {/* 杀手特殊规则卡：女猎手/狼人/雕像/扼杀者 1 张、女王 2 张 */}
                  {(kArt?.specialRules ?? []).map((src, i) => {
                    const box = info.specialRule?.[i] ?? info.specialRule?.[0];
                    if (!box) return null;
                    return (
                      <button
                        key={src}
                        type="button"
                        className="killer-info-piece rule"
                        style={{
                          left: `${box.x}%`,
                          top: `${box.y}%`,
                          width: `${box.w}%`,
                          height: `${box.h}%`,
                        }}
                        title={`特殊规则${(kArt?.specialRules?.length ?? 0) > 1 ? ` ${i + 1}` : ''}`}
                        onClick={() =>
                          setArtZoom({
                            src,
                            caption: `${kArt?.name ?? '杀手'} · 特殊规则${(kArt?.specialRules?.length ?? 0) > 1 ? ` ${i + 1}` : ''}`,
                          })
                        }
                      >
                        <img src={encodeURI(src)} alt="特殊规则" draggable={false} />
                      </button>
                    );
                  })}
                  {/* 杀手进化卡牌（未命名有 4 张）：和进化牌（等级表）不是一回事 */}
                  {(KILLER_EVOLUTION_CARDS[kArt?.folder ?? ''] ?? []).map((entry, i) => {
                    const box = info.evolutionCards?.[i] ?? info.evolutionCards?.[0];
                    if (!box || !kArt) return null;
                    const src = `/Image/Killers/${kArt.folder}/${entry.file}`;
                    /** 已获得的进化卡牌：轮廓高亮（金色） */
                    const chosen = (state.chosenEvolutionCards ?? []).some(
                      (c) => c.id === entry.cardId,
                    );
                    return (
                      <button
                        key={src}
                        type="button"
                        className={`killer-info-piece evo-card${chosen ? ' evo-card-chosen' : ''}`}
                        style={{
                          left: `${box.x}%`,
                          top: `${box.y}%`,
                          width: `${box.w}%`,
                          height: `${box.h}%`,
                        }}
                        title={chosen ? '已获得' : '进化卡牌（未获得）'}
                        onClick={() =>
                          setArtZoom({ src, caption: `${kArt.name} · 进化卡牌 ${i + 1}` })
                        }
                      >
                        <img src={encodeURI(src)} alt={`进化卡牌 ${i + 1}`} draggable={false} />
                      </button>
                    );
                  })}
                  {locked.map((c, i) => {
                    const src = cardArtSrc(state.cardById[c.id], c.id);
                    return (
                      <button
                        key={c.id}
                        type="button"
                        className="killer-info-piece card"
                        style={boxAt(info.locked, i)}
                        /**
                         * 走 'setInspectCardId'（带「行动 / 消耗 / 效果」文字的卡牌详请），
                         * **不要**用 'setArtZoom' —— 那个只显示大图和名字，
                         * 结果点开什么都没有效果说明。牌面图本来就有，两条路都能出图。
                         */
                        onClick={() => setInspectCardId(c.id)}
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
                        onClick={() => setInspectCardId(c.id)}
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

              {/**
               * **【变体1】杀手特性卡**（用户要求：放在**杀手信息面板的最下方**，
               * 而不是标题处；杀手卡牌区里另外也画一份）。
               *
               * ⚠ 2对3 里**每名杀手各一块**（各抽各选、互不重复）；
               * 雕像局只有主雕像那一块非空（其余雕像共用主雕像的切片）。
               * 杀手卡没有"每场游戏仅限一次"，所以这里永远不会变暗。
               */}
              {state.variant1 && (
                <div className="killer-info-traits-block">
                  <strong>特性卡</strong>
                  {killerTraitGroups.length ? (
                    killerTraitGroups.map((group) => (
                      <div key={`kinfo-trait-grp-${group.id}`} className="stack">
                        {/* 2对3 要分清是谁的；只有一个杀手时这行名字是多余的，所以只在多名时画 */}
                        {killerTraitGroups.length > 1 && (
                          <span className="muted">{group.name}</span>
                        )}
                        <div className="killer-info-traits">
                          {group.defs.map((def) => (
                            <button
                              key={`kinfo-trait-${group.id}-${def.id}`}
                              type="button"
                              className={`trait-chip${
                                (state.traitUsed ?? []).includes(def.id) ? ' used' : ''
                              }`}
                              title={`${def.name}：${def.text}`}
                              onClick={() =>
                                setArtZoom({ src: def.art, caption: `${def.name}（杀手特性）` })
                              }
                            >
                              <img src={encodeURI(def.art)} alt={def.name} draggable={false} />
                            </button>
                          ))}
                        </div>
                      </div>
                    ))
                  ) : (
                    <p className="muted">
                      {(state.traitPickerIds ?? []).length ? '还在选特性卡…' : '这局杀手没有特性卡。'}
                    </p>
                  )}
                </div>
              )}
          </div>
        </div>
      )}

      {/* —— 求生者相关物品：按当前选的 3 名幸存者分行（乔治的 3 张笔记在同一行）—— */}
      {survivorItemsOpen && (
        <div className="hud-overlay" onClick={() => setSurvivorItemsOpen(false)} role="presentation">
          <div
            className="hud-overlay-card survivor-items-overlay-card"
            role="dialog"
            aria-label="求生者相关物品"
            onClick={(e) => e.stopPropagation()}
            /**
             * 行高由校准页决定，可能很高 —— 放开默认的 640px 上限，
             * 让面板尽量长高，超出屏幕时面板内部自己滚动。
             */
            style={{ maxWidth: 'min(980px, 94vw)', maxHeight: '92vh' }}
          >
            <div className="hud-overlay-head">
              <h3>求生者相关物品</h3>
              <button type="button" onClick={() => setSurvivorItemsOpen(false)}>
                关闭
              </button>
            </div>
            {(() => {
              // 当前在场的幸存者，按座位顺序（从上往下 3 行）
              const alive = state.players.filter((p) => p.faction === 'survivor' && p.alive);
              const rows = survLayout.survivorItems.rows;
              if (alive.length === 0) {
                return <p className="muted">还没有幸存者在场。</p>;
              }
              return (
                <div className="survivor-items-body">
                  {alive.map((p, rowIdx) => {
                    /**
                     * 专属物品清单。坚毅标记是**一次性标记**不是永久物品 ——
                     * 用掉之后（'hasResilienceToken' 变 false）就不该再列出来。
                     */
                    const items = (SURVIVOR_PERSONAL_ITEMS[p.characterId ?? ''] ?? []).filter(
                      (id) => id !== 'resilience' || p.hasResilienceToken,
                    );
                    const boxes = rows[rowIdx] ?? rows[rows.length - 1] ?? [];
                    return (
                      <div className="survivor-items-row" key={p.id}>
                        <span className="survivor-items-name">{p.name}</span>
                        {items.length === 0 ? (
                          <span className="muted">（没有专属物品）</span>
                        ) : (
                          /**
                           * 按色块的 'x' 排序渲染 —— 校准页里左右拖动的顺序会体现在这里。
                           */
                          items
                            .map((itemId, i) => ({
                              itemId,
                              x: boxes[i]?.x ?? i * 20,
                            }))
                            .sort((a, b) => a.x - b.x)
                            .map(({ itemId }) => {
                              /**
                               * 专属物品**不是牌**（'cardById' 里没有），
                               * 所以要直接取图片：'itemArtSrc' 会把
                               * 'marco_medkit' / 'sophia_camera' / 乔治的笔记 /
                               * 'lucky_coin' / 'resilience' 映射到 'Image/' 下的图。
                               * 以前这里错用了 'cardArtSrc(state.cardById[...])'，
                               * 结果永远查不到、只能显示文字。
                               */
                              const src = itemArtSrc(itemId);
                              return (
                                <button
                                  key={itemId}
                                  type="button"
                                  className="survivor-item-piece"
                                  title={ITEM_LABEL[itemId] ?? itemId}
                                  onClick={() => {
                                    if (!src) return;
                                    setArtZoom({ src, caption: ITEM_LABEL[itemId] ?? itemId });
                                  }}
                                >
                                  {src ? (
                                    <img
                                      src={encodeURI(src)}
                                      alt={ITEM_LABEL[itemId] ?? itemId}
                                      draggable={false}
                                    />
                                  ) : (
                                    <span className="survivor-item-fallback">
                                      {ITEM_LABEL[itemId] ?? itemId}
                                    </span>
                                  )}
                                </button>
                              );
                            })
                        )}
                      </div>
                    );
                  })}
                </div>
              );
            })()}
          </div>
        </div>
      )}

      {/* —— 乔治的笔记：图鉴（双方都能开）—— */}
      {georgePanelOpen && (
        <div className="hud-overlay" onClick={() => setGeorgePanelOpen(false)} role="presentation">
          <div
            className="hud-overlay-card"
            role="dialog"
            aria-label="乔治的笔记"
            onClick={(e) => e.stopPropagation()}
            style={{ maxWidth: '900px' }}
          >
            <div className="hud-overlay-head">
              <h3>乔治的笔记</h3>
              <button type="button" className="ghost-btn" onClick={() => setGeorgePanelOpen(false)}>
                关闭
              </button>
            </div>
            <p className="muted">点击可放大查看。每张笔记各 1 份，只有乔治本人能使用。</p>
            <div className="row" style={{ flexWrap: 'wrap', gap: '0.6rem' }}>
              {(state.allGeorgeNotes ?? []).map((n) => {
                const takenByGeorge =
                  isSurvivorView && Object.keys(state.you.items).includes(n.id);
                const left = (state.georgeNotes ?? []).some((g) => g.id === n.id);
                const src = cardArtSrc(state.cardById[n.id], n.id);
                return (
                  <button
                    key={n.id}
                    type="button"
                    className="card"
                    style={{ width: '190px' }}
                    onClick={() =>
                      src && setArtZoom({ src, caption: n.name })
                    }
                  >
                    {src ? (
                      <img className="inline-card-art" src={encodeURI(src)} alt="" />
                    ) : null}
                    <h4>{n.name}</h4>
                    <div className="muted">{n.text}</div>
                    <div className="muted">
                      {isSurvivorView
                        ? left
                          ? '还在牌堆里'
                          : takenByGeorge
                            ? '乔治已持有'
                            : '已被拿走'
                        : '（乔治是否持有对杀手隐藏）'}
                    </div>
                  </button>
                );
              })}
            </div>
          </div>
        </div>
      )}

      {/* —— 思维敏捷：等乔治挑一张笔记 —— */}
      {state.pendingGeorgeNote &&
        isSurvivorView &&
        (() => {
          // 只有乔治本人在场时才弹（单人热座/共控下由操控者代点）
          const geo = state.players.find(
            (pl) =>
              pl.faction === 'survivor' &&
              /survivor6|乔治|george/i.test(
                `${pl.characterId ?? ''} ${
                  state.characters.find((c) => c.id === pl.characterId)?.name ?? ''
                } ${pl.name}`,
              ),
          );
          return geo && state.activePlayerId === geo.id;
        })() && (
        <div className="hud-overlay">
          <div className="hud-overlay-card" role="dialog" aria-label="挑选乔治的笔记">
            <h3>思维敏捷：挑一张笔记</h3>
            <p className="muted">
              小回合结束时你在杀手距离 1 内，可以从剩下的笔记里挑一张（拿走就没了，占装备栏）。
            </p>
            <div className="row" style={{ flexWrap: 'wrap', gap: '0.6rem' }}>
              {(state.georgeNotes ?? []).map((n) => {
                const src = cardArtSrc(state.cardById[n.id], n.id);
                return (
                  <button
                    key={n.id}
                    type="button"
                    className="card"
                    style={{ width: '190px' }}
                    onClick={() => {
                      const take = () => void onAction({ type: 'chooseGeorgeNote', noteId: n.id });
                      if (state.mode !== 'vs2') {
                        /** ⚠ 确认要画在**这个弹窗里面**（画到行动区会被弹窗盖住、点不到） */
                        setNoteConfirm({ id: n.id, name: n.name });
                        return;
                      }
                      take();
                    }}
                  >
                    {src ? (
                      <img className="inline-card-art" src={encodeURI(src)} alt="" />
                    ) : null}
                    <h4>{n.name}</h4>
                    <div className="muted">{state.cardById[n.id]?.text}</div>
                  </button>
                );
              })}
            </div>
            {noteConfirm && (
              <div className="panel stack pending-act-bar">
                <strong>确定要拿走笔记「{noteConfirm.name}」？</strong>
                <div className="row">
                  <button
                    type="button"
                    className="primary"
                    onClick={() => {
                      const pick = noteConfirm;
                      setNoteConfirm(null);
                      void onAction({ type: 'chooseGeorgeNote', noteId: pick.id });
                    }}
                  >
                    确定
                  </button>
                  <button type="button" onClick={() => setNoteConfirm(null)}>
                    取消
                  </button>
                </div>
              </div>
            )}
            <div className="row">
              <button
                type="button"
                onClick={() => {
                  setNoteConfirm(null);
                  void onAction({ type: 'chooseGeorgeNote', noteId: null });
                }}
              >
                不拿
              </button>
            </div>
          </div>
        </div>
      )}

      {state.phase === 'gameOver' && (
        <div className="hud-overlay">
          <div className="hud-overlay-card rematch-overlay-card">
            <h2 className="rematch-title">
              {state.winner === 'killer' ? '杀手胜利！' : '幸存者胜利！'}
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
