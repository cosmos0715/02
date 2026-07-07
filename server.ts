import dotenv from "dotenv";
dotenv.config();

import express from "express";
import path from "path";
import fs from "fs";
import { fileURLToPath } from "url";
import { createServer as createViteServer } from "vite";
import { Member, GroupConfig, BoardState, FullState } from "./src/types.js";
import { GoogleGenAI, Type } from "@google/genai";

// Initialize Gemini lazily to prevent startup crash if API key is missing
let aiClient: GoogleGenAI | null = null;
function getGeminiClient() {
  if (!aiClient) {
    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) {
      throw new Error("GEMINI_API_KEY is not defined in environment variables");
    }
    aiClient = new GoogleGenAI({
      apiKey,
      httpOptions: {
        headers: {
          'User-Agent': 'aistudio-build',
        }
      }
    });
  }
  return aiClient;
}


const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const DATA_DIR = path.join(__dirname, "data");
const DB_FILE = path.join(DATA_DIR, "db.json");

// Ensure data directory exists
if (!fs.existsSync(DATA_DIR)) {
  fs.mkdirSync(DATA_DIR, { recursive: true });
}

// Initial default database state
const defaultMembers: Member[] = [
  { id: "m1", name: "皮卡丘 (Sccc)", gameId: "10001", avatar: "⚡", rating: 9500, role: "Mid", createdAt: Date.now() },
  { id: "m2", name: "喷火龙 (Maybe)", gameId: "10002", avatar: "🔥", rating: 9200, role: "Mid", createdAt: Date.now() },
  { id: "m3", name: "杰尼龟 (Ame)", gameId: "10003", avatar: "🐢", rating: 9600, role: "Carry", createdAt: Date.now() },
  { id: "m4", name: "妙蛙种子 (XinQ)", gameId: "10004", avatar: "🍃", rating: 9400, role: "Support", createdAt: Date.now() },
  { id: "m5", name: "耿鬼 (Fy)", gameId: "10005", avatar: "👻", rating: 8900, role: "Support", createdAt: Date.now() },
  { id: "m6", name: "超梦 (Somnus)", gameId: "10006", avatar: "🔮", rating: 9300, role: "Mid", createdAt: Date.now() },
  { id: "m7", name: "快龙 (Chalice)", gameId: "10007", avatar: "🐉", rating: 8800, role: "Offlane", createdAt: Date.now() },
  { id: "m8", name: "伊布 (Yatoro)", gameId: "10008", avatar: "🦊", rating: 10000, role: "Carry", createdAt: Date.now() },
  { id: "m9", name: "卡比兽 (JT-)", gameId: "10009", avatar: "💤", rating: 9100, role: "Offlane", createdAt: Date.now() },
  { id: "m10", name: "路卡利欧 (Collapse)", gameId: "10010", avatar: "✊", rating: 9800, role: "Offlane", createdAt: Date.now() },
  { id: "m11", name: "胖丁 (Dy)", gameId: "10011", avatar: "🎈", rating: 8600, role: "Support", createdAt: Date.now() },
  { id: "m12", name: "喵喵 (Pyw)", gameId: "10012", avatar: "🐱", rating: 8700, role: "Support", createdAt: Date.now() },
  { id: "m13", name: "水箭龟 (Lou)", gameId: "10013", avatar: "🛡️", rating: 8900, role: "Carry", createdAt: Date.now() },
  { id: "m14", name: "胡地 (Bach)", gameId: "10014", avatar: "🥄", rating: 8800, role: "Offlane", createdAt: Date.now() },
  { id: "m15", name: "波克比 (Emo)", gameId: "10015", avatar: "🥚", rating: 9000, role: "Mid", createdAt: Date.now() },
  { id: "m16", name: "暴鲤龙 (Kaka)", gameId: "10016", avatar: "🌊", rating: 8700, role: "Support", createdAt: Date.now() },
  { id: "m17", name: "怪力 (Nisha)", gameId: "10017", avatar: "🥊", rating: 9700, role: "Mid", createdAt: Date.now() },
  { id: "m18", name: "烈咬陆鲨 (micke)", gameId: "10018", avatar: "🦈", rating: 9400, role: "Carry", createdAt: Date.now() },
  { id: "m19", name: "巨钳螳螂 (33)", gameId: "10019", avatar: "✂️", rating: 9600, role: "Offlane", createdAt: Date.now() },
  { id: "m20", name: "沙奈朵 (Boxi)", gameId: "10020", avatar: "💃", rating: 9300, role: "Support", createdAt: Date.now() },
];

