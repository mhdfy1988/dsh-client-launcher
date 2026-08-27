/** Height reserved for the desktop-owned draggable title bar. */
export const DESKTOP_TITLE_BAR_HEIGHT = 36

/** Renderer-derived colors that may cross the preload IPC boundary. */
export interface DesktopThemeColors {
  background: string
  foreground: string
  accent: string
}

interface RgbColor { r: number, g: number, b: number }

function byte(value: string): number | undefined {
  const parsed = Number.parseFloat(value)
  if (!Number.isFinite(parsed) || parsed < 0 || parsed > 255) return undefined
  return Math.round(parsed)
}

function parseColor(value: string): RgbColor | undefined {
  const input = value.trim()
  const hex = /^#([0-9a-f]{6})$/i.exec(input)?.[1]
  if (hex !== undefined) {
    return {
      r: Number.parseInt(hex.slice(0, 2), 16),
      g: Number.parseInt(hex.slice(2, 4), 16),
      b: Number.parseInt(hex.slice(4, 6), 16),
    }
  }
  const rgb = /^rgba?\(\s*([\d.]+)[,\s]+([\d.]+)[,\s]+([\d.]+)(?:\s*[,/]\s*([\d.]+%?))?\s*\)$/i.exec(input)
  if (rgb === null) return undefined
  const r = rgb[1] === undefined ? undefined : byte(rgb[1])
  const g = rgb[2] === undefined ? undefined : byte(rgb[2])
  const b = rgb[3] === undefined ? undefined : byte(rgb[3])
  if (r === undefined || g === undefined || b === undefined) return undefined
  const alpha = rgb[4]
  if (alpha !== undefined) {
    const parsedAlpha = alpha.endsWith('%') ? Number.parseFloat(alpha) / 100 : Number.parseFloat(alpha)
    if (!Number.isFinite(parsedAlpha) || parsedAlpha < 0.95) return undefined
  }
  return { r, g, b }
}

function hexByte(value: number): string {
  return value.toString(16).padStart(2, '0')
}

/** Normalize an opaque CSS color accepted from the renderer. */
export function normalizeCssColor(value: unknown): string | undefined {
  if (typeof value !== 'string') return undefined
  const color = parseColor(value)
  return color === undefined ? undefined : `#${hexByte(color.r)}${hexByte(color.g)}${hexByte(color.b)}`
}

/** Validate renderer colors and choose accessible Windows caption symbols. */
export function resolveDesktopTheme(value: unknown): DesktopThemeColors & { symbol: string } | undefined {
  if (typeof value !== 'object' || value === null) return undefined
  const background = normalizeCssColor(Reflect.get(value, 'background'))
  const foreground = normalizeCssColor(Reflect.get(value, 'foreground'))
  const accent = normalizeCssColor(Reflect.get(value, 'accent'))
  if (background === undefined || foreground === undefined || accent === undefined) return undefined
  const color = parseColor(background)
  if (color === undefined) return undefined
  const luminance = (0.2126 * color.r + 0.7152 * color.g + 0.0722 * color.b) / 255
  return { background, foreground, accent, symbol: luminance > 0.58 ? '#171717' : '#ffffff' }
}
