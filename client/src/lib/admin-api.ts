export function getAdminToken(): string | null {
    return localStorage.getItem("adminToken");
}

export async function adminFetch(url: string, options: RequestInit = {}) {
    const token = getAdminToken();
    const res = await fetch(url, {
        ...options,
        headers: {
            "x-admin-token": token || "",
            ...options.headers,
        },
    });

    if (!res.ok) {
        throw new Error("Failed to fetch");
    }

    return res.json();
}