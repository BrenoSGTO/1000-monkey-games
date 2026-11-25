import type { ControlsGuideConfig } from '@monkey-slop/sdk';

export type MonkeyClickerControlsConfig = Omit<ControlsGuideConfig, 'slug' | 'title'>;

export function createControlsConfig(
  onOpenChange: (open: boolean) => void,
): MonkeyClickerControlsConfig {
  return {
    goal: 'Clique na Banana Gigante, contrate macacos duvidosos, espante o Gorila Cobrador e construa o maior império bananeiro do cosmos!',
    onOpenChange,
    sections: [
      {
        title: 'Cliques & Eventos',
        icon: '🍌',
        color: '#facc15',
        bindings: [
          {
            inputs: [{ mouse: 'left' }, { touch: 'tap' }, 'Space'],
            action: 'Esmagar Banana Gigante',
            detail: 'Cliques rápidos em sequência sobem o Combo (até 100).',
          },
          {
            inputs: [{ mouse: 'left' }, { touch: 'tap' }],
            action: 'Pegar Banana Dourada / Chuva',
            detail: 'Ativa Frenesi 7x, Clique 77x ou Jackpot antes que suma.',
          },
          {
            inputs: [{ mouse: 'left' }, { touch: 'tap' }],
            action: 'Espantar Gorila & Greve',
            detail: 'Clique várias vezes nos chefes de caos para derrotá-los e lucrar.',
          },
          {
            inputs: [{ mouse: 'move' }],
            action: 'Olhar do Macaco & Cursor',
            detail: 'O macaco acompanha o ponteiro; no Co-op/Versus, todos veem seu cursor.',
          },
        ],
      },
      {
        title: 'Império & Loja',
        icon: '🏗️',
        color: '#4ade80',
        bindings: [
          {
            inputs: [{ ui: '🏗️ Império' }, { ui: '⚡ Zoeiras' }],
            action: 'Construções e Upgrades',
            detail: 'Compre trabalhadores e melhorias para multiplicar sua produção.',
          },
          {
            inputs: [{ ui: '1x' }, { ui: '10x' }, { ui: '100x' }],
            action: 'Compra em lote',
            detail: 'Define quantas construções comprar por clique.',
          },
          {
            inputs: [{ ui: '🏆 Medalhas' }],
            action: 'Ver conquistas',
            detail: 'Cada medalha desbloqueada dá +2% de produção por segundo.',
          },
          {
            inputs: [{ ui: '🧬 Evoluir' }, { ui: '🧬 REENCARNAR AGORA' }],
            action: 'Reencarnação (Prestígio)',
            detail: 'Disponível ao acumular 1 Mi de bananas para ganhar Q.I. Primata.',
          },
        ],
      },
      {
        title: 'Partida & Menus',
        icon: '⚙️',
        color: '#38bdf8',
        bindings: [
          {
            inputs: [{ ui: '📋 Modo' }],
            action: 'Trocar modo de jogo',
            detail: 'Volta ao menu para escolher Solo, Cooperativa ou Corrida Versus.',
          },
          {
            inputs: [{ ui: '🔄 Reiniciar' }],
            action: 'Reiniciar partida',
            detail: 'Zera o império Solo ou reinicia a partida atual (Host no Co-op).',
          },
          {
            inputs: [{ ui: 'Co-op Online' }],
            action: 'Sala Multiplayer P2P',
            detail: 'Crie ou entre em uma sala no topo esquerdo para jogar com amigos.',
          },
          {
            inputs: ['F1', { ui: '🎮 Controles' }],
            action: 'Abrir esta cartilha',
            detail: 'Pausa a partida enquanto estiver aberta.',
          },
        ],
      },
    ],
    tips: [
      'Mantenha um ritmo rápido de cliques ou Espaço para manter o Combo ativo!',
      'Derrote o Gorila Cobrador rápido — se o tempo acabar, ele rouba 5% das suas bananas.',
      'No modo Solo, seu império salva automaticamente a cada compra e a cada 4 segundos.',
    ],
  };
}
