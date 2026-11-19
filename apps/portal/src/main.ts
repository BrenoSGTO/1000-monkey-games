import { getGameScore, monkeyAudio, type CatalogGame, type GameCategory } from '@monkey-slop/sdk';
import { PLANNED_GAMES } from './planned-games';
import './style.css';

interface DiscoveredCatalogFile {
  generatedAt: string;
  games: CatalogGame[];
}

const CATEGORIES: { id: 'all' | 'coop' | GameCategory; label: string }[] = [
  { id: 'all', label: '🍌 Todos' },
  { id: 'coop', label: '🐒 Co-op Online' },
  { id: 'fisica', label: '💥 Física & Ragdoll' },
  { id: 'estrategia', label: '🧠 Estratégia' },
  { id: 'acao', label: '⚔️ Ação' },
  { id: 'ritmo', label: '⚡ Ritmo' },
  { id: 'simulacao', label: '🏙️ Simulação' },
];

let allGames: CatalogGame[] = [...PLANNED_GAMES];
let activeCategory: 'all' | 'coop' | GameCategory = 'all';
let searchTerm = '';
let activeGame: CatalogGame | null = null;

async function loadCatalog(): Promise<CatalogGame[]> {
  const bySlug = new Map<string, CatalogGame>();
  for (const g of PLANNED_GAMES) {
    bySlug.set(g.slug, { ...g });
  }

  try {
    const res = await fetch('./games-catalog.json', { cache: 'no-store' });
    if (res.ok) {
      const data = (await res.json()) as DiscoveredCatalogFile;
      for (const discovered of data.games ?? []) {
        bySlug.set(discovered.slug, {
          ...bySlug.get(discovered.slug),
          ...discovered,
        });
      }
    }
  } catch {
    // Running without generated catalog falls back to planned games
  }

  return Array.from(bySlug.values()).sort((a, b) => {
    if (a.status !== b.status) return a.status === 'playable' ? -1 : 1;
    if (a.featured !== b.featured) return a.featured ? -1 : 1;
    return a.title.localeCompare(b.title);
  });
}

function getGameUrl(game: CatalogGame): string | null {
  return game.entryUrl || game.externalUrl || null;
}

function openGame(game: CatalogGame): void {
  const url = getGameUrl(game);
  if (!url || game.status !== 'playable') return;

  monkeyAudio.play('banana');
  activeGame = game;

  const overlay = document.getElementById('cabinet-overlay')!;
  const frame = document.getElementById('cabinet-frame') as HTMLIFrameElement;
  const titleEl = document.getElementById('cabinet-title')!;
  const controlsEl = document.getElementById('cabinet-controls')!;
  const openTabLink = document.getElementById('cabinet-newtab') as HTMLAnchorElement;

  titleEl.textContent = `${game.emoji} ${game.title}`;
  controlsEl.textContent = game.controls.join(' • ');
  openTabLink.href = url;
  frame.src = url;
  overlay.classList.add('open');
}

function closeGame(): void {
  const overlay = document.getElementById('cabinet-overlay')!;
  const frame = document.getElementById('cabinet-frame') as HTMLIFrameElement;
  overlay.classList.remove('open');
  frame.src = 'about:blank';
  activeGame = null;
  renderGrid();
}

function filterGames(): CatalogGame[] {
  const q = searchTerm.trim().toLowerCase();
  return allGames.filter((game) => {
    if (activeCategory === 'coop' && !game.multiplayer.supported) return false;
    if (activeCategory !== 'all' && activeCategory !== 'coop' && game.category !== activeCategory) {
      return false;
    }
    if (!q) return true;
    const haystack = [
      game.title,
      game.subtitle,
      game.inspiredBy,
      game.description,
      ...game.tags,
    ]
      .join(' ')
      .toLowerCase();
    return haystack.includes(q);
  });
}

function renderGrid(): void {
  const grid = document.getElementById('games-grid');
  if (!grid) return;

  const filtered = filterGames();
  if (filtered.length === 0) {
    grid.innerHTML = `<div class="empty-state">🐒 Nenhum macaco encontrado para "${searchTerm}". Tente outro filtro!</div>`;
    return;
  }

  grid.innerHTML = '';
  for (const game of filtered) {
    const score = getGameScore(game.slug);
    const isPlayable = game.status === 'playable' && Boolean(getGameUrl(game));

    const card = document.createElement('article');
    card.className = 'card';
    card.innerHTML = `
      <div class="card-cover" style="background: radial-gradient(circle at 30% 25%, ${game.accentColor}dd, #0f172a 85%);">
        <div class="card-badges">
          <span class="badge ${isPlayable ? 'badge-live' : 'badge-wip'}">
            ${isPlayable ? '▶ Jogar Agora' : '🚧 Em Construção'}
          </span>
          ${
            game.multiplayer.supported
              ? `<span class="badge badge-coop">🐒 Até ${game.multiplayer.maxPlayers}P</span>`
              : ''
          }
        </div>
        ${
          game.resolvedThumbnail
            ? `<img src="${game.resolvedThumbnail}" alt="${game.title}" />`
            : `<div class="card-emoji">${game.emoji}</div>`
        }
      </div>
      <div class="card-body">
        <div class="card-inspired">Versão Macaco Idiota de ${game.inspiredBy}</div>
        <h3 class="card-title">${game.title}</h3>
        <p class="card-desc">${game.description}</p>
        <div class="card-meta">🎮 ${game.multiplayer.summary}</div>
        <div class="card-footer">
          <span class="score-pill">${score.bestScore > 0 ? `🏆 Recorde: ${score.bestScore}` : game.subtitle}</span>
          <button class="btn ${isPlayable ? 'btn-jungle' : 'btn-ghost'}" ${isPlayable ? '' : 'disabled'}>
            ${isPlayable ? '▶ Jogar' : 'Em breve'}
          </button>
        </div>
      </div>
    `;

    const playBtn = card.querySelector('button');
    if (playBtn && isPlayable) {
      playBtn.onclick = () => openGame(game);
    }

    grid.appendChild(card);
  }
}

