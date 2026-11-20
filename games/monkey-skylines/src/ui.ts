import { getTerrainName, TOWN_HALL_POS } from './map';
import {
  DOCK_TOOLS,
  MILESTONES,
  TOOL_MAP,
  type GameMode,
  type OverlayMode,
  type TileData,
  type ToolType,
} from './types';
import type { CitySimulation } from './simulation';

export interface UiCallbacks {
  onSelectTool: (tool: ToolType) => void;
  onSetSpeed: (speed: 0 | 1 | 2) => void;
  onSetOverlay: (overlay: OverlayMode) => void;
  onUndo: () => void;
  onTogglePingMode: () => void;
  onChaosButton: () => void;
  onCenterCamera: () => void;
  onResetCity: (mode?: GameMode) => void;
  onLoanRescue: () => void;
  onStartGame: (mode: GameMode) => void;
  onRepairTile: (gx: number, gy: number) => void;
  onDemolishTile: (gx: number, gy: number) => void;
  onCloseInspector: () => void;
  onVoteDecree: (optionIndex: 0 | 1) => void;
  onPassTurn: () => void;
}

const STYLES_ID = 'monkey-skylines-ui-styles';

function injectStyles(): void {
  if (document.getElementById(STYLES_ID)) return;
  const style = document.createElement('style');
  style.id = STYLES_ID;
  style.textContent = `
    .msky-topbar {
      position: fixed;
      top: 10px;
      left: 390px;
      right: 10px;
      z-index: 50;
      display: flex;
      flex-wrap: wrap;
      align-items: center;
      justify-content: flex-end;
      gap: 6px;
      pointer-events: none;
    }
    @media (max-width: 1220px) {
      .msky-topbar {
        left: 10px;
        top: 52px;
        justify-content: flex-start;
      }
    }
    .msky-pill-group {
      pointer-events: auto;
      display: flex;
      flex-wrap: wrap;
      align-items: center;
      gap: 8px;
      background: rgba(15, 23, 42, 0.92);
      border: 2px solid #facc15;
      border-radius: 14px;
      padding: 5px 10px;
      box-shadow: 0 4px 14px rgba(0, 0, 0, 0.48);
      font-size: 12px;
      font-weight: 700;
    }
    .msky-stat {
      display: inline-flex;
      align-items: center;
      gap: 4px;
      white-space: nowrap;
      cursor: help;
    }
    .msky-stat.clickable {
      cursor: pointer;
      padding: 2px 5px;
      border-radius: 7px;
      transition: background 0.12s;
    }
    .msky-stat.clickable:hover {
      background: rgba(250, 204, 21, 0.16);
    }
    .msky-stat small {
      font-size: 11px;
      opacity: 0.85;
    }
    .msky-rci {
      display: inline-flex;
      align-items: flex-end;
      gap: 4px;
      padding: 2px 6px;
      background: rgba(30, 41, 59, 0.9);
      border: 1px solid #475569;
      border-radius: 8px;
      cursor: help;
    }
    .msky-rci-col {
      display: flex;
      flex-direction: column;
      align-items: center;
      gap: 2px;
    }
    .msky-rci-track {
      width: 7px;
      height: 18px;
      background: #0f172a;
      border-radius: 3px;
      overflow: hidden;
      display: flex;
      align-items: flex-end;
    }
    .msky-rci-fill {
      width: 100%;
      transition: height 0.25s ease;
    }
    .msky-rci-lbl {
      font-size: 9px;
      line-height: 1;
    }
    .msky-btn {
      pointer-events: auto;
      background: rgba(15, 23, 42, 0.92);
      color: #fef08a;
      border: 2px solid #475569;
      border-radius: 10px;
      padding: 5px 9px;
      font-size: 12px;
      font-weight: 800;
      cursor: pointer;
      transition: transform 0.08s ease, border-color 0.15s ease, background 0.15s ease;
    }
    .msky-btn:hover:not(:disabled) { transform: translateY(-1px); border-color: #facc15; }
    .msky-btn:disabled { opacity: 0.42; cursor: not-allowed; }
    .msky-btn.active { background: #ca8a04; color: #0f172a; border-color: #fef08a; }
    .msky-btn.ping-active { background: #0284c7; color: #fff; border-color: #7dd3fc; }
    .msky-seg {
      pointer-events: auto;
      display: inline-flex;
      background: rgba(15, 23, 42, 0.92);
      border: 2px solid #334155;
      border-radius: 10px;
      overflow: hidden;
    }
    .msky-seg button {
      background: transparent;
      color: #cbd5e1;
      border: none;
      padding: 5px 8px;
      font-size: 11px;
      font-weight: 800;
      cursor: pointer;
    }
    .msky-seg button:hover { background: rgba(255,255,255,0.08); }
    .msky-seg button.active { background: #38bdf8; color: #0f172a; }

    .msky-chaos-btn {
      pointer-events: auto;
      background: linear-gradient(135deg, #e11d48, #f97316);
      color: #fff;
      border: 2px solid #fecdd3;
      border-radius: 12px;
      padding: 6px 11px;
      font-size: 12px;
      font-weight: 900;
      cursor: pointer;
      box-shadow: 0 3px 0 #881337, 0 0 14px rgba(244, 63, 94, 0.55);
      animation: msky-pulse 1.8s infinite;
    }
    .msky-chaos-btn:hover:not(:disabled) { transform: scale(1.04); }
    .msky-chaos-btn:disabled { opacity: 0.55; cursor: not-allowed; animation: none; }
    @keyframes msky-pulse {
      0%, 100% { box-shadow: 0 3px 0 #881337, 0 0 10px rgba(244, 63, 94, 0.45); }
      50% { box-shadow: 0 3px 0 #881337, 0 0 22px rgba(251, 113, 133, 0.9); }
    }

    /* Left Guided Checklist */
    .msky-guide {
      position: fixed;
      top: 58px;
      left: 10px;
      width: 266px;
      z-index: 44;
      background: rgba(15, 23, 42, 0.92);
      border: 2px solid #4ade80;
      border-radius: 14px;
      overflow: hidden;
      box-shadow: 0 8px 24px rgba(0, 0, 0, 0.5);
      font-size: 12px;
    }
    @media (max-width: 1220px) {
      .msky-guide { top: 106px; width: 244px; }
    }
    .msky-guide.collapsed .msky-guide-body { display: none; }
    .msky-guide-head {
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 6px;
      padding: 7px 10px;
      background: rgba(22, 163, 74, 0.25);
      border-bottom: 1px solid rgba(74, 222, 128, 0.35);
      font-weight: 900;
      color: #86efac;
      cursor: pointer;
    }
    .msky-guide-body {
      padding: 8px 10px;
      display: flex;
      flex-direction: column;
      gap: 5px;
      max-height: 44vh;
      overflow-y: auto;
    }
    .msky-mission {
      background: rgba(30, 41, 59, 0.85);
      border: 1px solid #334155;
      border-radius: 9px;
      padding: 6px 8px;
      display: flex;
      flex-direction: column;
      gap: 3px;
    }
    .msky-mission.current {
      border-color: #facc15;
      background: rgba(66, 32, 6, 0.45);
    }
    .msky-mission.done {
      opacity: 0.58;
      border-color: #16a34a;
    }
    .msky-mission-top {
      display: flex;
      justify-content: space-between;
      align-items: center;
      gap: 6px;
      font-weight: 800;
      font-size: 11px;
      color: #f8fafc;
    }
    .msky-mission-hint {
      font-size: 10px;
      color: #cbd5e1;
      line-height: 1.3;
    }

    /* ChimpTwitter (Right, collapsed by default) */
    .msky-twitter {
      position: fixed;
      top: 66px;
      right: 10px;
      width: 274px;
      max-height: 44vh;
      z-index: 45;
      background: rgba(15, 23, 42, 0.92);
      border: 2px solid #38bdf8;
      border-radius: 14px;
      display: flex;
      flex-direction: column;
      overflow: hidden;
      box-shadow: 0 8px 24px rgba(0, 0, 0, 0.5);
    }
    @media (max-width: 1220px) {
      .msky-twitter { top: 106px; width: 236px; }
    }
    .msky-twitter.collapsed .msky-twitter-body { display: none; }
    .msky-twitter-head {
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 6px;
      padding: 7px 10px;
      background: rgba(2, 132, 199, 0.25);
      border-bottom: 1px solid rgba(56, 189, 248, 0.35);
      font-size: 12px;
      font-weight: 900;
      color: #7dd3fc;
      cursor: pointer;
    }
    .msky-badge-pill {
      background: #ef4444;
      color: #fff;
      font-size: 10px;
      font-weight: 900;
      padding: 1px 6px;
      border-radius: 999px;
    }
    .msky-badge-pill.ok { background: #0284c7; }
    .msky-twitter-body {
      padding: 8px;
      overflow-y: auto;
      display: flex;
      flex-direction: column;
      gap: 6px;
    }
    .msky-warn-banner {
      background: rgba(245, 158, 11, 0.2);
      border: 1px solid #f59e0b;
      color: #fde68a;
      border-radius: 8px;
      padding: 5px 8px;
      font-size: 11px;
      font-weight: 800;
    }
    .msky-warn-banner.crit {
      background: rgba(225, 29, 72, 0.28);
      border-color: #fb7185;
      color: #fecdd3;
    }
    .msky-tweet {
      background: rgba(30, 41, 59, 0.9);
      border-left: 3px solid #38bdf8;
      border-radius: 8px;
      padding: 6px 8px;
      font-size: 11px;
      line-height: 1.32;
    }
    .msky-tweet.rage { border-left-color: #ef4444; }
    .msky-tweet.love { border-left-color: #4ade80; }
    .msky-tweet.chaos { border-left-color: #f43f5e; background: rgba(136, 19, 55, 0.35); }
    .msky-tweet-meta {
      display: flex;
      justify-content: space-between;
      font-weight: 800;
      color: #fde047;
      margin-bottom: 2px;
    }

    /* Floating Popovers (Economy, Scoreboard, Inspector) */
    .msky-popover {
      position: fixed;
      z-index: 65;
      background: rgba(15, 23, 42, 0.96);
      border: 2px solid #facc15;
      border-radius: 14px;
      padding: 12px;
      width: 286px;
      box-shadow: 0 12px 32px rgba(0, 0, 0, 0.65);
      font-size: 12px;
      color: #f8fafc;
    }
    .msky-popover h4 {
      margin: 0 0 8px;
      font-size: 13px;
      color: #fde047;
      display: flex;
      justify-content: space-between;
      align-items: center;
    }
    .msky-popover-close {
      background: transparent;
      border: none;
      color: #94a3b8;
      font-weight: 900;
      cursor: pointer;
      font-size: 14px;
    }
    .msky-econ-row {
      display: flex;
      justify-content: space-between;
      padding: 2px 0;
      font-size: 11px;
    }
    .msky-inspector {
      position: fixed;
      bottom: 108px;
      right: 12px;
      width: 284px;
      z-index: 60;
      background: rgba(15, 23, 42, 0.96);
      border: 2px solid #38bdf8;
      border-radius: 14px;
      padding: 11px 12px;
      box-shadow: 0 12px 30px rgba(0, 0, 0, 0.6);
      font-size: 12px;
    }
    .msky-chip-row {
      display: flex;
      flex-wrap: wrap;
      gap: 4px;
      margin: 6px 0;
    }
    .msky-tag {
      font-size: 10px;
      font-weight: 800;
      padding: 2px 7px;
      border-radius: 999px;
      background: #1e293b;
      border: 1px solid #475569;
    }
    .msky-tag.ok { border-color: #4ade80; color: #86efac; }
    .msky-tag.bad { border-color: #fb7185; color: #fecdd3; }

    /* Center Event Banners (Incoming Disaster, Decree Vote, 2P Turn) */
    .msky-center-banners {
      position: fixed;
      top: 66px;
      left: 50%;
      transform: translateX(-50%);
      z-index: 55;
      display: flex;
      flex-direction: column;
      align-items: center;
      gap: 6px;
      pointer-events: none;
      max-width: min(440px, 92vw);
    }
    .msky-banner {
      pointer-events: auto;
      background: rgba(15, 23, 42, 0.95);
      border: 2px solid #facc15;
      border-radius: 14px;
      padding: 8px 12px;
      font-size: 12px;
      font-weight: 800;
      text-align: center;
      box-shadow: 0 8px 24px rgba(0, 0, 0, 0.55);
    }
    .msky-banner.danger {
      border-color: #fb7185;
      background: rgba(136, 19, 55, 0.9);
      color: #ffe4e6;
      animation: msky-pulse 1s infinite;
    }
    .msky-decree-btns {
      display: flex;
      gap: 8px;
      margin-top: 6px;
      justify-content: center;
      flex-wrap: wrap;
    }

    /* Bottom Dock */
    .msky-dock-wrap {
      position: fixed;
      bottom: 10px;
      left: 50%;
      transform: translateX(-50%);
      z-index: 50;
      display: flex;
      flex-direction: column;
      align-items: center;
      gap: 6px;
      max-width: calc(100vw - 20px);
      pointer-events: none;
    }
    .msky-tooltip {
      background: rgba(15, 23, 42, 0.94);
      border: 1px solid #facc15;
      color: #fef9c3;
      padding: 4px 12px;
      border-radius: 999px;
      font-size: 11px;
      font-weight: 700;
      text-align: center;
      max-width: 92vw;
    }
    .msky-dock {
      pointer-events: auto;
      display: flex;
      gap: 6px;
      padding: 7px;
      background: rgba(15, 23, 42, 0.94);
      border: 2px solid #facc15;
      border-radius: 16px;
      box-shadow: 0 8px 24px rgba(0, 0, 0, 0.55);
      overflow-x: auto;
      max-width: 100%;
    }
    .msky-tool {
      position: relative;
      display: flex;
      flex-direction: column;
      align-items: center;
      min-width: 64px;
      padding: 6px 7px;
      border-radius: 11px;
      border: 2px solid #334155;
      background: #1e293b;
      color: #f8fafc;
      cursor: pointer;
      transition: transform 0.1s ease, border-color 0.12s ease, background 0.12s ease;
    }
    .msky-tool:hover { transform: translateY(-2px); border-color: #fde047; }
    .msky-tool.selected {
      border-color: #facc15;
      background: #422006;
      box-shadow: 0 0 12px rgba(250, 204, 21, 0.45);
    }
    .msky-tool.suggested:not(.selected) {
      border-color: #4ade80;
      box-shadow: 0 0 12px rgba(74, 222, 128, 0.55);
    }
    .msky-tool-next {
      position: absolute;
      top: -6px;
      right: 2px;
      background: #22c55e;
      color: #052e16;
      font-size: 8px;
      font-weight: 900;
      padding: 1px 4px;
      border-radius: 6px;
      display: none;
    }
    .msky-tool.suggested .msky-tool-next { display: block; }
    .msky-tool-key {
      position: absolute;
      top: 3px;
      left: 5px;
      font-size: 9px;
      font-weight: 900;
      color: #94a3b8;
    }
    .msky-tool-emoji { font-size: 19px; line-height: 1.1; }
    .msky-tool-name { font-size: 10px; font-weight: 800; margin-top: 2px; white-space: nowrap; }
    .msky-tool-cost { font-size: 10px; font-weight: 800; color: #fde047; }

    /* Splash & Crisis Modals */
    .msky-modal-backdrop {
      position: fixed;
      inset: 0;
      z-index: 200;
      background: rgba(2, 6, 23, 0.74);
      backdrop-filter: blur(4px);
      display: flex;
      align-items: center;
      justify-content: center;
      padding: 16px;
    }
    .msky-modal {
      width: min(520px, 100%);
      background: #0f172a;
      border: 3px solid #facc15;
      border-radius: 20px;
      padding: 20px;
      text-align: center;
      box-shadow: 0 16px 48px rgba(0, 0, 0, 0.7);
      max-height: 92vh;
      overflow-y: auto;
    }
    .msky-modal h1 {
      margin: 0 0 6px;
      font-size: 23px;
      color: #facc15;
    }
    .msky-modal p {
      margin: 0 0 12px;
      font-size: 13px;
      color: #e2e8f0;
      line-height: 1.45;
    }
    .msky-modal ul {
      text-align: left;
      background: #1e293b;
      border-radius: 12px;
      padding: 10px 14px 10px 28px;
      margin: 0 0 14px;
      font-size: 12px;
      color: #fef08a;
      line-height: 1.5;
    }
    .msky-mode-grid {
      display: grid;
      grid-template-columns: repeat(3, 1fr);
      gap: 8px;
      margin-bottom: 14px;
    }
    @media (max-width: 540px) {
      .msky-mode-grid { grid-template-columns: 1fr; }
    }
    .msky-mode-card {
      background: #1e293b;
      border: 2px solid #334155;
      border-radius: 12px;
      padding: 9px;
      color: #f8fafc;
      cursor: pointer;
      text-align: left;
      transition: border-color 0.14s, transform 0.1s;
    }
    .msky-mode-card:hover { transform: translateY(-1px); border-color: #fde047; }
    .msky-mode-card.active {
      border-color: #facc15;
      background: rgba(202, 138, 4, 0.22);
    }
    .msky-mode-card b { display: block; font-size: 12px; color: #fde047; margin-bottom: 3px; }
    .msky-mode-card small { font-size: 10px; color: #cbd5e1; line-height: 1.3; display: block; }
    .msky-big-btn {
      background: linear-gradient(135deg, #facc15, #f59e0b);
      color: #0f172a;
      border: none;
      border-radius: 14px;
      padding: 12px 24px;
      font-size: 15px;
      font-weight: 900;
      cursor: pointer;
      box-shadow: 0 4px 0 #a16207;
      transition: transform 0.1s ease;
    }
    .msky-big-btn:hover { transform: translateY(-2px); }
    .msky-big-btn:active { transform: translateY(1px); }
  `;
  document.head.appendChild(style);
}

