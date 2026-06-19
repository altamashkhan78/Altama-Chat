import React, { useState, useEffect, useRef } from 'react';
import { useAuth } from '../context/AuthContext';
import { useChat } from '../context/ChatContext';
import type { MessageType } from '../context/ChatContext';
import { useToast } from '../context/ToastContext';
import { api } from '../services/api';
import { ChatListSkeleton, MessageStreamSkeleton } from './Skeletons';
import { motion, AnimatePresence } from 'framer-motion';
import { 
  Search, LogOut, Settings, MessageSquare, Send, Paperclip, 
  Mic, Square, Shield, Pin, Archive, Ban, Edit2, 
  Trash2, CornerUpLeft, MoreVertical, X, Check, CheckCheck, Smile, HelpCircle, 
  ChevronLeft, Key, Eye, EyeOff
} from 'lucide-react';
import confetti from 'canvas-confetti';

export const Dashboard: React.FC = () => {
  const { user, logout, updateUserProfile, updatePassword, updatePrivacy } = useAuth();
  const { toast } = useToast();
  
  const { 
    conversations, activeConversation, messages, loadingChats, loadingMessages,
    typingUser, selectConversation, sendMessageText, sendMessageFile,
    editMessageText, deleteMessageForEveryone, forwardMessageTo, togglePinChat,
    toggleArchiveChat, initiateE2EChat, sendTypingStatus, searchLocalMessages
  } = useChat();

  // Navigation & Tabs
  const [activeTab, setActiveTab] = useState<'all' | 'pinned' | 'archived'>('all');
  const [mobileView, setMobileView] = useState<'sidebar' | 'chat'>('sidebar');

  // Input states
  const [searchText, setSearchText] = useState('');
  const [searchResults, setSearchResults] = useState<any[]>([]);
  const [messageInput, setMessageInput] = useState('');
  const [replyingTo, setReplyingTo] = useState<MessageType | null>(null);
  
  // Settings Drawer states
  const [showSettings, setShowSettings] = useState(false);
  const [editName, setEditName] = useState(user?.displayName || '');
  const [editBio, setEditBio] = useState(user?.bio || '');
  const [editAvatar, setEditAvatar] = useState(user?.avatarUrl || '');
  const [oldPassword, setOldPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [prefLastSeen, setPrefLastSeen] = useState(user?.privacySettings?.lastSeen || 'everyone');
  const [prefProfilePhoto, setPrefProfilePhoto] = useState(user?.privacySettings?.profilePhoto || 'everyone');
  const [blockedUsers, setBlockedUsers] = useState<any[]>([]);
  const [settingsTab, setSettingsTab] = useState<'profile' | 'security' | 'privacy' | 'blocked'>('profile');
  
  // Custom Passwords reveal
  const [showPassOld, setShowPassOld] = useState(false);
  const [showPassNew, setShowPassNew] = useState(false);

  // Search in chat
  const [showSearchInChat, setShowSearchInChat] = useState(false);
  const [searchChatQuery, setSearchChatQuery] = useState('');
  const [searchedMessages, setSearchedMessages] = useState<MessageType[]>([]);

  // Message Editing State
  const [editingMessageId, setEditingMessageId] = useState<string | null>(null);
  const [editInput, setEditInput] = useState('');

  // Dropdowns & Context Menu
  const [activeMenuId, setActiveMenuId] = useState<string | null>(null);

  // Custom Modal for confirmations (blocking)
  const [showBlockModal, setShowBlockModal] = useState(false);
  const [showForwardModal, setShowForwardModal] = useState(false);
  const [forwardingMessageId, setForwardingMessageId] = useState<string | null>(null);

  // Voice recording states
  const [isRecording, setIsRecording] = useState(false);
  const [recordingSeconds, setRecordingSeconds] = useState(0);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const audioChunksRef = useRef<Blob[]>([]);
  const timerRef = useRef<any>(null);

  // Emoji Popover
  const [showEmoji, setShowEmoji] = useState(false);
  const emojis = ['😊', '😂', '🔥', '👍', '❤️', '🎉', '😢', '😍', '👀', '✨', '👋', '💯', '🤔', '🚀', '👏', '💔'];

  // File Upload State
  const [uploading, setUploading] = useState(false);

  // Refs for scrolling
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (messagesEndRef.current) {
      messagesEndRef.current.scrollIntoView({ behavior: 'smooth' });
    }
  }, [messages]);

  // Handle Search Users for New Chat
  useEffect(() => {
    const delayDebounceFn = setTimeout(async () => {
      if (searchText.trim().length > 1) {
        try {
          const res = await api.get(`/users/search`, { query: searchText });
          if (res.success) {
            setSearchResults(res.users);
          }
        } catch (err) {
          console.error(err);
        }
      } else {
        setSearchResults([]);
      }
    }, 450);

    return () => clearTimeout(delayDebounceFn);
  }, [searchText]);

  // Handle local chat message search
  useEffect(() => {
    const delaySearchFn = setTimeout(async () => {
      if (searchChatQuery.trim()) {
        const found = await searchLocalMessages(searchChatQuery);
        setSearchedMessages(found);
      } else {
        setSearchedMessages([]);
      }
    }, 400);
    return () => clearTimeout(delaySearchFn);
  }, [searchChatQuery]);

  // Fetch Blocked users when tab changes to blocked
  useEffect(() => {
    if (showSettings && settingsTab === 'blocked') {
      const fetchBlocked = async () => {
        try {
          const res = await api.get('/users/blocked');
          if (res.success) {
            setBlockedUsers(res.users);
          }
        } catch (err) {
          console.error(err);
        }
      };
      fetchBlocked();
    }
  }, [showSettings, settingsTab]);

  // Track Typing status
  const typingTimeoutRef = useRef<any>(null);
  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setMessageInput(e.target.value);
    sendTypingStatus(true);
    
    if (typingTimeoutRef.current) clearTimeout(typingTimeoutRef.current);
    
    typingTimeoutRef.current = setTimeout(() => {
      sendTypingStatus(false);
    }, 1500);
  };

  // Start new chat with searched user
  const handleStartChat = async (recipientId: string) => {
    try {
      const res = await api.post('/chats', { recipientId });
      if (res.success) {
        const chatRes = await api.get('/chats');
        if (chatRes.success) {
          const found = chatRes.conversations.find((c: any) => c.id === res.conversation._id);
          if (found) {
            selectConversation(found);
          }
        }
        setSearchText('');
        setSearchResults([]);
        setMobileView('chat');
        toast('Chat session started!', 'success');
      }
    } catch (err: any) {
      toast(err.message || 'Failed to start chat', 'error');
    }
  };

  // Submit Text Message
  const handleSendText = (e: React.FormEvent) => {
    e.preventDefault();
    if (!messageInput.trim()) return;
    
    sendMessageText(messageInput, replyingTo?._id);
    setMessageInput('');
    setReplyingTo(null);
    sendTypingStatus(false);
  };

  // Trigger File Upload
  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setUploading(true);
    const formData = new FormData();
    formData.append('file', file);

    try {
      const res = await api.post('/upload', formData);
      if (res.success) {
        let type: 'image' | 'video' | 'file' | 'audio' = 'file';
        if (file.type.startsWith('image/')) type = 'image';
        else if (file.type.startsWith('video/')) type = 'video';
        else if (file.type.startsWith('audio/')) type = 'audio';

        sendMessageFile(res.file.url, res.file.name, res.file.size, res.file.mimeType, type, replyingTo?._id);
        setReplyingTo(null);
        toast('Attachment uploaded!', 'success');
      }
    } catch (err: any) {
      toast(err.message || 'File upload failed', 'error');
    } finally {
      setUploading(false);
    }
  };

  // Voice recording handlers
  const startRecording = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const mediaRecorder = new MediaRecorder(stream);
      mediaRecorderRef.current = mediaRecorder;
      audioChunksRef.current = [];

      mediaRecorder.ondataavailable = (event) => {
        if (event.data.size > 0) {
          audioChunksRef.current.push(event.data);
        }
      };

      mediaRecorder.onstop = async () => {
        const audioBlob = new Blob(audioChunksRef.current, { type: 'audio/webm' });
        setUploading(true);
        const formData = new FormData();
        formData.append('file', audioBlob, `voice-note-${Date.now()}.webm`);

        try {
          const res = await api.post('/upload', formData);
          if (res.success) {
            sendMessageFile(res.file.url, res.file.name, res.file.size, res.file.mimeType, 'audio', replyingTo?._id);
            setReplyingTo(null);
            toast('Voice note sent!', 'success');
          }
        } catch (err) {
          console.error(err);
        } finally {
          setUploading(false);
        }
        stream.getTracks().forEach((track) => track.stop());
      };

      mediaRecorder.start();
      setIsRecording(true);
      setRecordingSeconds(0);
      
      timerRef.current = setInterval(() => {
        setRecordingSeconds((prev) => prev + 1);
      }, 1000);
    } catch (err) {
      toast('Microphone access is required to record voice notes', 'error');
    }
  };

  const stopRecording = (cancel = false) => {
    if (!mediaRecorderRef.current || !isRecording) return;
    clearInterval(timerRef.current);
    setIsRecording(false);
    
    if (cancel) {
      mediaRecorderRef.current.ondataavailable = null;
      mediaRecorderRef.current.stop();
      mediaRecorderRef.current = null;
      toast('Voice recording cancelled', 'info');
    } else {
      mediaRecorderRef.current.stop();
    }
  };

  // Settings Save Profile
  const handleSaveProfile = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      await updateUserProfile(editName, editBio, editAvatar);
      toast('Profile updated successfully!', 'success');
    } catch (err: any) {
      toast(err.message || 'Update failed', 'error');
    }
  };

  // Settings Update Password
  const handleSavePassword = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!oldPassword || !newPassword) return toast('Please enter password fields', 'error');
    try {
      await updatePassword(oldPassword, newPassword);
      setOldPassword('');
      setNewPassword('');
      toast('Password changed successfully!', 'success');
    } catch (err: any) {
      toast(err.message || 'Change failed', 'error');
    }
  };

  // Settings Update Privacy
  const handleSavePrivacy = async () => {
    try {
      await updatePrivacy(prefLastSeen, prefProfilePhoto);
      toast('Privacy settings updated!', 'success');
    } catch (err: any) {
      toast(err.message || 'Update failed', 'error');
    }
  };

  // Unblock user
  const handleUnblockUser = async (targetUserId: string) => {
    try {
      const res = await api.post('/users/unblock', { targetUserId });
      if (res.success) {
        setBlockedUsers((prev) => prev.filter((u) => u.id !== targetUserId));
        toast('User unblocked', 'success');
      }
    } catch (err) {
      console.error(err);
    }
  };

  // Block user in current conversation
  const handleBlockCurrent = async () => {
    if (!activeConversation?.recipient) return;
    setShowBlockModal(true);
  };

  const executeBlockCurrent = async () => {
    if (!activeConversation?.recipient) return;
    try {
      const res = await api.post('/users/block', { targetUserId: activeConversation.recipient.id });
      if (res.success) {
        toast(`${activeConversation.recipient.displayName} blocked`, 'success');
        setShowBlockModal(false);
        selectConversation(null);
        window.location.reload();
      }
    } catch (err) {
      console.error(err);
      toast('Blocking failed', 'error');
    }
  };

  // Delete message handler
  const handleDeleteMessage = async (msgId: string, everyone: boolean) => {
    if (everyone) {
      await deleteMessageForEveryone(msgId);
      toast('Message deleted for everyone', 'success');
    } else {
      try {
        await api.delete(`/messages/${msgId}`, { deleteForAll: false });
        selectConversation(activeConversation); // re-sync messages
        toast('Message deleted for you', 'info');
      } catch (err) {
        console.error(err);
      }
    }
    setActiveMenuId(null);
  };

  // Forward message handler
  const handleForwardMessage = async (targetConversationId: string) => {
    if (!forwardingMessageId) return;
    await forwardMessageTo(forwardingMessageId, targetConversationId);
    toast('Message forwarded!', 'success');
    setShowForwardModal(false);
    setForwardingMessageId(null);
  };

  // Filter conversations
  const filteredConversations = conversations.filter((c) => {
    if (activeTab === 'pinned') return c.isPinned && !c.isArchived;
    if (activeTab === 'archived') return c.isArchived;
    return !c.isArchived;
  });

  // Sort: Pinned first, then by updatedAt descending
  const sortedConversations = [...filteredConversations].sort((a, b) => {
    if (a.isPinned && !b.isPinned) return -1;
    if (!a.isPinned && b.isPinned) return 1;
    return new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime();
  });

  return (
    <div className="flex-1 flex h-[100vh] w-full relative overflow-hidden bg-transparent dark:bg-slate-950/20 text-slate-800 dark:text-slate-100 font-sans">
      {/* BACKGROUND GRAPHIC ORBS */}
      <div className="absolute top-[-100px] right-[-100px] w-[500px] h-[500px] rounded-full bg-indigo-500/5 dark:bg-indigo-600/5 filter blur-[100px] pointer-events-none -z-10" />
      <div className="absolute bottom-[-100px] left-[-100px] w-[500px] h-[500px] rounded-full bg-purple-500/5 dark:bg-purple-600/5 filter blur-[100px] pointer-events-none -z-10" />

      {/* DUAL PANE WRAPPER */}
      <div className="flex-1 flex max-w-7xl mx-auto w-full h-full glass-panel lg:my-4 lg:h-[calc(100vh-2rem)] lg:rounded-[2rem] lg:border border-white/20 dark:border-white/5 overflow-hidden shadow-2xl relative">
        
        {/* ========================================================= */}
        {/* SIDEBAR PANE (LEFT) */}
        {/* ========================================================= */}
        <aside className={`${mobileView === 'sidebar' ? 'flex' : 'hidden'} lg:flex flex-col w-full lg:w-96 border-r border-slate-200/50 dark:border-slate-800/40 bg-white/50 dark:bg-slate-900/30 backdrop-blur-xl h-full select-none transition-all`}>
          
          {/* Sidebar User Header */}
          <div className="p-4 border-b border-slate-200/50 dark:border-slate-800/40 flex items-center justify-between">
            <div className="flex items-center gap-3">
              <motion.div 
                whileHover={{ scale: 1.05 }}
                className="w-10 h-10 rounded-xl bg-gradient-to-tr from-indigo-500 to-purple-600 flex items-center justify-center font-bold text-white shadow-md relative group cursor-pointer"
                onClick={() => {
                  setEditName(user?.displayName || '');
                  setEditBio(user?.bio || '');
                  setEditAvatar(user?.avatarUrl || '');
                  setShowSettings(true);
                }}
              >
                {user?.avatarUrl ? (
                  <img src={user.avatarUrl} alt="Avatar" className="w-full h-full object-cover rounded-xl" />
                ) : (
                  user?.displayName.charAt(0).toUpperCase()
                )}
                <div className="absolute bottom-0 right-0 w-3 h-3 rounded-full bg-emerald-500 border-2 border-slate-900 shadow-sm" />
              </motion.div>
              <div>
                <h3 className="font-extrabold text-sm tracking-tight">{user?.displayName}</h3>
                <p className="text-[11px] text-slate-500 dark:text-slate-400 font-medium">@{user?.username}</p>
              </div>
            </div>

            {/* Quick Actions */}
            <div className="flex items-center gap-2">
              <button 
                onClick={() => {
                  setEditName(user?.displayName || '');
                  setEditBio(user?.bio || '');
                  setEditAvatar(user?.avatarUrl || '');
                  setShowSettings(true);
                }}
                className="p-2 rounded-lg hover:bg-slate-200/50 dark:hover:bg-slate-800/50 transition-colors text-slate-500 dark:text-slate-400"
                title="Settings"
              >
                <Settings className="w-4.5 h-4.5" />
              </button>
              <button 
                onClick={logout} 
                className="p-2 rounded-lg hover:bg-red-500/10 text-slate-500 dark:text-slate-400 hover:text-red-600 dark:hover:text-red-400 transition-colors"
                title="Sign Out"
              >
                <LogOut className="w-4.5 h-4.5" />
              </button>
            </div>
          </div>

          {/* New Chat Search Input */}
          <div className="p-3">
            <div className="relative">
              <input
                type="text"
                placeholder="Search friends..."
                value={searchText}
                onChange={(e) => setSearchText(e.target.value)}
                className="w-full pl-9 pr-4 py-2.5 rounded-xl glass-input text-xs"
              />
              <Search className="absolute left-3 top-3 w-4 h-4 text-slate-400" />
              {searchText && (
                <button 
                  onClick={() => { setSearchText(''); setSearchResults([]); }}
                  className="absolute right-3 top-3 text-slate-400 hover:text-slate-600"
                >
                  <X className="w-4 h-4" />
                </button>
              )}
            </div>

            {/* Search Results Dropdown */}
            {searchResults.length > 0 && (
              <div className="mt-2 max-h-60 overflow-y-auto rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 shadow-xl relative z-20">
                <div className="p-2 text-[10px] uppercase font-bold tracking-wider text-indigo-500 dark:text-indigo-400 border-b border-slate-200 dark:border-slate-800">
                  Global Search
                </div>
                {searchResults.map((item) => (
                  <div 
                    key={item.id} 
                    onClick={() => handleStartChat(item.id)}
                    className="p-3 flex items-center gap-3 hover:bg-slate-100 dark:hover:bg-slate-800/60 cursor-pointer border-b border-slate-100 dark:border-slate-800/40 last:border-0"
                  >
                    <div className="w-9 h-9 rounded-lg bg-indigo-500/20 text-indigo-500 dark:text-indigo-400 flex items-center justify-center font-bold text-xs uppercase">
                      {item.avatarUrl ? (
                        <img src={item.avatarUrl} alt="" className="w-full h-full object-cover rounded-lg" />
                      ) : (
                        item.displayName.charAt(0)
                      )}
                    </div>
                    <div className="flex-1">
                      <div className="text-xs font-bold text-slate-800 dark:text-slate-200">{item.displayName}</div>
                      <div className="text-[10px] text-slate-400 font-mono">@{item.username}</div>
                    </div>
                  </div>
                ))}
              </div>
            )}
            {searchText.trim().length > 1 && searchResults.length === 0 && (
              <div className="mt-2 p-3 text-center text-xs text-slate-500 dark:text-slate-400 bg-white/20 dark:bg-slate-900/10 rounded-xl border border-slate-200 dark:border-slate-800/40">
                No friends found matching "{searchText}"
              </div>
            )}
          </div>

          {/* Conversations Tab Switcher */}
          <div className="flex px-3 border-b border-slate-200/50 dark:border-slate-800/40">
            {(['all', 'pinned', 'archived'] as const).map((tab) => (
              <button
                key={tab}
                onClick={() => setActiveTab(tab)}
                className={`flex-1 py-3 text-[10px] font-extrabold uppercase tracking-wider text-center transition border-b-2 ${
                  activeTab === tab 
                    ? 'border-indigo-500 text-indigo-500 dark:text-indigo-400' 
                    : 'border-transparent text-slate-500 dark:text-slate-400 hover:text-slate-700'
                }`}
              >
                {tab}
              </button>
            ))}
          </div>

          {/* Conversations List */}
          <div className="flex-1 overflow-y-auto p-2 space-y-1">
            {loadingChats ? (
              <ChatListSkeleton />
            ) : sortedConversations.length === 0 ? (
              <div className="text-center py-12 px-4 select-none">
                <MessageSquare className="w-10 h-10 text-slate-300 dark:text-slate-700 mx-auto mb-3" />
                <h4 className="text-xs font-bold text-slate-500 dark:text-slate-400">No Conversations</h4>
                <p className="text-[10px] text-slate-400 mt-1 max-w-[200px] mx-auto">
                  Type a username above to start chatting with friends securely.
                </p>
              </div>
            ) : (
              sortedConversations.map((conv) => {
                const isActive = activeConversation?.id === conv.id;
                const isOnline = conv.recipient?.status === 'online';
                const hasUnread = (conv.unreadCount || 0) > 0;
                
                const getLastMessagePreview = () => {
                  if (!conv.lastMessage) return 'No messages yet';
                  if (conv.lastMessage.deletedForAll) return 'This message was deleted.';
                  if (conv.e2eEnabled) return '🔒 Encrypted message';
                  if (conv.lastMessage.messageType === 'audio') return '🎤 Voice Note';
                  if (conv.lastMessage.messageType === 'image') return '🖼️ Image';
                  if (conv.lastMessage.messageType === 'video') return '📹 Video';
                  if (conv.lastMessage.messageType === 'file') return '📁 Attachment';
                  return conv.lastMessage.content;
                };

                return (
                  <motion.div
                    whileTap={{ scale: 0.98 }}
                    key={conv.id}
                    onClick={() => {
                      selectConversation(conv);
                      setMobileView('chat');
                    }}
                    className={`group p-3 flex items-center gap-3 rounded-2xl cursor-pointer hover:bg-slate-200/50 dark:hover:bg-slate-800/40 transition-all ${
                      isActive 
                        ? 'bg-slate-200/70 dark:bg-slate-800/60 shadow-inner' 
                        : 'bg-white/10 dark:bg-white/[0.02]'
                    }`}
                  >
                    <div className="relative shrink-0">
                      <div className="w-11 h-11 rounded-xl bg-indigo-500/20 text-indigo-500 dark:text-indigo-400 flex items-center justify-center font-bold text-sm uppercase border border-white/10">
                        {conv.recipient?.avatarUrl ? (
                          <img src={conv.recipient.avatarUrl} alt="" className="w-full h-full object-cover rounded-xl" />
                        ) : (
                          conv.recipient?.displayName.charAt(0) || '?'
                        )}
                      </div>
                      {isOnline && (
                        <div className="absolute -bottom-0.5 -right-0.5 w-3.5 h-3.5 rounded-full bg-emerald-500 border-2 border-slate-900 shadow-md" />
                      )}
                    </div>

                    <div className="flex-1 min-w-0">
                      <div className="flex justify-between items-baseline mb-0.5">
                        <h4 className="text-xs font-extrabold text-slate-800 dark:text-slate-200 truncate pr-2">
                          {conv.recipient?.displayName || 'Unknown Friend'}
                        </h4>
                        <span className="text-[9px] text-slate-400 font-medium whitespace-nowrap">
                          {new Date(conv.updatedAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                        </span>
                      </div>
                      <div className="flex justify-between items-center">
                        <p className={`text-[11px] truncate pr-4 ${hasUnread ? 'font-bold text-slate-800 dark:text-slate-100' : 'text-slate-400'}`}>
                          {typingUser === conv.recipient?.id ? (
                            <span className="text-indigo-500 dark:text-indigo-400 font-semibold animate-pulse">is typing...</span>
                          ) : (
                            getLastMessagePreview()
                          )}
                        </p>
                        
                        <div className="flex items-center gap-1.5 shrink-0">
                          {conv.isPinned && <Pin className="w-3 h-3 text-slate-400 rotate-45" />}
                          {conv.e2eEnabled && <Shield className="w-3 h-3 text-indigo-500" />}
                          {hasUnread && (
                            <span className="w-4.5 h-4.5 rounded-full bg-indigo-600 dark:bg-indigo-500 text-white flex items-center justify-center text-[9px] font-black leading-none animate-bounce">
                              {conv.unreadCount}
                            </span>
                          )}
                        </div>
                      </div>
                    </div>
                  </motion.div>
                );
              })
            )}
          </div>
        </aside>

        {/* ========================================================= */}
        {/* CONVERSATION AREA PANE (RIGHT) */}
        {/* ========================================================= */}
        <main className={`${mobileView === 'chat' ? 'flex' : 'hidden'} lg:flex flex-col flex-1 bg-white/20 dark:bg-slate-900/10 backdrop-blur-xl h-full overflow-hidden transition-all`}>
          {activeConversation ? (
            <>
              {/* Active Chat Header */}
              <div className="p-4 border-b border-slate-200/50 dark:border-slate-800/40 bg-white/40 dark:bg-slate-900/40 flex items-center justify-between select-none">
                <div className="flex items-center gap-3">
                  <button 
                    onClick={() => setMobileView('sidebar')} 
                    className="lg:hidden p-2 -ml-2 rounded-lg hover:bg-slate-200 dark:hover:bg-slate-800 transition"
                  >
                    <ChevronLeft className="w-5 h-5" />
                  </button>
                  
                  <div className="relative">
                    <div className="w-10 h-10 rounded-xl bg-indigo-500/20 text-indigo-500 dark:text-indigo-400 flex items-center justify-center font-bold text-sm uppercase border border-white/10">
                      {activeConversation.recipient?.avatarUrl ? (
                        <img src={activeConversation.recipient.avatarUrl} alt="" className="w-full h-full object-cover rounded-xl" />
                      ) : (
                        activeConversation.recipient?.displayName.charAt(0) || '?'
                      )}
                    </div>
                    {activeConversation.recipient?.status === 'online' && (
                      <div className="absolute -bottom-0.5 -right-0.5 w-3 h-3 rounded-full bg-emerald-500 border-2 border-slate-900 shadow-sm" />
                    )}
                  </div>
                  <div>
                    <h3 className="font-extrabold text-sm tracking-tight leading-tight">
                      {activeConversation.recipient?.displayName}
                    </h3>
                    <p className="text-[10px] text-slate-500 dark:text-slate-400 font-medium leading-none mt-0.5">
                      {typingUser === activeConversation.recipient?.id ? (
                        <span className="text-indigo-500 dark:text-indigo-400 font-semibold">typing...</span>
                      ) : activeConversation.recipient?.status === 'online' ? (
                        'Online'
                      ) : (
                        'Offline'
                      )}
                    </p>
                  </div>
                </div>

                {/* Header Actions */}
                <div className="flex items-center gap-1.5">
                  <button
                    onClick={() => {
                      if (!activeConversation.e2eEnabled) {
                        initiateE2EChat();
                      } else {
                        toast('E2EE is active. Messages are strictly private.', 'info');
                        confetti({ particleCount: 50, spread: 60, colors: ['#6366f1', '#8b5cf6'] });
                      }
                    }}
                    className={`p-2 rounded-lg transition-all flex items-center gap-1 text-[10px] font-extrabold ${
                      activeConversation.e2eEnabled 
                        ? 'bg-emerald-500/10 text-emerald-500 border border-emerald-500/20 shadow-sm' 
                        : 'bg-indigo-500/10 text-indigo-500 hover:bg-indigo-500/20 border border-indigo-500/20'
                    }`}
                    title={activeConversation.e2eEnabled ? "Secure E2E active" : "Enable E2EE Security"}
                  >
                    <Shield className="w-4 h-4" />
                    <span className="hidden sm:inline">
                      {activeConversation.e2eEnabled ? 'Secure Chat' : 'Go Secure'}
                    </span>
                  </button>

                  <button
                    onClick={() => {
                      setShowSearchInChat(!showSearchInChat);
                      setSearchChatQuery('');
                      setSearchedMessages([]);
                    }}
                    className={`p-2 rounded-lg hover:bg-slate-200/50 dark:hover:bg-slate-800/50 transition text-slate-500 dark:text-slate-400 ${
                      showSearchInChat ? 'bg-slate-200 dark:bg-slate-800 text-indigo-500' : ''
                    }`}
                    title="Search Messages"
                  >
                    <Search className="w-4 h-4" />
                  </button>

                  <button
                    onClick={() => togglePinChat(activeConversation.id)}
                    className={`p-2 rounded-lg hover:bg-slate-200/50 dark:hover:bg-slate-800/50 transition text-slate-500 dark:text-slate-400 ${
                      activeConversation.isPinned ? 'text-indigo-500' : ''
                    }`}
                    title="Pin Chat"
                  >
                    <Pin className="w-4 h-4 rotate-45" />
                  </button>

                  <button
                    onClick={() => toggleArchiveChat(activeConversation.id)}
                    className={`p-2 rounded-lg hover:bg-slate-200/50 dark:hover:bg-slate-800/50 transition text-slate-500 dark:text-slate-400 ${
                      activeConversation.isArchived ? 'text-indigo-500' : ''
                    }`}
                    title="Archive Chat"
                  >
                    <Archive className="w-4 h-4" />
                  </button>

                  <button
                    onClick={handleBlockCurrent}
                    className="p-2 rounded-lg hover:bg-red-500/10 text-slate-500 dark:text-slate-400 hover:text-red-500 transition"
                    title="Block Friend"
                  >
                    <Ban className="w-4 h-4" />
                  </button>
                </div>
              </div>

              {/* Chat Search Overlay panel */}
              {showSearchInChat && (
                <div className="p-3 bg-slate-200/40 dark:bg-slate-900/60 border-b border-slate-200 dark:border-slate-800 flex flex-col gap-2 relative z-15">
                  <div className="flex items-center gap-2">
                    <input
                      type="text"
                      placeholder="Search message text in history..."
                      value={searchChatQuery}
                      onChange={(e) => setSearchChatQuery(e.target.value)}
                      className="flex-1 px-3 py-1.5 rounded-lg glass-input text-xs"
                      autoFocus
                    />
                    <button 
                      onClick={() => { setShowSearchInChat(false); setSearchChatQuery(''); setSearchedMessages([]); }}
                      className="p-1.5 rounded bg-slate-300 dark:bg-slate-800 text-xs font-bold"
                    >
                      Close
                    </button>
                  </div>
                  {searchedMessages.length > 0 && (
                    <div className="max-h-48 overflow-y-auto space-y-1.5 mt-1 bg-white/90 dark:bg-slate-900/90 rounded-xl p-2 border border-slate-200 dark:border-slate-800 shadow-lg">
                      <div className="text-[9px] uppercase font-bold text-slate-400 px-1">Found Matches</div>
                      {searchedMessages.map((m) => (
                        <div 
                          key={m._id}
                          className="p-2 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800/80 border border-slate-100 dark:border-slate-800/40 flex justify-between items-center"
                        >
                          <div className="min-w-0 flex-1">
                            <div className="text-[10px] font-extrabold">{m.sender.displayName}</div>
                            <div className="text-[11px] text-slate-600 dark:text-slate-300 truncate">{m.content}</div>
                          </div>
                          <span className="text-[8px] text-slate-400">{new Date(m.createdAt).toLocaleDateString()}</span>
                        </div>
                      ))}
                    </div>
                  )}
                  {searchChatQuery && searchedMessages.length === 0 && (
                    <div className="text-center text-[10px] text-slate-400 py-1">No matching messages found</div>
                  )}
                </div>
              )}

              {/* Message Streams List */}
              <div className="flex-1 overflow-y-auto p-4 space-y-4 bg-slate-50/10 dark:bg-slate-950/10 relative">
                {loadingMessages ? (
                  <MessageStreamSkeleton />
                ) : messages.length === 0 ? (
                  <div className="flex flex-col items-center justify-center h-full select-none py-12 text-center">
                    <div className="w-16 h-16 rounded-3xl bg-indigo-500/10 dark:bg-indigo-500/5 text-indigo-500 dark:text-indigo-400 flex items-center justify-center mb-4">
                      <Shield className="w-8 h-8 animate-pulse" />
                    </div>
                    <h4 className="font-extrabold text-sm text-slate-600 dark:text-slate-400">Security Initiated</h4>
                    <p className="text-[11px] text-slate-400 max-w-[280px] mt-1 leading-relaxed px-4">
                      {activeConversation.e2eEnabled 
                        ? 'All messages sent in this chat are secured with End-to-End Encryption. Only you and your friend can read them.'
                        : 'Start typing to chat! For absolute privacy, click "Go Secure" above to negotiate encryption.'}
                    </p>
                  </div>
                ) : (
                  messages.map((msg, index) => {
                    const isSelf = msg.sender._id === user?.id;
                    const isRead = msg.readBy.some(id => id !== user?.id);
                    const isDelivered = msg.deliveredTo.some(id => id !== user?.id);
                    
                    const messageDate = new Date(msg.createdAt).toDateString();
                    const prevMessageDate = index > 0 ? new Date(messages[index - 1].createdAt).toDateString() : null;
                    const showDateHeader = messageDate !== prevMessageDate;

                    return (
                      <React.Fragment key={msg._id}>
                        {showDateHeader && (
                          <div className="flex justify-center select-none py-2">
                            <span className="px-3 py-1 rounded-full text-[9px] font-extrabold tracking-wider bg-slate-200 dark:bg-slate-800 text-slate-500 dark:text-slate-400 uppercase">
                              {new Date(msg.createdAt).toLocaleDateString([], { weekday: 'short', month: 'short', day: 'numeric' })}
                            </span>
                          </div>
                        )}

                        <div className={`flex ${isSelf ? 'justify-end' : 'justify-start'} relative group`}>
                          
                          <div 
                            className={`max-w-[80%] rounded-2xl px-4 py-2.5 relative flex flex-col ${
                              isSelf
                                ? 'bg-bubble-self text-white shadow-md rounded-tr-none'
                                : 'bg-bubble-peer border border-slate-200/50 dark:border-slate-800/40 text-slate-900 dark:text-slate-100 rounded-tl-none shadow-sm'
                            }`}
                          >
                            {msg.replyTo && (
                              <div className={`mb-1.5 p-1.5 border-l-2 rounded bg-black/5 dark:bg-black/20 text-[10px] max-w-full truncate ${
                                isSelf ? 'border-white' : 'border-indigo-500'
                              }`}>
                                <div className="font-extrabold">{msg.replyTo.sender.displayName}</div>
                                <div className="truncate opacity-80">{msg.replyTo.content}</div>
                              </div>
                            )}

                            {msg.messageType === 'text' && (
                              <p className="text-sm break-words leading-relaxed whitespace-pre-wrap">
                                {msg.content}
                              </p>
                            )}

                            {msg.messageType === 'image' && msg.fileUrl && (
                              <div className="rounded-lg overflow-hidden my-1 max-w-xs border border-white/10 shadow-sm relative group/img">
                                <img 
                                  src={`http://localhost:5000${msg.fileUrl}`} 
                                  alt="Attachment" 
                                  className="w-full max-h-60 object-cover cursor-pointer hover:opacity-95 transition"
                                  onClick={() => window.open(`http://localhost:5000${msg.fileUrl}`)}
                                />
                              </div>
                            )}

                            {msg.messageType === 'video' && msg.fileUrl && (
                              <div className="rounded-lg overflow-hidden my-1 max-w-xs shadow-sm">
                                <video src={`http://localhost:5000${msg.fileUrl}`} controls className="w-full max-h-60 object-cover" />
                              </div>
                            )}

                            {msg.messageType === 'audio' && msg.fileUrl && (
                              <div className="flex items-center gap-2 py-1 select-none">
                                <audio src={`http://localhost:5000${msg.fileUrl}`} controls className="w-48 sm:w-60 h-8 brightness-95 opacity-90" />
                              </div>
                            )}

                            {msg.messageType === 'file' && msg.fileUrl && (
                              <a 
                                href={`http://localhost:5000${msg.fileUrl}`} 
                                download
                                target="_blank"
                                rel="noreferrer"
                                className="flex items-center gap-2 p-2 rounded-lg bg-black/5 dark:bg-white/5 my-1 hover:bg-black/10 dark:hover:bg-white/10 transition border border-white/10"
                              >
                                <Paperclip className="w-4 h-4" />
                                <div className="text-[10px] text-left leading-tight min-w-0 flex-1">
                                  <div className="font-extrabold truncate">{msg.fileName}</div>
                                  <div className="opacity-80">{( (msg.fileSize || 0) / 1024 / 1024 ).toFixed(2)} MB</div>
                                </div>
                              </a>
                            )}

                            <div className="flex justify-end items-center gap-1.5 mt-1 select-none text-[9px] opacity-75">
                              {msg.isEdited && <span className="italic font-bold">edited</span>}
                              <span>
                                {new Date(msg.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                              </span>
                              {isSelf && (
                                <span>
                                  {isRead ? (
                                    <CheckCheck className="w-3.5 h-3.5 text-indigo-200" />
                                  ) : isDelivered ? (
                                    <CheckCheck className="w-3.5 h-3.5 text-slate-400" />
                                  ) : (
                                    <Check className="w-3.5 h-3.5 text-slate-400" />
                                  )}
                                </span>
                              )}
                            </div>
                          </div>

                          {/* Hover action menu trigger */}
                          <div className={`opacity-0 group-hover:opacity-100 flex items-center mx-2 transition select-none ${isSelf ? 'order-first' : 'order-last'}`}>
                            <button
                              onClick={() => setActiveMenuId(activeMenuId === msg._id ? null : msg._id)}
                              className="p-1 rounded-full hover:bg-slate-200 dark:hover:bg-slate-800 transition text-slate-400 hover:text-slate-600 dark:hover:text-slate-200"
                            >
                              <MoreVertical className="w-4 h-4" />
                            </button>

                            <AnimatePresence>
                              {activeMenuId === msg._id && (
                                <motion.div 
                                  initial={{ opacity: 0, scale: 0.95, y: 5 }}
                                  animate={{ opacity: 1, scale: 1, y: 0 }}
                                  exit={{ opacity: 0, scale: 0.95, y: 5 }}
                                  className={`absolute bottom-8 z-30 w-36 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 shadow-xl p-1 text-[11px] ${
                                    isSelf ? 'right-0' : 'left-0'
                                  }`}
                                >
                                  <button
                                    onClick={() => { setReplyingTo(msg); setActiveMenuId(null); }}
                                    className="w-full text-left p-2 hover:bg-slate-100 dark:hover:bg-slate-800/80 rounded-lg flex items-center gap-2 text-slate-700 dark:text-slate-300 font-semibold"
                                  >
                                    <CornerUpLeft className="w-3.5 h-3.5" />
                                    Reply
                                  </button>
                                  
                                  {isSelf && !msg.deletedForAll && msg.messageType === 'text' && (
                                    <button
                                      onClick={() => {
                                        setEditingMessageId(msg._id);
                                        setEditInput(msg.content);
                                        setActiveMenuId(null);
                                      }}
                                      className="w-full text-left p-2 hover:bg-slate-100 dark:hover:bg-slate-800/80 rounded-lg flex items-center gap-2 text-slate-700 dark:text-slate-300 font-semibold"
                                    >
                                      <Edit2 className="w-3.5 h-3.5" />
                                      Edit
                                    </button>
                                  )}

                                  {!msg.deletedForAll && (
                                    <button
                                      onClick={() => {
                                        setForwardingMessageId(msg._id);
                                        setShowForwardModal(true);
                                        setActiveMenuId(null);
                                      }}
                                      className="w-full text-left p-2 hover:bg-slate-100 dark:hover:bg-slate-800/80 rounded-lg flex items-center gap-2 text-slate-700 dark:text-slate-300 font-semibold"
                                    >
                                      <Send className="w-3.5 h-3.5" />
                                      Forward
                                    </button>
                                  )}

                                  <button
                                    onClick={() => handleDeleteMessage(msg._id, false)}
                                    className="w-full text-left p-2 hover:bg-slate-100 dark:hover:bg-slate-800/80 rounded-lg flex items-center gap-2 text-slate-700 dark:text-slate-300 font-semibold"
                                  >
                                    <Trash2 className="w-3.5 h-3.5" />
                                    Delete for Me
                                  </button>

                                  {isSelf && !msg.deletedForAll && (
                                    <button
                                      onClick={() => handleDeleteMessage(msg._id, true)}
                                      className="w-full text-left p-2 hover:bg-slate-100 dark:hover:bg-slate-800/80 rounded-lg flex items-center gap-2 text-rose-500 font-semibold"
                                    >
                                      <Trash2 className="w-3.5 h-3.5" />
                                      Delete for All
                                    </button>
                                  )}
                                </motion.div>
                              )}
                            </AnimatePresence>
                          </div>
                        </div>
                      </React.Fragment>
                    );
                  })
                )}
                <div ref={messagesEndRef} />
              </div>

              {/* Editing mode banner */}
              {editingMessageId && (
                <div className="p-3 bg-indigo-500/10 border-t border-indigo-500/20 flex items-center justify-between text-xs font-semibold text-indigo-500 select-none">
                  <div className="flex items-center gap-2">
                    <Edit2 className="w-4 h-4 shrink-0" />
                    <span>Editing Message...</span>
                  </div>
                  <div className="flex gap-2 items-center">
                    <input 
                      type="text" 
                      value={editInput}
                      onChange={(e) => setEditInput(e.target.value)}
                      className="px-2 py-1 bg-white dark:bg-slate-900 border border-indigo-500/20 rounded-md text-xs font-medium focus:outline-none"
                    />
                    <button 
                      onClick={() => {
                        editMessageText(editingMessageId, editInput);
                        setEditingMessageId(null);
                        setEditInput('');
                        toast('Message edited', 'success');
                      }}
                      className="px-2 py-1 bg-indigo-500 text-white rounded text-[10px] font-semibold cursor-pointer"
                    >
                      Save
                    </button>
                    <button 
                      onClick={() => { setEditingMessageId(null); setEditInput(''); }}
                      className="px-2 py-1 bg-slate-300 dark:bg-slate-850 rounded text-[10px] text-slate-700 dark:text-slate-300 font-semibold cursor-pointer"
                    >
                      Cancel
                    </button>
                  </div>
                </div>
              )}

              {/* Replying banner */}
              {replyingTo && (
                <div className="px-4 py-2 bg-slate-200/50 dark:bg-slate-900/50 border-t border-slate-200/50 dark:border-slate-800/40 flex items-center justify-between select-none text-xs">
                  <div className="flex items-center gap-2 border-l-2 border-indigo-500 pl-3">
                    <div>
                      <div className="font-extrabold text-slate-800 dark:text-slate-200">Replying to {replyingTo.sender.displayName}</div>
                      <div className="text-slate-500 truncate max-w-lg mt-0.5">{replyingTo.content}</div>
                    </div>
                  </div>
                  <button 
                    onClick={() => setReplyingTo(null)} 
                    className="p-1 rounded-full hover:bg-slate-350 dark:hover:bg-slate-800 text-slate-500"
                  >
                    <X className="w-4 h-4" />
                  </button>
                </div>
              )}

              {/* Chat Bottom Input controls */}
              <div className="p-3 bg-white/40 dark:bg-slate-900/40 border-t border-slate-200/50 dark:border-slate-800/40 flex flex-col gap-2 relative">
                
                {/* Emoji Popover floating block */}
                <AnimatePresence>
                  {showEmoji && (
                    <motion.div 
                      initial={{ opacity: 0, y: 10, scale: 0.95 }}
                      animate={{ opacity: 1, y: 0, scale: 1 }}
                      exit={{ opacity: 0, y: 10, scale: 0.95 }}
                      className="absolute bottom-16 left-4 z-40 p-2 rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-950 shadow-2xl flex gap-2"
                    >
                      {emojis.map((emoji) => (
                        <button
                          key={emoji}
                          onClick={() => {
                            setMessageInput((prev) => prev + emoji);
                            setShowEmoji(false);
                          }}
                          className="text-lg hover:scale-125 transition duration-100 cursor-pointer"
                        >
                          {emoji}
                        </button>
                      ))}
                    </motion.div>
                  )}
                </AnimatePresence>

                <div className="flex items-center gap-2">
                  <button
                    onClick={() => fileInputRef.current?.click()}
                    disabled={uploading}
                    className="p-2.5 rounded-xl hover:bg-slate-200/50 dark:hover:bg-slate-800/50 text-slate-500 dark:text-slate-400 transition"
                    title="Attach File"
                  >
                    {uploading ? (
                      <div className="w-5 h-5 rounded-full border-2 border-indigo-500 border-t-transparent animate-spin" />
                    ) : (
                      <Paperclip className="w-5 h-5" />
                    )}
                  </button>
                  <input
                    type="file"
                    ref={fileInputRef}
                    onChange={handleFileChange}
                    className="hidden"
                  />

                  <button
                    onClick={() => setShowEmoji(!showEmoji)}
                    className="p-2.5 rounded-xl hover:bg-slate-200/50 dark:hover:bg-slate-800/50 text-slate-500 dark:text-slate-400 transition"
                    title="Emojis"
                  >
                    <Smile className="w-5 h-5" />
                  </button>

                  <form onSubmit={handleSendText} className="flex-1 flex gap-2">
                    <input
                      type="text"
                      placeholder="Type a message..."
                      value={messageInput}
                      onChange={handleInputChange}
                      disabled={isRecording}
                      className="flex-1 px-4 py-2.5 rounded-xl glass-input text-sm"
                    />

                    {isRecording ? (
                      <div className="flex items-center gap-2 bg-rose-500/10 border border-rose-500/20 text-rose-500 px-3 py-1.5 rounded-xl text-xs font-bold animate-pulse">
                        <Square className="w-3.5 h-3.5 text-rose-500 animate-spin shrink-0" />
                        <span>{recordingSeconds}s</span>
                        <button 
                          type="button" 
                          onClick={() => stopRecording(false)} 
                          className="px-2 py-0.5 bg-rose-500 text-white rounded text-[10px] font-bold cursor-pointer"
                        >
                          Send
                        </button>
                        <button 
                          type="button" 
                          onClick={() => stopRecording(true)} 
                          className="px-2 py-0.5 bg-slate-200 dark:bg-slate-800 rounded text-[10px] text-slate-700 dark:text-slate-400 font-bold cursor-pointer"
                        >
                          Cancel
                        </button>
                      </div>
                    ) : (
                      <button
                        type="button"
                        onClick={startRecording}
                        className="p-2.5 rounded-xl hover:bg-slate-200/50 dark:hover:bg-slate-800/50 text-slate-500 dark:text-slate-400 transition cursor-pointer"
                        title="Record Voice Note"
                      >
                        <Mic className="w-5 h-5" />
                      </button>
                    )}

                    <button
                      type="submit"
                      disabled={!messageInput.trim()}
                      className="p-2.5 rounded-xl bg-indigo-600 dark:bg-indigo-500 text-white hover:bg-indigo-700 disabled:bg-slate-300 dark:disabled:bg-slate-800/50 disabled:text-slate-400 transition shadow-md shadow-indigo-600/10 shrink-0 cursor-pointer"
                    >
                      <Send className="w-5 h-5" />
                    </button>
                  </form>
                </div>
              </div>
            </>
          ) : (
            <motion.div
              initial="hidden"
              animate="visible"
              variants={{
                hidden: { opacity: 0 },
                visible: {
                  opacity: 1,
                  transition: {
                    staggerChildren: 0.15
                  }
                }
              }}
              className="flex-1 flex flex-col items-center justify-center select-none p-8 text-center"
            >
              {/* Floating Welcome Logo */}
              <motion.div
                variants={{
                  hidden: { scale: 0.8, opacity: 0, y: 20 },
                  visible: { scale: 1, opacity: 1, y: 0, transition: { type: 'spring', stiffness: 100 } }
                }}
                animate={{
                  y: [0, -10, 0]
                }}
                transition={{
                  y: {
                    duration: 3.5,
                    repeat: Infinity,
                    ease: "easeInOut"
                  }
                }}
                className="w-20 h-20 rounded-3xl bg-gradient-to-tr from-indigo-500 to-purple-600 flex items-center justify-center shadow-lg shadow-indigo-500/25 mb-6 cursor-pointer"
              >
                <MessageSquare className="w-10 h-10 text-white" />
              </motion.div>

              <motion.h2
                variants={{
                  hidden: { y: 15, opacity: 0 },
                  visible: { y: 0, opacity: 1 }
                }}
                className="text-2xl font-extrabold font-display bg-clip-text text-transparent bg-gradient-to-r from-blue-600 via-indigo-500 to-purple-600 dark:from-blue-400 dark:to-purple-300 tracking-tight mb-2 animate-pulse-slow"
              >
                Welcome to Altma Chat
              </motion.h2>

              <motion.p
                variants={{
                  hidden: { y: 15, opacity: 0 },
                  visible: { y: 0, opacity: 1 }
                }}
                className="text-xs text-slate-600 dark:text-slate-400 max-w-sm leading-relaxed mb-6 font-medium"
              >
                A premium, secure environment designed solely for private chatting between close friends. 
                Type a friend's display name or username in the sidebar search to start an encrypted channel.
              </motion.p>

              <motion.div
                variants={{
                  hidden: { y: 15, opacity: 0 },
                  visible: { y: 0, opacity: 1 }
                }}
                className="flex gap-4 select-none"
              >
                <div className="flex items-center gap-2.5 p-3.5 rounded-2xl bg-white/70 dark:bg-slate-900/40 border border-slate-200/50 dark:border-white/5 text-xs text-left max-w-[200px] shadow-sm hover:shadow-md transition">
                  <Shield className="w-5.5 h-5.5 text-indigo-500 shrink-0 animate-pulse" />
                  <span className="leading-snug text-[10px] text-slate-700 dark:text-slate-300 font-semibold">Zero-knowledge client-side encryption ready.</span>
                </div>
                <div className="flex items-center gap-2.5 p-3.5 rounded-2xl bg-white/70 dark:bg-slate-900/40 border border-slate-200/50 dark:border-white/5 text-xs text-left max-w-[200px] shadow-sm hover:shadow-md transition">
                  <HelpCircle className="w-5.5 h-5.5 text-indigo-500 shrink-0" />
                  <span className="leading-snug text-[10px] text-slate-700 dark:text-slate-300 font-semibold">Fully responsive across all your active screens.</span>
                </div>
              </motion.div>
            </motion.div>
          )}
        </main>
      </div>

      {/* ========================================================= */}
      {/* CUSTOM CONFIRM BLOCK MODAL */}
      {/* ========================================================= */}
      <AnimatePresence>
        {showBlockModal && activeConversation?.recipient && (
          <div className="fixed inset-0 z-[150] flex items-center justify-center p-4 bg-black/60 backdrop-blur-[4px] select-none">
            <motion.div 
              initial={{ scale: 0.95, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.95, opacity: 0 }}
              className="w-full max-w-sm rounded-[2rem] p-6 glass-card border border-white/20 dark:border-white/10 shadow-2xl space-y-4"
            >
              <div className="w-12 h-12 rounded-2xl bg-red-500/10 dark:bg-red-500/20 text-red-500 flex items-center justify-center mx-auto">
                <Ban className="w-6 h-6" />
              </div>
              <div className="text-center space-y-2">
                <h3 className="font-extrabold text-sm tracking-tight text-slate-800 dark:text-slate-100">
                  Block {activeConversation.recipient.displayName}?
                </h3>
                <p className="text-[11px] text-slate-500 dark:text-slate-400 leading-normal px-2">
                  Blocked friends will no longer be able to message you or view your presence status. You can unblock them in settings.
                </p>
              </div>
              <div className="flex gap-2">
                <button
                  onClick={() => setShowBlockModal(false)}
                  className="flex-1 py-2.5 bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-750 text-slate-700 dark:text-slate-300 font-bold rounded-xl text-xs transition cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  onClick={executeBlockCurrent}
                  className="flex-1 py-2.5 bg-red-500 hover:bg-red-600 text-white font-bold rounded-xl text-xs transition cursor-pointer"
                >
                  Block Friend
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* ========================================================= */}
      {/* CUSTOM FORWARD MESSAGE MODAL */}
      {/* ========================================================= */}
      <AnimatePresence>
        {showForwardModal && forwardingMessageId && (
          <div className="fixed inset-0 z-[150] flex items-center justify-center p-4 bg-black/60 backdrop-blur-[4px] select-none">
            <motion.div 
              initial={{ scale: 0.95, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.95, opacity: 0 }}
              className="w-full max-w-sm rounded-[2rem] p-6 bg-white dark:bg-slate-950 border border-slate-200 dark:border-slate-800 shadow-2xl flex flex-col max-h-[70vh]"
            >
              <div className="flex justify-between items-center mb-4 pb-2 border-b border-slate-100 dark:border-slate-900">
                <h3 className="font-extrabold text-sm tracking-tight text-slate-800 dark:text-slate-100 flex items-center gap-2">
                  <Send className="w-4.5 h-4.5 text-indigo-500" /> Forward Message
                </h3>
                <button 
                  onClick={() => { setShowForwardModal(false); setForwardingMessageId(null); }}
                  className="p-1.5 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-900 text-slate-400"
                >
                  <X className="w-4.5 h-4.5" />
                </button>
              </div>
              <div className="text-[10px] text-slate-400 font-bold mb-2 uppercase tracking-wide">Select Chat</div>
              
              <div className="flex-1 overflow-y-auto space-y-1 pr-1.5">
                {conversations.map((conv) => (
                  <div
                    key={conv.id}
                    onClick={() => handleForwardMessage(conv.id)}
                    className="p-2.5 rounded-xl hover:bg-slate-100 dark:hover:bg-slate-900 flex items-center gap-3 cursor-pointer transition border border-transparent hover:border-slate-200/50 dark:hover:border-slate-800/40"
                  >
                    <div className="w-9 h-9 rounded-lg bg-indigo-500/20 text-indigo-500 flex items-center justify-center font-bold text-xs uppercase shrink-0">
                      {conv.recipient?.avatarUrl ? (
                        <img src={conv.recipient.avatarUrl} alt="" className="w-full h-full object-cover rounded-lg" />
                      ) : (
                        conv.recipient?.displayName.charAt(0)
                      )}
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="text-xs font-extrabold truncate">{conv.recipient?.displayName}</div>
                      <div className="text-[9px] text-slate-400 truncate">@{conv.recipient?.username}</div>
                    </div>
                  </div>
                ))}
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* ========================================================= */}
      {/* SETTINGS DRAWER OVERLAY (RIGHT DRAW) */}
      {/* ========================================================= */}
      <AnimatePresence>
        {showSettings && (
          <div className="absolute inset-0 z-50 flex justify-end bg-black/60 backdrop-blur-[4px] select-none">
            <motion.div 
              initial={{ x: '100%' }}
              animate={{ x: 0 }}
              exit={{ x: '100%' }}
              transition={{ type: 'spring', damping: 25, stiffness: 220 }}
              className="w-full max-w-md h-full bg-white dark:bg-slate-950 shadow-2xl flex flex-col border-l border-slate-200 dark:border-slate-800"
            >
              <div className="p-4 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between">
                <h3 className="font-extrabold text-base flex items-center gap-2 tracking-tight text-slate-800 dark:text-slate-100">
                  <Settings className="w-5 h-5 text-indigo-500 animate-spin" style={{ animationDuration: '6s' }} />
                  Settings
                </h3>
                <button 
                  onClick={() => setShowSettings(false)}
                  className="p-2 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-900 text-slate-500"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>

              <div className="flex border-b border-slate-100 dark:border-slate-900 text-xs">
                {(['profile', 'security', 'privacy', 'blocked'] as const).map((tab) => (
                  <button
                    key={tab}
                    onClick={() => setSettingsTab(tab)}
                    className={`flex-1 py-3 text-[10px] font-bold uppercase tracking-wider text-center border-b-2 transition ${
                      settingsTab === tab 
                        ? 'border-indigo-500 text-indigo-500 dark:text-indigo-400' 
                        : 'border-transparent text-slate-500 hover:text-slate-800 dark:hover:text-slate-300'
                    }`}
                  >
                    {tab}
                  </button>
                ))}
              </div>

              <div className="flex-1 overflow-y-auto p-5">
                {settingsTab === 'profile' && (
                  <form onSubmit={handleSaveProfile} className="space-y-4">
                    <div className="flex flex-col items-center mb-6">
                      <div className="w-20 h-20 rounded-2xl bg-indigo-500/20 text-indigo-500 flex items-center justify-center font-bold text-2xl mb-3 relative overflow-hidden shadow-inner border border-slate-200 dark:border-slate-800">
                        {editAvatar ? (
                          <img src={editAvatar} alt="Profile" className="w-full h-full object-cover" />
                        ) : (
                          user?.displayName.charAt(0).toUpperCase()
                        )}
                      </div>
                      <span className="text-[10px] text-slate-400 font-bold uppercase tracking-wider">Interactive Profile Settings</span>
                    </div>

                    <div className="space-y-1">
                      <label className="text-[10px] uppercase font-bold text-slate-400">Display Name</label>
                      <input
                        type="text"
                        value={editName}
                        onChange={(e) => setEditName(e.target.value)}
                        className="w-full px-3 py-2 rounded-lg glass-input text-xs"
                        required
                      />
                    </div>

                    <div className="space-y-1">
                      <label className="text-[10px] uppercase font-bold text-slate-400">Bio</label>
                      <textarea
                        value={editBio}
                        onChange={(e) => setEditBio(e.target.value)}
                        rows={3}
                        maxLength={160}
                        className="w-full px-3 py-2 rounded-lg glass-input text-xs resize-none"
                      />
                    </div>

                    <div className="space-y-1">
                      <label className="text-[10px] uppercase font-bold text-slate-400">Avatar Image URL</label>
                      <input
                        type="text"
                        placeholder="e.g. https://images.unsplash.com/..."
                        value={editAvatar}
                        onChange={(e) => setEditAvatar(e.target.value)}
                        className="w-full px-3 py-2 rounded-lg glass-input text-xs"
                      />
                    </div>

                    <button
                      type="submit"
                      className="w-full py-2.5 bg-indigo-600 hover:bg-indigo-700 text-white font-semibold rounded-lg text-xs transition cursor-pointer"
                    >
                      Save Profile Changes
                    </button>
                  </form>
                )}

                {settingsTab === 'security' && (
                  <form onSubmit={handleSavePassword} className="space-y-4">
                    <div className="space-y-1">
                      <label className="text-[10px] uppercase font-bold text-slate-400">Current Password</label>
                      <div className="relative">
                        <input
                          type={showPassOld ? 'text' : 'password'}
                          placeholder="Enter current password"
                          value={oldPassword}
                          onChange={(e) => setOldPassword(e.target.value)}
                          className="w-full px-3 py-2 rounded-lg glass-input text-xs pr-10"
                          required
                        />
                        <button
                          type="button"
                          onClick={() => setShowPassOld(!showPassOld)}
                          className="absolute right-3 top-2.5 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200"
                        >
                          {showPassOld ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                        </button>
                      </div>
                    </div>

                    <div className="space-y-1">
                      <label className="text-[10px] uppercase font-bold text-slate-400">New Password</label>
                      <div className="relative">
                        <input
                          type={showPassNew ? 'text' : 'password'}
                          placeholder="Enter new password"
                          value={newPassword}
                          onChange={(e) => setNewPassword(e.target.value)}
                          className="w-full px-3 py-2 rounded-lg glass-input text-xs pr-10"
                          required
                        />
                        <button
                          type="button"
                          onClick={() => setShowPassNew(!showPassNew)}
                          className="absolute right-3 top-2.5 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200"
                        >
                          {showPassNew ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                        </button>
                      </div>
                    </div>

                    <button
                      type="submit"
                      className="w-full py-2.5 bg-indigo-600 hover:bg-indigo-700 text-white font-semibold rounded-lg text-xs transition cursor-pointer"
                    >
                      Change Password
                    </button>

                    <div className="pt-4 border-t border-slate-250 dark:border-slate-800">
                      <div className="text-[10px] uppercase font-bold text-slate-400 mb-2 flex items-center gap-1">
                        <Key className="w-3.5 h-3.5 text-indigo-500" /> Cryptographic Keys (E2EE)
                      </div>
                      <div className="p-3 bg-slate-100 dark:bg-slate-900 border border-slate-200 dark:border-slate-800/40 rounded-xl text-[9px] font-mono break-all text-slate-500 dark:text-slate-400">
                        <div className="font-bold text-indigo-500 mb-1">Your Public RSA Key:</div>
                        {localStorage.getItem(`xhat_public_key_${user?.id}`) || 'No keys generated'}
                      </div>
                    </div>
                  </form>
                )}

                {settingsTab === 'privacy' && (
                  <div className="space-y-5">
                    <div className="space-y-2">
                      <label className="text-[10px] uppercase font-bold text-slate-400 block">Who can see my Last Seen status</label>
                      <div className="flex gap-2">
                        {(['everyone', 'friends', 'nobody'] as const).map((opt) => (
                          <button
                            key={opt}
                            onClick={() => setPrefLastSeen(opt)}
                            className={`flex-1 py-1.5 rounded-lg border text-[10px] font-bold uppercase transition cursor-pointer ${
                              prefLastSeen === opt 
                                ? 'bg-indigo-500 text-white border-indigo-500' 
                                : 'bg-slate-100 dark:bg-slate-900 border-slate-200 dark:border-slate-800 text-slate-600 dark:text-slate-400'
                            }`}
                          >
                            {opt}
                          </button>
                        ))}
                      </div>
                    </div>

                    <div className="space-y-2">
                      <label className="text-[10px] uppercase font-bold text-slate-400 block">Who can see my Profile picture</label>
                      <div className="flex gap-2">
                        {(['everyone', 'friends', 'nobody'] as const).map((opt) => (
                          <button
                            key={opt}
                            onClick={() => setPrefProfilePhoto(opt)}
                            className={`flex-1 py-1.5 rounded-lg border text-[10px] font-bold uppercase transition cursor-pointer ${
                              prefProfilePhoto === opt 
                                ? 'bg-indigo-500 text-white border-indigo-500' 
                                : 'bg-slate-100 dark:bg-slate-900 border-slate-200 dark:border-slate-800 text-slate-600 dark:text-slate-400'
                            }`}
                          >
                            {opt}
                          </button>
                        ))}
                      </div>
                    </div>

                    <button
                      onClick={handleSavePrivacy}
                      className="w-full py-2.5 bg-indigo-600 hover:bg-indigo-700 text-white font-semibold rounded-lg text-xs transition cursor-pointer"
                    >
                      Save Privacy Settings
                    </button>
                  </div>
                )}

                {settingsTab === 'blocked' && (
                  <div className="space-y-3">
                    {blockedUsers.length === 0 ? (
                      <div className="text-center py-8 text-xs text-slate-400">No blocked users</div>
                    ) : (
                      blockedUsers.map((item) => (
                        <div key={item.id} className="flex items-center justify-between p-3 bg-slate-100 dark:bg-slate-900/60 border border-slate-200 dark:border-slate-800/40 rounded-xl">
                          <div className="flex items-center gap-2">
                            <div className="w-8 h-8 rounded-lg bg-indigo-500/20 text-indigo-500 flex items-center justify-center font-bold text-[10px]">
                              {item.avatarUrl ? (
                                <img src={item.avatarUrl} alt="" className="w-full h-full object-cover rounded-lg" />
                              ) : (
                                item.displayName.charAt(0)
                              )}
                            </div>
                            <div>
                              <div className="text-xs font-bold">{item.displayName}</div>
                              <div className="text-[9px] text-slate-400">@{item.username}</div>
                            </div>
                          </div>
                          <button 
                            onClick={() => handleUnblockUser(item.id)}
                            className="px-2.5 py-1 bg-indigo-500 hover:bg-indigo-600 text-white rounded text-[10px] font-bold cursor-pointer transition"
                          >
                            Unblock
                          </button>
                        </div>
                      ))
                    )}
                  </div>
                )}
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
};
export default Dashboard;
