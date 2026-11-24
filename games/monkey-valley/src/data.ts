import type { Look, Season, ToolId } from './types';
import { doorOf, frontOf, SEASONS as SEASON_NAMES } from './layout';

export type ItemCat = 'tool' | 'seed' | 'crop' | 'fish' | 'mineral' | 'goods' | 'food' | 'junk';

export interface IconSpec {
  s: string;
  a: string;
  b?: string;
  c?: string;
}

export interface ItemDef {
  id: string;
  name: string;
  cat: ItemCat;
  sell: number;
  energy?: number;
  icon: IconSpec;
  desc: string;
}

export interface CropDef {
  id: string;
  name: string;
  seasons: Season[];
  days: number;
  regrow?: number;
  seed: number;
  sell: number;
  shape: 'root' | 'leafy' | 'berry' | 'tall' | 'vine' | 'tree' | 'palm';
  leaf: string;
  fruit: string;
  fruit2: string;
  energy: number;
  desc: string;
}

export const CROPS: Record<string, CropDef> = {};
const cropList: Omit<CropDef, 'energy'>[] = [
  { id: 'mandioca', name: 'Mandioca', seasons: [0], days: 4, seed: 20, sell: 55, shape: 'root', leaf: '#5fae4a', fruit: '#c9a06c', fruit2: '#e8d2a8', desc: 'Raiz firme que aguenta qualquer feijoada.' },
  { id: 'batata-doce', name: 'Batata-doce', seasons: [0, 2], days: 5, seed: 30, sell: 75, shape: 'root', leaf: '#4f9c52', fruit: '#a24fc9', fruit2: '#d9a6ef', desc: 'Roxa por fora, doce por dentro, igual o Vovô.' },
  { id: 'couve', name: 'Couve', seasons: [0, 2], days: 3, seed: 15, sell: 40, shape: 'leafy', leaf: '#3f9a45', fruit: '#6ed05a', fruit2: '#a9f08e', desc: 'Verdinha. Faz bem, dizem.' },
  { id: 'morango', name: 'Morango', seasons: [0], days: 6, regrow: 2, seed: 40, sell: 45, shape: 'berry', leaf: '#4aa04e', fruit: '#e8344f', fruit2: '#ff9aa8', desc: 'Dá de novo sem replantar!' },
  { id: 'banana', name: 'Banana', seasons: [1], days: 7, regrow: 3, seed: 100, sell: 60, shape: 'tall', leaf: '#4cb04d', fruit: '#f7d63c', fruit2: '#fff08a', desc: 'A estrela do bananal. Dá cachos sem parar!' },
  { id: 'milho', name: 'Milho', seasons: [1, 2], days: 6, seed: 40, sell: 95, shape: 'tall', leaf: '#6ab94a', fruit: '#f5cf40', fruit2: '#fff0a0', desc: 'Pipoca em potencial.' },
  { id: 'acai', name: 'Açaí', seasons: [1], days: 6, seed: 60, sell: 125, shape: 'palm', leaf: '#3f9a52', fruit: '#4b2a7a', fruit2: '#7e52b8', desc: 'Roxinho energético da Amazônia bananal.' },
  { id: 'abobora', name: 'Abóbora', seasons: [2], days: 8, seed: 90, sell: 220, shape: 'vine', leaf: '#5a9c3e', fruit: '#f08a22', fruit2: '#ffc060', desc: 'Gigante, laranja e orgulhosa.' },
  { id: 'caju', name: 'Caju', seasons: [2], days: 7, seed: 70, sell: 150, shape: 'tree', leaf: '#4d9a45', fruit: '#f0662a', fruit2: '#f7c84a', desc: 'A fruta que usa a castanha por fora.' },
  { id: 'cacau', name: 'Cacau', seasons: [2], days: 9, regrow: 3, seed: 120, sell: 105, shape: 'tall', leaf: '#3f8a45', fruit: '#a8552a', fruit2: '#e8a050', desc: 'Chocolate vem daqui, acredite.' },
  { id: 'inhame', name: 'Inhame Gelado', seasons: [3], days: 5, seed: 35, sell: 85, shape: 'root', leaf: '#7ab8a4', fruit: '#b9c4d6', fruit2: '#e6eef8', desc: 'Resistente ao frio e às piadas.' },
  { id: 'repolho', name: 'Repolho Gelado', seasons: [3], days: 6, seed: 50, sell: 120, shape: 'leafy', leaf: '#5aa8a0', fruit: '#8fd4c8', fruit2: '#d4f6ee', desc: 'Parece uma bola de neve verde.' },
];
for (const c of cropList) CROPS[c.id] = { ...c, energy: Math.max(10, Math.round(c.sell / 4)) };

