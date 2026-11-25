import { CHARS, MKI } from './fighters';
import { STAGES } from './stages';
import { drawFighter, newFighterFx } from './rig';
import { newFighter } from './sim';
import { St, DEFAULT_RULES, type Rules } from './types';
import { sfx } from './sfx';

export type Mode = 'solo' | 'local' | 'online';

export interface SetupSlot {
  kind: 'human' | 'bot' | 'remote' | 'off';
  char: number;
  level: number;
  name: string;
  peerId?: string;
}

export interface Setup {
  mode: Mode;
  slots: SetupSlot[];
  stage: number;
  rules: Rules;
}

export interface ResultRow {
  slot: number;
  name: string;
  char: number;
  kos: number;
  falls: number;
  dealt: number;
  place: number;
  pct: number;
  isBot: boolean;
}

export interface ResultData {
  rows: ResultRow[];
  winner: number;
  quote: string;
  canControl: boolean;
  mode: Mode;
  rules: Rules;
}

export interface UICallbacks {
  onStart(setup: Setup): void;
  onSetupChange(setup: Setup): void;
  onPickOnline(char: number): void;
  onRematch(): void;
  onMenu(): void;
  onResume(): void;
  onRestart(): void;
  onQuit(): void;
}

export interface OnlineInfo {
  connected: boolean;
  isHost: boolean;
  code: string | null;
  mySlot: number;
}

const SLOT_COLORS = ['#ef4444', '#3b82f6', '#facc15', '#22c55e'];
const LEVELS = ['Fácil', 'Médio', 'Difícil'];

