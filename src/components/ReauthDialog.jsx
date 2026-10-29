import React from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/lib/AuthContext";
import GoogleIcon from "@/components/GoogleIcon";

// Google access tokens last about an hour. When one expires, Drive calls pause
// here until the user taps Continue (a click is required to open Google's popup).
export default function ReauthDialog() {
  const { needsReauth, reauthorize, logout, authError } = useAuth();
  return (
    <Dialog open={needsReauth}>
      <DialogContent
        onInteractOutside={(e) => e.preventDefault()}
        onEscapeKeyDown={(e) => e.preventDefault()}
        className="[&>button:last-child]:hidden"
      >
        <DialogHeader>
          <DialogTitle>Session expired</DialogTitle>
          <DialogDescription>
            Your Google session timed out. Continue to pick up where you left off; anything that was
            uploading will resume.
          </DialogDescription>
        </DialogHeader>
        {authError && <p className="text-sm text-red-600">{authError}</p>}
        <DialogFooter className="gap-2 sm:gap-2">
          <Button variant="ghost" onClick={logout}>
            Sign out
          </Button>
          <Button onClick={reauthorize}>
            <GoogleIcon className="h-4 w-4" /> Continue
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
