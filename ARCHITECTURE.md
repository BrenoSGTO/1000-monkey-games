# 🐒 Click Macacos — Arquitetura & Contrato dos Agentes (`1000-monkey-games`)

Este documento define a arquitetura do monorepo **Click Macacos** e o contrato estrito **zero-conflito** para que múltiplos agentes desenvolvam jogos Monkey Slop em paralelo em worktrees isolados e abram PRs que fazem merge limpo em `master`.

---

## 1. Visão Geral

- **Portal Web estilo Click Jogos (`apps/portal`)**: launcher único onde todos os jogos aparecem automaticamente, com filtros por categoria, busca, Roleta Macaca, recordes locais e player embutido em tela cheia (`<iframe>` com `postMessage`).
- **Steam-Ready**: todo o bundle final em `dist/` usa caminhos relativos (`base: './'`) e áudio procedural via WebAudio — pronto para rodar no GitHub Pages **e** para ser empacotado em Electron/Tauri + Steamworks no futuro sem reescrever os jogos.
- **SDK Compartilhado (`packages/monkey-sdk` -> `@monkey-slop/sdk`)**:
  - `PeerRoom<TMessage>`: multiplayer P2P gratuito via PeerJS (WebRTC + STUN Google/Cloudflare) com código curto (`A1B2`) e auto-entrada via `?room=A1B2`.
  - `monkeyAudio`: sons procedurais de macaco/slapstick (`banana`, `screech`, `boing`, `slap`, `explosion`, `fanfare`, `rage`, `click`, `coin`) com mute persistente.
  - `mountMonkeyHud`: barra flutuante no canto superior esquerdo com botão **"🍌 Click Macacos"**, botão de som, popover **Co-op Online** pronto para uso e toasts animados.
  - `reportGameScore` / `getGameScore`: recordes locais sincronizados com o portal.
- **Dependências pré-instaladas na raiz** (disponíveis para qualquer jogo sem mexer no `package.json` raiz):
  - `vite`, `typescript`, `peerjs`, `planck-js` (Box2D 2D physics), `@monkey-slop/sdk`.

---

## 2. Contrato Estrito Zero-Conflito para Agentes de Jogo

Cada agente trabalha em uma branch própria `game/<slug>` a partir de `origin/master` e **DEVE obedecer rigorosamente**:

1. **ISOLAMENTO TOTAL DE ARQUIVOS**:
   - Crie e edite arquivos **EXCLUSIVAMENTE** dentro de `games/<slug>/`.
   - **NÃO modifique** `package.json`, `package-lock.json`, `apps/portal/*`, `packages/monkey-sdk/*`, `scripts/*` ou outros diretórios em `games/`.
   - **NÃO rode `npm install <pacote>`** — use apenas TypeScript/Canvas/WebAudio + as libs já instaladas na raiz (`@monkey-slop/sdk`, `planck-js`, `peerjs`). Se precisar rodar `npm ci` no worktree para instalar `node_modules` locais, faça `npm ci` (nunca altere `package-lock.json`).
2. **ARQUIVOS OBRIGATÓRIOS EM `games/<slug>/`**:
   - `game.manifest.json`: metadados válidos (`slug` igual ao nome da pasta, `status: "playable"`, `thumbnail: "thumbnail.svg"`, etc.).
   - `thumbnail.svg`: arte de capa SVG vibrante e bem-humorada (proporção 16:9, ex: `viewBox="0 0 640 360"`).
   - `index.html`: página standalone carregando `./src/main.ts`.
   - `tsconfig.json`:
     ```json
     {
       "extends": "../../tsconfig.base.json",
       "compilerOptions": {
         "paths": {
           "@monkey-slop/sdk": ["../../packages/monkey-sdk/src/index.ts"]
         }
       },
       "include": ["src"]
     }
     ```
   - `src/main.ts` (+ módulos organizados em `src/`): jogo completo, divertido, responsivo, jogável imediatamente em Solo **e** com Co-op/Versus real via `PeerRoom` + `mountMonkeyHud` do `@monkey-slop/sdk`.
