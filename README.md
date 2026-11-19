<img src="assets/icon.svg" width="64" height="64" alt="Click Macacos">

# 🐒 Click Macacos — 1000 Monkey Slop Games

Portal estilo **Click Jogos** / launcher único (Web + pronto para empacotar na Steam) reunindo uma coleção de jogos **Monkey Slop** caóticos, burros e multiplayer P2P para jogar com os amigos.

## 🚀 Como Rodar Localmente

```bash
npm install
npm run build
npm run preview
```

Abra `http://localhost:4173` para navegar pelo portal **Click Macacos** e jogar todos os jogos já disponíveis (incluindo o clássico fundador **Monkey Climb Slop**).

Para desenvolver apenas um jogo específico com hot-reload:

```bash
npm run dev:game -- <slug-do-jogo>
```

Para validar o build de um jogo específico:

```bash
npm run build:game -- <slug-do-jogo>
```

## 🧩 Arquitetura

Veja [ARCHITECTURE.md](./ARCHITECTURE.md) para o plano completo dos 8 jogos, uso do `@monkey-slop/sdk` (multiplayer PeerJS WebRTC, áudio procedural e HUD flutuante) e o contrato zero-conflito para novos jogos em `games/<slug>/`.