function renderFilters(): void {
  const wrap = document.getElementById('filter-tabs');
  if (!wrap) return;
  wrap.innerHTML = '';

  for (const cat of CATEGORIES) {
    const btn = document.createElement('button');
    btn.className = `filter-tab ${activeCategory === cat.id ? 'active' : ''}`;
    btn.textContent = cat.label;
    btn.onclick = () => {
      monkeyAudio.play('click');
      activeCategory = cat.id;
      renderFilters();
      renderGrid();
    };
    wrap.appendChild(btn);
  }
}

async function init(): Promise<void> {
  allGames = await loadCatalog();
  const playableCount = allGames.filter((g) => g.status === 'playable').length;
  const wipCount = allGames.length - playableCount;

  const app = document.getElementById('app')!;
  app.innerHTML = `
    <header class="topbar">
      <div class="topbar-inner">
        <div class="brand">
          <div class="brand-logo">🐒</div>
          <div>
            <h1>CLICK <span>MACACOS</span></h1>
            <small>1000 Monkey Slop Games • Portal Web & Launcher Co-op</small>
          </div>
        </div>
        <div class="topbar-actions">
          <input id="search-input" class="search-box" type="search" placeholder="Buscar jogo macaco..." />
          <button id="random-btn" class="btn btn-banana">🎰 Roleta Macaca</button>
        </div>
      </div>
    </header>

    <main class="container">
      <section class="hero">
        <div class="hero-text">
          <h2>🍌 Bem-vindo ao Flíperama da Macacada!</h2>
          <p>
            Jogos Monkey Slop burros, caóticos e multiplayer P2P para jogar com os amigos no navegador
            (estilo Click Jogos clássico) ou empacotar num launcher único pra Steam.
            Crie uma sala, mande o link no Discord e dê risada até quebrar o teclado!
          </p>
        </div>
        <div class="stats-row">
          <div class="stat-pill">
            <strong>${playableCount}</strong>
            <span>Jogáveis</span>
          </div>
          <div class="stat-pill">
            <strong>${wipCount}</strong>
            <span>No Forno</span>
          </div>
          <div class="stat-pill">
            <strong>R$ 0</strong>
            <span>Co-op P2P</span>
          </div>
        </div>
      </section>

      <nav id="filter-tabs" class="filters"></nav>
      <section id="games-grid" class="grid"></section>
    </main>

    <div id="cabinet-overlay" class="cabinet-overlay">
      <div class="cabinet-header">
        <div class="cabinet-title">
          <button id="cabinet-back" class="btn btn-banana">← Voltar ao Portal</button>
          <div>
            <h3 id="cabinet-title">Jogo</h3>
            <div id="cabinet-controls" class="cabinet-controls"></div>
          </div>
        </div>
        <div style="display:flex;gap:8px;align-items:center;">
          <button id="cabinet-fs" class="btn btn-ghost">⛶ Tela Cheia</button>
          <a id="cabinet-newtab" class="btn btn-ghost" target="_blank" rel="noopener">↗ Nova Aba</a>
        </div>
      </div>
      <div class="cabinet-frame-wrap">
        <iframe id="cabinet-frame" class="cabinet-frame" allow="autoplay; fullscreen; gamepad"></iframe>
      </div>
    </div>
  `;

  const searchInput = document.getElementById('search-input') as HTMLInputElement;
  searchInput.oninput = () => {
    searchTerm = searchInput.value;
    renderGrid();
  };

  document.getElementById('random-btn')!.onclick = () => {
    const playable = allGames.filter((g) => g.status === 'playable' && getGameUrl(g));
    if (playable.length === 0) return;
    monkeyAudio.play('screech', 0.2);
    const chosen = playable[Math.floor(Math.random() * playable.length)];
    openGame(chosen);
  };

  document.getElementById('cabinet-back')!.onclick = () => {
    monkeyAudio.play('click');
    closeGame();
  };

  document.getElementById('cabinet-fs')!.onclick = () => {
    const frame = document.getElementById('cabinet-frame') as HTMLIFrameElement;
    if (frame.requestFullscreen) {
      void frame.requestFullscreen();
    }
  };

  window.addEventListener('message', (event) => {
    const data = event.data as { source?: string; type?: string };
    if (data?.source === 'monkey-slop-game' && data.type === 'exit' && activeGame) {
      closeGame();
    }
  });

  window.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && activeGame) {
      closeGame();
    }
  });

  renderFilters();
  renderGrid();
}

void init();
