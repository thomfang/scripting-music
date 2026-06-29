import { Script, fetch } from "scripting"
import { fetchDownloader } from "../class/fetch_downloader"
import { database } from "../class/database"
import { fileManager } from "../class/file_manager"

async function testFetchDownloader() {
  console.log("=== 测试 FetchDownloader ===\n")

  await database.init()
  await fetchDownloader.init()

  console.log("搜索测试歌曲...")
    const searchUrl = "https://coco-downloader.vercel.app/api/search?q=稻香&provider=qq"
    const searchResponse = await fetch(searchUrl)
    const searchResult = await searchResponse.json()
    
    if (searchResult.items.length === 0) {
      console.log("没有搜索结果")
      Script.exit()
      return
    }
    
    const firstSong = searchResult.items[0]
    const testMusic = {
      id: firstSong.id,
      provider: firstSong.provider,
      title: firstSong.title,
      artist: firstSong.artist || "未知歌手",
      album: firstSong.album || "未知专辑",
      duration: firstSong.duration || 0,
      cover: firstSong.cover || ""
    }
    
    console.log(`\n测试歌曲: ${testMusic.title} - ${testMusic.artist}`)
    console.log(`ID: ${testMusic.id}, Provider: ${testMusic.provider}`)

  try {
    console.log("1. 开始下载测试...")
    await fetchDownloader.downloadMusic(testMusic)
    
    console.log("\n2. 检查下载状态...")
    const isDownloaded = await fetchDownloader.isDownloaded(testMusic.id)
    console.log(`下载状态: ${isDownloaded ? "已完成" : "未完成"}`)
    
    if (isDownloaded) {
      console.log("\n3. 检查文件...")
      const audioExists = await fileManager.audioExists(testMusic.id)
      const coverExists = await fileManager.coverExists(testMusic.id)
      console.log(`音频文件: ${audioExists ? "存在" : "不存在"}`)
      console.log(`封面文件: ${coverExists ? "存在" : "不存在"}`)
      
      console.log("\n4. 检查数据库...")
      const musicData = await database.getMusic(testMusic.id)
      console.log(`数据库记录: ${musicData ? "存在" : "不存在"}`)
      if (musicData) {
        console.log(`  标题: ${musicData.title}`)
        console.log(`  文件大小: ${musicData.file_size} 字节`)}
    }
    
    console.log("\n✅ 测试完成")} catch (error) {
    console.error("\n❌ 测试失败:", error)
  }
  Script.exit()
}

testFetchDownloader()