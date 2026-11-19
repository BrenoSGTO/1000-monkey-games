import { MILESTONES, TOOLS, TOOL_MAP, type CityStats, type ToolType } from './types';
import type { CitySimulation } from './simulation';

export interface UiCallbacks {
  onSelectTool: (tool: ToolType) => void;
  onSetSpeed: (speed: 0 | 1 | 2) => void;
  onChaosButton: () => void;
  onCenterCamera: () => void;
  onResetCity: () => void;
  onLoanRescue: () => void;
  onStartGame: () => void;
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
      left: 345px;
      right: 10px;
      z-index: 50;
      display: flex;
      flex-wrap: wrap;
      align-items: center;
      justify-content: flex-end;
      gap: 6px;
      pointer-events: none;
    }
    @media (max-width: 960px) {
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
      background: rgba(15, 23, 42, 0.9);
      border: 2px solid #facc15;
      border-radius: 14px;
      padding: 5px 10px;
      box-shadow: 0 4px 12px rgba(0, 0, 0, 0.45);
      font-size: 12px;
      font-weight: 700;
    }
    .msky-stat {
      display: inline-flex;
      align-items: center;
      gap: 4px;
      white-space: nowrap;
    }
    .msky-stat small {
      font-size: 11px;
      opacity: 0.85;
    }
    .msky-btn {
      pointer-events: auto;
      background: rgba(15, 23, 42, 0.92);
      color: #fef08a;
      border: 2px solid #475569;
      border-radius: 10px;
      padding: 6px 10px;
      font-size: 12px;
      font-weight: 800;
      cursor: pointer;
      transition: transform 0.08s ease, border-color 0.15s ease;
    }
    .msky-btn:hover { transform: translateY(-1px); border-color: #facc15; }
    .msky-btn.active { background: #ca8a04; color: #0f172a; border-color: #fef08a; }
    .msky-chaos-btn {
      pointer-events: auto;
      background: linear-gradient(135deg, #e11d48, #f97316);
      color: #fff;
      border: 2px solid #fecdd3;
      border-radius: 12px;
      padding: 6px 12px;
      font-size: 12px;
      font-weight: 900;
      cursor: pointer;
      box-shadow: 0 3px 0 #881337, 0 0 14px rgba(244, 63, 94, 0.55);
      animation: msky-pulse 1.8s infinite;
    }
    .msky-chaos-btn:hover { transform: scale(1.04); }
    .msky-chaos-btn:disabled { opacity: 0.55; cursor: not-allowed; animation: none; }
    @keyframes msky-pulse {
      0%, 100% { box-shadow: 0 3px 0 #881337, 0 0 10px rgba(244, 63, 94, 0.45); }
      50% { box-shadow: 0 3px 0 #881337, 0 0 22px rgba(251, 113, 133, 0.9); }
    }

    .msky-twitter {
      position: fixed;
      top: 66px;
      right: 10px;
      width: 274px;
      max-height: 46vh;
      z-index: 45;
      background: rgba(15, 23, 42, 0.9);
      border: 2px solid #38bdf8;
      border-radius: 14px;
      display: flex;
      flex-direction: column;
      overflow: hidden;
      box-shadow: 0 8px 24px rgba(0, 0, 0, 0.5);
    }
    @media (max-width: 960px) {
      .msky-twitter { top: 104px; width: 230px; }
    }
    .msky-twitter.collapsed .msky-twitter-body { display: none; }
    .msky-twitter-head {
      display: flex;
      align-items: center;
      justify-content: space-between;
      padding: 7px 10px;
      background: rgba(2, 132, 199, 0.25);
      border-bottom: 1px solid rgba(56, 189, 248, 0.35);
      font-size: 12px;
      font-weight: 900;
      color: #7dd3fc;
      cursor: pointer;
    }
    .msky-twitter-body {
      padding: 8px;
      overflow-y: auto;
      display: flex;
      flex-direction: column;
      gap: 6px;
    }
    .msky-disaster-banner {
      background: rgba(225, 29, 72, 0.28);
      border: 1px solid #fb7185;
      color: #fecdd3;
      border-radius: 8px;
      padding: 6px 8px;
      font-size: 11px;
      font-weight: 800;
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
      background: rgba(15, 23, 42, 0.92);
      border: 1px solid #facc15;
      color: #fef9c3;
      padding: 4px 12px;
      border-radius: 999px;
      font-size: 11px;
      font-weight: 700;
      text-align: center;
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
      min-width: 66px;
      padding: 6px 8px;
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
    .msky-tool-key {
      position: absolute;
      top: 3px;
      left: 5px;
      font-size: 9px;
      font-weight: 900;
      color: #94a3b8;
    }
    .msky-tool-emoji { font-size: 20px; line-height: 1.1; }
    .msky-tool-name { font-size: 10px; font-weight: 800; margin-top: 2px; white-space: nowrap; }
    .msky-tool-cost { font-size: 10px; font-weight: 800; color: #fde047; }

    .msky-modal-backdrop {
      position: fixed;
      inset: 0;
      z-index: 200;
      background: rgba(2, 6, 23, 0.72);
      backdrop-filter: blur(4px);
      display: flex;
      align-items: center;
      justify-content: center;
      padding: 16px;
    }
    .msky-modal {
      width: min(460px, 100%);
      background: #0f172a;
      border: 3px solid #facc15;
      border-radius: 20px;
      padding: 20px;
      text-align: center;
      box-shadow: 0 16px 48px rgba(0, 0, 0, 0.7);
    }
    .msky-modal h1 {
      margin: 0 0 6px;
      font-size: 24px;
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
      margin: 0 0 16px;
      font-size: 12px;
      color: #fef08a;
      line-height: 1.55;
    }
    .msky-big-btn {
      background: linear-gradient(135deg, #facc15, #f59e0b);
      color: #0f172a;
      border: none;
      border-radius: 14px;
      padding: 12px 24px;
      font-size: 16px;
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
  private speedBtns: Record<0 | 1 | 2, HTMLButtonElement>;
  private chaosBtn: HTMLButtonElement;
  private twitterBox: HTMLDivElement;
  private twitterBody: HTMLDivElement;
  private tooltipEl: HTMLDivElement;
  private toolButtons = new Map<ToolType, HTMLButtonElement>();
  private splashModal: HTMLDivElement;
  private crisisModal: HTMLDivElement | null = null;
  private lastTweetSignature = '';
  private callbacks: UiCallbacks;

  constructor(callbacks: UiCallbacks) {
    this.callbacks = callbacks;
    injectStyles();

    // Topbar
    this.topbar = document.createElement('div');
    this.topbar.className = 'msky-topbar';

    this.statsGroup = document.createElement('div');
    this.statsGroup.className = 'msky-pill-group';
    this.topbar.appendChild(this.statsGroup);

    // Controls cluster
    const makeBtn = (label: string, title: string, onClick: () => void) => {
      const b = document.createElement('button');
      b.className = 'msky-btn';
      b.textContent = label;
      b.title = title;
      b.onclick = onClick;
      return b;
    };

    const s0 = makeBtn('⏸', 'Pausar simulação', () => callbacks.onSetSpeed(0));
    const s1 = makeBtn('1x', 'Velocidade normal', () => callbacks.onSetSpeed(1));
    const s2 = makeBtn('2x', 'Velocidade turbo', () => callbacks.onSetSpeed(2));
    s1.classList.add('active');
    this.speedBtns = { 0: s0, 1: s1, 2: s2 };
    this.topbar.append(s0, s1, s2);

    this.topbar.appendChild(makeBtn('🎯', 'Centralizar câmera', () => callbacks.onCenterCamera()));
    this.topbar.appendChild(makeBtn('🔄', 'Reiniciar cidade', () => callbacks.onResetCity()));

    this.chaosBtn = document.createElement('button');
    this.chaosBtn.className = 'msky-chaos-btn';
    this.chaosBtn.textContent = '🚨 Decretar Caos';
    this.chaosBtn.title = 'Lança um desastre aleatório na cidade (sincronizado no Co-op!)';
    this.chaosBtn.onclick = () => callbacks.onChaosButton();
    this.topbar.appendChild(this.chaosBtn);

    document.body.appendChild(this.topbar);

    // ChimpTwitter live feed
    this.twitterBox = document.createElement('div');
    this.twitterBox.className = 'msky-twitter';
    const head = document.createElement('div');
    head.className = 'msky-twitter-head';
    head.innerHTML = '<span>🐦 ChimpTwitter Ao Vivo</span><span>▾</span>';
    head.onclick = () => this.twitterBox.classList.toggle('collapsed');
    this.twitterBody = document.createElement('div');
    this.twitterBody.className = 'msky-twitter-body';
    this.twitterBox.append(head, this.twitterBody);
    document.body.appendChild(this.twitterBox);

    // Bottom Dock
    const dockWrap = document.createElement('div');
    dockWrap.className = 'msky-dock-wrap';

    this.tooltipEl = document.createElement('div');
    this.tooltipEl.className = 'msky-tooltip';

    const dock = document.createElement('div');
    dock.className = 'msky-dock';
    for (const tool of TOOLS) {
      const btn = document.createElement('button');
      btn.className = 'msky-tool';
      btn.innerHTML = `
        <span class="msky-tool-key">${tool.key}</span>
        <span class="msky-tool-emoji">${tool.emoji}</span>
        <span class="msky-tool-name">${tool.shortName}</span>
        <span class="msky-tool-cost">🍌${tool.cost}</span>
      `;
      btn.onclick = () => callbacks.onSelectTool(tool.id);
      dock.appendChild(btn);
      this.toolButtons.set(tool.id, btn);
    }

    dockWrap.append(this.tooltipEl, dock);
    document.body.appendChild(dockWrap);

    // Welcome splash
    this.splashModal = document.createElement('div');
    this.splashModal.className = 'msky-modal-backdrop';
    this.splashModal.innerHTML = `
      <div class="msky-modal">
        <h1>🐒 SimMacaco: Prefeitura do Caos</h1>
        <p>Você foi eleito Prefeito da Selva! Construa uma metrópole sem falir ou causar rebelião primata.</p>
        <ul>
          <li>🛣️ Trace <b>Estradas</b> para carrinhos de banana circularem (sobre o rio vira Ponte!).</li>
          <li>⚡ Ligue <b>Usinas de Casca</b> perto dos <b>Barracos</b> e <b>Feiras de Banana</b>.</li>
          <li>🗿 Use a <b>Estátua do Macaco Calvo</b> pra compensar a poluição das Fábricas e Lixões.</li>
          <li>🐒 Jogue <b>Solo</b> ou clique em <b>Co-op Online</b> no topo esquerdo para governar junto!</li>
        </ul>
        <button class="msky-big-btn" id="msky-start-btn">🍌 ASSUMIR PREFEITURA</button>
      </div>
    `;
    document.body.appendChild(this.splashModal);
    this.splashModal.querySelector<HTMLButtonElement>('#msky-start-btn')!.onclick = () => {
      this.dismissSplash();
      callbacks.onStartGame();
    };

    this.setSelectedTool('road');
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
    this.tooltipEl.textContent = `${def.emoji} ${def.name} (🍌${def.cost}): ${def.description}`;
  }

  setSpeed(speed: 0 | 1 | 2): void {
    ([0, 1, 2] as const).forEach((s) => {
      this.speedBtns[s].classList.toggle('active', s === speed);
    });
  }

  setChaosCooldown(secondsLeft: number): void {
    if (secondsLeft > 0) {
      this.chaosBtn.disabled = true;
      this.chaosBtn.textContent = `🚨 Caos (${Math.ceil(secondsLeft)}s)`;
    } else {
      this.chaosBtn.disabled = false;
      this.chaosBtn.textContent = '🚨 Decretar Caos';
    }
  }

  update(sim: CitySimulation): void {
    const st: CityStats = sim.stats;
    const ms = MILESTONES[st.milestoneIndex];
    const nextMs = MILESTONES[st.milestoneIndex + 1];
    const incSign = st.incomePerTick >= 0 ? `+${st.incomePerTick}` : `${st.incomePerTick}`;
    const incColor = st.incomePerTick >= 0 ? '#4ade80' : '#fb7185';
    const powerOk = st.powerProduced >= st.powerDemand;
    const happEmoji = st.happiness >= 70 ? '😄' : st.happiness >= 40 ? '😐' : '🤬';
    const trashAlert = st.garbageLoad > st.garbageCapacity ? ' <small style="color:#fb7185">(Lixo!)</small>' : '';

    this.statsGroup.innerHTML = `
      <span class="msky-stat" title="Bananas no Cofre">🍌 <b>${st.bananas}</b> <small style="color:${incColor}">(${incSign})</small></span>
      <span class="msky-stat" title="População Primata">🐒 <b>${st.population}</b>${nextMs ? `<small>/${nextMs.popRequired}</small>` : ''}</span>
      <span class="msky-stat" title="Felicidade Geral">${happEmoji} <b>${st.happiness}%</b></span>
      <span class="msky-stat" title="Energia Disponível / Demanda" style="color:${powerOk ? '#7dd3fc' : '#fb7185'}">⚡ <b>${st.powerProduced}/${st.powerDemand}</b></span>
      <span class="msky-stat" title="Congestionamento">🚗 <b>${st.trafficCongestion}%</b>${trashAlert}</span>
      <span class="msky-stat" style="color:#fde047">${ms.badge} ${ms.name}</span>
    `;

    // Update ChimpTwitter only when tweets or disasters change
    const disasterSig = sim.disasters.map((d) => `${d.id}:${Math.ceil(d.remaining)}`).join(',');
    const tweetSig = `${sim.tweets[0]?.id ?? 0}|${sim.tweets.length}|${disasterSig}`;
    if (tweetSig !== this.lastTweetSignature) {
      this.lastTweetSignature = tweetSig;
      this.renderTwitter(sim);
    }
  }

  private renderTwitter(sim: CitySimulation): void {
    const parts: string[] = [];
    for (const d of sim.disasters) {
      parts.push(
        `<div class="msky-disaster-banner">${d.title} (${Math.ceil(d.remaining)}s)</div>`,
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
