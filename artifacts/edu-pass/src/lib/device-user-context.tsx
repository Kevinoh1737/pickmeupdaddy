import { createContext, useContext, useState, useEffect, useCallback, type ReactNode } from "react";
import { useAuth } from "./auth-context";
import { useQueryClient } from "@tanstack/react-query";
import { getGetFamilyLocationsQueryKey } from "@workspace/api-client-react";

const STORAGE_KEY = "pickmeupdaddy_active_child";

interface ActiveChild {
  id: number;
  name: string;
}

interface DeviceUserContextType {
  isChildMode: boolean;
  activeChild: ActiveChild | null;
  setActiveChild: (child: ActiveChild) => void;
  clearChildMode: (childId?: number) => void;
}

const DeviceUserContext = createContext<DeviceUserContextType>({
  isChildMode: false,
  activeChild: null,
  setActiveChild: () => {},
  clearChildMode: () => {},
});

export function DeviceUserProvider({ children }: { children: ReactNode }) {
  const [activeChild, setActiveChildState] = useState<ActiveChild | null>(() => {
    try {
      const stored = localStorage.getItem(STORAGE_KEY);
      return stored ? (JSON.parse(stored) as ActiveChild) : null;
    } catch {
      return null;
    }
  });

  const { isAuthenticated, isLoading } = useAuth();
  const queryClient = useQueryClient();

  useEffect(() => {
    if (!isLoading && !isAuthenticated) {
      setActiveChildState(null);
      try {
        localStorage.removeItem(STORAGE_KEY);
      } catch {
      }
    }
  }, [isAuthenticated, isLoading]);

  const setActiveChild = useCallback((child: ActiveChild) => {
    setActiveChildState(child);
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(child));
    } catch {
    }
  }, []);

  const clearChildMode = useCallback((childId?: number) => {
    setActiveChildState(null);
    try {
      localStorage.removeItem(STORAGE_KEY);
    } catch {
    }

    if (childId != null) {
      const BASE_URL = (import.meta.env.BASE_URL as string ?? "/").replace(/\/$/, "");
      fetch(`${BASE_URL}/api/location/child/${childId}`, { method: "DELETE", credentials: "include" })
        .then(() => {
          queryClient.invalidateQueries({ queryKey: getGetFamilyLocationsQueryKey() });
        })
        .catch(() => {});
    }
  }, [queryClient]);

  return (
    <DeviceUserContext.Provider
      value={{
        isChildMode: activeChild !== null,
        activeChild,
        setActiveChild,
        clearChildMode,
      }}
    >
      {children}
    </DeviceUserContext.Provider>
  );
}

export function useDeviceUser() {
  return useContext(DeviceUserContext);
}
