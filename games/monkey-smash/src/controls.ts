import type { MonkeyHudOptions } from '@monkey-slop/sdk';

/**
 * Cartilha de controles ilustrada do Super Smash Macacos: Briga na Bananeira.
 * Todos os mapeamentos refletem exatamente `src/input.ts`, `src/sim.ts` e `src/game.ts`.
 */
export const monkeySmashControls: NonNullable<MonkeyHudOptions['controls']> = {
  goal: 'Aumente a % de dano dos rivais e mande todo mundo pra fora da arena — quem ficar por último (ou fizer mais KOs) vira o rei da bananeira!',
  sections: [
    {
      title: 'Jogador 1 (Solo e 2P)',
      icon: '🔴',
      color: '#ef4444',
      bindings: [
        {
          inputs: ['WASD', 'Arrows'],
          action: 'Mover, mirar e pular',
          detail: 'No modo Solo/Online, Setas também funcionam. S / ↓ desce de plataformas e acelera a queda.',
        },
        {
          inputs: ['Space', 'W'],
          action: 'Pular / Pulo duplo',
          detail: 'Segure para pular mais alto; no Solo/Online, ↑ também pula.',
        },
        {
          inputs: ['F', 'J', 'Z'],
          action: 'Ataque leve',
          detail: 'J e Z funcionam como alternativa no modo Solo/Online.',
        },
        {
          inputs: ['G', 'K', 'X'],
          action: 'Ataque forte (Smash)',
          detail: 'Mais dano e arremesso mais longe. K e X no Solo/Online.',
        },
        {
          inputs: ['H', 'L', 'C'],
          action: 'Golpe especial',
          detail: 'Cada macaco tem 4 especiais (neutro, lado, cima, baixo). L e C no Solo/Online.',
        },
        {
          inputs: ['T', 'I', 'Shift'],
          action: 'Defesa / Esquiva',
          detail: 'Segure no chão para proteger; no ar faz esquiva aérea. I e Shift no Solo/Online.',
        },
        {
          inputs: ['R', 'O', 'V'],
          action: 'Agarrar',
          detail: 'Com o rival preso, use direção (ou forte) para arremessar, ou leve para bater. O e V no Solo/Online.',
        },
      ],
    },
    {
      title: 'Jogador 2 (2P Local)',
      icon: '🔵',
      color: '#3b82f6',
      bindings: [
        {
          inputs: ['Arrows'],
          action: 'Mover, pular e descer',
          detail: '↑ pula, ↓ desce de plataformas ou acelera a queda.',
        },
        {
          inputs: [',', 'Num 1'],
          action: 'Ataque leve',
        },
        {
          inputs: ['.', 'Num 2'],
          action: 'Ataque forte (Smash)',
        },
        {
          inputs: ['/', 'Num 3'],
          action: 'Golpe especial',
        },
        {
          inputs: [';', 'Num 0'],
          action: 'Defesa / Esquiva',
        },
        {
          inputs: ["'", 'Num 4'],
          action: 'Agarrar',
        },
      ],
    },
    {
      title: 'Golpes, Combos e Toque',
      icon: '💥',
      color: '#facc15',
      bindings: [
        {
          inputs: ['W+F', 'S+F', 'D+F'],
          action: 'Direção + Ataque muda o golpe',
          detail: 'Cima, baixo ou frente no chão; no ar executa golpes aéreos.',
        },
        {
          inputs: ['T+A', 'T+D', 'T+S'],
          action: 'Rolar e esquivar',
          detail: 'Com a defesa ativa, ←/→ rola pelos lados e ↓ faz esquiva parada. Defesa + Leve agarra rápido.',
        },
        {
          inputs: ['W+H'],
          action: 'Recuperação (Especial pra cima)',
          detail: 'Use fora da arena para voltar à plataforma e agarrar a borda.',
        },
        {
          inputs: [{ ui: '◀ ▶ ▲ ▼' }, { ui: 'Leve' }, { ui: 'Forte' }, { ui: 'Esp' }, { ui: 'Def' }, { ui: 'Agar' }],
          action: 'Botões na tela (Toque)',
          detail: 'Aparecem automaticamente em celulares e tablets durante a luta.',
        },
      ],
    },
    {
      title: 'Menus e Partida',
      icon: '⚙️',
      color: '#22c55e',
      bindings: [
        {
          inputs: ['Esc'],
          action: 'Pausar / Retomar luta',
          detail: 'No modo local congela a luta; no online a partida continua para os outros.',
        },
        {
          inputs: ['F1', { ui: '🎮 Controles' }],
          action: 'Abrir esta cartilha',
        },
        {
          inputs: [{ mouse: 'left' }, { touch: 'tap' }],
          action: 'Navegar nos menus',
          detail: 'Escolha Solo, 2P Local ou Online, lutador, arena e regras.',
        },
      ],
    },
  ],
  tips: [
    'Quanto maior a % de dano, mais longe o macaco voa ao levar um golpe.',
    'Segurar a defesa por muito tempo encolhe o escudo até quebrar e deixar você tonto!',
    'Foi agarrado? Aperte rápido qualquer tecla de ação ou direção para se soltar.',
    'Caiu fora da arena? Use o pulo duplo e depois ↑ + Especial para voltar à borda.',
  ],
};