export class CityUi {
  private topbar: HTMLDivElement;
  private statsGroup: HTMLDivElement;

  // Stable stat nodes (never recreated every frame!)
  private statBananas!: HTMLSpanElement;
  private statPop!: HTMLSpanElement;
  private statHapp!: HTMLSpanElement;
  private statPower!: HTMLSpanElement;
  private statGarbage!: HTMLSpanElement;
  private statTraffic!: HTMLSpanElement;
  private statMilestone!: HTMLSpanElement;
  private rciFillR!: HTMLDivElement;
  private rciFillC!: HTMLDivElement;
  private rciFillI!: HTMLDivElement;

  private speedBtns: Record<0 | 1 | 2, HTMLButtonElement>;
  private overlayBtns: Record<OverlayMode, HTMLButtonElement>;
  private undoBtn: HTMLButtonElement;
  private pingBtn: HTMLButtonElement;
  private chaosBtn: HTMLButtonElement;

  private guideBox: HTMLDivElement;
  private guideTitleEl: HTMLSpanElement;
  private guideBody: HTMLDivElement;
  private lastGuideSig = '';

  private twitterBox: HTMLDivElement;
  private twitterBadge: HTMLSpanElement;
  private twitterBody: HTMLDivElement;
  private lastTweetSignature = '';
  private lastSeenTweetId = 0;

