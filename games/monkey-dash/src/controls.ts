import type { ControlsGuideConfig } from '@monkey-slop/sdk';

export const monkeyDashControls: Omit<ControlsGuideConfig, 'slug' | 'title'> = {
  goal: 'Desvie dos espinhos no ritmo da música, colete as bananas escondidas e chegue ao portal final antes da sua paciência acabar!',
  sections: [
    {
      title: 'Solo & Corrida Online',
      icon: '🎮',
      color: '#facc15',
      bindings: [
        {
          inputs: ['Space', 'W', 'ArrowUp', { mouse: 'left' }, { touch: 'tap' }],
          action: 'Pular / Acionar orbe',
          detail: 'No cubo ou bola, toque para pular ou inverter a gravidade.',
        },
        {
          inputs: [{ touch: 'hold' }, { mouse: 'left' }],
          action: 'Voar / Zigue-zaguear',
          detail: 'Segure na Nave Banana para subir, ou na Wave para subir na diagonal (solte para descer).',
        },
        {
          inputs: ['B', { ui: '📣 Buzina (B)' }],
          action: 'Tocar buzina de macaco',
          detail: 'Tira onda na corrida online (recarga de 3s).',
        },
      ],
    },
    {
      title: 'Jogador 1 (2P Local — Cima)',
      icon: '🟦',
      color: '#22d3ee',
      bindings: [
        {
          inputs: ['W', 'Space', { touch: 'tap' }],
          action: 'Pular / Voar / Inverter (J1)',
          detail: 'No toque ou clique, use a metade superior da tela.',
        },
      ],
    },
    {
      title: 'Jogador 2 (2P Local — Baixo)',
      icon: '🟥',
      color: '#fb7185',
      bindings: [
        {
          inputs: ['ArrowUp', 'Enter', { touch: 'tap' }],
          action: 'Pular / Voar / Inverter (J2)',
          detail: 'No toque ou clique, use a metade inferior da tela.',
        },
      ],
    },
    {
      title: 'Modo Prática & Menus',
      icon: '🧪',
      color: '#34d399',
      bindings: [
        {
          inputs: ['P', { ui: '🧪 Prática (P)' }],
          action: 'Ligar / desligar Modo Prática',
          detail: 'Disponível no Solo e Online (desativado no 2P Local).',
        },
        {
          inputs: ['Z', { ui: '💎 CP (Z)' }],
          action: 'Colocar checkpoint manual',
          detail: 'Salva sua posição atual no Modo Prática.',
        },
        {
          inputs: ['X', { ui: 'Undo (X)' }],
          action: 'Remover último checkpoint',
        },
        {
          inputs: ['R', { ui: '🔄 Reiniciar (R)' }],
          action: 'Reiniciar tentativa',
          detail: 'Volta ao último checkpoint no Modo Prática.',
        },
        {
          inputs: ['Shift+R'],
          action: 'Reiniciar do zero',
          detail: 'Ignora checkpoints e recomeça a fase do início.',
        },
        {
          inputs: ['Esc', { ui: '⬅ Menu (Esc)' }],
          action: 'Voltar ao Menu',
          detail: 'Ou volta ao Mini Editor se estiver testando uma fase.',
        },
        {
          inputs: [{ ui: '🧘 Zen' }],
          action: 'Ligar / desligar Modo Zen',
          detail: 'Treine a fase sem morrer nos espinhos.',
        },
      ],
    },
    {
      title: 'Mini Editor de Fases',
      icon: '🛠️',
      color: '#a78bfa',
      bindings: [
        {
          inputs: [{ mouse: 'left' }, { mouse: 'drag' }, { touch: 'tap' }, { touch: 'drag' }],
          action: 'Colocar ou apagar bloco',
          detail: 'Usa a ferramenta selecionada na barra superior.',
        },
        {
          inputs: [{ mouse: 'right' }],
          action: 'Apagar bloco',
        },
        {
          inputs: [{ mouse: 'wheel' }],
          action: 'Rolar a pista',
        },
        {
          inputs: ['Ctrl+Z', { ui: '↩ Desfazer' }],
          action: 'Desfazer última edição',
        },
      ],
    },
  ],
  tips: [
    'Segure o botão de pulo antes de cair para já emendar o próximo salto assim que tocar o chão.',
    'Orbes coloridas no ar só ativam se você apertar ou clicar perto delas.',
    'Use o Modo Prática (P) com checkpoints manuais (Z) para treinar trechos difíceis.',
    'No 2P Local no celular ou tablet, cada jogador toca na sua própria metade da tela!',
  ],
};
