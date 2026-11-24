import { FOODS, RECIPES, STATION_LABEL, TOOLS, itemName, type Recipe } from './data';
import type { Game } from './game';
import { GOALS } from './game';
import type { Input } from './input';
import { B, I, MAX_STACK, type Slot } from './types';

interface Rect {
  x: number;
  y: number;
  w: number;
  h: number;
}

interface Layout {
  S: number;
  gap: number;
  narrow: boolean;
  panel: Rect;
  bag: Rect;
  craft: Rect;
  slots: Rect[];
  tabBag: Rect;
  tabCraft: Rect;
  close: Rect;
  trash: Rect;
  showBag: boolean;
  showCraft: boolean;
  rowH: number;
  list: Rect;
}

const inRect = (r: Rect, x: number, y: number) => x >= r.x && x <= r.x + r.w && y >= r.y && y <= r.y + r.h;

function rr(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number): void {
  ctx.beginPath();
  ctx.roundRect(x, y, w, h, r);
}

function heart(ctx: CanvasRenderingContext2D, x: number, y: number, s: number): void {
  ctx.beginPath();
  ctx.moveTo(x + s / 2, y + s * 0.92);
  ctx.bezierCurveTo(x - s * 0.15, y + s * 0.5, x + s * 0.05, y - s * 0.1, x + s / 2, y + s * 0.28);
  ctx.bezierCurveTo(x + s * 0.95, y - s * 0.1, x + s * 1.15, y + s * 0.5, x + s / 2, y + s * 0.92);
  ctx.closePath();
}

export class Ui {
  open = false;
  tab: 'bag' | 'craft' = 'bag';
  scroll = 0;
  cursor: Slot = { id: 0, n: 0 };
  hoverSlot = -1;
  hoverRecipe = -1;
  private swallow = false;
  private lay: Layout | null = null;
  private list: Recipe[] = [];

  reset(): void {
    this.open = false;
    this.cursor = { id: 0, n: 0 };
    this.scroll = 0;
    this.swallow = false;
  }

  toggle(g?: Game): void {
    if (this.open && g) this.returnCursor(g);
    this.open = !this.open;
    if (this.open) this.tab = 'bag';
  }

  private returnCursor(g: Game): void {
    if (this.cursor.id) {
      g.addItem(this.cursor.id, this.cursor.n, true);
      this.cursor = { id: 0, n: 0 };
    }
  }

  private layout(g: Game): Layout {
    const w = g.view.wCss;
    const h = g.view.hCss;
    const S = Math.max(32, Math.min(48, Math.floor(Math.min(w / 10.5, h / 13))));
    const gap = 4;
    const bw = 9 * S + 8 * gap;
    const narrow = w < bw + 340 + 50;
    const craftW = narrow ? Math.min(w - 24, 380) : Math.min(340, w - bw - 70);
    const hotbarTop = h - S - 16;
    const maxH = hotbarTop - 20 - 44;
    const bagH = 3 * S + 2 * gap + 40;
    const craftH = Math.min(maxH, 400);
    const showBag = !narrow || this.tab === 'bag';
    const showCraft = !narrow || this.tab === 'craft';
    const ph = narrow ? Math.min(maxH, Math.max(bagH, craftH)) + 36 : Math.max(bagH, craftH) + 12;
    const pw = narrow ? Math.max(showBag ? bw : 0, showCraft ? craftW : 0) + 24 : bw + craftW + 36;
    const px = Math.round((w - pw) / 2);
    const py = Math.max(52, Math.round((hotbarTop - 12 - ph) / 2 + 24));
    const top = py + (narrow ? 44 : 34);
    const bag: Rect = { x: px + 12, y: top, w: bw, h: bagH };
    const craft: Rect = narrow ? { x: px + 12, y: top, w: craftW, h: ph - 56 } : { x: px + 24 + bw, y: top, w: craftW, h: ph - 46 };
    const slots: Rect[] = [];
    for (let i = 0; i < 9; i++) slots[i] = { x: Math.round((w - bw) / 2) + i * (S + gap), y: hotbarTop, w: S, h: S };
    for (let r = 0; r < 3; r++) {
      for (let c = 0; c < 9; c++) slots[9 + r * 9 + c] = { x: bag.x + c * (S + gap), y: bag.y + r * (S + gap), w: S, h: S };
    }
    const rowH = 46;
    return {
      S,
      gap,
      narrow,
      panel: { x: px, y: py, w: pw, h: ph },
      bag,
      craft,
      slots,
      tabBag: { x: px + 12, y: py + 8, w: 110, h: 28 },
      tabCraft: { x: px + 128, y: py + 8, w: 120, h: 28 },
      close: { x: px + pw - 36, y: py + 8, w: 28, h: 28 },
      trash: { x: bag.x + bw - S, y: bag.y + 3 * (S + gap) + 2, w: S, h: S * 0.8 },
      showBag,
      showCraft,
      rowH,
      list: { x: craft.x, y: craft.y + 22, w: craft.w, h: craft.h - 22 },
    };
  }

