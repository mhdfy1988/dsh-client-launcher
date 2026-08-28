/** Input used to render the DSH Desktop launcher. */
export interface RecoveryPageOptions {
  /** Optional startup failure shown above the client list. */
  message?: string
}

function escapeHtml(value: string): string {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;')
}

/**
 * Render the first-launch and recovery client launcher.
 * @param options - optional failure that caused automatic startup to stop.
 * @returns self-contained HTML for the sandboxed launcher window.
 */
export function renderRecoveryPage(options: RecoveryPageOptions): string {
  const failure = options.message === undefined
    ? ''
    : `<div class="failure"><strong>自动启动已暂停</strong><span>${escapeHtml(options.message)}</span></div>`
  return `<!doctype html>
<html lang="zh-CN">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width,initial-scale=1">
  <title>DSH 客户端启动器</title>
  <style>
    :root{color-scheme:dark;--ink:#ecf2ef;--muted:#8e9d98;--panel:#101917;--line:#263b35;--signal:#73e0b1;--warn:#f4b860;--danger:#ff7f84;--deep:#07100e}
    *{box-sizing:border-box}html,body,#root{width:100%;height:100%}body{margin:0;background:var(--deep);color:var(--ink);font-family:"Microsoft YaHei UI","Segoe UI",sans-serif;overflow:hidden}
    button{font:inherit}#root{display:grid;grid-template-columns:260px 1fr;background:radial-gradient(circle at 18% 12%,rgba(115,224,177,.10),transparent 30%),linear-gradient(135deg,#07100e 0%,#0b1412 58%,#08100f 100%)}
    aside{position:relative;padding:42px 28px;border-right:1px solid var(--line);overflow:hidden}aside::after{content:"";position:absolute;width:230px;height:230px;left:-90px;bottom:-110px;border:1px solid rgba(115,224,177,.22);border-radius:50%;box-shadow:0 0 0 26px rgba(115,224,177,.025),0 0 0 54px rgba(115,224,177,.018)}
    .eyebrow{font:700 11px/1.2 Bahnschrift,"Microsoft YaHei UI",sans-serif;letter-spacing:.22em;color:var(--signal);text-transform:uppercase}.brand{margin:13px 0 10px;font:600 31px/1.05 Georgia,"Microsoft YaHei UI",serif}.brand span{display:block;color:var(--signal)}.aside-copy{margin:0;color:var(--muted);font-size:13px;line-height:1.8}.invariant{position:absolute;left:28px;right:28px;bottom:34px;padding-top:16px;border-top:1px solid var(--line);color:#71817c;font-size:11px;line-height:1.7}
    main{min-width:0;padding:34px 42px 30px;overflow:auto}.topline{display:flex;align-items:flex-end;justify-content:space-between;gap:24px;margin-bottom:24px}.topline h1{margin:0;font:600 25px/1.2 Georgia,"Microsoft YaHei UI",serif}.topline p{margin:6px 0 0;color:var(--muted);font-size:13px}.add{border:1px solid var(--signal);border-radius:8px;background:var(--signal);color:#07100e;padding:10px 16px;font-weight:700;cursor:pointer;box-shadow:0 8px 28px rgba(115,224,177,.12)}.add:hover{filter:brightness(1.08)}
    .failure{display:grid;grid-template-columns:auto 1fr;gap:8px 14px;margin:0 0 18px;padding:13px 15px;border:1px solid rgba(255,127,132,.32);border-left:3px solid var(--danger);background:rgba(255,127,132,.06);border-radius:7px;font-size:12px}.failure strong{color:var(--danger)}.failure span{color:#d6b6b8;white-space:pre-wrap;max-height:72px;overflow:auto}
    #status{min-height:21px;margin:0 0 10px;color:var(--warn);font-size:12px;white-space:pre-wrap}.client-list{display:grid;gap:11px}.client{position:relative;display:grid;grid-template-columns:minmax(0,1fr) auto;gap:16px;padding:17px 18px;border:1px solid var(--line);border-radius:11px;background:linear-gradient(120deg,rgba(18,30,27,.96),rgba(12,21,19,.96));box-shadow:0 10px 35px rgba(0,0,0,.14)}.client.active{border-color:rgba(115,224,177,.55);box-shadow:inset 3px 0 0 var(--signal),0 10px 35px rgba(0,0,0,.18)}.client-head{display:flex;align-items:center;gap:8px;min-width:0}.client-name{font:700 15px/1.3 Bahnschrift,"Microsoft YaHei UI",sans-serif;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}.badge{padding:3px 7px;border-radius:999px;border:1px solid var(--line);color:var(--muted);font-size:10px;white-space:nowrap}.badge.ready{color:var(--signal);border-color:rgba(115,224,177,.36)}.badge.build{color:var(--warn);border-color:rgba(244,184,96,.36)}.client-path{margin-top:8px;color:#96aaa4;font:12px/1.5 Consolas,monospace;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}.issues{margin-top:7px;color:#d99498;font-size:11px;line-height:1.5;white-space:pre-wrap}.actions{display:flex;align-items:center;gap:7px}.actions button{border:1px solid #395049;border-radius:7px;background:#15231f;color:var(--ink);padding:8px 12px;cursor:pointer;white-space:nowrap}.actions button.primary{border-color:var(--signal);background:var(--signal);color:#07100e;font-weight:700}.actions button.danger{color:#c99598}.actions button:disabled{opacity:.42;cursor:not-allowed}.empty{padding:45px 24px;border:1px dashed var(--line);border-radius:11px;color:var(--muted);text-align:center}
    @media(max-width:760px){#root{grid-template-columns:1fr}aside{display:none}main{padding:26px 24px}.client{grid-template-columns:1fr}.actions{justify-content:flex-start}}
  </style>
</head>
<body><div id="root">
  <aside><div class="brand">DSH <span>启动器</span></div><p class="aside-copy">选择要启动的 DeepSeek Harness。</p><div class="invariant">不扫描磁盘<br>不修改 DSH 和插件</div></aside>
  <main><div class="topline"><h1>选择要启动的 DSH</h1><button class="add" id="add">添加客户端</button></div>${failure}<div id="status" role="status"></div><div class="client-list" id="clients"><div class="empty">正在检测客户端……</div></div></main>
</div>
<script>
const list=document.getElementById('clients');const status=document.getElementById('status');
function setStatus(value){status.textContent=value||''}
window.addEventListener('error',event=>{setStatus('启动器页面错误：'+(event.error&&event.error.message?event.error.message:event.message))});window.addEventListener('unhandledrejection',event=>{setStatus('启动器通信错误：'+String(event.reason))});
function button(label,className,handler,disabled){const el=document.createElement('button');el.textContent=label;el.className=className||'';el.disabled=Boolean(disabled);el.addEventListener('click',handler);return el}
async function act(task){setStatus('');try{const result=await task();if(result&&result.error)setStatus(result.error);if(!result||!result.restarting)await refresh()}catch(error){setStatus(String(error))}}
function renderClient(client){const card=document.createElement('article');card.className='client'+(client.active?' active':'');const body=document.createElement('div');const head=document.createElement('div');head.className='client-head';const name=document.createElement('div');name.className='client-name';name.textContent=client.name;head.append(name);const source=document.createElement('span');source.className='badge';source.textContent=client.source==='folder'?'上一级':'已保存';head.append(source);if(client.active){const active=document.createElement('span');active.className='badge ready';active.textContent='默认';head.append(active)}const state=document.createElement('span');state.className='badge '+(client.ready?'ready':client.canBuild?'build':'');state.textContent=client.ready?'可启动':client.canBuild?'需要构建':'不可用';head.append(state);body.append(head);const path=document.createElement('div');path.className='client-path';path.textContent=client.root;body.append(path);if(client.version){const version=document.createElement('div');version.className='client-path';version.textContent='DSH '+client.version+(client.layout?' · '+client.layout:'');body.append(version)}if(client.issues.length){const issues=document.createElement('div');issues.className='issues';issues.textContent=client.issues.map(String).join(String.fromCharCode(10));body.append(issues)}const actions=document.createElement('div');actions.className='actions';if(client.ready)actions.append(button(client.active?'重新启动':'启动','primary',()=>act(()=>window.dshDesktop.startRuntime(client.id)),false));else if(client.canBuild)actions.append(button('构建并启动','primary',()=>act(()=>window.dshDesktop.prepareRuntime(client.id)),false));else actions.append(button('启动','primary',()=>{},true));actions.append(button('重新检测','',()=>act(()=>Promise.resolve({})),false));if(client.saved)actions.append(button('移除','danger',()=>act(()=>window.dshDesktop.removeRuntime(client.id)),false));card.append(body,actions);return card}
async function refresh(){try{if(!window.dshDesktop||typeof window.dshDesktop.listRuntimes!=='function')throw new Error('启动器通信接口未加载，请重新安装客户端启动器。');const result=await Promise.race([window.dshDesktop.listRuntimes(),new Promise((_,reject)=>setTimeout(()=>reject(new Error('客户端检测超时，请点击重新启动或重新安装客户端启动器。')),5000))]);list.replaceChildren();for(const client of result.clients)list.append(renderClient(client));if(result.clients.length===0){const empty=document.createElement('div');empty.className='empty';empty.textContent='尚未配置 DSH 客户端。';list.append(empty)}if(result.error)setStatus(result.error)}catch(error){list.replaceChildren();const failed=document.createElement('div');failed.className='empty';failed.textContent='客户端检测失败';list.append(failed);setStatus(error instanceof Error?error.message:String(error))}}
document.getElementById('add').addEventListener('click',()=>act(()=>window.dshDesktop.addRuntime()));void refresh();
</script></body></html>`
}
