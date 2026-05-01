import { useState, useRef, useEffect, useCallback, useMemo } from "react";
import { useScrollAnchorOnPrepend } from "@/hooks/use-scroll-anchor-on-prepend";
import { useMutation } from "@tanstack/react-query";
import type { ChatMessage } from "@shared/schema";
import { useChat } from "@/hooks/use-chat";
import { useAuth } from "@/lib/auth";
import { useI18n } from "@/lib/i18n";
import { useToast } from "@/hooks/use-toast";
import { apiRequest } from "@/lib/queryClient";
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
import { MessageCircle, Send, Check, CheckCheck, Loader2, AlertCircle, Search, Timer, ArrowLeft, Shield, Lock, Paperclip, Reply, Trash2, Pencil, Smile, X, CornerDownRight, Mic, MicOff, ChevronDown, Languages, Palette, Phone, Video, PhoneCall, PhoneOff, MoreHorizontal, Bell, BellOff, PhoneMissed } from "lucide-react";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { cn } from "@/lib/utils";
import { format, isToday, isYesterday } from "date-fns";
import { PinLockScreen, PinSetupDialog } from "@/components/chat-pin-lock";
import { MediaUploadButton, MediaPurchaseDialog, ChatMediaRenderer } from "@/components/chat-media";
import { AutoDeleteToggle, AutoDeletePurchaseDialog, AutoDeleteSettingsDialog, AutoDeleteCountdown } from "@/components/chat-auto-delete";
import { ChatUnlockDialog } from "@/components/chat/ChatUnlockDialog";
import { normalizeChatDraft } from "@/lib/chat-text";
import { useKeyboardInset } from "@/hooks/use-keyboard-inset";
import { useLocation } from "wouter";

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

/**
 * Task #55 — Decode the JSON envelope stored in `chat_messages.content`
 * for missed-call entries. Returns null if the row isn't actually a
 * missed-call event (so legacy plain-text rows degrade gracefully to the
 * normal text render path).
 */
interface MissedCallEntry {
  callType: "voice" | "video";
  outcome: "missed" | "declined";
  sessionId: string;
}

