'use client';

import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Phone, User as UserIcon, ArrowRight, CheckCircle2 } from 'lucide-react';
import { useAuth } from '@/context/AuthContext';
import { databases } from '@/lib/appwrite';
import { useRouter } from 'next/navigation';
import { GradientBackground } from '@/components/GradientBackground';
import { LoadingIndicator } from '@/components/LoadingIndicator';

export default function CompleteProfilePage() {
    const { user, isLoading: authLoading, isRegistrationRequired } = useAuth();
    const [phone, setPhone] = useState('');
    const [name, setName] = useState('');
    const [gender, setGender] = useState<'MALE' | 'FEMALE' | ''>('');
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [isSuccess, setIsSuccess] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const router = useRouter();

    const DB_ID = "69cb970a000853f23489";
    const COLL_STUDENTS = "student_details";

    useEffect(() => {
        if (!authLoading && !user) {
            router.push('/login');
        } else if (!authLoading && user && !isRegistrationRequired) {
            router.push('/');
        }
        
        if (user) {
            setName(user.name || '');
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

        const rollNumber = user.email.split('@')[0].toUpperCase();

        try {
            await databases.createDocument(
                DB_ID,
                COLL_STUDENTS,
                rollNumber,
                {
                    name: name,
                    phone_no: parseInt(phone),
                    gender: gender,
                    is_out: false,
                    faceRegistered: false,
                }
            );
            
            setIsSuccess(true);
            setTimeout(() => {
                window.location.href = '/'; // Force a full reload to refresh AuthContext state
            }, 2000);
        } catch (err: any) {
            console.error('Registration failed:', err);
            setError(err.message || 'Failed to save details');
            setIsSubmitting(false);
        }
    };

    if (authLoading) return (
        <GradientBackground>
            <div className="flex-1 flex items-center justify-center">
                <LoadingIndicator />
            </div>
        </GradientBackground>
    );

    return (
        <GradientBackground>
            <div className="flex-1 flex items-center justify-center p-4 sm:p-6">
                <motion.div 
                    initial={{ opacity: 0, y: 20 }}
                    animate={{ opacity: 1, y: 0 }}
                    className="w-full max-w-md bg-surface/40 backdrop-blur-xl p-6 sm:p-8 rounded-3xl border border-white/10 shadow-2xl"
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
                                    <h1 className="text-2xl font-bold text-white mb-2 uppercase tracking-widest italic">
                                        Complete Profile
                                    </h1>
                                    <p className="text-white/40 text-sm tracking-wide uppercase">
                                        Please provide your contact details to continue
                                    </p>
                                </div>

                                <form onSubmit={handleSubmit} className="space-y-6">
                                    <div className="space-y-2">
                                        <label className="text-xs font-bold text-white/40 uppercase tracking-widest ml-1">
                                            Full Name
                                        </label>
                                        <div className="relative">
                                            <UserIcon className="absolute left-4 top-1/2 -translate-y-1/2 text-white/20" size={18} />
                                            <input 
                                                type="text"
                                                value={name}
                                                onChange={(e) => setName(e.target.value)}
                                                required
                                                placeholder="Enter full name"
                                                className="w-full h-14 bg-white/5 border border-white/10 rounded-xl pl-12 pr-4 text-white placeholder:text-white/10 focus:outline-none focus:border-primary/50 transition-all font-medium"
                                            />
                                        </div>
                                    </div>

                                    <div className="space-y-2">
                                        <label className="text-xs font-bold text-white/40 uppercase tracking-widest ml-1">
                                            Phone Number
                                        </label>
                                        <div className="relative">
                                            <Phone className="absolute left-4 top-1/2 -translate-y-1/2 text-white/20" size={18} />
                                            <input 
                                                type="tel"
                                                value={phone}
                                                onChange={(e) => setPhone(e.target.value.replace(/\D/g, '').slice(0, 10))}
                                                required
                                                maxLength={10}
                                                placeholder="Enter 10-digit number"
                                                className="w-full h-14 bg-white/5 border border-white/10 rounded-xl pl-12 pr-4 text-white placeholder:text-white/10 focus:outline-none focus:border-primary/50 transition-all font-medium"
                                            />
                                        </div>
                                    </div>

                                    <div className="space-y-2">
                                        <label className="text-xs font-bold text-white/40 uppercase tracking-widest ml-1">
                                            Gender
                                        </label>
                                        <div className="grid grid-cols-2 gap-2 sm:gap-4">
                                            <button
                                                type="button"
                                                onClick={() => setGender('MALE')}
                                                className={`h-14 rounded-xl font-bold uppercase tracking-widest transition-all ${
                                                    gender === 'MALE' 
                                                    ? 'bg-secondary text-background shadow-lg shadow-secondary/20' 
                                                    : 'bg-white/5 text-white/40 border border-white/5 hover:bg-white/10'
                                                }`}
                                            >
                                                Male
                                            </button>
                                            <button
                                                type="button"
                                                onClick={() => setGender('FEMALE')}
                                                className={`h-14 rounded-xl font-bold uppercase tracking-widest transition-all ${
                                                    gender === 'FEMALE' 
                                                    ? 'bg-secondary text-background shadow-lg shadow-secondary/20' 
                                                    : 'bg-white/5 text-white/40 border border-white/5 hover:bg-white/10'
                                                }`}
                                            >
                                                Female
                                            </button>
                                        </div>
                                    </div>

                                    {error && (
                                        <p className="text-error text-xs font-bold uppercase tracking-wider text-center bg-error/10 py-3 rounded-lg border border-error/20 italic">
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
                                <h1 className="text-2xl font-bold text-white mb-2 uppercase tracking-widest italic">
                                    Profile Saved
                                </h1>
                                <p className="text-white/40 text-sm tracking-wide uppercase">
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
