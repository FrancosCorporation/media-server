# MELHORIAS — media-server

> **Gerado em 2026-10-02 · revisado em 2026-10-11** · Stack: Node + Express + TypeScript (backend) + React (frontend) · proxies TMDB/OMDb/Radarr/Sonarr
> Branch `main` · snapshot de fontes sem manifestos de build; testes e CI indisponíveis nesta árvore
>
> **Este arquivo é um plano de execução.** Cada item tem ID, `arquivo:linha`, mudança exata,
> critério de aceite e comando de verificação.
>
> **⚠️ Este serviço é um proxy para serviços internos com chaves de API.** As rotas de imagem agora exigem JWT, validam paths e não registram segredos. Não publique query strings com token nos logs do proxy reverso.

---

## 0. Como usar este documento

1. Execute na ordem **P0 → P1 → P2 → P3**, respeitando as ondas da §8.
2. Ao terminar um item, marque `- [x]` e faça as verificações estáticas disponíveis; não execute testes sem autorização explícita.
3. **Não reescreva o proxy de imagens.** `cacheFilePath()` usa SHA-256 para gerar nomes internos
   e a allowlist de paths protege os destinos de Radarr/Sonarr.
   Não crie um item inexistente aqui.
4. As rotas de imagem e capa e `/api/docs.json` exigem `authenticateToken`; `/health` continua público.
5. **Idioma:** português.

---

### Estado atualizado em 2026-10-11

| Item | Estado |
|---|---|
| SEC-01/02, SEC-04/05/06, BUG-01/02/03, IMP-01/02 | Implementados no código; faltam confirmação operacional e rotação manual das credenciais já expostas |
| SEC-03 | Proxies protegidos; frontend envia token nas URLs de imagem e nos redirects locais |
| SEC-10 | Defaults removidos, senha inicial exigida e logs de credenciais removidos; rotação manual ainda pendente |
| DEVOPS-02, DOC-01/02 | Exemplo de ambiente, README e SECURITY.md atualizados |
| TEST-01 | Pendente; não foram adicionados nem executados testes |
| DEVOPS-01 | Bloqueado pela ausência de `package.json`, lockfile e `tsconfig.json` neste snapshot |

Este quadro substitui os achados de estado da análise inicial abaixo. A credencial de banco deixada em `.env.example` pelo trabalho local não foi incluída; o exemplo versionado neste commit contém apenas campos de segredo vazios.

## 1. Diagnóstico executivo

Media-server: biblioteca com metadados (TMDB/OMDb), proxy de capas (Radarr/Sonarr), conversão de
mídia e streaming. Backend Express com rotas de proxy para fontes externas.

**O que está bem e foi verificado (não reaça):**

| Item | Evidência |
|---|---|
| `authenticateToken` aplicado na conversão, proxies de imagem/capa e docs JSON | `index.ts` |
| JWT exige `JWT_SECRET` e **falha cedo** sem ele | `middleware/auth.ts:7-10` (`process.exit(1)`) |
| **Rate limit de login** (100/15 min por IP) | `middleware/auth.ts` |
| Cache de imagem com limite, TTL, reserva de disco e nomes SHA-256 | `index.ts` |
| `fetch` via processo filho com **`maxBuffer` e `timeout`** | `index.ts:204` (`execFile`, 45 s, 5 MB) |
| `validateStatus: () => true` — não lança para 4xx/5xx (tratamento explícito) | `index.ts:375` |
| Status do upstream repassado ao cliente | `index.ts:390+` (404 → 404) |
| Logging estruturado por componente | `logger.info('TMDBImage', ...)` |
| `Timeout: 15000` no proxy | `index.ts:377` |

**Pendências verificáveis:** rotacionar no Radarr/Sonarr/Prowlarr/Jackett/qBittorrent/MongoDB credenciais que possam ter sido usadas com os antigos valores padrão; validar em ambiente de produção o fluxo de imagem autenticado; restaurar os manifestos oficiais antes de criar CI/build. A rotação exige acesso aos serviços e não pode ser concluída pelo código.

