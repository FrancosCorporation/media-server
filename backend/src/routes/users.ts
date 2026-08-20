// # leia o arquivo @PROJECT_CONTEXT.md , se já leu desconsidere
// Leia /home/servidor/Git/site_corp/PROJECT_CONTEXT.md antes de modificar este arquivo
import { Router, Response } from 'express';
import bcrypt from 'bcrypt';
import { authenticateToken, requireAdmin } from '../middleware/auth';
import { User } from '../models/User';
import { logger } from '../utils/logger';
import type { AuthRequest } from '../types';

const router = Router();
const COMPONENT = 'UsersRoute';

router.use(authenticateToken);
router.use(requireAdmin);

router.get('/', async (_req: AuthRequest, res: Response) => {
  try {
    const users = await User.find().select('-password').sort({ createdAt: -1 });
    res.json({ users });
  } catch {
    res.status(500).json({ error: 'Erro ao listar usuários' });
  }
});

router.post('/', async (req: AuthRequest, res: Response) => {
  try {
    const { username, email, password, role } = req.body;
    if (!username || !email || !password) {
      return res.status(400).json({ error: 'Campos obrigatórios: username, email, password' });
    }

    const existing = await User.findOne({ $or: [{ username }, { email }] });
    if (existing) return res.status(409).json({ error: 'Usuário ou email já existe' });

    const hashed = await bcrypt.hash(password, 12);
    const user = await User.create({ username, email, password: hashed, role: role || 'user' });
    logger.info(COMPONENT, `Admin created user: ${username}`);

    const { password: _, ...safe } = user.toObject();
    res.status(201).json({ user: safe });
  } catch (err) {
    logger.error(COMPONENT, 'Create user error', { error: err instanceof Error ? err.message : String(err) });
    res.status(500).json({ error: 'Erro ao criar usuário' });
  }
});

router.delete('/:id', async (req: AuthRequest, res: Response) => {
  try {
    const user = await User.findById(req.params.id);
    if (!user) return res.status(404).json({ error: 'Usuário não encontrado' });
    if (user.role === 'admin' && req.user?._id !== user._id.toString()) {
      const adminCount = await User.countDocuments({ role: 'admin' });
      if (adminCount <= 1) return res.status(400).json({ error: 'Não é possível remover o último administrador' });
    }
    await User.findByIdAndDelete(req.params.id);
    res.json({ success: true });
  } catch {
    res.status(500).json({ error: 'Erro ao remover usuário' });
  }
});

export default router;
