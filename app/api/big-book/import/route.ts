import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { requireAdminApi } from "@/lib/auth-api";
import { assertCsrfAndOrigin } from "@/lib/security/origin";
import { parseBigBookCsv } from "@/lib/big-book/csv";
import { bigBookEntryInputSchema } from "@/lib/validation/big-book";

type NameToIdMap = Map<string, string>;

function normalizeLookupKey(value: string) {
  return value.trim().toLowerCase();
}

export async function POST(request: Request) {
  if (!(await assertCsrfAndOrigin(request))) {
    return NextResponse.json({ error: "Invalid request origin or CSRF token." }, { status: 403 });
  }

  const authCheck = await requireAdminApi();
  if (!authCheck.ok) {
    return NextResponse.json({ error: authCheck.message }, { status: authCheck.status });
  }

  const formData = await request.formData();
  const file = formData.get("file");
  if (!(file instanceof File)) {
    return NextResponse.json({ error: "CSV file is required." }, { status: 400 });
  }

  const content = await file.text();
  const parsed = parseBigBookCsv(content);
  if (parsed.errors.length > 0) {
    return NextResponse.json(
      {
        ok: false,
        message: "Validation failed",
        errors: parsed.errors,
        total_rows: parsed.rows.length
      },
      { status: 400 }
    );
  }
  if (!parsed.rows.length) {
    return NextResponse.json({ error: "No data rows found in CSV." }, { status: 400 });
  }

  const supabase = await createClient();

  const [
    { data: types, error: typesError },
    { data: actors, error: actorsError },
    { data: subTypes, error: subTypesError },
    { data: vendorTypes, error: vendorTypesError },
    { data: vendors, error: vendorsError },
    { data: pockets, error: pocketsError }
  ] = await Promise.all([
    supabase.from("business_ledger_types").select("id,name").eq("is_active", true),
    supabase.from("big_book_actors").select("id,display_name"),
    supabase
      .from("business_ledger_sub_types")
      .select("id,name,entry_type_id")
      .eq("is_active", true),
    supabase.from("business_ledger_vendor_types").select("id,name").eq("is_active", true),
    supabase
      .from("business_ledger_vendors")
      .select("id,name,vendor_type_id")
      .eq("is_active", true),
    supabase
      .from("big_book_actor_pockets")
      .select("id,name,actor_id")
      .eq("is_active", true)
  ]);

  if (typesError || actorsError || subTypesError || vendorTypesError || vendorsError || pocketsError) {
    return NextResponse.json(
      {
        error:
          typesError?.message ??
          actorsError?.message ??
          subTypesError?.message ??
          vendorTypesError?.message ??
          vendorsError?.message ??
          pocketsError?.message ??
          "Failed to load import references."
      },
      { status: 400 }
    );
  }

  const typeNameToId: NameToIdMap = new Map((types ?? []).map((row) => [normalizeLookupKey(row.name), row.id]));
  const actorNameToId: NameToIdMap = new Map((actors ?? []).map((row) => [normalizeLookupKey(row.display_name), row.id]));
  // sub-type lookup is keyed by `${entry_type_id}::${lower(sub_type_name)}`
  // because sub-type names are unique only within a given parent type.
  const subTypeKeyToId: NameToIdMap = new Map(
    (subTypes ?? []).map((row) => [
      `${row.entry_type_id}::${normalizeLookupKey(row.name)}`,
      row.id
    ])
  );
  const vendorTypeNameToId: NameToIdMap = new Map(
    (vendorTypes ?? []).map((row) => [normalizeLookupKey(row.name), row.id])
  );
  const vendorKeyToId: NameToIdMap = new Map(
    (vendors ?? []).map((row) => [
      `${row.vendor_type_id}::${normalizeLookupKey(row.name)}`,
      row.id
    ])
  );
  const pocketKeyToId: NameToIdMap = new Map(
    (pockets ?? []).map((row) => [
      `${row.actor_id}::${normalizeLookupKey(row.name)}`,
      row.id
    ])
  );

  const validationErrors: string[] = [];
  const records = parsed.rows.map((row, index) => {
    const lineNumber = index + 2;
    const entryTypeId = typeNameToId.get(normalizeLookupKey(row.type_name));
    const actorId = actorNameToId.get(normalizeLookupKey(row.actor_name));
    let entrySubTypeId: string | null = null;
    if (row.sub_type_name) {
      if (!entryTypeId) {
        // skip — we'll already report the type_name error below
      } else {
        const subKey = `${entryTypeId}::${normalizeLookupKey(row.sub_type_name)}`;
        const matchedId = subTypeKeyToId.get(subKey);
        if (!matchedId) {
          validationErrors.push(
            `Row ${lineNumber}: sub_type_name '${row.sub_type_name}' is not available under type '${row.type_name}'.`
          );
        } else {
          entrySubTypeId = matchedId;
        }
      }
    }

    let vendorTypeId: string | null = null;
    let vendorId: string | null = null;
    if (row.vendor_type_name) {
      vendorTypeId = vendorTypeNameToId.get(normalizeLookupKey(row.vendor_type_name)) ?? null;
      if (!vendorTypeId) {
        validationErrors.push(
          `Row ${lineNumber}: vendor_type_name '${row.vendor_type_name}' is not available.`
        );
      }
    }
    if (row.vendor_name) {
      if (!vendorTypeId) {
        // skip when vendor type is missing/invalid — already reported above or by CSV parser
      } else {
        const vendorKey = `${vendorTypeId}::${normalizeLookupKey(row.vendor_name)}`;
        const matchedVendorId = vendorKeyToId.get(vendorKey);
        if (!matchedVendorId) {
          validationErrors.push(
            `Row ${lineNumber}: vendor_name '${row.vendor_name}' is not available under vendor type '${row.vendor_type_name}'.`
          );
        } else {
          vendorId = matchedVendorId;
        }
      }
    }

    let pocketId: string | null = null;
    if (row.pocket_name) {
      if (!actorId) {
        // skip — actor error reported below
      } else {
        const pocketKey = `${actorId}::${normalizeLookupKey(row.pocket_name)}`;
        const matchedPocketId = pocketKeyToId.get(pocketKey);
        if (!matchedPocketId) {
          validationErrors.push(
            `Row ${lineNumber}: pocket_name '${row.pocket_name}' is not available under actor '${row.actor_name}'.`
          );
        } else {
          pocketId = matchedPocketId;
        }
      }
    }

    if (!entryTypeId) {
      validationErrors.push(`Row ${lineNumber}: type_name '${row.type_name}' is not available.`);
    }
    if (!actorId) {
      validationErrors.push(`Row ${lineNumber}: actor_name '${row.actor_name}' is not available.`);
    }

    return {
      entry_date: row.entry_date,
      entry_direction: row.entry_direction,
      entry_type_id: entryTypeId ?? "",
      entry_sub_type_id: entrySubTypeId,
      vendor_type_id: vendorTypeId,
      vendor_id: vendorId,
      pocket_id: pocketId,
      explanation: row.explanation,
      amount: row.amount,
      currency_code: row.currency_code,
      remark: row.remark ?? "",
      responsible_actor_id: actorId ?? "",
      group_label: row.group_label,
      group_remark: row.group_remark
    };
  });

  for (let index = 0; index < records.length; index += 1) {
    const lineNumber = index + 2;
    const row = records[index];
    const schemaValidation = bigBookEntryInputSchema.safeParse(row);
    if (!schemaValidation.success) {
      const flattened = schemaValidation.error.flatten();
      const fieldError =
        Object.values(flattened.fieldErrors)
          .flat()
          .find((value) => typeof value === "string") ??
        flattened.formErrors.find((value) => typeof value === "string");
      validationErrors.push(`Row ${lineNumber}: ${fieldError ?? "invalid row data."}`);
    }
  }

  // Within one file, each distinct group_label becomes one group. A label used
  // on only a single row is rejected — groups must contain at least two members.
  const groupLabelCounts = new Map<string, number>();
  for (const row of records) {
    if (!row.group_label) continue;
    const key = normalizeLookupKey(row.group_label);
    groupLabelCounts.set(key, (groupLabelCounts.get(key) ?? 0) + 1);
  }
  for (const [key, count] of groupLabelCounts) {
    if (count < 2) {
      validationErrors.push(
        `group_label '${key}' appears on only ${count} row(s); a group needs at least 2 transactions.`
      );
    }
  }

  if (validationErrors.length > 0) {
    return NextResponse.json(
      {
        ok: false,
        message: "Validation failed",
        errors: validationErrors,
        total_rows: records.length
      },
      { status: 400 }
    );
  }

  const groupIdByLabel = new Map<string, string>();
  const groupRemarkByLabel = new Map<string, string | null>();
  for (const row of records) {
    if (!row.group_label) continue;
    const key = normalizeLookupKey(row.group_label);
    if (!groupRemarkByLabel.has(key) && row.group_remark) {
      groupRemarkByLabel.set(key, row.group_remark);
    } else if (!groupRemarkByLabel.has(key)) {
      groupRemarkByLabel.set(key, null);
    }
  }

  for (const [key, remark] of groupRemarkByLabel) {
    const labelSource = records.find(
      (row) => row.group_label && normalizeLookupKey(row.group_label) === key
    )?.group_label;
    if (!labelSource) continue;

    const { data: group, error: groupError } = await supabase
      .from("business_ledger_entry_groups")
      .insert({
        label: labelSource,
        remark,
        created_by: authCheck.user.id,
        updated_by: authCheck.user.id
      })
      .select("id")
      .single();

    if (groupError || !group) {
      return NextResponse.json(
        { error: groupError?.message ?? `Failed to create group '${labelSource}'.` },
        { status: 400 }
      );
    }
    groupIdByLabel.set(key, group.id);
  }

  const { error } = await supabase.from("business_ledger_entries").insert(
    records.map((row) => {
      const groupId = row.group_label
        ? groupIdByLabel.get(normalizeLookupKey(row.group_label)) ?? null
        : null;
      return {
        entry_date: row.entry_date,
        entry_direction: row.entry_direction,
        entry_type_id: row.entry_type_id,
        entry_sub_type_id: row.entry_sub_type_id,
        vendor_type_id: row.vendor_type_id,
        vendor_id: row.vendor_id,
        pocket_id: row.pocket_id,
        explanation: row.explanation,
        amount: row.amount,
        currency_code: row.currency_code,
        remark: row.remark || null,
        responsible_actor_id: row.responsible_actor_id,
        group_id: groupId,
        created_by: authCheck.user.id,
        updated_by: authCheck.user.id
      };
    })
  );

  if (error) {
    if (groupIdByLabel.size) {
      await supabase
        .from("business_ledger_entry_groups")
        .delete()
        .in("id", [...groupIdByLabel.values()]);
    }
    return NextResponse.json({ error: error.message }, { status: 400 });
  }

  return NextResponse.json({
    ok: true,
    processed: records.length,
    total_rows: records.length,
    groups_created: groupIdByLabel.size
  });
}
