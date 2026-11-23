import { getGameScore } from '@monkey-slop/sdk';
import { agarioAudio } from './audio';
import { SKINS } from './skins';
import type { GameMode, LeaderboardEntry, SkinId, TeamId } from './types';

export interface UiHandlers {
  onPlay: (name: string, skin: SkinId, mode: GameMode, team: TeamId) => void;
  onModeChange: (mode: GameMode) => void;
  onNameChange: (name: string) => void;
}

const DEATH_HEADLINES = [
  'VIROU VITAMINA DE BANANA!',
  'FOI DE ARRASTA NA SELVA!',
  'ENGOLIDO COM CASCA E TUDO!',
  'PERDEU NO ARGUMENTO!',
];

export class AgarioUI {
  private titleOverlay = document.getElementById('title-overlay') as HTMLDivElement;
  private deathOverlay = document.getElementById('death-overlay') as HTMLDivElement;
  private nameInput = document.getElementById('input-name') as HTMLInputElement;
  private modeFfaBtn = document.getElementById('mode-ffa') as HTMLButtonElement;
  private modeTeamsBtn = document.getElementById('mode-teams') as HTMLButtonElement;
  private teamPicker = document.getElementById('team-picker') as HTMLDivElement;
  private pickTeam1Btn = document.getElementById('pick-team-1') as HTMLButtonElement;
  private pickTeam2Btn = document.getElementById('pick-team-2') as HTMLButtonElement;
  private skinsGrid = document.getElementById('skins-grid') as HTMLDivElement;
  private playBtn = document.getElementById('btn-play') as HTMLButtonElement;
  private respawnBtn = document.getElementById('btn-respawn') as HTMLButtonElement;
  private backMenuBtn = document.getElementById('btn-back-menu') as HTMLButtonElement;
  private bestScoreEl = document.getElementById('best-score-label') as HTMLSpanElement;
  private netModeEl = document.getElementById('net-mode-label') as HTMLSpanElement;

  private hudMass = document.getElementById('hud-mass') as HTMLElement;
  private hudRank = document.getElementById('hud-rank') as HTMLElement;
  private hudKills = document.getElementById('hud-kills') as HTMLElement;
  private lbList = document.getElementById('lb-list') as HTMLOListElement;
  private lbMode = document.getElementById('lb-mode') as HTMLSpanElement;
  private teamsBar = document.getElementById('teams-bar') as HTMLDivElement;
  private team1Pct = document.getElementById('team1-pct') as HTMLSpanElement;
  private team2Pct = document.getElementById('team2-pct') as HTMLSpanElement;
  private team1Fill = document.getElementById('team1-fill') as HTMLDivElement;

  private deathHeadline = document.getElementById('death-headline') as HTMLHeadingElement;
  private deathSub = document.getElementById('death-sub') as HTMLParagraphElement;
  private statPeak = document.getElementById('stat-peak') as HTMLDivElement;
  private statKills = document.getElementById('stat-kills') as HTMLDivElement;
  private statTime = document.getElementById('stat-time') as HTMLDivElement;
  private deathRecordBadge = document.getElementById('death-record-badge') as HTMLDivElement;

  public selectedSkin: SkinId = 'classico';
  public selectedMode: GameMode = 'ffa';
  public selectedTeam: TeamId = 1;
  private isHost = true;
  private handlers: UiHandlers;

