import { monkeyAudio } from '@monkey-slop/sdk';
import { createDefaultCustomLevel, decodeLevelCode, encodeLevelCode, hashLevelId } from './levels';
import { drawObject } from './renderer';
import { ARENA_ROWS, GROUND_Y, TILE, type LevelData, type LevelObject, type ObjectType, type SongId } from './types';

const CUSTOM_STORAGE_KEY = 'monkey-dash:custom-level';

type EditorTool = ObjectType | 'erase';

const TOOL_ITEMS: Array<{ id: EditorTool; label: string; badge: string; color: string }> = [
  { id: 'block', label: 'Bloco', badge: '🟦', color: '#38bdf8' },
  { id: 'spike', label: 'Espinho', badge: '🔺', color: '#fb7185' },
  { id: 'spike_down', label: 'Esp. Teto', badge: '🔻', color: '#fb7185' },
  { id: 'pad_yellow', label: 'Mola', badge: '🟡', color: '#facc15' },
  { id: 'pad_gravity', label: 'Mola Grav', badge: '🌀', color: '#38bdf8' },
  { id: 'orb_yellow', label: 'Orbe Pulo', badge: '⭕', color: '#fde047' },
  { id: 'orb_blue', label: 'Orbe Grav', badge: '🔵', color: '#38bdf8' },
  { id: 'portal_cube', label: 'P. Cubo', badge: '🟩', color: '#4ade80' },
  { id: 'portal_ship', label: 'P. Nave', badge: '🚀', color: '#f43f5e' },
  { id: 'portal_wave', label: 'P. Wave', badge: '⚡', color: '#22d3ee' },
  { id: 'portal_ball', label: 'P. Bola', badge: '🟣', color: '#c084fc' },
  { id: 'portal_grav_inv', label: 'Grav ↑', badge: '🔼', color: '#38bdf8' },
  { id: 'portal_grav_norm', label: 'Grav ↓', badge: '🔽', color: '#facc15' },
  { id: 'portal_speed_norm', label: '1x', badge: '🐢', color: '#4ade80' },
  { id: 'portal_speed_fast', label: '1.3x', badge: '⏩', color: '#facc15' },
  { id: 'portal_speed_turbo', label: '1.5x', badge: '🔥', color: '#fb7185' },
  { id: 'banana', label: 'Banana', badge: '🍌', color: '#fde047' },
  { id: 'erase', label: 'Apagar', badge: '🧹', color: '#94a3b8' },
];

export function loadSavedCustomLevel(): LevelData {
  try {
    const raw = localStorage.getItem(CUSTOM_STORAGE_KEY);
    if (raw) {
      return decodeLevelCode(raw);
    }
  } catch {
    // ignore corrupt storage
  }
  return createDefaultCustomLevel();
}

export function saveCustomLevel(level: LevelData): void {
  try {
    level.id = hashLevelId(level);
    localStorage.setItem(CUSTOM_STORAGE_KEY, encodeLevelCode(level));
  } catch {
    // ignore storage errors
  }
}

export interface EditorController {
  open: (initial?: LevelData) => void;
  close: () => void;
  isOpen: () => boolean;
  getLevel: () => LevelData;
}

interface HistorySnapshot {
  objects: LevelObject[];
  lengthTiles: number;
}

