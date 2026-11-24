import {
  ARENA_ROWS,
  GROUND_Y,
  PLAYER_SIZE,
  TILE,
  type Checkpoint,
  type HornEvent,
  type LevelData,
  type LevelObject,
  type MonkeyForm,
  type MonkeySkinId,
  type PlayerState,
  type RemoteMonkeyState,
} from './types';

export interface Particle {
  x: number;
  y: number;
  vx: number;
  vy: number;
  size: number;
  color: string;
  life: number;
  maxLife: number;
  rot: number;
  vrot: number;
  kind: 'shard' | 'spark' | 'banana' | 'ring';
}

export interface FloatingText {
  x: number;
  y: number;
  text: string;
  color: string;
  life: number;
  maxLife: number;
  screenSpace?: boolean;
}

export interface ViewportRect {
  x: number;
  y: number;
  w: number;
  h: number;
}

export interface RenderContextState {
  level: LevelData;
  player: PlayerState;
  cameraX: number;
  beatPulse: number;
  timeSec: number;
  shakeAmount: number;
  particles: Particle[];
  floatingTexts: FloatingText[];
  checkpoints: Checkpoint[];
  remotes: RemoteMonkeyState[];
  activeHorn: HornEvent | null;
  deathBanner: string | null;
  localColor: string;
  localName: string;
  localSkin: MonkeySkinId;
  dpr?: number;
  viewport?: ViewportRect;
  playerBadge?: string;
  zenMode?: boolean;
  hideRemotes?: boolean;
}

function drawPeanutMask(
  ctx: CanvasRenderingContext2D,
  cx: number,
  cy: number,
  rx: number,
  ry: number,
  fill: string | CanvasGradient,
): void {
  ctx.fillStyle = fill;
  ctx.beginPath();
  // Top heart/peanut brow arches dipping in the center
  ctx.moveTo(cx, cy - ry * 0.42);
  ctx.bezierCurveTo(
    cx - rx * 0.48,
    cy - ry * 1.15,
    cx - rx * 1.05,
    cy - ry * 0.62,
    cx - rx * 0.88,
    cy - ry * 0.02,
  );
  // Left cheek sweep to chin
  ctx.bezierCurveTo(
    cx - rx * 1.08,
    cy + ry * 0.52,
    cx - rx * 0.62,
    cy + ry * 1.02,
    cx,
    cy + ry * 0.96,
  );
  // Right cheek sweep up
  ctx.bezierCurveTo(
    cx + rx * 0.62,
    cy + ry * 1.02,
    cx + rx * 1.08,
    cy + ry * 0.52,
    cx + rx * 0.88,
    cy - ry * 0.02,
  );
  // Right brow arch back to center dip
  ctx.bezierCurveTo(
    cx + rx * 1.05,
    cy - ry * 0.62,
    cx + rx * 0.48,
    cy - ry * 1.15,
    cx,
    cy - ry * 0.42,
  );
  ctx.closePath();
  ctx.fill();
}

function drawMonkeyEar(
  ctx: CanvasRenderingContext2D,
  ex: number,
  ey: number,
  er: number,
  furDark: string,
  furLight: string,
  innerColor: string,
  rimColor: string,
): void {
  const grad = ctx.createRadialGradient(ex - er * 0.25, ey - er * 0.25, 1, ex, ey, er);
  grad.addColorStop(0, furLight);
  grad.addColorStop(1, furDark);
  ctx.fillStyle = grad;
  ctx.strokeStyle = rimColor;
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.arc(ex, ey, er, 0, Math.PI * 2);
  ctx.fill();
  ctx.stroke();

  ctx.fillStyle = innerColor;
  ctx.beginPath();
  ctx.arc(ex, ey + er * 0.06, er * 0.52, 0, Math.PI * 2);
  ctx.fill();
}

