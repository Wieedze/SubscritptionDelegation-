/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_RPC_URL?: string;
  readonly VITE_BUNDLER_URL?: string;
  readonly VITE_PINATA_JWT?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
