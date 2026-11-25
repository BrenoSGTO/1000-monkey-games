import type { ControlsGuideConfig } from '@monkey-slop/sdk';

export function createControlsConfig(onOpenChange: (open: boolean) => void): ControlsGuideConfig {
  return {
    slug: 'monkey-pico-park',
    title: 'Mico Park: A Chave da Banana',
    goal: 'Pegue a chave da banana, empurre caixas e empilhe a macacada até todos entrarem na porta!',
    onOpenChange,
    sections: [
      {
        title: 'Solo & Online',
        icon: '🐒',
        color: '#facc15',
        bindings: [
          {
            inputs: ['A', 'D', 'ArrowLeft', 'ArrowRight'],
            action: 'Mover para os lados',
          },
          {
            inputs: ['W', 'ArrowUp', 'Space'],
            action: 'Pular',
            detail: 'Suba na cabeça de outros macacos para formar uma torre',
          },
          {
            inputs: ['E', 'B'],
            action: 'Gritar!',
            detail: 'Solta um grito de macaco para chamar a atenção do bando',
          },
          {
            inputs: ['Tab', 'Q'],
            action: 'Próximo macaco (Solo)',
          },
          {
            inputs: ['1', '2', '3'],
            action: 'Escolher macaco (Solo)',
          },
          {
            inputs: ['F', { ui: '🐾 Seguir' }],
            action: 'Seguir / Parar (Solo)',
            detail: 'Faz os outros macacos seguirem o macaco ativo',
          },
        ],
      },
      {
        title: 'Jogador 1 (Local 2P / 3P)',
        icon: '🍌',
        color: '#facc15',
        bindings: [
          {
            inputs: ['A', 'D'],
            action: 'Mover',
          },
          {
            inputs: ['W', 'Space'],
            action: 'Pular',
          },
          {
            inputs: ['E', 'B'],
            action: 'Gritar!',
          },
        ],
      },
      {
        title: 'Jogador 2 (Local 2P / 3P)',
        icon: '🌿',
        color: '#4ade80',
        bindings: [
          {
            inputs: ['ArrowLeft', 'ArrowRight'],
            action: 'Mover',
          },
          {
            inputs: ['ArrowUp'],
            action: 'Pular',
          },
          {
            inputs: ['Enter', 'ArrowDown'],
            action: 'Gritar!',
          },
        ],
      },
      {
        title: 'Jogador 3 (Local 3P)',
        icon: '🌺',
        color: '#fb7185',
        bindings: [
          {
            inputs: ['J', 'L'],
            action: 'Mover',
          },
          {
            inputs: ['I'],
            action: 'Pular',
          },
          {
            inputs: ['K', 'U'],
            action: 'Gritar!',
          },
        ],
      },
      {
        title: 'Menus & Atalhos',
        icon: '🎮',
        color: '#38bdf8',
        bindings: [
          {
            inputs: ['R', { ui: '🔄 Reset' }],
            action: 'Reiniciar fase',
          },
          {
            inputs: ['Esc', { ui: '🏠 Menu' }],
            action: 'Voltar ao menu',
          },
          {
            inputs: ['Enter', 'Space'],
            action: 'Iniciar / Próxima fase',
            detail: 'Enter inicia no menu; Enter ou Espaço avança após concluir a fase',
          },
          {
            inputs: [{ mouse: 'left' }, { touch: 'tap' }],
            action: 'Botões e seleção',
            detail: 'Escolha o modo, selecione a fase e clique nos botões da tela',
          },
        ],
      },
    ],
    tips: [
      'Macacos podem subir uns nos outros para alcançar plataformas altas.',
      'Caixas pesadas precisam de 2 ou 3 macacos empurrando juntos.',
      'No modo Solo, aperte F (Seguir) para levar o bando todo de uma vez.',
      'Se alguém cair ou ficar preso, aperte R para reiniciar a fase rapidinho.',
    ],
  };
}
