import {
  ACCESSORIES,
  CAREERS,
  CATALOG_LIST,
  FURNITURE_CATALOG,
  FUR_PALETTES,
  QUICK_EMOTES,
  RANDOM_MONKEY_NAMES,
  SKILL_LABELS,
  SOCIAL_ACTIONS,
  TRAITS,
} from './catalog';
import { calculateHouseComfort } from './house';
import { simsAudio } from './sfx';
import { monkeyHeadIcon, renderMonkeyPortrait } from './monkeylook';
import type { GameSimulation } from './simulation';
import type {
  AccessoryId,
  FurnitureCategory,
  FurnitureKind,
  MonkeySim,
  NeedKey,
  PlacedFurniture,
  SimSpeed,
  SkillKey,
  SocialActionKind,
  TraitId,
} from './types';

export interface CasResult {
  name: string;
  furColor: string;
  bellyColor: string;
  accessory: AccessoryId;
  trait: TraitId;
}

export interface UiHandlers {
  onStartGame: (cas: CasResult) => void;
  onSetSpeed: (speed: SimSpeed) => void;
  onToggleBuildMode: () => void;
  onSelectBuildKind: (kind: FurnitureKind | null) => void;
  onToggleMoveMode: () => void;
  onToggleSellMode: () => void;
  onRotateBuild: () => void;
  onGoToWork: () => void;
  onCenterCamera: () => void;
  onSelectMonkey: (monkeyId: string) => void;
  onCancelAction: (monkeyId: string, index: number) => void;
  onTriggerFurnitureAction: (furnitureId: string, interactionId: string) => void;
  onTriggerSocialAction: (targetMonkeyId: string, action: SocialActionKind) => void;
  onTriggerFireAction: (fireId: string) => void;
  onTriggerPuddleAction: (puddleId: string) => void;
  onSendChat: (text: string) => void;
}

const NEED_META: Array<{ key: NeedKey; emoji: string; label: string }> = [
  { key: 'hunger', emoji: '🍌', label: 'Fome' },
  { key: 'energy', emoji: '⚡', label: 'Energia' },
  { key: 'hygiene', emoji: '🚿', label: 'Higiene' },
  { key: 'bladder', emoji: '🚽', label: 'Bexiga' },
  { key: 'fun', emoji: '🎮', label: 'Diversão' },
  { key: 'social', emoji: '💬', label: 'Social' },
];

export class SimsUi {
  private root: HTMLElement;
  private handlers: UiHandlers;

  private casOverlay: HTMLDivElement | null = null;
  private hudWrap: HTMLDivElement;
  private topBar: HTMLDivElement;
  private leftCol: HTMLDivElement;
  private bottomDeck: HTMLDivElement;
  private buildDrawer: HTMLDivElement;
  private contextMenu: HTMLDivElement;
  private skillsDrawer: HTMLDivElement;

  private showSkills = false;
  private buildCategory: 'all' | FurnitureCategory = 'all';
  private buildTool: 'buy' | 'move' | 'sell' = 'buy';
  private selectedBuildKind: FurnitureKind | null = 'pc_rgb';
  private lastUiSync = 0;

  constructor(root: HTMLElement, handlers: UiHandlers) {
    this.root = root;
    this.handlers = handlers;
    this.injectStyles();

    this.hudWrap = document.createElement('div');
    this.hudWrap.className = 'msims-hud';
    this.hudWrap.style.display = 'none';
    this.root.appendChild(this.hudWrap);

    this.topBar = document.createElement('div');
    this.topBar.className = 'msims-topbar';
    this.hudWrap.appendChild(this.topBar);

    this.leftCol = document.createElement('div');
    this.leftCol.className = 'msims-leftcol';
    this.hudWrap.appendChild(this.leftCol);

    this.bottomDeck = document.createElement('div');
    this.bottomDeck.className = 'msims-bottom-deck';
    this.hudWrap.appendChild(this.bottomDeck);

    this.skillsDrawer = document.createElement('div');
    this.skillsDrawer.className = 'msims-skills-drawer';
    this.skillsDrawer.style.display = 'none';
    this.hudWrap.appendChild(this.skillsDrawer);

    this.buildDrawer = document.createElement('div');
    this.buildDrawer.className = 'msims-build-drawer';
    this.buildDrawer.style.display = 'none';
    this.hudWrap.appendChild(this.buildDrawer);

    this.contextMenu = document.createElement('div');
    this.contextMenu.className = 'msims-ctx-menu';
    this.contextMenu.style.display = 'none';
    this.hudWrap.appendChild(this.contextMenu);

    this.buildTopBarSkeleton();
    this.buildBottomDeckSkeleton();
    this.renderBuildDrawer();
  }