export const ITEMS: Record<string, ItemDef> = {};
function item(id: string, name: string, cat: ItemCat, sell: number, icon: IconSpec, desc: string, energy?: number): void {
  ITEMS[id] = { id, name, cat, sell, icon, desc, energy };
}

for (const c of Object.values(CROPS)) {
  item(c.id, c.name, 'crop', c.sell, { s: 'crop-' + c.shape, a: c.fruit, b: c.fruit2, c: c.leaf }, c.desc, c.energy);
  item('s-' + c.id, `Semente de ${c.name}`, 'seed', Math.floor(c.seed / 2), { s: 'seed', a: c.fruit, b: c.leaf }, `Cresce em ${c.seasons.map((s) => SEASON_NAMES[s]).join(' e ')} em ${c.days} dias.`);
}



export const FISH_LIST: {
  id: string;
  name: string;
  area: 'rio' | 'mar';
  seasons: Season[];
  from: number;
  to: number;
  diff: number;
  price: number;
  a: string;
  b: string;
}[] = [
  { id: 'lambari', name: 'Lambari', area: 'rio', seasons: [0, 1, 2, 3], from: 360, to: 1560, diff: 1, price: 30, a: '#c0c8d2', b: '#f6d76a' },
  { id: 'tilapia', name: 'Tilápia', area: 'rio', seasons: [0, 1], from: 360, to: 1200, diff: 2, price: 60, a: '#8a9fb0', b: '#d6b8b8' },
  { id: 'pacu', name: 'Pacu', area: 'rio', seasons: [1, 2], from: 480, to: 1320, diff: 3, price: 110, a: '#6e7d4a', b: '#d9c06a' },
  { id: 'tucunare', name: 'Tucunaré', area: 'rio', seasons: [0, 2], from: 600, to: 1080, diff: 4, price: 180, a: '#4a8a5a', b: '#f2a03a' },
  { id: 'bagre', name: 'Bagre Bigodudo', area: 'rio', seasons: [2, 3], from: 360, to: 1560, diff: 2, price: 90, a: '#5a5f6a', b: '#a8a8b0' },
  { id: 'sardinha', name: 'Sardinha', area: 'mar', seasons: [0, 1, 2, 3], from: 360, to: 1560, diff: 1, price: 40, a: '#aab6c4', b: '#e8eef6' },
  { id: 'robalo', name: 'Robalo', area: 'mar', seasons: [0, 1], from: 420, to: 1320, diff: 3, price: 120, a: '#7a8aa0', b: '#d8e0ea' },
  { id: 'atum', name: 'Atum Zoeiro', area: 'mar', seasons: [1, 2], from: 360, to: 840, diff: 4, price: 220, a: '#3a5a9a', b: '#e87a7a' },
  { id: 'polvo', name: 'Polvo Maluco', area: 'mar', seasons: [2, 3], from: 1080, to: 1560, diff: 5, price: 330, a: '#c04a8a', b: '#f0a0d0' },
];
for (const f of FISH_LIST) item(f.id, f.name, 'fish', f.price, { s: 'fish', a: f.a, b: f.b }, `Peixe de ${f.area === 'rio' ? 'água doce' : 'mar'}. Dificuldade ${f.diff}/5.`, Math.round(f.price / 6));

