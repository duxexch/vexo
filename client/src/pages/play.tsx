import { useState, useRef, useEffect, useCallback, useMemo } from 'react';
import { useQuery, useMutation } from '@tanstack/react-query';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Skeleton } from '@/components/ui/skeleton';
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from '@/components/ui/accordion';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Carousel, CarouselContent, CarouselItem, CarouselNext, CarouselPrevious } from '@/components/ui/carousel';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { ScrollArea } from '@/components/ui/scroll-area';
import { useToast } from '@/hooks/use-toast';
import { useI18n } from '@/lib/i18n';
import { useAuth } from '@/lib/auth';
import { apiRequest, queryClient } from '@/lib/queryClient';
import {
  Gamepad2, Dices, Target, CircleDot, Trophy, Coins,
  Search, X, ChevronLeft, ChevronRight, Star, Zap,
  Wallet, TrendingUp, ArrowUpCircle, ArrowDownCircle,
  CreditCard, Crown, Clock, Megaphone, Pin, Eye,
  CheckCircle, History, DollarSign, Play, Maximize2, Minimize2,
  MessageCircle, Send, ChevronDown, ChevronUp
} from 'lucide-react';
import { VoiceChat as SharedVoiceChat } from '@/components/games/VoiceChat';
import { ChatViewerCountPill } from '@/components/games/GameChat';
import { useSocketChat } from '@/hooks/use-socket-chat';
import type { ChatBroadcast, ChatErrorCode } from '@shared/socketio-events';
import { BalanceDisplay } from '@/components/BalanceDisplay';
import type { Game, Transaction, User, Announcement, GameplayEmoji, Advertisement, GameSection as GameSectionType } from '@shared/schema';
import Autoplay from 'embla-carousel-autoplay';
import DOMPurify from 'dompurify';

/** Sanitize HTML using DOMPurify to prevent XSS */
function sanitizeHtml(html: string): string {
  return DOMPurify.sanitize(html, {
    ADD_TAGS: ['iframe'],
    ADD_ATTR: ['allow', 'allowfullscreen', 'frameborder', 'scrolling', 'src'],
    FORBID_TAGS: ['script', 'style', 'form', 'input', 'textarea', 'select', 'button'],
    FORBID_ATTR: ['onerror', 'onload', 'onclick', 'onmouseover'],
  });
}

const GAME_CATEGORIES: { id: string; name: string; nameAr: string; icon: React.ComponentType<{ className?: string }>; color: string }[] = [
  { id: "crash", name: "Crash", nameAr: "كراش", icon: Zap, color: "text-amber-500" },
  { id: "dice", name: "Dice", nameAr: "النرد", icon: Dices, color: "text-cyan-500" },
  { id: "wheel", name: "Wheel", nameAr: "العجلة", icon: CircleDot, color: "text-fuchsia-500" },
  { id: "slots", name: "Slots", nameAr: "السلوتس", icon: Star, color: "text-emerald-500" },
  { id: "jackpot", name: "Jackpot", nameAr: "جاكبوت", icon: Trophy, color: "text-yellow-500" },
];

const quickBetAmounts = ['1.00', '5.00', '10.00', '25.00', '50.00', '100.00'];

// Game Section Component with manual expand/collapse (no auto-collapse)
function GameSection({
  title,
  titleAr,
  games,
  onSelectGame,
  icon: Icon,
  iconColor,
  initiallyExpanded = false
}: {
  title: string;
  titleAr: string;
  games: Game[];
  onSelectGame: (game: Game) => void;
  icon: React.ComponentType<{ className?: string }>;
  iconColor: string;
  initiallyExpanded?: boolean;
}) {
  const { language } = useI18n();
  const [isExpanded, setIsExpanded] = useState(initiallyExpanded);

  return (
    <Card className="border rounded-lg bg-card/50">
      <div className="flex items-center justify-between px-4 py-3">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded-full bg-background flex items-center justify-center">
            <Icon className={`w-4 h-4 ${iconColor}`} />
          </div>
          <span className="font-medium">
            {language === 'ar' ? titleAr : title}
          </span>
          <Badge variant="secondary" className="text-xs">
            {games.length}
          </Badge>
        </div>
        <Button
          variant="ghost"
          size="sm"
          className="gap-1"
          onClick={() => setIsExpanded(!isExpanded)}
          data-testid={`button-toggle-${title.toLowerCase().replace(/\s/g, '-')}`}
        >
          {isExpanded ? (
            <>
              <span className="text-sm">{language === 'ar' ? 'إخفاء' : 'Hide'}</span>
              <ChevronUp className="h-4 w-4" />
            </>
          ) : (
            <>
              <span className="text-sm">{language === 'ar' ? 'إظهار المزيد' : 'Show More'}</span>
              <ChevronDown className="h-4 w-4" />
            </>
          )}
        </Button>
      </div>
      {isExpanded && (
        <div className="px-2 pb-3">
          {games.length > 0 ? (
            <HorizontalGameScroll
              games={games}
              onSelectGame={onSelectGame}
            />
          ) : (
            <p className="text-center text-muted-foreground py-4 text-sm">
              {language === 'ar' ? 'لا توجد ألعاب' : 'No games available'}
            </p>
          )}
        </div>
      )}
    </Card>
  );
}

// Advertisement Carousel Component
function AdvertisementCarousel() {
  const { language } = useI18n();
  const trackedViewIdsRef = useRef<Set<string>>(new Set());

  const { data: ads = [] } = useQuery<Advertisement[]>({
    queryKey: ['/api/advertisements'],
  });

  useEffect(() => {
    if (!ads.length) return;

    for (const ad of ads) {
      if (trackedViewIdsRef.current.has(ad.id)) {
        continue;
      }

      trackedViewIdsRef.current.add(ad.id);
      apiRequest('POST', `/api/advertisements/${ad.id}/view`, { source: 'play_carousel' }).catch(() => undefined);
    }
  }, [ads]);

  const handleAdClick = useCallback(async (ad: Advertisement) => {
    if (!ad.targetUrl) {
      return;
    }

    try {
      const res = await apiRequest('POST', `/api/advertisements/${ad.id}/click`, { source: 'play_carousel' });
      const payload = typeof res?.json === 'function' ? await res.json() : null;
      const target = typeof payload?.targetUrl === 'string' && payload.targetUrl ? payload.targetUrl : ad.targetUrl;
      window.open(target, '_blank', 'noopener,noreferrer');
    } catch {
      window.open(ad.targetUrl, '_blank', 'noopener,noreferrer');
    }
  }, []);

  const autoplayPlugin = useRef(
    Autoplay({ delay: 5000, stopOnInteraction: false })
  );

  if (ads.length === 0) return null;

  return (
    <Card className="overflow-hidden">
      <Carousel
        plugins={[autoplayPlugin.current]}
        className="w-full"
        opts={{ loop: true }}
      >
        <CarouselContent>
          {ads.map((ad) => (
            <CarouselItem key={ad.id}>
              <div className="relative aspect-[21/9] w-full">
                {ad.type === 'image' && ad.assetUrl && (
                  <button
                    type="button"
                    onClick={() => handleAdClick(ad)}
                    className="block w-full h-full text-start"
                  >
                    <img
                      src={ad.assetUrl}
                      alt={language === 'ar' ? (ad.titleAr || ad.title) : ad.title}
                      loading="lazy"
                      className="w-full h-full object-cover rounded-lg"
                    />
                  </button>
                )}
                {ad.type === 'video' && ad.assetUrl && (
                  <video
                    src={ad.assetUrl}
                    autoPlay
                    muted
                    loop
                    className="w-full h-full object-cover rounded-lg"
                  />
                )}
                {ad.type === 'link' && ad.targetUrl && (
                  <button
                    type="button"
                    onClick={() => handleAdClick(ad)}
                    className="flex items-center justify-center w-full h-full bg-primary/10 rounded-lg hover:bg-primary/20 transition-colors"
                  >
                    <div className="text-center p-4">
                      <Megaphone className="w-12 h-12 mx-auto mb-2 text-primary" />
                      <p className="font-medium">{language === 'ar' ? (ad.titleAr || ad.title) : ad.title}</p>
                    </div>
                  </button>
                )}
                {ad.type === 'embed' && ad.embedCode && (
                  <div
                    className="w-full h-full rounded-lg overflow-hidden"
                    dangerouslySetInnerHTML={{ __html: sanitizeHtml(ad.embedCode) }}
                  />
                )}
              </div>
            </CarouselItem>
          ))}
        </CarouselContent>
        <CarouselPrevious className="start-2" />
        <CarouselNext className="end-2" />
      </Carousel>
    </Card>
  );
}