const CSS = `
#ms-ui{position:fixed;inset:0;z-index:20;font-family:system-ui,-apple-system,'Segoe UI',Roboto,sans-serif;color:#f8fafc;pointer-events:none}
#ms-ui *{box-sizing:border-box}
.ms-screen{position:absolute;inset:0;display:none;pointer-events:auto;overflow:auto;-webkit-overflow-scrolling:touch}
.ms-screen.on{display:block}
.ms-bg{background:radial-gradient(ellipse at 50% 20%,#7c2d12 0%,#3b0764 55%,#0b0d14 100%)}
.ms-title{min-height:100%;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:14px;padding:70px 16px 28px;text-align:center}
.ms-logo{font-weight:900;font-size:clamp(34px,7vw,78px);line-height:.95;letter-spacing:-1px;color:#fde047;text-shadow:0 5px 0 #b45309,0 9px 0 #1a1209,0 0 40px rgba(250,204,21,.45);transform:rotate(-2deg)}
.ms-logo small{display:block;font-size:.42em;color:#fff;text-shadow:0 3px 0 #9d174d;margin-top:8px;letter-spacing:0}
.ms-sub{opacity:.85;font-size:clamp(13px,2vw,17px);max-width:640px}
.ms-btn{appearance:none;border:3px solid #1a1209;border-radius:16px;padding:12px 22px;font-weight:900;font-size:clamp(15px,2.2vw,22px);cursor:pointer;color:#1a1209;background:#facc15;box-shadow:0 5px 0 #1a1209;transition:transform .08s,filter .15s;font-family:inherit}
.ms-btn:hover{filter:brightness(1.1);transform:translateY(-2px)}
.ms-btn:active{transform:translateY(3px);box-shadow:0 2px 0 #1a1209}
.ms-btn.alt{background:#7dd3fc}.ms-btn.pink{background:#f472b6}.ms-btn.green{background:#4ade80}.ms-btn.gray{background:#cbd5e1}
.ms-btn[disabled]{opacity:.5;cursor:not-allowed;filter:grayscale(.6)}
.ms-btn.big{font-size:clamp(20px,3vw,32px);padding:16px 40px}
.ms-btn.small{font-size:14px;padding:6px 12px;border-radius:12px;box-shadow:0 3px 0 #1a1209}
.ms-modes{display:flex;flex-wrap:wrap;gap:14px;justify-content:center;max-width:900px}
.ms-mode{width:230px;padding:16px;border-radius:20px;border:3px solid #1a1209;box-shadow:0 6px 0 #1a1209;cursor:pointer;color:#1a1209;text-align:left;font-family:inherit;transition:transform .1s}
.ms-mode:hover{transform:translateY(-4px) rotate(-1deg)}
.ms-mode b{display:block;font-size:20px}.ms-mode span{font-size:13px;opacity:.85}
.ms-mode .em{font-size:36px;display:block}
.ms-help{background:rgba(15,23,42,.7);border:2px solid rgba(250,204,21,.4);border-radius:14px;padding:10px 16px;font-size:12.5px;line-height:1.6;max-width:760px;text-align:left}
.ms-help kbd{background:#1e293b;border:1px solid #475569;border-bottom-width:3px;border-radius:5px;padding:0 5px;font-size:11px;color:#fde047;font-family:inherit}
.ms-setup{min-height:100%;padding:62px 14px 20px;display:grid;gap:12px;grid-template-columns:minmax(230px,300px) 1fr minmax(220px,290px);grid-template-areas:"slots fighters side" "foot foot foot";max-width:1500px;margin:0 auto}
@media (max-width:980px){.ms-setup{grid-template-columns:1fr;grid-template-areas:"slots" "fighters" "side" "foot"}}
.ms-panel{background:rgba(15,23,42,.82);border:3px solid #1a1209;border-radius:18px;padding:12px;box-shadow:0 5px 0 rgba(0,0,0,.5)}
.ms-panel h3{margin:0 0 8px;font-size:14px;color:#fde047;text-transform:uppercase;letter-spacing:1px}
.ms-slots{grid-area:slots;display:flex;flex-direction:column;gap:8px}
.ms-slot{display:flex;align-items:center;gap:8px;padding:8px;border-radius:14px;background:#1e293b;border:3px solid transparent;cursor:pointer}
.ms-slot.act{background:#312e81}
.ms-slot canvas{width:64px;height:70px;border-radius:12px;background:rgba(255,255,255,.08);flex:none}
.ms-slot .meta{flex:1;min-width:0}
.ms-slot .tag{font-weight:900;font-size:13px}
.ms-slot .nm{font-size:12px;opacity:.85;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.ms-chip{display:inline-block;font-size:11px;font-weight:800;padding:3px 8px;border-radius:999px;background:#0f172a;border:2px solid #475569;color:#e2e8f0;cursor:pointer;margin:3px 3px 0 0;font-family:inherit}
.ms-chip.on{border-color:#facc15;color:#fde047}
.ms-fighters{grid-area:fighters;display:flex;flex-direction:column;gap:10px}
.ms-grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(112px,1fr));gap:8px}
.ms-card{position:relative;border-radius:14px;border:3px solid #1a1209;background:#1e293b;cursor:pointer;overflow:hidden;text-align:center;padding:0 0 6px;color:#fff;font-family:inherit;transition:transform .08s}
.ms-card:hover{transform:translateY(-3px)}
.ms-card.sel{outline:4px solid #fde047;transform:translateY(-3px)}
.ms-card canvas{width:100%;height:112px;display:block;background:linear-gradient(#475569,#1e293b)}
.ms-card b{font-size:12px;display:block;padding:0 4px}
.ms-detail{display:flex;gap:14px;align-items:stretch;flex-wrap:wrap}
.ms-detail canvas{width:210px;height:250px;border-radius:14px;background:linear-gradient(#64748b,#1e293b);flex:none;max-width:100%}
.ms-detail .info{flex:1;min-width:210px}
.ms-detail h2{margin:0;font-size:24px}.ms-detail p{margin:4px 0 10px;font-size:13px;opacity:.9}
.ms-stat{display:flex;align-items:center;gap:8px;font-size:12px;margin:3px 0}.ms-stat span{width:70px}
.ms-bar{flex:1;height:9px;background:#0f172a;border-radius:6px;overflow:hidden}.ms-bar i{display:block;height:100%;background:linear-gradient(90deg,#f59e0b,#fde047)}
.ms-specs{font-size:12px;line-height:1.6;margin-top:8px}.ms-specs b{color:#fde047}
.ms-side{grid-area:side;display:flex;flex-direction:column;gap:10px}
.ms-stages{display:grid;grid-template-columns:1fr 1fr;gap:8px}
.ms-stage{border-radius:12px;border:3px solid #1a1209;cursor:pointer;color:#fff;padding:0;overflow:hidden;font-family:inherit;text-align:left;background:#1e293b}
.ms-stage canvas{width:100%;height:56px;display:block}
.ms-stage b{display:block;font-size:11px;padding:3px 6px}
.ms-stage.sel{outline:4px solid #fde047}
.ms-stdesc{font-size:12px;opacity:.9;margin-top:6px;min-height:50px}
.ms-foot{grid-area:foot;display:flex;gap:12px;justify-content:center;align-items:center;flex-wrap:wrap;padding-top:4px}
.ms-warn{font-size:12.5px;background:rgba(14,116,144,.5);border:2px solid #38bdf8;border-radius:12px;padding:8px 12px;margin-bottom:6px}
.ms-overlay{background:rgba(5,8,20,.82);display:none;align-items:center;justify-content:center}
.ms-overlay.on{display:flex}
.ms-box{background:#0f172a;border:4px solid #facc15;border-radius:22px;padding:22px;max-width:min(94vw,820px);width:100%;max-height:94vh;overflow:auto;text-align:center;box-shadow:0 12px 0 rgba(0,0,0,.5)}
.ms-box h2{margin:0 0 6px;font-size:clamp(22px,4vw,38px);color:#fde047}
.ms-podium{display:flex;gap:10px;justify-content:center;align-items:flex-end;flex-wrap:wrap;margin:12px 0}
.ms-pod{width:150px;background:#1e293b;border-radius:14px;border:3px solid #475569;padding:6px;font-size:12px}
.ms-pod.win{border-color:#fde047;background:#422006;transform:translateY(-10px)}
.ms-pod canvas{width:100%;height:140px;display:block;border-radius:10px;background:linear-gradient(#475569,#1e293b)}
.ms-pod b{font-size:14px;display:block;margin-top:4px}
.ms-quote{font-size:15px;font-style:italic;color:#fecdd3;margin:6px 0 12px}
.ms-row{display:flex;gap:10px;justify-content:center;flex-wrap:wrap;margin-top:8px}
`;

