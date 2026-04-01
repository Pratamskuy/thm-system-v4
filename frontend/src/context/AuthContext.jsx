import { createContext, useContext, useState, useEffect } from 'react';
import { authAPI } from '../services/api';

const AuthContext = createContext(null);

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
};

export const AuthProvider = ({ children }) => {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    // Check if user is logged in on mount
    const token = localStorage.getItem('token');
    if (token) {
      loadUser();
    } else {
      setLoading(false);
    }
  }, []);

  const loadUser = async () => {
    try {
      const data = await authAPI.getProfile();
      setUser(data.data);
    } catch (error) {
      console.error('Failed to load user:', error);
      localStorage.removeItem('token');
    } finally {
      setLoading(false);
    }
  };

  const login = async (email, password) => {
    try {
      const data = await authAPI.login(email, password);
      localStorage.setItem('token', data.token);
  
      await loadUser(); 
  
      return { success: true };
    } catch (error) {
      return { success: false, error: error.message };
    }
  };
  const register = async (userData) => {
    try {
      const data = await authAPI.register(userData);
      return { success: true, data };
    } catch (error) {
      return { success: false, error: error.message };
    }
  };

  const logout = () => {
    localStorage.removeItem('token');
    setUser(null);
  };

  const isAdmin = () => user?.role_id === 1;
  const isPetugas = () => user?.role_id === 2;
  const isPeminjam = () => user?.role_id === 3;
  const isAdminOrPetugas = () => isAdmin() || isPetugas();

  const value = {
    user,
    loading,
    login,
    register,
    logout,
    isAdmin,
    isPetugas,
    isPeminjam,
    isAdminOrPetugas,
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
};