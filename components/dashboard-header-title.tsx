"use client";

import { usePathname } from "next/navigation";

type Props = {
  activeBrandName: string;
};

const GLOBAL_ADMIN_PREFIX_ROUTES = [
  "/dashboard/master-dashboard",
  "/dashboard/big-book",
  "/dashboard/admin/users",
  "/dashboard/admin/brands"
];

export function DashboardHeaderTitle({ activeBrandName }: Props) {
  const pathname = usePathname();
  const useGlobalTitle = GLOBAL_ADMIN_PREFIX_ROUTES.some((route) => pathname.startsWith(route));
  const title = useGlobalTitle ? "Finance Operations Hub" : `${activeBrandName} Finance Operations Hub`;

  return <h1 className="text-2xl font-semibold">{title}</h1>;
}