const defaultConfig: GroupConfig = {
  groupCount: 4,
  peoplePerGroup: 5,
  roundOrders: ["1,2,3,4", "4,3,2,1", "1,2,3,4", "4,3,2,1"],
  gameType: "DOTA2",
};

const defaultBoard: BoardState = {
  candidateIds: ["m1", "m2", "m3", "m4", "m5", "m6", "m7", "m8", "m9", "m10", "m11", "m12", "m13", "m14", "m15", "m16"],
  silentIds: ["m17", "m18", "m19", "m20"],
  groups: {
    0: [],
    1: [],
    2: [],
    3: [],
  },
  currentPickIndex: 0,
  pairings: {},
};

let dbState: FullState = {
  members: defaultMembers,
  config: defaultConfig,
  board: defaultBoard,
};

// Undo/Redo stacks in server memory (non-persistent to disk to keep db.json clean, but super nice for live editing!)
let pastStates: FullState[] = [];
let futureStates: FullState[] = [];

function saveToDisk() {
  try {
    fs.writeFileSync(DB_FILE, JSON.stringify(dbState, null, 2), "utf-8");
  } catch (err) {
    console.error("Failed to write to disk:", err);
  }
}

function loadFromDisk() {
  if (fs.existsSync(DB_FILE)) {
    try {
      const data = fs.readFileSync(DB_FILE, "utf-8");
      dbState = JSON.parse(data);
      // Ensure all groups exist in board
      if (!dbState.board.groups) {
        dbState.board.groups = {};
      }
      for (let i = 0; i < dbState.config.groupCount; i++) {
        if (!dbState.board.groups[i]) {
          dbState.board.groups[i] = [];
        }
      }
    } catch (err) {
      console.error("Failed to parse db.json, using defaults.", err);
    }
  } else {
    saveToDisk();
  }
}

loadFromDisk();

function pushToHistory() {
  // Save deeply cloned copy of state to history
  pastStates.push(JSON.parse(JSON.stringify(dbState)));
  futureStates = []; // Clear redo stack on new action
  if (pastStates.length > 50) {
    pastStates.shift(); // Limit history size
  }
}

const app = express();
app.use(express.json());

// API: Get complete data
app.get("/api/data", (req, res) => {
  res.json({
    ...dbState,
    canUndo: pastStates.length > 0,
    canRedo: futureStates.length > 0,
  });
});

// API: Admin authentication login
app.post("/api/admin/login", (req, res) => {
  const { password } = req.body;
  const adminPassword = process.env.ADMIN_PASSWORD || "admin";
  if (password === adminPassword) {
    res.json({ success: true, token: "admin-session-token" });
  } else {
    res.status(401).json({ error: "管理员密码错误，请重新输入" });
  }
});

// API: System-wide viewer login
app.post("/api/system/login", (req, res) => {
  const { password } = req.body;
  const systemPassword = process.env.SYSTEM_PASSWORD || "123456";
  const adminPassword = process.env.ADMIN_PASSWORD || "admin";
  if (password === systemPassword || password === adminPassword) {
    res.json({ success: true, token: "system-session-token" });
  } else {
    res.status(401).json({ error: "系统密码错误，请重新输入" });
  }
});

// API: Update config
app.post("/api/config", (req, res) => {
  pushToHistory();
  const { groupCount, peoplePerGroup, roundOrders, gameType } = req.body;
  
  const oldGroupCount = dbState.config.groupCount;
  dbState.config.groupCount = parseInt(groupCount) || 4;
  dbState.config.peoplePerGroup = parseInt(peoplePerGroup) || 5;
  dbState.config.roundOrders = roundOrders || [];
  if (gameType) {
    dbState.config.gameType = gameType;
  }

  // Adjust board groups count
  const newGroups: { [groupIndex: number]: string[] } = {};
  for (let i = 0; i < dbState.config.groupCount; i++) {
    newGroups[i] = dbState.board.groups[i] || [];
  }

  // If group count decreased, move orphan members back to candidateIds
  if (dbState.config.groupCount < oldGroupCount) {
    for (let i = dbState.config.groupCount; i < oldGroupCount; i++) {
      const orphans = dbState.board.groups[i] || [];
      orphans.forEach(id => {
        if (!dbState.board.candidateIds.includes(id)) {
          dbState.board.candidateIds.push(id);
        }
      });
    }
  }

  dbState.board.groups = newGroups;

  // Reset pairings if group count changed
  if (dbState.config.groupCount !== oldGroupCount) {
    dbState.board.pairings = {};
  }

  // Validate currentPickIndex bounds (the draft starts at round 2, so we have peoplePerGroup - 1 draft rounds)
  const totalPicksCount = (dbState.config.peoplePerGroup - 1) * dbState.config.groupCount;
  if (dbState.board.currentPickIndex >= totalPicksCount) {
    dbState.board.currentPickIndex = Math.max(0, totalPicksCount - 1);
  }

  saveToDisk();
  res.json({ success: true, ...dbState });
});

