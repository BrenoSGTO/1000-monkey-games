import { S, HOTBAR, hotbarItem, countItem } from './state';
import { CROPS, FUR_PALETTES, ITEMS, NPCS, NPC_BY_ID, QUESTS, SHIRT_COLORS, TIER_NAMES, TOOL_IDS, TOOL_NAMES, UPGRADE_COST, ROD_COST, ANIMAL_PRICES, GOAL_MONEY, playerLook, shopStock } from './data';
import { itemIconURL, portraitURL, toolIconURL } from './sprites';
import { DAYS_PER_SEASON, SEASONS, SEASON_ICON, WEEKDAYS } from './layout';
import { fmtMoney, fmtTime } from './util';
import { World } from './world';
import { sfx } from './audio';
import type { Look, Mood, ToolId } from './types';

export interface Handlers {
  buy: (id: string, n: number, cost: number, cb: (ok: boolean) => void) => void;
  sell: (slot: number, n: number, mult: number) => void;
  upgrade: (tool: ToolId, cb: (ok: boolean) => void) => void;
  buyAnimal: (kind: 'galinha' | 'cabra', cb: (ok: boolean) => void) => void;
  talk: (npcId: string) => void;
  swapInv: (i: number) => void;
  trash: (i: number) => void;
  save: () => void;
  newGame: () => void;
  toTitle: () => void;
  toggleMusic: () => void;
  startNew: (name: string, fi: number, si: number) => void;
  continueGame: () => void;
  select: (slot: number) => void;
  cycle: (d: number) => void;
  openControls?: () => void;
}

let root: HTMLElement;
let H: Handlers;

export const touch = { dx: 0, dy: 0, act: false, interact: false, run: false };

