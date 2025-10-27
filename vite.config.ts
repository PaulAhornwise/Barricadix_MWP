
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
      CESIUM_BASE_URL: JSON.stringify('/cesium'),
      // DZ NRW 3D endpoints
      'import.meta.env.VITE_DZNRW_3DTILES_URL': JSON.stringify(env.VITE_DZNRW_3DTILES_URL),
      'import.meta.env.VITE_DZNRW_SCENE_URL': JSON.stringify(env.VITE_DZNRW_SCENE_URL),
      'import.meta.env.VITE_CESIUM_ION_TOKEN': JSON.stringify(env.VITE_CESIUM_ION_TOKEN),
    },
    resolve: {
      alias: {
        '@': path.resolve(__dirname, '.'),
      },
    },
    server: {
      proxy: {
        '/dz-nrw/i3s': {
          target: 'https://www.gis.nrw.de',
          changeOrigin: true,
          secure: true,
          configure: (proxy) => {
            proxy.on('proxyReq', (proxyReq, req) => {
              const full = new URL(req.url!, 'http://localhost');
              const upstream = full.searchParams.get('url');
              if (upstream) {
                const u = new URL(upstream);
                proxyReq.setHeader('host', u.host);
                (proxyReq as any).path = u.pathname + (u.search || '');
                (proxyReq as any).protocol = u.protocol;
                (proxyReq as any).host = u.host;
                const range = req.headers['range']; if (range) proxyReq.setHeader('range', range as string);
              }
            });
            proxy.on('proxyRes', (proxyRes) => {
              proxyRes.headers['access-control-allow-origin'] = '*';
              const loc = proxyRes.headers['location'];
              if (loc) {
                try {
                  const u = new URL(Array.isArray(loc) ? loc[0] : loc);
                  proxyRes.headers['location'] = `/dz-nrw/i3s?url=${encodeURIComponent(u.toString())}`;
                } catch {}
              }
            });
          },
          selfHandleResponse: false
        },
        '/xyz': {
          target: 'https://tile.openstreetmap.org',
          changeOrigin: true,
          secure: true,
          configure: (proxy) => {
            proxy.on('proxyRes', (proxyRes) => {
              proxyRes.headers['access-control-allow-origin'] = '*';
              proxyRes.headers['cache-control'] = 'public, max-age=86400';
            });
          },
          selfHandleResponse: false
        }
      }
    }
  };
});
