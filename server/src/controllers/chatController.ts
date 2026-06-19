import { Response, NextFunction } from 'express';
import { supabase } from '../config/db';
import { AuthenticatedRequest } from '../middlewares/auth';
import { formatConversation } from '../utils/mapper';

export const getOrCreateConversation = async (req: AuthenticatedRequest, res: Response, next: NextFunction): Promise<void> => {
  try {
    const { recipientId } = req.body;
    const userId = req.user?._id;

    if (!userId || !recipientId) {
      res.status(400).json({ success: false, message: 'Recipient ID is required' });
      return;
    }

    if (userId.toString() === recipientId.toString()) {
      res.status(400).json({ success: false, message: 'You cannot chat with yourself' });
      return;
    }

    // Check if either user has blocked the other
    const { data: blockedList } = await supabase
      .from('blocked_users')
      .select('*')
      .or(`user_id.eq.${userId},blocked_user_id.eq.${userId},user_id.eq.${recipientId},blocked_user_id.eq.${recipientId}`);

    const isBlocked = (blockedList || []).some((rel: any) =>
      (rel.user_id === userId && rel.blocked_user_id === recipientId) ||
      (rel.user_id === recipientId && rel.blocked_user_id === userId)
    );

    if (isBlocked) {
      res.status(403).json({ success: false, message: 'Cannot start conversation. Blocking relation exists.' });
      return;
    }

    // Check if conversation already exists (contains both participants and has length 2)
    const { data: conversationList } = await supabase
      .from('conversations')
      .select('*')
      .contains('participants', [userId, recipientId]);

    let conversation = (conversationList || []).find((c: any) => c.participants.length === 2);

    if (!conversation) {
      // Create new conversation
      const { data: newConv, error: createError } = await supabase
        .from('conversations')
        .insert({
          participants: [userId, recipientId],
          pinned_by: [],
          archived_by: [],
          e2e_enabled: false
        })
        .select()
        .single();

      if (createError || !newConv) {
        res.status(500).json({ success: false, message: createError?.message || 'Error creating conversation' });
        return;
      }
      conversation = newConv;
    }

    // Populate participant details
    const { data: participantsDetails } = await supabase
      .from('users')
      .select('*')
      .in('id', conversation.participants);
    conversation.participants_details = participantsDetails || [];

    // Populate last message details
    if (conversation.last_message_id) {
      const { data: lastMsg } = await supabase
        .from('messages')
        .select('*')
        .eq('id', conversation.last_message_id)
        .single();

      if (lastMsg) {
        const { data: senderDetails } = await supabase
          .from('users')
          .select('*')
          .eq('id', lastMsg.sender_id)
          .single();
        lastMsg.sender_details = senderDetails;
        conversation.last_message_details = lastMsg;
      }
    }

    res.status(200).json({
      success: true,
      conversation: formatConversation(conversation, userId)
    });
  } catch (error) {
    next(error);
  }
};

export const getConversations = async (req: AuthenticatedRequest, res: Response, next: NextFunction): Promise<void> => {
  try {
    const userId = req.user?._id;
    if (!userId) {
      res.status(401).json({ success: false, message: 'Unauthorized' });
      return;
    }

    // Find all conversations containing this user
    const { data: conversations, error: fetchError } = await supabase
      .from('conversations')
      .select('*')
      .contains('participants', [userId]);

    if (fetchError || !conversations || conversations.length === 0) {
      res.status(200).json({ success: true, conversations: [] });
      return;
    }

    // Batch fetch details
    const allParticipantIds = Array.from(new Set(conversations.flatMap((c: any) => c.participants)));
    const allLastMessageIds = conversations.map((c: any) => c.last_message_id).filter(Boolean);

    let allUsers: any[] = [];
    if (allParticipantIds.length > 0) {
      const { data } = await supabase.from('users').select('*').in('id', allParticipantIds);
      allUsers = data || [];
    }

    let allMessages: any[] = [];
    if (allLastMessageIds.length > 0) {
      const { data } = await supabase.from('messages').select('*').in('id', allLastMessageIds);
      allMessages = data || [];
    }

    // Attach sender details to last messages
    const allMsgSenderIds = Array.from(new Set(allMessages.map(m => m.sender_id)));
    let allMsgSenders: any[] = [];
    if (allMsgSenderIds.length > 0) {
      const { data } = await supabase.from('users').select('*').in('id', allMsgSenderIds);
      allMsgSenders = data || [];
    }

    allMessages.forEach(m => {
      m.sender_details = allMsgSenders.find(u => u.id === m.sender_id);
    });

    // Populate relation items inside conversations
    conversations.forEach((c: any) => {
      c.participants_details = c.participants.map((pid: string) => allUsers.find(u => u.id === pid)).filter(Boolean);
      if (c.last_message_id) {
        c.last_message_details = allMessages.find(m => m.id === c.last_message_id);
      }
    });

    // Filter out conversations with blocked users
    const { data: blockedRelations } = await supabase
      .from('blocked_users')
      .select('*')
      .or(`user_id.eq.${userId},blocked_user_id.eq.${userId}`);

    const blockedIds = new Set(
      (blockedRelations || []).map((rel: any) =>
        rel.user_id === userId ? rel.blocked_user_id : rel.user_id
      )
    );

    const filteredConversations = conversations.filter((conv: any) => {
      const recipient = conv.participants.find((p: string) => p !== userId);
      if (!recipient) return true;
      return !blockedIds.has(recipient);
    });

    // Sort by updated_at descending
    filteredConversations.sort((a: any, b: any) => {
      return new Date(b.updated_at).getTime() - new Date(a.updated_at).getTime();
    });

    // Format response
    const formatted = filteredConversations.map((conv: any) => formatConversation(conv, userId));

    res.status(200).json({
      success: true,
      conversations: formatted
    });
  } catch (error) {
    next(error);
  }
};

