import type { ControlsGuideConfig } from '@monkey-slop/sdk';

export const OVERCOOKED_CONTROLS: Omit<ControlsGuideConfig, 'slug' | 'title'> = {
  goal: 'Pique ingredientes, ferva o caldeirão, lave a louça e sirva os pedidos no balcão antes que a cozinha pegue fogo!',
  sections: [
    {
      title: 'Solo & Online',
      icon: '🐒',
      color: '#facc15',
      bindings: [
        { inputs: ['WASD', 'Arrows'], action: 'Mover (8 direções)' },
        { inputs: ['Space', 'E'], action: 'Pegar / Soltar / Servir' },
        {
          inputs: ['F', 'J'],
          action: 'Picar / Lavar / Extintor',
          detail: 'Um toque inicia picar ou lavar; segure com o extintor',
        },
        {
          inputs: ['Q', 'K'],
          action: 'Arremessar item',
          detail: 'Acerta caldeirão e prato à distância!',
        },
        { inputs: ['Shift'], action: 'Dash (arrancada)' },
        {
          inputs: ['Tab'],
          action: 'Trocar de chef (Solo)',
          detail: 'Controle o outro macaco enquanto o primeiro termina a tarefa',
        },
      ],
    },
    {
      title: 'Co-op Local 2P — Chef 1',
      icon: '🍌',
      color: '#facc15',
      bindings: [
        { inputs: ['WASD'], action: 'Mover' },
        { inputs: ['E', 'Space'], action: 'Pegar / Soltar / Servir' },
        { inputs: ['F'], action: 'Picar / Lavar / Extintor' },
        { inputs: ['Q'], action: 'Arremessar item' },
        { inputs: ['Shift'], action: 'Dash', detail: 'Shift esquerdo' },
      ],
    },
    {
      title: 'Co-op Local 2P — Chef 2',
      icon: '🌿',
      color: '#4ade80',
      bindings: [
        { inputs: ['Arrows'], action: 'Mover' },
        { inputs: ['Enter', ','], action: 'Pegar / Soltar / Servir' },
        { inputs: ['.', 'M'], action: 'Picar / Lavar / Extintor' },
        { inputs: ['/', 'N'], action: 'Arremessar item' },
        { inputs: ['Shift', 'Ctrl', 'L'], action: 'Dash', detail: 'Shift/Ctrl direito ou L' },
      ],
    },
    {
      title: 'Comunicação & Menus',
      icon: '📢',
      color: '#38bdf8',
      bindings: [
        {
          inputs: ['1', '2', '3', '4'],
          action: 'Gritos rápidos',
          detail: '1: Fogo • 2: Sopa • 3: Louça • 4: Banana (Chef 1 no 2P)',
        },
        {
          inputs: ['M'],
          action: 'Música On/Off',
          detail: 'Solo e Online (no 2P, M é ação do Chef 2)',
        },
        {
          inputs: ['Esc', 'P'],
          action: 'Pausar / Continuar',
          detail: 'No Online, o Host volta ao menu',
        },
      ],
    },
  ],
  tips: [
    'Sirva o pedido ★1º primeiro para multiplicar o combo de pontos!',
    'No Solo, aperte F para picar/lavar e Tab para comandar o outro chef ao mesmo tempo.',
    'Pegou fogo? Pegue o extintor (E/Espaço) e segure F/J apontando para as chamas.',
  ],
};
