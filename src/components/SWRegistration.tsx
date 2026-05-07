"use client";

import { useEffect } from "react";

export function SWRegistration() {
  useEffect(() => {
    if (
      typeof window === "undefined" ||
      !("serviceWorker" in navigator) ||
      process.env.NODE_ENV !== "production"
    ) {
      return;
    }
    navigator.serviceWorker.register("/sw.js", { scope: "/" }).catch((err) => {
      console.error("SW registration failed:", err);
    });
  }, []);

  return null;
}
