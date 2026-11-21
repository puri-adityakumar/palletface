#!/usr/bin/env node
/**
 * Stage 3 Yarn PnP dependency-closure probe. Run with `yarn node` so the PnP
 * runtime is active. It records the installed package location, the runtime
 * dependency closure of dither-face, and whether consumer-only tools resolve.
 */
const path = require('node:path')
const { createRequire } = require('node:module')

const pnpapi = require('pnpapi')
const requireFromHere = createRequire(__filename)
const entry = requireFromHere.resolve('dither-face')
const locator = pnpapi.findPackageLocator(entry)
const info = pnpapi.getPackageInformation(locator)
const packageRoot = path.resolve(path.dirname(entry), '..')

function observation(specifier) {
  try {
    return { specifier, resolved: true, path: requireFromHere.resolve(specifier) }
  } catch (error) {
    return { specifier, resolved: false, code: error?.code ?? null, message: String(error?.message ?? error) }
  }
}

console.log(JSON.stringify({
  node: process.version,
  entry,
  packageRoot,
  locator,
  packageDependencies: Object.keys(info?.packageDependencies ?? {}).sort(),
  react: observation('react'),
  reactDom: observation('react-dom'),
  typescript: observation('typescript'),
  nodeModulesExists: require('node:fs').existsSync(path.join(process.cwd(), 'node_modules')),
}, null, 2))
