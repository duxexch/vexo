import { useQuery, useMutation } from "@tanstack/react-query";
import { queryClient } from "@/lib/queryClient";

function getAdminToken() {
  return localStorage.getItem("adminToken");
}

async function adminFetch(url: string, options?: RequestInit) {
  const token = getAdminToken();
  const res = await fetch(url, {
    ...options,
    headers: {
      "Content-Type": "application/json",
      "x-admin-token": token || "",
      ...options?.headers,
    },
  });
  if (!res.ok) throw new Error("Failed to fetch");
  return res.json();
}

/**
 * Hook to get unread admin alert counts grouped by deepLink section.
 * Returns a map like { "/admin/users": 3, "/admin/p2p": 1 }
 */
export function useAdminAlertCountsBySection() {
  const adminToken = getAdminToken();

  return useQuery<Record<string, number>>({
    queryKey: ["/api/admin/alerts/unread-by-section"],
    queryFn: () => adminFetch("/api/admin/alerts/unread-by-section"),
    enabled: !!adminToken,
    refetchInterval: 15000,
    staleTime: 8000,
  });
}

/**
 * Hook to get entity IDs that have unread alerts for a specific admin section.
 * Used for row highlighting — returns list of entity IDs (user IDs, trade IDs, etc.)
 */
export function useUnreadAlertEntities(deepLink: string) {
  const adminToken = getAdminToken();

  return useQuery<{ entityIds: string[] }>({
    queryKey: ["/api/admin/alerts/unread-entities", deepLink],
    queryFn: () => adminFetch(`/api/admin/alerts/unread-entities?deepLink=${encodeURIComponent(deepLink)}`),
    enabled: !!adminToken && !!deepLink,
    refetchInterval: 15000,
    staleTime: 8000,
  });
}

/**
 * Mutation to mark an admin alert as read by its entity type and ID.
 * Used when clicking a specific row in an admin table.
 */
export function useMarkAlertReadByEntity() {
  return useMutation({
    mutationFn: ({ entityType, entityId }: { entityType: string; entityId: string }) =>
      adminFetch("/api/admin/alerts/read-by-entity", {
        method: "POST",
        body: JSON.stringify({ entityType, entityId }),
      }),
    onSuccess: () => {
      // Invalidate all alert-related queries so counts update everywhere
      queryClient.invalidateQueries({ queryKey: ["/api/admin/alerts"] });
      queryClient.invalidateQueries({ queryKey: ["/api/admin/alerts/count"] });
      queryClient.invalidateQueries({ queryKey: ["/api/admin/alerts/unread-by-section"] });
      queryClient.invalidateQueries({ queryKey: ["/api/admin/alerts/unread-entities"] });
      queryClient.invalidateQueries({ queryKey: ["/api/admin/pending-counts"] });
    },
  });
}