  private centerBanners: HTMLDivElement;
  private lastBannerSig = '';

  private econPopover: HTMLDivElement;
  private econBody: HTMLDivElement;
  private scorePopover: HTMLDivElement;
  private scoreBody: HTMLDivElement;
  private inspectorBox: HTMLDivElement;
  private inspectedCoords: { gx: number; gy: number } | null = null;
  private lastInspectorSig = '';

  private tooltipEl: HTMLDivElement;
  private toolButtons = new Map<ToolType, HTMLButtonElement>();
  private splashModal: HTMLDivElement;
  private selectedMode: GameMode = 'classic';
  private crisisModal: HTMLDivElement | null = null;
  private callbacks: UiCallbacks;

  constructor(callbacks: UiCallbacks) {
    this.callbacks = callbacks;
    injectStyles();

    // Topbar
    this.topbar = document.createElement('div');
    this.topbar.className = 'msky-topbar';

    this.statsGroup = document.createElement('div');
    this.statsGroup.className = 'msky-pill-group';
    this.buildStableStatNodes();
    this.topbar.appendChild(this.statsGroup);

    const makeBtn = (label: string, title: string, onClick: () => void) => {
      const b = document.createElement('button');
      b.className = 'msky-btn';
      b.textContent = label;
      b.title = title;
      b.onclick = onClick;
      return b;
    };

    const s0 = makeBtn('⏸', 'Pausar simulação (Espaço)', () => callbacks.onSetSpeed(0));
    const s1 = makeBtn('1x', 'Velocidade normal', () => callbacks.onSetSpeed(1));
    const s2 = makeBtn('2x', 'Velocidade turbo', () => callbacks.onSetSpeed(2));
    s1.classList.add('active');
    this.speedBtns = { 0: s0, 1: s1, 2: s2 };
    this.topbar.append(s0, s1, s2);

    // Overlay segmented control
    const seg = document.createElement('div');
    seg.className = 'msky-seg';
    const makeOvBtn = (mode: OverlayMode, label: string, title: string) => {
      const b = document.createElement('button');
      b.textContent = label;
      b.title = title;
      b.onclick = () => callbacks.onSetOverlay(mode);
      seg.appendChild(b);
      return b;
    };
    this.overlayBtns = {
      normal: makeOvBtn('normal', '👁️', 'Visão Normal (V)'),
      power: makeOvBtn('power', '⚡', 'Camada de Energia'),
      happiness: makeOvBtn('happiness', '😊', 'Camada de Felicidade'),
      pollution: makeOvBtn('pollution', '☁️', 'Camada de Poluição'),
    };
    this.overlayBtns.normal.classList.add('active');
    this.topbar.appendChild(seg);

    this.undoBtn = makeBtn('↩️', 'Desfazer última construção (Ctrl+Z)', () => callbacks.onUndo());
    this.undoBtn.disabled = true;
    this.pingBtn = makeBtn('📍 Ping', 'Apontar no mapa para amigos (P)', () => callbacks.onTogglePingMode());
    const scoreBtn = makeBtn('🏆', 'Placar de Contribuição Co-op / Local', () => this.toggleScoreboard());
    const centerBtn = makeBtn('🎯', 'Centralizar câmera na Prefeitura (C)', () => callbacks.onCenterCamera());
    const resetBtn = makeBtn('🔄', 'Reiniciar cidade', () => callbacks.onResetCity());
    const helpBtn = makeBtn('❓', 'Abrir Guia / Modos de Jogo', () => this.openSplash());

    this.chaosBtn = document.createElement('button');
    this.chaosBtn.className = 'msky-chaos-btn';
    this.chaosBtn.textContent = '🚨 Caos';
    this.chaosBtn.title = 'Lança um desastre aleatório na cidade (sincronizado no Co-op!)';
    this.chaosBtn.onclick = () => callbacks.onChaosButton();

    this.topbar.append(this.undoBtn, this.pingBtn, scoreBtn, centerBtn, resetBtn, helpBtn, this.chaosBtn);
    document.body.appendChild(this.topbar);

    // Guided Checklist (Left below SDK HUD)
    this.guideBox = document.createElement('div');
    this.guideBox.className = 'msky-guide';
    const gHead = document.createElement('div');
    gHead.className = 'msky-guide-head';
    this.guideTitleEl = document.createElement('span');
    this.guideTitleEl.textContent = '📋 Guia do Prefeito';
    const gToggle = document.createElement('span');
    gToggle.textContent = '▾';
    gHead.append(this.guideTitleEl, gToggle);
    gHead.onclick = () => this.guideBox.classList.toggle('collapsed');
    this.guideBody = document.createElement('div');
    this.guideBody.className = 'msky-guide-body';
    this.guideBox.append(gHead, this.guideBody);
    document.body.appendChild(this.guideBox);

    // ChimpTwitter (Collapsed by default with unread/warning badge)
    this.twitterBox = document.createElement('div');
    this.twitterBox.className = 'msky-twitter collapsed';
    const head = document.createElement('div');
    head.className = 'msky-twitter-head';
    const titleSpan = document.createElement('span');
    titleSpan.textContent = '🐦 ChimpTwitter';
    const rightSpan = document.createElement('span');
    rightSpan.style.display = 'inline-flex';
    rightSpan.style.alignItems = 'center';
    rightSpan.style.gap = '6px';
    this.twitterBadge = document.createElement('span');
    this.twitterBadge.className = 'msky-badge-pill ok';
    this.twitterBadge.textContent = '0';
    const arrow = document.createElement('span');
    arrow.textContent = '▾';
    rightSpan.append(this.twitterBadge, arrow);
    head.append(titleSpan, rightSpan);
    head.onclick = () => {
      this.twitterBox.classList.toggle('collapsed');
      if (!this.twitterBox.classList.contains('collapsed')) {
        this.twitterBadge.textContent = '0';
        this.twitterBadge.style.display = 'none';
      }
    };
    this.twitterBody = document.createElement('div');
    this.twitterBody.className = 'msky-twitter-body';
    this.twitterBox.append(head, this.twitterBody);
    document.body.appendChild(this.twitterBox);

    // Center Banners
    this.centerBanners = document.createElement('div');
    this.centerBanners.className = 'msky-center-banners';
    document.body.appendChild(this.centerBanners);

    // Economy Popover
    this.econPopover = document.createElement('div');
    this.econPopover.className = 'msky-popover';
    this.econPopover.style.top = '58px';
    this.econPopover.style.left = '390px';
    this.econPopover.style.display = 'none';
    this.econPopover.innerHTML = `
      <h4><span>📊 Balanço da Prefeitura</span><button class="msky-popover-close">✕</button></h4>
      <div id="msky-econ-body"></div>
    `;
    this.econPopover.querySelector('.msky-popover-close')!.addEventListener('click', () => {
      this.econPopover.style.display = 'none';
    });
    this.econBody = this.econPopover.querySelector('#msky-econ-body')!;
    document.body.appendChild(this.econPopover);

    // Scoreboard Popover
    this.scorePopover = document.createElement('div');
    this.scorePopover.className = 'msky-popover';
    this.scorePopover.style.top = '58px';
    this.scorePopover.style.right = '14px';
    this.scorePopover.style.display = 'none';
    this.scorePopover.innerHTML = `
      <h4><span>🏆 Placar de Contribuição</span><button class="msky-popover-close">✕</button></h4>
      <div id="msky-score-body"></div>
    `;
    this.scorePopover.querySelector('.msky-popover-close')!.addEventListener('click', () => {
      this.scorePopover.style.display = 'none';
    });
    this.scoreBody = this.scorePopover.querySelector('#msky-score-body')!;
    document.body.appendChild(this.scorePopover);

    // Tile Inspector Card
    this.inspectorBox = document.createElement('div');
    this.inspectorBox.className = 'msky-inspector';
    this.inspectorBox.style.display = 'none';
    document.body.appendChild(this.inspectorBox);

    // Bottom Dock
    const dockWrap = document.createElement('div');
    dockWrap.className = 'msky-dock-wrap';

    this.tooltipEl = document.createElement('div');
    this.tooltipEl.className = 'msky-tooltip';

    const dock = document.createElement('div');
    dock.className = 'msky-dock';
    for (const tool of DOCK_TOOLS) {
      const btn = document.createElement('button');
      btn.className = 'msky-tool';
      const costText =
        tool.id === 'inspect'
          ? 'Grátis'
          : tool.id === 'bulldozer'
            ? '+50%'
            : `🍌${tool.cost}`;
      btn.innerHTML = `
        <span class="msky-tool-key">${tool.key}</span>
        <span class="msky-tool-next">PRÓX</span>
        <span class="msky-tool-emoji">${tool.emoji}</span>
        <span class="msky-tool-name">${tool.shortName}</span>
        <span class="msky-tool-cost">${costText}</span>
      `;
      btn.title = `${tool.name}: ${tool.description}`;
      btn.onclick = () => callbacks.onSelectTool(tool.id);
      dock.appendChild(btn);
      this.toolButtons.set(tool.id, btn);
    }

    dockWrap.append(this.tooltipEl, dock);
    document.body.appendChild(dockWrap);

    // Welcome Splash with Mode Selector
    this.splashModal = document.createElement('div');
    this.splashModal.className = 'msky-modal-backdrop';
    this.splashModal.innerHTML = `
      <div class="msky-modal">
        <h1>🐒 SimMacaco: Prefeitura do Caos</h1>
        <p>Você assumiu a <b>Prefeitura da Selva</b>! Comece ligando a energia e expandindo a Avenida das Bananas.</p>
        <ul>
          <li>📋 Siga o <b>Guia do Prefeito</b> à esquerda para ganhar Bananas bônus!</li>
          <li>⚡ <b>Usinas</b> iluminam prédios na <b>área azul</b>; <b>Estradas</b> se arrastam em linha reta (em L).</li>
          <li>🔍 Use <b>Inspecionar (0)</b> para ver status/dono ou reparar; 💥 <b>Demolir (8)</b> devolve <b>50%</b>!</li>
          <li>🐒 Jogue <b>Solo</b>, <b>2P Local (turnos)</b> ou <b>Co-op Online</b> no topo esquerdo!</li>
        </ul>
        <div class="msky-mode-grid">
          <button class="msky-mode-card active" data-mode="classic">
            <b>🏛️ Clássico</b>
            <small>Missões guiadas, economia real e desafios da selva.</small>
          </button>
          <button class="msky-mode-card" data-mode="local2p">
            <b>⏱️ 2P Local (30s)</b>
            <small>Prefeito vs Vice-Prefeito alternando turnos no mesmo PC!</small>
          </button>
          <button class="msky-mode-card" data-mode="sandbox">
            <b>🌴 Sandbox</b>
            <small>Bananas infinitas e sem falência pra construir à vontade!</small>
          </button>
        </div>
        <button class="msky-big-btn" id="msky-start-btn">🍌 ASSUMIR PREFEITURA</button>
      </div>
    `;
    document.body.appendChild(this.splashModal);

    const modeCards = this.splashModal.querySelectorAll<HTMLButtonElement>('.msky-mode-card');
    modeCards.forEach((card) => {
      card.onclick = () => {
        this.selectedMode = card.dataset.mode as GameMode;
        modeCards.forEach((c) => c.classList.toggle('active', c === card));
      };
    });

    this.splashModal.querySelector<HTMLButtonElement>('#msky-start-btn')!.onclick = () => {
      this.dismissSplash();
      callbacks.onStartGame(this.selectedMode);
    };

    this.setSelectedTool('power');
  }

