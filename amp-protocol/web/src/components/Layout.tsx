import { Link, useLocation } from "react-router-dom";
import { ConnectButton } from "@rainbow-me/rainbowkit";
import { type ReactNode } from "react";

const navLinks = [
  { href: "/",            label: "Home" },
  { href: "/browse",      label: "Browse" },
  { href: "/create",      label: "Create Listing", "data-testid": "nav-create" },
  { href: "/my/listings", label: "My Listings" },
  { href: "/my/orders",   label: "My Orders" },
];

export default function Layout({ children }: { children: ReactNode }) {
  const { pathname } = useLocation();
  return (
    <div className="min-h-screen bg-slate-50 text-slate-900">
      <header className="bg-white border-b border-slate-200 sticky top-0 z-10">
        <div className="max-w-7xl mx-auto px-6 flex items-center justify-between h-14">
          <Link to="/" className="flex items-center gap-2.5" data-testid="logo">
            <span className="bg-blue-600 text-white text-xs font-black px-2 py-1 tracking-widest">
              AMP
            </span>
            <span className="hidden md:block text-sm font-bold text-slate-700 tracking-wide">Protocol</span>
          </Link>

          <nav className="hidden md:flex items-center text-sm">
            {navLinks.map((link) => (
              <Link
                key={link.href}
                to={link.href}
                data-testid={link["data-testid"]}
                className={`px-3 py-4 text-sm border-b-2 transition-colors ${
                  pathname === link.href
                    ? "text-blue-600 font-semibold border-blue-600"
                    : "text-slate-500 hover:text-slate-900 border-transparent"
                }`}
              >
                {link.label}
              </Link>
            ))}
          </nav>

          <ConnectButton />
        </div>
      </header>
      <main className="max-w-7xl mx-auto px-6 py-8">{children}</main>
    </div>
  );
}