  constructor(defaultName: string, handlers: UiHandlers) {
    this.handlers = handlers;
    this.nameInput.value = defaultName;
    this.buildSkinGrid();
    this.refreshBestScore();

    this.nameInput.addEventListener('change', () => {
      this.handlers.onNameChange(this.getName());
    });

    this.modeFfaBtn.onclick = () => {
      if (!this.isHost) return;
      agarioAudio.playClick();
      this.setMode('ffa');
      this.handlers.onModeChange('ffa');
    };
    this.modeTeamsBtn.onclick = () => {
      if (!this.isHost) return;
      agarioAudio.playClick();
      this.setMode('teams');
      this.handlers.onModeChange('teams');
    };

    this.pickTeam1Btn.onclick = () => {
      agarioAudio.playClick();
      this.selectedTeam = 1;
      this.pickTeam1Btn.classList.add('active');
      this.pickTeam2Btn.classList.remove('active');
    };
    this.pickTeam2Btn.onclick = () => {
      agarioAudio.playClick();
      this.selectedTeam = 2;
      this.pickTeam2Btn.classList.add('active');
      this.pickTeam1Btn.classList.remove('active');
    };

    const startPlay = () => {
      agarioAudio.playClick();
      this.hideOverlays();
      this.handlers.onPlay(this.getName(), this.selectedSkin, this.selectedMode, this.selectedTeam);
    };

    this.playBtn.onclick = startPlay;
    this.respawnBtn.onclick = startPlay;
    this.backMenuBtn.onclick = () => {
      agarioAudio.playClick();
      this.deathOverlay.classList.remove('open');
      this.titleOverlay.classList.add('open');
      this.refreshBestScore();
    };

    this.nameInput.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') {
        startPlay();
      }
    });
  }

  getName(): string {
    return this.nameInput.value.trim().slice(0, 18) || 'Macaco Veloz';
  }

  setMode(mode: GameMode): void {
    this.selectedMode = mode;
    this.modeFfaBtn.classList.toggle('active', mode === 'ffa');
    this.modeTeamsBtn.classList.toggle('active', mode === 'teams');
    this.teamPicker.style.display = mode === 'teams' ? 'block' : 'none';
    this.lbMode.textContent = mode === 'teams' ? 'TIMES' : 'FFA';
    this.teamsBar.classList.toggle('open', mode === 'teams');
  }

  setNetworkStatus(isOnline: boolean, isHost: boolean, playerCount: number): void {
    this.isHost = isHost;
    this.modeFfaBtn.disabled = isOnline && !isHost;
    this.modeTeamsBtn.disabled = isOnline && !isHost;

    if (!isOnline) {
      this.netModeEl.textContent = '🌐 Solo + Bots IA (Co-op P2P no topo!)';
    } else if (isHost) {
      this.netModeEl.textContent = `👑 Host P2P (${playerCount} humano${playerCount === 1 ? '' : 's'} + bots)`;
    } else {
      this.netModeEl.textContent = `🐒 Conectado na Sala (${playerCount} humano${playerCount === 1 ? '' : 's'})`;
    }
  }

  refreshBestScore(): void {
    const rec = getGameScore('monkey-agario');
    this.bestScoreEl.textContent = `🏆 Recorde: ${rec.bestScore} massa`;
  }

  hideOverlays(): void {
    this.titleOverlay.classList.remove('open');
    this.deathOverlay.classList.remove('open');
  }

  isOverlayOpen(): boolean {
    return (
      this.titleOverlay.classList.contains('open') ||
      this.deathOverlay.classList.contains('open')
    );
  }

  showDeath(killer: string, peakMass: number, kills: number, aliveTime: number, isNewRecord: boolean): void {
    this.deathHeadline.textContent =
      DEATH_HEADLINES[Math.floor(Math.random() * DEATH_HEADLINES.length)];
    this.deathSub.textContent = `Engolido por ${killer}`;
    this.statPeak.textContent = `${peakMass}`;
    this.statKills.textContent = `${kills}`;
    this.statTime.textContent = `${aliveTime}s`;
    this.deathRecordBadge.style.display = isNewRecord ? 'block' : 'none';
    this.deathOverlay.classList.add('open');
    this.refreshBestScore();
  }

  updateHud(
    myMass: number,
    myKills: number,
    localOwnerId: string,
    leaderboard: LeaderboardEntry[],
    teamMass: [number, number],
    mode: GameMode,
  ): void {
    this.hudMass.textContent = `${Math.round(myMass)}`;
    this.hudKills.textContent = `${myKills}`;

    const myRankIdx = leaderboard.findIndex((e) => e.ownerId === localOwnerId);
    this.hudRank.textContent = myRankIdx >= 0 ? `#${myRankIdx + 1}` : '-';

    this.lbMode.textContent = mode === 'teams' ? 'TIMES' : 'FFA';
    this.teamsBar.classList.toggle('open', mode === 'teams');
    if (mode === 'teams') {
      const total = Math.max(1, teamMass[0] + teamMass[1]);
      const p1 = Math.round((teamMass[0] / total) * 100);
      const p2 = 100 - p1;
      this.team1Pct.textContent = `${p1}%`;
      this.team2Pct.textContent = `${p2}%`;
      this.team1Fill.style.width = `${p1}%`;
    }

    this.lbList.innerHTML = '';
    const top = leaderboard.slice(0, 8);
    top.forEach((entry, idx) => {
      const li = document.createElement('li');
      li.className = `ag-lb-item${entry.ownerId === localOwnerId ? ' me' : ''}`;
      const badge =
        idx === 0
          ? '👑'
          : mode === 'teams'
            ? entry.team === 1
              ? '🍌'
              : '🥥'
            : `${idx + 1}.`;

      const nameSpan = document.createElement('span');
      nameSpan.className = 'ag-lb-name';
      nameSpan.textContent = `${badge} ${entry.name}`;

      const massSpan = document.createElement('span');
      massSpan.className = 'ag-lb-mass';
      massSpan.textContent = `${entry.mass}`;

      li.appendChild(nameSpan);
      li.appendChild(massSpan);
      this.lbList.appendChild(li);
    });
  }

  private buildSkinGrid(): void {
    this.skinsGrid.innerHTML = '';
    for (const skin of SKINS) {
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = `ag-skin-btn${skin.id === this.selectedSkin ? ' active' : ''}`;

      const swatch = document.createElement('div');
      swatch.className = 'ag-skin-swatch';
      swatch.style.background = `radial-gradient(circle at 35% 30%, ${skin.furLight}, ${skin.furMid} 70%, ${skin.furDark})`;
      swatch.textContent = skin.emoji;

      const label = document.createElement('span');
      label.textContent = skin.name;

      btn.appendChild(swatch);
      btn.appendChild(label);
      btn.onclick = () => {
        agarioAudio.playClick();
        this.selectedSkin = skin.id;
        for (const el of this.skinsGrid.querySelectorAll('.ag-skin-btn')) {
          el.classList.remove('active');
        }
        btn.classList.add('active');
      };

      this.skinsGrid.appendChild(btn);
    }
  }
}
