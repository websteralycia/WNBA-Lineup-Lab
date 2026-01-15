import React, { useState, useMemo, useEffect } from 'react';
import { 
  Search, 
  Plus, 
  X, 
  Trophy, 
  Users, 
  Activity, 
  ShieldCheck, 
  BarChart3, 
  Trash2,
  FileSpreadsheet,
  Zap,
  TrendingUp,
  Layout,
  ChevronLeft,
  ChevronRight,
  Filter,
  Info,
  Share2,
  Copy,
  Check
} from 'lucide-react';
import { initializeApp } from 'firebase/app';
import { 
  getFirestore, 
  doc, 
  setDoc, 
  getDoc, 
  collection, 
  onSnapshot 
} from 'firebase/firestore';
import { 
  getAuth, 
  signInAnonymously, 
  signInWithCustomToken, 
  onAuthStateChanged 
} from 'firebase/auth';

/**
 * WNBA ROSTER ARCHITECT
 * Professional Roster Construction Tool
 * Features: Pagination (12/page), Contract Types, Salary Analytics, Cloud Sharing
 */

// Firebase Configuration
const firebaseConfig = JSON.parse(__firebase_config);
const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);
const appId = typeof __app_id !== 'undefined' ? __app_id : 'wnba-roster-architect';

const SALARY_CAP = 1463000;
const POSITIONS = ['G', 'F', 'C', 'G-F', 'F-G', 'F-C', 'C-F'];
const ITEMS_PER_PAGE = 12;

