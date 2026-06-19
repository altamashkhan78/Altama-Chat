import { Request, Response, NextFunction } from 'express';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { supabase } from '../config/db';
import { formatUser } from '../utils/mapper';

const JWT_SECRET = process.env.JWT_SECRET || 'xhat_super_secret_jwt_key_13579';

const generateToken = (id: string): string => {
  return jwt.sign({ id }, JWT_SECRET, { expiresIn: '30d' });
};

const generateVerificationCode = (): string => {
  return Math.floor(100000 + Math.random() * 900000).toString();
};

export const signUp = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const { displayName, username, email, password } = req.body;

    if (!displayName || !username || !email || !password) {
      res.status(400).json({ success: false, message: 'Please provide all required fields' });
      return;
    }

    const lowerEmail = email.toLowerCase().trim();
    const lowerUsername = username.toLowerCase().trim();

    // Check if user exists
    const { data: existingUsers } = await supabase
      .from('users')
      .select('*')
      .or(`email.eq.${lowerEmail},username.eq.${lowerUsername}`);

    if (existingUsers && existingUsers.length > 0) {
      res.status(400).json({
        success: false,
        message: 'A user with that email or username already exists',
      });
      return;
    }

    // Hash password
    const salt = await bcrypt.genSalt(10);
    const passwordHash = await bcrypt.hash(password, salt);

    // Create verification code
    const verificationCode = generateVerificationCode();

    // Create user
    const { data: user, error } = await supabase
      .from('users')
      .insert({
        display_name: displayName,
        username: lowerUsername,
        email: lowerEmail,
        password_hash: passwordHash,
        verification_code: verificationCode,
        is_verified: false,
      })
      .select()
      .single();

    if (error || !user) {
      res.status(500).json({ success: false, message: error?.message || 'Error creating user' });
      return;
    }

    // Mock Email Send
    console.log('\n--- [MOCK EMAIL SERVICE] ---');
    console.log(`To: ${user.email}`);
    console.log(`Subject: Verify your Altma Chat Account`);
    console.log(`Body: Hello ${user.display_name}, your verification code is: ${verificationCode}`);
    console.log('-----------------------------\n');

    const token = generateToken(user.id);

    res.status(201).json({
      success: true,
      token,
      user: formatUser(user),
    });
  } catch (error) {
    next(error);
  }
};

export const login = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const { emailOrUsername, password } = req.body;

    if (!emailOrUsername || !password) {
      res.status(400).json({ success: false, message: 'Please provide credentials' });
      return;
    }

    const cleanInput = emailOrUsername.toLowerCase().trim();

    // Find user by email or username
    const { data: user, error } = await supabase
      .from('users')
      .select('*')
      .or(`email.eq.${cleanInput},username.eq.${cleanInput}`)
      .single();

    if (error || !user) {
      res.status(401).json({ success: false, message: 'Invalid username/email or password' });
      return;
    }

    // Match password
    const isMatch = await bcrypt.compare(password, user.password_hash);
    if (!isMatch) {
      res.status(401).json({ success: false, message: 'Invalid username/email or password' });
      return;
    }

    const token = generateToken(user.id);

    res.status(200).json({
      success: true,
      token,
      user: formatUser(user),
    });
  } catch (error) {
    next(error);
  }
};

export const verifyEmail = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const { userId, code } = req.body;

    if (!userId || !code) {
      res.status(400).json({ success: false, message: 'User ID and verification code are required' });
      return;
    }

    const { data: user, error } = await supabase
      .from('users')
      .select('*')
      .eq('id', userId)
      .single();

    if (error || !user) {
      res.status(404).json({ success: false, message: 'User not found' });
      return;
    }

    if (user.is_verified) {
      res.status(400).json({ success: false, message: 'User is already verified' });
      return;
    }

    if (user.verification_code !== code) {
      res.status(400).json({ success: false, message: 'Invalid verification code' });
      return;
    }

    // Set as verified
    const { error: updateError } = await supabase
      .from('users')
      .update({
        is_verified: true,
        verification_code: null,
      })
      .eq('id', userId);

    if (updateError) {
      res.status(500).json({ success: false, message: updateError.message });
      return;
    }

    res.status(200).json({
      success: true,
      message: 'Account verified successfully',
    });
  } catch (error) {
    next(error);
  }
};

export const forgotPassword = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const { email } = req.body;

    if (!email) {
      res.status(400).json({ success: false, message: 'Please provide email' });
      return;
    }

    const cleanEmail = email.toLowerCase().trim();
    const { data: user, error } = await supabase
      .from('users')
      .select('*')
      .eq('email', cleanEmail)
      .single();

    if (error || !user) {
      // Respond success for security to avoid email enumeration
      res.status(200).json({
        success: true,
        message: 'If that email exists, we sent a password reset code.',
      });
      return;
    }

    const code = generateVerificationCode();
    const { error: updateError } = await supabase
      .from('users')
      .update({ verification_code: code })
      .eq('id', user.id);

    if (updateError) {
      res.status(500).json({ success: false, message: updateError.message });
      return;
    }

    // Mock Email Send
    console.log('\n--- [MOCK EMAIL SERVICE: PASSWORD RESET] ---');
    console.log(`To: ${user.email}`);
    console.log(`Subject: Reset your Altma Chat Password`);
    console.log(`Body: Hello ${user.display_name || user.displayName}, your password reset code is: ${code}`);
    console.log('--------------------------------------------\n');

    res.status(200).json({
      success: true,
      message: 'If that email exists, we sent a password reset code.',
    });
  } catch (error) {
    next(error);
  }
};

export const resetPassword = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const { email, code, newPassword } = req.body;

    if (!email || !code || !newPassword) {
      res.status(400).json({ success: false, message: 'All fields are required' });
      return;
    }

    const cleanEmail = email.toLowerCase().trim();
    const { data: user, error } = await supabase
      .from('users')
      .select('*')
      .eq('email', cleanEmail)
      .single();

    if (error || !user || user.verification_code !== code) {
      res.status(400).json({ success: false, message: 'Invalid email or reset code' });
      return;
    }

    // Hash new password
    const salt = await bcrypt.genSalt(10);
    const passwordHash = await bcrypt.hash(newPassword, salt);

    const { error: updateError } = await supabase
      .from('users')
      .update({
        password_hash: passwordHash,
        verification_code: null,
      })
      .eq('id', user.id);

    if (updateError) {
      res.status(500).json({ success: false, message: updateError.message });
      return;
    }

    res.status(200).json({
      success: true,
      message: 'Password reset successfully. You can now login with your new password.',
    });
  } catch (error) {
    next(error);
  }
};
