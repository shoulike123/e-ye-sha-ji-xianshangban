/**
 * 网页开发服务器怎么开：
 * - 端口 5173，允许局域网 / Radmin 用 IP 访问
 * - /api 和 /socket.io 转给真正的规则服务器 8787
 * - /Image 直接从项目里的图片文件夹拿图
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import react from '@vitejs/plugin-react';
import { defineConfig, type Plugin } from 'vite';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.resolve(__dirname, '..');

const MIME: Record<string, string> = {
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.webp': 'image/webp',
  '.gif': 'image/gif',
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.svg': 'image/svg+xml',
};

/** 让浏览器访问 /Image/xxx 时，读到项目里的图片文件 */
function serveFolder(urlPrefix: string, dir: string): Plugin {
  const root = path.resolve(dir);
  return {
    name: `serve-${urlPrefix}`,
    configureServer(server) {
      server.middlewares.use(urlPrefix, (req, res, next) => {
        const raw = decodeURIComponent((req.url ?? '/').split('?')[0]);
        const rel = raw.replace(/^\/+/, '');
        const file = path.resolve(root, rel || 'index.html');
        const relToRoot = path.relative(root, file);
        if (relToRoot.startsWith('..') || path.isAbsolute(relToRoot)) return next();
        const target =
          fs.existsSync(file) && fs.statSync(file).isFile()
            ? file
            : rel === '' && fs.existsSync(path.join(root, 'index.html'))
              ? path.join(root, 'index.html')
              : null;
        if (!target) return next();
        res.setHeader(
          'Content-Type',
          MIME[path.extname(target).toLowerCase()] ?? 'application/octet-stream',
        );
        /**
         * ⚠ 这里原本**什么缓存头都不设** —— 浏览器没有 ETag 可问，
         * 于是每刷新一次页面，那几张几十 MB 的地图底图就**整张重新下载**一遍，
         * 同学那边自然卡。
         *
         * 现在给 ETag + 长缓存：正常情况下浏览器直接用本地副本，
         * 图片真换了（`Ctrl+F5` 强制刷新）才会重新拿。
         */
        const st = fs.statSync(target);
        const etag = `W/"${st.size}-${Math.round(st.mtimeMs)}"`;
        res.setHeader('Cache-Control', 'public, max-age=604800');
        res.setHeader('ETag', etag);
        if (req.headers['if-none-match'] === etag) {
          res.statusCode = 304;
          res.end();
          return;
        }
        fs.createReadStream(target).pipe(res);
      });
    },
  };
}

/**
 * 构建时把仓库根目录的 `Image/` 放进 `dist/Image`。
 *
 * 为什么需要：`serveFolder('/Image', ...)` 只在 **dev** 生效，
 * 构建产物 `client/dist` 里原本**没有**任何图片 ——
 * 直接拿 dist 部署会满屏破图，必须另外想办法提供 `Image/`。
 * 这里让构建产物自带一份，dist 就是完整可部署的。
 *
 * 优先用**硬链接**（同在项目盘符上时瞬间完成，且不额外占磁盘）；
 * 跨盘或权限不允许时回退到普通复制。
 */
function copyImagesToDist(): Plugin {
  const src = path.join(projectRoot, 'Image');
  let outDir = 'dist';
  return {
    name: 'copy-images-to-dist',
    apply: 'build',
    configResolved(cfg) {
      outDir = cfg.build.outDir;
    },
    closeBundle() {
      if (!fs.existsSync(src)) return;
      const dest = path.resolve(__dirname, outDir, 'Image');
      let linked = 0;
      let copied = 0;

      const walk = (from: string, to: string) => {
        fs.mkdirSync(to, { recursive: true });
        for (const entry of fs.readdirSync(from, { withFileTypes: true })) {
          const f = path.join(from, entry.name);
          const t = path.join(to, entry.name);
          if (entry.isDirectory()) {
            walk(f, t);
            continue;
          }
          if (!entry.isFile()) continue;
          try {
            fs.rmSync(t, { force: true });
          } catch {
            /* 目标不存在就不用删 */
          }
          try {
            fs.linkSync(f, t);
            linked++;
          } catch {
            fs.copyFileSync(f, t);
            copied++;
          }
        }
      };

      walk(src, dest);
      this.info?.(`Image/ → ${path.relative(projectRoot, dest)}（硬链接 ${linked}、复制 ${copied}）`);
    },
  };
}

export default defineConfig({
  plugins: [
    react(),
    serveFolder('/Image', path.join(projectRoot, 'Image')),
    serveFolder('/map-debug', path.join(projectRoot, 'tools/map-debug')),
    serveFolder('/map-calibrate', path.join(projectRoot, 'tools/map-calibrate')),
    serveFolder('/ui-debug', path.join(projectRoot, 'tools/ui-debug')),
    serveFolder('/ui-layout', path.join(projectRoot, 'tools/ui-layout')),
    serveFolder('/shared', path.join(projectRoot, 'tools/shared')),
    copyImagesToDist(),
  ],
  server: {
    host: true,
    port: 5173,
    strictPort: true,
    // 异地隧道（Cloudflare / cpolar 等）会用临时域名访问，必须放行
    allowedHosts: true,
    proxy: {
      '/api': 'http://127.0.0.1:8787',
      '/socket.io': {
        target: 'http://127.0.0.1:8787',
        ws: true,
      },
    },
  },
});
