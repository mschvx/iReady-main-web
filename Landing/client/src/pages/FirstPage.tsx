import React, { useState } from "react";
import { Button } from "@/components/ui/button";
import { PhilippinesMap } from "@/components/PhilippinesMap";
import { TyphoonAnimation } from "@/components/TyphoonAnimation";
import { LiveUpdates } from "@/components/LiveUpdates";
import { LogInOverlay } from "./LogInOverlay";
import { SignUpOverlay } from "./SignUpOverlay";

export const FirstPage = (): JSX.Element => {
  const [showLogin, setShowLogin] = useState(false);
  const [showSignup, setShowSignup] = useState(false);

  const overlayOpen = showLogin || showSignup;

  const handleAboutClick = () => {
    const aboutSection = document.getElementById("about-section");
    aboutSection?.scrollIntoView({ behavior: "smooth" });
  };

  const handleLoginClick = () => {
    console.log("handleLoginClick: opening login overlay");
    setShowLogin(true);
  };

  const handleSignupClick = () => {
    console.log("handleSignupClick: opening signup overlay");
    setShowSignup(true);
  };

  return (
    <div className="bg-white w-full min-h-screen">
      {/* Fixed Header with iReady Logo (smaller, vertically centered on the left) */}
      <header className="fixed top-0 left-0 w-full h-18 md:h-20 lg:h-24 z-[4000] bg-black shadow-none border-b-0 flex items-center">
        <div className="pl-4 md:pl-6 lg:pl-8">
          <img
            className="h-18 md:h-20 lg:h-22 w-auto block"
            alt="iReady Header"
            src="/figmaAssets/fixed.png"
          />
        </div>
      </header>

      {/* Navigation Overlay (keep above overlays too) */}
      <nav className="fixed top-0 right-0 z-[4100] flex gap-3 md:gap-4 pr-4 md:pr-8 pt-3 md:pt-4 lg:pt-6">
        <Button
          onClick={handleAboutClick}
          className="h-10 md:h-12 px-4 md:px-6 bg-gray-700 rounded-full hover:bg-gray-600 text-sm md:text-base"
        >
          About
        </Button>
        <Button
          onClick={handleLoginClick}
          className="h-10 md:h-12 px-4 md:px-6 bg-blue-700 rounded-full hover:bg-sky-300 text-sm md:text-base text-shadow: 2px 2px 4px black;"
        >
          Log in
        </Button>
      </nav>

      {/* Main Content - Below Fixed Header
          When an overlay is open, blur + dim only the main area and disable pointer events */}
      <main
        className={`pt-16 md:pt-20 lg:pt-24 transition-all duration-200 ${
          overlayOpen ? "filter blur-sm brightness-90 pointer-events-none" : ""
        }`}
      >
        {/* Hero Section: Map + Info Panel */}
        <section className="min-h-[500px] md:min-h-[630px] grid grid-cols-1 lg:grid-cols-[70%_30%] items-stretch">
          {/* Map Container - Takes up ~70% width on large screens, full width on mobile */}
          <div className="w-full h-full relative z-0 overflow-hidden box-border">
            {/* Forecast-style typhoon animation overlayed on the map */}
            <PhilippinesMap className="w-full h-full rounded-none" />
            {/* Animated isobars and wind streaks */}
            <div className="absolute inset-0 pointer-events-none" aria-hidden="true">
              <div className="absolute inset-0 bg-gradient-to-tr from-transparent via-transparent to-white/0 pointer-events-none" />
              <div className="absolute inset-0 mix-blend-screen pointer-events-none">
                <>
                  {/* Lazy import fallback isn't needed; component is light */}
                </>
              </div>
            </div>
            {/* Canvas is on top but pointer-events disabled inside component */}
            {/* eslint-disable-next-line @typescript-eslint/ban-ts-comment */}
            {/* @ts-ignore - path alias resolves via vite */}
            <TyphoonAnimation intensity={0.75} />
          </div>

          {/* Right Info Panel - Takes up ~30% width on large screens */}
          <div className="w-full h-full flex flex-col gap-4 p-6 md:p-10 bg-gray-50 box-border justify-center">
            {/* Call to Action Card */}
            <div className="bg-gray-200 rounded-2xl p-6 md:p-8">
              <h2 className="text-2xl md:text-4xl font-extrabold mb-4 text-black">
                Let's Prepare Now!
              </h2>
              <p className="text-sm md:text-base text-black mb-6">
                Collaborate with other units as you all aim to reach a common goal, help those in need.
              </p>
              <Button
                onClick={handleLoginClick}
                className="w-full h-12 bg-black rounded-lg text-white hover:bg-white hover:text-black md:text-l font-bold"
              >
                LOG IN
              </Button>
            </div>

            {/* Current Updates Card */}
            <div className="bg-gray-200 rounded-2xl p-6 md:p-8">
              <h3 className="text-lg md:text-3xl font-extrabold mb-3">- LIVE UPDATES -</h3>
              {/* Live, constantly changing forecast metrics */}
              {/* eslint-disable-next-line @typescript-eslint/ban-ts-comment */}
              {/* @ts-ignore - path alias resolves via vite */}
              <LiveUpdates />
            </div>
          </div>
        </section>

        {/* Info About iReady Section */}
        <section
          id="about-section"
          className="bg-black text-white py-16 md:py-32 px-6 md:px-16"
        >
          <div className="max-w-6xl">
            <p className="text-blue-300 font-semibold tracking-wide mb-2">PJDSC 2025 · INFORMATION</p>
            <h2 className="text-4xl md:text-6xl lg:text-7xl font-extrabold leading-tight">
              iReady
            </h2>
            <p className="mt-3 text-lg md:text-xl text-gray-200 max-w-4xl">
              A web-based dashboard for pre-storm relief planning and logistics optimization. iReady helps LGUs and NGOs <span className="font-semibold">predict what supplies are needed</span> and where to place them using a <span className="font-semibold">Random Forest</span> model that connects flood forecasts with socioeconomic and resilience data.
            </p>

            {/* Keywords */}
            <div className="mt-6 flex flex-wrap gap-2">
              {['Relief Logistics','Random Forest','Hazard Prediction','LGU & NGO Coordination','Damage Risk Reduction'].map((kw) => (
                <span key={kw} className="bg-gray-800 text-gray-200 text-xs md:text-sm px-3 py-1 rounded-full border border-gray-700">
                  {kw}
                </span>
              ))}
            </div>

            {/* Summary & What it does */}
            <div className="mt-10 grid grid-cols-1 lg:grid-cols-2 gap-8">
              <div className="space-y-4">
                <p className="text-gray-200">
                  The Philippines faces recurring typhoon impacts and uneven relief delivery or oversupply in some areas, shortages in others. iReady bridges this gap by going beyond hazard maps and connecting forecasts with vulnerability and logistics to guide <span className="font-semibold">earlier, smarter, fairer</span> pre-storm action.
                </p>
                <ul className="list-disc pl-6 space-y-2 text-gray-200">
                  <li>Centralizes hazard, socioeconomic, and logistics data into one dashboard.</li>
                  <li>Predicts needs at the city level with a Random Forest model.</li>
                  <li>Guides pre-positioning to reduce duplication and stockouts.</li>
                </ul>
              </div>

              <div className="space-y-4">
                <h3 className="text-2xl md:text-3xl font-bold">What iReady does</h3>
                <p className="text-gray-200">
                  Prioritizes at-risk communities, estimates likely supply needs, and suggests staging and routing, so LGUs and NGOs can coordinate relief <em>before</em> landfall.
                </p>
                <div className="flex gap-3 flex-wrap">
                  <Button onClick={handleLoginClick} className="bg-blue-600 hover:bg-sky-300">Get started</Button>
                </div>
              </div>
            </div>

            {/* Trimmed sections per request: removed Problem, Objectives, Scope, Methodology, and team (moved to Contact) */}
          </div>
        </section>

        {/* Contact Info Section */}
        <section className="bg-white py-16 md:py-22 px-6 md:px-16">
          <div className="max-w-6xl">
            <h2 className="text-4xl md:text-5xl font-extrabold">Contact</h2>
            <p className="text-gray-600 mt-3 max-w-3xl">Questions, partnerships, or feedback? Reach out and we’ll get back to you.</p>

            <div className="mt-8 grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
              <div className="rounded-xl border p-6">
                <h4 className="font-semibold text-lg">General inquiries</h4>
                <p className="text-gray-600 mt-2">contact@iready.com</p>
                <p className="text-gray-600">+63 917 123 4567</p>
              </div>
              <div className="rounded-xl border p-6">
                <h4 className="font-semibold text-lg">Partnerships</h4>
                <p className="text-gray-600 mt-2">partners@iready.com</p>
                <p className="text-gray-600">+63 927 234 5678</p>
              </div>
              <div className="rounded-xl border p-6">
                <h4 className="font-semibold text-lg">Follow updates</h4>
                <p className="text-gray-600 mt-2">github.com/mschvx/iReady</p>
              </div>
            </div>

            {/* Team moved here */}
            <div className="mt-10">
              <h3 className="text-2xl md:text-3xl font-bold">Team SUSpension</h3>
              <ul className="mt-4 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                {[
                  { name: 'Aaron Kyle Santos', phone: '+63 905 111 2233' },
                  { name: 'Allane Lee Castro', phone: '+63 906 222 3344' },
                  { name: 'Jodi Antonette Calleja', phone: '+63 907 333 4455' },
                  { name: 'Ljiel Saplan', phone: '+63 908 444 5566' },
                  { name: 'Mari Gabriel De Leon', phone: '+63 909 555 6677' },
                ].map((m) => (
                  <li key={m.name} className="rounded-lg border p-4">
                    <p className="font-semibold">{m.name}</p>
                    <p className="text-gray-600 text-sm">{m.phone}</p>
                  </li>
                ))}
              </ul>
            </div>

            <div className="mt-8">
              <Button onClick={handleLoginClick} className="bg-blue-600 hover:bg-sky-300">Sign in to iReady</Button>
            </div>
          </div>
        </section>
      </main>

      {/* Overlays */}
      {showLogin && (
        <LogInOverlay
          onClose={() => setShowLogin(false)}
          onOpenSignUp={() => {
            setShowLogin(false);
            setShowSignup(true);
          }}
        />
      )}

      {showSignup && (
        <SignUpOverlay
          onClose={() => setShowSignup(false)}
          onOpenLogin={() => {
            setShowSignup(false);
            setShowLogin(true);
          }}
        />
      )}
    </div>
  );
};
