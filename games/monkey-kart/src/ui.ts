import { DRIVERS } from './drivers';
import { getKartSprite } from './kartsprite';
import { portraitCanvas } from './monkeyart';
import { TRACK_DEFS } from './tracks';
import { CC_SETTINGS, EXPR_HAPPY, EXPR_NORMAL, GP_POINTS, ITEM_INFO, ITEM_TYPES } from './types';
import { fmtTime } from './util';

const urlCache = new Map<string, string>();
export function faceUrl(driver: number, expr = EXPR_NORMAL): string {
  const k = `f${driver}|${expr}`;
  let u = urlCache.get(k);
  if (!u) {
    u = portraitCanvas(driver, expr, 96).toDataURL();
    urlCache.set(k, u);
  }
  return u;
}
export function kartUrl(driver: number): string {
  const k = `k${driver}`;
  let u = urlCache.get(k);
  if (!u) {
    // 3/4 front view
    u = getKartSprite(driver, 9, EXPR_NORMAL).toDataURL();
    urlCache.set(k, u);
  }
  return u;
}

export interface Setup {
  mode: 'solo' | 'local2p' | 'online';
  format: 'gp' | 'single';
  cc: number;
  track: number;
  pick: [number, number];
  editing: 0 | 1;
}

export interface LobbyInfo {
  isHost: boolean;
  connected: boolean;
  code: string | null;
  players: { id: string; name: string; driver: number; host: boolean }[];
}

export function titleHtml(): string {
  const parade = DRIVERS.map((d) => `<img src="${kartUrl(d.id)}" alt="${d.nick}"/>`).join('');
  return `
  <div class="mk-screen">
    <div class="mk-logo"><div class="l1">MICO KART</div><div class="l2">🍌 Corrida da Casca 🍌</div></div>
    <div class="mk-parade">${parade}</div>
    <div class="mk-menu">
      <button class="mk-btn" data-act="mode" data-v="solo">🏁 Solo contra a macacada (CPUs)</button>
      <button class="mk-btn alt" data-act="mode" data-v="local2p">👥 2 Jogadores — tela dividida</button>
      <button class="mk-btn green" data-act="mode" data-v="online">🌐 Online P2P (até 6 macacos)</button>
      <button class="mk-btn ghost" data-act="help">❓ Como jogar</button>
    </div>
    <div class="mk-small">8 pilotos • 4 pistas com atalhos • drift com mini-turbo • 6 itens • Grand Prix com pontos</div>
  </div>`;
}

export function helpHtml(): string {
  const items = ITEM_TYPES.map((t) => `<div>${ITEM_INFO[t].emoji} <b>${ITEM_INFO[t].name}</b> — ${ITEM_INFO[t].hint}</div>`).join('');
  return `
  <div class="mk-screen">
    <div class="mk-h">Como jogar</div>
    <div class="mk-panel mk-help">
      <div><b>Solo / Online:</b> <kbd>W</kbd><kbd>A</kbd><kbd>S</kbd><kbd>D</kbd> ou setas • <b>Drift</b>: segure <kbd>Shift</kbd> (ou <kbd>X</kbd>) e vire • <b>Item</b>: <kbd>Espaço</kbd> (ou <kbd>Z</kbd>) • <kbd>R</kbd> reinicia • <kbd>P</kbd>/<kbd>Esc</kbd> pausa</div>
      <div><b>2P:</b> P1 <kbd>WASD</kbd> + <kbd>Q</kbd> drift + <kbd>E</kbd> item • P2 setas + <kbd>.</kbd> / <kbd>Shift dir.</kbd> drift + <kbd>/</kbd> / <kbd>Enter</kbd> item</div>
      <div><b>Controle:</b> A acelera, B ré, RB drift, X item. <b>Celular:</b> botões na tela.</div>
      <div style="margin-top:8px"><b>Drift:</b> aperte drift e vire. Faíscas <span style="color:#38bdf8">azuis</span> → <span style="color:#fb923c">laranjas</span> → <span style="color:#d946ef">roxas</span>. Solte pra ganhar o mini-turbo!</div>
      <div><b>Largada:</b> aperte acelerar só no "2" do 3-2-1 pra largar queimando. Cedo demais afoga o motor!</div>
      <div><b>Atalhos:</b> caminhos de terra/ponte em laranja no mapa. Só vale a pena com turbo (Guaraná, mini-turbo ou pad) — sem ele a grama segura você.</div>
      <div><b>Cair da pista:</b> o Guindaste Macaco te resgata, mas você perde um tempão.</div>
      <div style="margin-top:8px"><b>Itens (quanto pior sua posição, mais forte o item):</b></div>
      ${items}
      <div style="margin-top:6px"><b>Grand Prix:</b> 4 pistas, pontos 15-12-10-8-6-4-2-1. Quem somar mais leva a Banana de Ouro.</div>
    </div>
    <div class="mk-menu" style="margin-top:12px"><button class="mk-btn ghost" data-act="back">◀ Voltar</button></div>
  </div>`;
}

