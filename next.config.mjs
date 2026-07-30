/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  // The importer/build scripts touch the DB and the vendored dataset; keep them
  // out of the client bundle. `pg` is only ever imported in Server Components.
  // `@xenova/transformers` now also runs server-side (POST /api/embed, lib/embeddings.ts —
  // self-hosted BGE embedder, see that file's header for why we moved off on-device MiniLM):
  // it must be external too, or webpack tries to bundle its native onnxruntime-node .node
  // binary and the route 500s with MODULE_NOT_FOUND at runtime.
  experimental: {
    serverComponentsExternalPackages: ["pg", "@xenova/transformers", "onnxruntime-node", "sharp"],
  },
  webpack: (config, { isServer }) => {
    // The BROWSER no longer runs any embedding model (moved server-side above), but keep this
    // guard: it stops webpack from ever trying to pull the Node-only native backends into a
    // client bundle if something client-side ends up importing transformers.js again.
    if (!isServer) {
      config.resolve.alias = {
        ...config.resolve.alias,
        "onnxruntime-node$": false,
        sharp$: false,
      };
    }
    return config;
  },
};

export default nextConfig;
