import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';
import { api } from '../services/api';
import { useAuth } from './AuthContext';
import { useSocket } from './SocketContext';
import { 
  generateAESKey, 
  exportAESKey, 
  importAESKey, 
  encryptAESKeyWithRSAPublic, 
  decryptAESKeyWithRSAPrivate,
  encryptMessage,
  decryptMessage
} from '../services/e2eCrypto';

export interface MessageType {
  _id: string;
  conversation: string;
  sender: {
    _id: string;
    displayName: string;
    username: string;
    avatarUrl?: string;
  };
  content: string;
  messageType: 'text' | 'image' | 'video' | 'file' | 'audio';
  fileUrl?: string;
  fileName?: string;
  fileSize?: number;
  mimeType?: string;
  deliveredTo: string[];
  readBy: string[];
  deletedFor: string[];
  deletedForAll: boolean;
  replyTo?: {
    _id: string;
    content: string;
    messageType: string;
    fileUrl?: string;
    sender: {
      displayName: string;
    };
  };
  isEdited: boolean;
  isForwarded: boolean;
  iv?: string;
  createdAt: string;
}

export interface ConversationType {
  id: string;
  participants: {
    id: string;
    displayName: string;
    username: string;
    avatarUrl?: string;
  }[];
  recipient: {
    id: string;
    displayName: string;
    username: string;
    avatarUrl: string;
    status: 'online' | 'offline' | 'away';
    lastSeen: string | null;
    publicKey?: string;
  } | null;
  lastMessage?: MessageType;
  isPinned: boolean;
  isArchived: boolean;
  e2eEnabled: boolean;
  e2eKeyExchange?: {
    initiator: string;
    initiatorPublicKey: string; // Used to store the encrypted AES key
    responderPublicKey?: string;
  };
  updatedAt: string;
  unreadCount?: number;
}

interface ChatContextType {
  conversations: ConversationType[];
  activeConversation: ConversationType | null;
  messages: MessageType[];
  loadingChats: boolean;
  loadingMessages: boolean;
  typingUser: string | null; // ID of user typing in current chat
  activeAESKey: CryptoKey | null; // Symmetric key in-memory for selected E2E chat
  loadConversations: () => Promise<void>;
  selectConversation: (conv: ConversationType | null) => Promise<void>;
  sendMessageText: (content: string, replyToId?: string) => Promise<void>;
  sendMessageFile: (fileUrl: string, name: string, size: number, mimeType: string, type: 'image' | 'video' | 'file' | 'audio', replyToId?: string) => Promise<void>;
  editMessageText: (messageId: string, newContent: string) => Promise<void>;
  deleteMessageForEveryone: (messageId: string) => Promise<void>;
  forwardMessageTo: (messageId: string, targetConversationId: string) => Promise<void>;
  togglePinChat: (conversationId: string) => Promise<void>;
  toggleArchiveChat: (conversationId: string) => Promise<void>;
  initiateE2EChat: () => Promise<void>;
  sendTypingStatus: (isTyping: boolean) => void;
  searchLocalMessages: (query: string) => Promise<MessageType[]>;
}

const ChatContext = createContext<ChatContextType | undefined>(undefined);

