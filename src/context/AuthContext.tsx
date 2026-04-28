"use client";

import React, { createContext, useContext, useEffect, useState } from "react";
import { account, OAuthProvider, databases, teams } from "@/lib/appwrite";
import { Models } from "appwrite";
import { useRouter, usePathname } from "next/navigation";
import { Student } from "@/types/models";
import { DB_ID, COLLECTIONS, TEAMS } from "@/lib/constants";

interface AuthContextType {
  user: Models.User<Models.Preferences> | null;
  isLoading: boolean;
  isRegistrationRequired: boolean;
  studentData: Student | null;
  loginWithGoogle: () => Promise<void>;
  logout: () => Promise<void>;
  isAdmin: boolean;
  isKiosk: boolean;
  isFaculty: boolean;
  isCaretaker: boolean;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({
  children,
}) => {
  const [user, setUser] = useState<Models.User<Models.Preferences> | null>(
    null,
  );
  const [isLoading, setIsLoading] = useState(true);
  const [isRegistrationRequired, setIsRegistrationRequired] = useState(false);
  const [studentData, setStudentData] = useState<Student | null>(null);
  const [isAdmin, setIsAdmin] = useState(false);
  const [isKiosk, setIsKiosk] = useState(false);
  const [isFaculty, setIsFaculty] = useState(false);
  const [isCaretaker, setIsCaretaker] = useState(false);
  const router = useRouter();
  const pathname = usePathname();

  const CACHE_KEY_USER = "nitpy_auth_user";
  const CACHE_KEY_ADMIN = "nitpy_auth_isAdmin";
  const CACHE_KEY_KIOSK = "nitpy_auth_isKiosk";
  const CACHE_KEY_FACULTY = "nitpy_auth_isFaculty";
  const CACHE_KEY_CARETAKER = "nitpy_auth_isCaretaker";
  const CACHE_KEY_STUDENT = "nitpy_auth_studentData";

  useEffect(() => {
    checkUser();
  }, []);

  const checkUser = async () => {
    try {
      const currentUser = await account.get();
      setUser(currentUser);

      // Check Admin, Kiosk, Faculty & Caretaker Status
      let adminStatus = false;
      let kioskStatus = false;
      let facultyStatus = false;
      let caretakerStatus = false;
      try {
        const teamList = await teams.list();
        adminStatus = teamList.teams.some((team) => team.$id === TEAMS.ADMIN);
        kioskStatus = teamList.teams.some((team) => team.$id === TEAMS.KIOSK);
        facultyStatus = teamList.teams.some((team) => team.$id === TEAMS.FACULTY);
        caretakerStatus = teamList.teams.some((team) => team.$id === TEAMS.CARETAKER);
        
        setIsAdmin(adminStatus);
        setIsKiosk(kioskStatus);
        setIsFaculty(facultyStatus);
        setIsCaretaker(caretakerStatus);
      } catch (teamError) {
        console.warn("Membership check failed:", teamError);
        setIsAdmin(false);
        setIsKiosk(false);
        setIsFaculty(false);
        setIsCaretaker(caretakerStatus);
      }

      // Check if student exists in database
      if (currentUser.email) {
        const rollNumber = currentUser.email.split("@")[0].toUpperCase();
        try {
          const data = await databases.getDocument(
            DB_ID,
            COLLECTIONS.STUDENTS,
            rollNumber,
          );
          setStudentData(data as unknown as Student);
          setIsRegistrationRequired(false);
          localStorage.setItem(CACHE_KEY_STUDENT, JSON.stringify(data));
        } catch (dbError: any) {
          if (dbError.code === 404) {
            setStudentData(null);
            const isStaff = adminStatus || kioskStatus || facultyStatus || caretakerStatus;
            setIsRegistrationRequired(!isStaff);
          }
        }
      }

      localStorage.setItem(CACHE_KEY_USER, JSON.stringify(currentUser));
      localStorage.setItem(CACHE_KEY_ADMIN, JSON.stringify(adminStatus));
      localStorage.setItem(CACHE_KEY_KIOSK, JSON.stringify(kioskStatus));
      localStorage.setItem(CACHE_KEY_FACULTY, JSON.stringify(facultyStatus));
      localStorage.setItem(CACHE_KEY_CARETAKER, JSON.stringify(caretakerStatus));
    } catch (error) {
      // Check if we are offline
      if (typeof navigator !== "undefined" && !navigator.onLine) {
        const cachedUser = localStorage.getItem(CACHE_KEY_USER);
        if (cachedUser) {
          console.log("Restoring offline session from cache...");
          setUser(JSON.parse(cachedUser));
          setIsAdmin(JSON.parse(localStorage.getItem(CACHE_KEY_ADMIN) || "false"));
          setIsKiosk(JSON.parse(localStorage.getItem(CACHE_KEY_KIOSK) || "false"));
          setIsFaculty(JSON.parse(localStorage.getItem(CACHE_KEY_FACULTY) || "false"));
          setIsCaretaker(JSON.parse(localStorage.getItem(CACHE_KEY_CARETAKER) || "false"));
          const cachedStudent = localStorage.getItem(CACHE_KEY_STUDENT);
          if (cachedStudent)
            setStudentData(JSON.parse(cachedStudent) as unknown as Student);
          setIsLoading(false);
          return;
        }
      }

      setUser(null);
      setStudentData(null);
      setIsRegistrationRequired(false);
      setIsAdmin(false);
      setIsKiosk(false);
      setIsFaculty(false);
      setIsCaretaker(false);
      if (pathname !== "/login") {
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
        success: window.location.origin + "/",
        failure: window.location.origin + "/login",
      });
    } catch (error) {
      console.error("Google login failed:", error);
    }
  };

  const logout = async () => {
    try {
      await account.deleteSession({ sessionId: "current" });
      setUser(null);
      localStorage.removeItem(CACHE_KEY_USER);
      localStorage.removeItem(CACHE_KEY_ADMIN);
      localStorage.removeItem(CACHE_KEY_KIOSK);
      localStorage.removeItem(CACHE_KEY_FACULTY);
      localStorage.removeItem(CACHE_KEY_CARETAKER);
      localStorage.removeItem(CACHE_KEY_STUDENT);
      router.push("/login");
    } catch (error) {
      console.error("Logout failed:", error);
    }
  };

  return (
    <AuthContext.Provider
      value={{
        user,
        isLoading,
        isRegistrationRequired,
        studentData,
        loginWithGoogle,
        logout,
        isAdmin,
        isKiosk,
        isFaculty,
        isCaretaker,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error("useAuth must be used within an AuthProvider");
  }
  return context;
};
