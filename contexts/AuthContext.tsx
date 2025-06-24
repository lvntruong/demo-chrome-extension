// contexts/AuthContext.tsx - Updated with New Tab Login Support
import React, {
  createContext,
  useContext,
  useReducer,
  useEffect,
  ReactNode,
} from "react";
import { authService } from "../services/authService";
import { User, LoginCredentials, AuthState } from "../types/auth";

// Local interface definitions
interface LoginResponse {
  success: boolean;
  token?: string;
  user?: User;
  expiresIn?: string;
  error?: string;
  code?: string;
}

interface ApiResponse<T = any> {
  success?: boolean;
  data?: T;
  error?: string;
  message?: string;
  code?: string;
}

// Extended action types for new tab login
type AuthAction =
  | { type: "LOGIN_START" }
  | { type: "LOGIN_SUCCESS"; payload: { user: User; token: string } }
  | { type: "LOGIN_FAILURE"; payload: string }
  | { type: "LOGIN_PAGE_OPENED" }
  | { type: "LOGOUT" }
  | { type: "SET_USER"; payload: User | null }
  | { type: "CLEAR_ERROR" }
  | { type: "TOKEN_REFRESH_SUCCESS"; payload: string }
  | { type: "TOKEN_EXPIRED" }
  | { type: "CONNECTION_ERROR"; payload: string }
  | { type: "AUTH_STATE_CHANGED"; payload: { isAuthenticated: boolean; user: User | null } };

// Extended initial state
const initialState: AuthState = {
  isAuthenticated: false,
  user: null,
  isLoading: true, // Start with loading to check stored auth
  error: null,
};

// Reducer with new tab login handling
function authReducer(state: AuthState, action: AuthAction): AuthState {
  switch (action.type) {
    case "LOGIN_START":
      return {
        ...state,
        isLoading: true,
        error: null,
      };
    case "LOGIN_PAGE_OPENED":
      return {
        ...state,
        isLoading: false,
        error: null,
      };
    case "LOGIN_SUCCESS":
      return {
        ...state,
        isLoading: false,
        isAuthenticated: true,
        user: action.payload.user,
        error: null,
      };
    case "LOGIN_FAILURE":
      return {
        ...state,
        isLoading: false,
        isAuthenticated: false,
        user: null,
        error: action.payload,
      };
    case "LOGOUT":
      return {
        ...state,
        isAuthenticated: false,
        user: null,
        error: null,
        isLoading: false,
      };
    case "SET_USER":
      return {
        ...state,
        isAuthenticated: action.payload !== null,
        user: action.payload,
        isLoading: false,
        error: null,
      };
    case "CLEAR_ERROR":
      return {
        ...state,
        error: null,
      };
    case "TOKEN_REFRESH_SUCCESS":
      return {
        ...state,
        error: null, // Clear any previous errors
      };
    case "TOKEN_EXPIRED":
      return {
        ...state,
        isAuthenticated: false,
        user: null,
        error: "Your session has expired. Please log in again.",
        isLoading: false,
      };
    case "CONNECTION_ERROR":
      return {
        ...state,
        error: action.payload,
        isLoading: false,
      };
    case "AUTH_STATE_CHANGED":
      return {
        ...state,
        isAuthenticated: action.payload.isAuthenticated,
        user: action.payload.user,
        isLoading: false,
        error: action.payload.isAuthenticated ? null : state.error, // Keep error if not authenticated
      };
    default:
      return state;
  }
}

// Context type with additional methods
interface AuthContextType {
  state: AuthState;
  login: (credentials: LoginCredentials) => Promise<LoginResponse>;
  logout: () => Promise<void>;
  clearError: () => void;
  refreshToken: () => Promise<boolean>;
  checkConnection: () => Promise<boolean>;
  getAuthToken: () => string | null;
  makeAuthenticatedRequest: <T>(endpoint: string, options?: RequestInit) => Promise<any>;
}

// Create context
const AuthContext = createContext<AuthContextType | undefined>(undefined);

// Provider component
interface AuthProviderProps {
  children: ReactNode;
}

