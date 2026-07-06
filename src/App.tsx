import React, { useEffect, useState, useRef } from "react";
import { 
  Users, UserCheck, Play, RotateCcw, Search, Trash2, 
  Settings, ArrowLeftRight, Award, Plus, Sparkles, 
  HelpCircle, ChevronRight, CheckCircle2, ListFilter, 
  Settings2, UserPlus, Undo2, Redo2, Save, ExternalLink,
  Lock, Eye, EyeOff, ShieldCheck, LogOut
} from "lucide-react";
import { Member, GroupConfig, BoardState, FullState } from "./types.js";
import { motion, AnimatePresence } from "motion/react";

const renderAvatar = (avatar: string, sizeClass = "w-9 h-9 text-xl") => {
  if (avatar && (avatar.startsWith("data:image/") || avatar.startsWith("http://") || avatar.startsWith("https://"))) {
    return (
      <img 
        src={avatar} 
        alt="Avatar" 
        className={`${sizeClass.split(" ")[0]} ${sizeClass.split(" ")[1]} object-cover rounded-lg border border-white/5 shadow-inner`} 
        referrerPolicy="no-referrer"
      />
    );
  }
  return (
    <span className={`${sizeClass} flex items-center justify-center`}>
      {avatar || "👤"}
    </span>
  );
};

