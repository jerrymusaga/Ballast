import Link from "next/link";
import InvestorFlow from "@/components/InvestorFlow";
import Panel from "@/components/Panel";
import s from "./page.module.css";

export const dynamic = "force-dynamic";

export default function InvestPage() {
  return (
    <main className={s.main}>
      <div className="wrap">
        <div className={s.intro}>
          <h1 className={s.h1}>Join the fund and watch what you&rsquo;re given.</h1>
          <p className={`prose ${s.p}`}>
            This is the other side of the terminal. You arrive as a stranger with a brand-new
            identity on the ledger, ask to join, put money in, and receive units — while the
            strategy you are now invested in stays invisible to you throughout.
          </p>
        </div>

        <Panel code="01" title="Become an investor" flush>
          <InvestorFlow />
        </Panel>

        <p className={`prose ${s.foot}`}>
          Every step above is a real transaction on a real ledger. When you are done,{" "}
          <Link href="/terminal" className={s.link}>open the terminal</Link> to see the same fund
          from the manager&rsquo;s side — and try to make it break its own rules.
        </p>
      </div>
    </main>
  );
}