function statBar(label: string, v: number, lo: number, hi: number): string {
  const p = Math.round(((v - lo) / (hi - lo)) * 100);
  return `<div class="mk-bar"><b>${label}</b><i><em style="width:${Math.max(8, Math.min(100, p))}%"></em></i></div>`;
}

export function setupHtml(s: Setup, lobby: LobbyInfo | null, takenOnline: Set<number>): string {
  const title = s.mode === 'solo' ? 'Solo vs CPUs' : s.mode === 'local2p' ? '2 Jogadores — tela dividida' : 'Corrida Online P2P';
  const online = s.mode === 'online';
  const guest = online && lobby && !lobby.isHost;
  const cards = DRIVERS.map((d) => {
    const sel1 = s.pick[0] === d.id;
    const sel2 = s.mode === 'local2p' && s.pick[1] === d.id;
    const taken = online && takenOnline.has(d.id) && !sel1;
    return `<div class="mk-card ${sel1 ? 'sel' : ''} ${sel2 ? 'sel2' : ''} ${taken ? 'taken' : ''}" data-act="driver" data-v="${d.id}">
      ${sel1 ? `<div class="tag">${s.mode === 'local2p' ? 'P1' : 'VOCÊ'}</div>` : ''}${sel2 ? '<div class="tag b">P2</div>' : ''}
      <img class="face" src="${faceUrl(d.id)}" alt=""/>
      <img class="kart" src="${kartUrl(d.id)}" alt=""/>
      <div class="nm" style="color:${d.color}">${d.name}</div>
      <div class="kn">${d.kart.name}</div>
      ${statBar('Vel', d.top, 0.9, 1.1)}${statBar('Acel', d.accel, 0.8, 1.22)}${statBar('Curva', d.handling, 0.85, 1.2)}${statBar('Peso', d.weight, 0.7, 1.4)}
      <div class="kn" style="margin-top:4px">${d.tagline}</div>
    </div>`;
  }).join('');
  const tracks = TRACK_DEFS.map((t, i) => {
    const bg: Record<string, string> = {
      jungle: 'linear-gradient(135deg,#14532d,#0f766e)',
      favela: 'linear-gradient(135deg,#7c2d12,#be185d)',
      beach: 'linear-gradient(135deg,#0369a1,#f59e0b)',
      space: 'linear-gradient(135deg,#1e1b4b,#7e22ce)',
    };
    return `<div class="mk-track ${s.track === i ? 'sel' : ''}" data-act="track" data-v="${i}" style="background:${bg[t.theme]}">
      <div class="em">${t.emoji}</div><div class="nm">${i + 1}. ${t.name}</div><div class="sb">${t.subtitle}</div><div class="ht">⚡ ${t.bestHint}</div></div>`;
  }).join('');
  const lobbyHtml =
    online && lobby
      ? `<div class="mk-lobby">${
          lobby.connected
            ? `<b>Sala ${lobby.code ?? ''}</b> ${lobby.isHost ? '(você é o host 👑)' : '(aguardando o host)'}<br/>${lobby.players
                .map((p) => `<span class="pp"><img src="${faceUrl(p.driver)}" alt=""/>${p.host ? '👑 ' : ''}${p.name}</span>`)
                .join('')}`
            : '🌐 Clique em <b>🐒 Co-op Online</b> (canto superior esquerdo) para criar ou entrar numa sala. Os CPUs completam o grid até 8 macacos!'
        }</div>`
      : '';
  const canStart = !online || (lobby?.connected && lobby.isHost);
  return `
  <div class="mk-screen">
    <div class="mk-h">${title}</div>
    ${lobbyHtml}
    ${
      s.mode === 'local2p'
        ? `<div class="mk-seg" style="margin-bottom:6px"><button class="${s.editing === 0 ? 'on' : ''}" data-act="edit" data-v="0">Escolhendo: P1</button><button class="${s.editing === 1 ? 'on' : ''}" data-act="edit" data-v="1">Escolhendo: P2</button></div>`
        : ''
    }
    <div class="mk-row">${cards}</div>
    ${
      guest
        ? '<div class="mk-small">O host escolhe a pista e o modo. Escolha seu macaco e aguarde a largada!</div>'
        : `
    <div class="mk-h">Formato</div>
    <div class="mk-seg">
      <button class="${s.format === 'gp' ? 'on' : ''}" data-act="format" data-v="gp">🏆 Grand Prix (4 pistas)</button>
      <button class="${s.format === 'single' ? 'on' : ''}" data-act="format" data-v="single">⚡ Corrida rápida</button>
    </div>
    ${s.format === 'single' ? `<div class="mk-h">Pista</div><div class="mk-row">${tracks}</div>` : '<div class="mk-small">Selva → Favela → Praia → Estação Espacial. Pontos: ' + GP_POINTS.join(' · ') + '</div>'}
    <div class="mk-h">Dificuldade</div>
    <div class="mk-seg">${CC_SETTINGS.map((c, i) => `<button class="${s.cc === i ? 'on' : ''}" data-act="cc" data-v="${i}">${c.name} — ${c.label}</button>`).join('')}</div>`
    }
    <div class="mk-menu" style="margin-top:18px">
      ${guest ? '<button class="mk-btn" disabled>⏳ Aguardando o host largar…</button>' : `<button class="mk-btn green" data-act="start" ${canStart ? '' : 'disabled'}>🏁 LARGAR!</button>`}
      <button class="mk-btn ghost" data-act="back">◀ Voltar</button>
    </div>
  </div>`;
}

