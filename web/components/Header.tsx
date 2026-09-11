"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import s from "./Header.module.css";

const NAV = [
  { href: "/", label: "Overview" },
  { href: "/lenses", label: "Lenses" },
  { href: "/verify", label: "Verify" },
];

export default function Header() {
  const path = usePathname();
  const [health, setHealth] = useState<{ ok: boolean; version: string | null } | null>(null);

  useEffect(() => {
    let alive = true;
    const poll = async () => {
      try {
        const r = await fetch("/api/health", { cache: "no-store" });
        const h = await r.json();
        if (alive) setHealth({ ok: Boolean(h.ok), version: h.version ?? null });
      } catch {
        if (alive) setHealth({ ok: false, version: null });
      }
    };
    poll();
    const t = setInterval(poll, 15000);
    return () => { alive = false; clearInterval(t); };
  }, []);

  return (
    <header className={s.top}>
      <div className={`wrap ${s.bar}`}>
        <Link href="/" className={s.brand} aria-label="Ballast home">
          <svg viewBox="0 0 24 24" fill="none" aria-hidden className={s.mark}>
            <path d="M12 4.6v15.2M12 3a1.9 1.9 0 100 3.8A1.9 1.9 0 0012 3zM4.8 12.2a7.2 7.2 0 0014.4 0M3.4 12.2h2.8M17.8 12.2h2.8"
              stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
          </svg>
          <span>Ballast</span>
        </Link>

        <nav className={s.nav}>
          {NAV.map((n) => (
            <Link key={n.href} href={n.href} className={path === n.href ? `${s.link} ${s.on}` : s.link}>
              {n.label}
            </Link>
          ))}
        </nav>

        <div className={s.status} title={health?.ok ? "Connected to a Canton participant" : "No ledger reachable"}>
          <span className={`${s.dot} ${health === null ? s.idle : health.ok ? s.live : s.down}`} />
          <span className="mono" style={{ fontFamily: "var(--font-mono)" }}>
            {health === null ? "connecting" : health.ok ? `canton ${health.version}` : "no ledger"}
          </span>
        </div>
      </div>
    </header>
  );
}
