import type { ControlsGuideConfig } from '@monkey-slop/sdk';

export function createValleyControls(
  onOpenChange: (open: boolean) => void,
): Omit<ControlsGuideConfig, 'slug' | 'title'> {
  return {
    goal: 'Transforme o matagal do Vovô Zeca numa roça próspera: plante bananas, pesque, minere e faça amizade com a Vila Bananal!',
    autoOpenFirstVisit: false,
    onOpenChange,
    sections: [
      {
        title: 'Movimento',
        icon: '🏃',
        color: '#4ade80',
        bindings: [
          {
            inputs: ['WASD', 'Arrows', { touch: 'drag' }],
            action: 'Andar',
            detail: 'No celular, arraste o joystick virtual à esquerda',
          },
          {
            inputs: ['Shift'],
            action: 'Correr',
            detail: 'Segure enquanto anda',
          },
        ],
      },
      {
        title: 'Roça e Ações',
        icon: '🌾',
        color: '#facc15',
        bindings: [
          {
            inputs: ['Space', 'J', { mouse: 'left' }, { ui: 'A' }],
            action: 'Usar ferramenta ou item',
            detail: 'Arar, plantar, regar, cortar, minerar e pescar (segure na barra verde)',
          },
          {
            inputs: ['E', { ui: 'E' }],
            action: 'Interagir',
            detail: 'Conversar, portas, dormir, caixa de entrega, animais e escadas',
          },
          {
            inputs: ['F'],
            action: 'Presentear ou comer',
            detail: 'Perto de um morador, entrega o item; senão, come o alimento selecionado',
          },
        ],
      },
      {
        title: 'Barra e Inventário',
        icon: '🎒',
        color: '#38bdf8',
        bindings: [
          {
            inputs: ['1–9', { mouse: 'left' }],
            action: 'Escolher slot da barra',
            detail: '0, - e = selecionam os slots 10, 11 e 12; clicar no slot ativo come alimentos',
          },
          {
            inputs: ['Q', 'R', { mouse: 'wheel' }, { ui: '⇄' }],
            action: 'Trocar item da barra',
            detail: 'Q volta, R avança, ou gire a rodinha do mouse',
          },
          {
            inputs: ['Tab', 'I', { ui: '🎒' }],
            action: 'Mochila, Amizades e Status',
            detail: 'Abre e fecha o inventário completo',
          },
        ],
      },
      {
        title: 'Diálogos e Menus',
        icon: '💬',
        color: '#f472b6',
        bindings: [
          {
            inputs: ['Space', 'E', 'Enter', { mouse: 'left' }],
            action: 'Avançar diálogo',
          },
          {
            inputs: ['Esc', { ui: '☰' }],
            action: 'Pausa / Fechar janela',
            detail: 'Também cancela a pesca ou acorda da soneca',
          },
          {
            inputs: ['F1', { ui: '🎮 Controles' }],
            action: 'Abrir esta cartilha',
          },
        ],
      },
    ],
    tips: [
      'O regador (slot 2) enche quando usado de frente para o rio, lago ou mar.',
      'Na pesca (slot 5), aperte Espaço ou clique ao ver o "!" e segure para manter o peixe na barra verde.',
      'No celular, os botões virtuais (joystick, A, E, ⇄, 🎒 e ☰) aparecem automaticamente.',
      'Durma na porta da sua casa antes das 02:00 para não desmaiar de cansaço!',
    ],
  };
}
