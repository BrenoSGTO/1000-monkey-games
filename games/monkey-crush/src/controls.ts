import type { ControlsGuideConfig } from '@monkey-slop/sdk';

export type MonkeyCrushControlsConfig = Omit<ControlsGuideConfig, 'slug' | 'title'>;

export function createControlsConfig(onOpenChange: (open: boolean) => void): MonkeyCrushControlsConfig {
  return {
    goal: 'Combine 3 ou mais frutas zoiudas para estourar gelatinas, resgatar macaquinhos bebês e bater a meta antes que as jogadas (ou o tempo no Versus) acabem!',
    onOpenChange,
    sections: [
      {
        title: 'Tabuleiro (Mouse e Toque)',
        icon: '🍌',
        color: '#facc15',
        bindings: [
          {
            inputs: [{ mouse: 'drag' }, { touch: 'swipe' }],
            action: 'Trocar frutas vizinhas',
            detail: 'Arraste uma fruta na direção da vizinha para fazer a troca',
          },
          {
            inputs: [{ mouse: 'left' }, { touch: 'tap' }],
            action: 'Selecionar e trocar',
            detail: 'Clique ou toque em uma fruta e depois na vizinha (ou na mesma para desmarcar)',
          },
        ],
      },
      {
        title: 'Atalhos e Ações',
        icon: '⌨️',
        color: '#4ade80',
        bindings: [
          {
            inputs: ['H', { ui: '💡 Dica (H)' }],
            action: 'Mostrar dica',
            detail: 'Destaca uma jogada válida no tabuleiro',
          },
          {
            inputs: ['R', { ui: '🔄 Reiniciar' }],
            action: 'Reiniciar fase ou duelo',
            detail: 'Disponível nos modos Saga e Versus Solo',
          },
          {
            inputs: ['M'],
            action: 'Silenciar / ativar som',
          },
        ],
      },
      {
        title: 'Navegação e Cartilha',
        icon: '🧭',
        color: '#38bdf8',
        bindings: [
          {
            inputs: [{ ui: '🗺️ Mapa' }],
            action: 'Voltar ao mapa das fases',
            detail: 'Disponível durante o modo Saga',
          },
          {
            inputs: [{ ui: '🏠 Início' }],
            action: 'Voltar à tela inicial',
          },
          {
            inputs: ['F1'],
            action: 'Abrir ou fechar esta cartilha',
            detail: 'Pausa o cronômetro e o Chimp Bot durante a partida',
          },
        ],
      },
    ],
    tips: [
      '4 em linha cria um Macaco Listrado; formato L ou T cria Bomba de Coco; 5 em linha cria Banana Arco-Íris.',
      'Troque 2 peças especiais entre si para combos gigantes (2 Bananas Arco-Íris limpam o tabuleiro todo!).',
      'No Versus, combos de 2x+ ou especiais jogam Cascas de Banana que travam frutas no tabuleiro do rival.',
      'No Co-op Online, os jogadores se alternam por turno e enxergam o cursor do parceiro em tempo real.',
    ],
  };
}
