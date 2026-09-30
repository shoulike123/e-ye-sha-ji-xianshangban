/**
 * 生成【机关大门】地图标记图标 → `Image/UI/机关大门.png`
 *
 * 设计意图：和 `封堵.png`（暖色木条 + 铁钉）**明显区别**开 ——
 *  - 冷色金属（钢灰 + 蓝灰）而不是木头
 *  - 竖铁栅（闸门/吊闸造型）而不是横木条
 *  - 上下两条**黄黑警示斜纹**（工地/机械的通用语义）
 *  - 深色描边 + 高光，贴到深色地图底图上能看清
 *
 * 尺寸：632 × 185（`封堵.png` 是 421×123，两者宽高比都约 3.4，
 * 而游戏里封堵 token 是 44.5×22.2 —— 同一比例，放上去尺寸相当）。
 *
 * 用 3× 超采样再降采样做抗锯齿，然后手写 PNG 编码（Node 自带 zlib，无第三方依赖）。
 */
import { writeFileSync } from 'node:fs';
import { deflateSync } from 'node:zlib';

/* ------------------------------------------------------------- 画布 ---- */
const SS = 3;                 // 超采样倍数
const W = 632;
const H = 185;
const DW = W * SS;
const DH = H * SS;
/** RGBA 画布（透明底） */
const buf = new Float64Array(DW * DH * 4);

/** 画一个矩形（带可选圆角），alpha 混合 */
function rect(x, y, w, h, [r, g, b], a = 1, radius = 0) {
  const x0 = Math.max(0, Math.floor(x * SS));
  const y0 = Math.max(0, Math.floor(y * SS));
  const x1 = Math.min(DW, Math.ceil((x + w) * SS));
  const y1 = Math.min(DH, Math.ceil((y + h) * SS));
  const rad = radius * SS;
  for (let py = y0; py < y1; py += 1) {
    for (let px = x0; px < x1; px += 1) {
      /** 圆角：四角用圆判定 */
      if (rad > 0) {
        const cx = px + 0.5;
        const cy = py + 0.5;
        const rx0 = x0 + rad;
        const rx1 = x1 - rad;
        const ry0 = y0 + rad;
        const ry1 = y1 - rad;
        let inside = true;
        if (cx < rx0 && cy < ry0) inside = (cx - rx0) ** 2 + (cy - ry0) ** 2 <= rad * rad;
        else if (cx > rx1 && cy < ry0) inside = (cx - rx1) ** 2 + (cy - ry0) ** 2 <= rad * rad;
        else if (cx < rx0 && cy > ry1) inside = (cx - rx0) ** 2 + (cy - ry1) ** 2 <= rad * rad;
        else if (cx > rx1 && cy > ry1) inside = (cx - rx1) ** 2 + (cy - ry1) ** 2 <= rad * rad;
        if (!inside) continue;
      }
      blend(px, py, r, g, b, a);
    }
  }
}

function blend(px, py, r, g, b, a) {
  if (a <= 0) return;
  const i = (py * DW + px) * 4;
  const da = buf[i + 3];
  const na = a + da * (1 - a);
  if (na <= 0) return;
  buf[i] = (r * a + buf[i] * da * (1 - a)) / na;
  buf[i + 1] = (g * a + buf[i + 1] * da * (1 - a)) / na;
  buf[i + 2] = (b * a + buf[i + 2] * da * (1 - a)) / na;
  buf[i + 3] = na;
}

/** 圆形（铆钉） */
function circle(cx, cy, r, color, a = 1) {
  rect(cx - r, cy - r, r * 2, r * 2, color, a, r);
}

/** 黄黑警示斜纹 */
function hazard(x, y, w, h, period = 20) {
  const x0 = Math.floor(x * SS);
  const x1 = Math.ceil((x + w) * SS);
  const y0 = Math.floor(y * SS);
  const y1 = Math.ceil((y + h) * SS);
  const p = period * SS;
  for (let py = y0; py < y1; py += 1) {
    for (let px = x0; px < x1; px += 1) {
      /** 斜纹：45°，用 (px - py) 取模 */
      const t = ((((px - py) % p) + p) % p) / p;
      const yellow = t < 0.5;
      blend(px, py, ...(yellow ? [236, 190, 40] : [38, 36, 34]), 1);
    }
  }
}