  private injectStyles(): void {
    if (document.getElementById('monkey-sims-styles')) return;
    const st = document.createElement('style');
    st.id = 'monkey-sims-styles';
    st.textContent = `
      .msims-hud { position: fixed; inset: 0; pointer-events: none; font-family: 'Segoe UI', system-ui, sans-serif; }
      .msims-card {
        background: rgba(15, 23, 42, 0.9);
        backdrop-filter: blur(8px);
        border: 2px solid rgba(74, 222, 128, 0.55);
        border-radius: 14px;
        color: #f8fafc;
        box-shadow: 0 8px 24px rgba(0,0,0,0.45);
        pointer-events: auto;
      }
      .msims-btn {
        background: #1e293b;
        color: #f8fafc;
        border: 1.5px solid #475569;
        border-radius: 10px;
        padding: 5px 10px;
        font-size: 12px;
        font-weight: 700;
        cursor: pointer;
        transition: transform 0.08s ease, background 0.12s ease;
      }
      .msims-btn:hover { background: #334155; transform: translateY(-1px); }
      .msims-btn.active { background: #16a34a; border-color: #86efac; color: #ffffff; }
      .msims-btn.warn { background: #b45309; border-color: #facc15; }
      .msims-btn.danger { background: #991b1b; border-color: #fca5a5; }

      .msims-topbar {
        position: fixed;
        top: 10px;
        right: 12px;
        display: flex;
        flex-wrap: wrap;
        align-items: center;
        gap: 6px;
        padding: 6px 10px;
        background: rgba(15, 23, 42, 0.9);
        border: 2px solid #4ade80;
        border-radius: 16px;
        pointer-events: auto;
        box-shadow: 0 6px 20px rgba(0,0,0,0.45);
        max-width: calc(100vw - 380px);
      }
      .msims-stat-pill {
        background: #0f172a;
        border: 1px solid #334155;
        border-radius: 999px;
        padding: 4px 10px;
        font-size: 12px;
        font-weight: 800;
        display: inline-flex;
        align-items: center;
        gap: 4px;
      }
      .msims-leftcol {
        position: fixed;
        top: 58px;
        left: 12px;
        display: flex;
        flex-direction: column;
        gap: 8px;
        width: 248px;
        pointer-events: none;
      }
      .msims-queue {
        display: flex;
        gap: 5px;
        flex-wrap: wrap;
        pointer-events: auto;
      }
      .msims-q-item {
        background: rgba(15, 23, 42, 0.92);
        border: 2px solid #4ade80;
        border-radius: 10px;
        padding: 4px 8px;
        font-size: 11px;
        font-weight: 700;
        cursor: pointer;
        display: flex;
        align-items: center;
        gap: 4px;
        color: #fef08a;
      }
      .msims-q-item:hover { border-color: #ef4444; background: #450a0a; }
      .msims-aspirations {
        padding: 8px 10px;
        font-size: 11.5px;
      }
      .msims-aspirations h4 { margin: 0 0 6px; font-size: 12px; color: #facc15; }
      .msims-asp-row { display: flex; justify-content: space-between; gap: 6px; margin-bottom: 4px; color: #e2e8f0; }

      .msims-bottom-deck {
        position: fixed;
        bottom: 10px;
        left: 50%;
        transform: translateX(-50%);
        width: min(980px, calc(100vw - 20px));
        display: grid;
        grid-template-columns: auto 1fr auto;
        gap: 10px;
        align-items: center;
        padding: 10px 14px;
        background: rgba(15, 23, 42, 0.93);
        border: 2px solid #4ade80;
        border-radius: 18px;
        box-shadow: 0 10px 30px rgba(0,0,0,0.55);
        pointer-events: auto;
      }
      .msims-portraits { display: flex; gap: 6px; }
      .msims-portrait {
        width: 54px;
        padding: 4px;
        border-radius: 12px;
        background: #1e293b;
        border: 2px solid #475569;
        cursor: pointer;
        text-align: center;
        font-size: 10px;
        font-weight: 700;
        color: #e2e8f0;
      }
      .msims-portrait.active { border-color: #4ade80; background: #14532d; color: #fef08a; }
      .msims-needs-grid {
        display: grid;
        grid-template-columns: repeat(3, minmax(115px, 1fr));
        gap: 6px 10px;
      }
      .msims-need-row { display: flex; flex-direction: column; gap: 2px; font-size: 11px; font-weight: 700; }
      .msims-need-bar { height: 9px; background: #0f172a; border-radius: 999px; overflow: hidden; border: 1px solid #334155; }
      .msims-need-fill { height: 100%; transition: width 0.2s ease, background 0.2s ease; }

      .msims-chat-col { display: flex; flex-direction: column; gap: 5px; width: 215px; }
      .msims-emote-row { display: flex; gap: 4px; flex-wrap: wrap; }
      .msims-chat-form { display: flex; gap: 4px; }
      .msims-input {
        flex: 1;
        min-width: 0;
        background: #0f172a;
        color: #fff;
        border: 1px solid #475569;
        border-radius: 8px;
        padding: 5px 8px;
        font-size: 12px;
      }

      .msims-skills-drawer {
        position: fixed;
        bottom: 122px;
        right: 16px;
        width: 260px;
        padding: 12px;
        background: rgba(15, 23, 42, 0.96);
        border: 2px solid #facc15;
        border-radius: 14px;
        pointer-events: auto;
        box-shadow: 0 10px 28px rgba(0,0,0,0.6);
      }

      .msims-build-drawer {
        position: fixed;
        bottom: 122px;
        left: 50%;
        transform: translateX(-50%);
        width: min(960px, calc(100vw - 24px));
        padding: 10px 14px;
        background: rgba(15, 23, 42, 0.96);
        border: 2px solid #facc15;
        border-radius: 16px;
        pointer-events: auto;
        box-shadow: 0 12px 30px rgba(0,0,0,0.65);
      }
      .msims-build-items {
        display: flex;
        gap: 8px;
        overflow-x: auto;
        padding: 6px 2px;
      }
      .msims-shop-card {
        min-width: 142px;
        background: #1e293b;
        border: 2px solid #334155;
        border-radius: 12px;
        padding: 8px;
        cursor: pointer;
        display: flex;
        flex-direction: column;
        gap: 3px;
        font-size: 11.5px;
      }
      .msims-shop-card:hover { border-color: #facc15; }
      .msims-shop-card.selected { border-color: #4ade80; background: #14532d; }

      .msims-ctx-menu {
        position: fixed;
        z-index: 60;
        min-width: 225px;
        max-width: 290px;
        background: rgba(15, 23, 42, 0.97);
        border: 2px solid #4ade80;
        border-radius: 14px;
        padding: 8px;
        box-shadow: 0 14px 36px rgba(0,0,0,0.65);
        pointer-events: auto;
      }
      .msims-ctx-head { font-size: 13px; font-weight: 800; color: #fef08a; margin-bottom: 6px; padding-bottom: 5px; border-bottom: 1px solid #334155; }
      .msims-ctx-opt {
        width: 100%;
        text-align: left;
        background: #1e293b;
        border: 1px solid #334155;
        border-radius: 9px;
        padding: 7px 9px;
        margin-bottom: 4px;
        color: #f8fafc;
        cursor: pointer;
        display: flex;
        flex-direction: column;
        gap: 1px;
      }
      .msims-ctx-opt:hover { background: #15803d; border-color: #86efac; }
      .msims-ctx-opt small { color: #cbd5e1; font-size: 10.5px; }

      .msims-cas-backdrop {
        position: fixed;
        inset: 0;
        z-index: 80;
        background: radial-gradient(circle at top, rgba(22, 101, 52, 0.92), rgba(7, 29, 20, 0.97));
        display: flex;
        align-items: center;
        justify-content: center;
        padding: 16px;
        pointer-events: auto;
      }
      .msims-cas-modal {
        width: min(760px, 100%);
        max-height: 92vh;
        overflow-y: auto;
        background: rgba(15, 23, 42, 0.95);
        border: 3px solid #4ade80;
        border-radius: 22px;
        padding: 20px 24px;
        box-shadow: 0 20px 50px rgba(0,0,0,0.7);
      }
      .msims-cas-grid { display: grid; grid-template-columns: 220px 1fr; gap: 18px; align-items: start; }
      @media (max-width: 720px) {
        .msims-cas-grid { grid-template-columns: 1fr; }
        .msims-bottom-deck { grid-template-columns: 1fr; }
        .msims-needs-grid { grid-template-columns: repeat(2, 1fr); }
        .msims-topbar { max-width: calc(100vw - 24px); top: 52px; }
        .msims-leftcol { top: 106px; }
      }
    `;
    document.head.appendChild(st);
  }