  private buildStableStatNodes(): void {
    const mkStat = (title: string, clickable = false) => {
      const s = document.createElement('span');
      s.className = clickable ? 'msky-stat clickable' : 'msky-stat';
      s.title = title;
      this.statsGroup.appendChild(s);
      return s;
    };

    this.statBananas = mkStat('Bananas no cofre (clique para ver Balanço detalhado)', true);
    this.statBananas.onclick = () => {
      this.econPopover.style.display = this.econPopover.style.display === 'none' ? 'block' : 'none';
    };
    this.statPop = mkStat('População Primata atual / próximo marco da cidade');
    this.statHapp = mkStat('Felicidade média dos macacos (subir acima de 78% evolui os Barracos!)');
    this.statPower = mkStat('Energia produzida / demanda total (clique no botão ⚡ ao lado para ver cobertura)');
    this.statGarbage = mkStat('Lixo gerado / capacidade dos Lixões de Coco');
    this.statTraffic = mkStat('Congestionamento nas estradas');

    // RCI Demand Meter
    const rci = document.createElement('div');
    rci.className = 'msky-rci';
    rci.title = 'Demanda RCI: o que a cidade pede agora! 🏠 Barracos | 🍌 Feiras | 🏭 Fábricas';
    const mkCol = (emoji: string, color: string) => {
      const col = document.createElement('div');
      col.className = 'msky-rci-col';
      const track = document.createElement('div');
      track.className = 'msky-rci-track';
      const fill = document.createElement('div');
      fill.className = 'msky-rci-fill';
      fill.style.background = color;
      fill.style.height = '50%';
      track.appendChild(fill);
      const lbl = document.createElement('span');
      lbl.className = 'msky-rci-lbl';
      lbl.textContent = emoji;
      col.append(track, lbl);
      rci.appendChild(col);
      return fill;
    };
    this.rciFillR = mkCol('🏠', '#fb923c');
    this.rciFillC = mkCol('🍌', '#facc15');
    this.rciFillI = mkCol('🏭', '#c084fc');
    this.statsGroup.appendChild(rci);

    this.statMilestone = mkStat('Nível atual da cidade');
    this.statMilestone.style.color = '#fde047';
  }