---

## 2. Tabela de prioridades

| ID | Título | Sev | Arquivo | Depende de |
|---|---|---|---|---|
| SEC-01 | API key do Radarr/Sonarr escrita no **log** | **P0** | `backend/src/index.ts:365,443` | — |
| SEC-10 | Credenciais padrão embutidas e senha inicial do admin no log | **P0** | `seed.ts`, `database.ts`, `*Service.ts` | rotação manual |
| SEC-02 | `coverPath` do cliente → URL do serviço interno (proxy arbitrário) | **P0** | `index.ts:358,439` | — |
| SEC-03 | 7 de 8 rotas sem autenticação | **P1** | `index.ts` (só `:267` com auth) | — |
| SEC-04 | CORS `*` no proxy de imagem | **P1** | `index.ts:193` | — |
| SEC-05 | `GET /api/docs.json` público (schema exposto) | **P2** | `index.ts:351` | — |
| SEC-06 | Extensão de imagem vem do cliente (Content-Type) | **P2** | `index.ts:185-189` | — |
| BUG-01 | `error.message` exposto no proxy | **P2** | `index.ts:250` | — |
| BUG-02 | Cache escrito sem checar `diskUsage`/TTL (cresce sem limite) | **P2** | `index.ts:240-243` | — |
| BUG-03 | Sem `try/finally` no `execFile` de cache em startup | **P3** | `index.ts:204` | — |
| IMP-01 | Rate limit nas rotas de proxy (consumo externo) | **P1** | `index.ts` | SEC-03 |
| IMP-02 | Sem healthcheck do upstream (TMDB/OMDb/Radarr) | **P2** | `index.ts:262` | — |
| TEST-01 | Zero testes (proxy e auth) | **P1** | *(ausente)* | SEC-02, SEC-03 |
| DEVOPS-01 | Sem CI | **P2** | *(ausente)* | — |
| DEVOPS-02 | Sem `.env.example` (chaves de Radarr/Sonarr) | **P1** | *(ausente)* | SEC-01 |
| DOC-01 | README não documenta que é proxy com chave | **P1** | `README.md` | SEC-01 |
| DOC-02 | Falta `SECURITY.md` | **P3** | *(ausente)* | SEC-01 |

**Placar: 3 P0 · 6 P1 · 6 P2 · 2 P3 = 17 itens.**

---

## 3. Segurança

### SEC-10 · Credenciais padrão embutidas e senha inicial no log · [P0]

- **Arquivos:** `backend/src/config/seed.ts`, `database.ts`,
  `services/{QBittorrentService,ProwlarrService,JackettService}.ts`,
  `routes/{settings,qbittorrent}.ts`.
- **Risco:** o código tinha senha administrativa previsível, credenciais padrão
  de integrações e registrava a senha do administrador recém-criado. Falhas de
  TMDB/OMDb/Jackett também podiam registrar a URL com a chave em query.
- **Mudança implementada:** primeiro admin exige `ADMIN_USERNAME`, `ADMIN_EMAIL`
  e senha com pelo menos 16 bytes; MongoDB exige `MONGO_URI`; defaults de senha
  e API keys foram removidos; logs agora registram códigos/status, sem mensagem
  que possa conter URL autenticada; a API de settings mascara chaves tanto do
  banco quanto do ambiente.
- **Aceite do código:** nenhuma credencial padrão ativa nem segredo em log.
- **Pendente:** rotacionar credenciais já usadas e valores expostos em histórico,
  banco ou logs antigos. Não reescrever o histórico Git.

### SEC-01 · API key do Radarr/Sonarr escrita no log · [P0]

