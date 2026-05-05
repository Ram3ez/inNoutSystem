"use client";

import React, { createContext, useContext, useEffect, useState } from "react";
import {
  account,
  OAuthProvider,
  databases,
  tablesDB,
  teams,
} from "@/lib/appwrite";
import { Models } from "appwrite";
import { useRouter, usePathname } from "next/navigation";
import { Student } from "@/types/models";
import { DB_ID, COLLECTIONS, TEAMS, CACHE_KEYS } from "@/lib/constants";

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

const encodeCache = (data: any) => {
  if (data === null || data === undefined) return "";
  try {
    const json = JSON.stringify(data);
    const bytes = new TextEncoder().encode(json);
    let binString = "";
    for (let i = 0; i < bytes.byteLength; i++) {
      binString += String.fromCharCode(bytes[i]);
    }
    return btoa(binString);
  } catch (e) {
    return "";
  }
};

const decodeCache = (encoded: string | null) => {
  if (!encoded) return null;
  try {
    const binString = atob(encoded);
    const bytes = new Uint8Array(binString.length);
    for (let i = 0; i < binString.length; i++) {
      bytes[i] = binString.charCodeAt(i);
    }
    const json = new TextDecoder().decode(bytes);
    return JSON.parse(json);
  } catch (e) {
    return null;
  }
};

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

  const CACHE_KEY_USER = CACHE_KEYS.USER;
  const CACHE_KEY_ADMIN = CACHE_KEYS.ADMIN;
  const CACHE_KEY_KIOSK = CACHE_KEYS.KIOSK;
  const CACHE_KEY_FACULTY = CACHE_KEYS.FACULTY;
  const CACHE_KEY_CARETAKER = CACHE_KEYS.CARETAKER;
  const CACHE_KEY_STUDENT = CACHE_KEYS.STUDENT;
  const CACHE_KEY_STAFF = CACHE_KEYS.STAFF;

  useEffect(() => {
    if (typeof window !== "undefined") {
      const cachedUser = localStorage.getItem(CACHE_KEY_USER);
      if (cachedUser) {
        try {
          const decodedUser = decodeCache(cachedUser) || JSON.parse(cachedUser);
          setUser(decodedUser);

          const rawAdmin = localStorage.getItem(CACHE_KEY_ADMIN);
          setIsAdmin(decodeCache(rawAdmin) ?? JSON.parse(rawAdmin || "false"));

          const rawKiosk = localStorage.getItem(CACHE_KEY_KIOSK);
          setIsKiosk(decodeCache(rawKiosk) ?? JSON.parse(rawKiosk || "false"));

          const rawFaculty = localStorage.getItem(CACHE_KEY_FACULTY);
          setIsFaculty(
            decodeCache(rawFaculty) ?? JSON.parse(rawFaculty || "false"),
          );

          const rawCaretaker = localStorage.getItem(CACHE_KEY_CARETAKER);
          setIsCaretaker(
            decodeCache(rawCaretaker) ?? JSON.parse(rawCaretaker || "false"),
          );

          const cachedStudent = localStorage.getItem(CACHE_KEY_STUDENT);
          if (cachedStudent)
            setStudentData(
              decodeCache(cachedStudent) || JSON.parse(cachedStudent),
            );

          const cachedStaff = localStorage.getItem(CACHE_KEY_STAFF);
          if (cachedStaff)
            setStaffData(decodeCache(cachedStaff) || JSON.parse(cachedStaff));

          setIsLoading(false);
        } catch (e) {
          console.warn("Pre-loading cached session failed:", e);
        }
      }
    }
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
        facultyStatus = teamList.teams.some(
          (team) => team.$id === TEAMS.FACULTY,
        );
        caretakerStatus = teamList.teams.some(
          (team) => team.$id === TEAMS.CARETAKER,
        );

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
        const isStudentEmail = /^[A-Z]{2}[0-9]{2}[A-Z][0-9]{4}$/.test(
          profileId,
        );

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
            localStorage.setItem(CACHE_KEY_STUDENT, encodeCache(data));
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
            localStorage.setItem(CACHE_KEY_STAFF, encodeCache(data));
          }
        } catch (dbError: any) {
          if (dbError.code === 404) {
            setStudentData(null);
            setStaffData(null);
            setIsRegistrationRequired(true);
          }
        }
      }

      localStorage.setItem(CACHE_KEY_USER, encodeCache(currentUser));
      localStorage.setItem(CACHE_KEY_ADMIN, encodeCache(adminStatus));
      localStorage.setItem(CACHE_KEY_KIOSK, encodeCache(kioskStatus));
      localStorage.setItem(CACHE_KEY_FACULTY, encodeCache(facultyStatus));
      localStorage.setItem(CACHE_KEY_CARETAKER, encodeCache(caretakerStatus));
    } catch (error) {
      console.warn("Auth check failed, checking cache...", error);
      const cachedUser = localStorage.getItem(CACHE_KEY_USER);
      if (cachedUser) {
        console.log("Restoring cached fallback session...");
        try {
          const decodedUser = decodeCache(cachedUser) || JSON.parse(cachedUser);
          setUser(decodedUser);

          const rawAdmin = localStorage.getItem(CACHE_KEY_ADMIN);
          setIsAdmin(decodeCache(rawAdmin) ?? JSON.parse(rawAdmin || "false"));

          const rawKiosk = localStorage.getItem(CACHE_KEY_KIOSK);
          setIsKiosk(decodeCache(rawKiosk) ?? JSON.parse(rawKiosk || "false"));

          const rawFaculty = localStorage.getItem(CACHE_KEY_FACULTY);
          setIsFaculty(
            decodeCache(rawFaculty) ?? JSON.parse(rawFaculty || "false"),
          );

          const rawCaretaker = localStorage.getItem(CACHE_KEY_CARETAKER);
          setIsCaretaker(
            decodeCache(rawCaretaker) ?? JSON.parse(rawCaretaker || "false"),
          );

          const cachedStudent = localStorage.getItem(CACHE_KEY_STUDENT);
          if (cachedStudent)
            setStudentData(
              decodeCache(cachedStudent) || JSON.parse(cachedStudent),
            );

          const cachedStaff = localStorage.getItem(CACHE_KEY_STAFF);
          if (cachedStaff)
            setStaffData(decodeCache(cachedStaff) || JSON.parse(cachedStaff));

          setIsLoading(false);
          return;
        } catch (e) {
          console.error("Failed to parse cached session:", e);
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
        // Only Admins and Kiosks need the heavy Face-API models and the student database
        if (isKiosk || isAdmin) {
          m.loadFaceApiModels();
          m.loadFaceCache();
        } else {
          // Regular users only need MediaPipe (Landmarker) and ONNX (GhostFace/EdgeFace)
          // for their own registration or profile verification.
          import("@/lib/aiEngine").then((ai) => ai.getLandmarker());
          import("@/lib/ghostfaceEngine").then((gf) => gf.initGhostFace());
          import("@/lib/edgefaceEngine").then((ef) => ef.initEdgeFace());
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