/* ------------------------------------------------------------- 绘制 ---- */
/** 配色 */
const STEEL_DARK = [58, 64, 72];
const STEEL = [104, 114, 126];
const STEEL_LIGHT = [156, 168, 182];
const STEEL_HI = [205, 216, 228];
const OUTLINE = [22, 25, 30];
const SHADOW = [12, 14, 18];

/** 整块外轮廓（圆角矩形，深色描边） */
const ox = 4;
const oy = 4;
const ow = W - 8;
const oh = H - 8;
rect(ox - 2, oy + 2, ow + 4, oh, SHADOW, 0.45, 10);      // 投影
rect(ox, oy, ow, oh, OUTLINE, 1, 9);                      // 描边
rect(ox + 2.5, oy + 2.5, ow - 5, oh - 5, STEEL_DARK, 1, 7);

/** 上下两条黄黑警示带 */
const bandH = 26;
hazard(ox + 6, oy + 6, ow - 12, bandH);
hazard(ox + 6, oy + oh - 6 - bandH, ow - 12, bandH);
/** 警示带内侧的深色分隔线 */
rect(ox + 6, oy + 6 + bandH, ow - 12, 2.5, OUTLINE, 0.9);
rect(ox + 6, oy + oh - 6 - bandH - 2.5, ow - 12, 2.5, OUTLINE, 0.9);

/** 中间闸门开口（更深的底色 = 门后的黑暗） */
const gx = ox + 10;
const gy = oy + 6 + bandH + 6;
const gw = ow - 20;
const gh = oh - 12 - bandH * 2 - 12;
rect(gx, gy, gw, gh, [16, 18, 22], 1, 5);
/** 开口上沿的阴影（内凹感） */
rect(gx, gy, gw, 5, SHADOW, 0.75);
/** 开口下沿的高光 */
rect(gx, gy + gh - 3.5, gw, 3.5, STEEL_LIGHT, 0.5);

/** 竖铁栅：等距分布的竖条（闸门造型） */
const bars = 11;
const barW = 9;
const gap = (gw - bars * barW) / (bars + 1);
for (let i = 0; i < bars; i += 1) {
  const bx = gx + gap + i * (barW + gap);
  /** 栅条本体：上亮下暗，做出金属圆柱感 */
  rect(bx, gy + 2, barW, gh - 4, STEEL, 1, barW / 2);
  rect(bx + barW * 0.18, gy + 3, barW * 0.3, gh - 6, STEEL_HI, 0.75, barW * 0.15);
  rect(bx + barW * 0.72, gy + 3, barW * 0.22, gh - 6, STEEL_DARK, 0.7, barW * 0.11);
}
/** 两根横梁（压在栅条上，读作"闸门"而不是"栅栏"） */
for (const yFrac of [0.24, 0.68]) {
  const by = gy + gh * yFrac;
  rect(gx - 1, by, gw + 2, 8, STEEL_DARK, 1, 3);
  rect(gx - 1, by, gw + 2, 3, STEEL_HI, 0.8, 1.5);
  rect(gx - 1, by + 6.5, gw + 2, 2, OUTLINE, 0.6, 1);
}

/** 四角铆钉 + 上下带上的铆钉（金属装备感） */
const rivet = [196, 205, 216];
for (const [rx, ry] of [
  [ox + 12, oy + 12], [ox + ow - 12, oy + 12],
  [ox + 12, oy + oh - 12], [ox + ow - 12, oy + oh - 12],
]) {
  circle(rx, ry + 0.8, 6.2, OUTLINE, 0.9);
  circle(rx, ry, 5.2, STEEL_DARK, 1);
  circle(rx - 1, ry - 1, 3.2, rivet, 1);
}
for (const y of [oy + 6 + bandH / 2, oy + oh - 6 - bandH / 2]) {
  for (let i = 0; i < bars; i += 2) {
    const bx = gx + gap + i * (barW + gap) + barW / 2;
    circle(bx, y, 3.0, OUTLINE, 0.85);
    circle(bx, y - 0.5, 2.1, rivet, 0.95);
  }
}

