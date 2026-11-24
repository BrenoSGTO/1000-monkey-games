// Estado autoritativo da partida (offline ou host): fases, placar, tempo, bots.
import { botThink, newBotMem, type BotMem } from './bot';
import { COUNTDOWN_DUR, FIXED_DT, GOAL_DUR, GOAL_SLOWMO, PADS, REPLAY_DUR } from './constants';
import { Sim } from './sim';
import {
  PH_COUNTDOWN,
  PH_END,
  PH_GOAL,
  PH_PLAY,
  PH_REPLAY,
  emptyInput,
  type GoalInfo,
  type InputState,
  type MatchConfig,
  type Phase,
  type RenderState,
  type SimEvent,
  type SnapMsg,
} from './types';

const r2 = (n: number) => Math.round(n * 100) / 100;
const r3 = (n: number) => Math.round(n * 1000) / 1000;

export interface SlotStats {
  slot: number;
  name: string;
  team: 0 | 1;
  goals: number;
  touches: number;
  pads: number;
  bot: boolean;
}

export class Match {
  sim: Sim;
  phase: Phase = PH_COUNTDOWN;
  phaseT = 0;
  scoreA = 0;
  scoreB = 0;
  timeLeft: number;
  overtime = false;
  goal: GoalInfo | null = null;
  events: SimEvent[] = [];
  paused = false;
  /** segundos desde o apito inicial do kickoff atual */
  sinceKickoff = 0;
  private mems: BotMem[] = [];
  private acc = 0;
  private endAfterGoal = false;
  readonly demo: boolean;
  private countdownDur: number;
  private goalDur: number;

  constructor(public cfg: MatchConfig) {
    this.demo = cfg.kind === 'demo';
    this.sim = new Sim(cfg);
    this.timeLeft = cfg.matchTime;
    this.countdownDur = this.demo ? 0.8 : COUNTDOWN_DUR;
    this.goalDur = this.demo ? 1.6 : GOAL_DUR;
    for (let i = 0; i < cfg.slots.length; i++) this.mems.push(newBotMem());
  }

  setInput(slot: number, input: InputState): void {
    const c = this.sim.cars[slot];
    if (c && !c.cfg.bot) this.sim.setInput(slot, input);
  }

  /** Um jogador online saiu: o carro vira bot. */
  convertToBot(slot: number): void {
    const c = this.sim.cars[slot];
    if (!c || c.cfg.bot) return;
    c.cfg.bot = true;
    c.cfg.playerId = null;
    c.cfg.local = null;
    c.input = emptyInput();
    c.input.jumpCount = c.lastJumpCount;
  }

  private setPhase(p: Phase): void {
    this.phase = p;
    this.phaseT = 0;
  }

  skipReplay(): void {
    if (this.phase === PH_REPLAY) this.phaseT = REPLAY_DUR;
  }

  update(dtReal: number): void {
    if (this.paused) return;
    const dt = Math.min(dtReal, 0.05);
    this.phaseT += dt;

    switch (this.phase) {
      case PH_COUNTDOWN: {
        if (this.phaseT >= this.countdownDur) {
          this.setPhase(PH_PLAY);
          this.sinceKickoff = 0;
          for (const c of this.sim.cars) c.lastJumpCount = c.input.jumpCount;
          this.events.push({ k: 'kickoff' });
          this.events.push({ k: 'whistle', end: false });
        }
        break;
      }
      case PH_PLAY: {
        this.sinceKickoff += dt;
        this.stepSim(dt, 1, true);
        if (this.overtime) this.timeLeft += dt;
        else this.timeLeft = Math.max(0, this.timeLeft - dt);
        if (this.sim.goal) {
          this.onGoal();
        } else if (!this.overtime && this.timeLeft <= 0 && !this.demo) {
          if (this.scoreA !== this.scoreB) {
            this.events.push({ k: 'whistle', end: true });
            this.setPhase(PH_END);
          } else {
            this.overtime = true;
            this.timeLeft = 0;
            this.events.push({ k: 'whistle', end: false });
          }
        }
        break;
      }
      case PH_GOAL: {
        this.stepSim(dt, GOAL_SLOWMO, false);
        if (this.phaseT >= this.goalDur) {
          this.sim.resetKickoff();
          this.sim.drainEvents();
          if (this.demo) {
            this.goal = null;
            this.setPhase(PH_COUNTDOWN);
          } else {
            this.setPhase(PH_REPLAY);
          }
        }
        break;
      }
      case PH_REPLAY: {
        if (this.phaseT >= REPLAY_DUR) {
          if (this.endAfterGoal) {
            this.events.push({ k: 'whistle', end: true });
            this.setPhase(PH_END);
          } else {
            this.goal = null;
            this.setPhase(PH_COUNTDOWN);
          }
        }
        break;
      }
      case PH_END:
        break;
    }
    // bots no menu / demo continuam jogando mesmo depois de reset
    for (const e of this.sim.drainEvents()) this.events.push(e);
  }

