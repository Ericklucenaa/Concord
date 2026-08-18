import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { randomUUID } from 'crypto';
import { db } from '../db/database.js';
import { USER_STATUS } from '../../../shared/constants.js';

export async function register(req, res) {
  try {
    const { username, email, password } = req.body;

    if (!username || !email || !password) {
      return res.status(400).json({ error: 'Todos os campos são obrigatórios.' });
    }

    const trimmedUsername = username.trim();
    const trimmedEmail = email.trim().toLowerCase();

    if (trimmedUsername.length < 3 || trimmedUsername.length > 24) {
      return res.status(400).json({ error: 'Nome de usuário deve ter entre 3 e 24 caracteres.' });
    }

    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(trimmedEmail)) {
      return res.status(400).json({ error: 'Formato de e-mail inválido.' });
    }

    if (password.length < 6) {
      return res.status(400).json({ error: 'A senha deve ter pelo menos 6 caracteres.' });
    }

    // Check if username or email already exists
    const existingUser = await db.get(
      'SELECT id, username, email FROM users WHERE username = ? OR email = ?',
      [trimmedUsername, trimmedEmail]
    );

    if (existingUser) {
      if (existingUser.username.toLowerCase() === trimmedUsername.toLowerCase()) {
        return res.status(409).json({ error: 'Este nome de usuário já está em uso.' });
      }
      return res.status(409).json({ error: 'Este e-mail já está cadastrado.' });
    }

    const salt = await bcrypt.genSalt(12);
    const passwordHash = await bcrypt.hash(password, salt);
    const userId = randomUUID();

    // Default avatar gradient / initials placeholder
    const avatar = `https://api.dicebear.com/7.x/bottts/svg?seed=${encodeURIComponent(trimmedUsername)}`;

    await db.run(
      'INSERT INTO users (id, username, email, password_hash, avatar, status) VALUES (?, ?, ?, ?, ?, ?)',
      [userId, trimmedUsername, trimmedEmail, passwordHash, avatar, USER_STATUS.ONLINE]
    );

    const secret = process.env.JWT_SECRET || 'super_secret_jwt_key_change_in_production_123456789';
    const expiresIn = process.env.JWT_EXPIRES_IN || '7d';
    const token = jwt.sign({ id: userId, username: trimmedUsername, email: trimmedEmail }, secret, { expiresIn });

    const user = {
      id: userId,
      username: trimmedUsername,
      email: trimmedEmail,
      avatar,
      status: USER_STATUS.ONLINE,
      createdAt: new Date().toISOString()
    };

    return res.status(201).json({
      message: 'Conta criada com sucesso!',
      user,
      token
    });
  } catch (err) {
    console.error('Register error:', err);
    return res.status(500).json({ error: 'Erro interno ao registrar usuário.' });
  }
}

export async function login(req, res) {
  try {
    const { login, password } = req.body;

    if (!login || !password) {
      return res.status(400).json({ error: 'Informe o usuário/e-mail e a senha.' });
    }

    const trimmedLogin = login.trim();

    const user = await db.get(
      'SELECT * FROM users WHERE username = ? OR email = ?',
      [trimmedLogin, trimmedLogin.toLowerCase()]
    );

    if (!user) {
      return res.status(401).json({ error: 'Credenciais inválidas.' });
    }

    const isMatch = await bcrypt.compare(password, user.password_hash);
    if (!isMatch) {
      return res.status(401).json({ error: 'Credenciais inválidas.' });
    }

    // Set online
    await db.run('UPDATE users SET status = ? WHERE id = ?', [USER_STATUS.ONLINE, user.id]);

    const secret = process.env.JWT_SECRET || 'super_secret_jwt_key_change_in_production_123456789';
    const expiresIn = process.env.JWT_EXPIRES_IN || '7d';
    const token = jwt.sign({ id: user.id, username: user.username, email: user.email }, secret, { expiresIn });

    const safeUser = {
      id: user.id,
      username: user.username,
      email: user.email,
      avatar: user.avatar,
      status: USER_STATUS.ONLINE,
      createdAt: user.created_at
    };

    return res.json({
      message: 'Login realizado com sucesso!',
      user: safeUser,
      token
    });
  } catch (err) {
    console.error('Login error:', err);
    return res.status(500).json({ error: 'Erro interno ao realizar login.' });
  }
}

export async function getMe(req, res) {
  try {
    const user = await db.get(
      'SELECT id, username, email, avatar, status, created_at FROM users WHERE id = ?',
      [req.user.id]
    );

    if (!user) {
      return res.status(404).json({ error: 'Usuário não encontrado.' });
    }

    return res.json({
      user: {
        id: user.id,
        username: user.username,
        email: user.email,
        avatar: user.avatar,
        status: user.status,
        createdAt: user.created_at
      }
    });
  } catch (err) {
    console.error('getMe error:', err);
    return res.status(500).json({ error: 'Erro ao buscar dados do perfil.' });
  }
}

