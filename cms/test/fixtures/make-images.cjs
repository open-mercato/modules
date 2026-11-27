// Writes the raster images of the byte test (spec Step 2.1): a JPEG and a WebP with EXIF (orientation 6, copyright),
// a PNG with a tEXt chunk. Run once from cms/ with `NODE_PATH=node_modules node test/fixtures/make-images.cjs
// test/fixtures`; the files are committed, so the test never depends on this script or on sharp.
const sharp = require('sharp')
const zlib = require('node:zlib')
const fs = require('node:fs')
const out = process.argv[2]
const w = 600,
  h = 400
const raw = Buffer.alloc(w * h * 3)
for (let y = 0; y < h; y++)
  for (let x = 0; x < w; x++) {
    const i = (y * w + x) * 3
    const b = ((x / 50) | 0) + ((y / 50) | 0)
    raw[i] = (b * 37) % 256
    raw[i + 1] = (b * 91) % 256
    raw[i + 2] = (b * 53) % 256
  }
const base = () => sharp(raw, { raw: { width: w, height: h, channels: 3 } })
;(async () => {
  const exif = { IFD0: { Copyright: 'Open Mercato test image', Artist: 'cms byte test', Orientation: '6' } }
  await base().jpeg({ quality: 92 }).withMetadata({ orientation: 6 }).withExifMerge(exif).toFile(`${out}/exif.jpg`)
  await base().webp({ quality: 90 }).withMetadata({ orientation: 6 }).withExifMerge(exif).toFile(`${out}/exif.webp`)
  // PNG with a tEXt chunk after IHDR
  const png = await base().png().toBuffer()
  const chunk = (type, data) => {
    const len = Buffer.alloc(4)
    len.writeUInt32BE(data.length)
    const td = Buffer.concat([Buffer.from(type), data])
    const crc = Buffer.alloc(4)
    crc.writeUInt32BE(zlib.crc32(td))
    return Buffer.concat([len, td, crc])
  }
  const text = chunk('tEXt', Buffer.from('Copyright\0Open Mercato test image'))
  const ihdrEnd = 8 + 25
  fs.writeFileSync(`${out}/text.png`, Buffer.concat([png.subarray(0, ihdrEnd), text, png.subarray(ihdrEnd)]))
  console.log(
    (await sharp(`${out}/exif.jpg`).metadata()).orientation,
    (await sharp(`${out}/exif.webp`).metadata()).exif?.length,
  )
})()
