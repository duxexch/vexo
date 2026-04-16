import { useState, useRef, useEffect, useCallback, useMemo } from "react";
import type { ChatMessage } from "@shared/schema";
import { useChat } from "@/hooks/use-chat";
import { useAuth } from "@/lib/auth";
import { useI18n } from "@/lib/i18n";
import { useSoundEffects } from "@/hooks/use-sound-effects";
import { useChatPin } from "@/hooks/use-chat-pin";
import { useChatMedia, useChatAutoDelete, useChatCallPricing } from "@/hooks/use-chat-features";
import {
  CHAT_CALL_QUEUED_OPERATION_FAILED_EVENT,
  CHAT_CALL_QUEUED_START_PROCESSED_EVENT,
} from "@/lib/chat-call-ops-queue";
import { usePrivateCallLayer } from "@/components/chat/private-call-layer";
import { useMessageTranslation } from "@/hooks/use-message-translation";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { MessageCircle, Send, Check, CheckCheck, Loader2, AlertCircle, Search, Timer, ArrowLeft, Shield, Lock, Paperclip, Reply, Trash2, Pencil, Smile, X, CornerDownRight, Mic, MicOff, ChevronDown, Languages, Palette, Phone, Video, PhoneCall, PhoneOff, MoreHorizontal } from "lucide-react";
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

const VOICE_MIME_CANDIDATES = [
  "audio/webm;codecs=opus",
  "audio/webm",
  "audio/ogg;codecs=opus",
  "audio/ogg",
  "audio/mp4",
];

function normalizeMimeType(mimeType: string | null | undefined): string {
  return (mimeType || "").split(";")[0].trim().toLowerCase();
}

function getPreferredVoiceMimeType(): string | undefined {
  if (typeof MediaRecorder === "undefined" || typeof MediaRecorder.isTypeSupported !== "function") {
    return undefined;
  }

  return VOICE_MIME_CANDIDATES.find((candidate) => MediaRecorder.isTypeSupported(candidate));
}

function getVoiceFileExtension(mimeType: string): string {
  const normalized = normalizeMimeType(mimeType);
  if (normalized === "audio/ogg") {
    return "ogg";
  }
  if (normalized === "audio/mp4") {
    return "m4a";
  }
  return "webm";
}

async function blobToBase64(blob: Blob): Promise<string> {
  const result = await new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve((reader.result as string) || "");
    reader.onerror = () => reject(reader.error || new Error("file_read_failed"));
    reader.readAsDataURL(blob);
  });

  return result.split(",")[1] || result;
}

interface ChatPageProps {
  embedded?: boolean;
}

