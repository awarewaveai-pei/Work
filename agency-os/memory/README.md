# `agency-os/memory/` 一頁看懂（避免誤以為「都寫好了」）

**給操作者**：你只要打 **`AO-CLOSE`**；**不要**自己背腳本參數。其餘（補 **WORKLOG**、跑 **`ao-close.ps1`**、被擋就重跑）一律由 **Cursor 代理**依 **`.cursor/rules/40-shutdown-closeout.mdc`** 做完。

| 檔案 | 誰寫、何時寫 | 和 **AO-CLOSE**／**AO-RESUME** 的關係 |
|:---|:---|:---|
| **`CONVERSATION_MEMORY.md`** | **長期脈絡**；里程碑／長對話由**代理或你**依 **`.cursor/rules/10-memory-maintenance.mdc`** 補敘事。 | **AO-CLOSE** 僅可能加**一則指標列**（指到當日 **WORKLOG** 的 inbox verbatim 區塊），**不**等於當日完整長期摘要已寫完。 |
| **`daily/YYYY-MM-DD.md`** | **當日草稿／細節**；可手寫，也可被 **inbox merge** 追加區塊。 | **AO-CLOSE** 的 **`merge-closeout-inbox-into-progress.ps1`** 可能追加 **Closeout inbox** 小節。 |
| **`LAST_AO_RESUME_BRIEF.md`** | **上一次**你打 **`AO-RESUME`** 時，由代理**整檔覆寫**（只留最新一次）。 | **與 AO-CLOSE 無關**。沒打 AO-RESUME 就不會更新；**不是**任務真相 SSOT。 |
| **`SESSION_TEMPLATE.md`** | **空白範本**，供複製結構用。 | **腳本不會改**。 |

**單一真相提醒**：任務與證據仍以 **`TASKS.md`**、**`WORKLOG.md`**、**`reports/`** 為準；本目錄是**續接與脈絡**，不要只靠「有沒有動到 memory」判斷收工是否完整。

**機械防漏**：**`ao-close.ps1`** 在 **`git add`** 之後會跑 **`scripts/verify-closeout-completeness.ps1`**（預設 **strict**）——暫存區若有「顯著」變更，當日 **`WORKLOG`** 必須已有 **`- AUTO_TASK_DONE:`** 或 **`Closeout inbox (AO-CLOSE auto`** 區塊，否則**中止 commit**（不必靠你肉眼猜）。

**相關規則**：**`40-shutdown-closeout.mdc`**（收工）、**`30-resume-keyword.mdc`**（開工）、**`10-memory-maintenance.mdc`**（記憶維護）。