item('bota', 'Bota Velha', 'junk', 1, { s: 'boot', a: '#7a5a3a', b: '#4a3a2a' }, 'Alguém perdeu um pé... ou um pé de bota.');
item('pedra', 'Pedra', 'mineral', 2, { s: 'stone', a: '#9aa0a8', b: '#c6ccd2' }, 'Uma pedra. Muito pedra.');
item('carvao', 'Carvão', 'mineral', 15, { s: 'stone', a: '#33353d', b: '#6a6e7a' }, 'Combustível para a forja e para o churrasco.');
item('cobre', 'Minério de Cobre', 'mineral', 20, { s: 'ore', a: '#e08a4a', b: '#9aa0a8' }, 'Brilha em laranja.');
item('ferro', 'Minério de Ferro', 'mineral', 40, { s: 'ore', a: '#cfd8e4', b: '#9aa0a8' }, 'Pesado e teimoso.');
item('ouro', 'Minério de Ouro', 'mineral', 80, { s: 'ore', a: '#ffd84a', b: '#9aa0a8' }, 'O sonho de todo macaco.');
item('quartzo', 'Quartzo', 'mineral', 90, { s: 'gem', a: '#f2d8ff', b: '#ffffff' }, 'Cristalzinho bonito.');
item('diamante', 'Diamante', 'mineral', 300, { s: 'gem', a: '#7ae6ff', b: '#e8fbff' }, 'Rico! Ricooo!');
item('madeira', 'Madeira', 'goods', 4, { s: 'log', a: '#9a6a3a', b: '#c99a62' }, 'Tronco honesto.');
item('fibra', 'Fibra', 'goods', 3, { s: 'fiber', a: '#6ab04a', b: '#a8d870' }, 'Capinada de ervas daninhas.');
item('capim', 'Capim', 'goods', 3, { s: 'hay', a: '#e0c24a', b: '#b8942a' }, 'Comida de galinha e cabra. Coloque no cocho!');
item('ovo', 'Ovo', 'goods', 35, { s: 'egg', a: '#f4ead2', b: '#d9c9a2' }, 'Ovinho fresco da galinha.', 18);
item('leite-cabra', 'Leite de Cabra', 'goods', 80, { s: 'milk', a: '#f8f8ff', b: '#c8d6e8' }, 'Leite da Cabra-Macaco. Pode ter gosto de banana.', 30);
item('gosma', 'Gosma', 'junk', 8, { s: 'slime', a: '#6ad85a', b: '#a8f89a' }, 'Gosmenta. Eca. Vale algo.');
item('pao-queijo', 'Pão de Queijo', 'food', 50, { s: 'bread', a: '#f0c060', b: '#c8903a' }, 'Recupera 70 de energia. Quentinho!', 70);
item('cafe', 'Cafezinho', 'food', 20, { s: 'coffee', a: '#6a3a1a', b: '#f4f0e6' }, 'Recupera 35 de energia. Acorda até pedra.', 35);

export const TOOL_IDS: ToolId[] = ['hoe', 'can', 'axe', 'pick', 'rod', 'sickle'];
export const TOOL_NAMES: Record<ToolId, string> = {
  hoe: 'Enxada',
  can: 'Regador',
  axe: 'Machado',
  pick: 'Picareta',
  rod: 'Vara de Pesca',
  sickle: 'Foice',
};
export const TIER_NAMES = ['Básico', 'Cobre', 'Ferro', 'Ouro'];
export const TIER_COLORS = ['#9aa3ad', '#e08a4a', '#dfe6ee', '#ffd84a'];
export const UPGRADE_COST = [
  { gold: 500, ore: 'cobre', n: 5 },
  { gold: 1500, ore: 'ferro', n: 5 },
  { gold: 4000, ore: 'ouro', n: 5 },
];
export const ROD_COST = [1200, 3500];

export const ANIMAL_PRICES = { galinha: 400, cabra: 1200 };

export const animalProduct = (k: 'galinha' | 'cabra'): string => (k === 'galinha' ? 'ovo' : 'leite-cabra');

export function shopStock(season: Season): { id: string; price: number }[] {
  const out: { id: string; price: number }[] = [];
  for (const c of Object.values(CROPS)) if (c.seasons.includes(season)) out.push({ id: 's-' + c.id, price: c.seed });
  out.push({ id: 'capim', price: 6 }, { id: 'pao-queijo', price: 100 }, { id: 'cafe', price: 45 });
  return out;
}

// ---------------- NPCs ----------------

export interface SchedEntry {
  t: number;
  x: number;
  y: number;
  inside?: boolean;
}

export interface NpcDef {
  id: string;
  name: string;
  title: string;
  look: Look;
  shop?: string;
  home: string;
  birthday: { s: Season; d: number };
  loves: string[];
  likes: string[];
  hates: string[];
  sched: SchedEntry[];
  generic: string[];
  rain: string[];
  winter: string[];
  hearts: [string[], string[], string[]];
  react: { love: string; like: string; neutral: string; hate: string; birthday: string };
  reward5: { id: string; n: number };
  shopLine: string;
}

const dm = doorOf('mercado');
const dfe = doorOf('ferraria');
const dfa = doorOf('fazendinha');
const dca = doorOf('cabana');
const dpr = doorOf('prefeitura');
const dda = doorOf('dalva');
const fmi = frontOf('mina');
const ffa = frontOf('fazendinha');
const ffe = frontOf('ferraria');

