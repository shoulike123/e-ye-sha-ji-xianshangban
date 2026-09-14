/**
 * 说明书长什么样才算合格。
 * JSON 写错一个字段，这里会在读入时拦住，避免开打后才崩。
 */
import { z } from 'zod';

/** 一张牌或一个技能可以触发的小动作（走路、惊吓、摸牌……） */
export const EffectSchema = z.object({
  op: z.enum([
    'move',
    'search',
    'searchSurvivors',
    'repair',
    'noise',
    'draw',
    'discard',
    'stealth',
    'reveal',
    'damage',
    'heal',
    'placeToken',
    'removeToken',
    'gainItem',
    'waitRescue',
    'modifyMoveRange',
    'modifyAttackDamage',
    'quietSearch',
    'addFear',
    'clearFear',
    'placeBlockade',
    'placeBlockadeAll',
    'removeBlockade',
    'expose',
    'modifyPower',
    'attackValue',
    'defenseValue',
    'senseAdjacentPair',
    'senseColor',
    'addFearRange',
    'addFearPath',
    'damageHere',
    'damageFeared',
    'exposeFeared',
    'onReveal',
    'rageSearch',
  ]),
  value: z.union([z.number(), z.boolean(), z.string()]).optional(),
  min: z.number().optional(),
  at: z.enum(['self', 'target', 'chosen']).optional(),
  itemId: z.string().optional(),
  amount: z.number().optional(),
  tokenId: z.string().optional(),
});

export const SkillSchema = z.object({
  id: z.string(),
  name: z.string(),
  trigger: z.enum([
    'passive',
    'activated',
    'onTurnStart',
    'onSearch',
    'onNoise',
    'onDamaged',
  ]),
  oncePerTurn: z.boolean().optional(),
  text: z.string(),
  effects: z.array(EffectSchema),
});

export const CharacterSchema = z.object({
  id: z.string(),
  name: z.string(),
  faction: z.enum(['killer', 'survivor']),
  maxHp: z.number().int().positive(),
  description: z.string(),
  startingPower: z.number().int().nonnegative().optional(),
  inventorySlots: z.number().int().positive().optional(),
  skills: z.array(SkillSchema).default([]),
});

export const CardSchema = z.object({
  id: z.string(),
  name: z.string(),
  type: z.enum([
    'search',
    'discovery',
    'killerAction',
    'upgrade',
    'item',
  ]),
  speed: z.enum(['fast', 'slow', 'special']).optional(),
  text: z.string(),
  makesNoise: z.boolean().optional(),
  locked: z.boolean().optional(),
  unlockLevel: z.number().int().positive().optional(),
  owner: z.string().optional(),
  handCost: z.number().int().nonnegative().optional(),
  effects: z.array(EffectSchema).default([]),
});

export const RoomSchema = z.object({
  id: z.string(),
  name: z.string(),
  nameKiller: z.string().optional(),
  x: z.number(),
  y: z.number(),
  tags: z.array(z.string()).default([]),
});

export const BlockadeMarkSchema = z.object({
  x: z.number(),
  y: z.number(),
  w: z.number(),
  h: z.number(),
  rotation: z.number().optional(),
});

export const EdgeSchema = z.object({
  from: z.string(),
  to: z.string(),
  bidirectional: z.boolean().default(true),
  pathType: z.string().optional(),
  blockade: z
    .object({
      survivor: BlockadeMarkSchema.optional(),
      killer: BlockadeMarkSchema.optional(),
    })
    .optional(),
});

export const ZoneSchema = z.object({
  id: z.string(),
  label: z.string().optional(),
  color: z.string(),
  shape: z.enum(['rect', 'circle']),
  x: z.number(),
  y: z.number(),
  w: z.number().optional(),
  h: z.number().optional(),
  r: z.number().optional(),
  side: z.enum(['killer', 'survivor', 'both']).optional(),
});

export const TokenSchema = z.object({
  id: z.string(),
  kind: z.string(),
  src: z.string(),
  x: z.number(),
  y: z.number(),
  w: z.number(),
  h: z.number(),
  rotation: z.number().optional(),
  side: z.enum(['killer', 'survivor', 'both']).optional(),
  roomId: z.string().optional(),
  label: z.string().optional(),
});

