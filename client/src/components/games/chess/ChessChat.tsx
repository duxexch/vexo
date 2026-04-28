import { useState, useRef, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Send } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useI18n } from '@/lib/i18n';

interface ChatMessage {
  id?: string;
  userId?: string;
  username: string;
  content?: string;
  message?: string;
  timestamp: string | number;
}

interface ChessChatProps {
  messages: ChatMessage[];
  onSendMessage: (content: string) => void;
  currentUserId: string;
}

export function ChessChat({ messages, onSendMessage, currentUserId }: ChessChatProps) {
  const [newMessage, setNewMessage] = useState('');
  const [isComposing, setIsComposing] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);
  const isComposingRef = useRef(false);
  const { t } = useI18n();

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages.length]);

  const handleSend = () => {
    if (newMessage.trim()) {
      onSendMessage(newMessage.trim());
      setNewMessage('');
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    const isComposing = isComposingRef.current || e.nativeEvent.isComposing || e.key === 'Process';
    if (isComposing) {
      return;
    }

    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  return (
    <div className="bg-card rounded-lg border flex flex-col flex-1 min-h-[200px]">
      <div className="p-3 border-b">
        <h3 className="font-semibold text-sm">{t('chess.chat')}</h3>
      </div>

      <ScrollArea className="flex-1 p-3" ref={scrollRef}>
        <div className="space-y-2">
          {messages.length === 0 ? (
            <p className="text-muted-foreground text-sm text-center py-4">
              {t('chat.noMessages')}
            </p>
          ) : (
            messages.map((msg, idx) => {
              const isOwn = msg.userId === currentUserId;
              const msgKey = msg.id || `${msg.username}-${msg.timestamp || idx}`;
              return (
                <div
                  key={msgKey}
                  data-testid={`chat-message-${msgKey}`}
                  className={cn(
                    "flex flex-col max-w-[80%]",
                    isOwn ? "ml-auto items-end" : "mr-auto items-start"
                  )}
                >
                  <span className="text-xs text-muted-foreground mb-0.5">
                    {isOwn ? t('common.you') : msg.username}
                  </span>
                  <div className={cn(
                    "px-3 py-1.5 rounded-lg text-sm",
                    isOwn
                      ? "bg-primary text-primary-foreground"
                      : "bg-muted"
                  )}>
                    {msg.message || msg.content}
                  </div>
                </div>
              );
            })
          )}
        </div>
      </ScrollArea>

      <div className="px-2 pt-2 pb-[max(0px,calc(env(safe-area-inset-bottom)-var(--keyboard-inset-bottom,0px)))] border-t flex gap-2">
        <Input
          value={newMessage}
          onChange={(e) => setNewMessage(e.target.value)}
          onInput={(e) => {
            const v = (e.currentTarget as HTMLInputElement).value;
            if (v !== newMessage) setNewMessage(v);
          }}
          onCompositionStart={() => {
            isComposingRef.current = true;
            setIsComposing(true);
          }}
          onCompositionEnd={(e) => {
            isComposingRef.current = false;
            setIsComposing(false);
            const v = (e.currentTarget as HTMLInputElement).value;
            if (v !== newMessage) setNewMessage(v);
          }}
          onKeyDown={handleKeyDown}
          placeholder={t('chess.typeMessage')}
          className="flex-1"
          dir="auto"
          inputMode="text"
          enterKeyHint="send"
          maxLength={500}
          data-testid="input-chat-message"
        />
        <Button
          size="icon"
          onClick={handleSend}
          disabled={!newMessage.trim() && !isComposing}
          data-testid="button-send-chat"
        >
          <Send className="w-4 h-4" />
        </Button>
      </div>
    </div>
  );
}
