"use client";

import React from "react";
import { motion } from "framer-motion";
import {
  Footprints,
  Home,
  ShieldCheck,
  ChevronRight,
  ScanFace,
  AlertCircle,
} from "lucide-react";
import { useAuth } from "@/context/AuthContext";
import { GradientBackground } from "@/components/GradientBackground";
import { Navigation } from "@/components/Navigation";
import { LoadingIndicator } from "@/components/LoadingIndicator";
import { useRouter } from "next/navigation";
import { databases } from "@/lib/appwrite";
import { Query } from "appwrite";
import { format } from "date-fns";

export default function Dashboard() {
  const {
    user,
    isLoading,
    isRegistrationRequired,
    isAdmin,
    isKiosk,
    studentData,
  } = useAuth();
  const router = useRouter();
  const [outings, setOutings] = React.useState<any[]>([]);
  const [isOutingsLoading, setIsOutingsLoading] = React.useState(false);

  const DB_ID = "69cb970a000853f23489";
  const COLL_OUTING = "outing";

  React.useEffect(() => {
    if (user && studentData?.$id && !isAdmin && !isKiosk) {
      fetchOutings();
    }
  }, [user, studentData, isAdmin, isKiosk]);

  const fetchOutings = async () => {
    setIsOutingsLoading(true);
    try {
      const rollNo = studentData?.$id;
      if (!rollNo) return;

      const resp = await databases.listDocuments(DB_ID, COLL_OUTING, [
        Query.equal("roll_no", rollNo),
        Query.orderDesc("out_time"),
        Query.limit(10),
      ]);
      setOutings(resp.documents);
    } catch (err) {
      console.error("Failed to fetch outings", err);
    } finally {
      setIsOutingsLoading(false);
    }
  };

  if (isLoading) {
    return (
      <GradientBackground>
        <div className="flex-1 flex items-center justify-center">
          <LoadingIndicator />
        </div>
      </GradientBackground>
    );
  }

  if (!user) {
    if (typeof window !== "undefined") router.push("/login");
    return null;
  }

  if (isRegistrationRequired) {
    if (typeof window !== "undefined") router.push("/complete-profile");
    return null;
  }

  return (
    <GradientBackground>
      <Navigation />

      <main className="flex-1 max-w-7xl mx-auto w-full px-4 sm:px-6 pt-24 sm:pt-32 pb-12">
        <header className="mb-12">
          <motion.div
            initial={{ opacity: 0, x: -20 }}
            animate={{ opacity: 1, x: 0 }}
            className="space-y-1"
          >
            {!isKiosk && (
              <p className="text-secondary font-medium tracking-[0.2em] text-xs uppercase">
                Welcome back
              </p>
            )}
            <h1 className="text-3xl sm:text-4xl font-bold text-white tracking-tight italic leading-tight">
              {isKiosk ? "KIOSK" : (user.name || "Student").toUpperCase()}
            </h1>
          </motion.div>
        </header>

        {!isAdmin && !isKiosk && !(studentData as any)?.faceRegistered && (
          <motion.div
            initial={{ opacity: 0, y: -10 }}
            animate={{ opacity: 1, y: 0 }}
            className="mb-8 p-6 bg-error/10 border border-error/20 rounded-2xl flex items-center space-x-4 text-error"
          >
            <AlertCircle size={24} />
            <span className="font-bold uppercase tracking-tight italic text-sm sm:text-base leading-tight">
              Please Visit a Kiosk to get Facial Data Scanned
            </span>
          </motion.div>
        )}

        <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-12">
          {(isAdmin || isKiosk) && (
            <>
              <ActionCard
                title="Outing"
                subtitle="Short Duration Entry/Exit"
                icon={<Footprints className="text-secondary" size={32} />}
                delay={0.1}
                onClick={() => router.push("/capture?type=Outing")}
              />
              <ActionCard
                title="Register Face"
                subtitle="New Student Enrollment"
                icon={<ScanFace className="text-secondary" size={32} />}
                delay={0.15}
                onClick={() => router.push("/register")}
              />
            </>
          )}
          <ActionCard
            title="Leave"
            subtitle="NOT YET IMPLEMENTED"
            icon={<Home className="text-primary/20" size={32} />}
            delay={0.2}
            onClick={() => {}}
            disabled={true}
          />
          {isAdmin && (
            <ActionCard
              title="Admin Portal"
              subtitle="Administrative Console"
              icon={<ShieldCheck className="text-secondary" size={32} />}
              delay={0.3}
              onClick={() => router.push("/admin")}
            />
          )}
        </div>

        {!isAdmin && !isKiosk && (
          <motion.section
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.4 }}
            className="space-y-6 italic"
          >
            <div className="flex items-center justify-between">
              <h2 className="text-xl font-bold text-white uppercase tracking-widest italic">
                Outing Log
              </h2>
              <div className="h-px flex-1 bg-white/5 mx-6" />
              <Footprints className="text-white/20" size={20} />
            </div>

            {isOutingsLoading ? (
              <div className="flex justify-center p-12 bg-surface/30 rounded-3xl border border-white/5">
                <LoadingIndicator size="sm" />
              </div>
            ) : outings.length > 0 ? (
              <div className="grid grid-cols-1 gap-4">
                {outings.map((outing, idx) => (
                  <motion.div
                    key={outing.$id}
                    initial={{ opacity: 0, x: -10 }}
                    animate={{ opacity: 1, x: 0 }}
                    transition={{ delay: 0.1 * idx }}
                    className="bg-surface/40 hover:bg-surface/60 border border-white/5 p-4 sm:p-6 rounded-3xl flex flex-col sm:flex-row sm:items-center justify-between gap-4 transition-all group"
                  >
                    <div className="flex items-center space-x-4">
                      <div
                        className={`w-12 h-12 rounded-2xl flex items-center justify-center shrink-0 ${outing.in_time ? "bg-primary/20 text-primary" : "bg-error/20 text-error animate-pulse"}`}
                      >
                        <ScanFace size={24} />
                      </div>
                      <div>
                        <p className="text-white font-bold uppercase text-sm tracking-tight italic">
                          {outing.in_time
                            ? "Completed Outing"
                            : "Currently Out"}
                        </p>
                        <p className="text-white/40 text-xs font-medium uppercase tracking-widest">
                          ID: {outing.$id.slice(-8)}
                        </p>
                      </div>
                    </div>

                    <div className="flex flex-col sm:flex-row gap-4 sm:gap-12">
                      <div className="space-y-1">
                        <p className="text-[10px] text-white/20 font-black uppercase tracking-widest">
                          Exit
                        </p>
                        <p className="text-white/80 font-bold text-sm">
                          {format(new Date(outing.out_time), "MMM dd, hh:mm a")}
                        </p>
                      </div>
                      <div className="space-y-1">
                        <p className="text-[10px] text-white/20 font-black uppercase tracking-widest">
                          Entry
                        </p>
                        {outing.in_time ? (
                          <p className="text-white/80 font-bold text-sm">
                            {format(
                              new Date(outing.in_time),
                              "MMM dd, hh:mm a",
                            )}
                          </p>
                        ) : (
                          <div className="flex items-center space-x-2 text-error">
                            <AlertCircle size={14} />
                            <p className="font-bold text-xs uppercase tracking-tighter">
                              Still Out
                            </p>
                          </div>
                        )}
                      </div>
                    </div>
                  </motion.div>
                ))}
              </div>
            ) : (
              <div className="bg-surface/30 border border-white/5 rounded-3xl p-12 text-center">
                <Footprints className="mx-auto text-white/10 mb-4" size={48} />
                <p className="text-white/40 font-bold uppercase tracking-widest text-sm italic">
                  No Outing History Found
                </p>
              </div>
            )}
          </motion.section>
        )}
      </main>
    </GradientBackground>
  );
}

