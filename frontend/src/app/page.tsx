import { CallToAction } from "@/components/landing/cta";
import { Features } from "@/components/landing/features";
import { Hero } from "@/components/landing/hero";
import { HowItWorks } from "@/components/landing/how-it-works";
import { LiveStats } from "@/components/landing/live-stats";
import { TechMarquee } from "@/components/landing/tech-marquee";
import { UseCaseCarousel } from "@/components/landing/use-case-carousel";
import { SiteFooter } from "@/components/site-footer";
import { SiteHeader } from "@/components/site-header";

export default function HomePage() {
  return (
    <>
      <SiteHeader />
      <main>
        <Hero />
        <TechMarquee />
        <LiveStats />
        <Features />
        <HowItWorks />
        <UseCaseCarousel />
        <CallToAction />
      </main>
      <SiteFooter />
    </>
  );
}
