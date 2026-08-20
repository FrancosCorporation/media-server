// # leia o arquivo @PROJECT_CONTEXT.md , se já leu desconsidere
// Leia /home/servidor/Git/site_corp/PROJECT_CONTEXT.md antes de modificar este arquivo
import fs from 'fs';
import path from 'path';
import { Movie } from '../models/Movie';
import { Series } from '../models/Series';
import { logger } from '../utils/logger';
import { MetadataService } from './MetadataService';
import { SPAM_DIR_KEYWORDS, isSpamFileName } from '../utils/constants';
import { organizeMediaFile } from '../utils/mediaOrganizer';
import { recordCompletenessScore } from '../utils/dedupe';

const COMPONENT = 'MediaScanner';

const VIDEO_EXTENSIONS = ['.mkv', '.mp4', '.avi', '.mov', '.wmv', '.webm', '.m4v', '.ts', '.rmvb', '.flv', '.hevc', '.mk3d'];
const MEDIA_ROOTS = ['/media/movies', '/media/series', '/downloads', '/media/transcode'];
const DOWNLOADS_ROOT = '/downloads';

function fileSizeBytes(filePath: string): number | undefined {
  try {
    return fs.statSync(filePath).size;
  } catch {
    return undefined;
  }
}

/** Retorna apenas os vídeos reais (filtra propaganda/spam por keyword + tamanho) */
function filterRealVideos(files: string[]): string[] {
  return files.filter((f) => {
    const spam = isSpamFileName(path.basename(f), fileSizeBytes(f));
    if (spam) {
      logger.warn(COMPONENT, `Skipping spam file: ${f}`);
      return false;
    }
    return true;
  });
}

interface ScannedMedia {
  title: string;
  year?: number;
  path: string;
  relativePath: string;
  extension: string;
}

function findVideoFiles(dir: string, depth = 0): string[] {
  if (depth > 5) return [];
  const results: string[] = [];
  try {
    const entries = fs.readdirSync(dir, { withFileTypes: true });
    for (const entry of entries) {
      const fullPath = path.join(dir, entry.name);
      if (entry.isFile() && VIDEO_EXTENSIONS.includes(path.extname(entry.name).toLowerCase())) {
        results.push(fullPath);
      } else if (entry.isDirectory()) {
        results.push(...findVideoFiles(fullPath, depth + 1));
      }
    }
  } catch { /* ignore permission errors */ }
  return results;
}

function extractTitleFromPath(filePath: string, root: string): { title: string; year?: number } {
  const relativePath = path.relative(root, filePath);
  const parts = relativePath.split(path.sep);
  const folderName = parts[0] || path.basename(filePath, path.extname(filePath));

  // Tenta extrair ano do nome da pasta (ex: "The Matrix 1999" → "The Matrix", 1999)
  const yearMatch = folderName.match(/.*?(\d{4})/);
  let title = folderName;
  let year: number | undefined;

  if (yearMatch) {
    year = parseInt(yearMatch[1], 10);
    title = folderName
      .replace(yearMatch[1], '')
      .replace(/[._-]+/g, ' ')
      .replace(/[()\[\]{}]+/g, '')
      .trim();
  } else {
    title = folderName.replace(/[._-]+/g, ' ').replace(/[()\[\]{}]+/g, '').trim();
  }

  // Remove qualidade/codec do título
  title = title.replace(/\s*(1080p|720p|480p|2160p|4K|BluRay|BDRip|WEBRip|WEB-DL|HDTV|x264|x265|HEVC|HDRip|DVDRip|AC3|DTS|AAC|FLAC|2CH|6CH|10bit|PSA|YTS|NTG|Group).*$/i, '').trim();

  return { title, year };
}

function getRelativePath(fullPath: string): string | null {
  for (const root of MEDIA_ROOTS) {
    if (fullPath.startsWith(root)) {
      const relative = path.relative(root, fullPath);
      return relative.replace(/\\/g, '/');
    }
  }
  return null;
}

export class MediaScannerService {
  private static scanInterval: NodeJS.Timeout | null = null;
  private static isScanning = false;