export default function ChatPage({ embedded = false }: ChatPageProps) {
  const { t } = useI18n();
  const { user, token } = useAuth();
  const {
    conversations, activeConversation, messages, typingUsers,
    isConnected, isChatEnabled, onlineUsers, lastSeenMap,
    hasMoreMessages, loadingMore,
    sendMessage, setTyping, selectConversation, loadMoreMessages,
    refreshConversations, deleteMessage, editMessage, reactToMessage,
    searchMessages, searchResults, markAsRead,
    pendingOutgoing, retryPendingMessage,
  } = useChat();

  const { isLocked, hasPinEnabled, unlock, setupPin, pinStatus, loading: pinLoading } = useChatPin();
  const {
    hasMediaAccess,
    uploading,
    uploadProgress,
    uploadMedia,
    purchase: purchaseMedia,
    price: mediaPrice,
    userBalance: mediaWalletBalance,
  } = useChatMedia();
  const {
    hasAutoDelete,
    deleteAfterMinutes,
    purchase: purchaseAutoDelete,
    updateSettings,
    price: autoDeletePrice,
    userBalance: autoDeleteWalletBalance,
  } = useChatAutoDelete();
  const {
    voicePricePerMinute,
    videoPricePerMinute,
    voiceMessagePrice,
    messageDeletePrice,
    canSendVoiceMessage,
    currencySymbol: callCurrencySymbol,
    activeSession: activeCallSession,
    endingSession: endingCallSession,
    startCallSession,
    endCallSession,
    refreshStatus: refreshCallStatus,
  } = useChatCallPricing();
  const { startOutgoingCall, endCurrentCall, activeSessionId } = usePrivateCallLayer();
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
  const [composerError, setComposerError] = useState<string | null>(null);
  const [isVoiceUploading, setIsVoiceUploading] = useState(false);
  const [callTimerTick, setCallTimerTick] = useState(0);

  const messagesEndRef = useRef<HTMLDivElement>(null);
  const scrollAreaRef = useRef<HTMLDivElement>(null);
  const typingTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const prevMessageCountRef = useRef(0);
  const messageInputRef = useRef<HTMLInputElement>(null);
  const hasAutoSelectedConversationRef = useRef(false);
  const typingActiveRef = useRef(false);
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
  const activeConversationPending = useMemo(() => {
    if (!activeConversation) {
      return [];
    }
    return pendingOutgoing.filter((item) => item.receiverId === activeConversation);
  }, [activeConversation, pendingOutgoing]);
  const activeConversationFailed = useMemo(
    () => activeConversationPending.filter((item) => item.status === "failed"),
    [activeConversationPending]
  );
  const activeConversationPendingCount = useMemo(
    () => activeConversationPending.filter((item) => item.status === "pending").length,
    [activeConversationPending]
  );
  const hasTypedMessage = messageInput.trim().length > 0;
  const activeUserProfile = activeUser || (
    activeConversation && preselectedConversationUserId && activeConversation === preselectedConversationUserId
      ? directConversationUser
      : null
  );
  const activeConversationReceiver = useMemo(() => {
    if (!activeUserProfile) {
      return null;
    }

    return {
      id: activeUserProfile.id,
      username: activeUserProfile.username,
      firstName: activeUserProfile.firstName,
      lastName: activeUserProfile.lastName,
      avatarUrl: activeUserProfile.avatarUrl,
      accountId: activeUserProfile.accountId,
    };
  }, [activeUserProfile]);

  const isCurrentConversationCallSession = useMemo(() => {
    if (!activeConversation || !activeCallSession) {
      return false;
    }

    return activeConversation === activeCallSession.callerId || activeConversation === activeCallSession.receiverId;
  }, [activeCallSession, activeConversation]);

  const canJoinRecoveredCall = useMemo(() => {
    if (!isCurrentConversationCallSession || !activeCallSession?.id) {
      return false;
    }
    return activeSessionId !== activeCallSession.id;
  }, [activeCallSession?.id, activeSessionId, isCurrentConversationCallSession]);

  const activeCallElapsedSeconds = useMemo(() => {
    if (!activeCallSession?.startedAt) {
      return 0;
    }

    const startedAtMs = new Date(activeCallSession.startedAt).getTime();
    if (!Number.isFinite(startedAtMs)) {
      return 0;
    }

    return Math.max(0, Math.floor((Date.now() - startedAtMs) / 1000));
  }, [activeCallSession, callTimerTick]);

  const activeCallEstimatedMinutes = useMemo(() => {
    if (!isCurrentConversationCallSession) {
      return 0;
    }
    return Math.max(1, Math.ceil(activeCallElapsedSeconds / 60));
  }, [activeCallElapsedSeconds, isCurrentConversationCallSession]);

  const activeCallEstimatedCost = useMemo(() => {
    if (!activeCallSession || !isCurrentConversationCallSession) {
      return 0;
    }
    return Number((activeCallEstimatedMinutes * activeCallSession.ratePerMinute).toFixed(2));
  }, [activeCallEstimatedMinutes, activeCallSession, isCurrentConversationCallSession]);

  const formattedActiveCallElapsed = useMemo(() => {
    const minutes = Math.floor(activeCallElapsedSeconds / 60);
    const seconds = activeCallElapsedSeconds % 60;
    return `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
  }, [activeCallElapsedSeconds]);
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

  useEffect(() => {
    if (!activeCallSession?.id) {
      setCallTimerTick(0);
      return;
    }

    const timer = window.setInterval(() => {
      setCallTimerTick((prev) => prev + 1);
    }, 1000);

    return () => {
      window.clearInterval(timer);
    };
  }, [activeCallSession?.id]);

  useEffect(() => {
    if (!activeConversation) {
      return;
    }
    void refreshCallStatus();
  }, [activeConversation, refreshCallStatus]);

  useEffect(() => {
    if (typeof window === 'undefined') {
      return;
    }

    const handleChatError = (event: Event) => {
      const detail = (event as CustomEvent<{ message?: string }>).detail;
      if (detail?.message) {
        setComposerError(detail.message);
      }
    };

    window.addEventListener('vex:chat-error', handleChatError as EventListener);
    return () => {
      window.removeEventListener('vex:chat-error', handleChatError as EventListener);
    };
  }, []);

  useEffect(() => {
    if (typeof window === 'undefined') {
      return;
    }

    const handleQueuedStartProcessed = (event: Event) => {
      if (document.visibilityState !== 'visible') {
        return;
      }

      const detail = (event as CustomEvent<{
        receiverId?: string;
        session?: {
          id: string;
          callType: 'voice' | 'video';
          callerId: string;
          receiverId: string;
          ratePerMinute: number;
        };
      }>).detail;

      if (!detail?.session?.id || !detail.receiverId || !activeConversation || detail.receiverId !== activeConversation) {
        return;
      }

      if (activeSessionId === detail.session.id) {
        return;
      }

      void startOutgoingCall({
        sessionId: detail.session.id,
        peerUserId: detail.receiverId,
        callType: detail.session.callType,
        ratePerMinute: Number(detail.session.ratePerMinute || 0),
        isCaller: detail.session.callerId === user?.id,
      })
        .then(() => refreshCallStatus())
        .catch(async (error) => {
          await endCallSession(detail.session!.id).catch(() => ({ success: false }));
          await refreshCallStatus();

          if (error instanceof Error && error.message === 'media_stream_unavailable') {
            setComposerError(t('challenge.voiceMicPermissionNeeded'));
            return;
          }

          setComposerError(t('common.failed'));
        });
    };

    window.addEventListener(CHAT_CALL_QUEUED_START_PROCESSED_EVENT, handleQueuedStartProcessed as EventListener);
    return () => {
      window.removeEventListener(CHAT_CALL_QUEUED_START_PROCESSED_EVENT, handleQueuedStartProcessed as EventListener);
    };
  }, [activeConversation, activeSessionId, endCallSession, refreshCallStatus, startOutgoingCall, t, user?.id]);

  useEffect(() => {
    if (typeof window === 'undefined') {
      return;
    }

    const handleQueuedCallOperationFailed = (event: Event) => {
      const detail = (event as CustomEvent<{
        kind?: 'start' | 'end';
        receiverId?: string;
        error?: string;
      }>).detail;

      if (!detail || detail.kind !== 'start') {
        return;
      }

      if (activeConversation && detail.receiverId && detail.receiverId !== activeConversation) {
        return;
      }

      setComposerError(detail.error || t('common.failed'));
    };

    window.addEventListener(CHAT_CALL_QUEUED_OPERATION_FAILED_EVENT, handleQueuedCallOperationFailed as EventListener);
    return () => {
      window.removeEventListener(CHAT_CALL_QUEUED_OPERATION_FAILED_EVENT, handleQueuedCallOperationFailed as EventListener);
    };
  }, [activeConversation, t]);

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

    setComposerError(null);
    sendMessage(activeConversation, messageInput.trim(), "text", undefined, {
      isDisappearing: disappearingMode,
      disappearAfterRead: disappearingMode,
      replyToId: replyTo?.id,
      receiverUser: activeConversationReceiver,
    });
    setMessageInput("");
    setReplyTo(null);
    setTyping(activeConversation, false);
    typingActiveRef.current = false;
  };

  const handleMediaUpload = async (file: File) => {
    if (!activeConversation) return;
    setComposerError(null);
    const result = await uploadMedia(file, activeConversation);
    if (result.success && result.url) {
      const isVideo = file.type.startsWith("video/");
      sendMessage(activeConversation, "", isVideo ? "video" : "image", result.url, {
        replyToId: replyTo?.id,
        receiverUser: activeConversationReceiver,
      });
      setReplyTo(null);
      return;
    }

    setComposerError(result.error || t('support.uploadFailed'));
  };

  const handleStartCallSession = useCallback(async (callType: 'voice' | 'video') => {
    if (!activeConversation) {
      return;
    }

    setComposerError(null);
    const result = await startCallSession(activeConversation, callType);
    if (!result.success) {
      setComposerError(result.error || t('common.failed'));
      return;
    }

    if (result.queued) {
      setComposerError(t('chat.reconnecting'));
      return;
    }

    if (result.session?.id) {
      try {
        await startOutgoingCall({
          sessionId: result.session.id,
          peerUserId: activeConversation,
          callType,
          ratePerMinute: Number(result.session.ratePerMinute || (callType === 'voice' ? voicePricePerMinute : videoPricePerMinute) || 0),
        });
      } catch (error) {
        await endCallSession(result.session.id).catch(() => ({ success: false }));
        await refreshCallStatus();

        if (error instanceof Error && error.message === 'media_stream_unavailable') {
          setComposerError(t('challenge.voiceMicPermissionNeeded'));
          return;
        }

        setComposerError(t('common.failed'));
        return;
      }
    }

    await refreshCallStatus();
  }, [activeConversation, endCallSession, refreshCallStatus, startCallSession, startOutgoingCall, t, videoPricePerMinute, voicePricePerMinute]);

  const handleEndCallSession = useCallback(async () => {
    if (!activeCallSession?.id) {
      return;
    }

    setComposerError(null);
    let result: { success: boolean; error?: string };

    try {
      result = activeSessionId === activeCallSession.id
        ? await (async () => {
          await endCurrentCall();
          return { success: true } as const;
        })()
        : await endCallSession(activeCallSession.id);
    } catch {
      result = { success: false, error: t('common.failed') };
    }

    if (!result.success) {
      setComposerError(result.error || t('common.failed'));
      return;
    }

    await refreshCallStatus();
  }, [activeCallSession?.id, activeSessionId, endCallSession, endCurrentCall, refreshCallStatus, t]);

  const handleJoinRecoveredCall = useCallback(async () => {
    if (!activeConversation || !activeCallSession?.id) {
      return;
    }

    setComposerError(null);
    try {
      await startOutgoingCall({
        sessionId: activeCallSession.id,
        peerUserId: activeConversation,
        callType: activeCallSession.callType,
        ratePerMinute: Number(activeCallSession.ratePerMinute || 0),
        isCaller: activeCallSession.callerId === user?.id,
      });
      await refreshCallStatus();
    } catch {
      setComposerError(t('common.failed'));
    }
  }, [activeCallSession, activeConversation, refreshCallStatus, startOutgoingCall, t, user?.id]);

  const handleInputChange = (value: string) => {
    setMessageInput(value);
    if (!activeConversation) {
      return;
    }

    const hasMeaningfulInput = value.trim().length > 0;
    if (hasMeaningfulInput && !typingActiveRef.current) {
      setTyping(activeConversation, true);
      typingActiveRef.current = true;
    }

    if (typingTimeoutRef.current) {
      clearTimeout(typingTimeoutRef.current);
    }

    typingTimeoutRef.current = setTimeout(() => {
      setTyping(activeConversation, false);
      typingActiveRef.current = false;
    }, hasMeaningfulInput ? 1200 : 0);
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
    if (messageDeletePrice > 0) {
      const shouldDelete = window.confirm(`${forEveryone ? t('chat.deleteForAll') : t('chat.deleteForMe')} • ${messageDeletePrice} ${callCurrencySymbol}`);
      if (!shouldDelete) {
        return;
      }
    }
    deleteMessage(msg.id, forEveryone);
  };

  const handleReaction = (messageId: string, emoji: string) => {
    reactToMessage(messageId, emoji);
  };

  // Voice recording
  const startRecording = async () => {
    if (!activeConversation) {
      return;
    }

    if (!canSendVoiceMessage) {
      setComposerError(`${t('chat.voiceMsg')} • ${voiceMessagePrice} ${callCurrencySymbol}`);
      return;
    }

    const authToken = token || localStorage.getItem("pwm_token") || "";
    const preferredMimeType = getPreferredVoiceMimeType();
    const conversationId = activeConversation;
    const replyToId = replyTo?.id;
    const receiverUser = activeConversationReceiver;

    try {
      setComposerError(null);
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const mediaRecorder = preferredMimeType
        ? new MediaRecorder(stream, { mimeType: preferredMimeType })
        : new MediaRecorder(stream);
      mediaRecorderRef.current = mediaRecorder;
      audioChunksRef.current = [];

      mediaRecorder.ondataavailable = (e) => {
        if (e.data.size > 0) audioChunksRef.current.push(e.data);
      };

      mediaRecorder.onstop = async () => {
        const uploadMimeType = normalizeMimeType(mediaRecorder.mimeType || preferredMimeType || "audio/webm") || "audio/webm";
        const audioBlob = new Blob(audioChunksRef.current, { type: uploadMimeType });
        stream.getTracks().forEach(t => t.stop());

        if (audioBlob.size > 0 && conversationId) {
          setIsVoiceUploading(true);

          try {
            const base64 = await blobToBase64(audioBlob);
            const response = await fetch('/api/chat/media/upload', {
              method: 'POST',
              headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${authToken}`,
              },
              body: JSON.stringify({
                data: base64,
                mimeType: uploadMimeType,
                fileName: `voice_${Date.now()}.${getVoiceFileExtension(uploadMimeType)}`,
              }),
            });

            const data = await response.json();
            if (!response.ok || !data.mediaUrl) {
              throw new Error(String(data.error || data.message || t('support.uploadFailed')));
            }

            sendMessage(conversationId, "", "voice", data.mediaUrl, {
              replyToId,
              receiverUser,
            });
            setReplyTo(null);
          } catch (err) {
            console.error("Failed to send voice message:", err);
            setComposerError(
              err instanceof Error && err.message
                ? err.message
                : t('support.uploadFailed')
            );
          } finally {
            setIsVoiceUploading(false);
          }
        }

        setRecordingTime(0);
        audioChunksRef.current = [];
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
      if (err instanceof DOMException && err.name === "NotAllowedError") {
        setComposerError(t('challenge.voiceMicPermissionNeeded'));
        return;
      }

      setComposerError(t('common.failed'));
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
    <div
      className={cn(
        "flex h-full min-h-0 bg-[radial-gradient(circle_at_top,hsl(var(--primary)/0.1),transparent_40%)] md:pb-0",
        embedded ? "pb-0" : "pb-[calc(4.5rem+env(safe-area-inset-bottom))]"
      )}
    >
      {/* =================== Conversation List =================== */}
      <div className={cn(
        "border-e flex flex-col bg-muted/40 w-full md:w-80",
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
                      "w-full p-3 min-h-[48px] rounded-xl text-start hover:bg-accent/50 active:bg-accent transition-colors",
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
            <div className="p-3 sm:p-4 border-b flex items-center gap-2 sm:gap-3">
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
                <h3 className="font-semibold flex min-w-0 items-center gap-2">
                  <span className="truncate">
                    {activeUserProfile?.firstName || activeUserProfile?.username || `@${activeConversation}`}
                  </span>
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <Badge variant="outline" className="h-5 shrink-0 gap-1 border-emerald-500/30 px-1.5 py-0 text-[10px] text-emerald-500">
                        <Shield className="h-3 w-3" />
                        E2EE
                      </Badge>
                    </TooltipTrigger>
                    <TooltipContent>
                      <p>{t('chat.e2eeTooltip')}</p>
                    </TooltipContent>
                  </Tooltip>
                </h3>
                <p className="truncate text-xs text-muted-foreground">
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
              <div className="flex max-w-[58vw] flex-wrap items-center justify-end gap-1 pb-0.5 sm:max-w-none sm:flex-nowrap sm:gap-1.5">
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Button variant="ghost" size="icon" className="h-9 w-9 min-h-[44px] min-w-[44px] shrink-0"
                      onClick={() => { setShowChatSearch(!showChatSearch); setChatSearchQuery(""); }}>
                      <Search className="h-4 w-4" />
                    </Button>
                  </TooltipTrigger>
                  <TooltipContent><p>{t('chat.searchInChat')}</p></TooltipContent>
                </Tooltip>

                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-9 w-9 min-h-[44px] min-w-[44px] shrink-0"
                    >
                      <PhoneCall className="h-4 w-4" />
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end" className="w-64">
                    <DropdownMenuItem
                      disabled={!activeConversation || !!activeCallSession}
                      onClick={() => void handleStartCallSession('voice')}
                      className="gap-2"
                    >
                      <Phone className="h-4 w-4" />
                      <div className="flex min-w-0 flex-col">
                        <span className="truncate">{t('challenge.voiceStart')}</span>
                        <span className="text-[11px] text-muted-foreground">{`${voicePricePerMinute} ${callCurrencySymbol}`}</span>
                      </div>
                    </DropdownMenuItem>
                    <DropdownMenuItem
                      disabled={!activeConversation || !!activeCallSession}
                      onClick={() => void handleStartCallSession('video')}
                      className="gap-2"
                    >
                      <Video className="h-4 w-4" />
                      <div className="flex min-w-0 flex-col">
                        <span className="truncate">{t('chat.video')}</span>
                        <span className="text-[11px] text-muted-foreground">{`${videoPricePerMinute} ${callCurrencySymbol}`}</span>
                      </div>
                    </DropdownMenuItem>
                    <DropdownMenuSeparator />
                    <DropdownMenuItem onClick={() => setShowPinSetup(true)} className="gap-2">
                      <Lock className={cn("h-4 w-4", hasPinEnabled ? "text-emerald-500" : "text-muted-foreground")} />
                      <span>{hasPinEnabled ? t('chat.pinSettings') : t('chat.setPin')}</span>
                    </DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>

                {canJoinRecoveredCall && activeCallSession && (
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-9 w-9 min-h-[44px] min-w-[44px] shrink-0"
                        onClick={() => void handleJoinRecoveredCall()}
                      >
                        <Phone className="h-4 w-4" />
                      </Button>
                    </TooltipTrigger>
                    <TooltipContent>
                      <p>{t('common.accept')}</p>
                    </TooltipContent>
                  </Tooltip>
                )}

                {isCurrentConversationCallSession && activeCallSession && (
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-9 w-9 min-h-[44px] min-w-[44px] shrink-0 text-destructive"
                        disabled={endingCallSession}
                        onClick={() => void handleEndCallSession()}
                      >
                        {endingCallSession ? <Loader2 className="h-4 w-4 animate-spin" /> : <PhoneOff className="h-4 w-4" />}
                      </Button>
                    </TooltipTrigger>
                    <TooltipContent>
                      <p>{t('common.cancel')}</p>
                    </TooltipContent>
                  </Tooltip>
                )}

                {/* Auto-translate toggle */}
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Button
                      variant={autoTranslate ? "default" : "ghost"}
                      size="icon"
                      className={cn("h-9 w-9 min-h-[44px] min-w-[44px] shrink-0", autoTranslate && "text-primary-foreground")}
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
                    <Button variant="outline" size="sm" className="h-9 min-h-[44px] min-w-[44px] shrink-0 gap-1 px-2 text-xs text-foreground">
                      <span className="hidden max-w-[90px] truncate sm:inline">{currentLanguageInfo?.nativeName || targetLanguage}</span>
                      <span className="text-[10px] font-semibold uppercase sm:hidden">{targetLanguage}</span>
                      <ChevronDown className="hidden h-3 w-3 sm:inline" />
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
                    <Button variant="ghost" size="icon" className="hidden h-9 w-9 min-h-[44px] min-w-[44px] shrink-0 min-[381px]:inline-flex">
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

                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button variant="ghost" size="icon" className="h-9 w-9 min-h-[44px] min-w-[44px] shrink-0 min-[381px]:hidden">
                      <MoreHorizontal className="h-4 w-4" />
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

            {isCurrentConversationCallSession && activeCallSession && (
              <div className="border-b bg-primary/5 px-3 py-2">
                <div className="flex flex-wrap items-center justify-between gap-2 text-xs">
                  <div className="flex min-w-0 items-center gap-2">
                    <Badge variant="outline" className="h-6 gap-1 text-[10px]">
                      {activeCallSession.callType === 'voice' ? <Phone className="h-3 w-3" /> : <Video className="h-3 w-3" />}
                      {activeCallSession.callType === 'voice' ? t('challenge.voiceStart') : t('chat.video')}
                    </Badge>
                    <span className="font-mono text-primary">{formattedActiveCallElapsed}</span>
                  </div>
                  <div className="flex items-center gap-2 text-muted-foreground">
                    <span className="whitespace-nowrap">{`${activeCallSession.ratePerMinute} ${callCurrencySymbol}`}</span>
                    <span className="font-medium text-foreground">{`~ ${activeCallEstimatedCost} ${callCurrencySymbol}`}</span>
                    <span className="text-[10px]">({activeCallEstimatedMinutes})</span>
                    {canJoinRecoveredCall && (
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        className="h-8 w-8"
                        onClick={() => void handleJoinRecoveredCall()}
                      >
                        <Phone className="h-3.5 w-3.5" />
                      </Button>
                    )}
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      className="h-8 w-8 text-destructive"
                      disabled={endingCallSession}
                      onClick={() => void handleEndCallSession()}
                    >
                      {endingCallSession ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <PhoneOff className="h-3.5 w-3.5" />}
                    </Button>
                  </div>
                </div>
              </div>
            )}

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
            <div className="flex-1 overflow-y-auto p-2 sm:p-4 relative" onScroll={handleScroll} ref={scrollAreaRef}>
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
                          <div className={cn("max-w-[85%] sm:max-w-[70%] relative")}>
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
                                  {/* Attachment fallback for backward-compatible records */}
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
                                      <p className="text-sm whitespace-pre-wrap break-words [overflow-wrap:anywhere] leading-relaxed">
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

                            {/* Message actions: always available on touch, hover-enhanced on larger screens */}
                            {!isDeleted && (
                              <div className={cn(
                                "mt-1 flex items-center gap-0.5 rounded-lg border bg-background p-0.5 shadow-sm transition-opacity sm:absolute sm:top-0 sm:mt-0 sm:opacity-0 sm:group-hover:opacity-100",
                                isMine
                                  ? "justify-end sm:-start-2 sm:-translate-x-full"
                                  : "justify-start sm:-end-2 sm:translate-x-full"
                              )}
                                onClick={(event) => event.stopPropagation()}
                              >
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
                  className="fixed bottom-[calc(6rem+env(safe-area-inset-bottom))] end-4 sm:end-8 z-10 bg-background border shadow-lg rounded-full p-2 hover:bg-accent transition-colors"
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
            <div className="p-3 sm:p-4 border-t bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/80 pb-[max(0.75rem,env(safe-area-inset-bottom))]">
              {(activeConversationPendingCount > 0 || isVoiceUploading) && (
                <div className="mb-2 flex items-center gap-2 text-xs text-muted-foreground">
                  <Loader2 className="h-3 w-3 animate-spin" />
                  <span>{t("common.loading")}</span>
                </div>
              )}

              {(voiceMessagePrice > 0 || messageDeletePrice > 0) && (
                <div className="mb-2 flex flex-wrap items-center gap-1.5 text-[11px] text-muted-foreground">
                  {voiceMessagePrice > 0 && (
                    <Badge variant="outline" className="border-primary/30 bg-primary/5 text-[11px]">
                      {`${t('chat.voiceMsg')} • ${voiceMessagePrice} ${callCurrencySymbol}`}
                    </Badge>
                  )}
                  {messageDeletePrice > 0 && (
                    <Badge variant="outline" className="border-amber-500/30 bg-amber-500/5 text-[11px] text-amber-600 dark:text-amber-400">
                      {`${t('chat.deleteForAll')} • ${messageDeletePrice} ${callCurrencySymbol}`}
                    </Badge>
                  )}
                </div>
              )}

              {composerError && (
                <div className="mb-2 rounded-md border border-destructive/30 bg-destructive/10 px-2.5 py-2 text-xs text-destructive">
                  {composerError}
                </div>
              )}

              {activeConversationFailed.length > 0 && (
                <div className="mb-2 space-y-2">
                  {activeConversationFailed.slice(0, 3).map((failed) => (
                    <div
                      key={failed.clientMessageId}
                      className="flex items-center justify-between gap-2 rounded-md border border-destructive/30 bg-destructive/10 px-2.5 py-2"
                    >
                      <div className="min-w-0 flex items-center gap-2 text-xs text-destructive">
                        <AlertCircle className="h-3.5 w-3.5 shrink-0" />
                        <span className="truncate">{failed.preview || t("common.failed")}</span>
                      </div>
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        className="h-7 px-2"
                        onClick={() => retryPendingMessage(failed.clientMessageId)}
                      >
                        {t("common.retry")}
                      </Button>
                    </div>
                  ))}
                </div>
              )}

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
                <div className="flex flex-col gap-2 sm:flex-row sm:items-end">
                  <div className="flex items-center gap-1.5 sm:gap-2 overflow-x-auto pb-1 sm:overflow-visible sm:pb-0 [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <Button
                          variant={hasAutoDelete && disappearingMode ? "default" : "ghost"} size="icon"
                          onClick={() => {
                            if (!hasAutoDelete) {
                              setShowAutoDeletePurchase(true);
                              return;
                            }
                            setDisappearingMode(!disappearingMode);
                          }}
                          className={cn("shrink-0 h-10 w-10", hasAutoDelete && disappearingMode && "text-primary-foreground")}
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

                    {hasAutoDelete && (
                      <AutoDeleteToggle
                        hasAccess={true}
                        isActive={hasAutoDelete}
                        deleteAfterMinutes={deleteAfterMinutes}
                        onToggle={() => { }}
                        onPurchaseClick={() => { }}
                        onSettingsClick={() => setShowAutoDeleteSettings(true)}
                      />
                    )}
                  </div>

                  <div className="flex min-w-0 flex-1 items-end gap-1.5 sm:gap-2">
                    <Input
                      ref={messageInputRef}
                      value={messageInput}
                      onChange={(e) => handleInputChange(e.target.value)}
                      onKeyDown={handleKeyPress}
                      placeholder={editingMsg ? t('chat.editMessagePlaceholder') : replyTo ? t('chat.replyPlaceholder') : t("chat.typeMessage")}
                      className="min-w-0 flex-1 min-h-[44px] rounded-full px-4"
                      data-testid="input-chat-message"
                    />

                    {hasTypedMessage || editingMsg ? (
                      <Button
                        onClick={handleSendMessage}
                        disabled={!hasTypedMessage && !editingMsg}
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
                            disabled={isVoiceUploading || !canSendVoiceMessage}
                            className="min-h-[44px] min-w-[44px] rounded-full hover:bg-destructive/10 hover:text-destructive"
                          >
                            <Mic className="h-5 w-5" />
                          </Button>
                        </TooltipTrigger>
                        <TooltipContent><p>{t('chat.voiceMessage')}</p></TooltipContent>
                      </Tooltip>
                    )}
                  </div>
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
        onPurchase={purchaseMedia}
        price={mediaPrice}
        userBalance={mediaWalletBalance}
      />
      <AutoDeletePurchaseDialog
        open={showAutoDeletePurchase} onOpenChange={setShowAutoDeletePurchase}
        onPurchase={purchaseAutoDelete}
        price={autoDeletePrice}
        userBalance={autoDeleteWalletBalance}
      />
      <AutoDeleteSettingsDialog
        open={showAutoDeleteSettings} onOpenChange={setShowAutoDeleteSettings}
        currentMinutes={deleteAfterMinutes} onSave={updateSettings}
      />
    </div>
  );
}