export interface ResultRow {
  place: number;
  driver: number;
  name: string;
  time: number;
  pts: number;
  total: number;
  me: boolean;
  best: number;
}

export function resultsHtml(rows: ResultRow[], trackName: string, gp: boolean, last: boolean, canAdvance: boolean, online: boolean, waitingText: string): string {
  const list = rows
    .map(
      (r) => `<div class="r ${r.me ? 'me' : ''}"><span>${r.place}º</span><img src="${faceUrl(r.driver, r.place === 1 ? EXPR_HAPPY : EXPR_NORMAL)}" alt=""/><span>${r.name}</span><span class="tm">${r.place <= 8 && isFinite(r.time) ? fmtTime(r.time) : ''}</span><span class="pt">${gp ? `+${r.pts} (${r.total})` : ''}</span></div>`,
    )
    .join('');
  return `
  <div class="mk-screen clear">
    <div class="mk-panel">
      <div class="mk-h" style="margin-top:0">🏁 ${trackName}</div>
      <div class="mk-res">${list}</div>
      <div class="mk-menu" style="width:100%">
        ${canAdvance ? (gp ? `<button class="mk-btn green" data-act="next">${last ? '🏆 Ver o campeão!' : 'Próxima pista ▶'}</button>` : `<button class="mk-btn green" data-act="again">🔁 Correr de novo</button>`) : `<div class="mk-small">${waitingText}</div>`}
        ${!online ? '<button class="mk-btn alt" data-act="again">↻ Repetir esta pista</button>' : ''}
        <button class="mk-btn ghost" data-act="menu">Menu principal</button>
      </div>
    </div>
  </div>`;
}

export function podiumHtml(top: { driver: number; name: string; total: number }[], canMenu: boolean): string {
  const order = [top[1], top[0], top[2]].filter(Boolean);
  const heights = [top[1] ? 90 : 0, 130, top[2] ? 64 : 0];
  const cols = ['#cbd5e1', '#facc15', '#fdba74'];
  const medals = ['🥈', '🥇', '🥉'];
  const blocks = order
    .map((p, i) => {
      const idx = top.indexOf(p);
      void idx;
      return `<div class="pl"><img src="${kartUrl(p.driver)}" alt=""/><div style="color:${i === 1 ? '#fde047' : '#fff'}">${p.name}</div><div style="font-size:13px;color:#a7f3d0">${p.total} pts</div><div class="blk" style="height:${heights[i]}px;background:${cols[i]};color:#422006">${medals[i]}</div></div>`;
    })
    .join('');
  return `
  <div class="mk-screen">
    <div class="mk-logo"><div class="l1" style="font-size:clamp(34px,7vw,64px)">BANANA DE OURO!</div><div class="l2">${top[0].name}: "${DRIVERS[top[0].driver].quotes.win}"</div></div>
    <div class="mk-podium">${blocks}</div>
    <div class="mk-menu"><button class="mk-btn green" data-act="menu" ${canMenu ? '' : 'disabled'}>Voltar ao menu</button></div>
  </div>`;
}

export function pauseHtml(online: boolean): string {
  return `
  <div class="mk-screen clear">
    <div class="mk-panel" style="text-align:center">
      <div class="mk-h" style="margin-top:0">${online ? 'Menu' : '⏸ Pausado'}</div>
      <div class="mk-menu" style="margin:0 auto">
        <button class="mk-btn green" data-act="resume">▶ Continuar</button>
        ${online ? '' : '<button class="mk-btn alt" data-act="restart">↻ Reiniciar corrida</button>'}
        <button class="mk-btn ghost" data-act="menu">Sair para o menu</button>
      </div>
    </div>
  </div>`;
}
