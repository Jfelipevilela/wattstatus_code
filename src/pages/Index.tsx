import { useEffect } from "react";
import "@/components/landing/landing.css";
import { LandingHeader } from "@/components/landing/LandingHeader";
import { HeroSection } from "@/components/landing/HeroSection";
import { FeatureShowcase } from "@/components/landing/FeatureShowcase";
import { PlatformPreview } from "@/components/landing/PlatformPreview";
import { AIPresentation } from "@/components/landing/AIPresentation";
import { HowItWorks } from "@/components/landing/HowItWorks";
import { FinalCTA } from "@/components/landing/FinalCTA";
import { LandingFooter } from "@/components/landing/LandingFooter";

const TITLE = "WattStatus — a nova forma de enxergar a energia da sua casa";

const Index = () => {
  // The SPA shares one document; restore the default title when leaving.
  useEffect(() => {
    const previous = document.title;
    document.title = TITLE;
    return () => {
      document.title = previous;
    };
  }, []);

  return (
    <div className="landing min-h-screen">
      <a href="#conteudo" className="sr-only z-[60] rounded-lg bg-[var(--l-cyan)] px-4 py-2 font-semibold text-[#03111c] focus:not-sr-only focus:fixed focus:left-4 focus:top-4">
        Pular para o conteúdo
      </a>
      <LandingHeader />
      <main id="conteudo">
        <HeroSection />
        <FeatureShowcase />
        <PlatformPreview />
        <AIPresentation />
        <HowItWorks />
        <FinalCTA />
      </main>
      <LandingFooter />
    </div>
  );
};

export default Index;
