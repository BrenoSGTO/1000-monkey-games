import type { ControlsGuideConfig } from '@monkey-slop/sdk';

export const POLYBRIDGE_CONTROLS: Omit<ControlsGuideConfig, 'slug' | 'title'> = {
  goal: 'Construa pontes de gambiarra dentro do orçamento de bananas para os macacos atravessarem sem virar almoço de jacaré!',
  sections: [
    {
      title: 'Construção',
      icon: '🔨',
      color: '#facc15',
      bindings: [
        {
          inputs: [{ mouse: 'drag' }, { touch: 'drag' }, { mouse: 'left' }, { touch: 'tap' }],
          action: 'Construir viga',
          detail: 'Arraste de um pino/grade até outro, ou clique nos dois pontos',
        },
        {
          inputs: [{ mouse: 'right' }, 'X', { ui: '🧽 Apagar' }],
          action: 'Apagar viga',
          detail: 'Clique ou arraste sobre as vigas para remover',
        },
        {
          inputs: ['Esc'],
          action: 'Cancelar traçado / Sair da espionagem',
        },
      ],
    },
    {
      title: 'Materiais',
      icon: '🧱',
      color: '#4ade80',
      bindings: [
        {
          inputs: ['1', { ui: '🪵 Tábua' }],
          action: 'Tábua de Estrada',
          detail: 'Onde os veículos passam (15🍌/100px)',
        },
        {
          inputs: ['2', { ui: '🎋 Bambu' }],
          action: 'Bambu Estrutural',
          detail: 'Leve e barato para treliças (8🍌/100px)',
        },
        {
          inputs: ['3', { ui: '🌿 Cipó' }],
          action: 'Cipó Elástico',
          detail: 'Só puxa em tração — ótimo pra ponte pênsil (7🍌/100px)',
        },
        {
          inputs: ['4', { ui: '🔩 Aço' }],
          action: 'Viga de Aço',
          detail: 'Super forte e pesada (28🍌/100px)',
        },
        {
          inputs: ['5', { ui: '🌀 Mola' }],
          action: 'Mola de Colchão',
          detail: 'Impulsiona veículos em salto (22🍌/100px)',
        },
      ],
    },
    {
      title: 'Ferramentas & Edição',
      icon: '🛠️',
      color: '#38bdf8',
      bindings: [
        {
          inputs: ['Ctrl+Z', { ui: '↩️' }],
          action: 'Desfazer',
        },
        {
          inputs: ['Ctrl+Y', 'Ctrl+Shift+Z', { ui: '↪️' }],
          action: 'Refazer',
        },
        {
          inputs: ['M', { ui: '🪞 Espelhar' }],
          action: 'Espelhar ponte',
          detail: 'Copia a metade com mais vigas para o outro lado',
        },
        {
          inputs: ['T', { ui: '🔺 Auto-Tri' }],
          action: 'Auto-Triangulação',
          detail: 'Cria triângulos de bambu automáticos ao traçar tábuas ou molas',
        },
        {
          inputs: ['H', { ui: '💡 Dica' }],
          action: 'Mostrar dica de engenharia',
        },
        {
          inputs: ['G', { ui: '📏 Grid' }],
          action: 'Alternar grade (Grid)',
        },
        {
          inputs: [{ ui: '🗑️ Limpar' }],
          action: 'Limpar todas as vigas',
          detail: 'Clique duas vezes para confirmar',
        },
      ],
    },
    {
      title: 'Simulação & Multiplayer',
      icon: '🚀',
      color: '#a855f7',
      bindings: [
        {
          inputs: ['Space', { ui: '🚀 SOLTAR OS MACACOS!' }],
          action: 'Iniciar / Parar simulação',
        },
        {
          inputs: ['S', { ui: '🐢 0.35x' }],
          action: 'Câmera lenta (0.35x)',
        },
        {
          inputs: [{ ui: '◀' }, { ui: '▶' }],
          action: 'Trocar de fase',
        },
        {
          inputs: [{ ui: '🤝 Co-op' }, { ui: '⚔️ Duelo' }],
          action: 'Alternar Co-op / Duelo de Orçamento',
        },
        {
          inputs: [{ ui: '👁️' }],
          action: 'Espiar ponte rival (Duelo)',
          detail: 'Use Esc ou Voltar para retornar à sua obra',
        },
        {
          inputs: ['F2', 'F3', 'F4', { ui: '💥 VAI CAIR!' }],
          action: 'Reações rápidas na tela',
          detail: 'F2 NASA • F3 Almoçou • F4 Gambiarra (F1 abre esta cartilha)',
        },
      ],
    },
  ],
  tips: [
    'Triângulos são seus melhores amigos: use Bambu (2) para sustentar a Tábua (1).',
    'Use Espelhar (M) depois de montar metade da ponte para economizar tempo.',
    'No Duelo de Orçamento, quem gastar menos bananas e passar vence — clique em 👁️ para espiar os rivais!',
  ],
};
