import type { NextConfig } from "next";

const supabaseHost = process.env.NEXT_PUBLIC_SUPABASE_URL
  ? new URL(process.env.NEXT_PUBLIC_SUPABASE_URL).hostname
  : undefined;

const supabaseOrigin = supabaseHost ? `https://${supabaseHost}` : "";
const inpostHosts = [
  "https://geowidget.inpost.pl",
  "https://sandbox-easy-geowidget-sdk.easypack24.net",
].join(" ");
// The production SDK is downloaded from geowidget.inpost.pl, but it renders
// the map in an iframe served from this separate application origin.
const inpostFrameHosts = `${inpostHosts} https://geowidget-app.inpost.pl`;

// React's dev build uses eval() for debugging features (rebuilding call stacks
// across the server/client boundary), and Turbopack's HMR runtime needs it too.
// Production never runs that code, so the allowance stops at `next dev`.
const isDev = process.env.NODE_ENV !== "production";
const devScriptSrc = isDev ? " 'unsafe-eval'" : "";

const contentSecurityPolicy = [
  "default-src 'self'",
  "base-uri 'self'",
  "object-src 'none'",
  "frame-ancestors 'none'",
  "form-action 'self' https://checkout.stripe.com",
  `script-src 'self' 'unsafe-inline'${devScriptSrc} ${inpostHosts}`,
  `style-src 'self' 'unsafe-inline' ${inpostHosts}`,
  `img-src 'self' data: blob: ${supabaseOrigin}`,
  `connect-src 'self' ${supabaseOrigin} https://api.stripe.com ${inpostHosts}`,
  `frame-src 'self' ${inpostFrameHosts}`,
  "font-src 'self' data:",
  "media-src 'self'",
  "worker-src 'self' blob:",
].join("; ");

const nextConfig: NextConfig = {
  images: {
    // Catalog photos uploaded from /admin/dywany are served from the public
    // Supabase Storage bucket, so next/image has to be allowed to fetch them.
    remotePatterns: supabaseHost
      ? [
          {
            protocol: "https",
            hostname: supabaseHost,
            pathname: "/storage/v1/object/public/**",
          },
        ]
      : [],
  },
  async headers() {
    return [
      {
        source: "/(.*)",
        headers: [
          { key: "Content-Security-Policy", value: contentSecurityPolicy },
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "X-Frame-Options", value: "DENY" },
          {
            key: "Permissions-Policy",
            value: "camera=(), microphone=(), geolocation=()",
          },
          {
            key: "Strict-Transport-Security",
            value: "max-age=31536000; includeSubDomains; preload",
          },
        ],
      },
    ];
  },
  experimental: {
    inlineCss: true,
    serverActions: {
      bodySizeLimit: "6mb",
    },
  },
};

export default nextConfig;
