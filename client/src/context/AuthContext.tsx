import React, { createContext, useContext, useState, useEffect } from 'react';
import { api } from '../services/api';
import { generateUserKeyPair } from '../services/e2eCrypto';

export interface UserProfile {
  id: string;
  displayName: string;
  username: string;
  email: string;
  bio: string;
  avatarUrl: string;
  isVerified: boolean;
  status: 'online' | 'offline' | 'away';
  privacySettings?: {
    lastSeen: 'everyone' | 'friends' | 'nobody';
    profilePhoto: 'everyone' | 'friends' | 'nobody';
  };
  publicKey?: string;
}

interface AuthContextType {
  user: UserProfile | null;
  token: string | null;
  loading: boolean;
  login: (emailOrUsername: string, password: string) => Promise<UserProfile>;
  signUp: (displayName: string, username: string, email: string, password: string) => Promise<UserProfile>;
  logout: () => void;
  verifyEmailCode: (code: string) => Promise<void>;
  forgotPasswordEmail: (email: string) => Promise<void>;
  resetPasswordFields: (email: string, code: string, newPassword: string) => Promise<void>;
  updateUserProfile: (displayName: string, bio: string, avatarUrl: string) => Promise<UserProfile>;
  updatePassword: (oldPassword: string, newPassword: string) => Promise<void>;
  updatePrivacy: (lastSeen?: string, profilePhoto?: string) => Promise<void>;
  ensureE2EKeys: (userProfile: UserProfile) => Promise<void>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [user, setUser] = useState<UserProfile | null>(null);
  const [token, setToken] = useState<string | null>(localStorage.getItem('token'));
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchSession = async () => {
      if (!token) {
        setLoading(false);
        return;
      }

      try {
        // Fetch current profile (we can use the update profile route or configure a specific /me route)
        // Let's use user/profile/:userId. For that, we need to know the logged in user's ID.
        // We can decode the JWT token locally or have the login process store the user profile in localStorage.
        const storedUser = localStorage.getItem('user');
        if (storedUser) {
          const parsed = JSON.parse(storedUser);
          setUser(parsed);
          
          // Re-fetch profile to keep it updated
          const res = await api.get(`/users/profile/${parsed.id}`);
          if (res.success) {
            const updatedProfile = { ...parsed, ...res.user };
            setUser(updatedProfile);
            localStorage.setItem('user', JSON.stringify(updatedProfile));
            await ensureE2EKeys(updatedProfile);
          }
        } else {
          // If no stored profile but we have a token, logout to force login
          logout();
        }
      } catch (err) {
        console.error('Session restoration failed:', err);
        logout();
      } finally {
        setLoading(false);
      }
    };

    fetchSession();
  }, [token]);

  const ensureE2EKeys = async (userProfile: UserProfile) => {
    try {
      const storedPublicKey = localStorage.getItem(`xhat_public_key_${userProfile.id}`);
      const storedPrivateKey = localStorage.getItem(`xhat_private_key_${userProfile.id}`);

      // If keys are missing in localStorage OR not yet uploaded to the server
      if (!storedPublicKey || !storedPrivateKey || !userProfile.publicKey) {
        console.log('Cryptographic keys missing. Generating new RSA-OAEP key pair for E2EE...');
        const keys = await generateUserKeyPair();
        
        localStorage.setItem(`xhat_public_key_${userProfile.id}`, keys.publicKey);
        localStorage.setItem(`xhat_private_key_${userProfile.id}`, keys.privateKey);

        // Upload public key to server
        const res = await api.put('/users/privacy', { publicKey: keys.publicKey });
        if (res.success) {
          const updatedUser = { ...userProfile, publicKey: keys.publicKey };
          setUser(updatedUser);
          localStorage.setItem('user', JSON.stringify(updatedUser));
        }
      }
    } catch (err) {
      console.error('Failed to ensure E2E keys:', err);
    }
  };

  const login = async (emailOrUsername: string, password: string): Promise<UserProfile> => {
    const res = await api.post('/auth/login', { emailOrUsername, password });
    if (res.success) {
      localStorage.setItem('token', res.token);
      localStorage.setItem('user', JSON.stringify(res.user));
      setToken(res.token);
      setUser(res.user);
      await ensureE2EKeys(res.user);
      return res.user;
    }
    throw new Error('Login failed');
  };

  const signUp = async (
    displayName: string,
    username: string,
    email: string,
    password: string
  ): Promise<UserProfile> => {
    const res = await api.post('/auth/signup', { displayName, username, email, password });
    if (res.success) {
      localStorage.setItem('token', res.token);
      localStorage.setItem('user', JSON.stringify(res.user));
      setToken(res.token);
      setUser(res.user);
      await ensureE2EKeys(res.user);
      return res.user;
    }
    throw new Error('Registration failed');
  };

  const logout = () => {
    localStorage.removeItem('token');
    localStorage.removeItem('user');
    setToken(null);
    setUser(null);
  };

  const verifyEmailCode = async (code: string): Promise<void> => {
    if (!user) throw new Error('No user logged in');
    const res = await api.post('/auth/verify-email', { userId: user.id, code });
    if (res.success) {
      const updatedUser = { ...user, isVerified: true };
      setUser(updatedUser);
      localStorage.setItem('user', JSON.stringify(updatedUser));
    }
  };

  const forgotPasswordEmail = async (email: string): Promise<void> => {
    await api.post('/auth/forgot-password', { email });
  };

  const resetPasswordFields = async (email: string, code: string, newPassword: string): Promise<void> => {
    await api.post('/auth/reset-password', { email, code, newPassword });
  };

  const updateUserProfile = async (displayName: string, bio: string, avatarUrl: string): Promise<UserProfile> => {
    const res = await api.put('/users/profile', { displayName, bio, avatarUrl });
    if (res.success) {
      const updatedUser = { ...user, ...res.user };
      setUser(updatedUser);
      localStorage.setItem('user', JSON.stringify(updatedUser));
      return updatedUser;
    }
    throw new Error('Profile update failed');
  };

  const updatePassword = async (oldPassword: string, newPassword: string): Promise<void> => {
    await api.put('/users/change-password', { oldPassword, newPassword });
  };

  const updatePrivacy = async (lastSeen?: string, profilePhoto?: string): Promise<void> => {
    if (!user) return;
    const res = await api.put('/users/privacy', { lastSeen, profilePhoto });
    if (res.success) {
      const updatedUser = {
        ...user,
        privacySettings: {
          lastSeen: lastSeen as any || user.privacySettings?.lastSeen || 'everyone',
          profilePhoto: profilePhoto as any || user.privacySettings?.profilePhoto || 'everyone',
        },
      };
      setUser(updatedUser);
      localStorage.setItem('user', JSON.stringify(updatedUser));
    }
  };

  return (
    <AuthContext.Provider
      value={{
        user,
        token,
        loading,
        login,
        signUp,
        logout,
        verifyEmailCode,
        forgotPasswordEmail,
        resetPasswordFields,
        updateUserProfile,
        updatePassword,
        updatePrivacy,
        ensureE2EKeys,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (!context) throw new Error('useAuth must be used within an AuthProvider');
  return context;
};
