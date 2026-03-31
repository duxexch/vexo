import { Link } from "wouter";
import { useCallback, useState, type ReactNode } from "react";

const pageModules: Record<string, () => Promise<unknown>> = {
  "/": () => import("@/pages/dashboard"),
  "/wallet": () => import("@/pages/wallet"),
  "/challenges": () => import("@/pages/challenges"),
  "/games": () => import("@/pages/games-catalog"),
  "/p2p": () => import("@/pages/p2p"),
  "/friends": () => import("@/pages/friends"),
  "/chat": () => import("@/pages/chat"),
  "/multiplayer": () => import("@/pages/multiplayer"),
  "/free": () => import("@/pages/free"),
  "/transactions": () => import("@/pages/transactions"),
  "/complaints": () => import("@/pages/complaints"),
  "/support": () => import("@/pages/support"),
  "/settings": () => import("@/pages/settings"),
};

const prefetchedPaths = new Set<string>();

interface PrefetchLinkProps {
  href: string;
  children: ReactNode;
  className?: string;
  onClick?: () => void;
}

export function PrefetchLink({ href, children, className, onClick }: PrefetchLinkProps) {
  const [isPrefetched, setIsPrefetched] = useState(false);

  const handleMouseEnter = useCallback(() => {
    if (isPrefetched || prefetchedPaths.has(href)) return;
    
    const loader = pageModules[href];
    if (loader) {
      loader().then(() => {
        prefetchedPaths.add(href);
        setIsPrefetched(true);
      });
    }
  }, [href, isPrefetched]);

  return (
    <Link href={href}>
      <span 
        className={className} 
        onMouseEnter={handleMouseEnter}
        onTouchStart={handleMouseEnter}
        onClick={onClick}
      >
        {children}
      </span>
    </Link>
  );
}

export function prefetchPage(path: string) {
  if (prefetchedPaths.has(path)) return;
  
  const loader = pageModules[path];
  if (loader) {
    loader().then(() => {
      prefetchedPaths.add(path);
    });
  }
}
