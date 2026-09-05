/* eslint-disable react-refresh/only-export-components */
import { createContext, useContext, useEffect, useState } from 'react';
import { authService, socket } from '../services/api';

const AuthContext = createContext();
const TOKEN_KEY = 'fuelops_token';
const USER_KEY = 'fuelops_user';

export const useAuth = () => useContext(AuthContext);

export const AuthProvider = ({ children }) => {
  const [user, setUser] = useState(() => {
    try {
      return JSON.parse(localStorage.getItem(USER_KEY));
    } catch {
      return null;
    }
  });
  const [token, setToken] = useState(() => localStorage.getItem(TOKEN_KEY));
  const [loading, setLoading] = useState(true);

  const clearSession = () => {
    localStorage.removeItem(TOKEN_KEY);
    localStorage.removeItem(USER_KEY);
    setToken(null);
    setUser(null);
    socket.disconnect();
  };

  useEffect(() => {
    let active = true;

    const restoreSession = async () => {
      if (!token) {
        setLoading(false);
        return;
      }

      try {
        const response = await authService.me();
        if (!active) return;
        setUser(response.data);
        localStorage.setItem(USER_KEY, JSON.stringify(response.data));
        socket.connect();
      } catch {
        if (active) clearSession();
      } finally {
        if (active) setLoading(false);
      }
    };

    restoreSession();
    return () => { active = false; };
  }, [token]);

  const login = async (email, password) => {
    try {
      const response = await authService.login({ email, password });
      const { token: newToken, user: userData } = response.data;
      localStorage.setItem(TOKEN_KEY, newToken);
      localStorage.setItem(USER_KEY, JSON.stringify(userData));
      setUser(userData);
      setToken(newToken);
      socket.connect();
      return { success: true };
    } catch (error) {
      return {
        success: false,
        error: error.response?.data?.error || 'Unable to sign in'
      };
    }
  };

  return (
    <AuthContext.Provider value={{ user, token, loading, login, logout: clearSession, isAuthenticated: Boolean(token && user) }}>
      {!loading && children}
    </AuthContext.Provider>
  );
};
