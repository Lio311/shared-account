import React, { useState, useEffect, useMemo, useRef, useCallback } from 'react';
import DatePicker, { registerLocale } from 'react-datepicker';
import { he } from 'date-fns/locale';
import 'react-datepicker/dist/react-datepicker.css';

registerLocale('he', he);
const HEBREW_MONTHS = [
    'ינואר', 'פברואר', 'מרץ', 'אפריל', 'מאי', 'יוני',
    'יולי', 'אוגוסט', 'ספטמבר', 'אוקטובר', 'נובמבר', 'דצמבר'
  ];


import {
  Chart as ChartJS,
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  BarElement,
  ArcElement,
  Title,
  Tooltip,
  Legend,
} from 'chart.js';
import { Bar, Pie } from 'react-chartjs-2';
import { PlusCircle, X, Home, BarChart3, History, Wallet, TrendingDown, Lock, Eye, FileText, Pencil, Trash2, ChevronLeft, ChevronRight, ClipboardList, Briefcase, Coins, Bell } from 'lucide-react';
import PortfolioView from './PortfolioView';
import StockResearchPanel from './StockResearchPanel';
import { authenticatedFetch, loadDashboardData } from './dashboardData.mjs';

ChartJS.register(
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  BarElement,
  ArcElement,
  Title,
  Tooltip,
  Legend
);

const CustomDateInput = React.forwardRef(({ value, onClick, placeholder, ...inputProps }, ref) => (
  <input
    {...inputProps}
    value={value}
    onClick={onClick}
    ref={ref}
    placeholder={placeholder}
    readOnly
    style={{ cursor: 'pointer' }}
  />
));
CustomDateInput.displayName = 'CustomDateInput';

// Keep modal keyboard navigation inside the open window and return focus on close.
function DialogFrame({ children, onClose, label, ...props }) {
  const dialogRef = useRef(null);
  const closeRef = useRef(onClose);
  useEffect(() => { closeRef.current = onClose; }, [onClose]);
  useEffect(() => {
    const previousFocus = document.activeElement;
    const dialog = dialogRef.current;
    const focusables = () => [...dialog.querySelectorAll('button, a[href], input, select, textarea, [tabindex]:not([tabindex="-1"])')]
      .filter(element => !element.disabled && element.getClientRects().length > 0);
    (focusables()[0] || dialog).focus();
    const handleKey = event => {
      if (event.key === 'Escape') { event.preventDefault(); event.stopPropagation(); closeRef.current?.(); }
      if (event.key !== 'Tab') return;
      const elements = focusables();
      if (!elements.length) { event.preventDefault(); dialog.focus(); return; }
      const first = elements[0], last = elements[elements.length - 1];
      if (event.shiftKey && (document.activeElement === first || document.activeElement === dialog)) {
        event.preventDefault(); last.focus();
      } else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
    };
    dialog.addEventListener('keydown', handleKey);
    return () => { dialog.removeEventListener('keydown', handleKey); if (previousFocus?.isConnected) previousFocus.focus(); };
  }, []);
  return <div {...props} ref={dialogRef} role="dialog" aria-modal="true" aria-label={label} tabIndex={-1}>{children}</div>;
}

function PinScreen({ onSuccess }) {
  const [pin, setPin] = useState(['', '', '', '']);
  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const submittingRef = useRef(false);
  const firstInputRef = useRef();
  const inputRefs = [firstInputRef, useRef(), useRef(), useRef()];

  const submitPin = async code => {
    if (submittingRef.current || !/^\d{4}$/.test(code)) return;
    submittingRef.current = true;
    setSubmitting(true);
    setError('');
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 15000);
    try {
      const response = await fetch('/api/auth', {
        method: 'POST', credentials: 'same-origin',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ pin: code }), signal: controller.signal,
      });
      if (!response.ok) {
        throw new Error(response.status === 401 ? 'קוד שגוי, נסו שנית' : response.status === 429 ? 'בוצעו ניסיונות רבים מדי. נסו שוב בעוד מספר דקות.' : 'לא ניתן להתחבר כרגע. נסו שוב.');
      }
      const result = await response.json();
      if (!result.authenticated || !result.person) throw new Error('לא ניתן לאמת את ההתחברות. נסו שוב.');
      onSuccess(result.person);
    } catch (err) {
      setError(err.name === 'AbortError' || err instanceof TypeError ? 'החיבור לשרת לא זמין. בדקו את החיבור ונסו שוב.' : err.message);
      setPin(['', '', '', '']);
      setTimeout(() => inputRefs[0].current?.focus(), 0);
    } finally {
      clearTimeout(timeout);
      submittingRef.current = false;
      setSubmitting(false);
    }
  };

  const handleChange = (index, value) => {
    if (submittingRef.current) return;
    if (value.length > 1) value = value.slice(-1);
    if (value && !/^\d$/.test(value)) return;
    const newPin = [...pin];
    newPin[index] = value;
    setPin(newPin);
    setError('');
    if (value && index < 3) inputRefs[index + 1].current.focus();
    if (newPin.every(Boolean)) void submitPin(newPin.join(''));
  };

  const handleKeyDown = (index, e) => {
    if (e.key === 'Backspace' && !pin[index] && index > 0) inputRefs[index - 1].current.focus();
  };

  const handlePaste = e => {
    e.preventDefault();
    if (submittingRef.current) return;
    const pasted = e.clipboardData.getData('text').replace(/\D/g, '').slice(0, 4);
    if (pasted.length === 4) { setPin(pasted.split('')); void submitPin(pasted); }
  };

  useEffect(() => {
    firstInputRef.current?.focus();
  }, []);

  return (
    <div className="pin-screen">
      <div className="pin-card fade-in">
        <div className="pin-logo">
          <img src="/mutual-logo.svg" alt="mutual" />
        </div>
        <h1 className="pin-title">חשבון משותף</h1>
        <p id="pin-instructions" className="pin-subtitle">הזינו קוד גישה בן 4 ספרות</p>

        <div className="pin-inputs" onPaste={handlePaste}>
          {pin.map((digit, i) => (
            <input
              key={i}
              ref={inputRefs[i]}
              aria-label={`ספרה ${i + 1} מתוך 4 בקוד הגישה`}
              aria-describedby="pin-instructions"
              aria-invalid={Boolean(error)}
              disabled={submitting}
              type="password"
              inputMode="numeric"
              pattern="[0-9]*"
              maxLength={1}
              value={digit}
              onChange={(e) => handleChange(i, e.target.value)}
              onKeyDown={(e) => handleKeyDown(i, e)}
              className={`pin-input ${error ? 'pin-error' : ''} ${digit ? 'pin-filled' : ''}`}
              autoComplete="one-time-code"
              autoCorrect="off"
              autoCapitalize="none"
              spellCheck="false"
            />
          ))}
        </div>

        {submitting && <p className="pin-status" role="status">מאמת קוד גישה...</p>}
        {error && (
          <div className="pin-error-msg fade-in" role="alert">
            {error}
          </div>
        )}
      </div>
    </div>
  );
}

