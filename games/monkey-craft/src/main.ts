import { PeerRoom, mountMonkeyHud, type PlayerProfile } from '@monkey-slop/sdk';
import { craftAudio } from './audio';
import { Game } from './game';
import { NetSync } from './net';
import { Renderer } from './render';
import { SLUG, type NetMsg } from './types';

const canvas = document.getElementById('game-canvas') as HTMLCanvasElement;
const $ = <T extends HTMLElement>(id: string) => document.getElementById(id) as T;

const g = new Game();
g.input.attach(canvas);
const renderer = new Renderer(canvas, g);

let hud!: ReturnType<typeof mountMonkeyHud>;
let sawHost = false;
let paused = false;

function leaveGuest(msg: string): void {
  if (g.role !== 'guest' && g.state !== 'loading') return;
  g.role = 'solo';
  g.state = 'title';
  g.remotes.clear();
  g.mobs.clear();
  g.ui.reset();
  paused = false;
  sawHost = false;
  hud?.toast(msg, 'info');
}

const room = new PeerRoom<NetMsg>(SLUG, {
  onStatus: (status, detail) => {
    if (status === 'connected') {
      if (room.localPlayer.isHost) {
        if (g.state !== 'play') {
          if (!g.startContinue()) g.startNew();
        }
        g.role = 'host';
        g.net?.sendNow();
      } else {
        sawHost = false;
        if (g.state === 'play') g.save();
        g.role = 'guest';
        g.state = 'loading';
        paused = false;
        g.net?.requestWorld();
      }
    } else if (status === 'idle') {
      if (g.role === 'guest' || g.state === 'loading') leaveGuest('Desconectado da selva.');
      else if (g.role === 'host') {
        g.role = 'solo';
        g.remotes.clear();
      }
    } else if (status === 'error') {
      hud?.toast(detail ?? 'Erro de conexão', 'chaos');
      if (g.state === 'loading') leaveGuest('Não deu pra entrar na sala.');
    }
  },
  onPlayersChange: (players: PlayerProfile[]) => {
    hud?.setPlayers(players);
    g.syncRoster(players);
    if (g.role === 'guest') {
      if (players.some((p) => p.isHost)) sawHost = true;
      else if (sawHost) {
        room.disconnect();
      }
    }
  },
  onMessage: (env) => {
    if (env.type === 'c') g.net?.handle(env);
  },
});
g.room = room;
g.net = new NetSync(g, room);

hud = mountMonkeyHud({ slug: SLUG, title: 'Macacraft', room, hint: 'Cava, constrói e banana' });
g.toast = hud.toast;
g.initDemo();

// ---------------------------------------------------------------- overlays
const titleEl = $('title');
const pauseEl = $('pause');
const loadingEl = $('loading');
const btnContinue = $<HTMLButtonElement>('btn-continue');
const seedInput = $<HTMLInputElement>('seed');
const codeInput = $<HTMLInputElement>('join-code');
let confirmNew = false;

function seedFrom(text: string): number | undefined {
  const t = text.trim();
  if (!t) return undefined;
  if (/^\d+$/.test(t)) return Number(t) % 2147483647;
  let h = 7;
  for (let i = 0; i < t.length; i++) h = (Math.imul(h, 31) + t.charCodeAt(i)) >>> 0;
  return h % 2147483647;
}

function startNewWorld(): void {
  craftAudio.ui();
  g.startNew(seedFrom(seedInput.value));
  paused = false;
}

