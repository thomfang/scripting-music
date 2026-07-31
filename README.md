# Scripting Music

一款运行在 [Scripting](https://apps.apple.com/us/app/scripting/id6479691128) App 内的 iOS 音乐播放器，使用 TypeScript + SwiftUI-like DSL 编写。

## 功能特性

### 🎵 播放
- 全功能音频播放器，支持顺序 / 随机 / 单曲循环 / 列表循环
- 锁屏 / 控制中心 Now Playing 信息与封面同步
- 歌词同步显示（本地 LRC + 在线 LRCLIB 兜底，自动落盘缓存）
- 待播队列管理（拖拽排序、移除、播放模式切换）
- 播放页 Apple Music 风格动态背景（MeshGradient 点位形变 + 色相漂移）
- 睡眠定时器

### 📚 资料库
- 歌曲、艺人、专辑、播放列表完整管理
- 智能列表：最近添加、最近播放、最常播放、我喜欢
- 下载完成后自动静默刷新首页数据
- 批量下载与全局下载中心（并发上限 3、断点续传、启动对账恢复）

### 🔍 搜索
- 在线搜索歌曲（MP3Juice 源）+ iTunes 元数据富化（艺人 / 专辑 / 封面 / 时长）
- 本地库搜索歌曲、艺人、专辑
- 在线艺人 / 专辑浏览（iTunes Search API）
- 搜索结果智能匹配：按艺人 + 标题 + 变体惩罚评分，防止下载到同名其他歌手的版本

### 🌟 发现
- 多流派 iTunes 榜单推荐（另类 / 唱作人 / 电子 / 摇滚 / 流行）
- 每日按天轮换推荐（PRNG seed = 日期 + 库指纹 + nonce），支持手动刷新
- 30 秒试听（itunes_preview）+ 一键完整下载
- contextMenu：试听 / 完整播放 / 下载 / 加歌单

### 🎤 艺人 / 专辑详情
- TheAudioDB 艺人图片（头像 + banner）、简介、流派、成立年
- TheAudioDB 专辑封面、简介、年份、厂牌
- 在线艺人专辑墙，可直接播放或下载曲目

### ⬇️ 下载
- 全局下载中心：队列 / 暂停 / 继续 / 取消 / 重试 / 批量控制
- 断点续传（`.part` 落盘 + Range 请求）
- 下载完成自动写入 ID3 标签、封面、歌词
- 播放时自动为缺少封面的已下载歌曲补抓封面（fire-and-forget）

### 🏠 Scripting Home Screen
- 提供 `home_screen_default_ui.tsx` 官方 Home Tab 入口，无需启动独立脚本窗口
- 资料库 / 发现 / 搜索 / 设置共用顶部 Liquid Glass 导航和底部 MiniPlayer
- 已访问页面懒加载后保持挂载，切换时保留滚动位置、搜索内容和局部 UI 状态
- 下载中心与播放全部 / 随机播放整合到常驻 Toolbar Menu
- iOS 26 使用 Liquid Glass；旧系统自动使用普通圆角背景降级

## 技术架构

项目同时提供普通脚本、Scripting Home Screen、小组件和 App Intent 四类入口，共用播放器、数据库、文件管理与下载运行时：

```text
index.tsx ───────────────────────┐
home_screen_default_ui.tsx ─────┼─> class/app_runtime.ts
app_intents.tsx ─────────────────┘       ├─ Player / AVPlayer
                                        ├─ SQLite / MusicFileManager
                                        └─ DownloadCenter / FetchDownloader
widget.tsx <──── Storage("now_playing") <─ Player
```

- `initializeCoreRuntime()` 初始化播放器、文件目录和 SQLite；由普通 UI、Home Screen 和 App Intent 共享。
- `initializeDownloadRuntime()` 单独恢复下载任务；Home Screen 中恢复失败会降级为可重试 warning，不阻断资料库使用。
- `AsyncInitializer` 让并发初始化共享同一 Promise，成功后幂等，失败后允许重试。
- `DownloadCenter` 是模块级单例，维护并发上限为 3 的队列、响应式订阅、数据库任务和跨会话 recovery snapshot。
- 普通入口使用 `Navigation.present()`；Home Screen 由宿主长期挂载，使用单一 `NavigationStack`，不调用 `Navigation.present()` 或 `Script.exit()`。

```text
Scripting Music/
├── index.tsx                      # 普通脚本入口：初始化后呈现四 Tab App
├── home_screen_default_ui.tsx     # Scripting Home Tab 官方入口
├── widget.tsx                     # 小 / 中 / 大号当前播放小组件入口
├── app_intents.tsx                # 播放/暂停、上一首、下一首 App Intent
├── class/
│   ├── app_runtime.ts             # 普通 UI / Home / Intent 共用初始化编排
│   ├── async_initializer.ts       # 并发共享、失败可重试的初始化状态机
│   ├── player.ts                  # AVPlayer、队列、播放模式、Now Playing、会话恢复
│   ├── player_state.tsx           # 播放器状态订阅与 UI Provider
│   ├── database.ts                # SQLite：歌曲、歌单、搜索历史、下载任务
│   ├── setting.ts                 # appGroup / iCloud 存储位置选择
│   ├── storage_migration.ts       # 存储迁移、数据库重开与失败回滚
│   ├── file_manager.ts            # 音频、封面、歌词和 .part 文件管理
│   ├── download_center.ts         # 全局并发队列、订阅、启动对账与恢复
│   ├── download_snapshot.ts       # 未入库下载任务的跨会话恢复快照
│   ├── fetch_downloader.ts        # Range 断点续传、ID3、封面和歌词写入
│   ├── music.ts                   # 音源搜索及音频/视频 URL 解析入口
│   └── sources/                   # MP3Juice、iTunes、TheAudioDB 与匹配逻辑
├── page/
│   ├── index.tsx                  # 普通四 Tab App Shell
│   ├── main_section_content.tsx   # 普通 App / Home 共用主区域工厂与缓存容器
│   ├── home_screen/               # Home Shell、Glass 导航、MiniPlayer 容器
│   ├── library/                   # 资料库、歌单、歌曲/艺人/专辑、下载中心
│   ├── player/                    # 播放页、歌词、控制栏、队列
│   ├── discover/                  # 榜单推荐和试听
│   ├── search/                    # 本地/在线搜索及艺人/专辑详情
│   └── setting/                   # 存储切换、缓存管理和关于
├── widget/                        # 小 / 中 / 大号小组件视图
├── specs/                         # SDD 需求与设计文档
└── tests/                         # CLI / UI runner 共用的单元测试套件
```

## 运行环境

- **iOS 17+**（需安装 [Scripting App](https://apps.apple.com/us/app/scripting/id6479691128)）
- Scripting App 版本 ≥ 2.x
- 不需要 Mac、不需要 Xcode

## 一键安装

在已安装 Scripting App 的设备上，点击以下链接即可一键导入本项目：

**[👉 点击安装 Scripting Music](https://scripting.fun/import_scripts?urls=%5B%22https%3A%2F%2Fgithub.com%2Fthomfang%2Fscripting-music%22%5D)**

## 开始使用

1. 点击上方「一键安装」链接，在 Scripting App 中导入项目。
2. 运行入口文件 `index.tsx` 或在 App 内点击「Scripting Music」脚本。
3. 进入「搜索」Tab 搜索歌曲，点击下载按钮将歌曲保存到本地资料库。
4. 进入「资料库」Tab 管理已下载的歌曲。

## 数据存储

音乐数据默认保存在 **Scripting App Group Documents**，而不是脚本源码所在的 iCloud `scripts/Scripting Music` 目录。用户可以在「设置 → 存储位置」切换到 iCloud；迁移会复制完整数据目录、重开 SQLite，并在失败时回滚。

| 存储模式 | 基础目录 `<root>` |
|---------|------------------|
| 本地（默认） | `<Scripting App Group Documents>/Scripting Music` |
| iCloud（可选） | `<Scripting iCloud Documents>/Scripting Music` |

基础目录结构：

| 类型 | 实际路径 |
|------|---------|
| SQLite 数据库 | `<root>/music.db`（运行时可能同时存在 `-wal` / `-shm`） |
| 音频文件 | `<root>/audios/<id>.<format>`（支持 mp3 / m4a / ogg / flac / wav） |
| 封面图片 | `<root>/covers/<id>.jpg` |
| 歌词缓存 | `<root>/lyrics/<id>.json` |
| 断点续传分片 | `<root>/downloads/<id>.part` |

SQLite 当前包含 `music`、`playlist`、`playlist_music`、`search_history` 和 `download_task` 等表。播放队列、当前歌曲、播放模式、Home 当前 section、Now Playing 小组件数据和下载恢复 snapshot 使用 Scripting 的键值 `Storage` 保存，不位于上述文件目录中。

切换存储位置时，应用会阻止活动下载或播放造成的数据竞争；迁移流程关闭数据库、复制整个基础目录、重新打开数据库并初始化目录，成功后再清理旧位置。

## 测试

测试 CLI 与 UI runner 共用 `tests/all_suites.ts`。当前覆盖存储迁移、数据库 upsert、歌单完整性与分享、资源匹配、异步初始化、Home Screen 模型和下载恢复 snapshot 等核心纯逻辑。

```sh
scripting-ts run tests/run_tests.ts
```

## 许可证

本项目以 [GNU General Public License v3.0](https://www.gnu.org/licenses/gpl-3.0.html)（GPL-3.0）发布。

```
Copyright (C) 2024-2026  Scripting Music Contributors

This program is free software: you can redistribute it and/or modify
it under the terms of the GNU General Public License as published by
the Free Software Foundation, either version 3 of the License, or
(at your option) any later version.

This program is distributed in the hope that it will be useful,
but WITHOUT ANY WARRANTY; without even the implied warranty of
MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE. See the
GNU General Public License for more details.
```

## 免责声明

本项目仅供个人学习与研究使用。音频内容的版权归原始权利人所有，请在当地法律允许的范围内使用本软件，并尊重版权。
