/**
 * 同学一打开网页就在后台把图拉进浏览器缓存。
 * 进房间、开局时同一张图会直接用缓存，不用再等下载。
 *
 * 不挡住页面：同时只下几张，先下最大的地图，再下人物和卡牌。
 */
import { itemAndSearchPreloadSrcs } from './cardArt';
import { killerArtFor, killerPreloadSrcs } from './killerArt';
import { survivorArtFor, survivorPreloadSrcs } from './survivorArt';
import { DICE_FACES, ITEM_ICON, SURVIVOR_TOKEN, UI } from './uiAssets';

const MAPS = [1, 2, 3, 4, 5].flatMap((n) => [
  `/Image/Maps/幸存者${n}.jpg`,
  `/Image/Maps/杀手${n}.jpg`,
]);

const queued = new Set<string>();
const pending: string[] = [];
const started = new Set<string>();
let active = 0;
const CONCURRENCY = 3;

function load(src: string, priority: 'high' | 'low', onDone: () => void): void {
  started.add(src);
  const img = new Image();
  img.decoding = 'async';
  img.fetchPriority = priority;
  img.onload = () => onDone();
  img.onerror = () => onDone();
  img.src = encodeURI(src);
}

function pump(): void {
  while (active < CONCURRENCY && pending.length > 0) {
    const src = pending.shift()!;
    if (started.has(src)) continue;
    active += 1;
    load(src, 'low', () => {
      active -= 1;
      pump();
    });
  }
}

function enqueue(srcs: string[]): void {
  for (const src of srcs) {
    if (!src || queued.has(src)) continue;
    queued.add(src);
    pending.push(src);
  }
  pump();
}

/** 页面一出来就调用。重复调用不会把同一张图下两遍。 */
export function startAssetPreload(): void {
  enqueue(MAPS);
  enqueue([
    ...Object.values(UI),
    ...DICE_FACES.map((d) => d.src),
    ...Object.values(ITEM_ICON),
    ...Object.values(SURVIVOR_TOKEN),
    '/Image/UI/计划进度标识.png',
    '/Image/Killers/杀手八_扼杀者/核心标记.png',
    '/Image/Killers/杀手九_女王/僵尸1.png',
    '/Image/Killers/杀手九_女王/僵尸2.png',
    '/Image/Killers/杀手九_女王/僵尸3.png',
  ]);
  enqueue(survivorPreloadSrcs());
  enqueue(killerPreloadSrcs());
  enqueue(itemAndSearchPreloadSrcs());
}

/**
 * 房间已经选定地图和角色之后，把这一局要用的图插到最前并马上开始。
 * 已经在下或下完的不会再要第二次。
 */
export function prioritizeCurrentGame(state: {
  map?: { backgrounds?: { survivor?: string; killer?: string } };
  soloKillerCharacterId?: string | null;
  soloSurvivorCharacterIds?: string[];
  players: { characterId: string | null }[];
}): void {
  const srcs: string[] = [];
  const bg = state.map?.backgrounds;
  if (bg?.survivor) srcs.push(bg.survivor);
  if (bg?.killer) srcs.push(bg.killer);
  const ids = new Set<string>();
  if (state.soloKillerCharacterId) ids.add(state.soloKillerCharacterId);
  for (const id of state.soloSurvivorCharacterIds ?? []) ids.add(id);
  for (const player of state.players) {
    if (player.characterId) ids.add(player.characterId);
  }
  for (const id of ids) {
    const survivor = survivorArtFor(id);
    if (survivor) {
      srcs.push(
        survivor.healthy,
        survivor.injured,
        survivor.skillBoard,
        survivor.skillCard,
        survivor.standee,
        survivor.intro,
      );
    }
    const killer = killerArtFor(id);
    if (killer) {
      srcs.push(
        killer.standee,
        killer.back,
        killer.evolution,
        killer.intro,
        ...killer.specialRules,
        ...killer.standees,
        ...killer.cards,
      );
    }
  }
  for (const src of srcs) {
    if (!src || started.has(src)) continue;
    const at = pending.indexOf(src);
    if (at >= 0) pending.splice(at, 1);
    queued.add(src);
    load(src, 'high', () => {});
  }
}
