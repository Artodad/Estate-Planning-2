"use client";

import {
  Show,
  SignInButton,
  SignUpButton,
  UserButton,
} from "@clerk/nextjs";

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

      <div className="flex items-center gap-2">
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