// Most Played Games Section
function MostPlayedSection({ onSelectGame }: { onSelectGame: (game: Game) => void }) {
  const { language } = useI18n();
  const [isExpanded, setIsExpanded] = useState(true);

  const { data: mostPlayedGames = [], isLoading } = useQuery<Game[]>({
    queryKey: ['/api/games/most-played'],
  });

  if (isLoading) {
    return (
      <Card className="border rounded-lg bg-card/50">
        <div className="flex items-center gap-3 px-4 py-3">
          <Skeleton className="w-8 h-8 rounded-full" />
          <Skeleton className="h-5 w-32" />
        </div>
      </Card>
    );
  }

  if (mostPlayedGames.length === 0) return null;

  return (
    <Card className="border rounded-lg bg-gradient-to-r from-primary/10 to-transparent">
      <div className="flex items-center justify-between px-4 py-3">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded-full bg-primary/20 flex items-center justify-center">
            <Trophy className="w-4 h-4 text-primary" />
          </div>
          <span className="font-medium">
            {language === 'ar' ? 'الأكثر لعباً' : 'Most Played'}
          </span>
          <Badge variant="default" className="text-xs">
            {mostPlayedGames.length}
          </Badge>
        </div>
        <Button
          variant="ghost"
          size="sm"
          className="gap-1"
          onClick={() => setIsExpanded(!isExpanded)}
          data-testid="button-toggle-most-played"
        >
          {isExpanded ? (
            <>
              <span className="text-sm">{language === 'ar' ? 'إخفاء' : 'Hide'}</span>
              <ChevronUp className="h-4 w-4" />
            </>
          ) : (
            <>
              <span className="text-sm">{language === 'ar' ? 'إظهار المزيد' : 'Show More'}</span>
              <ChevronDown className="h-4 w-4" />
            </>
          )}
        </Button>
      </div>
      {isExpanded && (
        <div className="px-2 pb-3">
          <HorizontalGameScroll
            games={mostPlayedGames}
            onSelectGame={onSelectGame}
          />
        </div>
      )}
    </Card>
  );
}

// Voice Chat Component for Multiplayer Games
function VoiceChat({
  matchId,
  isActive,
  onToggle
}: {
  matchId: string;
  isActive: boolean;
  onToggle: () => void;
}) {
  const [isMicMuted, setIsMicMuted] = useState(false);

  return (
    <SharedVoiceChat
      challengeId={matchId}
      isEnabled={isActive}
      onToggle={onToggle}
      isMicMuted={isMicMuted}
      onMicMuteToggle={() => setIsMicMuted((previous) => !previous)}
      role="player"
    />
  );
}

// Task #139: shape returned by GET /api/gameplay/messages/:matchId.
// Mirrors the server response (drizzle row + relations: sender + emoji),
// loosely typed to optional fields because text messages have no emoji
// payload and vice-versa. Used by `buildRenderableChatStream` below.
interface HistoryGameplayMessage {
  id: string;
  matchId: string;
  senderId: string;
  message: string | null;
  emojiId: string | null;
  isEmoji: boolean;
  emojiCost: string | null;
  createdAt: string | Date | null;
  sender?: { id: string; username: string; profilePicture?: string | null } | null;
  emoji?: { id: string; emoji: string; price: string } | null;
}

// Shape returned by POST /api/gameplay/messages — same as a history row
// but the `emoji` relation is always inlined when isEmoji is true.
interface EmojiSendResponse extends HistoryGameplayMessage { }

interface EmojiBubble {
  messageId: string;
  emojiId: string;
  emoji: string;
  price: string;
  ts: number;
  /** "me" so the renderer can right-align the sender's own bubble. */
  fromUserId: string;
}

interface RenderableChatMessage {
  /** Stable React key + de-dup identity. */
  key: string;
  ts: number;
  isOwn: boolean;
  kind: 'text' | 'emoji';
  text?: string;
  emoji?: string;
  emojiCost?: string;
}

// Task #139: merge the three message sources (history / realtime /
// local emoji sends) into a single ordered, de-duplicated stream the
// renderer iterates. Stable ordering by ts; ties resolved by source
// priority (history first → realtime second → local last) so a reload
// doesn't reorder existing bubbles. De-dup keys:
//   - History: `gameplay_messages.id`
//   - Realtime emoji: `gameplayEmoji.messageId` (same id as history)
//   - Realtime text: `clientMsgId` if present, else
//     `${fromUserId}-${ts}-${text}` as a session-stable fallback
//   - Local emoji: `messageId` (same id as history once persisted)
function buildRenderableChatStream(args: {
  history: HistoryGameplayMessage[];
  realtime: ChatBroadcast[];
  localEmojiSends: EmojiBubble[];
  ownUserId?: string;
}): RenderableChatMessage[] {
  const seen = new Set<string>();
  const out: RenderableChatMessage[] = [];

  const pushUnique = (key: string, msg: RenderableChatMessage) => {
    if (seen.has(key)) return;
    seen.add(key);
    out.push(msg);
  };

  for (const h of args.history) {
    const key = h.id;
    const ts = h.createdAt ? new Date(h.createdAt).getTime() : 0;
    const isOwn = args.ownUserId ? h.senderId === args.ownUserId : false;
    if (h.isEmoji) {
      pushUnique(key, {
        key,
        ts,
        isOwn,
        kind: 'emoji',
        emoji: h.emoji?.emoji ?? '😊',
        emojiCost: h.emojiCost ?? undefined,
      });
    } else {
      pushUnique(key, {
        key,
        ts,
        isOwn,
        kind: 'text',
        text: h.message ?? '',
      });
    }
  }

  for (const r of args.realtime) {
    if (r.gameplayEmoji) {
      const key = r.gameplayEmoji.messageId;
      pushUnique(key, {
        key,
        ts: r.ts,
        isOwn: args.ownUserId ? r.fromUserId === args.ownUserId : false,
        kind: 'emoji',
        emoji: r.gameplayEmoji.emoji,
        emojiCost: r.gameplayEmoji.price,
      });
    } else {
      // Dedup priority: persisted DB id (set by `match-chat-bridge.ts`
      // for casual-match text broadcasts — collapses against the
      // history row a reconnect refetch returns) → clientMsgId (echo
      // for our own optimistic sends from other transports) →
      // sender+ts+text fallback (session-stable for realtime-only
      // bubbles that never have either id).
      const key = r.messageId
        ? r.messageId
        : r.clientMsgId
          ? `c:${r.clientMsgId}`
          : `t:${r.fromUserId}:${r.ts}:${r.text}`;
      pushUnique(key, {
        key,
        ts: r.ts,
        isOwn: args.ownUserId ? r.fromUserId === args.ownUserId : false,
        kind: 'text',
        text: r.text,
      });
    }
  }

  for (const e of args.localEmojiSends) {
    pushUnique(e.messageId, {
      key: e.messageId,
      ts: e.ts,
      isOwn: true,
      kind: 'emoji',
      emoji: e.emoji,
      emojiCost: e.price,
    });
  }

  out.sort((a, b) => a.ts - b.ts);
  return out;
}

