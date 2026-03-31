import { useState, useEffect, useCallback, useMemo, useRef } from "react";
import { cn } from "@/lib/utils";
import { useI18n } from "@/lib/i18n";

interface ChessBoardProps {
  gameState?: string;
  currentTurn?: string;
  myColor: "white" | "black";
  isMyTurn: boolean;
  isSpectator: boolean;
  onMove: (move: ChessMove) => void;
  status?: string;
}

interface ChessMove {
  from: string;
  to: string;
  piece: string;
  captured?: string;
  promotion?: string;
}

interface Square {
  row: number;
  col: number;
  piece: string | null;
  color: "white" | "black";
}

type PieceType = "K" | "Q" | "R" | "B" | "N" | "P" | "k" | "q" | "r" | "b" | "n" | "p";

const PIECE_SYMBOLS: Record<string, string> = {
  K: "♔", Q: "♕", R: "♖", B: "♗", N: "♘", P: "♙",
  k: "♚", q: "♛", r: "♜", b: "♝", n: "♞", p: "♟",
};

const INITIAL_FEN = "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1";

const FILES = ["a", "b", "c", "d", "e", "f", "g", "h"];
const RANKS = ["8", "7", "6", "5", "4", "3", "2", "1"];

function parseFEN(fen: string): { board: string[][]; activeColor: string; castling: string; enPassant: string } {
  const parts = fen.split(" ");
  const [position] = parts;
  const rows = position.split("/");
  const board: string[][] = [];

  for (const row of rows) {
    const boardRow: string[] = [];
    for (const char of row) {
      if (isNaN(parseInt(char))) {
        boardRow.push(char);
      } else {
        for (let i = 0; i < parseInt(char); i++) {
          boardRow.push("");
        }
      }
    }
    board.push(boardRow);
  }

  return {
    board,
    activeColor: parts[1] || "w",
    castling: parts[2] || "-",
    enPassant: parts[3] || "-",
  };
}

function squareToCoords(square: string): [number, number] {
  const file = square.charCodeAt(0) - 97;
  const rank = 8 - parseInt(square[1]);
  return [rank, file];
}

function coordsToSquare(row: number, col: number): string {
  return FILES[col] + RANKS[row];
}

function isWhitePiece(piece: string): boolean {
  return piece === piece.toUpperCase() && piece !== "";
}

function getPieceColor(piece: string): "white" | "black" | null {
  if (!piece) return null;
  return isWhitePiece(piece) ? "white" : "black";
}

// Check if a specific square is attacked by the given color
function isSquareAttacked(board: string[][], row: number, col: number, byColor: "white" | "black"): boolean {
  const isAttacker = byColor === "white" ? isWhitePiece : (p: string) => p !== "" && !isWhitePiece(p);
  
  // Check knight attacks
  const knightMoves = [[-2,-1],[-2,1],[-1,-2],[-1,2],[1,-2],[1,2],[2,-1],[2,1]];
  for (const [dr, dc] of knightMoves) {
    const r = row + dr, c = col + dc;
    if (r >= 0 && r <= 7 && c >= 0 && c <= 7) {
      const p = board[r][c];
      if (p && isAttacker(p) && p.toUpperCase() === "N") return true;
    }
  }
  
  // Check pawn attacks
  const pawnDir = byColor === "white" ? 1 : -1; // white pawns attack upward (decreasing row)
  for (const dc of [-1, 1]) {
    const r = row + pawnDir, c = col + dc;
    if (r >= 0 && r <= 7 && c >= 0 && c <= 7) {
      const p = board[r][c];
      if (p && isAttacker(p) && p.toUpperCase() === "P") return true;
    }
  }
  
  // Check king attacks
  for (const dr of [-1, 0, 1]) {
    for (const dc of [-1, 0, 1]) {
      if (dr === 0 && dc === 0) continue;
      const r = row + dr, c = col + dc;
      if (r >= 0 && r <= 7 && c >= 0 && c <= 7) {
        const p = board[r][c];
        if (p && isAttacker(p) && p.toUpperCase() === "K") return true;
      }
    }
  }
  
  // Check sliding pieces (bishop/queen diagonals, rook/queen straights)
  const diags = [[-1,-1],[-1,1],[1,-1],[1,1]];
  for (const [dr, dc] of diags) {
    for (let i = 1; i < 8; i++) {
      const r = row + dr * i, c = col + dc * i;
      if (r < 0 || r > 7 || c < 0 || c > 7) break;
      const p = board[r][c];
      if (p) {
        if (isAttacker(p) && (p.toUpperCase() === "B" || p.toUpperCase() === "Q")) return true;
        break;
      }
    }
  }
  
  const straights = [[-1,0],[1,0],[0,-1],[0,1]];
  for (const [dr, dc] of straights) {
    for (let i = 1; i < 8; i++) {
      const r = row + dr * i, c = col + dc * i;
      if (r < 0 || r > 7 || c < 0 || c > 7) break;
      const p = board[r][c];
      if (p) {
        if (isAttacker(p) && (p.toUpperCase() === "R" || p.toUpperCase() === "Q")) return true;
        break;
      }
    }
  }
  
  return false;
}

