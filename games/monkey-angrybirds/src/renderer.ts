import { ENEMY_SPECS, MONKEY_SPECS, SLING_POS } from './constants';
import type { BlockEntity, EnemyEntity, MonkeyEntity, PhysicsWorld } from './physics';
import type { EnemyKind, LevelDef, MonkeyKind } from './types';

export interface CameraState {
  x: number; // world x at center of screen
  y: number; // world y at center of screen
  zoom: number; // pixels per meter (base ~ 32-44)
  shake: number;
}

export interface AimVisualState {
  isAiming: boolean;
  pullX: number;
  pullY: number;
  loadedMonkey: MonkeyKind | null;
  trajectory: { x: number; y: number }[];
  ghostTrajectory?: { x: number; y: number }[];
  aimerName?: string;
  aimerColor?: string;
}

export class GameRenderer {
  private ctx: CanvasRenderingContext2D;
  private width = 1280;
  private height = 720;

  constructor(canvas: HTMLCanvasElement) {
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('Canvas 2D indisponivel');
    this.ctx = ctx;
  }

  resize(width: number, height: number, dpr: number): void {
    this.width = width;
    this.height = height;
    this.ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  }

  worldToScreen(wx: number, wy: number, cam: CameraState): { x: number; y: number } {
    return {
      x: this.width * 0.5 + (wx - cam.x) * cam.zoom,
      y: this.height * 0.68 - (wy - cam.y) * cam.zoom,
    };
  }

  screenToWorld(sx: number, sy: number, cam: CameraState): { x: number; y: number } {
    return {
      x: cam.x + (sx - this.width * 0.5) / cam.zoom,
      y: cam.y - (sy - this.height * 0.68) / cam.zoom,
    };
  }

