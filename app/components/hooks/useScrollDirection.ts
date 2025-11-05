"use client";

import { useEffect, useRef, useState } from "react";

export type ScrollDirection = "up" | "down";

interface UseScrollDirectionOptions {
  threshold?: number;
  initialDirection?: ScrollDirection;
}

const DEFAULT_THRESHOLD = 8;

export function useScrollDirection(
  options: UseScrollDirectionOptions = {}
): ScrollDirection {
  const { threshold = DEFAULT_THRESHOLD, initialDirection = "up" } = options;
  const [direction, setDirection] = useState<ScrollDirection>(initialDirection);
  const lastYRef = useRef<number>(0);
  const directionRef = useRef<ScrollDirection>(initialDirection);

  useEffect(() => {
    lastYRef.current = window.scrollY;

    const handleScroll = () => {
      const currentY = window.scrollY;
      const lastY = lastYRef.current;
      const delta = currentY - lastY;

      if (Math.abs(delta) <= threshold) {
        return;
      }

      const nextDirection: ScrollDirection = delta > 0 ? "down" : "up";

      if (directionRef.current !== nextDirection) {
        directionRef.current = nextDirection;
        setDirection(nextDirection);
      }

      lastYRef.current = currentY <= 0 ? 0 : currentY;
    };

    const handleScrollThrottled = () => {
      window.requestAnimationFrame(handleScroll);
    };

    window.addEventListener("scroll", handleScrollThrottled, { passive: true });

    return () => {
      window.removeEventListener("scroll", handleScrollThrottled);
    };
  }, [threshold]);

  return direction;
}
