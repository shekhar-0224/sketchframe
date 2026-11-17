import { currentUser } from "@/lib/auth";
import { Dashboard } from "@/components/dashboard/dashboard";
import { Landing } from "@/components/landing/landing";

/** Signed-out visitors get the public landing page; everyone else (guests included) the dashboard. */
export default async function Home() {
  const user = await currentUser();
  return user ? <Dashboard /> : <Landing />;
}
