import { Response, NextFunction } from 'express';
import { supabase } from '../config/db';
import { AuthenticatedRequest } from '../middlewares/auth';
import { emitToUser } from '../services/socketService';
import { formatMessage } from '../utils/mapper';

export const sendMessage = async (req: AuthenticatedRequest, res: Response, next: NextFunction): Promise<void> => {
  try {
    const { conversationId, content, messageType, fileUrl, fileName, fileSize, mimeType, replyTo, iv } = req.body;
    const userId = req.user?._id;

    if (!userId || !conversationId || (!content && !fileUrl)) {
      res.status(400).json({ success: false, message: 'Invalid message parameters' });
      return;
    }

    const { data: conversation, error: fetchConvError } = await supabase
      .from('conversations')
      .select('*')
      .eq('id', conversationId)
      .single();

    if (fetchConvError || !conversation) {
      res.status(404).json({ success: false, message: 'Conversation not found' });
      return;
    }

    // Get recipient
    const recipientId = conversation.participants.find((p: string) => p !== userId);
    if (!recipientId) {
      res.status(400).json({ success: false, message: 'Recipient not found in conversation' });
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
      res.status(403).json({ success: false, message: 'Cannot send message. User block active.' });
      return;
    }

    // Create Message
    const { data: message, error: createError } = await supabase
      .from('messages')
      .insert({
        conversation_id: conversationId,
        sender_id: userId,
        content: content || '',
        message_type: messageType || 'text',
        file_url: fileUrl,
        file_name: fileName,
        file_size: fileSize,
        mime_type: mimeType,
        reply_to_id: replyTo,
        iv,
        delivered_to: [userId], // sender has received it
        read_by: [userId]
      })
      .select()
      .single();

    if (createError || !message) {
      res.status(500).json({ success: false, message: createError?.message || 'Error creating message' });
      return;
    }

    // Update conversation last message
    await supabase
      .from('conversations')
      .update({ last_message_id: message.id })
      .eq('id', conversationId);

    // Populate sender details
    const { data: senderDetails } = await supabase
      .from('users')
      .select('*')
      .eq('id', message.sender_id)
      .single();
    message.sender_details = senderDetails;

    // Populate reply message details if present
    if (message.reply_to_id) {
      const { data: replyMsg } = await supabase
        .from('messages')
        .select('*')
        .eq('id', message.reply_to_id)
        .single();

      if (replyMsg) {
        const { data: replySender } = await supabase
          .from('users')
          .select('*')
          .eq('id', replyMsg.sender_id)
          .single();
        replyMsg.sender_details = replySender;
        message.reply_to_details = replyMsg;
      }
    }

    const formattedMessage = formatMessage(message);

    // Emit Socket.IO message event to recipient
    emitToUser(recipientId, 'new_message', formattedMessage);

    res.status(201).json({
      success: true,
      message: formattedMessage
    });
  } catch (error) {
    next(error);
  }
};

export const getMessages = async (req: AuthenticatedRequest, res: Response, next: NextFunction): Promise<void> => {
  try {
    const { conversationId } = req.params;
    const { limit = 50, before } = req.query;
    const userId = req.user?._id;

    if (!userId || !conversationId) {
      res.status(400).json({ success: false, message: 'Parameters missing' });
      return;
    }

    // Verify conversation access
    const { data: conversation, error: fetchConvError } = await supabase
      .from('conversations')
      .select('*')
      .eq('id', conversationId)
      .single();

    if (fetchConvError || !conversation || !conversation.participants.includes(userId)) {
      res.status(403).json({ success: false, message: 'Access denied' });
      return;
    }

    // Pagination query
    let queryBuilder = supabase
      .from('messages')
      .select('*')
      .eq('conversation_id', conversationId);

    if (before) {
      queryBuilder = queryBuilder.lt('created_at', before);
    }

    const { data: rawMessages, error: fetchError } = await queryBuilder
      .order('created_at', { ascending: false })
      .limit(Number(limit));

    if (fetchError || !rawMessages) {
      res.status(200).json({ success: true, messages: [] });
      return;
    }

    // Exclude messages deleted for caller
    const messages = rawMessages.filter((m: any) => !(m.deleted_for || []).includes(userId));

    // Populate sender details and reply details
    const senderIds = Array.from(new Set(messages.map((m: any) => m.sender_id)));
    let senders: any[] = [];
    if (senderIds.length > 0) {
      const { data } = await supabase.from('users').select('*').in('id', senderIds);
      senders = data || [];
    }

    const replyMsgIds = messages.map((m: any) => m.reply_to_id).filter(Boolean);
    let replyMsgs: any[] = [];
    if (replyMsgIds.length > 0) {
      const { data } = await supabase.from('messages').select('*').in('id', replyMsgIds);
      replyMsgs = data || [];
    }

    const replySenderIds = Array.from(new Set(replyMsgs.map((m: any) => m.sender_id)));
    let replySenders: any[] = [];
    if (replySenderIds.length > 0) {
      const { data } = await supabase.from('users').select('*').in('id', replySenderIds);
      replySenders = data || [];
    }

    replyMsgs.forEach((rm: any) => {
      rm.sender_details = replySenders.find((u: any) => u.id === rm.sender_id);
    });

    messages.forEach((m: any) => {
      m.sender_details = senders.find((u: any) => u.id === m.sender_id);
      if (m.reply_to_id) {
        m.reply_to_details = replyMsgs.find((rm: any) => rm.id === m.reply_to_id);
      }
    });

    // Mark these messages as read by current user (if not already read)
    const unreadMessages = messages.filter((msg: any) =>
      msg.sender_id !== userId && !(msg.read_by || []).includes(userId)
    );

    if (unreadMessages.length > 0) {
      const unreadMessageIds = unreadMessages.map((m: any) => m.id);

      for (const msg of unreadMessages) {
        const readBy = Array.from(new Set([...(msg.read_by || []), userId]));
        await supabase
          .from('messages')
          .update({ read_by: readBy })
          .eq('id', msg.id);
      }

      // Emit read receipts back to recipient
      const recipientId = conversation.participants.find((p: string) => p !== userId);
      if (recipientId) {
        emitToUser(recipientId, 'messages_read', {
          conversationId,
          readBy: userId,
          messageIds: unreadMessageIds
        });
      }
    }

    // Reverse messages to return chronological order
    const chronologicalMessages = messages.map(formatMessage).reverse();

    res.status(200).json({
      success: true,
      messages: chronologicalMessages
    });
  } catch (error) {
    next(error);
  }
};

