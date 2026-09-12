"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import s from "./Header.module.css";

const NAV = [
  { key: "F1", href: "/", label: "OVERVIEW" },
  { key: "F2", href: "/terminal", label: "MANAGER" },
  { key: "F3", href: "/invest", label: "INVESTOR" },
  { key: "F4", href: "/verify", label: "VERIFY" },
];

export default function Header() {
  const path = usePathname();
  const [health, setHealth] = useState<{ ok: boolean; version: string | null } | null>(null);
  const [clock, setClock] = useState("");

  useEffect(() => {
    const tick = () => setClock(new Date().toISOString().slice(11, 19) + "Z");
    tick();
    const t = setInterval(tick, 1000);
    return () => clearInterval(t);
  }, []);

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
        <Link href="/" className={s.brand}>
          <span className={s.mark}>▮</span>BALLAST
        </Link>
        <span className={s.sep} />
        <span className={s.fund}>BALLAST-01</span>
        <span className={s.desc}>PRIVATE INDEX FUND · CANTON</span>

        <nav className={s.nav}>
          {NAV.map((n) => (
            <Link key={n.href} href={n.href} className={path === n.href ? `${s.key} ${s.on}` : s.key}>
              <span className={s.keyNum}>{n.key}</span>
              {n.label}
            </Link>
          ))}
        </nav>

        <div className={s.stat}>
          <span className={`${s.dot} ${health === null ? s.idle : health.ok ? s.live : s.down}`} />
          <span>{health === null ? "LINK…" : health.ok ? `CANTON ${health.version}` : "NO LINK"}</span>
          <span className={s.clock}>{clock}</span>
        </div>
      </div>
    </header>
  );
}