  private buildList(g: Game): void {
    const avail = RECIPES.filter((r) => g.stationNear(r.station));
    const ok = avail.filter((r) => g.canCraft(r));
    const no = avail.filter((r) => !g.canCraft(r));
    this.list = ok.concat(no);
  }

  /** Retorna true se a interface consumiu o clique/arraste atual. */
  update(g: Game, input: Input): boolean {
    const L = (this.lay = this.layout(g));
    const mx = input.mx;
    const my = input.my;
    this.hoverSlot = -1;
    this.hoverRecipe = -1;
    if (!input.left && !input.right) this.swallow = false;
    if (this.open) this.buildList(g);

    const slotCount = this.open ? 36 : 9;
    for (let i = 0; i < slotCount; i++) {
      if ((i < 9 || L.showBag) && inRect(L.slots[i], mx, my)) this.hoverSlot = i;
    }
    const pressed = input.leftPressed || input.rightPressed;
    let consumed = false;

    if (!this.open) {
      if (pressed && this.hoverSlot >= 0 && this.hoverSlot < 9) {
        g.selectSlot(this.hoverSlot);
        consumed = true;
      }
    } else {
      const overPanel = inRect(L.panel, mx, my);
      if (input.wheel !== 0 && L.showCraft) {
        const maxScroll = Math.max(0, this.list.length * L.rowH - L.list.h);
        this.scroll = Math.max(0, Math.min(maxScroll, this.scroll + input.wheel * 46));
      }
      if (pressed) {
        if (inRect(L.close, mx, my)) {
          this.toggle(g);
          consumed = true;
        } else if (L.narrow && inRect(L.tabBag, mx, my)) {
          this.tab = 'bag';
          consumed = true;
        } else if (L.narrow && inRect(L.tabCraft, mx, my)) {
          this.tab = 'craft';
          consumed = true;
        } else if (this.hoverSlot >= 0) {
          this.clickSlot(g, this.hoverSlot, input.rightPressed, input.down('shift'));
          consumed = true;
        } else if (L.showBag && inRect(L.trash, mx, my)) {
          this.cursor = { id: 0, n: 0 };
          consumed = true;
        } else if (L.showCraft && inRect(L.list, mx, my)) {
          const idx = Math.floor((my - L.list.y + this.scroll) / L.rowH);
          const r = this.list[idx];
          if (r) {
            if (g.craft(r)) this.buildList(g);
            else if (!g.canCraft(r)) g.toast('Faltam ingredientes ou a bancada/fornalha está longe!', 'chaos');
          }
          consumed = true;
        } else if (overPanel) consumed = true;
        else if (this.cursor.id) consumed = true;
      }
      if (L.showCraft && inRect(L.list, mx, my)) {
        const idx = Math.floor((my - L.list.y + this.scroll) / L.rowH);
        if (this.list[idx]) this.hoverRecipe = idx;
      }
    }
    if (consumed) this.swallow = true;
    return consumed || this.swallow;
  }