3. **QUALIDADE "MONKEY SLOP" (NÃO É SLOP QUEBRADO — É SLOP HILÁRIO E JOGÁVEL!)**:
   - Visual expressivo e colorido em Canvas 2D (ou SVG/DOM + Canvas): macacos desenhados com personalidade (olhos vesgos, orelhas grandes, bananas, expressões faciais reagindo ao caos!), screen shake, partículas, textos flutuantes engraçados em PT-BR.
   - Física ou gameplay gostoso e viciante desde o primeiro segundo (tela de título rápida ou botão gigante "JOGAR", controles claros na tela, reinício instantâneo sem recarregar a página).
   - Humor brasileiro/macaco idiota nas falas, upgrades, eventos e telas de derrota/vitória.
   - Áudio procedural (`monkeyAudio` + WebAudio customizado se quiser música/efeitos extras).
   - Multiplayer P2P funcional usando `PeerRoom` + `mountMonkeyHud({ slug, title, room })` — sempre funcionando perfeitamente também no modo Solo/Offline!
   - Reporte de pontuação com `reportGameScore(slug, score)` no fim das partidas/fases.
4. **VALIDAÇÃO E ENTREGA NO GITHUB**:
   - Rode `npm run build:game -- <slug>` e `npm run build` na raiz — ambos precisam passar com exit code 0 e zero erros de TypeScript!
   - Confira `git status` para garantir que **APENAS** arquivos dentro de `games/<slug>/` aparecem modificados/criados.
   - Faça commit na branch `game/<slug>`, dê `git push -u origin game/<slug>` e abra um Pull Request no GitHub (`gh pr create`) contra `master` explicando o jogo, controles e modo multiplayer!

---

## 3. Catálogo Oficial dos Jogos Orquestrados

### Wave 1 — Coleção Original (Jogáveis)

| # | Slug | Título Monkey Slop | Inspiração | Branch |
|---|---|---|---|---|
| 0 | `monkey-climb-slop` | Monkey Climb Slop (externo já pronto) | Getting Over It | repo separado |
| 1 | `monkey-bloons-td` | Macaco Estoura-Bexiga TD | Bloons TD | `game/monkey-bloons-td` |
| 2 | `monkey-skylines` | SimMacaco: Prefeitura do Caos | Cities: Skylines | `game/monkey-skylines` |
| 3 | `monkey-polybridge` | Ponte de Cipó & Gambiarra | Poly Bridge | `game/monkey-polybridge` |
| 4 | `monkey-skate` | Tony Chimp: Skate Ragdoll | Skate | `game/monkey-skate` |
| 5 | `monkey-motorways` | Mini Macacoways | Mini Motorways | `game/monkey-motorways` |
| 6 | `monkey-cells` | Hollow Chimp: Masmorra da Banana | Dead Cells / Hollow Knight | `game/monkey-cells` |
| 7 | `monkey-dash` | Chimp Dash: Surto Rítmico | Geometry Dash | `game/monkey-dash` |
| 8 | `monkey-angrybirds` | Macacos Pistola | Angry Birds | `game/monkey-angrybirds` |

### Wave 2 — Novos Party & Life-Sim Games (Em Desenvolvimento via PRs)

| # | Slug | Título Monkey Slop | Inspiração | Branch |
|---|---|---|---|---|
| 9 | `monkey-pico-park` | Pico Macaco: A Chave da Banana | Pico Park | `game/monkey-pico-park` |
| 10 | `monkey-overcooked` | Macaco na Chapa: Cozinha do Caos | Overcooked | `game/monkey-overcooked` |
| 11 | `monkey-amongus` | Entre Macacos: Quem Roubou a Banana? | Among Us | `game/monkey-amongus` |
| 12 | `monkey-sims` | Os Macacos: Vida na Árvore | The Sims | `game/monkey-sims` |
