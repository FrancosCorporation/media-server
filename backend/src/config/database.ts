// # leia o arquivo @PROJECT_CONTEXT.md , se já leu desconsidere
// Leia /home/servidor/Git/site_corp/PROJECT_CONTEXT.md antes de modificar este arquivo
import mongoose from 'mongoose';
import { logger } from '../utils/logger';

const COMPONENT = 'Database';
const MAX_RETRIES = 5;
const RETRY_DELAY_MS = 3000;

function errorCode(error: unknown): string {
  if (error && typeof error === 'object' && 'code' in error) {
    const code = (error as { code?: unknown }).code;
    if (typeof code === 'string' || typeof code === 'number') return String(code);
  }
  return 'DATABASE_ERROR';
}

export async function connectDatabase(): Promise<void> {
  const uri = process.env.MONGO_URI?.trim();
  if (!uri) throw new Error('MONGO_URI é obrigatório para conectar ao MongoDB');

  for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
    try {
      await mongoose.connect(uri);
      logger.info(COMPONENT, `MongoDB connected (attempt ${attempt})`);

      mongoose.connection.on('error', (error) => {
        logger.error(COMPONENT, 'MongoDB runtime error', { errorCode: errorCode(error) });
      });
      mongoose.connection.on('disconnected', () => {
        logger.warn(COMPONENT, 'MongoDB disconnected');
      });

      await createIndexes();
      return;
    } catch (error) {
      const code = errorCode(error);
      if (attempt < MAX_RETRIES) {
        logger.warn(COMPONENT, `Connection attempt ${attempt}/${MAX_RETRIES} failed; retrying in ${RETRY_DELAY_MS}ms`, {
          errorCode: code,
        });
        await new Promise((resolve) => setTimeout(resolve, RETRY_DELAY_MS));
      } else {
        logger.error(COMPONENT, `Failed to connect after ${MAX_RETRIES} attempts`, { errorCode: code });
      }
    }
  }

  throw new Error('Não foi possível conectar ao MongoDB; confira MONGO_URI e a disponibilidade do serviço');
}

async function createIndexes(): Promise<void> {
  try {
    const { Movie } = await import('../models/Movie');
    const { Series } = await import('../models/Series');
    const { Download } = await import('../models/Download');

    await Movie.collection.createIndex({ addedAt: -1 });
    await Movie.collection.createIndex({ rating: -1 });
    await Series.collection.createIndex({ addedAt: -1 });
    await Series.collection.createIndex({ rating: -1 });
    await Download.collection.createIndex({ status: 1 });

    logger.info(COMPONENT, 'Indexes created/verified');
  } catch (error) {
    logger.warn(COMPONENT, 'Index creation skipped', { errorCode: errorCode(error) });
  }
}

export async function disconnectDatabase(): Promise<void> {
  await mongoose.disconnect();
  logger.info(COMPONENT, 'MongoDB disconnected gracefully');
}