export const MapSchema = z.object({
  id: z.string(),
  name: z.string(),
  width: z.number(),
  height: z.number(),
  backgrounds: z
    .object({
      survivor: z.string().optional(),
      killer: z.string().optional(),
    })
    .optional(),
  rooms: z.array(RoomSchema).min(1),
  edges: z.array(EdgeSchema),
  passages: z.array(EdgeSchema).optional(),
  zones: z.array(ZoneSchema).optional(),
  tokens: z.array(TokenSchema).optional(),
  survivorStartRoomId: z.string(),
  killerStartRoomId: z.string(),
});

export const RulesSchema = z.object({
  id: z.string(),
  name: z.string(),
  mapId: z.string(),
  maxSurvivors: z.number().int().positive(),
  minPlayersToStart: z.number().int().positive(),
  survivorMoveRange: z.number().int().positive(),
  killerMoveRange: z.number().int().positive(),
  killerActionsPerTurn: z.number().int().positive(),
  searchMakesNoise: z.boolean(),
  repairMakesNoise: z.boolean(),
  keysNeeded: z.number().int().nonnegative(),
  repairNeeded: z.number().int().nonnegative(),
  rescueWaitRounds: z.number().int().nonnegative(),
  killerWinsOnAnyKill: z.boolean(),
  survivorExitRequiresAllAliveAt: z.string(),
  hiddenExitRequiresMapItem: z.boolean(),
  killerSeesSurvivorPositions: z.boolean(),
  survivorSeesKillerPosition: z.boolean(),
  startingHandSize: z.number().int().nonnegative(),
  killerDrawOnTurnEnd: z.number().int().nonnegative(),
  killerStartingHand: z.number().int().nonnegative().default(2),
  killerHandMax: z.number().int().positive().default(5),
  survivorDefaultMaxHp: z.number().int().positive().default(2),
  fearMax: z.number().int().positive().default(3),
  blockadeTokenMax: z.number().int().positive().default(7),
  killerPowerMax: z.number().int().positive().default(10),
  killerPowerStart: z.number().int().nonnegative().default(1),
  enableDiscovery: z.boolean().default(true),
  enableEncounter: z.boolean().default(true),
  enableBlockades: z.boolean().default(true),
  enableFear: z.boolean().default(true),
});

export type EffectDef = z.infer<typeof EffectSchema>;
export type SkillDef = z.infer<typeof SkillSchema>;
export type CharacterDef = z.infer<typeof CharacterSchema>;
export type CardDef = z.infer<typeof CardSchema>;
export type MapDef = z.infer<typeof MapSchema>;
export type MapToken = z.infer<typeof TokenSchema>;
export type RulesDef = z.infer<typeof RulesSchema>;

const LayoutBoxSchema = z.object({
  x: z.number(),
  y: z.number(),
  w: z.number(),
  h: z.number(),
});