// Find king position for a given color
function findKing(board: string[][], color: "white" | "black"): [number, number] | null {
  const king = color === "white" ? "K" : "k";
  for (let r = 0; r < 8; r++) {
    for (let c = 0; c < 8; c++) {
      if (board[r][c] === king) return [r, c];
    }
  }
  return null;
}

// Check if moving a piece would leave own king in check
function wouldLeaveInCheck(board: string[][], fromRow: number, fromCol: number, toRow: number, toCol: number, color: "white" | "black"): boolean {
  // Simulate the move
  const newBoard = board.map(row => [...row]);
  newBoard[toRow][toCol] = newBoard[fromRow][fromCol];
  newBoard[fromRow][fromCol] = "";
  
  const enemyColor = color === "white" ? "black" : "white";
  const kingPos = findKing(newBoard, color);
  if (!kingPos) return true;
  
  return isSquareAttacked(newBoard, kingPos[0], kingPos[1], enemyColor);
}

function getRawMoves(board: string[][], row: number, col: number, piece: string, castling: string, enPassant: string): string[] {
  const moves: string[] = [];
  const isWhite = isWhitePiece(piece);
  const pieceType = piece.toUpperCase();

  const addMoveIfValid = (r: number, c: number, canCapture = true, mustCapture = false): boolean => {
    if (r < 0 || r > 7 || c < 0 || c > 7) return false;
    const target = board[r][c];
    if (!target) {
      if (!mustCapture) moves.push(coordsToSquare(r, c));
      return true;
    }
    if (canCapture && getPieceColor(target) !== (isWhite ? "white" : "black")) {
      if (!mustCapture || target) moves.push(coordsToSquare(r, c));
    }
    return false;
  };

  const addLineMoves = (dr: number, dc: number) => {
    for (let i = 1; i < 8; i++) {
      if (!addMoveIfValid(row + dr * i, col + dc * i)) break;
      if (board[row + dr * i]?.[col + dc * i]) break;
    }
  };

  switch (pieceType) {
    case "P": {
      const dir = isWhite ? -1 : 1;
      const startRow = isWhite ? 6 : 1;
      
      // Forward moves
      if (!board[row + dir]?.[col]) {
        moves.push(coordsToSquare(row + dir, col));
        if (row === startRow && !board[row + dir * 2]?.[col]) {
          moves.push(coordsToSquare(row + dir * 2, col));
        }
      }
      
      // Normal captures
      [-1, 1].forEach(dc => {
        const target = board[row + dir]?.[col + dc];
        if (target && getPieceColor(target) !== (isWhite ? "white" : "black")) {
          moves.push(coordsToSquare(row + dir, col + dc));
        }
      });
      
      // En passant
      if (enPassant !== "-") {
        const [epRow, epCol] = squareToCoords(enPassant);
        if (epRow === row + dir && Math.abs(epCol - col) === 1) {
          moves.push(enPassant);
        }
      }
      break;
    }
    case "N":
      [[-2, -1], [-2, 1], [-1, -2], [-1, 2], [1, -2], [1, 2], [2, -1], [2, 1]].forEach(([dr, dc]) => {
        addMoveIfValid(row + dr, col + dc);
      });
      break;
    case "B":
      [[-1, -1], [-1, 1], [1, -1], [1, 1]].forEach(([dr, dc]) => addLineMoves(dr, dc));
      break;
    case "R":
      [[-1, 0], [1, 0], [0, -1], [0, 1]].forEach(([dr, dc]) => addLineMoves(dr, dc));
      break;
    case "Q":
      [[-1, -1], [-1, 0], [-1, 1], [0, -1], [0, 1], [1, -1], [1, 0], [1, 1]].forEach(([dr, dc]) => addLineMoves(dr, dc));
      break;
    case "K": {
      // Normal king moves
      [[-1, -1], [-1, 0], [-1, 1], [0, -1], [0, 1], [1, -1], [1, 0], [1, 1]].forEach(([dr, dc]) => {
        addMoveIfValid(row + dr, col + dc);
      });
      
      // Castling
      const baseRow = isWhite ? 7 : 0;
      const enemyColor = isWhite ? "black" : "white";
      if (row === baseRow && col === 4) {
        // Kingside castling
        const kingSideRight = isWhite ? castling.includes("K") : castling.includes("k");
        if (kingSideRight && !board[baseRow][5] && !board[baseRow][6] &&
            !isSquareAttacked(board, baseRow, 4, enemyColor) &&
            !isSquareAttacked(board, baseRow, 5, enemyColor) &&
            !isSquareAttacked(board, baseRow, 6, enemyColor)) {
          moves.push(coordsToSquare(baseRow, 6));
        }
        
        // Queenside castling
        const queenSideRight = isWhite ? castling.includes("Q") : castling.includes("q");
        if (queenSideRight && !board[baseRow][3] && !board[baseRow][2] && !board[baseRow][1] &&
            !isSquareAttacked(board, baseRow, 4, enemyColor) &&
            !isSquareAttacked(board, baseRow, 3, enemyColor) &&
            !isSquareAttacked(board, baseRow, 2, enemyColor)) {
          moves.push(coordsToSquare(baseRow, 2));
        }
      }
      break;
    }
  }

  return moves;
}