function stageThumb(cv: HTMLCanvasElement, idx: number): void {
  const c = cv.getContext('2d')!;
  const w = (cv.width = 220);
  const h = (cv.height = 80);
  const st = STAGES[idx];
  const grads: Record<string, [string, string]> = {
    jungle: ['#7dd3fc', '#86efac'], volcano: ['#431407', '#f97316'], roof: ['#1e1b4b', '#a21caf'], circus: ['#9d174d', '#2e1065'],
  };
  const g = c.createLinearGradient(0, 0, 0, h);
  g.addColorStop(0, grads[st.theme][0]);
  g.addColorStop(1, grads[st.theme][1]);
  c.fillStyle = g;
  c.fillRect(0, 0, w, h);
  const s = 0.11;
  c.save();
  c.translate(w / 2, h * 0.62);
  c.scale(s, s);
  for (const p of st.plats) {
    c.fillStyle = p.solid ? '#92541f' : '#fde047';
    if (st.theme === 'volcano' && p.solid) c.fillStyle = '#44403c';
    if (st.theme === 'roof') c.fillStyle = p.solid ? '#64748b' : '#cbd5e1';
    c.fillRect(p.x - p.w / 2, p.y, p.w, p.solid ? p.h + 160 : 30);
  }
  c.restore();
  if (st.hazard === 1) {
    c.fillStyle = '#f97316';
    c.fillRect(w / 2 - 6, h * 0.1, 12, h * 0.52);
  }
  if (st.hazard === 3) {
    c.fillStyle = '#ef4444';
    c.beginPath();
    c.arc(w * 0.85, h * 0.35, 6, 0, 7);
    c.fill();
  }
}

export class UI {
  readonly root: HTMLElement;
  private cb: UICallbacks;
  private title!: HTMLElement;
  private setupEl!: HTMLElement;
  private resultsEl!: HTMLElement;
  private pauseEl!: HTMLElement;
  setup: Setup = { mode: 'solo', slots: [], stage: 0, rules: { ...DEFAULT_RULES } };
  private active = 0;
  private online: OnlineInfo = { connected: false, isHost: true, code: null, mySlot: 0 };
  private portraits: { cv: HTMLCanvasElement; char: number; mode: 'idle' | 'win' | 'lose' | 'anim' }[] = [];
  private raf = 0;
  private t0 = performance.now();
  private bigChar = 0;
  private visible: 'none' | 'title' | 'setup' | 'results' | 'pause' = 'none';