export function createLevelEditor(
  root: HTMLElement,
  callbacks: {
    onPlayTest: (level: LevelData, startGx?: number) => void;
    onShareToRoom: (level: LevelData) => void;
    onBackToMenu: () => void;
    onToast: (msg: string, tone?: 'banana' | 'chaos' | 'info') => void;
  },
): EditorController {
  let level = loadSavedCustomLevel();
  let selectedTool: EditorTool = 'block';
  let scrollCols = 0;
  let visible = false;
  let painting: 'place' | 'erase' | null = null;
  let hoverCell: { gx: number; gy: number } | null = null;
  const undoStack: HistorySnapshot[] = [];

  const overlay = document.createElement('div');
  overlay.className = 'md-editor-overlay';
  overlay.style.display = 'none';
  overlay.innerHTML = `
    <div class="md-ed-header">
      <div class="md-ed-title">🛠️ MINI EDITOR DE FASE</div>
      <div class="md-ed-meta">
        <input id="ed-name" class="md-ed-input" maxlength="26" placeholder="Nome da fase" />
        <label class="md-ed-lbl">BPM <input id="ed-bpm" class="md-ed-num" type="number" min="80" max="200" /></label>
        <label class="md-ed-lbl">Som
          <select id="ed-song" class="md-ed-select">
            <option value="0">Selva</option>
            <option value="1">Neon</option>
            <option value="2">Faria Lima</option>
            <option value="3">Demônio</option>
            <option value="4">Baile Chimp</option>
            <option value="5">Cósmico</option>
          </select>
        </label>
        <label class="md-ed-lbl">Tam
          <input id="ed-len" class="md-ed-num" type="number" min="40" max="400" step="10" />
        </label>
      </div>
      <div class="md-ed-actions">
        <button id="ed-undo" class="md-btn" title="Desfazer (Ctrl+Z)" disabled>↩ Desfazer</button>
        <button id="ed-test" class="md-btn md-btn-cyan">▶ Testar Início</button>
        <button id="ed-test-here" class="md-btn md-btn-cyan" title="Testar a partir da coluna atual da câmera">⏩ Testar Daqui</button>
        <button id="ed-share-room" class="md-btn md-btn-gold" title="Enviar fase direto pros amigos da sala P2P">📡 Mandar pra Sala</button>
        <button id="ed-export" class="md-btn">📤 Exportar</button>
        <button id="ed-import" class="md-btn">📥 Importar</button>
        <button id="ed-reset" class="md-btn">🔄 Exemplo</button>
        <button id="ed-clear" class="md-btn md-btn-red">🗑️ Limpar</button>
        <button id="ed-back" class="md-btn">⬅ Menu</button>
      </div>
    </div>

    <div class="md-ed-tools" id="ed-tools"></div>

    <div class="md-ed-canvas-wrap">
      <canvas id="ed-canvas"></canvas>
    </div>

    <div class="md-ed-footer">
      <span>Clique/Arraste: colocar • Botão Direito: apagar • Ctrl+Z: desfazer • Roda do mouse ou barra: rolar pista</span>
      <input id="ed-scroll" type="range" min="0" max="100" value="0" style="flex:1;max-width:340px;" />
      <span id="ed-coords">Col: 0 • Objetos: 0</span>
    </div>

    <div id="ed-modal" class="md-ed-modal" style="display:none;">
      <div class="md-ed-modal-card">
        <h3 id="ed-modal-title">Código da Fase</h3>
        <p id="ed-modal-desc" style="font-size:12px;color:#94a3b8;margin:4px 0 8px;"></p>
        <textarea id="ed-modal-text" rows="5"></textarea>
        <div style="display:flex;gap:8px;justify-content:flex-end;margin-top:10px;">
          <button id="ed-modal-copy" class="md-btn md-btn-gold">📋 Copiar</button>
          <button id="ed-modal-apply" class="md-btn md-btn-cyan">✅ Carregar</button>
          <button id="ed-modal-close" class="md-btn">Fechar</button>
        </div>
      </div>
    </div>
  `;
  root.appendChild(overlay);

  const nameInput = overlay.querySelector<HTMLInputElement>('#ed-name')!;
  const bpmInput = overlay.querySelector<HTMLInputElement>('#ed-bpm')!;
  const songSelect = overlay.querySelector<HTMLSelectElement>('#ed-song')!;
  const lenInput = overlay.querySelector<HTMLInputElement>('#ed-len')!;
  const undoBtn = overlay.querySelector<HTMLButtonElement>('#ed-undo')!;
  const toolsWrap = overlay.querySelector<HTMLDivElement>('#ed-tools')!;
  const canvas = overlay.querySelector<HTMLCanvasElement>('#ed-canvas')!;
  const scrollRange = overlay.querySelector<HTMLInputElement>('#ed-scroll')!;
  const coordsEl = overlay.querySelector<HTMLSpanElement>('#ed-coords')!;
  const modal = overlay.querySelector<HTMLDivElement>('#ed-modal')!;
  const modalTitle = overlay.querySelector<HTMLHeadingElement>('#ed-modal-title')!;
  const modalDesc = overlay.querySelector<HTMLParagraphElement>('#ed-modal-desc')!;
  const modalText = overlay.querySelector<HTMLTextAreaElement>('#ed-modal-text')!;
  const modalCopy = overlay.querySelector<HTMLButtonElement>('#ed-modal-copy')!;
  const modalApply = overlay.querySelector<HTMLButtonElement>('#ed-modal-apply')!;

  const toolButtons = new Map<EditorTool, HTMLButtonElement>();
  for (const item of TOOL_ITEMS) {
    const btn = document.createElement('button');
    btn.className = 'md-ed-tool';
    btn.innerHTML = `<span>${item.badge}</span><span>${item.label}</span>`;
    btn.style.setProperty('--tool-color', item.color);
    btn.onclick = () => {
      monkeyAudio.play('click');
      selectedTool = item.id;
      syncToolSelection();
      draw();
    };
    toolsWrap.appendChild(btn);
    toolButtons.set(item.id, btn);
  }

  function syncToolSelection(): void {
    for (const [id, btn] of toolButtons) {
      btn.classList.toggle('active', id === selectedTool);
    }
  }
  syncToolSelection();

  function syncUndoBtn(): void {
    undoBtn.disabled = undoStack.length === 0;
  }

  function pushUndoSnapshot(): void {
    undoStack.push({
      objects: level.objects.map((o) => ({ ...o })),
      lengthTiles: level.lengthTiles,
    });
    if (undoStack.length > 40) undoStack.shift();
    syncUndoBtn();
  }

  function performUndo(): void {
    const snap = undoStack.pop();
    if (!snap) return;
    level.objects = snap.objects;
    level.lengthTiles = snap.lengthTiles;
    saveCustomLevel(level);
    syncUndoBtn();
    syncMetaInputs();
    monkeyAudio.play('click');
    draw();
  }

  function syncMetaInputs(): void {
    nameInput.value = level.name;
    bpmInput.value = String(level.bpm);
    songSelect.value = String(level.songId);
    lenInput.value = String(level.lengthTiles);
    scrollRange.max = String(Math.max(20, level.lengthTiles - 10));
    const colTxt = hoverCell ? ` • Cursor: (${hoverCell.gx}, ${hoverCell.gy})` : '';
    coordsEl.textContent = `Col: ${Math.floor(scrollCols)} • Objetos: ${level.objects.length}${colTxt}`;
  }

  nameInput.onchange = () => {
    level.name = nameInput.value.trim() || 'Minha Fase';
    saveCustomLevel(level);
  };
  bpmInput.onchange = () => {
    level.bpm = Math.max(80, Math.min(200, Number(bpmInput.value) || 128));
    bpmInput.value = String(level.bpm);
    saveCustomLevel(level);
  };
  songSelect.onchange = () => {
    level.songId = Number(songSelect.value) as SongId;
    saveCustomLevel(level);
  };
  lenInput.onchange = () => {
    level.lengthTiles = Math.max(40, Math.min(400, Number(lenInput.value) || 80));
    lenInput.value = String(level.lengthTiles);
    scrollRange.max = String(Math.max(20, level.lengthTiles - 10));
    saveCustomLevel(level);
    draw();
  };

  scrollRange.oninput = () => {
    scrollCols = Number(scrollRange.value);
    syncMetaInputs();
    draw();
  };

  function resizeCanvas(): void {
    const wrap = canvas.parentElement!;
    const rect = wrap.getBoundingClientRect();
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    canvas.width = Math.max(300, Math.floor(rect.width * dpr));
    canvas.height = Math.max(240, Math.floor(rect.height * dpr));
    draw();
  }

  function getGridFromPointer(e: PointerEvent): { gx: number; gy: number } | null {
    const rect = canvas.getBoundingClientRect();
    const relX = e.clientX - rect.left;
    const relY = e.clientY - rect.top;
    const cell = rect.height / ARENA_ROWS;
    const gx = Math.floor(relX / cell + scrollCols);
    const gyFromTop = Math.floor(relY / cell);
    const gy = ARENA_ROWS - 1 - gyFromTop;
    if (gx < 0 || gx > level.lengthTiles + 5 || gy < 0 || gy >= ARENA_ROWS) return null;
    return { gx, gy };
  }

  function applyToolAt(gx: number, gy: number, forceErase: boolean): void {
    const tool: EditorTool = forceErase ? 'erase' : selectedTool;
    const idx = level.objects.findIndex((o) => o.gx === gx && o.gy === gy);
    if (tool === 'erase') {
      if (idx !== -1) {
        level.objects.splice(idx, 1);
      }
    } else {
      if (gx < 6 && gy === 0 && (tool === 'spike' || tool === 'block')) {
        // Keep spawn pad safe (first 6 tiles)
        return;
      }
      if (idx !== -1) {
        level.objects[idx].type = tool;
      } else {
        level.objects.push({ gx, gy, type: tool });
      }
      if (gx >= level.lengthTiles - 4) {
        level.lengthTiles = gx + 12;
        lenInput.value = String(level.lengthTiles);
        scrollRange.max = String(Math.max(20, level.lengthTiles - 10));
      }
    }
    syncMetaInputs();
    saveCustomLevel(level);
    draw();
  }

  canvas.addEventListener('contextmenu', (e) => e.preventDefault());

  canvas.addEventListener('pointerdown', (e) => {
    const forceErase = e.button === 2 || selectedTool === 'erase';
    pushUndoSnapshot();
    painting = forceErase ? 'erase' : 'place';
    canvas.setPointerCapture(e.pointerId);
    const cell = getGridFromPointer(e);
    hoverCell = cell;
    if (cell) applyToolAt(cell.gx, cell.gy, forceErase);
  });

  canvas.addEventListener('pointermove', (e) => {
    const cell = getGridFromPointer(e);
    hoverCell = cell;
    if (painting && cell) {
      applyToolAt(cell.gx, cell.gy, painting === 'erase');
    } else {
      syncMetaInputs();
      draw();
    }
  });

  canvas.addEventListener('pointerleave', () => {
    hoverCell = null;
    syncMetaInputs();
    draw();
  });

  canvas.addEventListener('pointerup', () => {
    painting = null;
  });

  canvas.addEventListener(
    'wheel',
    (e) => {
      e.preventDefault();
      const delta = Math.abs(e.deltaX) > Math.abs(e.deltaY) ? e.deltaX : e.deltaY;
      scrollCols = Math.max(0, Math.min(level.lengthTiles - 6, scrollCols + delta * 0.03));
      scrollRange.value = String(Math.floor(scrollCols));
      syncMetaInputs();
      draw();
    },
    { passive: false },
  );

  window.addEventListener('keydown', (e) => {
    if (!visible) return;
    const tag = (e.target as HTMLElement | null)?.tagName;
    if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return;
    if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'z') {
      e.preventDefault();
      performUndo();
    }
  });

  function draw(): void {
    if (!visible) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    const w = canvas.width;
    const h = canvas.height;
    ctx.clearRect(0, 0, w, h);

    // Background
    const grad = ctx.createLinearGradient(0, 0, 0, h);
    grad.addColorStop(0, level.bgTop);
    grad.addColorStop(1, level.bgBottom);
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, w, h);

    const scale = h / (ARENA_ROWS * TILE);
    ctx.save();
    ctx.scale(scale, scale);

    const viewW = w / scale;
    const viewCols = viewW / TILE;
    const startCol = Math.floor(scrollCols);
    const endCol = Math.ceil(scrollCols + viewCols) + 1;
    const offsetX = scrollCols * TILE;

    // Crisp grid lines (beat / measure lines every 4 cols)
    for (let c = startCol; c <= endCol; c++) {
      const x = Math.round(c * TILE - offsetX) + 0.5;
      const isBeat = c % 4 === 0;
      ctx.strokeStyle = isBeat ? 'rgba(250, 204, 21, 0.28)' : 'rgba(56, 189, 248, 0.17)';
      ctx.lineWidth = isBeat ? 1.5 : 1;
      ctx.beginPath();
      ctx.moveTo(x, 0);
      ctx.lineTo(x, GROUND_Y);
      ctx.stroke();

      if (c % 4 === 0 && c >= 0) {
        ctx.fillStyle = 'rgba(250, 204, 21, 0.72)';
        ctx.font = 'bold 10px system-ui, sans-serif';
        ctx.fillText(String(c), x + 3, 12);
      }
    }
    for (let r = 0; r <= ARENA_ROWS; r++) {
      const y = Math.round(r * TILE) + 0.5;
      ctx.strokeStyle = r === 0 || r === ARENA_ROWS ? 'rgba(34, 211, 238, 0.55)' : 'rgba(56, 189, 248, 0.17)';
      ctx.lineWidth = r === 0 || r === ARENA_ROWS ? 2 : 1;
      ctx.beginPath();
      ctx.moveTo(0, y);
      ctx.lineTo(viewW, y);
      ctx.stroke();
    }

    // Spawn indicator
    const spawnX = 1 * TILE - offsetX;
    if (spawnX > -TILE && spawnX < viewW) {
      ctx.fillStyle = 'rgba(74, 222, 128, 0.25)';
      ctx.fillRect(spawnX, GROUND_Y - TILE, TILE, TILE);
      ctx.fillStyle = '#4ade80';
      ctx.font = 'bold 10px system-ui, sans-serif';
      ctx.fillText('INÍCIO', spawnX + 2, GROUND_Y - TILE - 4);
    }

    // "Testar Daqui" camera marker when scrolled
    if (scrollCols >= 2) {
      const testCol = Math.floor(scrollCols) + 1;
      const tx = testCol * TILE - offsetX;
      ctx.save();
      ctx.strokeStyle = '#4ade80';
      ctx.lineWidth = 2;
      ctx.setLineDash([6, 4]);
      ctx.beginPath();
      ctx.moveTo(tx, 0);
      ctx.lineTo(tx, GROUND_Y);
      ctx.stroke();
      ctx.setLineDash([]);
      ctx.fillStyle = '#4ade80';
      ctx.font = 'bold 10px system-ui, sans-serif';
      ctx.fillText('▶ DAQUI', tx + 4, 26);
      ctx.restore();
    }

    // Finish line
    const finX = level.lengthTiles * TILE - offsetX;
    if (finX > -TILE && finX < viewW + TILE) {
      ctx.fillStyle = 'rgba(250, 204, 21, 0.25)';
      ctx.fillRect(finX, 0, 12, GROUND_Y);
      ctx.fillStyle = '#fde047';
      ctx.font = 'bold 12px system-ui, sans-serif';
      ctx.fillText('🏁 FIM', finX + 16, 24);
    }

    // Objects
    for (const obj of level.objects) {
      if (obj.gx < startCol - 1 || obj.gx > endCol + 1) continue;
      const wx = obj.gx * TILE - offsetX;
      const wy = GROUND_Y - (obj.gy + 1) * TILE;
      drawObject(ctx, obj, wx, wy, 0.25, 0, level.colorPrimary, level.colorSecondary, false, true);
    }

    // Hover cell ghost preview
    if (hoverCell) {
      const hx = hoverCell.gx * TILE - offsetX;
      const hy = GROUND_Y - (hoverCell.gy + 1) * TILE;
      ctx.save();
      ctx.strokeStyle = selectedTool === 'erase' ? '#fb7185' : '#facc15';
      ctx.lineWidth = 2;
      ctx.strokeRect(hx + 1, hy + 1, TILE - 2, TILE - 2);
      if (selectedTool !== 'erase') {
        ctx.globalAlpha = 0.42;
        drawObject(
          ctx,
          { gx: hoverCell.gx, gy: hoverCell.gy, type: selectedTool },
          hx,
          hy,
          0.2,
          0,
          level.colorPrimary,
          level.colorSecondary,
          false,
          false,
        );
      }
      ctx.restore();
    }

    ctx.restore();
  }

  undoBtn.onclick = () => performUndo();

  overlay.querySelector<HTMLButtonElement>('#ed-test')!.onclick = () => {
    monkeyAudio.play('click');
    level.objects.sort((a, b) => a.gx - b.gx || a.gy - b.gy);
    saveCustomLevel(level);
    visible = false;
    overlay.style.display = 'none';
    callbacks.onPlayTest(level, 0);
  };

  overlay.querySelector<HTMLButtonElement>('#ed-test-here')!.onclick = () => {
    monkeyAudio.play('click');
    level.objects.sort((a, b) => a.gx - b.gx || a.gy - b.gy);
    saveCustomLevel(level);
    visible = false;
    overlay.style.display = 'none';
    const startCol = Math.max(0, Math.floor(scrollCols) + (scrollCols >= 2 ? 1 : 0));
    callbacks.onPlayTest(level, startCol);
  };

  overlay.querySelector<HTMLButtonElement>('#ed-share-room')!.onclick = () => {
    monkeyAudio.play('click');
    level.objects.sort((a, b) => a.gx - b.gx || a.gy - b.gy);
    saveCustomLevel(level);
    callbacks.onShareToRoom(level);
  };

  overlay.querySelector<HTMLButtonElement>('#ed-export')!.onclick = async () => {
    monkeyAudio.play('click');
    const code = encodeLevelCode(level);
    modalTitle.textContent = '📤 Exportar Fase';
    modalDesc.textContent = 'Copie o código abaixo e mande para os amigos sofrerem!';
    modalText.value = code;
    modalText.readOnly = true;
    modalCopy.style.display = 'inline-flex';
    modalApply.style.display = 'none';
    modal.style.display = 'flex';
    try {
      await navigator.clipboard.writeText(code);
      callbacks.onToast('Código copiado para a área de transferência!', 'banana');
    } catch {
      // ignore clipboard errors
    }
  };

  overlay.querySelector<HTMLButtonElement>('#ed-import')!.onclick = () => {
    monkeyAudio.play('click');
    modalTitle.textContent = '📥 Importar Fase';
    modalDesc.textContent = 'Cole aqui um código CHIMP1:... ou JSON de fase.';
    modalText.value = '';
    modalText.readOnly = false;
    modalCopy.style.display = 'none';
    modalApply.style.display = 'inline-flex';
    modal.style.display = 'flex';
    modalText.focus();
  };

  modalCopy.onclick = async () => {
    try {
      await navigator.clipboard.writeText(modalText.value);
      callbacks.onToast('Código copiado!', 'banana');
    } catch {
      modalText.select();
    }
  };

  modalApply.onclick = () => {
    try {
      pushUndoSnapshot();
      const imported = decodeLevelCode(modalText.value);
      level = imported;
      saveCustomLevel(level);
      scrollCols = 0;
      scrollRange.value = '0';
      syncMetaInputs();
      draw();
      modal.style.display = 'none';
      monkeyAudio.play('fanfare', 0.2);
      callbacks.onToast(`Fase "${level.name}" carregada!`, 'banana');
    } catch (err) {
      undoStack.pop();
      syncUndoBtn();
      monkeyAudio.play('rage', 0.25);
      callbacks.onToast(`Código inválido: ${(err as Error).message}`, 'chaos');
    }
  };

  overlay.querySelector<HTMLButtonElement>('#ed-modal-close')!.onclick = () => {
    modal.style.display = 'none';
  };

  overlay.querySelector<HTMLButtonElement>('#ed-clear')!.onclick = () => {
    pushUndoSnapshot();
    monkeyAudio.play('slap');
    level.objects = [];
    saveCustomLevel(level);
    syncMetaInputs();
    draw();
  };

  overlay.querySelector<HTMLButtonElement>('#ed-reset')!.onclick = () => {
    pushUndoSnapshot();
    monkeyAudio.play('click');
    level = createDefaultCustomLevel();
    saveCustomLevel(level);
    scrollCols = 0;
    scrollRange.value = '0';
    syncMetaInputs();
    draw();
  };

  overlay.querySelector<HTMLButtonElement>('#ed-back')!.onclick = () => {
    monkeyAudio.play('click');
    visible = false;
    overlay.style.display = 'none';
    callbacks.onBackToMenu();
  };

  window.addEventListener('resize', () => {
    if (visible) resizeCanvas();
  });

  return {
    open(initial?: LevelData) {
      if (initial) {
        level = {
          ...initial,
          objects: initial.objects.map((o) => ({ ...o })),
        };
      }
      visible = true;
      overlay.style.display = 'flex';
      syncUndoBtn();
      syncMetaInputs();
      requestAnimationFrame(() => resizeCanvas());
    },
    close() {
      visible = false;
      overlay.style.display = 'none';
    },
    isOpen() {
      return visible;
    },
    getLevel() {
      return level;
    },
  };
}
