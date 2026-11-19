import { mountMonkeyHud, monkeyAudio, PeerRoom } from '@monkey-slop/sdk';
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
  },
  onMessage: (env) => {
    game?.handlePeerMessage(env.senderId, env.senderName, env.payload);
  },
});

const hud = mountMonkeyHud({
  slug: 'monkey-skate',
  title: 'Tony Chimp: Skate Ragdoll',
  room,
});

const dom: HudDomRefs = {
  timerCard: byId('hud-timer-card'),
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
  mpBoard: byId('mp-board'),
  mpRows: byId('mp-rows'),
  bananaBtn: byId<HTMLButtonElement>('btn-banana'),
  menuModal: byId('menu-modal'),
  summaryModal: byId('summary-modal'),
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

const trackCards = document.querySelectorAll<HTMLButtonElement>('#track-grid .choice-card');
trackCards.forEach((btn) => {
  btn.onclick = () => {
    monkeyAudio.play('click');
    trackCards.forEach((b) => b.classList.remove('selected'));
    btn.classList.add('selected');
    selectedTrack = (btn.dataset.track as TrackId) || 'praca';
  };
});

const modeCards = document.querySelectorAll<HTMLButtonElement>('#mode-row .choice-card');
modeCards.forEach((btn) => {
  btn.onclick = () => {
    monkeyAudio.play('click');
    modeCards.forEach((b) => b.classList.remove('selected'));
    btn.classList.add('selected');
    selectedMode = (btn.dataset.mode as GameMode) || 'free';
  };
});

byId<HTMLButtonElement>('btn-start').onclick = () => {
  monkeyAudio.play('click');
  game?.startSession(selectedTrack, selectedMode);
};

byId<HTMLButtonElement>('btn-replay').onclick = () => {
  monkeyAudio.play('click');
  game?.startSession(selectedTrack, selectedMode);
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
