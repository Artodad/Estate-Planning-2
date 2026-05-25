"use client";

import Link from "next/link";
import { Show } from "@clerk/nextjs";

import { Button } from "@/components/ui/button";

export function LandingAuthActions() {
  return (
    <>
      <Show when="signed-out">
        <div className="flex flex-wrap gap-3">
          <Button asChild>
            <Link href="/sign-up">Create account</Link>
          </Button>
          <Button asChild variant="outline">
            <Link href="/sign-in">Sign in</Link>
          </Button>
        </div>
      </Show>

      <Show when="signed-in">
        <div className="flex flex-wrap items-center gap-3">
          <p className="text-sm text-muted-foreground">
            You are signed in.
          </p>
          <Button asChild variant="outline" size="sm">
            <Link href="/dashboard">Go to Dashboard</Link>
          </Button>
        </div>
      </Show>
    </>
  );
}
