const { contextBridge, ipcRenderer } = require('electron') as typeof import('electron')

interface DesktopThemeColors {
  background: string
  foreground: string
  accent: string
}

const DESKTOP_TITLE_BAR_HEIGHT = 36
const SETTLED_THEME_CONFIRMATION_MS = 450

contextBridge.exposeInMainWorld('dshDesktop', {
  buildRuntime: () => ipcRenderer.invoke('dsh-desktop:build-runtime') as Promise<{ ok: boolean, log: string }>,
  openInstallDirectory: () => ipcRenderer.invoke('dsh-desktop:open-install-directory') as Promise<{ ok: boolean, error?: string }>,
  listRuntimes: () => ipcRenderer.invoke('dsh-desktop:list-runtimes') as Promise<{ clients: unknown[], error?: string }>,
  addRuntime: () => ipcRenderer.invoke('dsh-desktop:add-runtime') as Promise<{ error?: string }>,
  startRuntime: (id: string) => ipcRenderer.invoke('dsh-desktop:start-runtime', id) as Promise<{ restarting?: boolean, error?: string }>,
  prepareRuntime: (id: string) => ipcRenderer.invoke('dsh-desktop:prepare-runtime', id) as Promise<{ restarting?: boolean, error?: string }>,
  removeRuntime: (id: string) => ipcRenderer.invoke('dsh-desktop:remove-runtime', id) as Promise<{ error?: string }>,
  quit: () => { ipcRenderer.send('dsh-desktop:recovery-quit') },
})

const BACKGROUND_TOKENS = ['--dsw-alias-bg-base', '--background', '--color-background', '--bg-primary']
const FOREGROUND_TOKENS = ['--dsw-alias-label-primary', '--foreground', '--color-foreground', '--text-primary']
const ACCENT_TOKENS = ['--dsw-alias-state-business-primary', '--primary', '--accent', '--color-accent']

function createThemeFrameScheduler(publish: () => void): () => void {
  let primaryFrame: number | undefined
  let confirmationFrame: number | undefined

  return () => {
    if (primaryFrame !== undefined) return
    primaryFrame = window.requestAnimationFrame(() => {
      primaryFrame = undefined
      publish()
      if (confirmationFrame !== undefined) return
      confirmationFrame = window.requestAnimationFrame(() => {
        confirmationFrame = undefined
        publish()
      })
    })
  }
}

function opaque(color: string): boolean {
  return color !== '' && color !== 'transparent' && !/^rgba\([^)]*,\s*0(?:\.0+)?\s*\)$/i.test(color)
}

function resolveToken(tokens: readonly string[]): string | undefined {
  const probe = document.createElement('span')
  probe.style.position = 'fixed'
  probe.style.visibility = 'hidden'
  document.body.append(probe)
  try {
    for (const token of tokens) {
      if (getComputedStyle(document.documentElement).getPropertyValue(token).trim() === '') continue
      probe.style.color = ''
      probe.style.color = `var(${token})`
      const color = getComputedStyle(probe).color
      if (opaque(color)) return color
    }
    return undefined
  } finally {
    probe.remove()
  }
}

function elementColor(property: 'backgroundColor' | 'color'): string | undefined {
  const elements = [document.body, document.documentElement, document.querySelector<HTMLElement>('#root')]
  for (const element of elements) {
    if (element === null) continue
    const color = getComputedStyle(element)[property]
    if (opaque(color)) return color
  }
  return undefined
}

function sampleTheme(): DesktopThemeColors {
  return {
    background: resolveToken(BACKGROUND_TOKENS) ?? elementColor('backgroundColor') ?? 'rgb(23, 23, 23)',
    foreground: resolveToken(FOREGROUND_TOKENS) ?? elementColor('color') ?? 'rgb(245, 245, 245)',
    accent: resolveToken(ACCENT_TOKENS) ?? 'rgb(86, 134, 254)',
  }
}

