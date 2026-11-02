import { ArrowUpRight } from "lucide-react";
import Link from "next/link";
import { routes } from "@/lib/routes";

export function LandingNav() {
  return (
    <header className="landing-nav">
      <div className="landing-shell landing-nav-inner">
        <Link href={routes.home} className="landing-wordmark" aria-label="Fitcheck home">
          <svg viewBox="0 0 28 28" fill="none" aria-hidden="true">
            <path d="M9 2H2v7M19 2h7v7M26 19v7h-7M9 26H2v-7" stroke="currentColor" strokeWidth="2" />
            <path d="m8 14 4 4 8-9" stroke="currentColor" strokeWidth="2.5" />
          </svg>
          <span>Style Up!</span>
        </Link>
        <nav className="landing-nav-links" aria-label="Main navigation">
          <a href="#how-it-works">The experience</a>
          <a href="#looks">The possibilities</a>
          <a href="#pricing">The plans</a>
        </nav>
        <div className="landing-nav-actions">
          <Link href={routes.signIn} className="landing-login">
            Log in
          </Link>
          <Link href={routes.signUp} className="landing-button landing-button-small">
            Get started <ArrowUpRight aria-hidden="true" />
          </Link>
        </div>
      </div>
    </header>
  );
}
