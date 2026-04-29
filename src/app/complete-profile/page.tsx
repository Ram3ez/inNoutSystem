"use client";

import React, { useState, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  Phone,
  User as UserIcon,
  ArrowRight,
  CheckCircle2,
} from "lucide-react";
import { useAuth } from "@/context/AuthContext";
import { databases } from "@/lib/appwrite";
import { useRouter } from "next/navigation";
import { GradientBackground } from "@/components/GradientBackground";
import { LoadingIndicator } from "@/components/LoadingIndicator";
import { Navigation } from "@/components/Navigation";
import { DB_ID, COLLECTIONS } from "@/lib/constants";

export default function CompleteProfilePage() {
  const { user, isLoading: authLoading, isRegistrationRequired } = useAuth();
  const [phone, setPhone] = useState("");
  const [name, setName] = useState("");
  const [gender, setGender] = useState<"MALE" | "FEMALE" | "">("");
  const [department, setDepartment] = useState("");
  const [year, setYear] = useState("");
  const [course, setCourse] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isSuccess, setIsSuccess] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const router = useRouter();

  const decodeRollNumber = (rollNo: string) => {
    if (!rollNo || rollNo.length < 5) return null;

    const branchCode = rollNo.substring(0, 2).toUpperCase();
    const joinYearShort = parseInt(rollNo.substring(2, 4));
    const degreeLetter = rollNo.substring(4, 5).toUpperCase();

    if (isNaN(joinYearShort)) return null;

    // 1. Department Mapping
    const branchMap: Record<string, string> = {
      CS: "CSE",
      EC: "ECE",
      EE: "EEE",
      CE: "CIVIL",
      ME: "MECH",
      ED: "EDUCATION",
      PY: "PHY",
      CH: "CHEM",
      MA: "MATH",
    };
    const dept = branchMap[branchCode] || "OTHER";

    // 2. Year Calculation (Dynamic based on current date)
    const now = new Date();
    const currentYear = now.getFullYear();
    const currentMonth = now.getMonth() + 1; // getMonth() is 0-indexed

    const joinYear = 2000 + joinYearShort;
    let acadYear = currentYear - joinYear;
    if (currentMonth >= 7) acadYear += 1;

    // 3. Course Mapping & Duration Logic
    let courseType = "";
    let duration = 4; // Default
    
    const engBranches = ["CS", "EC", "EE", "ME", "CE"];
    const alwaysMsc = ["PY", "MA", "CH"];

    if (alwaysMsc.includes(branchCode)) {
      courseType = "msc";
      duration = 2;
    } else if (engBranches.includes(branchCode)) {
      if (degreeLetter === "M") {
        courseType = "m.tech";
        duration = 2;
      } else {
        courseType = "b.tech";
        duration = 4;
      }
    } else {
      // EDUCATION or others
      if (degreeLetter === "M") {
        courseType = "msc";
        duration = 2;
      } else {
        courseType = "bsc";
        duration = 4;
      }
    }

    // Clamp year between 1 and duration
    const finalYear = Math.max(1, Math.min(duration, acadYear)).toString();

    return { department: dept, year: finalYear, course: courseType };
  };

  useEffect(() => {
    if (!authLoading && !user) {
      router.push("/login");
    } else if (!authLoading && user && !isRegistrationRequired) {
      router.push("/");
    }

    if (user) {
      setName(user.name || "");
      const rollNo = user.email.split("@")[0].toUpperCase();
      const decoded = decodeRollNumber(rollNo);
      if (decoded) {
        setDepartment(decoded.department);
        setYear(decoded.year);
        setCourse(decoded.course);
      }
    }
  }, [user, authLoading, isRegistrationRequired, router]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user || !user.email) return;

    if (!gender) {
      setError("Please select your gender");
      return;
    }

    if (phone.length !== 10) {
      setError("Phone number must be exactly 10 digits");
      return;
    }

    setIsSubmitting(true);
    setError(null);

    const rollNumber = user.email.split("@")[0].toUpperCase();

    try {
      await databases.createDocument(DB_ID, COLLECTIONS.STUDENTS, rollNumber, {
        name: name,
        phone_no: parseInt(phone),
        gender: gender,
        department: department,
        year: year,
        course: course,
        is_out: false,
        faceRegistered: false,
      });

      setIsSuccess(true);
      setTimeout(() => {
        window.location.href = "/"; // Force a full reload to refresh AuthContext state
      }, 2000);
    } catch (err: any) {
      console.error("Registration failed:", err);
      setError(err.message || "Failed to save details");
      setIsSubmitting(false);
    }
  };

  if (authLoading)
    return (
      <GradientBackground>
        <Navigation />
        <div className="flex-1 flex items-center justify-center">
          <LoadingIndicator />
        </div>
      </GradientBackground>
    );

  return (
    <GradientBackground>
      <Navigation />
      <div className="flex-1 flex items-center justify-center p-6 pt-36 sm:pt-40">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="w-full max-w-md bg-surface p-6 sm:p-8 rounded-3xl border border-primary/10 shadow-2xl"
        >
          <AnimatePresence mode="wait">
            {!isSuccess ? (
              <motion.div
                key="form"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
              >
                <div className="mb-8 text-center">
                  <h1 className="text-2xl font-bold text-primary mb-2 uppercase tracking-widest">
                    Complete Profile
                  </h1>
                  <p className="text-primary/70 text-sm tracking-wide uppercase font-bold">
                    Academic details detected automatically
                  </p>
                </div>

                <form onSubmit={handleSubmit} className="space-y-6">
                  <div className="space-y-2">
                    <label className="text-xs font-bold text-primary/60 uppercase tracking-widest ml-1">
                      Full Name
                    </label>
                    <div className="relative">
                      <UserIcon
                        className="absolute left-4 top-1/2 -translate-y-1/2 text-primary/20"
                        size={18}
                      />
                      <input
                        type="text"
                        value={name}
                        onChange={(e) => setName(e.target.value)}
                        required
                        placeholder="Enter full name"
                        className="w-full h-14 bg-primary/5 border border-primary/10 rounded-xl pl-12 pr-4 text-primary placeholder:text-primary/60 focus:outline-none focus:border-secondary transition-all font-bold uppercase"
                      />
                    </div>
                  </div>

                  <div className="space-y-2">
                    <label className="text-xs font-bold text-primary/60 uppercase tracking-widest ml-1">
                      Phone Number
                    </label>
                    <div className="relative">
                      <Phone
                        className="absolute left-4 top-1/2 -translate-y-1/2 text-primary/20"
                        size={18}
                      />
                      <input
                        type="tel"
                        value={phone}
                        onChange={(e) =>
                          setPhone(
                            e.target.value.replace(/\D/g, "").slice(0, 10),
                          )
                        }
                        required
                        maxLength={10}
                        placeholder="Enter 10-digit number"
                        className="w-full h-14 bg-primary/5 border border-primary/10 rounded-xl pl-12 pr-4 text-primary placeholder:text-primary/60 focus:outline-none focus:border-secondary transition-all font-bold"
                      />
                    </div>
                  </div>

                  <div className="space-y-2">
                    <label className="text-xs font-bold text-primary/60 uppercase tracking-widest ml-1">
                      Gender
                    </label>
                    <div className="grid grid-cols-2 gap-2 sm:gap-4">
                      <button
                        type="button"
                        onClick={() => setGender("MALE")}
                        className={`h-14 rounded-xl font-bold uppercase tracking-widest transition-all ${
                          gender === "MALE"
                            ? "bg-secondary text-white shadow-lg shadow-secondary/20"
                            : "bg-primary/5 text-primary/60 border border-primary/5 hover:bg-primary/10"
                        }`}
                      >
                        Male
                      </button>
                      <button
                        type="button"
                        onClick={() => setGender("FEMALE")}
                        className={`h-14 rounded-xl font-bold uppercase tracking-widest transition-all ${
                          gender === "FEMALE"
                            ? "bg-secondary text-white shadow-lg shadow-secondary/20"
                            : "bg-primary/5 text-primary/60 border border-primary/5 hover:bg-primary/10"
                        }`}
                      >
                        Female
                      </button>
                    </div>
                  </div>

                  {/* Calculated Academic Info Display */}
                  <div className="bg-primary/5 border border-primary/10 rounded-2xl p-6 space-y-4">
                    <div className="flex justify-between items-center border-b border-primary/5 pb-4">
                      <p className="text-[10px] font-bold text-primary/70 uppercase tracking-widest">
                        Department
                      </p>
                      <p className="text-sm font-black text-secondary uppercase tracking-tight">
                        {department || "---"}
                      </p>
                    </div>
                    <div className="flex justify-between items-center border-b border-primary/5 pb-4">
                      <p className="text-[10px] font-bold text-primary/70 uppercase tracking-widest">
                        Academic Year
                      </p>
                      <p className="text-sm font-black text-secondary uppercase tracking-tight">
                        {year ? `${year} Year` : "---"}
                      </p>
                    </div>
                    <div className="flex justify-between items-center">
                      <p className="text-[10px] font-bold text-primary/70 uppercase tracking-widest">
                        Course
                      </p>
                      <p className="text-sm font-black text-secondary uppercase tracking-tight">
                        {course || "---"}
                      </p>
                    </div>
                  </div>

                  {error && (
                    <p className="text-error text-xs font-bold uppercase tracking-wider text-center bg-error/10 py-3 rounded-lg border border-error/20">
                      {error}
                    </p>
                  )}

                  <button
                    type="submit"
                    disabled={isSubmitting}
                    className="w-full h-14 bg-primary text-white rounded-xl font-bold uppercase tracking-widest flex items-center justify-center space-x-3 transition-all hover:brightness-110 active:scale-95 disabled:opacity-50 shadow-xl shadow-primary/20"
                  >
                    {isSubmitting ? (
                      <div className="w-6 h-6 border-2 border-white border-t-transparent rounded-full animate-spin" />
                    ) : (
                      <>
                        <span>Save & Continue</span>
                        <ArrowRight size={20} />
                      </>
                    )}
                  </button>
                </form>
              </motion.div>
            ) : (
              <motion.div
                key="success"
                initial={{ opacity: 0, scale: 0.9 }}
                animate={{ opacity: 1, scale: 1 }}
                className="py-12 text-center"
              >
                <div className="w-16 h-16 bg-primary/20 rounded-full flex items-center justify-center text-primary mx-auto mb-6">
                  <CheckCircle2 size={32} />
                </div>
                <h1 className="text-2xl font-bold text-primary mb-2 uppercase tracking-widest">
                  Profile Saved
                </h1>
                <p className="text-primary/60 text-sm font-bold tracking-wide uppercase">
                  Welcome to the system, {name}
                </p>
              </motion.div>
            )}
          </AnimatePresence>
        </motion.div>
      </div>
    </GradientBackground>
  );
}

