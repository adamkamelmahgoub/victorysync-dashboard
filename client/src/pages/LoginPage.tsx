import type { FC } from "react";
import { SignIn, SignUp } from "@clerk/react";
import { useState } from "react";
import { useTheme } from "../contexts/ThemeContext";

type Mode = "signin" | "signup";

export const LoginPage: FC = () => {
  const { theme, toggleTheme } = useTheme();
  const [mode, setMode] = useState<Mode>("signin");
  const isLight = theme === "light";

  const pageClass = isLight
    ? "min-h-screen bg-slate-100 text-slate-950"
    : "min-h-screen bg-[#030711] text-white";
  const panelClass = isLight
    ? "border-slate-200 bg-white shadow-[0_24px_70px_rgba(15,23,42,0.12)]"
    : "border-white/[0.07] bg-slate-950/72 shadow-[0_28px_70px_rgba(0,0,0,0.32)]";
  const mutedText = isLight ? "text-slate-600" : "text-slate-400";
  const titleText = isLight ? "text-slate-950" : "text-white";
  const inactiveTab = isLight ? "text-slate-600 hover:text-slate-950" : "text-slate-400 hover:text-slate-100";
  const toggleClass = isLight
    ? "border-slate-300 bg-white text-slate-700"
    : "border-white/[0.08] bg-white/[0.035] text-slate-200";

  return (
    <main className={pageClass}>
      <div className="grid min-h-screen lg:grid-cols-[1.08fr_0.92fr]">
        <section className={`relative hidden overflow-hidden border-r lg:flex ${isLight ? "border-slate-200 bg-white" : "border-white/[0.06] bg-[#07111f]"}`}>
          <div className={isLight
            ? "absolute inset-0 bg-[radial-gradient(circle_at_18%_18%,rgba(6,182,212,0.14),transparent_30%),radial-gradient(circle_at_82%_8%,rgba(16,185,129,0.12),transparent_26%),linear-gradient(145deg,rgba(255,255,255,0.72),rgba(226,232,240,0.86))]"
            : "absolute inset-0 bg-[radial-gradient(circle_at_18%_18%,rgba(6,182,212,0.18),transparent_30%),radial-gradient(circle_at_82%_8%,rgba(16,185,129,0.16),transparent_26%),linear-gradient(145deg,rgba(3,7,18,0.05),rgba(3,7,18,0.78))]"
          } />
          <div className="relative flex w-full flex-col justify-between p-12 xl:p-16">
            <BrandMark isLight={isLight} />
            <div className="max-w-2xl">
              <div className={`mb-5 inline-flex rounded-full border border-emerald-400/25 bg-emerald-400/10 px-4 py-2 text-xs font-bold uppercase tracking-[0.22em] ${isLight ? "text-emerald-700" : "text-emerald-100"}`}>
                Clerk Secured Portal
              </div>
              <h2 className={`text-5xl font-black leading-[1.02] tracking-normal xl:text-6xl ${titleText}`}>
                Live operations, calls, leads, and client reporting in one command center.
              </h2>
              <p className={`mt-6 max-w-xl text-base leading-7 ${mutedText}`}>
                Sign in with Clerk to monitor activity, manage lead intake, review recordings, and keep every client workspace accountable.
              </p>
            </div>
            <div className={`flex items-center justify-between text-xs ${isLight ? "text-slate-500" : "text-slate-500"}`}>
              <span>Multi-tenant operations platform</span>
              <span>dashboard.victorysync.com</span>
            </div>
          </div>
        </section>

        <section className="flex min-h-screen items-center justify-center px-4 py-5 sm:px-8 sm:py-8">
          <div className="w-full max-w-[460px]">
            <div className="mb-5 flex items-center justify-between gap-3 lg:hidden">
              <BrandMark isLight={isLight} compact />
              <ThemeButton className={toggleClass} isLight={isLight} onClick={toggleTheme} />
            </div>

            <div className={`rounded-[28px] border p-5 sm:p-8 ${panelClass}`}>
              <div className="flex items-start justify-between gap-4">
                <div>
                  <div className="text-xs font-bold uppercase tracking-[0.22em] text-cyan-500">Account Access</div>
                  <h1 className={`mt-3 text-3xl font-black tracking-normal ${titleText}`}>
                    {mode === "signin" ? "Welcome back" : "Join your workspace"}
                  </h1>
                  <p className={`mt-2 text-sm leading-6 ${mutedText}`}>
                    Clerk now handles secure sign-in and account creation for VictorySync.
                  </p>
                </div>
                <ThemeButton className={`hidden lg:block ${toggleClass}`} isLight={isLight} onClick={toggleTheme} />
              </div>

              <div className={`mt-7 grid grid-cols-2 rounded-2xl border p-1 ${isLight ? "border-slate-200 bg-slate-100" : "border-white/[0.06] bg-white/[0.035]"}`}>
                <button
                  type="button"
                  onClick={() => setMode("signin")}
                  className={`rounded-xl px-3 py-2.5 text-sm font-semibold transition ${
                    mode === "signin" ? "bg-cyan-500 text-slate-950 shadow-[0_10px_24px_rgba(6,182,212,0.18)]" : inactiveTab
                  }`}
                >
                  Sign in
                </button>
                <button
                  type="button"
                  onClick={() => setMode("signup")}
                  className={`rounded-xl px-3 py-2.5 text-sm font-semibold transition ${
                    mode === "signup" ? "bg-emerald-400 text-slate-950 shadow-[0_10px_24px_rgba(16,185,129,0.16)]" : inactiveTab
                  }`}
                >
                  Sign up
                </button>
              </div>

              <div className="mt-7 flex justify-center">
                {mode === "signin" ? (
                  <SignIn routing="hash" signUpUrl="#signup" forceRedirectUrl="/dashboard" />
                ) : (
                  <SignUp routing="hash" signInUrl="#signin" forceRedirectUrl="/dashboard" />
                )}
              </div>
            </div>
          </div>
        </section>
      </div>
    </main>
  );
};

function BrandMark({ isLight, compact = false }: { isLight: boolean; compact?: boolean }) {
  return (
    <div className="flex items-center gap-3">
      <div className={`${compact ? "h-11 w-11" : "h-12 w-12"} flex items-center justify-center rounded-2xl border border-cyan-400/25 bg-cyan-400/10 shadow-[0_18px_45px_rgba(6,182,212,0.12)]`}>
        <span className={`text-sm font-black tracking-wide ${isLight ? "text-cyan-700" : "text-cyan-100"}`}>VS</span>
      </div>
      <div>
        <div className={`text-sm font-semibold tracking-[0.16em] ${isLight ? "text-cyan-800" : "text-cyan-100"}`}>VictorySync</div>
        <div className={`text-xs uppercase tracking-[0.2em] ${isLight ? "text-slate-500" : "text-slate-500"}`}>Operations Hub</div>
      </div>
    </div>
  );
}

function ThemeButton({ className, isLight, onClick }: { className: string; isLight: boolean; onClick: () => Promise<void> }) {
  return (
    <button type="button" onClick={() => void onClick()} className={`rounded-2xl border px-3 py-2 text-xs font-semibold ${className}`}>
      {isLight ? "Dark" : "Light"}
    </button>
  );
}