  constructor(parent: HTMLElement, cb: UICallbacks) {
    this.cb = cb;
    const st = document.createElement('style');
    st.textContent = CSS;
    document.head.appendChild(st);
    this.root = document.createElement('div');
    this.root.id = 'ms-ui';
    parent.appendChild(this.root);
    this.buildTitle();
    this.setupEl = this.screen('ms-bg');
    this.resultsEl = this.screen('ms-overlay');
    this.pauseEl = this.screen('ms-overlay');
    const loop = () => {
      this.raf = requestAnimationFrame(loop);
      this.drawPortraits();
    };
    loop();
  }

  private screen(cls: string): HTMLElement {
    const el = document.createElement('div');
    el.className = `ms-screen ${cls}`;
    this.root.appendChild(el);
    return el;
  }

  hideAll(): void {
    for (const el of [this.title, this.setupEl, this.resultsEl, this.pauseEl]) el.classList.remove('on');
    this.visible = 'none';
    this.portraits = [];
  }

  isOpen(): boolean {
    return this.visible !== 'none';
  }

  // ------------------------------------------------------------------ título
  private buildTitle(): void {
    this.title = this.screen('ms-bg');
    this.title.innerHTML = `
      <div class="ms-title">
        <div class="ms-logo">Super Smash Macacos<small>🍌 Briga na Bananeira 🍌</small></div>
        <div class="ms-sub">Platform fighter de macacos! Quanto mais % de dano, mais longe você voa. Jogue ninguém pra fora da arena e vire o rei da bananeira.</div>
        <div class="ms-modes">
          <button class="ms-mode" style="background:#facc15" data-m="solo"><span class="em">🤖</span><b>Solo vs Bots</b><span>1 jogador contra até 3 bots (fácil, médio ou difícil).</span></button>
          <button class="ms-mode" style="background:#7dd3fc" data-m="local"><span class="em">🎮</span><b>2P Local</b><span>Dois jogadores no mesmo teclado + bots se quiser.</span></button>
          <button class="ms-mode" style="background:#4ade80" data-m="online"><span class="em">🌐</span><b>Online P2P (até 4)</b><span>Crie uma sala pelo botão 🐒 Co-op Online e chame os amigos.</span></button>
        </div>
        <div class="ms-help">
          🎮 <b>Controles ilustrados:</b> aperte <kbd>F1</kbd> ou clique em <b>🎮 Controles</b> no topo a qualquer hora · <kbd>Esc</kbd> pausa a luta.
        </div>
      </div>`;
    this.title.querySelectorAll<HTMLButtonElement>('.ms-mode').forEach((b) => {
      b.onclick = () => {
        sfx.click();
        this.openSetup(b.dataset.m as Mode);
      };
    });
  }

  showTitle(): void {
    this.hideAll();
    this.title.classList.add('on');
    this.visible = 'title';
  }

  // ------------------------------------------------------------------ setup
  makeSetup(mode: Mode): Setup {
    const rnd = () => Math.floor(Math.random() * CHARS.length);
    const slots: SetupSlot[] = [
      { kind: 'human', char: 0, level: 1, name: 'Jogador 1' },
      { kind: mode === 'local' ? 'human' : 'bot', char: 1, level: 1, name: mode === 'local' ? 'Jogador 2' : 'CPU' },
      { kind: 'off', char: rnd(), level: 1, name: 'CPU' },
      { kind: 'off', char: rnd(), level: 1, name: 'CPU' },
    ];
    if (mode === 'solo') slots[2].kind = 'bot';
    return { mode, slots, stage: 0, rules: { ...DEFAULT_RULES } };
  }

  openSetup(mode: Mode): void {
    this.setup = this.makeSetup(mode);
    this.active = 0;
    this.online = { connected: false, isHost: true, code: null, mySlot: 0 };
    this.renderSetup();
  }