// API: Update Board positions (drag and drop sync)
app.post("/api/board/update", (req, res) => {
  pushToHistory();
  const { candidateIds, silentIds, groups, currentPickIndex, pairings } = req.body;
  
  if (candidateIds) dbState.board.candidateIds = candidateIds;
  if (silentIds) dbState.board.silentIds = silentIds;
  if (groups) {
    // Ensure group keys are properly formatted/parsed
    dbState.board.groups = {};
    Object.keys(groups).forEach(key => {
      const idx = parseInt(key);
      dbState.board.groups[idx] = groups[key];
    });
  }
  if (typeof currentPickIndex === "number") {
    dbState.board.currentPickIndex = currentPickIndex;
  }
  if (pairings !== undefined) {
    dbState.board.pairings = pairings;
  }

  saveToDisk();
  res.json({ success: true, ...dbState });
});

// API: Member management (Add)
app.post("/api/members/add", (req, res) => {
  pushToHistory();
  const { name, gameId, avatar, rating, role } = req.body;
  
  const newId = "m_" + Date.now() + Math.random().toString(36).substr(2, 4);
  const parsedRating = (rating !== undefined && rating !== null && rating !== "") ? parseInt(rating) : undefined;
  const newMember: Member = {
    id: newId,
    name: name || "未命名",
    gameId: gameId || "00000",
    avatar: avatar || "👤",
    rating: isNaN(parsedRating as any) ? undefined : parsedRating,
    role: role !== undefined ? role : "",
    createdAt: Date.now(),
  };

  dbState.members.push(newMember);
  
  // Admin edits: automatically syncs to Silent Zone (签到区/静默区)
  if (!dbState.board.silentIds.includes(newId)) {
    dbState.board.silentIds.push(newId);
  }

  saveToDisk();
  res.json({ success: true, member: newMember, ...dbState });
});

// API: Member management (Update)
app.post("/api/members/update", (req, res) => {
  pushToHistory();
  const { id, name, gameId, avatar, rating, role } = req.body;
  
  const idx = dbState.members.findIndex(m => m.id === id);
  if (idx !== -1) {
    const parsedRating = (rating !== undefined && rating !== null && rating !== "") ? parseInt(rating) : undefined;
    dbState.members[idx] = {
      ...dbState.members[idx],
      name: name || dbState.members[idx].name,
      gameId: gameId || dbState.members[idx].gameId,
      avatar: avatar || dbState.members[idx].avatar,
      rating: isNaN(parsedRating as any) ? undefined : parsedRating,
      role: role !== undefined ? role : dbState.members[idx].role,
    };
    saveToDisk();
    res.json({ success: true, member: dbState.members[idx], ...dbState });
  } else {
    res.status(404).json({ error: "Member not found" });
  }
});

// API: Member management (Delete)
app.post("/api/members/delete", (req, res) => {
  pushToHistory();
  const { id } = req.body;
  
  dbState.members = dbState.members.filter(m => m.id !== id);
  dbState.board.candidateIds = dbState.board.candidateIds.filter(mid => mid !== id);
  dbState.board.silentIds = dbState.board.silentIds.filter(mid => mid !== id);
  
  Object.keys(dbState.board.groups).forEach(key => {
    const idx = parseInt(key);
    dbState.board.groups[idx] = dbState.board.groups[idx].filter(mid => mid !== id);
  });

  saveToDisk();
  res.json({ success: true, ...dbState });
});

// API: Member Check-In (Silent -> Candidate)
app.post("/api/board/checkin", (req, res) => {
  pushToHistory();
  const { id } = req.body;
  
  if (dbState.board.silentIds.includes(id)) {
    // Remove from silent
    dbState.board.silentIds = dbState.board.silentIds.filter(mid => mid !== id);
    // Add to candidates if not already there
    if (!dbState.board.candidateIds.includes(id)) {
      dbState.board.candidateIds.push(id);
    }
    saveToDisk();
    res.json({ success: true, ...dbState });
  } else {
    res.status(400).json({ error: "Member is not in silent zone" });
  }
});

