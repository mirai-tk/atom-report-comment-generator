import React, { useState, useEffect, useCallback, useRef } from 'react';
import {
  Loader2,
  FileText,
  Send,
  CheckCircle2,
  AlertCircle,
  Table as TableIcon,
  Copy,
  Settings,
  BarChart3,
  Search,
  RefreshCw,
  LayoutDashboard,
  FileSpreadsheet,
  Eye,
  EyeOff,
  ChevronRight,
  LogOut,
  User,
  Target,
  MessageSquare,
  ListTodo,
  X,
  Building,
  Users,
  Plus,
  Trash2,
  Save,
  GripVertical
} from 'lucide-react';
import { GoogleLogin, googleLogout } from '@react-oauth/google';
import { DragDropContext, Droppable, Draggable } from '@hello-pangea/dnd';
import { jwtDecode } from 'jwt-decode';
import { supabase } from './lib/supabase';

const appId = typeof __app_id !== 'undefined' ? __app_id : 'excel-ai-reporter';

export default function App() {
  const [file, setFile] = useState(null);
  const [workbook, setWorkbook] = useState(null);
  const [sheetData, setSheetData] = useState([]);
  const [extractedData, setExtractedData] = useState(null);
  const [extractionLog, setExtractionLog] = useState([]);
  const [generating, setGenerating] = useState(false);
  const [aiResponse, setAiResponse] = useState('');
  const [status, setStatus] = useState(null);
  const [activeSheet, setActiveSheet] = useState('');
  const [isLibLoaded, setIsLibLoaded] = useState(false);

  // Auth & API Configuration
  const [user, setUser] = useState(null);
  const [apiKey, setApiKey] = useState('');
  const [showKey, setShowKey] = useState(false);
  const [showSettings, setShowSettings] = useState(false);
  const [aiContext, setAiContext] = useState({
    goal: 'Google広告の目標3件の達成',
    issues: '',
    tasks: ''
  });
  const [showModal, setShowModal] = useState(false);
  const [modalTitle, setModalTitle] = useState('');
  const [modalMessage, setModalMessage] = useState('');
  const [showPresetsModal, setShowPresetsModal] = useState(false);
  const [selectedCustomerId, setSelectedCustomerId] = useState('');
  const [selectedPresetId, setSelectedPresetId] = useState('');
  const [customers, setCustomers] = useState([]);
  const [presets, setPresets] = useState([]);
  const [editingCustomer, setEditingCustomer] = useState(null);
  const [editingPreset, setEditingPreset] = useState(null);
  const [managementCustomer, setManagementCustomer] = useState(''); // Selected customer for management
  const [confirmModal, setConfirmModal] = useState({ show: false, title: '', message: '', onConfirm: null });
  const fileInputRef = useRef(null);

  // Load SheetJS dynamically
  useEffect(() => {
    if (window.XLSX) {
      setIsLibLoaded(true);
      return;
    }
    const script = document.createElement('script');
    script.src = "https://cdn.sheetjs.com/xlsx-0.20.1/package/dist/xlsx.full.min.js";
    script.async = true;
    script.onload = () => setIsLibLoaded(true);
    script.onerror = () => setStatus({ type: 'error', message: 'Library load failed.' });
    document.head.appendChild(script);

    // Initial load from session storage or env if exists
    const storedUser = localStorage.getItem(`user_${appId}`);
    if (storedUser) {
      const parsedUser = JSON.parse(storedUser);
      setUser(parsedUser);
      // If we have a user, try to get the API key again
      const storedKey = sessionStorage.getItem(`apiKey_${appId}`) || localStorage.getItem(`gemini_api_key_${appId}`) || import.meta.env.VITE_GEMINI_API_KEY;
      if (storedKey) setApiKey(storedKey);
    } else {
      // Even without login, let's use the env key if available for local dev
      const envKey = import.meta.env.VITE_GEMINI_API_KEY;
      if (envKey) setApiKey(envKey);
    }

    // Track Supabase Auth State
    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
      console.log('Supabase Auth Event:', event, session?.user?.email);
      if (event === 'SIGNED_IN' || event === 'INITIAL_SESSION') {
        fetchData();
      }
    });

    return () => {
      if (document.head.contains(script)) document.head.removeChild(script);
      subscription.unsubscribe();
    };
  }, []);

  const fetchData = useCallback(async () => {
    if (!import.meta.env.VITE_SUPABASE_URL || import.meta.env.VITE_SUPABASE_URL === 'your-project-url.supabase.co') return;
    try {
      const { data: cData, error: cError } = await supabase.from('customers').select('*').order('sort_order', { ascending: true });
      if (cError) throw cError;
      setCustomers(cData || []);

      const { data: pData, error: pError } = await supabase.from('presets').select('*').order('sort_order', { ascending: true });
      if (pError) throw pError;
      setPresets(pData || []);
    } catch (e) {
      console.error('Supabase fetch error:', e);
    }
  }, []);

  const handleOnDragEndCustomers = async (result) => {
    if (!result.destination) return;
    const items = Array.from(customers);
    const [reorderedItem] = items.splice(result.source.index, 1);
    items.splice(result.destination.index, 0, reorderedItem);

    // Update locally for immediate feedback
    setCustomers(items);

    try {
      const updates = items.map((item, index) => {
        const newOrder = index * 10;
        return supabase.from('customers').update({ sort_order: newOrder }).eq('id', item.id);
      });
      await Promise.all(updates);
    } catch (e) {
      console.error('Customer reorder failed:', e);
      setStatus({ type: 'error', message: '並び替えの保存に失敗しました' });
      fetchData(); // Revert
    }
  };

  const handleOnDragEndPresets = async (result) => {
    if (!result.destination) return;

    const filteredPresets = presets.filter(p => p.customer_id === managementCustomer);
    const otherPresets = presets.filter(p => p.customer_id !== managementCustomer);

    const items = Array.from(filteredPresets);
    const [reorderedItem] = items.splice(result.source.index, 1);
    items.splice(result.destination.index, 0, reorderedItem);

    // Update locally
    const reorderedFiltered = items.map((item, index) => ({ ...item, sort_order: index * 10 }));
    setPresets([...otherPresets, ...reorderedFiltered].sort((a, b) => (a.sort_order || 0) - (b.sort_order || 0)));

    try {
      const updates = reorderedFiltered.map(item =>
        supabase.from('presets').update({ sort_order: item.sort_order }).eq('id', item.id)
      );
      await Promise.all(updates);
    } catch (e) {
      console.error('Preset reorder failed:', e);
      setStatus({ type: 'error', message: '並び替えの保存に失敗しました' });
      fetchData(); // Revert
    }
  };

  const handleOnDragEnd = (result) => {
    if (!result.destination) return;
    if (result.source.droppableId === 'customers') {
      handleOnDragEndCustomers(result);
    } else if (result.source.droppableId === 'presets') {
      handleOnDragEndPresets(result);
    }
  };

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  const handleLoginSuccess = async (credentialResponse) => {
    try {
      const decoded = jwtDecode(credentialResponse.credential);

      // Strict domain check
      if (decoded.hd !== 'mi-rai.co.jp') {
        setStatus({ type: 'error', message: 'mi-rai.co.jpアカウントのみ利用可能です' });
        return;
      }

      setUser(decoded);
      localStorage.setItem(`user_${appId}`, JSON.stringify(decoded));
      setStatus({ type: 'success', message: 'ログインしました' });

      // Sign into Supabase with the same Google Token
      try {
        const { data, error } = await supabase.auth.signInWithIdToken({
          provider: 'google',
          token: credentialResponse.credential,
        });
        if (error) {
          if (error.message.includes('not enabled')) {
            throw new Error('Supabase側のGoogle認証プロバイダーが有効になっていないか、設定が不完全です（Client Secretが空など）。');
          }
          throw error;
        }
        console.log('Supabase Auth successful:', data.user?.email);
        fetchData(); // Fetch immediately after successful auth link
      } catch (e) {
        console.error('Supabase Auth link failed:', e);
        setStatus({ type: 'error', message: `データベース認証に失敗しました: ${e.message}` });
        return; // Stop here if DB auth fails
      }

      // Fetch API Key from Netlify function
      setStatus({ type: 'info', message: 'APIキーを取得中...' });
      const response = await fetch('/.netlify/functions/get-api-key', {
        method: 'POST',
        body: JSON.stringify({ idToken: credentialResponse.credential }),
      });

      if (!response.ok) {
        if (response.status === 404) {
          throw new Error('Netlify Functionが見つかりません。ローカル開発時は「netlify dev」コマンドを使用してください。');
        }
        throw new Error('APIキーの取得に失敗しました');
      }

      const { apiKey } = await response.json();
      setApiKey(apiKey);
      sessionStorage.setItem(`apiKey_${appId}`, apiKey);
      setStatus({ type: 'success', message: 'APIキーを自動設定しました' });
    } catch (err) {
      setStatus({ type: 'error', message: err.message });
    }
  };

  const handleLogout = async () => {
    googleLogout();
    await supabase.auth.signOut();
    setUser(null);
    setApiKey('');
    localStorage.removeItem(`user_${appId}`);
    sessionStorage.removeItem(`apiKey_${appId}`);
    // localStorage.removeItem(`gemini_api_key_${appId}`); // Keep manually saved key for dev convenience
    setStatus({ type: 'info', message: 'ログアウトしました' });
  };

  const saveApiKey = (key) => {
    setApiKey(key);
    localStorage.setItem(`gemini_api_key_${appId}`, key);
    setStatus({ type: 'success', message: 'APIキーを保存しました' });
  };

  const formatNumericString = (val) => {
    if (typeof val !== 'string') return val;
    return val
      .replace(/\.00+(?=%|円|件|$|\s)/g, '')
      .replace(/(\.\d*?[1-9])0+(?=%|円|件|$|\s)/g, '$1')
      .replace(/\.(?=%|円|件|$|\s)/g, '');
  };

  const getCellValue = (wb, sheetName, address) => {
    const targetName = wb.SheetNames.find(n => n.trim().includes(sheetName)) || sheetName;
    const sheet = wb.Sheets[targetName];
    if (!sheet) return "";
    const cell = sheet[address];
    return cell ? formatNumericString(cell.w || String(cell.v || '')) : "";
  };

  const getColLabel = (i) => {
    let label = "";
    while (i >= 0) {
      label = String.fromCharCode((i % 26) + 65) + label;
      i = Math.floor(i / 26) - 1;
    }
    return label;
  };

  // Auto-hide status messages
  useEffect(() => {
    if (status) {
      const duration = status.type === 'error' ? 8000 : 3000;
      const timer = setTimeout(() => setStatus(null), duration);
      return () => clearTimeout(timer);
    }
  }, [status]);

  const handleReset = () => {
    setFile(null);
    setWorkbook(null);
    setActiveSheet('');
    setSheetData([]);
    setExtractedData(null);
    setExtractionLog([]);
    setShowModal(false);
    if (fileInputRef.current) fileInputRef.current.value = "";
  };

  const handleSaveCustomer = async (name, id = null) => {
    const targetId = id || (editingCustomer ? editingCustomer.id : null);

    // Always clear editing state if we're not explicitly editing in the header
    if (!id) setEditingCustomer(null);

    if (!name.trim() || !user) return;

    try {
      if (targetId !== null) {
        const { error } = await supabase.from('customers').update({ name }).eq('id', targetId);
        if (error) throw error;
      } else {
        const minOrder = customers.length > 0 ? Math.min(...customers.map(c => c.sort_order || 0)) : 0;
        const { error } = await supabase.from('customers').insert([{ name, sort_order: minOrder - 10 }]);
        if (error) throw error;
      }
      fetchData();
      setStatus({ type: 'success', message: '顧客を保存しました' });
    } catch (e) {
      console.error('Customer save error:', e);
      setStatus({ type: 'error', message: '顧客の保存に失敗しました' });
    }
  };

  const handleDeleteCustomer = (id) => {
    setConfirmModal({
      show: true,
      title: '顧客の削除',
      message: 'この顧客を削除しますか？紐付くプリセットもすべて削除されます。この操作は取り消せません。',
      onConfirm: async () => {
        try {
          const { error } = await supabase.from('customers').delete().eq('id', id);
          if (error) throw error;
          if (managementCustomer === id) setManagementCustomer('');
          if (selectedCustomerId === id) {
            setSelectedCustomerId('');
            setSelectedPresetId('');
          }
          fetchData();
          setStatus({ type: 'success', message: '顧客を削除しました' });
        } catch (e) {
          console.error('Customer delete error:', e);
          setStatus({ type: 'error', message: '顧客の削除に失敗しました' });
        }
      }
    });
  };

  const handleSavePreset = async (presetData) => {
    if (!presetData.name.trim() || !managementCustomer || !user) return;
    try {
      if (presetData.id) {
        const { error } = await supabase.from('presets').update({
          name: presetData.name,
          goal: presetData.goal,
          issues: presetData.issues,
          tasks: presetData.tasks
        }).eq('id', presetData.id);
        if (error) throw error;
      } else {
        const customerPresets = presets.filter(p => p.customer_id === managementCustomer);
        const minOrder = customerPresets.length > 0 ? Math.min(...customerPresets.map(p => p.sort_order || 0)) : 0;
        const { error } = await supabase.from('presets').insert([{
          customer_id: managementCustomer,
          name: presetData.name,
          goal: presetData.goal,
          issues: presetData.issues,
          tasks: presetData.tasks,
          sort_order: minOrder - 10
        }]);
        if (error) throw error;
      }
      fetchData();
      setStatus({ type: 'success', message: 'プリセットを保存しました' });
    } catch (e) {
      console.error('Preset save error:', e);
      setStatus({ type: 'error', message: 'プリセットの保存に失敗しました' });
    }
  };

  const handleDuplicatePreset = async (preset) => {
    if (!user || !managementCustomer) return;
    try {
      const customerPresets = presets.filter(p => p.customer_id === managementCustomer);
      const minOrder = customerPresets.length > 0 ? Math.min(...customerPresets.map(p => p.sort_order || 0)) : 0;

      const { data, error } = await supabase.from('presets').insert([{
        customer_id: managementCustomer,
        name: `${preset.name} (コピー)`,
        goal: preset.goal,
        issues: preset.issues,
        tasks: preset.tasks,
        sort_order: minOrder - 10
      }]).select();

      if (error) throw error;
      fetchData();
      if (data && data[0]) setEditingPreset(data[0]);
      setStatus({ type: 'success', message: 'プリセットを複製しました' });
    } catch (e) {
      console.error('Duplicate preset error:', e);
      setStatus({ type: 'error', message: 'プリセットの複製に失敗しました' });
    }
  };

  const handleDeletePreset = (id) => {
    setConfirmModal({
      show: true,
      title: 'プリセットの削除',
      message: 'このプリセットを削除しますか？この操作は取り消せません。',
      onConfirm: async () => {
        try {
          const { error } = await supabase.from('presets').delete().eq('id', id);
          if (error) throw error;
          if (selectedPresetId === id) setSelectedPresetId('');
          fetchData();
          setStatus({ type: 'success', message: 'プリセットを削除しました' });
        } catch (e) {
          console.error('Preset delete error:', e);
          setStatus({ type: 'error', message: 'プリセットの削除に失敗しました' });
        }
      }
    });
  };

  const findValueByLabel = (wb, sheetName, label, direction = 'bottom') => {
    const XLSX = window.XLSX;
    const targetName = wb.SheetNames.find(n => n.trim().includes(sheetName)) || sheetName;
    const sheet = wb.Sheets[targetName];
    if (!sheet) return null;

    const range = XLSX.utils.decode_range(sheet['!ref'] || 'A1:Z100');
    for (let R = range.s.r; R <= range.e.r; ++R) {
      for (let C = range.s.c; C <= range.e.c; ++C) {
        const cell = sheet[XLSX.utils.encode_cell({ r: R, c: C })];
        if (cell && String(cell.v).includes(label)) {
          const targetR = direction === 'bottom' ? R + 1 : R;
          const targetC = direction === 'right' ? C + 1 : C;
          const addr = XLSX.utils.encode_cell({ r: targetR, c: targetC });
          const targetCell = sheet[addr];
          return { val: formatNumericString(targetCell ? (targetCell.w || String(targetCell.v || '')) : ""), address: addr };
        }
      }
    }
    return null;
  };

  const handleFileChange = async (e) => {
    const selectedFile = e.target.files[0];
    if (!selectedFile || !isLibLoaded) return;
    setFile(selectedFile);
    setStatus({ type: 'info', message: '解析中...' });

    try {
      const data = await selectedFile.arrayBuffer();
      const XLSX = window.XLSX;
      const wb = XLSX.read(data, { cellFormula: false, cellNF: true, cellText: true });
      setWorkbook(wb);

      const mainSheet = wb.SheetNames.find(n => n.includes('サマリー')) || wb.SheetNames[0];
      setActiveSheet(mainSheet);
      setSheetData(XLSX.utils.sheet_to_json(wb.Sheets[mainSheet], { header: 1, defval: '' }));

      // Data Extraction logic
      const logs = [];
      const fetchVal = (sh, ad, lb) => {
        let v = getCellValue(wb, sh, ad);
        if (v && v !== "0" && v !== "0%") {
          logs.push(`[Success] ${lb}: ${ad} (${v})`);
          return v;
        }
        const f = findValueByLabel(wb, sh, lb);
        if (f) {
          logs.push(`[Smart] ${lb}: ${f.address} (${f.val})`);
          return f.val;
        }
        logs.push(`[Failed] ${lb}: Not found`);
        return "";
      };

      const cvRows = [10, 11, 12, 13, 14, 15];
      const cvItems = cvRows.map(r => ({
        n: getCellValue(wb, mainSheet, `R${r}`),
        c: getCellValue(wb, mainSheet, `Z${r}`)
      })).filter(i => i.n && i.c && i.c !== '0');

      const extracted = {
        achievement: fetchVal(mainSheet, 'E8', '目標達成率'),
        totalCV: fetchVal(mainSheet, 'R8', 'コンバージョン数'),
        cvr: fetchVal(mainSheet, 'AF8', 'コンバージョン率'),
        cpa: fetchVal(mainSheet, 'AT8', 'コンバージョン単価'),
        ctr: fetchVal(mainSheet, 'AF19', 'クリック率'),
        goal: fetchVal(mainSheet, 'BH38', '目標値'),
        cvBreakdown: cvItems.map(i => `${i.n}${i.c}件`).join('・')
      };

      setExtractionLog(logs);

      // Check if essential data is missing (unsaved file detection)
      const essentials = [extracted.achievement, extracted.totalCV, extracted.cpa];
      const missingCount = essentials.filter(v => !v || v === "0" || v === "0%").length;

      if (missingCount >= 2) {
        setExtractedData(null); // Clear data to prevent generation
        setModalTitle('データの読み取り失敗');
        setModalMessage('エクセルファイルから数値を読み取ることができませんでした。システムからダウンロードした直後のファイルは計算結果が保持されていない場合があります。一度「上書き保存」してから、再度ファイルを選択してください。');
        setShowModal(true);
        setStatus({ type: 'error', message: '解析エラー' });
      } else {
        setExtractedData(extracted);
        setStatus({ type: 'success', message: '解析完了' });
      }
    } catch (err) {
      console.error(err);
      setStatus({ type: 'error', message: 'ファイル読み込み失敗' });
    }
  };

  const callGemini = async (prompt) => {
    if (!apiKey) throw new Error("APIキーが設定されていません。ログインしてください。");

    const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${apiKey}`;
    const delays = [1000, 2000, 4000, 8000, 16000];

    for (let i = 0; i <= delays.length; i++) {
      try {
        const res = await fetch(url, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            contents: [{ parts: [{ text: prompt }] }],
            systemInstruction: { parts: [{ text: `あなたはプロの広告運用コンサルタントです。提供された数値データを元に、クライアントへ提出する質の高いレポートサマリーを「・」から始まる3行で作成してください。

【出力の基本方針】
・単に数値を並べるのではなく、それらが何を意味するのか（好調なのか、改善が必要なのか、どのような施策が効いているのか）をプロフェッショナルな表現で記述してください。
・目標、課題、タスクの各項目が提供されている場合は、それらを自然に要約に組み込んでください。
・不要な小数点は省略してください。

【出力形式の絶対ルール】
・必ず「・」で始まる箇条書きで3行出力してください。
・「*」や「**」などのマークダウン装飾、および「1.」「2.」のような番号は一切使用しないでください。

【良い回答（お手本）】
・今月はCV○件（△△○件・××○件）を獲得し、目標達成率○％と大幅に目標を達成しております。
・CVRが○％と向上したことで、CPAも○円まで改善されており、獲得効率が非常に良くなっています。
・クリック率(CTR)も○％と上昇傾向にあるため、現在の広告文を軸にしつつ、今後はキーワードを調整し、予算に応じた獲得数の最大化を目指します。` }] }
          })
        });
        if (!res.ok) throw new Error(`API Error: ${res.status}`);
        const json = await res.json();
        return json.candidates?.[0]?.content?.parts?.[0]?.text;
      } catch (err) {
        if (i === delays.length) throw err;
        await new Promise(r => setTimeout(r, delays[i]));
      }
    }
  };

  const generateSummary = async () => {
    if (!extractedData) return;
    setGenerating(true);
    setAiResponse('');

    const prompt = `
以下の広告配信データを元に、クライアント向けのレポートサマリーを「3行の箇条書き」で作成してください。
不要な小数点は削除してください（例：100.00% → 100%）。

【データ】
・目標達成率: ${extractedData.achievement}％
・当月合計CV: ${extractedData.totalCV} (内訳: ${extractedData.cvBreakdown})
・当月CVR: ${extractedData.cvr}％
・当月CPA: ${extractedData.cpa}円
・当月CTR: ${extractedData.ctr}％
・目標CV数: ${extractedData.goal}

【追加コンテキスト】
・目標: ${aiContext.goal}
・課題: ${aiContext.issues}
・タスク: ${aiContext.tasks}
`;

    try {
      const result = await callGemini(prompt);
      setAiResponse(result);
    } catch (err) {
      setStatus({ type: 'error', message: err.message });
    } finally {
      setGenerating(false);
    }
  };

  return (
    <div className="min-h-screen bg-slate-50 text-slate-900 p-4 md:p-8 font-sans">
      <div className="max-w-6xl mx-auto space-y-6">

        {/* Header */}
        <header className="flex flex-col md:flex-row md:items-center justify-between gap-4 bg-white p-6 rounded-3xl shadow-sm border border-slate-200">
          <div className="flex items-center gap-3">
            <div className="w-12 h-12 bg-indigo-600 rounded-2xl flex items-center justify-center text-white shadow-lg">
              <BarChart3 size={28} />
            </div>
            <div>
              <h1 className="text-xl font-bold tracking-tight">広告レポートコメント自動生成</h1>
              <p className="text-xs text-slate-400 font-medium">mi-rai.co.jp Exclusive Authorized</p>
            </div>
          </div>
          <div className="flex items-center gap-3">

            {/* Dev Mode Settings Toggle */}
            {(import.meta.env.DEV || user?.email === 'mirai-dev@mi-rai.co.jp') && (
              <button
                onClick={() => setShowSettings(!showSettings)}
                className={`p-2.5 rounded-xl transition-all ${showSettings ? 'bg-indigo-600 text-white shadow-indigo-200 shadow-lg' : 'bg-slate-100 text-slate-500 hover:bg-slate-200'}`}
              >
                <Settings size={20} />
              </button>
            )}

            {user ? (
              <div className="flex items-center gap-3 bg-slate-50 p-1.5 pl-3 rounded-2xl border border-slate-100">
                <div className="text-right hidden sm:block">
                  <p className="text-[10px] font-bold text-slate-700 leading-none">{user.name}</p>
                  <span className="text-xs font-bold text-slate-600">{user.email.split('@')[0]}</span>
                </div>
                <button
                  onClick={handleLogout}
                  className="p-2 bg-white text-slate-400 hover:text-rose-500 rounded-xl border border-slate-200 transition-all hover:shadow-sm"
                >
                  <LogOut size={16} />
                </button>
              </div>
            ) : (
              <GoogleLogin
                onSuccess={handleLoginSuccess}
                onError={() => setStatus({ type: 'error', message: 'ログインに失敗しました' })}
                use_fedcm_for_prompt={false}
              />
            )}
          </div>
        </header>

        {/* Settings Panel (Emergency/Dev manual entry) */}
        {showSettings && (
          <div className="bg-white p-6 rounded-3xl shadow-xl border border-indigo-100 animate-in slide-in-from-top-4">
            <h2 className="text-sm font-bold text-slate-700 mb-4 flex items-center gap-2">
              <Settings size={16} className="text-indigo-600" /> API Configuration (Manual Override)
            </h2>
            <div className="flex flex-col md:flex-row gap-4">
              <div className="flex-1 relative">
                <input
                  type={showKey ? "text" : "password"}
                  value={apiKey}
                  onChange={(e) => setApiKey(e.target.value)}
                  placeholder="Paste your Gemini API Key here..."
                  className="w-full pl-4 pr-12 py-3 bg-slate-50 border border-slate-200 rounded-2xl text-sm focus:ring-2 focus:ring-indigo-500 outline-none transition-all"
                />
                <button onClick={() => setShowKey(!showKey)} className="absolute right-4 top-1/2 -translate-y-1/2 text-slate-400">
                  {showKey ? <EyeOff size={18} /> : <Eye size={18} />}
                </button>
              </div>
              <button
                onClick={() => { saveApiKey(apiKey); setShowSettings(false); }}
                className="px-8 py-3 bg-indigo-600 text-white font-bold rounded-2xl text-sm hover:bg-indigo-700 transition-all shadow-lg shadow-indigo-100"
              >
                保存して適用
              </button>
            </div>
            <p className="text-[10px] text-slate-400 mt-3 italic">※ APIキーはLocalStorageに保存されます。開発用または緊急用です。</p>
          </div>
        )}

        {!user ? (
          <div className="flex-1 flex flex-col items-center justify-center p-6 gap-6">
            <section className="bg-white p-12 rounded-[2.5rem] border border-slate-200 shadow-sm text-center space-y-6 max-w-lg w-full">
              <div className="w-20 h-20 bg-indigo-50 rounded-3xl flex items-center justify-center mx-auto text-indigo-600 mb-4">
                <User size={40} />
              </div>
              <h2 className="text-2xl font-black text-slate-800">Welcome to Ad Intelligence</h2>
              <p className="text-slate-500 text-sm leading-relaxed">
                本ツールは mi-rai.co.jp メンバー専用です。<br />
                右上のボタンからGoogleアカウントでログインしてください。
              </p>
            </section>
          </div>
        ) : (
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 animate-in fade-in slide-in-from-bottom-2">
            {/* Main Controls */}
            <div className="lg:col-span-2 space-y-6">
              <section className="bg-white p-8 rounded-[2.5rem] border border-slate-200 shadow-sm">
                <div className="flex items-center justify-between mb-6">
                  <h2 className="text-xs font-bold text-slate-400 uppercase tracking-widest flex items-center gap-2">
                    <FileSpreadsheet size={16} /> 1. Upload Data
                  </h2>
                </div>
                <div className="relative group">
                  <input type="file" ref={fileInputRef} accept=".xlsx" onChange={handleFileChange} className="absolute inset-0 w-full h-full opacity-0 cursor-pointer z-10" />
                  <div className="border-2 border-dashed border-slate-200 group-hover:border-indigo-400 group-hover:bg-indigo-50/50 rounded-3xl p-12 transition-all text-center">
                    <FileText className="mx-auto text-slate-300 group-hover:text-indigo-500 mb-4 transition-colors" size={48} />
                    <p className="text-sm font-bold text-slate-600">{file ? file.name : "Excelレポートを選択"}</p>
                    <p className="text-xs text-slate-400 mt-2">.xlsx形式のみ対応</p>
                  </div>
                </div>
                <div className="mt-4 p-4 bg-amber-50 rounded-2xl border border-amber-100 flex items-start gap-3">
                  <AlertCircle size={18} className="text-amber-500 shrink-0 mt-0.5" />
                  <p className="text-[11px] text-amber-700 leading-relaxed">
                    <strong>注意：</strong> エクセルファイルをダウンロード後、一度も「保存（上書き保存）」せずに読み込むと、値が正しく表示されない場合があります。値が取得できない場合は、ファイルを一度保存してから再度選択してください。
                  </p>
                </div>
              </section>

              <section className="bg-white p-8 rounded-[2.5rem] border border-slate-200 shadow-sm space-y-6">
                <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 mb-6">
                  <h2 className="text-xs font-bold text-slate-400 uppercase tracking-widest flex items-center gap-2">
                    <MessageSquare size={16} /> 2. AI Context (Optional)
                  </h2>
                  <div className="flex flex-wrap items-center gap-2 w-full sm:w-auto">
                    <div className="flex flex-1 sm:flex-initial items-center gap-1.5 bg-slate-50 p-1 rounded-xl border border-slate-100 min-w-[140px]">
                      <Users size={12} className="text-slate-400 ml-1.5" />
                      <select
                        value={selectedCustomerId}
                        onChange={(e) => {
                          setSelectedCustomerId(e.target.value);
                          setSelectedPresetId('');
                        }}
                        className="bg-transparent text-[11px] font-bold text-slate-600 outline-none w-full"
                      >
                        <option value="">顧客を選択</option>
                        {customers.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                      </select>
                    </div>
                    <div className="flex flex-1 sm:flex-initial items-center gap-1.5 bg-slate-50 p-1 rounded-xl border border-slate-100 min-w-[140px]">
                      <LayoutDashboard size={12} className="text-slate-400 ml-1.5" />
                      <select
                        value={selectedPresetId}
                        onChange={(e) => {
                          const pid = e.target.value;
                          setSelectedPresetId(pid);
                          const p = presets.find(pr => pr.id === pid);
                          if (p) {
                            setAiContext({ goal: p.goal, issues: p.issues, tasks: p.tasks });
                          }
                        }}
                        className="bg-transparent text-[11px] font-bold text-slate-600 outline-none w-full"
                        disabled={!selectedCustomerId}
                      >
                        <option value="">プリセットを選択</option>
                        {presets.filter(p => p.customer_id === selectedCustomerId).map(p => (
                          <option key={p.id} value={p.id}>{p.name}</option>
                        ))}
                      </select>
                    </div>
                    <button
                      onClick={() => setShowPresetsModal(true)}
                      className="p-2.5 bg-indigo-50 text-indigo-600 hover:bg-indigo-100 rounded-xl border border-indigo-100 transition-all flex items-center gap-2 text-[10px] font-bold h-[34px]"
                      title="顧客・プリセット管理"
                    >
                      <Building size={14} /> <span>管理</span>
                    </button>
                  </div>
                </div>
                <div className="grid grid-cols-1 gap-4">
                  <div className="space-y-2">
                    <label className="text-[10px] font-bold text-slate-400 uppercase flex items-center gap-2">
                      <Target size={12} className="text-indigo-500" /> 目標
                    </label>
                    <textarea
                      value={aiContext.goal}
                      onChange={(e) => setAiContext({ ...aiContext, goal: e.target.value })}
                      placeholder="例: Google広告の目標3件の達成"
                      className="w-full p-4 bg-slate-50 border border-slate-100 rounded-2xl text-sm focus:ring-2 focus:ring-indigo-500 outline-none transition-all min-h-[80px]"
                    />
                  </div>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <label className="text-[10px] font-bold text-slate-400 uppercase flex items-center gap-2">
                        <AlertCircle size={12} className="text-rose-400" /> 課題
                      </label>
                      <textarea
                        value={aiContext.issues}
                        onChange={(e) => setAiContext({ ...aiContext, issues: e.target.value })}
                        placeholder="現在の課題を入力..."
                        className="w-full p-4 bg-slate-50 border border-slate-100 rounded-2xl text-sm focus:ring-2 focus:ring-indigo-500 outline-none transition-all min-h-[100px]"
                      />
                    </div>
                    <div className="space-y-2">
                      <label className="text-[10px] font-bold text-slate-400 uppercase flex items-center gap-2">
                        <ListTodo size={12} className="text-emerald-400" /> タスク
                      </label>
                      <textarea
                        value={aiContext.tasks}
                        onChange={(e) => setAiContext({ ...aiContext, tasks: e.target.value })}
                        placeholder="今後のタスクを入力..."
                        className="w-full p-4 bg-slate-50 border border-slate-100 rounded-2xl text-sm focus:ring-2 focus:ring-indigo-500 outline-none transition-all min-h-[100px]"
                      />
                    </div>
                  </div>
                </div>
              </section>

              {/* Dashboard View */}
              {extractedData && (
                <section className="bg-slate-900 rounded-[2.5rem] p-8 text-white shadow-2xl relative overflow-hidden animate-in fade-in slide-in-from-bottom-4">
                  <div className="absolute top-0 right-0 p-8 opacity-5 pointer-events-none">
                    <LayoutDashboard size={180} />
                  </div>
                  <h2 className="text-[10px] font-bold text-indigo-300 mb-8 uppercase tracking-[0.2em] flex items-center gap-2">
                    <LayoutDashboard size={14} /> Extraction Results
                  </h2>
                  <div className="grid grid-cols-2 md:grid-cols-4 gap-6 relative z-10">
                    <div className="space-y-1">
                      <p className="text-[10px] font-bold text-slate-500 uppercase">目標達成率</p>
                      <p className="text-3xl font-black text-indigo-400">{extractedData.achievement || "---"}<span className="text-sm ml-1">%</span></p>
                    </div>
                    <div className="space-y-1">
                      <p className="text-[10px] font-bold text-slate-500 uppercase">CV数 / 目標</p>
                      <p className="text-3xl font-black text-white">{extractedData.totalCV || "0"}<span className="text-xs text-slate-600 ml-1">/ {extractedData.goal || "-"}</span></p>
                    </div>
                    <div className="space-y-1">
                      <p className="text-[10px] font-bold text-slate-500 uppercase">CPA</p>
                      <p className="text-2xl font-black text-white">{extractedData.cpa || "---"}<span className="text-xs ml-1">円</span></p>
                    </div>
                    <div className="space-y-1">
                      <p className="text-[10px] font-bold text-slate-500 uppercase">CTR</p>
                      <p className="text-3xl font-black text-indigo-400">{extractedData.ctr || "---"}<span className="text-sm ml-1">%</span></p>
                    </div>
                  </div>
                </section>
              )}

              {/* Table Preview */}
              <div className="bg-white rounded-[2.5rem] border border-slate-200 overflow-hidden h-[400px] flex flex-col shadow-sm">
                <div className="px-6 py-4 border-b border-slate-100 flex items-center justify-between bg-slate-50/50">
                  <span className="text-xs font-bold text-slate-500 flex items-center gap-2 uppercase">
                    <TableIcon size={14} /> {activeSheet || "Sheet Data"}
                  </span>
                  {workbook && (
                    <div className="flex gap-1 overflow-x-auto pb-1 max-w-[200px] sm:max-w-md no-scrollbar">
                      {workbook.SheetNames.map(n => (
                        <button
                          key={n}
                          onClick={() => {
                            try {
                              const data = window.XLSX.utils.sheet_to_json(workbook.Sheets[n], { header: 1, defval: '' });
                              setActiveSheet(n);
                              setSheetData(Array.isArray(data) ? data : []);
                            } catch (e) {
                              console.error("Sheet switch error:", e);
                              setStatus({ type: 'error', message: 'シートの切り替えに失敗しました' });
                            }
                          }}
                          className={`px-3 py-1 text-[10px] font-bold rounded-full transition-all whitespace-nowrap ${activeSheet === n ? 'bg-indigo-600 text-white shadow-md' : 'bg-white text-slate-400 border border-slate-200 hover:border-indigo-300'}`}
                        >
                          {n}
                        </button>
                      ))}
                    </div>
                  )}
                </div>
                <div className="flex-1 overflow-auto text-[10px] custom-scrollbar">
                  <table className="w-full border-collapse">
                    <thead className="sticky top-0 z-10 bg-slate-100 shadow-sm">
                      <tr>
                        <th className="p-2 w-8 bg-slate-200 text-slate-400 font-mono"></th>
                        {Array.isArray(sheetData) && sheetData[0] && Array.isArray(sheetData[0]) &&
                          sheetData[0].map((_, i) => (
                            <th key={i} className="p-2 min-w-[60px] max-w-[120px] text-left text-slate-500 font-mono border-l border-slate-200 uppercase">
                              {getColLabel(i)}
                            </th>
                          ))
                        }
                      </tr>
                    </thead>
                    <tbody>
                      {Array.isArray(sheetData) && sheetData.length > 0 ? (
                        sheetData.slice(0, 50).map((row, r) => (
                          <tr key={r} className="hover:bg-slate-50 border-b border-slate-50/50 transition-colors">
                            <td className="p-2 text-center bg-slate-50/80 text-slate-300 font-mono w-8 border-r border-slate-100">{r + 1}</td>
                            {Array.isArray(row) ? row.map((c, i) => (
                              <td key={i} className="p-2 text-slate-600 min-w-[60px] max-w-[120px] truncate border-l border-slate-50">
                                {c instanceof Date ? c.toLocaleString() : (typeof c === 'object' && c !== null ? JSON.stringify(c) : String(c ?? ""))}
                              </td>
                            )) : (
                              <td className="p-2 text-slate-400 italic">No data</td>
                            )}
                          </tr>
                        ))
                      ) : (
                        <tr>
                          <td className="p-12 text-center text-slate-400 italic">
                            表示可能なデータがありません
                          </td>
                        </tr>
                      )}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>

            {/* Right Column: AI Output & Logs */}
            <div className="space-y-6">
              <section className="bg-white rounded-[2.5rem] border border-slate-200 shadow-sm flex flex-col h-[600px] overflow-hidden">
                <div className="p-6 border-b border-slate-100 flex items-center justify-between bg-indigo-50/30">
                  <div className="flex items-center gap-2">
                    <div className={`w-2.5 h-2.5 rounded-full ${generating ? 'bg-amber-400 animate-pulse' : aiResponse ? 'bg-emerald-400' : 'bg-slate-200'}`}></div>
                    <h2 className="text-sm font-bold text-slate-700">AI Summary</h2>
                  </div>
                  <button
                    disabled={!extractedData || generating || !apiKey}
                    onClick={generateSummary}
                    className="p-2.5 bg-indigo-600 text-white rounded-xl shadow-lg shadow-indigo-100 hover:bg-indigo-700 disabled:bg-slate-200 transition-all active:scale-95"
                  >
                    {generating ? <Loader2 size={18} className="animate-spin" /> : <Send size={18} />}
                  </button>
                </div>

                <div className="flex-1 p-8 overflow-y-auto custom-scrollbar">
                  {aiResponse ? (
                    <div className="animate-in fade-in zoom-in-95 h-full">
                      <div className="bg-slate-50 p-8 rounded-[2rem] border border-slate-100 text-slate-700 text-sm leading-relaxed whitespace-pre-wrap italic shadow-inner h-full min-h-[300px]">
                        {aiResponse}
                      </div>
                    </div>
                  ) : (
                    <div className="h-full flex flex-col items-center justify-center text-center px-6">
                      <div className="w-16 h-16 bg-slate-50 rounded-2xl flex items-center justify-center mb-4 text-slate-200 border border-slate-50">
                        <Send size={32} />
                      </div>
                      <p className="text-slate-400 text-xs font-medium leading-relaxed">
                        {!apiKey ? "APIキーを取得中です。しばらくお待ちください。" : "レポートを解析後、生成ボタンを押すとAIがサマリーを3行でまとめます。"}
                      </p>
                    </div>
                  )}
                </div>

                {aiResponse && (
                  <div className="p-6 border-t border-slate-50 bg-white">
                    <button
                      onClick={() => {
                        const el = document.createElement('textarea'); el.value = aiResponse;
                        document.body.appendChild(el); el.select(); document.execCommand('copy');
                        document.body.removeChild(el); setStatus({ type: 'success', message: 'Copied!' });
                      }}
                      className="w-full flex items-center justify-center gap-2 py-4 bg-white border-2 border-slate-100 text-slate-500 text-xs font-bold rounded-2xl hover:bg-slate-50 hover:border-indigo-200 hover:text-indigo-600 transition-all shadow-sm"
                    >
                      <Copy size={16} /> クリップボードにコピー
                    </button>
                  </div>
                )}
              </section>

              <section className="bg-white p-6 rounded-3xl border border-slate-200 shadow-sm">
                <h2 className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-4 flex items-center gap-2">
                  <RefreshCw size={14} /> Processing Log
                </h2>
                <div className="space-y-2 max-h-[120px] overflow-y-auto text-[10px] custom-scrollbar pr-2 font-medium">
                  {extractionLog.length > 0 ? extractionLog.map((log, i) => (
                    <div key={i} className={`p-2 rounded-lg flex items-center gap-2 ${log.includes('Success') ? 'bg-emerald-50 text-emerald-700' : log.includes('Smart') ? 'bg-blue-50 text-blue-700' : 'bg-slate-50 text-slate-400'}`}>
                      <ChevronRight size={10} /> {log}
                    </div>
                  )) : <p className="text-slate-300 italic">No logs yet.</p>}
                </div>
              </section>
            </div>
          </div>
        )}
      </div>

      {/* Preset Management Modal */}
      {showPresetsModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm animate-in fade-in duration-200">
          <DragDropContext onDragEnd={handleOnDragEnd}>
            <div className="bg-white rounded-[2.5rem] shadow-2xl border border-slate-200 max-w-6xl w-full h-[85vh] overflow-hidden flex flex-col animate-in zoom-in-95 duration-200 relative">
              <div className="p-6 border-b border-slate-100 flex items-center justify-between bg-slate-50/50">
                <h3 className="text-lg font-black text-slate-800 flex items-center gap-2">
                  <Building size={20} className="text-indigo-600" /> 顧客・プリセット管理
                </h3>
                <button
                  onClick={() => { setShowPresetsModal(false); setEditingCustomer(null); setEditingPreset(null); }}
                  className="p-2 text-slate-400 hover:text-slate-600 transition-colors"
                  id="close-presets-modal"
                >
                  <X size={20} />
                </button>
              </div>

              <div className="flex-1 overflow-hidden flex flex-col md:flex-row">
                {/* Sidebar: Customer List */}
                <div className="w-full md:w-64 border-r border-slate-100 flex flex-col bg-slate-50/30">
                  <div className="p-4 border-b border-slate-100 flex items-center justify-between">
                    <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">顧客リスト</span>
                    <button
                      onClick={() => { setEditingCustomer({ id: null, name: '' }); }}
                      className="p-1.5 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 transition-all shadow-sm"
                    >
                      <Plus size={14} />
                    </button>
                  </div>
                  <Droppable droppableId="customers">
                    {(provided) => (
                      <div
                        {...provided.droppableProps}
                        ref={provided.innerRef}
                        className="flex-1 overflow-y-auto p-2 space-y-1 custom-scrollbar"
                      >
                        {customers.map((c, index) => (
                          <Draggable key={c.id} draggableId={c.id} index={index}>
                            {(provided) => (
                              <div
                                ref={provided.innerRef}
                                {...provided.draggableProps}
                                onClick={() => { setManagementCustomer(c.id); setEditingPreset(null); }}
                                className={`group flex items-center gap-2 p-3 rounded-xl cursor-pointer transition-all ${managementCustomer === c.id ? 'bg-white border border-indigo-100 shadow-sm' : 'hover:bg-white/50 border border-transparent'}`}
                              >
                                <div {...provided.dragHandleProps} className="text-slate-300 hover:text-slate-500 transition-colors">
                                  <GripVertical size={14} />
                                </div>
                                <span className={`text-sm font-bold flex-1 ${managementCustomer === c.id ? 'text-indigo-600' : 'text-slate-600'}`}>
                                  {c.name}
                                </span>
                                <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                                  <button
                                    onClick={(e) => { e.stopPropagation(); handleDeleteCustomer(c.id); }}
                                    className="p-1 text-slate-400 hover:text-rose-600"
                                  >
                                    <Trash2 size={12} />
                                  </button>
                                </div>
                              </div>
                            )}
                          </Draggable>
                        ))}
                        {provided.placeholder}
                        {editingCustomer && editingCustomer.id === null && (
                          <div className="p-2 animate-in slide-in-from-left-2">
                            <input
                              autoFocus
                              placeholder="顧客名を入力..."
                              onKeyDown={(e) => {
                                if (e.nativeEvent.isComposing) return;
                                if (e.key === 'Enter') {
                                  e.preventDefault();
                                  handleSaveCustomer(e.target.value);
                                }
                                if (e.key === 'Escape') setEditingCustomer(null);
                              }}
                              onBlur={(e) => {
                                if (editingCustomer) handleSaveCustomer(e.target.value);
                              }}
                              className="w-full text-sm font-bold bg-white border border-indigo-200 px-3 py-2 rounded-xl outline-none shadow-sm shadow-indigo-50"
                            />
                          </div>
                        )}
                      </div>
                    )}
                  </Droppable>
                </div>

                {/* Main Area: Preset List & Editor */}
                <div className="flex-1 flex flex-col bg-white overflow-hidden">
                  {!managementCustomer ? (
                    <div className="flex-1 flex flex-col items-center justify-center text-slate-300 space-y-4">
                      <Users size={64} opacity={0.2} />
                      <p className="font-bold text-sm">左側のリストから顧客を選択してください</p>
                    </div>
                  ) : (
                    <>
                      <div className="p-4 border-b border-slate-100 bg-slate-50/50 flex items-center justify-between">
                        <div className="flex items-center gap-2">
                          <input
                            value={customers.find(c => c.id === managementCustomer)?.name || ''}
                            onChange={(e) => {
                              const newName = e.target.value;
                              setCustomers(customers.map(c => c.id === managementCustomer ? { ...c, name: newName } : c));
                            }}
                            onBlur={(e) => handleSaveCustomer(e.target.value, managementCustomer)}
                            onKeyDown={(e) => {
                              if (e.nativeEvent.isComposing) return;
                              if (e.key === 'Enter') {
                                e.preventDefault();
                                handleSaveCustomer(e.target.value, managementCustomer);
                                e.target.blur();
                              }
                            }}
                            className="text-sm font-bold bg-white border border-transparent hover:border-indigo-100 focus:border-indigo-300 focus:bg-white px-2 py-1 rounded-lg outline-none transition-all w-48"
                            placeholder="顧客名を入力"
                          />
                          <span className="text-[10px] text-slate-400 font-medium">のプリセット</span>
                        </div>
                        <button
                          onClick={() => setEditingPreset({ id: null, name: '新規プリセット', goal: '', issues: '', tasks: '' })}
                          className="px-4 py-1.5 bg-indigo-600 text-white rounded-xl hover:bg-indigo-700 transition-all flex items-center gap-2 text-xs font-bold"
                        >
                          <Plus size={14} /> 新規作成
                        </button>
                      </div>

                      <div className="flex-1 overflow-hidden flex">
                        {/* Sub-sidebar: Preset List for Customer */}
                        <Droppable droppableId="presets">
                          {(provided) => (
                            <div
                              {...provided.droppableProps}
                              ref={provided.innerRef}
                              className="w-64 border-r border-slate-100 overflow-y-auto p-2 space-y-1 custom-scrollbar bg-slate-50/20"
                            >
                              {presets.filter(p => p.customer_id === managementCustomer).map((p, index) => (
                                <Draggable key={p.id} draggableId={p.id} index={index}>
                                  {(provided) => (
                                    <div
                                      ref={provided.innerRef}
                                      {...provided.draggableProps}
                                      onClick={() => setEditingPreset(p)}
                                      className={`group p-3 rounded-xl cursor-pointer border transition-all ${editingPreset?.id === p.id ? 'bg-white border-indigo-200 shadow-sm' : 'border-transparent hover:bg-white/50'}`}
                                    >
                                      <div className="flex items-center gap-2">
                                        <div {...provided.dragHandleProps} className="text-slate-200 hover:text-slate-400">
                                          <GripVertical size={12} />
                                        </div>
                                        <div className="flex-1 flex items-center justify-between min-w-0">
                                          <span className={`text-[11px] font-bold truncate pr-2 ${editingPreset?.id === p.id ? 'text-indigo-600' : 'text-slate-500'}`}>
                                            {p.name}
                                          </span>
                                          <div className="flex items-center gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity">
                                            <button
                                              onClick={(e) => { e.stopPropagation(); handleDuplicatePreset(p); }}
                                              className="p-1 text-slate-300 hover:text-indigo-500 transition-colors"
                                              title="複製"
                                            >
                                              <Copy size={10} />
                                            </button>
                                            <button
                                              onClick={(e) => { e.stopPropagation(); handleDeletePreset(p.id); }}
                                              className="p-1 text-slate-300 hover:text-rose-500 transition-opacity"
                                              title="削除"
                                            >
                                              <Trash2 size={10} />
                                            </button>
                                          </div>
                                        </div>
                                      </div>
                                    </div>
                                  )}
                                </Draggable>
                              ))}
                              {provided.placeholder}
                            </div>
                          )}
                        </Droppable>

                        {/* Detail Editor */}
                        <div className="flex-1 flex flex-col bg-white overflow-hidden">
                          {editingPreset ? (
                            <>
                              <div className="flex-1 overflow-y-auto p-6 space-y-6 custom-scrollbar animate-in fade-in duration-200">
                                <div className="space-y-2">
                                  <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">プリセット名</label>
                                  <input
                                    value={editingPreset.name}
                                    onChange={(e) => setEditingPreset({ ...editingPreset, name: e.target.value })}
                                    className="w-full p-3 bg-slate-50 border border-slate-100 rounded-xl text-sm font-bold focus:ring-2 focus:ring-indigo-500 outline-none"
                                  />
                                </div>
                                <div className="space-y-2">
                                  <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">目標</label>
                                  <textarea
                                    value={editingPreset.goal}
                                    onChange={(e) => setEditingPreset({ ...editingPreset, goal: e.target.value })}
                                    className="w-full p-4 bg-slate-50 border border-slate-100 rounded-2xl text-sm focus:ring-2 focus:ring-indigo-500 outline-none min-h-[80px]"
                                  />
                                </div>
                                <div className="space-y-2">
                                  <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">課題</label>
                                  <textarea
                                    value={editingPreset.issues}
                                    onChange={(e) => setEditingPreset({ ...editingPreset, issues: e.target.value })}
                                    className="w-full p-4 bg-slate-50 border border-slate-100 rounded-2xl text-sm focus:ring-2 focus:ring-indigo-500 outline-none min-h-[100px]"
                                  />
                                </div>
                                <div className="space-y-2">
                                  <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">タスク</label>
                                  <textarea
                                    value={editingPreset.tasks}
                                    onChange={(e) => setEditingPreset({ ...editingPreset, tasks: e.target.value })}
                                    className="w-full p-4 bg-slate-50 border border-slate-100 rounded-2xl text-sm focus:ring-2 focus:ring-indigo-500 outline-none min-h-[100px]"
                                  />
                                </div>
                              </div>
                              <div className="p-4 border-t border-slate-100 bg-slate-50/50 flex justify-end">
                                <button
                                  onClick={() => handleSavePreset(editingPreset)}
                                  className="px-8 py-3 bg-indigo-600 text-white font-bold rounded-2xl text-sm hover:bg-indigo-700 transition-all flex items-center gap-2 shadow-lg shadow-indigo-100"
                                >
                                  <Save size={18} /> 設定を保存
                                </button>
                              </div>
                            </>
                          ) : (
                            <div className="h-full flex flex-col items-center justify-center text-slate-300 space-y-4 opacity-50">
                              <LayoutDashboard size={48} />
                              <p className="text-xs font-bold">プリセットを選択または新規作成してください</p>
                            </div>
                          )}
                        </div>
                      </div>
                    </>
                  )}
                </div>
              </div>
            </div>
          </DragDropContext>
        </div>
      )}

      {/* Error Modal */}
      {showModal && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm animate-in fade-in duration-200">
          <div className="bg-white rounded-[2.5rem] shadow-2xl border border-slate-200 max-w-md w-full overflow-hidden animate-in zoom-in-95 duration-200">
            <div className="p-8 text-center space-y-6">
              <div className="w-20 h-20 bg-rose-50 rounded-3xl flex items-center justify-center mx-auto text-rose-500">
                <AlertCircle size={40} />
              </div>
              <div className="space-y-2">
                <h3 className="text-xl font-black text-slate-800">{modalTitle}</h3>
                <p className="text-sm text-slate-500 leading-relaxed">
                  {modalMessage}
                </p>
              </div>
              <button
                onClick={handleReset}
                className="w-full py-4 bg-slate-900 text-white font-bold rounded-2xl hover:bg-slate-800 transition-all active:scale-95 shadow-lg shadow-slate-200"
              >
                了解しました
              </button>
            </div>
            <button
              onClick={handleReset}
              className="absolute top-6 right-6 p-2 text-slate-300 hover:text-slate-500 transition-colors"
            >
              <X size={20} />
            </button>
          </div>
        </div>
      )}

      {/* Confirmation Modal */}
      {confirmModal.show && (
        <div className="fixed inset-0 z-[70] flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm animate-in fade-in duration-200">
          <div className="bg-white rounded-[2.5rem] shadow-2xl border border-slate-200 max-w-sm w-full overflow-hidden animate-in zoom-in-95 duration-200">
            <div className="p-8 text-center space-y-6">
              <div className="w-16 h-16 bg-amber-50 rounded-3xl flex items-center justify-center mx-auto text-amber-500">
                <AlertCircle size={32} />
              </div>
              <div className="space-y-2">
                <h3 className="text-lg font-black text-slate-800">{confirmModal.title}</h3>
                <p className="text-xs text-slate-500 leading-relaxed">
                  {confirmModal.message}
                </p>
              </div>
              <div className="grid grid-cols-2 gap-3 pt-2">
                <button
                  onClick={() => setConfirmModal({ ...confirmModal, show: false })}
                  className="py-3 bg-slate-100 text-slate-600 font-bold rounded-xl hover:bg-slate-200 transition-all active:scale-95"
                >
                  キャンセル
                </button>
                <button
                  onClick={() => {
                    if (confirmModal.onConfirm) confirmModal.onConfirm();
                    setConfirmModal({ ...confirmModal, show: false });
                  }}
                  className="py-3 bg-rose-500 text-white font-bold rounded-xl hover:bg-rose-600 transition-all active:scale-95 shadow-lg shadow-rose-100"
                >
                  削除する
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      <div className="fixed bottom-6 right-6 z-[100] pointer-events-none">
        {status && (
          <div className={`pointer-events-auto p-4 rounded-2xl shadow-2xl border flex items-center gap-3 animate-in slide-in-from-right-10 duration-300 ${status.type === 'error' ? 'bg-white border-rose-100' : 'bg-slate-900 border-slate-800'}`}>
            {status.type === 'error' ? (
              <AlertCircle size={20} className="text-rose-500" />
            ) : (
              <CheckCircle2 size={20} className="text-indigo-400" />
            )}
            <p className={`text-sm font-bold ${status.type === 'error' ? 'text-slate-800' : 'text-white'}`}>
              {status.message}
            </p>
            <button onClick={() => setStatus(null)} className="ml-2 text-slate-400 hover:text-white transition-colors">
              <X size={14} />
            </button>
          </div>
        )}
      </div>

      <style dangerouslySetInnerHTML={{ __html: `
        .custom-scrollbar::-webkit-scrollbar { width: 4px; height: 4px; }
        .custom-scrollbar::-webkit-scrollbar-track { background: transparent; }
        .custom-scrollbar::-webkit-scrollbar-thumb { background: #e2e8f0; border-radius: 10px; }
        .custom-scrollbar::-webkit-scrollbar-thumb:hover { background: #cbd5e1; }
      `}} />
    </div>
  );
}