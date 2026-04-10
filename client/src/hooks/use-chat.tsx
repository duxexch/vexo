import { useState, useEffect, useCallback, useRef } from "react";
import { useAuth } from "@/lib/auth";
import { extractWsErrorInfo, isWsErrorType } from "@/lib/ws-errors";
import type { ChatMessage } from "@shared/schema";

interface ChatUser {
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
  otherUser: ChatUser;
  lastMessage: ChatMessage;
  unreadCount: number;
}

interface ChatState {
  conversations: Conversation[];
  activeConversation: string | null;
  messages: ChatMessage[];
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
}

interface UseChatReturn extends ChatState {
  sendMessage: (receiverId: string, content: string, messageType?: string, attachmentUrl?: string, options?: SendMessageOptions) => void;
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

export function useChat(): UseChatReturn {
  const { token } = useAuth();
  const wsRef = useRef<WebSocket | null>(null);
  const reconnectTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const activeConversationRef = useRef<string | null>(null);
  const reconnectAttemptsRef = useRef(0);
  const maxReconnectDelay = 30000;

  const [searchResults, setSearchResults] = useState<ChatMessage[]>([]);

  const [state, setState] = useState<ChatState>({
    conversations: [],
    activeConversation: null,
    messages: [],
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

  const connectWebSocket = useCallback(() => {
    if (!token || wsRef.current?.readyState === WebSocket.OPEN) return;

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
    };

    ws.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data);

        if (isWsErrorType(data?.type) || data?.type === "chat_error") {
          const { message, code } = extractWsErrorInfo(data);
          if (message) {
            console.error("Chat websocket error:", code || "unknown_code", message);
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
            let needsConversationRefresh = false;
            setState((prev) => {
              if (prev.messages.some(m => m.id === data.data.id)) return prev;

              const sentMessage = data.data;
              const otherUserId = String(sentMessage.receiverId || "");
              if (!prev.conversations.some((conv) => conv.otherUserId === otherUserId)) {
                needsConversationRefresh = true;
              }
              const nextConversations = sortConversationsByLastMessage(
                prev.conversations.map((conv) =>
                  conv.otherUserId === otherUserId
                    ? { ...conv, lastMessage: sentMessage }
                    : conv
                )
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
  }, [token]); // FIXED: Only depend on token, NOT state.activeConversation

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
      if (wsRef.current?.readyState === WebSocket.OPEN) {
        wsRef.current.send(
          JSON.stringify({
            type: "chat_message",
            receiverId,
            content: content || "",
            messageType,
            attachmentUrl,
            isDisappearing: options?.isDisappearing || false,
            disappearAfterRead: options?.disappearAfterRead || false,
            replyToId: options?.replyToId || null,
          })
        );
      }
    },
    []
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