// Get valid moves with check/pin filtering
function getValidMoves(board: string[][], row: number, col: number, piece: string, castling: string, enPassant: string): string[] {
  const raw = getRawMoves(board, row, col, piece, castling, enPassant);
  const color = getPieceColor(piece)!;
  
  // Filter out moves that leave own king in check
  return raw.filter(moveSquare => {
    const [toRow, toCol] = squareToCoords(moveSquare);
    return !wouldLeaveInCheck(board, row, col, toRow, toCol, color);
  });
}

export function ChessBoard({
  gameState,
  currentTurn,
  myColor,
  isMyTurn,
  isSpectator,
  onMove,
  status,
}: ChessBoardProps) {
  const [selectedSquare, setSelectedSquare] = useState<string | null>(null);
  const [validMoves, setValidMoves] = useState<string[]>([]);
  const [lastMove, setLastMove] = useState<{ from: string; to: string } | null>(null);
  const [showPromotion, setShowPromotion] = useState<{ from: string; to: string } | null>(null);
  const [animSquare, setAnimSquare] = useState<string | null>(null);
  const [animDelta, setAnimDelta] = useState<{ dx: number; dy: number }>({ dx: 0, dy: 0 });
  const animTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const prevBoardRef = useRef<string[][] | null>(null);
  const { language } = useI18n();

  const fenData = useMemo(() => {
    try {
      if (gameState) {
        const parsed = JSON.parse(gameState);
        return parseFEN(parsed.fen || INITIAL_FEN);
      }
    } catch {
      return parseFEN(INITIAL_FEN);
    }
    return parseFEN(INITIAL_FEN);
  }, [gameState]);

  const board = fenData.board;
  const castling = fenData.castling;
  const enPassant = fenData.enPassant;

  // Trigger slide animation when lastMove changes (local move)
  useEffect(() => {
    if (!lastMove) return;
    const [fromR, fromC] = squareToCoords(lastMove.from);
    const [toR, toC] = squareToCoords(lastMove.to);
    const dy = (fromR - toR) * 100;
    const dx = (fromC - toC) * 100;
    setAnimDelta({ dx, dy });
    setAnimSquare(lastMove.to);
    if (animTimerRef.current) clearTimeout(animTimerRef.current);
    animTimerRef.current = setTimeout(() => setAnimSquare(null), 220);
    return () => { if (animTimerRef.current) clearTimeout(animTimerRef.current); };
  }, [lastMove]);

  // Detect opponent moves via board diff
  useEffect(() => {
    const prev = prevBoardRef.current;
    prevBoardRef.current = board;
    if (!prev) return;
    // Find the piece that appeared and disappeared
    let fromR = -1, fromC = -1, toR = -1, toC = -1;
    for (let r = 0; r < 8; r++) {
      for (let c = 0; c < 8; c++) {
        if (prev[r][c] && !board[r][c]) { fromR = r; fromC = c; }
        if (board[r][c] && board[r][c] !== prev[r][c] && (!prev[r][c] || getPieceColor(board[r][c]) !== getPieceColor(prev[r][c]))) {
          toR = r; toC = c;
        }
      }
    }
    if (fromR >= 0 && toR >= 0 && !(lastMove && lastMove.to === coordsToSquare(toR, toC))) {
      const dy = (fromR - toR) * 100;
      const dx = (fromC - toC) * 100;
      setAnimDelta({ dx, dy });
      setAnimSquare(coordsToSquare(toR, toC));
      setLastMove({ from: coordsToSquare(fromR, fromC), to: coordsToSquare(toR, toC) });
      if (animTimerRef.current) clearTimeout(animTimerRef.current);
      animTimerRef.current = setTimeout(() => setAnimSquare(null), 220);
    }
  }, [board]);

  // Compute captured pieces by comparing current board with full starting set
  const capturedPieces = useMemo(() => {
    const startingWhite = ["K", "Q", "R", "R", "B", "B", "N", "N", "P", "P", "P", "P", "P", "P", "P", "P"];
    const startingBlack = ["k", "q", "r", "r", "b", "b", "n", "n", "p", "p", "p", "p", "p", "p", "p", "p"];
    const onBoard: string[] = [];
    for (const row of board) {
      for (const p of row) {
        if (p) onBoard.push(p);
      }
    }
    const removeFirst = (arr: string[], val: string) => {
      const idx = arr.indexOf(val);
      if (idx >= 0) arr.splice(idx, 1);
    };
    const whiteRemaining = [...startingWhite];
    const blackRemaining = [...startingBlack];
    for (const p of onBoard) {
      if (p === p.toUpperCase()) removeFirst(whiteRemaining, p);
      else removeFirst(blackRemaining, p);
    }
    // whiteRemaining = white pieces that are NOT on board (captured by black)
    // blackRemaining = black pieces that are NOT on board (captured by white)
    return { capturedByWhite: blackRemaining, capturedByBlack: whiteRemaining };
  }, [board]);

  // Check if king is in check
  const kingInCheck = useMemo(() => {
    const color = myColor;
    const kingPos = findKing(board, color);
    if (!kingPos) return null;
    const enemyColor = color === "white" ? "black" : "white";
    if (isSquareAttacked(board, kingPos[0], kingPos[1], enemyColor)) {
      return coordsToSquare(kingPos[0], kingPos[1]);
    }
    return null;
  }, [board, myColor]);

  const flippedBoard = useMemo(() => {
    if (myColor === "black") {
      return board.map(row => [...row].reverse()).reverse();
    }
    return board;
  }, [board, myColor]);

  const handleSquareClick = useCallback((row: number, col: number) => {
    if (isSpectator || !isMyTurn || status === "finished") return;

    const actualRow = myColor === "black" ? 7 - row : row;
    const actualCol = myColor === "black" ? 7 - col : col;
    const square = coordsToSquare(actualRow, actualCol);
    const piece = board[actualRow][actualCol];

    if (selectedSquare) {
      if (validMoves.includes(square)) {
        const fromPiece = board[squareToCoords(selectedSquare)[0]][squareToCoords(selectedSquare)[1]];
        const isPawn = fromPiece.toUpperCase() === "P";
        const isPromotion = isPawn && (actualRow === 0 || actualRow === 7);

        if (isPromotion) {
          setShowPromotion({ from: selectedSquare, to: square });
        } else {
          const move: ChessMove = {
            from: selectedSquare,
            to: square,
            piece: fromPiece.toUpperCase(),
            captured: piece || undefined,
          };
          onMove(move);
          setLastMove({ from: selectedSquare, to: square });
        }
        setSelectedSquare(null);
        setValidMoves([]);
      } else if (piece && getPieceColor(piece) === myColor) {
        setSelectedSquare(square);
        setValidMoves(getValidMoves(board, actualRow, actualCol, piece, castling, enPassant));
      } else {
        setSelectedSquare(null);
        setValidMoves([]);
      }
    } else {
      if (piece && getPieceColor(piece) === myColor) {
        setSelectedSquare(square);
        setValidMoves(getValidMoves(board, actualRow, actualCol, piece, castling, enPassant));
      }
    }
  }, [selectedSquare, validMoves, board, myColor, isMyTurn, isSpectator, onMove, status, castling, enPassant]);

  const handlePromotion = (promotionPiece: string) => {
    if (!showPromotion) return;
    const fromCoords = squareToCoords(showPromotion.from);
    const fromPiece = board[fromCoords[0]][fromCoords[1]];
    const toCoords = squareToCoords(showPromotion.to);
    const capturedPiece = board[toCoords[0]][toCoords[1]];

    const move: ChessMove = {
      from: showPromotion.from,
      to: showPromotion.to,
      piece: "P",
      captured: capturedPiece || undefined,
      promotion: promotionPiece,
    };
    onMove(move);
    setLastMove({ from: showPromotion.from, to: showPromotion.to });
    setShowPromotion(null);
  };

  const getSquareColor = (row: number, col: number): string => {
    const actualRow = myColor === "black" ? 7 - row : row;
    const actualCol = myColor === "black" ? 7 - col : col;
    const square = coordsToSquare(actualRow, actualCol);
    
    const isLight = (row + col) % 2 === 0;
    let className = isLight ? "bg-amber-100 dark:bg-amber-200" : "bg-amber-700 dark:bg-amber-800";

    if (selectedSquare === square) {
      className = "bg-yellow-400 dark:bg-yellow-500";
    } else if (kingInCheck === square) {
      className = "bg-red-500 dark:bg-red-600";
    } else if (validMoves.includes(square)) {
      className = isLight ? "bg-green-200 dark:bg-green-300" : "bg-green-600 dark:bg-green-700";
    } else if (lastMove && (lastMove.from === square || lastMove.to === square)) {
      className = isLight ? "bg-yellow-200 dark:bg-yellow-300" : "bg-yellow-600 dark:bg-yellow-700";
    }

    return className;
  };

  // Pieces captured by this player (enemy pieces) shown at top, opponent's captures at bottom
  const topCaptures = myColor === "white" ? capturedPieces.capturedByWhite : capturedPieces.capturedByBlack;
  const bottomCaptures = myColor === "white" ? capturedPieces.capturedByBlack : capturedPieces.capturedByWhite;

  return (
    <div className="relative">
      {/* Opponent's captures (pieces they took from us) */}
      {bottomCaptures.length > 0 && (
        <div className="flex items-center gap-0.5 mb-1 min-h-[1.25rem]">
          {bottomCaptures.map((p, i) => (
            <span key={i} className="text-sm sm:text-base opacity-70">{PIECE_SYMBOLS[p]}</span>
          ))}
        </div>
      )}
      <div className="grid grid-cols-8 border-2 border-amber-900 rounded-lg overflow-hidden shadow-lg">
        {flippedBoard.map((rowPieces, row) => (
          rowPieces.map((piece, col) => {
            const actualRow = myColor === "black" ? 7 - row : row;
            const actualCol = myColor === "black" ? 7 - col : col;
            const square = coordsToSquare(actualRow, actualCol);
            const isValidMove = validMoves.includes(square);
            
            return (
              <div
                key={`${row}-${col}`}
                className={cn(
                  "w-10 h-10 sm:w-12 sm:h-12 md:w-14 md:h-14 flex items-center justify-center cursor-pointer relative transition-colors",
                  getSquareColor(row, col),
                  isMyTurn && !isSpectator && "hover:brightness-110",
                  kingInCheck === square && "animate-chess-check"
                )}
                onClick={() => handleSquareClick(row, col)}
                data-testid={`chess-square-${square}`}
              >
                {piece && (
                  <span 
                    className={cn(
                      "text-2xl sm:text-3xl md:text-4xl select-none",
                      isWhitePiece(piece) ? "text-white drop-shadow-[0_1px_1px_rgba(0,0,0,0.8)]" : "text-gray-900",
                      animSquare === square && "animate-chess-move"
                    )}
                    style={animSquare === square ? {
                      "--move-from-x": `${animDelta.dx}%`,
                      "--move-from-y": `${animDelta.dy}%`,
                    } as React.CSSProperties : undefined}
                  >
                    {PIECE_SYMBOLS[piece]}
                  </span>
                )}
                {isValidMove && !piece && (
                  <div className="absolute w-3 h-3 rounded-full bg-green-500/50" />
                )}
                {isValidMove && piece && (
                  <div className="absolute inset-0 border-4 border-green-500/50 rounded-full" />
                )}
                {col === 0 && (
                  <span className="absolute top-0.5 start-0.5 text-xs font-bold text-amber-900/70">
                    {myColor === "black" ? row + 1 : 8 - row}
                  </span>
                )}
                {row === 7 && (
                  <span className="absolute bottom-0.5 end-0.5 text-xs font-bold text-amber-900/70">
                    {myColor === "black" ? FILES[7 - col] : FILES[col]}
                  </span>
                )}
              </div>
            );
          })
        ))}
      </div>

      {/* Our captures (pieces we took from opponent) */}
      {topCaptures.length > 0 && (
        <div className="flex items-center gap-0.5 mt-1 min-h-[1.25rem]">
          {topCaptures.map((p, i) => (
            <span key={i} className="text-sm sm:text-base opacity-70">{PIECE_SYMBOLS[p]}</span>
          ))}
        </div>
      )}

      {showPromotion && (
        <div className="absolute inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="bg-card p-4 rounded-lg shadow-xl">
            <p className="text-center mb-3 font-medium">{language === "ar" ? "اختر الترقية:" : "Choose promotion:"}</p>
            <div className="flex gap-2">
              {["Q", "R", "B", "N"].map((p) => (
                <button
                  key={p}
                  onClick={() => handlePromotion(p)}
                  className="w-14 h-14 bg-amber-100 hover:bg-amber-200 rounded-lg flex items-center justify-center text-3xl"
                  data-testid={`promotion-${p}`}
                >
                  {PIECE_SYMBOLS[myColor === "white" ? p : p.toLowerCase()]}
                </button>
              ))}
            </div>
          </div>
        </div>
      )}

      {status === "finished" && (
        <div className="absolute inset-0 bg-black/30 flex items-center justify-center">
          <span className="text-2xl font-bold text-white drop-shadow-lg">{language === "ar" ? "انتهت اللعبة" : "Game Over"}</span>
        </div>
      )}
    </div>
  );
}
