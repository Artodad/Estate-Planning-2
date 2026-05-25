import Link from "next/link";
import { Show } from "@clerk/nextjs";

import { LandingAuthActions } from "@/components/landing-auth-actions";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";

const FEATURES = [
  {
    title: "Firm-ready auth",
    description:
      "Clerk Organizations map cleanly to law firms, with roles for owners, staff, and clients.",
  },
  {
    title: "Adaptive intake",
    description:
      "XState-powered questionnaires adapt to each client's family, assets, and planning goals.",
  },
  {
    title: "Document fidelity",
    description:
      "Generate attorney-branded .docx packages from existing templates with docxtemplater.",
  },
];

export default function Page() {
  return (
    <main className="mx-auto flex min-h-screen max-w-5xl flex-col gap-10 px-6 pb-16 pt-28">
      <section className="space-y-6">
        <p className="text-sm font-medium uppercase tracking-[0.2em] text-muted-foreground">
          Phase 0 foundation
        </p>
        <div className="space-y-4">
          <h1 className="max-w-3xl text-4xl font-semibold tracking-tight md:text-5xl">
            Estate Planning Engine
          </h1>
          <p className="max-w-2xl text-lg text-muted-foreground">
            A modern intake and document platform for estate planning attorneys.
            Sign in to start testing Clerk authentication and firm context.
          </p>
        </div>

        <LandingAuthActions />
      </section>

      <section className="grid gap-4 md:grid-cols-3">
        {FEATURES.map((feature) => (
          <Card key={feature.title}>
            <CardHeader>
              <CardTitle>{feature.title}</CardTitle>
              <CardDescription>{feature.description}</CardDescription>
            </CardHeader>
            <CardContent />
          </Card>
        ))}
      </section>
    </main>
  );
}
