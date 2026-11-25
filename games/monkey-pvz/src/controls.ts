import type { ControlsGuideConfig } from '@monkey-slop/sdk';

/**
 * Cartilha de controles ilustrada de Bananeiras vs Gorilas Zumbis.
 * Passada para `mountMonkeyHud` em `net.ts`.
 */
export const PVZ_CONTROLS: Omit<ControlsGuideConfig, 'slug' | 'title'> = {
  goal: 'Plante bananeiras, colha bananas e impeça a gorilada zumbi de invadir a casa do macaco!',
  sections: [
    {
      title: 'Plantar e Colher',
      icon: '🌱',
      color: '#84cc16',
      bindings: [
        {
          inputs: [{ mouse: 'left' }, { touch: 'tap' }],
          action: 'Selecionar semente e plantar',
          detail: 'Clique na carta da bandeja e depois em um quadrado livre do gramado (ou na linha, no modo Versus como gorila).',
        },
        {
          inputs: ['1'],
          action: 'Atalho rápido da bandeja',
          detail: 'Teclas 1 a 9 (e 0 para o 10º espaço) selecionam plantas ou gorilas.',
        },
        {
          inputs: ['Shift+' + 'Clique'],
          action: 'Plantar vários seguidos',
          detail: 'Segure Shift ao clicar no gramado para manter a mesma semente ou gorila selecionado.',
        },
        {
          inputs: [{ mouse: 'move' }, { mouse: 'left' }, { touch: 'tap' }],
          action: 'Pegar bananas',
          detail: 'Passe o mouse por cima ou toque nas bananas que caem do céu e das bananeiras.',
        },
      ],
    },
    {
      title: 'Ferramentas e Partida',
      icon: '🛠️',
      color: '#facc15',
      bindings: [
        {
          inputs: ['S', { ui: 'PÁ' }],
          action: 'Arrancar planta (Pá)',
          detail: 'Ative a pá e clique na planta que deseja remover do gramado.',
        },
        {
          inputs: [{ mouse: 'right' }, 'Esc'],
          action: 'Cancelar seleção / guardar pá',
          detail: 'Com nada selecionado, Esc também pausa a partida solo.',
        },
        {
          inputs: ['F', { ui: '▶ 1x' }],
          action: 'Velocidade 1x / 2x',
          detail: 'Acelera ou normaliza o ritmo da partida (disponível no modo Solo).',
        },
        {
          inputs: ['Space', { ui: '⏸' }],
          action: 'Pausar / Continuar',
          detail: 'Pausa a partida no modo Solo. Em Co-op e Versus online o jogo não pausa.',
        },
      ],
    },
  ],
  tips: [
    'Plante Bananeiras logo no começo para nunca faltar banana na defesa.',
    'Na esteira rolante (mini-games), as plantas chegam de graça — plante rápido antes que acumule!',
    'No Co-op Online, um cuida das linhas de cima e o outro das de baixo; a do meio é dos dois.',
  ],
};
