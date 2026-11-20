import {
  findWaypointPath,
  getRoomAt,
  getWaypointById,
  hasLineOfSight,
  LIGHTS_PANEL,
  REACTOR_PANEL,
  resolveCircleCollisions,
  TASK_SPOTS,
  VENTS,
  WAYPOINTS,
} from './map';
import type {
  ActiveSabotage,
  BotBrain,
  DeadBody,
  MeetingState,
  PlayerState,
  SabotageKind,
} from './types';

export const BOT_NAMES = [
  'Chimp Calvo',
  'Babuíno Zoiudo',
  'Sagui Vesgo',
  'Gorila Maluco',
  'Mico Banguela',
  'Orangotango Ninja',
  'Macaco Soneca',
  'Primata Surtado',
  'Caco Banana',
];

export interface BotWorldActions {
  onBotKill: (killerId: string, victimId: string) => void;
  onBotReport: (reporterId: string, bodyId: string) => void;
  onBotTaskDone: (botId: string, taskId: string) => void;
  onBotSabotage: (kind: SabotageKind) => void;
  onBotFixSabotage: (kind: SabotageKind) => void;
}

export class BotManager {
  private brains = new Map<string, BotBrain>();

  resetForMatch(players: PlayerState[]): void {
    this.brains.clear();
    for (const p of players) {
      if (!p.isBot) continue;
      this.brains.set(p.id, {
        path: [],
        targetTaskId: null,
        pauseTimer: 0.6 + Math.random() * 1.4,
        reportDelay: 0,
        pendingBodyId: null,
        huntCooldown: 4 + Math.random() * 4,
        ventTimer: 0,
        sightings: [],
        spokeInMeeting: false,
        meetingSpeakAt: 0,
        meetingVoteAt: 0,
      });
    }
  }

  prepareMeeting(players: PlayerState[], meeting: MeetingState): void {
    for (const p of players) {
      if (!p.isBot || !p.alive) continue;
      const brain = this.brains.get(p.id);
      if (!brain) continue;
      brain.spokeInMeeting = false;
      const isReporter = p.id === meeting.callerId;
      brain.meetingSpeakAt = isReporter ? 0.9 : 2.0 + Math.random() * 7.5;
      brain.meetingVoteAt = 4.5 + Math.random() * 9.0;
    }
  }

