import {
  List,
  Section,
  Button,
  HStack,
  VStack,
  Text,
  Image,
  Spacer,
  Label,
  ProgressView,
  NavigationStack,
  Toolbar,
  ToolbarItem,
  useEffect,
  useMemo,
  useState,
} from "scripting"
import { database, Music } from "../../class/database"
import { music as musicService, MusicData, isSupportedProvider } from "../../class/music"
import { player } from "../../class/player"
import { fileManager } from "../../class/file_manager"
import { safeRun } from "../../class/safe_run"
import {
  MATCH_THRESHOLD,
  rankCandidates,
  MatchResult,
} from "./resource_repair_match"

/** 修复状态机（每首歌一份）。candidates 存整份 top N 候选，用于换源。 */
type RepairStatus =
  | { kind: "idle" }
  | { kind: "searching" }
  | { kind: "matched"; result: MatchResult; candidates: MatchResult[] }
  | { kind: "uncertain"; result: MatchResult; candidates: MatchResult[] }
  | { kind: "no_match" }
  | { kind: "applied"; result: MatchResult; candidates: MatchResult[] }
  | { kind: "error"; error: string }

type StatusMap = Record<string, RepairStatus>

/** 歌曲的资源缺失标签，用于分桶和诊断展示。
 * 业务规则：必须同时具备“provider 在白名单” + “非空 audio_url”，缺一不可。 */
type MissingReason =
  | "no_provider"          // provider 空
  | "invalid_provider"     // provider 有值但不在白名单
  | "no_audio_url"         // audio_url 空
  | "provider_and_url"     // provider 和 audio_url 都缺
  | "file_lost_no_fallback" // 已下载但文件丢 且 无有效回退

/** 歌曲伴随的扩展信息（扫描时填充） */
type AugInfo = {
  audioFileExists: boolean
  reason: MissingReason | null
}

type AugMap = Record<string, AugInfo>

/** 根据 DB row + 文件系统状态判定缺失原因。
 *  优先返回完全无法播放的极端 case，再返回单项缺失。 */
function diagnose(m: Music, audioFileExists: boolean): MissingReason | null {
  const rawProvider = m.provider?.trim() ?? ""
  const hasProvider = rawProvider.length > 0
  const providerValid = isSupportedProvider(rawProvider)
  const hasAudioUrl = !!m.audio_url && m.audio_url.trim().length > 0

  // 最严重：已下载但文件丢 + 无任何有效回退
  if (m.is_downloaded && !audioFileExists && !hasAudioUrl && !providerValid) {
    return "file_lost_no_fallback"
  }
  // 两者都缺（任意时刻都无法播，只要本地文件一删就完）
  if (!providerValid && !hasAudioUrl) return "provider_and_url"
  // 单项缺失
  if (!hasAudioUrl) return "no_audio_url"
  if (!hasProvider) return "no_provider"
  if (!providerValid) return "invalid_provider"
  return null
}