- **Arquivo:** `backend/src/index.ts:365` (Radarr) e `:443` (Sonarr)
- **Evidência:**
  ```typescript
  const target = `${baseUrl}${coverPath}${hasQuery ? '&' : '?'}apikey=${apiKey}`;
  ...
  logger.info('RadarrCover', `Proxying cover request`, { target });   // linha 365
  ```
  e o mesmo em `:443` com `logger.info('SonarrCover', ..., { target })`. `target` **contém a API key**
  em texto claro — e é passado como campo de log. Cada request de capa **grava a chave**.
- **Impacto:** a API key do Radarr/Sonarr (que permite **ler e alterar** a biblioteca: downloads,
  exclusões, configuração) fica em **arquivo de log**, em **texto puro**. Combinado com a
  ausência de auth (`SEC-03`), um atacante que lê o log (contêiner, `.log` compartilhado, backup,
  log shipping) obtém a chave de **controle** do serviço de mídia. E é **repetido por requisição** —
  não é um vazamento pontual, é um gerador contínuo.
- **Mudança:** (1) **nunca** passar `target` (ou qualquer URL com `apikey=`) para o logger; (2) logar
  apenas o **path** (`coverPath`) + status — nunca a query string completa; (3) sanitizar
  qualquer URL antes de logar (redigir `apikey`, `token`, `key`, `authorization`);
  (4) **rotacionar** as chaves já logadas (se o log já saiu do servidor, a chave está comprometida);
  (5) preferir enviar a chave só em header (`X-Api-Key`, já é feito em `:372,449`) — remover a
  query string quando possível, ou colocá-la **depois** da sanização do log.
- **Aceite:** `grep -r 'apikey' logs/` → vazio; nenhuma chave em nenhum log.
- **Verificação:**
  ```bash
  grep -rn 'apikey=' logs/ 2>/dev/null | head -3 && echo 'FALHA: chave em log' || echo OK
  # apos rodar o servico:
  grep -rn 'apikey' /var/log/media-server/*.log 2>/dev/null && echo FALHA || echo OK
  ```

### SEC-02 · `coverPath` do cliente → URL do serviço interno · [P0]

- **Arquivo:** `backend/src/index.ts:358` (Radarr) e `:439` (Sonarr)
- **Evidência:**
  ```typescript
  const coverPath = req.path.replace('/api/radarr-cover', '').replace(/MediaCoverProxy/g, 'MediaCover');
  const target = `${baseUrl}${coverPath}${hasQuery ? '&' : '?'}apikey=${apiKey}`;
  ```
  `coverPath` vem de `req.path` — **controlado pelo cliente** — e é concatenado ao `baseUrl` do
  Radarr/Sonarr. Sem normalização nem validação de prefixo.
- **Impacto:** **proxy arbitrário para o serviço interno**, com a chave. O path com `../` é
  **normalizado pelo URL parser** do axios: `/api/radarr-cover/../api/v3/system/status` →
  `https://radarr:7878/api/v3/system/status?apikey=...` — ou seja, o atacante chama **qualquer
  endpoint** do Radarr/Sonarr autenticado, sem logar. Combinado com `SEC-03` (sem auth), é:
  leitura de biblioteca, downloads, **exclusão de mídia** e leitura de configuração (que pode conter
  outros segredos). E o `hasQuery` (`:359`) permite **injetar query** (`?x=1`) no serviço alvo.
- **Mudança:** (1) **allowlist de prefixo**: `coverPath` deve começar com `/MediaCover/` (Radarr) ou
  `/MediaCover/` do Sonarr — recusar `400` se não; (2) **rejeitar `..` e `//`** explicitamente;
  (3) não deixar o cliente controlar query (`hasQuery` deve ser do proxy, não do input);
  (4) construir a URL com `new URL(coverPath, baseUrl)` e conferir que o `pathname` normalizado ainda
  está dentro do prefixo permitido; (5) exigir auth (`SEC-03`).
