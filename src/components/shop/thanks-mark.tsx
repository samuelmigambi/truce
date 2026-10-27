"use client";

import { motion } from "motion/react";
import { duration, ease, spring } from "../motion";

/** A check that draws itself inside a warm circle. */
export function ThanksMark() {
  return (
    <motion.svg
      viewBox="0 0 64 64"
      className="size-16"
      aria-hidden
      initial={{ scale: 0.6, opacity: 0 }}
      animate={{ scale: 1, opacity: 1 }}
      transition={spring.pop}
    >
      <circle cx="32" cy="32" r="30" fill="#A7472B" />
      <motion.path
        d="M20 33.5 L28.5 42 L45 24"
        fill="none"
        stroke="#FBE2B4"
        strokeWidth="4.5"
        strokeLinecap="round"
        strokeLinejoin="round"
        initial={{ pathLength: 0 }}
        animate={{ pathLength: 1 }}
        transition={{ duration: duration.slower, ease: ease.out, delay: 0.25 }}
      />
    </motion.svg>
  );
}
