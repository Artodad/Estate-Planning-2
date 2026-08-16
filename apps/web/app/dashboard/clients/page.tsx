import { redirect } from "next/navigation";

import { getCurrentAuthContext } from "@/features/auth/server/get-current-auth";
import { requireRole } from "@/features/auth/server/rbac";
import { OWNER_STAFF } from "@/features/auth";

import { ClientsList } from "@/features/dashboard/components/clients/ClientsList";
import { getClientsForCurrentFirm } from "@/features/dashboard/server/actions";

/**
 * /dashboard/clients
 *
 * Thin Server Component: auth + OWNER_STAFF, then the interactive clients list.
 * Real rows are passed through when the firm has clients; otherwise the list
 * shows clearly labeled sample matters.
 */
export default async function ClientsPage() {
  const authContext = await getCurrentAuthContext();
  if (!authContext?.userId) {
    redirect("/sign-in");
  }

  await requireRole([...OWNER_STAFF], {
    redirectTo: "/dashboard?error=insufficient-permissions",
    errorMessage: "Clients section is available to owners and staff only.",
  });

  let realClients: any[] | undefined = undefined;
  try {
    const result = await getClientsForCurrentFirm();
    if (result && "success" in result && result.success && result.clients?.length) {
      realClients = result.clients;
    }
  } catch {
    realClients = undefined;
  }

  return (
    <div className="space-y-6">
      <ClientsList initialRealClients={realClients} />
    </div>
  );
}
