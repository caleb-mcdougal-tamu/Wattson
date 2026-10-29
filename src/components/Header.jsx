import React from "react";

export function Logo({ className = "h-8 w-8" }) {
  return <img src="/favicon.svg" alt="" className={className} />;
}

export default function Header() {
  return (
    <header className="sticky top-0 z-30 border-b border-neutral-200 bg-white/85 backdrop-blur-md pt-[env(safe-area-inset-top)]">
      <div className="mx-auto flex h-14 max-w-3xl items-center px-4">
        <a href="/" className="flex items-center gap-2.5">
          <Logo />
          <span className="font-semibold tracking-tight text-neutral-900">Wattson</span>
        </a>
      </div>
    </header>
  );
}
