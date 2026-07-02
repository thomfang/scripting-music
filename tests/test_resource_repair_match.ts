import { defineSuite, expect, TestSuite } from "./test_runner"
import type { Music } from "../class/database"
import type { MusicData } from "../class/music"
import {
  MATCH_THRESHOLD,
  normalize,
  scoreCandidate,
  pickBestMatch,
  rankCandidates,
} from "../class/sources/match_utils"

/** 构造一首本地歌（只取打分需要的字段） */
function makeLocal(p: Partial<Pick<Music, "title" | "artist" | "album" | "duration">> = {}): Pick<Music, "title" | "artist" | "album" | "duration"> {
  return {
    title: p.title ?? "稻香",
    artist: p.artist ?? "周杰伦",
    album: p.album ?? "魔杰座",
    duration: p.duration ?? 223,
  }
}

function makeCand(p: Partial<MusicData> = {}): MusicData {
  return {
    id: p.id ?? "1001",
    provider: p.provider ?? "migu",
    title: p.title ?? "稻香",
    artist: p.artist ?? "周杰伦",
    album: p.album,
    duration: p.duration,
    cover: p.cover,
  }
}

export const suite: TestSuite = defineSuite({
  name: "资源修复 · 打分与匹配",
  cases: [
    {
      name: "normalize 去空白 + 小写",
      fn: () => {
        expect(normalize("  Hello World ")).toBe("helloworld")
        expect(normalize("周杰伦 ")).toBe("周杰伦")
      }
    },
    {
      name: "normalize 去修饰括号（Live / 现场）",
      fn: () => {
        expect(normalize("稻香 (Live)")).toBe("稻香")
        expect(normalize("稻香（现场）")).toBe("稻香")
        expect(normalize("Shape of You (Acoustic)")).toBe("shapeofyou")
      }
    },
    {
      name: "normalize 空输入返回空串",
      fn: () => {
        expect(normalize(undefined)).toBe("")
        expect(normalize(null)).toBe("")
        expect(normalize("")).toBe("")
      }
    },
    {
      name: "完全匹配：title+artist+album+duration → 100 分",
      fn: () => {
        const local = makeLocal()
        const cand = makeCand({ album: "魔杰座", duration: 223, cover: "https://x/y.jpg" })
        // 50(title) + 30(artist) + 10(album) + 10(duration) + 2(cover) = 102
        const score = scoreCandidate(local, cand)
        expect(score >= MATCH_THRESHOLD).toBe(true)
        expect(score).toBe(102)
      }
    },
    {
      name: "title 完全 + artist 完全：80 分，过阈值",
      fn: () => {
        const local = makeLocal()
        const cand = makeCand({ album: undefined, duration: undefined })
        // 50 + 30 = 80
        expect(scoreCandidate(local, cand)).toBe(80)
      }
    },
    {
      name: "title 带 (Live) 修饰 + artist 完全：也能过阈值",
      fn: () => {
        const local = makeLocal()
        const cand = makeCand({ title: "稻香 (Live)" })
        const score = scoreCandidate(local, cand)
        expect(score >= MATCH_THRESHOLD).toBe(true)
      }
    },
    {
      name: "artist 完全不同：score 不过阈值",
      fn: () => {
        const local = makeLocal()
        const cand = makeCand({ artist: "张学友" })
        // 50(title) + 0(artist) = 50
        const score = scoreCandidate(local, cand)
        expect(score < MATCH_THRESHOLD).toBe(true)
      }
    },
    {
      name: "title 完全不同：极低分",
      fn: () => {
        const local = makeLocal()
        const cand = makeCand({ title: "七里香", artist: "张学友" })
        expect(scoreCandidate(local, cand)).toBe(0)
      }
    },
    {
      name: "duration 在 3 秒内：+10；10 秒内：+5",
      fn: () => {
        const local = makeLocal({ duration: 223 })
        const c3 = makeCand({ album: undefined, duration: 225 })
        const c10 = makeCand({ album: undefined, duration: 230 })
        const c20 = makeCand({ album: undefined, duration: 243 })
        // base: 50 + 30 = 80
        expect(scoreCandidate(local, c3)).toBe(80 + 10)
        expect(scoreCandidate(local, c10)).toBe(80 + 5)
        expect(scoreCandidate(local, c20)).toBe(80 + 0)
      }
    },
    {
      name: "pickBestMatch：从多候选里挑最高分",
      fn: () => {
        const local = makeLocal()
        const items: MusicData[] = [
          makeCand({ id: "a", title: "稻香", artist: "翻唱者" }),           // 50
          makeCand({ id: "b", title: "稻香", artist: "周杰伦" }),           // 80
          makeCand({ id: "c", title: "稻香 (Live)", artist: "周杰伦" }),    // 80（title 归一化后相等）
        ]
        const best = pickBestMatch(local, items)
        expect(best).toBeTruthy()
        // b 和 c 都是 80，best 取先遇到的 b
        expect(best!.item.id).toBe("b")
        expect(best!.score >= MATCH_THRESHOLD).toBe(true)
      }
    },
    {
      name: "pickBestMatch：空列表返回 null",
      fn: () => {
        const best = pickBestMatch(makeLocal(), [])
        expect(best).toBeNull()
      }
    },
    {
      name: "cover 作为平分 tie-breaker",
      fn: () => {
        const local = makeLocal()
        const items: MusicData[] = [
          makeCand({ id: "noCover", title: "稻香", artist: "周杰伦" }),                                // 80
          makeCand({ id: "hasCover", title: "稻香", artist: "周杰伦", cover: "https://x/y.jpg" }),    // 82
        ]
        const best = pickBestMatch(local, items)
        expect(best!.item.id).toBe("hasCover")
      }
    },
    {
      name: "rankCandidates 按分数降序返回 top N",
      fn: () => {
        const local = makeLocal()
        const items: MusicData[] = [
          makeCand({ id: "low", title: "稻香", artist: "翻唱" }),                           // 50
          makeCand({ id: "mid", title: "稻香", artist: "周杰伦" }),                         // 80
          makeCand({ id: "top", title: "稻香", artist: "周杰伦", album: "魔杰座", duration: 223 }), // 100
        ]
        const ranked = rankCandidates(local, items, 3)
        expect(ranked.length).toBe(3)
        expect(ranked[0].item.id).toBe("top")
        expect(ranked[1].item.id).toBe("mid")
        expect(ranked[2].item.id).toBe("low")
        expect(ranked[0].score > ranked[1].score).toBe(true)
      }
    },
    {
      name: "rankCandidates 空输入返回空数组",
      fn: () => {
        expect(rankCandidates(makeLocal(), [], 5).length).toBe(0)
      }
    },
    {
      name: "rankCandidates topN 限制生效",
      fn: () => {
        const local = makeLocal()
        const items: MusicData[] = [
          makeCand({ id: "a" }), makeCand({ id: "b" }),
          makeCand({ id: "c" }), makeCand({ id: "d" }),
        ]
        expect(rankCandidates(local, items, 2).length).toBe(2)
      }
    },
  ]
})
