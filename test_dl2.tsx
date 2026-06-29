import { Script } from "scripting"
import { music } from "./class/music"
import { downloadManager } from "./class/download_manager"
import { database } from "./class/database"
import { fileManager } from "./class/file_manager"

async function main() {
  const out: any = { logs: [] }
  const orig = console.log
  const origErr = console.error
  console.log = (...a: any[]) => { out.logs.push(a.join(" ")); orig(...a) }
  console.error = (...a: any[]) => { out.logs.push("ERR " + a.join(" ")); origErr(...a) }
  try {
    await database.init()
    await fileManager.init()
    const { items } = await music.search("Radiohead Creep")
    const top = items[0]
    // clean any prior record so it actually downloads
    try { await database.deleteMusic(top.id) } catch {}

    await downloadManager.downloadMusic({
      id: top.id,
      provider: top.provider,
      title: top.title,
      artist: top.artist || "未知艺术家",
      album: top.album || "未知专辑",
      duration: top.duration || 0,
      cover: top.cover || "",
    })
    out.ok = true
    const exists = await fileManager.audioExists(top.id)
    out.exists = exists
  } catch (e: any) {
    out.ok = false
    out.error = String(e?.message ?? e)
    out.stack = String(e?.stack ?? "")
  }
  console.log = orig
  console.error = origErr
  Script.exit(JSON.stringify(out, null, 2))
}
main()
