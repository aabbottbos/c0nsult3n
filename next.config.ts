import type { NextConfig } from 'next'
import path from 'path'

const nextConfig: NextConfig = {
  webpack(config) {
    config.resolve.alias['@/app/generated/prisma'] = path.resolve(__dirname, 'app/generated/prisma/client.ts')
    return config
  },
}

export default nextConfig
