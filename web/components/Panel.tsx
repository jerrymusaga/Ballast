import type { ReactNode } from "react";
import s from "./Panel.module.css";

/**
 * A framed readout. Every block of information on the site lives in one of these, with a
 * code in the title bar, so the page reads as a set of instruments rather than as sections
 * of a document.
 */
export default function Panel({
  code,
  title,
  right,
  children,
  flush = false,
}: {
  code: string;
  title: string;
  right?: ReactNode;
  children: ReactNode;
  flush?: boolean;
}) {
  return (
    <section className={s.panel}>
      <header className={s.bar}>
        <span className={s.code}>{code}</span>
        <h2 className={s.title}>{title}</h2>
        {right && <div className={s.right}>{right}</div>}
      </header>
      <div className={flush ? s.bodyFlush : s.body}>{children}</div>
    </section>
  );
}
