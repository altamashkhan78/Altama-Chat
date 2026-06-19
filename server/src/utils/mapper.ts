export function formatUser(u: any): any {
  if (!u) return null;
  return {
    id: u.id,
    _id: u.id,
    username: u.username,
    email: u.email,
    displayName: u.display_name || u.displayName,
    bio: u.bio,
    avatarUrl: u.avatar_url || u.avatarUrl || '',
    isVerified: u.is_verified ?? u.isVerified ?? false,
    status: u.status || 'offline',
    lastSeen: u.last_seen || u.lastSeen,
    privacySettings: typeof u.privacy_settings === 'string' 
      ? JSON.parse(u.privacy_settings) 
      : (u.privacy_settings || u.privacySettings || { lastSeen: 'everyone', profilePhoto: 'everyone' }),
    publicKey: u.public_key || u.publicKey || '',
    createdAt: u.created_at || u.createdAt,
    updatedAt: u.updated_at || u.updatedAt
  };
}

export function formatConversation(c: any, userId?: string): any {
  if (!c) return null;
  const isPinned = c.pinned_by?.includes(userId) || c.pinnedBy?.includes(userId) || false;
  const isArchived = c.archived_by?.includes(userId) || c.archivedBy?.includes(userId) || false;
  
  // Resolve participants details
  const pDetails = c.participants_details || c.participants;
  const participantsList = Array.isArray(pDetails) ? pDetails.map(formatUser) : [];
  const recipient = participantsList.find((p: any) => p && p.id !== userId);

  // Apply privacy settings on recipient
  let formattedRecipient = null;
  if (recipient) {
    formattedRecipient = {
      id: recipient.id,
      _id: recipient.id,
      displayName: recipient.displayName,
      username: recipient.username,
      avatarUrl: recipient.privacySettings?.profilePhoto === 'nobody' ? '' : recipient.avatarUrl,
      status: recipient.privacySettings?.lastSeen === 'everyone' ? recipient.status : 'offline',
      lastSeen: recipient.privacySettings?.lastSeen === 'everyone' ? recipient.lastSeen : null,
      publicKey: recipient.publicKey
    };
  }

  // Get last message details
  const lastMsgDetails = c.last_message_details || c.lastMessage;
  const lastMessage = lastMsgDetails && typeof lastMsgDetails === 'object'
    ? formatMessage(lastMsgDetails)
    : (c.last_message_id || c.lastMessage || null);

  return {
    id: c.id,
    _id: c.id,
    participants: participantsList.map((p: any) => ({
      id: p.id,
      _id: p.id,
      displayName: p.displayName,
      username: p.username,
      avatarUrl: p.privacySettings?.profilePhoto === 'nobody' ? '' : p.avatarUrl,
    })),
    recipient: formattedRecipient,
    lastMessage,
    isPinned,
    isArchived,
    e2eEnabled: c.e2e_enabled ?? c.e2eEnabled ?? false,
    e2eKeyExchange: c.e2e_key_exchange || c.e2eKeyExchange || null,
    createdAt: c.created_at || c.createdAt,
    updatedAt: c.updated_at || c.updatedAt
  };
}

export function formatMessage(m: any): any {
  if (!m) return null;
  return {
    id: m.id,
    _id: m.id,
    conversation: m.conversation_id || m.conversation,
    sender: m.sender_details || (m.sender && typeof m.sender === 'object')
      ? formatUser(m.sender_details || m.sender)
      : (m.sender_id || m.sender),
    content: m.content,
    messageType: m.message_type || m.messageType || 'text',
    fileUrl: m.file_url || m.fileUrl,
    fileName: m.file_name || m.fileName,
    fileSize: Number(m.file_size || m.fileSize || 0),
    mimeType: m.mime_type || m.mimeType,
    deliveredTo: m.delivered_to || m.deliveredTo || [],
    readBy: m.read_by || m.readBy || [],
    deletedFor: m.deleted_for || m.deletedFor || [],
    deletedForAll: m.deleted_for_all ?? m.deletedForAll ?? false,
    replyTo: m.reply_to_details || (m.replyTo && typeof m.replyTo === 'object')
      ? formatMessage(m.reply_to_details || m.replyTo)
      : (m.reply_to_id || m.replyTo || null),
    isEdited: m.is_edited ?? m.isEdited ?? false,
    isForwarded: m.is_forwarded ?? m.isForwarded ?? false,
    iv: m.iv,
    createdAt: m.created_at || m.createdAt,
    updatedAt: m.updated_at || m.updatedAt
  };
}
