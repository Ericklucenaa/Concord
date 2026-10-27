import jwt from 'jsonwebtoken';
import { db } from '../db/database.js';
import { getJwtSecret } from '../config.js';

export async function authenticateToken(req, res, next) {
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.split(' ')[1];

  if (!token) {
    return res.status(401).json({ error: 'Acesso não autorizado. Token ausente.' });
  }

  try {
    const decoded = jwt.verify(token, getJwtSecret());
    
    const user = await db.get('SELECT id, username, email, avatar, status, created_at FROM users WHERE id = ?', [decoded.id]);
    if (!user) {
      return res.status(401).json({ error: 'Usuário não encontrado ou sessão inválida.' });
    }

    req.user = user;
    next();
  } catch (err) {
    return res.status(403).json({ error: 'Token inválido ou expirado.' });
  }
}

export function verifySocketToken(token) {
  if (!token) return null;
  try {
    return jwt.verify(token, getJwtSecret());
  } catch (err) {
    return null;
  }
}
