import { useState, useRef, useEffect, useCallback } from "react";
import { useMutation } from "@tanstack/react-query";
import { ScrollArea } from "@/components/ui/scroll-area";
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
import { Send, MessageCircle, Zap, MoreVertical, Ban, VolumeX, X } from "lucide-react";
import { apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/lib/auth";

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
}

// Floating bubble that auto-hides after 3 seconds
function FloatingBubble({ msg, isOwn, onExpire }: { msg: Message; isOwn: boolean; onExpire: () => void }) {
  const [visible, setVisible] = useState(true);
  const [fading, setFading] = useState(false);

  useEffect(() => {
    const fadeTimer = setTimeout(() => setFading(true), 2500);
    const removeTimer = setTimeout(() => {
      setVisible(false);
      onExpire();
    }, 3000);
    return () => {
      clearTimeout(fadeTimer);
      clearTimeout(removeTimer);
    };
  }, [onExpire]);

  if (!visible) return null;

  return (
    <div
      className={cn(
        "flex items-end gap-1.5 transition-all duration-500",
        isOwn ? "justify-end" : "justify-start",
        fading ? "opacity-0 translate-y-[-8px]" : "opacity-100 animate-in slide-in-from-bottom-2"
      )}
    >
      {!isOwn && (
        <Avatar className="h-6 w-6 ring-2 ring-background shadow-md">
          <AvatarImage src={msg.senderAvatar} />
          <AvatarFallback className="text-[10px] bg-primary/20">
            {msg.senderName?.[0]?.toUpperCase()}
          </AvatarFallback>
        </Avatar>
      )}
      <div
        className={cn(
          "max-w-[170px] sm:max-w-[220px] px-3 py-1.5 rounded-2xl shadow-lg text-sm break-words",
          isOwn
            ? "bg-primary text-primary-foreground rounded-br-sm"
            : "bg-card border border-border text-card-foreground rounded-bl-sm",
          msg.isQuickMessage && "font-semibold text-xs bg-amber-500/90 text-white border-amber-400"
        )}
      >
        {!isOwn && (
          <span className="block text-[10px] font-medium opacity-70 mb-0.5 truncate">
            {msg.senderName}
          </span>
        )}
        {msg.message}
      </div>
    </div>
  );
}