export const NPCS: NpcDef[] = [
  {
    id: 'sagui',
    name: 'Dona Sagui',
    title: 'Dona do Mercadinho',
    look: { fur: '#d9a066', muzzle: '#f6e0b5', ear: '#e8a0a0', shirt: '#e8689a', pants: '#8a5a7a', hat: 'laco', acc: 'avental', accColor: '#fdf6e8', hatColor: '#ff6fa8' },
    shop: 'mercado',
    home: 'mercado',
    birthday: { s: 0, d: 4 },
    loves: ['banana', 'acai', 'pao-queijo'],
    likes: ['morango', 'milho', 'ovo', 'cafe'],
    hates: ['gosma', 'bota', 'pedra'],
    sched: [
      { t: 360, x: dm[0], y: dm[1], inside: true },
      { t: 720, x: 44, y: 23 },
      { t: 790, x: dm[0], y: dm[1], inside: true },
    ],
    generic: [
      'Bom dia, meu bem! Já fofocou hoje? Eu já: três pessoas, uma árvore e um poste.',
      'O preço da semente subiu? Imagina! Foi a semente que ficou mais bonita.',
      'Se plantar couve, me traz. Meu fígado agradece e minha reputação também.',
      'Sabia que o Seu Mico paga a conta de luz com pedra? Pois é. Eu só aceito bananas.',
      'Hoje acordei tão animada que vendi um chinelo pro prefeito. Ele nem tem pé!',
      'Quem planta banana colhe... banana. É a matemática mais bonita que existe.',
    ],
    rain: ['Chuva é bom pro bananal e péssimo pro meu cabelo!', 'Guarda-chuva só vendo na loja. Brincadeira! Não tenho. Corre!'],
    winter: ['Frio de congelar o rabo! Compra um café, vai.', 'Inverno: a estação em que o macaco vira bolinha.'],
    hearts: [
      ['Sabe, você chegou aqui com cara de perdido... agora tem cara de quem vai quebrar meu recorde de vendas!', 'Segredo: o balcão é de madeira mas o cheque da Tia Orangotanga também. Sem fundos!'],
      ['Eu guardei um negocinho pra você. Não é fiado, é presente. Aceita! *(Ganhou presente!)*', 'Você é o melhor cliente que eu já tive. E o mais barulhento também.'],
      ['Meu bem, o dia que você virou fazendeiro, a vila virou uma família. Obrigada por isso!', 'Se eu tivesse um cacho de banana pra cada vez que você me fez rir... ia ter um bananal inteiro!'],
    ],
    react: {
      love: 'Meu Deus, é a coisa mais linda do mundo! Vem cá que eu te dou um abraço de macaca!',
      like: 'Ai, que gracinha! Adorei, viu?',
      neutral: 'Ah... obrigada. Vou dar um jeito de... guardar. Em algum lugar.',
      hate: 'Isso aí... isso aí pode ir direto pro lixo, querido.',
      birthday: 'Você lembrou do meu aniversário?! Eu juro que não chorei, é a cebola!',
    },
    reward5: { id: 'pao-queijo', n: 3 },
    shopLine: 'Bem-vindo ao Mercadinho Bananal! Aqui tem de tudo, menos paciência pra fiado.',
  },
  {
    id: 'mico',
    name: 'Seu Mico',
    title: 'Ferreiro Rabugento',
    look: { fur: '#4e3524', muzzle: '#a98466', ear: '#7a5a46', shirt: '#7a3a2a', pants: '#3a3a44', hat: 'lenco', acc: 'avental', accColor: '#6a4a2a', hatColor: '#c0392b' },
    shop: 'ferraria',
    home: 'ferraria',
    birthday: { s: 1, d: 9 },
    loves: ['ferro', 'ouro', 'diamante'],
    likes: ['cobre', 'carvao', 'quartzo', 'cafe'],
    hates: ['morango', 'couve', 'repolho'],
    sched: [
      { t: 360, x: dfe[0], y: dfe[1], inside: true },
      { t: 690, x: 47, y: 23 },
      { t: 750, x: dfe[0], y: dfe[1], inside: true },
      { t: 1020, x: ffe[0], y: ffe[1] },
      { t: 1200, x: dfe[0], y: dfe[1], inside: true },
    ],
    generic: [
      'Hmpf. O que você quer? Tô martelando.',
      'Ferramenta boa se faz com ferro e raiva. Muita raiva.',
      'Eu já vi macaco fraco. Você ainda é macaco fraco. Mas tem potencial.',
      'Não me peça pra consertar banana. Banana não quebra, apodrece.',
      'A picareta do seu avô era melhor. Mas ele também era mais chato.',
      'Se for me incomodar, que seja com ouro.',
    ],
    rain: ['Chuva enferruja tudo. Mau humor também.', 'Hoje nem a bigorna quer sair debaixo do telhado.'],
    winter: ['Frio bom. Esfria o ferro. E meu humor... também não, esse já nasceu frio.'],
    hearts: [
      ['*cof* ...você até que trabalha direito. Não vá se achar.', 'Meu bigode já foi mais bonito. A culpa é do fogo. E da idade.'],
      ['Toma. Fiz esse trem aí de sobra. Não é presente, é refugo. *(Ganhou algo!)*', 'Eu não sou rabugento! Eu sou... realista com mau humor.'],
      ['Sabe... Eu tinha esquecido o que era ter um amigo. Não conta pra ninguém, tá?', 'Teu avô foi o único que me aguentou. Agora você também. Obrigado, moleque.'],
    ],
    react: {
      love: '...Isso é do bom. Do MUITO bom. Tá, vou até sorrir. Só um pouquinho.',
      like: 'Hmpf. Tá aceito. Pode ficar parado aí.',
      neutral: 'Hum. Serve. Pra algo, talvez.',
      hate: 'Tira isso da minha frente antes que eu forje uma frigideira na sua cabeça.',
      birthday: 'Aniversário?! Eu nem comemoro. ...Mas valeu. Chato.',
    },
    reward5: { id: 'cobre', n: 5 },
    shopLine: 'Quer melhorar a ferramenta? Traga o minério e as bananas. Sem papo furado.',
  },
  {
    id: 'orangotanga',
    name: 'Tia Orangotanga',
    title: 'Cuidadora de Bichos',
    look: { fur: '#c8662b', muzzle: '#e9b27d', ear: '#e8a070', shirt: '#4f9a5a', pants: '#6a4a2a', hat: 'palha', acc: 'avental', accColor: '#3f7a4a', hatColor: '#f4a8c0' },
    shop: 'fazendinha',
    home: 'fazendinha',
    birthday: { s: 2, d: 2 },
    loves: ['ovo', 'leite-cabra', 'abobora'],
    likes: ['capim', 'milho', 'cacau', 'couve'],
    hates: ['gosma', 'bota', 'carvao'],
    sched: [
      { t: 360, x: dfa[0], y: dfa[1], inside: true },
      { t: 420, x: ffa[0] + 1, y: ffa[1] + 1 },
      { t: 660, x: 49, y: 23 },
      { t: 780, x: dfa[0], y: dfa[1], inside: true },
      { t: 1080, x: ffa[0] + 1, y: ffa[1] + 1 },
      { t: 1200, x: dfa[0], y: dfa[1], inside: true },
    ],
    generic: [
      'Oi, meu bem! Já deu bom dia pros bichinhos? Eles ficam magoados.',
      'Galinha é inteligente, sabia? A minha sabe contar até dois. Às vezes três.',
      'Cabra-Macaco é a melhor invenção do mundo. Dá leite e ainda faz careta!',
      'Capim no cocho todo dia, viu? Bicho feliz põe ovo feliz.',
      'Tenho 14 gatos e nenhum deles gosta de mim. Isso é amor, né?',
      'Minha mãe dizia: quem cuida de bicho, cuida da alma. Aí eu ganhei 14 gatos.',
    ],
    rain: ['Chuvinha boa pra capim crescer! Mas fecha o galinheiro, tá?', 'Os bichinhos ficam quietinhos na chuva. Tipo você, olhando pro nada.'],
    winter: ['Põe um cobertorzinho nas galinhas, querido!', 'Neve! As cabras estão achando que é algodão-doce.'],
    hearts: [
      ['Você tem jeito com bicho! O meu faro de tia nunca erra.', 'Quando eu era nova, tentei domar um gorila. Hoje ele é meu cunhado.'],
      ['Tá aqui, querido. Faz bom uso! *(Ganhou presente!)*', 'Se precisar de colo, é só falar. Tenho colo e tenho lã de cabra.'],
      ['Eu vejo você cuidando da roça e lembro do seu avô. Ele ia ficar tão orgulhoso!', 'Você é como um neto pra mim. Um neto que paga em dia.'],
    ],
    react: {
      love: 'Ai, ai, ai! Meu coraçãozinho! Vem aqui que eu te aperto!',
      like: 'Que lindeza! Obrigada, meu bem!',
      neutral: 'Que fofo! Eu... acho que vou usar. Ou plantar. Ou comer.',
      hate: 'Ai... isso aí é pra ser um presente ou uma ameaça?',
      birthday: 'Um presente no meu aniversário! Vou te dar um bolo! Depois. Tá, nunca.',
    },
    reward5: { id: 'ovo', n: 6 },
    shopLine: 'Quer um bichinho novo pra fazenda? Trate bem, ouviu?',
  },
  {
    id: 'capitao',
    name: 'Capitão Gorilão',
    title: 'Pescador de Histórias',
    look: { fur: '#4a4a52', muzzle: '#9a8e86', ear: '#7a6a66', shirt: '#2f6aa8', pants: '#e8e4da', hat: 'marinheiro', acc: 'barba', accColor: '#e8e8ee' },
    shop: 'cabana',
    home: 'cabana',
    birthday: { s: 3, d: 6 },
    loves: ['atum', 'polvo', 'tucunare'],
    likes: ['robalo', 'pacu', 'sardinha', 'cafe'],
    hates: ['couve', 'repolho', 'bota'],
    sched: [
      { t: 360, x: dca[0], y: dca[1], inside: true },
      { t: 420, x: 36, y: 48 },
      { t: 960, x: 43, y: 45 },
      { t: 1140, x: dca[0], y: dca[1], inside: true },
    ],
    generic: [
      'Uma vez pesquei um peixe tão grande que a gente teve que fazer um anexo na ilha!',
      'O mar está calmo hoje. Calmo demais. Desconfio de polvo.',
      'Minha vara tem nome: Dolores. Ela nunca me abandonou. Já a Dolores de verdade...',
      'Peixe bom a gente conta a história. Peixe ruim a gente conta MAIOR.',
      'Isca é igual a amor: sem ela o peixe não vem. Gostou? É meu aniversário na camiseta.',
      'Ei, marujo! Se pegar uma bota, não joga fora! É a minha coleção!',
    ],
    rain: ['Dia de chuva, dia de peixe! Peixe adora chuva. Eu adoro peixe. Chuva é neutra.', 'Aarrr, chuva! Fico seco só de olhar pro mar!'],
    winter: ['No inverno o polvo sai à noite. Já vi um com cachecol. Não duvide!', 'Esse frio me dá nostalgia... de ter calor.'],
    hearts: [
      ['Você tem jeito com a vara, marujo! Só precisa de mais gritaria.', 'Já te contei do kraken? Era um polvo. Do tamanho de um polvo. Mas ficou grande na minha cabeça.'],
      ['Aceita aí, marujo! Esse é pros dias de pesca ruim. *(Ganhou presente!)*', 'Pescar é esperar. Mas esperar acompanhado é melhor!'],
      ['Sabe, marujo? Eu já naveguei o mundo todo. E o melhor lugar sempre foi aqui, com os amigos.', 'Quando eu me for, a Dolores é sua. A vara. A mulher não, ela me deixou.'],
    ],
    react: {
      love: 'Aaaarrr! É ISSO que eu chamo de tesouro! Vou escrever uma música sobre isso!',
      like: 'Tá aceito, marujo! Isso vai bem com um café!',
      neutral: 'Hmm... sei lá, marujo. Vai servir pra algo. Ou pra nada.',
      hate: 'Argh! Tira essa coisa daqui antes que o mar se revolte!',
      birthday: 'Um presente no meu aniversário! Eu juro que não esperava! (estava esperando)',
    },
    reward5: { id: 'sardinha', n: 5 },
    shopLine: 'Quer uma vara melhor? Posso ajeitar a Dolores pra você!',
  },
  {
    id: 'prefeito',
    name: 'Prefeito Babuíno',
    title: 'Prefeito de Vila Bananal',
    look: { fur: '#8a7a62', muzzle: '#d5a8a0', ear: '#c9908a', shirt: '#2a4a8a', pants: '#2a2a34', hat: 'cartola', acc: 'faixa', accColor: '#f5d142' },
    home: 'prefeitura',
    birthday: { s: 1, d: 1 },
    loves: ['caju', 'ouro', 'cacau'],
    likes: ['abobora', 'quartzo', 'atum', 'pao-queijo'],
    hates: ['mandioca', 'gosma', 'bota'],
    sched: [
      { t: 360, x: dpr[0], y: dpr[1], inside: true },
      { t: 540, x: 42, y: 22 },
      { t: 840, x: 40, y: 23 },
      { t: 1020, x: dpr[0], y: dpr[1], inside: true },
    ],
    generic: [
      'Cidadão! Como prefeito, declaro este dia... um dia!',
      'Eu prometi asfalto. Entreguei o pasto. Mas ficou bonito, né?',
      'O orçamento da vila é de 12 bananas. Mas a ambição é infinita!',
      'Votem em mim! ...Ah, já votaram. Votem de novo, por precaução.',
      'Eu represento a vila! Principalmente quando tem festa com bufê.',
      'Fiz um discurso sobre democracia. Só o poste aplaudiu. Poste esperto.',
    ],
    rain: ['Em dia de chuva, a prefeitura não funciona. Em dia de sol também não, mas pelo menos tem sol!', 'Minha cartola é à prova d\'água! Na verdade é só uma cartola.'],
    winter: ['Inverno é a estação do povo se juntar. Principalmente em volta do meu aquecedor!', 'Decreto o frio. ...Não funcionou? Tá bom.'],
    hearts: [
      ['Você tem espírito público, cidadão! Eu notei isso... ou me disseram. Dá no mesmo.', 'Meu bigode é a razão da minha popularidade. Cinquenta e dois por cento dos votos!'],
      ['Aceite esta pequena condecoração da vila! Eu fiz sozinho. Tá, o Seu Mico fez. *(Ganhou presente!)*', 'Posso confessar? Não sei o que um prefeito faz. Eu só finjo com muita confiança.'],
      ['Cidadão, a vila tem sorte de te ter. E eu... sinto algo parecido com orgulho. Ou indigestão.', 'Quando eu me aposentar, quero um sucessor de confiança. Você já tem a cartola?'],
    ],
    react: {
      love: 'Um presente digno de um prefeito! Declaro hoje feriado municipal!',
      like: 'Muito bem, cidadão! Será registrado nos anais da vila!',
      neutral: 'Hum... sim. Um presente. É... é um presente, certo?',
      hate: 'Isso é um escândalo! Um insulto! Vou fazer uma CPI!',
      birthday: 'Meu aniversário? Isso merece um decreto! Obrigado, cidadão!',
    },
    reward5: { id: 'quartzo', n: 1 },
    shopLine: 'A Prefeitura não vende nada, mas aceita elogios!',
  },
  {
    id: 'dalva',
    name: 'Dalva da Mina',
    title: 'Exploradora de Cavernas',
    look: { fur: '#d8d4cc', muzzle: '#f3eadb', ear: '#e8b0b0', shirt: '#f0a020', pants: '#4a5a7a', hat: 'capacete', acc: 'oculos', accColor: '#2a2a2a' },
    home: 'dalva',
    birthday: { s: 0, d: 12 },
    loves: ['quartzo', 'diamante', 'cobre'],
    likes: ['carvao', 'pedra', 'ferro', 'cafe'],
    hates: ['repolho', 'acai', 'gosma'],
    sched: [
      { t: 360, x: dda[0], y: dda[1], inside: true },
      { t: 480, x: fmi[0] + 1, y: fmi[1] },
      { t: 900, x: 49, y: 23 },
      { t: 1110, x: dda[0], y: dda[1], inside: true },
    ],
    generic: [
      'A mina do seu avô é massa! Tem uma gosma lá que me chamou de mãe. Sério.',
      'Pedra é a melhor invenção da natureza. Barata, durável e não reclama.',
      'Se você cavar fundo o bastante, encontra o outro lado do mundo. Ou pelo menos uma minhoca.',
      'Eu não tenho medo de morcego. Eu tenho medo de queda. De morcego eu só tenho nojo.',
      'Cada pedra é um presente. Cada pedra quebrada é um presente aberto!',
      'Minha lanterna só funciona quando eu bato nela. Igual meu irmão.',
    ],
    rain: ['Chuva? Eu fico na mina! Lá dentro sempre tá nublado!', 'Dia ótimo pra cavar. Dia ótimo pra tudo, na real.'],
    winter: ['Na mina nunca é inverno. É sempre uma mistura de úmido com tristeza!', 'No inverno a caverna fica um freezer. Peguei um resfriado de pedra.'],
    hearts: [
      ['Você tá minerando direitinho! Mas cuidado com a gosma, ela é fofoqueira.', 'Eu desci até o andar 20 uma vez. Tem um tesouro lá... se você aguentar o escuro.'],
      ['Achei isso e pensei em você! Não pergunta onde. *(Ganhou presente!)*', 'Quer saber o segredo do mineiro? Bater com vontade e rezar pra não cair.'],
      ['Você é meu melhor parceiro de caverna! Até a gosma gosta de você.', 'No dia que eu achar um diamante do tamanho da minha cabeça, vou dividir contigo. Pela metade. Ou menos.'],
    ],
    react: {
      love: 'AAAAA! É PERFEITO! Vou dormir abraçada nisso hoje!',
      like: 'Que maneiro! Valeu demais!',
      neutral: 'Ah, legal... eu acho. Pode ser útil! Ou não.',
      hate: 'Eca! Tira isso de perto de mim, argh!',
      birthday: 'Presente de aniversário?! Esse foi o melhor dia da minha vida! Depois do dia que achei um osso de dinossauro!',
    },
    reward5: { id: 'carvao', n: 10 },
    shopLine: 'Não vendo nada. Mas posso dar dicas! Cava!',
  },
];

