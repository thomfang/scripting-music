import { Script } from "scripting"
import { database } from "./class/database"
import { fileManager } from "./class/file_manager"
import { isSupportedProvider, SUPPORTED_PROVIDERS } from "./class/music"

/**
 * 一次性诊断脚本 v2：按"provider 和 audio_url 缺一不可 + provider 必须在白名单"的新规则分桶。
 */

async function main() {
  try {
    await fileManager.init()
    await database.init()

    const all = await database.getAllMusic()

    let noProvider = 0
    let noAudioUrl = 0
    let invalidProvider = 0       // 有 provider 但不在白名单
    let needRepair = 0            // 新规则下需修复：缺其一 或 provider 非法
    let fullyDead = 0             // 已下载 + 文件丢失 + 无回退
    let downloadedTotal = 0
    let downloadedButLost = 0
    let withSourceId = 0

    const providerBreakdown: Record<string, number> = {}
    const samplesNeedRepair: Array<{ id: string; title: string; artist: string; reason: string }> = []
    const samplesFullyDead: Array<{ id: string; title: string; artist: string }> = []

    for (const m of all) {
      const rawProvider = m.provider?.trim() ?? ""
      const hasProvider = rawProvider.length > 0
      const hasAudioUrl = !!m.audio_url && m.audio_url.trim().length > 0
      const providerValid = isSupportedProvider(rawProvider)

      if (!hasProvider) noProvider++
      if (!hasAudioUrl) noAudioUrl++
      if (hasProvider && !providerValid) invalidProvider++

      const reasons: string[] = []
      if (!hasProvider) reasons.push("no_provider")
      else if (!providerValid) reasons.push(`invalid_provider(${rawProvider})`)
      if (!hasAudioUrl) reasons.push("no_audio_url")

      if (reasons.length > 0) {
        needRepair++
        if (samplesNeedRepair.length < 8) {
          samplesNeedRepair.push({ id: m.id, title: m.title, artist: m.artist, reason: reasons.join("+") })
        }
      }

      if (m.source_id) withSourceId++

      const key = hasProvider ? rawProvider : "<none>"
      providerBreakdown[key] = (providerBreakdown[key] ?? 0) + 1

      if (m.is_downloaded) {
        downloadedTotal++
        const fileExists = await fileManager.audioExists(m.id)
        if (!fileExists) {
          downloadedButLost++
          // fullyDead：文件丢 且 无 audio_url 且 (无 provider 或 provider 非法)
          if (!hasAudioUrl && (!hasProvider || !providerValid)) {
            fullyDead++
            if (samplesFullyDead.length < 5) {
              samplesFullyDead.push({ id: m.id, title: m.title, artist: m.artist })
            }
          }
        }
      }
    }

    const lines = [
      "======== Music DB 诊断 v2 ========",
      `白名单 providers : ${SUPPORTED_PROVIDERS.join(", ")}`,
      `总歌曲数         : ${all.length}`,
      `已下载           : ${downloadedTotal}`,
      `无 provider      : ${noProvider}`,
      `无 audio_url     : ${noAudioUrl}`,
      `provider 非法    : ${invalidProvider}`,
      `已下载但文件丢   : ${downloadedButLost}`,
      `已填 source_id   : ${withSourceId}`,
      "",
      `>>> 需修复 (缺其一 或 provider 非法) : ${needRepair}`,
      `>>> 完全无法播放 (已下+文件丢+无回退): ${fullyDead}`,
      "",
      "Provider 分布:",
      ...Object.entries(providerBreakdown)
        .sort((a, b) => b[1] - a[1])
        .map(([k, v]) => `  ${k.padEnd(16)} ${v}`),
    ]

    if (samplesNeedRepair.length > 0) {
      lines.push("", "需修复样本（前 8）:")
      for (const s of samplesNeedRepair) {
        lines.push(`  - [${s.reason}] ${s.title} · ${s.artist}`)
      }
    }
    if (samplesFullyDead.length > 0) {
      lines.push("", "已完全无法播放样本（前 5）:")
      for (const s of samplesFullyDead) lines.push(`  - ${s.title} · ${s.artist}`)
    }
    lines.push("===================================")

    const report = lines.join("\n")
    console.log(report)
    database.close()
    Script.exit(report)
  } catch (e) {
    const msg = e instanceof Error ? (e.stack || e.message) : String(e)
    console.error(msg)
    Script.exit(`FAILED\n${msg}`)
  }
}

main()
