import React from "react";
import { Toaster } from "sonner";
import Header from "@/components/Header";
import Home from "@/pages/Home";

export default function App() {
  return (
    <>
      <div className="min-h-screen bg-neutral-50">
        <Header />
        <main className="mx-auto max-w-3xl px-4 py-5 pb-[calc(6rem+env(safe-area-inset-bottom))]">
          <Home />
        </main>
        <footer className="mx-auto max-w-3xl space-y-1 px-4 pb-8 text-center text-xs text-neutral-400">
          <p>
            Based on the 15-minute demand visualization tool by{" "}
            <span className="font-medium text-neutral-600">Noah Hickson, PhD, Texas A&amp;M University</span>.
          </p>
          <p>
            Wattson ·{" "}
            <a href="https://github.com/caleb-mcdougal-tamu/Wattson" className="underline underline-offset-2 hover:text-neutral-600">
              Source and Python tool on GitHub
            </a>
          </p>
        </footer>
      </div>
      <Toaster position="top-center" richColors closeButton />
    </>
  );
}