// API: Board reset / clear grouping
app.post("/api/board/clear", (req, res) => {
  pushToHistory();
  
  // Collect all grouped members
  const groupedIds: string[] = [];
  Object.keys(dbState.board.groups).forEach(key => {
    const idx = parseInt(key);
    groupedIds.push(...dbState.board.groups[idx]);
    dbState.board.groups[idx] = [];
  });

  // Put them all back into candidates
  groupedIds.forEach(id => {
    if (!dbState.board.candidateIds.includes(id)) {
      dbState.board.candidateIds.push(id);
    }
  });

  dbState.board.currentPickIndex = 0;
  dbState.board.pairings = {};

  saveToDisk();
  res.json({ success: true, ...dbState });
});

// API: Board reset all to silent / checkin zone
app.post("/api/board/reset_all", (req, res) => {
  pushToHistory();

  dbState.board.silentIds = dbState.members.map(m => m.id);
  dbState.board.candidateIds = [];
  
  Object.keys(dbState.board.groups).forEach(key => {
    const idx = parseInt(key);
    dbState.board.groups[idx] = [];
  });

  dbState.board.currentPickIndex = 0;
  dbState.board.pairings = {};

  saveToDisk();
  res.json({ success: true, ...dbState });
});

// API: Undo
app.post("/api/undo", (req, res) => {
  if (pastStates.length > 0) {
    futureStates.push(JSON.parse(JSON.stringify(dbState)));
    dbState = pastStates.pop()!;
    saveToDisk();
    res.json({ success: true, ...dbState, canUndo: pastStates.length > 0, canRedo: true });
  } else {
    res.status(400).json({ error: "Cannot undo" });
  }
});

// API: Redo
app.post("/api/redo", (req, res) => {
  if (futureStates.length > 0) {
    pastStates.push(JSON.parse(JSON.stringify(dbState)));
    dbState = futureStates.pop()!;
    saveToDisk();
    res.json({ success: true, ...dbState, canUndo: true, canRedo: futureStates.length > 0 });
  } else {
    res.status(400).json({ error: "Cannot redo" });
  }
});