const CSS = `
.vl{font-family:'Trebuchet MS','Segoe UI',system-ui,sans-serif;color:#3b2412;pointer-events:none}
.vl *{box-sizing:border-box}
.vl img,.vl canvas{image-rendering:pixelated}
.vl .panel{background:#fbeec2;border:4px solid #6b3f1d;border-radius:14px;box-shadow:0 0 0 3px #d9a65a,0 10px 30px rgba(0,0,0,.5);pointer-events:auto}
.vl .btn{background:#6ab04a;color:#fff;border:3px solid #3f7a2a;border-bottom-width:5px;border-radius:10px;font:800 15px 'Trebuchet MS',sans-serif;padding:7px 14px;cursor:pointer;text-shadow:0 2px 0 rgba(0,0,0,.3);pointer-events:auto}
.vl .btn:hover{filter:brightness(1.1);transform:translateY(-1px)}
.vl .btn:active{transform:translateY(2px);border-bottom-width:3px}
.vl .btn.brown{background:#b8793a;border-color:#7a4a22}
.vl .btn.red{background:#d4553f;border-color:#8f2e1f}
.vl .btn.big{font-size:24px;padding:12px 34px;letter-spacing:1px}
.vl .btn:disabled{filter:grayscale(.8) brightness(.8);cursor:default;transform:none}
#vl-hud-clock{position:fixed;top:10px;right:10px;padding:8px 12px;text-align:center;min-width:136px;font-weight:800}
#vl-hud-clock .t{font-size:26px;letter-spacing:1px;line-height:1}
#vl-hud-clock .d{font-size:12px;margin-bottom:3px}
#vl-hud-clock .m{font-size:16px;margin-top:4px;color:#8a5a00}
#vl-hud-energy{position:fixed;right:12px;bottom:12px;width:26px;height:120px;padding:3px;border-radius:8px;overflow:hidden}
#vl-hud-energy .f{position:absolute;left:3px;right:3px;bottom:3px;border-radius:4px;transition:height .2s}
#vl-hud-energy .l{position:absolute;top:-1px;left:0;right:0;text-align:center;font-size:11px;font-weight:900;color:#fff;text-shadow:0 1px 2px #000;z-index:2}
#vl-hotbar{position:fixed;left:50%;bottom:8px;transform:translateX(-50%);display:flex;gap:3px;padding:5px;max-width:98vw}
.vl .slot{width:44px;height:44px;position:relative;background:#e9cf94;border:3px solid #a8743a;border-radius:7px;cursor:pointer;pointer-events:auto;flex:none}
.vl .slot.sel{border-color:#ff7a1a;box-shadow:0 0 0 2px #ffd84a,0 0 10px #ffd84a;background:#fff0b8}
.vl .slot img{position:absolute;inset:2px;width:34px;height:34px}
.vl .slot .n{position:absolute;right:2px;bottom:0;font-size:12px;font-weight:900;color:#fff;text-shadow:-1px -1px 0 #3b2412,1px -1px 0 #3b2412,-1px 1px 0 #3b2412,1px 1px 0 #3b2412}
.vl .slot .k{position:absolute;left:3px;top:0;font-size:9px;font-weight:800;color:#8a5a2a}
#vl-tip{position:fixed;left:50%;bottom:66px;transform:translateX(-50%);background:rgba(43,26,18,.88);color:#fff2c0;padding:3px 10px;border-radius:8px;font-weight:700;font-size:13px;opacity:0;transition:opacity .3s}
#vl-quest{position:fixed;top:10px;left:50%;transform:translateX(-50%);padding:5px 14px;font-size:13px;font-weight:700;max-width:min(520px,52vw);text-align:center}
#vl-quest b{color:#c0502a}
.vl .overlay{position:fixed;inset:0;background:rgba(20,10,0,.55);display:flex;align-items:center;justify-content:center;pointer-events:auto;z-index:35}
.vl .modal{max-width:96vw;max-height:92vh;overflow:auto;padding:14px 18px;position:relative;min-width:min(520px,94vw)}
.vl .modal h2{margin:0 0 8px;font-size:22px;color:#6b3f1d}
.vl .x{position:absolute;right:8px;top:6px;background:#d4553f;color:#fff;border:2px solid #8f2e1f;border-radius:8px;font-weight:900;width:30px;height:30px;cursor:pointer}
.vl .tabs{display:flex;gap:6px;margin:6px 0 10px;flex-wrap:wrap}
.vl .tab{padding:5px 12px;border-radius:8px;background:#e2c78a;border:2px solid #a8743a;font-weight:800;cursor:pointer}
.vl .tab.on{background:#6ab04a;color:#fff;border-color:#3f7a2a}
.vl .grid{display:grid;grid-template-columns:repeat(6,48px);gap:4px}
.vl .row{display:flex;align-items:center;gap:8px;padding:5px 6px;border-bottom:1px dashed #c9a463}
.vl .row img{width:32px;height:32px}
.vl .row .nm{flex:1;font-weight:800}
.vl .row .ds{font-size:12px;color:#7a5a30;font-weight:600}
.vl .price{font-weight:900;color:#8a5a00;min-width:70px;text-align:right}
.vl .hearts{letter-spacing:1px;font-size:15px}
#vl-dlg{position:fixed;left:50%;bottom:14px;transform:translateX(-50%);width:min(760px,96vw);min-height:150px;padding:12px 14px 12px 160px;z-index:40;cursor:pointer}
#vl-dlg .pt{position:absolute;left:12px;bottom:12px;width:132px;height:120px;background:#c9e8a8;border:3px solid #6b3f1d;border-radius:10px;overflow:hidden;display:flex;align-items:flex-end;justify-content:center}
#vl-dlg .pt img{width:132px;image-rendering:pixelated}
#vl-dlg .nm{font-size:18px;font-weight:900;color:#c0502a;margin-bottom:4px}
#vl-dlg .tx{font-size:18px;line-height:1.35;min-height:60px;font-weight:600}
#vl-dlg .ch{display:flex;gap:8px;flex-wrap:wrap;margin-top:8px}
#vl-dlg .nx{position:absolute;right:16px;bottom:8px;font-size:18px;animation:vlb .6s infinite alternate}
@keyframes vlb{to{transform:translateY(4px)}}
#vl-title{position:fixed;inset:0;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:14px;background:radial-gradient(ellipse at center,rgba(255,240,170,.15),rgba(20,40,10,.65));pointer-events:auto;z-index:25;text-align:center}
#vl-title h1{margin:0;font-size:min(72px,12vw);color:#ffe45a;text-shadow:0 5px 0 #b8541a,0 8px 0 #6b3f1d,0 0 30px rgba(255,220,80,.6);letter-spacing:2px;line-height:1}
#vl-title h2{margin:0;font-size:min(30px,6vw);color:#fff7d0;text-shadow:0 3px 0 #6b3f1d,0 0 14px #000}
#vl-title .sm{color:#fff;font-weight:700;text-shadow:0 2px 3px #000;max-width:560px;font-size:14px}
.vl .sw{width:30px;height:30px;border-radius:8px;border:3px solid #6b3f1d;cursor:pointer;display:inline-block;margin:2px}
.vl .sw.on{outline:3px solid #ff7a1a}
.vl input.nm-in{font:800 18px 'Trebuchet MS';padding:6px 10px;border:3px solid #6b3f1d;border-radius:8px;background:#fffbe8;width:100%;pointer-events:auto;user-select:text;-webkit-user-select:text}
#vl-fish{position:fixed;left:50%;top:50%;margin-left:70px;margin-top:-90px;width:54px;height:180px;background:#173a5a;border:4px solid #6b3f1d;border-radius:10px;z-index:25}
#vl-fish .zone{position:absolute;left:3px;width:20px;background:rgba(120,255,120,.75);border:2px solid #2f8a2f;border-radius:4px}
#vl-fish .fi{position:absolute;left:5px;width:16px;height:16px}
#vl-fish .pr{position:absolute;right:4px;bottom:4px;width:12px;top:4px;background:#0a2438;border-radius:4px;overflow:hidden}
#vl-fish .pr div{position:absolute;bottom:0;left:0;right:0;background:#ffd84a}
#vl-touch{position:fixed;inset:0;z-index:15;display:none}
#vl-joy{position:absolute;left:16px;bottom:78px;width:130px;height:130px;border-radius:50%;background:rgba(255,255,255,.18);border:3px solid rgba(255,255,255,.4);pointer-events:auto;touch-action:none}
#vl-joy .kn{position:absolute;left:35px;top:35px;width:60px;height:60px;border-radius:50%;background:rgba(255,255,255,.5)}
.vl .tb{position:absolute;width:66px;height:66px;border-radius:50%;background:rgba(255,200,60,.55);border:3px solid rgba(255,255,255,.7);color:#fff;font:900 20px 'Trebuchet MS';pointer-events:auto;touch-action:none}
@media (max-width:640px){#vl-hotbar .slot{width:34px;height:34px}.vl .slot img{width:26px;height:26px}#vl-hud-clock{min-width:112px;padding:5px 8px}#vl-hud-clock .t{font-size:20px}#vl-quest{top:64px;max-width:92vw}}
`;

function el<K extends keyof HTMLElementTagNameMap>(tag: K, cls = '', html = ''): HTMLElementTagNameMap[K] {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (html) e.innerHTML = html;
  return e;
}

