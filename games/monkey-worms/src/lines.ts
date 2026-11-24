import type { WeaponId } from './types';

export const HURT_LINES = [
  'Ai, minha banana!',
  'Ooook!',
  'Isso doeu no orgulho!',
  'Chama o SAMU-co!',
  'Eu tenho família!',
  'Foi sem querer, né?',
  'Meu capacete!!',
  'Meu advogado vai saber!',
  'Que covardia!',
  'Uuuh-uuh-aah!',
  'Minha mãe nunca bateu!',
  'Aí já é maldade!',
  'Cuidado com o cabelo!',
];

export const BIG_HURT_LINES = ['AAAAAH!!', 'VOU PRA LUA!', 'SOCORROOO!', 'ME SEGURA!', 'EU VOO!'];

export const DEATH_LINES = [
  'Adeus, mundo cruel!',
  'Diz pra mamãe que...',
  'Fui de base...',
  'Eu queria só uma banana...',
  'Tá tudo escuro...',
  'Vou pro céu das bananas!',
  'Pelo menos tava de capacete...',
];

export const DROWN_LINES = ['Glub glub...', 'Eu não sei nadar!', 'Blub!', 'Macaco não nada!'];

export const FALL_LINES = ['Meus joelhos!', 'Escorreguei na casca!', 'Ui, o chão!', 'Quem mexeu no chão?'];

export const TAUNT_LINES = [
  'Hahaha, errou!',
  'Isso é tudo?',
  'Chupa, banana!',
  'Ooh-ooh-ah-ah!',
  'Tô de olho em você...',
];

export const VICTORY_LINES = [
  'Banana pra todo mundo!',
  'Sou o rei da selva!',
  'Ooh ooh! Ganhei!',
  'Mais uma pro currículo!',
];

export const LOW_HP_LINES = ['Tô quase indo...', 'Segura, coração!', 'Só mais um pouquinho...'];

export const FIRE_LINES: Record<WeaponId, string[]> = {
  bazooka: ['Toma coco!', 'Cocada na testa!', 'Fogo no coqueiro!'],
  grenade: ['Banana na área!', 'Pega essa banana!', 'Vai, bananinha!'],
  sheep: ['Vai, Capivarinha!', 'Corre, Capi!', 'Bom trabalho, capivara!'],
  slipper: ['Chinelada!', 'Minha mãe mandou!', 'Chinelo, atacar!'],
  pigeons: ['Pombos, atacar!', 'Cocô aéreo!', 'Chuva de pombo!'],
  rope: ['Tarzan!', 'Aaa-ee-aaa!'],
  torch: ['Churrasco!', 'Hora do maçarico!'],
  kamikaze: ['BANZAAAAI!', 'ADEUS, MUNDO!'],
  mine: ['Casquinha de banana...', 'Plantando banana...'],
  holy: ['Aleluia, bananas!', 'Que a banana me ilumine!'],
  slap: ['TAPA!', 'Toma, folgado!'],
};

export const WORM_NAMES = [
  'Chico Prego',
  'Mico Dourado',
  'Bananildo',
  'Zé Cipó',
  'Macaco Véio',
  'Tarzan Bêbado',
  'Cacau',
  'Gorilão',
  'Pelúcio',
  'Sagui Jr.',
  'Orango Tango',
  'Babuíno Beto',
  'Mono Lisa',
  'Banano',
  'King Kongo',
  'Cuca',
  'Pé de Pano',
  'Maluco Beleza',
  'Bonobo Joe',
  'Macaca Chita',
  'Coquinho',
  'Zeca Urubu',
  'Dona Bananilda',
  'Mico Louco',
];

export const SD_LINES = [
  'MORTE SÚBITA! O mar está subindo!',
  'A MARÉ SOBE! Corre pro alto!',
  'MORTE SÚBITA! Glub glub glub!',
];

export function pickLine(arr: readonly string[]): string {
  return arr[Math.floor(Math.random() * arr.length)];
}