  render(
    physics: PhysicsWorld,
    level: LevelDef,
    cam: CameraState,
    aim: AimVisualState,
    waitingQueue: MonkeyKind[],
    time: number,
  ): void {
    const ctx = this.ctx;
    const shakeX = cam.shake > 0.01 ? (Math.random() - 0.5) * cam.shake * 28 : 0;
    const shakeY = cam.shake > 0.01 ? (Math.random() - 0.5) * cam.shake * 28 : 0;

    // 1. Sky & Parallax Background
    this.drawBackground(ctx, level.theme, cam, time);

    // 2. Enter World Space (+x right, +y up)
    ctx.save();
    ctx.translate(this.width * 0.5 + shakeX, this.height * 0.68 + shakeY);
    ctx.scale(cam.zoom, -cam.zoom);
    ctx.translate(-cam.x, -cam.y);

    // Ground
    this.drawGround(ctx, level.theme);

    // Slingshot Back Fork + Back Elastic
    const pouchPos = aim.isAiming
      ? { x: aim.pullX, y: aim.pullY }
      : { x: SLING_POS.x, y: SLING_POS.y };

    this.drawSlingshotBack(ctx, pouchPos, aim.isAiming);

    // Waiting Monkeys Queue behind slingshot
    this.drawWaitingQueue(ctx, waitingQueue, time);

    // Previous shot ghost trajectory (classic Angry Birds calibration aid!)
    if (aim.ghostTrajectory && aim.ghostTrajectory.length > 1) {
      ctx.save();
      for (let i = 0; i < aim.ghostTrajectory.length; i++) {
        const pt = aim.ghostTrajectory[i];
        const fade = Math.max(0.14, 0.42 * (1 - i / aim.ghostTrajectory.length));
        ctx.fillStyle = `rgba(255, 255, 255, ${fade})`;
        ctx.strokeStyle = `rgba(15, 23, 42, ${fade * 0.65})`;
        ctx.lineWidth = 0.025;
        ctx.beginPath();
        ctx.arc(pt.x, pt.y, 0.075, 0, Math.PI * 2);
        ctx.fill();
        ctx.stroke();
      }
      ctx.restore();
    }

    // Live aiming trajectory dots
    if (aim.isAiming && aim.trajectory.length > 0) {
      ctx.save();
      for (let i = 0; i < aim.trajectory.length; i++) {
        const pt = aim.trajectory[i];
        const alpha = Math.max(0.22, 1 - i / aim.trajectory.length);
        const r = 0.11 * (1 - (i / aim.trajectory.length) * 0.45);
        ctx.globalAlpha = alpha;
        ctx.fillStyle = aim.aimerColor || '#ffffff';
        ctx.strokeStyle = 'rgba(15,23,42,0.88)';
        ctx.lineWidth = 0.04;
        ctx.beginPath();
        ctx.arc(pt.x, pt.y, r, 0, Math.PI * 2);
        ctx.fill();
        ctx.stroke();
      }
      ctx.restore();
    }

    // Loaded Monkey in slingshot
    if (aim.loadedMonkey) {
      const dx = SLING_POS.x - pouchPos.x;
      const dy = SLING_POS.y - pouchPos.y;
      const aimAngle = aim.isAiming ? Math.atan2(dy, dx) * 0.35 : 0;
      this.drawMonkeySprite(
        ctx,
        aim.loadedMonkey,
        pouchPos.x,
        pouchPos.y,
        MONKEY_SPECS[aim.loadedMonkey].radius,
        aimAngle,
        aim.isAiming,
        false,
        time,
      );
      if (aim.aimerName && aim.isAiming) {
        this.drawWorldLabel(
          ctx,
          pouchPos.x,
          pouchPos.y + 1.05,
          `🎯 ${aim.aimerName}`,
          aim.aimerColor || '#fde047',
          14,
          cam.zoom,
        );
      }
    }

    // Slingshot Front Fork + Front Elastic
    this.drawSlingshotFront(ctx, pouchPos, aim.isAiming);

    // Blocks
    for (const block of physics.blocks) {
      this.drawBlock(ctx, block, time);
    }

    // Enemies
    for (const enemy of physics.enemies) {
      this.drawEnemy(ctx, enemy, time, cam.zoom);
    }

    // Dropped Coconut Bombs
    for (const coconut of physics.coconuts) {
      if (coconut.destroyed) continue;
      const pos = coconut.body.getPosition();
      this.drawCoconutBomb(ctx, pos.x, pos.y, coconut.radius, coconut.body.getAngle(), time);
    }

    // Flying Monkeys & Trails
    for (const monkey of physics.monkeys) {
      if (monkey.trail.length > 1) {
        for (let i = 0; i < monkey.trail.length; i++) {
          const t = monkey.trail[i];
          const ratio = i / monkey.trail.length;
          ctx.fillStyle = `rgba(255, 255, 255, ${ratio * 0.55})`;
          ctx.beginPath();
          ctx.arc(t.x, t.y, 0.05 + ratio * 0.09, 0, Math.PI * 2);
          ctx.fill();
        }
      }
      const pos = monkey.body.getPosition();
      const vel = monkey.body.getLinearVelocity();
      const screaming = Math.hypot(vel.x, vel.y) > 4;
      this.drawMonkeySprite(
        ctx,
        monkey.monkeyKind,
        pos.x,
        pos.y,
        monkey.radius,
        monkey.body.getAngle(),
        screaming,
        monkey.powerUsed,
        time,
      );
    }

    // Shockwaves
    for (const sw of physics.shockwaves) {
      const alpha = Math.max(0, 1 - sw.life / sw.maxLife);
      ctx.strokeStyle = sw.color;
      ctx.globalAlpha = alpha;
      ctx.lineWidth = 0.22 * alpha + 0.04;
      ctx.beginPath();
      ctx.arc(sw.x, sw.y, sw.radius, 0, Math.PI * 2);
      ctx.stroke();
      ctx.globalAlpha = 1;
    }

    // Particles
    for (const p of physics.particles) {
      ctx.save();
      ctx.globalAlpha = Math.max(0, p.alpha);
      ctx.translate(p.x, p.y);
      ctx.rotate(p.rotation);
      ctx.fillStyle = p.color;
      if (p.shape === 'circle' || p.shape === 'smoke') {
        ctx.beginPath();
        ctx.arc(0, 0, p.size, 0, Math.PI * 2);
        ctx.fill();
      } else if (p.shape === 'shard') {
        ctx.beginPath();
        ctx.moveTo(-p.size, -p.size * 0.5);
        ctx.lineTo(p.size, 0);
        ctx.lineTo(-p.size * 0.3, p.size);
        ctx.closePath();
        ctx.fill();
      } else if (p.shape === 'banana') {
        ctx.strokeStyle = '#ca8a04';
        ctx.lineWidth = 0.04;
        ctx.beginPath();
        ctx.arc(0, 0, p.size * 1.4, 0.2, Math.PI - 0.2);
        ctx.stroke();
        ctx.fill();
      } else if (p.shape === 'confetti') {
        ctx.fillRect(-p.size, -p.size * 0.45, p.size * 2, p.size * 0.9);
      } else {
        ctx.fillRect(-p.size, -p.size * 0.55, p.size * 2, p.size * 1.1);
      }
      ctx.restore();
    }

    // Floating score & quote popups
    for (const ft of physics.floatingTexts) {
      const alpha = Math.max(0, 1 - ft.life / ft.maxLife);
      ctx.save();
      ctx.globalAlpha = alpha;
      this.drawWorldLabel(
        ctx,
        ft.x,
        ft.y,
        ft.text,
        ft.color,
        Math.round(18 * ft.scale),
        cam.zoom,
      );
      ctx.restore();
    }

    ctx.restore();
  }

