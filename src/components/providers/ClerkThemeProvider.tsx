"use client";

import { ClerkProvider } from "@clerk/nextjs";
import { esES } from "@clerk/localizations";
import { useTheme } from "next-themes";

const darkVars = {
  colorPrimary: "#4ADE80",
  colorBackground: "#060e18",
  colorInputBackground: "#182535",
  colorText: "#F5F5F5",
  colorTextOnPrimaryBackground: "#052e16",
} as const;

const lightVars = {
  colorPrimary: "#4ADE80",
  colorBackground: "#ffffff",
  colorInputBackground: "#f4f4f5",
  colorText: "#18181b",
  colorTextOnPrimaryBackground: "#052e16",
} as const;

export function ClerkThemeProvider({ children }: { children: React.ReactNode }) {
  const { resolvedTheme } = useTheme();
  // resolvedTheme es undefined antes de hidratar — usa dark (defaultTheme)
  const vars = resolvedTheme === "light" ? lightVars : darkVars;

  return (
    <ClerkProvider localization={esES} appearance={{ variables: vars }}>
      {children}
    </ClerkProvider>
  );
}
