import { z } from "zod";
import { ENTITY_CODE_MAX_LENGTH, ENTITY_CODE_PATTERN, ENTITY_CODE_RULE } from "@/lib/entity-code";

export function entityCodeSchema(label = "Code") {
  return z
    .string({
      required_error: `${label} is required.`,
      invalid_type_error: `${label} is required.`
    })
    .trim()
    .min(2, `${label} must be at least 2 characters.`)
    .max(ENTITY_CODE_MAX_LENGTH, `${label} must be ${ENTITY_CODE_MAX_LENGTH} characters or fewer.`)
    .regex(ENTITY_CODE_PATTERN, `${label} must use ${ENTITY_CODE_RULE}`);
}

export function entityNameSchema(label = "Name", maxLength = 100) {
  return z
    .string({
      required_error: `${label} is required.`,
      invalid_type_error: `${label} is required.`
    })
    .trim()
    .min(2, `${label} must be at least 2 characters.`)
    .max(maxLength, `${label} must be ${maxLength} characters or fewer.`);
}

export function entitySortOrderSchema(label = "Sort order") {
  return z.coerce
    .number({ invalid_type_error: `${label} must be a number.` })
    .int(`${label} must be a whole number.`)
    .min(0, `${label} must be 0 or greater.`)
    .max(9999, `${label} must be 9999 or lower.`)
    .optional();
}
