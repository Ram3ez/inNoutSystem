'use client';

import React, { createContext, useContext, useEffect, useState } from 'react';
import { account, OAuthProvider, databases, teams } from '@/lib/appwrite';
import { Models } from 'appwrite';
import { useRouter, usePathname } from 'next/navigation';

interface AuthContextType {
    user: Models.User<Models.Preferences> | null;
    isLoading: boolean;
    isRegistrationRequired: boolean;
    studentData: Models.Document | null;
    loginWithGoogle: () => Promise<void>;
    logout: () => Promise<void>;
    isAdmin: boolean;
    isKiosk: boolean;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
    const [user, setUser] = useState<Models.User<Models.Preferences> | null>(null);
    const [isLoading, setIsLoading] = useState(true);
    const [isRegistrationRequired, setIsRegistrationRequired] = useState(false);
    const [studentData, setStudentData] = useState<Models.Document | null>(null);
    const [isAdmin, setIsAdmin] = useState(false);
    const [isKiosk, setIsKiosk] = useState(false);
    const router = useRouter();
    const pathname = usePathname();

    const DB_ID = "69cb970a000853f23489";
    const COLL_STUDENTS = "student_details";

    useEffect(() => {
        checkUser();
    }, []);

    const checkUser = async () => {
        try {
            const currentUser = await account.get();
            setUser(currentUser);

            // Check Admin & Kiosk Status
            try {
                const teamList = await teams.list();
                setIsAdmin(teamList.teams.some(team => team.$id === "69ef1f3500234902b8e8"));
                setIsKiosk(teamList.teams.some(team => team.$id === "69ef205100213c8cc871"));
            } catch (teamError) {
                console.warn('Membership check failed:', teamError);
                setIsAdmin(false);
                setIsKiosk(false);
            }

            // Check if student exists in database
            if (currentUser.email) {
                const rollNumber = currentUser.email.split('@')[0].toUpperCase();
                try {
                    const data = await databases.getDocument(DB_ID, COLL_STUDENTS, rollNumber);
                    setStudentData(data);
                    setIsRegistrationRequired(false);
                } catch (dbError: any) {
                    // If document doesn't exist, we need registration
                    if (dbError.code === 404) {
                        setStudentData(null);
                        setIsRegistrationRequired(true);
                    } else {
                        console.error('Database check failed:', dbError);
                    }
                }
            }
        } catch (error) {
            setUser(null);
            setStudentData(null);
            setIsRegistrationRequired(false);
            setIsAdmin(false);
            setIsKiosk(false);
            if (pathname !== '/login') {
                // Keep on current page for now, or redirect to login
                // router.push('/login');
            }
        } finally {
            setIsLoading(false);
        }
    };

    const loginWithGoogle = async () => {
        try {
            // In web, OAuth2 is handled by redirect
            account.createOAuth2Session({
                provider: OAuthProvider.Google,
                success: window.location.origin + '/',
                failure: window.location.origin + '/login'
            });
        } catch (error) {
            console.error('Google login failed:', error);
        }
    };

    const logout = async () => {
        try {
            await account.deleteSession('current');
            setUser(null);
            router.push('/login');
        } catch (error) {
            console.error('Logout failed:', error);
        }
    };

    return (
        <AuthContext.Provider value={{ user, isLoading, isRegistrationRequired, studentData, loginWithGoogle, logout, isAdmin, isKiosk }}>
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
