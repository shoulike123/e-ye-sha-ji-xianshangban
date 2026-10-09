/**
 * 把 `Image/` 里"画得比屏幕上小得多"的图缩到合适尺寸。
 *
 * ⚠ 为什么不用 Windows 自带的缩放（`shrink-images.ps1`）：
 *   GDI+ 的 PNG 编码器压缩率很差 —— 实测 80 张里有 **26 张缩完反而比原图还大**，
 *   只能被迫跳过（大图 20 张、42 MB 全卡在那儿）。这里自己编码：
 *   **逐行挑最优 filter + zlib level 9**，无 alpha 的输出 RGB（省 25%）。
 *
 * ⚠ **界面上能点开放大的图一律不动**，只有"只在小尺寸出现、永远放不大"的才缩：
 *   · 状态头像        只画在状态栏那个小卡位
 *   · 地图标记/小图标  地图逻辑坐标只有 20–40（约 30–60 px）
 *   · 顶栏板块        屏幕上约 500–800 px 宽
 *
 * 用法：
 *   node scripts/tools/shrink-images.mjs           # 只预览
 *   node scripts/tools/shrink-images.mjs --apply   # 真的改（同名覆盖）
 *
 * 回滚：`git checkout -- Image/`
 */
import fs from 'node:fs';
import path from 'node:path';
import { deflateSync, inflateSync } from 'node:zlib';

const APPLY = process.argv.includes('--apply');
const ROOT = path.resolve(import.meta.dirname, '..', '..');

/* ------------------------------------------------------------ 规则 ---- */
// 顺序有意义：先匹配到的先生效。w/h = 目标框（等比装进去）
const RULES = [
  { name: '地图底图（已处理）', re: /^Image[\\/]Maps[\\/]/, w: 0, h: 0 },
  { name: '未引用素材（不动）', re: /httpssteamusercontent/, w: 0, h: 0 },
  // —— 能点开放大的：一个都不缩 ——
  { name: '大图（可放大）', re: /(人物介绍|技能与背包|技能图|进化牌|进化卡牌_|特殊规则|立绘)/, w: 1520, h: 1800 },
  { name: '背包物品（可放大）', re: /^Image[\\/]UI[\\/](索菲亚的相机|马尔科的医疗包)\.png$/, w: 1024, h: 1024 },
  { name: '卡面（牌堆可放大）', re: /^Image[\\/](Key|Discovery|Treasure|Relic|Traits|Plan|Promo|Notes)[\\/]/, w: 1520, h: 1800 },
  { name: '杀手行动牌', re: /[\\/]卡牌[\\/]/, w: 1520, h: 1800 },
  { name: '牌背', re: /牌背\d?\.(png|jpg)$/, w: 1520, h: 1800 },
  // —— 永远放不大的：缩 ——
  { name: '状态头像', re: /状态_(健康|受伤)\.png$/, w: 480, h: 480 },
  { name: '顶栏板块', re: /^Image[\\/]UI[\\/](状态栏|钥匙架|救援板块|分头行动)\.png$/, w: 1600, h: 1600 },
  { name: '地图标记/小图标', re: /^Image[\\/]UI[\\/](警车|修理|封堵|响声|爆竹响声|潜行|陷阱|机关大门|急救箱|手提箱|手提箱已用|坍塌板块|遗物_正面|遗物_背面|欧菲莉亚的鼓励标记|迪伦的坚毅标记)\.[a-z]+$/, w: 256, h: 256 },
  { name: '骰子', re: /^Image[\\/]UI[\\/]骰子[\\/]/, w: 256, h: 256 },
  // ⚠ /Image/UI/ 剩下的**不都是小图标**：`凯莱布的幸运币.png` 其实是张卡面（909×1372），
  //   `恐惧.png`（1103×1553）也是卡面扫描件，`行动规则_*.png` 带文字 —— 给宽裕上限。
  { name: '其他 UI 图（宽裕）', re: /^Image[\\/]UI[\\/]/, w: 1024, h: 1024 },
  { name: '地图上的角色标记', re: /(核心标记|僵尸\d|中毒标记|猎手陷阱_|宝藏_宝箱)\.png$/, w: 256, h: 256 },
];

