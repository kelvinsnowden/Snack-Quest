import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';
import { StaffUser, Role, RolePermission, AuditLog, WebhookEvent } from '../types/database';

export interface ToastMessage {
  id: string;
  type: 'success' | 'error' | 'info' | 'warning';
  title: string;
  message?: string;
}

interface AppContextType {
  theme: 'dark' | 'light';
  toggleTheme: () => void;
  currentUser: StaffUser | null;
  currentRole: Role | null;
  permissions: RolePermission[];
  isAuthenticated: boolean;
  login: (email: string) => Promise<boolean>;
  logout: () => void;
  checkPermission: (module: string, action: 'view' | 'create' | 'edit' | 'delete' | 'approve') => boolean;
  activeTab: string;
  setActiveTab: (tab: string) => void;
  commandPaletteOpen: boolean;
  setCommandPaletteOpen: (open: boolean) => void;
  toasts: ToastMessage[];
  addToast: (toast: Omit<ToastMessage, 'id'>) => void;
  removeToast: (id: string) => void;
  refreshSystemStats: () => Promise<void>;
  integrationStats: any;
  refetchKey: number;
  triggerRefetch: () => void;
  selectedCustomerId: string;
  setSelectedCustomerId: (id: string) => void;
}

const AppContext = createContext<AppContextType | undefined>(undefined);

export const AppProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  // Theme state
  const [theme, setTheme] = useState<'dark' | 'light'>(() => {
    return (localStorage.getItem('sq_theme') as 'dark' | 'light') || 'dark';
  });

  useEffect(() => {
    localStorage.setItem('sq_theme', theme);
    if (theme === 'dark') {
      document.documentElement.classList.add('dark');
    } else {
      document.documentElement.classList.remove('dark');
    }
  }, [theme]);

  const toggleTheme = () => {
    setTheme((prev) => (prev === 'dark' ? 'light' : 'dark'));
  };

  // Auth State
  const [currentUser, setCurrentUser] = useState<StaffUser | null>(null);
  const [currentRole, setCurrentRole] = useState<Role | null>(null);
  const [permissions, setPermissions] = useState<RolePermission[]>([]);
  const [isAuthenticated, setIsAuthenticated] = useState<boolean>(true); // default logged in as Admin for instant OS preview
  const [activeTab, setActiveTab] = useState<string>('dashboard');
  const [commandPaletteOpen, setCommandPaletteOpen] = useState<boolean>(false);
  const [toasts, setToasts] = useState<ToastMessage[]>([]);
  const [integrationStats, setIntegrationStats] = useState<any>(null);
  const [refetchKey, setRefetchKey] = useState<number>(0);
  const [selectedCustomerId, setSelectedCustomerId] = useState<string>('cust-1');

  const addToast = useCallback((toast: Omit<ToastMessage, 'id'>) => {
    const id = Math.random().toString(36).substring(2, 9);
    setToasts((prev) => [...prev, { ...toast, id }]);
    setTimeout(() => {
      setToasts((prev) => prev.filter((t) => t.id !== id));
    }, 4000);
  }, []);

  const removeToast = useCallback((id: string) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  }, []);

  const fetchCurrentUser = useCallback(async () => {
    try {
      const res = await fetch('/api/v1/auth/me');
      const contentType = res.headers.get('content-type');
      if (res.ok && contentType && contentType.includes('application/json')) {
        const data = await res.json();
        setCurrentUser(data.user);
        setCurrentRole(data.role);
        setPermissions(data.permissions || []);
        setIsAuthenticated(true);
      } else {
        setCurrentUser(null);
        setCurrentRole(null);
        setPermissions([]);
        setIsAuthenticated(false);
      }
    } catch (e) {
      console.error('Failed to fetch auth state', e);
      setIsAuthenticated(false);
    }
  }, []);

  const refreshSystemStats = useCallback(async () => {
    try {
      const res = await fetch('/api/v1/integrations/stats');
      const contentType = res.headers.get('content-type');
      if (res.ok && contentType && contentType.includes('application/json')) {
        const data = await res.json();
        setIntegrationStats(data);
      }
    } catch (e) {
      console.error('Failed to fetch integration stats', e);
    }
  }, []);

  useEffect(() => {
    fetchCurrentUser();
    refreshSystemStats();
  }, [fetchCurrentUser, refreshSystemStats, refetchKey]);

  const login = async (email: string) => {
    try {
      const res = await fetch('/api/v1/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email })
      });
      const contentType = res.headers.get('content-type');
      if (res.ok && contentType && contentType.includes('application/json')) {
        const data = await res.json();
        setCurrentUser(data.user);
        setCurrentRole(data.role);
        setPermissions(data.permissions || []);
        setIsAuthenticated(true);
        addToast({ type: 'success', title: 'Welcome back', message: `Logged in as ${data.user.full_name}` });
        return true;
      } else {
        let errorMsg = 'User not found';
        if (contentType && contentType.includes('application/json')) {
          const err = await res.json().catch(() => null);
          if (err?.error) errorMsg = err.error;
        }
        addToast({ type: 'error', title: 'Login Failed', message: errorMsg });
        return false;
      }
    } catch (e) {
      addToast({ type: 'error', title: 'Error', message: 'Network request failed' });
      return false;
    }
  };

  const logout = () => {
    setCurrentUser(null);
    setCurrentRole(null);
    setPermissions([]);
    setIsAuthenticated(false);
    addToast({ type: 'info', title: 'Signed Out', message: 'You have been signed out safely' });
  };

  const checkPermission = (module: string, action: 'view' | 'create' | 'edit' | 'delete' | 'approve') => {
    if (!currentUser) return false;
    if (currentRole?.name === 'Administrator') return true;

    const perm = permissions.find((p) => p.module === module);
    if (!perm) return false;

    switch (action) {
      case 'view': return perm.can_view;
      case 'create': return perm.can_create;
      case 'edit': return perm.can_edit;
      case 'delete': return perm.can_delete;
      case 'approve': return perm.can_approve;
      default: return false;
    }
  };

  const triggerRefetch = () => {
    setRefetchKey((prev) => prev + 1);
  };

  return (
    <AppContext.Provider
      value={{
        theme,
        toggleTheme,
        currentUser,
        currentRole,
        permissions,
        isAuthenticated,
        login,
        logout,
        checkPermission,
        activeTab,
        setActiveTab,
        commandPaletteOpen,
        setCommandPaletteOpen,
        toasts,
        addToast,
        removeToast,
        refreshSystemStats,
        integrationStats,
        refetchKey,
        triggerRefetch,
        selectedCustomerId,
        setSelectedCustomerId
      }}
    >
      {children}
    </AppContext.Provider>
  );
};

export const useApp = () => {
  const context = useContext(AppContext);
  if (!context) {
    throw new Error('useApp must be used within an AppProvider');
  }
  return context;
};