function parseMissedCallEntry(content: string | null | undefined): MissedCallEntry | null {
  if (!content) return null;
  try {
    const parsed = JSON.parse(content);
    if (!parsed || parsed.kind !== "call_missed") return null;
    return {
      callType: parsed.callType === "video" ? "video" : "voice",
      outcome: parsed.outcome === "declined" ? "declined" : "missed",
      sessionId: typeof parsed.sessionId === "string" ? parsed.sessionId : "",
    };
  } catch {
    return null;
  }
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
  const { user, token, refreshUser } = useAuth();
  const { toast } = useToast();
  const {
    conversations, activeConversation, messages, typingUsers,
    isConnected, isChatEnabled, onlineUsers, lastSeenMap,
    hasMoreMessages, loadingMore,
    sendMessage, setTyping, selectConversation, loadMoreMessages,
    refreshConversations, deleteMessage, editMessage, reactToMessage,
    searchMessages, searchResults, markAsRead,
    pendingOutgoing, retryPendingMessage,
    unlockPrompt, confirmUnlock, dismissUnlock,
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
  useKeyboardInset();
  const {
    getDisplayText, getTranslatedText, hasTranslation, toggleTranslation, isTranslating: isTranslatingMsg,
    isShowingOriginal, autoTranslate, setAutoTranslate, translateMessage,
    targetLanguage, setTargetLanguage, languages, currentLanguageInfo,
  } = useMessageTranslation();

  const [messageInput, setMessageInput] = useState("");
  const [searchQuery, setSearchQuery] = useState("");
  const [chatListFilter, setChatListFilter] = useState<"all" | "unread" | "online">("all");
  const [, navigate] = useLocation();
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
  // Tracks IME composition (Android Gboard with Arabic keyboard, Chinese
  // pinyin, etc.) so the Mic↔Send toggle reacts the moment the user starts
  // typing instead of waiting for the composition to commit.
  const [isComposingInput, setIsComposingInput] = useState(false);
  const [inputHasText, setInputHasText] = useState(false);
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
  // Task #27 + #78: scroll-anchoring for "load older" pagination.
  // The hook snapshots the formerly-first-rendered message's
  // offsetTop + the container's scrollTop when `snapshotForPrepend`
  // is called from the scroll handler, then restores the viewport in
  // a `useLayoutEffect` (pre-paint, no flash) by re-finding that
  // message in the post-commit DOM via `data-message-id` and pinning
  // its viewport-relative Y position. Concurrent bottom-arriving
  // messages do not perturb the anchor message's offsetTop, so the
  // restore is concurrent-safe. `consumeJustRestored()` is checked
  // by the auto-bottom-scroll effect below to skip exactly one tick
  // so it doesn't immediately yank the viewport back to the latest
  // message after a successful pin.
  const { snapshotForPrepend, consumeJustRestored } = useScrollAnchorOnPrepend({
    scrollContainerRef: scrollAreaRef,
    messages,
  });
  const messageInputRef = useRef<HTMLInputElement>(null);
  const hasAutoSelectedConversationRef = useRef(false);
  const typingActiveRef = useRef(false);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const recordingIntervalRef = useRef<NodeJS.Timeout | null>(null);
  const audioChunksRef = useRef<Blob[]>([]);
  const isComposingRef = useRef(false);
  const { play: playSound } = useSoundEffects();

  const preselectedConversationUserId = useMemo(() => {
    const query = new URLSearchParams(window.location.search);
    const targetUserId = query.get("user");
    return targetUserId && targetUserId.trim().length > 0 ? targetUserId.trim() : null;
  }, []);

  const activeUser = conversations.find((c) => c.otherUserId === activeConversation)?.otherUser;

  const notificationMutedUserIds = useMemo(() => {
    const list = user?.notificationMutedUsers;
    return new Set(Array.isArray(list) ? list : []);
  }, [user]);

  const isActiveConversationNotifMuted = useMemo(() => {
    if (!activeConversation) return false;
    return notificationMutedUserIds.has(activeConversation);
  }, [notificationMutedUserIds, activeConversation]);

  const notificationMuteMutation = useMutation({
    mutationFn: async ({ peerId, mute }: { peerId: string; mute: boolean }) => {
      await apiRequest(
        mute ? "POST" : "DELETE",
        `/api/users/${peerId}/notification-mute`,
      );
      return mute;
    },
    onSuccess: (mute) => {
      toast({
        title: mute
          ? t("chat.muteNotificationsSuccess")
          : t("chat.unmuteNotificationsSuccess"),
      });
      void refreshUser();
    },
    onError: (err: Error) => {
      toast({
        title: t("common.error"),
        description: err.message,
        variant: "destructive",
      });
    },
  });

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
  const hasTypedMessage = normalizeChatDraft(messageInput).length > 0;
  // The controlled `messageInput` may lag behind the real DOM value while an
  // IME (Arabic Gboard, Chinese pinyin, Japanese kana) is composing. We track
  // a separate flag that gets refreshed from the actual <input>.value on
  // every input/composition event so the Send button toggle reflects the
  // physical keystrokes the user is making, even before React state catches
  // up. This is the source of truth for the Send / Mic toggle.
  const shouldShowSendButton = hasTypedMessage || inputHasText || isComposingInput || !!editingMsg;
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

  // Task #27 + #78: scroll-anchor restoration is owned by the
  // `useScrollAnchorOnPrepend` hook above. The hook re-finds the
  // formerly-first-rendered message in the post-commit DOM (via
  // `data-message-id`) and pins its viewport-relative Y position in
  // a `useLayoutEffect` — pre-paint, so there is no flash or jump
  // even when a brand-new message arrives at the bottom while the
  // older-page request is still in flight (the bottom append does
  // not perturb the anchor message's offsetTop, so the formula is
  // concurrent-safe by construction). The hook also exposes
  // `consumeJustRestored()` which the auto-bottom-scroll effect
  // below uses to skip exactly one tick after a restore.

  // Auto scroll and sound on new messages
  useEffect(() => {
    // Task #27: skip the auto-bottom-scroll on the same tick we just
    // restored an older-page anchor — otherwise the smooth-scroll
    // would override our pin and snap the viewport back to the
    // latest message, defeating the whole point.
    if (consumeJustRestored()) {
      // Keep the message-count baseline in sync so the next genuine
      // new-message tick still triggers correctly.
      prevMessageCountRef.current = messages.length;
      return;
    }
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

  // Task #27: clear any pending scroll anchor when the user switches
  // conversations — the hook self-cleans when the anchor message
  // leaves the DOM (the post-switch messages array is empty so
  // `querySelector` for the previous anchor id returns null and the
  // hook drops the anchor).

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

  // When a conversation is open on mobile, hide the bottom navigation so the
  // composer (input area) sits flush against the screen edge / soft keyboard
  // instead of having the nav bar sandwiched between them. Driven via a body
  // class so a CSS rule in index.css handles the actual hiding.
  useEffect(() => {
    if (embedded || typeof document === 'undefined') {
      return;
    }
    if (!mobileShowMessages) {
      return;
    }
    document.body.classList.add('chat-conversation-active');
    return () => {
      document.body.classList.remove('chat-conversation-active');
    };
  }, [embedded, mobileShowMessages]);

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
      // Task #27 + #78: snapshot the formerly-first-rendered message's
      // position *now*, before the older page is fetched and
      // prepended. The hook re-finds that message in the post-commit
      // DOM and pins its viewport-relative Y, which is concurrent-
      // safe against bottom-arriving messages racing the fetch.
      // The `!loadingMore` guard above prevents us from overwriting
      // an in-flight anchor.
      snapshotForPrepend();
      loadMoreMessages();
    }
    // Show/hide scroll down button
    const isNearBottom = target.scrollHeight - target.scrollTop - target.clientHeight < 200;
    setShowScrollDown(!isNearBottom);
  }, [hasMoreMessages, loadingMore, loadMoreMessages, messages]);

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

    const normalizedDraft = normalizeChatDraft(messageInput);

    // Edit mode
    if (editingMsg) {
      if (normalizedDraft && normalizedDraft !== editingMsg.content) {
        editMessage(editingMsg.id, normalizedDraft);
      }
      setEditingMsg(null);
      setMessageInput("");
      setInputHasText(false);
      return;
    }

    if (!normalizedDraft) return;

    setComposerError(null);
    sendMessage(activeConversation, normalizedDraft, "text", undefined, {
      isDisappearing: disappearingMode,
      disappearAfterRead: disappearingMode,
      replyToId: replyTo?.id,
      receiverUser: activeConversationReceiver,
    });
    setMessageInput("");
    setInputHasText(false);
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
    const isComposing = isComposingRef.current || e.nativeEvent.isComposing || e.key === "Process";
    if (isComposing) {
      return;
    }

    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSendMessage();
    }
    if (e.key === "Escape") {
      setReplyTo(null);
      setEditingMsg(null);
      setMessageInput("");
      setInputHasText(false);
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
    setInputHasText(normalizeChatDraft(msg.content || "").length > 0);
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

  // Derived counters for the Stadium-style sidebar header. `totalUnread`
  // sums every conversation's badge so the header pill matches what the user
  // sees. `unreadCount` is the count of conversations (rows) that have any
  // unread messages — used to label the "Unread" filter pill. `chatOnlineCount`
  // counts conversations whose peer is currently online.
  const totalUnread = useMemo(
    () => conversations.reduce((sum, c) => sum + (c.unreadCount || 0), 0),
    [conversations]
  );
  const unreadCount = useMemo(
    () => conversations.filter((c) => (c.unreadCount || 0) > 0).length,
    [conversations]
  );
  const chatOnlineCount = useMemo(
    () => conversations.filter((c) => onlineUsers.has(c.otherUserId)).length,
    [conversations, onlineUsers]
  );

  const filteredConversations = conversations.filter((conv) => {
    if (chatListFilter === "unread" && conv.unreadCount === 0) return false;
    if (chatListFilter === "online" && !onlineUsers.has(conv.otherUserId)) return false;
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
        "pb-0"
      )}
    >
      {/* =================== Conversation List =================== */}
      <div className={cn(
        "border-e flex flex-col bg-muted/40 w-full md:w-80",
        mobileShowMessages ? "hidden md:flex" : "flex"
      )}>
        {/* ── Stadium-style sidebar header ── */}
        <div className="relative overflow-hidden border-b">
          <div className="absolute inset-0 bg-gradient-to-br from-[#0f1730] via-[#0a0e1a] to-[#0f1730] pointer-events-none" />
          <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_top_right,rgba(30,136,255,0.22),transparent_60%)] pointer-events-none" />
          <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_bottom_left,rgba(255,182,39,0.08),transparent_60%)] pointer-events-none" />
          <div className="relative p-3 sm:p-4 space-y-3">
            <div className="flex items-start justify-between gap-2">
              <div className="min-w-0">
                <h2
                  className="font-display tracking-wider text-3xl sm:text-4xl text-white leading-none drop-shadow-[0_2px_8px_rgba(30,136,255,0.5)]"
                  data-testid="text-chat-title"
                >
                  {t("chat.title")}
                </h2>
                <p className="text-[11px] text-white/55 mt-1">{t("chat.heroSubtitle")}</p>
              </div>
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button
                    variant="outline"
                    size="icon"
                    className="h-9 w-9 rounded-xl border-white/20 bg-white/5 hover:bg-white/10 backdrop-blur-sm shrink-0"
                    onClick={() => navigate("/friends")}
                    aria-label={t("chat.newChat")}
                    data-testid="button-new-chat"
                  >
                    <Pencil className="h-4 w-4 text-white" />
                  </Button>
                </TooltipTrigger>
                <TooltipContent>
                  <p>{t("chat.newChat")}</p>
                </TooltipContent>
              </Tooltip>
            </div>
            {/* Status pills */}
            <div className="flex flex-wrap items-center gap-1.5">
              {!isConnected && (
                <span className="inline-flex items-center gap-1 rounded-full bg-amber-500/15 border border-amber-500/30 px-2 py-0.5 text-[10px] font-medium text-amber-300">
                  <Loader2 className="w-2.5 h-2.5 animate-spin" />
                  {t("chat.reconnecting")}
                </span>
              )}
              {totalUnread > 0 && (
                <span
                  className="inline-flex items-center gap-1 rounded-full bg-brand-blue/15 border border-brand-blue/40 px-2 py-0.5 text-[10px] font-medium text-[#90c8ff] tabular-nums"
                  data-testid="badge-total-unread"
                >
                  <MessageCircle className="w-2.5 h-2.5" />
                  {t("chat.totalUnread", { count: totalUnread > 99 ? "99+" : totalUnread })}
                </span>
              )}
              {chatOnlineCount > 0 && (
                <span
                  className="inline-flex items-center gap-1 rounded-full bg-emerald-500/15 border border-emerald-500/30 px-2 py-0.5 text-[10px] font-medium text-emerald-300 tabular-nums"
                  data-testid="badge-online-count"
                >
                  <span className="relative flex h-1.5 w-1.5">
                    <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400 opacity-75" />
                    <span className="relative inline-flex h-1.5 w-1.5 rounded-full bg-emerald-500" />
                  </span>
                  {chatOnlineCount}
                </span>
              )}
            </div>
            {/* Search */}
            <div className="relative">
              <Search className="absolute start-3 top-1/2 -translate-y-1/2 h-4 w-4 text-white/50" />
              <Input
                placeholder={t("chat.searchConversations")}
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="ps-9 h-10 rounded-xl bg-white/[0.06] border-white/15 text-white placeholder:text-white/40 focus:bg-white/[0.1] focus:border-brand-blue/50 transition-all"
                data-testid="input-chat-search"
              />
            </div>
            {/* Filter pills */}
            <div className="flex gap-1.5" data-testid="chat-filter-pills">
              {(["all", "unread", "online"] as const).map((f) => {
                const active = chatListFilter === f;
                const count = f === "unread" ? unreadCount : f === "online" ? chatOnlineCount : conversations.length;
                const labelKey = f === "all" ? "chat.filterAll" : f === "unread" ? "chat.filterUnread" : "chat.filterOnline";
                return (
                  <button
                    key={f}
                    onClick={() => setChatListFilter(f)}
                    className={cn(
                      "flex-1 inline-flex items-center justify-center gap-1.5 px-2 py-1.5 rounded-lg text-[11px] font-medium transition-all",
                      active
                        ? "bg-gradient-to-r from-brand-blue to-brand-blue-dark text-white shadow-[0_4px_14px_-4px_rgba(30,136,255,0.7)]"
                        : "bg-white/[0.04] text-white/60 hover:bg-white/[0.08] hover:text-white"
                    )}
                    data-testid={`chat-filter-${f}`}
                  >
                    <span>{t(labelKey)}</span>
                    {count > 0 && (
                      <span className={cn("inline-flex items-center justify-center min-w-[16px] h-[16px] px-1 rounded-full text-[9px] font-bold tabular-nums",
                        active ? "bg-white/25 text-white" : "bg-white/10 text-white/70")}>
                        {count > 99 ? "99+" : count}
                      </span>
                    )}
                  </button>
                );
              })}
            </div>
          </div>
        </div>

        <ScrollArea className="flex-1">
          {filteredConversations.length === 0 ? (
            <div className="p-6 text-center">
              <div className="mx-auto mb-4 grid place-items-center w-16 h-16 rounded-2xl bg-gradient-to-br from-brand-blue/20 to-brand-blue-dark/20 border border-brand-blue/30">
                <MessageCircle className="h-7 w-7 text-brand-blue" />
              </div>
              <p className="font-display tracking-wider text-xl text-foreground">
                {chatListFilter === "unread" ? t("chat.noUnread") :
                  chatListFilter === "online" ? t("chat.noOnline") :
                    conversations.length === 0 ? t("chat.noConvosTitle") : t("chat.noConversations")}
              </p>
              <p className="text-xs text-muted-foreground/80 mt-1.5 max-w-[220px] mx-auto leading-relaxed">
                {chatListFilter === "unread" ? t("chat.noUnreadDesc") :
                  chatListFilter === "online" ? t("chat.noOnlineDesc") :
                    t("chat.noConvosDesc")}
              </p>
              {conversations.length === 0 && chatListFilter === "all" && (
                <Button
                  size="sm"
                  onClick={() => navigate("/friends")}
                  className="mt-4 h-9 rounded-full px-4 text-xs bg-gradient-to-r from-brand-blue to-brand-blue-dark hover:opacity-95 text-white border-0 shadow-[0_6px_20px_-6px_rgba(30,136,255,0.7)]"
                  data-testid="button-empty-find-friends"
                >
                  <Pencil className="w-3.5 h-3.5 me-1.5" />
                  {t("chat.startChat")}
                </Button>
              )}
            </div>
          ) : (
            <div className="p-2 space-y-1">
              {filteredConversations.map((conv) => {
                const userOnline = onlineUsers.has(conv.otherUserId);
                const isNotifMuted = notificationMutedUserIds.has(conv.otherUserId);
                return (
                  <button
                    key={conv.otherUserId}
                    onClick={() => handleSelectConversation(conv.otherUserId)}
                    className={cn(
                      "group relative w-full p-3 min-h-[48px] rounded-xl text-start transition-all duration-200",
                      "border border-transparent",
                      activeConversation === conv.otherUserId
                        ? "bg-gradient-to-r from-brand-blue/15 to-brand-blue-dark/10 border-brand-blue/40 shadow-[0_4px_14px_-4px_rgba(30,136,255,0.45)]"
                        : conv.unreadCount > 0
                          ? "bg-gradient-to-r from-brand-blue/8 to-transparent border-brand-blue/20 hover:border-brand-blue/40 hover:bg-brand-blue/10"
                          : "hover:bg-white/[0.05] hover:border-white/10"
                    )}
                    data-testid={`chat-conversation-${conv.otherUserId}`}
                  >
                    {conv.unreadCount > 0 && (
                      <span className="absolute start-0 top-1/2 -translate-y-1/2 w-1 h-8 rounded-full bg-gradient-to-b from-brand-blue to-brand-blue-dark" />
                    )}
                    <div className="flex items-start gap-3">
                      <div className="relative">
                        {userOnline && (
                          <span
                            className="pointer-events-none absolute inset-0 rounded-full opacity-70"
                            style={{
                              boxShadow: "0 0 0 2px rgba(16,185,129,0.55), 0 0 14px rgba(16,185,129,0.55)",
                            }}
                            aria-hidden
                          />
                        )}
                        <Avatar className={cn("h-10 w-10 ring-2", userOnline ? "ring-emerald-400/70" : "ring-transparent")}>
                          <AvatarImage src={conv.otherUser.avatarUrl || undefined} />
                          <AvatarFallback className="bg-brand-blue/15 text-brand-blue text-sm font-semibold">{getInitials(conv.otherUser)}</AvatarFallback>
                        </Avatar>
                        <span
                          className={cn(
                            "absolute -bottom-0.5 -end-0.5 w-3 h-3 rounded-full border-2 border-background",
                            userOnline ? "bg-emerald-500" : "bg-zinc-500"
                          )}
                        />
                      </div>
                      <div className="flex-1 min-w-0 space-y-0.5">
                        <div className="flex items-start justify-between gap-2">
                          <div className="flex min-w-0 flex-1 items-start gap-1.5">
                            <span className="line-clamp-2 min-w-0 text-start font-medium leading-tight break-words [overflow-wrap:anywhere]">
                              {conv.otherUser.firstName || conv.otherUser.username}
                            </span>
                            {isNotifMuted && (
                              <Tooltip>
                                <TooltipTrigger asChild>
                                  <span
                                    className="inline-flex shrink-0 items-center text-muted-foreground mt-0.5"
                                    aria-label={t('chat.muteNotificationsSuccess')}
                                    data-testid={`chat-conversation-muted-badge-${conv.otherUserId}`}
                                  >
                                    <BellOff className="h-3.5 w-3.5" />
                                  </span>
                                </TooltipTrigger>
                                <TooltipContent>
                                  <p>{t('chat.muteNotificationsSuccess')}</p>
                                </TooltipContent>
                              </Tooltip>
                            )}
                          </div>
                          <span className="text-xs text-muted-foreground shrink-0">
                            {conv.lastMessage?.createdAt ? formatMessageTime(conv.lastMessage.createdAt, t) : ""}
                          </span>
                        </div>
                        <div className="flex items-start justify-between gap-2">
                          <p className="line-clamp-2 text-sm text-muted-foreground leading-snug break-words [overflow-wrap:anywhere]">
                            {(() => {
                              // Task #55 — Render missed-call rows in the
                              // conversation list as a localized "Missed
                              // call" line instead of the raw JSON envelope.
                              if (conv.lastMessage?.messageType === "call_missed") {
                                const entry = parseMissedCallEntry(conv.lastMessage?.content);
                                if (entry) {
                                  return entry.callType === "video"
                                    ? t("chat.missedVideoCall")
                                    : t("chat.missedVoiceCall");
                                }
                                return t("chat.missedVoiceCall");
                              }
                              if (conv.lastMessage?.messageType === "image") return t("chat.photo");
                              if (conv.lastMessage?.messageType === "video") return t("chat.video");
                              if (conv.lastMessage?.messageType === "voice") return t("chat.voiceMsg");
                              if (conv.lastMessage?.messageType === "deleted") return t("chat.deletedMessage");
                              return conv.lastMessage?.content || "";
                            })()}
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
                {isActiveUserOnline && (
                  <span
                    className="pointer-events-none absolute inset-0 rounded-full opacity-70"
                    style={{
                      boxShadow: "0 0 0 2px rgba(16,185,129,0.55), 0 0 14px rgba(16,185,129,0.55)",
                    }}
                    aria-hidden
                  />
                )}
                <Avatar className={cn("h-10 w-10 ring-2", isActiveUserOnline ? "ring-emerald-400/70" : "ring-white/10")}>
                  <AvatarImage src={activeUserProfile?.avatarUrl || undefined} />
                  <AvatarFallback className="bg-brand-blue/15 text-brand-blue text-sm font-semibold">{activeUserProfile ? getInitials(activeUserProfile) : "??"}</AvatarFallback>
                </Avatar>
                <span
                  className={cn(
                    "absolute -bottom-0.5 -end-0.5 w-3 h-3 rounded-full border-2 border-background",
                    isActiveUserOnline ? "bg-emerald-500" : "bg-zinc-500"
                  )}
                />
              </div>
              <div className="flex-1 min-w-0">
                <h3 className="flex min-w-0 items-center gap-2">
                  <span
                    className="font-display tracking-wider text-xl sm:text-2xl leading-none line-clamp-2 break-words [overflow-wrap:anywhere]"
                    data-testid="text-active-user-name"
                  >
                    {activeUserProfile?.firstName || activeUserProfile?.username || `@${activeConversation}`}
                  </span>
                  {isActiveConversationNotifMuted && (
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <span
                          className="inline-flex shrink-0 items-center text-muted-foreground"
                          aria-label={t('chat.muteNotificationsSuccess')}
                          data-testid="chat-header-muted-badge"
                        >
                          <BellOff className="h-3.5 w-3.5" />
                        </span>
                      </TooltipTrigger>
                      <TooltipContent>
                        <p>{t('chat.muteNotificationsSuccess')}</p>
                      </TooltipContent>
                    </Tooltip>
                  )}
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
                <p className="line-clamp-2 text-xs leading-snug text-muted-foreground break-words [overflow-wrap:anywhere]">
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
              <div className="flex max-w-[58vw] min-w-0 flex-wrap content-start items-center justify-end gap-1 pb-0.5 sm:max-w-none sm:flex-nowrap sm:gap-1.5">
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
                    <DropdownMenuItem
                      disabled={!activeConversation || notificationMuteMutation.isPending}
                      onSelect={(e) => {
                        e.preventDefault();
                        if (activeConversation) {
                          notificationMuteMutation.mutate({
                            peerId: activeConversation,
                            mute: !isActiveConversationNotifMuted,
                          });
                        }
                      }}
                      className="gap-2"
                      data-testid="toggle-notification-mute"
                    >
                      {isActiveConversationNotifMuted ? (
                        <BellOff className="h-4 w-4 text-amber-500" />
                      ) : (
                        <Bell className="h-4 w-4 text-muted-foreground" />
                      )}
                      <div className="flex min-w-0 flex-col">
                        <span className="truncate">
                          {isActiveConversationNotifMuted
                            ? t('chat.unmuteNotifications')
                            : t('chat.muteNotifications')}
                        </span>
                        <span className="text-[11px] text-muted-foreground">
                          {t('chat.muteNotificationsDesc')}
                        </span>
                      </div>
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
                  <div className="flex flex-wrap items-center justify-end gap-2 text-muted-foreground">
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
                <span className="max-w-[40vw] truncate text-xs text-muted-foreground shrink-0 sm:max-w-none sm:whitespace-nowrap">
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
              {/*
                Task #77 — "Loading older messages…" strip.
                Sticky at the top of the scroll container so it is always
                visible while a history page is in flight, even if the
                user has scrolled down. Critically NOT a flow element
                that pushes content down — that would break Task #27's
                scroll-anchoring (the first visible message must stay
                pinned exactly where it was when older messages land).
                We achieve this with `sticky top-0 -mb-9 h-9` so the
                strip occupies layout height equal to its negative
                bottom margin → net zero contribution to the scroll
                content height. Opacity transition keeps the entry/exit
                from flickering on fast networks.
              */}
              <div
                className={`pointer-events-none sticky top-0 z-20 -mb-9 flex h-9 items-center justify-center transition-opacity duration-200 ${loadingMore ? "opacity-100" : "opacity-0"
                  }`}
                aria-hidden={!loadingMore}
                role="status"
                aria-live="polite"
                data-testid="chat-loading-older-messages"
              >
                <div className="flex items-center gap-2 rounded-full bg-background/90 px-3 py-1 text-xs text-muted-foreground shadow-sm ring-1 ring-border backdrop-blur">
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  <span>{loadingMore ? t('chat.loadingOlderMessages') : ''}</span>
                </div>
              </div>
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

                      // Task #55 — Missed-call entries render as a centered
                      // system row, not a normal bubble. Tapping the row
                      // re-initiates the call to the same peer & call type.
                      if (msg.messageType === "call_missed") {
                        const entry = parseMissedCallEntry(msg.content);
                        const callType: "voice" | "video" = entry?.callType || "voice";
                        const label = callType === "video"
                          ? t("chat.missedVideoCall")
                          : t("chat.missedVoiceCall");
                        const timeLabel = formatMessageTime(msg.createdAt, t);
                        const recallLabel = t("chat.callBack");
                        return (
                          <div key={msg.id} data-message-id={msg.id} className="flex justify-center my-2">
                            <button
                              type="button"
                              onClick={() => { void handleStartCallSession(callType); }}
                              className={cn(
                                "flex items-center gap-2 rounded-full border px-3 py-1.5 text-xs",
                                "bg-rose-500/10 border-rose-500/30 text-rose-600 dark:text-rose-300",
                                "hover:bg-rose-500/20 transition-colors",
                              )}
                              aria-label={`${label} · ${recallLabel}`}
                            >
                              <PhoneMissed className="h-3.5 w-3.5" />
                              <span className="font-medium">{label}</span>
                              <span className="opacity-70">· {timeLabel}</span>
                              <span className="ms-1 underline opacity-90">{recallLabel}</span>
                            </button>
                          </div>
                        );
                      }

                      // Show avatar for consecutive messages from same sender
                      const showAvatar = mi === 0 || group.messages[mi - 1]?.senderId !== msg.senderId;

                      return (
                        <div key={msg.id} data-message-id={msg.id} className={cn(
                          "flex group",
                          isMine ? "justify-end" : "justify-start",
                          !showAvatar ? "mt-0.5" : "mt-3"
                        )}>
                          {/* Message bubble */}
                          <div className={cn("relative max-w-[88%] sm:max-w-[70%]")}>
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
                                  <span className="line-clamp-1 font-medium break-words [overflow-wrap:anywhere]">
                                    {repliedMsg.senderId === user?.id ? t('chat.you') : (activeUserProfile?.firstName || activeUserProfile?.username || `@${activeConversation}`)}
                                  </span>
                                </div>
                                <p className="line-clamp-2 break-words [overflow-wrap:anywhere] opacity-80">{repliedMsg.content || t('chat.media')}</p>
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
                                        <img src={msg.attachmentUrl} alt="" className="w-full max-w-full rounded-lg sm:max-w-[260px]" loading="lazy" />
                                      ) : msg.messageType === "video" ? (
                                        <video src={msg.attachmentUrl} controls className="w-full max-w-full rounded-lg sm:max-w-[260px]" />
                                      ) : msg.messageType === "voice" ? (
                                        <audio src={msg.attachmentUrl} controls className="w-full max-w-full sm:max-w-[240px]" />
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
                                "mt-1 flex max-w-full flex-wrap items-center gap-0.5 rounded-lg border bg-background p-0.5 shadow-sm transition-opacity sm:absolute sm:top-0 sm:mt-0 sm:flex-nowrap sm:opacity-0 sm:group-hover:opacity-100",
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
                  <p className="line-clamp-2 text-xs text-muted-foreground break-words [overflow-wrap:anywhere]">
                    {editingMsg?.content || replyTo?.content || t('chat.media')}
                  </p>
                </div>
                <Button variant="ghost" size="icon" className="h-6 w-6 shrink-0"
                  onClick={() => { setReplyTo(null); setEditingMsg(null); setMessageInput(""); setInputHasText(false); }}>
                  <X className="h-4 w-4" />
                </Button>
              </div>
            )}

            {/* ======= Input Area ======= */}
            <div className="px-3 pt-3 sm:px-4 sm:pt-4 pb-[max(0px,calc(env(safe-area-inset-bottom)-var(--keyboard-inset-bottom,0px)))] border-t bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/80">
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
                        <span className="line-clamp-2 break-words [overflow-wrap:anywhere]">{failed.preview || t("common.failed")}</span>
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
                      onChange={(e) => {
                        handleInputChange(e.target.value);
                        setInputHasText(normalizeChatDraft(e.target.value).length > 0);
                      }}
                      // Some Android IMEs (notably Gboard with the Arabic
                      // keyboard) hold keystrokes inside a composition and
                      // only fire `change` after the composition commits.
                      // Reading from `onInput` directly catches every
                      // keystroke from the DOM, so the Mic→Send swap fires
                      // on the very first letter the user types.
                      onInput={(e) => {
                        const v = (e.currentTarget as HTMLInputElement).value;
                        setInputHasText(normalizeChatDraft(v).length > 0);
                        if (v !== messageInput) handleInputChange(v);
                      }}
                      onCompositionStart={() => {
                        isComposingRef.current = true;
                        setIsComposingInput(true);
                        setInputHasText(true);
                      }}
                      onCompositionUpdate={() => {
                        // Fires for every change while an Arabic / CJK
                        // composition is open. The user is actively typing,
                        // so the Send button must be visible regardless of
                        // what the controlled value currently shows.
                        setInputHasText(true);
                      }}
                      onCompositionEnd={(e) => {
                        isComposingRef.current = false;
                        setIsComposingInput(false);
                        // Flush the committed text immediately so the toggle
                        // resolves to the right state (Send vs Mic) without
                        // waiting for a follow-up keystroke.
                        const v = (e.currentTarget as HTMLInputElement).value;
                        setInputHasText(normalizeChatDraft(v).length > 0);
                        if (v !== messageInput) handleInputChange(v);
                      }}
                      onKeyDown={handleKeyPress}
                      placeholder={editingMsg ? t('chat.editMessagePlaceholder') : replyTo ? t('chat.replyPlaceholder') : t("chat.typeMessage")}
                      className="min-w-0 flex-1 min-h-[44px] rounded-full px-4"
                      dir="auto"
                      inputMode="text"
                      enterKeyHint="send"
                      data-testid="input-chat-message"
                    />

                    {shouldShowSendButton ? (
                      <Button
                        onClick={handleSendMessage}
                        disabled={!hasTypedMessage && !inputHasText && !editingMsg}
                        className="min-h-[44px] min-w-[44px] rounded-full shrink-0"
                        data-testid="button-send-message"
                        aria-label={t('chat.send') ?? 'Send'}
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
                            className="min-h-[44px] min-w-[44px] rounded-full shrink-0 hover:bg-destructive/10 hover:text-destructive"
                            data-testid="button-record-voice"
                            aria-label={t('chat.voiceMessage') ?? 'Voice message'}
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
      <ChatUnlockDialog
        open={!!unlockPrompt}
        onOpenChange={(o) => { if (!o) dismissUnlock(); }}
        amount={unlockPrompt?.amount ?? 0}
        balance={unlockPrompt?.balance ?? 0}
        onConfirm={confirmUnlock}
      />
    </div>
  );
}
