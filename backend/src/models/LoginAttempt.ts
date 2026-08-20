// # leia o arquivo @PROJECT_CONTEXT.md , se já leu desconsidere
// Leia /home/servidor/Git/site_corp/PROJECT_CONTEXT.md antes de modificar este arquivo
import mongoose, { Schema, Document } from 'mongoose';

export interface LoginAttemptDocument extends Document {
  ip: string;
  username?: string;
  email?: string;
  failedCount: number;
  lastFailedAt?: Date;
  lockoutUntil?: Date;
  attempts: {
    attemptedAt: Date;
    source: string;
    success: boolean;
  }[];
  createdAt: Date;
  updatedAt: Date;
}

export interface LoginAttemptModel extends mongoose.Model<LoginAttemptDocument> {
  checkAndUpdate(ip: string, username?: string, email?: string): Promise<any>;
  recordFailure(ip: string, username?: string, email?: string): Promise<any>;
  recordSuccess(ip: string): Promise<any>;
}

const LoginAttemptSchema = new Schema<LoginAttemptDocument>(
  {
    ip: { type: String, required: true, index: true },
    username: { type: String, sparse: true },
    email: { type: String, sparse: true },
    failedCount: { type: Number, default: 0 },
    lastFailedAt: { type: Date, default: null },
    lockoutUntil: { type: Date, default: null },
    attempts: {
      type: [{
        attemptedAt: { type: Date, default: Date.now },
        source: { type: String },
        success: { type: Boolean },
      }],
      default: [],
    },
  },
  {
    timestamps: true,
    collection: 'login_attempts',
  }
);

// Índices compostos para performance
LoginAttemptSchema.index({ ip: 1, lockoutUntil: 1 });

// Método para verificar rate limiting
LoginAttemptSchema.statics.checkAndUpdate = async function (ip: string, username?: string, email?: string) {
  const now = new Date();

  // 1. Verifica se está em lockout
  const current = await this.findOne({ ip, lockoutUntil: { $gt: now } });
  if (current) {
    const minutesLeft = Math.ceil((current.lockoutUntil!.getTime() - now.getTime()) / 60000);
    return {
      allowed: false,
      reason: 'lockout',
      message: `Rate limit exceeded. Try again in ${minutesLeft} minute(s).`,
      lockedUntil: current.lockoutUntil,
    };
  }

  // 2. Busca último registro para este IP
  const lastAttempt = await this.findOne({ ip }).sort({ lastFailedAt: -1 });

  // 3. Se nunca tentou antes, reset
  if (!lastAttempt) {
    return {
      allowed: true,
      resetCount: 10,
    };
  }

  // 4. Verifica se pode resetar após período sem falha (24h sem falha)
  const timeSinceLastFail = now.getTime() - lastAttempt.lastFailedAt!.getTime();
  const HOURS_WITHOUT_FAILURE = 24;
  if (timeSinceLastFail >= HOURS_WITHOUT_FAILURE * 60 * 60 * 1000) {
    await this.deleteOne({ _id: lastAttempt._id });
    return { allowed: true, resetCount: 10 };
  }

  // 5. Determina limite baseado em falhas (escalating)
  const count = lastAttempt.failedCount;
  let allowed: number;
  let lockoutMinutes: number;

  if (count >= 50) {
    allowed = 1;
    lockoutMinutes = 240;
  } else if (count >= 30) {
    allowed = 2;
    lockoutMinutes = 120;
  } else if (count >= 15) {
    allowed = 4;
    lockoutMinutes = 60;
  } else if (count >= 10) {
    allowed = 0;
    lockoutMinutes = 60;
  } else {
    allowed = count;
    lockoutMinutes = 0;
  }

  // 6. Retorna resultado
  if (allowed === 0) {
    const lockoutUntil = new Date(now.getTime() + lockoutMinutes * 60 * 1000);
    await this.updateOne(
      { _id: lastAttempt._id },
      {
        lockoutUntil,
        $push: { attempts: { attemptedAt: now, source: 'ip', success: false } },
      }
    );
    return {
      allowed: false,
      reason: 'lockout',
      message: `Account temporarily locked. Try again in ${lockoutMinutes} minute(s).`,
      lockedUntil: lockoutUntil,
      currentCount: count,
    };
  }

  return {
    allowed: true,
    remainingAttempts: allowed,
    currentCount: count,
    lockoutUntil: null,
  };
};

// Método para registrar falha
LoginAttemptSchema.statics.recordFailure = async function (ip: string, username?: string, email?: string) {
  const now = new Date();

  const result = await this.findOneAndUpdate(
    { ip },
    {
      $inc: { failedCount: 1 },
      $set: { lastFailedAt: now },
      $push: { attempts: { attemptedAt: now, source: 'ip', success: false } },
    },
    { new: true, upsert: true }
  );

  // Remove lockout se count < 15
  if (result.failedCount < 15 && result.lockoutUntil) {
    await this.updateOne({ _id: result._id }, { lockoutUntil: null });
  }

  return result;
};

// Método para registrar sucesso e limpar registro
LoginAttemptSchema.statics.recordSuccess = async function (ip: string) {
  await this.deleteOne({ ip });
};

export const LoginAttempt = mongoose.model<LoginAttemptDocument, LoginAttemptModel>('LoginAttempt', LoginAttemptSchema);