// In-game Chat with Emoji Picker
function InGameChat({
  matchId,
  userBalance
}: {
  matchId: string;
  userBalance: number;
}) {
  const { language, t } = useI18n();
  const { toast } = useToast();
  const { user } = useAuth();
  const [message, setMessage] = useState('');
  const [showEmojiPicker, setShowEmojiPicker] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  const { data: emojis } = useQuery<GameplayEmoji[]>({
    queryKey: ['/api/gameplay/emojis'],
  });

  // Task #139: chat history is fetched on mount and again whenever the
  // browser reconnects to the network (no more 2s polling). After the
  // initial hydration, new text messages arrive over the realtime
  // socket (`realtimeChat.messages`) and emoji sends append the REST
  // response locally. The reconnect refetch is the safety net for two
  // separate failure modes the architect review flagged:
  //   1. Brief client-side socket disconnect → any text or emoji sent
  //      while we were offline is replayed via the persisted
  //      `gameplay_messages` history list (the renderer's de-dup keys
  //      collapse it against bubbles we already showed).
  //   2. Best-effort emoji fan-out from the REST handler fails for the
  //      peer (e.g. transient Redis adapter hiccup) → the peer's next
  //      socket reconnect triggers this refetch and the missed emoji
  //      bubble appears without a manual reload.
  // We additionally fire a manual refetch whenever the socket layer
  // itself reports a fresh `connected` transition (see effect below),
  // because tab-foregrounding on mobile can re-establish the socket
  // without firing a window-level `online` event.
  const { data: historyMessages, refetch: refetchHistory } = useQuery<HistoryGameplayMessage[]>({
    queryKey: ['/api/gameplay/messages', matchId],
    refetchInterval: false,
    refetchOnWindowFocus: false,
    refetchOnReconnect: true,
    staleTime: Infinity,
  });

  // Task #139: realtime chat — now the SOLE delivery path for casual-match
  // text messages (replacing the 2s `useQuery` polling). Same hook the
  // challenge in-game chat uses (Task #9), and the same `match:` room
  // namespace introduced in Task #109. Server authz still routes
  // `match:<gameMatchId>` through `gameMatches.player1Id/player2Id`
  // (server/socketio/index.ts `isUserAllowedInRoom`).
  //
  // The hook continues to surface `viewerCount` + block-list-filtered
  // `viewers` (Task #75 / Task #109) for the chat header pill.
  const onRealtimeError = useCallback(
    (info: { code: ChatErrorCode; reason?: string }) => {
      // Same code → toast map the challenge in-game chat uses, so
      // server-side semantic failures (rate_limit, no_session, ...)
      // surface the same way regardless of which page sent the message.
      const fallback = language === 'ar' ? 'تعذّر إرسال الرسالة' : 'Could not send message';
      const map: Record<ChatErrorCode, string | null> = {
        rate_limit: language === 'ar'
          ? 'أبطئ قليلًا — رسائل كثيرة جدًا'
          : 'Slow down — too many messages',
        spectator_not_seated: null, // not reachable on `match:` rooms
        spectator_readonly: null,   // not reachable on `match:` rooms
        spectator_full: null,       // not reachable on `match:` rooms
        no_session: language === 'ar'
          ? 'هذه المباراة لم تعد متاحة'
          : 'This match is no longer available',
        empty: '',
        disconnected: language === 'ar'
          ? 'الاتصال غير جاهز الآن'
          : 'Connection is not ready right now',
        invalid: null,
        not_in_room: null,
        no_room: null,
        failed: null,
        server: null,
        auth: null,
        forbidden: null,
      };
      const msg = map[info.code] ?? fallback;
      if (!msg) return;
      toast({
        title: language === 'ar' ? 'خطأ' : 'Error',
        description: msg,
        variant: 'destructive',
      });
    },
    [language, toast],
  );
  const realtimeChat = useSocketChat({
    roomId: matchId ? `match:${matchId}` : null,
    onError: onRealtimeError,
    // The hook defaults to 100 messages, which is enough for a normal
    // match but can drop bubbles in long sessions (e.g. casual rooms
    // where two friends chat across many rounds). With history fetch
    // now one-shot, we lift the in-memory cap so realtime stays
    // authoritative for the whole session; reconnect refetch is the
    // safety net if anything still gets evicted.
    historyLimit: 1000,
  });
  const headerViewerCount = realtimeChat.viewerCountReceived
    ? realtimeChat.viewerCount
    : 0;

  // Task #139 (architect follow-up): catch-up refetch on socket reconnect.
  // We only refetch on the false→true transition so we don't slam the
  // history endpoint while the socket churns during slow networks.
  // Initial mount is already covered by useQuery's first fetch, so we
  // skip the very first `connected = true` to avoid a duplicate request.
  const wasConnectedRef = useRef(false);
  const didMountRef = useRef(false);
  useEffect(() => {
    if (!didMountRef.current) {
      didMountRef.current = true;
      wasConnectedRef.current = realtimeChat.connected;
      return;
    }
    if (realtimeChat.connected && !wasConnectedRef.current) {
      void refetchHistory();
    }
    wasConnectedRef.current = realtimeChat.connected;
  }, [realtimeChat.connected, refetchHistory]);

  // Task #139 (architect follow-up): defensive — if `InGameChat` is
  // ever reused across match transitions without a remount, drop the
  // optimistic emoji buffer so we never bleed bubbles from match A
  // into match B. matchId IS already in the history queryKey (so RQ
  // resets there automatically), but `localEmojiSends` lives in
  // component state, hence this manual reset.
  // (No-op on first mount since the buffer starts empty.)
  // Placed BEFORE the buffer's declaration so the effect runs after
  // every mount lifecycle that changes matchId.
  // -- declaration follows --
  // Task #139: optimistically-added emoji sends from this client. The
  // REST `/api/gameplay/messages` endpoint still owns the balance debit
  // (it runs in a row-locked transaction), so emojis aren't sent over
  // the socket. We insert the REST response into this buffer so the
  // sender's bubble appears instantly without re-fetching the whole
  // history list. Peers receive the same emoji via the new
  // `chat:message` fan-out from the REST handler (broadcast carries
  // `gameplayEmoji` metadata) so they don't need a refetch either.
  const [localEmojiSends, setLocalEmojiSends] = useState<EmojiBubble[]>([]);
  useEffect(() => {
    setLocalEmojiSends([]);
  }, [matchId]);

  const sendEmojiMutation = useMutation({
    mutationFn: async (data: { matchId: string; emojiId: string }) => {
      const res = await apiRequest('POST', '/api/gameplay/messages', {
        ...data,
        isEmoji: true,
      });
      return (await res.json()) as EmojiSendResponse;
    },
    onSuccess: (saved) => {
      // Append the saved emoji to our local buffer so it renders
      // immediately. The peer will see the same emoji via the
      // server-side socket broadcast, also keyed by message id, so
      // both sides converge without polling.
      setLocalEmojiSends((prev) => [
        ...prev,
        {
          messageId: saved.id,
          emojiId: saved.emoji?.id ?? '',
          emoji: saved.emoji?.emoji ?? '😊',
          price: saved.emoji?.price ?? saved.emojiCost ?? '0',
          ts: saved.createdAt ? new Date(saved.createdAt).getTime() : Date.now(),
          fromUserId: 'me',
        },
      ]);
      queryClient.invalidateQueries({ queryKey: ['/api/user'] });
    },
    onError: (error: Error) => {
      toast({
        title: language === 'ar' ? 'خطأ' : 'Error',
        description: error.message,
        variant: 'destructive',
      });
    },
  });

  const handleSendMessage = async () => {
    const trimmed = message.trim();
    if (!trimmed) return;
    // Optimistically clear the input so the user can keep typing —
    // server-side errors will toast through `onRealtimeError`.
    setMessage('');
    const ack = await realtimeChat.send(trimmed);
    if (!ack.ok && ack.error !== 'empty') {
      // Restore the unsent text so the user can retry without
      // re-typing. Toasts are emitted by `onRealtimeError`.
      setMessage((prev) => (prev ? prev : trimmed));
    }
  };

  const handleSendEmoji = (emoji: GameplayEmoji) => {
    const price = parseFloat(emoji.price);
    if (userBalance < price) {
      toast({
        title: language === 'ar' ? 'رصيد غير كافي' : 'Insufficient Balance',
        description: language === 'ar'
          ? `تحتاج $${price.toFixed(2)} لإرسال هذا الإيموجي`
          : `You need $${price.toFixed(2)} to send this emoji`,
        variant: 'destructive',
      });
      return;
    }

    sendEmojiMutation.mutate({
      matchId,
      emojiId: emoji.id,
    });
    setShowEmojiPicker(false);
  };

  // Task #139: build the unified message stream the renderer iterates.
  // Three sources, sorted by ts so insertion order matches arrival
  // order regardless of which transport delivered the bubble:
  //   1. Persisted history (one-shot REST fetch on mount)
  //   2. Realtime socket broadcasts (text + peer emojis)
  //   3. Local emoji sends (REST response — ours; instant echo)
  // De-duplication keys:
  //   - History rows: `gameplay_messages.id`
  //   - Realtime emoji broadcasts: `gameplayEmoji.messageId` (same id
  //     as the persisted row, so reload doesn't double-show)
  //   - Realtime text broadcasts: `clientMsgId` if present (skips our
  //     own ack echo); otherwise `${fromUserId}-${ts}-${text}` is
  //     stable enough across the session.
  //   - Local emoji sends: `messageId` (same as history id once a
  //     reload happens — dedupe just in case the same id is in both).
  const renderMessages = buildRenderableChatStream({
    history: historyMessages || [],
    realtime: realtimeChat.messages,
    localEmojiSends,
    ownUserId: user?.id,
  });

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [renderMessages.length]);

  return (
    <div className="flex flex-col h-full bg-background/95 backdrop-blur-sm rounded-lg border">
      <div className="flex items-center justify-between p-3 border-b">
        <h3 className="font-medium flex items-center gap-2">
          <MessageCircle className="w-4 h-4" />
          {language === 'ar' ? 'الدردشة' : 'Chat'}
        </h3>
        {/* Task #109: "who's watching" pill — same component the challenge
            in-game chat uses (Task #75), so the avatar stack + popover
            behavior (≤3 avatars, "+N" overflow, profile links, fail-closed
            privacy) is identical here. Only rendered when the realtime
            socket has actually reported at least one viewer for this room
            so the header stays clean for empty matches. */}
        {headerViewerCount > 0 && (
          <ChatViewerCountPill
            spectatorCount={headerViewerCount}
            spectatorViewers={realtimeChat.viewers}
            language={language}
          />
        )}
      </div>

      <ScrollArea className="flex-1 p-3">
        <div className="space-y-2">
          {renderMessages.map((msg) => (
            <div
              key={msg.key}
              className={`flex ${msg.isOwn ? 'justify-end' : 'justify-start'}`}
              data-testid={`chat-message-${msg.key}`}
            >
              <div className={`max-w-[80%] rounded-lg p-2 ${msg.kind === 'emoji' ? 'bg-transparent text-4xl' : 'bg-muted'}`}>
                {msg.kind === 'emoji' ? (
                  <span className="text-3xl">{msg.emoji || '😊'}</span>
                ) : (
                  <p className="text-sm">{msg.text}</p>
                )}
                {msg.kind === 'emoji' && msg.emojiCost && (
                  <span className="text-xs text-muted-foreground">-${parseFloat(msg.emojiCost).toFixed(2)}</span>
                )}
              </div>
            </div>
          ))}
          <div ref={messagesEndRef} />
        </div>
      </ScrollArea>

      {showEmojiPicker && (
        <div className="p-3 border-t max-h-48 overflow-y-auto">
          <div className="grid grid-cols-5 gap-2">
            {emojis?.map((emoji) => (
              <Button
                key={emoji.id}
                variant="ghost"
                size="sm"
                className="flex flex-col items-center p-2 h-auto"
                onClick={() => handleSendEmoji(emoji)}
                disabled={sendEmojiMutation.isPending}
                data-testid={`button-emoji-${emoji.id}`}
              >
                <span className="text-2xl">{emoji.emoji}</span>
                <span className="text-xs text-muted-foreground">${parseFloat(emoji.price).toFixed(2)}</span>
              </Button>
            ))}
          </div>
        </div>
      )}

      <div className="p-3 border-t flex gap-2">
        <Button
          variant="ghost"
          size="icon"
          onClick={() => setShowEmojiPicker(!showEmojiPicker)}
          data-testid="button-toggle-emoji-picker"
        >
          <span className="text-xl">😊</span>
        </Button>
        <Input
          value={message}
          onChange={(e) => setMessage(e.target.value)}
          placeholder={language === 'ar' ? 'اكتب رسالة...' : 'Type a message...'}
          onKeyPress={(e) => e.key === 'Enter' && handleSendMessage()}
          className="flex-1"
          data-testid="input-chat-message"
        />
        <Button
          size="icon"
          onClick={handleSendMessage}
          disabled={!message.trim() || !realtimeChat.connected}
          data-testid="button-send-message"
        >
          <Send className="h-4 w-4" />
        </Button>
      </div>
    </div>
  );
}

