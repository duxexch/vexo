import { createContext, useContext } from 'react';
import type { BoardTheme } from '@/lib/chess-themes';
import { getDefaultTheme } from '@/lib/chess-themes';

const ChessThemeContext = createContext<BoardTheme>(getDefaultTheme());

export function ChessThemeProvider({
    theme,
    children,
}: {
    theme: BoardTheme;
    children: React.ReactNode;
}) {
    return <ChessThemeContext.Provider value={theme}>{children}</ChessThemeContext.Provider>;
}

export function useChessTheme(): BoardTheme {
    return useContext(ChessThemeContext);
}
