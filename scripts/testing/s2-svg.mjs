/**
 * Stage 2 SVG/XML helpers. Strict, countable checks; no hidden normalization.
 *
 * `canonicalElement` and `canonicalDiagnostic` are diagnostics only. Raw-byte
 * comparisons are the assertions for cross-engine and size invariance.
 */
import { createHash } from 'node:crypto'

export const SVG_NS = 'http://www.w3.org/2000/svg'

export function sha256(value) {
  return createHash('sha256').update(value).digest('hex')
}

/** XML 1.0 forbids C0 controls other than tab/LF/CR, lone surrogates, FFFE and FFFF. */
export function invalidXmlChars(text) {
  const bad = []
  for (let index = 0; index < text.length; ) {
    const code = text.codePointAt(index)
    const size = code > 0xffff ? 2 : 1
    const isBad =
      (code < 0x20 && code !== 0x9 && code !== 0xa && code !== 0xd) ||
      (code >= 0xd800 && code <= 0xdfff) ||
      code === 0xfffe ||
      code === 0xffff
    if (isBad) bad.push({ index, codePoint: `U+${code.toString(16).toUpperCase().padStart(4, '0')}` })
    index += size
  }
  return bad
}

/** Independent tag-balance check, so a lenient parser error cannot hide malformed XML. */
export function structuralErrors(svg) {
  const errors = []
  const stack = []
  const tagRe = /<!--[\s\S]*?-->|<!\[CDATA\[[\s\S]*?\]\]>|<\?[\s\S]*?\?>|<\/?[A-Za-z][^>]*>/g
  let match
  while ((match = tagRe.exec(svg))) {
    const tag = match[0]
    if (tag.startsWith('<!--') || tag.startsWith('<![CDATA[') || tag.startsWith('<?')) continue
    const closing = tag.startsWith('</')
    const nameMatch = tag.match(/^<\/?([A-Za-z][A-Za-z0-9._:-]*)/)
    if (!nameMatch) continue
    const name = nameMatch[1].toLowerCase()
    if (closing) {
      const top = stack.pop()
      if (top !== name) errors.push(`mismatched closing tag </${name}>; expected </${top ?? 'none'}>`)
    } else if (!tag.endsWith('/>')) {
      stack.push(name)
    }
  }
  if (stack.length) errors.push(`unclosed tags: ${stack.join(',')}`)
  return errors
}

export function parseSvg(DOMParserCtor, svg) {
  const errors = []
  const messages = []
  if (typeof svg !== 'string' || svg.length === 0) {
    return { doc: null, root: null, errors: ['not a non-empty string'], messages, violations: [] }
  }
  const violations = []
  if (/<!DOCTYPE/i.test(svg)) violations.push('doctype')
  if (/<!ENTITY/i.test(svg)) violations.push('entity')
  errors.push(...structuralErrors(svg))
  let doc = null
  const onError = (level, message) => {
    const text = `${level}: ${message}`
    messages.push(text)
    if (level === 'error' || level === 'fatalError') errors.push(text)
  }
  try {
    doc = new DOMParserCtor({
      onError,
    }).parseFromString(svg, 'image/svg+xml')
  } catch (error) {
    errors.push(`parser threw: ${error.message}`)
  }
  const root = doc?.documentElement ?? null
  if (!root) {
    errors.push('no documentElement')
    return { doc, root, errors, messages, violations }
  }
  if ((root.localName || root.nodeName || '').toLowerCase() === 'parsererror') errors.push('parsererror document')
  if ((root.localName || root.nodeName || '').toLowerCase() !== 'svg') violations.push(`root-not-svg:${root.nodeName}`)
  if (root.namespaceURI !== SVG_NS) violations.push(`namespace:${root.namespaceURI ?? 'none'}`)
  violations.push(...markupViolations(doc))
  return { doc, root, errors, messages, violations }
}

export function elementsByName(doc, name) {
  const wanted = name.toLowerCase()
  return [doc.documentElement, ...Array.from(doc.getElementsByTagName('*'))].filter(
    (element) => (element.localName || element.nodeName || '').toLowerCase() === wanted,
  )
}

export function serialiseAttrs(element) {
  const attrs = []
  const list = element.attributes
  if (!list) return ''
  for (let i = 0; i < list.length; i++) {
    const attr = list.item(i)
    attrs.push(`${attr.name}=${JSON.stringify(attr.value ?? '')}`)
  }
  return attrs.sort().join(' ')
}

