// # leia o arquivo @PROJECT_CONTEXT.md , se já leu desconsidere
// Leia /home/servidor/Git/site_corp/PROJECT_CONTEXT.md antes de modificar este arquivo
import mongoose from 'mongoose';
import { logger } from '../utils/logger';

const COMPONENT = 'Database';
const MAX_RETRIES = 5;
const RETRY_DELAY_MS = 3000;

export async function connectDatabase(): Promise<void> {
  const uri = process.env.MONGO_URI || `mongodb://${process.env.MONGO_INITDB_ROOT_USERNAME || 'media_admin'}:${process.env.MONGO_INITDB_ROOT_PASSWORD || 'changeme'}@media-mongodb:27017/${process.env.MONGO_INITDB_DATABASE || 'media'}?authSource=admin`;

  let lastError: Error | null = null;

  for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
    try {
      await mongoose.connect(uri);
      logger.info(COMPONENT, `MongoDB connected (attempt ${attempt})`);

      mongoose.connection.on('error', (err) => {
        logger.error(COMPONENT, 'MongoDB runtime error', { error: err.message });
      });

      mongoose.connection.on('disconnected', () => {
        logger.warn(COMPONENT, 'MongoDB disconnected');
      });

      // Create indexes for recommendations performance
      await createIndexes();

      return;
    } catch (err) {
      lastError = err instanceof Error ? err : new Error(String(err));
      if (attempt < MAX_RETRIES) {
        logger.warn(COMPONENT, `Connection attempt ${attempt}/${MAX_RETRIES} failed, retrying in ${RETRY_DELAY_MS}ms`, {
          error: lastError.message,
        });
        await new Promise((resolve) => setTimeout(resolve, RETRY_DELAY_MS));
      }
    }
  }

  logger.error(COMPONENT, `Failed to connect after ${MAX_RETRIES} attempts`, {
    error: lastError?.message,
  });
  throw lastError || new Error('MongoDB connection failed');
}

async function createIndexes(): Promise<void> {
  try {
    const { Movie } = await import('../models/Movie');
    const { Series } = await import('../models/Series');
    const { Download } = await import('../models/Download');

    // Recommendations: addedAt for recent, rating for top-rated
    await Movie.collection.createIndex({ addedAt: -1 });
    await Movie.collection.createIndex({ rating: -1 });
    await Series.collection.createIndex({ addedAt: -1 });
    await Series.collection.createIndex({ rating: -1 });

    // Downloads: status for active downloads
    await Download.collection.createIndex({ status: 1 });

    logger.info(COMPONENT, 'Indexes created/verified');
  } catch (err) {
    logger.warn(COMPONENT, 'Index creation skipped', { error: err instanceof Error ? err.message : String(err) });
  }
}

export async function disconnectDatabase(): Promise<void> {
  await mongoose.disconnect();
  logger.info(COMPONENT, 'MongoDB disconnected gracefully');
}
