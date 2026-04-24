import { useState, useEffect, useCallback, useRef } from 'react';
import { useAuth } from '@/lib/auth';
import { extractWsErrorInfo, isWsErrorType } from '@/lib/ws-errors';
import { useDominoSpeedMode } from '@/lib/domino-speed';

const DEBUG_WS = import.meta.env.DEV;
function wsLog(...args: unknown[]) { if (DEBUG_WS) console.log(...args); }

interface DominoTileClient {
  left: number;
  right: number;
  id: string;
}

interface PlayingCardClient {
  suit: "hearts" | "diamonds" | "clubs" | "spades";
  rank: string;
  value: number;
}

interface TrickEntry {
  playerId: string;
  card: PlayingCardClient;
}

interface BidEntry {
  playerId: string;
  bid: string | number;
  pass?: boolean;
}

export interface ChessGameState {
  fen: string;
  currentTurn: 'w' | 'b';
  isCheck: boolean;
  isCheckmate: boolean;
  isStalemate: boolean;
  isDraw: boolean;
  lastMove?: { from: string; to: string };
  validMoves: string[];
  capturedPieces: { white: string[]; black: string[] };
  moveHistory: { notation: string; player: 'w' | 'b'; moveNumber: number }[];
  whiteTime: number;
  blackTime: number;
}

export interface DominoGameState {
  // C10-F9: Removed unused tiles/playerTiles — hand & board are the actual fields
  currentTurn: string;
  board: DominoTileClient[];
  hand?: DominoTileClient[];
  isMyTurn?: boolean;
  playerOrder?: string[];
  gamePhase?: string;
  otherHandCounts?: Record<string, number>;
  leftEnd?: number;
  rightEnd?: number;
  boneyardCount?: number;
  scores?: Record<string, number>;
  lastAction?: { type: string; playerId: string; tile?: { left: number; right: number; id?: string }; end?: string };
  passCount?: number;
  winner?: string | null; // C9-F12: winner player ID from server
  canDraw?: boolean; // F5: server-computed draw eligibility
  drawsThisTurn?: number; // F5: draws taken this turn
  validMoves?: Array<{ type: string; tile?: { left: number; right: number; id: string }; end?: string }>; // F11: server valid moves
  turnTimeLimit?: number; // F10: challenge time limit per turn
}

export interface BackgammonGameState {
  board: number[];
  currentTurn: 'white' | 'black';
  dice: number[];
  diceUsed: boolean[];
  bar: { white: number; black: number };
  borneOff: { white: number; black: number };
  validMoves: Array<{ type: string; from: string; to: string }>;
  mustRoll: boolean;
  gamePhase: 'rolling' | 'moving' | 'doubling' | 'finished';
  myColor: 'white' | 'black' | 'spectator';
  players: { white: string; black: string };
  doublingCube?: number;
  cubeOwner?: 'white' | 'black' | null;
  cubeOffered?: boolean;
  cubeOfferedBy?: 'white' | 'black' | null;
}

export interface CardGameState {
  hand: PlayingCardClient[];
  currentTurn: string;
  playedCards: TrickEntry[];
  scores: Record<string, number>;
  gamePhase?: string;
  playerOrder?: string[];
  otherHandCounts?: Record<string, number>;
  tricksWon?: Record<string, number>;
  totalPoints?: Record<string, number>;
  roundPoints?: Record<string, number>;
  totalScores?: Record<string, number>;
  roundScores?: Record<string, number>;
  currentTrick?: TrickEntry[];
  gameType?: string;
  trumpSuit?: string;
  choosingPlayer?: string;
  projects?: Record<string, unknown>[];
  winner?: string;
  myTeam?: number;
  bids?: BidEntry[];
  highestBid?: BidEntry;
  isMyTurn?: boolean;
  partner?: string;
  trickLeader?: string;
  roundNumber?: number;
  targetScore?: number;
  lastTrickWinner?: string;
  validMoves?: Array<{ type: string; card?: string; suit?: string; bid?: number }>;
  biddingTeam?: number | null;
  dealerId?: string;
  lastCompletedTrick?: TrickEntry[];
  botPlayers?: string[];
  redealCount?: number;
  lastRoundScores?: { team0: number; team1: number };
  lastBidValue?: number;
  lastBiddingTeam?: number;
  lastBiddingTeamMade?: boolean;
  lastIsKaboot?: boolean;
}