- **Aceite:** `../api/v3/system/status` → `400`; só caminhos de capa passam.
- **Verificação:**
  ```bash
  curl -s -o /dev/null -w '%{http_code}\n' "http://localhost:PORTA/api/radarr-cover/../api/v3/system/status"
  # esperado 400 (hoje: 200 com dados do Radarr)
  curl -s -o /dev/null -w '%{http_code}\n' "http://localhost:PORTA/api/radarr-cover/MediaCover/1/poster.jpg"  # 200
  ```

### SEC-03 · 7 de 8 rotas sem autenticação · [P1]

- **Arquivo:** `backend/src/index.ts:215,262,289,351,356,435,503` vs `:267`
- **Evidência:** das 8 rotas, **só** `/api/conversion/:mediaId` (linha 267) tem `authenticateToken`.
  Públicas: `tmdb-image`, `health`, `omdb-image`, `docs.json`, `radarr-cover`, `sonarr-cover`,
  `covers`.
- **Impacto:** (a) as rotas de **proxy** permitem o ataque do `SEC-02` sem credencial; (b) `/health`
  público é **aceitável** (boas práticas), mas `/api/docs.json` expõe o schema; (c) a regra de
  negócio (biblioteca, conversão) já exige auth — é inconsistente deixar o proxy aberto.
- **Mudança:** (1) aplicar `authenticateToken` em **todas** as rotas `/api/*` exceto `/health`;
  (2) se o frontend chama proxy sem token, migrar o front para enviar token (o `authenticateToken`
  aceita `?token=` — ver nota); (3) deixar `/health` público.
- **Aceite:** `/api/radarr-cover/...` sem token → `401`; `/health` → `200`.
- **Verificação:**
  ```bash
  curl -s -o /dev/null -w '%{http_code}\n' http://localhost:PORTA/api/radarr-cover/x   # 401
  curl -s -o /dev/null -w '%{http_code}\n' http://localhost:PORTA/health                # 200
  ```

### SEC-04 · CORS `*` no proxy de imagem · [P1]

- **Arquivo:** `backend/src/index.ts:193` (`'Access-Control-Allow-Origin': '*'`) e nas rotas de capa
- **Evidência:** verificado na auditoria inicial: `index.ts:193,317`, `routes/covers.ts`,
  `routes/stream.ts` — literal `*`.
- **Impacto:** qualquer origem consome capa/stream. Combinado com `SEC-03`, um site malicioso com
  token rouba conteúdo. Mesmo sem token, é hotlink irrestrito (custo de banda do TMDB/OMDb).
- **Mudança:** allowlist por env (`FRONTEND_URL`, que já existe no `.env.example` do media-server).
- **Aceite:** origem fora da allowlist não recebe o header.
- **Verificação:**
  ```bash
  curl -sI http://localhost:PORTA/api/tmdb-image/x -H 'Origin: https://evil.example' \
    | grep -i 'access-control-allow-origin'   # ausente
  ```

### SEC-05 · `GET /api/docs.json` público · [P2]

- **Arquivo:** `backend/src/index.ts:351`
- **Evidência:** rota pública devolvendo o schema OpenAPI do serviço.
- **Impacto:** permite a um atacante **mapear** as rotas (incluindo `/api/conversion`) sem esforço.
  Baixo isoladamente (o OpenAPI é frequentemente público), mas desnecessário sem auth.
- **Mudança:** exigir token (mesmo middleware das outras) ou manter público **apenas** em dev.
- **Aceite:** `/api/docs.json` sem token → `401` (ou restrito por env).
- **Verificação:**
  ```bash
  curl -s -o /dev/null -w '%{http_code}\n' http://localhost:PORTA/api/docs.json
  ```

### SEC-06 · Extensão de imagem vem do cliente · [P2]

- **Arquivo:** `backend/src/index.ts:185-189` (`contentTypeFor`)
- **Evidência:** `const ext = (imagePath.match(/\.([^.]+)$/)?.[1] || 'jpg')` — `imagePath` vem do
  cliente; o mapa de tipos inclui `svg: 'image/svg+xml'`.
