import type { ControlsGuideConfig } from '@monkey-slop/sdk';

export const AGARIO_CONTROLS: Omit<ControlsGuideConfig, 'slug' | 'title' | 'onOpenChange'> = {
  goal: 'Coma bananas e macacos menores para crescer, domine o ranking da selva e não vire vitamina!',
  sections: [
    {
      title: 'Movimento',
      icon: '🏃',
      color: '#4ade80',
      bindings: [
        {
          inputs: [{ mouse: 'move' }],
          action: 'Mover com o mouse',
          detail: 'O macaco segue o cursor pela arena',
        },
        {
          inputs: ['Arrows', 'A', 'S', 'D'],
          action: 'Mover pelo teclado',
          detail: 'Setas movem em todas as direções; A/S/D também movem (W arremessa banana)',
        },
        {
          inputs: [{ touch: 'drag' }],
          action: 'Mover no celular',
          detail: 'Arraste o joystick virtual no canto inferior esquerdo',
        },
      ],
    },
    {
      title: 'Ações',
      icon: '🍌',
      color: '#facc15',
      bindings: [
        {
          inputs: ['Space', { ui: '✂️ Dividir' }],
          action: 'Dividir macaco',
          detail: 'Lança metade da massa para frente para dar bote ou fugir',
        },
        {
          inputs: ['W', { mouse: 'right' }, { ui: '🍌 Jogar' }],
          action: 'Arremessar banana',
          detail: 'Solta um pouco de massa para alimentar aliados ou empurrar cactos',
        },
      ],
    },
    {
      title: 'Menus',
      icon: '📋',
      color: '#38bdf8',
      bindings: [
        {
          inputs: ['Enter'],
          action: 'Começar partida',
          detail: 'Quando o foco estiver no campo de apelido',
        },
      ],
    },
  ],
  tips: [
    'Macacos maiores andam mais devagar, mas engolem os menores!',
    'Cuidado com os cactos verdes: se você for grande demais, eles te explodem em vários pedaços.',
    'Arremesse bananas (W ou botão direito) em um cacto para lançá-lo contra rivais!',
    'No modo Times (🍌 vs 🥥), colegas da mesma equipe não se engolem.',
  ],
};