  public showCasScreen(initialName: string): void {
    this.hudWrap.style.display = 'none';
    if (this.casOverlay) this.casOverlay.remove();

    let name = initialName || RANDOM_MONKEY_NAMES[0];
    let furIndex = 0;
    let accessory: AccessoryId = 'juliet';
    let trait: TraitId = 'party';

    const overlay = document.createElement('div');
    overlay.className = 'msims-cas-backdrop';
    this.casOverlay = overlay;

    const modal = document.createElement('div');
    modal.className = 'msims-cas-modal';
    overlay.appendChild(modal);

    const renderCas = () => {
      const palette = FUR_PALETTES[furIndex];
      modal.innerHTML = `
        <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:12px;">
          <div>
            <h1 style="margin:0;font-size:24px;color:#fef08a;">🏡 Os Símios: Vida na Árvore</h1>
            <div style="font-size:12.5px;color:#86efac;font-weight:600;">CAS Express — Crie seu macaco antes de invadir a república!</div>
          </div>
          <span style="background:#14532d;border:1.5px solid #4ade80;padding:4px 10px;border-radius:999px;font-size:11px;font-weight:800;">Solo &amp; Co-op 6P</span>
        </div>

        <div class="msims-cas-grid">
          <div style="background:#0f172a;border:2px solid #334155;border-radius:16px;padding:14px;text-align:center;">
            <img alt="Prévia do macaco" width="200" height="200" style="display:block;margin:0 auto;filter:drop-shadow(0 6px 8px rgba(0,0,0,.45));" src="${renderMonkeyPortrait(palette.fur, palette.belly, accessory)}" />
            <div style="font-weight:800;font-size:15px;color:#fef08a;">${escapeHtml(name)}</div>
            <div style="font-size:11.5px;color:#86efac;margin-top:3px;">${TRAITS[trait].emoji} ${TRAITS[trait].name}</div>
          </div>

          <div style="display:flex;flex-direction:column;gap:12px;">
            <div>
              <label style="font-size:12px;font-weight:700;color:#cbd5e1;display:block;margin-bottom:4px;">Nome do Macaco</label>
              <div style="display:flex;gap:6px;">
                <input id="cas-name" class="msims-input" value="${escapeAttr(name)}" maxlength="18" />
                <button id="cas-rand" class="msims-btn" type="button">🎲 Aleatório</button>
              </div>
            </div>

            <div>
              <label style="font-size:12px;font-weight:700;color:#cbd5e1;display:block;margin-bottom:5px;">Cor do Pelo</label>
              <div style="display:flex;gap:8px;flex-wrap:wrap;">
                ${FUR_PALETTES.map(
                  (p, i) => `
                  <button type="button" data-fur="${i}" class="msims-btn ${i === furIndex ? 'active' : ''}" style="display:flex;align-items:center;gap:5px;">
                    <span style="width:14px;height:14px;border-radius:999px;background:${p.fur};border:1px solid #fff;"></span>
                    ${p.name.split(' ')[0]}
                  </button>`,
                ).join('')}
              </div>
            </div>

            <div>
              <label style="font-size:12px;font-weight:700;color:#cbd5e1;display:block;margin-bottom:5px;">Estilo / Chapéu</label>
              <div style="display:flex;gap:6px;flex-wrap:wrap;">
                ${ACCESSORIES.map(
                  (a) => `
                  <button type="button" data-acc="${a.id}" class="msims-btn ${a.id === accessory ? 'active' : ''}">
                    ${a.emoji} ${a.name}
                  </button>`,
                ).join('')}
              </div>
            </div>

            <div>
              <label style="font-size:12px;font-weight:700;color:#cbd5e1;display:block;margin-bottom:5px;">Traço de Personalidade</label>
              <div style="display:grid;grid-template-columns:1fr 1fr;gap:6px;">
                ${(Object.keys(TRAITS) as TraitId[])
                  .map(
                    (tid) => `
                  <button type="button" data-trait="${tid}" class="msims-btn ${tid === trait ? 'active' : ''}" style="text-align:left;padding:7px 9px;">
                    <div>${TRAITS[tid].emoji} ${TRAITS[tid].name}</div>
                    <small style="font-weight:500;color:#cbd5e1;display:block;margin-top:2px;">${TRAITS[tid].summary}</small>
                  </button>`,
                  )
                  .join('')}
              </div>
            </div>
          </div>
        </div>

        <div style="margin-top:16px;padding-top:12px;border-top:1px solid #334155;display:flex;justify-content:space-between;align-items:center;gap:12px;flex-wrap:wrap;">
          <div style="font-size:11.5px;color:#94a3b8;">
            💡 Use <b>🐒 Co-op Online</b> no canto superior esquerdo para jogar com até 6 amigos • 🎮 Controles: <b>F1</b>
          </div>
          <button id="cas-start" class="msims-btn active" style="font-size:15px;padding:10px 22px;border-radius:12px;">
            🍌 ENTRAR NA CASA NA ÁRVORE!
          </button>
        </div>
      `;

      const nameInput = modal.querySelector<HTMLInputElement>('#cas-name')!;
      nameInput.oninput = () => {
        name = nameInput.value;
      };

      modal.querySelector<HTMLButtonElement>('#cas-rand')!.onclick = () => {
        name = RANDOM_MONKEY_NAMES[Math.floor(Math.random() * RANDOM_MONKEY_NAMES.length)];
        renderCas();
      };

      modal.querySelectorAll<HTMLButtonElement>('[data-fur]').forEach((btn) => {
        btn.onclick = () => {
          furIndex = Number(btn.dataset.fur);
          renderCas();
        };
      });

      modal.querySelectorAll<HTMLButtonElement>('[data-acc]').forEach((btn) => {
        btn.onclick = () => {
          accessory = btn.dataset.acc as AccessoryId;
          renderCas();
        };
      });

      modal.querySelectorAll<HTMLButtonElement>('[data-trait]').forEach((btn) => {
        btn.onclick = () => {
          trait = btn.dataset.trait as TraitId;
          renderCas();
        };
      });

      modal.querySelector<HTMLButtonElement>('#cas-start')!.onclick = () => {
        const cleanName = name.trim() || 'Chico Banana';
        overlay.remove();
        this.casOverlay = null;
        this.hudWrap.style.display = 'block';
        this.handlers.onStartGame({
          name: cleanName,
          furColor: FUR_PALETTES[furIndex].fur,
          bellyColor: FUR_PALETTES[furIndex].belly,
          accessory,
          trait,
        });
      };
    };

    renderCas();
    this.root.appendChild(overlay);
  }