- **Impacto:** o cliente pode pedir `/api/tmdb-image/x.svg` e receber `Content-Type: image/svg+xml`.
  Se o corpo vier de uma fonte que **não** seja imagem (ex.: resposta de erro do TMDB com HTML/XML),
  isso pode ser interpretado como SVG executável — risco de XSS quando a URL é aberta diretamente.
  Hoje o corpo vem do cache/TMDB, então é limitado, mas é a estrutura errada.
- **Mudança:** (1) **conferir os magic bytes** do corpo antes de servir (JPEG `FFD8`, PNG `89504E47`,
  etc.) e **recusar** se não casar; (2) servir sempre `application/octet-stream` **ou** o tipo
  derivado do magic byte, nunca do path; (3) adicionar `X-Content-Type-Options: nosniff`.
- **Aceite:** `.svg` com corpo não-imagem → `400`/`nosniff`.
- **Verificação:**
  ```bash
  curl -sI http://localhost:PORTA/api/tmdb-image/x.svg | grep -i x-content-type-options
  ```

---

## 4. Bugs e defeitos funcionais

### BUG-01 · `error.message` exposto no proxy · [P2]

- **Arquivo:** `backend/src/index.ts:250` (`catch (err: any)` → `res.status(502).json({ error: 'Failed to proxy image' })`)
- **Evidência:** o `TMDBImage` **não** vaza (mensagem genérica — bom), mas o `OMDBImage` e outros
  podem expor `err.message` (confirmar por `grep`). O `logger.error` vaza para log.
- **Impacto:** `err.message` de axios pode conter a URL completa (com query da Flashman/Radarr) —
  mesma classe do `SEC-01`. Se exposto ao cliente, revela o `baseUrl` interno.
- **Mudança:** mensagem genérica ao cliente (o `TMDBImage` já faz — estender aos demais); detalhe
  vai para o log **já sanizado** (ver `SEC-01`).
- **Aceite:** resposta 502 não contém `baseUrl` nem `apiKey`.
- **Verificação:**
  ```bash
  curl -s -X GET 'http://localhost:PORTA/api/omdb-image/x' | grep -qiE 'http|key' && echo FALHA || echo OK
  ```

### BUG-02 · Cache de imagem sem limite · [P2]

- **Arquivo:** `backend/src/index.ts:240-243` (`fs.writeFileSync(cacheFile, ...)`)
- **Evidência:** grava em disco a cada miss, **sem** verificação de espaço nem TTL/limpeza.
- **Impacto:** disco cheio ao longo do tempo (TMDB tem milhões de imagens possíveis); quando o disco
  cai, o `writeFileSync` lança e o serviço pode degradar (o código trata e serve cache, mas o disco
  está cheio).
- **Mudança:** (1) teto de tamanho do diretório de cache (ex.: 5 GB) com limpeza LRU/FIFO;
  (2) checar `fs.statfsSync` antes de gravar; (3) alerta quando chegar perto do limite.
- **Aceite:** cache estabiliza no limite; disco nunca enche.
- **Verificação:**
  ```bash
  du -sh <TMDB_IMAGE_CACHE_DIR>   # estabiliza
  ```

### BUG-03 · Sem `try/finally` no `execFile` de cache · [P3]

- **Arquivo:** `backend/src/index.ts:204`
- **Evidência:** `execFile(...)` com `timeout` e `maxBuffer` — mas o callback de erro é tratado,
  e não há garantia de que o processo filho morre se o pai cair.
- **Impacto:** processo filho órfão (raro; o `timeout` ajuda).
- **Mudança:** (1) matar o filho em caso de abort/shutdown do pai (`child.kill('SIGTERM')`);
  (2) ouvir `SIGTERM` no servidor e encerrar os filhos; (3) **manter** o `execFile` em vez do `fetch`
  nativo — o comentário em `:197-200` documenta que o TLS do BunyanCDN falha no processo principal
  e funciona num filho novo; essa é uma decisão consciente, não um esquecimento.