  /** Atualiza info de rede (host/guest, jogadores). */
  setOnline(info: OnlineInfo): void {
    this.online = info;
    if (this.visible === 'setup' && this.setup.mode === 'online') this.renderSetup();
  }

  applySetup(s: Setup): void {
    this.setup = s;
    if (this.visible === 'setup') this.renderSetup();
  }

  currentSetup(): Setup {
    return this.setup;
  }

  private canEdit(i: number): boolean {
    const s = this.setup;
    if (s.mode !== 'online') return true;
    if (this.online.isHost) return s.slots[i].kind !== 'remote';
    return i === this.online.mySlot;
  }

  private changed(): void {
    this.cb.onSetupChange(this.setup);
  }

  renderSetup(): void {
    this.hideAll();
    this.setupEl.classList.add('on');
    this.visible = 'setup';
    const s = this.setup;
    const online = s.mode === 'online';
    const host = !online || this.online.isHost;
    const el = this.setupEl;
    el.innerHTML = '';
    const wrap = document.createElement('div');
    wrap.className = 'ms-setup';
    el.appendChild(wrap);

    // --- slots
    const slotsP = document.createElement('div');
    slotsP.className = 'ms-panel ms-slots';
    slotsP.innerHTML = `<h3>Jogadores</h3>`;
    s.slots.forEach((sl, i) => {
      const row = document.createElement('div');
      row.className = 'ms-slot' + (i === this.active ? ' act' : '');
      row.style.borderColor = SLOT_COLORS[i];
      const cv = document.createElement('canvas');
      cv.width = 128;
      cv.height = 140;
      const meta = document.createElement('div');
      meta.className = 'meta';
      const kindTxt = sl.kind === 'human' ? (online ? (i === this.online.mySlot ? 'Você' : 'Humano') : `Humano P${i + 1}`) : sl.kind === 'remote' ? 'Online' : sl.kind === 'bot' ? `CPU ${LEVELS[sl.level]}` : 'Vazio';
      meta.innerHTML = `<div class="tag" style="color:${SLOT_COLORS[i]}">P${i + 1} · ${kindTxt}</div><div class="nm">${sl.kind === 'off' ? '—' : sl.kind === 'bot' || sl.kind === 'human' && !online ? CHARS[sl.char].name : `${sl.name} · ${CHARS[sl.char].name}`}</div>`;
      row.appendChild(cv);
      row.appendChild(meta);
      if (sl.kind !== 'off') this.portraits.push({ cv, char: sl.char, mode: 'idle' });
      if (host && sl.kind !== 'remote' && !(online && i === 0)) {
        const chips = document.createElement('div');
        const opts: [string, SetupSlot['kind']][] = s.mode === 'local' && i < 2 ? [['Humano', 'human'], ['CPU', 'bot']] : s.mode === 'solo' && i === 0 ? [['Humano', 'human']] : [['CPU', 'bot'], ['Vazio', 'off']];
        for (const [lab, k] of opts) {
          if (opts.length === 1) break;
          const ch = document.createElement('button');
          ch.className = 'ms-chip' + (sl.kind === k ? ' on' : '');
          ch.textContent = lab;
          ch.onclick = (e) => {
            e.stopPropagation();
            sl.kind = k;
            this.changed();
            this.renderSetup();
          };
          chips.appendChild(ch);
        }
        if (sl.kind === 'bot') {
          LEVELS.forEach((lv, li) => {
            const ch = document.createElement('button');
            ch.className = 'ms-chip' + (sl.level === li ? ' on' : '');
            ch.textContent = lv;
            ch.onclick = (e) => {
              e.stopPropagation();
              sl.level = li;
              this.changed();
              this.renderSetup();
            };
            chips.appendChild(ch);
          });
        }
        meta.appendChild(chips);
      }
      row.onclick = () => {
        if (sl.kind === 'off') return;
        this.active = i;
        sfx.click();
        this.renderSetup();
      };
      slotsP.appendChild(row);
    });
    wrap.appendChild(slotsP);

    // --- lutadores
    if (s.slots[this.active].kind === 'off') this.active = 0;
    const cur = s.slots[this.active];
    const fighters = document.createElement('div');
    fighters.className = 'ms-panel ms-fighters';
    const editable = this.canEdit(this.active) && cur.kind !== 'off';
    fighters.innerHTML = `<h3>Escolha o lutador — P${this.active + 1}${editable ? '' : ' (somente leitura)'}</h3>`;
    const grid = document.createElement('div');
    grid.className = 'ms-grid';
    CHARS.forEach((ch, ci) => {
      const card = document.createElement('button');
      card.className = 'ms-card' + (cur.char === ci ? ' sel' : '');
      const cv = document.createElement('canvas');
      cv.width = 224;
      cv.height = 224;
      card.appendChild(cv);
      card.insertAdjacentHTML('beforeend', `<b>${ch.emoji} ${ch.name}</b>`);
      this.portraits.push({ cv, char: ci, mode: 'idle' });
      card.onclick = () => {
        if (!editable) return;
        cur.char = ci;
        sfx.click();
        if (online && !this.online.isHost) this.cb.onPickOnline(ci);
        else this.changed();
        this.renderSetup();
      };
      grid.appendChild(card);
    });
    const rnd = document.createElement('button');
    rnd.className = 'ms-card';
    rnd.innerHTML = `<canvas width="224" height="224" style="background:linear-gradient(#7c3aed,#312e81)"></canvas><b>🎲 Aleatório</b>`;
    rnd.onclick = () => {
      if (!editable) return;
      cur.char = Math.floor(Math.random() * CHARS.length);
      sfx.click();
      if (online && !this.online.isHost) this.cb.onPickOnline(cur.char);
      else this.changed();
      this.renderSetup();
    };
    grid.appendChild(rnd);
    fighters.appendChild(grid);
    const ch = CHARS[cur.char];
    this.bigChar = cur.char;
    const stat = (lab: string, v: number) => `<div class="ms-stat"><span>${lab}</span><div class="ms-bar"><i style="width:${v * 20}%"></i></div></div>`;
    const det = document.createElement('div');
    det.className = 'ms-detail';
    det.innerHTML = `<canvas id="ms-big" width="420" height="500"></canvas>
      <div class="info"><h2>${ch.emoji} ${ch.title}</h2><p>${ch.tagline}</p>
      ${stat('Peso', ch.stats.peso)}${stat('Velocidade', ch.stats.vel)}${stat('Alcance', ch.stats.alc)}${stat('Poder', ch.stats.pod)}
      <div class="ms-specs"><b>Especiais:</b><br>Neutro: ${ch.specials[0]}<br>Lado: ${ch.specials[1]}<br>Cima: ${ch.specials[2]}<br>Baixo: ${ch.specials[3]}</div></div>`;
    fighters.appendChild(det);
    wrap.appendChild(fighters);
    const big = det.querySelector<HTMLCanvasElement>('#ms-big')!;
    this.portraits.push({ cv: big, char: cur.char, mode: 'anim' });

    // --- lateral: arenas + regras
    const side = document.createElement('div');
    side.className = 'ms-side';
    const stP = document.createElement('div');
    stP.className = 'ms-panel';
    stP.innerHTML = '<h3>Arena</h3>';
    const sg = document.createElement('div');
    sg.className = 'ms-stages';
    STAGES.forEach((st, si) => {
      const b = document.createElement('button');
      b.className = 'ms-stage' + (s.stage === si ? ' sel' : '');
      const cv = document.createElement('canvas');
      stageThumb(cv, si);
      b.appendChild(cv);
      b.insertAdjacentHTML('beforeend', `<b>${st.name}</b>`);
      b.onclick = () => {
        if (!host) return;
        s.stage = si;
        sfx.click();
        this.changed();
        this.renderSetup();
      };
      sg.appendChild(b);
    });
    stP.appendChild(sg);
    const sd = STAGES[s.stage];
    stP.insertAdjacentHTML('beforeend', `<div class="ms-stdesc"><b>${sd.name}</b><br>${sd.tagline}<br><i>⚠ ${sd.hazardText}</i></div>`);
    side.appendChild(stP);

    const rl = document.createElement('div');
    rl.className = 'ms-panel';
    rl.innerHTML = '<h3>Regras</h3>';
    const chip = (lab: string, on: boolean, fn: () => void) => {
      const b = document.createElement('button');
      b.className = 'ms-chip' + (on ? ' on' : '');
      b.textContent = lab;
      b.onclick = () => {
        if (!host) return;
        fn();
        sfx.click();
        this.changed();
        this.renderSetup();
      };
      return b;
    };
    const addRow = (lab: string, chips: HTMLElement[]) => {
      const d = document.createElement('div');
      d.style.marginBottom = '6px';
      d.innerHTML = `<div style="font-size:12px;opacity:.8">${lab}</div>`;
      chips.forEach((c) => d.appendChild(c));
      rl.appendChild(d);
    };
    addRow('Modo', [chip('Estoque', s.rules.mode === 0, () => (s.rules.mode = 0)), chip('Tempo', s.rules.mode === 1, () => (s.rules.mode = 1))]);
    if (s.rules.mode === 0) addRow('Vidas (bananas)', [1, 2, 3, 5].map((n) => chip(String(n), s.rules.stocks === n, () => (s.rules.stocks = n))));
    else addRow('Duração', [2, 3, 5].map((n) => chip(`${n} min`, s.rules.minutes === n, () => (s.rules.minutes = n))));
    addRow('Itens', [chip('Sem', s.rules.items === 0, () => (s.rules.items = 0)), chip('Normal', s.rules.items === 1, () => (s.rules.items = 1)), chip('Muitos', s.rules.items === 2, () => (s.rules.items = 2))]);
    side.appendChild(rl);
    wrap.appendChild(side);

    // --- rodapé
    const foot = document.createElement('div');
    foot.className = 'ms-foot';
    if (online) {
      const warn = document.createElement('div');
      warn.className = 'ms-warn';
      warn.style.flexBasis = '100%';
      warn.style.textAlign = 'center';
      warn.innerHTML = this.online.connected
        ? `🌐 Sala <b>${this.online.code ?? ''}</b> — ${this.online.isHost ? 'você é o HOST: escolha tudo e clique em LUTAR!' : 'conectado! Escolha seu lutador e aguarde o host iniciar.'}`
        : `🌐 Clique em <b>🐒 Co-op Online</b> (canto superior esquerdo) → <b>Criar Sala</b> e mande o link, ou entre com um código. Dá pra começar já com bots enquanto isso.`;
      foot.appendChild(warn);
    }
    const back = document.createElement('button');
    back.className = 'ms-btn gray';
    back.textContent = '◀ Voltar';
    back.onclick = () => {
      sfx.click();
      this.showTitle();
    };
    foot.appendChild(back);
    const go = document.createElement('button');
    go.className = 'ms-btn big green';
    go.textContent = host ? '🍌 LUTAR!' : 'Aguardando o host...';
    go.disabled = !host;
    const ready = s.slots.filter((x) => x.kind !== 'off').length >= 2;
    if (!ready) {
      go.disabled = true;
      go.title = 'Precisa de pelo menos 2 lutadores';
    }
    go.onclick = () => {
      sfx.click();
      this.cb.onStart(this.setup);
    };
    foot.appendChild(go);
    wrap.appendChild(foot);
  }