  updatePlaying(
    dt: number,
    nowSec: number,
    players: PlayerState[],
    bodies: DeadBody[],
    sabotage: ActiveSabotage | null,
    sabotageCooldown: number,
    baseSpeed: number,
    actions: BotWorldActions,
  ): void {
    const lightVision = sabotage?.kind === 'lights' ? 165 : 360;

    for (const bot of players) {
      if (!bot.isBot) continue;
      const brain = this.brains.get(bot.id);
      if (!brain) continue;

      if (bot.inVent) {
        brain.ventTimer -= dt;
        bot.vx = 0;
        bot.vy = 0;
        if (brain.ventTimer <= 0) {
          const currentVent = VENTS.find((v) => v.id === bot.inVent);
          if (currentVent && currentVent.links.length > 0) {
            const nextId = currentVent.links[Math.floor(Math.random() * currentVent.links.length)];
            const nextVent = VENTS.find((v) => v.id === nextId);
            if (nextVent) {
              bot.x = nextVent.x;
              bot.y = nextVent.y;
            }
          }
          bot.inVent = null;
          brain.path = [];
        }
        continue;
      }

      // Record player sightings for meeting clues
      if (bot.alive) {
        const vision = bot.role === 'impostor' ? 420 : lightVision;
        for (const other of players) {
          if (other.id === bot.id || !other.alive || other.inVent) continue;
          if (hasLineOfSight(bot.x, bot.y, other.x, other.y, vision)) {
            const room = getRoomAt(other.x, other.y);
            const existing = brain.sightings.find((s) => s.targetId === other.id);
            if (existing) {
              existing.room = room.id;
              existing.roomLabel = room.name;
              existing.time = nowSec;
            } else {
              brain.sightings.push({
                targetId: other.id,
                targetName: other.name,
                colorName: other.color.name,
                room: room.id,
                roomLabel: room.name,
                time: nowSec,
              });
              if (brain.sightings.length > 5) brain.sightings.shift();
            }
          }
        }

        // Check dead bodies to report
        if (!brain.pendingBodyId) {
          for (const body of bodies) {
            if (hasLineOfSight(bot.x, bot.y, body.x, body.y, vision * 0.9)) {
              // Impostor bots usually ignore bodies unless someone else is right there
              if (bot.role === 'impostor' && Math.random() < 0.85) continue;
              brain.pendingBodyId = body.id;
              brain.reportDelay = 0.65;
              break;
            }
          }
        } else {
          const stillThere = bodies.find((b) => b.id === brain.pendingBodyId);
          if (!stillThere) {
            brain.pendingBodyId = null;
          } else {
            brain.reportDelay -= dt;
            if (brain.reportDelay <= 0) {
              brain.pendingBodyId = null;
              actions.onBotReport(bot.id, stillThere.id);
              return;
            }
          }
        }
      }

      // Impostor kill & sabotage logic
      if (bot.alive && bot.role === 'impostor') {
        brain.huntCooldown -= dt;
        if (!sabotage && sabotageCooldown <= 0 && brain.huntCooldown <= 0 && Math.random() < dt * 0.22) {
          const kind: SabotageKind = Math.random() < 0.55 ? 'lights' : 'reactor';
          actions.onBotSabotage(kind);
          brain.huntCooldown = 10;
        }

        if (bot.killCooldown <= 0) {
          const target = this.findKillTarget(bot, players, lightVision);
          if (target) {
            const dist = Math.hypot(target.x - bot.x, target.y - bot.y);
            if (dist <= 92 && hasLineOfSight(bot.x, bot.y, target.x, target.y, 110)) {
              actions.onBotKill(bot.id, target.id);
              // Try to escape via vent or flee
              const nearVent = VENTS.find((v) => Math.hypot(v.x - bot.x, v.y - bot.y) < 220);
              if (nearVent && Math.random() < 0.7) {
                bot.inVent = nearVent.id;
                bot.x = nearVent.x;
                bot.y = nearVent.y;
                brain.ventTimer = 1.4;
              } else {
                const randWp = WAYPOINTS[Math.floor(Math.random() * WAYPOINTS.length)];
                brain.path = findWaypointPath(bot.x, bot.y, randWp.x, randWp.y);
                brain.pauseTimer = 0;
              }
              continue;
            } else if (dist < 280) {
              // Chase briefly
              this.steerDirectly(bot, target.x, target.y, baseSpeed * 1.02, dt);
              continue;
            }
          }
        }
      }

      // Pausing at task/station
      if (brain.pauseTimer > 0) {
        brain.pauseTimer -= dt;
        bot.vx = 0;
        bot.vy = 0;
        if (brain.targetTaskId === 'task_scan_enfermaria' && bot.alive) {
          bot.scanning = true;
        }
        if (brain.pauseTimer <= 0) {
          bot.scanning = false;
          if (brain.targetTaskId === '__fix_lights__' && sabotage?.kind === 'lights') {
            actions.onBotFixSabotage('lights');
          } else if (brain.targetTaskId === '__fix_reactor__' && sabotage?.kind === 'reactor') {
            actions.onBotFixSabotage('reactor');
          } else if (brain.targetTaskId && bot.role === 'crew') {
            if (!bot.tasksDone.includes(brain.targetTaskId)) {
              actions.onBotTaskDone(bot.id, brain.targetTaskId);
            }
          }
          brain.targetTaskId = null;
        }
        continue;
      }

      bot.scanning = false;

      // Pick a goal if no path
      if (brain.path.length === 0 && !brain.targetTaskId) {
        this.chooseNextGoal(bot, brain, sabotage);
      }

      // Navigate along path -> final destination
      const goalCoords = this.getTargetCoords(brain);
      if (brain.path.length > 0) {
        const wp = getWaypointById(brain.path[0]);
        if (!wp) {
          brain.path.shift();
        } else {
          const arrived = this.steerDirectly(bot, wp.x, wp.y, baseSpeed, dt);
          if (arrived) brain.path.shift();
        }
      } else if (goalCoords) {
        const arrived = this.steerDirectly(bot, goalCoords.x, goalCoords.y, baseSpeed, dt);
        if (arrived) {
          brain.pauseTimer =
            goalCoords.kind === 'sabotage'
              ? 1.5
              : goalCoords.taskId === 'task_scan_enfermaria'
                ? 4.0
                : 2.4 + Math.random() * 2.2;
        }
      }
    }
  }