- **Aceite:** ao parar o serviço, não fica processo `tmdb-fetch` órfão.
- **Verificação:**
  ```bash
  pkill -f tmdb-fetch; node dist/index.js & sleep 2; kill %1; sleep 1
  pgrep -f tmdb-fetch && echo 'FALHA: orfao' || echo 'OK: sem orfao'
  ```

---

## 5. Qualidade: testes e observabilidade

### IMP-01 · Rate limit nas rotas de proxy · [P1]

- **Arquivo:** `backend/src/index.ts` (rotas de capa/imagem)
- **Evidência:** nenhum rate limit nas 7 rotas públicas (há só o de login, `middleware/auth.ts:15`).
- **Impacto:** cada chamada dispara **fetch externo** (TMDB/OMDb/Radarr) — um laço satura a cota
e a banda. Como não há auth, é DoS trivial.
- **Mudança:** `express-rate-limit` (ex.: 60/min por IP) **por rota**, mais frouxo para proxy externo.
- **Aceite:** 61ª chamada na hora → `429`.
- **Verificação:**
  ```bash
  for i in $(seq 1 70); do curl -s -o /dev/null -w "%{http_code} " http://localhost:PORTA/api/health; done; echo
  ```

### IMP-02 · Healthcheck sem estado do upstream · [P2]

- **Arquivo:** `backend/src/index.ts:262`
- **Evidência:** `/health` provavelmente devolve `ok` fixo (padrão do acervo).
- **Impacto:** orquestrador não sabe que TMDB/Radarr está fora — o serviço "está no ar" mas sem
  funcionalidade de capa.
- **Mudança:** `/health` verificando upstream com timeout curto e devolvendo `degraded`/`503`.
- **Aceite:** com Radarr fora, `/health` reporta `degraded`.
- **Verificação:** parar o Radarr → `curl /health` muda de estado.

### TEST-01 · Zero testes · [P1]

- **Arquivo:** *(ausente)*
- **Evidência:** nenhum `*.test.ts`; sem script `test` no backend.
- **Impacto:** os 2 P0 (`SEC-01` log, `SEC-02` proxy) não têm como ser detectados. O `SEC-02` é
  exatamente um caso de teste barato (mock do axios + path malicioso).
- **Mudança:** (1) `radarr-cover` com `../api/v3/system/status` → `400` (`SEC-02`);
  (2) assert de que o log **não** contém `apikey` (checar o logger mockado) (`SEC-01`);
  (3) rota sem token → `401` (`SEC-03`); (4) extensão incompatível com magic bytes → `400`.
- **Aceite:** `npm test` roda e passa; falha se o `SEC-02` voltar.
- **Verificação:**
  ```bash
  npm test 2>&1 | tail -3
  ```

---

## 6. DevOps / Infra

### DEVOPS-01 · Sem CI · [P2]

- **Arquivo:** *(ausente)* `.github/workflows/`
- **Evidência:** sem workflow.
- **Impacto:** nada trava a remoção do auth (`SEC-03`) nem a regressão do `SEC-02`.
- **Mudança:** `ci.yml`: `npm ci`, `npm test`, `npm run build` (TS), e barreira `grep` que falhe se
  `target,` voltar a entrar no logger.
- **Aceite:** PR com `apikey` em log ou sem auth é bloqueado.
- **Verificação:**
  ```bash
  grep -n "logger.info('RadarrCover'" -A3 backend/src/index.ts | grep -c target   # 0
  ```

### DEVOPS-02 · Sem `.env.example` (chaves de Radarr/Sonarr) · [P1]

