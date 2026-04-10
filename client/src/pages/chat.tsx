import { useState, useRef, useEffect, useCallback, useMemo } from "react";
import type { ChatMessage } from "@shared/schema";
import { useChat } from "@/hooks/use-chat";
import { useAuth } from "@/lib/auth";
import { useI18n } from "@/lib/i18n";
import { useSoundEffects } from "@/hooks/use-sound-effects";
import { useChatPin } from "@/hooks/use-chat-pin";
import { useChatMedia, useChatAutoDelete } from "@/hooks/use-chat-features";
import { useMessageTranslation } from "@/hooks/use-message-translation";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { MessageCircle, Send, Check, CheckCheck, Loader2, AlertCircle, Search, Timer, ArrowLeft, Shield, Lock, Paperclip, Reply, Trash2, Pencil, Smile, X, CornerDownRight, Mic, MicOff, ChevronDown, Languages, Palette } from "lucide-react";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { cn } from "@/lib/utils";
import { format, isToday, isYesterday } from "date-fns";
import { PinLockScreen, PinSetupDialog } from "@/components/chat-pin-lock";
import { MediaUploadButton, MediaPurchaseDialog, ChatMediaRenderer } from "@/components/chat-media";
import { AutoDeleteToggle, AutoDeletePurchaseDialog, AutoDeleteSettingsDialog, AutoDeleteCountdown } from "@/components/chat-auto-delete";

const QUICK_REACTIONS = ["❤️", "👍", "😂", "😮", "😢", "🔥"];

interface DirectConversationUser {
  id: string;
  username: string;
  firstName: string | null;
  lastName: string | null;
  avatarUrl: string | null;
  accountId: string | null;
}

type BubbleStylePreset = "classic" | "vivid" | "compact";
const BUBBLE_STYLE_STORAGE_KEY = "vex_chat_bubble_style";

function getSavedBubbleStyle(): BubbleStylePreset {
  const raw = typeof window !== "undefined" ? window.localStorage.getItem(BUBBLE_STYLE_STORAGE_KEY) : null;
  if (raw === "classic" || raw === "vivid" || raw === "compact") {
    return raw;
  }
  return "vivid";
}

function getBubbleClassNames(isMine: boolean, preset: BubbleStylePreset): string {
  if (preset === "classic") {
    return isMine
      ? "bg-primary text-primary-foreground rounded-br-sm"
      : "bg-muted rounded-bl-sm";
  }

  if (preset === "compact") {
    return isMine
      ? "bg-primary/95 text-primary-foreground rounded-lg border border-primary/30 px-2.5 py-1.5"
      : "bg-card rounded-lg border border-border/60 px-2.5 py-1.5";
  }

  return isMine
    ? "bg-gradient-to-br from-primary to-primary/80 text-primary-foreground rounded-2xl rounded-br-sm shadow-md border border-primary/30"
    : "bg-gradient-to-br from-card to-muted/80 rounded-2xl rounded-bl-sm border border-border/60 shadow-sm";
}

function formatMessageTime(dateValue: string | Date, t: (key: string, params?: Record<string, string | number>) => string) {
  const date = typeof dateValue === 'string' ? new Date(dateValue) : dateValue;
  if (isToday(date)) return format(date, "HH:mm");
  if (isYesterday(date)) return t('chat.yesterday') + " " + format(date, "HH:mm");
  return format(date, "d/M HH:mm");
}

function formatLastSeen(dateValue: string | Date | null | undefined, t: (key: string, params?: Record<string, string | number>) => string) {
  if (!dateValue) return "";
  const date = typeof dateValue === 'string' ? new Date(dateValue) : dateValue;
  if (isToday(date)) return t('chat.lastSeenToday', { time: format(date, "HH:mm") });
  if (isYesterday(date)) return t('chat.lastSeenYesterday', { time: format(date, "HH:mm") });
  return t('chat.lastSeen', { date: format(date, "d/M HH:mm") });
}

function formatDateSeparator(dateValue: string | Date, t: (key: string, params?: Record<string, string | number>) => string) {
  const date = typeof dateValue === 'string' ? new Date(dateValue) : dateValue;
  if (isToday(date)) return t('chat.today');
  if (isYesterday(date)) return t('chat.yesterday');
  return format(date, "d MMMM yyyy");
}

function getInitials(user: { firstName?: string | null; lastName?: string | null; username?: string }) {
  if (user.firstName && user.lastName) return `${user.firstName[0]}${user.lastName[0]}`.toUpperCase();
  return user.username?.substring(0, 2).toUpperCase() || "??";
}

