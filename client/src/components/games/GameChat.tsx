import { useState, useRef, useEffect, useCallback } from "react";
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

  return (
    <div
      dir={dir}
      className="flex h-full min-h-0 w-full flex-col overflow-hidden rounded-xl border bg-background/95 shadow-sm backdrop-blur-sm"
    >
      <div className="flex items-center justify-between border-b px-3 py-2">
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
        className="flex-1 overflow-y-auto px-3 py-2"
        data-testid="game-chat-messages-container"
      >
        {messages.length === 0 ? (
          <p className="py-6 text-center text-sm text-muted-foreground">
            {t("chat.noMessages")}
          </p>
        ) : (
          <div className="space-y-2.5">
            {messages.map((msg) => {
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
                    "flex gap-1.5",
                    isOwnMessage ? "justify-end" : "justify-start"
                  )}
                >
                  {!isOwnMessage && (
                    <Avatar className="h-7 w-7 shrink-0">
                      <AvatarImage src={msg.senderAvatar} />
                      <AvatarFallback className="text-[10px]">
                        {displayName[0]?.toUpperCase()}
                      </AvatarFallback>
                    </Avatar>
                  )}
                  <div className={cn("max-w-[80%]", isOwnMessage ? "items-end" : "items-start")}>
                    <div
                      className={cn(
                        "rounded-2xl px-3 py-1.5 text-sm",
                        isOwnMessage
                          ? "rounded-br-sm bg-primary text-primary-foreground"
                          : "rounded-bl-sm bg-muted",
                        msg.isQuickMessage && "bg-amber-500/90 text-xs font-medium text-white"
                      )}
                    >
                      {!isOwnMessage && (
                        <div className="mb-0.5 flex items-center gap-1">
                          <span className="truncate text-[10px] font-medium opacity-70">
                            {displayName}
                          </span>
                          {typeof msg.senderId === "string" && msg.senderId.length > 0 && (
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
                      {msg.message}
                    </div>
                    <span
                      className={cn(
                        "mt-0.5 block text-[10px] text-muted-foreground",
                        isOwnMessage ? "text-end" : "text-start"
                      )}
                    >
                      {formatTime(msg.createdAt)}
                    </span>
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
