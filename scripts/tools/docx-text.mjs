/**
 * 把 .docx 里的正文抽成纯文本（只用 Node 自带的 zlib，不装任何依赖）。
 *
 * docx 本质是个 zip：正文在 `word/document.xml`。
 * 这里按 zip 的"中央目录"找到那一条，inflate 出来，再把 XML 标签剥掉、
 * 把 `</w:p>` 换成换行 —— 够用来核对了。
 *
 * 跑法：node scripts/tools/docx-text.mjs <文件.docx> [输出.txt]
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { inflateRawSync } from 'node:zlib';

const file = process.argv[2];
if (!file) {
  console.error('用法：node scripts/tools/docx-text.mjs <文件.docx> [输出.txt]');
  process.exit(2);
}

const buf = readFileSync(file);

/** 在中央目录里找某个名字的条目，返回它在文件里的偏移和压缩后长度 */
function findEntry(name) {
  // 从尾部往前找 End of Central Directory（签名 0x06054b50）
  let eocd = -1;
  for (let i = buf.length - 22; i >= 0 && i > buf.length - 22 - 65536; i--) {
    if (buf.readUInt32LE(i) === 0x06054b50) { eocd = i; break; }
  }
  if (eocd < 0) throw new Error('不是 zip（找不到中央目录结尾）');
  const count = buf.readUInt16LE(eocd + 10);
  let off = buf.readUInt32LE(eocd + 16);
  for (let i = 0; i < count; i++) {
    const nameLen = buf.readUInt16LE(off + 28);
    const extraLen = buf.readUInt16LE(off + 30);
    const commentLen = buf.readUInt16LE(off + 32);
    const localOff = buf.readUInt32LE(off + 42);
    const entryName = buf.toString('utf8', off + 46, off + 46 + nameLen);
    if (entryName === name) {
      // 本地头：30 字节固定 + 文件名 + 扩展区，之后才是数据
      const lNameLen = buf.readUInt16LE(localOff + 26);
      const lExtraLen = buf.readUInt16LE(localOff + 28);
      const method = buf.readUInt16LE(localOff + 8);
      const size = buf.readUInt32LE(off + 20);
      const start = localOff + 30 + lNameLen + lExtraLen;
      const raw = buf.subarray(start, start + size);
      return method === 0 ? raw : inflateRawSync(raw);
    }
    off += 46 + nameLen + extraLen + commentLen;
  }
  return null;
}

const xmlBuf = findEntry('word/document.xml');
if (!xmlBuf) throw new Error('这个 docx 里没有 word/document.xml');

let xml = xmlBuf.toString('utf8');
/** 表格单元格当成一列，制表符隔开；段落换行 */
xml = xml
  .replace(/<w:tab\b[^>]*\/>/g, '\t')
  .replace(/<w:br\b[^>]*\/>/g, '\n')
  .replace(/<\/w:tc>/g, '\t')
  .replace(/<\/w:tr>/g, '\n')
  .replace(/<\/w:p>/g, '\n');
xml = xml.replace(/<[^>]+>/g, '');
xml = xml
  .replace(/&lt;/g, '<')
  .replace(/&gt;/g, '>')
  .replace(/&quot;/g, '"')
  .replace(/&apos;/g, "'")
  .replace(/&amp;/g, '&');
const text = xml
  .split('\n')
  .map((line) => line.replace(/[ \t]+$/g, ''))
  .join('\n')
  .replace(/\n{3,}/g, '\n\n')
  .trim();

if (process.argv[3]) {
  writeFileSync(process.argv[3], text, 'utf8');
  console.log(`写好 ${process.argv[3]}（${text.length} 字）`);
} else {
  console.log(text);
}