export default function ChatPage() {
  const { t } = useI18n();
  const { user, token } = useAuth();
  const {
    conversations, activeConversation, messages, typingUsers,
    isConnected, isChatEnabled, onlineUsers, lastSeenMap,
    hasMoreMessages, loadingMore,
    sendMessage, setTyping, selectConversation, loadMoreMessages,
    refreshConversations, deleteMessage, editMessage, reactToMessage,
    searchMessages, searchResults, markAsRead,
  } = useChat();

  const { isLocked, hasPinEnabled, unlock, setupPin, pinStatus, loading: pinLoading } = useChatPin();
  const { hasMediaAccess, uploading, uploadProgress, uploadMedia, purchase: purchaseMedia } = useChatMedia();
  const { hasAutoDelete, deleteAfterMinutes, purchase: purchaseAutoDelete, updateSettings } = useChatAutoDelete();
  const {
    getDisplayText, getTranslatedText, hasTranslation, toggleTranslation, isTranslating: isTranslatingMsg,
    isShowingOriginal, autoTranslate, setAutoTranslate, translateMessage,
    targetLanguage, setTargetLanguage, languages, currentLanguageInfo,
  } = useMessageTranslation();

  const [messageInput, setMessageInput] = useState("");
  const [searchQuery, setSearchQuery] = useState("");
  const [chatSearchQuery, setChatSearchQuery] = useState("");
  const [showChatSearch, setShowChatSearch] = useState(false);
  const [disappearingMode, setDisappearingMode] = useState(false);
  const [mobileShowMessages, setMobileShowMessages] = useState(false);
  const [showPinSetup, setShowPinSetup] = useState(false);
  const [showMediaPurchase, setShowMediaPurchase] = useState(false);
  const [showAutoDeletePurchase, setShowAutoDeletePurchase] = useState(false);
  const [showAutoDeleteSettings, setShowAutoDeleteSettings] = useState(false);
  const [replyTo, setReplyTo] = useState<ChatMessage | null>(null);
  const [editingMsg, setEditingMsg] = useState<ChatMessage | null>(null);
  const [showScrollDown, setShowScrollDown] = useState(false);
  const [isRecording, setIsRecording] = useState(false);
  const [recordingTime, setRecordingTime] = useState(0);
  const [showLanguageSelector, setShowLanguageSelector] = useState(false);
  const [langSearchQuery, setLangSearchQuery] = useState("");
  const [directConversationUser, setDirectConversationUser] = useState<DirectConversationUser | null>(null);
  const [bubbleStyle, setBubbleStyle] = useState<BubbleStylePreset>(() => getSavedBubbleStyle());

  const messagesEndRef = useRef<HTMLDivElement>(null);
  const scrollAreaRef = useRef<HTMLDivElement>(null);
  const typingTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const prevMessageCountRef = useRef(0);
  const messageInputRef = useRef<HTMLInputElement>(null);
  const hasAutoSelectedConversationRef = useRef(false);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const recordingIntervalRef = useRef<NodeJS.Timeout | null>(null);
  const audioChunksRef = useRef<Blob[]>([]);
  const { play: playSound } = useSoundEffects();

  const preselectedConversationUserId = useMemo(() => {
    const query = new URLSearchParams(window.location.search);
    const targetUserId = query.get("user");
    return targetUserId && targetUserId.trim().length > 0 ? targetUserId.trim() : null;
  }, []);

  const activeUser = conversations.find((c) => c.otherUserId === activeConversation)?.otherUser;
  const activeUserProfile = activeUser || (
    activeConversation && preselectedConversationUserId && activeConversation === preselectedConversationUserId
      ? directConversationUser
      : null
  );
  const isActiveUserOnline = activeConversation ? onlineUsers.has(activeConversation) : false;
  const activeUserLastSeen = activeConversation ? lastSeenMap.get(activeConversation) : null;

  useEffect(() => {
    if (!preselectedConversationUserId || hasAutoSelectedConversationRef.current) {
      return;
    }

    setMobileShowMessages(true);
    selectConversation(preselectedConversationUserId);
    setReplyTo(null);
    setEditingMsg(null);
    hasAutoSelectedConversationRef.current = true;
  }, [preselectedConversationUserId, selectConversation]);

  useEffect(() => {
    if (!preselectedConversationUserId || !token) {
      return;
    }

    const existsInConversations = conversations.some((conv) => conv.otherUserId === preselectedConversationUserId);
    if (existsInConversations) {
      setDirectConversationUser(null);
      return;
    }

    let cancelled = false;

    const loadDirectConversationUser = async () => {
      try {
        const response = await fetch("/api/users/batch", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${token}`,
          },
          body: JSON.stringify({ userIds: [preselectedConversationUserId] }),
        });

        if (!response.ok) {
          if (!cancelled) {
            setDirectConversationUser(null);
          }
          return;
        }

        const users = await response.json() as Array<{ id: string; username: string; nickname?: string | null; profilePicture?: string | null }>;
        const targetUser = users.find((entry) => entry.id === preselectedConversationUserId) || users[0];

        if (!cancelled && targetUser) {
          setDirectConversationUser({
            id: targetUser.id,
            username: targetUser.username,
            firstName: targetUser.nickname || null,
            lastName: null,
            avatarUrl: targetUser.profilePicture || null,
            accountId: null,
          });
        }
      } catch {
        if (!cancelled) {
          setDirectConversationUser(null);
        }
      }
    };

    void loadDirectConversationUser();

    return () => {
      cancelled = true;
    };
  }, [conversations, preselectedConversationUserId, token]);

  // Auto scroll and sound on new messages
  useEffect(() => {
    if (messages.length > prevMessageCountRef.current && prevMessageCountRef.current > 0) {
      const lastMsg = messages[messages.length - 1];
      if (lastMsg && lastMsg.senderId !== user?.id) {
        playSound('message');
      }
    }
    // Auto scroll to bottom for new messages
    if (!showScrollDown || messages.length <= prevMessageCountRef.current + 1) {
      messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
    }
    prevMessageCountRef.current = messages.length;
  }, [messages]);

  useEffect(() => {
    refreshConversations();
  }, [refreshConversations]);

  useEffect(() => {
    window.localStorage.setItem(BUBBLE_STYLE_STORAGE_KEY, bubbleStyle);
  }, [bubbleStyle]);

  // Mark incoming messages as read when visible
  useEffect(() => {
    if (!activeConversation || !user) return;
    const unreadIncoming = messages.filter(m => m.senderId !== user.id && !m.isRead);
    unreadIncoming.forEach(m => markAsRead(m.id));
  }, [messages, activeConversation, user]);

  // Auto-translate incoming messages when enabled
  useEffect(() => {
    if (!autoTranslate || !user) return;
    messages.forEach(msg => {
      if (msg.senderId !== user.id && msg.content && msg.messageType !== 'deleted' && !msg.deletedAt) {
        const msgId = String(msg.id);
        if (isShowingOriginal(msgId) && !isTranslatingMsg(msgId)) {
          translateMessage(msgId, msg.content);
        }
      }
    });
  }, [messages, autoTranslate, user]);

  // Infinite scroll - load more on scroll top
  const handleScroll = useCallback((e: React.UIEvent<HTMLDivElement>) => {
    const target = e.currentTarget;
    // Load more when scrolled near top
    if (target.scrollTop < 100 && hasMoreMessages && !loadingMore) {
      loadMoreMessages();
    }
    // Show/hide scroll down button
    const isNearBottom = target.scrollHeight - target.scrollTop - target.clientHeight < 200;
    setShowScrollDown(!isNearBottom);
  }, [hasMoreMessages, loadingMore, loadMoreMessages]);

  // Search in chat
  useEffect(() => {
    const timer = setTimeout(() => {
      if (chatSearchQuery) searchMessages(chatSearchQuery);
    }, 300);
    return () => clearTimeout(timer);
  }, [chatSearchQuery]);

  const handleSelectConversation = (userId: string | number) => {
    selectConversation(String(userId));
    setMobileShowMessages(true);
    setReplyTo(null);
    setEditingMsg(null);
  };

  const handleBackToList = () => {
    setMobileShowMessages(false);
  };

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
    setShowScrollDown(false);
  };

  const handleSendMessage = () => {
    if (!activeConversation) return;

    // Edit mode
    if (editingMsg) {
      if (messageInput.trim() && messageInput.trim() !== editingMsg.content) {
        editMessage(editingMsg.id, messageInput.trim());
      }
      setEditingMsg(null);
      setMessageInput("");
      return;
    }

    if (!messageInput.trim()) return;

    sendMessage(activeConversation, messageInput.trim(), "text", undefined, {
      isDisappearing: disappearingMode,
      disappearAfterRead: disappearingMode,
      replyToId: replyTo?.id,
    });
    setMessageInput("");
    setReplyTo(null);
    setTyping(activeConversation, false);
  };

  const handleMediaUpload = async (file: File) => {
    if (!activeConversation) return;
    const result = await uploadMedia(file, activeConversation);
    if (result.success && result.url) {
      const isVideo = file.type.startsWith("video/");
      sendMessage(activeConversation, "", isVideo ? "video" : "image", result.url, {
        replyToId: replyTo?.id,
      });
      setReplyTo(null);
    }
  };

  const handleInputChange = (value: string) => {
    setMessageInput(value);
    if (activeConversation) {
      setTyping(activeConversation, true);
      if (typingTimeoutRef.current) clearTimeout(typingTimeoutRef.current);
      typingTimeoutRef.current = setTimeout(() => {
        setTyping(activeConversation, false);
      }, 2000);
    }
  };

  const handleKeyPress = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSendMessage();
    }
    if (e.key === "Escape") {
      setReplyTo(null);
      setEditingMsg(null);
      setMessageInput("");
    }
  };

  const handleReply = (msg: ChatMessage) => {
    setReplyTo(msg);
    setEditingMsg(null);
    messageInputRef.current?.focus();
  };

  const handleEdit = (msg: ChatMessage) => {
    setEditingMsg(msg);
    setReplyTo(null);
    setMessageInput(msg.content || "");
    messageInputRef.current?.focus();
  };

  const handleDelete = (msg: ChatMessage, forEveryone: boolean) => {
    deleteMessage(msg.id, forEveryone);
  };

  const handleReaction = (messageId: string, emoji: string) => {
    reactToMessage(messageId, emoji);
  };

  // Voice recording
  const startRecording = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const mediaRecorder = new MediaRecorder(stream);
      mediaRecorderRef.current = mediaRecorder;
      audioChunksRef.current = [];

      mediaRecorder.ondataavailable = (e) => {
        if (e.data.size > 0) audioChunksRef.current.push(e.data);
      };

      mediaRecorder.onstop = async () => {
        const audioBlob = new Blob(audioChunksRef.current, { type: 'audio/webm' });
        stream.getTracks().forEach(t => t.stop());

        if (audioBlob.size > 0 && activeConversation) {
          // Convert to base64 and send
          const reader = new FileReader();
          reader.onload = () => {
            const base64 = (reader.result as string).split(',')[1];
            // Upload as media
            fetch('/api/chat/media/upload', {
              method: 'POST',
              headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${localStorage.getItem('pwm_token')}`,
              },
              body: JSON.stringify({
                data: base64,
                mimeType: 'audio/webm',
                fileName: `voice_${Date.now()}.webm`,
              }),
            }).then(r => r.json()).then(data => {
              if (data.mediaUrl && activeConversation) {
                sendMessage(activeConversation, "", "voice", data.mediaUrl);
              }
            }).catch(console.error);
          };
          reader.readAsDataURL(audioBlob);
        }

        setRecordingTime(0);
        if (recordingIntervalRef.current) clearInterval(recordingIntervalRef.current);
      };

      mediaRecorder.start();
      setIsRecording(true);
      setRecordingTime(0);
      recordingIntervalRef.current = setInterval(() => {
        setRecordingTime(t => t + 1);
      }, 1000);
    } catch (err) {
      console.error("Failed to start recording:", err);
    }
  };

  const stopRecording = () => {
    if (mediaRecorderRef.current?.state === 'recording') {
      mediaRecorderRef.current.stop();
    }
    setIsRecording(false);
    if (recordingIntervalRef.current) clearInterval(recordingIntervalRef.current);
  };

  const cancelRecording = () => {
    if (mediaRecorderRef.current?.state === 'recording') {
      mediaRecorderRef.current.ondataavailable = null;
      mediaRecorderRef.current.onstop = null;
      mediaRecorderRef.current.stop();
      mediaRecorderRef.current.stream?.getTracks().forEach(t => t.stop());
    }
    setIsRecording(false);
    setRecordingTime(0);
    audioChunksRef.current = [];
    if (recordingIntervalRef.current) clearInterval(recordingIntervalRef.current);
  };

  const filteredConversations = conversations.filter((conv) => {
    if (!searchQuery) return true;
    const name = `${conv.otherUser.firstName || ""} ${conv.otherUser.lastName || ""} ${conv.otherUser.username}`.toLowerCase();
    return name.includes(searchQuery.toLowerCase());
  });

  // Group messages by date
  const getMessageDateGroups = () => {
    const groups: { date: string; messages: ChatMessage[] }[] = [];
    let currentDate = "";

    messages.forEach((msg) => {
      const msgDate = format(new Date(msg.createdAt), "yyyy-MM-dd");
      if (msgDate !== currentDate) {
        currentDate = msgDate;
        groups.push({ date: String(msg.createdAt), messages: [msg] });
      } else {
        groups[groups.length - 1].messages.push(msg);
      }
    });
    return groups;
  };

  // Find replied message
  const findReplyMessage = (replyToId: string | undefined) => {
    if (!replyToId) return null;
    return messages.find(m => m.id === replyToId);
  };

  if (!isChatEnabled) {
    return (
      <div className="flex h-full items-center justify-center p-6">
        <Card className="max-w-md">
          <CardContent className="pt-6 text-center">
            <AlertCircle className="mx-auto h-12 w-12 text-muted-foreground mb-4" />
            <h3 className="text-lg font-semibold mb-2">{t("chat.disabled")}</h3>
            <p className="text-muted-foreground">{t("chat.disabledDesc")}</p>
          </CardContent>
        </Card>
      </div>
    );
  }

  if (isLocked && !pinLoading) {
    return (
      <PinLockScreen
        onUnlock={unlock}
        isLocked={true}
        lockedUntil={pinStatus?.lockedUntil}
        failedAttempts={pinStatus?.failedAttempts}
      />
    );
  }

  const dateGroups = getMessageDateGroups();

  return (
    <div className="flex h-full">
      {/* =================== Conversation List =================== */}
      <div className={cn(
        "border-e flex flex-col bg-muted/30 w-full md:w-80",
        mobileShowMessages ? "hidden md:flex" : "flex"
      )}>
        <div className="p-3 sm:p-4 border-b">
          <h2 className="text-base sm:text-lg font-semibold mb-3 flex items-center gap-2">
            <MessageCircle className="h-5 w-5" />
            {t("chat.title")}
            {!isConnected && (
              <Badge variant="secondary" className="text-xs">
                {t("chat.reconnecting")}
              </Badge>
            )}
          </h2>
          <div className="relative">
            <Search className="absolute start-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder={t("chat.searchConversations")}
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="ps-9"
              data-testid="input-chat-search"
            />
          </div>
        </div>

        <ScrollArea className="flex-1">
          {filteredConversations.length === 0 ? (
            <div className="p-4 text-center text-muted-foreground">
              <MessageCircle className="mx-auto h-8 w-8 mb-2 opacity-50" />
              <p className="text-sm">{t("chat.noConversations")}</p>
            </div>
          ) : (
            <div className="p-2 space-y-1">
              {filteredConversations.map((conv) => {
                const userOnline = onlineUsers.has(conv.otherUserId);
                return (
                  <button
                    key={conv.otherUserId}
                    onClick={() => handleSelectConversation(conv.otherUserId)}
                    className={cn(
                      "w-full p-3 min-h-[44px] rounded-lg text-start hover:bg-accent/50 active:bg-accent transition-colors",
                      activeConversation === conv.otherUserId ? "bg-sidebar-accent" : "bg-transparent"
                    )}
                    data-testid={`chat-conversation-${conv.otherUserId}`}
                  >
                    <div className="flex items-center gap-3">
                      <div className="relative">
                        <Avatar className="h-10 w-10">
                          <AvatarImage src={conv.otherUser.avatarUrl || undefined} />
                          <AvatarFallback>{getInitials(conv.otherUser)}</AvatarFallback>
                        </Avatar>
                        {userOnline && (
                          <span className="absolute bottom-0 end-0 w-3 h-3 bg-emerald-500 border-2 border-background rounded-full" />
                        )}
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center justify-between gap-2">
                          <span className="font-medium truncate">
                            {conv.otherUser.firstName || conv.otherUser.username}
                          </span>
                          <span className="text-xs text-muted-foreground shrink-0">
                            {conv.lastMessage?.createdAt ? formatMessageTime(conv.lastMessage.createdAt, t) : ""}
                          </span>
                        </div>
                        <div className="flex items-center justify-between gap-2">
                          <p className="text-sm text-muted-foreground truncate">
                            {conv.lastMessage?.messageType === "image" ? t("chat.photo") :
                              conv.lastMessage?.messageType === "video" ? t("chat.video") :
                                conv.lastMessage?.messageType === "voice" ? t("chat.voiceMsg") :
                                  conv.lastMessage?.messageType === "deleted" ? t("chat.deletedMessage") :
                                    conv.lastMessage?.content || ""}
                          </p>
                          {conv.unreadCount > 0 && (
                            <Badge variant="default" className="h-5 min-w-5 text-xs justify-center shrink-0">
                              {conv.unreadCount > 99 ? "99+" : conv.unreadCount}
                            </Badge>
                          )}
                        </div>
                      </div>
                    </div>
                  </button>
                );
              })}
            </div>
          )}
        </ScrollArea>
      </div>

      {/* =================== Chat Area =================== */}
      <div className={cn(
        "flex-1 flex flex-col",
        mobileShowMessages ? "flex" : "hidden md:flex"
      )}>
        {!activeConversation ? (
          <div className="flex-1 flex items-center justify-center">
            <div className="text-center text-muted-foreground">
              <MessageCircle className="mx-auto h-12 w-12 mb-4 opacity-50" />
              <h3 className="text-lg font-medium">{t("chat.selectConversation")}</h3>
              <p className="text-sm">{t("chat.selectConversationDesc")}</p>
            </div>
          </div>
        ) : (
          <>
            {/* ======= Chat Header ======= */}
            <div className="p-3 sm:p-4 border-b flex items-center gap-3">
              <Button
                variant="ghost" size="icon"
                className="md:hidden shrink-0 min-h-[44px] min-w-[44px]"
                onClick={handleBackToList}
                data-testid="button-chat-back"
              >
                <ArrowLeft className="h-5 w-5" />
              </Button>
              <div className="relative">
                <Avatar className="h-10 w-10">
                  <AvatarImage src={activeUserProfile?.avatarUrl || undefined} />
                  <AvatarFallback>{activeUserProfile ? getInitials(activeUserProfile) : "??"}</AvatarFallback>
                </Avatar>
                {isActiveUserOnline && (
                  <span className="absolute bottom-0 end-0 w-3 h-3 bg-emerald-500 border-2 border-background rounded-full" />
                )}
              </div>
              <div className="flex-1 min-w-0">
                <h3 className="font-semibold flex items-center gap-2">
                  {activeUserProfile?.firstName || activeUserProfile?.username || `@${activeConversation}`}
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <Badge variant="outline" className="text-[10px] px-1.5 py-0 h-5 gap-1 text-emerald-500 border-emerald-500/30">
                        <Shield className="h-3 w-3" />
                        E2EE
                      </Badge>
                    </TooltipTrigger>
                    <TooltipContent>
                      <p>{t('chat.e2eeTooltip')}</p>
                    </TooltipContent>
                  </Tooltip>
                </h3>
                <p className="text-xs text-muted-foreground">
                  {typingUsers.has(activeConversation) ? (
                    <span className="text-primary animate-pulse">{t('chat.typing')}</span>
                  ) : isActiveUserOnline ? (
                    <span className="text-emerald-500">{t('chat.online')}</span>
                  ) : activeUserLastSeen ? (
                    formatLastSeen(activeUserLastSeen, t)
                  ) : (
                    `@${activeUserProfile?.username || activeConversation}`
                  )}
                </p>
              </div>
              <div className="flex items-center gap-1">
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Button variant="ghost" size="icon" className="h-8 w-8"
                      onClick={() => { setShowChatSearch(!showChatSearch); setChatSearchQuery(""); }}>
                      <Search className="h-4 w-4" />
                    </Button>
                  </TooltipTrigger>
                  <TooltipContent><p>{t('chat.searchInChat')}</p></TooltipContent>
                </Tooltip>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => setShowPinSetup(true)}>
                      <Lock className={cn("h-4 w-4", hasPinEnabled ? "text-emerald-500" : "text-muted-foreground")} />
                    </Button>
                  </TooltipTrigger>
                  <TooltipContent>
                    <p>{hasPinEnabled ? t('chat.pinSettings') : t('chat.setPin')}</p>
                  </TooltipContent>
                </Tooltip>

                {/* Auto-translate toggle */}
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Button
                      variant={autoTranslate ? "default" : "ghost"}
                      size="icon"
                      className={cn("h-8 w-8", autoTranslate && "text-primary-foreground")}
                      onClick={() => setAutoTranslate(!autoTranslate)}
                    >
                      <Languages className="h-4 w-4" />
                    </Button>
                  </TooltipTrigger>
                  <TooltipContent>
                    <p>{t('chat.autoTranslate')}</p>
                  </TooltipContent>
                </Tooltip>

                {/* Language selector */}
                <DropdownMenu open={showLanguageSelector} onOpenChange={setShowLanguageSelector}>
                  <DropdownMenuTrigger asChild>
                    <Button variant="outline" size="sm" className="h-8 px-2 text-xs gap-1 text-foreground">
                      <span className="max-w-[60px] truncate">{currentLanguageInfo?.nativeName || targetLanguage}</span>
                      <ChevronDown className="h-3 w-3" />
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent className="max-h-[320px] overflow-y-auto w-[240px]" align="end">
                    <div className="px-2 py-1.5 sticky top-0 bg-popover z-10">
                      <Input
                        placeholder={t('chat.searchLanguage')}
                        value={langSearchQuery}
                        onChange={(e) => setLangSearchQuery(e.target.value)}
                        className="h-7 text-xs"
                        autoFocus
                      />
                    </div>
                    <DropdownMenuSeparator />
                    {languages
                      .filter(l => {
                        if (!langSearchQuery) return true;
                        const q = langSearchQuery.toLowerCase();
                        return l.name.toLowerCase().includes(q) || l.nativeName.toLowerCase().includes(q) || l.code.toLowerCase().includes(q);
                      })
                      .map(lang => (
                        <DropdownMenuItem
                          key={lang.code}
                          onClick={() => { setTargetLanguage(lang.code); setLangSearchQuery(""); }}
                          className={cn(
                            "text-xs cursor-pointer text-foreground",
                            targetLanguage === lang.code && "bg-primary/10 font-semibold"
                          )}
                        >
                          <span className="flex-1 text-foreground">{lang.nativeName}</span>
                          <span className="text-muted-foreground ms-2">{lang.name}</span>
                        </DropdownMenuItem>
                      ))}
                  </DropdownMenuContent>
                </DropdownMenu>

                {/* Bubble style presets */}
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button variant="ghost" size="icon" className="h-8 w-8">
                      <Palette className="h-4 w-4" />
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end" className="w-44">
                    <DropdownMenuItem onClick={() => setBubbleStyle("vivid")} className={cn(bubbleStyle === "vivid" && "font-semibold")}>
                      Vivid bubbles
                    </DropdownMenuItem>
                    <DropdownMenuItem onClick={() => setBubbleStyle("classic")} className={cn(bubbleStyle === "classic" && "font-semibold")}>
                      Classic bubbles
                    </DropdownMenuItem>
                    <DropdownMenuItem onClick={() => setBubbleStyle("compact")} className={cn(bubbleStyle === "compact" && "font-semibold")}>
                      Compact bubbles
                    </DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
              </div>
            </div>

            {/* ======= In-chat Search Bar ======= */}
            {showChatSearch && (
              <div className="px-3 py-2 border-b bg-muted/30 flex gap-2 items-center">
                <Search className="h-4 w-4 text-muted-foreground shrink-0" />
                <Input
                  placeholder={t('chat.searchMessages')}
                  value={chatSearchQuery}
                  onChange={(e) => setChatSearchQuery(e.target.value)}
                  className="h-8 text-sm"
                  autoFocus
                />
                <span className="text-xs text-muted-foreground shrink-0">
                  {searchResults.length > 0 ? t('chat.results', { count: searchResults.length }) : ""}
                </span>
                <Button variant="ghost" size="icon" className="h-8 w-8 shrink-0"
                  onClick={() => { setShowChatSearch(false); setChatSearchQuery(""); }}>
                  <X className="h-4 w-4" />
                </Button>
              </div>
            )}

            {/* ======= Messages Area ======= */}
            <div className="flex-1 overflow-y-auto p-4 relative" onScroll={handleScroll} ref={scrollAreaRef}>
              {/* Load more indicator */}
              {loadingMore && (
                <div className="text-center py-2">
                  <Loader2 className="h-5 w-5 animate-spin mx-auto text-muted-foreground" />
                </div>
              )}
              {!hasMoreMessages && messages.length > 0 && (
                <div className="text-center py-2">
                  <p className="text-xs text-muted-foreground">{t('chat.startOfConversation')}</p>
                </div>
              )}

              <div className="space-y-1">
                {dateGroups.map((group, gi) => (
                  <div key={gi}>
                    {/* Date separator */}
                    <div className="flex justify-center my-3">
                      <span className="bg-muted text-muted-foreground text-xs px-3 py-1 rounded-full">
                        {formatDateSeparator(group.date, t)}
                      </span>
                    </div>

                    {group.messages.map((msg, mi) => {
                      const isMine = msg.senderId === user?.id;
                      const isDeleted = msg.messageType === "deleted" || msg.deletedAt;
                      const isDisappearingMsg = msg.isDisappearing || msg.disappearAfterRead;
                      const repliedMsg = findReplyMessage(msg.replyToId ?? undefined);
                      const reactions = msg.reactions || {};
                      const reactionEntries = Object.entries(reactions);

                      // Show avatar for consecutive messages from same sender
                      const showAvatar = mi === 0 || group.messages[mi - 1]?.senderId !== msg.senderId;

                      return (
                        <div key={msg.id} className={cn(
                          "flex group",
                          isMine ? "justify-end" : "justify-start",
                          !showAvatar ? "mt-0.5" : "mt-3"
                        )}>
                          {/* Message bubble */}
                          <div className={cn("max-w-[75%] sm:max-w-[65%] relative")}>
                            {/* Reply preview */}
                            {repliedMsg && !isDeleted && (
                              <div className={cn(
                                "text-xs rounded-t-lg px-3 py-1.5 border-s-2 mb-0.5",
                                isMine
                                  ? "bg-primary/20 border-primary-foreground/40 text-primary-foreground/80"
                                  : "bg-muted/80 border-primary/50 text-muted-foreground"
                              )}>
                                <div className="flex items-center gap-1">
                                  <CornerDownRight className="h-3 w-3" />
                                  <span className="font-medium truncate">
                                    {repliedMsg.senderId === user?.id ? t('chat.you') : (activeUserProfile?.firstName || activeUserProfile?.username || `@${activeConversation}`)}
                                  </span>
                                </div>
                                <p className="truncate opacity-80">{repliedMsg.content || t('chat.media')}</p>
                              </div>
                            )}

                            <div className={cn(
                              "relative",
                              bubbleStyle === "compact" ? "text-[13px] leading-relaxed" : "px-3 py-2",
                              getBubbleClassNames(isMine, bubbleStyle),
                              isDeleted && "opacity-60 italic"
                            )}>
                              {isDeleted ? (
                                <p className="text-sm flex items-center gap-1">
                                  <Trash2 className="h-3 w-3" />
                                  {t('chat.messageDeleted')}
                                </p>
                              ) : (
                                <>
                                  {/* Media content */}
                                  {msg.mediaUrl && (
                                    <ChatMediaRenderer
                                      mediaUrl={msg.mediaUrl}
                                      mediaMimeType={msg.mediaMimeType ?? undefined}
                                      mediaOriginalName={msg.mediaOriginalName ?? undefined}
                                      mediaThumbnailUrl={msg.mediaThumbnailUrl ?? undefined}
                                      className="mb-1"
                                    />
                                  )}
                                  {/* Legacy attachment */}
                                  {msg.attachmentUrl && !msg.mediaUrl && (
                                    <div className="mb-1">
                                      {msg.messageType === "image" ? (
                                        <img src={msg.attachmentUrl} alt="" className="max-w-[260px] rounded-lg" loading="lazy" />
                                      ) : msg.messageType === "video" ? (
                                        <video src={msg.attachmentUrl} controls className="max-w-[260px] rounded-lg" />
                                      ) : msg.messageType === "voice" ? (
                                        <audio src={msg.attachmentUrl} controls className="max-w-[240px]" />
                                      ) : null}
                                    </div>
                                  )}
                                  {/* Text content */}
                                  {msg.content && (
                                    <div>
                                      <p className="text-sm whitespace-pre-wrap break-words leading-relaxed">
                                        {getDisplayText(String(msg.id), msg.content)}
                                      </p>
                                      {isTranslatingMsg(String(msg.id)) && (
                                        <span className="text-[10px] opacity-60 flex items-center gap-1 mt-0.5">
                                          <Loader2 className="h-2.5 w-2.5 animate-spin" />
                                          {t('chat.translating')}
                                        </span>
                                      )}
                                      {/* Show both: translated + original when translated */}
                                      {hasTranslation(String(msg.id)) && !isTranslatingMsg(String(msg.id)) && (
                                        <div className="mt-0.5 border-t border-current/10">
                                          <p className={cn(
                                            "text-[11px] whitespace-pre-wrap break-words leading-relaxed opacity-60 italic"
                                          )}>
                                            {isShowingOriginal(String(msg.id))
                                              ? getTranslatedText(String(msg.id))
                                              : msg.content
                                            }
                                          </p>
                                          <button
                                            onClick={() => toggleTranslation(String(msg.id), msg.content!)}
                                            className="text-[10px] opacity-50 hover:opacity-100 transition-opacity mt-0.5 underline"
                                          >
                                            {isShowingOriginal(String(msg.id)) ? t('chat.showTranslation') : t('chat.showOriginal')}
                                          </button>
                                        </div>
                                      )}
                                    </div>
                                  )}
                                </>
                              )}

                              {/* Message meta */}
                              <div className={cn(
                                "flex items-center gap-1 mt-0.5 text-[10px]",
                                isMine ? "text-primary-foreground/60" : "text-muted-foreground"
                              )}>
                                {isDisappearingMsg && <Timer className="h-2.5 w-2.5" />}
                                {msg.autoDeleteAt && (
                                  <AutoDeleteCountdown autoDeleteAt={msg.autoDeleteAt instanceof Date ? msg.autoDeleteAt.toISOString() : String(msg.autoDeleteAt)} />
                                )}
                                {msg.isEncrypted && <Shield className="h-2.5 w-2.5 text-emerald-400" />}
                                {msg.isEdited && <span>{t('chat.edited')}</span>}
                                <span>{formatMessageTime(msg.createdAt, t)}</span>
                                {isMine && (
                                  msg.isRead
                                    ? <CheckCheck className="h-3 w-3 text-blue-400" />
                                    : <Check className="h-3 w-3" />
                                )}
                              </div>
                            </div>

                            {/* Reactions display */}
                            {reactionEntries.length > 0 && (
                              <div className={cn("flex flex-wrap gap-1 mt-1", isMine ? "justify-end" : "justify-start")}>
                                {reactionEntries.map(([emoji, userIds]) => (
                                  <button
                                    key={emoji}
                                    onClick={() => handleReaction(msg.id, emoji)}
                                    className={cn(
                                      "flex items-center gap-0.5 text-xs px-1.5 py-0.5 rounded-full border transition-colors",
                                      (userIds as string[]).includes(user?.id || "")
                                        ? "bg-primary/10 border-primary/30"
                                        : "bg-muted border-transparent hover:border-muted-foreground/20"
                                    )}
                                  >
                                    <span>{emoji}</span>
                                    {(userIds as string[]).length > 1 && (
                                      <span className="text-muted-foreground">{(userIds as string[]).length}</span>
                                    )}
                                  </button>
                                ))}
                              </div>
                            )}

                            {/* Message actions (hover) */}
                            {!isDeleted && (
                              <div className={cn(
                                "absolute top-0 opacity-0 group-hover:opacity-100 transition-opacity flex items-center gap-0.5 bg-background border rounded-lg shadow-sm p-0.5",
                                isMine ? "-start-2 -translate-x-full" : "-end-2 translate-x-full"
                              )}>
                                {/* Quick reactions */}
                                <DropdownMenu>
                                  <DropdownMenuTrigger asChild>
                                    <Button variant="ghost" size="icon" className="h-6 w-6">
                                      <Smile className="h-3.5 w-3.5" />
                                    </Button>
                                  </DropdownMenuTrigger>
                                  <DropdownMenuContent align={isMine ? "end" : "start"} className="flex gap-1 p-1 min-w-0">
                                    {QUICK_REACTIONS.map(emoji => (
                                      <button key={emoji} onClick={() => handleReaction(msg.id, emoji)}
                                        className="hover:scale-125 transition-transform text-lg p-1">{emoji}</button>
                                    ))}
                                  </DropdownMenuContent>
                                </DropdownMenu>

                                <Button variant="ghost" size="icon" className="h-6 w-6" onClick={() => handleReply(msg)}>
                                  <Reply className="h-3.5 w-3.5" />
                                </Button>

                                {/* Translate button */}
                                {msg.content && msg.messageType === "text" && (
                                  <Tooltip>
                                    <TooltipTrigger asChild>
                                      <Button
                                        variant="ghost" size="icon" className="h-6 w-6"
                                        onClick={() => toggleTranslation(String(msg.id), msg.content!)}
                                        disabled={isTranslatingMsg(String(msg.id))}
                                      >
                                        {isTranslatingMsg(String(msg.id)) ? (
                                          <Loader2 className="h-3.5 w-3.5 animate-spin" />
                                        ) : (
                                          <Languages className="h-3.5 w-3.5" />
                                        )}
                                      </Button>
                                    </TooltipTrigger>
                                    <TooltipContent>
                                      <p>{isShowingOriginal(String(msg.id)) ? t('chat.showTranslation') : t('chat.showOriginal')}</p>
                                    </TooltipContent>
                                  </Tooltip>
                                )}

                                {isMine && msg.messageType === "text" && (
                                  <Button variant="ghost" size="icon" className="h-6 w-6" onClick={() => handleEdit(msg)}>
                                    <Pencil className="h-3.5 w-3.5" />
                                  </Button>
                                )}

                                <DropdownMenu>
                                  <DropdownMenuTrigger asChild>
                                    <Button variant="ghost" size="icon" className="h-6 w-6">
                                      <Trash2 className="h-3.5 w-3.5" />
                                    </Button>
                                  </DropdownMenuTrigger>
                                  <DropdownMenuContent>
                                    <DropdownMenuItem onClick={() => handleDelete(msg, false)}>
                                      {t('chat.deleteForMe')}
                                    </DropdownMenuItem>
                                    {isMine && (
                                      <DropdownMenuItem onClick={() => handleDelete(msg, true)} className="text-destructive">
                                        {t('chat.deleteForAll')}
                                      </DropdownMenuItem>
                                    )}
                                  </DropdownMenuContent>
                                </DropdownMenu>
                              </div>
                            )}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                ))}

                {/* Typing indicator */}
                {typingUsers.has(activeConversation) && (
                  <div className="flex justify-start mt-2">
                    <div className="bg-muted rounded-2xl px-4 py-2">
                      <div className="flex gap-1">
                        <span className="w-2 h-2 bg-muted-foreground/50 rounded-full animate-bounce" style={{ animationDelay: '0ms' }} />
                        <span className="w-2 h-2 bg-muted-foreground/50 rounded-full animate-bounce" style={{ animationDelay: '150ms' }} />
                        <span className="w-2 h-2 bg-muted-foreground/50 rounded-full animate-bounce" style={{ animationDelay: '300ms' }} />
                      </div>
                    </div>
                  </div>
                )}

                <div ref={messagesEndRef} />
              </div>

              {/* Scroll to bottom button */}
              {showScrollDown && (
                <button
                  onClick={scrollToBottom}
                  className="fixed bottom-24 end-8 z-10 bg-background border shadow-lg rounded-full p-2 hover:bg-accent transition-colors"
                >
                  <ChevronDown className="h-5 w-5" />
                </button>
              )}
            </div>

            {/* ======= Reply/Edit Preview Bar ======= */}
            {(replyTo || editingMsg) && (
              <div className="px-3 py-2 border-t bg-muted/30 flex items-center gap-2">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-1 text-xs font-medium text-primary">
                    {editingMsg ? (
                      <><Pencil className="h-3 w-3" /> {t('chat.editMessage')}</>
                    ) : (
                      <><Reply className="h-3 w-3" /> {replyTo!.senderId === user?.id ? t('chat.replyToSelf') : t('chat.replyTo', { name: activeUser?.firstName || activeUser?.username || '' })}</>
                    )}
                  </div>
                  <p className="text-xs text-muted-foreground truncate">
                    {editingMsg?.content || replyTo?.content || t('chat.media')}
                  </p>
                </div>
                <Button variant="ghost" size="icon" className="h-6 w-6 shrink-0"
                  onClick={() => { setReplyTo(null); setEditingMsg(null); setMessageInput(""); }}>
                  <X className="h-4 w-4" />
                </Button>
              </div>
            )}

            {/* ======= Input Area ======= */}
            <div className="p-3 sm:p-4 border-t">
              {disappearingMode && (
                <div className="mb-2 flex items-center gap-2 text-xs text-primary">
                  <Timer className="h-3 w-3" />
                  <span>{t("chat.disappearingModeActive")}</span>
                </div>
              )}

              {isRecording ? (
                /* Voice recording UI */
                <div className="flex items-center gap-3 bg-destructive/10 rounded-lg px-4 py-3">
                  <Button variant="ghost" size="icon" onClick={cancelRecording} className="h-8 w-8 text-destructive">
                    <X className="h-5 w-5" />
                  </Button>
                  <div className="flex-1 flex items-center gap-2">
                    <span className="w-3 h-3 bg-destructive rounded-full animate-pulse" />
                    <span className="text-sm font-mono text-destructive">
                      {Math.floor(recordingTime / 60).toString().padStart(2, '0')}:{(recordingTime % 60).toString().padStart(2, '0')}
                    </span>
                    <span className="text-xs text-muted-foreground">{t('chat.recording')}</span>
                  </div>
                  <Button variant="default" size="icon" onClick={stopRecording} className="h-10 w-10 rounded-full">
                    <Send className="h-4 w-4" />
                  </Button>
                </div>
              ) : (
                <div className="flex gap-2 items-end">
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <Button
                        variant={disappearingMode ? "default" : "ghost"} size="icon"
                        onClick={() => setDisappearingMode(!disappearingMode)}
                        className={cn("shrink-0 h-10 w-10", disappearingMode && "text-primary-foreground")}
                        data-testid="button-toggle-disappearing"
                      >
                        <Timer className="h-4 w-4" />
                      </Button>
                    </TooltipTrigger>
                    <TooltipContent>
                      <p>{disappearingMode ? t("chat.disappearingModeOff") : t("chat.disappearingModeOn")}</p>
                    </TooltipContent>
                  </Tooltip>

                  <MediaUploadButton
                    hasAccess={hasMediaAccess}
                    uploading={uploading}
                    uploadProgress={uploadProgress}
                    onUpload={handleMediaUpload}
                    onPurchaseClick={() => setShowMediaPurchase(true)}
                    disabled={!activeConversation}
                  />

                  <AutoDeleteToggle
                    hasAccess={hasAutoDelete}
                    isActive={hasAutoDelete}
                    deleteAfterMinutes={deleteAfterMinutes}
                    onToggle={() => { }}
                    onPurchaseClick={() => setShowAutoDeletePurchase(true)}
                    onSettingsClick={() => setShowAutoDeleteSettings(true)}
                  />

                  <Input
                    ref={messageInputRef}
                    value={messageInput}
                    onChange={(e) => handleInputChange(e.target.value)}
                    onKeyDown={handleKeyPress}
                    placeholder={editingMsg ? t('chat.editMessagePlaceholder') : replyTo ? t('chat.replyPlaceholder') : t("chat.typeMessage")}
                    className="flex-1 min-h-[44px] rounded-full px-4"
                    data-testid="input-chat-message"
                  />

                  {messageInput.trim() || editingMsg ? (
                    <Button
                      onClick={handleSendMessage}
                      disabled={!messageInput.trim() && !editingMsg}
                      className="min-h-[44px] min-w-[44px] rounded-full"
                      data-testid="button-send-message"
                    >
                      <Send className="h-4 w-4" />
                    </Button>
                  ) : (
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <Button
                          variant="ghost" size="icon"
                          onClick={startRecording}
                          className="min-h-[44px] min-w-[44px] rounded-full hover:bg-destructive/10 hover:text-destructive"
                        >
                          <Mic className="h-5 w-5" />
                        </Button>
                      </TooltipTrigger>
                      <TooltipContent><p>{t('chat.voiceMessage')}</p></TooltipContent>
                    </Tooltip>
                  )}
                </div>
              )}
            </div>
          </>
        )}
      </div>

      {/* ======= Dialogs ======= */}
      <PinSetupDialog open={showPinSetup} onOpenChange={setShowPinSetup} onSetup={setupPin} />
      <MediaPurchaseDialog
        open={showMediaPurchase} onOpenChange={setShowMediaPurchase}
        onPurchase={purchaseMedia} userBalance={user?.balance ? Number(user.balance) : 0}
      />
      <AutoDeletePurchaseDialog
        open={showAutoDeletePurchase} onOpenChange={setShowAutoDeletePurchase}
        onPurchase={purchaseAutoDelete} userBalance={user?.balance ? Number(user.balance) : 0}
      />
      <AutoDeleteSettingsDialog
        open={showAutoDeleteSettings} onOpenChange={setShowAutoDeleteSettings}
        currentMinutes={deleteAfterMinutes} onSave={updateSettings}
      />
    </div>
  );
}
