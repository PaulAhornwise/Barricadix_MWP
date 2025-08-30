
import path from 'path';
import { defineConfig, loadEnv } from 'vite';

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, '.', '');
  const isProd = mode === 'production';
  return {
    base: isProd ? '/Barricadix_MWP/' : '/',
    build: {
      outDir: 'docs',
      emptyOutDir: true,
      minify: 'terser',
      terserOptions: {
        compress: {
          drop_console: isProd, // Remove console.log in production
          drop_debugger: true,
        },
      },
      rollupOptions: {
        input: {
          main: path.resolve(__dirname, 'index.html'),
        },
      },
      chunkSizeWarningLimit: 1000,
    },
    publicDir: 'public',
    assetsInclude: ['**/*.json'],
    define: {
      'process.env.API_KEY': JSON.stringify(env.GEMINI_API_KEY),
      'process.env.GEMINI_API_KEY': JSON.stringify(env.GEMINI_API_KEY),
    },
    resolve: {
      alias: {
        '@': path.resolve(__dirname, '.'),
      },
    },
  };
});
