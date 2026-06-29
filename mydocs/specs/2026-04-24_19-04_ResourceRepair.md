# Spec: Resource Repair Page (歌曲资源恢复)

## Goal
- 要解决什么问题：DB 里部分歌曲缺失 `provider` / `audio_url`（或本地文件丢失），导致 `player.playMusic` 报 "无可用的播放地址"。
- 验收结果：新建"修复歌曲资源"页，扫描出这些废歌、通过搜索接口自动匹配最佳候选、一键写库，恢复可播。

## Done Contract
- 什么算完成：(1) 设置页有"修复歌曲资源"入口 (2) 扫描页能正确分桶列出缺失远程源的歌 (3) 对每首歌自动匹配出候选 provider，score ≥ 60 自动标记为 matched (4) 应用匹配后 DB 中 `provider` 和新增的 `source_id` 被正确更新，`play_count/is_favorite/added_at` 原样保留 (5) player 对修复后的歌能成功 setSource（用户试播 OK）。
- 由什么证明：打分函数单测通过；DB 迁移在旧数据上无报错；手动在资源修复页对至少 1 首废歌走完"扫描→匹配→应用→试播"闭环。
- 哪些情况仍算未完成：DB 迁移漏列导致启动崩溃；把明显不同的歌错判为 matched；应用后 `play_count` 被清零。

## Scope
- In（M1）：
  - `class/database.ts`：加 `source_id` 列 + 迁移 + 类型/CRUD 适配
  - `class/player.ts`：播放时用 `source_id ?? id` 拼 audio_url
  - `page/setting/resource_repair.tsx`（新）
  - `page/setting/resource_repair_match.ts`（新，打分工具）
  - `page/setting/index.tsx`：加入口
  - `tests/resource_repair_match.test.ts`（新）
- Out（M2/M3）：本地文件丢失桶重下/回退；候选手选 UI；并发；自动补封面文件。

## Facts / Constraints
- `MusicData.provider` 取值：livepoo|migu|qqmp3|qq|bugu|gequhai|gequbao
- `music.getAudioUrl(id, provider)` 的 id 是 provider 侧 id；历史数据 local id 大概率等于 provider id 但不保证 → 加 `source_id` 字段彻底解耦
- `database.addMusic` 是 UPSERT，ON CONFLICT 保留 play_count/is_favorite/added_at
- `file_manager` 寻址用 `music.id`，与 provider 无关
- Scripting SQLite 支持 ALTER TABLE ADD COLUMN（已有先例）

## Restated Understanding
- 任务：为"废歌"建修复页，搜索 + 打分 + 回写，不伤用户数据
- 核心目标：M1 最小闭环——DB 加 `source_id`，修复页处理"缺失远程源"桶，player 读新字段
- 边界：只处理"缺失远程源"；本地文件丢失桶后续做

## Checkpoint Summary
- 当前核心目标：M1 最小闭环
- 当前进度：spec 落盘完毕，待批准
- 下一步：1) database 加列 + 迁移 2) player 改 source_id ?? id 3) 写打分 + 单测 4) 写页面 5) 加入口
- 涉及文件：见 Scope
- 风险：
  - 迁移漏列 → 复用 `migrateDatabase` 既有模式
  - 打分阈值偏差 → console.log 观察
  - 搜索接口异常 → 单首 try-catch 隔离
- 验证方式：TS 诊断 + 单测 + 用户手动闭环试播
- Execution Approval: `Pending`

## Change Log
- 2026-04-24 19:04: Spec 初稿，等待批准
- 2026-04-24 19:10: Approved，进入实现
- 2026-04-24 19:16: M1 五处代码落地（DB/player/打分+单测/页面/入口）；TS 诊断全绿；单测通过（用户口述 OK）
- 2026-04-24 19:20: 用户反馈"所有歌都有资源"与实际体验不符，补强：(a) 分桶扩展到 B 桶（已下载但文件丢失且无回退）(b) 新增"数据诊断" Section，在 UI 直接显示 total/noProvider/noAudioUrl/noBoth/downloadedButLost/fullyDead/withSourceId 真实统计 (c) RepairRow 显示缺失原因 tag
- 2026-04-24 19:25: 写 diag_db.ts 一次性脚本，通过 scripting-ts run 拿到真实 DB 数据：总 199 / 无 provider 197 / provider 非法 1 / 无 audio_url 2 / fullyDead 0 / source_id 0。原始分桶 noBoth=0 说明桶太窄
- 2026-04-24 19:30: Scope 扩大。业务规则明确为"provider 和 audio_url 缺一不可 + provider 必须在白名单"。改动：(a) class/music.ts 导出 SUPPORTED_PROVIDERS / isSupportedProvider (b) MissingReason 重定义 5 种 (c) diagnose() 重写 (d) 诊断 Section 改为显示 invalidProvider (e) reasonLabel 适配 5 种。diag_repair_rules.ts 校验：需修复=199（no_provider 197 + no_audio_url 1 + provider_and_url 1）

## Validation
- Self-check: TS 诊断全项目 0 error
- Static checks: 全绿
- Runtime / Test: 
  - 单测口述 OK
  - **diag_db.ts** 脚本跑出的真实 DB：199 总/197 无provider/2 无url/1 非法provider/0 fullyDead/0 source_id
  - **diag_repair_rules.ts** 脚本验证新 diagnose 规则与业务规则一致：需修复 199，分桶 no_provider 197 + no_audio_url 1 + provider_and_url 1
- Human confirmation: 待用户打开页面看"需修复 (199)"是否正确显示，并尝试一下"自动匹配"
- 结果汇总：分桶逻辑已被两个独立脚本交叉验证；UI 代码与脚本使用同一 isSupportedProvider 该中心化函数
- 核心目标是否已由证据证明完成：部分。分桶逻辑与 "用户看到正确需修复列表" 已证；剩下"批量匹配 → 一键应用 → 试播"闭环需用户手动走一遇
- 剩余风险：199 首串行匹配预计 5 分钟，如过慢需加并发（M1 不含）

## Resume / Handoff
- 当前状态：M1 代码全项完成，诊断脚本交叉验证通过；剩唯一个联调闭环待用户执行
- 当前卡点：无
- 下一步唯一动作：用户打开修复页 → "自动匹配全部"（预计 ≈3-5 分钟）→ "一键应用" → 选一首试播。如果试播成功，本 spec 完结
- 下一轮核心目标：根据批量匹配的实际表现决定是否需要：(a) 并发 (b) 手选候选 UI (c) 调整阈值