  private stepSim(dt: number, scale: number, think: boolean): void {
    this.acc += dt * scale;
    let n = 0;
    while (this.acc >= FIXED_DT && n < 6) {
      if (think) this.runBots(FIXED_DT);
      this.sim.step(FIXED_DT);
      this.acc -= FIXED_DT;
      n++;
      if (this.sim.goal && this.phase === PH_PLAY) break;
    }
    if (n >= 6) this.acc = 0;
  }

  private runBots(dt: number): void {
    const kick = this.sinceKickoff < 1.6;
    for (const c of this.sim.cars) {
      if (!c.cfg.bot) continue;
      botThink(this.sim, c, this.mems[c.slot], this.cfg.botLevel, dt, kick);
    }
  }

  private onGoal(): void {
    const g = this.sim.goal!;
    if (g.team === 0) this.scoreA++;
    else this.scoreB++;
    this.goal = { team: g.team, slot: g.slot, own: g.own, text: g.text };
    this.endAfterGoal = this.overtime && !this.demo;
    for (const c of this.sim.cars) {
      if (c.cfg.bot) {
        c.input.left = false;
        c.input.right = false;
        c.input.boost = false;
      }
    }
    this.setPhase(PH_GOAL);
  }

  results(): { slots: SlotStats[]; winner: 0 | 1 | null } {
    const slots = this.sim.cars.map((c) => ({
      slot: c.slot,
      name: c.cfg.name,
      team: c.team,
      goals: c.goals,
      touches: c.touches,
      pads: c.pads,
      bot: c.cfg.bot,
    }));
    return { slots, winner: this.scoreA === this.scoreB ? null : this.scoreA > this.scoreB ? 0 : 1 };
  }

  view(): RenderState {
    return {
      cars: this.sim.cars.map((c) => this.sim.carState(c)),
      ball: this.sim.ballState(),
      pads: this.sim.pads.map((p) => p.active),
      scoreA: this.scoreA,
      scoreB: this.scoreB,
      timeLeft: this.timeLeft,
      overtime: this.overtime,
      phase: this.phase,
      phaseT: this.phaseT,
      goal: this.goal,
    };
  }

  snap(): SnapMsg {
    const b = this.sim.ball;
    const bp = b.getPosition();
    const bv = b.getLinearVelocity();
    return {
      t: r3(this.sim.time),
      ph: this.phase,
      pt: r2(this.phaseT),
      sa: this.scoreA,
      sb: this.scoreB,
      tl: r2(this.timeLeft),
      ot: this.overtime ? 1 : 0,
      b: [r2(bp.x), r2(bp.y), r3(b.getAngle()), r2(bv.x), r2(bv.y)],
      c: this.sim.cars.map((c) => {
        const p = c.body.getPosition();
        const v = c.body.getLinearVelocity();
        const flags = (c.grounded ? 1 : 0) | (c.boosting ? 2 : 0) | (c.facing === 1 ? 4 : 0);
        return [r2(p.x), r2(p.y), r3(c.body.getAngle()), r2(v.x), r2(v.y), Math.round(c.boost), flags, r2(c.flipT)];
      }),
      p: this.sim.padMask(),
      g: this.goal,
    };
  }
}

export const PAD_COUNT = PADS.length;
