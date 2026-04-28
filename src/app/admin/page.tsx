'use client';

import React, { useEffect, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { ArrowLeft, ShieldCheck, Users, Search, Trash2, UserCheck, UserX, ScanFace, RefreshCw } from 'lucide-react';
import { useAuth } from '@/context/AuthContext';
import { databases } from '@/lib/appwrite';
import { Query } from 'appwrite';
import { GradientBackground } from '@/components/GradientBackground';
import { LoadingIndicator } from '@/components/LoadingIndicator';
import { useRouter } from 'next/navigation';
import Link from 'next/link';

const DB_ID = "69cb970a000853f23489";
const COLL_STUDENTS = "student_details";

export default function AdminPortal() {
    const { user, isLoading: authLoading, isAdmin } = useAuth();
    const router = useRouter();
    
    const [students, setStudents] = useState<any[]>([]);
    const [isLoading, setIsLoading] = useState(true);
    const [searchTerm, setSearchTerm] = useState("");
    const [isDeleting, setIsDeleting] = useState<string | null>(null);

    useEffect(() => {
        if (!authLoading) {
            if (!user) {
                router.push('/login');
            } else if (!isAdmin) {
                router.push('/');
            } else {
                fetchStudents();
            }
        }
    }, [authLoading, user, isAdmin, router]);

    const fetchStudents = async () => {
        setIsLoading(true);
        try {
            const response = await databases.listDocuments(DB_ID, COLL_STUDENTS, [
                Query.limit(100),
                Query.orderDesc("$createdAt")
            ]);
            setStudents(response.documents);
        } catch (error) {
            console.error("Failed to fetch students:", error);
        } finally {
            setIsLoading(false);
        }
    };

    const handleDeleteFace = async (studentId: string) => {
        if (!confirm(`Are you sure you want to remove facial data for ${studentId}?`)) {
            return;
        }

        setIsDeleting(studentId);
        try {
            const response = await fetch('/api/delete', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ roll_no: studentId })
            });

            if (!response.ok) {
                throw new Error("Failed to delete facial data from AI server");
            }

            // Update Appwrite
            await databases.updateDocument(DB_ID, COLL_STUDENTS, studentId, {
                faceRegistered: false
            });

            setStudents(prev => prev.map(s => s.$id === studentId ? { ...s, faceRegistered: false } : s));
        } catch (error: any) {
            alert(error.message || "An error occurred");
        } finally {
            setIsDeleting(null);
        }
    };

    const filteredStudents = students.filter(s => 
        s.$id.toLowerCase().includes(searchTerm.toLowerCase()) || 
        s.name?.toLowerCase().includes(searchTerm.toLowerCase())
    );

    if (authLoading || (isLoading && students.length === 0)) {
        return (
            <GradientBackground>
                <div className="flex-1 flex items-center justify-center">
                    <LoadingIndicator />
                </div>
            </GradientBackground>
        );
    }

    return (
        <GradientBackground>
            <main className="flex-1 max-w-6xl mx-auto w-full px-4 sm:px-6 pt-24 sm:pt-32 pb-12 italic">
                <header className="mb-12 flex flex-col md:flex-row md:items-center justify-between gap-6">
                    <div className="flex items-center space-x-4">
                        <Link href="/" className="p-2 hover:bg-white/5 rounded-full transition-all text-white/40 hover:text-white">
                            <ArrowLeft size={24} />
                        </Link>
                        <div>
                            <p className="text-secondary font-medium tracking-[0.2em] text-xs uppercase mb-1">Administrative Access</p>
                            <h1 className="text-3xl font-bold text-white tracking-tight italic uppercase flex items-center space-x-3">
                                <ShieldCheck className="text-secondary" />
                                <span>Admin Portal</span>
                            </h1>
                        </div>
                    </div>

                    <div className="relative group max-w-sm w-full">
                        <div className="absolute inset-y-0 left-4 flex items-center pointer-events-none text-white/20 group-focus-within:text-secondary transition-colors">
                            <Search size={18} />
                        </div>
                        <input 
                            type="text"
                            placeholder="SEARCH BY ROLL NO OR NAME..."
                            value={searchTerm}
                            onChange={(e) => setSearchTerm(e.target.value)}
                            className="w-full bg-surface/50 border border-white/5 rounded-2xl h-12 pl-12 pr-4 text-white text-sm focus:outline-none focus:border-secondary/50 transition-all uppercase placeholder:text-white/10"
                        />
                    </div>
                </header>

                <div className="grid grid-cols-1 gap-4">
                    <div className="hidden md:flex items-center justify-between px-6 py-4 text-white/20 text-[10px] font-bold uppercase tracking-widest border-b border-white/5 mb-2">
                        <div className="flex items-center space-x-2 w-1/3">
                            <Users size={12} />
                            <span>Student Profile</span>
                        </div>
                        <div className="w-1/4 text-center">Biometrics</div>
                        <div className="w-1/4 text-right">Actions</div>
                    </div>

                    <AnimatePresence mode='popLayout'>
                        {filteredStudents.map((student) => (
                            <motion.div 
                                key={student.$id}
                                layout
                                initial={{ opacity: 0, y: 10 }}
                                animate={{ opacity: 1, y: 0 }}
                                exit={{ opacity: 0, scale: 0.95 }}
                                className="bg-surface/30 border border-white/5 p-5 sm:p-6 rounded-2xl flex flex-col md:flex-row items-start md:items-center justify-between group hover:bg-surface/50 transition-all gap-4"
                            >
                                <div className="flex items-center space-x-4 w-full md:w-1/3">
                                    <div className="w-12 h-12 bg-background/50 rounded-xl flex items-center justify-center text-white/40 font-bold uppercase border border-white/5">
                                        {student.name?.[0] || '?'}
                                    </div>
                                    <div>
                                        <h3 className="text-white font-bold uppercase tracking-tight flex items-center space-x-2">
                                            <span>{student.name || 'Unknown Student'}</span>
                                            {student.gender && (
                                                <span className="text-[8px] bg-white/5 text-white/40 px-1.5 py-0.5 rounded border border-white/5 tracking-tighter">
                                                    {student.gender}
                                                </span>
                                            )}
                                        </h3>
                                        <p className="text-white/30 text-xs font-medium">{student.$id}</p>
                                    </div>
                                </div>

                                <div className="w-full md:w-1/4 flex justify-start md:justify-center">
                                    {student.faceRegistered ? (
                                        <div className="flex items-center space-x-2 text-secondary bg-secondary/10 px-4 py-1.5 rounded-full border border-secondary/20">
                                            <UserCheck size={14} />
                                            <span className="text-[10px] font-bold uppercase tracking-widest">Enrolled</span>
                                        </div>
                                    ) : (
                                        <div className="flex items-center space-x-2 text-white/20 bg-white/5 px-4 py-1.5 rounded-full border border-white/5">
                                            <UserX size={14} />
                                            <span className="text-[10px] font-bold uppercase tracking-widest">Pending</span>
                                        </div>
                                    )}
                                </div>

                                <div className="w-full md:w-1/4 flex justify-end items-center space-x-3 opacity-100 md:opacity-40 md:group-hover:opacity-100 transition-opacity">
                                    {student.faceRegistered && (
                                        <button 
                                            onClick={() => handleDeleteFace(student.$id)}
                                            disabled={isDeleting === student.$id}
                                            className="p-3 bg-error/10 text-error rounded-xl hover:bg-error/20 transition-all border border-error/10"
                                            title="Delete Facial Data"
                                        >
                                            {isDeleting === student.$id ? (
                                                <RefreshCw size={18} className="animate-spin" />
                                            ) : (
                                                <Trash2 size={18} />
                                            )}
                                        </button>
                                    )}
                                    <div className="p-2 text-white/5">
                                        <ScanFace size={20} />
                                    </div>
                                </div>
                            </motion.div>
                        ))}
                    </AnimatePresence>

                    {filteredStudents.length === 0 && (
                        <div className="py-20 text-center space-y-4">
                            <div className="w-16 h-16 bg-white/5 rounded-full flex items-center justify-center text-white/10 mx-auto">
                                <Users size={32} />
                            </div>
                            <p className="text-white/20 text-xs font-bold uppercase tracking-[0.2em]">No students found</p>
                        </div>
                    )}
                </div>
            </main>
        </GradientBackground>
    );
}
