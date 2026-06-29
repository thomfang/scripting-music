# 📱 Scripting Music UI/UX 优化方案

## 📊 当前问题分析

### 1. 搜索页面 (`page/search/components/search_result_card.tsx`)

#### ❌ 存在的问题

1. **状态显示不清晰**
   - ✅ 已下载状态有图标（绿色勾）
   - ❌ **收藏状态完全不可见**（只能通过长按菜单看到）
   - ❌ 下载中状态只显示进度圈，但位置在最右侧，不够明显

2. **交互设计问题**
   - 下载按钮**只在未下载时显示**，已下载后按钮消失
   - 收藏功能**隐藏在左滑和长按菜单**中，不够直观
   - 已下载歌曲**无法重新下载**或删除本地文件

3. **布局问题**
   - 右侧只有一个下载按钮，空间利用率低
   - 状态图标和操作按钮混在一起，不够清晰

#### 🎯 当前布局
```
[封面] [标题/艺人] [Spacer] [播放中图标] [下载按钮/状态]
         ↑点击播放                           ↑仅在未下载时显示
```

### 2. Library 各页面

#### 我喜欢 (`page/library/favorites.tsx`)

❌ **问题：**
- 只显示收藏状态（心形图标作为占位符）
- **没有下载按钮**，无法在此页面下载
- 无法看到歌曲是否已下载

#### 所有歌曲 (`page/library/all_songs.tsx`)

❌ **问题：**
- **收藏状态不可见**（虽然可以通过滑动/菜单操作）
- **没有下载按钮**
- 无法看到哪些歌曲已下载

#### 已下载 (`page/library/download.tsx`)

❌ **问题：**
- 只显示已下载的歌曲
- **收藏状态不可见**
- 没有显示文件大小等信息（虽然有函数但未使用）

#### 最近播放/最爱精选 (`page/library/smart_playlists.tsx`)

❌ **问题：**
- 只有基本信息
- **无下载按钮**
- **收藏状态不可见**

#### 播放列表详情 (`page/library/playlists.tsx`)

❌ **问题：**
- 类似其他页面的问题
- 无法批量下载歌曲

---

## ✅ 优化方案

### 方案 A：完整优化（推荐）

#### 1. 搜索结果卡片 - 新布局

```
┌────────────────────────────────────────────────────────┐
│ [封面]  标题                    [收藏] [下载] [更多]   │
│        艺人 · 专辑              [❤️]  [⬇️]  [⋯]      │
│                                                        │
│   ↑点击播放                     ↑状态按钮区            │
└────────────────────────────────────────────────────────┘
```

**功能说明：**

1. **收藏按钮**
   - 未收藏：空心❤️（灰色）
   - 已收藏：实心❤️（粉色）
   - 点击：切换收藏状态

2. **下载按钮**
   - 未下载：⬇️（蓝色）- 点击下载
   - 下载中：进度圈 + 取消按钮
   - 已下载：✓（绿色）- 点击查看选项（重新下载/删除）

3. **更多按钮（⋯）**
   - 添加到播放列表
   - 立即播放
   - 下一首播放
   - 查看艺人/专辑

**优点：**
- ✅ 所有状态一目了然
- ✅ 常用操作（收藏、下载）一键完成
- ✅ 符合用户习惯（类似 Apple Music）

#### 2. Library 页面 - 统一的歌曲行组件

**创建通用组件：`MusicRow`**

```tsx
<MusicRow
  music={music}
  showFavorite={true}      // 是否显示收藏按钮
  showDownload={true}      // 是否显示下载按钮
  showFileSize={false}     // 是否显示文件大小
  onPlay={...}
  onFavorite={...}
  onDownload={...}
  onMore={...}
/>
```

**不同页面的配置：**

| 页面 | 收藏按钮 | 下载按钮 | 文件大小 | 特殊功能 |
|------|---------|---------|---------|---------|
| **所有歌曲** | ✅ 显示 | ✅ 显示 | ❌ | - |
| **我喜欢** | ✅ 实心固定 | ✅ 显示 | ❌ | 滑动取消收藏 |
| **已下载** | ✅ 显示 | ✅ 实心固定 | ✅ 显示 | 显示大小 |
| **最近播放** | ✅ 显示 | ✅ 显示 | ❌ | 显示时间 |
| **最爱精选** | ✅ 显示 | ✅ 显示 | ❌ | 显示次数 |
| **播放列表** | ✅ 显示 | ✅ 显示 | ❌ | - |

**新布局：**