export const editMessage = async (req: AuthenticatedRequest, res: Response, next: NextFunction): Promise<void> => {
  try {
    const { messageId } = req.params;
    const { newContent } = req.body;
    const userId = req.user?._id;

    if (!userId || !messageId || !newContent) {
      res.status(400).json({ success: false, message: 'Invalid payload' });
      return;
    }

    const { data: message, error: fetchError } = await supabase
      .from('messages')
      .select('*')
      .eq('id', messageId)
      .single();

    if (fetchError || !message) {
      res.status(404).json({ success: false, message: 'Message not found' });
      return;
    }

    // Verify sender
    if (message.sender_id !== userId) {
      res.status(403).json({ success: false, message: 'You can only edit your own messages' });
      return;
    }

    const updates: any = {
      content: newContent,
      is_edited: true
    };
    if (req.body.iv) {
      updates.iv = req.body.iv;
    }

    const { data: updatedMsg, error: updateError } = await supabase
      .from('messages')
      .update(updates)
      .eq('id', messageId)
      .select()
      .single();

    if (updateError || !updatedMsg) {
      res.status(500).json({ success: false, message: updateError?.message || 'Error updating message' });
      return;
    }

    // Populate sender details
    const { data: senderDetails } = await supabase
      .from('users')
      .select('*')
      .eq('id', updatedMsg.sender_id)
      .single();
    updatedMsg.sender_details = senderDetails;

    // Populate reply message details if present
    if (updatedMsg.reply_to_id) {
      const { data: replyMsg } = await supabase
        .from('messages')
        .select('*')
        .eq('id', updatedMsg.reply_to_id)
        .single();

      if (replyMsg) {
        const { data: replySender } = await supabase
          .from('users')
          .select('*')
          .eq('id', replyMsg.sender_id)
          .single();
        replyMsg.sender_details = replySender;
        updatedMsg.reply_to_details = replyMsg;
      }
    }

    const formatted = formatMessage(updatedMsg);

    // Notify other user
    const { data: conversation } = await supabase
      .from('conversations')
      .select('*')
      .eq('id', updatedMsg.conversation_id)
      .single();

    const recipientId = conversation?.participants.find((p: string) => p !== userId);
    if (recipientId) {
      emitToUser(recipientId, 'message_edited', formatted);
    }

    res.status(200).json({ success: true, message: formatted });
  } catch (error) {
    next(error);
  }
};

export const deleteMessage = async (req: AuthenticatedRequest, res: Response, next: NextFunction): Promise<void> => {
  try {
    const { messageId } = req.params;
    const { deleteForAll } = req.body; // boolean
    const userId = req.user?._id;

    if (!userId || !messageId) {
      res.status(400).json({ success: false, message: 'Params missing' });
      return;
    }

    const { data: message, error: fetchError } = await supabase
      .from('messages')
      .select('*')
      .eq('id', messageId)
      .single();

    if (fetchError || !message) {
      res.status(404).json({ success: false, message: 'Message not found' });
      return;
    }

    const { data: conversation } = await supabase
      .from('conversations')
      .select('*')
      .eq('id', message.conversation_id)
      .single();

    const recipientId = conversation?.participants.find((p: string) => p !== userId);

    if (deleteForAll) {
      // Must be sender
      if (message.sender_id !== userId) {
        res.status(403).json({ success: false, message: 'Only the sender can delete a message for everyone' });
        return;
      }

      const { error: updateError } = await supabase
        .from('messages')
        .update({
          content: 'This message was deleted.',
          deleted_for_all: true,
          file_url: null,
          file_name: null,
          file_size: null,
          mime_type: null
        })
        .eq('id', messageId);

      if (updateError) {
        res.status(500).json({ success: false, message: updateError.message });
        return;
      }

      // Emit to recipient
      if (recipientId) {
        emitToUser(recipientId, 'message_deleted', {
          messageId,
          deletedForAll: true
        });
      }
    } else {
      // Just delete for this user
      const deletedFor = Array.from(new Set([...(message.deleted_for || []), userId]));
      const { error: updateError } = await supabase
        .from('messages')
        .update({ deleted_for: deletedFor })
        .eq('id', messageId);

      if (updateError) {
        res.status(500).json({ success: false, message: updateError.message });
        return;
      }
    }

    res.status(200).json({ success: true, message: 'Message deleted successfully' });
  } catch (error) {
    next(error);
  }
};