  private buildTopBarSkeleton(): void {
    this.topBar.innerHTML = `
      <span class="msims-stat-pill" id="ms-clock">☀️ Dia 1 • 08:00</span>
      <div style="display:flex;gap:3px;">
        <button class="msims-btn" data-spd="0" title="Pausar (Espaço)">⏸</button>
        <button class="msims-btn active" data-spd="1" title="Velocidade 1x">1x</button>
        <button class="msims-btn" data-spd="2" title="Velocidade 2x">2x</button>
        <button class="msims-btn" data-spd="3" title="Velocidade 3x">3x</button>
      </div>
      <span class="msims-stat-pill" style="color:#4ade80;" id="ms-money">🍌 B$ 520</span>
      <span class="msims-stat-pill" style="color:#fef08a;" id="ms-comfort">🏡 100</span>
      <span class="msims-stat-pill" style="color:#38bdf8;" id="ms-score">⭐ 0</span>
      <button class="msims-btn warn" id="ms-build-btn">🛒 Loja (B)</button>
      <button class="msims-btn" id="ms-work-btn">💼 Trabalhar</button>
      <button class="msims-btn" id="ms-center-btn" title="Centralizar Câmera">🎯</button>
      <button class="msims-btn active" id="ms-music-btn" title="Música Bossa Sim">🎵</button>
    `;

    this.topBar.querySelectorAll<HTMLButtonElement>('[data-spd]').forEach((btn) => {
      btn.onclick = () => {
        this.handlers.onSetSpeed(Number(btn.dataset.spd) as SimSpeed);
      };
    });
    this.topBar.querySelector<HTMLButtonElement>('#ms-build-btn')!.onclick = () =>
      this.handlers.onToggleBuildMode();
    this.topBar.querySelector<HTMLButtonElement>('#ms-work-btn')!.onclick = () =>
      this.handlers.onGoToWork();
    this.topBar.querySelector<HTMLButtonElement>('#ms-center-btn')!.onclick = () =>
      this.handlers.onCenterCamera();
    const musicBtn = this.topBar.querySelector<HTMLButtonElement>('#ms-music-btn')!;
    musicBtn.onclick = () => {
      const enabled = simsAudio.toggleMusic();
      musicBtn.classList.toggle('active', enabled);
      musicBtn.textContent = enabled ? '🎵' : '🔇';
    };
  }

