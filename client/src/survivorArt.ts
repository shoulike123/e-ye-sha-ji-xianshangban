/**
 * 求生者该用哪套立绘、健康/受伤头像、技能板。
 * 文件夹名字在 Image/Survivors/ 下面。
 */
export interface SurvivorArt {
  folder: string;
  name: string;
  role: string;
  slots: number;
  healthy: string;
  injured: string;
  skillCard: string;
  skillBoard: string;
  standee: string;
}

/** 按文件夹拼出一套图片路径 */
function artOf(folder: string, name: string, role: string, slots: number): SurvivorArt {
  const base = `/Image/Survivors/${folder}`;
  return {
    folder,
    name,
    role,
    slots,
    healthy: `${base}/状态_健康.png`,
    injured: `${base}/状态_受伤.png`,
    skillCard: `${base}/技能图.png`,
    skillBoard: `${base}/技能与背包.png`,
    standee: `${base}/立绘.png`,
  };
}

const ARTS: SurvivorArt[] = [
  artOf('幸存者一_安娜_学生', '安娜', '学生', 3),
  artOf('幸存者二_约翰逊_工程师', '约翰逊', '工程师', 6),
  artOf('幸存者三_马尔科_医生', '马尔科', '医生', 3),
  artOf('幸存者四_索菲亚_侦探', '索菲娅', '侦探', 3),
  artOf('幸存者五_威廉_运动员', '威廉', '运动员', 3),
];

const ID_ALIAS: Record<string, string> = {
  survivor1: '安娜',
  survivor2: '约翰逊',
  survivor3: '马尔科',
  survivor4: '索菲娅',
  survivor5: '威廉',
};

/** 用角色编号或中文名找到那个人的画（索菲亚/索菲娅都认） */
export function survivorArtFor(characterId: string | null, characterName?: string | null): SurvivorArt | null {
  const alias = characterId ? ID_ALIAS[characterId] : undefined;
  const hay = `${characterId ?? ''} ${characterName ?? ''} ${alias ?? ''}`.replace(/索菲亚/g, '索菲娅');
  return ARTS.find((a) => hay.includes(a.name) || hay.includes(a.folder)) ?? null;
}

/** 状态栏头像：受伤或倒下用受伤图 */
export function portraitSrc(art: SurvivorArt | null, injured: boolean): string | null {
  if (!art) return null;
  return injured ? art.injured : art.healthy;
}

export function skillBoardSrc(art: SurvivorArt | null): string | null {
  return art?.skillBoard ?? null;
}

export function skillCardSrc(art: SurvivorArt | null): string | null {
  return art?.skillCard ?? null;
}

export function survivorStandeeSrc(art: SurvivorArt | null): string | null {
  return art?.standee ?? null;
}
