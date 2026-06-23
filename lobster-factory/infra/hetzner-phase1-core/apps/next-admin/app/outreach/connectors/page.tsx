import { OutreachStub } from "../_components/OutreachStub";

export const metadata = { title: "Connectors · Cold Outreach" };

export default function ConnectorsPage() {
  return (
    <>
      <div className="topbar">
        <span className="topbar-title">Connectors 免費工具連接</span>
        <span className="topbar-env">客戶 BYO free key · Free-Plan Router · Quota Guard</span>
      </div>
      <OutreachStub
        title="Connectors"
        sub="每客戶 BYO 自己的免費 API key（Gemini / Hunter / Apify）→ 免費額度乘客戶數，agency 不吃 API 成本（PART H）。憑證只存 vault ref，不存實值。"
        next={[
          "為每個 org 設定客戶 BYO free key",
          "設 Quota Guard 月上限 + 警示門檻",
          "額度用完自動降級到下一階 fallback",
        ]}
      />
    </>
  );
}
