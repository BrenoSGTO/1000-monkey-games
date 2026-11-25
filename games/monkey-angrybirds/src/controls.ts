import type { ControlsGuideConfig } from '@monkey-slop/sdk';

export const MONKEY_ANGRYBIRDS_CONTROLS: Omit<ControlsGuideConfig, 'slug' | 'title'> = {
  goal: 'Derrube todos os Porcos Faria Limers das fortalezas usando o mínimo de macacos possível!',
  sections: [
    {
      title: 'Estilingue e Poderes',
      icon: '🎯',
      color: '#facc15',
      bindings: [
        {
          inputs: [{ mouse: 'drag' }, { touch: 'drag' }],
          action: 'Mirar e lançar',
          detail: 'Puxe o macaco no estilingue para trás e solte para atirar',
        },
        {
          inputs: [{ mouse: 'left' }, { touch: 'tap' }, 'Space'],
          action: 'Ativar poder no ar',
          detail: 'Clique, toque ou aperte Espaço durante o voo',
        },
        {
          inputs: ['N', 'Space', { ui: '⏭️ Próximo (N)' }],
          action: 'Pular para próximo macaco',
          detail: 'Disponível após o impacto ou no fim do turno',
        },
      ],
    },
    {
      title: 'Câmera e Zoom',
      icon: '🔭',
      color: '#38bdf8',
      bindings: [
        {
          inputs: [{ mouse: 'drag' }, { touch: 'drag' }],
          action: 'Mover câmera',
          detail: 'Arraste o fundo fora do estilingue para espiar o cenário',
        },
        {
          inputs: [{ mouse: 'wheel' }, { ui: '+' }, { ui: '-' }],
          action: 'Aproximar / Afastar zoom',
        },
        {
          inputs: ['C', { ui: '🔭 Castelo' }],
          action: 'Espiar castelo',
          detail: 'Alterna a câmera entre o estilingue e a fortaleza',
        },
      ],
    },
    {
      title: 'Fase e Extras',
      icon: '⚙️',
      color: '#a78bfa',
      bindings: [
        {
          inputs: ['R', { ui: '🔄 Reiniciar' }],
          action: 'Reiniciar fase',
        },
        {
          inputs: [{ ui: '🗺️ Fases' }],
          action: 'Menu de fases e modos',
          detail: 'Troque entre Solo, 2P Local (Hotseat) e Multiplayer',
        },
        {
          inputs: [{ ui: '💬 Zuera' }],
          action: 'Mandar provocação',
          detail: 'Disponível nos modos 2P Local e Multiplayer',
        },
      ],
    },
  ],
  tips: [
    'A linha pontilhada cinza mostra a trajetória do seu último tiro para calibrar a mira.',
    'Cada macaco tem um poder único no ar — ative antes de bater (ou na hora certa com o Bomba)!',
    'Macacos que sobrarem no fim da fase viram bônus de pontuação.',
  ],
};
