'use client';

import React, { useEffect, useState, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { ArrowLeft, Footprints, Search, AlertCircle, CheckCircle2, RefreshCw, User, Phone, X } from 'lucide-react';
import { useAuth } from '@/context/AuthContext';
import { databases, tablesDB, fetchAllRows, Query } from '@/lib/appwrite';
import { GradientBackground } from '@/components/GradientBackground';
import { LoadingIndicator } from '@/components/LoadingIndicator';
import { Navigation } from "@/components/Navigation";
import { useRouter } from 'next/navigation';
import { format } from 'date-fns';
import { Student } from '@/types/models';
import Link from 'next/link';

import { DB_ID, COLLECTIONS } from "@/lib/constants";

export default function LiveStatusPage() {
    const { user, isLoading: authLoading, isAdmin, isKiosk } = useAuth();
    const router = useRouter();
    
    const [liveOutings, setLiveOutings] = useState<any[]>([]);
    const [isLoading, setIsLoading] = useState(true);
    const [searchTerm, setSearchTerm] = useState("");
    const [lastUpdated, setLastUpdated] = useState<Date>(new Date());
    
    const [selectedStudent, setSelectedStudent] = useState<Student | null>(null);
    const [isLoadingDetails, setIsLoadingDetails] = useState(false);
    const isFetchingRef = useRef(false);

    useEffect(() => {
        if (!authLoading) {
            if (!user) {
                router.push('/login');
            } else if (!isAdmin && !isKiosk) {
                router.push('/');
            } else {
                fetchLiveOutings();
                // Refresh every 30 seconds
                const interval = setInterval(fetchLiveOutings, 30000);
                return () => clearInterval(interval);
            }
        }
    }, [authLoading, user, isAdmin, isKiosk, router]);

    const handleStudentClick = async (rollNo: string) => {
        setIsLoadingDetails(true);
        try {
            const student = await tablesDB.getRow({
                databaseId: DB_ID,
                tableId: COLLECTIONS.STUDENTS,
                rowId: rollNo
            });
            setSelectedStudent(student as unknown as Student);
        } catch (error) {
            console.error("Failed to fetch student details:", error);
            alert("Could not load contact details for this student.");
        } finally {
            setIsLoadingDetails(false);
        }
    };

    const fetchLiveOutings = async () => {
        if (isFetchingRef.current) return;
        isFetchingRef.current = true;
        
        setIsLoading(true);
        try {
            const allOutings = await fetchAllRows<any>(DB_ID, COLLECTIONS.OUTING, [
                Query.isNull("in_time"),
                Query.orderDesc("out_time"),
            ]);
            
            // Enrich with gender data
            const rollNos = Array.from(new Set(allOutings.map((o: any) => o.roll_no)));
            if (rollNos.length > 0) {
                // Fetch student details in batches of 100 for better performance and to stay within Appwrite limits
                const studentRows: any[] = [];
                for (let i = 0; i < rollNos.length; i += 100) {
                    const batch = rollNos.slice(i, i + 100);
                    const batchRows = await fetchAllRows<any>(DB_ID, COLLECTIONS.STUDENTS, [
                        Query.equal("$id", batch)
                    ]);
                    studentRows.push(...batchRows);
                }
                
                const genderMap = new Map(studentRows.map((s: any) => [s.$id, s.gender]));
                const enriched = allOutings.map((o: any) => ({
                    ...o,
                    gender: genderMap.get(o.roll_no) || 'UNKNOWN'
                }));
                setLiveOutings(enriched);
            } else {
                setLiveOutings([]);
            }
            
            setLastUpdated(new Date());
        } catch (error) {
            console.error("Failed to fetch live outings:", error);
        } finally {
            setIsLoading(false);
            isFetchingRef.current = false;
        }
    };

    const isStudentLate = (gender: string) => {
        const now = new Date();
        const hours = now.getHours();
        const minutes = now.getMinutes();
        const totalMinutes = hours * 60 + minutes;

        // Reset time is 4:00 AM (240 minutes)
        const resetMinutes = 4 * 60;

        if (gender === 'FEMALE') {
            // Late: 7:00 PM (1140 mins) to 4:00 AM
            const startMinutes = 19 * 60;
            return totalMinutes >= startMinutes || totalMinutes < resetMinutes;
        } else if (gender === 'MALE') {
            // Late: 10:30 PM (1350 mins) to 4:00 AM
            const startMinutes = 22 * 60 + 30;
            return totalMinutes >= startMinutes || totalMinutes < resetMinutes;
        }
        return false;
    };

    const filteredOutings = liveOutings.filter(o => 
        o.roll_no.toLowerCase().includes(searchTerm.toLowerCase())
    );

    if (authLoading || (isLoading && liveOutings.length === 0)) {
        return (
            <GradientBackground>
                <Navigation />
                <div className="flex-1 flex items-center justify-center">
                    <LoadingIndicator />
                </div>
            </GradientBackground>
        );
    }

    return (
        <GradientBackground>
            <Navigation />
            <main className="flex-1 max-w-7xl mx-auto w-full px-4 sm:px-6 pt-36 sm:pt-40 pb-12">
                <header className="mb-12 flex flex-col md:flex-row md:items-center justify-between gap-6">
                    <div className="flex items-center space-x-4">
                        <Link href="/" className="p-2 hover:bg-primary/5 rounded-full transition-all text-primary/40 hover:text-primary">
                            <ArrowLeft size={24} />
                        </Link>
                        <div>
                            <div className="flex items-center space-x-2 mb-1">
                                <div className="w-2 h-2 bg-secondary rounded-full animate-ping" />
                                <p className="text-secondary font-bold tracking-[0.2em] text-[10px] sm:text-xs uppercase">Live Outing Monitor</p>
                            </div>
                            <h1 className="text-3xl font-bold text-primary tracking-tight uppercase flex items-center space-x-3">
                                <span>Active Outings</span>
                            </h1>
                        </div>
                    </div>

                    <div className="flex flex-col sm:flex-row items-center gap-4 w-full md:w-auto">
                        <div className="relative group max-w-sm w-full">
                            <div className="absolute inset-y-0 left-4 flex items-center pointer-events-none text-primary/60 group-focus-within:text-secondary transition-colors">
                                <Search size={18} />
                            </div>
                            <input 
                                type="text"
                                placeholder="SEARCH BY ROLL NO..."
                                value={searchTerm}
                                onChange={(e) => setSearchTerm(e.target.value)}
                                className="w-full bg-surface border border-primary/10 rounded-2xl h-12 pl-12 pr-4 text-primary text-sm focus:outline-none focus:border-secondary/50 transition-all uppercase placeholder:text-primary/60"
                            />
                        </div>
                        <button 
                            onClick={fetchLiveOutings}
                            className="p-3 bg-primary/5 text-primary/60 hover:text-secondary hover:bg-secondary/10 rounded-2xl transition-all border border-primary/5 hover:border-secondary/20 shrink-0"
                            title="Refresh Data"
                        >
                            <RefreshCw size={20} className={isLoading ? "animate-spin" : ""} />
                        </button>
                    </div>
                </header>

                <div className="mb-8 flex items-center justify-between text-[10px] font-bold uppercase tracking-[0.2em] text-primary/70 px-2">
                    <p>{filteredOutings.length} Students Currently Away</p>
                    <p>Last Sync: {format(lastUpdated, "hh:mm:ss a")}</p>
                </div>

                <AnimatePresence mode='popLayout'>
                    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
                        {filteredOutings.map((outing, idx) => {
                            const isLate = isStudentLate(outing.gender);
                            return (
                                <motion.div 
                                    key={outing.$id}
                                    layout
                                    initial={{ opacity: 0, scale: 0.95 }}
                                    animate={{ opacity: 1, scale: 1 }}
                                    exit={{ opacity: 0, scale: 0.9 }}
                                    onClick={() => handleStudentClick(outing.roll_no)}
                                    className={`bg-surface border p-6 rounded-[2rem] flex flex-col justify-between group hover:bg-surface/80 transition-all gap-6 shadow-sm hover:shadow-xl relative overflow-hidden cursor-pointer active:scale-95 ${
                                        isLate 
                                        ? 'border-error/30 shadow-error/5 hover:shadow-error/10' 
                                        : 'border-secondary/10 hover:shadow-secondary/5'
                                    }`}
                                >
                                    <div className="absolute -right-4 -top-4 opacity-[0.03] group-hover:opacity-[0.07] transition-opacity rotate-12">
                                        <Footprints size={120} className={isLate ? "text-error" : "text-secondary"} />
                                    </div>

                                    <div className="space-y-4 relative z-10">
                                        <div className="flex items-center justify-between">
                                            <div className={`w-10 h-10 rounded-xl flex items-center justify-center border ${
                                                isLate ? 'bg-error/10 text-error border-error/20' : 'bg-secondary/10 text-secondary border-secondary/20'
                                            }`}>
                                                <User size={20} />
                                            </div>
                                            <div className="flex flex-col items-end gap-1">
                                                <span className={`text-[9px] font-black uppercase tracking-[0.2em] px-3 py-1 rounded-full border ${
                                                    isLate ? 'text-error bg-error/10 border-error/20' : 'text-secondary bg-secondary/10 border-secondary/20'
                                                }`}>
                                                    {outing.gender}
                                                </span>
                                                {isLate && (
                                                    <span className="text-[7px] font-black uppercase tracking-[0.3em] text-error animate-pulse">
                                                        LATE ALERT
                                                    </span>
                                                )}
                                            </div>
                                        </div>

                                        <div>
                                            <h3 className={`text-xl font-black uppercase tracking-tight transition-colors ${
                                                isLate ? 'text-error' : 'text-primary'
                                            }`}>
                                                {outing.roll_no}
                                            </h3>
                                            <div className="flex items-center space-x-2 mt-2">
                                                <AlertCircle size={14} className={isLate ? "text-error/60" : "text-secondary/60"} />
                                                <p className="text-[10px] font-bold text-primary/60 uppercase tracking-widest">
                                                    Since {format(new Date(outing.out_time), "MMM dd, hh:mm a")}
                                                </p>
                                            </div>
                                        </div>
                                    </div>
                                    
                                    <div className="pt-4 border-t border-primary/5">
                                        <p className="text-[8px] font-bold text-primary/60 uppercase tracking-[0.3em]">Session ID: {outing.$id.slice(-8)}</p>
                                    </div>
                                </motion.div>
                            );
                        })}
                    </div>
                </AnimatePresence>

                {filteredOutings.length === 0 && (
                    <motion.div 
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        className="py-24 text-center space-y-6"
                    >
                        <div className="w-20 h-20 bg-primary/5 rounded-full flex items-center justify-center text-primary/10 mx-auto border border-primary/5">
                            <CheckCircle2 size={40} />
                        </div>
                        <div className="space-y-2">
                            <p className="text-primary/60 text-sm font-bold uppercase tracking-[0.2em]">All students accounted for</p>
                            <p className="text-primary/40 text-[10px] font-bold uppercase tracking-widest">No active outings found at this time</p>
                        </div>
                    </motion.div>
                )}

                <AnimatePresence>
                    {(selectedStudent || isLoadingDetails) && (
                        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 sm:p-6">
                            <motion.div 
                                initial={{ opacity: 0 }}
                                animate={{ opacity: 1 }}
                                exit={{ opacity: 0 }}
                                onClick={() => setSelectedStudent(null)}
                                className="absolute inset-0 bg-primary/20 backdrop-blur-xl"
                            />
                            
                            <motion.div 
                                initial={{ opacity: 0, scale: 0.9, y: 20 }}
                                animate={{ opacity: 1, scale: 1, y: 0 }}
                                exit={{ opacity: 0, scale: 0.9, y: 20 }}
                                className="relative bg-surface border border-primary/10 w-full max-w-sm rounded-[2.5rem] overflow-hidden shadow-2xl"
                            >
                                {isLoadingDetails ? (
                                    <div className="h-64 flex flex-col items-center justify-center space-y-4">
                                        <RefreshCw size={32} className="text-secondary animate-spin" />
                                        <p className="text-[10px] font-bold text-primary/60 uppercase tracking-[0.2em]">Fetching Details...</p>
                                    </div>
                                ) : selectedStudent && (
                                    <>
                                        <div className="p-8 pb-0 flex justify-between items-start">
                                            <div className="w-16 h-16 bg-primary/5 rounded-2xl flex items-center justify-center text-primary/20 border border-primary/10">
                                                <User size={32} />
                                            </div>
                                            <button 
                                                onClick={() => setSelectedStudent(null)}
                                                className="p-2 hover:bg-primary/5 rounded-full text-primary/20 hover:text-primary transition-all"
                                            >
                                                <X size={20} />
                                            </button>
                                        </div>

                                        <div className="p-8 pt-6 space-y-6">
                                            <div>
                                                <p className="text-secondary font-bold tracking-[0.2em] text-[10px] uppercase mb-1">Student Contact</p>
                                                <h2 className="text-2xl font-black text-primary uppercase tracking-tight leading-none">
                                                    {selectedStudent.name}
                                                </h2>
                                                <p className="text-primary/60 text-xs font-bold uppercase tracking-widest mt-2">
                                                    {selectedStudent.$id} • {selectedStudent.course} {selectedStudent.year}YR
                                                </p>
                                            </div>

                                            <div className="bg-primary/5 rounded-3xl p-6 border border-primary/5">
                                                <div className="flex items-center space-x-4 mb-4">
                                                    <div className="w-10 h-10 bg-surface rounded-xl flex items-center justify-center text-secondary shadow-sm">
                                                        <Phone size={18} />
                                                    </div>
                                                    <div>
                                                        <p className="text-[10px] font-bold text-primary/50 uppercase tracking-widest">Phone Number</p>
                                                        <p className="text-lg font-black text-primary tracking-tighter">
                                                            +91 {selectedStudent.phone_no}
                                                        </p>
                                                    </div>
                                                </div>

                                                <a 
                                                    href={`tel:${selectedStudent.phone_no}`}
                                                    className="w-full h-14 bg-secondary text-white rounded-2xl flex items-center justify-center space-x-3 font-bold uppercase tracking-widest shadow-lg shadow-secondary/20 hover:scale-[1.02] active:scale-[0.98] transition-all"
                                                >
                                                    <Phone size={18} />
                                                    <span>Call Student</span>
                                                </a>
                                            </div>
                                            
                                            <p className="text-center text-[8px] font-bold text-primary/60 uppercase tracking-[0.3em]">
                                                Academic: {selectedStudent.department}
                                            </p>
                                        </div>
                                    </>
                                )}
                            </motion.div>
                        </div>
                    )}
                </AnimatePresence>
            </main>
        </GradientBackground>
    );
}

