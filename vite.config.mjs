import { readdirSync } from 'node:fs';
import { extname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vite';

/* O site tem 7 páginas HTML independentes; todas entram no build como
 * entradas (multi-page), preservando a pasta `guia/` no `dist/`. */
const root = fileURLToPath(new URL('.', import.meta.url));
const guiaDir = resolve(root, 'guia');
const guiaPages = readdirSync(guiaDir)
  .filter((file) => extname(file) === '.html')
  .map((file) => resolve(guiaDir, file));

export default defineConfig({
  appType: 'mpa',
  build: {
    outDir: 'dist',
    emptyOutDir: true,
    /* sem polyfill inline: o CSP do deploy usa script-src 'self' */
    modulePreload: { polyfill: false },
    rollupOptions: {
      input: [
        resolve(root, 'index.html'),
        resolve(root, 'visualizador.html'),
        ...guiaPages
      ]
    }
  }
});