function drawMonkeyFaceEyes(
  ctx: CanvasRenderingContext2D,
  eyeY: number,
  spread: number,
  eyeR: number,
  lookX: number,
  lookY: number,
  blink: boolean,
  panic: boolean,
  vesgo: boolean,
  browColor: string,
): void {
  for (const side of [-1, 1] as const) {
    const ex = side * spread;
    if (blink && !panic) {
      ctx.strokeStyle = '#0f172a';
      ctx.lineWidth = 2;
      ctx.lineCap = 'round';
      ctx.beginPath();
      ctx.arc(ex, eyeY + 0.5, eyeR * 0.78, Math.PI * 1.1, Math.PI * 1.9);
      ctx.stroke();
    } else {
      // Sclera
      ctx.fillStyle = '#ffffff';
      ctx.strokeStyle = '#0f172a';
      ctx.lineWidth = 1.4;
      ctx.beginPath();
      ctx.arc(ex, eyeY, eyeR, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();

      // Pupil (vesgo gives playful crossed charm; panic makes them jittery/wide)
      const vesgoDx = vesgo ? -side * 1.3 : 0;
      const vesgoDy = vesgo ? side * 0.7 : 0;
      const px = ex + Math.max(-eyeR * 0.36, Math.min(eyeR * 0.36, lookX + vesgoDx));
      const py = eyeY + Math.max(-eyeR * 0.36, Math.min(eyeR * 0.36, lookY + vesgoDy));
      const pr = panic ? eyeR * 0.36 : eyeR * 0.46;

      ctx.fillStyle = '#0f172a';
      ctx.beginPath();
      ctx.arc(px, py, pr, 0, Math.PI * 2);
      ctx.fill();

      // Crisp specular eye highlight
      ctx.fillStyle = '#ffffff';
      ctx.beginPath();
      ctx.arc(px - pr * 0.35, py - pr * 0.35, Math.max(0.9, pr * 0.36), 0, Math.PI * 2);
      ctx.fill();
    }

    // Reactive eyebrows
    ctx.strokeStyle = browColor;
    ctx.lineWidth = 1.9;
    ctx.lineCap = 'round';
    const browLift = panic ? -2.2 : lookY < -0.5 ? -1.4 : 0;
    const tilt = panic ? side * -1.4 : side * 0.9;
    ctx.beginPath();
    ctx.moveTo(ex - eyeR * 0.7, eyeY - eyeR - 1.6 + browLift - tilt * 0.4);
    ctx.quadraticCurveTo(
      ex,
      eyeY - eyeR - 2.6 + browLift,
      ex + eyeR * 0.7,
      eyeY - eyeR - 1.4 + browLift + tilt * 0.4,
    );
    ctx.stroke();
  }
}

function drawSkinAccessory(
  ctx: CanvasRenderingContext2D,
  skin: MonkeySkinId,
  accentColor: string,
  eyeY: number,
  topY: number,
  timeSec = 0,
  panic = false,
): void {
  if (skin === 'classic') {
    // Player-colored sporty headband for instant multiplayer distinction
    ctx.fillStyle = accentColor;
    ctx.strokeStyle = '#0f172a';
    ctx.lineWidth = 1.3;
    roundRect(ctx, -15, topY + 2.5, 30, 4.5, 2.2);
    ctx.fill();
    ctx.stroke();
  } else if (skin === 'bald') {
    // Shiny bald dome specular + 3 springy hairs + sweat drop when panicking
    ctx.fillStyle = 'rgba(255, 255, 255, 0.62)';
    ctx.beginPath();
    ctx.ellipse(-5, topY + 4.5, 6.5, 2.4, -0.32, 0, Math.PI * 2);
    ctx.fill();
    const sway = Math.sin(timeSec * 12) * 1.4;
    ctx.strokeStyle = '#451a03';
    ctx.lineWidth = 1.7;
    ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.moveTo(-2, topY + 0.5);
    ctx.quadraticCurveTo(-5, topY - 7, -8 + sway, topY - 5);
    ctx.moveTo(1, topY + 0.5);
    ctx.quadraticCurveTo(1, topY - 8.5, 4 + sway, topY - 6.5);
    ctx.moveTo(4, topY + 0.5);
    ctx.quadraticCurveTo(7, topY - 6, 9 + sway, topY - 4);
    ctx.stroke();
    if (panic) {
      ctx.fillStyle = '#38bdf8';
      ctx.beginPath();
      ctx.moveTo(12, topY + 5);
      ctx.quadraticCurveTo(15, topY + 10, 12, topY + 12);
      ctx.quadraticCurveTo(9, topY + 10, 12, topY + 5);
      ctx.fill();
    }
  } else if (skin === 'shades') {
    // Cool Juliette neon sunglasses
    ctx.fillStyle = '#020617';
    ctx.strokeStyle = accentColor;
    ctx.lineWidth = 1.6;
    roundRect(ctx, -13.5, eyeY - 4.8, 12, 8.8, 2.6);
    ctx.fill();
    ctx.stroke();
    roundRect(ctx, 1.5, eyeY - 4.8, 12, 8.8, 2.6);
    ctx.fill();
    ctx.stroke();
    ctx.fillStyle = accentColor;
    ctx.fillRect(-1.5, eyeY - 2, 3, 2.2);
    // Lens glare
    ctx.strokeStyle = 'rgba(255,255,255,0.75)';
    ctx.lineWidth = 1.3;
    ctx.beginPath();
    ctx.moveTo(-10.5, eyeY + 1.2);
    ctx.lineTo(-5, eyeY - 3.2);
    ctx.moveTo(4.5, eyeY + 1.2);
    ctx.lineTo(10, eyeY - 3.2);
    ctx.stroke();
  } else if (skin === 'crown') {
    // 3D-shaded golden crown with ruby & cyan gems
    const cGrad = ctx.createLinearGradient(0, topY - 14, 0, topY + 2);
    cGrad.addColorStop(0, '#fef08a');
    cGrad.addColorStop(0.5, '#facc15');
    cGrad.addColorStop(1, '#d97706');
    ctx.fillStyle = cGrad;
    ctx.strokeStyle = '#78350f';
    ctx.lineWidth = 1.6;
    ctx.beginPath();
    ctx.moveTo(-11.5, topY + 1.5);
    ctx.lineTo(-13, topY - 10);
    ctx.lineTo(-5.5, topY - 4);
    ctx.lineTo(0, topY - 14);
    ctx.lineTo(5.5, topY - 4);
    ctx.lineTo(13, topY - 10);
    ctx.lineTo(11.5, topY + 1.5);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
    ctx.fillStyle = '#fb7185';
    ctx.beginPath();
    ctx.arc(0, topY - 3.5, 2.3, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = accentColor;
    ctx.beginPath();
    ctx.arc(-6.5, topY - 2.5, 1.4, 0, Math.PI * 2);
    ctx.arc(6.5, topY - 2.5, 1.4, 0, Math.PI * 2);
    ctx.fill();
  } else if (skin === 'neon') {
    // Cyber laser visor with animated scan dot
    ctx.save();
    ctx.shadowColor = accentColor;
    ctx.shadowBlur = 10;
    ctx.fillStyle = '#020617';
    ctx.strokeStyle = accentColor;
    ctx.lineWidth = 1.5;
    roundRect(ctx, -13.5, eyeY - 4, 27, 7.5, 3.5);
    ctx.fill();
    ctx.stroke();
    ctx.fillStyle = accentColor;
    roundRect(ctx, -11, eyeY - 2, 22, 3.5, 1.8);
    ctx.fill();
    const scanX = Math.sin(timeSec * 7) * 7.5;
    ctx.fillStyle = '#ffffff';
    ctx.beginPath();
    ctx.arc(scanX, eyeY - 0.2, 1.6, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }
}

export function drawMonkeySprite(
  ctx: CanvasRenderingContext2D,
  cx: number,
  cy: number,
  rot: number,
  form: MonkeyForm,
  grav: 1 | -1,
  scaleX: number,
  scaleY: number,
  accentColor: string,
  vy: number,
  alpha = 1,
  skin: MonkeySkinId = 'classic',
  timeSec = 0,
): void {
  ctx.save();
  ctx.globalAlpha = alpha;
  ctx.translate(cx, cy);
  ctx.rotate(rot);
  ctx.scale(scaleX, scaleY * (form !== 'cube' && form !== 'ball' && grav === -1 ? -1 : 1));

  const panic = Math.abs(vy) > 480;
  const blink = (timeSec + Math.abs(cx) * 0.002) % 3.8 > 3.66;
  const lookY = Math.max(-1.6, Math.min(1.6, vy * 0.003));
  const lookX = 1.1;
  const isNeon = skin === 'neon';
  const furLight = isNeon ? '#334155' : skin === 'bald' ? '#d97706' : '#b45309';
  const furDark = isNeon ? '#0f172a' : skin === 'bald' ? '#92400e' : '#78350f';
  const innerEar = isNeon ? accentColor : '#fda4af';

  if (form === 'cube') {
    const r = PLAYER_SIZE / 2;

    // Curved tail with secondary motion behind the cube
    const wag = Math.sin(timeSec * 12) * 3.5 + Math.max(-6, Math.min(6, vy * 0.01));
    ctx.save();
    ctx.strokeStyle = furDark;
    ctx.lineWidth = 4.6;
    ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.moveTo(-r + 2, 6);
    ctx.bezierCurveTo(-r - 10, 4 + wag * 0.5, -r - 12, -10 + wag, -r - 5, -13 + wag);
    ctx.stroke();
    ctx.strokeStyle = accentColor;
    ctx.lineWidth = 1.5;
    ctx.stroke();
    ctx.restore();

    // Big ears with rosy inner ear & neon rim
    drawMonkeyEar(ctx, -r - 3, -3, 6.8, furDark, furLight, innerEar, accentColor);
    drawMonkeyEar(ctx, r + 3, -3, 6.8, furDark, furLight, innerEar, accentColor);

    // Cube body with radial fur gradient & neon glow
    ctx.shadowColor = accentColor;
    ctx.shadowBlur = 12;
    const bodyGrad = ctx.createLinearGradient(0, -r, 0, r);
    bodyGrad.addColorStop(0, furLight);
    bodyGrad.addColorStop(1, furDark);
    ctx.fillStyle = bodyGrad;
    ctx.strokeStyle = accentColor;
    ctx.lineWidth = 2.8;
    roundRect(ctx, -r, -r, PLAYER_SIZE, PLAYER_SIZE, 8);
    ctx.fill();
    ctx.stroke();
    ctx.shadowBlur = 0;

    // Hair tuft on top (when not bald/crown)
    if (skin !== 'bald' && skin !== 'crown') {
      ctx.fillStyle = furLight;
      ctx.strokeStyle = accentColor;
      ctx.lineWidth = 1.6;
      ctx.beginPath();
      ctx.moveTo(-4, -r + 1);
      ctx.quadraticCurveTo(-1, -r - 6, 3, -r - 3);
      ctx.quadraticCurveTo(2, -r + 1, 5, -r + 1);
      ctx.closePath();
      ctx.fill();
      ctx.stroke();
    }

    // Heart / Peanut face mask with gradient
    const maskGrad = ctx.createLinearGradient(0, -10, 0, r - 2);
    if (isNeon) {
      maskGrad.addColorStop(0, '#1e293b');
      maskGrad.addColorStop(1, '#0f172a');
    } else {
      maskGrad.addColorStop(0, '#fef3c7');
      maskGrad.addColorStop(1, '#fcd34d');
    }
    drawPeanutMask(ctx, 0, 2, 13.5, 11.5, maskGrad);

    // Cute nostrils
    ctx.fillStyle = isNeon ? accentColor : '#92400e';
    ctx.beginPath();
    ctx.arc(-2, 2.2, 1, 0, Math.PI * 2);
    ctx.arc(2, 2.2, 1, 0, Math.PI * 2);
    ctx.fill();

    // Expressive eyes with highlight + blink + eyebrows
    drawMonkeyFaceEyes(
      ctx,
      -5.5,
      6.2,
      4.9,
      lookX,
      lookY,
      blink,
      panic,
      skin === 'classic',
      isNeon ? accentColor : '#451a03',
    );

    // Expressive Mouth
    if (panic) {
      ctx.fillStyle = '#7f1d1d';
      ctx.strokeStyle = '#0f172a';
      ctx.lineWidth = 1.4;
      ctx.beginPath();
      ctx.ellipse(0, 8.8, 5.2, 4.4, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();
      ctx.fillStyle = '#fb7185';
      ctx.beginPath();
      ctx.ellipse(0, 10.6, 3, 1.8, 0, 0, Math.PI * 2);
      ctx.fill();
    } else if (skin === 'shades') {
      ctx.strokeStyle = '#7f1d1d';
      ctx.lineWidth = 2;
      ctx.lineCap = 'round';
      ctx.beginPath();
      ctx.moveTo(-4.5, 8);
      ctx.quadraticCurveTo(1, 10.5, 6.5, 6.2);
      ctx.stroke();
    } else {
      ctx.fillStyle = '#991b1b';
      ctx.strokeStyle = '#0f172a';
      ctx.lineWidth = 1.2;
      ctx.beginPath();
      ctx.arc(0, 5.5, 6.6, 0.12, Math.PI - 0.12);
      ctx.closePath();
      ctx.fill();
      ctx.stroke();
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(-3.4, 5.8, 6.8, 2.2);
      ctx.fillStyle = '#fb7185';
      ctx.beginPath();
      ctx.arc(0, 10, 2.6, Math.PI, 0);
      ctx.fill();
    }

    drawSkinAccessory(ctx, skin, accentColor, -5.5, -r, timeSec, panic);
  } else if (form === 'ball') {
    const r = PLAYER_SIZE / 2;
    ctx.save();
    // Outer spiked wheel ring with gradient & neon edge
    ctx.shadowColor = accentColor;
    ctx.shadowBlur = 14;
    const gearGrad = ctx.createRadialGradient(0, 0, r * 0.4, 0, 0, r + 2);
    gearGrad.addColorStop(0, furLight);
    gearGrad.addColorStop(1, isNeon ? '#1e1b4b' : '#451a03');
    ctx.fillStyle = gearGrad;
    ctx.strokeStyle = accentColor;
    ctx.lineWidth = 2.8;
    ctx.beginPath();
    const teeth = 8;
    for (let i = 0; i < teeth * 2; i++) {
      const ang = (i * Math.PI) / teeth;
      const rad = i % 2 === 0 ? r + 2.5 : r - 3;
      const px = Math.cos(ang) * rad;
      const py = Math.sin(ang) * rad;
      if (i === 0) ctx.moveTo(px, py);
      else ctx.lineTo(px, py);
    }
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
    ctx.shadowBlur = 0;

    // Inner monkey medallion
    ctx.fillStyle = furDark;
    ctx.beginPath();
    ctx.arc(0, 0, r - 4, 0, Math.PI * 2);
    ctx.fill();

    // Peanut mask inside ball
    drawPeanutMask(ctx, 0, 1.5, 10.5, 9, isNeon ? '#1e293b' : '#fde68a');

    drawMonkeyFaceEyes(
      ctx,
      -2.4,
      4.5,
      3.7,
      lookX * 0.8,
      lookY * 0.8,
      blink,
      panic,
      skin === 'classic',
      isNeon ? accentColor : '#451a03',
    );

    ctx.fillStyle = '#991b1b';
    ctx.beginPath();
    if (panic) {
      ctx.ellipse(0, 5.2, 3.6, 3, 0, 0, Math.PI * 2);
    } else {
      ctx.arc(0, 4.2, 4.6, 0.1, Math.PI - 0.1);
    }
    ctx.fill();

    drawSkinAccessory(ctx, skin, accentColor, -2.4, -r + 2, timeSec, panic);
    ctx.restore();
  } else if (form === 'ship') {
    // Plasma thruster flame
    const flicker = 0.82 + Math.sin(timeSec * 45) * 0.22;
    ctx.fillStyle = '#f97316';
    ctx.beginPath();
    ctx.moveTo(-16, 1);
    ctx.lineTo(-30 * flicker, 5.5);
    ctx.lineTo(-16, 10);
    ctx.closePath();
    ctx.fill();
    ctx.fillStyle = '#fef08a';
    ctx.beginPath();
    ctx.moveTo(-16, 3);
    ctx.lineTo(-23 * flicker, 5.5);
    ctx.lineTo(-16, 8);
    ctx.closePath();
    ctx.fill();

    // Fluttering monkey tail/scarf behind cockpit
    const flap = Math.sin(timeSec * 18) * 3.5;
    ctx.strokeStyle = accentColor;
    ctx.lineWidth = 3.2;
    ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.moveTo(-5, -2);
    ctx.quadraticCurveTo(-15, -6 + flap, -23, -2 - flap * 0.6);
    ctx.stroke();

    // Monkey pilot sitting inside rocket
    drawMonkeyEar(ctx, -7, -6, 4.2, furDark, furLight, innerEar, accentColor);
    drawMonkeyEar(ctx, 7, -6, 4.2, furDark, furLight, innerEar, accentColor);
    const pGrad = ctx.createRadialGradient(-2, -6, 1, 0, -4, 10);
    pGrad.addColorStop(0, furLight);
    pGrad.addColorStop(1, furDark);
    ctx.fillStyle = pGrad;
    ctx.strokeStyle = '#0f172a';
    ctx.lineWidth = 1.6;
    ctx.beginPath();
    ctx.arc(0, -4, 9.5, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();

    drawPeanutMask(ctx, 1, -2.5, 7, 5.5, isNeon ? '#1e293b' : '#fde68a');
    drawMonkeyFaceEyes(ctx, -5, 3.3, 2.8, 1, lookY * 0.6, blink, panic, false, '#451a03');

    if (skin === 'crown' || skin === 'bald' || skin === 'neon') {
      drawSkinAccessory(ctx, skin, accentColor, -5, -13, timeSec, panic);
    } else {
      // Pilot aviator goggles rim
      ctx.strokeStyle = skin === 'shades' ? accentColor : '#38bdf8';
      ctx.lineWidth = 1.5;
      ctx.strokeRect(-5.5, -8, 12, 5.5);
    }

    // Banana Rocket Hull with metallic gradient
    ctx.shadowColor = accentColor;
    ctx.shadowBlur = 12;
    const hullGrad = ctx.createLinearGradient(0, 0, 0, 16);
    hullGrad.addColorStop(0, '#fef08a');
    hullGrad.addColorStop(0.55, '#facc15');
    hullGrad.addColorStop(1, '#ca8a04');
    ctx.fillStyle = hullGrad;
    ctx.strokeStyle = accentColor;
    ctx.lineWidth = 2.4;
    ctx.beginPath();
    ctx.moveTo(-18, 3);
    ctx.quadraticCurveTo(0, 17.5, 21, 3.5);
    ctx.quadraticCurveTo(6, 5.5, -18, 3);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
    ctx.shadowBlur = 0;

    // Accent racing stripe on hull
    ctx.strokeStyle = accentColor;
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(-11, 7.5);
    ctx.quadraticCurveTo(1, 11.5, 14, 6.5);
    ctx.stroke();
  } else {
    // Wave cyber-chimp dart with monkey ear fins & cockpit eye mask
    ctx.shadowColor = accentColor;
    ctx.shadowBlur = 14;

    // Ear-fins
    ctx.fillStyle = furDark;
    ctx.strokeStyle = accentColor;
    ctx.lineWidth = 1.8;
    ctx.beginPath();
    ctx.arc(-4, -9, 5, 0, Math.PI * 2);
    ctx.arc(-4, 9, 5, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();

    const dartGrad = ctx.createLinearGradient(-13, 0, 18, 0);
    dartGrad.addColorStop(0, furDark);
    dartGrad.addColorStop(0.55, accentColor);
    dartGrad.addColorStop(1, '#ffffff');
    ctx.fillStyle = dartGrad;
    ctx.strokeStyle = '#ffffff';
    ctx.lineWidth = 2.1;
    ctx.beginPath();
    ctx.moveTo(19, 0);
    ctx.lineTo(-13, -12.5);
    ctx.lineTo(-7, 0);
    ctx.lineTo(-13, 12.5);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
    ctx.shadowBlur = 0;

    // Peanut visor canopy + glowing eye with highlight
    ctx.fillStyle = '#0f172a';
    ctx.beginPath();
    ctx.ellipse(1, 0, 7.5, 5.5, 0, 0, Math.PI * 2);
    ctx.fill();

    ctx.fillStyle = '#ffffff';
    ctx.beginPath();
    ctx.arc(2.5, 0, 3.8, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#0f172a';
    ctx.beginPath();
    ctx.arc(3.8, lookY * 0.5, 1.9, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#ffffff';
    ctx.beginPath();
    ctx.arc(3.1, lookY * 0.5 - 0.8, 0.8, 0, Math.PI * 2);
    ctx.fill();

    if (skin === 'crown') {
      drawSkinAccessory(ctx, 'crown', accentColor, 0, -10, timeSec, panic);
    }
  }

  ctx.restore();
}

export function drawObject(
  ctx: CanvasRenderingContext2D,
  obj: LevelObject,
  wx: number,
  wy: number,
  beatPulse: number,
  timeSec: number,
  colorPrimary: string,
  colorSecondary: string,
  collected: boolean,
  drawPortalBeam = false,
): void {
  switch (obj.type) {
    case 'block': {
      ctx.fillStyle = '#0f172a';
      ctx.fillRect(wx, wy, TILE, TILE);
      ctx.strokeStyle = colorPrimary;
      ctx.lineWidth = 2 + beatPulse * 1.2;
      ctx.strokeRect(wx + 1, wy + 1, TILE - 2, TILE - 2);
      ctx.fillStyle = colorPrimary;
      ctx.globalAlpha = 0.14 + beatPulse * 0.24;
      ctx.fillRect(wx + 6, wy + 6, TILE - 12, TILE - 12);
      ctx.globalAlpha = 1;
      break;
    }
    case 'spike': {
      ctx.save();
      ctx.shadowColor = '#fb7185';
      ctx.shadowBlur = 8 + beatPulse * 7;
      ctx.fillStyle = '#291510';
      ctx.strokeStyle = '#fb7185';
      ctx.lineWidth = 2.4;
      ctx.beginPath();
      ctx.moveTo(wx + 3, wy + TILE);
      ctx.lineTo(wx + TILE / 2, wy + 4);
      ctx.lineTo(wx + TILE - 3, wy + TILE);
      ctx.closePath();
      ctx.fill();
      ctx.stroke();
      // Coconut dots
      ctx.shadowBlur = 0;
      ctx.fillStyle = '#fda4af';
      ctx.beginPath();
      ctx.arc(wx + TILE / 2 - 3, wy + 29, 1.8, 0, Math.PI * 2);
      ctx.arc(wx + TILE / 2 + 3, wy + 29, 1.8, 0, Math.PI * 2);
      ctx.arc(wx + TILE / 2, wy + 24, 1.8, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
      break;
    }
    case 'spike_down': {
      ctx.save();
      ctx.shadowColor = '#fb7185';
      ctx.shadowBlur = 8 + beatPulse * 7;
      ctx.fillStyle = '#291510';
      ctx.strokeStyle = '#fb7185';
      ctx.lineWidth = 2.4;
      ctx.beginPath();
      ctx.moveTo(wx + 3, wy);
      ctx.lineTo(wx + TILE / 2, wy + TILE - 4);
      ctx.lineTo(wx + TILE - 3, wy);
      ctx.closePath();
      ctx.fill();
      ctx.stroke();
      ctx.restore();
      break;
    }
    case 'pad_yellow': {
      ctx.save();
      ctx.shadowColor = '#facc15';
      ctx.shadowBlur = 12 + beatPulse * 6;
      ctx.fillStyle = '#facc15';
      ctx.beginPath();
      ctx.ellipse(wx + TILE / 2, wy + TILE - 4, 16, 7 + beatPulse * 2.5, 0, Math.PI, 0);
      ctx.fill();
      ctx.strokeStyle = '#fef9c3';
      ctx.lineWidth = 2;
      ctx.stroke();
      ctx.restore();
      break;
    }
    case 'pad_gravity': {
      ctx.save();
      ctx.shadowColor = '#38bdf8';
      ctx.shadowBlur = 12 + beatPulse * 6;
      ctx.fillStyle = '#38bdf8';
      ctx.beginPath();
      ctx.ellipse(wx + TILE / 2, wy + TILE - 4, 16, 7 + beatPulse * 2.5, 0, Math.PI, 0);
      ctx.fill();
      ctx.strokeStyle = '#e0f2fe';
      ctx.lineWidth = 2;
      ctx.stroke();
      ctx.restore();
      break;
    }
    case 'orb_yellow':
    case 'orb_blue': {
      const isBlue = obj.type === 'orb_blue';
      const c = isBlue ? '#38bdf8' : '#facc15';
      const cx = wx + TILE / 2;
      const cy = wy + TILE / 2;
      const r = 13 + beatPulse * 3.5;
      ctx.save();
      ctx.shadowColor = c;
      ctx.shadowBlur = 14 + beatPulse * 6;
      ctx.strokeStyle = c;
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.arc(cx, cy, r, 0, Math.PI * 2);
      ctx.stroke();
      ctx.fillStyle = isBlue ? '#bae6fd' : '#fef08a';
      ctx.beginPath();
      ctx.arc(cx, cy, 6.5, 0, Math.PI * 2);
      ctx.fill();
      // Rotating outer dashes
      ctx.translate(cx, cy);
      ctx.rotate(timeSec * 3);
      ctx.setLineDash([5, 5]);
      ctx.beginPath();
      ctx.arc(0, 0, r + 5, 0, Math.PI * 2);
      ctx.stroke();
      ctx.restore();
      break;
    }
    case 'banana': {
      if (collected) return;
      const cx = wx + TILE / 2;
      const cy = wy + TILE / 2 + Math.sin(timeSec * 5 + obj.gx) * 4;
      ctx.save();
      ctx.translate(cx, cy);
      ctx.rotate(Math.sin(timeSec * 3 + obj.gx) * 0.25);
      ctx.shadowColor = '#facc15';
      ctx.shadowBlur = 14;
      ctx.fillStyle = '#fde047';
      ctx.strokeStyle = '#ca8a04';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(0, 0, 12, 0.3, Math.PI - 0.1);
      ctx.quadraticCurveTo(0, 3, 11, 3.5);
      ctx.closePath();
      ctx.fill();
      ctx.stroke();
      ctx.restore();
      break;
    }
    default: {
      if (obj.type.startsWith('portal_')) {
        let color = colorSecondary;
        let label = 'PORTAL';
        if (obj.type === 'portal_cube') {
          color = '#4ade80';
          label = 'CUBO';
        } else if (obj.type === 'portal_ship') {
          color = '#f43f5e';
          label = 'NAVE';
        } else if (obj.type === 'portal_wave') {
          color = '#22d3ee';
          label = 'WAVE';
        } else if (obj.type === 'portal_ball') {
          color = '#c084fc';
          label = 'BOLA';
        } else if (obj.type === 'portal_grav_inv') {
          color = '#38bdf8';
          label = 'GRAV ↑';
        } else if (obj.type === 'portal_grav_norm') {
          color = '#facc15';
          label = 'GRAV ↓';
        } else if (obj.type === 'portal_speed_norm') {
          color = '#4ade80';
          label = '1x';
        } else if (obj.type === 'portal_speed_fast') {
          color = '#facc15';
          label = '1.3x';
        } else if (obj.type === 'portal_speed_turbo') {
          color = '#fb7185';
          label = '1.5x';
        }
        const cx = wx + TILE / 2;
        const cy = wy + TILE / 2;
        ctx.save();

        // Subtle vertical neon gate beam across column so unskippable portal gate is visually obvious
        if (drawPortalBeam) {
          ctx.strokeStyle = color;
          ctx.globalAlpha = 0.22 + beatPulse * 0.12;
          ctx.lineWidth = 4;
          ctx.setLineDash([8, 8]);
          ctx.beginPath();
          ctx.moveTo(cx, 0);
          ctx.lineTo(cx, GROUND_Y);
          ctx.stroke();
          ctx.setLineDash([]);
          ctx.globalAlpha = 1;
        }

        ctx.shadowColor = color;
        ctx.shadowBlur = 16 + beatPulse * 8;
        ctx.strokeStyle = color;
        ctx.lineWidth = 4;
        ctx.beginPath();
        ctx.ellipse(cx, cy, 14 + beatPulse * 2.5, 46, 0, 0, Math.PI * 2);
        ctx.stroke();

        ctx.fillStyle = color;
        ctx.globalAlpha = 0.22 + beatPulse * 0.18;
        ctx.fill();
        ctx.globalAlpha = 1;

        ctx.font = '900 10px system-ui, sans-serif';
        ctx.textAlign = 'center';
        ctx.fillStyle = '#ffffff';
        ctx.fillText(label, cx, cy - 52);
        ctx.restore();
      }
    }
  }
}

function drawJungleSilhouettes(
  ctx: CanvasRenderingContext2D,
  viewW: number,
  floorY: number,
  cameraX: number,
  beatPulse: number,
  accent: string,
): void {
  // Distant hills pulsing subtly with BPM
  ctx.save();
  const hillSpan = 260;
  const hillOffset = (cameraX * 0.12) % hillSpan;
  ctx.fillStyle = '#020617';
  ctx.globalAlpha = 0.42;
  ctx.beginPath();
  ctx.moveTo(-hillSpan, floorY);
  for (let x = -hillSpan; x <= viewW + hillSpan; x += hillSpan) {
    const drawX = x - hillOffset;
    const peak = 55 + beatPulse * 14;
    ctx.quadraticCurveTo(drawX + hillSpan * 0.5, floorY - peak, drawX + hillSpan, floorY);
  }
  ctx.lineTo(viewW + hillSpan, floorY);
  ctx.closePath();
  ctx.fill();

  // Neon-rimmed palm tree silhouettes
  const palmSpacing = 320;
  const palmOffset = (cameraX * 0.24) % palmSpacing;
  const sway = Math.sin(cameraX * 0.004) * 4 + beatPulse * 5;
  for (let px = -palmSpacing; px < viewW + palmSpacing; px += palmSpacing) {
    const idx = Math.floor((px + cameraX * 0.24) / palmSpacing);
    const x = px - palmOffset + 80;
    const h = 115 + (Math.abs(idx * 37) % 55) + beatPulse * 8;
    const topY = floorY - h;

    ctx.globalAlpha = 0.34 + beatPulse * 0.14;
    ctx.fillStyle = '#020617';
    ctx.strokeStyle = accent;
    ctx.lineWidth = 1.4;

    // Trunk
    ctx.beginPath();
    ctx.moveTo(x - 6, floorY);
    ctx.quadraticCurveTo(x + sway * 0.4, floorY - h * 0.5, x + sway, topY);
    ctx.lineTo(x + sway + 7, topY);
    ctx.quadraticCurveTo(x + sway * 0.4 + 9, floorY - h * 0.5, x + 7, floorY);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();

    // Fronds
    const cx = x + sway + 3;
    const frondAngles = [-2.5, -1.9, -1.1, -0.4, 0.35];
    for (const ang of frondAngles) {
      const fx = cx + Math.cos(ang) * (44 + beatPulse * 6);
      const fy = topY + Math.sin(ang) * (28 + beatPulse * 4) + 12;
      ctx.beginPath();
      ctx.moveTo(cx, topY);
      ctx.quadraticCurveTo((cx + fx) * 0.5, topY - 18, fx, fy);
      ctx.quadraticCurveTo((cx + fx) * 0.5, topY + 2, cx, topY);
      ctx.fill();
      ctx.stroke();
    }
  }
  ctx.restore();
}

export function renderGameFrame(
  ctx: CanvasRenderingContext2D,
  canvasW: number,
  canvasH: number,
  state: RenderContextState,
): void {
  const {
    level,
    player,
    cameraX,
    beatPulse,
    timeSec,
    shakeAmount,
    particles,
    floatingTexts,
    checkpoints,
    remotes,
    activeHorn,
    deathBanner,
    localColor,
    localSkin,
    dpr = 1,
    viewport,
    playerBadge,
    zenMode = false,
    hideRemotes = false,
  } = state;

  const cssW = canvasW / dpr;
  const cssH = canvasH / dpr;
  const vp = viewport ?? { x: 0, y: 0, w: cssW, h: cssH };

  ctx.save();
  ctx.scale(dpr, dpr);

  // Clip to viewport (enables crisp horizontal 2P split-screen!)
  ctx.beginPath();
  ctx.rect(vp.x, vp.y, vp.w, vp.h);
  ctx.clip();
  ctx.translate(vp.x, vp.y);

  // Compute clean scale in CSS pixels so 12 tiles + floor margin fits nicely on any viewport & DPR
  const worldSpanY = GROUND_Y + (viewport ? 80 : 130);
  const scale = Math.max(0.38, Math.min(vp.h / worldSpanY, 1.55));
  const viewW = vp.w / scale;
  const viewH = vp.h / scale;
  const floorOffsetY = Math.max(24, (viewH - GROUND_Y) * 0.52);

  // Sky Background
  const skyGrad = ctx.createLinearGradient(0, 0, 0, vp.h);
  skyGrad.addColorStop(0, level.bgTop);
  skyGrad.addColorStop(1, level.bgBottom);
  ctx.fillStyle = skyGrad;
  ctx.fillRect(0, 0, vp.w, vp.h);

  // BPM pulse flash on background
  if (beatPulse > 0.01) {
    ctx.fillStyle = level.colorPrimary;
    ctx.globalAlpha = beatPulse * 0.11;
    ctx.fillRect(0, 0, vp.w, vp.h);
    ctx.globalAlpha = 1;
  }

  ctx.save();
  ctx.scale(scale, scale);

  // Screen shake
  if (shakeAmount > 0.2) {
    const sx = (Math.random() - 0.5) * shakeAmount * 2;
    const sy = (Math.random() - 0.5) * shakeAmount * 2;
    ctx.translate(sx, sy);
  }

  // Parallax Jungle Moon pulsing on BPM
  const moonX = viewW * 0.78 - (cameraX * 0.03) % 240;
  ctx.save();
  ctx.globalAlpha = 0.22 + beatPulse * 0.18;
  ctx.shadowColor = '#fde047';
  ctx.shadowBlur = 18 + beatPulse * 18;
  ctx.fillStyle = '#fde047';
  ctx.beginPath();
  ctx.arc(moonX, 85, 38 + beatPulse * 7, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();

  // Parallax Equalizer bars
  const barW = 36;
  const barSpacing = 52;
  const eqOffset = (cameraX * 0.18) % barSpacing;
  ctx.fillStyle = level.colorSecondary;
  for (let bx = -barSpacing; bx < viewW + barSpacing; bx += barSpacing) {
    const idx = Math.floor((bx + cameraX * 0.18) / barSpacing);
    const h = 40 + Math.abs(Math.sin(idx * 1.7 + timeSec * 2)) * 75 + beatPulse * 48;
    ctx.globalAlpha = 0.13 + beatPulse * 0.09;
    ctx.fillRect(bx - eqOffset, floorOffsetY + GROUND_Y - h, barW, h);
  }
  ctx.globalAlpha = 1;

  // Parallax Jungle Silhouettes pulsing with beat
  drawJungleSilhouettes(ctx, viewW, floorOffsetY + GROUND_Y, cameraX, beatPulse, level.colorPrimary);

  // Parallax background grid
  ctx.strokeStyle = level.colorPrimary;
  ctx.globalAlpha = 0.08 + beatPulse * 0.07;
  ctx.lineWidth = 1;
  const gridStep = TILE * 2;
  const gxStart = -((cameraX * 0.35) % gridStep);
  for (let x = gxStart; x < viewW; x += gridStep) {
    ctx.beginPath();
    ctx.moveTo(x, 0);
    ctx.lineTo(x, floorOffsetY + GROUND_Y);
    ctx.stroke();
  }
  for (let y = floorOffsetY; y >= 0; y -= gridStep) {
    ctx.beginPath();
    ctx.moveTo(0, y);
    ctx.lineTo(viewW, y);
    ctx.stroke();
  }
  ctx.globalAlpha = 1;

  // World Space Transform
  ctx.save();
  ctx.translate(-cameraX, floorOffsetY);

  // Neon Floor & Ceiling Rails
  const floorStart = Math.floor(cameraX / TILE) * TILE - TILE;
  const floorEnd = cameraX + viewW + TILE * 2;

  ctx.fillStyle = '#030712';
  ctx.fillRect(floorStart, GROUND_Y, floorEnd - floorStart, viewH - floorOffsetY - GROUND_Y + 200);
  ctx.fillRect(floorStart, -200, floorEnd - floorStart, 200);

  // Floor Grid Stripes
  ctx.strokeStyle = level.colorPrimary;
  ctx.globalAlpha = 0.25 + beatPulse * 0.18;
  ctx.lineWidth = 1.5;
  for (let fx = floorStart; fx < floorEnd; fx += TILE) {
    ctx.beginPath();
    ctx.moveTo(fx, GROUND_Y);
    ctx.lineTo(fx - 26, GROUND_Y + 90);
    ctx.stroke();
  }
  ctx.globalAlpha = 1;

  // Glowing floor & ceiling lines
  ctx.shadowColor = level.colorPrimary;
  ctx.shadowBlur = 12 + beatPulse * 14;
  ctx.strokeStyle = level.colorPrimary;
  ctx.lineWidth = 4;
  ctx.beginPath();
  ctx.moveTo(floorStart, GROUND_Y);
  ctx.lineTo(floorEnd, GROUND_Y);
  ctx.stroke();

  ctx.lineWidth = 2.5;
  ctx.globalAlpha =
    player.form === 'ship' || player.form === 'wave' || player.form === 'ball' || player.grav === -1
      ? 0.9
      : 0.35;
  ctx.beginPath();
  ctx.moveTo(floorStart, 0);
  ctx.lineTo(floorEnd, 0);
  ctx.stroke();
  ctx.globalAlpha = 1;
  ctx.shadowBlur = 0;

  // Finish Line Gate
  const finishX = level.lengthTiles * TILE;
  if (finishX >= floorStart - 100 && finishX <= floorEnd + 100) {
    ctx.save();
    ctx.shadowColor = '#facc15';
    ctx.shadowBlur = 24;
    ctx.fillStyle = 'rgba(250, 204, 21, 0.22)';
    ctx.fillRect(finishX, 0, 26, GROUND_Y);
    ctx.strokeStyle = '#fde047';
    ctx.lineWidth = 4;
    ctx.strokeRect(finishX, 0, 26, GROUND_Y);
    ctx.font = '900 18px system-ui, sans-serif';
    ctx.fillStyle = '#fef08a';
    ctx.textAlign = 'center';
    ctx.fillText('🏁 BANANA FINAL!', finishX + 13, 36);
    ctx.restore();
  }

  // Practice Checkpoints
  for (const cp of checkpoints) {
    if (cp.x < floorStart - 40 || cp.x > floorEnd + 40) continue;
    ctx.save();
    ctx.translate(cp.x + PLAYER_SIZE / 2, cp.y + PLAYER_SIZE / 2);
    ctx.rotate(timeSec * 2);
    ctx.fillStyle = '#4ade80';
    ctx.strokeStyle = '#ffffff';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(0, -13);
    ctx.lineTo(10, 0);
    ctx.lineTo(0, 13);
    ctx.lineTo(-10, 0);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
    ctx.restore();
  }

  // Level Objects (culling visible x range)
  const minVisGx = Math.floor((cameraX - TILE * 2) / TILE);
  const maxVisGx = Math.ceil((cameraX + viewW + TILE * 2) / TILE);
  for (let i = 0; i < level.objects.length; i++) {
    const obj = level.objects[i];
    if (obj.gx < minVisGx || obj.gx > maxVisGx) continue;
    const wx = obj.gx * TILE;
    const wy = GROUND_Y - (obj.gy + 1) * TILE;
    drawObject(
      ctx,
      obj,
      wx,
      wy,
      beatPulse,
      timeSec,
      level.colorPrimary,
      level.colorSecondary,
      player.collectedBananas.has(i),
      true,
    );
  }

  // Remote Multiplayer Monkeys (live on track!)
  if (!hideRemotes) {
    for (const r of remotes) {
      if (r.levelId !== level.id || !r.alive) continue;
      if (r.x < cameraX - 150 || r.x > cameraX + viewW + 150) continue;

      if (r.trail.length > 1) {
        ctx.save();
        ctx.strokeStyle = r.color;
        ctx.globalAlpha = 0.25;
        ctx.lineWidth = 6;
        ctx.lineCap = 'round';
        ctx.beginPath();
        r.trail.forEach((pt, idx) => {
          if (idx === 0) ctx.moveTo(pt.x, pt.y);
          else ctx.lineTo(pt.x, pt.y);
        });
        ctx.stroke();
        ctx.restore();
      }

      drawMonkeySprite(
        ctx,
        r.x + PLAYER_SIZE / 2,
        r.y + PLAYER_SIZE / 2,
        r.rot,
        r.form,
        r.grav,
        1,
        1,
        r.color,
        0,
        0.74,
        r.skin,
        timeSec,
      );

      // Nameplate
      ctx.save();
      ctx.font = '800 11px system-ui, sans-serif';
      ctx.textAlign = 'center';
      ctx.fillStyle = r.color;
      ctx.fillText(`${r.name} (${Math.floor(r.pct)}%)`, r.x + PLAYER_SIZE / 2, r.y - 10);
      ctx.restore();
    }
  }

  // Local Player Trail
  if (player.alive) {
    if (player.form === 'wave' && player.waveTrail.length > 1) {
      ctx.save();
      ctx.shadowColor = localColor;
      ctx.shadowBlur = 14;
      ctx.strokeStyle = localColor;
      ctx.lineWidth = 8;
      ctx.lineCap = 'round';
      ctx.lineJoin = 'round';
      ctx.beginPath();
      player.waveTrail.forEach((pt, idx) => {
        if (idx === 0) ctx.moveTo(pt.x, pt.y);
        else ctx.lineTo(pt.x, pt.y);
      });
      ctx.stroke();
      ctx.strokeStyle = '#ffffff';
      ctx.lineWidth = 3;
      ctx.stroke();
      ctx.restore();
    } else if (player.trail.length > 1) {
      for (let i = 0; i < player.trail.length; i++) {
        const t = player.trail[i];
        const frac = (i + 1) / player.trail.length;
        ctx.fillStyle = localColor;
        ctx.globalAlpha = frac * 0.32;
        const sz = 11 * frac;
        if (t.form === 'ball') {
          ctx.beginPath();
          ctx.arc(t.x, t.y, sz * 0.65, 0, Math.PI * 2);
          ctx.fill();
        } else {
          ctx.fillRect(t.x - sz / 2, t.y - sz / 2, sz, sz);
        }
      }
      ctx.globalAlpha = 1;
    }

    drawMonkeySprite(
      ctx,
      player.x + PLAYER_SIZE / 2,
      player.y + PLAYER_SIZE / 2,
      player.rot,
      player.form,
      player.grav,
      player.scaleX,
      player.scaleY,
      localColor,
      player.vy,
      1,
      localSkin,
      timeSec,
    );
  }

  // Particles (explosions, ship sparks, bananas, portal rings)
  for (const p of particles) {
    const alpha = Math.max(0, p.life / p.maxLife);
    ctx.save();
    ctx.globalAlpha = alpha;
    ctx.translate(p.x, p.y);
    ctx.rotate(p.rot);
    if (p.kind === 'ring') {
      const progress = 1 - alpha;
      ctx.strokeStyle = p.color;
      ctx.lineWidth = Math.max(1.5, 5 * alpha);
      ctx.shadowColor = p.color;
      ctx.shadowBlur = 12;
      ctx.beginPath();
      ctx.arc(0, 0, p.size + progress * 68, 0, Math.PI * 2);
      ctx.stroke();
    } else if (p.kind === 'banana') {
      ctx.fillStyle = p.color;
      ctx.beginPath();
      ctx.arc(0, 0, p.size, 0.3, Math.PI);
      ctx.fill();
    } else {
      ctx.fillStyle = p.color;
      ctx.fillRect(-p.size / 2, -p.size / 2, p.size, p.size);
    }
    ctx.restore();
  }

  // World-space floating texts
  for (const ft of floatingTexts) {
    if (ft.screenSpace) continue;
    const alpha = Math.min(1, ft.life / ft.maxLife + 0.25);
    ctx.save();
    ctx.globalAlpha = alpha;
    ctx.font = '900 15px system-ui, sans-serif';
    ctx.textAlign = 'center';
    ctx.fillStyle = '#0f172a';
    ctx.fillText(ft.text, ft.x + 2, ft.y + 2);
    ctx.fillStyle = ft.color;
    ctx.fillText(ft.text, ft.x, ft.y);
    ctx.restore();
  }

  ctx.restore(); // end world transform

  // Split-screen player badge
  if (playerBadge) {
    ctx.save();
    ctx.font = '900 14px system-ui, sans-serif';
    const bw = ctx.measureText(playerBadge).width + 20;
    ctx.fillStyle = 'rgba(15, 23, 42, 0.85)';
    ctx.strokeStyle = localColor;
    ctx.lineWidth = 2;
    roundRect(ctx, 14, 14, bw, 28, 10);
    ctx.fill();
    ctx.stroke();
    ctx.fillStyle = localColor;
    ctx.fillText(playerBadge, 24, 33);
    ctx.restore();
  }

  // Death Rage Banner (screen space)
  if (deathBanner && !zenMode) {
    ctx.save();
    ctx.font = '900 20px system-ui, sans-serif';
    ctx.textAlign = 'center';
    const bw = Math.min(viewW - 40, ctx.measureText(deathBanner).width + 44);
    const bx = viewW / 2 - bw / 2;
    const by = floorOffsetY + ARENA_ROWS * TILE * 0.28;
    ctx.fillStyle = 'rgba(15, 23, 42, 0.9)';
    ctx.strokeStyle = '#fb7185';
    ctx.lineWidth = 3;
    roundRect(ctx, bx, by - 26, bw, 44, 14);
    ctx.fill();
    ctx.stroke();
    ctx.fillStyle = '#fecdd3';
    ctx.fillText(deathBanner, viewW / 2, by + 3);
    ctx.restore();
  }

  // Giant Monkey Horn ("B" Buzina de Macaco) distraction overlay!
  if (activeHorn && !zenMode) {
    const age = (performance.now() - activeHorn.startedAt) / 1000;
    if (age < 2.2) {
      const wobble = Math.sin(age * 24) * 0.14;
      const pop = Math.min(1, age * 8) * (1 - Math.max(0, (age - 1.7) / 0.5));
      ctx.save();
      ctx.globalAlpha = Math.max(0, Math.min(1, pop));
      ctx.translate(viewW / 2, viewH * 0.28);
      ctx.rotate(wobble);
      ctx.scale(1 + Math.sin(age * 16) * 0.08, 1 + Math.cos(age * 16) * 0.08);
      ctx.font = '64px system-ui, sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText(activeHorn.emoji, 0, 0);
      ctx.font = '900 17px system-ui, sans-serif';
      ctx.fillStyle = '#facc15';
      ctx.strokeStyle = '#0f172a';
      ctx.lineWidth = 5;
      const msg = `${activeHorn.senderName}: ${activeHorn.phrase}`;
      ctx.strokeText(msg, 0, 32);
      ctx.fillText(msg, 0, 32);
      ctx.restore();
    }
  }

  ctx.restore(); // end scale
  ctx.restore(); // end dpr + clip
}

function roundRect(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  r: number,
): void {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.lineTo(x + w - r, y);
  ctx.quadraticCurveTo(x + w, y, x + w, y + r);
  ctx.lineTo(x + w, y + h - r);
  ctx.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
  ctx.lineTo(x + r, y + h);
  ctx.quadraticCurveTo(x, y + h, x, y + h - r);
  ctx.lineTo(x, y + r);
  ctx.quadraticCurveTo(x, y, x + r, y);
  ctx.closePath();
}