export async function updateProfile(req, res) {
  try {
    const { username, avatar, status, currentPassword, newPassword } = req.body;
    const userId = req.user.id;

    const user = await db.get('SELECT * FROM users WHERE id = ?', [userId]);
    if (!user) {
      return res.status(404).json({ error: 'Usuário não encontrado.' });
    }

    let updatedUsername = user.username;
    let updatedAvatar = user.avatar;
    let updatedStatus = user.status;

    if (username !== undefined && username.trim()) {
      const cleanUsername = username.trim().replace(/^@/, '');
      if (cleanUsername.length < 3 || cleanUsername.length > 24) {
        return res.status(400).json({ error: 'O apelido deve ter entre 3 e 24 caracteres.' });
      }
      if (!/^[a-zA-Z0-9_]+$/.test(cleanUsername)) {
        return res.status(400).json({ error: 'O apelido deve conter apenas letras, números e underline (_).' });
      }

      // Check if unique
      const duplicate = await db.get(
        'SELECT id FROM users WHERE username = ? COLLATE NOCASE AND id != ?',
        [cleanUsername, userId]
      );
      if (duplicate) {
        return res.status(409).json({ error: 'Este apelido já está em uso por outro usuário.' });
      }
      updatedUsername = cleanUsername;
    }

    if (avatar !== undefined) {
      updatedAvatar = avatar;
    }

    if (status && Object.values(USER_STATUS).includes(status)) {
      updatedStatus = status;
    }

    if (newPassword) {
      if (!currentPassword) {
        return res.status(400).json({ error: 'Informe a senha atual para alterar para uma nova senha.' });
      }

      const isMatch = await bcrypt.compare(currentPassword, user.password_hash);
      if (!isMatch) {
        return res.status(400).json({ error: 'Senha atual incorreta.' });
      }

      if (newPassword.length < 6) {
        return res.status(400).json({ error: 'A nova senha deve ter pelo menos 6 caracteres.' });
      }

      const salt = await bcrypt.genSalt(12);
      const newHash = await bcrypt.hash(newPassword, salt);

      await db.run(
        'UPDATE users SET username = ?, avatar = ?, status = ?, password_hash = ? WHERE id = ?',
        [updatedUsername, updatedAvatar, updatedStatus, newHash, userId]
      );
    } else {
      await db.run(
        'UPDATE users SET username = ?, avatar = ?, status = ? WHERE id = ?',
        [updatedUsername, updatedAvatar, updatedStatus, userId]
      );
    }

    return res.json({
      message: 'Perfil atualizado com sucesso!',
      user: {
        id: user.id,
        username: updatedUsername,
        email: user.email,
        avatar: updatedAvatar,
        status: updatedStatus,
        createdAt: user.created_at
      }
    });
  } catch (err) {
    console.error('Update profile error:', err);
    return res.status(500).json({ error: 'Erro ao atualizar perfil.' });
  }
}

export async function loginWithGoogle(req, res) {
  try {
    const { email, displayName, photoURL } = req.body;

    if (!email) {
      return res.status(400).json({ error: 'E-mail do Google é obrigatório.' });
    }

    const trimmedEmail = email.trim().toLowerCase();

    // 1. Check if user already exists
    let user = await db.get('SELECT * FROM users WHERE email = ?', [trimmedEmail]);

    if (!user) {
      // 2. Create new user with Google info
      const userId = randomUUID();
      
      let baseUsername = (displayName || trimmedEmail.split('@')[0])
        .replace(/[^a-zA-Z0-9_]/g, '')
        .trim();
      
      if (baseUsername.length < 3) baseUsername = 'User_' + baseUsername;
      if (baseUsername.length > 20) baseUsername = baseUsername.substring(0, 20);

      // Ensure unique username
      let candidateUsername = baseUsername;
      let counter = 1;
      while (await db.get('SELECT id FROM users WHERE username = ? COLLATE NOCASE', [candidateUsername])) {
        candidateUsername = `${baseUsername}${counter}`;
        counter++;
      }

      const avatar = photoURL || `https://api.dicebear.com/7.x/bottts/svg?seed=${encodeURIComponent(candidateUsername)}`;
      const dummyPasswordHash = await bcrypt.hash(randomUUID(), 10);

      await db.run(
        'INSERT INTO users (id, username, email, password_hash, avatar, status) VALUES (?, ?, ?, ?, ?, ?)',
        [userId, candidateUsername, trimmedEmail, dummyPasswordHash, avatar, USER_STATUS.ONLINE]
      );

      user = {
        id: userId,
        username: candidateUsername,
        email: trimmedEmail,
        avatar,
        status: USER_STATUS.ONLINE,
        created_at: new Date().toISOString()
      };
    } else {
      // Update status and avatar
      const updatedAvatar = photoURL || user.avatar;
      await db.run('UPDATE users SET status = ?, avatar = ? WHERE id = ?', [USER_STATUS.ONLINE, updatedAvatar, user.id]);
      user.avatar = updatedAvatar;
      user.status = USER_STATUS.ONLINE;
    }

    const secret = process.env.JWT_SECRET || 'super_secret_jwt_key_change_in_production_123456789';
    const expiresIn = process.env.JWT_EXPIRES_IN || '7d';
    const token = jwt.sign({ id: user.id, username: user.username, email: user.email }, secret, { expiresIn });

    return res.json({
      message: 'Login com Google realizado com sucesso!',
      user: {
        id: user.id,
        username: user.username,
        email: user.email,
        avatar: user.avatar,
        status: user.status,
        createdAt: user.created_at
      },
      token
    });
  } catch (err) {
    console.error('Google login error:', err);
    return res.status(500).json({ error: 'Erro ao autenticar com Google.' });
  }
}
