import { useState, useEffect, useCallback, useRef } from "react";
import { useAuth } from "@/lib/auth";
import { extractWsErrorInfo, isWsErrorType } from "@/lib/ws-errors";
import type { ChatMessage } from "@shared/schema";

interface OutboundChatMessagePayload {
  type: "chat_message";
  clientMessageId: string;
  receiverId: string;
  content: string;
  messageType: string;
  attachmentUrl?: string;
  isDisappearing: boolean;
  disappearAfterRead: boolean;
  replyToId: string | null;
}

interface PendingOutboundChatMessage {
  payload: OutboundChatMessagePayload;
  preview: string;
  status: "pending" | "failed";
  createdAt: number;
  attempts: number;
  lastAttemptAt: number;
  receiverUser?: ChatConversationUserSnapshot | null;
}

interface OutgoingMessageStatusItem {
  clientMessageId: string;
  receiverId: string;
  preview: string;
  attempts: number;
  status: "pending" | "failed";
}

const MAX_PENDING_CHAT_AGE_MS = 5 * 60 * 1000;
const MAX_PENDING_CHAT_ATTEMPTS = 6;

function createClientMessageId(): string {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return crypto.randomUUID();
  }
  return `${Date.now()}-${Math.random().toString(36).slice(2, 12)}`;
}

function buildOutgoingPreview(content: string, messageType: string): string {
  const trimmed = content.trim();
  if (trimmed.length > 0) {
    return trimmed.slice(0, 120);
  }
  if (messageType === "image") return "[image]";
  if (messageType === "video") return "[video]";
  if (messageType === "voice") return "[voice]";
  return "[message]";
}

export interface ChatConversationUserSnapshot {
  id: string;
  username: string;
  firstName: string | null;
  lastName: string | null;
  avatarUrl: string | null;
  accountId: string | null;
  isOnline?: boolean;
  lastSeen?: string | null;
}

interface Conversation {
  otherUserId: string;
  otherUser: ChatConversationUserSnapshot;
  lastMessage: ChatMessage;
  unreadCount: number;
}

interface ChatState {
  conversations: Conversation[];
  activeConversation: string | null;
  messages: ChatMessage[];
  pendingOutgoing: OutgoingMessageStatusItem[];
  typingUsers: Set<string>;
  isConnected: boolean;
  isChatEnabled: boolean;
  onlineUsers: Set<string>;
  lastSeenMap: Map<string, string>;
  hasMoreMessages: boolean;
  loadingMore: boolean;
}

interface SendMessageOptions {
  isDisappearing?: boolean;
  disappearAfterRead?: boolean;
  replyToId?: string;
  receiverUser?: ChatConversationUserSnapshot | null;
}

interface UseChatReturn extends ChatState {
  sendMessage: (receiverId: string, content: string, messageType?: string, attachmentUrl?: string, options?: SendMessageOptions) => void;
  retryPendingMessage: (clientMessageId: string) => void;
  setTyping: (receiverId: string, isTyping: boolean) => void;
  selectConversation: (userId: string) => void;
  loadMoreMessages: () => void;
  markAsRead: (messageId: string) => void;
  markConversationAsRead: (userId: string) => void;
  refreshConversations: () => Promise<void>;
  deleteMessage: (messageId: string, forEveryone: boolean) => void;
  editMessage: (messageId: string, newContent: string) => void;
  reactToMessage: (messageId: string, emoji: string) => void;
  searchMessages: (query: string) => void;
  searchResults: ChatMessage[];
}

function sortConversationsByLastMessage(conversations: Conversation[]): Conversation[] {
  return [...conversations].sort((a, b) => {
    const aTime = a.lastMessage?.createdAt ? new Date(a.lastMessage.createdAt).getTime() : 0;
    const bTime = b.lastMessage?.createdAt ? new Date(b.lastMessage.createdAt).getTime() : 0;
    return bTime - aTime;
  });
}

function buildConversationFromReceiver(
  receiverId: string,
  receiverUser: ChatConversationUserSnapshot,
  lastMessage: ChatMessage
): Conversation {
  return {
    otherUserId: receiverId,
    otherUser: receiverUser,
    lastMessage,
    unreadCount: 0,
  };
}