export function ResourceRepairView() {
  const [allMusics, setAllMusics] = useState<Music[]>([])
  const [augMap, setAugMap] = useState<AugMap>({})
  const [scanning, setScanning] = useState(true)
  const [statusMap, setStatusMap] = useState<StatusMap>({})
  const [matchingAll, setMatchingAll] = useState(false)
  const [applyingAll, setApplyingAll] = useState(false)
  const [matchProgress, setMatchProgress] = useState<{ done: number; total: number }>({ done: 0, total: 0 })
  /** 当前打开换源 sheet 的歌；null 表示未打开 */
  const [switchingFor, setSwitchingFor] = useState<Music | null>(null)

  useEffect(() => { scan() }, [])

  // 需修复的歌曲集合（由 augMap 确定，无 aug 信息的视为未扫到）
  const needRepair = allMusics.filter(m => {
    const aug = augMap[m.id]
    return aug && aug.reason !== null
  })

  // 诊断统计（面向用户的实时读数）
  const diag = useMemo(() => {
    const total = allMusics.length
    let noProvider = 0
    let noAudioUrl = 0
    let invalidProvider = 0
    let downloadedButLost = 0
    let fullyDead = 0
    let withSourceId = 0
    for (const m of allMusics) {
      const rawProvider = m.provider?.trim() ?? ""
      const hasProvider = rawProvider.length > 0
      const providerValid = isSupportedProvider(rawProvider)
      const hasAudioUrl = !!m.audio_url && m.audio_url.trim().length > 0
      if (!hasProvider) noProvider++
      if (hasProvider && !providerValid) invalidProvider++
      if (!hasAudioUrl) noAudioUrl++
      if (m.source_id) withSourceId++
      const aug = augMap[m.id]
      if (aug && aug.reason === "file_lost_no_fallback") fullyDead++
      if (m.is_downloaded && aug && !aug.audioFileExists) downloadedButLost++
    }
    return { total, noProvider, noAudioUrl, invalidProvider, downloadedButLost, fullyDead, withSourceId }
  }, [allMusics, augMap])

  /** 扫描 DB + 检查每首本地音频文件是否存在，生成 augMap */
  async function scan() {
    setScanning(true)
    await safeRun(async () => {
      const data = await database.getAllMusic()
      // 对 is_downloaded=1 的首歌，检查本地文件存在性；其他直接视为 false（不涉及文件磁盘检查）
      const aug: AugMap = {}
      await Promise.all(data.map(async m => {
        const audioFileExists = m.is_downloaded ? await fileManager.audioExists(m.id) : false
        aug[m.id] = {
          audioFileExists,
          reason: diagnose(m, audioFileExists),
        }
      }))
      setAllMusics(data)
      setAugMap(aug)
      console.log(`[Repair] scan: ${data.length} total, ${Object.values(aug).filter(a => a.reason).length} need repair`)
    }, { tag: "repair.scan" })
    setScanning(false)
  }

  function setStatus(id: string, status: RepairStatus) {
    setStatusMap(prev => ({ ...prev, [id]: status }))
  }

  /** 对单首歌调搜索接口 + 打分 topN，写入 statusMap（candidates 存全量候选） */
  async function matchOne(m: Music): Promise<void> {
    setStatus(m.id, { kind: "searching" })
    try {
      const q = `${m.title} ${m.artist}`.trim()
      const { items } = await musicService.search(q)
      const candidates = rankCandidates(m, items ?? [], 8)
      const best = candidates[0] ?? null
      console.log(`[Repair] "${m.title}" · ${m.artist} → ${candidates.length} candidates; best=${best?.item.title}/${best?.item.artist} score=${best?.score}`)
      if (!best) {
        setStatus(m.id, { kind: "no_match" })
      } else if (best.score >= MATCH_THRESHOLD) {
        setStatus(m.id, { kind: "matched", result: best, candidates })
      } else {
        setStatus(m.id, { kind: "uncertain", result: best, candidates })
      }
    } catch (e) {
      setStatus(m.id, { kind: "error", error: e instanceof Error ? e.message : String(e) })
    }
  }

  /** 批量匹配：串行，避免打爆接口 */
  async function matchAll() {
    setMatchingAll(true)
    const todo = needRepair.filter(m => {
      const s = statusMap[m.id]
      return !s || s.kind === "idle" || s.kind === "error" || s.kind === "no_match"
    })
    setMatchProgress({ done: 0, total: todo.length })
    for (let i = 0; i < todo.length; i++) {
      await matchOne(todo[i])
      setMatchProgress({ done: i + 1, total: todo.length })
    }
    setMatchingAll(false)
  }

  /** 应用单首匹配结果：更新 provider / source_id / audio_url / cover_url */
  async function applyOne(m: Music) {
    const s = statusMap[m.id]
    if (!s || (s.kind !== "matched" && s.kind !== "uncertain")) return
    await applyCandidate(m, s.result, s.candidates)
  }

  /** 应用指定候选（用于换源 sheet） */
  async function applyCandidate(m: Music, chosen: MatchResult, candidates: MatchResult[]) {
    const cand = chosen.item
    await safeRun(async () => {
      await database.addMusic({
        id: m.id,
        title: cand.title || m.title,
        artist: cand.artist || m.artist,
        album: cand.album || m.album,
        duration: cand.duration || m.duration,
        cover_url: cand.cover || m.cover_url,
        audio_url: "",
        provider: cand.provider,
        source_id: cand.id,
        is_downloaded: m.is_downloaded,
        file_size: m.file_size,
        added_at: m.added_at,
        last_played_at: m.last_played_at,
      })
      setStatus(m.id, { kind: "applied", result: chosen, candidates })
      setAllMusics(prev => prev.map(x => x.id === m.id ? {
        ...x,
        provider: cand.provider,
        source_id: cand.id,
        audio_url: "",
        cover_url: cand.cover || x.cover_url,
      } : x))
    }, { title: "应用失败", tag: "repair.applyCandidate" })
  }

  /** 应用所有 matched（不包括 uncertain） */
  async function applyAllMatched() {
    setApplyingAll(true)
    const toApply = needRepair.filter(m => statusMap[m.id]?.kind === "matched")
    for (const m of toApply) {
      await applyOne(m)
    }
    setApplyingAll(false)
  }

  /** 本地试播：如果本地文件存在会优先走本地，无法验证在线资源是否有效 */
  async function testPlay(m: Music) {
    const latest = allMusics.find(x => x.id === m.id) ?? m
    await safeRun(async () => {
      await player.play(latest)
    }, { title: "试播失败", tag: "repair.testPlay" })
  }

  /** 联网试播：强制走 audio_url / provider 流程，验证修复结果真的可用 */
  async function testPlayOnline(m: Music) {
    const latest = allMusics.find(x => x.id === m.id) ?? m
    await safeRun(async () => {
      // 把 is_downloaded 置 false，让 player 跳过本地查找、直接用 audio_url / provider
      const forOnline: Music = { ...latest, is_downloaded: false }
      await player.play(forOnline)
    }, { title: "联网试播失败", tag: "repair.testPlayOnline" })
  }

  // ---------- 渲染 ----------

  const matchedCount = needRepair.filter(m => statusMap[m.id]?.kind === "matched").length
  const uncertainCount = needRepair.filter(m => statusMap[m.id]?.kind === "uncertain").length
  const appliedCount = needRepair.filter(m => statusMap[m.id]?.kind === "applied").length
  const remainingCount = needRepair.length - appliedCount

  return (
    <List
      navigationTitle="修复歌曲资源"
      sheet={{
        isPresented: switchingFor !== null,
        onChanged: (v: boolean) => { if (!v) setSwitchingFor(null) },
        content: switchingFor ? (
          <CandidatePickerSheet
            music={switchingFor}
            status={statusMap[switchingFor.id] ?? { kind: "idle" }}
            onPick={async (chosen) => {
              const s = statusMap[switchingFor.id]
              const cands = (s && (s.kind === "matched" || s.kind === "uncertain" || s.kind === "applied")) ? s.candidates : []
              await applyCandidate(switchingFor, chosen, cands)
              setSwitchingFor(null)
            }}
            onRetryMatch={async () => {
              await matchOne(switchingFor)
            }}
            onDismiss={() => setSwitchingFor(null)}
          />
        ) : <Text>{""}</Text>
      }}
    >
      <Section
        header={<Text>{"总览"}</Text>}
        footer={
          <Text font="caption" foregroundStyle="secondaryLabel">
            {"无法播放的歌曲才会出现在下方；扫描会读取全部音乐。"}
          </Text>
        }
      >
        <HStack>
          <Text>{"待修复"}</Text>
          <Spacer />
          <Text foregroundStyle="secondaryLabel">
            {scanning ? "扫描中..." : `${remainingCount} / ${needRepair.length}`}
          </Text>
        </HStack>
        <HStack>
          <Text>{"已自动匹配"}</Text>
          <Spacer />
          <Text foregroundStyle="secondaryLabel">{`${matchedCount}`}</Text>
        </HStack>
        <HStack>
          <Text>{"需确认"}</Text>
          <Spacer />
          <Text foregroundStyle="secondaryLabel">{`${uncertainCount}`}</Text>
        </HStack>
        {matchingAll && (
          <HStack>
            <Text>{"匹配进度"}</Text>
            <Spacer />
            <Text foregroundStyle="secondaryLabel">
              {`${matchProgress.done} / ${matchProgress.total}`}
            </Text>
          </HStack>
        )}

        <Button
          title={matchingAll ? "匹配中..." : "自动匹配全部"}
          systemImage="wand.and.stars"
          disabled={matchingAll || scanning || needRepair.length === 0}
          action={matchAll}
        />
        <Button
          title={applyingAll ? "应用中..." : `一键应用 (${matchedCount})`}
          systemImage="checkmark.circle"
          disabled={applyingAll || matchingAll || matchedCount === 0}
          action={applyAllMatched}
        />
        <Button
          title="重新扫描"
          systemImage="arrow.clockwise"
          disabled={scanning || matchingAll || applyingAll}
          action={scan}
        />
      </Section>

      {/* 诊断统计：帮用户看清数据库真实状态。即使“待修复=0”也能从这里看出数据的完整程度。 */}
      <Section header={<Text>{"数据诊断"}</Text>}
        footer={<Text font="caption" foregroundStyle="secondaryLabel">{"基于当前 DB 读出的实时统计。已下载但本地文件丢失的需后续版本处理。"}</Text>}
      >
        <HStack><Text>{"总歌曲数"}</Text><Spacer /><Text foregroundStyle="secondaryLabel">{`${diag.total}`}</Text></HStack>
        <HStack><Text>{"无 provider"}</Text><Spacer /><Text foregroundStyle="secondaryLabel">{`${diag.noProvider}`}</Text></HStack>
        <HStack><Text>{"无 audio_url"}</Text><Spacer /><Text foregroundStyle="secondaryLabel">{`${diag.noAudioUrl}`}</Text></HStack>
        <HStack><Text>{"provider 非法(不在白名单)"}</Text><Spacer /><Text foregroundStyle="secondaryLabel">{`${diag.invalidProvider}`}</Text></HStack>
        <HStack><Text>{"已下载但文件丢失"}</Text><Spacer /><Text foregroundStyle="secondaryLabel">{`${diag.downloadedButLost}`}</Text></HStack>
        <HStack><Text>{"完全无法播放 (B 桶)"}</Text><Spacer /><Text foregroundStyle="secondaryLabel">{`${diag.fullyDead}`}</Text></HStack>
        <HStack><Text>{"已填 source_id"}</Text><Spacer /><Text foregroundStyle="secondaryLabel">{`${diag.withSourceId}`}</Text></HStack>
      </Section>

      <Section header={<Text>{`需修复 (${needRepair.length})`}</Text>}>
        {needRepair.length === 0 ? (
          <Text foregroundStyle="secondaryLabel">{scanning ? "扫描中..." : "没有需要修复的歌曲 🎉"}</Text>
        ) : (
          needRepair.map(m => (
            <RepairRow
              key={m.id}
              music={m}
              reason={augMap[m.id]?.reason ?? null}
              status={statusMap[m.id] ?? { kind: "idle" }}
              onMatch={() => matchOne(m)}
              onApply={() => applyOne(m)}
              onTestPlay={() => testPlay(m)}
              onTestPlayOnline={() => testPlayOnline(m)}
              onOpenSwitcher={() => setSwitchingFor(m)}
            />
          ))
        )}
      </Section>
    </List>
  )
}