  private buildBottomDeckSkeleton(): void {
    this.bottomDeck.innerHTML = `
      <div class="msims-portraits" id="ms-portraits"></div>
      <div>
        <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:6px;gap:8px;flex-wrap:wrap;">
          <div style="display:flex;align-items:center;gap:6px;">
            <strong id="ms-active-name" style="font-size:14px;color:#fef08a;">Macaco</strong>
            <span id="ms-active-trait" style="font-size:11px;background:#1e293b;padding:2px 7px;border-radius:999px;color:#86efac;"></span>
          </div>
          <div style="display:flex;align-items:center;gap:6px;font-size:11.5px;">
            <span id="ms-career-label" style="color:#fde047;font-weight:700;">💼 Estagiário</span>
            <button class="msims-btn" id="ms-skills-toggle" style="padding:3px 8px;font-size:11px;">📊 Habilidades</button>
          </div>
        </div>
        <div class="msims-needs-grid" id="ms-needs-grid"></div>
      </div>
      <div class="msims-chat-col">
        <div class="msims-emote-row" id="ms-emote-row"></div>
        <form class="msims-chat-form" id="ms-chat-form">
          <input class="msims-input" id="ms-chat-input" placeholder="Falar no balão..." maxlength="48" />
          <button class="msims-btn active" type="submit">💬</button>
        </form>
      </div>
    `;

    const emoteRow = this.bottomDeck.querySelector<HTMLDivElement>('#ms-emote-row')!;
    for (const em of QUICK_EMOTES) {
      const b = document.createElement('button');
      b.type = 'button';
      b.className = 'msims-btn';
      b.style.padding = '3px 6px';
      b.style.fontSize = '11px';
      b.textContent = em.label;
      b.onclick = () => this.handlers.onSendChat(em.text);
      emoteRow.appendChild(b);
    }

    const form = this.bottomDeck.querySelector<HTMLFormElement>('#ms-chat-form')!;
    const input = this.bottomDeck.querySelector<HTMLInputElement>('#ms-chat-input')!;
    form.onsubmit = (e) => {
      e.preventDefault();
      const text = input.value.trim();
      if (!text) return;
      this.handlers.onSendChat(text);
      input.value = '';
    };

    this.bottomDeck.querySelector<HTMLButtonElement>('#ms-skills-toggle')!.onclick = () => {
      this.showSkills = !this.showSkills;
      this.skillsDrawer.style.display = this.showSkills ? 'block' : 'none';
    };
  }

  public setBuildMode(active: boolean): void {
    this.buildDrawer.style.display = active ? 'block' : 'none';
    const btn = this.topBar.querySelector<HTMLButtonElement>('#ms-build-btn');
    if (btn) {
      btn.classList.toggle('active', active);
      btn.textContent = active ? '✅ Fechar Loja (B)' : '🛒 Loja (B)';
    }
    if (active) {
      this.buildTool = 'buy';
      if (!this.selectedBuildKind) this.selectedBuildKind = 'pc_rgb';
      this.closeContextMenu();
      this.renderBuildDrawer();
    }
  }

