import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  // 이미지 최적화 기능은 사용하지 않음 (보안 표면 축소)
  images: { unoptimized: true },
  poweredByHeader: false,
  webpack: (config) => {
    // pdf.js 가 서버용으로 찾는 canvas 모듈을 무시
    config.resolve.alias.canvas = false;
    return config;
  },
  async headers() {
    return [
      {
        source: '/:path*',
        headers: [
          { key: 'X-Frame-Options', value: 'DENY' },
          { key: 'X-Content-Type-Options', value: 'nosniff' },
          { key: 'Referrer-Policy', value: 'no-referrer' },
        ],
      },
    ];
  },
};

export default nextConfig;
