const { createProxyMiddleware } = require('http-proxy-middleware');

module.exports = function(app) {
  // Proxy pour l'API Prestashop (lectures)
  app.use(
    '/evals',
    createProxyMiddleware({
      target: 'http://localhost',
      changeOrigin: true,
      pathRewrite: {
        '^/evals': '/evals',
      },
      onProxyReq: (proxyReq, req, res) => {
        // Add Authorization header with Basic Auth
        const token = process.env.REACT_APP_PRESTASHOP_API_TOKEN;
        if (token) {
          const credentials = `${token}:`;
          const encoded = Buffer.from(credentials).toString('base64');
          proxyReq.setHeader('Authorization', `Basic ${encoded}`);
        }
      },
      onProxyRes: (proxyRes, req, res) => {
        // Add CORS headers to responses
        res.header('Access-Control-Allow-Origin', 'http://localhost:3000');
        res.header('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
        res.header('Access-Control-Allow-Headers', 'Content-Type, Authorization');
        res.header('Access-Control-Allow-Credentials', 'true');
      },
      onError: (err, req, res) => {
        console.error('Proxy error (evals):', err);
        res.status(500).json({ error: 'Proxy error' });
      }
    })
  );

  // Proxy pour l'admin Prestashop (import)
  app.use(
    '/admin123',
    createProxyMiddleware({
      target: 'http://localhost/evals',
      changeOrigin: true,
      pathRewrite: {
        '^/admin123': '/admin123',
      },
      onProxyReq: (proxyReq, req, res) => {
        // Ajouter un referer artificiel pour passer la validation CSRF
        proxyReq.setHeader('Referer', 'http://localhost/evals/admin123/index.php');
        proxyReq.setHeader('Origin', 'http://localhost');
      },
      onProxyRes: (proxyRes, req, res) => {
        // Intercept redirects (301, 302) to prevent the browser from following them directly
        // and hitting CORS issues.
        if ([301, 302, 307, 308].includes(proxyRes.statusCode) && proxyRes.headers.location) {
           console.log('Intercepted redirect to:', proxyRes.headers.location);
        }
        res.header('Access-Control-Allow-Origin', 'http://localhost:3000');
        res.header('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
        res.header('Access-Control-Allow-Headers', 'Content-Type, Authorization, X-Requested-With');
        res.header('Access-Control-Allow-Credentials', 'true');
      },
      onError: (err, req, res) => {
        console.error('Proxy error (admin123):', err);
        res.status(500).json({ error: 'Proxy error' });
      }
    })
  );
};
