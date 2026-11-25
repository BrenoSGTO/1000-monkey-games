import type { ControlsGuideConfig } from '@monkey-slop/sdk';

export const MONKEY_SIMS_CONTROLS: Omit<ControlsGuideConfig, 'slug' | 'title'> = {
  goal: 'Cuide das necessidades da sua macacada, decore a casa na árvore e evite incêndios na cozinha!',
  sections: [
    {
      title: 'Ações & Interação',
      icon: '🐒',
      color: '#4ade80',
      bindings: [
        {
          inputs: [{ mouse: 'left' }, { touch: 'tap' }],
          action: 'Andar ou interagir',
          detail: 'Clique no chão para andar; em móveis, macacos, fogo ou poças abre o menu de ações',
        },
        {
          inputs: ['Tab'],
          action: 'Trocar de macaco',
          detail: 'Alterna entre os macacos locais (ou clique no retrato embaixo)',
        },
        {
          inputs: [{ ui: '💼 Trabalhar' }],
          action: 'Ir trabalhar',
          detail: 'Manda o macaco ativo ganhar bananas fora de casa',
        },
        {
          inputs: [{ mouse: 'right' }, 'Esc'],
          action: 'Fechar menu de ações',
        },
      ],
    },
    {
      title: 'Câmera',
      icon: '🎥',
      color: '#38bdf8',
      bindings: [
        {
          inputs: ['WASD', 'Arrows'],
          action: 'Mover câmera',
        },
        {
          inputs: [{ mouse: 'right' }, { mouse: 'middle' }],
          action: 'Arrastar câmera',
          detail: 'Segure e arraste para navegar pela casa',
        },
        {
          inputs: [{ mouse: 'wheel' }],
          action: 'Zoom',
          detail: 'Aproxima ou afasta a visão',
        },
        {
          inputs: [{ ui: '🎯' }],
          action: 'Centralizar câmera',
        },
      ],
    },
    {
      title: 'Tempo & Simulação',
      icon: '⏱️',
      color: '#facc15',
      bindings: [
        {
          inputs: ['Space', { ui: '⏸' }],
          action: 'Pausar / Retomar',
        },
        {
          inputs: ['1', '2', '3'],
          action: 'Velocidade (1x, 2x, 3x)',
          detail: 'Também nos botões do topo direito',
        },
      ],
    },
    {
      title: 'Loja & Construção',
      icon: '🛒',
      color: '#fb923c',
      bindings: [
        {
          inputs: ['B', { ui: '🛒 Loja (B)' }],
          action: 'Abrir / Fechar Loja',
        },
        {
          inputs: [{ mouse: 'left' }, { touch: 'tap' }],
          action: 'Comprar, mover ou vender móvel',
          detail: 'Com a Loja aberta, escolha a ferramenta e clique no mapa',
        },
        {
          inputs: ['R', { ui: '🔄 Girar (R)' }],
          action: 'Girar móvel',
          detail: 'Funciona com a Loja aberta',
        },
        {
          inputs: ['Esc'],
          action: 'Sair da Loja',
        },
      ],
    },
  ],
  tips: [
    'Cuidado com o fogão e eletrônicos: macacos distraídos podem causar incêndios ou poças!',
    'Clique nos ícones da fila de ações no canto esquerdo para cancelar uma tarefa.',
    'No Co-op Online (canto superior esquerdo), até 6 jogadores dividem a mesma casa na árvore.',
  ],
};