```
┌────────────────────────────────────────────────────────┐
│ [封面]  标题                    [❤️] [⬇️] [⋯]         │
│        艺人                                            │
│        额外信息（文件大小/播放次数/时间）                │
└────────────────────────────────────────────────────────┘
```

#### 3. 状态图标设计规范

**收藏状态：**
- `heart` (空心灰色) - 未收藏
- `heart.fill` (实心粉色) - 已收藏

**下载状态：**
- `arrow.down.circle` (蓝色) - 未下载，点击下载
- `arrow.down.circle.fill` + 进度 - 下载中
- `checkmark.circle.fill` (绿色) - 已下载

**播放状态：**
- `waveform` (强调色) - 正在播放
- `play.circle` (灰色) - 暂停/未播放

---

### 方案 B：渐进优化（快速实施）

**阶段 1：添加状态指示器（最小改动）**

在现有布局右侧添加状态小圆点：

```
[封面] [标题/艺人] [Spacer] [❤️收藏] [⬇️下载] [原有按钮]
```

- 收藏：小心形图标（8x8）
- 下载：小圆点（已下载=绿色，未下载=透明）

**阶段 2：改进交互**

- 添加收藏快捷按钮
- 下载按钮改为状态指示+操作按钮

**阶段 3：统一组件**

- 创建通用 MusicRow 组件
- 逐步迁移各页面

---

## 🎨 详细设计规范

### 1. 搜索结果卡片（完整版）

```tsx
<HStack spacing={12}>
  {/* 封面 */}
  <Image ... frame={{ width: 56, height: 56 }} />
  
  {/* 信息区 */}
  <VStack alignment="leading" spacing={4} flex={1}>
    <Text font="headline">{title}</Text>
    <HStack spacing={4}>
      <Text font="subheadline">{artist}</Text>
      {album && (
        <>
          <Text>·</Text>
          <Text font="subheadline">{album}</Text>
        </>
      )}
    </HStack>
  </VStack>
  
  {/* 操作按钮区 */}
  <HStack spacing={8}>
    {/* 收藏按钮 */}
    <Button onTap={toggleFavorite} frame={{ width: 44, height: 44 }}>
      <Image
        systemName={isFavorite ? "heart.fill" : "heart"}
        tint={isFavorite ? "systemPink" : "secondaryLabel"}
        font="title3"
      />
    </Button>
    
    {/* 下载按钮 */}
    <DownloadButton
      isDownloaded={isDownloaded}
      isDownloading={isDownloading}
      progress={downloadProgress}
      onDownload={handleDownload}
      onCancel={handleCancelDownload}
    />
    
    {/* 更多按钮 */}
    <Menu>
      <Button title="添加到播放列表" />
      <Button title="立即播放" />
      <Button title="下一首播放" />
    </Menu>
  </HStack>
</HStack>
```

### 2. Library 通用歌曲行

```tsx
export function MusicRow({
  music,
  isPlaying,
  showFavorite = true,
  showDownload = true,
  showFileSize = false,
  extraInfo,
  onPlay,
  onFavorite,
  onDownload,
  onMore,
}: MusicRowProps) {
  return (
    <HStack spacing={12} onTapGesture={onPlay}>
      {/* 封面 */}
      <CoverImage musicId={music.id} size={48} />
      
      {/* 信息 */}
      <VStack alignment="leading" spacing={2} flex={1}>
        <Text font="body" foregroundStyle={isPlaying ? "accentColor" : "primary"}>
          {music.title}
        </Text>
        <Text font="caption" foregroundStyle="secondaryLabel">
          {music.artist}
        </Text>
        {extraInfo && (
          <Text font="caption2" foregroundStyle="tertiaryLabel">
            {extraInfo}
          </Text>
        )}
      </VStack>
      
      {/* 状态&操作 */}
      <HStack spacing={12}>
        {isPlaying && <Image systemName="waveform" tint="accentColor" />}
        
        {showFavorite && (
          <Button onTap={onFavorite}>
            <Image
              systemName={music.is_favorite ? "heart.fill" : "heart"}
              tint={music.is_favorite ? "systemPink" : "tertiaryLabel"}
              font="body"
            />
          </Button>
        )}
        
        {showDownload && (
          <DownloadIndicator
            isDownloaded={music.is_downloaded}
            fileSize={showFileSize ? music.file_size : undefined}
            onDownload={onDownload}
          />
        )}
      </HStack>
    </HStack>
  )
}
```

### 3. 下载按钮组件

