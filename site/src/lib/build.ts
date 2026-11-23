/** Build-time numbers injected by vite.config.ts `define`. */
export const BUILD: { version: string; iifeKb: string; gzipKb: string; stars: number | null } =
  typeof __BUILD__ === 'object' && __BUILD__ !== null
    ? __BUILD__
    : { version: '0.2.0-beta.1', iifeKb: '?', gzipKb: '?', stars: null }

export const INSTALL_CMD = 'npm install palletface@beta'