export function GameChat({
  messages,
  onSendMessage,
  quickMessages,
  language,
  disabled = false,
  currentUserId,
}: GameChatProps) {
  const [messageInput, setMessageInput] = useState("");
  const [showHistory, setShowHistory] = useState(false);
  const [showQuickPanel, setShowQuickPanel] = useState(false);
  const [activeBubbles, setActiveBubbles] = useState<Message[]>([]);
  const scrollRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const { toast } = useToast();
  const { user, refreshUser } = useAuth();
  const lastProcessedRef = useRef<number>(0);

  const blockMutation = useMutation({
    mutationFn: (userId: string) => apiRequest('POST', `/api/users/${userId}/block`),
    onSuccess: () => {
      toast({ title: language === 'ar' ? 'تم حظر المستخدم' : 'User blocked' });
      refreshUser();
    },
    onError: (err: Error) => {
      toast({ title: language === 'ar' ? 'خطأ' : 'Error', description: err.message, variant: 'destructive' });
    }
  });

  const muteMutation = useMutation({
    mutationFn: (userId: string) => apiRequest('POST', `/api/users/${userId}/mute`),
    onSuccess: () => {
      toast({ title: language === 'ar' ? 'تم كتم المستخدم' : 'User muted' });
      refreshUser();
    },
    onError: (err: Error) => {
      toast({ title: language === 'ar' ? 'خطأ' : 'Error', description: err.message, variant: 'destructive' });
    }
  });

  // Watch for new messages → add them as floating bubbles
  useEffect(() => {
    if (messages.length > lastProcessedRef.current) {
      const newMsgs = messages.slice(lastProcessedRef.current);
      setActiveBubbles(prev => [...prev, ...newMsgs].slice(-3)); // keep stack compact so it stays out of board area
      lastProcessedRef.current = messages.length;
    }
  }, [messages]);

  // Auto-scroll history
  useEffect(() => {
    if (showHistory && scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages, showHistory]);

  const handleBubbleExpire = useCallback((msgId: string) => {
    setActiveBubbles(prev => prev.filter(m => m.id !== msgId));
  }, []);

  const handleSend = useCallback(() => {
    if (!messageInput.trim() || disabled) return;
    onSendMessage(messageInput.trim());
    setMessageInput("");
    setShowHistory(false); // Close after sending (Ludo King behavior)
    setShowQuickPanel(false);
  }, [messageInput, disabled, onSendMessage]);

  const handleQuickMessage = useCallback((qm: QuickMessage) => {
    if (disabled) return;
    onSendMessage(language === "ar" ? qm.ar : qm.en, true, qm.key);
    setShowQuickPanel(false); // Close after sending
  }, [disabled, onSendMessage, language]);

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
    <>
      {/* Floating bubbles overlay — positioned at bottom of game area */}
      <div className="absolute bottom-12 left-2 right-2 z-30 pointer-events-none flex flex-col gap-1.5 max-h-[84px] overflow-hidden">
        {activeBubbles.map((msg) => (
          <FloatingBubble
            key={msg.id}
            msg={msg}
            isOwn={msg.senderId === userId}
            onExpire={() => handleBubbleExpire(msg.id)}
          />
        ))}
      </div>

      {/* Quick messages floating strip */}
      {showQuickPanel && (
        <div className="absolute bottom-16 left-0 right-0 z-40 bg-background/95 backdrop-blur-md border-t animate-in slide-in-from-bottom-4 duration-200">
          <div className="flex items-center justify-between px-3 py-1.5 border-b">
            <span className="text-xs font-medium text-muted-foreground">
              {language === "ar" ? "رسائل سريعة" : "Quick Messages"}
            </span>
            <Button variant="ghost" size="icon" className="h-6 w-6" onClick={() => setShowQuickPanel(false)}>
              <X className="h-3.5 w-3.5" />
            </Button>
          </div>
          <div className="grid grid-cols-2 gap-1.5 p-2 max-h-[140px] overflow-y-auto">
            {quickMessages.map((qm) => (
              <Button
                key={qm.key}
                variant="outline"
                size="sm"
                className="h-auto py-1.5 px-2 text-xs hover:bg-primary hover:text-primary-foreground transition-colors"
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

      {/* Chat history overlay */}
      {showHistory && (
        <div className="absolute bottom-16 left-0 right-0 z-40 bg-background/95 backdrop-blur-md border-t animate-in slide-in-from-bottom-4 duration-200 max-h-[60vh]">
          <div className="flex items-center justify-between px-3 py-2 border-b">
            <div className="flex items-center gap-1.5">
              <MessageCircle className="h-4 w-4 text-primary" />
              <span className="text-sm font-medium">
                {language === "ar" ? "سجل الدردشة" : "Chat History"}
              </span>
              <span className="text-xs text-muted-foreground">({messages.length})</span>
            </div>
            <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => setShowHistory(false)}>
              <X className="h-4 w-4" />
            </Button>
          </div>
          <ScrollArea className="max-h-[40vh] overflow-y-auto" ref={scrollRef}>
            <div className="p-3 space-y-2.5">
              {messages.length === 0 ? (
                <p className="text-center text-sm text-muted-foreground py-6">
                  {language === "ar" ? "لا توجد رسائل بعد" : "No messages yet"}
                </p>
              ) : (
                messages.map((msg) => {
                  const isOwnMessage = msg.senderId === userId;
                  const isAlreadyBlocked = user?.blockedUsers?.includes(msg.senderId);
                  const isAlreadyMuted = user?.mutedUsers?.includes(msg.senderId);

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
                            {msg.senderName?.[0]?.toUpperCase()}
                          </AvatarFallback>
                        </Avatar>
                      )}
                      <div className={cn("max-w-[75%]", isOwnMessage ? "items-end" : "items-start")}>
                        <div
                          className={cn(
                            "px-3 py-1.5 rounded-2xl text-sm",
                            isOwnMessage
                              ? "bg-primary text-primary-foreground rounded-br-sm"
                              : "bg-muted rounded-bl-sm",
                            msg.isQuickMessage && "bg-amber-500/90 text-white font-medium text-xs"
                          )}
                        >
                          {!isOwnMessage && (
                            <div className="flex items-center gap-1 mb-0.5">
                              <span className="text-[10px] font-medium opacity-70 truncate">
                                {msg.senderName}
                              </span>
                              <DropdownMenu>
                                <DropdownMenuTrigger asChild>
                                  <button className="opacity-60 hover:opacity-100 p-0">
                                    <MoreVertical className="h-3 w-3" />
                                  </button>
                                </DropdownMenuTrigger>
                                <DropdownMenuContent align="start" className="min-w-[140px]">
                                  {!isAlreadyBlocked && (
                                    <DropdownMenuItem
                                      onClick={() => blockMutation.mutate(msg.senderId)}
                                      disabled={blockMutation.isPending}
                                      data-testid={`menu-block-${msg.senderId}`}
                                    >
                                      <Ban className="h-3.5 w-3.5 me-1.5" />
                                      {language === "ar" ? "حظر" : "Block"}
                                    </DropdownMenuItem>
                                  )}
                                  {!isAlreadyMuted && (
                                    <DropdownMenuItem
                                      onClick={() => muteMutation.mutate(msg.senderId)}
                                      disabled={muteMutation.isPending}
                                      data-testid={`menu-mute-${msg.senderId}`}
                                    >
                                      <VolumeX className="h-3.5 w-3.5 me-1.5" />
                                      {language === "ar" ? "كتم" : "Mute"}
                                    </DropdownMenuItem>
                                  )}
                                </DropdownMenuContent>
                              </DropdownMenu>
                            </div>
                          )}
                          {msg.message}
                        </div>
                        <span className={cn(
                          "text-[10px] text-muted-foreground mt-0.5 block",
                          isOwnMessage ? "text-end" : "text-start"
                        )}>
                          {formatTime(msg.createdAt)}
                        </span>
                      </div>
                    </div>
                  );
                })
              )}
            </div>
          </ScrollArea>
          {/* Input inside history panel */}
          <div className="p-2 border-t">
            <div className="flex gap-1.5">
              <Input
                ref={inputRef}
                value={messageInput}
                onChange={(e) => setMessageInput(e.target.value)}
                onKeyDown={handleKeyPress}
                placeholder={language === "ar" ? "اكتب رسالة..." : "Type a message..."}
                className="flex-1 h-9 text-sm"
                disabled={disabled}
                autoFocus
                data-testid="input-game-chat"
              />
              <Button
                size="icon"
                className="h-9 w-9"
                onClick={handleSend}
                disabled={!messageInput.trim() || disabled}
                data-testid="button-send-game-chat"
              >
                <Send className="h-3.5 w-3.5" />
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* Bottom control bar — chat/quick message buttons */}
      <div className="absolute bottom-0 left-0 right-0 z-30 flex items-center justify-center gap-2 p-2 bg-background/80 backdrop-blur-sm">
        <Button
          variant={showQuickPanel ? "default" : "outline"}
          size="sm"
          className="h-9 gap-1.5 rounded-full px-4 shadow-md"
          onClick={() => {
            setShowQuickPanel(!showQuickPanel);
            setShowHistory(false);
          }}
          disabled={disabled}
        >
          <Zap className="h-4 w-4" />
          <span className="text-xs hidden sm:inline">
            {language === "ar" ? "سريع" : "Quick"}
          </span>
        </Button>
        <Button
          variant={showHistory ? "default" : "outline"}
          size="sm"
          className="h-9 gap-1.5 rounded-full px-4 shadow-md relative"
          onClick={() => {
            setShowHistory(!showHistory);
            setShowQuickPanel(false);
          }}
          disabled={disabled}
        >
          <MessageCircle className="h-4 w-4" />
          <span className="text-xs hidden sm:inline">
            {language === "ar" ? "دردشة" : "Chat"}
          </span>
          {messages.length > 0 && !showHistory && (
            <span className="absolute -top-1 -end-1 h-4 w-4 rounded-full bg-destructive text-[9px] text-destructive-foreground flex items-center justify-center font-bold">
              {messages.length > 99 ? "99+" : messages.length}
            </span>
          )}
        </Button>
      </div>
    </>
  );
}