/** 中央锁扣：一个黄铜色方块 + 锁孔，点明"闸门是锁着的" */
{
  const lw = 30;
  const lh = 34;
  const lx = ox + ow / 2 - lw / 2;
  const ly = oy + oh / 2 - lh / 2;
  rect(lx - 2, ly - 2, lw + 4, lh + 4, OUTLINE, 1, 6);
  rect(lx, ly, lw, lh, [196, 156, 52], 1, 5);
  rect(lx + 2, ly + 2, lw - 4, lh * 0.4, [226, 190, 92], 0.85, 3);
  circle(lx + lw / 2, ly + lh * 0.42, 5.2, OUTLINE, 1);
  rect(lx + lw / 2 - 2.2, ly + lh * 0.42, 4.4, lh * 0.36, OUTLINE, 1, 2);
}

/** 外围高光（左上）与暗边（右下），让轮廓更立体 */
rect(ox + 3, oy + 3, ow - 6, 2, STEEL_HI, 0.35, 1);
rect(ox + 3, oy + oh - 5, ow - 6, 2, SHADOW, 0.4, 1);

/* --------------------------------------------------- 降采样 + 编码 ---- */
const out = Buffer.alloc(W * H * 4);
for (let y = 0; y < H; y += 1) {
  for (let x = 0; x < W; x += 1) {
    let r = 0;
    let g = 0;
    let b = 0;
    let a = 0;
    for (let dy = 0; dy < SS; dy += 1) {
      for (let dx = 0; dx < SS; dx += 1) {
        const i = ((y * SS + dy) * DW + (x * SS + dx)) * 4;
        const aa = buf[i + 3];
        r += buf[i] * aa;
        g += buf[i + 1] * aa;
        b += buf[i + 2] * aa;
        a += aa;
      }
    }
    const n = SS * SS;
    const o = (y * W + x) * 4;
    if (a > 0) {
      out[o] = Math.round(r / a);
      out[o + 1] = Math.round(g / a);
      out[o + 2] = Math.round(b / a);
    }
    out[o + 3] = Math.round((a / n) * 255);
  }
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
function crc32(b) {
  let c = -1;
  for (let i = 0; i < b.length; i += 1) c = CRC_TABLE[(c ^ b[i]) & 0xff] ^ (c >>> 8);
  return (c ^ -1) >>> 0;
}
function chunk(type, data) {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length, 0);
  const td = Buffer.concat([Buffer.from(type, 'latin1'), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(td), 0);
  return Buffer.concat([len, td, crc]);
}
const ihdr = Buffer.alloc(13);
ihdr.writeUInt32BE(W, 0);
ihdr.writeUInt32BE(H, 4);
ihdr[8] = 8;
ihdr[9] = 6;   // RGBA
const stride = W * 4;
const rawScan = Buffer.alloc(H * (stride + 1));
for (let y = 0; y < H; y += 1) {
  rawScan[y * (stride + 1)] = 0;
  out.copy(rawScan, y * (stride + 1) + 1, y * stride, (y + 1) * stride);
}
const png = Buffer.concat([
  Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
  chunk('IHDR', ihdr),
  chunk('IDAT', deflateSync(rawScan, { level: 9 })),
  chunk('IEND', Buffer.alloc(0)),
]);
writeFileSync('Image/UI/机关大门.png', png);
console.log(`已生成 Image/UI/机关大门.png：${W}×${H}，${(png.length / 1024).toFixed(1)} KB`);
console.log(`对比 封堵.png：421×123（宽高比 ${(421 / 123).toFixed(2)} vs ${(W / H).toFixed(2)}）`);