// ---------- 单行 ----------

function RepairRow({
  music,
  reason,
  status,
  onMatch,
  onApply,
  onTestPlay,
  onTestPlayOnline,
  onOpenSwitcher,
}: {
  music: Music
  reason: MissingReason | null
  status: RepairStatus
  onMatch: () => void
  onApply: () => void
  onTestPlay: () => void
  onTestPlayOnline: () => void
  onOpenSwitcher: () => void
}) {
  const tag = statusTag(status)
  const subtitle = statusSubtitle(music, status)
  const actions = rowActions(status, { onMatch, onApply, onTestPlay, onTestPlayOnline, onOpenSwitcher })

  return (
    <HStack spacing={12}>
      {music.cover_url ? (
        <Image
          imageUrl={music.cover_url}
          resizable={true}
          scaleToFill={true}
          frame={{ height: 48, width: 48 }}
          clipShape={{ type: "rect", cornerRadius: 6 }}
        />
      ) : (
        <Image
          systemName="music.note"
          frame={{ height: 48, width: 48 }}
          foregroundStyle="secondaryLabel"
        />
      )}
      <VStack alignment="leading" spacing={2}>
        <Text font="body" lineLimit={1}>{music.title}</Text>
        <Text font="caption" foregroundStyle="secondaryLabel" lineLimit={1}>
          {music.artist}
        </Text>
        {reason ? (
          <Text font="caption2" foregroundStyle="systemRed" lineLimit={1}>
            {reasonLabel(reason)}
          </Text>
        ) : null}
        {subtitle ? (
          <Text font="caption2" foregroundStyle="tertiaryLabel" lineLimit={1}>
            {subtitle}
          </Text>
        ) : null}
      </VStack>
      <Spacer />
      <VStack alignment="trailing" spacing={6}>
        {tag}
        <HStack spacing={10}>
          {actions}
        </HStack>
      </VStack>
    </HStack>
  )
}

