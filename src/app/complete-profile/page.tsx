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
import { databases, tablesDB } from "@/lib/appwrite";
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
  const [location, setLocation] = useState(""); // Building + Room/Floor for Staff
  const [department, setDepartment] = useState("");
  const [year, setYear] = useState("");
  const [course, setCourse] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isSuccess, setIsSuccess] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [parentName, setParentName] = useState("");
  const [parentPhone, setParentPhone] = useState("");
  const [parentEmail, setParentEmail] = useState("");
  const router = useRouter();

  const profileId = user?.email.split("@")[0].toUpperCase() || "";
  const isStudent = /^[A-Z]{2}[0-9]{2}[A-Z][0-9]{4}$/.test(profileId);

  const decodeRollNumber = (rollNo: string) => {
    if (!rollNo || rollNo.length < 5) return null;

    const branchCode = rollNo.substring(0, 2).toUpperCase();
    const joinYearShort = parseInt(rollNo.substring(2, 4));
    const degreeLetter = rollNo.substring(4, 5).toUpperCase();

    if (isNaN(joinYearShort)) return null;

    const branchMap: Record<string, string> = {
      CS: "CSE", EC: "ECE", EE: "EEE", CE: "CIVIL", ME: "MECH",
      ED: "EDUCATION", PY: "PHY", CH: "CHEM", MA: "MATH",
    };
    const dept = branchMap[branchCode] || "OTHER";

    const now = new Date();
    const currentYear = now.getFullYear();
    const currentMonth = now.getMonth() + 1;
    const joinYear = 2000 + joinYearShort;
    let acadYear = currentYear - joinYear;
    if (currentMonth >= 7) acadYear += 1;

    let courseType = "";
    let duration = 4;
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
      if (degreeLetter === "M") {
        courseType = "msc";
        duration = 2;
      } else {
        courseType = "bsc";
        duration = 4;
      }
    }
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
      if (isStudent) {
        const decoded = decodeRollNumber(profileId);
        if (decoded) {
          setDepartment(decoded.department);
          setYear(decoded.year);
          setCourse(decoded.course);
        }
      }
    }
  }, [user, authLoading, isRegistrationRequired, router, isStudent, profileId]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user || !user.email) return;

    // Basic Validation
    if (name.trim().length < 3) {
      setError("Please enter your full name (minimum 3 characters)");
      return;
    }

    if (phone.length !== 10 || !/^[6-9]\d{9}$/.test(phone)) {
      setError("Please enter a valid 10-digit Indian mobile number");
      return;
    }

    if (isStudent) {
      if (!gender) {
        setError("Please select your gender");
        return;
      }
      if (!department || !year || !course) {
        setError("Academic details could not be detected. Please contact support.");
        return;
      }
      if (parentName.trim().length < 3) {
        setError("Parent Name must be at least 3 characters");
        return;
      }
      if (!parentPhone || parentPhone.length !== 10 || !/^[6-9]\d{9}$/.test(parentPhone)) {
        setError("Please enter a valid 10-digit Indian mobile number for your parent");
        return;
      }
      if (!parentEmail || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(parentEmail)) {
        setError("Please enter a valid email address for your parent");
        return;
      }
    } else {
      if (!location || location.trim().length < 5) {
        setError("Please enter a detailed campus location (e.g. Science Block, Room 204)");
        return;
      }
    }

    setIsSubmitting(true);
    setError(null);

    try {
      if (isStudent) {
        /*
        await databases.createDocument({
          databaseId: DB_ID,
          collectionId: COLLECTIONS.STUDENTS,
          documentId: profileId,
          data: {
            name: name,
            phone_no: parseInt(phone),
            gender: gender,
            department: department,
            year: year,
            course: course,
            is_out: false,
            faceRegistered: false,
          }
        });
        */
        await tablesDB.createRow({
          databaseId: DB_ID,
          tableId: COLLECTIONS.STUDENTS,
          rowId: profileId,
          data: {
            name: name,
            phone_no: parseInt(phone),
            gender: gender,
            department: department,
            year: year,
            course: course,
            is_out: false,
            faceRegistered: false,
            pending_parent_name: parentName.trim(),
            pending_parent_phone: parentPhone ? parseInt(parentPhone) : null,
            pending_parent_email: parentEmail.trim().toLowerCase(),
            parent_verification_status: "pending_approval",
          }
        });
      } else {
        /*
        await databases.createDocument({
          databaseId: DB_ID,
          collectionId: COLLECTIONS.STAFF_DETAILS,
          documentId: profileId.toLowerCase(),
          data: {
            name: name,
            phone_no: parseInt(phone),
            location: location,
            email: user.email
          }
        });
        */
        await tablesDB.createRow({
          databaseId: DB_ID,
          tableId: COLLECTIONS.STAFF_DETAILS,
          rowId: profileId.toLowerCase(),
          data: {
            name: name,
            phone_no: parseInt(phone),
            location: location,
            email: user.email
          }
        });
      }

      setIsSuccess(true);
      setTimeout(() => {
        window.location.href = "/";
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
                  <h1 className="text-2xl font-bold text-primary mb-2 uppercase tracking-widest italic">
                    {isStudent ? 'Complete Student Profile' : 'Complete Staff Profile'}
                  </h1>
                  <p className="text-primary/70 text-[10px] tracking-wide uppercase font-bold">
                    {isStudent ? 'Academic details detected automatically' : 'Provide your contact and office details'}
                  </p>
                </div>

                <form onSubmit={handleSubmit} className="space-y-6">
                  <div className="space-y-2">
                    <label className="text-[10px] font-black text-primary/40 uppercase tracking-widest ml-4">
                      Full Name
                    </label>
                    <div className="relative">
                      <UserIcon className="absolute left-4 top-1/2 -translate-y-1/2 text-primary/20" size={18} />
                      <input
                        type="text"
                        value={name}
                        onChange={(e) => setName(e.target.value)}
                        required
                        placeholder="Enter full name"
                        className="w-full h-14 bg-primary/5 border border-primary/10 rounded-2xl pl-12 pr-4 text-primary placeholder:text-primary/60 focus:outline-none focus:border-secondary transition-all font-bold uppercase"
                      />
                    </div>
                  </div>

                  <div className="space-y-2">
                    <label className="text-[10px] font-black text-primary/40 uppercase tracking-widest ml-4">
                      Phone Number
                    </label>
                    <div className="relative">
                      <Phone className="absolute left-4 top-1/2 -translate-y-1/2 text-primary/20" size={18} />
                      <input
                        type="tel"
                        value={phone}
                        onChange={(e) => setPhone(e.target.value.replace(/\D/g, "").slice(0, 10))}
                        required
                        maxLength={10}
                        placeholder="Enter 10-digit number"
                        className="w-full h-14 bg-primary/5 border border-primary/10 rounded-2xl pl-12 pr-4 text-primary placeholder:text-primary/60 focus:outline-none focus:border-secondary transition-all font-bold"
                      />
                    </div>
                  </div>

                  {isStudent ? (
                    <>
                      <div className="space-y-2">
                        <label className="text-[10px] font-black text-primary/40 uppercase tracking-widest ml-4">Gender</label>
                        <div className="grid grid-cols-2 gap-2 sm:gap-4">
                          <button
                            type="button"
                            onClick={() => setGender("MALE")}
                            className={`h-14 rounded-2xl font-bold uppercase tracking-widest transition-all ${
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
                            className={`h-14 rounded-2xl font-bold uppercase tracking-widest transition-all ${
                              gender === "FEMALE"
                                ? "bg-secondary text-white shadow-lg shadow-secondary/20"
                                : "bg-primary/5 text-primary/60 border border-primary/5 hover:bg-primary/10"
                            }`}
                          >
                            Female
                          </button>
                        </div>
                      </div>

                      <div className="bg-primary/5 border border-primary/10 rounded-[2rem] p-6 space-y-4">
                        <div className="flex justify-between items-center border-b border-primary/5 pb-4">
                          <p className="text-[9px] font-bold text-primary/30 uppercase tracking-widest">Department</p>
                          <p className="text-sm font-black text-secondary uppercase tracking-tight">{department || "---"}</p>
                        </div>
                        <div className="flex justify-between items-center border-b border-primary/5 pb-4">
                          <p className="text-[9px] font-bold text-primary/30 uppercase tracking-widest">Academic Year</p>
                          <p className="text-sm font-black text-secondary uppercase tracking-tight">{year ? `${year} Year` : "---"}</p>
                        </div>
                        <div className="flex justify-between items-center">
                          <p className="text-[9px] font-bold text-primary/30 uppercase tracking-widest">Course</p>
                          <p className="text-sm font-black text-secondary uppercase tracking-tight">{course || "---"}</p>
                        </div>
                      </div>

                      <div className="space-y-4 pt-4 border-t border-primary/5">
                        <p className="text-[10px] font-black text-secondary uppercase tracking-widest ml-4">
                          Parent / Guardian Details
                        </p>
                        
                        <div className="space-y-2">
                          <label className="text-[10px] font-black text-primary/40 uppercase tracking-widest ml-4">
                            Parent's Full Name
                          </label>
                          <input
                            required
                            type="text"
                            value={parentName}
                            onChange={(e) => setParentName(e.target.value)}
                            placeholder="Parent Name"
                            className="w-full h-14 bg-primary/5 border border-primary/10 rounded-2xl px-6 text-primary placeholder:text-primary/60 focus:outline-none focus:border-secondary transition-all font-bold uppercase"
                          />
                        </div>

                        <div className="space-y-2">
                          <label className="text-[10px] font-black text-primary/40 uppercase tracking-widest ml-4">
                            Parent's Phone Number
                          </label>
                          <input
                            required
                            type="tel"
                            value={parentPhone}
                            onChange={(e) => setParentPhone(e.target.value.replace(/\D/g, "").slice(0, 10))}
                            placeholder="10-digit phone number"
                            className="w-full h-14 bg-primary/5 border border-primary/10 rounded-2xl px-6 text-primary placeholder:text-primary/60 focus:outline-none focus:border-secondary transition-all font-bold"
                          />
                        </div>

                        <div className="space-y-2">
                          <label className="text-[10px] font-black text-primary/40 uppercase tracking-widest ml-4">
                            Parent's Email Address
                          </label>
                          <input
                            required
                            type="email"
                            value={parentEmail}
                            onChange={(e) => setParentEmail(e.target.value)}
                            placeholder="Parent email"
                            className="w-full h-14 bg-primary/5 border border-primary/10 rounded-2xl px-6 text-primary placeholder:text-primary/60 focus:outline-none focus:border-secondary transition-all font-bold"
                          />
                        </div>
                      </div>
                    </>
                  ) : (
                    <div className="space-y-2">
                      <label className="text-[10px] font-black text-primary/40 uppercase tracking-widest ml-4">
                        Campus Location (Building + Floor + Room)
                      </label>
                      <input
                        type="text"
                        value={location}
                        onChange={(e) => setLocation(e.target.value)}
                        required
                        placeholder="e.g. Science Block, 2nd Floor, Room 204"
                        className="w-full h-14 bg-primary/5 border border-primary/10 rounded-2xl px-6 text-primary placeholder:text-primary/60 focus:outline-none focus:border-secondary transition-all font-bold uppercase"
                      />
                    </div>
                  )}

                  {error && (
                    <p className="text-[10px] font-bold text-secondary uppercase tracking-widest text-center bg-secondary/10 py-3 rounded-2xl border border-secondary/20">
                      {error}
                    </p>
                  )}

                  <button
                    type="submit"
                    disabled={isSubmitting}
                    className="w-full h-16 bg-primary text-background rounded-[2rem] text-[10px] font-black uppercase tracking-[0.2em] shadow-lg shadow-primary/20 hover:brightness-110 active:scale-[0.98] transition-all disabled:opacity-50 flex items-center justify-center gap-3"
                  >
                    {isSubmitting ? (
                      <div className="w-6 h-6 border-2 border-background border-t-transparent rounded-full animate-spin" />
                    ) : (
                      <>
                        <span>Complete Profile</span>
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