  private toggleScoreboard(): void {
    this.scorePopover.style.display = this.scorePopover.style.display === 'none' ? 'block' : 'none';
  }

  openSplash(): void {
    this.splashModal.style.display = 'flex';
  }

  dismissSplash(): void {
    this.splashModal.style.display = 'none';
  }

  isSplashOpen(): boolean {
    return this.splashModal.style.display !== 'none';
  }

  setSelectedTool(tool: ToolType): void {
    for (const [id, btn] of this.toolButtons) {
      btn.classList.toggle('selected', id === tool);
    }
    const def = TOOL_MAP[tool];
    const upkeepTxt = def.upkeep > 0 ? ` | Manut: -${def.upkeep}🍌/ciclo` : '';
    const costTxt =
      tool === 'inspect'
        ? 'Grátis'
        : tool === 'bulldozer'
          ? 'Reembolso 50% (Árvore: 5🍌)'
          : `🍌${def.cost}${upkeepTxt}`;
    this.tooltipEl.textContent = `${def.emoji} ${def.name} (${costTxt}): ${def.description}`;
  }

  setSpeed(speed: 0 | 1 | 2): void {
    ([0, 1, 2] as const).forEach((s) => {
      this.speedBtns[s].classList.toggle('active', s === speed);
    });
  }

  setOverlay(overlay: OverlayMode): void {
    (Object.keys(this.overlayBtns) as OverlayMode[]).forEach((m) => {
      this.overlayBtns[m].classList.toggle('active', m === overlay);
    });
  }

  setUndoEnabled(enabled: boolean): void {
    this.undoBtn.disabled = !enabled;
  }

  setPingMode(active: boolean): void {
    this.pingBtn.classList.toggle('ping-active', active);
  }

  setChaosCooldown(secondsLeft: number): void {
    if (secondsLeft > 0) {
      this.chaosBtn.disabled = true;
      this.chaosBtn.textContent = `🚨 ${Math.ceil(secondsLeft)}s`;
    } else {
      this.chaosBtn.disabled = false;
      this.chaosBtn.textContent = '🚨 Caos';
    }
  }

  inspectTile(tile: TileData, sim: CitySimulation): void {
    this.inspectedCoords = { gx: tile.gx, gy: tile.gy };
    this.lastInspectorSig = '';
    this.inspectorBox.style.display = 'block';
    this.renderInspector(tile, sim);
  }

  closeInspector(): void {
    this.inspectedCoords = null;
    this.inspectorBox.style.display = 'none';
  }

