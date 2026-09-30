/**
 * 从一张大图里**按矩形裁切**并导出 PNG（可选缩放）。
 *
 * 用途：用户发来的素材常常是"几张牌排成一行"或"整张地图里的一个图标"，
 * 需要按像素坐标切成游戏里要用的单张图。手写 PNG 编解码（node 自带 zlib，
 * 无第三方依赖），只支持 8 位灰度/RGB/RGBA/调色板、非隔行的 PNG。
 *
 * 用法：
 *   node scripts/tests/png-crop.mjs <输入.png> <输出.png> <x,y,w,h> [目标宽] [目标高]
 *
 * 给了目标尺寸就缩放，不给就**保持原像素**：
 *  - 只给宽 → 等比缩放
 *  - 宽高都给 → 按给定的宽高（**可能轻微变形**；卡牌统一到 531×803 时用这个，
 *    因为素材的原始比例和游戏里的牌面比例差 1% 以内，强行等比反而尺寸不齐）
 * 缩放用面积平均，比最近邻干净得多（卡牌缩小时文字不会碎）。
 */
import { readFileSync, mkdirSync, writeFileSync } from 'node:fs';
import { deflateSync, inflateSync } from 'node:zlib';
import path from 'node:path';

/* --------------------------------------------------------- 解码 ---- */
export function decodePng(buf) {
  if (buf.readUInt32BE(0) !== 0x89504e47) throw new Error('不是 PNG');
  let pos = 8;
  let w = 0;
  let h = 0;
  let depth = 8;
  let colorType = 6;
  let interlace = 0;
  let palette = null;
  let trns = null;
  const idat = [];
  while (pos < buf.length) {
    const len = buf.readUInt32BE(pos);
    const type = buf.toString('ascii', pos + 4, pos + 8);
    const data = buf.subarray(pos + 8, pos + 8 + len);
    if (type === 'IHDR') {
      w = data.readUInt32BE(0);
      h = data.readUInt32BE(4);
      depth = data[8];
      colorType = data[9];
      interlace = data[12];
    } else if (type === 'PLTE') palette = Buffer.from(data);
    else if (type === 'tRNS') trns = Buffer.from(data);
    else if (type === 'IDAT') idat.push(Buffer.from(data));
    else if (type === 'IEND') break;
    pos += 12 + len;
  }
  if (depth !== 8) throw new Error(`只支持 8 位 PNG，这张是 ${depth} 位`);
  if (interlace !== 0) throw new Error('不支持隔行扫描（Adam7）的 PNG');
  const channels = { 0: 1, 2: 3, 3: 1, 4: 2, 6: 4 }[colorType];
  if (!channels) throw new Error(`不支持的颜色类型 ${colorType}`);

  const raw = inflateSync(Buffer.concat(idat));
  const stride = w * channels;
  const out = Buffer.alloc(h * stride);
  let rp = 0;
  for (let y = 0; y < h; y += 1) {
    const filter = raw[rp];
    rp += 1;
    const line = raw.subarray(rp, rp + stride);
    rp += stride;
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
        const pa = Math.abs(p - a);
        const pb = Math.abs(p - b);
        const pc = Math.abs(p - c);
        v += pa <= pb && pa <= pc ? a : pb <= pc ? b : c;
      }
      cur[i] = v & 0xff;
    }
  }

  const rgba = Buffer.alloc(w * h * 4);
  for (let i = 0; i < w * h; i += 1) {
    let r;
    let g;
    let b;
    let a = 255;
    const s = i * channels;
    if (colorType === 0) [r, g, b] = [out[s], out[s], out[s]];
    else if (colorType === 4) [r, g, b, a] = [out[s], out[s], out[s], out[s + 1]];
    else if (colorType === 2) [r, g, b] = [out[s], out[s + 1], out[s + 2]];
    else if (colorType === 6) [r, g, b, a] = [out[s], out[s + 1], out[s + 2], out[s + 3]];
    else {
      const idx = out[s];
      r = palette[idx * 3];
      g = palette[idx * 3 + 1];
      b = palette[idx * 3 + 2];
      if (trns && idx < trns.length) a = trns[idx];
    }
    const d = i * 4;
    rgba[d] = r;
    rgba[d + 1] = g;
    rgba[d + 2] = b;
    rgba[d + 3] = a;
  }
  return { w, h, rgba };
}

