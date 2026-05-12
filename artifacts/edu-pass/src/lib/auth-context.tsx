import { createContext, useContext, useCallback, type ReactNode } from "react";
import { useGetMe, getGetMeQueryKey } from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";

interface User {
  id: number;
  email: string;
  name: string;
  phone: string | null;
  familyId: number | null;
  role: "owner" | "guardian";
  onboardingCompleted: boolean;
  createdAt: string;
}

interface AuthContextType {
  user: User | null;
  isLoading: boolean;
  isAuthenticated: boolean;
  refreshUser: () => void;
}

const AuthContext = createContext<AuthContextType>({
  user: null,
  isLoading: true,
  isAuthenticated: false,
  refreshUser: () => {},
});

const isDevMode = import.meta.env.DEV;

export function AuthProvider({ children }: { children: ReactNode }) {
  const queryClient = useQueryClient();
  const { data, isLoading, error } = useGetMe({
    query: {
      queryKey: getGetMeQueryKey(),
      retry: isDevMode ? 3 : false,
      retryDelay: 500,
    },
  });

  const user = error ? null : (data as User | undefined) || null;

  const refreshUser = useCallback(() => {
    queryClient.invalidateQueries({ queryKey: getGetMeQueryKey() });
  }, [queryClient]);

  return (
    <AuthContext.Provider value={{ user, isLoading, isAuthenticated: !!user, refreshUser }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  return useContext(AuthContext);
}
