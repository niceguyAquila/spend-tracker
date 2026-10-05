"use client";

import {
  BigBookVendorActorOutstandingTable,
  type OutstandingDetailFilters
} from "@/components/big-book-vendor-actor-outstanding-table";
import type { BigBookVendorActorOutstandingRow } from "@/lib/types";

type Props = {
  rows: BigBookVendorActorOutstandingRow[];
  detailFilters?: OutstandingDetailFilters;
  onActualized?: () => void;
};

/** Future Credit outstanding: settle/invoice allowed; Actualize remains optional. */
export function BigBookVendorActorOutstandingFutureTable({
  rows,
  detailFilters,
  onActualized
}: Props) {
  return (
    <BigBookVendorActorOutstandingTable
      rows={rows}
      detailFilters={detailFilters}
      creditKind="future"
      onSettled={onActualized}
    />
  );
}
