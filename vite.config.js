import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { createReadStream, existsSync } from 'node:fs'
import { stat } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'
import { join } from 'node:path'

const clipDirectory = fileURLToPath(new URL('../.cache/hf-clip/', import.meta.url))
const framesDirectory = fileURLToPath(new URL('./public/frames/', import.meta.url))
const localClipPrefix = '/__local_clip/'
const localFramesPrefix = '/__local_frames/'

function localFilePlugin({ root, prefix, manifestPath, matcher }) {
  return {
    name: `local-files-${prefix.replaceAll('/', '')}`,
    apply: 'serve',
    configureServer(server) {
      if (!manifestPath) return
      server.middlewares.use(async (req, res, next) => {
        if (!req.url?.startsWith(prefix)) return next()
        const relative = req.url.slice(prefix.length).split('?')[0]
        if (!matcher.test(relative)) {
          res.statusCode = 404
          return res.end()
        }
        if (!['GET', 'HEAD'].includes(req.method)) {
          res.statusCode = 405
          return res.end()
        }
        const path = join(root, relative)
        try {
          const info = await stat(path)
          res.setHeader('Content-Length', info.size)
          res.setHeader('Content-Type', relative.endsWith('.json') ? 'application/json' : 'application/octet-stream')
          res.setHeader('Cache-Control', relative === 'manifest.json' ? 'no-cache' : 'public, max-age=3600')
          if (req.method === 'HEAD') return res.end()
          const stream = createReadStream(path)
          stream.on('error', () => res.destroy())
          res.on('close', () => stream.destroy())
          stream.pipe(res)
        } catch {
          res.statusCode = 404
          res.end('Local frame file is missing.')
        }
      })
    },
  }
}

export default defineConfig(({ command }) => {
  const localClip = command === 'serve' && existsSync(join(clipDirectory, 'manifest.json'))
  const localFrames = command === 'serve' && existsSync(join(framesDirectory, 'manifest.json'))
  return {
    publicDir: false,
    define: {
      'import.meta.env.VITE_LOCAL_FRAMES_MANIFEST_URL': JSON.stringify(localFrames ? `${localFramesPrefix}manifest.json` : ''),
      'import.meta.env.VITE_LOCAL_MANIFEST_URL': JSON.stringify(localClip ? `${localClipPrefix}manifest.json` : ''),
    },
    plugins: [react(),
      localFilePlugin({
        root: framesDirectory,
        prefix: localFramesPrefix,
        manifestPath: localFrames,
        matcher: /^(manifest\.json|(grid|points|meta|frames)\/[0-9][a-zA-Z0-9_.-]+)$/,
      }),
      localFilePlugin({
        root: clipDirectory,
        prefix: localClipPrefix,
        manifestPath: localClip,
        matcher: /^(manifest\.json|(lite|full)\/[0-9]+\.lgf\.gz)$/,
      }),
    ],
    server: { proxy: { '/api': 'http://127.0.0.1:8000' } },
  }
})
