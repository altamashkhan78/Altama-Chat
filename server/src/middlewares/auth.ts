import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import { supabase } from '../config/db';
import { formatUser } from '../utils/mapper';

export interface IUser {
  _id: string;
  id: string;
  username: string;
  email: string;
  displayName: string;
  bio: string;
  avatarUrl: string;
  isVerified: boolean;
  status: string;
  lastSeen: any;
  privacySettings: any;
  publicKey?: string;
}

export interface AuthenticatedRequest extends Request {
  user?: IUser;
  file?: any;
}

const JWT_SECRET = process.env.JWT_SECRET || 'xhat_super_secret_jwt_key_13579';

export const protect = async (
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    let token: string | undefined;

    // Check Authorization header
    if (
      req.headers.authorization &&
      req.headers.authorization.startsWith('Bearer')
    ) {
      token = req.headers.authorization.split(' ')[1];
    }

    if (!token) {
      res.status(401).json({ success: false, message: 'Not authorized, no token provided' });
      return;
    }

    // Verify token
    const decoded = jwt.verify(token, JWT_SECRET) as { id: string };

    // Fetch user from Supabase and attach to request
    const { data: user, error } = await supabase
      .from('users')
      .select('*')
      .eq('id', decoded.id)
      .single();

    if (error || !user) {
      res.status(401).json({ success: false, message: 'Not authorized, user not found' });
      return;
    }

    req.user = formatUser(user) as IUser;
    next();
  } catch (error) {
    res.status(401).json({ success: false, message: 'Not authorized, token validation failed' });
  }
};