type GameState = ChessGameState | DominoGameState | BackgammonGameState | CardGameState | Record<string, unknown>;

interface ChatMessage {
  id?: string;
  userId?: string;
  username: string;
  message: string;
  isSpectator?: boolean;
  timestamp: number | string;
}

interface WebSocketPayload {
  gameType?: string;
  playerColor?: 'w' | 'b';
  opponent?: { id: string; username: string };
  view?: GameState;
  gameState?: GameState;
  turnNumber?: number;
  chatMessages?: ChatMessage[];
  spectatorCount?: number;
  error?: string;
  errorKey?: string;
  requiresSync?: boolean;
  message?: string;
  code?: string;
  senderId?: string;
  senderUsername?: string;
  recipientId?: string;
  giftItem?: { id: string; name: string; nameAr?: string; icon: string; price: string };
  quantity?: number;
  winner?: string | null;
  reason?: string;
  lowestPips?: number;
  [key: string]: unknown;
}

interface WebSocketMessage {
  type: string;
  payload: WebSocketPayload;
}

type ConnectionStatus = 'connecting' | 'connected' | 'disconnected' | 'reconnecting' | 'syncing' | 'error';

const MAX_RECONNECT_ATTEMPTS = 5;
const BASE_RECONNECT_DELAY = 1000;
const MAX_RECONNECT_DELAY = 30000;
const MAX_GAME_STATE_KEYS = 400;
const MAX_STATE_JSON_CHARS = 256_000;