$('btn-new').onclick = startNewWorld;
btnContinue.onclick = () => {
  craftAudio.ui();
  if (!g.startContinue()) hud.toast('Nenhum mundo salvo ainda!', 'chaos');
  paused = false;
};
$('btn-host').onclick = async () => {
  craftAudio.ui();
  try {
    const code = await room.hostRoom();
    hud.toast(`Sala ${code} aberta! Mande o link pros amigos 🐒`, 'banana');
  } catch (e) {
    hud.toast(`Erro: ${(e as Error).message}`, 'chaos');
  }
};
$('btn-join').onclick = async () => {
  craftAudio.ui();
  const code = codeInput.value.trim();
  if (!code) {
    hud.toast('Digite o código da sala (ex: A1B2)', 'chaos');
    return;
  }
  try {
    await room.joinRoom(code);
  } catch (e) {
    hud.toast(`Erro: ${(e as Error).message}`, 'chaos');
    if (g.state === 'loading') leaveGuest('Falha ao entrar.');
  }
};
$('btn-resume').onclick = () => {
  paused = false;
};
$('btn-save').onclick = () => {
  if (room.roomCode) room.disconnect();
  g.quitToTitle();
  paused = false;
};
const btnPauseNew = $<HTMLButtonElement>('btn-pause-new');
btnPauseNew.onclick = () => {
  if (!confirmNew) {
    confirmNew = true;
    btnPauseNew.textContent = '⚠️ Apagar este mundo? Clique de novo';
    return;
  }
  confirmNew = false;
  btnPauseNew.textContent = '🌍 Novo Mundo (reiniciar)';
  if (room.roomCode) room.disconnect();
  g.reportScore();
  g.startNew();
  paused = false;
};

function syncOverlays(): void {
  const t = g.state === 'title';
  titleEl.classList.toggle('show', t);
  loadingEl.classList.toggle('show', g.state === 'loading');
  pauseEl.classList.toggle('show', g.state === 'play' && paused);
  btnContinue.disabled = !g.hasSave();
  if (!paused && confirmNew) {
    confirmNew = false;
    btnPauseNew.textContent = '🌍 Novo Mundo (reiniciar)';
  }
}

window.addEventListener('keydown', (e) => {
  const tag = (e.target as HTMLElement | null)?.tagName;
  if (tag === 'INPUT') {
    if (e.key === 'Enter' && e.target === codeInput) $('btn-join').click();
    return;
  }
  if (e.key === 'Escape' && g.state === 'play') {
    if (g.ui.open) g.ui.toggle(g);
    else paused = !paused;
  }
});

// ---------------------------------------------------------------- toque
if (window.matchMedia('(pointer: coarse)').matches) {
  const touch = $('touch');
  touch.classList.add('show');
  const hold = (id: string, key: string) => {
    const el = $(id);
    const on = (e: Event) => {
      e.preventDefault();
      if (!g.input.keys.has(key)) g.input.pressed.add(key);
      g.input.keys.add(key);
    };
    const off = (e: Event) => {
      e.preventDefault();
      g.input.keys.delete(key);
    };
    el.addEventListener('pointerdown', on);
    el.addEventListener('pointerup', off);
    el.addEventListener('pointercancel', off);
    el.addEventListener('pointerleave', off);
  };
  hold('t-left', 'a');
  hold('t-right', 'd');
  hold('t-jump', 'space');
  hold('t-down', 's');
  const modeBtn = $('t-mode');
  modeBtn.onclick = () => {
    g.input.touchPlace = !g.input.touchPlace;
    modeBtn.textContent = g.input.touchPlace ? '🧱' : '⛏️';
  };
  $('t-inv').onclick = () => g.input.pressed.add('e');
  $('t-pause').onclick = () => {
    paused = !paused;
  };
  $('t-emote').onclick = () => g.input.pressed.add('q');
}

// ---------------------------------------------------------------- loop
let last = performance.now();
function frame(now: number): void {
  const dt = Math.min(0.1, (now - last) / 1000);
  last = now;
  if (g.state === 'loading' && g.net?.tickLoading(dt)) {
    hud.toast('O host não respondeu. Tente de novo!', 'chaos');
    room.disconnect();
    leaveGuest('Tempo esgotado ao baixar o mundo.');
  }
  const frozen = paused && g.role === 'solo';
  if (!frozen) g.update(dt);
  else g.input.endFrame();
  renderer.render();
  syncOverlays();
  requestAnimationFrame(frame);
}
requestAnimationFrame(frame);

function bye(): void {
  g.save();
  g.reportScore();
}
document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'hidden') g.save();
});
window.addEventListener('pagehide', bye);

// teclas e cliques destravam o áudio
window.addEventListener('pointerdown', () => craftAudio.ui(), { once: true });