  private renderBuildDrawer(): void {
    const cats: Array<{ id: 'all' | FurnitureCategory; label: string }> = [
      { id: 'all', label: 'Todos' },
      { id: 'cozinha', label: '🍳 Cozinha' },
      { id: 'conforto', label: '🛋️ Conforto' },
      { id: 'banheiro', label: '🚿 Banheiro' },
      { id: 'diversao', label: '🎮 Diversão' },
      { id: 'decor', label: '🪴 Decor' },
    ];

    const items = CATALOG_LIST.filter(
      (i) => this.buildCategory === 'all' || i.category === this.buildCategory,
    );

    this.buildDrawer.innerHTML = `
      <div style="display:flex;justify-content:space-between;align-items:center;gap:8px;flex-wrap:wrap;margin-bottom:6px;">
        <div style="display:flex;gap:4px;flex-wrap:wrap;">
          ${cats
            .map(
              (c) =>
                `<button class="msims-btn ${this.buildCategory === c.id ? 'active' : ''}" data-bcat="${c.id}">${c.label}</button>`,
            )
            .join('')}
        </div>
        <div style="display:flex;gap:5px;flex-wrap:wrap;">
          <button class="msims-btn ${this.buildTool === 'buy' ? 'active' : ''}" id="mb-tool-buy">➕ Comprar</button>
          <button class="msims-btn ${this.buildTool === 'move' ? 'active' : ''}" id="mb-tool-move">✋ Mover</button>
          <button class="msims-btn ${this.buildTool === 'sell' ? 'danger' : ''}" id="mb-tool-sell">💰 Vender (70%)</button>
          <button class="msims-btn" id="mb-rotate">🔄 Girar (R)</button>
          <button class="msims-btn" id="mb-close">✖️</button>
        </div>
      </div>
      <div class="msims-build-items">
        ${items
          .map(
            (i) => `
          <div class="msims-shop-card ${this.buildTool === 'buy' && this.selectedBuildKind === i.kind ? 'selected' : ''}" data-kind="${i.kind}">
            <div style="display:flex;justify-content:space-between;align-items:center;">
              <span style="font-size:18px;">${i.emoji}</span>
              <span style="color:#4ade80;font-weight:800;">B$ ${i.price}</span>
            </div>
            <strong style="color:#fef08a;">${i.name}</strong>
            <span style="color:#94a3b8;font-size:10.5px;">Conforto +${i.comfort} • ${i.widthTiles}x${i.heightTiles}</span>
          </div>`,
          )
          .join('')}
      </div>
    `;

    this.buildDrawer.querySelectorAll<HTMLButtonElement>('[data-bcat]').forEach((b) => {
      b.onclick = () => {
        this.buildCategory = b.dataset.bcat as 'all' | FurnitureCategory;
        this.renderBuildDrawer();
      };
    });

    this.buildDrawer.querySelectorAll<HTMLDivElement>('[data-kind]').forEach((card) => {
      card.onclick = () => {
        this.buildTool = 'buy';
        this.selectedBuildKind = card.dataset.kind as FurnitureKind;
        this.handlers.onSelectBuildKind(this.selectedBuildKind);
        this.renderBuildDrawer();
      };
    });

    this.buildDrawer.querySelector<HTMLButtonElement>('#mb-tool-buy')!.onclick = () => {
      this.buildTool = 'buy';
      this.handlers.onSelectBuildKind(this.selectedBuildKind);
      this.renderBuildDrawer();
    };
    this.buildDrawer.querySelector<HTMLButtonElement>('#mb-tool-move')!.onclick = () => {
      this.buildTool = 'move';
      this.handlers.onToggleMoveMode();
      this.renderBuildDrawer();
    };
    this.buildDrawer.querySelector<HTMLButtonElement>('#mb-tool-sell')!.onclick = () => {
      this.buildTool = 'sell';
      this.handlers.onToggleSellMode();
      this.renderBuildDrawer();
    };
    this.buildDrawer.querySelector<HTMLButtonElement>('#mb-rotate')!.onclick = () =>
      this.handlers.onRotateBuild();
    this.buildDrawer.querySelector<HTMLButtonElement>('#mb-close')!.onclick = () =>
      this.handlers.onToggleBuildMode();
  }

  public openFurnitureContext(sx: number, sy: number, item: PlacedFurniture): void {
    const def = FURNITURE_CATALOG[item.kind];
    this.contextMenu.innerHTML = `
      <div class="msims-ctx-head">${def.emoji} ${def.name}</div>
      <div style="font-size:11px;color:#94a3b8;margin-bottom:6px;">${def.description}</div>
      ${def.interactions
        .map(
          (inter) => `
        <button class="msims-ctx-opt" data-inter="${inter.id}">
          <span><strong>${inter.emoji} ${inter.label}</strong></span>
          <small>${inter.hint}</small>
        </button>`,
        )
        .join('')}
    `;
    this.contextMenu.querySelectorAll<HTMLButtonElement>('[data-inter]').forEach((btn) => {
      btn.onclick = () => {
        this.handlers.onTriggerFurnitureAction(item.id, btn.dataset.inter!);
        this.closeContextMenu();
      };
    });
    this.positionContextMenu(sx, sy);
  }

