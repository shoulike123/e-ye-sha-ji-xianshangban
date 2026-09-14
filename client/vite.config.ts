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
        fs.createReadStream(target).pipe(res);
      });
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
