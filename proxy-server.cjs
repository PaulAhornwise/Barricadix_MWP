const express = require('express');
const { createProxyMiddleware } = require('http-proxy-middleware');
const cors = require('cors');

const app = express();
const PORT = 3001;

// CORS für alle Routen aktivieren
app.use(cors({
  origin: ['http://localhost:5173', 'http://localhost:3000', 'http://127.0.0.1:5173'],
  credentials: true
}));

// ============================================================
// NRW WFS Proxy für Straßennetzwerk-Daten (INSPIRE ATKIS)
// Dies ist der kritische Proxy, der die Zufahrtsanalyse ermöglicht
// Matching the working main.py: http://www.wfs.nrw.de/geobasis/wfs_nw_inspire-verkehrsnetze_atkis-basis-dlm
// ============================================================
app.use('/nrw-wfs', createProxyMiddleware({
  target: 'http://www.wfs.nrw.de',
  changeOrigin: true,
  pathRewrite: {
    '^/nrw-wfs': '/geobasis/wfs_nw_inspire-verkehrsnetze_atkis-basis-dlm'
  },
  onProxyReq: (proxyReq, req, res) => {
    console.log('🛣️ NRW WFS Request:', req.url);
    // Log the query parameters for debugging
    const url = new URL(req.url, `http://localhost:${PORT}`);
    const layer = url.searchParams.get('typeNames') || url.searchParams.get('typeName');
    const bbox = url.searchParams.get('bbox');
    if (layer) console.log(`   Layer: ${layer}`);
    if (bbox) console.log(`   BBOX: ${bbox.substring(0, 50)}...`);
  },
  onProxyRes: (proxyRes, req, res) => {
    const contentType = proxyRes.headers['content-type'] || '';
    console.log(`✅ NRW WFS Response: ${proxyRes.statusCode} (${contentType.split(';')[0]})`);
  },
  onError: (err, req, res) => {
    console.error('❌ NRW WFS Proxy error:', err.message);
    res.status(500).json({ error: 'WFS Proxy error', details: err.message });
  }
}));

// Alternative WFS endpoint (HTTPS version, falls HTTP nicht erreichbar)
app.use('/nrw-wfs-secure', createProxyMiddleware({
  target: 'https://www.wfs.nrw.de',
  changeOrigin: true,
  secure: true,
  pathRewrite: {
    '^/nrw-wfs-secure': '/geobasis/wfs_nw_inspire-verkehrsnetze_atkis-basis-dlm'
  },
  onProxyReq: (proxyReq, req, res) => {
    console.log('🛣️ NRW WFS (HTTPS) Request:', req.url);
  },
  onError: (err, req, res) => {
    console.error('❌ NRW WFS (HTTPS) Proxy error:', err.message);
    res.status(500).json({ error: 'WFS Proxy error', details: err.message });
  }
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

// Health check mit erweitertem Status
app.get('/health', async (req, res) => {
  const status = {
    status: 'OK',
    message: 'NRW Proxy Server running',
    endpoints: {
      wfs: '/nrw-wfs',
      wfsSecure: '/nrw-wfs-secure',
      tiles3d: '/dz-nrw-3d-tiles',
      scene: '/dz-nrw-scene'
    },
    timestamp: new Date().toISOString()
  };
  res.json(status);
});

// WFS Test-Endpoint
app.get('/test-wfs', async (req, res) => {
  try {
    const testUrl = 'http://www.wfs.nrw.de/geobasis/wfs_nw_inspire-verkehrsnetze_atkis-basis-dlm?service=WFS&request=GetCapabilities';
    console.log('🧪 Testing WFS connectivity...');
    
    const response = await fetch(testUrl, { timeout: 10000 });
    
    res.json({
      reachable: response.ok,
      status: response.status,
      contentType: response.headers.get('content-type'),
      message: response.ok ? 'WFS service is reachable' : 'WFS service returned error'
    });
  } catch (error) {
    res.status(500).json({
      reachable: false,
      error: error.message,
      message: 'Could not reach NRW WFS service'
    });
  }
});

app.listen(PORT, () => {
  console.log(`🚀 NRW Proxy Server running on http://localhost:${PORT}`);
  console.log('');
  console.log('📡 Available Endpoints:');
  console.log(`   WFS (ATKIS):    http://localhost:${PORT}/nrw-wfs`);
  console.log(`   WFS (HTTPS):    http://localhost:${PORT}/nrw-wfs-secure`);
  console.log(`   3D Tiles:       http://localhost:${PORT}/dz-nrw-3d-tiles/tileset.json`);
  console.log(`   SceneServer:    http://localhost:${PORT}/dz-nrw-scene`);
  console.log(`   Health:         http://localhost:${PORT}/health`);
  console.log(`   Test WFS:       http://localhost:${PORT}/test-wfs`);
  console.log('');
  console.log('💡 Die WFS-Proxy-Route ist kritisch für die Zufahrtsanalyse!');
});


