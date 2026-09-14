/**
 * 把程序内部的英文代号翻译成界面上的中文。
 * 电脑喜欢 lobby、survivorMain 这种短名字；人要看“大厅”“求生者行动”。
 */

export const PHASE_LABEL: Record<string, string> = {
  lobby: '大厅',
  characterSelect: '选角',
  survivorMain: '求生者行动',
  discovery: '发现',
  noiseReport: '噪音汇报',
  killerMain: '杀手行动',
  encounter: '遭遇战',
  upkeep: '结算',
  gameOver: '结束',
};

export const FACTION_LABEL: Record<string, string> = {
  killer: '杀手',
  survivor: '求生者',
  spectator: '旁观',
};

export const WINNER_LABEL: Record<string, string> = {
  killer: '杀手',
  survivors: '求生者',
};

export const ITEM_LABEL: Record<string, string> = {
  key: '钥匙',
  map: '地图',
  board: '木板',
  item: '物品',
  sophia_camera: '索菲娅的相机',
  marco_medkit: '马尔科的医药包',
  axe: '手斧',
  lime: '石灰粉',
  whiskey: '威士忌酒瓶',
  herb: '草药',
  toolbox: '工具箱',
  ammo: '弹药包',
  longsword: '长剑',
  amulet: '古代护符',
  shortsword: '短剑',
  revolver: '左轮手枪',
  firecracker: '爆竹',
  sedative: '镇静剂',
  flashlight: '手电筒',
  adrenaline: '肾上腺素',
  trap: '陷阱零件',
};

/** 房间显示名。杀手有时看到另一套地名；没有就显示“编号+中文名” */
export function roomDisplayName(
  map: { rooms: Array<{ id: string; name: string; nameKiller?: string }> },
  roomId: string | null | undefined,
  faction?: string | null,
): string {
  if (!roomId) return '未知';
  const room = map.rooms.find((r) => r.id === roomId);
  if (!room) return roomId;
  const name = faction === 'killer' && room.nameKiller ? room.nameKiller : room.name;
  if (name.startsWith(room.id)) return name;
  return `${room.id}${name}`;
}
