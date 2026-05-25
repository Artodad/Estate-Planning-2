import "./globals.css";
import type { Metadata } from "next";
import { Geist } from "next/font/google";
import { ClerkProvider } from "@clerk/nextjs";
import { shadcn } from "@clerk/ui/themes";

import { AuthHeader } from "@/components/auth-header";

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
          {children}
        </ClerkProvider>
      </body>
    </html>
  );
}