  public openMonkeyContext(sx: number, sy: number, active: MonkeySim, target: MonkeySim): void {
    const rel = active.relations[target.id] ?? 0;
    const relLabel =
      rel >= 40 ? '💚 Melhor Amigo' : rel >= 15 ? '😊 Amigo' : rel <= -25 ? '💢 Rival' : '😐 Colega';
    this.contextMenu.innerHTML = `
      <div class="msims-ctx-head">🐒 ${escapeHtml(target.name)}</div>
      <div style="font-size:11px;color:#cbd5e1;margin-bottom:6px;">${TRAITS[target.trait].emoji} ${TRAITS[target.trait].name} • ${relLabel} (${rel})</div>
      ${SOCIAL_ACTIONS.map(
        (act) => `
        <button class="msims-ctx-opt" data-soc="${act.kind}">
          <span><strong>${act.emoji} ${act.label}</strong></span>
          <small>${act.hint}</small>
        </button>`,
      ).join('')}
    `;
    this.contextMenu.querySelectorAll<HTMLButtonElement>('[data-soc]').forEach((btn) => {
      btn.onclick = () => {
        this.handlers.onTriggerSocialAction(target.id, btn.dataset.soc as SocialActionKind);
        this.closeContextMenu();
      };
    });
    this.positionContextMenu(sx, sy);
  }

  public openHazardContext(sx: number, sy: number, kind: 'fire' | 'puddle', hazardId: string): void {
    const isFire = kind === 'fire';
    this.contextMenu.innerHTML = `
      <div class="msims-ctx-head">${isFire ? '🔥 Incêndio na Casa!' : '💦 Poça Suspeita'}</div>
      <button class="msims-ctx-opt" id="ms-haz-btn">
        <span><strong>${isFire ? '🧯 Apagar Incêndio Agora!' : '🧽 Limpar Poça'}</strong></span>
        <small>${isFire ? '+B$ 40 + XP Gambiarra' : '+B$ 20 + XP Gambiarra'}</small>
      </button>
    `;
    this.contextMenu.querySelector<HTMLButtonElement>('#ms-haz-btn')!.onclick = () => {
      if (isFire) this.handlers.onTriggerFireAction(hazardId);
      else this.handlers.onTriggerPuddleAction(hazardId);
      this.closeContextMenu();
    };
    this.positionContextMenu(sx, sy);
  }

  private positionContextMenu(sx: number, sy: number): void {
    this.contextMenu.style.display = 'block';
    const x = Math.min(window.innerWidth - 260, Math.max(12, sx + 10));
    const y = Math.min(window.innerHeight - 280, Math.max(54, sy - 20));
    this.contextMenu.style.left = `${x}px`;
    this.contextMenu.style.top = `${y}px`;
  }

  public closeContextMenu(): void {
    this.contextMenu.style.display = 'none';
  }