  private findKillTarget(
    impostor: PlayerState,
    players: PlayerState[],
    crewVision: number,
  ): PlayerState | null {
    let best: PlayerState | null = null;
    let bestDist = 300;
    for (const p of players) {
      if (!p.alive || p.role === 'impostor' || p.id === impostor.id) continue;
      const d = Math.hypot(p.x - impostor.x, p.y - impostor.y);
      if (d > bestDist) continue;
      // Count witnesses who can see the victim or impostor
      let witnesses = 0;
      for (const w of players) {
        if (!w.alive || w.id === impostor.id || w.id === p.id || w.role === 'impostor') continue;
        if (hasLineOfSight(w.x, w.y, p.x, p.y, crewVision + 30)) {
          witnesses++;
        }
      }
      if (witnesses === 0) {
        bestDist = d;
        best = p;
      }
    }
    return best;
  }

  private chooseNextGoal(
    bot: PlayerState,
    brain: BotBrain,
    sabotage: ActiveSabotage | null,
  ): void {
    // Crew bots respond to sabotage ~50% of the time (or 100% if reactor < 22s)
    if (bot.alive && bot.role === 'crew' && sabotage) {
      const urgent = sabotage.kind === 'reactor' && sabotage.timer < 24;
      if (urgent || Math.random() < 0.45) {
        if (sabotage.kind === 'lights') {
          brain.targetTaskId = '__fix_lights__';
          brain.path = findWaypointPath(bot.x, bot.y, LIGHTS_PANEL.x, LIGHTS_PANEL.y);
          return;
        }
        if (sabotage.kind === 'reactor') {
          brain.targetTaskId = '__fix_reactor__';
          brain.path = findWaypointPath(bot.x, bot.y, REACTOR_PANEL.x, REACTOR_PANEL.y);
          return;
        }
      }
    }

    const remainingTasks = bot.tasksAssigned.filter((id) => !bot.tasksDone.includes(id));
    if (remainingTasks.length > 0 && (bot.role === 'crew' || Math.random() < 0.7)) {
      const pick = remainingTasks[Math.floor(Math.random() * remainingTasks.length)];
      const spot = TASK_SPOTS.find((t) => t.id === pick);
      if (spot) {
        brain.targetTaskId = spot.id;
        brain.path = bot.alive
          ? findWaypointPath(bot.x, bot.y, spot.x, spot.y)
          : [];
        return;
      }
    }

    // Patrol random waypoint
    const wp = WAYPOINTS[Math.floor(Math.random() * WAYPOINTS.length)];
    brain.targetTaskId = null;
    brain.path = findWaypointPath(bot.x, bot.y, wp.x, wp.y);
  }

  private getTargetCoords(
    brain: BotBrain,
  ): { x: number; y: number; kind: 'task' | 'sabotage'; taskId?: string } | null {
    if (!brain.targetTaskId) return null;
    if (brain.targetTaskId === '__fix_lights__') {
      return { x: LIGHTS_PANEL.x, y: LIGHTS_PANEL.y, kind: 'sabotage' };
    }
    if (brain.targetTaskId === '__fix_reactor__') {
      return { x: REACTOR_PANEL.x, y: REACTOR_PANEL.y, kind: 'sabotage' };
    }
    const spot = TASK_SPOTS.find((t) => t.id === brain.targetTaskId);
    if (!spot) return null;
    return { x: spot.x, y: spot.y, kind: 'task', taskId: spot.id };
  }

  private steerDirectly(
    bot: PlayerState,
    tx: number,
    ty: number,
    speed: number,
    dt: number,
  ): boolean {
    const dx = tx - bot.x;
    const dy = ty - bot.y;
    const dist = Math.hypot(dx, dy);
    if (dist <= 16) {
      bot.vx = 0;
      bot.vy = 0;
      return true;
    }
    const ux = dx / dist;
    const uy = dy / dist;
    bot.vx = ux * speed;
    bot.vy = uy * speed;
    if (Math.abs(bot.vx) > 5) bot.facing = bot.vx >= 0 ? 1 : -1;
    const step = Math.min(dist, speed * dt);
    const resolved = resolveCircleCollisions(
      bot.x + ux * step,
      bot.y + uy * step,
      18,
      !bot.alive,
    );
    bot.x = resolved.x;
    bot.y = resolved.y;
    bot.walkPhase += dt * 11;
    return false;
  }

