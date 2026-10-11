# Segurança

## Reportar uma vulnerabilidade

Não publique detalhes exploráveis em uma issue pública. Use o recurso de
reporte privado de vulnerabilidades do GitHub quando estiver habilitado; caso
contrário, contate os mantenedores por um canal privado antes da divulgação.

## Regras de segurança do serviço

- As rotas de proxy de imagem e capa exigem JWT válido. Os URLs de `<img>` e
  `video poster` carregam o JWT em `?token=`; não compartilhe esses URLs e
  configure o proxy reverso para não registrar query strings.
- Nunca registre URLs ou parâmetros que possam conter `apikey`, tokens,
  senhas ou credenciais. Registre somente códigos/status de erro e paths
  sanitizados.
- Os proxies Radarr/Sonarr só aceitam paths sob `/MediaCover/`, sem segmentos
  de travessia, query definida pelo cliente ou redirecionamento para outro host.
- Respostas de imagem são validadas por magic bytes, limitadas em tamanho e
  servidas com `X-Content-Type-Options: nosniff`.
- Configure segredos por ambiente ou pelo painel administrativo; não use
  credenciais padrão nem versione `.env`.
- CORS aceita somente as origens exatas configuradas em `FRONTEND_URLS` ou
  `FRONTEND_URL`.
