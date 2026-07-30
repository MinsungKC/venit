/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  // The importer/build scripts touch the DB and the vendored dataset; keep them
  // out of the client bundle. `pg` is only ever imported in Server Components.
  experimental: {
    serverComponentsExternalPackages: ["pg"],
  },
  webpack: (config, { isServer }) => {
    // transformers.js runs in the BROWSER via onnxruntime-web (WASM). Stop webpack from trying
    // to bundle the Node-only backends (onnxruntime-node, sharp) into the client build — they
    // pull native .node binaries that break the bundle. See lib/embeddings-browser.ts.
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
