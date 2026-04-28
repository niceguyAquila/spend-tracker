"use client";

import { useEffect, useState } from "react";
import Image from "next/image";

type Theme = "light" | "dark";
type ThemeToggleProps = {
  compact?: boolean;
};

function resolveInitialTheme(): Theme {
  if (typeof window === "undefined") {
    return "light";
  }

  const storedTheme = window.localStorage.getItem("theme");
  if (storedTheme === "light" || storedTheme === "dark") {
    return storedTheme;
  }

  return window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
}

export function ThemeToggle({ compact = false }: ThemeToggleProps) {
  const [theme, setTheme] = useState<Theme>("light");

  useEffect(() => {
    const nextTheme = resolveInitialTheme();
    document.documentElement.classList.toggle("dark", nextTheme === "dark");
    setTheme(nextTheme);
  }, []);

  function toggleTheme() {
    setTheme((currentTheme) => {
      const nextTheme = currentTheme === "dark" ? "light" : "dark";
      document.documentElement.classList.toggle("dark", nextTheme === "dark");
      window.localStorage.setItem("theme", nextTheme);
      return nextTheme;
    });
  }

  return (
    <button
      type="button"
      onClick={toggleTheme}
      className={`group inline-flex items-center rounded-full border border-[rgb(var(--border))] bg-[rgb(var(--surface))] text-xs font-medium text-[rgb(var(--text))] shadow-sm transition-all duration-200 hover:-translate-y-[1px] hover:bg-[rgb(var(--surface-muted))] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[rgb(var(--primary))] focus-visible:ring-offset-2 focus-visible:ring-offset-[rgb(var(--surface))] ${
        compact ? "h-9 w-9 justify-center p-0" : "h-9 gap-2 px-2 py-1"
      }`}
      aria-label={theme === "dark" ? "Switch to light mode" : "Switch to dark mode"}
      title={theme === "dark" ? "Light mode" : "Dark mode"}
    >
      <span className="inline-flex h-6 w-6 items-center justify-center overflow-hidden rounded-full border border-[rgb(var(--border))] bg-[rgb(var(--surface-muted))]">
        <Image
          src={theme === "dark" ? "/asset/light-mode.png" : "/asset/night-mode.png"}
          alt=""
          width={18}
          height={18}
          className="h-[18px] w-[18px] object-contain"
          aria-hidden="true"
        />
      </span>
      {!compact ? <span className="pr-1 text-xs font-semibold">{theme === "dark" ? "Light mode" : "Dark mode"}</span> : null}
    </button>
  );
}