export const togglePin = async (req: AuthenticatedRequest, res: Response, next: NextFunction): Promise<void> => {
  try {
    const { conversationId } = req.params;
    const userId = req.user?._id;

    if (!userId) {
      res.status(401).json({ success: false, message: 'Unauthorized' });
      return;
    }

    const { data: conversation, error: fetchError } = await supabase
      .from('conversations')
      .select('*')
      .eq('id', conversationId)
      .single();

    if (fetchError || !conversation) {
      res.status(404).json({ success: false, message: 'Conversation not found' });
      return;
    }

    const pinnedBy = conversation.pinned_by || [];
    const pinnedIndex = pinnedBy.indexOf(userId);

    if (pinnedIndex > -1) {
      pinnedBy.splice(pinnedIndex, 1);
    } else {
      pinnedBy.push(userId);
    }

    const { error: updateError } = await supabase
      .from('conversations')
      .update({ pinned_by: pinnedBy })
      .eq('id', conversationId);

    if (updateError) {
      res.status(500).json({ success: false, message: updateError.message });
      return;
    }

    res.status(200).json({
      success: true,
      message: pinnedIndex > -1 ? 'Conversation unpinned' : 'Conversation pinned',
      isPinned: pinnedIndex === -1
    });
  } catch (error) {
    next(error);
  }
};

export const toggleArchive = async (req: AuthenticatedRequest, res: Response, next: NextFunction): Promise<void> => {
  try {
    const { conversationId } = req.params;
    const userId = req.user?._id;

    if (!userId) {
      res.status(401).json({ success: false, message: 'Unauthorized' });
      return;
    }

    const { data: conversation, error: fetchError } = await supabase
      .from('conversations')
      .select('*')
      .eq('id', conversationId)
      .single();

    if (fetchError || !conversation) {
      res.status(404).json({ success: false, message: 'Conversation not found' });
      return;
    }

    const archivedBy = conversation.archived_by || [];
    const archivedIndex = archivedBy.indexOf(userId);

    if (archivedIndex > -1) {
      archivedBy.splice(archivedIndex, 1);
    } else {
      archivedBy.push(userId);
    }

    const { error: updateError } = await supabase
      .from('conversations')
      .update({ archived_by: archivedBy })
      .eq('id', conversationId);

    if (updateError) {
      res.status(500).json({ success: false, message: updateError.message });
      return;
    }

    res.status(200).json({
      success: true,
      message: archivedIndex > -1 ? 'Conversation unarchived' : 'Conversation archived',
      isArchived: archivedIndex === -1
    });
  } catch (error) {
    next(error);
  }
};

export const initiateE2EExchange = async (req: AuthenticatedRequest, res: Response, next: NextFunction): Promise<void> => {
  try {
    const { conversationId, publicKey } = req.body;
    const userId = req.user?._id;

    if (!userId || !conversationId || !publicKey) {
      res.status(400).json({ success: false, message: 'Parameters missing' });
      return;
    }

    const { data: conversation, error: fetchError } = await supabase
      .from('conversations')
      .select('*')
      .eq('id', conversationId)
      .single();

    if (fetchError || !conversation) {
      res.status(404).json({ success: false, message: 'Conversation not found' });
      return;
    }

    const exchange = {
      initiator: userId,
      initiatorPublicKey: publicKey,
      responderPublicKey: null
    };

    const { data: updatedConv, error: updateError } = await supabase
      .from('conversations')
      .update({
        e2e_key_exchange: exchange,
        e2e_enabled: true
      })
      .eq('id', conversationId)
      .select()
      .single();

    if (updateError || !updatedConv) {
      res.status(500).json({ success: false, message: updateError?.message || 'Error initiating exchange' });
      return;
    }

    // Populate participant details for formatting
    const { data: participantsDetails } = await supabase
      .from('users')
      .select('*')
      .in('id', updatedConv.participants);
    updatedConv.participants_details = participantsDetails || [];

    res.status(200).json({
      success: true,
      conversation: formatConversation(updatedConv, userId)
    });
  } catch (error) {
    next(error);
  }
};

export const completeE2EExchange = async (req: AuthenticatedRequest, res: Response, next: NextFunction): Promise<void> => {
  try {
    const { conversationId, publicKey } = req.body;
    const userId = req.user?._id;

    if (!userId || !conversationId || !publicKey) {
      res.status(400).json({ success: false, message: 'Parameters missing' });
      return;
    }

    const { data: conversation, error: fetchError } = await supabase
      .from('conversations')
      .select('*')
      .eq('id', conversationId)
      .single();

    if (fetchError || !conversation || !conversation.e2e_key_exchange) {
      res.status(404).json({ success: false, message: 'Conversation or key exchange sequence not found' });
      return;
    }

    const exchange = typeof conversation.e2e_key_exchange === 'string'
      ? JSON.parse(conversation.e2e_key_exchange)
      : conversation.e2e_key_exchange;

    exchange.responderPublicKey = publicKey;

    const { data: updatedConv, error: updateError } = await supabase
      .from('conversations')
      .update({ e2e_key_exchange: exchange })
      .eq('id', conversationId)
      .select()
      .single();

    if (updateError || !updatedConv) {
      res.status(500).json({ success: false, message: updateError?.message || 'Error completing exchange' });
      return;
    }

    // Populate participant details for formatting
    const { data: participantsDetails } = await supabase
      .from('users')
      .select('*')
      .in('id', updatedConv.participants);
    updatedConv.participants_details = participantsDetails || [];

    res.status(200).json({
      success: true,
      conversation: formatConversation(updatedConv, userId)
    });
  } catch (error) {
    next(error);
  }
};
