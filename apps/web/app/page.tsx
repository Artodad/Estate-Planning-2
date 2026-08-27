import { auth } from "@clerk/nextjs/server";
import { redirect } from "next/navigation";

import { LandingDoor } from "@/components/landing-door";

export default async function Page() {
  const { userId } = await auth();

  if (userId) {
    redirect("/dashboard");
  }

  return <LandingDoor />;
}
