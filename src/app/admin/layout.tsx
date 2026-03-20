import { redirect } from "next/navigation";
import { requireAuthedUser } from "@/lib/auth/requireAuthedUser";

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  try {
    await requireAuthedUser();
  } catch {
    redirect("/login");
  }

  return <>{children}</>;
}