// Full-screen Gameplay Component
function FullScreenGameplay({
  game,
  matchId,
  user,
  onExit,
  children
}: {
  game: Game;
  matchId?: string;
  user: User | undefined;
  onExit: () => void;
  children: React.ReactNode;
}) {
  const { language } = useI18n();
  const [isFullScreen, setIsFullScreen] = useState(false);
  const [showChat, setShowChat] = useState(true);
  const [voiceChatActive] = useState(true);
  const containerRef = useRef<HTMLDivElement>(null);

  const exitFullScreen = useCallback(async () => {
    if (document.fullscreenElement) {
      try {
        await document.exitFullscreen();
      } catch (err) {
        console.error('Error exiting fullscreen:', err);
      }
    }
    setIsFullScreen(false);
  }, []);

  const toggleFullScreen = useCallback(async () => {
    if (!document.fullscreenElement) {
      try {
        await containerRef.current?.requestFullscreen();
        setIsFullScreen(true);
      } catch (err) {
        console.error('Error entering fullscreen:', err);
      }
    } else {
      await exitFullScreen();
    }
  }, [exitFullScreen]);

  const handleExit = useCallback(async () => {
    await exitFullScreen();
    onExit();
  }, [exitFullScreen, onExit]);

  useEffect(() => {
    const handleFullscreenChange = () => {
      setIsFullScreen(!!document.fullscreenElement);
    };

    document.addEventListener('fullscreenchange', handleFullscreenChange);
    return () => {
      document.removeEventListener('fullscreenchange', handleFullscreenChange);
      // Exit fullscreen on unmount
      if (document.fullscreenElement) {
        document.exitFullscreen().catch(() => { });
      }
    };
  }, []);

  const userBalance = parseFloat(user?.balance || '0');

  return (
    <div
      ref={containerRef}
      className={`${isFullScreen ? 'fixed inset-0 z-50 bg-background' : 'relative'} flex flex-col`}
    >
      {/* Header */}
      <div className="flex items-center justify-between p-3 border-b bg-background/95 backdrop-blur-sm">
        <div className="flex items-center gap-3">
          <Button
            variant="ghost"
            size="icon"
            onClick={handleExit}
            data-testid="button-exit-game"
          >
            <X className="h-4 w-4" />
          </Button>
          <h2 className="font-bold">{game.name}</h2>
          <Badge variant="outline">{game.volatility}</Badge>
        </div>
        <div className="flex items-center gap-2">
          {matchId && (
            <>
              <VoiceChat
                matchId={matchId}
                isActive={voiceChatActive}
                onToggle={() => { }}
              />
              <div className="w-px h-6 bg-border mx-1" />
              <Button
                variant="ghost"
                size="icon"
                onClick={() => setShowChat(!showChat)}
                data-testid="button-toggle-chat"
              >
                <MessageCircle className={`h-4 w-4 ${showChat ? 'text-primary' : ''}`} />
              </Button>
            </>
          )}
          <Button
            variant="ghost"
            size="icon"
            onClick={toggleFullScreen}
            data-testid="button-toggle-fullscreen"
          >
            {isFullScreen ? <Minimize2 className="h-4 w-4" /> : <Maximize2 className="h-4 w-4" />}
          </Button>
        </div>
      </div>

      {/* Main Content */}
      <div className={`flex-1 flex ${isFullScreen ? 'h-[calc(100vh-60px)]' : ''}`}>
        {/* Game Area */}
        <div className={`flex-1 p-4 ${matchId && showChat ? 'md:w-2/3' : 'w-full'}`}>
          {children}
        </div>

        {/* Chat Panel - only show for multiplayer matches */}
        {matchId && showChat && (
          <div className="hidden md:block w-80 border-s">
            <InGameChat key={matchId} matchId={matchId} userBalance={userBalance} />
          </div>
        )}
      </div>

      {/* Mobile Chat (slide up) */}
      {matchId && showChat && (
        <div className="md:hidden fixed bottom-0 inset-x-0 h-64 border-t bg-background z-50">
          <InGameChat key={matchId} matchId={matchId} userBalance={userBalance} />
        </div>
      )}
    </div>
  );
}

function CrashGame({ isPlaying, result, betAmount, onPlay }: {
  isPlaying: boolean;
  result: Record<string, unknown>;
  betAmount: string;
  onPlay: () => void;
}) {
  const [multiplier, setMultiplier] = useState(1.00);
  const intervalRef = useRef<NodeJS.Timeout>();

  useEffect(() => {
    if (isPlaying) {
      setMultiplier(1.00);
      intervalRef.current = setInterval(() => {
        setMultiplier(m => {
          const increment = 0.01 + Math.random() * 0.05;
          return parseFloat((m + increment).toFixed(2));
        });
      }, 100);
    } else {
      clearInterval(intervalRef.current);
    }
    return () => clearInterval(intervalRef.current);
  }, [isPlaying]);

  return (
    <div className="space-y-4">
      <div className="aspect-video rounded-lg bg-gradient-to-br from-background to-muted flex items-center justify-center border">
        <div className="text-center">
          <div className={`text-5xl font-bold tabular-nums ${result ? (result.won ? 'text-green-500' : 'text-red-500') : ''}`}>
            {result ? `${result.multiplier}x` : `${multiplier.toFixed(2)}x`}
          </div>
          {result && (
            <div className={`text-lg mt-2 ${result.won ? 'text-green-500' : 'text-red-500'}`}>
              {result.won ? `+$${result.winAmount}` : `-$${betAmount}`}
            </div>
          )}
        </div>
      </div>
      <Button
        className="w-full"
        size="lg"
        onClick={onPlay}
        disabled={isPlaying}
        data-testid="button-crash-play"
      >
        <Zap className="w-4 h-4 me-2" />
        {isPlaying ? 'CASH OUT' : 'START GAME'}
      </Button>
    </div>
  );
}

