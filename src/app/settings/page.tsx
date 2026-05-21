"use client";

import React, { useState, useEffect } from "react";
import { motion as fm, AnimatePresence } from "framer-motion";
import {
  ArrowLeft,
  User as UserIcon,
  Phone,
  Mail,
  CheckCircle2,
  AlertCircle,
  Settings,
  ShieldAlert,
  Clock,
  XCircle,
  Edit3,
} from "lucide-react";
import { useAuth } from "@/context/AuthContext";
import { tablesDB, storage, ID } from "@/lib/appwrite";
import { GradientBackground } from "@/components/GradientBackground";
import { LoadingIndicator } from "@/components/LoadingIndicator";
import { useLoading } from "@/context/LoadingContext";
import { Navigation } from "@/components/Navigation";
import { useRouter } from "next/navigation";
import { DB_ID, COLLECTIONS, BUCKETS } from "@/lib/constants";
import { logTransaction } from "@/lib/auditLogger";
import Link from "next/link";

export default function SettingsPage() {
  const { user, studentData, isLoading: authLoading } = useAuth();
  const router = useRouter();
  const { startLoading } = useLoading();

  const [parentName, setParentName] = useState("");
  const [parentPhone, setParentPhone] = useState("");
  const [parentEmail, setParentEmail] = useState("");

  const [isUpdating, setIsUpdating] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isSuccess, setIsSuccess] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [photoPreview, setPhotoPreview] = useState<string | null>(null);
  const [isUploadingPhoto, setIsUploadingPhoto] = useState(false);
  const [photoError, setPhotoError] = useState<string | null>(null);

  useEffect(() => {
    if (studentData?.photo) {
      setPhotoPreview(storage.getFilePreview({ bucketId: BUCKETS.STUDENT_PHOTOS, fileId: studentData.photo }).toString());
    }
  }, [studentData]);

  const handlePhotoChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    if (studentData?.photo) {
      setPhotoError("Profile photo is locked and cannot be updated.");
      return;
    }
    const file = e.target.files?.[0];
    if (!file) return;

    if (!["image/jpeg", "image/png", "image/jpg"].includes(file.type)) {
      setPhotoError("Please upload a JPG, JPEG, or PNG image.");
      return;
    }

    if (file.size > 5 * 1024 * 1024) {
      setPhotoError("Image size must be under 5MB.");
      return;
    }

    setPhotoError(null);
    setIsUploadingPhoto(true);

    try {
      // 1. Upload new photo to Appwrite Storage
      const uploadResult = await storage.createFile({
        bucketId: BUCKETS.STUDENT_PHOTOS,
        fileId: ID.unique(),
        file: file
      });
      const newPhotoId = uploadResult.$id;

      // 2. Update Student document photo ID in Databases
      await tablesDB.updateRow({
        databaseId: DB_ID,
        tableId: COLLECTIONS.STUDENTS,
        rowId: studentData!.$id,
        data: {
          photo: newPhotoId,
        },
      });

      // 3. Delete old file from storage if it exists
      if (studentData?.photo) {
        try {
          await storage.deleteFile(BUCKETS.STUDENT_PHOTOS, studentData.photo);
        } catch (delErr) {
          console.warn("Failed to delete old photo:", delErr);
        }
      }

      // 4. Update the local storage cache using Base64 encoding
      const CACHE_KEY_STUDENT = "nitpy_auth_studentData";
      const cachedRaw = localStorage.getItem(CACHE_KEY_STUDENT);
      if (cachedRaw) {
        try {
          let decoded = null;
          if (cachedRaw.trim().startsWith("{")) {
            decoded = JSON.parse(cachedRaw);
          } else {
            const binString = atob(cachedRaw);
            const bytes = new Uint8Array(binString.length);
            for (let i = 0; i < binString.length; i++) {
              bytes[i] = binString.charCodeAt(i);
            }
            const json = new TextDecoder().decode(bytes);
            decoded = JSON.parse(json);
          }

          if (decoded) {
            decoded.photo = newPhotoId;
            const jsonStr = JSON.stringify(decoded);
            const bytesEnc = new TextEncoder().encode(jsonStr);
            let binStringEnc = "";
            for (let i = 0; i < bytesEnc.byteLength; i++) {
              binStringEnc += String.fromCharCode(bytesEnc[i]);
            }
            const encoded = btoa(binStringEnc);
            localStorage.setItem(CACHE_KEY_STUDENT, encoded);
          }
        } catch (cacheErr) {
          console.error("Failed to update student cache:", cacheErr);
          const fallbackStudent = { ...studentData, photo: newPhotoId };
          localStorage.setItem(CACHE_KEY_STUDENT, JSON.stringify(fallbackStudent));
        }
      }

      // 5. Update local preview URL
      const newPreviewUrl = storage.getFilePreview(BUCKETS.STUDENT_PHOTOS, newPhotoId).toString();
      setPhotoPreview(newPreviewUrl);

      // 6. Log transaction
      await logTransaction({
        action: "PHOTO_UPDATE",
        message: `Student ${studentData!.$id} updated profile photo.`,
        userId: studentData!.$id,
        level: "low",
      });

      // Reload window to sync other components
      window.location.reload();
    } catch (err: any) {
      console.error("Failed to upload photo:", err);
      setPhotoError(err.message || "Failed to upload photo.");
    } finally {
      setIsUploadingPhoto(false);
    }
  };

  useEffect(() => {
    if (authLoading) return;
    if (!user) {
      router.push("/login");
      return;
    }
    // Only student profiles are allowed on this settings page
    const profileId = user.email.split("@")[0].toUpperCase();
    const isStudent = /^[A-Z]{2}[0-9]{2}[A-Z][0-9]{4}$/.test(profileId);
    if (!isStudent) {
      router.push("/");
      return;
    }
  }, [authLoading, user, studentData, router]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!studentData?.$id) return;

    setError(null);

    if (parentName.trim().length < 3) {
      setError("Parent Name must be at least 3 characters");
      return;
    }

    if (parentPhone && (parentPhone.length !== 10 || !/^[6-9]\d{9}$/.test(parentPhone))) {
      setError("Please enter a valid 10-digit Indian mobile number");
      return;
    }

    if (parentEmail && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(parentEmail)) {
      setError("Please enter a valid email address");
      return;
    }

    setIsSubmitting(true);

    try {
      await tablesDB.updateRow({
        databaseId: DB_ID,
        tableId: COLLECTIONS.STUDENTS,
        rowId: studentData.$id,
        data: {
          pending_parent_name: parentName.trim(),
          pending_parent_phone: parentPhone ? parseInt(parentPhone) : null,
          pending_parent_email: parentEmail.trim().toLowerCase(),
          parent_verification_status: "pending_approval",
        },
      });

      // Update local storage too so it reflects immediately
      const CACHE_KEY_STUDENT = "nitpy_auth_studentData";
      const updatedStudent = {
        ...studentData,
        pending_parent_name: parentName.trim(),
        pending_parent_phone: parentPhone ? parseInt(parentPhone) : null,
        pending_parent_email: parentEmail.trim().toLowerCase(),
        parent_verification_status: "pending_approval",
      };
      localStorage.setItem(CACHE_KEY_STUDENT, JSON.stringify(updatedStudent));

      await logTransaction({
        action: "PARENT_DETAIL_UPDATE_REQUEST",
        message: `Student ${studentData.$id} submitted new parent details for approval.`,
        userId: studentData.$id,
        metadata: { parentName, parentPhone, parentEmail },
        level: "medium"
      });

      setIsSuccess(true);
      setTimeout(() => {
        setIsSuccess(false);
        router.push("/");
      }, 2000);
    } catch (err: any) {
      console.error("Failed to submit parent details for approval:", err);
      setError(err.message || "Failed to submit parent details.");
    } finally {
      setIsSubmitting(false);
    }
  };

  if (authLoading) {
    return (
      <GradientBackground>
        <Navigation />
        <div className="flex-1 flex items-center justify-center">
          <LoadingIndicator />
        </div>
      </GradientBackground>
    );
  }

  const status = studentData?.parent_verification_status || "unverified";

  return (
    <GradientBackground>
      <Navigation />
      <main className="flex-1 max-w-2xl mx-auto w-full px-4 sm:px-6 pt-32 sm:pt-40 pb-12">
        <header className="mb-12">
          <div className="flex items-center space-x-4 mb-6">
            <button
              onClick={() => {
                startLoading();
                router.push("/");
              }}
              className="p-2 hover:bg-primary/5 rounded-full transition-all text-primary/40 hover:text-primary"
            >
              <ArrowLeft size={24} />
            </button>
            <div>
              <p className="text-secondary font-bold tracking-[0.2em] text-[10px] uppercase mb-1">
                Account Settings
              </p>
              <h1 className="text-3xl font-bold text-primary tracking-tight uppercase flex items-center gap-3">
                <Settings className="text-secondary" size={28} />
                Student Settings
              </h1>
            </div>
          </div>
        </header>

        <fm.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="space-y-8 bg-surface border border-primary/5 p-6 sm:p-10 lg:p-14 rounded-[2rem] sm:rounded-[3rem] shadow-2xl relative overflow-hidden"
        >
          {/* Profile Photo Section */}
          <div className="flex flex-col items-center justify-center border-b border-primary/5 pb-8 mb-4">
            <h2 className="text-sm font-black text-primary uppercase tracking-wider mb-4">
              Profile Photo
            </h2>
            <div className="relative group w-32 h-32 rounded-[2rem] overflow-hidden border-2 border-secondary/30 bg-primary/5 flex items-center justify-center shadow-lg transition-all">
              {photoPreview ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={photoPreview}
                  alt="Profile"
                  className="w-full h-full object-cover"
                />
              ) : (
                <div className="w-full h-full flex items-center justify-center bg-gradient-to-tr from-secondary/15 to-primary/5 text-secondary">
                  <UserIcon size={48} className="opacity-80" />
                </div>
              )}
              {isUploadingPhoto && (
                <div className="absolute inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-10">
                  <LoadingIndicator size="sm" />
                </div>
              )}

              {!isUploadingPhoto && !studentData?.photo && (
                <label className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 flex flex-col items-center justify-center cursor-pointer transition-all duration-200 text-white text-[9px] font-black uppercase tracking-wider gap-1.5 z-10">
                  <Edit3 size={18} />
                  <span>Register Photo</span>
                  <input
                    type="file"
                    accept="image/jpeg,image/png,image/jpg"
                    onChange={handlePhotoChange}
                    className="hidden"
                  />
                </label>
              )}
            </div>

            {photoError && (
              <div className="mt-4 p-3 bg-error/10 border border-error/20 rounded-2xl flex items-center gap-2 text-error text-[10px] font-bold uppercase tracking-wide">
                <AlertCircle size={14} />
                <span>{photoError}</span>
              </div>
            )}

            {studentData?.photo ? (
              <p className="text-[9px] text-secondary font-black uppercase tracking-wider mt-3 text-center bg-secondary/10 border border-secondary/20 px-3 py-1 rounded-full">
                🔒 PROFILE PHOTO REGISTERED & LOCKED
              </p>
            ) : (
              <p className="text-[9px] text-primary/40 font-bold uppercase tracking-wider mt-3 text-center">
                JPG, JPEG or PNG. Max size 5MB.
              </p>
            )}
          </div>
          {/* Top Status Alert Block */}
          {status === "unverified" && (
            <div className="p-4 bg-primary/5 border border-primary/10 rounded-2xl flex items-center gap-3 text-primary/80">
              <ShieldAlert className="text-primary/40 shrink-0" size={24} />
              <div>
                <p className="text-[10px] font-black uppercase tracking-widest text-primary/50">Verification Status</p>
                <p className="text-xs font-black uppercase tracking-tight text-primary">Unverified / Missing</p>
                <p className="text-[9px] font-bold text-primary/60 uppercase tracking-wide leading-normal">
                  Please submit your parent details below for verification by your Faculty Advisor.
                </p>
              </div>
            </div>
          )}

          {status === "pending_approval" && (
            <div className="p-4 bg-secondary/10 border border-secondary/20 rounded-2xl flex items-center gap-3 text-secondary">
              <Clock className="text-secondary shrink-0" size={24} />
              <div>
                <p className="text-[10px] font-black uppercase tracking-widest text-secondary/60">Verification Status</p>
                <p className="text-xs font-black uppercase tracking-tight text-secondary">Pending Advisor Approval</p>
                <p className="text-[9px] font-bold text-secondary/70 uppercase tracking-wide leading-normal">
                  Your updated parent details are waiting for verification. The previous verified details (if any) are kept safe.
                </p>
              </div>
            </div>
          )}

          {status === "verified" && (
            <div className="p-4 bg-success/5 border border-success/20 rounded-2xl flex items-center gap-3 text-success">
              <CheckCircle2 className="text-success shrink-0" size={24} />
              <div>
                <p className="text-[10px] font-black uppercase tracking-widest text-success/60">Verification Status</p>
                <p className="text-xs font-black uppercase tracking-tight text-success">Verified & Approved</p>
                <p className="text-[9px] font-bold text-success/70 uppercase tracking-wide leading-normal">
                  Your parent details are verified and approved by your Faculty Advisor.
                </p>
              </div>
            </div>
          )}

          {status === "rejected" && (
            <div className="p-4 bg-error/5 border border-error/20 rounded-2xl flex items-center gap-3 text-error">
              <XCircle className="text-error shrink-0" size={24} />
              <div>
                <p className="text-[10px] font-black uppercase tracking-widest text-error/60">Verification Status</p>
                <p className="text-xs font-black uppercase tracking-tight text-error">Details Rejected</p>
                <p className="text-[9px] font-bold text-error/70 uppercase tracking-wide leading-normal">
                  Your previous details were rejected by your Faculty Advisor. Please correct and resubmit.
                </p>
              </div>
            </div>
          )}

          {!isUpdating ? (
            <div className="space-y-6">
              {/* CURRENTLY ACTIVE/VERIFIED PARENT DETAILS */}
              <div className="p-5 bg-primary/[0.03] border border-primary/10 rounded-2xl space-y-3">
                <p className="text-[10px] font-black uppercase tracking-widest text-primary/40">Approved Parent Details</p>
                {studentData?.parent_name ? (
                  <div className="space-y-1">
                    <p className="text-sm font-black text-primary uppercase">{studentData.parent_name}</p>
                    <p className="text-xs font-bold text-primary/70">{studentData.parent_phone}</p>
                    <p className="text-xs font-bold text-primary/70">{studentData.parent_email}</p>
                  </div>
                ) : (
                  <p className="text-xs font-bold text-primary/50 italic">No existing approved details found</p>
                )}
              </div>

              {/* PENDING / PROPOSED DETAILS SECTION */}
              {studentData?.parent_verification_status === "pending_approval" && (
                <div className="p-5 bg-secondary/5 border border-secondary/20 rounded-2xl space-y-3">
                  <p className="text-[10px] font-black uppercase tracking-widest text-secondary/60">Proposed / Pending Details</p>
                  <div className="space-y-1">
                    <p className="text-sm font-black text-secondary uppercase">{studentData.pending_parent_name}</p>
                    <p className="text-xs font-bold text-secondary/80">{studentData.pending_parent_phone}</p>
                    <p className="text-xs font-bold text-secondary/80">{studentData.pending_parent_email}</p>
                  </div>
                </div>
              )}

              <button
                onClick={() => {
                  setParentName("");
                  setParentPhone("");
                  setParentEmail("");
                  setIsUpdating(true);
                }}
                className="w-full h-16 bg-secondary text-white rounded-2xl font-black uppercase tracking-[0.2em] shadow-lg shadow-secondary/20 hover:shadow-secondary/40 active:scale-[0.98] transition-all flex items-center justify-center space-x-3"
              >
                <Edit3 size={18} />
                <span>{studentData?.parent_name ? "Update Details" : "Register Details"}</span>
              </button>
            </div>
          ) : (
            <div className="space-y-6">
              <div className="mb-4">
                <h2 className="text-sm font-black text-primary uppercase tracking-wider mb-1">
                  Propose New Details
                </h2>
                <p className="text-primary/60 text-[10px] font-bold uppercase tracking-wider">
                  The update form is blank. Please enter new parent details.
                </p>
              </div>

              <form onSubmit={handleSubmit} className="space-y-6">
                <div className="space-y-2">
                  <label className="text-[10px] font-bold text-primary/60 uppercase tracking-widest ml-1">
                    Parent's Full Name
                  </label>
                  <div className="relative group">
                    <UserIcon
                      className="absolute left-5 top-1/2 -translate-y-1/2 text-primary/20 group-focus-within:text-secondary transition-colors"
                      size={18}
                    />
                    <input
                      required
                      type="text"
                      value={parentName}
                      onChange={(e) => setParentName(e.target.value)}
                      placeholder="Parent Name"
                      className="w-full h-14 bg-primary/[0.03] border border-primary/10 rounded-2xl pl-14 pr-6 text-primary font-bold placeholder:text-primary/40 focus:outline-none focus:border-secondary transition-all"
                    />
                  </div>
                </div>

                <div className="space-y-2">
                  <label className="text-[10px] font-bold text-primary/60 uppercase tracking-widest ml-1">
                    Parent's Phone Number
                  </label>
                  <div className="relative group">
                    <Phone
                      className="absolute left-5 top-1/2 -translate-y-1/2 text-primary/20 group-focus-within:text-secondary transition-colors"
                      size={18}
                    />
                    <input
                      required
                      type="tel"
                      value={parentPhone}
                      onChange={(e) => setParentPhone(e.target.value.replace(/\D/g, "").slice(0, 10))}
                      placeholder="Parent Phone (e.g. 9876543210)"
                      className="w-full h-14 bg-primary/[0.03] border border-primary/10 rounded-2xl pl-14 pr-6 text-primary font-bold placeholder:text-primary/40 focus:outline-none focus:border-secondary transition-all"
                    />
                  </div>
                </div>

                <div className="space-y-2">
                  <label className="text-[10px] font-bold text-primary/60 uppercase tracking-widest ml-1">
                    Parent's Email Address
                  </label>
                  <div className="relative group">
                    <Mail
                      className="absolute left-5 top-1/2 -translate-y-1/2 text-primary/20 group-focus-within:text-secondary transition-colors"
                      size={18}
                    />
                    <input
                      required
                      type="email"
                      value={parentEmail}
                      onChange={(e) => setParentEmail(e.target.value)}
                      placeholder="Parent Email Address"
                      className="w-full h-14 bg-primary/[0.03] border border-primary/10 rounded-2xl pl-14 pr-6 text-primary font-bold placeholder:text-primary/40 focus:outline-none focus:border-secondary transition-all"
                    />
                  </div>
                </div>

                {error && (
                  <div className="p-4 bg-error/10 border border-error/20 rounded-2xl flex items-center space-x-3 text-error">
                    <AlertCircle size={18} />
                    <p className="text-xs font-bold uppercase tracking-tight">
                      {error}
                    </p>
                  </div>
                )}

                <AnimatePresence>
                  {isSuccess && (
                    <fm.div
                      initial={{ opacity: 0, scale: 0.95 }}
                      animate={{ opacity: 1, scale: 1 }}
                      exit={{ opacity: 0, scale: 0.95 }}
                      className="p-4 bg-success/10 border border-success/20 rounded-2xl flex items-center justify-center space-x-3 text-success"
                    >
                      <CheckCircle2 size={18} />
                      <p className="text-xs font-bold uppercase tracking-wider">
                        Parent Details Submitted for Faculty Approval!
                      </p>
                    </fm.div>
                  )}
                </AnimatePresence>

                <div className="flex flex-col sm:flex-row gap-4">
                  <button
                    type="button"
                    onClick={() => setIsUpdating(false)}
                    className="flex-1 h-16 flex-shrink-0 min-h-[4rem] bg-surface hover:bg-primary/5 border border-primary/10 hover:border-primary/20 text-primary/60 hover:text-primary rounded-2xl font-bold uppercase tracking-[0.1em] transition-all flex items-center justify-center"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    disabled={isSubmitting || isSuccess}
                    className="flex-1 h-16 flex-shrink-0 min-h-[4rem] bg-secondary text-white rounded-2xl font-black uppercase tracking-[0.2em] shadow-lg shadow-secondary/20 hover:shadow-secondary/40 active:scale-[0.98] transition-all flex items-center justify-center space-x-3 disabled:opacity-50 disabled:grayscale"
                  >
                    {isSubmitting ? (
                      <LoadingIndicator size="sm" />
                    ) : (
                      <>
                        <span>Request Approval</span>
                      </>
                    )}
                  </button>
                </div>
              </form>
            </div>
          )}
        </fm.div>
      </main>
    </GradientBackground>
  );
}
