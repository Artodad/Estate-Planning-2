import { clerkMiddleware, createRouteMatcher } from "@clerk/nextjs/server";

const isPublicRoute = createRouteMatcher([
  "/",
  "/sign-in(.*)",
  "/sign-up(.*)",
  "/invite(.*)", // Magic-link landing for client invitations (public until claim; auth handled inside page + RBAC)
  "/api/webhooks(.*)", // Clerk webhooks (svix-signed, no session; must be public or middleware returns 401 before handler)
]);

export default clerkMiddleware(async (auth, request) => {
  if (!isPublicRoute(request)) {
    await auth.protect();
  }

  // Organization-aware logic can be added here in the future.
  // For example, we could redirect users without an active org
  // on certain routes, but we prefer to handle that in layouts
  // for better UX (show onboarding UI instead of hard redirect).
});

export const config = {
  matcher: [
    // Skip Next.js internals and static files
    "/((?!_next|[^?]*\\.(?:html?|css|js(?!on)|jpe?g|webp|png|gif|svg|ttf|woff2?|ico|csv|docx?|xlsx?|zip|webmanifest)).*)",
    // Always run for API routes
    "/(api|trpc)(.*)",
    // Clerk's internal proxy routes
    "/__clerk/(.*)",
  ],
};
