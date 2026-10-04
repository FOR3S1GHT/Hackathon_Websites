/**
 * Generates the PWA icons and favicon.
 *
 * Deliberately dependency-free: this writes PNG bytes directly (zlib is the
 * only import) so the icons are reproducible from source rather than being
 * opaque binary blobs checked into the repository.
 *
 * Run with: npm run icons
 */
import { deflateSync } from 'node:zlib'
import { writeFileSync, mkdirSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const here = dirname(fileURLToPath(import.meta.url))
const publicDir = resolve(here, '..', 'public')

// CRC32 for PNG chunk checksums.
const CRC_TABLE = (() => {
  const table = new Int32Array(256)
  for (let n = 0; n < 256; n += 1) {
    let c = n
    for (let k = 0; k < 8; k += 1) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1
    table[n] = c
  }
  return table
})()

function crc32(buffer) {
  let c = 0xffffffff
  for (let i = 0; i < buffer.length; i += 1) c = CRC_TABLE[(c ^ buffer[i]) & 0xff] ^ (c >>> 8)
  return (c ^ 0xffffffff) >>> 0
}

function chunk(type, data) {
  const length = Buffer.alloc(4)
  length.writeUInt32BE(data.length, 0)
  const typeAndData = Buffer.concat([Buffer.from(type, 'ascii'), data])
  const crc = Buffer.alloc(4)
  crc.writeUInt32BE(crc32(typeAndData), 0)
  return Buffer.concat([length, typeAndData, crc])
}

/** Encode RGBA pixel rows into a PNG buffer. */
function encodePng(width, height, paint) {
  const raw = Buffer.alloc(height * (width * 4 + 1))
  let offset = 0
  for (let y = 0; y < height; y += 1) {
    raw[offset] = 0 // filter type 0 (None)
    offset += 1
    for (let x = 0; x < width; x += 1) {
      const [r, g, b, a] = paint(x, y, width, height)
      raw[offset] = r
      raw[offset + 1] = g
      raw[offset + 2] = b
      raw[offset + 3] = a
      offset += 4
    }
  }

  const ihdr = Buffer.alloc(13)
  ihdr.writeUInt32BE(width, 0)
  ihdr.writeUInt32BE(height, 4)
  ihdr[8] = 8 // bit depth
  ihdr[9] = 6 // colour type: RGBA
  ihdr[10] = 0 // compression
  ihdr[11] = 0 // filter
  ihdr[12] = 0 // interlace

  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr),
    chunk('IDAT', deflateSync(raw, { level: 9 })),
    chunk('IEND', Buffer.alloc(0)),
  ])
}

/**
 * The mark: a black plate, a white inset, and a radar sweep wedge — drawn with
 * integer geometry so it is crisp at every size.
 */
function paint(x, y, width, height) {
  const BLACK = [0, 0, 0, 255]
  const WHITE = [255, 255, 255, 255]
  const CONCRETE = [128, 128, 128, 255]

  const unit = Math.min(width, height)
  const border = Math.max(2, Math.round(unit * 0.075))
  const inset = border * 2

  // Outer black plate.
  if (x < border || y < border || x >= width - border || y >= height - border) return BLACK

  // Inset white field.
  if (x >= inset && y >= inset && x < width - inset && y < height - inset) {
    const cx = width / 2
    const cy = height / 2
    const radius = (unit - inset * 2) / 2 - unit * 0.06
    const dx = x - cx
    const dy = y - cy
    const distance = Math.hypot(dx, dy)

    // Outer ring.
    if (distance > radius * 0.94 && distance <= radius) return BLACK

    // Sweep wedge, drawn as a filled triangle to the right of centre.
    const inWedge = dx >= 0 && Math.abs(dy) <= dx * 0.62 && distance <= radius * 0.86
    if (inWedge) return CONCRETE

    // Centre dot.
    if (distance <= radius * 0.13) return BLACK

    return WHITE
  }

  return BLACK
}

mkdirSync(publicDir, { recursive: true })

const targets = [
  ['icon-192.png', 192],
  ['icon-512.png', 512],
  ['apple-touch-icon.png', 180],
  ['favicon.png', 64],
]

for (const [name, size] of targets) {
  writeFileSync(resolve(publicDir, name), encodePng(size, size, paint))
  process.stdout.write(`wrote public/${name} (${size}x${size})\n`)
}