  private clickSlot(g: Game, i: number, right: boolean, shift: boolean): void {
    const inv = g.me.inv;
    const s = inv[i];
    const cur = this.cursor;
    if (shift && s.id && !cur.id) {
      // move entre hotbar e mochila
      const range = i < 9 ? [9, 36] : [0, 9];
      const item = { ...s };
      inv[i] = { id: 0, n: 0 };
      let left = item.n;
      for (let k = range[0]; k < range[1] && left > 0; k++) {
        if (inv[k].id === item.id && inv[k].n < MAX_STACK) {
          const t = Math.min(left, MAX_STACK - inv[k].n);
          inv[k].n += t;
          left -= t;
        }
      }
      for (let k = range[0]; k < range[1] && left > 0; k++) {
        if (inv[k].id === 0) {
          inv[k] = { id: item.id, n: left };
          left = 0;
        }
      }
      if (left > 0) inv[i] = { id: item.id, n: left };
      return;
    }
    if (right) {
      if (!cur.id && s.id) {
        const half = Math.ceil(s.n / 2);
        this.cursor = { id: s.id, n: half };
        s.n -= half;
        if (s.n <= 0) inv[i] = { id: 0, n: 0 };
      } else if (cur.id && (s.id === 0 || (s.id === cur.id && s.n < MAX_STACK))) {
        if (s.id === 0) inv[i] = { id: cur.id, n: 1 };
        else s.n++;
        cur.n--;
        if (cur.n <= 0) this.cursor = { id: 0, n: 0 };
      }
      return;
    }
    if (!cur.id) {
      this.cursor = { ...s };
      inv[i] = { id: 0, n: 0 };
    } else if (!s.id) {
      inv[i] = { ...cur };
      this.cursor = { id: 0, n: 0 };
    } else if (s.id === cur.id) {
      const t = Math.min(cur.n, MAX_STACK - s.n);
      s.n += t;
      cur.n -= t;
      if (cur.n <= 0) this.cursor = { id: 0, n: 0 };
    } else {
      inv[i] = { ...cur };
      this.cursor = { ...s };
    }
  }

  // ------------------------------------------------------------ desenho
  private drawSlot(ctx: CanvasRenderingContext2D, g: Game, r: Rect, s: Slot, selected: boolean, hover: boolean, label?: string): void {
    ctx.fillStyle = selected ? 'rgba(250,204,21,0.35)' : 'rgba(15,23,42,0.72)';
    rr(ctx, r.x, r.y, r.w, r.h, 7);
    ctx.fill();
    ctx.lineWidth = selected ? 3 : 2;
    ctx.strokeStyle = selected ? '#facc15' : hover ? '#fef9c3' : 'rgba(255,255,255,0.22)';
    ctx.stroke();
    if (s.id) {
      const pad = r.w * 0.14;
      ctx.imageSmoothingEnabled = false;
      ctx.drawImage(g.atlas.icon(s.id), r.x + pad, r.y + pad, r.w - pad * 2, r.h - pad * 2);
      if (s.n > 1) {
        ctx.font = `bold ${Math.round(r.w * 0.3)}px system-ui, sans-serif`;
        ctx.textAlign = 'right';
        ctx.lineWidth = 3;
        ctx.strokeStyle = '#000';
        ctx.fillStyle = '#fff';
        ctx.strokeText(String(s.n), r.x + r.w - 4, r.y + r.h - 4);
        ctx.fillText(String(s.n), r.x + r.w - 4, r.y + r.h - 4);
      }
    }
    if (label) {
      ctx.font = `bold ${Math.round(r.w * 0.24)}px system-ui, sans-serif`;
      ctx.textAlign = 'left';
      ctx.fillStyle = 'rgba(255,255,255,0.65)';
      ctx.fillText(label, r.x + 4, r.y + r.w * 0.26);
    }
  }

