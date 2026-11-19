import { monkeyAudio } from './audio';
import { PeerRoom } from './peer-room';
import type { PlayerProfile } from './types';

export interface MonkeyHudOptions<TMessage = unknown> {
  slug: string;
  title: string;
  /** Pass a PeerRoom instance to automatically render the Co-op Room popover in the top bar */
  room?: PeerRoom<TMessage>;
  /** Custom hint shown in the compact HUD pill */
  hint?: string;
}

export interface MonkeyHudHandle {
  toast: (message: string, tone?: 'banana' | 'chaos' | 'info') => void;
  setPlayers: (players: PlayerProfile[]) => void;
  destroy: () => void;
}

const STYLE_ID = 'monkey-sdk-hud-styles';

function ensureStyles(): void {
  if (typeof document === 'undefined' || document.getElementById(STYLE_ID)) return;
  const style = document.createElement('style');
  style.id = STYLE_ID;
  style.textContent = `
    .msdk-bar {
      position: fixed;
      top: 10px;
      left: 10px;
      z-index: 9999;
      display: flex;
      align-items: center;
      gap: 6px;
      font-family: system-ui, -apple-system, 'Segoe UI', sans-serif;
      pointer-events: auto;
    }
    .msdk-btn {
      background: rgba(17, 24, 39, 0.88);
      color: #fef08a;
      border: 2px solid #facc15;
      border-radius: 999px;
      padding: 6px 12px;
      font-size: 12px;
      font-weight: 800;
      cursor: pointer;
      display: inline-flex;
      align-items: center;
      gap: 5px;
      box-shadow: 0 3px 0 rgba(0,0,0,0.45);
      transition: transform 0.1s ease, background 0.15s ease;
    }
    .msdk-btn:hover { background: #1f2937; transform: translateY(-1px); }
    .msdk-btn:active { transform: translateY(1px); }
    .msdk-btn.msdk-green { border-color: #4ade80; color: #bbf7d0; }
    .msdk-panel {
      position: fixed;
      top: 52px;
      left: 10px;
      z-index: 9999;
      width: 270px;
      background: rgba(17, 24, 39, 0.96);
      color: #f9fafb;
      border: 2px solid #facc15;
      border-radius: 14px;
      padding: 12px;
      font-family: system-ui, -apple-system, 'Segoe UI', sans-serif;
      box-shadow: 0 12px 30px rgba(0,0,0,0.55);
      display: none;
    }
    .msdk-panel.open { display: block; }
    .msdk-panel h4 { margin: 0 0 8px; font-size: 14px; color: #fde047; }
    .msdk-row { display: flex; gap: 6px; margin-bottom: 8px; }
    .msdk-input {
      flex: 1;
      min-width: 0;
      background: #0f172a;
      color: #fff;
      border: 1px solid #334155;
      border-radius: 8px;
      padding: 6px 8px;
      font-size: 12px;
    }
    .msdk-players { display: flex; flex-wrap: wrap; gap: 4px; margin-top: 6px; }
    .msdk-chip {
      font-size: 11px;
      font-weight: 700;
      padding: 2px 7px;
      border-radius: 999px;
      background: #1e293b;
      border: 1px solid rgba(255,255,255,0.15);
    }
    .msdk-status { font-size: 11px; color: #94a3b8; margin-top: 4px; }
    .msdk-toast-wrap {
      position: fixed;
      bottom: 16px;
      right: 16px;
      z-index: 9999;
      display: flex;
      flex-direction: column;
      gap: 6px;
      pointer-events: none;
      font-family: system-ui, -apple-system, 'Segoe UI', sans-serif;
    }
    .msdk-toast {
      background: rgba(17, 24, 39, 0.94);
      color: #fef08a;
      border: 2px solid #facc15;
      border-radius: 10px;
      padding: 8px 14px;
      font-size: 13px;
      font-weight: 700;
      box-shadow: 0 8px 20px rgba(0,0,0,0.4);
      animation: msdk-pop 0.2s ease;
    }
    .msdk-toast.chaos { border-color: #fb7185; color: #fecdd3; }
    .msdk-toast.info { border-color: #38bdf8; color: #e0f2fe; }
    @keyframes msdk-pop {
      from { opacity: 0; transform: translateY(8px) scale(0.95); }
      to { opacity: 1; transform: translateY(0) scale(1); }
    }
  `;
  document.head.appendChild(style);
}

