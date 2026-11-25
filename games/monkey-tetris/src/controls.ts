import type { ControlsGuideConfig } from '@monkey-slop/sdk';

export const MONKEY_TETRIS_CONTROLS: Omit<ControlsGuideConfig, 'slug' | 'title'> = {
  goal: 'Empilhe caixotes de banana sem deixar chegar ao topo — limpe várias linhas de uma vez para mandar cascas de banana nos rivais!',
  sections: [
    {
      title: 'Solo / Bot / Online',
      icon: '🍌',
      color: '#facc15',
      bindings: [
        {
          inputs: ['A', 'D', 'ArrowLeft', 'ArrowRight'],
          action: 'Mover peça',
          detail: 'Esquerda e direita',
        },
        {
          inputs: ['S', 'ArrowDown'],
          action: 'Queda suave',
          detail: 'Desce mais rápido e dá pontos extras',
        },
        {
          inputs: ['Space'],
          action: 'Queda instantânea',
          detail: 'Trava a peça direto na sombra',
        },
        {
          inputs: ['W', 'ArrowUp', 'X'],
          action: 'Girar sentido horário',
        },
        {
          inputs: ['Z', 'Q', 'Ctrl'],
          action: 'Girar sentido anti-horário',
          detail: 'Ctrl esquerdo também gira',
        },
        {
          inputs: ['C', 'Shift'],
          action: 'Guardar peça (Hold)',
          detail: 'Troca pela peça reservada (1x por peça)',
        },
      ],
    },
    {
      title: '2P Local — Macaco 1 (Esquerda)',
      icon: '🐒',
      color: '#fbbf24',
      bindings: [
        {
          inputs: ['A', 'D'],
          action: 'Mover peça',
        },
        {
          inputs: ['S'],
          action: 'Queda suave',
        },
        {
          inputs: ['Space', 'F'],
          action: 'Queda instantânea',
        },
        {
          inputs: ['W'],
          action: 'Girar horário',
        },
        {
          inputs: ['Q'],
          action: 'Girar anti-horário',
        },
        {
          inputs: ['C', 'E'],
          action: 'Guardar peça (Hold)',
        },
      ],
    },
    {
      title: '2P Local — Macaco 2 (Direita)',
      icon: '🦍',
      color: '#38bdf8',
      bindings: [
        {
          inputs: ['ArrowLeft', 'ArrowRight'],
          action: 'Mover peça',
        },
        {
          inputs: ['ArrowDown'],
          action: 'Queda suave',
        },
        {
          inputs: ['Enter', '0', '/'],
          action: 'Queda instantânea',
          detail: 'Enter, 0 do numérico ou /',
        },
        {
          inputs: ['ArrowUp'],
          action: 'Girar horário',
        },
        {
          inputs: ['.', 'Ctrl'],
          action: 'Girar anti-horário',
          detail: 'Ponto (.) ou Ctrl direito',
        },
        {
          inputs: ['Shift', 'M', ','],
          action: 'Guardar peça (Hold)',
          detail: 'Shift direito, M ou vírgula (,)',
        },
      ],
    },
    {
      title: 'Toque / Celular',
      icon: '📱',
      color: '#4ade80',
      bindings: [
        {
          inputs: [{ touch: 'tap' }, { ui: '↻' }, { ui: '↺' }],
          action: 'Girar peça',
          detail: 'Toque rápido na tela gira no sentido horário',
        },
        {
          inputs: [{ touch: 'drag' }, { ui: '◀' }, { ui: '▶' }, { ui: '▼' }],
          action: 'Mover e descer',
          detail: 'Arraste para os lados ou para baixo na tela',
        },
        {
          inputs: [{ touch: 'swipe' }, { ui: '💥 QUEDA RÁPIDA' }],
          action: 'Queda instantânea',
          detail: 'Deslize rápido para baixo na tela',
        },
        {
          inputs: [{ ui: '📦 GUARDAR (HOLD)' }],
          action: 'Guardar peça (Hold)',
          detail: 'Ative os botões na tela em 📱 Touch',
        },
      ],
    },
    {
      title: 'Partida & Atalhos',
      icon: '⚙️',
      color: '#c084fc',
      bindings: [
        {
          inputs: ['B'],
          action: 'Buzina Macaca',
          detail: 'Solta provocação sonora na partida',
        },
        {
          inputs: ['P'],
          action: 'Pausar / Retomar',
          detail: 'Disponível nos modos offline',
        },
        {
          inputs: ['R', { ui: '🔄 Reiniciar' }],
          action: 'Reiniciar partida',
          detail: 'No Online P2P, apenas o Host reinicia',
        },
        {
          inputs: [{ ui: '🎵 Música: ON' }, { ui: '📱 Touch' }, { ui: '📋 Menu' }],
          action: 'Opções no topo direito',
          detail: 'Alternar música, botões touch ou voltar ao menu',
        },
      ],
    },
  ],
  tips: [
    'Limpar 2, 3 ou 4 linhas (MACACTRIS!) envia cascas de banana de lixo para o oponente.',
    'Encaixar a peça T girando no último instante ativa o T-Giro, com bônus de pontos e ataque!',
    'Combos seguidos multiplicam o ataque — use o Hold (C ou Shift) para guardar a barra longa.',
  ],
};
