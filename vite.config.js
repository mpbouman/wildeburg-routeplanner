import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

export default defineConfig({
  plugins: [react()],
  base: './',
  // Build naar docs/ zodat GitHub Pages direct vanaf de main-branch kan
  // serveren (Pages-bron: main, map /docs).
  build: { outDir: 'docs' },
  // Cache buiten de Dropbox-map: voorkomt EBUSY-fouten doordat Dropbox
  // bestanden in node_modules/.vite lockt tijdens het syncen.
  cacheDir: join(tmpdir(), 'vite-cache-wildeburg')
});
