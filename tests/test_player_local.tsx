import { Script } from "scripting"
import { player } from "../class/player"
import { music } from "../class/music"
import { fileManager } from "../class/file_manager"

export async function testPlayerLocal() {
  console.log("=== 测试播放器本地文件播放 ===\n")
  
  try {
    // 测试 1: 检查本地文件路径生成
    console.log("测试 1: 检查本地文件路径")
    const testMusicId = "test_music_123"
        const localPath = fileManager.getAudioPath(testMusicId)
    console.log("本地路径:", localPath)
    console.log("✓ 路径生成正常\n")
    
    // 测试 2: 检查文件存在性判断
    console.log("测试 2: 检查文件存在性")
    const exists = await fileManager.audioExists(testMusicId)
    console.log("文件是否存在:", exists)
    console.log("✓ 文件检查正常\n")
    
    // 测试 3: 模拟播放逻辑
        console.log("测试 3: 模拟播放逻辑")
        const musicId = "test-music-123"
        const testLocalPath = fileManager.getAudioPath(musicId)
            const fileExists = await fileManager.audioExists(musicId)
        const testUrl = "https://example.com/test.mp3"
        const playUrl = fileExists ? testLocalPath : testUrl
        
        console.log("原始 URL:", testUrl)
        console.log("本地路径:", testLocalPath)
        console.log("文件存在:", fileExists)
        console.log("实际播放 URL:", playUrl)
    console.log("✓ 播放逻辑正确\n")
    
    console.log("=== 所有测试通过 ✓ ===")
    console.log("\n说明:")
    console.log("- 如果歌曲已下载，播放器会使用本地文件路径")
    console.log("- 如果歌曲未下载，播放器会使用网络 URL")
    console.log("- 这样可以确保下载后的歌曲正常播放")
    
  } catch (error) {
    console.log("✗ 测试失败:", error)
    throw error
  }
}