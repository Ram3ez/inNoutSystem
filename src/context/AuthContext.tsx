"use client";

/**
 * AUTHENTICATION CONTEXT PROVIDER
 * 
 * Central hub for user session management, institutional role detection, 
 * and secure profile caching. This provider ensures that the correct
 * AI models are loaded based on user permissions and that sessions 
 * remain resilient even when offline.
 */

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
import { useLoading } from "./LoadingContext";
import { Student } from "@/types/models";

import { DB_ID, COLLECTIONS, TEAMS, CACHE_KEYS } from "@/lib/constants";

/**
 * Shape of the AuthContext data and methods
 */
interface AuthContextType {
  user: Models.User<Models.Preferences> | null; // Currently logged in user
  isLoading: boolean; // Global loading state for auth check
  isRegistrationRequired: boolean; // True if user is logged in but profile is missing
  studentData: Student | null; // Student profile data if applicable
  staffData: any | null; // Staff profile data if applicable
  loginWithGoogle: () => Promise<void>; // Triggers Google OAuth
  logout: () => Promise<void>; // Ends session and clears cache
  isAdmin: boolean; // Role: Admin
  isKiosk: boolean; // Role: Kiosk (for biometric check-in/out)
  isFaculty: boolean; // Role: Faculty member
  isCaretaker: boolean; // Role: Hostel caretaker
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

/**
 * SECURE CACHE LAYER
 * We encode critical session and role data into Base64 before storing them 
 * in LocalStorage. This prevents curious users from easily tampering 
 * with roles (e.g., trying to set isAdmin=true via DevTools) to bypass 
 * client-side route guards.
 */
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

/**
 * Decodes Base64 data back to its original object/value.
 */
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

/**
 * AuthProvider Component
 * Wraps the application to provide authentication state and methods.
 */
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

  // Initial load: restore session from cache for immediate UI responsiveness
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
    checkUser(); // Always perform a fresh check from server
  }, []);

  /**
   * Freshly checks the user's authentication status and roles from Appwrite.
   */
  const checkUser = async () => {
    try {
      const currentUser = await account.get();
      setUser(currentUser);

      // Check Admin, Kiosk, Faculty & Caretaker Status via Team memberships
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

      // Intelligent Role Detection:
      // The system infers whether a user is a Student or Staff based purely on their email format.
      // This eliminates the need for separate login portals or manual role assignment.
      if (currentUser.email) {
        const profileId = currentUser.email.split("@")[0].toUpperCase();
        // Regex for standard NIT Puducherry student Roll Numbers (e.g., CS21B1001)
        // Format: 2 Letters (Dept) + 2 Numbers (Year) + 1 Letter (Course) + 4 Numbers (ID)
        const isStudentEmail = /^[A-Z]{2}[0-9]{2}[A-Z][0-9]{4}$/.test(
          profileId,
        );

        try {
          if (isStudentEmail) {
            // Fetch student profile
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
            // Fetch staff profile
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
            // No profile found: user needs to complete their profile
            setStudentData(null);
            setStaffData(null);
            setIsRegistrationRequired(true);
          }
        }
      }

      // Update cache with fresh data
      localStorage.setItem(CACHE_KEY_USER, encodeCache(currentUser));
      localStorage.setItem(CACHE_KEY_ADMIN, encodeCache(adminStatus));
      localStorage.setItem(CACHE_KEY_KIOSK, encodeCache(kioskStatus));
      localStorage.setItem(CACHE_KEY_FACULTY, encodeCache(facultyStatus));
      localStorage.setItem(CACHE_KEY_CARETAKER, encodeCache(caretakerStatus));
    } catch (error: any) {
      // Silence 401 errors as they are expected when a user is not logged in
      // This keeps the developer console clean from "guest access" noise.
      if (error.code !== 401) {
        console.warn("Auth check failed, checking cache...", error);
      }
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

      // If both server and cache fail, clear state
      setUser(null);
      setStudentData(null);
      setStaffData(null);
      setIsRegistrationRequired(false);
      setIsAdmin(false);
      setIsKiosk(false);
      setIsFaculty(false);
      setIsCaretaker(false);
    } finally {
      setIsLoading(false);
    }
  };

  /**
   * Initiates Google OAuth login flow.
   */
  const loginWithGoogle = async () => {
    try {
      account.createOAuth2Session({
        provider: OAuthProvider.Google,
        success: window.location.origin + "/",
        failure: window.location.origin + "/login",
      });
    } catch (error) {
      console.error("Google login failed:", error);
    }
  };

  /**
   * Logs out the user and clears all cached session data.
   */
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

  // Background model pre-loading was explicitly removed to stop 30MB downloads on the home page.
  // AI Models are strictly lazy-loaded on the Capture and Registration pages now.
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

/**
 * Hook to consume authentication state.
 */
export const useAuth = () => {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error("useAuth must be used within an AuthProvider");
  }
  return context;
};

