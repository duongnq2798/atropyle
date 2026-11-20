/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_TARGET?: string;
  readonly VITE_CHAIN?: string;
  readonly VITE_DEPLOYMENT?: string;
  readonly VITE_WORKER_URL?: string;
  readonly VITE_TELEGRAM_BOT?: string;
  readonly VITE_DOCS_PATH?: string;
}

declare const __APP_VERSION__: string;