let hudClock: HTMLElement;
let hudEnergy: HTMLElement;
let hotbar: HTMLElement;
let tipEl: HTMLElement;
let questEl: HTMLElement;
let hudRoot: HTMLElement;
const slotEls: HTMLElement[] = [];
const slotKeys: string[] = [];
let tipTimer = 0;
let lastSel = -1;
let modalEl: HTMLElement | null = null;
let modalClose: (() => void) | null = null;
let dlgEl: HTMLElement | null = null;

export function initUI(rootEl: HTMLElement, handlers: Handlers): void {
  root = rootEl;
  H = handlers;
  root.classList.add('vl');
  const st = document.createElement('style');
  st.textContent = CSS;
  document.head.appendChild(st);

  hudRoot = el('div');
  root.appendChild(hudRoot);
  hudClock = el('div', 'panel');
  hudClock.id = 'vl-hud-clock';
  hudRoot.appendChild(hudClock);
  hudEnergy = el('div', 'panel');
  hudEnergy.id = 'vl-hud-energy';
  hudEnergy.innerHTML = '<div class="l">E</div><div class="f"></div>';
  hudRoot.appendChild(hudEnergy);
  hotbar = el('div', 'panel');
  hotbar.id = 'vl-hotbar';
  const keys = ['1', '2', '3', '4', '5', '6', '7', '8', '9', '0', '-', '='];
  for (let i = 0; i < HOTBAR; i++) {
    const s = el('div', 'slot');
    s.innerHTML = `<span class="k">${keys[i]}</span><img alt=""><span class="n"></span>`;
    s.onclick = () => {
      H.select(i);
    };
    hotbar.appendChild(s);
    slotEls.push(s);
    slotKeys.push('');
  }
  hudRoot.appendChild(hotbar);
  tipEl = el('div');
  tipEl.id = 'vl-tip';
  hudRoot.appendChild(tipEl);
  questEl = el('div', 'panel');
  questEl.id = 'vl-quest';
  hudRoot.appendChild(questEl);
  hudRoot.style.display = 'none';
  buildTouch();
}

export function showHUD(on: boolean): void {
  hudRoot.style.display = on ? 'block' : 'none';
  const t = document.getElementById('vl-touch');
  if (t) t.style.display = on && isTouch() ? 'block' : 'none';
}

function isTouch(): boolean {
  return window.matchMedia?.('(pointer: coarse)').matches || 'ontouchstart' in window;
}

function buildTouch(): void {
  const t = el('div');
  t.id = 'vl-touch';
  const joy = el('div');
  joy.id = 'vl-joy';
  const kn = el('div', 'kn');
  joy.appendChild(kn);
  t.appendChild(joy);
  let active = -1;
  const setJoy = (cx: number, cy: number) => {
    const r = joy.getBoundingClientRect();
    let dx = cx - (r.left + r.width / 2);
    let dy = cy - (r.top + r.height / 2);
    const m = Math.hypot(dx, dy);
    const max = r.width / 2;
    if (m > max) {
      dx = (dx / m) * max;
      dy = (dy / m) * max;
    }
    kn.style.transform = `translate(${dx}px,${dy}px)`;
    touch.dx = Math.abs(dx) > 12 ? dx / max : 0;
    touch.dy = Math.abs(dy) > 12 ? dy / max : 0;
  };
  joy.addEventListener('pointerdown', (e) => {
    active = e.pointerId;
    joy.setPointerCapture(e.pointerId);
    setJoy(e.clientX, e.clientY);
  });
  joy.addEventListener('pointermove', (e) => {
    if (e.pointerId === active) setJoy(e.clientX, e.clientY);
  });
  const end = () => {
    active = -1;
    kn.style.transform = '';
    touch.dx = 0;
    touch.dy = 0;
  };
  joy.addEventListener('pointerup', end);
  joy.addEventListener('pointercancel', end);
  const mkBtn = (label: string, right: number, bottom: number, fn: () => void, hold = false) => {
    const b = el('button', 'tb', label);
    b.style.right = `${right}px`;
    b.style.bottom = `${bottom}px`;
    b.addEventListener('pointerdown', (e) => {
      e.preventDefault();
      fn();
      if (hold) touch.act = true;
    });
    if (hold) {
      b.addEventListener('pointerup', () => (touch.act = false));
      b.addEventListener('pointercancel', () => (touch.act = false));
    }
    t.appendChild(b);
  };
  mkBtn('A', 20, 150, () => {}, true);
  mkBtn('E', 96, 190, () => (touch.interact = true));
  mkBtn('⇄', 96, 112, () => H.cycle(1));
  mkBtn('🎒', 170, 150, () => openBackpack('mochila'));
  mkBtn('☰', 170, 226, () => openPause());
  root.appendChild(t);
}

// ---------------------------------------------------------------- HUD

export function showTip(text: string): void {
  tipEl.textContent = text;
  tipEl.style.opacity = '1';
  clearTimeout(tipTimer);
  tipTimer = window.setTimeout(() => (tipEl.style.opacity = '0'), 1800);
}

export function selName(): string {
  const it = hotbarItem(S.me, S.me.sel);
  if (it.tool) {
    const tier = S.me.tiers[it.tool];
    return `${TOOL_NAMES[it.tool]}${tier > 0 ? ' de ' + TIER_NAMES[tier] : ''}`;
  }
  if (it.stack) return ITEMS[it.stack.id]?.name ?? it.stack.id;
  return '';
}