function parseHtmlWithRegex(html: string, url: string): { name: string; avatar: string } {
  let name = "";
  let avatar = "";

  // 1. Try meta tags: og:image, og:title, keywords, etc.
  const ogTitleMatch = html.match(/<meta\s+[^>]*property=["']og:title["'][^>]*content=["']([^"']+)["']/i) ||
                       html.match(/<meta\s+[^>]*content=["']([^"']+)["'][^>]*property=["']og:title["']/i);
  const ogImageMatch = html.match(/<meta\s+[^>]*property=["']og:image["'][^>]*content=["']([^"']+)["']/i) ||
                       html.match(/<meta\s+[^>]*content=["']([^"']+)["'][^>]*property=["']og:image["']/i);

  if (ogImageMatch) {
    avatar = ogImageMatch[1];
  }
  if (ogTitleMatch) {
    name = ogTitleMatch[1];
  }

  // 2. Fallbacks based on title tag
  if (!name) {
    const titleMatch = html.match(/<title>([^<]+)<\/title>/i);
    if (titleMatch) {
      name = titleMatch[1];
    }
  }

  // 3. Platform specific extraction
  if (url.includes("huya.com")) {
    const hostNameMatch = html.match(/<span\s+class=["']host-name["'][^>]*title=["']([^"']+)["']/i) ||
                          html.match(/<p\s+class=["']host-title["'][^>]*title=["']([^"']+)["']/i) ||
                          html.match(/<h1\s+class=["']host-name["'][^>]*>([^<]+)<\/h1>/i) ||
                          html.match(/["']nick["']\s*:\s*["']([^"']+)["']/i);
    if (hostNameMatch) {
      name = hostNameMatch[1].trim();
    }

    const hostAvatarMatch = html.match(/["']avatar["']\s*:\s*["']([^"']+)["']/i) ||
                            html.match(/<img\s+class=["']host-avatar["'][^>]*src=["']([^"']+)["']/i) ||
                            html.match(/<img\s+id=["']avatarImg["'][^>]*src=["']([^"']+)["']/i);
    if (hostAvatarMatch) {
      avatar = hostAvatarMatch[1];
    }
  } else if (url.includes("bilibili.com")) {
    const bNameMatch = html.match(/["']uname["']\s*:\s*["']([^"']+)["']/i);
    if (bNameMatch) {
      name = bNameMatch[1];
    }
    const bAvatarMatch = html.match(/["']face["']\s*:\s*["']([^"']+)["']/i);
    if (bAvatarMatch) {
      avatar = bAvatarMatch[1];
    }
  } else if (url.includes("douyu.com")) {
    const dNameMatch = html.match(/["']nickname["']\s*:\s*["']([^"']+)["']/i) ||
                       html.match(/["']ownerName["']\s*:\s*["']([^"']+)["']/i);
    if (dNameMatch) {
      name = dNameMatch[1];
    }
    const dAvatarMatch = html.match(/["']avatar["']\s*:\s*["']([^"']+)["']/i);
    if (dAvatarMatch) {
      avatar = dAvatarMatch[1];
    }
  }

  // Clean the name
  if (name) {
    name = name.replace(/的(直播间|虎牙直播|虎牙直播间|哔哩哔哩直播间|B站直播间|B站|Dota2直播间|官方直播间|主页).*/i, "");
    name = name.replace(/^【|】$/g, "");
    name = name.replace(/^直播间：/i, "");
    name = name.replace(/[-_]虎牙直播.*/i, "")
               .replace(/[-_]斗鱼.*/i, "")
               .replace(/[-_]哔哩哔哩.*/i, "")
               .replace(/[-_]B站.*/i, "")
               .trim();
  }

  if (avatar && avatar.startsWith("//")) {
    avatar = "https:" + avatar;
  }

  return { name, avatar };
}

// API: Fetch streamer name and avatar automatically from Douyu, Bilibili, or Huya Live links
app.post("/api/fetch-live-info", async (req, res) => {
  const { url } = req.body;
  if (!url) {
    return res.status(400).json({ error: "请输入直播间链接" });
  }

  try {
    let platform = "";
    if (url.includes("bilibili.com")) {
      platform = "bilibili";
    } else if (url.includes("douyu.com")) {
      platform = "douyu";
    } else if (url.includes("huya.com")) {
      platform = "huya";
    } else {
      platform = "general";
    }

    // Try API for Bilibili room first (very fast and reliable)
    if (platform === "bilibili") {
      const match = url.match(/live\.bilibili\.com\/(?:h5\/)?(\d+)/);
      if (match) {
        const roomId = match[1];
        try {
          const apiRes = await fetch(`https://api.live.bilibili.com/live_user/v1/UserInfo/get_anchor_in_room?roomid=${roomId}`, {
            headers: { "User-Agent": "Mozilla/5.0" }
          });
          if (apiRes.ok) {
            const apiData: any = await apiRes.json();
            if (apiData.code === 0 && apiData.data && apiData.data.info) {
              return res.json({
                name: apiData.data.info.uname || "",
                avatar: apiData.data.info.face || ""
              });
            }
          }
        } catch (apiErr) {
          console.error("Bilibili Live User API failed, will fallback to HTML parser:", apiErr);
        }
      }
    }

    // Try API for Douyu room first (very fast and reliable)
    if (platform === "douyu") {
      const match = url.match(/douyu\.com\/(\d+)/);
      if (match) {
        const roomId = match[1];
        try {
          const apiRes = await fetch(`https://open.douyucdn.cn/api/RoomApi/room/${roomId}`, {
            headers: { "User-Agent": "Mozilla/5.0" }
          });
          if (apiRes.ok) {
            const apiData: any = await apiRes.json();
            if (apiData.error === 0 && apiData.data) {
              return res.json({
                name: apiData.data.owner_name || "",
                avatar: apiData.data.avatar || ""
              });
            }
          }
        } catch (apiErr) {
          console.error("Douyu Room API failed, will fallback to HTML parser:", apiErr);
        }
      }
    }

    // Fallback or Huya room: Fetch HTML page and try regex first, then Gemini if API key is valid
    console.log(`Fetching HTML from ${url} for extraction...`);
    const htmlResponse = await fetch(url, {
      headers: {
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
        "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8",
        "Accept-Language": "zh-CN,zh;q=0.9"
      }
    });

    if (!htmlResponse.ok) {
      throw new Error(`无法获取该直播间网页内容 (HTTP ${htmlResponse.status})`);
    }

    const rawHtml = await htmlResponse.text();

    // 1. First, try our ultra-fast and reliable Regex parsing
    const regexResult = parseHtmlWithRegex(rawHtml, url);
    if (regexResult.name && regexResult.avatar) {
      console.log("Successfully extracted streamer info using HTML regex parser:", regexResult);
      return res.json(regexResult);
    }

    // 2. If regex only got partial, check if GEMINI_API_KEY is available to enhance it
    const apiKey = process.env.GEMINI_API_KEY;
    const isApiKeyValid = apiKey && apiKey !== "MY_GEMINI_API_KEY" && apiKey.trim() !== "" && !apiKey.startsWith("YOUR_");

    if (isApiKeyValid) {
      try {
        const slicedHtml = rawHtml.slice(0, 150000); // Top 150KB contains all titles, meta tags, config scripts
        const ai = getGeminiClient();
        const prompt = `你是一个直播间主播信息提取专家。请分析以下来自直播平台的网页HTML内容（包含主播昵称和头像图片），精准提取出主播的个人昵称/名字，以及他的头像图片完整 URL。
        
网页链接为: ${url}

请根据网页内容找出：
1. 主播的个人昵称/姓名（例如：皮卡丘，Sccc，Maybe，YYF 等等。通常在 <h1 class="host-name">, <a class="room-owner">, og:title, keywords, 或 window.TT_ROOM_DATA / window.hyPlayerConfig 里）。
2. 主播头像的完整绝对 URL 链接（必须是一个以 http:// 或 https://开头的完整图片链接，如果是 //img.abc.com... 这样的相对协议路径，请自动添加前缀 https:）。如果没有找到，请返回空字符串。

网页HTML内容(截取前150KB):
${slicedHtml}

请严格按照指定的 JSON 结构返回数据。`;

        const geminiRes = await ai.models.generateContent({
          model: "gemini-3.5-flash",
          contents: prompt,
          config: {
            responseMimeType: "application/json",
            responseSchema: {
              type: Type.OBJECT,
              properties: {
                name: { 
                  type: Type.STRING,
                  description: "The extracted streamer's display name or nickname."
                },
                avatar: { 
                  type: Type.STRING,
                  description: "The extracted absolute image URL for the streamer's avatar."
                }
              },
              required: ["name", "avatar"]
            }
          }
        });

        const resultText = geminiRes.text;
        if (resultText) {
          const parsedResult = JSON.parse(resultText.trim());
          let avatarUrl = parsedResult.avatar || regexResult.avatar || "";
          if (avatarUrl && avatarUrl.startsWith("//")) {
            avatarUrl = "https:" + avatarUrl;
          }
          return res.json({
            name: parsedResult.name || regexResult.name || "新主播",
            avatar: avatarUrl
          });
        }
      } catch (geminiErr) {
        console.error("Gemini content generation failed, will return regex results:", geminiErr);
      }
    } else {
      console.warn("GEMINI_API_KEY is not defined or is a placeholder. Using regex extraction results only.");
    }

    // 3. Final fallback: If we extracted anything with regex, return that. Else, construct a decent default
    let finalName = regexResult.name;
    if (!finalName) {
      const idMatch = url.match(/(?:\/live\.bilibili\.com\/|\/douyu\.com\/|\/huya\.com\/)([a-zA-Z0-9]+)/);
      finalName = idMatch ? `主播_${idMatch[1]}` : "新录入主播";
    }

    return res.json({
      name: finalName,
      avatar: regexResult.avatar || "" // Let front-end fallback to dynamic avatar emojis
    });

  } catch (err: any) {
    console.error("Fetch live info error:", err);
    return res.status(500).json({ error: err.message || "自动获取失败" });
  }
});

// Start the server (Vite integration or standalone Express)
async function startServer() {
  const PORT = 3000;

  // Setup Vite Dev Server in development
  if (process.env.NODE_ENV !== "production") {
    console.log("Starting server in development mode...");
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    console.log("Starting server in production mode...");
    const distPath = path.join(process.cwd(), "dist");
    app.use(express.static(distPath));
    
    // Serve member.html specifically if hit
    app.get("/member.html", (req, res) => {
      res.sendFile(path.join(distPath, "member.html"));
    });
    
    app.get("*", (req, res) => {
      res.sendFile(path.join(distPath, "index.html"));
    });
  }

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`Server running on http://localhost:${PORT}`);
  });
}

startServer();
