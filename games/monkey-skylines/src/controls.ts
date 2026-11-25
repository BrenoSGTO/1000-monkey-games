import type { ControlsGuideConfig } from '@monkey-slop/sdk';

export type SkylineControlsConfig = Omit<ControlsGuideConfig, 'slug' | 'title' | 'onOpenChange'>;

export const SKYLINE_CONTROLS: SkylineControlsConfig = {
  goal: 'Construa e equilibre uma metrópole primata com energia, estradas e muita banana — sem deixar a macacada falir ou se rebelar!',
  sections: [
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
          detail: 'Ou segure Shift + clique esquerdo e arraste',
        },
        {
          inputs: [{ mouse: 'wheel' }],
          action: 'Zoom (aproximar / afastar)',
        },
        {
          inputs: ['C', { ui: '🎯' }],
          action: 'Centralizar na Prefeitura',
        },
      ],
    },
    {
      title: 'Construção & Ferramentas',
      icon: '🏗️',
      color: '#facc15',
      bindings: [
        {
          inputs: [{ mouse: 'left' }, { touch: 'tap' }, { touch: 'drag' }],
          action: 'Construir / usar ferramenta',
          detail: 'Arraste para pintar em sequência; na Estrada, arrasta em L com prévia',
        },
        {
          inputs: ['0'],
          action: 'Inspecionar / Reparar',
          detail: 'Ver status, lucro, dono ou consertar prédios danificados',
        },
        {
          inputs: ['1', '2', '3', '4'],
          action: 'Estrada, Barraco, Feira, Fábrica',
          detail: 'Atalhos 1 a 4 da barra inferior',
        },
        {
          inputs: ['5', '6', '7'],
          action: 'Usina, Praça e Lixão',
          detail: 'Atalhos 5 a 7 da barra inferior',
        },
        {
          inputs: ['8', 'B', 'X'],
          action: 'Demolidor',
          detail: 'Demole com reembolso de 50% (limpar árvore custa 5🍌)',
        },
        {
          inputs: ['Ctrl+Z', { ui: '↩️' }],
          action: 'Desfazer última ação',
          detail: 'Guarda até 20 construções ou demolições',
        },
        {
          inputs: ['Esc'],
          action: 'Cancelar / Inspecionar',
          detail: 'Cancela Ping, fecha o Inspetor ou volta para Inspecionar (0)',
        },
      ],
    },
    {
      title: 'Tempo, Visão & Ações',
      icon: '⏱️',
      color: '#4ade80',
      bindings: [
        {
          inputs: ['Space', { ui: '⏸' }, { ui: '1x' }, { ui: '2x' }],
          action: 'Pausar / velocidade do tempo',
          detail: 'Espaço alterna entre Pausa e 1x',
        },
        {
          inputs: ['V', { ui: '👁️' }],
          action: 'Trocar camada de visão',
          detail: 'Alterna Normal, Energia, Felicidade e Poluição',
        },
        {
          inputs: ['P', { ui: '📍 Ping' }],
          action: 'Pingar no mapa',
          detail: 'Aponta um local para amigos no Co-op',
        },
        {
          inputs: [{ ui: '🚨 Caos' }],
          action: 'Lançar desastre aleatório',
          detail: 'Recarga de 12s (sincronizado no Co-op)',
        },
        {
          inputs: ['Enter', 'Space'],
          action: 'Assumir Prefeitura',
          detail: 'Fecha a tela inicial e começa a partida',
        },
      ],
    },
  ],
  tips: [
    'Energia primeiro: Usinas (5) iluminam num raio azul; prédios sem luz ou estrada não funcionam.',
    'Arraste a Estrada (1) para traçar avenidas em L; sobre o rio ela vira Ponte (custo 2x).',
    'Mantenha Fábricas (4) e Lixões (7) longe dos Barracos (2) para não derrubar a felicidade.',
    'No Co-op ou 2P Local, use o Ping (P) para combinar onde construir antes de gastar bananas!',
  ],
};