export function mountMonkeyHud<TMessage = unknown>(
  options: MonkeyHudOptions<TMessage>,
): MonkeyHudHandle {
  ensureStyles();

  const bar = document.createElement('div');
  bar.className = 'msdk-bar';

  const backBtn = document.createElement('button');
  backBtn.className = 'msdk-btn';
  backBtn.textContent = '🍌 Click Macacos';
  backBtn.title = 'Voltar para o Portal Click Macacos';
  backBtn.onclick = () => {
    monkeyAudio.play('click');
    if (window.parent !== window) {
      window.parent.postMessage({ source: 'monkey-slop-game', type: 'exit', slug: options.slug }, '*');
    } else {
      window.location.href = '../../index.html';
    }
  };
  bar.appendChild(backBtn);

  const muteBtn = document.createElement('button');
  muteBtn.className = 'msdk-btn';
  const syncMuteLabel = () => {
    muteBtn.textContent = monkeyAudio.isMuted() ? '🔇 Som' : '🔊 Som';
  };
  syncMuteLabel();
  muteBtn.onclick = () => {
    monkeyAudio.toggleMute();
    syncMuteLabel();
    if (!monkeyAudio.isMuted()) monkeyAudio.play('banana', 0.2);
  };
  bar.appendChild(muteBtn);

  let panel: HTMLDivElement | null = null;
  let playersWrap: HTMLDivElement | null = null;
  let statusLine: HTMLDivElement | null = null;

  const toastWrap = document.createElement('div');
  toastWrap.className = 'msdk-toast-wrap';
  document.body.appendChild(toastWrap);

  const toast = (message: string, tone: 'banana' | 'chaos' | 'info' = 'banana') => {
    const el = document.createElement('div');
    el.className = `msdk-toast ${tone}`;
    el.textContent = message;
    toastWrap.appendChild(el);
    window.setTimeout(() => el.remove(), 3200);
  };

  if (options.room) {
    const room = options.room;
    const coopBtn = document.createElement('button');
    coopBtn.className = 'msdk-btn msdk-green';
    coopBtn.textContent = '🐒 Co-op Online';
    bar.appendChild(coopBtn);

    panel = document.createElement('div');
    panel.className = 'msdk-panel';
    panel.innerHTML = `
      <h4>🐒 Sala Co-op P2P (WebRTC)</h4>
      <div class="msdk-row">
        <input class="msdk-input" id="msdk-name" placeholder="Seu apelido" maxlength="20" />
      </div>
      <div class="msdk-row">
        <button class="msdk-btn msdk-green" id="msdk-host" style="flex:1;justify-content:center;">Criar Sala</button>
        <button class="msdk-btn" id="msdk-copy" style="display:none;">Copiar Link</button>
      </div>
      <div class="msdk-row">
        <input class="msdk-input" id="msdk-code" placeholder="Codigo ex: A1B2" maxlength="8" />
        <button class="msdk-btn" id="msdk-join">Entrar</button>
      </div>
      <div class="msdk-status" id="msdk-status">Offline (Modo Solo / Local)</div>
      <div class="msdk-players" id="msdk-players"></div>
    `;
    document.body.appendChild(panel);

    const nameInput = panel.querySelector<HTMLInputElement>('#msdk-name')!;
    const codeInput = panel.querySelector<HTMLInputElement>('#msdk-code')!;
    const hostBtn = panel.querySelector<HTMLButtonElement>('#msdk-host')!;
    const copyBtn = panel.querySelector<HTMLButtonElement>('#msdk-copy')!;
    const joinBtn = panel.querySelector<HTMLButtonElement>('#msdk-join')!;
    statusLine = panel.querySelector<HTMLDivElement>('#msdk-status')!;
    playersWrap = panel.querySelector<HTMLDivElement>('#msdk-players')!;

    nameInput.value = room.localPlayer.name;
    nameInput.onchange = () => room.setPlayerName(nameInput.value);

    coopBtn.onclick = () => {
      monkeyAudio.play('click');
      panel?.classList.toggle('open');
    };

    hostBtn.onclick = async () => {
      try {
        statusLine!.textContent = 'Criando sala P2P...';
        const code = await room.hostRoom(nameInput.value);
        statusLine!.textContent = `Sala aberta! Codigo: ${code}`;
        copyBtn.style.display = 'inline-flex';
        coopBtn.textContent = `🐒 Sala ${code}`;
        toast(`Sala ${code} criada! Mande o link pros amigos!`, 'banana');
      } catch (err) {
        statusLine!.textContent = `Erro: ${(err as Error).message}`;
      }
    };

    copyBtn.onclick = async () => {
      const url = room.getShareUrl();
      if (!url) return;
      try {
        await navigator.clipboard.writeText(url);
        toast('Link da sala copiado! Jogue no Discord!', 'info');
      } catch {
        toast(`Codigo da sala: ${room.roomCode}`, 'info');
      }
    };

    joinBtn.onclick = async () => {
      const code = codeInput.value.trim();
      if (!code) return;
      try {
        statusLine!.textContent = `Entrando na sala ${code.toUpperCase()}...`;
        await room.joinRoom(code, nameInput.value);
        statusLine!.textContent = `Conectado na sala ${room.roomCode}!`;
        coopBtn.textContent = `🐒 Sala ${room.roomCode}`;
        toast(`Conectado na macacada (${room.roomCode})!`, 'banana');
      } catch (err) {
        statusLine!.textContent = `Erro: ${(err as Error).message}`;
      }
    };

    // Auto-join if ?room=XXXX is in the URL
    const autoRoom = room.getRoomFromUrl();
    if (autoRoom) {
      codeInput.value = autoRoom;
      void room
        .joinRoom(autoRoom, nameInput.value)
        .then(() => {
          statusLine!.textContent = `Conectado na sala ${room.roomCode}!`;
          coopBtn.textContent = `🐒 Sala ${room.roomCode}`;
          toast(`Entrou direto na sala ${room.roomCode}!`, 'banana');
        })
        .catch(() => {
          statusLine!.textContent = `Nao foi possivel entrar automaticamente em ${autoRoom}.`;
        });
    }
  }

  document.body.appendChild(bar);

  const setPlayers = (players: PlayerProfile[]) => {
    if (!playersWrap) return;
    playersWrap.innerHTML = '';
    for (const p of players) {
      const chip = document.createElement('span');
      chip.className = 'msdk-chip';
      chip.style.borderColor = p.color;
      chip.style.color = p.color;
      chip.textContent = `${p.isHost ? '👑 ' : '🐒 '}${p.name}`;
      playersWrap.appendChild(chip);
    }
  };

  return {
    toast,
    setPlayers,
    destroy: () => {
      bar.remove();
      panel?.remove();
      toastWrap.remove();
    },
  };
}