  private static countSeasons(seriesDir: string): number {
    try {
      const entries = fs.readdirSync(seriesDir, { withFileTypes: true });
      const seasonDirs = entries.filter(e =>
        e.isDirectory() && e.name.toLowerCase().startsWith('season')
      );
      return seasonDirs.length > 0 ? seasonDirs.length : 1;
    } catch {
      return 1;
    }
  }

  /**
   * Busca filme existente por TMDB ID (mais confiável) ou fuzzy match por título/ano.
   * Retorna o filme existente ou null.
   */
  private static async findExistingMovie(
    title: string,
    year: number | undefined,
    relativePath: string,
    tmdbId?: number
  ): Promise<any | null> {
    // 1) Se tem TMDB ID, busca direto
    if (tmdbId) {
      const byTmdb = await Movie.findOne({ tmdbId });
      if (byTmdb) return byTmdb;
    }

    // 2) Busca por path exato
    const byPath = await Movie.findOne({ path: relativePath });
    if (byPath) return byPath;

    // 3) Busca por título + ano (normalizado)
    if (year) {
      const byTitleYear = await Movie.findOne({ title, year });
      if (byTitleYear) return byTitleYear;
    }

    // 4) Fuzzy match: título normalizado (remove tokens de edição, pontuação)
    const cleanTitle = title.toLowerCase()
      .replace(/[._-]+/g, ' ')
      .replace(/\b(open\s+matte|imax|remux|extended|director.?s?\s+cut|theatrical|unrated|proper|repack|internal|bluray|webrip|web.dl|webdl|hdtv|dvdrip|bdrip|x264|x265|h264|h265|hevc|10bit|8bit|aac|ac3|dts|flac|mp3|dual|audio|dublado|dub|ptbr|portuguese|english|legendado|subtitle|subs)\b/gi, '')
      .replace(/[^a-z0-9\s]/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();

    if (cleanTitle.length >= 3) {
      const fuzzy = await Movie.findOne({
        title: { $regex: new RegExp(cleanTitle.replace(/\s+/g, '.*'), 'i') },
        ...(year ? { year } : {}),
      });
      if (fuzzy) return fuzzy;
    }

    return null;
  }

  /**
   * Busca série existente por TMDB ID (mais confiável) ou fuzzy match por
   * título/ano. Retorna a série existente ou null.
   */
  private static async findExistingSeries(
    title: string,
    year: number | undefined,
    relativePath: string,
    tmdbId?: number
  ): Promise<any | null> {
    // 1) Se tem TMDB ID, busca direto
    if (tmdbId) {
      const byTmdb = await Series.findOne({ tmdbId });
      if (byTmdb) return byTmdb;
    }

    // 2) Busca por path exato
    const byPath = await Series.findOne({ path: relativePath });
    if (byPath) return byPath;

    // 3) Busca por título/canonical + ano (normalizado)
    if (year) {
      const byTitleYear = await Series.findOne({
        $or: [
          { title, year },
          { canonicalTitle: title, year },
        ],
      });
      if (byTitleYear) return byTitleYear;
    }

    // 4) Fuzzy match: título normalizado (mesma lógica dos filmes)
    const cleanTitle = title.toLowerCase()
      .replace(/[._-]+/g, ' ')
      .replace(/\b(open\s+matte|imax|remux|extended|director.?s?\s+cut|theatrical|unrated|proper|repack|internal|bluray|webrip|web.dl|webdl|hdtv|dvdrip|bdrip|x264|x265|h264|h265|hevc|10bit|8bit|aac|ac3|dts|flac|mp3|dual|audio|dublado|dub|ptbr|portuguese|english|legendado|subtitle|subs)\b/gi, '')
      .replace(/[^a-z0-9\s]/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();

    if (cleanTitle.length >= 3) {
      const fuzzy = await Series.findOne({
        $or: [
          { title: { $regex: new RegExp(cleanTitle.replace(/\s+/g, '.*'), 'i') } },
          { canonicalTitle: { $regex: new RegExp(cleanTitle.replace(/\s+/g, '.*'), 'i') } },
        ],
        ...(year ? { year } : {}),
      });
      if (fuzzy) return fuzzy;
    }

    return null;
  }

  /**
   * Resolve um path relativo em um arquivo existente dentro de QUALQUER media
   * root (inclui /media/transcode — arquivos convertidos em background — e
   * /downloads). Retorna o path absoluto ou null.
   */
  private static resolveInRoots(relativePath: string): string | null {
    if (!relativePath) return null;
    const safe = relativePath.replace(/^[/\\]+/, '').replace(/\.\./g, '');
    for (const root of MEDIA_ROOTS) {
      const candidate = path.join(root, safe);
      if (fs.existsSync(candidate) && fs.statSync(candidate).isFile()) {
        return candidate;
      }
    }
    return null;
  }

  /**
   * Detecta e faz merge de filmes duplicados (mesmo tmdbId ou título+ano muito similar).
   * Mantém o registro mais completo (com tmdbId, poster, overview) e remove o outro.
   */
  static async mergeDuplicateMovies(): Promise<number> {
    let merged = 0;
    try {
      const allMovies = await Movie.find({});
      const byTmdb = new Map<number, any[]>();
      const byTitleYear = new Map<string, any[]>();

      for (const m of allMovies) {
        if (m.tmdbId) {
          const arr = byTmdb.get(m.tmdbId) || [];
          arr.push(m);
          byTmdb.set(m.tmdbId, arr);
        }
        const key = `${m.title.toLowerCase().trim()}|${m.year || 0}`;
        const arr = byTitleYear.get(key) || [];
        arr.push(m);
        byTitleYear.set(key, arr);
      }

      // Merge por tmdbId
      for (const [tmdbId, movies] of byTmdb) {
        if (movies.length > 1) {
          const keeper = [...movies].sort((a, b) => recordCompletenessScore(b) - recordCompletenessScore(a))[0];
          for (const m of movies) {
            if (m._id.toString() !== keeper._id.toString()) {
              await Movie.findByIdAndDelete(m._id);
              merged++;
              logger.info(COMPONENT, `Merged duplicate movie (tmdbId=${tmdbId}): removed "${m.title}" kept "${keeper.title}"`);
            }
          }
        }
      }

      // Merge por título+ano (sem tmdbId)
      for (const [key, movies] of byTitleYear) {
        if (movies.length > 1) {
          const keeper = [...movies].sort((a, b) => recordCompletenessScore(b) - recordCompletenessScore(a))[0];
          for (const m of movies) {
            if (m._id.toString() !== keeper._id.toString()) {
              await Movie.findByIdAndDelete(m._id);
              merged++;
              logger.info(COMPONENT, `Merged duplicate movie (title+year=${key}): removed "${m.title}" kept "${keeper.title}"`);
            }
          }
        }
      }
    } catch (err: any) {
      logger.error(COMPONENT, `Merge duplicate movies failed: ${err.message}`);
    }
    return merged;
  }

  /**
   * Detecta e faz merge de séries duplicadas (mesmo tvdbId ou título+ano muito similar).
   * Mantém o registro mais completo (com tvdbId, poster, overview) e remove o outro.
   */
  static async mergeDuplicateSeries(): Promise<number> {
    let merged = 0;
    try {
      const allSeries = await Series.find({});
      const byTvdb = new Map<number, any[]>();
      const byTitleYear = new Map<string, any[]>();

      for (const s of allSeries) {
        if (s.tvdbId) {
          const arr = byTvdb.get(s.tvdbId) || [];
          arr.push(s);
          byTvdb.set(s.tvdbId, arr);
        }
        const key = `${s.title.toLowerCase().trim()}|${s.year || 0}`;
        const arr = byTitleYear.get(key) || [];
        arr.push(s);
        byTitleYear.set(key, arr);
      }

      // Merge por tvdbId
      for (const [tvdbId, series] of byTvdb) {
        if (series.length > 1) {
          const keeper = [...series].sort((a, b) => recordCompletenessScore(b) - recordCompletenessScore(a))[0];
          for (const s of series) {
            if (s._id.toString() !== keeper._id.toString()) {
              await Series.findByIdAndDelete(s._id);
              merged++;
              logger.info(COMPONENT, `Merged duplicate series (tvdbId=${tvdbId}): removed "${s.title}" kept "${keeper.title}"`);
            }
          }
        }
      }

      // Merge por título+ano (sem tvdbId)
      for (const [key, series] of byTitleYear) {
        if (series.length > 1) {
          const keeper = [...series].sort((a, b) => recordCompletenessScore(b) - recordCompletenessScore(a))[0];
          for (const s of series) {
            if (s._id.toString() !== keeper._id.toString()) {
              await Series.findByIdAndDelete(s._id);
              merged++;
              logger.info(COMPONENT, `Merged duplicate series (title+year=${key}): removed "${s.title}" kept "${keeper.title}"`);
            }
          }
        }
      }
    } catch (err: any) {
      logger.error(COMPONENT, `Merge duplicate series failed: ${err.message}`);
    }
    return merged;
  }

  static async scanOnStartup(): Promise<{ moviesImported: number; seriesImported: number; errors: number }> {
    logger.info(COMPONENT, 'Running on-startup library scan...');
    const result = await this.scanLibrary();
    return {
      moviesImported: result.movies,
      seriesImported: result.series,
      errors: result.errors,
    };
  }

static async scanDownloads(): Promise<{ matched: number; errors: number }> {
    logger.info(COMPONENT, 'Scanning /downloads for completed torrents...');
    let matched = 0;
    let errors = 0;

    if (!fs.existsSync(DOWNLOADS_ROOT)) {
      logger.warn(COMPONENT, '/downloads does not exist on disk');
      return { matched: 0, errors: 0 };
    }

    try {
      const videoFiles = findVideoFiles(DOWNLOADS_ROOT);
      for (const filePath of videoFiles) {
        try {
          const relativePath = getRelativePath(filePath);
          if (!relativePath) continue;

          const title = path.basename(filePath, path.extname(filePath));
          const cleanTitle = title.toLowerCase().replace(/[._-]+/g, ' ').replace(/[^a-z0-9\s]/g, '').trim();
          const yearMatch = title.match(/(\d{4})/);
          const year = yearMatch ? parseInt(yearMatch[1], 10) : undefined;

          // D1: Organiza o arquivo na estrutura Jellyfin ANTES de atualizar o DB
          let organizedPath: string | null = null;
          const isMovie = !/(S\d{1,2}E\d{1,2}|S\d{1,2}|Season|Temporada)/i.test(title);

          if (isMovie) {
            // Filme: move para /media/movies/Titulo (Ano)/
            const movieDirName = year ? `${title} (${year})` : title;
            const destDir = path.join('/media/movies', movieDirName);
            fs.mkdirSync(destDir, { recursive: true });
            const destFile = path.join(destDir, path.basename(filePath));
            if (!fs.existsSync(destFile)) {
              fs.renameSync(filePath, destFile);
              organizedPath = getRelativePath(destFile);
            } else {
              organizedPath = relativePath;
            }
          } else {
            // Série: usa organizeMediaFile que extrai temporada/episodio do nome
            organizedPath = organizeMediaFile(filePath, undefined, undefined, undefined, '/media/series');
          }

          const finalRelativePath = organizedPath || relativePath;

          const existingMovie = await Movie.findOne({
            $or: [
              { title: { $regex: new RegExp(cleanTitle.replace(/\s+/g, '.*'), 'i') } },
              { path: finalRelativePath },
            ],
          });

          if (existingMovie && existingMovie.status !== 'available') {
            if (isSpamFileName(path.basename(filePath), fileSizeBytes(filePath))) {
              logger.warn(COMPONENT, `Skipping spam file for movie ${existingMovie.title}: ${filePath}`);
              continue;
            }
            // D2: Atualiza path para o local organizado
            await Movie.findByIdAndUpdate(existingMovie._id, { status: 'available', path: finalRelativePath });
            matched++;
            logger.info(COMPONENT, `Updated movie from downloads: ${existingMovie.title} -> ${finalRelativePath}`);
          }

          const existingSeries = await Series.findOne({
            $or: [
              { title: { $regex: new RegExp(cleanTitle.replace(/\s+/g, '.*'), 'i') } },
              { path: finalRelativePath },
            ],
          });

          if (existingSeries && existingSeries.status !== 'available') {
            if (isSpamFileName(path.basename(filePath), fileSizeBytes(filePath))) {
              logger.warn(COMPONENT, `Skipping spam file for series ${existingSeries.title}: ${filePath}`);
              continue;
            }
            // D2: Atualiza path para o local organizado
            await Series.findByIdAndUpdate(existingSeries._id, { status: 'available', path: finalRelativePath });
            matched++;
            logger.info(COMPONENT, `Updated series from downloads: ${existingSeries.title} -> ${finalRelativePath}`);
          }
        } catch (err: any) {
            errors++;
            logger.warn(COMPONENT, `Error scanning downloads file: ${err.message}`);
          }
        }

        let orphansRemoved = 0;
        try {
          for (const filePath of videoFiles) {
            try {
              const relPath = getRelativePath(filePath);
              if (!relPath) continue;
              const fileName = path.basename(filePath);
              const isSpamFile = isSpamFileName(fileName, fileSizeBytes(filePath));
              if (isSpamFile) {
                await fs.promises.unlink(filePath).catch(() => {});
                orphansRemoved++;
                logger.info(COMPONENT, `Deleted orphaned spam file: ${filePath}`);
              }
            } catch { /* ignore per-file */ }
          }
        } catch { /* ignore */ }

       logger.info(COMPONENT, `Downloads scan complete: ${matched} matched, ${errors} errors, ${orphansRemoved} spam files removed`);
      return { matched, errors };
    } catch (err: any) {
      logger.error(COMPONENT, `Downloads scan failed: ${err.message}`);
      return { matched, errors: errors + 1 };
    }
  }

  static async scanLibrary(): Promise<{ movies: number; series: number; errors: number }> {
    if (this.isScanning) {
      logger.info(COMPONENT, 'Scan already in progress, skipping');
      return { movies: 0, series: 0, errors: 0 };
    }

    this.isScanning = true;
    logger.info(COMPONENT, 'Starting library scan...');

    let moviesAdded = 0;
    let moviesUpdated = 0;
    let seriesAdded = 0;
    let seriesUpdated = 0;
    let moviesMissing = 0;
    let seriesMissing = 0;
    let errors = 0;

    try {
      // Scan movies
      const moviesRoot = '/media/movies';
      if (fs.existsSync(moviesRoot)) {
        const movieFiles = findVideoFiles(moviesRoot);
        const foundPaths = new Set<string>();

         for (const filePath of movieFiles) {
           try {
             const relativePath = getRelativePath(filePath);
             if (!relativePath) continue;
             foundPaths.add(relativePath);

const { title, year } = extractTitleFromPath(filePath, moviesRoot);
              const extension = path.extname(filePath).toLowerCase();

              if (isSpamFileName(path.basename(filePath), fileSizeBytes(filePath))) {
                logger.warn(COMPONENT, `Skipping spam file in movies folder: ${filePath}`);
                continue;
              }

              // Extrai TMDB ID do nome do arquivo/pasta se possível
              const tmdbIdMatch = filePath.match(/tmdb[_-]?(\d+)/i) || relativePath.match(/tmdb[_-]?(\d+)/i);
              const tmdbId = tmdbIdMatch ? parseInt(tmdbIdMatch[1], 10) : undefined;

const existing = await MediaScannerService.findExistingMovie(title, year, relativePath, tmdbId);

              if (!existing) {
              const movie = new Movie({
                title,
                year,
                status: 'available',
                path: relativePath,
                overview: '',
                genres: [],
                rating: 0,
                addedAt: new Date(),
                updatedAt: new Date(),
              });
              await movie.save();
              // Enriquece com TMDB (busca por título, persiste tmdbId + capa/sinopse)
              await MetadataService.enrichMovieBySearch(movie.toObject());
              moviesAdded++;
              logger.info(COMPONENT, `Added movie to library: ${title} (${year})`);
            } else if (existing.status !== 'available') {
              await Movie.findByIdAndUpdate(existing._id, { status: 'available', path: relativePath });
              moviesUpdated++;
              logger.info(COMPONENT, `Updated movie status to available: ${title}`);
            }
          } catch (err: any) {
            errors++;
            logger.warn(COMPONENT, `Error scanning movie file: ${err.message}`);
          }
        }
      }

      // Scan series
      const seriesRoot = '/media/series';
      if (fs.existsSync(seriesRoot)) {
        try {
          const seriesDirs = fs.readdirSync(seriesRoot, { withFileTypes: true })
            .filter(e => e.isDirectory())
            .map(e => path.join(seriesRoot, e.name));

           for (const seriesDir of seriesDirs) {
             try {
               if (SPAM_DIR_KEYWORDS.some((kw) => seriesDir.toLowerCase().includes(kw))) {
                 logger.warn(COMPONENT, `Skipping spam series directory: ${seriesDir}`);
                 continue;
               }
               const { title, year } = extractTitleFromPath(seriesDir, seriesRoot);
               // Filtra propaganda/spam (ex: BLUDV.mp4 de 32MB que virava o path da série)
               const videoFiles = filterRealVideos(findVideoFiles(seriesDir));
               const foundPaths = new Set<string>();

              for (const vf of videoFiles) {
                const rp = getRelativePath(vf);
                if (rp) foundPaths.add(rp);
              }

              if (videoFiles.length === 0) continue;

              const relativePath = getRelativePath(videoFiles[0]);
              if (!relativePath) continue;

              // Extrai TMDB ID do nome da pasta/arquivo se possível (dedup por ID)
              const tmdbIdMatch = seriesDir.match(/tmdb[_-]?(\d+)/i) || relativePath.match(/tmdb[_-]?(\d+)/i);
              const tmdbId = tmdbIdMatch ? parseInt(tmdbIdMatch[1], 10) : undefined;

              const existing = await MediaScannerService.findExistingSeries(title, year, relativePath, tmdbId);

              if (!existing) {
                const series = new Series({
                  title,
                  year,
                  status: 'available',
                  seasons: this.countSeasons(seriesDir),
                  path: relativePath,
                  overview: '',
                  genres: [],
                  rating: 0,
                  addedAt: new Date(),
                  updatedAt: new Date(),
                });
                await series.save();
                // Enriquece com TMDB (busca por título, persiste tmdbId + capa/sinopse)
                await MetadataService.enrichSeriesBySearch(series.toObject());
                seriesAdded++;
                logger.info(COMPONENT, `Added series to library: ${title} (${year})`);
              } else if (existing.status !== 'available') {
                await Series.findByIdAndUpdate(existing._id, { status: 'available', path: relativePath });
                seriesUpdated++;
                logger.info(COMPONENT, `Updated series status to available: ${title}`);
              }
            } catch (err: any) {
              errors++;
              logger.warn(COMPONENT, `Error scanning series: ${err.message}`);
            }
          }
        } catch { /* ignore */ }
      }

      // Check for DB entries whose files no longer exist on disk — delete them.
      // Só registros 'available' são verificados: 'pending'/'downloading' ainda
      // não têm arquivo em disco (são retomados pelo PendingRetryService).
      const allMovies = await Movie.find({ status: 'available' });
      for (const movie of allMovies) {
        if (!movie.path) {
          await Movie.findByIdAndDelete(movie._id);
          moviesMissing++;
          logger.warn(COMPONENT, `Deleted movie with no path: ${movie.title}`);
          continue;
        }
        // Resolve dentro de TODOS os media roots (inclui /media/transcode para
        // registros apontando para arquivos convertidos em background — P6).
        const fullPath = this.resolveInRoots(String(movie.path));
        if (!fullPath) {
          await Movie.findByIdAndDelete(movie._id);
          moviesMissing++;
          logger.warn(COMPONENT, `Deleted movie missing from disk: ${movie.title}`);
        }
      }

      const allSeries = await Series.find({ status: 'available' });
      for (const serie of allSeries) {
        if (!serie.path) {
          await Series.findByIdAndDelete(serie._id);
          seriesMissing++;
          logger.warn(COMPONENT, `Deleted series with no path: ${serie.title}`);
          continue;
        }
        const fullPath = this.resolveInRoots(String(serie.path));
        if (!fullPath) {
          await Series.findByIdAndDelete(serie._id);
          seriesMissing++;
          logger.warn(COMPONENT, `Deleted series missing from disk: ${serie.title}`);
        }
      }

      logger.info(COMPONENT, `Library scan complete: +${moviesAdded} movies, +${seriesAdded} series, ~${moviesUpdated} movies updated, ~${seriesUpdated} series updated, ${moviesMissing} movies missing, ${seriesMissing} series missing, ${errors} errors`);
      return { movies: moviesAdded + moviesUpdated, series: seriesAdded + seriesUpdated, errors };
    } catch (err: any) {
      logger.error(COMPONENT, `Scan failed: ${err.message}`);
      return { movies: moviesAdded + moviesUpdated, series: seriesAdded + seriesUpdated, errors: errors + 1 };
    } finally {
      this.isScanning = false;
    }
  }

  static async scanAllMedia(): Promise<{ moviesImported: number; seriesImported: number; errors: number }> {
    const result = await this.scanLibrary();
    return {
      moviesImported: result.movies,
      seriesImported: result.series,
      errors: result.errors,
    };
  }

  static async findExistingMovieOnDisk(title: string, year?: number): Promise<string | null> {
    const moviesRoot = '/media/movies';
    if (!fs.existsSync(moviesRoot)) return null;

    const cleanTitle = title.toLowerCase().replace(/[^a-z0-9]/g, ' ').replace(/\s+/g, ' ').trim();
    const entries = fs.readdirSync(moviesRoot, { withFileTypes: true });

    for (const entry of entries) {
      if (!entry.isDirectory()) continue;
      const dirName = entry.name.toLowerCase();
      if (dirName.includes(cleanTitle) || cleanTitle.includes(dirName.replace(/[0-9]/g, '').trim())) {
        const dirPath = path.join(moviesRoot, entry.name);
        const videoFiles = filterRealVideos(findVideoFiles(dirPath));
        if (videoFiles.length > 0) {
          return getRelativePath(videoFiles[0]);
        }
      }
    }
    return null;
  }

  static async findExistingSeriesOnDisk(title: string): Promise<string | null> {
    const seriesRoot = '/media/series';
    if (!fs.existsSync(seriesRoot)) return null;

    const cleanTitle = title.toLowerCase().replace(/[^a-z0-9]/g, ' ').replace(/\s+/g, ' ').trim();
    const entries = fs.readdirSync(seriesRoot, { withFileTypes: true });

    for (const entry of entries) {
      if (!entry.isDirectory()) continue;
      const dirName = entry.name.toLowerCase();
      if (dirName.includes(cleanTitle) || cleanTitle.includes(dirName.replace(/[0-9]/g, '').trim())) {
        const dirPath = path.join(seriesRoot, entry.name);
        const videoFiles = filterRealVideos(findVideoFiles(dirPath));
        if (videoFiles.length > 0) {
          return getRelativePath(videoFiles[0]);
        }
      }
    }
    return null;
  }

  static start(intervalHours = 24): void {
    if (this.scanInterval) return;

    // Run immediate scan on startup (0ms delay) — syncs DB with disk as soon as server starts
    setTimeout(() => {
      this.scanOnStartup().catch(err => {
        logger.error(COMPONENT, `On-startup scan failed: ${err.message}`);
      });
    }, 0);

    // Also scan /downloads on startup for any completed torrents not yet moved
    setTimeout(() => {
      this.scanDownloads().catch(err => {
        logger.error(COMPONENT, `Downloads scan failed: ${err.message}`);
      });
    }, 2000);

    // Periodic full library scans
    this.scanInterval = setInterval(() => {
      this.scanLibrary().catch(err => {
        logger.error(COMPONENT, `Periodic scan failed: ${err.message}`);
      });
    }, intervalHours * 60 * 60 * 1000);

    // Periodic downloads scan (every 6 hours)
    setInterval(() => {
      this.scanDownloads().catch(err => {
        logger.error(COMPONENT, `Periodic downloads scan failed: ${err.message}`);
      });
    }, 6 * 60 * 60 * 1000);

    logger.info(COMPONENT, `Scanner started (library interval: ${intervalHours}h, downloads interval: 6h)`);
  }

  static stop(): void {
    if (this.scanInterval) {
      clearInterval(this.scanInterval);
      this.scanInterval = null;
      logger.info(COMPONENT, 'Scanner stopped');
    }
  }
}
