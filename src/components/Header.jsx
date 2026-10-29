import React, { useState } from "react";
import { LogOut } from "lucide-react";
import { useAuth } from "@/lib/AuthContext";
import GoogleIcon from "@/components/GoogleIcon";
import { Button } from "@/components/ui/button";

export function Logo({ className = "h-8 w-8" }) {
  return <img src="/favicon.svg" alt="" className={className} />;
}

export default function Header() {
  const { configured, isAuthenticated, user, login, logout, ready, lastEmail } = useAuth();
  const [menu, setMenu] = useState(false);
  const initial = (user?.full_name || user?.email || "?").trim()[0]?.toUpperCase();

  return (
    <header className="sticky top-0 z-30 border-b border-neutral-200 bg-white/85 backdrop-blur-md pt-[env(safe-area-inset-top)]">
      <div className="mx-auto flex h-14 max-w-3xl items-center justify-between px-4">
        <a href="/" className="flex items-center gap-2.5">
          <Logo />
          <span className="font-semibold tracking-tight text-neutral-900">Wattson</span>
        </a>
        {configured && !isAuthenticated && (
          <Button variant="outline" size="sm" onClick={login} disabled={!ready} className="bg-white">
            <GoogleIcon className="h-4 w-4" />
            <span className="hidden sm:inline">{lastEmail ? `Continue as ${lastEmail}` : "Sign in to use Google Drive"}</span>
            <span className="sm:hidden">Sign in</span>
          </Button>
        )}
        {isAuthenticated && (
          <div className="relative">
            <button
              onClick={() => setMenu((m) => !m)}
              className="grid h-8 w-8 place-items-center overflow-hidden rounded-full bg-neutral-200 text-sm font-medium text-neutral-700"
              aria-label="Account"
              aria-expanded={menu}
            >
              {user.photo_url ? (
                <img src={user.photo_url} alt="" referrerPolicy="no-referrer" className="h-full w-full object-cover" />
              ) : (
                initial
              )}
            </button>
            {menu && (
              <>
                <div className="fixed inset-0 z-10" onClick={() => setMenu(false)} />
                <div className="absolute right-0 z-20 mt-2 w-60 rounded-xl border border-neutral-200 bg-white p-1 shadow-lg">
                  <div className="px-3 py-2">
                    <p className="truncate text-sm font-medium text-neutral-900">{user.full_name}</p>
                    <p className="truncate text-xs text-neutral-500">{user.email}</p>
                  </div>
                  <div className="my-1 h-px bg-neutral-100" />
                  <button
                    onClick={() => {
                      setMenu(false);
                      logout();
                    }}
                    className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-sm text-neutral-700 hover:bg-neutral-50"
                  >
                    <LogOut className="h-4 w-4" /> Sign out
                  </button>
                </div>
              </>
            )}
          </div>
        )}
      </div>
    </header>
  );
}
