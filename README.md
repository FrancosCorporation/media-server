# Media Server

## ℹ️ Sobre este repositório

Configurações de media server (Jellyfin/Plex etc.).

Servidor de mídia self-hosted com catálogo de filmes e séries, streaming,
downloads via torrent, integração com *arrs (Radarr/Sonarr/Prowlarr/Jackett) e
player web.

![TypeScript](https://img.shields.io/badge/TypeScript-3178C6?style=flat-square&logo=typescript&logoColor=white)
![Node.js](https://img.shields.io/badge/Node.js-339933?style=flat-square&logo=nodedotjs&logoColor=white)
![React](https://img.shields.io/badge/React-61DAFB?style=flat-square&logo=react&logoColor=black)
![MongoDB](https://img.shields.io/badge/MongoDB-47A248?style=flat-square&logo=mongodb&logoColor=white)
![Docker](https://img.shields.io/badge/Docker-ready-2496ED?style=flat-square&logo=docker&logoColor=white)
![License](https://img.shields.io/badge/license-MIT-green?style=flat-square)
![Status](https://img.shields.io/badge/status-em%20produ%C3%A7%C3%A3o%20(privado)-green?style=flat-square)

## Sobre

Back-end e front-end de um servidor de mídia pessoal no estilo Netflix:
busca e indexação de títulos, gerenciamento de downloads por torrent,
pós-processamento automático de arquivos, catálogo com metadados e capas, e
streaming com acompanhamento de progresso ("continuar assistindo").

> Este snapshot contém apenas o **código-fonte** (`backend/src` e
> `frontend/src`). Os arquivos de build (`package.json`, `tsconfig.json`,
> `.env`) vivem no ambiente de produção e não foram versionados aqui — para
> rodar, reconstrua os manifestos a partir dos imports ou copie do ambiente
> original.

## Funcionalidades

Back-end (Express + TypeScript):

- **Catálogo**: models de `Movie`, `Series`, `CachedCover`, `WatchProgress` e
  `History`, com rotas de filmes, séries, biblioteca e recomendações.
- **Busca e metadados**: rotas `search`, `trending`, `translate`, `poster`,
  `covers`, além de serviços `TMDBService`, `OMDBService`, `MetadataService`,
  `TrendingScraperService` e `RecommendationService`.
- **Downloads por torrent**: `QBittorrentService`, `ApacheTorrentService`,
  `JackettService`, `ProwlarrService`, `RadarrService`, `SonarrService`,
  `AutoPipelineService`, `TorrentValidationService` e agregadores nacionais
  (`BRTorrentAggregator`, `RedeCanaisService`, `BeTorService`,
  `HDRTorrentService`).
- **Streaming**: rotas `stream` e `downloads`, `StreamingService`,
  `DLNAService`, `AirPlayService`, `JellyfinService`, `DlnaAllowlist`.
- **Pós-processamento**: `MediaScannerService`,
  `MediaPostProcessorService`, `ConversionQueueService`, `CoverCacheService`,
  `MaintenanceService`, `PendingRetryService`.
- **Segurança**: JWT (`routes/auth`, middleware `auth`), tentativas de login
  (`LoginAttempt`), papéis de admin/usuário e 2FA de dispositivo
  (`routes/devices`).
- **Infra**: WebSocket nativo (`ws`), Swagger, seed de admin, bypass de
  Cloudflare e proxy de torrent.

Front-end (React + Redux):

- Páginas de busca, biblioteca, player/watch, downloads, configurações,
  usuários e painel administrativo (`src/pages/media`, `src/pages/AdminLeads`
  etc.).
- Sessão de mídia, toasts, i18n, tema e componentes próprios
  (`src/components`, `src/hooks`, `src/i18n`, `src/redux/slices`).

## Stack

- **Back-end**: Node.js, Express, TypeScript, Mongoose/MongoDB, WebSocket
  (`ws`), JWT, Swagger, `child_process` para pós-processamento.
- **Front-end**: React, Redux Toolkit, React Router, TypeScript, i18n.
- **Integrações**: qBittorrent, Jackett, Prowlarr, Radarr, Sonarr, Jellyfin,
  DLNA, AirPlay, TMDB, OMDB.
- **Infra de referência**: Docker + Caddy no ambiente de produção.

## Estrutura do projeto

```
backend/src/
├── config/       # banco, seed, swagger
├── middleware/   # auth, tratamento de erros
├── models/       # documentos mongoose
├── routes/       # endpoints REST + WebSocket
└── services/     # integrações (*arr, torrent, streaming, mídia)

frontend/src/
├── components/   # UI (dashboard, mídia, ferramentas)
├── contexts/ hooks/ i18n/ lib/
├── pages/        # telas (media/, admin)
├── redux/        # store e slices
└── services/     # clientes HTTP/websocket
```

## Licença

MIT — veja [LICENSE](LICENSE).