let hudAcc = 0;
export function updateHUD(dt: number): void {
  hudAcc += dt;
  if (hudAcc < 0.1 && lastSel === S.me.sel) return;
  hudAcc = 0;
  const w = S.world;
  const wd = WEEKDAYS[(w.day - 1) % 7];
  const wIcon = w.weather === 'sol' ? '☀️' : w.weather === 'chuva' ? '🌧️' : w.weather === 'tempestade' ? '⛈️' : '❄️';
  hudClock.innerHTML = `<div class="d">${SEASON_ICON[w.season]} ${SEASONS[w.season]} ${w.day} • ${wd} • Ano ${w.year} ${wIcon}</div><div class="t">${fmtTime(w.minutes)}</div><div class="m">🍌 ${fmtMoney(w.money)}</div>`;
  const p = S.me;
  const pct = Math.max(0, Math.min(1, p.energy / p.maxEnergy));
  const f = hudEnergy.querySelector<HTMLElement>('.f')!;
  f.style.height = `${pct * 110}px`;
  f.style.background = pct > 0.5 ? '#6ad04a' : pct > 0.25 ? '#f0c030' : '#e04a3a';
  for (let i = 0; i < HOTBAR; i++) {
    const it = hotbarItem(p, i);
    let key = '';
    let src = '';
    let n = '';
    if (it.tool) {
      key = `t${it.tool}${p.tiers[it.tool]}`;
      src = toolIconURL(it.tool, p.tiers[it.tool]);
      if (it.tool === 'can') n = String(Math.floor(p.water));
    } else if (it.stack) {
      key = `i${it.stack.id}`;
      src = itemIconURL(it.stack.id);
      n = it.stack.n > 1 ? String(it.stack.n) : '';
    }
    const s = slotEls[i];
    const img = s.querySelector('img')!;
    if (slotKeys[i] !== key) {
      slotKeys[i] = key;
      img.style.display = key ? 'block' : 'none';
      if (src) img.src = src;
    }
    s.querySelector<HTMLElement>('.n')!.textContent = n;
    s.classList.toggle('sel', i === p.sel);
  }
  if (lastSel !== p.sel) {
    lastSel = p.sel;
    const nm = selName();
    if (nm) showTip(nm);
  }
  const qi = w.quest;
  if (qi < QUESTS.length) {
    const q = QUESTS[qi];
    const cur = q.stat === 'earned' ? w.totalEarned : w.stats[q.stat] ?? 0;
    questEl.innerHTML = `🎯 <b>${q.text}</b> (${Math.min(cur, q.goal)}/${q.goal})`;
    questEl.style.display = 'block';
  } else {
    questEl.innerHTML = '🏆 <b>Lenda do Bananal!</b> Continue cuidando da roça.';
    questEl.style.display = w.quest === QUESTS.length ? 'block' : 'none';
  }
}

// ---------------------------------------------------------------- Modais

export function isModalOpen(): boolean {
  return !!modalEl || !!dlgEl;
}

export function closeModal(): void {
  if (modalEl) {
    modalEl.remove();
    modalEl = null;
    const cb = modalClose;
    modalClose = null;
    cb?.();
  }
  if (S.mode === 'modal' && !dlgEl) S.mode = titleEl ? 'title' : 'play';
}

function openModal(title: string, content: HTMLElement, onClose?: () => void, noX = false): HTMLElement {
  closeModal();
  const ov = el('div', 'overlay');
  const m = el('div', 'panel modal');
  const h = el('h2', '', title);
  m.appendChild(h);
  if (!noX) {
    const x = el('button', 'x', '✕');
    x.onclick = () => {
      sfx('ui');
      closeModal();
    };
    m.appendChild(x);
  }
  m.appendChild(content);
  ov.appendChild(m);
  ov.addEventListener('pointerdown', (e) => {
    if (e.target === ov && !noX) closeModal();
  });
  root.appendChild(ov);
  modalEl = ov;
  modalClose = onClose ?? null;
  S.mode = 'modal';
  sfx('open');
  return m;
}

const STATS_LABEL: [string, string][] = [
  ['tilled', 'Terras aradas'],
  ['planted', 'Sementes plantadas'],
  ['watered', 'Plantas regadas'],
  ['harvested', 'Colheitas'],
  ['shipped', 'Itens entregues'],
  ['fished', 'Peixes pescados'],
  ['mined', 'Pedras quebradas'],
  ['talks', 'Conversas'],
  ['slept', 'Noites dormidas'],
];

