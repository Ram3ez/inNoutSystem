"use client";

import React, { useEffect } from "react";
import { GradientBackground } from "./GradientBackground";
import { Navigation } from "./Navigation";
import { useAuth } from "@/context/AuthContext";
import { LoadingIndicator } from "./LoadingIndicator";
import { ArrowLeft } from "lucide-react";
import { useRouter } from "next/navigation";

interface BasePageProps {
  children: React.ReactNode;
  
  // Role-based protection
  requireAdmin?: boolean;
  requireFaculty?: boolean;
  requireCaretaker?: boolean;
  requireKiosk?: boolean;
  
  title?: string;
  subtitle?: string;
  actions?: React.ReactNode;
  backHref?: string;
  showBackButton?: boolean;
  maxWidth?: "sm" | "md" | "lg" | "xl" | "7xl" | "full";
}

/**
 * BasePage Component
 * A layout wrapper that ensures consistent aesthetics across all pages.
 * Handles:
 * 1. Background gradients and theme transitions (via ThemeProvider).
 * 2. Top navigation bar.
 * 3. Consistent spacing and padding.
 * 4. Auth/Role protection and loading states.
 * 5. Standard header with back button and action slots.
 * 
 * If a user fails a role check, they are automatically redirected to the dashboard (/).
 */
export const BasePage: React.FC<BasePageProps> = ({
  children,
  requireAdmin = false,
  requireFaculty = false,
  requireCaretaker = false,
  requireKiosk = false,
  title,
  subtitle,
  actions,
  backHref,
  showBackButton = true,
  maxWidth = "7xl",
}) => {
  const { user, isAdmin, isFaculty, isCaretaker, isKiosk, isLoading } = useAuth();
  const router = useRouter();

  const maxWidthClasses = {
    sm: "max-w-screen-sm",
    md: "max-w-screen-md",
    lg: "max-w-screen-lg",
    xl: "max-w-screen-xl",
    "7xl": "max-w-7xl",
    full: "max-w-full",
  };

  // Perform role-based checks and redirect if unauthorized
  useEffect(() => {
    if (!isLoading) {
      if (!user) {
        router.push("/login");
        return;
      }

      const isUnauthorized = 
        (requireAdmin && !isAdmin) ||
        (requireFaculty && !isFaculty) ||
        (requireCaretaker && !isCaretaker) ||
        (requireKiosk && !isKiosk);

      if (isUnauthorized) {
        console.warn("Access denied: Redirecting to dashboard.");
        router.push("/");
      }
    }
  }, [isLoading, user, isAdmin, isFaculty, isCaretaker, isKiosk, requireAdmin, requireFaculty, requireCaretaker, requireKiosk, router]);

  // Handle loading states
  if (isLoading) {
    return (
      <GradientBackground>
        <Navigation />
        <div className="flex-1 flex items-center justify-center">
          <LoadingIndicator />
        </div>
      </GradientBackground>
    );
  }

  // Pre-calculate if we should show content to avoid layout jumps during redirect
  const isAuthorized = 
    user && 
    (!requireAdmin || isAdmin) &&
    (!requireFaculty || isFaculty) &&
    (!requireCaretaker || isCaretaker) &&
    (!requireKiosk || isKiosk);

  if (!isAuthorized) return null;

  const handleBack = () => {
    if (backHref) {
      router.push(backHref);
    } else {
      router.back();
    }
  };

  return (
    <GradientBackground>
      <Navigation />
      
      <main className="flex-1 pt-32 sm:pt-40 pb-12 px-4 sm:px-6">
        <div className={`mx-auto w-full ${maxWidthClasses[maxWidth]} space-y-8`}>
          
          {/* Header Section */}
          {(title || subtitle || actions || showBackButton) && (
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-6 mb-10">
              <div className="flex items-center space-x-4">
                {showBackButton && (
                  <button
                    onClick={handleBack}
                    className="p-2 hover:bg-primary/10 rounded-full transition-colors text-primary"
                    aria-label="Go back"
                  >
                    <ArrowLeft size={24} />
                  </button>
                )}
                <div className="space-y-1">
                  {title && (
                    <h1 className="text-2xl sm:text-3xl font-bold text-primary uppercase tracking-tight leading-tight">
                      {title}
                    </h1>
                  )}
                  {subtitle && (
                    <p className="text-primary/40 text-[10px] font-bold uppercase tracking-widest leading-none">
                      {subtitle}
                    </p>
                  )}
                </div>
              </div>
              {actions && (
                <div className="flex items-center gap-3 w-full md:w-auto">
                  {actions}
                </div>
              )}
            </div>
          )}

          {/* Page Content */}
          <div className="relative">
            {children}
          </div>
        </div>
      </main>
    </GradientBackground>
  );
};