export const NPC_BY_ID: Record<string, NpcDef> = {};
for (const n of NPCS) NPC_BY_ID[n.id] = n;

export const FUR_PALETTES = [
  { name: 'Caramelo', fur: '#c98f55', muzzle: '#f0d2a0', ear: '#e8a0a0' },
  { name: 'Chocolate', fur: '#7a4a2b', muzzle: '#d7b48a', ear: '#d99a90' },
  { name: 'Bugio', fur: '#3a3340', muzzle: '#a89a94', ear: '#c8908a' },
  { name: 'Ruivo', fur: '#d9722e', muzzle: '#f2c694', ear: '#f0a090' },
  { name: 'Cinza', fur: '#9a9aa6', muzzle: '#e8e4df', ear: '#e8a8a8' },
  { name: 'Dourado', fur: '#e0b34a', muzzle: '#fbe9b5', ear: '#f0a8a0' },
];
export const SHIRT_COLORS = ['#e05a4f', '#4f9be0', '#58b368', '#e0b13f', '#a566d6', '#ee7fb0', '#f08a3a', '#3fc2c2'];

export function playerLook(fi: number, si: number): Look {
  const f = FUR_PALETTES[((fi % FUR_PALETTES.length) + FUR_PALETTES.length) % FUR_PALETTES.length];
  return {
    fur: f.fur,
    muzzle: f.muzzle,
    ear: f.ear,
    shirt: SHIRT_COLORS[((si % SHIRT_COLORS.length) + SHIRT_COLORS.length) % SHIRT_COLORS.length],
    pants: '#3b6ab0',
    hat: 'palha',
    acc: 'nenhum',
    accColor: '#fff',
  };
}

