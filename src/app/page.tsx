import { auth } from "@clerk/nextjs/server";
import type { Metadata } from "next";
import { Manrope } from "next/font/google";
import { redirect } from "next/navigation";
import { CreditsExplainer } from "@/components/landing/credits-explainer";
import { Hero } from "@/components/landing/hero";
import { HowItWorks } from "@/components/landing/how-it-works";
import { LandingNav } from "@/components/landing/landing-nav";
import { LookExplorer } from "@/components/landing/look-explorer";
import { PricingSummary } from "@/components/landing/pricing-summary";
import { SiteFooter } from "@/components/landing/site-footer";
import { StyleRibbon } from "@/components/landing/style-ribbon";
import { routes } from "@/lib/routes";
import "@/components/landing/landing.css";

const manrope = Manrope({ subsets: ["latin"], variable: "--font-landing", display: "swap" });

export const metadata: Metadata = {
  title: { absolute: "Style Up! —  Unlock your closet's potential and see yourself in the clothes you already own" },
  description:
    "Rediscover your wardrobe with a personal AI stylist. Choose the pieces to import, create fresh outfits, and preview the look on you. Start with free credits.",
};

export default async function LandingPage({ searchParams }: PageProps<"/">) {
  const { userId } = await auth();
  const params = await searchParams;
  const preview = process.env.NODE_ENV === "development" && params.preview === "landing";
  if (userId && !preview) redirect(routes.wardrobe);

  return (
    <div className={`landing-page ${manrope.variable}`}>
      <a href="#landing-content" className="landing-skip-link">
        Skip to content
      </a>
      <LandingNav />
      <main id="landing-content">
        <Hero />
        <StyleRibbon />
        <HowItWorks />
        <LookExplorer />
        <CreditsExplainer />
        <PricingSummary />
      </main>
      <SiteFooter />
    </div>
  );
}