  // ------------------------------------------------------------------ resultados
  showResults(d: ResultData): void {
    this.hideAll();
    this.resultsEl.classList.add('on');
    this.visible = 'results';
    const el = this.resultsEl;
    const winner = d.rows.find((r) => r.slot === d.winner);
    const title = winner ? `🏆 ${winner.name} (${CHARS[winner.char].name}) venceu!` : '🤝 Empate bananal!';
    el.innerHTML = `<div class="ms-box"><h2>${title}</h2><div class="ms-quote">“${d.quote}”</div><div class="ms-podium" id="ms-pod"></div><div class="ms-row" id="ms-res-btns"></div></div>`;
    const pod = el.querySelector('#ms-pod')!;
    for (const r of d.rows) {
      const card = document.createElement('div');
      card.className = 'ms-pod' + (r.slot === d.winner ? ' win' : '');
      const cv = document.createElement('canvas');
      cv.width = 300;
      cv.height = 240;
      card.appendChild(cv);
      card.insertAdjacentHTML('beforeend', `<b style="color:${SLOT_COLORS[r.slot]}">${r.place}º · ${r.name}</b>${CHARS[r.char].name}<br>KOs ${r.kos} · Quedas ${r.falls}<br>Dano causado ${Math.round(r.dealt)}%`);
      pod.appendChild(card);
      this.portraits.push({ cv, char: r.char, mode: r.slot === d.winner ? 'win' : 'lose' });
    }
    const btns = el.querySelector('#ms-res-btns')!;
    const mk = (lab: string, cls: string, fn: () => void, dis = false) => {
      const b = document.createElement('button');
      b.className = `ms-btn ${cls}`;
      b.textContent = lab;
      b.disabled = dis;
      b.onclick = () => {
        sfx.click();
        fn();
      };
      btns.appendChild(b);
    };
    mk(d.canControl ? '🔁 Revanche!' : 'Aguardando host...', 'green', () => this.cb.onRematch(), !d.canControl);
    mk('🎭 Trocar lutadores / arena', 'alt', () => this.cb.onMenu());
  }

