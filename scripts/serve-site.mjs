import http from 'node:http'
import { readFile, realpath, stat } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const root = await realpath(fileURLToPath(new URL('../dist-site/', import.meta.url)))
const args = process.argv.slice(2)
const index = args.indexOf('--port')
const port = Number(index >= 0 ? args[index + 1] : 4173)
if (!Number.isInteger(port) || port < 1 || port > 65535) throw new Error('Use --port with a valid port number')
const types = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.xml': 'application/xml',
  '.txt': 'text/plain; charset=utf-8',
}
const insideRoot = candidate => candidate === root || candidate.startsWith(root + path.sep)

http.createServer(async (request, response) => {
  if (!['GET', 'HEAD'].includes(request.method)) {
    response.writeHead(405, { Allow: 'GET, HEAD' }).end()
    return
  }
  try {
    const pathname = decodeURIComponent(new URL(request.url, 'http://localhost').pathname)
    let file = path.resolve(root, `.${pathname}`)
    if (!insideRoot(file)) { response.writeHead(403).end(); return }
    if ((await stat(file)).isDirectory()) file = path.join(file, 'index.html')
    file = await realpath(file)
    if (!insideRoot(file)) { response.writeHead(403).end(); return }
    if (path.basename(file).startsWith('.') || path.basename(file) === '_headers') {
      response.writeHead(404).end()
      return
    }
    const body = await readFile(file)
    response.writeHead(200, {
      'Content-Type': types[path.extname(file)] ?? 'application/octet-stream',
      'Content-Length': body.length,
      'X-Content-Type-Options': 'nosniff',
      'Cache-Control': 'no-store',
      'Referrer-Policy': 'no-referrer',
      'X-Frame-Options': 'DENY',
      'Content-Security-Policy': "default-src 'self'; script-src 'self'; style-src 'self'; img-src 'self' data: blob:; font-src 'self'; connect-src 'self'; object-src 'none'; base-uri 'none'; frame-ancestors 'none'; form-action 'none'",
    }).end(request.method === 'HEAD' ? undefined : body)
  } catch {
    response.writeHead(404, { 'Content-Type': 'text/plain' }).end('Not found')
  }
}).listen(port, '127.0.0.1', () => console.log(`http://127.0.0.1:${port}`))
