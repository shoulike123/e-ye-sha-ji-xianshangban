/**
 * 工具页共用的纯函数。
 *
 * 四个调试台（map-calibrate / map-debug / ui-debug / ui-layout）原本各自复制了一份
 * `clamp` / `round1` / `hexToRgba` / 坐标换算 / `markDirty` / `setStatus`。
 * 任一侧改动不同步，就会出现「校准页看着对、游戏里不对」，所以集中到这里。
 *
 * 加载方式：经典 `<script src="../shared/util.js"></script>`（不用 ES module，
 * 这样不依赖 `type="module"`，也不会因为加载顺序出错）。
 * 页面里在业务脚本**之前**引这一行即可。
 *
 * 注意：这里只放**与本项目规则无关的纯函数**（数学、取色、DOM 读写）。
 * 规则相关的换算（房间邻接、门号解析）仍归 `client/src` 与 `server/`。
 */
(function (global) {
  'use strict';

  /** 夹到 [a, b] 区间 */
  function clamp(n, a, b) {
    return Math.min(b, Math.max(a, n));
  }

  /** 保留 1 位小数（数字） */
  function round1(n) {
    return Math.round(n * 10) / 10;
  }

  /**
   * `#rgb` / `#rrggbb` → `rgba(r,g,b,a)`。
   * `hex` 为空时按白色处理（map-debug 那版写死了 `hex.replace`，
   * 传 undefined 会直接抛错，这里统一成容错版）。
   */
  function hexToRgba(hex, alpha) {
    const h = String(hex || '#ffffff').replace('#', '');
    const full = h.length === 3 ? h.split('').map((c) => c + c).join('') : h;
    const n = parseInt(full, 16);
    if (!Number.isFinite(n)) return `rgba(255,255,255,${alpha})`;
    return `rgba(${(n >> 16) & 255},${(n >> 8) & 255},${n & 255},${alpha})`;
  }

  /**
   * 把鼠标的 client 坐标换算成**相对某个元素的百分比**（0–100）。
   * 校准页要的是地图像素坐标，用下面的 `clientToBox(el, x, y, w, h)`。
   */
  function clientToPct(el, clientX, clientY) {
    const rect = el.getBoundingClientRect();
    return {
      x: ((clientX - rect.left) / rect.width) * 100,
      y: ((clientY - rect.top) / rect.height) * 100,
    };
  }

  /** 把鼠标的 client 坐标换算成**相对某个元素、按给定宽高**的坐标（校准页用） */
  function clientToBox(el, clientX, clientY, boxW, boxH) {
    const rect = el.getBoundingClientRect();
    return {
      x: ((clientX - rect.left) / rect.width) * boxW,
      y: ((clientY - rect.top) / rect.height) * boxH,
    };
  }

  /** 输入框失焦后标脏（工具页统一「有改动」提示） */
  function markDirty(state, setStatus) {
    state.dirty = true;
    if (typeof setStatus === 'function') setStatus('有未保存的改动');
  }

  global.ToolUtil = {
    clamp: clamp,
    round1: round1,
    hexToRgba: hexToRgba,
    clientToPct: clientToPct,
    clientToBox: clientToBox,
    markDirty: markDirty,
  };
})(window);