const App = () => {
  const [players, setPlayers] = useState([]);
  const [lineup, setLineup] = useState([]);
  const [searchTerm, setSearchTerm] = useState('');
  const [posFilter, setPosFilter] = useState('All');
  const [teamFilter, setTeamFilter] = useState('All');
  const [showImport, setShowImport] = useState(false);
  const [csvText, setCsvText] = useState('');
  const [currentPage, setCurrentPage] = useState(1);
  const [user, setUser] = useState(null);
  const [isSaving, setIsSaving] = useState(false);
  const [shareUrl, setShareUrl] = useState('');
  const [copySuccess, setCopySuccess] = useState(false);

  // --- Firebase Auth & Deep Linking ---
  useEffect(() => {
    const initAuth = async () => {
      if (typeof __initial_auth_token !== 'undefined' && __initial_auth_token) {
        await signInWithCustomToken(auth, __initial_auth_token);
      } else {
        await signInAnonymously(auth);
      }
    };
    initAuth();
    const unsubscribe = onAuthStateChanged(auth, setUser);
    return () => unsubscribe();
  }, []);

  useEffect(() => {
    // Check for shared roster in URL
    const params = new URLSearchParams(window.location.search);
    const sharedId = params.get('roster');
    
    if (sharedId && user) {
      const loadSharedRoster = async () => {
        const docRef = doc(db, 'artifacts', appId, 'public', 'data', 'rosters', sharedId);
        const docSnap = await getDoc(docRef);
        if (docSnap.exists()) {
          setLineup(docSnap.data().lineup || []);
        }
      };
      loadSharedRoster();
    }
  }, [user]);

  // --- Save & Share Functionality ---
  const handleSaveAndShare = async () => {
    if (!user || lineup.length === 0) return;
    setIsSaving(true);
    
    try {
      const rosterId = crypto.randomUUID();
      const rosterData = {
        lineup,
        createdAt: new Date().toISOString(),
        createdBy: user.uid,
        totalSalary: lineup.reduce((sum, p) => sum + (p.salary_2025_num || 0), 0)
      };

      await setDoc(doc(db, 'artifacts', appId, 'public', 'data', 'rosters', rosterId), rosterData);
      
      const url = `${window.location.origin}${window.location.pathname}?roster=${rosterId}`;
      setShareUrl(url);
    } catch (err) {
      console.error("Save error:", err);
    } finally {
      setIsSaving(false);
    }
  };

  const copyToClipboard = () => {
    const textArea = document.createElement("textarea");
    textArea.value = shareUrl;
    document.body.appendChild(textArea);
    textArea.select();
    try {
      document.execCommand('copy');
      setCopySuccess(true);
      setTimeout(() => setCopySuccess(false), 2000);
    } catch (err) {
      console.error('Copy failed', err);
    }
    document.body.removeChild(textArea);
  };

  // CSV Engine
  const handleImport = () => {
    try {
      const rows = csvText.split('\n').filter(r => r.trim() !== '');
      if (rows.length < 2) return;
      const headers = rows[0].split(',').map(h => h.trim().replace(/"/g, '').toLowerCase());
      
      const parsedData = rows.slice(1).map(row => {
        const values = row.split(',').map(v => v.trim().replace(/"/g, ''));
        const entry = {};
        headers.forEach((header, i) => {
          const val = values[i];
          const key = header === 'athlete name' ? 'player' : header;
          entry[key] = isNaN(val) || val === "" ? val : parseFloat(val);
        });
        return entry;
      }).filter(p => p.player);

      setPlayers(parsedData);
      setShowImport(false);
      setCsvText('');
      setCurrentPage(1);
    } catch (err) {
      console.error(err);
    }
  };

  const teams = useMemo(() => {
    const uniqueTeams = [...new Set(players.map(p => p.team).filter(Boolean))];
    return uniqueTeams.sort();
  }, [players]);

  const lineupStats = useMemo(() => {
    if (lineup.length === 0) return null;
    const count = lineup.length;
    return {
      totalSalary: lineup.reduce((sum, p) => sum + (p.salary_2025_num || 0), 0),
      avgTs: lineup.reduce((sum, p) => sum + (p.ts_pctile_pos || 0), 0) / count,
      avgUsage: lineup.reduce((sum, p) => sum + (p.usage_pctile_pos || 0), 0) / count,
      avgDef: lineup.reduce((sum, p) => sum + (p.def_efg_pctile_pos || 0), 0) / count,
      avgAst: lineup.reduce((sum, p) => sum + (p.ast_pctile_pos || 0), 0) / count,
    };
  }, [lineup]);

  // Filtering Logic
  const filteredPlayers = useMemo(() => {
    return players.filter(p => {
      const matchesSearch = p.player?.toLowerCase().includes(searchTerm.toLowerCase()) ||
                            p.team?.toLowerCase().includes(searchTerm.toLowerCase());
      const matchesPos = posFilter === 'All' || p.position?.includes(posFilter);
      const matchesTeam = teamFilter === 'All' || p.team === teamFilter;
      const inLineup = lineup.find(lp => lp.athlete_id === p.athlete_id);
      return matchesSearch && matchesPos && matchesTeam && !inLineup;
    });
  }, [players, searchTerm, posFilter, teamFilter, lineup]);

  // Pagination Logic
  const totalPages = Math.max(1, Math.ceil(filteredPlayers.length / ITEMS_PER_PAGE));
  const paginatedPlayers = useMemo(() => {
    const start = (currentPage - 1) * ITEMS_PER_PAGE;
    return filteredPlayers.slice(start, start + ITEMS_PER_PAGE);
  }, [filteredPlayers, currentPage]);

  const handlePageChange = (newPage) => {
    if (newPage >= 1 && newPage <= totalPages) {
      setCurrentPage(newPage);
    }
  };

  return (
    <div className="min-h-screen bg-[#F8F9FA] text-slate-900 font-sans">
      <nav className="bg-slate-950 sticky top-0 z-40 px-8 h-20 flex items-center justify-between shadow-2xl">
        <div className="flex items-center gap-4">
          <div className="w-10 h-10 bg-orange-500 rounded-lg flex items-center justify-center shadow-lg shadow-orange-500/20">
            <Trophy className="text-white" size={20} />
          </div>
          <div>
            <h1 className="text-lg font-black tracking-tight uppercase leading-none text-white">Roster Architect</h1>
            <p className="text-[10px] text-slate-500 font-bold tracking-widest uppercase mt-1">Contract & Performance Modeling</p>
          </div>
        </div>
        
        <div className="flex items-center gap-4">
          <button 
            onClick={() => setShowImport(true)}
            className="flex items-center gap-2 px-5 py-2.5 bg-white text-slate-950 rounded-lg text-[11px] font-black tracking-widest hover:bg-slate-100 transition-all"
          >
            <FileSpreadsheet size={14} /> IMPORT DATA
          </button>
          <button 
            onClick={() => { if (window.confirm('Clear current roster?')) setLineup([]); }}
            className="p-2.5 text-slate-400 hover:text-white transition-colors bg-white/5 rounded-lg border border-white/10"
          >
            <Trash2 size={18} />
          </button>
        </div>
      </nav>

      <main className="max-w-[1550px] mx-auto p-8 grid grid-cols-12 gap-8">
        <div className="col-span-12 lg:col-span-7 space-y-6">
          <div className="bg-white rounded-3xl p-8 shadow-[0_4px_20px_rgba(0,0,0,0.03)] border border-slate-100">
            
            {/* Filters */}
            <div className="flex flex-col gap-4 mb-8">
              <div className="relative flex-1">
                <Search className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400" size={18} />
                <input 
                  type="text"
                  placeholder="Search athletes by name or team..."
                  className="w-full bg-slate-50 border border-slate-100 rounded-xl pl-12 pr-4 py-4 text-sm focus:outline-none focus:ring-2 focus:ring-slate-950/5 focus:bg-white transition-all font-medium"
                  value={searchTerm}
                  onChange={(e) => {setSearchTerm(e.target.value); setCurrentPage(1);}}
                />
              </div>
              <div className="flex flex-wrap items-center gap-3">
                <div className="flex items-center gap-2 bg-slate-50 px-4 rounded-xl border border-slate-100">
                  <Filter size={14} className="text-slate-400" />
                  <select 
                    className="py-3 bg-transparent text-[10px] font-black uppercase tracking-wider outline-none text-slate-600 cursor-pointer"
                    value={posFilter}
                    onChange={(e) => {setPosFilter(e.target.value); setCurrentPage(1);}}
                  >
                    <option value="All">All Positions</option>
                    {POSITIONS.map(pos => <option key={pos} value={pos}>{pos}</option>)}
                  </select>
                </div>

                <div className="flex items-center gap-2 bg-slate-50 px-4 rounded-xl border border-slate-100">
                  <Users size={14} className="text-slate-400" />
                  <select 
                    className="py-3 bg-transparent text-[10px] font-black uppercase tracking-wider outline-none text-slate-600 cursor-pointer"
                    value={teamFilter}
                    onChange={(e) => {setTeamFilter(e.target.value); setCurrentPage(1);}}
                  >
                    <option value="All">All Teams</option>
                    {teams.map(team => <option key={team} value={team}>{team}</option>)}
                  </select>
                </div>

                <div className="flex items-center gap-3 ml-auto">
                   <div className="flex items-center gap-4 bg-slate-50 px-3 py-2 rounded-lg border border-slate-100 text-[9px] font-bold text-slate-400 uppercase tracking-tighter">
                      <span className="flex items-center gap-1"><div className="w-2 h-2 rounded-full bg-blue-500"></div> UFA</span>
                      <span className="flex items-center gap-1"><div className="w-2 h-2 rounded-full bg-purple-500"></div> Core</span>
                      <span className="flex items-center gap-1"><div className="w-2 h-2 rounded-full bg-orange-500"></div> RFA</span>
                   </div>
                </div>
              </div>
            </div>

            {/* Athlete Table */}
            <div className="overflow-x-auto min-h-[600px]">
              <table className="w-full">
                <thead>
                  <tr className="text-[10px] font-black text-slate-400 uppercase tracking-[0.15em] border-b border-slate-50">
                    <th className="pb-4 text-left">Athlete Name</th>
                    <th className="pb-4 text-center">Contract</th>
                    <th className="pb-4 text-left">Pos</th>
                    <th className="pb-4 text-left">Salary</th>
                    <th className="pb-4 text-center">TS% Pctl</th>
                    <th className="pb-4 text-center">Def Pctl</th>
                    <th className="pb-4"></th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-50">
                  {paginatedPlayers.length > 0 ? (
                    paginatedPlayers.map(p => (
                      <tr key={p.athlete_id} className="group hover:bg-slate-50 transition-all">
                        <td className="py-4">
                          <div className="font-bold text-sm text-slate-900">{p.player}</div>
                          <div className="text-[10px] font-bold text-slate-400 uppercase tracking-tight">{p.team}</div>
                        </td>
                        <td className="py-4 text-center">
                          <ContractTag type={p.contract_type} />
                        </td>
                        <td className="py-4">
                          <span className="text-[10px] font-black px-2 py-1 bg-slate-100 text-slate-600 rounded">
                            {p.position}
                          </span>
                        </td>
                        <td className="py-4 font-mono text-xs font-bold text-slate-500">
                          ${p.salary_2025_num?.toLocaleString() || '---'}
                        </td>
                        <td className="py-4 text-center">
                          <PercentBadge value={p.ts_pctile_pos} />
                        </td>
                        <td className="py-4 text-center">
                          <PercentBadge value={p.def_efg_pctile_pos} />
                        </td>
                        <td className="py-4 text-right">
                          <button 
                            onClick={() => setLineup([...lineup, p])}
                            disabled={lineup.length >= 12}
                            className="p-2.5 bg-slate-950 text-white rounded-lg opacity-0 group-hover:opacity-100 transition-all disabled:opacity-0 hover:bg-orange-600 shadow-xl"
                          >
                            <Plus size={16} />
                          </button>
                        </td>
                      </tr>
                    ))
                  ) : (
                    <tr>
                      <td colSpan="7" className="py-24 text-center">
                        <div className="bg-slate-50 w-16 h-16 rounded-2xl flex items-center justify-center mx-auto mb-4 border border-slate-100">
                          <Layout className="text-slate-200" size={24} />
                        </div>
                        <p className="text-[10px] font-black text-slate-300 uppercase tracking-[0.2em]">No Athletes Found</p>
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>

            {/* Pagination Controls */}
            <div className="mt-8 pt-6 border-t border-slate-50 flex items-center justify-between">
              <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">
                Showing {Math.min(filteredPlayers.length, (currentPage - 1) * ITEMS_PER_PAGE + 1)}-{Math.min(filteredPlayers.length, currentPage * ITEMS_PER_PAGE)} of {filteredPlayers.length}
              </p>
              <div className="flex items-center gap-2">
                <button 
                  onClick={() => handlePageChange(currentPage - 1)}
                  disabled={currentPage === 1}
                  className="p-2 rounded-lg border border-slate-100 text-slate-400 hover:bg-slate-50 disabled:opacity-30 disabled:hover:bg-transparent transition-all"
                >
                  <ChevronLeft size={18} />
                </button>
                <div className="flex items-center gap-1">
                  {[...Array(totalPages)].map((_, i) => {
                    const pageNum = i + 1;
                    if (totalPages > 5 && Math.abs(pageNum - currentPage) > 1 && pageNum !== 1 && pageNum !== totalPages) {
                      if (pageNum === 2 || pageNum === totalPages - 1) return <span key={pageNum} className="text-slate-300">...</span>;
                      return null;
                    }
                    return (
                      <button
                        key={pageNum}
                        onClick={() => handlePageChange(pageNum)}
                        className={`w-8 h-8 rounded-lg text-[10px] font-black transition-all ${currentPage === pageNum ? 'bg-slate-950 text-white' : 'text-slate-400 hover:bg-slate-50'}`}
                      >
                        {pageNum}
                      </button>
                    );
                  })}
                </div>
                <button 
                  onClick={() => handlePageChange(currentPage + 1)}
                  disabled={currentPage === totalPages}
                  className="p-2 rounded-lg border border-slate-100 text-slate-400 hover:bg-slate-50 disabled:opacity-30 disabled:hover:bg-transparent transition-all"
                >
                  <ChevronRight size={18} />
                </button>
              </div>
            </div>
          </div>
        </div>

        <div className="col-span-12 lg:col-span-5 space-y-6">
          <div className="bg-white rounded-3xl p-8 shadow-sm border border-slate-100">
            <div className="flex justify-between items-center mb-8">
              <div className="flex items-center gap-2.5">
                <Users className="text-slate-400" size={18} />
                <h2 className="text-xs font-black uppercase tracking-[0.1em] text-slate-900">Roster Capacity</h2>
              </div>
              <div className="flex items-center gap-2">
                <button 
                  onClick={handleSaveAndShare}
                  disabled={lineup.length === 0 || isSaving}
                  className="flex items-center gap-2 px-3 py-1.5 bg-orange-500 text-white text-[10px] font-black uppercase tracking-widest rounded-lg hover:bg-orange-600 disabled:opacity-50 transition-all shadow-lg shadow-orange-500/10"
                >
                  {isSaving ? 'Saving...' : <><Share2 size={12} /> Save & Share</>}
                </button>
                <span className={`text-[10px] font-black px-3 py-1.5 rounded-lg border ${lineup.length === 12 ? 'bg-orange-50 text-orange-600 border-orange-100' : 'bg-slate-50 text-slate-400 border-slate-100'}`}>
                  {lineup.length}/12
                </span>
              </div>
            </div>

            {/* Share URL Modal/Section */}
            {shareUrl && (
              <div className="mb-6 p-4 bg-slate-950 rounded-2xl animate-in slide-in-from-top-4 duration-300">
                <div className="flex justify-between items-center mb-2">
                  <span className="text-[9px] font-black text-slate-500 uppercase tracking-widest">Shareable Link</span>
                  <button onClick={() => setShareUrl('')} className="text-slate-500 hover:text-white"><X size={12}/></button>
                </div>
                <div className="flex gap-2">
                  <input 
                    readOnly 
                    value={shareUrl} 
                    className="flex-1 bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-[10px] text-slate-300 font-mono outline-none"
                  />
                  <button 
                    onClick={copyToClipboard}
                    className="p-2 bg-white text-slate-950 rounded-lg hover:bg-slate-100 transition-all flex items-center justify-center"
                  >
                    {copySuccess ? <Check size={14} className="text-green-600" /> : <Copy size={14} />}
                  </button>
                </div>
              </div>
            )}

            <div className="grid grid-cols-1 gap-2 max-h-[500px] overflow-y-auto pr-2 custom-scrollbar">
              {lineup.map(p => (
                <div key={p.athlete_id} className="flex items-center justify-between p-3 bg-slate-50 rounded-xl border border-slate-100 group transition-all hover:border-slate-200">
                  <div className="flex items-center gap-3">
                    <div className="w-8 h-8 rounded bg-white border border-slate-200 flex items-center justify-center font-black text-slate-400 text-[9px] shadow-sm">
                      {p.position?.split('-')[0]}
                    </div>
                    <div>
                      <div className="font-bold text-[13px] text-slate-900 leading-tight">{p.player}</div>
                      <div className="flex gap-2">
                        <span className="text-[8px] font-bold text-slate-400 uppercase tracking-widest">{p.team}</span>
                        <span className="text-[8px] font-mono font-bold text-slate-400">${p.salary_2025_num?.toLocaleString()}</span>
                      </div>
                    </div>
                  </div>
                  <button 
                    onClick={() => setLineup(lineup.filter(lp => lp.athlete_id !== p.athlete_id))} 
                    className="p-1.5 text-slate-300 hover:text-red-500 transition-colors"
                  >
                    <X size={14} />
                  </button>
                </div>
              ))}
              {lineup.length < 12 && (
                <div className="h-12 border-2 border-dashed border-slate-100 rounded-xl flex items-center justify-center text-slate-300 font-bold text-[9px] uppercase tracking-widest">
                  Add {12 - lineup.length} more...
                </div>
              )}
            </div>

            {lineupStats && (
              <div className="mt-8 pt-6 border-t border-slate-50">
                <div className="flex justify-between items-end mb-3">
                  <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Aggregate Salary</span>
                  <div className="text-right">
                    <div className={`text-sm font-black ${lineupStats.totalSalary > SALARY_CAP ? 'text-red-500' : 'text-slate-950'}`}>
                      ${lineupStats.totalSalary.toLocaleString()}
                    </div>
                    <div className="text-[9px] font-bold text-slate-400 uppercase">Cap: ${SALARY_CAP.toLocaleString()}</div>
                  </div>
                </div>
                <div className="h-2 w-full bg-slate-100 rounded-full overflow-hidden">
                  <div 
                    className={`h-full transition-all duration-700 ${lineupStats.totalSalary > SALARY_CAP ? 'bg-red-500' : 'bg-slate-950'}`}
                    style={{ width: `${Math.min((lineupStats.totalSalary / SALARY_CAP) * 100, 100)}%` }}
                  />
                </div>
              </div>
            )}
          </div>

          <div className="bg-slate-950 rounded-3xl p-8 shadow-2xl text-white">
            <h2 className="text-xs font-black uppercase tracking-[0.15em] text-slate-500 mb-8 flex items-center gap-2">
              <Activity className="text-orange-500" size={14} /> Full Roster Analytics
            </h2>
            
            {!lineupStats ? (
              <div className="py-10 text-center text-slate-700">
                <BarChart3 className="mx-auto mb-3 opacity-20" size={28} />
                <p className="text-[10px] font-black uppercase tracking-widest">Add players for analytics</p>
              </div>
            ) : (
              <div className="space-y-6">
                <StatRow label="Team Efficiency (TS%)" value={lineupStats.avgTs} />
                <StatRow label="Usage Distribution" value={lineupStats.avgUsage} />
                <StatRow label="Roster Defense" value={lineupStats.avgDef} />
                <StatRow label="Playmaking Hub" value={lineupStats.avgAst} />

                <div className="grid grid-cols-2 gap-3 mt-8">
                  <div className="bg-white/5 p-4 rounded-xl border border-white/10">
                    <div className="text-[9px] text-slate-500 font-black uppercase mb-1 flex items-center gap-1.5">
                      <TrendingUp size={10} /> Composition
                    </div>
                    <div className="text-xs font-bold">{lineupStats.avgUsage > 0.70 ? 'High-Volume' : 'Efficiency-Based'}</div>
                  </div>
                  <div className="bg-white/5 p-4 rounded-xl border border-white/10">
                    <div className="text-[9px] text-slate-500 font-black uppercase mb-1 flex items-center gap-1.5">
                      <ShieldCheck size={10} /> Roster Meta
                    </div>
                    <div className="text-xs font-bold">{lineupStats.avgDef > 0.7 ? 'Defensive Juggernaut' : 'Neutral Profile'}</div>
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>
      </main>

      {showImport && (
        <div className="fixed inset-0 bg-slate-950/80 backdrop-blur-sm flex items-center justify-center p-6 z-50">
          <div className="bg-white rounded-[2rem] max-w-xl w-full p-10 shadow-2xl animate-in fade-in zoom-in-95 duration-200">
            <div className="flex justify-between items-center mb-8">
              <div>
                <h3 className="text-xl font-black text-slate-950 uppercase tracking-tight">Import Lab</h3>
                <p className="text-[10px] text-slate-400 font-bold tracking-widest uppercase">CSV / Plaintext Parser</p>
              </div>
              <button onClick={() => setShowImport(false)} className="p-2 hover:bg-slate-100 rounded-full transition-colors">
                <X size={20} />
              </button>
            </div>
            
            <textarea 
              className="w-full h-64 bg-slate-50 border border-slate-100 rounded-2xl p-6 font-mono text-[10px] text-slate-600 focus:outline-none focus:ring-2 focus:ring-slate-950/5 focus:bg-white resize-none transition-all mb-6"
              placeholder='Paste CSV data here. Required headers: "Athlete Name", "Contract Type", "Salary_2025_num", etc.'
              value={csvText}
              onChange={(e) => setCsvText(e.target.value)}
            />

            <div className="flex gap-3">
              <button onClick={handleImport} className="flex-1 bg-slate-950 text-white font-black py-4 rounded-xl hover:bg-slate-800 transition-all uppercase tracking-widest text-[10px]">
                Process Data
              </button>
              <button onClick={() => setShowImport(false)} className="px-8 bg-slate-100 text-slate-500 font-black py-4 rounded-xl hover:bg-slate-200 transition-all uppercase tracking-widest text-[10px]">
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}

      <style>{`
        .custom-scrollbar::-webkit-scrollbar { width: 4px; }
        .custom-scrollbar::-webkit-scrollbar-track { background: transparent; }
        .custom-scrollbar::-webkit-scrollbar-thumb { background: #e2e8f0; border-radius: 10px; }
        .custom-scrollbar::-webkit-scrollbar-thumb:hover { background: #cbd5e1; }
      `}</style>
    </div>
  );
};

const ContractTag = ({ type }) => {
  if (!type) return <span className="text-[9px] font-black text-slate-200">—</span>;
  const label = type.toString().charAt(0).toUpperCase();
  let styles = "bg-slate-100 text-slate-400";
  if (label === 'U') styles = "bg-blue-50 text-blue-600 border border-blue-100";
  if (label === 'C') styles = "bg-purple-50 text-purple-600 border border-purple-100";
  if (label === 'R') styles = "bg-orange-50 text-orange-600 border border-orange-100";
  if (label === 'E') styles = "bg-green-50 text-green-600 border border-green-100";
  return (
    <div className={`inline-flex items-center justify-center w-6 h-6 rounded-lg text-[10px] font-black ${styles}`} title={type}>
      {label}
    </div>
  );
};

const PercentBadge = ({ value }) => {
  const pct = Math.round(value * 100);
  let colorClass = "bg-slate-50 text-slate-400";
  if (pct >= 90) colorClass = "bg-slate-950 text-white";
  else if (pct >= 75) colorClass = "bg-slate-200 text-slate-700";
  else if (pct >= 50) colorClass = "bg-slate-100 text-slate-600";
  return (
    <div className={`inline-block px-2 py-1 rounded-md text-[9px] font-black min-w-[32px] ${colorClass}`}>
      {pct}
    </div>
  );
};

const StatRow = ({ label, value }) => {
  const displayVal = Math.round(value * 100);
  return (
    <div className="space-y-2">
      <div className="flex justify-between items-center text-[9px] font-black uppercase tracking-widest">
        <span className="text-slate-500">{label}</span>
        <span className="text-white">{displayVal}%</span>
      </div>
      <div className="h-1.5 w-full bg-white/5 rounded-full overflow-hidden">
        <div 
          className="h-full bg-white transition-all duration-1000 ease-out"
          style={{ width: `${displayVal}%` }}
        />
      </div>
    </div>
  );
};

export default App;