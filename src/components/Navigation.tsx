'use client';

/**
 * Navigation Component
 * Provides the main top navigation bar with user profile, theme toggle, and role-based links.
 */


import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { LogOut, Home, Settings, User, Sun, Moon, QrCode, X } from 'lucide-react';
import { useAuth } from '@/context/AuthContext';
import { useTheme } from '@/context/ThemeContext';
import { useLoading } from '@/context/LoadingContext';
import { usePathname, useRouter } from 'next/navigation';
import { tablesDB, storage } from '@/lib/appwrite';
import { generateTOTP, generateBase32Secret, encryptSecret, decryptSecret } from "@/lib/totp";
import QRCode from "qrcode";
import { DB_ID, COLLECTIONS, BUCKETS } from "@/lib/constants";
import { LoadingIndicator } from "@/components/LoadingIndicator";

export const Navigation: React.FC = () => {
    const { user, logout, isAdmin, isKiosk, isFaculty, isCaretaker, studentData } = useAuth();
    const { theme, toggleTheme } = useTheme();
    const { startLoading } = useLoading();
    const pathname = usePathname();
    const router = useRouter();

    const isRegularStudent = !!(studentData && !isAdmin && !isKiosk && !isFaculty && !isCaretaker);

    const [isIdModalOpen, setIsIdModalOpen] = useState(false);
    const [totpToken, setTotpToken] = useState("");
    const [secondsRemaining, setSecondsRemaining] = useState(30);
    const [qrUrl, setQrUrl] = useState("");

    // TOTP & QR Code Loop + Screen Wake Lock
    useEffect(() => {
        if (!isIdModalOpen || !studentData) return;

        let active = true;
        let interval: NodeJS.Timeout;

        const initSecretAndToken = async () => {
            let secret = studentData.totp_secret;

            if (!secret) {
                try {
                    console.log("Generating new TOTP secret for student...");
                    const rawSecret = generateBase32Secret(16);
                    const encryptedSecret = encryptSecret(rawSecret);

                    await tablesDB.updateRow({
                        databaseId: DB_ID,
                        tableId: COLLECTIONS.STUDENTS,
                        rowId: studentData.$id,
                        data: { totp_secret: encryptedSecret }
                    });

                    // Update local state / context
                    studentData.totp_secret = encryptedSecret;
                    secret = encryptedSecret;
                } catch (err) {
                    console.error("Failed to generate or save TOTP secret", err);
                    return;
                }
            }

            const decryptedSecret = decryptSecret(secret);

            const updateToken = async () => {
                if (!decryptedSecret || !active) return;
                try {
                    const token = await generateTOTP(decryptedSecret);
                    if (!active) return;
                    setTotpToken(token);

                    // Generate QR code
                    const text = `${studentData.$id}:${token}`;
                    const url = await QRCode.toDataURL(text, {
                        margin: 1,
                        width: 256,
                        color: {
                            dark: "#000000",
                            light: "#FFFFFF"
                        }
                    });
                    if (!active) return;
                    setQrUrl(url);
                } catch (err) {
                    console.error("Failed to generate TOTP/QR", err);
                }
            };

            // Initial update
            await updateToken();

            // Start ticker
            interval = setInterval(async () => {
                const epoch = Math.floor(Date.now() / 1000);
                const remaining = 30 - (epoch % 30);
                setSecondsRemaining(remaining);

                if (remaining === 30 || remaining === 0) {
                    await updateToken();
                }
            }, 1000);
        };

        initSecretAndToken();

        // Screen Wake Lock API
        let wakeLock: any = null;
        const requestWakeLock = async () => {
            try {
                if ("wakeLock" in navigator) {
                    wakeLock = await navigator.wakeLock.request("screen");
                }
            } catch (err) {
                console.warn("Wake lock failed", err);
            }
        };

        requestWakeLock();

        const handleVisibility = async () => {
            if (wakeLock === null && document.visibilityState === "visible") {
                await requestWakeLock();
            }
        };

        document.addEventListener("visibilitychange", handleVisibility);

        return () => {
            active = false;
            if (interval) clearInterval(interval);
            document.removeEventListener("visibilitychange", handleVisibility);
            if (wakeLock) {
                wakeLock.release().catch((err: any) => console.error("Release lock failed", err));
            }
        };
    }, [isIdModalOpen, studentData]);

    if (!user) return null;

    const handleNav = (href: string) => {
        if (pathname !== href) {
            startLoading();
            router.push(href);
        }
    };

    return (
        <>
            <nav className="fixed top-0 left-0 right-0 z-50 bg-surface/80 backdrop-blur-md border-b border-primary/10 px-4 sm:px-6 pt-8 sm:pt-10 pb-6 sm:pb-8 shadow-sm transition-colors duration-300">
                <div className="max-w-7xl mx-auto flex items-center justify-between">
                    <button onClick={() => handleNav('/')} className="flex items-center space-x-4 group text-left">
                        <div className="relative w-12 h-12 flex items-center justify-center mr-2">
                            {/* eslint-disable-next-line @next/next/no-img-element */}
                            <img src="/logo.webp" alt="NITPY Logo" className="w-full h-full object-contain" />
                        </div>
                        <div className="flex flex-col justify-center">
                            <span className="font-black tracking-tighter text-primary text-base sm:text-3xl leading-none uppercase">NITPY</span>
                            <span className="text-[7px] sm:text-[9px] font-black text-primary/40 uppercase tracking-[0.2em] sm:tracking-[0.4em] leading-none mt-1.5 sm:mt-2">Student Portal</span>
                        </div>
                    </button>

                    <div className="flex items-center space-x-3 sm:space-x-6">
                        <div className="hidden sm:flex items-center space-x-2 text-primary/80 text-xs font-black mr-4">
                            <User size={14} className="text-secondary" />
                            <span className="uppercase tracking-[0.15em]">{user.name}</span>
                        </div>

                        <div className="flex items-center space-x-2">
                            {isRegularStudent && (
                                <button
                                    onClick={() => setIsIdModalOpen(true)}
                                    className="h-10 px-4 bg-secondary/10 border border-secondary/20 hover:bg-secondary/20 text-secondary rounded-xl font-black uppercase tracking-widest text-[10px] transition-all hover:scale-105 active:scale-95 flex items-center justify-center"
                                    title="Show Digital ID Card"
                                >
                                    <span>ID Card</span>
                                </button>
                            )}

                            {(isFaculty || isCaretaker) && (
                                <button
                                    onClick={() => handleNav('/system')}
                                    className={`p-2.5 rounded-xl transition-all ${pathname === '/system' ? 'bg-secondary/10 text-secondary' : 'text-primary/40 hover:text-primary hover:bg-primary/5'}`}
                                    title="System Maintenance"
                                >
                                    <Settings size={20} />
                                </button>
                            )}

                            <button
                                onClick={toggleTheme}
                                className="p-2.5 text-primary/60 hover:text-primary hover:bg-primary/5 rounded-xl transition-all"
                                title={theme === 'light' ? 'Switch to Dark Mode' : 'Switch to Light Mode'}
                            >
                                {theme === 'light' ? <Moon size={20} /> : <Sun size={20} />}
                            </button>

                            <button
                                onClick={() => {
                                    startLoading();
                                    logout();
                                }}
                                className="p-2.5 text-primary/40 hover:text-secondary hover:bg-secondary/5 rounded-xl transition-all"
                            >
                                <LogOut size={20} />
                            </button>
                        </div>
                    </div>
                </div>
            </nav>

            <AnimatePresence>
                {isIdModalOpen && isRegularStudent && (
                    <div
                        className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/80 backdrop-blur-xl"
                        onClick={() => setIsIdModalOpen(false)}
                    >
                        <motion.div
                            initial={{ scale: 0.9, y: 20, opacity: 0 }}
                            animate={{ scale: 1, y: 0, opacity: 1 }}
                            exit={{ scale: 0.9, y: 20, opacity: 0 }}
                            className="w-full max-w-sm max-h-[92vh] overflow-y-auto bg-surface/90 border border-primary/10 rounded-[2.5rem] shadow-2xl relative flex flex-col p-5 sm:p-6 text-center select-none scrollbar-none"
                            onClick={(e) => e.stopPropagation()}
                        >
                            {/* Top Bar with Close Button */}
                            <div className="flex justify-between items-center mb-3 sm:mb-4">
                                <span className="text-secondary font-black text-[9px] sm:text-[10px] uppercase tracking-[0.2em] bg-secondary/10 px-3 py-1 rounded-full border border-secondary/20">
                                    Digital Student ID
                                </span>
                                <button
                                    onClick={() => setIsIdModalOpen(false)}
                                    className="p-1.5 hover:bg-primary/5 active:scale-95 rounded-full transition-all text-primary/60 hover:text-primary"
                                >
                                    <X size={18} />
                                </button>
                            </div>

                            {/* Student Photo Section */}
                            <div className="flex flex-col items-center mb-4">
                                <div className="relative w-20 h-20 sm:w-24 sm:h-24 rounded-2xl overflow-hidden border-2 border-secondary/30 bg-primary/5 flex items-center justify-center shadow-md">
                                    {studentData.photo ? (
                                        // eslint-disable-next-line @next/next/no-img-element
                                        <img
                                            src={storage.getFilePreview({ bucketId: BUCKETS.STUDENT_PHOTOS, fileId: studentData.photo }).toString()}
                                            alt={studentData.name}
                                            className="w-full h-full object-cover"
                                        />
                                    ) : (
                                        <div className="w-full h-full flex items-center justify-center bg-gradient-to-tr from-secondary/15 to-primary/5 text-secondary">
                                            <User size={40} className="opacity-80" />
                                        </div>
                                    )}
                                </div>
                                <h2 className="text-lg sm:text-xl font-bold text-primary uppercase mt-2.5 tracking-tight leading-tight">
                                    {studentData.name}
                                </h2>
                                <p className="text-secondary font-mono text-xs font-semibold tracking-wider mt-0.5">
                                    {studentData.$id}
                                </p>
                            </div>

                            {/* Details Badges */}
                            <div className="grid grid-cols-3 gap-2 mb-4">
                                <div className="bg-primary/5 border border-primary/5 rounded-2xl p-1.5 sm:p-2 flex flex-col items-center">
                                    <span className="text-[8px] sm:text-[9px] font-bold text-primary/40 uppercase tracking-wider mb-0.5">Course</span>
                                    <span className="text-[10px] sm:text-xs font-black text-primary/80 uppercase">
                                        {studentData.course === "b.tech" ? "B.Tech" : studentData.course === "m.tech" ? "M.Tech" : studentData.course === "bsc" ? "B.Sc" : studentData.course === "msc" ? "M.Sc" : studentData.course}
                                    </span>
                                </div>
                                <div className="bg-primary/5 border border-primary/5 rounded-2xl p-1.5 sm:p-2 flex flex-col items-center">
                                    <span className="text-[8px] sm:text-[9px] font-bold text-primary/40 uppercase tracking-wider mb-0.5">Year</span>
                                    <span className="text-[10px] sm:text-xs font-black text-primary/80 uppercase">{studentData.year} Year</span>
                                </div>
                                <div className="bg-primary/5 border border-primary/5 rounded-2xl p-1.5 sm:p-2 flex flex-col items-center">
                                    <span className="text-[8px] sm:text-[9px] font-bold text-primary/40 uppercase tracking-wider mb-0.5">Dept</span>
                                    <span className="text-[10px] sm:text-xs font-black text-primary/80 uppercase">{studentData.department}</span>
                                </div>
                            </div>

                            {/* QR Code Container Wrapper */}
                            <div className="w-full flex justify-center mb-4">
                                {/* QR Code Container */}
                                <div className="w-44 h-44 sm:w-48 sm:h-48 min-w-[176px] max-w-[176px] min-h-[176px] max-h-[176px] sm:min-w-[192px] sm:max-w-[192px] sm:min-h-[192px] sm:max-h-[192px] bg-white rounded-[2rem] shadow-inner border border-primary/5 flex items-center justify-center relative group overflow-hidden shrink-0">
                                    {qrUrl ? (
                                        // eslint-disable-next-line @next/next/no-img-element
                                        <img
                                            src={qrUrl}
                                            alt="Scan Me"
                                            className="w-36 h-36 sm:w-50 sm:h-50 min-w-[144px] max-w-[144px] min-h-[144px] max-h-[144px] sm:min-w-[160px] sm:max-w-[160px] sm:min-h-[160px] sm:max-h-[160px] select-none aspect-square object-contain shrink-0"
                                            draggable={false}
                                        />
                                    ) : (
                                        <div className="w-36 h-36 sm:w-50 sm:h-50 min-w-[144px] max-w-[144px] min-h-[144px] max-h-[144px] sm:min-w-[160px] sm:max-w-[160px] sm:min-h-[160px] sm:max-h-[160px] flex items-center justify-center text-primary/20 shrink-0">
                                            <LoadingIndicator size="sm" />
                                        </div>
                                    )}
                                </div>
                            </div>

                            {/* Animated Countdown Circle & TOTP Token */}
                            <div className="flex flex-col items-center space-y-3 mb-3">
                                {totpToken && (
                                    <div className="flex items-center space-x-2">
                                        <span className="text-[10px] font-bold text-primary/40 uppercase tracking-widest">Code:</span>
                                        <span className="text-sm sm:text-base font-mono font-black text-secondary tracking-widest bg-secondary/10 px-2.5 py-0.5 rounded-xl">
                                            {totpToken.slice(0, 3)} {totpToken.slice(3)}
                                        </span>
                                    </div>
                                )}

                                <div className="flex items-center space-x-2.5 text-primary/60">
                                    {/* Countdown Circle */}
                                    <div className="relative w-6 h-6 flex items-center justify-center">
                                        <svg className="w-full h-full transform -rotate-90">
                                            <circle
                                                cx="12"
                                                cy="12"
                                                r="9"
                                                className="stroke-primary/10"
                                                strokeWidth="2.5"
                                                fill="transparent"
                                            />
                                            <circle
                                                cx="12"
                                                cy="12"
                                                r="9"
                                                className="stroke-secondary transition-all duration-1000 ease-linear"
                                                strokeWidth="2.5"
                                                fill="transparent"
                                                strokeDasharray={2 * Math.PI * 9}
                                                strokeDashoffset={2 * Math.PI * 9 * (1 - secondsRemaining / 30)}
                                            />
                                        </svg>
                                        <span className="absolute text-[8px] sm:text-[9px] font-bold font-mono text-primary/80">
                                            {secondsRemaining}
                                        </span>
                                    </div>
                                    <span className="text-[8px] sm:text-[9px] font-bold uppercase tracking-wider text-primary/40">
                                        Refreshes in {secondsRemaining}s
                                    </span>
                                </div>
                            </div>

                        </motion.div>
                    </div>
                )}
            </AnimatePresence>
        </>
    );
};