export function openBackpack(tab: 'mochila' | 'amigos' | 'status' = 'mochila'): void {
  if (S.mode === 'title') return;
  let trash = false;
  const wrap = el('div');
  const render = () => {
    wrap.innerHTML = '';
    const tabs = el('div', 'tabs');
    (['mochila', 'amigos', 'status'] as const).forEach((t) => {
      const b = el('div', 'tab' + (t === tab ? ' on' : ''), t === 'mochila' ? '🎒 Mochila' : t === 'amigos' ? '❤️ Amizades' : '📜 Status');
      b.onclick = () => {
        tab = t;
        sfx('ui');
        render();
      };
      tabs.appendChild(b);
    });
    wrap.appendChild(tabs);
    if (tab === 'mochila') {
      const info = el('div', 'ds', 'Clique num item para colocá-lo na barra. Itens da barra (6 a 12) ficam nos slots 7-12. Passe o mouse para detalhes.');
      info.style.marginBottom = '6px';
      wrap.appendChild(info);
      const grid = el('div', 'grid');
      S.me.inv.forEach((st, i) => {
        const s = el('div', 'slot' + (i === S.me.sel - 6 ? ' sel' : ''));
        if (st) {
          const d = ITEMS[st.id];
          s.title = `${d?.name}\n${d?.desc}\nValor: ${d?.sell} 🍌`;
          s.innerHTML = `<img src="${itemIconURL(st.id)}" alt=""><span class="n">${st.n > 1 ? st.n : ''}</span>`;
        }
        s.onclick = () => {
          if (trash) H.trash(i);
          else H.swapInv(i);
          sfx('ui');
          render();
        };
        grid.appendChild(s);
      });
      wrap.appendChild(grid);
      const tb = el('button', 'btn ' + (trash ? 'red' : 'brown'), trash ? '🗑 Modo lixeira: ATIVO' : '🗑 Jogar fora');
      tb.style.marginTop = '8px';
      tb.onclick = () => {
        trash = !trash;
        render();
      };
      wrap.appendChild(tb);
      const tl = el('div', 'ds');
      tl.style.marginTop = '8px';
      tl.innerHTML = 'Ferramentas: ' + TOOL_IDS.map((t) => `${TOOL_NAMES[t]} (${TIER_NAMES[S.me.tiers[t]]})`).join(' • ');
      wrap.appendChild(tl);
    } else if (tab === 'amigos') {
      for (const n of NPCS) {
        const f = S.world.friendOf(n.id);
        const hrt = World.heartsOf(f.pts);
        const row = el('div', 'row');
        const img = el('img');
        img.src = portraitURL(n.look, hrt >= 4 ? 'happy' : 'neutral');
        img.style.width = '44px';
        img.style.height = '40px';
        row.appendChild(img);
        const nm = el('div', 'nm');
        nm.innerHTML = `${n.name}<div class="ds">${n.title} • 🎂 ${SEASONS[n.birthday.s]} ${n.birthday.d}${hrt >= 3 ? ' • Adora: ' + n.loves.map((l) => ITEMS[l]?.name).join(', ') : ''}</div>`;
        row.appendChild(nm);
        const h = el('div', 'hearts', '❤'.repeat(hrt) + '🖤'.repeat(10 - hrt));
        row.appendChild(h);
        wrap.appendChild(row);
      }
    } else {
      const w = S.world;
      const pct = Math.min(100, Math.floor((w.totalEarned / GOAL_MONEY) * 100));
      const d = el('div');
      d.innerHTML = `<div style="font-weight:800;margin-bottom:6px">🍌 Banco: ${fmtMoney(w.money)} • Total ganho: ${fmtMoney(w.totalEarned)}</div>
        <div style="background:#e2c78a;border:2px solid #a8743a;border-radius:8px;height:18px;overflow:hidden"><div style="height:100%;width:${pct}%;background:#6ab04a"></div></div>
        <div class="ds" style="margin:3px 0 8px">Meta: ${fmtMoney(GOAL_MONEY)} 🍌 (${pct}%) • Andar mais fundo na mina: ${S.me.mineMax}/20</div>
        ${STATS_LABEL.map(([k, l]) => `<div class="row"><div class="nm">${l}</div><div class="price">${S.world.stats[k] ?? 0}</div></div>`).join('')}`;
      wrap.appendChild(d);
    }
  };
  render();
  openModal('Mochila', wrap);
}

function shopHeader(npcId: string, line: string): HTMLElement {
  const n = NPC_BY_ID[npcId];
  const h = el('div', 'row');
  const img = el('img');
  img.src = portraitURL(n.look, 'happy');
  img.style.width = '66px';
  img.style.height = '60px';
  h.appendChild(img);
  const t = el('div', 'nm', `${n.name}<div class="ds">${line}</div>`);
  h.appendChild(t);
  const b = el('button', 'btn brown', '💬 Conversar');
  b.onclick = () => {
    closeModal();
    H.talk(npcId);
  };
  h.appendChild(b);
  return h;
}