```tsx
export function DownloadButton({
  isDownloaded,
  isDownloading,
  progress = 0,
  onDownload,
  onCancel,
  onShowOptions,
}: DownloadButtonProps) {
  if (isDownloading) {
    return (
      <Button onTap={onCancel} frame={{ width: 44, height: 44 }}>
        <ZStack>
          <Circle stroke="accentColor" opacity={0.3} />
          <Circle trim={{ from: 0, to: progress }} stroke="accentColor" />
          <Text font="caption2">{Math.round(progress * 100)}%</Text>
        </ZStack>
      </Button>
    )
  }
  
  if (isDownloaded) {
    return (
      <Menu
        label={
          <Image
            systemName="checkmark.circle.fill"
            tint="systemGreen"
            font="title3"
          />
        }
      >
        <Button title="重新下载" action={onDownload} />
        <Button title="删除本地文件" role="destructive" />
      </Menu>
    )
  }
  
  return (
    <Button onTap={onDownload} frame={{ width: 44, height: 44 }}>
      <Image
        systemName="arrow.down.circle"
        tint="accentColor"
        font="title3"
      />
    </Button>
  )
}
```

---

## 📋 实施优先级

### P0 - 核心体验（立即实施）

1. ✅ **搜索页面添加收藏状态指示**
   - 在右侧按钮区添加收藏按钮
   - 显示收藏状态（实心/空心）
   
2. ✅ **Library 页面添加下载按钮**
   - 所有歌曲、我喜欢、播放列表等页面
   - 统一添加下载按钮

### P1 - 状态可见性（第二阶段）

3. ✅ **统一状态图标设计**
   - 收藏：心形图标
   - 下载：圆形下载图标
   - 播放：波形图标

4. ✅ **改进下载按钮交互**
   - 已下载状态可以查看选项
   - 下载中显示进度百分比

### P2 - 组件化（优化阶段）

5. ⏳ **创建通用 MusicRow 组件**
   - 提取公共逻辑
   - 减少代码重复

6. ⏳ **创建通用 DownloadButton 组件**
   - 统一下载交互
   - 复用于所有页面

### P3 - 增强功能（后续迭代）

7. ⏳ **批量操作优化**
   - 批量下载
   - 批量收藏/取消收藏

8. ⏳ **更多菜单增强**
   - 查看艺人
   - 查看专辑
   - 分享歌曲

---

## 🎯 预期效果

### 用户体验提升

| 场景 | 优化前 | 优化后 |
|------|--------|--------|
| **查看收藏状态** | 需要长按菜单 | 一眼看到❤️图标 |
| **收藏歌曲** | 左滑或长按 | 点击❤️按钮 |
| **下载歌曲** | 右滑或长按 | 点击⬇️按钮 |
| **已下载状态** | 绿色勾，无法操作 | 绿色勾+菜单（重新下载/删除） |
| **Library下载** | ❌ 无法操作 | ✅ 一键下载 |

### 视觉一致性

- ✅ 所有页面使用统一的图标语言
- ✅ 状态清晰可见
- ✅ 操作按钮位置固定
- ✅ 符合 iOS/Material Design 规范

---

## 📐 UI 测量参考

### 尺寸规范

- **封面**：48x48（列表）/ 56x56（搜索）
- **图标按钮**：44x44（可点击区域）
- **图标大小**：18-22pt (title3/body)
- **间距**：8-12pt

### 颜色规范

- **收藏**：systemPink / secondaryLabel
- **下载**：accentColor / systemGreen
- **播放**：accentColor
- **删除**：systemRed
- **文本**：primary / secondaryLabel / tertiaryLabel

---

## 🚀 快速开始

### 最小可行方案（30分钟）

1. 修改搜索结果卡片，添加收藏按钮
2. 修改 favorites.tsx，添加下载按钮
3. 修改 all_songs.tsx，添加下载按钮

### 完整实施（2-3小时）

1. 创建 MusicRow 组件
2. 创建 DownloadButton 组件
3. 迁移所有页面使用新组件
4. 测试各种状态组合

---

## 📝 附录：参考设计

### Apple Music 布局分析

```
搜索结果：
[封面] [标题/艺人] [+添加] [⋯更多]

资料库：
[封面] [标题/艺人] [❤️] [⬇️] [⋯]
```

### Spotify 布局分析

```
搜索结果：
[封面] [标题/艺人] [Spacer] [❤️] [⋯]

我的歌曲：
[封面] [标题/艺人] [❤️已收藏] [⬇️已下载]
```

### 建议采用

**混合方案**：参考 Apple Music 的简洁 + Spotify 的状态可见性

```
[封面] [标题/艺人] [Spacer] [❤️] [⬇️] [⋯]
       ↑点击播放              ↑状态&快捷操作
```