  public sync(sim: GameSimulation, force = false): void {
    const now = performance.now();
    if (!force && now - this.lastUiSync < 140) return;
    this.lastUiSync = now;

    // Topbar
    const h = Math.floor(sim.minuteOfDay / 60)
      .toString()
      .padStart(2, '0');
    const m = Math.floor(sim.minuteOfDay % 60)
      .toString()
      .padStart(2, '0');
    const isNight = sim.minuteOfDay >= 19 * 60 || sim.minuteOfDay < 6 * 60;
    this.topBar.querySelector('#ms-clock')!.textContent = `${isNight ? '🌙' : '☀️'} Dia ${sim.day} • ${h}:${m}`;
    this.topBar.querySelector('#ms-money')!.textContent = `🍌 B$ ${sim.money}`;
    this.topBar.querySelector('#ms-comfort')!.textContent = `🏡 ${calculateHouseComfort(sim.furniture)}`;
    this.topBar.querySelector('#ms-score')!.textContent = `⭐ ${sim.getTotalScore()}`;

    this.topBar.querySelectorAll<HTMLButtonElement>('[data-spd]').forEach((b) => {
      b.classList.toggle('active', Number(b.dataset.spd) === sim.speed);
    });

    const active = sim.getActiveMonkey();
    if (!active) return;

    // Left column: Action Queue + Banner + Aspirations
    const queueHtml =
      active.queue.length > 0
        ? `<div class="msims-queue">${active.queue
            .map(
              (a, i) => `
            <div class="msims-q-item" data-qidx="${i}" title="Clique para cancelar">
              <span>${a.emoji}</span>
              <span>${escapeHtml(a.label)}</span>
              <span style="color:#fca5a5;">✕</span>
            </div>`,
            )
            .join('')}</div>`
        : '';

    const bannerHtml =
      sim.eventBannerTimer > 0 && sim.eventBanner
        ? `<div class="msims-card" style="padding:7px 10px;font-size:11.5px;border-color:#facc15;color:#fef08a;">${escapeHtml(sim.eventBanner)}</div>`
        : '';

    const aspHtml = `
      <div class="msims-card msims-aspirations">
        <h4>✨ Desejos do Dia</h4>
        ${sim.aspirations
          .map(
            (a) => `
          <div class="msims-asp-row">
            <span>${a.emoji} ${escapeHtml(a.title)}</span>
            <span style="color:#4ade80;font-weight:800;">+B$${a.rewardMoney}</span>
          </div>`,
          )
          .join('')}
      </div>
    `;

    this.leftCol.innerHTML = queueHtml + bannerHtml + aspHtml;
    this.leftCol.querySelectorAll<HTMLDivElement>('[data-qidx]').forEach((el) => {
      el.onclick = () => {
        this.handlers.onCancelAction(active.id, Number(el.dataset.qidx));
      };
    });

    // Bottom deck: portraits
    const portraitsEl = this.bottomDeck.querySelector<HTMLDivElement>('#ms-portraits')!;
    const controllable = sim.getLocalControllableMonkeys();
    portraitsEl.innerHTML = controllable
      .map((mk) => {
        const minN = Math.min(...Object.values(mk.needs));
        const dot = minN < 26 ? '#ef4444' : minN < 52 ? '#eab308' : '#22c55e';
        return `
          <div class="msims-portrait ${mk.id === active.id ? 'active' : ''}" data-mkid="${mk.id}" title="Trocar para ${escapeAttr(mk.name)} (Tab)">
            <div style="display:flex;justify-content:center;align-items:center;gap:3px;">
              <span style="width:9px;height:9px;border-radius:999px;background:${dot};display:inline-block;"></span>
              <img alt="" width="30" height="30" style="display:block;" src="${monkeyHeadIcon(mk.appearance.furColor, mk.appearance.bellyColor, mk.appearance.accessory)}" />
            </div>
            <div style="white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">${escapeHtml(mk.name.split(' ')[0])}</div>
          </div>`;
      })
      .join('');

    portraitsEl.querySelectorAll<HTMLDivElement>('[data-mkid]').forEach((el) => {
      el.onclick = () => this.handlers.onSelectMonkey(el.dataset.mkid!);
    });

    // Active monkey header & needs
    this.bottomDeck.querySelector('#ms-active-name')!.textContent = active.name;
    this.bottomDeck.querySelector('#ms-active-trait')!.textContent =
      `${TRAITS[active.trait].emoji} ${TRAITS[active.trait].name}`;

    const career = CAREERS[Math.min(CAREERS.length - 1, active.careerLevel)];
    this.bottomDeck.querySelector('#ms-career-label')!.textContent =
      `💼 ${career.title} (B$${career.salary}) • ${Math.floor(active.careerProgress)}%`;

    const needsEl = this.bottomDeck.querySelector<HTMLDivElement>('#ms-needs-grid')!;
    needsEl.innerHTML = NEED_META.map((nm) => {
      const val = Math.round(active.needs[nm.key]);
      const color = val < 25 ? '#ef4444' : val < 55 ? '#facc15' : '#22c55e';
      return `
        <div class="msims-need-row">
          <div style="display:flex;justify-content:space-between;">
            <span>${nm.emoji} ${nm.label}</span>
            <span style="color:${color};">${val}%</span>
          </div>
          <div class="msims-need-bar">
            <div class="msims-need-fill" style="width:${val}%;background:${color};"></div>
          </div>
        </div>`;
    }).join('');

    // Skills drawer
    if (this.showSkills) {
      this.skillsDrawer.innerHTML = `
        <div style="font-weight:800;color:#fef08a;margin-bottom:8px;">📊 Habilidades de ${escapeHtml(active.name)}</div>
        ${(Object.keys(SKILL_LABELS) as SkillKey[])
          .map((sk) => {
            const meta = SKILL_LABELS[sk];
            const lvl = active.skills[sk];
            const pct = Math.min(100, Math.round((active.skillXp[sk] / (lvl * 80)) * 100));
            return `
              <div style="margin-bottom:7px;font-size:12px;">
                <div style="display:flex;justify-content:space-between;">
                  <span>${meta.emoji} ${meta.name}</span>
                  <strong style="color:#4ade80;">Nv ${lvl}</strong>
                </div>
                <div class="msims-need-bar" style="margin-top:2px;">
                  <div class="msims-need-fill" style="width:${pct}%;background:#38bdf8;"></div>
                </div>
              </div>`;
          })
          .join('')}
      `;
    }
  }
}

function escapeHtml(str: string): string {
  return str.replace(/[&<>"']/g, (c) => {
    switch (c) {
      case '&':
        return '&amp;';
      case '<':
        return '&lt;';
      case '>':
        return '&gt;';
      case '"':
        return '&quot;';
      default:
        return '&#39;';
    }
  });
}

function escapeAttr(str: string): string {
  return escapeHtml(str);
}
