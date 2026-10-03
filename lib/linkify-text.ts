import { createElement, type ReactNode } from "react";

const URL_SPLIT_RE = /(https?:\/\/[^\s]+)/g;
const TRAILING_PUNCT_RE = /[.,;:!?)\]}'"]+$/;

export type LinkifyPart =
  | { type: "text"; value: string }
  | { type: "url"; value: string };

/**
 * Split plain text on http(s) URLs so callers can render links.
 * Trailing punctuation after a URL stays as adjacent text.
 */
export function splitLinkifyParts(text: string): LinkifyPart[] {
  if (!text) return [];

  const parts: LinkifyPart[] = [];
  let lastIndex = 0;

  for (const match of text.matchAll(URL_SPLIT_RE)) {
    const raw = match[0];
    const start = match.index ?? 0;
    const trailingPunct = raw.match(TRAILING_PUNCT_RE)?.[0] ?? "";
    const url = trailingPunct ? raw.slice(0, -trailingPunct.length) : raw;

    if (start > lastIndex) {
      parts.push({ type: "text", value: text.slice(lastIndex, start) });
    }
    if (url) {
      parts.push({ type: "url", value: url });
    }
    if (trailingPunct) {
      parts.push({ type: "text", value: trailingPunct });
    }
    lastIndex = start + raw.length;
  }

  if (lastIndex < text.length) {
    parts.push({ type: "text", value: text.slice(lastIndex) });
  }

  return parts.length > 0 ? parts : [{ type: "text", value: text }];
}

type LinkifyTextProps = {
  text: string;
  className?: string;
};

/** Render text with http(s) URLs as external links. */
export function LinkifyText({ text, className }: LinkifyTextProps): ReactNode {
  const parts = splitLinkifyParts(text);
  if (parts.length === 0) return null;

  return parts.map((part, index) =>
    part.type === "url"
      ? createElement(
          "a",
          {
            key: `url-${index}`,
            href: part.value,
            target: "_blank",
            rel: "noopener noreferrer",
            className: className ?? "text-[rgb(var(--info))] underline"
          },
          part.value
        )
      : createElement("span", { key: `text-${index}` }, part.value)
  );
}