/* ------------------------------------------------------------ PNG ---- */
function decodePng(buf) {
  if (buf.readUInt32BE(0) !== 0x89504e47) throw new Error('不是 PNG');
  let pos = 8;
  let w = 0; let h = 0; let depth = 8; let colorType = 6; let interlace = 0;
  let palette = null; let trns = null;
  const idat = [];
  while (pos < buf.length) {
    const len = buf.readUInt32BE(pos);
    const type = buf.toString('ascii', pos + 4, pos + 8);
    const data = buf.subarray(pos + 8, pos + 8 + len);
    if (type === 'IHDR') {
      w = data.readUInt32BE(0); h = data.readUInt32BE(4);
      depth = data[8]; colorType = data[9]; interlace = data[12];
    } else if (type === 'PLTE') palette = Buffer.from(data);
    else if (type === 'tRNS') trns = Buffer.from(data);
    else if (type === 'IDAT') idat.push(Buffer.from(data));
    else if (type === 'IEND') break;
    pos += 12 + len;
  }
  if (depth !== 8) throw new Error(`只支持 8 位 PNG（这张 ${depth} 位）`);
  if (interlace !== 0) throw new Error('不支持隔行扫描 PNG');
  const channels = { 0: 1, 2: 3, 3: 1, 4: 2, 6: 4 }[colorType];
  if (!channels) throw new Error(`不支持的颜色类型 ${colorType}`);

  const raw = inflateSync(Buffer.concat(idat));
  const stride = w * channels;
  const out = Buffer.alloc(h * stride);
  let rp = 0;
  for (let y = 0; y < h; y += 1) {
    const filter = raw[rp]; rp += 1;
    const line = raw.subarray(rp, rp + stride); rp += stride;
    const cur = out.subarray(y * stride, (y + 1) * stride);
    const prev = y > 0 ? out.subarray((y - 1) * stride, y * stride) : null;
    for (let i = 0; i < stride; i += 1) {
      const a = i >= channels ? cur[i - channels] : 0;
      const b = prev ? prev[i] : 0;
      const c = prev && i >= channels ? prev[i - channels] : 0;
      let v = line[i];
      if (filter === 1) v += a;
      else if (filter === 2) v += b;
      else if (filter === 3) v += (a + b) >> 1;
      else if (filter === 4) {
        const p = a + b - c;
        const pa = Math.abs(p - a); const pb = Math.abs(p - b); const pc = Math.abs(p - c);
        v += pa <= pb && pa <= pc ? a : pb <= pc ? b : c;
      }
      cur[i] = v & 0xff;
    }
  }

  const rgba = Buffer.alloc(w * h * 4);
  for (let i = 0; i < w * h; i += 1) {
    let r; let g; let b; let a = 255;
    const s = i * channels;
    if (colorType === 0) [r, g, b] = [out[s], out[s], out[s]];
    else if (colorType === 4) [r, g, b, a] = [out[s], out[s], out[s], out[s + 1]];
    else if (colorType === 2) [r, g, b] = [out[s], out[s + 1], out[s + 2]];
    else if (colorType === 6) [r, g, b, a] = [out[s], out[s + 1], out[s + 2], out[s + 3]];
    else {
      const idx = out[s];
      r = palette[idx * 3]; g = palette[idx * 3 + 1]; b = palette[idx * 3 + 2];
      if (trns && idx < trns.length) a = trns[idx];
    }
    const d = i * 4;
    rgba[d] = r; rgba[d + 1] = g; rgba[d + 2] = b; rgba[d + 3] = a;
  }
  return { w, h, rgba };
}

