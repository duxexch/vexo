import { createContext, useContext, useState, useEffect, type ReactNode } from "react";
import type { User } from "@shared/schema";

interface OneClickResult {
  user: User;
  token: string;
  credentials: {
    accountId: string;
    password: string;
  };
  message: string;
}

interface AuthContextType {
  user: User | null;
  token: string | null;
  login: (username: string, password: string) => Promise<void>;
  loginByAccount: (accountId: string, password: string) => Promise<void>;
  loginByPhone: (phone: string, password: string) => Promise<void>;
  loginByEmail: (email: string, password: string) => Promise<void>;
  oneClickRegister: (referralCode?: string) => Promise<OneClickResult>;
  confirmOneClickLogin: (user: User, token: string) => void;
  register: (data: RegisterData) => Promise<void>;
  logout: () => void;
  isLoading: boolean;
  isAuthenticated: boolean;
  updateUser: (user: User) => void;
  refreshUser: () => Promise<void>;
}

interface RegisterData {
  username: string;
  password: string;
  email?: string;
  firstName?: string;
  lastName?: string;
  referralCode?: string;
}

const AuthContext = createContext<AuthContextType | null>(null);

const USER_CACHE_KEY = "pwm_user_cache";
const CACHE_TTL = 60 * 1000;

interface CachedUser {
  data: User;
  etag: string;
  cachedAt: number;
}

function getCachedUser(): CachedUser | null {
  try {
    const cached = localStorage.getItem(USER_CACHE_KEY);
    if (cached) {
      const parsed = JSON.parse(cached) as CachedUser;
      if (Date.now() - parsed.cachedAt < CACHE_TTL) {
        return parsed;
      }
    }
  } catch {}
  return null;
}

function setCachedUser(data: User, etag: string) {
  try {
    localStorage.setItem(USER_CACHE_KEY, JSON.stringify({
      data,
      etag,
      cachedAt: Date.now()
    }));
  } catch {}
}

function clearUserCache() {
  localStorage.removeItem(USER_CACHE_KEY);
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [token, setToken] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    const savedToken = localStorage.getItem("pwm_token");
    if (savedToken) {
      setToken(savedToken);
      
      const cached = getCachedUser();
      if (cached) {
        setUser(cached.data);
        setIsLoading(false);
        fetchUser(savedToken, cached.etag);
      } else {
        fetchUser(savedToken);
      }
    } else {
      setIsLoading(false);
    }
  }, []);

  const fetchUser = async (authToken: string, cachedEtag?: string) => {
    try {
      const headers: Record<string, string> = { Authorization: `Bearer ${authToken}` };
      if (cachedEtag && cachedEtag.length > 0) {
        headers["If-None-Match"] = cachedEtag;
      }
      
      const res = await fetch("/api/auth/me", { headers });
      
      if (res.status === 304 && cachedEtag) {
        return;
      }
      
      if (res.ok) {
        const userData = await res.json();
        const etag = res.headers.get("ETag");
        setUser(userData);
        if (etag && etag.length > 0) {
          setCachedUser(userData, etag);
        }
      } else {
        localStorage.removeItem("pwm_token");
        clearUserCache();
        setToken(null);
      }
    } catch {
      localStorage.removeItem("pwm_token");
      clearUserCache();
      setToken(null);
    } finally {
      setIsLoading(false);
    }
  };

  const login = async (username: string, password: string) => {
    const res = await fetch("/api/auth/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ username, password }),
    });
    
    if (!res.ok) {
      const errorData = await res.json();
      const err = new Error(errorData.error || "Login failed") as Error & { errorCode?: string; correctMethod?: string };
      err.errorCode = errorData.errorCode;
      err.correctMethod = errorData.correctMethod;
      throw err;
    }
    
    const data = await res.json();
    setUser(data.user);
    setToken(data.token);
    localStorage.setItem("pwm_token", data.token);
    clearUserCache();
  };

  const loginByAccount = async (accountId: string, password: string) => {
    const res = await fetch("/api/auth/login-by-account", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ accountId, password }),
    });
    
    if (!res.ok) {
      const errorData = await res.json();
      const err = Object.assign(new Error(errorData.error || "Login failed"), {
        errorCode: errorData.errorCode as string | undefined,
        correctMethod: errorData.correctMethod as string | undefined,
      });
      throw err;
    }
    
    const data = await res.json();
    setUser(data.user);
    setToken(data.token);
    localStorage.setItem("pwm_token", data.token);
    clearUserCache();
  };

  const loginByPhone = async (phone: string, password: string) => {
    const res = await fetch("/api/auth/login-by-phone", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ phone, password }),
    });
    
    if (!res.ok) {
      const errorData = await res.json();
      const err = Object.assign(new Error(errorData.error || "Login failed"), {
        errorCode: errorData.errorCode as string | undefined,
        correctMethod: errorData.correctMethod as string | undefined,
      });
      throw err;
    }
    
    const data = await res.json();
    setUser(data.user);
    setToken(data.token);
    localStorage.setItem("pwm_token", data.token);
    clearUserCache();
  };

  const loginByEmail = async (email: string, password: string) => {
    const res = await fetch("/api/auth/login-by-email", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email, password }),
    });
    
    if (!res.ok) {
      const errorData = await res.json();
      const err = Object.assign(new Error(errorData.error || "Login failed"), {
        errorCode: errorData.errorCode as string | undefined,
        correctMethod: errorData.correctMethod as string | undefined,
      });
      throw err;
    }
    
    const data = await res.json();
    setUser(data.user);
    setToken(data.token);
    localStorage.setItem("pwm_token", data.token);
    clearUserCache();
  };

  const oneClickRegister = async (referralCode?: string): Promise<OneClickResult> => {
    const res = await fetch("/api/auth/one-click-register", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ referralCode: referralCode || undefined }),
    });
    
    if (!res.ok) {
      const error = await res.json();
      throw new Error(error.error || "Registration failed");
    }
    
    const data = await res.json();
    return data;
  };

  const confirmOneClickLogin = (userData: User, authToken: string) => {
    setUser(userData);
    setToken(authToken);
    localStorage.setItem("pwm_token", authToken);
  };

  const register = async (data: RegisterData) => {
    const res = await fetch("/api/auth/register", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(data),
    });
    
    if (!res.ok) {
      const error = await res.json();
      throw new Error(error.error || "Registration failed");
    }
    
    const result = await res.json();
    setUser(result.user);
    setToken(result.token);
    localStorage.setItem("pwm_token", result.token);
  };

  const logout = () => {
    setUser(null);
    setToken(null);
    localStorage.removeItem("pwm_token");
    clearUserCache();
  };

  const updateUser = (newUser: User) => {
    setUser(newUser);
    clearUserCache();
  };

  const refreshUser = async () => {
    const savedToken = localStorage.getItem("pwm_token");
    if (savedToken) {
      await fetchUser(savedToken);
    }
  };

  useEffect(() => {
    if (!token) return;
    
    const interval = setInterval(() => {
      fetchUser(token);
    }, 30000);
    
    return () => clearInterval(interval);
  }, [token]);

  return (
    <AuthContext.Provider
      value={{
        user,
        token,
        login,
        loginByAccount,
        loginByPhone,
        loginByEmail,
        oneClickRegister,
        confirmOneClickLogin,
        register,
        logout,
        isLoading,
        isAuthenticated: !!user,
        updateUser,
        refreshUser,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error("useAuth must be used within AuthProvider");
  }
  return context;
}

export function useAuthHeaders() {
  const { token } = useAuth();
  return {
    Authorization: token ? `Bearer ${token}` : "",
    "Content-Type": "application/json",
  };
}
