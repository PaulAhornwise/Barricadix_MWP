const express = require('express');
const { createProxyMiddleware } = require('http-proxy-middleware');
const cors = require('cors');

const app = express();
const PORT = 3001;

// CORS für alle Routen aktivieren
app.use(cors({
  origin: ['http://localhost:5173', 'http://localhost:3000'],
  credentials: true
}));

// Proxy für DZ NRW 3D Tiles
app.use('/dz-nrw-3d-tiles', createProxyMiddleware({
  target: 'https://www.opengeodata.nrw.de',
  changeOrigin: true,
  pathRewrite: {
    '^/dz-nrw-3d-tiles': '/produkte/geobasis/lika/dz_nrw/3d_tiles'
  },
  onProxyReq: (proxyReq, req, res) => {
    console.log('🔄 Proxying 3D Tiles request:', req.url);
  },
  onError: (err, req, res) => {
    console.error('❌ Proxy error:', err.message);
    res.status(500).json({ error: 'Proxy error', details: err.message });
  }
}));

// Proxy für DZ NRW SceneServer
app.use('/dz-nrw-scene', createProxyMiddleware({
  target: 'https://www.opengeodata.nrw.de',
  changeOrigin: true,
  pathRewrite: {
    '^/dz-nrw-scene': '/produkte/geobasis/lika/dz_nrw/scene_server/rest/services/3D/SceneServer'
  },
  onProxyReq: (proxyReq, req, res) => {
    console.log('🔄 Proxying SceneServer request:', req.url);
  },
  onError: (err, req, res) => {
    console.error('❌ Proxy error:', err.message);
    res.status(500).json({ error: 'Proxy error', details: err.message });
  }
}));

// Health check
app.get('/health', (req, res) => {
  res.json({ status: 'OK', message: 'DZ NRW Proxy Server running' });
});

app.listen(PORT, () => {
  console.log(`🚀 DZ NRW Proxy Server running on http://localhost:${PORT}`);
  console.log(`📡 3D Tiles: http://localhost:${PORT}/dz-nrw-3d-tiles/tileset.json`);
  console.log(`📡 SceneServer: http://localhost:${PORT}/dz-nrw-scene`);
});


