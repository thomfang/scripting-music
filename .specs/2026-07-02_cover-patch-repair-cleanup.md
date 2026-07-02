# Spec: 播放时补封面 + 删修复工具 + audio_url 澄清

Date: 2026-07-02  
Status: IN_PROGRESS

## 背景

1. 老数据若 `cover_url` 为空或有 URL 但无本地封面文件，播放页无封面。
2. `ResourceRepairView`（修复歌曲资源）已过期：`diagnose()` 把所有 mp3juice 歌曲（`audio_url=""` 是设计行为）误标为需要修复。
3. `audio_url` 字段：对 mp3juice 歌曲无意义；但 **iTunes Preview 流（provider=itunes_preview）依赖它存 30s 直链**，不能从 Music 类型中删除。

## Done Contract

- 播放一首无本地封面的歌时，自动补下封面（有 `cover_url` 直接存本地；无则 iTunes search → 写 DB `cover_url` → 存本地）
- 补完后 `use_cover.ts` 刷新显示（通过 `onCoverPatched` 事件）
- 设置页「资源管理」section 及两个文件删除
- audio_url: Music 类型保留（iTunes preview 需要）；DB schema 不动；player.ts 逻辑维持原样
- TS 诊断无报错

## 涉及文件

| 文件 | 操作 |
|---|---|
| `class/player.ts` | 新增 `onCoverPatched` PlayerEvent；新增 `patchCoverIfMissing()`；playMusic setSource 成功后 fire-and-forget |
| `page/player/use_cover.ts` | 去掉 `is_downloaded` 限制；订阅 `onCoverPatched` 刷新封面 |
| `page/setting/resource_repair.tsx` | 删除 |
| `page/setting/resource_repair_match.ts` | 删除 |
| `page/setting/index.tsx` | 删 import + "资源管理" section |

## patchCoverIfMissing 流程

```
① fileManager.coverExists(id) → 有 → return（已完整，不重复下）
② token 守卫（防止切歌后继续写旧歌封面）
③ cover_url 存在？
   是 → 直接 fetch cover → saveCover → updateNowPlayingInfo → emit onCoverPatched
   否 → enrichByTitle(title artist) → matched + meta.cover？
        是 → database.addMusic(cover_url=meta.cover) → 更新 this.currentMusic → emit onMusicChange
             → fetch cover → saveCover → updateNowPlayingInfo → emit onCoverPatched
        否 → return（无数据源，放弃）
④ 全程 try/catch 静默
```

## Change Log

- [done] spec 落盘
- [done] player.ts + use_cover.ts 改动
- [done] 删修复工具
- [done] 设置页清理
- [pending] TS 诊断 + commit
