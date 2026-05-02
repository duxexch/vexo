import { useQuery } from "@tanstack/react-query";
import { useMemo, useRef, type MutableRefObject } from "react";
import type { IceServersResponse as SharedIceServersResponse } from "@shared/socketio-events";
import { apiRequest } from "@/lib/queryClient";
import { buildRtcConfiguration } from "@/lib/rtc-config";

type IceServersResponse = SharedIceServersResponse & {
  iceTransportPolicy?: "all" | "relay";
};

const DEFAULT_FALLBACK: IceServersResponse = {
  iceServers: [{ urls: "stun:stun.l.google.com:19302" }],
  ttlSeconds: 0,
  hasRelay: false,
};

const REFRESH_HEADROOM_SECONDS = 60;
const MIN_REFETCH_MS = 5 * 60_000;
const MAX_REFETCH_MS = 60 * 60_000;

async function fetchIceServers(): Promise<IceServersResponse> {
  // Use the shared apiRequest helper so the request carries the Authorization
  // Bearer token (and CSRF header) every other authenticated query uses. A
  // raw fetch with credentials:"include" only works while the cookie path is
  // valid, which would silently 401 → STUN-only fallback for token-only
  // sessions.
  const res = await apiRequest("GET", "/api/rtc/ice-servers");
  return (await res.json()) as IceServersResponse;
}

export interface UseIceServersResult {
  rtcConfiguration: RTCConfiguration;
  hasRelay: boolean;
  isLoading: boolean;
  iceServersRef: MutableRefObject<RTCIceServer[]>;
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

  const rtcConfiguration = useMemo<RTCConfiguration>(() => {
    return buildRtcConfiguration({
      iceServers: effective.iceServers,
      iceTransportPolicy: effective.iceTransportPolicy,
    });
  }, [effective.iceTransportPolicy, effective.iceServers]);

  return {
    rtcConfiguration,
    hasRelay: effective.hasRelay,
    isLoading,
    iceServersRef,
  };
}
