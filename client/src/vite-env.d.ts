/// <reference types="vite/client" />

/** 可选：指定对讲机连哪台服务器。空着就连当前网页同一个地址 */
interface ImportMetaEnv {
  readonly VITE_SOCKET_URL?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
