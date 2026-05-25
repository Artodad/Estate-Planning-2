"use client";

import { useAuth, useUser } from "@clerk/nextjs";
import { useRouter } from "next/navigation";
import { useEffect } from "react";

import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";

export default function DashboardPage() {
  const { isLoaded, isSignedIn } = useAuth();
  const { user } = useUser();
  const router = useRouter();

  useEffect(() => {
    if (isLoaded && !isSignedIn) {
      router.replace("/sign-in");
    }
  }, [isLoaded, isSignedIn, router]);

  if (!isLoaded || !isSignedIn) {
    return (
      <div className="mx-auto max-w-6xl px-6 py-10">
        <p className="text-muted-foreground">Loading dashboard...</p>
      </div>
    );
  }

  const firstName = user?.firstName ?? "there";

  return (
    <div className="mx-auto max-w-6xl px-6 py-10">
      <div className="mb-10">
        <h1 className="text-3xl font-semibold tracking-tight">
          Welcome back, {firstName}
        </h1>
        <p className="mt-2 text-muted-foreground">
          Estate Planning Engine — attorney dashboard
        </p>
        {user?.primaryEmailAddress?.emailAddress ? (
          <p className="mt-1 text-sm text-muted-foreground">
            Signed in as {user.primaryEmailAddress.emailAddress}
          </p>
        ) : null}
      </div>

      <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
        <Card>
          <CardHeader>
            <CardTitle>Quick Actions</CardTitle>
            <CardDescription>Coming in Phase 1+</CardDescription>
          </CardHeader>
          <CardContent className="flex flex-col gap-3">
            <Button variant="outline" className="justify-start" disabled>
              + New Client Intake
            </Button>
            <Button variant="outline" className="justify-start" disabled>
              Manage Document Templates
            </Button>
            <Button variant="outline" className="justify-start" disabled>
              View Recent Documents
            </Button>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Your Firm</CardTitle>
            <CardDescription>Organization context (Phase 1)</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="rounded-md border bg-muted/50 p-4 text-sm">
              <p className="font-medium">No firm selected yet</p>
              <p className="mt-1 text-muted-foreground">
                Clerk Organizations + firm onboarding will be added in Phase 1.
              </p>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Recent Activity</CardTitle>
            <CardDescription>Last 7 days</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-3 text-sm text-muted-foreground">
              <p>No recent activity yet.</p>
              <p className="text-xs">
                Intake sessions and generated documents will appear here.
              </p>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
