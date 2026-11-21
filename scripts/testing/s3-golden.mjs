import { createHash } from 'node:crypto'

export function compareGolden(svg, expectedSha256) {
  const actualSha256 = createHash('sha256').update(svg, 'utf8').digest('hex')
  return { expectedSha256, actualSha256, equal: actualSha256 === expectedSha256 }
}
