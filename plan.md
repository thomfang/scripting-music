# 抽取批量下载状态 UI 组件

1. [completed] 检查当前下载进度 UI 重复代码和 git 状态
2. [completed] 新增公共下载进度组件到 components 目录
3. [completed] 替换 AllSongs/Favorites/PlaylistDetail 重复 UI
4. [completed] 运行诊断并提交本地版本

## Micro Spec

- 当前理解：用户希望把批量下载进度条/状态 Section 抽成公共 UI 组件，减少 AllSongs/Favorites/PlaylistDetail 中重复 JSX；UI 组件必须放在 `page/components` 目录，不放 `class`。
- 核心目标：保持现有视觉和行为不变，仅把下载状态 UI 抽到可复用组件，并替换现有三处调用。
- Done Contract：公共组件接收 `BatchDownloadProgress | null`；为空不渲染；非空展示进度、成功/跳过/失败数、正在下载歌名和 ProgressView；项目级 TS 诊断通过；提交本地 git 版本。

## Validation

- 项目级 TypeScript 诊断通过：No TypeScript diagnostics。
- 下载进度 UI 组件已按要求放在 `page/components/batch_download_progress.tsx`。
- 本地 git commit：`ebf22e41b115fb62c7566e9c8487da559061ca5d` (`refactor: extract batch download progress UI`)。
