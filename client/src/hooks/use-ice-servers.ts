import { useQuery } from "@tanstack/react-query";
import { useMemo, useRef } from "react";
import type { IceServersResponse } from "@shared/socketio-events";

const DEFAULT_FALLBACK: IceServersResponse = {
  iceServers: [{ urls: "stun:stun.l.google.com:19302" }],
  ttlSeconds: 0,
  hasRelay: false,
};

const REFRESH_HEADROOM_SECONDS = 60;
const MIN_REFETCH_MS = 5 * 60_000;
const MAX_REFETCH_MS = 60 * 60_000;

async function fetchIceServers(): Promise<IceServersResponse> {
  const res = await fetch("/api/rtc/ice-servers", { credentials: "include" });
  if (!res.ok) {
    throw new Error(`ice-servers failed: ${res.status}`);
  }
  return (await res.json()) as IceServersResponse;
}

export interface UseIceServersResult {
  rtcConfiguration: RTCConfiguration;
  hasRelay: boolean;
  isLoading: boolean;
  iceServersRef: React.MutableRefObject<RTCIceServer[]>;
}

export function useIceServers(): UseIceServersResult {
  const { data, isLoading } = useQuery<IceServersResponse>({
    queryKey: ["/api/rtc/ice-servers"],
    queryFn: fetchIceServers,
    staleTime: MIN_REFETCH_MS,
    refetchOnWindowFocus: false,
    refetchInterval: (query) => {
      const ttl = query.state.data?.ttlSeconds ?? 0;
      if (ttl <= 0) return MAX_REFETCH_MS;
      const refreshMs = Math.max(0, ttl - REFRESH_HEADROOM_SECONDS) * 1000;
      return Math.min(MAX_REFETCH_MS, Math.max(MIN_REFETCH_MS, refreshMs));
    },
  });

  const effective = data ?? DEFAULT_FALLBACK;

  const iceServers = useMemo<RTCIceServer[]>(
    () => effective.iceServers.map((s) => {
      const out: RTCIceServer = { urls: s.urls };
      if (s.username) out.username = s.username;
      if (s.credential) out.credential = s.credential;
      return out;
    }),
    [effective.iceServers],
  );

  const iceServersRef = useRef<RTCIceServer[]>(iceServers);
  iceServersRef.current = iceServers;

  const rtcConfiguration = useMemo<RTCConfiguration>(
    () => ({ iceServers, iceTransportPolicy: "all" }),
    [iceServers],
  );

  return {
    rtcConfiguration,
    hasRelay: effective.hasRelay,
    isLoading,
    iceServersRef,
  };
}
