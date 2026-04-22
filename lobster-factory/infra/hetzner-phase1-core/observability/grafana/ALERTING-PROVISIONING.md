# Grafana Alerting（檔案佈建說明）

**不要**在 `provisioning/alerting/` 放 `README.md`：Grafana 會掃描該目錄並抱怨副檔名。

動態產生的檔案（**不入 git**）：

- `provisioning/alerting/awarewave-slack-contact-and-policy.yaml`

由本機 vault 寫入 VPS：

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File .\scripts\sync-hetzner-grafana-alerting-slack.ps1
```

效果：

- **Contact point**：`infra-alerts-slack`（與 `AGENCY_OS_SLACK_WEBHOOK_URL` 相同）
- **根通知政策**：預設路由改為上述 Slack（含 `resetPolicies`）

之後在 Grafana **Alerting → Alert rules** 自建規則（例如 Loki），觸發時會走 Slack。

---

## 儀表板與首頁

- **登入首頁**：`dashboards-home/aw-obs-home.json`（`GF_DASHBOARDS_DEFAULT_HOME_DASHBOARD_PATH`，與檔案佈建分開避免 uid 重複）。
- **Browse → AwareWave**：`dashboards/*.json` 經 `provisioning/dashboards/default.yaml` 載入（含 **觀測範圍說明**、合併日誌、Syslog 速查、日誌量快照、Nginx 錯誤速查等）。

推到 VPS：

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File .\scripts\sync-hetzner-observability-grafana-content.ps1
```

完成後：**Home** 應為 **AwareWave 觀測首頁**；**Dashboards → Browse → AwareWave** 另有預設儀表板。
