"use client";

import React, { createContext, useContext, useEffect, useState } from "react";
import { account, OAuthProvider, databases, tablesDB, teams } from "@/lib/appwrite";
import { Models } from "appwrite";
import { useRouter, usePathname } from "next/navigation";
import { Student } from "@/types/models";
import { DB_ID, COLLECTIONS, TEAMS } from "@/lib/constants";

interface AuthContextType {
  user: Models.User<Models.Preferences> | null;
  isLoading: boolean;
  isRegistrationRequired: boolean;
  studentData: Student | null;
  staffData: any | null;
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
  const [staffData, setStaffData] = useState<any | null>(null);
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
  const CACHE_KEY_STAFF = "nitpy_auth_staffData";

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

      // Check if profile exists in database
      if (currentUser.email) {
        const profileId = currentUser.email.split("@")[0].toUpperCase();
        const isStudentEmail = /^[A-Z]{2}[0-9]{2}[A-Z][0-9]{4}$/.test(profileId);

        try {
          if (isStudentEmail) {
            /*
            const data = await databases.getDocument({
              databaseId: DB_ID,
              collectionId: COLLECTIONS.STUDENTS,
              documentId: profileId,
            });
            */
            const data = await tablesDB.getRow({
              databaseId: DB_ID,
              tableId: COLLECTIONS.STUDENTS,
              rowId: profileId,
            });
            setStudentData(data as unknown as Student);
            setStaffData(null);
            setIsRegistrationRequired(false);
            localStorage.setItem(CACHE_KEY_STUDENT, JSON.stringify(data));
          } else {
            /*
            const data = await databases.getDocument({
              databaseId: DB_ID,
              collectionId: COLLECTIONS.STAFF_DETAILS,
              documentId: profileId.toLowerCase(),
            });
            */
            const data = await tablesDB.getRow({
              databaseId: DB_ID,
              tableId: COLLECTIONS.STAFF_DETAILS,
              rowId: profileId.toLowerCase(),
            });
            setStaffData(data);
            setStudentData(null);
            setIsRegistrationRequired(false);
            localStorage.setItem(CACHE_KEY_STAFF, JSON.stringify(data));
          }
        } catch (dbError: any) {
          if (dbError.code === 404) {
            setStudentData(null);
            setStaffData(null);
            setIsRegistrationRequired(true);
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
          const cachedStaff = localStorage.getItem(CACHE_KEY_STAFF);
          if (cachedStaff)
            setStaffData(JSON.parse(cachedStaff));
          setIsLoading(false);
          return;
        }
      }

      setUser(null);
      setStudentData(null);
      setStaffData(null);
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
      localStorage.removeItem(CACHE_KEY_STAFF);
      router.push("/login");
    } catch (error) {
      console.error("Logout failed:", error);
    }
  };

  useEffect(() => {
    if (user && !isLoading) {
      // Start pre-loading AI engine in the background for a seamless experience
      import("@/lib/faceCache").then((m) => {
        m.loadFaceApiModels();
        // For Kiosks and Admins, also pre-load the student face database (IndexedDB)
        if (isKiosk || isAdmin) {
          m.loadFaceCache();
        }
      });
    }
  }, [user, isLoading, isKiosk, isAdmin]);

  return (
    <AuthContext.Provider
      value={{
        user,
        isLoading,
        isRegistrationRequired,
        studentData,
        staffData,
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