  private drawBackground(
    ctx: CanvasRenderingContext2D,
    theme: LevelDef['theme'],
    cam: CameraState,
    time: number,
  ): void {
    const grad = ctx.createLinearGradient(0, 0, 0, this.height);
    if (theme === 'faria-lima') {
      grad.addColorStop(0, '#0ea5e9');
      grad.addColorStop(0.58, '#bae6fd');
      grad.addColorStop(1, '#fed7aa');
    } else if (theme === 'volcano') {
      grad.addColorStop(0, '#451a03');
      grad.addColorStop(0.55, '#c2410c');
      grad.addColorStop(1, '#fde047');
    } else {
      grad.addColorStop(0, '#0284c7');
      grad.addColorStop(0.62, '#7dd3fc');
      grad.addColorStop(1, '#fef9c3');
    }
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, this.width, this.height);

    // Sun
    const sunX = this.width * 0.82 - cam.x * 3;
    const sunY = this.height * 0.18;
    ctx.fillStyle = theme === 'volcano' ? 'rgba(251, 146, 60, 0.85)' : 'rgba(253, 224, 71, 0.92)';
    ctx.beginPath();
    ctx.arc(sunX, sunY, 44, 0, Math.PI * 2);
    ctx.fill();

    // Clouds
    ctx.fillStyle = theme === 'volcano' ? 'rgba(255, 237, 213, 0.25)' : 'rgba(255,255,255,0.75)';
    for (let i = 0; i < 6; i++) {
      const cx = ((i * 310 - cam.x * 7 + time * 8) % (this.width + 240)) - 120;
      const cy = 65 + (i % 3) * 44;
      ctx.beginPath();
      ctx.ellipse(cx, cy, 56, 20, 0, 0, Math.PI * 2);
      ctx.ellipse(cx + 28, cy - 10, 34, 22, 0, 0, Math.PI * 2);
      ctx.ellipse(cx - 26, cy - 6, 30, 18, 0, 0, Math.PI * 2);
      ctx.fill();
    }

    // Parallax city skyline for Faria Lima or hills/trees for Jungle/Volcano
    const groundY = this.height * 0.68 + cam.y * cam.zoom;
    if (theme === 'faria-lima') {
      const offset = -cam.x * 11;
      const buildings = [
        { x: 100, w: 90, h: 240, label: 'BANANA CORP' },
        { x: 220, w: 110, h: 310, label: 'XP TORRE' },
        { x: 370, w: 85, h: 200, label: 'COLETE S/A' },
        { x: 500, w: 120, h: 280, label: 'FARIA BANK' },
        { x: 670, w: 95, h: 250, label: 'PIX INVEST' },
        { x: 820, w: 115, h: 330, label: 'PORCO CEO' },
        { x: 990, w: 100, h: 220, label: 'MEI LTDA' },
      ];
      for (const b of buildings) {
        const bx = b.x + offset;
        const by = groundY - b.h;
        ctx.fillStyle = '#334155';
        ctx.fillRect(bx, by, b.w, b.h + 100);
        ctx.fillStyle = '#64748b';
        ctx.fillRect(bx + 6, by + 10, b.w - 12, 8);
        ctx.fillStyle = 'rgba(186, 230, 253, 0.35)';
        for (let wy = by + 28; wy < groundY - 12; wy += 24) {
          for (let wx = bx + 10; wx < bx + b.w - 14; wx += 18) {
            ctx.fillRect(wx, wy, 10, 14);
          }
        }
        ctx.fillStyle = '#fde047';
        ctx.font = 'bold 10px system-ui, sans-serif';
        ctx.textAlign = 'center';
        ctx.fillText(b.label, bx + b.w / 2, by + 22);
      }
    }

