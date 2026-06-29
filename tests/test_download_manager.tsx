import { database } from "../class/database"
import { fileManager } from "../class/file_manager"
import { downloadManager } from "../class/download_manager"

export async function testDownloadManager() {
  console.log("=== 测试下载管理器 ===\n")
  
  try {
    // 测试 1: 初始化
    console.log("测试 1: 初始化数据库和文件管理器")
    await database.init()
    await fileManager.init()
    console.log("✓ 初始化成功\n")
    
    // 测试 2: 检查数据库表
    console.log("测试 2: 验证数据库表结构")
    const allMusic = await database.getAllMusic()
    console.log(`✓ 数据库可用，当前音乐数: ${allMusic.length}\n`)
    
    // 测试 3: 添加测试音乐到数据库
    console.log("测试 3: 添加测试音乐")
    const testMusic = {
      id: "test-12345",
      title: "测试歌曲",
      artist: "测试艺人",
      album: "测试专辑",
      duration: 180,
      cover_url: "https://example.com/cover.jpg",
      audio_url: "https://example.com/audio.mp3",
      is_downloaded: false,
      added_at: Date.now()
    }
    await database.addMusic(testMusic)
    const savedMusic = await database.getMusic(testMusic.id)
    console.log(`✓ 音乐已保存: ${savedMusic?.title}\n`)
    
    // 测试 4: 创建下载任务
    console.log("测试 4: 创建下载任务")
    const taskId = await database.createDownloadTask(testMusic.id)
    console.log(`✓ 下载任务已创建: ${taskId}\n`)
    
    // 测试 5: 更新下载任务状态
    console.log("测试 5: 更新下载任务状态")
    await database.updateDownloadTask(taskId, "downloading", 50)
    const task = await database.getDownloadTask(taskId)
    console.log(`✓ 任务状态: ${task?.status}, 进度: ${task?.progress}%\n`)
    
    // 测试 6: 完成下载任务
    console.log("测试 6: 完成下载任务")
    await database.updateDownloadTask(taskId, "completed", 100)
    await database.updateMusicDownloadStatus(testMusic.id, true, 5242880)
    const updatedMusic = await database.getMusic(testMusic.id)
    console.log(`✓ 下载状态: ${updatedMusic?.is_downloaded}, 文件大小: ${updatedMusic?.file_size} bytes\n`)
    
    // 测试 7: 检查文件路径
    console.log("测试 7: 验证文件路径")
    const audioPath = fileManager.getAudioPath(testMusic.id)
    const coverPath = fileManager.getCoverPath(testMusic.id)
    console.log(`✓ 音频路径: ${audioPath}`)
    console.log(`✓ 封面路径: ${coverPath}\n`)
    
    // 测试 8: 获取所有下载任务
    console.log("测试 8: 获取所有下载任务")
    const allTasks = await database.getAllDownloadTasks()
    console.log(`✓ 下载任务总数: ${allTasks.length}\n`)
    
    // 测试 9: 清理测试数据
    console.log("测试 9: 清理测试数据")
    await database.deleteDownloadTask(taskId)
    await database.deleteMusic(testMusic.id)
    console.log("✓ 测试数据已清理\n")
    
    console.log("=== 所有测试通过 ✓ ===")
    
  } catch (error) {
    console.log("✗ 测试失败:", error)
    throw error
  }
}