export default function App() {
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [authChecking, setAuthChecking] = useState(true);
  const [authError, setAuthError] = useState('');
  const [authRetry, setAuthRetry] = useState(0);
  const [currentUser, setCurrentUser] = useState('מערכת');
  useEffect(() => {
    const controller = new AbortController();
    let current = true;
    const timeout = setTimeout(() => controller.abort(), 15000);
    fetch('/api/auth', { credentials: 'same-origin', cache: 'no-store', signal: controller.signal })
      .then(async response => {
        if (!response.ok) throw new Error('לא ניתן לבדוק את ההתחברות כרגע.');
        const session = await response.json();
        if (!current) return;
        setIsAuthenticated(session.authenticated === true && Boolean(session.person));
        setCurrentUser(session.person || 'מערכת');
      })
      .catch(() => { if (current) setAuthError('השרת לא זמין כרגע. בדקו את החיבור ונסו שוב.'); })
      .finally(() => { clearTimeout(timeout); if (current) setAuthChecking(false); });
    return () => { current = false; clearTimeout(timeout); controller.abort(); };
  }, [authRetry]);
  const [auditLogs, setAuditLogs] = useState([]);
  const [transactions, setTransactions] = useState([]);
  const [salaries, setSalaries] = useState([]);
  const [projects, setProjects] = useState([]);
  const [isSalaryModalOpen, setIsSalaryModalOpen] = useState(false);
  const [isTransactionModalOpen, setIsTransactionModalOpen] = useState(false);
  const [loading, setLoading] = useState(true);
  const [dataError, setDataError] = useState('');
  const [dataRetry, setDataRetry] = useState(0);
  const [activeTab, setActiveTab] = useState(() => new URLSearchParams(window.location.search).get('view') === 'research' ? 'research' : 'home');
  const [activePortfolioId, setActivePortfolioId] = useState(null);
  const [activePortfolioName, setActivePortfolioName] = useState('');
  const [payslipFilter, setPayslipFilter] = useState('all');
  const [previewPayslipUrl, setPreviewPayslipUrl] = useState(null);
  const [selectedChartMonth, setSelectedChartMonth] = useState(() => {
    const now = new Date();
    return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
  });
  const [analyticsSubTab, setAnalyticsSubTab] = useState('monthly');
  const [compareMonthA, setCompareMonthA] = useState('');
  const [compareMonthB, setCompareMonthB] = useState('');
  const [selectedYear, setSelectedYear] = useState(() => new Date().getFullYear());

  // Investments state
  const [investments, setInvestments] = useState([]);
  const [isInvestmentModalOpen, setIsInvestmentModalOpen] = useState(false);
  const [editingInvestment, setEditingInvestment] = useState(null);

  // Investment Form state
  const [invOwnerName, setInvOwnerName] = useState('ליאור הבן');
  const [invName, setInvName] = useState('');
  const [invType, setInvType] = useState('חשבון מסחר');
  const [invCurrentValue, setInvCurrentValue] = useState('');
  const [invInitialValue, setInvInitialValue] = useState('');
  const [invMonthlyAddition, setInvMonthlyAddition] = useState('');
  const [invInterestType, setInvInterestType] = useState('prime');
  const [invInterestValue, setInvInterestValue] = useState('');

  // Toast System state
  const [toasts, setToasts] = useState([]);
  const showToast = useCallback((message, type = 'success') => {
    const id = Date.now();
    setToasts(prev => [...prev, { id, message, type }]);
    setTimeout(() => {
      setToasts(prev => prev.filter(t => t.id !== id));
    }, 3500);
  }, []);

  // Custom Prompt/Confirm state
  const [confirmConfig, setConfirmConfig] = useState({ isOpen: false, message: '', onConfirm: null, onCancel: null });
  const [promptConfig, setPromptConfig] = useState({ isOpen: false, title: '', placeholder: '', defaultValue: '', onConfirm: null, onCancel: null, value: '' });

  const showConfirm = useCallback((message, onConfirm) => {
    setConfirmConfig({
      isOpen: true,
      message,
      onConfirm: () => {
        onConfirm();
        setConfirmConfig(prev => ({ ...prev, isOpen: false }));
      },
      onCancel: () => {
        setConfirmConfig(prev => ({ ...prev, isOpen: false }));
      }
    });
  }, []);

  const showPrompt = useCallback((title, placeholder, onConfirm, defaultValue = '') => {
    setPromptConfig({
      isOpen: true,
      title,
      placeholder,
      defaultValue,
      value: defaultValue,
      onConfirm: (val) => {
        onConfirm(val);
        setPromptConfig(prev => ({ ...prev, isOpen: false }));
      },
      onCancel: () => {
        setPromptConfig(prev => ({ ...prev, isOpen: false }));
      }
    });
  }, []);

  // Auto-lock after 2 minutes of inactivity
  useEffect(() => {
    if (!isAuthenticated) return;

    let timer;
    const resetTimer = () => {
      clearTimeout(timer);
      timer = setTimeout(() => {
        setIsAuthenticated(false);
        void fetch('/api/auth', { method: 'DELETE', credentials: 'same-origin' }).catch(() => {});
      }, 2 * 60 * 1000); // 2 minutes
    };

    const events = ['mousedown', 'mousemove', 'keydown', 'touchstart', 'scroll'];
    events.forEach(e => window.addEventListener(e, resetTimer));
    resetTimer();

    return () => {
      clearTimeout(timer);
      events.forEach(e => window.removeEventListener(e, resetTimer));
    };
  }, [isAuthenticated]);

  // Disable mouse wheel changing numeric inputs globally
  useEffect(() => {
    const handleWheel = (e) => {
      if (document.activeElement && document.activeElement.type === 'number') {
        e.preventDefault();
      }
    };
    document.addEventListener('wheel', handleWheel, { passive: false });
    return () => {
      document.removeEventListener('wheel', handleWheel);
    };
  }, []);

  // Salary Form state
  const [personName, setPersonName] = useState('ליאור הבן');
  const [salaryAmount, setSalaryAmount] = useState('');
  const [month, setMonth] = useState(new Date());
  const [payslip, setPayslip] = useState(null);

  // Transaction Form state
  const [txAmount, setTxAmount] = useState('');
  const [txCategory, setTxCategory] = useState('סופרמרקט');
  const [txDescription, setTxDescription] = useState('');
  const [txDate, setTxDate] = useState(new Date());
  const [txProjectId, setTxProjectId] = useState('');
  const [selectedProject, setSelectedProject] = useState(null);
  useEffect(() => {
    const expireSession = () => {
      setIsAuthenticated(false); setCurrentUser('מערכת'); setTransactions([]); setSalaries([]); setProjects([]); setInvestments([]); setAuditLogs([]);
      setActiveTab('home'); setIsSalaryModalOpen(false); setIsTransactionModalOpen(false); setIsInvestmentModalOpen(false); setPreviewPayslipUrl(null); setSelectedProject(null);
      setConfirmConfig(prev => ({ ...prev, isOpen: false })); setPromptConfig(prev => ({ ...prev, isOpen: false }));
    };
    window.addEventListener('shared-account-auth-expired', expireSession);
    return () => window.removeEventListener('shared-account-auth-expired', expireSession);
  }, []);

  const [editingTransaction, setEditingTransaction] = useState(null);

  const CATEGORIES = [
    'סופרמרקט', 'מסעדות ופנאי', 'רכב', 'קניות מחנויות אונליין',
    'פארם/בריאות', 'לבית', 'חשבונות', 'תחבורה ציבורית',
    'חופשות וחו"ל', 'ביטוחים', 'אירועים ומתנות', 'העברות אישיות ושונות',
    'הפרשות מיוחדות', 'כללי'
  ];

  const updatePortfoliosBackground = async (investmentsData) => {
    const portfolios = investmentsData.filter(inv => inv.type === 'חשבון מסחר');
    if (portfolios.length > 0) {
      const results = await Promise.all(portfolios.map(async p => {
        try {
          const pRes = await authenticatedFetch(`/api/portfolio?investment_id=${p.id}`);
          if (pRes.ok) {
            const pData = await pRes.json();
            return { id: p.id, value: pData.portfolioValue };
          }
        } catch (e) {
          console.error("Failed to update portfolio", p.id, e);
        }
        return null;
      }));

      setInvestments(prev => {
        let changed = false;
        const updated = prev.map(inv => {
          const update = results.find(r => r && r.id === inv.id);
          if (update && parseFloat(inv.current_value || 0) !== update.value) {
            changed = true;
            return { ...inv, current_value: update.value.toString() };
          }
          return inv;
        });
        return changed ? updated : prev;
      });
    }
  };

  const fetchInvestments = async () => {
    try {
      const res = await authenticatedFetch('/api/investments');
      if (res.ok) {
        const data = await res.json();
        setInvestments(data);
        updatePortfoliosBackground(data);
      }
    } catch (err) {
      console.error(err);
    }
  };

  useEffect(() => {
    if (!isAuthenticated) return;
    const controller = new AbortController();
    let current = true;
    const timeout = setTimeout(() => controller.abort(), 15000);
    // Loading starts only after the server has confirmed the session.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setLoading(true);
    setDataError('');
    loadDashboardData({ signal: controller.signal })
      .then(({ transactions, salaries, projects, investments }) => {
        if (!current) return;
        setTransactions(transactions);
        setSalaries(salaries);
        setProjects(projects);
        setInvestments(investments);
        updatePortfoliosBackground(investments);
      })
      .catch(() => {
        if (current) setDataError('לא ניתן לטעון את נתוני החשבון. בדקו את החיבור ונסו שוב.');
      })
      .finally(() => {
        clearTimeout(timeout);
        if (current) setLoading(false);
      });
    return () => { current = false; clearTimeout(timeout); controller.abort(); };
  }, [isAuthenticated, dataRetry]);

  const fetchAuditLogs = async () => {
    try {
      const res = await authenticatedFetch('/api/audit_logs');
      if (res.ok) {
        setAuditLogs(await res.json());
      }
    } catch (err) {
      console.error("Error fetching audit logs:", err);
    }
  };

  useEffect(() => {
    if (activeTab === 'audit') {
      // Entering this page starts its external audit-log synchronization.
      // eslint-disable-next-line react-hooks/set-state-in-effect
      fetchAuditLogs();
    }
  }, [activeTab]);

  const handleAddSalary = async (e) => {
    e.preventDefault();
    const formData = new FormData();
    formData.append('person_name', personName);
    formData.append('amount', salaryAmount);

    const y = month.getFullYear();
    const m = String(month.getMonth() + 1).padStart(2, '0');
    const d = String(month.getDate()).padStart(2, '0');
    formData.append('month', `${y}-${m}-${d}`);

    if (payslip) {
      formData.append('payslip', payslip);
    }

    try {
      const res = await authenticatedFetch('/api/salaries', {
        method: 'POST',
        headers: {
          'x-performed-by': encodeURIComponent(currentUser)
        },
        body: formData,
      });
      if (res.ok) {
        const newSalary = await res.json();
        setSalaries([newSalary, ...salaries]);
        const txRes = await authenticatedFetch('/api/transactions');
        if (txRes.ok) setTransactions(await txRes.json());
        setIsSalaryModalOpen(false);
        setSalaryAmount('');
        setPayslip(null);
      }
    } catch (err) {
      console.error("Error saving salary:", err);
    }
  };

  const handleAddTransaction = async (e) => {
    e.preventDefault();

    const y = txDate.getFullYear();
    const m = String(txDate.getMonth() + 1).padStart(2, '0');
    const d = String(txDate.getDate()).padStart(2, '0');

    try {
      if (editingTransaction) {
        // PUT request
        const res = await authenticatedFetch('/api/transactions', {
          method: 'PUT',
          headers: {
            'Content-Type': 'application/json',
            'x-performed-by': encodeURIComponent(currentUser)
          },
          body: JSON.stringify({
            id: editingTransaction.id,
            amount: parseFloat(txAmount),
            description: txDescription,
            category: txCategory,
            type: editingTransaction.type,
            date: `${y}-${m}-${d}`,
            project_id: txProjectId ? parseInt(txProjectId) : null
          }),
        });
        if (res.ok) {
          const updatedTx = await res.json();
          setTransactions(transactions.map(t => t.id === updatedTx.id ? updatedTx : t).sort((a, b) => new Date(b.date) - new Date(a.date)));
          setIsTransactionModalOpen(false);
          setEditingTransaction(null);
          setTxAmount('');
          setTxDescription('');
          setTxProjectId('');
        }
      } else {
        // POST request
        const res = await authenticatedFetch('/api/transactions', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'x-performed-by': encodeURIComponent(currentUser)
          },
          body: JSON.stringify({
            amount: parseFloat(txAmount),
            description: txDescription,
            category: txCategory,
            type: 'expense',
            date: `${y}-${m}-${d}`,
            project_id: txProjectId ? parseInt(txProjectId) : null
          }),
        });
        if (res.ok) {
          const newTx = await res.json();
          setTransactions([newTx, ...transactions].sort((a, b) => new Date(b.date) - new Date(a.date)));
          setIsTransactionModalOpen(false);
          setTxAmount('');
          setTxDescription('');
          setTxProjectId('');
        }
      }
    } catch (err) {
      console.error("Error saving transaction:", err);
    }
  };

  const startEditTransaction = (t) => {
    setEditingTransaction(t);
    setTxAmount(t.amount.toString());
    setTxDescription(t.description || '');
    setTxCategory(t.category);
    setTxDate(new Date(t.date));
    setTxProjectId(t.project_id ? t.project_id.toString() : '');
    setIsTransactionModalOpen(true);
  };

  const handleDeleteTransaction = async (id) => {
    showConfirm("האם אתם בטוחים שברצונכם למחוק תנועה זו לצמיתות?", async () => {
      try {
        const res = await authenticatedFetch(`/api/transactions?id=${id}`, {
          method: 'DELETE',
          headers: {
            'x-performed-by': encodeURIComponent(currentUser)
          }
        });
        if (res.ok) {
          setTransactions(transactions.filter(t => t.id !== id));
          showToast("התנועה נמחקה בהצלחה!");
        } else {
          showToast("שגיאה במחיקת התנועה", "error");
        }
      } catch (err) {
        console.error("Error deleting transaction:", err);
        showToast("שגיאה במחיקת התנועה", "error");
      }
    });
  };

  const handleDeletePayslip = async (id) => {
    showConfirm("האם אתם בטוחים שברצונכם למחוק תלוש שכר ומשכורת זו לצמיתות?", async () => {
      try {
        const res = await authenticatedFetch(`/api/salaries?id=${id}`, {
          method: 'DELETE',
          headers: {
            'x-performed-by': encodeURIComponent(currentUser)
          }
        });
        if (res.ok) {
          setSalaries(salaries.filter(s => s.id !== id));
          // Refresh transactions to ensure the auto-added income transaction is also removed locally
          const txRes = await authenticatedFetch('/api/transactions');
          if (txRes.ok) {
            const data = await txRes.json();
            setTransactions(data);
          }
          showToast("תלוש השכר והמשכורת נמחקו בהצלחה!");
        } else {
          showToast("שגיאה במחיקת תלוש השכר", "error");
        }
      } catch (err) {
        console.error("Error deleting salary:", err);
        showToast("שגיאה במחיקת תלוש השכר", "error");
      }
    });
  };

  const handleSaveInvestment = async (e) => {
    e.preventDefault();
    try {
      const payload = {
        name: invName.trim(),
        type: invType,
        owner_name: invOwnerName,
        current_value: parseFloat(invCurrentValue),
        initial_value: parseFloat(invInitialValue),
        monthly_addition: parseFloat(invMonthlyAddition) || 0,
        interest_type: invType === 'פיקדון' ? invInterestType : null,
        interest_value: invType === 'פיקדון' ? (parseFloat(invInterestValue) || 0) : null
      };

      if (editingInvestment) {
        payload.id = editingInvestment.id;
        const res = await authenticatedFetch('/api/investments', {
          method: 'PUT',
          headers: {
            'Content-Type': 'application/json',
            'x-performed-by': encodeURIComponent(currentUser)
          },
          body: JSON.stringify(payload)
        });
        if (res.ok) {
          const updated = await res.json();
          setInvestments(investments.map(inv => inv.id === updated.id ? updated : inv));
          showToast("ההשקעה עודכנה בהצלחה!");
          setIsInvestmentModalOpen(false);
          setEditingInvestment(null);
        } else {
          showToast("שגיאה בעדכון ההשקעה", "error");
        }
      } else {
        const res = await authenticatedFetch('/api/investments', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'x-performed-by': encodeURIComponent(currentUser)
          },
          body: JSON.stringify(payload)
        });
        if (res.ok) {
          const created = await res.json();
          setInvestments([...investments, created]);
          showToast("ההשקעה נוספה בהצלחה!");
          setIsInvestmentModalOpen(false);
        } else {
          showToast("שגיאה בהוספת ההשקעה", "error");
        }
      }
    } catch (err) {
      console.error(err);
      showToast("שגיאה בשמירת ההשקעה", "error");
    }
  };

  const handleDeleteInvestment = async (id) => {
    showConfirm("האם אתם בטוחים שברצונכם למחוק השקעה זו לצמיתות?", async () => {
      try {
        const res = await authenticatedFetch(`/api/investments?id=${id}`, {
          method: 'DELETE',
          headers: {
            'x-performed-by': encodeURIComponent(currentUser)
          }
        });
        if (res.ok) {
          setInvestments(investments.filter(inv => inv.id !== id));
          showToast("ההשקעה נמחקה בהצלחה!");
        } else {
          showToast("שגיאה במחיקת ההשקעה", "error");
        }
      } catch (err) {
        console.error(err);
        showToast("שגיאה במחיקת ההשקעה", "error");
      }
    });
  };

  const handleDeleteProject = async (id) => {
    showConfirm("האם אתם בטוחים שברצונכם למחוק פרויקט זה? כל התנועות המקושרות אליו יישארו במערכת אך לא יהיו מקושרות יותר לפרויקט.", async () => {
      try {
        const res = await authenticatedFetch(`/api/projects?id=${id}`, {
          method: 'DELETE',
          headers: {
            'x-performed-by': encodeURIComponent(currentUser)
          }
        });
        if (res.ok) {
          setProjects(projects.filter(p => p.id !== id));
          setTransactions(transactions.map(t => t.project_id === id ? { ...t, project_id: null, project_name: null } : t));
          setSelectedProject(null);
          showToast("הפרויקט נמחק בהצלחה!");
        } else {
          showToast("שגיאה במחיקת הפרויקט", "error");
        }
      } catch (err) {
        console.error(err);
        showToast("שגיאה במחיקת הפרויקט", "error");
      }
    });
  };

  // Available months for charts filtering
  const availableMonths = useMemo(() => {
    const months = new Set();
    transactions.forEach(t => {
      const date = new Date(t.date);
      const key = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
      months.add(key);
    });
    const now = new Date();
    const currentKey = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
    months.add(currentKey);

    return Array.from(months).sort().reverse(); // Newest first
  }, [transactions]);

  // Initialize comparison months
  useEffect(() => {
    if (availableMonths.length > 0) {
      if (!compareMonthA) {
        // Initialize the selection once the loaded transactions establish available months.
        // eslint-disable-next-line react-hooks/set-state-in-effect
        setCompareMonthA(availableMonths[1] || availableMonths[0]);
      }
      if (!compareMonthB) {
        setCompareMonthB(availableMonths[0]);
      }
    }
  }, [availableMonths, compareMonthA, compareMonthB]);

  // Pie Chart data (filtered by selectedChartMonth)
  const pieData = useMemo(() => {
    const expenseByCategory = {};
    let hasExpenses = false;

    transactions.forEach(t => {
      const date = new Date(t.date);
      const monthKey = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;

      if (monthKey === selectedChartMonth && t.type === 'expense') {
        expenseByCategory[t.category] = (expenseByCategory[t.category] || 0) + Number(t.amount);
        hasExpenses = true;
      }
    });

    return {
      hasExpenses,
      labels: Object.keys(expenseByCategory),
      datasets: [
        {
          data: Object.values(expenseByCategory),
          backgroundColor: [
            '#ef4444', '#f97316', '#f59e0b', '#84cc16',
            '#06b6d4', '#3b82f6', '#8b5cf6', '#d946ef',
            '#ec4899', '#f43f5e', '#14b8a6', '#64748b',
            '#a855f7', '#0ea5e9'
          ],
          borderWidth: 2,
          borderColor: '#ffffff',
        },
      ],
    };
  }, [transactions, selectedChartMonth]);

  // Bar Chart data
  const trendData = useMemo(() => {
    const monthlyData = {};

    transactions.forEach(t => {
      const date = new Date(t.date);
      const monthKey = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
      if (!monthlyData[monthKey]) {
        monthlyData[monthKey] = { income: 0, expense: 0 };
      }
      monthlyData[monthKey][t.type] += Number(t.amount);
    });

    const sortedMonths = Object.keys(monthlyData).sort();

    const formatLabel = (key) => {
      const [year, mon] = key.split('-');
      return `${HEBREW_MONTHS[parseInt(mon) - 1]} ${year.slice(2)}`;
    };

    return {
      labels: sortedMonths.slice(-12).map(formatLabel),
      datasets: [
        {
          label: 'הכנסות',
          data: sortedMonths.slice(-12).map(m => monthlyData[m].income),
          backgroundColor: '#10b981',
          borderRadius: 4,
        },
        {
          label: 'הוצאות',
          data: sortedMonths.slice(-12).map(m => monthlyData[m].expense),
          backgroundColor: '#ef4444',
          borderRadius: 4,
        },
      ],
    };
  }, [transactions]);

  // Available years for annual chart filtering
  const availableYears = useMemo(() => {
    const years = new Set();
    transactions.forEach(t => {
      years.add(new Date(t.date).getFullYear());
    });
    years.add(new Date().getFullYear());
    return Array.from(years).sort().reverse();
  }, [transactions]);

  // Annual Data calculation
  const annualData = useMemo(() => {
    let yearIncome = 0;
    let yearExpenses = 0;
    const monthlyIncome = Array(12).fill(0);
    const monthlyExpenses = Array(12).fill(0);
    const categorySpend = {};

    transactions.forEach(t => {
      const d = new Date(t.date);
      if (d.getFullYear() === selectedYear) {
        const amt = Number(t.amount);
        const m = d.getMonth(); // 0-11
        if (t.type === 'expense') {
          yearExpenses += amt;
          monthlyExpenses[m] += amt;
          categorySpend[t.category] = (categorySpend[t.category] || 0) + amt;
        } else {
          yearIncome += amt;
          monthlyIncome[m] += amt;
        }
      }
    });

    const averageMonthlyExpenses = yearExpenses / 12;
    const averageMonthlyIncome = yearIncome / 12;
    const savings = yearIncome - yearExpenses;
    const savingsRate = yearIncome > 0 ? (savings / yearIncome) * 100 : 0;

    return {
      yearIncome,
      yearExpenses,
      savings,
      savingsRate,
      averageMonthlyExpenses,
      averageMonthlyIncome,
      monthlyIncome,
      monthlyExpenses,
      categorySpend
    };
  }, [transactions, selectedYear]);

  // Annual Chart data
  const annualChartData = useMemo(() => {
    return {
      labels: HEBREW_MONTHS,
      datasets: [
        {
          label: 'הכנסות',
          data: annualData.monthlyIncome,
          backgroundColor: '#10b981',
          borderRadius: 4,
        },
        {
          label: 'הוצאות',
          data: annualData.monthlyExpenses,
          backgroundColor: '#ef4444',
          borderRadius: 4,
        }
      ]
    };
  }, [annualData]);

  // Month-over-Month Comparison data
  const comparisonData = useMemo(() => {
    if (!compareMonthA || !compareMonthB) return null;

    const dataA = {};
    const dataB = {};
    let totalExpensesA = 0;
    let totalExpensesB = 0;
    let totalIncomeA = 0;
    let totalIncomeB = 0;

    transactions.forEach(t => {
      const d = new Date(t.date);
      const mk = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
      const amt = Number(t.amount);

      if (mk === compareMonthA) {
        if (t.type === 'expense') {
          dataA[t.category] = (dataA[t.category] || 0) + amt;
          totalExpensesA += amt;
        } else {
          totalIncomeA += amt;
        }
      }
      if (mk === compareMonthB) {
        if (t.type === 'expense') {
          dataB[t.category] = (dataB[t.category] || 0) + amt;
          totalExpensesB += amt;
        } else {
          totalIncomeB += amt;
        }
      }
    });

    // Merge categories to show compared side-by-side
    const allCategories = Array.from(new Set([...Object.keys(dataA), ...Object.keys(dataB)]));

    // Sort categories by higher combined spend
    allCategories.sort((cat1, cat2) => ((dataB[cat2] || 0) + (dataA[cat2] || 0)) - ((dataB[cat1] || 0) + (dataA[cat1] || 0)));

    return {
      allCategories,
      dataA,
      dataB,
      totalExpensesA,
      totalExpensesB,
      totalIncomeA,
      totalIncomeB
    };
  }, [transactions, compareMonthA, compareMonthB]);

  // Comparison Chart Data
  const comparisonChartData = useMemo(() => {
    if (!comparisonData) return null;

    const formatMonthLabel = (key) => {
      if (!key) return '';
      const [year, mon] = key.split('-');
      return `${HEBREW_MONTHS[parseInt(mon) - 1]} ${year.slice(2)}`;
    };

    const categories = comparisonData.allCategories.slice(0, 10); // Show top 10 categories
    const valuesA = categories.map(cat => comparisonData.dataA[cat] || 0);
    const valuesB = categories.map(cat => comparisonData.dataB[cat] || 0);

    return {
      labels: categories,
      datasets: [
        {
          label: formatMonthLabel(compareMonthA),
          data: valuesA,
          backgroundColor: '#3b82f6',
          borderRadius: 4,
        },
        {
          label: formatMonthLabel(compareMonthB),
          data: valuesB,
          backgroundColor: '#06b6d4',
          borderRadius: 4,
        }
      ]
    };
  }, [comparisonData, compareMonthA, compareMonthB]);

  const latestLiorBen = salaries.find(s => s.person_name === 'ליאור הבן');
  const latestLiorBat = salaries.find(s => s.person_name === 'ליאור הבת');

  // Summary data
  const summary = useMemo(() => {
    const now = new Date();
    const currentMonth = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
    let monthExpenses = 0;
    let monthIncome = 0;
    let totalIncome = 17535; // Initial balance before all this
    let totalExpenses = 0;
    transactions.forEach(t => {
      const d = new Date(t.date);
      const mk = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
      if (t.type === 'expense') totalExpenses += Number(t.amount);
      else totalIncome += Number(t.amount);
      if (mk === currentMonth) {
        if (t.type === 'expense') monthExpenses += Number(t.amount);
        else monthIncome += Number(t.amount);
      }
    });
    const totalBalance = totalIncome - totalExpenses;
    return { monthExpenses, monthIncome, totalBalance };
  }, [transactions]);

  const urlBase64ToUint8Array = (base64String) => {
    const padding = '='.repeat((4 - base64String.length % 4) % 4);
    const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/');
    const rawData = window.atob(base64);
    const outputArray = new Uint8Array(rawData.length);
    for (let i = 0; i < rawData.length; ++i) {
      outputArray[i] = rawData.charCodeAt(i);
    }
    return outputArray;
  };

  const handleSubscribePush = async () => {
    if (!('serviceWorker' in navigator) || !('PushManager' in window)) {
      showToast('כדי לקבל פוש ב־iPhone, הוסיפו את האתר למסך הבית ופתחו אותו משם. במכשירים אחרים נדרש דפדפן תומך.', 'error');
      return;
    }
    try {
      // Must request permission BEFORE any other await to preserve user gesture in iOS Safari
      const permission = await Notification.requestPermission();
      if (permission !== 'granted') {
        showToast('יש לאשר קבלת התראות בדפדפן', 'error');
        return;
      }

      await navigator.serviceWorker.register('/sw.js');
      const registration = await navigator.serviceWorker.ready;

      const existingSubscription = await registration.pushManager.getSubscription();
      if (existingSubscription) {
        await existingSubscription.unsubscribe();
      }

      const vapidRes = await authenticatedFetch('/api/vapid-public-key');
      const { publicKey } = await vapidRes.json();
      const convertedVapidKey = urlBase64ToUint8Array(publicKey);
      const subscription = await registration.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: convertedVapidKey
      });

      const subJson = subscription.toJSON ? subscription.toJSON() : {
        endpoint: subscription.endpoint,
        keys: {
          p256dh: subscription.getKey ? btoa(String.fromCharCode.apply(null, new Uint8Array(subscription.getKey('p256dh')))) : '',
          auth: subscription.getKey ? btoa(String.fromCharCode.apply(null, new Uint8Array(subscription.getKey('auth')))) : ''
        }
      };

      const res = await authenticatedFetch('/api/push-subscribe', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(subJson)
      });
      if (res.ok) {
        showToast('התראות פעילות: סיכום יומי ומחקר מניות כל 8 שעות.');
      } else {
        const errText = await res.text();
        showToast(`שגיאה בהרשמה: ${errText}`, 'error');
      }
    } catch (error) {
      console.error(error);
      showToast(`שגיאה בהגדרת התראות: ${error.message || 'אנא בדוק שהדפדפן והמכשיר מאפשרים התראות'}`, 'error');
    }
  };

  // =================== RENDER ===================
  const renderHome = () => (
    <div className="home-tab fade-in">
      <div className="home-heading">
        <h2 className="tab-title" style={{ margin: 0 }}>ניהול חשבון משותף</h2>
        <button onClick={handleSubscribePush} className="btn-secondary" style={{ padding: '0.5rem', display: 'flex', alignItems: 'center', gap: '0.25rem', border: '1px solid rgba(255,255,255,0.1)', background: 'rgba(255,255,255,0.05)', borderRadius: '0.5rem', color: 'var(--text-main)', cursor: 'pointer' }}>
           <Bell size={18} />
           <span style={{ fontSize: '0.75rem', fontWeight: 'bold' }}>התראות</span>
        </button>
      </div>

      {/* Monthly summary cards */}
      <div className="summary-grid">
        <div className="summary-card expense-card">
          <div className="summary-icon"><TrendingDown size={28} /></div>
          <div className="summary-label">הוצאות החודש</div>
          <div className="summary-value" dir="ltr">₪{summary.monthExpenses.toLocaleString()}</div>
        </div>
        <div className={`summary-card balance-card-full ${summary.totalBalance >= 0 ? 'bg-income' : 'bg-expense'}`}>
          <div className="summary-icon"><Wallet size={28} /></div>
          <div className="summary-label">יתרת חשבון כוללת</div>
          <div className="summary-value" dir="ltr">₪{summary.totalBalance.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</div>
        </div>
      </div>

      {/* Salary cards */}
      <div className="salaries-section">
        <div className="glass-card salary-card">
          <h3>משכורת אחרונה - ליאור הבן</h3>
          <div className="amount" dir="ltr">₪{latestLiorBen ? Number(latestLiorBen.amount).toLocaleString() : '0'}</div>
          {latestLiorBen?.payslip_url && (
            <button
              onClick={() => setPreviewPayslipUrl(latestLiorBen.payslip_url)}
              className="payslip-link"
              style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 0, font: 'inherit', color: 'var(--income)', display: 'inline-flex', alignItems: 'center', marginTop: '0.4rem', whiteSpace: 'nowrap' }}
            >
              צפה בתלוש משכורת
            </button>
          )}
        </div>
        <div className="glass-card salary-card">
          <h3>משכורת אחרונה - ליאור הבת</h3>
          <div className="amount" dir="ltr">₪{latestLiorBat ? Number(latestLiorBat.amount).toLocaleString() : '0'}</div>
          {latestLiorBat?.payslip_url && (
            <button
              onClick={() => setPreviewPayslipUrl(latestLiorBat.payslip_url)}
              className="payslip-link"
              style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 0, font: 'inherit', color: 'var(--income)', display: 'inline-flex', alignItems: 'center', marginTop: '0.4rem', whiteSpace: 'nowrap' }}
            >
              צפה בתלוש משכורת
            </button>
          )}
        </div>
      </div>

      {/* Action buttons */}
      <div className="action-buttons">
        <button className="action-btn expense-btn" onClick={() => { setEditingTransaction(null); setTxAmount(''); setTxDescription(''); setTxCategory('סופרמרקט'); setTxDate(new Date()); setTxProjectId(''); setIsTransactionModalOpen(true); }}>
          <TrendingDown size={24} />
          <span>הוספת הוצאה</span>
        </button>
        <button className="action-btn income-btn" onClick={() => setIsSalaryModalOpen(true)}>
          <PlusCircle size={24} />
          <span>הוספת משכורת</span>
        </button>
      </div>
    </div>
  );

  const renderCharts = () => {
    const currentIndex = availableMonths.indexOf(selectedChartMonth);
    const isNextDisabled = currentIndex <= 0;
    const isPrevDisabled = currentIndex === -1 || currentIndex >= availableMonths.length - 1;

    const handleNextMonth = () => {
      if (currentIndex > 0) {
        setSelectedChartMonth(availableMonths[currentIndex - 1]);
      }
    };

    const handlePrevMonth = () => {
      if (currentIndex !== -1 && currentIndex < availableMonths.length - 1) {
        setSelectedChartMonth(availableMonths[currentIndex + 1]);
      }
    };

    return (
      <div className="charts-tab fade-in">
        <h2 className="tab-title">ניתוח פיננסי מתקדם</h2>

        {/* Segmented Control for Sub-Tabs */}
        <div className="filter-segmented" style={{ marginBottom: '1.5rem' }}>
          <button
            className={analyticsSubTab === 'monthly' ? 'active' : ''}
            onClick={() => setAnalyticsSubTab('monthly')}
          >
            ניתוח חודשי
          </button>
          <button
            className={analyticsSubTab === 'annual' ? 'active' : ''}
            onClick={() => setAnalyticsSubTab('annual')}
          >
            דשבורד שנתי
          </button>
          <button
            className={analyticsSubTab === 'comparison' ? 'active' : ''}
            onClick={() => setAnalyticsSubTab('comparison')}
          >
            השוואת חודשים
          </button>
        </div>

        {/* 1. Monthly Tab */}
        {analyticsSubTab === 'monthly' && (
          <div className="fade-in">
            {/* Monthly Trend (12 Months) Card */}
            <div className="glass-card chart-card">
              <h3 className="chart-title">מגמת הכנסות והוצאות (12 חודשים אחרונים)</h3>
              <div className="chart-container">
                <Bar
                  data={trendData}
                  options={{
                    responsive: true,
                    maintainAspectRatio: false,
                    scales: {
                      y: { grid: { color: 'rgba(0,0,0,0.05)' }, ticks: { color: '#64748b' } },
                      x: { grid: { display: false }, ticks: { color: '#64748b', font: { size: 11 } } }
                    },
                    plugins: {
                      legend: {
                        rtl: true,
                        labels: { color: '#1e293b', font: { family: 'Heebo', size: 12 }, boxWidth: 12, padding: 10 }
                      },
                      tooltip: { rtl: true, textDirection: 'rtl', bodyAlign: 'right', titleAlign: 'right' }
                    }
                  }}
                />
              </div>
            </div>

            {/* Category distribution */}
            <div className="glass-card chart-card">
              <h3 className="chart-title" style={{ marginBottom: '0.75rem' }}>התפלגות הוצאות לקטגוריות</h3>

              <div className="month-selector-bar" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '1.5rem', background: 'rgba(0, 0, 0, 0.03)', borderRadius: '12px', padding: '0.4rem 0.8rem', border: '1px solid var(--border-color)' }}>
                <button
                  onClick={handlePrevMonth}
                  disabled={isPrevDisabled}
                  className="month-nav-btn" aria-label="חודש קודם"
                  style={{ display: 'flex', alignItems: 'center', background: 'none', border: 'none', color: isPrevDisabled ? 'var(--text-muted)' : 'var(--text-main)', opacity: isPrevDisabled ? 0.3 : 1, cursor: isPrevDisabled ? 'not-allowed' : 'pointer', padding: '6px' }}
                >
                  <ChevronRight size={20} />
                </button>

                <select
                  aria-label="חודש לניתוח"
                  value={selectedChartMonth}
                  onChange={(e) => setSelectedChartMonth(e.target.value)}
                  style={{
                    fontFamily: 'Heebo',
                    fontSize: '0.95rem',
                    fontWeight: '600',
                    color: 'var(--text-main)',
                    background: 'none',
                    border: 'none',
                    textAlign: 'center',
                    cursor: 'pointer',
                    outline: 'none',
                    direction: 'rtl',
                    width: 'auto',
                    padding: '0 1rem'
                  }}
                >
                  {availableMonths.map(m => {
                    const [year, mon] = m.split('-');
                    const label = `${HEBREW_MONTHS[parseInt(mon) - 1]} ${year}`;
                    return <option key={m} value={m}>{label}</option>;
                  })}
                </select>

                <button
                  onClick={handleNextMonth}
                  disabled={isNextDisabled}
                  className="month-nav-btn" aria-label="חודש הבא"
                  style={{ display: 'flex', alignItems: 'center', background: 'none', border: 'none', color: isNextDisabled ? 'var(--text-muted)' : 'var(--text-main)', opacity: isNextDisabled ? 0.3 : 1, cursor: isNextDisabled ? 'not-allowed' : 'pointer', padding: '6px' }}
                >
                  <ChevronLeft size={20} />
                </button>
              </div>

              <div className="chart-container pie-container">
                {pieData.hasExpenses ? (
                  <Pie
                    data={pieData}
                    options={{
                      responsive: true,
                      maintainAspectRatio: false,
                      plugins: {
                        legend: {
                          position: 'bottom',
                          rtl: true,
                          labels: { color: '#1e293b', font: { family: 'Heebo', size: 11 }, boxWidth: 10, padding: 8 }
                        },
                        tooltip: { rtl: true, textDirection: 'rtl', bodyAlign: 'right', titleAlign: 'right' }
                      }
                    }}
                  />
                ) : (
                  <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', height: '100%', color: 'var(--text-muted)', minHeight: '200px' }}>
                    <TrendingDown size={40} style={{ opacity: 0.3, marginBottom: '0.5rem' }} />
                    <p>אין הוצאות מתועדות בחודש זה</p>
                  </div>
                )}
              </div>
            </div>
          </div>
        )}

        {/* 2. Annual Tab */}
        {analyticsSubTab === 'annual' && (
          <div className="fade-in">
            {/* Year Selector */}
            <div className="glass-card" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '1rem', padding: '0.8rem 1.2rem' }}>
              <span style={{ fontWeight: '700', fontSize: '1rem' }}>בחירת שנת ניתוח:</span>
              <select
                aria-label="שנת ניתוח"
                value={selectedYear}
                onChange={(e) => setSelectedYear(Number(e.target.value))}
                style={{
                  width: 'auto',
                  minWidth: '100px',
                  padding: '0.4rem 2rem 0.4rem 1rem',
                  fontSize: '0.95rem',
                  fontWeight: '600'
                }}
              >
                {availableYears.map(y => (
                  <option key={y} value={y}>{y}</option>
                ))}
              </select>
            </div>

            {/* Annual Summary Stats Grid */}
            <div className="summary-grid" style={{ gridTemplateColumns: 'repeat(2, 1fr)', gap: '0.75rem', marginBottom: '1rem' }}>
              <div className="summary-card" style={{ padding: '1rem 0.5rem' }}>
                <div className="summary-label" style={{ fontSize: '0.75rem' }}>סה"כ הכנסות {selectedYear}</div>
                <div className="summary-value" style={{ color: 'var(--income)', fontSize: '1.2rem' }} dir="ltr">₪{annualData.yearIncome.toLocaleString()}</div>
                <div style={{ fontSize: '0.7rem', color: 'var(--text-muted)', marginTop: '0.2rem' }}>ממוצע חודשי: ₪{Math.round(annualData.averageMonthlyIncome).toLocaleString()}</div>
              </div>
              <div className="summary-card" style={{ padding: '1rem 0.5rem' }}>
                <div className="summary-label" style={{ fontSize: '0.75rem' }}>סה"כ הוצאות {selectedYear}</div>
                <div className="summary-value" style={{ color: 'var(--expense)', fontSize: '1.2rem' }} dir="ltr">₪{annualData.yearExpenses.toLocaleString()}</div>
                <div style={{ fontSize: '0.7rem', color: 'var(--text-muted)', marginTop: '0.2rem' }}>ממוצע חודשי: ₪{Math.round(annualData.averageMonthlyExpenses).toLocaleString()}</div>
              </div>
              <div className="summary-card" style={{ padding: '1rem 0.5rem' }}>
                <div className="summary-label" style={{ fontSize: '0.75rem' }}>חיסכון שנתי מצטבר</div>
                <div className="summary-value" style={{ color: annualData.savings >= 0 ? 'var(--income)' : 'var(--expense)', fontSize: '1.2rem' }} dir="ltr">₪{annualData.savings.toLocaleString()}</div>
              </div>
              <div className="summary-card" style={{ padding: '1rem 0.5rem', display: 'flex', flexDirection: 'column', justifyContent: 'center' }}>
                <div className="summary-label" style={{ fontSize: '0.75rem' }}>שיעור חיסכון שנתי</div>
                <div className="summary-value" style={{ color: 'var(--accent)', fontSize: '1.2rem' }} dir="ltr">{annualData.savingsRate.toFixed(1)}%</div>
                <div style={{ width: '80%', height: '4px', background: 'rgba(0,0,0,0.06)', borderRadius: '2px', margin: '0.4rem auto 0', overflow: 'hidden' }}>
                  <div style={{ width: `${Math.max(0, Math.min(100, annualData.savingsRate))}%`, height: '100%', background: 'var(--accent)' }}></div>
                </div>
              </div>
            </div>

            {/* Annual Chart */}
            <div className="glass-card chart-card">
              <h3 className="chart-title">הכנסות מול הוצאות לאורך שנת {selectedYear}</h3>
              <div className="chart-container">
                <Bar
                  data={annualChartData}
                  options={{
                    responsive: true,
                    maintainAspectRatio: false,
                    scales: {
                      y: { grid: { color: 'rgba(0,0,0,0.05)' }, ticks: { color: '#64748b' } },
                      x: { grid: { display: false }, ticks: { color: '#64748b', font: { size: 11 } } }
                    },
                    plugins: {
                      legend: {
                        rtl: true,
                        labels: { color: '#1e293b', font: { family: 'Heebo', size: 12 }, boxWidth: 12, padding: 10 }
                      },
                      tooltip: { rtl: true, textDirection: 'rtl', bodyAlign: 'right', titleAlign: 'right' }
                    }
                  }}
                />
              </div>
            </div>

            {/* Annual Category Breakdown */}
            <div className="glass-card">
              <h3 className="chart-title" style={{ marginBottom: '1rem' }}>פירוט הוצאות שנתיות לפי קטגוריות ({selectedYear})</h3>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
                {Object.keys(annualData.categorySpend).length === 0 ? (
                  <p style={{ textAlign: 'center', color: 'var(--text-muted)', padding: '1rem 0' }}>אין הוצאות מתועדות בשנה זו</p>
                ) : (
                  Object.keys(annualData.categorySpend)
                    .sort((a, b) => annualData.categorySpend[b] - annualData.categorySpend[a])
                    .map(cat => {
                      const amount = annualData.categorySpend[cat];
                      const percentage = annualData.yearExpenses > 0 ? (amount / annualData.yearExpenses) * 100 : 0;
                      return (
                        <div key={cat} style={{ background: 'rgba(0,0,0,0.02)', padding: '0.6rem 0.8rem', borderRadius: '8px', border: '1px solid rgba(0,0,0,0.04)' }}>
                          <div style={{ display: 'flex', justifyContent: 'space-between', fontWeight: '600', fontSize: '0.9rem', marginBottom: '0.25rem' }}>
                            <span>{cat}</span>
                            <span dir="ltr">₪{amount.toLocaleString()} ({percentage.toFixed(0)}%)</span>
                          </div>
                          <div style={{ width: '100%', height: '6px', background: 'rgba(0,0,0,0.05)', borderRadius: '3px', overflow: 'hidden' }}>
                            <div style={{ width: `${percentage}%`, height: '100%', background: 'linear-gradient(90deg, #8b5cf6, #3b82f6)' }}></div>
                          </div>
                        </div>
                      );
                    })
                )}
              </div>
            </div>
          </div>
        )}

        {/* 3. Comparison Tab */}
        {analyticsSubTab === 'comparison' && (
          <div className="fade-in">
            {/* Dropdowns Selection Card */}
            <div className="glass-card" style={{ marginBottom: '1rem', padding: '1rem' }}>
              <h3 className="chart-title" style={{ fontSize: '0.95rem', marginBottom: '1rem' }}>בחירת חודשים להשוואה</h3>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.75rem' }}>
                <div>
                  <label style={{ fontSize: '0.75rem', fontWeight: '700', color: 'var(--text-muted)', display: 'block', marginBottom: '0.3rem' }}>חודש בסיס (א'):</label>
                  <select
                    aria-label="חודש בסיס להשוואה"
                    value={compareMonthA}
                    onChange={(e) => setCompareMonthA(e.target.value)}
                    style={{ fontSize: '0.85rem', padding: '0.5rem 2rem 0.5rem 0.5rem', fontWeight: '600' }}
                  >
                    {availableMonths.map(m => {
                      const [year, mon] = m.split('-');
                      return <option key={m} value={m}>{`${HEBREW_MONTHS[parseInt(mon) - 1]} ${year}`}</option>;
                    })}
                  </select>
                </div>
                <div>
                  <label style={{ fontSize: '0.75rem', fontWeight: '700', color: 'var(--text-muted)', display: 'block', marginBottom: '0.3rem' }}>חודש השוואה (ב'):</label>
                  <select
                    aria-label="חודש להשוואה"
                    value={compareMonthB}
                    onChange={(e) => setCompareMonthB(e.target.value)}
                    style={{ fontSize: '0.85rem', padding: '0.5rem 2rem 0.5rem 0.5rem', fontWeight: '600' }}
                  >
                    {availableMonths.map(m => {
                      const [year, mon] = m.split('-');
                      return <option key={m} value={m}>{`${HEBREW_MONTHS[parseInt(mon) - 1]} ${year}`}</option>;
                    })}
                  </select>
                </div>
              </div>
            </div>

            {comparisonData && (
              <>
                {/* Comparison Overview Cards */}
                <div className="summary-grid" style={{ gridTemplateColumns: 'repeat(3, 1fr)', gap: '0.5rem', marginBottom: '1rem' }}>
                  {/* Income comparison */}
                  <div className="summary-card" style={{ padding: '0.8rem 0.3rem', display: 'flex', flexDirection: 'column', justifyContent: 'center' }}>
                    <div className="summary-label" style={{ fontSize: '0.7rem' }}>הפרש הכנסות</div>
                    {(() => {
                      const diff = comparisonData.totalIncomeB - comparisonData.totalIncomeA;
                      const sign = diff > 0 ? '+' : '';
                      const color = diff > 0 ? 'var(--income)' : (diff < 0 ? 'var(--expense)' : 'var(--text-muted)');
                      return (
                        <div className="summary-value" style={{ color, fontSize: '0.95rem' }} dir="ltr">
                          {sign}₪{diff.toLocaleString()}
                        </div>
                      );
                    })()}
                    <div style={{ fontSize: '0.65rem', color: 'var(--text-muted)', marginTop: '0.2rem' }}>
                      ב': ₪{Math.round(comparisonData.totalIncomeB).toLocaleString()} | א': ₪{Math.round(comparisonData.totalIncomeA).toLocaleString()}
                    </div>
                  </div>

                  {/* Expense comparison */}
                  <div className="summary-card" style={{ padding: '0.8rem 0.3rem', display: 'flex', flexDirection: 'column', justifyContent: 'center' }}>
                    <div className="summary-label" style={{ fontSize: '0.7rem' }}>הפרש הוצאות</div>
                    {(() => {
                      const diff = comparisonData.totalExpensesB - comparisonData.totalExpensesA;
                      const sign = diff > 0 ? '+' : '';
                      // For expenses, a reduction (diff < 0) is GOOD (green), an increase (diff > 0) is BAD (red)
                      const color = diff < 0 ? 'var(--income)' : (diff > 0 ? 'var(--expense)' : 'var(--text-muted)');
                      return (
                        <div className="summary-value" style={{ color, fontSize: '0.95rem' }} dir="ltr">
                          {sign}₪{diff.toLocaleString()}
                        </div>
                      );
                    })()}
                    <div style={{ fontSize: '0.65rem', color: 'var(--text-muted)', marginTop: '0.2rem' }}>
                      ב': ₪{Math.round(comparisonData.totalExpensesB).toLocaleString()} | א': ₪{Math.round(comparisonData.totalExpensesA).toLocaleString()}
                    </div>
                  </div>

                  {/* Net savings comparison */}
                  <div className="summary-card" style={{ padding: '0.8rem 0.3rem', display: 'flex', flexDirection: 'column', justifyContent: 'center' }}>
                    <div className="summary-label" style={{ fontSize: '0.7rem' }}>הפרש חיסכון נטו</div>
                    {(() => {
                      const savingsA = comparisonData.totalIncomeA - comparisonData.totalExpensesA;
                      const savingsB = comparisonData.totalIncomeB - comparisonData.totalExpensesB;
                      const diff = savingsB - savingsA;
                      const sign = diff > 0 ? '+' : '';
                      const color = diff > 0 ? 'var(--income)' : (diff < 0 ? 'var(--expense)' : 'var(--text-muted)');
                      return (
                        <div className="summary-value" style={{ color, fontSize: '0.95rem' }} dir="ltr">
                          {sign}₪{diff.toLocaleString()}
                        </div>
                      );
                    })()}
                    <div style={{ fontSize: '0.65rem', color: 'var(--text-muted)', marginTop: '0.2rem' }}>
                      יעילות החיסכון השתפרה/ירדה
                    </div>
                  </div>
                </div>

                {/* Comparative Chart */}
                <div className="glass-card chart-card">
                  <h3 className="chart-title">השוואת קטגוריות מובילות (א' מול ב')</h3>
                  <div className="chart-container">
                    {comparisonChartData && (
                      <Bar
                        data={comparisonChartData}
                        options={{
                          responsive: true,
                          maintainAspectRatio: false,
                          scales: {
                            y: { grid: { color: 'rgba(0,0,0,0.05)' }, ticks: { color: '#64748b' } },
                            x: { grid: { display: false }, ticks: { color: '#64748b', font: { size: 10 } } }
                          },
                          plugins: {
                            legend: {
                              rtl: true,
                              labels: { color: '#1e293b', font: { family: 'Heebo', size: 11 }, boxWidth: 10, padding: 8 }
                            },
                            tooltip: { rtl: true, textDirection: 'rtl', bodyAlign: 'right', titleAlign: 'right' }
                          }
                        }}
                      />
                    )}
                  </div>
                </div>

                {/* Detailed Table */}
                <div className="glass-card" style={{ padding: '1rem 0.5rem' }}>
                  <h3 className="chart-title" style={{ marginBottom: '1rem' }}>טבלת השוואה מפורטת לפי קטגוריה</h3>
                  <div style={{ overflowX: 'auto' }}>
                    <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'right', fontSize: '0.85rem' }}>
                      <thead>
                        <tr style={{ borderBottom: '2px solid rgba(0,0,0,0.06)', color: 'var(--text-muted)' }}>
                          <th style={{ padding: '0.5rem' }}>קטגוריה</th>
                          <th style={{ padding: '0.5rem', textAlign: 'left' }}>חודש א'</th>
                          <th style={{ padding: '0.5rem', textAlign: 'left' }}>חודש ב'</th>
                          <th style={{ padding: '0.5rem', textAlign: 'left' }}>שינוי (₪)</th>
                          <th style={{ padding: '0.5rem', textAlign: 'center' }}>שינוי (%)</th>
                        </tr>
                      </thead>
                      <tbody>
                        {comparisonData.allCategories.map(cat => {
                          const valA = comparisonData.dataA[cat] || 0;
                          const valB = comparisonData.dataB[cat] || 0;
                          const diff = valB - valA;
                          const pct = valA > 0 ? (diff / valA) * 100 : (valB > 0 ? 100 : 0);

                          // Styling values
                          let diffColor = 'var(--text-main)';
                          let pctLabel = pct === 0 ? '0%' : `${pct > 0 ? '+' : ''}${pct.toFixed(0)}%`;

                          if (diff > 0) {
                            diffColor = 'var(--expense)';
                          } else if (diff < 0) {
                            diffColor = 'var(--income)';
                          }

                          if (valA === 0 && valB === 0) return null;

                          return (
                            <tr key={cat} style={{ borderBottom: '1px solid rgba(0,0,0,0.04)' }}>
                              <td style={{ padding: '0.6rem 0.5rem', fontWeight: '600' }}>{cat}</td>
                              <td style={{ padding: '0.6rem 0.5rem', textAlign: 'left' }} dir="ltr">₪{valA.toLocaleString()}</td>
                              <td style={{ padding: '0.6rem 0.5rem', textAlign: 'left' }} dir="ltr">₪{valB.toLocaleString()}</td>
                              <td style={{ padding: '0.6rem 0.5rem', textAlign: 'left', color: diffColor, fontWeight: '600' }} dir="ltr">
                                {diff > 0 ? '+' : ''}{diff.toLocaleString()}
                              </td>
                              <td style={{ padding: '0.6rem 0.5rem', textAlign: 'center', color: diffColor, fontWeight: '700' }} dir="ltr">
                                {pctLabel}
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                </div>
              </>
            )}
          </div>
        )}
      </div>
    );
  };

  const renderHistory = () => (
    <div className="history-tab fade-in">
      <h2 className="tab-title">היסטוריית תנועות</h2>

      {transactions.length === 0 ? (
        <div className="glass-card" style={{ textAlign: 'center', padding: '3rem 1rem', color: 'var(--text-muted)' }}>
          <p>אין תנועות עדיין</p>
        </div>
      ) : (
        <div className="tx-list">
          {transactions.slice(0, 100).map((t) => (
            <div key={t.id} className={`tx-card ${t.type}`}>
              <div className="tx-card-top">
                <div className="tx-card-right">
                  <div className="tx-category">{t.category}</div>
                  <div className="tx-description">{t.description || '-'}</div>
                </div>
                <div className={`tx-amount ${t.type}`} dir="ltr">
                  {t.type === 'expense' ? '-' : '+'}₪{Number(t.amount).toLocaleString()}
                </div>
              </div>
              <div className="tx-card-bottom">
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', flexWrap: 'wrap' }}>
                  <span className="tx-date">{new Date(t.date).toLocaleDateString('he-IL')}</span>
                  <span className={`badge ${t.type}`}>
                    {t.type === 'income' ? 'הכנסה' : 'הוצאה'}
                  </span>
                  {t.project_name && (
                    <span className="badge" style={{ background: 'rgba(59, 130, 246, 0.12)', color: 'var(--accent)', fontWeight: 'bold', display: 'inline-flex', alignItems: 'center', gap: '3px' }}>
                      📁 {t.project_name}
                    </span>
                  )}
                </div>
                <div className="tx-card-actions" style={{ display: 'flex', gap: '0.5rem' }}>
                  <button
                    onClick={() => startEditTransaction(t)}
                    style={{ background: 'none', border: 'none', color: 'var(--text-muted)', cursor: 'pointer', padding: '4px', display: 'flex', alignItems: 'center' }}
                    title="ערוך"
                  >
                    <Pencil size={16} />
                  </button>
                  <button
                    onClick={() => handleDeleteTransaction(t.id)}
                    style={{ background: 'none', border: 'none', color: '#ef4444', cursor: 'pointer', padding: '4px', display: 'flex', alignItems: 'center' }}
                    title="מחק"
                  >
                    <Trash2 size={16} />
                  </button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );

  const renderPayslips = () => {
    const filteredSalaries = salaries.filter(s => {
      if (payslipFilter === 'all') return true;
      return s.person_name === payslipFilter;
    });

    return (
      <div className="history-tab fade-in">
        <h2 className="tab-title">צפייה בתלושי משכורת</h2>

        {/* Segmented Filter */}
        <div className="filter-segmented">
          <button
            className={payslipFilter === 'all' ? 'active' : ''}
            onClick={() => setPayslipFilter('all')}
          >
            הכל
          </button>
          <button
            className={payslipFilter === 'ליאור הבן' ? 'active' : ''}
            onClick={() => setPayslipFilter('ליאור הבן')}
          >
            ליאור הבן
          </button>
          <button
            className={payslipFilter === 'ליאור הבת' ? 'active' : ''}
            onClick={() => setPayslipFilter('ליאור הבת')}
          >
            ליאור הבת
          </button>
        </div>

        {filteredSalaries.length === 0 ? (
          <div className="glass-card" style={{ textAlign: 'center', padding: '3rem 1rem', color: 'var(--text-muted)' }}>
            <FileText size={48} style={{ marginBottom: '1rem', opacity: 0.5 }} />
            <p>לא נמצאו תלושי שכר עדיין</p>
          </div>
        ) : (
          <div className="payslips-list">
            {filteredSalaries.map(s => {
              const salaryMonth = new Date(s.month);
              const formattedMonth = `${String(salaryMonth.getMonth() + 1).padStart(2, '0')}/${salaryMonth.getFullYear()}`;
              return (
                <div key={s.id} className="payslip-card">
                  <div className="payslip-card-header">
                    <div className="payslip-user">
                      <div className={`user-avatar ${s.person_name === 'ליאור הבן' ? 'ben' : 'bat'}`}>
                        {s.person_name === 'ליאור הבן' ? 'הבן' : 'הבת'}
                      </div>
                      <div className="payslip-user-info">
                        <div className="payslip-name">{s.person_name}</div>
                        <div className="payslip-month">{formattedMonth}</div>
                      </div>
                    </div>
                    <div className="payslip-amount" dir="ltr">₪{parseFloat(s.amount).toLocaleString()}</div>
                  </div>
                  <div className="payslip-card-actions" style={{ display: 'flex', gap: '0.5rem', width: '100%' }}>
                    {s.payslip_url ? (
                      <button
                        onClick={() => setPreviewPayslipUrl(s.payslip_url)}
                        className="btn-view-payslip"
                        style={{ border: 'none', cursor: 'pointer', fontFamily: 'Heebo', flex: 1, display: 'inline-flex', alignItems: 'center', justifyContent: 'center' }}
                      >
                        <Eye size={16} style={{ marginLeft: '6px' }} />
                        צפייה בתלוש
                      </button>
                    ) : (
                      <span className="no-payslip-badge" style={{ flex: 1, display: 'inline-flex', alignItems: 'center', justifyContent: 'center' }}>אין קובץ תלוש</span>
                    )}
                    <button
                      onClick={() => handleDeletePayslip(s.id)}
                      className="btn-delete-payslip"
                      style={{
                        background: 'rgba(239, 68, 68, 0.08)',
                        color: '#ef4444',
                        border: '1px solid rgba(239, 68, 68, 0.2)',
                        borderRadius: '8px',
                        padding: '0.5rem',
                        cursor: 'pointer',
                        display: 'inline-flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        transition: 'all 0.2s ease',
                      }}
                      title="מחק תלוש ומשכורת"
                    >
                      <Trash2 size={16} />
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    );
  };

  const renderProjects = () => {
    return (
      <div className="tab-content fade-in">
        <div className="tab-header-card" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '1rem', flexWrap: 'wrap', marginBottom: '1.5rem' }}>
          <div>
            <h1>פרויקטים ומעקבים</h1>
            <p>ניהול, סיווג ומעקב מרוכז אחר תקציבים מיוחדים ואירועים (למשל: טיול בחו"ל)</p>
          </div>
          <button
            onClick={() => {
              showPrompt('פרויקט חדש', 'הזינו שם לפרויקט החדש (למשל: טיול באיטליה):', async (name) => {
                if (name && name.trim()) {
                  try {
                    const res = await authenticatedFetch('/api/projects', {
                      method: 'POST',
                      headers: {
                        'Content-Type': 'application/json',
                        'x-performed-by': encodeURIComponent(currentUser)
                      },
                      body: JSON.stringify({ name: name.trim() })
                    });
                    if (res.ok) {
                      const newProj = await res.json();
                      setProjects([...projects, newProj].sort((a, b) => a.name.localeCompare(b.name)));
                      showToast("הפרויקט נוסף בהצלחה!");
                    } else {
                      showToast("שגיאה ביצירת הפרויקט", "error");
                    }
                  } catch (err) {
                    console.error("Error creating project:", err);
                    showToast("שגיאה ביצירת הפרויקט", "error");
                  }
                }
              });
            }}
            className="btn"
            style={{ padding: '0.6rem 1.2rem', fontSize: '0.9rem', display: 'flex', alignItems: 'center', gap: '0.5rem', cursor: 'pointer', fontFamily: 'Heebo' }}
          >
            <PlusCircle size={18} />
            פרויקט חדש
          </button>
        </div>

        {projects.length === 0 ? (
          <div className="glass-card" style={{ textAlign: 'center', padding: '4rem 1rem', color: 'var(--text-muted)' }}>
            <Briefcase size={48} style={{ marginBottom: '1rem', opacity: 0.5, color: 'var(--accent)' }} />
            <p style={{ fontSize: '1.1rem', fontWeight: '600', color: 'var(--text-main)' }}>אין פרויקטים מוגדרים במערכת</p>
            <p style={{ fontSize: '0.9rem', marginTop: '0.5rem' }}>צרו פרויקט חדש כדי להתחיל לשייך הוצאות מיוחדות!</p>
          </div>
        ) : (
          <div className="projects-grid" style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(260px, 1fr))', gap: '1.25rem', marginTop: '1rem' }}>
            {projects.map((proj) => {
              const projTxs = transactions.filter(t => t.project_id === proj.id);
              const totalSpent = projTxs.filter(t => t.type === 'expense').reduce((sum, t) => sum + parseFloat(t.amount), 0);

              return (
                <div
                  key={proj.id}
                  className="glass-card project-card"
                  role="button"
                  tabIndex={0}
                  onKeyDown={e => { if (e.target === e.currentTarget && (e.key === 'Enter' || e.key === ' ')) { e.preventDefault(); setSelectedProject(proj); } }}
                  onClick={() => setSelectedProject(proj)}
                  style={{
                    padding: '1.5rem',
                    cursor: 'pointer',
                    transition: 'all 0.2s ease',
                    border: '1px solid rgba(255, 255, 255, 0.08)',
                    display: 'flex',
                    flexDirection: 'column',
                    gap: '1rem',
                    position: 'relative',
                    overflow: 'hidden'
                  }}
                >
                  <div style={{ position: 'absolute', top: 0, left: 0, right: 0, height: '4px', background: 'linear-gradient(90deg, var(--accent), #10b981)' }}></div>

                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                    <h3 style={{ fontSize: '1.2rem', color: 'var(--text-main)', fontWeight: '700', margin: 0 }}>
                      {proj.name}
                    </h3>
                    <span style={{
                      background: 'rgba(59, 130, 246, 0.1)',
                      color: 'var(--accent)',
                      padding: '0.2rem 0.6rem',
                      borderRadius: '12px',
                      fontSize: '0.75rem',
                      fontWeight: '700'
                    }}>
                      {projTxs.length} תנועות
                    </span>
                  </div>

                  <div style={{ display: 'flex', flexDirection: 'column', gap: '0.25rem', marginTop: '0.5rem' }}>
                    <span style={{ fontSize: '0.85rem', color: 'var(--text-muted)' }}>סך הוצאות מקושרות:</span>
                    <span style={{ fontSize: '1.5rem', color: totalSpent === 0 ? '#d97706' : 'var(--expense)', fontWeight: '800' }}>
                      ₪{totalSpent.toLocaleString(undefined, { minimumFractionDigits: 0, maximumFractionDigits: 2 })}
                    </span>
                  </div>

                  <div style={{ borderTop: '1px solid var(--border-color)', paddingTop: '0.75rem', display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: '0.85rem', color: 'var(--text-muted)' }}>
                    <span>תאריך יצירה: {new Date(proj.created_at).toLocaleDateString('he-IL')}</span>
                    <span style={{ display: 'flex', alignItems: 'center', gap: '2px', color: 'var(--accent)', fontWeight: '600' }}>
                      פירוט מלא <ChevronLeft size={16} />
                    </span>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    );
  };

  const renderAuditLogs = () => {
    return (
      <div className="tab-content fade-in">
        <div className="tab-header-card">
          <h1>יומן שינויים</h1>
          <p>תיעוד ומעקב אחר פעולות, עריכות ומחיקות במערכת</p>
        </div>

        {auditLogs.length === 0 ? (
          <div className="glass-card" style={{ textAlign: 'center', padding: '3rem 1rem', color: 'var(--text-muted)' }}>
            <ClipboardList size={48} style={{ marginBottom: '1rem', opacity: 0.5 }} />
            <p>אין פעולות מתועדות ביומן עדיין</p>
          </div>
        ) : (
          <div className="audit-timeline" style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
            {auditLogs.map((log) => {
              // Action color based on action type
              let actionBadgeColor = 'var(--text-muted)';
              let actionBadgeBg = 'rgba(100, 116, 139, 0.1)';
              if (log.action_type === 'מחיקה') {
                actionBadgeColor = 'var(--expense)';
                actionBadgeBg = 'rgba(239, 68, 68, 0.1)';
              } else if (log.action_type === 'הוספה') {
                actionBadgeColor = 'var(--income)';
                actionBadgeBg = 'rgba(16, 185, 129, 0.1)';
              } else if (log.action_type === 'עריכה') {
                actionBadgeColor = 'var(--accent)';
                actionBadgeBg = 'rgba(59, 130, 246, 0.1)';
              }

              // Who performed tag styling
              const isBen = log.performed_by === 'ליאור הבן';
              const userBadgeBg = isBen ? 'rgba(59, 130, 246, 0.15)' : 'rgba(236, 72, 153, 0.15)';
              const userBadgeColor = isBen ? '#3b82f6' : '#ec4899';

              return (
                <div key={log.id} className="glass-card audit-card" style={{ padding: '1.25rem', display: 'flex', flexDirection: 'column', gap: '0.75rem', border: '1px solid rgba(255, 255, 255, 0.08)' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '0.5rem', flexWrap: 'wrap' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                      <span style={{
                        background: actionBadgeBg,
                        color: actionBadgeColor,
                        padding: '0.25rem 0.6rem',
                        borderRadius: '20px',
                        fontSize: '0.8rem',
                        fontWeight: '700'
                      }}>
                        {log.action_type}
                      </span>
                      <span style={{
                        background: userBadgeBg,
                        color: userBadgeColor,
                        padding: '0.25rem 0.6rem',
                        borderRadius: '20px',
                        fontSize: '0.8rem',
                        fontWeight: '700'
                      }}>
                        {log.performed_by}
                      </span>
                    </div>
                    <span style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>
                      {new Date(log.timestamp).toLocaleString('he-IL', {
                        day: 'numeric',
                        month: 'short',
                        year: 'numeric',
                        hour: '2-digit',
                        minute: '2-digit'
                      })}
                    </span>
                  </div>
                  <p style={{ color: 'var(--text-main)', fontSize: '0.95rem', lineHeight: '1.5', fontWeight: '500', margin: 0, textAlign: 'right' }}>
                    {log.description}
                  </p>
                </div>
              );
            })}
          </div>
        )}
      </div>
    );
  };

  const renderInvestments = () => {
    // Filter by owners
    const benInvestments = investments.filter(inv => inv.owner_name === 'ליאור הבן');
    const batInvestments = investments.filter(inv => inv.owner_name === 'ליאור הבת');
    const sharedInvestments = investments.filter(inv => inv.owner_name === 'השקעה משותפת');

    // Sum current values
    const totalBen = benInvestments.reduce((sum, inv) => sum + parseFloat(inv.current_value), 0);
    const totalBat = batInvestments.reduce((sum, inv) => sum + parseFloat(inv.current_value), 0);
    const totalShared = sharedInvestments.reduce((sum, inv) => sum + parseFloat(inv.current_value), 0);

    return (
      <div className="tab-content fade-in">
        <div className="tab-header-card" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '1rem', flexWrap: 'wrap', marginBottom: '1.5rem' }}>
          <div>
            <h1>ניהול ומעקב השקעות</h1>
            <button className="btn-secondary" onClick={() => setActiveTab('research')}>מחקר מניות והצעות לתיק</button>
            <p>מעקב אחר קופות גמל, קרנות השתלמות, פקדונות וחשבונות מסחר של ליאור הבן, ליאור הבת ומשותף</p>
          </div>
          <button
            onClick={() => {
              setEditingInvestment(null);
              setInvName('');
              setInvType('חשבון מסחר');
              setInvOwnerName(currentUser === 'ליאור הבת' ? 'ליאור הבת' : 'ליאור הבן');
              setInvCurrentValue('');
              setInvInitialValue('');
              setInvMonthlyAddition('');
              setInvInterestType('prime');
              setInvInterestValue('');
              setIsInvestmentModalOpen(true);
            }}
            style={{
              padding: '0.6rem 1.2rem',
              fontSize: '0.9rem',
              display: 'flex',
              alignItems: 'center',
              gap: '0.5rem',
              cursor: 'pointer',
              fontFamily: 'Heebo',
              backgroundColor: '#111827',
              color: '#ffffff',
              border: 'none',
              borderRadius: '0.5rem',
              fontWeight: '600'
            }}
          >
            <PlusCircle size={18} />
            השקעה חדשה
          </button>
        </div>

        {/* Aggregate Cards */}
        <div className="summary-grid" style={{ marginBottom: '2rem' }}>
          <div className="glass-card summary-card" style={{ borderColor: 'rgba(59, 130, 246, 0.2)', padding: '1.2rem 1rem', textAlign: 'center' }}>
            <h3 style={{ color: '#3b82f6', fontSize: '0.8rem', fontWeight: '500', marginBottom: '0.25rem' }}>סה"כ השקעות - ליאור הבן</h3>
            <div style={{ color: '#3b82f6', fontSize: '1.4rem', fontWeight: '800' }} dir="ltr">
              ₪{totalBen.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
            </div>
          </div>
          <div className="glass-card summary-card" style={{ borderColor: 'rgba(236, 72, 153, 0.2)', padding: '1.2rem 1rem', textAlign: 'center' }}>
            <h3 style={{ color: '#ec4899', fontSize: '0.8rem', fontWeight: '500', marginBottom: '0.25rem' }}>סה"כ השקעות - ליאור הבת</h3>
            <div style={{ color: '#ec4899', fontSize: '1.4rem', fontWeight: '800' }} dir="ltr">
              ₪{totalBat.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
            </div>
          </div>
          <div className="glass-card summary-card" style={{ borderColor: 'rgba(168, 85, 247, 0.2)', padding: '1.2rem 1rem', textAlign: 'center', gridColumn: '1 / -1' }}>
            <h3 style={{ color: '#a855f7', fontSize: '0.8rem', fontWeight: '500', marginBottom: '0.25rem' }}>סה"כ השקעות - משותף</h3>
            <div style={{ color: '#a855f7', fontSize: '1.4rem', fontWeight: '800' }} dir="ltr">
              ₪{totalShared.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
            </div>
          </div>
        </div>

        {/* Dual lists */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))', gap: '2rem' }}>
          {/* Lior Ben Column */}
          <div className="glass-card" style={{ padding: '1.5rem', background: 'rgba(255, 255, 255, 0.02)' }}>
            <h2 style={{ fontSize: '1.25rem', color: '#3b82f6', marginBottom: '1.25rem', borderBottom: '2px solid rgba(59, 130, 246, 0.2)', paddingBottom: '0.5rem' }}>
              השקעות - ליאור הבן
            </h2>
            {benInvestments.length === 0 ? (
              <p style={{ color: 'var(--text-muted)', textAlign: 'center', padding: '2rem 0' }}>אין השקעות רשומות</p>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                {benInvestments.map(inv => (
                  <div key={inv.id} className="glass-card" style={{ padding: '1rem', border: '1px solid rgba(255, 255, 255, 0.06)', display: 'flex', flexDirection: 'column', gap: '0.5rem', cursor: inv.type === 'חשבון מסחר' ? 'pointer' : 'default' }} onClick={() => { if(inv.type === 'חשבון מסחר') { setActivePortfolioId(inv.id); setActivePortfolioName(inv.name); setActiveTab('portfolio'); } }} role={inv.type === 'חשבון מסחר' ? 'button' : undefined} tabIndex={inv.type === 'חשבון מסחר' ? 0 : undefined} onKeyDown={e => { if (e.target === e.currentTarget && inv.type === 'חשבון מסחר' && (e.key === 'Enter' || e.key === ' ')) { e.preventDefault(); setActivePortfolioId(inv.id); setActivePortfolioName(inv.name); setActiveTab('portfolio'); } }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                      <span style={{ fontWeight: '700', color: 'var(--text-main)' }}>{inv.name}</span>
                      <span style={{ background: 'rgba(59, 130, 246, 0.1)', color: '#3b82f6', padding: '0.2rem 0.5rem', borderRadius: '8px', fontSize: '0.75rem', fontWeight: 'bold' }}>
                        {inv.type}
                      </span>
                    </div>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: '0.25rem' }}>
                      <span style={{ fontSize: '1.25rem', fontWeight: '800', color: 'var(--income)' }} dir="ltr">
                        ₪{parseFloat(inv.current_value).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                      </span>
                      <div style={{ display: 'flex', gap: '0.5rem' }}>
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            setEditingInvestment(inv);
                            setInvName(inv.name);
                            setInvType(inv.type);
                            setInvOwnerName(inv.owner_name);
                            setInvCurrentValue(inv.current_value.toString());
                            setInvInitialValue(inv.initial_value ? inv.initial_value.toString() : '');
                            setInvMonthlyAddition(inv.monthly_addition ? inv.monthly_addition.toString() : '');
                            setInvInterestType(inv.interest_type || 'prime');
                            setInvInterestValue(inv.interest_value !== null ? inv.interest_value.toString() : '');
                            setIsInvestmentModalOpen(true);
                          }}
                          style={{ background: 'none', border: 'none', color: 'var(--text-muted)', cursor: 'pointer', padding: '4px' }}
                          title="ערוך"
                        >
                          <Pencil size={16} />
                        </button>
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            handleDeleteInvestment(inv.id);
                          }}
                          style={{ background: 'none', border: 'none', color: '#ef4444', cursor: 'pointer', padding: '4px' }}
                          title="מחק"
                        >
                          <Trash2 size={16} />
                        </button>
                      </div>
                    </div>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '2px', fontSize: '0.8rem', color: 'var(--text-muted)', marginTop: '0.25rem' }}>
                      {inv.type === 'פיקדון' && inv.current_interest_rate !== undefined && (
                        <span style={{ color: 'var(--text-main)', fontWeight: '600' }}>
                          ריבית שנתית: {inv.current_interest_rate.toFixed(2)}%
                        </span>
                      )}
                      {parseFloat(inv.initial_value) > 0 && (
                        <div>השקעה ראשונית: ₪{parseFloat(inv.initial_value).toLocaleString()}</div>
                      )}
                      {parseFloat(inv.monthly_addition) > 0 && (
                        <div>הפקדה חודשית: ₪{parseFloat(inv.monthly_addition).toLocaleString()}</div>
                      )}
                    </div>
                    <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginTop: '0.25rem' }}>
                      עדכון אחרון: {new Date(inv.updated_at || inv.created_at).toLocaleDateString('he-IL')}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Lior Bat Column */}
          <div className="glass-card" style={{ padding: '1.5rem', background: 'rgba(255, 255, 255, 0.02)' }}>
            <h2 style={{ fontSize: '1.25rem', color: '#ec4899', marginBottom: '1.25rem', borderBottom: '2px solid rgba(236, 72, 153, 0.2)', paddingBottom: '0.5rem' }}>
              השקעות - ליאור הבת
            </h2>
            {batInvestments.length === 0 ? (
              <p style={{ color: 'var(--text-muted)', textAlign: 'center', padding: '2rem 0' }}>אין השקעות רשומות</p>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                {batInvestments.map(inv => (
                  <div key={inv.id} className="glass-card" style={{ padding: '1rem', border: '1px solid rgba(255, 255, 255, 0.06)', display: 'flex', flexDirection: 'column', gap: '0.5rem', cursor: inv.type === 'חשבון מסחר' ? 'pointer' : 'default' }} onClick={() => { if(inv.type === 'חשבון מסחר') { setActivePortfolioId(inv.id); setActivePortfolioName(inv.name); setActiveTab('portfolio'); } }} role={inv.type === 'חשבון מסחר' ? 'button' : undefined} tabIndex={inv.type === 'חשבון מסחר' ? 0 : undefined} onKeyDown={e => { if (e.target === e.currentTarget && inv.type === 'חשבון מסחר' && (e.key === 'Enter' || e.key === ' ')) { e.preventDefault(); setActivePortfolioId(inv.id); setActivePortfolioName(inv.name); setActiveTab('portfolio'); } }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                      <span style={{ fontWeight: '700', color: 'var(--text-main)' }}>{inv.name}</span>
                      <span style={{ background: 'rgba(236, 72, 153, 0.1)', color: '#ec4899', padding: '0.2rem 0.5rem', borderRadius: '8px', fontSize: '0.75rem', fontWeight: 'bold' }}>
                        {inv.type}
                      </span>
                    </div>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: '0.25rem' }}>
                      <span style={{ fontSize: '1.25rem', fontWeight: '800', color: 'var(--income)' }} dir="ltr">
                        ₪{parseFloat(inv.current_value).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                      </span>
                      <div style={{ display: 'flex', gap: '0.5rem' }}>
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            setEditingInvestment(inv);
                            setInvName(inv.name);
                            setInvType(inv.type);
                            setInvOwnerName(inv.owner_name);
                            setInvCurrentValue(inv.current_value.toString());
                            setInvInitialValue(inv.initial_value ? inv.initial_value.toString() : '');
                            setInvMonthlyAddition(inv.monthly_addition ? inv.monthly_addition.toString() : '');
                            setInvInterestType(inv.interest_type || 'prime');
                            setInvInterestValue(inv.interest_value !== null ? inv.interest_value.toString() : '');
                            setIsInvestmentModalOpen(true);
                          }}
                          style={{ background: 'none', border: 'none', color: 'var(--text-muted)', cursor: 'pointer', padding: '4px' }}
                          title="ערוך"
                        >
                          <Pencil size={16} />
                        </button>
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            handleDeleteInvestment(inv.id);
                          }}
                          style={{ background: 'none', border: 'none', color: '#ef4444', cursor: 'pointer', padding: '4px' }}
                          title="מחק"
                        >
                          <Trash2 size={16} />
                        </button>
                      </div>
                    </div>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '2px', fontSize: '0.8rem', color: 'var(--text-muted)', marginTop: '0.25rem' }}>
                      {inv.type === 'פיקדון' && inv.current_interest_rate !== undefined && (
                        <span style={{ color: 'var(--text-main)', fontWeight: '600' }}>
                          ריבית שנתית: {inv.current_interest_rate.toFixed(2)}%
                        </span>
                      )}
                      {parseFloat(inv.initial_value) > 0 && (
                        <div>השקעה ראשונית: ₪{parseFloat(inv.initial_value).toLocaleString()}</div>
                      )}
                      {parseFloat(inv.monthly_addition) > 0 && (
                        <div>הפקדה חודשית: ₪{parseFloat(inv.monthly_addition).toLocaleString()}</div>
                      )}
                    </div>
                    <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginTop: '0.25rem' }}>
                      עדכון אחרון: {new Date(inv.updated_at || inv.created_at).toLocaleDateString('he-IL')}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Shared Column */}
          <div className="glass-card" style={{ padding: '1.5rem', background: 'rgba(255, 255, 255, 0.02)' }}>
            <h2 style={{ fontSize: '1.25rem', color: '#a855f7', marginBottom: '1.25rem', borderBottom: '2px solid rgba(168, 85, 247, 0.2)', paddingBottom: '0.5rem' }}>
              השקעות - משותף
            </h2>
            {sharedInvestments.length === 0 ? (
              <p style={{ color: 'var(--text-muted)', textAlign: 'center', padding: '2rem 0' }}>אין השקעות רשומות</p>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                {sharedInvestments.map(inv => (
                  <div key={inv.id} className="glass-card" style={{ padding: '1rem', border: '1px solid rgba(255, 255, 255, 0.06)', display: 'flex', flexDirection: 'column', gap: '0.5rem', cursor: inv.type === 'חשבון מסחר' ? 'pointer' : 'default' }} onClick={() => { if(inv.type === 'חשבון מסחר') { setActivePortfolioId(inv.id); setActivePortfolioName(inv.name); setActiveTab('portfolio'); } }} role={inv.type === 'חשבון מסחר' ? 'button' : undefined} tabIndex={inv.type === 'חשבון מסחר' ? 0 : undefined} onKeyDown={e => { if (e.target === e.currentTarget && inv.type === 'חשבון מסחר' && (e.key === 'Enter' || e.key === ' ')) { e.preventDefault(); setActivePortfolioId(inv.id); setActivePortfolioName(inv.name); setActiveTab('portfolio'); } }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                      <span style={{ fontWeight: '700', color: 'var(--text-main)' }}>{inv.name}</span>
                      <span style={{ background: 'rgba(168, 85, 247, 0.1)', color: '#a855f7', padding: '0.2rem 0.5rem', borderRadius: '8px', fontSize: '0.75rem', fontWeight: 'bold' }}>
                        {inv.type}
                      </span>
                    </div>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: '0.25rem' }}>
                      <span style={{ fontSize: '1.25rem', fontWeight: '800', color: 'var(--income)' }} dir="ltr">
                        ₪{parseFloat(inv.current_value).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                      </span>
                      <div style={{ display: 'flex', gap: '0.5rem' }}>
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            setEditingInvestment(inv);
                            setInvName(inv.name);
                            setInvType(inv.type);
                            setInvOwnerName(inv.owner_name);
                            setInvCurrentValue(inv.current_value.toString());
                            setInvInitialValue(inv.initial_value ? inv.initial_value.toString() : '');
                            setInvMonthlyAddition(inv.monthly_addition ? inv.monthly_addition.toString() : '');
                            setInvInterestType(inv.interest_type || 'prime');
                            setInvInterestValue(inv.interest_value !== null ? inv.interest_value.toString() : '');
                            setIsInvestmentModalOpen(true);
                          }}
                          style={{ background: 'none', border: 'none', color: 'var(--text-muted)', cursor: 'pointer', padding: '4px' }}
                          title="ערוך"
                        >
                          <Pencil size={16} />
                        </button>
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            handleDeleteInvestment(inv.id);
                          }}
                          style={{ background: 'none', border: 'none', color: '#ef4444', cursor: 'pointer', padding: '4px' }}
                          title="מחק"
                        >
                          <Trash2 size={16} />
                        </button>
                      </div>
                    </div>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '2px', fontSize: '0.8rem', color: 'var(--text-muted)', marginTop: '0.25rem' }}>
                      {inv.type === 'פיקדון' && inv.current_interest_rate !== undefined && (
                        <span style={{ color: 'var(--text-main)', fontWeight: '600' }}>
                          ריבית שנתית: {inv.current_interest_rate.toFixed(2)}%
                        </span>
                      )}
                      {parseFloat(inv.initial_value) > 0 && (
                        <div>השקעה ראשונית: ₪{parseFloat(inv.initial_value).toLocaleString()}</div>
                      )}
                      {parseFloat(inv.monthly_addition) > 0 && (
                        <div>הפקדה חודשית: ₪{parseFloat(inv.monthly_addition).toLocaleString()}</div>
                      )}
                    </div>
                    <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginTop: '0.25rem' }}>
                      עדכון אחרון: {new Date(inv.updated_at || inv.created_at).toLocaleDateString('he-IL')}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>
    );
  };

  if (authChecking || authError) {
    return <div className="pin-screen"><div className="pin-card" role="status">
      <h1 className="pin-title">חשבון משותף</h1>
      {authChecking ? <><div className="loading-spinner" /><p className="pin-status">בודק התחברות...</p></> : <><p className="pin-error-msg">{authError}</p><button style={{ marginTop: '1rem' }} onClick={() => { setAuthChecking(true); setAuthError(''); setAuthRetry(value => value + 1); }}>נסו שוב</button></>}
    </div></div>;
  }

  if (!isAuthenticated) {
    return <PinScreen onSuccess={(user) => {
      setCurrentUser(user);
      setIsAuthenticated(true);
    }} />;
  }

  return (
    <div className="app-shell">
      <a className="skip-link" href="#main-content">דלגו לתוכן הראשי</a>
      <header className="app-header">
        <div className="app-brand">
          <img src="/mutual-logo.svg" alt="mutual" />
          <div><strong>חשבון משותף</strong><span>כל התמונה הפיננסית, במקום אחד</span></div>
        </div>
        <div className="app-account">
          <span className="app-user"><Lock size={14} aria-hidden="true" />{currentUser}</span>
          <button className="logout-button" onClick={async () => {
            try {
              const response = await fetch('/api/auth', { method: 'DELETE', credentials: 'same-origin' });
              if (!response.ok) throw new Error('Sign out failed');
              setIsAuthenticated(false); setCurrentUser('מערכת'); setTransactions([]); setSalaries([]); setProjects([]); setInvestments([]); setAuditLogs([]); setActiveTab('home');
              setIsSalaryModalOpen(false); setIsTransactionModalOpen(false); setIsInvestmentModalOpen(false); setPreviewPayslipUrl(null); setSelectedProject(null);
            } catch { showToast('לא ניתן להתנתק כרגע. נסו שוב.', 'error'); }
          }}>יציאה</button>
        </div>
      </header>
      <main className="page-content" id="main-content" tabIndex={-1}>
        {loading ? (
          <div style={{ textAlign: 'center', padding: '3rem' }}>
            <div className="loading-spinner"></div>
            <p style={{ marginTop: '1rem', color: 'var(--text-muted)' }}>טוען נתונים...</p>
          </div>
        ) : dataError ? (
          <div className="glass-card" role="alert" style={{ textAlign: 'center', padding: '2rem' }}>
            <p>{dataError}</p>
            <button onClick={() => setDataRetry(value => value + 1)}>נסו שוב</button>
          </div>
        ) : (
          <>
            {activeTab === 'home' && renderHome()}
            {activeTab === 'history' && renderHistory()}
            {activeTab === 'charts' && renderCharts()}
            {activeTab === 'projects' && renderProjects()}
            {activeTab === 'investments' && renderInvestments()}
            {activeTab === 'research' && <StockResearchPanel onEnableNotifications={handleSubscribePush} />}
            {activeTab === 'payslips' && renderPayslips()}
            {activeTab === 'audit' && renderAuditLogs()}
            {activeTab === 'portfolio' && (
              <PortfolioView
                key={activePortfolioId}
                investmentId={activePortfolioId}
                investmentName={activePortfolioName}
                onBack={() => {
                  fetchInvestments();
                  setActiveTab('investments');
                }}
                showToast={showToast}
              />
            )}
          </>
        )}
      </main>

      {/* Bottom Navigation */}
      <nav className="bottom-nav" aria-label="ניווט ראשי">
        <button
          className={`nav-item ${activeTab === 'home' ? 'active' : ''}`}
          aria-current={activeTab === 'home' ? 'page' : undefined}
          onClick={() => setActiveTab('home')}
        >
          <Home size={22} />
          <span>ראשי</span>
        </button>
        <button
          className={`nav-item ${activeTab === 'history' ? 'active' : ''}`}
          aria-current={activeTab === 'history' ? 'page' : undefined}
          onClick={() => setActiveTab('history')}
        >
          <History size={22} />
          <span>היסטוריה</span>
        </button>
        <button
          className={`nav-item ${activeTab === 'charts' ? 'active' : ''}`}
          aria-current={activeTab === 'charts' ? 'page' : undefined}
          onClick={() => setActiveTab('charts')}
        >
          <BarChart3 size={22} />
          <span>גרפים</span>
        </button>
        <button
          className={`nav-item ${activeTab === 'projects' ? 'active' : ''}`}
          aria-current={activeTab === 'projects' ? 'page' : undefined}
          onClick={() => setActiveTab('projects')}
        >
          <Briefcase size={22} />
          <span>פרויקטים</span>
        </button>
        <button
          className={`nav-item ${activeTab === 'investments' ? 'active' : ''}`}
          aria-current={(activeTab === 'investments' || activeTab === 'portfolio') ? 'page' : undefined}
          onClick={() => setActiveTab('investments')}
        >
          <Coins size={22} />
          <span>השקעות</span>
        </button>
        <button
          className={`nav-item ${activeTab === 'payslips' ? 'active' : ''}`}
          aria-current={activeTab === 'payslips' ? 'page' : undefined}
          onClick={() => setActiveTab('payslips')}
        >
          <FileText size={22} />
          <span>תלושים</span>
        </button>
        <button
          className={`nav-item ${activeTab === 'audit' ? 'active' : ''}`}
          aria-current={activeTab === 'audit' ? 'page' : undefined}
          onClick={() => setActiveTab('audit')}
        >
          <ClipboardList size={22} />
          <span>יומן</span>
        </button>
      </nav>

      {/* Salary Modal */}
      {isSalaryModalOpen && (
        <div className="modal-overlay" onClick={() => setIsSalaryModalOpen(false)}>
          <DialogFrame label="הוספת משכורת חדשה" onClose={() => setIsSalaryModalOpen(false)} className="modal-content fade-in" onClick={e => e.stopPropagation()}>
            <button type="button" className="close-btn" aria-label="סגירת חלון" onClick={() => setIsSalaryModalOpen(false)}>
              <X size={24} />
            </button>
            <h2 style={{ marginBottom: '1.5rem', color: 'var(--text-main)' }}>הוספת משכורת חדשה</h2>
            <form onSubmit={handleAddSalary}>
              <div className="form-group">
                <label htmlFor="account-field-1">מי קיבל משכורת?</label>
                <select id="account-field-1" value={personName} onChange={e => setPersonName(e.target.value)} required>
                  <option value="ליאור הבן">ליאור הבן</option>
                  <option value="ליאור הבת">ליאור הבת</option>
                </select>
              </div>
              <div className="form-group">
                <label htmlFor="account-field-2">סכום (₪)</label>
                <input id="account-field-2" type="number" step="0.01" value={salaryAmount} onChange={e => setSalaryAmount(e.target.value)} required placeholder="לדוגמה: 12500" />
              </div>
              <div className="form-group">
                <label htmlFor="account-field-3">חודש משכורת</label>
                <DatePicker id="account-field-3"
                  selected={month}
                  onChange={(date) => setMonth(date)}
                  dateFormat="MM/yyyy"
                  showMonthYearPicker
                  locale="he"
                  required
                  customInput={<CustomDateInput />}
                />
              </div>
              <div className="form-group">
                <label htmlFor="account-field-4">תלוש משכורת (אופציונלי)</label>
                <input id="account-field-4" type="file" accept="image/*,application/pdf" onChange={e => setPayslip(e.target.files[0])} />
              </div>
              <button type="submit" style={{ width: '100%' }}>שמור משכורת</button>
            </form>
          </DialogFrame>
        </div>
      )}

      {/* Transaction Modal */}
      {isTransactionModalOpen && (
        <div className="modal-overlay" onClick={() => setIsTransactionModalOpen(false)}>
          <DialogFrame label="תנועה בחשבון" onClose={() => setIsTransactionModalOpen(false)} className="modal-content fade-in" onClick={e => e.stopPropagation()}>
            <button type="button" className="close-btn" aria-label="סגירת חלון" onClick={() => setIsTransactionModalOpen(false)}>
              <X size={24} />
            </button>
            <h2 style={{ marginBottom: '1.5rem', color: 'var(--text-main)' }}>
              {editingTransaction ? 'עריכת תנועה' : 'הוספת הוצאה לחשבון'}
            </h2>
            <form onSubmit={handleAddTransaction}>
              <div className="form-group">
                <label htmlFor="account-field-5">קטגוריה</label>
                <select id="account-field-5" value={txCategory} onChange={e => setTxCategory(e.target.value)} required>
                  {CATEGORIES.map(cat => <option key={cat} value={cat}>{cat}</option>)}
                </select>
              </div>
              <div className="form-group">
                <label htmlFor="account-field-6">שיוך לפרויקט (אופציונלי)</label>
                <select id="account-field-6"
                  value={txProjectId}
                  onChange={async (e) => {
                    const val = e.target.value;
                    if (val === 'CREATE_NEW') {
                      const name = prompt('הזינו שם לפרויקט החדש (למשל: טיול באיטליה):');
                      if (name && name.trim()) {
                        try {
                          const res = await authenticatedFetch('/api/projects', {
                            method: 'POST',
                            headers: {
                              'Content-Type': 'application/json',
                              'x-performed-by': encodeURIComponent(currentUser)
                            },
                            body: JSON.stringify({ name: name.trim() })
                          });
                          if (res.ok) {
                            const newProj = await res.json();
                            setProjects([...projects, newProj].sort((a, b) => a.name.localeCompare(b.name)));
                            setTxProjectId(newProj.id.toString());
                          }
                        } catch (err) {
                          console.error("Error creating project:", err);
                        }
                      }
                    } else {
                      setTxProjectId(val);
                    }
                  }}
                >
                  <option value="">ללא פרויקט (בחרו במידה ורוצים לשייך)</option>
                  {projects.map(proj => (
                    <option key={proj.id} value={proj.id}>{proj.name}</option>
                  ))}
                  <option value="CREATE_NEW" style={{ fontWeight: 'bold', color: 'var(--accent)' }}>
                    ➕ יצירת פרויקט חדש...
                  </option>
                </select>
              </div>
              <div className="form-group">
                <label htmlFor="account-field-7">תיאור (אופציונלי)</label>
                <input id="account-field-7" type="text" value={txDescription} onChange={e => setTxDescription(e.target.value)} placeholder="לדוגמה: קניות בסופר" />
              </div>
              <div className="form-group">
                <label htmlFor="account-field-8">סכום (₪)</label>
                <input id="account-field-8" type="number" step="0.01" value={txAmount} onChange={e => setTxAmount(e.target.value)} required placeholder="לדוגמה: 250" />
              </div>
              <div className="form-group">
                <label htmlFor="account-field-9">תאריך</label>
                <DatePicker id="account-field-9"
                  selected={txDate}
                  onChange={(date) => setTxDate(date)}
                  dateFormat="dd/MM/yyyy"
                  locale="he"
                  required
                  customInput={<CustomDateInput />}
                />
              </div>
              <button type="submit" style={{ width: '100%' }}>
                {editingTransaction ? 'שמור שינויים' : 'שמור הוצאה'}
              </button>
            </form>
          </DialogFrame>
        </div>
      )}
      {/* Payslip Preview Modal */}
      {previewPayslipUrl && (
        <div className="modal-overlay" onClick={() => setPreviewPayslipUrl(null)}>
          <DialogFrame label="צפייה בתלוש משכורת" onClose={() => setPreviewPayslipUrl(null)} className="modal-content fade-in" onClick={e => e.stopPropagation()} style={{ maxWidth: '700px', width: '95%', padding: '1.25rem 1rem' }}>
            <button type="button" className="close-btn" aria-label="סגירת חלון" onClick={() => setPreviewPayslipUrl(null)}>
              <X size={24} />
            </button>
            <h2 style={{ marginBottom: '1rem', color: 'var(--text-main)', textAlign: 'center' }}>צפייה בתלוש משכורת</h2>

            <div style={{ background: '#f8fafc', borderRadius: '0.75rem', padding: '0.5rem', display: 'flex', justifyContent: 'center', alignItems: 'center', height: '48vh', minHeight: '220px', maxHeight: '480px', border: '1px solid var(--border-color)', overflow: 'hidden' }}>
              {previewPayslipUrl.toLowerCase().includes('.pdf') ? (
                <iframe
                  src={previewPayslipUrl}
                  style={{ border: 'none', borderRadius: '0.5rem', width: '100%', height: '100%' }}
                  title="תלוש משכורת PDF"
                />
              ) : (
                <img
                  src={previewPayslipUrl}
                  alt="תלוש משכורת"
                  style={{ width: '100%', height: '100%', borderRadius: '0.5rem', objectFit: 'contain' }}
                />
              )}
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.75rem', marginTop: '1.5rem' }}>
              <a
                href={previewPayslipUrl}
                download
                className="btn"
                style={{
                  fontFamily: 'Heebo',
                  background: 'var(--accent)',
                  color: 'white',
                  padding: '0.75rem 1.5rem',
                  borderRadius: '0.5rem',
                  fontSize: '1rem',
                  fontWeight: '600',
                  textDecoration: 'none',
                  display: 'inline-flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: '0.5rem',
                  textAlign: 'center'
                }}
              >
                הורד קובץ
              </a>
              <button
                type="button"
                onClick={() => setPreviewPayslipUrl(null)}
                style={{ width: '100%', background: '#64748b' }}
              >
                סגור
              </button>
            </div>
          </DialogFrame>
        </div>
      )}

      {/* Project Details Modal */}
{selectedProject && (() => {
        const projTxs = transactions.filter(t => t.project_id === selectedProject.id);
        const totalSpent = projTxs.filter(t => t.type === 'expense').reduce((sum, t) => sum + parseFloat(t.amount), 0);

        return (
          <div className="modal-overlay" onClick={() => setSelectedProject(null)}>
            <DialogFrame label="פרטי פרויקט" onClose={() => setSelectedProject(null)} className="modal-content fade-in" onClick={e => e.stopPropagation()} style={{ maxWidth: '650px', width: '95%', padding: '1.5rem 1.25rem' }}>
              <button type="button" className="close-btn" aria-label="סגירת חלון" onClick={() => setSelectedProject(null)}>
                <X size={24} />
              </button>

              <div style={{ borderBottom: '1px solid var(--border-color)', paddingBottom: '1rem', marginBottom: '1.25rem' }}>
                <h2 style={{ color: 'var(--text-main)', fontSize: '1.5rem', fontWeight: '800', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                  <Briefcase size={24} style={{ color: 'var(--accent)' }} />
                  {selectedProject.name}
                </h2>
                <p style={{ color: 'var(--text-muted)', fontSize: '0.85rem', marginTop: '0.25rem' }}>
                  נוצר בתאריך {new Date(selectedProject.created_at).toLocaleString('he-IL', { day: 'numeric', month: 'long', year: 'numeric' })}
                </p>
              </div>

              {/* Summary spent */}
              {(() => {
                const isZero = totalSpent === 0;
                return (
                  <div className="glass-card" style={{
                    background: isZero ? 'rgba(234, 179, 8, 0.05)' : 'rgba(239, 68, 68, 0.05)',
                    border: isZero ? '1px solid rgba(234, 179, 8, 0.2)' : '1px solid rgba(239, 68, 68, 0.1)',
                    padding: '1rem',
                    borderRadius: '0.75rem',
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                    marginBottom: '1.5rem'
                  }}>
                    <span style={{ fontSize: '1rem', color: 'var(--text-main)', fontWeight: '600' }}>סה"כ הוצאות בפרויקט:</span>
                    <span style={{ fontSize: '1.75rem', color: isZero ? '#d97706' : 'var(--expense)', fontWeight: '900' }} dir="ltr">
                      {isZero ? '' : '-'}₪{totalSpent.toLocaleString(undefined, { minimumFractionDigits: 0, maximumFractionDigits: 2 })}
                    </span>
                  </div>
                );
              })()}

              <h3 style={{ fontSize: '1.1rem', color: 'var(--text-main)', fontWeight: '700', marginBottom: '0.75rem' }}>רשימת הוצאות מקושרות</h3>

              {projTxs.length === 0 ? (
                <div style={{ textAlign: 'center', padding: '2rem 1rem', color: 'var(--text-muted)', background: 'rgba(0,0,0,0.02)', borderRadius: '0.75rem' }}>
                  <p>אין תנועות המשויכות לפרויקט זה עדיין.</p>
                </div>
              ) : (
                <div className="project-tx-list" style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem', maxHeight: '300px', overflowY: 'auto', paddingLeft: '4px' }}>
                  {projTxs.map((t) => (
                    <div
                      key={t.id}
                      className="tx-item-card"
                      style={{
                        display: 'flex',
                        justifyContent: 'space-between',
                        alignItems: 'center',
                        background: 'rgba(255, 255, 255, 0.03)',
                        border: '1px solid var(--border-color)',
                        padding: '0.85rem 1rem',
                        borderRadius: '0.5rem'
                      }}
                    >
                      <div style={{ display: 'flex', flexDirection: 'column', gap: '2px', textAlign: 'right' }}>
                        <span style={{ fontWeight: '600', color: 'var(--text-main)', fontSize: '0.95rem' }}>
                          {t.description || 'ללא תיאור'}
                        </span>
                        <span style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>
                          {new Date(t.date).toLocaleDateString('he-IL')} • {t.category}
                        </span>
                      </div>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                        <span style={{
                          fontWeight: '800',
                          color: t.type === 'income' ? 'var(--income)' : 'var(--expense)',
                          fontSize: '1.1rem'
                        }} dir="ltr">
                          {t.type === 'income' ? '+' : '-'} ₪{parseFloat(t.amount).toLocaleString(undefined, { minimumFractionDigits: 0, maximumFractionDigits: 2 })}
                        </span>

                        <div style={{ display: 'flex', gap: '0.35rem' }}>
                          <button
                            onClick={() => {
                              setSelectedProject(null);
                              startEditTransaction(t);
                            }}
                            style={{
                              background: 'transparent',
                              border: 'none',
                              color: 'var(--text-muted)',
                              cursor: 'pointer',
                              padding: '4px',
                              borderRadius: '4px'
                            }}
                            title="ערוך"
                          >
                            <Pencil size={15} />
                          </button>
                          <button
                            onClick={() => {
                              showConfirm("האם אתם בטוחים שברצונכם למחוק תנועה זו?", async () => {
                                try {
                                  const res = await authenticatedFetch(`/api/transactions?id=${t.id}`, {
                                    method: 'DELETE',
                                    headers: {
                                      'x-performed-by': encodeURIComponent(currentUser)
                                    }
                                  });
                                  if (res.ok) {
                                    setTransactions(transactions.filter(tx => tx.id !== t.id));
                                    showToast("התנועה נמחקה בהצלחה!");
                                  } else {
                                    showToast("שגיאה במחיקת התנועה", "error");
                                  }
                                } catch (err) {
                                  console.error(err);
                                  showToast("שגיאה במחיקת התנועה", "error");
                                }
                              });
                            }}
                            style={{
                              background: 'transparent',
                              border: 'none',
                              color: 'var(--expense)',
                              cursor: 'pointer',
                              padding: '4px',
                              borderRadius: '4px'
                            }}
                            title="מחק"
                          >
                            <Trash2 size={15} />
                          </button>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}

              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: '1.5rem' }}>
                <button
                  type="button"
                  onClick={() => handleDeleteProject(selectedProject.id)}
                  style={{ background: 'var(--expense)', cursor: 'pointer', fontFamily: 'Heebo', padding: '0.5rem 1rem', fontSize: '0.9rem', borderRadius: '8px', border: 'none', color: '#fff', display: 'flex', alignItems: 'center', gap: '4px' }}
                >
                  <Trash2 size={16} />
                  מחק פרויקט
                </button>
                <button
                  type="button"
                  onClick={() => setSelectedProject(null)}
                  style={{ background: '#64748b', width: '100px', cursor: 'pointer', fontFamily: 'Heebo', padding: '0.5rem 1rem', fontSize: '0.9rem', borderRadius: '8px', border: 'none', color: '#fff' }}
                >
                  סגור
                </button>
              </div>
            </DialogFrame>
          </div>
        );
      })()}

      {/* Investment Modal */}
      {isInvestmentModalOpen && (
        <div className="modal-overlay" onClick={() => setIsInvestmentModalOpen(false)}>
          <DialogFrame label="פרטי השקעה" onClose={() => setIsInvestmentModalOpen(false)} className="modal-content fade-in" onClick={e => e.stopPropagation()}>
            <button type="button" className="close-btn" aria-label="סגירת חלון" onClick={() => setIsInvestmentModalOpen(false)}>
              <X size={24} />
            </button>
            <h2 style={{ marginBottom: '1.5rem', color: 'var(--text-main)' }}>
              {editingInvestment ? 'עריכת השקעה' : 'הוספת השקעה חדשה'}
            </h2>
            <form onSubmit={handleSaveInvestment}>
              <div className="form-group">
                <label htmlFor="account-field-10">שיוך השקעה</label>
                <select id="account-field-10"
                  value={invOwnerName}
                  onChange={e => setInvOwnerName(e.target.value)}
                  required
                >
                  <option value="ליאור הבן">ליאור הבן</option>
                  <option value="ליאור הבת">ליאור הבת</option>
                  <option value="השקעה משותפת">השקעה משותפת</option>
                </select>
              </div>
              <div className="form-group">
                <label htmlFor="account-field-11">שם ההשקעה</label>
                <input id="account-field-11"
                  type="text"
                  value={invName}
                  onChange={e => setInvName(e.target.value)}
                  required
                  placeholder="לדוגמה: קרן השתלמות, קופת גמל"
                />
              </div>
              <div className="form-group">
                <label htmlFor="account-field-12">סוג ההשקעה</label>
                <select id="account-field-12"
                  value={invType}
                  onChange={e => setInvType(e.target.value)}
                  required
                >
                  <option value="חשבון מסחר">חשבון מסחר</option>
                  <option value="פיקדון">פיקדון</option>
                  <option value="קופת גמל">קופת גמל</option>
                  <option value="קרן השתלמות">קרן השתלמות</option>
                  <option value="אחר">אחר</option>
                </select>
              </div>
              <div className="form-group">
                <label htmlFor="account-field-13">ערך השקעה ראשוני (₪) *</label>
                <input id="account-field-13"
                  type="number"
                  step="0.01"
                  value={invInitialValue}
                  onChange={e => setInvInitialValue(e.target.value)}
                  required
                  placeholder="הזינו את סכום ההשקעה הראשוני"
                />
              </div>
              <div className="form-group">
                <label htmlFor="account-field-14">ערך נוכחי (₪) *</label>
                <input id="account-field-14"
                  type="number"
                  step="0.01"
                  value={invCurrentValue}
                  onChange={e => setInvCurrentValue(e.target.value)}
                  required
                  placeholder="הזינו את השווי הנוכחי בשקלים"
                />
              </div>
              <div className="form-group">
                <label htmlFor="account-field-15">הפקדה חודשית קבועה (₪ - אופציונלי)</label>
                <input id="account-field-15"
                  type="number"
                  step="0.01"
                  value={invMonthlyAddition}
                  onChange={e => setInvMonthlyAddition(e.target.value)}
                  placeholder="לדוגמה: 500"
                />
              </div>

              {invType === 'פיקדון' && (
                <div style={{ background: 'rgba(255,255,255,0.02)', padding: '1rem', borderRadius: '8px', border: '1px solid rgba(255,255,255,0.05)', marginBottom: '1rem' }}>
                  <h4 style={{ margin: '0 0 0.5rem 0', color: 'var(--text-main)', fontSize: '0.9rem' }}>הגדרות ריבית</h4>
                  <div className="form-group" style={{ marginBottom: '0.5rem' }}>
                    <label htmlFor="account-field-16">סוג ריבית</label>
                    <select id="account-field-16"
                      value={invInterestType}
                      onChange={e => setInvInterestType(e.target.value)}
                    >
                      <option value="prime">צמוד לפריים (ריבית בנק ישראל + 1.5%)</option>
                      <option value="fixed">ריבית קבועה</option>
                    </select>
                  </div>
                  <div className="form-group" style={{ marginBottom: 0 }}>
                    <label htmlFor="account-field-17">
                      {invInterestType === 'prime' ? 'מרווח מהפריים (% - ניתן להזין מינוס)' : 'אחוז הריבית השנתית (%)'}
                    </label>
                    <input id="account-field-17"
                      type="number"
                      step="0.01"
                      value={invInterestValue}
                      onChange={e => setInvInterestValue(e.target.value)}
                      required
                      dir="ltr"
                      placeholder={invInterestType === 'prime' ? '-1.5' : '4.0'}
                    />
                  </div>
                </div>
              )}
              <button type="submit" style={{ width: '100%', marginTop: '1rem' }}>שמור השקעה</button>
            </form>
          </DialogFrame>
        </div>
      )}

      {/* Toast notifications */}
      {toasts.length > 0 && (
        <div className="toasts-container" role="status" aria-live="polite" aria-atomic="false">
          {toasts.map(t => (
            <div key={t.id} className={`toast-card ${t.type} fade-in`}>
              {t.message}
            </div>
          ))}
        </div>
      )}

      {/* Custom Confirm Modal */}
      {confirmConfig.isOpen && (
        <div className="custom-dialog-overlay" onClick={confirmConfig.onCancel}>
          <DialogFrame label="אישור פעולה" onClose={confirmConfig.onCancel} className="custom-dialog-card" onClick={e => e.stopPropagation()}>
            <h3>אישור פעולה</h3>
            <p>{confirmConfig.message}</p>
            <div className="custom-dialog-buttons">
              <button
                type="button"
                className="btn-cancel"
                onClick={confirmConfig.onCancel}
              >
                ביטול
              </button>
              <button
                type="button"
                style={{ background: 'var(--expense)' }}
                onClick={confirmConfig.onConfirm}
              >
                אישור
              </button>
            </div>
          </DialogFrame>
        </div>
      )}

      {/* Custom Prompt Modal */}
      {promptConfig.isOpen && (
        <div className="custom-dialog-overlay" onClick={promptConfig.onCancel}>
          <DialogFrame label="הזנת פרטים" onClose={promptConfig.onCancel} className="custom-dialog-card" onClick={e => e.stopPropagation()}>
            <h3>{promptConfig.title}</h3>
            <div className="form-group" style={{ marginTop: '1rem', marginBottom: '1.5rem' }}>
              <input
                type="text"
                aria-label={promptConfig.title}
                placeholder={promptConfig.placeholder}
                value={promptConfig.value}
                onChange={e => setPromptConfig(prev => ({ ...prev, value: e.target.value }))}
                style={{ width: '100%', padding: '0.75rem', borderRadius: '0.5rem', border: '1px solid var(--border-color)', outline: 'none' }}
              />
            </div>
            <div className="custom-dialog-buttons">
              <button
                type="button"
                className="btn-cancel"
                onClick={promptConfig.onCancel}
              >
                ביטול
              </button>
              <button
                type="button"
                onClick={() => promptConfig.onConfirm(promptConfig.value)}
              >
                אישור
              </button>
            </div>
          </DialogFrame>
        </div>
      )}
    </div>
  );
}