function reasonLabel(r: MissingReason): string {
  switch (r) {
    case "no_provider":           return "缺 provider"
    case "invalid_provider":      return "provider 不在白名单"
    case "no_audio_url":          return "缺 audio_url"
    case "provider_and_url":      return "provider + audio_url 都缺"
    case "file_lost_no_fallback": return "本地文件丢失 且 无在线回退"
  }
}

function statusTag(status: RepairStatus): JSX.Element {
  switch (status.kind) {
    case "idle":
      return <Text font="caption" foregroundStyle="secondaryLabel">{"待匹配"}</Text>
    case "searching":
      return <ProgressView controlSize="small" />
    case "matched":
      return <Text font="caption" foregroundStyle="systemGreen">{`✓ ${status.result.score}`}</Text>
    case "uncertain":
      return <Text font="caption" foregroundStyle="systemOrange">{`? ${status.result.score}`}</Text>
    case "no_match":
      return <Text font="caption" foregroundStyle="systemRed">{"无结果"}</Text>
    case "applied":
      return <Text font="caption" foregroundStyle="systemGreen">{"已修复"}</Text>
    case "error":
      return <Text font="caption" foregroundStyle="systemRed">{"错误"}</Text>
  }
}

function statusSubtitle(music: Music, status: RepairStatus): string | null {
  if (status.kind === "matched" || status.kind === "uncertain" || status.kind === "applied") {
    const r = status.result
    return `→ ${r.item.provider} · ${r.item.title} - ${r.item.artist}`
  }
  if (status.kind === "error") return status.error
  return null
}