  draw(ctx: CanvasRenderingContext2D, g: Game): void {
    const w = g.view.wCss;
    const h = g.view.hCss;
    const L = this.lay ?? this.layout(g);
    const me = g.me;
    ctx.save();
    ctx.textBaseline = 'alphabetic';

    // ----- vitais
    const hs = Math.max(16, Math.min(24, w / 36));
    const vx = Math.round(w / 2 - (10 * (hs + 2)) / 2);
    const vy = 12;
    for (let i = 0; i < 10; i++) {
      const hx = vx + i * (hs + 2);
      ctx.fillStyle = 'rgba(0,0,0,0.5)';
      heart(ctx, hx, vy, hs);
      ctx.fill();
      const frac = Math.max(0, Math.min(1, (me.hp - i * 10) / 10));
      if (frac > 0) {
        ctx.save();
        heart(ctx, hx, vy, hs);
        ctx.clip();
        ctx.fillStyle = me.hp < 30 && Math.floor(g.clock * 4) % 2 === 0 ? '#fecaca' : '#ef4444';
        ctx.fillRect(hx, vy, hs * frac, hs);
        ctx.restore();
      }
      ctx.strokeStyle = '#7f1d1d';
      ctx.lineWidth = 1.5;
      heart(ctx, hx, vy, hs);
      ctx.stroke();
    }
    ctx.imageSmoothingEnabled = false;
    for (let i = 0; i < 10; i++) {
      ctx.globalAlpha = Math.max(0.2, Math.min(1, (me.hunger - i * 10) / 10 + 0.2));
      ctx.drawImage(g.atlas.icon(I.BANANA), vx + i * (hs + 2), vy + hs + 4, hs, hs);
    }
    ctx.globalAlpha = 1;

    // ----- hotbar
    for (let i = 0; i < 9; i++) this.drawSlot(ctx, g, L.slots[i], me.inv[i], i === me.sel, this.hoverSlot === i, String(i + 1));
    if (g.selMsgT > 0 && me.inv[me.sel].id) {
      ctx.globalAlpha = Math.min(1, g.selMsgT);
      ctx.font = 'bold 15px system-ui, sans-serif';
      ctx.textAlign = 'center';
      ctx.lineWidth = 4;
      ctx.strokeStyle = '#000';
      ctx.fillStyle = '#fef08a';
      const ty = L.slots[0].y - 10;
      ctx.strokeText(itemName(me.inv[me.sel].id), w / 2, ty);
      ctx.fillText(itemName(me.inv[me.sel].id), w / 2, ty);
      ctx.globalAlpha = 1;
    }

    // ----- painel de objetivo / info (topo direito)
    const bw = Math.min(290, w - 24);
    const goal = GOALS[g.goalIdx];
    ctx.font = '600 13px system-ui, sans-serif';
    const lines = this.wrap(ctx, goal.text, bw - 20);
    const bh = 54 + lines.length * 16;
    const bx = w - bw - 10;
    const by = 10;
    if (w > 560 || !this.open) {
      ctx.fillStyle = 'rgba(15,23,42,0.72)';
      rr(ctx, bx, by, bw, bh, 12);
      ctx.fill();
      ctx.strokeStyle = 'rgba(250,204,21,0.6)';
      ctx.lineWidth = 2;
      ctx.stroke();
      const dayT = g.dayT();
      const night = g.daylight() < 0.35;
      ctx.font = 'bold 13px system-ui, sans-serif';
      ctx.textAlign = 'left';
      ctx.fillStyle = '#fde047';
      const depth = Math.max(0, Math.floor(me.body.y - g.world.surf[Math.max(0, Math.min(383, Math.floor(me.body.x)))]));
      ctx.fillText(`${night ? '🌙' : '☀️'} Dia ${g.days}  •  ⛏ ${depth} m  •  ⭐ ${g.score()}`, bx + 10, by + 20);
      ctx.fillStyle = '#e2e8f0';
      ctx.font = '600 13px system-ui, sans-serif';
      lines.forEach((l, i) => ctx.fillText(l, bx + 10, by + 40 + i * 16));
      void dayT;
      if (g.role !== 'solo') {
        ctx.fillStyle = '#86efac';
        ctx.font = 'bold 11px system-ui, sans-serif';
        ctx.fillText(`🐒 ${g.playersOnline()} macaco(s) na selva • ${g.role === 'host' ? 'você é o host' : 'convidado'}`, bx + 10, by + bh - 8);
      }
    }

    // ----- banner
    if (g.bannerT > 0 && !this.open) {
      ctx.globalAlpha = Math.min(1, g.bannerT);
      ctx.font = `800 ${Math.round(Math.min(26, w / 26))}px system-ui, sans-serif`;
      ctx.textAlign = 'center';
      ctx.lineWidth = 5;
      ctx.strokeStyle = '#1e293b';
      ctx.fillStyle = '#fde047';
      const lns = this.wrap(ctx, g.banner, w - 40);
      lns.forEach((l, i) => {
        ctx.strokeText(l, w / 2, 100 + i * 30);
        ctx.fillText(l, w / 2, 100 + i * 30);
      });
      ctx.globalAlpha = 1;
    }

    // ----- inventário / crafting
    if (this.open) {
      ctx.fillStyle = 'rgba(2,6,23,0.45)';
      ctx.fillRect(0, 0, w, h);
      const P = L.panel;
      ctx.fillStyle = 'rgba(30,41,59,0.96)';
      rr(ctx, P.x, P.y, P.w, P.h, 16);
      ctx.fill();
      ctx.strokeStyle = '#facc15';
      ctx.lineWidth = 3;
      ctx.stroke();
      ctx.textAlign = 'left';
      ctx.font = '800 16px system-ui, sans-serif';
      ctx.fillStyle = '#fde047';
      if (L.narrow) {
        for (const [r, label, t] of [[L.tabBag, '🎒 Mochila', 'bag'], [L.tabCraft, '🔨 Receitas', 'craft']] as const) {
          ctx.fillStyle = this.tab === t ? '#facc15' : 'rgba(255,255,255,0.12)';
          rr(ctx, r.x, r.y, r.w, r.h, 8);
          ctx.fill();
          ctx.fillStyle = this.tab === t ? '#1e293b' : '#fff';
          ctx.font = 'bold 14px system-ui, sans-serif';
          ctx.fillText(label, r.x + 10, r.y + 19);
        }
      } else {
        ctx.fillText('🎒 Mochila', P.x + 14, P.y + 26);
        ctx.fillText('🔨 Receitas', L.craft.x, P.y + 26);
      }
      ctx.fillStyle = '#ef4444';
      rr(ctx, L.close.x, L.close.y, L.close.w, L.close.h, 8);
      ctx.fill();
      ctx.fillStyle = '#fff';
      ctx.font = 'bold 16px system-ui, sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText('✕', L.close.x + 14, L.close.y + 20);

      if (L.showBag) {
        for (let i = 9; i < 36; i++) this.drawSlot(ctx, g, L.slots[i], me.inv[i], false, this.hoverSlot === i);
        const T = L.trash;
        ctx.fillStyle = 'rgba(127,29,29,0.6)';
        rr(ctx, T.x, T.y, T.w, T.h, 7);
        ctx.fill();
        ctx.fillStyle = '#fecaca';
        ctx.font = `${Math.round(T.h * 0.5)}px system-ui, sans-serif`;
        ctx.fillText('🗑', T.x + T.w / 2, T.y + T.h * 0.7);
        ctx.font = '600 11px system-ui, sans-serif';
        ctx.textAlign = 'left';
        ctx.fillStyle = '#94a3b8';
        ctx.fillText('Clique: pega/solta • Botão direito: metade/1 • Shift: move', L.bag.x, L.bag.y + L.bag.h + 18);
      }
      if (L.showCraft) {
        const C = L.list;
        ctx.save();
        ctx.beginPath();
        ctx.rect(C.x, C.y, C.w, C.h);
        ctx.clip();
        this.list.forEach((r, idx) => {
          const y = C.y + idx * L.rowH - this.scroll;
          if (y + L.rowH < C.y || y > C.y + C.h) return;
          const ok = g.canCraft(r);
          ctx.globalAlpha = ok ? 1 : 0.5;
          ctx.fillStyle = this.hoverRecipe === idx && ok ? 'rgba(250,204,21,0.28)' : 'rgba(15,23,42,0.75)';
          rr(ctx, C.x, y + 2, C.w, L.rowH - 4, 8);
          ctx.fill();
          ctx.strokeStyle = ok ? 'rgba(134,239,172,0.7)' : 'rgba(255,255,255,0.12)';
          ctx.lineWidth = 1.5;
          ctx.stroke();
          ctx.imageSmoothingEnabled = false;
          ctx.drawImage(g.atlas.icon(r.out), C.x + 6, y + 7, 32, 32);
          ctx.textAlign = 'left';
          ctx.fillStyle = '#fff';
          ctx.font = 'bold 13px system-ui, sans-serif';
          ctx.fillText(`${r.n > 1 ? r.n + '× ' : ''}${itemName(r.out)}`, C.x + 44, y + 21);
          ctx.fillStyle = '#94a3b8';
          ctx.font = '600 11px system-ui, sans-serif';
          ctx.fillText(STATION_LABEL[r.station], C.x + 44, y + 36);
          let ix = C.x + C.w - 8;
          for (let k = r.ing.length - 1; k >= 0; k--) {
            const [id, n] = r.ing[k];
            const have = g.invCount(id);
            ix -= 40;
            ctx.drawImage(g.atlas.icon(id), ix, y + 9, 22, 22);
            ctx.textAlign = 'left';
            ctx.font = 'bold 11px system-ui, sans-serif';
            ctx.fillStyle = have >= n ? '#bbf7d0' : '#fca5a5';
            ctx.fillText(`${n}`, ix + 24, y + 36);
          }
          ctx.globalAlpha = 1;
        });
        ctx.restore();
        if (this.list.length * L.rowH > C.h) {
          ctx.fillStyle = 'rgba(255,255,255,0.2)';
          const th = (C.h / (this.list.length * L.rowH)) * C.h;
          const ty = C.y + (this.scroll / (this.list.length * L.rowH)) * C.h;
          rr(ctx, C.x + C.w - 4, ty, 3, th, 2);
          ctx.fill();
        }
      }
      // tooltip + cursor
      if (this.hoverSlot >= 0 && me.inv[this.hoverSlot].id && !this.cursor.id) {
        this.tooltip(ctx, g, me.inv[this.hoverSlot].id, g.input.mx + 14, g.input.my + 14);
      }
      if (this.cursor.id) {
        const S = L.S;
        ctx.imageSmoothingEnabled = false;
        ctx.drawImage(g.atlas.icon(this.cursor.id), g.input.mx - S / 2, g.input.my - S / 2, S, S);
        if (this.cursor.n > 1) {
          ctx.font = 'bold 13px system-ui, sans-serif';
          ctx.textAlign = 'right';
          ctx.fillStyle = '#fff';
          ctx.strokeStyle = '#000';
          ctx.lineWidth = 3;
          ctx.strokeText(String(this.cursor.n), g.input.mx + S / 2, g.input.my + S / 2);
          ctx.fillText(String(this.cursor.n), g.input.mx + S / 2, g.input.my + S / 2);
        }
      }
    } else if (this.hoverSlot >= 0 && me.inv[this.hoverSlot].id) {
      this.tooltip(ctx, g, me.inv[this.hoverSlot].id, g.input.mx + 12, g.input.my - 40);
    }

    if (me.dead) {
      ctx.fillStyle = 'rgba(20,0,0,0.5)';
      ctx.fillRect(0, 0, w, h);
      ctx.textAlign = 'center';
      ctx.font = '900 40px system-ui, sans-serif';
      ctx.lineWidth = 6;
      ctx.strokeStyle = '#450a0a';
      ctx.fillStyle = '#fecaca';
      ctx.strokeText('💫 Macaco desmaiou!', w / 2, h / 2);
      ctx.fillText('💫 Macaco desmaiou!', w / 2, h / 2);
      ctx.font = '700 16px system-ui, sans-serif';
      ctx.fillStyle = '#fff';
      ctx.fillText(`Acordando em ${Math.ceil(me.deadT)}...`, w / 2, h / 2 + 32);
    }
    ctx.restore();
  }

