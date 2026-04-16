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
const heavyPrefetchPaths = new Set<string>([
  "/chat",
  "/p2p",
  "/multiplayer",
  "/support",
  "/transactions",
  "/complaints",
]);

type PrefetchTrigger = "hover" | "touch" | "programmatic";

type ConnectionLike = {
  saveData?: boolean;
  effectiveType?: string;
};

type NavigatorWithNetwork = Navigator & {
  connection?: ConnectionLike;
  mozConnection?: ConnectionLike;
  webkitConnection?: ConnectionLike;
  deviceMemory?: number;
};

function getConnectionInfo(): ConnectionLike | undefined {
  if (typeof navigator === "undefined") return undefined;
  const nav = navigator as NavigatorWithNetwork;
  return nav.connection || nav.mozConnection || nav.webkitConnection;
}

function hasConstrainedNetwork(): boolean {
  const connection = getConnectionInfo();
  if (!connection) return false;

  if (connection.saveData) {
    return true;
  }

  const connectionType = (connection.effectiveType || "").toLowerCase();
  return connectionType === "slow-2g" || connectionType === "2g";
}

function hasConstrainedDevice(): boolean {
  if (typeof navigator === "undefined" || typeof window === "undefined") {
    return false;
  }

  const nav = navigator as NavigatorWithNetwork;
  const deviceMemory = typeof nav.deviceMemory === "number" ? nav.deviceMemory : 8;
  const cpuThreads = typeof navigator.hardwareConcurrency === "number" ? navigator.hardwareConcurrency : 8;
  const isPhoneOrSmallTablet = window.matchMedia("(max-width: 900px)").matches;

  return isPhoneOrSmallTablet && (deviceMemory <= 4 || cpuThreads <= 4);
}

function shouldPrefetchPath(path: string, trigger: PrefetchTrigger): boolean {
  if (prefetchedPaths.has(path)) {
    return false;
  }

  if (!pageModules[path]) {
    return false;
  }

  const constrainedNetwork = hasConstrainedNetwork();
  const constrainedDevice = hasConstrainedDevice();
  const heavyRoute = heavyPrefetchPaths.has(path);

  if (constrainedNetwork && heavyRoute) {
    return false;
  }

  if (trigger === "touch" && (constrainedNetwork || (constrainedDevice && heavyRoute))) {
    return false;
  }

  if (trigger === "programmatic" && constrainedDevice && heavyRoute) {
    return false;
  }

  return true;
}

interface PrefetchLinkProps {
  href: string;
  children: ReactNode;
  className?: string;
  onClick?: () => void;
}

export function PrefetchLink({ href, children, className, onClick }: PrefetchLinkProps) {
  const [isPrefetched, setIsPrefetched] = useState(false);

  const prefetchWithTrigger = useCallback((trigger: PrefetchTrigger) => {
    if (isPrefetched || prefetchedPaths.has(href)) return;

    if (!shouldPrefetchPath(href, trigger)) return;

    const loader = pageModules[href];
    if (loader) {
      loader().then(() => {
        prefetchedPaths.add(href);
        setIsPrefetched(true);
      });
    }
  }, [href, isPrefetched]);

  const handleMouseEnter = useCallback(() => {
    prefetchWithTrigger("hover");
  }, [prefetchWithTrigger]);

  const handleTouchStart = useCallback(() => {
    prefetchWithTrigger("touch");
  }, [prefetchWithTrigger]);

  return (
    <Link href={href}>
      <span
        className={className}
        onMouseEnter={handleMouseEnter}
        onTouchStart={handleTouchStart}
        onClick={onClick}
      >
        {children}
      </span>
    </Link>
  );
}

export function prefetchPage(path: string) {
  if (!shouldPrefetchPath(path, "programmatic")) return;

  const loader = pageModules[path];
  if (loader) {
    loader().then(() => {
      prefetchedPaths.add(path);
    });
  }
}
