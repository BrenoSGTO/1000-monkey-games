import type { ControlsGuideConfig } from '@monkey-slop/sdk';

export const MONKEY_MOTORWAYS_CONTROLS: Omit<ControlsGuideConfig, 'slug' | 'title'> = {
  goal: 'Ligue as casinhas dos macacos aos mercados da mesma cor e fruta antes que a fila transborde!',
  sections: [
    {
      title: 'Construção & Mapa',
      icon: '🛣️',
      color: '#facc15',
      bindings: [
        {
          inputs: [{ mouse: 'drag' }, { touch: 'drag' }],
          action: 'Construir estrada',
          detail: 'Arraste para pré-visualizar a rota e solte para confirmar',
        },
        {
          inputs: [{ mouse: 'left' }, { touch: 'tap' }],
          action: 'Usar ferramenta ativa',
          detail: 'Coloca Semáforo, Rotatória ou inicia/conclui Cipó Express',
        },
        {
          inputs: [{ mouse: 'right' }, '5', { ui: '🧹 Borracha' }],
          action: 'Apagar e recuperar peças',
          detail: 'Clique ou arraste com o botão direito (também cancela pré-visualização)',
        },
        {
          inputs: ['Ctrl+Z', { ui: '↩️ Desfazer' }],
          action: 'Desfazer última ação',
          detail: 'Reverte até os últimos 25 traçados ou alterações',
        },
      ],
    },
    {
      title: 'Ferramentas',
      icon: '🧰',
      color: '#fb923c',
      bindings: [
        {
          inputs: ['1', { ui: '🛣️ Estrada' }],
          action: 'Estrada',
        },
        {
          inputs: ['2', { ui: '🚦 Semáforo' }],
          action: 'Semáforo',
          detail: 'Alterna o fluxo em cruzamentos',
        },
        {
          inputs: ['3', { ui: '🔄 Rotatória' }],
          action: 'Rotatória',
          detail: 'Fluxo circular contínuo sem paradas',
        },
        {
          inputs: ['4', { ui: '🌿 Cipó Express' }],
          action: 'Cipó Express',
          detail: 'Via aérea por cima de rios, prédios e trânsito',
        },
        {
          inputs: ['5', { ui: '🧹 Borracha' }],
          action: 'Borracha',
        },
      ],
    },
    {
      title: 'Tempo, Visual & Menus',
      icon: '⏱️',
      color: '#4ade80',
      bindings: [
        {
          inputs: ['Space', { ui: '⏸' }],
          action: 'Pausar / Retomar',
        },
        {
          inputs: ['F', { ui: '2x' }],
          action: 'Alternar velocidade 2x',
          detail: 'Alterna entre 1x (Normal) e 2x (Turbo)',
        },
        {
          inputs: ['N', { ui: '☀️ Dia' }],
          action: 'Modo Dia / Noite',
        },
        {
          inputs: ['Esc', { ui: '🗺️ Mapas' }],
          action: 'Cancelar ação ou abrir Mapas',
          detail: 'Cancela traçado/Cipó atual ou abre o menu de cidades',
        },
        {
          inputs: ['F1', { ui: '🎮 Controles' }],
          action: 'Abrir / fechar esta cartilha',
        },
      ],
    },
    {
      title: 'Co-op Online',
      icon: '🐒',
      color: '#38bdf8',
      bindings: [
        {
          inputs: ['P', { ui: '📣 Pingar' }],
          action: 'Enviar Ping no mapa',
          detail: 'Aperte P sobre uma célula ou clique com a ferramenta Pingar',
        },
        {
          inputs: [{ ui: '🚨 Engarrafou!' }],
          action: 'Escolher mensagem do Ping',
          detail: 'Selecione o preset na barra acima das ferramentas',
        },
      ],
    },
  ],
  tips: [
    'Pontes de Bambu são usadas automaticamente ao cruzar rios — economize!',
    'Apagar trechos com o botão direito devolve todas as peças ao estoque.',
    'No Co-op Online, a equipe vota nos upgrades semanais e vê os cursores ao vivo.',
  ],
};
