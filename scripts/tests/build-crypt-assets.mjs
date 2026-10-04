/**
 * 生成【墓穴】素材的**占位图** → `Image/UI/坍塌板块.png`、`Image/UI/遗物_*.png`、`Image/Relic/牌背.png`
 *
 * ⚠⚠ **这是生成器，不是测试！别把它塞进测试扫描里跑**（`npm run gen:crypt` 才是入口）。
 *
 * 血的教训：有一次"跑全部测试"的脚本把 `scripts/tests/*.mjs` 一股脑执行了，
 * 这个生成器就把用户**已经替换好的正式素材**又盖回了占位图
 * （表现是"坍塌位置/遗物标记的图片没加载出来"）。
 * 所以下面加了**覆盖保护**：目标已存在就拒绝写，除非显式带 `--force`。
 *
 * 为什么要有这个：地图/牌堆是按**固定文件名**去读图的，
 * 素材没到位时浏览器会显示破图（SVG `<image>` 甚至什么都不画），
 * 看起来像"功能没做"。先放一张"明显是占位图"的图顶着，
 * 等功能一上线就能看出位置对不对，用户把正式素材按同名覆盖掉即可。
 *
 * 尺寸按各自的比例定：
 *  - 坍塌板块 448×122 —— 和 `封堵.png`（421×123）同量级，宽高比约 3.67，
 *    贴到地图上时默认旋转 90 度
 *  - 遗物正/背面 460×660 —— 和搜索牌（`Image/Key/牌背1.png`）同比例
 *
 * 手写 PNG 编码（Node 自带 zlib，无第三方依赖）。
 */
import { existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { deflateSync } from 'node:zlib';

/** 这个脚本会覆盖的文件（**都是正式素材**，不是临时文件） */
const TARGETS = [
  'Image/UI/坍塌板块.png',
  'Image/UI/遗物_正面.png',
  'Image/UI/遗物_背面.png',
  'Image/Relic/牌背.png',
];
{
  const existing = TARGETS.filter((p) => existsSync(p));
  if (existing.length && !process.argv.includes('--force')) {
    console.error('⚠ 这些素材已经存在，**拒绝覆盖**（它们是正式素材，不是占位图）：');
    for (const p of existing) console.error(`   - ${p}`);
    console.error('确实要重新生成占位图，请显式加 --force：');
    console.error('   node scripts/tests/build-crypt-assets.mjs --force');
    process.exit(1);
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

function encodePng(w, h, rgba) {
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(w, 0);
  ihdr.writeUInt32BE(h, 4);
  ihdr[8] = 8;
  ihdr[9] = 6;
  const stride = w * 4;
  const raw = Buffer.alloc(h * (stride + 1));
  for (let y = 0; y < h; y += 1) {
    raw[y * (stride + 1)] = 0;
    rgba.copy(raw, y * (stride + 1) + 1, y * stride, (y + 1) * stride);
  }
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr),
    chunk('IDAT', deflateSync(raw, { level: 9 })),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

/** 画布：透明底 + 一个描边框 + 斜线填充（一眼看出是占位图） */
function placeholder(w, h, [r, g, b], border = 6) {
  const buf = Buffer.alloc(w * h * 4);
  const put = (x, y, cr, cg, cb, ca) => {
    if (x < 0 || y < 0 || x >= w || y >= h) return;
    const i = (y * w + x) * 4;
    buf[i] = cr;
    buf[i + 1] = cg;
    buf[i + 2] = cb;
    buf[i + 3] = ca;
  };
  /** 淡色斜纹 */
  for (let y = 0; y < h; y += 1) {
    for (let x = 0; x < w; x += 1) {
      const band = ((x + y) % 26) < 13;
      put(x, y, r, g, b, band ? 110 : 55);
    }
  }
  /** 边框 */
  for (let y = 0; y < h; y += 1) {
    for (let x = 0; x < w; x += 1) {
      if (x < border || y < border || x >= w - border || y >= h - border) {
        /** 外圈深、内圈亮，做出"描边"的感觉 */
        const outer = x < 2 || y < 2 || x >= w - 2 || y >= h - 2;
        put(x, y, outer ? 20 : 240, outer ? 20 : 240, outer ? 24 : 236, 235);
      }
    }
  }
  return encodePng(w, h, buf);
}

mkdirSync('Image/UI', { recursive: true });
mkdirSync('Image/Relic', { recursive: true });

/** ① 坍塌板块（暖灰碎石色） */
const plate = placeholder(448, 122, [150, 140, 128]);
writeFileSync('Image/UI/坍塌板块.png', plate);
console.log(`Image/UI/坍塌板块.png  448×122  ${(plate.length / 1024).toFixed(1)} KB`);

/** ② 遗物标记：正面（紫金） / 背面（深紫） */
const front = placeholder(460, 660, [150, 105, 210]);
writeFileSync('Image/UI/遗物_正面.png', front);
console.log(`Image/UI/遗物_正面.png  460×660  ${(front.length / 1024).toFixed(1)} KB`);

const back = placeholder(460, 660, [92, 66, 132]);
writeFileSync('Image/UI/遗物_背面.png', back);
console.log(`Image/UI/遗物_背面.png  460×660  ${(back.length / 1024).toFixed(1)} KB`);

/** ③ 遗物牌堆的牌背（和背面同款，方便一眼看出是遗物） */
const deckBack = placeholder(460, 660, [92, 66, 132], 10);
writeFileSync('Image/Relic/牌背.png', deckBack);
console.log(`Image/Relic/牌背.png  460×660  ${(deckBack.length / 1024).toFixed(1)} KB`);
