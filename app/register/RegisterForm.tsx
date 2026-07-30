"use client";

import { useMemo, useState } from "react";
import type { MatchTag } from "@/lib/match-data";
import { LISTING_KINDS, COST_TYPES } from "@/lib/schemas";
import styles from "./register.module.css";

/**
 * Client form for org self-registration (BUILD_PROMPT §4). Posts to /api/register (Zod-validated,
 * rate-limited) which files a `pending` listing into the moderation queue. Requires ≥ 1 interest
 * tag. `desired_archetypes` is the org's own preference (ranking only) — not student personality.
 */
const KIND_LABEL: Record<string, string> = {
  program: "Program",
  company: "Company",
  opportunity: "Opportunity",
  camp: "Camp",
  research_lab: "Research Lab",
};

export default function RegisterForm({
  catalog,
  archetypes,
}: {
  catalog: { domain: string; tags: MatchTag[] }[];
  archetypes: { slug: string; label: string }[];
}) {
  const [form, setForm] = useState({
    title: "",
    kind: "program",
    short_description: "",
    url: "",
    apply_url: "",
    linkedin_url: "",
    location_name: "",
    is_remote: false,
    cost_type: "unknown",
    grade_min: "",
    grade_max: "",
    org_name: "",
    contact_email: "",
  });
  const [tags, setTags] = useState<Set<string>>(new Set());
  const [archs, setArchs] = useState<Set<string>>(new Set());
  const [tagQuery, setTagQuery] = useState("");
  const [status, setStatus] = useState<"idle" | "submitting" | "done">("idle");
  const [error, setError] = useState<string | null>(null);

  const set = (k: string, v: string | boolean) => setForm((f) => ({ ...f, [k]: v }));
  const toggle = (s: Set<string>, setS: (n: Set<string>) => void, v: string) => {
    const n = new Set(s);
    n.has(v) ? n.delete(v) : n.add(v);
    setS(n);
  };

  const filteredCatalog = useMemo(() => {
    const q = tagQuery.trim().toLowerCase();
    if (!q) return catalog;
    return catalog
      .map((g) => ({ ...g, tags: g.tags.filter((t) => t.label.toLowerCase().includes(q)) }))
      .filter((g) => g.tags.length > 0);
  }, [catalog, tagQuery]);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (tags.size === 0) {
      setError("Pick at least one interest tag so students can find you.");
      return;
    }
    setStatus("submitting");
    const payload = {
      ...form,
      grade_min: form.grade_min ? Number(form.grade_min) : null,
      grade_max: form.grade_max ? Number(form.grade_max) : null,
      tag_slugs: [...tags],
      desired_archetypes: [...archs],
    };
    try {
      const res = await fetch("/api/register", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(payload),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error ?? "Submission failed.");
        setStatus("idle");
        return;
      }
      setStatus("done");
    } catch {
      setError("Network error — please try again.");
      setStatus("idle");
    }
  }

  if (status === "done") {
    return (
      <div className={styles.done}>
        <h2>Thanks — you&apos;re in the queue ✅</h2>
        <p>
          Your listing was submitted for review. It won&apos;t appear in search until an admin
          approves it. You can close this page.
        </p>
      </div>
    );
  }

  return (
    <form className={styles.form} onSubmit={submit}>
      <div className={styles.grid}>
        <label className={styles.field}>
          Name *
          <input required value={form.title} onChange={(e) => set("title", e.target.value)} maxLength={160} />
        </label>
        <label className={styles.field}>
          Type *
          <select value={form.kind} onChange={(e) => set("kind", e.target.value)}>
            {LISTING_KINDS.map((k) => (
              <option key={k} value={k}>
                {KIND_LABEL[k]}
              </option>
            ))}
          </select>
        </label>
      </div>

      <label className={styles.field}>
        Short description * <span className={styles.hint}>({form.short_description.length}/300)</span>
        <textarea
          required
          rows={3}
          maxLength={300}
          value={form.short_description}
          onChange={(e) => set("short_description", e.target.value)}
        />
      </label>

      <div className={styles.grid}>
        <label className={styles.field}>
          Website
          <input type="url" placeholder="https://" value={form.url} onChange={(e) => set("url", e.target.value)} />
        </label>
        <label className={styles.field}>
          Apply URL
          <input type="url" placeholder="https://" value={form.apply_url} onChange={(e) => set("apply_url", e.target.value)} />
        </label>
        <label className={styles.field}>
          LinkedIn
          <input type="url" placeholder="https://" value={form.linkedin_url} onChange={(e) => set("linkedin_url", e.target.value)} />
        </label>
      </div>

      <div className={styles.grid}>
        <label className={styles.field}>
          Location
          <input
            placeholder="City, State"
            value={form.location_name}
            onChange={(e) => set("location_name", e.target.value)}
            disabled={form.is_remote}
          />
        </label>
        <label className={styles.checkfield}>
          <input type="checkbox" checked={form.is_remote} onChange={(e) => set("is_remote", e.target.checked)} />
          Remote
        </label>
        <label className={styles.field}>
          Cost
          <select value={form.cost_type} onChange={(e) => set("cost_type", e.target.value)}>
            {COST_TYPES.map((c) => (
              <option key={c} value={c}>
                {c}
              </option>
            ))}
          </select>
        </label>
      </div>

      <div className={styles.grid}>
        <label className={styles.field}>
          Grade min
          <input type="number" min={1} max={13} value={form.grade_min} onChange={(e) => set("grade_min", e.target.value)} />
        </label>
        <label className={styles.field}>
          Grade max
          <input type="number" min={1} max={13} value={form.grade_max} onChange={(e) => set("grade_max", e.target.value)} />
        </label>
        <label className={styles.field}>
          Organization
          <input value={form.org_name} onChange={(e) => set("org_name", e.target.value)} maxLength={160} />
        </label>
      </div>

      <fieldset className={styles.fieldset}>
        <legend>Interest tags * <span className={styles.hint}>({tags.size} selected)</span></legend>
        <input
          className={styles.search}
          type="search"
          placeholder="Search tags…"
          value={tagQuery}
          onChange={(e) => setTagQuery(e.target.value)}
        />
        <div className={styles.chipScroll}>
          {filteredCatalog.map((g) => (
            <div key={g.domain}>
              <div className={styles.domainName}>{g.domain}</div>
              <div className={styles.chips}>
                {g.tags.map((t) => (
                  <button
                    key={t.slug}
                    type="button"
                    className={`${styles.chip} ${tags.has(t.slug) ? styles.chipOn : ""}`}
                    onClick={() => toggle(tags, setTags, t.slug)}
                  >
                    {t.label}
                  </button>
                ))}
              </div>
            </div>
          ))}
        </div>
      </fieldset>

      <fieldset className={styles.fieldset}>
        <legend>Personalities you&apos;re seeking <span className={styles.hint}>(optional, helps ranking)</span></legend>
        <div className={styles.chips}>
          {archetypes.map((a) => (
            <button
              key={a.slug}
              type="button"
              className={`${styles.chip} ${archs.has(a.slug) ? styles.chipOn : ""}`}
              onClick={() => toggle(archs, setArchs, a.slug)}
            >
              {a.label}
            </button>
          ))}
        </div>
      </fieldset>

      {error && <p className={styles.error}>{error}</p>}

      <button className={styles.submit} type="submit" disabled={status === "submitting"}>
        {status === "submitting" ? "Submitting…" : "Submit for review"}
      </button>
    </form>
  );
}