export default function App() {
  const [members, setMembers] = useState<Member[]>([]);
  const [config, setConfig] = useState<GroupConfig>({
    groupCount: 4,
    peoplePerGroup: 5,
    roundOrders: ["1,2,3,4", "4,3,2,1", "1,2,3,4", "4,3,2,1", "1,2,3,4"]
  });
  const [board, setBoard] = useState<BoardState>({
    candidateIds: [],
    silentIds: [],
    groups: {},
    currentPickIndex: 0
  });

  const [canUndo, setCanUndo] = useState(false);
  const [canRedo, setCanRedo] = useState(false);

  // Client local states
  const [searchQuery, setSearchQuery] = useState("");
  const [tempGroupCount, setTempGroupCount] = useState("4");
  const [tempPeoplePerGroup, setTempPeoplePerGroup] = useState("5");
  const [tempRoundOrders, setTempRoundOrders] = useState<string[]>([]);
  
  const [isSyncing, setIsSyncing] = useState(false);
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [toast, setToast] = useState<{ text: string; type: "success" | "error" | "info" } | null>(null);

  // Operational double click confirmations
  const [resetConfirm, setResetConfirm] = useState(false);
  const [resetAllConfirm, setResetAllConfirm] = useState(false);
  const [autoConfirm, setAutoConfirm] = useState(false);

  // System authentication states
  const [isSystemLoggedIn, setIsSystemLoggedIn] = useState(() => {
    return sessionStorage.getItem("system_auth_token") === "system-session-token";
  });
  const [systemPassword, setSystemPassword] = useState("");
  const [showSystemPassword, setShowSystemPassword] = useState(false);
  const [systemLoginError, setSystemLoginError] = useState<string | null>(null);
  const [isSystemLoggingIn, setIsSystemLoggingIn] = useState(false);

  // Keep a reference to prevent state flickering during polling
  const isDraggingRef = useRef(false);

  // Show visual feedback toast
  const showToast = (text: string, type: "success" | "error" | "info" = "success") => {
    setToast({ text, type });
    setTimeout(() => setToast(null), 3000);
  };

  const handleSystemLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!systemPassword.trim()) {
      setSystemLoginError("请输入访问密码");
      return;
    }

    try {
      setIsSystemLoggingIn(true);
      setSystemLoginError(null);
      const res = await fetch("/api/system/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ password: systemPassword })
      });

      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || "访问密码错误，请重新输入");
      }

      const data = await res.json();
      sessionStorage.setItem("system_auth_token", data.token);
      setIsSystemLoggedIn(true);
      showToast("登录成功！已解锁分组选马面板", "success");
    } catch (err: any) {
      setSystemLoginError(err.message || "身份验证失败");
    } finally {
      setIsSystemLoggingIn(false);
    }
  };

  const handleSystemLogout = () => {
    sessionStorage.removeItem("system_auth_token");
    setIsSystemLoggedIn(false);
    setSystemPassword("");
  };

  // Fetch full data from Express backend
  const fetchData = async (silent = false) => {
    if (!isSystemLoggedIn) return; // Skip if not authenticated
    if (isDraggingRef.current) return; // Skip polling fetch during active drag
    if (!silent) setIsSyncing(true);
    try {
      const res = await fetch("/api/data");
      if (!res.ok) throw new Error("获取后台数据失败");
      const data: FullState & { canUndo: boolean; canRedo: boolean } = await res.json();
      
      setMembers(data.members || []);
      setConfig(data.config);
      setBoard(data.board);
      setCanUndo(data.canUndo);
      setCanRedo(data.canRedo);

      // Sync local temp inputs if settings form is not being actively typed in
      if (!isSettingsOpen) {
        setTempGroupCount(String(data.config.groupCount));
        setTempPeoplePerGroup(String(data.config.peoplePerGroup));
        setTempRoundOrders(data.config.roundOrders || []);
      }
    } catch (err: any) {
      console.error(err);
    } finally {
      if (!silent) setIsSyncing(false);
    }
  };

  // Initial load & Polling setup for real-time multiplayer updates
  useEffect(() => {
    if (!isSystemLoggedIn) return;
    fetchData();
    const interval = setInterval(() => {
      fetchData(true);
    }, 2000); // Poll every 2s
    return () => clearInterval(interval);
  }, [isSettingsOpen, isSystemLoggedIn]);

  // Sync temp round orders when peoplePerGroup changes in form (we have peoplePerGroup - 1 draft rounds because Round 1 is captains)
  useEffect(() => {
    const numRounds = Math.max(0, (parseInt(tempPeoplePerGroup) || 5) - 1);
    const currentOrders = [...tempRoundOrders];
    
    if (currentOrders.length < numRounds) {
      // Add default draft order (e.g., 1,2,3,4, then 4,3,2,1 for next round)
      const grpCount = parseInt(tempGroupCount) || 4;
      const normalSeq = Array.from({ length: grpCount }, (_, i) => i + 1).join(",");
      const snakeSeq = Array.from({ length: grpCount }, (_, i) => grpCount - i).join(",");

      for (let i = currentOrders.length; i < numRounds; i++) {
        currentOrders.push(i % 2 === 0 ? normalSeq : snakeSeq);
      }
    } else if (currentOrders.length > numRounds) {
      currentOrders.splice(numRounds);
    }
    setTempRoundOrders(currentOrders);
  }, [tempPeoplePerGroup, tempGroupCount]);

  // Helper map to find member details
  const getMember = (id: string): Member | undefined => {
    return members.find(m => m.id === id);
  };

  // Filter lists based on search
  const isMatch = (member: Member | undefined) => {
    if (!member) return false;
    if (!searchQuery) return true;
    const q = searchQuery.toLowerCase();
    return (
      member.name.toLowerCase().includes(q) ||
      (member.role || "").toLowerCase().includes(q)
    );
  };

  const getTeamSumRating = (groupIdx: number) => {
    const list = board.groups[groupIdx] || [];
    return list.reduce((sum, id) => sum + (getMember(id)?.rating || 0), 0);
  };

  const getTeamAvgRating = (groupIdx: number) => {
    const list = board.groups[groupIdx] || [];
    if (list.length === 0) return 0;
    return Math.round(getTeamSumRating(groupIdx) / list.length);
  };

  // Look up group pairings from board state
  const getGroupPairings = () => {
    const pairings: { [groupIdx: number]: { pairIdx: number; letter: string; colorClass: string; borderClass: string; bgClass: string; textClass: string; badgeClass: string; glowClass: string } } = {};
    if (!board.pairings) return pairings;

    const pairDesigns = [
      { letter: "A", colorClass: "rose-500", borderClass: "border-rose-500/30", bgClass: "bg-rose-500/5", textClass: "text-rose-300", badgeClass: "bg-rose-500/15 text-rose-300 border-rose-500/20", glowClass: "rose-pick-glow" },
      { letter: "B", colorClass: "amber-500", borderClass: "border-amber-500/30", bgClass: "bg-amber-500/5", textClass: "text-amber-300", badgeClass: "bg-amber-500/15 text-amber-300 border-amber-500/20", glowClass: "amber-pick-glow" },
      { letter: "C", colorClass: "emerald-500", borderClass: "border-emerald-500/30", bgClass: "bg-emerald-500/5", textClass: "text-emerald-300", badgeClass: "bg-emerald-500/15 text-emerald-300 border-emerald-500/20", glowClass: "emerald-pick-glow" },
      { letter: "D", colorClass: "cyan-500", borderClass: "border-cyan-500/30", bgClass: "bg-cyan-500/5", textClass: "text-cyan-300", badgeClass: "bg-cyan-500/15 text-cyan-300 border-cyan-500/20", glowClass: "cyan-pick-glow" },
      { letter: "E", colorClass: "violet-500", borderClass: "border-violet-500/30", bgClass: "bg-violet-500/5", textClass: "text-violet-300", badgeClass: "bg-violet-500/15 text-violet-300 border-violet-500/20", glowClass: "violet-pick-glow" },
      { letter: "F", colorClass: "orange-500", borderClass: "border-orange-500/30", bgClass: "bg-orange-500/5", textClass: "text-orange-300", badgeClass: "bg-orange-500/15 text-orange-300 border-orange-500/20", glowClass: "orange-pick-glow" },
    ];

    Object.keys(board.pairings).forEach(groupIdxStr => {
      const groupIdx = parseInt(groupIdxStr);
      const pairIdx = board.pairings![groupIdxStr];
      if (typeof pairIdx === "number" && pairDesigns[pairIdx]) {
        pairings[groupIdx] = { pairIdx, ...pairDesigns[pairIdx] };
      }
    });

    return pairings;
  };

  // Calculate the overall picking sequence
  const getFlattenedDraftOrder = (): number[] => {
    const order: number[] = [];
    const grpCount = config.groupCount;
    const maxRounds = Math.max(0, config.peoplePerGroup - 1);
    
    for (let r = 0; r < maxRounds; r++) {
      const roundStr = config.roundOrders[r];
      if (roundStr) {
        // If string contains comma, split by comma. Otherwise, split into single characters
        const rawParts = roundStr.includes(",") ? roundStr.split(",") : roundStr.split("");
        const parts = rawParts
          .map(p => p.trim())
          .filter(Boolean)
          .map(p => parseInt(p))
          .filter(num => !isNaN(num) && num >= 1 && num <= grpCount)
          .map(num => num - 1); // 0-indexed
        
        if (parts.length > 0) {
          order.push(...parts);
          continue;
        }
      }
      // Fallback: standard round-robin sequence (1, 2, 3...)
      for (let g = 0; g < grpCount; g++) {
        order.push(g);
      }
    }
    return order;
  };

  const draftOrder = getFlattenedDraftOrder();
  const isCaptainRound = Array.from({ length: config.groupCount }).some((_, idx) => (board.groups[idx] || []).length === 0);
  const currentActiveGroupIdx = !isCaptainRound && draftOrder[board.currentPickIndex] !== undefined ? draftOrder[board.currentPickIndex] : null;
  const pairings = getGroupPairings();

  // Save Config
  const handleSaveConfig = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      const payload = {
        groupCount: parseInt(tempGroupCount) || 4,
        peoplePerGroup: parseInt(tempPeoplePerGroup) || 5,
        roundOrders: tempRoundOrders,
        gameType: config.gameType || "DOTA2"
      };

      const res = await fetch("/api/config", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload)
      });

      if (!res.ok) throw new Error("保存配置失败");
      const data = await res.json();
      setConfig(data.config);
      setBoard(data.board);
      showToast("分组配置已成功更新并保存！", "success");
      setIsSettingsOpen(false);
    } catch (err: any) {
      showToast(err.message, "error");
    }
  };

  const handleGameTypeChange = async (gameType: string) => {
    setConfig(prev => ({ ...prev, gameType }));
    try {
      const res = await fetch("/api/config", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          groupCount: config.groupCount,
          peoplePerGroup: config.peoplePerGroup,
          roundOrders: config.roundOrders,
          gameType
        })
      });
      if (!res.ok) throw new Error("切换游戏类型失败");
      const data = await res.json();
      setConfig(data.config);
      setBoard(data.board);
      showToast(`切换游戏类型为 ${gameType}`, "success");
    } catch (err: any) {
      showToast(err.message, "error");
      fetchData();
    }
  };

  // Drag and Drop implementation
  const handleDragStart = (e: React.DragEvent, memberId: string, source: string) => {
    isDraggingRef.current = true;
    e.dataTransfer.setData("text/plain", memberId);
    e.dataTransfer.setData("source", source);
    e.dataTransfer.effectAllowed = "move";
  };

  const handleDragEnd = () => {
    isDraggingRef.current = false;
  };

  const handleDrop = async (e: React.DragEvent, targetZone: string) => {
    e.preventDefault();
    isDraggingRef.current = false;
    const memberId = e.dataTransfer.getData("text/plain");
    const sourceZone = e.dataTransfer.getData("source");

    if (!memberId || sourceZone === targetZone) return;

    // Clone board state for optimistic UI updates
    const updatedCandidateIds = [...board.candidateIds];
    const updatedSilentIds = [...board.silentIds];
    const updatedGroups = { ...board.groups };
    Object.keys(updatedGroups).forEach(k => {
      updatedGroups[parseInt(k)] = [...(updatedGroups[parseInt(k)] || [])];
    });

    // 1. Remove from source
    if (sourceZone === "candidates") {
      const idx = updatedCandidateIds.indexOf(memberId);
      if (idx !== -1) updatedCandidateIds.splice(idx, 1);
    } else if (sourceZone === "silent") {
      const idx = updatedSilentIds.indexOf(memberId);
      if (idx !== -1) updatedSilentIds.splice(idx, 1);
    } else if (sourceZone.startsWith("group-")) {
      const grpIdx = parseInt(sourceZone.replace("group-", ""));
      const idx = updatedGroups[grpIdx]?.indexOf(memberId) ?? -1;
      if (idx !== -1) updatedGroups[grpIdx].splice(idx, 1);
    }

    // 2. Add to target
    let incrementPickIndex = false;
    if (targetZone === "candidates") {
      if (!updatedCandidateIds.includes(memberId)) {
        updatedCandidateIds.push(memberId);
      }
    } else if (targetZone === "silent") {
      if (!updatedSilentIds.includes(memberId)) {
        updatedSilentIds.push(memberId);
      }
    } else if (targetZone.startsWith("group-")) {
      const grpIdx = parseInt(targetZone.replace("group-", ""));
      if (!updatedGroups[grpIdx]) updatedGroups[grpIdx] = [];
      if (!updatedGroups[grpIdx].includes(memberId)) {
        updatedGroups[grpIdx].push(memberId);
        
        // Smart Assist: If we dragged from candidates into the currently active highlight group, auto advance draft turn!
        if (sourceZone === "candidates" && grpIdx === currentActiveGroupIdx) {
          incrementPickIndex = true;
        }
      }
    }

    // Calculate next pick turn index
    let nextPickIndex = board.currentPickIndex;
    if (incrementPickIndex) {
      const totalPicks = config.groupCount * (config.peoplePerGroup - 1);
      if (nextPickIndex < totalPicks) {
        nextPickIndex += 1;
      }
    }

    // Optimistic UI state update
    setBoard({
      candidateIds: updatedCandidateIds,
      silentIds: updatedSilentIds,
      groups: updatedGroups,
      currentPickIndex: nextPickIndex
    });

    // Send update to server
    try {
      const res = await fetch("/api/board/update", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          candidateIds: updatedCandidateIds,
          silentIds: updatedSilentIds,
          groups: updatedGroups,
          currentPickIndex: nextPickIndex
        })
      });
      if (!res.ok) throw new Error("更新分组状态失败");
      const data = await res.json();
      setBoard(data.board);
      setCanUndo(data.canUndo);
      setCanRedo(data.canRedo);
    } catch (err: any) {
      showToast(err.message, "error");
      fetchData(); // Rollback on failure
    }
  };

  // Check-In Action
  const handleCheckIn = async (memberId: string) => {
    // Move from silent to candidates
    const updatedCandidateIds = [...board.candidateIds];
    const updatedSilentIds = board.silentIds.filter(id => id !== memberId);
    if (!updatedCandidateIds.includes(memberId)) {
      updatedCandidateIds.push(memberId);
    }

    setBoard(prev => ({
      ...prev,
      candidateIds: updatedCandidateIds,
      silentIds: updatedSilentIds
    }));

    try {
      const res = await fetch("/api/board/checkin", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: memberId })
      });
      if (!res.ok) throw new Error("签到失败");
      const data = await res.json();
      setBoard(data.board);
      setCanUndo(data.canUndo);
      setCanRedo(data.canRedo);
      showToast("签到成功！人员已加入候选区");
    } catch (err: any) {
      showToast(err.message, "error");
      fetchData();
    }
  };

  // Undo / Redo
  const handleUndo = async () => {
    try {
      const res = await fetch("/api/undo", { method: "POST" });
      if (!res.ok) throw new Error("无法撤销");
      const data = await res.json();
      setBoard(data.board);
      setMembers(data.members);
      setConfig(data.config);
      setCanUndo(data.canUndo);
      setCanRedo(data.canRedo);
      showToast("已撤销上一步操作", "info");
    } catch (err: any) {
      showToast(err.message, "error");
    }
  };

  const handleRedo = async () => {
    try {
      const res = await fetch("/api/redo", { method: "POST" });
      if (!res.ok) throw new Error("无法重做");
      const data = await res.json();
      setBoard(data.board);
      setMembers(data.members);
      setConfig(data.config);
      setCanUndo(data.canUndo);
      setCanRedo(data.canRedo);
      showToast("已重做上一步操作", "info");
    } catch (err: any) {
      showToast(err.message, "error");
    }
  };

  // Clear Groupings
  const handleClearBoard = async () => {
    if (!resetConfirm) {
      setResetConfirm(true);
      showToast("请再次点击以确认重置全部分组！", "info");
      setTimeout(() => setResetConfirm(false), 3000);
      return;
    }
    setResetConfirm(false);

    try {
      const res = await fetch("/api/board/clear", { method: "POST" });
      if (!res.ok) throw new Error("清空分组失败");
      const data = await res.json();
      setBoard(data.board);
      setCanUndo(data.canUndo);
      setCanRedo(data.canRedo);
      showToast("已清空分组，重置所有进度", "info");
    } catch (err: any) {
      showToast(err.message, "error");
    }
  };

  // Reset All Status (Move all cards to check-in/silent zone)
  const handleResetAll = async () => {
    if (!resetAllConfirm) {
      setResetAllConfirm(true);
      showToast("请再次点击以确认重置全部状态（卡片移至签到区）！", "info");
      setTimeout(() => setResetAllConfirm(false), 3000);
      return;
    }
    setResetAllConfirm(false);

    try {
      const res = await fetch("/api/board/reset_all", { method: "POST" });
      if (!res.ok) throw new Error("重置全部状态失败");
      const data = await res.json();
      setBoard(data.board);
      setCanUndo(data.canUndo);
      setCanRedo(data.canRedo);
      showToast("已重置所有状态，所有人员已移至签到区", "success");
    } catch (err: any) {
      showToast(err.message, "error");
    }
  };

  // Auto Balance / Quick Auto Grouping (Now matches groups randomly)
  const handleAutoGroup = async () => {
    if (!autoConfirm) {
      setAutoConfirm(true);
      showToast("请再次点击以确认进行智能自动分配！", "info");
      setTimeout(() => setAutoConfirm(false), 3000);
      return;
    }
    setAutoConfirm(false);

    const groupCount = config.groupCount;
    if (groupCount < 2) {
      showToast("分组数量不足，无法进行两两匹配！", "error");
      return;
    }

    const indices = Array.from({ length: groupCount }, (_, i) => i);
    const shuffled = [...indices];
    for (let i = shuffled.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
    }

    const newPairings: { [groupIdx: string]: number } = {};
    for (let i = 0; i < shuffled.length; i += 2) {
      if (i + 1 < shuffled.length) {
        const pairIdx = Math.floor(i / 2);
        newPairings[String(shuffled[i])] = pairIdx;
        newPairings[String(shuffled[i + 1])] = pairIdx;
      }
    }

    // Optimistic state
    setBoard(prev => ({
      ...prev,
      pairings: newPairings
    }));

    try {
      const res = await fetch("/api/board/update", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          pairings: newPairings
        })
      });
      if (!res.ok) throw new Error("自动分配失败");
      const data = await res.json();
      setBoard(data.board);
      showToast("组两两随机匹配高亮分配完成！", "success");
    } catch (err: any) {
      showToast(err.message, "error");
      fetchData();
    }
  };

  // Filter lists based on search
  if (!isSystemLoggedIn) {
    return (
      <div className="min-h-screen bg-[#0c0e14] text-slate-200 font-sans flex items-center justify-center relative overflow-hidden select-none">
        {/* Background glowing decorations */}
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_20%_30%,#1e293b_0%,transparent_50%),radial-gradient(circle_at_80%_70%,#312e81_0%,transparent_50%)] opacity-50 pointer-events-none z-0"></div>

        <div className="w-full max-w-md px-4 relative z-10">
          <div className="frosted-glass-panel p-8 rounded-3xl shadow-2xl border border-white/10 relative overflow-hidden">
            <div className="absolute -right-6 -top-6 w-24 h-24 bg-indigo-500/10 blur-2xl rounded-full"></div>
            
            <div className="text-center mb-8">
              <div className="mx-auto w-14 h-14 bg-indigo-600/15 border border-indigo-500/30 rounded-2xl flex items-center justify-center text-indigo-300 text-2xl mb-4 shadow-lg">
                <Lock className="w-6 h-6 animate-pulse" />
              </div>
              <h2 className="text-2xl font-extrabold tracking-tight text-white">刀塔宝可梦选马系统</h2>
              <p className="text-xs text-slate-400 mt-2">请输入系统访问密码以解锁主面板</p>
            </div>

            <form onSubmit={handleSystemLogin} className="space-y-5">
              <div>
                <label className="block text-xs font-semibold text-slate-400 uppercase tracking-wider mb-2">
                  访问密码
                </label>
                <div className="relative">
                  <span className="absolute left-3.5 top-3.5 text-slate-500">
                    <Lock className="w-4 h-4" />
                  </span>
                  <input
                    type={showSystemPassword ? "text" : "password"}
                    value={systemPassword}
                    onChange={(e) => setSystemPassword(e.target.value)}
                    placeholder="请输入系统访问密码 (默认 123456)"
                    className="w-full bg-black/40 border border-white/10 focus:border-indigo-500/50 rounded-xl py-3 pl-10 pr-12 text-white text-sm outline-none transition-all focus:ring-1 focus:ring-indigo-500/30"
                    required
                    autoFocus
                  />
                  <button
                    type="button"
                    onClick={() => setShowSystemPassword(!showSystemPassword)}
                    className="absolute right-3 top-3 p-1 text-slate-500 hover:text-white transition-colors"
                  >
                    {showSystemPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  </button>
                </div>
              </div>

              {systemLoginError && (
                <div className="bg-rose-500/10 border border-rose-500/20 text-rose-400 text-xs py-3 px-4 rounded-xl flex items-center gap-2">
                  <HelpCircle className="w-4 h-4 shrink-0 text-rose-500" />
                  <span>{systemLoginError}</span>
                </div>
              )}

              <button
                type="submit"
                disabled={isSystemLoggingIn}
                className="w-full flex items-center justify-center gap-2 bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 text-white font-bold py-3 px-4 rounded-xl shadow-lg shadow-indigo-600/20 transition-all text-sm"
              >
                {isSystemLoggingIn ? (
                  <RotateCcw className="w-4 h-4 animate-spin" />
                ) : (
                  <>
                    <ShieldCheck className="w-4.5 h-4.5" />
                    <span>验证并进入</span>
                  </>
                )}
              </button>
            </form>

            <div className="mt-6 text-center border-t border-white/5 pt-5">
              <a 
                href="/member.html" 
                className="inline-flex items-center gap-1.5 text-xs text-indigo-300 hover:text-white transition-colors animate-pulse"
              >
                <UserPlus className="w-3.5 h-3.5" />
                前往选手卡片管理后台
              </a>
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#0c0e14] text-slate-200 flex flex-col font-sans pb-32 relative overflow-x-hidden select-none">
      {/* Background glowing decorations */}
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_20%_30%,#1e293b_0%,transparent_50%),radial-gradient(circle_at_80%_70%,#312e81_0%,transparent_50%)] opacity-50 pointer-events-none z-0"></div>

      {/* Toast */}
      <AnimatePresence>
        {toast && (
          <motion.div 
            initial={{ opacity: 0, y: -20, scale: 0.95 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -20, scale: 0.95 }}
            className={`fixed top-6 right-6 z-50 flex items-center gap-2 px-5 py-3 rounded-xl shadow-2xl border ${
              toast.type === "success" 
                ? "bg-slate-900/95 text-emerald-400 border-emerald-500/20" 
                : toast.type === "error"
                ? "bg-slate-900/95 text-rose-400 border-rose-500/20"
                : "bg-slate-900/95 text-indigo-400 border-indigo-500/20"
            }`}
          >
            {toast.type === "success" && <Sparkles className="w-5 h-5" />}
            {toast.type === "error" && <HelpCircle className="w-5 h-5 text-rose-500" />}
            {toast.type === "info" && <RotateCcw className="w-5 h-5 text-indigo-400" />}
            <span className="font-semibold text-sm">{toast.text}</span>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Top Header / Navigation Bar */}
      <nav className="frosted-glass-header border-b border-white/10 px-6 py-4 sticky top-0 z-40">
        <div className="max-w-full px-4 md:px-6 flex flex-col xl:flex-row items-center justify-between gap-4">
          
          {/* Logo & Title */}
          <div className="flex items-center justify-between w-full xl:w-auto">
            <div className="flex items-center gap-3">
              <div className="bg-indigo-500/20 p-2 rounded-xl border border-indigo-400/30 text-xl shadow-lg">
                ⭐
              </div>
              <div className="flex flex-col sm:flex-row sm:items-center gap-3">
                <div>
                  <h1 className="text-xl font-bold tracking-tight bg-gradient-to-r from-indigo-300 to-cyan-300 bg-clip-text text-transparent flex items-center gap-2">
                    刀塔宝可梦选马分组系统
                  </h1>
                  <p className="text-xs text-slate-400">实时同步 ✦ 拖拽分配 ✦ 动态选马顺序</p>
                </div>
                <div className="flex items-center bg-white/5 border border-white/10 rounded-xl p-1 text-xs gap-1 self-start sm:self-center shrink-0">
                  {["DOTA2", "CS", "PUBG"].map((g) => (
                    <button
                      key={g}
                      onClick={() => handleGameTypeChange(g)}
                      className={`px-3 py-1.5 rounded-lg font-bold transition-all duration-200 ${
                        (config.gameType || "DOTA2") === g
                          ? "bg-indigo-600 text-white shadow-md shadow-indigo-600/35"
                          : "text-slate-400 hover:text-slate-200"
                      }`}
                    >
                      {g}
                    </button>
                  ))}
                </div>
              </div>
            </div>

            {/* Config & Manage buttons on mobile */}
            <div className="flex xl:hidden gap-2 items-center">
              <button 
                onClick={() => setIsSettingsOpen(!isSettingsOpen)}
                className="p-2.5 bg-white/5 hover:bg-white/10 rounded-xl border border-white/10 text-slate-300"
                title="调整配置"
              >
                <Settings className="w-5 h-5" />
              </button>
              <a 
                href="/member.html"
                className="p-2.5 bg-indigo-500/20 hover:bg-indigo-500/30 border border-indigo-400/30 rounded-xl text-indigo-300"
                title="人员卡片后台"
              >
                <UserPlus className="w-5 h-5" />
              </a>
              <button 
                onClick={handleSystemLogout}
                className="p-2.5 bg-rose-500/10 hover:bg-rose-500/20 text-rose-400 rounded-xl border border-rose-500/20"
                title="退出系统"
              >
                <LogOut className="w-5 h-5" />
              </button>
            </div>
          </div>

          {/* Quick Search */}
          <div className="relative w-full xl:max-w-xs">
            <Search className="absolute left-3 top-3 w-4.5 h-4.5 text-slate-400" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="搜索候选人姓名或擅长位置..."
              className="w-full bg-white/5 border border-white/10 focus:border-indigo-500/40 rounded-xl py-2.5 pl-10 pr-4 text-white text-sm outline-none transition-all focus:ring-1 focus:ring-indigo-500/30"
            />
          </div>

          {/* Configuration Inputs & Buttons (Desktop View inline) */}
          <div className="hidden xl:flex items-center gap-3 w-full xl:w-auto justify-end">
            <button 
              onClick={() => setIsSettingsOpen(!isSettingsOpen)}
              className={`flex items-center gap-2 px-4 py-2.5 bg-white/5 hover:bg-white/10 text-slate-200 text-sm font-semibold rounded-xl border border-white/10 transition-colors ${
                isSettingsOpen ? "bg-white/15 border-indigo-500/30 text-white" : ""
              }`}
            >
              <Settings2 className="w-4.5 h-4.5 text-indigo-300" />
              调整组数与选马顺序
            </button>

            <a 
              href="/member.html"
              className="flex items-center gap-2 px-4 py-2.5 bg-indigo-600/15 hover:bg-indigo-600/25 text-indigo-300 text-sm font-semibold rounded-xl border border-indigo-500/20 transition-all"
            >
              <UserPlus className="w-4.5 h-4.5" />
              人员卡片后台
              <ExternalLink className="w-3.5 h-3.5 opacity-65" />
            </a>

            <button 
              onClick={handleSystemLogout}
              className="flex items-center gap-2 px-4 py-2.5 bg-rose-600/15 hover:bg-rose-600/25 text-rose-400 text-sm font-semibold rounded-xl border border-rose-500/20 transition-all"
            >
              <LogOut className="w-4.5 h-4.5" />
              退出系统
            </button>
          </div>
        </div>
      </nav>

      {/* Settings Modal/Drawer drop-down */}
      <AnimatePresence>
        {isSettingsOpen && (
          <motion.div 
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            className="bg-white/5 backdrop-blur-xl border-b border-white/10 overflow-hidden relative z-30"
          >
            <div className="max-w-4xl mx-auto px-6 py-6">
              <form onSubmit={handleSaveConfig} className="space-y-6">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  <div>
                    <label className="block text-xs font-bold text-slate-400 uppercase tracking-wider mb-2">
                      分组数量 (设置动态阵营数)
                    </label>
                    <input
                      type="number"
                      min="2"
                      max="12"
                      value={tempGroupCount}
                      onChange={(e) => setTempGroupCount(e.target.value)}
                      className="w-full bg-black/30 border border-white/10 focus:border-indigo-500/40 rounded-xl py-2.5 px-4 text-white text-sm outline-none transition-all"
                      required
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-bold text-slate-400 uppercase tracking-wider mb-2">
                      每组人数 (设置最终挑选轮次)
                    </label>
                    <input
                      type="number"
                      min="1"
                      max="10"
                      value={tempPeoplePerGroup}
                      onChange={(e) => setTempPeoplePerGroup(e.target.value)}
                      className="w-full bg-black/30 border border-white/10 focus:border-indigo-500/40 rounded-xl py-2.5 px-4 text-white text-sm outline-none transition-all"
                      required
                    />
                  </div>
                </div>

                {/* Pick sequence input rows */}
                <div>
                  <div className="flex flex-col gap-1 mb-3">
                    <label className="block text-xs font-bold text-slate-400 uppercase tracking-wider">
                      每组选马轮次顺序配置 (第一轮为各队队长，从第二轮开始执行，显示 <b>{Math.max(0, (parseInt(tempPeoplePerGroup) || 5) - 1)}</b> 个框)
                    </label>
                    <span className="text-slate-500 text-xs">
                      输入对应的队伍编号，例如直接输入 1234 或 4321（也可以用英文逗号分隔，如 1,2,3,4）
                    </span>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-5 gap-4">
                    {Array.from({ length: Math.max(0, (parseInt(tempPeoplePerGroup) || 5) - 1) }).map((_, r) => (
                      <div key={r} className="bg-black/20 p-3 rounded-xl border border-white/5">
                        <span className="block text-xs text-indigo-300 font-semibold mb-1">第 {r + 2} 轮挑选队伍顺序</span>
                        <input
                          type="text"
                          value={tempRoundOrders[r] || ""}
                          onChange={(e) => {
                            const updated = [...tempRoundOrders];
                            updated[r] = e.target.value;
                            setTempRoundOrders(updated);
                          }}
                          placeholder="例如 1234..."
                          className="w-full bg-black/40 border border-white/10 focus:border-indigo-500/40 rounded-lg py-1.5 px-2.5 text-white text-xs font-mono outline-none text-center"
                        />
                      </div>
                    ))}
                  </div>
                </div>

                <div className="flex items-center justify-end gap-3 pt-2">
                  <button
                    type="button"
                    onClick={() => setIsSettingsOpen(false)}
                    className="px-4 py-2.5 bg-white/5 hover:bg-white/10 text-slate-300 text-xs font-semibold rounded-xl border border-white/10"
                  >
                    取消
                  </button>
                  <button
                    type="submit"
                    className="px-5 py-2.5 bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-semibold rounded-xl flex items-center gap-1.5 shadow-lg shadow-indigo-500/20"
                  >
                    <Save className="w-4 h-4" />
                    确认提交分组配置
                  </button>
                </div>
              </form>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Main Drafting Dashboard Area */}
      <main className="flex-1 max-w-full px-6 md:px-8 py-8 w-full flex flex-col gap-8 relative z-10">
        
        {/* Helper Banner & Active pick order indicator */}
        <section className="frosted-glass-header p-5 rounded-2xl flex flex-col md:flex-row items-center justify-between gap-4 shadow-2xl">
          <div className="flex items-center gap-3">
            <div className="w-11 h-11 bg-indigo-500/20 rounded-xl flex items-center justify-center border border-indigo-400/30 text-indigo-300">
              <Award className="w-6 h-6 animate-pulse" />
            </div>
            <div>
              <h2 className="text-sm font-bold text-white flex items-center gap-2">
                当前选马状态 
                <span className="text-xs font-normal text-slate-400">(共 {config.groupCount * (config.peoplePerGroup - 1)} 选马签位)</span>
              </h2>
              {isCaptainRound ? (
                <div className="text-slate-300 text-sm mt-1">
                  第 <b className="text-indigo-300 text-base">1</b> 轮选马 (分配各队队长) — <span className="text-slate-400">当前各队分配队长中，可任意拖拽，不对分组高亮</span>
                </div>
              ) : currentActiveGroupIdx !== null ? (
                <div className="text-slate-300 text-sm mt-1">
                  第 <b className="text-indigo-300 text-base">{Math.floor(board.currentPickIndex / config.groupCount) + 2}</b> 轮选马 (第一轮为各队队长) — 第 <b className="text-white text-base">{board.currentPickIndex + 1}</b> 手 ✦ 请拖拽至 <b>[{getMember(board.groups[currentActiveGroupIdx]?.[0])?.name ? `${getMember(board.groups[currentActiveGroupIdx]?.[0])?.name}队` : `第 ${currentActiveGroupIdx + 1} 组`}]</b>
                </div>
              ) : (
                <p className="text-slate-400 text-sm mt-1">选马流程已完毕或尚未开始配置</p>
              )}
            </div>
          </div>

          {/* Sequential Picks Highlight Rail */}
          <div className="flex items-center gap-1.5 bg-black/20 p-2.5 rounded-xl border border-white/5 overflow-x-auto max-w-full scrollbar">
            {draftOrder.slice(Math.max(0, board.currentPickIndex - 2), board.currentPickIndex + 6).map((grpIdx, idx) => {
              const actualPickNo = Math.max(0, board.currentPickIndex - 2) + idx;
              const isActive = actualPickNo === board.currentPickIndex;
              const isPast = actualPickNo < board.currentPickIndex;

              return (
                <div 
                  key={actualPickNo}
                  className={`flex flex-col items-center justify-center px-3 py-1 rounded-lg border text-xs font-mono whitespace-nowrap min-w-[64px] transition-all ${
                    isActive 
                      ? "bg-indigo-500/30 text-indigo-300 border-indigo-400/50 ring-1 ring-indigo-500/25 scale-105"
                      : isPast
                      ? "bg-white/5 text-slate-500 border-transparent line-through"
                      : "bg-white/5 text-slate-400 border-white/10"
                  }`}
                >
                  <span className="text-[9px] uppercase tracking-wider opacity-60">Pick {actualPickNo + 1}</span>
                  <span className="font-semibold text-xs mt-0.5 truncate max-w-[80px]">
                    {getMember(board.groups[grpIdx]?.[0])?.name ? `${getMember(board.groups[grpIdx]?.[0])?.name}队` : `第 ${grpIdx + 1} 组`}
                  </span>
                </div>
              );
            })}
            {draftOrder.length > board.currentPickIndex + 6 && (
              <span className="text-slate-600 px-2 font-bold">...</span>
            )}
          </div>
        </section>

         {/* 2. Group Zone (分组区) - Moved above Candidate Zone */}
        <section className="flex flex-col gap-4">
          <div className="flex items-center justify-between pb-1">
            <h3 className="font-extrabold text-sm text-slate-300 uppercase tracking-wider flex items-center gap-2">
              <Award className="w-5 h-5 text-indigo-400" />
              实时选马分组区 ({config.groupCount} 支队伍)
            </h3>
            <span className="text-xs text-slate-400">
              * 高亮闪烁的紫色队伍为当前顺位选马方 ✦
            </span>
          </div>

          {/* Dynamic Row for Teams - Flat single-row layout with no horizontal scroll */}
          <div className="flex flex-col lg:flex-row gap-6 w-full justify-between items-stretch">
            {Array.from({ length: config.groupCount }).map((_, groupIdx) => {
              const teamMemberIds = board.groups[groupIdx] || [];
              const isActivePicker = groupIdx === currentActiveGroupIdx;
              const pair = pairings[groupIdx];

              return (
                <div
                  key={groupIdx}
                  onDragOver={(e) => e.preventDefault()}
                  onDrop={(e) => handleDrop(e, `group-${groupIdx}`)}
                  className={`backdrop-blur-md p-5 rounded-2xl flex flex-col min-h-[460px] transition-all border relative overflow-hidden group/team-box flex-1 min-w-0 ${
                    isActivePicker 
                      ? "active-pick-glow bg-indigo-500/10 border-2 border-indigo-500/50" 
                      : pair
                      ? `${pair.borderClass} ${pair.bgClass} shadow-xl shadow-${pair.colorClass}/5`
                      : "bg-white/5 border border-white/10"
                  }`}
                >
                  {/* Highly designed watermark letter of the matched pair - High visibility opacity */}
                  {pair && (
                    <div 
                      className="absolute right-4 bottom-2 text-9xl md:text-[11rem] font-black font-mono select-none pointer-events-none transition-all duration-300 opacity-[0.80] group-hover/team-box:opacity-[0.95] tracking-tighter"
                      style={{ 
                        color: pair.colorClass === "rose-500" ? "#f43f5e" : pair.colorClass === "amber-500" ? "#f59e0b" : pair.colorClass === "emerald-500" ? "#10b981" : pair.colorClass === "cyan-500" ? "#06b6d4" : pair.colorClass === "violet-500" ? "#8b5cf6" : "#f97316",
                        textShadow: "0 0 40px rgba(0,0,0,0.6)"
                      }}
                    >
                      {pair.letter}
                    </div>
                  )}

                  {/* Decorative glowing sphere inside active picker */}
                  {isActivePicker && (
                    <div className="absolute -right-4 -top-4 w-16 h-16 bg-indigo-500/20 blur-2xl rounded-full pointer-events-none"></div>
                  )}

                  {/* Team Header */}
                  <div className="flex items-start justify-between border-b border-white/10 pb-3 mb-4 relative z-10">
                    <div>
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className={`w-2.5 h-2.5 rounded-full ${isActivePicker ? "bg-indigo-400 animate-pulse" : pair ? (pair.colorClass === "rose-500" ? "bg-rose-500" : pair.colorClass === "amber-500" ? "bg-amber-500" : pair.colorClass === "emerald-500" ? "bg-emerald-500" : pair.colorClass === "cyan-500" ? "bg-cyan-500" : pair.colorClass === "violet-500" ? "bg-violet-500" : "bg-orange-500") : "bg-white/20"}`}></span>
                        <h4 className={`font-black uppercase text-sm ${isActivePicker ? "text-indigo-300" : pair ? pair.textClass : "text-white/60"}`}>
                          {getMember(teamMemberIds[0])?.name ? `${getMember(teamMemberIds[0])?.name}队` : `TEAM ${String(groupIdx + 1).padStart(2, '0')}`}
                        </h4>
                        {isActivePicker ? (
                          <span className="text-[10px] font-bold bg-indigo-500/20 text-indigo-300 px-1.5 py-0.5 rounded border border-indigo-500/30 uppercase tracking-wider">
                            PICKING
                          </span>
                        ) : pair ? (
                          <span className={`text-[11px] font-black px-2.5 py-1 rounded-lg border tracking-wide shrink-0 font-mono shadow-md animate-pulse ${pair.badgeClass}`}>
                            对决组 {pair.letter}
                          </span>
                        ) : null}
                      </div>
                      {(config.gameType || "DOTA2") === "DOTA2" && (
                        <span className="text-slate-400 text-xs font-mono block mt-1">
                          平均战力: <b className={isActivePicker ? "text-indigo-300" : pair ? pair.textClass : "text-slate-200"}>{getTeamAvgRating(groupIdx)}</b>
                        </span>
                      )}
                    </div>

                    <div className="text-right">
                      <span className={`text-[11px] font-mono px-2 rounded py-1 font-bold ${isActivePicker ? "bg-indigo-500/20 text-indigo-300" : pair ? pair.badgeClass : "bg-black/30 text-white/50"}`}>
                        {teamMemberIds.length} / {config.peoplePerGroup}
                      </span>
                    </div>
                  </div>

                  {/* Team Cards List - Enlarged max height */}
                  <div className="flex-1 flex flex-col gap-2 overflow-y-auto max-h-[380px] pr-1 scrollbar relative z-10">
                    {teamMemberIds.length === 0 ? (
                      <div className="flex-1 border-2 border-dashed border-white/5 rounded-xl flex flex-col items-center justify-center p-6 text-center text-slate-500 text-xs">
                        <span>等待加入</span>
                        <span className="mt-1 opacity-60">拖动人员至此</span>
                      </div>
                    ) : (
                      teamMemberIds.map((mid) => {
                        const m = getMember(mid);
                        if (!m) return null;
                        return (
                          <motion.div
                            key={m.id}
                            layoutId={`card-${m.id}`}
                            draggable
                            onDragStart={(e) => handleDragStart(e, m.id, `group-${groupIdx}`)}
                            onDragEnd={handleDragEnd}
                            className={`p-3.5 rounded-xl flex items-center justify-between cursor-grab active:cursor-grabbing transition-all group overflow-hidden border ${
                              isActivePicker 
                                ? "bg-indigo-600/20 hover:bg-indigo-600/30 border-indigo-500/30" 
                                : pair 
                                ? `bg-white/[0.03] hover:bg-white/[0.08] ${pair.borderClass}`
                                : "bg-white/5 hover:bg-white/10 border-white/10"
                            }`}
                          >
                            <div className="flex items-center gap-3 overflow-hidden flex-1">
                              <div className="text-xl bg-black/30 w-9 h-9 rounded-lg flex items-center justify-center border border-white/5 shrink-0 overflow-hidden">
                                {renderAvatar(m.avatar, "w-9 h-9 text-xl")}
                              </div>
                              <div className="truncate flex-1">
                                <span className="text-sm font-extrabold text-white block truncate">{m.name}</span>
                                {(config.gameType || "DOTA2") === "DOTA2" && (
                                  <span className={`text-[10px] font-mono block truncate mt-0.5 ${isActivePicker ? "text-indigo-300" : pair ? pair.textClass : "text-slate-400"}`}>{m.role || "-"}</span>
                                )}
                              </div>
                            </div>
                            {(config.gameType || "DOTA2") === "DOTA2" && (
                              <span className={`text-xs font-mono font-black px-2 py-1 rounded shrink-0 ${isActivePicker ? "text-indigo-300 bg-indigo-500/15" : pair ? `${pair.textClass} ${pair.badgeClass}` : "text-slate-300 bg-white/10"}`}>
                                {m.rating !== undefined && m.rating !== null ? m.rating : "-"}
                              </span>
                            )}
                          </motion.div>
                        );
                      })
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </section>

        {/* 1. Candidate Zone (候选区) - Moved below Group Zone */}
        <section 
          id="candidates-zone"
          onDragOver={(e) => e.preventDefault()}
          onDrop={(e) => handleDrop(e, "candidates")}
          className="frosted-glass-panel rounded-2xl p-6 transition-all shadow-xl"
        >
          <div className="flex items-center justify-between mb-4 pb-2 border-b border-white/10">
            <h3 className="font-bold text-xs uppercase tracking-widest text-indigo-300 flex items-center gap-2">
              <span className="w-2 h-2 rounded-full bg-indigo-400 animate-pulse"></span>
              候选区 (Active Candidates)
              <span className="text-[10px] bg-indigo-500/20 text-indigo-300 px-2 py-0.5 rounded-full">
                {board.candidateIds.length} 人在场
              </span>
            </h3>
            <p className="text-xs text-slate-400 hidden md:block">拖拽候选人卡片至上方分组队伍，会自动递增选人轮次</p>
          </div>

          {/* Candidates Grid - Larger cards layout */}
          <div className="min-h-[120px] max-h-[350px] overflow-y-auto pr-2 scrollbar">
            {board.candidateIds.length === 0 ? (
              <div className="h-24 flex flex-col items-center justify-center text-center text-slate-500 border border-dashed border-white/10 rounded-xl">
                <span>候选区为空</span>
                <span className="text-xs text-slate-600 mt-1">可在下方静默区点击人员“签到”加入候选，或去后台创建新人员</span>
              </div>
            ) : (
              <div className="grid grid-cols-2 sm:grid-cols-4 md:grid-cols-6 lg:grid-cols-8 xl:grid-cols-10 gap-3">
                {board.candidateIds
                  .map(id => getMember(id))
                  .filter(m => m && isMatch(m))
                  .map((m) => {
                    if (!m) return null;
                    return (
                      <motion.div
                        key={m.id}
                        layoutId={`card-${m.id}`}
                        draggable
                        onDragStart={(e) => handleDragStart(e, m.id, "candidates")}
                        onDragEnd={handleDragEnd}
                        className="frosted-glass-card p-2 rounded-xl flex items-center gap-2 cursor-grab active:cursor-grabbing hover:bg-white/20 transition-all group shadow border border-white/15 overflow-hidden"
                      >
                        <div className="w-8 h-8 bg-black/40 rounded-lg flex items-center justify-center text-lg border border-white/10 shadow-inner overflow-hidden shrink-0">
                          {renderAvatar(m.avatar, "w-8 h-8 text-lg")}
                        </div>
                        <div className="overflow-hidden flex-1">
                          <h4 className="text-xs font-black text-white truncate">{m.name}</h4>
                          {(config.gameType || "DOTA2") === "DOTA2" && (
                            <div className="flex items-center gap-1 mt-0.5 font-mono text-[9px] text-slate-400">
                              <span className="text-indigo-300 truncate max-w-[50px]">{m.role || "-"}</span>
                              <span className="w-1.5 h-1.5 bg-white/10 rounded-full shrink-0"></span>
                              <span className="text-slate-300 font-semibold">{m.rating !== undefined && m.rating !== null ? m.rating : "-"}</span>
                            </div>
                          )}
                        </div>
                      </motion.div>
                    );
                  })}
              </div>
            )}
          </div>
        </section>

        {/* 3. Check-In / Silent Zone (签到区) */}
        <section 
          id="silent-zone"
          onDragOver={(e) => e.preventDefault()}
          onDrop={(e) => handleDrop(e, "silent")}
          className="frosted-glass-silent rounded-2xl p-6 transition-all shadow-xl"
        >
          <div className="flex items-center justify-between mb-4 pb-2 border-b border-white/10">
            <h3 className="text-sm font-bold uppercase tracking-widest text-slate-400 flex items-center gap-2">
              <UserCheck className="w-5.5 h-5.5 text-indigo-300" />
              <span className="text-base font-black text-white">签到区</span> (Silent/Check-in)
              <span className="text-[10px] bg-white/5 border border-white/10 px-2 py-0.5 rounded text-slate-400">
                {board.silentIds.length} 人在库
              </span>
            </h3>
            <p className="text-xs text-slate-500 hidden md:block">静默区内卡片不会被分组。点击卡片下方的<b>签到按钮</b>可立即加入候选区！</p>
          </div>

          {/* Silent Cards Grid - Larger cards layout */}
          <div className="min-h-[120px] max-h-[350px] overflow-y-auto pr-2 scrollbar">
            {board.silentIds.length === 0 ? (
              <div className="h-24 flex flex-col items-center justify-center text-center text-slate-500 border border-dashed border-white/10 rounded-xl">
                <span>无静默备用选手</span>
                <span className="text-xs text-slate-600 mt-1">管理员从后台录入新人员时将默认出现在静默签到区</span>
              </div>
            ) : (
              <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 xl:grid-cols-8 gap-4">
                {board.silentIds
                  .map(id => getMember(id))
                  .filter(m => m && isMatch(m))
                  .map((m) => {
                    if (!m) return null;
                    return (
                      <motion.div
                        key={m.id}
                        layoutId={`card-${m.id}`}
                        draggable
                        onDragStart={(e) => handleDragStart(e, m.id, "silent")}
                        onDragEnd={handleDragEnd}
                        className="bg-black/40 border border-white/5 p-4 rounded-2xl flex flex-col items-center justify-between text-center cursor-grab hover:bg-black/50 hover:border-indigo-500/20 transition-all shadow-md group overflow-hidden h-full gap-3 min-h-[140px]"
                      >
                        <div className="flex flex-col items-center gap-2 overflow-hidden w-full">
                          <div className="w-12 h-12 rounded-xl bg-black/30 flex items-center justify-center text-2xl border border-white/10 overflow-hidden shrink-0 shadow-inner">
                            {renderAvatar(m.avatar, "w-12 h-12 text-2xl")}
                          </div>
                          <div className="truncate w-full">
                            <h4 className="text-xs sm:text-sm font-black text-white truncate">{m.name}</h4>
                            {(config.gameType || "DOTA2") === "DOTA2" && (
                              <span className="text-[10px] font-mono text-indigo-300 block truncate mt-0.5">{m.role || "-"}</span>
                            )}
                          </div>
                        </div>

                        {/* Check-In Quick Button */}
                        <button
                          onClick={() => handleCheckIn(m.id)}
                          className="w-full text-xs sm:text-sm bg-green-600/20 text-green-400 py-1.5 rounded-xl border border-green-500/30 hover:bg-green-600/30 active:bg-green-600/40 transition-all font-extrabold shadow-md shrink-0 mt-1"
                        >
                          签到
                        </button>
                      </motion.div>
                    );
                  })}
              </div>
            )}
          </div>
        </section>
      </main>

      {/* Floating Bottom Control Bar (操作区) */}
      <footer className="fixed bottom-0 left-0 right-0 z-40 bg-[#0c0e14]/90 backdrop-blur-md border-t border-white/5 px-6 py-4 shadow-2xl">
        <div className="max-w-full px-4 md:px-6 flex flex-col md:flex-row items-center justify-between gap-4">
          
          {/* Progress Summary info */}
          <div className="flex items-center gap-4 text-slate-400 text-sm font-medium">
            <div className="flex items-center gap-1.5">
              <span className="w-2 h-2 bg-emerald-500 rounded-full"></span>
              <span>候选: <b>{board.candidateIds.length}</b> 人</span>
            </div>
            <div className="flex items-center gap-1.5">
              <span className="w-2 h-2 bg-indigo-500 rounded-full"></span>
              <span>已分配: <b>{Object.values(board.groups).flat().length}</b> 人</span>
            </div>
            <div className="flex items-center gap-1.5">
              <span className="w-2 h-2 bg-slate-500 rounded-full"></span>
              <span>选人第: <b>{board.currentPickIndex}</b> 顺位</span>
            </div>
          </div>

          {/* Operational Buttons */}
          <div className="flex items-center gap-3.5 flex-wrap justify-center">
            {/* 重置全部状态 */}
            <button
              onClick={handleResetAll}
              className={`text-xs font-bold px-4 py-2.5 rounded-xl shadow-lg flex items-center gap-1.5 transition-all duration-200 text-white ${
                resetAllConfirm 
                  ? "bg-teal-500 animate-pulse shadow-teal-500/35 ring-2 ring-teal-400" 
                  : "bg-teal-600 hover:bg-teal-500 shadow-teal-600/20"
              }`}
            >
              <RotateCcw className="w-4 h-4 shrink-0" />
              {resetAllConfirm ? "确认重置？再次点击" : "重置全部状态"}
            </button>

            {/* 重置全部分组 */}
            <button
              onClick={handleClearBoard}
              className={`text-xs font-bold px-4 py-2.5 rounded-xl shadow-lg flex items-center gap-1.5 transition-all duration-200 text-white ${
                resetConfirm 
                  ? "bg-rose-500 animate-pulse shadow-rose-500/35 ring-2 ring-rose-400" 
                  : "bg-rose-600 hover:bg-rose-500 shadow-rose-600/20"
              }`}
            >
              <Trash2 className="w-4 h-4 shrink-0" />
              {resetConfirm ? "确认重置？再次点击" : "重置全部分组"}
            </button>

            {/* 返回上一步 (撤销) */}
            <button
              onClick={handleUndo}
              disabled={!canUndo}
              className="bg-amber-600 hover:bg-amber-500 disabled:opacity-40 disabled:hover:bg-amber-600 disabled:shadow-none text-xs font-bold px-4 py-2.5 rounded-xl shadow-lg shadow-amber-600/20 text-white flex items-center gap-1.5 transition-all duration-200"
            >
              <Undo2 className="w-4 h-4 shrink-0" />
              返回上一步
            </button>

            {/* 智能自动分配 */}
            <button
              onClick={handleAutoGroup}
              className={`text-xs font-bold px-4 py-2.5 rounded-xl shadow-lg flex items-center gap-1.5 transition-all duration-200 text-white ${
                autoConfirm
                  ? "bg-indigo-500 animate-pulse shadow-indigo-500/35 ring-2 ring-indigo-400"
                  : "bg-indigo-600 hover:bg-indigo-500 shadow-indigo-500/20"
              }`}
            >
              <Sparkles className="w-3.5 h-3.5 animate-pulse shrink-0" />
              {autoConfirm ? "确认自动分配？再次点击" : "智能自动分配"}
            </button>

            {/* 拉取最新数据 */}
            <button
              onClick={() => fetchData()}
              disabled={isSyncing}
              className="bg-white/10 text-white px-4 py-2.5 rounded-xl border border-white/10 hover:bg-white/15 active:bg-white/20 transition-all font-bold text-xs shadow-md shrink-0"
            >
              拉取最新数据
            </button>
          </div>
        </div>
      </footer>
    </div>
  );
}
