import { createContext, useContext } from "react";
import { useQuery } from "@tanstack/react-query";

interface PublicSettings {
  sections: Record<string, boolean>;
}

interface SettingsContextType {
  settings: PublicSettings | null;
  isLoading: boolean;
  isSectionEnabled: (section: string) => boolean;
}

const SettingsContext = createContext<SettingsContextType>({
  settings: null,
  isLoading: true,
  isSectionEnabled: () => true,
});

export function SettingsProvider({ children }: { children: React.ReactNode }) {
  const { data: settings, isLoading } = useQuery<PublicSettings>({
    queryKey: ["/api/settings/public"],
    queryFn: async () => {
      const res = await fetch("/api/settings/public");
      if (!res.ok) return { sections: {} };
      return res.json();
    },
    staleTime: 1000 * 60 * 5,
  });

  const isSectionEnabled = (section: string): boolean => {
    if (!settings?.sections) return true;
    return settings.sections[section] !== false;
  };

  return (
    <SettingsContext.Provider value={{ 
      settings: settings || null, 
      isLoading, 
      isSectionEnabled
    }}>
      {children}
    </SettingsContext.Provider>
  );
}

export function useSettings() {
  return useContext(SettingsContext);
}
