import Link from "next/link";

function LandingSignInLink() {
  return (
    <Link
      href="/sign-in"
      className="inline-flex h-8 items-center justify-center rounded-lg bg-[#9a7b32] px-3 text-sm font-medium text-[#f4f1ea] transition-opacity hover:opacity-90"
    >
      Sign in
    </Link>
  );
}

export function LandingDoor() {
  return (
    <div className="min-h-screen bg-[#f4f1ea] text-[#2c3338]">
      <header className="fixed top-0 z-50 flex w-full items-center justify-between border-b border-[#2c3338]/12 bg-[#f4f1ea] px-6 py-3">
        <span className="text-sm font-semibold tracking-tight">
          Estate Planning Engine
        </span>
        <LandingSignInLink />
      </header>

      <main className="flex min-h-screen items-center justify-center px-6">
        <div className="flex w-full max-w-[28rem] flex-col items-center text-center">
          <h1 className="text-4xl font-semibold tracking-tight">Trust drafts</h1>
          <p className="mt-4 text-[#5c6570]">
            Intake and review for estate planning matters.
          </p>
          <div className="mt-8">
            <LandingSignInLink />
          </div>
        </div>
      </main>
    </div>
  );
}
