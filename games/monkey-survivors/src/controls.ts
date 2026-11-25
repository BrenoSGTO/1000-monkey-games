import type { MonkeyHudOptions } from '@monkey-slop/sdk';

export const MONKEY_SURVIVORS_CONTROLS: NonNullable<MonkeyHudOptions['controls']> = {
  goal: 'Sobreviva 15 minutos contra a horda de boletos e derrote a Ceifadora do Serasa — seus ataques são automáticos, fuja, colete XP e evolua suas armas!',
  sections: [
    {
      title: 'Movimento',
      icon: '🏃',
      color: '#4ade80',
      bindings: [
        {
          inputs: ['WASD', 'Arrows'],
          action: 'Mover o macaco',
          detail: 'Os ataques disparam sozinhos automaticamente',
        },
        {
          inputs: [{ touch: 'drag' }, { mouse: 'drag' }],
          action: 'Joystick virtual na tela',
          detail: 'Segure e arraste em qualquer ponto do mapa',
        },
      ],
    },
    {
      title: 'Upgrades & Level Up',
      icon: '🍌',
      color: '#facc15',
      bindings: [
        {
          inputs: ['1', '2', '3'],
          action: 'Escolher carta de upgrade',
          detail: 'Atalho rápido ao subir de nível',
        },
        {
          inputs: [{ mouse: 'left' }, { touch: 'tap' }],
          action: 'Selecionar carta ou botão',
          detail: 'Funciona nos menus, loja da selva e level up',
        },
      ],
    },
    {
      title: 'Pausa & Menus',
      icon: '⚙️',
      color: '#38bdf8',
      bindings: [
        {
          inputs: ['P', 'Esc', { ui: '⏸' }],
          action: 'Pausar / Continuar',
          detail: 'Disponível apenas no modo Solo',
        },
        {
          inputs: [{ ui: 'Co-op Online' }],
          action: 'Sala multiplayer (2–4 macacos)',
          detail: 'Botão no topo esquerdo; no Co-op o jogo não pausa',
        },
      ],
    },
  ],
  tips: [
    'Ataques são automáticos — concentre-se em desviar dos boletos e coletar gemas de XP.',
    'Leve uma arma ao nível máximo com sua passiva correspondente e abra um Baú do FGTS para evoluí-la!',
    'No Co-op, encoste por 2s em um colega caído para revivê-lo (siga a seta verde 🚑).',
  ],
};