/* --------------------------------------------------------- 编码 ---- */
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

export function encodePng(w, h, rgba) {
  const stride = w * 4;
  const raw = Buffer.alloc(h * (stride + 1));
  for (let y = 0; y < h; y += 1) {
    raw[y * (stride + 1)] = 0;
    rgba.copy(raw, y * (stride + 1) + 1, y * stride, (y + 1) * stride);
  }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(w, 0);
  ihdr.writeUInt32BE(h, 4);
  ihdr[8] = 8;
  ihdr[9] = 6;
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr),
    chunk('IDAT', deflateSync(raw, { level: 9 })),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

/* ------------------------------------------------------- 裁切/缩放 ---- */
/**
 * 裁切 + （可选）缩放。
 * 缩放用**面积平均**（每个目标像素取对应源区域的平均），缩小时不会出现锯齿。
 * `targetW` 单独给就等比缩放；`targetH` 也给就按给定宽高（允许轻微变形）。
 */
export function cropScale(img, box, targetW = null, targetH = null) {
  const outW = targetW ? Math.round(targetW) : box.w;
  const outH = targetH ? Math.round(targetH) : (targetW ? Math.round(box.h * (targetW / box.w)) : box.h);
  const out = Buffer.alloc(outW * outH * 4);
  for (let y = 0; y < outH; y += 1) {
    for (let x = 0; x < outW; x += 1) {
      const sx0 = box.x + Math.floor((x * box.w) / outW);
      const sx1 = Math.max(sx0 + 1, box.x + Math.floor(((x + 1) * box.w) / outW));
      const sy0 = box.y + Math.floor((y * box.h) / outH);
      const sy1 = Math.max(sy0 + 1, box.y + Math.floor(((y + 1) * box.h) / outH));
      let r = 0;
      let g = 0;
      let b = 0;
      let a = 0;
      let n = 0;
      for (let sy = sy0; sy < Math.min(sy1, img.h); sy += 1) {
        for (let sx = sx0; sx < Math.min(sx1, img.w); sx += 1) {
          const i = (sy * img.w + sx) * 4;
          r += img.rgba[i];
          g += img.rgba[i + 1];
          b += img.rgba[i + 2];
          a += img.rgba[i + 3];
          n += 1;
        }
      }
      const d = (y * outW + x) * 4;
      if (n === 0) continue;
      out[d] = Math.round(r / n);
      out[d + 1] = Math.round(g / n);
      out[d + 2] = Math.round(b / n);
      out[d + 3] = Math.round(a / n);
    }
  }
  return { w: outW, h: outH, rgba: out };
}

/* ------------------------------------------------------------- CLI ---- */
const isMain = process.argv[1] && path.resolve(process.argv[1]) === path.resolve(new URL(import.meta.url).pathname.replace(/^\//, ''));
if (isMain || process.argv[1]?.endsWith('png-crop.mjs')) {
  const [src, dst, boxArg, targetWArg, targetHArg] = process.argv.slice(2);
  if (!src || !dst || !boxArg) {
    console.error('用法：node scripts/tests/png-crop.mjs <输入.png> <输出.png> <x,y,w,h> [目标宽] [目标高]');
    process.exit(2);
  }
  const [x, y, w, h] = boxArg.split(',').map(Number);
  if (![x, y, w, h].every(Number.isFinite)) {
    console.error('裁切框要写成 x,y,w,h');
    process.exit(2);
  }
  const img = decodePng(readFileSync(src));
  const out = cropScale(
    img,
    { x, y, w, h },
    targetWArg ? Number(targetWArg) : null,
    targetHArg ? Number(targetHArg) : null,
  );
  mkdirSync(path.dirname(dst), { recursive: true });
  const png = encodePng(out.w, out.h, out.rgba);
  writeFileSync(dst, png);
  console.log(`${src} → ${dst}  ${out.w}×${out.h}  ${(png.length / 1024).toFixed(1)} KB`);
}
