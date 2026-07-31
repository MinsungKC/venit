"use client";

import { useEffect, useRef } from "react";

/**
 * Onboarding background: a real world-MAP globe (vector country outlines, not satellite imagery)
 * spinning slowly on a white page, with GeoGuessr-style red pins that pop in. A few drop on load,
 * then a fresh burst appears each time the wizard advances a step (STEP_EVENT) — so the map fills
 * in as you build your profile. Purely decorative (pointer-events: none). globe.gl is loaded
 * client-only (dynamic import) so it stays off the server/initial bundle.
 */
const COUNTRIES = "https://unpkg.com/three-globe/example/country-polygons/ne_110m_admin_0_countries.geojson";
/** The wizard dispatches this on each step advance; we drop a burst of new pins in response. */
export const STEP_EVENT = "oppmatch:onboarding-step";

const PIN_SPOTS: [number, number][] = [
  [37.77, -122.42], [40.71, -74.0], [51.51, -0.13], [48.85, 2.35], [52.52, 13.4],
  [35.68, 139.69], [1.35, 103.82], [19.08, 72.88], [-33.87, 151.21], [-23.55, -46.63],
  [-33.92, 18.42], [-1.29, 36.82], [25.2, 55.27], [19.43, -99.13], [43.65, -79.38],
  [55.75, 37.62], [-34.6, -58.38], [39.9, 116.4], [59.33, 18.06], [28.61, 77.21],
];

type GlobeInstance = any; // globe.gl's fluent instance chains awkwardly under strict types.

export default function OnboardingGlobe() {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    let cancelled = false;
    let world: GlobeInstance = null;
    let resize: (() => void) | null = null;
    const timers: ReturnType<typeof setTimeout>[] = [];
    const pins: { lat: number; lng: number }[] = [];
    let pinIndex = 0;

    const dropPins = (n: number) => {
      for (let k = 0; k < n && pinIndex < PIN_SPOTS.length; k++) {
        const [lat, lng] = PIN_SPOTS[pinIndex++];
        // Stagger each so a burst cascades in rather than appearing all at once.
        timers.push(
          setTimeout(() => {
            if (cancelled || !world) return;
            pins.push({ lat, lng });
            world.htmlElementsData([...pins]);
          }, k * 160),
        );
      }
    };
    const onStep = () => dropPins(4);

    const destroy = () => {
      try {
        world?._destructor?.();
      } catch {
        /* globe.gl teardown can throw if the node is already detached — ignore */
      }
      world = null;
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
      // If we were unmounted during the dynamic import, tear down immediately so no orphan render
      // loop keeps touching a detached canvas (the source of the removeChild crash).
      if (cancelled) {
        destroy();
        return;
      }

      world.globeMaterial().color.set("#eef1ff");
      world.globeMaterial().shininess = 6;

      resize = () => world && world.width(window.innerWidth).height(window.innerHeight);
      resize();
      world.pointOfView({ lat: 18, lng: -20, altitude: 2.3 });
      const c = world.controls();
      c.autoRotate = true;
      c.autoRotateSpeed = 0.55;
      c.enableZoom = false;
      c.enablePan = false;

      try {
        const geo = await fetch(COUNTRIES).then((r) => r.json());
        if (!cancelled && world) {
          world
            .polygonsData(geo.features)
            .polygonCapColor(() => "rgba(79,70,229,0.13)")
            .polygonSideColor(() => "rgba(79,70,229,0.04)")
            .polygonStrokeColor(() => "rgba(79,70,229,0.45)")
            .polygonAltitude(0.006);
        }
      } catch {
        /* offline / blocked — the bare globe + pins still render */
      }
      if (cancelled) {
        destroy();
        return;
      }

      window.addEventListener("resize", resize);
      window.addEventListener(STEP_EVENT, onStep);
      timers.push(setTimeout(() => dropPins(3), 600)); // a few pins on load
    })();

    return () => {
      cancelled = true;
      timers.forEach(clearTimeout);
      if (resize) window.removeEventListener("resize", resize);
      window.removeEventListener(STEP_EVENT, onStep);
      const el = ref.current;
      destroy();
      // Belt-and-suspenders: clear any leftover canvas so nothing can removeChild a detached node.
      if (el) {
        try {
          while (el.firstChild) el.removeChild(el.firstChild);
        } catch {
          /* ignore */
        }
      }
    };
  }, []);

  return <div ref={ref} aria-hidden className="onboarding-globe" />;
}
