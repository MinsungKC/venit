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
/** Dispatched when the form is submitted: the globe spins up fast and floods with pins as it
 *  "searches", climaxing while the top matches are computed. */
export const FINISH_EVENT = "oppmatch:onboarding-finish";

// City / interior coordinates — all firmly on land, so waypoints never drop in the ocean.
const LAND_SPOTS: [number, number][] = [
  // North America
  [37.77, -122.42], [34.05, -118.24], [40.71, -74.0], [41.88, -87.63], [29.76, -95.37],
  [39.74, -104.99], [45.5, -122.68], [47.61, -122.33], [33.75, -84.39], [25.76, -80.19],
  [43.65, -79.38], [45.5, -73.57], [49.28, -123.12], [19.43, -99.13], [20.67, -103.35],
  [39.1, -94.58], [44.98, -93.27], [35.47, -97.52], [38.9, -77.04],
  // South America
  [-23.55, -46.63], [-22.91, -43.17], [-34.6, -58.38], [-12.05, -77.04], [4.71, -74.07],
  [-33.45, -70.67], [-16.5, -68.15], [10.48, -66.9], [-25.3, -57.6], [-15.6, -56.1],
  // Europe
  [51.51, -0.13], [48.85, 2.35], [52.52, 13.4], [40.42, -3.7], [41.9, 12.5], [52.37, 4.9],
  [55.75, 37.62], [59.33, 18.06], [50.11, 8.68], [48.21, 16.37], [47.5, 19.04], [38.72, -9.14],
  [53.35, -6.26], [50.45, 30.52], [45.46, 9.19], [41.01, 28.98],
  // Africa
  [30.04, 31.24], [6.52, 3.38], [-26.2, 28.04], [-1.29, 36.82], [9.03, 38.74], [14.69, -17.44],
  [33.57, -7.59], [-4.44, 15.27], [-33.92, 18.42], [15.5, 32.56], [12.37, -1.53], [-18.87, 47.51],
  // Asia
  [35.68, 139.69], [37.57, 126.98], [39.9, 116.4], [31.23, 121.47], [22.32, 114.17], [1.35, 103.82],
  [13.75, 100.5], [-6.21, 106.85], [28.61, 77.21], [19.08, 72.88], [12.97, 77.59], [24.86, 67.0],
  [25.2, 55.27], [35.69, 51.39], [41.31, 69.24], [43.24, 76.9], [23.81, 90.41], [21.03, 105.85],
  [14.6, 120.98], [3.14, 101.69], [55.03, 82.92], [52.29, 104.28],
  // Oceania
  [-33.87, 151.21], [-37.81, 144.96], [-27.47, 153.02], [-31.95, 115.86], [-36.85, 174.76], [-41.29, 174.78],
];

type GlobeInstance = any; // globe.gl's fluent instance chains awkwardly under strict types.

export default function OnboardingGlobe() {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    let cancelled = false;
    let world: GlobeInstance = null;
    let resize: (() => void) | null = null;
    const timers: ReturnType<typeof setTimeout>[] = [];
    const intervals: ReturnType<typeof setInterval>[] = [];
    const pins: { lat: number; lng: number }[] = [];
    let targetSpeed = 0.55; // controls.autoRotateSpeed is eased toward this each frame

    // Shuffle the land spots once so pins appear in a random-looking order but always ON LAND,
    // and never repeat a coordinate. Both step bursts and the finish flood pull from this order.
    const order = [...LAND_SPOTS].sort(() => Math.random() - 0.5);
    let idx = 0;
    const dropNext = (n: number) => {
      for (let k = 0; k < n && idx < order.length; k++) {
        const [lat, lng] = order[idx++];
        timers.push(
          setTimeout(() => {
            if (cancelled || !world) return;
            pins.push({ lat, lng });
            world.htmlElementsData([...pins]);
          }, k * 90),
        );
      }
    };
    const onStep = () => dropNext(6);
    const onFinish = () => {
      if (!world) return;
      targetSpeed = 18; // spin up fast while "searching"
      const flurry = setInterval(() => dropNext(6), 190);
      intervals.push(flurry);
      // After the climax, stop flooding and ease back to a gentle-fast idle behind the results.
      timers.push(
        setTimeout(() => {
          clearInterval(flurry);
          targetSpeed = 1.4;
        }, 2900),
      );
    };

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
      // Ease the rotation speed toward `targetSpeed` each frame (smooth spin-up/spin-down).
      intervals.push(
        setInterval(() => {
          if (cancelled || !world) return;
          const ctrl = world.controls();
          ctrl.autoRotateSpeed += (targetSpeed - ctrl.autoRotateSpeed) * 0.06;
        }, 33),
      );

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
      window.addEventListener(FINISH_EVENT, onFinish);
      timers.push(setTimeout(() => dropNext(3), 600)); // a few pins on load
    })();

    return () => {
      cancelled = true;
      timers.forEach(clearTimeout);
      intervals.forEach(clearInterval);
      if (resize) window.removeEventListener("resize", resize);
      window.removeEventListener(STEP_EVENT, onStep);
      window.removeEventListener(FINISH_EVENT, onFinish);
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
