"use client";

import { useEffect, useRef } from "react";

/**
 * Decorative background globe for the matches feed. Idly auto-rotates; spins faster while the user
 * scrolls; and when the user hovers a match card that has a location (a `[data-lat]` element), it
 * eases the rotation to a stop and smoothly flies + zooms to that spot, dropping a pin. Moving off
 * the card zooms back out and resumes the spin. Purely visual (pointer-events: none), rendered
 * behind the feed. globe.gl is loaded client-only (dynamic import) so it never enters the SSR path.
 *
 * Hover is detected by event delegation on `document` (cards are server-rendered and carry
 * `data-lat`/`data-lng`), so individual cards stay static HTML — no per-card client component.
 */
const COUNTRIES = "https://unpkg.com/three-globe/example/country-polygons/ne_110m_admin_0_countries.geojson";

type GlobeInstance = any; // globe.gl's fluent instance chains awkwardly under strict types.

const BASE_SPEED = 0.4; // idle auto-rotate speed
const IDLE_ALTITUDE = 2.2;
const ZOOM_ALTITUDE = 1.35;

export default function MatchGlobe() {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    let cancelled = false;
    let world: GlobeInstance = null;
    let resize: (() => void) | null = null;
    const intervals: ReturnType<typeof setInterval>[] = [];

    let hovering = false;
    let current: Element | null = null;
    let targetSpeed = BASE_SPEED;
    let lastScroll = 0;

    const destroy = () => {
      try {
        world?._destructor?.();
      } catch {
        /* teardown can throw on a detached node — ignore */
      }
      world = null;
    };

    const focusLocation = (lat: number, lng: number) => {
      if (!world) return;
      hovering = true;
      world.controls().autoRotate = false;
      world.pointOfView({ lat, lng, altitude: ZOOM_ALTITUDE }, 1000);
      world.htmlElementsData([{ lat, lng }]);
    };

    const resetView = () => {
      if (!world) return;
      hovering = false;
      world.htmlElementsData([]);
      world.pointOfView({ altitude: IDLE_ALTITUDE }, 1000); // zoom back out, keep current facing
      setTimeout(() => {
        if (!cancelled && world && !hovering) world.controls().autoRotate = true;
      }, 1000);
    };

    // Delegated hover: mouseover bubbles, so entering any element re-evaluates the nearest card.
    const onOver = (e: MouseEvent) => {
      const el = (e.target as Element | null)?.closest?.("[data-lat]") ?? null;
      if (el === current) return;
      current = el;
      if (el) {
        const lat = Number((el as HTMLElement).dataset.lat);
        const lng = Number((el as HTMLElement).dataset.lng);
        if (Number.isFinite(lat) && Number.isFinite(lng)) focusLocation(lat, lng);
      } else {
        resetView();
      }
    };

    const onScroll = () => {
      targetSpeed = 6; // spin up while scrolling
      lastScroll = Date.now();
    };

    (async () => {
      const Globe: GlobeInstance = (await import("globe.gl")).default;
      if (cancelled || !ref.current) return;

      world = new Globe(ref.current, { animateIn: true })
        .backgroundColor("rgba(0,0,0,0)")
        .showAtmosphere(true)
        .atmosphereColor("#818cf8")
        .atmosphereAltitude(0.16)
        .htmlElementsData([])
        .htmlLat("lat")
        .htmlLng("lng")
        .htmlAltitude(0.01)
        .htmlElement(() => {
          const el = document.createElement("div");
          el.className = "gg-pin";
          el.innerHTML = '<span class="gg-pin-inner"><span class="gg-pin-head"></span></span>';
          return el;
        });
      if (cancelled) {
        destroy();
        return;
      }

      world.globeMaterial().color.set("#dbe1ff");
      world.globeMaterial().shininess = 8;

      resize = () => world && world.width(window.innerWidth).height(window.innerHeight);
      resize();
      world.pointOfView({ lat: 20, lng: -30, altitude: IDLE_ALTITUDE });
      const c = world.controls();
      c.autoRotate = true;
      c.autoRotateSpeed = BASE_SPEED;
      c.enableZoom = false;
      c.enablePan = false;

      // Ease rotation toward targetSpeed each frame, and decay targetSpeed back to idle once
      // scrolling stops. Skipped while hovering (auto-rotate is off during a zoom-in).
      intervals.push(
        setInterval(() => {
          if (cancelled || !world) return;
          if (Date.now() - lastScroll > 160) targetSpeed += (BASE_SPEED - targetSpeed) * 0.08;
          const ctrl = world.controls();
          if (!hovering) ctrl.autoRotateSpeed += (targetSpeed - ctrl.autoRotateSpeed) * 0.1;
        }, 33),
      );

      try {
        const geo = await fetch(COUNTRIES).then((r) => r.json());
        if (!cancelled && world) {
          world
            .polygonsData(geo.features)
            .polygonCapColor(() => "rgba(79,70,229,0.32)")
            .polygonSideColor(() => "rgba(79,70,229,0.12)")
            .polygonStrokeColor(() => "rgba(67,56,202,0.85)")
            .polygonAltitude(0.008);
        }
      } catch {
        /* offline / blocked — the bare globe still renders */
      }
      if (cancelled) {
        destroy();
        return;
      }

      window.addEventListener("resize", resize);
      window.addEventListener("scroll", onScroll, { passive: true });
      document.addEventListener("mouseover", onOver);
    })();

    return () => {
      cancelled = true;
      intervals.forEach(clearInterval);
      if (resize) window.removeEventListener("resize", resize);
      window.removeEventListener("scroll", onScroll);
      document.removeEventListener("mouseover", onOver);
      const el = ref.current;
      destroy();
      if (el) {
        try {
          while (el.firstChild) el.removeChild(el.firstChild);
        } catch {
          /* ignore */
        }
      }
    };
  }, []);

  return <div ref={ref} aria-hidden className="match-globe" />;
}
