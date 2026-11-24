import type { Emit, Monkey, RoundKind, World } from '../types';
import type { Rng } from '../util';

export interface RoundCtx {
  all: Monkey[];
  emit: Emit;
  target: number;
  roundNo: number;
  /** monkeys still competing in this round (not eliminated) */
  comp(): Monkey[];
  nQual(): number;
  qualify(m: Monkey): void;
  eliminate(m: Monkey, text?: string): void;
  finish(): void;
}

export interface RoundInfo {
  title: string;
  blurb: string;
  tip: string;
}

export interface RoundModule {
  kind: RoundKind;
  variants: number;
  /** after the round, qualify the best-ranked leftovers up to the target */
  fill: boolean;
  minQual: number;
  info(variant: number): RoundInfo;
  build(w: World, n: number, variant: number, rng: Rng): void;
  spawn(w: World, m: Monkey, idx: number, n: number, rng: Rng): void;
  update(w: World, ctx: RoundCtx, dt: number): void;
  bot(m: Monkey, w: World, ctx: RoundCtx, dt: number): void;
  /** best first, among monkeys still alive in the round */
  rank(w: World, ms: Monkey[]): Monkey[];
  ser(w: World): unknown;
  apply(w: World, d: unknown): void;
}
