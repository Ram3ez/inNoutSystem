'use client';

import React, { useEffect, useState, Suspense } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { teams } from '@/lib/appwrite';
import { GradientBackground } from '@/components/GradientBackground';
import { LoadingIndicator } from '@/components/LoadingIndicator';
import { CheckCircle2, AlertCircle, Home } from 'lucide-react';
import { motion } from 'framer-motion';

function AcceptInviteContent() {
    const searchParams = useSearchParams();
    const router = useRouter();
    const [status, setStatus] = useState<'loading' | 'success' | 'error'>('loading');
    const [error, setError] = useState<string | null>(null);

    useEffect(() => {
        const membershipId = searchParams.get('membershipId');
        const userId = searchParams.get('userId');
        const secret = searchParams.get('secret');
        const teamId = searchParams.get('teamId');

        if (membershipId && userId && secret && teamId) {
            handleAccept(teamId, membershipId, userId, secret);
        } else {
            setStatus('error');
            setError("The invitation link is invalid or incomplete.");
        }
    }, [searchParams]);

    const handleAccept = async (teamId: string, membershipId: string, userId: string, secret: string) => {
        try {
            await teams.updateMembershipStatus({
                teamId,
                membershipId,
                userId,
                secret
            });
            setStatus('success');
            setTimeout(() => {
                router.push('/');
            }, 2000);
        } catch (err: any) {
            console.error("Failed to accept invitation:", err);
            setStatus('error');
            setError(err.message || "Failed to accept the invitation. It may have expired.");
        }
    };

    return (
        <div className="flex-1 flex flex-col items-center justify-center p-6 text-center">
            {status === 'loading' && (
                <motion.div 
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    className="space-y-6"
                >
                    <LoadingIndicator />
                    <p className="text-primary font-black uppercase tracking-[0.2em] text-[10px]">Processing Invitation...</p>
                </motion.div>
            )}

            {status === 'success' && (
                <motion.div 
                    initial={{ opacity: 0, scale: 0.9 }}
                    animate={{ opacity: 1, scale: 1 }}
                    className="space-y-6"
                >
                    <div className="flex justify-center">
                        <CheckCircle2 size={64} className="text-green-500" />
                    </div>
                    <div className="space-y-2">
                        <h1 className="text-2xl font-black text-primary uppercase tracking-tight">Invitation Accepted</h1>
                        <p className="text-primary/40 text-[10px] font-bold uppercase tracking-[0.2em]">Redirecting you to the dashboard...</p>
                    </div>
                </motion.div>
            )}

            {status === 'error' && (
                <motion.div 
                    initial={{ opacity: 0, scale: 0.9 }}
                    animate={{ opacity: 1, scale: 1 }}
                    className="max-w-sm w-full space-y-8 bg-surface/50 backdrop-blur-xl border border-primary/5 p-12 rounded-[3rem]"
                >
                    <div className="flex justify-center">
                        <AlertCircle size={48} className="text-secondary" />
                    </div>
                    <div className="space-y-2">
                        <h2 className="text-lg font-black text-primary uppercase tracking-tight">Acceptance Failed</h2>
                        <p className="text-primary/40 text-[10px] font-bold uppercase tracking-[0.2em] leading-relaxed">
                            {error}
                        </p>
                    </div>
                    <button 
                        onClick={() => router.push('/')}
                        className="w-full h-14 bg-primary text-background rounded-2xl flex items-center justify-center gap-3 transition-all hover:brightness-110 active:scale-95"
                    >
                        <Home size={18} />
                        <span className="text-[10px] font-black uppercase tracking-widest">Go to Home</span>
                    </button>
                </motion.div>
            )}
        </div>
    );
}

export default function AcceptInvitePage() {
    return (
        <GradientBackground>
            <Suspense fallback={
                <div className="flex-1 flex items-center justify-center">
                    <LoadingIndicator />
                </div>
            }>
                <AcceptInviteContent />
            </Suspense>
        </GradientBackground>
    );
}
