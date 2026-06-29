import type { Metadata, Viewport } from "next";
import ErrorBoundary from '@/components/ErrorBoundary';
import "./globals.css";

const SITE_URL = "https://aegis-fleet.example.com";
const SITE_NAME = "Aegis";
const SITE_TITLE = "Aegis — AI Fleet Operations Command | Real-Time Telemetry, Privacy-First ELD";
const SITE_DESCRIPTION =
  "Aegis unifies your trucks, drivers, cameras, and global logistics intel into one AI-native command center. Privacy-isolated driver data. SMB fleet-ops, enterprise-grade UX.";

export const viewport: Viewport = {
  themeColor: "#fbbf24",
  width: "device-width",
  initialScale: 1,
  maximumScale: 5,
  colorScheme: "dark",
};

export const metadata: Metadata = {
  metadataBase: new URL(SITE_URL),
  title: {
    default: SITE_TITLE,
    template: "%s | Aegis",
  },
  description: SITE_DESCRIPTION,
  keywords: [
    "fleet operations",
    "ELD",
    "FMCSA",
    "HOS",
    "J1939",
    "fleet management software",
    "small fleet",
    "SMB fleet",
    "AI fleet ops",
    "FleetGPT",
    "privacy guardian",
    "driver privacy",
    "Samsara alternative",
    "Motive alternative",
    "Geotab alternative",
    "telemetry",
    "trucking software",
    "compass eld",
  ],
  authors: [{ name: "Aegis" }],
  robots: { index: true, follow: true },
  icons: {
    icon: [
      { url: "/aegis-shield.svg", type: "image/svg+xml" },
      { url: "/favicon-32x32.png", type: "image/png", sizes: "32x32" },
      { url: "/favicon-16x16.png", type: "image/png", sizes: "16x16" },
    ],
    apple: [{ url: "/apple-touch-icon.png", sizes: "180x180" }],
    shortcut: "/aegis-shield.svg",
  },
  manifest: "/site.webmanifest",
  alternates: { canonical: SITE_URL },
  openGraph: {
    title: SITE_TITLE,
    description: SITE_DESCRIPTION,
    type: "website",
    siteName: SITE_NAME,
    locale: "en_US",
    url: SITE_URL,
    images: [{ url: `${SITE_URL}/og-image.png`, width: 1200, height: 630, alt: "Aegis — Fleet Operations Command" }],
  },
  twitter: {
    card: "summary_large_image",
    title: SITE_TITLE,
    description: SITE_DESCRIPTION,
    images: [`${SITE_URL}/og-image.png`],
  },
  other: {
    "apple-mobile-web-app-capable": "yes",
    "apple-mobile-web-app-status-bar-style": "black-translucent",
    "apple-mobile-web-app-title": "Aegis",
    "mobile-web-app-capable": "yes",
  },
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en" dir="ltr">
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
        <link rel="icon" href="/aegis-shield.svg" type="image/svg+xml" />
        <link rel="canonical" href={SITE_URL} />
      </head>
      <body className="antialiased bg-[#0a0e1a] text-slate-100">
        <ErrorBoundary name="Aegis Core">{children}</ErrorBoundary>
      </body>
    </html>
  );
}