function DiceGame({ isPlaying, result, betAmount, onPlay }: {
  isPlaying: boolean;
  result: Record<string, unknown>;
  betAmount: string;
  onPlay: (prediction: string, target: number) => void;
}) {
  const [target, setTarget] = useState(50);
  const [prediction, setPrediction] = useState<'over' | 'under'>('over');
  const [diceValue, setDiceValue] = useState(0);

  useEffect(() => {
    if (result) {
      setDiceValue((result.diceResult as number) || Math.floor(Math.random() * 100));
    }
  }, [result]);

  return (
    <div className="space-y-4">
      <div className="flex gap-2 mb-4">
        <Button
          variant={prediction === 'under' ? 'default' : 'outline'}
          className="flex-1"
          onClick={() => setPrediction('under')}
          data-testid="button-dice-under"
        >
          Under
        </Button>
        <Button
          variant={prediction === 'over' ? 'default' : 'outline'}
          className="flex-1"
          onClick={() => setPrediction('over')}
          data-testid="button-dice-over"
        >
          Over
        </Button>
      </div>

      <div className="space-y-2">
        <div className="flex justify-between text-sm">
          <span>Target: {target}</span>
          <span>Win Chance: {prediction === 'over' ? 100 - target : target}%</span>
        </div>
        <Input
          type="range"
          min="1"
          max="99"
          value={target}
          onChange={(e) => setTarget(parseInt(e.target.value))}
          className="w-full"
          data-testid="input-dice-target"
        />
      </div>

      <div className="aspect-square max-w-32 mx-auto rounded-xl bg-gradient-to-br from-background to-muted flex items-center justify-center border">
        <div className={`text-4xl font-bold ${result ? (result.won ? 'text-green-500' : 'text-red-500') : ''}`}>
          {result ? diceValue : '?'}
        </div>
      </div>

      <Button
        className="w-full"
        size="lg"
        onClick={() => onPlay(prediction, target)}
        disabled={isPlaying}
        data-testid="button-dice-roll"
      >
        <Dices className="w-4 h-4 me-2" />
        {isPlaying ? 'ROLLING...' : 'ROLL DICE'}
      </Button>
    </div>
  );
}

function WheelGame({ isPlaying, result, onPlay }: {
  isPlaying: boolean;
  result: Record<string, unknown>;
  onPlay: () => void;
}) {
  const [rotation, setRotation] = useState(0);

  useEffect(() => {
    if (isPlaying) {
      setRotation(r => r + 720 + Math.random() * 360);
    }
  }, [isPlaying]);

  return (
    <div className="space-y-4">
      <div className="aspect-square max-w-48 mx-auto relative">
        <div
          className="w-full h-full rounded-full border-4 border-border bg-gradient-conic from-red-500 via-yellow-500 via-green-500 via-blue-500 to-red-500 transition-transform duration-[3000ms] ease-out"
          style={{ transform: `rotate(${rotation}deg)` }}
        />
        <div className="absolute top-0 left-1/2 -translate-x-1/2 -translate-y-1 w-0 h-0 border-l-8 border-r-8 border-b-8 border-transparent border-b-foreground" />
        {result && (
          <div className="absolute inset-0 flex items-center justify-center">
            <div className={`text-2xl font-bold ${result.won ? 'text-green-500' : 'text-red-500'}`}>
              {String(result.multiplier)}x
            </div>
          </div>
        )}
      </div>
      <Button
        className="w-full"
        size="lg"
        onClick={onPlay}
        disabled={isPlaying}
        data-testid="button-wheel-spin"
      >
        <CircleDot className="w-4 h-4 me-2" />
        {isPlaying ? 'SPINNING...' : 'SPIN WHEEL'}
      </Button>
    </div>
  );
}

function SlotsGame({ isPlaying, result, onPlay }: {
  isPlaying: boolean;
  result: Record<string, unknown>;
  onPlay: () => void;
}) {
  const symbols = ['7', 'BAR', 'CHERRY', 'LEMON', 'BELL'];
  const [reels, setReels] = useState(['?', '?', '?']);

  useEffect(() => {
    if (isPlaying) {
      const interval = setInterval(() => {
        setReels([
          symbols[Math.floor(Math.random() * symbols.length)],
          symbols[Math.floor(Math.random() * symbols.length)],
          symbols[Math.floor(Math.random() * symbols.length)],
        ]);
      }, 100);
      setTimeout(() => clearInterval(interval), 2000);
      return () => clearInterval(interval);
    }
  }, [isPlaying]);

  return (
    <div className="space-y-4">
      <div className="flex justify-center gap-2">
        {reels.map((symbol, i) => (
          <div
            key={i}
            className="w-20 h-24 rounded-lg bg-gradient-to-b from-background to-muted border-2 flex items-center justify-center text-2xl font-bold"
          >
            {symbol}
          </div>
        ))}
      </div>
      {result && (
        <div className={`text-center text-xl font-bold ${result.won ? 'text-green-500' : 'text-red-500'}`}>
          {result.won ? `WIN ${result.multiplier}x` : 'TRY AGAIN'}
        </div>
      )}
      <Button
        className="w-full"
        size="lg"
        onClick={onPlay}
        disabled={isPlaying}
        data-testid="button-slots-spin"
      >
        <Star className="w-4 h-4 me-2" />
        {isPlaying ? 'SPINNING...' : 'SPIN SLOTS'}
      </Button>
    </div>
  );
}

function JackpotGame({ isPlaying, result, onPlay }: {
  isPlaying: boolean;
  result: Record<string, unknown>;
  onPlay: () => void;
}) {
  const [jackpotAmount, setJackpotAmount] = useState(15847.32);

  useEffect(() => {
    const interval = setInterval(() => {
      setJackpotAmount(a => a + Math.random() * 0.5);
    }, 1000);
    return () => clearInterval(interval);
  }, []);

  return (
    <div className="space-y-4">
      <div className="text-center p-6 rounded-lg bg-gradient-to-br from-yellow-500/20 to-orange-500/20 border-2 border-yellow-500/50">
        <div className="text-sm text-muted-foreground mb-1">JACKPOT</div>
        <div className="text-4xl font-bold text-yellow-500 tabular-nums">
          ${jackpotAmount.toFixed(2)}
        </div>
      </div>
      {result && (
        <div className={`text-center text-xl font-bold ${result.won ? 'text-green-500' : 'text-red-500'}`}>
          {result.won ? (result.jackpot ? 'JACKPOT!' : `WIN ${result.multiplier}x`) : 'NOT THIS TIME'}
        </div>
      )}
      <Button
        className="w-full"
        size="lg"
        onClick={onPlay}
        disabled={isPlaying}
        data-testid="button-jackpot-play"
      >
        <Trophy className="w-4 h-4 me-2" />
        {isPlaying ? 'PLAYING...' : 'TRY FOR JACKPOT'}
      </Button>
    </div>
  );
}

