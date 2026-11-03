#!/usr/bin/env node
/**
 * Tiny static file server for the Stage 5 Web Worker fixture.
 * Serves only the requested root directory over loopback; no external network.
 */
import { createServer } from 'node:http'
import { createReadStream } from 'node:fs'
import { stat } from 'node:fs/promises'
import path from 'node:path'

const args = process.argv.slice(2)
function option(name, fallback = null) {
  const index = args.indexOf(name)
  return index >= 0 ? args[index + 1] : fallback
}

const root = path.resolve(option('--root', '.'))
const port = Number(option('--port', '8090'))
const host = option('--host', '127.0.0.1')
const types = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
}

const server = createServer(async (request, response) => {
  try {
    const url = new URL(request.url ?? '/', `http://${host}:${port}`)
    const requested = decodeURIComponent(url.pathname === '/' ? '/index.html' : url.pathname)
    const target = path.resolve(root, `.${requested}`)
    if (!target.startsWith(`${root}${path.sep}`) && target !== root) {
      response.writeHead(403).end('forbidden')
      return
    }
    const info = await stat(target)
    if (!info.isFile()) {
      response.writeHead(404).end('not found')
      return
    }
    response.writeHead(200, {
      'content-type': types[path.extname(target)] ?? 'application/octet-stream',
      'content-length': info.size,
      'cache-control': 'no-store',
    })
    createReadStream(target).pipe(response)
  } catch {
    response.writeHead(404).end('not found')
  }
})

server.listen(port, host, () => {
  process.stdout.write(`static server ${root} http://${host}:${port}\n`)
})

for (const signal of ['SIGTERM', 'SIGINT']) {
  process.on(signal, () => {
    server.close(() => process.exit(0))
    setTimeout(() => process.exit(0), 2000).unref()
  })
}