function ActionCard({
  title,
  subtitle,
  icon,
  delay,
  onClick,
  disabled = false,
}: {
  title: string;
  subtitle: string;
  icon: React.ReactNode;
  delay: number;
  onClick: () => void;
  disabled?: boolean;
}) {
  return (
    <motion.button
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay }}
      onClick={onClick}
      disabled={disabled}
      className={`group relative border border-white/5 p-6 sm:p-8 rounded-3xl text-left overflow-hidden transition-all ${
        disabled
          ? "bg-surface/20 opacity-50 cursor-not-allowed grayscale"
          : "bg-surface/50 hover:bg-surface/80 hover:scale-[1.02] active:scale-[0.98]"
      }`}
    >
      <div className="relative z-10 flex flex-col h-full justify-between space-y-8 italic">
        <div className="p-4 bg-background/50 rounded-2xl w-fit shadow-xl">
          {icon}
        </div>
        <div>
          <h2 className="text-xl sm:text-2xl font-bold text-white mb-2 uppercase leading-none">
            {title}
          </h2>
          <p className="text-white/40 text-sm">{subtitle}</p>
        </div>
      </div>

      {/* Decoration */}
      <div className="absolute top-0 right-0 p-4 opacity-0 group-hover:opacity-100 transition-opacity">
        <ChevronRight className="text-white/20" size={32} />
      </div>
      <div className="absolute -bottom-10 -right-10 w-40 h-40 bg-white/5 rounded-full blur-3xl group-hover:bg-white/10 transition-all pointer-events-none" />
    </motion.button>
  );
}