const CRC_TABLE = (() => {
  const t = new Int32Array(256);
  for (let n = 0; n < 256; n += 1) {
    let c = n;
    for (let k = 0; k < 8; k += 1) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c;
  }
  return t;
})();
function crc32(buf) {
  let c = -1;
  for (let i = 0; i < buf.length; i += 1) c = CRC_TABLE[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
  return (c ^ -1) >>> 0;
}
function chunk(type, data) {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length, 0);
  const body = Buffer.concat([Buffer.from(type, 'ascii'), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(body), 0);
  return Buffer.concat([len, body, crc]);
}

/**
 * 逐行挑最优 filter（PNG 的 5 种里选残差绝对值和最小的那一种）。
 * 只写 filter=None 的话，照片/插画类图会白胖 20–50%。
 */
function filterRows(pix, w, h, bpp) {
  const stride = w * bpp;
  const raw = Buffer.alloc(h * (stride + 1));
  const prev = Buffer.alloc(stride);
  const cur = Buffer.alloc(stride);
  const line = Buffer.alloc(stride);
  for (let y = 0; y < h; y += 1) {
    pix.copy(cur, 0, y * stride, (y + 1) * stride);
    let bestType = 0; let bestScore = Infinity;
    for (let f = 0; f < 5; f += 1) {
      let score = 0;
      for (let i = 0; i < stride; i += 1) {
        const a = i >= bpp ? cur[i - bpp] : 0;
        const b = prev[i];
        const c = i >= bpp ? prev[i - bpp] : 0;
        let v;
        if (f === 0) v = cur[i];
        else if (f === 1) v = cur[i] - a;
        else if (f === 2) v = cur[i] - b;
        else if (f === 3) v = cur[i] - ((a + b) >> 1);
        else {
          const p = a + b - c;
          const pa = Math.abs(p - a); const pb = Math.abs(p - b); const pc = Math.abs(p - c);
          v = cur[i] - (pa <= pb && pa <= pc ? a : pb <= pc ? b : c);
        }
        v &= 0xff;
        line[i] = v;
        score += v < 128 ? v : 256 - v;
      }
      if (score < bestScore) {
        bestScore = score;
        bestType = f;
        raw[y * (stride + 1)] = f;
        line.copy(raw, y * (stride + 1) + 1);
      }
    }
    if (bestType < 0) raw[y * (stride + 1)] = 0;
    cur.copy(prev);
  }
  return raw;
}

function encodePng(w, h, rgba, hasAlpha) {
  const bpp = hasAlpha ? 4 : 3;
  let pix = rgba;
  if (!hasAlpha) {
    pix = Buffer.alloc(w * h * 3);
    for (let i = 0; i < w * h; i += 1) {
      pix[i * 3] = rgba[i * 4];
      pix[i * 3 + 1] = rgba[i * 4 + 1];
      pix[i * 3 + 2] = rgba[i * 4 + 2];
    }
  }
  const raw = filterRows(pix, w, h, bpp);
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(w, 0);
  ihdr.writeUInt32BE(h, 4);
  ihdr[8] = 8;
  ihdr[9] = hasAlpha ? 6 : 2;
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr),
    chunk('IDAT', deflateSync(raw, { level: 9 })),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

/** 盒式平均缩小（面积平均，缩小时不会有振铃） */
function shrink(img, ow, oh) {
  const out = Buffer.alloc(ow * oh * 4);
  let hasAlpha = false;
  for (let y = 0; y < oh; y += 1) {
    const sy0 = Math.floor((y * img.h) / oh);
    const sy1 = Math.max(sy0 + 1, Math.floor(((y + 1) * img.h) / oh));
    for (let x = 0; x < ow; x += 1) {
      const sx0 = Math.floor((x * img.w) / ow);
      const sx1 = Math.max(sx0 + 1, Math.floor(((x + 1) * img.w) / ow));
      let r = 0; let g = 0; let b = 0; let a = 0; let n = 0;
      for (let sy = sy0; sy < sy1; sy += 1) {
        for (let sx = sx0; sx < sx1; sx += 1) {
          const i = (sy * img.w + sx) * 4;
          r += img.rgba[i]; g += img.rgba[i + 1]; b += img.rgba[i + 2]; a += img.rgba[i + 3];
          n += 1;
        }
      }
      const d = (y * ow + x) * 4;
      out[d] = Math.round(r / n);
      out[d + 1] = Math.round(g / n);
      out[d + 2] = Math.round(b / n);
      out[d + 3] = Math.round(a / n);
      if (out[d + 3] !== 255) hasAlpha = true;
    }
  }
  return { out, hasAlpha };
}

/* ------------------------------------------------------------ 主流程 ---- */
const files = [];
(function walk(d) {
  for (const e of fs.readdirSync(d, { withFileTypes: true })) {
    const p = path.join(d, e.name);
    if (e.isDirectory()) walk(p);
    else if (e.isFile() && /\.(png|jpg|jpeg)$/i.test(e.name)) files.push(p);
  }
}(path.join(ROOT, 'Image')));

const MB = (n) => n / 1048576;
const plan = [];
for (const full of files) {
  const rel = path.relative(ROOT, full);
  const rule = RULES.find((r) => r.re.test(rel));
  if (!rule || rule.w === 0) continue;
  if (/\.(jpg|jpeg)$/i.test(full)) continue;   // 这里只处理 PNG（JPEG 那 2 张小图无所谓）
  let dim;
  try { dim = decodePng(fs.readFileSync(full)); }
  catch (e) { console.log(`  跳过 ${rel}：${e.message}`); continue; }
  const scale = Math.min(1, rule.w / dim.w, rule.h / dim.h);
  if (scale >= 0.995) continue;
  plan.push({
    full, rel, rule: rule.name, w: dim.w, h: dim.h,
    nw: Math.round(dim.w * scale), nh: Math.round(dim.h * scale),
    old: fs.statSync(full).size,
  });
}

if (!plan.length) { console.log('没有需要缩的图。'); process.exit(0); }

console.log(`===== 计划：${plan.length} 张 =====\n`);
const groups = new Map();
for (const p of plan) {
  if (!groups.has(p.rule)) groups.set(p.rule, []);
  groups.get(p.rule).push(p);
}
for (const [name, list] of [...groups.entries()].sort((a, b) =>
  b[1].reduce((s, p) => s + p.old, 0) - a[1].reduce((s, p) => s + p.old, 0))) {
  console.log(`[${name}]  ${list.length} 张，${MB(list.reduce((s, p) => s + p.old, 0)).toFixed(1)} MB`);
  for (const p of list.sort((a, b) => b.old - a.old)) {
    console.log(`   ${MB(p.old).toFixed(2).padStart(7)} MB  ${String(p.w).padStart(5)}x${String(p.h).padEnd(5)} -> ${String(p.nw).padStart(5)}x${String(p.nh).padEnd(5)}  ${p.rel}`);
  }
  console.log('');
}
const totalOld = plan.reduce((s, p) => s + p.old, 0);
console.log(`合计：${MB(totalOld).toFixed(1)} MB`);

if (!APPLY) {
  console.log('\n（这是预览。加 --apply 才会真的改。）');
  process.exit(0);
}

console.log('\n===== 开始处理 =====');
let done = 0; let skipped = 0; let newTotal = 0;
for (const p of plan) {
  const img = decodePng(fs.readFileSync(p.full));
  const { out, hasAlpha } = shrink(img, p.nw, p.nh);
  const buf = encodePng(p.nw, p.nh, out, hasAlpha);
  if (buf.length >= p.old) {
    skipped += 1;
    newTotal += p.old;
    console.log(`  跳过（缩了反而更大）${p.rel}  ${MB(p.old).toFixed(2)} -> ${MB(buf.length).toFixed(2)} MB`);
    continue;
  }
  fs.writeFileSync(p.full, buf);
  done += 1;
  newTotal += buf.length;
}
console.log(`\n改了 ${done} 张，跳过 ${skipped} 张`);
console.log(`${MB(totalOld).toFixed(1)} MB -> ${MB(newTotal).toFixed(1)} MB   省 ${MB(totalOld - newTotal).toFixed(1)} MB`);
