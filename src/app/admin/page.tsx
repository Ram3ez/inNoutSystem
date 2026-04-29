'use client';

import React, { useEffect, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { ArrowLeft, ShieldCheck, Users, Search, Trash2, UserCheck, UserX, ScanFace, RefreshCw } from 'lucide-react';
import { useAuth } from '@/context/AuthContext';
import { databases } from '@/lib/appwrite';
import { Query } from 'appwrite';
import { GradientBackground } from '@/components/GradientBackground';
import { LoadingIndicator } from '@/components/LoadingIndicator';
import { Navigation } from '@/components/Navigation';
import { useRouter } from 'next/navigation';
import Link from 'next/link';

import { Student } from '@/types/models';

import { DB_ID, COLLECTIONS, TEAMS } from "@/lib/constants";
import { teams as appwriteTeams } from '@/lib/appwrite';
import { Models } from 'appwrite';

export default function AdminPortal() {
    const { user, isLoading: authLoading, isAdmin } = useAuth();
    const router = useRouter();
    
    const [activeTab, setActiveTab] = useState<'students' | 'assignments' | 'faculty' | 'caretakers'>('students');
    const [students, setStudents] = useState<Student[]>([]);
    const [isLoading, setIsLoading] = useState(true);
    const [searchTerm, setSearchTerm] = useState("");
    const [isDeleting, setIsDeleting] = useState<string | null>(null);

    // Staff Assignment State
    const [caretakerAssignments, setCaretakerAssignments] = useState<any[]>([]);
    const [facultyAssignments, setFacultyAssignments] = useState<any[]>([]);
    const [isSavingStaff, setIsSavingStaff] = useState<string | null>(null);

    // Team Management State
    const [facultyMembers, setFacultyMembers] = useState<Models.Membership[]>([]);
    const [caretakerMembers, setCaretakerMembers] = useState<Models.Membership[]>([]);
    const [isManagingTeam, setIsManagingTeam] = useState(false);
    const [inviteEmail, setInviteEmail] = useState("");
    const [inviteName, setInviteName] = useState("");
    const [inviteError, setInviteError] = useState<string | null>(null);
    const [showInviteSuggestions, setShowInviteSuggestions] = useState(false);

    const isStudentEmail = (email: string) => {
        const prefix = email.split('@')[0];
        // Matches pattern like EE23B1001
        return /^[A-Z]{2}[0-9]{2}[A-Z][0-9]{4}$/.test(prefix.toUpperCase());
    };

    const staffSuggestions = Array.from(new Map(
        [...facultyMembers, ...caretakerMembers]
            .map(m => [m.userEmail, { email: m.userEmail, name: m.userName }])
    ).values()).filter(u => u.email && !isStudentEmail(u.email));

    useEffect(() => {
        if (!authLoading) {
            if (!user) {
                router.push('/login');
            } else if (!isAdmin) {
                router.push('/');
            } else {
                fetchStudents();
                fetchStaffAssignments();
                fetchTeamMembers();
            }
        }
    }, [authLoading, user, isAdmin, router]);

    const fetchTeamMembers = async () => {
        try {
            console.log("Fetching team memberships for:", { 
                faculty: TEAMS.FACULTY, 
                caretaker: TEAMS.CARETAKER 
            });

            const [fResults, cResults] = await Promise.allSettled([
                appwriteTeams.listMemberships({ teamId: TEAMS.FACULTY }),
                appwriteTeams.listMemberships({ teamId: TEAMS.CARETAKER })
            ]);

            if (fResults.status === 'fulfilled') {
                console.log("Faculty Members:", fResults.value);
                setFacultyMembers(fResults.value.memberships);
            } else {
                console.error("Faculty Team Fetch Error:", fResults.reason);
            }

            if (cResults.status === 'fulfilled') {
                console.log("Caretaker Members:", cResults.value);
                setCaretakerMembers(cResults.value.memberships);
            } else {
                console.error("Caretaker Team Fetch Error:", cResults.reason);
            }
        } catch (error) {
            console.error("Unexpected error in fetchTeamMembers:", error);
        }
    };

    const handleAddMember = async (teamId: string) => {
        if (!inviteEmail) return;
        setIsManagingTeam(true);
        setInviteError(null);
        try {
            // Appwrite Client SDK uses createMembership which sends an invitation
            await appwriteTeams.createMembership({
                teamId,
                roles: ['owner'], // default roles
                email: inviteEmail,
                url: `${window.location.origin}/accept-invite`, // url for verification/acceptance
                name: inviteName
            });
            
            setInviteEmail("");
            setInviteName("");
            fetchTeamMembers();
            alert("Invitation sent successfully! User must accept to appear in list.");
        } catch (error: any) {
            setInviteError(error.message);
        } finally {
            setIsManagingTeam(false);
        }
    };

    const handleRemoveMember = async (teamId: string, membershipId: string) => {
        if (!confirm("Are you sure you want to remove this member?")) return;
        setIsManagingTeam(true);
        try {
            await appwriteTeams.deleteMembership({ teamId, membershipId });
            fetchTeamMembers();
        } catch (error: any) {
            alert("Failed to remove member: " + error.message);
        } finally {
            setIsManagingTeam(false);
        }
    };



    const fetchStaffAssignments = async () => {
        try {
            const cResp = await databases.listDocuments({
                databaseId: DB_ID, 
                collectionId: COLLECTIONS.CARETAKER, 
                queries: [Query.limit(100)]
            });
            setCaretakerAssignments(cResp.documents);
            const fResp = await databases.listDocuments({
                databaseId: DB_ID, 
                collectionId: COLLECTIONS.FACULTY, 
                queries: [Query.limit(100)]
            });
            setFacultyAssignments(fResp.documents);
        } catch (error) {
            console.error("Failed to fetch staff assignments:", error);
        }
    };

    const handleUpdateStaff = async (collId: string, docId: string, email: string) => {
        setIsSavingStaff(docId);
        try {
            await databases.updateDocument({
                databaseId: DB_ID, 
                collectionId: collId, 
                documentId: docId, 
                data: { email }
            });
            // Refresh local state
            if (collId === COLLECTIONS.CARETAKER) {
                setCaretakerAssignments(prev => prev.map(d => d.$id === docId ? { ...d, email } : d));
            } else {
                setFacultyAssignments(prev => prev.map(d => d.$id === docId ? { ...d, email } : d));
            }
        } catch (error) {
            console.error("Update failed:", error);
            alert("Failed to update email. Ensure collection exists.");
        } finally {
            setIsSavingStaff(null);
        }
    };

    const fetchStudents = async () => {
        setIsLoading(true);
        try {
            const response = await databases.listDocuments({
                databaseId: DB_ID, 
                collectionId: COLLECTIONS.STUDENTS, 
                queries: [
                    Query.limit(100),
                    Query.orderDesc("$createdAt")
                ]
            });
            setStudents(response.documents as unknown as Student[]);
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
            try {
                await databases.deleteDocument({
                    databaseId: DB_ID, 
                    collectionId: COLLECTIONS.FACIAL_EMBEDDINGS, 
                    documentId: studentId
                });
            } catch (dbErr: any) {
                if (dbErr.code !== 404) {
                    throw new Error("Failed to delete facial data from biometric database");
                }
            }

            // Update Appwrite student record
            await databases.updateDocument({
                databaseId: DB_ID, 
                collectionId: COLLECTIONS.STUDENTS, 
                documentId: studentId, 
                data: {
                    faceRegistered: false
                }
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
                <header className="mb-12 flex flex-col md:flex-row md:items-center justify-between gap-8">
                    <div className="flex items-center space-x-4">
                        <Link href="/" className="p-2 hover:bg-primary/5 rounded-full transition-all text-primary/40 hover:text-primary">
                            <ArrowLeft size={24} />
                        </Link>
                        <div className="text-center md:text-left">
                            <p className="text-secondary font-bold tracking-[0.2em] text-[10px] sm:text-xs uppercase mb-1">Administrative Access</p>
                            <h1 className="text-3xl font-bold text-primary tracking-tight uppercase flex items-center justify-center md:justify-start space-x-3">
                                <ShieldCheck className="text-secondary" />
                                <span>Admin Portal</span>
                            </h1>
                        </div>
                    </div>

                    <div className="flex flex-col sm:flex-row items-center gap-4 w-full md:w-auto">
                        {/* Tab Switcher */}
                        <div className="flex bg-primary/5 p-1 rounded-2xl border border-primary/5 w-full sm:w-auto">
                            <button 
                                onClick={() => setActiveTab('students')}
                                className={`flex-1 sm:flex-none px-6 py-2 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all ${activeTab === 'students' ? 'bg-primary text-background shadow-lg shadow-primary/20' : 'text-primary/60 hover:text-primary'}`}
                            >
                                Students
                            </button>
                            <button 
                                onClick={() => setActiveTab('assignments')}
                                className={`flex-1 sm:flex-none px-6 py-2 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all ${activeTab === 'assignments' ? 'bg-primary text-background shadow-lg shadow-primary/20' : 'text-primary/60 hover:text-primary'}`}
                            >
                                Assignments
                            </button>
                            <button 
                                onClick={() => setActiveTab('faculty')}
                                className={`flex-1 sm:flex-none px-6 py-2 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all ${activeTab === 'faculty' ? 'bg-primary text-background shadow-lg shadow-primary/20' : 'text-primary/60 hover:text-primary'}`}
                            >
                                Faculty Team
                            </button>
                            <button 
                                onClick={() => setActiveTab('caretakers')}
                                className={`flex-1 sm:flex-none px-6 py-2 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all ${activeTab === 'caretakers' ? 'bg-primary text-background shadow-lg shadow-primary/20' : 'text-primary/60 hover:text-primary'}`}
                            >
                                Caretaker Team
                            </button>
                        </div>

                        {activeTab === 'students' && (
                            <div className="relative group w-full sm:w-64">
                                <div className="absolute inset-y-0 left-4 flex items-center pointer-events-none text-primary/20 group-focus-within:text-secondary transition-colors">
                                    <Search size={18} />
                                </div>
                                <input 
                                    type="text"
                                    placeholder="SEARCH..."
                                    value={searchTerm}
                                    onChange={(e) => setSearchTerm(e.target.value)}
                                    className="w-full bg-surface border border-primary/10 rounded-2xl h-12 pl-12 pr-4 text-primary text-sm focus:outline-none focus:border-secondary/50 transition-all uppercase placeholder:text-primary/10"
                                />
                            </div>
                        )}
                    </div>
                </header>

                <AnimatePresence mode="wait">
                    {activeTab === 'students' ? (
                        <motion.div 
                            key="students-list"
                            initial={{ opacity: 0 }}
                            animate={{ opacity: 1 }}
                            exit={{ opacity: 0 }}
                            className="grid grid-cols-1 gap-4"
                        >
                            {/* ... existing students header ... */}
                            <div className="hidden md:flex items-center justify-between px-6 py-4 text-primary/20 text-[10px] font-bold uppercase tracking-widest border-b border-primary/5 mb-2">
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
                                        className="bg-surface border border-primary/5 p-5 sm:p-6 rounded-[2rem] flex flex-col md:flex-row items-center md:items-center justify-between group hover:bg-surface/50 transition-all gap-6"
                                    >
                                        <div className="flex flex-col md:flex-row items-center md:items-center space-x-0 md:space-x-4 w-full md:w-1/3 text-center md:text-left space-y-4 md:space-y-0">
                                            <div className="w-12 h-12 bg-primary/5 rounded-xl flex items-center justify-center text-primary/40 font-bold uppercase border border-primary/10 shrink-0">
                                                {student.name?.[0] || '?'}
                                            </div>
                                            <div>
                                                <h3 className="text-primary font-bold uppercase tracking-tight flex items-center justify-center md:justify-start space-x-2">
                                                    <span>{student.name || 'Unknown Student'}</span>
                                                    {student.gender && (
                                                        <span className="text-[8px] bg-primary/5 text-primary/40 px-1.5 py-0.5 rounded border border-primary/10 tracking-tighter">
                                                            {student.gender}
                                                        </span>
                                                    )}
                                                </h3>
                                                <div className="flex flex-wrap items-center justify-center md:justify-start gap-2 mt-1">
                                                    <p className="text-primary/30 text-[10px] font-bold uppercase tracking-wider">{student.$id}</p>
                                                    {student.course && (
                                                        <>
                                                            <span className="text-primary/10 text-[8px]">•</span>
                                                            <p className="text-secondary font-black text-[9px] tracking-widest">
                                                                {student.course === 'b.tech' ? 'B.Tech' : 
                                                                student.course === 'm.tech' ? 'M.Tech' : 
                                                                student.course === 'bsc' ? 'B.Sc' : 
                                                                student.course === 'msc' ? 'M.Sc' : 
                                                                student.course} {student.year}YR
                                                            </p>
                                                            <span className="text-primary/10 text-[8px]">•</span>
                                                            <p className="text-primary/40 font-bold text-[9px] uppercase tracking-widest">{student.department}</p>
                                                        </>
                                                    )}
                                                </div>
                                            </div>
                                        </div>

                                        <div className="w-full md:w-1/4 flex justify-center">
                                            {student.faceRegistered ? (
                                                <div className="flex items-center space-x-2 text-primary bg-primary/10 px-4 py-1.5 rounded-full border border-primary/20">
                                                    <UserCheck size={14} />
                                                    <span className="text-[10px] font-bold uppercase tracking-widest">Enrolled</span>
                                                </div>
                                            ) : (
                                                <div className="flex items-center space-x-2 text-primary/20 bg-primary/5 px-4 py-1.5 rounded-full border border-primary/10">
                                                    <UserX size={14} />
                                                    <span className="text-[10px] font-bold uppercase tracking-widest">Pending</span>
                                                </div>
                                            )}
                                        </div>

                                        <div className="w-full md:w-1/4 flex justify-center md:justify-end items-center space-x-3 opacity-100 md:opacity-40 md:group-hover:opacity-100 transition-opacity">
                                            {student.faceRegistered && (
                                                <button 
                                                    onClick={() => handleDeleteFace(student.$id)}
                                                    disabled={isDeleting === student.$id}
                                                    className="p-3 bg-secondary/10 text-secondary rounded-xl hover:bg-secondary/20 transition-all border border-secondary/10"
                                                    title="Delete Facial Data"
                                                >
                                                    {isDeleting === student.$id ? (
                                                        <RefreshCw size={18} className="animate-spin" />
                                                    ) : (
                                                        <Trash2 size={18} />
                                                    )}
                                                </button>
                                            )}
                                            <div className="p-2 text-primary/5 hidden md:block">
                                                <ScanFace size={20} />
                                            </div>
                                        </div>
                                    </motion.div>
                                ))}
                            </AnimatePresence>

                            {filteredStudents.length === 0 && (
                                <div className="py-20 text-center space-y-4">
                                    <div className="w-16 h-16 bg-primary/5 rounded-full flex items-center justify-center text-primary/10 mx-auto">
                                        <Users size={32} />
                                    </div>
                                    <p className="text-primary/20 text-xs font-bold uppercase tracking-[0.2em]">No students found</p>
                                </div>
                            )}
                        </motion.div>
                    ) : activeTab === 'assignments' ? (
                        <motion.div 
                            key="staff-assignments"
                            initial={{ opacity: 0 }}
                            animate={{ opacity: 1 }}
                            exit={{ opacity: 0 }}
                            className="space-y-12"
                        >
                            {/* Caretakers Section */}
                            <section className="space-y-6">
                                <div className="flex items-center space-x-3 px-2">
                                    <ShieldCheck size={20} className="text-secondary" />
                                    <h2 className="text-lg font-black text-primary uppercase tracking-tight">Hostel Caretakers</h2>
                                </div>
                                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                    {caretakerAssignments.map((assignment) => (
                                        <div key={assignment.$id} className="bg-surface border border-primary/5 p-6 rounded-[2rem] space-y-4">
                                            <div className="flex justify-between items-center">
                                                <p className="text-[10px] font-black text-secondary uppercase tracking-[0.2em]">{assignment.gender} • {assignment.YEAR} YEAR</p>
                                                <ShieldCheck size={14} className="text-primary/10" />
                                            </div>
                                            <div className="flex gap-2">
                                                <input 
                                                    type="email"
                                                    defaultValue={assignment.email}
                                                    id={`input-c-${assignment.$id}`}
                                                    onChange={(e) => {
                                                        const btn = document.getElementById(`btn-c-${assignment.$id}`);
                                                        if (btn) btn.style.display = e.target.value !== assignment.email ? 'block' : 'none';
                                                    }}
                                                    placeholder="Enter caretaker email"
                                                    className="flex-1 bg-primary/5 border border-primary/5 rounded-xl h-12 px-4 text-sm text-primary focus:outline-none focus:border-secondary/50 transition-all font-bold"
                                                />
                                                <button 
                                                    id={`btn-c-${assignment.$id}`}
                                                    style={{ display: 'none' }}
                                                    onClick={() => {
                                                        const input = document.getElementById(`input-c-${assignment.$id}`) as HTMLInputElement;
                                                        handleUpdateStaff(COLLECTIONS.CARETAKER, assignment.$id, input.value);
                                                        const btn = document.getElementById(`btn-c-${assignment.$id}`);
                                                        if (btn) btn.style.display = 'none';
                                                    }}
                                                    className="bg-secondary text-background px-4 rounded-xl text-[10px] font-black hover:opacity-90 transition-all"
                                                >
                                                    {isSavingStaff === assignment.$id ? <RefreshCw size={14} className="animate-spin" /> : "SAVE"}
                                                </button>
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            </section>

                            {/* Faculty Section */}
                            <section className="space-y-6">
                                <div className="flex items-center space-x-3 px-2">
                                    <UserCheck size={20} className="text-secondary" />
                                    <h2 className="text-lg font-black text-primary uppercase tracking-tight">Faculty Advisors</h2>
                                </div>
                                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                    {facultyAssignments.map((assignment) => (
                                        <div key={assignment.$id} className="bg-surface border border-primary/5 p-6 rounded-[2rem] space-y-4">
                                            <div className="flex justify-between items-center">
                                                <p className="text-[10px] font-black text-secondary uppercase tracking-[0.2em]">{assignment.department} • {assignment.year} YEAR</p>
                                                <UserCheck size={14} className="text-primary/10" />
                                            </div>
                                            <div className="flex gap-2">
                                                <input 
                                                    type="email"
                                                    defaultValue={assignment.email}
                                                    id={`input-f-${assignment.$id}`}
                                                    onChange={(e) => {
                                                        const btn = document.getElementById(`btn-f-${assignment.$id}`);
                                                        if (btn) btn.style.display = e.target.value !== assignment.email ? 'block' : 'none';
                                                    }}
                                                    placeholder="Enter faculty email"
                                                    className="flex-1 bg-primary/5 border border-primary/5 rounded-xl h-12 px-4 text-sm text-primary focus:outline-none focus:border-secondary/50 transition-all font-bold"
                                                />
                                                <button 
                                                    id={`btn-f-${assignment.$id}`}
                                                    style={{ display: 'none' }}
                                                    onClick={() => {
                                                        const input = document.getElementById(`input-f-${assignment.$id}`) as HTMLInputElement;
                                                        handleUpdateStaff(COLLECTIONS.FACULTY, assignment.$id, input.value);
                                                        const btn = document.getElementById(`btn-f-${assignment.$id}`);
                                                        if (btn) btn.style.display = 'none';
                                                    }}
                                                    className="bg-secondary text-background px-4 rounded-xl text-[10px] font-black hover:opacity-90 transition-all"
                                                >
                                                    {isSavingStaff === assignment.$id ? <RefreshCw size={14} className="animate-spin" /> : "SAVE"}
                                                </button>
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            </section>
                        </motion.div>
                    ) : (
                        <motion.div 
                            key="team-management"
                            initial={{ opacity: 0 }}
                            animate={{ opacity: 1 }}
                            exit={{ opacity: 0 }}
                            className="space-y-12"
                        >
                            <section className="max-w-2xl mx-auto bg-surface border border-primary/5 p-8 rounded-[3rem] space-y-8 shadow-xl shadow-primary/5">
                                <div className="text-center space-y-2">
                                    <h2 className="text-2xl font-black text-primary uppercase tracking-tight italic">
                                        Add to {activeTab === 'faculty' ? 'Faculty' : 'Caretaker'} Team
                                    </h2>
                                    <p className="text-primary/40 text-[10px] font-bold uppercase tracking-widest">
                                        Enter an email to invite a new staff member
                                    </p>
                                </div>

                                <div className="space-y-4">
                                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                                        <div className="space-y-2">
                                            <label className="text-[10px] font-black text-primary/40 uppercase tracking-widest ml-4">Staff Name</label>
                                            <input 
                                                type="text"
                                                placeholder="e.g. Dr. Rameez"
                                                value={inviteName}
                                                onChange={(e) => setInviteName(e.target.value)}
                                                className="w-full bg-primary/5 border border-primary/10 rounded-2xl h-14 px-6 text-sm font-bold text-primary focus:border-secondary transition-all"
                                            />
                                        </div>
                                        <div className="space-y-2 relative">
                                            <label className="text-[10px] font-black text-primary/40 uppercase tracking-widest ml-4">Staff Email</label>
                                            <input 
                                                type="email"
                                                placeholder="e.g. staff@nitpy.ac.in"
                                                value={inviteEmail}
                                                onChange={(e) => {
                                                    setInviteEmail(e.target.value);
                                                    setShowInviteSuggestions(true);
                                                }}
                                                onFocus={() => setShowInviteSuggestions(true)}
                                                onBlur={() => setTimeout(() => setShowInviteSuggestions(false), 200)}
                                                className="w-full bg-primary/5 border border-primary/10 rounded-2xl h-14 px-6 text-sm font-bold text-primary focus:border-secondary transition-all"
                                            />
                                            
                                            <AnimatePresence>
                                                {showInviteSuggestions && inviteEmail && (
                                                    <motion.div 
                                                        initial={{ opacity: 0, y: -10 }}
                                                        animate={{ opacity: 1, y: 0 }}
                                                        exit={{ opacity: 0, y: -10 }}
                                                        className="absolute z-50 w-full mt-2 bg-surface/90 backdrop-blur-2xl border border-primary/10 rounded-2xl overflow-hidden shadow-2xl max-h-48 overflow-y-auto"
                                                    >
                                                        {staffSuggestions
                                                            .filter(s => s.email.toLowerCase().includes(inviteEmail.toLowerCase()))
                                                            .map((s, idx) => (
                                                                <button 
                                                                    key={idx}
                                                                    onClick={() => {
                                                                        setInviteEmail(s.email);
                                                                        setInviteName(s.name);
                                                                        setShowInviteSuggestions(false);
                                                                    }}
                                                                    className="w-full px-6 py-4 flex items-center justify-between hover:bg-secondary/5 text-primary transition-all border-b border-primary/5 last:border-0"
                                                                >
                                                                    <span className="font-bold text-xs">{s.email}</span>
                                                                    <span className="text-[10px] opacity-40 font-bold uppercase">{s.name}</span>
                                                                </button>
                                                            ))
                                                        }
                                                    </motion.div>
                                                )}
                                            </AnimatePresence>
                                        </div>
                                    </div>

                                    {inviteError && (
                                        <p className="text-[10px] font-bold text-secondary uppercase tracking-widest text-center px-4">
                                            Error: {inviteError}
                                        </p>
                                    )}

                                    <button 
                                        disabled={isManagingTeam || !inviteEmail}
                                        onClick={() => handleAddMember(activeTab === 'faculty' ? TEAMS.FACULTY : TEAMS.CARETAKER)}
                                        className="w-full h-16 bg-primary text-background rounded-[2rem] text-xs font-black uppercase tracking-[0.2em] shadow-lg shadow-primary/20 hover:brightness-110 active:scale-[0.98] transition-all disabled:opacity-50 flex items-center justify-center gap-3"
                                    >
                                        {isManagingTeam ? <RefreshCw size={20} className="animate-spin" /> : <UserCheck size={20} />}
                                        <span>Invite to {activeTab === 'faculty' ? 'Faculty' : 'Caretaker'}</span>
                                    </button>
                                </div>
                            </section>

                            <section className="space-y-6">
                                <div className="flex items-center justify-between px-2">
                                    <div className="flex items-center space-x-3">
                                        <Users size={20} className="text-secondary" />
                                        <h2 className="text-lg font-black text-primary uppercase tracking-tight">
                                            Current {activeTab === 'faculty' ? 'Faculty' : 'Caretaker'} Members
                                        </h2>
                                    </div>
                                    <span className="text-[10px] font-black text-primary/20 uppercase tracking-widest">
                                        {(activeTab === 'faculty' ? facultyMembers : caretakerMembers).length} Total
                                    </span>
                                </div>

                                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                                    {(activeTab === 'faculty' ? facultyMembers : caretakerMembers).map((member) => (
                                        <div key={member.$id} className="bg-surface border border-primary/5 p-6 rounded-[2.5rem] flex flex-col justify-between group hover:bg-surface/50 transition-all gap-4">
                                            <div className="space-y-1">
                                                <h3 className="text-primary font-black uppercase tracking-tight truncate">
                                                    {member.userName || (member.userEmail && member.userEmail.split('@')[0]) || `Member ${member.$id.slice(-5)}`}
                                                </h3>
                                                <p className="text-primary/40 text-[10px] font-bold truncate">
                                                    {member.userEmail || '(Email Private/Hidden)'}
                                                </p>
                                                {/* Debug Info: Shows property keys if data is missing */}
                                                {!member.userEmail && (
                                                    <p className="text-[8px] text-primary/20 font-mono mt-1">
                                                        Keys: {Object.keys(member).join(', ')}
                                                    </p>
                                                )}
                                            </div>
                                            <div className="flex items-center justify-between">
                                                <div className="flex items-center gap-1">
                                                    {member.joined ? (
                                                        <span className="text-[8px] bg-green-500/10 text-green-600 px-2 py-1 rounded-full border border-green-500/10 font-black uppercase tracking-tighter">Active</span>
                                                    ) : (
                                                        <span className="text-[8px] bg-orange-500/10 text-orange-600 px-2 py-1 rounded-full border border-orange-500/10 font-black uppercase tracking-tighter">Invited</span>
                                                    )}
                                                </div>
                                                <button 
                                                    disabled={isManagingTeam}
                                                    onClick={() => handleRemoveMember(activeTab === 'faculty' ? TEAMS.FACULTY : TEAMS.CARETAKER, member.$id)}
                                                    className="p-3 text-primary/10 hover:text-secondary hover:bg-secondary/5 rounded-2xl transition-all"
                                                >
                                                    <Trash2 size={16} />
                                                </button>
                                            </div>
                                        </div>
                                    ))}
                                </div>

                                {(activeTab === 'faculty' ? facultyMembers : caretakerMembers).length === 0 && (
                                    <div className="py-20 text-center space-y-4 border border-dashed border-primary/5 rounded-[3rem]">
                                        <p className="text-primary/20 text-xs font-bold uppercase tracking-[0.2em]">No members in this team</p>
                                    </div>
                                )}
                            </section>
                        </motion.div>
                    )}
                </AnimatePresence>
            </main>
        </GradientBackground>
    );
}

