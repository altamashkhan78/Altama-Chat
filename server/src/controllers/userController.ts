import { Response, NextFunction } from 'express';
import bcrypt from 'bcryptjs';
import { supabase } from '../config/db';
import { AuthenticatedRequest } from '../middlewares/auth';
import { formatUser } from '../utils/mapper';

export const getProfile = async (req: AuthenticatedRequest, res: Response, next: NextFunction): Promise<void> => {
  try {
    const { userId } = req.params;
    const currentUserId = req.user?._id;

    if (!currentUserId) {
      res.status(401).json({ success: false, message: 'Unauthorized' });
      return;
    }

    const { data: targetUser, error: fetchError } = await supabase
      .from('users')
      .select('*')
      .eq('id', userId)
      .single();

    if (fetchError || !targetUser) {
      res.status(404).json({ success: false, message: 'User not found' });
      return;
    }

    // Check if block relation exists between current user and target user
    const { data: blockedList } = await supabase
      .from('blocked_users')
      .select('*')
      .or(`user_id.eq.${currentUserId},blocked_user_id.eq.${currentUserId},user_id.eq.${userId},blocked_user_id.eq.${userId}`);

    const isBlocked = (blockedList || []).some((rel: any) =>
      (rel.user_id === currentUserId && rel.blocked_user_id === userId) ||
      (rel.user_id === userId && rel.blocked_user_id === currentUserId)
    );

    if (isBlocked) {
      res.status(200).json({
        success: true,
        user: {
          id: targetUser.id,
          _id: targetUser.id,
          displayName: targetUser.display_name || targetUser.displayName || '',
          username: targetUser.username,
          bio: 'Blocked',
          avatarUrl: '',
          status: 'offline',
          lastSeen: null,
          isBlocked: true,
        }
      });
      return;
    }

    const formattedTarget = formatUser(targetUser);

    // Apply privacy settings
    const responseUser: any = {
      id: formattedTarget.id,
      _id: formattedTarget.id,
      displayName: formattedTarget.displayName,
      username: formattedTarget.username,
      bio: formattedTarget.bio,
      publicKey: formattedTarget.publicKey,
    };

    // Profile photo privacy
    if (
      formattedTarget.privacySettings.profilePhoto === 'everyone' ||
      formattedTarget.privacySettings.profilePhoto === 'friends'
    ) {
      responseUser.avatarUrl = formattedTarget.avatarUrl;
    } else {
      responseUser.avatarUrl = '';
    }

    // Last seen privacy
    if (formattedTarget.privacySettings.lastSeen === 'everyone') {
      responseUser.status = formattedTarget.status;
      responseUser.lastSeen = formattedTarget.lastSeen;
    } else {
      responseUser.status = formattedTarget.status === 'online' ? 'online' : 'offline';
      responseUser.lastSeen = null;
    }

    res.status(200).json({
      success: true,
      user: responseUser,
    });
  } catch (error) {
    next(error);
  }
};

export const updateProfile = async (req: AuthenticatedRequest, res: Response, next: NextFunction): Promise<void> => {
  try {
    const { displayName, bio, avatarUrl } = req.body;
    const userId = req.user?._id;

    if (!userId) {
      res.status(401).json({ success: false, message: 'Unauthorized' });
      return;
    }

    const updates: any = {};
    if (displayName) updates.display_name = displayName;
    if (bio !== undefined) updates.bio = bio;
    if (avatarUrl !== undefined) updates.avatar_url = avatarUrl;

    const { data: user, error: updateError } = await supabase
      .from('users')
      .update(updates)
      .eq('id', userId)
      .select()
      .single();

    if (updateError || !user) {
      res.status(500).json({ success: false, message: updateError?.message || 'Error updating profile' });
      return;
    }

    res.status(200).json({
      success: true,
      user: formatUser(user),
    });
  } catch (error) {
    next(error);
  }
};

export const changePassword = async (req: AuthenticatedRequest, res: Response, next: NextFunction): Promise<void> => {
  try {
    const { oldPassword, newPassword } = req.body;
    const userId = req.user?._id;

    if (!userId) {
      res.status(401).json({ success: false, message: 'Unauthorized' });
      return;
    }

    if (!oldPassword || !newPassword) {
      res.status(400).json({ success: false, message: 'Please specify old and new passwords' });
      return;
    }

    const { data: user, error: fetchError } = await supabase
      .from('users')
      .select('*')
      .eq('id', userId)
      .single();

    if (fetchError || !user) {
      res.status(404).json({ success: false, message: 'User not found' });
      return;
    }

    const isMatch = await bcrypt.compare(oldPassword, user.password_hash);
    if (!isMatch) {
      res.status(400).json({ success: false, message: 'Current password is incorrect' });
      return;
    }

    const salt = await bcrypt.genSalt(10);
    const newPasswordHash = await bcrypt.hash(newPassword, salt);

    const { error: updateError } = await supabase
      .from('users')
      .update({ password_hash: newPasswordHash })
      .eq('id', userId);

    if (updateError) {
      res.status(500).json({ success: false, message: updateError.message });
      return;
    }

    res.status(200).json({ success: true, message: 'Password updated successfully' });
  } catch (error) {
    next(error);
  }
};