export function openShop(kind: string, npcId: string): void {
  const n = NPC_BY_ID[npcId];
  let tab: 'buy' | 'sell' = 'buy';
  let qty = 1;
  const wrap = el('div');
  const render = () => {
    wrap.innerHTML = '';
    wrap.appendChild(shopHeader(npcId, n.shopLine));
    const money = el('div', 'price', `Seu dinheiro: 🍌 ${fmtMoney(S.world.money)}`);
    money.style.textAlign = 'left';
    money.style.padding = '6px';
    wrap.appendChild(money);
    if (kind === 'mercado' || kind === 'fazendinha' || kind === 'cabana') {
      const tabs = el('div', 'tabs');
      const tb = el('div', 'tab' + (tab === 'buy' ? ' on' : ''), kind === 'mercado' ? '🛒 Comprar' : kind === 'fazendinha' ? '🐔 Bichos' : '🎣 Equipamento');
      tb.onclick = () => {
        tab = 'buy';
        render();
      };
      const ts = el('div', 'tab' + (tab === 'sell' ? ' on' : ''), '💰 Vender');
      ts.onclick = () => {
        tab = 'sell';
        render();
      };
      tabs.append(tb, ts);
      [1, 5, 10].forEach((q) => {
        const b = el('div', 'tab' + (qty === q ? ' on' : ''), `x${q}`);
        b.onclick = () => {
          qty = q;
          render();
        };
        tabs.appendChild(b);
      });
      wrap.appendChild(tabs);
    }
    if (kind === 'mercado' && tab === 'buy') {
      for (const s of shopStock(S.world.season)) {
        const d = ITEMS[s.id];
        const row = el('div', 'row');
        row.innerHTML = `<img src="${itemIconURL(s.id)}"><div class="nm">${d.name}<div class="ds">${d.desc}</div></div><div class="price">${s.price} 🍌</div>`;
        const b = el('button', 'btn', 'Comprar');
        b.onclick = () => {
          H.buy(s.id, qty, s.price * qty, (ok) => {
            if (ok) sfx('coin');
            else sfx('error');
            render();
          });
        };
        row.appendChild(b);
        wrap.appendChild(row);
      }
    } else if (kind === 'fazendinha' && tab === 'buy') {
      (['galinha', 'cabra'] as const).forEach((k) => {
        const row = el('div', 'row');
        row.innerHTML = `<div class="nm">${k === 'galinha' ? '🐔 Galinha' : '🐐 Cabra-Macaco'}<div class="ds">${k === 'galinha' ? 'Põe ovos todo dia (se tiver capim no cocho).' : 'Dá leite e faz careta. Precisa de capim!'}</div></div><div class="price">${fmtMoney(ANIMAL_PRICES[k])} 🍌</div>`;
        const b = el('button', 'btn', 'Adotar');
        b.onclick = () => {
          H.buyAnimal(k, (ok) => {
            sfx(ok ? 'coin' : 'error');
            render();
          });
        };
        row.appendChild(b);
        wrap.appendChild(row);
      });
      const row = el('div', 'row');
      row.innerHTML = `<img src="${itemIconURL('capim')}"><div class="nm">Capim<div class="ds">Coloque no cocho do cercado (tecla E).</div></div><div class="price">8 🍌</div>`;
      const b = el('button', 'btn', 'Comprar');
      b.onclick = () => H.buy('capim', qty, 8 * qty, (ok) => {
        sfx(ok ? 'coin' : 'error');
        render();
      });
      row.appendChild(b);
      wrap.appendChild(row);
    } else if (kind === 'cabana' && tab === 'buy') {
      const t = S.me.tiers.rod;
      const row = el('div', 'row');
      row.innerHTML = `<img src="${toolIconURL('rod', Math.min(3, t + 1))}"><div class="nm">Vara de Pesca: ${TIER_NAMES[t]}<div class="ds">${t >= 2 ? 'Já é a melhor vara da Dolores!' : 'Barra verde maior no minigame de pesca.'}</div></div><div class="price">${t >= 2 ? '—' : fmtMoney(ROD_COST[t]) + ' 🍌'}</div>`;
      const b = el('button', 'btn', 'Melhorar');
      b.disabled = t >= 2;
      b.onclick = () => H.upgrade('rod', (ok) => {
        sfx(ok ? 'coin' : 'error');
        render();
      });
      row.appendChild(b);
      wrap.appendChild(row);
    } else if (kind === 'ferraria') {
      (['hoe', 'can', 'axe', 'pick'] as ToolId[]).forEach((tool) => {
        const t = S.me.tiers[tool];
        const row = el('div', 'row');
        const up = UPGRADE_COST[t];
        const have = up ? countItem(S.me, up.ore) : 0;
        row.innerHTML = `<img src="${toolIconURL(tool, Math.min(3, t + 1))}"><div class="nm">${TOOL_NAMES[tool]}: ${TIER_NAMES[t]}<div class="ds">${up ? `Custo: ${fmtMoney(up.gold)} 🍌 + ${up.n}x ${ITEMS[up.ore].name} (você tem ${have})` : 'Ferramenta no nível máximo!'}</div></div>`;
        const b = el('button', 'btn', 'Melhorar');
        b.disabled = !up;
        b.onclick = () => H.upgrade(tool, (ok) => {
          sfx(ok ? 'coin' : 'error');
          render();
        });
        row.appendChild(b);
        wrap.appendChild(row);
      });
      const tip = el('div', 'ds', 'Dica: ferramentas melhores gastam menos energia, quebram mais rápido e a Enxada/Regador/ cobrem mais terreno.');
      tip.style.padding = '6px';
      wrap.appendChild(tip);
      const sellAll = el('div', 'tabs');
      const sb = el('div', 'tab' + (tab === 'sell' ? ' on' : ''), '💰 Vender minérios');
      sb.onclick = () => {
        tab = tab === 'sell' ? 'buy' : 'sell';
        render();
      };
      sellAll.appendChild(sb);
      wrap.appendChild(sellAll);
    }
    if (tab === 'sell') {
      const mult = kind === 'cabana' ? 1 : 0.7;
      let any = false;
      S.me.inv.forEach((st, i) => {
        if (!st) return;
        const d = ITEMS[st.id];
        if (kind === 'cabana' && d.cat !== 'fish') return;
        if (kind === 'ferraria' && d.cat !== 'mineral') return;
        any = true;
        const row = el('div', 'row');
        const each = Math.floor(d.sell * mult);
        row.innerHTML = `<img src="${itemIconURL(st.id)}"><div class="nm">${d.name} x${st.n}<div class="ds">${each} 🍌 cada${kind === 'cabana' ? ' (preço cheio!)' : ''}</div></div>`;
        const b = el('button', 'btn', qty > 1 ? `Vender ${Math.min(qty, st.n)}` : 'Vender 1');
        b.onclick = () => {
          H.sell(i, Math.min(qty, st.n), mult);
          sfx('coin');
          render();
        };
        const b2 = el('button', 'btn brown', 'Tudo');
        b2.onclick = () => {
          H.sell(i, st.n, mult);
          sfx('coin');
          render();
        };
        row.append(b, b2);
        wrap.appendChild(row);
      });
      if (!any) wrap.appendChild(el('div', 'ds', 'Nada para vender aqui... Que tal colher ou pescar algo?'));
    }
  };
  render();
  openModal(n.shopLine ? `${NPC_BY_ID[npcId].title}` : 'Loja', wrap);
}

