import type { ControlsGuideConfig } from '@monkey-slop/sdk';

export function createSkateControlsConfig(
  onOpenChange: (open: boolean) => void,
): Omit<ControlsGuideConfig, 'slug' | 'title'> {
  return {
    goal: 'Mande manobras em sequência para multiplicar pontos ou quebre ossos no Hall of Meat para inflar a conta do SUS!',
    onOpenChange,
    sections: [
      {
        title: 'Movimento & Equilíbrio',
        icon: '🛹',
        color: '#facc15',
        bindings: [
          {
            inputs: ['A', 'D', 'ArrowLeft', 'ArrowRight'],
            action: 'Remar, Girar no Ar e Grind',
            detail: 'Reme na pista, controle no ar e equilibre nos corrimãos',
          },
          {
            inputs: ['Space', 'W', 'ArrowUp'],
            action: 'Pular (Ollie)',
            detail: 'Segure no ar para pular mais alto. No ragdoll, levanta na hora',
          },
          {
            inputs: ['S', 'ArrowDown'],
            action: 'Agachar / Manual',
            detail: 'Acelera em descidas; segure ao aterrissar para emendar Manual',
          },
        ],
      },
      {
        title: 'Manobras & Flips',
        icon: '🤸',
        color: '#38bdf8',
        bindings: [
          {
            inputs: ['J'],
            action: 'Kickflip da Banana',
            detail: 'No ar (+250 pts base)',
          },
          {
            inputs: ['K'],
            action: 'Banana Grab',
            detail: 'No ar (+300 pts base e giro mais rápido)',
          },
          {
            inputs: ['L'],
            action: 'Chimp Christ Air',
            detail: 'No ar (+450 pts base)',
          },
          {
            inputs: ['Q', 'E'],
            action: 'Backflip / Frontflip',
            detail: 'Gira no ar; no Manual ajusta o equilíbrio',
          },
          {
            inputs: ['Shift+A', 'Shift+D'],
            action: 'Flip Direcional',
            detail: 'Segure Shift + A/D (ou ◀/▶) no ar para girar',
          },
        ],
      },
      {
        title: 'Caos & Ações',
        icon: '💀',
        color: '#fb7185',
        bindings: [
          {
            inputs: ['X', { ui: '💀 Ejetar! (X)' }],
            action: 'Ejetar / Ragdoll',
            detail: 'Se joga no Hall of Meat; no chão, chacoalha o macaco',
          },
          {
            inputs: ['R'],
            action: 'Levantar no Skate',
            detail: 'Volta de pé na pista imediatamente',
          },
          {
            inputs: ['B', { ui: '🍌 Jogar Casca (B)' }],
            action: 'Jogar Casca de Banana',
            detail: 'Deixa uma armadilha na pista (recarga de 5s)',
          },
        ],
      },
      {
        title: 'Menus & Cartilha',
        icon: '🗺️',
        color: '#4ade80',
        bindings: [
          {
            inputs: [{ ui: '🗺️ Pistas / Modo' }],
            action: 'Trocar Pista ou Modo',
            detail: 'Free Skate, Duelo 90s, Corrida ou 2P Local por turnos',
          },
          {
            inputs: ['F1', { ui: '🎮 Controles' }],
            action: 'Abrir / Fechar Cartilha',
            detail: 'Pausa o jogo automaticamente enquanto aberta',
          },
        ],
      },
    ],
    tips: [
      'Aterrisse alinhado com a rampa — cair de ponta-cabeça manda direto pro ragdoll.',
      'Segure S ou ↓ antes de tocar o chão para emendar um Manual e continuar o combo.',
      'Em 2P Local, os dois jogadores se revezam no mesmo teclado em turnos de 45s.',
    ],
  };
}
