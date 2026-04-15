import { useState, useRef, useEffect, useCallback, useMemo } from "react";
import { useMutation } from "@tanstack/react-query";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { cn } from "@/lib/utils";
import { Send, MessageCircle, Zap, MoreVertical, Ban, VolumeX } from "lucide-react";
import { apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/lib/auth";
import { useI18n } from "@/lib/i18n";

interface Message {
  id: string;
  senderId: string;
  senderName: string;
  senderAvatar?: string;
  message: string;
  isQuickMessage?: boolean;
  quickMessageKey?: string;
  isSpectator?: boolean;
  createdAt: string;
}

interface QuickMessage {
  key: string;
  en: string;
  ar: string;
}

interface GameChatProps {
  messages: Message[];
  onSendMessage: (message: string, isQuickMessage?: boolean, quickMessageKey?: string) => void;
  quickMessages: QuickMessage[];
  language: string;
  disabled?: boolean;
  currentUserId?: string;
  autoFocusInput?: boolean;
}

export function GameChat({
  messages,
  onSendMessage,
  quickMessages,
  language,
  disabled = false,
  currentUserId,
  autoFocusInput = false,
}: GameChatProps) {
  const [messageInput, setMessageInput] = useState("");
  const [showQuickPanel, setShowQuickPanel] = useState(false);
  const messagesContainerRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const { t, dir } = useI18n();
  const { toast } = useToast();
  const { user, refreshUser } = useAuth();
  const chatTitle = t("chat.title");
  const quickLabel = t("auth.quick");
  const quickActionsLabel = t("play.quickActions");
  const symbolChips = ["🙂", "👏", "🔥", "🎯"];

  const blockMutation = useMutation({
    mutationFn: (userId: string) => apiRequest('POST', `/api/users/${userId}/block`),
    onSuccess: () => {
      toast({ title: t("chat.blockSuccess") });
      refreshUser();
    },
    onError: (err: Error) => {
      toast({ title: t("common.error"), description: err.message, variant: 'destructive' });
    }
  });

  const muteMutation = useMutation({
    mutationFn: (userId: string) => apiRequest('POST', `/api/users/${userId}/mute`),
    onSuccess: () => {
      toast({ title: t("chat.muteSuccess") });
      refreshUser();
    },
    onError: (err: Error) => {
      toast({ title: t("common.error"), description: err.message, variant: 'destructive' });
    }
  });

  useEffect(() => {
    if (messagesContainerRef.current) {
      messagesContainerRef.current.scrollTop =
        messagesContainerRef.current.scrollHeight;
    }
  }, [messages, showQuickPanel]);

  useEffect(() => {
    if (autoFocusInput) {
      inputRef.current?.focus();
    }
  }, [autoFocusInput]);

  const handleSend = useCallback(() => {
    if (!messageInput.trim() || disabled) return;
    onSendMessage(messageInput.trim());
    setMessageInput("");
    if (autoFocusInput) {
      setTimeout(() => {
        inputRef.current?.focus();
      }, 0);
    }
  }, [messageInput, disabled, onSendMessage, autoFocusInput]);

  const handleQuickMessage = useCallback((qm: QuickMessage) => {
    if (disabled) return;
    onSendMessage(language === "ar" ? qm.ar : qm.en, true, qm.key);
    setShowQuickPanel(false);
    if (autoFocusInput) {
      setTimeout(() => {
        inputRef.current?.focus();
      }, 0);
    }
  }, [disabled, onSendMessage, language, autoFocusInput]);

  const handleAppendSymbol = useCallback((symbol: string) => {
    if (disabled) return;
    setMessageInput((previous) =>
      previous.trim().length === 0 ? symbol : `${previous} ${symbol}`,
    );
    setTimeout(() => {
      inputRef.current?.focus();
    }, 0);
  }, [disabled]);

  const handleKeyPress = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  const formatTime = (dateStr: string) => {
    const date = new Date(dateStr);
    return date.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
  };

  const userId = currentUserId || user?.id;
  const groupedMessages = useMemo(() => {
    const getSenderKey = (msg: Message) =>
      `${String(msg.senderId || "")}::${String(msg.senderName || "")}`;

    return messages.map((msg, index, list) => {
      const previous = index > 0 ? list[index - 1] : undefined;
      const next = index < list.length - 1 ? list[index + 1] : undefined;

      const startsSequence = !previous || getSenderKey(previous) !== getSenderKey(msg);
      const endsSequence = !next || getSenderKey(next) !== getSenderKey(msg);

      return {
        ...msg,
        startsSequence,
        endsSequence,
      };
    });
  }, [messages]);

  return (
    <div
      dir={dir}
      className="flex h-full min-h-0 w-full flex-col overflow-hidden rounded-2xl border border-border/70 bg-gradient-to-b from-background/95 via-background to-muted/10 shadow-[0_16px_42px_-24px_rgba(15,23,42,0.45)] backdrop-blur-sm"
    >
      <div className="flex items-center justify-between border-b border-border/70 bg-gradient-to-r from-primary/10 via-transparent to-amber-500/10 px-3 py-2.5">
        <div className="flex min-w-0 items-center gap-1.5">
          <MessageCircle className="h-4 w-4 text-primary" />
          <span className="truncate text-sm font-medium">{chatTitle}</span>
        </div>
        <span className="rounded-full bg-primary/10 px-2 py-0.5 text-[11px] font-semibold text-primary">
          {messages.length}
        </span>
      </div>

      <div
        ref={messagesContainerRef}
        className="flex-1 overflow-y-auto px-3 py-3"
        data-testid="game-chat-messages-container"
      >
        {groupedMessages.length === 0 ? (
          <p className="py-6 text-center text-sm text-muted-foreground">
            {t("chat.noMessages")}
          </p>
        ) : (
          <div className="space-y-0.5">
            {groupedMessages.map((msg) => {
              const isOwnMessage = msg.senderId === userId;
              const isAlreadyBlocked =
                typeof msg.senderId === "string" &&
                user?.blockedUsers?.includes(msg.senderId);
              const isAlreadyMuted =
                typeof msg.senderId === "string" &&
                user?.mutedUsers?.includes(msg.senderId);
              const displayName = msg.senderName?.trim() || t("common.view");

              return (
                <div
                  key={msg.id}
                  className={cn(
                    "flex gap-2",
                    msg.startsSequence ? "mt-3 first:mt-0" : "mt-1",
                    isOwnMessage ? "justify-end" : "justify-start"
                  )}
                >
                  {!isOwnMessage ? (
                    msg.startsSequence ? (
                      <Avatar className="mt-0.5 h-7 w-7 shrink-0 ring-1 ring-border/50">
                        <AvatarImage src={msg.senderAvatar} />
                        <AvatarFallback className="text-[10px]">
                          {displayName[0]?.toUpperCase()}
                        </AvatarFallback>
                      </Avatar>
                    ) : (
                      <div className="h-7 w-7 shrink-0" />
                    )
                  ) : null}

                  <div className={cn("max-w-[82%]", isOwnMessage ? "items-end" : "items-start")}>
                    {msg.startsSequence && (
                      <div
                        className={cn(
                          "mb-1 flex items-center gap-1.5 px-1",
                          isOwnMessage ? "justify-end" : "justify-start",
                        )}
                      >
                        <span className="truncate text-[11px] font-semibold text-muted-foreground">
                          {displayName}
                        </span>
                        {!isOwnMessage && typeof msg.senderId === "string" && msg.senderId.length > 0 && (
                          <DropdownMenu>
                            <DropdownMenuTrigger asChild>
                              <button className="p-0 opacity-60 hover:opacity-100" type="button">
                                <MoreVertical className="h-3 w-3" />
                              </button>
                            </DropdownMenuTrigger>
                            <DropdownMenuContent align="start" className="min-w-[140px]">
                              {!isAlreadyBlocked && (
                                <DropdownMenuItem
                                  onClick={() => blockMutation.mutate(msg.senderId!)}
                                  disabled={blockMutation.isPending}
                                  data-testid={`menu-block-${msg.senderId}`}
                                >
                                  <Ban className="me-1.5 h-3.5 w-3.5" />
                                  {t("chat.blockUser")}
                                </DropdownMenuItem>
                              )}
                              {!isAlreadyMuted && (
                                <DropdownMenuItem
                                  onClick={() => muteMutation.mutate(msg.senderId!)}
                                  disabled={muteMutation.isPending}
                                  data-testid={`menu-mute-${msg.senderId}`}
                                >
                                  <VolumeX className="me-1.5 h-3.5 w-3.5" />
                                  {t("chat.muteUser")}
                                </DropdownMenuItem>
                              )}
                            </DropdownMenuContent>
                          </DropdownMenu>
                        )}
                      </div>
                    )}

                    <div
                      className={cn(
                        "inline-flex max-w-full items-start gap-1.5 rounded-2xl px-3 py-1.5 text-sm shadow-sm",
                        isOwnMessage
                          ? "rounded-br-sm bg-primary text-primary-foreground"
                          : "rounded-bl-sm border border-border/60 bg-card",
                        !msg.startsSequence &&
                        (isOwnMessage ? "rounded-tr-md" : "rounded-tl-md"),
                        !msg.endsSequence &&
                        (isOwnMessage ? "rounded-br-md" : "rounded-bl-md"),
                        msg.isQuickMessage &&
                        (isOwnMessage
                          ? "bg-amber-500 text-amber-950"
                          : "border-amber-300/70 bg-amber-100 text-amber-900 dark:bg-amber-500/20 dark:text-amber-100"),
                      )}
                    >
                      {msg.isQuickMessage && (
                        <Zap className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                      )}
                      <span className="break-words leading-6">{msg.message}</span>
                    </div>

                    {msg.endsSequence && (
                      <span
                        className={cn(
                          "mt-0.5 block px-1 text-[10px] text-muted-foreground",
                          isOwnMessage ? "text-end" : "text-start",
                        )}
                      >
                        {formatTime(msg.createdAt)}
                      </span>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {showQuickPanel && (
        <div className="border-t bg-background/90 px-2 pb-1.5 pt-2">
          <div className="mb-1.5 px-1 text-[11px] font-medium text-muted-foreground">
            {quickActionsLabel}
          </div>
          <div className="grid max-h-[132px] grid-cols-2 gap-1.5 overflow-y-auto sm:grid-cols-3">
            {quickMessages.map((qm) => (
              <Button
                key={qm.key}
                variant="outline"
                size="sm"
                className="h-auto py-1.5 px-2 text-xs transition-colors hover:bg-primary hover:text-primary-foreground"
                onClick={() => handleQuickMessage(qm)}
                disabled={disabled}
                data-testid={`quick-message-${qm.key}`}
              >
                {language === "ar" ? qm.ar : qm.en}
              </Button>
            ))}
          </div>
        </div>
      )}

      <div className="border-t bg-background/80 p-2 pb-[max(0.5rem,env(safe-area-inset-bottom))]">
        <div className="mb-2 flex items-center gap-1.5 overflow-x-auto pb-0.5">
          {symbolChips.map((symbol) => (
            <button
              key={symbol}
              type="button"
              className="inline-flex h-8 min-w-8 items-center justify-center rounded-full border border-border/70 bg-background/80 px-2 text-sm shadow-sm transition-colors hover:bg-muted"
              onClick={() => handleAppendSymbol(symbol)}
              disabled={disabled}
              aria-label={symbol}
            >
              {symbol}
            </button>
          ))}
        </div>

        <div className="flex items-center gap-1.5">
          <Input
            ref={inputRef}
            value={messageInput}
            onChange={(e) => setMessageInput(e.target.value)}
            onKeyDown={handleKeyPress}
            placeholder={t("chat.typeMessage")}
            className="h-10 flex-1 text-sm"
            disabled={disabled}
            autoFocus={autoFocusInput}
            data-testid="input-game-chat"
          />
          <Button
            variant={showQuickPanel ? "default" : "outline"}
            size="icon"
            className="h-10 w-10"
            onClick={() => setShowQuickPanel((previous) => !previous)}
            disabled={disabled}
            title={quickLabel}
            data-testid="button-toggle-game-quick-replies"
          >
            <Zap className="h-4 w-4" />
            <span className="sr-only">{quickLabel}</span>
          </Button>
          <Button
            size="icon"
            className="h-10 w-10"
            onClick={handleSend}
            disabled={!messageInput.trim() || disabled}
            data-testid="button-send-game-chat"
          >
            <Send className="h-4 w-4" />
          </Button>
        </div>
      </div>

      <div className="sr-only" aria-live="polite">
        {messages.length}
      </div>
    </div>
  );
}