export function openPause(): void {
  if (S.mode === 'title') return;
  const wrap = el('div');
  const mk = (label: string, cls: string, fn: () => void) => {
    const b = el('button', 'btn ' + cls, label);
    b.style.display = 'block';
    b.style.width = '100%';
    b.style.marginBottom = '8px';
    b.onclick = () => {
      sfx('ui');
      fn();
    };
    wrap.appendChild(b);
  };
  mk('▶ Continuar', '', () => closeModal());
  mk('💾 Salvar jogo', 'brown', () => {
    H.save();
    closeModal();
  });
  mk(`🎵 Música: ${S.musicOn ? 'ligada' : 'desligada'}`, 'brown', () => {
    H.toggleMusic();
    openPause();
  });
  mk('🎮 Controles (F1)', 'brown', () => H.openControls?.());
  mk('❓ Dicas da roça', 'brown', () => openHelp());
  mk('🏠 Menu inicial', 'brown', () => {
    closeModal();
    H.toTitle();
  });
  mk('🔄 Reiniciar do zero (apaga o save)', 'red', () => {
    if (confirm('Apagar a roça e começar de novo?')) {
      closeModal();
      H.newGame();
    }
  });
  openModal('⏸ Pausa', wrap);
}

export function openHelp(): void {
  const d = el('div');
  d.innerHTML = `<div class="ds" style="font-size:14px;line-height:1.6;color:#3b2412">
  🎮 <b>Controles:</b> aperte <b>F1</b> ou clique em <b>🎮 Controles</b> no topo.<br><br>
  🌱 Are (1), plante sementes, regue (2). O Regador enche na água (lago/rio)!<br>
  🌧️ Chuva rega sozinha. Plantas fora de estação morrem na virada.<br>
  🎣 Pesca: Vara (5) de frente para a água. Espaço/clique quando aparecer o "!" e segure para subir a barra verde.<br>
  ⛏️ Mina: nordeste da vila. Quebre pedras atrás da escada, cuidado com as gosmas!<br>
  🐔 Compre bichos na Fazendinha, ponha capim no cocho e colete (E) todo dia.<br>
  🌙 Durma na porta da sua casa (E) antes das 02:00!<br>
  🐒 Co-op: botão "Co-op Online" no topo — host manda no mundo, dinheiro é de todos.</div>`;
  openModal('Dicas da roça', d);
}

export function openSummary(lines: string[], title: string, onClose: () => void): void {
  const d = el('div');
  d.innerHTML = lines.map((l) => `<div class="row"><div class="nm">${l}</div></div>`).join('');
  const b = el('button', 'btn big', '☀️ Bom dia!');
  b.style.marginTop = '12px';
  b.style.display = 'block';
  b.style.marginLeft = 'auto';
  b.style.marginRight = 'auto';
  b.onclick = () => closeModal();
  d.appendChild(b);
  openModal(title, d, onClose, true);
}

export function openLetter(pages: string[], onDone: () => void): void {
  let i = 0;
  const d = el('div');
  const render = () => {
    d.innerHTML = `<div style="font-size:19px;line-height:1.5;font-style:italic;min-height:130px;font-weight:600">${pages[i]}</div>`;
    const b = el('button', 'btn', i < pages.length - 1 ? 'Continuar ▶' : '🌾 Ir para a roça!');
    b.style.float = 'right';
    b.onclick = () => {
      sfx('ui');
      if (i < pages.length - 1) {
        i++;
        render();
      } else closeModal();
    };
    d.appendChild(b);
  };
  render();
  openModal('💌 Carta do Vovô', d, onDone, true);
}

// ---------------------------------------------------------------- Diálogo

interface DlgState {
  pages: string[];
  i: number;
  shown: number;
  timer: number;
  choices?: { label: string; fn: () => void }[];
  onEnd?: () => void;
  blip: number;
  done: boolean;
}
let dlg: DlgState | null = null;

export function dialogue(opts: { name: string; look?: Look; mood?: Mood; pages: string[]; choices?: { label: string; fn: () => void }[]; onEnd?: () => void; pitch?: number }): void {
  closeDialogue(false);
  const e = el('div', 'panel');
  e.id = 'vl-dlg';
  const pt = el('div', 'pt');
  if (opts.look) {
    const im = el('img');
    im.src = portraitURL(opts.look, opts.mood ?? 'neutral');
    pt.appendChild(im);
  } else pt.innerHTML = '<div style="font-size:70px">💌</div>';
  e.appendChild(pt);
  e.appendChild(el('div', 'nm', opts.name));
  const tx = el('div', 'tx');
  e.appendChild(tx);
  const ch = el('div', 'ch');
  e.appendChild(ch);
  const nx = el('div', 'nx', '▼');
  e.appendChild(nx);
  root.appendChild(e);
  dlgEl = e;
  S.mode = 'modal';
  dlg = { pages: opts.pages, i: 0, shown: 0, timer: 0, choices: opts.choices, onEnd: opts.onEnd, blip: opts.pitch ?? 0, done: false };
  e.onclick = () => dialogueAdvance();
  const tick = () => {
    if (!dlg || dlgEl !== e) return;
    const page = dlg.pages[dlg.i];
    if (dlg.shown < page.length) {
      dlg.shown = Math.min(page.length, dlg.shown + 1);
      if (dlg.shown % 2 === 0) sfx('blip', dlg.blip);
      tx.textContent = page.slice(0, dlg.shown);
    }
    const complete = dlg.shown >= page.length;
    const last = dlg.i >= dlg.pages.length - 1;
    nx.style.display = complete && !(last && dlg.choices) ? 'block' : 'none';
    if (complete && last && dlg.choices && ch.childElementCount === 0) {
      dlg.choices.forEach((c) => {
        const b = el('button', 'btn brown', c.label);
        b.onclick = (ev) => {
          ev.stopPropagation();
          sfx('ui');
          closeDialogue(false);
          c.fn();
        };
        ch.appendChild(b);
      });
    }
    window.setTimeout(tick, 22);
  };
  tick();
}