function installDesktopChrome(): void {
  const style = document.createElement('style')
  style.textContent = `
    html, body { height: 100%; }
    body { margin: 0; overflow: hidden; }
    body > #root { height: calc(100% - ${DESKTOP_TITLE_BAR_HEIGHT}px) !important; margin-top: ${DESKTOP_TITLE_BAR_HEIGHT}px !important; }
    #dsh-desktop-titlebar {
      position: fixed; inset: 0 0 auto 0; z-index: 2147483646;
      height: ${DESKTOP_TITLE_BAR_HEIGHT}px; box-sizing: border-box;
      -webkit-app-region: drag;
      display: flex; align-items: flex-start; justify-content: space-between;
      color: var(--dsh-desktop-titlebar-foreground, rgb(245, 245, 245));
    }
    #dsh-desktop-runtime-label {
      min-width: 0; height: ${DESKTOP_TITLE_BAR_HEIGHT}px; box-sizing: border-box;
      display: flex; align-items: center; padding: 0 12px;
      overflow: hidden; white-space: nowrap; text-overflow: ellipsis;
      font: 12px/1.2 system-ui, sans-serif; opacity: .72;
    }
    #dsh-desktop-window-controls {
      -webkit-app-region: no-drag;
      display: flex; gap: 2px; height: 32px; padding: 3px 5px 0 0;
    }
    .dsh-desktop-window-button {
      width: 42px; height: 29px; margin: 0; padding: 0;
      display: grid; place-items: center;
      border: 1px solid transparent; border-radius: 9px;
      color: inherit; background: transparent; cursor: default;
      transition: background-color 90ms ease, border-color 90ms ease, transform 90ms ease;
    }
    .dsh-desktop-window-button svg { width: 12px; height: 12px; pointer-events: none; }
    .dsh-desktop-window-button:hover {
      background: color-mix(in srgb, var(--dsh-desktop-titlebar-accent, currentColor) 16%, transparent);
      border-color: color-mix(in srgb, var(--dsh-desktop-titlebar-accent, currentColor) 32%, transparent);
    }
    .dsh-desktop-window-button:active { transform: scale(.92); }
    .dsh-desktop-window-button:focus-visible {
      outline: 2px solid var(--dsh-desktop-titlebar-accent, currentColor); outline-offset: -2px;
    }
    #dsh-desktop-window-close:hover {
      color: rgb(255, 255, 255); background: rgb(209, 52, 68); border-color: rgb(209, 52, 68);
    }
    #dsh-desktop-window-maximize .dsh-desktop-restore-icon { display: none; }
    #dsh-desktop-window-maximize[data-maximized='true'] .dsh-desktop-maximize-icon { display: none; }
    #dsh-desktop-window-maximize[data-maximized='true'] .dsh-desktop-restore-icon { display: block; }
    @media (prefers-reduced-motion: reduce) {
      .dsh-desktop-window-button { transition: none; }
    }
  `
  const titleBar = document.createElement('div')
  titleBar.id = 'dsh-desktop-titlebar'
  const runtimeLabel = document.createElement('div')
  runtimeLabel.id = 'dsh-desktop-runtime-label'
  runtimeLabel.textContent = '当前客户端：正在确认…'
  const controls = document.createElement('div')
  controls.id = 'dsh-desktop-window-controls'
  controls.setAttribute('role', 'toolbar')
  controls.setAttribute('aria-label', '窗口控制')
  controls.innerHTML = `
    <button class="dsh-desktop-window-button" id="dsh-desktop-window-minimize" type="button" aria-label="最小化" title="最小化">
      <svg viewBox="0 0 12 12" aria-hidden="true"><path d="M2 6.5h8" fill="none" stroke="currentColor" stroke-width="1.2" stroke-linecap="round"/></svg>
    </button>
    <button class="dsh-desktop-window-button" id="dsh-desktop-window-maximize" type="button" aria-label="最大化" title="最大化" data-maximized="false">
      <svg class="dsh-desktop-maximize-icon" viewBox="0 0 12 12" aria-hidden="true"><rect x="2" y="2" width="8" height="8" rx="1" fill="none" stroke="currentColor" stroke-width="1.1"/></svg>
      <svg class="dsh-desktop-restore-icon" viewBox="0 0 12 12" aria-hidden="true"><path d="M4 3V2.5A1.5 1.5 0 0 1 5.5 1h4A1.5 1.5 0 0 1 11 2.5v4A1.5 1.5 0 0 1 9.5 8H9M2.5 4h4A1.5 1.5 0 0 1 8 5.5v4A1.5 1.5 0 0 1 6.5 11h-4A1.5 1.5 0 0 1 1 9.5v-4A1.5 1.5 0 0 1 2.5 4Z" fill="none" stroke="currentColor" stroke-width="1.05"/></svg>
    </button>
    <button class="dsh-desktop-window-button" id="dsh-desktop-window-close" type="button" aria-label="关闭" title="关闭">
      <svg viewBox="0 0 12 12" aria-hidden="true"><path d="m2.25 2.25 7.5 7.5m0-7.5-7.5 7.5" fill="none" stroke="currentColor" stroke-width="1.2" stroke-linecap="round"/></svg>
    </button>
  `
  titleBar.append(runtimeLabel, controls)
  document.head.append(style)
  document.body.append(titleBar)
  void ipcRenderer.invoke('dsh-desktop:active-runtime').then((value: unknown) => {
    if (typeof value !== 'object' || value === null) return
    const name = Reflect.get(value, 'name')
    const root = Reflect.get(value, 'root')
    if (typeof name !== 'string' || typeof root !== 'string') return
    runtimeLabel.textContent = `当前客户端：${name}`
    runtimeLabel.title = root
  })

  const minimizeButton = controls.querySelector<HTMLButtonElement>('#dsh-desktop-window-minimize')
  const maximizeButton = controls.querySelector<HTMLButtonElement>('#dsh-desktop-window-maximize')
  const closeButton = controls.querySelector<HTMLButtonElement>('#dsh-desktop-window-close')
  minimizeButton?.addEventListener('click', () => { ipcRenderer.send('dsh-desktop:window-control', 'minimize') })
  maximizeButton?.addEventListener('click', () => { ipcRenderer.send('dsh-desktop:window-control', 'toggle-maximize') })
  closeButton?.addEventListener('click', () => { ipcRenderer.send('dsh-desktop:window-control', 'close') })
  titleBar.addEventListener('dblclick', (event) => {
    if ((event.target as Element).closest('#dsh-desktop-window-controls') !== null) return
    ipcRenderer.send('dsh-desktop:window-control', 'toggle-maximize')
  })
  ipcRenderer.on('dsh-desktop:window-state', (_event, value: unknown) => {
    if (typeof value !== 'object' || value === null || typeof Reflect.get(value, 'maximized') !== 'boolean') return
    const maximized = Reflect.get(value, 'maximized') as boolean
    if (maximizeButton === null) return
    maximizeButton.dataset.maximized = String(maximized)
    maximizeButton.setAttribute('aria-label', maximized ? '还原' : '最大化')
    maximizeButton.title = maximized ? '还原' : '最大化'
  })
  ipcRenderer.send('dsh-desktop:window-controls-ready')

  let lastSignature = ''
  const publish = (): void => {
    const colors = sampleTheme()
    const signature = JSON.stringify(colors)
    if (signature === lastSignature) return
    lastSignature = signature
    titleBar.style.backgroundColor = colors.background
    titleBar.style.setProperty('--dsh-desktop-titlebar-foreground', colors.foreground)
    titleBar.style.setProperty('--dsh-desktop-titlebar-accent', colors.accent)
    ipcRenderer.send('dsh-desktop:theme-colors', colors)
  }
  const scheduleFrame = createThemeFrameScheduler(publish)
  let settledTimer: ReturnType<typeof setTimeout> | undefined
  const schedule = (): void => {
    scheduleFrame()
    if (settledTimer !== undefined) clearTimeout(settledTimer)
    settledTimer = setTimeout(() => {
      settledTimer = undefined
      publish()
    }, SETTLED_THEME_CONFIRMATION_MS)
  }
  const observer = new MutationObserver(schedule)
  observer.observe(document.documentElement, { attributes: true })
  observer.observe(document.body, { attributes: true })
  observer.observe(document.head, { attributes: true, childList: true, subtree: true })
  const scheduleBodyTransition = (event: TransitionEvent): void => {
    if (event.target !== document.body) return
    if (event.propertyName !== 'background-color' && event.propertyName !== 'color') return
    schedule()
  }
  document.body.addEventListener('transitionend', scheduleBodyTransition)
  document.body.addEventListener('transitioncancel', scheduleBodyTransition)
  window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', schedule)
  publish()
}

window.addEventListener('DOMContentLoaded', installDesktopChrome, { once: true })
