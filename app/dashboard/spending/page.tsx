import { redirect } from "next/navigation";

export default function SpendingIndexPage() {
  redirect("/dashboard/spending/overview");
}
