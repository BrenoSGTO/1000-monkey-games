import { mountMonkeyHud, monkeyAudio, PeerRoom } from '@monkey-slop/sdk';
import { createSkateControlsConfig } from './controls';
import { MonkeySkateGame, type HudDomRefs } from './game';
import type { GameMode, NetMessage, TrackId } from './types';

function byId<T extends HTMLElement>(id: string): T {
  const el = document.getElementById(id);
  if (!el) throw new Error(`Missing element #${id}`);
  return el as T;
}

let game: MonkeySkateGame | null = null;

const room = new PeerRoom<NetMessage>('monkey-skate', {
  onPlayersChange: (players) => {
    hud.setPlayers(players);
    game?.syncRoster();
    syncStartCtaLabel();
  },
  onMessage: (env) => {
    game?.handlePeerMessage(env.senderId, env.senderName, env.payload);
  },
});

const hud = mountMonkeyHud({
  slug: 'monkey-skate',
  title: 'Tony Chimp: Skate Ragdoll',
  room,
  controls: createSkateControlsConfig((open) => {
    game?.setGuideOpen(open);
  }),
});

const dom: HudDomRefs = {
  timerCard: byId('hud-timer-card'),
  timerLabel: byId('hud-timer-label'),
  timerVal: byId('hud-timer'),
  trackBadge: byId('hud-track-badge'),
  trickScore: byId('hud-trick-score'),
  bestCombo: byId('hud-best-combo'),
  boneScore: byId('hud-bone-score'),
  bonesCount: byId('hud-bones-count'),
  recordVal: byId('hud-record'),
  comboBanner: byId('combo-banner'),
  comboPoints: byId('combo-points'),
  comboTricks: byId('combo-tricks'),
  local2pBanner: byId('local2p-banner'),
  raceBar: byId('race-bar'),
  racePct: byId('race-pct'),
  raceTrackLine: byId('race-track-line'),
  tipBanner: byId('tip-banner'),
  tipText: byId('tip-text'),
  tipClose: byId<HTMLButtonElement>('tip-close'),
  mpBoard: byId('mp-board'),
  mpRows: byId('mp-rows'),
  bananaBtn: byId<HTMLButtonElement>('btn-banana'),
  menuModal: byId('menu-modal'),
  turnModal: byId('turn-modal'),
  turnHeadline: byId('turn-headline'),
  turnSub: byId('turn-sub'),
  turnP1Tricks: byId('turn-p1-tricks'),
  turnP1Sus: byId('turn-p1-sus'),
  turnP1Total: byId('turn-p1-total'),
  nextTurnBtn: byId<HTMLButtonElement>('btn-next-turn'),
  summaryModal: byId('summary-modal'),
  podiumBox: byId('podium-box'),
  podiumRows: byId('podium-rows'),
  sumTricks: byId('sum-tricks'),
  sumSus: byId('sum-sus'),
  sumTotal: byId('sum-total'),
  summaryHeadline: byId('summary-headline'),
  summaryDiagnosis: byId('summary-diagnosis'),
};

const canvas = byId<HTMLCanvasElement>('game-canvas');
game = new MonkeySkateGame(canvas, room, hud, dom);

// Track & Mode selection UI
let selectedTrack: TrackId = 'praca';
let selectedMode: GameMode = 'free';

const local2pConfig = byId('local2p-config');
const p1Input = byId<HTMLInputElement>('p1-name-input');
const p2Input = byId<HTMLInputElement>('p2-name-input');
const startBtn = byId<HTMLButtonElement>('btn-start');

const trackCards = document.querySelectorAll<HTMLButtonElement>('#track-grid .choice-card');
const modeCards = document.querySelectorAll<HTMLButtonElement>('#mode-row .choice-card');

function selectTrack(trackId: TrackId): void {
  selectedTrack = trackId;
  trackCards.forEach((b) => {
    b.classList.toggle('selected', b.dataset.track === trackId);
  });
}

function syncStartCtaLabel(): void {
  const onlineCount = room.getPlayers().length;
  if (onlineCount > 1 && (selectedMode === 'session90' || selectedMode === 'race')) {
    startBtn.textContent =
      selectedMode === 'race'
        ? `🏁 INICIAR CORRIDA NA SALA (${onlineCount} 🐒)!`
        : `⏱️ INICIAR DUELO 90s NA SALA (${onlineCount} 🐒)!`;
  } else if (selectedMode === 'local2p') {
    startBtn.textContent = '👥 INICIAR DESAFIO 2P LOCAL!';
  } else if (selectedMode === 'race') {
    startBtn.textContent = '🏁 DROPAR NA CORRIDA!';
  } else {
    startBtn.textContent = '🔥 DROPAR NA PISTA!';
  }
}

trackCards.forEach((btn) => {
  btn.onclick = () => {
    monkeyAudio.play('click');
    const tid = (btn.dataset.track as TrackId) || 'praca';
    selectTrack(tid);
  };
});

modeCards.forEach((btn) => {
  btn.onclick = () => {
    monkeyAudio.play('click');
    modeCards.forEach((b) => b.classList.remove('selected'));
    btn.classList.add('selected');
    selectedMode = (btn.dataset.mode as GameMode) || 'free';
    local2pConfig.classList.toggle('visible', selectedMode === 'local2p');
    if (selectedMode === 'race') {
      selectTrack('ladeira');
    }
    syncStartCtaLabel();
  };
});

startBtn.onclick = () => {
  monkeyAudio.play('click');
  game?.startSession(selectedTrack, selectedMode, [p1Input.value, p2Input.value]);
};

byId<HTMLButtonElement>('btn-replay').onclick = () => {
  monkeyAudio.play('click');
  game?.startSession(selectedTrack, selectedMode, [p1Input.value, p2Input.value]);
};

dom.nextTurnBtn.onclick = () => {
  monkeyAudio.play('click');
  game?.startLocal2PSecondTurn();
};

byId<HTMLButtonElement>('btn-summary-menu').onclick = () => {
  monkeyAudio.play('click');
  game?.openMenu();
};

byId<HTMLButtonElement>('btn-menu').onclick = () => {
  monkeyAudio.play('click');
  game?.openMenu();
};

byId<HTMLButtonElement>('btn-eject').onclick = () => {
  game?.triggerEject();
};

dom.bananaBtn.onclick = () => {
  game?.throwBananaPeel();
};

syncStartCtaLabel();
