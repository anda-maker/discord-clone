import { Link } from 'react-router-dom';
import { MessageSquare, Mic, Users, Hash, Shield, Zap } from 'lucide-react';

const DiscordLogo = ({ size = 40 }: { size?: number }) => (
  <svg width={size} height={(size * 55) / 71} viewBox="0 0 71 55" fill="currentColor">
    <path d="M60.1045 4.8978C55.5792 2.8214 50.7265 1.2916 45.6527 0.41542C45.5603 0.39851 45.468 0.44077 45.4204 0.52529C44.7963 1.6353 44.105 3.0834 43.6209 4.2216C38.1637 3.4046 32.7345 3.4046 27.3892 4.2216C26.905 3.0581 26.1886 1.6353 25.5617 0.52529C25.5141 0.44359 25.4218 0.40133 25.3294 0.41542C20.2584 1.2888 15.4057 2.8186 10.8776 4.8978C10.8384 4.9147 10.8048 4.9429 10.7825 4.9795C1.57795 18.7309 -0.943561 32.1443 0.293408 45.3914C0.299005 45.4562 0.335386 45.5182 0.385761 45.5576C6.45866 50.0174 12.3413 52.7249 18.1147 54.5195C18.2071 54.5477 18.305 54.5139 18.3638 54.4378C19.7295 52.5728 20.9469 50.6063 21.9907 48.5383C22.0523 48.4172 21.9935 48.2735 21.8676 48.2256C19.9366 47.4931 18.0979 46.6 16.3292 45.5858C16.1893 45.5041 16.1781 45.304 16.3068 45.2082C16.679 44.9293 17.0513 44.6391 17.4067 44.3461C17.471 44.2926 17.5606 44.2813 17.6362 44.3151C29.2558 49.6202 41.8354 49.6202 53.3179 44.3151C53.3935 44.2785 53.4831 44.2898 53.5502 44.3433C53.9057 44.6363 54.2779 44.9293 54.6529 45.2082C54.7816 45.304 54.7732 45.5041 54.6333 45.5858C52.8646 46.6197 51.0259 47.4931 49.0921 48.2228C48.9662 48.2707 48.9102 48.4172 48.9718 48.5383C50.038 50.6034 51.2554 52.5699 52.5959 54.435C52.6519 54.5139 52.7526 54.5477 52.845 54.5195C58.6464 52.7249 64.529 50.0174 70.6019 45.5576C70.6551 45.5182 70.6887 45.459 70.6943 45.3942C72.1747 30.0791 68.2147 16.7757 60.1968 4.9823C60.1772 4.9429 60.1437 4.9147 60.1045 4.8978ZM23.7259 37.3253C20.2276 37.3253 17.3451 34.1136 17.3451 30.1693C17.3451 26.225 20.1717 23.0133 23.7259 23.0133C27.308 23.0133 30.1626 26.2532 30.1066 30.1693C30.1066 34.1136 27.28 37.3253 23.7259 37.3253ZM47.3178 37.3253C43.8196 37.3253 40.9371 34.1136 40.9371 30.1693C40.9371 26.225 43.7636 23.0133 47.3178 23.0133C50.9 23.0133 53.7545 26.2532 53.6986 30.1693C53.6986 34.1136 50.9 37.3253 47.3178 37.3253Z" />
  </svg>
);