export const SurvivorLayoutSchema = z.object({
  statusBar: z.object({
    cards: z.array(LayoutBoxSchema).min(1),
    fear: z.array(LayoutBoxSchema.extend({ card: z.number().int(), index: z.number().int() })),
    noise: z.array(LayoutBoxSchema.extend({ card: z.number().int() })),
  }),
  hudRow: z
    .object({
      keys: LayoutBoxSchema,
      status: LayoutBoxSchema,
      rescue: LayoutBoxSchema,
    })
    .default({
      keys: { x: 0, y: 0, w: 34.5, h: 100 },
      status: { x: 34.5, y: 0, w: 49.8, h: 100 },
      rescue: { x: 84.3, y: 0, w: 15.7, h: 100 },
    }),
  keySlots: z.array(LayoutBoxSchema).default([
    { x: 2.4, y: 47.5, w: 18, h: 50 },
    { x: 21.4, y: 47.5, w: 18, h: 50 },
    { x: 40.4, y: 47.5, w: 18, h: 50 },
    { x: 59.4, y: 47.5, w: 18, h: 50 },
    { x: 78.4, y: 47.5, w: 18, h: 50 },
  ]),
  rescueCells: z
    .array(LayoutBoxSchema.extend({ step: z.number().int() }))
    .default([
      { step: 5, x: 6, y: 14, w: 24, h: 32 },
      { step: 4, x: 6, y: 56, w: 24, h: 32 },
      { step: 3, x: 38, y: 14, w: 24, h: 32 },
      { step: 2, x: 38, y: 56, w: 24, h: 32 },
      { step: 1, x: 70, y: 14, w: 24, h: 32 },
      { step: 0, x: 70, y: 56, w: 24, h: 32 },
    ]),
  skillBoard: z.object({
    slots3: z.array(LayoutBoxSchema),
    slots6: z.array(LayoutBoxSchema),
  }),
  publicStrip: z
    .object({
      evolution: LayoutBoxSchema,
      level: LayoutBoxSchema,
      power: LayoutBoxSchema,
    })
    .default({
      evolution: { x: 18, y: 4, w: 64, h: 92 },
      level: { x: 20.5, y: 10, w: 8, h: 14 },
      power: { x: 20.2, y: 78, w: 8, h: 16 },
    }),
  killerDock: z
    .object({
      standee: LayoutBoxSchema,
      deck: LayoutBoxSchema,
      discard: LayoutBoxSchema,
      hand: z
        .array(LayoutBoxSchema)
        .min(1)
        .transform((boxes) => boxes.slice(0, 5)),
      evolution: LayoutBoxSchema,
      evolutionLabel: LayoutBoxSchema.default({ x: 77, y: 56, w: 22, h: 6 }),
      locked: z
        .array(LayoutBoxSchema)
        .default([{ x: 54, y: 62, w: 12, h: 34 }]),
    })
    .default({
      standee: { x: 1.2, y: 6, w: 14, h: 88 },
      deck: { x: 16.5, y: 8, w: 10, h: 52 },
      discard: { x: 27.5, y: 8, w: 10, h: 52 },
      hand: [
        { x: 39, y: 10, w: 9, h: 48 },
        { x: 48.5, y: 10, w: 9, h: 48 },
        { x: 58, y: 10, w: 9, h: 48 },
        { x: 67.5, y: 10, w: 9, h: 48 },
        { x: 77, y: 10, w: 9, h: 48 },
      ],
      evolution: { x: 77, y: 62, w: 22, h: 34 },
      evolutionLabel: { x: 77, y: 56, w: 22, h: 6 },
      locked: [{ x: 54, y: 62, w: 12, h: 34 }],
    }),
  killerInfo: z
    .object({
      evolution: LayoutBoxSchema,
      effects: LayoutBoxSchema,
      locked: z.array(LayoutBoxSchema).min(1),
      cards: z.array(LayoutBoxSchema).min(1),
    })
    .default({
      evolution: { x: 1.6, y: 2, w: 47, h: 55 },
      effects: { x: 50.2, y: 2, w: 47.4, h: 55 },
      locked: [
        { x: 1.6, y: 59, w: 8.2, h: 18 },
        { x: 10.6, y: 59, w: 8.2, h: 18 },
      ],
      cards: [
        { x: 1.6, y: 79, w: 7.6, h: 19 },
        { x: 9.8, y: 79, w: 7.6, h: 19 },
        { x: 18, y: 79, w: 7.6, h: 19 },
        { x: 26.2, y: 79, w: 7.6, h: 19 },
        { x: 34.4, y: 79, w: 7.6, h: 19 },
        { x: 42.6, y: 79, w: 7.6, h: 19 },
        { x: 50.8, y: 79, w: 7.6, h: 19 },
        { x: 59, y: 79, w: 7.6, h: 19 },
        { x: 67.2, y: 79, w: 7.6, h: 19 },
        { x: 75.4, y: 79, w: 7.6, h: 19 },
        { x: 83.6, y: 79, w: 7.6, h: 19 },
        { x: 91.8, y: 79, w: 7.6, h: 19 },
      ],
    }),
});

export type SurvivorLayout = z.infer<typeof SurvivorLayoutSchema>;