  private renderInspector(tile: TileData, sim: CitySimulation): void {
    const b = tile.building;
    const isTownHall = tile.gx === TOWN_HALL_POS.gx && tile.gy === TOWN_HALL_POS.gy && b === 'townhall';

    if (!b) {
      const sig = `empty|${tile.gx},${tile.gy}|${tile.terrain}|${tile.localHappiness}|${tile.pollution}`;
      if (sig === this.lastInspectorSig) return;
      this.lastInspectorSig = sig;
      this.inspectorBox.innerHTML = `
        <h4 style="margin:0 0 6px;color:#7dd3fc;display:flex;justify-content:space-between;">
          <span>🌿 ${getTerrainName(tile.terrain)} (${tile.gx}, ${tile.gy})</span>
          <button class="msky-popover-close" id="msky-insp-close">✕</button>
        </h4>
        <div class="msky-chip-row">
          <span class="msky-tag">😊 Felicidade local: ${tile.localHappiness}%</span>
          <span class="msky-tag">☁️ Poluição: ${tile.pollution}</span>
        </div>
        <div style="font-size:11px;color:#cbd5e1;">Terreno livre! Selecione uma ferramenta (1-7) para construir.</div>
      `;
      this.inspectorBox.querySelector('#msky-insp-close')!.addEventListener('click', () => {
        this.closeInspector();
        this.callbacks.onCloseInspector();
      });
      return;
    }

    const def = TOOL_MAP[b];
    const sig = `${b}|${tile.level}|${tile.powered}|${tile.connectedToRoad}|${tile.damaged}|${tile.localHappiness}|${tile.pollution}|${tile.builtBy}|${sim.stats.bananas}`;
    if (sig === this.lastInspectorSig) return;
    this.lastInspectorSig = sig;

    const stars = b === 'house' ? ' ' + '⭐'.repeat(tile.level) : '';
    const refund = sim.getBulldozeRefund(tile.gx, tile.gy);
    const repairCost = sim.getRepairCost(tile.gx, tile.gy);

    const statusTags: string[] = [];
    if (tile.damaged) {
      statusTags.push(`<span class="msky-tag bad">🔧 Danificado!</span>`);
    }
    if (b === 'house' || b === 'market' || b === 'factory' || b === 'park') {
      statusTags.push(
        tile.powered
          ? `<span class="msky-tag ok">⚡ Energia OK</span>`
          : `<span class="msky-tag bad">⚡ Sem Luz</span>`,
      );
    }
    if (b === 'house' || b === 'market' || b === 'factory') {
      statusTags.push(
        tile.connectedToRoad
          ? `<span class="msky-tag ok">🛣️ Na Estrada</span>`
          : `<span class="msky-tag bad">🛣️ Sem Estrada</span>`,
      );
    }

    let extraInfo = '';
    if (b === 'house') {
      const pop = tile.damaged ? 0 : tile.powered && tile.connectedToRoad ? 8 * tile.level : tile.powered || tile.connectedToRoad ? 4 : 2;
      extraInfo = `🐒 Moradores: <b>${pop}</b> · Imposto ativo: ${tile.powered && tile.connectedToRoad ? 'Sim' : 'Reduzido'}`;
    } else if (b === 'market') {
      extraInfo = `💰 Lucro: <b>${!tile.damaged && tile.powered && tile.connectedToRoad ? '+6🍌/ciclo' : '0🍌 (parado)'}</b>`;
    } else if (b === 'factory') {
      extraInfo = `💰 Lucro: <b>${!tile.damaged && tile.powered && tile.connectedToRoad ? '+18🍌/ciclo' : '0🍌 (parado)'}</b>`;
    } else if (b === 'power') {
      extraInfo = `⚡ Produção: <b>${tile.damaged ? '0' : def.powerGen}⚡</b> (Raio 5.5) · Manut: -${def.upkeep}🍌`;
    } else if (b === 'park') {
      extraInfo = `🗿 Bônus felicidade (Raio 4.2) · Manut: -${def.upkeep}🍌`;
    } else if (b === 'dump') {
      extraInfo = `🗑️ Capacidade: <b>+16 lixo</b> · Manut: -${def.upkeep}🍌`;
    } else if (b === 'townhall') {
      extraInfo = `🏛️ Sede central da cidade! Todas as missões começam aqui.`;
    }

    this.inspectorBox.innerHTML = `
      <h4 style="margin:0 0 6px;color:#fde047;display:flex;justify-content:space-between;align-items:center;">
        <span>${def.emoji} ${def.name}${stars}</span>
        <button class="msky-popover-close" id="msky-insp-close">✕</button>
      </h4>
      <div class="msky-chip-row">
        ${statusTags.join('')}
        <span class="msky-tag">😊 ${tile.localHappiness}%</span>
        <span class="msky-tag">☁️ Poluição ${tile.pollution}</span>
      </div>
      <div style="font-size:11px;color:#e2e8f0;margin-bottom:5px;">${extraInfo}</div>
      <div style="font-size:11px;color:#94a3b8;margin-bottom:8px;">
        👷 Construído por: <b style="color:#fde047">${tile.builtBy || 'Prefeitura'}</b> · Posição (${tile.gx}, ${tile.gy})
      </div>
      <div style="display:flex;gap:6px;flex-wrap:wrap;">
        ${
          tile.damaged
            ? `<button class="msky-btn" id="msky-insp-repair" style="border-color:#4ade80;color:#86efac;">🔧 Reparar (-${repairCost}🍌)</button>`
            : ''
        }
        ${
          !isTownHall
            ? `<button class="msky-btn" id="msky-insp-demo" style="border-color:#fb7185;color:#fecdd3;">💥 Demolir (+${refund}🍌)</button>`
            : ''
        }
      </div>
    `;

    this.inspectorBox.querySelector('#msky-insp-close')!.addEventListener('click', () => {
      this.closeInspector();
      this.callbacks.onCloseInspector();
    });
    this.inspectorBox.querySelector('#msky-insp-repair')?.addEventListener('click', () => {
      this.callbacks.onRepairTile(tile.gx, tile.gy);
    });
    this.inspectorBox.querySelector('#msky-insp-demo')?.addEventListener('click', () => {
      this.callbacks.onDemolishTile(tile.gx, tile.gy);
      this.closeInspector();
    });
  }

