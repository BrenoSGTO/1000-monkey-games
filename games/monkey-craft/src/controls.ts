import type { ControlsGuideConfig } from '@monkey-slop/sdk';

type ControlsConfig = Omit<ControlsGuideConfig, 'slug' | 'title'>;

export function createMonkeyCraftControls(onOpenChange: (open: boolean) => void): ControlsConfig {
  return {
    goal: 'Cave fundo, sobreviva às noites da selva e forje a lendária Picareta de Bananita! 🍌⛏️',
    onOpenChange,
    sections: [
      {
        title: 'Movimento',
        icon: '🏃',
        color: '#4ade80',
        bindings: [
          {
            inputs: ['A', 'D', 'ArrowLeft', 'ArrowRight'],
            action: 'Andar',
          },
          {
            inputs: ['W', 'Space', 'ArrowUp'],
            action: 'Pular / Nadar / Subir escada',
          },
          {
            inputs: ['S', 'ArrowDown'],
            action: 'Descer escada',
          },
        ],
      },
      {
        title: 'Minerar, Construir e Combate',
        icon: '⛏️',
        color: '#facc15',
        bindings: [
          {
            inputs: [{ mouse: 'move' }],
            action: 'Mirar',
            detail: 'Aponta para o bloco ou criatura sob o cursor',
          },
          {
            inputs: [{ mouse: 'left' }],
            action: 'Minerar / Atacar',
            detail: 'Segure para quebrar blocos; clique para bater em criaturas',
          },
          {
            inputs: [{ mouse: 'right' }],
            action: 'Colocar bloco / Usar / Comer',
            detail: 'Coloca o bloco selecionado, come comida ou abre bancada/fornalha',
          },
          {
            inputs: ['1', '9', { mouse: 'wheel' }],
            action: 'Trocar item da barra',
            detail: 'Teclas 1 a 9, rodinha do mouse ou clique direto no slot',
          },
        ],
      },
      {
        title: 'Mochila e Receitas',
        icon: '🎒',
        color: '#38bdf8',
        bindings: [
          {
            inputs: ['E', 'I', 'Tab'],
            action: 'Abrir / fechar Mochila e Receitas',
          },
          {
            inputs: [{ mouse: 'left' }],
            action: 'Pegar / soltar item ou fabricar',
          },
          {
            inputs: [{ mouse: 'right' }],
            action: 'Pegar metade / soltar 1 item',
          },
          {
            inputs: ['Shift+' + 'Clique'],
            action: 'Mover rápido entre barra e mochila',
            detail: 'Segure Shift e clique no slot',
          },
          {
            inputs: [{ mouse: 'wheel' }],
            action: 'Rolar lista de receitas',
          },
        ],
      },
      {
        title: 'Câmera, Emote e Menus',
        icon: '⚙️',
        color: '#c084fc',
        bindings: [
          {
            inputs: ['Q'],
            action: 'Grito de macaco (Emote)',
          },
          {
            inputs: ['+', '-'],
            action: 'Aproximar / afastar zoom',
            detail: 'Também funciona com = para aproximar',
          },
          {
            inputs: ['Esc'],
            action: 'Pausar / fechar mochila',
          },
          {
            inputs: ['F1'],
            action: 'Abrir / fechar esta cartilha',
          },
        ],
      },
      {
        title: 'Celular / Toque',
        icon: '📱',
        color: '#fb923c',
        bindings: [
          {
            inputs: [{ ui: '◀' }, { ui: '▶' }, { ui: '⬆' }, { ui: '▼' }],
            action: 'Andar, pular e descer escada',
          },
          {
            inputs: [{ touch: 'hold' }, { touch: 'tap' }],
            action: 'Minerar, atacar ou colocar bloco',
            detail: 'Depende do modo selecionado no botão abaixo',
          },
          {
            inputs: [{ ui: '⛏️' }, { ui: '🧱' }],
            action: 'Alternar modo Minerar / Colocar',
          },
          {
            inputs: [{ ui: '🎒' }, { ui: '🙊' }, { ui: '⏸' }],
            action: 'Mochila, emote e pausa',
          },
        ],
      },
    ],
    tips: [
      'À noite aparecem Capivaras Zumbis e Pombos Explosivos — construa abrigo e tochas!',
      'Fique perto da Bancada ou Fornalha e aperte E (ou clique direito nela) para liberar novas receitas.',
      'Mantenha a fome cheia com bananas para regenerar vida automaticamente.',
    ],
  };
}