  updateMeeting(
    dt: number,
    meetingElapsed: number,
    players: PlayerState[],
    meeting: MeetingState,
    onBotSpeak: (bot: PlayerState, text: string) => void,
    onBotVote: (bot: PlayerState, targetId: string) => void,
  ): void {
    void dt;
    const alivePlayers = players.filter((p) => p.alive);

    for (const bot of alivePlayers) {
      if (!bot.isBot) continue;
      const brain = this.brains.get(bot.id);
      if (!brain) continue;

      if (!brain.spokeInMeeting && meetingElapsed >= brain.meetingSpeakAt) {
        brain.spokeInMeeting = true;
        const msg = this.composeMeetingLine(bot, brain, alivePlayers, meeting);
        onBotSpeak(bot, msg);
      }

      if (bot.votedFor === null && meetingElapsed >= brain.meetingVoteAt) {
        const target = this.chooseVoteTarget(bot, brain, alivePlayers, meeting);
        onBotVote(bot, target);
      }
    }
  }

  private composeMeetingLine(
    bot: PlayerState,
    brain: BotBrain,
    alivePlayers: PlayerState[],
    meeting: MeetingState,
  ): string {
    const room = getRoomAt(bot.x, bot.y);
    if (bot.id === meeting.callerId && meeting.reason === 'body') {
      const suspect = brain.sightings.find(
        (s) => s.roomLabel === meeting.bodyRoomLabel && s.targetId !== bot.id,
      );
      if (suspect) {
        return `Achei o corpo em ${meeting.bodyRoomLabel}! Vi ${suspect.targetName} saindo de lá! 🚨`;
      }
      return `Corpo de banana caído em ${meeting.bodyRoomLabel}! Onde vocês tavam?!`;
    }

    if (bot.role === 'impostor') {
      const innocents = alivePlayers.filter((p) => p.role !== 'impostor' && p.id !== bot.id);
      const scapegoat = innocents[Math.floor(Math.random() * innocents.length)];
      const lines = [
        `Eu tava tranquilo em ${room.name} fazendo tarefa 😇`,
        scapegoat ? `Vi ${scapegoat.name} agindo muito sus perto do vent 🤨` : 'Não fui eu, confiem!',
        'Ninguém viu nada? Bora pular esse voto então!',
        scapegoat ? `${scapegoat.name} tava quieto demais, hein...` : 'Sus demais isso aí!',
      ];
      return lines[Math.floor(Math.random() * lines.length)];
    }

    // Crewmate bot shares genuine sighting if available
    if (brain.sightings.length > 0 && Math.random() < 0.72) {
      const last = brain.sightings[brain.sightings.length - 1];
      return `Eu vi ${last.targetName} (${last.colorName}) em ${last.roomLabel} há pouco!`;
    }

    const lines = [
      `Eu tava em ${room.name} ralando nas tarefas 🍌`,
      'Alguém passou pelo Scanner de Calvície?',
      'Se não tiver certeza, melhor pular o voto!',
      'Tô de olho em quem tá andando sozinho 👀',
    ];
    return lines[Math.floor(Math.random() * lines.length)];
  }

  private chooseVoteTarget(
    bot: PlayerState,
    brain: BotBrain,
    alivePlayers: PlayerState[],
    meeting: MeetingState,
  ): string {
    if (bot.role === 'impostor') {
      const targets = alivePlayers.filter((p) => p.role !== 'impostor');
      if (targets.length > 0 && Math.random() < 0.7) {
        return targets[Math.floor(Math.random() * targets.length)].id;
      }
      return 'skip';
    }

    // Crewmate checks if someone was spotted at the body room
    if (meeting.reason === 'body' && meeting.bodyRoomLabel) {
      const suspectSighting = brain.sightings.find(
        (s) =>
          s.roomLabel === meeting.bodyRoomLabel &&
          alivePlayers.some((a) => a.id === s.targetId) &&
          s.targetId !== meeting.callerId,
      );
      if (suspectSighting && Math.random() < 0.75) {
        return suspectSighting.targetId;
      }
    }

    if (Math.random() < 0.58) return 'skip';
    const others = alivePlayers.filter((p) => p.id !== bot.id);
    if (others.length === 0) return 'skip';
    return others[Math.floor(Math.random() * others.length)].id;
  }
}
