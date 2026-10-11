# Checkpoint antes do reinício

**Data:** 11/10/2026

**Status:** pausa solicitada pelo usuário; a auditoria de todos os projetos continua incompleta.

## Retomada

Após o reinício, retomar o objetivo original: percorrer as pastas de projetos em `/home/servidor/Git`, ler as diretrizes de cada projeto, implementar as melhorias aplicáveis e salvar/pushar cada projeto quando o remoto permitir. Consultar também o plano mestre em `/home/servidor/Git/PLANO_MELHORIAS_MASTER.md` e o plano de execução em `/home/servidor/Git/.planning/2026-10-11-auditoria-e-melhorias-dos-projetos-em-gi/`.

Continuar pelo `media-server`: revisar as pendências no `MELHORIAS.md` e no plano mestre. O trabalho desta pausa foi commitado em `46605e4` (`security: protect media routes and configured credentials`) e enviado para `origin/main`. O checkpoint anterior `c25eba9` também está no histórico.

## Checkpoints salvos

- `game_farma`: `43b18bb` enviado para `origin/Version-1.0`.
- `media-server`: `46605e4` enviado para `origin/main`.
- `site_corp`: checkpoint `98d2d01e` enviado para `origin/games-1.10.0`.
- `youtube_ai/youtube-automation-agent`: `da692fd` commitado localmente. O push para `origin/master` foi recusado com HTTP 403; o remoto é `darkzOGx/youtube-automation-agent`, sem permissão para a credencial atual. Há três commits locais à frente do remoto.
- `reference/ai-site-cloner`: `cd6eb34` commitado localmente. O push foi recusado com HTTP 403 pelo remoto `Mahanaicoach/ai-site-cloner`.
- `base_fundation`: checkpoint local `e5750e6`; o push continua bloqueado porque um commit ancestral adiciona `.github/workflows/ci.yml` e a credencial GitHub não tem o escopo OAuth `workflow`.

## Atualização após o login no GitHub

Os repositórios originais do YouTube e do `ai-site-cloner` já eram públicos. O HTTP 403 ocorreu porque a conta `FrancosCorporation` tinha apenas permissão de leitura nesses projetos; tornar o repositório público não concede permissão de escrita. Para publicar os commits sem alterar os originais, foram criados forks públicos na organização `FrancosCorporation` e os commits foram enviados:

- `youtube-automation-agent`: fork `FrancosCorporation/youtube-automation-agent`, branch `master`, atualizado até `767cb01` (`feat: add expressive video production pipeline`). O commit local foi rebaseado sobre a atualização `e26792a` do upstream e enviado sem force-push.
- `ai-site-cloner`: fork `FrancosCorporation/ai-site-cloner`, branch `main`, atualizado até `cd6eb34` (`chore: sync lockfile package metadata`).

Os remotes originais continuam configurados como `origin`; os forks estão configurados como `fork`. O login no navegador não muda as permissões dos repositórios originais. A auditoria geral continua em andamento e deve prosseguir pela fila do plano mestre.

## Arquivos locais preservados fora dos commits

- `youtube_ai/youtube-automation-agent/data/browser-profiles/` contém perfil Chromium autenticado (cerca de 3,4 GB); `data/state/` e `data/kwai-app.flag` são estado operacional local. Foram adicionados ao `.gitignore`, sem apagar nada.
- Em `youtube_ai/youtube-automation-agent`, permanecem sem commit dois scripts temporários (`scripts/hide-tu33-tmp.js`, `scripts/list-uploads-tmp.js`) e o arquivo vazio `package.json.d`.
- `site_corp`: configuração `.env.example` com credencial de banco, `.staging/` e dados/saídas de treinamento (cerca de 7,8 GB) ficaram fora do commit.
- `base_fundation`: saídas e backups locais JSONL de benchmark ficaram fora do commit.
- `code_server`: `.planning/.active_plan` e um `.pyc` gerado não foram commitados.
- `site_corp/fish-audio/src` e `src-v151`: há alterações locais em dois checkouts do projeto upstream `fishaudio/fish-speech`; não foram commitadas nem enviadas ao upstream.

## Revisão desta pausa

- `media-server` recebeu autenticação nos proxies de imagem, suporte do frontend ao token em imagens, remoção de credenciais padrão, mascaramento de segredos nas configurações, logs de upstream/qBittorrent sem URLs e credenciais, configuração segura de primeiro admin e documentação de segurança.
- `youtube-automation-agent` teve o trabalho de pipeline/mascote/documentação já presente no worktree salvo no commit `da692fd`; o perfil autenticado e arquivos de estado foram excluídos.
- `git diff --check` foi executado nos projetos alterados. Nenhum teste foi executado nesta pausa.
- O objetivo geral não foi concluído: retomar a fila após o reinício e atualizar este arquivo e o plano persistente conforme avançar.
