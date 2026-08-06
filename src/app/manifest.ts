import type { MetadataRoute } from 'next'

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: 'ZARA - AI Assistant',
    short_name: 'ZARA',
    description: 'Your personal JARVIS-like AI assistant with voice, vision, and agentic capabilities',
    start_url: '/',
    display: 'standalone',
    background_color: '#050810',
    theme_color: '#00e8ff',
    orientation: 'any',
    icons: [
      { src: '/icon-192.png', sizes: '192x192', type: 'image/png' },
      { src: '/icon-512.png', sizes: '512x512', type: 'image/png' },
    ],
  }
}