/**
 * 渲染一行右侧的操作按钮组。全部用 buttonStyle="plain"，
 * 避免 SwiftUI List 默认给按钮扩大点击区域导致相邻按钮点击冲突。
 */
function rowActions(
  status: RepairStatus,
  h: {
    onMatch: () => void
    onApply: () => void
    onTestPlay: () => void
    onTestPlayOnline: () => void
    onOpenSwitcher: () => void
  }
): JSX.Element[] {
  switch (status.kind) {
    case "idle":
    case "no_match":
    case "error":
      return [
        <Button key="match" buttonStyle="plain" action={h.onMatch}>
          <Image systemName="magnifyingglass" />
        </Button>,
      ]
    case "matched":
    case "uncertain":
      return [
        <Button key="apply" buttonStyle="plain" action={h.onApply}>
          <Image systemName="checkmark.circle" />
        </Button>,
        <Button key="switch" buttonStyle="plain" action={h.onOpenSwitcher}>
          <Image systemName="arrow.triangle.2.circlepath" />
        </Button>,
      ]
    case "applied":
      return [
        <Button key="play" buttonStyle="plain" action={h.onTestPlayOnline}>
          <Image systemName="antenna.radiowaves.left.and.right" />
        </Button>,
        <Button key="switch" buttonStyle="plain" action={h.onOpenSwitcher}>
          <Image systemName="arrow.triangle.2.circlepath" />
        </Button>,
      ]
    case "searching":
    default:
      return []
  }
}

// ---------- 换源 Sheet ----------

