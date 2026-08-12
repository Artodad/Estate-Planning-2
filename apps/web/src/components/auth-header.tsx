"use client";

import {
  OrganizationSwitcher,
  Show,
  SignInButton,
  SignUpButton,
  UserButton,
} from "@clerk/nextjs";

import { useFirm, useRole } from "@/features/auth";

import { Button } from "@/components/ui/button";

export function AuthHeader() {
  return (
    <header className="fixed top-0 z-50 flex w-full items-center justify-between border-b border-border/60 bg-background/80 px-6 py-3 backdrop-blur-md">
      <div className="flex flex-col">
        <span className="text-sm font-semibold tracking-tight">
          Estate Planning Engine
        </span>
        <span className="text-xs text-muted-foreground">
          Multi-tenant legal intake platform
        </span>
      </div>

      <div className="flex items-center gap-3">
        <Show when="signed-out">
          <SignInButton mode="modal">
            <Button variant="ghost" size="sm">
              Sign in
            </Button>
          </SignInButton>
          <SignUpButton mode="modal">
            <Button size="sm">Sign up</Button>
          </SignUpButton>
        </Show>
        <Show when="signed-in">
          <OrganizationSwitcher
            hidePersonal
            afterCreateOrganizationUrl="/dashboard"
            afterSelectOrganizationUrl="/dashboard"
            appearance={{
              elements: {
                organizationSwitcherTrigger: "px-3 py-1.5 text-sm border border-border rounded-md hover:bg-accent",
              },
            }}
          />

          {/* Show current firm name from our store when available */}
          <FirmName />

          <UserButton
            appearance={{
              elements: {
                avatarBox: "size-8",
              },
            }}
          />
        </Show>
      </div>
    </header>
  );
}

function FirmName() {
  const { currentFirm, isLoading, isHydrated } = useFirm();
  const { role, isHydrated: roleHydrated, isLoading: roleLoading } = useRole();

  // While we're still figuring out the user's firm, show a subtle placeholder
  // (improved to also respect role hydration state from useRole for the badge)
  if (!isHydrated || isLoading || !roleHydrated || roleLoading) {
    return (
      <div className="hidden h-8 w-28 animate-pulse rounded-md border border-border/40 bg-muted/30 md:block" />
    );
  }

  if (!currentFirm?.name) {
    return null;
  }

  const isOnboarded = !!currentFirm.id;

  // Role-aware badge treatment (Sub-agent D polish):
  // - client: subtle muted treatment (limited access visual)
  // - staff: distinct blue tint
  // - owner: primary accent (default)
  const roleBadgeClass =
    role === "client"
      ? "ml-1 rounded border border-border/60 bg-muted/60 px-1.5 py-0.5 text-[10px] font-mono uppercase tracking-wider text-muted-foreground"
      : role === "staff"
      ? "ml-1 rounded bg-blue-500/10 px-1.5 py-0.5 text-[10px] font-mono uppercase tracking-wider text-blue-600 dark:text-blue-400"
      : "ml-1 rounded bg-primary/10 px-1.5 py-0.5 text-[10px] font-mono uppercase tracking-wider text-primary";

  const roleTitle = role
    ? `Your role in this firm (authoritative value from server / useRole): ${role}${role === "client" ? " — limited access" : ""}`
    : "Your role in this firm (authoritative value from server)";

  return (
    <div
      className={`hidden items-center gap-2 rounded-md border px-3 py-1 text-sm md:flex ${
        isOnboarded
          ? "border-border/60 bg-muted/40"
          : "border-amber-300 bg-amber-50 text-amber-800 dark:border-amber-800/50 dark:bg-amber-950/30 dark:text-amber-200"
      }`}
    >
      <span className="font-medium text-muted-foreground">Firm:</span>
      <span className="font-semibold">{currentFirm.name}</span>
      {role && (
        <span
          className={roleBadgeClass}
          title={roleTitle}
        >
          {role}
        </span>
      )}
      {!isOnboarded && (
        <span className="ml-1 text-[10px] font-medium uppercase tracking-wide">
          (setup needed)
        </span>
      )}
    </div>
  );
}