function HorizontalGameScroll({ games, onSelectGame }: {
  games: Game[];
  onSelectGame: (game: Game) => void;
}) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const { language, t } = useI18n();
  const [showLeftArrow, setShowLeftArrow] = useState(false);
  const [showRightArrow, setShowRightArrow] = useState(true);

  const checkScrollPosition = () => {
    if (scrollRef.current) {
      const { scrollLeft, scrollWidth, clientWidth } = scrollRef.current;
      setShowLeftArrow(scrollLeft > 0);
      setShowRightArrow(scrollLeft < scrollWidth - clientWidth - 10);
    }
  };

  const scroll = (direction: 'left' | 'right') => {
    if (scrollRef.current) {
      const scrollAmount = 300;
      scrollRef.current.scrollBy({
        left: direction === 'left' ? -scrollAmount : scrollAmount,
        behavior: 'smooth'
      });
    }
  };

  useEffect(() => {
    checkScrollPosition();
    const current = scrollRef.current;
    if (current) {
      current.addEventListener('scroll', checkScrollPosition);
      return () => current.removeEventListener('scroll', checkScrollPosition);
    }
  }, []);

  const isHotGame = (game: Game) => {
    return game.playCount && game.playCount > 100;
  };

  const isNewGame = (game: Game) => {
    if (!game.createdAt) return false;
    const createdDate = new Date(game.createdAt);
    const sevenDaysAgo = new Date();
    sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);
    return createdDate > sevenDaysAgo;
  };

  return (
    <div className="relative group">
      {showLeftArrow && (
        <Button
          variant="ghost"
          size="icon"
          className="absolute start-0 top-1/2 -translate-y-1/2 z-10 bg-background/80 backdrop-blur-sm shadow-md opacity-0 group-hover:opacity-100 transition-opacity"
          onClick={() => scroll('left')}
          data-testid="button-scroll-left"
        >
          <ChevronLeft className="h-4 w-4 rtl:rotate-180" />
        </Button>
      )}

      <div
        ref={scrollRef}
        className="flex gap-3 overflow-x-auto scrollbar-hide py-2 px-1"
        style={{ scrollbarWidth: 'none', msOverflowStyle: 'none' }}
      >
        {games.map((game) => (
          <Card
            key={game.id}
            className="flex-shrink-0 w-40 cursor-pointer hover-elevate"
            onClick={() => onSelectGame(game)}
            data-testid={`card-game-${game.id}`}
          >
            <CardContent className="p-3">
              <div className="aspect-square rounded-lg bg-gradient-to-br from-muted to-muted/50 mb-2 flex items-center justify-center relative">
                <Gamepad2 className="w-8 h-8 text-muted-foreground" />
                <div className="absolute top-1 end-1 flex flex-col gap-1">
                  {isHotGame(game) && (
                    <Badge variant="destructive" className="text-xs">
                      {t('play.hotGame')}
                    </Badge>
                  )}
                  {isNewGame(game) && (
                    <Badge className="text-xs bg-green-500 text-white">
                      {t('play.newGame')}
                    </Badge>
                  )}
                </div>
              </div>
              <h3 className="font-medium text-sm truncate">{game.name}</h3>
              <p className="text-xs text-muted-foreground">RTP: {game.rtp}%</p>
            </CardContent>
          </Card>
        ))}
      </div>

      {showRightArrow && (
        <Button
          variant="ghost"
          size="icon"
          className="absolute end-0 top-1/2 -translate-y-1/2 z-10 bg-background/80 backdrop-blur-sm shadow-md opacity-0 group-hover:opacity-100 transition-opacity"
          onClick={() => scroll('right')}
          data-testid="button-scroll-right"
        >
          <ChevronRight className="h-4 w-4 rtl:rotate-180" />
        </Button>
      )}
    </div>
  );
}

interface AnnouncementWithViewed extends Announcement {
  isViewed?: boolean;
}