- **Arquivo:** *(ausente)* `.env.example` · variáveis em `index.ts:438` (`SONARR_API_KEY`) e config do Radarr
- **Evidência:** `index.ts:438` usa `process.env.SONARR_API_KEY` e o Radarr vem de
  `RadarrService.getRadarrConfig()`. Verifiquei: **não existe `.env` nem `.env.example`** neste repo
  (nem no índice do git) — a configuração vive só no ambiente de execução.
- **Impacto:** quem implanta não sabe quais chaves definir; e o `SEC-01` (não logar) precisa de
  clareza sobre o que é segredo.
- **Mudança:** `.env.example` com `JWT_SECRET`, `TMDB_API_KEY` (se usar), `RADARR_URL`,
  `RADARR_API_KEY`, `SONARR_URL`, `SONARR_API_KEY`, `OMDB_API_KEY` — todas sem valor.
- **Aceite:** exemplo versionado cobre todas as `process.env.*`.
- **Verificação:** `grep -rhoE 'process\.env\.[A-Z_]+' backend/src/ | sort -u` vs o exemplo.

---

## 7. Documentação

### DOC-01 · README não documenta que é proxy com chave · [P1]

- **Arquivo:** `README.md`
- **Evidência:** o README descreve o media-server, mas não declara que ele **usa chaves de API de
  serviços internos** nem que certas rotas constroem URL com essas chaves.
- **Impacto:** quem implanta não sabe que precisa proteger as rotas de proxy (`SEC-02`/`SEC-03`) nem
  que a chave vai para o log (`SEC-01`).
- **Mudança:** seção "Segurança": (1) o serviço é **proxy autenticado** para Radarr/Sonarr/TMDB;
  (2) quais rotas exigem token; (3) que a chave **nunca** aparece em log (pós-`SEC-01`);
  (4) variáveis obrigatórias (linkando `DEVOPS-02`).
- **Aceite:** README declara que é proxy e o que é segredo.
- **Verificação:** `grep -ni 'proxy\|api.key\|radarr' README.md`.

### DOC-02 · Falta `SECURITY.md` · [P3]

- **Arquivo:** *(ausente)* `SECURITY.md`
- **Evidência:** tem README/LICENSE.
- **Impacto:** as invariantes (não logar URL com segredo; prefixo de path validado; toda rota `/api` autenticada) não ficam registradas.
- **Mudança:** criar com canal + as 3 invariantes + ameaça "proxy autenticado a serviço interno".
- **Aceite:** arquivo existe com as 3 invariantes.
- **Verificação:** `ls SECURITY.md`

---

## 8. Ordem de execução (waves)

### Wave 1 — Parar vazamento de chave e proxy arbitrário (P0)
1. **`SEC-01`** — tirar a URL com `apikey` do logger; **rotacionar** as chaves (já foram logadas).
2. **`SEC-02`** — `allowlist` de prefixo + rejeitar `../` + montar URL com `new URL`.
3. **`TEST-01`** — testes (travam o `SEC-02`; incluem o caso de log sem `apikey`).

> Depois da Wave 1, a chave não é logada e o proxy só serve capa.

### Wave 2 — Fechar a superfície (P1)
4. **`SEC-03`** — `authenticateToken` em todas as rotas `/api/*` (exceto `/health`).
5. **`SEC-04`** — CORS com allowlist.
6. **`DEVOPS-02`** — `.env.example` (para as chaves serem definidas antes do log).
7. **`IMP-01`** — rate limit nas rotas de proxy.
8. **`DOC-01`** — README (antes de fechar, para quem usa saber).

### Wave 3 — Robustez (P2)
9. **`SEC-05`** — `docs.json` com auth; **`SEC-06`** — magic bytes + `nosniff`.
10. **`BUG-01`** — resposta genérica; **`BUG-02`** — teto do cache; **`IMP-02`** — health real.
11. **`DEVOPS-01`** — CI com barreira.

### Wave 4 — Polimento (P3)
12. **`BUG-03`**, **`DOC-02`**.

