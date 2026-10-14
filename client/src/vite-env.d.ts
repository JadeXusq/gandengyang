/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_WS: string | undefined;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