function AnnouncementsBanner() {
  const { language, t } = useI18n();
  const { toast } = useToast();
  const [selectedAnnouncement, setSelectedAnnouncement] = useState<AnnouncementWithViewed | null>(null);

  const { data: announcements, isLoading } = useQuery<AnnouncementWithViewed[]>({
    queryKey: ['/api/announcements'],
  });

  const markAsViewedMutation = useMutation({
    mutationFn: async (id: string) => {
      return apiRequest('POST', `/api/announcements/${id}/view`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/announcements'] });
      toast({
        title: t('common.success'),
        description: t('announcements.markAsViewed'),
      });
    },
  });

  if (isLoading) {
    return (
      <div className="space-y-2">
        <Skeleton className="h-6 w-40" />
        <Skeleton className="h-40" />
      </div>
    );
  }

  if (!announcements || announcements.length === 0) {
    return null;
  }

  const priorityOrder: Record<string, number> = { urgent: 3, high: 2, normal: 1, low: 0 };
  const sortedAnnouncements = [...announcements].sort((a, b) => {
    if (a.isPinned && !b.isPinned) return -1;
    if (!a.isPinned && b.isPinned) return 1;
    return (priorityOrder[b.priority] ?? 0) - (priorityOrder[a.priority] ?? 0);
  });

  const handleMarkAsViewed = (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    markAsViewedMutation.mutate(id);
  };

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between gap-4 flex-wrap">
        <h2 className="text-lg font-semibold flex items-center gap-2">
          <Megaphone className="w-5 h-5" />
          {t('announcements.title')}
        </h2>
      </div>

      <Carousel
        opts={{
          align: "start",
          loop: announcements.length > 1,
        }}
        className="w-full"
      >
        <CarouselContent>
          {sortedAnnouncements.map((announcement) => (
            <CarouselItem
              key={announcement.id}
              className="md:basis-1/2 lg:basis-1/3"
            >
              <Card
                className="cursor-pointer hover-elevate relative"
                onClick={() => setSelectedAnnouncement(announcement)}
                data-testid={`card-announcement-${announcement.id}`}
              >
                {announcement.imageUrl && (
                  <div className="aspect-video w-full overflow-hidden rounded-t-lg">
                    <img
                      src={announcement.imageUrl}
                      alt={language === 'ar' && announcement.titleAr ? announcement.titleAr : announcement.title}
                      loading="lazy"
                      className="w-full h-full object-cover"
                    />
                  </div>
                )}
                <CardContent className="p-4">
                  <div className="flex items-start justify-between gap-2 mb-2">
                    <h3 className="font-medium line-clamp-2">
                      {language === 'ar' && announcement.titleAr ? announcement.titleAr : announcement.title}
                    </h3>
                    <div className="flex gap-1 flex-shrink-0">
                      {announcement.isPinned && (
                        <Badge variant="secondary" className="text-xs">
                          <Pin className="w-3 h-3 me-1" />
                          {t('announcements.pinned')}
                        </Badge>
                      )}
                      {!announcement.isViewed && (
                        <Badge className="text-xs bg-blue-500 text-white">
                          {t('announcements.new')}
                        </Badge>
                      )}
                    </div>
                  </div>
                  <p className="text-sm text-muted-foreground line-clamp-2">
                    {language === 'ar' && announcement.contentAr ? announcement.contentAr : announcement.content}
                  </p>
                  <div className="flex items-center justify-between gap-2 mt-3">
                    <Button
                      variant="ghost"
                      size="sm"
                      className="text-xs"
                      data-testid={`button-read-more-${announcement.id}`}
                    >
                      {t('announcements.readMore')}
                    </Button>
                    {!announcement.isViewed && (
                      <Button
                        variant="outline"
                        size="sm"
                        className="text-xs"
                        onClick={(e) => handleMarkAsViewed(announcement.id, e)}
                        disabled={markAsViewedMutation.isPending}
                        data-testid={`button-mark-viewed-${announcement.id}`}
                      >
                        <Eye className="w-3 h-3 me-1" />
                        {t('announcements.markAsViewed')}
                      </Button>
                    )}
                  </div>
                </CardContent>
              </Card>
            </CarouselItem>
          ))}
        </CarouselContent>
        {announcements.length > 1 && (
          <>
            <CarouselPrevious className="hidden md:flex" data-testid="button-carousel-prev" />
            <CarouselNext className="hidden md:flex" data-testid="button-carousel-next" />
          </>
        )}
      </Carousel>

      <Dialog open={!!selectedAnnouncement} onOpenChange={() => setSelectedAnnouncement(null)}>
        <DialogContent className="max-w-lg" data-testid="dialog-announcement">
          <DialogHeader>
            <div className="flex items-center gap-2 flex-wrap">
              <DialogTitle>
                {selectedAnnouncement && (language === 'ar' && selectedAnnouncement.titleAr ? selectedAnnouncement.titleAr : selectedAnnouncement?.title)}
              </DialogTitle>
              {selectedAnnouncement?.isPinned && (
                <Badge variant="secondary" className="text-xs">
                  <Pin className="w-3 h-3 me-1" />
                  {t('announcements.pinned')}
                </Badge>
              )}
            </div>
          </DialogHeader>
          {selectedAnnouncement?.imageUrl && (
            <div className="aspect-video w-full overflow-hidden rounded-lg">
              <img
                src={selectedAnnouncement.imageUrl}
                alt={language === 'ar' && selectedAnnouncement.titleAr ? selectedAnnouncement.titleAr : selectedAnnouncement.title}
                loading="lazy"
                className="w-full h-full object-cover"
              />
            </div>
          )}
          <DialogDescription className="text-foreground whitespace-pre-wrap">
            {selectedAnnouncement && (language === 'ar' && selectedAnnouncement.contentAr ? selectedAnnouncement.contentAr : selectedAnnouncement?.content)}
          </DialogDescription>
          {selectedAnnouncement?.link && (
            <Button
              className="w-full"
              onClick={() => window.open(selectedAnnouncement.link!, '_blank')}
              data-testid="button-announcement-link"
            >
              {t('announcements.viewAll')}
            </Button>
          )}
          {selectedAnnouncement && !selectedAnnouncement.isViewed && (
            <Button
              variant="outline"
              onClick={(e) => {
                handleMarkAsViewed(selectedAnnouncement.id, e);
                setSelectedAnnouncement(null);
              }}
              disabled={markAsViewedMutation.isPending}
              data-testid="button-mark-viewed-dialog"
            >
              <CheckCircle className="w-4 h-4 me-2" />
              {t('announcements.markAsViewed')}
            </Button>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}

function AccountSummaryCard({ user }: { user: User | undefined }) {
  const { t } = useI18n();

  const totalWagered = parseFloat(user?.totalWagered || '0');
  const totalWon = parseFloat(user?.totalWon || '0');
  const vipLevel = user?.vipLevel || 1;

  return (
    <Card data-testid="card-account-summary">
      <CardHeader className="pb-2">
        <CardTitle className="text-lg flex items-center gap-2">
          <Wallet className="w-5 h-5" />
          {t('play.accountSummary')}
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="text-center p-4 rounded-lg bg-gradient-to-br from-primary/10 to-primary/5 border">
          <p className="text-sm text-muted-foreground mb-1">{t('play.yourBalance')}</p>
          <BalanceDisplay balance={user?.balance || '0'} variant="compact" />
        </div>

        <div className="grid grid-cols-3 gap-3">
          <div className="text-center p-3 rounded-lg bg-muted/50">
            <TrendingUp className="w-4 h-4 mx-auto mb-1 text-muted-foreground" />
            <p className="text-xs text-muted-foreground">{t('play.totalWagered')}</p>
            <p className="font-semibold text-sm" data-testid="text-total-wagered">
              ${totalWagered.toFixed(0)}
            </p>
          </div>
          <div className="text-center p-3 rounded-lg bg-muted/50">
            <Coins className="w-4 h-4 mx-auto mb-1 text-muted-foreground" />
            <p className="text-xs text-muted-foreground">{t('play.totalWon')}</p>
            <p className="font-semibold text-sm text-green-500" data-testid="text-total-won">
              ${totalWon.toFixed(0)}
            </p>
          </div>
          <div className="text-center p-3 rounded-lg bg-muted/50">
            <Crown className="w-4 h-4 mx-auto mb-1 text-yellow-500" />
            <p className="text-xs text-muted-foreground">{t('play.vipLevel')}</p>
            <p className="font-semibold text-sm" data-testid="text-vip-level">
              {vipLevel}
            </p>
          </div>
        </div>

        <div className="flex gap-2">
          <Button className="flex-1" size="sm" data-testid="button-deposit">
            <ArrowDownCircle className="w-4 h-4 me-2" />
            {t('play.deposit')}
          </Button>
          <Button variant="outline" className="flex-1" size="sm" data-testid="button-withdraw">
            <ArrowUpCircle className="w-4 h-4 me-2" />
            {t('play.withdraw')}
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}

function RecentActivitySection() {
  const { language, t } = useI18n();

  const { data: transactions, isLoading: transactionsLoading } = useQuery<Transaction[]>({
    queryKey: ['/api/transactions'],
  });

  const { data: gameSessions, isLoading: sessionsLoading } = useQuery<Array<{ id?: string; gameName?: string; createdAt?: string; result?: string; won?: boolean; amount?: string; multiplier?: number;[key: string]: unknown }>>({
    queryKey: ['/api/game-sessions'],
  });

  const recentTransactions = transactions?.slice(0, 5) || [];
  const recentSessions = gameSessions?.slice(0, 5) || [];

  const getTransactionIcon = (type: string) => {
    switch (type) {
      case 'deposit':
        return <ArrowDownCircle className="w-4 h-4 text-green-500" />;
      case 'withdrawal':
        return <ArrowUpCircle className="w-4 h-4 text-red-500" />;
      case 'game_win':
        return <Trophy className="w-4 h-4 text-yellow-500" />;
      case 'game_loss':
        return <Gamepad2 className="w-4 h-4 text-muted-foreground" />;
      default:
        return <CreditCard className="w-4 h-4 text-muted-foreground" />;
    }
  };

  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'completed':
        return <Badge variant="secondary" className="text-xs bg-green-500/20 text-green-600">{status}</Badge>;
      case 'pending':
        return <Badge variant="secondary" className="text-xs bg-yellow-500/20 text-yellow-600">{status}</Badge>;
      case 'rejected':
        return <Badge variant="secondary" className="text-xs bg-red-500/20 text-red-600">{status}</Badge>;
      default:
        return <Badge variant="secondary" className="text-xs">{status}</Badge>;
    }
  };

  if (transactionsLoading || sessionsLoading) {
    return (
      <Card>
        <CardHeader className="pb-2">
          <Skeleton className="h-6 w-40" />
        </CardHeader>
        <CardContent>
          <Skeleton className="h-40" />
        </CardContent>
      </Card>
    );
  }

  return (
    <Card data-testid="card-recent-activity">
      <CardHeader className="pb-2">
        <CardTitle className="text-lg flex items-center gap-2">
          <History className="w-5 h-5" />
          {t('play.recentActivity')}
        </CardTitle>
      </CardHeader>
      <CardContent>
        <Tabs defaultValue="transactions" className="w-full">
          <TabsList className="w-full mb-3">
            <TabsTrigger value="transactions" className="flex-1" data-testid="tab-transactions">
              {t('play.recentTransactions')}
            </TabsTrigger>
            <TabsTrigger value="games" className="flex-1" data-testid="tab-games">
              {t('play.recentGames')}
            </TabsTrigger>
          </TabsList>

          <TabsContent value="transactions" className="mt-0">
            {recentTransactions.length === 0 ? (
              <div className="text-center py-8 text-muted-foreground">
                <CreditCard className="w-8 h-8 mx-auto mb-2 opacity-50" />
                <p className="text-sm">{t('play.noTransactions')}</p>
              </div>
            ) : (
              <div className="space-y-2">
                {recentTransactions.map((tx, index) => (
                  <div
                    key={tx.id || index}
                    className="flex items-center justify-between gap-3 p-2 rounded-lg bg-muted/30"
                    data-testid={`row-transaction-${tx.id || index}`}
                  >
                    <div className="flex items-center gap-2">
                      {getTransactionIcon(tx.type)}
                      <div>
                        <p className="text-sm font-medium capitalize">{tx.type.replace('_', ' ')}</p>
                        <p className="text-xs text-muted-foreground">
                          {tx.createdAt ? new Date(tx.createdAt).toLocaleDateString() : '-'}
                        </p>
                      </div>
                    </div>
                    <div className="text-end">
                      <p className={`text-sm font-semibold ${tx.type.includes('deposit') || tx.type.includes('win') ? 'text-green-500' : ''}`}>
                        {tx.type.includes('deposit') || tx.type.includes('win') ? '+' : '-'}${parseFloat(tx.amount).toFixed(2)}
                      </p>
                      {getStatusBadge(tx.status)}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </TabsContent>

          <TabsContent value="games" className="mt-0">
            {recentSessions.length === 0 ? (
              <div className="text-center py-8 text-muted-foreground">
                <Gamepad2 className="w-8 h-8 mx-auto mb-2 opacity-50" />
                <p className="text-sm">{t('play.noGameSessions')}</p>
              </div>
            ) : (
              <div className="space-y-2">
                {recentSessions.map((session, index) => (
                  <div
                    key={session.id || index}
                    className="flex items-center justify-between gap-3 p-2 rounded-lg bg-muted/30"
                    data-testid={`row-session-${session.id || index}`}
                  >
                    <div className="flex items-center gap-2">
                      <Gamepad2 className="w-4 h-4 text-muted-foreground" />
                      <div>
                        <p className="text-sm font-medium">{session.gameName || 'Game'}</p>
                        <p className="text-xs text-muted-foreground">
                          {session.createdAt ? new Date(session.createdAt).toLocaleDateString() : '-'}
                        </p>
                      </div>
                    </div>
                    <div className="text-end">
                      <p className={`text-sm font-semibold ${session.won ? 'text-green-500' : 'text-red-500'}`}>
                        {session.won ? '+' : '-'}${parseFloat(session.amount || '0').toFixed(2)}
                      </p>
                      {session.multiplier && (
                        <p className="text-xs text-muted-foreground">{session.multiplier}x</p>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </TabsContent>
        </Tabs>
      </CardContent>
    </Card>
  );
}

export default function PlayPage() {
  const { language, t } = useI18n();
  const { toast } = useToast();
  const [selectedGame, setSelectedGame] = useState<Game | null>(null);
  const [betAmount, setBetAmount] = useState('10.00');
  const [searchQuery, setSearchQuery] = useState('');
  const [lastResult, setLastResult] = useState<Record<string, unknown> | null>(null);
  const [expandedCategories, setExpandedCategories] = useState<string[]>(['crash', 'dice']);

  const { data: user } = useQuery<User>({
    queryKey: ['/api/user'],
  });

  const { data: games, isLoading: gamesLoading } = useQuery<Game[]>({
    queryKey: ['/api/games', { section: 'play' }],
    queryFn: async () => {
      const res = await fetch('/api/games?section=play&status=active');
      if (!res.ok) throw new Error('Failed to load games');
      return res.json();
    },
  });

  const playMutation = useMutation({
    mutationFn: async ({ gameId, amount, extra }: { gameId: string; amount: string; extra?: Record<string, unknown> }) => {
      const res = await apiRequest('POST', '/api/games/play', { gameId, amount, ...extra });
      return res.json() as Promise<{ won: boolean; winAmount: number;[key: string]: unknown }>;
    },
    onSuccess: (data) => {
      setLastResult(data);
      queryClient.invalidateQueries({ queryKey: ['/api/user'] });
      queryClient.invalidateQueries({ queryKey: ['/api/transactions'] });
      queryClient.invalidateQueries({ queryKey: ['/api/game-sessions'] });

      if (data.won) {
        toast({
          title: language === 'ar' ? 'مبروك!' : 'Congratulations!',
          description: language === 'ar'
            ? `ربحت $${data.winAmount}`
            : `You won $${data.winAmount}`,
        });
      }
    },
    onError: (error: unknown) => {
      const message = error instanceof Error ? error.message : String(error);
      toast({
        title: t('common.error'),
        description: message,
        variant: 'destructive',
      });
    },
  });

  const handlePlay = (extra?: Record<string, unknown>) => {
    if (!selectedGame) return;
    playMutation.mutate({ gameId: selectedGame.id, amount: betAmount, extra });
  };

  const handleMaxBet = () => {
    if (selectedGame && user) {
      const maxPossible = Math.min(parseFloat(user.balance), parseFloat(selectedGame.maxBet));
      setBetAmount(maxPossible.toFixed(2));
    }
  };

  const getGamesByCategory = (categoryId: string) => {
    return games?.filter((g) =>
      g.category === categoryId &&
      (searchQuery === "" || g.name.toLowerCase().includes(searchQuery.toLowerCase()))
    ) || [];
  };

  const hasAnyCategorizedGames = useMemo(() => {
    return Boolean(games?.some((game) => GAME_CATEGORIES.some((category) => category.id === game.category)));
  }, [games]);

  if (gamesLoading) {
    return (
      <div className="p-4 space-y-4">
        <Skeleton className="h-8 w-48" />
        <Skeleton className="h-40" />
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
          <Skeleton className="h-64" />
          <Skeleton className="h-64 lg:col-span-2" />
        </div>
        <Skeleton className="h-32" />
      </div>
    );
  }

  const renderGameComponent = () => {
    if (!selectedGame) return null;

    const commonProps = {
      isPlaying: playMutation.isPending,
      result: (lastResult ?? {}) as Record<string, unknown>,
      betAmount,
    };

    switch (selectedGame.category) {
      case 'crash':
        return <CrashGame {...commonProps} onPlay={() => handlePlay()} />;
      case 'dice':
        return <DiceGame {...commonProps} onPlay={(prediction, target) => handlePlay({ prediction, target })} />;
      case 'wheel':
        return <WheelGame {...commonProps} onPlay={() => handlePlay()} />;
      case 'slots':
        return <SlotsGame {...commonProps} onPlay={() => handlePlay()} />;
      case 'jackpot':
        return <JackpotGame {...commonProps} onPlay={() => handlePlay()} />;
      default:
        return (
          <div className="text-center py-8">
            <Gamepad2 className="w-12 h-12 mx-auto mb-2 text-muted-foreground" />
            <p className="text-muted-foreground">Game type not supported</p>
          </div>
        );
    }
  };

  return (
    <div className="p-4 space-y-6">
      <AnnouncementsBanner />

      <div className="flex items-center justify-between gap-4 flex-wrap">
        <h1 className="text-xl font-bold flex items-center gap-2">
          <Gamepad2 className="w-5 h-5" />
          {t('play.featuredGames')}
        </h1>
        <div className="relative">
          <Search className="absolute start-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder={language === 'ar' ? 'بحث...' : 'Search...'}
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="ps-9 w-48"
            data-testid="input-search-games"
          />
        </div>
      </div>

      {!selectedGame ? (
        <div className="space-y-4">
          {/* Advertisement Carousel */}
          <AdvertisementCarousel />

          {/* Most Played Games Section */}
          <MostPlayedSection onSelectGame={(game) => {
            setSelectedGame(game);
            setLastResult(null);
          }} />

          {/* All game categories with Show More/Hide buttons */}
          <div className="space-y-2">
            {hasAnyCategorizedGames ? (
              GAME_CATEGORIES.map((category, index) => {
                const categoryGames = getGamesByCategory(category.id);
                if (categoryGames.length === 0 && searchQuery) return null;

                return (
                  <GameSection
                    key={category.id}
                    title={category.name}
                    titleAr={category.nameAr}
                    games={categoryGames}
                    onSelectGame={(game) => {
                      setSelectedGame(game);
                      setLastResult(null);
                    }}
                    icon={category.icon}
                    iconColor={category.color}
                    initiallyExpanded={index === 0}
                  />
                );
              })
            ) : (
              <Card className="border-dashed">
                <CardContent className="p-6 text-center text-muted-foreground">
                  {language === "ar" ? "لا توجد ألعاب مصنفة بعد" : "No categorized games available yet"}
                </CardContent>
              </Card>
            )}
          </div>
        </div>
      ) : (
        <FullScreenGameplay
          game={selectedGame}
          user={user}
          onExit={() => setSelectedGame(null)}
        >
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 h-full">
            <Card className="h-fit">
              <CardHeader className="pb-2">
                <CardTitle className="text-lg">{selectedGame.name}</CardTitle>
              </CardHeader>
              <CardContent>
                {renderGameComponent()}
              </CardContent>
            </Card>

            <Card className="h-fit">
              <CardHeader className="pb-2">
                <CardTitle className="text-lg">
                  {language === 'ar' ? 'مبلغ التحدي' : 'Challenge Amount'}
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="flex gap-2">
                  <Input
                    type="number"
                    value={betAmount}
                    onChange={(e) => setBetAmount(e.target.value)}
                    min={selectedGame.minBet}
                    max={selectedGame.maxBet}
                    className="flex-1"
                    data-testid="input-bet-amount"
                  />
                  <Button variant="outline" onClick={handleMaxBet} data-testid="button-max-bet">
                    MAX
                  </Button>
                </div>

                <div className="flex gap-2 flex-wrap">
                  {quickBetAmounts.map((amount) => (
                    <Button
                      key={amount}
                      variant={betAmount === amount ? "default" : "outline"}
                      size="sm"
                      onClick={() => setBetAmount(amount)}
                      data-testid={`button-quick-bet-${amount}`}
                    >
                      ${amount}
                    </Button>
                  ))}
                </div>

                <div className="text-xs text-muted-foreground space-y-1">
                  <div className="flex justify-between">
                    <span>{language === 'ar' ? 'الحد الأدنى' : 'Min Amount'}:</span>
                    <span>${selectedGame.minBet}</span>
                  </div>
                  <div className="flex justify-between">
                    <span>{language === 'ar' ? 'الحد الأقصى' : 'Max Amount'}:</span>
                    <span>${selectedGame.maxBet}</span>
                  </div>
                  <div className="flex justify-between">
                    <span>RTP:</span>
                    <span>{selectedGame.rtp}%</span>
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>
        </FullScreenGameplay>
      )}
    </div>
  );
}