export function dialogueActive(): boolean {
  return !!dlgEl;
}

export function dialogueAdvance(): void {
  if (!dlg || !dlgEl) return;
  const page = dlg.pages[dlg.i];
  if (dlg.shown < page.length) {
    dlg.shown = page.length;
    return;
  }
  if (dlg.i < dlg.pages.length - 1) {
    dlg.i++;
    dlg.shown = 0;
    sfx('ui');
    return;
  }
  if (dlg.choices) return;
  closeDialogue(true);
}

export function closeDialogue(callEnd: boolean): void {
  const onEnd = dlg?.onEnd;
  dlgEl?.remove();
  dlgEl = null;
  dlg = null;
  if (S.mode === 'modal' && !modalEl) S.mode = titleEl ? 'title' : 'play';
  if (callEnd) onEnd?.();
}

// ---------------------------------------------------------------- Título e criação

let titleEl: HTMLElement | null = null;

export function hideTitle(): void {
  titleEl?.remove();
  titleEl = null;
}

export function showTitle(hasSave: boolean): void {
  hideTitle();
  closeModal();
  closeDialogue(false);
  showHUD(false);
  const t = el('div');
  t.id = 'vl-title';
  t.innerHTML = `<h1>BANANAL VALLEY</h1><h2>A Roça do Macaco 🐒🌾</h2>
  <div class="sm">Herde a roça do Vovô na Vila Bananal, plante, pesque, minere e faça amigos! Jogue sozinho ou use <b>🐒 Co-op Online</b> (no topo) para até 4 fazendeiros na mesma roça.</div>`;
  const play = el('button', 'btn big', '🌱 JOGAR');
  play.onclick = () => {
    sfx('ui');
    showCreator();
  };
  t.appendChild(play);
  if (hasSave) {
    const c = el('button', 'btn big brown', '▶ Continuar');
    c.onclick = () => {
      sfx('ui');
      H.continueGame();
    };
    t.appendChild(c);
  }
  const hp = el('button', 'btn brown', '❓ Dicas da roça');
  hp.onclick = () => openHelp();
  t.appendChild(hp);
  t.appendChild(el('div', 'sm', '🎮 Controles: <b>F1</b> ou botão <b>🎮 Controles</b> no topo'));
  root.appendChild(t);
  titleEl = t;
  S.mode = 'title';
}

export function showCreator(): void {
  const d = el('div');
  let fi = 0;
  let si = 0;
  const prev = el('img');
  prev.style.width = '132px';
  prev.style.display = 'block';
  prev.style.margin = '0 auto';
  const look = (): Look => playerLook(fi, si);
  const name = el('input', 'nm-in') as HTMLInputElement;
  name.value = S.me.name && S.me.name !== 'Macaco' ? S.me.name : 'Zé Banana';
  name.maxLength = 14;
  const sws = el('div');
  const render = () => {
    prev.src = portraitURL(look(), 'happy');
    sws.innerHTML = '';
    sws.appendChild(el('div', 'ds', 'Pelagem'));
    FUR_PALETTES.forEach((f, i) => {
      const s = el('span', 'sw' + (i === fi ? ' on' : ''));
      s.style.background = f.fur;
      s.title = f.name;
      s.onclick = () => {
        fi = i;
        sfx('pop');
        render();
      };
      sws.appendChild(s);
    });
    sws.appendChild(el('div', 'ds', 'Camisa'));
    SHIRT_COLORS.forEach((c, i) => {
      const s = el('span', 'sw' + (i === si ? ' on' : ''));
      s.style.background = c;
      s.onclick = () => {
        si = i;
        sfx('pop');
        render();
      };
      sws.appendChild(s);
    });
  };
  d.append(prev, el('div', 'ds', 'Nome do fazendeiro'), name, sws);
  const go = el('button', 'btn big', '🌾 Começar a roça!');
  go.style.display = 'block';
  go.style.margin = '12px auto 0';
  const submit = () => {
    sfx('coin');
    hideTitle();
    closeModal();
    H.startNew(name.value.trim() || 'Zé Banana', fi, si);
  };
  go.onclick = submit;
  name.onkeydown = (e) => {
    if (e.key === 'Enter') submit();
  };
  d.appendChild(go);
  render();
  if (titleEl) titleEl.style.display = 'none';
  openModal('Crie seu macaco', d, () => {
    if (titleEl) titleEl.style.display = 'flex';
  });
  requestAnimationFrame(() => name.focus());
}

export function uiReset(): void {
  closeModal();
  closeDialogue(false);
}

// ---------------------------------------------------------------- Pesca

let fishEl: HTMLElement | null = null;
export function fishUI(show: boolean, bar = 0, size = 0.25, pos = 0, prog = 0, fishId = 'lambari'): void {
  if (!show) {
    fishEl?.remove();
    fishEl = null;
    return;
  }
  if (!fishEl) {
    fishEl = el('div');
    fishEl.id = 'vl-fish';
    fishEl.innerHTML = `<div class="zone"></div><img class="fi" src="${itemIconURL(fishId)}"><div class="pr"><div></div></div>`;
    root.appendChild(fishEl);
  }
  const h = 172;
  const z = fishEl.querySelector<HTMLElement>('.zone')!;
  z.style.height = `${size * h}px`;
  z.style.top = `${4 + (1 - bar - size) * h}px`;
  const f = fishEl.querySelector<HTMLElement>('.fi')!;
  f.style.top = `${4 + (1 - pos) * (h - 16)}px`;
  (fishEl.querySelector('.pr div') as HTMLElement).style.height = `${prog * 100}%`;
}

export { CROPS, DAYS_PER_SEASON };
