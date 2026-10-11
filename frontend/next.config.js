const withPWA = require('next-pwa')({
  dest: 'public',
  register: true,
  skipWaiting: true,
  disable: process.env.NODE_ENV === 'development',
  cacheStartUrl: false,
  // No API, administrative data, availability or payment state in offline caches.
  runtimeCaching: [{ urlPattern: /^https?:\/\//, handler: 'NetworkOnly' }],
});
module.exports = withPWA({ reactStrictMode: true });
