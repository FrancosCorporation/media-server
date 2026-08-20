// # leia o arquivo @PROJECT_CONTEXT.md , se já leu desconsidere
// Leia /home/servidor/Git/site_corp/PROJECT_CONTEXT.md antes de modificar este arquivo
import { MIN_SPAM_SIZE_BYTES } from './constants';

/**
 * Mapeamento de estados do qBittorrent para labels amigáveis.
 * Usado tanto pela rota GET /api/downloads quanto pelo broadcast do WebSocket.
 */
export const STATE_LABELS: Record<string, string> = {
  stalledDL: 'Aguardando fontes',
  stalledUP: 'Finalizado (seed)',
  metaDL: 'Baixando metadados',
  forcedMetaDL: 'Baixando metadados',
  downloading: 'Baixando',
  forcedDL: 'Baixando',
  uploading: 'Enviando',
  forcedUP: 'Enviando',
  queuedDL: 'Na fila',
  queuedUP: 'Na fila (seed)',
  pausedDL: 'Pausado',
  pausedUP: 'Pausado (seed)',
  checkingDL: 'Verificando',
  checkingUP: 'Verificando',
  checkingResumeData: 'Verificando',
  moving: 'Movendo',
  allocating: 'Alocando espaço',
  missing: 'Download perdido — reenvie',
  missingFiles: 'Arquivos faltando',
  error: 'Erro',
  unknown: 'Desconhecido',
  // Estado sintético criado por nós quando o torrent fica sem fontes por muito tempo
  noSeeds: 'Erro - Sem Fontes (Seeds)',
};

/**
 * Tempo máximo (ms) que um torrent pode ficar em "Aguardando fontes"
 * (stalled/queued/metaDL com 0 seeds, 0 peers e 0 bytes/s) antes de ser
 * marcado como erro amigável. 30 minutos.
 */
export const STALL_TIMEOUT_MS = 30 * 60 * 1000;

const STALLED_STATES = ['stalledDL', 'queuedDL', 'queued', 'metaDL', 'forcedMetaDL'];

/** Torrent preso aguardando fontes: estado de espera + sem seeds + sem velocidade + 0% */
export function isStalledNoSeeds(t: any): boolean {
  return (
    STALLED_STATES.includes(t?.state) &&
    (t?.seeds || 0) === 0 &&
    (t?.speed || 0) === 0 &&
    (t?.progress || 0) === 0
  );
}

/**
 * Aplica o status derivado do torrent ao documento de download:
 * atualiza progresso/velocidade/seeds, detecta stall sem fontes (timeout)
 * e devolve o estado amigável para exibição.
 *
 * @returns { torrentState, torrentStateLabel, timedOut }
 *   timedOut = true quando o torrent ultrapassou STALL_TIMEOUT_MS sem fontes
 *   (nesse caso torrentState = 'noSeeds' e o status vira 'error').
 */
export function applyTorrentStatus(dl: any, t: any): { torrentState: string; torrentStateLabel: string; timedOut: boolean } {
  dl.progress = t.progress;
  dl.speed = t.speed;
  dl.eta = t.eta;
  dl.seeds = t.seeds;
  dl.peers = t.peers;
  if (!dl.hash && t.hash) dl.hash = t.hash;

  const completedStates = ['uploading', 'stalledUP', 'pausedUP'];
  const queuedStates = ['queuedDL', 'queued', 'pausedDL'];
  const errorStates = ['error', 'missingFiles', 'unknown'];

  // ── Detecção de stall sem fontes (timeout) ──────────────────────────────
  let timedOut = false;
  if (isStalledNoSeeds(t)) {
    if (!dl.stalledSince) {
      dl.stalledSince = new Date();
    } else if (Date.now() - new Date(dl.stalledSince).getTime() > STALL_TIMEOUT_MS) {
      timedOut = true;
    }
  } else {
    // Torrent voltou a ter atividade — limpa o marcador de stall
    dl.stalledSince = undefined;
  }

  if (t.progress >= 100 || completedStates.includes(t.state)) {
    // Verificar tamanho mínimo (abaixo de 300MB provavelmente é propaganda/spam)
    dl.status = t.size && t.size < MIN_SPAM_SIZE_BYTES ? 'error' : 'complete';
  } else if (timedOut) {
    dl.status = 'error';
  } else if (errorStates.includes(t.state)) {
    dl.status = 'error';
  } else if (queuedStates.includes(t.state)) {
    dl.status = 'queued';
  } else {
    dl.status = 'downloading';
  }

  const torrentState = timedOut ? 'noSeeds' : t.state;
  const torrentStateLabel = timedOut
    ? STATE_LABELS.noSeeds
    : STATE_LABELS[t.state] || STATE_LABELS.unknown;

  return { torrentState, torrentStateLabel, timedOut };
}
