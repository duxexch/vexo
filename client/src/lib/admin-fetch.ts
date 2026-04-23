function getAdminToken(): string | null {
  try {
    return localStorage.getItem("adminToken");
  } catch {
    return null;
  }
}

export async function adminFetch(url: string, options?: RequestInit): Promise<unknown> {
  const token = getAdminToken();
  const res = await fetch(url, {
    ...options,
    headers: {
      "Content-Type": "application/json",
      "x-admin-token": token || "",
      ...options?.headers,
    },
  });
  if (!res.ok) {
    const error = (await res.json().catch(() => ({ error: "Request failed" }))) as { error?: string };
    throw new Error(error.error || "Request failed");
  }
  return res.json();
}