export const searchUsers = async (req: AuthenticatedRequest, res: Response, next: NextFunction): Promise<void> => {
  try {
    const { query } = req.query;
    const userId = req.user?._id;

    if (!userId) {
      res.status(401).json({ success: false, message: 'Unauthorized' });
      return;
    }

    if (!query || typeof query !== 'string') {
      res.status(200).json({ success: true, users: [] });
      return;
    }

    // Find users whose usernames or display names match, excluding self
    const { data: matchingUsers, error: searchError } = await supabase
      .from('users')
      .select('*')
      .neq('id', userId)
      .or(`username.ilike.%${query}%,display_name.ilike.%${query}%`)
      .limit(15);

    if (searchError || !matchingUsers) {
      res.status(200).json({ success: true, users: [] });
      return;
    }

    // Filter out users who have blocked the caller or whom the caller has blocked
    const { data: blockedRelations } = await supabase
      .from('blocked_users')
      .select('*')
      .or(`user_id.eq.${userId},blocked_user_id.eq.${userId}`);

    const blockedIds = new Set(
      (blockedRelations || []).map((rel: any) =>
        rel.user_id === userId ? rel.blocked_user_id : rel.user_id
      )
    );

    const filteredUsers = matchingUsers
      .filter((u: any) => !blockedIds.has(u.id))
      .map((u: any) => {
        const formatted = formatUser(u);
        return {
          id: formatted.id,
          _id: formatted.id,
          displayName: formatted.displayName,
          username: formatted.username,
          bio: formatted.bio,
          avatarUrl: formatted.privacySettings.profilePhoto === 'nobody' ? '' : formatted.avatarUrl,
          status: formatted.privacySettings.lastSeen === 'everyone' ? formatted.status : 'offline',
          publicKey: formatted.publicKey,
        };
      });

    res.status(200).json({ success: true, users: filteredUsers });
  } catch (error) {
    next(error);
  }
};

export const blockUser = async (req: AuthenticatedRequest, res: Response, next: NextFunction): Promise<void> => {
  try {
    const { targetUserId } = req.body;
    const userId = req.user?._id;

    if (!userId || !targetUserId) {
      res.status(400).json({ success: false, message: 'User identity is missing' });
      return;
    }

    if (userId.toString() === targetUserId.toString()) {
      res.status(400).json({ success: false, message: 'You cannot block yourself' });
      return;
    }

    // Check if block already exists
    const { data: existing } = await supabase
      .from('blocked_users')
      .select('*')
      .eq('user_id', userId)
      .eq('blocked_user_id', targetUserId);

    if (!existing || existing.length === 0) {
      await supabase.from('blocked_users').insert({
        user_id: userId,
        blocked_user_id: targetUserId
      });
    }

    res.status(200).json({ success: true, message: 'User blocked successfully' });
  } catch (error) {
    next(error);
  }
};

export const unblockUser = async (req: AuthenticatedRequest, res: Response, next: NextFunction): Promise<void> => {
  try {
    const { targetUserId } = req.body;
    const userId = req.user?._id;

    if (!userId || !targetUserId) {
      res.status(400).json({ success: false, message: 'User identity is missing' });
      return;
    }

    await supabase
      .from('blocked_users')
      .delete()
      .eq('user_id', userId)
      .eq('blocked_user_id', targetUserId);

    res.status(200).json({ success: true, message: 'User unblocked successfully' });
  } catch (error) {
    next(error);
  }
};

export const getBlockedUsers = async (req: AuthenticatedRequest, res: Response, next: NextFunction): Promise<void> => {
  try {
    const userId = req.user?._id;
    if (!userId) {
      res.status(401).json({ success: false, message: 'Unauthorized' });
      return;
    }

    const { data: blockedList, error: fetchBlockedError } = await supabase
      .from('blocked_users')
      .select('*')
      .eq('user_id', userId);

    if (fetchBlockedError || !blockedList || blockedList.length === 0) {
      res.status(200).json({ success: true, users: [] });
      return;
    }

    const blockedUserIds = blockedList.map((item: any) => item.blocked_user_id);
    const { data: profiles } = await supabase
      .from('users')
      .select('*')
      .in('id', blockedUserIds);

    const users = (profiles || []).map((u: any) => {
      const formatted = formatUser(u);
      return {
        id: formatted.id,
        _id: formatted.id,
        displayName: formatted.displayName,
        username: formatted.username,
        avatarUrl: formatted.avatarUrl,
      };
    });

    res.status(200).json({ success: true, users });
  } catch (error) {
    next(error);
  }
};

export const updatePrivacySettings = async (req: AuthenticatedRequest, res: Response, next: NextFunction): Promise<void> => {
  try {
    const { lastSeen, profilePhoto, publicKey } = req.body;
    const userId = req.user?._id;

    if (!userId) {
      res.status(401).json({ success: false, message: 'Unauthorized' });
      return;
    }

    const { data: user, error: fetchError } = await supabase
      .from('users')
      .select('*')
      .eq('id', userId)
      .single();

    if (fetchError || !user) {
      res.status(404).json({ success: false, message: 'User not found' });
      return;
    }

    const currentPrivacy = typeof user.privacy_settings === 'string'
      ? JSON.parse(user.privacy_settings)
      : (user.privacy_settings || { lastSeen: 'everyone', profilePhoto: 'everyone' });

    if (lastSeen) currentPrivacy.lastSeen = lastSeen;
    if (profilePhoto) currentPrivacy.profilePhoto = profilePhoto;

    const updates: any = { privacy_settings: currentPrivacy };
    if (publicKey !== undefined) updates.public_key = publicKey;

    const { data: updatedUser, error: updateError } = await supabase
      .from('users')
      .update(updates)
      .eq('id', userId)
      .select()
      .single();

    if (updateError || !updatedUser) {
      res.status(500).json({ success: false, message: updateError?.message || 'Error updating settings' });
      return;
    }

    const formatted = formatUser(updatedUser);

    res.status(200).json({
      success: true,
      privacySettings: formatted.privacySettings,
      publicKey: formatted.publicKey,
    });
  } catch (error) {
    next(error);
  }
};