export const forwardMessage = async (req: AuthenticatedRequest, res: Response, next: NextFunction): Promise<void> => {
  try {
    const { targetConversationId, sourceMessageId } = req.body;
    const userId = req.user?._id;

    if (!userId || !targetConversationId || !sourceMessageId) {
      res.status(400).json({ success: false, message: 'Params missing' });
      return;
    }

    const { data: sourceMessage, error: fetchSrcError } = await supabase
      .from('messages')
      .select('*')
      .eq('id', sourceMessageId)
      .single();

    if (fetchSrcError || !sourceMessage || sourceMessage.deleted_for_all) {
      res.status(404).json({ success: false, message: 'Original message not found' });
      return;
    }

    const { data: targetConversation, error: fetchTargetError } = await supabase
      .from('conversations')
      .select('*')
      .eq('id', targetConversationId)
      .single();

    if (fetchTargetError || !targetConversation) {
      res.status(404).json({ success: false, message: 'Target conversation not found' });
      return;
    }

    // Create forwarded message
    const { data: newMessage, error: createError } = await supabase
      .from('messages')
      .insert({
        conversation_id: targetConversationId,
        sender_id: userId,
        content: sourceMessage.content,
        message_type: sourceMessage.message_type,
        file_url: sourceMessage.file_url,
        file_name: sourceMessage.file_name,
        file_size: sourceMessage.file_size,
        mime_type: sourceMessage.mime_type,
        is_forwarded: true,
        delivered_to: [userId],
        read_by: [userId],
        iv: sourceMessage.iv
      })
      .select()
      .single();

    if (createError || !newMessage) {
      res.status(500).json({ success: false, message: createError?.message || 'Error creating forwarded message' });
      return;
    }

    // Update conversation last message
    await supabase
      .from('conversations')
      .update({ last_message_id: newMessage.id })
      .eq('id', targetConversationId);

    // Populate sender details
    const { data: senderDetails } = await supabase
      .from('users')
      .select('*')
      .eq('id', newMessage.sender_id)
      .single();
    newMessage.sender_details = senderDetails;

    const formatted = formatMessage(newMessage);

    // Notify recipient of target conversation
    const recipientId = targetConversation.participants.find((p: string) => p !== userId);
    if (recipientId) {
      emitToUser(recipientId, 'new_message', formatted);
    }

    res.status(201).json({ success: true, message: formatted });
  } catch (error) {
    next(error);
  }
};

export const searchMessages = async (req: AuthenticatedRequest, res: Response, next: NextFunction): Promise<void> => {
  try {
    const { conversationId } = req.params;
    const { query } = req.query;
    const userId = req.user?._id;

    if (!userId || !conversationId || !query) {
      res.status(400).json({ success: false, message: 'Parameters missing' });
      return;
    }

    // Check conversation access
    const { data: conversation, error: fetchConvError } = await supabase
      .from('conversations')
      .select('*')
      .eq('id', conversationId)
      .single();

    if (fetchConvError || !conversation || !conversation.participants.includes(userId)) {
      res.status(403).json({ success: false, message: 'Access denied' });
      return;
    }

    // Perform database regex search on message content
    const { data: rawMessages, error: searchError } = await supabase
      .from('messages')
      .select('*')
      .eq('conversation_id', conversationId)
      .eq('deleted_for_all', false)
      .ilike('content', `%${query}%`)
      .order('created_at', { ascending: false })
      .limit(100);

    if (searchError || !rawMessages) {
      res.status(200).json({ success: true, messages: [] });
      return;
    }

    const filtered = rawMessages.filter((m: any) => !(m.deleted_for || []).includes(userId));

    // Populate sender details
    const senderIds = Array.from(new Set(filtered.map((m: any) => m.sender_id)));
    let senders: any[] = [];
    if (senderIds.length > 0) {
      const { data } = await supabase.from('users').select('*').in('id', senderIds);
      senders = data || [];
    }
    filtered.forEach((m: any) => {
      m.sender_details = senders.find((u: any) => u.id === m.sender_id);
    });

    const messages = filtered.map(formatMessage);

    res.status(200).json({ success: true, messages });
  } catch (error) {
    next(error);
  }
};
