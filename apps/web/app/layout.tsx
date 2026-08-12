import "./globals.css";
import type { Metadata } from "next";
import { Geist } from "next/font/google";
import { ClerkProvider, Show } from "@clerk/nextjs";
import { shadcn } from "@clerk/ui/themes";
import { Toaster } from "sonner";

import { AuthHeader } from "@/components/auth-header";
import { GlobalFirmHydrator } from "@/features/auth";

const geist = Geist({ subsets: ["latin"] });

export const metadata: Metadata = {
  title: "Estate Planning Engine",
  description: "Multi-tenant SaaS for estate planning attorneys",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body className={geist.className}>
        <ClerkProvider appearance={{ theme: shadcn }}>
          <AuthHeader />
          <Show when="signed-in">
            <GlobalFirmHydrator />
          </Show>
          {children}
          <Toaster position="top-center" richColors closeButton />
        </ClerkProvider>
      </body>
    </html>
  );
}