    // Jungle / Volcano rolling hills
    ctx.fillStyle = theme === 'volcano' ? '#7c2d12' : '#16a34a';
    ctx.beginPath();
    ctx.moveTo(0, this.height);
    for (let x = 0; x <= this.width + 40; x += 40) {
      const h = Math.sin((x + cam.x * 14) * 0.009) * 32 + Math.cos((x + cam.x * 9) * 0.017) * 18;
      ctx.lineTo(x, groundY - 46 - h);
    }
    ctx.lineTo(this.width, this.height);
    ctx.closePath();
    ctx.fill();
  }

  private drawGround(ctx: CanvasRenderingContext2D, theme: LevelDef['theme']): void {
    // Deep dirt
    ctx.fillStyle = theme === 'volcano' ? '#451a03' : '#78350f';
    ctx.fillRect(-30, -22, 100, 22);

    // Top turf
    ctx.fillStyle = theme === 'volcano' ? '#ea580c' : theme === 'faria-lima' ? '#475569' : '#65a30d';
    ctx.fillRect(-30, -0.45, 100, 0.45);

    // Grass / Asphalt markings
    ctx.fillStyle = theme === 'volcano' ? '#fb923c' : theme === 'faria-lima' ? '#94a3b8' : '#84cc16';
    for (let x = -12; x < 50; x += 1.8) {
      ctx.fillRect(x, -0.16, 0.7, 0.16);
    }

    // Slingshot dirt mound
    ctx.fillStyle = theme === 'volcano' ? '#7c2d12' : '#4d7c0f';
    ctx.beginPath();
    ctx.ellipse(SLING_POS.x, 0, 1.5, 0.32, 0, 0, Math.PI);
    ctx.fill();
  }

  private drawSlingshotBack(
    ctx: CanvasRenderingContext2D,
    pouch: { x: number; y: number },
    isAiming: boolean,
  ): void {
    const forkBack = { x: SLING_POS.x + 0.34, y: SLING_POS.y + 0.12 };
    // Back wooden branch
    ctx.strokeStyle = '#5c3317';
    ctx.lineWidth = 0.28;
    ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.moveTo(SLING_POS.x, 1.3);
    ctx.lineTo(forkBack.x, forkBack.y);
    ctx.stroke();

    // Back elastic
    ctx.strokeStyle = '#3f220e';
    ctx.lineWidth = isAiming ? 0.11 : 0.09;
    ctx.beginPath();
    ctx.moveTo(forkBack.x, forkBack.y);
    ctx.lineTo(pouch.x, pouch.y);
    ctx.stroke();
  }

  private drawSlingshotFront(
    ctx: CanvasRenderingContext2D,
    pouch: { x: number; y: number },
    isAiming: boolean,
  ): void {
    const forkFront = { x: SLING_POS.x - 0.34, y: SLING_POS.y + 0.08 };

    // Front elastic
    ctx.strokeStyle = '#65a30d';
    ctx.lineWidth = isAiming ? 0.12 : 0.09;
    ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.moveTo(pouch.x, pouch.y);
    ctx.lineTo(forkFront.x, forkFront.y);
    ctx.stroke();

    // Pouch leather
    if (isAiming) {
      ctx.fillStyle = '#451a03';
      ctx.beginPath();
      ctx.arc(pouch.x, pouch.y, 0.2, 0, Math.PI * 2);
      ctx.fill();
    }

    // Main vine trunk + front fork
    ctx.strokeStyle = '#78350f';
    ctx.lineWidth = 0.34;
    ctx.beginPath();
    ctx.moveTo(SLING_POS.x, 0);
    ctx.lineTo(SLING_POS.x, 1.35);
    ctx.lineTo(forkFront.x, forkFront.y);
    ctx.stroke();

    ctx.strokeStyle = '#a16207';
    ctx.lineWidth = 0.16;
    ctx.beginPath();
    ctx.moveTo(SLING_POS.x, 0.1);
    ctx.lineTo(SLING_POS.x, 1.35);
    ctx.lineTo(forkFront.x, forkFront.y);
    ctx.stroke();

    // Decorative vine leaves
    ctx.fillStyle = '#22c55e';
    ctx.beginPath();
    ctx.ellipse(SLING_POS.x + 0.26, 0.85, 0.24, 0.11, 0.45, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#4ade80';
    ctx.beginPath();
    ctx.ellipse(SLING_POS.x - 0.24, 1.15, 0.22, 0.1, -0.5, 0, Math.PI * 2);
    ctx.fill();
  }

  private drawWaitingQueue(
    ctx: CanvasRenderingContext2D,
    queue: MonkeyKind[],
    time: number,
  ): void {
    for (let i = 0; i < queue.length; i++) {
      const kind = queue[i];
      const spec = MONKEY_SPECS[kind];
      const hop = Math.abs(Math.sin(time * 3.8 + i * 1.3)) * 0.22;
      const x = SLING_POS.x - 1.75 - i * 1.28;
      const y = spec.radius + hop;
      this.drawMonkeySprite(ctx, kind, x, y, spec.radius * 0.9, 0, false, false, time);
    }
  }

  private drawBlock(ctx: CanvasRenderingContext2D, block: BlockEntity, time: number): void {
    const pos = block.body.getPosition();
    const angle = block.body.getAngle();
    const dmgRatio = 1 - Math.max(0, block.hp) / block.maxHp;

    ctx.save();
    ctx.translate(pos.x, pos.y);
    ctx.rotate(angle);

    const hw = block.w / 2;
    const hh = block.h / 2;

    if (block.material === 'glass') {
      ctx.fillStyle = 'rgba(125, 211, 252, 0.65)';
      ctx.strokeStyle = '#0284c7';
      ctx.lineWidth = 0.06;
      ctx.fillRect(-hw, -hh, block.w, block.h);
      ctx.strokeRect(-hw, -hh, block.w, block.h);

      // Shine
      ctx.strokeStyle = 'rgba(255,255,255,0.65)';
      ctx.lineWidth = 0.05;
      ctx.beginPath();
      ctx.moveTo(-hw * 0.6, -hh * 0.6);
      ctx.lineTo(hw * 0.4, hh * 0.6);
      ctx.stroke();
    } else if (block.material === 'wood') {
      ctx.fillStyle = '#d97706';
      ctx.strokeStyle = '#78350f';
      ctx.lineWidth = 0.06;
      ctx.fillRect(-hw, -hh, block.w, block.h);
      ctx.strokeRect(-hw, -hh, block.w, block.h);

      // Wood grain
      ctx.strokeStyle = '#b45309';
      ctx.lineWidth = 0.035;
      ctx.beginPath();
      if (block.w > block.h) {
        ctx.moveTo(-hw * 0.8, 0);
        ctx.lineTo(hw * 0.8, 0);
      } else {
        ctx.moveTo(0, -hh * 0.8);
        ctx.lineTo(0, hh * 0.8);
      }
      ctx.stroke();
    } else if (block.material === 'stone') {
      ctx.fillStyle = '#64748b';
      ctx.strokeStyle = '#334155';
      ctx.lineWidth = 0.07;
      ctx.fillRect(-hw, -hh, block.w, block.h);
      ctx.strokeRect(-hw, -hh, block.w, block.h);

      ctx.fillStyle = '#94a3b8';
      ctx.fillRect(-hw + 0.06, hh - 0.14, block.w - 0.12, 0.08);
    } else if (block.material === 'tnt') {
      const pulse = 1 + Math.sin(time * 9) * 0.04;
      ctx.scale(pulse, pulse);
      ctx.fillStyle = '#dc2626';
      ctx.strokeStyle = '#7f1d1d';
      ctx.lineWidth = 0.07;
      ctx.fillRect(-hw, -hh, block.w, block.h);
      ctx.strokeRect(-hw, -hh, block.w, block.h);

      ctx.fillStyle = '#fef08a';
      ctx.fillRect(-hw + 0.04, -hh * 0.38, block.w - 0.08, block.h * 0.38);

      ctx.save();
      ctx.scale(0.03, -0.03);
      ctx.fillStyle = '#991b1b';
      ctx.font = '900 12px system-ui, sans-serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText('TNT', 0, 0);
      ctx.restore();
    }

    // Cracks when damaged
    if (dmgRatio > 0.25 && block.material !== 'tnt') {
      ctx.strokeStyle = block.material === 'glass' ? '#e0f2fe' : '#1e293b';
      ctx.lineWidth = 0.04;
      ctx.beginPath();
      ctx.moveTo(-hw * 0.4, hh * 0.5);
      ctx.lineTo(0, 0);
      ctx.lineTo(hw * 0.45, -hh * 0.2);
      if (dmgRatio > 0.58) {
        ctx.moveTo(0, 0);
        ctx.lineTo(-hw * 0.2, -hh * 0.6);
      }
      ctx.stroke();
    }

    ctx.restore();
  }

  private drawMonkeySprite(
    ctx: CanvasRenderingContext2D,
    kind: MonkeyKind,
    x: number,
    y: number,
    r: number,
    angle: number,
    screaming: boolean,
    powerUsed: boolean,
    time: number,
  ): void {
    const spec = MONKEY_SPECS[kind];
    ctx.save();
    ctx.translate(x, y);
    ctx.rotate(angle);

    // Aura if power is active
    if (powerUsed) {
      ctx.strokeStyle = spec.accentColor;
      ctx.lineWidth = 0.07;
      ctx.beginPath();
      ctx.arc(0, 0, r * 1.18, 0, Math.PI * 2);
      ctx.stroke();
    }

    // Ears
    ctx.fillStyle = spec.primaryColor;
    ctx.strokeStyle = '#1e293b';
    ctx.lineWidth = 0.06;
    for (const side of [-1, 1]) {
      ctx.beginPath();
      ctx.arc(side * r * 0.92, r * 0.1, r * 0.36, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();
      ctx.fillStyle = '#fde68a';
      ctx.beginPath();
      ctx.arc(side * r * 0.92, r * 0.1, r * 0.18, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = spec.primaryColor;
    }

    // Head / Body circle
    ctx.fillStyle = spec.primaryColor;
    ctx.beginPath();
    ctx.arc(0, 0, r, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();

    // Accessories per type
    if (kind === 'normal') {
      // Furious red headband
      ctx.fillStyle = '#dc2626';
      ctx.fillRect(-r * 0.94, r * 0.18, r * 1.88, r * 0.26);
    } else if (kind === 'triple') {
      // 3 hair tufts
      ctx.fillStyle = '#38bdf8';
      ctx.beginPath();
      ctx.moveTo(-r * 0.35, r * 0.85);
      ctx.lineTo(0, r * 1.38);
      ctx.lineTo(r * 0.35, r * 0.85);
      ctx.closePath();
      ctx.fill();
    } else if (kind === 'bomb') {
      // Burning fuse on top!
      ctx.strokeStyle = '#d97706';
      ctx.lineWidth = 0.09;
      ctx.beginPath();
      ctx.moveTo(0, r * 0.92);
      ctx.quadraticCurveTo(r * 0.35, r * 1.35, r * 0.55, r * 1.25);
      ctx.stroke();
      const sparkR = 0.13 + Math.sin(time * 24) * 0.05;
      ctx.fillStyle = '#fde047';
      ctx.beginPath();
      ctx.arc(r * 0.55, r * 1.25, sparkR, 0, Math.PI * 2);
      ctx.fill();
    } else if (kind === 'tank') {
      // Silverback crest & visor
      ctx.fillStyle = '#c084fc';
      ctx.beginPath();
      ctx.arc(0, r * 0.25, r * 0.85, 0.2, Math.PI - 0.2);
      ctx.fill();
    } else if (kind === 'boomerang') {
      // Banana-boomerang crest
      ctx.fillStyle = '#fde047';
      ctx.strokeStyle = '#854d0e';
      ctx.lineWidth = 0.05;
      ctx.beginPath();
      ctx.arc(0, r * 0.9, r * 0.48, 0, Math.PI);
      ctx.fill();
      ctx.stroke();
    } else if (kind === 'bomber') {
      // Aviator cap & goggles strap + carried coconut bomb
      ctx.fillStyle = '#78350f';
      ctx.beginPath();
      ctx.arc(0, r * 0.15, r * 0.98, 0.15, Math.PI - 0.15);
      ctx.fill();
      ctx.fillStyle = '#f59e0b';
      ctx.fillRect(-r * 0.92, -r * 0.72, r * 1.84, r * 0.24);
      if (!powerUsed) {
        ctx.fillStyle = '#5c3317';
        ctx.strokeStyle = '#fb923c';
        ctx.lineWidth = 0.04;
        ctx.beginPath();
        ctx.arc(0, -r * 0.95, r * 0.42, 0, Math.PI * 2);
        ctx.fill();
        ctx.stroke();
      }
    }

    // Muzzle / face patch
    ctx.fillStyle = '#fde68a';
    ctx.beginPath();
    ctx.ellipse(0, -r * 0.26, r * 0.66, r * 0.48, 0, 0, Math.PI * 2);
    ctx.fill();

    // Googly cross-eyed furious eyes
    const eyeY = r * 0.08;
    const eyeX = r * 0.32;
    ctx.fillStyle = '#ffffff';
    ctx.strokeStyle = '#0f172a';
    ctx.lineWidth = 0.05;
    for (const side of [-1, 1]) {
      ctx.beginPath();
      ctx.arc(side * eyeX, eyeY, r * 0.24, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();
      // Slightly cross-eyed pupils!
      ctx.fillStyle = '#0f172a';
      ctx.beginPath();
      ctx.arc(side * eyeX - side * r * 0.05, eyeY + (side > 0 ? 0.03 : -0.02), r * 0.095, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = '#ffffff';
    }

    // Bomber aviator goggles rim
    if (kind === 'bomber') {
      ctx.strokeStyle = '#f59e0b';
      ctx.lineWidth = 0.06;
      for (const side of [-1, 1]) {
        ctx.beginPath();
        ctx.arc(side * eyeX, eyeY, r * 0.28, 0, Math.PI * 2);
        ctx.stroke();
      }
    }

    // Angry V-eyebrows
    ctx.strokeStyle = '#0f172a';
    ctx.lineWidth = r * 0.16;
    ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.moveTo(-r * 0.62, r * 0.44);
    ctx.lineTo(-r * 0.1, r * 0.24);
    ctx.moveTo(r * 0.62, r * 0.44);
    ctx.lineTo(r * 0.1, r * 0.24);
    ctx.stroke();

    // Mouth: screaming when pulled or flying, gritting teeth otherwise
    if (screaming) {
      ctx.fillStyle = '#7f1d1d';
      ctx.beginPath();
      ctx.ellipse(0, -r * 0.38, r * 0.3, r * 0.22, 0, 0, Math.PI * 2);
      ctx.fill();
    } else {
      ctx.fillStyle = '#ffffff';
      ctx.strokeStyle = '#0f172a';
      ctx.lineWidth = 0.04;
      ctx.fillRect(-r * 0.32, -r * 0.46, r * 0.64, r * 0.18);
      ctx.strokeRect(-r * 0.32, -r * 0.46, r * 0.64, r * 0.18);
    }

    ctx.restore();
  }

  private drawCoconutBomb(
    ctx: CanvasRenderingContext2D,
    x: number,
    y: number,
    r: number,
    angle: number,
    time: number,
  ): void {
    ctx.save();
    ctx.translate(x, y);
    ctx.rotate(angle);

    // Glow aura
    ctx.strokeStyle = 'rgba(249, 115, 22, 0.75)';
    ctx.lineWidth = 0.07;
    ctx.beginPath();
    ctx.arc(0, 0, r * 1.24, 0, Math.PI * 2);
    ctx.stroke();

    // Coconut shell
    ctx.fillStyle = '#451a03';
    ctx.strokeStyle = '#1e293b';
    ctx.lineWidth = 0.06;
    ctx.beginPath();
    ctx.arc(0, 0, r, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();

    // Three coconut dots
    ctx.fillStyle = '#1c1917';
    ctx.beginPath();
    ctx.arc(-r * 0.22, r * 0.15, r * 0.12, 0, Math.PI * 2);
    ctx.arc(r * 0.2, r * 0.18, r * 0.12, 0, Math.PI * 2);
    ctx.arc(0, -r * 0.12, r * 0.13, 0, Math.PI * 2);
    ctx.fill();

    // Lit fuse spark
    ctx.strokeStyle = '#d97706';
    ctx.lineWidth = 0.07;
    ctx.beginPath();
    ctx.moveTo(0, r * 0.9);
    ctx.lineTo(r * 0.35, r * 1.32);
    ctx.stroke();
    ctx.fillStyle = time % 0.16 < 0.08 ? '#fde047' : '#fb923c';
    ctx.beginPath();
    ctx.arc(r * 0.35, r * 1.32, 0.12, 0, Math.PI * 2);
    ctx.fill();

    ctx.restore();
  }

  private drawEnemy(
    ctx: CanvasRenderingContext2D,
    enemy: EnemyEntity,
    time: number,
    camZoom: number,
  ): void {
    const pos = enemy.body.getPosition();
    const r = enemy.radius;
    const angle = enemy.body.getAngle();
    const scared = enemy.scaredTimer > 0 || enemy.hp < enemy.maxHp * 0.55;

    ctx.save();
    ctx.translate(pos.x, pos.y);
    ctx.rotate(angle);

    this.drawEnemyFace(ctx, enemy.enemyKind, r, scared, enemy.helmetLost, time);

    ctx.restore();

    if (enemy.scaredTimer > 0) {
      this.drawWorldLabel(ctx, pos.x, pos.y + r + 0.56, 'SOCORRO!', '#fecdd3', 12, camZoom);
    }
  }

  private drawEnemyFace(
    ctx: CanvasRenderingContext2D,
    kind: EnemyKind,
    r: number,
    scared: boolean,
    helmetLost: boolean,
    time: number,
  ): void {
    const isTatu = kind === 'tatu';
    const isBoss = kind === 'boss_porco' || kind === 'boss_helmet';
    const isHelmetBoss = kind === 'boss_helmet';

    // Ears
    ctx.fillStyle = isTatu ? '#a16207' : '#84cc16';
    ctx.strokeStyle = '#1e293b';
    ctx.lineWidth = 0.06;
    for (const side of [-1, 1]) {
      ctx.beginPath();
      ctx.arc(side * r * 0.72, r * 0.72, r * 0.25, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();
    }

    // Main body
    ctx.fillStyle = isTatu ? '#92400e' : '#84cc16';
    ctx.beginPath();
    ctx.arc(0, 0, r, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();

    // Tatu armor plates / Porco Faria Limer vest or Boss suit
    if (isTatu) {
      ctx.strokeStyle = '#451a03';
      ctx.lineWidth = 0.07;
      ctx.beginPath();
      ctx.arc(0, 0, r * 0.85, 0.3, Math.PI - 0.3);
      ctx.stroke();
      // Bandit mask
      ctx.fillStyle = '#0f172a';
      ctx.fillRect(-r * 0.86, -r * 0.08, r * 1.72, r * 0.34);
    } else {
      // Puffer vest (Faria Limer!) or Boss Suit
      ctx.fillStyle = isBoss ? '#0f172a' : '#1e293b';
      ctx.beginPath();
      ctx.arc(0, -r * 0.05, r * 0.96, Math.PI * 1.12, Math.PI * 1.88);
      ctx.closePath();
      ctx.fill();
      // Red tie for CEO or vest zipper for Porco
      ctx.fillStyle = isBoss ? '#ef4444' : '#38bdf8';
      ctx.fillRect(-r * 0.08, -r * 0.92, r * 0.16, r * 0.45);
    }

    // Boss crown or Faria Lima Construction Hard-Hat!
    if (isHelmetBoss && !helmetLost) {
      // Golden/Yellow executive construction hard-hat
      ctx.fillStyle = '#facc15';
      ctx.strokeStyle = '#854d0e';
      ctx.lineWidth = 0.06;
      ctx.beginPath();
      ctx.arc(0, r * 0.36, r * 0.92, 0, Math.PI);
      ctx.closePath();
      ctx.fill();
      ctx.stroke();
      // Hard-hat brim
      ctx.fillStyle = '#eab308';
      ctx.fillRect(-r * 1.06, r * 0.32, r * 2.12, r * 0.16);
      ctx.strokeRect(-r * 1.06, r * 0.32, r * 2.12, r * 0.16);
      // Center ridge
      ctx.fillStyle = '#fef08a';
      ctx.fillRect(-r * 0.14, r * 0.48, r * 0.28, r * 0.72);
    } else if (kind === 'boss_porco') {
      ctx.fillStyle = '#facc15';
      ctx.strokeStyle = '#854d0e';
      ctx.lineWidth = 0.05;
      ctx.beginPath();
      ctx.moveTo(-r * 0.48, r * 0.82);
      ctx.lineTo(-r * 0.35, r * 1.24);
      ctx.lineTo(0, r * 0.98);
      ctx.lineTo(r * 0.35, r * 1.24);
      ctx.lineTo(r * 0.48, r * 0.82);
      ctx.closePath();
      ctx.fill();
      ctx.stroke();
    }

    // Eyes
    const jitter = scared ? Math.sin(time * 48) * 0.045 : 0;
    const eyeR = scared ? r * 0.26 : r * 0.21;
    for (const side of [-1, 1]) {
      ctx.fillStyle = '#ffffff';
      ctx.strokeStyle = '#0f172a';
      ctx.lineWidth = 0.04;
      ctx.beginPath();
      ctx.arc(side * r * 0.36 + jitter, r * 0.1, eyeR, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();

      ctx.fillStyle = '#0f172a';
      ctx.beginPath();
      ctx.arc(
        side * r * 0.36 + jitter,
        r * 0.1,
        scared ? eyeR * 0.32 : eyeR * 0.42,
        0,
        Math.PI * 2,
      );
      ctx.fill();
    }

    // Scared eyebrows & sweat drop
    if (scared) {
      ctx.strokeStyle = '#0f172a';
      ctx.lineWidth = 0.06;
      ctx.beginPath();
      ctx.moveTo(-r * 0.56, r * 0.38);
      ctx.lineTo(-r * 0.18, r * 0.48);
      ctx.moveTo(r * 0.56, r * 0.38);
      ctx.lineTo(r * 0.18, r * 0.48);
      ctx.stroke();

      // Animated blue sweat drop
      const dropY = r * 0.58 - ((time * 1.6) % 0.22);
      ctx.fillStyle = '#38bdf8';
      ctx.beginPath();
      ctx.arc(-r * 0.64, dropY, r * 0.11, 0, Math.PI * 2);
      ctx.fill();
    }

    // Boss Monocle
    if (isBoss) {
      ctx.strokeStyle = '#facc15';
      ctx.lineWidth = 0.06;
      ctx.beginPath();
      ctx.arc(r * 0.36, r * 0.1, r * 0.28, 0, Math.PI * 2);
      ctx.stroke();
    }

    // Snout
    ctx.fillStyle = isTatu ? '#fde68a' : '#bef264';
    ctx.strokeStyle = '#1e293b';
    ctx.lineWidth = 0.04;
    ctx.beginPath();
    ctx.ellipse(0, -r * 0.14, r * 0.34, r * 0.23, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();

    ctx.fillStyle = '#1e293b';
    ctx.beginPath();
    ctx.arc(-r * 0.12, -r * 0.14, r * 0.06, 0, Math.PI * 2);
    ctx.arc(r * 0.12, -r * 0.14, r * 0.06, 0, Math.PI * 2);
    ctx.fill();

    // Mouth
    if (scared) {
      ctx.fillStyle = '#7f1d1d';
      ctx.beginPath();
      ctx.ellipse(0, -r * 0.5, r * 0.22, r * 0.18, 0, 0, Math.PI * 2);
      ctx.fill();
    } else {
      ctx.strokeStyle = '#0f172a';
      ctx.lineWidth = 0.05;
      ctx.beginPath();
      ctx.arc(0, -r * 0.36, r * 0.22, Math.PI * 1.15, Math.PI * 1.85);
      ctx.stroke();
    }
  }

  private drawWorldLabel(
    ctx: CanvasRenderingContext2D,
    wx: number,
    wy: number,
    text: string,
    color: string,
    pxSize: number,
    camZoom: number,
  ): void {
    ctx.save();
    ctx.translate(wx, wy);
    // Counteract world Y-flip using live camera zoom so text stays crisp at all zoom levels
    const inv = 1 / Math.max(18, camZoom);
    ctx.scale(inv, -inv);
    ctx.font = `900 ${pxSize}px system-ui, -apple-system, sans-serif`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.strokeStyle = 'rgba(15, 23, 42, 0.92)';
    ctx.lineWidth = 4;
    ctx.strokeText(text, 0, 0);
    ctx.fillStyle = color;
    ctx.fillText(text, 0, 0);
    ctx.restore();
  }
}

export function getEnemyDisplayName(kind: EnemyKind): string {
  return ENEMY_SPECS[kind].name;
}
