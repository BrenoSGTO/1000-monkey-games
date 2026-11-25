import type { ControlsGuideConfig } from '@monkey-slop/sdk';

export type FlappyControlsConfig = Omit<ControlsGuideConfig, 'slug' | 'title'>;

export function createFlappyControlsConfig(
  onOpenChange: (open: boolean) => void,
): FlappyControlsConfig {
  return {
    goal: 'Bata sua hélice de banana para desviar dos obstáculos, coletar bananas e sobreviver pelos biomas sem passar vergonha.',
    sections: [
      {
        title: 'Voo (Solo / Online)',
        icon: '🍌',
        bindings: [
          {
            inputs: ['Space', 'W', 'ArrowUp', { mouse: 'left' }, { touch: 'tap' }],
            action: 'Bater hélice (Voar)',
            detail: 'Dá um impulso para cima',
          },
        ],
      },
      {
        title: 'Jogador 1 (2P Local)',
        icon: '🐒',
        color: '#facc15',
        bindings: [
          {
            inputs: ['W', 'Space', { mouse: 'left' }, { touch: 'tap' }],
            action: 'Voar (P1)',
            detail: 'Com mouse ou toque, use a metade esquerda da tela',
          },
        ],
      },
      {
        title: 'Jogador 2 (2P Local)',
        icon: '🐵',
        color: '#38bdf8',
        bindings: [
          {
            inputs: ['ArrowUp', 'K', 'Enter', { mouse: 'left' }, { touch: 'tap' }],
            action: 'Voar (P2)',
            detail: 'Com mouse ou toque, use a metade direita da tela',
          },
        ],
      },
      {
        title: 'Ações e Atalhos',
        icon: '📯',
        bindings: [
          {
            inputs: ['B', { ui: '📯 Buzina (B)' }],
            action: 'Buzinar',
            detail: 'Solta uma frase e buzina na contagem ou no voo (visível no Online)',
          },
          {
            inputs: ['R', { ui: '🔄 JOGAR DE NOVO (R)' }],
            action: 'Reiniciar corrida',
            detail: 'Começa uma nova tentativa durante o voo ou no fim de jogo',
          },
          {
            inputs: ['Space', 'Enter'],
            action: 'Iniciar / Jogar de novo',
            detail: 'Atalho na tela inicial e após o fim de jogo',
          },
        ],
      },
    ],
    tips: [
      'Colete 🧲 Ímã para puxar bananas, 🥥 Escudo para aguentar 1 batida e 🔥 Turbo para esmagar obstáculos.',
      'No modo 2P Local, clique ou toque na metade esquerda (P1) ou direita (P2) da tela.',
      'No modo Online, use "🐒 Co-op Online" no topo esquerdo para criar ou entrar em uma sala.',
    ],
    onOpenChange,
  };
}
