/** @type {import('next').NextConfig} */
const nextConfig = {
  allowedDevOrigins: ["192.168.1.46", "103.132.96.120:5000"],

  async rewrites() {
    const BACKEND_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:5000';
    return [
      {
        source: '/api/proxy/:path*',
        destination: `${BACKEND_URL}/api/:path*`,
      },
    ];
  },

};

module.exports = nextConfig;