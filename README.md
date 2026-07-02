# Scripting Music

一款运行在 [Scripting](https://github.com/nicklockwood/Scripting) App 内的 iOS 音乐播放器，使用 TypeScript + SwiftUI-like DSL 编写。

## 功能特性

### 🎵 播放
- 全功能音频播放器，支持顺序 / 随机 / 单曲循环
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

## 技术架构

```
Scripting Music/
├── index.tsx              # 入口，TabView（资料库 / 发现 / 搜索 / 设置）
├── widget.tsx             # 主屏幕小组件（当前播放）
├── app_intents.tsx        # Shortcuts App Intent
├── class/
│   ├── player.ts          # 播放器核心（playToken 竞态、shuffle 历史栈、封面补抓）
│   ├── database.ts        # SQLite 数据库（music / playlist / download_task 表）
│   ├── download_center.ts # 全局下载中心单例（并发队列 + 订阅 + 启动对账）
│   ├── fetch_downloader.ts# 真实下载引擎（断点续传 + ID3 + 封面 + 歌词）
│   ├── file_manager.ts    # 音频 / 封面 / 歌词 / part 文件管理
│   ├── music.ts           # 音源入口（搜索 / 解析音频 URL / 解析视频 URL）
│   └── sources/
│       ├── source_mp3juice.ts  # MP3Juice 音源（YouTube → savetube CDN → AES-CBC 解密）
│       ├── itunes_meta.ts      # iTunes 搜索结果富化（批量并发 + 置信度护栏）
│       ├── itunes_browse.ts    # iTunes 艺人 / 专辑在线浏览
│       ├── resolve_real.ts     # 在线曲目解析真实 mp3juice 源（按评分选最佳）
│       ├── match_utils.ts      # 候选评分（标题 / 艺人 / 变体惩罚）
│       ├── artist_info.ts      # TheAudioDB 艺人信息（头像 / banner / 简介）
│       └── album_info.ts       # TheAudioDB 专辑信息（封面 / 简介）
├── page/
│   ├── library/           # 资料库页（首页 / 歌曲 / 艺人 / 专辑 / 播放列表 / 下载中心）
│   ├── player/            # 播放页（封面 / 歌词 / 控制栏 / 队列 sheet）
│   ├── discover/          # 发现页（榜单推荐 + 试听）
│   ├── search/            # 搜索页（歌曲 / 艺人 / 专辑 + 在线详情）
│   └── setting/           # 设置页（关于 / 存储 / 数据管理）
├── specs/                 # 需求与设计 spec 文档（按日期命名）
└── tests/                 # 单元测试
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

所有数据存储在设备本地（App 沙盒 + iCloud Drive）：

| 类型 | 路径 |
|------|------|
| SQLite 数据库 | `<Scripting iCloud>/scripts/Scripting Music/db/music.db` |
| 音频文件 | `<Scripting iCloud>/scripts/Scripting Music/audio/<id>.mp3` |
| 封面图片 | `<Scripting iCloud>/scripts/Scripting Music/covers/<id>.jpg` |
| 歌词文件 | `<Scripting iCloud>/scripts/Scripting Music/lyrics/<id>.json` |

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