export const ChatProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { user } = useAuth();
  const { socket } = useSocket();
  const [conversations, setConversations] = useState<ConversationType[]>([]);
  const [activeConversation, setActiveConversation] = useState<ConversationType | null>(null);
  const [messages, setMessages] = useState<MessageType[]>([]);
  const [loadingChats, setLoadingChats] = useState(false);
  const [loadingMessages, setLoadingMessages] = useState(false);
  const [typingUser, setTypingUser] = useState<string | null>(null);
  const [activeAESKey, setActiveAESKey] = useState<CryptoKey | null>(null);

  // Decrypts message content if IV is present and AES Key is available
  const decryptIncomingMessage = useCallback(async (msg: MessageType, aesKey: CryptoKey | null): Promise<MessageType> => {
    if (msg.iv && aesKey && !msg.deletedForAll) {
      const decrypted = await decryptMessage(msg.content, msg.iv, aesKey);
      return { ...msg, content: decrypted };
    }
    return msg;
  }, []);

  const loadConversations = useCallback(async () => {
    if (!user) return;
    setLoadingChats(true);
    try {
      const res = await api.get('/chats');
      if (res.success) {
        setConversations(res.conversations);
      }
    } catch (err) {
      console.error('Failed to load chats:', err);
    } finally {
      setLoadingChats(false);
    }
  }, [user]);

  // Load and derive E2E symmetric keys for conversation
  const deriveE2EKey = useCallback(async (conv: ConversationType): Promise<CryptoKey | null> => {
    if (!user || !conv.e2eEnabled || !conv.e2eKeyExchange) return null;

    const storageKey = `xhat_aes_key_${conv.id}_${user.id}`;
    const storedAESBase64 = localStorage.getItem(storageKey);

    if (storedAESBase64) {
      return await importAESKey(storedAESBase64);
    }

    // If key not in localStorage but exchange info is on server
    try {
      const ownPrivateKeyBase64 = localStorage.getItem(`xhat_private_key_${user.id}`);
      if (!ownPrivateKeyBase64) return null;

      // We decrypt the key: the initiatorPublicKey holds the encrypted AES key for E2EE
      const encryptedAESKey = conv.e2eKeyExchange.initiatorPublicKey;
      const decryptedAESBase64 = await decryptAESKeyWithRSAPrivate(encryptedAESKey, ownPrivateKeyBase64);
      
      localStorage.setItem(storageKey, decryptedAESBase64);
      return await importAESKey(decryptedAESBase64);
    } catch (err) {
      console.error('E2EE key decryption error:', err);
      return null;
    }
  }, [user]);

  const selectConversation = async (conv: ConversationType | null) => {
    setActiveConversation(conv);
    setMessages([]);
    setActiveAESKey(null);
    setTypingUser(null);

    if (!conv || !user) return;

    setLoadingMessages(true);
    try {
      let aesKey: CryptoKey | null = null;
      if (conv.e2eEnabled) {
        aesKey = await deriveE2EKey(conv);
        setActiveAESKey(aesKey);
      }

      // Fetch message history
      const res = await api.get(`/messages/${conv.id}`);
      if (res.success) {
        // Decrypt messages
        const processed = await Promise.all(
          res.messages.map((msg: MessageType) => decryptIncomingMessage(msg, aesKey))
        );
        setMessages(processed);
      }

      // Reset unread count locally
      setConversations(prev =>
        prev.map(c => (c.id === conv.id ? { ...c, unreadCount: 0 } : c))
      );
    } catch (err) {
      console.error('Failed to load message history:', err);
    } finally {
      setLoadingMessages(false);
    }
  };

  const sendMessageText = async (content: string, replyToId?: string) => {
    if (!user || !activeConversation) return;

    try {
      let finalContent = content;
      let iv: string | undefined;

      if (activeConversation.e2eEnabled && activeAESKey) {
        // Encrypt message content
        const encrypted = await encryptMessage(content, activeAESKey);
        finalContent = encrypted.ciphertext;
        iv = encrypted.iv;
      }

      const res = await api.post('/messages', {
        conversationId: activeConversation.id,
        content: finalContent,
        messageType: 'text',
        replyTo: replyToId,
        iv,
      });

      if (res.success) {
        // Decrypt sent message locally for screen append
        const decrypted = await decryptIncomingMessage(res.message, activeAESKey);
        setMessages(prev => [...prev, decrypted]);

        // Update conversation lastMessage
        setConversations(prev =>
          prev.map(c =>
            c.id === activeConversation.id ? { ...c, lastMessage: decrypted, updatedAt: new Date().toISOString() } : c
          )
        );
      }
    } catch (err) {
      console.error('Failed to send text message:', err);
    }
  };

  const sendMessageFile = async (
    fileUrl: string,
    name: string,
    size: number,
    mimeType: string,
    type: 'image' | 'video' | 'file' | 'audio',
    replyToId?: string
  ) => {
    if (!user || !activeConversation) return;

    try {
      // For attachments, we don't encrypt the file binary directly in this demo
      // but we could encrypt the fileUrl/metadata if needed. For now, send file metadata.
      const res = await api.post('/messages', {
        conversationId: activeConversation.id,
        content: `Sent an attachment: ${name}`,
        messageType: type,
        fileUrl,
        fileName: name,
        fileSize: size,
        mimeType,
        replyTo: replyToId,
      });

      if (res.success) {
        setMessages(prev => [...prev, res.message]);
        setConversations(prev =>
          prev.map(c =>
            c.id === activeConversation.id ? { ...c, lastMessage: res.message, updatedAt: new Date().toISOString() } : c
          )
        );
      }
    } catch (err) {
      console.error('Failed to send attachment:', err);
    }
  };

  const editMessageText = async (messageId: string, newContent: string) => {
    try {
      let finalContent = newContent;
      let iv: string | undefined;

      if (activeConversation?.e2eEnabled && activeAESKey) {
        const encrypted = await encryptMessage(newContent, activeAESKey);
        finalContent = encrypted.ciphertext;
        iv = encrypted.iv;
      }

      const res = await api.put(`/messages/edit/${messageId}`, {
        newContent: finalContent,
        iv,
      });

      if (res.success) {
        const decrypted = await decryptIncomingMessage(res.message, activeAESKey);
        setMessages(prev => prev.map(m => (m._id === messageId ? decrypted : m)));
      }
    } catch (err) {
      console.error('Failed to edit message:', err);
    }
  };

  const deleteMessageForEveryone = async (messageId: string) => {
    try {
      const res = await api.delete(`/messages/${messageId}`, { deleteForAll: true });
      if (res.success) {
        setMessages(prev =>
          prev.map(m =>
            m._id === messageId
              ? { ...m, content: 'This message was deleted.', deletedForAll: true, fileUrl: undefined }
              : m
          )
        );
      }
    } catch (err) {
      console.error('Failed to delete message:', err);
    }
  };

  const forwardMessageTo = async (messageId: string, targetConversationId: string) => {
    try {
      await api.post('/messages/forward', {
        sourceMessageId: messageId,
        targetConversationId,
      });
      loadConversations();
    } catch (err) {
      console.error('Failed to forward message:', err);
    }
  };

  const togglePinChat = async (conversationId: string) => {
    try {
      const res = await api.put(`/chats/pin/${conversationId}`);
      if (res.success) {
        setConversations(prev =>
          prev.map(c => (c.id === conversationId ? { ...c, isPinned: res.isPinned } : c))
        );
        if (activeConversation?.id === conversationId) {
          setActiveConversation(prev => (prev ? { ...prev, isPinned: res.isPinned } : null));
        }
      }
    } catch (err) {
      console.error('Failed to pin chat:', err);
    }
  };

  const toggleArchiveChat = async (conversationId: string) => {
    try {
      const res = await api.put(`/chats/archive/${conversationId}`);
      if (res.success) {
        setConversations(prev =>
          prev.map(c => (c.id === conversationId ? { ...c, isArchived: res.isArchived } : c))
        );
        if (activeConversation?.id === conversationId) {
          setActiveConversation(prev => (prev ? { ...prev, isArchived: res.isArchived } : null));
        }
      }
    } catch (err) {
      console.error('Failed to archive chat:', err);
    }
  };

  const initiateE2EChat = async () => {
    if (!user || !activeConversation || !activeConversation.recipient) return;

    try {
      const recipientPublicKey = activeConversation.recipient.publicKey;
      if (!recipientPublicKey) {
        alert('Your friend does not have security keys configured yet.');
        return;
      }

      // 1. Generate AES Symmetric Key
      const aesKey = await generateAESKey();
      const aesBase64 = await exportAESKey(aesKey);

      // 2. Encrypt AES Key with Recipient's RSA Public Key
      const encryptedAESKey = await encryptAESKeyWithRSAPublic(aesBase64, recipientPublicKey);

      // 3. Register Key Exchange on Server (initiatorPublicKey stores encrypted key for responder)
      const res = await api.post('/chats/e2e/initiate', {
        conversationId: activeConversation.id,
        publicKey: encryptedAESKey,
      });

      if (res.success) {
        // Save raw key locally
        localStorage.setItem(`xhat_aes_key_${activeConversation.id}_${user.id}`, aesBase64);
        setActiveAESKey(aesKey);
        
        const updatedConv = {
          ...activeConversation,
          e2eEnabled: true,
          e2eKeyExchange: res.conversation.e2eKeyExchange,
        };
        setActiveConversation(updatedConv);
        setConversations(prev => prev.map(c => (c.id === activeConversation.id ? updatedConv : c)));

        // Broadcast socket notification
        socket?.emit('e2e_negotiated', {
          conversationId: activeConversation.id,
          recipientId: activeConversation.recipient.id,
        });
      }
    } catch (err) {
      console.error('E2EE negotiation failed:', err);
    }
  };

  const sendTypingStatus = (isTyping: boolean) => {
    if (!socket || !activeConversation || !activeConversation.recipient) return;
    socket.emit(isTyping ? 'typing' : 'stop_typing', {
      conversationId: activeConversation.id,
      recipientId: activeConversation.recipient.id,
    });
  };

  const searchLocalMessages = async (query: string): Promise<MessageType[]> => {
    if (!activeConversation) return [];
    try {
      const res = await api.get(`/messages/${activeConversation.id}/search`, { query });
      if (res.success) {
        return await Promise.all(
          res.messages.map((m: MessageType) => decryptIncomingMessage(m, activeAESKey))
        );
      }
    } catch (err) {
      console.error('Message search failed:', err);
    }
    return [];
  };

  // Socket Listener Binder
  useEffect(() => {
    if (!socket || !user) return;

    // Handle New Message
    const handleNewMessage = async (msg: MessageType) => {
      // Check if message belongs to active conversation
      if (activeConversation && msg.conversation === activeConversation.id) {
        const decrypted = await decryptIncomingMessage(msg, activeAESKey);
        setMessages(prev => [...prev, decrypted]);

        // Send read receipt
        await api.get(`/messages/${activeConversation.id}`); // Marks all as read
        socket.emit('messages_read', {
          conversationId: activeConversation.id,
          readBy: user.id,
          messageIds: [msg._id],
        });
      } else {
        // Increment unread count on chat list item
        setConversations(prev =>
          prev.map(c =>
            c.id === msg.conversation
              ? {
                  ...c,
                  lastMessage: msg,
                  unreadCount: (c.unreadCount || 0) + 1,
                  updatedAt: new Date().toISOString(),
                }
              : c
          )
        );
      }
    };

    const handleMessagesRead = (data: { conversationId: string; messageIds: string[] }) => {
      if (activeConversation && data.conversationId === activeConversation.id) {
        setMessages(prev =>
          prev.map(m =>
            data.messageIds.includes(m._id) ? { ...m, readBy: [...m.readBy, user.id] } : m
          )
        );
      }
    };

    const handleMessageDelivered = (data: { conversationId: string; messageId: string; deliveredTo: string }) => {
      if (activeConversation && data.conversationId === activeConversation.id) {
        setMessages(prev =>
          prev.map(m =>
            m._id === data.messageId ? { ...m, deliveredTo: [...m.deliveredTo, data.deliveredTo] } : m
          )
        );
      }
    };

    const handleUserStatusChanged = (data: { userId: string; status: 'online' | 'offline' | 'away'; lastSeen?: string }) => {
      setConversations(prev =>
        prev.map(c => {
          if (c.recipient && c.recipient.id === data.userId) {
            return {
              ...c,
              recipient: {
                ...c.recipient,
                status: data.status,
                lastSeen: data.lastSeen || c.recipient.lastSeen,
              },
            };
          }
          return c;
        })
      );

      if (activeConversation?.recipient?.id === data.userId) {
        setActiveConversation(prev => {
          if (!prev || !prev.recipient) return prev;
          return {
            ...prev,
            recipient: {
              ...prev.recipient,
              status: data.status,
              lastSeen: data.lastSeen || prev.recipient.lastSeen,
            },
          };
        });
      }
    };

    const handleUserTyping = (data: { conversationId: string; userId: string }) => {
      if (activeConversation && data.conversationId === activeConversation.id) {
        setTypingUser(data.userId);
      }
    };

    const handleUserStopTyping = (data: { conversationId: string; userId: string }) => {
      if (activeConversation && data.conversationId === activeConversation.id && typingUser === data.userId) {
        setTypingUser(null);
      }
    };

    const handleE2ENegotiated = async (data: { conversationId: string }) => {
      // Reload conversations list and active conversation details to pick up exchange key
      await loadConversations();
      if (activeConversation?.id === data.conversationId) {
        // Re-load key
        const updatedChats = await api.get('/chats');
        const refreshedChat = updatedChats.conversations.find((c: any) => c.id === data.conversationId);
        if (refreshedChat) {
          const derivedKey = await deriveE2EKey(refreshedChat);
          setActiveAESKey(derivedKey);
          setActiveConversation(refreshedChat);
          
          // Re-fetch and decrypt messages
          const res = await api.get(`/messages/${refreshedChat.id}`);
          if (res.success) {
            const processed = await Promise.all(
              res.messages.map((m: MessageType) => decryptIncomingMessage(m, derivedKey))
            );
            setMessages(processed);
          }
        }
      }
    };

    socket.on('new_message', handleNewMessage);
    socket.on('messages_read', handleMessagesRead);
    socket.on('message_delivered', handleMessageDelivered);
    socket.on('user_status_changed', handleUserStatusChanged);
    socket.on('user_typing', handleUserTyping);
    socket.on('user_stop_typing', handleUserStopTyping);
    socket.on('e2e_negotiated', handleE2ENegotiated);

    return () => {
      socket.off('new_message', handleNewMessage);
      socket.off('messages_read', handleMessagesRead);
      socket.off('message_delivered', handleMessageDelivered);
      socket.off('user_status_changed', handleUserStatusChanged);
      socket.off('user_typing', handleUserTyping);
      socket.off('user_stop_typing', handleUserStopTyping);
      socket.off('e2e_negotiated', handleE2ENegotiated);
    };
  }, [socket, user?.id, activeConversation?.id, activeAESKey, typingUser, loadConversations, deriveE2EKey, decryptIncomingMessage]);

  useEffect(() => {
    if (user) {
      loadConversations();
    }
  }, [user, loadConversations]);

  return (
    <ChatContext.Provider
      value={{
        conversations,
        activeConversation,
        messages,
        loadingChats,
        loadingMessages,
        typingUser,
        activeAESKey,
        loadConversations,
        selectConversation,
        sendMessageText,
        sendMessageFile,
        editMessageText,
        deleteMessageForEveryone,
        forwardMessageTo,
        togglePinChat,
        toggleArchiveChat,
        initiateE2EChat,
        sendTypingStatus,
        searchLocalMessages,
      }}
    >
      {children}
    </ChatContext.Provider>
  );
};

export const useChat = () => {
  const context = useContext(ChatContext);
  if (!context) throw new Error('useChat must be used within a ChatProvider');
  return context;
};