function CandidatePickerSheet({
  music,
  status,
  onPick,
  onRetryMatch,
  onDismiss,
}: {
  music: Music
  status: RepairStatus
  onPick: (chosen: MatchResult) => void | Promise<void>
  onRetryMatch: () => void | Promise<void>
  onDismiss: () => void
}) {
  const candidates: MatchResult[] = (status.kind === "matched" || status.kind === "uncertain" || status.kind === "applied")
    ? status.candidates
    : []
  const currentSourceId = music.source_id ?? null
  const searching = status.kind === "searching"

  return (
    <NavigationStack>
      <List
        navigationTitle="选择源"
        toolbar={
          <Toolbar>
            <ToolbarItem placement="topBarLeading">
              <Button title="关闭" action={onDismiss} />
            </ToolbarItem>
            <ToolbarItem placement="topBarTrailing">
              <Button action={() => onRetryMatch()} disabled={searching}>
                <Label title="重新搜索" systemImage="arrow.clockwise" />
              </Button>
            </ToolbarItem>
          </Toolbar>
        }
      >
        <Section header={<Text>{"当前歌曲"}</Text>}>
          <VStack alignment="leading" spacing={2}>
            <Text font="headline">{music.title}</Text>
            <Text font="caption" foregroundStyle="secondaryLabel">{music.artist}</Text>
            {currentSourceId ? (
              <Text font="caption2" foregroundStyle="tertiaryLabel">
                {`当前源：${music.provider ?? "?"} · source_id=${currentSourceId}`}
              </Text>
            ) : null}
          </VStack>
        </Section>

        <Section header={<Text>{`候选 (${candidates.length})`}</Text>}>
          {searching ? (
            <HStack><ProgressView /><Text foregroundStyle="secondaryLabel">{"搜索中..."}</Text></HStack>
          ) : candidates.length === 0 ? (
            <Text foregroundStyle="secondaryLabel">{"尚无候选，点右上角重新搜索"}</Text>
          ) : (
            candidates.map((c, idx) => (
              <CandidateRow
                key={`${c.item.provider}-${c.item.id}-${idx}`}
                result={c}
                isCurrent={c.item.id === currentSourceId}
                onTap={() => onPick(c)}
              />
            ))
          )}
        </Section>
      </List>
    </NavigationStack>
  )
}

function shortenId(id: string): string {
  if (!id) return ""
  if (id.length <= 12) return id
  return id.slice(0, 10) + "…"
}

function CandidateRow({
  result,
  isCurrent,
  onTap,
}: {
  result: MatchResult
  isCurrent: boolean
  onTap: () => void
}) {
  const cand = result.item
  const [coverError, setCoverError] = useState(false)
  const scoreColor = result.score >= MATCH_THRESHOLD ? "systemGreen" : "systemOrange"

  return (
    <HStack spacing={12}>
      {cand.cover && !coverError ? (
        <Image
          imageUrl={cand.cover}
          resizable={true}
          scaleToFill={true}
          frame={{ height: 48, width: 48 }}
          clipShape={{ type: "rect", cornerRadius: 6 }}
          onError={() => setCoverError(true)}
        />
      ) : (
        <Image
          systemName="music.note"
          frame={{ height: 48, width: 48 }}
          foregroundStyle="secondaryLabel"
        />
      )}
      <VStack alignment="leading" spacing={2}>
        <Text font="body" lineLimit={1}>{cand.title}</Text>
        <Text font="caption" foregroundStyle="secondaryLabel" lineLimit={1}>
          {`${cand.artist ?? "?"}${cand.album ? " · " + cand.album : ""}`}
        </Text>
        <Text font="caption2" foregroundStyle="tertiaryLabel" lineLimit={1}>
          {`${cand.provider} · id=${shortenId(cand.id)}`}
        </Text>
      </VStack>
      <Spacer />
      <VStack alignment="trailing" spacing={6}>
        <Text font="caption" foregroundStyle={scoreColor}>{`${result.score}`}</Text>
        {isCurrent ? (
          <Image systemName="checkmark.circle.fill" foregroundStyle="systemBlue" />
        ) : (
          <Button buttonStyle="plain" action={onTap}>
            <Image systemName="arrow.triangle.2.circlepath" />
          </Button>
        )}
      </VStack>
    </HStack>
  )
}

