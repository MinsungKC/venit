"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import styles from "./globe.module.css";

interface Point {
  slug: string;
  title: string;
  kind: string;
  lat: number;
  lng: number;
  location: string;
}
interface Suggestion {
  label: string;
  lat: number;
  lng: number;
}
interface GlobeDatum {
  lat: number;
  lng: number;
  color: string;
  radius: number;
  altitude: number;
  slug?: string;
  title: string;
  user?: boolean;
}
// globe.gl exposes a fluent instance; typed loosely (its own types don't chain cleanly here).
// eslint in this project isn't configured for no-explicit-any, so a bare `any` is fine.
type GlobeInstance = any;

const KIND_LABEL: Record<string, string> = {
  company: "Company",
  research_lab: "Research Lab",
  program: "Program",
  opportunity: "Opportunity",
  camp: "Camp",
  volunteer: "Volunteering",
};
const KIND_COLOR: Record<string, string> = {
  company: "#6366f1",
  research_lab: "#a855f7",
  program: "#f59e0b",
  camp: "#f97316",
  opportunity: "#10b981",
  volunteer: "#ec4899",
};

const TEXTURE = "https://unpkg.com/three-globe/example/img/earth-blue-marble.jpg";
const BUMP = "https://unpkg.com/three-globe/example/img/earth-topology.png";

function milesBetween(aLat: number, aLng: number, bLat: number, bLng: number): number {
  const R = 3958.8;
  const toRad = (x: number) => (x * Math.PI) / 180;
  const dLat = toRad(bLat - aLat);
  const dLng = toRad(bLng - aLng);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(aLat)) * Math.cos(toRad(bLat)) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.min(1, Math.sqrt(h)));
}

