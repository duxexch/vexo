import { QueryClient, QueryFunction } from "@tanstack/react-query";

async function throwIfResNotOk(res: Response) {
  if (!res.ok) {
    const text = (await res.text()) || res.statusText;
    throw new Error(`${res.status}: ${text}`);
  }
}

function getAuthHeaders(url: string): Record<string, string> {
  const headers: Record<string, string> = {};

  // For admin endpoints, use adminToken
  if (url.includes("/api/admin/")) {
    const adminToken = localStorage.getItem("adminToken");
    if (adminToken) {
      headers["x-admin-token"] = adminToken;
    }
  } else {
    // For regular endpoints, use user token
    const token = localStorage.getItem("pwm_token");
    if (token) {
      headers["Authorization"] = `Bearer ${token}`;
    }
  }

  return headers;
}

export async function apiRequest(
  method: string,
  url: string,
  data?: unknown | undefined,
  options?: { headers?: Record<string, string> },
): Promise<Response> {
  const headers = {
    ...getAuthHeaders(url),
    ...(options?.headers || {}),
  };

  if (data && !headers["Content-Type"]) {
    headers["Content-Type"] = "application/json";
  }

  const res = await fetch(url, {
    method,
    headers,
    body: data ? JSON.stringify(data) : undefined,
    credentials: "include",
  });

  await throwIfResNotOk(res);
  return res;
}

type UnauthorizedBehavior = "returnNull" | "throw";
export const getQueryFn: <T>(options: {
  on401: UnauthorizedBehavior;
}) => QueryFunction<T> =
  ({ on401: unauthorizedBehavior }) =>
    async ({ queryKey }) => {
      const url = queryKey[0] as string;
      const headers = getAuthHeaders(url);

      const res = await fetch(url, {
        credentials: "include",
        headers,
      });

      if (unauthorizedBehavior === "returnNull" && res.status === 401) {
        return null;
      }

      await throwIfResNotOk(res);
      return await res.json();
    };

export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      queryFn: getQueryFn({ on401: "throw" }),
      refetchInterval: false,
      refetchOnWindowFocus: false,
      staleTime: 10 * 60 * 1000,
      gcTime: 15 * 60 * 1000,
      retry: false,
    },
    mutations: {
      retry: false,
    },
  },
});

/**
 * Query options for financial/wallet data that must stay fresh.
 * Use these overrides on any useQuery that fetches balance, wallet, or transaction data.
 */
export const financialQueryOptions = {
  staleTime: 30_000,          // 30 seconds — financial data should be near-real-time
  gcTime: 60_000,             // 1 minute GC
  refetchOnWindowFocus: true,  // re-check balance when user tabs back
  refetchOnReconnect: true,    // re-check after network recovery
} as const;

export function prefetchGames() {
  queryClient.prefetchQuery({
    queryKey: ['/api/games/challenges'],
  });
}
