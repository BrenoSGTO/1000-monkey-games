import type { ControlsGuideConfig } from '@monkey-slop/sdk';
import { SLUG, TEAM_COLORS, TITLE } from './constants';

export const CONTROLS_GUIDE: Omit<ControlsGuideConfig, 'onOpenChange'> = {
  slug: SLUG,
  title: TITLE,
  goal: 'Acelere seu Fusca macaco, use turbo de guaraná e marque mais gols com a bola de coco gigante antes do tempo acabar!',
  sections: [
    {
      title: 'Solo & Online',
      icon: '🏎️',
      bindings: [
        {
          inputs: ['A', 'ArrowLeft'],
          action: 'Esquerda / Girar no ar',
        },
        {
          inputs: ['D', 'ArrowRight'],
          action: 'Direita / Girar no ar',
        },
        {
          inputs: ['Space', 'W', 'ArrowUp', 'Z', 'J'],
          action: 'Pular / Pulo duplo',
          detail: 'No ar, segure ← ou → e pule para dar um flip e chutar forte',
        },
        {
          inputs: ['Shift', 'S', 'ArrowDown', 'X', 'K'],
          action: 'Turbo de Guaraná',
          detail: 'Segure para acelerar com fogo e grito de macaco',
        },
      ],
    },
    {
      title: 'Jogador 1 (2P Local)',
      icon: '🐵',
      color: TEAM_COLORS[0].main,
      bindings: [
        {
          inputs: ['A', 'D'],
          action: 'Mover / Girar no ar',
        },
        {
          inputs: ['W', 'Space'],
          action: 'Pular / Flip',
        },
        {
          inputs: ['Shift', 'S', 'Q'],
          action: 'Turbo de Guaraná',
          detail: 'Shift esquerdo, S ou Q',
        },
      ],
    },
    {
      title: 'Jogador 2 (2P Local)',
      icon: '🐒',
      color: TEAM_COLORS[1].main,
      bindings: [
        {
          inputs: ['ArrowLeft', 'ArrowRight'],
          action: 'Mover / Girar no ar',
        },
        {
          inputs: ['ArrowUp', '0'],
          action: 'Pular / Flip',
          detail: 'Seta cima ou 0 do teclado numérico',
        },
        {
          inputs: ['Shift', 'ArrowDown', 'Enter', '/'],
          action: 'Turbo de Guaraná',
          detail: 'Shift direito, ↓, Enter ou /',
        },
      ],
    },
    {
      title: 'Menus, Replay & Toque',
      icon: '🎮',
      bindings: [
        {
          inputs: ['Esc', 'P', { ui: '⏸ Pausa (Esc)' }],
          action: 'Pausar / Voltar',
          detail: 'Partidas online não congelam o campo',
        },
        {
          inputs: ['Enter', { mouse: 'left' }, { touch: 'tap' }],
          action: 'Pular replay',
          detail: 'No modo solo (Enter) ou com clique/toque',
        },
        {
          inputs: [{ ui: '◀' }, { ui: '▶' }],
          action: 'Dirigir (celular/tablet)',
        },
        {
          inputs: [{ ui: '⤴' }, { ui: '🔥' }],
          action: 'Pular e Turbo (celular/tablet)',
        },
      ],
    },
  ],
  tips: [
    'Cole na parede e no teto: encoste as rodas e dirija normalmente!',
    'Capotou? Pule ou espere um instante para desvirar sozinho.',
    'Pegue as bolinhas de turbo pelo campo e no teto (as grandes enchem 100%).',
    'Empate no fim do tempo vai para a prorrogação com gol de ouro!',
  ],
};
