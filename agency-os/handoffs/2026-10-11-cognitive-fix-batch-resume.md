# 認知平台整批修：斷電接手點（2026-10-11）

問題清單：`2026-10-11-cognitive-platform-walk-issues.md`。四個修理工作區都在硬碟上，斷電不會掉。

| 工作區 | 狀態 | 下一步 |
|---|---|---|
| D:/tmp/fix-webcore | 已 commit 00ab9b132 | 等合併 |
| D:/tmp/fix-webpages | 已 stage 31 檔，未 commit | `git commit -F <scratchpad>/commit1.txt` |
| D:/tmp/fix-collect | 已 stage 20 檔，未 commit | `git commit -F <scratchpad>/msg.txt` |
| D:/tmp/fix-engine | 53 檔有改動，worker（ac82ec936bd42e851）做到一半，斷電即中止 | 新 session 讀 `git -C D:/tmp/fix-engine diff` 對照 A1–A5、B1、B8、C1、C2、C3、GATHER 不停止規則（gather.py:53），補完剩的再跑 `python scripts/affected_tests.py --run` |

scratchpad = `C:/Users/user1115/AppData/Local/Temp/claude/D--Work/1a2ecb41-b711-4170-a92e-1b1313cd35e8/scratchpad`

之後：
1. commit 前先單獨跑 `powershell -NoProfile -File D:/Work/scripts/verify-clear.ps1`。
2. 四組合進 main，跑一次受影響測試；engine 和 web 要一起部署（web 依賴 `GET …/docs?kinds=` 和免 Tenant ID 登入）。
3. 問操作者「部署」：COS deploy.sh、next-admin sg-deploy、BRAVE_SEARCH_API_KEY 放進 next-admin 容器（printenv 只看長度）。
4. 部署後重走全部積木；刪測試案子 3b2375d3-0f48-43f1-a0eb-caf3047fae91；清 D:/tmp/fix-*（先 os.rmdir node_modules junction）。