function isRecordObject(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function normalizeIncomingGameState(value: unknown): GameState | null {
  let candidate = value;

  if (typeof candidate === 'string') {
    if (candidate.length > MAX_STATE_JSON_CHARS) {
      return null;
    }

    try {
      candidate = JSON.parse(candidate);
    } catch {
      return null;
    }
  }

  if (!isRecordObject(candidate)) {
    return null;
  }

  const keys = Object.keys(candidate);
  if (keys.length > MAX_GAME_STATE_KEYS) {
    return null;
  }

  return candidate as GameState;
}

function getGameStateFromPayload(payload: WebSocketPayload): GameState | null {
  return normalizeIncomingGameState(payload.view ?? payload.gameState ?? null);
}

function getReconnectDelay(attempt: number): number {
  const delay = Math.min(BASE_RECONNECT_DELAY * Math.pow(2, attempt), MAX_RECONNECT_DELAY);
  const jitter = delay * 0.2 * Math.random();
  return delay + jitter;
}

export function useGameWebSocket(sessionId: string | null) {
  const { user, token } = useAuth();
  const speedMode = useDominoSpeedMode();
  const speedModeRef = useRef(speedMode);
  speedModeRef.current = speedMode;
  const wsRef = useRef<WebSocket | null>(null);
  const [connectionStatus, setConnectionStatus] = useState<ConnectionStatus>('disconnected');
  const [gameType, setGameType] = useState<string | null>(null);
  const [gameState, setGameState] = useState<GameState | null>(null);
  const [playerColor, setPlayerColor] = useState<'w' | 'b' | null>(null);
  const [opponent, setOpponent] = useState<{ id: string; username: string } | null>(null);
  const [chatMessages, setChatMessages] = useState<ChatMessage[]>([]);
  const [spectatorCount, setSpectatorCount] = useState<number>(0);
  const [isSpectator, setIsSpectator] = useState(false);
  const [drawOffered, setDrawOffered] = useState(false);
  const [drawOfferReceived, setDrawOfferReceived] = useState(false);
  const [gameResult, setGameResult] = useState<{ winner: string | null; reason: string; isDraw?: boolean; scores?: Record<string, number>; lowestPips?: number; winningTeamPips?: number } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [moveError, setMoveError] = useState<string | null>(null);
  const [moveErrorKey, setMoveErrorKey] = useState<string | null>(null);
  const [lastGift, setLastGift] = useState<{
    senderId: string;
    senderUsername: string;
    recipientId: string;
    giftItem: { id: string; name: string; nameAr?: string; icon: string; price: string };
    quantity: number;
    message?: string;
  } | null>(null);
  const [turnNumber, setTurnNumber] = useState<number>(0);
  const [isMovePending, setIsMovePending] = useState(false);

  const reconnectAttemptsRef = useRef(0);
  const sessionIdRef = useRef(sessionId);
  const tokenRef = useRef(token);
  const isIntentionalCloseRef = useRef(false);
  const reconnectTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const pingIntervalRef = useRef<NodeJS.Timeout | null>(null);
  const lastPongRef = useRef<number>(Date.now());
  const movePendingSinceRef = useRef<number | null>(null);
  const pendingWatchRef = useRef<NodeJS.Timeout | null>(null);

  sessionIdRef.current = sessionId;
  tokenRef.current = token;

  const handleMessage = useCallback((message: WebSocketMessage) => {
    if (isWsErrorType(message.type)) {
      const { message: errorMessage, code } = extractWsErrorInfo(message);

      // Fatal protocol/auth errors should still end the session flow.
      if (code === 'SESSION_NOT_FOUND' || code === 'NOT_AUTHORIZED') {
        setError(errorMessage || null);
        movePendingSinceRef.current = null;
        setIsMovePending(false);
        isIntentionalCloseRef.current = true;
        wsRef.current?.close();
        return;
      }

      if (errorMessage) {
        setMoveError(errorMessage);
      }
      setMoveErrorKey((message.payload?.errorKey as string) || null);
      movePendingSinceRef.current = null;
      setIsMovePending(false);
      return;
    }

    switch (message.type) {
      case 'authenticated':
        wsLog('[WS] Authenticated, joining game...');
        if (sessionIdRef.current && wsRef.current?.readyState === WebSocket.OPEN) {
          wsRef.current.send(JSON.stringify({
            type: 'join_game',
            payload: { sessionId: sessionIdRef.current }
          }));
        }
        break;

      case 'game_joined':
        wsLog('[WS] Game joined successfully');
        setConnectionStatus('connected');
        setIsSpectator(Boolean(message.payload.isSpectator));
        if (message.payload.gameType) setGameType(message.payload.gameType);
        if (message.payload.playerColor) setPlayerColor(message.payload.playerColor);
        if (message.payload.opponent) setOpponent(message.payload.opponent);
        {
          const incomingState = getGameStateFromPayload(message.payload);
          if (incomingState) {
            setGameState(incomingState);
          }
        }
        if (message.payload.turnNumber !== undefined) {
          wsLog('[WS] Turn number from join:', message.payload.turnNumber);
          setTurnNumber(message.payload.turnNumber);
        }
        setError(null);
        setMoveError(null);
        setMoveErrorKey(null);
        movePendingSinceRef.current = null;
        setIsMovePending(false);

        if (wsRef.current?.readyState === WebSocket.OPEN && sessionIdRef.current) {
          wsLog('[WS] Requesting state sync after join');
          wsRef.current.send(JSON.stringify({
            type: 'get_state',
            payload: { sessionId: sessionIdRef.current }
          }));
          // Tell the server our preferred game speed so it can scale AI
          // think delays accordingly.
          wsRef.current.send(JSON.stringify({
            type: 'set_speed_mode',
            payload: { mode: speedModeRef.current }
          }));
        }
        break;

      case 'state_sync':
        wsLog('[WS] State synced from server, turn:', message.payload.turnNumber);
        setConnectionStatus('connected');
        if (message.payload.isSpectator !== undefined) {
          setIsSpectator(Boolean(message.payload.isSpectator));
        }
        if (message.payload.gameType) {
          setGameType(message.payload.gameType);
        }
        {
          const incomingState = getGameStateFromPayload(message.payload);
          if (incomingState) {
            setGameState(incomingState);
          }
        }
        if (message.payload.playerColor) {
          setPlayerColor(message.payload.playerColor);
        }
        if (message.payload.opponent) {
          setOpponent(message.payload.opponent);
        }
        if (message.payload.chatMessages) {
          setChatMessages(message.payload.chatMessages);
        }
        if (message.payload.turnNumber !== undefined) {
          setTurnNumber(message.payload.turnNumber);
        }
        setError(null);
        setMoveError(null);
        setMoveErrorKey(null);
        movePendingSinceRef.current = null;
        setIsMovePending(false);
        break;

      case 'game_state':
        // C18-F3: Only set game state when a valid view/gameState sub-property exists
        {
          const incomingState = getGameStateFromPayload(message.payload);
          if (incomingState) {
            setGameState(incomingState);
          } else {
            console.warn('[WS] game_state message missing valid state payload — requesting sync');
            // Inline sync request — requestStateSync is defined after handleMessage
            if (wsRef.current?.readyState === WebSocket.OPEN && sessionIdRef.current) {
              wsRef.current.send(JSON.stringify({ type: 'get_state', payload: { sessionId: sessionIdRef.current } }));
            }
          }
        }
        if (message.payload.turnNumber !== undefined) {
          setTurnNumber(message.payload.turnNumber);
        }
        movePendingSinceRef.current = null;
        setIsMovePending(false);
        break;

      case 'move_made':
      case 'game_move': // F3: handle challenge-ws game_move messages
        {
          const incomingState = getGameStateFromPayload(message.payload);
          if (incomingState) {
            setGameState(incomingState);
          }
        }
        if (message.payload.turnNumber !== undefined) {
          setTurnNumber(message.payload.turnNumber);
        }
        setDrawOffered(false);
        setDrawOfferReceived(false);
        setError(null);
        setMoveError(null);
        setMoveErrorKey(null);
        movePendingSinceRef.current = null;
        setIsMovePending(false);
        break;

      case 'game_update':
        if (message.payload.gameType) {
          setGameType(message.payload.gameType);
        }
        {
          const incomingState = getGameStateFromPayload(message.payload);
          if (incomingState) {
            setGameState(incomingState);
          }
        }
        if (message.payload.turnNumber !== undefined) {
          wsLog('[WS] Turn number updated:', message.payload.turnNumber);
          setTurnNumber(message.payload.turnNumber);
        }
        setDrawOffered(false);
        setDrawOfferReceived(false);
        setError(null);
        setMoveError(null);
        setMoveErrorKey(null);
        movePendingSinceRef.current = null;
        setIsMovePending(false);
        break;

      case 'move_rejected':
        // Handled by unified websocket error branch above.
        if (message.payload.requiresSync) {
          wsLog('[WS] Move rejected due to state mismatch, awaiting server sync...');
        }
        break;

      case 'spectating':
        wsLog('[WS] Spectating game');
        setConnectionStatus('connected');
        setIsSpectator(true);
        if (message.payload.gameType) setGameType(message.payload.gameType);
        {
          const incomingState = getGameStateFromPayload(message.payload);
          if (incomingState) {
            setGameState(incomingState);
          }
        }
        setError(null);
        setMoveError(null);
        setMoveErrorKey(null);
        movePendingSinceRef.current = null;
        break;

      case 'chat_message':
        setChatMessages(prev => [...prev, message.payload as unknown as ChatMessage]);
        break;

      case 'spectator_joined':
        if (message.payload.spectatorCount !== undefined) {
          setSpectatorCount(message.payload.spectatorCount);
        }
        break;

      case 'spectator_left':
        if (message.payload.spectatorCount !== undefined) {
          setSpectatorCount(message.payload.spectatorCount);
        }
        break;

      case 'gift_received':
        wsLog('[WS] Gift received:', message.payload);
        setLastGift({
          senderId: message.payload.senderId as string,
          senderUsername: message.payload.senderUsername as string,
          recipientId: message.payload.recipientId as string,
          giftItem: message.payload.giftItem as { id: string; name: string; nameAr?: string; icon: string; price: string },
          quantity: message.payload.quantity as number,
          message: message.payload.message as string | undefined
        });
        break;

      case 'gift_sent':
        wsLog('[WS] Gift sent successfully:', message.payload);
        break;

      case 'draw_offered':
        setDrawOfferReceived(true);
        break;

      case 'draw_declined':
        setDrawOffered(false);
        break;

      case 'game_over':
      case 'game_ended': // F3: handle both message names (game_over from game-ws, game_ended from challenge-ws)
        wsLog('[WS] Game over:', message.payload.reason);
        setGameResult({
          winner: (message.payload.winnerId as string) || (message.payload.winner as string) || null,
          reason: message.payload.reason as string,
          isDraw: (message.payload.isDraw as boolean) || false,
          scores: (message.payload.scores as Record<string, number>) || undefined,
          // C18-F1: Use ?? instead of || so lowestPips=0 is preserved (empty hand on winning team)
          lowestPips: (message.payload.lowestPips as number) ?? undefined,
          // C18-F2: Capture winningTeamPips for 4-player team mode display
          winningTeamPips: (message.payload.winningTeamPips as number) ?? undefined,
        });
        movePendingSinceRef.current = null;
        setIsMovePending(false);
        break;

      case 'error':
        // Handled by unified websocket error branch above.
        break;

      case 'pong':
        lastPongRef.current = Date.now();
        break;

      default:
        wsLog('[WS] Unknown message type:', message.type);
    }
  }, []);

  const connect = useCallback(() => {
    if (!tokenRef.current || !sessionIdRef.current) {
      wsLog('[WS] Cannot connect: missing token or sessionId');
      return;
    }

    if (wsRef.current?.readyState === WebSocket.OPEN || wsRef.current?.readyState === WebSocket.CONNECTING) {
      wsLog('[WS] Already connected or connecting');
      return;
    }

    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    const wsUrl = `${protocol}//${window.location.host}/ws/game`;

    wsLog('[WS] Connecting to', wsUrl);
    setConnectionStatus(reconnectAttemptsRef.current > 0 ? 'reconnecting' : 'connecting');

    const ws = new WebSocket(wsUrl);
    wsRef.current = ws;

    ws.onopen = () => {
      wsLog('[WS] Connection opened, authenticating...');
      reconnectAttemptsRef.current = 0;
      lastPongRef.current = Date.now();

      ws.send(JSON.stringify({
        type: 'authenticate',
        payload: { token: tokenRef.current }
      }));
    };

    ws.onmessage = (event) => {
      try {
        const message: WebSocketMessage = JSON.parse(event.data);
        handleMessage(message);
      } catch (e) {
        console.error('[WS] Failed to parse message:', e);
      }
    };

    ws.onclose = (event) => {
      wsLog('[WS] Connection closed:', event.code, event.reason);
      wsRef.current = null;

      if (pingIntervalRef.current) {
        clearInterval(pingIntervalRef.current);
        pingIntervalRef.current = null;
      }

      if (isIntentionalCloseRef.current) {
        setConnectionStatus('disconnected');
        isIntentionalCloseRef.current = false;
        return;
      }

      if (reconnectAttemptsRef.current < MAX_RECONNECT_ATTEMPTS && sessionIdRef.current) {
        const delay = getReconnectDelay(reconnectAttemptsRef.current);
        console.log(`[WS] Reconnecting in ${delay}ms (attempt ${reconnectAttemptsRef.current + 1}/${MAX_RECONNECT_ATTEMPTS})`);
        setConnectionStatus('reconnecting');

        reconnectTimeoutRef.current = setTimeout(() => {
          reconnectAttemptsRef.current++;
          connect();
        }, delay);
      } else {
        wsLog('[WS] Max reconnect attempts reached');
        setConnectionStatus('error');
        setError('Connection lost. Please refresh the page to reconnect.');
      }
    };

    ws.onerror = (event) => {
      console.error('[WS] Connection error:', event);
    };

    pingIntervalRef.current = setInterval(() => {
      if (ws.readyState === WebSocket.OPEN) {
        const timeSinceLastPong = Date.now() - lastPongRef.current;
        if (timeSinceLastPong > 60000) {
          wsLog('[WS] Pong timeout, closing connection');
          ws.close();
          return;
        }
        ws.send(JSON.stringify({ type: 'ping' }));
      }
    }, 25000);
  }, [handleMessage]);

  const requestStateSync = useCallback(() => {
    if (!wsRef.current || wsRef.current.readyState !== WebSocket.OPEN) return;

    wsLog('[WS] Requesting state sync...');
    setConnectionStatus('syncing');
    wsRef.current.send(JSON.stringify({
      type: 'get_state',
      payload: { sessionId: sessionIdRef.current }
    }));
  }, []);

  useEffect(() => {
    if (!token || !sessionId) {
      setIsSpectator(false);
      if (wsRef.current) {
        isIntentionalCloseRef.current = true;
        wsRef.current.close();
      }
      return;
    }

    connect();

    return () => {
      isIntentionalCloseRef.current = true;
      if (reconnectTimeoutRef.current) {
        clearTimeout(reconnectTimeoutRef.current);
      }
      if (pingIntervalRef.current) {
        clearInterval(pingIntervalRef.current);
      }
      if (wsRef.current) {
        wsRef.current.close();
        wsRef.current = null;
      }
    };
  }, [token, sessionId, connect]);

  // C18-F11: Only start watchdog interval when a move is actually pending
  useEffect(() => {
    if (pendingWatchRef.current) {
      clearInterval(pendingWatchRef.current);
      pendingWatchRef.current = null;
    }

    if (!isMovePending) return;

    pendingWatchRef.current = setInterval(() => {
      if (!movePendingSinceRef.current) return;
      const elapsed = Date.now() - movePendingSinceRef.current;
      if (elapsed > 8000) {
        console.warn('[WS] Move pending timeout; requesting sync');
        movePendingSinceRef.current = null;
        setIsMovePending(false);
        requestStateSync();
      }
    }, 1000);

    return () => {
      if (pendingWatchRef.current) {
        clearInterval(pendingWatchRef.current);
        pendingWatchRef.current = null;
      }
    };
  }, [isMovePending, requestStateSync]);

  useEffect(() => {
    const handleVisibilityChange = () => {
      if (document.visibilityState === 'visible' && sessionIdRef.current) {
        if (wsRef.current?.readyState === WebSocket.OPEN) {
          requestStateSync();
        } else if (wsRef.current?.readyState !== WebSocket.CONNECTING) {
          reconnectAttemptsRef.current = 0;
          connect();
        }
      }
    };

    const handleOnline = () => {
      if (sessionIdRef.current && wsRef.current?.readyState !== WebSocket.OPEN) {
        wsLog('[WS] Network online, reconnecting...');
        reconnectAttemptsRef.current = 0;
        connect();
      }
    };

    document.addEventListener('visibilitychange', handleVisibilityChange);
    window.addEventListener('online', handleOnline);

    return () => {
      document.removeEventListener('visibilitychange', handleVisibilityChange);
      window.removeEventListener('online', handleOnline);
    };
  }, [connect, requestStateSync]);

  const turnNumberRef = useRef(turnNumber);
  turnNumberRef.current = turnNumber;

  // Push speed-mode preference to the server whenever it changes mid-session
  // (e.g. the player switches Normal -> Turbo from the settings page). We
  // also send it once after `game_joined`; this effect handles updates.
  useEffect(() => {
    const ws = wsRef.current;
    if (ws && ws.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify({
        type: 'set_speed_mode',
        payload: { mode: speedMode }
      }));
    }
  }, [speedMode]);

  const makeMove = useCallback((moveData: Record<string, unknown> | string, to?: string, promotion?: string) => {
    if (!wsRef.current || wsRef.current.readyState !== WebSocket.OPEN) {
      console.warn('[WS] Cannot make move: not connected');
      return false;
    }

    if (isSpectator) {
      setMoveError('Spectators cannot make moves');
      setMoveErrorKey('game.spectatorCannotMove');
      return false;
    }

    if (isMovePending) {
      console.warn('[WS] Cannot make move: previous move pending');
      return false;
    }

    setMoveError(null);
    setMoveErrorKey(null);

    let move: Record<string, unknown>;
    if (typeof moveData === 'object') {
      move = moveData;
      wsLog('[WS] Making move (object):', move, 'expectedTurn:', turnNumberRef.current);
    } else {
      move = { from: moveData, to, promotion };
      wsLog('[WS] Making move:', moveData, '->', to, 'expectedTurn:', turnNumberRef.current);
    }

    setIsMovePending(true);
    movePendingSinceRef.current = Date.now();

    wsRef.current.send(JSON.stringify({
      type: 'make_move',
      payload: {
        sessionId: sessionIdRef.current,
        move,
        expectedTurn: turnNumberRef.current
      }
    }));
    return true;
  }, [isMovePending, isSpectator]);

  const sendChat = useCallback((content: string) => {
    if (!wsRef.current || wsRef.current.readyState !== WebSocket.OPEN) return false;

    wsRef.current.send(JSON.stringify({
      type: 'chat',
      payload: { sessionId: sessionIdRef.current, message: content }
    }));
    return true;
  }, []);

  const resign = useCallback(() => {
    if (!wsRef.current || wsRef.current.readyState !== WebSocket.OPEN) return false;

    if (isSpectator) {
      setMoveError('Spectators cannot resign');
      setMoveErrorKey('game.spectatorCannotResign');
      return false;
    }

    wsLog('[WS] Resigning game');
    wsRef.current.send(JSON.stringify({
      type: 'resign',
      payload: { sessionId: sessionIdRef.current }
    }));
    return true;
  }, [isSpectator]);

  const offerDraw = useCallback(() => {
    if (!wsRef.current || wsRef.current.readyState !== WebSocket.OPEN) return false;

    if (isSpectator) {
      setMoveError('Spectators cannot offer draw');
      setMoveErrorKey('game.spectatorCannotOfferDraw');
      return false;
    }

    wsLog('[WS] Offering draw');
    wsRef.current.send(JSON.stringify({
      type: 'offer_draw',
      payload: { sessionId: sessionIdRef.current }
    }));
    setDrawOffered(true);
    return true;
  }, [isSpectator]);

  const respondDraw = useCallback((accept: boolean) => {
    if (!wsRef.current || wsRef.current.readyState !== WebSocket.OPEN) return false;

    if (isSpectator) {
      setMoveError('Spectators cannot respond to draw');
      setMoveErrorKey('game.spectatorCannotRespondDraw');
      return false;
    }

    wsLog('[WS] Responding to draw:', accept ? 'accept' : 'decline');
    wsRef.current.send(JSON.stringify({
      type: 'respond_draw',
      payload: { sessionId: sessionIdRef.current, accept }
    }));
    setDrawOfferReceived(false);
    return true;
  }, [isSpectator]);

  const forceReconnect = useCallback(() => {
    wsLog('[WS] Force reconnecting...');
    reconnectAttemptsRef.current = 0;
    setError(null);
    setMoveError(null);
    setMoveErrorKey(null);
    movePendingSinceRef.current = null;
    if (wsRef.current) {
      isIntentionalCloseRef.current = true;
      wsRef.current.close();
    }
    setTimeout(() => {
      isIntentionalCloseRef.current = false;
      connect();
    }, 100);
  }, [connect]);

  const sendGift = useCallback((recipientId: string, giftItemId: string, quantity: number = 1, message?: string) => {
    if (!wsRef.current || wsRef.current.readyState !== WebSocket.OPEN) return false;

    const idempotencyKey = typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function'
      ? crypto.randomUUID()
      : `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;

    wsLog('[WS] Sending gift to', recipientId);
    wsRef.current.send(JSON.stringify({
      type: 'send_gift',
      payload: { recipientId, giftItemId, quantity, message, idempotencyKey }
    }));
    return true;
  }, []);

  const clearLastGift = useCallback(() => {
    setLastGift(null);
  }, []);

  const clearMoveError = useCallback(() => {
    setMoveError(null);
    setMoveErrorKey(null);
  }, []);

  return {
    connectionStatus,
    gameType,
    gameState,
    playerColor,
    opponent,
    chatMessages,
    spectatorCount,
    isSpectator,
    canPlayActions: !isSpectator,
    drawOffered,
    drawOfferReceived,
    gameResult,
    error,
    moveError,
    moveErrorKey,
    turnNumber,
    isMovePending,
    makeMove,
    sendChat,
    resign,
    offerDraw,
    respondDraw,
    forceReconnect,
    requestStateSync,
    lastGift,
    sendGift,
    clearLastGift,
    clearMoveError
  };
}
