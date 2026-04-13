import { useState, useEffect, useRef, useCallback } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { useI18n } from "@/lib/i18n";
import { cn } from "@/lib/utils";
import { useMessageTranslation } from "@/hooks/use-message-translation";
import {
  MessageCircle, X, Send, Loader2, Headphones, MinusCircle,
  Mail, Phone, ExternalLink, Paperclip, Image, FileText, Download, XCircle, Languages, ChevronDown, ArrowRight,
} from "lucide-react";

interface SupportMessage {
  id: string;
  ticketId: string;
  senderId: string;
  senderType: "user" | "admin" | "system";
  content: string;
  mediaUrl?: string | null;
  mediaType?: string | null;
  mediaName?: string | null;
  isAutoReply: boolean;
  isRead: boolean;
  createdAt: string;
}

interface SupportTicket {
  id: string;
  userId: string;
  subject: string;
  status: string;
  lastMessageAt: string;
  createdAt: string;
}

function getToken() {
  return localStorage.getItem("pwm_token") || "";
}

async function supportFetch(url: string, options: RequestInit = {}) {
  const res = await fetch(url, {
    ...options,
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${getToken()}`,
      ...options.headers,
    },
  });
  if (!res.ok) throw new Error("Failed");
  return res.json();
}

export function SupportChatWidget({ isLoggedIn = false }: { isLoggedIn?: boolean }) {
  const [isOpen, setIsOpen] = useState(false);
  const [message, setMessage] = useState("");
  const [mediaPreview, setMediaPreview] = useState<{ url: string; type: string; name: string; file: File } | null>(null);
  const [uploading, setUploading] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const queryClient = useQueryClient();
  const { t } = useI18n();
  const { getDisplayText, getTranslatedText, hasTranslation, toggleTranslation, isTranslating: isTranslatingMsg, isShowingOriginal, autoTranslate, setAutoTranslate, translateMessage, targetLanguage, setTargetLanguage, languages, currentLanguageInfo } = useMessageTranslation();
  const [showLangMenu, setShowLangMenu] = useState(false);
  const [langFilter, setLangFilter] = useState("");

  // Listen for support chat new message event (show badge/pulse, don't force open)
  useEffect(() => {
    const handleOpen = () => setIsOpen(true);
    const handleNewMessage = () => {
      // If already open, messages will refresh via query invalidation
      // If closed, the unread badge will update via query invalidation
    };
    window.addEventListener('open-support-chat', handleOpen);
    window.addEventListener('support-chat-new-message', handleNewMessage);
    return () => {
      window.removeEventListener('open-support-chat', handleOpen);
      window.removeEventListener('support-chat-new-message', handleNewMessage);
    };
  }, []);

  // Get or create ticket
  const { data: ticket, isLoading: ticketLoading } = useQuery<SupportTicket>({
    queryKey: ["support-ticket"],
    queryFn: () => supportFetch("/api/support-chat/ticket"),
    enabled: isOpen && isLoggedIn,
    staleTime: 60000,
  });

  // Get messages (WebSocket handles real-time via NotificationProvider, polling as fallback)
  const { data: messagesData, isLoading: messagesLoading } = useQuery<{ messages: SupportMessage[]; ticket: SupportTicket }>({
    queryKey: ["support-messages", ticket?.id],
    queryFn: () => supportFetch(`/api/support-chat/messages/${ticket!.id}`),
    enabled: !!ticket?.id && isOpen,
    refetchInterval: isOpen ? 30000 : false,
  });

  // Unread count (WebSocket handles real-time via NotificationProvider, polling as fallback)
  const { data: unreadData } = useQuery<{ unread: number }>({
    queryKey: ["support-unread"],
    queryFn: () => supportFetch("/api/support-chat/unread"),
    enabled: isLoggedIn,
    refetchInterval: 60000,
  });

  // Check if media is enabled for this user
  const { data: mediaEnabledData } = useQuery<{ enabled: boolean; reason?: string }>({
    queryKey: ["support-media-enabled"],
    queryFn: async () => {
      try {
        return await supportFetch("/api/support-chat/media-enabled");
      } catch {
        // Default to enabled if check fails
        return { enabled: true };
      }
    },
    enabled: isOpen && isLoggedIn,
    staleTime: 30000,
    retry: 1,
  });

  // Default to true — show button unless explicitly disabled
  const mediaEnabled = mediaEnabledData?.enabled ?? true;

  // Send message mutation
  const sendMutation = useMutation({
    mutationFn: (data: { content: string; mediaUrl?: string; mediaType?: string; mediaName?: string }) =>
      supportFetch("/api/support-chat/messages", {
        method: "POST",
        body: JSON.stringify({ ticketId: ticket!.id, ...data }),
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["support-messages", ticket?.id] });
      queryClient.invalidateQueries({ queryKey: ["support-unread"] });
      setMessage("");
      setMediaPreview(null);
    },
    onError: (error: Error) => {
      console.error("[Support Chat] Send failed:", error);
    },
  });

  const requestHumanSupportMutation = useMutation({
    mutationFn: () => supportFetch(`/api/support-chat/tickets/${ticket!.id}/request-human-support`, {
      method: "POST",
    }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["support-ticket"] });
      queryClient.invalidateQueries({ queryKey: ["support-messages", ticket?.id] });
      queryClient.invalidateQueries({ queryKey: ["support-unread"] });
    },
  });

  const messages = messagesData?.messages || [];
  const isHumanSupportMode = ticket?.status === "active";

  // Auto-translate incoming admin/system messages when enabled
  useEffect(() => {
    if (!autoTranslate || messages.length === 0) return;
    messages.forEach((msg) => {
      if (msg.senderType !== "user" && msg.content) {
        const msgId = String(msg.id);
        if (isShowingOriginal(msgId) && !isTranslatingMsg(msgId)) {
          translateMessage(msgId, msg.content);
        }
      }
    });
  }, [messages, autoTranslate]);

  // Auto-scroll when new messages arrive
  useEffect(() => {
    if (scrollRef.current && isOpen) {
      const el = scrollRef.current;
      el.scrollTop = el.scrollHeight;
    }
  }, [messages.length, isOpen]);

  // Focus input when opened
  useEffect(() => {
    if (isOpen && inputRef.current) {
      setTimeout(() => inputRef.current?.focus(), 300);
    }
  }, [isOpen]);

  // Handle file selection
  const handleFileSelect = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    // Max 10MB
    if (file.size > 10 * 1024 * 1024) {
      alert(t('support.fileTooLarge'));
      return;
    }
    const type = file.type.startsWith("image/") ? "image" : file.type.startsWith("video/") ? "video" : "file";
    const reader = new FileReader();
    reader.onload = () => {
      setMediaPreview({ url: reader.result as string, type, name: file.name, file });
    };
    reader.readAsDataURL(file);
    // Reset input
    if (fileInputRef.current) fileInputRef.current.value = "";
  }, []);

  // Upload file and send message
  const handleSendWithMedia = useCallback(async () => {
    if (sendMutation.isPending || uploading || !ticket) return;
    const trimmed = message.trim();

    if (mediaPreview) {
      setUploading(true);
      try {
        const res = await fetch("/api/upload", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${getToken()}`,
          },
          body: JSON.stringify({
            fileName: mediaPreview.name,
            fileData: mediaPreview.url,
            fileType: mediaPreview.file.type,
          }),
        });
        if (!res.ok) {
          const errData = await res.json().catch(() => ({ error: res.statusText }));
          console.error("[Support Chat] Upload error:", res.status, errData);
          throw new Error(errData.error || `Upload failed (${res.status})`);
        }
        const data = await res.json();
        const uploadedUrl = data.url || data.fileUrl;
        if (!uploadedUrl) throw new Error("No URL returned from upload");
        sendMutation.mutate({
          content: trimmed || (mediaPreview.type === "image" ? `📷 ${t('support.image')}` : mediaPreview.type === "video" ? `🎥 ${t('support.videoMedia')}` : `📎 ${t('support.file')}`),
          mediaUrl: uploadedUrl,
          mediaType: mediaPreview.type,
          mediaName: mediaPreview.name,
        });
      } catch (err: unknown) {
        console.error("[Support Chat] Upload failed:", err);
        alert(err instanceof Error ? err.message : t('support.uploadFailed'));
      } finally {
        setUploading(false);
      }
    } else if (trimmed) {
      sendMutation.mutate({ content: trimmed });
    }
  }, [message, mediaPreview, sendMutation, uploading, ticket]);

  const handleSend = useCallback(() => {
    handleSendWithMedia();
  }, [handleSendWithMedia]);

  const unreadCount = unreadData?.unread || 0;

  // Don't show for non-logged-in users (will use separate simple version)
  if (!isLoggedIn) return null;

  return (
    <>
      {/* Floating Button */}
      {!isOpen && (
        <button
          onClick={() => setIsOpen(true)}
          className={`fixed bottom-20 start-4 z-50 flex items-center justify-center w-12 h-12 rounded-full text-white shadow-lg hover:scale-110 hover:shadow-xl transition-all duration-300 group ${unreadCount > 0 ? 'bg-green-500 opacity-100 shadow-green-500/40 animate-pulse' : 'bg-green-600/40 opacity-50 hover:bg-green-500 hover:opacity-100 hover:shadow-green-500/30'}`
          }
          aria-label={t('support.supportLabel')}
        >
          <Headphones className="h-5 w-5 group-hover:scale-110 transition-transform" />
          {unreadCount > 0 && (
            <span className="absolute -top-2 -end-2 flex h-6 w-6 items-center justify-center rounded-full bg-red-500 text-[11px] font-bold text-white shadow-lg shadow-red-500/50 ring-2 ring-white dark:ring-gray-900 animate-bounce">
              {unreadCount > 9 ? "9+" : unreadCount}
            </span>
          )}
        </button>
      )}

      {/* Chat Panel */}
      {isOpen && (
        <div className="fixed bottom-20 start-4 z-50 w-[360px] max-w-[calc(100vw-2rem)] h-[500px] max-h-[calc(100vh-7rem)] flex flex-col bg-background border border-border rounded-2xl shadow-2xl overflow-hidden animate-in slide-in-from-bottom-4 duration-300">
          {/* Header */}
          <div className="flex items-center justify-between px-4 py-3 bg-gradient-to-r from-primary to-primary/80 text-primary-foreground">
            <div className="flex items-center gap-2">
              <Headphones className="h-5 w-5" />
              <div>
                <h3 className="font-semibold text-sm">{t('support.technicalSupport')}</h3>
                <p className="text-[10px] opacity-80">{t('support.hereToHelp')}</p>
              </div>
            </div>
            <div className="flex items-center gap-1">
              {/* Auto-translate toggle */}
              <button
                onClick={() => setAutoTranslate(!autoTranslate)}
                className={cn("p-1.5 rounded-full transition-colors", autoTranslate ? "bg-white/30" : "hover:bg-white/20")}
                title={t('chat.autoTranslate')}
              >
                <Languages className="h-4 w-4" />
              </button>
              {/* Language selector */}
              <div className="relative">
                <button
                  onClick={() => setShowLangMenu(!showLangMenu)}
                  className="p-1 rounded-full hover:bg-white/20 transition-colors text-[10px] flex items-center gap-0.5"
                >
                  <span>{currentLanguageInfo?.nativeName?.slice(0, 4) || targetLanguage}</span>
                  <ChevronDown className="h-3 w-3" />
                </button>
                {showLangMenu && (
                  <div className="absolute top-full end-0 mt-1 w-[200px] max-h-[240px] overflow-y-auto bg-popover text-popover-foreground border rounded-lg shadow-xl z-50">
                    <div className="p-1.5 sticky top-0 bg-popover z-10">
                      <input
                        placeholder={t('chat.searchLanguage')}
                        value={langFilter}
                        onChange={(e) => setLangFilter(e.target.value)}
                        className="w-full h-6 text-[11px] px-2 rounded border bg-background text-foreground placeholder:text-muted-foreground"
                        autoFocus
                      />
                    </div>
                    {languages
                      .filter(l => {
                        if (!langFilter) return true;
                        const q = langFilter.toLowerCase();
                        return l.name.toLowerCase().includes(q) || l.nativeName.toLowerCase().includes(q) || l.code.includes(q);
                      })
                      .map(lang => (
                        <button
                          key={lang.code}
                          onClick={() => { setTargetLanguage(lang.code); setShowLangMenu(false); setLangFilter(""); }}
                          className={cn("w-full text-start px-2 py-1.5 text-[11px] text-popover-foreground hover:bg-accent hover:text-accent-foreground transition-colors flex justify-between", targetLanguage === lang.code && "bg-primary/10 font-semibold")}
                        >
                          <span>{lang.nativeName}</span>
                          <span className="text-muted-foreground">{lang.code}</span>
                        </button>
                      ))}
                  </div>
                )}
              </div>
              <button
                onClick={() => setIsOpen(false)}
                className="p-1.5 rounded-full hover:bg-white/20 transition-colors"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
          </div>

          {/* Messages Area */}
          <div ref={scrollRef} className="flex-1 overflow-y-auto p-3 space-y-2 bg-muted/20">
            {(ticketLoading || messagesLoading) && (
              <div className="flex items-center justify-center h-full">
                <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
              </div>
            )}

            {!ticketLoading && !messagesLoading && messages.length === 0 && (
              <div className="flex flex-col items-center justify-center h-full text-center gap-2">
                <Headphones className="h-10 w-10 text-muted-foreground/50" />
                <p className="text-sm text-muted-foreground">
                  {t('support.welcomeMessage')}
                </p>
                <p className="text-xs text-muted-foreground/70">
                  {t('support.welcomeSubtext')}
                </p>
              </div>
            )}

            {messages.map((msg) => (
              <div
                key={msg.id}
                className={`flex ${msg.senderType === "user" ? "justify-end" : "justify-start"}`}
              >
                <div
                  className={`max-w-[80%] rounded-2xl px-3 py-2 text-sm ${msg.senderType === "user"
                    ? "bg-primary text-primary-foreground rounded-ee-sm"
                    : msg.senderType === "system"
                      ? "bg-muted text-muted-foreground rounded-es-sm italic"
                      : "bg-card border border-border text-card-foreground rounded-es-sm"
                    }`}
                >
                  {msg.senderType === "admin" && (
                    <p className="text-[10px] font-semibold text-primary mb-0.5 flex items-center gap-1">
                      <Headphones className="h-3 w-3" />
                      {t('support.supportLabel')}
                    </p>
                  )}
                  {msg.senderType === "system" && msg.isAutoReply && (
                    <p className="text-[10px] font-semibold mb-0.5">{t('support.autoReply')}</p>
                  )}
                  {/* Media display */}
                  {msg.mediaUrl && msg.mediaType === "image" && (
                    <a href={msg.mediaUrl} target="_blank" rel="noopener noreferrer" className="block mb-1">
                      <img src={msg.mediaUrl} alt={msg.mediaName || t('support.image')} className="rounded-lg max-w-full max-h-48 object-cover" loading="lazy" />
                    </a>
                  )}
                  {msg.mediaUrl && msg.mediaType === "video" && (
                    <video src={msg.mediaUrl} controls className="rounded-lg max-w-full max-h-48 mb-1" />
                  )}
                  {msg.mediaUrl && msg.mediaType === "file" && (
                    <a href={msg.mediaUrl} target="_blank" rel="noopener noreferrer" className="flex items-center gap-1.5 p-2 mb-1 rounded-lg bg-black/10 dark:bg-white/10 hover:bg-black/20 dark:hover:bg-white/20 transition-colors">
                      <FileText className="h-4 w-4 shrink-0" />
                      <span className="text-xs truncate flex-1">{msg.mediaName || t('support.file')}</span>
                      <Download className="h-3 w-3 shrink-0 opacity-60" />
                    </a>
                  )}
                  <p className="whitespace-pre-wrap break-words">{getDisplayText(String(msg.id), msg.content)}</p>
                  {/* Show both original and translated */}
                  {hasTranslation(String(msg.id)) && !isTranslatingMsg(String(msg.id)) && (
                    <div className="mt-0.5 border-t border-current/10">
                      <p className="text-[11px] whitespace-pre-wrap break-words opacity-60 italic">
                        {isShowingOriginal(String(msg.id))
                          ? getTranslatedText(String(msg.id))
                          : msg.content
                        }
                      </p>
                      <button
                        onClick={() => toggleTranslation(String(msg.id), msg.content)}
                        className="text-[9px] opacity-50 hover:opacity-100 transition-opacity underline"
                      >
                        {isShowingOriginal(String(msg.id)) ? t('chat.showTranslation') : t('chat.showOriginal')}
                      </button>
                    </div>
                  )}
                  {isTranslatingMsg(String(msg.id)) && (
                    <span className="text-[9px] opacity-60 flex items-center gap-1">
                      <Loader2 className="h-2 w-2 animate-spin" />{t('chat.translating')}
                    </span>
                  )}
                  <p className="text-[9px] opacity-60 mt-1 text-end">
                    {new Date(msg.createdAt).toLocaleTimeString(undefined, {
                      hour: "2-digit",
                      minute: "2-digit",
                    })}
                  </p>
                </div>
              </div>
            ))}
          </div>

          {/* Input */}
          <div className="p-3 border-t border-border bg-background">
            {ticket?.status === "closed" ? (
              <p className="text-center text-xs text-muted-foreground py-2">
                {t('support.conversationClosed')}
              </p>
            ) : (
              <div className="space-y-2">
                {!isHumanSupportMode ? (
                  <Button
                    type="button"
                    variant="outline"
                    className="w-full justify-center gap-2 h-9"
                    onClick={() => requestHumanSupportMutation.mutate()}
                    disabled={requestHumanSupportMutation.isPending}
                  >
                    {requestHumanSupportMutation.isPending ? (
                      <Loader2 className="h-4 w-4 animate-spin" />
                    ) : (
                      <ArrowRight className="h-4 w-4" />
                    )}
                    تحويل للدعم البشري
                  </Button>
                ) : (
                  <p className="text-xs text-amber-600 dark:text-amber-400 bg-amber-50/70 dark:bg-amber-950/30 border border-amber-200/70 dark:border-amber-800 rounded-md px-2 py-1.5">
                    تم التحويل للدعم البشري. sam9 متوقف الآن وسيكمل فريق الدعم معك.
                  </p>
                )}

                {/* Media preview */}
                {mediaPreview && (
                  <div className="relative flex items-center gap-2 p-2 rounded-lg bg-muted/50 border">
                    {mediaPreview.type === "image" ? (
                      <img src={mediaPreview.url} alt="" className="h-16 w-16 object-cover rounded" />
                    ) : mediaPreview.type === "video" ? (
                      <div className="h-16 w-16 rounded bg-muted flex items-center justify-center">
                        <Image className="h-6 w-6 text-muted-foreground" />
                      </div>
                    ) : (
                      <div className="h-16 w-16 rounded bg-muted flex items-center justify-center">
                        <FileText className="h-6 w-6 text-muted-foreground" />
                      </div>
                    )}
                    <div className="flex-1 min-w-0">
                      <p className="text-xs font-medium truncate">{mediaPreview.name}</p>
                      <p className="text-[10px] text-muted-foreground">
                        {mediaPreview.type === "image" ? t('support.image') : mediaPreview.type === "video" ? t('support.videoMedia') : t('support.file')}
                      </p>
                    </div>
                    <button
                      onClick={() => setMediaPreview(null)}
                      className="absolute top-1 end-1 p-0.5 rounded-full hover:bg-destructive/20 transition-colors"
                    >
                      <XCircle className="h-4 w-4 text-destructive" />
                    </button>
                  </div>
                )}
                <div className="flex gap-2">
                  {/* Hidden file input */}
                  <input
                    ref={fileInputRef}
                    type="file"
                    accept="image/*,video/*,.pdf,.doc,.docx,.txt,.zip,.rar"
                    className="hidden"
                    onChange={handleFileSelect}
                  />
                  {/* Media upload button */}
                  {mediaEnabled && (
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      className="rounded-full h-9 w-9 shrink-0"
                      onClick={() => fileInputRef.current?.click()}
                      disabled={uploading || sendMutation.isPending}
                      title={t('support.attachFile')}
                    >
                      <Paperclip className="h-4 w-4" />
                    </Button>
                  )}
                  <Input
                    ref={inputRef}
                    value={message}
                    onChange={(e) => setMessage(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter" && !e.shiftKey) {
                        e.preventDefault();
                        handleSend();
                      }
                    }}
                    placeholder={t('support.typeMessage')}
                    className="flex-1 rounded-full text-sm h-9"
                    maxLength={2000}
                    disabled={sendMutation.isPending || uploading}
                  />
                  <Button
                    size="icon"
                    className="rounded-full h-9 w-9 shrink-0"
                    onClick={handleSend}
                    disabled={(!message.trim() && !mediaPreview) || sendMutation.isPending || uploading}
                  >
                    {sendMutation.isPending || uploading ? (
                      <Loader2 className="h-4 w-4 animate-spin" />
                    ) : (
                      <Send className="h-4 w-4" />
                    )}
                  </Button>
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </>
  );
}

// Simple version for login page (no auth needed, fetches admin-configured contacts)

function getContactUrl(type: string, value: string): string {
  switch (type) {
    case "whatsapp": return value.startsWith("http") ? value : `https://wa.me/${value.replace(/[^0-9]/g, "")}`;
    case "telegram": return value.startsWith("http") ? value : `https://t.me/${value.replace("@", "")}`;
    case "email": return `mailto:${value}`;
    case "phone": return `tel:${value}`;
    case "facebook": return value.startsWith("http") ? value : `https://facebook.com/${value}`;
    case "instagram": return value.startsWith("http") ? value : `https://instagram.com/${value}`;
    case "twitter": return value.startsWith("http") ? value : `https://x.com/${value}`;
    case "discord": return value.startsWith("http") ? value : `https://discord.gg/${value}`;
    default: return value.startsWith("http") ? value : `https://${value}`;
  }
}

const CONTACT_STYLES: Record<string, { gradient: string; icon: string; shadow: string }> = {
  whatsapp: { gradient: "from-green-500 to-green-600", icon: "📱", shadow: "shadow-green-500/25" },
  telegram: { gradient: "from-sky-400 to-blue-500", icon: "✈️", shadow: "shadow-blue-500/25" },
  email: { gradient: "from-amber-500 to-orange-500", icon: "✉️", shadow: "shadow-orange-500/25" },
  phone: { gradient: "from-emerald-500 to-teal-600", icon: "📞", shadow: "shadow-emerald-500/25" },
  facebook: { gradient: "from-blue-500 to-blue-700", icon: "👤", shadow: "shadow-blue-600/25" },
  instagram: { gradient: "from-pink-500 to-purple-600", icon: "📸", shadow: "shadow-pink-500/25" },
  twitter: { gradient: "from-gray-700 to-gray-900", icon: "𝕏", shadow: "shadow-gray-700/25" },
  discord: { gradient: "from-indigo-500 to-violet-600", icon: "🎮", shadow: "shadow-indigo-500/25" },
  other: { gradient: "from-gray-500 to-gray-600", icon: "🔗", shadow: "shadow-gray-500/25" },
};

const CONTACT_LABEL_KEYS: Record<string, string> = {
  whatsapp: "support.whatsapp",
  telegram: "support.telegram",
  email: "support.email",
  phone: "support.phone",
  facebook: "support.facebook",
  instagram: "support.instagram",
  twitter: "support.twitter",
  discord: "support.discord",
  other: "support.otherLink",
};

function ContactIcon({ type, className = "h-5 w-5" }: { type: string; className?: string }) {
  if (type === "email") return <Mail className={className} />;
  if (type === "phone") return <Phone className={className} />;
  return <span className="text-lg leading-none">{CONTACT_STYLES[type]?.icon || "🔗"}</span>;
}

interface SupportContact {
  id: string;
  type: string;
  value: string;
  label?: string;
  isActive?: boolean;
  [key: string]: unknown;
}

export function SupportChatIcon() {
  const [isOpen, setIsOpen] = useState(false);
  const btnRef = useRef<HTMLButtonElement>(null);
  const { t } = useI18n();

  const { data: contacts, isLoading } = useQuery<SupportContact[]>({
    queryKey: ["public-support-contacts"],
    queryFn: async () => {
      const res = await fetch("/api/support/contacts");
      if (!res.ok) throw new Error("Failed");
      return res.json();
    },
    staleTime: 60000,
  });

  // Close on Escape
  useEffect(() => {
    if (!isOpen) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape") setIsOpen(false);
    };
    document.addEventListener("keydown", handler);
    return () => document.removeEventListener("keydown", handler);
  }, [isOpen]);

  const activeContacts = contacts?.filter((c: SupportContact) => c.isActive) || [];

  return (
    <>
      {/* Trigger Button */}
      <Button
        ref={btnRef}
        variant="outline"
        size="sm"
        onClick={() => setIsOpen(!isOpen)}
        className="flex items-center gap-1.5 h-9 px-3"
        aria-label={t('support.title')}
        title={t('support.title')}
      >
        <Headphones className="h-4 w-4" />
        <span className="hidden sm:inline text-xs">{t('support.title')}</span>
      </Button>

      {/* Full-screen overlay + centered panel on mobile, dropdown on desktop */}
      {isOpen && (
        <div className="fixed inset-0 z-[200]" onClick={() => setIsOpen(false)}>
          {/* Backdrop */}
          <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" />

          {/* Panel Container - centered on mobile, positioned from top-start on desktop */}
          <div
            className="absolute inset-4 sm:inset-auto sm:top-14 sm:start-4 flex items-center justify-center sm:block"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="w-full max-w-sm sm:w-80 bg-card border border-border rounded-2xl shadow-2xl overflow-hidden animate-in fade-in zoom-in-95 duration-200">
              {/* Header */}
              <div className="bg-gradient-to-br from-primary to-primary/80 px-5 py-4 text-primary-foreground">
                <div className="flex items-center justify-between mb-3">
                  <div className="flex items-center gap-2.5">
                    <div className="w-9 h-9 rounded-xl bg-white/20 flex items-center justify-center">
                      <Headphones className="h-5 w-5" />
                    </div>
                    <div>
                      <h3 className="font-bold text-sm">{t('support.technicalSupport')}</h3>
                      <p className="text-[10px] text-primary-foreground/70">{t('support.hereToHelp')}</p>
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={() => setIsOpen(false)}
                    className="p-1.5 rounded-lg hover:bg-white/20 transition-colors"
                    aria-label={t('common.close')}
                  >
                    <X className="h-4 w-4" />
                  </button>
                </div>
                <p className="text-xs text-primary-foreground/80">{t('support.chooseContact')}</p>
              </div>

              {/* Contacts List */}
              <div className="p-3 max-h-[50vh] sm:max-h-[320px] overflow-y-auto bg-card">
                {isLoading ? (
                  <div className="flex items-center justify-center py-8">
                    <Loader2 className="h-5 w-5 animate-spin text-primary" />
                  </div>
                ) : activeContacts.length === 0 ? (
                  <div className="text-center py-8">
                    <Headphones className="h-10 w-10 mx-auto text-muted-foreground/20 mb-3" />
                    <p className="text-sm text-muted-foreground">{t('support.noContacts')}</p>
                  </div>
                ) : (
                  <div className="space-y-2">
                    {activeContacts.map((contact: SupportContact) => {
                      const style = CONTACT_STYLES[contact.type] || CONTACT_STYLES.other;
                      return (
                        <a
                          key={contact.id}
                          href={getContactUrl(contact.type, contact.value)}
                          target="_blank"
                          rel="noopener noreferrer"
                          className={`group flex items-center gap-3 p-3 rounded-xl bg-gradient-to-r ${style.gradient} text-white shadow-md ${style.shadow} transition-all duration-200 hover:brightness-110 active:scale-[0.98]`}
                        >
                          <div className="flex items-center justify-center w-10 h-10 rounded-xl bg-white/20 shrink-0">
                            <ContactIcon type={contact.type} className="h-5 w-5" />
                          </div>
                          <div className="min-w-0 flex-1">
                            <p className="font-semibold text-sm">
                              {contact.label || t(CONTACT_LABEL_KEYS[contact.type] || 'support.otherLink')}
                            </p>
                            <p className="text-[11px] text-white/70 truncate mt-0.5" dir="ltr" style={{ textAlign: "start" }}>
                              {contact.value}
                            </p>
                          </div>
                          <ExternalLink className="h-3.5 w-3.5 text-white/40 shrink-0 group-hover:text-white/80 transition-colors" />
                        </a>
                      );
                    })}
                  </div>
                )}
              </div>

              {/* Footer */}
              <div className="px-4 py-2.5 border-t border-border bg-muted/40 text-center">
                <p className="text-[10px] text-muted-foreground">
                  {t('support.available247')}
                </p>
              </div>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
