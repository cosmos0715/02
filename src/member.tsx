import React, { StrictMode, useEffect, useState } from "react";
import { createRoot } from "react-dom/client";
import { 
  Plus, Edit, Trash2, ArrowLeft, Search, User, 
  Award, RefreshCw, AlertCircle, Save, Sparkles,
  Lock, Eye, EyeOff, ShieldCheck, LogOut, Upload
} from "lucide-react";
import { Member } from "./types.js";
import "./index.css";

const PRESET_AVATARS = [
  "⚡", "🔥", "🐢", "🍃", "👻", "🔮", "🐉", "🦊", "💤", "✊", 
  "🎈", "🐱", "🛡️", "🥄", "🥚", "🌊", "🥊", "🦈", "✂️", "💃",
  "🦖", "🦁", "🐯", "🦅", "🦉", "🦇", "🐝", "🐙", "🦀", "🐬"
];

const ROLES = ["Carry", "Mid", "Offlane", "Support", "Roamer"];

const renderAvatar = (avatar: string, sizeClass = "w-12 h-12 text-2xl") => {
  if (avatar && (avatar.startsWith("data:image/") || avatar.startsWith("http://") || avatar.startsWith("https://"))) {
    return (
      <img 
        src={avatar} 
        alt="Avatar" 
        className={`${sizeClass.split(" ")[0]} ${sizeClass.split(" ")[1]} object-cover rounded-xl border border-white/10`} 
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

function MemberManagement() {
  // Authentication state
  const [isLoggedIn, setIsLoggedIn] = useState(() => {
    return sessionStorage.getItem("admin_auth_token") === "admin-session-token";
  });
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [loginError, setLoginError] = useState<string | null>(null);
  const [isLoggingIn, setIsLoggingIn] = useState(false);

  // Main list state
  const [members, setMembers] = useState<Member[]>([]);
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Form states
  const [editingId, setEditingId] = useState<string | null>(null);
  const [formName, setFormName] = useState("");
  const [formAvatar, setFormAvatar] = useState("⚡");
  const [formRating, setFormRating] = useState("");
  const [formRoles, setFormRoles] = useState<string[]>([]);
  
  // Feedback messages
  const [toast, setToast] = useState<{ type: "success" | "error"; text: string } | null>(null);

  const fetchMembers = async () => {
    try {
      setLoading(true);
      const res = await fetch("/api/data");
      if (!res.ok) throw new Error("获取人员列表失败");
      const data = await res.json();
      setMembers(data.members || []);
      setError(null);
    } catch (err: any) {
      setError(err.message || "无法连接到服务器");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (isLoggedIn) {
      fetchMembers();
    }
  }, [isLoggedIn]);

  const showToast = (text: string, type: "success" | "error" = "success") => {
    setToast({ text, type });
    setTimeout(() => setToast(null), 3000);
  };

  const handleLoginSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!password.trim()) {
      setLoginError("请输入管理员密码");
      return;
    }

    try {
      setIsLoggingIn(true);
      setLoginError(null);
      const res = await fetch("/api/admin/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ password })
      });

      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || "密码错误，登录失败");
      }

      const data = await res.json();
      sessionStorage.setItem("admin_auth_token", data.token);
      setIsLoggedIn(true);
      showToast("身份验证成功！欢迎进入管理系统", "success");
    } catch (err: any) {
      setLoginError(err.message || "系统验证失败");
    } finally {
      setIsLoggingIn(false);
    }
  };

  const handleLogout = () => {
    sessionStorage.removeItem("admin_auth_token");
    setIsLoggedIn(false);
    setPassword("");
  };

  const handleImageUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      if (file.size > 2 * 1024 * 1024) {
        showToast("图片大小不能超过 2MB", "error");
        return;
      }
      const reader = new FileReader();
      reader.onloadend = () => {
        setFormAvatar(reader.result as string);
      };
      reader.readAsDataURL(file);
    }
  };

  const handleResetForm = () => {
    setEditingId(null);
    setFormName("");
    setFormAvatar(PRESET_AVATARS[0]);
    setFormRating("");
    setFormRoles([]);
  };

  const handleEdit = (member: Member) => {
    setEditingId(member.id);
    setFormName(member.name);
    setFormAvatar(member.avatar);
    setFormRating(member.rating !== undefined && member.rating !== null ? String(member.rating) : "");
    
    const parsedRoles = member.role 
      ? member.role.split(",").map(r => r.trim()).filter(Boolean)
      : [];
    setFormRoles(parsedRoles);

    // Scroll to form on mobile/small screens
    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!formName.trim()) {
      showToast("请填写姓名或昵称", "error");
      return;
    }

    const parsedRating = formRating === "" ? null : parseInt(formRating);
    if (parsedRating !== null && isNaN(parsedRating)) {
      showToast("战斗力评级 (MMR) 必须是数字", "error");
      return;
    }

    const payload = {
      id: editingId || undefined,
      name: formName.trim(),
      avatar: formAvatar,
      rating: parsedRating,
      role: formRoles.join(",") // Store multi-roles as comma-separated string
    };

    try {
      const endpoint = editingId ? "/api/members/update" : "/api/members/add";
      const res = await fetch(endpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload)
      });

      if (!res.ok) throw new Error("提交人员信息失败");
      
      const data = await res.json();
      setMembers(data.members || []);
      showToast(editingId ? "修改人员卡片成功！" : "新增人员卡片成功！(已自动同步至签到区)");
      handleResetForm();
    } catch (err: any) {
      showToast(err.message, "error");
    }
  };

  const handleDelete = async (id: string) => {
    if (!window.confirm("确定要删除该人员卡片吗？此操作不可逆，将从全部分组中移出。")) {
      return;
    }

    try {
      const res = await fetch("/api/members/delete", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id })
      });

      if (!res.ok) throw new Error("删除人员卡片失败");
      
      const data = await res.json();
      setMembers(data.members || []);
      showToast("人员卡片已成功删除，并同步更新分组");
      if (editingId === id) {
        handleResetForm();
      }
    } catch (err: any) {
      showToast(err.message, "error");
    }
  };

  const filteredMembers = members.filter(m => {
    const term = search.toLowerCase();
    return (
      m.name.toLowerCase().includes(term) ||
      (m.role || "").toLowerCase().includes(term)
    );
  });

  // Login View render
  if (!isLoggedIn) {
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
              <h2 className="text-2xl font-extrabold tracking-tight text-white">管理后台登录</h2>
              <p className="text-xs text-slate-400 mt-2">请输入管理员密码以进行人员档案管理</p>
            </div>

            <form onSubmit={handleLoginSubmit} className="space-y-5">
              <div>
                <label className="block text-xs font-semibold text-slate-400 uppercase tracking-wider mb-2">
                  安全密码
                </label>
                <div className="relative">
                  <span className="absolute left-3.5 top-3.5 text-slate-500">
                    <Lock className="w-4 h-4" />
                  </span>
                  <input
                    type={showPassword ? "text" : "password"}
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder="请输入管理员密码 (默认 admin)"
                    className="w-full bg-black/40 border border-white/10 focus:border-indigo-500/50 rounded-xl py-3 pl-10 pr-12 text-white text-sm outline-none transition-all focus:ring-1 focus:ring-indigo-500/30"
                    required
                    autoFocus
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword(!showPassword)}
                    className="absolute right-3 top-3 p-1 text-slate-500 hover:text-white transition-colors"
                  >
                    {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  </button>
                </div>
              </div>

              {loginError && (
                <div className="bg-rose-500/10 border border-rose-500/20 text-rose-400 text-xs py-3 px-4 rounded-xl flex items-center gap-2">
                  <AlertCircle className="w-4 h-4 shrink-0" />
                  <span>{loginError}</span>
                </div>
              )}

              <button
                type="submit"
                disabled={isLoggingIn}
                className="w-full flex items-center justify-center gap-2 bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 text-white font-bold py-3 px-4 rounded-xl shadow-lg shadow-indigo-600/20 transition-all text-sm"
              >
                {isLoggingIn ? (
                  <RefreshCw className="w-4 h-4 animate-spin" />
                ) : (
                  <>
                    <ShieldCheck className="w-4.5 h-4.5" />
                    <span>验证并登录</span>
                  </>
                )}
              </button>
            </form>

            <div className="mt-6 text-center border-t border-white/5 pt-5">
              <a 
                href="/" 
                className="inline-flex items-center gap-1.5 text-xs text-slate-400 hover:text-white transition-colors"
              >
                <ArrowLeft className="w-3.5 h-3.5" />
                返回分组主面板
              </a>
            </div>
          </div>
        </div>
      </div>
    );
  }

  // Logged-in admin panel view
  return (
    <div className="min-h-screen bg-[#0c0e14] text-slate-200 font-sans relative overflow-x-hidden select-none">
      {/* Background glowing decorations */}
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_20%_30%,#1e293b_0%,transparent_50%),radial-gradient(circle_at_80%_70%,#312e81_0%,transparent_50%)] opacity-50 pointer-events-none z-0"></div>

      <div className="max-w-7xl mx-auto px-4 py-8 relative z-10">
        {/* Toast Notification */}
        {toast && (
          <div className={`fixed top-6 right-6 z-50 flex items-center gap-2 px-5 py-3 rounded-xl shadow-2xl transition-all border ${
            toast.type === "success" 
              ? "bg-slate-900/95 text-emerald-400 border-emerald-500/20" 
              : "bg-slate-900/95 text-rose-400 border-rose-500/20"
          }`}>
            {toast.type === "success" ? <Sparkles className="w-5 h-5" /> : <AlertCircle className="w-5 h-5" />}
            <span className="font-medium text-sm">{toast.text}</span>
          </div>
        )}

        {/* Header */}
        <header className="flex flex-col md:flex-row md:items-center md:justify-between gap-4 mb-8">
          <div>
            <div className="flex flex-wrap items-center gap-2 mb-2">
              <a 
                href="/" 
                className="inline-flex items-center gap-2 text-xs text-indigo-300 hover:text-white transition-colors bg-indigo-600/15 hover:bg-indigo-600/25 px-3 py-1.5 rounded-lg border border-indigo-500/20 shadow-sm"
              >
                <ArrowLeft className="w-3.5 h-3.5" />
                返回分组主面板
              </a>
              <button
                onClick={handleLogout}
                className="inline-flex items-center gap-2 text-xs text-slate-400 hover:text-white transition-colors bg-white/5 hover:bg-white/10 px-3 py-1.5 rounded-lg border border-white/10 shadow-sm"
              >
                <LogOut className="w-3.5 h-3.5 text-rose-400" />
                退出登录
              </button>
            </div>
            <h1 className="text-3xl font-extrabold tracking-tight bg-gradient-to-r from-indigo-300 to-cyan-300 bg-clip-text text-transparent flex items-center gap-3">
              <span>人员档案管理</span>
              <span className="text-xs bg-indigo-500/20 text-indigo-300 px-2.5 py-1 rounded-full border border-indigo-500/35 font-normal">
                管理员专区
              </span>
            </h1>
            <p className="text-slate-400 text-sm mt-1">
              在此处管理选手卡片。所有修改将实时同步更新到分组主面板的<b>静默/签到区</b>。
            </p>
          </div>

          <button 
            onClick={fetchMembers}
            disabled={loading}
            className="flex items-center justify-center gap-2 px-4 py-2 bg-white/5 hover:bg-white/10 disabled:opacity-50 text-white font-medium rounded-xl border border-white/10 transition-colors shadow-lg"
          >
            <RefreshCw className={`w-4 h-4 ${loading ? "animate-spin" : ""}`} />
            刷新数据
          </button>
        </header>

        <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">
          {/* Left Side: Form for Add/Edit */}
          <div className="lg:col-span-4">
            <div className="frosted-glass-panel p-6 rounded-2xl sticky top-8 shadow-xl">
              <div className="flex items-center justify-between mb-6">
                <h2 className="text-lg font-bold text-white flex items-center gap-2">
                  {editingId ? <Edit className="w-5 h-5 text-indigo-300" /> : <Plus className="w-5 h-5 text-indigo-300" />}
                  {editingId ? "修改人员卡片" : "添加新人员卡片"}
                </h2>
                {editingId && (
                  <button 
                    onClick={handleResetForm}
                    className="text-xs text-slate-400 hover:text-white underline transition-colors"
                  >
                    取消编辑
                  </button>
                )}
              </div>

              <form onSubmit={handleSubmit} className="space-y-4">
                {/* Name */}
                <div>
                  <label className="block text-xs font-semibold text-slate-400 uppercase tracking-wider mb-1.5">
                    人员姓名 / 游戏昵称
                  </label>
                  <div className="relative">
                    <User className="absolute left-3 top-3 w-4 h-4 text-slate-500" />
                    <input
                      type="text"
                      value={formName}
                      onChange={(e) => setFormName(e.target.value)}
                      placeholder="例如：皮卡丘 (Sccc)"
                      className="w-full bg-black/30 border border-white/10 focus:border-indigo-500/40 rounded-xl py-2 pl-10 pr-4 text-white text-sm outline-none transition-all focus:ring-1 focus:ring-indigo-500/30"
                      required
                    />
                  </div>
                </div>

                {/* Rating & Roles */}
                <div className="space-y-4">
                  <div>
                    <label className="block text-xs font-semibold text-slate-400 uppercase tracking-wider mb-1.5">
                      战斗力评级 (MMR)
                    </label>
                    <div className="relative">
                      <Award className="absolute left-3 top-3 w-4 h-4 text-slate-500" />
                      <input
                        type="number"
                        value={formRating}
                        onChange={(e) => setFormRating(e.target.value)}
                        placeholder="9000"
                        className="w-full bg-black/30 border border-white/10 focus:border-indigo-500/40 rounded-xl py-2 pl-10 pr-4 text-white text-sm outline-none transition-all focus:ring-1 focus:ring-indigo-500/30"
                      />
                    </div>
                  </div>

                  <div>
                    <label className="block text-xs font-semibold text-slate-400 uppercase tracking-wider mb-1.5">
                      擅长位置 (多选)
                    </label>
                    <div className="flex flex-wrap gap-1.5 bg-black/30 p-3 rounded-xl border border-white/5">
                      {ROLES.map((r) => {
                        const isSelected = formRoles.includes(r);
                        return (
                          <button
                            key={r}
                            type="button"
                            onClick={() => {
                              if (isSelected) {
                                setFormRoles(formRoles.filter(x => x !== r));
                              } else {
                                setFormRoles([...formRoles, r]);
                              }
                            }}
                            className={`px-2.5 py-1 rounded-lg text-xs font-semibold border transition-all ${
                              isSelected
                                ? "bg-indigo-600/30 border-indigo-400/50 text-indigo-300 shadow"
                                : "bg-white/5 border-white/5 text-slate-400 hover:text-white hover:bg-white/10"
                            }`}
                          >
                            {r}
                          </button>
                        );
                      })}
                    </div>
                  </div>
                </div>

                {/* Custom Image Upload */}
                <div>
                  <label className="block text-xs font-semibold text-slate-400 uppercase tracking-wider mb-1.5">
                    上传自定义头像
                  </label>
                  <div className="flex items-center gap-3 bg-black/30 p-3 rounded-xl border border-white/5">
                    <div className="w-12 h-12 bg-black/40 rounded-xl flex items-center justify-center text-2xl border border-white/15 shadow-inner overflow-hidden shrink-0">
                      {renderAvatar(formAvatar, "w-12 h-12")}
                    </div>
                    <div className="flex-1 overflow-hidden">
                      <label className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-indigo-600/20 hover:bg-indigo-600/30 text-indigo-300 font-bold text-xs rounded-lg border border-indigo-500/20 cursor-pointer transition-colors shadow">
                        <Upload className="w-3.5 h-3.5" />
                        <span>上传图片</span>
                        <input
                          type="file"
                          accept="image/*"
                          onChange={handleImageUpload}
                          className="hidden"
                        />
                      </label>
                      <p className="text-[9px] text-slate-500 mt-1 truncate">限 2MB 以下</p>
                    </div>
                  </div>
                </div>

                {/* Preset Avatars */}
                <div>
                  <label className="block text-xs font-semibold text-slate-400 uppercase tracking-wider mb-1.5">
                    或 选择预设 Emoji
                  </label>
                  <div className="grid grid-cols-6 gap-1.5 bg-black/30 p-2.5 rounded-xl border border-white/5 max-h-24 overflow-y-auto scrollbar">
                    {PRESET_AVATARS.map((av) => (
                      <button
                        key={av}
                        type="button"
                        onClick={() => setFormAvatar(av)}
                        className={`text-lg p-1 rounded-lg transition-all ${
                          formAvatar === av 
                            ? "bg-indigo-600/50 ring-1 ring-indigo-400 scale-105 text-white" 
                            : "bg-white/5 hover:bg-white/10 border border-white/5"
                        }`}
                      >
                        {av}
                      </button>
                    ))}
                  </div>
                </div>

                <div className="pt-2">
                  <button
                    type="submit"
                    className="w-full flex items-center justify-center gap-2 py-2.5 bg-indigo-600 hover:bg-indigo-500 rounded-xl text-white font-semibold transition-all shadow-lg shadow-indigo-600/10"
                  >
                    <Save className="w-4 h-4" />
                    {editingId ? "保存修改" : "确认添加人员"}
                  </button>
                </div>
              </form>
            </div>
          </div>

          {/* Right Side: List of current members */}
          <div className="lg:col-span-8 flex flex-col gap-6">
            {/* Search Bar */}
            <div className="frosted-glass-panel p-4 rounded-2xl flex flex-col sm:flex-row gap-4 items-center justify-between shadow-xl">
              <div className="relative w-full sm:max-w-md">
                <Search className="absolute left-3.5 top-3.5 w-4 h-4 text-slate-400" />
                <input
                  type="text"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  placeholder="搜索昵称、擅长位置..."
                  className="w-full bg-black/30 border border-white/10 focus:border-indigo-500/40 rounded-xl py-3 pl-11 pr-4 text-white text-sm outline-none transition-all focus:ring-1 focus:ring-indigo-500/30"
                />
              </div>
              <div className="text-slate-400 text-xs text-right whitespace-nowrap">
                共记录 <b>{members.length}</b> 名人员，筛选出 <b>{filteredMembers.length}</b> 名
              </div>
            </div>

            {/* Members Grid */}
            {loading ? (
              <div className="frosted-glass-panel p-12 rounded-2xl flex flex-col items-center justify-center gap-3 shadow-xl">
                <RefreshCw className="w-8 h-8 text-indigo-400 animate-spin" />
                <span className="text-slate-400 text-sm">正在加载人员数据...</span>
              </div>
            ) : filteredMembers.length === 0 ? (
              <div className="frosted-glass-panel p-12 rounded-2xl flex flex-col items-center justify-center text-center gap-4 shadow-xl">
                <div className="w-12 h-12 bg-white/5 rounded-full flex items-center justify-center border border-white/10">
                  <Search className="w-6 h-6 text-slate-500" />
                </div>
                <div>
                  <h3 className="text-white font-semibold text-lg">未找到匹配的人员卡片</h3>
                  <p className="text-slate-400 text-sm mt-1">请尝试修改搜索词或添加新成员。</p>
                </div>
              </div>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {filteredMembers.map((member) => (
                  <div 
                    key={member.id}
                    className="frosted-glass-panel p-4 rounded-xl flex items-center justify-between hover:border-indigo-500/30 transition-all group shadow-md"
                  >
                    <div className="flex items-center gap-3.5">
                      <div className="w-12 h-12 bg-black/40 rounded-xl flex items-center justify-center text-2xl border border-white/5 shadow-inner overflow-hidden shrink-0">
                        {renderAvatar(member.avatar, "w-12 h-12")}
                      </div>
                      <div>
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="text-white font-bold">{member.name}</span>
                          <div className="flex gap-1">
                            {member.role ? member.role.split(",").map((r, i) => (
                              <span key={i} className="text-[10px] bg-indigo-500/20 text-indigo-300 px-1.5 py-0.5 rounded border border-indigo-500/30 font-mono">
                                {r}
                              </span>
                            )) : (
                              <span className="text-[10px] bg-slate-500/20 text-slate-400 px-1.5 py-0.5 rounded border border-white/5 font-mono">
                                无
                              </span>
                            )}
                          </div>
                        </div>
                        <div className="flex items-center gap-3 mt-1.5 text-slate-400 text-xs font-mono">
                          <span>MMR: <b className="text-indigo-300 font-normal">{member.rating !== undefined && member.rating !== null ? member.rating : "无"}</b></span>
                        </div>
                      </div>
                    </div>

                    <div className="flex items-center gap-1 opacity-80 md:opacity-0 group-hover:opacity-100 transition-opacity">
                      <button
                        onClick={() => handleEdit(member)}
                        className="p-2 text-slate-400 hover:text-amber-400 bg-white/5 hover:bg-white/10 rounded-lg border border-transparent hover:border-amber-500/20 transition-all"
                        title="编辑人员"
                      >
                        <Edit className="w-4 h-4" />
                      </button>
                      <button
                        onClick={() => handleDelete(member.id)}
                        className="p-2 text-slate-400 hover:text-rose-400 bg-white/5 hover:bg-white/10 rounded-lg border border-transparent hover:border-rose-500/20 transition-all"
                        title="删除人员"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

const container = document.getElementById("root");
if (container) {
  const root = createRoot(container);
  root.render(
    <StrictMode>
      <MemberManagement />
    </StrictMode>
  );
}
