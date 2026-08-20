// # leia o arquivo @PROJECT_CONTEXT.md , se já leu desconsidere
// Leia /home/servidor/Git/site_corp/PROJECT_CONTEXT.md antes de modificar este arquivo
export const swaggerSpec = {
  openapi: '3.0.3',
  info: {
    title: 'DolfimFlix Media API',
    description: 'API de gerenciamento de mídia (filmes, séries, downloads, streaming) para o DolfimFlix.',
    version: '1.0.0',
    contact: {
      name: 'DolfimFlix Support',
    },
  },
  servers: [
    {
      url: 'https://francoscorporation.ddns.net',
      description: 'Produção',
    },
    {
      url: 'http://localhost:4000',
      description: 'Local',
    },
  ],
  components: {
    securitySchemes: {
      bearerAuth: {
        type: 'http',
        scheme: 'bearer',
        bearerFormat: 'JWT',
        description: 'Token JWT obtido via POST /api/auth/login',
      },
    },
    schemas: {
      Movie: {
        type: 'object',
        properties: {
          _id: { type: 'string', example: '6a769bbe914e4427cd752fd8' },
          title: { type: 'string', example: 'The Matrix' },
          year: { type: 'number', example: 1999 },
          status: { type: 'string', enum: ['pending', 'downloading', 'available', 'error'], example: 'available' },
          path: { type: 'string', example: 'The Matrix (1999)/The.Matrix.1999.1080p.BluRay.x264.mkv' },
          tmdbId: { type: 'number', example: 603 },
          poster: { type: 'string', example: 'https://image.tmdb.org/t/p/w500/f89U3ADr1oiB1s9GkdPOEpXUk5H.jpg' },
          rating: { type: 'number', example: 8.7 },
          addedAt: { type: 'string', format: 'date-time', example: '2026-08-10T12:00:00.000Z' },
        },
      },
      Series: {
        type: 'object',
        properties: {
          _id: { type: 'string', example: '6a769bbe914e4427cd752fd8' },
          title: { type: 'string', example: 'Breaking Bad' },
          year: { type: 'number', example: 2008 },
          status: { type: 'string', enum: ['pending', 'downloading', 'available', 'error'], example: 'available' },
          path: { type: 'string', example: 'Breaking Bad/Season 01/Breaking.Bad.S01E01.1080p.mkv' },
          tmdbId: { type: 'number', example: 1396 },
          poster: { type: 'string', example: 'https://image.tmdb.org/t/p/w500/ggFHVNu6YYI5LhH5Z6EYFoGx3v.jpg' },
          rating: { type: 'number', example: 9.5 },
          seasons: { type: 'number', example: 5 },
          addedAt: { type: 'string', format: 'date-time', example: '2026-08-10T12:00:00.000Z' },
        },
      },
      Download: {
        type: 'object',
        properties: {
          _id: { type: 'string', example: '9a1a94fcf33f8c45d82153ae7f9b84f4cc630116' },
          title: { type: 'string', example: 'Breaking.Bad.S01.1080p.BluRay.x264' },
          hash: { type: 'string', example: '9a1a94fcf33f8c45d82153ae7f9b84f4cc630116' },
          status: { type: 'string', enum: ['downloading', 'seeding', 'error', 'completed', 'paused'], example: 'downloading' },
          progress: { type: 'number', example: 75.5 },
          speed: { type: 'number', example: 1024000, description: 'Bytes por segundo' },
          size: { type: 'number', example: 4294967296, description: 'Tamanho total em bytes' },
          downloaded: { type: 'number', example: 3221225472, description: 'Bytes baixados' },
          seeds: { type: 'number', example: 15 },
          torrentState: { type: 'string', example: 'downloading' },
          torrentStateLabel: { type: 'string', example: 'Baixando' },
          mediaId: { type: 'string', nullable: true, example: '6a769bbe914e4427cd752fd8' },
          mediaType: { type: 'string', enum: ['movie', 'series'], nullable: true },
          addedAt: { type: 'string', format: 'date-time', example: '2026-08-10T12:00:00.000Z' },
        },
      },
      ErrorResponse: {
        type: 'object',
        properties: {
          error: { type: 'string', example: 'Token de autenticação necessário' },
        },
      },
    },
  },
  security: [{ bearerAuth: [] }],
  paths: {
    '/api/health': {
      get: {
        tags: ['System'],
        summary: 'Health check',
        security: [],
        responses: {
          '200': { description: 'API saudável' },
        },
      },
    },
    '/api/auth/register': {
      post: {
        tags: ['Auth'],
        summary: 'Registrar novo usuário',
        security: [],
        requestBody: {
          content: {
            'application/json': {
              schema: {
                type: 'object',
                required: ['email', 'password'],
                properties: {
                  email: { type: 'string', example: 'user@example.com' },
                  password: { type: 'string', example: 'senha123' },
                },
              },
            },
          },
        },
        responses: {
          '201': { description: 'Usuário criado' },
          '400': { description: 'Dados inválidos' },
        },
      },
    },
    '/api/auth/login': {
      post: {
        tags: ['Auth'],
        summary: 'Login e obtenção de token JWT',
        security: [],
        requestBody: {
          content: {
            'application/json': {
              schema: {
                type: 'object',
                required: ['email', 'password'],
                properties: {
                  email: { type: 'string', example: 'admin@dolfimflix.com' },
                  password: { type: 'string', example: 'admin123' },
                },
              },
            },
          },
        },
        responses: {
          '200': {
            description: 'Login success',
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  properties: {
                    token: { type: 'string' },
                    user: { type: 'object' },
                  },
                },
              },
            },
          },
          '401': { description: 'Credenciais inválidas' },
        },
      },
    },
    '/api/auth/me': {
      get: {
        tags: ['Auth'],
        summary: 'Obter dados do usuário logado',
        responses: {
          '200': { description: 'Dados do usuário' },
          '401': { description: 'Não autenticado' },
        },
      },
    },
    '/api/movies': {
      get: {
        tags: ['Movies'],
        summary: 'Listar todos os filmes',
        responses: {
          '200': {
            description: 'Lista de filmes',
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  properties: {
                    movies: { type: 'array', items: { $ref: '#/components/schemas/Movie' } },
                  },
                },
              },
            },
          },
        },
      },
      post: {
        tags: ['Movies'],
        summary: 'Adicionar novo filme',
        requestBody: {
          content: {
            'application/json': {
              schema: {
                type: 'object',
                required: ['tmdbId', 'title'],
                properties: {
                  tmdbId: { type: 'number', example: 603 },
                  title: { type: 'string', example: 'The Matrix' },
                },
              },
            },
          },
        },
        responses: {
          '201': { description: 'Filme adicionado' },
          '409': { description: 'Filme já existe' },
        },
      },
    },
    '/api/movies/{id}': {
      get: {
        tags: ['Movies'],
        summary: 'Buscar filme por ID',
        parameters: [
          { name: 'id', in: 'path', required: true, schema: { type: 'string' } },
        ],
        responses: {
          '200': { description: 'Detalhes do filme' },
          '404': { description: 'Filme não encontrado' },
        },
      },
      delete: {
        tags: ['Movies'],
        summary: 'Deletar filme (cascade: Radarr + downloads + MongoDB + Jellyfin)',
        parameters: [
          { name: 'id', in: 'path', required: true, schema: { type: 'string' } },
        ],
        responses: {
          '200': { description: 'Filme removido de todos os sistemas' },
          '404': { description: 'Filme não encontrado' },
        },
      },
    },
    '/api/movies/{id}/grab': {
      post: {
        tags: ['Movies'],
        summary: 'Grab manual de release para o filme',
        parameters: [
          { name: 'id', in: 'path', required: true, schema: { type: 'string' } },
        ],
        requestBody: {
          content: {
            'application/json': {
              schema: {
                type: 'object',
                properties: {
                  quality: { type: 'string', example: '1080p' },
                },
              },
            },
          },
        },
        responses: {
          '200': { description: 'Grab iniciado' },
        },
      },
    },
    '/api/movies/search': {
      get: {
        tags: ['Movies'],
        summary: 'Buscar filmes no Radarr/TMDB',
        parameters: [
          { name: 'q', in: 'query', required: true, schema: { type: 'string' } },
        ],
        responses: {
          '200': { description: 'Resultados da busca' },
        },
      },
    },
    '/api/series': {
      get: {
        tags: ['Series'],
        summary: 'Listar todas as séries',
        responses: {
          '200': {
            description: 'Lista de séries',
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  properties: {
                    series: { type: 'array', items: { $ref: '#/components/schemas/Series' } },
                  },
                },
              },
            },
          },
        },
      },
      post: {
        tags: ['Series'],
        summary: 'Adicionar nova série',
        requestBody: {
          content: {
            'application/json': {
              schema: {
                type: 'object',
                required: ['tmdbId', 'title'],
                properties: {
                  tmdbId: { type: 'number', example: 1396 },
                  title: { type: 'string', example: 'Breaking Bad' },
                },
              },
            },
          },
        },
        responses: {
          '201': { description: 'Série adicionada' },
          '409': { description: 'Série já existe' },
        },
      },
    },
    '/api/series/{id}': {
      get: {
        tags: ['Series'],
        summary: 'Buscar série por ID',
        parameters: [
          { name: 'id', in: 'path', required: true, schema: { type: 'string' } },
        ],
        responses: {
          '200': { description: 'Detalhes da série' },
          '404': { description: 'Série não encontrada' },
        },
      },
      delete: {
        tags: ['Series'],
        summary: 'Deletar série (cascade: Sonarr + downloads + MongoDB + Jellyfin)',
        parameters: [
          { name: 'id', in: 'path', required: true, schema: { type: 'string' } },
        ],
        responses: {
          '200': { description: 'Série removida de todos os sistemas' },
          '404': { description: 'Série não encontrada' },
        },
      },
    },
    '/api/series/{id}/seasons/{seasonNumber}/episodes': {
      get: {
        tags: ['Series'],
        summary: 'Listar episódios de uma temporada',
        parameters: [
          { name: 'id', in: 'path', required: true, schema: { type: 'string' } },
          { name: 'seasonNumber', in: 'path', required: true, schema: { type: 'number' } },
        ],
        responses: {
          '200': { description: 'Lista de episódios' },
        },
      },
    },
    '/api/series/search': {
      get: {
        tags: ['Series'],
        summary: 'Buscar séries no Sonarr/TMDB',
        parameters: [
          { name: 'q', in: 'query', required: true, schema: { type: 'string' } },
        ],
        responses: {
          '200': { description: 'Resultados da busca' },
        },
      },
    },
    '/api/series/{id}/gap-analysis': {
      get: {
        tags: ['Series'],
        summary: 'Analisar lacunas na série (episódios faltando)',
        parameters: [
          { name: 'id', in: 'path', required: true, schema: { type: 'string' } },
        ],
        responses: {
          '200': { description: 'Análise das lacunas' },
        },
      },
    },
    '/api/series/{id}/organize': {
      post: {
        tags: ['Series'],
        summary: 'Organizar arquivos de uma série na biblioteca',
        parameters: [
          { name: 'id', in: 'path', required: true, schema: { type: 'string' } },
        ],
        responses: {
          '200': { description: 'Organização concluída' },
        },
      },
    },
    '/api/series/pipeline/{id}': {
      post: {
        tags: ['Series'],
        summary: 'Iniciar pipeline de busca e download de episódios faltantes',
        parameters: [
          { name: 'id', in: 'path', required: true, schema: { type: 'string' } },
        ],
        responses: {
          '200': { description: 'Pipeline iniciado' },
        },
      },
    },
    '/api/downloads': {
      get: {
        tags: ['Downloads'],
        summary: 'Listar todos os downloads (sincronizado com qBittorrent)',
        responses: {
          '200': {
            description: 'Lista de downloads',
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  properties: {
                    downloads: { type: 'array', items: { $ref: '#/components/schemas/Download' } },
                  },
                },
              },
            },
          },
        },
      },
    },
    '/api/downloads/{id}': {
      delete: {
        tags: ['Downloads'],
        summary: 'Deletar download (remove do qBittorrent + MongoDB)',
        parameters: [
          { name: 'id', in: 'path', required: true, schema: { type: 'string' } },
        ],
        responses: {
          '200': { description: 'Download removido' },
          '404': { description: 'Download não encontrado' },
        },
      },
    },
    '/api/downloads/cleanup': {
      post: {
        tags: ['Downloads'],
        summary: 'Limpar torrents com missingFiles (qBittorrent + MongoDB)',
        responses: {
          '200': {
            description: 'Cleanup concluído',
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  properties: {
                    deleted: { type: 'number', example: 5 },
                  },
                },
              },
            },
          },
        },
      },
    },
    '/api/library': {
      get: {
        tags: ['Library'],
        summary: 'Listar biblioteca completa (movies + series)',
        responses: {
          '200': {
            description: 'Biblioteca completa',
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  properties: {
                    movies: { type: 'array', items: { $ref: '#/components/schemas/Movie' } },
                    series: { type: 'array', items: { $ref: '#/components/schemas/Series' } },
                  },
                },
              },
            },
          },
        },
      },
    },
    '/api/library/scan': {
      post: {
        tags: ['Library'],
        summary: 'Escanear biblioteca (scanLibrary)',
        responses: {
          '200': { description: 'Scan concluído' },
        },
      },
    },
    '/api/recommendations': {
      get: {
        tags: ['Recommendations'],
        summary: 'Obter recomendações (recentes, em alta, sugeridos)',
        responses: {
          '200': {
            description: 'Recomendações',
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  properties: {
                    recent: { type: 'array', items: { oneOf: [{ $ref: '#/components/schemas/Movie' }, { $ref: '#/components/schemas/Series' }] } },
                    highlights: { type: 'array', items: { oneOf: [{ $ref: '#/components/schemas/Movie' }, { $ref: '#/components/schemas/Series' }] } },
                    recommended: { type: 'array', items: { oneOf: [{ $ref: '#/components/schemas/Movie' }, { $ref: '#/components/schemas/Series' }] } },
                    stats: { type: 'object', properties: { movies: { type: 'number' }, series: { type: 'number' }, downloads: { type: 'number' } } },
                  },
                },
              },
            },
          },
        },
      },
    },
    '/api/search': {
      get: {
        tags: ['Search'],
        summary: 'Buscar na biblioteca (movies + series)',
        parameters: [
          { name: 'q', in: 'query', required: true, schema: { type: 'string' } },
        ],
        responses: {
          '200': { description: 'Resultados da busca' },
        },
      },
    },
    '/api/stream/{path}': {
      get: {
        tags: ['Stream'],
        summary: 'Streaming de vídeo (Range requests, HLS, transcode)',
        parameters: [
          { name: 'path', in: 'path', required: true, schema: { type: 'string' } },
          { name: 'quality', in: 'query', schema: { type: 'string', enum: ['720p', '1080p'], example: '1080p' } },
          { name: 'transcode', in: 'query', schema: { type: 'boolean', example: false } },
          { name: 'start', in: 'query', schema: { type: 'number', example: 0 } },
          { name: 'token', in: 'query', schema: { type: 'string' } },
        ],
        responses: {
          '200': { description: 'Stream de vídeo (video/mp2t ou video/mp4)' },
          '206': { description: 'Partial Content (seek)' },
          '401': { description: 'Token inválido' },
          '404': { description: 'Arquivo não encontrado' },
        },
      },
    },
    '/api/stream/frame': {
      get: {
        tags: ['Stream'],
        summary: 'Extrair frame do vídeo num timestamp (para hover preview)',
        parameters: [
          { name: 'path', in: 'query', required: true, schema: { type: 'string' } },
          { name: 'time', in: 'query', required: true, schema: { type: 'number', example: 30 } },
          { name: 'token', in: 'query', schema: { type: 'string' } },
        ],
        responses: {
          '200': { description: 'Frame JPEG', content: { 'image/jpeg': {} } },
          '404': { description: 'Arquivo não encontrado' },
        },
      },
    },
    '/api/poster/movie/{mediaId}': {
      get: {
        tags: ['Poster'],
        summary: 'Obter poster de um filme (fallback TMDB)',
        parameters: [
          { name: 'mediaId', in: 'path', required: true, schema: { type: 'string' } },
        ],
        responses: {
          '200': { description: 'Poster (imagem)' },
          '404': { description: 'Poster não encontrado' },
        },
      },
    },
    '/api/poster/series/{mediaId}': {
      get: {
        tags: ['Poster'],
        summary: 'Obter poster de uma série (fallback TMDB)',
        parameters: [
          { name: 'mediaId', in: 'path', required: true, schema: { type: 'string' } },
        ],
        responses: {
          '200': { description: 'Poster (imagem)' },
          '404': { description: 'Poster não encontrado' },
        },
      },
    },
    '/api/poster/search/{mediaType}/{title}': {
      get: {
        tags: ['Poster'],
        summary: 'Buscar poster por título (TMDB)',
        parameters: [
          { name: 'mediaType', in: 'path', required: true, schema: { type: 'string', enum: ['movie', 'series'] } },
          { name: 'title', in: 'path', required: true, schema: { type: 'string' } },
        ],
        responses: {
          '200': { description: 'Poster encontrado' },
          '404': { description: 'Poster não encontrado' },
        },
      },
    },
    '/api/qbittorrent/torrents': {
      get: {
        tags: ['QBittorrent'],
        summary: 'Listar torrents do qBittorrent',
        responses: {
          '200': { description: 'Lista de torrents' },
        },
      },
    },
    '/api/settings': {
      get: {
        tags: ['Settings'],
        summary: 'Obter configurações do sistema',
        responses: {
          '200': { description: 'Configurações' },
        },
      },
      put: {
        tags: ['Settings'],
        summary: 'Atualizar configurações do sistema',
        requestBody: {
          content: {
            'application/json': {
              schema: {
                type: 'object',
                properties: {
                  qbittorrentUrl: { type: 'string' },
                  qbittorrentUsername: { type: 'string' },
                  qbittorrentPassword: { type: 'string' },
                  jellyfinUrl: { type: 'string' },
                  jellyfinApiKey: { type: 'string' },
                  tmdbApiKey: { type: 'string' },
                },
              },
            },
          },
        },
        responses: {
          '200': { description: 'Configurações atualizadas' },
        },
      },
    },
    '/api/users': {
      get: {
        tags: ['Users'],
        summary: 'Listar usuários (admin)',
        responses: {
          '200': { description: 'Lista de usuários' },
        },
      },
    },
    '/api/devices': {
      get: {
        tags: ['Devices'],
        summary: 'Listar dispositivos DLNA/Chromecast descobertos',
        responses: {
          '200': { description: 'Lista de dispositivos' },
        },
      },
    },
    '/api/watch-progress': {
      get: {
        tags: ['Watch Progress'],
        summary: 'Listar progresso de assistidos',
        responses: {
          '200': { description: 'Lista de progressos' },
        },
      },
    },
  },
};
