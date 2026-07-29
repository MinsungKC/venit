/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  // The importer/build scripts touch the DB and the vendored dataset; keep them
  // out of the client bundle. `pg` is only ever imported in Server Components.
  experimental: {
    serverComponentsExternalPackages: ["pg"],
  },
};

export default nextConfig;
