import type { ControlsGuideConfig } from '@monkey-slop/sdk';

export const MONKEY_CELLS_CONTROLS: Omit<ControlsGuideConfig, 'slug' | 'title'> = {
  goal: 'Desça a Masmorra da Banana dando pogo-jump e parry nos capangas até derrubar o Gorilão CEO — ou acerte as contas no X1 da Arena!',
  sections: [
    {
      title: 'Movimento (Masmorra / Solo / Online)',
      icon: '🏃',
      color: '#facc15',
      bindings: [
        {
          inputs: ['WASD', 'Arrows'],
          action: 'Correr e mirar',
          detail: 'A/D ou ←/→ movem; W/S ou ↑/↓ miram golpes',
        },
        {
          inputs: ['Space', 'W', 'ArrowUp'],
          action: 'Pular / Pulo duplo / Wall-Jump',
          detail: 'Solte cedo para pulo curto; na parede, pula para o lado oposto',
        },
        {
          inputs: ['S+Space', 'ArrowDown+Space'],
          action: 'Descer da plataforma',
          detail: 'Segure para baixo e aperte Pulo sobre plataformas finas',
        },
      ],
    },
    {
      title: 'Combate & Ações',
      icon: '⚔️',
      color: '#38bdf8',
      bindings: [
        {
          inputs: ['J', 'Z', { mouse: 'left' }],
          action: 'Atacar e dar Parry',
          detail: 'Rebate projéteis inimigos; o clique mira na direção do cursor',
        },
        {
          inputs: ['S+J', 'ArrowDown+J', { mouse: 'left' }],
          action: 'Pogo-Jump (no ar)',
          detail: 'Ataque para baixo no ar para quicar em inimigos e espinhos',
        },
        {
          inputs: ['W+J', 'I+J'],
          action: 'Atacar para cima',
        },
        {
          inputs: ['Shift', 'K'],
          action: 'Dash',
          detail: 'Avanço rápido com invulnerabilidade',
        },
        {
          inputs: ['Q', 'F'],
          action: 'Curar com Potássio',
          detail: 'Segure parado no chão (consome 33% da barra)',
        },
        {
          inputs: ['E'],
          action: 'Interagir',
          detail: 'Trocar arma no Baú ou entrar no Portal',
        },
        {
          inputs: ['T', { ui: 'Empurrão Amigo' }],
          action: 'Empurrão Amigo (Co-op)',
          detail: 'Liga ou desliga golpes entre aliados na sala online',
        },
      ],
    },
    {
      title: 'Arena 2P Local — Jogador 1',
      icon: '🟡',
      color: '#facc15',
      bindings: [
        {
          inputs: ['WASD'],
          action: 'Mover, pular e mirar',
          detail: 'A/D corre, W pula, S+W desce plataforma',
        },
        {
          inputs: ['F'],
          action: 'Atacar / Parry',
          detail: 'S+F no ar = Pogo-Jump; W+F = golpe para cima',
        },
        { inputs: ['G'], action: 'Dash' },
        {
          inputs: ['Q'],
          action: 'Curar com Potássio',
          detail: 'Segure parado no chão',
        },
        { inputs: ['E'], action: 'Trocar arma no Baú' },
      ],
    },
    {
      title: 'Arena 2P Local — Jogador 2',
      icon: '🟢',
      color: '#4ade80',
      bindings: [
        {
          inputs: ['Arrows'],
          action: 'Mover, pular e mirar',
          detail: '←/→ corre, ↑ pula, ↓+↑ desce plataforma',
        },
        {
          inputs: ['K'],
          action: 'Atacar / Parry',
          detail: '↓+K no ar = Pogo-Jump; ↑+K = golpe para cima',
        },
        { inputs: ['L'], action: 'Dash' },
        {
          inputs: ['M', 'Shift'],
          action: 'Curar com Potássio',
          detail: 'Segure parado no chão (M ou Shift direito)',
        },
        { inputs: ['Enter'], action: 'Trocar arma no Baú' },
      ],
    },
    {
      title: 'Menus & Atalhos',
      icon: '🧭',
      color: '#c084fc',
      bindings: [
        {
          inputs: ['Enter', 'Space'],
          action: 'Iniciar Masmorra',
          detail: 'Na tela inicial',
        },
        {
          inputs: ['1', '2', '3', { mouse: 'left' }],
          action: 'Escolher Relíquia',
          detail: 'No Altar de Relíquias entre salas',
        },
        {
          inputs: ['R', 'Enter'],
          action: 'Jogar novamente',
          detail: 'Na tela de vitória ou derrota',
        },
        { inputs: ['F1'], action: 'Abrir / fechar esta cartilha' },
      ],
    },
  ],
  tips: [
    'Dar Pogo-Jump em inimigos e espinhos reseta seu pulo duplo e dash no ar!',
    'Atacar um projétil no momento certo dá PARRY: devolve o tiro com dano extra e enche Potássio.',
    'Segure I no ar ou no chão para mirar para cima sem gastar pulo.',
    'Em salas Co-op Online, o Empurrão Amigo (T) permite jogar seus amigos longe na zoeira.',
  ],
};
