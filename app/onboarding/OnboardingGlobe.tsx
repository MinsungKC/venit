"use client";

import { useEffect, useRef } from "react";

/**
 * Onboarding background: a real world-MAP globe (vector country outlines, not satellite imagery)
 * spinning slowly on a white page, with GeoGuessr-style red pins that pop in one by one. Purely
 * decorative (pointer-events: none) so it never intercepts clicks meant for the glass wizard card.
 * globe.gl is loaded client-only (dynamic import) so it stays off the server/initial bundle.
 */
const COUNTRIES = "https://unpkg.com/three-globe/example/country-polygons/ne_110m_admin_0_countries.geojson";

// Decorative pin spots over inhabited land so the red markers land on continents, not oceans.
const PIN_SPOTS: [number, number][] = [
  [37.77, -122.42], [40.71, -74.0], [51.51, -0.13], [48.85, 2.35], [52.52, 13.4],
  [35.68, 139.69], [1.35, 103.82], [19.08, 72.88], [-33.87, 151.21], [-23.55, -46.63],
  [-33.92, 18.42], [-1.29, 36.82], [25.2, 55.27], [19.43, -99.13], [43.65, -79.38],
  [55.75, 37.62], [-34.6, -58.38], [39.9, 116.4],
];

type GlobeInstance = any; // globe.gl's fluent instance chains awkwardly under strict types.

export default function OnboardingGlobe() {
  const ref = useRef<HTMLDivElement>(null);
  const worldRef = useRef<GlobeInstance>(null);

  useEffect(() => {
    let cancelled = false;
    const timers: ReturnType<typeof setTimeout>[] = [];

    (async () => {
      const Globe: GlobeInstance = (await import("globe.gl")).default;
      if (!ref.current || cancelled) return;

      const world: GlobeInstance = new Globe(ref.current, { animateIn: true })
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
      worldRef.current = world;

      // A pale world-map globe (subtle on white) with soft indigo country fills + outlines.
      world.globeMaterial().color.set("#eef1ff");
      world.globeMaterial().shininess = 6;

      const resize = () => world.width(window.innerWidth).height(window.innerHeight);
      resize();
      world.pointOfView({ lat: 18, lng: -20, altitude: 2.3 });
      world.controls().autoRotate = true;
      world.controls().autoRotateSpeed = 0.55;
      world.controls().enableZoom = false;
      world.controls().enablePan = false;

      try {
        const geo = await fetch(COUNTRIES).then((r) => r.json());
        if (cancelled) return;
        world
          .polygonsData(geo.features)
          .polygonCapColor(() => "rgba(79,70,229,0.13)")
          .polygonSideColor(() => "rgba(79,70,229,0.04)")
          .polygonStrokeColor(() => "rgba(79,70,229,0.45)")
          .polygonAltitude(0.006);
      } catch {
        /* offline / blocked — the bare globe + pins still render */
      }

      // Populate the red pins one by one with a pop-in animation.
      const pins: { lat: number; lng: number }[] = [];
      const addPin = (i: number) => {
        if (cancelled || i >= PIN_SPOTS.length) return;
        pins.push({ lat: PIN_SPOTS[i][0], lng: PIN_SPOTS[i][1] });
        world.htmlElementsData([...pins]);
        timers.push(setTimeout(() => addPin(i + 1), 620 + Math.random() * 480));
      };
      timers.push(setTimeout(() => addPin(0), 700));

      window.addEventListener("resize", resize);
      (world as { __resize?: () => void }).__resize = resize;
    })();

    return () => {
      cancelled = true;
      timers.forEach(clearTimeout);
      const w = worldRef.current as ({ __resize?: () => void; _destructor?: () => void } & GlobeInstance) | null;
      if (w?.__resize) window.removeEventListener("resize", w.__resize);
      try {
        w?._destructor?.();
      } catch {
        /* ignore teardown errors */
      }
    };
  }, []);

  return <div ref={ref} aria-hidden className="onboarding-globe" />;
}
