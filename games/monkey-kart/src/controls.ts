import type { ControlsGuideConfig } from '@monkey-slop/sdk';

export const MONKEY_KART_CONTROLS: Omit<ControlsGuideConfig, 'slug' | 'title'> = {
  goal: 'Acelere, faça drift nas curvas e use itens malucos para cruzar a linha de chegada em 1º lugar!',
  sections: [
    {
      title: 'Pilotagem (Solo / Online)',
      icon: '🏎️',
      color: '#facc15',
      bindings: [
        {
          inputs: ['WASD', 'Arrows'],
          action: 'Dirigir',
          detail: 'W / ↑ acelera • S / ↓ freia e dá ré • A/D ou ←/→ vira',
        },
        {
          inputs: ['Shift', 'Q', 'X', '.'],
          action: 'Drift (derrapar)',
          detail: 'Segure na curva para carregar faíscas e solte para ganhar mini-turbo',
        },
        {
          inputs: ['Space', 'E', 'Z', 'Enter', '/'],
          action: 'Usar item',
          detail: 'Dispara ou ativa o item pego nas caixas da pista',
        },
      ],
    },
    {
      title: '2 Jogadores — Jogador 1',
      icon: '🐒',
      color: '#38bdf8',
      bindings: [
        {
          inputs: ['WASD'],
          action: 'Dirigir (P1)',
          detail: 'W acelera • S freia/ré • A/D vira',
        },
        {
          inputs: ['Shift', 'Q'],
          action: 'Drift (P1)',
          detail: 'Shift esquerdo ou Q',
        },
        {
          inputs: ['Space', 'E'],
          action: 'Usar item (P1)',
        },
      ],
    },
    {
      title: '2 Jogadores — Jogador 2',
      icon: '🐵',
      color: '#fb7185',
      bindings: [
        {
          inputs: ['Arrows'],
          action: 'Dirigir (P2)',
          detail: '↑ acelera • ↓ freia/ré • ←/→ vira',
        },
        {
          inputs: ['Shift', '.', '0'],
          action: 'Drift (P2)',
          detail: 'Shift direito, ponto (.) ou 0 do teclado numérico',
        },
        {
          inputs: ['Enter', '/'],
          action: 'Usar item (P2)',
          detail: 'Enter, Enter numérico ou barra (/)',
        },
      ],
    },
    {
      title: 'Celular & Atalhos',
      icon: '📱',
      color: '#4ade80',
      bindings: [
        {
          inputs: [{ touch: 'hold' }, { ui: '◀' }, { ui: '▶' }, { ui: 'ACELERA' }, { ui: 'RÉ' }],
          action: 'Dirigir no toque',
          detail: 'Botões na tela aparecem automaticamente no celular (modo Solo/Online)',
        },
        {
          inputs: [{ touch: 'hold' }, { ui: 'DRIFT' }],
          action: 'Drift no toque',
        },
        {
          inputs: [{ touch: 'tap' }, { ui: 'ITEM' }],
          action: 'Usar item no toque',
        },
        {
          inputs: ['Esc', 'P'],
          action: 'Pausar / Continuar',
        },
        {
          inputs: ['R'],
          action: 'Reiniciar corrida',
          detail: 'Disponível no Solo, 2P ou para o host no Online',
        },
      ],
    },
  ],
  tips: [
    'Largada turbo: aperte acelerar só no "2" da contagem regressiva — cedo demais afoga o motor!',
    'Drift por mais tempo carrega faíscas azuis → laranjas → roxas para turbos mais fortes.',
    'Controle USB/Bluetooth também funciona: analógico/D-pad vira, A acelera, B ré, LB/RB drift, X/Y item e Start pausa.',
  ],
};