  update(
    sim: CitySimulation,
    localTurnInfo?: { active: boolean; playerLabel: string; secondsLeft: number },
  ): void {
    const st = sim.stats;
    const ms = MILESTONES[st.milestoneIndex];
    const nextMs = MILESTONES[st.milestoneIndex + 1];
    const incSign = st.incomePerTick >= 0 ? `+${st.incomePerTick}` : `${st.incomePerTick}`;
    const incColor = st.incomePerTick >= 0 ? '#4ade80' : '#fb7185';
    const powerOk = st.powerProduced >= st.powerDemand;
    const trashOk = st.garbageLoad <= st.garbageCapacity;
    const happEmoji = st.happiness >= 70 ? '😄' : st.happiness >= 40 ? '😐' : '🤬';

    // Update stable stat text nodes (preserves tooltips!)
    const bananasText = sim.mode === 'sandbox' ? '🍌 ∞' : `🍌 ${st.bananas} (${incSign})`;
    if (this.statBananas.textContent !== bananasText) {
      this.statBananas.textContent = bananasText;
      this.statBananas.style.color = sim.mode === 'sandbox' ? '#fde047' : incColor;
    }

    const popText = `🐒 ${st.population}${nextMs ? `/${nextMs.popRequired}` : ''}`;
    if (this.statPop.textContent !== popText) this.statPop.textContent = popText;

    const happText = `${happEmoji} ${st.happiness}%`;
    if (this.statHapp.textContent !== happText) this.statHapp.textContent = happText;

    const powerText = `⚡ ${st.powerProduced}/${st.powerDemand}`;
    if (this.statPower.textContent !== powerText) {
      this.statPower.textContent = powerText;
      this.statPower.style.color = powerOk ? '#7dd3fc' : '#fb7185';
    }

    const trashText = `🗑️ ${st.garbageLoad}/${st.garbageCapacity}`;
    if (this.statGarbage.textContent !== trashText) {
      this.statGarbage.textContent = trashText;
      this.statGarbage.style.color = trashOk ? '#cbd5e1' : '#fb7185';
    }

    const trafficText = `🚗 ${st.trafficCongestion}%`;
    if (this.statTraffic.textContent !== trafficText) this.statTraffic.textContent = trafficText;

    const msText = `${ms.badge} ${ms.name}`;
    if (this.statMilestone.textContent !== msText) this.statMilestone.textContent = msText;

    this.rciFillR.style.height = `${sim.rciDemand.residential}%`;
    this.rciFillC.style.height = `${sim.rciDemand.commercial}%`;
    this.rciFillI.style.height = `${sim.rciDemand.industrial}%`;

    // Update Guided Missions + Dock Highlight
    const missions = sim.getMissions();
    const doneCount = missions.filter((m) => m.done).length;
    const activeMission = missions.find((m) => !m.done) ?? null;

    for (const [id, btn] of this.toolButtons) {
      btn.classList.toggle('suggested', activeMission !== null && activeMission.toolHint === id);
    }

    const guideSig = missions.map((m) => `${m.id}:${m.done}:${m.current}`).join('|');
    if (guideSig !== this.lastGuideSig) {
      this.lastGuideSig = guideSig;
      this.guideTitleEl.textContent =
        doneCount === missions.length
          ? `🎓 Prefeito Formado! (${doneCount}/${missions.length})`
          : `📋 Guia do Prefeito (${doneCount}/${missions.length})`;

      this.guideBody.innerHTML = missions
        .map((m) => {
          const isCurr = activeMission?.id === m.id;
          const cls = m.done ? 'done' : isCurr ? 'current' : '';
          return `
            <div class="msky-mission ${cls}" data-tool="${m.toolHint}">
              <div class="msky-mission-top">
                <span>${m.done ? '✅' : isCurr ? '👉' : '⬜'} ${m.title}</span>
                <span style="color:#fde047">${m.done ? 'OK' : `${m.current}/${m.target} · +${m.reward}🍌`}</span>
              </div>
              ${isCurr ? `<div class="msky-mission-hint">${m.hint}</div>` : ''}
            </div>
          `;
        })
        .join('');

      this.guideBody.querySelectorAll<HTMLDivElement>('.msky-mission.current').forEach((el) => {
        el.style.cursor = 'pointer';
        el.onclick = () => {
          const tool = el.dataset.tool as ToolType | undefined;
          if (tool) this.callbacks.onSelectTool(tool);
        };
      });
    }

    // Update ChimpTwitter & Warnings
    const warnings = sim.getActiveWarnings();
    const latestTweetId = sim.tweets[0]?.id ?? 0;
    const disasterSig = sim.disasters.map((d) => `${d.id}:${Math.ceil(d.remaining)}`).join(',');
    const warnSig = warnings.map((w) => w.text).join('|');
    const tweetSig = `${latestTweetId}|${sim.tweets.length}|${disasterSig}|${warnSig}`;
    if (tweetSig !== this.lastTweetSignature) {
      this.lastTweetSignature = tweetSig;
      if (this.twitterBox.classList.contains('collapsed') && latestTweetId > this.lastSeenTweetId) {
        const currentCount = Number(this.twitterBadge.textContent || '0') || 0;
        const nextCount = Math.min(9, currentCount + 1);
        this.twitterBadge.textContent = warnings.length > 0 ? `! ${nextCount}` : `${nextCount}`;
        this.twitterBadge.className = warnings.length > 0 ? 'msky-badge-pill' : 'msky-badge-pill ok';
        this.twitterBadge.style.display = 'inline-block';
      } else if (warnings.length > 0 && this.twitterBox.classList.contains('collapsed')) {
        this.twitterBadge.textContent = `${warnings.length} ⚠`;
        this.twitterBadge.className = 'msky-badge-pill';
        this.twitterBadge.style.display = 'inline-block';
      }
      this.lastSeenTweetId = latestTweetId;
      this.renderTwitter(sim, warnings);
    }

    // Update Center Banners (Incoming Disaster, Decree Vote, Active Decree, 2P Turn)
    const bannerSig = [
      sim.incomingDisaster ? `${sim.incomingDisaster.type}:${Math.ceil(sim.incomingDisaster.countdown)}` : '',
      `${sim.decree.phase}:${sim.decree.id}:${Math.ceil(sim.decree.remaining)}:${Object.keys(sim.decree.votes).length}`,
      localTurnInfo?.active ? `${localTurnInfo.playerLabel}:${Math.ceil(localTurnInfo.secondsLeft)}` : '',
    ].join('|');
    if (bannerSig !== this.lastBannerSig) {
      this.lastBannerSig = bannerSig;
      this.renderCenterBanners(sim, localTurnInfo);
    }

    // Update open popovers if visible
    if (this.econPopover.style.display === 'block') {
      const e = sim.economy;
      this.econBody.innerHTML = `
        <div class="msky-econ-row"><span>🏠 Imposto Barracos</span><b style="color:#4ade80">+${e.houseIncome}🍌</b></div>
        <div class="msky-econ-row"><span>🍌 Feiras de Banana</span><b style="color:#4ade80">+${e.marketIncome}🍌</b></div>
        <div class="msky-econ-row"><span>🏭 Fábricas de Paçoca</span><b style="color:#4ade80">+${e.factoryIncome}🍌</b></div>
        <div class="msky-econ-row"><span>🚕 Entregas no último ciclo</span><b style="color:#fde047">+${e.deliveryIncome}🍌</b></div>
        ${e.decreeDelta !== 0 ? `<div class="msky-econ-row"><span>📜 Decreto ativo</span><b>${e.decreeDelta >= 0 ? '+' : ''}${e.decreeDelta}🍌</b></div>` : ''}
        <hr style="border-color:#334155;margin:5px 0;">
        <div class="msky-econ-row"><span>🛣️ Manutenção Estradas</span><b style="color:#fb7185">-${e.roadUpkeep}🍌</b></div>
        <div class="msky-econ-row"><span>⚡ Manutenção Usinas</span><b style="color:#fb7185">-${e.powerUpkeep}🍌</b></div>
        <div class="msky-econ-row"><span>🗿 Manutenção Estátuas</span><b style="color:#fb7185">-${e.parkUpkeep}🍌</b></div>
        <div class="msky-econ-row"><span>🥥 Manutenção Lixões</span><b style="color:#fb7185">-${e.dumpUpkeep}🍌</b></div>
        <hr style="border-color:#334155;margin:5px 0;">
        <div class="msky-econ-row" style="font-size:12px;"><span><b>Saldo por ciclo</b></span><b style="color:${e.netPerTick >= 0 ? '#4ade80' : '#fb7185'}">${e.netPerTick >= 0 ? '+' : ''}${e.netPerTick}🍌</b></div>
      `;
    }

    if (this.scorePopover.style.display === 'block') {
      const list = Array.from(sim.contributions.values()).sort((a, b) => b.built * 2 + b.roads - (a.built * 2 + a.roads));
      this.scoreBody.innerHTML =
        list.length === 0
          ? `<div style="color:#94a3b8;font-size:11px;">Construa algo para aparecer no placar!</div>`
          : list
              .map(
                (p, idx) => `
            <div class="msky-econ-row" style="align-items:center;padding:4px 0;border-bottom:1px solid #1e293b;">
              <span style="color:${p.color};font-weight:800;">${idx === 0 ? '👑' : '🐒'} ${p.name}</span>
              <span>🏗️ ${p.built} · 🛣️ ${p.roads}</span>
            </div>`,
              )
              .join('');
    }

    if (this.inspectedCoords && this.inspectorBox.style.display === 'block') {
      const t = sim.grid[this.inspectedCoords.gy][this.inspectedCoords.gx];
      this.renderInspector(t, sim);
    }
  }

