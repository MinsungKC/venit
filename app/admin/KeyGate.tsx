"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import styles from "./admin.module.css";

/** Minimal admin-key gate — navigates to /admin?key=… so the server can authorize. */
export default function KeyGate() {
  const router = useRouter();
  const [key, setKey] = useState("");
  return (
    <form
      className={styles.gate}
      onSubmit={(e) => {
        e.preventDefault();
        router.push(`/admin?key=${encodeURIComponent(key)}`);
      }}
    >
      <input
        type="password"
        placeholder="Admin key"
        value={key}
        onChange={(e) => setKey(e.target.value)}
        aria-label="Admin key"
      />
      <button type="submit">Enter</button>
    </form>
  );
}
