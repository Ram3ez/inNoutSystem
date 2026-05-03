'use client';

import React, { useEffect, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { ArrowLeft, ShieldCheck, Users, Search, Trash2, UserCheck, UserX, ScanFace, RefreshCw, ChevronDown, Edit2, Plus } from 'lucide-react';
import { useAuth } from '@/context/AuthContext';
import { databases, tablesDB, fetchAllRows, Query } from '@/lib/appwrite';
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
    const { user, isLoading: authLoading, isAdmin, isRegistrationRequired } = useAuth();
    const router = useRouter();
    
    const [activeTab, setActiveTab] = useState<'students' | 'assignments' | 'faculty' | 'caretakers' | 'outings' | 'leaves' | 'calendar'>('students');
    const [students, setStudents] = useState<Student[]>([]);
    const [isLoading, setIsLoading] = useState(true);
    const [searchTerm, setSearchTerm] = useState("");
    const [isDeleting, setIsDeleting] = useState<string | null>(null);

    // Outings Tab State
    const [outingsSubTab, setOutingsSubTab] = useState<'current' | 'archived'>('current');
    const [outingsPage, setOutingsPage] = useState(1);
    const [outingsRollQuery, setOutingsRollQuery] = useState('');
    const [outingsDateQuery, setOutingsDateQuery] = useState('');
    const [outingsDateType, setOutingsDateType] = useState<'out_time' | 'in_time'>('out_time');
    const [isOutingsDateTypeOpen, setIsOutingsDateTypeOpen] = useState(false);
    const [outings, setOutings] = useState<any[]>([]);
    const [isOutingsLoading, setIsOutingsLoading] = useState(false);

    // Leaves Tab State
    const [leavesSubTab, setLeavesSubTab] = useState<'current' | 'archived'>('current');
    const [leavesPage, setLeavesPage] = useState(1);
    const [leavesRollQuery, setLeavesRollQuery] = useState('');
    const [leavesDateQuery, setLeavesDateQuery] = useState('');
    const [leavesDateType, setLeavesDateType] = useState<'proposed_exit_date' | 'proposed_in_date'>('proposed_exit_date');
    const [isLeavesDateTypeOpen, setIsLeavesDateTypeOpen] = useState(false);
    const [leaves, setLeaves] = useState<any[]>([]);
    const [isLeavesLoading, setIsLeavesLoading] = useState(false);

    // Staff Assignment State
    const [caretakerAssignments, setCaretakerAssignments] = useState<any[]>([]);
    const [facultyAssignments, setFacultyAssignments] = useState<any[]>([]);
    const [isSavingStaff, setIsSavingStaff] = useState<string | null>(null);

    // Holidays Calendar State
    const [calendarDate, setCalendarDate] = useState(new Date());
    const [holidays, setHolidays] = useState<any[]>([]);
    const [isHolidaysLoading, setIsHolidaysLoading] = useState(false);
    const [isHolidayFormOpen, setIsHolidayFormOpen] = useState(false);
    const [selectedHolidayDate, setSelectedHolidayDate] = useState<string>('');
    const [holidayType, setHolidayType] = useState<'GAZETTED' | 'RESTRICTED'>('GAZETTED');
    const [holidayName, setHolidayName] = useState('');
    const [holidayDesc, setHolidayDesc] = useState('');

    // Team Management State
    const [facultyMembers, setFacultyMembers] = useState<Models.Membership[]>([]);
    const [caretakerMembers, setCaretakerMembers] = useState<Models.Membership[]>([]);
    const [openDropdownId, setOpenDropdownId] = useState<string | null>(null);
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
            } else if (!isAdmin || isRegistrationRequired) {
                router.push('/');
            } else {
                fetchStudents();
                fetchStaffAssignments();
                fetchTeamMembers();
                fetchHolidays();
            }
        }
    }, [authLoading, user, isAdmin, isRegistrationRequired, router]);

    const fetchHolidays = async () => {
        setIsHolidaysLoading(true);
        try {
            const rows = await fetchAllRows<any>(DB_ID, COLLECTIONS.HOLIDAYS);
            setHolidays(rows);
        } catch (err: any) {
            console.error("Failed to fetch holidays:", err);
        } finally {
            setIsHolidaysLoading(false);
        }
    };

    const handleSaveHoliday = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!holidayName.trim()) {
            alert("Holiday Name is required");
            return;
        }
        setIsHolidaysLoading(true);
        try {
            await tablesDB.updateRow({
                databaseId: DB_ID,
                tableId: COLLECTIONS.HOLIDAYS,
                rowId: selectedHolidayDate,
                data: {
                    date: selectedHolidayDate,
                    type: holidayType,
                    name: holidayName,
                    description: holidayDesc,
                },
            });
        } catch (err: any) {
            const is404 = err.code === 404 || err.status === 404 || (err.message && err.message.toLowerCase().includes("not found"));
            if (is404) {
                try {
                    await tablesDB.createRow({
                        databaseId: DB_ID,
                        tableId: COLLECTIONS.HOLIDAYS,
                        rowId: selectedHolidayDate,
                        data: {
                            date: selectedHolidayDate,
                            type: holidayType,
                            name: holidayName,
                            description: holidayDesc,
                        },
                    });
                } catch (createErr: any) {
                    alert(createErr.message || "Failed to create holiday");
                    setIsHolidaysLoading(false);
                    return;
                }
            } else {
                alert(err.message || "Failed to update holiday");
                setIsHolidaysLoading(false);
                return;
            }
        }
        setIsHolidayFormOpen(false);
        setIsHolidaysLoading(false);
        fetchHolidays();
    };

    const handleDeleteHoliday = async (dateStr: string) => {
        if (!confirm("Are you sure you want to delete this holiday?")) return;
        setIsHolidaysLoading(true);
        try {
            await tablesDB.deleteRow({
                databaseId: DB_ID,
                tableId: COLLECTIONS.HOLIDAYS,
                rowId: dateStr,
            });
            fetchHolidays();
        } catch (err: any) {
            alert(err.message || "Failed to delete holiday");
            setIsHolidaysLoading(false);
        }
    };

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
            // Using the modern Object-style parameter as recommended by the SDK
            await appwriteTeams.createMembership({
                teamId: teamId,
                roles: ['owner'], 
                email: inviteEmail,
                userId: undefined, // Let Appwrite generate or match
                name: inviteName,
                url: `${window.location.origin}/accept-invite`
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
            const cRows = await fetchAllRows(DB_ID, COLLECTIONS.CARETAKER);
            setCaretakerAssignments(cRows);

            const fRows = await fetchAllRows(DB_ID, COLLECTIONS.FACULTY);
            setFacultyAssignments(fRows);
        } catch (error) {
            console.error("Failed to fetch staff assignments:", error);
        }
    };

    const handleUpdateStaff = async (collId: string, docId: string, email: string) => {
        setIsSavingStaff(docId);
        try {
            /*
            await databases.updateDocument({
                databaseId: DB_ID, 
                collectionId: collId, 
                documentId: docId, 
                data: { email }
            });
            */
            await tablesDB.updateRow({
                databaseId: DB_ID, 
                tableId: collId, 
                rowId: docId, 
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

    // Optimized search for thousands of students
    useEffect(() => {
        if (!authLoading && isAdmin) {
            const delayDebounceFn = setTimeout(() => {
                fetchStudents(searchTerm);
            }, 300);
            return () => clearTimeout(delayDebounceFn);
        }
    }, [searchTerm, authLoading, isAdmin]);

    const fetchStudents = async (query: string = "") => {
        setIsLoading(true);
        try {
            const q = query.trim();
            if (!q) {
                const { rows } = await tablesDB.listRows({
                    databaseId: DB_ID,
                    tableId: COLLECTIONS.STUDENTS,
                    queries: [Query.orderDesc("$createdAt"), Query.limit(100)]
                });
                setStudents(rows as unknown as Student[]);
            } else {
                // Parallel search for maximum reliability on all attributes
                const [nameResults, idResults] = await Promise.all([
                    tablesDB.listRows({
                        databaseId: DB_ID,
                        tableId: COLLECTIONS.STUDENTS,
                        queries: [Query.startsWith("name", q), Query.limit(100)]
                    }),
                    tablesDB.listRows({
                        databaseId: DB_ID,
                        tableId: COLLECTIONS.STUDENTS,
                        queries: [Query.startsWith("$id", q.toUpperCase()), Query.limit(100)]
                    })
                ]);

                const merged = [...nameResults.rows, ...idResults.rows];
                const unique = Array.from(new Map(merged.map(s => [s.$id, s])).values());
                setStudents(unique as unknown as Student[]);
            }
        } catch (error) {
            console.error("Failed to fetch students:", error);
        } finally {
            setIsLoading(false);
        }
    };
    const fetchOutingsData = async () => {
        setIsOutingsLoading(true);
        try {
            const queries: string[] = [
                Query.orderDesc(outingsDateType),
                Query.limit(20),
                Query.offset((outingsPage - 1) * 20),
            ];

            if (outingsRollQuery.trim()) {
                queries.push(Query.startsWith('roll_no', outingsRollQuery.trim().toUpperCase()));
            }

            if (outingsDateQuery && outingsDateQuery.length === 10 && /^20\d{2}-\d{2}-\d{2}$/.test(outingsDateQuery)) {
                const localStart = new Date(`${outingsDateQuery}T00:00:00+05:30`);
                const localEnd = new Date(`${outingsDateQuery}T23:59:59.999+05:30`);

                const utcStart = localStart.toISOString();
                const utcEnd = localEnd.toISOString();

                const testFormats = [
                    { start: utcStart, end: utcEnd },
                    { start: utcStart.replace('.000Z', 'Z'), end: utcEnd.replace('.999Z', 'Z') },
                    { start: utcStart.replace('T', ' ').replace('.000Z', ''), end: utcEnd.replace('T', ' ').replace('.999Z', '') },
                    { start: utcStart.replace('.000Z', ''), end: utcEnd.replace('.999Z', '') },
                ];

                for (const format of testFormats) {
                    try {
                        const tempQueries = [
                            ...queries,
                            Query.greaterThanEqual(outingsDateType, format.start),
                            Query.lessThanEqual(outingsDateType, format.end),
                        ];
                        const tableId = outingsSubTab === 'current' ? COLLECTIONS.OUTING : COLLECTIONS.OUTING_ARCHIVE;
                        const response = await tablesDB.listRows({
                            databaseId: DB_ID,
                            tableId,
                            queries: tempQueries,
                        });
                        setOutings(response.rows);
                        return;
                    } catch (err) {
                        // try next
                    }
                }
            }

            const tableId = outingsSubTab === 'current' ? COLLECTIONS.OUTING : COLLECTIONS.OUTING_ARCHIVE;
            const response = await tablesDB.listRows({
                databaseId: DB_ID,
                tableId,
                queries,
            });

            setOutings(response.rows);
        } catch (err) {
            console.error('Failed to fetch outings:', err);
        } finally {
            setIsOutingsLoading(false);
        }
    };

    const fetchLeavesData = async () => {
        setIsLeavesLoading(true);
        try {
            const queries: string[] = [
                Query.orderDesc(leavesDateType),
                Query.limit(20),
                Query.offset((leavesPage - 1) * 20),
            ];

            if (leavesRollQuery.trim()) {
                queries.push(Query.startsWith('roll_no', leavesRollQuery.trim().toUpperCase()));
            }

            if (leavesDateQuery && leavesDateQuery.length === 10 && /^20\d{2}-\d{2}-\d{2}$/.test(leavesDateQuery)) {
                const localStart = new Date(`${leavesDateQuery}T00:00:00+05:30`);
                const localEnd = new Date(`${leavesDateQuery}T23:59:59.999+05:30`);

                const utcStart = localStart.toISOString();
                const utcEnd = localEnd.toISOString();

                const testFormats = [
                    { start: utcStart, end: utcEnd },
                    { start: utcStart.replace('.000Z', 'Z'), end: utcEnd.replace('.999Z', 'Z') },
                    { start: utcStart.replace('T', ' ').replace('.000Z', ''), end: utcEnd.replace('T', ' ').replace('.999Z', '') },
                    { start: utcStart.replace('.000Z', ''), end: utcEnd.replace('.999Z', '') },
                ];

                for (const format of testFormats) {
                    try {
                        const tempQueries = [
                            ...queries,
                            Query.greaterThanEqual(leavesDateType, format.start),
                            Query.lessThanEqual(leavesDateType, format.end),
                        ];
                        const tableId = leavesSubTab === 'current' ? COLLECTIONS.LEAVE : COLLECTIONS.LEAVE_ARCHIVE;
                        const response = await tablesDB.listRows({
                            databaseId: DB_ID,
                            tableId,
                            queries: tempQueries,
                        });
                        setLeaves(response.rows);
                        return;
                    } catch (err) {
                        // try next
                    }
                }
            }

            const tableId = leavesSubTab === 'current' ? COLLECTIONS.LEAVE : COLLECTIONS.LEAVE_ARCHIVE;
            const response = await tablesDB.listRows({
                databaseId: DB_ID,
                tableId,
                queries,
            });

            setLeaves(response.rows);
        } catch (err) {
            console.error('Failed to fetch leaves:', err);
        } finally {
            setIsLeavesLoading(false);
        }
    };

    useEffect(() => {
        if (activeTab === 'outings') {
            if (!outingsDateQuery || (outingsDateQuery.length === 10 && /^20\d{2}-\d{2}-\d{2}$/.test(outingsDateQuery))) {
                fetchOutingsData();
            }
        }
    }, [activeTab, outingsSubTab, outingsPage, outingsRollQuery, outingsDateQuery, outingsDateType]);

    useEffect(() => {
        if (activeTab === 'leaves') {
            if (!leavesDateQuery || (leavesDateQuery.length === 10 && /^20\d{2}-\d{2}-\d{2}$/.test(leavesDateQuery))) {
                fetchLeavesData();
            }
        }
    }, [activeTab, leavesSubTab, leavesPage, leavesRollQuery, leavesDateQuery, leavesDateType]);


    const handleDeleteFace = async (studentId: string, type: "face-api" | "ghostface") => {
        if (!confirm(`Are you sure you want to remove ${type === 'ghostface' ? 'GhostFaceNet' : 'Face-API'} data for ${studentId}?`)) {
            return;
        }

        setIsDeleting(studentId + type);
        try {
            const tableId = type === "ghostface" 
                ? COLLECTIONS.FACIAL_EMBEDDINGS_NEW 
                : COLLECTIONS.FACIAL_EMBEDDINGS;
            
            try {
                await tablesDB.deleteRow({
                    databaseId: DB_ID, 
                    tableId: tableId, 
                    rowId: studentId
                });
            } catch (dbErr: any) {
                if (dbErr.code !== 404) {
                    throw new Error(`Failed to delete ${type} data`);
                }
            }

            const updateData = type === "ghostface" 
                ? { ghostface_registered: false } 
                : { faceRegistered: false };

            await tablesDB.updateRow({
                databaseId: DB_ID, 
                tableId: COLLECTIONS.STUDENTS, 
                rowId: studentId, 
                data: updateData
            });

            setStudents(prev => prev.map(s => s.$id === studentId ? { ...s, ...updateData } : s));
        } catch (error: any) {
            alert(error.message || "An error occurred");
        } finally {
            setIsDeleting(null);
        }
    };

    const filteredStudents = students;

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
            <main className="flex-1 w-full px-4 sm:px-8 xl:px-12 pt-36 sm:pt-40 pb-12">
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

                    <div className="flex flex-wrap items-center gap-4 w-full justify-center md:justify-start">
                        {/* Tab Switcher - Now always wraps cleanly without any horizontal overflow */}
                        <div className="flex flex-wrap gap-1 bg-primary/5 p-1 rounded-2xl border border-primary/5 justify-center md:justify-start">
                            <button 
                                onClick={() => setActiveTab('students')}
                                className={`w-auto px-3 sm:px-4 py-2.5 rounded-xl text-[9px] sm:text-[10px] font-black uppercase tracking-widest transition-all ${activeTab === 'students' ? 'bg-primary text-background shadow-lg shadow-primary/20' : 'text-primary/60 hover:text-primary'}`}
                            >
                                Students
                            </button>
                            <button 
                                onClick={() => setActiveTab('assignments')}
                                className={`w-auto px-3 sm:px-4 py-2.5 rounded-xl text-[9px] sm:text-[10px] font-black uppercase tracking-widest transition-all ${activeTab === 'assignments' ? 'bg-primary text-background shadow-lg shadow-primary/20' : 'text-primary/60 hover:text-primary'}`}
                            >
                                Assignments
                            </button>
                            <button 
                                onClick={() => setActiveTab('faculty')}
                                className={`w-auto px-3 sm:px-4 py-2.5 rounded-xl text-[9px] sm:text-[10px] font-black uppercase tracking-widest transition-all ${activeTab === 'faculty' ? 'bg-primary text-background shadow-lg shadow-primary/20' : 'text-primary/60 hover:text-primary'}`}
                            >
                                Faculty Team
                            </button>
                            <button 
                                onClick={() => setActiveTab('caretakers')}
                                className={`w-auto px-3 sm:px-4 py-2.5 rounded-xl text-[9px] sm:text-[10px] font-black uppercase tracking-widest transition-all ${activeTab === 'caretakers' ? 'bg-primary text-background shadow-lg shadow-primary/20' : 'text-primary/60 hover:text-primary'}`}
                            >
                                Caretaker Team
                            </button>
                            <button 
                                onClick={() => setActiveTab('outings')}
                                className={`w-auto px-3 sm:px-4 py-2.5 rounded-xl text-[9px] sm:text-[10px] font-black uppercase tracking-widest transition-all ${activeTab === 'outings' ? 'bg-primary text-background shadow-lg shadow-primary/20' : 'text-primary/60 hover:text-primary'}`}
                            >
                                Outings
                            </button>
                            <button 
                                onClick={() => setActiveTab('leaves')}
                                className={`w-auto px-3 sm:px-4 py-2.5 rounded-xl text-[9px] sm:text-[10px] font-black uppercase tracking-widest transition-all ${activeTab === 'leaves' ? 'bg-primary text-background shadow-lg shadow-primary/20' : 'text-primary/60 hover:text-primary'}`}
                            >
                                Leaves
                            </button>
                            <button 
                                onClick={() => setActiveTab('calendar')}
                                className={`w-auto px-3 sm:px-4 py-2.5 rounded-xl text-[9px] sm:text-[10px] font-black uppercase tracking-widest transition-all ${activeTab === 'calendar' ? 'bg-primary text-background shadow-lg shadow-primary/20' : 'text-primary/60 hover:text-primary'}`}
                            >
                                Calendar
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

                                        <div className="w-full md:w-1/4 flex flex-col items-center space-y-2">
                                            {student.faceRegistered ? (
                                                <div className="flex items-center space-x-2 text-primary/60 bg-primary/5 px-3 py-1 rounded-full border border-primary/10">
                                                    <UserCheck size={10} />
                                                    <span className="text-[8px] font-bold uppercase tracking-widest text-primary/40">Face-API</span>
                                                    <button 
                                                        onClick={() => handleDeleteFace(student.$id, "face-api")}
                                                        disabled={isDeleting === (student.$id + "face-api")}
                                                        className="ml-2 text-secondary hover:scale-110 transition-transform"
                                                    >
                                                        <Trash2 size={12} />
                                                    </button>
                                                </div>
                                            ) : (
                                                <div className="flex items-center space-x-2 text-primary/20 bg-primary/5 px-3 py-1 rounded-full border border-primary/5">
                                                    <span className="text-[8px] font-bold uppercase tracking-widest opacity-30">Face-API Missing</span>
                                                </div>
                                            )}

                                            {student.ghostface_registered ? (
                                                <div className="flex items-center space-x-2 text-secondary bg-secondary/10 px-3 py-1 rounded-full border border-secondary/20">
                                                    <ScanFace size={10} />
                                                    <span className="text-[8px] font-bold uppercase tracking-widest">GhostFace</span>
                                                    <button 
                                                        onClick={() => handleDeleteFace(student.$id, "ghostface")}
                                                        disabled={isDeleting === (student.$id + "ghostface")}
                                                        className="ml-2 text-secondary hover:scale-110 transition-transform"
                                                    >
                                                        <Trash2 size={12} />
                                                    </button>
                                                </div>
                                            ) : (
                                                <div className="flex items-center space-x-2 text-primary/20 bg-primary/5 px-3 py-1 rounded-full border border-primary/5">
                                                    <span className="text-[8px] font-bold uppercase tracking-widest opacity-30">GhostFace Missing</span>
                                                </div>
                                            )}


                                        </div>

                                        <div className="w-full md:w-1/4 flex justify-center md:justify-end items-center space-x-3 opacity-100 md:opacity-40 md:group-hover:opacity-100 transition-opacity">
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
                                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                                    {caretakerAssignments.map((assignment) => {
                                        const emails = assignment.email ? assignment.email.split(',').map((e: string) => e.trim()).filter(Boolean) : [];
                                        return (
                                            <div key={assignment.$id} className="bg-surface border border-primary/5 p-6 rounded-[2.5rem] space-y-6 shadow-xl shadow-primary/5">
                                                <div className="flex justify-between items-center">
                                                    <div>
                                                        <p className="text-[10px] font-black text-secondary uppercase tracking-[0.2em] mb-1">{assignment.gender} • {assignment.year} YEAR</p>
                                                        <h3 className="text-xs font-bold text-primary/40 uppercase">Assigned Caretakers</h3>
                                                    </div>
                                                    <div className="w-10 h-10 bg-secondary/10 rounded-full flex items-center justify-center text-secondary border border-secondary/10">
                                                        <ShieldCheck size={18} />
                                                    </div>
                                                </div>

                                                <div className="flex flex-wrap gap-2">
                                                    {emails.map((email: string, idx: number) => (
                                                        <div key={idx} className="bg-primary/5 border border-primary/10 pl-3 pr-2 py-1.5 rounded-xl flex items-center gap-2 group transition-all hover:border-secondary/30">
                                                            <span className="text-[10px] font-bold text-primary/80">{email}</span>
                                                            <button 
                                                                onClick={() => {
                                                                    const newEmails = emails.filter((_: any, i: number) => i !== idx);
                                                                    handleUpdateStaff(COLLECTIONS.CARETAKER, assignment.$id, newEmails.join(', '));
                                                                }}
                                                                className="p-1 text-primary/20 hover:text-secondary hover:bg-secondary/10 rounded-lg transition-all"
                                                            >
                                                                <UserX size={12} />
                                                            </button>
                                                        </div>
                                                    ))}
                                                    {emails.length === 0 && (
                                                        <p className="text-[10px] text-primary/20 font-bold uppercase tracking-widest py-2 italic">No staff assigned</p>
                                                    )}
                                                </div>

                                                <div className="relative">
                                                    <button 
                                                        onClick={() => setOpenDropdownId(openDropdownId === assignment.$id ? null : assignment.$id)}
                                                        className="w-full bg-primary/5 border border-primary/10 rounded-2xl h-12 px-4 flex items-center justify-between group hover:border-secondary/30 transition-all"
                                                    >
                                                        <span className="text-[10px] font-black uppercase text-primary/60 group-hover:text-primary transition-colors">+ Assign Caretaker...</span>
                                                        <ChevronDown size={14} className={`text-primary/20 transition-transform duration-300 ${openDropdownId === assignment.$id ? 'rotate-180' : ''}`} />
                                                    </button>

                                                    <AnimatePresence>
                                                        {openDropdownId === assignment.$id && (
                                                            <>
                                                                <div 
                                                                    className="fixed inset-0 z-40" 
                                                                    onClick={() => setOpenDropdownId(null)}
                                                                />
                                                                <motion.div 
                                                                    initial={{ opacity: 0, y: 10, scale: 0.95 }}
                                                                    animate={{ opacity: 1, y: 0, scale: 1 }}
                                                                    exit={{ opacity: 0, y: 10, scale: 0.95 }}
                                                                    className="absolute z-50 left-0 right-0 mt-2 bg-surface/90 backdrop-blur-2xl border border-primary/10 rounded-2xl overflow-hidden shadow-2xl max-h-60 overflow-y-auto no-scrollbar"
                                                                >
                                                                    {caretakerMembers.length === 0 ? (
                                                                        <div className="px-6 py-4 text-[10px] font-bold text-primary/20 uppercase tracking-widest text-center italic">No caretakers in team</div>
                                                                    ) : caretakerMembers.map(m => (
                                                                        <button 
                                                                            key={m.$id}
                                                                            onClick={() => {
                                                                                if (!emails.includes(m.userEmail)) {
                                                                                    handleUpdateStaff(COLLECTIONS.CARETAKER, assignment.$id, [...emails, m.userEmail].join(', '));
                                                                                }
                                                                                setOpenDropdownId(null);
                                                                            }}
                                                                            className="w-full px-6 py-4 flex flex-col items-start hover:bg-secondary/10 transition-all border-b border-primary/5 last:border-0 text-left"
                                                                        >
                                                                            <span className="text-[10px] font-black text-primary uppercase tracking-tight">{m.userName || m.userEmail.split('@')[0]}</span>
                                                                            <span className="text-[9px] font-bold text-primary/40 uppercase tracking-widest">{m.userEmail}</span>
                                                                        </button>
                                                                    ))}
                                                                </motion.div>
                                                            </>
                                                        )}
                                                    </AnimatePresence>
                                                </div>
                                            </div>
                                        );
                                    })}
                                </div>
                            </section>

                            {/* Faculty Section */}
                            <section className="space-y-6">
                                <div className="flex items-center space-x-3 px-2">
                                    <UserCheck size={20} className="text-secondary" />
                                    <h2 className="text-lg font-black text-primary uppercase tracking-tight">Faculty Advisors</h2>
                                </div>
                                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                                    {facultyAssignments.map((assignment) => {
                                        const emails = assignment.email ? assignment.email.split(',').map((e: string) => e.trim()).filter(Boolean) : [];
                                        return (
                                            <div key={assignment.$id} className="bg-surface border border-primary/5 p-6 rounded-[2.5rem] space-y-6 shadow-xl shadow-primary/5">
                                                <div className="flex justify-between items-center">
                                                    <div>
                                                        <p className="text-[10px] font-black text-secondary uppercase tracking-[0.2em] mb-1">{assignment.department} • {assignment.year} YEAR</p>
                                                        <h3 className="text-xs font-bold text-primary/40 uppercase">Assigned Advisor</h3>
                                                    </div>
                                                    <div className="w-10 h-10 bg-secondary/10 rounded-full flex items-center justify-center text-secondary border border-secondary/10">
                                                        <UserCheck size={18} />
                                                    </div>
                                                </div>

                                                <div className="flex flex-wrap gap-2">
                                                    {emails.map((email: string, idx: number) => (
                                                        <div key={idx} className="bg-primary/5 border border-primary/10 pl-3 pr-2 py-1.5 rounded-xl flex items-center gap-2 group transition-all hover:border-secondary/30">
                                                            <span className="text-[10px] font-bold text-primary/80">{email}</span>
                                                            <button 
                                                                onClick={() => {
                                                                    handleUpdateStaff(COLLECTIONS.FACULTY, assignment.$id, "");
                                                                }}
                                                                className="p-1 text-primary/20 hover:text-secondary hover:bg-secondary/10 rounded-lg transition-all"
                                                            >
                                                                <UserX size={12} />
                                                            </button>
                                                        </div>
                                                    ))}
                                                    {emails.length === 0 && (
                                                        <p className="text-[10px] text-primary/20 font-bold uppercase tracking-widest py-2 italic">No advisor assigned</p>
                                                    )}
                                                </div>

                                                <div className="relative">
                                                    <button 
                                                        onClick={() => setOpenDropdownId(openDropdownId === assignment.$id ? null : assignment.$id)}
                                                        className="w-full bg-primary/5 border border-primary/10 rounded-2xl h-12 px-4 flex items-center justify-between group hover:border-secondary/30 transition-all"
                                                    >
                                                        <span className="text-[10px] font-black uppercase text-primary/60 group-hover:text-primary transition-colors">
                                                            {emails.length > 0 ? "Change Advisor..." : "+ Assign Advisor..."}
                                                        </span>
                                                        <ChevronDown size={14} className={`text-primary/20 transition-transform duration-300 ${openDropdownId === assignment.$id ? 'rotate-180' : ''}`} />
                                                    </button>

                                                    <AnimatePresence>
                                                        {openDropdownId === assignment.$id && (
                                                            <>
                                                                <div 
                                                                    className="fixed inset-0 z-40" 
                                                                    onClick={() => setOpenDropdownId(null)}
                                                                />
                                                                <motion.div 
                                                                    initial={{ opacity: 0, y: 10, scale: 0.95 }}
                                                                    animate={{ opacity: 1, y: 0, scale: 1 }}
                                                                    exit={{ opacity: 0, y: 10, scale: 0.95 }}
                                                                    className="absolute z-50 left-0 right-0 mt-2 bg-surface/90 backdrop-blur-2xl border border-primary/10 rounded-2xl overflow-hidden shadow-2xl max-h-60 overflow-y-auto no-scrollbar"
                                                                >
                                                                    {facultyMembers.length === 0 ? (
                                                                        <div className="px-6 py-4 text-[10px] font-bold text-primary/20 uppercase tracking-widest text-center italic">No faculty in team</div>
                                                                    ) : facultyMembers.map(m => (
                                                                        <button 
                                                                            key={m.$id}
                                                                            onClick={() => {
                                                                                handleUpdateStaff(COLLECTIONS.FACULTY, assignment.$id, m.userEmail);
                                                                                setOpenDropdownId(null);
                                                                            }}
                                                                            className="w-full px-6 py-4 flex flex-col items-start hover:bg-secondary/10 transition-all border-b border-primary/5 last:border-0 text-left"
                                                                        >
                                                                            <span className="text-[10px] font-black text-primary uppercase tracking-tight">{m.userName || m.userEmail.split('@')[0]}</span>
                                                                            <span className="text-[9px] font-bold text-primary/40 uppercase tracking-widest">{m.userEmail}</span>
                                                                        </button>
                                                                    ))}
                                                                </motion.div>
                                                            </>
                                                        )}
                                                    </AnimatePresence>
                                                </div>
                                            </div>
                                        );
                                    })}
                                </div>
                            </section>
                        </motion.div>
                    ) : activeTab === 'outings' ? (
                        <motion.div 
                            key="outings-list"
                            initial={{ opacity: 0 }}
                            animate={{ opacity: 1 }}
                            exit={{ opacity: 0 }}
                            className="space-y-6"
                        >
                            <div className="flex flex-col xl:flex-row xl:items-center justify-between gap-6 bg-surface border border-primary/5 p-6 rounded-[2.5rem] shadow-xl shadow-primary/5">
                                <div className="flex bg-primary/5 p-1 rounded-2xl border border-primary/5 w-full sm:w-auto self-start">
                                    <button 
                                        onClick={() => { setOutingsSubTab('current'); setOutingsPage(1); }}
                                        className={`flex-shrink-0 px-6 py-2.5 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all ${outingsSubTab === 'current' ? 'bg-primary text-background shadow-lg shadow-primary/20' : 'text-primary/60 hover:text-primary'}`}
                                    >
                                        Current Outings
                                    </button>
                                    <button 
                                        onClick={() => { setOutingsSubTab('archived'); setOutingsPage(1); }}
                                        className={`flex-shrink-0 px-6 py-2.5 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all ${outingsSubTab === 'archived' ? 'bg-primary text-background shadow-lg shadow-primary/20' : 'text-primary/60 hover:text-primary'}`}
                                    >
                                        Archived Outings
                                    </button>
                                </div>

                                <div className="flex flex-col sm:flex-row gap-4 w-full xl:w-auto">
                                    <div className="relative group w-full sm:w-56">
                                        <div className="absolute inset-y-0 left-4 flex items-center pointer-events-none text-primary/20 group-focus-within:text-secondary transition-colors">
                                            <Search size={16} />
                                        </div>
                                        <input 
                                            type="text"
                                            placeholder="ROLL NUMBER..."
                                            value={outingsRollQuery}
                                            onChange={(e) => { setOutingsRollQuery(e.target.value); setOutingsPage(1); }}
                                            className="w-full bg-surface border border-primary/10 rounded-2xl h-11 pl-11 pr-4 text-primary text-xs focus:outline-none focus:border-secondary/50 transition-all uppercase placeholder:text-primary/20"
                                        />
                                    </div>

                                    <div className="relative w-full sm:w-40 z-30">
                                        <button 
                                            onClick={() => setIsOutingsDateTypeOpen(!isOutingsDateTypeOpen)}
                                            className="w-full bg-surface border border-primary/10 rounded-2xl h-11 px-4 text-primary text-xs font-bold tracking-wider uppercase transition-all flex items-center justify-between hover:border-primary/30 select-none cursor-pointer"
                                        >
                                            <span className="truncate">{outingsDateType === 'out_time' ? 'Out Time' : 'In Time'}</span>
                                            <ChevronDown size={14} className={`text-primary/40 transition-transform duration-200 shrink-0 ${isOutingsDateTypeOpen ? 'rotate-180' : ''}`} />
                                        </button>
                                        <AnimatePresence>
                                            {isOutingsDateTypeOpen && (
                                                <>
                                                    <div className="fixed inset-0 z-10" onClick={() => setIsOutingsDateTypeOpen(false)} />
                                                    <motion.div 
                                                        initial={{ opacity: 0, y: -4 }}
                                                        animate={{ opacity: 1, y: 0 }}
                                                        exit={{ opacity: 0, y: -4 }}
                                                        className="absolute top-12 left-0 w-full bg-surface border border-primary/10 rounded-xl shadow-xl z-20 py-1 overflow-hidden"
                                                    >
                                                        <button 
                                                            onClick={() => { setOutingsDateType('out_time'); setIsOutingsDateTypeOpen(false); setOutingsPage(1); }}
                                                            className={`w-full text-left px-4 py-2.5 text-xs tracking-wider uppercase transition-all ${outingsDateType === 'out_time' ? 'bg-primary/10 text-primary font-bold' : 'text-primary/60 hover:bg-primary/5 hover:text-primary'}`}
                                                        >
                                                            Out Time
                                                        </button>
                                                        <button 
                                                            onClick={() => { setOutingsDateType('in_time'); setIsOutingsDateTypeOpen(false); setOutingsPage(1); }}
                                                            className={`w-full text-left px-4 py-2.5 text-xs tracking-wider uppercase transition-all ${outingsDateType === 'in_time' ? 'bg-primary/10 text-primary font-bold' : 'text-primary/60 hover:bg-primary/5 hover:text-primary'}`}
                                                        >
                                                            In Time
                                                        </button>
                                                    </motion.div>
                                                </>
                                            )}
                                        </AnimatePresence>
                                    </div>

                                    <div className="relative group w-full sm:w-48">
                                        <input 
                                            type="date"
                                            value={outingsDateQuery}
                                            onChange={(e) => { setOutingsDateQuery(e.target.value); setOutingsPage(1); }}
                                            className="w-full bg-surface border border-primary/10 rounded-2xl h-11 px-4 text-primary text-xs focus:outline-none focus:border-secondary/50 transition-all uppercase placeholder:text-primary/20"
                                        />
                                    </div>

                                    {(outingsRollQuery || outingsDateQuery) && (
                                        <button 
                                            onClick={() => { setOutingsRollQuery(''); setOutingsDateQuery(''); setOutingsDateType('out_time'); setOutingsPage(1); }}
                                            className="flex-shrink-0 px-4 h-11 bg-red-500/10 text-red-400 border border-red-500/20 rounded-2xl text-[10px] font-black uppercase tracking-widest transition-all hover:bg-red-500/20"
                                        >
                                            Clear
                                        </button>
                                    )}
                                </div>
                            </div>

                            {isOutingsLoading ? (
                                <div className="py-20 flex items-center justify-center">
                                    <LoadingIndicator />
                                </div>
                            ) : (
                                <div className="space-y-4">
                                    {outings.map((outing) => (
                                        <motion.div 
                                            key={outing.$id}
                                            initial={{ opacity: 0, y: 10 }}
                                            animate={{ opacity: 1, y: 0 }}
                                            className="bg-surface border border-primary/5 p-5 sm:p-6 rounded-[2rem] hover:bg-surface/50 transition-all flex flex-col md:flex-row items-center justify-between gap-4"
                                        >
                                            <div className="flex flex-col md:flex-row items-center gap-4 text-center md:text-left">
                                                <div className="w-12 h-12 bg-primary/5 rounded-xl flex items-center justify-center text-primary font-bold uppercase border border-primary/10 shrink-0">
                                                    {outing.roll_no?.[0] || 'O'}
                                                </div>
                                                <div>
                                                    <h3 className="text-primary font-bold uppercase tracking-tight text-base sm:text-lg">
                                                        {outing.roll_no}
                                                    </h3>
                                                    <p className="text-primary/40 text-[10px] font-bold tracking-widest uppercase">
                                                        Out Time: {outing.out_time ? new Date(outing.out_time).toLocaleString("en-IN", { timeZone: "Asia/Kolkata" }) : "N/A"}
                                                    </p>
                                                    {outing.in_time && (
                                                        <p className="text-secondary/70 text-[10px] font-black tracking-widest uppercase mt-0.5">
                                                            In Time: {new Date(outing.in_time).toLocaleString("en-IN", { timeZone: "Asia/Kolkata" })}
                                                        </p>
                                                    )}
                                                </div>
                                            </div>
                                            <div>
                                                {outing.in_time ? (
                                                    <span className="text-[9px] bg-primary/5 text-primary/40 px-3 py-1 rounded-full border border-primary/10 font-black tracking-widest uppercase">Returned</span>
                                                ) : (
                                                    <span className="text-[9px] bg-secondary/10 text-secondary px-3 py-1 rounded-full border border-secondary/20 font-black tracking-widest uppercase animate-pulse">Active Out</span>
                                                )}
                                            </div>
                                        </motion.div>
                                    ))}

                                    {outings.length === 0 && (
                                        <div className="py-16 text-center border border-dashed border-primary/5 rounded-[2.5rem]">
                                            <p className="text-primary/20 text-xs font-bold uppercase tracking-[0.2em]">No outings found</p>
                                        </div>
                                    )}

                                    {/* Pagination Controls */}
                                    <div className="flex items-center justify-between pt-4">
                                        <button 
                                            disabled={outingsPage === 1}
                                            onClick={() => setOutingsPage(prev => Math.max(1, prev - 1))}
                                            className="px-5 py-2.5 bg-surface border border-primary/5 hover:border-primary/20 text-primary/60 hover:text-primary rounded-xl font-bold text-xs uppercase tracking-wider transition-all disabled:opacity-30 disabled:pointer-events-none"
                                        >
                                            Previous
                                        </button>
                                        <span className="text-xs font-bold text-primary/40 uppercase tracking-widest">
                                            Page {outingsPage}
                                        </span>
                                        <button 
                                            disabled={outings.length < 20}
                                            onClick={() => setOutingsPage(prev => prev + 1)}
                                            className="px-5 py-2.5 bg-surface border border-primary/5 hover:border-primary/20 text-primary/60 hover:text-primary rounded-xl font-bold text-xs uppercase tracking-wider transition-all disabled:opacity-30 disabled:pointer-events-none"
                                        >
                                            Next
                                        </button>
                                    </div>
                                </div>
                            )}
                        </motion.div>
                    ) : activeTab === 'leaves' ? (
                        <motion.div 
                            key="leaves-list"
                            initial={{ opacity: 0 }}
                            animate={{ opacity: 1 }}
                            exit={{ opacity: 0 }}
                            className="space-y-6"
                        >
                            <div className="flex flex-col xl:flex-row xl:items-center justify-between gap-6 bg-surface border border-primary/5 p-6 rounded-[2.5rem] shadow-xl shadow-primary/5">
                                <div className="flex bg-primary/5 p-1 rounded-2xl border border-primary/5 w-full sm:w-auto self-start">
                                    <button 
                                        onClick={() => { setLeavesSubTab('current'); setLeavesPage(1); }}
                                        className={`flex-shrink-0 px-6 py-2.5 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all ${leavesSubTab === 'current' ? 'bg-primary text-background shadow-lg shadow-primary/20' : 'text-primary/60 hover:text-primary'}`}
                                    >
                                        Current Leaves
                                    </button>
                                    <button 
                                        onClick={() => { setLeavesSubTab('archived'); setLeavesPage(1); }}
                                        className={`flex-shrink-0 px-6 py-2.5 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all ${leavesSubTab === 'archived' ? 'bg-primary text-background shadow-lg shadow-primary/20' : 'text-primary/60 hover:text-primary'}`}
                                    >
                                        Archived Leaves
                                    </button>
                                </div>

                                <div className="flex flex-col sm:flex-row gap-4 w-full xl:w-auto">
                                    <div className="relative group w-full sm:w-56">
                                        <div className="absolute inset-y-0 left-4 flex items-center pointer-events-none text-primary/20 group-focus-within:text-secondary transition-colors">
                                            <Search size={16} />
                                        </div>
                                        <input 
                                            type="text"
                                            placeholder="ROLL NUMBER..."
                                            value={leavesRollQuery}
                                            onChange={(e) => { setLeavesRollQuery(e.target.value); setLeavesPage(1); }}
                                            className="w-full bg-surface border border-primary/10 rounded-2xl h-11 pl-11 pr-4 text-primary text-xs focus:outline-none focus:border-secondary/50 transition-all uppercase placeholder:text-primary/20"
                                        />
                                    </div>

                                    <div className="relative w-full sm:w-40 z-30">
                                        <button 
                                            onClick={() => setIsLeavesDateTypeOpen(!isLeavesDateTypeOpen)}
                                            className="w-full bg-surface border border-primary/10 rounded-2xl h-11 px-4 text-primary text-xs font-bold tracking-wider uppercase transition-all flex items-center justify-between hover:border-primary/30 select-none cursor-pointer"
                                        >
                                            <span className="truncate">{leavesDateType === 'proposed_exit_date' ? 'Departure' : 'Return'}</span>
                                            <ChevronDown size={14} className={`text-primary/40 transition-transform duration-200 shrink-0 ${isLeavesDateTypeOpen ? 'rotate-180' : ''}`} />
                                        </button>
                                        <AnimatePresence>
                                            {isLeavesDateTypeOpen && (
                                                <>
                                                    <div className="fixed inset-0 z-10" onClick={() => setIsLeavesDateTypeOpen(false)} />
                                                    <motion.div 
                                                        initial={{ opacity: 0, y: -4 }}
                                                        animate={{ opacity: 1, y: 0 }}
                                                        exit={{ opacity: 0, y: -4 }}
                                                        className="absolute top-12 left-0 w-full bg-surface border border-primary/10 rounded-xl shadow-xl z-20 py-1 overflow-hidden"
                                                    >
                                                        <button 
                                                            onClick={() => { setLeavesDateType('proposed_exit_date'); setIsLeavesDateTypeOpen(false); setLeavesPage(1); }}
                                                            className={`w-full text-left px-4 py-2.5 text-xs tracking-wider uppercase transition-all ${leavesDateType === 'proposed_exit_date' ? 'bg-primary/10 text-primary font-bold' : 'text-primary/60 hover:bg-primary/5 hover:text-primary'}`}
                                                        >
                                                            Departure
                                                        </button>
                                                        <button 
                                                            onClick={() => { setLeavesDateType('proposed_in_date'); setIsLeavesDateTypeOpen(false); setLeavesPage(1); }}
                                                            className={`w-full text-left px-4 py-2.5 text-xs tracking-wider uppercase transition-all ${leavesDateType === 'proposed_in_date' ? 'bg-primary/10 text-primary font-bold' : 'text-primary/60 hover:bg-primary/5 hover:text-primary'}`}
                                                        >
                                                            Return
                                                        </button>
                                                    </motion.div>
                                                </>
                                            )}
                                        </AnimatePresence>
                                    </div>

                                    <div className="relative group w-full sm:w-48">
                                        <input 
                                            type="date"
                                            value={leavesDateQuery}
                                            onChange={(e) => { setLeavesDateQuery(e.target.value); setLeavesPage(1); }}
                                            className="w-full bg-surface border border-primary/10 rounded-2xl h-11 px-4 text-primary text-xs focus:outline-none focus:border-secondary/50 transition-all uppercase placeholder:text-primary/20"
                                        />
                                    </div>

                                    {(leavesRollQuery || leavesDateQuery) && (
                                        <button 
                                            onClick={() => { setLeavesRollQuery(''); setLeavesDateQuery(''); setLeavesDateType('proposed_exit_date'); setLeavesPage(1); }}
                                            className="flex-shrink-0 px-4 h-11 bg-red-500/10 text-red-400 border border-red-500/20 rounded-2xl text-[10px] font-black uppercase tracking-widest transition-all hover:bg-red-500/20"
                                        >
                                            Clear
                                        </button>
                                    )}
                                </div>
                            </div>

                            {isLeavesLoading ? (
                                <div className="py-20 flex items-center justify-center">
                                    <LoadingIndicator />
                                </div>
                            ) : (
                                <div className="space-y-4">
                                    {leaves.map((leave) => (
                                        <motion.div 
                                            key={leave.$id}
                                            initial={{ opacity: 0, y: 10 }}
                                            animate={{ opacity: 1, y: 0 }}
                                            className="bg-surface border border-primary/5 p-5 sm:p-6 rounded-[2rem] hover:bg-surface/50 transition-all flex flex-col md:flex-row items-center justify-between gap-4"
                                        >
                                            <div className="flex flex-col md:flex-row items-center gap-4 text-center md:text-left w-full">
                                                <div className="w-12 h-12 bg-primary/5 rounded-xl flex items-center justify-center text-primary font-bold uppercase border border-primary/10 shrink-0">
                                                    {leave.roll_no?.[0] || 'L'}
                                                </div>
                                                <div className="flex-1 min-w-0">
                                                    <div className="flex flex-wrap items-center justify-center md:justify-start gap-3">
                                                        <h3 className="text-primary font-bold uppercase tracking-tight text-base sm:text-lg">
                                                            {leave.roll_no}
                                                        </h3>
                                                        <span className={`text-[8px] sm:text-[9px] px-2.5 py-0.5 rounded-full border font-black uppercase tracking-wider ${leave.status === 'approved' ? 'bg-green-500/10 text-green-600 border-green-500/10' : 'bg-orange-500/10 text-orange-600 border-orange-500/10'}`}>
                                                            {leave.status}
                                                        </span>
                                                        {leave.exit_date_time && !leave.in_date_time && (
                                                            <span className="text-[8px] sm:text-[9px] px-2.5 py-0.5 rounded-full border font-black uppercase tracking-wider bg-secondary/10 text-secondary border-secondary/10">
                                                                Currently Out
                                                            </span>
                                                        )}
                                                        {leave.exit_date_time && leave.in_date_time && (
                                                            <span className="text-[8px] sm:text-[9px] px-2.5 py-0.5 rounded-full border font-black uppercase tracking-wider bg-primary/10 text-primary border-primary/10">
                                                                Completed
                                                            </span>
                                                        )}
                                                    </div>
                                                    <p className="text-primary/70 text-xs font-bold leading-relaxed mt-1 italic line-clamp-2">
                                                        "{leave.reason}"
                                                    </p>
                                                    <div className="flex flex-wrap items-center justify-center md:justify-start gap-4 mt-2">
                                                        <p className="text-primary/40 text-[10px] font-bold tracking-widest uppercase">
                                                            Departure: {leave.proposed_exit_date ? new Date(leave.proposed_exit_date).toLocaleString("en-IN", { timeZone: "Asia/Kolkata" }) : "N/A"}
                                                        </p>
                                                        <p className="text-primary/40 text-[10px] font-bold tracking-widest uppercase">
                                                            Return: {leave.proposed_in_date ? new Date(leave.proposed_in_date).toLocaleString("en-IN", { timeZone: "Asia/Kolkata" }) : "N/A"}
                                                        </p>
                                                    </div>
                                                </div>
                                            </div>
                                        </motion.div>
                                    ))}

                                    {leaves.length === 0 && (
                                        <div className="py-16 text-center border border-dashed border-primary/5 rounded-[2.5rem]">
                                            <p className="text-primary/20 text-xs font-bold uppercase tracking-[0.2em]">No leaves found</p>
                                        </div>
                                    )}

                                    {/* Pagination Controls */}
                                    <div className="flex items-center justify-between pt-4">
                                        <button 
                                            disabled={leavesPage === 1}
                                            onClick={() => setLeavesPage(prev => Math.max(1, prev - 1))}
                                            className="px-5 py-2.5 bg-surface border border-primary/5 hover:border-primary/20 text-primary/60 hover:text-primary rounded-xl font-bold text-xs uppercase tracking-wider transition-all disabled:opacity-30 disabled:pointer-events-none"
                                        >
                                            Previous
                                        </button>
                                        <span className="text-xs font-bold text-primary/40 uppercase tracking-widest">
                                            Page {leavesPage}
                                        </span>
                                        <button 
                                            disabled={leaves.length < 20}
                                            onClick={() => setLeavesPage(prev => prev + 1)}
                                            className="px-5 py-2.5 bg-surface border border-primary/5 hover:border-primary/20 text-primary/60 hover:text-primary rounded-xl font-bold text-xs uppercase tracking-wider transition-all disabled:opacity-30 disabled:pointer-events-none"
                                        >
                                            Next
                                        </button>
                                    </div>
                                </div>
                            )}
                        </motion.div>
                    ) : activeTab === 'calendar' ? (
                        <motion.div 
                            key="calendar-tab"
                            initial={{ opacity: 0 }}
                            animate={{ opacity: 1 }}
                            exit={{ opacity: 0 }}
                            className="space-y-6"
                        >
                            <div className="flex flex-col xl:flex-row xl:items-center justify-between gap-6 bg-surface border border-primary/5 p-6 rounded-[2.5rem] shadow-xl shadow-primary/5">
                                <div className="flex bg-primary/5 p-1 rounded-2xl border border-primary/5 w-full sm:w-auto self-start justify-between items-center gap-1">
                                    <button 
                                        onClick={() => setCalendarDate(new Date(calendarDate.getFullYear(), calendarDate.getMonth() - 1, 1))}
                                        className="flex-shrink-0 px-2 sm:px-4 py-2 sm:py-2.5 rounded-xl text-[8px] sm:text-[10px] font-black uppercase tracking-widest text-primary/60 hover:text-primary transition-all"
                                    >
                                        Prev Month
                                    </button>
                                    <span className="px-2 sm:px-4 py-2 sm:py-2.5 text-[10px] sm:text-xs font-black uppercase tracking-widest text-primary min-w-[80px] sm:min-w-[120px] text-center flex items-center justify-center select-none">
                                        {calendarDate.toLocaleString('default', { month: 'short', year: 'numeric' })}
                                    </span>
                                    <button 
                                        onClick={() => setCalendarDate(new Date(calendarDate.getFullYear(), calendarDate.getMonth() + 1, 1))}
                                        className="flex-shrink-0 px-2 sm:px-4 py-2 sm:py-2.5 rounded-xl text-[8px] sm:text-[10px] font-black uppercase tracking-widest text-primary/60 hover:text-primary transition-all"
                                    >
                                        Next Month
                                    </button>
                                </div>

                                <button 
                                    onClick={fetchHolidays}
                                    className="px-6 py-3.5 bg-primary/5 border border-primary/5 hover:border-primary/20 text-primary hover:text-secondary rounded-2xl font-black text-[10px] uppercase tracking-[0.2em] transition-all flex items-center justify-center gap-2"
                                >
                                    <RefreshCw className={`h-4 w-4 ${isHolidaysLoading ? 'animate-spin' : ''}`} />
                                    <span>Sync</span>
                                </button>
                            </div>

                            <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
                                <div className="lg:col-span-2 bg-surface border border-primary/5 rounded-[2.5rem] p-6 shadow-xl shadow-primary/5">
                                    <div className="grid grid-cols-7 gap-2 text-center text-[10px] font-black tracking-wider text-primary/40 uppercase border-b border-primary/5 pb-2 mb-4">
                                        <span>Sun</span>
                                        <span>Mon</span>
                                        <span>Tue</span>
                                        <span>Wed</span>
                                        <span>Thu</span>
                                        <span>Fri</span>
                                        <span>Sat</span>
                                    </div>

                                    <div className="grid grid-cols-7 gap-2">
                                        {(() => {
                                            const daysInMonth = new Date(calendarDate.getFullYear(), calendarDate.getMonth() + 1, 0).getDate();
                                            const firstDayOfMonth = new Date(calendarDate.getFullYear(), calendarDate.getMonth(), 1).getDay();
                                            const days: (Date | null)[] = [];
                                            for (let i = 0; i < firstDayOfMonth; i++) {
                                                days.push(null);
                                            }
                                            for (let d = 1; d <= daysInMonth; d++) {
                                                days.push(new Date(calendarDate.getFullYear(), calendarDate.getMonth(), d));
                                            }

                                            return days.map((day, idx) => {
                                                if (!day) return <div key={`empty-${idx}`} className="aspect-square sm:aspect-auto sm:min-h-[110px] w-full bg-transparent rounded-2xl select-none" />;

                                                const y = day.getFullYear();
                                                const m = String(day.getMonth() + 1).padStart(2, '0');
                                                const d = String(day.getDate()).padStart(2, '0');
                                                const dStr = `${y}-${m}-${d}`;
                                                const hol = holidays.find(h => h.date === dStr);
                                                const isToday = day.toDateString() === new Date().toDateString();

                                                return (
                                                    <div 
                                                        key={day.toISOString()}
                                                        onClick={() => {
                                                            setSelectedHolidayDate(dStr);
                                                            if (hol) {
                                                                setHolidayType(hol.type);
                                                                setHolidayName(hol.name);
                                                                setHolidayDesc(hol.description || '');
                                                            } else {
                                                                setHolidayType('GAZETTED');
                                                                setHolidayName('');
                                                                setHolidayDesc('');
                                                            }
                                                            setIsHolidayFormOpen(true);
                                                        }}
                                                        className={`aspect-square sm:aspect-auto sm:min-h-[110px] w-full border border-primary/5 hover:border-primary/20 rounded-2xl flex flex-col justify-between p-1 sm:p-3 cursor-pointer transition-all relative select-none ${isToday ? 'bg-secondary/10 border-secondary/40' : 'bg-primary/5'}`}
                                                    >
                                                        <span className={`text-xs font-black self-end ${isToday ? 'text-secondary font-black' : 'text-primary/60'}`}>
                                                            {day.getDate()}
                                                        </span>

                                                        {hol && (
                                                            <div 
                                                                className={`text-[7px] sm:text-[9px] font-black leading-none p-1 sm:p-1.5 rounded-lg sm:rounded-xl mt-auto w-full text-center tracking-wide line-clamp-2 ${hol.type === 'GAZETTED' ? 'bg-secondary/20 text-secondary border border-secondary/20' : 'bg-orange-500/20 text-orange-400 border border-orange-500/20'}`}
                                                                title={`${hol.name}: ${hol.description || 'No Description'}`}
                                                            >
                                                                {hol.name}
                                                            </div>
                                                        )}
                                                    </div>
                                                );
                                            });
                                        })()}
                                    </div>
                                </div>

                                <div className="bg-surface border border-primary/5 rounded-[2.5rem] p-6 shadow-xl shadow-primary/5 flex flex-col justify-between">
                                    <div className="space-y-6">
                                        <div className="space-y-1">
                                            <h3 className="text-sm font-black tracking-tight text-primary uppercase italic">Legend & Selected Month</h3>
                                            <p className="text-primary/40 text-[10px] font-bold uppercase tracking-wider">Configure specific holidays directly</p>
                                        </div>

                                        <div className="flex flex-col gap-3">
                                            <div className="flex items-center gap-3 bg-primary/5 p-3 rounded-2xl border border-primary/5">
                                                <div className="h-3 w-3 rounded-full bg-secondary" />
                                                <div>
                                                    <h4 className="text-[10px] font-black uppercase text-primary">GAZETTED</h4>
                                                    <p className="text-[9px] text-primary/40">Mandatory institutional leaves</p>
                                                </div>
                                            </div>

                                            <div className="flex items-center gap-3 bg-primary/5 p-3 rounded-2xl border border-primary/5">
                                                <div className="h-3 w-3 rounded-full bg-orange-500" />
                                                <div>
                                                    <h4 className="text-[10px] font-black uppercase text-primary">RESTRICTED</h4>
                                                    <p className="text-[9px] text-primary/40">Special optional leaves</p>
                                                </div>
                                            </div>
                                        </div>

                                        <div className="space-y-3 max-h-[300px] overflow-y-auto pr-1">
                                            <h4 className="text-[10px] font-black tracking-widest text-primary/30 uppercase">Month Overview</h4>
                                            {holidays.filter(h => {
                                                const d = new Date(h.date);
                                                return d.getFullYear() === calendarDate.getFullYear() && d.getMonth() === calendarDate.getMonth();
                                            }).map(h => (
                                                <div 
                                                    key={h.$id}
                                                    className="flex items-center justify-between bg-primary/5 border border-primary/5 hover:border-primary/10 rounded-2xl p-3.5 transition-all"
                                                >
                                                    <div className="flex flex-col max-w-[70%]">
                                                        <span className="text-[9px] font-black text-secondary tracking-widest">{h.date}</span>
                                                        <span className="text-xs font-black text-primary truncate">{h.name}</span>
                                                        {h.description && <span className="text-[9px] text-primary/40 truncate mt-0.5">{h.description}</span>}
                                                    </div>

                                                    <div className="flex items-center gap-1">
                                                        <button 
                                                            onClick={() => {
                                                                setSelectedHolidayDate(h.date);
                                                                setHolidayType(h.type);
                                                                setHolidayName(h.name);
                                                                setHolidayDesc(h.description || '');
                                                                setIsHolidayFormOpen(true);
                                                            }}
                                                            className="p-2 text-primary/30 hover:text-primary hover:bg-primary/5 rounded-xl transition-all"
                                                        >
                                                            <Edit2 size={14} />
                                                        </button>
                                                        <button 
                                                            onClick={() => handleDeleteHoliday(h.date)}
                                                            className="p-2 text-primary/30 hover:text-secondary hover:bg-secondary/5 rounded-xl transition-all"
                                                        >
                                                            <Trash2 size={14} />
                                                        </button>
                                                    </div>
                                                </div>
                                            ))}
                                            {holidays.filter(h => {
                                                const d = new Date(h.date);
                                                return d.getFullYear() === calendarDate.getFullYear() && d.getMonth() === calendarDate.getMonth();
                                            }).length === 0 && (
                                                <p className="text-[10px] font-bold text-primary/20 py-2 text-center uppercase tracking-widest">No holidays listed</p>
                                            )}
                                        </div>
                                    </div>
                                </div>
                            </div>

                            {/* Popup Slider modal directly above the main panel */}
                            <AnimatePresence>
                                {isHolidayFormOpen && (
                                    <div className="fixed inset-0 z-50 flex items-center justify-end bg-black/60 backdrop-blur-sm select-none">
                                        <motion.div 
                                            initial={{ x: '100%' }}
                                            animate={{ x: 0 }}
                                            exit={{ x: '100%' }}
                                            transition={{ type: 'spring', damping: 24, stiffness: 200 }}
                                            className="w-full max-w-md h-full bg-surface border-l border-primary/10 p-8 flex flex-col justify-between shadow-2xl relative"
                                        >
                                            <div>
                                                <div className="flex justify-between items-center mb-8">
                                                    <div>
                                                        <h3 className="text-xl font-black text-primary tracking-tight uppercase italic flex items-center gap-2">
                                                            <Plus size={22} className="text-secondary" />
                                                            <span>Holiday Config</span>
                                                        </h3>
                                                        <p className="text-[10px] font-bold text-primary/40 uppercase tracking-widest mt-1">
                                                            Date: <span className="text-secondary font-black">{selectedHolidayDate}</span>
                                                        </p>
                                                    </div>
                                                    <button 
                                                        onClick={() => setIsHolidayFormOpen(false)}
                                                        className="h-10 w-10 bg-primary/5 hover:bg-primary/10 border border-primary/10 rounded-2xl flex items-center justify-center transition-all text-primary/60 hover:text-primary text-xl"
                                                    >
                                                        &times;
                                                    </button>
                                                </div>

                                                <form onSubmit={handleSaveHoliday} className="space-y-6">
                                                    <div className="space-y-2">
                                                        <label className="text-[10px] font-black tracking-widest uppercase text-primary/40 ml-2">Type</label>
                                                        <div className="grid grid-cols-2 gap-4">
                                                            <button 
                                                                type="button"
                                                                onClick={() => setHolidayType('GAZETTED')}
                                                                className={`p-3.5 rounded-2xl border font-black text-xs uppercase tracking-wider transition-all flex flex-col items-center justify-center gap-1 ${holidayType === 'GAZETTED' ? 'bg-secondary/20 border-secondary text-secondary shadow-lg shadow-secondary/10' : 'bg-primary/5 border-primary/5 hover:border-primary/10 text-primary/60'}`}
                                                            >
                                                                GAZETTED
                                                            </button>
                                                            <button 
                                                                type="button"
                                                                onClick={() => setHolidayType('RESTRICTED')}
                                                                className={`p-3.5 rounded-2xl border font-black text-xs uppercase tracking-wider transition-all flex flex-col items-center justify-center gap-1 ${holidayType === 'RESTRICTED' ? 'bg-orange-500/20 border-orange-500 text-orange-400 shadow-lg shadow-orange-500/10' : 'bg-primary/5 border-primary/5 hover:border-primary/10 text-primary/60'}`}
                                                            >
                                                                RESTRICTED
                                                            </button>
                                                        </div>
                                                    </div>

                                                    <div className="space-y-2">
                                                        <label className="text-[10px] font-black tracking-widest uppercase text-primary/40 ml-2">Holiday Name</label>
                                                        <input 
                                                            type="text"
                                                            value={holidayName}
                                                            onChange={(e) => setHolidayName(e.target.value)}
                                                            placeholder="e.g. Diwali"
                                                            className="w-full bg-primary/5 border border-primary/10 focus:border-secondary rounded-2xl px-5 py-4 text-xs font-bold text-primary focus:outline-none focus:ring-1 focus:ring-secondary transition duration-200"
                                                        />
                                                    </div>

                                                    <div className="space-y-2">
                                                        <label className="text-[10px] font-black tracking-widest uppercase text-primary/40 ml-2">Notes / Description (Optional)</label>
                                                        <textarea 
                                                            value={holidayDesc}
                                                            onChange={(e) => setHolidayDesc(e.target.value)}
                                                            rows={3}
                                                            placeholder="Add specific details..."
                                                            className="w-full bg-primary/5 border border-primary/10 focus:border-secondary rounded-2xl px-5 py-4 text-xs font-bold text-primary focus:outline-none focus:ring-1 focus:ring-secondary transition duration-200 font-medium resize-none"
                                                        />
                                                    </div>
                                                </form>
                                            </div>

                                            <div className="flex gap-4 border-t border-primary/5 pt-6">
                                                <button 
                                                    type="button"
                                                    onClick={() => setIsHolidayFormOpen(false)}
                                                    className="flex-1 bg-primary/5 hover:bg-primary/10 border border-primary/5 rounded-2xl px-5 py-4 text-xs font-black uppercase tracking-widest text-primary/60 hover:text-primary transition duration-200 text-center"
                                                >
                                                    Cancel
                                                </button>
                                                <button 
                                                    type="button"
                                                    onClick={handleSaveHoliday}
                                                    disabled={isHolidaysLoading}
                                                    className="flex-1 bg-primary hover:bg-primary/90 text-background rounded-2xl px-5 py-4 text-xs font-black uppercase tracking-widest transition duration-200 text-center shadow-lg shadow-primary/20 flex items-center justify-center gap-2"
                                                >
                                                    {isHolidaysLoading ? <RefreshCw className="h-4 w-4 animate-spin" /> : 'Save'}
                                                </button>
                                            </div>
                                        </motion.div>
                                    </div>
                                )}
                            </AnimatePresence>
                        </motion.div>
                    ) : (
                        <motion.div 
                            key="team-management"
                            initial={{ opacity: 0 }}
                            animate={{ opacity: 1 }}
                            exit={{ opacity: 0 }}
                            className="space-y-12"
                        >
                            <section className="max-w-5xl mx-auto bg-surface border border-primary/5 p-8 rounded-[3rem] space-y-8 shadow-xl shadow-primary/5">
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
                                                placeholder="e.g. John Doe"
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

