import { Script } from "scripting"
import { database } from "../class/database"
import { fileManager } from "../class/file_manager"
import { isSupportedProvider } from "../class/music"

/**
 * 校验：修复页里 diagnose() 新规则在真实 DB 上得出的"需修复条数"
 * 应该 = diag_db 的 `needRepair` = 199
 */

// 等价复制 page/setting/resource_repair.tsx 里的 diagnose 规则
type Row = { id: string; title: string; artist: string; provider?: string; audio_url?: string; is_downloaded: boolean }
type MissingReason =
  | "no_provider" | "invalid_provider" | "no_audio_url" | "provider_and_url" | "file_lost_no_fallback"

function diagnose(m: Row, audioFileExists: boolean): MissingReason | null {
  const rawProvider = m.provider?.trim() ?? ""
  const hasProvider = rawProvider.length > 0
  const providerValid = isSupportedProvider(rawProvider)
  const hasAudioUrl = !!m.audio_url && m.audio_url.trim().length > 0

  if (m.is_downloaded && !audioFileExists && !hasAudioUrl && !providerValid) return "file_lost_no_fallback"
  if (!providerValid && !hasAudioUrl) return "provider_and_url"
  if (!hasAudioUrl) return "no_audio_url"
  if (!hasProvider) return "no_provider"
  if (!providerValid) return "invalid_provider"
  return null
}

async function main() {
  try {
    await fileManager.init()
    await database.init()
    const all = await database.getAllMusic()

    const reasonCount: Record<string, number> = {}
    let needRepair = 0
    for (const m of all) {
      const audioExists = m.is_downloaded ? await fileManager.audioExists(m.id) : false
      const r = diagnose(m, audioExists)
      if (r) {
        needRepair++
        reasonCount[r] = (reasonCount[r] ?? 0) + 1
      }
    }

    const lines = [
      "=== diagnose() 规则校验 ===",
      `总歌曲: ${all.length}`,
      `需修复: ${needRepair}`,
      "按 reason 分类:",
      ...Object.entries(reasonCount).map(([k, v]) => `  ${k.padEnd(24)} ${v}`),
    ]
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
