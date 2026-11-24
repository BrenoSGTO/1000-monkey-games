import type { PlayerProfile } from '@monkey-slop/sdk';

export interface UiHandlers {
  onSolo: () => void;
  onLocal: () => void;
  onOnline: () => void;
  onStartOnline: () => void;
  onAgain: () => void;
  onMenu: () => void;
}

export class Ui {
  readonly root: HTMLElement;
  total = 20;
  private title: HTMLElement;
  private lobby: HTMLElement;
  private over: HTMLElement;
  private h: UiHandlers;

  constructor(root: HTMLElement, h: UiHandlers) {
    this.root = root;
    this.h = h;
    this.title = this.el('fg-panel fg-title');
    this.lobby = this.el('fg-panel fg-lobby');
    this.over = this.el('fg-panel fg-over');
    this.hideAll();
  }

  private el(cls: string): HTMLElement {
    const d = document.createElement('div');
    d.className = cls;
    this.root.appendChild(d);
    return d;
  }

  hideAll(): void {
    this.title.style.display = 'none';
    this.lobby.style.display = 'none';
    this.over.style.display = 'none';
  }

  private totalSelect(id: string, disabled = false): string {
    const opts = [8, 12, 16, 20, 24]
      .map((n) => `<option value="${n}" ${n === this.total ? 'selected' : ''}>${n} macacos</option>`)
      .join('');
    return `<label class="fg-sel">Participantes <select id="${id}" ${disabled ? 'disabled' : ''}>${opts}</select></label>`;
  }

  showTitle(best: number): void {
    this.hideAll();
    this.title.style.display = 'flex';
    this.title.innerHTML = `
      <div class="fg-logo"><span class="a">FALL</span> <span class="b">MACACOS</span></div>
      <div class="fg-sub">TOMBO ROYALE 🍌</div>
      <button class="fg-btn big" id="fg-solo">▶ JOGAR</button>
      <div class="fg-row">
        <button class="fg-btn" id="fg-local">👥 2 JOGADORES</button>
        <button class="fg-btn green" id="fg-online">🌐 ONLINE</button>
      </div>
      ${this.totalSelect('fg-total')}
      <div class="fg-how">
        <b>Como jogar:</b> até <b>24 macacos</b> caem na selva e vão sendo <b>eliminados</b> a cada rodada
        (corrida, chão que some, gangorra, pega-rabo, futebol de coco…) até sobrar <b>1 campeão</b> com a Coroa da Banana!
        <div class="keys">
          <span><kbd>A</kbd><kbd>D</kbd> mover</span>
          <span><kbd>W</kbd>/<kbd>Espaço</kbd> pular</span>
          <span><kbd>S</kbd>/<kbd>Shift</kbd> mergulhar</span>
          <span><kbd>E</kbd> agarrar</span>
          <span>2P: <kbd>←</kbd><kbd>→</kbd><kbd>↑</kbd> <kbd>↓</kbd> <kbd>Enter</kbd></span>
        </div>
      </div>
      ${best > 0 ? `<div class="fg-best">🏆 Recorde: ${best} pts</div>` : ''}
    `;
    const sel = this.title.querySelector<HTMLSelectElement>('#fg-total')!;
    sel.onchange = () => (this.total = Number(sel.value));
    this.title.querySelector<HTMLButtonElement>('#fg-solo')!.onclick = () => this.h.onSolo();
    this.title.querySelector<HTMLButtonElement>('#fg-local')!.onclick = () => this.h.onLocal();
    this.title.querySelector<HTMLButtonElement>('#fg-online')!.onclick = () => this.h.onOnline();
  }

  showLobby(players: PlayerProfile[], isHost: boolean, code: string | null, connected: boolean): void {
    this.hideAll();
    this.lobby.style.display = 'flex';
    const list = players.length
      ? players.map((p) => `<li>${p.isHost ? '👑' : '🐒'} ${escapeHtml(p.name)}</li>`).join('')
      : '<li class="dim">Ninguém ainda…</li>';
    this.lobby.innerHTML = `
      <div class="fg-logo small"><span class="a">SALA</span> <span class="b">${code ?? '----'}</span></div>
      ${
        connected
          ? ''
          : `<div class="fg-how">Use o botão <b>🐒 Co-op Online</b> no topo para <b>Criar Sala</b> (e mande o link/código pros amigos)
             ou <b>Entrar</b> com um código. Até <b>8 humanos</b> + bots completam a corrida!</div>`
      }
      <ul class="fg-players">${list}</ul>
      ${connected && isHost ? this.totalSelect('fg-total2') : ''}
      ${
        connected
          ? isHost
            ? '<button class="fg-btn big" id="fg-start">🏁 COMEÇAR PARTIDA</button>'
            : '<div class="fg-wait">⏳ Aguardando o host começar…</div>'
          : ''
      }
      <button class="fg-btn small" id="fg-back">← Voltar</button>
    `;
    const sel = this.lobby.querySelector<HTMLSelectElement>('#fg-total2');
    if (sel) sel.onchange = () => (this.total = Number(sel.value));
    const st = this.lobby.querySelector<HTMLButtonElement>('#fg-start');
    if (st) st.onclick = () => this.h.onStartOnline();
    this.lobby.querySelector<HTMLButtonElement>('#fg-back')!.onclick = () => this.h.onMenu();
  }

  showOver(champion: string, mine: string, score: number, canAgain: boolean): void {
    this.hideAll();
    this.over.style.display = 'flex';
    this.over.innerHTML = `
      <div class="fg-logo small"><span class="a">FIM DE</span> <span class="b">JOGO</span></div>
      <div class="fg-champ">👑 ${escapeHtml(champion)} 👑</div>
      <div class="fg-how center">${escapeHtml(mine)}<br/><b>${score} pontos</b></div>
      <div class="fg-row">
        ${canAgain ? '<button class="fg-btn big" id="fg-again">↻ JOGAR DE NOVO</button>' : ''}
        <button class="fg-btn" id="fg-menu">☰ MENU</button>
      </div>
    `;
    const a = this.over.querySelector<HTMLButtonElement>('#fg-again');
    if (a) a.onclick = () => this.h.onAgain();
    this.over.querySelector<HTMLButtonElement>('#fg-menu')!.onclick = () => this.h.onMenu();
  }
}

function escapeHtml(s: string): string {
  return s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!);
}
