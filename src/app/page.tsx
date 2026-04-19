import Navbar from "@/components/Navbar";
import InputBar from "@/components/InputBar";
import SuggestedTopics from "@/components/SuggestedTopics";
import HeroTitle from "@/components/HeroTitle";

export default function Home() {
  return (
    <div className="relative min-h-screen flex flex-col">
      <Navbar />

      {/* Background grid */}
      <div className="fixed inset-0 grid-bg pointer-events-none" />

      {/* Hero */}
      <main className="relative flex-1 flex flex-col items-center justify-center px-4 sm:px-6 pt-20 pb-12">
        <HeroTitle />
        <div className="mt-10 w-full">
          <InputBar />
        </div>
        <SuggestedTopics />
      </main>

      {/* Bottom glow line */}
      <div className="fixed bottom-0 left-0 right-0 glow-line" />
    </div>
  );
}
