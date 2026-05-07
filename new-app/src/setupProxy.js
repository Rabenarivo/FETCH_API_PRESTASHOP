const { createProxyMiddleware } = require('http-proxy-middleware');

module.exports = function(app) {
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
      onError: (err, req, res) => {
        console.error('Proxy error:', err);
        res.status(500).json({ error: 'Proxy error' });
      }
    })
  );
};