export function AuthProvider({ children }: AuthProviderProps) {
  const [state, dispatch] = useReducer(authReducer, initialState);

  // Listen for auth state changes from AuthService
  useEffect(() => {
    const handleAuthStateChange = (event: CustomEvent) => {
      const { isAuthenticated, user } = event.detail;
      dispatch({
        type: "AUTH_STATE_CHANGED",
        payload: { isAuthenticated, user }
      });
    };

    window.addEventListener('authStateChanged', handleAuthStateChange as EventListener);
    
    return () => {
      window.removeEventListener('authStateChanged', handleAuthStateChange as EventListener);
    };
  }, []);

  // Initialize auth state on mount
  useEffect(() => {
    const initializeAuth = async () => {
      try {
        console.log('🔄 Initializing authentication...');

        // Check backend connectivity first
        const connectionTest = await authService.testConnection();
        if (!connectionTest.connected) {
          console.warn('⚠️ Backend not connected:', connectionTest.error);
          dispatch({ 
            type: "CONNECTION_ERROR", 
            payload: connectionTest.error || 'Backend not available' 
          });
          return;
        }

        // Check if user is authenticated from storage
        const isAuthenticated = authService.isAuthenticated();
        const currentUser = authService.getCurrentUser();

        if (isAuthenticated && currentUser) {
          // Verify with API that token is still valid
          const apiUser = await authService.getCurrentUserFromAPI();
          
          if (apiUser) {
            dispatch({ type: "SET_USER", payload: apiUser });
            console.log('✅ Authentication restored for user:', apiUser.username);
          } else {
            // Token invalid, clear state
            dispatch({ type: "SET_USER", payload: null });
            console.log('⚠️ Stored token invalid, cleared auth state');
          }
        } else {
          dispatch({ type: "SET_USER", payload: null });
          console.log('ℹ️ No stored authentication found');
        }
      } catch (error) {
        console.error('💥 Auth initialization error:', error);
        dispatch({ 
          type: "CONNECTION_ERROR", 
          payload: error instanceof Error ? error.message : 'Initialization failed' 
        });
      }
    };

    initializeAuth();
  }, []);

  // Auto token refresh (check every 5 minutes)
  useEffect(() => {
    if (!state.isAuthenticated) {
      return;
    }

    const refreshInterval = setInterval(async () => {
      try {
        const refreshed = await authService.refreshToken();
        if (refreshed) {
          dispatch({ type: "TOKEN_REFRESH_SUCCESS", payload: "Token refreshed" });
          console.log('🔄 Token auto-refreshed');
        } else {
          dispatch({ type: "TOKEN_EXPIRED" });
          console.warn('⚠️ Token refresh failed, logging out');
        }
      } catch (error) {
        console.error('❌ Auto refresh error:', error);
        dispatch({ type: "TOKEN_EXPIRED" });
      }
    }, 5 * 60 * 1000); // 5 minutes

    return () => clearInterval(refreshInterval);
  }, [state.isAuthenticated]);

  // Listen for Chrome storage changes (auth updates from login page)
  useEffect(() => {
    if (typeof chrome !== 'undefined' && chrome.storage) {
      const handleStorageChange = (changes: any) => {
        if (changes.authState) {
          const newAuthState = changes.authState.newValue;
          if (newAuthState && newAuthState.isLoggedIn && newAuthState.currentUser) {
            console.log('🔄 Auth state updated from storage:', newAuthState.currentUser.username);
            dispatch({
              type: "AUTH_STATE_CHANGED",
              payload: {
                isAuthenticated: newAuthState.isLoggedIn,
                user: newAuthState.currentUser
              }
            });
          } else if (!newAuthState || !newAuthState.isLoggedIn) {
            dispatch({
              type: "AUTH_STATE_CHANGED",
              payload: {
                isAuthenticated: false,
                user: null
              }
            });
          }
        }
      };

      chrome.storage.onChanged.addListener(handleStorageChange);
      
      return () => {
        chrome.storage.onChanged.removeListener(handleStorageChange);
      };
    }
  }, []);

  // Login function with new tab approach
  const login = async (credentials: LoginCredentials): Promise<LoginResponse> => {
    dispatch({ type: "LOGIN_START" });

    try {
      console.log('🔐 Attempting login with new tab approach...');

      // Validate credentials first
      const validation = authService.validateCredentials(credentials);
      if (!validation.isValid) {
        const errorMessage = validation.errors.join(", ");
        dispatch({ type: "LOGIN_FAILURE", payload: errorMessage });
        return { success: false, error: errorMessage, code: 'VALIDATION_ERROR' };
      }

      // Check backend connectivity
      const connectionTest = await authService.testConnection();
      if (!connectionTest.connected) {
        const errorMessage = `Backend not available: ${connectionTest.error}`;
        dispatch({ type: "CONNECTION_ERROR", payload: errorMessage });
        return { success: false, error: errorMessage, code: 'CONNECTION_ERROR' };
      }

      // Open login page in new tab
      const result = await authService.login(credentials);

      if (result.success && result.code === 'LOGIN_PAGE_OPENED') {
        dispatch({ type: "LOGIN_PAGE_OPENED" });
        console.log('✅ Login page opened in new tab');
        return {
          success: true,
          code: 'LOGIN_PAGE_OPENED'
        };
      } else {
        const errorMessage = result.error || "Failed to open login page";
        dispatch({ type: "LOGIN_FAILURE", payload: errorMessage });
        console.error('❌ Login failed:', errorMessage);
        return result;
      }
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : "An unexpected error occurred";
      dispatch({ type: "LOGIN_FAILURE", payload: errorMessage });
      console.error('💥 Login exception:', error);
      return { success: false, error: errorMessage, code: 'EXCEPTION_ERROR' };
    }
  };

  // Logout function
  const logout = async (): Promise<void> => {
    try {
      console.log('🔓 Logging out...');
      await authService.logout();
      dispatch({ type: "LOGOUT" });
      console.log('✅ Logout successful');
    } catch (error) {
      console.error('❌ Logout error:', error);
      // Force logout even if API call fails
      dispatch({ type: "LOGOUT" });
    }
  };

  // Clear error function
  const clearError = (): void => {
    dispatch({ type: "CLEAR_ERROR" });
  };

  // Manual token refresh
  const refreshToken = async (): Promise<boolean> => {
    try {
      const refreshed = await authService.refreshToken();
      if (refreshed) {
        dispatch({ type: "TOKEN_REFRESH_SUCCESS", payload: "Token refreshed" });
        return true;
      } else {
        dispatch({ type: "TOKEN_EXPIRED" });
        return false;
      }
    } catch (error) {
      console.error('❌ Token refresh error:', error);
      dispatch({ type: "TOKEN_EXPIRED" });
      return false;
    }
  };

  // Check backend connection
  const checkConnection = async (): Promise<boolean> => {
    try {
      const result = await authService.testConnection();
      if (!result.connected && result.error) {
        dispatch({ type: "CONNECTION_ERROR", payload: result.error });
      }
      return result.connected;
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Connection check failed';
      dispatch({ type: "CONNECTION_ERROR", payload: errorMessage });
      return false;
    }
  };

  // Get auth token
  const getAuthToken = (): string | null => {
    return authService.getAuthToken();
  };

  // Make authenticated API request
  const makeAuthenticatedRequest = async <T extends any>(
    endpoint: string, 
    options: RequestInit = {}
  ): Promise<ApiResponse<T>> => {
    try {
      const result = await authService.authenticatedRequest<T>(endpoint, options);
      
      if (!result.success) {
        if (result.code === 'TOKEN_EXPIRED') {
          dispatch({ type: "TOKEN_EXPIRED" });
        } else if (result.code === 'NOT_AUTHENTICATED') {
          dispatch({ type: "LOGOUT" });
        }
      }
      
      return result;
    } catch (error) {
      console.error('❌ Authenticated request error:', error);
      throw error;
    }
  };

  const value: AuthContextType = {
    state,
    login,
    logout,
    clearError,
    refreshToken,
    checkConnection,
    getAuthToken,
    makeAuthenticatedRequest,
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

// Custom hook to use auth context
export function useAuth(): AuthContextType {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error("useAuth must be used within an AuthProvider");
  }
  return context;
}

// Export additional utilities
export const withAuth = <P extends object>(
  Component: React.ComponentType<P>
): React.ComponentType<P> => {
  return (props: P) => {
    const { state } = useAuth();

    if (!state.isAuthenticated) {
      return <div>Please log in to access this component.</div>;
    }

    return <Component {...props} />;
  };
};