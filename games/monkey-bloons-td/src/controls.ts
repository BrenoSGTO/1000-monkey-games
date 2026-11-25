import type { ControlsGuideConfig } from '@monkey-slop/sdk';

export type MonkeyBloonsControlsConfig = Omit<ControlsGuideConfig, 'slug' | 'title'>;

export const MONKEY_BLOONS_CONTROLS: MonkeyBloonsControlsConfig = {
  goal: 'Posicione a macacada pela trilha e estoure todas as bexigas antes que roubem o bananal!',
  sections: [
    {
      title: 'Construção & Mapa',
      icon: '🐒',
      color: '#facc15',
      bindings: [
        {
          inputs: ['1', '2', '3', '4', '5', '6', '7'],
          action: 'Escolher macaco na loja',
          detail: '1 Arremessador · 2 Havaianas · 3 Sniper · 4 Coco · 5 DJ · 6 Fazenda · 7 Mago',
        },
        {
          inputs: [{ mouse: 'move' }],
          action: 'Mirar no mapa',
          detail: 'Mostra o alcance e se o ponto é válido',
        },
        {
          inputs: [{ mouse: 'left' }, { touch: 'tap' }],
          action: 'Posicionar ou selecionar',
          detail: 'Coloca o macaco escolhido ou inspeciona uma torre',
        },
        {
          inputs: ['Shift'],
          action: 'Posicionar vários seguidos',
          detail: 'Segure Shift ao clicar no mapa para continuar construindo',
        },
        {
          inputs: ['Esc', { mouse: 'right' }],
          action: 'Cancelar ou desselecionar',
          detail: 'Sai do modo de construção ou fecha o inspetor',
        },
      ],
    },
    {
      title: 'Gerenciar Torre',
      icon: '⬆️',
      color: '#4ade80',
      bindings: [
        {
          inputs: ['U'],
          action: 'Evoluir torre',
          detail: 'Melhora a torre selecionada (até Nível 3)',
        },
        {
          inputs: ['T'],
          action: 'Trocar prioridade de alvo',
          detail: 'Primeiro · Mais Forte · Mais Perto · Último',
        },
        {
          inputs: ['Delete', 'Backspace'],
          action: 'Vender torre',
          detail: 'Reembolsa 70% das bananas gastas',
        },
      ],
    },
    {
      title: 'Ondas & Poderes',
      icon: '🌊',
      color: '#38bdf8',
      bindings: [
        {
          inputs: ['Space'],
          action: 'Iniciar onda / Velocidade 1x–2x',
          detail: 'Começa a próxima onda ou alterna a velocidade durante o combate',
        },
        {
          inputs: ['Q', { ui: '💣 Chuva' }],
          action: 'Chuva de Bananas Explosivas',
          detail: 'Habilidade ativa em área (recarga de 22s)',
        },
        {
          inputs: [{ ui: '🔁 Auto' }],
          action: 'Onda automática',
          detail: 'Inicia a próxima onda automaticamente ao terminar a atual',
        },
      ],
    },
    {
      title: 'Co-op, Versus & 2P Local',
      icon: '👥',
      color: '#e879f9',
      bindings: [
        {
          inputs: ['P', { ui: '📍 [P]' }],
          action: 'Pingar no mapa',
          detail: 'Marca um ponto no mapa para os aliados',
        },
        {
          inputs: ['Tab', { ui: '🔄 Turno' }],
          action: 'Trocar turno (P1 ↔ P2)',
          detail: 'Alterna o jogador ativo no modo 2P Local',
        },
        {
          inputs: [{ ui: '🍌 Enviar 50🍌' }],
          action: 'Doar bananas',
          detail: 'Transfere 50 bananas para aliados ou para o outro jogador local',
        },
        {
          inputs: [{ ui: '🔴 Enxames' }],
          action: 'Sabotar / Aumentar renda',
          detail: 'Manda bexigas extras nos rivais e ganha renda bônus por onda',
        },
      ],
    },
  ],
  tips: [
    'O Macaco Sniper [3] tem alcance global e o Nível 2 fura bexigas de Chumbo.',
    'O DJ Macaco JBL [5] acelera aliados próximos e no Nível 2 revela bexigas Camufladas!',
    'Segure Shift ao clicar para plantar várias Fazendas de Bananeira [6] rapidinho.',
    'No modo 2P Local, cada macaco tem sua carteira — aperte Tab para alternar o turno.',
  ],
};