export function useChat(): UseChatReturn {
  const { token } = useAuth();
  const wsRef = useRef<WebSocket | null>(null);
  const reconnectTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const activeConversationRef = useRef<string | null>(null);
  const reconnectAttemptsRef = useRef(0);
  const pendingOutboundRef = useRef<Map<string, PendingOutboundChatMessage>>(new Map());
  const maxReconnectDelay = 30000;

  const [searchResults, setSearchResults] = useState<ChatMessage[]>([]);

  const [state, setState] = useState<ChatState>({
    conversations: [],
    activeConversation: null,
    messages: [],
    pendingOutgoing: [],
    typingUsers: new Set(),
    isConnected: false,
    isChatEnabled: true,
    onlineUsers: new Set(),
    lastSeenMap: new Map(),
    hasMoreMessages: true,
    loadingMore: false,
  });

  // Keep ref in sync with state to avoid stale closures
  useEffect(() => {
    activeConversationRef.current = state.activeConversation;
  }, [state.activeConversation]);

  const fetchConversations = useCallback(async () => {
    if (!token) return;
    try {
      const response = await fetch("/api/chat/conversations", {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (response.ok) {
        const conversations = await response.json();
        setState((prev) => ({ ...prev, conversations }));
      }
    } catch (error) {
      console.error("Failed to fetch conversations:", error);
    }
  }, [token]);

  const fetchChatSettings = useCallback(async () => {
    if (!token) return;
    try {
      const response = await fetch("/api/chat/settings", {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (response.ok) {
        const settings = await response.json();
        const rawEnabled = settings?.chat_enabled ?? settings?.isEnabled;
        const isEnabled = rawEnabled !== false && String(rawEnabled ?? "true") !== "false";
        setState((prev) => ({
          ...prev,
          isChatEnabled: isEnabled,
        }));
      }
    } catch (error) {
      console.error("Failed to fetch chat settings:", error);
    }
  }, [token]);

  const sendChatPayload = useCallback((payload: OutboundChatMessagePayload): boolean => {
    if (wsRef.current?.readyState !== WebSocket.OPEN) {
      return false;
    }
    wsRef.current.send(JSON.stringify(payload));
    return true;
  }, []);

  const syncPendingOutgoingState = useCallback(() => {
    const pendingSnapshot: OutgoingMessageStatusItem[] = Array.from(pendingOutboundRef.current.entries()).map(
      ([clientMessageId, entry]) => ({
        clientMessageId,
        receiverId: entry.payload.receiverId,
        preview: entry.preview,
        attempts: entry.attempts,
        status: entry.status,
      })
    );

    setState((prev) => ({
      ...prev,
      pendingOutgoing: pendingSnapshot,
    }));
  }, []);

  const sendMessageViaRestFallback = useCallback(
    async (entry: PendingOutboundChatMessage, clientMessageId: string) => {
      if (!token) {
        pendingOutboundRef.current.set(clientMessageId, {
          ...entry,
          status: "failed",
        });
        syncPendingOutgoingState();
        return;
      }

      try {
        const response = await fetch(`/api/chat/${encodeURIComponent(entry.payload.receiverId)}/messages`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${token}`,
          },
          body: JSON.stringify({
            content: entry.payload.content,
            messageType: entry.payload.messageType,
            attachmentUrl: entry.payload.attachmentUrl,
            isDisappearing: entry.payload.isDisappearing,
            disappearAfterRead: entry.payload.disappearAfterRead,
            replyToId: entry.payload.replyToId,
          }),
        });

        const data = await response.json().catch(() => ({} as Record<string, unknown>));
        if (!response.ok) {
          const message = typeof data?.error === "string"
            ? data.error
            : typeof data?.message === "string"
              ? data.message
              : "Failed to send message";
          throw new Error(message);
        }

        pendingOutboundRef.current.delete(clientMessageId);
        syncPendingOutgoingState();

        const sentMessage = data as ChatMessage;
        let needsConversationRefresh = false;

        setState((prev) => {
          if (prev.messages.some((m) => m.id === sentMessage.id)) {
            return prev;
          }

          const otherUserId = String(sentMessage.receiverId || entry.payload.receiverId || "");
          const receiverSnapshot = entry.receiverUser ?? null;
          const hasConversation = prev.conversations.some((conv) => conv.otherUserId === otherUserId);
          if (!hasConversation && !receiverSnapshot) {
            needsConversationRefresh = true;
          }

          const nextConversations = sortConversationsByLastMessage(
            hasConversation
              ? prev.conversations.map((conv) =>
                conv.otherUserId === otherUserId
                  ? { ...conv, lastMessage: sentMessage }
                  : conv
              )
              : receiverSnapshot
                ? [
                  buildConversationFromReceiver(otherUserId, receiverSnapshot, sentMessage),
                  ...prev.conversations,
                ]
                : prev.conversations
          );

          return {
            ...prev,
            messages: [...prev.messages, sentMessage],
            conversations: nextConversations,
          };
        });

        if (needsConversationRefresh) {
          void fetchConversations();
        }
      } catch {
        const pending = pendingOutboundRef.current.get(clientMessageId);
        if (pending) {
          pendingOutboundRef.current.set(clientMessageId, {
            ...pending,
            status: "failed",
          });
          syncPendingOutgoingState();
        }
      }
    },
    [fetchConversations, syncPendingOutgoingState, token]
  );

  const flushPendingOutboundMessages = useCallback(() => {
    const now = Date.now();
    pendingOutboundRef.current.forEach((entry, key) => {
      const expired = now - entry.createdAt > MAX_PENDING_CHAT_AGE_MS;
      const attemptsExceeded = entry.attempts >= MAX_PENDING_CHAT_ATTEMPTS;

      if (expired || attemptsExceeded) {
        pendingOutboundRef.current.set(key, {
          ...entry,
          status: "failed",
        });
        return;
      }

      if (entry.status !== "pending") {
        return;
      }

      if (sendChatPayload(entry.payload)) {
        pendingOutboundRef.current.set(key, {
          ...entry,
          attempts: entry.attempts + 1,
          lastAttemptAt: now,
        });
      }
    });
    syncPendingOutgoingState();
  }, [sendChatPayload, syncPendingOutgoingState]);

  const connectWebSocket = useCallback(() => {
    if (!token) return;
    if (wsRef.current?.readyState === WebSocket.OPEN || wsRef.current?.readyState === WebSocket.CONNECTING) {
      return;
    }

    // Close existing connection cleanly
    if (wsRef.current) {
      wsRef.current.onclose = null;
      wsRef.current.close();
      wsRef.current = null;
    }

    const protocol = window.location.protocol === "https:" ? "wss:" : "ws:";
    const ws = new WebSocket(`${protocol}//${window.location.host}/ws`);

    ws.onopen = () => {
      ws.send(JSON.stringify({ type: "auth", token }));
      const activeConversationId = activeConversationRef.current;
      if (activeConversationId) {
        ws.send(
          JSON.stringify({
            type: "get_chat_history",
            otherUserId: activeConversationId,
            limit: 50,
            offset: 0,
          })
        );
      }
      setState((prev) => ({ ...prev, isConnected: true }));
      reconnectAttemptsRef.current = 0;
      flushPendingOutboundMessages();
    };

    ws.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data);

        if (isWsErrorType(data?.type) || data?.type === "chat_error") {
          if (typeof data?.clientMessageId === "string" && data.clientMessageId.trim().length > 0 && data?.code !== "message_in_flight") {
            const key = data.clientMessageId.trim();
            const pending = pendingOutboundRef.current.get(key);
            if (pending) {
              pendingOutboundRef.current.set(key, {
                ...pending,
                status: "failed",
              });
              syncPendingOutgoingState();
            }
          }
          const { message, code } = extractWsErrorInfo(data);
          if (message) {
            console.error("Chat websocket error:", code || "unknown_code", message);
            if (typeof window !== "undefined") {
              window.dispatchEvent(new CustomEvent("vex:chat-error", {
                detail: {
                  message,
                  code,
                },
              }));
            }
          }
          return;
        }

        switch (data.type) {
          case "new_chat_message":
            setState((prev) => {
              const newMessage = data.data;
              // Deduplicate
              if (prev.messages.some(m => m.id === newMessage.id)) return prev;

              const isActiveChat =
                prev.activeConversation === newMessage.senderId ||
                prev.activeConversation === newMessage.receiverId;

              const otherUserId = String(newMessage.senderId || "");
              const existingConversationIndex = prev.conversations.findIndex((conv) => conv.otherUserId === otherUserId);

              let nextConversations = prev.conversations;

              if (existingConversationIndex >= 0) {
                nextConversations = prev.conversations.map((conv, idx) => {
                  if (idx !== existingConversationIndex) return conv;
                  return {
                    ...conv,
                    lastMessage: newMessage,
                    unreadCount: isActiveChat ? 0 : conv.unreadCount + 1,
                  };
                });
              } else if (newMessage.sender && otherUserId) {
                nextConversations = [
                  {
                    otherUserId,
                    otherUser: {
                      id: newMessage.sender.id,
                      username: newMessage.sender.username,
                      firstName: newMessage.sender.firstName ?? null,
                      lastName: newMessage.sender.lastName ?? null,
                      avatarUrl: newMessage.sender.avatarUrl ?? null,
                      accountId: newMessage.sender.accountId ?? null,
                    },
                    lastMessage: newMessage,
                    unreadCount: isActiveChat ? 0 : 1,
                  },
                  ...prev.conversations,
                ];
              }

              nextConversations = sortConversationsByLastMessage(nextConversations);

              if (isActiveChat) {
                return {
                  ...prev,
                  messages: [...prev.messages, newMessage],
                  conversations: nextConversations,
                };
              }

              return {
                ...prev,
                conversations: nextConversations,
              };
            });
            break;

          case "chat_message_sent":
            const pendingEntry = typeof data?.clientMessageId === "string" && data.clientMessageId.trim().length > 0
              ? pendingOutboundRef.current.get(data.clientMessageId.trim())
              : undefined;
            if (typeof data?.clientMessageId === "string" && data.clientMessageId.trim().length > 0) {
              pendingOutboundRef.current.delete(data.clientMessageId.trim());
              syncPendingOutgoingState();
            }
            let needsConversationRefresh = false;
            setState((prev) => {
              if (prev.messages.some(m => m.id === data.data.id)) return prev;

              const sentMessage = data.data;
              const otherUserId = String(sentMessage.receiverId || "");
              const receiverSnapshot = pendingEntry?.receiverUser ?? null;
              const hasConversation = prev.conversations.some((conv) => conv.otherUserId === otherUserId);
              if (!hasConversation && !receiverSnapshot) {
                needsConversationRefresh = true;
              }
              const nextConversations = sortConversationsByLastMessage(
                hasConversation
                  ? prev.conversations.map((conv) =>
                    conv.otherUserId === otherUserId
                      ? { ...conv, lastMessage: sentMessage }
                      : conv
                  )
                  : receiverSnapshot
                    ? [
                      buildConversationFromReceiver(otherUserId, receiverSnapshot, sentMessage),
                      ...prev.conversations,
                    ]
                    : prev.conversations
              );

              return {
                ...prev,
                messages: [...prev.messages, sentMessage],
                conversations: nextConversations,
              };
            });
            if (needsConversationRefresh) {
              void fetchConversations();
            }
            break;

          case "typing_indicator":
            setState((prev) => {
              const newTypingUsers = new Set(prev.typingUsers);
              if (data.data.isTyping) {
                newTypingUsers.add(data.data.senderId);
              } else {
                newTypingUsers.delete(data.data.senderId);
              }
              return { ...prev, typingUsers: newTypingUsers };
            });
            // Auto-clear typing after 3 seconds
            if (data.data.isTyping) {
              setTimeout(() => {
                setState(p => {
                  const cleared = new Set(p.typingUsers);
                  cleared.delete(data.data.senderId);
                  return { ...p, typingUsers: cleared };
                });
              }, 3000);
            }
            break;

          case "chat_history":
            setState((prev) => {
              const incoming = data.data.messages || [];
              if (data.data.append) {
                // Prepend older messages for infinite scroll
                const existingIds = new Set(prev.messages.map(m => m.id));
                const newMsgs = incoming.filter((m: Record<string, unknown>) => !existingIds.has(m.id as string));
                return {
                  ...prev,
                  messages: [...newMsgs, ...prev.messages],
                  hasMoreMessages: incoming.length >= (data.data.limit || 50),
                  loadingMore: false,
                };
              }
              return {
                ...prev,
                messages: incoming,
                hasMoreMessages: incoming.length >= (data.data.limit || 50),
                loadingMore: false,
              };
            });
            break;

          case "message_read_receipt":
            setState((prev) => ({
              ...prev,
              messages: prev.messages.map((msg) =>
                msg.id === data.data.messageId
                  ? { ...msg, isRead: true, readAt: data.data.readAt }
                  : msg
              ),
            }));
            break;

          case "messages_marked_read":
            setState((prev) => ({
              ...prev,
              messages: prev.messages.map((msg) =>
                msg.receiverId === data.data.byUserId
                  ? { ...msg, isRead: true, readAt: new Date() }
                  : msg
              ),
            }));
            break;

          case "message_deleted":
            setState((prev) => {
              const { messageId, forEveryone } = data.data;
              if (forEveryone) {
                return {
                  ...prev,
                  messages: prev.messages.map(msg =>
                    msg.id === messageId
                      ? { ...msg, content: "تم حذف هذه الرسالة", deletedAt: new Date().toISOString() as unknown as Date, messageType: "deleted" }
                      : msg
                  ),
                };
              }
              return { ...prev, messages: prev.messages.filter(msg => msg.id !== messageId) };
            });
            break;

          case "message_edited":
            setState((prev) => ({
              ...prev,
              messages: prev.messages.map(msg =>
                msg.id === data.data.messageId
                  ? { ...msg, content: data.data.newContent, isEdited: true, editedAt: data.data.editedAt as unknown as Date }
                  : msg
              ),
            }));
            break;

          case "message_reaction":
            setState((prev) => ({
              ...prev,
              messages: prev.messages.map(msg => {
                if (msg.id === data.data.messageId) {
                  if (data.data.reactions && typeof data.data.reactions === "object") {
                    return { ...msg, reactions: data.data.reactions };
                  }

                  const reactions = { ...(msg.reactions || {}) };
                  const emoji = data.data.emoji;
                  const userId = data.data.userId;
                  if (!reactions[emoji]) reactions[emoji] = [];
                  if (data.data.removed === true) {
                    reactions[emoji] = reactions[emoji].filter((id: string) => id !== userId);
                    if (reactions[emoji].length === 0) delete reactions[emoji];
                  } else {
                    if (!reactions[emoji].includes(userId)) reactions[emoji].push(userId);
                  }
                  return { ...msg, reactions };
                }
                return msg;
              }),
            }));
            break;

          case "user_online":
            setState((prev) => {
              const newOnline = new Set(prev.onlineUsers);
              newOnline.add(data.data.userId);
              const newLastSeen = new Map(prev.lastSeenMap);
              newLastSeen.delete(data.data.userId);
              return { ...prev, onlineUsers: newOnline, lastSeenMap: newLastSeen };
            });
            break;

          case "user_offline":
            setState((prev) => {
              const newOnline = new Set(prev.onlineUsers);
              newOnline.delete(data.data.userId);
              const newLastSeen = new Map(prev.lastSeenMap);
              if (data.data.lastSeen) newLastSeen.set(data.data.userId, data.data.lastSeen);
              return { ...prev, onlineUsers: newOnline, lastSeenMap: newLastSeen };
            });
            break;

          case "online_users_list":
            setState((prev) => ({
              ...prev,
              onlineUsers: new Set(data.data.userIds || []),
            }));
            break;

          case "search_results":
            setSearchResults(data.data?.messages || data.data?.results || []);
            break;
        }
      } catch (error) {
        console.error("WebSocket message parse error:", error);
      }
    };

    ws.onclose = () => {
      setState((prev) => ({ ...prev, isConnected: false }));
      // Exponential backoff reconnection
      const delay = Math.min(1000 * Math.pow(2, reconnectAttemptsRef.current), maxReconnectDelay);
      reconnectAttemptsRef.current++;
      reconnectTimeoutRef.current = setTimeout(connectWebSocket, delay);
    };

    ws.onerror = (error) => {
      console.error("WebSocket error:", error);
    };

    wsRef.current = ws;
  }, [token, flushPendingOutboundMessages, syncPendingOutgoingState]); // FIXED: Only depend on token, NOT state.activeConversation

  useEffect(() => {
    fetchChatSettings();
    fetchConversations();
    connectWebSocket();

    return () => {
      if (reconnectTimeoutRef.current) {
        clearTimeout(reconnectTimeoutRef.current);
      }
      if (wsRef.current) {
        wsRef.current.onclose = null;
        wsRef.current.close();
      }
    };
  }, [token]);

  const sendMessage = useCallback(
    (
      receiverId: string,
      content: string,
      messageType = "text",
      attachmentUrl?: string,
      options?: SendMessageOptions
    ) => {
      const clientMessageId = createClientMessageId();
      const payload: OutboundChatMessagePayload = {
        type: "chat_message",
        clientMessageId,
        receiverId,
        content: content || "",
        messageType,
        attachmentUrl,
        isDisappearing: options?.isDisappearing || false,
        disappearAfterRead: options?.disappearAfterRead || false,
        replyToId: options?.replyToId || null,
      };

      const now = Date.now();
      const preview = buildOutgoingPreview(content || "", messageType);
      pendingOutboundRef.current.set(clientMessageId, {
        payload,
        preview,
        status: "pending",
        createdAt: now,
        attempts: 0,
        lastAttemptAt: 0,
        receiverUser: options?.receiverUser ?? null,
      });
      syncPendingOutgoingState();

      if (sendChatPayload(payload)) {
        pendingOutboundRef.current.set(clientMessageId, {
          payload,
          preview,
          status: "pending",
          createdAt: now,
          attempts: 1,
          lastAttemptAt: now,
          receiverUser: options?.receiverUser ?? null,
        });
        syncPendingOutgoingState();
      } else {
        const pendingEntry = pendingOutboundRef.current.get(clientMessageId);
        if (pendingEntry) {
          void sendMessageViaRestFallback(pendingEntry, clientMessageId);
        }
      }
    },
    [sendChatPayload, sendMessageViaRestFallback, syncPendingOutgoingState]
  );

  const retryPendingMessage = useCallback(
    (clientMessageId: string) => {
      const key = clientMessageId.trim();
      if (!key) {
        return;
      }

      const entry = pendingOutboundRef.current.get(key);
      if (!entry) {
        return;
      }

      const now = Date.now();
      if (now - entry.createdAt > MAX_PENDING_CHAT_AGE_MS) {
        pendingOutboundRef.current.delete(key);
        syncPendingOutgoingState();
        return;
      }

      const nextEntry: PendingOutboundChatMessage = {
        ...entry,
        status: "pending",
      };

      if (sendChatPayload(nextEntry.payload)) {
        pendingOutboundRef.current.set(key, {
          ...nextEntry,
          attempts: nextEntry.attempts + 1,
          lastAttemptAt: now,
        });
      } else {
        pendingOutboundRef.current.set(key, nextEntry);
        connectWebSocket();
      }

      syncPendingOutgoingState();
    },
    [connectWebSocket, sendChatPayload, syncPendingOutgoingState]
  );

  const setTyping = useCallback((receiverId: string, isTyping: boolean) => {
    if (wsRef.current?.readyState === WebSocket.OPEN) {
      wsRef.current.send(
        JSON.stringify({
          type: "typing",
          receiverId,
          isTyping,
        })
      );
    }
  }, []);

  const selectConversation = useCallback(
    async (userId: string) => {
      setState((prev) => ({ ...prev, activeConversation: userId, messages: [], hasMoreMessages: true }));

      if (wsRef.current?.readyState === WebSocket.OPEN) {
        wsRef.current.send(
          JSON.stringify({
            type: "get_chat_history",
            otherUserId: userId,
            limit: 50,
            offset: 0,
          })
        );
      } else if (token) {
        try {
          const response = await fetch(`/api/chat/${userId}/messages?limit=50&offset=0`, {
            headers: { Authorization: `Bearer ${token}` },
          });

          if (response.ok) {
            const fallbackMessages = await response.json();
            setState((prev) => ({
              ...prev,
              messages: fallbackMessages,
              hasMoreMessages: fallbackMessages.length >= 50,
              loadingMore: false,
            }));
          }
        } catch (error) {
          console.error("Failed to fetch conversation history fallback:", error);
        }
      }

      if (token) {
        try {
          await fetch(`/api/chat/${userId}/read`, {
            method: "PUT",
            headers: { Authorization: `Bearer ${token}` },
          });
          setState((prev) => ({
            ...prev,
            conversations: prev.conversations.map((conv) =>
              conv.otherUserId === userId ? { ...conv, unreadCount: 0 } : conv
            ),
          }));
        } catch (error) {
          console.error("Failed to mark as read:", error);
        }
      }
    },
    [token]
  );

  const loadMoreMessages = useCallback(() => {
    const conv = activeConversationRef.current;
    setState(prev => {
      if (!conv || !prev.hasMoreMessages || prev.loadingMore) return prev;
      if (wsRef.current?.readyState === WebSocket.OPEN) {
        wsRef.current.send(
          JSON.stringify({
            type: "get_chat_history",
            otherUserId: conv,
            limit: 50,
            offset: prev.messages.length,
            append: true,
          })
        );
      }
      return { ...prev, loadingMore: true };
    });
  }, []);

  const markAsRead = useCallback(
    (messageId: string) => {
      if (wsRef.current?.readyState === WebSocket.OPEN) {
        wsRef.current.send(
          JSON.stringify({
            type: "message_read",
            messageId,
          })
        );
      }
    },
    []
  );

  const markConversationAsRead = useCallback(
    (userId: string) => {
      if (wsRef.current?.readyState === WebSocket.OPEN) {
        wsRef.current.send(
          JSON.stringify({
            type: "mark_chat_read",
            otherUserId: userId,
          })
        );
      }
    },
    []
  );

  const deleteMessage = useCallback(
    (messageId: string, forEveryone: boolean) => {
      if (wsRef.current?.readyState === WebSocket.OPEN) {
        wsRef.current.send(
          JSON.stringify({ type: "delete_message", messageId, forEveryone })
        );
        // Optimistic delete for "for me"
        if (!forEveryone) {
          setState(prev => ({ ...prev, messages: prev.messages.filter(m => m.id !== messageId) }));
        }
      }
    },
    []
  );

  const editMessage = useCallback(
    (messageId: string, newContent: string) => {
      if (wsRef.current?.readyState === WebSocket.OPEN) {
        wsRef.current.send(
          JSON.stringify({ type: "edit_message", messageId, newContent })
        );
      }
    },
    []
  );

  const reactToMessage = useCallback(
    (messageId: string, emoji: string) => {
      if (wsRef.current?.readyState === WebSocket.OPEN) {
        wsRef.current.send(
          JSON.stringify({ type: "react_to_message", messageId, emoji })
        );
      }
    },
    []
  );

  const searchMessages = useCallback(
    (query: string) => {
      if (!query.trim()) { setSearchResults([]); return; }
      if (wsRef.current?.readyState === WebSocket.OPEN) {
        wsRef.current.send(
          JSON.stringify({
            type: "search_messages",
            query: query.trim(),
            otherUserId: activeConversationRef.current,
          })
        );
      }
    },
    []
  );

  return {
    ...state,
    sendMessage,
    retryPendingMessage,
    setTyping,
    selectConversation,
    loadMoreMessages,
    markAsRead,
    markConversationAsRead,
    refreshConversations: fetchConversations,
    deleteMessage,
    editMessage,
    reactToMessage,
    searchMessages,
    searchResults,
  };
}
