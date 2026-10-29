import React from "react";
import { Toaster } from "sonner";
import { AuthProvider } from "@/lib/AuthContext";
import Header from "@/components/Header";
import ReauthDialog from "@/components/ReauthDialog";
import Home from "@/pages/Home";

export default function App() {
  return (
    <AuthProvider>
      <div className="min-h-screen bg-neutral-50">
        <Header />
        <main className="mx-auto max-w-3xl px-4 py-5 pb-[calc(6rem+env(safe-area-inset-bottom))]">
          <Home />
        </main>
        <footer className="mx-auto max-w-3xl px-4 pb-8 text-center text-xs text-neutral-400">
          Wattson ·{" "}
          <a href="https://github.com/caleb-mcdougal-tamu/Wattson" className="underline underline-offset-2 hover:text-neutral-600">
            Source and Python tool on GitHub
          </a>
        </footer>
      </div>
      <ReauthDialog />
      <Toaster position="top-center" richColors closeButton />
    </AuthProvider>
  );
}