export function markupViolations(doc) {
  const violations = []
  const root = doc.documentElement
  if (!root) return violations
  for (const element of [root, ...Array.from(root.getElementsByTagName('*'))]) {
    const local = (element.localName || element.nodeName || '').toLowerCase()
    if (local === 'script') violations.push('script')
    if (local === 'foreignobject') violations.push('foreign-object')
    if (local === 'iframe' || local === 'object' || local === 'embed') violations.push(`active-element:${local}`)
    if (element.namespaceURI && element.namespaceURI !== SVG_NS) violations.push(`foreign-namespace:${local}:${element.namespaceURI}`)
    const attrs = element.attributes
    if (!attrs) continue
    for (let i = 0; i < attrs.length; i++) {
      const attr = attrs.item(i)
      const name = (attr.name || attr.nodeName || '').toLowerCase()
      const value = attr.value ?? ''
      if (/^on/.test(name)) violations.push(`event-handler:${local}@${name}`)
      if (name === 'href' || name === 'xlink:href' || name === 'src') {
        const trimmed = value.trim()
        if (!trimmed.startsWith('#')) violations.push(`external-reference:${local}@${name}:${trimmed.slice(0, 80)}`)
      }
      if (/javascript:/i.test(value)) violations.push(`javascript-uri:${local}@${name}`)
      if (/@import/i.test(value)) violations.push(`external-reference:${local}@${name}:@import`)
      for (const urlMatch of value.matchAll(/url\(\s*(['"]?)([^)'"]*)\1\s*\)/gi)) {
        const target = (urlMatch[2] || '').trim()
        if (!target.startsWith('#')) violations.push(`external-reference:${local}@${name}:url(${target.slice(0, 80)})`)
      }
    }
  }
  return violations
}

export function rootInfo(root, expectedPx) {
  const violations = []
  if (!root) return { violations: ['no-root'], width: null, height: null, viewBox: null }
  const width = root.getAttribute?.('width') ?? ''
  const height = root.getAttribute?.('height') ?? ''
  const viewBox = root.getAttribute?.('viewBox') ?? ''
  if (!width || !height || !Number.isFinite(Number(width)) || !Number.isFinite(Number(height))) {
    violations.push(`dimensions-invalid:${width}:${height}`)
  } else if (expectedPx !== undefined && (Number(width) !== expectedPx || Number(height) !== expectedPx)) {
    violations.push(`dimensions-mismatch:${width}x${height}:expected:${expectedPx}`)
  }
  const box = viewBox.trim().split(/[ ,]+/).map(Number)
  if (box.length !== 4 || !box.every(Number.isFinite) || box[2] <= 0 || box[3] <= 0) {
    violations.push(`viewBox-invalid:${viewBox}`)
  }
  return { violations, width, height, viewBox }
}

/** Deterministic structural serialization; used for definitions and diagnostics. */
export function canonicalElement(element) {
  const local = (element.localName || element.nodeName || '').toLowerCase()
  const attrs = serialiseAttrs(element)
  let children = ''
  for (const node of Array.from(element.childNodes ?? [])) {
    if (node.nodeType === 1) children += canonicalElement(node)
    else if (node.nodeType === 3 || node.nodeType === 4) children += `T${JSON.stringify(node.nodeValue ?? '')}`
  }
  return `<${local} ${attrs}>${children}</${local}>`
}

export function canonicalDiagnostic(svg, DOMParserCtor) {
  try {
    const doc = new DOMParserCtor().parseFromString(svg, 'image/svg+xml')
    if (!doc?.documentElement) return null
    return canonicalElement(doc.documentElement)
  } catch {
    return null
  }
}

/** Every ID definition in one document, with a canonical subtree signature. */
export function definitionRecords(doc) {
  const records = []
  if (!doc?.documentElement) return records
  for (const element of [doc.documentElement, ...Array.from(doc.getElementsByTagName('*'))]) {
    const id = element.getAttribute?.('id')
    if (!id) continue
    records.push({
      id,
      tag: (element.localName || element.nodeName || '').toLowerCase(),
      signature: canonicalElement(element),
    })
  }
  return records
}

/**
 * Cross-document definition equivalence. Duplicate IDs are allowed when every
 * signature for that ID is identical; a differing signature is a conflict.
 */
export function definitionAnalysis(documents) {
  const byId = new Map()
  for (const record of documents) {
    for (const definition of definitionRecords(record.doc)) {
      if (!byId.has(definition.id)) byId.set(definition.id, { signatures: new Set(), occurrences: 0, tags: new Set(), signaturesByDocument: new Map() })
      const entry = byId.get(definition.id)
      entry.signatures.add(definition.signature)
      entry.tags.add(definition.tag)
      entry.occurrences += 1
      if (!entry.signaturesByDocument.has(record.label)) entry.signaturesByDocument.set(record.label, new Set())
      entry.signaturesByDocument.get(record.label).add(definition.signature)
    }
  }
  const conflicts = []
  const duplicateIds = []
  const withinDocumentConflicts = []
  for (const [id, entry] of byId) {
    if (entry.occurrences > 1) duplicateIds.push({ id, occurrences: entry.occurrences, tags: [...entry.tags] })
    if (entry.signatures.size > 1) conflicts.push({ id, signatures: [...entry.signatures].slice(0, 4), documentCount: entry.signaturesByDocument.size })
    for (const [label, signatures] of entry.signaturesByDocument) {
      if (signatures.size > 1) withinDocumentConflicts.push({ id, label, signatures: [...signatures].slice(0, 4) })
    }
  }
  return {
    idCount: byId.size,
    definitionCount: documents.reduce((sum, record) => sum + definitionRecords(record.doc).length, 0),
    duplicateIds,
    conflicts,
    withinDocumentConflicts,
  }
}

export function referenceErrors(doc) {
  const ids = new Set()
  if (!doc?.documentElement) return [{ element: 'document', target: 'missing-root' }]
  for (const element of [doc.documentElement, ...Array.from(doc.getElementsByTagName('*'))]) {
    const id = element.getAttribute?.('id')
    if (id) ids.add(id)
  }
  const missing = []
  for (const element of [doc.documentElement, ...Array.from(doc.getElementsByTagName('*'))]) {
    const attrs = element.attributes
    if (!attrs) continue
    for (let i = 0; i < attrs.length; i++) {
      const attr = attrs.item(i)
      const name = (attr.name || attr.nodeName || '').toLowerCase()
      const value = attr.value ?? ''
      if (name === 'href' || name === 'xlink:href') {
        const target = value.trim()
        if (target.startsWith('#') && !ids.has(target.slice(1))) missing.push({ element: name, target })
      }
      for (const match of value.matchAll(/url\(\s*(['"]?)#([^)'"\s]+)\1\s*\)/gi)) {
        if (!ids.has(match[2])) missing.push({ element: name, target: `#${match[2]}` })
      }
    }
  }
  return missing
}

/** Remove only the root width/height attribute tokens; never touch viewBox. */
export function stripOuterDimensions(svg) {
  const end = svg.indexOf('>')
  if (!svg.startsWith('<svg ') || end < 0) throw new Error('not a standalone svg root')
  const open = svg.slice(0, end)
  let stripped = open.replace(/\swidth="[^"]*"/, '').replace(/\sheight="[^"]*"/, '')
  if (stripped === open) throw new Error(`root width/height not found in ${open.slice(0, 120)}`)
  if (!/\sviewBox="[^"]*"/.test(stripped)) throw new Error('viewBox disappeared while stripping dimensions')
  return stripped + svg.slice(end)
}

export function rawCompare(expected, actual) {
  const a = Buffer.from(expected, 'utf8')
  const b = Buffer.from(actual, 'utf8')
  let firstDiff = -1
  const limit = Math.min(a.length, b.length)
  for (let index = 0; index < limit; index++) {
    if (a[index] !== b[index]) {
      firstDiff = index
      break
    }
  }
  if (firstDiff < 0 && a.length !== b.length) firstDiff = limit
  return {
    equal: firstDiff < 0 && a.length === b.length,
    firstDiff,
    expectedLength: a.length,
    actualLength: b.length,
    expectedSnippet: firstDiff < 0 ? '' : a.subarray(Math.max(0, firstDiff - 40), firstDiff + 40).toString('latin1'),
    actualSnippet: firstDiff < 0 ? '' : b.subarray(Math.max(0, firstDiff - 40), firstDiff + 40).toString('latin1'),
  }
}

/** Single-byte negative control: mutate one ASCII byte inside the document body. */
export function corruptSingleByte(svg) {
  const buffer = Buffer.from(svg, 'utf8')
  const candidates = []
  const bodyOffset = buffer.indexOf(Buffer.from('<rect'))
  if (bodyOffset >= 0) candidates.push([bodyOffset + 1, 0x73])
  const textOffset = buffer.indexOf(Buffer.from('<text'))
  if (textOffset >= 0) candidates.push([textOffset + 5, 0x61])
  const [offset, replacement] = candidates.find(([index]) => buffer[index] !== replacement) ?? [-1, 0]
  if (offset < 0) throw new Error('no single-byte corruption candidate')
  const originalByte = buffer[offset]
  buffer[offset] = replacement
  return { corrupted: buffer.toString('utf8'), offset, originalByte, newByte: replacement }
}

export function removeDefs(svg) {
  const removed = svg.replace(/<defs>[\s\S]*?<\/defs>/, '')
  if (removed === svg) throw new Error('no <defs> block to remove')
  return removed
}

export function pngMetrics(buffer, PNG) {
  const png = PNG.sync.read(buffer)
  const set = new Set()
  let opaque = 0
  for (let index = 0; index < png.data.length; index += 4) {
    const alpha = png.data[index + 3]
    if (alpha > 0) {
      opaque += 1
      set.add(`${png.data[index]},${png.data[index + 1]},${png.data[index + 2]},${alpha}`)
    }
  }
  return {
    width: png.width,
    height: png.height,
    opaquePixels: opaque,
    totalPixels: png.width * png.height,
    distinctColors: set.size,
    pixelSha256: sha256(png.data),
  }
}

export function pixelBuffersEqual(a, b) {
  return a.length === b.length && Buffer.compare(a, b) === 0
}