export default function LandingPage() {
  return (
    <div className="min-h-screen w-screen overflow-x-hidden text-white"
      style={{ background: 'linear-gradient(135deg, #404eed 0%, #5865f2 35%, #2f3136 100%)' }}>

      {/* Top nav */}
      <header className="flex items-center justify-between px-6 md:px-12 py-4 max-w-7xl mx-auto">
        <div className="flex items-center gap-2 text-white">
          <DiscordLogo size={36} />
          <span className="text-xl font-extrabold tracking-tight">Discord</span>
        </div>
        <div className="flex items-center gap-3">
          <Link
            to="/auth?mode=login"
            className="bg-white text-black text-sm font-medium px-4 py-1.5 rounded-full hover:text-discord-brand hover:shadow-md transition"
          >
            Log In
          </Link>
          <Link
            to="/auth?mode=register"
            className="bg-discord-bg-tertiary hover:bg-black text-white text-sm font-medium px-4 py-1.5 rounded-full transition hidden sm:inline-block"
          >
            Register
          </Link>
        </div>
      </header>

      {/* Hero */}
      <section className="max-w-5xl mx-auto px-6 md:px-12 pt-12 pb-20 text-center">
        <h1 className="text-4xl md:text-6xl font-extrabold tracking-tight uppercase mb-6 leading-tight">
          Imagine a place...
        </h1>
        <p className="text-base md:text-lg text-white/90 max-w-2xl mx-auto mb-10">
          ...where you can belong to a school club, a gaming group, or a worldwide art community.
          Where just you and a handful of friends can spend time together. A place that makes it easy
          to talk every day and hang out more often.
        </p>

        <div className="flex flex-col sm:flex-row gap-4 justify-center items-center">
          <Link
            to="/auth?mode=register"
            className="bg-white text-black hover:text-discord-brand hover:shadow-xl font-semibold px-7 py-3 rounded-full transition flex items-center gap-2"
          >
            <span>Open Discord in your browser</span>
          </Link>
          <Link
            to="/auth?mode=login"
            className="bg-discord-bg-tertiary hover:bg-black text-white font-semibold px-7 py-3 rounded-full transition"
          >
            Log In
          </Link>
        </div>
      </section>

      {/* Features */}
      <section className="bg-white text-discord-bg-primary py-16 md:py-24 px-6 md:px-12">
        <div className="max-w-6xl mx-auto">
          <h2 className="text-3xl md:text-5xl font-extrabold text-center mb-4 text-black">
            Everything you need, all in one place
          </h2>
          <p className="text-center text-discord-text-muted mb-12 max-w-2xl mx-auto">
            From text chat to voice calls and video, real-time messaging to community management — built for your tribe.
          </p>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            <Feature icon={<Hash size={28} />} title="Text Channels" desc="Organize conversations by topic across servers and categories." />
            <Feature icon={<Mic size={28} />} title="Voice & Video" desc="Crystal-clear WebRTC voice and video, with one click to join." />
            <Feature icon={<MessageSquare size={28} />} title="Real-time Messaging" desc="Send, edit, delete and search messages instantly with live updates." />
            <Feature icon={<Users size={28} />} title="Servers & Members" desc="Create or join servers via invite codes. See who's online." />
            <Feature icon={<Shield size={28} />} title="Secure Auth" desc="Powered by Supabase Auth with row-level security on every table." />
            <Feature icon={<Zap size={28} />} title="Fast & Lightweight" desc="Built with React, Vite and Express. Snappy, modern, responsive." />
          </div>
        </div>
      </section>

      {/* CTA */}
      <section className="bg-discord-bg-primary py-16 px-6 text-center">
        <h2 className="text-2xl md:text-4xl font-extrabold text-white mb-4">
          Ready to start your journey?
        </h2>
        <p className="text-discord-text-muted mb-8">
          Create an account in seconds — no email verification required.
        </p>
        <div className="flex flex-col sm:flex-row gap-4 justify-center">
          <Link
            to="/auth?mode=register"
            className="bg-discord-brand hover:bg-discord-brand-hover text-white font-semibold px-8 py-3 rounded-full transition"
          >
            Register
          </Link>
          <Link
            to="/auth?mode=login"
            className="bg-discord-bg-tertiary hover:bg-black text-white font-semibold px-8 py-3 rounded-full transition"
          >
            Log In
          </Link>
        </div>
      </section>

      <footer className="bg-discord-bg-primary border-t border-discord-bg-accent text-center text-discord-text-muted text-xs py-6">
        Discord Clone — built for the competition
      </footer>
    </div>
  );
}

function Feature({ icon, title, desc }: { icon: React.ReactNode; title: string; desc: string }) {
  return (
    <div className="bg-discord-bg-secondary/5 hover:bg-discord-bg-secondary/10 rounded-xl p-6 border border-black/5 transition">
      <div className="w-12 h-12 rounded-lg bg-discord-brand text-white flex items-center justify-center mb-4">
        {icon}
      </div>
      <h3 className="text-lg font-bold mb-2 text-black">{title}</h3>
      <p className="text-sm text-discord-text-muted">{desc}</p>
    </div>
  );
}
