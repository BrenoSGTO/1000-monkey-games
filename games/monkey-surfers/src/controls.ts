import type { ControlsGuideConfig } from '@monkey-slop/sdk';

export const SURFERS_CONTROLS: Omit<ControlsGuideConfig, 'slug' | 'title' | 'onOpenChange'> = {
  goal: 'Corra pelos trilhos da selva-favela, desvie dos trens e fuja o mais longe possível do Zelador Gorila e seu Capivara-Cão!',
  sections: [
    {
      title: 'Movimento nas Faixas',
      icon: '🏃',
      color: '#facc15',
      bindings: [
        {
          inputs: ['A', 'ArrowLeft'],
          action: 'Ir para a faixa da esquerda',
        },
        {
          inputs: ['D', 'ArrowRight'],
          action: 'Ir para a faixa da direita',
        },
        {
          inputs: ['W', 'ArrowUp'],
          action: 'Pular',
          detail: 'Sobe em rampas, pula barreiras baixas e alcança tetos de trens',
        },
        {
          inputs: ['S', 'ArrowDown'],
          action: 'Rolar / Aterrissar rápido',
          detail: 'Passa por baixo de placas altas ou desce mais rápido no ar',
        },
        {
          inputs: [{ touch: 'swipe' }, { mouse: 'drag' }],
          action: 'Deslizar ou arrastar na tela',
          detail: 'Lados trocam de faixa • Cima pula • Baixo rola',
        },
      ],
    },
    {
      title: 'Prancha & Ações',
      icon: '🛹',
      color: '#4ade80',
      bindings: [
        {
          inputs: ['Space', { ui: '🛹 Prancha' }],
          action: 'Ativar Prancha Escudo',
          detail: 'Protege de 1 batida fatal (também com duplo toque/clique na tela)',
        },
        {
          inputs: ['B'],
          action: 'Buzinar / Provocar',
          detail: 'Solta uma frase aleatória na tela (e para amigos no Versus)',
        },
      ],
    },
    {
      title: 'Menus & Atalhos',
      icon: '⚙️',
      color: '#38bdf8',
      bindings: [
        {
          inputs: ['Space', 'Enter'],
          action: 'Iniciar corrida solo',
          detail: 'Funciona na tela inicial e no fim de jogo',
        },
        {
          inputs: ['R'],
          action: 'Reiniciar corrida',
          detail: 'Durante a partida ou no fim de jogo (inicia Versus se for o host)',
        },
        {
          inputs: ['F1', { ui: '🎮 Controles' }],
          action: 'Abrir / fechar esta cartilha',
          detail: 'Pausa a corrida enquanto estiver aberta',
        },
      ],
    },
  ],
  tips: [
    'Suba pelas rampas para correr no teto dos vagões e pegar mais Moedas-Banana.',
    'Compre cargas de Prancha e novas skins na Loja & Missões para aumentar seu multiplicador.',
    'Pegue Jetpack, Tênis Mola, Ímã e Dobro de Pontos pelos trilhos para bater seu recorde!',
  ],
};
