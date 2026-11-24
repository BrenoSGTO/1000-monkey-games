import type { RoundKind } from '../types';
import type { RoundModule } from './api';
import { crown } from './crown';
import { hex } from './hex';
import { race } from './race';
import { seesaw } from './seesaw';
import { soccer } from './soccer';
import { tail } from './tail';

export const ROUNDS: Record<RoundKind, RoundModule> = { race, hex, seesaw, tail, soccer, crown };
export type { RoundCtx, RoundModule } from './api';
