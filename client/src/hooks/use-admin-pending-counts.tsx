import { useQuery } from "@tanstack/react-query";

interface PendingCounts {
  idVerification: number;
  newUsersToday: number;
  deposits: number;
  withdrawals: number;
  transactions: number;
  complaints: number;
  disputes: number;
  p2p: number;
  alerts: number;
}

export function useAdminPendingCounts() {
  const adminToken = localStorage.getItem("adminToken");

  return useQuery<PendingCounts>({
    queryKey: ["/api/admin/pending-counts"],
    queryFn: async () => {
      const res = await fetch("/api/admin/pending-counts", {
        headers: {
          "x-admin-token": adminToken || "",
        },
      });
      if (!res.ok) throw new Error("Failed to fetch pending counts");
      return res.json();
    },
    enabled: !!adminToken,
    refetchInterval: 20000, // Refresh every 20 seconds
    staleTime: 10000,
  });
}
