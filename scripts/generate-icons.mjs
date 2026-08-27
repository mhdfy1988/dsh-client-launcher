import sharp from 'sharp'
import { mkdir, writeFile } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = fileURLToPath(new URL('..', import.meta.url))
const svgPath = join(root, 'assets', 'dsh-desktop-icon.svg')
const pngPath = join(root, 'assets', 'dsh-desktop-icon.png')
const icoPath = join(root, 'assets', 'dsh-desktop-icon.ico')
async function generate() {
  const sizes = [16, 24, 32, 48, 64, 256]
  const images = await Promise.all(sizes.map(size => sharp(svgPath).resize(size, size).png().toBuffer()))
  const headerSize = 6 + sizes.length * 16
  const header = Buffer.alloc(headerSize)
  header.writeUInt16LE(0, 0)
  header.writeUInt16LE(1, 2)
  header.writeUInt16LE(sizes.length, 4)
  let offset = headerSize
  for (let index = 0; index < sizes.length; index += 1) {
    const size = sizes[index]
    const image = images[index]
    if (size === undefined || image === undefined) throw new Error('icon size table is inconsistent')
    const entry = 6 + index * 16
    header.writeUInt8(size === 256 ? 0 : size, entry)
    header.writeUInt8(size === 256 ? 0 : size, entry + 1)
    header.writeUInt8(0, entry + 2)
    header.writeUInt8(0, entry + 3)
    header.writeUInt16LE(1, entry + 4)
    header.writeUInt16LE(32, entry + 6)
    header.writeUInt32LE(image.length, entry + 8)
    header.writeUInt32LE(offset, entry + 12)
    offset += image.length
  }

  await mkdir(dirname(icoPath), { recursive: true })
  await writeFile(pngPath, images.at(-1))
  await writeFile(icoPath, Buffer.concat([header, ...images]))
  process.stdout.write(`generated ${icoPath}\n`)
}

await generate()
