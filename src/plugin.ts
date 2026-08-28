import type { Context } from '@deepseek-ai/cordis'

/** Minimal Cordis contribution proving that Desktop code joins the official tree. */
export const name = 'dsh-desktop-poc-host'

/**
 * Register one reversible Desktop-owned effect in the official Host tree.
 * @param ctx - current Cordis generation.
 */
export function apply(ctx: Context): void {
  ctx.effect(() => {
    process.stdout.write('DSH_DESKTOP_POC_PLUGIN_MOUNTED\n')
    return () => {
      process.stdout.write('DSH_DESKTOP_POC_PLUGIN_UNMOUNTED\n')
    }
  }, 'dsh-client-launcher: minimal host contribution')
}