export default function GlobeView({
  points,
  totalMatches,
  backHref,
}: {
  points: Point[];
  totalMatches: number;
  backHref: string;
}) {
  const containerRef = useRef<HTMLDivElement>(null);
  const stageRef = useRef<HTMLDivElement>(null);
  const worldRef = useRef<GlobeInstance>(null);
  const [dim, setDim] = useState(440);

  const [query, setQuery] = useState("");
  const [suggestions, setSuggestions] = useState<Suggestion[]>([]);
  const [userLoc, setUserLoc] = useState<Suggestion | null>(null);
  const [radiusMi, setRadiusMi] = useState(50);
  const [searching, setSearching] = useState(false);

  const visible = useMemo(() => {
    if (!userLoc) return points;
    return points
      .map((p) => ({ p, d: milesBetween(userLoc.lat, userLoc.lng, p.lat, p.lng) }))
      .filter((x) => x.d <= radiusMi)
      .sort((a, b) => a.d - b.d)
      .map((x) => x.p);
  }, [points, userLoc, radiusMi]);

  const nearest = useMemo(() => visible.slice(0, 40), [visible]);

  const globeData = useMemo<GlobeDatum[]>(
    () =>
      visible.slice(0, 600).map((p) => ({
        lat: p.lat,
        lng: p.lng,
        color: KIND_COLOR[p.kind] ?? "#6366f1",
        radius: 0.32,
        altitude: 0.01,
        slug: p.slug,
        title: p.title,
      })),
    [visible],
  );
  const ringsData = useMemo(
    () => (userLoc ? [{ lat: userLoc.lat, lng: userLoc.lng }] : []),
    [userLoc],
  );
  const kindsPresent = useMemo(() => {
    const s = new Set(points.map((p) => p.kind));
    return (Object.keys(KIND_COLOR) as string[]).filter((k) => s.has(k));
  }, [points]);

  // Responsive square size — measured from the stage (parent), not the globe itself.
  useEffect(() => {
    const el = stageRef.current;
    if (!el) return;
    const measure = () => setDim(Math.max(240, Math.min(el.clientWidth, 460)));
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    measure();
    return () => ro.disconnect();
  }, []);

  // Create the globe once (client-only, dynamic import so three.js stays out of the server bundle).
  useEffect(() => {
    let disposed = false;
    (async () => {
      try {
        const Globe: GlobeInstance = (await import("globe.gl")).default;
        if (disposed || !containerRef.current) return;
        const world: GlobeInstance = new Globe(containerRef.current, { animateIn: true })
          .backgroundColor("rgba(0,0,0,0)")
          .globeImageUrl(TEXTURE)
          .bumpImageUrl(BUMP)
          .showAtmosphere(true)
          .atmosphereColor("#93c5fd")
          .atmosphereAltitude(0.18)
          .pointLat("lat")
          .pointLng("lng")
          .pointColor("color")
          .pointAltitude("altitude")
          .pointRadius("radius")
          .pointsMerge(false)
          .pointLabel((d: GlobeDatum) => d.title)
          .onPointClick((d: GlobeDatum) => {
            if (d.slug) window.open(`/listing/${d.slug}`, "_blank");
          })
          .ringColor(() => "#ef4444")
          .ringMaxRadius(4)
          .ringPropagationSpeed(1.4)
          .ringRepeatPeriod(900)
          .pointsData(globeData)
          .ringsData(ringsData);
        // Size to the (square) container NOW — globe.gl defaults to the full window otherwise.
        const sz = containerRef.current.clientWidth || dim;
        world.width(sz).height(sz);
        // Crisp rendering on high-DPI displays.
        world.renderer().setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
        world.controls().autoRotate = false; // only moves when the user drags it
        world.controls().enableZoom = true;
        world.controls().minDistance = 180;
        world.controls().maxDistance = 500;
        world.pointOfView({ lat: 39, lng: -98, altitude: 2.2 });
        worldRef.current = world;
      } catch {
        /* globe optional — list + distance filter still work */
      }
    })();
    return () => {
      disposed = true;
      try {
        worldRef.current?.pauseAnimation?.();
        if (containerRef.current) containerRef.current.innerHTML = "";
      } catch {
        /* noop */
      }
      worldRef.current = null;
    };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // Update dots + rings when the filter/address changes.
  useEffect(() => {
    worldRef.current?.pointsData(globeData);
  }, [globeData]);
  useEffect(() => {
    worldRef.current?.ringsData(ringsData);
  }, [ringsData]);

  // Resize.
  useEffect(() => {
    worldRef.current?.width(dim).height(dim);
  }, [dim]);

  // Fly to the chosen address.
  useEffect(() => {
    if (userLoc) worldRef.current?.pointOfView({ lat: userLoc.lat, lng: userLoc.lng, altitude: 1.5 }, 900);
  }, [userLoc]);

  // Debounced address autocomplete.
  useEffect(() => {
    const q = query.trim();
    if (q.length < 3 || (userLoc && q === userLoc.label)) {
      setSuggestions([]);
      return;
    }
    setSearching(true);
    const t = setTimeout(async () => {
      try {
        const res = await fetch(`/api/geocode/search?q=${encodeURIComponent(q)}`);
        const d = (await res.json()) as { results: Suggestion[] };
        setSuggestions(d.results ?? []);
      } catch {
        setSuggestions([]);
      } finally {
        setSearching(false);
      }
    }, 320);
    return () => clearTimeout(t);
  }, [query, userLoc]);

  return (
    <div>
      <div className="page-head">
        <div>
          <Link href={backHref} className="back">
            ← Back to feed
          </Link>
          <h1>Opportunities near you</h1>
        </div>
        <p className="count">
          {points.length.toLocaleString()} of {totalMatches.toLocaleString()} matches are place-based.
        </p>
      </div>

      <div className={styles.layout}>
        <div className={styles.left}>
          <div className={styles.globeStage} ref={stageRef}>
            <div className={styles.globeWrap} ref={containerRef} style={{ width: dim, height: dim }} />
          </div>
          <p className={styles.globeHint}>Drag to rotate · scroll to zoom · click a dot to open it</p>
          {kindsPresent.length > 0 && (
            <ul className={styles.legend}>
              {kindsPresent.map((k) => (
                <li key={k} className={styles.legendItem}>
                  <span className={styles.legendDot} style={{ background: KIND_COLOR[k] }} />
                  {KIND_LABEL[k]}
                </li>
              ))}
            </ul>
          )}

          <div className={styles.controls}>
            <label className={styles.ctrlLabel}>Your address (private — never stored or shared)</label>
            <div className={styles.searchWrap}>
              <input
                className={styles.addrInput}
                placeholder="Start typing an address or city…"
                value={query}
                onChange={(e) => {
                  setQuery(e.target.value);
                  setUserLoc(null);
                }}
              />
              {suggestions.length > 0 && (
                <ul className={styles.suggest}>
                  {suggestions.map((s, i) => (
                    <li key={i}>
                      <button
                        className={styles.suggestItem}
                        onClick={() => {
                          setUserLoc(s);
                          setQuery(s.label);
                          setSuggestions([]);
                        }}
                      >
                        {s.label}
                      </button>
                    </li>
                  ))}
                </ul>
              )}
              {searching && <span className={styles.searching}>…</span>}
            </div>

            {userLoc && (
              <div className={styles.radiusRow}>
                <span>
                  Within <b>{radiusMi} mi</b> of {userLoc.label.split(",")[0]}
                </span>
                <input
                  type="range"
                  min={5}
                  max={500}
                  step={5}
                  value={radiusMi}
                  onChange={(e) => setRadiusMi(Number(e.target.value))}
                  className={styles.slider}
                />
              </div>
            )}
          </div>
        </div>

        <div className={styles.list}>
          <h2 className={styles.listTitle}>
            {userLoc ? `${visible.length} within ${radiusMi} mi` : "Place-based opportunities"}
          </h2>
          {nearest.length === 0 ? (
            <p className="empty">Nothing within that range — widen the radius.</p>
          ) : (
            <ul className={styles.rows}>
              {nearest.map((p) => (
                <li key={p.slug} className={styles.rowItem}>
                  <Link href={`/listing/${p.slug}`} className={styles.rowName}>
                    {p.title}
                  </Link>
                  <div className={styles.rowMeta}>
                    {KIND_LABEL[p.kind] ?? p.kind} · {p.location}
                    {userLoc ? ` · ${Math.round(milesBetween(userLoc.lat, userLoc.lng, p.lat, p.lng))} mi` : ""}
                  </div>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </div>
  );
}