export const QUESTS: { text: string; stat: string; goal: number }[] = [
  { text: 'Pressione 1 (Enxada) e ARE 5 tiles de grama na roça (Espaço).', stat: 'tilled', goal: 5 },
  { text: 'Selecione as sementes na barra e PLANTE 4 sementes na terra arada.', stat: 'planted', goal: 4 },
  { text: 'Pressione 2 (Regador), encha na água do lago e REGUE as plantas.', stat: 'watered', goal: 4 },
  { text: 'Vá até a porta da casa e aperte E para DORMIR e passar o dia.', stat: 'slept', goal: 1 },
  { text: 'Colha as plantas maduras (E ou Espaço) e coloque na Caixa de Entrega (E).', stat: 'shipped', goal: 3 },
  { text: 'Conheça a vila! Converse (E) com 3 moradores.', stat: 'talks', goal: 3 },
  { text: 'Pesque um peixe com a Vara (5) no rio, lago ou mar!', stat: 'fished', goal: 1 },
  { text: 'Entre na Mina (nordeste da vila) e quebre 10 pedras!', stat: 'mined', goal: 10 },
  { text: 'META: Junte 10.000 bananas e vire lenda do Bananal!', stat: 'earned', goal: 10000 },
];

export const GOAL_MONEY = 10000;

export function weekdayOf(day: number): number {
  return (day - 1) % 7;
}
