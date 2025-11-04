"use client";

import { useEffect, useRef } from "react";

export function useLockBody(locked: boolean) {
  const previousOverflow = useRef<string | null>(null);

  useEffect(() => {
    if (typeof document === "undefined") {
      return;
    }

    const body = document.body;

    if (locked) {
      if (previousOverflow.current === null) {
        previousOverflow.current = body.style.overflow;
      }
      body.style.overflow = "hidden";
    } else if (previousOverflow.current !== null) {
      body.style.overflow = previousOverflow.current;
      previousOverflow.current = null;
    }

    return () => {
      if (previousOverflow.current !== null) {
        body.style.overflow = previousOverflow.current;
        previousOverflow.current = null;
      }
    };
  }, [locked]);
}
