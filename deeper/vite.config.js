import { defineConfig } from 'vite';
import { viteSingleFile } from 'vite-plugin-singlefile';
import { resolve } from 'node:path';

/* Two build shapes (deeper.html IS the shipping game):
   - `npm run build`        -> dist/ with the deeper.html game
   - `npm run build:single` -> dist-single/deeper.html as ONE self-contained file
                               (aggregator demos / send-as-attachment; fonts stay a CDN link)
   tuner.html is dev-only and deliberately NOT a build input. */
export default defineConfig(({ mode }) => {
  if (mode === 'single') {
    return {
      base: './',
      plugins: [viteSingleFile()],
      build: {
        outDir: 'dist-single',
        rollupOptions: { input: resolve(import.meta.dirname, 'deeper.html') },
      },
    };
  }
  return {
    base: './',
    build: {
      outDir: 'dist',
      rollupOptions: {
        input: { game: resolve(import.meta.dirname, 'deeper.html') },
      },
    },
  };
});