  private tooltip(ctx: CanvasRenderingContext2D, g: Game, id: number, x: number, y: number): void {
    const lines: string[] = [itemName(id)];
    const tool = TOOLS[id];
    if (tool) lines.push(tool.kind === 'pick' ? `Picareta • poder ${tool.power} • nível ${tool.tier}` : `Espada • dano ${tool.dmg}`);
    const food = FOODS[id];
    if (food) lines.push(`Comida • +${food.food} fome • +${food.heal} vida`);
    if (id === B.BANANITE) lines.push('Brilha no escuro! Precisa de picareta de Ouro.');
    ctx.font = 'bold 13px system-ui, sans-serif';
    const w = Math.max(...lines.map((l) => ctx.measureText(l).width)) + 18;
    const vw = g.view.wCss;
    const px = Math.min(x, vw - w - 6);
    ctx.fillStyle = 'rgba(2,6,23,0.92)';
    rr(ctx, px, y, w, lines.length * 18 + 10, 8);
    ctx.fill();
    ctx.strokeStyle = '#facc15';
    ctx.lineWidth = 1.5;
    ctx.stroke();
    ctx.textAlign = 'left';
    lines.forEach((l, i) => {
      ctx.fillStyle = i === 0 ? '#fde047' : '#cbd5e1';
      ctx.fillText(l, px + 9, y + 20 + i * 18);
    });
  }

  private wrap(ctx: CanvasRenderingContext2D, text: string, maxW: number): string[] {
    const words = text.split(' ');
    const out: string[] = [];
    let line = '';
    for (const wd of words) {
      const t = line ? `${line} ${wd}` : wd;
      if (ctx.measureText(t).width > maxW && line) {
        out.push(line);
        line = wd;
      } else line = t;
    }
    if (line) out.push(line);
    return out;
  }
}
