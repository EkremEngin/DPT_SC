import React, { createContext, useContext, useState, useEffect } from 'react';
import { api } from '../services/api';

interface User {
    id: string;
    username: string;
    role: 'ADMIN' | 'MANAGER' | 'VIEWER';
}

interface AuthContextType {
    user: User | null;
    token: string | null;
    login: (credentials: any) => Promise<void>;
    logout: () => void;
    isAuthenticated: boolean;
    isLoading: boolean;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
    const [user, setUser] = useState<User | null>(null);
    const [token, setToken] = useState<string | null>(localStorage.getItem('token'));
    const [isLoading, setIsLoading] = useState(true);

    // Verify token on app load
    useEffect(() => {
        const verifyToken = async () => {
            const storedToken = localStorage.getItem('token');
            if (storedToken) {
                try {
                    // Call GET /api/auth/me to verify token
                    const userData = await api.getMe();
                    setUser(userData);
                    setToken(storedToken);
                    localStorage.setItem('user', JSON.stringify(userData));
                } catch (error: any) {
                    // Token is invalid or expired
                    if (error?.status === 401 || error?.message?.includes('401')) {
                        localStorage.removeItem('token');
                        localStorage.removeItem('user');
                        setToken(null);
                        setUser(null);
                    }
                }
            }
            setIsLoading(false);
        };

        verifyToken();
    }, []);

    const login = async (credentials: any) => {
        const response = await api.login(credentials);
        const { accessToken, user } = response;

        setToken(accessToken);
        setUser(user);

        localStorage.setItem('token', accessToken);
        localStorage.setItem('user', JSON.stringify(user));
    };

    const logout = () => {
        setToken(null);
        setUser(null);
        localStorage.removeItem('token');
        localStorage.removeItem('user');
    };

    return (
        <AuthContext.Provider value={{ user, token, login, logout, isAuthenticated: !!token, isLoading }}>
            {children}
        </AuthContext.Provider>
    );
};

export const useAuth = () => {
    const context = useContext(AuthContext);
    if (context === undefined) {
        throw new Error('useAuth must be used within an AuthProvider');
    }
    return context;
};
