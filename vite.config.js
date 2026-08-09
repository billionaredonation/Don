import { defineConfig } from 'vite';

const BUILD_ID = String(
  process.env.GITHUB_SHA ||
  process.env.VITE_BUILD_ID ||
  Date.now()
).slice(0, 40);

function buildSynchronizationPlugin() {
  return {
    name: 'mn-build-synchronization',
    transformIndexHtml(html) {
      return html.replaceAll('__MN_BUILD_ID__', BUILD_ID);
    },
    generateBundle() {
      this.emitFile({
        type: 'asset',
        fileName: 'mn-build.json',
        source: JSON.stringify({ buildId: BUILD_ID }),
      });
    },
  };
}

export default defineConfig({
  root: '.',
  base: '/Don/',
  plugins: [buildSynchronizationPlugin()],
  build: {
    outDir: 'dist',
    emptyOutDir: true,
  },
});
