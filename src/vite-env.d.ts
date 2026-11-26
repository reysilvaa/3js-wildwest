/// <reference types="vite/client" />

declare const __BUILD_ID__: string;

interface ImportMetaEnv {
  readonly VITE_AI_API_URL: string;
  readonly VITE_AI_API_KEY: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
