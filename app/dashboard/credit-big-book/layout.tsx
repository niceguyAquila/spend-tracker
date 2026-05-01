import { redirect } from "next/navigation";
import { requireAllowedUser } from "@/lib/auth";

export default async function CreditBigBookLayout({
  children
}: {
  children: React.ReactNode;
}) {
  const { globalRole } = await requireAllowedUser();
  if (globalRole !== "admin") {
    redirect("/dashboard");
  }

  return <div className="space-y-6">{children}</div>;
}
