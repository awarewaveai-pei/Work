# 觀測堆疊決策（Grafana + Loki）：預設立場

**決策日**：2026-04-21  
**適用**：`lobster-factory/infra/hetzner-phase1-core/docker-compose.observability.yml`（Loki、Promtail、Grafana，僅綁 loopback + SSH tunnel）。

---

## 結論（已替你做的「最合理預設」）

1. **保留**目前的 **Loki + Promtail + Grafana**，不為了「看起來專業」而拆掉。  
   - 維護成本相對低、只聽本機埠、平常不必開。  
   - **價值集中在出事時**：用時間軸對 nginx / syslog **少開幾次 SSH**、少拼 `grep`。

2. **凍結擴張**：在沒有明確需求前，**不主動加** Prometheus、Node Exporter、cAdvisor、全叢集 Docker log 等。  
   - 那些會帶來 **指標與儲存成本**，也會讓 Grafana 變成「另一個要學的產品」；等你真的說要 **CPU／容器／延遲曲線** 再談增量。

3. **日常心態**：可把整包當 **備而不用（break-glass）**；**不必**每天登入 Grafana 才算有用。

4. **告警**：對外可用性仍以 **endpoint 探測 + Slack／PagerDuty** 為主；Grafana 的 log 告警 **選用**（需自己維護規則，避免誤報洗頻）。

---

## 若未來要改方向

- **只想更簡**：可停 observability compose（不影響「網站能開」本身），改回純 SSH 看 log。  
- **想要「大螢幕健康度」**：再開一案加 **metrics 管線**，Grafana 才會變成你直覺上的「監控主控台」。

---

**相關操作**：[`OBSERVABILITY_FIRST_TIME_SETUP_ZH.md`](OBSERVABILITY_FIRST_TIME_SETUP_ZH.md) · [`OBSERVABILITY_P1_P2_ROLLOUT.md`](OBSERVABILITY_P1_P2_ROLLOUT.md)