  // ------------------------------------------------------------------ pausa
  showPause(canRestart: boolean, mode: Mode): void {
    this.hideAll();
    this.pauseEl.classList.add('on');
    this.visible = 'pause';
    this.pauseEl.innerHTML = `<div class="ms-box" style="max-width:480px"><h2>⏸ Pausa</h2>
      <div class="ms-sub" style="margin:0 auto 12px">${mode === 'online' ? 'Online: o jogo continua rolando para os outros jogadores!' : 'Respire fundo, macaco.'}</div>
      <div class="ms-row" id="ms-pause-btns" style="flex-direction:column;align-items:stretch"></div></div>`;
    const btns = this.pauseEl.querySelector('#ms-pause-btns')!;
    const mk = (lab: string, cls: string, fn: () => void, dis = false) => {
      const b = document.createElement('button');
      b.className = `ms-btn ${cls}`;
      b.textContent = lab;
      b.disabled = dis;
      b.onclick = () => {
        sfx.click();
        fn();
      };
      btns.appendChild(b);
    };
    mk('▶ Continuar', 'green', () => this.cb.onResume());
    if (canRestart) mk('🔁 Reiniciar luta', 'alt', () => this.cb.onRestart());
    mk('🚪 Sair para o menu', 'pink', () => this.cb.onQuit());
  }