  private renderTwitter(
    sim: CitySimulation,
    warnings: Array<{ level: 'crit' | 'warn'; text: string }>,
  ): void {
    const parts: string[] = [];
    for (const w of warnings) {
      parts.push(`<div class="msky-warn-banner ${w.level}">${w.text}</div>`);
    }
    for (const d of sim.disasters) {
      parts.push(
        `<div class="msky-warn-banner crit">${d.title} (${Math.ceil(d.remaining)}s)</div>`,
      );
    }
    for (const t of sim.tweets.slice(0, 10)) {
      parts.push(`
        <div class="msky-tweet ${t.tone}">
          <div class="msky-tweet-meta">
            <span>${t.avatar} ${t.handle}</span>
            <small style="color:#94a3b8">${t.timeLabel} · ❤️ ${t.likes}</small>
          </div>
          <div>${t.text}</div>
        </div>
      `);
    }
    this.twitterBody.innerHTML = parts.join('');
  }

  private renderCenterBanners(
    sim: CitySimulation,
    localTurnInfo?: { active: boolean; playerLabel: string; secondsLeft: number },
  ): void {
    const parts: string[] = [];

    if (localTurnInfo?.active) {
      parts.push(`
        <div class="msky-banner" style="border-color:#4ade80;display:flex;align-items:center;gap:10px;">
          <span>⏱️ Turno: <b style="color:#fde047">${localTurnInfo.playerLabel}</b> (${Math.ceil(localTurnInfo.secondsLeft)}s)</span>
          <button class="msky-btn" id="msky-pass-turn" style="padding:3px 8px;font-size:11px;">⏭️ Passar</button>
        </div>
      `);
    }

    if (sim.incomingDisaster) {
      parts.push(`
        <div class="msky-banner danger">
          ⚠️ ALERTA DA SELVA (${Math.ceil(sim.incomingDisaster.countdown)}s): ${sim.incomingDisaster.title}
        </div>
      `);
    }

    if (sim.decree.phase === 'voting') {
      const [o0, o1] = sim.decree.options;
      let c0 = 0;
      let c1 = 0;
      for (const v of Object.values(sim.decree.votes)) {
        if (v === 0) c0++;
        else c1++;
      }
      parts.push(`
        <div class="msky-banner" style="border-color:#38bdf8;">
          <div>🗳️ <b>Eleição de Decreto Maluco</b> (${Math.ceil(sim.decree.remaining)}s)</div>
          <div class="msky-decree-btns">
            <button class="msky-btn" id="msky-vote-0">${o0.emoji} ${o0.title} (${c0})<br><small style="font-weight:400;color:#cbd5e1">${o0.summary}</small></button>
            <button class="msky-btn" id="msky-vote-1">${o1.emoji} ${o1.title} (${c1})<br><small style="font-weight:400;color:#cbd5e1">${o1.summary}</small></button>
          </div>
        </div>
      `);
    } else if (sim.decree.phase === 'active' && sim.decree.activeOption) {
      const act = sim.decree.activeOption;
      parts.push(`
        <div class="msky-banner" style="border-color:#a855f7;padding:5px 10px;">
          📜 Decreto Ativo: <b>${act.emoji} ${act.title}</b> (${Math.ceil(sim.decree.remaining)}s) — <small>${act.summary}</small>
        </div>
      `);
    }

    this.centerBanners.innerHTML = parts.join('');
    this.centerBanners.querySelector('#msky-vote-0')?.addEventListener('click', () => this.callbacks.onVoteDecree(0));
    this.centerBanners.querySelector('#msky-vote-1')?.addEventListener('click', () => this.callbacks.onVoteDecree(1));
    this.centerBanners.querySelector('#msky-pass-turn')?.addEventListener('click', () => this.callbacks.onPassTurn());
  }

  showCrisisModal(reason: 'bankrupt' | 'rebellion'): void {
    if (this.crisisModal) return;
    const isBankrupt = reason === 'bankrupt';
    this.crisisModal = document.createElement('div');
    this.crisisModal.className = 'msky-modal-backdrop';
    this.crisisModal.innerHTML = `
      <div class="msky-modal">
        <h1>${isBankrupt ? '💸 FALÊNCIA DA PREFEITURA!' : '🔥 REBELIÃO PRIMATA!'}</h1>
        <p>${
          isBankrupt
            ? 'Os cofres ficaram negativos demais! O Tribunal de Contas dos Macacos bloqueou suas bananas.'
            : 'Os macacos estão furiosos demais com a cidade e cercaram a prefeitura com tochas de banana!'
        }</p>
        <div style="display:flex;gap:10px;justify-content:center;flex-wrap:wrap;margin-top:14px;">
          <button class="msky-big-btn" id="msky-loan-btn">🦍 Empréstimo do Agiota (+350🍌)</button>
          <button class="msky-btn" id="msky-reset-btn" style="padding:12px 18px;font-size:14px;">🔄 Recomeçar Cidade</button>
        </div>
      </div>
    `;
    document.body.appendChild(this.crisisModal);
    this.crisisModal.querySelector<HTMLButtonElement>('#msky-loan-btn')!.onclick = () => {
      this.closeCrisisModal();
      this.callbacks.onLoanRescue();
    };
    this.crisisModal.querySelector<HTMLButtonElement>('#msky-reset-btn')!.onclick = () => {
      this.closeCrisisModal();
      this.callbacks.onResetCity();
    };
  }

  closeCrisisModal(): void {
    if (this.crisisModal) {
      this.crisisModal.remove();
      this.crisisModal = null;
    }
  }
}
