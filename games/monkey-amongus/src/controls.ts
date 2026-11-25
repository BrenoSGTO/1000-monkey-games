import type { ControlsGuideConfig } from '@monkey-slop/sdk';

export const MONKEY_AMONGUS_CONTROLS: Omit<ControlsGuideConfig, 'slug' | 'title' | 'onOpenChange'> = {
  goal: 'Descubra quem está roubando as bananas antes que o Impostor elimine a tripulação — ou sabote a Nave Banana-1 sem ser descoberto!',
  sections: [
    {
      title: 'Movimento',
      icon: '🏃',
      color: '#38bdf8',
      bindings: [
        {
          inputs: ['WASD', 'Arrows'],
          action: 'Andar pela nave',
          detail: 'Funciona também como fantasma (atravessa paredes)',
        },
        {
          inputs: [{ mouse: 'drag' }, { touch: 'drag' }],
          action: 'Mover na direção do ponteiro',
          detail: 'Clique/toque e segure no mapa para guiar o macaco',
        },
      ],
    },
    {
      title: 'Ações da Tripulação',
      icon: '🍌',
      color: '#4ade80',
      bindings: [
        {
          inputs: ['E', 'Space', { ui: 'Usar (E)' }],
          action: 'Usar / Fazer tarefa',
          detail: 'Abre tarefas, botão de emergência, câmeras ou sai das câmeras',
        },
        {
          inputs: ['R', { ui: 'Reportar (R)' }],
          action: 'Reportar corpo',
          detail: 'Convoca reunião de emergência perto de um macaco caído',
        },
        {
          inputs: ['M', 'Tab', { ui: '🗺️ Mapa (M)' }],
          action: 'Abrir / fechar minimapa',
          detail: 'Mostra salas e locais das suas tarefas pendentes',
        },
        {
          inputs: ['Esc'],
          action: 'Fechar tela atual',
          detail: 'Fecha tarefa aberta, câmeras, minimapa ou menu de sabotagem',
        },
      ],
    },
    {
      title: 'Ações do Impostor',
      icon: '😈',
      color: '#f87171',
      bindings: [
        {
          inputs: ['K', { ui: '🔪 Eliminar (K)' }],
          action: 'Eliminar tripulante próximo',
          detail: 'Disponível quando o cooldown zerar',
        },
        {
          inputs: ['V', { ui: '🕳️ Vent (V)' }],
          action: 'Entrar / sair da tubulação',
          detail: 'Dentro do duto, clique nos botões de destino para viajar',
        },
        {
          inputs: ['S', { ui: '⚡ Sabotar (S)' }],
          action: 'Abrir menu de sabotagem',
          detail: 'Escolha entre Apagar Luzes ou Derreter Reator',
        },
      ],
    },
    {
      title: 'Reunião, Chat & Tarefas',
      icon: '💬',
      color: '#facc15',
      bindings: [
        {
          inputs: [{ mouse: 'left' }, { touch: 'tap' }],
          action: 'Interagir com menus e tarefas',
          detail: 'Votar na reunião, trocar câmeras e resolver minigames',
        },
        {
          inputs: [{ mouse: 'left' }, { touch: 'hold' }],
          action: 'Segurar no scanner / energia',
          detail: 'Algumas tarefas pedem clique ou toque contínuo',
        },
        {
          inputs: ['Enter'],
          action: 'Enviar mensagem / confirmar',
          detail: 'Envia no chat da reunião, chat fantasma ou apelido no lobby',
        },
      ],
    },
  ],
  tips: [
    'Fantasmas atravessam paredes e ainda podem terminar tarefas para ajudar a tripulação a vencer.',
    'Na sala de Segurança (Câmeras), aperte E, Espaço ou Esc para sair rápido se alguém chegar.',
    'Em partidas offline com bots, abrir esta cartilha (F1) pausa o jogo automaticamente.',
  ],
};