  hidePause(): void {
    if (this.visible === 'pause') this.hideAll();
  }

  // ------------------------------------------------------------------ retratos animados
  private drawPortraits(): void {
    if (this.portraits.length === 0) return;
    const t = (performance.now() - this.t0) / 1000;
    for (const p of this.portraits) {
      if (!p.cv.isConnected) continue;
      const c = p.cv.getContext('2d');
      if (!c) continue;
      const w = p.cv.width;
      const h = p.cv.height;
      c.clearRect(0, 0, w, h);
      const ch = CHARS[p.char];
      const f = newFighter(0, p.char, 0, '', 0, DEFAULT_RULES);
      f.x = 0;
      f.y = 0;
      f.face = 1;
      f.state = St.IDLE;
      f.ground = 1;
      let time = t;
      if (p.mode === 'anim') {
        const keys = ['jab', 'fsmash', 'fair', 'nspec', 'sspec', 'uair', 'dspec', 'uspec'];
        const cyc = 100;
        const idx = Math.floor((t * 60) / cyc) % keys.length;
        const fr = Math.floor((t * 60) % cyc);
        const mv = ch.moves[MKI[keys[idx]]];
        if (fr < mv.dur) {
          f.state = St.ATTACK;
          f.move = MKI[keys[idx]];
          f.st = fr;
        }
      }
      const unit = ((h * 0.76) / 120) * (p.mode === 'win' || p.mode === 'lose' ? 1.45 : 1);
      c.save();
      c.translate(w / 2, h * 0.9);
      c.scale(unit, unit);
      if (p.mode === 'anim') c.translate(-14, 0);
      const fx = newFighterFx();
      drawFighter(c, f, ch, fx, { time, win: p.mode === 'win', lose: p.mode === 'lose' });
      c.restore();
    }
    void this.bigChar;
  }
}