**Dependências que não podem ser invertidas:**
`SEC-01` **antes** de qualquer log novo (a chave já foi logada — rotacionar junto) ·
`SEC-02` antes de `SEC-03` (validar o path antes de exigir token, para o 400 ser primeiro) ·
`DEVOPS-02` antes de `SEC-03` (o env define a origem/token) · `TEST-01` depois de `SEC-01`/`SEC-02`.

---

## 9. Fora de escopo / riscos

| Item | Decisão | Motivo |
|---|---|---|
| Remover os proxies de capa | **Não** | É a funcionalidade. O risco é contornado por prefixo + auth (`SEC-02`/`SEC-03`). |
| Colocar o media-server atrás de VPN só | **Não** | Mantenha o serviço usável, com auth. |
| Trocar `axios`/`fetch` por cache interno | **Não** | O cache de imagem já é bom (`sha1`); só falta teto (`BUG-02`). |
| Migrar backend de Express para Fastify | **Não** | Sem ganho de segurança. |
| `sendBeacon`/proxy de streaming | **Não** | Fora do escopo. |

**Riscos desta execução:**

- **`SEC-01` (rotacionar a chave)** é **manual** — a IA só remove do log; **só você** rotaciona no
  Radarr/Sonarr. Sem isso, a chave continua válida onde já foi exposta.
- **`SEC-03` (auth no proxy) pode quebrar o front** que chama capa sem token. Migre front+back na
  mesma mudança, ou use o `?token=` que o `authenticateToken` já aceita (menor atrito, documentar).
- **`SEC-02` (allowlist de prefixo) pode rejeitar formato legítimo** do Radarr/Sonarr
  (ex.: `MediaCover` vs `poster`). Confira com dados reais antes.
- **`SEC-06` (magic bytes) pode recusar imagem legítima** se o formato não estiver na lista. Cole
  os formatos que o cliente usa.

---

## 10. Definição de pronto (DoD)

**Segurança**
- [x] `SEC-01` — o código não registra URLs/chaves; rotacionar as chaves antigas ainda está pendente
- [x] `SEC-02` — paths de capa exigem prefixo permitido e rejeitam travessia/query; validação operacional pendente
- [x] `SEC-03` — proxies, fallback de poster e docs JSON exigem token; frontend envia token nos URLs de imagem
- [x] `SEC-04` — CORS usa allowlist de origens
- [x] `SEC-05` — `docs.json` exige token
- [x] `SEC-06` — imagens raster são validadas por magic bytes e servidas com `nosniff`
- [x] `SEC-10` — defaults inseguros removidos e credenciais mascaradas nas respostas administrativas

**Funcional**
- [x] `BUG-01` — erros de proxy não devolvem URL, chave ou mensagem bruta
- [x] `BUG-02` — cache usa limite, TTL e reserva mínima de espaço
- [x] `BUG-03` — shutdown sinaliza processos de fetch ativos

**Qualidade e infra**
- [x] `IMP-01` — rate limit de 60 chamadas/minuto independente por endpoint de proxy
- [x] `IMP-02` — `/health` informa banco, Radarr e Sonarr; runtime ainda não verificado
- [ ] `TEST-01` — pendente; nenhum teste foi adicionado ou executado
- [ ] `DEVOPS-01` — bloqueado pela ausência de manifestos de dependências/build neste snapshot
- [x] `DEVOPS-02` — `.env.example` lista as variáveis e deixa segredos vazios

**Documentação**
- [x] `DOC-01` — README documenta o proxy, auth e configuração
- [x] `DOC-02` — `SECURITY.md` registra as invariantes

**Validação final:**
```bash
npm test 2>&1 | tail -3
grep -rn 'apikey=' logs/ && echo FALHA || echo OK
curl -s -o /dev/null -w '%{http_code}\n' 'http://localhost:PORTA/api/radarr-cover/../api/v3/system/status'   # 400
```

---

*Fim do plano. Gerado por leitura direta do código em 2026-10-02. Nenhum item já estava corrigido.*
